// [depot-story] 11일차 '수습 마지막 날' — E20 카트 열차(후진 끼우기 · 급회전 끊김 · 매대 충돌 · 보관소 도착). DOM 없이 동작.
//   node scripts/test-depot-day11.mjs   (npm run depot:day11:test)
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { E20, evalE20, createTrain, strayRect, strayYaw, createDay11Props } from '../src/depot/story/day11.js';
import EVENTS from '../src/depot/story/data/events.json' with { type: 'json' };
import TARGETS from '../src/depot/story/data/targets.json' with { type: 'json' };
import EXIT from '../src/depot/story/data/exit-rules.json' with { type: 'json' };
import REACT from '../src/depot/story/data/reactions.json' with { type: 'json' };
import D10 from '../src/depot/story/data/day10-script.json' with { type: 'json' };
import D11 from '../src/depot/story/data/day11-script.json' with { type: 'json' };
import { idx, checkRefs, checkSfx, walk, countScene, overlap, FRONT_OBS } from './depot-story-testlib.mjs';

const ev = Object.fromEntries(EVENTS.events.map((e) => [e.id, e]));
const tg = Object.fromEntries(TARGETS.targets.map((t) => [t.id, t]));
const L = Object.fromEntries(D11.map((b) => [b.id, b]));

// ---------- 데이터 ----------
assert.equal(D11[0].id, 'd11_000'); assert.equal(D10.find((b) => b.cmd === 'day.end').next, 'd11_000');
checkRefs(D11, ['d12_000']);
assert.equal(L.d11_017.event, 'E20'); assert.equal(L.d11_017.onMissed, 'd11_038'); assert.equal(L.d11_070.cmd, 'day.end'); assert.equal(L.d11_070.next, 'd12_000');
assert.match(idx, /11: 'E20'/); assert.match(idx, /E20: 'cart-corral'/); assert.match(idx, /이야기는 준비 중이에요/); assert.match(idx, /11: 'beomiHired'|beomiHired/);
assert.equal(EVENTS.week2Vitality.main.E20, 10); assert.deepEqual(EXIT.ignoreEvent.chainMissed.d11_017, ['E20']);
for (const b of D11) if (b.stage) for (const [, at] of Object.entries(b.stage)) if (at) assert.ok(tg[at], `${b.id} ${at}`);
assert.ok(REACT.reactions.find((r) => r.id === 'R72')); assert.match(idx, /fire\('R72'\)/);
checkSfx(D11, [ev.E20]);
for (let k = 1; k <= 5; k++) { const t = tg[`cart-stray-${k}`]; assert.ok(t, `cart-stray-${k}`); const r = strayRect({ x: t.x, z: t.z, yaw: strayYaw(t) }); for (const o of FRONT_OBS) assert.ok(!overlap(r, o), `stray ${k} 겹침 ${JSON.stringify(o)}`); }

// 경로
const P = (r, extra = {}) => walk(L, 'd11_000', { ev: { E19: 'success', E20: r }, mission: { E20: r }, ...extra });
const ok = P('success'), part = P('partial'), bad = P('fail'), miss = P('missed', { pick: { d11_015: 2 } }), quit = P('missed');
for (const p of [ok, part, bad, miss, quit]) { assert.equal(p.end, 'd11_070'); for (const [w, at] of Object.entries(p.stage)) assert.equal(at, null, `stage ${w} 치움`); }
assert.ok(ok.seen.includes('d11_031') && ok.seen.includes('d11_044') && ok.set['flag.beomiHired'] === 1, '성공 → 정직원');
assert.ok(part.seen.includes('d11_033') && part.set['flag.beomiHired'] === 1);
assert.ok(bad.seen.includes('d11_035') && bad.seen.includes('d11_046') && !bad.set['flag.beomiHired'], '실패 → 수습 연장');
assert.ok(miss.seen.includes('d11_038') && !miss.seen.includes('d11_017') && miss.seen.includes('d11_046')); assert.deepEqual(L.d11_038.markMissed, ['E20']);
assert.ok(quit.seen.includes('d11_017') && quit.seen.includes('d11_038'), '60초 안 끼움 → 놓침');

// ---------- E20 판정 ----------
const J = (o) => evalE20({ arrived: true, engaged: true, ...o });
assert.equal(J({ linked: 5, breaks: 0, rackHits: 0 }), 'success');
assert.equal(J({ linked: 5, breaks: 1, rackHits: 0 }), 'partial'); assert.equal(J({ linked: 5, breaks: 0, rackHits: 2 }), 'partial'); assert.equal(J({ linked: 4, breaks: 0, rackHits: 0 }), 'partial');
assert.equal(J({ linked: 3 }), 'fail'); assert.equal(evalE20({ arrived: false, linked: 5, engaged: true }), 'fail', '120초 초과');
assert.equal(evalE20({ engaged: false }), 'missed');
assert.equal(E20.timeLimitSec, L.d11_017.timeLimitSec); assert.equal(E20.startWithinSec, L.d11_017.startWithinSec); assert.equal(E20.linkR, L.d11_017.cartTrain.linkRadiusM);
assert.equal(E20.cartKg, L.d11_017.cartTrain.eachKg); assert.equal(E20.breakDegPerSec, L.d11_017.cartTrain.breakTurnDegPerSec);

