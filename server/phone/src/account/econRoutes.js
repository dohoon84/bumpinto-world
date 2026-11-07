// [economy] /econ/* 라우트 — UI(src/ui-v2/econ) EconClient 의 서버 쪽. 응답은 UI Result 모양 그대로:
//   성공 { ok:true, data }  ·  실패 { ok:false, error:{ code, … } }  (잔액 부족 = 402 insufficient_balance {need, balance, shortBy})
// 로그인(세션 쿠키 bw_s)이 없으면: GET 은 게스트 빈 모양(guest:true), POST 는 401 not_signed_in. 게스트에게는 원장도 지갑도 없다.
// ECONOMY_ENABLED 가 꺼져 있으면 /econ/config 만 답하고 나머지는 404 econ_disabled. 기능별 단계는 ECON_FEATURES(flags.js).
//
//   GET  /econ/config                      공개 설정(모드·요금표·택시 요금 규칙) — 로그인 없이
//   GET  /econ/state?since=<ledgerId>      세션·모드·잔액·오늘 이동 + since 이후 원장 행(보상 이벤트). 부를 때 이동·퀘스트·업적 정산(멱등)
//        &sinceAt=<ms>                     (로그인 직후) 그 시각 이후 원장 행 — 로그인 때 들어간 웰컴·베타·첫 접속 보상을 토스트로
//   GET  /econ/quests?period=daily|weekly|monthly
//   POST /econ/quests/claim   { questId }
//   GET  /econ/ledger?limit=20
//   GET  /econ/summary
//   POST /econ/fare           { code, rideId, meta? }          버스·지하철
//   POST /econ/taxi/hold      { code, estimateMeters, rideId }
//   POST /econ/taxi/settle    { holdId, actualMeters }
//   POST /econ/taxi/cancel    { holdId }
//   GET  /econ/shop                         { items, goal }
//   POST /econ/shop/buy       { itemId }
//   GET  /econ/karma
//   GET  /econ/titles/rarity               보유 비율 집계. 표가 없으면 ready:false (숫자를 지어내지 않음)
//   GET  /econ/welcome  ·  POST /econ/welcome
import { authCors } from "./routes.js";
import { sessionFromRequest } from "./session.js";
import { accountForSession, grantStarters } from "./store.js";
import { accountsEnabled, economyEnabled, econFeatures, featureOn, kstDate, statsEnabled } from "./flags.js";
import { logLoginDay } from "./stats.js";
import * as E from "./economy.js";

const MAX_BODY = 4000;

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
}
const okJ = (data, cors) => json({ ok: true, data }, 200, cors);
const errJ = (code, status, cors, extra = {}) => json({ ok: false, error: { code, ...extra } }, status, cors);
function resultJ(r, cors) {
  if (r.ok) return json(r, 200, cors);
  const code = r.error?.code;
  const status = code === "insufficient_balance" ? 402 : code === "not_signed_in" ? 401 : code === "unknown" || code === "hold_not_found" ? 404 : 409;
  return json(r, status, cors);
}

async function readBody(request) {
  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return { error: "bad_content_type" }; // 단순 요청(form) CSRF 차단
  let text;
  try { text = await request.text(); } catch { return { error: "bad_body" }; }
  if (text.length > MAX_BODY) return { error: "too_big" };
  try { return { body: JSON.parse(text || "{}") || {} }; } catch { return { error: "bad_body" }; }
}

function bookOf(env) {
  try { return env?.PHONE_BOOK?.getByName ? env.PHONE_BOOK.getByName("jeongja") : null; } catch { return null; }
}

/** 원장 행들 → [{ entry, reward|null }] (balanceAfter 는 지금 잔액에서 거꾸로 계산) */
function eventsOf(rows, total) {
  let after = total;
  const out = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    out.unshift({ entry: E.ledgerEntry(r), reward: E.rewardEventOf(r, after) });
    after -= Number(r.amount);
  }
  return out;
}

/**
 * @param deps { now? } — 테스트에서 시각을 바꿔 끼운다
 * @returns {Promise<Response|null>} /econ/* 가 아니면 null
 */
