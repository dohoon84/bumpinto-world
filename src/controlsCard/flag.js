// [controls-card] 가운데 조작 안내 카드. 기본 켜짐. ?controlscard=0|off|old|legacy|v1 이면 예전 왼쪽 위 접기 카드.
//   이 탭에서만 기억(sessionStorage) — 월드 이동 새로고침에도 유지. ?controlscard=1|on|v2 로 다시 켠다.
//   index.html 의 첫 페인트 스크립트가 같은 키·같은 값을 본다 (문구가 잠깐 옛 카드로 보이지 않게).

export const SESSION_KEY = 'bw.controlsCard.off';
export const DISMISS_KEY = 'bw.controlsCard.dismissed';

const OFF = new Set(['0', 'off', 'old', 'legacy', 'v1']);
const ON = new Set(['1', 'on', 'v2']);

function queryOf(search) {
  try {
    const s = search ?? (typeof location !== 'undefined' ? location.search : '');
    return (new URLSearchParams(s || '').get('controlscard') || '').toLowerCase();
  } catch {
    return '';
  }
}

function sessionOf(storage) {
  if (storage !== undefined) return storage;
  try { return sessionStorage; } catch { return null; }
}

/** 이 주소에서 새 조작 카드를 쓸지. storage 를 넘기면 그 저장소만 본다(테스트). */
export function controlsCardWanted(search, storage) {
  const q = queryOf(search);
  const ss = sessionOf(storage);
  try {
    if (OFF.has(q) || (q && !ON.has(q))) { ss?.setItem(SESSION_KEY, '1'); return false; }
    if (ON.has(q)) { ss?.removeItem(SESSION_KEY); return true; }
    return ss?.getItem(SESSION_KEY) !== '1';
  } catch {
    return !OFF.has(q) && (!q || ON.has(q));
  }
}

export function readDismissed(storage) {
  try { return (storage || localStorage).getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

export function writeDismissed(storage) {
  try { (storage || localStorage).setItem(DISMISS_KEY, '1'); } catch { /* 막힘 */ }
}
