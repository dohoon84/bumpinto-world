// [superbike] 엔진음 파라미터 (순수 함수, 테스트: scripts/corridor/test/test-superbike.mjs)
//   주행 루프(ride)는 녹음의 2단 가속을 음높이 일정하게 편 것. 속도로 기어를 고르고 기어 안 회전 비율로 재생 속도를 정한다.

/** 기어별 최고 속도(km/h, 레드존). 6단 = 실차 최고 303 km/h */
export const SB_GEARS = [95, 140, 180, 220, 260, 303];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** @param {number} v 속도 m/s @returns {{ gear: number, rev: number }} gear 1~6, rev = 그 기어 레드존 대비 0~1 */
export function gearOf(v) {
  const kmh = Math.abs(v) * 3.6;
  const i = SB_GEARS.findIndex((top) => kmh < top * 0.97);
  const g = i < 0 ? SB_GEARS.length - 1 : i;
  return { gear: g + 1, rev: clamp(kmh / SB_GEARS[g], 0, 1) };
}

/** 주행 루프 재생 속도: 기어 안에서 회전이 오를수록 높고, 변속하면 떨어진다 */
export function rideRate(av, throttle) {
  const { rev } = gearOf(av);
  return clamp(0.62 + 0.9 * rev + 0.05 * throttle, 0.6, 1.6);
}

/** 공회전 ↔ 주행 크로스페이드 비율 0~1 */
export const rideMix = (av, throttle) => clamp(av / 4 + throttle * 0.5, 0, 1);

/** 주행 루프 음량 배율: 스로틀을 열수록, 빠를수록 크게 */
export const rideGain = (av, throttle) => 0.72 + 0.2 * throttle + 0.12 * Math.min(1, av / 40);
