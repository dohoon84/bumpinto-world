// [arcade-pang] D1 읽기·쓰기. 규칙은 rules.js. 월간 1·2·3만 정산(참여/일일/주간 지급 없음).
import { appendLedger } from '../account/ledger.js';
import {
  bestScore, decideAttempt, kstDayKey, monthKey, monthlyBestPays, rankRows, GAME_ID,
} from './rules.js';

export function arcadeRankEnabled(env) {
  return String(env?.ARCADE_RANK_ENABLED ?? env?.BP24_RANK_ENABLED ?? '1') !== '0';
}

const one = async (db, sql, ...bind) => (await db.prepare(sql).bind(...bind).first()) || null;
const all = async (db, sql, ...bind) => (await db.prepare(sql).bind(...bind).all())?.results || [];

export async function attemptsUsed(db, playerKey, gameId, storeId, day) {
  const r = await one(db, 'SELECT COUNT(*) AS n FROM arcade_runs WHERE player_key = ? AND game_id = ? AND store_id = ? AND day_key = ?', playerKey, gameId, storeId, day);
  return Number(r?.n || 0);
}

export async function recordRun(db, { playerKey, accountId, guest, gameId, storeId, name, score, level = 1, durationMs = 0, now, practice }) {
  const day = kstDayKey(now);
  const used = await attemptsUsed(db, playerKey, gameId, storeId, day);
  const decision = decideAttempt({ now, guest, used, practice });
  if (!decision.record) return { ...decision, day };
  const attempt = decision.attempt;
  const lv = Math.max(1, Math.round(Number(level) || 1));
  const dur = Math.max(0, Math.round(Number(durationMs) || 0));
  try {
    await db.prepare(
      `INSERT INTO arcade_runs (game_id, player_key, account_id, store_id, day_key, score, name, guest, attempt, at, level, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(player_key, game_id, store_id, day_key, attempt) DO NOTHING`,
    ).bind(gameId, playerKey, accountId, storeId, day, score, name, guest ? 1 : 0, attempt, now, lv, dur).run();
  } catch {
    // 마이그레이션 전 DB: level/duration 없이 기록
    await db.prepare(
      `INSERT INTO arcade_runs (game_id, player_key, account_id, store_id, day_key, score, name, guest, attempt, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(player_key, game_id, store_id, day_key, attempt) DO NOTHING`,
    ).bind(gameId, playerKey, accountId, storeId, day, score, name, guest ? 1 : 0, attempt, now).run();
  }
  const prev = await one(db, 'SELECT score FROM arcade_best WHERE player_key = ? AND game_id = ? AND store_id = ? AND day_key = ?', playerKey, gameId, storeId, day);
  const best = bestScore(prev ? Number(prev.score) : null, score);
  if (!prev || best === score) {
    await db.prepare(
      `INSERT INTO arcade_best (game_id, player_key, account_id, store_id, day_key, name, guest, score, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_key, game_id, store_id, day_key) DO UPDATE SET
         score = excluded.score, at = excluded.at, name = excluded.name
       WHERE excluded.score > arcade_best.score`,
    ).bind(gameId, playerKey, accountId, storeId, day, name, guest ? 1 : 0, score, now).run();
  }
  // 월간 best 갱신(정산은 별도 job)
  const mk = monthKey(now);
  const mprev = await one(db, 'SELECT score FROM arcade_month_best WHERE player_key = ? AND game_id = ? AND store_id = ? AND month_key = ?', playerKey, gameId, storeId, mk);
  const mbest = bestScore(mprev ? Number(mprev.score) : null, score);
  if (!mprev || mbest === score) {
    await db.prepare(
      `INSERT INTO arcade_month_best (game_id, player_key, account_id, store_id, month_key, name, guest, score, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_key, game_id, store_id, month_key) DO UPDATE SET
         score = excluded.score, at = excluded.at, name = excluded.name, account_id = excluded.account_id
       WHERE excluded.score > arcade_month_best.score`,
    ).bind(gameId, playerKey, accountId, storeId, mk, name, guest ? 1 : 0, score, now).run();
  }
  return { record: true, day, attempt, left: decision.left, best, participation: null };
}

export async function storeBoard(db, gameId, storeId, period, now) {
  const day = kstDayKey(now);
  if (period === 'month') {
    const mk = monthKey(now);
    const rows = rankRows((await all(db, 'SELECT player_key, account_id, name, guest, score, at FROM arcade_month_best WHERE game_id = ? AND store_id = ? AND month_key = ?', gameId, storeId, mk)).map(asRow)).slice(0, 20);
    return { rows, period: 'month', month: mk };
  }
  if (period === 'week') {
    // 최근 7일 best 중 최고
    const since = kstDayKey(now - 6 * 864e5);
    const rows = rankRows((await all(db,
      `SELECT player_key, account_id, name, guest, MAX(score) AS score, MAX(at) AS at
       FROM arcade_best WHERE game_id = ? AND store_id = ? AND day_key >= ?
       GROUP BY player_key`, gameId, storeId, since)).map(asRow)).slice(0, 20);
    return { rows, period: 'week' };
  }
  const rows = rankRows((await all(db, 'SELECT player_key, account_id, name, guest, score, at FROM arcade_best WHERE game_id = ? AND store_id = ? AND day_key = ?', gameId, storeId, day)).map(asRow)).slice(0, 20);
  return { rows, period: 'today', day };
}

function asRow(r) {
  return { playerKey: r.player_key, accountId: r.account_id || null, name: r.name, guest: !!r.guest, score: Number(r.score), at: Number(r.at) };
}

/** 월간 정산 — 도훈님이 cron/수동으로. 1·2·3만 지급. */
export async function settleArcadeMonth(db, env, month, gameId = GAME_ID, storeId = 'arcade-seohyeon', now = Date.now()) {
  const raw = (await all(db, 'SELECT player_key, account_id, name, guest, score, at FROM arcade_month_best WHERE game_id = ? AND store_id = ? AND month_key = ?', gameId, storeId, month)).map(asRow);
  const rows = rankRows(raw);
  if (rows.filter((r) => !r.guest).length < 5 && rows.length < 5) {
    // MIN_PARTICIPANTS — still allow if enough rows; soft check
  }
  const pays = monthlyBestPays(rows, month, gameId);
  const applied = [];
  for (const p of pays) {
    const seen = await one(db, 'SELECT 1 AS x FROM arcade_settlement WHERE idempotency_key = ?', p.key);
    if (seen) continue;
    const led = await appendLedger(db, {
      accountId: p.accountId, amount: p.amount, kind: 'free', reason: 'arcade', ref: gameId, idempotencyKey: p.key,
    }, { now });
    if (led.applied) {
      await db.prepare(
        `INSERT INTO arcade_settlement (idempotency_key, account_id, period, kind, game_id, store_id, amount, rank, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(p.key, p.accountId, month, 'monthly', gameId, storeId, p.amount, p.rank, now).run();
      await db.prepare(
        `INSERT INTO arcade_notices (idempotency_key, player_key, account_id, amount, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(p.key, `a:${p.accountId}`, p.accountId, p.amount, `범핑팡 월간 ${p.rank}등 +${p.amount} bum`, now).run();
      applied.push(p);
    }
  }
  return applied;
}
