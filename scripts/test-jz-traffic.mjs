// [jz-traffic] 정자 일반 차량 NPC 테스트: node scripts/test-jz-traffic.mjs
//   플래그(?jzcars)·스폰 수·종류 비율·도로 위 스폰·신호 정지·장시간 고밀도 무겹침·교차로 양보·오토바이 vs 승용차·?jzcars=0 동일성
import './corridor/test/dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Group } from 'three';
import { Taxis } from '../src/entities/taxis.js';
import { JzCars, parseJzCars, mountJzTraffic, mixFor, densityFor, obbGap, deliveryStops } from '../src/entities/jzTraffic.js';
import { KINDS } from '../src/entities/vehicleKinds.js';

const P = (f) => JSON.parse(fs.readFileSync(new URL('../public/' + f, import.meta.url)));
const drive = P('drive.json'), data = P('jeongja.json'), T = P('transit.json'), shops = P('jeongja-shops.json');
const crossings = T.crossings.map((c) => ({ ...c, depth: c.sig ? 2.2 : 1.8 }));
let light = () => 'red';
const transit = { crossings, pedLight: (c) => (c.sig ? light(c) : 'none'), source: { vehicles: () => [] } };
const world = { groundY: null };
const t0 = Date.now(); let pass = 0;
const ok = (name) => { pass++; console.log('  ✓', name); };

// 1) 플래그
assert.deepEqual(parseJzCars(new URLSearchParams('')), { on: true, base: 120 });
assert.equal(parseJzCars(new URLSearchParams('jzcars=0')).on, false);
assert.equal(parseJzCars(new URLSearchParams('jzcars=40')).base, 40);
assert.equal(parseJzCars(new URLSearchParams('jzcars=999')).base, 200);
assert.equal(mountJzTraffic(new Group(), { params: new URLSearchParams('jzcars=0'), drive, data, transit, world }), null);
ok('?jzcars 파싱 · 0 이면 아무것도 만들지 않음');

// 2) 스폰 수(시간대 배수)
const mk = (o = {}) => new JzCars({ drive, data, transit, world, base: 60, hour: () => 15, stops: deliveryStops(shops, data), ...o });
for (const [h, want] of [[15, 60], [12, 69], [18, 78], [3, 27]]) { const s = mk({ hour: () => h }); assert.equal(s.counts().total, want, `hour ${h}`); }
{ const s = mk({ base: 20 }); assert.equal(s.counts().total, 20); }
ok('스폰 수: 기본×시간대 (15시 60 · 12시 69 · 18시 78 · 3시 27)');

// 3) 종류 비율: 모든 종류 등장, 점심엔 배달 오토바이 비율 ↑
const share = (h) => { const m = mixFor(h), tot = m.reduce((a, [, w]) => a + w, 0); return m.find(([k]) => k === 'moto')[1] / tot; };
assert.ok(share(12.5) > 0.3 && share(15) < 0.2 && share(19) > 0.3, 'moto peaks at lunch/dinner');
assert.ok(densityFor(8) > densityFor(15) && densityFor(3) < 0.5);
{
  const s = mk({ base: 150, hour: () => 12.5 }), c = s.counts().byKind;
  for (const k of Object.keys(KINDS)) assert.ok(c[k] > 0 || k === 'cvs' || k === 'scooter', 'kind ' + k);
  assert.ok(c.moto / s.counts().total > 0.25, 'lunch moto share ' + JSON.stringify(c));
  console.log('    12:30 mix', JSON.stringify(c));
}
ok('종류 비율(배달 오토바이 점심·저녁 ↑)');

