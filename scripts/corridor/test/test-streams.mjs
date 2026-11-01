// [streams] 탄천 지류 하도 테스트: node scripts/corridor/test/test-streams.mjs
//   - 지류를 켜도 정자 라이브 bbox·지류 밖 높이는 그대로 (?streams=0 과 동일)
//   - 지류 축은 실제로 가라앉고(하상 < 둔치 < 0), 메운 곳(차도·건물)은 0m
//   - 차도(다리 아님)·건물 바닥 높이는 지류 때문에 바뀌지 않음 → 차가 빠지거나 건물이 가라앉지 않음
//   - 지류 위 다리 상판 = 0m (보행자·차 모두), 야탑 터미널↔코오롱 보행교(OSM 380075432) 포함
//   - 합류: 하류 끝 하상이 받는 하천 둔치 높이까지 이어짐 (단차 없음)
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { mergeTancheon } = await import('../../../src/corridor/tancheon.js');
const { createTerrain } = await import('../../../src/world/terrain.js');
const { applyTileCuts } = await import('../../../src/world/streams.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../../../public/' + f, import.meta.url)));
const T = rd('terrain.json'), ext = rd('corridor/tancheon.json'), data = rd('jeongja.json'), idx = rd('corridor/index.json'), S = rd('corridor/streams.json');
let n = 0; const ok = (m) => console.log('  ok', ++n, m);
const CAR = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified', 'service', 'motorway', 'primary_link', 'secondary_link', 'trunk_link', 'motorway_link']);

const M = mergeTancheon(T, ext);
const off = createTerrain(M, data), on = createTerrain({ ...M, streams: S }, data);
assert.equal(off.streams, null); assert.ok(on.streams && on.streams.list.length === S.streams.length);
ok(`${S.streams.length} streams loaded (off → terrain.streams null)`);

// 1) 정자 라이브 bbox: 전수 동일
const lb = idx.meta.liveBox; let cnt = 0, diff = 0;
for (let x = lb.x0; x <= lb.x1; x += 4) for (let z = lb.z0; z <= lb.z1; z += 4) { cnt++; if (on.baseHeight(x, z) !== off.baseHeight(x, z) || on.renderHeight(x, z) !== off.renderHeight(x, z)) diff++; }
assert.equal(diff, 0);
ok(`live bbox ${cnt} samples identical with streams on/off`);

