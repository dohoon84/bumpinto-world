// [economy] 서버 경제 로직 (2~5단계). 금액·규칙은 econ.js 한 곳에서 가져온다.
//   - 지급(이동·퀘스트·업적·게시판·웰컴)은 무료/유료 모드와 상관없이 원장에 실제로 들어간다. 카테고리별 하루·주 상한.
//   - 지출(교통·상점)은 ECON_PAID=1(유료 모드)일 때만 원장에서 빠진다. 기본(출시 무료 기간)은 0원 + 이용 기록(econ_events)만.
//   - 원장은 append-only, 모든 행은 idempotency_key 로 멱등. 상한·잔액 조건은 INSERT … SELECT … WHERE 로 같은 batch(트랜잭션) 안에서 다시 판정.
//   - 게스트(계정 없음)는 여기까지 오지 않는다(라우트가 not_signed_in). 게스트의 예전 진행은 소급 지급하지 않는다.
// 이 파일은 cloudflare:workers 를 가져오지 않는다 — node 단위 테스트가 D1 대역으로 그대로 불러 쓴다.
import {
  ACHIEVEMENTS, BOARD, CAPS, DISPLAY, ECON_CONFIG_VERSION, FARES, FARE_ALIASES, KARMA_AXES, LADDERS, MOVE, movePerMinute, PHOTO_SPOT_M,
  QUESTS, rideLimits, SHOP, SHOP_PREVIEW_ONLY, TAXI, WELCOME_FREE_BUM, BETA_FREE_BUM, WELCOME_TEXT,
} from "./econ.js";
import { appendLedgerWhere, getBalance } from "./ledger.js";
import { econPaid, economyEnabled, economyOpenAt, featureOn, kstDate, kstPeriods } from "./flags.js";
import { BETA_WINDOW_DAYS } from "./econ.js";

const V = ECON_CONFIG_VERSION;
const T = (ko, en) => ({ ko, en });
const HUMAN_MODES = ["walk", "bike", "roadbike"];
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const qs = (n) => Array(n).fill("?").join(", ");

export function econMode(env) {
  const paid = econPaid(env);
  // 상점은 무료 오픈 대상이 아님(미리보기 전용, 0원으로 주지 않음) → shopPaid 는 항상 true
  return { transitPaid: paid, shopPaid: true, beta: !paid };
}

export const NOT_SIGNED_IN = Object.freeze({
  code: "not_signed_in",
  message: T("구글 계정을 연동하면 bum을 받을 수 있어요", "Link a Google account to earn bum"),
});
export const err = (code, extra = {}) => ({ ok: false, error: { code, ...extra } });
export const ok = (data) => ({ ok: true, data });

// ───────────────────────── 잔액 (원장 합계 − 진행 중 택시 홀드) ─────────────────────────
const SPENDABLE_SQL = `((SELECT COALESCE(SUM(amount), 0) FROM ledger WHERE account_id = ?)
  - (SELECT COALESCE(SUM(held), 0) FROM taxi_holds WHERE account_id = ? AND status = 'held' AND expires_at > ?))`;
const spendableParams = (acc, now) => [acc, acc, now];

export async function heldSum(db, accountId, now = Date.now()) {
  const r = await db.prepare("SELECT COALESCE(SUM(held), 0) AS n FROM taxi_holds WHERE account_id = ? AND status = 'held' AND expires_at > ?").bind(accountId, now).first();
  return Number(r?.n || 0);
}

/** UI Balance 모양. 차감은 free 먼저(지금은 paid 잔액이 생길 길이 없음 — 현금 충전 미구현). */
export async function balanceView(db, accountId, now = Date.now()) {
  const b = await getBalance(db, accountId);
  const h = await heldSum(db, accountId, now);
  const total = b.total - h;
  return { guest: false, total, free: b.free - h, paid: b.paid, currency: "bum", locked: total < 0, updatedAt: now };
}
export const GUEST_BALANCE = (now = Date.now()) => ({ guest: true, total: 0, free: 0, paid: 0, currency: "bum", locked: false, updatedAt: now });

// ───────────────────────── 상한 ─────────────────────────
function sumSql(reasons) {
  return `(SELECT COALESCE(SUM(amount), 0) FROM ledger WHERE account_id = ? AND reason IN (${qs(reasons.length)}) AND created_at >= ? AND created_at < ?)`;
}
function capChecks(accountId, reason, now, reasonCap) {
  const P = kstPeriods(now);
  const out = [];
  if (reasonCap) {
    // 기획에 bum 상한이 있는 카테고리만 검사한다(econ.js CAPS 주석). 없으면 정의(기간당 1회 등)가 상한.
    if (Number.isFinite(CAPS.daily[reason])) out.push({ reasons: [reason], from: P.day.start, to: P.day.end, cap: CAPS.daily[reason] });
    if (Number.isFinite(CAPS.weekly[reason])) out.push({ reasons: [reason], from: P.week.start, to: P.week.end, cap: CAPS.weekly[reason] });
  }
  return out;
}

/** 이 카테고리에 지금 더 줄 수 있는 몫 */
export async function capRoom(db, accountId, reason, now = Date.now(), { reasonCap = true } = {}) {
  const checks = capChecks(accountId, reason, now, reasonCap);
  if (!checks.length) return Infinity; // 실제 D1 은 빈 batch([]) 를 거부한다(No SQL statements detected)
  const rows = await db.batch(checks.map((c) => db.prepare(`SELECT ${sumSql(c.reasons)} AS n`).bind(accountId, ...c.reasons, c.from, c.to)));
  let room = Infinity;
  checks.forEach((c, i) => { room = Math.min(room, c.cap - Number(rows[i]?.results?.[0]?.n || 0)); });
  return Math.max(0, room);
}

function capWhere(accountId, reason, amount, now, reasonCap) {
  const checks = capChecks(accountId, reason, now, reasonCap);
  return {
    sql: checks.map((c) => `${sumSql(c.reasons)} + ? <= ?`).join(" AND "),
    params: checks.flatMap((c) => [accountId, ...c.reasons, c.from, c.to, amount, c.cap]),
  };
}

/**
 * 상한 안에서 지급. 남은 몫보다 크면 잘라서 준다(0 이면 안 줌).
 * extraWhere = 추가 조건 { sql, params }, after = 같은 batch 뒤에 붙일 문장(원장 행 존재로 조건을 걸 것)
 * @returns {Promise<{applied:boolean, already?:boolean, amount:number, capped:boolean}>}
 */
export async function grantCapped(db, { accountId, reason, amount, key, ref = null, now = Date.now(), reasonCap = true, extraWhere = null, after = [] }) {
  const existing = await db.prepare("SELECT amount FROM ledger WHERE idempotency_key = ?").bind(key).first();
  if (existing) return { applied: false, already: true, amount: Number(existing.amount), capped: false };
  const room = await capRoom(db, accountId, reason, now, { reasonCap });
  const grant = Math.min(amount, room);
  if (grant <= 0) return { applied: false, amount: 0, capped: true };
  const w = capWhere(accountId, reason, grant, now, reasonCap);
  const parts = [w, extraWhere].filter((x) => x && x.sql);
  const where = parts.length ? { sql: parts.map((x) => x.sql).join(" AND "), params: parts.flatMap((x) => x.params) } : null;
  const r = await appendLedgerWhere(db, { accountId, amount: grant, kind: "free", reason, ref, idempotencyKey: key, priceTableVersion: V }, { now, where, after });
  return { applied: r.applied, amount: r.applied ? grant : 0, capped: grant < amount };
}

// ───────────────────────── 이동 보상 ─────────────────────────
export function weightedMinutes(rows) {
  let sec = 0;
  for (const r of rows) sec += Number(r.credited_sec || 0) * (MOVE.multiplier[r.mode] || 0);
  return Math.floor(sec / 60);
}

