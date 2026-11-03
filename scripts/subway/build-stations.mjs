// [subway] 코리더 역 지상 출입구 데이터 굽기 → src/subway/stationsData.js
//   node scripts/subway/build-stations.mjs        (네트워크 불필요, repo 안 데이터만 읽는다)
//
// 입력 (모두 repo 안, © OpenStreetMap contributors, ODbL)
//   data/osm_subway_corridor.json  Overpass (data/query_subway_corridor.overpassql): 정자~잠실 bbox 의
//                                  railway=subway_entrance · 역/정차 위치 노드 + 그 노드를 가진 노선 relation(멤버 포함)
//   data/osm_subway_routes.json    Overpass (data/query_subway_routes.overpassql): 노선별 정차역 순서 (간이 노선도용)
//   public/jeongja.json            투영 기준점(meta.center), 라이브 정자 영역(bboxLocal)
//   public/corridor/index.json     코리더 역 id·영문명·중심, 렌더링되는 타일 목록
//   public/corridor/tiles/*.json   건물·도로 (출입구 방향·위치 고르기 = 런타임 placeEntrance 와 같은 함수)
//   public/corridor/base.json      탄천 구간 도로 (차도 판정)
//   public/terrain.json · public/corridor/{tancheon,streams}.json
//                                  게임과 같은 지형 → 다리 상판·보행교·하천 계단·제방 (출입구 둘레 CLEAR m 여유)
//   data/osm_subway_entrance_ways.json  Overpass (data/query_subway_entrance_ways.overpassql): 출구 노드에 붙은 계단(highway=steps)
//                                  → 출구 노드에서 계단이 뻗는 방향 = 내려가는 방향 (stairs)
//
// 규칙
//   - 노선은 지어내지 않는다: 역 노드/정차 위치를 stop 멤버로 가진 route relation 의 ref 로만 정한다.
//   - 출구 번호도 지어내지 않는다: subway_entrance 의 ref (없으면 null → '출구' 로만 표시).
//   - 출구는 가장 가까운 역(이름 기준, 모든 역 노드 중) 이 이 역이고 450m 안일 때만 이 역 것으로 본다.
//   - 게임에 그려지는 곳(라이브 정자 영역 또는 코리더 상세 타일이 있는 곳)에 있는 출구만 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { projectLatLon } from '../../src/subway/exits.js';
import { placeEntrance, structureClear, CLEAR } from '../../src/subway/entrance.js';
import { gameTerrain } from './gameTerrain.mjs';
import { LINES, LINE_ORDER, OSM_REF_TO_LINE } from '../../src/subway/lines.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const OUT = path.join(ROOT, 'src/subway/stationsData.js');

// 도훈 요청 (2026-11-03): 지금 게임에 뚫려 있는 역까지만. 장지는 코리더에 그려지지만 요청 목록에 없어 뺀다(한 줄 추가로 켤 수 있음).
export const TARGETS = [
  ['jeongja', '정자'], ['sunae', '수내'], ['seohyeon', '서현'], ['imae', '이매'], ['yatap', '야탑'], ['moran', '모란'],
  ['taepyeong', '태평'], ['gachon', '가천대'], ['bokjeong', '복정'], ['munjeong', '문정'], ['garak', '가락시장'],
  ['songpa', '송파'], ['seokchon', '석촌'], ['jamsil', '잠실'],
];
// 간이 노선도에 쓸 relation (방향 하나, 정차 순서). data/osm_subway_routes.json 에 있는 것
const ROUTE_REL = { suin: 11634611, l8: 17953734, l2: 4729409, l3: 4729445, l9: 2718888, gg: 6462562, shin: 6060963 };

const corr = rd('data/osm_subway_corridor.json').elements;
const routes = rd('data/osm_subway_routes.json').elements;
const jz = rd('public/jeongja.json');
const index = rd('public/corridor/index.json');
const base = rd('public/corridor/base.json');
const center = jz.meta.center;
const live = jz.meta.bboxLocal;
const TS = index.meta.tileSize;

const { terrain } = gameTerrain(ROOT);
const terrainClear = structureClear(terrain);

