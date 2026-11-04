// [accounts] 서버 플래그. 전부 wrangler.jsonc "vars" 또는 대시보드 값이고, 기본은 "아무것도 바뀌지 않음".
//   ACCOUNTS_ENABLED  "1" 이어야 /auth/* 가 동작하고, 웹소켓이 세션을 읽고, 칭호용 기록을 쌓는다. 기본 "0".
//   ACCOUNT_MIGRATE   off | dry | on. 기기 → 계정 이전 방식. off=연결만, dry=할 일만 기록(쓰기 없음), on=실제 이전. 기본 on.
//   ECONOMY_ENABLED   "1" 이면 웰컴·베타 지급과 잔액 표시. 기본 "0".
//   ECONOMY_OPEN_AT   경제 오픈 시각(ISO, 예 2026-12-01T00:00:00+09:00). 베타 감사 지급의 기준일·30일 창. 비어 있으면 베타 지급 없음.
//   STATS_ENABLED     "0" 이면 칭호용 기록(이동·접속일·사진)을 끈다. 기본 켬(ACCOUNTS_ENABLED 가 켜졌을 때만 의미).
//   ACCOUNT_MAX_DEVICES 계정당 기기 수 상한. 기본 5.
//   필수 바인딩/비밀: DB(D1), SESSION_SECRET(32자 이상), GOOGLE_CLIENT_ID.
import { secretOk } from "./session.js";

const on = (v) => v === true || v === 1 || /^(1|true|on|yes)$/i.test(String(v ?? "").trim());

export function accountsEnabled(env) {
  return on(env?.ACCOUNTS_ENABLED);
}

/** 플래그가 켜졌고 필요한 바인딩·비밀이 모두 있을 때만 true. */
export function accountsReady(env) {
  return accountsEnabled(env) && !!env?.DB && secretOk(env?.SESSION_SECRET) && !!String(env?.GOOGLE_CLIENT_ID || "").trim();
}

export function migrateMode(env) {
  const v = String(env?.ACCOUNT_MIGRATE ?? "on").trim().toLowerCase();
  return v === "off" || v === "dry" ? v : "on";
}

export function economyEnabled(env) {
  return accountsReady(env) && on(env?.ECONOMY_ENABLED);
}

export function statsEnabled(env) {
  return accountsReady(env) && !/^(0|false|off|no)$/i.test(String(env?.STATS_ENABLED ?? "1").trim());
}

export function economyOpenAt(env) {
  const raw = String(env?.ECONOMY_OPEN_AT || "").trim();
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

export function maxDevices(env) {
  const n = Math.floor(Number(env?.ACCOUNT_MAX_DEVICES || 5));
  return n >= 1 && n <= 50 ? n : 5;
}

const KST_MS = 9 * 3600 * 1000;
/** KST 날짜 'YYYY-MM-DD' (일 리셋 00:00 KST). */
export function kstDate(now = Date.now()) {
  return new Date(now + KST_MS).toISOString().slice(0, 10);
}
