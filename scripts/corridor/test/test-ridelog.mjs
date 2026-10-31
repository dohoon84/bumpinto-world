// [ride] 탑승 기록·교통카드 테스트: node scripts/corridor/test/test-ridelog.mjs
import assert from 'node:assert/strict';
import { createRideLog, RIDE_LOG_KEY } from '../../../src/ride/rideLog.js';
import { createWallet } from '../../../src/ride/wallet.js';

const mem = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const st = mem();
let t = 1_700_000_000_000;
const log = createRideLog({ storage: st, cap: 5, now: () => ++t });
assert.equal(log.key, RIDE_LOG_KEY);
assert.deepEqual(log.list(), []);
const e = log.add({ mode: 'bus', route: '9401', routeName: '서울역 방면', from: '수내역', to: '서현역', distM: 1234.6, durSec: 95.2, at: 1, end: 2, fare: { amount: 0, currency: 'KRW', receiptId: 'rcpt-1', code: 'bus.base' } });
assert.equal(e.distM, 1235); assert.equal(e.durSec, 95); assert.equal(e.synced, false); assert.equal(e.fare.amount, 0);
assert.ok(JSON.parse(st.getItem(RIDE_LOG_KEY)).length === 1, 'persisted to storage');
// 캡: 오래된 것부터 버림
for (let i = 0; i < 7; i++) log.add({ mode: i % 2 ? 'taxi' : 'bus', route: 'r' + i, from: 'a', to: 'b', distM: i, durSec: i });
assert.equal(log.count(), 5);
assert.equal(log.list()[0].route, 'r6', 'newest first');
assert.equal(log.list({ limit: 2 }).length, 2);
// 이상한 입력 정리
const w = log.add({ mode: 'plane', route: 'x'.repeat(100), distM: -5, durSec: 'abc' });
assert.equal(w.mode, 'bus'); assert.equal(w.route.length, 24); assert.equal(w.distM, 0); assert.equal(w.durSec, 0);
// 동기화 인터페이스
const ids = log.pending().map((x) => x.id); assert.equal(ids.length, 5);
log.markSynced(ids.slice(0, 3)); assert.equal(log.pending().length, 2);
// 다른 인스턴스가 같은 저장소를 읽음
assert.equal(createRideLog({ storage: st, cap: 5 }).count(), 5);
// 손상된 저장소
st.setItem(RIDE_LOG_KEY, '{bad json'); assert.deepEqual(log.list(), []);
let changed = 0; log.onChange(() => changed++); log.clear(); assert.equal(changed, 1); assert.equal(log.count(), 0);

// 교통카드: 무료 체험 카드 자동 발급, 같은 카드 유지
const ws = mem();
const wal = createWallet({ storage: ws });
const c = wal.card();
assert.equal(c.kind, 'trial'); assert.equal(c.balance, 0); assert.equal(c.unlimited, true); assert.equal(c.name.ko, '무료 체험 카드'); assert.equal(c.name.en, 'Free Trial Card');
assert.equal(createWallet({ storage: ws }).card().id, c.id, 'card persists');
console.log('test-ridelog: ok');
