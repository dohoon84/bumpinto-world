import { DurableObject } from "cloudflare:workers";

// 정자역 번호부 하나. 번호는 여기서만 올라가서 겹치지 않는다.
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PIN_RE = /^\d{4,6}$/;
const FIRST_NUMBER = 20000001;
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MS = 5 * 60 * 1000;
const BOARD_PAGE_SIZE = 20;
const BOARD_CATS = new Set(["intro", "feedback", "food", "free"]);

function cleanTitle(value) {
  const title = String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().replace(/\s+/g, " ").slice(0, 80);
  return title || null;
}

function cleanPostBody(value) {
  const body = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, 2000);
  return body || null;
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function phoneOk(value) {
  return /^010\d{8}$/.test(value);
}

function cleanPin(value) {
  const pin = String(value ?? "").trim();
  return PIN_RE.test(pin) ? pin : null;
}

async function hashPin(salt, pin) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHash(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function displayPhone(value) {
  return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
}

function cleanName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 16);
  return name || null;
}

function cleanBody(value) {
  const body = String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 200);
  return body || null;
}

function cleanLook(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  let text;
  try { text = JSON.stringify(value); } catch { return null; }
  if (text.length > 1500) return null;
  return text;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) < 8000 ? n : null;
}

function placeOf(row) {
  if (row.x == null || row.y == null || row.z == null || row.ry == null) return null;
  return { x: row.x, y: row.y, z: row.z, ry: row.ry };
}

