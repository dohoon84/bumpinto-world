// [accounts] 기기(= PhoneBook users 행) → 계정 대표 캐릭터로 진행 상황 옮기기. PhoneBook DO 의 SQLite 안에서만 돈다.
//
// 오늘 기기 id(users.id)에 묶여 있는 것 (book.js / room.js / photos.js 실측):
//   gift_holdings(user_id, item_key, qty)   선물·탈것 보유 (room.js #relayVeh / transferGift 가 봄)   → 대표로 합산(같은 품목은 수량 더함)
//   photos(owner, id, sha256, r2_key …)      사진 보관함 메타데이터(R2 원본은 r2_key 그대로)        → owner 를 대표로. 같은 sha 면 오래된 것만 남김
//   user_places(user_id, region, …)          동네별 마지막 위치                                       → 대표에 없는 동네만 복사
//   users.phone / pin_hash                   번호·PIN                                                 → 옮기지 않음. 기기 행에 남겨 "복구 수단"으로 표시
//   messages / contacts / blocks (phone 키)  문자·연락처                                              → 그대로 (번호 기준이라 계정과 무관)
//   posts / post_comments / post_likes (author_id) 게시판                                            → 그대로 (작성자 id 유지, 나중에 별칭 조회)
//   news_tips(user_id)                       사진 제보(30일 뒤 삭제)                                   → 그대로
//   photo_uploads(owner, at)                 시간당 업로드 한도 기록                                   → 그대로
//
// 한 기기는 한 번만 옮긴다(account_merges 에 from_id 기록 → 몇 번 불러도 결과 같음). dry 이면 아무것도 쓰지 않고 할 일만 돌려준다.
// 이 파일은 cloudflare:workers 를 가져오지 않는다 — node 단위 테스트가 node:sqlite 로 그대로 불러 쓴다.
import { ensurePhotoTables } from "./photos.js";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ensureMergeTables(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS account_merges (
    from_id TEXT PRIMARY KEY,
    to_id TEXT NOT NULL,
    account_id TEXT,
    summary TEXT NOT NULL,
    at INTEGER NOT NULL
  )`);
}

function hasTable(sql, name) {
  return !!sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name).toArray()[0];
}

/** 연결/지급 판단용 기기 정보. 번호는 끝 4자리만. */
export function deviceInfo(sql, id) {
  if (!ID_RE.test(String(id || ""))) return { exists: false };
  const u = sql.exec("SELECT id, phone, created_at, updated_at FROM users WHERE id = ?", id).toArray()[0];
  if (!u) return { exists: false };
  ensurePhotoTables(sql);
  const gifts = hasTable(sql, "gift_holdings")
    ? Number(sql.exec("SELECT COALESCE(SUM(qty), 0) AS n FROM gift_holdings WHERE user_id = ? AND qty > 0", id).toArray()[0]?.n || 0)
    : 0;
  const photos = Number(sql.exec("SELECT COUNT(*) AS n FROM photos WHERE owner = ?", id).toArray()[0]?.n || 0);
  return {
    exists: true,
    createdAt: Number(u.created_at ?? u.updated_at ?? 0),
    giftQty: gifts,
    photoCount: photos,
    phoneTail: String(u.phone || "").slice(-4),
  };
}

/** from 기기에서 옮길 것 목록 (쓰기 없음). */
export function planMerge(sql, fromId, toId) {
  ensurePhotoTables(sql);
  const gifts = hasTable(sql, "gift_holdings")
    ? sql.exec("SELECT item_key, qty FROM gift_holdings WHERE user_id = ? AND qty > 0 ORDER BY item_key", fromId).toArray()
    : [];
  const photos = sql.exec("SELECT id, sha256, taken_at, created_at FROM photos WHERE owner = ? ORDER BY created_at", fromId).toArray();
  const photoMoves = [];
  const photoDedups = [];
  const photoKept = [];
  for (const p of photos) {
    const dup = sql.exec("SELECT id, created_at FROM photos WHERE owner = ? AND sha256 = ?", toId, p.sha256).toArray()[0] || null;
    if (!dup) {
      // 다른 사진인데 id 만 같은 경우(무작위 id 라 사실상 없음)는 옮기지 않고 기기 쪽에 둔다
      const clash = sql.exec("SELECT 1 AS n FROM photos WHERE owner = ? AND id = ?", toId, p.id).toArray()[0];
      if (clash) photoKept.push({ id: p.id });
      else photoMoves.push({ id: p.id });
    } else {
      // 같은 사진이면 먼저 만들어진 것을 남긴다
      const fromOlder = Number(p.created_at) < Number(dup.created_at);
      photoDedups.push({ id: p.id, keep: fromOlder ? "from" : "to", dupId: dup.id });
    }
  }
  const places = hasTable(sql, "user_places")
    ? sql.exec(
        `SELECT region FROM user_places p WHERE user_id = ?
         AND NOT EXISTS (SELECT 1 FROM user_places q WHERE q.user_id = ? AND q.region = p.region)`,
        fromId, toId,
      ).toArray().map((r) => r.region)
    : [];
  const phone = sql.exec("SELECT phone FROM users WHERE id = ?", fromId).toArray()[0]?.phone || "";
  return {
    gifts: gifts.map((g) => ({ item: g.item_key, qty: Number(g.qty) })),
    photosMoved: photoMoves.length,
    photosDeduped: photoDedups.length,
    photosKept: photoKept.length,
    photoMoves,
    photoDedups,
    places,
    phoneTail: phone ? String(phone).slice(-4) : "",
  };
}

/**
 * @param sql   DO SQLite (exec(...).toArray())
 * @param tx    (fn) => fn() 을 한 트랜잭션으로 (DO: ctx.storage.transactionSync)
 * @returns {{ok:true, status:'same'|'missing'|'already'|'dry'|'merged', summary?, orphanKeys?:string[]}}
 */
export function mergeUser(sql, tx, { fromId, toId, accountId = null, dry = false, now = Date.now() } = {}) {
  if (!ID_RE.test(String(fromId || "")) || !ID_RE.test(String(toId || ""))) return { ok: false, error: "bad_id" };
  if (fromId === toId) return { ok: true, status: "same" };
  ensureMergeTables(sql);
  const done = sql.exec("SELECT summary FROM account_merges WHERE from_id = ?", fromId).toArray()[0];
  if (done) {
    let summary = null;
    try { summary = JSON.parse(done.summary); } catch {}
    return { ok: true, status: "already", summary };
  }
  const fromExists = !!sql.exec("SELECT 1 AS n FROM users WHERE id = ?", fromId).toArray()[0];
  const toExists = !!sql.exec("SELECT 1 AS n FROM users WHERE id = ?", toId).toArray()[0];
  if (!toExists) return { ok: false, error: "no_primary" };
  if (!fromExists) return { ok: true, status: "missing" };

  const plan = planMerge(sql, fromId, toId);
  const summary = {
    gifts: plan.gifts,
    photosMoved: plan.photosMoved,
    photosDeduped: plan.photosDeduped,
    photosKept: plan.photosKept,
    places: plan.places,
    phoneTail: plan.phoneTail,
  };
  if (dry) return { ok: true, status: "dry", summary };

  const orphanKeys = [];
  tx(() => {
    // 선물·탈것: 수량 합산
    for (const g of plan.gifts) {
      sql.exec(
        `INSERT INTO gift_holdings (user_id, item_key, qty, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, item_key) DO UPDATE SET qty = gift_holdings.qty + excluded.qty, updated_at = excluded.updated_at`,
        toId, g.item, g.qty, now,
      );
      sql.exec("DELETE FROM gift_holdings WHERE user_id = ? AND item_key = ?", fromId, g.item);
    }
    // 사진: 주인만 바꾼다(R2 키는 그대로). 같은 사진이면 오래된 쪽을 남긴다.
    for (const d of plan.photoDedups) {
      if (d.keep === "from") {
        const gone = sql.exec("SELECT r2_key FROM photos WHERE owner = ? AND id = ?", toId, d.dupId).toArray()[0];
        if (gone?.r2_key) orphanKeys.push(gone.r2_key);
        sql.exec("DELETE FROM photos WHERE owner = ? AND id = ?", toId, d.dupId);
        sql.exec("UPDATE photos SET owner = ?, updated_at = ? WHERE owner = ? AND id = ?", toId, now, fromId, d.id);
      } else {
        const gone = sql.exec("SELECT r2_key FROM photos WHERE owner = ? AND id = ?", fromId, d.id).toArray()[0];
        if (gone?.r2_key) orphanKeys.push(gone.r2_key);
        sql.exec("DELETE FROM photos WHERE owner = ? AND id = ?", fromId, d.id);
      }
    }
    for (const p of plan.photoMoves) {
      sql.exec("UPDATE photos SET owner = ?, updated_at = ? WHERE owner = ? AND id = ?", toId, now, fromId, p.id);
    }
    // 동네별 위치: 대표에 없는 동네만
    if (plan.places.length) {
      sql.exec(
        `INSERT OR IGNORE INTO user_places (user_id, region, x, y, z, ry, updated_at)
         SELECT ?, region, x, y, z, ry, updated_at FROM user_places WHERE user_id = ?`,
        toId, fromId,
      );
    }
    sql.exec(
      "INSERT INTO account_merges (from_id, to_id, account_id, summary, at) VALUES (?, ?, ?, ?, ?)",
      fromId, toId, accountId, JSON.stringify(summary), now,
    );
  });
  return { ok: true, status: "merged", summary, orphanKeys };
}
