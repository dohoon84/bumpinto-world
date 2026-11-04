// [accounts] D1 계정·기기 연결·이전 조율·웰컴 지급.
// PhoneBook(DO) 쪽 일(기기 상태 조회, 실제 이전)은 book 스텁으로 부른다:
//   book.accountDevices({ ids }) → { devices: { [id]: { exists, createdAt, giftQty, photoCount, phoneTail } } }
//   book.accountMerge({ fromId, toId, accountId, dry }) → { ok, status, summary, orphanKeys }
// 이 파일은 cloudflare:workers 를 가져오지 않는다 — node 단위 테스트가 D1 대역 + 가짜 book 으로 부른다.
import { appendLedger, getBalance } from "./ledger.js";
import { BETA_FREE_BUM, BETA_WINDOW_DAYS, PRICE_TABLE_VERSION, WELCOME_FREE_BUM } from "./econ.js";
import { economyOpenAt, maxDevices, migrateMode } from "./flags.js";

export const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 연결 결과 상태 (클라이언트에 그대로 간다) */
export const LINK = Object.freeze({
  NO_DEVICE: "no_device",
  LINKED: "linked",
  ALREADY: "already_linked",
  OTHER: "linked_to_other_account",
  LIMIT: "device_limit",
});

function clip(v, n) {
  const s = String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim();
  return s ? s.slice(0, n) : null;
}

export async function upsertAccount(db, claims, now = Date.now()) {
  const id = crypto.randomUUID();
  const row = await db
    .prepare(
      `INSERT INTO accounts (id, google_sub, email, name, created_at, first_login_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(google_sub) DO UPDATE SET
         email = excluded.email, name = excluded.name, last_login_at = excluded.last_login_at
       RETURNING *`,
    )
    .bind(id, String(claims.sub), clip(claims.email, 254), clip(claims.name, 80), now, now, now)
    .first();
  return { account: row, created: row?.id === id };
}

export async function accountById(db, id) {
  if (!id) return null;
  return db.prepare("SELECT * FROM accounts WHERE id = ? AND status = 'active'").bind(String(id)).first();
}

/** 세션 쿠키 → 활성 계정 (session_version 이 맞아야 함) */
export async function accountForSession(db, session) {
  if (!session) return null;
  const acc = await accountById(db, session.accountId);
  if (!acc) return null;
  if (Number(acc.session_version || 1) !== Number(session.sessionVersion || 0)) return null;
  return acc;
}

export async function accountForDevice(db, deviceId) {
  if (!DEVICE_ID_RE.test(String(deviceId || ""))) return null;
  return db
    .prepare("SELECT a.* FROM account_devices d JOIN accounts a ON a.id = d.account_id WHERE d.device_id = ? AND a.status = 'active'")
    .bind(String(deviceId))
    .first();
}

export async function devicesOf(db, accountId) {
  const { results } = await db
    .prepare("SELECT device_id, linked_at, merge_status, merged_at FROM account_devices WHERE account_id = ? ORDER BY linked_at, device_id")
    .bind(accountId)
    .all();
  return results || [];
}

/**
 * 이 기기를 계정에 붙인다. 다른 계정에 붙은 기기는 건드리지 않는다(이전도 안 함).
 * @returns {Promise<{status:string}>}
 */
export async function linkDevice(db, env, accountId, deviceId, now = Date.now()) {
  if (!DEVICE_ID_RE.test(String(deviceId || ""))) return { status: LINK.NO_DEVICE };
  const dev = String(deviceId).toLowerCase();
  const existing = await db.prepare("SELECT account_id FROM account_devices WHERE device_id = ?").bind(dev).first();
  if (existing) return { status: existing.account_id === accountId ? LINK.ALREADY : LINK.OTHER };
  // 이 계정의 대표 캐릭터 id 로 들어온 경우(이미 대표 id 를 쓰는 PC) — 따로 행을 만들 필요 없음
  const acc = await accountById(db, accountId);
  if (acc?.primary_user_id && acc.primary_user_id === dev) return { status: LINK.ALREADY };
  const limit = maxDevices(env);
  // 한도 검사와 삽입을 한 문장으로 (동시 로그인에도 한도를 넘지 않게)
  const res = await db
    .prepare(
      `INSERT INTO account_devices (device_id, account_id, linked_at, merge_status)
       SELECT ?, ?, ?, 'pending'
       WHERE (SELECT COUNT(*) FROM account_devices WHERE account_id = ?) < ?
       ON CONFLICT(device_id) DO NOTHING`,
    )
    .bind(dev, accountId, now, accountId, limit)
    .run();
  if (Number(res?.meta?.changes || 0) > 0) return { status: LINK.LINKED };
  const again = await db.prepare("SELECT account_id FROM account_devices WHERE device_id = ?").bind(dev).first();
  if (again) return { status: again.account_id === accountId ? LINK.ALREADY : LINK.OTHER };
  return { status: LINK.LIMIT, limit };
}

