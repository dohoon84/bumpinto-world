// [gangnam] 교통 요금은 승차 id 하나당 한 번. 60초로 막지 않는다.
//   결제가 성공한 id 만 기억한다. 실패한 승차는 다시 태그할 수 있다.
//   진행 중인 같은 id 는 두 번 보내지 않는다.

export function createRideOnce() {
  const done = new Set();
  const inflight = new Set();
  return {
    begin(rideId) {
      if (!rideId || done.has(rideId) || inflight.has(rideId)) return false;
      inflight.add(rideId);
      return true;
    },
    finish(rideId, ok) {
      if (rideId) inflight.delete(rideId);
      if (ok && rideId) done.add(rideId);
    },
    has(rideId) { return done.has(rideId); },
  };
}

/** 결제 팝업 한가운데 금액. 무료는 '0 bum'. */
export function fareChargeText(amount, free = false) {
  if (free) return '0 bum';
  const n = Math.round(Math.abs(+amount || 0)).toLocaleString('en-US');
  return `−${n} bum`;
}
