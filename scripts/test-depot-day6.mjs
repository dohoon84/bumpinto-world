// [depot-story] 6일차 기믹(E07 폐점 후 카트 경주 · E08 새벽 3시 비밀 창고 칸) + 6일차 대본 연결 — 판정·상태·코스·소품. DOM 없이 동작.
//   node scripts/test-depot-day6.mjs   (npm run depot:day6:test)
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { E07, E08, evalE07, evalE08, raceCourse, alongPath, createRace, createStealth, laneLine, forkliftLanes, inCone, createDay6Props } from '../src/depot/story/day6.js';
import EVENTS from '../src/depot/story/data/events.json' with { type: 'json' };
import TARGETS from '../src/depot/story/data/targets.json' with { type: 'json' };
import EXIT from '../src/depot/story/data/exit-rules.json' with { type: 'json' };
import CUES from '../src/depot/story/data/audio-cues.json' with { type: 'json' };
import REACT from '../src/depot/story/data/reactions.json' with { type: 'json' };
import D5 from '../src/depot/story/data/day5-script.json' with { type: 'json' };
import D6 from '../src/depot/story/data/day6-script.json' with { type: 'json' };

const ev = Object.fromEntries(EVENTS.events.map((e) => [e.id, e]));
const tg = Object.fromEntries(TARGETS.targets.map((t) => [t.id, t]));
const idx = readFileSync(new URL('../src/depot/story/index.js', import.meta.url), 'utf8');

// ---------- 데이터 ↔ 상수 ----------
assert.equal(ev.E07.tuning.laps, E07.laps); assert.equal(ev.E07.tuning.minLoadKg, E07.minLoadKg); assert.equal(ev.E07.tuning.timeLimitSec, E07.timeLimitSec);
assert.deepEqual(ev.E07.race.rival.stumbleAtLap, E07.stumbleAtLap);
assert.equal(ev.E08.tuning.goldBoxKg, E08.boxKg); assert.equal(ev.E08.tuning.flashlightConeDeg, E08.coneDeg);
assert.equal(ev.E08.stealth.caughtMax, E08.caughtMax); assert.equal(ev.E08.stealth.flashlight.offSpeedMul, E08.offSpeedMul);
for (const f of ev.E08.stealth.forklifts) { assert.equal(f.coneDeg, E08.coneDeg); assert.equal(f.rangeM, E08.rangeM); assert.ok(tg[f.route[0]]?.x0 != null, f.route[0]); }
for (const k of ['race-start', 'secret-shelf', 'entrance-mat', 'forklift-lane-back', 'forklift-lane-cross', 'freezer-legend', 'spy-block-1', 'spy-block-2', 'spy-block-3', 'auditor-post']) assert.ok(tg[k], `target ${k}`);
assert.equal(tg['lava-goal'].x, 66.5, '개발에서 옮긴 lava-goal 유지');
assert.ok(EXIT.ignoreEvent.afterCheckout.d6_034 && EXIT.ignoreEvent.afterCheckout.d6_061, 'exit-rules afterCheckout');
// README 1: 러너 등록
assert.match(idx, /6: \['E07', 'E08'\]/); assert.match(idx, /7: 'E10'/);
assert.match(idx, /auditor: 'auditor'/, 'PORTRAIT auditor');
for (const ex of ['neutral', 'angry', 'laugh', 'surprised']) assert.ok(existsSync(new URL(`../public/depot/story/auditor-${ex}.webp`, import.meta.url)), `auditor-${ex}.webp`);
assert.ok(existsSync(new URL('../public/depot/story/face-auditor.webp', import.meta.url)), 'face-auditor.webp');

