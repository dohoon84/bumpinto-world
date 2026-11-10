// [arcade-pang] /arcade/* — 범핑팡 랭킹. 참여보상·일일보상 없음.
import { sessionFromRequest } from '../account/session.js';
import { arcadeRankEnabled, attemptsUsed, recordRun, storeBoard, mergeGuestBest, attachMine } from './db.js';
import { kstDayKey, LIMIT_MSG, attemptCap, GAME_ID, STORE_ID, plausibleArcadeRun, resolveGameId } from './rules.js';

function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });
}

async function playerOf(request, env, body) {
  let accountId = null;
  try {
    const s = await sessionFromRequest(request, env);
    if (s?.accountId) accountId = s.accountId;
  } catch { /* guest */ }
  const device = String(body?.deviceId || new URL(request.url).searchParams.get('deviceId') || '').replace(/[^\w.-]/g, '').slice(0, 80);
  if (accountId) return { playerKey: `a:${accountId}`, accountId, guest: false, device };
  if (!device) return null;
  return { playerKey: `g:${device}`, accountId: null, guest: true };
}

export async function handleArcade(request, env, url, cors) {
  if (!arcadeRankEnabled(env) || !env?.DB) return json({ ok: false, error: 'disabled' }, 404, cors);
  const path = url.pathname;
  const now = Date.now();
  try {
    if (request.method === 'GET' && path === '/arcade/board') {
      const gameId = resolveGameId(url.searchParams.get('gameId') || GAME_ID);
      const storeId = String(url.searchParams.get('storeId') || STORE_ID).slice(0, 80);
      const period = String(url.searchParams.get('period') || 'today');
      const who = await playerOf(request, env, {});
      if (who?.accountId && who.device) {
        await mergeGuestBest(env.DB, { device: who.device, playerKey: who.playerKey, accountId: who.accountId, gameId, storeId, day: kstDayKey(now), name: '', now });
      }
      const board = attachMine(await storeBoard(env.DB, gameId, storeId, period, now), who);
      return json({ ok: true, ...board }, 200, cors);
    }
    if (request.method === 'GET' && path === '/arcade/status') {
      const who = await playerOf(request, env, {});
      const gameId = resolveGameId(url.searchParams.get('gameId') || GAME_ID);
      const storeId = String(url.searchParams.get('storeId') || STORE_ID).slice(0, 80);
      if (!who) return json({ ok: false, error: 'bad_player' }, 400, cors);
      if (who.accountId && who.device) {
        await mergeGuestBest(env.DB, { device: who.device, playerKey: who.playerKey, accountId: who.accountId, gameId, storeId, day: kstDayKey(now), name: '', now });
      }
      const used = await attemptsUsed(env.DB, who.playerKey, gameId, storeId, kstDayKey(now));
      const cap = attemptCap(who.guest);
      const usedUp = used >= cap;
      return json({ ok: true, guest: who.guest, used, left: Math.max(0, cap - used), usedUp, message: usedUp ? LIMIT_MSG : '' }, 200, cors);
    }
    if (request.method === 'POST' && path === '/arcade/run') {
      const body = await request.json().catch(() => ({}));
      const who = await playerOf(request, env, body);
      const gameId = resolveGameId(body?.gameId || GAME_ID);
      const storeId = String(body?.storeId || STORE_ID).slice(0, 80);
      const score = Math.round(Number(body?.score));
      const level = Math.max(1, Math.min(40, Math.round(Number(body?.level) || 1)));
      const durationMs = Math.max(0, Math.round(Number(body?.durationMs) || 0));
      const name = String(body?.name || '나').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || '나';
      if (!who || !storeId || !Number.isFinite(score) || score < 0) return json({ ok: false, error: 'bad_run' }, 400, cors);
      const gate = plausibleArcadeRun({ score, level, durationMs, gameId });
      if (!gate.ok) return json({ ok: false, error: 'implausible', reason: gate.reason }, 400, cors);
      const out = await recordRun(env.DB, { ...who, gameId, storeId, name, score, level, durationMs, now, practice: !!body?.practice });
      // 같은 요청 안에서 오늘 보드를 돌려 주어, 다음 GET 이 복제본을 읽더라도 새 최고가 바로 보이게 한다.
      const board = attachMine(await storeBoard(env.DB, gameId, storeId, 'today', now), who);
      return json({ ok: true, ...out, ...board, score }, 200, cors);
    }
  } catch (error) {
    return json({ ok: false, error: 'server', detail: String(error?.message || error) }, 500, cors);
  }
  return json({ ok: false, error: 'not_found' }, 404, cors);
}
