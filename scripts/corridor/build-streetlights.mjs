// [streetlights] 가로등 배치 데이터: public/corridor/streetlights.json
//
//   도로는 이미 구운 게임 데이터에서 읽는다(라이브 정자 public/jeongja.json · 탄천 구간 base.json ch · 코리더 타일 tiles/*.json).
//   - OSM highway=street_lamp 노드가 있으면 그 자리를 먼저 쓴다(원본: data/osm_streetlights_raw.json, 작은 캐시. 커밋됨).
//     --osm=<Overpass JSON> 을 주면(예: ../bumpinto-world/data/raw/osm_merged.json) 가로등·버스정류장·쉘터·나무 노드만 골라 캐시를 다시 쓴다.
//   - 나머지는 차도(CLASS 표)를 따라 등급별 간격으로 생성: 큰길 35 m(넓으면 양쪽 마주보기, 아니면 지그재그), 작은 길은 한쪽 50 m.
//   - 피하는 곳: 교차로 · 횡단보도 · 버스정류장/쉘터 · 가로수(런타임과 같은 규칙으로 계산한 자리 + OSM natural=tree) · 건물 · 다리(bridge=yes 구간과 그 주변) · 다른 차도 위.
//     걸리면 길 따라 ±3/6/9 m 옮겨 보고, 그래도 안 되면 버린다(사유별 개수 기록).
//   - 탄천 둔치 산책로·자전거길(footway/cycleway/path/pedestrian 중 탄천 단면 안, 물·하상 제외)엔 낮은 공원등(kind 3)을 30 m 간격 한쪽(물 반대편 우선).
//     탄천 단면은 게임과 같은 지형(terrain.json + corridor/tancheon.json, src/world/terrain.js)으로 판정한다. 다리(bridge=yes)는 건너뜀.
//   - 높이는 런타임에 지형(renderHeight)에 붙인다(여기선 x, z, 방향, 종류만). 결과는 입력이 같으면 항상 같다(난수 없음).
//
//   출력: { v, cell, meta:{counts…}, cells: { "cx_cz": [x, z, yaw, kind, …] } }  — 250 m 칸별 평면 배열
//         kind 0 = 큰길(10 m), 1 = 작은 길(0.72배), 2 = OSM 가로등(큰길 크기), 3 = 탄천 공원등(0.45배)
//
//   [pangyo] --pangyo: 판교역 일대(public/corridor/pangyo/index.json 의 meta.boxes) 안만 다시 굽는다 → public/corridor/pangyo/streetlights.json
//     - 도로·건물: 코리더 타일 + 판교 타일(mode new 는 판교 것만, add 는 뒤에 덧붙임) + 판교 랜드마크 부품(백화점·알파돔·데크·NCSOFT)
//     - 판교에선 밑면이 11 m 보다 낮은 매스(광장 데크 10 m, NCSOFT 8 m 다리동 등)도 장애물 → 데크·다리 밑엔 10 m 기둥을 세우지 않는다
//     - OSM 가로등: data/osm_pangyo_streetlights_raw.json (data/query_pangyo_streetlights.overpassql) — 2026-11-03 기준 0개라 규칙 배치
//     - 범위 밖 코리더 가로등(public/corridor/streetlights.json)을 먼저 깔아 경계에서 겹치지 않게 함(출력엔 안 넣음)
//     - 광장 데크 위: 가장자리에서 DECK.inset 안쪽으로 DECK.sp 간격 보행등(kind 4, 4.5 m, y = 데크 윗면)
//     출력: { v, meta, boxes, lamps: [x, z, yaw, kind, y, …] } (y = -1 이면 지형 높이)
//   [migeum] --migeum (= --region=migeum): 같은 규칙으로 미금역 일대(public/corridor/migeum/index.json meta.boxes) → public/corridor/migeum/streetlights.json
//     - 판교와 같은 입력 규칙(코리더 타일 + 미금 타일 new/add, 밑면 11 m 미만 매스도 장애물). 데크는 없음 → 도로 규칙 배치 + 탄천 공원등만
//     - OSM 가로등: data/osm_migeum_streetlights_raw.json (data/query_migeum_streetlights.overpassql) — 2026-11-04 기준 0개라 규칙 배치
//     - 지하철 출입구 캐노피(3.4×7.5 m, 건물 안 출입구 제외) 둘레 CLEAR.entrance 안은 비움
//     - 탄천 제방 띠(build-pangyo.mjs --region=migeum 의 STRIP 과 같은 계산) 안: 새로 만들지 않고, 기존 코리더 가로등(공원등)을 그대로 옮겨 담음(src keep)
//       → 미금 켜짐/꺼짐과 상관없이 띠 안 가로등은 같은 자리
//   사용: npm run corridor:streetlights [-- --osm=../bumpinto-world/data/raw/osm_merged.json] [--out=public/corridor/streetlights.json] [--verbose]
import fs from 'node:fs';
import path from 'node:path';
import { cliArg, inRing, bboxOf, bboxGrid } from '../lib/world-geo.mjs';
import { createTerrain } from '../../src/world/terrain.js';
import { mergeTancheon } from '../../src/corridor/tancheon.js';
import pc from 'polygon-clipping'; // [migeum] 탄천 띠

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const VERBOSE = process.argv.includes('--verbose');
const CACHE = path.join(ROOT, 'data/osm_streetlights_raw.json');
const OSM_SRC = cliArg('osm', null);
// [pangyo] [migeum] 확장 지역: --pangyo | --migeum | --region=pangyo|migeum. 없으면 코리더 전체(public/corridor/streetlights.json)
const REGION = process.argv.includes('--pangyo') ? 'pangyo' : process.argv.includes('--migeum') ? 'migeum' : cliArg('region', null);
if (REGION && !['pangyo', 'migeum'].includes(REGION)) throw new Error('--region=pangyo|migeum');
const PG = !!REGION; // 지역 굽기(판교·미금 공통 경로)
const RG = REGION ? { // 지역별 차이
  pangyo: { deck: true, entrances: false, strip: false },
  migeum: { deck: false, entrances: true, strip: true },
}[REGION] : null;
const OUT = path.resolve(ROOT, cliArg('out', PG ? `public/corridor/${REGION}/streetlights.json` : 'public/corridor/streetlights.json'));
const PG_CACHE = path.join(ROOT, `data/osm_${REGION}_streetlights_raw.json`);
const DECK = { sp: 18, inset: 1.6, elev: 4, dup: 10, scale: 0.45 }; // [pangyo] 데크 위 보행등
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
// 탄천 공원등: 산책로 종류 · 간격 · 기둥 위치(길 가장자리에서) · 단면 판정 여유
const PARK = { kinds: new Set(['footway', 'cycleway', 'path', 'pedestrian']), sp: 30, curb: 0.6, waterPad: 1.5, topPad: 8, dup: 25, steps: 2.5, walkPad: 0.3 };
const CLEAR = { junction: 7, crossingAlong: 7, crossingAcross: 3, bus: 8, tree: 2.6, building: 0.8, bridge: 3, dup: 12, dupOsm: 15, osmRoad: 30, entrance: 5 }; // entrance: [migeum] 출입구 캐노피 중심에서(반대각 4.1 m + 여유)

