// [corridor] 수내 → 롯데 코리더 버스 데이터: public/corridor/transit.json
//
//   라이브 public/transit.json(정자 bbox)은 건드리지 않는다. 코리더 버스는 정자 bbox 바깥 구간만 다룬다.
//   - 노선 형상: 프로토타입 world/transit.json 의 OSM 노선 형상(route relation 멤버 way). 각 노선은 OSM 원본
//     (osm_merged.json)의 type=route, route=bus relation 과 id·ref 가 같을 때만 '확인됨'(ref 표기).
//     ref 가 없는 relation(예: 고속버스)은 일반 표기('고속버스' 등)로만 보여 준다.
//   - 경로는 정자 bbox 바깥 · 코리더 경계 안 · 상세 타일이 있는 칸 위로만 자르고 150m 미만 조각은 버린다.
//   - 정류장: OSM highway=bus_stop / public_transport=platform 노드 좌표(라이브와 같은 투영)를 그대로 쓴다.
//
//   사용: node scripts/corridor/build-transit.mjs [--proto=../bumpinto-world/public/world/transit.json]
//          [--osm=../bumpinto-world/data/raw/osm_merged.json] [--out=public/corridor/transit.json]
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PROTO = path.resolve(ROOT, arg('proto', '../bumpinto-world/public/world/transit.json'));
const OSM = path.resolve(ROOT, arg('osm', '../bumpinto-world/data/raw/osm_merged.json'));
const OUT = path.resolve(ROOT, arg('out', 'public/corridor/transit.json'));
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const CENTER = { lat: 37.36650, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10;
const proj = (g) => [(g.lon - CENTER.lon) * kx, -(g.lat - CENTER.lat) * kz];

const CI = readJSON(path.join(ROOT, 'public/corridor/index.json'));
const LB = CI.meta.liveBox, B = CI.meta.bounds, TS = CI.meta.tileSize;
const P = readJSON(PROTO);
const els = readJSON(OSM).elements;
const relById = new Map(), nodeById = new Map();
for (const e of els) {
  if (e.type === 'relation' && e.tags?.type === 'route' && e.tags?.route === 'bus') relById.set(e.id, e);
  else if (e.type === 'node') nodeById.set(e.id, e);
}

const inLive = ([x, z], m = 0) => x >= LB.x0 - m && x <= LB.x1 + m && z >= LB.z0 - m && z <= LB.z1 + m;
const inBounds = ([x, z]) => x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1;
const hasTile = ([x, z]) => !!CI.tiles[`${Math.floor(x / TS)}_${Math.floor(z / TS)}`];
const ok = (p) => !inLive(p) && inBounds(p) && hasTile(p);

// ---- 노선 확인 ----
const GENERIC = { express: '고속버스', intercity: '시외버스', M: '광역급행버스', city: '시내버스', village: '마을버스' };
const routes = [], keepRoute = new Map();
let unconfirmed = 0;
for (const r of P.routes) {
  const rel = relById.get(r.id);
  if (!rel || r.geom !== 'osm') { unconfirmed++; continue; }
  const osmRef = rel.tags.ref?.trim();
  const confirmed = !!osmRef && osmRef === r.ref;
  const out = { ...r, paths: [], osmRef: osmRef || null, confirmed };
  if (!confirmed) { out.ref = GENERIC[r.type] || '버스'; out.name = out.ref; out.generic = true; delete out.gbis; }
  keepRoute.set(r.id, out);
}

// ---- 경로 자르기: 선분 단위로 ok 판정(1m 간격 샘플) 후 연속 구간만 ----
function cut(pts) {
  const runs = []; let cur = [];
  const push = (p) => { const l = cur[cur.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 0.05) cur.push([r1(p[0]), r1(p[1])]); };
  const close = () => { if (cur.length > 1) runs.push(cur); cur = []; };
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k <= n; k++) {
      if (k === 0 && i > 1) continue;
      const p = [ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n];
      if (ok(p)) { if (k === 0 || k === n || !cur.length) push(p); } else close();
    }
    if (cur.length && ok(pts[i])) push(pts[i]);
  }
  close();
  return runs;
}
const lenOf = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };
function project(p, x, z) {
  let best = { d: Infinity, s: 0 }, acc = 0;
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best.d) best = { d, s: acc + t * L };
    acc += L;
  }
  return best;
}

// ---- 정류장: OSM 노드 좌표 ----
const stopsAll = new Map();
let stopMoved = 0;
for (const s of P.stops) {
  const n = nodeById.get(s.id); if (!n) continue;
  const [x, z] = proj(n);
  if (Math.hypot(x - s.x, z - s.z) > 1) stopMoved++;
  stopsAll.set(s.id, { ...s, x: r1(x), z: r1(z), osmName: n.tags?.name || null });
}

const paths = [], usedStops = new Set();
for (const p of P.paths) {
  const r = keepRoute.get(p.route); if (!r) continue;
  for (const run of cut(p.pts)) {
    const L = lenOf(run); if (L < 150) continue;
    const stops = [];
    for (const st of p.stops || []) {
      const s = stopsAll.get(st.stop); if (!s || !ok([s.x, s.z])) continue;
      const q = project(run, s.x, s.z);
      if (q.d < 30 && q.s > 8 && q.s < L - 8) stops.push({ stop: s.id, s: Math.round(q.s * 10) / 10 });
    }
    stops.sort((a, b) => a.s - b.s);
    const id = paths.length;
    paths.push({ id, route: r.id, ref: r.ref, pts: run, len: Math.round(L), stops, src: p.id });
    r.paths.push(id);
    for (const st of stops) usedStops.add(st.stop);
  }
}
const outRoutes = [...keepRoute.values()].filter((r) => r.paths.length);
const refs = new Set(outRoutes.filter((r) => r.confirmed).map((r) => r.ref));
// 경로가 지나지 않는 정류장도(정자 bbox 밖·타일 위) 두되, 노선 표시는 OSM route_ref 그대로
const stops = [...stopsAll.values()].filter((s) => ok([s.x, s.z]) && (usedStops.has(s.id) || (s.routes || []).length));
const refTypes = {};
for (const s of stops) for (const ref of s.routes || []) if (P.refTypes?.[ref]) refTypes[ref] = P.refTypes[ref];
for (const r of outRoutes) if (P.refTypes?.[r.ref]) refTypes[r.ref] = P.refTypes[r.ref];

const out = {
  meta: {
    generated: new Date().toISOString(),
    osm_base: P.meta?.osm_base || null,
    note: '버스 위치는 시뮬레이션(실시간 프록시가 응답하면 실제 위치). 노선 번호는 OSM route relation(type=route, route=bus)의 ref 와 일치할 때만 표기.',
    liveBox: LB,
    stats: { protoRoutes: P.routes.length, routes: outRoutes.length, confirmed: outRoutes.filter((r) => r.confirmed).length, generic: outRoutes.filter((r) => !r.confirmed).length, unconfirmedDropped: unconfirmed, paths: paths.length, km: Math.round(paths.reduce((a, p) => a + p.len, 0) / 100) / 10, stops: stops.length, stopsOnPaths: usedStops.size, stopMoved, refs: refs.size },
  },
  routes: outRoutes.map(({ paths: ps, ...r }) => ({ ...r, paths: ps })),
  paths, stops, refTypes,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(JSON.stringify(out.meta.stats), (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
