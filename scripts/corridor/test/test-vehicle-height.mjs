// [vehicle-h] 차량 높이(getVehicleHeight) 테스트: node scripts/corridor/test/test-vehicle-height.mjs
//   - 정자+코리더 탄천의 모든 차도 다리(상판 h=0)를 차선 5개 위치 × 양방향으로 0.5m 간격 주행:
//       한 걸음 하강 ≤ 0.5m, 상판 위에서는 상판 높이 아래로 내려가지 않음
//   - 보행자(getGroundHeight)는 예전과 똑같이 다리 밑 둔치(-6m)를 걸을 수 있음, 둔치를 달리는 차도 다리 밑에 그대로
//   - 평지(지형 0m)에서는 차량 높이 = 보행자 높이(정자 평지 도로 동작 그대로)
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { mergeTancheon } = await import('../../../src/corridor/tancheon.js');
const { createTerrain } = await import('../../../src/world/terrain.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../../../public/' + f, import.meta.url)));
const T = rd('terrain.json'), ext = rd('corridor/tancheon.json'), data = rd('jeongja.json'), base = rd('corridor/base.json');
const terr = createTerrain(mergeTancheon(T, ext), data);
terr.annotate(data);
terr.annotate({ roads: base.ch.map((r) => ({ ...r, p: r.p.map((p) => p.slice()) })), water: [], waterLines: [], parks: [] });
const CAR = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street)(_link)?$/;
const roads = [...new Set(terr.decks.map((d) => d.road).filter((r) => r && CAR.test(r.k) && r.deckH === 0))];
assert.ok(roads.length >= 15, `차도 다리 ${roads.length}`);
const dense = (pts, step) => { const o = []; for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) o.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, (bx - ax) / L, (bz - az) / L]); }
  // 꺾이는 점 근처(±3m)는 방향을 부드럽게 섞음(차는 모서리에서 옆으로 순간이동하지 않음)
  const sm = o.map((q, i) => { let sx = 0, sz = 0; for (let j = Math.max(0, i - 6); j <= Math.min(o.length - 1, i + 6); j++) { sx += o[j][2]; sz += o[j][3]; } const l = Math.hypot(sx, sz) || 1; return [q[0], q[1], sx / l, sz / l]; }); o.length = 0; o.push(...sm); const l = o.at(-1); o.push([pts.at(-1)[0], pts.at(-1)[1], l[2], l[3]]); return o; };
function drive(fn, r, lane, rev) {
  let p = r.p.map((q) => [q[0], q[1]]); if (rev) p = p.reverse();
  const a = p[0], b = p.at(-1), da = [p[1][0] - a[0], p[1][1] - a[1]], db = [b[0] - p.at(-2)[0], b[1] - p.at(-2)[1]];
  const la = Math.hypot(...da), lb = Math.hypot(...db), APP = 35;
  // 끝이 땅(제방·평지) 위면 그 방향으로 35m 더 달림. 끝이 강 위(다음 다리 way 로 이어지는 데이터 경계)면 연장 없음 — 그 way 는 따로 주행
  const land = (q) => terr.baseHeight(q[0], q[1]) > -0.5;
  p = [...(land(a) ? [[a[0] - (da[0] / la) * APP, a[1] - (da[1] / la) * APP]] : []), ...p, ...(land(b) ? [[b[0] + (db[0] / lb) * APP, b[1] + (db[1] / lb) * APP]] : [])];
  let y = 0, maxDrop = 0, under = 0, onDeck = 0;
  for (const [x0, z0, dx, dz] of dense(p, 0.5)) {
    const x = x0 - dz * lane, z = z0 + dx * lane; // 진행 방향 오른쪽 +
    const ny = fn(x, z, y); if (process.env.VHDBG && fn === terr.getVehicleHeight && y - ny > 0.5) console.log('drop', r.n || r.k, x.toFixed(1), z.toFixed(1), y.toFixed(2), '→', ny.toFixed(2), 'base', terr.baseHeight(x, z).toFixed(2)); maxDrop = Math.max(maxDrop, y - ny); y = ny;
    const d = terr.deckAt(x, z); if (d && d.h > -0.05) { onDeck++; if (y < d.h - 0.01) under++; }
  }
  return { maxDrop, under, onDeck };
}
// 차선: 가운데·안쪽·연석(w/2-1.2, 차가 길가에 서는 최대 옆 거리) 양쪽 = 5곳
const lanes = (w) => { const c = Math.max(0, w / 2 - 1.2); return [-c, -c / 2, 0, c / 2, c]; };
let worst = { maxDrop: 0 }, runs = 0, oldBad = 0;
for (const r of roads) for (const lane of lanes(r.w)) for (const rev of [false, true]) {
  const v = drive(terr.getVehicleHeight, r, lane, rev), o = drive(terr.getGroundHeight, r, lane, rev); runs++;
  if (o.maxDrop > 0.5 || o.under) oldBad++;
  if (v.maxDrop > worst.maxDrop) worst = { ...v, name: r.n || r.k, lane: +lane.toFixed(1), rev };
  assert.ok(v.maxDrop <= 0.5, `${r.n || r.k} lane ${lane.toFixed(1)} ${rev ? '←' : '→'}: 하강 ${v.maxDrop.toFixed(2)}m`);
  assert.equal(v.under, 0, `${r.n || r.k} lane ${lane.toFixed(1)}: 상판 아래로 ${v.under}칸`);
}
console.log(`  차도 다리 ${roads.length}개 × 차선 5 × 양방향 = ${runs}회 주행: 최대 하강 ${worst.maxDrop.toFixed(3)}m (${worst.name}, lane ${worst.lane}) · 상판 아래 0칸`);
console.log(`  (비교) 보행자 높이로 달렸으면 ${oldBad}/${runs}회가 빠지거나 상판 아래로 내려감`);
assert.ok(oldBad > 0, '예전 동작 재현(테스트가 실제로 잡아내는지)');

