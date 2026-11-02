// [streams] 탄천 지류 하도 테스트: node scripts/corridor/test/test-streams.mjs
//   - 지류를 켜도 정자 라이브 bbox·지류 밖 높이는 그대로 (?streams=0 과 동일)
//   - 지류 축은 실제로 가라앉고(하상 < 둔치 < 0), 메운 곳(차도·건물)은 0m
//   - 차도(다리 아님)·건물 바닥 높이는 지류 때문에 바뀌지 않음 → 차가 빠지거나 건물이 가라앉지 않음
//   - 지류 위 다리 상판 = 0m (보행자·차 모두), 야탑 터미널↔코오롱 보행교(OSM 380075432) 포함
//   - 합류: 하류 끝 하상이 받는 하천 둔치 높이까지 이어짐 (단차 없음)
//   - 보행교 상판 = OSM 폭 × 3 (옆 다리와 겹치는 곳만 덜), 넓힌 폭 안은 0m 로 걷고 난간 밖은 하천 높이
//   - 징검다리(OSM ford=stepping_stones 1285367004, 여수천): 돌 윗면 = 수면 + 0.14m, 남쪽 둔치 → 북쪽 둔치를 막힘 없이 걸어 건넘
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

// 6) 보행교 폭 3배: 하천 위에서 중심선 ± (폭×1.5 − 0.4) 는 상판, 차도교는 OSM 폭 그대로
const FOOT = new Set(['footway', 'cycleway', 'path', 'pedestrian']);
let wide = 0, footN = 0;
for (const r of br) {
  if (r.deckH == null) continue;
  if (!FOOT.has(r.k)) { assert.equal(r.deckW, r.w, 'car bridge width unchanged'); continue; }
  footN++; assert.ok(r.deckW >= r.w && r.deckW <= r.w * 3 + 1e-9);
  if (r.deckW < r.w * 3 - 0.05) continue; wide++;
  const [a, b] = [r.p[0], r.p[r.p.length - 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
  for (const [x, z] of dens(r.p, 1)) {
    if (on.baseHeight(x, z) > -0.3) continue;
    for (const s of [-1, 1]) {
      const v = s * (r.deckW / 2 - 0.4), px = x + nx * v, pz = z + nz * v;
      if (on.baseHeight(px, pz) > -0.3) continue;
      assert.ok(Math.abs(on.getGroundHeight(px, pz, 0) - r.deckH) < 0.01, `foot deck walkable at ${px.toFixed(1)},${pz.toFixed(1)}`);
    }
  }
}
assert.ok(wide >= footN * 0.6, `widened ${wide}/${footN}`);
assert.equal(yt.deckW, yt.w * 3);
ok(`${wide}/${footN} stream footbridges 3x wide (rest limited by an adjacent bridge), walkable to the parapets; car bridges unchanged`);

// 7) 징검다리
assert.equal(on.fords.length, S.fords.length); assert.ok(S.fords.some((f) => f.osm === 1285367004));
const fd = on.fords.find((f) => f.osm === 1285367004), wy = on.streams.waterAt((fd.ax + fd.bx) / 2, (fd.az + fd.bz) / 2);
assert.ok(fd.stones.length >= 6 && Math.abs(fd.h - wy - 0.14) < 0.01, `stones ${fd.stones.length}, top ${fd.h} vs water ${wy}`);
{
  const [x0, z0, x1, z1] = [1586.25, -5256.5, 1586.4, -5272]; let x = x0, z = z0, y = on.getGroundHeight(x, z, 0), minY = Infinity;
  for (let k = 1; k <= 155; k++) {
    const t = k / 155, nx = x0 + (x1 - x0) * t, nz = z0 + (z1 - z0) * t, ny = on.canMove(x, z, y, nx, nz);
    assert.ok(ny != null, `ford walk blocked at ${nx.toFixed(2)},${nz.toFixed(2)}`); x = nx; z = nz; y = ny; minY = Math.min(minY, y);
  }
  assert.ok(minY >= fd.h - 1e-6, `never below stone tops (${minY.toFixed(2)})`);
  // 돌 줄 옆 1.5m 는 예전처럼 물 (막힘 또는 하상)
  const sx = fd.stones[Math.floor(fd.stones.length / 2)], side = on.getGroundHeight(sx[0] + 1.5, sx[1], fd.h);
  assert.ok(side < fd.h - 0.5, 'beside the stones is still water');
}
ok(`stepping stones ${fd.river} (OSM ${fd.osm}): ${fd.stones.length} stones, top = water + 0.14 m, bank-to-bank walk never drops below the stones`);

// 8) 징검다리 실제 이동 재현 (game.js 와 같은 축별 이동: x 먼저 canMove, 그다음 z). 프레임 dt 1/60·0.1(저사양) 둘 다
//    회귀: 돌 줄 옆으로 비켜서면 '경사면 위면 내려가기 허용' 예외 때문에 물가로 미끄러져 하상(물속)에 갇혔음
{
  const W = fd.h - 0.14, F = -2.5;
  const move = (P, dirX, dirZ, step) => { // game.js 이동 한 프레임
    const L = Math.hypot(dirX, dirZ), nx = P.x + dirX / L * step, nz = P.z + dirZ / L * step; let y;
    if ((y = on.canMove(P.x, P.z, P.y, nx, P.z)) != null) { P.x = nx; P.y = y; }
    if ((y = on.canMove(P.x, P.z, P.y, P.x, nz)) != null) { P.z = nz; P.y = y; }
  };
  const start = (x, z) => ({ x, z, y: on.getGroundHeight(x, z, 0) }); // = __jj.teleport
  const dry = (P) => !(P.y < (on.waterSurface(P.x, P.z) ?? -Infinity) - 0.02);
  for (const dt of [1 / 60, 0.1]) {
    const step = 4.2 * dt;
    for (const [name, x0, z0, dx, dz, zEnd] of [['S→N', 1586.3, -5255.5, 0, -1, -5271], ['N→S', 1586.4, -5273, 0, 1, -5257], ['S→N diagonal', 1587.6, -5256, -0.18, -1, -5271], ['N→S diagonal', 1585.2, -5273, 0.12, 1, -5257]]) {
      // 비스듬히 오면 돌 줄에 올라선 뒤(사람이 하듯) 돌 줄 방향으로 고쳐 걷는다. 비스듬히 계속 밀면 줄 가장자리에서 멈출 뿐 물에 안 빠짐
      const P = start(x0, z0); let minY = Infinity, k = 0, ddx = dx, ddz = dz, pushed = 0;
      for (; k < 4000 && (dz < 0 ? P.z > zEnd : P.z < zEnd); k++) {
        move(P, ddx, ddz, step); minY = Math.min(minY, P.y); assert.ok(dry(P), `${name} dt ${dt}: submerged at ${P.x.toFixed(2)},${P.z.toFixed(2)} y ${P.y}`);
        if (ddx && on.fordAt(P.x, P.z) && P.y === fd.h && ++pushed > 40) { const L = Math.hypot(fd.bx - fd.ax, fd.bz - fd.az); ddx = (fd.bx - fd.ax) / L * -dz; ddz = (fd.bz - fd.az) / L * -dz; }
      }
      assert.ok(dz < 0 ? P.z <= zEnd : P.z >= zEnd, `${name} dt ${dt}: stuck at ${P.x.toFixed(2)},${P.z.toFixed(2)} y ${P.y.toFixed(2)}`);
      assert.ok(Math.abs(P.y - F) < 0.06, `${name}: stepped off onto the far bank (${P.y})`);
      assert.ok(minY >= W - 0.03, `${name}: never below water (${minY.toFixed(2)})`);
    }
    // 돌 위에서 옆으로 비켜서기(오른쪽·왼쪽), 그다음 앞뒤로: 물에 빠지지 않고 계속 움직일 수 있어야
    for (const side of [1, -1]) for (const zs of [-5260.6, -5264.4, -5268.0]) {
      const P = { x: 1586.33, z: zs, y: fd.h };
      for (let k = 0; k < 60; k++) move(P, side, 0, step);
      assert.ok(dry(P), `side ${side} at ${zs}: submerged`);
      for (const [a, b] of [[0, -1], [0, 1], [-side, 0]]) { const P2 = { ...P }; for (let k = 0; k < 400; k++) { move(P2, a, b, step); assert.ok(dry(P2), `after side-step ${side}@${zs} dir ${a},${b}: submerged at ${P2.z.toFixed(2)}`); } }
    }
  }
  // 무작위 걷기 2만 걸음(돌 주변 ±6m): 물속에 안 들어가고, 들른 자리에서 둔치(-2.5m)로 다시 걸어 나갈 길이 늘 있음
  let sd = 3; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const P = start(1586.3, -5257); const visited = [];
  for (let k = 0; k < 20000; k++) {
    const a = rnd() * Math.PI * 2; move(P, Math.cos(a), Math.sin(a), 0.07 + rnd() * 0.35);
    if (Math.hypot(P.x - 1586.3, P.z - 5264.4 * -1) > 9) { P.x = 1586.3; P.z = -5257; P.y = on.getGroundHeight(P.x, P.z, 0); }
    assert.ok(dry(P), `random walk ${k}: submerged at ${P.x.toFixed(2)},${P.z.toFixed(2)} y ${P.y.toFixed(2)}`);
    if (k % 1000 === 0) visited.push({ ...P });
  }
  const escapes = (S) => { // 0.25m 격자 BFS, 8방향, 둔치(평지, y≈F)에 닿으면 성공
    const seen = new Set(), q = [S]; let n = 0;
    while (q.length && n++ < 6000) {
      const c = q.shift(); if (Math.abs(c.y - F) < 0.06 && on.grade(c.x, c.z) < 0.4 && !on.fordAt(c.x, c.z)) return true;
      for (let d = 0; d < 8; d++) { const a = d * Math.PI / 4, N = { ...c }; move(N, Math.cos(a), Math.sin(a), 0.25); const key = Math.round(N.x * 4) + ',' + Math.round(N.z * 4); if (!seen.has(key)) { seen.add(key); q.push(N); } }
    }
    return false;
  };
  for (const v of visited) assert.ok(escapes(v), `no way back to the bank from ${v.x.toFixed(2)},${v.z.toFixed(2)} y ${v.y.toFixed(2)}`);
  // 예전 버전에서 이미 물속에 빠진 플레이어도 걸어 나올 수 있음
  const Q = { x: 1587.6, z: -5262, y: -3.5 }; for (let k = 0; k < 200 && !(Q.y > W); k++) move(Q, -1, 0, 0.07);
  assert.ok(Q.y >= fd.h - 1e-6, `trapped player climbs out onto the stones (y ${Q.y})`);
  ok('stepping stones under real (axis-split) movement: both ways + diagonals at 60/10 fps reach the far bank, side-steps and a 20k random walk never go underwater, always a way back, a trapped player climbs out');
}
console.log(`streams: ${n} passed`);
