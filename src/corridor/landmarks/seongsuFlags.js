// [seongsu] 파일 경로·켜짐 플래그·섬 경계만 (메시 빌더 seongsu.js 는 불러오지 않는다).
//   데이터: scripts/corridor/build-seongsu.py → public/corridor/seongsu/seongsu.json (OSM API 0.6, 평지 y = 0)
//   ?seongsu=0 이면 성수동(지상 리전 + 2호선 성수역)을 통째로 끈다.
export const SEONGSU_FILE = 'seongsu/seongsu.json';

export function seongsuEnabled(search = typeof location !== 'undefined' ? location.search : null) {
  if (search == null) {
    const env = typeof process !== 'undefined' ? process.env || {} : {};
    return env.SEONGSU !== '0';
  }
  const s = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  return s.get('seongsu') !== '0';
}

/** 걸을 수 있는 섬 (서울숲 ~ 성수역 ~ 연무장길 ~ 뚝섬로 하우스 노웨어 ~ 자양동 능동로). build-seongsu.py BOUNDS 와 같다 */
export const SEONGSU_BOUNDS = { x0: -6710.7, z0: -19952.5, x1: -3481.4, z1: -18758.6 }; // [seongsu-v2] 서울숲·성수대교 북단 ~ 청담대교 북단(능동로)
/** [v4b] 성수 섬 남쪽 끝(z1) ↔ 합수부(2구간) 땅(z −18625) 사이 134 m 가 어느 섬에도 없어 다리·강변 쪽으로 못 걸어갔다 → 잇는 띠 섬 */
export const SEONGSU_LINK = { x0: -6710.7, z0: -18760.6, x1: -3481.4, z1: -18620 };
/** 보이기만 하는 바깥 띠 */
export const SEONGSU_APRON = { x0: -6825.8, z0: -20085.1, x1: -3366.4, z1: -18648.1 };
/** 하우스 노웨어 서울 (뚝섬로 433) — 사옥 로컬 원점·방향. ry = 로컬 +z(정문)가 뚝섬로를 보게 */
export const SEONGSU_HQ = { x: -4371.7, z: -18970.1, ry: -0.3197 };
/** 도착 자리: 사옥 정문 앞 보도(로컬 2, 24), 사옥을 보게 (cam.yaw = ry) */
export const SEONGSU_SPAWN = { x: -4377.3, z: -18946.7, y: 0.05, face: -0.3197, name: '하우스 노웨어 서울 앞' };
/** 2호선 초록 (서울교통공사 노선색) */
export const LINE2_COLOR = '#00A84D';

export function inSeongsu(x, z, pad = 0, b = SEONGSU_BOUNDS) {
  return x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad;
}
/** 사옥 월드 → 로컬 */
export function hqLocal(x, z, hq = SEONGSU_HQ) {
  const dx = x - hq.x, dz = z - hq.z, c = Math.cos(hq.ry), s = Math.sin(hq.ry);
  return [dx * c - dz * s, dx * s + dz * c];
}
/** 사옥 로컬 → 월드 */
export function hqWorld(lx, lz, hq = SEONGSU_HQ) {
  const c = Math.cos(hq.ry), s = Math.sin(hq.ry);
  return [hq.x + lx * c + lz * s, hq.z - lx * s + lz * c];
}
