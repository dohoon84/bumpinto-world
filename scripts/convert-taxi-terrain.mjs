// [taxi][terrain] OSM 원본 -> public/drive.json (택시용 차도 그래프) + public/terrain.json (탄천 고도/계단)
// 기존 convert.mjs 와 같은 좌표계: 정자역 기준 미터, x = 동쪽(+), z = 남쪽(+)
// 실행: npm run convert-taxi-terrain   (npm run convert 이후)
import fs from 'node:fs';

const CENTER = { lat: 37.36650, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const proj = (g) => [(g.lon - CENTER.lon) * kx, -(g.lat - CENTER.lat) * kz];
const raw = JSON.parse(fs.readFileSync('data/osm_raw_osmapi.json', 'utf8'));
const J = JSON.parse(fs.readFileSync('public/jeongja.json', 'utf8'));
const { x0, x1, z0, z1 } = J.meta.bboxLocal;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const ROAD_W = { motorway: 16, trunk: 16, primary: 16, secondary: 12, tertiary: 9, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6, residential: 6, unclassified: 6, living_street: 5, service: 4, pedestrian: 5, footway: 2.2, cycleway: 2.2, path: 2, steps: 2, track: 3, corridor: 2 };
const widthOf = (t) => { let w = ROAD_W[t.highway] ?? 4; const l = num(t.lanes); if (l && w >= 6) w = Math.max(w, l * 3.2); return w; };
const ways = raw.elements.filter((e) => e.type === 'way' && e.geometry && e.tags);
const skipHw = (t) => (t.tunnel && t.tunnel !== 'no') || num(t.layer) < 0 || ['construction', 'proposed', 'platform', 'bus_stop', 'elevator'].includes(t.highway);

// ======================= 1) 택시용 차도 그래프 =======================
const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service']);
const nodeIdx = new Map(), nodes = [], dways = [];
for (const e of ways) {
  const t = e.tags;
  if (!CAR.has(t.highway) || skipHw(t) || t.area === 'yes') continue;
  if (t.highway === 'service' && ['parking_aisle', 'driveway', 'drive-through', 'emergency_access'].includes(t.service)) continue;
  if (t.access === 'private' || t.access === 'no') continue;
  const n = e.nodes.map((id, i) => {
    if (!nodeIdx.has(id)) { nodeIdx.set(id, nodes.length); nodes.push(proj(e.geometry[i]).map(r1)); }
    return nodeIdx.get(id);
  });
  const ow = t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' || ['motorway', 'motorway_link'].includes(t.highway) && t.oneway !== 'no' ? 1 : t.oneway === '-1' ? -1 : 0;
  const w = { id: e.id, k: t.highway, n, w: r1(widthOf(t)), ow };
  if (t.name) w.name = t.name;
  if (t.bridge && t.bridge !== 'no') w.br = 1;
  if (num(t.lanes)) w.lanes = num(t.lanes);
  if (num(t.maxspeed)) w.vmax = num(t.maxspeed);
  dways.push(w);
}
const exits = raw.elements.filter((e) => e.type === 'node' && e.tags?.railway === 'subway_entrance').map((e) => { const [x, z] = proj(e); return { ref: e.tags.ref || '', x: r1(x), z: r1(z), id: e.id }; })
  .filter((e) => Math.hypot(e.x - J.station.x, e.z - J.station.z) < 250).sort((a, b) => a.ref.localeCompare(b.ref));
fs.writeFileSync('public/drive.json', JSON.stringify({ meta: { source: 'data/osm_raw_osmapi.json', attribution: '© OpenStreetMap contributors (ODbL)', note: '택시 시뮬레이션용 차도 그래프. oneway 반영. 택시 위치/수요는 실제 데이터 아님', generated: new Date().toISOString() }, nodes, ways: dways, exits }));
console.log('drive.json', nodes.length, 'nodes', dways.length, 'ways', exits.length, 'exits', (fs.statSync('public/drive.json').size / 1024).toFixed(0) + 'KB');

// ======================= 2) 탄천 지형 =======================
// 높이 기준(근사값): 도로/제방 위 = 0, 둔치(산책로·자전거길) = FLOOR, 수면 = WATER, 하상 = BED
const P = { FLOOR: -6.0, WATER: -6.6, BED: -7.6, MARGIN: 30, MIN_RUN: 4, MAX_RUN: 16, DEF_TOE: 40, DEF_TOP: 54, DEF_W: 16, STEP: 2, RISER_TARGET: 0.16 };
// 축(axis): 탄천 waterway 중심선을 매끈하게 다듬은 기준선 (실제 물길이 아니라 단면 좌표계용)
const river = J.waterLines.find((l) => l.n === '탄천').p;
const near = river.map(([x, z]) => Math.hypot(x, z) < 2800);
let a0 = near.indexOf(true), a1 = near.lastIndexOf(true);
let line = river.slice(Math.max(0, a0 - 1), a1 + 2);
function resample(pts, step) {
  const out = [pts[0]]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
    let s = step - carry;
    while (s <= L) { out.push([ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L]); s += step; }
    carry = L - (s - step);
  }
  return out;
}
let ax = resample(line, P.STEP);
for (let pass = 0; pass < 3; pass++) { // 이동평균 ±50m
  const K = 25, sm = ax.map((_, i) => { let x = 0, z = 0, n = 0; for (let j = Math.max(0, i - K); j <= Math.min(ax.length - 1, i + K); j++) { x += ax[j][0]; z += ax[j][1]; n++; } return [x / n, z / n]; });
  ax = sm;
}
ax = resample(ax, P.STEP); // 균일 간격 재샘플
const N = ax.length;
const dirAt = (i) => { const a = ax[Math.max(0, i - 1)], b = ax[Math.min(N - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
// 축 투영 (격자 가속)
const CELL = 25, grid = new Map(), R = 160;
for (let i = 0; i < N - 1; i++) {
  const [axx, azz] = ax[i];
  for (let gx = Math.floor((axx - R) / CELL); gx <= Math.floor((axx + R) / CELL); gx++) for (let gz = Math.floor((azz - R) / CELL); gz <= Math.floor((azz + R) / CELL); gz++) {
    const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
  }
}
function project(x, z) { // -> {i, t, d} 또는 null. d>0 = 축 진행방향의 오른쪽
  const list = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!list) return null;
  let best = null;
  for (const i of list) {
    const [ax0, az0] = ax[i], [bx, bz] = ax[i + 1], dx = bx - ax0, dz = bz - az0, L2 = dx * dx + dz * dz;
    const t = ((x - ax0) * dx + (z - az0) * dz) / L2;
    const tc = Math.max(0, Math.min(1, t)), px = ax0 + dx * tc, pz = az0 + dz * tc, dist = Math.hypot(x - px, z - pz);
    if (!best || dist < best.dist) { const L = Math.sqrt(L2); best = { i, t: tc, dist, d: (dx * (z - az0) - dz * (x - ax0)) / L * -1 }; }
  }
  return best;
}
// 특징점 수집
const LOWER_SEED = new Set([437912683, 437912695, 604645200, 491866226]); // 탄천 양안 둔치 산책로 / 탄천 자전거도로 (OSM way id)
const densify = (pts, step = 1) => { const o = []; for (let i = 1; i < pts.length; i++) { const [ax0, az0] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax0, bz - az0), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) o.push([ax0 + ((bx - ax0) * k) / n, az0 + ((bz - az0) * k) / n]); } o.push(pts[pts.length - 1]); return o; };
const inBox = ([x, z]) => x >= x0 - 5 && x <= x1 + 5 && z >= z0 - 5 && z <= z1 + 5;
const bucket = () => Array.from({ length: N }, () => ({ L: [], R: [] }));
const lowerB = bucket(), streetB = bucket(), waterB = bucket();
function addPts(B, pts, hw) { for (const p of pts) { if (!inBox(p)) continue; const q = project(p[0], p[1]); if (!q || q.dist > 150) continue; (q.d < 0 ? B[q.i].L : B[q.i].R).push(Math.abs(q.d) + (B === streetB ? -hw : hw)); } }
const isPathKind = (k) => ['footway', 'cycleway', 'path', 'pedestrian', 'track'].includes(k);
const hwWays = ways.filter((e) => e.tags.highway && !skipHw(e.tags));
// 1차: 시드 경로로 둔치 폭 추정 -> 그 안쪽에 완전히 들어오는 보행로도 둔치로 분류
const seedMax = { L: new Array(N).fill(0), R: new Array(N).fill(0) };
for (const e of hwWays) if (LOWER_SEED.has(e.id)) for (const p of densify(e.geometry.map(proj), 2)) { const q = project(...p); if (q) { const s = q.d < 0 ? 'L' : 'R'; for (let j = Math.max(0, q.i - 15); j < Math.min(N, q.i + 15); j++) seedMax[s][j] = Math.max(seedMax[s][j], Math.abs(q.d)); } }
const lowerIds = new Set(LOWER_SEED);
for (const e of hwWays) {
  const t = e.tags; if (lowerIds.has(e.id) || !isPathKind(t.highway) || (t.bridge && t.bridge !== 'no')) continue;
  const ok = e.geometry.map(proj).every((p) => { const q = project(...p); return q && Math.abs(q.d) < seedMax[q.d < 0 ? 'L' : 'R'][q.i] - 0.5; });
  if (ok) lowerIds.add(e.id);
}
// 둔치와 도로를 잇는 경사로(일부 노드만 둔치 안): 제방 폭 추정에서 제외 -> 런타임에서 지형을 따라 경사로가 됨
const rampIds = new Set();
for (const e of hwWays) {
  const t = e.tags; if (lowerIds.has(e.id) || !isPathKind(t.highway) || (t.bridge && t.bridge !== 'no')) continue;
  const ins = e.geometry.map(proj).map((p) => { const q = project(...p); return !!q && Math.abs(q.d) < seedMax[q.d < 0 ? 'L' : 'R'][q.i] + 1; });
  if (ins.some(Boolean) && !ins.every(Boolean)) rampIds.add(e.id);
}
for (const e of hwWays) {
  const t = e.tags; if (t.highway === 'steps' || (t.bridge && t.bridge !== 'no')) continue;
  const pts = densify(e.geometry.map(proj), 1), hw = widthOf(t) / 2;
  if (lowerIds.has(e.id)) addPts(lowerB, pts, hw + 0.8); else if (!rampIds.has(e.id)) addPts(streetB, pts, hw + 0.3);
}
for (const e of ways) if (e.tags.building) addPts(streetB, densify(e.geometry.map(proj), 1), 0.5);
for (const w of J.water) if (w.o.length > 20) addPts(waterB, densify(w.o, 1), 0); // 탄천 수면 폴리곤만 (작은 연못 제외)
// 버킷 -> 단면 폭
const prof = { toeL: [], topL: [], toeR: [], topR: [], wL: [], wR: [] };
const WIN = 4;
for (const s of ['L', 'R']) {
  const toe = [], top = [], w = [];
  for (let i = 0; i < N; i++) {
    let mt = -Infinity, mw = -Infinity;
    for (let j = Math.max(0, i - WIN); j <= Math.min(N - 1, i + WIN); j++) { for (const v of lowerB[j][s]) mt = Math.max(mt, v); for (const v of waterB[j][s]) mw = Math.max(mw, v); }
    if (mw > -Infinity) mt = Math.max(mt, mw + 3);
    toe.push(mt > -Infinity && mt < 120 ? mt : NaN); w.push(mw > -Infinity ? mw : NaN);
  }
  for (let i = 0; i < N; i++) {
    let mn = Infinity; const tt = Number.isFinite(toe[i]) ? toe[i] : null;
    if (tt != null) for (let j = Math.max(0, i - WIN); j <= Math.min(N - 1, i + WIN); j++) for (const v of streetB[j][s]) if (v > tt - 1 && v < tt + 40) mn = Math.min(mn, v);
    top.push(tt == null ? NaN : Number.isFinite(mn) ? mn : tt + P.MAX_RUN);
  }
  // 빈 구간 채우기: 안쪽은 선형보간, 바깥(bbox 밖)은 기본값으로 150m 동안 블렌드
  const fill = (arr, def) => {
    const known = arr.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
    if (!known.length) return arr.map(() => def);
    return arr.map((v, i) => {
      if (Number.isFinite(v)) return v;
      const prev = known.filter((k) => k < i).pop(), next = known.find((k) => k > i);
      if (prev != null && next != null && next - prev < 60) return arr[prev] + ((arr[next] - arr[prev]) * (i - prev)) / (next - prev);
      const k = prev != null && (next == null || i - prev < next - i) ? prev : next, f = Math.min(1, (Math.abs(i - k) * P.STEP) / 150);
      return arr[k] * (1 - f) + def * f;
    });
  };
  let T = fill(toe, P.DEF_TOE), U = fill(top, P.DEF_TOP), W = fill(w, P.DEF_W);
  const runFilt = (a, fn, K) => a.map((_, i) => fn(...a.slice(Math.max(0, i - K), i + K + 1)));
  const avg = (a, K) => a.map((_, i) => { const sl = a.slice(Math.max(0, i - K), i + K + 1); return sl.reduce((x, y) => x + y, 0) / sl.length; });
  T = avg(runFilt(T, Math.max, 3), 3); U = avg(runFilt(U, Math.min, 3), 3); W = avg(runFilt(W, Math.max, 3), 3);
  for (let i = 0; i < N; i++) {
    T[i] = Math.max(T[i], W[i] + 3);
    U[i] = Math.min(Math.max(U[i], T[i] + P.MIN_RUN), T[i] + P.MAX_RUN);
  }
  prof['toe' + s] = T.map(r1); prof['top' + s] = U.map(r1); prof['w' + s] = W.map(r1);
}

