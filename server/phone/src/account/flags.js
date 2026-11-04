// [accounts] 서버 플래그. 전부 wrangler.jsonc "vars" 또는 대시보드 값이고, 기본은 "아무것도 바뀌지 않음".
//   ACCOUNTS_ENABLED  "1" 이어야 /auth/* 가 동작하고, 웹소켓이 세션을 읽고, 칭호용 기록을 쌓는다. 기본 "0".
//   ACCOUNT_MIGRATE   off | dry | on. 기기 → 계정 이전 방식. off=연결만, dry=할 일만 기록(쓰기 없음), on=실제 이전. 기본 on.
//   ECONOMY_ENABLED   "1" 이면 웰컴·베타 지급과 잔액 표시. 기본 "0".
//   ECONOMY_OPEN_AT   경제 오픈 시각(ISO, 예 2026-12-01T00:00:00+09:00). 베타 감사 지급의 기준일·30일 창. 비어 있으면 베타 지급 없음.
//   STATS_ENABLED     "0" 이면 칭호용 기록(이동·접속일·사진)을 끈다. 기본 켬(ACCOUNTS_ENABLED 가 켜졌을 때만 의미).
//   ACCOUNT_MAX_DEVICES 계정당 기기 수 상한. 기본 5.
//   ── [economy] 2~5단계 (전부 ECONOMY_ENABLED=1 위에서만 의미) ──
//   ECON_FEATURES     켤 기능 목록(쉼표). move | quests | shop | board. 기본 "" = 웰컴 지급만. 순서: move → quests → shop → board
//                     (quests 는 업적·카르마·교통 이용 기록(/econ/fare)도 같이 켬)
//   ECON_PAID         "1" 이면 유료 모드: 교통 요금·상점 가격을 실제로 원장에서 뺀다(잔액 부족 오류). 기본 "0" = 출시 무료 기간
//                     (요금·가격은 0원으로 처리하고 이용 기록만 남김). 코드 변경 없이 이 값만 바꿔 유료 전환.
//   DEV_LOGIN         "1" 이고 요청 주소가 localhost/127.0.0.1 일 때만 POST /auth/dev 허용(로컬 wrangler dev 시험용). 배포 환경엔 넣지 말 것.
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

// ── [economy] ──
export const ECON_FEATURE_NAMES = Object.freeze(["move", "quests", "shop", "board"]);

export function econFeatures(env) {
  if (!economyEnabled(env)) return [];
  const want = new Set(String(env?.ECON_FEATURES || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  return ECON_FEATURE_NAMES.filter((f) => want.has(f));
}

export function featureOn(env, name) {
  return econFeatures(env).includes(name);
}

/** 유료 모드(요금·상점 실제 차감). 기본 false = 출시 무료 기간. */
export function econPaid(env) {
  return economyEnabled(env) && on(env?.ECON_PAID);
}

export function devLoginAllowed(env, url) {
  if (!on(env?.DEV_LOGIN)) return false;
  const h = String(url?.hostname || "");
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
}

/** KST 기간 경계(ms). 일 00:00 KST, 주 = ISO 주(월요일 00:00 KST), 월 = 1일 00:00 KST */
export function kstPeriods(now = Date.now()) {
  const k = now + KST_MS;
  const dayStartK = Math.floor(k / 86400000) * 86400000;
  const dow = (new Date(dayStartK).getUTCDay() + 6) % 7; // 월=0
  const weekStartK = dayStartK - dow * 86400000;
  const d = new Date(dayStartK);
  const monthStartK = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const monthEndK = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  // ISO 주 번호
  const th = new Date(weekStartK + 3 * 86400000); // 그 주 목요일
  const y = th.getUTCFullYear();
  const wk = 1 + Math.floor((th - Date.UTC(y, 0, 4) + ((new Date(Date.UTC(y, 0, 4)).getUTCDay() + 6) % 7) * 86400000) / (7 * 86400000));
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  return {
    day: { key: iso(dayStartK), start: dayStartK - KST_MS, end: dayStartK + 86400000 - KST_MS },
    week: { key: `${y}-W${String(wk).padStart(2, "0")}`, start: weekStartK - KST_MS, end: weekStartK + 7 * 86400000 - KST_MS, from: iso(weekStartK), to: iso(weekStartK + 6 * 86400000) },
    month: { key: iso(dayStartK).slice(0, 7), start: monthStartK - KST_MS, end: monthEndK - KST_MS, from: iso(monthStartK), to: iso(monthEndK - 86400000) },
  };
}