async function moveFacts(db, accountId, date) {
  const P = kstPeriods(Date.parse(`${date}T12:00:00+09:00`));
  const [credit, paidRow, other, dist] = await db.batch([
    db.prepare("SELECT mode, credited_sec FROM stat_credit_daily WHERE account_id = ? AND kst_date = ?").bind(accountId, date),
    db.prepare("SELECT minutes_paid FROM move_rewards WHERE account_id = ? AND kst_date = ?").bind(accountId, date),
    db.prepare("SELECT COALESCE(SUM(minutes_paid), 0) AS n FROM move_rewards WHERE account_id = ? AND kst_date >= ? AND kst_date <= ? AND kst_date <> ?").bind(accountId, P.week.from, P.week.to, date),
    db.prepare(`SELECT COALESCE(SUM(distance_m), 0) AS n FROM stat_mode_daily WHERE account_id = ? AND kst_date = ? AND mode IN (${qs(HUMAN_MODES.length)})`).bind(accountId, date, ...HUMAN_MODES),
  ]);
  const rows = credit.results || [];
  const weighted = weightedMinutes(rows);
  const paid = Number(paidRow.results?.[0]?.minutes_paid || 0);
  const weekOther = Number(other.results?.[0]?.n || 0);
  const limit = Math.max(0, Math.min(MOVE.dailyMinutes, MOVE.weeklyMinutes - weekOther));
  return { rows, weighted, paid, weekOther, limit, minutes: Math.min(weighted, limit), distanceM: Number(dist.results?.[0]?.n || 0) };
}

/**
 * 날짜 하나의 이동 보상 정산 — 날짜당 원장 1행(키 move:{acc}:{date}), 토스트도 1번.
 *   오늘: 인정분이 하루 몫(min(60, 주 남은 분))에 닿았을 때만. 지난 날짜(자정 + settleGraceMin 지남): 인정분 그대로.
 */
export async function settleMove(db, env, accountId, date, now = Date.now()) {
  const f = await moveFacts(db, accountId, date);
  if (f.paid > 0) return { added: 0, minutes: f.paid, settled: true };
  const dayEnd = Date.parse(`${date}T00:00:00+09:00`) + 86400000;
  const final = now >= dayEnd + MOVE.settleGraceMin * 60000;
  if (f.minutes <= 0 || (!final && f.minutes < f.limit)) return { added: 0, minutes: 0, pending: f.minutes, settled: false };
  const key = `move:${accountId}:${date}`;
  const r = await grantCapped(db, {
    accountId, reason: "move", amount: f.minutes * movePerMinute(date), key, ref: `${date}:${f.minutes}`, now, reasonCap: false,
    extraWhere: { sql: "NOT EXISTS (SELECT 1 FROM move_rewards WHERE account_id = ? AND kst_date = ? AND minutes_paid > 0)", params: [accountId, date] },
    after: [
      db.prepare(
        `INSERT INTO move_rewards (account_id, kst_date, minutes_paid, updated_at)
         SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM ledger WHERE idempotency_key = ?)
         ON CONFLICT(account_id, kst_date) DO UPDATE SET minutes_paid = excluded.minutes_paid, updated_at = excluded.updated_at
         WHERE move_rewards.minutes_paid = 0`,
      ).bind(accountId, date, f.minutes, now, key),
    ],
  });
  return { added: r.applied ? f.minutes : 0, amount: r.amount, minutes: r.applied ? f.minutes : 0, settled: !!r.applied, capped: r.capped };
}

/** 아직 지급 안 된(인정분이 있는) 날짜들 — 최근 catchUpDays 일 + 오늘, 오래된 날부터(주 상한 계산 순서) */
export async function unpaidMoveDates(db, accountId, now = Date.now()) {
  const from = kstDate(now - MOVE.catchUpDays * 86400000);
  const { results } = await db.prepare(
    `SELECT DISTINCT kst_date AS d FROM stat_credit_daily WHERE account_id = ? AND kst_date >= ? AND credited_sec > 0
       AND kst_date NOT IN (SELECT kst_date FROM move_rewards WHERE account_id = ? AND minutes_paid > 0) ORDER BY kst_date`,
  ).bind(accountId, from, accountId).all();
  return (results || []).map((r) => r.d);
}

/** Room 이 통계를 쓴 뒤 · /econ/state 에서 부른다. dates 는 참고만 — 항상 미지급 날짜를 오래된 순으로 본다. */
export async function settleMoveForDates(db, env, accountId, dates = [], now = Date.now()) {
  void dates;
  const out = [];
  for (const d of await unpaidMoveDates(db, accountId, now)) out.push(await settleMove(db, env, accountId, d, now));
  if (featureOn(env, "quests")) await autoSettle(db, env, accountId, now);
  return out;
}

export async function travelToday(db, accountId, now = Date.now()) {
  const date = kstDate(now);
  const f = await moveFacts(db, accountId, date);
  return {
    guest: false, kstDate: date, minutes: f.minutes, capMinutes: MOVE.dailyMinutes, ratePerMin: movePerMinute(date),
    pendingBum: f.paid > 0 ? 0 : f.minutes * movePerMinute(date), distanceM: f.distanceM,
    weekMinutes: Math.min(MOVE.weeklyMinutes, f.weekOther + Math.max(f.paid, f.minutes)), weekCapMinutes: MOVE.weeklyMinutes, settled: f.paid > 0,
  };
}
export const GUEST_TRAVEL = (now = Date.now()) => ({
  guest: true, kstDate: kstDate(now), minutes: 0, capMinutes: MOVE.dailyMinutes, ratePerMin: movePerMinute(kstDate(now)), pendingBum: 0, distanceM: 0,
  weekMinutes: 0, weekCapMinutes: MOVE.weeklyMinutes, settled: true,
});

// ───────────────────────── 퀘스트 ─────────────────────────
const DAILY_BY_ID = new Map(QUESTS.daily.pool.map((q) => [q.id, q]));
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function pickDaily(accountId, date) {
  const fixed = QUESTS.daily.fixed.filter((id) => DAILY_BY_ID.has(id));
  const rest = QUESTS.daily.pool.map((q) => q.id).filter((id) => !fixed.includes(id))
    .sort((a, b) => fnv(`${accountId}|${date}|${a}`) - fnv(`${accountId}|${date}|${b}`));
  return [...fixed, ...rest].slice(0, QUESTS.daily.slots);
}

export async function dailyAssignment(db, accountId, date, now = Date.now()) {
  const pick = pickDaily(accountId, date);
  await db.prepare("INSERT INTO quest_assignments (account_id, kst_date, quest_ids, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(account_id, kst_date) DO NOTHING")
    .bind(accountId, date, pick.join(","), now).run();
  const row = await db.prepare("SELECT quest_ids FROM quest_assignments WHERE account_id = ? AND kst_date = ?").bind(accountId, date).first();
  return String(row?.quest_ids || pick.join(",")).split(",").filter((id) => DAILY_BY_ID.has(id));
}

function rangeOf(cadence, P) {
  if (cadence === "daily") return { key: P.day.key, from: P.day.key, to: P.day.key, start: P.day.start, end: P.day.end, resetsAt: P.day.end };
  if (cadence === "weekly") return { key: P.week.key, from: P.week.from, to: P.week.to, start: P.week.start, end: P.week.end, resetsAt: P.week.end };
  return { key: P.month.key, from: P.month.from, to: P.month.to, start: P.month.start, end: P.month.end, resetsAt: P.month.end };
}

