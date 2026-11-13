// [depot-story] 5일차 기믹(E05 수상한 손님 미행 · E06 바닥은 용암입니다) + 4·5일차 대본 연결 — 판정·상태·경로·소품. DOM 없이 동작.
//   node scripts/test-depot-day5.mjs   (npm run depot:day5:test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { E05, E06, LAVA_GOAL, evalE05, evalE06, buildSpyRoute, createTail, createLava, wheels, inRect, createDay5Props } from '../src/depot/story/day5.js';
import EVENTS from '../src/depot/story/data/events.json' with { type: 'json' };
import TARGETS from '../src/depot/story/data/targets.json' with { type: 'json' };
import EXIT from '../src/depot/story/data/exit-rules.json' with { type: 'json' };
import CUES from '../src/depot/story/data/audio-cues.json' with { type: 'json' };
import REACT from '../src/depot/story/data/reactions.json' with { type: 'json' };
import D4 from '../src/depot/story/data/day4-script.json' with { type: 'json' };
import D5 from '../src/depot/story/data/day5-script.json' with { type: 'json' };

const ev = Object.fromEntries(EVENTS.events.map((e) => [e.id, e]));
const tg = Object.fromEntries(TARGETS.targets.map((t) => [t.id, t]));

// ---------- 데이터 ↔ 상수 ----------
assert.equal(ev.E05.tuning.durationSec, E05.durationSec);
assert.equal(ev.E05.tuning.minDistM, E05.minDist); assert.equal(ev.E05.tuning.maxDistM, E05.maxDist);
assert.equal(ev.E05.tuning.noiseSpeedLimit, E05.noiseLimit);
assert.equal(ev.E05.follow.photoAtGrab, E05.photoAt); assert.equal(ev.E05.follow.photoWindowSec, E05.photoWindowSec);
assert.equal(ev.E05.follow.loseSec, E05.loseSec); assert.equal(ev.E05.follow.spottedMax, E05.spottedMax);
assert.equal(ev.E06.tuning.timeLimitSec, E06.timeLimitSec); assert.equal(ev.E06.tuning.waterPacks, E06.waterPacks);
assert.equal(ev.E05.target, 'timesale-endcap'); assert.equal(ev.E06.target, 'lava-goal');
for (const k of ['lava-lane-01', 'lava-link-01', 'lava-front-band', 'lava-goal']) assert.ok(tg[k] && tg[k].x0 != null, k);
for (const k of ['x', 'z', 'x0', 'x1', 'z0', 'z1']) assert.equal(tg['lava-goal'][k], LAVA_GOAL[k], `lava-goal.${k}`);
assert.equal(ev.E12.reward.vitality, 5); assert.equal(ev.E06.reward.vitality, 6); // README 5: 사이드 활력
// README 6: chainMissed
assert.deepEqual(EXIT.ignoreEvent.chainMissed.d4_025, ['E04', 'E12']);
assert.deepEqual(EXIT.ignoreEvent.chainMissed.d5_018, ['E05', 'E06']);

// ---------- 대본: 모든 다음 줄이 있음 · '싹쓸마트' 없음 · 5일차 정체 공개는 flag ----------
const ids = new Set([...D4, ...D5].map((b) => b.id));
const refs = (b) => [b.next, b.resume, b.onMissed, b.onCheckout, b.default, ...(b.choices || []).map((c) => c.next), ...Object.values(b.cases || {}), ...Object.values(b.on || {})].flat().filter((x) => typeof x === 'string' && /^d\d_\d+/.test(x));
for (const b of [...D4, ...D5]) for (const r of refs(b)) assert.ok(ids.has(r) || /^d6_/.test(r), `${b.id} → ${r}`);
for (const [d, S] of [[4, D4], [5, D5]]) {
  assert.ok(S.some((b) => b.cmd === 'scene.start' && b.day === d), `day${d} start`);
  assert.ok(S.some((b) => b.cmd === 'mission.start' && b.event === (d === 4 ? 'E04' : 'E05')), `day${d} main`);
  assert.ok(S.some((b) => b.cmd === 'mission.start' && b.event === (d === 4 ? 'E12' : 'E06')), `day${d} side`);
}
assert.ok(!JSON.stringify([D4, D5]).includes('싹쓸마트'), '가게 이름 미정 — 싹쓸마트 금지 (reactions.json 대사 3줄은 index.js lineOk 가 거름)');
assert.ok(REACT.reactions.length > 0);
const reveal = D5.find((b) => JSON.stringify(b).includes('spyRevealed'));
assert.ok(reveal, 'day5 sets flag.spyRevealed');
const revealIdx = D5.findIndex((b) => /반기철/.test(b.nameTag || '')); // 자기소개 줄(d5_032)이 공개 순간 · 이름표는 대본 nameTag, 그 밖은 flag
assert.ok(revealIdx > 0 && revealIdx < D5.indexOf(reveal));
for (const b of D5.slice(0, revealIdx)) if (b.text) assert.ok(!b.text.includes('반기철'), `${b.id} 공개 전 반기철`);

