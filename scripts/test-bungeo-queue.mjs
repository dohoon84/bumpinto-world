// [bungeo] 붕어빵 줄 로직 테스트: node scripts/test-bungeo-queue.mjs
import assert from 'node:assert/strict';
import { createBungeoQueue, seededRng, inBungeoSeason, bungeoMode, bungeoActive, seoulMonth, BUNGEO_MAX } from '../src/world/bungeoQueue.js';

let pass = 0;
const ok = (name, fn) => { fn(); pass++; console.log('ok -', name); };

ok('season: Nov–Mar on, Apr–Oct off (Asia/Seoul)', () => {
  const on = [11, 12, 1, 2, 3], off = [4, 5, 6, 7, 8, 9, 10];
  for (const m of on) assert.equal(inBungeoSeason(new Date(Date.UTC(2026, m - 1, 15, 3))), true, 'month ' + m);
  for (const m of off) assert.equal(inBungeoSeason(new Date(Date.UTC(2026, m - 1, 15, 3))), false, 'month ' + m);
  // 10/31 15:30 UTC = 11/1 00:30 KST → 철 시작
  assert.equal(seoulMonth(new Date(Date.UTC(2026, 9, 31, 15, 30))), 11);
  assert.equal(inBungeoSeason(new Date(Date.UTC(2026, 9, 31, 15, 30))), true);
  // 3/31 15:30 UTC = 4/1 00:30 KST → 철 끝
  assert.equal(inBungeoSeason(new Date(Date.UTC(2026, 2, 31, 15, 30))), false);
});

ok('flag: ?bungeo=0 off, =1 forced on, else season', () => {
  assert.equal(bungeoMode('0'), 'off'); assert.equal(bungeoMode('1'), 'on'); assert.equal(bungeoMode(null), 'auto'); assert.equal(bungeoMode('x'), 'auto');
  const july = new Date(Date.UTC(2026, 6, 1)), dec = new Date(Date.UTC(2026, 11, 1));
  assert.equal(bungeoActive('1', july), true);
  assert.equal(bungeoActive('0', dec), false);
  assert.equal(bungeoActive(null, dec), true);
  assert.equal(bungeoActive(null, july), false);
});

function simulate(seed, seconds, dt = 0.1, walk = 2.0) {
  const q = createBungeoQueue({ rng: seededRng(seed) });
  const pre = q.prefill();
  const arriving = new Map(); // id -> 남은 걷기 시간
  const order = [], served = [], waits = [], lens = [];
  for (const m of pre) order.push(m.id);
  for (let t = 0; t < seconds; t += dt) {
    for (const [id, left] of arriving) { if (left - dt <= 0) { q.arrive(id); arriving.delete(id); } else arriving.set(id, left - dt); }
    const ev = q.update(dt);
    for (const e of ev) {
      if (e.type === 'join') { order.push(e.id); arriving.set(e.id, walk); }
      if (e.type === 'served') { served.push(e.id); waits.push(e.waited); }
    }
    assert.ok(q.length <= BUNGEO_MAX, 'never more than 10');
    lens.push(q.length);
  }
  return { q, order, served, waits, lens };
}

ok('never exceeds 10, FIFO, waits 3–7 s', () => {
  for (const seed of [1, 7, 42, 2026, 99991]) {
    const { q, order, served, waits } = simulate(seed, 3600);
    assert.ok(q.stats.maxSeen <= 10);
    assert.deepEqual(served, order.slice(0, served.length), 'served in join order');
    assert.ok(served.length > 300, 'about one every ~5 s over an hour: ' + served.length);
    for (const w of waits) assert.ok(w >= 3 && w <= 7, 'wait ' + w);
  }
});

ok('length varies (roughly 6–10) after warm-up', () => {
  const { lens } = simulate(5, 1800);
  const tail = lens.slice(300);
  const min = Math.min(...tail), max = Math.max(...tail);
  const avg = tail.reduce((a, b) => a + b, 0) / tail.length;
  assert.ok(max <= 10 && max >= 9, 'max ' + max);
  assert.ok(min >= 4, 'min ' + min);
  assert.ok(avg >= 6 && avg <= 10, 'avg ' + avg.toFixed(2));
  assert.ok(new Set(tail).size >= 3, 'length should vary');
});

ok('front waits for arrival before serving; hand precedes served', () => {
  const q = createBungeoQueue({ rng: seededRng(3), gap: [999, 999] });
  q.prefill(0);
  // 걸어오는 중인 손님은 서빙이 시작되지 않는다
  const m = q.prefill(1)[0]; m.arrived = false;
  for (let i = 0; i < 200; i++) assert.equal(q.update(0.1).length, 0);
  q.arrive(m.id);
  const seen = [];
  for (let i = 0; i < 100; i++) for (const e of q.update(0.1)) seen.push(e.type);
  assert.deepEqual(seen, ['hand', 'served']);
  assert.equal(q.length, 0);
});

ok('max clamps to 10 even if asked for more', () => {
  const q = createBungeoQueue({ rng: seededRng(9), max: 50, minLen: 40 });
  q.prefill(99);
  assert.equal(q.length, 10);
});

console.log(`bungeo queue: ${pass} passed`);
