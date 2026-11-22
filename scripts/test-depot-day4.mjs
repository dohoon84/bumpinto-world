// [depot-story] 4일차 기믹(E04 보들범 산사태 · E12 꼬마 손님 길 찾기) — 판정·굴림·호위·소품 정리. DOM 없이 동작.
//   node scripts/test-depot-day4.mjs   (npm run depot:day4:test)
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { E04, E12, D4_SPOTS, evalE04, evalE12, createSlide, createEscort, createDay4Props, seeded } from '../src/depot/story/day4.js';
import EVENTS from '../src/depot/story/data/events.json' with { type: 'json' };
import TARGETS from '../src/depot/story/data/targets.json' with { type: 'json' };

// ---------- 데이터: events.json 규칙과 상수가 맞는지 ----------
const ev = Object.fromEntries(EVENTS.events.map((e) => [e.id, e]));
assert.equal(ev.E04.tuning.packs, E04.packs);
assert.equal(ev.E04.tuning.timeLimitSec, E04.timeLimitSec);
assert.equal(ev.E04.tuning.packKg, E04.packKg);
assert.equal(ev.E12.tuning.speedLimit, E12.speedLimit);
assert.equal(ev.E12.tuning.overSpeedGraceSec, E12.overFailSec);
assert.equal(ev.E12.tuning.timeoutSec, E12.timeoutSec);
const tg = Object.fromEntries(TARGETS.targets.map((t) => [t.id, t]));
for (const k of ['tissue-pyramid', 'kid-spot', 'customer-desk']) assert.ok(tg[k], `targets.json ${k}`);
for (const [k, s] of [['tissue-pyramid', D4_SPOTS.pallet], ['customer-desk', D4_SPOTS.desk], ['kid-spot', D4_SPOTS.kid]]) { assert.equal(tg[k].x, s.x, k); assert.equal(tg[k].z, s.z, k); assert.equal(s.id, k); }
assert.equal(ev.E04.target, 'tissue-pyramid'); assert.equal(ev.E12.target, 'customer-desk');
assert.equal(ev.E04.waypoints[0].n, E04.packs);

// ---------- 판정 ----------
assert.equal(evalE04({ returned: 12, collisions: 0 }), 'success');
assert.equal(evalE04({ returned: 12, collisions: 1 }), 'partial');
assert.equal(evalE04({ returned: 8, collisions: 0 }), 'partial');
assert.equal(evalE04({ returned: 11, collisions: 3 }), 'partial');
assert.equal(evalE04({ returned: 7, collisions: 0 }), 'fail');
assert.equal(evalE04({ returned: 0, collisions: 0, engaged: true }), 'fail');
assert.equal(evalE04({ returned: 0, collisions: 0, engaged: false }), 'missed');
assert.equal(evalE12({ boarded: true, arrived: true, bumps: 0, overSec: 0 }), 'success');
assert.equal(evalE12({ boarded: true, arrived: true, bumps: 0, overSec: 0.2 }), 'success');
assert.equal(evalE12({ boarded: true, arrived: true, bumps: 0, overSec: 5 }), 'partial');
assert.equal(evalE12({ boarded: true, arrived: true, bumps: 0, overSec: 5.2 }), 'fail', 'overspeed > 5 s alone fails (judge)');
assert.equal(evalE12({ boarded: true, arrived: true, bumps: 0, overSec: 2 }), 'partial');
assert.equal(evalE12({ boarded: true, arrived: true, bumps: 1, overSec: 0 }), 'partial');
assert.equal(evalE12({ boarded: true, arrived: true, bumps: 2 }), 'fail');
assert.equal(evalE12({ boarded: true, arrived: true, bumps: 1, overSec: 6 }), 'fail');
assert.equal(evalE12({ boarded: true, arrived: true, bumps: 1, overSec: 4 }), 'partial');
assert.equal(evalE12({ boarded: false }), 'missed');
assert.equal(evalE12({ boarded: true, arrived: false }), 'partial');