async function metricValue(db, accountId, q, r, assigned) {
  const one = async (sql, ...p) => Number((await db.prepare(sql).bind(...p).first())?.n || 0);
  switch (q.metric) {
    case "login":
    case "login_days":
      return one("SELECT COUNT(*) AS n FROM login_days WHERE account_id = ? AND kst_date >= ? AND kst_date <= ?", accountId, r.from, r.to);
    case "move_min":
      return Math.floor(await one(`SELECT COALESCE(SUM(credited_sec), 0) AS n FROM stat_credit_daily WHERE account_id = ? AND kst_date >= ? AND kst_date <= ? AND mode IN (${qs(q.modes.length)})`, accountId, r.from, r.to, ...q.modes) / 60);
    case "ride":
      return one(`SELECT COALESCE(SUM(qty), 0) AS n FROM econ_events WHERE account_id = ? AND kind = 'ride' AND kst_date >= ? AND kst_date <= ? AND mode IN (${qs(q.modes.length)})`, accountId, r.from, r.to, ...q.modes);
    case "ride_modes":
      return one("SELECT COUNT(DISTINCT mode) AS n FROM econ_events WHERE account_id = ? AND kind = 'ride' AND qty > 0 AND kst_date >= ? AND kst_date <= ?", accountId, r.from, r.to);
    case "daily_claims":
      return one("SELECT COUNT(*) AS n FROM quest_claims WHERE account_id = ? AND cadence = 'daily' AND quest_id <> ? AND created_at >= ? AND created_at < ?", accountId, QUESTS.daily.bonus.id, r.start, r.end);
    case "weekly_claims":
      return one("SELECT COUNT(*) AS n FROM quest_claims WHERE account_id = ? AND cadence = 'weekly' AND created_at >= ? AND created_at < ?", accountId, r.start, r.end);
    case "daily_all":
      if (!assigned?.length) return 0;
      return one(`SELECT COUNT(*) AS n FROM quest_claims WHERE account_id = ? AND period = ? AND quest_id IN (${qs(assigned.length)})`, accountId, r.key, ...assigned);
    case "photo_spots":
      return one(`SELECT COUNT(DISTINCT CAST(x / ${PHOTO_SPOT_M} AS INTEGER) || ':' || CAST(z / ${PHOTO_SPOT_M} AS INTEGER)) AS n FROM photo_point_log WHERE account_id = ? AND kst_date >= ? AND kst_date <= ? AND x IS NOT NULL AND z IS NOT NULL`, accountId, r.from, r.to);
    default:
      return 0;
  }
}

function questDefs(cadence, assigned) {
  if (cadence === "daily") return [...assigned.map((id) => DAILY_BY_ID.get(id)), { ...QUESTS.daily.bonus, bonus: true }];
  return QUESTS[cadence] || [];
}

async function questStates(db, accountId, cadence, now) {
  const P = kstPeriods(now);
  const r = rangeOf(cadence, P);
  const assigned = cadence === "daily" ? await dailyAssignment(db, accountId, r.key, now) : [];
  const defs = questDefs(cadence, assigned);
  const { results: claims } = await db.prepare("SELECT quest_id, amount FROM quest_claims WHERE account_id = ? AND period = ?").bind(accountId, r.key).all();
  const claimed = new Map((claims || []).map((c) => [c.quest_id, Number(c.amount)]));
  const values = await Promise.all(defs.map((q) => metricValue(db, accountId, q, r, assigned)));
  return { r, assigned, list: defs.map((q, i) => ({ q, cadence, value: values[i], claimed: claimed.has(q.id), claimedAmount: claimed.get(q.id) ?? null })) };
}

function questView({ q, cadence, value, claimed, claimedAmount }) {
  const state = claimed ? "claimed" : value >= q.target ? "complete" : "active";
  const v = { id: q.id, period: cadence, title: q.title, progress: { value: Math.min(value, q.target), target: q.target, unit: q.unit },
    reward: { bum: q.reward, karma: q.karma ? { axis: q.karma[0], points: q.karma[1] } : null }, state, bonus: !!q.bonus, autoClaim: true };
  if (claimed && claimedAmount != null && claimedAmount !== q.reward) v.paidBum = claimedAmount; // 상한에 걸려 덜 들어간 경우만
  return v;
}

export async function listQuests(db, env, accountId, cadence, now = Date.now()) {
  if (!QUESTS[cadence]) cadence = "daily";
  const { r, list } = await questStates(db, accountId, cadence, now);
  const quests = list.map(questView);
  const tv = await travelToday(db, accountId, now);
  const info = cadence === "daily"
    ? T(`매일 00:00 KST에 3개 배정 · 오늘 이동 ${tv.minutes}/60분 (정산 예정 ${fmt(tv.pendingBum)} bum · 하루 상한 ${fmt(tv.ratePerMin * MOVE.dailyMinutes)})`, `3 assigned daily at 00:00 KST · travel today ${tv.minutes}/60 min (pending ${fmt(tv.pendingBum)} bum · daily cap ${fmt(tv.ratePerMin * MOVE.dailyMinutes)})`)
    : cadence === "weekly"
      ? T(`월요일 00:00 KST 리셋 · 이번 주 이동 ${tv.weekMinutes}/300분 (주 상한 ${fmt(tv.ratePerMin * MOVE.weeklyMinutes)} bum)`, `Resets Monday 00:00 KST · travel this week ${tv.weekMinutes}/300 min (weekly cap ${fmt(tv.ratePerMin * MOVE.weeklyMinutes)} bum)`)
      : T("매월 1일 00:00 KST 리셋 (월 단위 KST 집계)", "Resets on the 1st at 00:00 KST");
  return {
    guest: false, period: cadence, resetsAt: r.resetsAt, quests,
    maxBum: quests.reduce((a, q) => a + q.reward.bum, 0),
    claimedBum: list.filter((x) => x.claimed).reduce((a, x) => a + (x.claimedAmount ?? x.q.reward), 0),
    info,
  };
}
export const GUEST_QUESTS = (cadence, now = Date.now()) => ({
  guest: true, period: cadence, resetsAt: rangeOf(QUESTS[cadence] ? cadence : "daily", kstPeriods(now)).resetsAt, quests: [], maxBum: 0, claimedBum: 0,
  info: T("구글 계정을 연동하면 할 일과 보상이 열려요", "Link a Google account to unlock quests and rewards"),
});

/** 퀘스트 받기 기록 + 지급(상한 적용). 상한에 걸려 0이어도 '받음'으로 기록(그 기간 퀘스트는 다시 못 받음). */
async function grantQuest(db, accountId, x, periodKey, now) {
  const { q, cadence } = x;
  const key = `quest:${accountId}:${q.id}:${periodKey}`;
  const claimSql = (amountExpr) => db.prepare(
    `INSERT INTO quest_claims (account_id, quest_id, period, cadence, amount, karma_axis, karma_points, created_at)
     VALUES (?, ?, ?, ?, ${amountExpr}, ?, ?, ?) ON CONFLICT(account_id, quest_id, period) DO NOTHING`,
  );
  const karma = q.karma || [null, 0];
  const r = await grantCapped(db, {
    accountId, reason: "quest", amount: q.reward, key, ref: `${q.id}@${periodKey}`, now,
    extraWhere: { sql: "NOT EXISTS (SELECT 1 FROM quest_claims WHERE account_id = ? AND quest_id = ? AND period = ?)", params: [accountId, q.id, periodKey] },
    after: [claimSql("COALESCE((SELECT amount FROM ledger WHERE idempotency_key = ?), 0)").bind(accountId, q.id, periodKey, cadence, key, karma[0], karma[1], now)],
  });
  if (!r.applied && !r.already) {
    // 상한 0(또는 경합으로 원장 행이 안 들어감) — 받기만 기록
    const res = await claimSql("0").bind(accountId, q.id, periodKey, cadence, karma[0], karma[1], now).run();
    if (!Number(res?.meta?.changes || 0)) return null;
  } else if (r.already) return null;
  return { questId: q.id, period: cadence, amount: r.amount, capped: r.capped, karma: q.karma ? { axis: q.karma[0], points: q.karma[1] } : null, title: q.title };
}

/** 완료됐는데 안 받은 퀘스트·업적을 모두 자동 지급. 보너스·주간 집계가 연쇄되므로 두 번 돈다. */
export async function autoSettle(db, env, accountId, now = Date.now()) {
  const out = [];
  for (let pass = 0; pass < 2; pass++) {
    let any = false;
    for (const cadence of ["daily", "weekly", "monthly"]) {
      const { r, list } = await questStates(db, accountId, cadence, now);
      for (const x of list) {
        if (x.claimed || x.value < x.q.target) continue;
        const g = await grantQuest(db, accountId, x, r.key, now);
        if (g) { out.push({ kind: "quest", ...g }); any = true; }
      }
    }
    if (!any) break;
  }
  out.push(...(await autoSettleAchievements(db, accountId, now)));
  return out;
}

