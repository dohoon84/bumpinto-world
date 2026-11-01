// [superbike] 슈퍼바이크 RR: 가속(0→100 km/h)·최고 속도·서브스텝·엔진음 곡선(기어 루프)·윌리·카탈로그·음원 파일
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { superbikeThrottle, SB_DRIVE, SUPERBIKE_GIFT } from '../../../src/entities/superbike/superbike.js';
import { SB, createSuperbikeModel } from '../../../src/entities/superbike/superbikeModel.js';
import { gearOf, rideRate, rideMix, rideGain, rideLayer, SB_GEARS, SB_LAYERS } from '../../../src/entities/superbike/engineNote.js';
import { substepsFor } from '../../../src/entities/giftRide/giftRide.js';
import { stepWheelie, wheelieSteerScale, wheelieSteerScaleSmooth } from '../../../src/entities/giftRide/wheelie.js';
import { GIFT_ITEMS, seedList, qtyOf } from '../../../src/gifts/catalog.js';

const dt = 1 / 60;
/** 정지에서 풀스로틀: 100 km/h 도달 시간, 60 s 뒤 속도(km/h) */
function run(sprint) {
  const b = { v: 0 };
  let t100 = null;
  for (let t = 0; t < 60; t += dt) {
    superbikeThrottle(b, dt, 1, sprint);
    if (t100 == null && b.v * 3.6 >= 100) t100 = t + dt;
  }
  return { t100, top: b.v * 3.6 };
}
const boost = run(true), walk = run(false);
assert.ok(Math.abs(boost.t100 - 3.2) < 0.15, `Shift 0-100 ${boost.t100}`);
assert.ok(Math.abs(walk.t100 - 3.9) < 0.2, `W 0-100 ${walk.t100}`);
assert.ok(Math.abs(boost.top - 303) < 1.5 && boost.top <= 303 + 1e-6, `Shift top ${boost.top}`);
assert.ok(Math.abs(walk.top - 270) < 1.5, `W top ${walk.top}`);
// 놓으면 서서히, 브레이크는 빠르게 선다
{ const b = { v: 30 }; superbikeThrottle(b, 1, 0, false); assert.ok(b.v < 30 && b.v > 28); }
{ const b = { v: 30 }; let t = 0; while (b.v > 0.15 && t < 10) { superbikeThrottle(b, dt, -1, false); t += dt; } assert.ok(t < 3.2, `100→0 ${t}`); }
// 후진 상한은 giftRide 가 drive.revV 로 자른다 (발로 미는 정도)
assert.ok(SB_DRIVE.rev > 0 && SB_DRIVE.rev < 1);

// 서브스텝: 한 번에 0.6 m 넘게 안 움직이고, 최대 8
assert.equal(substepsFor(0, dt), 1);
assert.equal(substepsFor(10, dt), 1);
assert.equal(substepsFor(303 / 3.6, 1 / 30), 5);
assert.equal(substepsFor(303 / 3.6, 1), 8);
for (const v of [5, 30, 60, 84]) assert.ok((v * dt) / substepsFor(v, dt) <= 0.6 + 1e-9);

