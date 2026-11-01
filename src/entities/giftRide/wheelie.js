// 스페이스바 앞바퀴 들기(윌리): 관리자 크루저와 선물 탈것(슈퍼바이크 RR)이 같이 쓰는 순수 함수.
//   b.wheelie(rad, 앞바퀴 들린 각) · b.wheelieVel 만 바꾸고, 정지에서 들 때 살짝 치고 나가는 b.v · 착지 바운스 b.dive 를 더한다.

/**
 * @param {object} b { v, wheelie, wheelieVel, dive? }
 * @param {number} dt
 * @param {boolean} held 스페이스바를 누르고 있는지
 * @param {number} f 스로틀 입력 -1~1
 * @param {number} max 최대 각(rad)
 * @param {object} [o] lift(들어 올리는 강성), damp, fall(놓았을 때 중력 복원), kick(정지에서 치고 나가는 최고 m/s)
 */
export function stepWheelie(b, dt, held, f, max, o = {}) {
  const lift = o.lift ?? 18;
  const damp = o.damp ?? 6.5;
  const fall = o.fall ?? 4.2;
  const kick = o.kick ?? 2.2;
  if (held && b.v >= -0.2) {
    const target = max * (0.82 + 0.18 * Math.min(1, Math.abs(b.v) / 8));
    b.wheelieVel += (target - b.wheelie) * lift * dt;
    b.wheelieVel *= Math.max(0, 1 - damp * dt);
    if (kick > 0 && f <= 0 && b.v < kick) b.v = Math.min(kick, b.v + 2.4 * dt);
  } else {
    b.wheelieVel -= fall * dt;
  }
  b.wheelie += b.wheelieVel * dt;
  if (b.wheelie <= 0) {
    if (b.wheelieVel < -0.45) b.dive = Math.min(0.032, (b.dive || 0) + Math.abs(b.wheelieVel) * 0.012); // 앞바퀴 착지 서스펜션 바운스
    b.wheelie = 0;
    b.wheelieVel = 0;
  } else if (b.wheelie > max) {
    b.wheelie = max;
    if (b.wheelieVel > 0) b.wheelieVel = 0;
  }
}

/** 앞바퀴가 들려 있으면 조향이 둔해진다 */
export const wheelieSteerScale = (w) => (w > 0.1 ? 0.55 : 1);