export class PhoneBook extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.#migrate());
  }

  #migrate() {
    const sql = this.ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    const version = sql.exec("SELECT COALESCE(MAX(id), 0) AS version FROM _sql_schema_migrations").toArray()[0].version;
    if (version < 1) {
      sql.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
      sql.exec(`CREATE TABLE users (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        look TEXT NOT NULL,
        x REAL, y REAL, z REAL, ry REAL,
        updated_at INTEGER NOT NULL
      )`);
      sql.exec(`CREATE TABLE contacts (
        owner TEXT NOT NULL,
        peer TEXT NOT NULL,
        alias TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (owner, peer)
      )`);
      sql.exec(`CREATE TABLE blocks (
        owner TEXT NOT NULL,
        peer TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (owner, peer)
      )`);
      sql.exec(`CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT NOT NULL,
        receiver TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        read_at INTEGER
      )`);
      sql.exec(`CREATE INDEX messages_receiver ON messages (receiver, read_at)`);
      sql.exec(`CREATE INDEX messages_pair ON messages (sender, receiver, id)`);
      sql.exec(`INSERT INTO _sql_schema_migrations (id) VALUES (1)`);
    }
    if (version < 2) {
      sql.exec(`ALTER TABLE users ADD COLUMN pin_salt TEXT`);
      sql.exec(`ALTER TABLE users ADD COLUMN pin_hash TEXT`);
      sql.exec(`ALTER TABLE users ADD COLUMN pin_fails INTEGER NOT NULL DEFAULT 0`);
      sql.exec(`ALTER TABLE users ADD COLUMN pin_locked_until INTEGER NOT NULL DEFAULT 0`);
      sql.exec(`INSERT INTO _sql_schema_migrations (id) VALUES (2)`);
    }
    if (version < 3) {
      sql.exec(`CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_phone TEXT,
        author_name TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
      sql.exec(`CREATE INDEX posts_cat_id ON posts (category, id DESC)`);
      sql.exec(`CREATE INDEX posts_id ON posts (id DESC)`);
      const now = Date.now();
      sql.exec(
        `INSERT INTO posts (category, title, body, author_id, author_phone, author_name, views, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?),
                (?, ?, ?, ?, ?, ?, ?, ?, ?),
                (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        "intro",
        "Bumpinto World 정자역 오픈월드에 오신 것을 환영합니다!",
        "안녕하세요! Bumpinto World의 첫 번째 지역인 성남시 분당구 정자역 월드입니다.\n\n• WASD / 방향키로 이동하고, E 키로 길가의 카카오바이크를 탈 수 있습니다.\n• 정류장 근처에 다가가면 실시간 경기도 버스 도착 정보를 볼 수 있습니다.\n• 우측 하단 스마트폰으로 다른 접속자와 문자/연락처를 주고받고, 재입장 PIN을 설정할 수 있습니다.\n• 이 게시판에서 자기소개, 피드백, 정자역 주변 맛집 정보를 자유롭게 나눠 보세요!",
        "system",
        "01020000000",
        "크레이지랩스",
        1,
        now - 120000,
        now - 120000,
        "food",
        "정자역 카페거리·탄천 산책로 주변 숨은 맛집을 추천해 주세요",
        "정자역 3·4번 출구 먹자골목이나 정자동 카페거리, 네이버 1784 근처에서 자주 가는 맛집이나 카페가 있다면 이 카테고리에 공유해 주세요!",
        "system",
        "01020000000",
        "정자동주민",
        1,
        now - 60000,
        now - 60000,
        "feedback",
        "월드 이용 피드백 및 건의사항을 남겨 주세요",
        "이동, 버스/택시, 지형, 멀티플레이, 편의기능 등 어떤 의견이든 환영합니다. 남겨주신 피드백은 다음 업데이트에 반영됩니다.",
        "system",
        "01020000000",
        "크레이지랩스",
        1,
        now,
        now,
      );
      sql.exec(`INSERT INTO _sql_schema_migrations (id) VALUES (3)`);
    }
  }

  #user(id) {
    if (!ID_RE.test(String(id || ""))) return { error: "bad_id" };
    const row = this.ctx.storage.sql.exec(
      "SELECT id, phone, name, look, x, y, z, ry, updated_at, pin_salt, pin_hash, pin_fails, pin_locked_until FROM users WHERE id = ?",
      id,
    ).toArray()[0];
    if (!row) return { error: "not_found" };
    return { user: row };
  }

  #byPhone(phone) {
    return this.ctx.storage.sql.exec("SELECT id, phone, name FROM users WHERE phone = ?", phone).toArray()[0] || null;
  }

  #blocked(a, b) {
    const row = this.ctx.storage.sql.exec(
      "SELECT 1 AS n FROM blocks WHERE (owner = ? AND peer = ?) OR (owner = ? AND peer = ?) LIMIT 1",
      a, b, b, a,
    ).toArray()[0];
    return !!row;
  }

  #unread(phone) {
    return this.ctx.storage.sql.exec(
      `SELECT COUNT(*) AS n FROM messages m
       WHERE m.receiver = ? AND m.read_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.owner = ? AND b.peer = m.sender)`,
      phone, phone,
    ).toArray()[0].n;
  }

  #issue() {
    const sql = this.ctx.storage.sql;
    const row = sql.exec("SELECT value FROM meta WHERE key = 'next'").toArray()[0];
    const n = row ? Number(row.value) : FIRST_NUMBER;
    if (!Number.isInteger(n) || n > 99999999) return null;
    const phone = `010${String(n).padStart(8, "0")}`;
    sql.exec(
      "INSERT INTO meta (key, value) VALUES ('next', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      String(n + 1),
    );
    return phone;
  }

  #profile(row) {
    let look = {};
    try { look = JSON.parse(row.look); } catch { look = {}; }
    return {
      ok: true,
      id: row.id,
      phone: row.phone,
      display: displayPhone(row.phone),
      name: row.name,
      look,
      place: placeOf(row),
      hasPin: !!row.pin_hash,
      updatedAt: row.updated_at,
      unread: this.#unread(row.phone),
    };
  }

  async join(input) {
    const id = String(input?.id || "");
    if (!ID_RE.test(id)) return { ok: false, error: "bad_id" };
    const name = cleanName(input?.name);
    if (!name) return { ok: false, error: "bad_name" };
    const look = cleanLook(input?.look);
    if (!look) return { ok: false, error: "bad_look" };
    const rawPin = input?.pin != null && String(input.pin).trim() !== "" ? String(input.pin) : null;
    const pin = rawPin != null ? cleanPin(rawPin) : null;
    if (rawPin != null && !pin) return { ok: false, error: "bad_pin" };
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    const existing = sql.exec(
      "SELECT id, phone, name, look, x, y, z, ry, updated_at, pin_salt, pin_hash FROM users WHERE id = ?",
      id,
    ).toArray()[0];
    if (existing) {
      if (!input?.preview) {
        if (pin) {
          const salt = crypto.randomUUID();
          const hash = await hashPin(salt, pin);
          sql.exec(
            "UPDATE users SET name = ?, look = ?, pin_salt = ?, pin_hash = ?, pin_fails = 0, pin_locked_until = 0, updated_at = ? WHERE id = ?",
            name, look, salt, hash, now, id,
          );
          existing.pin_salt = salt;
          existing.pin_hash = hash;
        } else {
          sql.exec("UPDATE users SET name = ?, look = ?, updated_at = ? WHERE id = ?", name, look, now, id);
        }
        existing.name = name;
        existing.look = look;
        existing.updated_at = now;
      }
      return this.#profile(existing);
    }
    const phone = this.#issue();
    if (!phone) return { ok: false, error: "full" };
    let salt = null;
    let hash = null;
    if (pin && !input?.preview) {
      salt = crypto.randomUUID();
      hash = await hashPin(salt, pin);
    }
    sql.exec(
      "INSERT INTO users (id, phone, name, look, pin_salt, pin_hash, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id, phone, name, look, salt, hash, now,
    );
    return this.#profile({ id, phone, name, look, x: null, y: null, z: null, ry: null, pin_hash: hash, updated_at: now });
  }

  async setPin(input) {
    const found = this.#user(input?.id);
    if (found.error) return { ok: false, error: found.error };
    const pin = cleanPin(input?.pin);
    if (!pin) return { ok: false, error: "bad_pin" };
    const salt = crypto.randomUUID();
    const hash = await hashPin(salt, pin);
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "UPDATE users SET pin_salt = ?, pin_hash = ?, pin_fails = 0, pin_locked_until = 0, updated_at = ? WHERE id = ?",
      salt, hash, now, found.user.id,
    );
    return { ok: true, hasPin: true, updatedAt: now };
  }

  async login(input) {
    const phone = digits(input?.phone);
    if (!phoneOk(phone)) return { ok: false, error: "bad_phone" };
    const pin = cleanPin(input?.pin);
    if (!pin) return { ok: false, error: "bad_pin" };
    const sql = this.ctx.storage.sql;
    const row = sql.exec(
      "SELECT id, phone, name, look, x, y, z, ry, updated_at, pin_salt, pin_hash, pin_fails, pin_locked_until FROM users WHERE phone = ?",
      phone,
    ).toArray()[0];
    if (!row) return { ok: false, error: "unknown_number" };
    const now = Date.now();
    if (row.pin_locked_until && row.pin_locked_until > now) {
      return { ok: false, error: "pin_locked" };
    }
    if (!row.pin_hash || !row.pin_salt) {
      return { ok: false, error: "no_pin" };
    }
    const candidate = await hashPin(row.pin_salt, pin);
    if (!sameHash(candidate, row.pin_hash)) {
      const fails = (row.pin_fails || 0) + 1;
      const lockedUntil = fails >= PIN_MAX_FAILS ? now + PIN_LOCK_MS : 0;
      sql.exec(
        "UPDATE users SET pin_fails = ?, pin_locked_until = ? WHERE id = ?",
        lockedUntil ? 0 : fails, lockedUntil, row.id,
      );
      return { ok: false, error: lockedUntil ? "pin_locked" : "wrong_pin" };
    }
    sql.exec("UPDATE users SET pin_fails = 0, pin_locked_until = 0, updated_at = ? WHERE id = ?", now, row.id);
    row.updated_at = now;
    return this.#profile(row);
  }

  place(input) {
    const found = this.#user(input?.id);
    if (found.error) return { ok: false, error: found.error };
    const x = num(input?.x), y = num(input?.y), z = num(input?.z), ry = num(input?.ry);
    if (x == null || y == null || z == null || ry == null) return { ok: false, error: "bad_place" };
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "UPDATE users SET x = ?, y = ?, z = ?, ry = ?, updated_at = ? WHERE id = ?",
      x, y, z, ry, now, found.user.id,
    );
    return { ok: true, updatedAt: now };
  }

  contacts(input) {
    const found = this.#user(input?.id);
    if (found.error) return { ok: false, error: found.error };
    const op = input?.op || "list";
    const phone = digits(input?.phone);
    const mine = found.user.phone;
    const sql = this.ctx.storage.sql;
    if (op === "list") {
      const rows = sql.exec(
        `SELECT c.peer, c.alias, u.name,
                EXISTS(SELECT 1 FROM blocks b WHERE b.owner = c.owner AND b.peer = c.peer) AS blocked
         FROM contacts c JOIN users u ON u.phone = c.peer
         WHERE c.owner = ? ORDER BY u.name`,
        mine,
      ).toArray();
      return {
        ok: true,
        contacts: rows.map((row) => ({
          phone: row.peer,
          display: displayPhone(row.peer),
          name: row.alias || row.name,
          blocked: !!row.blocked,
        })),
      };
    }
    if (!phoneOk(phone)) return { ok: false, error: "bad_phone" };
    if (phone === mine) return { ok: false, error: "self" };
    const peer = this.#byPhone(phone);
    if (!peer) return { ok: false, error: "unknown_number" };
    const now = Date.now();
    if (op === "add") {
      const alias = cleanName(input?.alias);
      sql.exec(
        "INSERT INTO contacts (owner, peer, alias, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner, peer) DO UPDATE SET alias = excluded.alias",
        mine, phone, alias, now,
      );
      return { ok: true };
    }
    if (op === "remove") {
      sql.exec("DELETE FROM contacts WHERE owner = ? AND peer = ?", mine, phone);
      return { ok: true };
    }
    if (op === "block") {
      sql.exec(
        "INSERT INTO blocks (owner, peer, created_at) VALUES (?, ?, ?) ON CONFLICT(owner, peer) DO NOTHING",
        mine, phone, now,
      );
      return { ok: true };
    }
    if (op === "unblock") {
      sql.exec("DELETE FROM blocks WHERE owner = ? AND peer = ?", mine, phone);
      return { ok: true };
    }
    return { ok: false, error: "bad_op" };
  }

  threads(input) {
    const found = this.#user(input?.id);
    if (found.error) return { ok: false, error: found.error };
    const mine = found.user.phone;
    const rows = this.ctx.storage.sql.exec(
      `SELECT id, sender, receiver, body, created_at, read_at FROM messages
       WHERE sender = ? OR receiver = ? ORDER BY id DESC LIMIT 300`,
      mine, mine,
    ).toArray();
    const seen = new Map();
    for (const row of rows) {
      const peer = row.sender === mine ? row.receiver : row.sender;
      if (this.#blocked(mine, peer)) continue;
      let item = seen.get(peer);
      if (!item) {
        item = { phone: peer, preview: row.body, at: row.created_at, unread: 0 };
        seen.set(peer, item);
      }
      if (row.receiver === mine && row.read_at == null) item.unread += 1;
    }
    const threads = [...seen.values()];
    for (const item of threads) {
      const user = this.#byPhone(item.phone);
      item.name = user?.name || item.phone;
      item.display = displayPhone(item.phone);
    }
    return { ok: true, unread: this.#unread(mine), threads };
  }

  messages(input) {
    const found = this.#user(input?.id);
    if (found.error) return { ok: false, error: found.error };
    const phone = digits(input?.with);
    if (!phoneOk(phone)) return { ok: false, error: "bad_phone" };
    const peer = this.#byPhone(phone);
    if (!peer) return { ok: false, error: "unknown_number" };
    const mine = found.user.phone;
    const rows = this.ctx.storage.sql.exec(
      `SELECT id, sender, body, created_at FROM messages
       WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
       ORDER BY id DESC LIMIT 50`,
      mine, phone, phone, mine,
    ).toArray().reverse();
    return {
      ok: true,
      peer: { phone, display: displayPhone(phone), name: peer.name, blocked: this.#blocked(mine, phone) },
      messages: rows.map((row) => ({ id: row.id, mine: row.sender === mine, body: row.body, at: row.created_at })),
    };
  }

  send(input) {
    const found = this.#user(input?.id);
    if (found.error) return { ok: false, error: found.error };
    const phone = digits(input?.to);
    const body = cleanBody(input?.body);
    if (!phoneOk(phone)) return { ok: false, error: "bad_phone" };
    if (!body) return { ok: false, error: "empty" };
    if (phone === found.user.phone) return { ok: false, error: "self" };
    const peer = this.#byPhone(phone);
    if (!peer) return { ok: false, error: "unknown_number" };
    if (this.#blocked(found.user.phone, phone)) return { ok: false, error: "blocked" };
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "INSERT INTO messages (sender, receiver, body, created_at) VALUES (?, ?, ?, ?)",
      found.user.phone, phone, body, now,
    );
    return { ok: true, at: now, body };
  }

  read(input) {
    const found = this.#user(input?.id);
    if (found.error) return { ok: false, error: found.error };
    const phone = digits(input?.with);
    if (!phoneOk(phone)) return { ok: false, error: "bad_phone" };
    this.ctx.storage.sql.exec(
      "UPDATE messages SET read_at = ? WHERE receiver = ? AND sender = ? AND read_at IS NULL",
      Date.now(), found.user.phone, phone,
    );
    return { ok: true, unread: this.#unread(found.user.phone) };
  }

  #postRow(row, id, myPhone, includeBody = false) {
    const mine = Boolean(
      (id && row.author_id === id) ||
      (myPhone && row.author_phone && row.author_phone === myPhone),
    );
    const item = {
      id: row.id,
      category: row.category,
      title: row.title,
      authorName: row.author_name,
      authorDisplay: row.author_phone ? displayPhone(row.author_phone) : "",
      mine,
      views: row.views || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (includeBody) item.body = row.body;
    return item;
  }

  board(input) {
    const op = String(input?.op || "list");
    const id = String(input?.id || "");
    const found = ID_RE.test(id) ? this.#user(id) : { user: null };
    const user = found.user || null;
    const myPhone = user?.phone || null;
    const sql = this.ctx.storage.sql;

    if (op === "list") {
      const cat = String(input?.category || "all");
      const page = Math.max(1, Math.floor(Number(input?.page) || 1));
      const filterCat = BOARD_CATS.has(cat) ? cat : null;
      const total = filterCat
        ? sql.exec("SELECT COUNT(*) AS n FROM posts WHERE category = ?", filterCat).toArray()[0].n
        : sql.exec("SELECT COUNT(*) AS n FROM posts").toArray()[0].n;
      const totalPages = Math.max(1, Math.ceil(total / BOARD_PAGE_SIZE));
      const safePage = Math.min(page, totalPages);
      const offset = (safePage - 1) * BOARD_PAGE_SIZE;
      const rows = filterCat
        ? sql.exec(
            `SELECT id, category, title, author_id, author_phone, author_name, views, created_at, updated_at
             FROM posts WHERE category = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
            filterCat, BOARD_PAGE_SIZE, offset,
          ).toArray()
        : sql.exec(
            `SELECT id, category, title, author_id, author_phone, author_name, views, created_at, updated_at
             FROM posts ORDER BY id DESC LIMIT ? OFFSET ?`,
            BOARD_PAGE_SIZE, offset,
          ).toArray();
      return {
        ok: true,
        category: filterCat || "all",
        page: safePage,
        pageSize: BOARD_PAGE_SIZE,
        total,
        totalPages,
        items: rows.map((r) => this.#postRow(r, id, myPhone, false)),
      };
    }

    if (op === "get") {
      const postId = Math.floor(Number(input?.postId) || 0);
      if (!postId) return { ok: false, error: "post_not_found" };
      const row = sql.exec(
        "SELECT id, category, title, body, author_id, author_phone, author_name, views, created_at, updated_at FROM posts WHERE id = ?",
        postId,
      ).toArray()[0];
      if (!row) return { ok: false, error: "post_not_found" };
      sql.exec("UPDATE posts SET views = views + 1 WHERE id = ?", postId);
      row.views = (row.views || 0) + 1;
      return { ok: true, post: this.#postRow(row, id, myPhone, true) };
    }

    if (!ID_RE.test(id)) return { ok: false, error: "bad_id" };

    if (op === "create") {
      const cat = String(input?.category || "free");
      if (!BOARD_CATS.has(cat)) return { ok: false, error: "bad_category" };
      const title = cleanTitle(input?.title);
      if (!title) return { ok: false, error: "bad_title" };
      const body = cleanPostBody(input?.body);
      if (!body) return { ok: false, error: "empty" };
      const authorName = user?.name || cleanName(input?.name) || "손님";
      const now = Date.now();
      sql.exec(
        `INSERT INTO posts (category, title, body, author_id, author_phone, author_name, views, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        cat, title, body, id, myPhone, authorName, now, now,
      );
      const inserted = sql.exec(
        "SELECT id, category, title, body, author_id, author_phone, author_name, views, created_at, updated_at FROM posts ORDER BY id DESC LIMIT 1",
      ).toArray()[0];
      return { ok: true, post: this.#postRow(inserted, id, myPhone, true) };
    }

    if (op === "update") {
      const postId = Math.floor(Number(input?.postId) || 0);
      if (!postId) return { ok: false, error: "post_not_found" };
      const existing = sql.exec(
        "SELECT id, category, title, body, author_id, author_phone, author_name, views, created_at, updated_at FROM posts WHERE id = ?",
        postId,
      ).toArray()[0];
      if (!existing) return { ok: false, error: "post_not_found" };
      const isMine = existing.author_id === id || (myPhone && existing.author_phone === myPhone);
      if (!isMine) return { ok: false, error: "forbidden" };
      const cat = String(input?.category || existing.category);
      if (!BOARD_CATS.has(cat)) return { ok: false, error: "bad_category" };
      const title = cleanTitle(input?.title);
      if (!title) return { ok: false, error: "bad_title" };
      const body = cleanPostBody(input?.body);
      if (!body) return { ok: false, error: "empty" };
      const now = Date.now();
      const authorName = user?.name || existing.author_name;
      sql.exec(
        "UPDATE posts SET category = ?, title = ?, body = ?, author_name = ?, updated_at = ? WHERE id = ?",
        cat, title, body, authorName, now, postId,
      );
      existing.category = cat;
      existing.title = title;
      existing.body = body;
      existing.author_name = authorName;
      existing.updated_at = now;
      return { ok: true, post: this.#postRow(existing, id, myPhone, true) };
    }

    if (op === "delete") {
      const postId = Math.floor(Number(input?.postId) || 0);
      if (!postId) return { ok: false, error: "post_not_found" };
      const existing = sql.exec(
        "SELECT id, author_id, author_phone FROM posts WHERE id = ?",
        postId,
      ).toArray()[0];
      if (!existing) return { ok: false, error: "post_not_found" };
      const isMine = existing.author_id === id || (myPhone && existing.author_phone === myPhone);
      if (!isMine) return { ok: false, error: "forbidden" };
      sql.exec("DELETE FROM posts WHERE id = ?", postId);
      return { ok: true };
    }

    return { ok: false, error: "bad_op" };
  }

  stats() {
    this.#migrate();
    const row = this.ctx.storage.sql.exec("SELECT COUNT(*) AS cnt FROM users").toArray()[0];
    return { residents: Number(row?.cnt || 0) };
  }
}
