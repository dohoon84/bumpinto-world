// [depot] 범창고(BUMP DEPOT) 정자점 — 대왕판교로·경부고속도로 사이 서쪽 띠 부지. ?depot=0 으로 끔.
//   부지: 정자 로컬 좌표 x −578~−460 이 도로·건물 없는 빈 땅(5 m 격자 점검, 지면 높이 0 m로 평탄).
//   건물은 실측(트레이더스 월계점 9,917 ㎡ 와 같은 급) 84 × 120 m, 북쪽(정자역 쪽) 정면.
export function depotEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const s = String(search || '');
  const p = new URLSearchParams(s.startsWith('?') ? s.slice(1) : s);
  return p.get('depot') !== '0';
}

export const DEPOT_AT = 'depot';
// 건물 외곽 (월드 좌표). 북쪽 면 z0 이 정면, 출입구는 북동쪽 모서리 쪽.
export const DEPOT_SITE = Object.freeze({
  x0: -561, x1: -477, z0: 500, z1: 620, h: 9.6,
  door: Object.freeze({ x: -492, z: 500, w: 8 }), // 출입구 중심(벽 위) · 폭
});
// ?at=depot 착지점: 출입구 앞 6 m, 문을 바라봄 (+z 방향 = 남쪽)
export const DEPOT_SPAWN = Object.freeze({ x: -492, z: 496.5, yaw: 0, face: Math.PI });
