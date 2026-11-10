// 경기 9004·1151 을 기존 경부 리본(판교IC–양재)에 붙이고, 서초IC 경유 구간은 경로 좌표로 잇는다.
//   node scripts/corridor/build-gyeongbu-express.mjs [routes.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectLatLon } from '../../src/subway/exits.js';
import { travelSeconds } from '../../src/corridor/gyeongbuSpeed.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srcPath = process.argv[2] || '/home/ubuntu/.cursor/projects/agent-repos-bumpinto-world/uploads/gyeonggi-gyeongbu-routes_fa3c.json';
const C = { lat: 37.3665, lon: 127.10835 };
const r1 = (v) => Math.round(v * 10) / 10;
const road = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gangnam/transit.json'), 'utf8'));
const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const PANGYO = { x0: -250, x1: 1000, z0: -3500, z1: -2500 };
const GANGNAM = { x0: -7500, x1: -6000, z0: -15500, z1: -14000 };
const inBox = (b, x, z) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;

function hit(x, z) {
  let best = null;
  for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1], b = road.pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(px - x, pz - z);
    const s = a[2] + (b[2] - a[2]) * t;
    if (!best || d < best.d) best = { d, s, x: px, z: pz, kind: b[3] };
  }
  return best;
}
function nearestPath(path, lat, lon, from = 0) {
  let bi = from, bd = Infinity;
  for (let i = from; i < path.length; i++) {
    const d = Math.hypot(path[i].lat - lat, path[i].lon - lon);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
function densify(pts, step = 40) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const r1151 = src.routes.find((r) => r.routeName === '1151');
const r9004 = src.routes.find((r) => r.routeName === '9004');
const stopP = r1151.stops.find((s) => s.name.startsWith('판교역.낙생육교'));
const stopG = r1151.stops.find((s) => s.name.startsWith('신분당선강남역'));
const i0 = nearestPath(r1151.path, stopP.lat, stopP.lon);
const i1 = nearestPath(r1151.path, stopG.lat, stopG.lon, i0);
const raw = r1151.path.slice(i0, i1 + 1).map((q) => ({ ...projectLatLon(C, q.lat, q.lon) }));
raw[0] = projectLatLon(C, stopP.lat, stopP.lon);
raw[raw.length - 1] = projectLatLon(C, stopG.lat, stopG.lon);

let join = -1, leave = -1, rejoin = -1, sJoin = 0, sLeave = 0, sRe = 0;
for (let i = 0; i < raw.length; i++) {
  const h = hit(raw[i].x, raw[i].z);
  if (join < 0 && h.d < 40 && h.kind === 'gyeongbu' && h.s > 200) { join = i; sJoin = h.s; continue; }
  if (join >= 0 && leave < 0 && h.d > 80 && h.s > sJoin + 500) { leave = i; sLeave = hit(raw[i - 1].x, raw[i - 1].z).s; continue; }
  if (leave >= 0 && rejoin < 0 && h.d < 50 && h.kind === 'daero' && h.s > 10000) { rejoin = i; sRe = h.s; break; }
}
if (join < 0 || leave < 0 || rejoin < 0) throw new Error(`path split join=${join} leave=${leave} rejoin=${rejoin}`);

const ribbonBetween = (s0, s1) => {
  const out = [];
  for (const p of road.pts) if (p[2] >= s0 - 1 && p[2] <= s1 + 1) out.push({ x: p[0], z: p[1] });
  if (!out.length || Math.hypot(out[0].x - hit(out[0].x, out[0].z).x, 0) > 1) {
    const a = hit(0, 0);
    void a;
  }
  const h0 = road.pts.reduce((b, p) => (!b || Math.abs(p[2] - s0) < Math.abs(b[2] - s0) ? p : b), null);
  const h1 = road.pts.reduce((b, p) => (!b || Math.abs(p[2] - s1) < Math.abs(b[2] - s1) ? p : b), null);
  void h0; void h1;
  return out;
};

const seq = [
  ...densify(raw.slice(0, join + 1), 40).map((p) => ({ ...p, tag: 'approach' })),
  ...ribbonBetween(sJoin, sLeave).map((p) => ({ ...p, tag: 'main' })),
  ...densify(raw.slice(Math.max(0, leave - 1), raw.length), 40).map((p) => ({ ...p, tag: 'spur' })),
];
const pts = [];
for (const p of seq) {
  const prev = pts[pts.length - 1];
  if (prev && Math.hypot(p.x - prev[0], p.z - prev[1]) < 8 && prev[3] === p.tag) continue;
  const s = prev ? r1(prev[2] + Math.hypot(p.x - prev[0], p.z - prev[1])) : 0;
  pts.push([r1(p.x), r1(p.z), s, p.tag]);
}
function chainOf(x, z) {
  let best = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
    const s = a[2] + (b[2] - a[2]) * t;
    if (!best || d < best.d) best = { d, s };
  }
  return best;
}
const mainPts = pts.filter((p) => p[3] === 'main');
const main0 = mainPts[0][2];
const main1 = mainPts[mainPts.length - 1][2];
const lengthM = pts[pts.length - 1][2];
const profile = { main0, main1, ramp: 450, surfaceMs: 13.9, mainlineMs: 120 / 3.6, lengthM, busOff: 5.4 };

function stopsFor(route, fromGangnamNames) {
  const out = [];
  for (const s of route.stops) {
    if (/미정차|경유/.test(s.name)) continue;
    const p = projectLatLon(C, s.lat, s.lon);
    if (!inBox(PANGYO, p.x, p.z) && !inBox(GANGNAM, p.x, p.z)) continue;
    const c = chainOf(p.x, p.z);
    const limit = /강남역/.test(s.name) ? 220 : 120;
    if (!c || c.d > limit) continue;
    out.push({ name: s.name, x: p.x, z: p.z, s: r1(c.s), fromGangnam: fromGangnamNames.test(s.name) });
  }
  const seen = new Set();
  return out.filter((s) => (seen.has(s.name) ? false : seen.add(s.name)));
}

const routes = [r9004, r1151].map((r) => ({
  no: r.routeName,
  timetable: r.timetable,
  stops: stopsFor(r, /강남역/),
}));
const pangyo = routes.flatMap((r) => r.stops.filter((s) => !s.fromGangnam && inBox(PANGYO, s.x, s.z)));
const gangnamStop = routes.find((r) => r.no === '1151').stops.find((s) => s.name.startsWith('신분당선강남역'));
const pangyoStop = pangyo[0];
const eta = travelSeconds(profile, pangyoStop.s, gangnamStop.s);

const out = {
  meta: {
    attribution: src.attribution,
    license: '공공누리 제1유형',
    source: '경기도 버스정보 API (data.go.kr 6410000) 2026-11-08',
    road: '판교IC–양재IC 는 기존 transit.json 경부 리본에 스냅. 양재IC–서초IC–강남대로 는 노선 경로 좌표.',
    speed: 'km/h = m/s * 3.6. 도시 50 km/h(13.9 m/s), 본선 120 km/h(33.333 m/s). 램프 450m smoothstep.',
  },
  main0, main1, ramp: 450, surfaceMs: 13.9, mainlineMs: 120 / 3.6, lengthM,
  lanes: 4, laneM: 3.6, busOff: 5.4, lineOff: 3.6,
  eta: { from: pangyoStop.name, to: gangnamStop.name, seconds: Math.round(eta) },
  pts, routes,
};
const dest = path.join(root, 'public/corridor/gangnam/gyeongbu-express.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log('pts', pts.length, 'len', lengthM, 'main', main0, main1, 'eta', Math.round(eta), 's', pangyoStop.s, gangnamStop.s);
for (const r of routes) console.log(r.no, r.stops.map((s) => s.name).join(' | '));
