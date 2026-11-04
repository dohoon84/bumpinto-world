// [econ-ui] 교통카드 앱 내역 합치기 (DOM 없음 → scripts/test-econ-mock.mjs 에서 바로 테스트)
//   원장 fare 행(#30 44dcb3b~)에는 rideId · mode · code · listAmount · charged 가 있고, 무료 탑승은 delta 0 · free:true 행(id 'e{n}')이다.
//   1) rideId 로 먼저 맞춘다: 탑승 기록의 rideId = 게임이 econ 에 넘긴 값(ride/index.js emitTransit) — 버스 fare.receiptId || 'bus-{at}', 택시 'taxi-{at}'
//   2) rideId 가 없는 요금 행만 예전 방식(수단 + 탑승~하차 ±2분)으로 붙인다.
export const fareMode = (e) => {
  if (e.mode === 'bus' || e.mode === 'subway' || e.mode === 'taxi') return e.mode;
  const t = `${e.title?.ko || ''} ${e.title?.en || ''}`; return /택시|Taxi/i.test(t) ? 'taxi' : /지하철|Subway/i.test(t) ? 'subway' : 'bus';
};
/** 탑승 기록 한 줄의 econ 모드 (기록은 bus/taxi, 지하철 기록이 생기면 subway) */
export const rideMode = (r) => (r.mode === 'taxi' || r.mode === 'subway' ? r.mode : 'bus');
/** 탑승 기록 한 줄이 econ 에 보냈을 rideId 후보. #30 8006645~: 서버가 받은 rideId 를 fare.receiptId 로 돌려준다(무료·유료 모두, 서버 영수증 번호는 serverReceiptId)
 *  → 모든 수단에서 fare.receiptId 가 먼저, 그다음 게임이 만드는 규칙(ride/index.js · econ-ui/index.js onTransit):
 *  버스 'bus-{at}', 택시 'taxi-{at}'(택시 r.at 은 결제 뒤에 정해져 보통 안 맞음 → 예비), 지하철 'sub-{분}'(태그한 분, 경계 대비 ±1분) */
export function rideKeys(r) {
  const k = [];
  if (r.fare?.receiptId) k.push(r.fare.receiptId);
  const m = rideMode(r);
  if (m === 'subway') { const mi = Math.floor(r.at / 60000); k.push(`sub-${mi}`, `sub-${mi - 1}`, `sub-${mi + 1}`); }
  else k.push(`${m}-${r.at}`);
  if (r.id) k.push(r.id);
  return k;
}

/** 탑승 기록 + 원장을 한 목록으로. 요금(원장 fare, 무료 0원 줄 포함)은 같은 탑승 줄에 붙인다(따로 두 줄이 되지 않게). */
export function mergeHistory(rides, ledger, { slackMs = 120e3 } = {}) {
  const fares = ledger.filter((e) => e.kind === 'fare').map((e) => ({ e, mode: fareMode(e), used: false }));
  const byId = new Map();
  for (const f of fares) if (f.e.rideId && !byId.has(f.e.rideId)) byId.set(f.e.rideId, f);
  const out = rides.map((r) => ({ t: 'ride', at: r.at, r, fare: null }));
  for (const x of out) { // 1) rideId
    for (const k of rideKeys(x.r)) { const f = byId.get(k); if (f && !f.used && f.mode === rideMode(x.r)) { f.used = true; x.fare = f.e; x.by = 'rideId'; break; } }
  }
  for (const x of out) { // 2) rideId 없는 행만 시간으로
    if (x.fare) continue;
    const r = x.r, f = fares.find((y) => !y.used && !y.e.rideId && y.mode === rideMode(r) && y.e.at >= r.at - slackMs && y.e.at <= (r.end || r.at) + slackMs);
    if (f) { f.used = true; x.fare = f.e; x.by = 'time'; }
  }
  for (const e of ledger) if (e.kind !== 'fare' || !fares.find((y) => y.e === e)?.used) out.push({ t: 'led', at: e.at, e });
  return out.sort((a, b) => b.at - a.at);
}