export async function handleEcon(request, env, url, deps = {}) {
  if (!url.pathname.startsWith("/econ/")) return null;
  const cors = authCors(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const path = url.pathname;
  const now = deps.now ?? Date.now();
  const GET = request.method === "GET";
  const POST = request.method === "POST";

  if (path === "/econ/config" && GET) return okJ({ ...E.publicConfig(env), enabled: economyEnabled(env), features: econFeatures(env) }, cors);
  // [titles] 보유 비율. 집계 표가 생기기 전에는 숫자를 만들지 않는다(ready:false). D1 을 읽지 않는다.
  if (path === "/econ/titles/rarity" && GET) return okJ({ ready: false, asOf: null, totalPlayers: null, counts: {} }, cors);
  if (!accountsEnabled(env) || !economyEnabled(env) || !env?.DB) return errJ("econ_disabled", 404, cors);
  if (request.headers.get("Origin") && !cors["Access-Control-Allow-Origin"]) return errJ("bad_origin", 403, cors);

  const db = env.DB;
  let acc = null;
  try {
    acc = await accountForSession(db, await sessionFromRequest(request, env, now));
  } catch { acc = null; }
  const mode = E.econMode(env);
  const features = econFeatures(env);

  try {
    // ── 게스트 ──
    if (!acc) {
      // 상점 미리보기: 게스트도 같은 답(coming_soon / unknown) — 아무것도 안 씀
      if (POST && path === "/econ/shop/buy") { const { body } = await readBody(request); return resultJ(E.previewPurchase(String(body?.itemId || "")), cors); }
      if (POST) return errJ("not_signed_in", 401, cors, { message: E.NOT_SIGNED_IN.message });
      if (path === "/econ/state") {
        return okJ({ enabled: true, mode, features, session: { isGuest: true, signedIn: false, accountId: null, displayName: null, provider: null }, balance: E.GUEST_BALANCE(now), travel: E.GUEST_TRAVEL(now), lastId: 0, events: [] }, cors);
      }
      if (path === "/econ/quests") return okJ(E.GUEST_QUESTS(String(url.searchParams.get("period") || "daily"), now), cors);
      if (path === "/econ/ledger") return okJ([], cors);
      if (path === "/econ/summary") return okJ(E.GUEST_SUMMARY(), cors);
      if (path === "/econ/shop") return okJ({ items: await E.listShop(db, env, null, now), goal: null }, cors);
      if (path === "/econ/karma") return okJ(E.guestKarma(), cors);
      if (path === "/econ/welcome") return okJ(E.GUEST_WELCOME(), cors);
      return errJ("not_found", 404, cors);
    }

    const id = acc.id;
    if (path === "/econ/state" && GET) {
      if (statsEnabled(env)) await logLoginDay(db, id, now);
      if (featureOn(env, "move")) await E.settleMoveForDates(db, env, id, [kstDate(now - 86400000), kstDate(now)], now);
      else if (featureOn(env, "quests")) await E.autoSettle(db, env, id, now);
      const balance = await E.balanceView(db, id, now);
      const since = Math.floor(Number(url.searchParams.get("since")) || 0);
      const sinceAt = Math.floor(Number(url.searchParams.get("sinceAt")) || 0);
      const rows = since > 0 ? await E.ledgerSince(db, id, since, 30)
        : sinceAt > 0 && now - sinceAt < 600000 ? await E.ledgerSinceAt(db, id, sinceAt, 30) : [];
      const lastId = rows.length ? Number(rows[rows.length - 1].id) : Math.max(since, await E.lastLedgerId(db, id));
      const travel = featureOn(env, "move") ? await E.travelToday(db, id, now) : { ...E.GUEST_TRAVEL(now), guest: false };
      return okJ({
        enabled: true, mode, features,
        session: { isGuest: false, signedIn: true, accountId: id, displayName: acc.name || acc.email || null, provider: "google" },
        balance, travel, lastId, events: eventsOf(rows, balance.total),
      }, cors);
    }

    if (path === "/econ/quests" && GET) {
      const period = String(url.searchParams.get("period") || "daily");
      if (!featureOn(env, "quests")) {
        return okJ({ ...E.GUEST_QUESTS(period, now), guest: false, info: { ko: "할 일은 곧 열려요", en: "Quests are coming soon" } }, cors);
      }
      // autoSettle 은 /econ/state(클라이언트 fresh) · 결제 · claim 에서 이미 돈다. 목록 GET 마다 세 기간×2패스 D1 을 또 돌리면 할 일 창 오픈이 길어진다.
      // ?settle=1 이면 예전처럼 이 요청에서도 정산(디버그·구버전 클라).
      if (url.searchParams.get("settle") === "1") await E.autoSettle(db, env, id, now);
      return okJ(await E.listQuests(db, env, id, period, now), cors);
    }
    if (path === "/econ/quests/claim" && POST) {
      if (!featureOn(env, "quests")) return errJ("unknown", 404, cors);
      const { body, error } = await readBody(request);
      if (error) return errJ(error, 400, cors);
      const r = await E.claimQuest(db, env, id, String(body.questId || ""), now);
      if (!r.ok) return resultJ(r, cors);
      const balance = await E.balanceView(db, id, now);
      const g = r.data.grant;
      return okJ({ quest: r.data.quest, reward: { kind: "quest", amount: g.amount, karma: g.karma, title: g.title, questId: g.questId, period: g.period, coins: 8, balanceAfter: balance.total }, balance }, cors);
    }

    if (path === "/econ/ledger" && GET) return okJ(await E.ledgerView(db, id, Number(url.searchParams.get("limit")) || 20), cors);
    if (path === "/econ/summary" && GET) return okJ(await E.walletSummary(db, id, now), cors);

    if (path === "/econ/fare" && POST) {
      const { body, error } = await readBody(request);
      if (error) return errJ(error, 400, cors);
      if (!featureOn(env, "quests") && !mode.transitPaid) {
        // 1단계(기능 꺼짐) 무료: 기록 없이 0원 영수증만
        const lf = E.listFare(String(body.code || ""));
        if (!lf || lf.mode === "taxi") return errJ("unknown", 404, cors);
        return okJ({ receiptId: `n-${String(body.rideId || "").slice(0, 40)}`, mode: lf.mode, code: lf.code, free: true, amount: 0, listAmount: lf.listAmount, balance: await E.balanceView(db, id, now), reward: [] }, cors);
      }
      const r = await E.payFare(db, env, id, { code: String(body.code || ""), rideId: String(body.rideId || ""), meta: body.meta }, now);
      if (!r.ok) return resultJ(r, cors);
      const balance = await E.balanceView(db, id, now);
      return okJ({ ...r.data.receipt, balance, reward: rewardsOut(r.data.rewards, balance.total) }, cors);
    }
    if (path === "/econ/taxi/hold" && POST) {
      const { body, error } = await readBody(request);
      if (error) return errJ(error, 400, cors);
      const r = await E.holdTaxi(db, env, id, { code: String(body.code || "taxi.drive"), estimateMeters: Number(body.estimateMeters) || 0, rideId: String(body.rideId || "") }, now);
      if (!r.ok) return resultJ(r, cors);
      return okJ({ ...r.data.hold, balance: await E.balanceView(db, id, now) }, cors);
    }
    if (path === "/econ/taxi/settle" && POST) {
      const { body, error } = await readBody(request);
      if (error) return errJ(error, 400, cors);
      const r = await E.settleTaxi(db, env, id, { holdId: String(body.holdId || ""), actualMeters: Number(body.actualMeters) || 0 }, now);
      if (!r.ok) return resultJ(r, cors);
      const balance = await E.balanceView(db, id, now);
      return okJ({ ...r.data.settlement, balance, reward: rewardsOut(r.data.rewards, balance.total) }, cors);
    }
    if (path === "/econ/taxi/cancel" && POST) {
      const { body, error } = await readBody(request);
      if (error) return errJ(error, 400, cors);
      const r = await E.cancelTaxi(db, id, String(body.holdId || ""), now);
      if (!r.ok) return resultJ(r, cors);
      return okJ({ balance: await E.balanceView(db, id, now), released: r.data.released }, cors);
    }

    if (path === "/econ/shop" && GET) return okJ({ items: await E.listShop(db, env, id, now), goal: await E.shopGoal(db, env, id, now) }, cors);
    if (path === "/econ/shop/buy" && POST) {
      const { body, error } = await readBody(request);
      if (error) return errJ(error, 400, cors);
      if (!featureOn(env, "shop")) return resultJ(E.previewPurchase(String(body.itemId || "")), cors);
      return resultJ(await E.purchase(db, env, id, String(body.itemId || ""), now), cors);
    }

    if (path === "/econ/karma" && GET) return okJ(await E.getKarma(db, id, now), cors);

    if (path === "/econ/welcome" && GET) return okJ(await E.welcomeState(db, env, id, now), cors);
    if (path === "/econ/welcome" && POST) {
      const before = await E.welcomeState(db, env, id, now);
      const g = await grantStarters(db, env, bookOf(env), id, now);
      if (statsEnabled(env)) await logLoginDay(db, id, now);
      const extra = featureOn(env, "quests") ? await E.autoSettle(db, env, id, now) : [];
      const balance = await E.balanceView(db, id, now);
      if (!g.granted.length && before.claimed) return errJ("already_claimed", 409, cors);
      const reward = g.granted.map((x) => ({ kind: x.reason, amount: x.amount, karma: null, title: (x.reason === "beta" ? before.grants[1] : before.grants[0])?.title || { ko: x.reason, en: x.reason }, coins: 8, balanceAfter: balance.total }));
      return okJ({ reward: [...reward, ...rewardsOut(extra, balance.total)], balance }, cors);
    }
  } catch (e) {
    console.warn("[econ]", path, e?.message || e);
    return errJ("network", 500, cors, { status: 500 });
  }
  return errJ("not_found", 404, cors);
}

/** economy.js 의 지급 결과 → UI RewardEvent[] */
function rewardsOut(list, balanceAfter) {
  return (list || []).filter((g) => g.amount > 0).map((g) => ({
    kind: g.kind === "achievement" ? "achievement" : "quest", amount: g.amount, karma: g.karma || null, title: g.title,
    ...(g.questId ? { questId: g.questId, period: g.period } : {}), coins: 8, balanceAfter,
  }));
}
