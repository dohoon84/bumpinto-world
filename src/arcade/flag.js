// [arcade] BUMP 오락실 · 범핑팡·범편의점. 기본 ON, ?arcade=0 이면 끔. ?merge=0 이면 범편의점만 끔.
export const ARCADE_FLAG = 'arcade';
export const ARCADE_AT = 'arcade-seohyeon';
export const ARCADE_JEONGJA_AT = 'arcade-jeongja';
export const ARCADE_STORE_ID = 'arcade-seohyeon'; // 랭킹 통합 id (지점과 무관)
export const ARCADE_GAME_ID = 'bumpingpang';
export const MERGE_FLAG = 'merge';
export const MERGE_GAME_ID = 'bumstore';

export function arcadeEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  try {
    const p = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
    return p.get(ARCADE_FLAG) !== '0';
  } catch { return true; }
}

export { arcadeAtSpot } from './locations.js';

export function mergeEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  try {
    const p = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
    if (p.get(ARCADE_FLAG) === '0') return false;
    return p.get(MERGE_FLAG) !== '0';
  } catch { return true; }
}

export function arcadeShotMode(search = typeof location !== 'undefined' ? location.search : '') {
  // 캡처/테스트(?shot)는 순위판에 쌓이면 안 된다 → 항상 연습
  try {
    const p = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
    return p.has('shot');
  } catch { return false; }
}

