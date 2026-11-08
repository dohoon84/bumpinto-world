// [bump24game] 문 앞 'E 들어가기'.
//   정자점: 매장이 켜져 있으면 쿼리 없이도 문 앞 안내·입장 (기본 URL). ?bp24game=0 또는 ?bump24jeongja=0 이면 끔.
//   시청점 매장은 기본으로 켜져 있다(?bp24=0 · ?bump24cityhall=0 이면 끔). 문 안내도 매장이 켜져 있으면 기본으로 뜬다.
import { cityhallBump24On, jeongjaBump24On } from '../corridor/bp24Locations.js';

const JEONGJA_STORE = 'bump24-jeongja';

function paramsOf(search) {
  const s = search instanceof URLSearchParams ? search.toString() : String(search || '');
  return new URLSearchParams(s.startsWith('?') ? s.slice(1) : s);
}

export function bump24GameExplicit(search = typeof location !== 'undefined' ? location.search : '') {
  const v = paramsOf(search).get('bp24game');
  return v === '1' || v === 'demo';
}

export function bump24GameEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const p = paramsOf(search);
  if (p.get('bp24game') === '0') return false;
  // 기본 주소에도 정자·코리더 매장이 있다. 시청점 안내만 아래에서 가른다.
  return true;
}

/** 문 앞 'E 들어가기'. 시청점은 매장이 켜져 있으면 기본으로. 정자 베이스맵은 ?bump24jeongja=0 으로 같이 끈다. */
export function bump24StorePrompts(storeId, search = typeof location !== 'undefined' ? location.search : '') {
  if (!storeId || !bump24GameEnabled(search)) return false;
  if (storeId === 'seongnam-cityhall') return cityhallBump24On(search);
  if (storeId === JEONGJA_STORE || /^jz\d+$/.test(storeId)) return jeongjaBump24On(search);
  return true;
}

export function bump24GameMode(search = typeof location !== 'undefined' ? location.search : '') {
  if (!bump24GameEnabled(search)) return null;
  return paramsOf(search).get('bp24game') === 'demo' ? 'demo' : '1';
}