// 출구 노드에서 시작/끝나는 계단 way → 노드에서 멀어지는 방향 (내려가는 방향)
const stairsOf = new Map();
{
  const ew = rd('data/osm_subway_entrance_ways.json').elements;
  for (const w of ew) {
    if (w.type !== 'way' || w.tags?.highway !== 'steps' || !w.nodes || !w.geometry) continue;
    for (const [end, far] of [[0, w.nodes.length - 1], [w.nodes.length - 1, 0]]) {
      const id = w.nodes[end];
      const a = projectLatLon(center, w.geometry[end].lat, w.geometry[end].lon), b = projectLatLon(center, w.geometry[far].lat, w.geometry[far].lon);
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      if (len > 2 && !stairsOf.has(id)) stairsOf.set(id, { way: w.id, d: [Math.round((dx / len) * 1000) / 1000, Math.round((dz / len) * 1000) / 1000] });
    }
  }
}

const baseName = (s) => String(s || '').replace(/\s*[(（].*$/, '').replace(/역$/, '').trim();
const nodes = new Map(corr.filter((e) => e.type === 'node').map((e) => [e.id, e]));
const rels = corr.filter((e) => e.type === 'relation');
const P = (n) => projectLatLon(center, n.lat, n.lon);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 모든 역 노드·정차 위치 (이름 있는 것)
const anchors = [...nodes.values()].filter((n) => {
  const t = n.tags || {};
  return t.name && (t.railway === 'station' || t.public_transport === 'station' || t.railway === 'stop' || t.public_transport === 'stop_position');
}).map((n) => ({ id: n.id, name: baseName(n.tags.name), ...P(n), n }));

// 렌더링 여부: 라이브 정자 bbox 또는 코리더 상세 타일
const tileKey = (x, z) => Math.floor(x / TS) + '_' + Math.floor(z / TS);
const inLive = (x, z) => x >= live.x0 && x <= live.x1 && z >= live.z0 && z <= live.z1;
const rendered = (x, z) => inLive(x, z) || !!index.tiles[tileKey(x, z)];

// 타일 데이터 (출입구 배치용 isFree · 가까운 큰길)
const tileCache = new Map();
const tile = (k) => {
  if (!tileCache.has(k)) { const f = path.join(ROOT, 'public/corridor/tiles', k + '.json'); tileCache.set(k, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null); }
  return tileCache.get(k);
};
const CAR = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified', 'service', 'motorway', 'primary_link', 'secondary_link', 'trunk_link', 'motorway_link']); // = tileMesh CAR_KINDS
function areaWorld(x, z, R = 120) {
  const keys = new Set();
  for (let dx = -R; dx <= R; dx += R) for (let dz = -R; dz <= R; dz += R) keys.add(tileKey(x + dx, z + dz));
  const roads = [], blds = [];
  const R2 = 90; // 출구 주변만 (placeEntrance 후보는 ±20m 안)
  const nearPts = (pts) => pts.some(([px, pz]) => Math.abs(px - x) < R2 && Math.abs(pz - z) < R2);
  const segNear = (p) => p.some((q, i) => i && Math.min(q[0], p[i - 1][0]) < x + R2 && Math.max(q[0], p[i - 1][0]) > x - R2 && Math.min(q[1], p[i - 1][1]) < z + R2 && Math.max(q[1], p[i - 1][1]) > z - R2);
  for (const k of keys) {
    const t = tile(k); if (!t) continue;
    for (const r of t.r) if (segNear(r.p)) roads.push(r);
    for (const b of t.b) if ((b.mh || 0) < 2.5 && nearPts(b.o)) blds.push(b.o);
  }
  for (const r of base.ch) if (segNear(r.p)) roads.push(r);
  const pip = (px, pz, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) c = !c; } return c; };
  const onRoad = (px, pz) => roads.some((r) => CAR.has(r.k) && r.p.some((p, i) => {
    if (!i) return false; const [ax, az] = r.p[i - 1], [bx, bz] = p, ddx = bx - ax, ddz = bz - az, L2 = ddx * ddx + ddz * ddz || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * ddx + (pz - az) * ddz) / L2));
    return Math.hypot(ax + ddx * t - px, az + ddz * t - pz) < r.w / 2 + 0.6;
  }));
  // 타일의 다리(br) 길 = 보행교·육교·지류 다리: 길 폭 안이면 구조물
  const bridges = roads.filter((r) => r.br);
  const onBridge = (px, pz) => bridges.some((r) => r.p.some((p, i) => {
    if (!i) return false; const [ax, az] = r.p[i - 1], [bx, bz] = p, ddx = bx - ax, ddz = bz - az, L2 = ddx * ddx + ddz * ddz || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * ddx + (pz - az) * ddz) / L2));
    return Math.hypot(ax + ddx * t - px, az + ddz * t - pz) < (r.w || 3) / 2 + 0.3;
  }));
  const blocked = (px, pz, r = 0.2) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([a, b]) => blds.some((o) => pip(px + a, pz + b, o)));
  return { roads, isFree: (px, pz) => !blocked(px, pz) && !onRoad(px, pz), isClear: (px, pz) => terrainClear(px, pz) && !onBridge(px, pz) };
}

