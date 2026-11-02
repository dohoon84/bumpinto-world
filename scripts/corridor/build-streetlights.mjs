// [streetlights] 가로등 배치 데이터: public/corridor/streetlights.json
//
//   도로는 이미 구운 게임 데이터에서 읽는다(라이브 정자 public/jeongja.json · 탄천 구간 base.json ch · 코리더 타일 tiles/*.json).
//   - OSM highway=street_lamp 노드가 있으면 그 자리를 먼저 쓴다(원본: data/osm_streetlights_raw.json, 작은 캐시. 커밋됨).
//     --osm=<Overpass JSON> 을 주면(예: ../bumpinto-world/data/raw/osm_merged.json) 가로등·버스정류장·쉘터·나무 노드만 골라 캐시를 다시 쓴다.
//   - 나머지는 차도(CLASS 표)를 따라 등급별 간격으로 생성: 큰길 35 m(넓으면 양쪽 마주보기, 아니면 지그재그), 작은 길은 한쪽 50 m.
//   - 피하는 곳: 교차로 · 횡단보도 · 버스정류장/쉘터 · 가로수(런타임과 같은 규칙으로 계산한 자리 + OSM natural=tree) · 건물 · 다리(bridge=yes 구간과 그 주변) · 다른 차도 위.
//     걸리면 길 따라 ±3/6/9 m 옮겨 보고, 그래도 안 되면 버린다(사유별 개수 기록).
//   - 높이는 런타임에 지형(renderHeight)에 붙인다(여기선 x, z, 방향, 종류만). 결과는 입력이 같으면 항상 같다(난수 없음).
//
//   출력: { v, cell, meta:{counts…}, cells: { "cx_cz": [x, z, yaw, kind, …] } }  — 250 m 칸별 평면 배열
//         kind 0 = 큰길(10 m), 1 = 작은 길(0.72배), 2 = OSM 가로등(큰길 크기)
//
//   사용: npm run corridor:streetlights [-- --osm=../bumpinto-world/data/raw/osm_merged.json] [--out=public/corridor/streetlights.json] [--verbose]
import fs from 'node:fs';
import path from 'node:path';
import { cliArg, inRing, bboxOf, bboxGrid } from '../lib/world-geo.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const VERBOSE = process.argv.includes('--verbose');
const CACHE = path.join(ROOT, 'data/osm_streetlights_raw.json');
const OSM_SRC = cliArg('osm', null);
const OUT = path.resolve(ROOT, cliArg('out', 'public/corridor/streetlights.json'));
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

export const CELL = 250; // 런타임 src/world/streetlights.js 와 같아야 함

// ---- 도로 등급별 규칙 ----
//   sp: 간격(m)  mode: both(양쪽 마주보기) | zig(양쪽 번갈아) | one(한쪽)  kind: 0 큰길 / 1 작은 길  pri: 먼저 배치(작을수록)
//   wideBoth: 폭이 이 이상이면 zig 대신 both
export const CLASS = {
  motorway: { sp: 40, mode: 'both', kind: 0, pri: 0 },
  trunk: { sp: 35, mode: 'both', kind: 0, pri: 0 },
  primary: { sp: 35, mode: 'zig', wideBoth: 20, kind: 0, pri: 1 },
  secondary: { sp: 35, mode: 'zig', wideBoth: 20, kind: 0, pri: 1 },
  tertiary: { sp: 40, mode: 'zig', wideBoth: 20, kind: 0, pri: 2 },
  motorway_link: { sp: 40, mode: 'one', kind: 0, pri: 3 },
  trunk_link: { sp: 40, mode: 'one', kind: 0, pri: 3 },
  primary_link: { sp: 40, mode: 'one', kind: 0, pri: 3 },
  secondary_link: { sp: 40, mode: 'one', kind: 0, pri: 3 },
  tertiary_link: { sp: 40, mode: 'one', kind: 0, pri: 3 },
  residential: { sp: 50, mode: 'one', kind: 1, pri: 4 },
  unclassified: { sp: 50, mode: 'one', kind: 1, pri: 4 },
  living_street: { sp: 50, mode: 'one', kind: 1, pri: 4 },
  road: { sp: 50, mode: 'one', kind: 1, pri: 4 },
};
// 차도 판정(가로등이 다른 차도 위에 서지 않게) — 런타임 CAR_KINDS + busway
const CAR = new Set([...Object.keys(CLASS), 'service', 'busway']);
const TREE_KINDS = new Set(['primary', 'secondary', 'tertiary']); // tileMesh.js / world.js 가로수 규칙
const CURB = 0.7;          // 차도 가장자리에서 기둥까지
const ARM = 2.0;           // 기둥에서 양쪽 팔 끝까지 (큰길 크기, 런타임과 같아야 함)
const NUDGE = [0, 3, -3, 6, -6, 9, -9];
const CLEAR = { junction: 7, crossingAlong: 7, crossingAcross: 3, bus: 8, tree: 2.6, building: 0.8, bridge: 3, dup: 12, dupOsm: 15, osmRoad: 30 };

