// [bump24-rank] D1 읽기·쓰기. 규칙은 rules.js.
import { appendLedger } from '../account/ledger.js';
import {
  bestScore, boardView, dailyRankPays, decideAttempt, kstDayKey, monthKey, monthlyPays,
  participationPay, pointRows, rankRows, weekKey, weeklyPays,
} from './rules.js';

export function rankEnabled(env) {
  return String(env?.BP24_RANK_ENABLED ?? '1') !== '0';
}

const one = async (db, sql, ...bind) => (await db.prepare(sql).bind(...bind).first()) || null;
const all = async (db, sql, ...bind) => (await db.prepare(sql).bind(...bind).all())?.results || [];

export async function attemptsUsed(db, playerKey, storeId, day) {
  const r = await one(db, 'SELECT COUNT(*) AS n FROM bump24_runs WHERE player_key = ? AND store_id = ? AND day_key = ?', playerKey, storeId, day);
  return Number(r?.n || 0);
}
export async function storesRecorded(db, playerKey, day) {
  const r = await one(db, 'SELECT COUNT(DISTINCT store_id) AS n FROM bump24_best WHERE player_key = ? AND day_key = ?', playerKey, day);
  return Number(r?.n || 0);
}

// 같은 기기에서 로그인 전에 낸 게스트 최고 기록을 계정 기록 하나로 합친다(한 사람은 순위판에 한 줄, 높은 점수만)
async function mergeGuestBest(db, { device, playerKey, accountId, storeId, day, name, now }) {
  if (!device) return;
  const gk = `g:${device}`;
  const g = await one(db, 'SELECT score FROM bump24_best WHERE player_key = ? AND store_id = ? AND day_key = ?', gk, storeId, day);
  if (!g) return;
  await db.prepare(
    `INSERT INTO bump24_best (player_key, account_id, store_id, day_key, name, guest, score, at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(player_key, store_id, day_key) DO UPDATE SET
       score = excluded.score, at = excluded.at, name = excluded.name
     WHERE excluded.score > bump24_best.score`,
  ).bind(playerKey, accountId, storeId, day, name, Number(g.score), now).run();
  await db.prepare('DELETE FROM bump24_best WHERE player_key = ? AND store_id = ? AND day_key = ?').bind(gk, storeId, day).run();
}

export async function recordRun(db, { playerKey, accountId, guest, storeId, name, score, now, practice, device }) {
  const day = kstDayKey(now);
  const used = await attemptsUsed(db, playerKey, storeId, day);
  const decision = decideAttempt({ now, guest, used, practice });
  if (!decision.record) return { ...decision, day };
  const attempt = decision.attempt;
  const ins = await db.prepare(
    `INSERT INTO bump24_runs (player_key, account_id, store_id, day_key, score, name, guest, attempt, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(player_key, store_id, day_key, attempt) DO NOTHING`,
  ).bind(playerKey, accountId, storeId, day, score, name, guest ? 1 : 0, attempt, now).run();
  if (!Number(ins?.meta?.changes || 0)) return { record: false, practice: true, usedUp: true, day, message: decision.message };
  const prev = await one(db, 'SELECT score FROM bump24_best WHERE player_key = ? AND store_id = ? AND day_key = ?', playerKey, storeId, day);
  const best = bestScore(prev ? Number(prev.score) : null, score);
  if (!prev || best === score) {
    await db.prepare(
      `INSERT INTO bump24_best (player_key, account_id, store_id, day_key, name, guest, score, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_key, store_id, day_key) DO UPDATE SET
         score = excluded.score, at = excluded.at, name = excluded.name
       WHERE excluded.score > bump24_best.score`,
    ).bind(playerKey, accountId, storeId, day, name, guest ? 1 : 0, score, now).run();
  }
  if (accountId) await mergeGuestBest(db, { device, playerKey, accountId, storeId, day, name, now });
  let participation = null;
  if (accountId) {
    const already = await storesRecorded(db, playerKey, day);
    const had = await one(db, 'SELECT 1 AS x FROM bump24_best WHERE player_key = ? AND store_id = ? AND day_key = ?', playerKey, storeId, day);
    const storesAlready = Math.max(0, already - (had ? 1 : 0));
    participation = participationPay({ accountId, day, storeId, storesAlready });
  }
  const rows = rankRows((await all(db, 'SELECT player_key, account_id, name, guest, score, at FROM bump24_best WHERE store_id = ? AND day_key = ?', storeId, day)).map(asRow));
  const me = rows.find((r) => r.playerKey === playerKey);
  return { record: true, day, attempt, left: decision.left, best, rank: me?.rank || null, participation };
}

export async function creditParticipation(db, env, pay, playerKey, now) {
  if (!pay || !env) return null;
  const applied = await appendLedger(db, {
    accountId: pay.accountId, amount: pay.amount, kind: 'free', reason: 'bp24', ref: pay.storeId, idempotencyKey: pay.key,
  }, { now });
  if (applied.applied) await addNotice(db, { ...pay, playerKey, text: `+${pay.amount} bum` }, now);
  return applied;
}

function asRow(r) {
  return { playerKey: r.player_key, accountId: r.account_id || null, name: r.name, guest: !!r.guest, score: Number(r.score), at: Number(r.at) };
}

