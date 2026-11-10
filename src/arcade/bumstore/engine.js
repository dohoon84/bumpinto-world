// [범편의점] 고정 시간 간격 원 충돌 + 합치기. DOM/브라우저 API 없음(테스트 가능).
import {
  TUB_INNER_W, TUB_INNER_H, MAX_STAGE, SPAWN_MAX, GAMEOVER_HOLD, BUM_BONUS,
  radiusFor, scoreForStage, stageInfo, dangerY as dangerYOf,
} from './stages.js';

export {
  TUB_INNER_W, TUB_INNER_H, MAX_STAGE, SPAWN_MAX, GAMEOVER_HOLD, BUM_BONUS,
  radiusFor, scoreForStage, stageInfo, STAGES, SPRITE_PAD, DANGER_Y_FRAC,
} from './stages.js';

export const FIXED_DT = 1 / 120;
const GRAVITY = 1650;
const RESTITUTION = 0.08;
const FRICTION = 0.28;
const DAMPING = 0.996;
const POS_PERCENT = 0.62;
const POS_SLOP = 0.18;
const ITERATIONS = 10;
const SLEEP_SPEED = 7;
const WAKE_IMPULSE = 14;
const MERGE_SLOP = 0.85;
const DROP_UNLOCK = 0.55;
const MAX_STEPS = 5;
// 스폰 가중치: 앞 단계가 더 자주 나옴 (1~5만)
const SPAWN_WEIGHTS = [34, 26, 20, 13, 7];

export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function pickSpawnStage(rng = Math.random) {
  const total = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = (typeof rng === 'function' ? rng() : Math.random()) * total;
  for (let i = 0; i < SPAWN_WEIGHTS.length; i++) {
    r -= SPAWN_WEIGHTS[i];
    if (r <= 0) return i + 1;
  }
  return SPAWN_MAX;
}

export function clampAimX(x, radius, width = TUB_INNER_W) {
  return Math.max(radius, Math.min(width - radius, x));
}

let _id = 1;
function nextId() { return _id++; }

export function makeItem(stage, x, y, extras = {}) {
  const st = Math.max(1, Math.min(MAX_STAGE, stage | 0));
  const r = radiusFor(st);
  return {
    id: extras.id ?? nextId(),
    stage: st,
    x, y,
    vx: extras.vx || 0,
    vy: extras.vy || 0,
    r,
    mass: r * r,
    dead: false,
    age: extras.age || 0,
    aboveMs: 0,
    sleeping: false,
    contacted: false,
    ...extras,
  };
}

export function createSession({ seed = 1, width = TUB_INNER_W, height = TUB_INNER_H } = {}) {
  const rng = makeRng(seed);
  const pendingStage = pickSpawnStage(rng);
  const nextStage = pickSpawnStage(rng);
  const pendingR = radiusFor(pendingStage);
  return {
    width, height,
    items: [],
    pendingStage,
    nextStage,
    aimX: width / 2,
    score: 0,
    bestStage: 1,
    over: false,
    paused: false,
    dropLock: 0,
    fallingId: null,
    rng,
    time: 0,
    acc: 0,
    events: [],
    pendingR,
  };
}

export function peekPending(session) {
  if (session.over || session.pendingStage == null) return null;
  const r = radiusFor(session.pendingStage);
  return {
    stage: session.pendingStage,
    x: clampAimX(session.aimX, r, session.width),
    y: -(r * 1.12 + 38),
    r,
  };
}

export function setAimX(session, x) {
  const r = radiusFor(session.pendingStage || 1);
  session.aimX = clampAimX(x, r, session.width);
  return session.aimX;
}

export function canDrop(session) {
  return !session.over && !session.paused && session.pendingStage != null && session.dropLock <= 0 && session.fallingId == null;
}

/** 대기 아이템을 통 윗부분에서 떨어뜨린다. 성공하면 아이템, 아니면 null. */
export function tryDrop(session) {
  if (!canDrop(session)) return null;
  const stage = session.pendingStage;
  const r = radiusFor(stage);
  const x = clampAimX(session.aimX, r, session.width);
  const item = makeItem(stage, x, r + 0.5, { falling: true });
  session.items.push(item);
  session.fallingId = item.id;
  session.pendingStage = session.nextStage;
  session.nextStage = pickSpawnStage(session.rng);
  session.pendingR = radiusFor(session.pendingStage);
  session.dropLock = DROP_UNLOCK;
  session.aimX = clampAimX(session.aimX, session.pendingR, session.width);
  session.events.push({ type: 'drop', x, y: item.y, stage, id: item.id });
  return item;
}

