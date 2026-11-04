// node scripts/test-accounts.mjs — [accounts] 구글 로그인·세션·기기 연결/이전·원장 오프라인 테스트 (네트워크·Cloudflare 불필요)
//   구글 JWKS 는 여기서 만든 RSA 키로 흉내 내고, D1·DO SQLite 는 node:sqlite, R2 는 Map 으로 대신한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,' + encodeURIComponent('export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }'), shortCircuit: true };
  return next(spec, ctx);
}`));

const G = await import('../server/phone/src/account/google.js');
const S = await import('../server/phone/src/account/session.js');
const L = await import('../server/phone/src/account/ledger.js');
const ST = await import('../server/phone/src/account/store.js');
const STAT = await import('../server/phone/src/account/stats.js');
const { handleAuth } = await import('../server/phone/src/account/routes.js');
const { default: worker, PhoneBook } = await import('../server/phone/src/index.js');
const { ensurePhotoTables } = await import('../server/phone/src/photos.js');

let n = 0;
const ok = (m) => console.log('  ok', ++n, m);
const CLIENT_ID = '1011905802733-qpjjglquapnuacrq5v7tqordlotpdso3.apps.googleusercontent.com';
const SECRET = 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
const NOW = Date.parse('2026-11-04T07:00:00Z');

// ── 가짜 D1 (node:sqlite) ──
function d1Of(db) {
  const isReader = (q) => /^\s*(SELECT|WITH|PRAGMA)/i.test(q) || /\bRETURNING\b/i.test(q);
  const exec1 = (q, params) => {
    const st = db.prepare(q);
    if (isReader(q)) { const rows = st.all(...params); return { results: rows, meta: { changes: /RETURNING/i.test(q) ? rows.length : 0 } }; }
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const make = (q, params = []) => ({
    _q: q, _p: params,
    bind: (...p) => make(q, p),
    async first() { const r = exec1(q, params); return r.results[0] ?? null; },
    async all() { return exec1(q, params); },
    async run() { return exec1(q, params); },
  });
  return {
    prepare: (q) => make(q),
    async batch(stmts) {
      db.exec('BEGIN');
      try { const out = stmts.map((s) => exec1(s._q, s._p)); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
function sqlOf(db) {
  return {
    exec(query, ...params) {
      const st = db.prepare(query);
      const reader = /^\s*(SELECT|WITH|PRAGMA)/i.test(query) || /\bRETURNING\b/i.test(query);
      if (reader) { const rows = st.all(...params); return { toArray: () => rows, one: () => rows[0] }; }
      if (!params.length && query.split(';').filter((q) => q.trim()).length > 1) { db.exec(query); return { toArray: () => [] }; }
      st.run(...params);
      return { toArray: () => [] };
    },
  };
}
const MIGRATION = readFileSync(new URL('../server/phone/migrations/0001_accounts.sql', import.meta.url), 'utf8');
function makeEnv(vars = {}) {
  const d1raw = new DatabaseSync(':memory:');
  d1raw.exec(MIGRATION);
  const dodb = new DatabaseSync(':memory:');
  const ctx = {
    storage: {
      sql: sqlOf(dodb),
      transactionSync(fn) { dodb.exec('BEGIN'); try { const r = fn(); dodb.exec('COMMIT'); return r; } catch (e) { dodb.exec('ROLLBACK'); throw e; } },
    },
    blockConcurrencyWhile: (fn) => fn(),
  };
  const env = {
    DB: d1Of(d1raw),
    SESSION_SECRET: SECRET,
    GOOGLE_CLIENT_ID: CLIENT_ID,
    ACCOUNTS_ENABLED: '1',
    ACCOUNT_MIGRATE: 'on',
    ECONOMY_ENABLED: '0',
    ECONOMY_OPEN_AT: '',
    STATS_ENABLED: '1',
    ...vars,
  };
  const book = new PhoneBook(ctx, env);
  ensurePhotoTables(ctx.storage.sql);
  env.PHONE_BOOK = { getByName: () => book };
  env.ROOM = { getByName: () => ({ fetch: async () => new Response('{}') }) };
  const objects = new Map();
  env.PHOTOS = {
    async put(key, value) { objects.set(key, new Uint8Array(value)); },
    async get(key) { const b = objects.get(key); return b ? { body: b, size: b.byteLength } : null; },
    async delete(key) { objects.delete(key); },
  };
  return { env, book, d1raw, dodb, objects };
}

// ── 가짜 구글 ──
const kp = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const other = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
const enc = (o) => G.bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
async function idToken(claims = {}, { kid = 'k1', alg = 'RS256', key = kp.privateKey } = {}) {
  const now = Math.floor(NOW / 1000);
  const body = `${enc({ alg, kid, typ: 'JWT' })}.${enc({
    iss: 'https://accounts.google.com', aud: CLIENT_ID, azp: CLIENT_ID, sub: '1000001', email: 'a@example.com',
    email_verified: true, name: '테스트', iat: now - 10, exp: now + 3600, ...claims,
  })}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body)));
  return `${body}.${G.bytesToB64url(sig)}`;
}
function mockJwks({ fail = false } = {}) {
  const calls = [];
  const cache = G.createJwksCache({
    fetch: async (url) => {
      calls.push(url);
      if (fail) return new Response('no', { status: 503 });
      return new Response(JSON.stringify({ keys: [{ ...pubJwk, kid: 'k1', alg: 'RS256', use: 'sig' }] }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=20000' },
      });
    },
  });
  return { cache, calls };
}

