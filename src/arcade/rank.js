// [arcade] 랭킹 — 서버(/arcade/*) 우선, 없으면 localStorage 폴백 (로컬 연습용)
import { deviceId } from '../sms.js';
import { accountBase } from '../account/api.js';
import { ARCADE_GAME_ID, ARCADE_STORE_ID, MERGE_GAME_ID, arcadeShotMode } from './flag.js';
import { attemptCap, LIMIT_MSG } from '../../server/phone/src/arcade/rules.js';

const KEY = 'bw.arcade.pang.best';

function readLocal(key = KEY) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function writeLocal(v, key = KEY) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* */ } }

export function localBoard(period = 'today', key = KEY) {
  const all = readLocal(key);
  const day = new Date().toISOString().slice(0, 10);
  const rows = Object.values(all)
    .filter((r) => period === 'today' ? r.day === day : true)
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, 20)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return rows;
}

export function saveLocal({ name, score, level = 1 }, key = KEY) {
  const day = new Date().toISOString().slice(0, 10);
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
  return {
    gameId: gid,
    async top({ period = 'today' } = {}) {
      const b = root();
      if (!b) return localTop(period);
      try {
        const r = await cfetch(`${b}/arcade/board?gameId=${gid}&storeId=${ARCADE_STORE_ID}&period=${period}&deviceId=${encodeURIComponent(dev())}`);
        if (!r.ok) return localTop(period);
        const j = await r.json();
        return j?.ok ? (j.rows || []) : localTop(period);
      } catch { return localTop(period); }
    },
    async gate() {
      const b = root();
      if (!b) return { ranked: true, usedUp: false, left: 5, cap: 5, local: true };
      try {
        const r = await cfetch(`${b}/arcade/status?gameId=${gid}&storeId=${ARCADE_STORE_ID}&deviceId=${encodeURIComponent(dev())}`);
        if (!r.ok) return { ranked: true, usedUp: false, left: 5, cap: 5, local: true };
        const j = await r.json();
        if (!j?.ok) return { ranked: true, usedUp: false, left: 5, cap: 5, local: true };
        const guest = j.guest === true;
        return { ranked: !j.usedUp && !j.beforeOpen, usedUp: !!j.usedUp, message: j.message || LIMIT_MSG, guest, left: j.left, cap: attemptCap(guest) };
      } catch { return { ranked: true, usedUp: false, left: 5, cap: 5, local: true }; }
    },
    async submit({ name, score, ranked, level = 1, durationMs = 0 }) {
      localSave({ name, score, level });
      const b = root();
      if (!b) return { record: false, local: true };
      try {
        const r = await cfetch(`${b}/arcade/run`, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({
            gameId: gid, storeId: ARCADE_STORE_ID, name, score,
            level, durationMs,
            deviceId: dev(), practice: !ranked || arcadeShotMode(),
          }),
        });
        return r.ok ? r.json() : { record: false };
      } catch { return { record: false, local: true }; }
    },
  };
}
