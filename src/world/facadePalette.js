// 정자 외벽 텍스처 팔레트와 건물 종류(k) → 외벽 그룹.
// world.js(paintFacade · 외벽 메시 묶음)와 world/buildingColours.js(버텍스 색 보정)가 같이 쓴다.
export const FACADE_WALL = { office: '#c5d0dc', commercial: '#d5dee8', residential: '#f0e2d2', house: '#efe6d8', school: '#f6e7d4', public: '#e7e0d2', yes: '#e6e2da' };
export const FACADE_GLASS = { office: '#7fa4c4', commercial: '#6e93b0', residential: '#5f84a0', house: '#6a8eaa', school: '#6f92ae', public: '#5c7384', yes: '#7d93a6' };
export const FACADE_BAND = { office: '#aeb9c6', commercial: '#c4b29a', residential: '#cbb39a', house: '#e4d5c4', school: '#e7d4bc', public: '#d9d0c0', yes: '#d5d0c6' };

export function facadeKey(k) {
  if (k === 'office') return 'office';
  if (k === 'commercial') return 'commercial';
  if (k === 'apartments' || k === 'residential' || k === 'dormitory') return 'residential';
  if (k === 'house') return 'house';
  if (k === 'school' || k === 'kindergarten' || k === 'university' || k === 'college') return 'school';
  if (k === 'public' || k === 'civic' || k === 'church' || k === 'hospital') return 'public';
  return 'yes';
}
