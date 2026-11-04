// [photo-cloud] 사진 보관함 서버 저장 — 원본 이미지는 R2(바인딩 PHOTOS), 목록·캡션 같은 메타데이터는 번호부 DO(PhoneBook)의 SQLite.
//
//   GET    /photos            내 사진 목록 + 사용량
//   PUT    /photos/<photoId>  사진 올리기 (본문 = JPEG/WebP 바이트, ≤ 2 MB, 메타데이터는 X-Photo-Meta 헤더)
//   GET    /photos/<photoId>  사진 받기 (ETag · 오래가는 private 캐시)
//   PATCH  /photos/<photoId>  캡션 바꾸기 ({ caption })
//   DELETE /photos/<photoId>  지우기
//
// 인증: 게임이 이미 쓰는 계정 id(가입/로그인 때 서버가 주는 UUID — 다른 경로에선 본문 "id")를
// "Authorization: Bearer <id>" 로 받는다. 주인은 언제나 DO 가 이 id 로 users 표에서 찾은 사람이고,
// 클라이언트가 보낸 다른 owner 값은 받지도 않는다. R2 키에는 id 대신 그 해시(ownerKey)만 쓴다.
//
// 이 파일은 cloudflare:workers 를 가져오지 않는다 — node 단위 테스트(scripts/test-photo-cloud.mjs)가 그대로 불러 쓴다.

import { statsEnabled } from "./account/flags.js"; // [accounts]
import { accountForDevice } from "./account/store.js";
import { logPhoto } from "./account/stats.js";

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024; // 클라이언트 원본(긴 변 1280, JPEG 0.9)은 보통 150–400 KB
export const PHOTO_MAX_PER_USER = 20; // 기기 보관함(MAX_PHOTOS)과 같게 — 어느 PC 에서 봐도 같은 한도
export const PHOTO_UPLOADS_PER_HOUR = 60; // 지웠다 올리기를 반복하는 남용 방지
export const PHOTO_CAPTION_MAX = 140;
export const PHOTO_TYPES = { "image/jpeg": "jpg", "image/webp": "webp" };
export const PHOTO_ID_RE = /^p[a-z0-9]{6,40}$/; // photoStore.newPhotoId() 모양
const ACCOUNT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const META_MAX = 2000;
// 같은 photoId 의 바이트는 바뀌지 않는다(새 사진 = 새 id) → 브라우저가 오래 들고 있어도 된다. 남과 공유되는 캐시는 금지.
export const PHOTO_CACHE_CONTROL = "private, max-age=31536000, immutable";

// ── 순수 도우미 ──
export function sniffType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return "";
}

export async function sha256Hex(data) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  return [...d].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// R2 키 접두어: 계정 id 를 그대로 쓰지 않는다(대시보드·로그에 남아도 계정을 가로챌 수 없게).
export async function ownerKeyOf(userId) {
  return (await sha256Hex(`bumpinto-photos:${userId}`)).slice(0, 32);
}

export function cleanCaption(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, PHOTO_CAPTION_MAX);
}

const int = (v, lo, hi) => {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};
const short = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, n);

export function cleanMeta(raw, now = Date.now()) {
  const m = raw && typeof raw === "object" ? raw : {};
  return {
    caption: cleanCaption(m.caption),
    takenAt: int(m.takenAt, 1577836800000, now + 600000) ?? now, // 2020-01-01 이후 ~ 지금+10분
    w: int(m.w, 1, 8192),
    h: int(m.h, 1, 8192),
    region: short(m.region, 24).toLowerCase() || null,
    regionName: short(m.regionName, 40) || null,
    regionEnName: short(m.regionEnName, 60) || null,
    x: int(m.x, -1e6, 1e6),
    z: int(m.z, -1e6, 1e6),
  };
}

export function parseMetaHeader(value) {
  if (!value) return {};
  if (value.length > META_MAX) return null;
  try { return JSON.parse(decodeURIComponent(value)); } catch { return null; }
}

