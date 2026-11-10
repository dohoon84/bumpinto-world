// [arcade] 범편의점·범핑팡 랭킹 기간(KST) · 게스트 합치기 · ?shot 연습 · 워커 연결
import { readFileSync } from 'node:fs';
import {
  kstDayKey, monthKey, resolveGameId, GAME_ID, MERGE_GAME_ID, decideAttempt, OPENING_MS,
  monthlyRewardSub, MONTHLY_BUM, monthlyBestPays, rankRows,
} from '../server/phone/src/arcade/rules.js';
import { storeBoard, mergeGuestBest, recordRun, attachMine } from '../server/phone/src/arcade/db.js';
import { arcadeShotMode, mergeEnabled, MERGE_GAME_ID as CLIENT_MERGE_ID } from '../src/arcade/flag.js';
import { plausibleArcadeRun } from '../server/phone/src/arcade/rules.js';
import { splitBoardMine, sameRankPlayer } from '../src/arcade/boardView.js';
import { LOGIN_NUDGE_TEXT } from '../src/arcade/loginNudge.js';
import { resolveGuest, isGuestFlag, clientSignedIn } from '../src/arcade/guest.js';

const assert = (c, m) => { if (!c) throw new Error(m); };

function memoryD1() {
  const best = [];
  const month = [];
  const runs = [];
  const stmt = (sql) => {
    const binds = [];
    const api = {
      bind(...a) { binds.push(...a); return api; },
      async first() { return (await api._rows())[0] || null; },
      async all() { return { results: await api._rows() }; },
      async run() {
        const s = sql;
        if (/INSERT INTO arcade_runs/.test(s)) {
          let gameId, playerKey, accountId, storeId, day, score, name, guest, attempt, at;
          if (/, 0, \?/.test(s)) [gameId, playerKey, accountId, storeId, day, score, name, attempt, at] = binds, guest = 0;
          else [gameId, playerKey, accountId, storeId, day, score, name, guest, attempt, at] = binds;
          const i = runs.findIndex((r) => r.player_key === playerKey && r.game_id === gameId && r.store_id === storeId && r.day_key === day && r.attempt === attempt);
          const row = { game_id: gameId, player_key: playerKey, account_id: accountId, store_id: storeId, day_key: day, score, name, guest, attempt, at };
          if (i < 0) runs.push(row);
          else if (Number(score) > Number(runs[i].score)) runs[i] = { ...runs[i], ...row };
          return { meta: { changes: 1 } };
        }
        if (/INSERT INTO arcade_best/.test(s)) {
          let gameId, playerKey, accountId, storeId, day, name, guest, score, at;
          if (binds.length === 8) [gameId, playerKey, accountId, storeId, day, name, score, at] = binds, guest = 0;
          else [gameId, playerKey, accountId, storeId, day, name, guest, score, at] = binds;
          const i = best.findIndex((r) => r.player_key === playerKey && r.game_id === gameId && r.store_id === storeId && r.day_key === day);
          const row = { game_id: gameId, player_key: playerKey, account_id: accountId, store_id: storeId, day_key: day, name, guest, score, at };
          if (i < 0) best.push(row);
          else if (Number(score) > Number(best[i].score)) best[i] = { ...best[i], ...row };
          return { meta: { changes: 1 } };
        }
        if (/INSERT INTO arcade_month_best/.test(s)) {
          let gameId, playerKey, accountId, storeId, mk, name, guest, score, at;
          if (binds.length === 8) [gameId, playerKey, accountId, storeId, mk, name, score, at] = binds, guest = 0;
          else [gameId, playerKey, accountId, storeId, mk, name, guest, score, at] = binds;
          const i = month.findIndex((r) => r.player_key === playerKey && r.game_id === gameId && r.store_id === storeId && r.month_key === mk);
          const row = { game_id: gameId, player_key: playerKey, account_id: accountId, store_id: storeId, month_key: mk, name, guest, score, at };
          if (i < 0) month.push(row);
          else if (Number(score) > Number(month[i].score)) month[i] = { ...month[i], ...row };
          return { meta: { changes: 1 } };
        }
        if (/DELETE FROM arcade_best/.test(s)) {
          const [gk, gameId, storeId, day] = binds;
          for (let i = best.length - 1; i >= 0; i--) {
            if (best[i].player_key === gk && best[i].game_id === gameId && best[i].store_id === storeId && best[i].day_key === day) best.splice(i, 1);
          }
          return { meta: { changes: 1 } };
        }
        if (/DELETE FROM arcade_month_best/.test(s)) {
          const [gk, gameId, storeId, mk] = binds;
          for (let i = month.length - 1; i >= 0; i--) {
            if (month[i].player_key === gk && month[i].game_id === gameId && month[i].store_id === storeId && month[i].month_key === mk) month.splice(i, 1);
          }
          return { meta: { changes: 1 } };
        }
        if (/DELETE FROM arcade_runs/.test(s)) {
          const [gk, gameId, storeId, day, attempt] = binds;
          for (let i = runs.length - 1; i >= 0; i--) {
            if (runs[i].player_key === gk && runs[i].game_id === gameId && runs[i].store_id === storeId && runs[i].day_key === day && runs[i].attempt === attempt) runs.splice(i, 1);
          }
          return { meta: { changes: 1 } };
        }
        if (/SELECT COUNT\(\*\)/.test(s)) {
          const [playerKey, gameId, storeId, day] = binds;
          const n = runs.filter((r) => r.player_key === playerKey && r.game_id === gameId && r.store_id === storeId && r.day_key === day).length;
          return { meta: { changes: 0 } }; // first() uses _rows
        }
        return { meta: { changes: 0 } };
      },
      async _rows() {
        const s = sql;
        if (/SELECT COUNT\(\*\)/.test(s)) {
          const [playerKey, gameId, storeId, day] = binds;
          const n = runs.filter((r) => r.player_key === playerKey && r.game_id === gameId && r.store_id === storeId && r.day_key === day).length;
          return [{ n }];
        }
        if (/FROM arcade_best WHERE player_key = \? AND game_id = \? AND store_id = \? AND day_key = \?/.test(s)) {
          const [pk, gid, sid, day] = binds;
          return best.filter((r) => r.player_key === pk && r.game_id === gid && r.store_id === sid && r.day_key === day);
        }
        if (/FROM arcade_best WHERE player_key = \?/.test(s) && binds.length === 1) {
          return best.filter((r) => r.player_key === binds[0]);
        }
        if (/FROM arcade_month_best WHERE player_key = \?/.test(s) && binds.length === 1) {
          return month.filter((r) => r.player_key === binds[0]);
        }
        if (/FROM arcade_runs WHERE player_key = \?/.test(s) && binds.length === 1) {
          return runs.filter((r) => r.player_key === binds[0]);
        }
        if (/FROM arcade_best WHERE game_id = \? AND store_id = \? AND day_key >= \?/.test(s)) {
          const [gid, sid, since] = binds;
          const map = new Map();
          for (const r of best.filter((x) => x.game_id === gid && x.store_id === sid && x.day_key >= since)) {
            const prev = map.get(r.player_key);
            if (!prev || r.score > prev.score) map.set(r.player_key, { player_key: r.player_key, account_id: r.account_id, name: r.name, guest: r.guest, score: r.score, at: Math.max(prev?.at || 0, r.at) });
          }
          return [...map.values()];
        }
        if (/FROM arcade_best WHERE game_id = \? AND store_id = \? AND day_key = \?/.test(s)) {
          const [gid, sid, day] = binds;
          return best.filter((r) => r.game_id === gid && r.store_id === sid && r.day_key === day);
        }
        if (/FROM arcade_month_best WHERE player_key = \? AND game_id = \? AND store_id = \? AND month_key = \?/.test(s)) {
          const [pk, gid, sid, mk] = binds;
          return month.filter((r) => r.player_key === pk && r.game_id === gid && r.store_id === sid && r.month_key === mk);
        }
        if (/FROM arcade_month_best WHERE game_id = \? AND store_id = \? AND month_key = \?/.test(s)) {
          const [gid, sid, mk] = binds;
          return month.filter((r) => r.game_id === gid && r.store_id === sid && r.month_key === mk);
        }
        return [];
      },
    };
    return api;
  };
  return { prepare: stmt, _best: best, _month: month, _runs: runs };
}