// ---- 투영: 라이브(jeongja.json meta.center)와 같은 식 ----
const live = readJSON(path.join(ROOT, 'public/jeongja.json'));
const C = live.meta.center;
const kx = Math.cos((C.lat * Math.PI) / 180) * 111320, kz = 110540;
const proj = (g) => [(g.lon - C.lon) * kx, -(g.lat - C.lat) * kz];
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

const CI = readJSON(path.join(ROOT, 'public/corridor/index.json'));
const LB = CI.meta.liveBox, TS = CI.meta.tileSize, BB = CI.meta.bounds;
const inLive = (x, z) => x >= LB.x0 && x <= LB.x1 && z >= LB.z0 && z <= LB.z1;
const inArea = (x, z) => inLive(x, z) || !!CI.tiles[`${Math.floor(x / TS)}_${Math.floor(z / TS)}`];

// ---- OSM 캐시 (가로등 · 정류장 · 쉘터 · 나무) ----
function rewriteCache(src) {
  const j = readJSON(path.resolve(ROOT, src));
  const keep = [];
  const near = (lat, lon) => { const [x, z] = proj({ lat, lon }); return x >= BB.x0 - 200 && x <= BB.x1 + 200 && z >= BB.z0 - 200 && z <= BB.z1 + 200; };
  for (const e of j.elements) {
    const t = e.tags || {};
    const want = t.highway === 'street_lamp' || t.highway === 'bus_stop' || t.public_transport === 'platform' || t.amenity === 'shelter' || t.natural === 'tree';
    if (!want) continue;
    let lat = e.lat, lon = e.lon;
    if (e.type === 'way' && e.geometry?.length) { lat = e.geometry.reduce((a, g) => a + g.lat, 0) / e.geometry.length; lon = e.geometry.reduce((a, g) => a + g.lon, 0) / e.geometry.length; }
    if (lat == null || !near(lat, lon)) continue;
    const tags = {}; for (const k of ['highway', 'public_transport', 'amenity', 'natural', 'lamp_mount', 'support', 'name']) if (t[k]) tags[k] = t[k];
    keep.push({ type: e.type, id: e.id, lat: +lat.toFixed(7), lon: +lon.toFixed(7), tags });
  }
  keep.sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.id - b.id));
  fs.writeFileSync(CACHE, JSON.stringify({ note: '[streetlights] scripts/corridor/build-streetlights.mjs --osm 로 osm_merged.json 에서 고른 노드(가로등·버스정류장·쉘터·나무). © OpenStreetMap contributors (ODbL)', source: path.basename(src), osm_base: j.osm3s?.timestamp_osm_base || null, elements: keep }) + '\n');
  console.log(`cache: ${keep.length} elements → ${path.relative(ROOT, CACHE)}`);
}
if (OSM_SRC) rewriteCache(OSM_SRC);
const osm = fs.existsSync(CACHE) ? readJSON(CACHE).elements : [];

