// [depot-story] 13일차 '방송실 문이 열린다' — E22 무대 설치(정밀 주차 4칸) · 오미숙 공개(이름표 교체) · 방송실 문 · 레시피 반쪽. DOM 없이 동작.
//   node scripts/test-depot-day13.mjs   (npm run depot:day13:test)
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { E22, evalE22, createParking, cartHeadingDeg, angDiff, createDay13Props, DOOR_AT } from '../src/depot/story/day13.js';
import EVENTS from '../src/depot/story/data/events.json' with { type: 'json' };
import TARGETS from '../src/depot/story/data/targets.json' with { type: 'json' };
import EXIT from '../src/depot/story/data/exit-rules.json' with { type: 'json' };
import REACT from '../src/depot/story/data/reactions.json' with { type: 'json' };
import D12 from '../src/depot/story/data/day12-script.json' with { type: 'json' };
import D13 from '../src/depot/story/data/day13-script.json' with { type: 'json' };
import { idx, checkRefs, checkSfx, walk, countScene, overlap, FRONT_OBS } from './depot-story-testlib.mjs';

const ev = Object.fromEntries(EVENTS.events.map((e) => [e.id, e]));
const tg = Object.fromEntries(TARGETS.targets.map((t) => [t.id, t]));
const L = Object.fromEntries(D13.map((b) => [b.id, b]));

// ---------- 데이터 ----------
assert.equal(D13[0].id, 'd13_000'); assert.equal(D12.find((b) => b.cmd === 'day.end').next, 'd13_000');
checkRefs(D13, ['d14_000']);
assert.equal(L.d13_017.event, 'E22'); assert.equal(L.d13_017.onMissed, 'd13_038'); assert.equal(L.d13_070.next, 'd14_000');
assert.ok(/13: 'E22'/.test(idx), String(/13: 'E22'/)); assert.ok(/E22: 'stage-area'/.test(idx), String(/E22: 'stage-area'/)); assert.ok(/이야기는 준비 중이에요/.test(idx), String(/이야기는 준비 중이에요/));
assert.equal(EVENTS.week2Vitality.main.E22, 10); assert.deepEqual(EXIT.ignoreEvent.chainMissed.d13_017, ['E22']);
for (const b of D13) if (b.stage) for (const [, at] of Object.entries(b.stage)) if (at) assert.ok(tg[at], `${b.id} ${at}`);
checkSfx(D13, [ev.E22]);
for (const id of ['R73', 'R74']) { assert.ok(REACT.reactions.find((r) => r.id === id)); assert.ok(new RegExp(`fire\\('${id}'\\)`).test(idx), String(new RegExp(`fire\\('${id}'\\)`))); }
assert.equal(REACT.reactions.find((r) => r.id === 'R67').nameTagAfter.nameTag, '오미숙 팀장');
// 이름표: 공개 전 '경쟁 마트 팀장' → rivalNamed 뒤 '오미숙 팀장' (lineView · 시간 대사 · 반응)
assert.equal(L.d13_046.nameTag, '경쟁 마트 팀장'); assert.equal(L.d13_049.nameTag, '오미숙 팀장');
assert.ok(L.d13_053.choices.every((c) => c.set['flag.rivalNamed'] === 1), '두 선택지 모두 rivalNamed');
assert.ok(/RIVAL_NAME = '오미숙 팀장'/.test(idx), String(/RIVAL_NAME = '오미숙 팀장'/)); assert.ok(/const rivalNamed = /.test(idx), String(/const rivalNamed = /));
// 레시피 반쪽(cutIn) · 방송실 문
assert.ok(/d13_047: \(\) => recipeCanvas\('half'\)/.test(idx), String(/d13_047: \(\) => recipeCanvas\('half'\)/)); assert.ok(/'d13_048'/.test(idx), String(/'d13_048'/)); assert.equal(L.d13_047.ui, 'recipe-half');
assert.ok(/L\.id === 'd13_043'\) d13\.door\(true\)/.test(idx), String(/L\.id === 'd13_043'\) d13\.door\(true\)/)); assert.equal(L.d13_043.sfx, 'door-creak');
assert.ok(DOOR_AT.z < 0.5 && Math.abs(DOOR_AT.x - tg['customer-desk'].x) < 3.5 && (DOOR_AT.x + 0.6 < 65), '문은 앞벽 · 창구 옆 · 출입문(65–) 밖');

// ---------- 무대 자리 (개발에서 옮김) ----------
const area = tg['stage-area']; assert.ok(area.moved, 'targets.json 에 옮긴 이유');
for (const o of FRONT_OBS) assert.ok(!overlap(area, o), `stage-area 가 장애물과 겹침 ${JSON.stringify(o)}`);
const slots = [1, 2, 3, 4].map((k) => tg[`stage-slot-${k}`]);
for (const s of slots) { const r = { x0: s.x - 0.8, x1: s.x + 0.8, z0: s.z - 0.8, z1: s.z + 0.8 }; for (const o of FRONT_OBS) assert.ok(!overlap(r, o), `${s.id} 겹침 ${JSON.stringify(o)}`); assert.ok(s.x > area.x0 && s.x < area.x1 && s.z > area.z0 && s.z < area.z1); assert.equal(s.headingDeg, 0); }
assert.ok(FRONT_OBS.filter((o) => o.z0 < 15 && o.z1 > 13.5 && o.x0 < 65.09 && o.x1 > 63.3).length === 0, '앞쪽 띠 → 무대: x 63.3–65.09 틈');

