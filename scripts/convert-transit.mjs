// 버스 노선/정류장/횡단보도/신호 -> public/transit.json
// 입력: data/osm_transit_raw.json (Overpass: route=bus 관계, 정류장, crossing, traffic_signals)
//       data/osm_raw_osmapi.json  (OSM API /map: 도로 그래프 — 노드 id 포함)
//       data/gbis_route_types.json (경기버스정보 인허가 노선 목록에서 확인한 노선 유형)
import fs from 'node:fs';
import { classifyRoute } from '../src/transit/livery.js';

const CENTER = { lat: 37.36650, lon: 127.10835 };
const BBOX = { s: 37.3580, w: 127.1015, n: 37.3720, e: 127.1151 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10;
const proj = (g) => [r1((g.lon - CENTER.lon) * kx), r1(-(g.lat - CENTER.lat) * kz)];
const [X0, Z1] = proj({ lat: BBOX.s, lon: BBOX.w }), [X1, Z0] = proj({ lat: BBOX.n, lon: BBOX.e });
const inBox = ([x, z], m = 0) => x >= X0 - m && x <= X1 + m && z >= Z0 - m && z <= Z1 + m;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const tr = JSON.parse(fs.readFileSync('data/osm_transit_raw.json', 'utf8'));
const base = JSON.parse(fs.readFileSync('data/osm_raw_osmapi.json', 'utf8'));
const gbis = JSON.parse(fs.readFileSync('data/gbis_route_types.json', 'utf8'));
console.log('transit raw', tr.elements.length, 'osm_base', tr.osm3s?.timestamp_osm_base);

// ---------- 노선 유형 ----------
function routeType(ref, name = '', network = '') {
  const cands = gbis.routes[ref] || [];
  const pref = /용인/.test(network + name) ? '4146000000' : '4113000000';
  const hit = cands.find((c) => c.center === pref && (!/마을/.test(network) || c.type === 'village'))
    || cands.find((c) => c.center === '4113000000') || cands.find((c) => c.center === '4146000000') || cands[0];
  if (hit && !/마을/.test(network + name)) return { type: hit.type, src: 'gbis', gbis: `${hit.gbisType} · ${hit.op} · ${hit.from}↔${hit.to}` };
  if (/마을/.test(network + name)) { const v = cands.find((c) => c.type === 'village' && c.center === pref) || cands.find((c) => c.type === 'village'); return { type: 'village', src: v ? 'gbis' : 'osm', gbis: v ? `마을 · ${v.op} · ${v.from}↔${v.to}` : undefined }; }
  const c = classifyRoute({ ref, name, network });
  return { type: c.type, src: 'pattern', why: c.why };
}

// ---------- 도로 그래프 (차도, 일방통행 반영) ----------
const CAR = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'service', 'living_street']);
const ROAD_W = { motorway: 16, trunk: 16, primary: 16, secondary: 12, tertiary: 9, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6, residential: 6, unclassified: 6, living_street: 5, service: 4, footway: 2.2, path: 2, cycleway: 2.2, pedestrian: 5 };
const nodePos = new Map(), adj = new Map(), nodeWays = new Map();
const roadW = (t) => { let w = ROAD_W[t.highway] ?? 4; const l = parseFloat(t.lanes); if (l && w >= 6) w = Math.max(w, l * 3.2); return w; };
for (const e of base.elements) {
  if (e.type !== 'way' || !e.tags?.highway || !e.nodes || !e.geometry) continue;
  const t = e.tags;
  e.nodes.forEach((id, i) => { nodePos.set(id, proj(e.geometry[i])); if (!nodeWays.has(id)) nodeWays.set(id, []); nodeWays.get(id).push({ w: e, i }); });
  if (!CAR.has(t.highway) || t.access === 'no' || (t.tunnel && t.tunnel !== 'no')) continue;
  const ow = t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' || t.highway === 'motorway' ? 1 : t.oneway === '-1' ? -1 : 0;
  const pen = t.highway === 'service' ? 3 : t.highway === 'residential' || t.highway === 'living_street' ? 1.6 : 1;
  for (let i = 1; i < e.nodes.length; i++) {
    const a = e.nodes[i - 1], b = e.nodes[i], L = dist(proj(e.geometry[i - 1]), proj(e.geometry[i])) * pen;
    if (ow >= 0) { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, L]); }
    if (ow <= 0) { if (!adj.has(b)) adj.set(b, []); adj.get(b).push([a, L]); }
  }
}
const graphNodes = [...adj.keys()];
function nearestNode(p, maxD = 120) {
  let best = null, bd = maxD;
  for (const id of graphNodes) { const d = dist(nodePos.get(id), p); if (d < bd) { bd = d; best = id; } }
  return best;
}
function dijkstra(s, t) {
  const D = new Map([[s, 0]]), P = new Map(), done = new Set();
  const heap = [[0, s]];
  while (heap.length) {
    let bi = 0; for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i;
    const [d, u] = heap.splice(bi, 1)[0];
    if (done.has(u)) continue; done.add(u);
    if (u === t) break;
    for (const [v, w] of adj.get(u) || []) { const nd = d + w; if (nd < (D.get(v) ?? Infinity)) { D.set(v, nd); P.set(v, u); heap.push([nd, v]); } }
  }
  if (!D.has(t)) return null;
  const path = [t]; while (path[0] !== s) path.unshift(P.get(path[0]));
  return path.map((id) => nodePos.get(id));
}

