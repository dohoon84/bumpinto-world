// [gangnam-street] OSM bus_stop/platform + 골목 소품을 street.json 으로 굽는다.
//   node scripts/corridor/build-gangnam-street.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OSM = path.join(root, 'data/osm_gangnam_raw.json');
const INDEX = path.join(root, 'public/corridor/gangnam/index.json');
const TRANSIT = path.join(root, 'public/corridor/gangnam/transit.json');
const OUT = path.join(root, 'public/corridor/gangnam/street.json');

const CENTER = { lat: 37.3665, lon: 127.10835 };
const KX = Math.cos((CENTER.lat * Math.PI) / 180) * 111320;
const KZ = 110540;
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;
const proj = (lat, lon) => [r1((lon - CENTER.lon) * KX), r1(-(lat - CENTER.lat) * KZ)];
const hypot = Math.hypot;
const IX = { x: -7144, z: -14531 };


function tidyName(name) {
  let n = String(name || '')
    .replace(/\(중\)/g, '')
    .replace(/지하철\d+호선\.?/g, '')
    .replace(/신분당선\.?/g, '신분당선 ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const exit = n.match(/(강남역|신논현역|역삼역|논현역)\s*\d+번출구[A-Z]?/);
  if (exit) return exit[0].replace(/\s+/g, '');
  if (/신분당선/.test(n) && /강남역/.test(n)) return '신분당선 강남역';
  if (/강남역/.test(n)) return '강남역';
  if (/신논현역/.test(n) || /교보/.test(n)) return '신논현역';
  if (/역삼역/.test(n)) return '역삼역';
  if (/논현역/.test(n)) return '논현역';
  if (/세무서/.test(n)) return '역삼세무서';
  if (/수협|서초지점/.test(n)) return '서초';
  if (/우성아파트/.test(n)) return '아파트사거리';
  if (/아가방|하나은행|빌딩/.test(n)) return '테헤란로';
  return n || '정류장';
}

function hash01(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function projectOn(seq, p) {
  let best = Infinity, pt = seq[0], yaw = 0, tAt = 0, iAt = 0;
  let acc = 0;
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1], b = seq[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
    const q = [a[0] + dx * t, a[1] + dz * t];
    const d = hypot(q[0] - p[0], q[1] - p[1]);
    if (d < best) {
      best = d; pt = q; tAt = t; iAt = i;
      yaw = Math.atan2(dx, dz);
    }
    acc += L;
  }
  return { d: best, pt, yaw };
}

function pointInPoly(x, z, o) {
  let inside = false;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const xi = o[i][0], zi = o[i][1], xj = o[j][0], zj = o[j][1];
    if (((zi > z) !== (zj > z)) && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi)) inside = !inside;
  }
  return inside;
}

const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const box = index.meta.box;
const tiles = Object.keys(index.tiles).sort().map((k) => JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gangnam/tiles', `${k}.json`), 'utf8')));
const roads = [];
const buildings = [];
for (const t of tiles) {
  for (const r of t.r || []) roads.push(r);
  for (const b of t.b || []) if (b.o?.length >= 3) buildings.push(b.o);
}
const avenues = roads.filter((r) => r.n === '강남대로' || r.n === '테헤란로');

function nearestRoad(x, z, list = avenues) {
  let best = null;
  for (const r of list) {
    if (!r.p || r.p.length < 2) continue;
    const hit = projectOn(r.p, [x, z]);
    if (!best || hit.d < best.d) best = { ...hit, road: r };
  }
  return best;
}

function inBuilding(x, z, pad = 1.2) {
  for (const o of buildings) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of o) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1]; }
    if (x < minX - pad || x > maxX + pad || z < minZ - pad || z > maxZ + pad) continue;
    if (pointInPoly(x, z, o)) return true;
  }
  return false;
}

