// [arcade] 범편의점 엔진 · 스폰 · 합치기 · 게임오버 · 플래그 단위 테스트
import {
  TUB_INNER_W, TUB_INNER_H, MAX_STAGE, SPAWN_MAX, GAMEOVER_HOLD, BUM_BONUS, FIXED_DT,
  radiusFor, scoreForStage, makeRng, pickSpawnStage, clampAimX, createSession,
  tryDrop, setAimX, canDrop, step, stepPhysics, spawnAt, plausibleMergeRun, STAGES,
} from '../src/arcade/bumstore/engine.js';
import { arcadeEnabled, mergeEnabled, MERGE_GAME_ID } from '../src/arcade/flag.js';
import { plausibleArcadeRun } from '../server/phone/src/arcade/rules.js';

const assert = (c, m) => { if (!c) throw new Error(m); };

assert(arcadeEnabled(''), 'arcade default on');
assert(mergeEnabled(''), 'merge default on');
assert(mergeEnabled('?merge=1'), 'merge explicit on');
assert(!mergeEnabled('?merge=0'), 'merge opt-out');
assert(mergeEnabled('?arcade=1'), 'merge stays on with arcade');
assert(MERGE_GAME_ID === 'bumstore', 'game id');

assert(STAGES.length === 10, '10 stages');
assert(STAGES[0].name === '동전' && STAGES[9].name === '범', 'stage names');
assert(STAGES.every((s) => !/수박|과일|watermelon|suika/i.test(s.name + s.id)), 'no fruit IP names');
assert(scoreForStage(1) === 0 && scoreForStage(2) === 10 && scoreForStage(10) === 2560, 'scores');
assert(scoreForStage(9) === 1280 && scoreForStage(5) === 80, 'mid scores');

const r1 = radiusFor(1);
const r10 = radiusFor(10);
assert(Math.abs(r1 * 2 - TUB_INNER_W / 9) < 0.05, `stage1 diameter ${r1 * 2} vs ${TUB_INNER_W / 9}`);
assert(Math.abs(r10 * 2 - TUB_INNER_W / 3) < 0.05, `stage10 diameter ${r10 * 2}`);
assert(Math.abs(radiusFor(2) / r1 - 3 ** (1 / 9)) < 1e-6, 'radius curve k');

const rng = makeRng(99);
const seen = new Set();
for (let i = 0; i < 200; i++) {
  const s = pickSpawnStage(rng);
  assert(s >= 1 && s <= SPAWN_MAX, `spawn ${s} out of range`);
  seen.add(s);
}
assert(seen.size === SPAWN_MAX, `spawn covers 1-5, got ${[...seen]}`);

assert(clampAimX(-10, 20) === 20, 'clamp left');
assert(clampAimX(999, 20) === TUB_INNER_W - 20, 'clamp right');

// drop + gravity: item rests on the floor without exploding
{
  const s = createSession({ seed: 7 });
  setAimX(s, TUB_INNER_W / 2);
  const dropped = tryDrop(s);
  assert(dropped && dropped.stage >= 1 && dropped.stage <= 5, 'drop returns item');
  assert(!canDrop(s), 'locked while falling');
  for (let i = 0; i < 240; i++) step(s, FIXED_DT); // 2s
  assert(s.items.length >= 1, 'item still there');
  const it = s.items[0];
  assert(it.y + it.r <= TUB_INNER_H + 0.6, `on floor y=${it.y} r=${it.r}`);
  assert(Math.abs(it.vx) < 20 && Math.abs(it.vy) < 30, `settled vel ${it.vx},${it.vy}`);
  assert(!s.over, 'single drop is not game over');
}

// two same items merge into the next stage at midpoint
{
  const s = createSession({ seed: 1 });
  const y = TUB_INNER_H - 80;
  spawnAt(s, 3, 140, y, { age: 1, contacted: true });
  spawnAt(s, 3, 170, y, { age: 1, contacted: true });
  const mid = (140 + 170) / 2;
  stepPhysics(s, FIXED_DT);
  const ev = s.events.find((e) => e.type === 'merge');
  assert(ev, 'merge event');
  assert(ev.stage === 4 && ev.score === 40, `merge to drink +40, got ${ev.stage}/${ev.score}`);
  assert(s.items.length === 1 && s.items[0].stage === 4, 'one drink remains');
  assert(Math.abs(s.items[0].x - mid) < 8, `midpoint x ${s.items[0].x} vs ${mid}`);
  assert(s.score === 40 && s.bestStage === 4, 'score and best');
}

