// [arcade] 랭킹 — 서버(/arcade/*) 우선, 없으면 localStorage 폴백 (로컬 연습용)
import { deviceId } from '../sms.js';
import { accountBase } from '../account/api.js';
import { ARCADE_GAME_ID, ARCADE_STORE_ID, MERGE_GAME_ID, arcadeShotMode } from './flag.js';
import { kstDayKey } from '../../server/phone/src/arcade/rules.js';

const KEY = 'bw.arcade.pang.best';

function readLocal(key = KEY) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function writeLocal(v, key = KEY) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* */ } }

export function localBoard(period = 'today', key = KEY) {
  const all = readLocal(key);
  const day = kstDayKey(Date.now());
  const rows = Object.values(all)
    .filter((r) => period === 'today' ? r.day === day : true)
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, 20)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return rows;
}

/** 로컬에 남은 모든 날의 최고점. '최고' 표시는 오늘만이 아니라 개인 최고를 쓴다. */
export function localBest(key = KEY) {
  try {
    let max = 0;
    for (const r of Object.values(readLocal(key))) {
      const n = Number(r?.score) || 0;
      if (n > max) max = n;
    }
    return max;
  } catch { return 0; }
}

export function saveLocal({ name, score, level = 1 }, key = KEY) {
  const day = kstDayKey(Date.now());
  const all = readLocal(key);
  const id = `local:${name || '나'}`;
  const prev = all[id];
  if (!prev || score > prev.score || prev.day !== day) {
    all[id] = { name: name || '나', score, level: Math.max(1, Number(level) || 1), day, at: Date.now(), guest: true };
    writeLocal(all, key);
  }
  return localBoard('today', key);
}

export function createMergeRankProvider(opts = {}) {
  return createArcadeRankProvider({ ...opts, gameId: MERGE_GAME_ID, storageKey: 'bw.arcade.merge.best' });
}

async function cfetch(url, opts = {}) {
  // 쿠키가 빠진 재시도는 로그인된 사람을 손님으로 만든다 — 항상 credentials 를 보낸다.
  return fetch(url, { ...opts, credentials: 'include' });
}

export function createArcadeRankProvider({ base, device, gameId = ARCADE_GAME_ID, storageKey = KEY } = {}) {
  const gid = gameId || ARCADE_GAME_ID;
  const root = () => (base || accountBase() || '').replace(/\/$/, '');
  const dev = () => { try { return device?.() || deviceId(); } catch { return 'guest'; } };
  const localTop = (period) => localBoard(period, storageKey);
  const localSave = (row) => saveLocal(row, storageKey);
  let remembered = 0;
  let lastSubmit = null;
  const remember = (score) => {
    const n = Math.max(0, Number(score) || 0);
    if (n > remembered) remembered = n;
    return Math.max(remembered, localBest(storageKey));
  };
  return {
    gameId: gid,
    rememberedBest: () => remember(0),
    lastSubmit: () => lastSubmit,
    async top({ period = 'today' } = {}) {
      const b = root();
      if (!b) return localTop(period);
      try {
        const r = await cfetch(`${b}/arcade/board?gameId=${gid}&storeId=${ARCADE_STORE_ID}&period=${period}&deviceId=${encodeURIComponent(dev())}&_=${Date.now()}`);
        if (!r.ok) return localTop(period);
        const j = await r.json();
        if (!j?.ok) return localTop(period);
        const rows = j.rows || [];
        const mine = j.me || rows.find((row) => row.me);
        if (mine?.score) remember(mine.score);
        return rows;
      } catch { return localTop(period); }
    },
    async gate() {
      const b = root();
      if (!b) return { ranked: true, usedUp: false, unlimited: true, local: true };
      try {
        const r = await cfetch(`${b}/arcade/status?gameId=${gid}&storeId=${ARCADE_STORE_ID}&deviceId=${encodeURIComponent(dev())}&_=${Date.now()}`);
        if (!r.ok) return { ranked: true, usedUp: false, unlimited: true, local: true };
        const j = await r.json();
        if (!j?.ok) return { ranked: true, usedUp: false, unlimited: true, local: true };
        const guest = j.guest === true;
        // 오락실 게임은 일일 횟수 제한이 없다. usedUp/left 로 연습 처리를 하지 않는다.
        return { ranked: !j.beforeOpen, usedUp: false, unlimited: true, guest, message: j.message || '' };
      } catch { return { ranked: true, usedUp: false, unlimited: true, local: true }; }
    },
    async submit({ name, score, ranked, level = 1, durationMs = 0 }) {
      localSave({ name, score, level });
      const bestNow = remember(score);
      const b = root();
      if (!b) {
        lastSubmit = { record: false, local: true, best: bestNow, score, rows: localTop('today'), at: Date.now() };
        return lastSubmit;
      }
      try {
        const r = await cfetch(`${b}/arcade/run`, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({
            gameId: gid, storeId: ARCADE_STORE_ID, name, score,
            level, durationMs,
            deviceId: dev(), practice: !ranked || arcadeShotMode(),
          }),
        });
        const j = r.ok ? await r.json() : { record: false };
        const best = remember(j?.best ?? score);
        lastSubmit = { ...j, score, best, rows: j?.rows || localTop('today'), me: j?.me || null, at: Date.now() };
        return lastSubmit;
      } catch {
        lastSubmit = { record: false, local: true, best: bestNow, score, rows: localTop('today'), at: Date.now() };
        return lastSubmit;
      }
    },
  };
}
