// [bump24game] ?bp24game=1 이고, 시청점(?bp24/?bump24) 또는 정자 매장(기본 켜짐, ?bump24jeongja=0 으로 끔)이 있을 때만
import { jeongjaBump24On } from '../corridor/bp24Locations.js';

export function bump24GameEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const p = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  if (p.get('bp24game') === '0') return false;
  if (p.get('bp24game') !== '1' && p.get('bp24game') !== 'demo') return false;
  const store = p.get('bp24') ?? p.get('bump24');
  if (store && store !== '0') return true;
  return jeongjaBump24On(p);
}

export function bump24GameMode(search = typeof location !== 'undefined' ? location.search : '') {
  if (!bump24GameEnabled(search)) return null;
  const p = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  return p.get('bp24game') === 'demo' ? 'demo' : '1';
}