const natural = (a, b) => String(a.ref ?? '~').localeCompare(String(b.ref ?? '~'), 'en', { numeric: true });
const routeStops = new Map();
{
  const rn = new Map(routes.filter((e) => e.type === 'node').map((e) => [e.id, e]));
  for (const r of routes.filter((e) => e.type === 'relation')) {
    const stops = [];
    for (const m of r.members) if (m.type === 'node' && m.role.startsWith('stop') && rn.has(m.ref)) { const n = baseName(rn.get(m.ref).tags?.name); if (n && stops[stops.length - 1] !== n) stops.push(n); }
    routeStops.set(r.id, { name: r.tags.name, stops, circle: r.tags.name.includes('순환') });
  }
}
function routeWindow(line, name, k = 5) {
  const rid = ROUTE_REL[line]; const R = routeStops.get(rid);
  if (!R) throw new Error(`route ${line}/${rid} missing`);
  let st = R.stops.slice(); if (R.circle && st[0] === st[st.length - 1]) st.pop();
  const i = st.indexOf(name); if (i < 0) throw new Error(`${name} not on ${R.name}`);
  const out = [];
  for (let d = -k; d <= k; d++) { const j = i + d; if (R.circle) out.push(st[(j + st.length) % st.length]); else if (j >= 0 && j < st.length) out.push(st[j]); }
  return { rel: rid, relName: R.name, stops: out };
}

