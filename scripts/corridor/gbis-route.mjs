// [bus-net] GBIS 정류소 순서 → OSM 차도 그래프 위 버스 경로 (scripts/corridor/build-transit.mjs 에서 사용)
//   - 차도: OSM highway (motorway~unclassified, *_link, busway). oneway 반영, 지하차도/터널은 3배 비용(정류장 있는 지상 차로 우선)
//   - 정류소는 가까운 '진행 방향 차로' 선분에 붙인다(양방향 도로는 진행 방향 오른쪽에 있는 쪽, 중앙분리 도로는 그 방향 차도)
//   - 정류소 사이는 선분(방향 있는 간선) 단위 Dijkstra + 회전 비용(유턴 금지 수준)으로 잇는다.
const COST = { motorway: 1, trunk: 1, primary: 1, secondary: 1.05, tertiary: 1.2, motorway_link: 1.1, trunk_link: 1.1, primary_link: 1.1, secondary_link: 1.15, tertiary_link: 1.25, unclassified: 1.6, residential: 1.8, busway: 1 };
const CELL = 60;

export function buildRoadGraph(els, proj, keep) {
  const pos = new Map(), segs = []; // seg: {a,b,ax,az,bx,bz,len,cost,k,way}
  for (const e of els) {
    if (e.type !== 'way' || !e.geometry || !e.tags) continue;
    const t = e.tags, k = t.highway;
    if (!(k in COST) || t.area === 'yes' || t.access === 'private' || t.access === 'no' || t.construction) continue;
    const P = e.geometry.map(proj);
    if (!P.some(keep)) continue;
    const under = (t.tunnel && t.tunnel !== 'no') || parseFloat(t.layer) < 0;
    const ow = t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' || (k === 'motorway' && t.oneway !== 'no') ? 1 : t.oneway === '-1' ? -1 : 0;
    const f = COST[k] * (under ? 3 : 1);
    e.nodes.forEach((id, i) => pos.set(id, P[i]));
    for (let i = 1; i < e.nodes.length; i++) {
      const a = e.nodes[i - 1], b = e.nodes[i], [ax, az] = P[i - 1], [bx, bz] = P[i], len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      if (ow !== -1) segs.push({ a, b, ax, az, bx, bz, len, cost: len * f, k, way: e.id, two: ow === 0 });
      if (ow !== 1) segs.push({ a: b, b: a, ax: bx, az: bz, bx: ax, bz: az, len, cost: len * f, k, way: e.id, two: ow === 0 });
    }
  }
  const out = new Map(), grid = new Map();
  segs.forEach((s, i) => {
    s.i = i; s.dx = (s.bx - s.ax) / s.len; s.dz = (s.bz - s.az) / s.len;
    (out.get(s.a) || out.set(s.a, []).get(s.a)).push(i);
    const x0 = Math.floor(Math.min(s.ax, s.bx) / CELL), x1 = Math.floor(Math.max(s.ax, s.bx) / CELL), z0 = Math.floor(Math.min(s.az, s.bz) / CELL), z1 = Math.floor(Math.max(s.az, s.bz) / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const key = x + ',' + z; (grid.get(key) || grid.set(key, []).get(key)).push(i); }
  });
  return { segs, out, grid, pos };
}

// 정류소(x,z) → 진행 방향 선분 후보(가까운 순, 점수 포함)
export function snapCandidates(G, x, z, R = 45) {
  const seen = new Set(), res = [];
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const si of G.grid.get(`${cx + i},${cz + j}`) || []) {
    if (seen.has(si)) continue; seen.add(si);
    const s = G.segs[si], t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.len));
    const px = s.ax + (s.bx - s.ax) * t, pz = s.az + (s.bz - s.az) * t, d = Math.hypot(x - px, z - pz);
    if (d > R) continue;
    const side = -s.dz * (x - px) + s.dx * (z - pz); // > 0 이면 진행 방향 오른쪽
    let score = d + (side < -1 ? (s.two ? 18 : 6) : 0) + (s.k === 'residential' || s.k === 'unclassified' ? 12 : 0) + (s.k.endsWith('_link') ? 4 : 0);
    res.push({ si, t, d, score, x: px, z: pz });
  }
  return res.sort((a, b) => a.score - b.score).slice(0, 8);
}

// 선분 간 Dijkstra (상태 = 방향 있는 선분). from: {si,t} → to: {si,t}
function heapPush(h, it) { h.push(it); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function heapPop(h) { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; }
export function routeSegs(G, from, to, maxCost = 20000) {
  const S = G.segs;
  if (from.si === to.si && to.t >= from.t) return { cost: (to.t - from.t) * S[from.si].len, chain: [from.si] };
  const dist = new Map(), prev = new Map(), h = [];
  const c0 = (1 - from.t) * S[from.si].cost;
  dist.set(from.si, c0); heapPush(h, [c0, from.si]);
  while (h.length) {
    const [c, si] = heapPop(h);
    if (c > (dist.get(si) ?? Infinity)) continue;
    if (c > maxCost) break;
    if (si === to.si && si !== from.si) {
      const chain = [si]; let k = si; while (prev.has(k)) { k = prev.get(k); chain.push(k); }
      return { cost: c - S[si].cost * (1 - to.t), chain: chain.reverse() };
    }
    const s = S[si];
    for (const ni of G.out.get(s.b) || []) {
      const n = S[ni]; if (n.b === s.a && n.way === s.way) continue; // 같은 길에서 되돌아가기 금지
      const dot = s.dx * n.dx + s.dz * n.dz;
      const turn = dot < -0.6 ? 400 : dot < 0.2 ? 15 : 0; // 유턴 사실상 금지, 직각 회전 약간
      const nc = c + n.cost + turn;
      if (nc < (dist.get(ni) ?? Infinity)) { dist.set(ni, nc); prev.set(ni, si); heapPush(h, [nc, ni]); }
    }
  }
  return null;
}
export function chainPts(G, from, to, chain) {
  const S = G.segs, pts = [];
  const add = (x, z) => { const l = pts[pts.length - 1]; if (!l || Math.hypot(l[0] - x, l[1] - z) > 0.3) pts.push([x, z]); };
  add(from.x, from.z);
  for (let k = 0; k < chain.length - 1; k++) add(S[chain[k]].bx, S[chain[k]].bz);
  add(to.x, to.z);
  return pts;
}
