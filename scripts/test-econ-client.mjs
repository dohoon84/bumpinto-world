// node scripts/test-econ-client.mjs — [economy] ui-v2 서버 클라이언트(src/ui-v2/econ/serverClient.js) 테스트
//   fetch 를 서버 라우트(handleEcon)에 바로 꽂는다 — D1 은 node:sqlite. 네트워크·브라우저 불필요.
//   missingMethods = [] · 게스트 모양 · 게스트 무료 결제(원장 없음) · 네트워크 오류 · 잔액 부족 그대로 · 이벤트 · fare.js always
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const { createServerClient, rideProvider, taxiFareOf } = await import('../src/ui-v2/econ/serverClient.js');
const { missingMethods, CLIENT_METHODS, EVENTS } = await import('../src/ui-v2/econ/api.js');
const { createMockClient } = await import('../src/ui-v2/econ/mockClient.js').catch(() => ({}));
const { handleEcon } = await import('../server/phone/src/account/econRoutes.js');
const E = await import('../server/phone/src/account/economy.js');
const L = await import('../server/phone/src/account/ledger.js');
const S = await import('../server/phone/src/account/session.js');
const fare = await import('../src/ride/fare.js');
const ST = await import('../server/phone/src/account/store.js');

let n = 0;
const ok = (m) => console.log('  ok', ++n, m);
const SECRET = 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
const NOW = Date.parse('2026-11-04T07:00:00Z'); // 16:00 KST
const BASE = 'http://localhost:8789';

