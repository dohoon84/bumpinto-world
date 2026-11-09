// [arcade] BUMP 오락실 · 범핑팡. 기본 ON, ?arcade=0 이면 끔.
export const ARCADE_FLAG = 'arcade';
export const ARCADE_AT = 'arcade-seohyeon';
export const ARCADE_JEONGJA_AT = 'arcade-jeongja';
export const ARCADE_STORE_ID = 'arcade-seohyeon'; // 랭킹 통합 id (지점과 무관)
export const ARCADE_GAME_ID = 'bumpingpang';

export function arcadeEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  try {
    const p = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
    return p.get(ARCADE_FLAG) !== '0';
  } catch { return true; }
}

export { arcadeAtSpot } from './locations.js';
