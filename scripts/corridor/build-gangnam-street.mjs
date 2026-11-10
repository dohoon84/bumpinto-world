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


const MED_N = 5;
const MED_GAP = 7.2;

function alongRight(st, t) {
  const rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
  return [st.x + rx * t, st.z + rz * t];
}

const modules = [];
const pylons = [];
const platforms = [];
const tactiles = [];
stops.forEach((st, si) => {
  const nMod = st.kind === 'median' ? MED_N : 1;
  const gap = st.kind === 'median' ? MED_GAP : 0;
  const span = (nMod - 1) * gap;
  for (let i = 0; i < nMod; i++) {
    const [x, z] = alongRight(st, -span / 2 + i * gap);
    modules.push({ x: r1(x), z: r1(z), yaw: st.yaw, kind: st.kind, si });
  }
  if (st.kind === 'median') {
    const platLen = span + 8.6;
    platforms.push([st.x, st.z, st.yaw, r1(platLen), 3.1]);
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    tactiles.push([r1(st.x + fx * 1.22), r1(st.z + fz * 1.22), st.yaw, r1(platLen - 0.8), 0.44]);
    for (const end of [-1, 1]) {
      const [x, z] = alongRight(st, end * (span / 2 + 4.7));
      pylons.push({ x: r1(x), z: r1(z), yaw: st.yaw, si });
    }
  }
});

// 중앙차로에서 인도로 잇는 횡단 얼룩말 — 플랫폼 중앙·양 끝, 길을 가로지른다
const zebras = [];
for (const st of stops) {
  if (st.kind !== 'median' || st.road !== '강남대로') continue;
  const hit = nearestRoad(st.x, st.z);
  if (!hit) continue;
  const nx = Math.sin(hit.yaw + Math.PI / 2), nz = Math.cos(hit.yaw + Math.PI / 2);
  const half = Math.max(15, (hit.road.w || 28) * 0.52);
  const span = (MED_N - 1) * MED_GAP;
  for (const along of [-span / 2, 0, span / 2]) {
    const [bx, bz] = alongRight(st, along);
    for (const dir of [-1, 1]) {
      const cx = bx + nx * dir * half * 0.5;
      const cz = bz + nz * dir * half * 0.5;
      // yaw=도로+90° 이면 local X=도로 방향, local Z=횡단 방향
      zebras.push([r1(cx), r1(cz), r3(hit.yaw + Math.PI / 2), 5.2, r1(half - 0.8)]);
    }
  }
}

// 버스전용 적색 차로 — 플랫폼 옆 차로에 길게
const paints = [];
for (const st of stops) {
  if (st.kind !== 'median') continue;
  const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
  const platLen = (MED_N - 1) * MED_GAP + 12;
  paints.push([r1(st.x + fx * 3.55), r1(st.z + fz * 3.55), st.yaw, r1(platLen), 3.35]);
}

// 일반 골목 소품 + 강남역 11번출구 동쪽 먹자골목(92·94·96길, 테헤란로1길)
const ALLEY = new Set(['강남대로92길', '강남대로94길', '강남대로96길', '테헤란로1길']);
const candProps = [];
const candPoles = [];
const shops = [];
const tents = [];
const tables = [];
const stools = [];
const aframes = [];
const strings = [];
const acs = [];
const trash = [];
const bins = [];
const alleyPoles = [];
const extraWires = [];
function wiresPushOnce(a, b) {
  extraWires.push([a[0], a[1], b[0], b[1]]);
}

