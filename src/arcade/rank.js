// [arcade] 랭킹 — 서버(/arcade/*) 우선, 없으면 localStorage 폴백 (로컬 연습용)
import { deviceId } from '../sms.js';
import { accountBase } from '../account/api.js';
import { ARCADE_GAME_ID, ARCADE_STORE_ID } from './flag.js';
import { attemptCap, LIMIT_MSG } from '../../server/phone/src/arcade/rules.js';

const KEY = 'bw.arcade.pang.best';

function readLocal() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function writeLocal(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* */ } }

export function localBoard(period = 'today') {
  const all = readLocal();
  const day = new Date().toISOString().slice(0, 10);
  const rows = Object.values(all)
    .filter((r) => period === 'today' ? r.day === day : true)
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, 20)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return rows;
}

export function saveLocal({ name, score, level = 1 }) {
  const day = new Date().toISOString().slice(0, 10);
  const all = readLocal();
  const id = `local:${name || '나'}`;
  const prev = all[id];
  if (!prev || score > prev.score || prev.day !== day) {
    all[id] = { name: name || '나', score, level: Math.max(1, Number(level) || 1), day, at: Date.now(), guest: true };
    writeLocal(all);
  }
  return localBoard('today');
}

async function cfetch(url, opts = {}) {
  try { return await fetch(url, { ...opts, credentials: 'include' }); } catch (e) {
    if ((opts.method || 'GET') !== 'GET') throw e;
    return fetch(url, opts);
  }
}

export function createArcadeRankProvider({ base, device } = {}) {
  const root = () => (base || accountBase() || '').replace(/\/$/, '');
  const dev = () => { try { return device?.() || deviceId(); } catch { return 'guest'; } };
  return {
    async top({ period = 'today' } = {}) {
      const b = root();
      if (!b) return localBoard(period);
      try {
        const r = await cfetch(`${b}/arcade/board?gameId=${ARCADE_GAME_ID}&storeId=${ARCADE_STORE_ID}&period=${period}&deviceId=${encodeURIComponent(dev())}`);
        if (!r.ok) return localBoard(period);
        const j = await r.json();
        return j?.ok ? (j.rows || []) : localBoard(period);
      } catch { return localBoard(period); }
    },
    async gate() {
      const b = root();
      if (!b) return { ranked: true, usedUp: false, left: 5, cap: 5, guest: true, local: true };
      try {
        const r = await cfetch(`${b}/arcade/status?gameId=${ARCADE_GAME_ID}&storeId=${ARCADE_STORE_ID}&deviceId=${encodeURIComponent(dev())}`);
        if (!r.ok) return { ranked: true, usedUp: false, left: 5, cap: 5, guest: true, local: true };
        const j = await r.json();
        if (!j?.ok) return { ranked: true, usedUp: false, left: 5, cap: 5, guest: true, local: true };
        const guest = j.guest === true;
        return { ranked: !j.usedUp && !j.beforeOpen, usedUp: !!j.usedUp, message: j.message || LIMIT_MSG, guest, left: j.left, cap: attemptCap(guest) };
      } catch { return { ranked: true, usedUp: false, left: 5, cap: 5, guest: true, local: true }; }
    },
    async submit({ name, score, ranked, level = 1, durationMs = 0 }) {
      saveLocal({ name, score, level });
      const b = root();
      if (!b) return { record: false, local: true };
      try {
        const r = await cfetch(`${b}/arcade/run`, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({
            gameId: ARCADE_GAME_ID, storeId: ARCADE_STORE_ID, name, score,
            level, durationMs,
            deviceId: dev(), practice: !ranked,
          }),
        });
        return r.ok ? r.json() : { record: false };
      } catch { return { record: false, local: true }; }
    },
  };
}
