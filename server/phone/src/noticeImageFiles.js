// [notice-images] 공지 사진 바이트. 메타(주소 목록)는 posts.images(JSON)에 있고,
// 파일은 사진 보관함과 같은 R2 바인딩 PHOTOS 의 notices/ 접두어에 둔다.
// 공지는 누구나 보므로 GET 은 인증이 없다. 올리기는 게시판 관리자만.
// env.PHOTOS 가 없으면 404 → 작성 화면은 https 주소 붙이기로 남는다.

import { NOTICE_IMAGE_ID_RE, NOTICE_IMAGE_MAX_BYTES } from "../../../src/noticeImages.js";

export const NOTICE_IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sniffNoticeImage(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return "";
}

export function newNoticeImageId() {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return `n${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function json(data, status, cors, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors, ...extra },
  });
}

function bearer(request) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  return m && DEVICE_ID_RE.test(m[1]) ? m[1] : "";
}

async function readImage(request) {
  const typeHeader = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > NOTICE_IMAGE_MAX_BYTES) return { error: "too_big" };
  let buf;
  try { buf = new Uint8Array(await request.arrayBuffer()); } catch { return { error: "bad_body" }; }
  if (!buf.length || buf.length > NOTICE_IMAGE_MAX_BYTES) return { error: "too_big" };
  const sniffed = sniffNoticeImage(buf);
  if (!sniffed || !NOTICE_IMAGE_TYPES[sniffed]) return { error: "bad_type" };
  if (typeHeader && typeHeader !== sniffed) return { error: "bad_type" };
  return { bytes: buf, type: sniffed };
}

/** GET/HEAD /notice-images/<id> · POST /notice-images */
export async function handleNoticeImages(request, env, cors, url) {
  if (!env?.PHOTOS) return json({ ok: false, error: "no_storage" }, 404, cors);
  const rest = url.pathname.replace(/^\/notice-images\/?/, "");
  const method = request.method;

  if (!rest && method === "POST") {
    const id = bearer(request);
    if (!id) return json({ ok: false, error: "unauthorized" }, 401, cors);
    let gate;
    try {
      gate = await env.PHONE_BOOK.getByName("jeongja").noticeImageGate({ id });
    } catch {
      return json({ ok: false, error: "server" }, 500, cors);
    }
    if (!gate?.ok) {
      const error = gate?.error === "notice_admin" ? "notice_admin" : (gate?.error || "forbidden");
      const status = error === "notice_admin" || error === "forbidden" ? 403 : 400;
      return json({ ok: false, error }, status, cors);
    }
    const img = await readImage(request);
    if (img.error) {
      const status = img.error === "too_big" ? 413 : img.error === "bad_type" ? 415 : 400;
      return json({ ok: false, error: img.error }, status, cors);
    }
    const imageId = newNoticeImageId();
    if (!NOTICE_IMAGE_ID_RE.test(imageId)) return json({ ok: false, error: "server" }, 500, cors);
    const key = `notices/${imageId}.${NOTICE_IMAGE_TYPES[img.type]}`;
    await env.PHOTOS.put(key, img.bytes, { httpMetadata: { contentType: img.type } });
    return json({ ok: true, image: { url: `/notice-images/${imageId}` } }, 201, cors);
  }

  if (rest && NOTICE_IMAGE_ID_RE.test(rest) && (method === "GET" || method === "HEAD")) {
    for (const ext of Object.values(NOTICE_IMAGE_TYPES)) {
      const obj = await env.PHOTOS.get(`notices/${rest}.${ext}`);
      if (!obj) continue;
      const type = obj.httpMetadata?.contentType || `image/${ext === "jpg" ? "jpeg" : ext}`;
      const headers = {
        ...cors,
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      };
      if (obj.size != null) headers["Content-Length"] = String(obj.size);
      return new Response(method === "HEAD" ? null : obj.body, { status: 200, headers });
    }
    return json({ ok: false, error: "not_found" }, 404, cors);
  }

  if (rest && !NOTICE_IMAGE_ID_RE.test(rest)) return json({ ok: false, error: "bad_image" }, 400, cors);
  return json({ ok: false, error: "not_found" }, 404, cors);
}
