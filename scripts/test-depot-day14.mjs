// [depot-story] 14일차 '동네 장보기 대결' — E23 대결(팀장 230초 시간표 · 보라 카트 2대 · 반기철 편) + E24 재감사(B 경로 체크 5칸) · 계란말이. DOM 없이 동작.
//   node scripts/test-depot-day14.mjs   (npm run depot:day14:test)
import assert from 'node:assert/strict';
import { E23, LIST, listSlots, colOf, pathBetween, planRival, rivalAt, versusPlans, evalE23, e24Checks, evalE24, E24_LABELS, RIVAL_START } from '../src/depot/story/day14.js';
import EVENTS from '../src/depot/story/data/events.json' with { type: 'json' };
import TARGETS from '../src/depot/story/data/targets.json' with { type: 'json' };
import EXIT from '../src/depot/story/data/exit-rules.json' with { type: 'json' };
import REACT from '../src/depot/story/data/reactions.json' with { type: 'json' };
import D13 from '../src/depot/story/data/day13-script.json' with { type: 'json' };
import D14 from '../src/depot/story/data/day14-script.json' with { type: 'json' };
import { idx, checkRefs, checkSfx, walk, FRONT_OBS } from './depot-story-testlib.mjs';

const ok_ = (re) => assert.ok(re.test(idx), String(re));
const ev = Object.fromEntries(EVENTS.events.map((e) => [e.id, e]));
const tg = Object.fromEntries(TARGETS.targets.map((t) => [t.id, t]));
const L = Object.fromEntries(D14.map((b) => [b.id, b]));

// ---------- 데이터 ----------
assert.equal(D14[0].id, 'd14_000'); assert.equal(D13.find((b) => b.cmd === 'day.end').next, 'd14_000');
checkRefs(D14, ['w3_000', 'w2_000']);
for (const id of ['d14_025', 'd14_026']) { assert.equal(L[id].event, 'E23'); assert.equal(L[id].onMissed, 'd14_048'); assert.equal(L[id].resume, 'd14_029'); }
assert.ok(!L.d14_025.sideMissions && L.d14_026.sideMissions[0].event === 'E24', 'E24 는 B 경로만');
ok_(/14: 'E23'/); ok_(/14: 'E24'/); ok_(/이야기는 준비 중이에요/);
assert.equal(EVENTS.week2Vitality.main.E23, 12); assert.deepEqual(EXIT.ignoreEvent.chainMissed.d14_026, ['E23', 'E24']); assert.deepEqual(EXIT.ignoreEvent.chainMissed.d14_025, ['E23']);
for (const b of D14) if (b.stage) for (const [, at] of Object.entries(b.stage)) if (at && at !== 'checkout') assert.ok(tg[at], `${b.id} ${at}`);
checkSfx(D14, [ev.E23, ev.E24]);
assert.ok(REACT.reactions.find((r) => r.id === 'R75')); ok_(/fire\('R75'\)/);
ok_(/d14_062: \(\) => recipeCanvas\('full'\)/); assert.equal(L.d14_062.ui, 'recipe-card');
// 계산 훅: 계산대 도착 = 목록 기록 · 계산 끝 = 판정 (일반 '계산 = 놓침' 보다 먼저)
ok_(/m\.id === 'E23'\) \{ if \(!m\.co\) m\.co = \{ slots: listSlots\(cartHas\)/); ok_(/m\.id === 'E23'\) \{ finishE23\(m\); return; \}/);
ok_(/L\.id === 'd14_044' && save\.ev\.E24 === 'active'/); ok_(/L\.id === 'd14_048' && save\.flags\.w1Ending === 'B'/);

// 경로 (A/B × 결과) — 엔딩 분기(d14_080)까지
const P = (w1, r, extra = {}) => walk(L, 'd14_000', { ev: { E22: 'success', E23: r }, flags: { w1Ending: w1 }, mission: { E23: r, E24: extra.e24 }, aff: { spy: extra.spy ?? 1 }, meter: 80, pick: extra.pick || {} });
for (const w1 of ['A', 'B']) for (const r of ['success', 'partial', 'fail', 'missed']) {
  const p = P(w1, r, { e24: r === 'missed' ? 'missed' : 'partial', pick: r === 'missed' ? { d14_019: 2 } : {} });
  assert.ok(p.seen.includes('d14_062') && p.seen.includes('d14_080'), `${w1} ${r} 레시피·엔딩`);
  assert.ok(p.seen.includes(w1 === 'A' ? 'd14_025' : 'd14_026') || r === 'missed');
  if (w1 === 'A') assert.ok(!p.seen.includes('d14_050') && !p.seen.includes('d14_017')); else assert.ok(p.seen.includes('d14_017') && p.seen.includes(r === 'missed' ? 'd14_057' : 'd14_053'));
}
assert.ok(P('A', 'success').seen.includes('d14_031')); assert.ok(P('A', 'partial').seen.includes('d14_033')); assert.ok(P('A', 'fail').seen.includes('d14_035'));
assert.ok(P('A', 'success', { spy: 3 }).seen.includes('d14_011') && P('A', 'success', { spy: 2 }).seen.includes('d14_013'), 'aff.spy ≥ 3 → 반기철 편');
assert.equal(P('A', 'success').set['flag.bagOffered'], 1); assert.ok(!walk(L, 'd14_040', { pick: { d14_041: 1 } }).set['flag.bagOffered']);

