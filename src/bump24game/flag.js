// [bump24game] 문 앞 'E 들어가기'.
//   정자점: 매장이 켜져 있으면 쿼리 없이도 문 앞 안내·입장 (기본 URL). ?bp24game=0 또는 ?bump24jeongja=0 이면 끔.
//   시청점: 예전과 같이 ?bp24=1(?bump24=1) 과 ?bp24game=1 이 같이 있어야 한다.
import { jeongjaBump24On } from '../corridor/bp24Locations.js';

const JEONGJA_STORE = 'bump24-jeongja';

function paramsOf(search) {
  const s = search instanceof URLSearchParams ? search.toString() : String(search || '');
  return new URLSearchParams(s.startsWith('?') ? s.slice(1) : s);
}

export function bump24GameExplicit(search = typeof location !== 'undefined' ? location.search : '') {
  const v = paramsOf(search).get('bp24game');
  return v === '1' || v === 'demo';
}

function corridorStoreOn(p) {
  const store = p.get('bp24') ?? p.get('bump24');
  return !!(store && store !== '0');
}

export function bump24GameEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const p = paramsOf(search);
  if (p.get('bp24game') === '0') return false;
  if (bump24GameExplicit(p)) return corridorStoreOn(p) || jeongjaBump24On(p);
  // 기본 주소(enter·from 만 붙는 모바일 입장 포함): 정자점만. 시청점은 ?bp24game=1 그대로.
  return jeongjaBump24On(p);
}

/** 이 매장 문 앞에 들어가기 안내를 띄울지. 정자점만 기본 주소에서 켜진다. */
export function bump24StorePrompts(storeId, search = typeof location !== 'undefined' ? location.search : '') {
  if (!storeId || !bump24GameEnabled(search)) return false;
  if (bump24GameExplicit(search)) return true;
  return storeId === JEONGJA_STORE;
}

export function bump24GameMode(search = typeof location !== 'undefined' ? location.search : '') {
  if (!bump24GameEnabled(search)) return null;
  return paramsOf(search).get('bp24game') === 'demo' ? 'demo' : '1';
}