// ---------- 대본: 다음 줄 · 새 명령 · 이름 ----------
const ids = new Set(D6.map((b) => b.id));
const refs = (b) => [b.next, b.resume, b.onMissed, b.onCheckout, b.onLowLoad, b.default, ...(b.choices || []).map((c) => c.goto), ...Object.values(b.cases || {}), ...(b.ranges || []).map((r) => r.goto)].flat().filter((x) => typeof x === 'string' && /^d\d_\d+/.test(x));
for (const b of D6) for (const r of refs(b)) assert.ok(ids.has(r) || /^d7_/.test(r), `${b.id} → ${r}`);
assert.equal(D6.length, 76);
assert.ok(D6.some((b) => b.cmd === 'scene.start' && b.day === 6));
const ms = D6.filter((b) => b.cmd === 'mission.start').map((b) => b.event); assert.deepEqual(ms, ['E07', 'E08']);
assert.deepEqual(D6.find((b) => b.id === 'd6_048').markMissed, ['E07']); assert.deepEqual(D6.find((b) => b.id === 'd6_075').markMissed, ['E08']);
const ts = D6.find((b) => b.cmd === 'timeskip'); assert.equal(ts.id, 'd6_051'); assert.equal(ts.clock, '03:00');
assert.equal(D6.find((b) => b.id === 'd6_034').onLowLoad, 'd6_035');
assert.ok(!JSON.stringify(D6).includes('싹쓸마트'));
for (const b of D6) if (b.speaker === 'spy') assert.equal(b.nameTag, '반기철(반값)', b.id);
assert.match(idx, /cmd === 'timeskip'/); assert.match(idx, /L\.markMissed/);
// 5일차 끝 → 6일차 (대본이 있으니 '바로 6일차 시작' 버튼이 나옴)
const d5end = D5.find((b) => b.cmd === 'day.end'); assert.equal(d5end.nextDay?.day, 6);

