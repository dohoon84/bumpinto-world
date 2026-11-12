// node scripts/test-account-consent.mjs — 약관·수신동의 API 규칙
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
const { handleAuth } = await import('../server/phone/src/account/routes.js');
const C = await import('../server/phone/src/account/consent.js');
const { forgetConsentSchema } = C;

let n = 0;
const ok = (m) => console.log('  ok', ++n, m);
const CLIENT_ID = '1011905802733-qpjjglquapnuacrq5v7tqordlotpdso3.apps.googleusercontent.com';
const SECRET = 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
const NOW = Date.parse('2026-11-13T00:00:00+09:00');
const ORIGIN = 'https://bumpinto.world';
const CONSENT = { termsVersion: C.TERMS_VERSION, privacyVersion: C.PRIVACY_VERSION };
const M1 = readFileSync(new URL('../server/phone/migrations/0001_accounts.sql', import.meta.url), 'utf8');
const M7 = readFileSync(new URL('../server/phone/migrations/0007_account_consent.sql', import.meta.url), 'utf8');

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
      if (!stmts.length) throw new Error('D1_ERROR: No SQL statements detected.');
      db.exec('BEGIN');
      try { const out = stmts.map((s) => exec1(s._q, s._p)); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

function makeEnv({ migrateConsent = true, vars = {} } = {}) {
  const d1raw = new DatabaseSync(':memory:');
  d1raw.exec(M1);
  if (migrateConsent) d1raw.exec(M7);
  const env = {
    DB: d1Of(d1raw),
    SESSION_SECRET: SECRET,
    GOOGLE_CLIENT_ID: CLIENT_ID,
    ACCOUNTS_ENABLED: '1',
    ACCOUNT_MIGRATE: 'off',
    ECONOMY_ENABLED: '0',
    STATS_ENABLED: '0',
    DEV_LOGIN: '1',
    ...vars,
  };
  forgetConsentSchema(env.DB);
  return { env, d1raw };
}

const kp = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
const enc = (o) => G.bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
async function idToken(claims = {}) {
  const now = Math.floor(NOW / 1000);
  const body = `${enc({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${enc({
    iss: 'https://accounts.google.com', aud: CLIENT_ID, azp: CLIENT_ID, sub: '1000001', email: 'a@example.com',
    email_verified: true, name: '테스트', iat: now - 10, exp: now + 3600, ...claims,
  })}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(body)));
  return `${body}.${G.bytesToB64url(sig)}`;
}
function mockJwks() {
  return G.createJwksCache({
    fetch: async () => new Response(JSON.stringify({ keys: [{ ...pubJwk, kid: 'k1', alg: 'RS256', use: 'sig' }] }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=20000' },
    }),
  });
}
function makeAuth(env, jwks) {
  let cookie = '';
  async function call(method, path, body, { now = NOW, origin = ORIGIN } = {}) {
    const headers = { Origin: origin };
    if (body) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const req = new Request('https://api.test' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const res = await handleAuth(req, env, new URL(req.url), { jwks, now });
    const set = res.headers.get('Set-Cookie');
    if (set) { const v = /bw_s=([^;]*)/.exec(set)?.[1] || ''; cookie = v ? `bw_s=${v}` : ''; }
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  return { call, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}

const cache = mockJwks();

// ── /auth/config ──
{
  const { env } = makeEnv();
  const a = makeAuth(env, cache);
  const r = await a.call('GET', '/auth/config');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.consent, {
    termsVersion: '2026-11-13',
    privacyVersion: '2026-11-13',
    termsUrl: '/terms.html',
    privacyUrl: '/privacy.html',
  });
  ok('GET /auth/config includes consent versions and URLs');
}

// ── 신규 계정은 약관 필수, INSERT 없음 ──
{
  const { env, d1raw } = makeEnv();
  const a = makeAuth(env, cache);
  let r = await a.call('POST', '/auth/google', { credential: await idToken(), deviceId: crypto.randomUUID() });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'consent_required');
  assert.equal(d1raw.prepare('SELECT COUNT(*) AS c FROM accounts').get().c, 0);
  ok('new google account without terms → 400 consent_required, no INSERT');

  r = await a.call('POST', '/auth/google', { credential: await idToken(), deviceId: crypto.randomUUID(), termsVersion: 'old', privacyVersion: C.PRIVACY_VERSION });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'consent_required');
  assert.equal(d1raw.prepare('SELECT COUNT(*) AS c FROM accounts').get().c, 0);
  ok('stale termsVersion → 400, no INSERT');

  {
    const body = { sub: 'local', name: '개발', deviceId: crypto.randomUUID() };
    const req = new Request('http://127.0.0.1/auth/dev', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await handleAuth(req, env, new URL(req.url), { jwks: cache, now: NOW });
    const json = await res.json();
    assert.equal(res.status, 400, JSON.stringify(json));
    assert.equal(json.error, 'consent_required');
    assert.equal(d1raw.prepare('SELECT COUNT(*) AS c FROM accounts').get().c, 0);
    ok('new /auth/dev without terms → 400 consent_required');
  }
}

// ── 동의하고 가입, 마케팅 on, 로그 기록 ──
{
  const { env, d1raw } = makeEnv();
  const a = makeAuth(env, cache);
  const r = await a.call('POST', '/auth/google', {
    credential: await idToken(), deviceId: crypto.randomUUID(), ...CONSENT, marketingOptIn: true,
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.created, true);
  assert.equal(r.json.marketing, 'on');
  assert.equal(r.json.consent.needsTerms, false);
  assert.equal(r.json.consent.marketingOptIn, true);
  assert.equal(r.json.consent.hasEmail, true);
  assert.equal(r.json.consent.termsVersion, C.TERMS_VERSION);
  const row = d1raw.prepare('SELECT * FROM accounts').get();
  assert.equal(row.terms_version, C.TERMS_VERSION);
  assert.equal(row.privacy_version, C.PRIVACY_VERSION);
  assert.equal(row.marketing_opt_in, 1);
  assert.ok(row.terms_agreed_at);
  const log = d1raw.prepare("SELECT kind, action FROM consent_log ORDER BY id").all();
  assert.deepEqual(log.map((x) => `${x.kind}:${x.action}`), ['terms:agree', 'privacy:agree', 'marketing:agree']);
  ok('signup with consent stores versions, marketing on, consent_log rows');

  const me = await a.call('GET', '/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.json.consent.needsTerms, false);
  assert.equal(me.json.consent.marketingOptIn, true);
  assert.equal(me.json.consent.hasEmail, true);
  ok('GET /auth/me returns consent block');
}

// ── 이메일 없이 마케팅 on → marketing_opt_in=0, marketing: no_email ──
{
  const { env, d1raw } = makeEnv();
  const a = makeAuth(env, cache);
  const r = await a.call('POST', '/auth/google', {
    credential: await idToken({ email: '' }), deviceId: crypto.randomUUID(), ...CONSENT, marketingOptIn: true,
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.marketing, 'no_email');
  assert.equal(r.json.consent.marketingOptIn, false);
  assert.equal(r.json.consent.hasEmail, false);
  assert.equal(d1raw.prepare('SELECT marketing_opt_in AS m FROM accounts').get().m, 0);
  const skip = d1raw.prepare("SELECT action FROM consent_log WHERE kind='marketing'").get();
  assert.equal(skip.action, 'skip_no_email');
  ok('marketingOptIn with no email → stored 0, marketing=no_email');
}

// ── 기존 계정은 약관 없이 로그인, needsTerms true ──
{
  const { env, d1raw } = makeEnv();
  const first = makeAuth(env, cache);
  await first.call('POST', '/auth/google', { credential: await idToken(), deviceId: crypto.randomUUID(), ...CONSENT });
  // 예전 회원처럼 동의 컬럼을 비운다
  d1raw.prepare("UPDATE accounts SET terms_version=NULL, privacy_version=NULL, terms_agreed_at=NULL, privacy_agreed_at=NULL").run();
  const a = makeAuth(env, cache);
  const r = await a.call('POST', '/auth/google', { credential: await idToken(), deviceId: crypto.randomUUID() });
  assert.equal(r.status, 200);
  assert.equal(r.json.created, false);
  assert.equal(r.json.consent.needsTerms, true);
  const me = await a.call('GET', '/auth/me');
  assert.equal(me.json.consent.needsTerms, true);
  ok('existing account can log in without terms; needsTerms=true');

  const bad = await a.call('POST', '/auth/consent', { termsVersion: 'nope', privacyVersion: C.PRIVACY_VERSION });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'consent_required');
  ok('POST /auth/consent with stale version → 400');

  const saved = await a.call('POST', '/auth/consent', { ...CONSENT, marketingOptIn: true });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(saved.json.consent.needsTerms, false);
  assert.equal(saved.json.marketing, 'on');
  ok('POST /auth/consent stores required agreement and optional marketing');
}

// ── 마케팅 토글, 이메일 없으면 400 ──
{
  const { env } = makeEnv();
  const a = makeAuth(env, cache);
  await a.call('POST', '/auth/google', { credential: await idToken(), deviceId: crypto.randomUUID(), ...CONSENT });
  let r = await a.call('POST', '/auth/marketing', { optIn: true });
  assert.equal(r.status, 200);
  assert.equal(r.json.consent.marketingOptIn, true);
  r = await a.call('POST', '/auth/marketing', { optIn: false });
  assert.equal(r.status, 200);
  assert.equal(r.json.consent.marketingOptIn, false);
  ok('POST /auth/marketing toggles opt-in on and off');

  const b = makeAuth(env, cache);
  r = await b.call('POST', '/auth/marketing', { optIn: true });
  assert.equal(r.status, 401);
  assert.equal(r.json.error, 'not_logged_in');
  ok('POST /auth/marketing without session → 401');
}
{
  const { env } = makeEnv();
  const a = makeAuth(env, cache);
  await a.call('POST', '/auth/google', { credential: await idToken({ email: '' }), deviceId: crypto.randomUUID(), ...CONSENT });
  const r = await a.call('POST', '/auth/marketing', { optIn: true });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'no_email');
  ok('POST /auth/marketing opt-in without email → 400 no_email');
}

// ── 0007 미적용: 신규는 동의가 맞아도 계정은 만들고 저장만 건너뜀 ──
{
  const { env, d1raw } = makeEnv({ migrateConsent: false });
  const a = makeAuth(env, cache);
  const r = await a.call('POST', '/auth/google', { credential: await idToken(), deviceId: crypto.randomUUID(), ...CONSENT, marketingOptIn: true });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.created, true);
  assert.equal(d1raw.prepare('SELECT COUNT(*) AS c FROM accounts').get().c, 1);
  assert.equal(r.json.consent.needsTerms, true);
  const col = d1raw.prepare("SELECT name FROM pragma_table_info('accounts') WHERE name='terms_version'").get();
  assert.equal(col, undefined);
  const me = await a.call('GET', '/auth/me');
  assert.equal(me.json.consent.needsTerms, true);
  const post = await a.call('POST', '/auth/consent', CONSENT);
  assert.equal(post.status, 503);
  assert.equal(post.json.error, 'consent_schema_missing');
  ok('without 0007: account is created, needsTerms stays true, POST /auth/consent → 503');
}

console.log(`\naccount-consent: ${n} checks passed`);
