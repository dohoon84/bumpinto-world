// [myeongdong] 파일 경로·켜짐 플래그·섬 경계만. 메시 빌더(myeongdong.js)는 불러오지 않는다(남산 지형·도심이 이 경계만 보고 자리를 비운다).
//   데이터: scripts/corridor/build-myeongdong.py → public/corridor/myeongdong/myeongdong.json (OSM API 0.6 + terrarium DEM)
//   ?myeongdong=0 이면 명동을 통째로 끈다(남산 도심이 예전처럼 그 자리를 채운다).
export const MYEONGDONG_FILE = 'myeongdong/myeongdong.json';

export function myeongdongEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const s = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  return s.get('myeongdong') !== '0';
}

/** 걸을 수 있는 섬. 남쪽 변(z1 = -21300)은 남산 DEM 북쪽 변과 맞닿는다 → 퇴계로에서 남산오르미까지 걸어서 이어진다. */
export const MYEONGDONG_BOUNDS = { x0: -11420, z0: -22080, x1: -10530, z1: -21300 };
/** [ndm-walk] 남대문시장(서쪽 띠 안, x < -11420)도 걸을 수 있는 섬. 없으면 clampWorld 가 x = -11420 에서 플레이어를 멈춘다(골목 중간의 보이지 않는 벽). */
export const MYEONGDONG_MARKET = { x0: -11528, z0: -21545, x1: -11420, z1: -21300 };
export const MYEONGDONG_BOXES = [MYEONGDONG_BOUNDS, MYEONGDONG_MARKET];
/** 걸을 수는 없고 보이기만 하는 바깥 띠(땅·건물·길). 남산 도심(namsanCity)은 이 사각형 안을 비운다. */
export const MYEONGDONG_APRON = { x0: -11530, z0: -22300, x1: -10455, z1: -21300 };
/** 명동역 → 남산오르미 → 케이블카 하부정류장 길안내 띠 (남산 섬 안, 길안내만 그린다) */
export const MYEONGDONG_LINK = { x0: -11160, z0: -21300, x1: -10900, z1: -20990 };
/** 명동역 6번 출구 계단 위(명동8길 입구 인도). myeongdongStation.js 가 계산하는 자리와 같게 둔다(빌드 로그 spawn=). face = 북쪽(명동 거리)을 보는 cam.yaw */
export const MYEONGDONG_SPAWN = { x: -10915.6, z: -21492.5, y: 10.3, face: -0.015, name: '명동역 6번 출구' };
/** 4호선 하늘색 (서울교통공사 노선색) */
export const LINE4_COLOR = '#00A5DE';
const MD_ON = myeongdongEnabled();

export function inMyeongdong(x, z, pad = 0, b = MYEONGDONG_BOUNDS) {
  return x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad;
}
/** 남산 쪽 코드가 쓰는 판정: 명동이 켜져 있고 (x,z)가 명동 섬 안인가 */
export function myeongdongClaims(x, z, pad = 0, b = MYEONGDONG_APRON) {
  return MD_ON && inMyeongdong(x, z, pad, b);
}
