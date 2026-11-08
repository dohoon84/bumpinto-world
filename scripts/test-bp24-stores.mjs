// 배치된 BUMP24 마다: 렌더되는 건물 메시 안에 상자가 있는지, 차도·광장과 안 겹치는지, 문이 길을 보는지,
// 문 앞 2.4m 안에 차도·벽이 아닌 자리가 있는지, 기본 주소에서 안내가 켜지는지, 표시 이름에 체인 상호가 없는지.
import fs from 'fs';
import { bp24DoorInfo, bp24ShellWalls, bp24TileKey, prepareJeongjaBp24, resolveBp24 } from '../src/corridor/bp24.js';
import { BP24_PLACEMENTS, bump24AtSpot, cityhallBump24On, corridorPlacements } from '../src/corridor/bp24Locations.js';
import { bump24StorePrompts } from '../src/bump24game/flag.js';
import { assessStore, nearestNamedRoad } from './lib/bp24-mesh.mjs';

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
  const roads = [], parks = [];
  let hit = null;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const j = tileAt(`${tx + dx}_${tz + dz}`);
    if (!j) continue;
    for (const r of j.r || []) roads.push(r);
    for (const p of j.parks || []) parks.push(p);
    if (!hit) {
      const st = resolveBp24(spec, j);
      if (st) hit = { st, bld: j.b[st.bi] };
    }
  }
  if (!hit) return null;
  return { ...hit, roads, parks };
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
const prepared = prepareJeongjaBp24(structuredClone(jeongja), '');
const jz = new Map(prepared.map((st) => [st.id, st]));
const fail = [];
let checked = 0;
const CHAIN = /gs\s*25|gs25|gs\s*24|지에스|씨유|(^|[^A-Za-z])cu([^A-Za-z]|$)|세븐|7\s*-?\s*eleven|7eleven|이마트|emart|미니스톱|미니스탑|mini\s*stop|씨스페이스|c\s*[·.]?\s*space|스토리웨이|365|문방구|까까/i;
const names = new Map();

