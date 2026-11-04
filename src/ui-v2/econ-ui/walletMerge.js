// [econ-ui] 교통카드 앱 내역 합치기 (DOM 없음 → scripts/test-econ-mock.mjs 에서 바로 테스트)
//   원장 fare 행에는 rideId 가 없다 → 제목(택시/지하철/그 외 버스)과 시각(탑승~하차 ±2분)으로 같은 탑승 줄에 붙인다.
export const fareMode = (e) => { const t = `${e.title?.ko || ''} ${e.title?.en || ''}`; return /택시|Taxi/i.test(t) ? 'taxi' : /지하철|Subway/i.test(t) ? 'subway' : 'bus'; };

/** 탑승 기록 + 원장을 한 목록으로. 유료 요금(원장 fare)은 시간이 겹치는 같은 수단 탑승 줄에 붙인다(따로 두 줄이 되지 않게). */
export function mergeHistory(rides, ledger, { slackMs = 120e3 } = {}) {
  const fares = ledger.filter((e) => e.kind === 'fare').map((e) => ({ e, mode: fareMode(e), used: false }));
  const out = rides.map((r) => {
    const f = fares.find((x) => !x.used && x.mode === r.mode && x.e.at >= r.at - slackMs && x.e.at <= (r.end || r.at) + slackMs);
    if (f) f.used = true;
    return { t: 'ride', at: r.at, r, fare: f?.e || null };
  });
  for (const e of ledger) if (e.kind !== 'fare' || !fares.find((x) => x.e === e)?.used) out.push({ t: 'led', at: e.at, e });
  return out.sort((a, b) => b.at - a.at);
}

