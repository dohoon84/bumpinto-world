// [accounts] /auth/* 라우트. ACCOUNTS_ENABLED 가 꺼져 있으면 config 만 {enabled:false} 로 답하고 나머지는 404.
//   GET  /auth/config  → { enabled, clientId, economy, consent }
//   POST /auth/google  { credential, deviceId, termsVersion?, privacyVersion?, marketingOptIn? }
//                      → 구글 ID 토큰 검증 → 계정 찾기/만들기(신규는 약관 필수) → 기기 연결·이전 → 세션 쿠키
//   POST /auth/link    { deviceId }            → (로그인 상태) 이 기기를 계정에 붙이고 이전
//   POST /auth/logout  { all? }                → 쿠키 삭제. all:true 면 모든 기기의 세션 무효(session_version+1)
//   GET  /auth/me                              → 계정, 기기(가림), 대표 캐릭터 id, 잔액, 칭호용 기록, consent
//   POST /auth/consent { termsVersion, privacyVersion, marketingOptIn? } → (로그인 상태) 필수 약관 동의 저장
//   POST /auth/marketing { optIn }             → (로그인 상태) 마케팅 수신동의 토글
//   POST /auth/dev     { name?, sub?, deviceId, termsVersion?, privacyVersion?, marketingOptIn? } → 로컬 시험용 가짜 로그인
// 쿠키를 쓰므로 CORS 는 허용 목록의 출처만, Allow-Credentials: true. "*" 는 쓰지 않는다.
import { verifyGoogleIdToken } from "./google.js";
import { clearSessionCookie, sessionCookie, sessionFromRequest, signSession } from "./session.js";
import { accountsEnabled, accountsReady, devLoginAllowed, econFeatures, economyEnabled, devLoginOn, isPrivateDevHost, statsEnabled } from "./flags.js";
import { econMode } from "./economy.js";
import {
  accountByGoogleSub,
  accountForSession,
  devicesOf,
  grantStarters,
  linkDevice,
  maskDevice,
  reconcileAccount,
  upsertAccount,
} from "./store.js";
import { consentOf, consentPublicConfig, parseConsentInput, saveMarketingOptIn, saveRequiredConsent } from "./consent.js";
import { getBalance } from "./ledger.js";
import { logLoginDay, statsSummary } from "./stats.js";

const MAX_BODY = 8000;
// JWKS 캐시는 google.js 의 기본 캐시(아이솔레이트 공유)를 쓰고, 테스트만 deps.jwks 로 바꿔 끼운다.
const jwksFor = (deps) => deps?.jwks || undefined;

/** 쿠키를 받아도 되는 출처면 그 출처, 아니면 "" */
export function credentialedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!origin) return "";
  const configured = String(env?.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter((s) => s && s !== "*");
  if (configured.includes(origin)) return origin;
  try {
    const u = new URL(origin);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return origin;
    if (devLoginOn(env) && u.protocol === "http:" && isPrivateDevHost(host)) return origin; // 로컬 시험: 같은 와이파이 아이폰(http://172.x)
    if (u.protocol !== "https:") return "";
    if (host === "bumpinto.world" || host.endsWith(".bumpinto.world")) return origin;
    if (host === "jeongja3d.pages.dev" || host.endsWith(".jeongja3d.pages.dev")) return origin;
  } catch {}
  return "";
}

export function authCors(request, env) {
  const origin = credentialedOrigin(request, env);
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (origin) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Credentials"] = "true";
  }
  return h;
}

function json(data, status, headers, cookie) {
  const h = new Headers({ "Content-Type": "application/json; charset=utf-8", ...headers });
  if (cookie) h.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(data), { status, headers: h });
}

async function readBody(request) {
  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return { error: "bad_content_type" }; // 단순 요청(form) CSRF 차단
  let text;
  try { text = await request.text(); } catch { return { error: "bad_body" }; }
  if (text.length > MAX_BODY) return { error: "too_big" };
  try { return { body: JSON.parse(text || "{}") || {} }; } catch { return { error: "bad_body" }; }
}

function publicAccount(acc) {
  return {
    id: acc.id,
    name: acc.name || "",
    email: acc.email || "",
    createdAt: acc.created_at,
    firstLoginAt: acc.first_login_at,
  };
}

function bookOf(env) {
  try { return env?.PHONE_BOOK?.getByName ? env.PHONE_BOOK.getByName("jeongja") : null; } catch { return null; }
}