for (const spec of BP24_PLACEMENTS) {
  if (!spec.name || !spec.name.startsWith('BUMP24 ') || !spec.name.endsWith('점')) fail.push(`${spec.id} 표시 이름 형식 ${spec.name}`);
  if (CHAIN.test(spec.name || '')) fail.push(`${spec.id} 표시 이름에 체인·상호 ${spec.name}`);
  if (names.has(spec.name)) fail.push(`${spec.id} 표시 이름 중복 ${spec.name} = ${names.get(spec.name)}`);
  else names.set(spec.name, spec.id);
  let st, roads, bld, parks;
  if (spec.world === 'jeongja') {
    st = jz.get(spec.id);
    roads = jeongja.roads;
    parks = jeongja.parks || [];
    bld = jeongja.buildings[spec.building];
    if (!st) { fail.push(`${spec.id} 정자 건물에 안 붙음`); continue; }
  } else {
    const hit = resolveNear(spec);
    st = hit?.st;
    roads = hit?.roads || [];
    parks = hit?.parks || [];
    bld = hit?.bld;
    if (!st) { fail.push(`${spec.id} 타일 ${bp24TileKey(spec)} 에서 안 붙음`); continue; }
  }
  if (!spec.box) {
    const mesh = assessStore(st, bld, roads, parks);
    if (!mesh.ok) fail.push(`${spec.id} ${mesh.reasons.join(', ')}`);
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
  if (spec.id === 'jz649') {
    const host = jeongja.buildings[spec.building];
    if (spec.building !== 101 || host?.n !== '백궁프라자2') fail.push(`${spec.id} 호스트가 백궁프라자2(#101)가 아님 #${spec.building} ${host?.n || ''}`);
    if (!st.side) fail.push(`${spec.id} 모서리 옆유리가 없음`);
    const frontOut = [door.x - st.b[0] * 1.6, door.z - st.b[1] * 1.6];
    const sideOut = [
      st.o[0] + st.ax[0] * (st.W + 1.4) + st.b[0] * (st.D / 2),
      st.o[1] + st.ax[1] * (st.W + 1.4) + st.b[1] * (st.D / 2),
    ];
    const rf = nearestNamedRoad(jeongja.roads, frontOut[0], frontOut[1]);
    const rs = nearestNamedRoad(jeongja.roads, sideOut[0], sideOut[1]);
    if (!rf || rf.name !== '정자일로' || rf.d > 18) fail.push(`${spec.id} 앞면이 정자일로를 안 봄 ${rf?.name} ${rf?.d}`);
    if (!rs || rs.name !== '정자일로156번길' || rs.d > 18) fail.push(`${spec.id} 옆면이 이름표 쪽 정자일로156번길을 안 봄 ${rs?.name} ${rs?.d}`);
    let maxZ = -Infinity, minX = Infinity;
    for (const [x, z] of [[0, 0], [st.W, 0], [0, st.D], [st.W, st.D]]) {
      const wx = st.o[0] + st.ax[0] * x + st.b[0] * z, wz = st.o[1] + st.ax[1] * x + st.b[1] * z;
      maxZ = Math.max(maxZ, wz); minX = Math.min(minX, wx);
    }
    if (maxZ < 249 || minX > -196) fail.push(`${spec.id} 가 남서 모서리가 아님 ${minX.toFixed(1)},${maxZ.toFixed(1)}`);
    const doosan = jeongja.buildings.find((bb) => bb?.n === '분당두산타워');
    if (doosan && inside(st.center[0], st.center[1], doosan.o)) fail.push(`${spec.id} 중심이 두산타워 풋프린트에 남음`);
    if (Math.hypot(spec.atX - (-224.4), spec.atZ - 211.9) < 5) fail.push(`${spec.id} 이정·착지 좌표가 옛 공터`);
    if (Math.hypot(door.x - spec.atX, door.z - spec.atZ) > 1.2) fail.push(`${spec.id} 착지가 문에서 멀다`);
    const walls = bp24ShellWalls(st);
    const segD = (x, z, a, b) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
      return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
    };
    const wallD = (x, z) => {
      let d = Infinity;
      for (const w of walls) for (let i = 0; i < w.length; i++) d = Math.min(d, segD(x, z, w[i], w[(i + 1) % w.length]));
      return d;
    };
    if (wallD(-196.3, 251.8) < 0.8) fail.push(`${spec.id} 사선 모서리가 벽으로 남음`);
    if (!st.cornerDoor || Math.hypot(st.cornerDoor[0] + 196.3, st.cornerDoor[1] - 251.8) > 2.2) fail.push(`${spec.id} 모서리 문 트리거가 없음`);
    const southSpan = st.sideZ1 - st.sideZ0;
    const minSouth = st.D - 0.5; // 392135a buildStore 옆 유리 (zb - zf - 0.5)
    if (!(southSpan >= minSouth - 0.05)) fail.push(`${spec.id} 남쪽 유리가 392135a(${minSouth.toFixed(1)}m)보다 좁음 ${southSpan.toFixed(1)}`);
    if (wallD(-198, 229) > 0.5) fail.push(`${spec.id} 매장 북쪽 서쪽 벽에 1층 벽이 없음`);
    if (wallD(-165, 253.4) > 0.5) fail.push(`${spec.id} 매장 동쪽 남쪽 벽에 1층 벽이 없음`);
    const glassBlocked = (x, z, nx, nz) => {
      for (let t = 0.3; t <= 5; t += 0.4) if (wallD(x + nx * t, z + nz * t) < 0.25) return true;
      return false;
    };
    if (glassBlocked(-197.9, 242, -1, 0)) fail.push(`${spec.id} 채움 벽이 서쪽 유리와 겹침`);
    if (glassBlocked(-192, 253.35, 0, 1)) fail.push(`${spec.id} 채움 벽이 남쪽 유리와 겹침`);
    if (wallD(door.x, door.z) < 1.2) fail.push(`${spec.id} 출입문이 1층 벽에 막힘`);
    const glassW = st.sideZ1 - st.sideZ0;
    const interior = (st.interiorZ1 || st.D) - 0.08;
    if (!(st.interiorZ1 >= st.sideZ1 - 0.05) || interior + 0.2 < glassW) fail.push(`${spec.id} 실내가 남쪽 유리(${glassW.toFixed(1)}m)보다 짧음 ${interior.toFixed(1)}`);
    if (st.W !== 18 || st.D !== 11) fail.push(`${spec.id} 상자 크기가 바뀜 ${st.W}x${st.D}`);
    const insideNew = (x, z) => {
      const wx = st.o[0] + st.ax[0] * x + st.b[0] * z, wz = st.o[1] + st.ax[1] * x + st.b[1] * z;
      return inside(wx, wz, st.colRing);
    };
    if (!insideNew(st.W * 0.5, (st.D + st.sideZ1) / 2)) fail.push(`${spec.id} 늘린 실내가 건물 밖`);
    const outX = st.W + (st.sideOut || 0) + 1.2;
    if (insideNew(outX, (st.sideZ0 + st.sideZ1) / 2)) fail.push(`${spec.id} 유리 밖 인도까지 실내 충돌`);
  } else if (st.interiorZ1) fail.push(`${spec.id} 실내 깊이가 바뀜`);
  if (spec.id === 'seongnam-cityhall') {
    if (!cityhallBump24On('')) fail.push('시청점이 기본 주소에서 꺼짐');
    if (cityhallBump24On('?bp24=0') || cityhallBump24On('?bump24=0')) fail.push('?bp24=0 인데 시청점이 켜짐');
    if (cityhallBump24On('?bump24cityhall=0')) fail.push('매장 플래그 0 인데 시청점이 켜짐');
    if (!cityhallBump24On('?bp24=1') || !cityhallBump24On('?bump24cityhall=1')) fail.push('시청점을 다시 켜지 못함');
    if (!corridorPlacements('').some((s) => s.id === spec.id)) fail.push('시청점이 기본 코리더 목록에 없음');
    if (corridorPlacements('?bp24=0').some((s) => s.id === spec.id)) fail.push('?bp24=0 목록에 시청점이 남음');
    if (!bump24StorePrompts(spec.id, '') || !bump24StorePrompts(spec.id, '?bp24=1')) fail.push('켜진 시청점 안내가 기본에서 꺼짐');
    if (!bump24StorePrompts(spec.id, '?bp24game=1') || !bump24StorePrompts(spec.id, '?bp24=1&bp24game=1')) fail.push('시청점 ?bp24game=1 안내가 꺼짐');
    if (bump24StorePrompts(spec.id, '?bp24=0&bp24game=1') || bump24StorePrompts(spec.id, '?bump24cityhall=0&bp24game=1')) fail.push('끈 시청점에 안내가 켜짐');
    const pin = [door.x + 1.6, door.z];
    const board = [
      st.o[0] + st.ax[0] * 0.3 + st.b[0] * -0.95,
      st.o[1] + st.ax[1] * 0.3 + st.b[1] * -0.95,
    ];
    for (const [name, p] of [['문', [door.x, door.z]], ['핀', pin], ['전광판', board]]) {
      if (roadClearance(roads, p[0], p[1]) < -0.4) fail.push(`${spec.id} ${name}이 차도 (${p[0].toFixed(1)},${p[1].toFixed(1)})`);
      if (bld?.o && inside(p[0], p[1], bld.o)) fail.push(`${spec.id} ${name}이 시청 건물 안`);
      for (const pk of parks || []) if (pk?.o && inside(p[0], p[1], pk.o)) fail.push(`${spec.id} ${name}이 광장·공원 안`);
    }
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