// 높이 프로파일 (런타임 src/world/terrain.js 와 동일한 식)
function hProfile(ad, toe, top, w) {
  if (ad >= top) return 0;
  if (ad >= toe) return P.FLOOR * (top - ad) / (top - toe);
  if (ad >= w + 1.2) return P.FLOOR;
  if (ad >= w - 1) return P.BED + ((P.FLOOR - P.BED) * (ad - (w - 1))) / 2.2;
  return P.BED;
}
function baseH(x, z) {
  const q = project(x, z); if (!q) return 0;
  const s = q.d < 0 ? 'L' : 'R', i = q.i, t = q.t, lerp = (k) => prof[k + s][i] * (1 - t) + prof[k + s][Math.min(N - 1, i + 1)] * t;
  return hProfile(Math.abs(q.d), lerp('toe'), lerp('top'), lerp('w'));
}

// 계단: 실제 OSM highway=steps (탄천 제방) + 정자역 근처 근사 위치
function stairFrom(A, B, meta) { // A = 위(도로), B = 아래(둔치). 제방 경사 구간만 계단 비행(flight)으로
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
  let tTop = null, tBot = null;
  for (let s = 0; s <= L + 6; s += 0.05) { const h = baseH(A[0] + ux * s, A[1] + uz * s); if (tTop == null && h < -0.05) tTop = Math.max(0, s - 0.05); if (tTop != null && h <= P.FLOOR + 0.05) { tBot = s; break; } }
  if (tTop == null || tBot == null || tBot - tTop < 2) return null;
  const T = [A[0] + ux * tTop, A[1] + uz * tTop], Bb = [A[0] + ux * tBot, A[1] + uz * tBot];
  const run = tBot - tTop, n = Math.max(Math.round(-P.FLOOR / 0.2), Math.min(Math.round(-P.FLOOR / 0.15), Math.round(run / 0.28)));
  return { ...meta, top: A.map(r2), bottom: B.map(r2), flight: [[...T.map(r2), 0], [...Bb.map(r2), P.FLOOR]], steps: n, riser: r2(-P.FLOOR / n), tread: r2((tBot - tTop) / n), w: 2.4, run: r1(tBot - tTop) };
}
const stairs = [];
for (const e of ways) {
  if (e.tags.highway !== 'steps') continue;
  const pts = e.geometry.map(proj), hs = pts.map((p) => baseH(...p));
  if (Math.min(...hs) > P.FLOOR + 0.5 || Math.max(...hs) < -0.5) continue; // 탄천 제방과 무관
  const [A, B] = hs[0] >= hs[hs.length - 1] ? [pts[0], pts[pts.length - 1]] : [pts[pts.length - 1], pts[0]];
  // 아래쪽 끝이 경사 중간이면 둔치까지 연장
  const s = stairFrom(A, [B[0] + (B[0] - A[0]) * 0.6, B[1] + (B[1] - A[1]) * 0.6], { id: e.id, osm: true, incline: e.tags.incline || '', name: `OSM steps ${e.id}` });
  if (s) { s.bottom = B.map(r2); stairs.push(s); }
}
// 근사 계단(실측 아님): 정자역 근처 서안/동안, 정자로 다리 근처
const APPROX = [
  { name: '정자역 남쪽 서안 계단(근사)', z: 120, side: 'west' },
  { name: '정자역 동안 계단(근사)', z: 12, side: 'east' },
  { name: '정자역 남쪽 300m 서안 계단(근사)', z: 300, side: 'west' },
];
for (const a of APPROX) {
  // 해당 z 에서 축 위 점 찾기
  let bi = 0; for (let i = 0; i < N; i++) if (Math.abs(ax[i][1] - a.z) < Math.abs(ax[bi][1] - a.z) && inBox(ax[i])) bi = i;
  const [dx, dz] = dirAt(bi), nx = -dz * -1, nz = dx * -1; // d>0 방향 법선
  const sgnEast = nx > 0 ? 1 : -1, sgn = a.side === 'east' ? sgnEast : -sgnEast, s = sgn > 0 ? 'R' : 'L';
  const toe = prof['toe' + s][bi], top = prof['top' + s][bi];
  const A = [ax[bi][0] + nx * sgn * (top + 1.5), ax[bi][1] + nz * sgn * (top + 1.5)], B = [ax[bi][0] + nx * sgn * (toe - 1.2), ax[bi][1] + nz * sgn * (toe - 1.2)];
  const st = stairFrom(A, B, { id: null, osm: false, name: a.name });
  if (st) stairs.push(st);
}
const out = {
  meta: { source: 'data/osm_raw_osmapi.json + 근사 파라미터', attribution: '© OpenStreetMap contributors (ODbL)', generated: new Date().toISOString(),
    note: '높이값(FLOOR/WATER/BED)은 실측이 아닌 근사. 단면 폭(toe/top)은 OSM 둔치 경로·도로·건물 위치에서 추정', lowerWays: [...lowerIds], rampWays: [...rampIds] },
  params: P, axis: ax.map((p) => p.map(r1)), prof, stairs,
};
fs.writeFileSync('public/terrain.json', JSON.stringify(out));
console.log('terrain.json axis', N, 'pts; stairs', stairs.map((s) => `${s.name} run=${s.run}m steps=${s.steps} tread=${s.tread}`), 'lowerWays', lowerIds.size, (fs.statSync('public/terrain.json').size / 1024).toFixed(0) + 'KB');
// 디버그: 정자역 주변 단면
if (process.env.DEBUG) for (let z = -350; z <= 450; z += 25) { let bi = 0; for (let i = 0; i < N; i++) if (Math.abs(ax[i][1] - z) < Math.abs(ax[bi][1] - z) && inBox(ax[i])) bi = i; console.log('z', z, 'axis', ax[bi].map(r1), 'L toe/top/w', prof.toeL[bi], prof.topL[bi], prof.wL[bi], 'R', prof.toeR[bi], prof.topR[bi], prof.wR[bi]); }