// ---------- 굴림: 통로 02 끝 교차 통로(랙 x 55.55–57.75 · 61.1–63.3, z 14–41 · 엔드캡 파렛트 z 41.3–42.4 · 45.6–46.7, 브라우저에서 잰 장애물) ----------
const PAL = D4_SPOTS.pallet, palRect = { x0: PAL.x - PAL.w / 2, x1: PAL.x + PAL.w / 2, z0: PAL.z - PAL.d / 2, z1: PAL.z + PAL.d / 2 }; // 사건 중 파렛트 장애물 (createDay4Props 와 같음)
const obstacles = [{ x0: 55.55, x1: 57.75, z0: 14, z1: 41 }, { x0: 61.1, x1: 63.3, z0: 14, z1: 41 }, { x0: 56, x1: 57.3, z0: 41.3, z1: 42.4 }, { x0: 56, x1: 57.3, z0: 45.6, z1: 46.7 }, { x0: 61.55, x1: 62.85, z0: 41.3, z1: 42.4 }, { x0: 61.55, x1: 62.85, z0: 45.6, z1: 46.7 }, { x0: 40, x1: 80, z0: 52, z1: 53 }, { x0: 40, x1: 80, z0: 9, z1: 10 }, palRect];
const collide = (x, z, r) => { for (const o of obstacles) { const cx = Math.max(o.x0, Math.min(x, o.x1)), cz = Math.max(o.z0, Math.min(z, o.z1)), dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz); if (d < r) return d < 1e-6 ? { nx: 0, nz: -1, pen: r } : { nx: dx / d, nz: dz / d, pen: r - d }; } return null; };
const events = {}; const onEvent = (k) => { events[k] = (events[k] || 0) + 1; };
const sl = createSlide({ collide, rnd: seeded(4), onEvent });
assert.ok(sl.P.every((p) => !collide(p.x, p.z, E04.packR - 0.01)), 'packs start outside the pallet/racks');
assert.equal(sl.P.length, 12); assert.ok(sl.P.every((p) => p.state === 'loose'));
for (let i = 0; i < 6 * 60; i++) sl.step(1 / 60, null);
assert.ok(sl.S.settled, 'packs settle within 6 s');
assert.ok(sl.P.every((p) => p.y === 0), 'all packs on the floor');
assert.ok(sl.P.every((p) => !collide(p.x, p.z, E04.packR - 0.02)), 'no pack inside a rack');
const spread = Math.max(...sl.P.map((p) => Math.hypot(p.x - D4_SPOTS.pallet.x, p.z - D4_SPOTS.pallet.z)));
assert.ok(spread > 3, `packs spread down the aisle (${spread.toFixed(1)} m)`);
assert.ok(sl.P.filter((p) => Math.abs(p.z - PAL.z) > 2).length >= 6, 'at least half the packs roll more than 2 m along the aisle');
console.log('spread', spread.toFixed(1), sl.P.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' '));
// 느린 프레임(0.2 초)도 같은 거리를 감 (하위 단계)
{ const a = createSlide({ collide, rnd: seeded(9) }), b = createSlide({ collide, rnd: seeded(9) }); for (let i = 0; i < 300; i++) a.step(1 / 60, null); for (let i = 0; i < 25; i++) b.step(0.2, null); const far = (q) => q.P.reduce((acc, p) => acc + Math.hypot(p.x - PAL.x, p.z - PAL.z), 0) / q.P.length, fa = far(a), fb = far(b); assert.ok(Math.abs(fa - fb) / fa < 0.25, `slow frames travel about as far (${fa.toFixed(2)} vs ${fb.toFixed(2)} m)`); }
assert.ok(events.land > 0, 'land events');
assert.ok(sl.P.every((p) => Math.abs(p.roll / (Math.PI / 2) - Math.round(p.roll / (Math.PI / 2))) < 0.05), 'resting packs lie on a face');
// 빠른 카트는 튕김(담기 X)
{ const p = sl.P[0], cart = { x: p.x, z: p.z + 0.9, vx: 0, vz: -2.2, yaw: 0, held: true }; sl.step(1 / 60, cart); assert.equal(p.state, 'loose'); assert.ok(sl.S.kicks >= 1 && Math.hypot(p.vx, p.vz) > 1, 'kicked'); for (let i = 0; i < 240; i++) sl.step(1 / 60, null); }
// 천천히 대면 담김(최대 6) → 반납 존에서 0.3초마다 1팩
function collectAndReturn() {
  let guard = 0;
  while (sl.S.carried < E04.cap && sl.loose().length && guard++ < 40) {
    const p = sl.nearestLoose(D4_SPOTS.pallet.ax, D4_SPOTS.pallet.az);
    sl.step(1 / 60, { x: p.x, z: p.z + 0.7, vx: 0, vz: -0.5, yaw: 0, held: true });
  }
  const before = sl.S.returned, n = sl.S.carried;
  for (let i = 0; i < 4 * 60 && sl.S.carried; i++) sl.step(1 / 60, { x: D4_SPOTS.pallet.ax, z: D4_SPOTS.pallet.az, vx: 0, vz: 0, yaw: 0, held: true });
  assert.equal(sl.S.returned - before, n);
}
collectAndReturn(); assert.equal(sl.S.returned, E04.cap); assert.equal(events.scoop, E04.cap);
let trips = 1; while (sl.loose().length && trips < 6) { collectAndReturn(); trips++; }
assert.equal(sl.S.returned, 12); assert.equal(sl.loose().length, 0); assert.equal(trips, Math.ceil(12 / E04.cap), 'trips = 12 / cap');
assert.equal(evalE04({ returned: sl.S.returned, collisions: 0 }), 'success');
assert.ok(new Set(sl.P.map((p) => p.n)).size === 12, 'each returned pack has its own pallet slot');
{ const s2 = createSlide({ collide, rnd: seeded(4) }); for (let i = 0; i < 360; i++) s2.step(1 / 60, null); const p = s2.P[3]; for (let k = 0; k < E04.cap; k++) s2.P[k].state = 'cart'; s2.S.carried = E04.cap; s2.step(1 / 60, { x: s2.P[7].x, z: s2.P[7].z + 0.7, vx: 0, vz: -0.4, yaw: 0, held: true }); assert.equal(s2.P[7].state, 'loose', 'full cart does not scoop'); assert.ok(p);
  // 빠르게 굴러오는 팩은 멈춰 있는 카트에 담기지 않고 튕김
  const q = s2.P[8]; q.vx = 0; q.vz = -2; const c = { x: q.x, z: q.z - 0.62, vx: 0, vz: 0, yaw: Math.PI, held: true }; s2.S.carried = 0; for (const k of [0, 1, 2, 3]) s2.P[k].state = 'returned'; s2.step(1 / 60, c); assert.equal(q.state, 'loose', 'fast rolling pack bounces'); assert.ok(q.vz > 0, 'bounced back'); }

