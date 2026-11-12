// [namsan] 파일 경로·켜짐 플래그만. 메시 빌더(namsan.js)는 불러오지 않는다.
export const NAMSAN_DEM_FILE = 'namsan/namsan-dem.json';
export const NAMSAN_OSM_FILE = 'namsan/namsan-osm.json';
export const NAMSAN_CITY_FILE = 'namsan/namsan-city.json';

export function namsanEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search || '').get('ntower') !== '0';
}
export function namsanCableEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return namsanEnabled(search) && new URLSearchParams(search || '').get('ncable') !== '0';
}
