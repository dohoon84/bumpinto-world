// [ride] 탑승 기록 — localStorage 에 최근 CAP 건까지. 나중에 서버 동기화를 붙일 수 있게 인터페이스를 분리한다.
//   entry: { id, mode: 'bus'|'taxi', route, routeName, from, to, distM, durSec, at(탑승 시각 ms), end(하차 시각 ms),
//            speed?: 'normal'|'fast'|'instant', fare: { amount, currency, receiptId, code }, synced: false }
//   pending() → 아직 서버에 안 올린 기록, markSynced(ids) → 올린 뒤 표시. (지금은 서버 없음: 로컬 전용)
export const RIDE_LOG_KEY = 'bw.rideLog.v1';
export const RIDE_LOG_CAP = 200;

const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const defaultStore = () => { try { if (typeof localStorage !== 'undefined') return localStorage; } catch { /* 차단된 저장소 */ } return memStore(); };

const str = (v, n = 80) => (v == null ? '' : String(v).slice(0, n));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function createRideLog({ storage = defaultStore(), key = RIDE_LOG_KEY, cap = RIDE_LOG_CAP, now = () => Date.now() } = {}) {
  const listeners = new Set();
  let seq = 0;
  const read = () => {
    try { const a = JSON.parse(storage.getItem(key) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
  };
  const write = (list) => {
    try { storage.setItem(key, JSON.stringify(list)); } catch { /* 용량 초과 등: 기록 실패는 탑승과 무관 */ }
    for (const fn of listeners) { try { fn(list); } catch { /* noop */ } }
  };
  return {
    key, cap,
    add(e) {
      const t = now();
      const entry = {
        id: str(e.id, 40) || `ride-${t.toString(36)}-${(++seq).toString(36)}`,
        mode: e.mode === 'taxi' ? 'taxi' : 'bus',
        route: str(e.route, 24), routeName: str(e.routeName, 60),
        from: str(e.from), to: str(e.to),
        distM: Math.max(0, Math.round(num(e.distM))),
        durSec: Math.max(0, Math.round(num(e.durSec))),
        at: num(e.at) || t, end: num(e.end) || t,
        speed: e.speed ? str(e.speed, 12) : undefined,
        fare: e.fare ? { amount: num(e.fare.amount), currency: str(e.fare.currency || 'KRW', 6), receiptId: str(e.fare.receiptId, 60), code: str(e.fare.code, 24) } : null,
        synced: false,
      };
      const list = read();
      list.push(entry);
      while (list.length > cap) list.shift();
      write(list);
      return entry;
    },
    // 최신순
    list({ limit = cap } = {}) { return read().slice(-limit).reverse(); },
    count() { return read().length; },
    clear() { write([]); },
    pending() { return read().filter((e) => !e.synced); },
    markSynced(ids) { const s = new Set(ids); const list = read(); for (const e of list) if (s.has(e.id)) e.synced = true; write(list); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    totals() { const l = read(); return { rides: l.length, distM: l.reduce((a, e) => a + e.distM, 0), durSec: l.reduce((a, e) => a + e.durSec, 0) }; },
  };
}
