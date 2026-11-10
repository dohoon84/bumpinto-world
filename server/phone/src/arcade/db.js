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

export async function mergeGuestBest(db, { device, playerKey, accountId, name, now } = {}) {
  // 같은 기기 게스트 일간·주간(일일 best 합산)·월간 best 와 판수(runs)를 계정으로 옮긴다. 높은 점수를 남기고 게스트 줄을 지운다.
  if (!device || !accountId || !playerKey) return { merged: false };
  const gk = `g:${device}`;
  if (gk === playerKey) return { merged: false };
  const ts = Number(now) || Date.now();
  let merged = false;

  const bests = await all(db, 'SELECT game_id, store_id, day_key, score, name FROM arcade_best WHERE player_key = ?', gk);
  for (const g of bests) {
    await db.prepare(
      `INSERT INTO arcade_best (game_id, player_key, account_id, store_id, day_key, name, guest, score, at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(player_key, game_id, store_id, day_key) DO UPDATE SET
         score = excluded.score, at = excluded.at, name = excluded.name, account_id = excluded.account_id, guest = 0
       WHERE excluded.score > arcade_best.score`,
    ).bind(g.game_id, playerKey, accountId, g.store_id, g.day_key, name || g.name || '', Number(g.score), ts).run();
    await db.prepare('DELETE FROM arcade_best WHERE player_key = ? AND game_id = ? AND store_id = ? AND day_key = ?').bind(gk, g.game_id, g.store_id, g.day_key).run();
    merged = true;
  }

  const months = await all(db, 'SELECT game_id, store_id, month_key, score, name FROM arcade_month_best WHERE player_key = ?', gk);
  for (const g of months) {
    await db.prepare(
      `INSERT INTO arcade_month_best (game_id, player_key, account_id, store_id, month_key, name, guest, score, at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(player_key, game_id, store_id, month_key) DO UPDATE SET
         score = excluded.score, at = excluded.at, name = excluded.name, account_id = excluded.account_id, guest = 0
       WHERE excluded.score > arcade_month_best.score`,
    ).bind(g.game_id, playerKey, accountId, g.store_id, g.month_key, name || g.name || '', Number(g.score), ts).run();
    await db.prepare('DELETE FROM arcade_month_best WHERE player_key = ? AND game_id = ? AND store_id = ? AND month_key = ?').bind(gk, g.game_id, g.store_id, g.month_key).run();
    merged = true;
  }

  let runs = [];
  try {
    runs = await all(db, 'SELECT game_id, store_id, day_key, score, name, attempt, at, level, duration_ms FROM arcade_runs WHERE player_key = ?', gk);
  } catch {
    runs = await all(db, 'SELECT game_id, store_id, day_key, score, name, attempt, at FROM arcade_runs WHERE player_key = ?', gk);
  }
  for (const r of runs) {
    const score = Number(r.score) || 0;
    const nm = name || r.name || '';
    const at = Number(r.at) || ts;
    try {
      await db.prepare(
        `INSERT INTO arcade_runs (game_id, player_key, account_id, store_id, day_key, score, name, guest, attempt, at, level, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
         ON CONFLICT(player_key, game_id, store_id, day_key, attempt) DO UPDATE SET
           score = excluded.score, name = excluded.name, account_id = excluded.account_id, guest = 0
         WHERE excluded.score > arcade_runs.score`,
      ).bind(r.game_id, playerKey, accountId, r.store_id, r.day_key, score, nm, r.attempt, at, Math.max(1, Number(r.level) || 1), Math.max(0, Number(r.duration_ms) || 0)).run();
    } catch {
      await db.prepare(
        `INSERT INTO arcade_runs (game_id, player_key, account_id, store_id, day_key, score, name, guest, attempt, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(player_key, game_id, store_id, day_key, attempt) DO UPDATE SET
           score = excluded.score, name = excluded.name, account_id = excluded.account_id, guest = 0
         WHERE excluded.score > arcade_runs.score`,
      ).bind(r.game_id, playerKey, accountId, r.store_id, r.day_key, score, nm, r.attempt, at).run();
    }
    await db.prepare('DELETE FROM arcade_runs WHERE player_key = ? AND game_id = ? AND store_id = ? AND day_key = ? AND attempt = ?').bind(gk, r.game_id, r.store_id, r.day_key, r.attempt).run();
    merged = true;
  }
  return { merged };
}

export async function recordRun(db, { playerKey, accountId, guest, gameId, storeId, name, score, level = 1, durationMs = 0, now, practice, device }) {
  const day = kstDayKey(now);
  if (accountId && device) {
    await mergeGuestBest(db, { device, playerKey, accountId, gameId, storeId, day, name, now });
  }
  const used = await attemptsUsed(db, playerKey, gameId, storeId, day);
  const decision = decideAttempt({ now, guest, used, practice });
  if (!decision.record) {
    const prev = await one(db, 'SELECT score FROM arcade_best WHERE player_key = ? AND game_id = ? AND store_id = ? AND day_key = ?', playerKey, gameId, storeId, day);
    return { ...decision, day, best: prev ? Number(prev.score) : null, score };
  }
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
  return { record: true, day, attempt, best, participation: null };
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

/** 보드 줄에 지금 요청한 사람(me)을 표시한다. GET·POST 가 같은 스냅샷을 쓰게 한다. */
export function attachMine(board, who) {
  const rows = Array.isArray(board?.rows) ? board.rows.map((r) => ({
    ...r,
    me: !!(who && (
      (who.playerKey && r.playerKey === who.playerKey)
      || (who.accountId && r.accountId && String(r.accountId) === String(who.accountId))
    )),
  })) : [];
  const me = rows.find((r) => r.me) || null;
  return { ...board, rows, me };
}

/** 월간 정산 — 도훈님이 cron/수동으로. 계정 1·2·3등만 지급(게스트 제외). */
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