async function linkAndMigrate(env, accountId, deviceId, now, waitUntil) {
  const db = env.DB;
  const book = bookOf(env);
  const link = await linkDevice(db, env, accountId, deviceId, now);
  const rec = await reconcileAccount(db, env, book, accountId, now);
  if (rec.orphanKeys.length && env?.PHOTOS) {
    // 같은 사진이 두 PC 에 있던 경우 지운 쪽 원본(R2)을 치운다
    const p = Promise.all(rec.orphanKeys.map((k) => env.PHOTOS.delete(k).catch(() => {})));
    waitUntil ? waitUntil(p) : await p;
  }
  // [arcade] 같은 기기 게스트 오락실 기록을 계정으로 합친다(로그인·기기연결 직후)
  const arcadeDevice = String(deviceId || "").replace(/[^\w.-]/g, "").slice(0, 80);
  if (arcadeDevice) {
    try {
      const { mergeGuestBest } = await import("../arcade/db.js");
      await mergeGuestBest(db, {
        device: arcadeDevice,
        playerKey: `a:${accountId}`,
        accountId,
        name: "",
        now,
      });
    } catch { /* 오락실 테이블이 없어도 로그인은 성공 */ }
  }
  return {
    link,
    primaryUserId: rec.primaryUserId,
    migrate: { mode: rec.mode, merged: rec.merged.map((m) => ({ device: maskDevice(m.device), status: m.status, summary: m.summary })) },
  };
}

async function mePayload(env, acc, deviceId, now) {
  const db = env.DB;
  const devices = await devicesOf(db, acc.id);
  const out = {
    ok: true,
    account: publicAccount(acc),
    primaryUserId: acc.primary_user_id || null,
    devices: devices.map((d) => ({
      id: maskDevice(d.device_id),
      linkedAt: d.linked_at,
      status: d.merge_status,
      current: !!deviceId && (d.device_id === deviceId || (d.merge_status === "primary" && acc.primary_user_id === deviceId)),
    })),
    economy: economyEnabled(env),
    consent: consentOf(acc),
  };
  if (out.economy) out.balance = await getBalance(db, acc.id);
  if (statsEnabled(env)) out.stats = await statsSummary(db, acc.id);
  return out;
}

/**
 * @param deps { jwks?, now?, waitUntil? } — 테스트에서 JWKS·시각을 바꿔 끼운다
 * @returns {Promise<Response|null>} /auth/* 가 아니면 null
 */
