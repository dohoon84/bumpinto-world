// [econ-ui] 교통 결제 화면: 08a 버스 탑승 카드 · 08b 태그 완료 · 08c 잔액 부족 · 09a 개찰구 · 09b 통과 · 10a 택시 앱 · 10b 택시 정산 · 07 교통카드 앱
//   베타 무료 모드(getEconMode().transitPaid === false)에서는 정가에 줄을 긋고 '무료(베타)' 배지, 차감 없음.
//   유료 모드 화면(잔액 부족 포함)은 demo=econ 의 모드 토글로 볼 수 있다.
import { econ } from '../econ/index.js';
import { el } from '../kit.js';
import { n, sgn, T, tr, esc, EI, mockTag, freeBadge, bumPill, karmaPill, stamp, tag, head, closeBtn, priceHtml, bar } from './kit.js';
import { show, close, toastLayer } from './layer.js';

/** 결제 카드에 이미 '할 일 달성' 줄로 보여 준 보상 (중복 05a 토스트 방지) */
export const shownInPay = new Map();
/** 화면에 띄운 영수증 id (서버 'payment' 이벤트와 중복 표시 방지) */
export const shownReceipts = new Set();
const panel = (cls, html) => el('div', `v2-panel ve-panel ${cls}`, html);
const MODE_TAG = { bus: ['시내버스', 'City bus', '#20c997'], subway: ['지하철', 'Subway', '#f5a200'], taxi: ['택시', 'Taxi', '#ffe169'] };
const modeTag = (m, code) => {
  const lab = code && /^bus\.(village|seat|wide|circular)$/.test(code) ? { 'bus.village': ['마을버스', 'Village bus'], 'bus.seat': ['좌석버스', 'Seat bus'], 'bus.wide': ['광역버스', 'Metro bus'], 'bus.circular': ['순환버스', 'Circular bus'] }[code] : MODE_TAG[m];
  return tag(tr(lab[0], lab[1]), MODE_TAG[m][2]);
};
const tapBeep = (c = '#4cc9f0') => `<span class="ve-beep" style="--c:${c}"><i></i><i></i><i></i>${EI.card(40)}<b>${esc(tr('삑!', 'Beep!'))}</b></span>`;
const rewardPills = (rw = []) => rw.map((e) => `${bumPill(e.amount)}`).join('');

// ---------- 08a 버스 탑승 카드 (정차 중인 버스 앞)
export async function openBoard({ code = 'bus.city', where = tr('정자역 정류소 07624', 'Jeongja Stn. stop 07624'), onBoard } = {}) {
  const q = await econ.quoteFare({ mode: 'bus', code });
  const p = panel('ve-board', `<div class="v2-hrow">${modeTag('bus', code)}<b class="ve-t15">${esc(where)} · ${esc(tr('정차 중', 'at the stop'))}</b>${mockTag()}<span class="v2-grow"></span>${closeBtn()}</div>
    <div class="ve-fare">${EI.card(28)}<div class="ve-col"><small>${esc(tr('요금', 'Fare'))}</small>${priceHtml(q)}</div><span class="v2-grow"></span>
      <div class="ve-col r"><b>${esc(tr(`내 잔액 ${n(q.balance)}`, `Balance ${n(q.balance)}`))}</b><small>${esc(tr(`탑승 후 ${n(q.after)}`, `After boarding ${n(q.after)}`))}</small></div></div>
    <p class="ve-note">${esc(q.free ? tr('베타 기간에는 교통이 무료예요. 하차 태그 포함 · 탑승마다 교통 카르마 +5', 'Transit is free during the beta. Exit tap included · Transit karma +5 per ride') : tr('하차 태그 포함 · 결제 1회마다 교통 카르마 +5', 'Exit tap included · Transit karma +5 per payment'))}</p>
    <button type="button" class="v2-btn primary v2-full" data-ve="go"><span class="ve-key">E</span>${esc(tr('카드 태그하고 탑승', 'Tap card and board'))}</button>`);
  p.querySelector('[data-ve="go"]').addEventListener('click', async () => { close(true); await payAndShow({ mode: 'bus', code, rideId: `demo-bus-${Date.now()}`, where }); onBoard?.(); });
  show(p, { key: '08a' });
}