for (const r of roads) {
  const n = r.n || '';
  if (n === '강남대로' || n === '테헤란로') continue;
  if ((r.w || 6) > 11 && r.k === 'primary') continue;
  if (!r.p || r.p.length < 2) continue;
  const focus = ALLEY.has(n);
  let key = 0;
  let lastAlleyPole = null;
  for (let i = 1; i < r.p.length; i++) {
    const a = r.p[i - 1], b = r.p[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = hypot(dx, dz);
    if (L < 4) continue;
    const hx = dx / L, hz = dz / L;
    const nx = -hz, nz = hx;
    const step = focus ? 5.4 : n.includes('길') ? 12 : 16;
    for (let s = 2.6; s < L - 2.6; s += step) {
      key++;
      const x = a[0] + hx * s, z = a[1] + hz * s;
      if (focus) {
        for (const side of [-1, 1]) {
          const off = (r.w || 5) * 0.46 + 0.32;
          const px = x + nx * side * off, pz = z + nz * side * off;
          if (px < box.x0 + 6 || px > box.x1 - 6 || pz < box.z0 + 6 || pz > box.z1 - 6) continue;
          if (inBuilding(px, pz, 0.55)) continue;
          const faceYaw = Math.atan2(-nx * side, -nz * side);
          const behind = inBuilding(px + nx * side * 1.9, pz + nz * side * 1.9, 0.25);
          const h = hash01(((px * 13 + pz * 29 + key * 7 + side * 3) | 0));
          if (behind && shops.length < 130) {
            const type = h < 0.24 ? 0 : h < 0.5 ? 1 : h < 0.72 ? 2 : 3;
            if (type === 2 && tents.length < 36) {
              tents.push([r1(px - nx * side * 0.25), r1(pz - nz * side * 0.25), r3(faceYaw)]);
            } else {
              shops.push([r1(px), r1(pz), r3(faceYaw), type]);
              if (acs.length < 90) acs.push([r1(px + nx * side * 0.12), r1(pz + nz * side * 0.12), r3(faceYaw)]);
            }
            if ((type === 1 || type === 2) && tables.length < 70) {
              const tx = px - nx * side * 1.45, tz = pz - nz * side * 1.45;
              if (!inBuilding(tx, tz, 0.4)) {
                tables.push([r1(tx), r1(tz), r3(faceYaw)]);
                stools.push([r1(tx + hx * 0.42), r1(tz + hz * 0.42), r3(faceYaw)]);
                stools.push([r1(tx - hx * 0.42), r1(tz - hz * 0.42), r3(faceYaw)]);
              }
            }
            if (aframes.length < 55) {
              aframes.push([r1(px - nx * side * 1.05 + hx * 1.15), r1(pz - nz * side * 1.05 + hz * 1.15), r3(faceYaw)]);
            }
          }
          const h2 = hash01(((px * 19 + pz * 11 + key) | 0));
          if (!inBuilding(px - nx * side * 0.6, pz - nz * side * 0.6, 0.4)) {
            const qx = px - nx * side * 0.55, qz = pz - nz * side * 0.55;
            if (h2 < 0.16 && candProps.length < 400) candProps.push([5, r1(qx), r1(qz), r3(faceYaw), 1]);
            else if (h2 < 0.28 && candProps.length < 400) candProps.push([6, r1(qx + hx * 0.8), r1(qz + hz * 0.8), r3(faceYaw), 1]);
            else if (h2 < 0.4 && trash.length < 40) trash.push([r1(qx + hx * 1.2), r1(qz + hz * 1.2), r3(faceYaw)]);
            else if (h2 < 0.5 && bins.length < 36) bins.push([r1(qx - hx * 0.9), r1(qz - hz * 0.9), r3(faceYaw)]);
          }
        }
        if (key % 2 === 0 && strings.length < 70) {
          const off = (r.w || 5) * 0.48 + 0.15;
          strings.push([r1(x + nx * off), r1(z + nz * off), r1(x - nx * off), r1(z - nz * off)]);
        }
        if (key % 3 === 0) {
          const side = key % 6 === 0 ? 1 : -1;
          const off = (r.w || 5) * 0.46 + 0.25;
          const px = x + nx * side * off, pz = z + nz * side * off;
          if (!inBuilding(px, pz, 0.8)) {
            const pole = [r1(px), r1(pz), r3(Math.atan2(hx, hz))];
            alleyPoles.push(pole);
            if (lastAlleyPole) {
              const d = hypot(pole[0] - lastAlleyPole[0], pole[1] - lastAlleyPole[1]);
              if (d > 7 && d < 36) {
                // 세 가닥은 런타임에서 높이만 달리 복제
                wiresPushOnce(lastAlleyPole, pole);
              }
            }
            lastAlleyPole = pole;
          }
        }
      } else {
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
}

const nearIx = (x, z) => hypot(x - IX.x, z - IX.z);
candProps.sort((a, b) => nearIx(a[1], a[2]) - nearIx(b[1], b[2]));
candPoles.sort((a, b) => nearIx(a[0], a[1]) - nearIx(b[0], b[1]));
const props = candProps.slice(0, 280);
const poles = [...alleyPoles, ...candPoles].slice(0, 110);
const wires = extraWires.slice(0, 80);
for (let i = 0; i < poles.length && wires.length < 120; i++) {
  let best = -1, bd = 34;
  for (let j = i + 1; j < poles.length; j++) {
    const d = hypot(poles[i][0] - poles[j][0], poles[i][1] - poles[j][1]);
    if (d > 8 && d < bd) { bd = d; best = j; }
  }
  if (best >= 0) wires.push([poles[i][0], poles[i][1], poles[best][0], poles[best][1]]);
}

// 대기 인원 — 모듈 벤치에 앉힌다
const waiters = [];
for (const m of modules) {
  const n = m.kind === 'median' ? 3 : 2;
  const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
  const rx = Math.cos(m.yaw), rz = -Math.sin(m.yaw);
  for (let i = 0; i < n; i++) {
    const lat = (i - (n - 1) / 2) * 0.85;
    waiters.push([r1(m.x - fx * 0.52 + rx * lat), r1(m.z - fz * 0.52 + rz * lat), r3(m.yaw)]);
  }
}

// 먹자골목 카메라: 가게가 가장  dense 한 칸
let alleyCam = { x: -7085, z: -14695, yaw: 1.2 };
{
  let best = 0;
  for (let gx = -7140; gx < -6980; gx += 8) {
    for (let gz = -14820; gz < -14570; gz += 8) {
      let c = 0;
      for (const sh of shops) if (Math.abs(sh[0] - gx) < 16 && Math.abs(sh[1] - gz) < 16) c++;
      for (const sh of tents) if (Math.abs(sh[0] - gx) < 16 && Math.abs(sh[1] - gz) < 16) c++;
      if (c > best) { best = c; alleyCam = { x: gx, z: gz, yaw: 1.15, n: c }; }
    }
  }
}

const out = {
  meta: {
    generated: new Date().toISOString(),
    source: 'data/osm_gangnam_raw.json (© OpenStreetMap contributors, ODbL)',
    note: '강남대로·테헤란로 OSM 정류장 + 중앙차로 장대 쉘터. BIS는 노선번호만. 먹자골목은 강남대로92·94·96길·테헤란로1길.',
    box,
    alley: alleyCam,
    alleyRoads: [...ALLEY],
  },
  stops,
  modules,
  pylons,
  platforms,
  tactiles,
  zebras,
  paints,
  props,
  poles,
  wires,
  waiters,
  shops,
  tents,
  tables,
  stools,
  aframes,
  strings,
  acs,
  trash,
  bins,
  counts: {
    stops: stops.length,
    median: stops.filter((s) => s.kind === 'median').length,
    side: stops.filter((s) => s.kind === 'side').length,
    modules: modules.length,
    pylons: pylons.length,
    platforms: platforms.length,
    zebras: zebras.length,
    paints: paints.length,
    props: props.length,
    poles: poles.length,
    wires: wires.length,
    waiters: waiters.length,
    shops: shops.length,
    tents: tents.length,
    tables: tables.length,
    stools: stools.length,
    aframes: aframes.length,
    strings: strings.length,
    acs: acs.length,
    trash: trash.length,
    bins: bins.length,
  },
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('[gangnam-street]', out.counts, 'alleyCam', alleyCam, '→', path.relative(root, OUT), `${(fs.statSync(OUT).size / 1024).toFixed(1)}KB`);
