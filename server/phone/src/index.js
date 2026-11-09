import { PhoneBook } from "./book.js";
import { Room } from "./room.js";
import { handlePhotos } from "./photos.js";
import { handleNoticeImages } from "./noticeImageFiles.js"; // [notice-images]
import { subwayArrival } from "./subway.js";
import { handleAuth, authCors } from "./account/routes.js"; // [accounts] 구글 로그인·세션·계정 (ACCOUNTS_ENABLED 일 때만)
import { handleEcon } from "./account/econRoutes.js"; // [economy] /econ/* (ECONOMY_ENABLED 일 때만, 단계는 ECON_FEATURES)
import { featureOn } from "./account/flags.js";
import { accountForDevice } from "./account/store.js";
import { clawbackBoardPost, onBoardUpdate, rewardBoardPost } from "./account/economy.js";
import { handleBump24, settleBump24 } from "./bump24/routes.js"; // [bump24-rank]
import { handleArcade } from "./arcade/routes.js"; // [arcade-pang]

export { PhoneBook, Room };

const ROUTES = {
  "/join": "join",
  "/login": "login",
  "/pin": "setPin",
  "/place": "place",
  "/contacts": "contacts",
  "/threads": "threads",
  "/messages": "messages",
  "/send": "send",
  "/read": "read",
  "/board": "board",
};

function allowOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!origin) return "*";
  const configured = (env?.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.includes("*")) return "*";
  if (configured.includes(origin)) return origin;
  try {
    const host = new URL(origin).hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return origin;
    if (
      host === "bumpinto.world" ||
      host.endsWith(".bumpinto.world") ||
      host.endsWith(".pages.dev") ||
      host.endsWith(".workers.dev") ||
      host === "crazylabs.co.kr" ||
      host.endsWith(".crazylabs.co.kr")
    ) {
      return origin;
    }
  } catch { /* 출처가 아니면 아래 기본값으로 */ }
  return configured[0] || "*";
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
  });
}

// [camera] 뉴스 제보: { op: "submit", id, region, caption, image(base64 JPEG), w, h, takenAt, x, z }
// 사진이 들어 있어 일반 경로(8000자)보다 큰 본문을 받는다. 운영자용 op: list / image / review.
const NEWS_TIP_MAX_BODY = 420_000;
async function newsTip(request, env, cors) {
  if (request.method !== "POST") return json({ ok: false, error: "not_found" }, 404, cors);
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > NEWS_TIP_MAX_BODY) return json({ ok: false, error: "too_big" }, 413, cors);
  let text;
  try { text = await request.text(); } catch { return json({ ok: false, error: "bad_body" }, 400, cors); }
  if (text.length > NEWS_TIP_MAX_BODY) return json({ ok: false, error: "too_big" }, 413, cors);
  let body;
  try { body = JSON.parse(text || "{}"); } catch { return json({ ok: false, error: "bad_body" }, 400, cors); }
  body.region = String(body?.region || "jeongja").trim().toLowerCase() || "jeongja";
  try {
    const out = await env.PHONE_BOOK.getByName("jeongja").newsTip(body);
    return json(out, out.ok ? 200 : 400, cors);
  } catch (error) {
    return json({ ok: false, error: "server", detail: String(error?.message || error) }, 500, cors);
  }
}