// ---------- 열차 시뮬레이션 (yaw π = 앞 +z, 뒤에 카트들을 일렬로) ----------
{
  const evs = []; const strays = [0, 1, 2].map((k) => ({ x: 0, z: -1.5 - k * 1.2, yaw: 0 }));
  const tr = createTrain({ strays, onEvent: (k, i) => evs.push(`${k}${i}`) });
  let z = 0, t = 0; const step = (dz, speed, extra = {}) => { z += dz; t += 0.05; tr.step(0.05, { x: 0, z, yaw: Math.PI, speed, held: true, ...extra }, t); };
  step(0, 0.3); assert.deepEqual(evs, ['link0'], '0.8 m 안 · 천천히 → 철컥');
  for (let i = 0; i < 40 && tr.S.linked.length < 3; i++) step(-0.05, 0.5); // 후진
  assert.equal(tr.S.linked.length, 3, `후진으로 3칸 (${evs})`); assert.equal(tr.S.kg, 54);
  for (let i = 0; i < 80; i++) step(0.1, 1.0); // 앞으로 8 m
  const zs = tr.S.linked.map((ci) => tr.C[ci].z); assert.ok(zs[0] > zs[1] && zs[1] > zs[2], '줄 순서'); assert.ok(Math.abs(z - 0.45 - E20.firstM - zs[0]) < 0.15, `첫 칸 거리 ${z} ${zs[0]}`);
  assert.ok(Math.abs(zs[0] - zs[1] - E20.gapM) < 0.05);
  // 빠른 급회전 0.2초 → 맨 뒤 칸 끊김(쿨다운 1.5초 안엔 한 번만)
  for (let i = 0; i < 8; i++) step(0, 1.5, { yawRate: 90 }); assert.equal(tr.S.breaks, 1); assert.equal(tr.S.linked.length, 2); assert.equal(tr.S.kg, 36);
  for (let i = 0; i < 8; i++) step(0, 1.1, { yawRate: 120 }); assert.equal(tr.S.breaks, 1, '1.2 m/s 이하면 안 끊김');
  // 앞에 있는 카트는 지나쳐도 안 끼움 (꼬리 뒤쪽만)
  const tr2 = createTrain({ strays: [{ x: 0, z: 1.2, yaw: 0 }] }); tr2.step(0.05, { x: 0, z: 0, yaw: Math.PI, speed: 0.3, held: true }, 0); assert.equal(tr2.S.linked.length, 0);
  // 빠르면 안 끼움
  const tr3 = createTrain({ strays: [{ x: 0, z: -1.5, yaw: 0 }] }); tr3.step(0.05, { x: 0, z: 0, yaw: Math.PI, speed: 1.3, held: true }, 0); assert.equal(tr3.S.linked.length, 0);
  // 매대 충돌: 칸이 막힌 곳에 새로 닿을 때 1번
  let wall = false; const tr4 = createTrain({ strays: [{ x: 0, z: -1.5, yaw: 0 }], isBlocked: () => wall });
  tr4.step(0.05, { x: 0, z: 0, yaw: Math.PI, speed: 0.3, held: true }, 0); wall = true; for (let i = 0; i < 10; i++) tr4.step(0.05, { x: 0, z: 0, yaw: Math.PI, speed: 0.3, held: true }, i * 0.05);
  assert.equal(tr4.S.rackHits, 1); wall = false; tr4.step(0.05, { x: 0, z: 0, yaw: Math.PI, speed: 0.3, held: true }, 2); wall = true; tr4.step(0.05, { x: 0, z: 0, yaw: Math.PI, speed: 0.3, held: true }, 3); assert.equal(tr4.S.rackHits, 2);
  // 보관소 줄
  tr.park({ x: 73.8, z: 7.8 }); assert.ok(tr.C.every((c) => c.state === 'parked')); assert.equal(tr.S.linked.length, 0);
}

// ---------- 소품 ----------
{
  const scene = new THREE.Scene(), kept = []; const keep = (o) => (kept.push(o), o);
  const p = createDay11Props({ THREE, scene, keep });
  p.carts([1, 2, 3, 4, 5].map((k) => ({ x: tg[`cart-stray-${k}`].x, z: tg[`cart-stray-${k}`].z, yaw: 0 })));
  const a = countScene(scene); console.log('E20 props', a, p.stats()); assert.equal(a.m, 1, '카트 5대 = InstancedMesh 1'); assert.ok(a.t < 1500, `tris ${a.t}`);
  p.carts(null); assert.equal(scene.children.length, 0); p.dispose();
}
console.log('depot day11 ok');
