// [namsan] 공유 상수. 투영 원점은 정자(37.3665, 127.10835).
export const NT = {
  height: 236.7,
  eleTip: 479.7,
  eleBase: 243,
  elePeakOsm: 267,
  datum: 48,
  plazaH: 24,
  shaftH: 90,
  drumH: 33,
  shaftR: 5.6,
  drumR: 14.8,
  ringY: 40,
  tx: -10627.25,
  tz: -20429.65,
  lat: 37.5512692,
  lon: 126.9882959,
  osmRel: 'relation/16474080',
};
export function namsanBaseY() { return NT.eleBase - NT.datum; }