export async function claimQuest(db, env, accountId, questId, now = Date.now()) {
  for (const cadence of ["daily", "weekly", "monthly"]) {
    const { r, list } = await questStates(db, accountId, cadence, now);
    const x = list.find((y) => y.q.id === questId);
    if (!x) continue;
    if (x.claimed) return err("already_claimed");
    if (x.value < x.q.target) return err("not_complete", { value: x.value, target: x.q.target });
    const g = await grantQuest(db, accountId, x, r.key, now);
    if (!g) return err("already_claimed");
    const after = await questStates(db, accountId, cadence, now);
    return ok({ quest: questView(after.list.find((y) => y.q.id === questId)), grant: g });
  }
  return err("unknown");
}

// ───────────────────────── 카르마 · 업적 ─────────────────────────
function streakFrom(dates, today, yday) {
  const set = new Set(dates);
  let d = set.has(today) ? today : set.has(yday) ? yday : null;
  let n = 0;
  while (d && set.has(d)) {
    n++;
    d = new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  }
  return n;
}

export async function karmaTotals(db, accountId, now = Date.now()) {
  const [human, walk, rides, photos, boards, days, recent, qk] = await db.batch([
    db.prepare(`SELECT COALESCE(SUM(credited_sec), 0) AS n FROM stat_credit_daily WHERE account_id = ? AND mode IN (${qs(HUMAN_MODES.length)})`).bind(accountId, ...HUMAN_MODES),
    db.prepare("SELECT COALESCE(SUM(distance_m), 0) AS n FROM stat_mode_totals WHERE account_id = ? AND mode = 'walk'").bind(accountId),
    db.prepare("SELECT COALESCE(SUM(qty), 0) AS n FROM econ_events WHERE account_id = ? AND kind = 'ride'").bind(accountId),
    db.prepare("SELECT COUNT(*) AS n FROM photo_point_log WHERE account_id = ?").bind(accountId),
    db.prepare("SELECT COUNT(*) AS n FROM board_rewards WHERE account_id = ? AND status = 'paid'").bind(accountId),
    db.prepare("SELECT COUNT(*) AS n FROM login_days WHERE account_id = ?").bind(accountId),
    db.prepare("SELECT kst_date FROM login_days WHERE account_id = ? ORDER BY kst_date DESC LIMIT 400").bind(accountId),
    db.prepare("SELECT karma_axis AS axis, COALESCE(SUM(karma_points), 0) AS n FROM quest_claims WHERE account_id = ? AND karma_axis IS NOT NULL GROUP BY karma_axis").bind(accountId),
  ]);
  const n = (r) => Number(r.results?.[0]?.n || 0);
  const questKarma = Object.fromEntries(KARMA_AXES.map((a) => [a, 0]));
  for (const row of qk.results || []) if (row.axis in questKarma) questKarma[row.axis] = Number(row.n || 0);
  return {
    humanMin: Math.floor(n(human) / 60), walkKm: Math.floor(n(walk) / 1000), rides: n(rides), photos: n(photos), boards: n(boards),
    loginDays: n(days), streakDays: streakFrom((recent.results || []).map((r) => r.kst_date), kstDate(now), kstDate(now - 86400000)), questKarma,
  };
}

const ACH_VALUE = { walk_km_total: (t) => t.walkKm, streak_days: (t) => t.streakDays, ride_total: (t) => t.rides, photo_total: (t) => t.photos, board_total: (t) => t.boards };

export async function autoSettleAchievements(db, accountId, now = Date.now()) {
  const t = await karmaTotals(db, accountId, now);
  const { results } = await db.prepare("SELECT ach_id FROM ach_claims WHERE account_id = ?").bind(accountId).all();
  const done = new Set((results || []).map((r) => r.ach_id));
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (done.has(a.id) || (ACH_VALUE[a.metric]?.(t) || 0) < a.threshold) continue;
    const key = `ach:${accountId}:${a.id}`;
    // 업적은 영구라 상한에 걸리면 기록하지 않고 다음에 다시 시도한다
    const r = await grantCapped(db, {
      accountId, reason: "ach", amount: a.reward, key, ref: a.id, now,
      after: [db.prepare("INSERT INTO ach_claims (account_id, ach_id, amount, created_at) SELECT ?, ?, amount, ? FROM ledger WHERE idempotency_key = ? ON CONFLICT(account_id, ach_id) DO NOTHING").bind(accountId, a.id, now, key)],
    });
    if (r.applied) out.push({ kind: "achievement", achId: a.id, amount: r.amount, capped: r.capped, karma: null, title: a.title });
  }
  return out;
}

export async function getKarma(db, accountId, now = Date.now()) {
  const t = await karmaTotals(db, accountId, now);
  const pts = {
    health: t.humanMin, // 퀘스트의 건강 카르마는 표시만(plan §5 * — 인정 분과 중복 아님)
    explore: t.photos + t.questKarma.explore,
    transit: t.rides * 5 + t.questKarma.transit,
    neighbor: t.questKarma.neighbor, // 계정 간 근접 판정 전까지 퀘스트 카르마만
    streak: t.loginDays + t.questKarma.streak,
  };
  const axes = {};
  const ladders = [];
  for (const [axis, steps] of LADDERS) {
    const val = axis === "streak" ? t.streakDays : pts[axis];
    const got = steps.filter(([, at]) => val >= at);
    const nxt = steps.find(([, at]) => val < at);
    axes[axis] = { points: pts[axis], title: got.length ? got[got.length - 1][0] : null, next: nxt ? { title: nxt[0], at: nxt[1] } : null, ...(axis === "streak" ? { days: t.streakDays } : {}) };
    ladders.push({ axis, steps: steps.map(([title, at]) => ({ title, at, unlocked: val >= at })) });
  }
  const { results } = await db.prepare("SELECT ach_id FROM ach_claims WHERE account_id = ?").bind(accountId).all();
  const done = new Set((results || []).map((r) => r.ach_id));
  const achievements = ACHIEVEMENTS.map((a) => {
    const v = ACH_VALUE[a.metric]?.(t) || 0;
    return { id: a.id, title: a.title, rule: a.rule, bonus: a.reward, state: done.has(a.id) ? "unlocked" : "progress", progress: { value: Math.min(v, a.threshold), target: a.threshold, unit: a.unit } };
  });
  const featured = ["health", "transit", "explore", "neighbor", "streak"].map((a) => axes[a].title).find(Boolean) || null;
  return { guest: false, total: KARMA_AXES.reduce((a, x) => a + axes[x].points, 0), featured, axes, achievements, ladders, asOf: null };
}
export function guestKarma() {
  const axes = {};
  const ladders = [];
  for (const [axis, steps] of LADDERS) {
    axes[axis] = { points: 0, title: null, next: { title: steps[0][0], at: steps[0][1] }, ...(axis === "streak" ? { days: 0 } : {}) };
    ladders.push({ axis, steps: steps.map(([title, at]) => ({ title, at, unlocked: false })) });
  }
  const achievements = ACHIEVEMENTS.map((a) => ({ id: a.id, title: a.title, rule: a.rule, bonus: a.reward, state: "locked", progress: null }));
  return { guest: true, total: 0, featured: null, axes, achievements, ladders, asOf: null };
}