function wake(item, impulse = WAKE_IMPULSE + 1) {
  if (impulse > WAKE_IMPULSE) item.sleeping = false;
}

function integrate(item, dt) {
  if (item.sleeping) { item.vx = 0; item.vy = 0; return; }
  item.vy += GRAVITY * dt;
  item.vx *= DAMPING;
  item.vy *= DAMPING;
  item.x += item.vx * dt;
  item.y += item.vy * dt;
}

function collideWalls(item, w, h) {
  const r = item.r;
  let hit = false;
  if (item.x < r) {
    item.x = r;
    if (item.vx < 0) item.vx = -item.vx * RESTITUTION;
    item.vx *= 1 - FRICTION;
    hit = true;
  } else if (item.x > w - r) {
    item.x = w - r;
    if (item.vx > 0) item.vx = -item.vx * RESTITUTION;
    item.vx *= 1 - FRICTION;
    hit = true;
  }
  if (item.y > h - r) {
    item.y = h - r;
    if (item.vy > 0) {
      if (item.vy < 28) item.vy = 0;
      else item.vy = -item.vy * RESTITUTION;
    }
    item.vx *= 1 - FRICTION * 1.4;
    hit = true;
    item.contacted = true;
  }
  if (item.y < r) {
    // 천장으로 밀려 올라가면 약하게 밀어 내림 (드롭 직후는 허용)
    if (item.age > 0.25 && item.y < r - 0.5) {
      item.y = r;
      if (item.vy < 0) item.vy *= -0.2;
    }
  }
  if (hit) wake(item);
  return hit;
}

function collidePair(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist2 = dx * dx + dy * dy;
  const minDist = a.r + b.r;
  if (dist2 >= minDist * minDist || dist2 <= 1e-12) return 0;
  const dist = Math.sqrt(dist2);
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  const invA = a.sleeping && overlap < POS_SLOP * 2 ? 0.15 / a.mass : 1 / a.mass;
  const invB = b.sleeping && overlap < POS_SLOP * 2 ? 0.15 / b.mass : 1 / b.mass;
  const invSum = invA + invB;
  const corr = Math.max(overlap - POS_SLOP, 0) * POS_PERCENT / invSum;
  a.x -= nx * corr * invA;
  a.y -= ny * corr * invA;
  b.x += nx * corr * invB;
  b.y += ny * corr * invB;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const velN = rvx * nx + rvy * ny;
  let impulse = 0;
  if (velN < 0) {
    impulse = -(1 + RESTITUTION) * velN / invSum;
    a.vx -= impulse * nx * invA;
    a.vy -= impulse * ny * invA;
    b.vx += impulse * nx * invB;
    b.vy += impulse * ny * invB;
    const tx = -ny, ty = nx;
    const velT = rvx * tx + rvy * ty;
    const jt = Math.max(-Math.abs(impulse) * FRICTION, Math.min(Math.abs(impulse) * FRICTION, -velT / invSum));
    a.vx -= jt * tx * invA;
    a.vy -= jt * ty * invA;
    b.vx += jt * tx * invB;
    b.vy += jt * ty * invB;
  }
  const mag = Math.abs(impulse) + overlap * 8;
  wake(a, mag);
  wake(b, mag);
  a.contacted = true;
  b.contacted = true;
  return overlap;
}

function collectMerges(items) {
  const pairs = [];
  const used = new Set();
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.dead || used.has(a.id)) continue;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (b.dead || a.stage !== b.stage || used.has(b.id)) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const lim = a.r + b.r + MERGE_SLOP;
      if (dx * dx + dy * dy <= lim * lim) {
        pairs.push([a, b]);
        used.add(a.id);
        used.add(b.id);
        break;
      }
    }
  }
  return pairs;
}

function applyMerges(session, pairs) {
  for (const [a, b] of pairs) {
    if (a.dead || b.dead) continue;
    a.dead = true;
    b.dead = true;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    if (a.stage >= MAX_STAGE) {
      session.score += BUM_BONUS;
      session.bestStage = MAX_STAGE;
      session.events.push({ type: 'bonus', x, y, stage: MAX_STAGE, score: BUM_BONUS });
      continue;
    }
    const next = a.stage + 1;
    const r = radiusFor(next);
    const item = makeItem(next, clampAimX(x, r, session.width), Math.min(session.height - r, y), {
      vx: (a.vx + b.vx) * 0.25,
      vy: Math.min(0, (a.vy + b.vy) * 0.2) - 38,
      age: 0.05,
    });
    item.contacted = true;
    session.items.push(item);
    const gained = scoreForStage(next);
    session.score += gained;
    if (next > session.bestStage) session.bestStage = next;
    session.events.push({ type: 'merge', x, y, stage: next, score: gained, id: item.id });
  }
}