// ---------- 경로 유틸 ----------
function chainWays(ways) {
  const chains = []; let cur = null;
  const key = (p) => p[0] + ',' + p[1];
  for (const g of ways) {
    const pts = g.map(proj);
    if (pts.length < 2) continue;
    if (!cur) { cur = { pts: pts.slice(), n: 1 }; chains.push(cur); continue; }
    const end = key(cur.pts[cur.pts.length - 1]), st = key(cur.pts[0]);
    if (end === key(pts[0])) cur.pts.push(...pts.slice(1));
    else if (end === key(pts[pts.length - 1])) cur.pts.push(...pts.reverse().slice(1));
    else if (cur.n === 1 && st === key(pts[0])) { cur.pts.reverse(); cur.pts.push(...pts.slice(1)); }
    else if (cur.n === 1 && st === key(pts[pts.length - 1])) { cur.pts.reverse(); cur.pts.push(...pts.reverse().slice(1)); }
    else { cur = { pts: pts.slice(), n: 0 }; chains.push(cur); }
    cur.n++;
  }
  return chains.map((c) => c.pts);
}
// bbox로 자르기: bbox 안 구간들(경계 교점 포함)
function clipLine(pts) {
  const out = []; let run = null;
  const edgeT = (a, b) => { // a 안 / b 밖 (혹은 반대) -> 경계 교점
    let lo = 0, hi = 1; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2, p = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]; if (inBox(p)) lo = m; else hi = m; }
    return [r1(a[0] + (b[0] - a[0]) * lo), r1(a[1] + (b[1] - a[1]) * lo)];
  };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], inside = inBox(p);
    if (inside) { if (!run) { run = []; if (i > 0) run.push(edgeT(p, pts[i - 1])); out.push(run); } run.push(p); }
    else if (run) { run.push(edgeT(pts[i - 1], p)); run = null; }
  }
  return out;
}
const lineLen = (pts) => pts.reduce((s, p, i) => (i ? s + dist(p, pts[i - 1]) : 0), 0);
const dedupe = (pts) => pts.filter((p, i) => !i || dist(p, pts[i - 1]) > 0.3);
function projectOn(pts, p) { // -> { s, d, side, i }
  let best = { d: Infinity }, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1e-6;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (L * L)));
    const q = [a[0] + dx * t, a[1] + dz * t], d = dist(q, p);
    if (d < best.d) best = { d, s: acc + t * L, side: ((p[0] - q[0]) * -dz + (p[1] - q[1]) * dx) / L, i };
    acc += L;
  }
  return best;
}

