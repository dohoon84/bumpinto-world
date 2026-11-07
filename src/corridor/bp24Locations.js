// [bp24] BUMP24 매장 위치 목록. 한 줄 = 매장 하나. 자세한 설명: docs/bp24-chain.md
//   id, name, world('corridor' 타일 | 'jeongja' 베이스맵), match{x,z} 또는 building(jeongja.json 인덱스).
//   front/side: '-z' | '+z' | '-x' | '+x' (바깥 방향). side: null 이면 앞면만 유리. 생략하면 차도 거리로 자동.
//   enabled: false 면 그 줄은 넣지 않는다.
//   flag: URL 이름. ?<flag>=0 이면 그 매장만 끄고, 없거나 1 이면 켠다(기본 켜짐). 시청점은 플래그 없이 ?bp24=1 로만 켜진다.
//   recess: 앞면을 건물 안쪽으로 당기는 거리(m). apron: false 면 앞 보도 데크·볼라드를 생략(차도에 붙는 면).
export const BUMP24_JEONGJA_FLAG = 'bump24jeongja';
export const BUMP24_JEONGJA_DEFAULT = true;
export const BUMP24_JEONGJA_AT = 'bump24-jeongja';

export const BP24_PLACEMENTS = [
  { // #1 성남시청 길 건너(실제 GS25 자리). 실측 사진에 맞춘 고정 틀 — 자동 결과와 달리 북쪽 창고 부분을 뺀 10.3m 깊이
    id: 'seongnam-cityhall', name: 'BUMP24 성남시청점',
    enabled: true, world: 'corridor',
    match: { x: 1601.1, z: -5752.8 },
    box: { x0: 1592.8, x1: 1608.5, z0: -5761.6, z1: -5751.3 }, front: '-z', side: '+x',
  },
  { // 정자역 북서쪽 칼튼호텔(jeongja.json #135, 1층 이마트24 자리). 동쪽 정자일로198번길을 본다.
    // 건물 벽이 차도 경계에 붙어 있어 앞면을 1.55m 들이고 보도 데크는 생략한다(간판·출입문이 차도로 나가지 않게).
    id: 'bump24-jeongja', name: 'BUMP24 정자점',
    enabled: true, world: 'jeongja',
    flag: BUMP24_JEONGJA_FLAG,
    building: 135,
    match: { x: -95.66, z: -93.14 },
    front: '+x', side: null,
    recess: 1.55, apron: false,
  },
];

/** 이 매장을 지금 켤지. flag 가 없으면 enabled 만 본다. */
export function placementFlagOn(spec, search = typeof location !== 'undefined' ? location.search : '') {
  if (!spec || spec.enabled === false) return false;
  if (!spec.flag) return true;
  const p = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  const v = p.get(spec.flag);
  if (v === '0') return false;
  if (v === '1') return true;
  return spec.flag === BUMP24_JEONGJA_FLAG ? BUMP24_JEONGJA_DEFAULT : true;
}

export function activePlacements(world, search) {
  return BP24_PLACEMENTS.filter((s) => s.world === world && placementFlagOn(s, search));
}

export function jeongjaBump24On(search) {
  const spec = BP24_PLACEMENTS.find((s) => s.id === 'bump24-jeongja');
  return !!spec && placementFlagOn(spec, search);
}

// 코리더 타일에 붙는 매장. ?bp24=1 일 때 createBp24 가 이 목록을 쓴다(시청점 동작은 그대로).
export const BP24_LOCATIONS = BP24_PLACEMENTS.filter((s) => s.world === 'corridor');

// ?bp24=demo 일 때만 추가로 놓는 검증용 매장(크기가 다른 건물 3채, 앞면·옆면 자동)
export const BP24_DEMO = [
  { id: 'demo-large', name: 'BUMP24 데모(큰 건물 22×24)', match: { x: 1639.6, z: -5750.7 } },
  { id: 'demo-mid', name: 'BUMP24 데모(중간 13×13)', match: { x: 1567.3, z: -5757.3 }, r: 3 },
  { id: 'demo-kiosk', name: 'BUMP24 데모(작은 8×7 키오스크)', match: { x: 1602.8, z: -5649.0 } },
];

export function bp24LocationsFor(mode) {
  const base = BP24_LOCATIONS.filter((s) => placementFlagOn(s));
  return mode === 'demo' ? base.concat(BP24_DEMO) : mode ? base : [];
}
