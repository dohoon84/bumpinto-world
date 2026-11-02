// [playgrounds] 놀이터 세트 배치 데이터: public/corridor/playgrounds.json
//
//   위치는 OSM 에서만 가져온다(leisure=playground 폴리곤). 위치를 지어내지 않는다.
//   - 원본: data/osm_playgrounds_raw.json (Overpass JSON + geom, 놀이터·예외 도형만 담은 작은 캐시. 커밋됨).
//           --osm=<Overpass JSON> 을 주면 그 파일(예: 코리더 베이크 원본 ../bumpinto-world/data/raw/osm_merged.json)에서
//           놀이터·예외 도형만 골라 캐시를 다시 쓰고, --fetch 를 주면 Overpass 에서 새로 받아 캐시한다(data/fetch.sh 재시도).
//   - 범위: 라이브 정자 bbox(jeongja.json) 또는 코리더 상세 타일이 있는 칸에 중심이 있는 폴리곤.
//           점(node)으로만 찍힌 놀이터는 폴리곤이 없어 크기·방향을 알 수 없으므로 배치하지 않는다(개수만 보고).
//   - 예외 목록: EXTRA_PLAYGROUNDS (이 파일 한 곳). OSM 태그는 다르지만 소유자가 현장 확인한 놀이터. 도형은 OSM 원본 그대로.
//   - 배치: 폴리곤 최소 면적 사각형(볼록 껍질 회전 캘리퍼스) 축에 맞춰 세트 직사각형(SET_W × SET_D)을 돌려 놓고,
//           폴리곤 안 · 건물(라이브+코리더 타일) 밖 · 도로 리본(라이브+코리더 타일+탄천 구간 ch) 밖인 자리만 쓴다.
//           큰 폴리곤은 겹치지 않게 2세트까지. 안 들어가면 SCALES 순서로 줄이고, 그래도 안 되면 건너뛴다(사유 기록).
//   - 높이: 런타임에 지형(renderHeight)에 붙인다(여기선 x, z, 회전, 배율만).
//
//   사용: npm run corridor:playgrounds [-- --fetch | --osm=../bumpinto-world/data/raw/osm_merged.json] [--out=public/corridor/playgrounds.json] [--verbose]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cliArg, inRing, bboxOf, bboxGrid } from '../lib/world-geo.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const FETCH = process.argv.includes('--fetch'), VERBOSE = process.argv.includes('--verbose');
const CACHE = path.join(ROOT, 'data/osm_playgrounds_raw.json');
const OSM = FETCH ? CACHE : path.resolve(ROOT, cliArg('osm', CACHE));
const OUT = path.resolve(ROOT, cliArg('out', 'public/corridor/playgrounds.json'));
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// ---- 예외 목록 (한 곳) : OSM 에 leisure=playground 가 없지만 놀이터로 넣을 OSM 도형 ----
const EXTRA_PLAYGROUNDS = [
  { type: 'way', id: 429371477, name: '꿈동산어린이공원', note: '야탑 고속버스터미널 맞은편(동부코오롱 쪽). OSM 은 leisure=park 뿐이지만 소유자가 놀이터 확인' },
];

// ---- 세트 치수 (src/world/playgrounds.js 의 SET_W/SET_D 와 같아야 함) ----
const SET_W = 15, SET_D = 10;           // 배율 1 의 세트 바닥 (m)
const SCALES = [1, 0.9, 0.8, 0.7, 0.6]; // 안 들어가면 이 순서로 줄임
const TWO_SET_AREA = 2.4 * SET_W * SET_D; // 폴리곤이 이보다 크면 2세트 시도
const MIN_SCALE_2ND = 0.8;              // 두 번째 세트는 이 배율 이상일 때만
const EDGE_PAD = 0.4;                   // 폴리곤 경계 안쪽 여유
const BLD_PAD = 1.0;                    // 건물과 여유
const ROAD_PAD = { car: 1.2, walk: 0.2 }; // 도로 리본 반폭 바깥 여유 (차도 / 보행로)
const SET_GAP = 1.5;                    // 두 세트 사이
const STEP = 0.75;                      // 후보 중심 격자 (m)
const WALK = new Set(['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track', 'bridleway', 'corridor']);

// ---- 투영: 라이브(jeongja.json meta.center)와 같은 식 ----
const live = readJSON(path.join(ROOT, 'public/jeongja.json'));
const C = live.meta.center;
const kx = Math.cos((C.lat * Math.PI) / 180) * 111320, kz = 110540;
const proj = (g) => [(g.lon - C.lon) * kx, -(g.lat - C.lat) * kz];
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

