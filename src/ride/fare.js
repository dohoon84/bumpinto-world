// [ride] 요금 결제 계층 — 모든 탑승(버스·택시)은 반드시 charge() 하나를 거친다.
//   - 지금은 재화가 없어서 모든 요금이 0원이고 항상 성공한다(무료 체험 카드).
//   - 요금표(FARES)와 통화는 이 파일 한 곳에만 있다 → 나중에 금액만 바꾸면 된다.
//   - 비동기 인터페이스: charge() 는 Promise<{ ok, amount, currency, receiptId, code, ... }> 를 돌려준다.
//     지갑(서버 잔액·결제)이 생기면 setPaymentProvider(async (req) => ({ ok, receiptId?, error? })) 로 끼운다.
//     0원 결제는 provider 를 부르지 않고 바로 영수증을 만든다.
export const CURRENCY = 'KRW';

// code -> { amount, mode, premium?, label }
export const FARES = Object.freeze({
  'bus.base': { amount: 0, mode: 'bus', label: { ko: '버스 기본요금', en: 'Bus base fare' } },
  'taxi.drive': { amount: 0, mode: 'taxi', label: { ko: '택시 (일반 주행)', en: 'Taxi (normal drive)' } },
  'taxi.fast': { amount: 0, mode: 'taxi', label: { ko: '택시 (빨리감기)', en: 'Taxi (fast-forward)' } },
  // 즉시 도착: 추후 유료(프리미엄) 옵션. 지금은 0원이지만 별도 요금 코드로 결제 단계를 거친다.
  'taxi.instant': { amount: 0, mode: 'taxi', premium: true, label: { ko: '택시 즉시 도착 (프리미엄 예정)', en: 'Taxi instant arrival (future premium)' } },
});

let provider = null;
let seq = 0;
const listeners = new Set();
const history = []; // 최근 결제 시도(디버그·테스트용, 메모리만)

export function setPaymentProvider(fn) { provider = typeof fn === 'function' ? fn : null; }
export function onCharge(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function recentCharges() { return history.slice(); }
export function fareOf(code) { return FARES[code] || null; }

const newReceipt = (now) => `rcpt-${now.toString(36)}-${(++seq).toString(36)}-${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;

// req: { code, mode?, card?, meta? }  → 결과 객체. 실패해도 throw 하지 않는다.
export async function charge(req = {}) {
  const now = Date.now();
  const f = FARES[req.code];
  let res;
  if (!f) res = { ok: false, error: 'unknown_fare', amount: 0, currency: CURRENCY, code: req.code || '', receiptId: null };
  else if (req.mode && req.mode !== f.mode) res = { ok: false, error: 'mode_mismatch', amount: f.amount, currency: CURRENCY, code: req.code, receiptId: null };
  else if (f.amount === 0) res = { ok: true, amount: 0, currency: CURRENCY, code: req.code, receiptId: newReceipt(now), free: true };
  else if (!provider) res = { ok: false, error: 'no_wallet', amount: f.amount, currency: CURRENCY, code: req.code, receiptId: null };
  else {
    try {
      const r = (await provider({ code: req.code, mode: f.mode, amount: f.amount, currency: CURRENCY, card: req.card || null, meta: req.meta || null })) || {};
      res = { ok: !!r.ok, amount: f.amount, currency: CURRENCY, code: req.code, receiptId: r.ok ? (r.receiptId || newReceipt(now)) : null, error: r.ok ? undefined : (r.error || 'declined') };
    } catch (e) {
      res = { ok: false, amount: f.amount, currency: CURRENCY, code: req.code, receiptId: null, error: String(e?.message || e) };
    }
  }
  res.mode = f?.mode || req.mode || '';
  res.premium = !!f?.premium;
  res.card = req.card || null;
  res.at = now;
  history.push(res); if (history.length > 50) history.shift();
  for (const fn of listeners) { try { fn(res); } catch { /* 리스너 오류는 결제와 무관 */ } }
  return res;
}

export const fare = { charge, FARES, CURRENCY, setPaymentProvider, onCharge, recentCharges, fareOf };
export default fare;
