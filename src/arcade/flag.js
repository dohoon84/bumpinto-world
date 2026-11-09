// [arcade] BUMP 오락실 · 범핑팡. 기본 ON, ?arcade=0 이면 끔.
export const ARCADE_FLAG = 'arcade';
export const ARCADE_AT = 'arcade-seohyeon';
export const ARCADE_STORE_ID = 'arcade-seohyeon';
export const ARCADE_GAME_ID = 'bumpingpang';

export function arcadeEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  try {
    const p = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
    return p.get(ARCADE_FLAG) !== '0';
  } catch { return true; }
}

export function arcadeAtSpot(at) {
  if (at !== ARCADE_AT && at !== ARCADE_STORE_ID) return null;
  // 서현역 5번 출구 옆 상업건물 1층 문 앞 (tile 2_-5 commercial, match 1326.75,-2076.5, 북쪽 면)
  return { id: ARCADE_STORE_ID, x: 1326.75, z: -2057.55, yaw: 0, face: Math.PI };
}
