// [arcade] BUMP 오락실 위치.
//   서현점: 서현역 AK플라자 도로면(tile 2_-5 buildings[26], 문 1336.99,-1990.75).
//     예전 standalone 간판·봉·슬래브(건물 146 북쪽 중정)는 쓰지 않는다.
//   정자역점: 스타벅스 정자역(x=-152..-136, z=-21.5..-40) 바로 동쪽,
//     남북 길(x≈-127, w=6.4) 건너 공터. 도로·스타벅스·노비오스호텔과 겹치지 않게.
//   랭킹 storeId 는 flag.js 의 ARCADE_STORE_ID('arcade-seohyeon') 하나로 통합.
//     서버 DB 는 store_id 컬럼이 있지만 두 지점 모두 같은 id 를 보낸다.
export const ARCADE_PLACEMENTS = [
  {
    id: 'arcade-seohyeon',
    at: 'arcade-seohyeon',
    name: 'BUMP 오락실 서현점',
    branch: '서현점',
    world: 'corridor',
    // 서현역 AK플라자 도로면 (tile 2_-5 buildings[26] part, 성남대로 쪽 긴 외벽)
    match: { x: 1352.59, z: -2011.83, r: 25 },
    wall: { x0: 1317.3, z0: -1975.0, x1: 1355.1, z1: -2008.3 },
    nx: 0.66103,
    nz: 0.75036,
    width: 10.4,
    door: [1336.99, -1990.75],
    board: [1333.50, -1988.66],
    face: Math.atan2(0.66103, 0.75036),
    yawIn: Math.atan2(-0.66103, -0.75036),
  },
  {
    id: 'arcade-jeongja',
    at: 'arcade-jeongja',
    name: 'BUMP 오락실 정자역점',
    branch: '정자역점',
    world: 'jeongja',
    // 스타벅스 정자역(x=-152..-136, z=-21.5..-40)과 같은 도로 북쪽.
    // 남북 길(x≈-127, 동측 경계 ≈-123.8) 바로 동쪽 공터를 채운다.
    // 남쪽 면(z=-21.5, 스타벅스와 같은 전면선)이 성남대로343번길(z≈-14)을 본다.
    // 문은 공터 도로변의 오른쪽(동쪽) 가운데. 길·도로·노비오스와 겹치지 않게.
    ring: [[-123.0, -21.5], [-107.0, -21.5], [-107.0, -33.0], [-123.0, -33.0]],
    h: 8.4,
    gf: 3.6,
    match: { x: -115.0, z: -27.25, r: 10 },
    nx: 0,
    nz: 1,
    width: 14.0,
    door: [-114.0, -20.3],
    board: [-119.8, -21.25],
    face: 0,
    yawIn: Math.PI,
  },
];

export function arcadePlacements() {
  return ARCADE_PLACEMENTS;
}

export function arcadePlacement(id = 'arcade-seohyeon') {
  return ARCADE_PLACEMENTS.find((s) => s.id === id || s.at === id) || ARCADE_PLACEMENTS[0];
}

export function arcadeAtSpot(at) {
  if (!at) return null;
  const st = ARCADE_PLACEMENTS.find((s) => s.at === at || s.id === at);
  if (!st) return null;
  return { id: st.id, x: st.door[0], z: st.door[1], yaw: st.yawIn, face: st.face };
}

/** 정자 베이스맵에 정자역점 상가 건물을 넣는다. 1층은 비우고(mh=gf) 충돌만 남긴다. */
export function placeJeongjaArcadeBuilding(data, search = typeof location !== 'undefined' ? location.search : '') {
  try {
    const q = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
    if (q.get('arcade') === '0') return;
  } catch { /* keep on */ }
  const st = ARCADE_PLACEMENTS.find((s) => s.id === 'arcade-jeongja');
  if (!st?.ring || !data?.buildings) return;
  if (data.buildings.some((b) => b.n === st.name)) return;
  // 시각 메시는 exterior.js 가 그린다. 여기선 발자국 충돌만 (플레이어가 건물을 통과하지 않게).
  data.buildings.push({
    o: st.ring.map((p) => [p[0], p[1]]),
    h: st.h,
    mh: 0,
    k: 'commercial',
    n: st.name,
    _skip: true,
    lm: 'arcade',
  });
}

export function arcadeMapPoints() {
  return ARCADE_PLACEMENTS.map((s) => ({ id: s.id, name: s.name, x: s.door[0], z: s.door[1] }));
}