// 2) 지류 단면
for (const s of on.streams.list) {
  let deep = 0, full = 0, dry = 0;
  for (let i = 0; i < s.N; i += 5) {
    if (s.sc[i] < 1 || (s.iE >= 0 && i > s.iE - 30)) continue;
    const [x, z] = s.axis[i]; full++;
    const h = on.baseHeight(x, z); if (h <= s.F[i] - 0.5) deep++;
    const a = s.axis[Math.max(0, i - 1)], b = s.axis[Math.min(s.N - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;
    const tl = s.prof.topL[i] + 1, tr = s.prof.topR[i] + 1;
    if (on.streams.height(x - nx * tl, z - nz * tl) > -0.3 && on.streams.height(x + nx * tr, z + nz * tr) > -0.3) dry++;
  }
  if (!full) continue;
  assert.ok(deep / full > 0.9, `${s.id} channel sunk ${deep}/${full}`);
  assert.ok(dry / full > 0.8, `${s.id} banks back at street ${dry}/${full}`);
  console.log(`     ${s.name || s.id}: D ${s.D}m, ${full} full sections, sunk ${deep}, banks ${dry}${s.iE >= 0 ? `, joins ${s.into} at sample ${s.iE}/${s.N}` : ''}`);
}
ok('stream axes sunk to bed, banks return to street level');

// 3) 합류부: 받는 하천 띠에 들어가는 지점의 지류 하상 ≈ 받는 하천 둔치 (단차 < 0.6m)
for (const s of on.streams.list) {
  if (s.iE < 0) continue;
  const [x, z] = s.axis[s.iE], h = on.baseHeight(x, z), F = s.F[s.iE];
  assert.ok(Math.abs(h - F) < 0.6, `${s.id} confluence step ${h.toFixed(2)} vs ${F.toFixed(2)}`);
  for (let i = Math.max(1, s.iE - 40); i <= s.iE; i++) assert.ok(Math.abs(s.B[i] - s.B[i - 1]) < 0.3, `${s.id} ramp smooth at ${i}`);
}
ok('confluence ramps reach the receiving floor smoothly');

// 4) 타일: 차도(다리 아님)·건물은 지류 영향 없음, 교체 폴리곤 적용
const keys = new Set([...Object.keys(S.tiles), ...S.streams.flatMap((s) => s.axis.filter((_, i) => i % 25 === 0).map(([x, z]) => Object.keys(idx.tiles).find((k) => { const t = idx.tiles[k]; return x >= t.x0 && x < t.x0 + idx.meta.tileSize && z >= t.z0 && z < t.z0 + idx.meta.tileSize; })).filter(Boolean))]);
let carPts = 0, carBad = 0, bPts = 0, bBad = 0, cutT = 0;
const dens = (p, st) => { const o = []; for (let i = 1; i < p.length; i++) { const [a, b] = [p[i - 1], p[i]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / st)); for (let j = 0; j < k; j++) o.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]); } return o; };
for (const key of keys) {
  const f = new URL('../../../public/corridor/tiles/' + key + '.json', import.meta.url); if (!fs.existsSync(f)) continue;
  const t = JSON.parse(fs.readFileSync(f));
  for (const r of t.r) if (CAR.has(r.k) && !r.br && !r.tun) for (const [x, z] of dens(r.p, 2)) { carPts++; if (on.renderHeight(x, z) !== off.renderHeight(x, z)) carBad++; }
  for (const b of t.b) for (const [x, z] of b.o) { bPts++; if (on.baseHeight(x, z) !== off.baseHeight(x, z)) bBad++; }
  if (S.tiles[key]) {
    const before = { floor: t.floor.length, parks: t.parks.length, water: t.water.length };
    applyTileCuts(t, S.tiles[key], 'tile'); cutT++;
    for (const k of Object.keys(before)) assert.ok(t[k].length >= before[k] - (S.tiles[key][k] || []).length);
  }
}
console.log(`     ${keys.size} tiles: car-road points ${carPts} (${carBad} changed), building vertices ${bPts} (${bBad} changed), ${cutT} tiles cut`);
assert.ok(carBad / carPts < 0.002, 'car roads stay at street level');
assert.equal(bBad, 0, 'buildings never sink');
ok('car roads and buildings unaffected; tile polygons replaced');

// 5) 다리: annotate 후 상판 0m, 보행/차량 높이 0
const br = S.bridges.map((r) => ({ ...r, p: r.p.map((p) => p.slice()) }));
on.annotate({ roads: br, water: [], waterLines: [], parks: [] });
let decked = 0, bad = 0;
for (const r of br) {
  if (r.deckH == null) continue; decked++;
  assert.equal(r.deckH, 0);
  for (const [x, z] of dens(r.p, 1)) {
    if (on.baseHeight(x, z) > -0.3) continue;
    const g = on.getGroundHeight(x, z, 0), v = on.getVehicleHeight(x, z, 0);
    if (Math.abs(g) > 0.01 || (CAR.has(r.k) && Math.abs(v) > 0.01)) bad++;
  }
}
assert.equal(bad, 0);
const yt = br.find((r) => r.p.some((p) => Math.hypot(p[0] - 1616.2, p[1] + 5242.2) < 2) && r.p.some((p) => Math.hypot(p[0] - 1613.6, p[1] + 5298) < 2));
assert.ok(yt && yt.deckH === 0, '야탑 터미널↔코오롱 보행교');
ok(`${decked}/${br.length} stream bridges get a 0 m deck (walk/drive height 0 over the channel), incl. 380075432`);
console.log(`streams: ${n} passed`);
