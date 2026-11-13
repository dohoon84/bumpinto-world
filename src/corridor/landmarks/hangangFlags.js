// [hangang] 파일 경로·켜짐 플래그만. 메시 빌더(hangang.js)는 불러오지 않는다.
export const HANGANG_DEM_FILE = 'hangang/hangang-dem.json';
export const HANGANG_OSM_FILE = 'hangang/hangang-osm.json';
export const HAP_DEM_FILE = 'hangang/hap-dem.json';
export const HAP_OSM_FILE = 'hangang/hap-osm.json';
export const HANGANG_TERRAIN_BAKE_FILE = 'hangang/s1-terrain-meshes.bin.gz';
export const HAP_TERRAIN_BAKE_FILE = 'hangang/hap-terrain-meshes.bin.gz';

export function hangangEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search || '').get('hangang') !== '0';
}
