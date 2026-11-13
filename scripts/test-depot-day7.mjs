// [depot-story] 7일차 '본사 감사의 날' — E11 감사(체크 5칸 · 반기철 방해 3번 · 감사관 따라오기) + E09 녹음 + E10 200kg + 엔딩 A/B/C. DOM 없이 동작.
//   node scripts/test-depot-day7.mjs   (npm run depot:day7:test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { E09, E10, E11, SPY_RECT, LEGEND_AT, evalE09, evalE10, evalE11, loadRatio, auditChecks, endingVitality, pickRange, createMelt, createAudit, createFollower, passAxis, rectDist, createDay7Props } from '../src/depot/story/day7.js';
import EVENTS from '../src/depot/story/data/events.json' with { type: 'json' };
import TARGETS from '../src/depot/story/data/targets.json' with { type: 'json' };
import EXIT from '../src/depot/story/data/exit-rules.json' with { type: 'json' };
import CUES from '../src/depot/story/data/audio-cues.json' with { type: 'json' };
import REACT from '../src/depot/story/data/reactions.json' with { type: 'json' };
import D1 from '../src/depot/story/data/day1-script.json' with { type: 'json' };
import D6 from '../src/depot/story/data/day6-script.json' with { type: 'json' };
import D7 from '../src/depot/story/data/day7-script.json' with { type: 'json' };

const ev = Object.fromEntries(EVENTS.events.map((e) => [e.id, e]));
const tg = Object.fromEntries(TARGETS.targets.map((t) => [t.id, t]));
const L7 = Object.fromEntries(D7.map((b) => [b.id, b]));
const idx = readFileSync(new URL('../src/depot/story/index.js', import.meta.url), 'utf8');
const vnSrc = readFileSync(new URL('../src/depot/story/vn.js', import.meta.url), 'utf8');
const EV = EVENTS.endingVitality;

// ---------- 데이터 ↔ 상수 ----------
const a31 = L7.d7_031, side9 = a31.sideMissions.find((x) => x.event === 'E09');
assert.equal(a31.cmd, 'mission.start'); assert.equal(a31.event, 'E11'); assert.equal(a31.onCheckout, 'd7_039'); assert.equal(a31.timeLimitSec, E11.timeLimitSec);
assert.equal(side9.timeLimitSec, E09.timeLimitSec); assert.equal(side9.meltBasePctPerSec, E09.basePct); assert.equal(side9.bumpMeltPct, E09.bumpPct);
assert.equal(ev.E09.melt.crushPct, E09.crushPct); assert.equal(ev.E10.tuning.targetKg, E10.targetKg); assert.equal(ev.E11.tuning.timeLimitSec, E11.timeLimitSec);
assert.equal(a31.audit.spyBlocks.length, 3); assert.equal(a31.audit.auditorFollow.distM, E11.followM);
for (const b of a31.audit.spyBlocks) { const r = SPY_RECT[b.target], t = tg[b.target]; assert.ok(r && t, b.target); assert.ok(Math.abs((r.x0 + r.x1) / 2 - t.x) < 0.7 && Math.abs((r.z0 + r.z1) / 2 - t.z) < 0.7, `${b.target} 중심`); assert.equal(b.triggerDistM, E11.triggerDistM); }
assert.ok(Math.hypot(LEGEND_AT.x - tg['freezer-legend'].x, LEGEND_AT.z - tg['freezer-legend'].z) < E09.pickR, '왕통이 집는 반경 안');
// 랙·매대와 안 겹치고, 옆으로 카트(0.7 m)가 지나갈 틈이 있음
const RACKS = [41.75, 50.15, 55.55, 61.1, 66.65].map((x0) => ({ x0, x1: x0 + 2.2, z0: 14, z1: 41 })).concat([{ x0: 56, x1: 57.3, z0: 41.3, z1: 42.4 }, { x0: 56, x1: 57.3, z0: 45.6, z1: 46.7 }, { x0: 45.25, x1: 46.55, z0: 43.45, z1: 44.55 }]);
const overlap = (a, b) => a.x0 < b.x1 - 1e-3 && a.x1 > b.x0 + 1e-3 && a.z0 < b.z1 - 1e-3 && a.z1 > b.z0 + 1e-3;
for (const [id, r] of Object.entries(SPY_RECT)) for (const o of RACKS) assert.ok(!overlap(r, o), `${id} vs rack`);
assert.ok(50.15 - SPY_RECT['spy-block-1'].x1 > 0.9 && 61.1 - SPY_RECT['spy-block-3'].x1 > 0.9 && 45.6 - SPY_RECT['spy-block-2'].z1 > 0.9, '피할 틈');
assert.equal(passAxis(SPY_RECT['spy-block-1']), 'z'); assert.equal(passAxis(SPY_RECT['spy-block-2']), 'x');
assert.ok(EXIT.auditExit?.return?.includes('d7_029') || JSON.stringify(EXIT).includes('auditExit'));
assert.match(idx, /b === 'd7_031'/, 'auditExit: d7_029 부터'); assert.match(idx, /다시 처음부터 보겠습니다/);
assert.match(idx, /7: 'E10'/);