// ---- 입력: 도로 · 건물 · 횡단보도 · 정류장 ----
const roads = [];   // { p, w, k, br, o:[oh,ot], src }
const blds = [];
for (const r of live.roads) roads.push({ ...r, src: 'live' });
for (const b of live.buildings) if (!((b.mh || 0) >= 2.5)) blds.push(b.o);
const base = readJSON(path.join(ROOT, 'public/corridor/base.json'));
for (const r of base.ch) roads.push({ ...r, src: 'ch' });
for (const key of Object.keys(CI.tiles).sort()) {
  const t = readJSON(path.join(ROOT, 'public/corridor/tiles', key + '.json'));
  for (const r of t.r) roads.push({ ...r, src: 'tile' });
  for (const b of t.b) if (!((b.mh || 0) >= 2.5)) blds.push(b.o);
}
const liveTransit = readJSON(path.join(ROOT, 'public/transit.json'));
const corTransit = readJSON(path.join(ROOT, 'public/corridor/transit.json'));
const crossings = [...base.crossings, ...(liveTransit.crossings || [])];
const busPts = [];
for (const s of [...liveTransit.stops, ...corTransit.stops]) {
  busPts.push([s.x, s.z]);
  const tr = s.tr || [0, 1], back = s.rdist != null && s.rdist < 7 ? 7 - s.rdist : 0; // corridor/buses.js 쉘터 자리
  busPts.push([s.x - tr[0] * back, s.z - tr[1] * back]);
}
const treePts = [];
const osmLamps = [];
for (const e of osm) {
  const p = proj(e);
  if (e.tags.highway === 'street_lamp') osmLamps.push({ id: e.id, p });
  else if (e.tags.natural === 'tree') treePts.push(p);
  else busPts.push(p); // bus_stop · platform · shelter
}

// ---- 공간 색인 ----
const carSegs = [], bridgeSegs = [];
for (const r of roads) {
  if (!CAR.has(r.k)) continue;
  for (let i = 1; i < r.p.length; i++) {
    const s = { a: r.p[i - 1], b: r.p[i], hw: r.w / 2 };
    (r.br ? bridgeSegs : carSegs).push(s);
  }
}
const segBox = (s, m) => ({ x0: Math.min(s.a[0], s.b[0]) - m, x1: Math.max(s.a[0], s.b[0]) + m, z0: Math.min(s.a[1], s.b[1]) - m, z1: Math.max(s.a[1], s.b[1]) + m });
const carGrid = bboxGrid(40), brGrid = bboxGrid(40), bGrid = bboxGrid(40);
carSegs.forEach((s, i) => carGrid.add(segBox(s, s.hw + 1), i));
bridgeSegs.forEach((s, i) => brGrid.add(segBox(s, s.hw + CLEAR.bridge), i));
blds.forEach((o, i) => bGrid.add(bboxOf(o), i));
const ptGrid = (pts, cell) => { const g = bboxGrid(cell); pts.forEach((p, i) => g.add({ x0: p[0], x1: p[0], z0: p[1], z1: p[1] }, i)); return { pts, g }; };
const nearPt = ({ pts, g }, x, z, r) => { for (const i of g.near({ x0: x - r, x1: x + r, z0: z - r, z1: z + r })) if (Math.hypot(pts[i][0] - x, pts[i][1] - z) < r) return true; return false; };