// 경로
const P = (r, extra = {}) => walk(L, 'd13_000', { ev: { E21: 'success', E22: r }, flags: { w1Ending: 'A' }, mission: { E22: r }, ...extra });
const ok = P('success'), part = P('partial'), bad = P('fail', { flags: { w1Ending: 'B' } }), miss = P('missed', { pick: { d13_015: 2 } });
for (const p of [ok, part, bad, miss]) { assert.equal(p.end, 'd13_070'); assert.equal(p.set['flag.rivalNamed'], 1, '공개는 결과 무관'); assert.ok(p.seen.includes('d13_046') && p.seen.includes('d13_047')); for (const [w, at] of Object.entries(p.stage)) assert.equal(at, null, `stage ${w} 치움`); }
assert.ok(ok.seen.includes('d13_031') && ok.seen.includes('d13_013')); assert.ok(part.seen.includes('d13_033')); assert.ok(bad.seen.includes('d13_035') && bad.seen.includes('d13_014'));
assert.ok(miss.seen.includes('d13_038') && !miss.seen.includes('d13_017')); assert.deepEqual(L.d13_038.markMissed, ['E22']);

// ---------- E22 판정 ----------
assert.equal(evalE22({ ok: 4, placed: 4 }), 'success'); assert.equal(evalE22({ ok: 3, placed: 4 }), 'partial'); assert.equal(evalE22({ ok: 2, placed: 4 }), 'partial');
assert.equal(evalE22({ ok: 1, placed: 4 }), 'fail'); assert.equal(evalE22({ ok: 3, placed: 3, timeUp: true }), 'fail', '180초 초과 = 실패');
assert.equal(evalE22({ ok: 0, placed: 0, timeUp: true }), 'missed', '한 팩도 안 놓음');
assert.equal(E22.timeLimitSec, L.d13_017.timeLimitSec); assert.equal(E22.tolM, L.d13_017.parking.tolM); assert.equal(E22.tolDeg, L.d13_017.parking.tolDeg); assert.equal(E22.holdSec, L.d13_017.parking.holdSec); assert.equal(E22.maxSpeed, L.d13_017.parking.maxSpeed);
assert.ok(Math.abs(cartHeadingDeg(Math.PI)) < 1e-6, 'yaw π = 앞 +z = 0°'); assert.equal(Math.round(angDiff(cartHeadingDeg(Math.PI + 0.3), 0)), 17); assert.equal(angDiff(350, 10), 20);

// ---------- 칸 시뮬레이션 ----------
{
  const evs = []; const pk = createParking({ slots: slots.map((s) => ({ x: s.x, z: s.z, headingDeg: 0 })), onEvent: (k, i, a) => k === 'place' && evs.push([i, a]) });
  const at = (x, z, yaw, n, packs = 4, speed = 0.05) => { for (let i = 0; i < n; i++) pk.step(0.1, { x, z, yaw, speed, packs }); };
  at(slots[0].x + 0.2, slots[0].z, Math.PI, 14); assert.equal(pk.S.placed, 0, '1.4초는 아직'); at(slots[0].x + 0.2, slots[0].z, Math.PI, 2); assert.deepEqual(evs[0], [0, true]);
  at(slots[1].x, slots[1].z, Math.PI, 20, 3, 0.3); assert.equal(pk.S.placed, 1, '0.15 m/s 넘으면 안 내려놓음');
  at(slots[1].x, slots[1].z, Math.PI, 20, 0); assert.equal(pk.S.placed, 1, '범콜라 없으면 안 내려놓음');
  at(slots[1].x, slots[1].z, Math.PI + 0.5, 16, 3); assert.deepEqual(evs[1], [1, false], '29° = 삐뚤');
  at(slots[2].x + 0.8, slots[2].z, Math.PI, 16, 2); assert.deepEqual(evs[2], [2, false], '0.8 m = 칸 밖');
  at(slots[3].x, slots[3].z - 0.5, Math.PI - 0.2, 16, 1); assert.deepEqual(evs[3], [3, true]);
  assert.ok(pk.S.done); assert.equal(pk.S.ok, 2); assert.equal(evalE22(pk.S), 'partial');
  at(slots[0].x, slots[0].z, Math.PI, 20); assert.equal(pk.S.placed, 4, '다 차면 끝');
}

// ---------- 소품 ----------
{
  const scene = new THREE.Scene(), kept = []; const keep = (o) => (kept.push(o), o);
  const p = createDay13Props({ THREE, scene, keep, look: () => ({ geo: keep(new THREE.BoxGeometry(0.39, 0.306, 0.286)), mat: keep(new THREE.MeshLambertMaterial()) }) });
  const PP = slots.map((s, i) => ({ i, x: s.x, z: s.z, h: 0, filled: true, ok: i !== 1, a: 25 }));
  p.slots(PP); p.packs(PP, 'tilt'); p.door(true);
  const a = countScene(scene); console.log('E22 props', a, p.stats()); assert.equal(a.m, 4, '데칼 1 + 팩 1 + 판 1 + 문 1'); assert.ok(a.t < 2500, `tris ${a.t}`);
  assert.deepEqual(p.stats(), { slots: 4, packs: 4, plank: 'tilt', door: true });
  p.packs(PP, 'level'); assert.equal(p.stats().plank, 'level'); p.packs(PP.slice(0, 3).concat([{ ...PP[3], filled: false }]), 'level'); assert.equal(p.stats().plank, null, '4칸 다 안 차면 판 없음');
  p.dispose(); assert.equal(scene.children.length, 0);
}
console.log('depot day13 ok');