// 엔진음: 기어 안에서 단조 증가, 변속 때 떨어짐, 6단 끝 = 303
assert.equal(SB_GEARS.at(-1), 303);
assert.deepEqual(gearOf(0), { gear: 1, rev: 0, u: 0 });
assert.equal(gearOf(303 / 3.6).gear, 6);
for (let g = 0; g < SB_GEARS.length; g++) {
  const lo = (g ? SB_GEARS[g - 1] * 0.97 : 0) + 1, hi = SB_GEARS[g] * 0.97 - 1;
  let prev = -1;
  for (let k = lo; k <= hi; k += 2) {
    const r = rideRate(k / 3.6, 1);
    assert.equal(gearOf(k / 3.6).gear, g + 1);
    assert.ok(r > prev, `gear ${g + 1} @${k}`);
    prev = r;
  }
  if (g < SB_GEARS.length - 1) assert.ok(rideRate((SB_GEARS[g] * 0.97 + 1) / 3.6, 1) < prev, `shift ${g + 1}→${g + 2}`);
}
for (let v = 0; v < 90; v += 3) {
  const r = rideRate(v, 1); assert.ok(r >= 0.88 && r <= 1.2, `rate ${r} @${v}`); // 기어 안 음높이 변화는 작게
  const m = rideMix(v, 0); assert.ok(m >= 0 && m <= 1);
  assert.ok(rideGain(v, 1) >= rideGain(v, 0));
}
assert.equal(rideMix(0, 0), 0);
assert.equal(rideMix(10, 0), 1);
// 기어 루프: 1~5단은 gear1~5, 6단은 gear5 를 3% 높여 재사용, 저단으로는 4 km/h 늦게 (경계에서 루프가 떨지 않게)
assert.deepEqual(SB_LAYERS, [0, 1, 2, 3, 4, 4]);
for (let g = 0; g < 6; g++) assert.equal(rideLayer(((g ? SB_GEARS[g - 1] * 0.97 : 0) + 3) / 3.6), SB_LAYERS[g]);
assert.ok(Math.abs(rideRate(SB_GEARS[4] * 0.97 / 3.6 + 1e-6, 0) - 0.9 * 1.03) < 1e-3, '6th = gear5 loop +3%');
{ const at = 91 / 3.6; assert.equal(rideLayer(at, -1), 0); assert.equal(rideLayer(at, 1), 1); assert.equal(rideLayer(85 / 3.6, 1), 0);
  assert.ok(Math.abs(rideRate(at, 0, 1) - 0.9) < 1e-9, 'held 2nd: rate stays at the bottom of 2nd'); }
{ let L = -1, flips = 0; for (let t = 0; t < 4; t += dt) { const n = rideLayer((92 + 1.5 * Math.sin(t * 9)) / 3.6, L); flips += L >= 0 && n !== L; L = n; } assert.ok(flips <= 1, `flips ${flips}`); }

// 윌리(Space): 관리자 크루저와 같은 stepWheelie. 들고(최대각 이하), 놓으면 착지 + 바운스, 들린 동안 조향 둔화
{ const MAX = 0.45, w = { v: 10, wheelie: 0, wheelieVel: 0 };
  let peak = 0; for (let t = 0; t < 1.5; t += dt) { stepWheelie(w, dt, true, 1, MAX); peak = Math.max(peak, w.wheelie); }
  assert.ok(w.wheelie > 0.3 && peak <= MAX + 1e-9, `wheelie ${w.wheelie}`);
  let t = 0; while (w.wheelie > 0 && t < 3) { stepWheelie(w, dt, false, 1, MAX); t += dt; }
  assert.ok(w.wheelie === 0 && t < 1.5 && w.dive > 0, `land ${t}`);
  assert.equal(wheelieSteerScale(0.3), 0.55); assert.equal(wheelieSteerScale(0), 1);
  const s = { v: 0, wheelie: 0, wheelieVel: 0 }; for (let k = 0; k < 30; k++) stepWheelie(s, dt, true, 0, MAX);
  assert.ok(s.v > 0 && s.v <= 2.2, 'kick from standstill'); }

// 선물 탈것 조향 둔화: 앞바퀴가 실제로 들린 만큼만 (접지 = v1 조향 그대로), 크루저 계단형은 그대로
{ for (const w of [0, 0.02, 0.04]) assert.equal(wheelieSteerScaleSmooth(w), 1, `no damping on ground ${w}`);
  assert.ok(Math.abs(wheelieSteerScaleSmooth(0.3) - 0.55) < 1e-9 && Math.abs(wheelieSteerScaleSmooth(0.45) - 0.55) < 1e-9);
  let prev = 1; for (let w = 0; w <= 0.45; w += 0.01) { const k = wheelieSteerScaleSmooth(w); assert.ok(k <= prev + 1e-12 && k >= 0.55 - 1e-12); prev = k; }
  assert.ok(wheelieSteerScaleSmooth(0.1) > 0.85, 'barely lifted = barely damped');
  assert.equal(wheelieSteerScale(0.1), 1); assert.equal(wheelieSteerScale(0.11), 0.55); // 크루저 불변
  // 슈퍼바이크(fall 8)는 놓으면 크루저(4.2)보다 빨리 착지
  const land = (o) => { const w = { v: 15, wheelie: 0.45, wheelieVel: 0 }; let t = 0; while (w.wheelie > 0) { stepWheelie(w, dt, false, 0, 0.45, o); t += dt; } return t; };
  assert.ok(land({ fall: 8 }) < 0.36 && land({}) > 0.44, `land ${land({ fall: 8 })} vs ${land({})}`); }