// 다리 밑: 보행자는 둔치에 그대로, 둔치를 달리던 차도 그대로
let unders = 0;
for (const d of terr.decks) {
  if (!(d.h > -0.05) || !d.road || !CAR.test(d.road.k)) continue;
  for (let t = 0.1; t <= 0.9; t += 0.1) {
    const x = d.ax + (d.bx - d.ax) * t, z = d.az + (d.bz - d.az) * t, b = terr.baseHeight(x, z);
    if (b > terr.params.FLOOR + 0.01 || b < terr.params.FLOOR - 0.01) continue; // 둔치 바닥만
    unders++;
    assert.ok(Math.abs(terr.getGroundHeight(x, z, b) - b) < 1e-6, '보행자: 다리 밑 둔치');
    // 둔치 차량: 위 상판(0m)으로 올라가지 않고 둔치에 그대로(둔치 높이의 낮은 다리(-5.6m) 한 걸음 0.6m 이내는 허용)
    const vh = terr.getVehicleHeight(x, z, b); assert.ok(vh >= b - 1e-6 && vh <= b + 0.6 && vh < d.h - 5, `둔치 차량: 다리 밑 그대로 ${vh}`);
    assert.ok(Math.abs(terr.getGroundHeight(x, z, 0) - d.h) < 1e-6, '보행자: 다리 위');
    const nx = x + 0.5 * (d.bz - d.az) / Math.hypot(d.bx - d.ax, d.bz - d.az), nz = z - 0.5 * (d.bx - d.ax) / Math.hypot(d.bx - d.ax, d.bz - d.az);
    const m = terr.canMove(x, z, b, nx, nz); if (m != null) assert.ok(m < -5, '보행자: 다리 밑에서 옆으로 걸어도 둔치');
  }
}
assert.ok(unders >= 20, `다리 밑 점 ${unders}`);
console.log(`  다리 밑 둔치 ${unders}점: 보행자·둔치 차량 모두 둔치 높이 유지, 다리 위 보행자는 상판`);

// 평지: 차량 = 보행자
let flat = 0;
for (let x = -600; x <= 600; x += 7) for (let z = -600; z <= 940; z += 7) { const g = terr.getGroundHeight(x, z, 0); if (g === 0) { flat++; assert.equal(terr.getVehicleHeight(x, z, 0), 0); } }
console.log(`  정자 평지 ${flat}점: 차량 높이 = 보행자 높이(0m)`);
console.log('test-vehicle-height: ok');
