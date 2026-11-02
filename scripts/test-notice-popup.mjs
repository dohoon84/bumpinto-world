// [notice-popup] seen-logic 단위 테스트: node scripts/test-notice-popup.mjs
import assert from 'node:assert/strict';
import { latestNoticeId, readSeenId, hasUnseenNotice, markSeenId, createNoticePopup, NOTICE_SEEN_KEY } from '../src/noticePopup.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0; const ok = (name) => { n++; console.log('ok', name); };

const N = (id, title = 'x') => ({ id, category: 'notice', title });
assert.equal(latestNoticeId([N(4), N(9, '[업데이트] 스타베이스(TX) 오픈, 한/영 전환'), N(5), { id: 50, category: 'free' }]), 9); ok('latest = max server id of notice items (title-independent, ignores other categories)');
assert.equal(latestNoticeId(null), 0); assert.equal(latestNoticeId([{ category: 'notice', id: 'abc' }, {}]), 0); ok('bad input -> 0');
assert.equal(readSeenId(mem({ [NOTICE_SEEN_KEY]: 'notice-2026-10-28-launch' })), 0); ok('old string key format migrates to 0');
assert.equal(readSeenId(mem({ [NOTICE_SEEN_KEY]: '12' })), 12); ok('numeric id read');
assert.equal(hasUnseenNotice(0, 0), false); assert.equal(hasUnseenNotice(5, 5), false); assert.equal(hasUnseenNotice(6, 5), true); ok('hasUnseen');
const s0 = mem({ [NOTICE_SEEN_KEY]: 'notice-old' }); markSeenId(s0, 7); markSeenId(s0, 3); assert.equal(s0.getItem(NOTICE_SEEN_KEY), '7'); ok('markSeen overwrites old format, never goes backwards');
const throwing = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
assert.equal(readSeenId(throwing), 0); markSeenId(throwing, 1); ok('storage errors swallowed');

async function run({ storage = mem(), params = new URLSearchParams(), busy = () => false, items = [N(3), N(8)], fail = false, maxWaitMs = 1000 } = {}) {
  let opens = 0;
  const p = createNoticePopup({ params, storage, busy, open: () => (opens++, true), fetchNotices: async () => { await wait(5); if (fail) throw new Error('net'); return items; }, delayMs: 10, retryMs: 10, maxWaitMs });
  p.schedule(); p.schedule();
  await wait(80);
  return { opens, storage, p };
}
let r = await run(); assert.equal(r.opens, 1); assert.equal(r.storage.getItem(NOTICE_SEEN_KEY), '8'); ok('first entry opens once + marks seen id');
r = await run({ storage: r.storage }); assert.equal(r.opens, 0); ok('reload / other neighborhood does not reopen');
r = await run({ storage: r.storage, items: [N(3), N(8), N(12, '[업데이트] 관리자 작성 공지')] }); assert.equal(r.opens, 1); assert.equal(r.storage.getItem(NOTICE_SEEN_KEY), '12'); ok('new admin-written notice reopens');
r = await run({ storage: mem({ [NOTICE_SEEN_KEY]: 'notice-2026-10-28-launch' }) }); assert.equal(r.opens, 1); ok('old-format seen value -> shows once');
r = await run({ params: new URLSearchParams('noticePopup=0') }); assert.equal(r.opens, 0); ok('?noticePopup=0 disables');
r = await run({ fail: true }); assert.equal(r.opens, 0); assert.equal(r.storage.getItem(NOTICE_SEEN_KEY), null); ok('fetch failure -> nothing');
r = await run({ items: [] }); assert.equal(r.opens, 0); ok('no notices -> nothing');
let busyN = 0; r = await run({ busy: () => ++busyN < 3 }); assert.equal(r.opens, 1); ok('busy defers then opens');
r = await run({ busy: () => true, maxWaitMs: 20 }); assert.equal(r.opens, 0); assert.equal(r.storage.getItem(NOTICE_SEEN_KEY), null); ok('always busy -> skipped, not marked seen');
{ // 목록 로드 전에 수동으로 게시판을 열면 로드 후 본 것으로 처리
  const st = mem(); let opens = 0;
  const p = createNoticePopup({ params: new URLSearchParams(), storage: st, busy: () => false, open: () => (opens++, true), fetchNotices: async () => { await wait(20); return [N(4)]; }, delayMs: 40 });
  p.markSeen(); p.schedule(); await wait(90);
  assert.equal(st.getItem(NOTICE_SEEN_KEY), '4'); assert.equal(opens, 0); ok('manual open before load counts as seen');
}
console.log(`notice-popup: ${n} passed`);
