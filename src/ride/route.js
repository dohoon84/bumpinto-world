// [ride] 택시 경로: 코리더 차도 그래프(drive.json, 일방통행 반영)에서 A*.
//   nodes: [{ x, z, out: [{ to, way }] }], ways: [{ k, w, ow, lanes }]
const COST = { motorway: 0.8, trunk: 0.85, primary: 0.9, secondary: 0.95, tertiary: 1, residential: 1.25, unclassified: 1.2, service: 2.5, living_street: 2 };

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n, f) { const a = this.a; a.push([f, n]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top[1];
  }
}

// from(node index) → to(node index). allow(nodeIndex) 로 지날 수 있는 노드 제한(정자 라이브 영역 제외 등).
// 반환: 간선 목록 [{ from, to, way }] 또는 null
export function astar(nodes, ways, from, to, { allow = null, maxIter = 120000 } = {}) {
  if (from === to) return [];
  const T = nodes[to];
  const g = new Map([[from, 0]]), prev = new Map(), closed = new Set();
  const h = (i) => Math.hypot(nodes[i].x - T.x, nodes[i].z - T.z) * 0.8;
  const open = new Heap(); open.push(from, h(from));
  let it = 0;
  while (open.size && it++ < maxIter) {
    const u = open.pop();
    if (u === to) break;
    if (closed.has(u)) continue; closed.add(u);
    const nu = nodes[u], gu = g.get(u);
    for (const e of nu.out) {
      if (closed.has(e.to)) continue;
      if (allow && e.to !== to && !allow(e.to)) continue;
      const w = ways[e.way], nv = nodes[e.to];
      const c = gu + Math.hypot(nv.x - nu.x, nv.z - nu.z) * (COST[w.k] || 1.3);
      if (c < (g.get(e.to) ?? Infinity)) { g.set(e.to, c); prev.set(e.to, { from: u, to: e.to, way: e.way }); open.push(e.to, c + h(e.to)); }
    }
  }
  if (!prev.has(to)) return null;
  const out = []; let v = to;
  while (v !== from) { const e = prev.get(v); out.push(e); v = e.from; }
  return out.reverse();
}

export function routeLength(nodes, edges) { let L = 0; for (const e of edges) L += Math.hypot(nodes[e.to].x - nodes[e.from].x, nodes[e.to].z - nodes[e.from].z); return L; }

// 점(x,z)에 가장 가까운 '도로 간선'. 오른쪽(갓길)에 점이 있는 방향을 선호. 고속도로/간선급은 정차 불가라 제외.
//   cells: CorridorCars.cells (격자 → 간선) , CELL: 격자 크기
export function nearestCurbEdge(cars, x, z, { R = 60, allow = null } = {}) {
  const CELL = 250, c0 = Math.floor((x - R) / CELL), c1 = Math.floor((x + R) / CELL), r0 = Math.floor((z - R) / CELL), r1 = Math.floor((z + R) / CELL);
  let best = null, bd = Infinity;
  const seen = new Set();
  const consider = (from, e) => {
    const k = from + '>' + e.to; if (seen.has(k)) return; seen.add(k);
    const w = cars.ways[e.way]; if (!w || /motorway|trunk|_link/.test(w.k)) return;
    if (allow && (!allow(from) || !allow(e.to))) return;
    const a = cars.nodes[from], b = cars.nodes[e.to];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz); if (L < 6) return;
    const ux = dx / L, uz = dz / L, px = x - a.x, pz = z - a.z;
    const u = Math.max(3, Math.min(L - 3, px * ux + pz * uz));
    const qx = a.x + ux * u, qz = a.z + uz * u, d = Math.hypot(x - qx, z - qz);
    const right = (px * -uz + pz * ux) > 0; // 진행방향 오른쪽 = 갓길
    const score = d + (right ? 0 : (w.ow ? 6 : 18));
    if (score < bd) { bd = score; best = { from, to: e.to, way: e.way, u, L, d, right, x: qx, z: qz }; }
  };
  for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) for (const e of (cars.curbCells || cars.cells).get(i + ',' + j) || []) consider(e.from, e); // [ride] curbCells: 정자 덧붙인 길 포함
  // cells 에는 정자 라이브 영역 간선이 없을 수 있다 → 근처에서 못 찾으면 노드 전수(가까운 것만)
  if (!best) for (let n = 0; n < cars.nodes.length; n++) { const a = cars.nodes[n]; if (Math.abs(a.x - x) > R * 2 || Math.abs(a.z - z) > R * 2) continue; for (const e of a.out) consider(n, e); }
  return best;
}

// [ride] '세워주세요': 지금 달리는 경로(t.cum/t.segs/t.sigQ)에서 안전하게 설 수 있는 첫 길가 지점.
//   - 지금 속도로 편하게 멈출 수 있는 거리(v²/2·dec + margin) 이후
//   - 고속도로·간선 램프(motorway/trunk/*_link) 제외, 다른 길로 바뀌는 지점(교차로) ±junction m 제외
//   - 신호 횡단보도(sigQ) ±cross m, nearCrossing(s) 가 true 인 곳(일반 횡단보도 등) 제외
//   - 목적지 정차 지점(endS) 보다 가까워야 함. 없으면 null(곧 목적지)
// 반환: { s, seg(인덱스), way } — curb(길가 옆 거리)는 호출 쪽이 차선 오프셋으로 계산
export function findStopAhead(t, ways, { dec = 3, margin = 14, minAhead = 22, junction = 16, cross = 18, step = 6, endS = null, nearCrossing = null } = {}) {
  const end = endS ?? t.cum[t.cum.length - 1];
  const segs = t.segs || [];
  const joints = [];
  for (let i = 0; i + 1 < segs.length; i++) if (segs[i + 1].way !== segs[i].way) joints.push(segs[i].sEnd);
  for (let s = t.s + Math.max(minAhead, (t.v * t.v) / (2 * dec) + margin); s < end - 8; s += step) {
    const gi = segs.findIndex((g) => g.sEnd >= s); if (gi < 0) return null;
    const g = segs[gi], w = ways[g.way];
    if (!w || /^(motorway|trunk)|_link$/.test(w.k)) continue;
    if (joints.some((j) => Math.abs(j - s) < junction)) continue;
    if ((t.sigQ || []).some((q) => Math.abs(q.s - s) < cross)) continue;
    if (nearCrossing && nearCrossing(s)) continue;
    return { s, seg: gi, way: g.way };
  }
  return null;
}