// ════════ 1. 구글 ID 토큰 검증 ════════
{
  const { cache, calls } = mockJwks();
  const v = (t, o = {}) => G.verifyGoogleIdToken(t, { clientId: CLIENT_ID, jwks: cache, now: NOW, ...o });
  let r = await v(await idToken());
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.claims.sub, '1000001');
  ok('valid RS256 token verifies against JWKS');
  r = await v(await idToken({ iss: 'accounts.google.com' }));
  assert.equal(r.ok, true); ok('iss without https:// is accepted');
  assert.equal((await v(await idToken({ iss: 'https://evil.example' }))).error, 'bad_iss'); ok('wrong iss → bad_iss');
  assert.equal((await v(await idToken({ aud: 'someone-else.apps.googleusercontent.com' }))).error, 'bad_aud'); ok('wrong aud → bad_aud');
  assert.equal((await v(await idToken({ exp: Math.floor(NOW / 1000) - 120 }))).error, 'expired'); ok('expired → expired');
  assert.equal((await v(await idToken({ exp: Math.floor(NOW / 1000) - 30 }))).ok, true); ok('60 s clock skew allowed');
  assert.equal((await v(await idToken({ email_verified: false }))).error, 'email_unverified'); ok('email_verified=false → rejected');
  assert.equal((await v(await idToken({ email_verified: 'true' }))).ok, true); ok('email_verified="true" string accepted');
  assert.equal((await v(await idToken({}, { key: other.privateKey }))).error, 'bad_signature'); ok('signed by another key → bad_signature');
  {
    const t = await idToken();
    const [h, , s] = t.split('.');
    const forged = `${h}.${enc({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'attacker', exp: Math.floor(NOW / 1000) + 3600 })}.${s}`;
    assert.equal((await v(forged)).error, 'bad_signature'); ok('tampered payload → bad_signature');
  }
  assert.equal((await v(await idToken({}, { alg: 'HS256' }))).error, 'bad_alg'); ok('alg HS256 → bad_alg');
  assert.equal((await v(await idToken({}, { alg: 'none' }))).error, 'bad_alg'); ok('alg none → bad_alg');
  const before = calls.length;
  assert.equal((await v(await idToken({}, { kid: 'k-unknown' }))).error, 'unknown_kid');
  assert.equal((await v(await idToken({}, { kid: 'k-unknown2' }))).error, 'unknown_kid');
  assert.ok(calls.length - before <= 1, 'unknown kid refetch is rate-limited');
  ok('unknown kid → unknown_kid, refetch at most once per minute');
  assert.equal(calls.length <= 2, true); ok(`JWKS cached (fetched ${calls.length}× for ${n} checks)`);
  assert.equal((await v(await idToken({ sub: '' }))).error, 'no_sub'); ok('missing sub → no_sub');
  assert.equal((await v('a.b')).error, 'bad_token'); ok('malformed → bad_token');
  assert.equal((await G.verifyGoogleIdToken(await idToken(), { clientId: '', jwks: cache, now: NOW })).error, 'no_client_id'); ok('no client id configured → no_client_id');
  const down = mockJwks({ fail: true });
  assert.equal((await G.verifyGoogleIdToken(await idToken(), { clientId: CLIENT_ID, jwks: down.cache, now: NOW })).error, 'jwks_unavailable'); ok('JWKS down → jwks_unavailable');
}

