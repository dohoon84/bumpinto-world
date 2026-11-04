// node scripts/test-economy.mjs — [economy] 서버 경제 로직 오프라인 테스트 (네트워크·Cloudflare 불필요)
//   D1 은 node:sqlite 로 흉내 내고 0001 + 0002 마이그레이션을 그대로 적용한다.
//   원장 멱등 · 상한 · 이동 검증 · 요금(무료/유료·잔액 부족) · 택시 홀드 · 상점 · 게시판 도배 방지 · 퀘스트/업적 · /econ 라우트
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const E = await import('../server/phone/src/account/economy.js');
const C = await import('../server/phone/src/account/econ.js');
const L = await import('../server/phone/src/account/ledger.js');
const STAT = await import('../server/phone/src/account/stats.js');
const F = await import('../server/phone/src/account/flags.js');
const S = await import('../server/phone/src/account/session.js');
const { handleEcon } = await import('../server/phone/src/account/econRoutes.js');

let n = 0;
const ok = (m) => console.log('  ok', ++n, m);
const SECRET = 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
// 2026-11-04(수) 16:00 KST — 주 = 11/02~11/08
const NOW = Date.parse('2026-11-04T07:00:00Z');
const MIN = 60_000;

function d1Of(db) {
  const isReader = (q) => /^\s*(SELECT|WITH|PRAGMA)/i.test(q) || /\bRETURNING\b/i.test(q);
  const exec1 = (q, params) => {
    const st = db.prepare(q);
    if (isReader(q)) { const rows = st.all(...params); return { results: rows, meta: { changes: 0 } }; }
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const make = (q, params = []) => ({
    _q: q, _p: params,
    bind: (...p) => make(q, p),
    async first() { return exec1(q, params).results[0] ?? null; },
    async all() { return exec1(q, params); },
    async run() { return exec1(q, params); },
  });
  return {
    prepare: (q) => make(q),
    async batch(stmts) { if (!stmts.length) throw new Error('D1_ERROR: No SQL statements detected.'); // 실제 D1 과 같게

      db.exec('BEGIN');
      try { const out = stmts.map((s) => exec1(s._q, s._p)); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
const MIG = ['0001_accounts.sql', '0002_economy.sql'].map((f) => readFileSync(new URL(`../server/phone/migrations/${f}`, import.meta.url), 'utf8'));
function makeEnv(vars = {}) {
  const raw = new DatabaseSync(':memory:');
  for (const m of MIG) raw.exec(m);
  return { raw, env: { DB: d1Of(raw), SESSION_SECRET: SECRET, GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com', ACCOUNTS_ENABLED: '1', ECONOMY_ENABLED: '1', STATS_ENABLED: '1', ECON_FEATURES: 'move,quests,shop,board', ECON_PAID: '0', ...vars } };
}
async function account(env, id, createdAt = NOW - 30 * 86400_000) {
  await env.DB.prepare("INSERT INTO accounts (id, google_sub, email, name, created_at, first_login_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, `sub-${id}`, `${id}@x`, id, createdAt, createdAt, createdAt).run();
  return (await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first());
}
const bal = async (env, id, t = NOW) => (await E.balanceView(env.DB, id, t)).total;
const credit = (env, id, date, mode, sec) => env.DB.prepare(
  `INSERT INTO stat_credit_daily (account_id, kst_date, mode, credited_sec) VALUES (?, ?, ?, ?)
   ON CONFLICT(account_id, kst_date, mode) DO UPDATE SET credited_sec = credited_sec + excluded.credited_sec`).bind(id, date, mode, sec).run();
const give = (env, id, amount, key) => L.appendLedger(env.DB, { accountId: id, amount, kind: 'free', reason: 'refund', idempotencyKey: key }, { now: NOW });

console.log('economy tests');

// ── 설정 · 기본값 ──
{
  const base = { DB: {}, ACCOUNTS_ENABLED: '1', SESSION_SECRET: SECRET, GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com', ECONOMY_ENABLED: '1' };
  assert.deepEqual(F.econFeatures(base), []);
  assert.deepEqual(F.econFeatures({ ...base, ECONOMY_ENABLED: '0', ECON_FEATURES: 'move,quests' }), [], 'economy off → no features');
  assert.deepEqual(F.econFeatures({ ...base, ECON_FEATURES: 'board, move,bogus' }), ['move', 'board']);
  assert.deepEqual(E.econMode(base), { transitPaid: false, shopPaid: true, beta: true }, 'shop is not part of the free launch');
  assert.deepEqual(E.econMode({ ...base, ECON_PAID: '1' }), { transitPaid: true, shopPaid: true, beta: false });
  assert.equal(F.devLoginAllowed({ DEV_LOGIN: '1' }, new URL('http://localhost:8789/auth/dev')), true);
  assert.equal(F.devLoginAllowed({ DEV_LOGIN: '1' }, new URL('https://api.bumpinto.world/auth/dev')), false);
  assert.equal(F.devLoginAllowed({}, new URL('http://localhost:8789/auth/dev')), false);
  // 사설 LAN(아이폰 시험) — DEV_LOGIN=1 일 때만, 요청 주소와 Origin 이 모두 사설이어야
  const D = { DEV_LOGIN: '1' };
  for (const h of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.30.1.24', '172.31.255.255', '192.168.0.10']) assert.equal(F.devLoginAllowed(D, new URL(`http://${h}:8789/auth/dev`), `http://${h}:5173`), true, h);
  for (const h of ['172.15.0.1', '172.32.0.1', '8.8.8.8', '192.169.0.1', '100.64.0.1', 'example.com', '0.0.0.0']) assert.equal(F.devLoginAllowed(D, new URL(`http://${h}:8789/auth/dev`)), false, h);
  assert.equal(F.isPrivateDevHost('10.0.0.256'), false);
  assert.equal(F.devLoginAllowed({}, new URL('http://172.30.1.24:8789/auth/dev')), false, 'LAN without DEV_LOGIN');
  assert.equal(F.devLoginAllowed(D, new URL('http://127.0.0.1:8789/auth/dev'), 'https://abc.trycloudflare.com'), false, 'public tunnel origin → no dev login');
  assert.equal(F.devLoginAllowed(D, new URL('http://127.0.0.1:8789/auth/dev'), 'garbage'), false);
  // 쿠키 Secure: 기본·운영은 항상, DEV_LOGIN+SESSION_COOKIE_INSECURE 둘 다일 때만 뺀다
  assert.match(S.sessionCookie('t', {}), /; Secure;/);
  assert.match(S.sessionCookie('t', { SESSION_COOKIE_INSECURE: '1' }), /; Secure;/, 'insecure alone is ignored');
  assert.match(S.sessionCookie('t', { DEV_LOGIN: '1' }), /; Secure;/);
  assert.doesNotMatch(S.sessionCookie('t', { DEV_LOGIN: '1', SESSION_COOKIE_INSECURE: '1' }), /Secure/);
  const { credentialedOrigin } = await import('../server/phone/src/account/routes.js');
  const req = (o) => new Request('http://127.0.0.1:8789/auth/me', { headers: { Origin: o } });
  assert.equal(credentialedOrigin(req('http://172.30.1.24:5173'), D), 'http://172.30.1.24:5173');
  assert.equal(credentialedOrigin(req('http://172.30.1.24:5173'), {}), '', 'LAN http origin only with DEV_LOGIN');
  assert.equal(credentialedOrigin(req('http://8.8.8.8:5173'), D), '');
  assert.equal(credentialedOrigin(req('https://abc.trycloudflare.com'), D), '', 'tunnel needs ALLOWED_ORIGINS');
  assert.equal(credentialedOrigin(req('https://abc.trycloudflare.com'), { ...D, ALLOWED_ORIGINS: 'https://abc.trycloudflare.com' }), 'https://abc.trycloudflare.com');
  ok('flags: features empty by default, ECON_PAID default free, DEV_LOGIN localhost + RFC1918 LAN only (origin too), dev-only insecure cookie');
}

// ── 원장 멱등 · 상한 ──
{
  const { env } = makeEnv();
  await account(env, 'a1');
  const r1 = await E.grantCapped(env.DB, { accountId: 'a1', reason: 'quest', amount: 1000, key: 'k1', now: NOW });
  const r2 = await E.grantCapped(env.DB, { accountId: 'a1', reason: 'quest', amount: 1000, key: 'k1', now: NOW });
  assert.equal(r1.applied, true); assert.equal(r2.applied, false); assert.equal(r2.already, true);
  assert.equal(await bal(env, 'a1'), 1000);
  const sum = await L.ledgerSum(env.DB, 'a1'); assert.equal(sum.free, 1000);
  ok('ledger: same idempotency key twice → one row, balance cache = ledger sum');

  // v3: 퀘스트에는 bum 상한이 없다(정의가 상한 — 주간·월간 보상이 같은 날 몰려도 잘리지 않음)
  for (let i = 0; i < 12; i++) await E.grantCapped(env.DB, { accountId: 'a1', reason: 'quest', amount: 6000, key: `q${i}`, now: NOW });
  assert.equal(await bal(env, 'a1'), 1000 + 72000, 'quests not truncated by a bum cap');
  assert.equal(C.CAPS.daily.quest, undefined); assert.equal(C.CAPS.daily.total, undefined);
  // 게시판 하루 상한 = 글 수 × 글당 보상, 남은 몫만큼 잘라 준다
  assert.equal(C.CAPS.daily.board, C.BOARD.dailyRewards * C.BOARD.reward);
  assert.equal(C.CAPS.daily.board, 1000);
  assert.equal((await E.grantCapped(env.DB, { accountId: 'a1', reason: 'board', amount: 1000, key: 'b0', now: NOW })).applied, true);
  const last = await E.grantCapped(env.DB, { accountId: 'a1', reason: 'board', amount: 1000, key: 'bx', now: NOW });
  assert.equal(last.applied, false); assert.equal(last.capped, true);
  const D2 = NOW + 86400_000;
  await E.grantCapped(env.DB, { accountId: 'a1', reason: 'board', amount: 700, key: 'big', now: D2 });
  const part = await E.grantCapped(env.DB, { accountId: 'a1', reason: 'board', amount: 1000, key: 'part', now: D2 });
  assert.equal(part.amount, 300); assert.equal(part.capped, true);
  ok('caps (v4): quests uncapped in bum (definition-bounded), board daily cap = 1 × reward, remainder clamped, over-cap refused');

  // 주 bum 상한은 없다(기획 §6 의 주 상한은 이동 300 인정분 — 이동 테스트에서 확인). 표시값만 남는다.
  assert.deepEqual(Object.keys(C.CAPS.weekly), ['move']); assert.equal(C.CAPS.weekly.move, 51600);
  ok('caps: no weekly bum cap except the displayed move value (300 min × 172 = 51,600)');

  // 경합: 상한 검사가 INSERT 안에서 다시 돈다 — 미리 계산한 몫을 넘겨도 SQL 조건이 막는다
  const { env: e3 } = makeEnv();
  await account(e3, 'r');
  await L.appendLedger(e3.DB, { accountId: 'r', amount: 11999, kind: 'free', reason: 'quest', idempotencyKey: 'pre' }, { now: NOW });
  const P = F.kstPeriods(NOW);
  const where = { sql: `(SELECT COALESCE(SUM(amount),0) FROM ledger WHERE account_id = ? AND reason = 'quest' AND created_at >= ? AND created_at < ?) + ? <= ?`, params: ['r', P.day.start, P.day.end, 1000, 12000] };
  const race = await L.appendLedgerWhere(e3.DB, { accountId: 'r', amount: 1000, kind: 'free', reason: 'quest', idempotencyKey: 'race' }, { now: NOW, where });
  assert.equal(race.applied, false);
  ok('caps: conditional INSERT re-checks the cap inside the batch (race-safe)');
}

// ── 이동 검증 (MoveStats) ──
{
  const ms = new STAT.MoveStats();
  let t = NOW;
  for (let i = 0; i <= 120; i++) { ms.push({ x: i * 1.4, z: 0, mode: 'walk', now: t }); t += 1000; }
  const rows = ms.drain();
  const w = rows.find((r) => r.mode === 'walk');
  assert.ok(w.cs >= 119 && w.cs <= 120, `credited ${w.cs}`);
  ok('move: steady 1.4 m/s walk → credited seconds ≈ elapsed (60 s windows, net ≥ 30 m)');

  const loop = new STAT.MoveStats();
  t = NOW;
  for (let i = 0; i <= 180; i++) { loop.push({ x: (i % 2) * 3, z: 0, mode: 'walk', now: t }); t += 1000; }
  const lr = loop.drain().find((r) => r.mode === 'walk');
  assert.ok(lr.m > 100, 'stats still count distance'); assert.equal(lr.cs, 0, 'back-and-forth in place not credited');
  ok('move: pacing in place (net displacement < 30 m per window) → 0 credited, distance stats kept');

  const sprint = new STAT.MoveStats();
  t = NOW;
  for (let i = 0; i <= 120; i++) { sprint.push({ x: i * 7, z: 0, mode: 'walk', now: t }); t += 1000; }
  const sr = sprint.drain().find((r) => r.mode === 'walk');
  assert.equal(sr.cs, 0); assert.ok(sprint.dropped.fast > 100);
  ok('move: over the walk speed cap (Shift sprint) → not credited');

  const tele = new STAT.MoveStats();
  t = NOW;
  for (let i = 0; i <= 30; i++) { tele.push({ x: i * 1.4, z: 0, mode: 'walk', now: t }); t += 1000; }
  tele.push({ x: 5000, z: 0, mode: 'walk', now: t }); t += 1000;
  for (let i = 1; i <= 30; i++) { tele.push({ x: 5000 + i * 1.4, z: 0, mode: 'walk', now: t }); t += 1000; }
  assert.equal(tele.dropped.teleport, 1);
  const flood = new STAT.MoveStats();
  t = NOW;
  for (let i = 0; i < 1000; i++) { flood.push({ x: i * 0.05, z: 0, mode: 'walk', now: t }); t += 20; }
  assert.ok(flood.last.t - NOW < 20_000);
  const fr = flood.drain();
  assert.ok((fr[0]?.s || 0) <= 20);
  ok('move: teleport rejected (window reset); samples closer than 80 ms ignored (rate limit)');
}

// ── 이동 보상 정산 ──
{
  const { env } = makeEnv();
  await account(env, 'm');
  const today = F.kstDate(NOW);
  await credit(env, 'm', today, 'walk', 25 * 60);
  // 하루 1번: 오늘은 하루 몫(60분)에 닿기 전엔 지급 없음(대기 금액만 보임)
  let r = await E.settleMove(env.DB, env, 'm', today, NOW);
  assert.equal(r.added, 0); assert.equal(r.pending, 25); assert.equal(await bal(env, 'm'), 0, 'no payout before the daily target');
  let tv = await E.travelToday(env.DB, 'm', NOW);
  assert.equal(tv.minutes, 25); assert.equal(tv.pendingBum, 25 * 172); assert.equal(tv.settled, false);
  await credit(env, 'm', today, 'walk', 50 * 60);
  r = await E.settleMove(env.DB, env, 'm', today, NOW);
  assert.equal(r.minutes, 60); assert.equal(await bal(env, 'm'), C.CAPS.daily.move, 'daily cap 60 min = 10,320 paid at once');
  await credit(env, 'm', today, 'walk', 30 * 60);
  r = await E.settleMove(env.DB, env, 'm', today, NOW + 60_000);
  assert.equal(r.added, 0); assert.equal(await bal(env, 'm'), 10320, 'once per day: later minutes earn nothing');
  const mrows = (await env.DB.prepare("SELECT idempotency_key AS k, amount FROM ledger WHERE account_id = 'm' AND reason = 'move'").all()).results;
  assert.deepEqual(mrows.map((x) => [x.k, x.amount]), [[`move:m:${today}`, 10320]], 'exactly one ledger row per day');
  tv = await E.travelToday(env.DB, 'm', NOW);
  assert.equal(tv.settled, true); assert.equal(tv.pendingBum, 0);
  ok('move reward: once per day — paid in one row (move:{acc}:{date}) when 60 min reached, nothing before/after');

  // 못 채운 날: 날짜가 지나고(자정 + 15분) 다음 접속 때 인정분 그대로 1번 · 동력 탈것 0.5 · 버스 0
  const yday = F.kstDate(NOW - 86400_000);
  await credit(env, 'm', yday, 'walk', 7 * 60);
  await credit(env, 'm', yday, 'superbike', 10 * 60);
  await credit(env, 'm', yday, 'bus', 30 * 60);
  const ydayEnd = Date.parse(`${yday}T00:00:00+09:00`) + 86400_000;
  r = await E.settleMove(env.DB, env, 'm', yday, ydayEnd + 5 * 60_000);
  assert.equal(r.added, 0, 'grace after midnight for late stats');
  r = await E.settleMove(env.DB, env, 'm', yday, NOW);
  assert.equal(r.minutes, 12, '7 walk + 10×0.5 superbike + bus 0');
  r = await E.settleMove(env.DB, env, 'm', yday, NOW);
  assert.equal(r.added, 0);
  ok('move reward: short day pays once after the day ends (+15 min grace); superbike/truck ×0.5, bus/taxi ×0');

  // 접속 안 한 날들 따라잡기: settleMoveForDates 가 최근 7일 미지급 날짜를 오래된 순으로
  const { env: e3 } = makeEnv();
  await account(e3, 'cu');
  const d3 = F.kstDate(NOW - 3 * 86400_000), d9 = F.kstDate(NOW - 9 * 86400_000);
  await credit(e3, 'cu', d3, 'walk', 30 * 60);
  await credit(e3, 'cu', d9, 'walk', 30 * 60);
  await credit(e3, 'cu', today, 'walk', 5 * 60);
  assert.deepEqual(await E.unpaidMoveDates(e3.DB, 'cu', NOW), [d3, today]);
  await E.settleMoveForDates(e3.DB, e3, 'cu', [today], NOW);
  assert.equal(await bal(e3, 'cu'), 30 * 172, 'd-3 paid on next visit, today still pending, older than 7 days ignored');
  assert.deepEqual(await E.unpaidMoveDates(e3.DB, 'cu', NOW), [today]);
  ok('move reward: catch-up of unpaid past days (7-day window) on next visit');

  // 주 상한 300분: 하루 몫 = min(60, 이번 주 남은 분) → 남은 분에 닿으면 지급
  const { env: e2 } = makeEnv();
  await account(e2, 'wk');
  for (const d of ['2026-11-02', '2026-11-03']) await e2.DB.prepare("INSERT INTO move_rewards (account_id, kst_date, minutes_paid, updated_at) VALUES ('wk', ?, 140, ?)").bind(d, NOW).run();
  await credit(e2, 'wk', today, 'walk', 20 * 60);
  r = await E.settleMove(e2.DB, e2, 'wk', today, NOW);
  assert.equal(r.minutes, 20, 'only 300 − 280 left this week → paid at 20 min');
  await credit(e2, 'wk', today, 'walk', 40 * 60);
  assert.equal((await E.settleMove(e2.DB, e2, 'wk', today, NOW)).added, 0);
  const tw = await E.travelToday(e2.DB, 'wk', NOW);
  assert.equal(tw.weekMinutes, 300);
  ok('move reward: weekly 300-min cap across days');
}

// ── 교통: 무료 모드 ──
{
  const { env } = makeEnv();
  await account(env, 'f');
  await give(env, 'f', 5000, 'seed-f');
  const r = await E.payFare(env.DB, env, 'f', { code: 'bus.city', rideId: 'ride-1' }, NOW);
  assert.equal(r.ok, true);
  assert.deepEqual([r.data.receipt.free, r.data.receipt.amount, r.data.receipt.listAmount, r.data.receipt.mode], [true, 0, 1650, 'bus']);
  assert.equal(await bal(env, 'f'), 5000);
  const again = await E.payFare(env.DB, env, 'f', { code: 'bus.city', rideId: 'ride-1' }, NOW + 1000);
  assert.equal(again.data.replay, true); assert.equal(again.data.receipt.receiptId, r.data.receipt.receiptId);
  const ev = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(charged_amount) AS c FROM econ_events WHERE account_id = 'f' AND kind = 'ride'").first();
  assert.equal(ev.n, 1); assert.equal(ev.c, 0);
  const ledgerFare = await env.DB.prepare("SELECT COUNT(*) AS n FROM ledger WHERE account_id = 'f' AND reason = 'fare'").first();
  assert.equal(ledgerFare.n, 0);
  assert.equal((await E.payFare(env.DB, env, 'f', { code: 'bus.nope', rideId: 'x' }, NOW)).error.code, 'unknown');
  assert.equal(E.listFare('bus.base').code, 'bus.city', 'old client code alias');
  ok('fare (free mode): amount 0, listAmount 1,650, no ledger debit, usage event logged once per rideId');

  // 이용 기록 도배: 30초 안 연속 이용은 qty 0
  await E.payFare(env.DB, env, 'f', { code: 'subway.base', rideId: 'ride-2' }, NOW + 5000);
  const q = await env.DB.prepare("SELECT qty FROM econ_events WHERE idempotency_key = 'fare:f:ride-2'").first();
  assert.equal(q.qty, 0);
  await E.payFare(env.DB, env, 'f', { code: 'subway.base', rideId: 'ride-3' }, NOW + 60_000);
  const q3 = await env.DB.prepare("SELECT qty FROM econ_events WHERE idempotency_key = 'fare:f:ride-3'").first();
  assert.equal(q3.qty, 1);
  // env 로 바꾼 값을 따른다 (RIDE_MIN_GAP_SEC=0 · RIDE_DAILY_COUNTED=2)
  const { env: eL } = makeEnv({ RIDE_MIN_GAP_SEC: '0', RIDE_DAILY_COUNTED: '2' });
  await account(eL, 'fl');
  for (let i = 0; i < 3; i++) await E.payFare(eL.DB, eL, 'fl', { code: 'bus.city', rideId: `l${i}` }, NOW + i * 1000);
  const qs3 = (await eL.DB.prepare("SELECT qty FROM econ_events WHERE account_id = 'fl' ORDER BY id").all()).results.map((x) => x.qty);
  assert.deepEqual(qs3, [1, 1, 0]);
  ok('fare: rides < 30 s apart still allowed but not counted for quests/karma (anti-farm); limits from env config');

  // 택시 요금 = mock 과 같은 계산
  assert.equal(E.taxiFare(1600), 4800); assert.equal(E.taxiFare(1601), 4900); assert.equal(E.taxiFare(3000), 4800 + Math.ceil(1400 / 131) * 100);
  assert.equal(E.taxiFare(3000, { night: true }), Math.round((4800 + 1100) * 1.3));
  assert.equal(E.taxiFare(3000, { factor: 1.5 }), Math.round(5900 * 1.5));
  assert.equal(E.taxiFare(999999), E.taxiFare(C.TAXI.maxM), 'distance clamped');
  assert.equal(E.isNightKst(Date.parse('2026-11-04T14:30:00Z')), true); assert.equal(E.isNightKst(NOW), false);
  ok('taxi fare: 4,800/1.6 km + 100 per 131 m, night ×1.3 (23–04 KST), instant ×1.5, distance clamp');

  // 무료 택시: 0원 홀드 → 정산 → 기록
  const h = await E.holdTaxi(env.DB, env, 'f', { code: 'taxi.drive', estimateMeters: 3000, rideId: 'tx-1' }, NOW + 120_000);
  assert.equal(h.data.hold.free, true); assert.equal(h.data.hold.amount, 0); assert.equal(h.data.hold.listAmount, 5900);
  const s = await E.settleTaxi(env.DB, env, 'f', { holdId: h.data.hold.holdId, actualMeters: 2500 }, NOW + 200_000);
  assert.equal(s.data.settlement.charged, 0); assert.equal(s.data.settlement.free, true);
  assert.equal(await bal(env, 'f', NOW + 200_000) >= 5000, true);
  ok('taxi (free mode): 0-bum hold, settle logs the ride, no debit');
}

// ── 교통: 유료 모드 (ECON_PAID=1) ──
{
  const { env } = makeEnv({ ECON_PAID: '1' });
  await account(env, 'p');
  await give(env, 'p', 1000, 'seed-p');
  const r = await E.payFare(env.DB, env, 'p', { code: 'bus.city', rideId: 'p-1' }, NOW);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'insufficient_balance');
  assert.deepEqual([r.error.need, r.error.balance, r.error.shortBy], [1650, 1000, 650]);
  await give(env, 'p', 2000, 'seed-p2');
  const r2 = await E.payFare(env.DB, env, 'p', { code: 'bus.city', rideId: 'p-1' }, NOW);
  assert.equal(r2.ok, true); assert.equal(r2.data.receipt.free, false); assert.equal(r2.data.receipt.amount, 1650);
  assert.equal(await bal(env, 'p'), 3000 - 1650);
  const r3 = await E.payFare(env.DB, env, 'p', { code: 'bus.city', rideId: 'p-1' }, NOW + 1000);
  assert.equal(r3.data.replay, true); assert.equal(await bal(env, 'p'), 1350, 'replay does not double-debit');
  ok('fare (paid mode): insufficient_balance {need, balance, shortBy}; debit once per rideId');

  // 택시 홀드: 잔액에서 잡아 두고, 정산 때 원장 1줄
  await give(env, 'p', 10000, 'seed-p3');
  const before = await bal(env, 'p');
  const h = await E.holdTaxi(env.DB, env, 'p', { code: 'taxi.drive', estimateMeters: 3000, rideId: 'tp-1' }, NOW);
  assert.equal(h.data.hold.amount, 5900);
  assert.equal(await bal(env, 'p'), before - 5900, 'hold reduces available balance');
  const s = await E.settleTaxi(env.DB, env, 'p', { holdId: h.data.hold.holdId, actualMeters: 2000 }, NOW + 60_000);
  assert.equal(s.data.settlement.charged, E.taxiFare(2000)); assert.equal(s.data.settlement.refunded, 5900 - E.taxiFare(2000));
  const won = s.data.rewards.reduce((a, g) => a + g.amount, 0); // 배정된 교통 퀘스트(D-BUS1·D-SUB1)가 있으면 그 보상이 같이 들어옴
  assert.equal(await bal(env, 'p', NOW + 60_000), before - E.taxiFare(2000) + won);
  const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM ledger WHERE account_id = 'p' AND reason = 'fare' AND idempotency_key LIKE 'taxi:%'").first();
  assert.equal(rows.n, 1);
  const s2 = await E.settleTaxi(env.DB, env, 'p', { holdId: h.data.hold.holdId, actualMeters: 2000 }, NOW + 70_000);
  assert.equal(s2.data.replay, true);
  const over = await E.settleTaxi(env.DB, env, 'p', { holdId: 'h-none', actualMeters: 1 }, NOW);
  assert.equal(over.error.code, 'hold_not_found');
  const h2 = await E.holdTaxi(env.DB, env, 'p', { code: 'taxi.fast', estimateMeters: 1600, rideId: 'tp-2' }, NOW + 80_000);
  assert.equal((await E.cancelTaxi(env.DB, 'p', h2.data.hold.holdId, NOW + 90_000)).ok, true);
  assert.equal((await E.cancelTaxi(env.DB, 'p', h2.data.hold.holdId, NOW + 90_000)).error.code, 'hold_not_found');
  const big = await E.holdTaxi(env.DB, env, 'p', { code: 'taxi.instant', estimateMeters: 30000, rideId: 'tp-3' }, NOW + 95_000);
  assert.equal(big.error.code, 'insufficient_balance');
  ok('taxi (paid mode): hold reserves, settle charges actual ≤ hold in one ledger row, cancel releases, insufficient on hold');

  // 회수 등으로 잔액이 음수 → spend_locked
  const { env: e2 } = makeEnv({ ECON_PAID: '1' });
  await account(e2, 'neg');
  await L.appendLedger(e2.DB, { accountId: 'neg', amount: -500, kind: 'free', reason: 'board', idempotencyKey: 'neg' }, { now: NOW });
  assert.equal((await E.payFare(e2.DB, e2, 'neg', { code: 'subway.base', rideId: 'n1' }, NOW)).error.code, 'spend_locked');
  ok('paid mode: negative balance → spend_locked');
}

// ── 상점: 미리보기 전용(아무것도 공짜로 주지 않음, 무료·유료 모두 구매 거절, 아무것도 안 씀) ──
{
  const counts = async (env) => {
    const one = async (sql) => Number((await env.DB.prepare(sql).first()).n);
    return { ledger: await one('SELECT COUNT(*) AS n FROM ledger'), owned: await one('SELECT COUNT(*) AS n FROM account_vehicles'), events: await one("SELECT COUNT(*) AS n FROM econ_events WHERE kind = 'shop'") };
  };
  for (const paidFlag of ['0', '1']) {
    const { env } = makeEnv({ ECON_PAID: paidFlag });
    await account(env, 's');
    await give(env, 's', 9_000_000, 'seed-s'); // 유료 모드라도 잔액 충분 — 그래도 거절
    const items = await E.listShop(env.DB, env, 's', NOW);
    assert.deepEqual(items.map((i) => [i.id, i.name.ko, i.price, i.listPrice]), [['bike', '첫 자전거', 160000, 160000], ['roadbike', 'CR·1 로드바이크', 1000000, 1000000], ['scooter', '스쿠터', 2500000, 2500000], ['car', '경차', 7450000, 7450000]]);
    for (const i of items) assert.deepEqual([i.available, i.comingSoon, i.status, i.statusText.ko, i.free, i.affordable, i.giftable, i.owned], [false, true, 'coming_soon', '준비중', false, false, false, false], i.id);
    assert.deepEqual(E.econMode(env).shopPaid, true);
    const before = await counts(env), b0 = await bal(env, 's');
    for (const id of ['bike', 'roadbike', 'scooter', 'car']) {
      const r = await E.purchase(env.DB, env, 's', id, NOW);
      assert.deepEqual([r.ok, r.error.code, r.error.reason, r.error.message.ko], [false, 'not_eligible', 'coming_soon', '탈것 상점은 준비중이에요'], `${id} paid=${paidFlag}`);
    }
    assert.equal((await E.purchase(env.DB, env, 's', 'nope', NOW)).error.code, 'unknown');
    assert.deepEqual(await counts(env), before, 'no ledger / ownership / event rows');
    assert.equal(await bal(env, 's'), b0);
    assert.deepEqual(await E.accountVehicleGifts(env.DB, 's'), []);
    // HTTP 도 같은 거절(409)
    const tok = await S.signSession({ accountId: 's', sessionVersion: 1, now: NOW }, SECRET);
    const res = await handleEcon(new Request('http://localhost:8789/econ/shop/buy', { method: 'POST', headers: { Cookie: `bw_s=${tok}`, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify({ itemId: 'roadbike' }) }), env, new URL('http://localhost:8789/econ/shop/buy'), { now: NOW });
    const j = await res.json();
    assert.deepEqual([res.status, j.error.code, j.error.reason], [409, 'not_eligible', 'coming_soon']);
    assert.deepEqual(await counts(env), before);
    const goal = await E.shopGoal(env.DB, env, 's', NOW); assert.deepEqual([goal.itemId, goal.comingSoon], ['bike', true]);
  }
  ok('shop = preview only: 4 items at plan prices, available:false · comingSoon · 준비중; buy rejected (not_eligible/coming_soon) in free AND paid mode, HTTP 409, no ledger/ownership/event rows');
}

// ── 게시판 도배 방지 ──
{
  const { env } = makeEnv();
  const young = await account(env, 'young', NOW - 3600_000);
  const acc = await account(env, 'b');
  const long = '정자동 카페 골목에서 오늘 본 노을이 정말 예뻤어요. 다들 산책 나와 보세요! 탄천 쪽도 좋아요.';
  assert.ok(E.boardTextLen(long) >= C.BOARD.minChars);
  assert.equal(E.boardTextLen('ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ'), 1);
  assert.equal((await E.rewardBoardPost(env.DB, env, young, { id: 1, title: 't', body: long }, NOW)).reason, 'account_too_new');
  assert.equal((await E.rewardBoardPost(env.DB, env, acc, { id: 2, title: 't', body: '짧은 글'.repeat(3) }, NOW)).reason, 'too_short');
  const r = await E.rewardBoardPost(env.DB, env, acc, { id: 3, title: 't', body: long }, NOW);
  assert.equal(r.rewarded, true); assert.equal(r.amount, 1000);
  assert.equal((await E.rewardBoardPost(env.DB, env, acc, { id: 3, title: 't', body: long }, NOW)).reason, 'already');
  // 하루 1번: 그날 뒤 글은 그냥 글(보상·원장 행·토스트 없음). 쿨다운 없음
  assert.equal((await E.rewardBoardPost(env.DB, env, acc, { id: 4, title: 't2', body: long + ' 또' }, NOW + 60_000)).reason, 'daily_limit');
  assert.equal((await E.rewardBoardPost(env.DB, env, acc, { id: 5, title: 't3', body: long + ' 셋째' }, NOW + 3600_000)).reason, 'daily_limit');
  assert.equal(await bal(env, 'b', NOW + 3600_000), 1000);
  // 다음 날: 같은 글 다시 올리기는 막고, 새 글 하나만
  const D2 = NOW + 86400_000;
  assert.equal((await E.rewardBoardPost(env.DB, env, acc, { id: 6, title: 't', body: long }, D2)).reason, 'duplicate');
  assert.equal((await E.rewardBoardPost(env.DB, env, acc, { id: 7, title: 'a', body: long + ' 둘째 날' }, D2 + 1000)).rewarded, true);
  assert.equal((await E.rewardBoardPost(env.DB, env, acc, { id: 8, title: 'b', body: long + ' 둘째 날 또' }, D2 + 2000)).reason, 'daily_limit');
  assert.equal(await bal(env, 'b', D2 + 2000), 2000);
  const keys = (await env.DB.prepare("SELECT idempotency_key AS k FROM ledger WHERE account_id = 'b' AND reason = 'board' ORDER BY id").all()).results.map((x) => x.k);
  assert.deepEqual(keys, [`board:b:${F.kstDate(NOW)}`, `board:b:${F.kstDate(D2)}`]);
  // 동시에 두 글 → 하나만 보상, board_rewards 도 하나만
  const accR = await account(env, 'race');
  const both = await Promise.all([11, 12].map((id) => E.rewardBoardPost(env.DB, env, accR, { id, title: `r${id}`, body: `${long} 경주 ${id}` }, NOW)));
  assert.equal(both.filter((x) => x.rewarded).length, 1, JSON.stringify(both));
  assert.equal(Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM board_rewards WHERE account_id = 'race'").first()).n), 1);
  assert.equal(await bal(env, 'race'), 1000);
  ok('board reward: once per KST day (first qualifying post), later posts plain (no row, no toast), account age, min length, duplicate text, race-safe');

  // 회수: 보상 받은 글 삭제 → 음수 행 1번, 그날 기회는 다시 안 열림 · 짧게 고쳐도 회수
  const cb = await E.clawbackBoardPost(env.DB, 'b', 3, 'deleted', D2 + 3000);
  assert.equal(cb.clawed, true); assert.equal(await bal(env, 'b', D2 + 3000), 1000);
  assert.equal((await E.clawbackBoardPost(env.DB, 'b', 3, 'deleted', D2 + 3000)).clawed, false);
  assert.equal((await E.clawbackBoardPost(env.DB, 'b', 4, 'deleted', D2 + 3000)).clawed, false, 'unrewarded post: nothing to claw back');
  const up = await E.onBoardUpdate(env.DB, env, acc, { id: 7, title: 'a', body: '짧게' }, D2 + 4000);
  assert.equal(up.clawed, true); assert.equal(await bal(env, 'b', D2 + 4000), 0);
  assert.equal((await E.rewardBoardPost(env.DB, env, acc, { id: 9, title: 'z', body: long + ' 지운 뒤 새 글' }, D2 + 5000)).reason, 'daily_limit', 'clawback does not reopen the day');
  assert.equal((await E.clawbackBoardPost(env.DB, 'other', 11, 'deleted', NOW)).clawed, false, 'only the author account');
  ok('board reward: delete or edit below minimum → clawback once (negative row)');
}

// ── 퀘스트 · 업적 ──
{
  const { env } = makeEnv();
  await account(env, 'q');
  await env.DB.prepare("INSERT INTO login_days (account_id, kst_date, first_at) VALUES ('q', ?, ?)").bind(F.kstDate(NOW), NOW).run();
  const got = await E.autoSettle(env.DB, env, 'q', NOW);
  assert.ok(got.some((g) => g.questId === 'D-LOGIN' && g.amount === 500));
  assert.equal(await bal(env, 'q'), 500);
  assert.equal((await E.claimQuest(env.DB, env, 'q', 'D-LOGIN', NOW)).error.code, 'already_claimed');
  const daily = await E.listQuests(env.DB, env, 'q', 'daily', NOW);
  assert.equal(daily.quests.length, 4); assert.equal(daily.quests[0].id, 'D-LOGIN'); assert.equal(daily.quests[0].state, 'claimed');
  assert.equal(daily.quests[3].id, 'D-ALL3'); assert.equal(daily.quests[3].bonus, true); assert.equal(daily.quests[3].progress.value, 1);
  const assigned = daily.quests.slice(0, 3).map((x) => x.id);
  const again = await E.listQuests(env.DB, env, 'q', 'daily', NOW + 3600_000);
  assert.deepEqual(again.quests.slice(0, 3).map((x) => x.id), assigned, 'assignment fixed for the day');
  const walkQ = assigned.find((id) => id === 'D-WALK10');
  if (walkQ) {
    const nc = await E.claimQuest(env.DB, env, 'q', 'D-WALK10', NOW);
    assert.equal(nc.error.code, 'not_complete'); assert.equal(nc.error.target, 10);
  }
  assert.equal((await E.claimQuest(env.DB, env, 'q', 'X-NOPE', NOW)).error.code, 'unknown');
  const w = await E.listQuests(env.DB, env, 'q', 'weekly', NOW);
  assert.deepEqual(w.quests.map((x) => x.id), ['W-WALK', 'W-DAYS', 'W-DAILY', 'W-TRANSIT']);
  assert.equal(w.quests[1].progress.value, 1); assert.equal(w.quests[2].progress.value, 1, 'daily claims counted');
  assert.equal(w.resetsAt, Date.parse('2026-11-08T15:00:00Z'), 'resets Monday 00:00 KST');
  ok('quests: D-LOGIN auto-claimed 500, assignment fixed per day, not_complete/unknown/already, weekly counts');

  // 모든 일일 퀘스트를 채우면 보너스까지 연쇄 지급
  for (const id of assigned) {
    const def = C.QUESTS.daily.pool.find((x) => x.id === id);
    if (def.metric === 'move_min') await credit(env, 'q', F.kstDate(NOW), def.modes[0], def.target * 60);
  }
  let t = NOW;
  for (const id of assigned) {
    const def = C.QUESTS.daily.pool.find((x) => x.id === id);
    if (def.metric === 'ride') {
      t += 60_000;
      if (def.modes[0] === 'taxi') {
        const h = await E.holdTaxi(env.DB, env, 'q', { code: 'taxi.drive', estimateMeters: 2000, rideId: `qt${t}` }, t);
        await E.settleTaxi(env.DB, env, 'q', { holdId: h.data.hold.holdId, actualMeters: 2000 }, t);
      } else await E.payFare(env.DB, env, 'q', { code: def.modes[0] === 'bus' ? 'bus.city' : 'subway.base', rideId: `qr${t}` }, t);
    }
  }
  await E.autoSettle(env.DB, env, 'q', t);
  const d2 = await E.listQuests(env.DB, env, 'q', 'daily', t);
  assert.ok(d2.quests.every((x) => x.state === 'claimed'), JSON.stringify(d2.quests.map((x) => [x.id, x.state])));
  ok('quests: completing all 3 dailies auto-pays each + D-ALL3 bonus');

  // 업적(기획 §4 · Figma Note 06 의 두 개만): 현실 환산 100 km 걸음 +5,000 · 30일 연속 +10,000. 카르마: 교통 1회 = 5, 건강은 인정 분에서만
  assert.deepEqual(C.ACHIEVEMENTS.map((a) => [a.id, a.threshold, a.reward]), [['ACH-WALK100', 100, 5000], ['ACH-STREAK30', 30, 10000]]);
  const { env: e2 } = makeEnv();
  await account(e2, 'ach');
  for (let i = 0; i < 10; i++) await E.payFare(e2.DB, e2, 'ach', { code: 'subway.base', rideId: `a${i}` }, NOW + i * 60_000);
  await e2.DB.prepare("INSERT INTO stat_mode_totals (account_id, mode, distance_m, seconds, updated_at) VALUES ('ach', 'walk', 100000, 72000, ?)").bind(NOW).run();
  for (let d = 0; d < 30; d++) {
    const day = F.kstDate(NOW - d * 86400_000);
    await e2.DB.prepare('INSERT INTO login_days (account_id, kst_date, first_at) VALUES (?, ?, ?)').bind('ach', day, NOW - d * 86400_000).run();
  }
  await e2.DB.prepare("INSERT INTO quest_claims (account_id, quest_id, period, cadence, amount, karma_axis, karma_points, created_at) VALUES ('ach', 'D-WALK10', 'x', 'daily', 1000, 'health', 10, ?)").bind(NOW).run();
  await E.autoSettleAchievements(e2.DB, 'ach', NOW + 600_000);
  await E.autoSettleAchievements(e2.DB, 'ach', NOW + 600_000);
  const k = await E.getKarma(e2.DB, 'ach', NOW + 600_000);
  assert.equal(k.achievements.find((a) => a.id === 'ACH-WALK100').state, 'unlocked');
  assert.equal(k.achievements.find((a) => a.id === 'ACH-STREAK30').state, 'unlocked');
  assert.ok(k.axes.transit.points >= 50, 'transit 5 per ride (+ quest transit karma)');
  assert.equal(k.axes.health.points, 0, 'quest health karma is display-only (plan §5 *)');
  assert.equal(k.axes.neighbor.points, 0);
  assert.equal(k.axes.streak.days, 30);
  assert.deepEqual(Object.keys(k.axes), ['health', 'explore', 'transit', 'neighbor', 'streak']);
  const achRows = (await e2.DB.prepare("SELECT ref, amount FROM ledger WHERE account_id = 'ach' AND reason = 'ach' ORDER BY ref").all()).results;
  assert.deepEqual(achRows.map((r) => [r.ref, r.amount]), [['ACH-STREAK30', 10000], ['ACH-WALK100', 5000]]);
  ok('achievements (plan): 100 km walk +5,000 · 30-day streak +10,000, once each; karma transit 5/ride, health from minutes only, neighbor 0');
}

// ── /econ 라우트 (게스트 · 로그인 · 결과 모양) ──
{
  const { env } = makeEnv({ ECON_PAID: '1' });
  await account(env, 'u');
  const token = await S.signSession({ accountId: 'u', sessionVersion: 1, now: NOW }, SECRET);
  const req = (path, { method = 'GET', body, cookie = true } = {}) => handleEcon(new Request(`http://localhost:8789${path}`, {
    method, headers: { ...(cookie ? { Cookie: `bw_s=${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), Origin: 'http://localhost:5173' },
    body: body ? JSON.stringify(body) : undefined,
  }), env, new URL(`http://localhost:8789${path}`), { now: NOW });

  const g = await (await req('/econ/state', { cookie: false })).json();
  assert.equal(g.ok, true); assert.equal(g.data.session.signedIn, false); assert.equal(g.data.balance.guest, true);
  const gq = await (await req('/econ/quests?period=weekly', { cookie: false })).json();
  assert.equal(gq.data.guest, true); assert.equal(gq.data.quests.length, 0);
  const gp = await req('/econ/fare', { method: 'POST', body: { code: 'bus.city', rideId: 'g' }, cookie: false });
  assert.equal(gp.status, 401); assert.equal((await gp.json()).error.code, 'not_signed_in');
  ok('routes (guest): empty shapes with guest:true, writes → 401 not_signed_in');

  const s = await (await req('/econ/state')).json();
  assert.equal(s.data.session.signedIn, true); assert.deepEqual(s.data.mode, { transitPaid: true, shopPaid: true, beta: false });
  const lastId = s.data.lastId;
  const fare = await req('/econ/fare', { method: 'POST', body: { code: 'bus.city', rideId: 'u1' } });
  assert.equal(fare.status, 402);
  const fj = await fare.json();
  assert.deepEqual(fj, { ok: false, error: { code: 'insufficient_balance', need: 1650, balance: 500, shortBy: 1150, message: { ko: '잔액 1,150 bum 부족', en: '1,150 bum short' } } });
  const s2 = await (await req(`/econ/state?since=${lastId}`)).json();
  assert.ok(Array.isArray(s2.data.events));
  assert.ok(s.data.balance.total === 500, 'D-LOGIN auto-paid on first state poll');
  const cors = fare.headers.get('Access-Control-Allow-Origin');
  assert.equal(cors, 'http://localhost:5173'); assert.equal(fare.headers.get('Access-Control-Allow-Credentials'), 'true');
  const cfg = await (await req('/econ/config', { cookie: false })).json();
  assert.equal(cfg.data.fares['bus.city'].amount, 1650);
  const bad = await handleEcon(new Request('http://localhost:8789/econ/fare', { method: 'POST', headers: { Cookie: `bw_s=${token}`, 'Content-Type': 'text/plain' }, body: '{}' }), env, new URL('http://localhost:8789/econ/fare'), { now: NOW });
  assert.equal(bad.status, 400);
  const off = await handleEcon(new Request('http://localhost:8789/econ/state'), { ...env, ECONOMY_ENABLED: '0' }, new URL('http://localhost:8789/econ/state'), { now: NOW });
  assert.equal(off.status, 404);
  ok('routes (signed in): state + events, 402 insufficient_balance shape, credentialed CORS, JSON-only POST, 404 when economy off');
}

// ── 튜닝 값 = 기획 (bw-economy-v1/plan.html v1 · Figma 13:2 Note). 바꾸면 이 표와 PR 표를 같이 고친다 ──
{
  assert.equal(C.ECON_CONFIG_VERSION, 4);
  assert.equal(C.MOVE.perMinute, 172); assert.equal(C.movePerMinute('2026-12-31'), 172); assert.equal(C.movePerMinute('2027-01-01'), 178);
  assert.equal(C.MOVE.dailyMinutes, 60); assert.equal(C.MOVE.weeklyMinutes, 300);
  assert.equal(C.CAPS.daily.move, 10320); assert.equal(C.CAPS.weekly.move, 51600);
  assert.deepEqual({ ...C.MOVE.multiplier }, { walk: 1, bike: 1, roadbike: 1, superbike: 0.5, truck: 0.5, bus: 0, taxi: 0 });
  assert.equal(C.MOVE.perMinute * C.MOVE.multiplier.superbike, 86);
  assert.equal(C.MOVE.windowMinNetM, 30); assert.equal(STAT.TELEPORT_M, 50);
  assert.equal(C.WELCOME_FREE_BUM, 20000); assert.equal(C.BETA_FREE_BUM, 10000); assert.equal(C.BETA_WINDOW_DAYS, 30);
  const fares = Object.fromEntries(Object.entries(C.FARES).filter(([, f]) => f.amount).map(([k, f]) => [k, f.amount]));
  assert.deepEqual(fares, { 'bus.city': 1650, 'bus.village': 1550, 'bus.seat': 2650, 'bus.wide': 3200, 'bus.circular': 3450, 'bus.long': 3200, 'subway.base': 1550 });
  assert.deepEqual([2000, 5000, 10000].map((m) => E.taxiFare(m)), [5200, 7400, 11300]);
  assert.deepEqual([2000, 5000, 10000].map((m) => E.taxiFare(m, { night: true })), [6760, 9620, 14690]);
  assert.deepEqual([2000, 5000, 10000].map((m) => E.taxiFare(m, { factor: 1.5 })), [7800, 11100, 16950]);
  assert.equal(E.taxiFare(4600), 7100);
  assert.deepEqual(C.SHOP.map((x) => [x.id, x.price, x.realPrice, x.days]), [['bike', 160000, 320000, 18], ['roadbike', 1000000, 2000000, 113], ['scooter', 2500000, 4999000, 280], ['car', 7450000, 14900000, 836]]);
  assert.deepEqual({ ...C.DISPLAY }, { typicalDailyNet: 8916, avgDailyIncome: 11202, avgDailyTransit: 2286 });
  const q = (x) => [x.id, x.target, x.reward, ...(x.karma || [])];
  assert.deepEqual(C.QUESTS.daily.pool.map(q), [['D-LOGIN', 1, 500, 'streak', 1], ['D-WALK10', 10, 1000, 'health', 10], ['D-WALK20', 20, 1500, 'health', 20], ['D-SUB1', 1, 800, 'transit', 5], ['D-BUS1', 1, 800, 'transit', 5], ['D-RIDE10', 10, 1000, 'health', 10]]);
  assert.deepEqual(q(C.QUESTS.daily.bonus), ['D-ALL3', 3, 1000, 'streak', 2]);
  assert.deepEqual(C.QUESTS.weekly.map(q), [['W-WALK', 120, 6000, 'health', 10], ['W-DAYS', 5, 4000, 'streak', 5], ['W-DAILY', 15, 5000, 'streak', 5], ['W-TRANSIT', 3, 3000, 'transit', 10]]);
  assert.deepEqual(C.QUESTS.monthly.map(q), [['M-WALK', 600, 15000, 'health', 30], ['M-DAYS', 20, 15000, 'streak', 20], ['M-WEEKLY', 10, 10000, 'streak', 10]]);
  assert.equal(C.QUESTS.weekly.reduce((a, x) => a + x.reward, 0), 18000, 'plan weekly max 22,000 − W-PLACES 4,000 (not server-verifiable yet)');
  assert.equal(C.QUESTS.monthly.reduce((a, x) => a + x.reward, 0), 40000, 'plan: monthly max 40,000');
  assert.ok(C.QUESTS.daily.pool.every((x) => x.metric !== 'ride' || x.reward < 1550), 'plan: transit quest reward < fare');
  assert.equal(C.BOARD.reward, 1000); assert.equal(C.BOARD.dailyRewards, 1); assert.equal(C.BOARD.minChars, 40); assert.equal(C.BOARD.accountMinAgeHours, 24);
  assert.equal(C.BOARD.cooldownSec, undefined); assert.equal(C.BOARD.dailyPosts, undefined);
  // 활성 퀘스트 = 기획에 있고 지금 서버가 확인할 수 있는 것만. 판정 수단이 없는 것은 목록에 없음
  const all = [...C.QUESTS.daily.pool, C.QUESTS.daily.bonus, ...C.QUESTS.weekly, ...C.QUESTS.monthly];
  const VERIFIABLE = new Set(['login', 'move_min', 'ride', 'ride_modes', 'login_days', 'daily_claims', 'weekly_claims', 'daily_all']);
  assert.ok(all.every((x) => VERIFIABLE.has(x.metric)), all.filter((x) => !VERIFIABLE.has(x.metric)).map((x) => x.id).join());
  for (const id of ['D-PLACE', 'D-NEIGHBOR', 'D-PHOTO', 'D-TAXI1', 'W-PLACES']) assert.ok(!all.some((x) => x.id === id), id);
  assert.equal(C.QUESTS.daily.slots, 3); assert.deepEqual(C.QUESTS.daily.fixed, ['D-LOGIN']);
  assert.equal(C.MOVE.settleStepMinutes, undefined); assert.equal(C.MOVE.settleGraceMin, 15); assert.equal(C.MOVE.catchUpDays, 7);
  // 탑승 제한(기획에 없음, 어뷰징 방지) — 설정값 + env 로 바꿈
  assert.deepEqual({ ...C.RIDE_LIMITS }, { minGapSec: 30, dailyCounted: 40 });
  assert.deepEqual(C.rideLimits({}), { minGapSec: 30, dailyCounted: 40 });
  assert.deepEqual(C.rideLimits({ RIDE_MIN_GAP_SEC: '10', RIDE_DAILY_COUNTED: '60' }), { minGapSec: 10, dailyCounted: 60 });
  assert.deepEqual(C.rideLimits({ RIDE_MIN_GAP_SEC: 'x', RIDE_DAILY_COUNTED: '0' }), { minGapSec: 30, dailyCounted: 40 }, 'bad values → defaults');
  ok('tuning v4 = plan v1 / Figma 13:2: 172→178 bum/min (2027), 60/300 min, ×0.5 powered, fares, taxi, shop ×0.5, verifiable quest sets & rewards, board 1×1,000/day, ride limits config');

  // 2027-01-01 부터 분당 178 (plan §6 — 새 표 버전 자동 반영)
  const { env } = makeEnv();
  await account(env, 'y27');
  await credit(env, 'y27', '2027-01-04', 'walk', 600);
  await E.settleMove(env.DB, env, 'y27', '2027-01-04', Date.parse('2027-01-05T03:00:00Z')); // 지난 날 → 10분 그대로 1번
  assert.equal(await bal(env, 'y27', Date.parse('2027-01-05T03:00:00Z')), 10 * 178);
  ok('move reward: 2027 days pay 178/min');
}

// ── 게시판 보상 → 보상 이벤트(kind 'board', 토스트). 회수(−)는 이벤트 없음 ──
{
  assert.deepEqual(E.rewardEventOf({ reason: 'board', amount: 1000, ref: '7' }, 5000), { kind: 'board', amount: 1000, karma: null, title: { ko: '동네 글 보상', en: 'Board post reward' }, coins: 8, balanceAfter: 5000 });
  assert.equal(E.rewardEventOf({ reason: 'board', amount: -1000, ref: '7' }, 4000), null);
  assert.equal(E.rewardEventOf({ reason: 'clawback', amount: -1000 }, 4000), null);
  const { env } = makeEnv();
  const acc = await account(env, 'bd');
  const token = await S.signSession({ accountId: 'bd', sessionVersion: 1, now: NOW }, SECRET);
  const st = async (q) => (await (await handleEcon(new Request(`http://localhost:8789/econ/state${q}`, { headers: { Cookie: `bw_s=${token}`, Origin: 'http://localhost:5173' } }), env, new URL(`http://localhost:8789/econ/state${q}`), { now: NOW + 1000 })).json()).data;
  const s0 = await st('');
  const r = await E.rewardBoardPost(env.DB, env, acc, { id: 77, category: 'free', title: 't', body: '정자동 탄천 산책길에 새로 생긴 벤치가 아주 편해요. 저녁에 가 보세요. 노을이 예쁩니다! 다리 밑 오리 가족도 매일 보여요. 주말엔 자전거가 많으니 조심하세요.' }, NOW);
  assert.equal(r.rewarded, true, JSON.stringify(r));
  const s1 = await st(`?since=${s0.lastId}`);
  const evs = s1.events.map((e) => e.reward).filter(Boolean);
  assert.equal(evs.length, 1); assert.equal(evs[0].kind, 'board'); assert.equal(evs[0].amount, 1000); assert.equal(evs[0].balanceAfter, s1.balance.total);
  assert.equal(s1.events[0].entry.kind, 'board');
  await E.clawbackBoardPost(env.DB, 'bd', 77, 'deleted', NOW + 2000);
  const s2 = await (async () => (await (await handleEcon(new Request(`http://localhost:8789/econ/state?since=${s1.lastId}`, { headers: { Cookie: `bw_s=${token}`, Origin: 'http://localhost:5173' } }), env, new URL(`http://localhost:8789/econ/state?since=${s1.lastId}`), { now: NOW + 3000 })).json()).data)();
  assert.equal(s2.events.filter((e) => e.reward).length, 0, 'clawback → no toast');
  assert.equal(s2.events.length, 1); assert.ok(s2.events[0].entry.delta < 0);
  // 같은 날 두 번째 글 → 원장 행도 이벤트도 없음(토스트 없음)
  const r2 = await E.rewardBoardPost(env.DB, env, acc, { id: 78, category: 'free', title: 't2', body: '오늘 두 번째 글입니다. 정자역 앞 붕어빵 가게가 다시 문을 열었어요. 팥이랑 슈크림 둘 다 맛있고 줄이 길지 않아요!' }, NOW + 4000);
  assert.equal(r2.rewarded, false); assert.equal(r2.reason, 'daily_limit');
  const s3 = await (async () => (await (await handleEcon(new Request(`http://localhost:8789/econ/state?since=${s2.lastId}`, { headers: { Cookie: `bw_s=${token}`, Origin: 'http://localhost:5173' } }), env, new URL(`http://localhost:8789/econ/state?since=${s2.lastId}`), { now: NOW + 5000 })).json()).data)();
  assert.equal(s3.events.length, 0, 'second post that day → nothing');
  ok('board reward → reward event kind board (toast) via /econ/state; clawback → ledger line only; 2nd post same day → no event');
}

// ── 이동 보상 → 하루 1번 토스트(kind travel) via /econ/state ──
{
  const { env } = makeEnv({ ECON_FEATURES: 'move' });
  await account(env, 'mv');
  const token = await S.signSession({ accountId: 'mv', sessionVersion: 1, now: NOW }, SECRET);
  const st = async (q, now) => (await (await handleEcon(new Request(`http://localhost:8789/econ/state${q}`, { headers: { Cookie: `bw_s=${token}`, Origin: 'http://localhost:5173' } }), env, new URL(`http://localhost:8789/econ/state${q}`), { now })).json()).data;
  const today = F.kstDate(NOW);
  await give(env, 'mv', 1, 'seed-mv'); // since 커서가 0 이 아니게(웰컴 행 대신)
  let last = (await st('', NOW)).lastId;
  const travelEvents = [];
  for (const [i, min] of [[1, 20], [2, 20], [3, 20], [4, 15]].entries()) {
    await credit(env, 'mv', today, 'walk', min[1] * 60);
    const d = await st(`?since=${last}`, NOW + (i + 1) * 60_000);
    last = d.lastId;
    travelEvents.push(...d.events.map((e) => e.reward).filter((x) => x?.kind === 'travel'));
  }
  assert.equal(travelEvents.length, 1, JSON.stringify(travelEvents));
  assert.equal(travelEvents[0].amount, 10320); assert.deepEqual(travelEvents[0].title, { ko: '이동 보상 60분', en: 'Travel reward 60 min' });
  ok('move reward: 20+20+20+15 min through the day → one travel toast (10,320) when 60 min reached, nothing after');

}

// ── 산 탈것: 재접속 없이 바로 탄다 (Room gifts_sync → holdings) + hello 에도 들어감 ──
{
  const { registerHooks } = await import('node:module');
  registerHooks({
    resolve(spec, ctx, next) {
      if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }', shortCircuit: true };
      return next(spec, ctx);
    },
  });
  const { Room } = await import('../server/phone/src/room.js');
  const { env } = makeEnv();
  await account(env, 'rv');
  const ws = { att: null, sent: [], send(x) { this.sent.push(JSON.parse(x)); }, serializeAttachment(v) { this.att = structuredClone(v); }, deserializeAttachment() { return this.att; } };
  const ctx = { getTags: () => ['a:rv'], getWebSockets: () => [ws], storage: { get: async () => null, put: async () => {} }, waitUntil: () => {} };
  const room = new Room(ctx, env);
  await room.webSocketMessage(ws, JSON.stringify({ t: 'hello', deviceId: 'dev-rv', name: 'rv' }));
  assert.deepEqual(ws.sent.find((m) => m.t === 'welcome').gifts, []);
  // 예전에 이미 받은 탈것(account_vehicles 행)은 그대로 보인다 — 상점은 미리보기라 구매로는 못 만듦
  assert.equal((await E.purchase(env.DB, env, 'rv', 'roadbike', Date.now())).error.reason, 'coming_soon');
  await env.DB.prepare("INSERT INTO account_vehicles (account_id, item_id, gift_id, source, price, listed_price, bound, acquired_at) VALUES ('rv', 'roadbike', 'roadbike-cr1', 'shop', 0, 1000000, 1, ?)").bind(Date.now()).run();
  await room.webSocketMessage(ws, JSON.stringify({ t: 'gifts_sync' }));
  const h = ws.sent.filter((m) => m.t === 'holdings');
  assert.equal(h.length, 1); assert.deepEqual(h[0].gifts, [{ id: 'roadbike-cr1', qty: 1 }]);
  assert.deepEqual(ws.att.gifts, [{ id: 'roadbike-cr1', qty: 1 }]); assert.deepEqual(ws.att.shopGifts, [{ id: 'roadbike-cr1', qty: 1 }]);
  await room.webSocketMessage(ws, JSON.stringify({ t: 'gifts_sync' }));
  assert.equal(ws.sent.filter((m) => m.t === 'holdings').length, 1, 'rate limited (2 s)');
  // 다시 접속해도 보유에 있음(예전엔 { itemId } 모양이라 걸러져 안 보였다)
  const ws2 = { ...ws, att: null, sent: [] };
  await room.webSocketMessage(ws2, JSON.stringify({ t: 'hello', deviceId: 'dev-rv', name: 'rv' }));
  assert.deepEqual(ws2.sent.find((m) => m.t === 'welcome').gifts, [{ id: 'roadbike-cr1', qty: 1 }]);
  // 게스트 연결은 무시
  const ws3 = { ...ws, att: { id: 'p-x', deviceId: 'g' }, sent: [] };
  await room.webSocketMessage(ws3, JSON.stringify({ t: 'gifts_sync' }));
  assert.equal(ws3.sent.length, 0);
  ok('shop vehicle rideable without reconnect: gifts_sync → holdings from D1 (not client), rate-limited, also in hello; guests ignored');
}

console.log(`\neconomy: ${n} checks passed`);