function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
}
const onCar = (x, z, pad) => { for (const i of carGrid.at(x, z)) { const s = carSegs[i]; if (segDist(x, z, s.a, s.b) < s.hw + pad) return true; } return false; };
const nearBridge = (x, z) => { for (const i of brGrid.at(x, z)) { const s = bridgeSegs[i]; if (segDist(x, z, s.a, s.b) < s.hw + CLEAR.bridge) return true; } return false; };
function ringDist(x, z, ring) { let d = Infinity; for (let i = 0; i < ring.length; i++) d = Math.min(d, segDist(x, z, ring[i], ring[(i + 1) % ring.length])); return d; }
const inBuilding = (x, z, pad) => { for (const i of bGrid.near({ x0: x - pad, x1: x + pad, z0: z - pad, z1: z + pad })) { const o = blds[i]; if (inRing(x, z, o) || ringDist(x, z, o) < pad) return true; } return false; };

// ---- 가로수 자리(런타임 tileMesh.js / world.js / corridor index.js chTrees 와 같은 규칙, 필터 전 전체) ----
for (const r of roads) {
  if (!TREE_KINDS.has(r.k) || (r.src === 'ch' && r.br)) continue;
  const [oh, ot] = r.src === 'live' ? [0, 0] : r.o || [0, 0];
  for (let i = 1 + oh; i < r.p.length - ot; i++) {
    const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], L = Math.hypot(bx - ax, bz - az); if (L < 1e-3) continue;
    const nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let s = 6; s < L; s += 14) for (const side of [-1, 1]) treePts.push([ax + ((bx - ax) * s) / L + nx * side * (r.w / 2 + 1.6), az + ((bz - az) * s) / L + nz * side * (r.w / 2 + 1.6)]);
  }
}
const trees = ptGrid(treePts, 20), buses = ptGrid(busPts, 20);
const cross = { pts: crossings.map((c) => [c.x, c.z]), g: null }; cross.g = ptGrid(cross.pts, 40).g;
// 횡단보도 로컬 좌표: dir = 도로 방향, 줄무늬는 법선으로 ±w/2 (corridor/crossings.js). 신호등 기둥(w/2+0.9, dir 쪽 ~2.7 m)까지 비움
const nearCrossing = (x, z) => {
  for (const i of cross.g.near({ x0: x - 30, x1: x + 30, z0: z - 30, z1: z + 30 })) {
    const c = crossings[i], [dx, dz] = c.dir || [1, 0], rx = x - c.x, rz = z - c.z;
    const along = rx * dx + rz * dz, across = -rx * dz + rz * dx;
    if (Math.abs(across) < (c.w || 8) / 2 + CLEAR.crossingAcross && Math.abs(along) < CLEAR.crossingAlong) return true;
  }
  return false;
};

// ---- 교차로: 서로 다른 방향의 차도가 만나는 꼭짓점 + T자(끝점이 다른 차도 위) ----
const junctions = [];
{
  const vmap = new Map();
  const ang = (a, b) => { const v = Math.atan2(b[1] - a[1], b[0] - a[0]); return ((v % Math.PI) + Math.PI) % Math.PI; };
  for (const r of roads) {
    if (!CAR.has(r.k) || r.k === 'busway') continue;
    const n = r.p.length;
    for (let i = 0; i < n; i++) {
      const a = r.p[Math.max(0, i - 1)], b = r.p[Math.min(n - 1, i + 1)];
      const key = Math.round(r.p[i][0] * 2) + ',' + Math.round(r.p[i][1] * 2);
      if (!vmap.has(key)) vmap.set(key, []);
      vmap.get(key).push({ th: ang(a, b), p: r.p[i], end: i === 0 || i === n - 1 });
    }
  }
  const differ = (a, b) => { const d = Math.abs(a - b); return Math.min(d, Math.PI - d) > 0.35; };
  for (const list of vmap.values()) {
    if (list.length < 2) continue;
    if (list.some((u, i) => list.some((v, j) => j > i && differ(u.th, v.th)))) junctions.push(list[0].p);
  }
  // T자: 끝점이 (방향이 다른) 다른 차도 리본 안
  for (const r of roads) {
    if (!CAR.has(r.k) || r.k === 'busway' || r.p.length < 2) continue;
    for (const [e, f] of [[r.p[0], r.p[1]], [r.p[r.p.length - 1], r.p[r.p.length - 2]]]) {
      const th = ang(e, f);
      for (const i of carGrid.at(e[0], e[1])) {
        const s = carSegs[i];
        if (s.a === e || s.b === e) continue;
        if (segDist(e[0], e[1], s.a, s.b) < s.hw + 1 && differ(th, ang(s.a, s.b))) { junctions.push(e); break; }
      }
    }
  }
}
const junc = ptGrid(junctions, 30);