// ───────────────────────── 교통 요금 ─────────────────────────
export function resolveFareCode(code) {
  const c = FARE_ALIASES[code] || code;
  return FARES[c] ? c : null;
}
export function isNightKst(now = Date.now()) {
  const h = new Date(now + 9 * 3600000).getUTCHours();
  return h >= TAXI.nightFromHour || h < TAXI.nightToHour;
}
/** 4,800(1.6 km) + 131 m 마다 100(올림), 심야 ×1.3, taxi.instant ×1.5 — mock taxiFare 와 같은 반올림 */
export function taxiFare(meters, { night = false, factor = 1 } = {}) {
  const m = Math.max(0, Math.min(TAXI.maxM, Number(meters) || 0));
  let f = TAXI.base + Math.max(0, Math.ceil((m - TAXI.baseM) / TAXI.stepM)) * TAXI.stepFare;
  if (night) f = Math.round(f * TAXI.nightFactor);
  return Math.round(f * factor);
}
export function listFare(code, { meters = 0, night = false } = {}) {
  const c = resolveFareCode(code);
  if (!c) return null;
  const f = FARES[c];
  return { code: c, mode: f.mode, label: f.label, listAmount: f.meter ? taxiFare(meters, { night, factor: f.factor || 1 }) : f.amount };
}

const RIDE_ID_RE = /^[\w.:@-]{1,80}$/;

async function rideQty(db, env, accountId, now) {
  const L = rideLimits(env);
  const last = await db.prepare("SELECT created_at FROM econ_events WHERE account_id = ? AND kind = 'ride' AND qty > 0 ORDER BY id DESC LIMIT 1").bind(accountId).first();
  if (last && now - Number(last.created_at) < L.minGapSec * 1000) return 0;
  const today = await db.prepare("SELECT COALESCE(SUM(qty), 0) AS n FROM econ_events WHERE account_id = ? AND kind = 'ride' AND kst_date = ?").bind(accountId, kstDate(now)).first();
  return Number(today?.n || 0) >= L.dailyCounted ? 0 : 1;
}

function rideEventStmt(db, { accountId, mode, ref, qty, listed, charged, key, now, requireLedgerKey = null }) {
  return db.prepare(
    `INSERT INTO econ_events (account_id, kind, mode, ref, qty, listed_amount, charged_amount, kst_date, idempotency_key, created_at)
     SELECT ?, 'ride', ?, ?, ?, ?, ?, ?, ?, ? ${requireLedgerKey ? "WHERE EXISTS (SELECT 1 FROM ledger WHERE idempotency_key = ?)" : "WHERE 1"}
     ON CONFLICT(idempotency_key) DO NOTHING`,
  ).bind(accountId, mode, ref, qty, listed, charged, kstDate(now), key, now, ...(requireLedgerKey ? [requireLedgerKey] : []));
}

async function insufficient(db, accountId, need, now) {
  const b = await balanceView(db, accountId, now);
  if (b.locked) return err("spend_locked", { balance: b.total });
  return err("insufficient_balance", { need, balance: b.total, shortBy: need - b.total, message: T(`잔액 ${fmt(need - b.total)} bum 부족`, `${fmt(need - b.total)} bum short`) });
}

async function spendable(db, accountId, now) {
  return Number((await db.prepare(`SELECT ${SPENDABLE_SQL} AS n`).bind(...spendableParams(accountId, now)).first())?.n || 0);
}

/** 버스·지하철 결제. 멱등키 fare:{acc}:{rideId} — 같은 rideId 는 첫 영수증을 그대로 돌려준다. */
export async function payFare(db, env, accountId, { code, rideId, meta } = {}, now = Date.now()) {
  const lf = listFare(code);
  if (!lf || lf.mode === "taxi") return err("unknown");
  if (!RIDE_ID_RE.test(String(rideId || ""))) return err("unknown", { message: T("rideId 가 필요해요", "rideId is required") });
  const key = `fare:${accountId}:${rideId}`;
  const prev = await db.prepare("SELECT id, mode, ref, listed_amount, charged_amount FROM econ_events WHERE idempotency_key = ?").bind(key).first();
  if (prev) return ok({ receipt: receiptOf(prev, lf), rewards: [], replay: true });
  const paid = econPaid(env);
  const qty = await rideQty(db, env, accountId, now);
  const ref = lf.code;
  if (!paid || lf.listAmount <= 0) {
    await rideEventStmt(db, { accountId, mode: lf.mode, ref, qty, listed: lf.listAmount, charged: 0, key, now }).run();
  } else {
    const sp = await spendable(db, accountId, now);
    if (sp < 0 || sp < lf.listAmount) return insufficient(db, accountId, lf.listAmount, now);
    const r = await appendLedgerWhere(
      db,
      { accountId, amount: -lf.listAmount, kind: "free", reason: "fare", ref: `${lf.code}${meta?.where ? `|${String(meta.where).slice(0, 40)}` : ""}`, idempotencyKey: key, priceTableVersion: V },
      { now, where: { sql: `${SPENDABLE_SQL} >= ?`, params: [...spendableParams(accountId, now), lf.listAmount] },
        after: [rideEventStmt(db, { accountId, mode: lf.mode, ref, qty, listed: lf.listAmount, charged: lf.listAmount, key, now, requireLedgerKey: key })] },
    );
    if (!r.applied) {
      const again = await db.prepare("SELECT id, mode, ref, listed_amount, charged_amount FROM econ_events WHERE idempotency_key = ?").bind(key).first();
      if (again) return ok({ receipt: receiptOf(again, lf), rewards: [], replay: true });
      return insufficient(db, accountId, lf.listAmount, now);
    }
  }
  const ev = await db.prepare("SELECT id, mode, ref, listed_amount, charged_amount FROM econ_events WHERE idempotency_key = ?").bind(key).first();
  const rewards = featureOn(env, "quests") ? await autoSettle(db, env, accountId, now) : [];
  return ok({ receipt: receiptOf(ev, lf), rewards });
}

function receiptOf(ev, lf) {
  const charged = Number(ev?.charged_amount || 0);
  return { receiptId: `r${ev?.id}`, mode: ev?.mode || lf.mode, code: ev?.ref || lf.code, free: charged === 0, amount: charged, listAmount: Number(ev?.listed_amount ?? lf.listAmount) };
}

/** 택시 홀드: 예상 요금(정가)을 잡아 둔다. 무료 모드는 0원 홀드(기록만). 같은 rideId 면 같은 홀드. */
export async function holdTaxi(db, env, accountId, { code, estimateMeters, rideId } = {}, now = Date.now()) {
  const night = isNightKst(now);
  const lf = listFare(code || "taxi.drive", { meters: estimateMeters, night });
  if (!lf || lf.mode !== "taxi") return err("unknown");
  if (!RIDE_ID_RE.test(String(rideId || ""))) return err("unknown");
  const prev = await db.prepare("SELECT * FROM taxi_holds WHERE account_id = ? AND ride_id = ?").bind(accountId, String(rideId)).first();
  if (prev) return prev.status === "held" && Number(prev.expires_at) > now ? ok({ hold: holdOf(prev) }) : err("hold_not_found");
  const paid = econPaid(env);
  const held = paid ? lf.listAmount : 0;
  const holdId = `h-${crypto.randomUUID()}`;
  const ins = await db.prepare(
    `INSERT INTO taxi_holds (hold_id, account_id, ride_id, code, held, list_amount, free, night, status, created_at, expires_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'held', ?, ? WHERE ${held > 0 ? `${SPENDABLE_SQL} >= ?` : "1"}
     ON CONFLICT(account_id, ride_id) DO NOTHING`,
  ).bind(holdId, accountId, String(rideId), lf.code, held, lf.listAmount, paid ? 0 : 1, night ? 1 : 0, now, now + TAXI.holdTtlSec * 1000,
    ...(held > 0 ? [...spendableParams(accountId, now), held] : [])).run();
  if (!Number(ins?.meta?.changes || 0)) {
    const again = await db.prepare("SELECT * FROM taxi_holds WHERE account_id = ? AND ride_id = ?").bind(accountId, String(rideId)).first();
    if (again) return ok({ hold: holdOf(again) });
    return insufficient(db, accountId, held, now);
  }
  return ok({ hold: holdOf(await db.prepare("SELECT * FROM taxi_holds WHERE hold_id = ?").bind(holdId).first()) });
}
function holdOf(h) {
  return { holdId: h.hold_id, free: !!h.free, amount: Number(h.held), listAmount: Number(h.list_amount), code: h.code };
}

