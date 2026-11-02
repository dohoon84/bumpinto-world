// [notice-popup] seen-logic 단위 테스트: node scripts/test-notice-popup.mjs
import assert from 'node:assert/strict';
import { latestNoticeKey, hasUnseenNotice, readSeen, markSeen, createNoticePopup, NOTICE_SEEN_KEY } from '../src/noticePopup.js';
import { NOTICE_POSTS } from '../src/notices.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0; const ok = (name) => { n++; console.log('ok', name); };

assert.equal(latestNoticeKey([{ key: 'notice-2026-10-28-a' }, { key: 'notice-2026-11-02-b' }, { key: 'notice-2026-10-30-c' }]), 'notice-2026-11-02-b'); ok('latest = max key');
assert.equal(latestNoticeKey(null), ''); assert.equal(latestNoticeKey([{}, { key: 5 }]), ''); ok('bad input -> empty');
assert.ok(latestNoticeKey(NOTICE_POSTS)); ok('real notices have a key');
assert.equal(hasUnseenNotice('', ''), false); assert.equal(hasUnseenNotice('b', 'b'), false); assert.equal(hasUnseenNotice('b', 'a'), true); assert.equal(hasUnseenNotice('a', 'b'), false); ok('hasUnseen');
const s = mem(); markSeen(s, 'notice-2026-11-01'); markSeen(s, 'notice-2026-10-01'); assert.equal(readSeen(s), 'notice-2026-11-01'); ok('markSeen never goes backwards');
const throwing = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
assert.equal(readSeen(throwing), ''); markSeen(throwing, 'a'); ok('storage errors swallowed');

async function run({ storage = mem(), params = new URLSearchParams(), busy = () => false, posts = [{ key: 'notice-2026-11-03-x' }], maxWaitMs = 1000 } = {}) {
  let opens = 0;
  const p = createNoticePopup({ posts, params, storage, busy, open: () => (opens++, true), delayMs: 10, retryMs: 10, maxWaitMs });
  p.schedule(); p.schedule();
  await wait(60);
  return { opens, storage, p };
}
let r = await run(); assert.equal(r.opens, 1); assert.equal(r.storage.getItem(NOTICE_SEEN_KEY), 'notice-2026-11-03-x'); ok('first entry opens once + marks seen');
r = await run({ storage: r.storage }); assert.equal(r.opens, 0); ok('second entry (other neighborhood/reload) does not open');
r = await run({ storage: r.storage, posts: [{ key: 'notice-2026-11-03-x' }, { key: 'notice-2026-11-10-y' }] }); assert.equal(r.opens, 1); ok('newer notice reopens');
r = await run({ params: new URLSearchParams('noticePopup=0') }); assert.equal(r.opens, 0); ok('?noticePopup=0 disables');
r = await run({ posts: [] }); assert.equal(r.opens, 0); ok('no notices -> nothing');
let busyN = 0; r = await run({ busy: () => ++busyN < 3 }); assert.equal(r.opens, 1); assert.ok(busyN >= 3); ok('busy defers then opens');
r = await run({ busy: () => true, maxWaitMs: 20 }); assert.equal(r.opens, 0); assert.equal(readSeen(r.storage), ''); ok('always busy -> skipped, not marked seen');
console.log(`notice-popup: ${n} passed`);
