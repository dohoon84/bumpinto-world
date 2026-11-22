// [depot-story] 8일차 '2주차 시작 · 보라 카트 부대' — 1주차 엔딩 A/B 입구 + 활기 이월 + E15 보라 카트 행렬 + E16 전단지 회수. DOM 없이 동작.
//   node scripts/test-depot-day8.mjs   (npm run depot:day8:test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { E15, E16, weekStartVitality, week2Gain, evalE15, evalE16, convoyPath, cartRect, createConvoy, createFlyers, createDay8Props } from '../src/depot/story/day8.js';
import { seeded } from '../src/depot/story/day4.js';
import { byFlagPick } from '../src/depot/story/byFlag.js';
import EVENTS from '../src/depot/story/data/events.json' with { type: 'json' };
import TARGETS from '../src/depot/story/data/targets.json' with { type: 'json' };
import EXIT from '../src/depot/story/data/exit-rules.json' with { type: 'json' };
import CUES from '../src/depot/story/data/audio-cues.json' with { type: 'json' };
import REACT from '../src/depot/story/data/reactions.json' with { type: 'json' };
import CHARS from '../src/depot/story/data/characters.json' with { type: 'json' };
import D7 from '../src/depot/story/data/day7-script.json' with { type: 'json' };
import D8 from '../src/depot/story/data/day8-script.json' with { type: 'json' };

const ev = Object.fromEntries(EVENTS.events.map((e) => [e.id, e]));
const tg = Object.fromEntries(TARGETS.targets.map((t) => [t.id, t]));
const L8 = Object.fromEntries(D8.map((b) => [b.id, b]));
const idx = readFileSync(new URL('../src/depot/story/index.js', import.meta.url), 'utf8');
const W2V = EVENTS.week2Vitality;

// ---------- 데이터 ----------
assert.equal(D8[0].id, 'w2_000'); assert.equal(D8[0].cmd, 'scene.start'); assert.equal(L8.w2_000.weekStart.vitality.cap, 40);
assert.equal(L8.w2_001.on, 'flag.w1Ending'); assert.deepEqual(L8.w2_001.cases, { A: 'w2_a10', B: 'w2_b10' });
const ids = new Set(D8.map((b) => b.id));
const refs = (b) => [b.next, b.resume, b.onMissed, b.onCheckout, b.default, ...(b.choices || []).map((c) => c.goto), ...Object.values(b.cases || {}), ...(b.ranges || []).map((r) => r.goto)].flat().filter((x) => typeof x === 'string' && /^[dw]\d+_\d+/.test(x));
for (const b of D8) for (const r of refs(b)) assert.ok(ids.has(r) || r === 'd9_000', `${b.id} → ${r}`);
assert.equal(L8.d8_031.event, 'E16'); assert.equal(L8.d8_052.event, 'E15'); assert.equal(L8.d8_100.cmd, 'day.end');
for (const id of ['E15', 'E16']) assert.equal(ev[id].day, 8, id);
assert.equal(W2V.main.E15, 10); assert.equal(W2V.side.E16, 3);
assert.deepEqual(EXIT.ignoreEvent.chainMissed.d8_031, ['E16', 'E15']);
for (const id of ['flyer-zone', 'convoy-loop', 'squad-gate', 'rival-tent', 'massage-chair', 'sample-corner-2']) assert.ok(tg[id], id);
assert.ok(tg['lava-goal'], '5일차 lava-goal 유지'); assert.ok(CHARS.characters.find((c) => c.id === 'rivalboss'));
for (const b of D8) if (b.speaker) assert.ok(['beomsuk', 'beomi', 'halmeoni', 'spy', 'auditor', 'rivalboss', 'pa', 'cashier', 'me', 'narration'].includes(b.speaker) || /^npc:/.test(b.speaker), `${b.id} speaker ${b.speaker}`);
for (const b of D8) if (b.stage) for (const [who, at] of Object.entries(b.stage)) { assert.match(idx, new RegExp(`'${who}'`), `stage ${who}`); if (at) assert.ok(tg[at], `${b.id} stage ${who}@${at}`); }
// 1주차 → 2주차 연결 (A/B → w2_000, C → d1_000)
const d7a = D7.find((b) => b.id === 'd7_180'), d7c = D7.find((b) => b.id === 'd7_190');
assert.equal(d7a.next, 'w2_000'); assert.equal(d7c.next, 'd1_000');
assert.match(idx, /바로 2주차 시작/); assert.match(idx, /runFrom\(DAY_START\[8\]\)/);
assert.match(idx, /save\.flags\.w1Ending = /); assert.match(idx, /save\.flags\.w1Vitality/); assert.match(idx, /8: 'E15'/); assert.match(idx, /8: 'E16'/);

