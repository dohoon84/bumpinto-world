import { PhoneBook } from "./book.js";
import { Room } from "./room.js";
import { handlePhotos } from "./photos.js";
import { subwayArrival } from "./subway.js";

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
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": allowOrigin(request, env),
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Photo-Meta", // [photo-cloud]
      "Access-Control-Max-Age": "86400",
      "Access-Control-Allow-Private-Network": "true",
      Vary: "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
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
        const bookStats = await env.PHONE_BOOK.getByName(GLOBAL_BOOK_KEY).board({ op: "stats", region: queryRegion, detail });
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
            };
          }
        }
      } catch {}
      return json({ ok: true, region: queryRegion, online, residents, ...extra }, 200, cors);
    }
    if (url.pathname === "/photos" || url.pathname.startsWith("/photos/")) return handlePhotos(request, env, cors, url); // [photo-cloud] 사진 보관함 (R2)
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
      return json(out, out.ok ? 200 : 400, cors);
    } catch (error) {
      return json({ ok: false, error: "server", detail: String(error?.message || error) }, 500, cors);
    }
  },
};