const report = { stations: [], skipped: [], droppedExits: [] };
const stations = [];
for (const [id, name] of TARGETS) {
  const ix = index.stations.find((s) => s.id === id);
  const ref0 = id === 'jeongja' ? { x: 0, z: 0 } : { x: ix.x, z: ix.z };
  const own = anchors.filter((a) => a.name === name && dist(a, ref0) < 1200);
  if (!own.length) { report.skipped.push({ id, name, why: 'OSM 역 노드 없음' }); continue; }
  const ownIds = new Set(own.map((a) => a.id));
  // 노선: 이 역의 노드를 stop 멤버로 가진 route relation
  const lineSet = new Map();
  for (const r of rels) {
    if (!/^(subway|train|light_rail)$/.test(r.tags.route)) continue;
    if (!r.members.some((m) => m.type === 'node' && m.role.startsWith('stop') && ownIds.has(m.ref))) continue;
    if (!r.tags.ref && /KTX|SRT/.test(r.tags.name || '')) continue; // 고속철 (지하철 출입구와 무관)
    const key = OSM_REF_TO_LINE[r.tags.ref];
    if (!key) throw new Error(`unknown line ref ${r.tags.ref} (${r.tags.name}) at ${name}`);
    if (!lineSet.has(key)) lineSet.set(key, { rels: [], colour: r.tags.colour || null });
    lineSet.get(key).rels.push(r.id);
  }
  const lines = LINE_ORDER.filter((k) => lineSet.has(k));
  // 출구
  const exits = [];
  for (const n of nodes.values()) {
    if (n.tags?.railway !== 'subway_entrance') continue;
    const p = P(n);
    let best = null; for (const a of anchors) { const d = dist(a, p); if (!best || d < best.d) best = { a, d }; }
    if (!best || best.a.name !== name || best.d > 450) continue;
    const ref = n.tags.ref == null || n.tags.ref === '' ? null : String(n.tags.ref);
    if (ref == null && n.tags.highway === 'elevator') { report.droppedExits.push({ station: name, ref, osm: n.id, why: '번호 없는 엘리베이터 (출구 아님)' }); continue; }
    if (!rendered(p.x, p.z)) { report.droppedExits.push({ station: name, ref, osm: n.id, why: '게임에 그려지지 않는 곳' }); continue; }
    const sw = stairsOf.get(n.id);
    exits.push({ ref, osm: n.id, lat: n.lat, lon: n.lon, x: p.x, z: p.z, ...(sw ? { stairs: sw.d, stairsWay: sw.way } : {}) });
  }
  exits.sort(natural);
  if (!exits.length) { report.skipped.push({ id, name, why: '렌더링 영역 안 출구 없음' }); continue; }
  const st = id === 'jeongja' ? { x: 0, z: 0 } : { x: ix.x, z: ix.z };
  // 코리더 역: 출입구 방향·위치를 미리 정한다 (런타임엔 타일이 아직 안 불렸을 수 있음). 정자는 런타임(기존 그대로)
  if (id !== 'jeongja') {
    for (const e of exits) {
      const W = areaWorld(e.x, e.z);
      let p = placeEntrance(e, { roads: W.roads, station: st, isFree: W.isFree, isClear: W.isClear });
      // 자리가 없으면 (OSM 점이 건물 footprint·차도 안, 구조물에 붙음 (지하상가·역 건물 안 출구 등) → 가장 가까운 빈 보도까지 최대 18m 옮겨 본다
      if (!p.ok) { const q = placeEntrance(e, { roads: W.roads, station: st, isFree: W.isFree, isClear: W.isClear, radii: [14, 16, 18] }); if ((q.ok && !p.ok) || q.score < p.score) p = q; }
      // 그래도 출입구 자리 대부분이 건물 안이면 = 실내(역사·상가 건물 안) 출구 → 지상 출입구를 그리지 않는다 (위치를 지어내지 않음)
      if (p.bad > 30) { e.indoor = true; report.droppedExits.push({ station: name, ref: e.ref, osm: e.osm, why: `OSM 위치가 건물 footprint 안 (실내 출구, 18m 안에 빈 보도 없음 bad=${p.bad})` }); continue; }
      e.place = { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, ry: Math.round(p.ry * 1000) / 1000, shift: Math.round(p.shift * 10) / 10, bad: p.bad, ...(p.clr ? { clr: p.clr } : {}), ...(p.front ? { front: p.front } : {}) };
    }
  }
  const shown = exits.filter((e) => !e.indoor);
  if (!shown.length) { report.skipped.push({ id, name, why: '지상에 그릴 수 있는 출구 없음' }); continue; }
  const prim = lines[0];
  const route = routeWindow(prim, name);
  stations.push({
    id, name, nameEn: id === 'jeongja' ? 'Jeongja' : ix.nameEn, x: st.x, z: st.z,
    osmStations: own.filter((a) => a.n.tags.railway === 'station' || a.n.tags.public_transport === 'station').map((a) => a.id),
    lines, osmLineColours: Object.fromEntries(lines.map((k) => [k, lineSet.get(k).colour])), osmRoutes: Object.fromEntries(lines.map((k) => [k, lineSet.get(k).rels.sort((a, b) => a - b)])),
    route: { line: prim, rel: route.rel, stops: route.stops },
    exits: shown.map(({ x, z, ...e }) => e),
  });
  report.stations.push({ id, name, lines: lines.map((k) => LINES[k].ko), exits: shown.map((e) => e.ref ?? '·').join(','), maxShift: Math.max(0, ...shown.map((e) => e.place?.shift || 0)), bad: shown.filter((e) => e.place?.bad).map((e) => `${e.ref}:${e.place.bad}`), clr: shown.filter((e) => e.place?.clr || e.place?.front).map((e) => `${e.ref}:${e.place.clr || 0}/${e.place.front || 0}`) });
}

const meta = { generated: new Date().toISOString().slice(0, 10), source: 'OpenStreetMap (© OpenStreetMap contributors, ODbL) via Overpass · data/osm_subway_corridor.json, data/osm_subway_routes.json', osmBase: rd('data/osm_subway_corridor.json').osm3s?.timestamp_osm_base };
const js = `// [subway] 생성 파일 — 손으로 고치지 말 것. node scripts/subway/build-stations.mjs
//   ${meta.source}
//   OSM 기준 시각 ${meta.osmBase} · 생성 ${meta.generated}
//   lines: 이 역의 노드를 stop 멤버로 가진 route relation 의 ref 로 정함 (osmRoutes 에 relation id)
//   exits: railway=subway_entrance (ref = 출구 번호, 없으면 null). place = 코리더 타일 건물·도로로 미리 고른 출입구 위치·방향
//   route: 간이 노선도 (주 노선 relation 의 정차 순서, 이 역 앞뒤 5역)
export const STATIONS_META = ${JSON.stringify(meta)};
export const STATIONS = ${JSON.stringify(stations, null, 1).replace(/\n\s*(?=[\]}\d"-])/g, ' ').replace(/\[\s+/g, '[')};
`;
fs.writeFileSync(OUT, js);
console.log(JSON.stringify(report, null, 1));
console.log('wrote', path.relative(ROOT, OUT), (js.length / 1024).toFixed(1) + ' KB');