export async function handleAuth(request, env, url, deps = {}) {
  if (!url.pathname.startsWith("/auth/")) return null;
  const cors = authCors(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const path = url.pathname;
  const now = deps.now ?? Date.now();

  if (path === "/auth/config" && request.method === "GET") {
    const ready = accountsReady(env);
    return json(
      {
        ok: true, enabled: ready, clientId: ready ? String(env.GOOGLE_CLIENT_ID).trim() : "", economy: economyEnabled(env),
        econ: { mode: econMode(env), features: econFeatures(env) }, devLogin: devLoginAllowed(env, url, request.headers.get("Origin") || ""),
        consent: consentPublicConfig(),
      },
      200,
      cors,
    );
  }
  if (!accountsEnabled(env)) return json({ ok: false, error: "accounts_disabled" }, 404, cors);
  if (!accountsReady(env)) return json({ ok: false, error: "accounts_not_configured" }, 503, cors);

  // 쿠키를 다루는 요청은 허용 출처에서만 (Origin 이 없는 서버 간 호출·같은 출처는 통과)
  if (request.headers.get("Origin") && !cors["Access-Control-Allow-Origin"]) {
    return json({ ok: false, error: "bad_origin" }, 403, cors);
  }

  const db = env.DB;
  const waitUntil = deps.waitUntil;
  try {
    const isDev = path === "/auth/dev" && request.method === "POST" && devLoginAllowed(env, url, request.headers.get("Origin") || "");
    if ((path === "/auth/google" && request.method === "POST") || isDev) {
      const { body, error } = await readBody(request);
      if (error) return json({ ok: false, error }, 400, cors);
      let claims;
      if (isDev) {
        // 로컬 시험용: 구글 없이 고정 sub 로 계정을 만든다(google_sub = "dev:<sub>" — 실제 구글 sub 는 숫자라 겹치지 않음)
        const sub = String(body.sub || "local").replace(/[^\w.-]/g, "").slice(0, 40) || "local";
        claims = { sub: `dev:${sub}`, email: `${sub}@dev.localhost`, name: String(body.name || `Dev ${sub}`).slice(0, 40) };
      } else {
        const verified = await verifyGoogleIdToken(body.credential, {
          clientId: String(env.GOOGLE_CLIENT_ID).trim(),
          jwks: jwksFor(deps),
          now,
        });
        if (!verified.ok) return json({ ok: false, error: verified.error }, 401, cors);
        claims = verified.claims;
      }
      const existing = await accountByGoogleSub(db, claims.sub);
      const consentIn = parseConsentInput(body);
      if (!existing && !consentIn.requiredOk) return json({ ok: false, error: "consent_required" }, 400, cors);
      const { account, created } = await upsertAccount(db, claims, now);
      if (!account) return json({ ok: false, error: "server" }, 500, cors);
      let marketing = null;
      if (consentIn.requiredOk) {
        const saved = await saveRequiredConsent(db, account, consentIn, now);
        if (created && !saved.ok && saved.error === "consent_schema_missing") {
          // 0007 미적용: 계정은 만들되 동의 저장만 건너뛴다(needsTerms 유지)
        } else if (created && !saved.ok) {
          return json({ ok: false, error: saved.error }, saved.error === "consent_required" ? 400 : 503, cors);
        } else if (saved.ok) {
          marketing = saved.marketing;
        }
      }
      const linked = await linkAndMigrate(env, account.id, body.deviceId, now, waitUntil);
      let grants = null;
      if (economyEnabled(env)) grants = await grantStarters(db, env, bookOf(env), account.id, now);
      if (statsEnabled(env)) await logLoginDay(db, account.id, now);
      const token = await signSession({ accountId: account.id, sessionVersion: account.session_version || 1, now }, env.SESSION_SECRET);
      const fresh = (await db.prepare("SELECT * FROM accounts WHERE id = ?").bind(account.id).first()) || account;
      return json(
        {
          ok: true,
          created,
          account: publicAccount(fresh),
          consent: consentOf(fresh),
          ...(marketing ? { marketing } : {}),
          link: linked.link,
          primaryUserId: linked.primaryUserId,
          migrate: linked.migrate,
          economy: economyEnabled(env),
          ...(grants ? { balance: grants.balance, granted: grants.granted } : {}),
        },
        200,
        cors,
        sessionCookie(token, env),
      );
    }

    const session = await sessionFromRequest(request, env, now);
    const acc = await accountForSession(db, session);

    if (path === "/auth/logout" && request.method === "POST") {
      const { body } = await readBody(request);
      if (acc && body?.all === true) {
        await db.prepare("UPDATE accounts SET session_version = session_version + 1 WHERE id = ?").bind(acc.id).run();
      }
      return json({ ok: true }, 200, cors, clearSessionCookie(env));
    }

    if (!acc) return json({ ok: false, error: "not_logged_in" }, 401, cors, session ? clearSessionCookie(env) : null);

    if (path === "/auth/me" && request.method === "GET") {
      const deviceId = String(url.searchParams.get("deviceId") || "").toLowerCase();
      if (economyEnabled(env)) await grantStarters(db, env, bookOf(env), acc.id, now); // 멱등 — 이미 받았으면 그대로
      if (statsEnabled(env)) await logLoginDay(db, acc.id, now);
      return json(await mePayload(env, acc, deviceId, now), 200, cors);
    }

    if (path === "/auth/consent" && request.method === "POST") {
      const { body, error } = await readBody(request);
      if (error) return json({ ok: false, error }, 400, cors);
      const consentIn = parseConsentInput(body);
      const saved = await saveRequiredConsent(db, acc, consentIn, now);
      if (!saved.ok) {
        const status = saved.error === "consent_required" ? 400 : saved.error === "consent_schema_missing" ? 503 : 400;
        return json({ ok: false, error: saved.error }, status, cors);
      }
      const fresh = (await db.prepare("SELECT * FROM accounts WHERE id = ?").bind(acc.id).first()) || acc;
      return json({ ok: true, consent: consentOf(fresh), marketing: saved.marketing, account: publicAccount(fresh) }, 200, cors);
    }

    if (path === "/auth/marketing" && request.method === "POST") {
      const { body, error } = await readBody(request);
      if (error) return json({ ok: false, error }, 400, cors);
      const optIn = body?.optIn === true || body?.optIn === 1 || body?.optIn === "1";
      const saved = await saveMarketingOptIn(db, acc, optIn, now);
      if (!saved.ok) {
        const status = saved.error === "no_email" ? 400 : saved.error === "consent_schema_missing" ? 503 : 400;
        return json({ ok: false, error: saved.error }, status, cors);
      }
      const fresh = (await db.prepare("SELECT * FROM accounts WHERE id = ?").bind(acc.id).first()) || acc;
      return json({ ok: true, consent: consentOf(fresh), marketing: saved.marketing, account: publicAccount(fresh) }, 200, cors);
    }

    if (path === "/auth/link" && request.method === "POST") {
      const { body, error } = await readBody(request);
      if (error) return json({ ok: false, error }, 400, cors);
      const linked = await linkAndMigrate(env, acc.id, body.deviceId, now, waitUntil);
      return json({ ok: true, link: linked.link, primaryUserId: linked.primaryUserId, migrate: linked.migrate }, 200, cors);
    }
  } catch (e) {
    return json({ ok: false, error: "server", detail: String(e?.message || e).slice(0, 200) }, 500, cors);
  }
  return json({ ok: false, error: "not_found" }, 404, cors);
}