async function logMigration(db, accountId, deviceId, toUserId, mode, summary, now) {
  if (!summary) return;
  const rows = [];
  for (const g of summary.gifts || []) rows.push([`gift:${g.item}`, g.qty, null]);
  if (summary.photosMoved) rows.push(["photos", summary.photosMoved, null]);
  if (summary.photosDeduped) rows.push(["photos_dedup", summary.photosDeduped, null]);
  if (summary.photosKept) rows.push(["photos_kept", summary.photosKept, "id clash; left on device"]);
  if (summary.places?.length) rows.push(["places", summary.places.length, summary.places.join(",").slice(0, 200)]);
  if (summary.phoneTail) rows.push(["phone", 0, `recovery …${summary.phoneTail}`]);
  if (!rows.length) rows.push(["nothing", 0, null]);
  await db.batch(
    rows.map(([item, qty, detail]) =>
      db
        .prepare("INSERT INTO migrations_log (account_id, device_id, to_user_id, mode, item, qty, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(accountId, deviceId, toUserId, mode, item, qty | 0, detail, now),
    ),
  );
}

/**
 * 계정의 대표 캐릭터를 정하고, 아직 안 옮긴 기기들을 대표로 옮긴다. 로그인·연결 때마다 불러도 된다(멱등).
 * 대표 = 연결 순서상 처음으로 PhoneBook 에 캐릭터(users 행)가 있는 기기.
 * @returns {Promise<{primaryUserId:string|null, mode:string, merged:Array, orphanKeys:string[]}>}
 */
export async function reconcileAccount(db, env, book, accountId, now = Date.now()) {
  const mode = migrateMode(env);
  const out = { primaryUserId: null, mode, merged: [], orphanKeys: [] };
  let acc = await accountById(db, accountId);
  if (!acc) return out;
  const devices = await devicesOf(db, accountId);
  const ids = devices.map((d) => d.device_id);
  if (!ids.length && !acc.primary_user_id) return out;
  let info = {};
  if (book && ids.length) {
    const r = await book.accountDevices({ ids });
    info = r?.devices || {};
  }
  if (!acc.primary_user_id) {
    const first = devices.find((d) => info[d.device_id]?.exists);
    if (first) {
      await db.batch([
        db.prepare("UPDATE accounts SET primary_user_id = ? WHERE id = ? AND primary_user_id IS NULL").bind(first.device_id, accountId),
        db.prepare("UPDATE account_devices SET merge_status = 'primary', merged_at = ? WHERE device_id = ? AND account_id = ?")
          .bind(now, first.device_id, accountId),
      ]);
      acc = await accountById(db, accountId);
    }
  }
  const primary = acc?.primary_user_id || null;
  out.primaryUserId = primary;
  if (!primary) return out; // 아직 캐릭터가 있는 기기가 없음 — 전부 pending 으로 둔다
  for (const d of devices) {
    if (d.device_id === primary) {
      if (d.merge_status !== "primary") {
        await db.prepare("UPDATE account_devices SET merge_status = 'primary' WHERE device_id = ?").bind(d.device_id).run();
      }
      continue;
    }
    if (d.merge_status === "merged" || d.merge_status === "none") continue;
    if (!info[d.device_id]?.exists) {
      await db.prepare("UPDATE account_devices SET merge_status = 'none', merged_at = ? WHERE device_id = ?").bind(now, d.device_id).run();
      continue;
    }
    if (mode === "off") continue;
    if (mode === "dry") {
      if (d.merge_status === "dry") continue;
      const r = await book.accountMerge({ fromId: d.device_id, toId: primary, accountId, dry: true });
      if (!r?.ok) continue;
      await logMigration(db, accountId, d.device_id, primary, "dry", r.summary, now);
      await db.prepare("UPDATE account_devices SET merge_status = 'dry' WHERE device_id = ?").bind(d.device_id).run();
      out.merged.push({ device: d.device_id, status: "dry", summary: r.summary });
      continue;
    }
    const r = await book.accountMerge({ fromId: d.device_id, toId: primary, accountId, dry: false });
    if (!r?.ok) continue;
    if (r.status === "merged") await logMigration(db, accountId, d.device_id, primary, "on", r.summary, now);
    await db.prepare("UPDATE account_devices SET merge_status = 'merged', merged_at = ? WHERE device_id = ?").bind(now, d.device_id).run();
    out.merged.push({ device: d.device_id, status: r.status, summary: r.summary || null });
    for (const k of r.orphanKeys || []) out.orphanKeys.push(k);
  }
  return out;
}

/** 웰컴(계정당 1회) + 베타 감사(조건부, 기기당 1회). ECONOMY_ENABLED 는 호출하는 쪽이 확인한다. */
export async function grantStarters(db, env, book, accountId, now = Date.now()) {
  const granted = [];
  const w = await appendLedger(
    db,
    { accountId, amount: WELCOME_FREE_BUM, kind: "free", reason: "welcome", idempotencyKey: `welcome:${accountId}`, priceTableVersion: PRICE_TABLE_VERSION },
    { now },
  );
  if (w.applied) granted.push({ reason: "welcome", amount: WELCOME_FREE_BUM });
  const openAt = economyOpenAt(env);
  if (openAt && now <= openAt + BETA_WINDOW_DAYS * 86400_000) {
    const already = await db.prepare("SELECT 1 AS n FROM ledger WHERE idempotency_key = ?").bind(`beta:${accountId}`).first();
    if (!already && book) {
      const devices = await devicesOf(db, accountId);
      const ids = devices.map((d) => d.device_id);
      const info = ids.length ? (await book.accountDevices({ ids }))?.devices || {} : {};
      for (const id of ids) {
        const d = info[id];
        if (!d?.exists) continue;
        const beforeOpen = !d.createdAt || d.createdAt < openAt; // created_at 이 없던 시절 행 = 오픈 전
        if (!(beforeOpen || d.giftQty > 0 || d.photoCount > 0)) continue;
        const b = await appendLedger(
          db,
          { accountId, amount: BETA_FREE_BUM, kind: "free", reason: "beta", ref: id, idempotencyKey: `beta:${accountId}`, priceTableVersion: PRICE_TABLE_VERSION },
          { now, requireClaim: `beta-dev:${id}` },
        );
        if (b.applied) {
          granted.push({ reason: "beta", amount: BETA_FREE_BUM });
          break;
        }
      }
    }
  }
  return { granted, balance: await getBalance(db, accountId) };
}

export function maskDevice(id) {
  const s = String(id || "");
  return s ? `${s.slice(0, 4)}…${s.slice(-4)}` : "";
}
