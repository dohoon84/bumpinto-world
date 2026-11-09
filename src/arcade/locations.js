// [arcade] BUMP 오락실 위치. 서현역(corridor station seohyeon) 5번 출구 옆 상업건물.
//   근거: public/corridor/tiles/2_-5.json buildings[146] — commercial, h=13.4,
//   bbox ≈ 1309.6~1338.7 × -2088.7~-2058.9, 중심 1326.75,-2076.5.
//   OSM/데이터에 오락실·게임장 태그는 없어서, 실제 건물 footprint에 우리 브랜드로 입점.
import { ARCADE_STORE_ID, ARCADE_AT } from './flag.js';

export const ARCADE_PLACEMENTS = [
  {
    id: ARCADE_STORE_ID,
    at: ARCADE_AT,
    name: 'BUMP 오락실 서현점',
    world: 'corridor',
    // 건물 중심 — createBp24 resolve 와 같은 match 규칙
    match: { x: 1326.75, z: -2076.5, r: 18 },
    // 문: 북쪽(+z) 면 바깥. exit 5 (1342.9,-2067.5) 쪽을 봄.
    door: [1326.75, -2057.55],
    board: [1322.5, -2057.2],
    front: '+z',
    face: Math.PI, // 문 밖을 보는 yaw
    yawIn: 0,
  },
];

export function arcadePlacement(id = ARCADE_STORE_ID) {
  return ARCADE_PLACEMENTS.find((s) => s.id === id) || ARCADE_PLACEMENTS[0];
}