function updateSleepAndOver(session, dt) {
  const line = dangerYOf(session.height);
  let danger = false;
  let fallingAlive = false;
  for (const it of session.items) {
    if (it.dead) continue;
    it.age += dt;
    const speed = Math.hypot(it.vx, it.vy);
    if (speed < SLEEP_SPEED && it.contacted && it.age > 0.35) {
      it.sleeping = true;
      it.vx = 0;
      it.vy = 0;
    }
    if (session.fallingId === it.id) {
      fallingAlive = true;
      if (it.contacted || it.age >= DROP_UNLOCK) session.fallingId = null;
    }
    // 막 떨어뜨린 아이템은 위험선 판정에서 잠시 제외
    const counts = it.age > 0.45 && it.id !== session.fallingId;
    if (counts && (it.y - it.r) < line) {
      it.aboveMs += dt;
      if (it.aboveMs >= GAMEOVER_HOLD) danger = true;
    } else {
      it.aboveMs = 0;
    }
  }
  // 낙하 중 합쳐져 목록에서 빠지면 fallingId 가 영원히 남아 다음 드롭이 막힌다
  if (session.fallingId != null && !fallingAlive) session.fallingId = null;
  if (session.dropLock > 0 && session.fallingId == null) {
    session.dropLock = Math.max(0, session.dropLock - dt);
  }
  if (danger && !session.over) {
    session.over = true;
    session.events.push({ type: 'over', score: session.score, bestStage: session.bestStage });
  }
}

export function stepPhysics(session, dt = FIXED_DT) {
  const { width: w, height: h, items } = session;
  for (const it of items) {
    if (it.dead) continue;
    integrate(it, dt);
  }
  for (let k = 0; k < ITERATIONS; k++) {
    for (const it of items) {
      if (!it.dead) collideWalls(it, w, h);
    }
    for (let i = 0; i < items.length; i++) {
      if (items[i].dead) continue;
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].dead) continue;
        collidePair(items[i], items[j]);
      }
    }
  }
  applyMerges(session, collectMerges(items));
  session.items = session.items.filter((it) => !it.dead);
  updateSleepAndOver(session, dt);
}

/** 가변 dt를 고정 간격으로 나눠 진행. events 는 이번 호출에서 생긴 것만 돌려준다. */
export function step(session, dt) {
  session.events = [];
  if (session.over || session.paused) return session.events;
  const slice = Math.max(0, Math.min(0.05, Number(dt) || 0));
  session.acc += slice;
  session.time += slice;
  let n = 0;
  while (session.acc >= FIXED_DT && n < MAX_STEPS) {
    stepPhysics(session, FIXED_DT);
    session.acc -= FIXED_DT;
    n += 1;
  }
  if (session.acc >= FIXED_DT) session.acc = 0; // 스파이크 버림
  return session.events;
}

export function resetSession(session, { seed } = {}) {
  const next = createSession({ seed: seed ?? 1, width: session.width, height: session.height });
  Object.assign(session, next);
  return session;
}

/** 테스트·스크린샷용: 통 안에 아이템을 직접 넣는다. */
export function spawnAt(session, stage, x, y, extras = {}) {
  const r = radiusFor(stage);
  const item = makeItem(stage, clampAimX(x, r, session.width), Math.max(r, Math.min(session.height - r, y)), extras);
  session.items.push(item);
  if (stage > session.bestStage) session.bestStage = stage;
  return item;
}

export function highestStage(session) {
  let m = session.bestStage || 1;
  for (const it of session.items) if (!it.dead && it.stage > m) m = it.stage;
  return m;
}

/** 워커와 같은 취지: 너무 짧은 시간에 나온 높은 점수는 거절. */
export function plausibleMergeRun({ score, durationMs, bestStage = 1 } = {}) {
  const sc = Math.round(Number(score) || 0);
  const dur = Math.max(0, Number(durationMs) || 0);
  const lv = Math.max(1, Math.round(Number(bestStage) || 1));
  if (!Number.isFinite(sc) || sc < 0) return { ok: false, reason: 'bad_score' };
  if (sc > 500000) return { ok: false, reason: 'score_abs_cap' };
  if (dur > 0 && sc > 3000 && dur < 5000) return { ok: false, reason: 'too_fast' };
  const sec = Math.max(1, dur / 1000);
  if (sc > sec * 900 + 4000) return { ok: false, reason: 'score_cap' };
  if (sc >= 20000 && lv < 8) return { ok: false, reason: 'stage_mismatch' };
  return { ok: true };
}
