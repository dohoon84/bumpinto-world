// [depot-story] 12일차 '새벽 3시, 둘이서' — E21 잠입(지게차 2대) + 반기철 카트 3 m 뒤 따라오기 · 덜컹 소음 · 나가면 놓침(afterCheckout). DOM 없이 동작.
//   node scripts/test-depot-day12.mjs   (npm run depot:day12:test)
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { E21, nextNoise, spyCartAt, spyPoints, SPY_SHELF, createDay12Props } from '../src/depot/story/day12.js';
import { createStealth, forkliftLanes, E08 } from '../src/depot/story/day6.js';
import { createFollower } from '../src/depot/story/day7.js';
import EVENTS from '../src/depot/story/data/events.json' with { type: 'json' };
import TARGETS from '../src/depot/story/data/targets.json' with { type: 'json' };
import EXIT from '../src/depot/story/data/exit-rules.json' with { type: 'json' };
import D11 from '../src/depot/story/data/day11-script.json' with { type: 'json' };
import D12 from '../src/depot/story/data/day12-script.json' with { type: 'json' };
import { idx, checkRefs, checkSfx, walk, countScene } from './depot-story-testlib.mjs';

const ev = Object.fromEntries(EVENTS.events.map((e) => [e.id, e]));
const tg = Object.fromEntries(TARGETS.targets.map((t) => [t.id, t]));
const L = Object.fromEntries(D12.map((b) => [b.id, b]));