// ── DO(SQLite) 쪽 ──
// 번호가 매겨진 #migrate 와 섞이지 않게(뉴스 제보와 같은 방식) 처음 쓸 때 IF NOT EXISTS 로 만든다.
export function ensurePhotoTables(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS photos (
    owner TEXT NOT NULL,
    id TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    w INTEGER, h INTEGER,
    region TEXT, region_name TEXT, region_en_name TEXT, x REAL, z REAL,
    taken_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (owner, id)
  )`);
  sql.exec(`CREATE UNIQUE INDEX IF NOT EXISTS photos_owner_sha ON photos (owner, sha256)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS photo_uploads (owner TEXT NOT NULL, at INTEGER NOT NULL)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS photo_uploads_owner ON photo_uploads (owner, at)`);
}

function out(r) {
  return {
    id: r.id, type: r.type, size: r.size, sha256: r.sha256, caption: r.caption || "",
    w: r.w, h: r.h, region: r.region, regionName: r.region_name, regionEnName: r.region_en_name,
    x: r.x, z: r.z, takenAt: r.taken_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
const usedOf = (sql, owner) => Number(sql.exec("SELECT COUNT(*) AS n FROM photos WHERE owner = ?", owner).toArray()[0]?.n || 0);
const rowOf = (sql, owner, id) => sql.exec("SELECT * FROM photos WHERE owner = ? AND id = ?", owner, id).toArray()[0] || null;
const rowBySha = (sql, owner, sha) => sql.exec("SELECT * FROM photos WHERE owner = ? AND sha256 = ?", owner, sha).toArray()[0] || null;

/**
 * PhoneBook.photos(input) 의 본체. user 는 DO 가 계정 id 로 찾은 users 행(그 밖의 owner 는 믿지 않는다).
 * op: list | begin | save | get | caption | delete
 */
export async function photoOp(sql, user, input, now = Date.now()) {
  ensurePhotoTables(sql);
  const owner = user.id;
  const op = String(input?.op || "");
  const limits = { max: PHOTO_MAX_PER_USER, maxBytes: PHOTO_MAX_BYTES };
  if (op === "list") {
    const rows = sql.exec("SELECT * FROM photos WHERE owner = ? ORDER BY taken_at DESC, created_at DESC", owner).toArray();
    return { ok: true, items: rows.map(out), used: rows.length, ...limits };
  }
  const photoId = String(input?.photoId || "");
  if (!PHOTO_ID_RE.test(photoId)) return { ok: false, error: "bad_photo_id" };

  if (op === "begin" || op === "save") {
    const sha = String(input?.sha256 || "");
    if (!/^[0-9a-f]{64}$/.test(sha)) return { ok: false, error: "bad_hash" };
    // 같은 사진(같은 id 또는 같은 바이트)이 이미 있으면 새로 올리지 않는다 → 이주(마이그레이션)를 몇 번 돌려도 한 장
    const dup = rowOf(sql, owner, photoId) || rowBySha(sql, owner, sha);
    if (dup) return { ok: true, dedup: true, photo: out(dup), key: dup.r2_key, used: usedOf(sql, owner), ...limits };
    const used = usedOf(sql, owner);
    if (used >= PHOTO_MAX_PER_USER) return { ok: false, error: "album_full", used, ...limits };
    const recent = Number(sql.exec("SELECT COUNT(*) AS n FROM photo_uploads WHERE owner = ? AND at > ?", owner, now - 3600000).toArray()[0]?.n || 0);
    if (recent >= PHOTO_UPLOADS_PER_HOUR) return { ok: false, error: "rate" };
    const type = PHOTO_TYPES[input?.type] ? input.type : "";
    if (!type) return { ok: false, error: "bad_type" };
    const size = int(input?.size, 1, PHOTO_MAX_BYTES);
    if (!size) return { ok: false, error: "too_big" };
    const key = `u/${await ownerKeyOf(owner)}/${photoId}.${PHOTO_TYPES[type]}`;
    if (op === "begin") return { ok: true, key, used, ...limits };
    // save: R2 에 올린 뒤 기록. DO 는 한 번에 하나씩 처리하므로 한도·중복 검사가 여기서 확정된다.
    if (String(input?.key || "") !== key) return { ok: false, error: "bad_key" };
    const m = cleanMeta(input?.meta, now);
    sql.exec(
      `INSERT INTO photos (owner, id, r2_key, type, size, sha256, caption, w, h, region, region_name, region_en_name, x, z, taken_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      owner, photoId, key, type, size, sha, m.caption, m.w, m.h, m.region, m.regionName, m.regionEnName, m.x, m.z, m.takenAt, now, now,
    );
    sql.exec("INSERT INTO photo_uploads (owner, at) VALUES (?, ?)", owner, now);
    sql.exec("DELETE FROM photo_uploads WHERE at < ?", now - 86400000);
    return { ok: true, photo: out(rowOf(sql, owner, photoId)), key, used: used + 1, ...limits };
  }

  const row = rowOf(sql, owner, photoId);
  if (!row) return { ok: false, error: "photo_not_found" };
  if (op === "get") return { ok: true, photo: out(row), key: row.r2_key };
  if (op === "caption") {
    const caption = cleanCaption(input?.caption);
    sql.exec("UPDATE photos SET caption = ?, updated_at = ? WHERE owner = ? AND id = ?", caption, now, owner, photoId);
    return { ok: true, photo: out(rowOf(sql, owner, photoId)) };
  }
  if (op === "delete") {
    sql.exec("DELETE FROM photos WHERE owner = ? AND id = ?", owner, photoId);
    return { ok: true, key: row.r2_key, used: usedOf(sql, owner) };
  }
  return { ok: false, error: "bad_op" };
}

