// [depot-story] 2주차 엔딩(d14_080) — W2A ≥75 · W2B 50–74 · W2C <50, flag.w2Ending 만 기록, W2C = 2주차 재도전(8일차 w2_000). DOM 없이 동작.
//   node scripts/test-depot-week2-endings.mjs
import assert from 'node:assert/strict';
import { pickRange } from '../src/depot/story/day7.js';
import { week2Gain } from '../src/depot/story/day8.js';
import EVENTS from '../src/depot/story/data/events.json' with { type: 'json' };
import D14 from '../src/depot/story/data/day14-script.json' with { type: 'json' };
import { idx } from './depot-story-testlib.mjs';

const ok_ = (re) => assert.ok(re.test(idx), String(re));
const L = Object.fromEntries(D14.map((b) => [b.id, b]));
const W2V = EVENTS.week2Vitality;
const DAY_FLAGS = { 2: ['d2Sticker'], 6: ['recipeHalf'], 11: ['beomiHired'], 12: ['recipeClue'], 14: ['bagOffered'] };
ok_(/const DAY_FLAGS = \{ 2: \['d2Sticker'\], 6: \['recipeHalf'\], 11: \['beomiHired'\], 12: \['recipeClue'\], 14: \['bagOffered'\] \};/);

// index.js 의 함수 본문을 그대로 꺼내 돌림
const body = (name) => { const m = idx.match(new RegExp(`function ${name}\\([^)]*\\) \\{\\n([\\s\\S]*?)\\n  \\}\\n`)); assert.ok(m, name); return m[1]; };
const branch2 = new Function('save', 'session', 'week2Gain', 'W2V', 'pickRange', 'persist', 'L', body('branchEnding2'));
const retry2 = new Function('save', 'DAY_FLAGS', 'persist', body('retryWeek2'));

const run = (vit, r23, replay = false) => {
  const save = { vitality: vit, ev: { E23: r23 }, flags: { ending: 'B', w1Ending: 'B', w1Vitality: 60 }, replay: replay ? 14 : null }, session = {};
  const goto = branch2(save, session, week2Gain, W2V, pickRange, () => {}, L.d14_080);
  return { save, session, goto };
};
assert.equal(L.d14_080.week, 2); assert.equal(L.d14_080.flagKey, 'w2Ending');
let r = run(63, 'success'); // 63 + 12 = 75
assert.equal(r.goto, 'd14_100'); assert.equal(r.save.flags.w2Ending, 'W2A'); assert.equal(r.save.vitality, 75); assert.equal(r.save.flags.w2Vitality, 75);
assert.equal(r.save.flags.ending, 'B'); assert.equal(r.save.flags.w1Ending, 'B', '1주차 엔딩 그대로');
r = run(63, 'partial'); assert.equal(r.goto, 'd14_120'); assert.equal(r.save.flags.w2Ending, 'W2B'); assert.equal(r.save.vitality, 69);
r = run(50, 'missed'); assert.equal(r.save.flags.w2Ending, 'W2B');
r = run(49, 'fail'); assert.equal(r.goto, 'd14_140'); assert.equal(r.save.flags.w2Ending, 'W2C');
r = run(40, undefined); assert.equal(r.save.flags.w2Ending, 'W2C', 'E23 없음 = 놓침');
r = run(95, 'success'); assert.equal(r.save.vitality, 100);
r = run(70, 'success', true); assert.equal(r.save.flags.w2Ending, undefined, '다시 하기 = 기록 안 함'); assert.equal(r.save.vitality, 70); assert.equal(r.session.ending2.id, 'W2A');

// W2C 재도전
const s = { day: 15, vitality: 41, stamps: 6, aff: { gichul: 4 }, ach: { a: 1 }, ev: { E01: 'success', E14: 'success', E15: 'fail', E19: 'success', E23: 'fail', E24: 'partial' }, cleared: { 7: 1, 8: 1, 14: 1 },
  flags: { ending: 'B', w1Ending: 'B', w2Init: 1, w2StartVitality: 30, w2Ending: 'W2C', beomiHired: 1, recipeClue: 1, bagOffered: 1, recipeHalf: 1, rivalNamed: 1, spyRevealed: 1 }, e19Placed: 3, e22: {}, e23: {}, e24: {} };
retry2(s, DAY_FLAGS, () => {});
assert.equal(s.day, 8); assert.equal(s.vitality, 30); assert.equal(s.stamps, 6); assert.deepEqual(s.aff, { gichul: 4 }); assert.deepEqual(s.ach, { a: 1 });
assert.deepEqual(s.ev, { E01: 'success', E14: 'success' }); assert.deepEqual(s.cleared, { 7: 1 });
for (const f of ['beomiHired', 'recipeClue', 'bagOffered']) assert.equal(s.flags[f], undefined, f);
for (const f of ['recipeHalf', 'rivalNamed', 'spyRevealed', 'w1Ending', 'ending', 'w2Init']) assert.ok(s.flags[f], f);
assert.equal(s.flags.week2Retry, 1); assert.equal(s.e23, undefined); assert.equal(s.e19Placed, undefined);

// 연결
ok_(/L\.week === 2 \? branchEnding2\(L\) : branchEnding\(L\)/); ok_(/if \(week && L\.week === 2\) \{ await endWeek2\(L, replay\); return; \}/);
ok_(/save\.day = 15; persist\(\);/); ok_(/3주차 이야기는 준비 중이에요/); ok_(/'2주차 완결!'/); ok_(/runFrom\(DAY_START\[8\]\)/);
assert.equal(L.d14_180.nextDay.day, 15); assert.equal(L.d14_190.nextDay.day, 8); assert.equal(L.d14_190.next, 'w2_000');
console.log('depot week2 endings ok');