// 카탈로그: veh id 904, 기존 선물과 겹치지 않음, 이름은 상표 없이 '슈퍼바이크 RR'
assert.equal(SUPERBIKE_GIFT.id, 'superbike-rr');
assert.equal(SUPERBIKE_GIFT.vehId, 904);
assert.equal(new Set(GIFT_ITEMS.map((g) => g.vehId).filter(Boolean)).size, GIFT_ITEMS.filter((g) => g.vehId).length);
assert.ok(qtyOf(seedList(), 'superbike-rr') > 0, 'local mock seed');
assert.equal(SUPERBIKE_GIFT.name, '슈퍼바이크 RR');
assert.equal(SUPERBIKE_GIFT.enName, 'Superbike RR');

// 모델: 실측 휠베이스·축 위치, 공유 지오메트리라 두 대째는 새로 안 만든다
const a = createSuperbikeModel(), b2 = createSuperbikeModel();
assert.ok(Math.abs(SB.WB - 1.457) < 1e-9);
assert.ok(Math.abs(a.userData.rearSpin.position.z + SB.WB / 2) < 1e-9);
a.updateMatrixWorld(true);
const fa = a.userData.frontSpin.getWorldPosition(a.position.clone());
assert.ok(Math.abs(fa.z - SB.WB / 2) < 1e-3 && Math.abs(fa.y - SB.RF) < 1e-3, `front axle ${fa.toArray()}`);
const geos = (o) => { const s = new Set(); o.traverse((m) => m.isMesh && s.add(m.geometry)); return s; };
assert.deepEqual([...geos(a)], [...geos(b2)]);
assert.ok(geos(a).size <= 6);
// 윌리 피벗 = 뒷바퀴 접지점 (lean > wheelie(z=AR) > wheelieFrame(z=-AR) > 차체)
assert.ok(Math.abs(a.userData.wheelie.position.z + SB.WB / 2) < 1e-9 && a.userData.wheelieFrame.parent === a.userData.wheelie);
a.userData.wheelie.rotation.x = -0.4; a.updateMatrixWorld(true);
const ra = a.userData.rearSpin.getWorldPosition(a.position.clone()), fl = a.userData.frontSpin.getWorldPosition(a.position.clone());
assert.ok(Math.abs(ra.y - SB.RR) < 0.05 && fl.y > SB.RF + 0.4, `wheelie pose rear ${ra.y} front ${fl.y}`);
a.userData.wheelie.rotation.x = 0;

// 음원: ogg + m4a, 작게
for (const n of ['idle', 'start', 'launch', 'gear1', 'gear2', 'gear3', 'gear4', 'gear5']) for (const e of ['ogg', 'm4a']) {
  const f = new URL(`../../../public/audio/superbike/${n}.${e}`, import.meta.url);
  assert.ok(existsSync(f), `${n}.${e}`);
  const sz = statSync(f).size; assert.ok(sz > 4000 && sz < 40000, `${n}.${e} ${sz}`);
}
assert.ok(!existsSync(new URL('../../../public/audio/superbike/ride.ogg', import.meta.url)), 'old single ride loop removed');
console.log(`test-superbike: ok (0-100 Shift ${boost.t100.toFixed(2)} s, W ${walk.t100.toFixed(2)} s; top ${boost.top.toFixed(0)}/${walk.top.toFixed(0)} km/h)`);
