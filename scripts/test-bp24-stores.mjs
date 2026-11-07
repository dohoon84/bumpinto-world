// 배치된 BUMP24 마다: 건물에 붙는지, 문 앞 2.4m 안에 차도·벽이 아닌 자리가 있는지, 실내가 풋프린트 안에 있는지, 기본 주소에서 안내가 켜지는지.
import fs from 'fs';
import { bp24DoorInfo, bp24TileKey, prepareJeongjaBp24, resolveBp24 } from '../src/corridor/bp24.js';
import { BP24_PLACEMENTS, bump24AtSpot } from '../src/corridor/bp24Locations.js';
import { bump24StorePrompts } from '../src/bump24game/flag.js';

const root = new URL('../', import.meta.url);
const DOOR_R = 2.4;
const ROAD = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified', 'service', 'primary_link', 'secondary_link', 'trunk_link', 'living_street']);

function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(new URL(rel, root))); } catch { return null; }
}
function merge(a, b) {
  if (!b) return a;
  if (!a) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (Array.isArray(v) && v.length) out[k] = (a[k] || []).concat(v);
  return out;
}
const cache = new Map();
function tileAt(key) {
  if (cache.has(key)) return cache.get(key);
  let j = readJson(`public/corridor/tiles/${key}.json`);
  j = merge(j, readJson(`public/corridor/pangyo/tiles/${key}.json`));
  j = merge(j, readJson(`public/corridor/migeum/tiles/${key}.json`));
  cache.set(key, j);
  return j;
}
function resolveNear(spec) {
  const [tx, tz] = bp24TileKey(spec).split('_').map(Number);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const j = tileAt(`${tx + dx}_${tz + dz}`);
    const st = j ? resolveBp24(spec, j) : null;
    if (st) return { st, roads: j.r || [] };
  }
  return null;
}
function roadClearance(roads, x, z) {
  let d = Infinity;
  for (const r of roads || []) {
    if (!ROAD.has(r.k)) continue;
    const hw = (r.w || 6) / 2;
    for (let i = 1; i < r.p.length; i++) {
      const a = r.p[i - 1], b = r.p[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
      d = Math.min(d, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) - hw);
    }
  }
  return d;
}
function inside(x, z, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) hit = !hit;
  }
  return hit;
}

const jeongja = readJson('public/jeongja.json');
const prepared = prepareJeongjaBp24(jeongja, '');
const jz = new Map(prepared.map((st) => [st.id, st]));
const fail = [];
let checked = 0;

for (const spec of BP24_PLACEMENTS) {
  let st, roads;
  if (spec.world === 'jeongja') {
    st = jz.get(spec.id);
    roads = jeongja.roads;
    if (!st) { fail.push(`${spec.id} 정자 건물에 안 붙음`); continue; }
  } else {
    const hit = resolveNear(spec);
    st = hit?.st;
    roads = hit?.roads || [];
    if (!st) { fail.push(`${spec.id} 타일 ${bp24TileKey(spec)} 에서 안 붙음`); continue; }
  }
  checked++;
  const door = bp24DoorInfo(st);
  const ring = st.colRing;
  let reach = false;
  for (let d = 0.35; d <= 2.2; d += 0.25) {
    const x = door.x - st.b[0] * d, z = door.z - st.b[1] * d;
    if (Math.hypot(x - door.x, z - door.z) > DOOR_R) continue;
    if (ring && inside(x, z, ring)) continue;
    if (roadClearance(roads, x, z) < -1.5) continue;
    reach = true;
    break;
  }
  if (!reach) fail.push(`${spec.id} 문 앞 2.4m 에 인도 없음 (${door.x.toFixed(1)}, ${door.z.toFixed(1)})`);
  if (roadClearance(roads, door.x, door.z) < -0.8) fail.push(`${spec.id} 문이 차도 안쪽 (${door.x.toFixed(1)}, ${door.z.toFixed(1)})`);
  if (ring && !spec.box) {
    for (const [x, z] of [[0.3, 0.3], [st.W - 0.3, 0.3], [0.3, st.D - 0.3], [st.W - 0.3, st.D - 0.3]]) {
      const wx = st.o[0] + st.ax[0] * x + st.b[0] * z, wz = st.o[1] + st.ax[1] * x + st.b[1] * z;
      if (!inside(wx, wz, ring)) { fail.push(`${spec.id} 실내가 건물 밖`); break; }
    }
  }
  if (spec.id === 'seongnam-cityhall') {
    if (bump24StorePrompts(spec.id, '')) fail.push('시청점 안내가 기본 주소에서 켜짐');
    if (!bump24StorePrompts(spec.id, '?bp24=1&bp24game=1')) fail.push('시청점 안내가 ?bp24game=1 에서 꺼짐');
  } else if (!bump24StorePrompts(spec.id, '')) fail.push(`${spec.id} 기본 주소에서 안내가 꺼짐`);
  if (spec.at) {
    const spot = bump24AtSpot(spec.at);
    if (!spot || Math.hypot(spot.x - spec.atX, spot.z - spec.atZ) > 0.1) fail.push(`${spec.id} ?at=${spec.at} 좌표 없음`);
  }
}

if (!bump24AtSpot('bump24-jeongja')) { /* 정자점은 문 좌표를 풀어 둔 뒤에 착지한다 */ }
if (fail.length) {
  console.error(fail.join('\n'));
  console.error(`실패 ${fail.length} / 확인 ${checked} / 배치 ${BP24_PLACEMENTS.length}`);
  process.exit(1);
}
console.log('bp24 stores ok', { placements: BP24_PLACEMENTS.length, checked });
