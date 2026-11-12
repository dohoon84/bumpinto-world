// [boot-fast] 남산·한강 섬 경계·스폰. DEM 헤더에서 뽑은 상수라 JSON 없이 스텁을 만들 수 있다.
import { NT, namsanBaseY } from './namsanCoords.js';

export const NAMSAN_BOUNDS = {
  x0: -11275,
  z0: -21300,
  x1: -11275 + 56 * 25,
  z1: -21300 + 57 * 25,
};

export const HANGANG_S1_BOUNDS = {
  x0: -12425,
  z0: -18300,
  x1: -12425 + 167 * 25,
  z1: -18300 + 147 * 25,
};

export const HANGANG_HAP_BOUNDS = {
  x0: -9100,
  z0: -18625,
  x1: -9100 + 388 * 25,
  z1: -18625 + 217 * 25,
};

export const HANGANG_BOXES = [HANGANG_S1_BOUNDS, HANGANG_HAP_BOUNDS];

export const NAMSAN_SPAWN = { x: NT.tx + 44, z: NT.tz + 6, y: namsanBaseY() + 0.15 };

// 잠수교 남단 — hangang-osm.json spawn 과 같다
// [gangnam-enter] 2구간(hap-osm.json spawns) 이동 목적지. 지연 로딩이면 부트에 hap-osm 이 없어서 상수로 둔다.
export const HANGANG_HAP_SPAWNS = {
  'tancheon-hap': { x: -3685.8, z: -16796.5, name: '탄천합수부' },
  jamwon: { x: -8698.5, z: -17023.6, name: '잠원한강공원' },
};

export const HANGANG_SPAWN = { x: -9741.7, z: -15961.4, y: 0.15, name: '잠수교 남단' };

export function emptyLandmarkMini() {
  return { roads: [], buildings: [], parks: [], water: [], waterLines: [] };
}