// ---------- 데이터 ----------
assert.equal(D12[0].id, 'd12_000'); assert.equal(D11.find((b) => b.cmd === 'day.end').next, 'd12_000');
checkRefs(D12, ['d13_000']);
assert.equal(L.d12_026.event, 'E21'); assert.equal(L.d12_026.onMissed, 'd12_048'); assert.equal(L.d12_060.cmd, 'day.end'); assert.equal(L.d12_060.next, 'd13_000');
assert.ok(/12: 'E21'/.test(idx), String(/12: 'E21'/)); assert.ok(/AFTER_CO = new Set\(\[[^\]]*'E21'/.test(idx), String(/AFTER_CO = new Set\(\[[^\]]*'E21'/)); assert.ok(/이야기는 준비 중이에요/.test(idx), String(/이야기는 준비 중이에요/));
assert.equal(EVENTS.week2Vitality.main.E21, 8);
for (const b of D12) if (b.stage) for (const [, at] of Object.entries(b.stage)) if (at) assert.ok(tg[at], `${b.id} ${at}`);
checkSfx(D12, [ev.E21]);
// 나가기(afterCheckout): 새벽 사건 중 나가면 E21 놓침 · 메모 플래그 · 12일차 끝 카드로
assert.ok(/d === 12 && wasLeft\?\.kind === 'event'[^\n]*d12_015[^\n]*d12_030/.test(idx), String(/d === 12 && wasLeft\?\.kind === 'event'[^\n]*d12_015[^\n]*d12_030/)); assert.ok(/save\.flags\.recipeClue = 1; persist\(\); runFrom\('d12_060'\)/.test(idx), String(/save\.flags\.recipeClue = 1; persist\(\); runFrom\('d12_060'\)/));
assert.match(idx, /d === 12 && b \? \(b >= 'd12_015' && b < 'd12_030' \? 2/, '이어 하기: 새벽 화면');
void EXIT;

// 경로: 성공 · 부분 · 실패 · 거절 · 90초 놓침 — 모두 메모(recipeClue)
const P = (r, extra = {}) => walk(L, 'd12_000', { ev: { E20: 'success', E21: r }, mission: { E21: r }, ...extra });
const ok = P('success'), part = P('partial'), bad = P('fail'), no = P('missed', { pick: { d12_024: 2 } }), late = P('missed');
for (const p of [ok, part, bad, no, late]) { assert.equal(p.end, 'd12_060'); assert.equal(p.set['flag.recipeClue'], 1, '메모는 결과 무관'); for (const [w, at] of Object.entries(p.stage)) assert.ok(at === null || (w === 'spy' && at === 'secret-shelf'), `stage ${w} ${at}`); } // 비밀 칸 반기철은 day.end clearStage 로 치움
assert.ok(/async function endDay[\s\S]{0,600}clearStage\(\)/.test(idx), String(/async function endDay[\s\S]{0,600}clearStage\(\)/));
assert.ok(ok.seen.includes('d12_031') && ok.seen.includes('d12_003')); assert.ok(part.seen.includes('d12_033')); assert.ok(bad.seen.includes('d12_035') && bad.seen.includes('d12_036'));
assert.ok(no.seen.includes('d12_048') && !no.seen.includes('d12_026')); assert.ok(late.seen.includes('d12_026') && late.seen.includes('d12_048')); assert.deepEqual(L.d12_048.markMissed, ['E21']);
assert.ok(P('success', { ev: { E20: 'fail' } }).seen.includes('d12_004'));

// ---------- 수치 ----------
assert.equal(E21.timeLimitSec, L.d12_026.timeLimitSec); assert.equal(E21.startWithinSec, L.d12_026.startWithinSec); assert.equal(E21.followM, L.d12_026.follow.distM);
assert.deepEqual(E21.noiseEverySec, L.d12_026.follow.noiseEverySec); assert.equal(nextNoise(0), 25); assert.equal(nextNoise(1), 40);
{ const c = spyCartAt({ x: 10, z: 10, yaw: Math.PI / 2 }); assert.ok(Math.abs(c.x - 10.95) < 1e-9 && Math.abs(c.z - 10) < 1e-9, '카트는 사람 앞'); assert.equal(spyPoints({ x: 0, z: 0, yaw: 0 }).length, 2); }
assert.ok(SPY_SHELF.z < 115.95 && SPY_SHELF.z > 113, '비밀 칸 앞 낮은 단(z 115.95–) 앞 바닥');

// ---------- 잠입 + 따라오기 시뮬레이션 ----------
{
  const lanes = forkliftLanes(TARGETS.targets.reduce((a, t) => ((a[t.id] = t), a), {}), ['forklift-lane-back', 'forklift-lane-cross']);
  const shelf = { x: 58, z: 115.2 }, mat = { x: 69, z: 2.5 };
  // 반기철 점만 불빛 안: 1.5초 넘게 → 걸림 1 (플레이어는 멀리)
  const evs = []; const s = createStealth({ lanes, speeds: [0, 0], shelf, mat, cps: [shelf], t: { ...E08, caughtSec: E21.caughtSec, timeLimitSec: 210, startWithinSec: 90 }, onEvent: (k) => evs.push(k) });
  s.step(0.1, { x: shelf.x, z: shelf.z }); assert.ok(s.S.picked);
  const f = s.F[0], spot = { x: f.x + f.dx * 3, z: f.z + f.dz * 3 };
  s.F.forEach((g) => { g.speed = 0; });
  for (let i = 0; i < 12; i++) s.step(0.1, { x: 200, z: 200, extra: [spot] }); assert.equal(s.S.caught, 0, '1.2초는 아직');
  for (let i = 0; i < 6; i++) s.step(0.1, { x: 200, z: 200, extra: [spot] }); assert.equal(s.S.caught, 1, '반기철 카트도 불빛 1.5초 → 걸림'); assert.ok(evs.includes('reset'));
  const n = s.noise(f.x + 2, f.z); assert.ok(n, '덜컹 → 가까운 지게차가 돌아봄'); assert.equal(n.lookT, E08.lookSec);
  // 따라오기: 3 m 뒤
  const fo = createFollower({ start: { x: 0, z: -3 }, distM: E21.followM, speed: 2.4 }); let z = 0;
  for (let i = 0; i < 200; i++) { z += 0.02; fo.step(0.05, { x: 0, z }); } assert.ok(Math.abs(z - fo.S.z - 3) < 0.4, `3 m 뒤 (${(z - fo.S.z).toFixed(2)})`);
  for (let i = 0; i < 60; i++) fo.step(0.05, { x: 0, z }); assert.ok(fo.S.v === 0, '내가 멈추면 반기철도 멈춤');
}

// ---------- 소품 ----------
{
  const scene = new THREE.Scene(), kept = []; const keep = (o) => (kept.push(o), o);
  const p = createDay12Props({ THREE, scene, keep }); p.spyCart({ x: 60, z: 100, yaw: 0 });
  const a = countScene(scene); console.log('E21 props', a, p.stats()); assert.equal(a.m, 1); assert.ok(a.t < 200, `tris ${a.t}`);
  p.spyCart(null); assert.equal(scene.children.length, 0); p.dispose();
}
console.log('depot day12 ok');