export async function storeBoard(db, storeId, now) {
  const day = kstDayKey(now);
  const yest = kstDayKey(now - 864e5);
  const today = rankRows((await all(db, 'SELECT player_key, account_id, name, guest, score, at FROM bump24_best WHERE store_id = ? AND day_key = ?', storeId, day)).map(asRow)).slice(0, 10);
  const yesterday = rankRows((await all(db, 'SELECT player_key, account_id, name, guest, score, at FROM bump24_best WHERE store_id = ? AND day_key = ?', storeId, yest)).map(asRow)).filter((r) => r.rank <= 3);
  const view = boardView(now);
  let second = yesterday.map(pub);
  let tab = '어제';
  if (view === 'weekly' || view === 'monthly') {
    const key = view === 'weekly' ? weekKey(now - 864e5) : monthKey(new Date(now + 9 * 3600e3).getTime() - 20 * 864e5);
    const rows = await all(db, 'SELECT player_key, account_id, name, guest, rank, points FROM bump24_podium WHERE period = ? ORDER BY rank ASC LIMIT 10', view === 'weekly' ? `week:${key}` : `month:${key}`);
    if (rows.length) {
      second = rows.map((r) => ({ name: r.name, score: Number(r.points), rank: Number(r.rank), guest: !!r.guest }));
      tab = view === 'weekly' ? '이번 주' : '이달';
    }
  }
  return { today: today.map(pub), yesterday: yesterday.map(pub), second, view, tab };
}
const pub = (r) => ({ name: r.name, score: r.score, rank: r.rank, guest: !!r.guest });

export async function addNotice(db, pay, now) {
  await db.prepare(
    `INSERT INTO bump24_notices (idempotency_key, player_key, account_id, amount, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(idempotency_key) DO NOTHING`,
  ).bind(pay.key, pay.playerKey || `a:${pay.accountId}`, pay.accountId, pay.amount, pay.text || `+${pay.amount} bum`, now).run();
}
export async function pendingNotices(db, playerKey) {
  return all(db, 'SELECT idempotency_key AS key, amount, text FROM bump24_notices WHERE player_key = ? AND acked_at IS NULL ORDER BY created_at', playerKey);
}
export async function ackNotices(db, playerKey, now) {
  await db.prepare('UPDATE bump24_notices SET acked_at = ? WHERE player_key = ? AND acked_at IS NULL').bind(now, playerKey).run();
}

async function dayTops(db, day) {
  const rows = (await all(db, 'SELECT store_id, player_key, account_id, name, guest, score, at FROM bump24_best WHERE day_key = ?', day)).map((r) => ({ ...asRow(r), storeId: r.store_id }));
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.storeId)) by.set(r.storeId, []);
    by.get(r.storeId).push(r);
  }
  const stores = [];
  const tops = [];
  for (const [storeId, list] of by) {
    const ranked = rankRows(list);
    stores.push({ storeId, day, participants: ranked.length, rows: ranked });
    for (const r of ranked) if (r.rank <= 3) tops.push({ ...r, storeId, participants: ranked.length });
  }
  return { stores, tops };
}

export async function settleDay(db, env, day, now) {
  const { stores, tops } = await dayTops(db, day);
  return applyPays(db, env, dailyRankPays(stores).map((p) => ({ ...p, playerKey: `a:${p.accountId}` })), now, `day:${day}`);
}
export async function settleWeek(db, env, week, days, now) {
  const tops = [];
  for (const day of days) tops.push(...(await dayTops(db, day)).tops);
  const rows = pointRows(tops);
  await savePodium(db, `week:${week}`, rows, now);
  return applyPays(db, env, weeklyPays(rows, week).map((p) => ({ ...p, playerKey: `a:${p.accountId}` })), now, `week:${week}`);
}
export async function settleMonth(db, env, month, days, now) {
  const tops = [];
  for (const day of days) tops.push(...(await dayTops(db, day)).tops);
  const rows = pointRows(tops);
  await savePodium(db, `month:${month}`, rows, now);
  return applyPays(db, env, monthlyPays(rows, month).map((p) => ({ ...p, playerKey: `a:${p.accountId}` })), now, `month:${month}`);
}

async function savePodium(db, period, rows, now) {
  for (const r of rows.filter((x) => x.rank <= 10)) {
    await db.prepare(
      `INSERT INTO bump24_podium (period, player_key, account_id, name, guest, rank, points, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(period, player_key) DO NOTHING`,
    ).bind(period, r.playerKey, r.accountId, r.name, r.guest ? 1 : 0, r.rank, r.points, now).run();
  }
}

async function applyPays(db, env, pays, now, period) {
  const applied = [];
  for (const p of pays) {
    const ins = await db.prepare(
      `INSERT INTO bump24_settlement (idempotency_key, account_id, period, kind, store_id, amount, rank, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(idempotency_key) DO NOTHING`,
    ).bind(p.key, p.accountId, period, p.kind, p.storeId || null, p.amount, p.rank || null, now).run();
    if (!Number(ins?.meta?.changes || 0)) continue;
    if (env && p.accountId && p.amount > 0) {
      await appendLedger(db, {
        accountId: p.accountId, amount: p.amount, kind: 'free', reason: 'bp24', ref: p.storeId || period, idempotencyKey: p.key,
      }, { now });
    }
    await addNotice(db, { ...p, text: `+${p.amount} bum` }, now);
    applied.push(p.key);
  }
  return applied;
}

export function daysOfWeek(weekMonday) {
  const t = Date.parse(`${weekMonday}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => new Date(t + i * 864e5).toISOString().slice(0, 10));
}
export function daysOfMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
export { kstDayKey, weekKey, monthKey, boardView };
