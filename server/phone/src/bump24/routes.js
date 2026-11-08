// [bump24-rank] /bump24/* . BP24_RANK_ENABLED=0 이면 전부 끔.
import { sessionFromRequest } from '../account/session.js';
import { creditParticipation, ackNotices, attemptsUsed, pendingNotices, rankEnabled, recordRun, storeBoard } from './db.js';
import { kstDayKey, LIMIT_MSG } from './rules.js';

function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });
}

async function playerOf(request, env, body) {
  let accountId = null;
  try {
    const s = await sessionFromRequest(request, env);
    if (s?.accountId) accountId = s.accountId;
  } catch { /* 세션 비밀이 없으면 게스트 */ }
  const device = String(body?.deviceId || new URL(request.url).searchParams.get('deviceId') || '').replace(/[^\w.-]/g, '').slice(0, 80);
  if (accountId) return { playerKey: `a:${accountId}`, accountId, guest: false };
  if (!device) return null;
  return { playerKey: `g:${device}`, accountId: null, guest: true };
}

export async function handleBump24(request, env, url, cors) {
  if (!rankEnabled(env) || !env?.DB) return json({ ok: false, error: 'disabled' }, 404, cors);
  const path = url.pathname;
  const now = Date.now();
  try {
    if (request.method === 'GET' && path === '/bump24/board') {
      const storeId = String(url.searchParams.get('storeId') || '').slice(0, 80);
      if (!storeId) return json({ ok: false, error: 'bad_store' }, 400, cors);
      return json({ ok: true, ...(await storeBoard(env.DB, storeId, now)) }, 200, cors);
    }
    if (request.method === 'GET' && path === '/bump24/status') {
      const who = await playerOf(request, env, {});
      const storeId = String(url.searchParams.get('storeId') || '').slice(0, 80);
      if (!who || !storeId) return json({ ok: false, error: 'bad_player' }, 400, cors);
      const used = await attemptsUsed(env.DB, who.playerKey, storeId, kstDayKey(now));
      const cap = who.guest ? 1 : 5;
      const usedUp = used >= cap;
      return json({ ok: true, guest: who.guest, used, left: Math.max(0, cap - used), usedUp, message: usedUp ? LIMIT_MSG : '' }, 200, cors);
    }
    if (request.method === 'GET' && path === '/bump24/pending') {
      const who = await playerOf(request, env, {});
      if (!who) return json({ ok: true, notices: [] }, 200, cors);
      return json({ ok: true, notices: await pendingNotices(env.DB, who.playerKey) }, 200, cors);
    }
    if (request.method === 'POST' && path === '/bump24/ack') {
      const body = await request.json().catch(() => ({}));
      const who = await playerOf(request, env, body);
      if (!who) return json({ ok: false, error: 'bad_player' }, 400, cors);
      await ackNotices(env.DB, who.playerKey, now);
      return json({ ok: true }, 200, cors);
    }
    if (request.method === 'POST' && path === '/bump24/run') {
      const body = await request.json().catch(() => ({}));
      const who = await playerOf(request, env, body);
      const storeId = String(body?.storeId || '').slice(0, 80);
      const score = Math.round(Number(body?.score));
      const name = String(body?.name || '나').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || '나';
      if (!who || !storeId || !Number.isFinite(score) || score < 0) return json({ ok: false, error: 'bad_run' }, 400, cors);
      const out = await recordRun(env.DB, { ...who, storeId, name, score, now, practice: !!body?.practice });
      if (out.participation) await creditParticipation(env.DB, env, out.participation, who.playerKey, now);
      return json({ ok: true, ...out }, 200, cors);
    }
  } catch (error) {
    return json({ ok: false, error: 'server', detail: String(error?.message || error) }, 500, cors);
  }
  return json({ ok: false, error: 'not_found' }, 404, cors);
}

export async function settleBump24(env, now = Date.now()) {
  if (!rankEnabled(env) || !env?.DB) return { skipped: true };
  const { settleDay, settleWeek, settleMonth, daysOfWeek, daysOfMonth, kstDayKey, weekKey, monthKey } = await import('./db.js');
  const yest = kstDayKey(now - 864e5);
  const daily = await settleDay(env.DB, env, yest, now);
  let weekly = [], monthly = [];
  const parts = new Date(now + 9 * 3600e3);
  if (parts.getUTCDay() === 1) {
    const week = weekKey(now - 864e5);
    weekly = await settleWeek(env.DB, env, week, daysOfWeek(week), now);
  }
  if (parts.getUTCDate() === 1) {
    const month = monthKey(now - 864e5);
    monthly = await settleMonth(env.DB, env, month, daysOfMonth(month), now);
  }
  return { daily, weekly, monthly };
}
