// 지구본(worldGate.js)과 분리한 가벼운 플래그·주소. THREE·해안선 데이터가 없어서
// ?enter=1 로 바로 입장할 때 514KB 지구본 청크를 받지 않는다.
const LAT0_UNUSED = 0; // keep file side-effect free
void LAT0_UNUSED;

export const REPO_URL = 'https://github.com/dohoon84/bumpinto-world';
const DEFAULT_PHONE_BASE = import.meta.env?.VITE_PHONE_URL || 'https://jeongja-phone.xn0texn073.workers.dev';

// 스타베이스 정식 오픈 시각: 2026-10-29 11:00:00 KST (UTC+9)
export const STARBASE_OPEN_AT = Date.parse('2026-10-29T11:00:00+09:00');

function isLocalHost() {
  if (typeof location === 'undefined') return false;
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local');
}

function isForceUnlocked() {
  if (typeof location === 'undefined') return false;
  const params = new URLSearchParams(location.search);
  return params.get('unlock') === '1' || params.get('starbase') === 'open';
}

export function starbaseRemainingMs(now = Date.now()) {
  if (isForceUnlocked()) return 0;
  return Math.max(0, STARBASE_OPEN_AT - now);
}

export function isStarbaseLive(now = Date.now()) {
  return starbaseRemainingMs(now) <= 0;
}

export function phoneStatsUrl(regionId = 'jeongja') {
  const params = new URLSearchParams(location.search);
  const smsParam = params.get('sms');
  const q = `?region=${encodeURIComponent(regionId)}`;
  if (smsParam === 'off') return '';
  if (smsParam === 'local') return `http://127.0.0.1:8789/stats${q}`;
  if (smsParam === 'prod' || smsParam === 'live') return `${DEFAULT_PHONE_BASE.replace(/\/$/, '')}/stats${q}`;
  if (params.has('sms')) {
    const b = (smsParam || '').replace(/\/$/, '');
    return b ? `${b}/stats${q}` : '';
  }
  if (isLocalHost()) return '';
  return `${DEFAULT_PHONE_BASE.replace(/\/$/, '')}/stats${q}`;
}

// [ui-v2] 지구본 위에 게임 패널을 얹는 함수. worldGate.openWorldGate 가 읽는다.
let gateDecorator = null;
export function setGateDecorator(fn) { gateDecorator = typeof fn === 'function' ? fn : null; }
export function getGateDecorator() { return gateDecorator; }
