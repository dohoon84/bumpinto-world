// [accounts] 세션 쿠키 bw_s — 서버만 아는 SESSION_SECRET 으로 HMAC-SHA256 서명한 짧은 토큰.
//   값 = "v1.<base64url(JSON {a, sv, iat, exp})>.<base64url(HMAC)>"
//   a = 계정 id, sv = 계정의 session_version(전체 로그아웃 때 올려서 예전 쿠키를 무효로 만든다)
// 구글 토큰은 담지 않는다. 쿠키: HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=30일. (로컬 DEV_LOGIN+SESSION_COOKIE_INSECURE 때만 Secure 없음)
// 이 파일은 cloudflare:workers 를 가져오지 않는다 — node 단위 테스트가 그대로 불러 쓴다.
import { insecureDevCookie } from "./flags.js";
import { b64urlToBytes, bytesToB64url } from "./google.js";

export const SESSION_COOKIE = "bw_s";
export const SESSION_TTL_SEC = 30 * 24 * 3600;
const MIN_SECRET_LEN = 32;

const keyCache = new Map();
async function hmacKey(secret) {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keyCache.set(secret, k);
    if (keyCache.size > 4) keyCache.delete(keyCache.keys().next().value);
  }
  return k;
}

export function secretOk(secret) {
  return typeof secret === "string" && secret.length >= MIN_SECRET_LEN;
}

export async function signSession({ accountId, sessionVersion = 1, now = Date.now(), ttlSec = SESSION_TTL_SEC }, secret) {
  if (!secretOk(secret)) throw new Error("session_secret_missing");
  const iat = Math.floor(now / 1000);
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({ a: String(accountId), sv: sessionVersion | 0, iat, exp: iat + ttlSec })));
  const body = `v1.${payload}`;
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(body)));
  return `${body}.${bytesToB64url(mac)}`;
}

/** @returns {Promise<{accountId:string, sessionVersion:number, iat:number, exp:number}|null>} */
export async function verifySession(token, secret, now = Date.now()) {
  if (!secretOk(secret) || typeof token !== "string" || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  let mac;
  try { mac = b64urlToBytes(parts[2]); } catch { return null; }
  const ok = await crypto.subtle
    .verify("HMAC", await hmacKey(secret), mac, new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
    .catch(() => false);
  if (!ok) return null;
  let data;
  try { data = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))); } catch { return null; }
  if (!data || typeof data.a !== "string" || !data.a) return null;
  const nowSec = Math.floor(now / 1000);
  if (!Number.isFinite(data.exp) || data.exp <= nowSec) return null;
  if (!Number.isFinite(data.iat) || data.iat - 60 > nowSec) return null;
  return { accountId: data.a, sessionVersion: data.sv | 0, iat: data.iat, exp: data.exp };
}

export function readCookie(request, name = SESSION_COOKIE) {
  const raw = request?.headers?.get?.("Cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

function sameSiteOf(env) {
  const v = String(env?.SESSION_COOKIE_SAMESITE || "Lax").trim().toLowerCase();
  return v === "none" ? "None" : v === "strict" ? "Strict" : "Lax";
}

export function sessionCookie(value, env, maxAgeSec = SESSION_TTL_SEC) {
  const domain = String(env?.SESSION_COOKIE_DOMAIN || "").trim();
  return [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${Math.max(0, maxAgeSec | 0)}`,
    "HttpOnly",
    ...(insecureDevCookie(env) ? [] : ["Secure"]), // 로컬 http(LAN) 시험 때만 뺀다 — flags.js insecureDevCookie
    `SameSite=${sameSiteOf(env)}`,
    ...(domain && /^[a-z0-9.-]+$/i.test(domain) ? [`Domain=${domain}`] : []),
  ].join("; ");
}

export function clearSessionCookie(env) {
  return sessionCookie("", env, 0);
}

/** 요청의 쿠키를 검증해 { accountId, sessionVersion } 또는 null. D1 의 session_version 대조는 호출하는 쪽이 한다. */
export async function sessionFromRequest(request, env, now = Date.now()) {
  const token = readCookie(request);
  if (!token) return null;
  return verifySession(token, env?.SESSION_SECRET, now);
}
