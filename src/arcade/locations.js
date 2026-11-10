// [arcade] BUMP 오락실 위치.
//   서현점: 서현역 AK플라자 도로면(tile 2_-5 buildings[26], 문 1336.99,-1990.75).
//     해당 다층 건물 1층을 비우고(hollowSeohyeonArcade) 통유리 매장을 외벽선에 끼운다.
//   정자역점: 스타벅스 정자역(x=-152..-136, z=-21.5..-40) 바로 서쪽,
//     남북 보도(x≈-157.5, w=2.2) 건너 공터. 출입문은 스타벅스와 같이 성남대로343번길(남쪽)을 본다.
//   랭킹 storeId 는 flag.js 의 ARCADE_STORE_ID('arcade-seohyeon') 하나로 통합.
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
    // tile 2_-5 buildings[26] 외곽. 1층 나머지 벽을 막을 때 쓴다.
    hostRing: [
      [1312.3, -1975.9], [1315.2, -1972.9], [1317.3, -1975], [1355.1, -2008.3],
      [1394.7, -2043.6], [1391.7, -2046.8], [1391.6, -2046.9], [1377, -2034.4],
      [1372.7, -2034.4], [1372.7, -2030.1], [1360.3, -2019.5], [1355.8, -2019.8],
      [1344, -2008.7], [1344.9, -2005.4], [1332.8, -1994.8], [1327.8, -1994.3],
      [1328.1, -1990.3],
    ],
    hollowTile: '2_-5',
    gf: 3.6,
    deep: 4.2,
    flush: true,
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
    // 스타벅스 정자역 서쪽. 남북 보도(성남대로343번길 보행로 x≈-157.5) 바로 서쪽 공터.
    // 남쪽 면(z=-21.5, 스타벅스와 같은 전면선·출입 방향)이 성남대로343번길(z≈-14)을 본다.
    // 보도(서측 ≈-158.5)·도로·스타벅스와 겹치지 않게.
    ring: [[-175.5, -21.5], [-159.5, -21.5], [-159.5, -33.0], [-175.5, -33.0]],
    h: 8.4,
    gf: 3.6,
    match: { x: -167.5, z: -27.25, r: 10 },
    nx: 0,
    nz: 1,
    width: 14.0,
    door: [-167.0, -20.3],
    board: [-172.8, -21.25],
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

function arcadeOff(search) {
  try {
    const q = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
    return q.get('arcade') === '0';
  } catch {
    return false;
  }
}

/** 정자 베이스맵에 정자역점 상가 건물을 넣는다. 1층은 비우고(mh=gf) 충돌만 남긴다. */
export function placeJeongjaArcadeBuilding(data, search = typeof location !== 'undefined' ? location.search : '') {
  if (arcadeOff(search)) return;
  const st = ARCADE_PLACEMENTS.find((s) => s.id === 'arcade-jeongja');
  if (!st?.ring || !data?.buildings) return;
  if (data.buildings.some((b) => b.n === st.name)) return;
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

/**
 * 코리더 타일 JSON에서 서현점 건물 1층을 비운다(위층 mh=gf + 원본은 충돌만).
 * tile 2_-5 의 AK플라자 도로면 part 에만 적용. ?arcade=0 이면 그대로 둔다.
 */
export function hollowSeohyeonArcade(key, j, search = typeof location !== 'undefined' ? location.search : '') {
  if (arcadeOff(search)) return j;
  const st = ARCADE_PLACEMENTS.find((s) => s.id === 'arcade-seohyeon');
  if (!st?.hollowTile || key !== st.hollowTile || !j?.b?.length) return j;
  const { x, z, r } = st.match;
  let best = -1, bestD = r;
  j.b.forEach((b, i) => {
    if (!b.o?.length || b.nr || b.mh) return;
    let sx = 0, sz = 0;
    for (const p of b.o) { sx += p[0]; sz += p[1]; }
    const d = Math.hypot(sx / b.o.length - x, sz / b.o.length - z);
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best < 0) return j;
  const src = j.b[best];
  const gf = st.gf || 3.6;
  const b = j.b.slice();
  b[best] = { ...src, nr: 1, lm: 'arcade' };
  b.push({ ...src, mh: gf, lm: 'arcadeUpper' });
  return { ...j, b };
}

export function arcadeMapPoints() {
  return ARCADE_PLACEMENTS.map((s) => ({ id: s.id, name: s.name, x: s.door[0], z: s.door[1] }));
}