// ---- 배치 ----
const placed = [];          // { x, z, yaw, kind, src, cls }
const placedGrid = bboxGrid(30);
const reasons = {};
const why = (k) => { reasons[k] = (reasons[k] || 0) + 1; };
const nearPlaced = (x, z, r) => { for (const i of placedGrid.near({ x0: x - r, x1: x + r, z0: z - r, z1: z + r })) if (Math.hypot(placed[i].x - x, placed[i].z - z) < r) return true; return false; };
const yawOf = (nx, nz) => { const y = Math.atan2(-nz, nx); return ((y % Math.PI) + Math.PI) % Math.PI; }; // 팔(로컬 +X)이 도로 법선 방향. 대칭이라 π 주기
function accept(l) { placedGrid.add({ x0: l.x, x1: l.x, z0: l.z, z1: l.z }, placed.length); placed.push(l); }

/** 기둥 + 양쪽 팔 끝(법선 방향 ±ARM*s)이 다 비었는지. 이유 문자열 또는 null */
function blockedAt(x, z, nx, nz, s, own) {
  if (!inArea(x, z)) return 'area';
  if (nearBridge(x, z)) return 'bridge';
  if (onCar(x, z, 0.3)) return 'road';
  if (nearPt(junc, x, z, own.w / 2 + CLEAR.junction)) return 'junction';
  if (nearCrossing(x, z)) return 'crossing';
  if (nearPt(buses, x, z, CLEAR.bus)) return 'bus';
  if (nearPt(trees, x, z, CLEAR.tree)) return 'tree';
  if (inBuilding(x, z, CLEAR.building)) return 'building';
  const a = ARM * s;
  if (inBuilding(x + nx * a, z + nz * a, 0.2) || inBuilding(x - nx * a, z - nz * a, 0.2)) return 'building';
  return null;
}

// 1) OSM 가로등
let osmUsed = 0;
for (const L of osmLamps.sort((a, b) => a.id - b.id)) {
  const [x, z] = L.p;
  if (!inArea(x, z)) { why('osm-area'); continue; }
  if (onCar(x, z, 0) || inBuilding(x, z, 0.3) || nearBridge(x, z)) { why('osm-blocked'); continue; }
  let best = null;
  for (const i of carGrid.near({ x0: x - CLEAR.osmRoad, x1: x + CLEAR.osmRoad, z0: z - CLEAR.osmRoad, z1: z + CLEAR.osmRoad })) {
    const s = carSegs[i], d = segDist(x, z, s.a, s.b);
    if (!best || d < best.d) best = { d, s };
  }
  let yaw = 0;
  if (best) { const { a, b } = best.s, Lg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; yaw = yawOf(-(b[1] - a[1]) / Lg, (b[0] - a[0]) / Lg); }
  if (nearPlaced(x, z, 4)) { why('osm-dup'); continue; }
  accept({ x, z, yaw, kind: 2, src: 'osm', cls: 'osm' }); osmUsed++;
}