const osm = JSON.parse(fs.readFileSync(OSM, 'utf8'));
const raw = [];
for (const e of osm.elements || []) {
  const t = e.tags || {};
  const hw = t.highway, pt = t.public_transport, am = t.amenity;
  if (!(hw === 'bus_stop' || pt === 'platform' || hw === 'platform')) continue;
  if (am === 'shelter') continue;
  let lat = e.lat, lon = e.lon;
  if (lat == null && e.center) { lat = e.center.lat; lon = e.center.lon; }
  if (lat == null && e.geometry?.length) {
    lat = e.geometry.reduce((s, g) => s + g.lat, 0) / e.geometry.length;
    lon = e.geometry.reduce((s, g) => s + g.lon, 0) / e.geometry.length;
  }
  if (lat == null) continue;
  const [x, z] = proj(lat, lon);
  if (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1) continue;
  const name = t.name || t['name:ko'] || '';
  if (!name) continue;
  raw.push({
    osm: `${e.type}/${e.id}`,
    x: r1(x), z: r1(z), name,
    ref: t.ref || t.local_ref || '',
    routes: String(t.route_ref || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
    way: e.type === 'way',
  });
}

// transit.json 노선 번호를 같은 좌표/ARS 에 합친다 (도착시각은 넣지 않음)
const transit = JSON.parse(fs.readFileSync(TRANSIT, 'utf8'));
const byRef = new Map();
for (const route of transit.routes || []) {
  for (const st of route.stops || []) {
    const id = String(st.arsId || '');
    if (!id) continue;
    if (!byRef.has(id)) byRef.set(id, new Set());
    byRef.get(id).add(String(route.no));
  }
}

raw.sort((a, b) => (a.way - b.way) || a.name.localeCompare(b.name, 'ko'));
const picked = [];
for (const s of raw) {
  if (picked.some((p) => hypot(p.x - s.x, p.z - s.z) < 16 && (p.name.replace('(중)', '') === s.name.replace('(중)', '') || p.ref && p.ref === s.ref))) continue;
  picked.push(s);
}

const BRT = new Set(['22009', '22010', '22011', '22012', '22014']);
const stops = [];
for (const s of picked) {
  const hit = nearestRoad(s.x, s.z);
  if (!hit || hit.d > 42) continue;
  const rn = hit.road.n;
  if (rn !== '강남대로' && rn !== '테헤란로') continue;
  const median = /\(중\)|중앙/.test(s.name) || BRT.has(s.ref);
  let yaw = hit.yaw;
  const nx = Math.sin(yaw + Math.PI / 2), nz = Math.cos(yaw + Math.PI / 2);
  // 길 쪽을 +Z 로: 정류장이 중심선 오른쪽에 있으면 yaw 를 뒤집어 도로를 보게
  const side = (s.x - hit.pt[0]) * nx + (s.z - hit.pt[1]) * nz;
  if (!median && side < 0) yaw += Math.PI;
  if (median) {
    // 중앙섬: 버스 차로를 보도록, 교차로에서 바깥을 보게
    if (s.z < IX.z) yaw = hit.yaw; // 북쪽(신논현) — 도로 접선 유지
    else yaw = hit.yaw + Math.PI;
  }
  const extra = byRef.get(String(s.ref)) || [];
  const routes = [...new Set([...s.routes, ...extra])].filter((n) => /^\d{2,5}$|^[가-힣]{1,2}\d{1,2}$/.test(n)).slice(0, 10);
  let toward = '';
  if (median && rn === '강남대로') {
    if (s.ref === '22009' || s.ref === '22010') toward = '신논현역';
    else if (s.ref === '22011' || s.ref === '22012') toward = '강남역';
    else toward = s.z < IX.z ? '신논현역' : '강남역';
  }
  const display = tidyName(s.name);
  stops.push({
    x: r1(s.x), z: r1(s.z), yaw: r3(yaw),
    kind: median ? 'median' : 'side',
    name: display, raw: s.name, ref: s.ref, road: rn, toward,
    routes, osm: s.osm,
  });
}

// 중앙차로에서 인도로 잇는 횡단 얼룩말
const zebras = [];
for (const s of stops) {
  if (s.kind !== 'median' || s.road !== '강남대로') continue;
  const hit = nearestRoad(s.x, s.z);
  if (!hit) continue;
  const nx = Math.sin(hit.yaw + Math.PI / 2), nz = Math.cos(hit.yaw + Math.PI / 2);
  const half = Math.max(14, (hit.road.w || 28) * 0.48);
  for (const dir of [-1, 1]) {
    const cx = s.x + nx * dir * half * 0.5;
    const cz = s.z + nz * dir * half * 0.5;
    zebras.push([r1(cx), r1(cz), r3(hit.yaw + Math.PI / 2), r1(half - 2.4), 3.2]);
  }
}

// 중앙차로 버스 전용 노면 띠 (짧은 구간)
const paints = [];
for (const s of stops) {
  if (s.kind !== 'median') continue;
  paints.push([s.x, s.z, s.yaw, 18, 1.15]);
}

// 골목 소품 — 강남역 교차로 가까운 골목부터 채운다
const candProps = []; // [kind, x, z, yaw, s]
const candPoles = [];
for (const r of roads) {
  const n = r.n || '';
  if (r.n === '강남대로' || r.n === '테헤란로') continue;
  if ((r.w || 6) > 11 && r.k === 'primary') continue;
  if (!r.p || r.p.length < 2) continue;
  let key = 0;
  for (let i = 1; i < r.p.length; i++) {
    const a = r.p[i - 1], b = r.p[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = hypot(dx, dz);
    if (L < 4) continue;
    const hx = dx / L, hz = dz / L;
    const nx = -hz, nz = hx;
    const step = n.includes('길') ? 11 : 14;
    for (let s = 3; s < L - 3; s += step) {
      key++;
      const x = a[0] + hx * s, z = a[1] + hz * s;
      const side = (hash01((x * 17 + z * 31) | 0) > 0.5 ? 1 : -1);
      const off = (r.w || 5) * 0.38 + 0.7;
      const px = x + nx * side * off, pz = z + nz * side * off;
      if (inBuilding(px, pz, 1.6)) continue;
      if (px < box.x0 + 8 || px > box.x1 - 8 || pz < box.z0 + 8 || pz > box.z1 - 8) continue;
      const yaw = Math.atan2(hx, hz) + (side > 0 ? 0 : Math.PI);
      const h = hash01(((px * 13 + pz * 29 + key) | 0));
      const kind = h < 0.10 ? 0 : h < 0.22 ? 1 : h < 0.40 ? 2 : h < 0.58 ? 3 : h < 0.70 ? 5 : h < 0.82 ? 6 : 4;
      if (kind === 4) candPoles.push([r1(px), r1(pz), r3(yaw)]);
      else candProps.push([kind, r1(px), r1(pz), r3(yaw), r1(0.85 + hash01((key * 19) | 0) * 0.3)]);
    }
  }
}
const nearIx = (x, z) => hypot(x - IX.x, z - IX.z);
candProps.sort((a, b) => nearIx(a[1], a[2]) - nearIx(b[1], b[2]));
candPoles.sort((a, b) => nearIx(a[0], a[1]) - nearIx(b[0], b[1]));
const props = candProps.slice(0, 260);
const poles = candPoles.slice(0, 80);
const wires = [];
for (let i = 0; i < poles.length; i++) {
  let best = -1, bd = 38;
  for (let j = i + 1; j < poles.length; j++) {
    const d = hypot(poles[i][0] - poles[j][0], poles[i][1] - poles[j][1]);
    if (d > 8 && d < bd) { bd = d; best = j; }
  }
  if (best >= 0 && wires.length < 70) wires.push([poles[i][0], poles[i][1], poles[best][0], poles[best][1]]);
}

// 정류장 대기 인원 (벤치에 앉은 자리)
const waiters = [];
for (const s of stops) {
  const n = s.kind === 'median' ? 3 : 2;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
  for (let i = 0; i < n; i++) {
    const lat = (i - (n - 1) / 2) * 0.7;
    waiters.push([r1(s.x - fx * 0.55 + rx * lat), r1(s.z - fz * 0.55 + rz * lat), r3(s.yaw)]);
  }
}

const out = {
  meta: {
    generated: new Date().toISOString(),
    source: 'data/osm_gangnam_raw.json (© OpenStreetMap contributors, ODbL)',
    note: '강남대로·테헤란로 OSM bus_stop/platform. 중앙차로(중) 포함. BIS 화면은 노선 번호만(도착 시각 없음).',
  },
  stops,
  zebras,
  paints,
  props,
  poles,
  wires,
  waiters,
  counts: {
    stops: stops.length,
    median: stops.filter((s) => s.kind === 'median').length,
    side: stops.filter((s) => s.kind === 'side').length,
    zebras: zebras.length,
    paints: paints.length,
    props: props.length,
    poles: poles.length,
    wires: wires.length,
    waiters: waiters.length,
  },
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('[gangnam-street]', out.counts, '→', path.relative(root, OUT), `${(fs.statSync(OUT).size / 1024).toFixed(1)}KB`);
