// [범핑팡] 오리지널 타일 캐릭터 — 애니팡 IP 베끼기 금지. 둥글고 통통한 얼굴 친구들.
export const TILES = [
  { id: 'bum',   name: '범이',   color: '#6ea8ff', accent: '#3d6fd9', blush: '#ff8fb8', feature: 'ears' },
  { id: 'coin',  name: '코이니', color: '#ffd24a', accent: '#e6a800', blush: '#ffb4a2', feature: 'shine' },
  { id: 'bike',  name: '바이키', color: '#3ddc97', accent: '#1fa86a', blush: '#ff9ec4', feature: 'helmet' },
  { id: 'bus',   name: '버시',   color: '#ff6b6b', accent: '#d94343', blush: '#ffb087', feature: 'wheels' },
  { id: 'ramen', name: '라멘이', color: '#c084fc', accent: '#8b5cf6', blush: '#ff9ec4', feature: 'steam' },
  { id: 'bento', name: '도시랑', color: '#38bdf8', accent: '#0ea5e9', blush: '#ffb4a2', feature: 'bow' },
];

export const SPECIAL = {
  lineH: { id: 'lineH', mark: '═', color: '#fff' },
  lineV: { id: 'lineV', mark: '║', color: '#fff' },
  bomb:  { id: 'bomb',  mark: '✦', color: '#ff9f1c' },
  color: { id: 'color', mark: '★', color: '#ffe66d' },
};

export function tileAt(i) { return TILES[((i % TILES.length) + TILES.length) % TILES.length]; }
export function tileById(id) { return TILES.find((t) => t.id === id) || TILES[0]; }