// ---------- 소리: 대본·사건이 쓰는 이름은 모두 audio.play 이거나 합성 레시피 ----------
const sfxSrc = readFileSync(new URL('../src/depot/story/sfx.js', import.meta.url), 'utf8');
const syn = new Set([...sfxSrc.matchAll(/^\s+'([\w.-]+)': \[\[/gm)].map((m) => m[1]));
const moods = new Set([...sfxSrc.matchAll(/^\s+'(bgm\.[\w-]+)': \{ bpm/gm)].map((m) => m[1]));
const have = (n) => (CUES.existing?.audioPlay || []).includes(n) || syn.has(n);
for (const n of ['tissue-tumble', 'kid-cry', 'speed-warn', 'suspicion-rise', 'camera-shutter', 'stinger.reveal', 'lava-hiss']) assert.ok(syn.has(n), `SYN ${n} (README 8)`);
assert.ok(moods.has('bgm.lava') && moods.has('bgm.tailing'), 'bgm.lava · bgm.tailing');
for (const e of ['E04', 'E05', 'E06', 'E12']) for (const x of CUES.eventSfx[e]) { const n = x.split(/[|\s(]/)[0]; assert.ok(have(n), `${e} sfx ${n}`); }
for (const b of [...D4, ...D5]) if (b.sfx) { const n = String(b.sfx).split(/[|\s(]/)[0]; assert.ok(have(n), `${b.id} sfx ${n}`); }

// ---------- 판정 ----------
assert.equal(evalE05({ photo: true, spotted: 0 }), 'success');
assert.equal(evalE05({ photo: true, spotted: 1 }), 'partial');
assert.equal(evalE05({ photo: false, spotted: 0, contact: true }), 'fail');
assert.equal(evalE05({ photo: false, contact: false }), 'missed');
assert.equal(evalE06({ started: true, arrived: true, outsideSec: 0 }), 'success');
assert.equal(evalE06({ started: true, arrived: true, outsideSec: 2.9 }), 'partial');
assert.equal(evalE06({ started: true, arrived: true, outsideSec: 3.1 }), 'fail');
assert.equal(evalE06({ started: true, arrived: false, timeUp: true }), 'fail');
assert.equal(evalE06({ started: false }), 'missed');

// ---------- 실제 장애물(브라우저 _dbg.obstacles 로 잰 값) ----------
const OBS = [
  ...[50.15, 55.55, 61.1, 66.65].map((x0) => ({ x0, x1: x0 + 2.2, z0: 14, z1: 41 })), // 랙(통로 01·02 양옆)
  { x0: 56, x1: 57.3, z0: 41.3, z1: 42.4 }, { x0: 56, x1: 57.3, z0: 45.6, z1: 46.7 }, { x0: 61.55, x1: 62.85, z0: 41.3, z1: 42.4 }, { x0: 61.55, x1: 62.85, z0: 45.6, z1: 46.7 }, // 엔드캡 파렛트
  { x0: 64.9, x1: 67.15, z0: 38.15, z1: 39.42 }, // 안마의자
  { x0: 45.25, x1: 46.55, z0: 43.45, z1: 44.55 }, // 특가 파렛트
  { x0: 56, x1: 62.38, z0: 6.88, z1: 7.52 }, { x0: 56, x1: 62.38, z0: 10.08, z1: 10.72 }, // 셀프 계산대
  ...[39.73, 43.33, 46.93, 50.53].map((x0) => ({ x0, x1: x0 + 0.84, z0: 4.55, z1: 11.8 })), // 계산대 칸막이
];
const hit = (x, z, r) => OBS.find((o) => x > o.x0 - r && x < o.x1 + r && z > o.z0 - r && z < o.z1 + r);

// ---------- E05 경로: 장애물과 안 겹침 · 10번째 담기 ≈ 83초 ----------
const route = buildSpyRoute(tg);
assert.equal(route.pts.reduce((a, p) => a + (p.grabs || 0), 0), E05.grabs);
for (let i = 1; i < route.pts.length; i++) {
  const a = route.pts[i - 1], b = route.pts[i], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1);
  for (let k = 0; k <= n; k++) { const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n; assert.ok(!hit(x, z, 0.3), `spy route seg ${i} hits ${JSON.stringify(hit(x, z, 0.3))} at ${x.toFixed(2)},${z.toFixed(2)}`); }
}
{ // 잘 따라가는 플레이어: spy 와 늘 7 m (판정만 — 장애물 없이), 10번째 담기 0.3초 뒤 촬영
  const tail = createTail({ route }); let photoAt = -1, r = null, me = { x: route.pts[0].x, z: route.pts[0].z + 7 }, minD = 99, maxD = 0;
  for (let i = 0; i < 120 * 30 && !tail.S.done; i++) {
    const S = tail.S, dx = me.x - S.x, dz = me.z - S.z, d = Math.hypot(dx, dz) || 1, nx = S.x + dx / d * 7, nz = S.z + dz / d * 7;
    const sp = Math.hypot(nx - me.x, nz - me.z) * 30; me = { x: nx, z: nz };
    tail.step(1 / 30, { me, speed: sp, kg: 10 }); minD = Math.min(minD, tail.S.dist); maxD = Math.max(maxD, tail.S.dist);
    if (tail.S.grab10T >= 0 && photoAt < 0 && tail.S.t > tail.S.grab10T + 0.3) { photoAt = tail.S.t; r = tail.photo(); }
  }
  console.log('E05 route', { reason: tail.S.reason, t: +tail.S.t.toFixed(1), grabs: tail.S.grabs, dist: [+minD.toFixed(2), +maxD.toFixed(2)], len: +route.len.toFixed(1), speed: +route.speed.toFixed(2), grab10T: +tail.S.grab10T.toFixed(1), photoAt: +photoAt.toFixed(1), sus: Math.round(tail.S.sus), spotted: tail.S.spotted });
  assert.equal(r, 'ok'); assert.equal(tail.result(), 'success'); assert.ok(minD >= E05.minDist && maxD <= E05.maxDist);
  assert.ok(tail.S.grab10T > 75 && tail.S.grab10T < 90, `10번째 담기 ${tail.S.grab10T}`);
}
{ // 안마의자에서 돌아올 때(막다른 곳): 통로 02 북쪽 랙 끝(59.4, 40)에 숨어 있으면 4 m 안으로 안 들어오고 의심이 식음
  const tail = createTail({ route }); const hide = { x: 59.4, z: 40.0 }; let minD = 99, after = false;
  for (let i = 0; i < 100 * 30 && !tail.S.done; i++) {
    const S = tail.S; if (S.seg >= 8) after = true;
    const me = S.seg >= 5 && S.seg <= 8 ? hide : S.seg < 5 ? { x: S.x, z: S.z - 7 } : { x: S.x + 7, z: S.z }; // 앞: 7 m 뒤 · 숨기 · 뒤: 동쪽 7 m
    tail.step(1 / 30, { me, speed: 0, hiding: me === hide });
    if (S.seg >= 7 && S.seg <= 8) minD = Math.min(minD, S.dist);
    if (S.grab10T >= 0) break;
  }
  assert.ok(after && minD >= E05.minDist - 1e-6, `U-turn min dist ${minD}`); assert.equal(tail.S.spotted, 0);
}
{ // 소음: 6 m 안에서 1.6 m/s → 의심 상승 → 들킴 2번 = 실패
  const ev2 = []; const tail = createTail({ route, onEvent: (e) => ev2.push(e) });
  for (let i = 0; i < 30 * 30 && !tail.S.done; i++) tail.step(1 / 30, { me: { x: tail.S.x, z: tail.S.z + 5 }, speed: 1.6, kg: 0 });
  assert.equal(tail.S.spotted, 2); assert.equal(tail.result(), 'fail'); assert.ok(ev2.includes('rise') && ev2.includes('spotted'));
}
{ // 4 m 안 + cart-bump 즉시 100
  const tail = createTail({ route }); tail.step(0.1, { me: { x: tail.S.x, z: tail.S.z + 8 }, bump: true });
  assert.equal(tail.S.spotted, 1); assert.equal(tail.S.sus, E05.susReset);
}
{ // 숨기: 의심 감소
  const tail = createTail({ route }); tail.S.sus = 60; tail.step(1, { me: { x: tail.S.x, z: tail.S.z + 7 }, speed: 0, hiding: true });
  assert.ok(Math.abs(tail.S.sus - 30) < 1e-6, `hide ${tail.S.sus}`);
}
{ // 놓침(12 m 초과 10초) = 실패 · 한 번도 안 옴 = missed
  const a = createTail({ route }); a.step(0.1, { me: { x: a.S.x, z: a.S.z + 8 } });
  for (let i = 0; i < 12 * 10; i++) a.step(0.1, { me: { x: 0, z: 0 } });
  assert.equal(a.result(), 'fail'); assert.equal(a.S.reason, 'lost');
  const b = createTail({ route }); for (let i = 0; i < 61 * 10; i++) b.step(0.1, { me: { x: 0, z: 0 } });
  assert.equal(b.result(), 'missed');
}
{ // 이른 촬영 → 'early', 창 놓침 → fail
  const tail = createTail({ route }); tail.step(0.1, { me: { x: tail.S.x, z: tail.S.z + 7 } });
  assert.equal(tail.photo(), 'early');
  tail.S.grab10T = tail.S.t; tail.S.grabs = 10; tail.S.contact = true;
  for (let i = 0; i < 25; i++) tail.step(0.1, { me: { x: tail.S.x, z: tail.S.z + 7 } });
  assert.equal(tail.result(), 'fail'); assert.equal(tail.S.reason, 'window');
}

// ---------- E06 용암: 안전 구역 · 카트 경로 ----------
const zones = ['lava-lane-01', 'lava-link-01', 'lava-front-band'].map((k) => tg[k]).concat([LAVA_GOAL]);
const W = (c) => wheels(c);
assert.equal(W({ x: 0, z: 0, yaw: 0 }).length, 4);
assert.ok(inRect(LAVA_GOAL, 66.5, 11.25));
// 바른 경로: 생수(53.9,18.5) → 남쪽 → 띠(z 11.3) → 동쪽 도착 칸. 카트 반지름 0.38 로 장애물 확인
const path = [];
for (let z = 18.5; z >= 11.3; z -= 0.05) path.push({ x: 53.9, z, yaw: 0 });
for (let x = 53.9; x <= 66.5; x += 0.05) path.push({ x, z: 11.3, yaw: -Math.PI / 2 });
for (const p of path) { assert.ok(!hit(p.x, p.z, 0.38), `lava path hits at ${p.x.toFixed(2)},${p.z.toFixed(2)}`); for (const [x, z] of W(p)) assert.ok(zones.some((r) => inRect(r, x, z)), `wheel out at ${p.x.toFixed(2)},${p.z.toFixed(2)}`); }
{
  const evs = []; const lava = createLava({ zones, onEvent: (e) => evs.push(e) }); let i = 0;
  for (const p of path) { if (lava.S.done) break; lava.step(1.4 / 20 / 1, { cart: p, water: 3 }); i++; }
  assert.equal(lava.result(), 'success', JSON.stringify(lava.S)); assert.ok(evs.includes('start') && evs.includes('arrive'));
  assert.ok(lava.elapsed < E06.timeLimitSec, `elapsed ${lava.elapsed}`);
  console.log('E06 path', { steps: i, sec: +lava.elapsed.toFixed(1) });
}
{ // 물 2팩만 → 도착 칸에서 needWater, 끝나지 않음
  const evs = []; const lava = createLava({ zones, onEvent: (e) => evs.push(e) });
  lava.step(0.1, { cart: { x: 53.9, z: 18, yaw: 0 }, water: 2 }); lava.step(0.1, { cart: { x: 66.5, z: 11.25, yaw: -Math.PI / 2 }, water: 2 });
  assert.ok(evs.includes('needWater') && !lava.S.done);
}
{ // 선 밖 2초 = 부분 · 4초 = 실패
  const mk = (outSec) => { const l = createLava({ zones }); l.step(0.1, { cart: { x: 53.9, z: 18, yaw: 0 }, water: 3 }); for (let t = 0; t < outSec; t += 0.1) l.step(0.1, { cart: { x: 58, z: 18, yaw: 0 }, water: 3 }); l.step(0.1, { cart: { x: 66.5, z: 11.25, yaw: -Math.PI / 2 }, water: 3 }); return l.result(); };
  assert.equal(mk(2), 'partial'); assert.equal(mk(4), 'fail');
  const m = createLava({ zones }); for (let t = 0; t < 61; t += 0.5) m.step(0.5, { cart: { x: 70, z: 30, yaw: 0 } }); assert.equal(m.result(), 'missed');
  const tu = createLava({ zones }); tu.step(0.1, { cart: { x: 53.9, z: 18, yaw: 0 } }); for (let t = 0; t < 61; t += 0.5) tu.step(0.5, { cart: { x: 53.9, z: 20, yaw: 0 }, water: 3 }); assert.equal(tu.result(), 'fail');
}

// ---------- 소품: 데칼 메시 1개 · 삼각형 적게 · 정리 ----------
{
  const scene = new THREE.Scene(), kept = []; const keep = (o) => (kept.push(o), o);
  const p = createDay5Props({ THREE, scene, keep, tg });
  p.lava(true); const meshes = []; scene.traverse((o) => o.isMesh && meshes.push(o));
  const tris = meshes.reduce((a, m) => a + m.geometry.attributes.position.count / 3, 0);
  console.log('E06 decal', { meshes: meshes.length, tris });
  assert.equal(meshes.length, 1); assert.ok(tris <= 80, `decal tris ${tris}`);
  assert.deepEqual(p.stats(), { decal: true, hud: false, glow: false });
  p.dispose(); assert.equal(scene.children.length, 0);
}
console.log('depot day5 ok');