const kst = (y, m, d, hh = 15, mm = 0) => Date.parse(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`);

assert(CLIENT_MERGE_ID === 'bumstore' && MERGE_GAME_ID === 'bumstore', 'merge game id');
assert(resolveGameId('bumstore') === 'bumstore', 'resolve bumstore');
assert(resolveGameId(MERGE_GAME_ID) === MERGE_GAME_ID, 'resolve merge const');
assert(resolveGameId('bumpingpang') === GAME_ID, 'resolve pang');
assert(resolveGameId('hack-game') === GAME_ID, 'unknown gameId falls back');

const now = kst(2026, 11, 10, 15);
assert(kstDayKey(now) === '2026-11-10', 'today KST');
assert(kstDayKey(kst(2026, 11, 10, 0, 0)) === '2026-11-10', 'resets 00:00 KST');
assert(kstDayKey(kst(2026, 11, 9, 23, 59)) === '2026-11-09', 'before midnight is previous day');
assert(monthKey(now) === '2026-11', 'month key KST');
assert(kstDayKey(now - 6 * 864e5) === '2026-11-04', 'week window starts 6 days back');
assert(monthKey(kst(2026, 12, 1, 0, 0)) === '2026-12', 'month resets 1st 00:00 KST');

assert(arcadeShotMode('?shot=1') && arcadeShotMode('?shot') && arcadeShotMode('?shot=&foo=1'), 'shot on');
assert(!arcadeShotMode('') && !arcadeShotMode('?arcade=1'), 'shot off');
assert(mergeEnabled(''), 'merge default on');
assert(!mergeEnabled('?merge=0'), 'merge opt-out');

const open = OPENING_MS + 1000;
assert(decideAttempt({ now: open, guest: false, used: 0, practice: true }).practice, 'practice not recorded');

const SID = 'arcade-seohyeon';
const db = memoryD1();
const seedBest = (row) => { db._best.push(row); };
seedBest({ game_id: 'bumstore', player_key: 'a:1', account_id: '1', store_id: SID, day_key: '2026-11-10', name: '오늘', guest: 0, score: 100, at: 10 });
seedBest({ game_id: 'bumstore', player_key: 'a:1', account_id: '1', store_id: SID, day_key: '2026-11-04', name: '주초', guest: 0, score: 80, at: 4 });
seedBest({ game_id: 'bumstore', player_key: 'a:1', account_id: '1', store_id: SID, day_key: '2026-11-03', name: '8일전', guest: 0, score: 999, at: 3 });
seedBest({ game_id: 'bumstore', player_key: 'a:2', account_id: '2', store_id: SID, day_key: '2026-11-09', name: '어제', guest: 0, score: 50, at: 9 });
seedBest({ game_id: 'bumpingpang', player_key: 'a:9', account_id: '9', store_id: SID, day_key: '2026-11-10', name: '팡', guest: 0, score: 9000, at: 11 });
db._month.push({ game_id: 'bumstore', player_key: 'a:1', account_id: '1', store_id: SID, month_key: '2026-11', name: '오늘', guest: 0, score: 100, at: 10 });
db._month.push({ game_id: 'bumstore', player_key: 'a:3', account_id: '3', store_id: SID, month_key: '2026-11', name: '월간', guest: 0, score: 70, at: 8 });
db._month.push({ game_id: 'bumpingpang', player_key: 'a:9', account_id: '9', store_id: SID, month_key: '2026-11', name: '팡', guest: 0, score: 9000, at: 11 });

const today = await storeBoard(db, 'bumstore', SID, 'today', now);
assert(today.period === 'today' && today.day === '2026-11-10', 'today meta');
assert(today.rows.length === 1 && today.rows[0].name === '오늘' && today.rows[0].score === 100, 'today only today + bumstore');
assert(!today.rows.some((r) => r.name === '팡'), 'pang isolated from bumstore today');

const week = await storeBoard(db, 'bumstore', SID, 'week', now);
assert(week.period === 'week', 'week meta');
const w1 = week.rows.find((r) => r.playerKey === 'a:1');
const w2 = week.rows.find((r) => r.playerKey === 'a:2');
assert(w1 && w1.score === 100, `week max of last 7 days, got ${w1?.score}`);
assert(w2 && w2.score === 50, 'week includes yesterday');
assert(!week.rows.some((r) => r.score === 999), 'week excludes 8th day back');
assert(!week.rows.some((r) => r.name === '팡'), 'pang isolated from bumstore week');

const month = await storeBoard(db, 'bumstore', SID, 'month', now);
assert(month.period === 'month' && month.month === '2026-11', 'month meta');
assert(month.rows.length === 2 && month.rows[0].score === 100 && month.rows[1].score === 70, 'month podium bumstore only');
assert(!month.rows.some((r) => r.name === '팡'), 'pang isolated from bumstore month');

const gdb = memoryD1();
gdb._best.push({ game_id: 'bumstore', player_key: 'g:phone1', account_id: null, store_id: SID, day_key: '2026-11-10', name: '손님', guest: 1, score: 220, at: 5 });
gdb._month.push({ game_id: 'bumstore', player_key: 'g:phone1', account_id: null, store_id: SID, month_key: '2026-11', name: '손님', guest: 1, score: 220, at: 5 });
await mergeGuestBest(gdb, {
  device: 'phone1', playerKey: 'a:42', accountId: '42', gameId: 'bumstore', storeId: SID,
  day: '2026-11-10', name: '계정', now,
});
assert(!gdb._best.some((r) => r.player_key === 'g:phone1'), 'guest daily row removed');
const acc = gdb._best.find((r) => r.player_key === 'a:42');
assert(acc && acc.score === 220 && acc.guest === 0 && acc.account_id === '42', 'guest best merged into account');
assert(!gdb._month.some((r) => r.player_key === 'g:phone1'), 'guest month row removed');
assert(gdb._month.find((r) => r.player_key === 'a:42')?.score === 220, 'month guest merged');

const after = await storeBoard(gdb, 'bumstore', SID, 'today', now);
assert(after.rows.length === 1 && after.rows[0].playerKey === 'a:42', 'board shows one account row');

// recordRun also merges leftover guest when an account posts
const rdb = memoryD1();
rdb._best.push({ game_id: 'bumstore', player_key: 'g:dev9', account_id: null, store_id: SID, day_key: '2026-11-10', name: '손님', guest: 1, score: 50, at: 1 });
const rec = await recordRun(rdb, {
  playerKey: 'a:7', accountId: '7', guest: false, gameId: 'bumstore', storeId: SID,
  name: '계정', score: 40, level: 3, durationMs: 20000, now, practice: false, device: 'dev9',
});
assert(rec.record, 'account run recorded');
assert(!rdb._best.some((r) => r.player_key === 'g:dev9'), 'recordRun merged guest');
assert(rdb._best.find((r) => r.player_key === 'a:7')?.score === 50, 'kept higher guest score');

const src = readFileSync(new URL('../server/phone/src/index.js', import.meta.url), 'utf8');
assert(src.includes('handleArcade'), 'worker imports handleArcade');
assert(/pathname\.startsWith\(\s*["']\/arcade\//.test(src), 'worker dispatches /arcade/');
assert(src.indexOf('request.method === "OPTIONS"') < src.indexOf('pathname.startsWith("/arcade/")'), 'OPTIONS handled before /arcade');
assert(src.includes("Content-Type: 'text/plain") || readFileSync(new URL('../src/arcade/rank.js', import.meta.url), 'utf8').includes('text/plain'), 'client avoids preflight');

const rankSrc = readFileSync(new URL('../src/arcade/rank.js', import.meta.url), 'utf8');
assert(rankSrc.includes("credentials: 'include'"), 'client sends credentials');
assert(rankSrc.includes('arcadeShotMode()'), 'submit forces practice in ?shot');


assert(MONTHLY_BUM[0] === 3000 && MONTHLY_BUM[1] === 2000 && MONTHLY_BUM[2] === 1000, 'monthly rewards 3000/2000/1000');
assert(monthlyRewardSub().includes('월간 보상') && monthlyRewardSub().includes('1위 3,000') && monthlyRewardSub().includes('2위 2,000') && monthlyRewardSub().includes('3위 1,000 bum'), 'reward subtitle');
assert(LOGIN_NUDGE_TEXT.includes('로그인하면'), 'guest nudge copy');
{
  const guestOnly = monthlyBestPays(rankRows([
    { playerKey: 'g:x', name: '손님', score: 99999, at: 0, guest: true },
  ]), '2026-11');
  assert(guestOnly.length === 0, 'guest never paid even as rank 1');
}

// 목록에 있으면 아래를 또 붙이지 않는다
{
  const me = { playerKey: 'a:1', name: 'dd', score: 5445, rank: 1 };
  const rows = [{ playerKey: 'a:1', name: 'dd', score: 5445, rank: 1 }];
  const split = splitBoardMine(rows, me);
  assert(split.inList && !split.pinMine, 'in-list mine is not pinned again');
  assert(split.isMine(rows[0]), 'highlight in place');
  assert(sameRankPlayer(rows[0], me), 'same player');
  const outside = splitBoardMine(rows, { playerKey: 'a:99', name: '나', score: 10, rank: 21 });
  assert(outside.pinMine, 'pin only when outside the shown list');
}

// 로그인 시 같은 기기 게스트의 여러 날·두 게임·runs 를 계정으로 합친다
{
  const mdb = memoryD1();
  mdb._best.push({ game_id: 'bumstore', player_key: 'g:devX', account_id: null, store_id: SID, day_key: '2026-11-10', name: 'dd', guest: 1, score: 100, at: 1 });
  mdb._best.push({ game_id: 'bumstore', player_key: 'g:devX', account_id: null, store_id: SID, day_key: '2026-11-08', name: 'dd', guest: 1, score: 80, at: 2 });
  mdb._best.push({ game_id: 'bumpingpang', player_key: 'g:devX', account_id: null, store_id: SID, day_key: '2026-11-10', name: 'dd', guest: 1, score: 5445, at: 3 });
  mdb._best.push({ game_id: 'bumpingpang', player_key: 'a:88', account_id: '88', store_id: SID, day_key: '2026-11-10', name: 'dd', guest: 0, score: 4000, at: 4 });
  mdb._month.push({ game_id: 'bumpingpang', player_key: 'g:devX', account_id: null, store_id: SID, month_key: '2026-10', name: 'dd', guest: 1, score: 3000, at: 5 });
  mdb._runs.push({ game_id: 'bumpingpang', player_key: 'g:devX', account_id: null, store_id: SID, day_key: '2026-11-10', score: 5445, name: 'dd', guest: 1, attempt: 1, at: 3 });
  await mergeGuestBest(mdb, { device: 'devX', playerKey: 'a:88', accountId: '88', name: 'dd', now });
  assert(!mdb._best.some((r) => r.player_key === 'g:devX'), 'all guest daily rows removed');
  assert(!mdb._month.some((r) => r.player_key === 'g:devX'), 'guest month rows removed');
  assert(!mdb._runs.some((r) => r.player_key === 'g:devX'), 'guest runs removed');
  const pangToday = mdb._best.find((r) => r.player_key === 'a:88' && r.game_id === 'bumpingpang' && r.day_key === '2026-11-10');
  assert(pangToday && pangToday.score === 5445, 'kept higher guest pang score on account');
  assert(mdb._best.some((r) => r.player_key === 'a:88' && r.game_id === 'bumstore' && r.day_key === '2026-11-08' && r.score === 80), 'older guest day migrated');
  assert(mdb._month.find((r) => r.player_key === 'a:88' && r.month_key === '2026-10')?.score === 3000, 'past month migrated');
  assert(mdb._runs.some((r) => r.player_key === 'a:88' && r.score === 5445 && r.guest === 0), 'run migrated to account');
  const pangBoard = await storeBoard(mdb, 'bumpingpang', SID, 'today', now);
  assert(pangBoard.rows.filter((r) => r.name === 'dd').length === 1, 'one account row on board');
}

const authSrc = readFileSync(new URL('../server/phone/src/account/routes.js', import.meta.url), 'utf8');
assert(authSrc.includes('mergeGuestBest'), 'login/link migrates arcade guest records');


{
  assert(resolveGuest({ guest: true }, { prev: true, signedIn: true }) === false, 'signed-in body wins over server guest');
  assert(resolveGuest({ guest: false }, { prev: true, signedIn: false }) === false, 'server signed-in');
  assert(resolveGuest({ guest: true }, { prev: false, signedIn: false }) === true, 'server guest');
  assert(resolveGuest({ guest: true, local: true }, { prev: false, signedIn: false }) === false, 'local fallback does not flip to guest');
  assert(resolveGuest({ guest: true, timedOut: true }, { prev: false, signedIn: false }) === false, 'timeout does not flip to guest');
  assert(resolveGuest({ ranked: true, local: true }, { prev: true, signedIn: false }) === true, 'local keeps prev guest');
  assert(resolveGuest(null, { prev: true, signedIn: false }) === true, 'missing gate keeps prev');
  assert(isGuestFlag(true) === true, 'bool guest');
  assert(isGuestFlag(() => false) === false, 'fn signed-in');
  assert(isGuestFlag(() => true) === true, 'fn guest');
  assert(clientSignedIn() === false, 'no document body in node');

  const rankSrc = readFileSync(new URL('../src/arcade/rank.js', import.meta.url), 'utf8');
  assert(rankSrc.includes("credentials: 'include'"), 'arcade fetches send cookies');
  assert(!/return fetch\(url, opts\)/.test(rankSrc), 'no cookie-less fetch retry');
  assert(rankSrc.includes('local: true };'), 'gate errors omit guest:true');

  const idxSrc = readFileSync(new URL('../src/arcade/index.js', import.meta.url), 'utf8');
  assert(idxSrc.includes('resolveGuest'), 'arcade uses resolveGuest');
  assert(idxSrc.includes('2500'), 'gate timeout is not 800ms');
  assert(!idxSrc.includes('guest: knownGuest'), 'games receive guestNow, not a stale boolean');
}

// 새 최고점은 같은 기록 흐름에서 바로 보드에 반영된다
{
  const adb = memoryD1();
  const r1 = await recordRun(adb, {
    playerKey: 'a:1', accountId: '1', guest: false, gameId: 'bumpingpang', storeId: SID,
    name: '도훈', score: 5495, level: 3, durationMs: 40000, now, practice: false,
  });
  assert(r1.record && r1.best === 5495, 'first run best');
  const first = attachMine(await storeBoard(adb, 'bumpingpang', SID, 'today', now), { playerKey: 'a:1', accountId: '1' });
  assert(first.rows[0].score === 5495 && first.me?.score === 5495 && first.rows[0].me, 'first snapshot marks me');
  const r2 = await recordRun(adb, {
    playerKey: 'a:1', accountId: '1', guest: false, gameId: 'bumpingpang', storeId: SID,
    name: '도훈', score: 9109, level: 2, durationMs: 35000, now, practice: false,
  });
  assert(r2.record && r2.best === 9109, `second run keeps higher score, got ${r2.best}`);
  const second = attachMine(await storeBoard(adb, 'bumpingpang', SID, 'today', now), { playerKey: 'a:1', accountId: '1' });
  assert(second.rows.length === 1 && second.rows[0].score === 9109, 'board shows new best immediately');
  assert(second.me?.score === 9109, 'POST-like snapshot me is the new best');
}

// 오락실 게임은 일일 횟수 제한이 없다. 매 기록 중 최고만 남긴다. ?shot/practice 는 기록하지 않는다.
{
  const udb = memoryD1();
  for (let i = 0; i < 6; i++) {
    const r = await recordRun(udb, {
      playerKey: 'a:1', accountId: '1', guest: false, gameId: 'bumpingpang', storeId: SID,
      name: '도훈', score: 1000 + i, level: 2, durationMs: 30000, now, practice: false,
    });
    assert(r.record, `signed-in run ${i + 1} records`);
  }
  assert(udb._best.find((r) => r.player_key === 'a:1')?.score === 1005, 'best of unlimited signed-in runs');
  const g1 = await recordRun(udb, {
    playerKey: 'g:dev', accountId: null, guest: true, gameId: 'bumpingpang', storeId: SID,
    name: '손님', score: 2000, level: 2, durationMs: 30000, now, practice: false,
  });
  const g2 = await recordRun(udb, {
    playerKey: 'g:dev', accountId: null, guest: true, gameId: 'bumpingpang', storeId: SID,
    name: '손님', score: 2500, level: 2, durationMs: 30000, now, practice: false,
  });
  assert(g1.record && g2.record && g2.best === 2500, 'guest runs also unlimited; best kept');
  const shot = await recordRun(udb, {
    playerKey: 'a:1', accountId: '1', guest: false, gameId: 'bumpingpang', storeId: SID,
    name: '도훈', score: 99999, level: 2, durationMs: 30000, now, practice: true,
  });
  assert(!shot.record && udb._best.find((r) => r.player_key === 'a:1')?.score === 1005, 'practice not recorded');
}

assert(plausibleArcadeRun({ score: 9109, level: 1, durationMs: 30000 }).ok, '9109 at lv1/30s is a valid run');
assert(plausibleArcadeRun({ score: 80000, level: 10, durationMs: 3000 }).ok === false, 'still reject too-fast high score');

{
  const rankSrc = readFileSync(new URL('../src/arcade/rank.js', import.meta.url), 'utf8');
  assert(rankSrc.includes('kstDayKey'), 'local day key is KST not UTC');
  assert(rankSrc.includes('rememberedBest'), 'provider remembers the last best');
  assert(rankSrc.includes('lastSubmit'), 'provider keeps the POST snapshot');
  assert(rankSrc.includes('ranked: !j.beforeOpen'), 'gate does not treat usedUp as practice');
  assert(!rankSrc.includes('ranked: !j.usedUp'), 'gate no longer blocks ranking after N attempts');
  const pangSrc = readFileSync(new URL('../src/arcade/bumpingpang/game.js', import.meta.url), 'utf8');
  assert(pangSrc.includes('resultPosted'), 'pang submits the run once');
  assert(pangSrc.includes('onOpenBoard?.()'), '순위판 opens the board without posting again');
  assert(!/data-board[\s\S]*onResult\?\.\(\{[^}]*openBoard: true/.test(pangSrc), 'board click does not resubmit');
  assert(pangSrc.includes('--pang-vvh'), 'pang play shell follows visualViewport');
  const mergeSrc = readFileSync(new URL('../src/arcade/bumstore/game.js', import.meta.url), 'utf8');
  assert(mergeSrc.includes('storeName'), 'merge accepts branch name');
  assert(mergeSrc.includes('data-open-rank'), 'merge title has 순위판');
  assert(mergeSrc.includes('data-board'), 'merge result has 순위판');
  assert(mergeSrc.includes('intro-store'), 'merge title shows branch badge');
  const interiorSrc = readFileSync(new URL('../src/arcade/interior.js', import.meta.url), 'utf8');
  assert(interiorSrc.includes('pickBoard'), 'indoor kiosk is pickable');
  assert(interiorSrc.includes('랭킹 보기'), 'kiosk label is ranking not pang-only');
  const css = readFileSync(new URL('../src/arcade/ui.css', import.meta.url), 'utf8');
  const playShell = css.match(/\.arc-pang \{[^}]+height:[^}]+\}/);
  assert(playShell && !playShell[0].includes('100lvh'), 'play HUD is not sized with lvh');
  assert(css.includes('--pang-vvh'), 'css uses pang viewport vars');
  assert(css.includes('.arc-merge-intro'), 'merge title overlay styles');
  const idxSrc = readFileSync(new URL('../src/arcade/index.js', import.meta.url), 'utf8');
  assert(idxSrc.includes('pickBoard'), 'tapping the kiosk opens the board');
  assert(idxSrc.includes('lastSubmit'), 'arcade prefers the POST snapshot when opening the board');
  assert(idxSrc.includes('is-board'), 'open board marks #arc-root so lobby pills hide');
  assert(idxSrc.includes('boardOpen'), 'world taps are ignored while the board is open');
  assert(!interiorSrc.includes('4.05, 0, 0.95'), 'kiosk is not parked on the far right wall');
  assert(/board\.position\.set\(\s*-1\./.test(interiorSrc), 'kiosk sits front-center-left of the cabinets');
  assert(css.includes('#arc-root.is-board'), 'css hides hints while the ranking panel is open');
  assert(/#arc-root \.arc-modal \{[^}]*z-index:\s*400/.test(css.replace(/\n/g, ' ')), 'modal stacks above hint pills');
  assert(!/rank-list \{[^}]*min-height:\s*120px/.test(css), 'rank list can shrink on short landscape');
  const mergeScore = css.match(/\.arc-merge-score \{[^}]+\}/)[0];
  assert(/overflow:\s*visible/.test(mergeScore), 'score number is not clipped by the card');
  assert(css.includes('env(safe-area-inset-top, 0px)) + 118px'), 'float bear sits below the score card + notch');
  assert(css.includes('#arc-root:has(.arc-merge)') && css.includes('bg-store.jpg'), 'merge root fills with the store image not a cream band');
  assert(!mergeSrc.includes('dangerWorldY + 70'), 'aim guide stops at the danger line');
  const hudSrc = readFileSync(new URL('../src/mobile/hud.js', import.meta.url), 'utf8');
  assert(hudSrc.includes("t('랭킹'"), 'mobile HUD has a ranking action next to play/exit');
  assert(hudSrc.includes('ride3'), 'ranking uses a third action button');
  assert(hudSrc.includes('arc.boardOpen'), 'HUD hides arcade actions while the panel is open');
}

console.log('ok arcade-rank', { today: today.rows.length, week: week.rows.length, month: month.rows.length });
