// [bump24-rank] 서버 전광판. ?bp24rank=0 이면 이 공급자를 쓰지 않고 기기 기록만 남긴다.
import { smsBase, deviceId } from '../sms.js';
import { attemptCap, LIMIT_MSG } from '../../server/phone/src/bump24/rules.js';

export function bp24RankOn(search = typeof location !== 'undefined' ? location.search : '') {
  try { return new URLSearchParams(search || '').get('bp24rank') !== '0'; } catch { return true; }
}
export { LIMIT_MSG };

const TAB = { yesterday: '어제', weekly: '이번 주', monthly: '이달' };
const EMPTY = { yesterday: '어제 기록이 아직', weekly: '이번 주 첫 도전자를', monthly: '이달 순위가 아직' };

// 로그인(세션 쿠키) 사용자를 서버가 알아보도록 쿠키를 실어 보낸다. 워커가 아직 Allow-Credentials 를 주지 않으면(구버전) 응답을 못 읽으니
// GET 만 쿠키 없이 다시 보낸다. POST 는 이미 서버에 닿아 기록됐을 수 있어 다시 보내지 않는다(중복 기록 방지).
async function cfetch(url, opts = {}) {
  try { return await fetch(url, { ...opts, credentials: 'include' }); } catch (e) {
    if ((opts.method || 'GET') !== 'GET') throw e;
    return fetch(url, opts);
  }
}

export function createRankProvider({ base, device } = {}) {
  const meta = new Map();
  const root = () => (base || smsBase() || '').replace(/\/$/, '');
  const dev = () => { try { return device?.() || deviceId(); } catch { return 'guest'; } };
  async function board(storeId) {
    const b = root();
    if (!b) return null;
    const r = await fetch(`${b}/bump24/board?storeId=${encodeURIComponent(storeId)}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.ok) return null;
    const tab = TAB[j.view] || '어제';
    meta.set(storeId, { tabs: [['today', '오늘'], ['week', tab]], empty2: EMPTY[j.view] || EMPTY.yesterday, view: j.view });
    return j;
  }
  return {
    kind: 'server', label: '오늘 랭킹',
    boardMeta: (id) => meta.get(id) || null,
    async top({ storeId, period = 'today' }) {
      const j = await board(storeId);
      if (!j) return [];
      return period === 'today' ? (j.today || []) : (j.second || j.yesterday || []);
    },
    async gate(storeId) {
      const b = root();
      if (!b) return null;
      const r = await cfetch(`${b}/bump24/status?storeId=${encodeURIComponent(storeId)}&deviceId=${encodeURIComponent(dev())}`);
      if (!r.ok) return null;
      const j = await r.json();
      if (!j?.ok) return null;
      const left = Number(j.left);
      const guest = j.guest === true;
      return {
        ranked: !j.usedUp && !j.beforeOpen, usedUp: !!j.usedUp, message: j.message || '', guest,
        ...(Number.isFinite(left) ? { left, cap: attemptCap(guest) } : {}),
      };
    },
    async pending() {
      const b = root();
      if (!b) return [];
      const r = await cfetch(`${b}/bump24/pending?deviceId=${encodeURIComponent(dev())}`);
      if (!r.ok) return [];
      const j = await r.json();
      return j?.notices || [];
    },
    async ack() {
      const b = root();
      if (!b) return;
      await cfetch(`${b}/bump24/ack`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ deviceId: dev() }) });
    },
    async submit({ storeId, name, score, ranked }) {
      const b = root();
      if (!b) return { record: false };
      const r = await cfetch(`${b}/bump24/run`, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ storeId, name, score, deviceId: dev(), practice: !ranked }),
      });
      return r.ok ? r.json() : { record: false };
    },
    subscribe() { return () => {}; },
  };
}
