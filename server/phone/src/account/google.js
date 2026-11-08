// [accounts] Google Identity Services ID 토큰(JWT, RS256) 검증. 저장은 하지 않는다 — 검증된 클레임만 돌려준다.
//
//   verifyGoogleIdToken(token, { clientId, now?, jwks? })
//     → { ok: true, claims: { sub, email, email_verified, name, ... } }
//     → { ok: false, error: 'bad_token' | 'bad_alg' | 'unknown_kid' | 'bad_signature' | 'bad_iss' | 'bad_aud' | 'expired' | 'not_yet_valid' | 'email_unverified' | 'no_sub' | 'jwks_unavailable' | 'no_client_id' }
//
// JWKS(https://www.googleapis.com/oauth2/v3/certs)는 isolate 메모리에 Cache-Control max-age 만큼 둔다.
// 모르는 kid 가 오면(구글 키 교체) 최대 1분에 한 번만 다시 받는다.
// 이 파일은 cloudflare:workers 를 가져오지 않는다 — node 단위 테스트가 그대로 불러 쓴다.

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const CLOCK_SKEW_SEC = 60;
const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000;
const MIN_REFETCH_MS = 60 * 1000;
const MAX_TOKEN_LEN = 4096;

export function b64urlToBytes(s) {
  const b64 = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeJsonPart(part) {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
  } catch {
    return null;
  }
}

function maxAgeMs(cacheControl) {
  const m = /max-age=(\d+)/i.exec(cacheControl || "");
  const sec = m ? Number(m[1]) : 0;
  return sec > 0 ? Math.min(sec * 1000, 24 * 3600 * 1000) : DEFAULT_JWKS_TTL_MS;
}

/** JWKS 캐시. 테스트는 createJwksCache({ fetch }) 로 가짜 fetch 를 넣는다. */
export function createJwksCache({ fetch: fetchImpl = (...a) => globalThis.fetch(...a), url = GOOGLE_JWKS_URL } = {}) {
  let keys = new Map(); // kid → CryptoKey
  let expiresAt = 0;
  let lastFetch = 0;
  let inflight = null;
  let fetches = 0;

  async function load(now) {
    if (inflight) return inflight;
    inflight = (async () => {
      lastFetch = now;
      fetches += 1;
      const res = await fetchImpl(url, { cf: { cacheTtl: 3600, cacheEverything: true } });
      if (!res || !res.ok) throw new Error("jwks_http");
      const body = await res.json();
      const next = new Map();
      for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
        if (!jwk || jwk.kty !== "RSA" || !jwk.kid || !jwk.n || !jwk.e) continue;
        if (jwk.alg && jwk.alg !== "RS256") continue;
        if (jwk.use && jwk.use !== "sig") continue;
        try {
          const key = await crypto.subtle.importKey(
            "jwk",
            { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["verify"],
          );
          next.set(jwk.kid, key);
        } catch { /* 깨진 키는 건너뛴다 */ }
      }
      if (!next.size) throw new Error("jwks_empty");
      keys = next;
      expiresAt = now + maxAgeMs(res.headers?.get?.("Cache-Control"));
    })();
    try {
      await inflight;
    } finally {
      inflight = null;
    }
  }

  return {
    get fetches() { return fetches; },
    async key(kid, now = Date.now()) {
      if (!keys.size || now >= expiresAt) {
        try { await load(now); } catch (e) { if (!keys.size) throw e; }
      }
      if (keys.has(kid)) return keys.get(kid);
      if (now - lastFetch >= MIN_REFETCH_MS) {
        try { await load(now); } catch { /* 기존 키 유지 */ }
      }
      return keys.get(kid) || null;
    },
  };
}

const defaultCache = createJwksCache();

export async function verifyGoogleIdToken(token, { clientId, now = Date.now(), jwks = defaultCache } = {}) {
  if (!clientId) return { ok: false, error: "no_client_id" };
  if (typeof token !== "string" || token.length > MAX_TOKEN_LEN) return { ok: false, error: "bad_token" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p || !/^[A-Za-z0-9_-]+$/.test(p))) return { ok: false, error: "bad_token" };
  const header = decodeJsonPart(parts[0]);
  const claims = decodeJsonPart(parts[1]);
  if (!header || !claims || typeof claims !== "object") return { ok: false, error: "bad_token" };
  if (header.alg !== "RS256") return { ok: false, error: "bad_alg" };
  if (!header.kid || typeof header.kid !== "string") return { ok: false, error: "unknown_kid" };

  let key;
  try {
    key = await jwks.key(header.kid, now);
  } catch {
    return { ok: false, error: "jwks_unavailable" };
  }
  if (!key) return { ok: false, error: "unknown_kid" };
  let sig;
  try { sig = b64urlToBytes(parts[2]); } catch { return { ok: false, error: "bad_token" }; }
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, sig, signed).catch(() => false);
  if (!valid) return { ok: false, error: "bad_signature" };

  if (!GOOGLE_ISSUERS.has(claims.iss)) return { ok: false, error: "bad_iss" };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId)) return { ok: false, error: "bad_aud" };
  if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== clientId) return { ok: false, error: "bad_aud" };
  const nowSec = Math.floor(now / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp + CLOCK_SKEW_SEC < nowSec) return { ok: false, error: "expired" };
  if (Number.isFinite(claims.nbf) && claims.nbf - CLOCK_SKEW_SEC > nowSec) return { ok: false, error: "not_yet_valid" };
  if (Number.isFinite(claims.iat) && claims.iat - CLOCK_SKEW_SEC > nowSec) return { ok: false, error: "not_yet_valid" };
  if ("email_verified" in claims && !(claims.email_verified === true || claims.email_verified === "true")) {
    return { ok: false, error: "email_unverified" };
  }
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) return { ok: false, error: "no_sub" };
  return { ok: true, claims };
}