// ── Worker(HTTP) 쪽 ──
const STATUS = {
  unauthorized: 401, bad_id: 401, not_found: 401,
  photo_not_found: 404, album_full: 409, rate: 429, too_big: 413, bad_type: 415, bad_image: 415,
  bad_photo_id: 400, bad_hash: 400, bad_key: 400, bad_meta: 400, bad_body: 400, bad_op: 400,
};

function reply(data, status, cors, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors, ...extra },
  });
}
const fail = (error, cors, extra) => reply({ ok: false, error: error === "not_found" || error === "bad_id" ? "unauthorized" : error }, STATUS[error] || 400, cors, extra);

// [accounts] 새 사진이 저장되면 그 기기(또는 대표 캐릭터)가 붙은 계정에 photo_point_log 한 줄. 실패해도 업로드엔 영향 없음.
function onPhotoSaved(env, ctx, userId, photo) {
  if (!statsEnabled(env)) return;
  const job = (async () => {
    const acc =
      (await accountForDevice(env.DB, userId)) ||
      (await env.DB.prepare("SELECT * FROM accounts WHERE primary_user_id = ? AND status = 'active'").bind(userId).first());
    if (acc) await logPhoto(env.DB, acc.id, photo);
  })().catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(job);
}

export function bearerOf(request) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  return m && ACCOUNT_ID_RE.test(m[1]) ? m[1] : "";
}