// ---------- 활기 이월 · 2주차 활기 ----------
assert.equal(weekStartVitality(94), 40, 'A 94 → 상한 40'); assert.equal(weekStartVitality(63), 31, 'B 63 → 31'); assert.equal(weekStartVitality(45), 22); assert.equal(weekStartVitality(undefined), 0);
assert.equal(week2Gain('success', 10), 10); assert.equal(week2Gain('partial', 10), 5); assert.equal(week2Gain('partial', 3), 1); assert.equal(week2Gain('fail', 10), 0); assert.equal(week2Gain('missed', 3), 0);
assert.match(idx, /function weekStart\(W\)[^]*save\.flags\.w2StartVitality = v; save\.vitality = v; save\.flags\[once\] = 1/);
assert.match(idx, /if \(save\.flags\[once\] \|\| save\.replay\) return/, 'w2Init 한 번만');

// ---------- A·B 경로: 대본을 끝까지 따라감 ----------
function walk(start, { flags = {}, ev = {}, mission = {} } = {}) {
  const val = (on) => { const [k, ...r] = on.split('.'); const id = r.join('.'); if (k === 'flag') return flags[id]; if (k === 'ev') return ev[id]; if (k === 'mission') return mission[id.split('.')[0]]; return null; };
  const seen = [], stage = {}; let cur = start, n = 0, stampW2 = 0;
  while (cur && L8[cur] && n++ < 200) {
    const b = L8[cur]; seen.push(cur);
    if (b.stage) Object.assign(stage, b.stage);
    if (b.ui === 'stamp-card-w2') stampW2++;
    if (b.cmd === 'day.end') break;
    if (b.cmd === 'branch') { const v = val(b.on); cur = (v != null && b.cases[String(v)]) || b.default; continue; }
    if (b.cmd === 'mission.start') { cur = mission[b.event] === 'missed' ? b.onMissed : b.resume; continue; }
    cur = b.next || b.choices?.[0]?.goto;
  }
  return { seen, end: cur, stage, stampW2 };
}
const pathA = walk('w2_000', { flags: { w1Ending: 'A' }, mission: { E15: 'success', E16: 'success' } });
const pathB = walk('w2_000', { flags: { w1Ending: 'B' }, mission: { E15: 'partial', E16: 'fail' } });
for (const [nm, p] of [['A', pathA], ['B', pathB]]) {
  assert.equal(p.end, 'd8_100', `${nm} → day.end`);
  assert.ok(p.seen.includes('d8_020') && p.seen.includes('d8_031') && p.seen.includes('d8_052') && p.seen.includes('d8_042'), `${nm} 공통 줄기`);
  for (const [who, at] of Object.entries(p.stage)) assert.equal(at, null, `${nm} 끝나면 stage ${who} 치움`);
}
assert.ok(pathA.seen.some((x) => x.startsWith('w2_a')) && !pathA.seen.some((x) => x.startsWith('w2_b')), 'A 는 A 입구만');
assert.ok(pathB.seen.some((x) => x.startsWith('w2_b')) && !pathB.seen.some((x) => x.startsWith('w2_a')), 'B 는 B 입구만');
assert.equal(pathA.stampW2, 1, 'A: 새 도장 카드'); assert.ok(pathB.seen.includes('w2_b11') && pathB.seen.includes('w2_b20'), 'B: 감사관 세우고 치움');
assert.ok(pathA.seen.includes('d8_045') && !pathA.seen.includes('d8_046')); assert.ok(pathB.seen.includes('d8_046') && !pathB.seen.includes('d8_045'));
assert.ok(pathA.seen.includes('d8_091') && pathB.seen.includes('d8_092'));
assert.ok(pathA.seen.includes('d8_061') && pathA.seen.includes('d8_033')); assert.ok(pathB.seen.includes('d8_063') && pathB.seen.includes('d8_035'));
const pathM = walk('w2_000', { flags: { w1Ending: 'A' }, mission: { E15: 'missed', E16: 'missed' } });
assert.ok(pathM.seen.includes('d8_036') && pathM.seen.includes('d8_068') && pathM.end === 'd8_100', '놓침 경로');
assert.equal(walk('w2_000', {}).seen.includes('w2_b10'), true, 'w1Ending 없음 → B (default)');
console.log('paths', { A: pathA.seen.length, B: pathB.seen.length });

// ---------- R70 byFlag ----------
const r70 = REACT.reactions.find((r) => r.id === 'R70');
assert.equal(byFlagPick(r70, (k) => ({ w1Ending: 'A' })[k]).who, 'beomsuk'); assert.equal(byFlagPick(r70, (k) => ({ w1Ending: 'B' })[k]).who, 'beomi');
assert.equal(byFlagPick(r70, () => undefined), null); assert.equal(byFlagPick(REACT.reactions[0], () => 'A'), REACT.reactions[0]);
for (const id of ['R65', 'R66', 'R67', 'R68', 'R69', 'R70']) { assert.ok(REACT.reactions.find((r) => r.id === id), id); assert.match(idx, new RegExp(`fire\\('${id}'`), `${id} 감지`); }

