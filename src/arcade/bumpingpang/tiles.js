// [범핑팡] 타일 세트 — 우리 캐릭터·매장 아이템 (애니팡 베끼기 금지, 이름·그림 완전 오리지널)
export const TILES = [
  { id: 'bum', label: '범', color: '#5b8cff', emoji: '🟣' },
  { id: 'coin', label: '범', color: '#ffd24a', emoji: '🟡' },
  { id: 'bike', label: '바이크', color: '#3ddc97', emoji: '🟢' },
  { id: 'bus', label: '버스', color: '#ff6b6b', emoji: '🔴' },
  { id: 'ramen', label: '라면', color: '#c084fc', emoji: '🟣' },
  { id: 'bento', label: '도시락', color: '#38bdf8', emoji: '🔵' },
];

export const SPECIAL = {
  lineH: { id: 'lineH', label: '가로줄', color: '#fff' },
  lineV: { id: 'lineV', label: '세로줄', color: '#fff' },
  bomb: { id: 'bomb', label: '폭탄', color: '#ff9f1c' },
  color: { id: 'color', label: '컬러', color: '#ffffff' },
};

export function tileAt(i) { return TILES[((i % TILES.length) + TILES.length) % TILES.length]; }