const CI = readJSON(path.join(ROOT, 'public/corridor/index.json'));
const LB = CI.meta.liveBox, TS = CI.meta.tileSize;
const inLive = ([x, z]) => x >= LB.x0 && x <= LB.x1 && z >= LB.z0 && z <= LB.z1;
const tileKey = ([x, z]) => `${Math.floor(x / TS)}_${Math.floor(z / TS)}`;
const inArea = (p) => inLive(p) || !!CI.tiles[tileKey(p)];

// ---- Overpass (선택) ----
function overpassFetch() {
  const toLL = (x, z) => ({ lat: C.lat - z / kz, lon: C.lon + x / kx });
  const B = CI.meta.bounds, a = toLL(B.x0, B.z1), b = toLL(B.x1, B.z0);
  const ids = EXTRA_PLAYGROUNDS.filter((e) => e.type === 'way').map((e) => e.id);
  const q = `[out:json][timeout:180][bbox:${a.lat.toFixed(4)},${a.lon.toFixed(4)},${b.lat.toFixed(4)},${b.lon.toFixed(4)}];\n(\n  nwr["leisure"="playground"];\n${ids.length ? `  way(id:${ids.join(',')});\n` : ''});\nout body geom;\n`;
  const qf = path.join(ROOT, 'data/query_playgrounds.overpassql');
  fs.writeFileSync(qf, q);
  execFileSync('bash', [path.join(ROOT, 'data/fetch.sh'), 'query_playgrounds.overpassql', 'osm_playgrounds_raw.json'], { stdio: 'inherit' });
}
if (FETCH) overpassFetch();

// ---- 기하 ----
const area = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(s) / 2; };
const centroid = (r) => { let x = 0, z = 0, a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; x += (r[j][0] + r[i][0]) * f; z += (r[j][1] + r[i][1]) * f; a += f; } return Math.abs(a) < 1e-9 ? r[0] : [x / (3 * a), z / (3 * a)]; };
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** 최소 면적 외접 사각형: ang = 긴 변 방향(x→z 라디안), [u0,u1]×[v0,v1] = 그 축으로 잰 범위 */
function minRect(ring) {
  const h = hull(ring); let best = null;
  for (let i = 0; i < h.length; i++) {
    const [ax, az] = h[i], [bx, bz] = h[(i + 1) % h.length];
    const ang = Math.atan2(bz - az, bx - ax), c = Math.cos(ang), s = Math.sin(ang);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of h) { const u = x * c + z * s, v = -x * s + z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const A = (u1 - u0) * (v1 - v0);
    if (!best || A < best.A) best = { A, ang, u0, u1, v0, v1 };
  }
  const { ang, u0, u1, v0, v1 } = best;
  return (u1 - u0) >= (v1 - v0) ? { ang, u0, u1, v0, v1 } : { ang: ang + Math.PI / 2, u0: v0, u1: v1, v0: -u1, v1: -u0 };
}
// three.js rotation.y = ry 일 때 로컬 (lx, lz) → 월드: x = lx cosR + lz sinR, z = -lx sinR + lz cosR
const toWorld = (cx, cz, ry, lx, lz) => [cx + lx * Math.cos(ry) + lz * Math.sin(ry), cz - lx * Math.sin(ry) + lz * Math.cos(ry)];
const rectPoly = (cx, cz, ry, hx, hz) => [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => toWorld(cx, cz, ry, a, b));
function segX(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
const ringsCross = (A, B) => { for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (segX(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true; return false; };
const polysOverlap = (A, B) => ringsCross(A, B) || A.some(([x, z]) => inRing(x, z, B)) || B.some(([x, z]) => inRing(x, z, A));
const ptSeg = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)); return Math.hypot(ax + dx * t - px, az + dz * t - pz); };
function segRectDist(a, b, R) {
  if (inRing(a[0], a[1], R) || inRing(b[0], b[1], R)) return 0;
  for (let i = 0; i < 4; i++) if (segX(a, b, R[i], R[(i + 1) % 4])) return 0;
  let d = Infinity;
  for (let i = 0; i < 4; i++) {
    const p = R[i], q = R[(i + 1) % 4];
    d = Math.min(d, ptSeg(p[0], p[1], a[0], a[1], b[0], b[1]), ptSeg(a[0], a[1], p[0], p[1], q[0], q[1]), ptSeg(b[0], b[1], p[0], p[1], q[0], q[1]));
  }
  return d;
}