function d1Of(db) {
  const isReader = (q) => /^\s*(SELECT|WITH|PRAGMA)/i.test(q) || /\bRETURNING\b/i.test(q);
  const exec1 = (q, params) => {
    const st = db.prepare(q);
    if (isReader(q)) return { results: st.all(...params), meta: { changes: 0 } };
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const make = (q, params = []) => ({ _q: q, _p: params, bind: (...p) => make(q, p), async first() { return exec1(q, params).results[0] ?? null; }, async all() { return exec1(q, params); }, async run() { return exec1(q, params); } });
  return {
    prepare: (q) => make(q),
    async batch(stmts) { if (!stmts.length) throw new Error('D1_ERROR: No SQL statements detected.'); // 실제 D1 과 같게
 db.exec('BEGIN'); try { const o = stmts.map((s) => exec1(s._q, s._p)); db.exec('COMMIT'); return o; } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}
const MIG = ['0001_accounts.sql', '0002_economy.sql'].map((f) => readFileSync(new URL(`../server/phone/migrations/${f}`, import.meta.url), 'utf8'));
function makeEnv(vars = {}) {
  const raw = new DatabaseSync(':memory:');
  for (const m of MIG) raw.exec(m);
  return { DB: d1Of(raw), SESSION_SECRET: SECRET, GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com', ACCOUNTS_ENABLED: '1', ECONOMY_ENABLED: '1', STATS_ENABLED: '1', ECON_FEATURES: 'move,quests,shop,board', ECON_PAID: '0', ...vars };
}
async function account(env, id) {
  const t = NOW - 30 * 86400_000;
  await env.DB.prepare('INSERT INTO accounts (id, google_sub, email, name, created_at, first_login_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, `sub-${id}`, `${id}@x`, id, t, t, t).run();
}
/** fetch → handleEcon. jar.token 이 있으면 쿠키를 붙인다(credentials:'include' 흉내) */
function fakeFetch(env, jar, log = []) {
  return async (url, init = {}) => {
    log.push({ url, method: init.method || 'GET', credentials: init.credentials });
    if (jar.down) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const headers = { ...(init.headers || {}), Origin: 'http://localhost:5173', ...(jar.token ? { Cookie: `bw_s=${jar.token}` } : {}) };
    const res = await handleEcon(new Request(url, { ...init, headers }), env, u, { now: jar.now ?? NOW });
    return res || new Response('{"ok":false,"error":{"code":"not_found"}}', { status: 404 });
  };
}
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const mk = (env, jar, extra = {}) => createServerClient({ fetch: fakeFetch(env, jar, extra.log), base: BASE, enabled: true, storage: memStore(), now: () => jar.now ?? NOW, pollMs: 0, doc: null, autoRegister: false, rideBridge: false, ...extra });
const collect = (c) => { const ev = Object.fromEntries(EVENTS.map((e) => [e, []])); for (const e of EVENTS) c.on(e, (p) => ev[e].push(p)); return ev; };

console.log('econ server client tests');

// ── 계약 ──
{
  const env = makeEnv();
  const c = mk(env, {});
  assert.deepEqual(missingMethods(c), []);
  assert.equal(c.source, 'server'); assert.equal(c.isMock, false); assert.equal(c.version, 1);
  if (createMockClient) {
    const m = createMockClient({ storage: memStore() });
    for (const k of CLIENT_METHODS) assert.equal(typeof c[k], typeof m[k], k);
  }
  const off = createServerClient({ enabled: false, base: '', storage: null, autoRegister: false, rideBridge: false });
  assert.deepEqual(missingMethods(off), []);
  assert.equal((await off.getSession()).isGuest, true);
  assert.deepEqual(await off.getEconMode(), { transitPaid: false, shopPaid: true, beta: true }); // 상점은 무료 오픈 대상 아님
  const p = await off.payFare({ mode: 'bus', code: 'bus.city', rideId: 'r1' });
  assert.equal(p.ok, true); assert.equal(p.data.free, true); assert.equal(p.data.amount, 0);
  assert.equal((await off.claimQuest('D-LOGIN')).error.code, 'not_signed_in');
  ok('missingMethods = [] (on/off), same method set as mock, disabled = offline free guest');
}

// ── 게스트 ──
{
  const env = makeEnv();
  const log = [];
  const c = mk(env, {}, { log });
  const ev = collect(c);
  const s = await c.getSession();
  assert.deepEqual(s, { isGuest: true, signedIn: false, accountId: null, displayName: null, provider: null });
  const b = await c.getBalance();
  assert.equal(b.guest, true); assert.equal(b.total, 0);
  assert.equal((await c.getTravelToday()).guest, true);
  const q = await c.listQuests('daily');
  assert.equal(q.guest, true); assert.deepEqual(q.quests, []);
  assert.deepEqual(await c.getLedger(), []);
  assert.equal((await c.getWalletSummary()).guest, true);
  assert.equal((await c.getKarma()).guest, true);
  assert.equal((await c.getWelcome()).guest, true);
  assert.equal(await c.getShopGoal(), null);
  assert.ok(Array.isArray(await c.listShopItems()));
  const quote = await c.quoteFare({ mode: 'bus', code: 'bus.base' });
  assert.equal(quote.code, 'bus.city'); assert.equal(quote.free, true); assert.equal(quote.amount, 0); assert.equal(quote.listAmount, 1650);
  assert.equal(await c.quoteFare({ mode: 'taxi', code: 'bus.city' }), null, 'mode/code mismatch → null');
  const tq = await c.quoteFare({ mode: 'taxi', meters: 3000 });
  assert.equal(tq.options.length, 3); assert.equal(tq.listAmount, taxiFareOf(E.publicConfig(env).taxi, 3000));
  assert.equal(tq.listAmount, E.taxiFare(3000));
  const pay = await c.payFare({ mode: 'bus', code: 'bus.base', rideId: 'g1' });
  assert.equal(pay.ok, true); assert.equal(pay.data.free, true); assert.equal(pay.data.amount, 0); assert.match(pay.data.receiptId, /^g-/);
  assert.equal((await c.payFare({ mode: 'bus', code: 'bus.base', rideId: 'g1' })).data.receiptId, pay.data.receiptId, 'rideId replay');
  const h = await c.holdTaxi({ code: 'taxi.drive', estimateMeters: 3000 });
  assert.equal(h.ok, true); assert.equal(h.data.free, true);
  const st8 = await c.settleTaxi({ holdId: h.data.holdId, actualMeters: 2500 });
  assert.equal(st8.ok, true); assert.equal(st8.data.charged, 0); assert.equal(st8.data.mode, 'taxi');
  assert.equal((await c.settleTaxi({ holdId: h.data.holdId })).error.code, 'hold_not_found');
  assert.equal((await c.purchase('roadbike')).error.code, 'not_signed_in');
  assert.equal((await c.claimWelcome()).error.message.ko.length > 0, true);
  const rows = env.DB && (await env.DB.prepare('SELECT COUNT(*) AS n FROM ledger').first()).n;
  assert.equal(rows, 0, 'guest wrote no ledger');
  assert.equal(log.filter((l) => l.url.includes('/econ/fare') || l.url.includes('/econ/taxi')).length, 0, 'guest free transit never hits the server');
  assert.ok(log.every((l) => l.credentials === 'include'));
  assert.equal(ev.payment.length, 2); assert.equal(ev.reward.length, 0);
  ok('guest: empty shapes guest:true, free transit synthesized (no server call, no ledger), writes not_signed_in, credentials include');
}

// ── 게스트 · 유료 모드 ──
{
  const env = makeEnv({ ECON_PAID: '1' });
  const c = mk(env, {});
  assert.deepEqual(await c.getEconMode(), { transitPaid: true, shopPaid: true, beta: false });
  assert.equal((await c.payFare({ mode: 'bus', code: 'bus.city', rideId: 'x' })).error.code, 'not_signed_in');
  assert.equal((await c.holdTaxi({ estimateMeters: 2000 })).error.code, 'not_signed_in');
  const q = await c.quoteFare({ mode: 'bus' });
  assert.equal(q.amount, 1650); assert.equal(q.sufficient, false);
  ok('paid-mode guest: transit writes not_signed_in, quote shows real amount, insufficient');
}

// ── 네트워크 오류 ──
{
  const env = makeEnv();
  const jar = { down: true };
  const c = mk(env, jar);
  assert.equal((await c.getSession()).isGuest, true);
  assert.deepEqual((await c.claimQuest('D-LOGIN')).error.code, 'not_signed_in');
  jar.down = false; jar.token = await S.signSession({ accountId: 'nope', sessionVersion: 1, now: NOW }, SECRET);
  await c.refresh();
  jar.down = true;
  const r = await c.purchase('roadbike');
  assert.equal(r.ok, false); assert.equal(r.error.code, 'not_signed_in', 'unknown account → still guest');
  const broken = createServerClient({ fetch: async () => new Response('oops', { status: 502 }), base: BASE, enabled: true, storage: null, pollMs: 0, autoRegister: false, rideBridge: false });
  assert.equal((await broken.getSession()).isGuest, true);
  ok('network down / 502 → guest, no throw');
}

// ── 로그인 · 이벤트 · 유료 잔액 부족 ──
{
  const env = makeEnv({ ECON_PAID: '1' });
  await account(env, 'u');
  const jar = { token: await S.signSession({ accountId: 'u', sessionVersion: 1, now: NOW }, SECRET) };
  const store = memStore();
  const log = [];
  const c = mk(env, jar, { storage: store, log });
  const ev = collect(c);
  const s = await c.getSession();
  assert.equal(s.isGuest, false); assert.equal(s.provider, 'google'); assert.equal(s.accountId, 'u');
  assert.equal(ev.session.length, 1); assert.equal(ev.mode.length, 1);
  // 첫 갱신에서는 예전 행을 보상으로 다시 내지 않는다
  assert.equal(ev.reward.length, 0);
  const bal0 = (await c.getBalance()).total;
  const quote = await c.quoteFare({ mode: 'bus', code: 'bus.city' });
  assert.equal(quote.amount, 1650);
  // 잔액 부족은 서버 오류를 그대로
  const short = await c.payFare({ mode: 'bus', code: 'bus.city', rideId: 'r-short' });
  if (bal0 < 1650) {
    assert.equal(short.ok, false); assert.equal(short.error.code, 'insufficient_balance');
    assert.equal(short.error.need, 1650); assert.equal(short.error.balance, bal0); assert.equal(short.error.shortBy, 1650 - bal0);
  }
  await L.appendLedger(env.DB, { accountId: 'u', amount: 20000, kind: 'free', reason: 'refund', idempotencyKey: 'topup-test' }, { now: NOW });
  await c.refresh();
  assert.ok(ev.balance.length >= 1); assert.equal(ev.balance.at(-1).balance.total, bal0 + 20000); assert.equal(ev.balance.at(-1).delta, 20000);
  const p = await c.payFare({ mode: 'bus', code: 'bus.city', rideId: 'r1' });
  assert.equal(p.ok, true); assert.equal(p.data.amount, 1650); assert.equal(p.data.free, false);
  assert.equal(ev.payment.length, 1);
  const rewardsAfterPay = ev.reward.length;
  assert.ok(rewardsAfterPay >= (p.data.reward?.length || 0), 'reward events come from ledger rows');
  const ids = new Set();
  const tot = (await c.getBalance()).total;
  assert.equal(tot, bal0 + 20000 - 1650 + (p.data.reward || []).reduce((a, r) => a + r.amount, 0));
  const h = await c.holdTaxi({ code: 'taxi.drive', estimateMeters: 3000, rideId: 't1' });
  assert.equal(h.ok, true); assert.equal(h.data.amount, E.taxiFare(3000));
  const st8 = await c.settleTaxi({ holdId: h.data.holdId, actualMeters: 2000 });
  assert.equal(st8.ok, true); assert.equal(st8.data.charged, E.taxiFare(2000));
  const h2 = await c.holdTaxi({ code: 'taxi.drive', estimateMeters: 2000 });
  const cx = await c.cancelTaxi(h2.data.holdId);
  assert.equal(cx.ok, true); assert.ok(cx.data.balance);
  const ledger = await c.getLedger({ limit: 50 });
  assert.ok(ledger.length >= 3);
  for (const e of ledger) { assert.ok(!ids.has(e.id)); ids.add(e.id); }
  // 같은 계정으로 새로고침(새 클라이언트, 같은 저장소) → 그 사이 원장 행만 보상 이벤트
  await L.appendLedger(env.DB, { accountId: 'u', amount: 500, kind: 'free', reason: 'quest', ref: 'X', idempotencyKey: 'q-x' }, { now: NOW });
  const c2 = mk(env, jar, { storage: store });
  const ev2 = collect(c2);
  await c2.getSession();
  assert.equal(ev2.reward.length, 1); assert.equal(ev2.reward[0].amount, 500);
  // 로그아웃 → 게스트
  const so = await c2.signOut();
  assert.equal(so.ok, false, '/auth/logout is not an /econ route in this fake → error passthrough, no throw');
  jar.token = null; await c2.refresh();
  assert.equal(ev2.session.at(-1).isGuest, true);
  assert.equal((await c2.getBalance()).guest, true);
  ok('signed in: session/mode/balance/payment/reward events, insufficient {need,balance,shortBy} passthrough, taxi hold/settle/cancel, catch-up rewards after reload, sign-out → guest');
}

// ── 무료 모드 로그인: 0원 결제도 원장 이벤트 기록 · 이동 보상 ──
{
  const env = makeEnv();
  await account(env, 'f');
  const jar = { token: await S.signSession({ accountId: 'f', sessionVersion: 1, now: NOW }, SECRET) };
  const c = mk(env, jar);
  const ev = collect(c);
  const p = await c.payFare({ mode: 'bus', code: 'bus.base', rideId: 'fr1' });
  assert.equal(p.ok, true); assert.equal(p.data.free, true); assert.equal(p.data.amount, 0); assert.equal(p.data.listAmount, 1650);
  const n1 = (await env.DB.prepare("SELECT COUNT(*) AS n FROM econ_events WHERE account_id = 'f'").first()).n;
  assert.ok(n1 >= 1, 'free ride still logged');
  const q = await c.listQuests('daily');
  assert.equal(q.guest, false); assert.ok(q.quests.length > 0);
  ok('free mode signed in: fare free:true amount:0 listAmount, event logged, quests listed');
}

// ── 탑승 다리 + fare.js always ──
{
  const calls = [];
  const fakeClient = {
    payFare: async (r) => { calls.push(['pay', r]); return { ok: true, data: { receiptId: 'rc', amount: 1650, free: false } }; },
    holdTaxi: async (r) => { calls.push(['hold', r]); return { ok: true, data: { holdId: 'h' } }; },
    settleTaxi: async (r) => { calls.push(['settle', r]); return { ok: true, data: { receiptId: 'rt', charged: 7000, free: false } }; },
  };
  let mode = { transitPaid: false };
  fare.setPaymentProvider(rideProvider(fakeClient, () => mode), { always: true });
  const a = await fare.charge({ code: 'bus.base', mode: 'bus', meta: { to: '정자역' } });
  assert.equal(a.ok, true); assert.equal(a.amount, 0); assert.equal(a.free, true);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls[0][0], 'pay'); assert.equal(calls[0][1].meta.where, '정자역');
  mode = { transitPaid: true };
  const t = await fare.charge({ code: 'taxi.drive', mode: 'taxi', meta: { meters: 2345 } });
  assert.equal(t.ok, true); assert.equal(t.amount, 7000); assert.equal(t.receiptId, 'rt');
  assert.deepEqual(calls.slice(1).map((c) => c[0]), ['hold', 'settle']);
  assert.equal(calls[2][1].actualMeters, 2345);
  fakeClient.payFare = async () => ({ ok: false, error: { code: 'insufficient_balance', need: 1650, balance: 0, shortBy: 1650 } });
  const no = await fare.charge({ code: 'bus.base', mode: 'bus' });
  assert.equal(no.ok, false); assert.equal(no.error, 'insufficient_balance');
  assert.deepEqual(no.errorInfo, { code: 'insufficient_balance', need: 1650, balance: 0, shortBy: 1650 });
  fare.setPaymentProvider(null);
  const plain = await fare.charge({ code: 'bus.base', mode: 'bus' });
  assert.equal(plain.ok, true); assert.equal(plain.free, true);
  ok('ride bridge: free = fire-and-forget ok, paid = await (taxi hold→settle with route meters), insufficient blocks; no provider = old behaviour');
}

// ── 웰컴(구글 계정 연결 시 계정당 1회 자동) → 로그인 직후 sinceAt 으로 토스트 1번. 재로그인·기기 추가 연결·새로고침에도 다시 안 줌 ──
{
  const openAt = NOW - 3 * 86400_000;
  const env = makeEnv({ ECONOMY_OPEN_AT: new Date(openAt).toISOString() });
  await account(env, 'w');
  const devs = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  await env.DB.prepare('INSERT INTO account_devices (device_id, account_id, linked_at, merge_status) VALUES (?, ?, ?, ?)').bind(devs[0], 'w', NOW, 'primary').run();
  const book = { async accountDevices({ ids }) { return { devices: Object.fromEntries(ids.map((id) => [id, { exists: true, createdAt: openAt - 86400_000, giftQty: 0, photoCount: 0 }])) }; } };
  const jar = { token: null };
  const store = memStore();
  const c = mk(env, jar, { storage: store });
  const ev = collect(c);
  assert.equal((await c.getSession()).isGuest, true);
  // 로그인: /auth/google 이 grantStarters 를 부른 것과 같다
  const startedAt = NOW - 5000;
  jar.token = await S.signSession({ accountId: 'w', sessionVersion: 1, now: NOW }, SECRET);
  const g1 = await ST.grantStarters(env.DB, env, book, 'w', NOW);
  assert.deepEqual(g1.granted.map((x) => x.reason), ['welcome', 'beta']);
  // 폴링이 이미 돌고 있어도 로그인 직후 sinceAt 요청은 묻히지 않는다
  const poll = c.refresh();
  await Promise.all([poll, c.refresh({ sinceAt: startedAt })]);
  const kinds = () => ev.reward.map((r) => r.kind);
  assert.equal(kinds().filter((k) => k === 'welcome').length, 1, JSON.stringify(kinds()));
  assert.equal(kinds().filter((k) => k === 'beta').length, 1);
  assert.equal(ev.reward.find((r) => r.kind === 'welcome').amount, 20000);
  // 재로그인(/auth/google 다시) · /auth/me · 기기 하나 더 연결 → 추가 지급 없음
  await env.DB.prepare('INSERT INTO account_devices (device_id, account_id, linked_at, merge_status) VALUES (?, ?, ?, ?)').bind(devs[1], 'w', NOW + 1000, 'merged').run();
  for (let i = 0; i < 3; i++) assert.deepEqual((await ST.grantStarters(env.DB, env, book, 'w', NOW + 2000 + i)).granted, []);
  const rows = (await env.DB.prepare("SELECT idempotency_key AS k FROM ledger WHERE account_id = 'w' AND reason IN ('welcome','beta') ORDER BY k").all()).results.map((r) => r.k);
  assert.deepEqual(rows, ['beta:w', 'welcome:w']);
  jar.now = NOW + 60_000;
  await c.refresh({ sinceAt: NOW + 55_000 });
  assert.equal(kinds().filter((k) => k === 'welcome').length, 1, 're-login → no second toast');
  // 새로고침(같은 저장소의 새 클라이언트) → 다시 안 뜸
  const c2 = mk(env, jar, { storage: store });
  const ev2 = collect(c2);
  await c2.getSession();
  assert.equal(ev2.reward.filter((r) => r.kind === 'welcome' || r.kind === 'beta').length, 0);
  ok('welcome: auto once per account (welcome:{acc}), beta once; re-login / /auth/me / 2nd device / reload → no repeat; sinceAt toast survives an in-flight poll');
}

// ── 게임 쪽 신호: 구매 성공 → bw:econ-owned (보유 다시 받기), bw:econ-changed → 바로 새로 읽기(게시판 보상 토스트) ──
{
  const env = makeEnv();
  await account(env, 'v');
  const jar = { token: await S.signSession({ accountId: 'v', sessionVersion: 1, now: NOW }, SECRET) };
  const win = new EventTarget();
  const owned = [];
  win.addEventListener('bw:econ-owned', (e) => owned.push(e.detail));
  const log = [];
  const c = mk(env, jar, { win, log });
  const ev = collect(c);
  await c.getSession();
  // 상점 = 미리보기 전용: 서버가 거절 → 보유 신호 없음
  const p = await c.purchase('roadbike');
  assert.deepEqual([p.ok, p.error.code, p.error.reason], [false, 'not_eligible', 'coming_soon']);
  assert.deepEqual(owned, []);
  const shop = await c.listShopItems();
  assert.deepEqual(shop.map((i) => [i.id, i.available, i.comingSoon, i.price]), [['bike', false, true, 160000], ['roadbike', false, true, 1000000], ['scooter', false, true, 2500000], ['car', false, true, 7450000]]);
  // 게시판 글 보상(서버가 /board 처리 중 원장에 넣음) → board.js 가 bw:econ-changed → 토스트
  const acc = await env.DB.prepare("SELECT * FROM accounts WHERE id = 'v'").first();
  const r = await E.rewardBoardPost(env.DB, env, acc, { id: 9, category: 'free', title: 't', body: '판교 가는 길 탄천 자전거도로가 새로 포장돼서 아주 부드러워요. 밤엔 가로등도 밝습니다. 강아지 산책하는 분들이 많으니 천천히 달리세요!' }, NOW);
  assert.equal(r.rewarded, true);
  const before = ev.reward.length;
  win.dispatchEvent(new CustomEvent('bw:econ-changed', { detail: { source: 'board' } }));
  await new Promise((res) => setTimeout(res, 20));
  const boardEv = ev.reward.slice(before).filter((x) => x.kind === 'board');
  assert.equal(boardEv.length, 1); assert.equal(boardEv[0].amount, 1000);
  const wl = await c.getLedger({ limit: 10 });
  assert.ok(wl.some((e) => e.kind === 'board' && e.delta === 1000));
  ok('signals: shop preview → purchase rejected coming_soon, no bw:econ-owned, items passthrough comingSoon; bw:econ-changed → immediate refresh → board reward toast, wallet kind board');
}

// ── 유료 모드 잔액 부족: 게임 탑승은 막히고, 'payment' 이벤트(status insufficient)로 08c 를 띄울 값이 온다 ──
{
  const env = makeEnv({ ECON_PAID: '1' });
  await account(env, 'pp');
  const jar = { token: await S.signSession({ accountId: 'pp', sessionVersion: 1, now: NOW }, SECRET) };
  const c = mk(env, jar);
  const ev = collect(c);
  await c.getSession();
  assert.equal((await c.getEconMode()).transitPaid, true);
  const bridge = rideProvider(c, () => ({ transitPaid: true }), { emit: (e) => ev.payment.push(e), alias: (x) => ({ 'bus.base': 'bus.city' })[x] || x });
  fare.setPaymentProvider(bridge, { always: true });
  // 잔액 +400 (버스 1,650 에 모자람)
  await L.appendLedger(env.DB, { accountId: 'pp', amount: 400, kind: 'free', reason: 'refund', idempotencyKey: 'seed-pp' }, { now: NOW });
  await c.refresh();
  const b0 = (await c.getBalance()).total; // account() 시드 포함
  assert.ok(b0 < 1650);
  const pick = (e) => ({ code: e.code, need: e.need, balance: e.balance, shortBy: e.shortBy });
  const before = ev.payment.length;
  const bus = await fare.charge({ code: 'bus.base', mode: 'bus', meta: { to: '정자역' } });
  assert.equal(bus.ok, false); assert.equal(bus.error, 'insufficient_balance'); assert.equal(bus.receiptId, null);
  assert.deepEqual(pick(bus.errorInfo), { code: 'insufficient_balance', need: 1650, balance: b0, shortBy: 1650 - b0 });
  const fail = ev.payment.slice(before);
  assert.equal(fail.length, 1, 'exactly one payment event');
  const f0 = fail[0];
  assert.deepEqual([f0.status, f0.ok, f0.receiptId, f0.mode, f0.code, f0.need, f0.balance, f0.shortBy], ['insufficient', false, null, 'bus', 'bus.city', 1650, b0, 1650 - b0]);
  assert.deepEqual(pick(f0.error), pick(bus.errorInfo)); assert.equal(typeof f0.error.message?.ko, 'string');
  assert.ok(String(f0.rideId).startsWith('ride-'));
  assert.equal((await c.getBalance()).total, b0, 'nothing charged');
  // 택시: 홀드 단계에서 부족 → 정산 안 감, 같은 모양
  const taxi = await fare.charge({ code: 'taxi.drive', mode: 'taxi', meta: { meters: 5000 } });
  assert.equal(taxi.ok, false); assert.equal(taxi.error, 'insufficient_balance');
  const t0 = ev.payment.at(-1);
  assert.deepEqual([t0.status, t0.mode, t0.code, t0.need, t0.balance, t0.shortBy], ['insufficient', 'taxi', 'taxi.drive', t0.need, b0, t0.need - b0]); assert.ok(t0.need > b0);
  assert.equal(Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM taxi_holds WHERE account_id = 'pp'").first()).n), 0, 'no hold left behind');
  // UI 가 직접 부른 payFare 는 Result 로만(이벤트 없음 → 08c 중복 없음)
  const n0 = ev.payment.length;
  const direct = await c.payFare({ mode: 'subway', code: 'subway.base', rideId: 'sub-direct' });
  assert.equal(direct.error.code, 'insufficient_balance'); assert.equal(ev.payment.length, n0);
  // 잔액을 채우면 같은 탑승이 성공 → 성공 payment 이벤트(status 없음 = 성공)
  await L.appendLedger(env.DB, { accountId: 'pp', amount: 5000, kind: 'free', reason: 'refund', idempotencyKey: 'seed-pp2' }, { now: NOW });
  await c.refresh();
  const okBus = await fare.charge({ code: 'bus.base', mode: 'bus' });
  assert.equal(okBus.ok, true); assert.equal(okBus.amount, 1650); assert.equal(okBus.free, false);
  const s0 = ev.payment.at(-1);
  assert.equal(s0.status, undefined); assert.equal(s0.amount, 1650); assert.ok(s0.receiptId);
  // 막힌 탑승은 탑승 퀘스트(D-BUS1)를 채우지 않는다 → 성공한 첫 탑승에서만 800
  const keys = (await env.DB.prepare("SELECT idempotency_key AS k FROM ledger WHERE account_id = 'pp' ORDER BY id").all()).results.map((r) => r.k);
  assert.equal(keys.filter((k) => k.startsWith('fare:')).length, 1, 'only the successful ride debited');
  assert.ok(keys.indexOf(keys.find((k) => k.startsWith('quest:pp:D-BUS1'))) > keys.indexOf(keys.find((k) => k.startsWith('fare:'))));
  assert.equal((await c.getBalance()).total, b0 + 5000 - 1650 + 800);
  // 다른 실패(게스트 유료 모드 → not_signed_in): status failed, 금액 필드 없음
  jar.token = null; await c.refresh();
  const g = await fare.charge({ code: 'bus.base', mode: 'bus' });
  assert.equal(g.ok, false); assert.equal(g.error, 'not_signed_in');
  const g0 = ev.payment.at(-1);
  assert.equal(g0.status, 'failed'); assert.equal(g0.error.code, 'not_signed_in'); assert.equal('need' in g0, false);
  fare.setPaymentProvider(null);
  ok('paid mode insufficient: game ride blocked, hook gets {ok:false,error:{code,need,balance,shortBy}}, one payment event status insufficient (bus & taxi, no hold left), direct payFare → Result only, top-up → success event, guest → status failed');
}

console.log(`\necon client: ${n} checks passed`);