// ---------- 대본 ----------
const ids = new Set(D7.map((b) => b.id));
const refs = (b) => [b.next, b.resume, b.onMissed, b.onCheckout, b.default, ...(b.choices || []).map((c) => c.goto), ...Object.values(b.cases || {}), ...(b.ranges || []).map((r) => r.goto)].flat().filter((x) => typeof x === 'string' && /^[dw]\d_\d+/.test(x));
for (const b of D7) for (const r of refs(b)) assert.ok(ids.has(r) || r === 'w2_000' || r === 'd1_000', `${b.id} → ${r}`);
assert.equal(D7.length, 89);
assert.equal(L7.d7_180.next, 'w2_000'); assert.equal(L7.d7_190.next, 'd1_000'); assert.equal(D1[0].id, 'd1_000');
assert.equal(L7.d7_180.vitality, 'committed'); assert.equal(L7.d7_180.nextDay.week, 2);
assert.ok(!idx.includes("runFrom(L.next)"), 'day.end 의 next(w2_000)를 따라가지 않음');
assert.match(idx, /2주차 이야기는 준비 중/); assert.match(idx, /1주차 완결/);
assert.match(vnSrc, /function endingCard/); assert.match(vnSrc, /dayLabel/);
for (const b of D7) if (b.speaker === 'spy') assert.equal(b.nameTag, '반기철(반값)', b.id);
for (const b of D7) if (b.speaker === 'auditor') assert.equal(b.nameTag, '본사 감사관', b.id);
const laughs = D7.filter((b) => b.speaker === 'auditor' && b.expression === 'laugh').map((b) => b.id); assert.deepEqual(laughs, ['d7_070', 'd7_100']);
assert.ok(!JSON.stringify(D7).includes('싹쓸마트'));
const d6end = D6.find((b) => b.cmd === 'day.end'); assert.equal(d6end.nextDay.day, 7, '6일차 끝 → 7일차');