// ---- 장애물: 라이브 + 코리더 타일 건물·도로·물 ----
const blds = [], segs = [], waters = [];
const addRoad = (r) => { const walk = WALK.has(r.k); const hw = (r.w || 3) / 2 + (walk ? ROAD_PAD.walk : ROAD_PAD.car); for (let i = 1; i < r.p.length; i++) segs.push({ a: r.p[i - 1], b: r.p[i], hw }); };
for (const b of live.buildings) blds.push(b.o);
for (const r of live.roads) addRoad(r);
for (const w of live.water || []) waters.push(w.o);
const base = readJSON(path.join(ROOT, 'public/corridor/base.json'));
for (const r of base.ch) addRoad(r);
for (const key of Object.keys(CI.tiles)) {
  const t = readJSON(path.join(ROOT, 'public/corridor/tiles', key + '.json'));
  for (const b of t.b) blds.push(b.o);
  for (const r of t.r) addRoad(r);
  for (const w of t.water || []) waters.push(w.o);
}
const bGrid = bboxGrid(50), sGrid = bboxGrid(50), wGrid = bboxGrid(100);
blds.forEach((o, i) => bGrid.add(bboxOf(o), i));
waters.forEach((o, i) => wGrid.add(bboxOf(o), i));
segs.forEach((s, i) => { const m = s.hw; sGrid.add({ x0: Math.min(s.a[0], s.b[0]) - m, x1: Math.max(s.a[0], s.b[0]) + m, z0: Math.min(s.a[1], s.b[1]) - m, z1: Math.max(s.a[1], s.b[1]) + m }, i); });

// ---- 후보 판정 ----
function fits(poly, R, Rb, others) {
  // 폴리곤 안 (모서리 + 변 교차 없음, 구멍 밖)
  if (!R.every(([x, z]) => inRing(x, z, poly.outer))) return 'edge';
  if (ringsCross(R, poly.outer)) return 'edge';
  for (const h of poly.holes) if (polysOverlap(R, h)) return 'edge';
  const bb = bboxOf(Rb);
  for (const i of bGrid.near(bb)) if (polysOverlap(Rb, blds[i])) return 'building';
  for (const i of wGrid.near(bb)) if (polysOverlap(R, waters[i])) return 'water';
  for (const i of sGrid.near(bboxOf(R))) { const s = segs[i]; if (segRectDist(s.a, s.b, R) < s.hw) return 'road'; }
  for (const o of others) if (polysOverlap(R, o)) return 'overlap';
  return null;
}
function place(poly, rect, others, scales) {
  const c = centroid(poly.outer), reasons = {}, otherRects = others.map((o) => o.R);
  const cu = Math.cos(rect.ang), su = Math.sin(rect.ang);
  for (const s of scales) {
    let best = null;
    for (const turn of [0, Math.PI / 2]) {
      const ang = rect.ang + turn, ry = -ang; // 세트 로컬 x(긴 변) → 폴리곤 긴 변 방향
      const hx = (SET_W * s) / 2, hz = (SET_D * s) / 2;
      for (let u = rect.u0; u <= rect.u1; u += STEP) for (let v = rect.v0; v <= rect.v1; v += STEP) {
        const cx = u * cu - v * su, cz = u * su + v * cu;
        const d = Math.hypot(cx - c[0], cz - c[1]) + (turn ? 0.5 : 0); // 같은 거리면 긴 변 맞춤 우선
        if (best && d >= best.d) continue;
        const R = rectPoly(cx, cz, ry, hx + EDGE_PAD, hz + EDGE_PAD), Rb = rectPoly(cx, cz, ry, hx + BLD_PAD, hz + BLD_PAD);
        const why = fits(poly, R, Rb, otherRects);
        if (why) { reasons[why] = (reasons[why] || 0) + 1; continue; }
        best = { d, x: cx, z: cz, ry, s, R: rectPoly(cx, cz, ry, (SET_W * s) / 2 + SET_GAP, (SET_D * s) / 2 + SET_GAP) };
      }
    }
    if (best) return { best };
  }
  return { reasons };
}

