// [accounts] 원장(D1). 행 추가와 잔액 캐시 갱신을 한 batch(= 한 트랜잭션)로 묶는다.
// 같은 idempotency_key 로 두 번 불러도 한 번만 들어간다(두 번째는 applied:false).
// 이 파일은 cloudflare:workers 를 가져오지 않는다 — node 단위 테스트가 D1 대역으로 그대로 불러 쓴다.
import { LEDGER_KINDS, PRICE_TABLE_VERSION } from "./econ.js";

function recomputeBalance(db, accountId, now) {
  return db
    .prepare(
      `INSERT INTO account_balances (account_id, free_balance, paid_balance, updated_at)
       SELECT ?1,
              COALESCE(SUM(CASE WHEN kind = 'free' THEN amount ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN kind = 'paid' THEN amount ELSE 0 END), 0),
              ?2
       FROM ledger WHERE account_id = ?1
       ON CONFLICT(account_id) DO UPDATE SET
         free_balance = excluded.free_balance,
         paid_balance = excluded.paid_balance,
         updated_at = excluded.updated_at`,
    )
    .bind(accountId, now);
}

function cleanEntry(e) {
  const amount = Number(e?.amount);
  if (!Number.isSafeInteger(amount) || amount === 0) throw new Error("bad_amount");
  if (!LEDGER_KINDS.has(e?.kind)) throw new Error("bad_kind");
  const reason = String(e?.reason || "").trim().slice(0, 32);
  if (!reason) throw new Error("bad_reason");
  const key = String(e?.idempotencyKey || "").trim().slice(0, 200);
  if (!key) throw new Error("bad_idempotency_key");
  if (!e?.accountId) throw new Error("bad_account");
  return {
    accountId: String(e.accountId),
    amount,
    kind: e.kind,
    reason,
    ref: e.ref == null ? null : String(e.ref).slice(0, 200),
    key,
    ver: Number.isSafeInteger(e?.priceTableVersion) ? e.priceTableVersion : PRICE_TABLE_VERSION,
  };
}

/**
 * 원장 행 하나를 멱등하게 넣는다.
 * opts.requireClaim = "beta-dev:<id>" 이면 그 보조 키를 같은 batch 안에서 이 계정 몫으로 잡고,
 * 잡힌 경우(이 계정 것)에만 행을 넣는다.
 * @returns {Promise<{applied:boolean, balance:{free:number, paid:number, total:number}}>}
 */
export async function appendLedger(db, entry, { now = Date.now(), requireClaim = null } = {}) {
  const e = cleanEntry(entry);
  const stmts = [];
  if (requireClaim) {
    stmts.push(
      db.prepare("INSERT INTO grant_claims (claim_key, account_id, created_at) VALUES (?, ?, ?) ON CONFLICT(claim_key) DO NOTHING")
        .bind(requireClaim, e.accountId, now),
    );
    stmts.push(
      db.prepare(
        `INSERT INTO ledger (account_id, amount, kind, reason, ref, idempotency_key, price_table_version, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM grant_claims WHERE claim_key = ? AND account_id = ?)
         ON CONFLICT(idempotency_key) DO NOTHING`,
      ).bind(e.accountId, e.amount, e.kind, e.reason, e.ref, e.key, e.ver, now, requireClaim, e.accountId),
    );
  } else {
    stmts.push(
      db.prepare(
        `INSERT INTO ledger (account_id, amount, kind, reason, ref, idempotency_key, price_table_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(idempotency_key) DO NOTHING`,
      ).bind(e.accountId, e.amount, e.kind, e.reason, e.ref, e.key, e.ver, now),
    );
  }
  const insertIdx = stmts.length - 1;
  stmts.push(recomputeBalance(db, e.accountId, now));
  const results = await db.batch(stmts);
  const applied = Number(results[insertIdx]?.meta?.changes || 0) > 0;
  return { applied, balance: await getBalance(db, e.accountId) };
}

export async function getBalance(db, accountId) {
  const row = await db.prepare("SELECT free_balance, paid_balance FROM account_balances WHERE account_id = ?").bind(accountId).first();
  const free = Number(row?.free_balance || 0);
  const paid = Number(row?.paid_balance || 0);
  return { free, paid, total: free + paid };
}

/** 캐시와 원장 합계가 같은지 (운영 점검·테스트용) */
export async function ledgerSum(db, accountId) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'free' THEN amount ELSE 0 END), 0) AS free,
              COALESCE(SUM(CASE WHEN kind = 'paid' THEN amount ELSE 0 END), 0) AS paid
       FROM ledger WHERE account_id = ?`,
    )
    .bind(accountId)
    .first();
  return { free: Number(row?.free || 0), paid: Number(row?.paid || 0) };
}

export async function recentLedger(db, accountId, limit = 20) {
  const { results } = await db
    .prepare("SELECT id, amount, kind, reason, created_at FROM ledger WHERE account_id = ? ORDER BY id DESC LIMIT ?")
    .bind(accountId, Math.max(1, Math.min(50, limit | 0)))
    .all();
  return (results || []).map((r) => ({ id: r.id, amount: r.amount, kind: r.kind, reason: r.reason, at: r.created_at }));
}
