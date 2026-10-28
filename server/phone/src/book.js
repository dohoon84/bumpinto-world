import { DurableObject } from "cloudflare:workers";
import { NOTICE_POSTS } from "../../../src/notices.js";

// 정자역 번호부 하나. 번호는 여기서만 올라가서 겹치지 않는다.
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PIN_RE = /^\d{4,6}$/;
const FIRST_NUMBER = 20000001;
const GUIDE_ID = "00000000-0000-4000-8000-000000000000";
const GUIDE_PHONE = "01020000000";
const DEFAULT_REGION = "jeongja";
const REGION_LABELS = {
  jeongja: "정자동",
  sunae: "수내역",
  seohyeon: "서현역",
  imae: "이매역",
  yatap: "야탑역",
  pangyo: "판교역",
  gangnam: "강남역",
  seongsu: "성수동",
  hongdae: "홍대입구",
};
function regionLabelOf(region) {
  const key = String(region || DEFAULT_REGION).trim().toLowerCase();
  return REGION_LABELS[key] || String(region || "정자동").trim() || "정자동";
}
function guideNameOf(region) {
  return `${regionLabelOf(region)} 안내센터`;
}
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MS = 5 * 60 * 1000;
const BOARD_PAGE_SIZE = 20;
const BOARD_CATS = new Set(["notice", "intro", "feedback", "food", "free"]);
const WRITABLE_BOARD_CATS = new Set(["intro", "feedback", "food", "free"]);

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