export default {
  async scheduled(_event, env, ctx) {
    ctx?.waitUntil?.(settleBump24(env)); // [bump24-rank] 매일 00:05 KST. 같은 정산은 한 번만 지급
  },
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": allowOrigin(request, env),
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Photo-Meta", // [photo-cloud]
      "Access-Control-Max-Age": "86400",
      "Access-Control-Allow-Private-Network": "true",
      Vary: "Origin",
    };
    const url = new URL(request.url);
    // [accounts] /auth/* 는 쿠키를 쓰므로 CORS 를 따로(허용 출처만 + credentials) 처리한다 — OPTIONS 포함
    if (url.pathname.startsWith("/auth/")) return handleAuth(request, env, url, { waitUntil: ctx?.waitUntil?.bind(ctx) });
    if (url.pathname.startsWith("/econ/")) return handleEcon(request, env, url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname.startsWith("/bump24/")) return handleBump24(request, env, url, { ...cors, ...authCors(request, env) }); // [bump24-rank] OPTIONS(사전 요청) 처리 뒤에 둔다 — 앞에 있으면 404 로 POST 가 막힌다
    const queryRegion = (url.searchParams.get("region") || "jeongja").trim().toLowerCase() || "jeongja";
    const GLOBAL_BOOK_KEY = "jeongja"; // 단일 글로벌 번호부/패스포트 DB (모든 동네가 캐릭터·번호·문자 공유)
    if (url.pathname === "/ws") {
      return env.ROOM.getByName(queryRegion).fetch(request);
    }
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true }, 200, cors);
    if (request.method === "GET" && url.pathname === "/stats") {
      const detail = url.searchParams.get("detail") === "1";
      let online = 0;
      let residents = 0;
      let extra = {};
      try {
        const r = await env.ROOM.getByName(queryRegion).fetch("https://room/stats");
        if (r.ok) {
          const j = await r.json();
          online = Number(j?.online || 0);
        }
      } catch {}
      try {
        // [retention] ?since=<ms 또는 ISO> — 그 이후 신규 가입·활동, 그리고 그 이후 처음 구글 로그인한 계정의 캐릭터가 신규/기존인지
        let since = null;
        let googleIds = null;
        const sinceRaw = detail ? url.searchParams.get("since") : null;
        if (sinceRaw) {
          const n = /^\d+$/.test(sinceRaw) ? Number(sinceRaw) : Date.parse(sinceRaw);
          if (Number.isFinite(n) && n > 0) since = n;
        }
        if (since && env.DB) {
          try {
            const rs = await env.DB.prepare(
              "SELECT primary_user_id AS uid FROM accounts WHERE first_login_at >= ? AND primary_user_id IS NOT NULL",
            ).bind(since).all();
            googleIds = (rs?.results || []).map((r) => String(r.uid));
          } catch {}
        }
        const bookStats = await env.PHONE_BOOK.getByName(GLOBAL_BOOK_KEY).board({ op: "stats", region: queryRegion, detail, since, googleIds });
        if (bookStats?.ok) {
          residents = Number(bookStats.residents || 0);
          if (!online && bookStats.activeRecently) online = Number(bookStats.activeRecently || 0);
          if (detail) {
            extra = {
              regionName: bookStats.regionName,
              todayJoined: bookStats.todayJoined,
              todayActive: bookStats.todayActive,
              byRegion: bookStats.byRegion,
              community: bookStats.community,
              dailySignups: bookStats.dailySignups,
              retention: bookStats.retention,
              ...(bookStats.sinceStats ? { sinceStats: bookStats.sinceStats } : {}),
            };
          }
        }
      } catch {}
      return json({ ok: true, region: queryRegion, online, residents, ...extra }, 200, cors);
    }
    if (url.pathname === "/photos" || url.pathname.startsWith("/photos/")) return handlePhotos(request, env, cors, url, ctx); // [photo-cloud] 사진 보관함 (R2)
    if (url.pathname === "/notice-images" || url.pathname.startsWith("/notice-images/")) return handleNoticeImages(request, env, cors, url); // [notice-images] 공지 사진 (같은 R2, notices/ 접두어)
    if (url.pathname === "/subway/arrival") return subwayArrival(request, env, cors, url, ctx); // [subway] 실시간 도착 (secret SEOUL_SUBWAY_KEY, 25초 캐시)
    if (url.pathname === "/news-tip") return newsTip(request, env, cors); // [camera] 사진 뉴스 제보 (본문이 커서 따로 받음)
    const method = ROUTES[url.pathname];
    if (!method || request.method !== "POST") return json({ ok: false, error: "not_found" }, 404, cors);
    let text;
    try { text = await request.text(); } catch { return json({ ok: false, error: "bad_body" }, 400, cors); }
    if (text.length > 8000) return json({ ok: false, error: "too_big" }, 413, cors);
    let body;
    try { body = JSON.parse(text || "{}"); } catch { return json({ ok: false, error: "bad_body" }, 400, cors); }
    const regionKey = String(body?.region || queryRegion || "jeongja").trim().toLowerCase() || "jeongja";
    body.region = regionKey;
    try {
      const out = await env.PHONE_BOOK.getByName(GLOBAL_BOOK_KEY)[method](body);
      if (out?.ok && method === "board") await boardEconomy(env, body, out); // [economy] 게시판 보상(ECON_FEATURES 에 board 일 때만)
      return json(out, out.ok ? 200 : 400, cors);
    } catch (error) {
      return json({ ok: false, error: "server", detail: String(error?.message || error) }, 500, cors);
    }
  },
};

// [economy] 게시판 글 보상 · 회수. 글쓴이 기기(body.id)가 계정에 연결돼 있을 때만. 실패해도 글쓰기 자체는 그대로 성공.
async function boardEconomy(env, body, out) {
  const op = String(body?.op || "");
  if (!["create", "update", "delete"].includes(op) || !env?.DB || !featureOn(env, "board")) return;
  try {
    const account = await accountForDevice(env.DB, String(body?.id || "").toLowerCase());
    if (!account) return;
    let r = null;
    if (op === "create" && out.post) r = await rewardBoardPost(env.DB, env, account, { id: out.post.id, category: out.post.category, title: out.post.title, body: out.post.body });
    else if (op === "update" && out.post) r = await onBoardUpdate(env.DB, env, account, { id: out.post.id, category: out.post.category, title: out.post.title, body: out.post.body });
    else if (op === "delete") r = await clawbackBoardPost(env.DB, account.id, body.postId, "deleted");
    if (r) out.econ = r;
  } catch {}
}
