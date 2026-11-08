// [bp24] BUMP24 매장 위치 목록. 한 줄 = 매장 하나. 자세한 설명: docs/bp24-chain.md
import { BP24_GENERATED } from './bp24Generated.js';
//   id, name, world('corridor' 타일 | 'jeongja' 베이스맵), match{x,z} 또는 building(jeongja.json 인덱스).
//   front/side: '-z' | '+z' | '-x' | '+x' (바깥 방향). side: null 이면 앞면만 유리. 생략하면 차도 거리로 자동.
//   enabled: false 면 그 줄은 넣지 않는다.
//   flag: URL 이름. ?<flag>=0 이면 그 매장만 끄고, 없거나 1 이면 켠다(기본 켜짐). 시청점은 플래그 없이 ?bp24=1 로만 켜진다.
//   recess: 앞면을 건물 안쪽으로 당기는 거리(m). apron: false 면 앞 보도 데크·볼라드를 생략(차도에 붙는 면).
export const BUMP24_JEONGJA_FLAG = 'bump24jeongja';
export const BUMP24_JEONGJA_DEFAULT = true;
export const BUMP24_JEONGJA_AT = 'bump24-jeongja';
export const BUMP24_NAV_FLAG = 'bp24nav';
export const BUMP24_NAV_DEFAULT = true;

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
  ...BP24_GENERATED,
];

/** 이 매장을 지금 켤지. flag 가 없으면 enabled 만 본다. */
export function placementFlagOn(spec, search = typeof location !== 'undefined' ? location.search : '') {
  if (!spec || spec.enabled === false) return false;
  const flag = spec.flag || (spec.world === 'jeongja' ? BUMP24_JEONGJA_FLAG : '');
  if (!flag) return true;
  const p = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  const v = p.get(flag);
  if (v === '0') return false;
  if (v === '1') return true;
  return flag === BUMP24_JEONGJA_FLAG ? BUMP24_JEONGJA_DEFAULT : true;
}

export function activePlacements(world, search) {
  return BP24_PLACEMENTS.filter((s) => s.world === world && placementFlagOn(s, search));
}

export function jeongjaBump24On(search) {
  const spec = BP24_PLACEMENTS.find((s) => s.id === 'bump24-jeongja');
  return !!spec && placementFlagOn(spec, search);
}

function queryFlag(name, search, fallback) {
  const p = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  const v = p.get(name);
  if (v === '0') return false;
  if (v === '1') return true;
  return fallback;
}

/** 매장 위 길찾기 핀. 기본은 points() 의 매장마다. ?bp24pins=0 이면 정자점 하나만. */
export function bp24PinsAll(search = typeof location !== 'undefined' ? location.search : '') {
  return queryFlag('bp24pins', search, true);
}

/** 랭킹 전광판. 기본은 켜진 매장마다. ?bp24boards=0 이면 예전처럼 정자점(명시 게임이면 시청점)만. */
export function bp24BoardsAll(search = typeof location !== 'undefined' ? location.search : '') {
  return queryFlag('bp24boards', search, true);
}

/** 전광판을 달 매장 id. 시청점은 points() 에 없으므로 빼 둔다. */
export function bp24BoardStoreIds(search = '', explicit = false) {
  if (!bp24BoardsAll(search)) return explicit ? ['bump24-jeongja', 'seongnam-cityhall'] : ['bump24-jeongja'];
  const ids = [];
  for (const s of BP24_PLACEMENTS) {
    if (s.enabled === false || s.id === 'seongnam-cityhall') continue;
    if (s.world === 'jeongja') { if (jeongjaBump24On(search)) ids.push(s.id); continue; }
    if (s.defaultOn && placementFlagOn(s, search) && s.atX != null) ids.push(s.id);
  }
  return ids;
}

/** 지도 아이콘·정자점 표지·이정표. ?bp24nav=0 이면 전부 끔. 기본 켜짐. */
export function bp24NavOn(search = typeof location !== 'undefined' ? location.search : '') {
  const p = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  const v = p.get(BUMP24_NAV_FLAG);
  if (v === '0') return false;
  if (v === '1') return true;
  return BUMP24_NAV_DEFAULT;
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

/** ?bp24=1 없이도 켜는 코리더 매장. 시청점(defaultOn 없음)은 빼서 예전과 같다. */
export function corridorPlacements(search) {
  // 판교·미금 타일도 같은 코리더 스트림으로 붙는다. 시청점(defaultOn 없음)은 빼 둔다.
  return BP24_PLACEMENTS.filter((s) => (s.world === 'corridor' || s.world === 'pangyo' || s.world === 'migeum') && s.defaultOn && placementFlagOn(s, search));
}

export function bump24AtSpot(at) {
  if (!at || !String(at).startsWith('bump24-')) return null;
  const spec = BP24_PLACEMENTS.find((s) => s.at === at || s.id === at || (s.id === 'bump24-jeongja' && at === 'bump24-jeongja'));
  if (!spec) return null;
  if (spec.atX != null) return { x: spec.atX, z: spec.atZ, id: spec.id };
  return null;
}