// 2) 도로 따라 생성 (우선순위 → 출처 → 좌표 순으로 결정적)
const lampRoads = roads.filter((r) => CLASS[r.k] && !r.br).map((r) => ({ r, c: CLASS[r.k] }));
lampRoads.sort((A, B) => A.c.pri - B.c.pri || B.r.w - A.r.w || A.r.p[0][0] - B.r.p[0][0] || A.r.p[0][1] - B.r.p[0][1]);
const byClass = {};
for (const { r, c } of lampRoads) {
  const [oh, ot] = r.src === 'live' ? [0, 0] : r.o || [0, 0];
  const segs = [];
  for (let i = 1 + oh; i < r.p.length - ot; i++) {
    const a = r.p[i - 1], b = r.p[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > 1e-3) segs.push({ a, b, L, s0: segs.length ? segs[segs.length - 1].s0 + segs[segs.length - 1].L : 0 });
  }
  if (!segs.length) continue;
  const total = segs[segs.length - 1].s0 + segs[segs.length - 1].L;
  const mode = c.wideBoth && r.w >= c.wideBoth ? 'both' : c.mode;
  const scale = c.kind === 1 ? 0.72 : 1;
  const at = (s) => { s = Math.max(0, Math.min(total, s)); let k = 0; while (k < segs.length - 1 && segs[k].s0 + segs[k].L < s) k++; const g = segs[k], t = (s - g.s0) / g.L; return { x: g.a[0] + (g.b[0] - g.a[0]) * t, z: g.a[1] + (g.b[1] - g.a[1]) * t, nx: -(g.b[1] - g.a[1]) / g.L, nz: (g.b[0] - g.a[0]) / g.L }; };
  const step = mode === 'zig' ? c.sp / 2 : c.sp;
  // 짧은 조각도 한 개는 서도록 시작점은 간격의 절반(최대 조각 길이의 절반)
  for (let s = Math.min(step / 2, total / 2), n = 0; s <= total; s += step, n++) {
    const sides = mode === 'both' ? [1, -1] : mode === 'zig' ? [n % 2 ? -1 : 1] : [1];
    for (const side of sides) {
      let done = false, last = null;
      for (const d of NUDGE) {
        const ss = s + d; if (ss < 0 || ss > total) continue;
        const q = at(ss), off = r.w / 2 + CURB, x = q.x + q.nx * side * off, z = q.z + q.nz * side * off;
        const b = blockedAt(x, z, q.nx, q.nz, scale, r) || (nearPlaced(x, z, CLEAR.dup) ? 'dup' : null);
        if (b) { last = b; if (b === 'dup' || b === 'area') break; continue; }
        accept({ x, z, yaw: yawOf(q.nx, q.nz), kind: c.kind, src: 'gen', cls: r.k });
        byClass[r.k] = (byClass[r.k] || 0) + 1; done = true; break;
      }
      if (!done) why(last);
    }
  }
}

// ---- 출력 ----
const cells = {};
placed.sort((a, b) => a.z - b.z || a.x - b.x);
for (const l of placed) {
  const x = r1(l.x), z = r1(l.z), k = `${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`; // 칸은 반올림한 좌표 기준(런타임과 같게)
  (cells[k] ||= []).push(x, z, r3(l.yaw), l.kind);
}
const sortedCells = Object.fromEntries(Object.keys(cells).sort().map((k) => [k, cells[k]]));
const counts = { total: placed.length, osm: osmUsed, generated: placed.length - osmUsed, osmNodes: osmLamps.length, byClass, live: placed.filter((l) => inLive(l.x, l.z)).length, skipped: reasons, junctions: junctions.length, cells: Object.keys(cells).length };
const out = { v: 1, cell: CELL, attribution: '© OpenStreetMap contributors (ODbL)', meta: { generated: 'scripts/corridor/build-streetlights.mjs', counts }, cells: sortedCells };
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(`streetlights: ${placed.length} lamps (OSM ${osmUsed}/${osmLamps.length}, generated ${placed.length - osmUsed}, live ${counts.live}) in ${counts.cells} cells → ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
console.log('by class', byClass);
console.log('skipped', reasons);
if (VERBOSE) console.log('junctions', junctions.length);