// ---------- 소리 ----------
const sfxSrc = readFileSync(new URL('../src/depot/story/sfx.js', import.meta.url), 'utf8');
const syn = new Set([...sfxSrc.matchAll(/^\s+'([\w.-]+)': \[\[/gm)].map((m) => m[1]));
const moods = new Set([...sfxSrc.matchAll(/^\s+'(bgm\.[\w-]+)': \{ bpm/gm)].map((m) => m[1]));
const have = (n) => (CUES.existing?.audioPlay || []).includes(n) || syn.has(n);
assert.equal(CUES.newSfxV07.length, 13);
for (const n of CUES.newSfxV07) assert.ok(syn.has(n), `SYN ${n} (README 9)`);
for (const b of D6) { if (b.sfx) assert.ok(have(String(b.sfx).split(/[|\s(]/)[0]), `${b.id} sfx ${b.sfx}`); for (const x of b.timed || []) if (x.sfx) assert.ok(have(x.sfx), `${b.id} timed ${x.sfx}`); if (b.bgm && b.bgm !== 'hold' && b.bgm !== 'bgm.shop') assert.ok(moods.has(b.bgm), `${b.id} bgm ${b.bgm}`); }
for (const e of ['E07', 'E08']) for (const x of ev[e].audio.sfx) { const n = x.split(/[|\s(]/)[0]; assert.ok(have(n), `${e} sfx ${n}`); }
assert.ok(REACT.reactions.find((r) => r.id === 'R61'));

// ---------- 판정 ----------
assert.equal(evalE07({ finished: true, timeSec: 68, beatRival: true, drops: 0 }), 'success');
assert.equal(evalE07({ finished: true, timeSec: 68, beatRival: true, drops: 2 }), 'partial');
assert.equal(evalE07({ finished: true, timeSec: 74, beatRival: false, drops: 0 }), 'partial');
assert.equal(evalE07({ finished: true, timeSec: 76, beatRival: true, drops: 0 }), 'fail');
assert.equal(evalE07({ finished: true, timeSec: 60, beatRival: true, drops: 3 }), 'fail');
assert.equal(evalE07({ finished: false }), 'fail');
assert.equal(evalE08({ picked: true, arrived: true, caught: 0 }), 'success');
assert.equal(evalE08({ picked: true, arrived: true, caught: 1 }), 'partial');
assert.equal(evalE08({ picked: true, arrived: false, caught: 2 }), 'fail');
assert.equal(evalE08({ picked: true, arrived: false, timeUp: true }), 'fail');
assert.equal(evalE08({ picked: false }), 'missed');

// ---------- 코스: 실제 장애물(브라우저 _dbg.obstacles 로 잰 값)과 안 겹침 ----------
const OBS = [
  ...[41.75, 50.15, 55.55, 61.1, 66.65].map((x0) => ({ x0, x1: x0 + 2.2, z0: 14, z1: 41 })),
  { x0: 56, x1: 57.3, z0: 41.3, z1: 42.4 }, { x0: 56, x1: 57.3, z0: 45.6, z1: 46.7 }, { x0: 45.25, x1: 46.55, z0: 43.45, z1: 44.55 },
  ...[39.73, 43.33, 46.93, 50.53].map((x0) => ({ x0, x1: x0 + 0.84, z0: 4.55, z1: 11.8 })),
  { x0: 53, x1: 63, z0: 115.95, z1: 116.85 }, { x0: 52.4, x1: 63.5, z0: 118.1, z1: 119.3 }, { x0: 0, x1: 84, z0: 119.7, z1: 121 },
];
const hit = (x, z, r) => OBS.find((o) => x > o.x0 - r && x < o.x1 + r && z > o.z0 - r && z < o.z1 + r);
const C = raceCourse(tg);
assert.ok(C.lapLen > 70 && C.lapLen < 82, `lap ${C.lapLen}`);
for (let d = 0; d < C.lapLen; d += 0.1) { const p = alongPath(C.path, C.lapLen, d); assert.ok(!hit(p.x, p.z, 0.38), `course hits at ${p.x.toFixed(2)},${p.z.toFixed(2)}`); }
// 체크포인트가 코스 위(반지름 안)에 있음
for (const [i, cp] of C.cps.entries()) { let best = 99; for (let d = 0; d < C.lapLen; d += 0.1) { const p = alongPath(C.path, C.lapLen, d); best = Math.min(best, Math.hypot(p.x - cp.x, p.z - cp.z)); } assert.ok(best < E07.cpR[i] - 0.3, `cp${i} off course ${best}`); }

// ---------- 경주 상태 기계 ----------
function drive(speed, { drops = 0, kg = 60, dt = 1 / 30 } = {}) {
  const evs = []; const R = createRace({ course: C, onEvent: (k, a) => evs.push([k, a]) });
  let d = 0;
  for (let i = 0; i < 200 * 30 && !R.S.done; i++) {
    const S = R.S, p = S.phase === 'run' ? alongPath(C.path, C.lapLen, d) : C.start;
    R.step(dt, { x: p.x, z: p.z, kg, drops: S.phase === 'run' && S.runT > 20 ? drops : 0, engaged: true });
    if (S.phase === 'run') d = Math.min(d + speed * dt, C.lapLen * E07.laps + 0.5);
  }
  return { R, evs };
}
{ const { R, evs } = drive(3.7); console.log('E07 fast', { result: R.result(), runT: +R.S.runT.toFixed(1), rival: +R.S.rival.finishT.toFixed(1), pace: +R.S.pace.toFixed(2) });
  assert.equal(R.result(), 'success'); assert.equal(R.S.lap, 3); assert.ok(evs.filter(([k]) => k === 'lap').length === 3 && evs.some(([k]) => k === 'stumble') && evs.some(([k]) => k === 'count') && evs.some(([k]) => k === 'go')); }
{ const { R } = drive(3.7, { drops: 1 }); assert.equal(R.result(), 'partial'); }
{ const { R } = drive(3.7, { drops: 3 }); assert.equal(R.result(), 'fail'); assert.equal(R.S.reason, 'drops'); }
{ const { R } = drive(3.1); assert.equal(R.result(), 'partial', `3.1 m/s ${R.S.runT}`); } // 75초 안이지만 범이에게 짐
{ const { R } = drive(2.5); assert.equal(R.result(), 'fail'); assert.equal(R.S.reason, 'time'); } // 평소 달리기 속도로는 못 돎 → vMul 필요
{ const S = drive(3.1).R.S; const total = C.lapLen * 3; assert.ok(Math.abs(S.rival.finishT - E07.rivalFinishSec) < 0.5, `rival ${S.rival.finishT}`); assert.ok(total / E07.timeLimitSec < 2.52 * E07.vMul, 'vMul 로 75초 안 가능'); }
{ // 50kg 미만 → lowLoad (출발 안 함), 나갔다 다시 오면 또
  const evs = []; const R = createRace({ course: C, onEvent: (k) => evs.push(k) });
  R.step(0.1, { ...C.start, kg: 40 }); R.step(0.1, { ...C.start, kg: 40 }); assert.deepEqual(evs, ['lowLoad']); assert.equal(R.S.phase, 'wait');
  R.step(0.1, { x: 47, z: 30, kg: 40 }); R.step(0.1, { ...C.start, kg: 45 }); assert.deepEqual(evs, ['lowLoad', 'lowLoad']);
  R.step(0.1, { ...C.start, kg: 60 }); assert.equal(R.S.phase, 'count');
}
{ // 놓침: 90초 동안 출발선도 안 오고 범쌀도 안 담음 · 담고 있으면 240초까지 기다림
  const a = createRace({ course: C }); for (let i = 0; i < 91; i++) a.step(1, { x: 70, z: 70, kg: 0, engaged: false }); assert.equal(a.result(), 'missed');
  const b = createRace({ course: C }); for (let i = 0; i < 91; i++) b.step(1, { x: 70, z: 70, kg: 20, engaged: true }); assert.equal(b.S.done, false);
}

// ---------- 잠입(E08) ----------
const lanes = forkliftLanes(tg); assert.equal(lanes.length, 2);
const OBS8 = OBS.concat([{ x0: 58.9, x1: 59.9, z0: 42.39, z1: 43.61 }]); // + 보들범 피라미드
for (const r of lanes) { const L = laneLine(r); for (let k = 0; k <= 1; k += 0.02) { const x = L.a.x + (L.b.x - L.a.x) * k, z = L.a.z + (L.b.z - L.a.z) * k; assert.ok(!OBS8.find((o) => x > o.x0 - 0.8 && x < o.x1 + 0.8 && z > o.z0 - 0.8 && z < o.z1 + 0.8), `lane ${x},${z}`); } }
assert.ok(inCone({ x: 0, z: 0, dx: 0, dz: 1 }, { x: 0, z: 5 }, 40, 9)); assert.ok(!inCone({ x: 0, z: 0, dx: 0, dz: 1 }, { x: 4, z: 5 }, 40, 9)); assert.ok(!inCone({ x: 0, z: 0, dx: 0, dz: 1 }, { x: 0, z: 10 }, 40, 9));
const shelf = { x: 58, z: 115.2 }, mat = { x: 69, z: 2.5 };
assert.ok(!hit(shelf.x, shelf.z, 0.4), 'shelf pickup spot is floor');
const mkS = (o = {}) => { const evs = []; const s = createStealth({ lanes, speeds: [1.4, 1.2], shelf, mat, cps: [shelf, { x: 47, z: 44 }], onEvent: (k, a) => evs.push([k, a]), ...o }); return { s, evs }; };
{ // 지게차가 없는 순간만 골라 가면 성공: 원뿔 판정을 끈(far) 플레이어
  const { s, evs } = mkS(); s.step(0.1, shelf); assert.equal(s.S.picked, true);
  for (let i = 0; i < 50; i++) s.step(0.1, { x: 70, z: 110 }); // (지게차 순찰선과 멀리)
  s.step(0.1, mat); assert.equal(s.result(), 'success'); assert.ok(evs.some(([k]) => k === 'pick') && evs.some(([k]) => k === 'arrive'));
}
{ // 원뿔 안 0.5초 = 걸림 → reset(마지막 체크포인트) · 두 번 = 실패
  const { s, evs } = mkS(); s.step(0.1, shelf);
  const inFront = () => { const f = s.F[0]; return { x: f.x + f.dx * 3, z: f.z + f.dz * 3 }; };
  for (let i = 0; i < 8; i++) s.step(0.1, inFront()); assert.equal(s.S.caught, 1); assert.ok(evs.some(([k, a]) => k === 'reset' && a.x === shelf.x));
  for (let i = 0; i < 20; i++) s.step(0.1, inFront()); // 2.5초 유예 안엔 안 셈
  assert.equal(s.S.caught, 1);
  for (let i = 0; i < 20; i++) s.step(0.1, inFront()); assert.equal(s.result(), 'fail'); assert.equal(s.S.reason, 'caught');
}
{ // 손전등 끄면 보이는 거리 ×0.55 → 7 m 앞은 안 걸림
  const { s } = mkS(); s.step(0.1, shelf); const f = s.F[0];
  for (let i = 0; i < 8; i++) { s.step(0.1, { x: f.x + f.dx * 7, z: f.z + f.dz * 7, light: false }); } assert.equal(s.S.caught, 0);
}
{ // 박스 꺼내기 전엔 걸려도 안 셈 · 90초 동안 안 가면 놓침
  const { s } = mkS(); const f = s.F[0]; for (let i = 0; i < 10; i++) s.step(0.1, { x: f.x + f.dx * 2, z: f.z + f.dz * 2 }); assert.equal(s.S.caught, 0);
  for (let i = 0; i < 90; i++) s.step(1, { x: 70, z: 10 }); assert.equal(s.result(), 'missed');
}
{ // 소리 → 가까운 지게차가 6초 그쪽을 봄
  const { s } = mkS(); const f = s.noise(s.F[1].x + 3, s.F[1].z); assert.equal(f, s.F[1]); s.step(0.1, { x: 0, z: 0 }); assert.ok(Math.abs(s.F[1].dx - 1) < 1e-6 && s.F[1].lookT > 5.8);
}
{ // 240초 초과 = 실패
  const { s } = mkS(); s.step(0.1, shelf); for (let i = 0; i < 241; i++) s.step(1, { x: 70, z: 110 }); assert.equal(s.result(), 'fail');
}

// ---------- 소품: draw call 적게 · 삼각형 · 밤 조명 되돌림 · 정리 ----------
{
  const scene = new THREE.Scene(), kept = []; const keep = (o) => (kept.push(o), o);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.85), amb = new THREE.AmbientLight(0xffffff, 0.18); scene.add(hemi, amb); scene.background = new THREE.Color(0xb7bec6); scene.fog = new THREE.Fog(0xb7bec6, 55, 150);
  const cartObj = new THREE.Group(); scene.add(cartObj);
  const p = createDay6Props({ THREE, scene, keep, cartObj, tg });
  const count = () => { let m = 0, t = 0; scene.traverse((o) => { if (o.isMesh) { m++; t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); return { m, t }; };
  p.raceLine(true); p.ghost({ x: 47, z: 13, yaw: 0 }); const a = count(); console.log('E07 props', a); assert.equal(a.m, 2); assert.ok(a.t < 500, `race tris ${a.t}`);
  p.raceLine(false); p.ghost(null); p.lifts(2); p.gold('shelf', { x: 58, z: 116.2 }); const b = count(); console.log('E08 props', b); assert.equal(b.m, 5); assert.ok(b.t < 1200, `stealth tris ${b.t}`);
  p.updateLifts([{ x: 50, z: 77, dx: 1, dz: 0 }, { x: 60, z: 44, dx: -1, dz: 0 }], [true, false]);
  p.gold('cart'); assert.equal(cartObj.children.length, 1);
  p.night(2); assert.ok(Math.abs(hemi.intensity - 0.85 * 0.28) < 1e-6); assert.equal(p.nightLevel, 2);
  p.night(0); assert.ok(Math.abs(hemi.intensity - 0.85) < 1e-6 && Math.abs(amb.intensity - 0.18) < 1e-6); assert.equal(scene.background.getHex(), 0xb7bec6); assert.equal(scene.fog.far, 150);
  p.dispose(); assert.equal(cartObj.children.length, 0); assert.deepEqual(scene.children.map((c) => c.type).sort(), ['AmbientLight', 'Group', 'HemisphereLight']);
}
console.log('depot day6 ok');
