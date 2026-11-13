// [depot-story] 10일차 '1원 전쟁' — E19 맞불 타임세일(파렛트 타이머 · 맞불 매대 1초 멈춤 · 보라 카트 충돌). DOM 없이 동작.
//   node scripts/test-depot-day10.mjs   (npm run depot:day10:test)
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { E19, ENDCAP, endcapRect, evalE19, palletLeft, createDay10Props } from '../src/depot/story/day10.js';
import EVENTS from '../src/depot/story/data/events.json' with { type: 'json' };
import TARGETS from '../src/depot/story/data/targets.json' with { type: 'json' };
import EXIT from '../src/depot/story/data/exit-rules.json' with { type: 'json' };
import REACT from '../src/depot/story/data/reactions.json' with { type: 'json' };
import D9 from '../src/depot/story/data/day9-script.json' with { type: 'json' };
import D10 from '../src/depot/story/data/day10-script.json' with { type: 'json' };
import { idx, checkRefs, checkSfx, walk, countScene, overlap, FRONT_OBS } from './depot-story-testlib.mjs';

const ev = Object.fromEntries(EVENTS.events.map((e) => [e.id, e]));
const tg = Object.fromEntries(TARGETS.targets.map((t) => [t.id, t]));
const L = Object.fromEntries(D10.map((b) => [b.id, b]));

// ---------- 데이터 ----------
assert.equal(D10[0].id, 'd10_000'); assert.equal(D9.find((b) => b.cmd === 'day.end').next, 'd10_000');
checkRefs(D10, ['d11_000']);
assert.equal(L.d10_022.event, 'E19'); assert.equal(L.d10_022.onMissed, 'd10_038'); assert.equal(L.d10_070.cmd, 'day.end'); assert.equal(L.d10_070.next, 'd11_000');
assert.match(idx, /10: 'E19'/); assert.match(idx, /E19: 'counter-endcap'/); assert.match(idx, /이야기는 준비 중이에요/);
assert.equal(EVENTS.week2Vitality.main.E19, 12); assert.deepEqual(EXIT.ignoreEvent.chainMissed.d10_022, ['E19']);
for (const b of D10) if (b.stage) for (const [, at] of Object.entries(b.stage)) if (at) assert.ok(tg[at], `${b.id} ${at}`);
assert.ok(REACT.reactions.find((r) => r.id === 'R71')); assert.match(idx, /fire\('R71'\)/);
checkSfx(D10, [ev.E19]);

// 경로: 성공 · 부분 · 실패 · 거절(놓침)
const P = (r, extra = {}) => walk(L, 'd10_000', { ev: { E17: 'success', E18: 'success', E19: r }, flags: { w1Ending: 'A' }, mission: { E19: r }, ...extra });
const ok = P('success'), part = P('partial'), bad = P('fail', { flags: { w1Ending: 'B' } }), miss = P('missed', { pick: { d10_020: 2 } });
for (const p of [ok, part, bad, miss]) { assert.equal(p.end, 'd10_070'); for (const [w, at] of Object.entries(p.stage)) assert.equal(at, null, `stage ${w} 치움`); }
assert.ok(ok.seen.includes('d10_031') && ok.seen.includes('d10_053') && ok.seen.includes('d10_018'));
assert.ok(part.seen.includes('d10_033')); assert.ok(bad.seen.includes('d10_035') && bad.seen.includes('d10_054') && bad.seen.includes('d10_019'));
assert.ok(miss.seen.includes('d10_038') && !miss.seen.includes('d10_022'), '거절 → 놓침'); assert.deepEqual(L.d10_038.markMissed, ['E19']);
assert.ok(walk(L, 'd10_000', { ev: { E17: 'fail', E18: 'missed' }, mission: { E19: 'success' } }).seen.includes('d10_007'));

// ---------- E19 판정 ----------
assert.equal(evalE19({ placed: 3, hits: 0, engaged: true }), 'success');
assert.equal(evalE19({ placed: 3, hits: 1, engaged: true }), 'partial'); assert.equal(evalE19({ placed: 3, hits: 2, engaged: true }), 'partial');
assert.equal(evalE19({ placed: 3, hits: 3, engaged: true }), 'fail', '충돌 3 = 실패');
assert.equal(evalE19({ placed: 2, hits: 0, engaged: true }), 'partial'); assert.equal(evalE19({ placed: 2, hits: 3, engaged: true }), 'fail');
assert.equal(evalE19({ placed: 1, hits: 0, engaged: true }), 'fail'); assert.equal(evalE19({ placed: 0, engaged: true }), 'fail', '실었지만 못 놓음');
assert.equal(evalE19({ placed: 0, engaged: false }), 'missed', '150초 동안 안 실음');
// 파렛트: 6박스, 10초마다 보라 카트 1박스
assert.equal(palletLeft({ t: 0, mine: 0 }), 6); assert.equal(palletLeft({ t: 9.9, mine: 0 }), 6); assert.equal(palletLeft({ t: 10, mine: 0 }), 5);
assert.equal(palletLeft({ t: 25, mine: 3 }), 1); assert.equal(palletLeft({ t: 40, mine: 3 }), 0, '내 3 + 보라 4 → 0 (음수 아님)'); assert.equal(palletLeft({ t: 60, mine: 0 }), 0);
assert.equal(E19.timeLimitSec, ev.E19.tuning.timeLimitSec); assert.equal(E19.dropR, ev.E19.tuning.dropR); assert.equal(E19.grabIntervalSec, L.d10_022.rival.grabIntervalSec);

// ---------- 맞불 매대 자리 ----------
assert.ok(Math.hypot(ENDCAP.x - tg['counter-endcap'].x, ENDCAP.z - tg['counter-endcap'].z) < 0.01);
for (const o of FRONT_OBS) assert.ok(!overlap(endcapRect(), o), `맞불 매대가 장애물과 겹침 ${JSON.stringify(o)}`);
assert.ok(endcapRect().z1 <= 12.4 && 14 - endcapRect().z1 >= 1.6, '앞쪽 띠(랙 z 14 까지) 1.6 m 이상 남김 — 보라 행렬(z 13)·플레이어 통과');

// ---------- 소품 ----------
{
  const scene = new THREE.Scene(), kept = []; const keep = (o) => (kept.push(o), o);
  const p = createDay10Props({ THREE, scene, keep, look: () => ({ geo: keep(new THREE.BoxGeometry(0.5, 0.3, 0.4)), mat: keep(new THREE.MeshLambertMaterial()) }) });
  p.endcap(true, 2, false); const a = countScene(scene); console.log('E19 props', a, p.stats()); assert.equal(a.m, 2, '매대 1 + 박스 InstancedMesh 1 (POP 는 DOM 캔버스라 node 에선 없음)'); assert.ok(a.t < 300, `tris ${a.t}`);
  assert.deepEqual(p.stats(), { endcap: true, boxes: 2, pop: false });
  p.endcap(true, 3); assert.equal(p.stats().boxes, 3); p.endcap(false); assert.equal(scene.children.length, 0); p.dispose();
}
console.log('depot day10 ok');