/** 하차: 실제 요금(≤ 홀드 정가) 1줄만 원장에 쓰고 홀드를 푼다. 이미 정산된 홀드면 같은 영수증. */
export async function settleTaxi(db, env, accountId, { holdId, actualMeters } = {}, now = Date.now()) {
  const h = await db.prepare("SELECT * FROM taxi_holds WHERE hold_id = ? AND account_id = ?").bind(String(holdId || ""), accountId).first();
  if (!h) return err("hold_not_found");
  if (h.status === "settled") return ok({ settlement: settlementOf(h), rewards: [], replay: true });
  if (h.status !== "held" || Number(h.expires_at) <= now) return err("hold_not_found");
  const f = FARES[h.code];
  const actualList = Math.min(Number(h.list_amount), taxiFare(actualMeters, { night: !!h.night, factor: f?.factor || 1 }));
  const dist = Math.round(Math.max(0, Math.min(TAXI.maxM, Number(actualMeters) || 0)));
  const charged = h.free ? 0 : actualList;
  const qty = await rideQty(db, env, accountId, now);
  const evKey = `ride:taxi:${h.hold_id}`;
  const upd = db.prepare("UPDATE taxi_holds SET status = 'settled', charged = ?, distance_m = ? WHERE hold_id = ? AND status = 'held'");
  if (charged > 0) {
    const key = `taxi:${h.hold_id}`;
    const r = await appendLedgerWhere(
      db,
      { accountId, amount: -charged, kind: "free", reason: "fare", ref: `${h.code}|${(dist / 1000).toFixed(1)}km|held:${h.held}`, idempotencyKey: key, priceTableVersion: V },
      { now, where: { sql: "EXISTS (SELECT 1 FROM taxi_holds WHERE hold_id = ? AND status = 'held')", params: [h.hold_id] },
        after: [
          db.prepare("UPDATE taxi_holds SET status = 'settled', charged = ?, distance_m = ? WHERE hold_id = ? AND status = 'held' AND EXISTS (SELECT 1 FROM ledger WHERE idempotency_key = ?)").bind(charged, dist, h.hold_id, key),
          rideEventStmt(db, { accountId, mode: "taxi", ref: h.code, qty, listed: actualList, charged, key: evKey, now, requireLedgerKey: key }),
        ] },
    );
    if (!r.applied) return settleTaxi(db, env, accountId, { holdId, actualMeters }, now); // 경합: 다시 읽어서 영수증/만료
  } else {
    const res = await db.batch([
      upd.bind(0, dist, h.hold_id),
      rideEventStmt(db, { accountId, mode: "taxi", ref: h.code, qty, listed: actualList, charged: 0, key: evKey, now }),
    ]);
    if (!Number(res[0]?.meta?.changes || 0)) return settleTaxi(db, env, accountId, { holdId, actualMeters }, now);
  }
  const done = await db.prepare("SELECT * FROM taxi_holds WHERE hold_id = ?").bind(h.hold_id).first();
  const ev = await db.prepare("SELECT listed_amount FROM econ_events WHERE idempotency_key = ?").bind(evKey).first();
  const rewards = featureOn(env, "quests") ? await autoSettle(db, env, accountId, now) : [];
  return ok({ settlement: settlementOf(done, Number(ev?.listed_amount ?? actualList)), rewards });
}
function settlementOf(h, listAmount = null) {
  const charged = Number(h.charged || 0);
  const held = Number(h.held || 0);
  return {
    receiptId: `t${String(h.hold_id).slice(2, 14)}`, mode: "taxi", code: h.code, free: !!h.free, held, charged,
    listAmount: listAmount ?? (h.free ? Number(h.list_amount) : charged), refunded: Math.max(0, held - charged), distanceM: Number(h.distance_m || 0),
  };
}

export async function cancelTaxi(db, accountId, holdId, now = Date.now()) {
  const r = await db.prepare("UPDATE taxi_holds SET status = 'cancelled' WHERE hold_id = ? AND account_id = ? AND status = 'held' AND expires_at > ?").bind(String(holdId || ""), accountId, now).run();
  if (!Number(r?.meta?.changes || 0)) return err("hold_not_found");
  const h = await db.prepare("SELECT held FROM taxi_holds WHERE hold_id = ?").bind(String(holdId)).first();
  return ok({ released: Number(h?.held || 0) });
}

// ───────────────────────── 상점 ─────────────────────────
export async function ownedItems(db, accountId) {
  if (!accountId) return new Set();
  const { results } = await db.prepare("SELECT item_id FROM account_vehicles WHERE account_id = ? AND (expires_at IS NULL OR expires_at > ?)").bind(accountId, Date.now()).all();
  return new Set((results || []).map((r) => r.item_id));
}

/** Room 이 hello 때 부른다: 산 탈것 → 선물함 보유 모양 [{ itemId, qty }] (게임 모델이 있는 것만) */
export async function accountVehicleGifts(db, accountId) {
  const { results } = await db.prepare("SELECT gift_id FROM account_vehicles WHERE account_id = ? AND gift_id IS NOT NULL AND (expires_at IS NULL OR expires_at > ?)").bind(accountId, Date.now()).all();
  // normalizeHoldings(src/gifts/catalog.js)가 읽는 모양 { id, qty } — itemId 로 주면 전부 걸러져 산 탈것이 안 보였다
  return (results || []).map((r) => ({ id: r.gift_id, qty: 1 }));
}

function itemView(it, { owned }) {
  // 미리보기: 기획 가격 그대로(0원 아님), 살 수 없음
  const soon = SHOP_PREVIEW_ONLY || !it.available;
  return {
    id: it.id, name: it.name, free: false, price: it.price, listPrice: it.price, realPrice: it.realPrice, daysForTypical: it.days,
    owned, affordable: false, giftable: false, available: false, comingSoon: soon, status: soon ? "coming_soon" : "available",
    statusText: soon ? T("준비중", "Coming soon") : null,
  };
}

export async function listShop(db, env, accountId, now = Date.now()) {
  const owned = await ownedItems(db, accountId);
  return SHOP.map((it) => itemView(it, { owned: owned.has(it.id) }));
}

export async function shopGoal(db, env, accountId, now = Date.now()) {
  const owned = await ownedItems(db, accountId);
  const it = SHOP.find((x) => !owned.has(x.id));
  if (!it) return null;
  const b = Math.max(0, (await balanceView(db, accountId, now)).total);
  const remaining = Math.max(0, it.price - b);
  return { guest: false, itemId: it.id, price: it.price, balance: b, remaining, daysLeft: Math.ceil(remaining / DISPLAY.typicalDailyNet), typicalDailyNet: DISPLAY.typicalDailyNet, comingSoon: true };
}

const COMING_SOON = () => err("not_eligible", { reason: "coming_soon", message: T("탈것 상점은 준비중이에요", "The vehicle shop is coming soon") });

/** 구매 — 지금은 미리보기 전용이라 무료·유료 모드 모두 거절하고 아무것도 쓰지 않는다(SHOP_PREVIEW_ONLY).
 *  아래(계정당 1개, 멱등키 shop:{acc}:{itemId}, 유료 차감)는 상점을 다시 열 때를 위해 남겨 둔다 — 다시 열 때 무료(0원) 지급 경로는 빼야 함. */