/** /photos 와 /photos/<photoId> 를 처리한다. env.PHOTOS(R2) 가 없으면 아직 배포 안 된 것으로 보고 404. */
export async function handlePhotos(request, env, cors, url, ctx) {
  // 클라이언트는 404 를 "이 서버엔 아직 사진 저장이 없음"으로 보고 조용히 기기 저장만 쓴다.
  if (!env?.PHOTOS) return reply({ ok: false, error: "not_found" }, 404, cors);
  const rest = url.pathname.replace(/^\/photos\/?/, "");
  const photoId = rest;
  if (rest && !PHOTO_ID_RE.test(rest)) return fail("bad_photo_id", cors);
  const id = bearerOf(request);
  if (!id) return fail("unauthorized", cors, { "WWW-Authenticate": "Bearer" });
  const book = env.PHONE_BOOK.getByName("jeongja"); // 단일 글로벌 번호부(계정 DB)
  const call = (input) => book.photos({ ...input, id });
  const method = request.method;

  try {
    if (!rest) {
      if (method !== "GET") return reply({ ok: false, error: "not_found" }, 405, cors, { Allow: "GET" });
      const r = await call({ op: "list" });
      return r.ok ? reply(r, 200, cors) : fail(r.error, cors);
    }

    if (method === "GET" || method === "HEAD") {
      const r = await call({ op: "get", photoId });
      if (!r.ok) return fail(r.error, cors);
      const etag = `"${r.photo.sha256}"`;
      const head = {
        ...cors,
        "Content-Type": r.photo.type,
        "Cache-Control": PHOTO_CACHE_CONTROL,
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      };
      const inm = request.headers.get("If-None-Match") || "";
      if (inm.split(",").map((s) => s.trim()).includes(etag)) return new Response(null, { status: 304, headers: head });
      const obj = await env.PHOTOS.get(r.key);
      if (!obj) return fail("photo_not_found", cors);
      return new Response(method === "HEAD" ? null : obj.body, { status: 200, headers: { ...head, "Content-Length": String(obj.size ?? r.photo.size) } });
    }

    if (method === "PUT") {
      const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
      if (!PHOTO_TYPES[type]) return fail("bad_type", cors);
      const declared = Number(request.headers.get("Content-Length") || 0);
      if (declared > PHOTO_MAX_BYTES) return fail("too_big", cors);
      const meta = parseMetaHeader(request.headers.get("X-Photo-Meta"));
      if (meta == null) return fail("bad_meta", cors);
      let buf;
      try { buf = await request.arrayBuffer(); } catch { return fail("bad_body", cors); }
      if (!buf.byteLength) return fail("bad_image", cors);
      if (buf.byteLength > PHOTO_MAX_BYTES) return fail("too_big", cors);
      if (sniffType(buf) !== type) return fail("bad_image", cors); // 확장자·헤더만 바꾼 다른 파일은 거절
      const sha256 = await sha256Hex(buf);
      const base = { photoId, sha256, type, size: buf.byteLength };
      const begin = await call({ op: "begin", ...base });
      if (!begin.ok) return fail(begin.error, cors);
      if (begin.dedup) return reply({ ok: true, dedup: true, photo: begin.photo, used: begin.used, max: begin.max }, 200, cors);
      await env.PHOTOS.put(begin.key, buf, {
        httpMetadata: { contentType: type, cacheControl: PHOTO_CACHE_CONTROL },
        customMetadata: { sha256, photoId },
        sha256,
      });
      const saved = await call({ op: "save", ...base, key: begin.key, meta });
      if (!saved.ok || (saved.dedup && saved.key !== begin.key)) {
        // 그 사이 한도가 찼거나 같은 사진이 먼저 들어왔으면, 방금 올린 파일은 치운다.
        await env.PHOTOS.delete(begin.key).catch(() => {});
        if (!saved.ok) return fail(saved.error, cors);
      }
      if (!saved.dedup && saved.photo) onPhotoSaved(env, ctx, id, saved.photo); // [accounts] 칭호용 사진 기록 (로그인 계정에 연결된 기기만)
      return reply({ ok: true, dedup: !!saved.dedup, photo: saved.photo, used: saved.used, max: saved.max }, saved.dedup ? 200 : 201, cors);
    }

    if (method === "PATCH") {
      let text;
      try { text = await request.text(); } catch { return fail("bad_body", cors); }
      if (text.length > META_MAX) return fail("too_big", cors);
      let body;
      try { body = JSON.parse(text || "{}"); } catch { return fail("bad_body", cors); }
      const r = await call({ op: "caption", photoId, caption: body?.caption });
      return r.ok ? reply(r, 200, cors) : fail(r.error, cors);
    }

    if (method === "DELETE") {
      const r = await call({ op: "delete", photoId });
      if (!r.ok) return fail(r.error, cors);
      await env.PHOTOS.delete(r.key);
      return reply({ ok: true, used: r.used }, 200, cors);
    }
    return reply({ ok: false, error: "not_found" }, 405, cors, { Allow: "GET, HEAD, PUT, PATCH, DELETE" });
  } catch (error) {
    return reply({ ok: false, error: "server", detail: String(error?.message || error) }, 500, cors);
  }
}