// different stages do not merge
{
  const s = createSession({ seed: 1 });
  spawnAt(s, 2, 140, TUB_INNER_H - 50, { age: 1, contacted: true });
  spawnAt(s, 3, 175, TUB_INNER_H - 50, { age: 1, contacted: true });
  stepPhysics(s, FIXED_DT);
  assert(!s.events.some((e) => e.type === 'merge'), 'no cross-stage merge');
  assert(s.items.length === 2, 'both remain');
}

// two 범 pop for bonus, no stage 11
{
  const s = createSession({ seed: 1 });
  spawnAt(s, 10, 140, TUB_INNER_H - 120, { age: 1, contacted: true });
  spawnAt(s, 10, 200, TUB_INNER_H - 120, { age: 1, contacted: true });
  stepPhysics(s, FIXED_DT);
  const ev = s.events.find((e) => e.type === 'bonus');
  assert(ev && ev.score === BUM_BONUS, `bum bonus ${ev?.score}`);
  assert(s.items.every((it) => it.stage <= 10), 'no stage 11');
  assert(!s.items.some((it) => it.stage === 10), 'both bum popped');
  assert(s.score === BUM_BONUS, 'bonus score applied');
}

// chain: 3 pairs processed across steps (two stage-2 → stage-3 near another stage-3 → stage-4)
{
  const s = createSession({ seed: 1 });
  const y = TUB_INNER_H - 60;
  spawnAt(s, 2, 120, y, { age: 1, contacted: true });
  spawnAt(s, 2, 150, y, { age: 1, contacted: true });
  spawnAt(s, 3, 185, y, { age: 1, contacted: true });
  for (let i = 0; i < 8; i++) stepPhysics(s, FIXED_DT);
  assert(s.items.some((it) => it.stage >= 3), 'chain produced at least stage 3');
  assert(s.score >= 20, `chain score ${s.score}`);
}

// game over: item parked above the line for ~2s
{
  const s = createSession({ seed: 1 });
  const it = spawnAt(s, 6, TUB_INNER_W / 2, 20, { age: 1, contacted: true, sleeping: true, vx: 0, vy: 0 });
  assert(it.y - it.r < 36, 'starts above danger line');
  let overAt = 0;
  for (let i = 0; i < 300; i++) {
    step(s, FIXED_DT);
    if (s.over) { overAt = i * FIXED_DT; break; }
  }
  assert(s.over, 'game over triggered');
  assert(overAt >= GAMEOVER_HOLD - 0.15 && overAt <= GAMEOVER_HOLD + 0.35, `over at ${overAt}s`);
}

// brief dip above the line is not game over
{
  const s = createSession({ seed: 1 });
  spawnAt(s, 4, TUB_INNER_W / 2, 18, { age: 1, contacted: true, sleeping: true });
  for (let i = 0; i < 60; i++) step(s, FIXED_DT); // 0.5s
  assert(!s.over, 'under 2s is safe');
}

// jitter: a pile of mixed items settles
{
  const s = createSession({ seed: 3 });
  const y0 = TUB_INNER_H - 30;
  for (let i = 0; i < 8; i++) {
    spawnAt(s, 1 + (i % 4), 50 + i * 28, y0 - (i % 3) * 36, { age: 1 });
  }
  for (let i = 0; i < 480; i++) step(s, FIXED_DT); // 4s
  const live = s.items.filter((it) => !it.dead);
  const maxSpeed = live.reduce((m, it) => Math.max(m, Math.hypot(it.vx, it.vy)), 0);
  assert(live.length >= 1, 'pile remains');
  assert(maxSpeed < 40, `pile settled, maxSpeed=${maxSpeed.toFixed(2)}`);
  assert(live.every((it) => it.x >= it.r - 1 && it.x <= TUB_INNER_W - it.r + 1), 'inside walls');
  assert(live.every((it) => it.y <= TUB_INNER_H - it.r + 1.5), 'above floor');
}

{
  const bad = plausibleMergeRun({ score: 80000, durationMs: 3000, bestStage: 10 });
  assert(!bad.ok, 'reject too-fast high score');
  const good = plausibleMergeRun({ score: 12000, durationMs: 90000, bestStage: 8 });
  assert(good.ok, 'accept decent run');
  const srv = plausibleArcadeRun({ score: 12000, durationMs: 90000, level: 8, gameId: 'bumstore' });
  assert(srv.ok, 'server plausibility accepts merge run');
  const srvBad = plausibleArcadeRun({ score: 80000, durationMs: 3000, level: 1, gameId: 'bumstore' });
  assert(!srvBad.ok, 'server rejects too-fast merge run');
}