export async function purchase(db, env, accountId, itemId, now = Date.now()) {
  const it = SHOP.find((x) => x.id === itemId);
  if (!it) return err("unknown");
  if (SHOP_PREVIEW_ONLY || !it.available) return COMING_SOON();
  const owned = await ownedItems(db, accountId);
  if (owned.has(it.id)) return err("already_claimed");
  const paid = econPaid(env);
  const key = `shop:${accountId}:${it.id}`;
  const ins = (price, requireKey) => db.prepare(
    `INSERT INTO account_vehicles (account_id, item_id, gift_id, source, price, listed_price, bound, acquired_at)
     SELECT ?, ?, ?, 'shop', ?, ?, 1, ? ${requireKey ? "WHERE EXISTS (SELECT 1 FROM ledger WHERE idempotency_key = ?)" : "WHERE 1"}
     ON CONFLICT(account_id, item_id) DO NOTHING`,
  ).bind(accountId, it.id, it.giftId, price, it.price, now, ...(requireKey ? [requireKey] : []));
  const ev = (charged, requireKey) => db.prepare(
    `INSERT INTO econ_events (account_id, kind, mode, ref, qty, listed_amount, charged_amount, kst_date, idempotency_key, created_at)
     SELECT ?, 'shop', NULL, ?, 1, ?, ?, ?, ?, ? ${requireKey ? "WHERE EXISTS (SELECT 1 FROM ledger WHERE idempotency_key = ?)" : "WHERE 1"}
     ON CONFLICT(idempotency_key) DO NOTHING`,
  ).bind(accountId, it.id, it.price, charged, kstDate(now), key, now, ...(requireKey ? [requireKey] : []));
  if (!paid) {
    const res = await db.batch([ins(0, null), ev(0, null)]);
    if (!Number(res[0]?.meta?.changes || 0)) return err("already_claimed");
  } else {
    const sp = await spendable(db, accountId, now);
    if (sp < 0 || sp < it.price) return insufficient(db, accountId, it.price, now);
    const r = await appendLedgerWhere(
      db,
      { accountId, amount: -it.price, kind: "free", reason: "shop", ref: it.id, idempotencyKey: key, priceTableVersion: V },
      { now, where: { sql: `${SPENDABLE_SQL} >= ? AND NOT EXISTS (SELECT 1 FROM account_vehicles WHERE account_id = ? AND item_id = ?)`, params: [...spendableParams(accountId, now), it.price, accountId, it.id] },
        after: [ins(it.price, key), ev(it.price, key)] },
    );
    if (!r.applied) {
      if ((await ownedItems(db, accountId)).has(it.id)) return err("already_claimed");
      return insufficient(db, accountId, it.price, now);
    }
  }
  const balance = await balanceView(db, accountId, now);
  return ok({ item: itemView(it, { owned: true }), free: !paid, amount: paid ? it.price : 0, listAmount: it.price, balance });
}