// ---------- 호위 ----------
{
  const e = createEscort();
  assert.equal(e.tick(1, 2), false, 'no speed tracking before boarding');
  assert.equal(e.bump(0), false, 'no bumps before boarding');
  assert.ok(e.board()); assert.equal(e.board(), false);
  assert.equal(e.tick(0.25, 0.9), false); assert.equal(e.S.overSec, 0);
  assert.equal(e.tick(0.25, 1.3), true, 'first overspeed warns'); assert.equal(e.tick(0.25, 1.3), false, 'warning throttled');
  assert.ok(Math.abs(e.S.overSec - 0.5) < 1e-9);
  assert.ok(e.bump(10)); assert.equal(e.bump(10.3), false, 'same bump within 0.8 s'); assert.equal(e.S.bumps, 1);
  assert.equal(e.failed(), false); assert.ok(e.bump(11)); assert.equal(e.failed(), true); assert.equal(e.result(), 'fail');
  const e2 = createEscort(); e2.board(); for (let i = 0; i < 40; i++) e2.tick(0.25, 0.8); e2.arrive(); assert.equal(e2.result(), 'success');
}

// ---------- 소품: 그림 수 · 장애물 넣고 빼기 · 정리 ----------
{
  const scene = new THREE.Scene(), cartObj = new THREE.Group(); scene.add(cartObj);
  const kept = []; const keep = (x) => { kept.push(x); return x; };
  const obs = obstacles.slice(), n0 = obs.length;
  const look = () => ({ geo: keep(new THREE.BoxGeometry(0.5, 0.33, 0.4)), mat: keep(new THREE.MeshLambertMaterial()) });
  const d4 = createDay4Props({ THREE, scene, keep, cartObj, look, obstacles: obs });
  const meshes = () => { const l = []; scene.traverse((o) => { if (o.isMesh) l.push(o); }); return l; };
  const tris = () => meshes().reduce((a, o) => a + (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1), 0);
  assert.equal(meshes().length, 0, 'nothing built before E04/E12');
  const s = d4.startSlide({ collide, rnd: seeded(4) });
  assert.equal(obs.length, n0 + 1, 'pallet obstacle during E04');
  const m1 = meshes(); assert.equal(m1.length, 3, `E04 = 3 meshes (packs, arrows, pallet) got ${m1.map((o) => o.name)}`);
  for (let i = 0; i < 120; i++) d4.tick(1 / 60, null);
  console.log('E04 props', { meshes: m1.length, tris: tris(), stats: d4.stats() });
  assert.ok(tris() < 600, `E04 tris small (${tris()})`);
  assert.equal(d4.stats().arrows, s.loose().length);
  d4.endSlide(0.5); for (let i = 0; i < 60; i++) d4.tick(1 / 60, null);
  assert.equal(meshes().length, 0, 'E04 props cleared'); assert.equal(obs.length, n0, 'pallet obstacle removed');
  d4.kid('standing', D4_SPOTS.kid); d4.desk(true);
  assert.equal(obs.length, n0 + 1, 'desk obstacle');
  const m2 = meshes(); console.log('E12 props', { meshes: m2.length, names: m2.map((o) => o.name), tris: tris() });
  assert.equal(m2.length, 2, 'E12 = kid + desk (sign needs DOM)'); assert.ok(tris() < 1200, `E12 tris (${tris()})`);
  d4.kid('riding'); assert.equal(scene.getObjectByName('story-lost-kid').parent, cartObj);
  d4.kid('desk', { x: D4_SPOTS.desk.x, z: D4_SPOTS.desk.z + 1.05 }); assert.equal(scene.getObjectByName('story-lost-kid').parent, scene);
  d4.dispose();
  assert.equal(meshes().length, 0, 'dispose clears everything'); assert.equal(obs.length, n0, 'obstacles restored');
  for (const k of kept) k.dispose?.();
}
console.log('depot day4 ok');