// falling item that merges away must not lock future drops
{
  const s = createSession({ seed: 1 });
  s.pendingStage = 2;
  s.nextStage = 1;
  s.pendingR = radiusFor(2);
  const r = radiusFor(2);
  spawnAt(s, 2, TUB_INNER_W / 2, r * 3.2, { age: 1, contacted: true });
  setAimX(s, TUB_INNER_W / 2);
  const dropped = tryDrop(s);
  assert(dropped, 'merge-while-falling: drop');
  assert(!canDrop(s), 'locked right after drop');
  for (let i = 0; i < 240; i++) step(s, FIXED_DT);
  assert(s.fallingId == null, `fallingId leaked after merge: ${s.fallingId}`);
  assert(s.dropLock <= 0, `dropLock leaked after merge: ${s.dropLock}`);
  assert(canDrop(s) || s.over, 'should allow another drop after the falling item merged');
}

// long play: many drops must keep unlocking (or end in a real game over)
{
  const s = createSession({ seed: 20261110 });
  let drops = 0;
  for (let i = 0; i < 16000 && !s.over; i++) {
    step(s, FIXED_DT);
    if (canDrop(s) && i % 4 === 0) {
      setAimX(s, 36 + ((i * 47) % (TUB_INNER_W - 72)));
      if (tryDrop(s)) drops += 1;
    }
  }
  if (!s.over) {
    for (let i = 0; i < 360; i++) step(s, FIXED_DT);
    assert(s.fallingId == null, `long-play fallingId=${s.fallingId}`);
    assert(s.dropLock <= 0, `long-play dropLock=${s.dropLock}`);
    assert(canDrop(s), `stuck after ${drops} drops, items=${s.items.length} falling=${s.fallingId} lock=${s.dropLock}`);
  }
  assert(drops >= 40, `expected a long run of drops, got ${drops}`);
}

// pointer / touchcancel / visibility must not leave a stuck "touching" flag
{
  let touching = false;
  const end = (type, drop) => {
    if (!touching) return 'ignore';
    touching = false;
    if (!drop) return 'reset';
    return (type === 'touch' || type === 'pen') ? 'drop' : 'ignore';
  };
  const s = createSession({ seed: 11 });
  let drops = 0, cancels = 0, hides = 0;
  const kinds = ['mouse', 'touch', 'touch', 'pen', 'touch'];
  for (let i = 0; i < 80; i++) {
    for (let k = 0; k < 30 && !s.over; k++) step(s, FIXED_DT);
    const type = kinds[i % kinds.length];
    touching = true;
    if (i % 7 === 0) {
      assert(end(type, false) === 'reset', 'touchcancel resets without drop');
      assert(!touching, 'touchcancel cleared flag');
      cancels += 1;
      continue;
    }
    if (i % 11 === 0) {
      touching = false; // visibilitychange
      hides += 1;
      assert(!touching, 'visibility cleared flag');
      continue;
    }
    const act = end(type, true);
    if (act === 'drop' && canDrop(s) && !s.over) {
      setAimX(s, 40 + (i * 19) % (TUB_INNER_W - 80));
      if (tryDrop(s)) drops += 1;
    } else if (act === 'ignore' && type === 'mouse' && canDrop(s) && !s.over) {
      // mouse drops on pointerdown in the real UI
      setAimX(s, 40 + (i * 19) % (TUB_INNER_W - 80));
      if (tryDrop(s)) drops += 1;
    }
  }
  for (let i = 0; i < 240; i++) step(s, FIXED_DT);
  assert(!touching, 'pointer flag clear at end');
  assert(s.fallingId == null || s.over, `input-mix fallingId=${s.fallingId}`);
  if (!s.over) assert(canDrop(s), 'input-mix still droppable');
  assert(drops >= 8 && cancels >= 2 && hides >= 2, `drops=${drops} cancels=${cancels} hides=${hides}`);
}

console.log('ok arcade-merge', {
  r1: +r1.toFixed(2), r10: +r10.toFixed(2),
  k: +(radiusFor(2) / r1).toFixed(4),
  bonus: BUM_BONUS,
});