// ---------- 소리 ----------
const sfxSrc = readFileSync(new URL('../src/depot/story/sfx.js', import.meta.url), 'utf8');
const syn = new Set([...sfxSrc.matchAll(/^\s+'([\w.-]+)': \[\[/gm)].map((m) => m[1]));
const moods = new Set([...sfxSrc.matchAll(/^\s+'(bgm\.[\w-]+)': \{ bpm/gm)].map((m) => m[1]));
const have = (n) => (CUES.existing?.audioPlay || []).includes(n) || syn.has(n) || /^motif\./.test(n) && syn.has(n);
for (const b of D7) {
  if (b.sfx) assert.ok(have(String(b.sfx).split(/[|\s(]/)[0]), `${b.id} sfx ${b.sfx}`);
  for (const x of b.timed || []) if (x.sfx) assert.ok(have(x.sfx), `${b.id} timed ${x.sfx}`);
  for (const x of b.audit?.spyBlocks || []) assert.ok(have(x.sfx), `${b.id} block ${x.sfx}`);
  if (b.bgm && b.bgm !== 'hold' && b.bgm !== 'bgm.shop') assert.ok(moods.has(b.bgm), `${b.id} bgm ${b.bgm}`);
  if (b.nextDay?.sfx) assert.ok(have(b.nextDay.sfx), `${b.id} nextDay sfx`);
}
for (const e of ['E09', 'E10', 'E11']) for (const x of ev[e].audio.sfx) { const n = x.split(/[|\s(]/)[0]; assert.ok(have(n), `${e} sfx ${n}`); }
for (const id of ['R61', 'R62', 'R63', 'R64']) { assert.ok(REACT.reactions.find((r) => r.id === id), id); assert.match(idx, new RegExp(`fire\\('${id}'`), `${id} 감지`); }

// ---------- 판정 ----------
assert.equal(evalE09({ picked: false, melt: 0 }), 'missed'); assert.equal(evalE09({ picked: true, melt: 49.9 }), 'success');
assert.equal(evalE09({ picked: true, melt: 50 }), 'partial'); assert.equal(evalE09({ picked: true, melt: 100 }), 'fail');
assert.equal(evalE10({ kg: 173, eggs: 0 }), 'success'); assert.equal(evalE10({ kg: 180, eggs: 2 }), 'partial'); assert.equal(evalE10({ kg: 172.9, eggs: 0 }), 'fail');
assert.equal(loadRatio(173 * 0.85, 0), 0.85); assert.equal(loadRatio(10, 0.9), 0.9);
const blk = (s) => [{ state: s }, { state: 'dodged' }, { state: 'wait' }];
let c = auditChecks({ eggs: 0, ratio: 0.9, kg: 180, blocks: blk('dodged'), sec: 400 }); assert.deepEqual(Object.values(c), [true, true, true, true, true]); assert.equal(evalE11(c), 'success');
c = auditChecks({ eggs: 1, ratio: 0.9, kg: 180, blocks: blk('failed'), sec: 400 }); assert.equal(evalE11(c), 'partial'); // c2 c3 c5
c = auditChecks({ eggs: 1, ratio: 0.5, kg: 100, blocks: blk('failed'), sec: 400 }); assert.equal(evalE11(c), 'fail'); // c5 만
c = auditChecks({ eggs: 0, ratio: 0.5, kg: 100, blocks: blk('dodged'), sec: 700 }); assert.equal(evalE11(c), 'partial'); assert.equal(c.c5, false);

// ---------- E09 녹음 ----------
{ const m = createMelt(); m.step(10); assert.equal(m.S.melt, 0, '꺼내기 전엔 안 녹음'); m.pick(); for (let i = 0; i < 100; i++) m.step(1); assert.ok(Math.abs(m.S.melt - 30) < 1e-6); assert.equal(m.result(), 'success');
  m.bump(); m.bump(); m.bump(); m.bump(); assert.ok(Math.abs(m.S.melt - 50) < 1e-6); assert.equal(m.result(), 'partial'); m.crushed(); assert.ok(Math.abs(m.S.melt - 70) < 1e-6);
  for (let i = 0; i < 50; i++) m.step(1); assert.equal(m.S.melt, 100, '150초 지나면 100%'); assert.equal(m.result(), 'fail'); assert.equal(m.left, 0); }
{ const m = createMelt(); m.pick(); for (let i = 0; i < 60; i++) m.step(1); assert.equal(m.result(), 'success'); }

// ---------- E11 반기철 방해 ----------
const BL = a31.audit.spyBlocks.map((b) => ({ ...b, rect: SPY_RECT[b.target] }));
{ // b1: 메인 통로 남쪽에서 올라와 옆 틈으로 지나감 → 피함
  const evs = []; const A = createAudit({ blocks: BL, onEvent: (k, b) => evs.push(`${k}:${b.id}`) });
  for (let i = 0; i < 40; i++) A.step(1, { x: 49.5, z: 12 }); assert.deepEqual(evs, [], '45초 전엔 안 막음');
  A.step(6, { x: 49.5, z: 14 }); assert.deepEqual(evs, ['block:b1']); assert.equal(A.active().side, -1);
  A.step(1, { x: 49.5, z: 26 }); assert.equal(A.ram({ x: 50.1, z: 26 })?.id, undefined, '틈(카트에서 1.3 m 밖)은 밈 아님');
  A.step(1, { x: 49.5, z: 31 }); assert.deepEqual(evs, ['block:b1', 'dodge:b1']);
  assert.equal(A.dodged(), 1);
}
{ // b1: 밀면 실패 (R62)
  const evs = []; const A = createAudit({ blocks: BL, onEvent: (k, b) => evs.push(`${k}:${b.id}`) });
  A.step(46, { x: 46, z: 20 }); assert.equal(A.active()?.id, 'b1'); assert.equal(A.ram({ x: 46, z: 24.6 })?.id, 'b1'); assert.deepEqual(evs, ['block:b1', 'fail:b1']); assert.equal(A.failed(), 1);
  assert.equal(evalE11(auditChecks({ eggs: 0, ratio: 0.9, kg: 180, blocks: A.B, sec: 300 })), 'success', '4개면 통과 (c4 만 실패)');
}
{ // 20초 지나면: 떨어져 있으면(돌아감) 피함, 붙어 있으면 실패
  const evs = []; const A = createAudit({ blocks: BL, onEvent: (k, b) => evs.push(`${k}:${b.id}`) });
  A.step(46, { x: 46, z: 20 }); A.step(21, { x: 46, z: 12 }); assert.deepEqual(evs, ['block:b1', 'dodge:b1']);
  A.step(140, { x: 56, z: 36 }); assert.equal(A.active()?.id, 'b2'); A.step(21, { x: 56, z: 41.4 }); assert.deepEqual(evs.slice(-1), ['fail:b2']);
  A.step(150, { x: 58.7, z: 40 }); assert.equal(A.active()?.id, 'b3'); A.step(1, { x: 60.4, z: 27 }); A.step(1, { x: 60.4, z: 22 }); assert.deepEqual(evs.slice(-1), ['dodge:b3']);
  assert.deepEqual([A.dodged(), A.failed()], [2, 1]);
}
{ // 바로 옆(2.5 m 안)에선 안 막음 · 동시에 하나만
  const A = createAudit({ blocks: BL }); A.step(46, { x: 46, z: 24.5 }); assert.equal(A.active(), null); A.step(1, { x: 46, z: 21 }); assert.equal(A.active()?.id, 'b1');
}
// ---------- 감사관 따라오기 ----------
{ const F = createFollower({ start: { x: 66, z: 6 } }); const p = { x: 66, z: 8 };
  for (let i = 0; i < 400; i++) { p.z = Math.min(40, p.z + 0.05); F.step(1 / 30, p); }
  const d = Math.hypot(F.S.x - p.x, F.S.z - p.z); assert.ok(d > 4.5 && d < 7.5, `6 m 뒤 (${d.toFixed(2)})`); }

// ---------- 엔딩 활기 (endingVitality) · 세 엔딩 ----------
assert.equal(EV.start, 12); assert.equal(EV.start + Object.values(EV.main).reduce((a, b) => a + b, 0), EV.mainMax, '메인 8개 모두 성공 = 94 (시작 12 포함)');
const R = L7.d7_080; assert.equal(R.on, 'meter.vitality'); assert.equal(R.commit, 'today');
const endOf = (evTbl) => { const { vit } = endingVitality(evTbl, EV); const r = pickRange(vit, R.ranges); let cur = r.goto, n = 0; while (cur && L7[cur] && L7[cur].cmd !== 'day.end' && n++ < 80) { const b = L7[cur]; cur = b.next || b.choices?.[0]?.goto; } return { vit, ending: r.ending, end: cur, node: L7[cur] }; };
const all = (r) => Object.fromEntries(Object.keys(EV.main).map((k) => [k, r]));
const A_ = endOf(all('success')); assert.equal(A_.vit, 94, 'README 예시: 메인 8개 모두 성공 = 94 → A');
assert.equal(endingVitality({ ...all('success'), E06: 'success', E09: 'success', E12: 'success' }, EV).vit, 100, '상한 100'); assert.equal(A_.ending, 'A'); assert.equal(A_.end, 'd7_180'); assert.equal(A_.node.nextDay.week, 2);
const B_ = endOf({ E01: 'success', E02: 'success', E03: 'partial', E04: 'success', E05: 'partial', E06: 'success', E09: 'partial' }); // 12+10+10+6+10+6+6+3 = 63
assert.equal(B_.vit, 63); assert.equal(B_.ending, 'B'); assert.equal(B_.end, 'd7_180');
const C_ = endOf({ E01: 'success', E02: 'success', E03: 'fail', E07: 'missed', E10: 'fail' }); // 32 → C (README 예시)
assert.equal(C_.vit, 32); assert.equal(C_.ending, 'C'); assert.equal(C_.end, 'd7_190'); assert.equal(C_.node.next, 'd1_000'); assert.equal(C_.node.nextDay.retry, true);
assert.equal(endingVitality({ E12: 'success', E13: 'partial', E14: 'fail' }, EV).vit, 12 + 5 + 1, '사이드도 더함 (부분 = 절반 내림)');
assert.equal(pickRange(70, R.ranges).ending, 'A'); assert.equal(pickRange(69, R.ranges).ending, 'B'); assert.equal(pickRange(45, R.ranges).ending, 'B'); assert.equal(pickRange(44, R.ranges).ending, 'C');
// C 재도전: 단골도·도장 유지, 활기·사건은 처음으로
assert.match(idx, /function retryWeek\(\)[^]*save\.day = 1; save\.vitality = EVENTS\.endingVitality\?\.start \?\? 12; save\.ev = \{\}/);
assert.ok(!/function retryWeek\(\)[^}]*save\.(aff|stamps) =/.test(idx), '단골도·도장은 그대로');
console.log('endings', { A: A_.vit, B: B_.vit, C: C_.vit });

// ---------- 소품 ----------
{
  const scene = new THREE.Scene(), kept = []; const keep = (o) => (kept.push(o), o), obstacles = [{ x0: 0, x1: 1, z0: 0, z1: 1 }];
  const cartObj = new THREE.Group(); scene.add(cartObj);
  const p = createDay7Props({ THREE, scene, keep, cartObj, obstacles });
  const count = () => { let m = 0, t = 0; scene.traverse((o) => { if (o.isMesh) { m++; t += o.geometry.attributes.position.count / 3; } }); return { m, t }; };
  p.auditor({ x: 66, z: 6, yaw: 0 }); p.legend('freezer'); p.spyCart(SPY_RECT['spy-block-1'], 1);
  const a = count(); console.log('E11 props', a); assert.equal(a.m, 3); assert.ok(a.t < 400, `tris ${a.t}`);
  assert.equal(obstacles.length, 2); assert.equal(obstacles[1].story, 'e11');
  assert.ok(rectDist(SPY_RECT['spy-block-1'], 46, 26) === 0);
  p.legend('cart', 40); assert.equal(cartObj.children.length, 1); assert.equal(p.stats().legend, 'cart'); assert.ok(p.legendWorld());
  p.spyCart(null); assert.equal(obstacles.length, 1);
  p.dispose(); assert.equal(cartObj.children.length, 0); assert.equal(scene.children.length, 1); assert.equal(obstacles.length, 1);
}
console.log('depot day7 ok');
