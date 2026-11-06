// [bp24] BP24 체인 매장 목록. 한 줄 = 매장 하나. 자세한 설명: docs/bp24-chain.md
//   match: 대상 건물 외곽 중심(월드 x,z). 반경 r(기본 3m) 안에서 가장 가까운 건물을 쓴다.
//   box/front/side 를 생략하면 외곽 OBB 와 차도 거리로 앞면(간판)·옆 유리 면을 자동으로 고른다.
//   front/side: '-z' | '+z' | '-x' | '+x' (월드 축 기준 바깥 방향). side: null 이면 옆 유리 없음.
export const BP24_LOCATIONS = [
  { // #1 성남시청 길 건너(실제 GS25 자리). 실측 사진에 맞춘 고정 틀 — 자동 결과와 달리 북쪽 창고 부분을 뺀 10.3m 깊이
    id: 'seongnam-cityhall', name: 'BP24 성남시청점',
    match: { x: 1601.1, z: -5752.8 },
    box: { x0: 1592.8, x1: 1608.5, z0: -5761.6, z1: -5751.3 }, front: '-z', side: '+x',
  },
];

// ?bp24=demo 일 때만 추가로 놓는 검증용 매장(크기가 다른 건물 3채, 앞면·옆면 자동)
export const BP24_DEMO = [
  { id: 'demo-large', name: 'BP24 데모(큰 건물 22×24)', match: { x: 1639.6, z: -5750.7 } },
  { id: 'demo-mid', name: 'BP24 데모(중간 13×13)', match: { x: 1567.3, z: -5757.3 }, r: 3 },
  { id: 'demo-kiosk', name: 'BP24 데모(작은 8×7 키오스크)', match: { x: 1602.8, z: -5649.0 } },
];

export function bp24LocationsFor(mode) {
  return mode === 'demo' ? BP24_LOCATIONS.concat(BP24_DEMO) : mode ? BP24_LOCATIONS : [];
}