// ───────────────────────── 게시판 보상 ─────────────────────────
export function boardTextLen(text) {
  const s = String(text || "").normalize("NFC").replace(/\s+/gu, "").replace(/(.)\1{2,}/gu, "$1");
  return [...s].length;
}
async function textHash(text) {
  const norm = String(text || "").normalize("NFC").toLowerCase().replace(/\s+/gu, "");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 새 글(또는 아직 보상 안 받은 글의 수정) → 조건을 모두 통과하면 1회 보상.
 * @returns {Promise<{rewarded:boolean, amount?:number, reason?:string}>}
 */
export async function rewardBoardPost(db, env, account, post, now = Date.now()) {
  const accountId = account?.id;
  const postId = Math.floor(Number(post?.id) || 0);
  if (!accountId || !postId) return { rewarded: false, reason: "no_account" };
  if (post?.category === "notice") return { rewarded: false, reason: "notice" };
  const had = await db.prepare("SELECT status FROM board_rewards WHERE post_id = ?").bind(postId).first();
  if (had) return { rewarded: false, reason: "already" };
  if (now - Number(account.created_at || now) < BOARD.accountMinAgeHours * 3600000) return { rewarded: false, reason: "account_too_new" };
  if (boardTextLen(post.body) < BOARD.minChars) return { rewarded: false, reason: "too_short" };
  const hash = await textHash(`${post.title || ""}\n${post.body || ""}`);
  const dup = await db.prepare("SELECT 1 AS n FROM board_rewards WHERE account_id = ? AND body_hash = ?").bind(accountId, hash).first();
  if (dup) return { rewarded: false, reason: "duplicate" };
  const P = kstPeriods(now);
  // 하루 1번: 오늘 이미 보상한 글이 있으면(회수된 글 포함) 이 글은 그냥 글
  const today = await db.prepare("SELECT COUNT(*) AS n FROM board_rewards WHERE account_id = ? AND created_at >= ? AND created_at < ?").bind(accountId, P.day.start, P.day.end).first();
  if (Number(today?.n || 0) >= BOARD.dailyRewards) return { rewarded: false, reason: "daily_limit" };
  const key = `board:${accountId}:${P.day.key}`; // 동시에 두 글이 와도 원장 키가 하루 1행만 허용
  const r = await grantCapped(db, {
    accountId, reason: "board", amount: BOARD.reward, key, ref: String(postId), now,
    after: [db.prepare(
      `INSERT INTO board_rewards (post_id, account_id, amount, body_hash, status, created_at, updated_at)
       SELECT ?, ?, amount, ?, 'paid', ?, ? FROM ledger WHERE idempotency_key = ? AND ref = ? ON CONFLICT(post_id) DO NOTHING`,
    ).bind(postId, accountId, hash, now, now, key, String(postId))],
  });
  if (!r.applied) return { rewarded: false, reason: "daily_limit" };
  return { rewarded: true, amount: r.amount };
}

/** 보상 받은 글을 지우거나 기준 미만으로 고치면 회수(음수 행, reason=board — 상한 합계에서도 빠짐) */
export async function clawbackBoardPost(db, accountId, postId, why = "deleted", now = Date.now()) {
  const id = Math.floor(Number(postId) || 0);
  const row = await db.prepare("SELECT account_id, amount FROM board_rewards WHERE post_id = ? AND status = 'paid'").bind(id).first();
  if (!row || row.account_id !== accountId || !(Number(row.amount) > 0)) return { clawed: false };
  const key = `board-clawback:${id}`;
  const r = await appendLedgerWhere(
    db,
    { accountId, amount: -Number(row.amount), kind: "free", reason: "board", ref: `${id}:${why}`, idempotencyKey: key, priceTableVersion: V },
    { now, where: { sql: "EXISTS (SELECT 1 FROM board_rewards WHERE post_id = ? AND status = 'paid')", params: [id] },
      after: [db.prepare("UPDATE board_rewards SET status = 'clawed', updated_at = ? WHERE post_id = ? AND EXISTS (SELECT 1 FROM ledger WHERE idempotency_key = ?)").bind(now, id, key)] },
  );
  return { clawed: r.applied, amount: r.applied ? Number(row.amount) : 0 };
}

export async function onBoardUpdate(db, env, account, post, now = Date.now()) {
  const had = await db.prepare("SELECT status FROM board_rewards WHERE post_id = ?").bind(Math.floor(Number(post?.id) || 0)).first();
  if (!had) return rewardBoardPost(db, env, account, post, now);
  if (had.status === "paid" && boardTextLen(post?.body) < BOARD.minChars) return { ...(await clawbackBoardPost(db, account.id, post.id, "too_short", now)), rewarded: false };
  return { rewarded: false, reason: "already" };
}

// ───────────────────────── 웰컴 · 원장 보기 · 요약 ─────────────────────────
export async function welcomeState(db, env, accountId, now = Date.now()) {
  const { results } = await db.prepare("SELECT reason, amount FROM ledger WHERE account_id = ? AND reason IN ('welcome', 'beta')").bind(accountId).all();
  const got = new Map((results || []).map((r) => [r.reason, Number(r.amount)]));
  const grants = [{ kind: "welcome", amount: got.get("welcome") ?? WELCOME_FREE_BUM, ...WELCOME_TEXT.welcome }];
  const openAt = economyOpenAt(env);
  const betaOpen = openAt && now <= openAt + BETA_WINDOW_DAYS * 86400000;
  if (got.has("beta") || betaOpen) grants.push({ kind: "beta", amount: got.get("beta") ?? BETA_FREE_BUM, ...WELCOME_TEXT.beta });
  const claimed = got.has("welcome");
  return { guest: false, eligible: economyEnabled(env) && !claimed, claimed, grants, total: grants.reduce((a, g) => a + g.amount, 0) };
}
export const GUEST_WELCOME = () => ({
  guest: true, eligible: false, claimed: false, total: WELCOME_FREE_BUM,
  grants: [{ kind: "welcome", amount: WELCOME_FREE_BUM, ...WELCOME_TEXT.welcome }],
});

const KIND_OF_REASON = { welcome: "welcome", beta: "beta", quest: "quest", move: "move", ach: "ach", fare: "fare", shop: "purchase", refund: "refund", board: "board" };
const QUEST_ALL = new Map([...QUESTS.daily.pool, QUESTS.daily.bonus, ...QUESTS.weekly, ...QUESTS.monthly].map((q) => [q.id, q]));
const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
const SHOP_BY_ID = new Map(SHOP.map((s) => [s.id, s]));

export function ledgerTitle(row) {
  const ref = String(row.ref || "");
  switch (row.reason) {
    case "welcome": return { title: WELCOME_TEXT.welcome.title, sub: null };
    case "beta": return { title: WELCOME_TEXT.beta.title, sub: null };
    case "quest": { const q = QUEST_ALL.get(ref.split("@")[0]); return { title: T(`할 일 · ${q?.title.ko || ref}`, `Quest · ${q?.title.en || ref}`), sub: null }; }
    case "move": { const min = Number(ref.split(":")[1] || 0); return { title: T(`이동 보상 ${min}분`, `Travel reward ${min} min`), sub: T(ref.split(":")[0], ref.split(":")[0]) }; }
    case "ach": { const a = ACH_BY_ID.get(ref); return { title: T(`업적 · ${a?.title.ko || ref}`, `Achievement · ${a?.title.en || ref}`), sub: null }; }
    case "fare": {
      const [code, a, b] = ref.split("|");
      const f = FARES[code];
      if (f?.mode === "taxi") return { title: T(`택시 · ${f.label.ko} ${a || ""}`.trim(), `Taxi · ${f.label.en} ${a || ""}`.trim()), sub: b ? T(`홀드 ${fmt(Number(b.split(":")[1] || 0))} → 실제 정산`, `Held ${fmt(Number(b.split(":")[1] || 0))} → settled`) : null };
      return { title: T(`${f?.label.ko || code}${a ? ` · ${a}` : ""}`, `${f?.label.en || code}${a ? ` · ${a}` : ""}`), sub: null };
    }
    case "shop": { const s = SHOP_BY_ID.get(ref); return { title: T(`탈것 · ${s?.name.ko || ref}`, `Vehicle · ${s?.name.en || ref}`), sub: null }; }
    case "board": return row.amount < 0 ? { title: T("동네 글 보상 회수", "Board reward reversed"), sub: null } : { title: T("동네 글 보상", "Board post reward"), sub: null };
    default: return { title: T(row.reason, row.reason), sub: null };
  }
}

export function ledgerEntry(row) {
  const { title, sub } = ledgerTitle(row);
  return { id: String(row.id), at: Number(row.created_at), kind: KIND_OF_REASON[row.reason] || row.reason, delta: Number(row.amount), title, sub };
}

export async function ledgerSince(db, accountId, sinceId = 0, limit = 20) {
  const { results } = await db.prepare("SELECT id, amount, reason, ref, created_at FROM ledger WHERE account_id = ? AND id > ? ORDER BY id ASC LIMIT ?")
    .bind(accountId, Math.max(0, Math.floor(Number(sinceId) || 0)), Math.max(1, Math.min(50, limit | 0))).all();
  return (results || []);
}
export async function ledgerSinceAt(db, accountId, sinceAt, limit = 20) {
  const { results } = await db.prepare("SELECT id, amount, reason, ref, created_at FROM ledger WHERE account_id = ? AND created_at >= ? ORDER BY id ASC LIMIT ?")
    .bind(accountId, Math.floor(Number(sinceAt) || 0), Math.max(1, Math.min(50, limit | 0))).all();
  return (results || []);
}
export async function ledgerView(db, accountId, limit = 20) {
  const { results } = await db.prepare("SELECT id, amount, reason, ref, created_at FROM ledger WHERE account_id = ? ORDER BY id DESC LIMIT ?")
    .bind(accountId, Math.max(1, Math.min(100, Number(limit) | 0 || 20))).all();
  return (results || []).map(ledgerEntry);
}
export async function lastLedgerId(db, accountId) {
  return Number((await db.prepare("SELECT MAX(id) AS n FROM ledger WHERE account_id = ?").bind(accountId).first())?.n || 0);
}

/** 원장 행 → UI RewardEvent (지급 행만. 지출·회수·게시판은 null) */
// board = 게시판 글 보상(+) → 토스트. 회수(clawback, −)는 금액이 음수라 이벤트를 만들지 않는다(지갑 내역에만).
const REWARD_KIND = { quest: "quest", ach: "achievement", welcome: "welcome", beta: "beta", move: "travel", board: "board" };
export function rewardEventOf(row, balanceAfter) {
  const kind = REWARD_KIND[row.reason];
  if (!kind || !(Number(row.amount) > 0)) return null;
  const { title } = ledgerTitle(row);
  const ev = { kind, amount: Number(row.amount), karma: null, title, coins: 8, balanceAfter };
  if (row.reason === "quest") {
    const [qid, period] = String(row.ref || "").split("@");
    const q = QUEST_ALL.get(qid);
    ev.questId = qid;
    ev.period = qid.startsWith("D-") ? "daily" : qid.startsWith("W-") ? "weekly" : "monthly";
    if (q) { ev.title = q.title; ev.karma = q.karma ? { axis: q.karma[0], points: q.karma[1] } : null; }
    void period;
  }
  if (row.reason === "ach") { const a = ACH_BY_ID.get(row.ref); if (a) ev.title = a.title; }
  return ev;
}

export async function walletSummary(db, accountId, now = Date.now()) {
  const since = now - 7 * 86400000;
  const [l, rides] = await db.batch([
    db.prepare("SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS earned, COALESCE(SUM(CASE WHEN amount < 0 AND reason IN ('fare','shop') THEN -amount ELSE 0 END), 0) AS spent FROM ledger WHERE account_id = ? AND created_at >= ? AND reason NOT IN ('welcome', 'beta')").bind(accountId, since),
    db.prepare("SELECT COALESCE(SUM(listed_amount), 0) AS n FROM econ_events WHERE account_id = ? AND kind = 'ride' AND created_at >= ?").bind(accountId, since),
  ]);
  const earned = Number(l.results?.[0]?.earned || 0);
  const spent = Number(l.results?.[0]?.spent || 0);
  // 평균은 최근 7일 실제 기록(웰컴·베타 제외). 교통은 무료 모드에서도 정가 기준(얼마어치 탔는지).
  return { guest: false, weekEarned: earned, weekSpent: spent, avgDailyIncome: Math.round(earned / 7), avgDailyTransit: Math.round(Number(rides.results?.[0]?.n || 0) / 7) };
}
export const GUEST_SUMMARY = () => ({ guest: true, weekEarned: 0, weekSpent: 0, avgDailyIncome: 0, avgDailyTransit: 0 });

/** 공개 설정(로그인 없이): 요금표·상점·모드 — 클라이언트 quoteFare 가 이걸로 계산한다. 표시용. */
export function publicConfig(env) {
  return {
    version: V, mode: econMode(env), features: [],
    fares: Object.fromEntries(Object.entries(FARES).map(([code, f]) => [code, { mode: f.mode, amount: f.amount ?? null, meter: !!f.meter, factor: f.factor || 1, label: f.label }])),
    taxi: { base: TAXI.base, baseM: TAXI.baseM, stepM: TAXI.stepM, stepFare: TAXI.stepFare, nightFactor: TAXI.nightFactor, nightFromHour: TAXI.nightFromHour, nightToHour: TAXI.nightToHour, maxM: TAXI.maxM },
    aliases: FARE_ALIASES,
    move: { perMinute: MOVE.perMinute, dailyMinutes: MOVE.dailyMinutes, weeklyMinutes: MOVE.weeklyMinutes, payout: "daily" },
    rideLimits: rideLimits(env),
    board: { reward: BOARD.reward, dailyRewards: BOARD.dailyRewards, minChars: BOARD.minChars },
  };
}