// 4) 도로 위 스폰(건물 안·차도 밖 아님)
const segs = []; for (const r of data.roads) for (let i = 1; i < r.p.length; i++) segs.push([...r.p[i - 1], ...r.p[i], (r.w || 6) / 2 + 1.0]);
const sd = (x, z, [ax, az, bx, bz]) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); return Math.hypot(x - ax - dx * k, z - az - dz * k); };
const dSeg = (x, z) => { let b = Infinity; for (const s of segs) if (Math.min(s[0], s[2]) - 30 < x && Math.max(s[0], s[2]) + 30 > x && Math.min(s[1], s[3]) - 30 < z && Math.max(s[1], s[3]) + 30 > z) b = Math.min(b, sd(x, z, s) - s[4]); return b; };
const inRing = (x, z, o) => { let c = false; for (let i = 0, j = o.length - 1; i < o.length; j = i++) { const [xi, zi] = o[i], [xj, zj] = o[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const inBld = (x, z) => data.buildings.some((b) => Math.abs(b.o[0][0] - x) < 120 && Math.abs(b.o[0][1] - z) < 120 && inRing(x, z, b.o));
{
  const s = mk({ base: 150 }); let off = 0, bld = 0, n = 0;
  for (let k = 0; k < 3; k++) {
    for (const t of s.list) if (t && !t.parked) { n++; if (dSeg(t.rec.x, t.rec.z) > 0) off++; if (inBld(t.rec.x, t.rec.z)) bld++; }
    for (let i = 0; i < 100; i++) s.update(0.1);
  }
  assert.equal(bld, 0, 'inside building'); assert.ok(off / n < 0.01, `off-road ${off}/${n}`);
}
ok('스폰·주행 위치가 차도 위(건물 안 0)');

// 5) 신호 정지: 보행 신호가 계속 켜져 있으면(차량 정지) 정지선을 넘지 않음
{
  light = () => 'green';
  const s = mk({ base: 120 }); const watch = [];
  for (const t of s.list) if (t && !t.parked) for (const q of t.sigQ) { const stopAt = q.s - ((q.c.depth || 2.2) + 2.3); if (stopAt - (t.s + t.hl) > 3) { watch.push({ t, q, rec: t.rec, stopAt0: stopAt }); break; } }
  assert.ok(watch.length > 10, 'vehicles approaching signals ' + watch.length);
  let viol = 0, checked = 0;
  for (let i = 0; i < 600; i++) {
    s.update(0.1);
    for (const w of watch) { if (w.t.parked || w.t.rec !== w.rec || !w.t.sigQ.includes(w.q)) continue; checked++; const stopAt = w.q.s - ((w.q.c.depth || 2.2) + 2.3); if (w.t.s + w.t.hl > stopAt + 0.3) viol++; }
  }
  assert.ok(checked > 1000); assert.equal(viol, 0, 'ran red');
  light = () => 'red';
}
ok('신호 정지(빨간 차량 신호에서 정지선 앞)');

// 장시간 무겹침 검사 도우미(격자로 이웃만)
function minGap(recs) {
  const G = new Map(); let min = Infinity, pair = null;
  for (const r of recs) { const k = Math.floor(r.x / 12) + ',' + Math.floor(r.z / 12); (G.get(k) || G.set(k, []).get(k)).push(r); }
  for (const r of recs) { const ix = Math.floor(r.x / 12), iz = Math.floor(r.z / 12); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of G.get(ix + i + ',' + (iz + j)) || []) if (o !== r && o.id > r.id) { const g = obbGap(r, o); if (g < min) { min = g; pair = [r, o]; } } }
  return { min, pair };
}
const recsOf = (s, taxis) => {
  const out = [];
  for (const t of s.list) if (t && !t.parked && !t.rec.off) out.push({ ...t.rec, id: 'j' + t.i, kind: t.kind });
  for (const t of taxis?.list || []) if (t.age > 1.5) { const p = t.mesh.position, h = t.mesh.rotation.y; out.push({ x: p.x, z: p.z, hx: Math.sin(h), hz: Math.cos(h), hl: 2.35, hw: 0.9, id: 't' + t.i, kind: 'taxi' }); }
  return out;
};

// 6) 고밀도 장시간: 일반 차량 200대 + 라이브 택시 24대, 신호 주기, 8분 → 외곽 겹침 없음
{
  let clock = 0; light = (c) => ((clock + (c.cl || 0) * 7) % 60 < 25 ? 'green' : 'red');
  const taxis = new Taxis(new Group(), null, { drive, data, transit, world, count: 24 });
  const s = mk({ base: 200, hour: () => 15, taxis }); s.cap = 200;
  let min = Infinity, worst = null, moved = 0;
  for (let i = 0; i < 4800; i++) {
    clock += 0.1; s.update(0.1);
    if (i % 5 === 0) { const r = minGap(recsOf(s, taxis)); if (r.min < min) { min = r.min; worst = r.pair; } }
  }
  for (const t of s.list) if (t && !t.parked && t.age > 100) moved++;
  const st = s.counts();
  console.log(`    고밀도 8분: 활성 ${st.total}, 최소 외곽 간격 ${min.toFixed(3)} m, 되돌림 ${st.reverts}, 양보 ${st.yields}, 막힘 ${st.stuck}, 엇갈림 해소 ${st.deadlocks}, 재배치 ${st.respawns}`, worst && min <= 0 ? worst.map((w) => w.id + ':' + w.kind).join(' vs ') : '');
  assert.ok(min > 0, 'min pairwise footprint gap > 0 (got ' + min + ')');
  assert.ok(st.total > 150, 'still populated');
  light = () => 'red';
}
ok('고밀도 장시간 시뮬: 일반 차량·택시 외곽 겹침 없음');

// 7) 교차로 충돌 처리: 신호 없는 +자 교차로(일방통행 두 길) 고밀도 → 겹침 없음 + 계속 흐름(교착 없음)
const cross = {
  nodes: [[-240, 0], [-60, 0], [0, 0], [60, 0], [0, -240], [0, -60], [0, 60]],
  ways: [{ k: 'primary', w: 7, ow: 1, lanes: 2, n: [0, 1, 2, 3] }, { k: 'primary', w: 7, ow: 1, lanes: 2, n: [4, 5, 2, 6] }],
};
const xdata = { meta: { bboxLocal: { x0: -250, x1: 70, z0: -250, z1: 70 } }, station: { x: 0, z: 0 } };
const xtransit = { crossings: [], pedLight: () => 'none', source: { vehicles: () => [] } };
{
  const s = new JzCars({ drive: cross, data: xdata, transit: xtransit, world, base: 24, hour: () => 15 });
  let min = Infinity, passed = 0; const seen = new Map();
  for (let i = 0; i < 3000; i++) {
    s.update(0.1);
    for (const t of s.list) if (t && !t.parked) { const inX = Math.abs(t.rec.x) < 4 && Math.abs(t.rec.z) < 4; if (inX && !seen.get(t.rec)) passed++; seen.set(t.rec, inX); }
    const r = minGap(recsOf(s)); min = Math.min(min, r.min);
  }
  const st = s.counts();
  console.log(`    교차로 5분: 통과 ${passed}회, 최소 간격 ${min.toFixed(3)} m, 양보 ${st.yields}, 엇갈림 해소 ${st.deadlocks}, 막힘 ${st.stuck}`);
  assert.ok(min > 0, 'intersection overlap ' + min); assert.ok(passed > 120, 'intersection throughput ' + passed); assert.ok(st.yields > 0, 'yielded'); assert.ok(st.stuck === 0 && st.deadlocks <= passed / 4, 'deadlocks ' + st.deadlocks); // 신호 없는 혼잡 교차로: 엇갈려 멈춘 쌍은 3초 뒤 후순위가 서서히 사라짐
}
ok('교차로 점유 양보: 겹침 없음 · 교착 없이 통과');

// 8) 오토바이 vs 승용차: 한 차로 일방통행, 정지 신호 앞에 승용차 → 뒤 배달 오토바이는 차를 통과하지 못하고 뒤에 섬
{
  const road = { nodes: [[-150, 0], [-100, 0], [150, 0]], ways: [{ k: 'secondary', w: 3.3, ow: 1, lanes: 1, n: [0, 1, 2] }] };
  const sig = { x: 40, z: 0, dir: [1, 0], w: 3.3, sig: 1, cl: 1, depth: 2.2 };
  const tr = { crossings: [sig], pedLight: () => 'green', source: { vehicles: () => [] } };
  const s = new JzCars({ drive: road, data: { meta: { bboxLocal: { x0: -200, x1: 200, z0: -40, z1: 40 } }, station: { x: 0, z: 0 } }, transit: tr, world, base: 0, hour: () => 15 });
  s.retarget = () => {}; s.cap = 2; s.mix = [['sedan', 1]]; const car = s._spawnVeh(0, true); s.mix = [['moto', 1]]; const moto = s._spawnVeh(1, true);
  assert.ok(!car.parked && !moto.parked, 'spawned');
  const place = (t, x) => { t.s = x - t.pts[0][0]; t.v = 8; t.age = 1; const r = s._pose(t, t.s, t.lat, null); t.heading = Math.atan2(r.hx, r.hz); s._commit(t, r); };
  place(car, -20); place(moto, -60); s.target = 2;
  let min = Infinity;
  for (let i = 0; i < 400; i++) { s.update(0.1); min = Math.min(min, obbGap(car.rec, moto.rec)); }
  assert.equal(car.kind, 'sedan'); assert.equal(moto.kind, 'moto');
  assert.ok(car.v < 0.05 && moto.v < 0.05, 'both stopped ' + [car.v, moto.v, car.rec.x, moto.rec.x, car.parked, moto.parked, car.pts[0], car.s, car.sigQ.length]);
  assert.ok(car.rec.x + car.hl < 40 - 4.5 + 0.3, 'car before stop line ' + car.rec.x);
  assert.ok(moto.rec.x + moto.hl < car.rec.x - car.hl, 'moto behind car');
  assert.ok(min > 0.5, 'moto never touches car ' + min);
  console.log(`    승용차 앞범퍼 x=${(car.rec.x + car.hl).toFixed(2)} · 오토바이 앞-승용차 뒤 간격 ${(car.rec.x - car.hl - moto.rec.x - moto.hl).toFixed(2)} m`);
}
ok('오토바이 vs 승용차: 뒤에 서고 통과하지 않음');

// 9) ?jzcars=0 = 기존 동작: develop 의 원본 taxis.js 와 택시 궤적이 비트 단위로 같음
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jzorig-'));
  const src = execSync('git show origin/develop:src/entities/taxis.js', { encoding: 'utf8' }).replace("from './taxiModel.js'", `from '${new URL('../src/entities/taxiModel.js', import.meta.url).href}'`).replace("from 'three'", `from '${new URL('../node_modules/three/build/three.module.js', import.meta.url).href}'`);
  fs.writeFileSync(path.join(dir, 'taxis.mjs'), src);
  const { Taxis: Orig } = await import(path.join(dir, 'taxis.mjs'));
  let clock = 0; light = (c) => ((clock + (c.cl || 0) * 7) % 60 < 25 ? 'green' : 'red');
  const a = new Orig(new Group(), null, { drive, data, transit, world, count: 24 });
  const params = new URLSearchParams('jzcars=0');
  const b = new Taxis(new Group(), null, { drive, data, transit, world, count: 24 });
  assert.equal(mountJzTraffic(new Group(), { params, drive, data, transit, world, taxis: b }), null);
  assert.equal(b.guard, undefined); assert.equal(b.extraLimit, undefined);
  for (let i = 0; i < 1200; i++) { clock += 0.1; a.update(0.1); b.update(0.1); }
  for (let i = 0; i < 24; i++) { const p = a.list[i].mesh.position, q = b.list[i].mesh.position; assert.ok(p.x === q.x && p.z === q.z && a.list[i].v === b.list[i].v, 'taxi ' + i); }
  fs.rmSync(dir, { recursive: true, force: true });
  light = () => 'red';
}
ok('?jzcars=0: 택시 궤적이 develop 원본과 동일');

console.log(`jz-traffic: ${pass} 통과 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