function cleanCommentBody(value) {
  const body = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, 500);
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
    if (version < 4) {
      const now = Date.now();
      this.#ensureGuideAccount(now);
      const users = sql.exec("SELECT phone, name FROM users WHERE phone != ?", GUIDE_PHONE).toArray();
      for (const u of users) {
        this.#ensureWelcome(u.phone, u.name, now);
      }
      sql.exec(`INSERT INTO _sql_schema_migrations (id) VALUES (4)`);
    }
    if (version < 5) {
      const now = Date.now();
      const regionName = this.#regionLabel();
      this.#ensureGuideAccount(now, regionName);
      const users = sql.exec("SELECT phone, name FROM users WHERE phone != ?", GUIDE_PHONE).toArray();
      for (const u of users) {
        const body = this.#welcomeBody(u.name, u.phone, regionName);
        const firstMsg = sql.exec(
          "SELECT id FROM messages WHERE sender = ? AND receiver = ? ORDER BY id ASC LIMIT 1",
          GUIDE_PHONE, u.phone,
        ).toArray()[0];
        if (firstMsg) {
          sql.exec("UPDATE messages SET body = ? WHERE id = ?", body, firstMsg.id);
        } else {
          sql.exec(
            "INSERT INTO messages (sender, receiver, body, created_at) VALUES (?, ?, ?, ?)",
            GUIDE_PHONE, u.phone, body, now,
          );
        }
      }
      sql.exec(`INSERT INTO _sql_schema_migrations (id) VALUES (5)`);
    }
    if (version < 6) {
      const cols = sql.exec("PRAGMA table_info(posts)").toArray();
      if (!cols.some((c) => c.name === "notice_key")) {
        sql.exec(`ALTER TABLE posts ADD COLUMN notice_key TEXT`);
      }
      sql.exec(`CREATE UNIQUE INDEX IF NOT EXISTS posts_notice_key ON posts (notice_key) WHERE notice_key IS NOT NULL`);
      sql.exec(`CREATE TABLE IF NOT EXISTS post_likes (
        post_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        user_phone TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (post_id, user_id)
      )`);
      sql.exec(`CREATE INDEX IF NOT EXISTS post_likes_post ON post_likes (post_id)`);
      sql.exec(`CREATE TABLE IF NOT EXISTS post_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        author_id TEXT NOT NULL,
        author_phone TEXT,
        author_name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`);
      sql.exec(`CREATE INDEX IF NOT EXISTS post_comments_post ON post_comments (post_id, id ASC)`);
      sql.exec(`INSERT INTO _sql_schema_migrations (id) VALUES (6)`);
    }
    if (version < 7) {
      const cols = sql.exec("PRAGMA table_info(users)").toArray();
      if (!cols.some((c) => c.name === "created_at")) {
        sql.exec(`ALTER TABLE users ADD COLUMN created_at INTEGER`);
      }
      sql.exec(`UPDATE users SET created_at = updated_at WHERE created_at IS NULL`);
      sql.exec(`CREATE INDEX IF NOT EXISTS users_created_at ON users (created_at)`);
      sql.exec(`INSERT INTO _sql_schema_migrations (id) VALUES (7)`);
    }
    if (version < 8) {
      const cols = sql.exec("PRAGMA table_info(users)").toArray();
      if (!cols.some((c) => c.name === "region")) {
        sql.exec(`ALTER TABLE users ADD COLUMN region TEXT`);
      }
      sql.exec(`UPDATE users SET region = ? WHERE region IS NULL`, DEFAULT_REGION);
      sql.exec(`CREATE INDEX IF NOT EXISTS users_region ON users (region)`);
      sql.exec(`INSERT INTO _sql_schema_migrations (id) VALUES (8)`);
    }
    this.#syncNotices();
  }

  #syncNotices() {
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    for (const item of NOTICE_POSTS || []) {
      const key = String(item?.key || "").trim();
      const title = cleanTitle(item?.title);
      const body = cleanPostBody(item?.body);
      if (!key || !title || !body) continue;
      const authorName = cleanName(item?.authorName) || "크레이지랩스";
      const createdAt = Number.isFinite(item?.createdAt) ? Number(item.createdAt) : now;
      const existing = sql.exec("SELECT id, title, body, created_at FROM posts WHERE notice_key = ?", key).toArray()[0];
      if (!existing) {
        sql.exec(
          `INSERT INTO posts (category, title, body, author_id, author_phone, author_name, views, created_at, updated_at, notice_key)
           VALUES ('notice', ?, ?, 'system', ?, ?, 1, ?, ?, ?)`,
          title, body, GUIDE_PHONE, authorName, createdAt, createdAt, key,
        );
      } else if (existing.title !== title || existing.body !== body || existing.created_at !== createdAt) {
        sql.exec(
          "UPDATE posts SET category = 'notice', title = ?, body = ?, author_name = ?, created_at = ?, updated_at = ? WHERE id = ?",
          title, body, authorName, createdAt, now, existing.id,
        );
      }
    }
  }

  #regionLabel(region) {
    if (region) return regionLabelOf(region);
    try {
      const row = this.ctx.storage.sql.exec("SELECT value FROM meta WHERE key = 'region'").toArray()[0];
      if (row?.value) return regionLabelOf(row.value);
    } catch {}
    return regionLabelOf(DEFAULT_REGION);
  }

  #setRegion(region) {
    if (!region) return;
    const label = regionLabelOf(region);
    try {
      this.ctx.storage.sql.exec(
        "INSERT INTO meta (key, value) VALUES ('region', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        label,
      );
    } catch {}
  }

  #welcomeBody(name, phone, region) {
    const safeName = cleanName(name) || "주민";
    const rLabel = this.#regionLabel(region);
    const gName = `${rLabel} 안내센터`;
    return `[${gName}] ${rLabel} 입주민분들께 안내 말씀 드립니다. 반가워요 ${safeName}님! 🎉 Bumpinto World ${rLabel} 입주를 진심으로 환영합니다. 발급받으신 내 번호(${displayPhone(phone)})로 이웃 주민들과 문자·연락처를 주고받을 수 있으며, [비밀번호] 앱에서 재입장 PIN을 설정하시면 다른 기기에서도 그대로 이어하실 수 있습니다.`;
  }

  #ensureGuideAccount(now = Date.now(), region) {
    const sql = this.ctx.storage.sql;
    const gName = `${this.#regionLabel(region)} 안내센터`;
    sql.exec(
      `INSERT INTO users (id, phone, name, look, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
      GUIDE_ID,
      GUIDE_PHONE,
      gName,
      JSON.stringify({ gender: "f", face: "round", hair: "medium", top: "hoodie", color: "#1f5fbf", skin: "#f2d0b0", pants: "#2b3040" }),
      now,
    );
  }

  #ensureWelcome(phone, name, now = Date.now(), updateUnread = false, region) {
    if (!phone || phone === GUIDE_PHONE) return;
    if (region) this.#setRegion(region);
    const rLabel = this.#regionLabel(region);
    const gName = `${rLabel} 안내센터`;
    this.#ensureGuideAccount(now, rLabel);
    const sql = this.ctx.storage.sql;
    sql.exec(
      `INSERT INTO contacts (owner, peer, alias, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(owner, peer) DO UPDATE SET alias = excluded.alias`,
      phone, GUIDE_PHONE, gName, now,
    );
    const existingMsg = sql.exec(
      "SELECT id, read_at FROM messages WHERE sender = ? AND receiver = ? ORDER BY id ASC LIMIT 1",
      GUIDE_PHONE, phone,
    ).toArray()[0];
    const body = this.#welcomeBody(name, phone, rLabel);
    if (!existingMsg) {
      sql.exec(
        "INSERT INTO messages (sender, receiver, body, created_at) VALUES (?, ?, ?, ?)",
        GUIDE_PHONE, phone, body, now,
      );
    } else if (updateUnread && existingMsg.read_at == null) {
      sql.exec(
        "UPDATE messages SET body = ? WHERE id = ?",
        body, existingMsg.id,
      );
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
        this.#ensureWelcome(existing.phone, name, now, true, input?.region);
      } else {
        this.#ensureWelcome(existing.phone, existing.name, now, false, input?.region);
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
    const regionKey = String(input?.region || DEFAULT_REGION).trim().toLowerCase() || DEFAULT_REGION;
    sql.exec(
      "INSERT INTO users (id, phone, name, look, pin_salt, pin_hash, region, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, phone, name, look, salt, hash, regionKey, now, now,
    );
    this.#ensureWelcome(phone, name, now, true, regionKey);
    return this.#profile({ id, phone, name, look, region: regionKey, x: null, y: null, z: null, ry: null, pin_hash: hash, updated_at: now });
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
    this.#ensureWelcome(row.phone, row.name, now, false);
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
    this.#ensureWelcome(mine, found.user.name, Date.now(), false);
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
    if (phone === GUIDE_PHONE) {
      const rLabel = this.#regionLabel(input?.region);
      const gName = `${rLabel} 안내센터`;
      const autoReply = `[${gName}] ${rLabel} 입주민분들께 안내 말씀 드립니다. 보내주신 소중한 의견 감사합니다 😊 건의사항이나 맛집·이웃 소식은 화면 우측 상단 [📋 게시판]을 통해서도 모든 입주민과 함께 나누실 수 있습니다!`;
      this.ctx.storage.sql.exec(
        "INSERT INTO messages (sender, receiver, body, created_at) VALUES (?, ?, ?, ?)",
        GUIDE_PHONE, found.user.phone, autoReply, now + 1,
      );
    }
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
    const sql = this.ctx.storage.sql;
    const mine = Boolean(
      (id && row.author_id === id) ||
      (myPhone && row.author_phone && row.author_phone === myPhone),
    );
    const likesCount = Number(
      row.likes_count ??
        sql.exec("SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?", row.id).toArray()[0]?.n ??
        0,
    );
    const commentsCount = Number(
      row.comments_count ??
        sql.exec("SELECT COUNT(*) AS n FROM post_comments WHERE post_id = ?", row.id).toArray()[0]?.n ??
        0,
    );
    let liked = false;
    if (id || myPhone) {
      const likedRow = myPhone
        ? sql.exec(
            "SELECT 1 AS ok FROM post_likes WHERE post_id = ? AND (user_id = ? OR user_phone = ?) LIMIT 1",
            row.id, id || "", myPhone,
          ).toArray()[0]
        : sql.exec(
            "SELECT 1 AS ok FROM post_likes WHERE post_id = ? AND user_id = ? LIMIT 1",
            row.id, id,
          ).toArray()[0];
      liked = !!likedRow;
    }
    const item = {
      id: row.id,
      category: row.category,
      title: row.title,
      authorName: row.author_name,
      authorDisplay: row.author_phone ? displayPhone(row.author_phone) : "",
      mine,
      views: row.views || 0,
      likesCount,
      commentsCount,
      liked,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (includeBody) item.body = row.body;
    return item;
  }

  #commentRow(row, id, myPhone) {
    const mine = Boolean(
      (id && row.author_id === id) ||
      (myPhone && row.author_phone && row.author_phone === myPhone),
    );
    return {
      id: row.id,
      postId: row.post_id,
      authorName: row.author_name,
      authorDisplay: row.author_phone ? displayPhone(row.author_phone) : "",
      body: row.body,
      createdAt: row.created_at,
      mine,
    };
  }

  board(input) {
    this.#migrate();
    const op = String(input?.op || "list");
    const sql = this.ctx.storage.sql;
    if (op === "stats") {
      const now = Date.now();
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstDayStart = Math.floor((now + kstOffset) / 86400000) * 86400000 - kstOffset;
      const row = sql.exec("SELECT COUNT(*) AS cnt FROM users WHERE phone != ?", GUIDE_PHONE).toArray()[0];
      const activeRow = sql.exec("SELECT COUNT(*) AS cnt FROM users WHERE phone != ? AND updated_at > ?", GUIDE_PHONE, now - 60000).toArray()[0];
      if (!input?.detail) {
        return { ok: true, residents: Number(row?.cnt || 0), activeRecently: Number(activeRow?.cnt || 0) };
      }
      const todayJoinedRow = sql.exec(
        "SELECT COUNT(*) AS cnt FROM users WHERE phone != ? AND COALESCE(created_at, updated_at) >= ?",
        GUIDE_PHONE, kstDayStart,
      ).toArray()[0];
      const todayActiveRow = sql.exec(
        "SELECT COUNT(*) AS cnt FROM users WHERE phone != ? AND updated_at >= ?",
        GUIDE_PHONE, kstDayStart,
      ).toArray()[0];
      const dailyRows = sql.exec(
        `SELECT date((COALESCE(created_at, updated_at) + 32400000) / 1000, 'unixepoch') AS day_kst,
                COALESCE(region, 'jeongja') AS region_key,
                COUNT(*) AS joined
         FROM users
         WHERE phone != ?
         GROUP BY day_kst, region_key
         ORDER BY day_kst DESC, joined DESC
         LIMIT 60`,
        GUIDE_PHONE,
      ).toArray();
      const regionRows = sql.exec(
        `SELECT COALESCE(region, 'jeongja') AS region_key,
                COUNT(*) AS residents
         FROM users
         WHERE phone != ?
         GROUP BY region_key
         ORDER BY residents DESC`,
        GUIDE_PHONE,
      ).toArray();
      const postsRow = sql.exec("SELECT COUNT(*) AS cnt FROM posts WHERE category != 'notice'").toArray()[0];
      const commentsRow = sql.exec("SELECT COUNT(*) AS cnt FROM post_comments").toArray()[0];
      const likesRow = sql.exec("SELECT COUNT(*) AS cnt FROM post_likes").toArray()[0];
      const smsRow = sql.exec("SELECT COUNT(*) AS cnt FROM messages WHERE sender != ?", GUIDE_PHONE).toArray()[0];
      const rKey = String(input?.region || DEFAULT_REGION).trim().toLowerCase() || DEFAULT_REGION;
      return {
        ok: true,
        region: rKey,
        regionName: regionLabelOf(rKey),
        residents: Number(row?.cnt || 0),
        activeRecently: Number(activeRow?.cnt || 0),
        todayJoined: Number(todayJoinedRow?.cnt || 0),
        todayActive: Number(todayActiveRow?.cnt || 0),
        byRegion: regionRows.map((r) => ({
          region: r.region_key,
          regionName: regionLabelOf(r.region_key),
          residents: Number(r.residents || 0),
        })),
        community: {
          userPosts: Number(postsRow?.cnt || 0),
          comments: Number(commentsRow?.cnt || 0),
          likes: Number(likesRow?.cnt || 0),
          userSmsSent: Number(smsRow?.cnt || 0),
        },
        dailySignups: dailyRows.map((r) => ({
          date: r.day_kst,
          region: r.region_key,
          regionName: regionLabelOf(r.region_key),
          joined: Number(r.joined || 0),
        })),
      };
    }
    const id = String(input?.id || "");
    const found = ID_RE.test(id) ? this.#user(id) : { user: null };
    const user = found.user || null;
    const myPhone = user?.phone || null;

    if (op === "list") {
      this.#syncNotices();
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
            `SELECT p.id, p.category, p.title, p.author_id, p.author_phone, p.author_name, p.views, p.created_at, p.updated_at,
                    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
                    (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comments_count
             FROM posts p WHERE p.category = ? ORDER BY p.id DESC LIMIT ? OFFSET ?`,
            filterCat, BOARD_PAGE_SIZE, offset,
          ).toArray()
        : sql.exec(
            `SELECT p.id, p.category, p.title, p.author_id, p.author_phone, p.author_name, p.views, p.created_at, p.updated_at,
                    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
                    (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comments_count
             FROM posts p
             ORDER BY CASE WHEN p.category = 'notice' THEN 0 ELSE 1 END ASC, p.id DESC
             LIMIT ? OFFSET ?`,
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
      if (!input?.noView) {
        sql.exec("UPDATE posts SET views = views + 1 WHERE id = ?", postId);
        row.views = (row.views || 0) + 1;
      }
      const commentRows = sql.exec(
        "SELECT id, post_id, author_id, author_phone, author_name, body, created_at FROM post_comments WHERE post_id = ? ORDER BY id ASC LIMIT 200",
        postId,
      ).toArray();
      return {
        ok: true,
        post: this.#postRow(row, id, myPhone, true),
        comments: commentRows.map((c) => this.#commentRow(c, id, myPhone)),
      };
    }

    if (!ID_RE.test(id)) return { ok: false, error: "bad_id" };

    if (op === "like") {
      const postId = Math.floor(Number(input?.postId) || 0);
      if (!postId) return { ok: false, error: "post_not_found" };
      const postExists = sql.exec("SELECT id FROM posts WHERE id = ?", postId).toArray()[0];
      if (!postExists) return { ok: false, error: "post_not_found" };
      const existingLike = myPhone
        ? sql.exec(
            "SELECT user_id FROM post_likes WHERE post_id = ? AND (user_id = ? OR user_phone = ?) LIMIT 1",
            postId, id, myPhone,
          ).toArray()[0]
        : sql.exec(
            "SELECT user_id FROM post_likes WHERE post_id = ? AND user_id = ? LIMIT 1",
            postId, id,
          ).toArray()[0];
      let liked = false;
      if (existingLike) {
        if (myPhone) {
          sql.exec("DELETE FROM post_likes WHERE post_id = ? AND (user_id = ? OR user_phone = ?)", postId, id, myPhone);
        } else {
          sql.exec("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?", postId, id);
        }
        liked = false;
      } else {
        sql.exec(
          "INSERT INTO post_likes (post_id, user_id, user_phone, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(post_id, user_id) DO NOTHING",
          postId, id, myPhone, Date.now(),
        );
        liked = true;
      }
      const likesCount = Number(
        sql.exec("SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?", postId).toArray()[0]?.n || 0,
      );
      return { ok: true, postId, liked, likesCount };
    }

    if (op === "comment_create") {
      const postId = Math.floor(Number(input?.postId) || 0);
      if (!postId) return { ok: false, error: "post_not_found" };
      const postExists = sql.exec("SELECT id FROM posts WHERE id = ?", postId).toArray()[0];
      if (!postExists) return { ok: false, error: "post_not_found" };
      const body = cleanCommentBody(input?.body);
      if (!body) return { ok: false, error: "empty" };
      const authorName = user?.name || cleanName(input?.name) || "손님";
      const now = Date.now();
      sql.exec(
        "INSERT INTO post_comments (post_id, author_id, author_phone, author_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        postId, id, myPhone, authorName, body, now,
      );
      const inserted = sql.exec(
        "SELECT id, post_id, author_id, author_phone, author_name, body, created_at FROM post_comments WHERE post_id = ? ORDER BY id DESC LIMIT 1",
        postId,
      ).toArray()[0];
      const commentsCount = Number(
        sql.exec("SELECT COUNT(*) AS n FROM post_comments WHERE post_id = ?", postId).toArray()[0]?.n || 0,
      );
      return {
        ok: true,
        comment: this.#commentRow(inserted, id, myPhone),
        commentsCount,
      };
    }

    if (op === "comment_delete") {
      const commentId = Math.floor(Number(input?.commentId) || 0);
      if (!commentId) return { ok: false, error: "comment_not_found" };
      const existing = sql.exec(
        "SELECT id, post_id, author_id, author_phone FROM post_comments WHERE id = ?",
        commentId,
      ).toArray()[0];
      if (!existing) return { ok: false, error: "comment_not_found" };
      const isMine = existing.author_id === id || (myPhone && existing.author_phone === myPhone);
      if (!isMine) return { ok: false, error: "forbidden" };
      sql.exec("DELETE FROM post_comments WHERE id = ?", commentId);
      const commentsCount = Number(
        sql.exec("SELECT COUNT(*) AS n FROM post_comments WHERE post_id = ?", existing.post_id).toArray()[0]?.n || 0,
      );
      return { ok: true, postId: existing.post_id, commentsCount };
    }

    if (op === "create") {
      const cat = String(input?.category || "free");
      if (!WRITABLE_BOARD_CATS.has(cat)) return { ok: false, error: "bad_category" };
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
      return { ok: true, post: this.#postRow(inserted, id, myPhone, true), comments: [] };
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
      const cat = existing.category === "notice" ? "notice" : String(input?.category || existing.category);
      if (cat !== "notice" && !WRITABLE_BOARD_CATS.has(cat)) return { ok: false, error: "bad_category" };
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
      const commentRows = sql.exec(
        "SELECT id, post_id, author_id, author_phone, author_name, body, created_at FROM post_comments WHERE post_id = ? ORDER BY id ASC LIMIT 200",
        postId,
      ).toArray();
      return {
        ok: true,
        post: this.#postRow(existing, id, myPhone, true),
        comments: commentRows.map((c) => this.#commentRow(c, id, myPhone)),
      };
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
      sql.exec("DELETE FROM post_likes WHERE post_id = ?", postId);
      sql.exec("DELETE FROM post_comments WHERE post_id = ?", postId);
      sql.exec("DELETE FROM posts WHERE id = ?", postId);
      return { ok: true };
    }

    return { ok: false, error: "bad_op" };
  }

  stats() {
    this.#migrate();
    const row = this.ctx.storage.sql.exec("SELECT COUNT(*) AS cnt FROM users WHERE phone != ?", GUIDE_PHONE).toArray()[0];
    return { residents: Number(row?.cnt || 0) };
  }
}