// ---------- 09a 개찰구 카드
export async function openGate({ where = tr('정자역 개찰구', 'Jeongja Stn. gates') } = {}) {
  const q = await econ.quoteFare({ mode: 'subway', code: 'subway.base' });
  const d = await econ.listQuests('daily');
  const sub = d.quests.find((x) => x.id === 'D-SUB1' && x.state === 'active');
  const p = panel('ve-board ve-gate', `<div class="v2-hrow">${modeTag('subway')}<b class="ve-t15">${esc(where)}</b>${mockTag()}<span class="v2-grow"></span>${closeBtn()}</div>
    <div class="ve-fare">${EI.card(28)}<div class="ve-col"><small>${esc(tr('기본요금', 'Base fare'))}</small>${priceHtml(q)}</div><span class="v2-grow"></span>
      <div class="ve-col r"><b>${esc(tr(`내 잔액 ${n(q.balance)}`, `Balance ${n(q.balance)}`))}</b><small>${esc(tr(`통과 후 ${n(q.after)}`, `After the gate ${n(q.after)}`))}</small></div></div>
    ${sub ? tag(tr(`오늘의 할 일 · ${T(sub.title)} +${n(sub.reward.bum)}`, `Today's quest · ${T(sub.title)} +${n(sub.reward.bum)}`), '#20c997') : ''}
    <button type="button" class="v2-btn cyan v2-full" data-ve="go">${EI.nfc(18, '#05263a')}${esc(tr('카드 대고 통과', 'Tap card and pass'))}</button>`);
  p.querySelector('[data-ve="go"]').addEventListener('click', async () => { close(true); await payAndShow({ mode: 'subway', code: 'subway.base', rideId: `demo-sub-${Date.now()}`, where }); });
  show(p, { key: '09a' });
}

/** 결제 → 08b/09b 또는 08c. 게임 훅(bw:transit)도 여기로 온다. */
export async function payAndShow({ mode, code, rideId, where = '', hold = false }) {
  const before = (await econ.getBalance()).total;
  const r = await econ.payFare({ mode, code, rideId, meta: { where } });
  if (!r.ok) {
    if (r.error.code === 'insufficient_balance') return openBlock({ mode, code, err: r.error });
    return null;
  }
  showPay(r.data, { where, before, hold });
  return r.data;
}

// ---------- 08b 버스 태그 완료 · 09b 개찰구 통과 (+ 할 일 달성 줄 + 합계)
export function showPay(pay, { where = '', before = null, hold = false } = {}) {
  pay = { ...pay, reward: pay.reward || [] };
  if (pay.receiptId) shownReceipts.add(pay.receiptId);
  for (const e of pay.reward || []) shownInPay.set(e.questId, Date.now());
  const sub = pay.mode === 'subway';
  const col = sub ? '#f5a200' : '#4cc9f0';
  const title = sub ? tr(`${where || '개찰구'} 통과`, `Passed ${where || 'the gates'}`) : tr(`${T({ ko: '시내버스', en: 'City bus' })} · 카드 태그 완료`, 'City bus · card tapped');
  const amount = pay.free ? `<b class="ve-amt-big free">0 bum</b><s class="ve-s">${n(pay.listAmount)}</s>${freeBadge()}` : `<b class="ve-amt-big">${sgn(-pay.amount)}</b>`;
  const sumParts = before != null && pay.reward.length ? `${n(before)}${pay.free ? '' : ` − ${n(pay.amount)}`}${pay.reward.map((e) => ` + ${n(e.amount)}`).join('')}` : '';
  const node = el('div', `ve-paystack${sub ? ' sub' : ''}`, `<div class="v2-panel ve-pay" style="--c:${col}">${tapBeep(col)}
      <div class="ve-col">${tag(sub ? tr('지하철', 'Subway') : tr('시내버스', 'City bus'), sub ? '#f5a200' : '#20c997')}<b class="ve-t20">${esc(title)}</b><small class="ve-sub">${esc(where ? (sub ? tr('지하철 기본요금', 'Subway base fare') : tr(`${where} 승차`, `Boarded at ${where}`)) : '')}</small>
      <div class="v2-hrow ve-amtrow">${amount}<span class="ve-after">${esc(tr(`잔액 ${n(pay.balance.total)} bum`, `Balance ${n(pay.balance.total)} bum`))}</span></div>
      <div class="v2-hrow">${karmaPill({ axis: 'transit', points: 5 })}${mockTag()}</div></div></div>
    ${pay.reward.map((e) => `<div class="v2-panel ve-qtoast">${EI.check(16, '#fff')}<div class="ve-col"><b>${esc(e.period === 'weekly' ? tr(`주간 달성 · ${T(e.title)}`, `Weekly · ${T(e.title)}`) : tr(`할 일 달성 · ${T(e.title)}`, `Quest · ${T(e.title)}`))}</b><div class="v2-hrow">${bumPill(e.amount)}${karmaPill(e.karma)}</div></div>${stamp(true)}</div>`).join('')}
    ${sumParts ? `<div class="v2-panel ve-sumline"><span>${esc(sumParts)}</span><b class="ve-gold">= ${n(pay.balance.total)} bum</b></div>` : ''}`);
  const L = toastLayer(); L.querySelectorAll('.ve-paystack').forEach((x) => x.remove());
  L.appendChild(node);
  if (!hold) setTimeout(() => node.remove(), 4200 + pay.reward.length * 800);
  return node;
}

// ---------- 08c 잔액 부족 (유료 모드)
export async function openBlock({ mode = 'bus', code = 'bus.city', err, onQuests } = {}) {
  const d = await econ.listQuests('daily');
  const left = d.guest ? [] : d.quests.filter((q) => q.state === 'active' && !q.bonus).slice(0, 2);
  const lab = mode === 'subway' ? tr('지하철 기본요금', 'Subway base fare') : tr('시내버스 요금', 'City bus fare');
  const p = panel('ve-block', `<div class="v2-hrow"><span class="ve-bang">!</span><b class="ve-t22">${esc(mode === 'subway' ? tr('잔액이 부족해서 통과할 수 없어요', "Not enough bum to pass the gate") : tr('잔액이 부족해서 탈 수 없어요', "Not enough bum to board"))}</b>${mockTag()}<span class="v2-grow"></span>${closeBtn()}</div>
    <div class="ve-short"><small>${esc(tr(`${lab} ${n(err.need)} · 내 잔액 ${n(err.balance)}`, `${lab} ${n(err.need)} · balance ${n(err.balance)}`))}</small><b>${esc(tr(`잔액 ${n(err.shortBy)} bum 부족`, `${n(err.shortBy)} bum short`))}</b></div>
    <p class="ve-note">${esc(tr('외상 탑승은 없어요. 오늘 남은 할 일로 바로 채울 수 있어요.', 'No riding on credit. You can top up with the quests left today.'))}</p>
    ${left.length ? `<b class="ve-t13 ve-gold">${esc(tr('오늘 남은 할 일', 'Quests left today'))}</b>${left.map((q) => `<div class="ve-rowc">${EI.quest(20)}<span class="ve-col"><b>${esc(T(q.title))}</b><small>${n(q.progress.value)} / ${n(q.progress.target)}</small></span><span class="v2-grow"></span>${bumPill(q.reward.bum)}</div>`).join('')}` : ''}
    <p class="ve-note">${esc(tr('걷기만 해도 분당 172 bum이 정산돼요 (하루 60분까지).', 'Walking alone earns 172 bum per minute (up to 60 min a day).'))}</p>
    <div class="v2-hrow"><button type="button" class="v2-btn primary ve-g2" data-ve="quests">${esc(tr('할 일 보기', 'See quests'))}</button><button type="button" class="v2-btn secondary ve-g2" data-ve="close">${esc(tr('걸어서 가기', 'Walk instead'))}</button></div>`);
  p.querySelector('[data-ve="quests"]').addEventListener('click', () => { close(true); onQuests?.(); });
  show(p, { key: '08c' });
}

// ---------- 폰 패널 (07 교통카드 · 10a 택시) — 게임 폰 옆에 뜨는 v2 폰 화면
const phone = (inner, key) => {
  const t = new Date(); const hh = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  const p = el('div', 've-phone', `<div class="ve-phone-scr"><div class="ve-phone-st"><b>${hh}</b><span>Bumpinto</span></div>${inner}</div>`);
  return show(p, { key });
};
const backHead = (t) => `<div class="v2-hrow ve-bh"><button type="button" class="ve-back" data-ve="close" aria-label="${esc(tr('닫기', 'Close'))}">‹</button>${head(t, { size: 18 })}${mockTag()}</div>`;

export async function openWallet({ link } = {}) {
  const [b, s, led, mode] = await Promise.all([econ.getBalance(), econ.getWalletSummary(), econ.getLedger({ limit: 12 }), econ.getEconMode()]);
  const mx = Math.max(1, s.weekEarned, s.weekSpent);
  const icon = (e) => (e.kind === 'fare' || e.kind === 'purchase' ? EI.card(20) : e.kind === 'board' ? EI.board(20) : EI.coin(20));
  const KIND = { board: ['게시판 글 보상', 'Board post reward'], move: ['이동 보상', 'Travel reward'], ach: ['업적 보너스', 'Achievement bonus'], refund: ['반환', 'Refund'] };
  const title = (e) => T(e.title) || (KIND[e.kind] ? tr(...KIND[e.kind]) : e.kind);
  const inner = `${backHead(tr('교통카드 · 지갑', 'Transit card · Wallet'))}
    <div class="ve-tcard"><div class="v2-hrow">${EI.card(20)}<b>${esc(tr('범프 교통카드', 'Bump transit card'))}</b><span class="v2-grow"></span>${b.guest ? tag(tr('게스트', 'Guest'), '#9eb4c6') : tag(tr('계정 연결됨', 'Account linked'), '#20c997')}</div><span class="ve-stripe"></span>
      <small>${esc(tr('잔액', 'Balance'))}</small><div class="v2-hrow">${EI.coin(28)}<b class="ve-t28 ve-gold">${n(b.total)} bum</b></div>
      <small>${esc(tr(`무료 ${n(b.free)} · 유료 ${n(b.paid)} · 외상 없음`, `Free ${n(b.free)} · Paid ${n(b.paid)} · No credit`))}</small>
      ${mode.transitPaid ? '' : `<div class="v2-hrow">${freeBadge()}<small>${esc(tr('베타 기간 버스·지하철·택시 요금 0', 'Bus, subway and taxi fares are 0 during the beta'))}</small></div>`}</div>
    ${b.guest ? `<div class="ve-pbox"><b>${esc(tr('게스트는 지갑이 없어요', 'Guests have no wallet'))}</b><button type="button" class="v2-btn sm primary v2-full" data-ve="link">${esc(tr('구글 계정 연동하고 bum 받기', 'Link Google account to earn bum'))}</button></div>` : `
    <div class="ve-pbox"><b>${esc(tr('이번 주', 'This week'))}</b>
      <div class="v2-hrow"><small>${esc(tr('번 돈', 'Earned'))}</small><span class="v2-grow"></span><b class="ve-green">${sgn(s.weekEarned)}</b></div>${bar(s.weekEarned, mx, { w: 340, h: 6, cls: 'green ve-wide' })}
      <div class="v2-hrow"><small>${esc(tr('쓴 돈 (교통)', 'Spent (transit)'))}</small><span class="v2-grow"></span><b class="ve-red">${sgn(-s.weekSpent)}</b></div>${bar(s.weekSpent, mx, { w: 340, h: 6, cls: 'red ve-wide' })}
      <small>${esc(tr(`보통 플레이어 하루 평균: 수입 ${n(s.avgDailyIncome)} · 교통비 ${n(s.avgDailyTransit)}`, `Typical player per day: income ${n(s.avgDailyIncome)} · transit ${n(s.avgDailyTransit)}`))}</small></div>
    <div class="ve-pbox ve-led"><b>${esc(tr('최근 내역', 'Recent'))}</b>${led.map((e) => `<div class="ve-lrow">${icon(e)}<span class="ve-col"><b>${esc(title(e))}</b>${e.sub ? `<small>${esc(T(e.sub))}</small>` : ''}</span>${e.kind === 'board' ? tag(tr('게시판', 'Board'), '#ec5f9a') : ''}<span class="v2-grow"></span><b class="${e.delta < 0 ? 've-red' : 've-green2'}">${sgn(e.delta)}</b></div>`).join('') || `<small>${esc(tr('아직 내역이 없어요', 'No history yet'))}</small>`}</div>`}`;
  const w = phone(inner, '07');
  w.addEventListener('click', (e) => { if (e.target.closest('[data-ve="link"]')) link?.(); });
}

// ---------- 10a 택시 앱 (목적지 · 옵션 · 홀드)
export async function openTaxiApp({ dest = { ko: '판교역', en: 'Pangyo Stn.' }, meters = 5000, onCall } = {}) {
  let code = 'taxi.drive';
  const q = await econ.quoteFare({ mode: 'taxi', code, meters });
  const night = (await econ.quoteFare({ mode: 'taxi', code, meters, night: true })).listAmount;
  const sub = { 'taxi.drive': tr('창밖을 보며 이동', 'Ride and watch the view'), 'taxi.fast': tr('같은 요금', 'Same fare'), 'taxi.instant': tr('요금 ×1.5', 'Fare ×1.5') };
  const w = phone('', '10a');
  const scr = w.querySelector('.ve-phone-scr');
  const draw = () => {
    const opt = q.options.find((o) => o.code === code);
    const ok = q.free || (q.balance >= opt.amount);
    scr.innerHTML = `${scr.querySelector('.ve-phone-st').outerHTML}${backHead(tr('택시', 'Taxi'))}<b class="ve-t22">${esc(tr('어디로 갈까요?', 'Where to?'))}</b>
      <div class="ve-pbox"><small>${esc(tr('목적지 (예시)', 'Destination (example)'))}</small><b>${esc(T(dest))} · ${esc(tr(`예상 ${(meters / 1000).toFixed(1)} km`, `est. ${(meters / 1000).toFixed(1)} km`))}</b></div>
      ${q.options.map((o) => `<button type="button" class="ve-opt${o.code === code ? ' on' : ''}" data-opt="${o.code}"><span class="ve-radio"></span><span class="ve-col"><b>${esc(T(o.label))}</b><small>${esc(sub[o.code])}</small></span><span class="v2-grow"></span>${q.free ? `<s>${n(o.listAmount)}</s><b class="ve-gold">0</b>` : `<b>${n(o.amount)}</b>`}</button>`).join('')}
      <div class="ve-pbox"><small>${esc(tr('기본 4,800 (1.6 km) + 131 m마다 100', 'Base 4,800 (1.6 km) + 100 per 131 m'))}</small><b class="ve-t12">${esc(tr(`심야 23–04시 +30% → 이 거리면 ${n(night)}`, `Night 23–04 +30% → ${n(night)} for this trip`))}</b></div>
      ${q.free ? `<div class="ve-chkline ok">${freeBadge()}<span>${esc(tr(`베타 기간 무료 · 정가 ${n(opt.listAmount)}, 홀드·차감 없음`, `Free during the beta · list ${n(opt.listAmount)}, no hold or charge`))}</span></div>`
        : `<div class="ve-chkline ${ok ? 'ok' : 'bad'}">${ok ? EI.check(14) : '!'}<span>${esc(ok ? tr(`잔액 ${n(q.balance)} · 탑승 시 예상 요금 ${n(opt.amount)} 홀드`, `Balance ${n(q.balance)} · ${n(opt.amount)} held on boarding`) : tr(`잔액 ${n(q.balance)} · ${n(opt.amount - q.balance)} bum 부족`, `Balance ${n(q.balance)} · ${n(opt.amount - q.balance)} bum short`))}</span></div>`}
      <button type="button" class="v2-btn primary v2-full" data-ve="call"${ok ? '' : ' disabled'}>${esc(tr('호출하기', 'Call taxi'))}</button>`;
  };
  draw();
  scr.addEventListener('click', async (e) => {
    const o = e.target.closest('[data-opt]'); if (o) { code = o.dataset.opt; draw(); return; }
    if (e.target.closest('[data-ve="call"]')) {
      const h = await econ.holdTaxi({ code, estimateMeters: meters, rideId: `demo-taxi-${Date.now()}` });
      close(true);
      if (!h.ok) return openBlock({ mode: 'taxi', err: h.error });
      onCall?.(h.data);
    }
  });
}

// ---------- 10b 택시 정산
export function openSettle(st, { dest = { ko: '판교역', en: 'Pangyo Stn.' }, example = true, onWallet } = {}) {
  st = { ...st, reward: st.reward || [], balance: st.balance || { total: 0 } };
  if (st.receiptId) shownReceipts.add(st.receiptId);
  for (const e of st.reward || []) shownInPay.set(e.questId, Date.now());
  const p = panel('ve-settle', `<div class="v2-hrow">${tag(tr('택시', 'Taxi'), '#ffe169')}<b class="ve-t20">${esc(tr(`도착했어요 · ${T(dest)}`, `Arrived · ${T(dest)}`))}${example ? esc(tr(' (예시)', ' (example)')) : ''}</b>${mockTag()}<span class="v2-grow"></span>${closeBtn()}</div>
    <div class="ve-kv"><span>${esc(tr('실제 거리', 'Actual distance'))}</span><b>${(st.distanceM / 1000).toFixed(1)} km</b></div>
    <div class="ve-kv"><span>${esc(tr('예상 요금 (탑승 시 홀드)', 'Estimate (held on boarding)'))}</span><b>${st.free ? '0' : n(st.held)}</b></div>
    <div class="ve-kv"><span>${esc(tr('실제 요금', 'Actual fare'))}</span><b>${st.free ? `<s>${n(st.listAmount)}</s> 0` : n(st.charged)}</b></div>
    <div class="ve-kv"><span>${esc(tr('반환', 'Returned'))}</span><b class="ve-green">${st.free ? '0' : sgn(st.refunded)}</b></div>
    <div class="ve-kv big">${EI.card(20)}<span>${esc(tr('결제', 'Paid'))}</span><span class="v2-grow"></span>${st.free ? `<b class="ve-amt-big free">0 bum</b>${freeBadge()}` : `<b class="ve-amt-big">${sgn(-st.charged)} bum</b>`}</div>
    <div class="v2-hrow">${bumPill(st.balance.total, { sign: false, cls: 'lg' })}${karmaPill({ axis: 'transit', points: 5 })}${st.reward.map((e) => tag(tr(`${T(e.title)} 달성 +${n(e.amount)}`, `${T(e.title)} +${n(e.amount)}`), '#20c997')).join('')}</div>
    <p class="ve-note">${esc(tr('실제 요금은 예상 요금보다 높아지지 않아요. 심야(23–04시)엔 +30%.', 'The actual fare never exceeds the estimate. Night (23–04) +30%.'))}</p>
    <button type="button" class="v2-btn secondary v2-full" data-ve="wallet">${esc(tr('교통카드에서 보기', 'View on transit card'))}</button>`);
  p.querySelector('[data-ve="wallet"]').addEventListener('click', () => { close(true); onWallet?.(); });
  show(p, { key: '10b' });
}

/** 택시 홀드 알림 (실제 게임 택시 출발 시) */
export function holdToast(h) {
  const node = el('div', 'v2-panel ve-mini', `${EI.card(20)}<b>${esc(h.free ? tr(`택시 출발 · 정가 ${n(h.listAmount)}`, `Taxi departing · list ${n(h.listAmount)}`) : tr(`택시 출발 · 예상 요금 ${n(h.amount)} 홀드`, `Taxi departing · ${n(h.amount)} held`))}</b>${h.free ? freeBadge() : ''}${mockTag()}`);
  toastLayer().appendChild(node);
  setTimeout(() => node.remove(), 3000);
}