// ---------- 정류장 ----------
const stops = [];
for (const e of tr.elements) {
  if (e.type !== 'node') continue;
  const t = e.tags || {};
  if (!(t.highway === 'bus_stop' || (t.public_transport === 'platform' && t.bus === 'yes'))) continue;
  const p = proj(e); if (!inBox(p, -5)) continue;
  stops.push({ id: e.id, name: t.name || '(이름 없음)', ref: t.ref || t.local_ref || '', x: p[0], z: p[1], routes: (t.route_ref || '').split(/[;,']/).map((s) => s.trim()).filter(Boolean), rel: [] });
}

// 정류장 방향: 가장 가까운 차도 구간 방향 + 차도가 있는 쪽(sx,sz: 정류장->차도 단위벡터)
const carSegs = [];
for (const e of base.elements) if (e.type === 'way' && CAR.has(e.tags?.highway) && e.geometry && e.tags.highway !== 'service') {
  const pts = e.geometry.map(proj); for (let i = 1; i < pts.length; i++) if (inBox(pts[i], 50)) carSegs.push([pts[i - 1], pts[i]]);
}
for (const s of stops) {
  let best = null, bd = Infinity;
  for (const [a, b] of carSegs) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((s.x - a[0]) * dx + (s.z - a[1]) * dz) / L2));
    const q = [a[0] + dx * t, a[1] + dz * t], d = dist(q, [s.x, s.z]);
    if (d < bd) { bd = d; best = { q, dx, dz }; }
  }
  if (best) { const L = Math.hypot(best.dx, best.dz) || 1; s.rd = [r1((best.dx / L) * 100) / 100, r1((best.dz / L) * 100) / 100]; const v = [best.q[0] - s.x, best.q[1] - s.z], m = Math.hypot(...v) || 1; s.tr = [r1((v[0] / m) * 100) / 100, r1((v[1] / m) * 100) / 100]; s.rdist = r1(bd); }
}

// ---------- 노선 ----------
const routes = [], paths = [];
for (const r of tr.elements.filter((e) => e.type === 'relation' && e.tags?.route === 'bus')) {
  const t = r.tags, ref = t.ref || '', name = t.name || ref;
  const rt = routeType(ref, name, t.network || '');
  const route = { id: r.id, ref: ref || (t.network === '고속버스' || /고속|~|→/.test(name) ? '고속' : ''), name, network: t.network || '', operator: t.operator || '', ...rt, paths: [] };
  // 이 관계에 소속된 정류장
  for (const m of r.members) if (m.type === 'node' && /stop|platform/.test(m.role || '')) { const s = stops.find((s) => s.id === m.ref); if (s && ref && !s.rel.includes(ref)) s.rel.push(ref); }
  const wayGeoms = r.members.filter((m) => m.type === 'way' && m.geometry && !/platform/.test(m.role || '')).map((m) => m.geometry);
  let lines = [];
  if (wayGeoms.length) {
    lines = chainWays(wayGeoms).flatMap(clipLine);
    route.geom = 'osm';
  } else {
    // 정류장만 있는 관계(1303, 7007-1 등): 정류장 순서대로 도로 그래프 최단경로로 연결 (근사)
    const st = r.members.filter((m) => m.type === 'node' && m.lat).map((m) => proj(m));
    const idx = st.map((p, i) => (inBox(p, 250) ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= 1) {
      const seq = st.slice(Math.max(0, idx[0] - 1), Math.min(st.length, idx[idx.length - 1] + 2));
      let full = [];
      for (let i = 1; i < seq.length; i++) {
        const a = nearestNode(seq[i - 1], 400), b = nearestNode(seq[i], 400);
        const seg = a && b ? dijkstra(a, b) : null;
        if (seg) full.push(...(full.length ? seg.slice(1) : seg));
      }
      lines = clipLine(dedupe(full));
      route.geom = 'routed';
    }
  }
  for (const ln of lines.map(dedupe)) {
    const L = lineLen(ln);
    if (L < 150 || ln.length < 2) continue;
    paths.push({ route: route.id, ref: route.ref, pts: ln, len: r1(L) });
  }
  routes.push(route);
}
// OSM 관계는 있지만 경기버스정보 인허가 목록에서 확인되지 않은 노선(폐선/개편 가능성) -> 시뮬레이션 제외
const UNVERIFIED = new Set(['8110']);
// 같은 노선에서 거의 겹치는 경로(같은 방향 중복)는 제거, 노선당 최대 2개(양방향)
const keep = [];
for (const p of paths.sort((a, b) => b.len - a.len)) {
  const grp = (q) => (q.ref === '고속' || q.ref === '서울to광주' ? 'intercity' : q.ref);
  const same = keep.filter((k) => grp(k) === grp(p));
  if (same.length >= 2 || p.len < 250) continue;
  if (UNVERIFIED.has(p.ref)) continue;
  const dup = same.some((k) => { const s0 = projectOn(k.pts, p.pts[0]), s1 = projectOn(k.pts, p.pts[p.pts.length - 1]); return s0.d < 25 && s1.d < 25 && s1.s > s0.s; });
  if (!dup) keep.push(p);
}
// 경로별 정차 정류장: 진행방향 오른쪽 18m 이내 + 노선 번호가 정류장 route_ref에 있거나(없으면 거리만)
keep.forEach((p, i) => {
  p.id = i;
  const route = routes.find((r) => r.id === p.route);
  route.paths.push(i);
  const intercity = route.type === 'intercity';
  p.stops = []; const cand = [];
  if (intercity) return;
  for (const s of stops) {
    const q = projectOn(p.pts, [s.x, s.z]);
    const listed = s.routes.includes(p.ref) || s.rel.includes(p.ref);
    const pri = s.routes.includes(p.ref) ? 2 : s.rel.includes(p.ref) ? 1 : 0;
    if (q.d < (listed ? 22 : 14) && q.side > 1 && (listed || !s.routes.length)) cand.push({ stop: s.id, s: r1(Math.max(0, q.s - 2)), pri });
  }
  // 60m 이내에 정류장이 몰려 있으면(정자역 07051/07786/07624) route_ref에 명시된 곳 우선 하나만
  for (const c of cand.sort((a, b) => b.pri - a.pri || a.s - b.s)) if (!p.stops.some((k) => Math.abs(k.s - c.s) < 60)) p.stops.push({ stop: c.stop, s: c.s });
  p.stops.sort((a, b) => a.s - b.s);
});
for (const s of stops) { s.routes = [...new Set([...s.routes, ...s.rel])]; delete s.rel; }
// 정류장에 표시될 모든 노선 번호 유형(형상 없는 노선 포함)
const refTypes = {};
for (const ref of new Set(stops.flatMap((s) => s.routes).concat(routes.map((r) => r.ref).filter(Boolean)))) {
  const rr = routes.find((r) => r.ref === ref);
  refTypes[ref] = rr ? { type: rr.type, src: rr.src, gbis: rr.gbis, why: rr.why } : routeType(ref);
}

// ---------- 횡단보도/신호 ----------
const signals = tr.elements.filter((e) => e.type === 'node' && e.tags?.highway === 'traffic_signals').map((e) => ({ id: e.id, p: proj(e) })).filter((s) => inBox(s.p));
const crossings = [];
for (const e of tr.elements) {
  if (e.type !== 'node') continue;
  const t = e.tags || {};
  if (t.highway !== 'crossing' && !t.crossing) continue;
  if (t.crossing === 'no' || t.highway === 'traffic_signals' && !t.crossing) continue;
  const p = proj(e); if (!inBox(p, -3)) continue;
  // 이 노드를 지나는 차도 -> 도로 방향/폭
  const ws = nodeWays.get(e.id) || [];
  const car = ws.find(({ w }) => CAR.has(w.tags.highway)) ;
  let dir, w;
  if (car) {
    const g = car.w.geometry, i = car.i, a = proj(g[Math.max(0, i - 1)]), b = proj(g[Math.min(g.length - 1, i + 1)]);
    dir = [b[0] - a[0], b[1] - a[1]]; w = roadW(car.w.tags);
  } else {
    const foot = ws.find(({ w }) => /footway|path|cycleway/.test(w.tags.highway));
    if (!foot) continue;
    const g = foot.w.geometry, i = foot.i, a = proj(g[Math.max(0, i - 1)]), b = proj(g[Math.min(g.length - 1, i + 1)]);
    dir = [-(b[1] - a[1]), b[0] - a[0]]; w = 8; // 보행로가 가로지르는 방향의 수직 = 도로 방향
  }
  const L = Math.hypot(...dir) || 1; dir = [r1((dir[0] / L) * 100) / 100, r1((dir[1] / L) * 100) / 100];
  const sig = t.crossing === 'traffic_signals' || t.crossing_ref === 'signals' || t['crossing:signals'] === 'yes' || signals.some((s) => dist(s.p, p) < 6);
  crossings.push({ id: e.id, x: p[0], z: p[1], dir, w: r1(w), sig: sig ? 1 : 0, kind: t.crossing || (sig ? 'traffic_signals' : 'uncontrolled'), road: car?.w.tags.name });
}
// 신호 횡단보도 -> 교차로 묶음(45m 이내 union-find) + 도로 방향별 2그룹
const sigC = crossings.filter((c) => c.sig);
const parent = sigC.map((_, i) => i), find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
for (let i = 0; i < sigC.length; i++) for (let j = i + 1; j < sigC.length; j++) if (dist([sigC[i].x, sigC[i].z], [sigC[j].x, sigC[j].z]) < 45) parent[find(i)] = find(j);
const clusters = new Map();
sigC.forEach((c, i) => { const k = find(i); if (!clusters.has(k)) clusters.set(k, []); clusters.get(k).push(c); });
let ci = 0;
for (const list of clusters.values()) {
  const ref = list[0].dir;
  for (const c of list) { c.cl = ci; c.g = Math.abs(c.dir[0] * ref[0] + c.dir[1] * ref[1]) > 0.7 ? 0 : 1; }
  ci++;
}

const out = {
  meta: { osm_base: tr.osm3s?.timestamp_osm_base, generated: new Date().toISOString(), note: '버스 위치는 시뮬레이션. 노선 유형은 경기버스정보(gbis.go.kr) 인허가 노선 목록 기준, 없으면 번호 패턴 추정.' },
  routes: routes.filter((r) => !UNVERIFIED.has(r.ref)).filter((r) => r.paths.length || stops.some((s) => s.routes.includes(r.ref))),
  paths: keep.map(({ route, ref, pts, len, id, stops }) => ({ id, route, ref, pts, len, stops })),
  stops, refTypes, crossings, signals: signals.map((s) => s.p), intersections: ci,
};
fs.writeFileSync('public/transit.json', JSON.stringify(out));
console.log('routes', out.routes.map((r) => `${r.ref || r.name}[${r.type}/${r.src}${r.geom ? '/' + r.geom : ''}] paths=${r.paths.length}`).join(', '));
console.log('paths', out.paths.map((p) => `${p.ref}:${p.len}m stops=${p.stops.length}`).join(' | '));
console.log('stops', stops.length, 'crossings', crossings.length, 'signalized', sigC.length, 'intersections', ci, 'signals', signals.length);
console.log('refTypes', Object.entries(refTypes).map(([k, v]) => `${k}:${v.type}(${v.src})`).join(' '));
console.log((fs.statSync('public/transit.json').size / 1024).toFixed(0) + 'KB');
