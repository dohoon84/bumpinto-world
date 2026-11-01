// [superbike] 엔진음 파라미터 (순수 함수, 테스트: scripts/corridor/test/test-superbike.mjs)
//   주행음 = 기어별 루프 gear1~5 (사용자 녹음 1~5단 가속을 음높이 일정하게 편 것, scripts/superbike-audio.py --gears).
//   속도로 기어를 고르고 그 기어 루프만 재생, 기어 안에서는 회전 비율로 재생 속도를 조금만(0.9~1.12) 바꾼다.
//   6단은 5단 루프를 3% 높여 재사용. 변속하면 bikeAudio 가 두 루프를 등전력 크로스페이드한다.

/** 기어별 최고 속도(km/h, 레드존). 6단 = 실차 최고 303 km/h */
export const SB_GEARS = [95, 140, 180, 220, 260, 303];
/** 기어 → 주행 루프 번호(0=gear1 …). 6단은 gear5 */
export const SB_LAYERS = [0, 1, 2, 3, 4, 4];
const RATE_LO = 0.9, RATE_HI = 1.12, TOP_GEAR_PITCH = 1.03;
const SHIFT_AT = 0.97;   // 레드존의 97% 에서 변속
const DOWN_HYST = 4;     // km/h: 내릴 때는 이만큼 더 느려져야 저단으로 (경계에서 기어가 떨지 않게)
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * @param {number} v 속도 m/s
 * @param {number} [held] 지금 기어(1~6). 주면 저단 쪽 경계에 히스테리시스
 * @returns {{ gear: number, rev: number, u: number }} gear 1~6, rev = 레드존 대비 0~1, u = 기어 안 위치 0(진입)~1(변속)
 */
export function gearOf(v, held = 0) {
  const kmh = Math.abs(v) * 3.6;
  let i = SB_GEARS.findIndex((top) => kmh < top * SHIFT_AT);
  if (i < 0) i = SB_GEARS.length - 1;
  if (held - 1 > i && kmh > SB_GEARS[i] * SHIFT_AT - DOWN_HYST) i = held - 1;
  const lo = i ? SB_GEARS[i - 1] * SHIFT_AT : 0, hi = SB_GEARS[i] * SHIFT_AT;
  return { gear: i + 1, rev: clamp(kmh / SB_GEARS[i], 0, 1), u: clamp((kmh - lo) / (hi - lo), 0, 1) };
}

/** bikeAudio curves.layer: 재생할 기어 루프 번호. held = 지금 재생 중인 루프 번호 (히스테리시스용) */
export function rideLayer(av, held = -1) {
  return SB_LAYERS[gearOf(av, layerGear(held)).gear - 1];
}
/** 루프 번호 → 그 루프를 쓰는 가장 높은 기어 (히스테리시스 기준). -1 → 0(없음) */
const layerGear = (layer) => (layer >= 0 ? SB_LAYERS.lastIndexOf(layer) + 1 : 0);

/** 주행 루프 재생 속도: 기어 안에서 0.9→1.12 로만 오르고(녹음 음높이 근처), 변속하면 다음 기어 루프가 0.9 부터.
 *  layer = 지금 재생 중인 루프 (rideLayer 와 같은 히스테리시스로 기어를 본다) */
export function rideRate(av, throttle = 0, layer = -1) {
  const { gear, u } = gearOf(av, layerGear(layer));
  const r = RATE_LO + (RATE_HI - RATE_LO) * u + 0.02 * throttle;
  return +(r * (gear === 6 ? TOP_GEAR_PITCH : 1)).toFixed(4);
}

/** 공회전 ↔ 주행 크로스페이드 비율 0~1 */
export const rideMix = (av, throttle) => clamp(av / 4 + throttle * 0.5, 0, 1);

/** 주행 루프 음량 배율: 스로틀을 열수록, 빠를수록 크게 */
export const rideGain = (av, throttle) => 0.72 + 0.2 * throttle + 0.12 * Math.min(1, av / 40);