// ════════ 2. 세션 쿠키 ════════
{
  const tok = await S.signSession({ accountId: 'acc-1', sessionVersion: 3, now: NOW }, SECRET);
  const s = await S.verifySession(tok, SECRET, NOW + 1000);
  assert.deepEqual([s.accountId, s.sessionVersion], ['acc-1', 3]); ok('session sign → verify');
  assert.equal(await S.verifySession(tok, SECRET + 'x', NOW), null); ok('wrong secret → null');
  const [v1, p, mac] = tok.split('.');
  const evil = G.bytesToB64url(new TextEncoder().encode(JSON.stringify({ a: 'acc-2', sv: 3, iat: Math.floor(NOW / 1000), exp: Math.floor(NOW / 1000) + 999 })));
  assert.equal(await S.verifySession(`${v1}.${evil}.${mac}`, SECRET, NOW), null); ok('tampered payload → null');
  assert.equal(await S.verifySession(`${v1}.${p}.${mac.slice(0, -2)}AA`, SECRET, NOW), null); ok('tampered mac → null');
  assert.equal(await S.verifySession(tok, SECRET, NOW + 31 * 86400_000), null); ok('expires after 30 days');
  await assert.rejects(() => S.signSession({ accountId: 'x' }, 'short'), /session_secret_missing/); ok('short SESSION_SECRET refused');
  const c = S.sessionCookie(tok, {});
  for (const part of ['bw_s=', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', `Max-Age=${30 * 86400}`]) assert.ok(c.includes(part), part);
  ok('cookie is HttpOnly; Secure; SameSite=Lax; 30 days');
  assert.ok(S.clearSessionCookie({}).includes('Max-Age=0')); ok('logout cookie clears');
  const req = new Request('https://x/', { headers: { Cookie: `foo=1; bw_s=${tok}; bar=2` } });
  assert.equal(S.readCookie(req), tok); ok('cookie parsed from header');
}

// ════════ 3. 원장 멱등 ════════
{
  const { env, d1raw } = makeEnv();
  const db = env.DB;
  await db.prepare("INSERT INTO accounts (id, google_sub, created_at, first_login_at, last_login_at) VALUES ('A', 's', 0, 0, 0)").run();
  const e = { accountId: 'A', amount: 20000, kind: 'free', reason: 'welcome', idempotencyKey: 'welcome:A' };
  let r = await L.appendLedger(db, e, { now: NOW });
  assert.equal(r.applied, true); assert.equal(r.balance.free, 20000);
  r = await L.appendLedger(db, e, { now: NOW + 1 });
  assert.equal(r.applied, false); assert.equal(r.balance.total, 20000);
  ok('same idempotency key twice → one row, balance 20,000');
  await Promise.all([1, 2, 3].map(() => L.appendLedger(db, { ...e, idempotencyKey: 'race:A', amount: 5 }, { now: NOW })));
  assert.equal(d1raw.prepare("SELECT COUNT(*) AS c FROM ledger WHERE idempotency_key = 'race:A'").get().c, 1); ok('concurrent same key → one row');
  await L.appendLedger(db, { accountId: 'A', amount: -300, kind: 'free', reason: 'fare', idempotencyKey: 'fare:1' }, { now: NOW });
  await L.appendLedger(db, { accountId: 'A', amount: 1000, kind: 'paid', reason: 'topup', idempotencyKey: 'pay:1' }, { now: NOW });
  const bal = await L.getBalance(db, 'A'); const sum = await L.ledgerSum(db, 'A');
  assert.deepEqual([bal.free, bal.paid], [sum.free, sum.paid]); assert.deepEqual([bal.free, bal.paid, bal.total], [19705, 1000, 20705]);
  ok('cached balance == SUM(ledger), paid/free kept apart');
  await assert.rejects(() => L.appendLedger(db, { ...e, amount: 1.5, idempotencyKey: 'f' }), /bad_amount/);
  await assert.rejects(() => L.appendLedger(db, { ...e, kind: 'gift', idempotencyKey: 'g' }), /bad_kind/);
  await assert.rejects(() => L.appendLedger(db, { ...e, idempotencyKey: '' }), /bad_idempotency_key/);
  ok('non-integer amount / unknown kind / missing key refused');
  assert.equal(d1raw.prepare("SELECT price_table_version AS v FROM ledger WHERE idempotency_key='welcome:A'").get().v, 1); ok('row carries price_table_version');
}

// ════════ 4. 로그인·연결·이전 (라우트 전체) ════════
const LOOK = { gender: 'f', face: 'round', hair: 'medium', top: 'hoodie', color: '#1f5fbf', skin: '#f2d0b0', pants: '#2b3040' };
async function join(env, id, name) {
  const r = await worker.fetch(new Request('https://phone.test/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name, look: LOOK }) }), env);
  assert.equal(r.status, 200);
  return id;
}
function giveGift(dodb, userId, item, qty) {
  dodb.prepare('INSERT INTO gift_holdings (user_id, item_key, qty, updated_at) VALUES (?, ?, ?, 0) ON CONFLICT(user_id, item_key) DO UPDATE SET qty = excluded.qty').run(userId, item, qty);
}
function addPhoto(dodb, owner, id, sha, created) {
  dodb.prepare(`INSERT INTO photos (owner, id, r2_key, type, size, sha256, taken_at, created_at, updated_at) VALUES (?, ?, ?, 'image/jpeg', 10, ?, ?, ?, ?)`)
    .run(owner, id, `k/${owner}/${id}`, sha, created, created, created);
}
const qty = (dodb, u, item) => Number(dodb.prepare('SELECT qty FROM gift_holdings WHERE user_id = ? AND item_key = ?').get(u, item)?.qty || 0);
const ORIGIN = 'https://bumpinto.world';
function makeAuth(env, jwks) {
  let cookie = '';
  async function call(method, path, body, { now = NOW, origin = ORIGIN, jar = true } = {}) {
    const headers = { Origin: origin };
    if (body) headers['Content-Type'] = 'application/json';
    if (jar && cookie) headers.Cookie = cookie;
    const req = new Request('https://api.test' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const res = await handleAuth(req, env, new URL(req.url), { jwks, now });
    const set = res.headers.get('Set-Cookie');
    if (set && jar) { const v = /bw_s=([^;]*)/.exec(set)?.[1] || ''; cookie = v ? `bw_s=${v}` : ''; }
    return { status: res.status, headers: res.headers, json: await res.json().catch(() => null) };
  }
  return { call, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}
{
  const { cache } = mockJwks();
  // 꺼져 있으면 아무것도 안 함
  {
    const { env } = makeEnv({ ACCOUNTS_ENABLED: '0' });
    const a = makeAuth(env, cache);
    const c = await a.call('GET', '/auth/config');
    assert.equal(c.json.enabled, false); assert.equal(c.json.clientId, '');
    const g = await a.call('POST', '/auth/google', { credential: await idToken(), deviceId: crypto.randomUUID() });
    assert.equal(g.status, 404); assert.equal(g.json.error, 'accounts_disabled');
    ok('ACCOUNTS_ENABLED=0 → config.enabled=false, /auth/google 404');
    const w = await worker.fetch(new Request('https://phone.test/auth/config', { headers: { Origin: ORIGIN } }), env);
    assert.equal(w.status, 200); ok('index.js routes /auth/* to handleAuth');
  }
  const { env, dodb, d1raw, objects } = makeEnv();
  const a = makeAuth(env, cache);
  const cfg = await a.call('GET', '/auth/config');
  assert.equal(cfg.json.enabled, true); assert.equal(cfg.json.clientId, CLIENT_ID); assert.equal(cfg.json.economy, false);
  assert.equal(cfg.headers.get('Access-Control-Allow-Origin'), ORIGIN); assert.equal(cfg.headers.get('Access-Control-Allow-Credentials'), 'true');
  ok('config exposes the new client id; credentialed CORS for bumpinto.world');
  const bad = await a.call('GET', '/auth/config', null, { origin: 'https://evil.example' });
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null); ok('unknown origin gets no CORS grant');
  const evil = await a.call('POST', '/auth/google', { credential: await idToken(), deviceId: crypto.randomUUID() }, { origin: 'https://evil.example', jar: false });
  assert.equal(evil.status, 403); ok('POST from unknown origin → 403');

  // PC1: 선물 2개 + 사진 2장
  const pc1 = await join(env, crypto.randomUUID(), 'PC1');
  giveGift(dodb, pc1, 'roadbike-cr1', 2);
  addPhoto(dodb, pc1, 'p1', 'sha-a', NOW - 5000);
  addPhoto(dodb, pc1, 'p2', 'sha-b', NOW - 4000);
  let r = await a.call('POST', '/auth/google', { credential: await idToken(), deviceId: pc1 });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.created, true); assert.equal(r.json.link.status, 'linked'); assert.equal(r.json.primaryUserId, pc1);
  assert.ok(a.cookie.startsWith('bw_s=v1.')); assert.equal(r.json.balance, undefined);
  ok('first login: account created, PC1 linked and becomes primary, cookie set, no grant (economy off)');
  const accId = r.json.account.id;
  const stored = d1raw.prepare('SELECT * FROM accounts WHERE id = ?').get(accId);
  assert.equal(stored.google_sub, '1000001'); assert.ok(!JSON.stringify(stored).includes('eyJ')); ok('google token not stored, only sub/email/name');
  r = await a.call('GET', '/auth/me?deviceId=' + pc1);
  assert.equal(r.status, 200); assert.equal(r.json.devices.length, 1); assert.equal(r.json.devices[0].current, true);
  assert.ok(!JSON.stringify(r.json.devices).includes(pc1.slice(8, 24))); assert.equal(r.json.stats.loginDays, 1);
  ok('/auth/me: account, masked devices, login day logged');

  // PC2: 같은 구글 계정, 선물 1 + 사진 1(같은 사진 sha-a, 더 예전) + 다른 사진
  const pc2 = await join(env, crypto.randomUUID(), 'PC2');
  giveGift(dodb, pc2, 'roadbike-cr1', 1);
  giveGift(dodb, pc2, 'superbike-rr', 1);
  addPhoto(dodb, pc2, 'q1', 'sha-a', NOW - 9000);
  addPhoto(dodb, pc2, 'q2', 'sha-c', NOW - 3000);
  objects.set(`k/${pc1}/p1`, new Uint8Array(1));
  const b = makeAuth(env, cache);
  r = await b.call('POST', '/auth/google', { credential: await idToken(), deviceId: pc2 });
  assert.equal(r.json.created, false); assert.equal(r.json.link.status, 'linked'); assert.equal(r.json.primaryUserId, pc1);
  assert.equal(qty(dodb, pc1, 'roadbike-cr1'), 3); assert.equal(qty(dodb, pc1, 'superbike-rr'), 1); assert.equal(qty(dodb, pc2, 'roadbike-cr1'), 0);
  ok('second PC merges: gifts summed into primary (2+1 road bikes, 1 superbike)');
  const photos1 = dodb.prepare('SELECT id, sha256 FROM photos WHERE owner = ? ORDER BY id').all(pc1).map((p) => p.id);
  assert.deepEqual(photos1, ['p2', 'q1', 'q2']); assert.equal(dodb.prepare('SELECT COUNT(*) AS c FROM photos WHERE owner = ?').get(pc2).c, 0);
  assert.equal(objects.has(`k/${pc1}/p1`), false);
  ok('photos move to primary; duplicate sha keeps the older copy and deletes the orphan R2 object');
  const u2 = dodb.prepare('SELECT phone FROM users WHERE id = ?').get(pc2);
  assert.ok(u2.phone); ok('PC2 phone number stays on its row (recovery), not moved');
  const log = d1raw.prepare("SELECT item, qty FROM migrations_log WHERE device_id = ? AND mode = 'on' ORDER BY id").all(pc2).map((x) => `${x.item}:${x.qty}`);
  assert.ok(log.includes('gift:roadbike-cr1:1') && log.includes('photos:1') && log.includes('photos_dedup:1')); ok('migrations_log records what moved');

  // 다시 로그인해도 두 번 옮기지 않음
  giveGift(dodb, pc2, 'roadbike-cr1', 5); // 이전 뒤 PC2 행에 새로 생긴 것 — 다시 합치지 않아야
  r = await b.call('POST', '/auth/google', { credential: await idToken(), deviceId: pc2 });
  assert.equal(r.json.link.status, 'already_linked'); assert.equal(qty(dodb, pc1, 'roadbike-cr1'), 3);
  ok('re-login: already_linked, merge not repeated (idempotent)');
  r = await b.call('POST', '/auth/google', { credential: await idToken(), deviceId: pc1 });
  assert.equal(r.json.link.status, 'already_linked'); ok('adopted PC (uses primary id) → already_linked');

  // 다른 구글 계정이 PC2 로 로그인 → 이전 안 함
  const c = makeAuth(env, cache);
  r = await c.call('POST', '/auth/google', { credential: await idToken({ sub: '2000002', email: 'b@example.com' }), deviceId: pc2 });
  assert.equal(r.status, 200); assert.equal(r.json.link.status, 'linked_to_other_account'); assert.equal(r.json.primaryUserId, null);
  assert.equal(qty(dodb, pc2, 'roadbike-cr1'), 5); assert.equal(qty(dodb, pc1, 'roadbike-cr1'), 3);
  ok('device linked to another account → linked_to_other_account, nothing merged');

  // 기기 한도 5대
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push(crypto.randomUUID());
  for (const id of ids.slice(0, 3)) r = await a.call('POST', '/auth/link', { deviceId: id });
  assert.equal(r.json.link.status, 'linked');
  r = await a.call('POST', '/auth/link', { deviceId: ids[3] });
  assert.equal(r.json.link.status, 'device_limit'); ok('6th device → device_limit (max 5)');
  r = await a.call('POST', '/auth/link', { deviceId: 'not-a-uuid' });
  assert.equal(r.json.link.status, 'no_device'); ok('bad device id → no_device');
  const st = d1raw.prepare('SELECT merge_status AS s FROM account_devices WHERE device_id = ?').get(ids[0]).s;
  assert.equal(st, 'none'); ok('linked guest device with no character → merge_status none');

  // 로그아웃·전체 로그아웃
  const keep = a.cookie;
  r = await a.call('POST', '/auth/logout', {});
  assert.equal(r.status, 200); assert.equal(a.cookie, '');
  a.cookie = keep;
  r = await a.call('GET', '/auth/me');
  assert.equal(r.status, 200); ok('logout clears cookie (old cookie still valid until all:true)');
  r = await a.call('POST', '/auth/logout', { all: true });
  a.cookie = keep;
  r = await a.call('GET', '/auth/me');
  assert.equal(r.status, 401); ok('logout all → session_version bump invalidates every cookie');
  const form = await a.call('POST', '/auth/link', null);
  assert.equal(form.status, 401); // 로그인 안 됨이 먼저
  {
    const req = new Request('https://api.test/auth/google', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' }, body: '{}' });
    const res = await handleAuth(req, env, new URL(req.url), { jwks: cache, now: NOW });
    assert.equal(res.status, 400); ok('non-JSON content type refused (simple-request CSRF)');
  }
  r = await c.call('POST', '/auth/google', { credential: await idToken({ aud: 'x.apps.googleusercontent.com' }), deviceId: pc2 });
  assert.equal(r.status, 401); assert.equal(r.json.error, 'bad_aud'); ok('/auth/google with wrong aud → 401');
}

// dry 모드: 쓰기 없이 기록만
{
  const { cache } = mockJwks();
  const { env, dodb, d1raw } = makeEnv({ ACCOUNT_MIGRATE: 'dry' });
  const a = makeAuth(env, cache);
  const pc1 = await join(env, crypto.randomUUID(), 'D1');
  const pc2 = await join(env, crypto.randomUUID(), 'D2');
  giveGift(dodb, pc2, 'superbike-rr', 1);
  await a.call('POST', '/auth/google', { credential: await idToken(), deviceId: pc1 });
  const r = await a.call('POST', '/auth/link', { deviceId: pc2 });
  assert.equal(r.json.migrate.mode, 'dry'); assert.equal(qty(dodb, pc2, 'superbike-rr'), 1); assert.equal(qty(dodb, pc1, 'superbike-rr'), 0);
  assert.equal(d1raw.prepare("SELECT COUNT(*) AS c FROM migrations_log WHERE mode = 'dry'").get().c > 0, true);
  ok('ACCOUNT_MIGRATE=dry: plan logged, nothing moved');
  env.ACCOUNT_MIGRATE = 'on';
  await a.call('POST', '/auth/link', { deviceId: pc2 });
  assert.equal(qty(dodb, pc1, 'superbike-rr'), 1); ok('switching dry → on later performs the merge');
}

// 웰컴·베타 지급
{
  const { cache } = mockJwks();
  const openAt = '2026-11-01T00:00:00+09:00';
  const { env, dodb } = makeEnv({ ECONOMY_ENABLED: '1', ECONOMY_OPEN_AT: openAt });
  const a = makeAuth(env, cache);
  const pc = await join(env, crypto.randomUUID(), 'Beta');
  dodb.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(Date.parse('2026-10-01T00:00:00Z'), pc);
  let r = await a.call('POST', '/auth/google', { credential: await idToken({ sub: 'beta-1' }), deviceId: pc });
  assert.equal(r.json.balance.free, 30000); assert.deepEqual(r.json.granted.map((g) => g.reason).sort(), ['beta', 'welcome']);
  ok('economy on: welcome 20,000 + beta 10,000 for a pre-open device');
  r = await a.call('POST', '/auth/google', { credential: await idToken({ sub: 'beta-1' }), deviceId: pc });
  assert.equal(r.json.balance.free, 30000); assert.equal(r.json.granted.length, 0);
  r = await a.call('GET', '/auth/me');
  assert.equal(r.json.balance.total, 30000); ok('grants idempotent across logins and /auth/me');
  const late = makeAuth(env, cache);
  const lateNow = Date.parse(openAt) + 31 * 86400_000;
  const lateSec = Math.floor(lateNow / 1000);
  r = await late.call('POST', '/auth/google', { credential: await idToken({ sub: 'late-1', iat: lateSec - 5, exp: lateSec + 3600 }), deviceId: crypto.randomUUID() }, { now: lateNow });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.balance.free, 20000); ok('new account after the 30-day window: welcome only');
  const env2 = makeEnv({ ECONOMY_ENABLED: '1', ECONOMY_OPEN_AT: '' });
  const z = makeAuth(env2.env, cache);
  const pcz = await join(env2.env, crypto.randomUUID(), 'NoOpen');
  r = await z.call('POST', '/auth/google', { credential: await idToken({ sub: 'z' }), deviceId: pcz });
  assert.equal(r.json.balance.free, 20000); ok('ECONOMY_OPEN_AT empty → no beta grant');
}

// ════════ 5. 칭호용 이동 기록 ════════
{
  const ms = new STAT.MoveStats();
  let t = NOW;
  ms.push({ x: 0, z: 0, mode: 'walk', now: t });
  for (let i = 1; i <= 10; i++) ms.push({ x: i * 4, z: 0, mode: 'walk', now: (t += 1000) }); // 4 m/s
  ms.push({ x: 1000, z: 0, mode: 'walk', now: (t += 1000) }); // 순간이동
  ms.push({ x: 1004, z: 0, mode: 'walk', now: (t += 1000) });
  ms.push({ x: 1004, z: 100, mode: 'walk', now: (t += 10_000) }); // 공백
  const rows = ms.drain();
  assert.equal(rows.length, 1); assert.equal(rows[0].mode, 'walk'); assert.equal(rows[0].m, 44); assert.equal(ms.dropped.teleport, 1); assert.equal(ms.dropped.gap, 1);
  ok('movement: 4 m/s walk counted, teleport and gaps dropped');
  const fast = new STAT.MoveStats();
  fast.push({ x: 0, z: 0, mode: 'walk', now: NOW });
  fast.push({ x: 7, z: 0, mode: 'walk', now: NOW + 1000 });
  assert.equal(Math.floor(fast.drain()[0].m), 4); ok('over speed cap → clamped to 4.62 m/s');
  assert.equal(STAT.classifyMode({ sit: 'bus:12' }), 'bus');
  assert.equal(STAT.classifyMode({ sit: 'taxi:1' }), 'taxi');
  assert.equal(STAT.classifyMode({ veh: 900 }), null);
  assert.equal(STAT.classifyMode({ veh: 902 }, (v) => (v === 902 ? 'roadbike' : null)), 'roadbike');
  assert.equal(STAT.classifyMode({ veh: 5 }), 'truck');
  assert.equal(STAT.classifyMode({ riding: true }), 'bike');
  assert.equal(STAT.classifyMode({ zone: 'jeongja-station' }), null);
  assert.equal(STAT.classifyMode({ afk: true }), null);
  assert.equal(STAT.classifyMode({ sit: 'bench' }), null);
  ok('mode classification (bus/taxi/admin bike/gift bike/truck/bike/subway/afk/sit)');
  const { env, d1raw } = makeEnv();
  await STAT.flushMoves(env.DB, 'A', rows, NOW);
  await STAT.flushMoves(env.DB, 'A', rows, NOW);
  assert.equal(d1raw.prepare("SELECT distance_m AS m FROM stat_mode_totals WHERE account_id='A' AND mode='walk'").get().m, 88);
  assert.equal(d1raw.prepare("SELECT COUNT(*) AS c FROM stat_mode_daily WHERE account_id='A'").get().c, 1);
  await STAT.logPhoto(env.DB, 'A', { id: 'p1', region: 'jeongja', x: 1.4, z: 2.6 }, NOW);
  await STAT.logPhoto(env.DB, 'A', { id: 'p1', region: 'jeongja', x: 1.4, z: 2.6 }, NOW);
  const ph = d1raw.prepare("SELECT * FROM photo_point_log WHERE account_id='A'").all();
  assert.equal(ph.length, 1); assert.equal(ph[0].point_id, null);
  ok('totals + daily upserts accumulate; photo log once per photo, point_id left NULL');
}

console.log(`\naccounts: ${n} checks passed`);