// ---- 놀이터 목록 ----
const extraIds = new Map(EXTRA_PLAYGROUNDS.map((e) => [e.type + '/' + e.id, e]));
const src = readJSON(OSM);
const els = src.elements.filter((e) => e.tags?.leisure === 'playground' || extraIds.has(e.type + '/' + e.id));
const osmBase = src.newest_edit || src.osm3s?.timestamp_osm_base || null;
if (OSM !== CACHE) { // 큰 원본에서 고른 입력을 캐시로 남겨 저장소만으로 다시 구울 수 있게
  fs.writeFileSync(CACHE, JSON.stringify({ generator: 'build-playgrounds.mjs (filtered from ' + path.basename(OSM) + ')', osm3s: src.osm3s, newest_edit: osmBase, elements: els }));
}
const ringOf = (geom) => geom.map(proj);
const list = [];
let nodes = 0, nodesInArea = 0, outOfArea = 0;
for (const e of els) {
  const extra = extraIds.get(e.type + '/' + e.id);
  if (e.tags?.leisure !== 'playground' && !extra) continue;
  if (e.type === 'node') { nodes++; if (inArea(proj(e))) nodesInArea++; continue; }
  let outer = null, holes = [];
  if (e.type === 'way' && e.geometry?.length >= 4) outer = ringOf(e.geometry);
  else if (e.type === 'relation') {
    const ways = (e.members || []).filter((m) => m.type === 'way' && m.geometry?.length >= 4);
    const o = ways.find((m) => m.role === 'outer'); if (o) outer = ringOf(o.geometry);
    holes = ways.filter((m) => m.role === 'inner').map((m) => ringOf(m.geometry));
  }
  if (!outer) continue;
  const c = centroid(outer);
  if (!inArea(c)) { outOfArea++; continue; }
  list.push({ id: e.type + '/' + e.id, name: e.tags?.name || extra?.name || '', extra: !!extra, outer, holes, c, A: area(outer) });
}
if (!EXTRA_PLAYGROUNDS.every((x) => list.some((p) => p.id === x.type + '/' + x.id))) {
  console.error('override geometry missing in source:', EXTRA_PLAYGROUNDS.filter((x) => !list.some((p) => p.id === x.type + '/' + x.id)).map((x) => x.id));
  process.exit(1);
}

// ---- 배치 ----
const out = [], skipped = [];
const cnt = { one: 0, two: 0, skip: 0, shrunk: 0 };
const allSets = [];
for (const p of list.sort((a, b) => b.A - a.A)) {
  const rect = minRect(p.outer);
  const first = place(p, rect, allSets, SCALES);
  if (!first.best) { cnt.skip++; skipped.push({ id: p.id, name: p.name, area: Math.round(p.A), why: first.reasons }); continue; }
  const sets = [first.best];
  if (p.A >= TWO_SET_AREA) {
    const second = place(p, rect, allSets.concat(sets), SCALES.filter((s) => s >= MIN_SCALE_2ND));
    if (second.best) sets.push(second.best);
  }
  allSets.push(...sets);
  if (sets.some((s) => s.s < 1)) cnt.shrunk++;
  cnt[sets.length === 2 ? 'two' : 'one']++;
  out.push({ id: p.id, name: p.name || undefined, extra: p.extra || undefined, area: Math.round(p.A), sets: sets.map((s) => [r1(s.x), r1(s.z), r3(s.ry), s.s]) });
}
out.sort((a, b) => a.sets[0][1] - b.sets[0][1] || a.sets[0][0] - b.sets[0][0]);

const json = {
  meta: {
    generated: new Date().toISOString(),
    source: path.relative(ROOT, OSM), osmBase,
    attribution: '© OpenStreetMap contributors (ODbL)',
    set: { w: SET_W, d: SET_D },
    stats: { polygons: list.length, nodesOnly: nodesInArea, nodesTotal: nodes, outOfArea, placed: cnt.one + cnt.two, oneSet: cnt.one, twoSets: cnt.two, shrunk: cnt.shrunk, skipped: cnt.skip, sets: allSets.length, extra: EXTRA_PLAYGROUNDS.length },
  },
  playgrounds: out,
  skipped,
};
fs.writeFileSync(OUT, JSON.stringify(json));
console.log(`[playgrounds] polygons ${list.length} (override ${EXTRA_PLAYGROUNDS.length}) · node-only ${nodesInArea} (not placed) · out of area ${outOfArea}`);
console.log(`[playgrounds] placed ${cnt.one + cnt.two} (1 set ${cnt.one}, 2 sets ${cnt.two}, shrunk ${cnt.shrunk}) · skipped ${cnt.skip} · sets ${allSets.length} → ${path.relative(ROOT, OUT)} ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
if (VERBOSE) for (const s of skipped) console.log('  skip', s.id, s.name, s.area + 'm²', JSON.stringify(s.why));