// ---- 투영: 라이브(jeongja.json meta.center)와 같은 식 ----
const live = readJSON(path.join(ROOT, 'public/jeongja.json'));
const C = live.meta.center;
const kx = Math.cos((C.lat * Math.PI) / 180) * 111320, kz = 110540;
const proj = (g) => [(g.lon - C.lon) * kx, -(g.lat - C.lat) * kz];
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

const CI = readJSON(path.join(ROOT, 'public/corridor/index.json'));
const LB = CI.meta.liveBox, TS = CI.meta.tileSize, BB = CI.meta.bounds;
const inLive = (x, z) => x >= LB.x0 && x <= LB.x1 && z >= LB.z0 && z <= LB.z1;
const PGI = PG ? readJSON(path.join(ROOT, `public/corridor/${REGION}/index.json`)) : null; // [pangyo] [migeum]
const PGB = PGI?.meta.boxes || [];
const inRegion = (x, z) => PGB.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
const inArea = PG ? inRegion : (x, z) => inLive(x, z) || !!CI.tiles[`${Math.floor(x / TS)}_${Math.floor(z / TS)}`];

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
if (PG) osm.push(...readJSON(PG_CACHE).elements.filter((e) => !osm.some((o) => o.id === e.id))); // [pangyo]

// ---- 입력: 도로 · 건물 · 횡단보도 · 정류장 ----
const roads = [];   // { p, w, k, br, o:[oh,ot], src }
const blds = [];
for (const r of live.roads) roads.push({ ...r, src: 'live' });
for (const b of live.buildings) if (!((b.mh || 0) >= 2.5)) blds.push(b.o);
const base = readJSON(path.join(ROOT, 'public/corridor/base.json'));
for (const r of base.ch) roads.push({ ...r, src: 'ch' });
const MH_MAX = PG ? 11 : 2.5; // [pangyo] [migeum] 지역: 밑면 11 m 미만 매스(데크 10 m 등)도 막음
for (const key of Object.keys(CI.tiles).sort()) {
  const t = readJSON(path.join(ROOT, 'public/corridor/tiles', key + '.json'));
  for (const r of t.r) roads.push({ ...r, src: 'tile' });
  for (const b of t.b) if (!((b.mh || 0) >= MH_MAX)) blds.push(b.o);
}
const deckParts = [];
const entrancePts = []; // [migeum] 지하철 출입구 캐노피 자리
if (PG) { // [pangyo] [migeum] 지역 타일(new = 지역 것만, add = 덧붙임) + 랜드마크 부품
  for (const [key, ti] of Object.entries(PGI.tiles).sort()) {
    const t = readJSON(path.join(ROOT, `public/corridor/${REGION}/tiles`, key + '.json'));
    if (ti.mode !== 'add' && CI.tiles[key]) continue;
    for (const r of t.r || []) roads.push({ ...r, src: 'tile' });
    for (const b of t.b || []) if (!((b.mh || 0) >= MH_MAX)) blds.push(b.o);
  }
  for (const l of PGI.landmarks) for (const p of l.parts || []) {
    if (!((p.mh || 0) >= MH_MAX)) blds.push(p.o);
    if (l.id === 'pangyo-deck') deckParts.push({ ...p, elevators: l.elevators || [] });
  }
  if (RG.entrances) for (const l of PGI.landmarks) for (const e of l.entrances || []) if (!e.indoor) entrancePts.push([e.x, e.z]); // 건물 안 출입구는 건물이 막음
}
// [migeum] 탄천 제방 띠 — build-pangyo.mjs --region=migeum 의 STRIP 과 같은 계산(라이브 terrain.json 축 + 코리더 tancheon.json, 제방 위 + 0.6 m)
let stripRings = null;
if (RG?.strip) {
  const T = mergeTancheon(readJSON(path.join(ROOT, 'public/terrain.json')), readJSON(path.join(ROOT, 'public/corridor/tancheon.json')));
  const ax = T.axis, prof = T.prof, N = ax.length, left = [], right = [];
  for (let i = 0; i < N; i += 2) {
    const a = ax[Math.max(0, i - 1)], b = ax[Math.min(N - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L, pad = 0.6;
    right.push([ax[i][0] + nx * (prof.topR[i] + pad), ax[i][1] + nz * (prof.topR[i] + pad)]);
    left.push([ax[i][0] - nx * (prof.topL[i] + pad), ax[i][1] - nz * (prof.topL[i] + pad)]);
  }
  const ring = [...right, ...left.reverse()]; ring.push(ring[0]);
  stripRings = pc.union([[ring]]);
}
const inStrip = (x, z) => !!stripRings && stripRings.some((poly) => inRing(x, z, poly[0]) && !poly.slice(1).some((h) => inRing(x, z, h)));
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
const carSegs = [], bridgeSegs = [], walkSegs = [], stepSegs = [];
for (const r of roads) {
  const car = CAR.has(r.k);
  for (let i = 1; i < r.p.length; i++) {
    const s = { a: r.p[i - 1], b: r.p[i], hw: r.w / 2, r };
    if (r.br) bridgeSegs.push(s); // 다리는 차도·보행 다리 모두 비움(다리 조명은 따로)
    else if (car) carSegs.push(s);
    else if (r.k === 'steps') stepSegs.push(s);
    else if (PARK.kinds.has(r.k)) walkSegs.push(s);
  }
}
const segBox = (s, m) => ({ x0: Math.min(s.a[0], s.b[0]) - m, x1: Math.max(s.a[0], s.b[0]) + m, z0: Math.min(s.a[1], s.b[1]) - m, z1: Math.max(s.a[1], s.b[1]) + m });
const carGrid = bboxGrid(40), brGrid = bboxGrid(40), bGrid = bboxGrid(40), walkGrid = bboxGrid(40), stepGrid = bboxGrid(40);
walkSegs.forEach((s, i) => walkGrid.add(segBox(s, s.hw + 1), i));
stepSegs.forEach((s, i) => stepGrid.add(segBox(s, s.hw + PARK.steps), i));
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
const onOtherWalk = (x, z, own) => { for (const i of walkGrid.at(x, z)) { const s = walkSegs[i]; if (s.r !== own && segDist(x, z, s.a, s.b) < s.hw + PARK.walkPad) return true; } return false; };
const nearSteps = (x, z) => { for (const i of stepGrid.at(x, z)) { const s = stepSegs[i]; if (segDist(x, z, s.a, s.b) < s.hw + PARK.steps) return true; } return false; };
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
const trees = ptGrid(treePts, 20), buses = ptGrid(busPts, 20), entrances = ptGrid(entrancePts, 20);
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
  if (inStrip(x, z)) return 'strip'; // [migeum] 탄천 띠는 기존 코리더 가로등 그대로
  if (entrancePts.length && nearPt(entrances, x, z, CLEAR.entrance)) return 'entrance'; // [migeum]
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

// [pangyo] 0) 범위 밖 코리더 가로등을 먼저 깐다(겹침 판정용, 출력 안 함)
//   [migeum] 범위 안 탄천 띠의 코리더 가로등은 그대로 옮겨 담는다(src keep, 출력함) — 띠 안은 새로 만들지 않음
const keepPark = [];
if (PG) {
  const main = readJSON(path.join(ROOT, 'public/corridor/streetlights.json'));
  for (const arr of Object.values(main.cells)) for (let i = 0; i < arr.length; i += 4) {
    const x = arr[i], z = arr[i + 1];
    if (!inRegion(x, z) && PGB.some((b) => x > b.x0 - 60 && x < b.x1 + 60 && z > b.z0 - 60 && z < b.z1 + 60)) accept({ x, z, yaw: arr[i + 2], kind: arr[i + 3], src: 'seed', cls: 'seed' });
    else if (inRegion(x, z) && inStrip(x, z)) { accept({ x, z, yaw: arr[i + 2], kind: arr[i + 3], src: 'keep', cls: 'keep-strip' }); if (arr[i + 3] === 3) keepPark.push([x, z]); }
  }
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

// 3) 탄천 둔치 공원등 — 게임 지형으로 단면(물 · 둔치 · 제방) 판정
const TT = mergeTancheon(readJSON(path.join(ROOT, 'public/terrain.json')), readJSON(path.join(ROOT, 'public/corridor/tancheon.json')));
const terrain = createTerrain(TT, live);
const TN = TT.axis.length, TP = TT.prof, FLOOR = TT.params.FLOOR;
/** 탄천 단면 안(물·하상 바깥 ~ 제방 위 topPad)이면 { d, top, w }, 아니면 null */
function tancheonAt(x, z) {
  const q = terrain.project(x, z); if (!q || q.end) return null;
  const sd = q.d < 0 ? 'L' : 'R', j = Math.min(TN - 1, q.i + 1), f = (k) => TP[k + sd][q.i] * (1 - q.t) + TP[k + sd][j] * q.t;
  const ad = Math.abs(q.d), top = f('top'), w = f('w');
  if (ad < w + PARK.waterPad || ad > top + PARK.topPad) return null;
  return { ad, top, w };
}
const parkGrid = bboxGrid(30), parkPts = [];
for (const [x, z] of keepPark) { parkGrid.add({ x0: x, x1: x, z0: z, z1: z }, parkPts.length); parkPts.push([x, z]); } // [migeum] 옮겨 담은 띠 공원등
const nearPark = (x, z, r) => { for (const i of parkGrid.near({ x0: x - r, x1: x + r, z0: z - r, z1: z + r })) if (Math.hypot(parkPts[i][0] - x, parkPts[i][1] - z) < r) return true; return false; };
const PARK_SCALE = 0.45;
function parkBlocked(x, z, nx, nz, own) {
  if (!inArea(x, z)) return 'area';
  if (inStrip(x, z)) return 'strip'; // [migeum]
  if (entrancePts.length && nearPt(entrances, x, z, CLEAR.entrance)) return 'entrance'; // [migeum]
  if (!tancheonAt(x, z)) return 'park-band';
  if (terrain.renderHeight(x, z) < FLOOR - 0.2) return 'park-bed';
  if (nearBridge(x, z)) return 'bridge';
  if (onCar(x, z, 0.3)) return 'road';
  if (onOtherWalk(x, z, own)) return 'park-path';
  if (nearSteps(x, z) || terrain.stairAt(x, z, PARK.steps)) return 'park-steps';
  if (nearPt(trees, x, z, CLEAR.tree)) return 'tree';
  if (inBuilding(x, z, CLEAR.building)) return 'building';
  const a = ARM * PARK_SCALE;
  if (inBuilding(x + nx * a, z + nz * a, 0.2) || inBuilding(x - nx * a, z - nz * a, 0.2)) return 'building';
  return null;
}
const parkRoads = roads.filter((r) => PARK.kinds.has(r.k) && !r.br && r.p.length >= 2 && r.p.some(([x, z]) => tancheonAt(x, z)));
parkRoads.sort((A, B) => B.w - A.w || (A.k < B.k ? -1 : A.k > B.k ? 1 : 0) || A.p[0][0] - B.p[0][0] || A.p[0][1] - B.p[0][1]);
let parkN = 0;
const parkBy = {};
for (const r of parkRoads) {
  const [oh, ot] = r.src === 'live' ? [0, 0] : r.o || [0, 0];
  const segs = [];
  for (let i = 1 + oh; i < r.p.length - ot; i++) {
    const a = r.p[i - 1], b = r.p[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > 1e-3) segs.push({ a, b, L, s0: segs.length ? segs[segs.length - 1].s0 + segs[segs.length - 1].L : 0 });
  }
  if (!segs.length) continue;
  const total = segs[segs.length - 1].s0 + segs[segs.length - 1].L;
  const at = (s) => { s = Math.max(0, Math.min(total, s)); let k = 0; while (k < segs.length - 1 && segs[k].s0 + segs[k].L < s) k++; const g = segs[k], t = (s - g.s0) / g.L; return { x: g.a[0] + (g.b[0] - g.a[0]) * t, z: g.a[1] + (g.b[1] - g.a[1]) * t, nx: -(g.b[1] - g.a[1]) / g.L, nz: (g.b[0] - g.a[0]) / g.L }; };
  for (let s = Math.min(PARK.sp / 2, total / 2); s <= total; s += PARK.sp) {
    let done = false, last = null;
    for (const d of NUDGE) {
      const ss = s + d; if (ss < 0 || ss > total) continue;
      const q = at(ss), off = r.w / 2 + PARK.curb;
      // 물 반대편(축에서 먼 쪽) 먼저
      const cand = [1, -1].map((side) => ({ x: q.x + q.nx * side * off, z: q.z + q.nz * side * off }));
      const da = tancheonAt(cand[0].x, cand[0].z)?.ad ?? 0, db = tancheonAt(cand[1].x, cand[1].z)?.ad ?? 0;
      if (db > da) cand.reverse();
      for (const { x, z } of cand) {
        const b = parkBlocked(x, z, q.nx, q.nz, r) || (nearPlaced(x, z, CLEAR.dup) || nearPark(x, z, PARK.dup) ? 'dup' : null);
        if (b) { last = b; continue; }
        accept({ x, z, yaw: yawOf(q.nx, q.nz), kind: 3, src: 'park', cls: 'tancheon-' + r.k });
        parkGrid.add({ x0: x, x1: x, z0: z, z1: z }, parkPts.length); parkPts.push([x, z]);
        parkBy[r.k] = (parkBy[r.k] || 0) + 1; parkN++; done = true; break;
      }
      if (done || last === 'dup' || last === 'area') break;
    }
    if (!done) why(last);
  }
}

// [pangyo] 4) 광장 데크 위 보행등 — 데크 외곽에서 안쪽으로 inset, 둘레를 따라 sp 간격. 엘리베이터·구멍 근처 · 다른 매스 안은 건너뜀
let deckN = 0;
if (PG) for (const part of deckParts) {
  const o = part.o, n = o.length;
  let area = 0; for (let i = 0; i < n; i++) { const a = o[i], b = o[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const per = []; let tot = 0;
  for (let i = 0; i < n; i++) { const a = o[i], b = o[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > 1e-3) { per.push({ a, b, L, s0: tot }); tot += L; } }
  const elev = (part.elevators || []).map((e) => [e.x, e.z]);
  for (let s = DECK.sp / 2; s < tot; s += DECK.sp) {
    let done = false, last = null;
    for (const d of NUDGE) {
      const ss = (s + d + tot) % tot; let k = 0; while (k < per.length - 1 && per[k].s0 + per[k].L < ss) k++;
      const g = per[k], t = (ss - g.s0) / g.L, tx = (g.b[0] - g.a[0]) / g.L, tz = (g.b[1] - g.a[1]) / g.L;
      let nx = -tz, nz = tx; // 왼쪽 법선. 안쪽 판정은 점 검사로
      const px = g.a[0] + (g.b[0] - g.a[0]) * t, pz = g.a[1] + (g.b[1] - g.a[1]) * t;
      if (!inRing(px + nx * DECK.inset, pz + nz * DECK.inset, o)) { nx = -nx; nz = -nz; }
      const x = px + nx * DECK.inset, z = pz + nz * DECK.inset;
      let b = null;
      if (!inRing(x, z, o) || ringDist(x, z, o) < DECK.inset - 0.3) b = 'deck-edge';
      else if ((part.holes || []).some((h) => inRing(x, z, h) || ringDist(x, z, h) < 1.5)) b = 'deck-hole';
      else if (elev.some(([ex, ez]) => Math.hypot(ex - x, ez - z) < DECK.elev)) b = 'deck-elevator';
      else if (!inRegion(x, z)) b = 'area';
      else if (placed.some((l) => l.kind === 4 && Math.hypot(l.x - x, l.z - z) < DECK.dup)) b = 'dup';
      if (b) { last = b; continue; }
      accept({ x, z, yaw: yawOf(nx, nz), kind: 4, y: part.h, src: 'deck', cls: 'deck' }); deckN++; done = true; break;
    }
    if (!done) why(last);
  }
}

// ---- 출력 ----
if (PG) { // [pangyo] 판교 범위 안만 평면 배열 하나로
  const mine = placed.filter((l) => l.src !== 'seed' && inRegion(l.x, l.z)).sort((a, b) => a.z - b.z || a.x - b.x);
  const lamps = mine.flatMap((l) => [r1(l.x), r1(l.z), r3(((l.yaw % Math.PI) + Math.PI) % Math.PI), l.kind, l.kind === 4 ? r1(l.y) : -1]);
  const by = {}; for (const l of mine) by[l.cls] = (by[l.cls] || 0) + 1;
  const counts = { total: mine.length, osm: mine.filter((l) => l.src === 'osm').length, osmNodes: osmLamps.filter((L) => inRegion(...L.p)).length, road: mine.filter((l) => l.src === 'gen').length, deck: deckN, tancheon: mine.filter((l) => l.kind === 3).length, byClass: by, skipped: reasons };
  if (RG.strip) { // [migeum] 띠 안 옮겨 담은 코리더 가로등 · 범위 안 코리더 가로등(런타임이 건너뛰는 것) 수
    counts.keptStrip = mine.filter((l) => l.src === 'keep').length;
    counts.corridorReplaced = Object.values(readJSON(path.join(ROOT, 'public/corridor/streetlights.json')).cells).reduce((n, a) => { for (let i = 0; i < a.length; i += 4) if (inRegion(a[i], a[i + 1])) n++; return n; }, 0);
  }
  const pgOsm = readJSON(PG_CACHE);
  const spacing = { ...Object.fromEntries(Object.entries(CLASS).map(([k, c]) => [k, c.sp])), ...(RG.deck ? { deck: DECK.sp } : {}) };
  const out = { v: 1, attribution: '© OpenStreetMap contributors (ODbL)', meta: { generated: `scripts/corridor/build-streetlights.mjs --${REGION}`, osm: { query: `data/query_${REGION}_streetlights.overpassql`, osm_base: pgOsm.osm_base, streetLampNodes: counts.osmNodes }, spacing, counts }, boxes: PGB, lamps };
  fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
  console.log(`${REGION} streetlights: ${mine.length} lamps (OSM ${counts.osm}/${counts.osmNodes}, road ${counts.road}, deck ${deckN}, tancheon ${counts.tancheon}) → ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
  console.log('by class', by); console.log('skipped', reasons);
  process.exit(0);
}
const cells = {};
placed.sort((a, b) => a.z - b.z || a.x - b.x);
for (const l of placed) {
  const x = r1(l.x), z = r1(l.z), k = `${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`; // 칸은 반올림한 좌표 기준(런타임과 같게)
  (cells[k] ||= []).push(x, z, r3(l.yaw), l.kind);
}
const sortedCells = Object.fromEntries(Object.keys(cells).sort().map((k) => [k, cells[k]]));
const counts = { total: placed.length, osm: osmUsed, generated: placed.length - osmUsed, osmNodes: osmLamps.length, byClass, tancheon: parkN, tancheonBy: parkBy, tancheonLive: placed.filter((l) => l.kind === 3 && inLive(l.x, l.z)).length, live: placed.filter((l) => inLive(l.x, l.z)).length, skipped: reasons, junctions: junctions.length, cells: Object.keys(cells).length };
const out = { v: 1, cell: CELL, attribution: '© OpenStreetMap contributors (ODbL)', meta: { generated: 'scripts/corridor/build-streetlights.mjs', counts }, cells: sortedCells };
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(`streetlights: ${placed.length} lamps (OSM ${osmUsed}/${osmLamps.length}, generated ${placed.length - osmUsed}, live ${counts.live}) in ${counts.cells} cells → ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
console.log('by class', byClass);
console.log(`tancheon park lamps: ${parkN} (live ${counts.tancheonLive})`, parkBy);
console.log('skipped', reasons);
if (VERBOSE) console.log('junctions', junctions.length);
