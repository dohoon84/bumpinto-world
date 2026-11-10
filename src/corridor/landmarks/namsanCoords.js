// [namsan] 공유 상수. 투영 원점은 정자(37.3665, 127.10835).
export const NT = {
  height: 236.7,
  eleTip: 479.7,
  eleBase: 243,
  elePeakOsm: 267,
  datum: 48,
  plazaH: 12,  // 2–3 storey podium (shaft still starts so tip = baseY + 236.7)
  shaftH: 102, // 12 + 102 = 114, same drum height as before
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

// 타워에서 멀어질수록 서울 분지(~40 m ASL)로 내려가게. DEM 밖 폴백·도시 바닥 높이에 쓴다.
export function namsanBasinEle(d) {
  if (d < 180) return NT.eleBase;
  if (d < 800) return NT.eleBase - ((d - 180) / 620) * 203; // 243 → 40
  return 38;
}
export function namsanBasinY(d) { return namsanBasinEle(d) - NT.datum; }

/** ring 은 [[x,z], …] (닫힌 고리, 마지막=첫점 중복 없어도 됨) */
export function pointInRing(x, z, ring) {
  if (!ring || ring.length < 3) return false;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], zi = ring[i][1];
    const xj = ring[j][0], zj = ring[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-12) + xi)) inside = !inside;
  }
  return inside;
}

/** OSM 남산공원·숲 폴리곤 안, 또는 정상 부근/높은 DEM ( stray 시가지 건물 걸러내기 ) */
export function inNamsanPark(x, z, parks, heightAt) {
  if (parks) {
    for (const p of parks) {
      if (p?.o && pointInRing(x, z, p.o)) return true;
    }
  }
  const d = Math.hypot(x - NT.tx, z - NT.tz);
  if (d < 280) return true;
  if (!heightAt) return false;
  const y = heightAt(x, z);
  if (!Number.isFinite(y)) return false;
  return d < 850 && y > 70;
}
