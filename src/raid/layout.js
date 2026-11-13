// 탄천합수부 균열 인스턴스의 바닥 좌표.
// 원점 = public/corridor/hangang/hap-osm.json spawns['tancheon-hap'] (-3685.8, -16796.5).
// 축 = 그 지점의 「탄천 자전거길」 첫 구간 방위 (로컬 (0,0) → (18, 74), dx/dz ≈ 0.243).
// 균열은 폭 3m OSM 노면을 싸움이 읽히는 너비로 벌린다. 새 대륙이 아니라 같은 길의 인스턴스다.

export const PATH_SLOPE = 0.243;

const tLen = Math.hypot(PATH_SLOPE, 1);
export const TANGENT = { x: PATH_SLOPE / tLen, z: 1 / tLen };
export const PERP = { x: -TANGENT.z, z: TANGENT.x };
export const PATH_YAW = Math.atan2(TANGENT.x, TANGENT.z);

export const SAFE_ALONG = 6;
export const SAFE_R = 4.8;
export const BOSS_ALONG = 23.4;
export const SPAWN_ALONG = -2.4;
export const ALONG_MIN = -18;
export const ALONG_MAX = 34;
export const ACROSS_MAX = 6.5;
export const BOSS_BODY_R = 4.3;

export function fromFrame(along, across) {
  return {
    x: TANGENT.x * along + PERP.x * across,
    z: TANGENT.z * along + PERP.z * across,
  };
}

export function toFrame(x, z) {
  return {
    along: x * TANGENT.x + z * TANGENT.z,
    across: x * PERP.x + z * PERP.z,
  };
}

export function safePoint() {
  return { ...fromFrame(SAFE_ALONG, 0), r: SAFE_R };
}

export function bossPoint() {
  return fromFrame(BOSS_ALONG, 0);
}

export function spawnPoint() {
  return fromFrame(SPAWN_ALONG, 0);
}

export function inSafe(x, z) {
  const f = toFrame(x, z);
  return Math.hypot(f.along - SAFE_ALONG, f.across) <= SAFE_R;
}

export function clampArena(x, z) {
  const f = toFrame(x, z);
  const along = Math.max(ALONG_MIN, Math.min(ALONG_MAX, f.along));
  const across = Math.max(-ACROSS_MAX, Math.min(ACROSS_MAX, f.across));
  return fromFrame(along, across);
}

export function pushOutOfBoss(x, z) {
  const b = bossPoint();
  let dx = x - b.x;
  let dz = z - b.z;
  const d = Math.hypot(dx, dz) || 0.0001;
  if (d >= BOSS_BODY_R) return { x, z };
  dx /= d;
  dz /= d;
  return { x: b.x + dx * BOSS_BODY_R, z: b.z + dz * BOSS_BODY_R };
}
