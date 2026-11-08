// [econ-ui] 개찰구 통과 요금: 한 탑승에 표시 한 번, 기본은 가운데 차감 팝.
//   ?farecard=1 이면 예전 카드(showPay 의 ve-paystack)를 그대로 그린다. 중복 억제는 어느 쪽이든 같다.
import { tr } from '../../i18n.js';

/** 한 방문(역에 들어와서 밖으로 나가기 전) 안에서 요금을 다시 내지 않기 위한 상한. 나가기 신호를 놓쳐도 이 뒤에는 새 탑승. */
export const SUBWAY_RIDE_MS = 30 * 60 * 1000;

const uiFareModes = new Set();
let subFare = { rideId: null, at: 0 };

/** @param {string} [search] location.search. 없으면 지금 주소. */
export function fareCardOn(search) {
  try {
    const q = search ?? (typeof location !== 'undefined' ? location.search : '');
    return new URLSearchParams(q || '').get('farecard') === '1';
  } catch { return false; }
}

/**
 * 개찰구 태그 한 번을 요금으로 볼지.
 * ev: { gate?: 'in'|'out', inside?: boolean }  inside 가 false 면 역 밖(방문 끝).
 * state: { rideId: string|null, at: number }
 * @returns {{ action: 'pay'|'ignore', reason: string, rideId: string|null, state: { rideId: string|null, at: number } }}
 */
export function decideSubwayFare(ev, state, now) {
  const gate = ev?.gate === 'out' ? 'out' : 'in';
  const inside = ev?.inside !== false;
  let rideId = state?.rideId || null;
  let at = state?.at || 0;
  if (!inside || (rideId && now - at > SUBWAY_RIDE_MS)) { rideId = null; at = 0; }
  if (gate === 'out') return { action: 'ignore', reason: 'exit-included', rideId, state: { rideId, at } };
  if (rideId) return { action: 'ignore', reason: 'same-ride', rideId, state: { rideId, at } };
  // 교통카드 내역이 이 형식으로 탑승 기록과 맞춘다 (walletMerge rideKeys: sub-{분} ±1).
  // 같은 방문에서 분이 바뀌어도 여기까지 오지 않는다 — 하차·재태그는 위에서 무시.
  const id = `sub-${Math.floor(now / 60000)}`;
  return { action: 'pay', reason: 'entry', rideId: id, state: { rideId: id, at: now } };
}

/** 역 방문이 끝나면(in-subway 해제) 다음 승차는 새 탑승. */
export function resetSubwayFare() { subFare = { rideId: null, at: 0 }; }

/** 게임 훅의 개찰구 태그. 승차 한 번만 pay, 하차·같은 방문의 재태그는 ignore. */
export function takeSubwayTap(ev, now = Date.now()) {
  const next = decideSubwayFare(ev, subFare, now);
  subFare = next.state;
  return next;
}

/** payAndShow 가 payFare 를 직접 부르는 동안. 끝나면 호출할 해제 함수를 돌려준다. */
export function beginUiFare(mode) {
  if (mode) uiFareModes.add(mode);
  return () => { if (mode) uiFareModes.delete(mode); };
}

/**
 * UI 가 직접 결제 중일 때 같은 mode 의 'payment' 이벤트는 화면을 그리지 않는다.
 * 영수증 id 는 지금(emit 순간, afterWrite 보다 앞) 찍어 둔다.
 * @returns {'claimed'|'defer'|'skip'}
 */
export function claimInflightPayment(p, modes, shown) {
  if (!p || p.ok === false) return 'skip';
  if (p.mode && modes.has(p.mode)) {
    if (p.receiptId) shown.add(p.receiptId);
    return 'claimed';
  }
  return 'defer';
}

/** 지금 beginUiFare 중인 결제면 claimed. */
export function claimIfUiFare(p, shown) { return claimInflightPayment(p, uiFareModes, shown); }

/** 차감 팝에 쓸 문구. 무료(베타)는 정가에 줄을 긋고 무료 표시, 로그인 탑승은 교통 +5. */
export function farePopParts(pay, fmt = (v) => Math.round(+v || 0).toLocaleString('en-US')) {
  const list = Math.round(+(pay?.listAmount ?? pay?.amount) || 0);
  const amount = Math.round(+pay?.amount || 0);
  const free = !!(pay?.free) || amount === 0;
  const rewards = [];
  if (pay?.balance && !pay.balance.guest) rewards.push(tr('교통 +5', 'Transit +5'));
  for (const e of pay?.reward || []) if (e && e.amount) rewards.push(`+${fmt(e.amount)}`);
  return {
    free,
    listText: fmt(list),
    paidText: `−${fmt(amount)} bum`,
    freeLabel: tr('무료(베타)', 'Free (Beta)'),
    rewards,
  };
}
