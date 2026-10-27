import { PhoneBook } from "./book.js";
import { Room } from "./room.js";

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

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": allowOrigin(request, env),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Private-Network": "true",
      Vary: "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      return env.ROOM.getByName("jeongja").fetch(request);
    }
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true }, 200, cors);
    if (request.method === "GET" && url.pathname === "/stats") {
      try {
        const [roomStats, bookStats] = await Promise.all([
          env.ROOM.getByName("jeongja").stats(),
          env.PHONE_BOOK.getByName("jeongja").stats(),
        ]);
        return json(
          {
            ok: true,
            online: Number(roomStats?.online || 0),
            residents: Number(bookStats?.residents || 0),
          },
          200,
          cors,
        );
      } catch (error) {
        return json({ ok: false, online: 0, residents: 0, detail: String(error?.message || error) }, 200, cors);
      }
    }
    const method = ROUTES[url.pathname];
    if (!method || request.method !== "POST") return json({ ok: false, error: "not_found" }, 404, cors);
    let text;
    try { text = await request.text(); } catch { return json({ ok: false, error: "bad_body" }, 400, cors); }
    if (text.length > 8000) return json({ ok: false, error: "too_big" }, 413, cors);
    let body;
    try { body = JSON.parse(text || "{}"); } catch { return json({ ok: false, error: "bad_body" }, 400, cors); }
    try {
      const out = await env.PHONE_BOOK.getByName("jeongja")[method](body);
      return json(out, out.ok ? 200 : 400, cors);
    } catch (error) {
      return json({ ok: false, error: "server", detail: String(error?.message || error) }, 500, cors);
    }
  },
};
