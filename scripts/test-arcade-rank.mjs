// [arcade] 범편의점·범핑팡 랭킹 기간(KST) · 게스트 합치기 · ?shot 연습 · 워커 연결
import { readFileSync } from 'node:fs';
import {
  kstDayKey, monthKey, resolveGameId, GAME_ID, MERGE_GAME_ID, decideAttempt, OPENING_MS,
} from '../server/phone/src/arcade/rules.js';
import { storeBoard, mergeGuestBest, recordRun } from '../server/phone/src/arcade/db.js';
import { arcadeShotMode, mergeEnabled, MERGE_GAME_ID as CLIENT_MERGE_ID } from '../src/arcade/flag.js';

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
          const gameId = binds[0], playerKey = binds[1], accountId = binds[2], storeId = binds[3];
          const day = binds[4], score = binds[5], name = binds[6], guest = binds[7], attempt = binds[8], at = binds[9];
          const exists = runs.some((r) => r.player_key === playerKey && r.game_id === gameId && r.store_id === storeId && r.day_key === day && r.attempt === attempt);
          if (!exists) runs.push({ game_id: gameId, player_key: playerKey, account_id: accountId, store_id: storeId, day_key: day, score, name, guest, attempt, at });
          return { meta: { changes: exists ? 0 : 1 } };
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

console.log('ok arcade-rank', { today: today.rows.length, week: week.rows.length, month: month.rows.length });