// ---------- 판정 ----------
assert.equal(evalE23({ slots: 6, first: true, eggs: 0 }), 'success'); assert.equal(evalE23({ slots: 6, first: true, eggs: 2 }), 'partial'); assert.equal(evalE23({ slots: 6, first: false, eggs: 0 }), 'partial');
assert.equal(evalE23({ slots: 5, first: true }), 'fail'); assert.equal(evalE23({ slots: 4, timeUp: true, checkedOut: false }), 'fail', '300초'); assert.equal(evalE23({ slots: 0, timeUp: true, checkedOut: false }), 'missed'); assert.equal(evalE23({ slots: 0 }), 'missed');
assert.equal(listSlots((id) => ({ egg: 3, water: 1, rice: 2, ramen: 1, tissue: 1 })[id]), 6); assert.equal(listSlots((id) => ({ egg: 1, water: 1 })[id]), 2); assert.equal(LIST.reduce((a, [, n]) => a + n, 0), 6);
const all = e24Checks({ eggs: 0, rivalHits: 0, e17: 'success', coSec: 250, bag: true }); assert.deepEqual(Object.keys(all), Object.keys(E24_LABELS)); assert.equal(evalE24(all), 'success');
assert.equal(evalE24(e24Checks({ eggs: 1, rivalHits: 2, e17: 'partial', coSec: 250, bag: true })), 'partial');
assert.equal(evalE24(e24Checks({ eggs: 1, rivalHits: 0, e17: 'fail', coSec: 320 })), 'fail'); assert.equal(evalE24(e24Checks({ eggs: 0, rivalHits: 0, e17: 'fail', coSec: 999 })), 'partial');
assert.equal(E23.timeLimitSec, L.d14_026.timeLimitSec); assert.equal(E23.bossFinishSec, L.d14_026.versus.bossFinishSec.base);

// ---------- 라이벌 길 · 시간표 ----------
const inObs = (p) => FRONT_OBS.some((o) => p.x > o.x0 + 0.05 && p.x < o.x1 - 0.05 && p.z > o.z0 + 0.05 && p.z < o.z1 - 0.05);
assert.equal(colOf({ x: 55, z: 28.6 }), 53.9); assert.equal(colOf({ x: 47, z: 44 }), null); assert.equal(colOf({ x: 68.5, z: 18 }), 64.2);
{
  const V = versusPlans({ rivals: L.d14_026.versus.rivals, tg });
  assert.ok(Math.abs(V.boss.doneT - 230) < 0.01, `팀장 230초 (${V.boss.doneT})`); assert.ok(V.boss.speed >= 0.6 && V.boss.speed <= 1.25); assert.ok(V.boss.pick >= 4);
  assert.equal(V.boss.waits.filter((w) => w.kind === 'pick').at(-1).list, 6, '팀장 목록 6칸');
  assert.ok(V['pv-1'].doneT < 230 && V['pv-2'].doneT < 230, '보라 카트는 먼저 계산대로');
  for (const [k, p] of Object.entries(V)) for (const leg of p.legs) for (let i = 1; i < leg.pts.length; i++) { const a = leg.pts[i - 1], b = leg.pts[i]; assert.ok(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.z - b.z) < 1e-6, `${k} 축 따라 이동`); for (let u = 0; u <= 1; u += 0.05) assert.ok(!inObs({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }), `${k} 랙 뚫음 ${JSON.stringify(a)}→${JSON.stringify(b)}`); }
  const b0 = rivalAt(V.boss, 0); assert.deepEqual([b0.x, b0.z], [RIVAL_START.boss.x, RIVAL_START.boss.z]); assert.equal(rivalAt(V.boss, 229).phase, 'checkout'); assert.equal(rivalAt(V.boss, 231).phase, 'done');
  assert.ok(Math.abs(rivalAt(V.boss, 300).z - 12.6) < 0.01, '팀장은 NPC 계산대 앞에서 끝');
  const VA = versusPlans({ rivals: L.d14_026.versus.rivals, tg, ally: true }); assert.ok(Math.abs(VA['pv-2'].doneT - V['pv-2'].doneT - 30) < 0.01, '반기철이 pv-2 를 계란 코너에서 30초'); assert.equal(VA.boss.doneT, V.boss.doneT, '팀장 시간 그대로');
  const w = VA['pv-2'].waits[0]; assert.ok(Math.abs(w.at.x - 53.9) < 0.01 && Math.abs(w.at.z - tg['aisle-01-eggs'].z) < 0.01 && w.t1 - w.t0 >= 30);
}
{ // 같은 통로 · 띠 고르기
  assert.deepEqual(pathBetween({ x: 53.9, z: 18.5 }, { x: 53.9, z: 28.6 }), [{ x: 53.9, z: 28.6 }]);
  const p = pathBetween({ x: 59.4, z: 40 }, { x: 47.8, z: 44 }); assert.equal(p[0].z, 44, '북쪽이 가까우면 교차 통로');
  const pl = planRival({ start: { x: 53.9, z: 20 }, stops: [{ x: 53.9, z: 30, list: 1 }, { x: 40, z: 12.6, co: true }], speed: 1, pick: 2, checkout: 5 });
  assert.ok(Math.abs(pl.doneT - (10 + 2 + (17 + 13.9 + 0.4) + 5)) < 0.01, `${pl.doneT}`); assert.equal(rivalAt(pl, 11).phase, 'pick'); assert.equal(rivalAt(pl, 13).list, 1);
}
console.log('depot day14 ok');