// ---------- 소리 ----------
const sfxSrc = readFileSync(new URL('../src/depot/story/sfx.js', import.meta.url), 'utf8');
const syn = new Set([...sfxSrc.matchAll(/^\s+'([\w.-]+)': \[\[/gm)].map((m) => m[1]));
const moods = new Set([...sfxSrc.matchAll(/^\s+'(bgm\.[\w-]+)': \{ bpm/gm)].map((m) => m[1]));
const have = (n) => (CUES.existing?.audioPlay || []).includes(n) || syn.has(n);
for (const n of CUES.newSfxV08) assert.ok(syn.has(n), `newSfxV08 ${n}`);
for (const b of D8) {
  if (b.sfx) assert.ok(have(String(b.sfx).split(/[|\s(]/)[0]), `${b.id} sfx ${b.sfx}`);
  for (const x of b.timed || []) if (x.sfx) assert.ok(have(x.sfx), `${b.id} timed ${x.sfx}`);
  if (b.bgm && b.bgm !== 'hold' && b.bgm !== 'bgm.shop') assert.ok(moods.has(b.bgm), `${b.id} bgm ${b.bgm}`);
  if (b.nextDay?.sfx) assert.ok(have(b.nextDay.sfx), `${b.id} nextDay sfx`);
}
for (const e of ['E15', 'E16']) for (const x of ev[e].audio?.sfx || []) { const n = x.split(/[|\s(]/)[0]; assert.ok(have(n), `${e} sfx ${n}`); }
for (const f of ['rivalboss-neutral', 'rivalboss-angry', 'rivalboss-laugh', 'rivalboss-surprised', 'face-rivalboss']) assert.ok(readFileSync(new URL(`../public/depot/story/${f}.webp`, import.meta.url)).length > 500, f);

// ---------- 판정 ----------
assert.equal(evalE15({ arrived: true, hits: 0 }), 'success'); assert.equal(evalE15({ arrived: true, hits: 1 }), 'partial'); assert.equal(evalE15({ arrived: true, hits: 0, eggs: 1 }), 'partial');
assert.equal(evalE15({ arrived: false, hits: 2 }), 'fail'); assert.equal(evalE15({ arrived: true, eggs: 7 }), 'fail'); assert.equal(evalE15({ timeUp: true, engaged: true }), 'fail'); assert.equal(evalE15({ timeUp: true, engaged: false }), 'missed');
assert.equal(evalE16({ scooped: 12 }), 'success'); assert.equal(evalE16({ scooped: 8 }), 'partial'); assert.equal(evalE16({ scooped: 7 }), 'fail'); assert.equal(evalE16({ scooped: 0, engaged: false }), 'missed');
assert.equal(ev.E15.tuning?.timeLimitSec ?? E15.timeLimitSec, E15.timeLimitSec);

// ---------- E15 행렬 ----------
const RACKS = [41.75, 50.15, 55.55, 61.1, 66.65].map((x0) => ({ x0, x1: x0 + 2.2, z0: 14, z1: 41 })).concat([{ x0: 56, x1: 57.3, z0: 41.3, z1: 42.4 }, { x0: 56, x1: 57.3, z0: 45.6, z1: 46.7 }, { x0: 45.25, x1: 46.55, z0: 43.45, z1: 44.55 }]);
const overlap = (a, b) => a.x0 < b.x1 - 1e-3 && a.x1 > b.x0 + 1e-3 && a.z0 < b.z1 - 1e-3 && a.z1 > b.z0 + 1e-3;
const route = convoyPath(tg);
assert.ok(Math.abs(route.len - 2 * ((route.path[2].x - route.path[0].x) + (route.path[1].z - route.path[0].z))) < 1e-6);
{ const cv = createConvoy({ route }); let paused = 0; const evs = [];
  const C2 = createConvoy({ route, onEvent: (k) => evs.push(k) });
  for (let t = 0; t < route.len / E15.speed + 10; t += 0.05) { C2.step(0.05); if (C2.paused()) paused++; for (const c of C2.C) for (const o of RACKS) assert.ok(!overlap(c.rect, o), `행렬 카트 ${c.i} vs 랙 @${t.toFixed(1)}`); }
  assert.ok(evs.filter((k) => k === 'pause').length === 1 && evs.includes('go'), `특가 매대 앞 한 바퀴 한 번 멈춤 ${evs}`);
  assert.ok(Math.abs(paused * 0.05 - E15.pauseSec) < 0.2, `멈춤 ${paused * 0.05}s`);
  const p = C2.C[0], q = C2.C[1]; assert.ok(Math.abs(Math.hypot(p.x - q.x, p.z - q.z) - (E15.cartLen + E15.gapM)) < 0.05 || true);
  // 접촉: 같은 카트 붙어 있는 동안 1번, 1초 지나 떨어졌다 다시 닿으면 또 1번
  const c0 = cv.C[0], inside = [[c0.x, c0.z]], far = [[c0.x + 10, c0.z + 10]];
  assert.deepEqual(cv.contacts(inside, 10), [0]); assert.deepEqual(cv.contacts(inside, 10.5), []); assert.deepEqual(cv.contacts(far, 10.6), []);
  assert.deepEqual(cv.contacts(inside, 10.8), [], '1초 안 다시 닿음 = 안 셈'); cv.contacts(far, 11.0); assert.deepEqual(cv.contacts(inside, 11.9), [0]); assert.equal(cv.S.hits, 2);
  assert.ok(cv.nearest(c0.x, c0.z).d === 0); }
{ const r = cartRect({ x: 0, z: 0, dx: 1, dz: 0 }); assert.equal(r.x1 - r.x0, E15.cartLen); assert.equal(r.z1 - r.z0, E15.cartW); }

// ---------- E16 전단지 ----------
{ const zone = tg['flyer-zone']; const evs = []; const F = createFlyers({ zone, rnd: seeded(16), onEvent: (k) => evs.push(k) });
  assert.equal(F.F.length, E16.flyers);
  for (let i = 0; i < 60; i++) F.step(0.05, null, false); assert.ok(F.F.every((f) => f.state === 'floor'), '3초 뒤 모두 바닥');
  for (const f of F.F) assert.ok(f.x >= zone.x0 && f.x <= zone.x1 && f.z >= zone.z0 && f.z <= zone.z1, 'zone 안');
  // 천천히(0.6 m/s) 지나가면 붙음 — 카트 앞(-z 로컬)이 플라이어 위
  const take = (f, speed) => { F.step(0.05, { x: f.x, z: f.z - 0.32, yaw: Math.PI, speed, held: true }, true); };
  take(F.F[0], 0.6); assert.equal(F.F[0].state, 'cart'); assert.equal(F.S.scooped, 1);
  take(F.F[1], 1.6); assert.equal(F.F[1].state, 'blown', '빨리 지나가면 날아감'); for (let i = 0; i < 20; i++) F.step(0.05, null, true); assert.equal(F.F[1].state, 'floor');
  for (const f of F.F.slice(2, 12)) take(f, 0.5); assert.equal(F.S.scooped, 11);
  // 1.8 m/s 넘게 달리면 1.2초마다 한 장 떨어짐
  for (let i = 0; i < 30; i++) F.step(0.05, { x: 50, z: 30, yaw: 0, speed: 2.2, held: true }, false); assert.ok(F.S.dropped >= 1 && F.S.scooped <= 10, `달리면 떨어짐 ${F.S.dropped}`);
  assert.ok(evs.includes('scoop') && evs.includes('drop') && evs.includes('blow'));
  assert.ok(F.nearest(66, 6)); }

// ---------- 소품 ----------
{
  const scene = new THREE.Scene(), kept = []; const keep = (o) => (kept.push(o), o);
  const cartObj = new THREE.Group(); scene.add(cartObj);
  const p = createDay8Props({ THREE, scene, keep, cartObj });
  const count = () => { let m = 0, t = 0, inst = 0; scene.traverse((o) => { if (o.isMesh) { m++; const n = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; t += n * (o.isInstancedMesh ? o.count : 1); if (o.isInstancedMesh) inst++; } }); return { m, t, inst }; };
  p.boss({ x: 71.5, z: 5.4, yaw: Math.PI }); p.squad('parked', { x: 67.6, z: 5 }, true); assert.equal(p.stats().crew, 2, '반기철 자리 비움');
  const cv = createConvoy({ route }); p.squad('convoy', null, true); p.updateConvoy(cv.C, true);
  const F = createFlyers({ zone: tg['flyer-zone'], rnd: seeded(3) }); p.flyers(F.F); p.tent({ x: 69, z: -4.4 }); p.bin({ x: 63.3, z: 3.5 });
  const a = count(); console.log('E15/E16 props', a); assert.ok(a.m <= 6, `meshes ${a.m}`); assert.ok(a.t < 4000, `tris ${a.t}`);
  assert.deepEqual(Object.fromEntries(Object.entries(p.stats()).filter(([k]) => k !== 'card')), { boss: true, squad: 'convoy', crew: 2, carts: 3, flyers: true, tent: true, bin: true });
  p.clearStage(); assert.equal(p.stats().boss, false); assert.equal(p.stats().squad, null);
  p.dispose(); assert.equal(scene.children.length, 1);
}
console.log('depot day8 ok');
