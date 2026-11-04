// [econ-ui] 07 교통카드 · 지갑 — 별도 화면이 아니라 게임 폰의 기존 '교통카드' 앱(src/ride/index.js addApp 'wallet')에 내용을 덧붙인다.
//   window.__bwHandset.setAppDecorator(handset.js) 로만 붙는다: ?ui=v2(PC) 에서만 등록되고, 기본 UI·모바일(body.mobile)은 기존 앱 그대로.
//   기존 앱의 모양(그라데이션 카드 .tcard · .hint · .ride-rec 줄)을 그대로 쓰고, bum 잔액 · 이번 주 · 원장 내역을 탑승 기록과 한 목록으로 합친다.
import { econ } from '../econ/index.js';
import { mergeHistory, fareMode } from './walletMerge.js';
import { n, sgn, T, tr, esc, EI, mockTag, freeBadge } from './kit.js';

const ID = 'wallet';
// 게임 폰(handset.js)이 내 준 연결 지점 — import 하지 않아 기본 번들 청크가 그대로다
const H = () => (typeof window !== 'undefined' ? window.__bwHandset : null);
const refreshHandsetApp = (id) => H()?.refreshApp(id);
const handsetAppView = () => H()?.view || '';
// 탑승 기록: ride/rideLog.js 와 같은 localStorage 키를 읽기만 한다 (쓰기는 ride/index.js)
const RIDE_LOG_KEY = 'bw.rideLog.v1';
const readRides = () => { try { const a = JSON.parse(localStorage.getItem(RIDE_LOG_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const rideLog = {
  list: ({ limit = 30 } = {}) => readRides().slice(-limit).reverse(),
  totals: () => { const l = readRides(); return { rides: l.length, distM: l.reduce((a, e) => a + (e.distM || 0), 0) }; },
};
let registered = false;
let snap = null, snapAt = 0, loading = null, tab = 'all', linkFn = null;

const visible = () => handsetAppView() === 'x:' + ID;
async function load() {
  if (loading) return loading;
  loading = (async () => {
    const [ses, b, s, led, mode] = await Promise.all([econ.getSession(), econ.getBalance(), econ.getWalletSummary(), econ.getLedger({ limit: 30 }), econ.getEconMode()]);
    snap = { guest: !!(ses?.isGuest ?? b.guest), b, s, led: Array.isArray(led) ? led : [], mode };
    snapAt = Date.now();
  })().catch(() => {}).finally(() => { loading = null; });
  await loading;
  refreshHandsetApp(ID);
}

const fmtDur = (s) => (s >= 60 ? `${Math.floor(s / 60)}${tr('분 ', 'm ')}${Math.round(s % 60)}${tr('초', 's')}` : `${Math.round(s)}${tr('초', 's')}`);
const fmtTime = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const MODE_IC = { bus: '🚌', taxi: '🚕', subway: '🚇' };
const KIND_IC = { quest: '✅', ach: '🏅', welcome: '🎁', beta: '🎁', board: '📝', move: '🚶', purchase: '🛒', refund: '↩️' };
const KIND_T = { board: ['동네 글 보상', 'Board post reward'], move: ['이동 보상', 'Travel reward'], ach: ['업적 보너스', 'Achievement bonus'], refund: ['반환', 'Refund'] };
const RIDE_KINDS = new Set(['fare', 'refund']);
const amt = (v) => `<span class="amt ${v > 0 ? 'v2w-plus' : v < 0 ? 'v2w-minus' : ''}">${sgn(v)} bum</span>`;
// 무료 탑승 요금 줄(delta 0, free:true)은 '무료 0 bum'
const fareAmt = (f) => (f?.free || (f && f.delta === 0) ? `<span class="amt v2w-fz"><i>${esc(tr('무료', 'Free'))}</i>0 bum</span>` : amt(f ? f.delta : 0));

function rowHtml(x, en, guest) {
  if (x.t === 'ride') {
    const e = x.r;
    return `<div class="ride-rec"${x.fare ? ` data-fare="${esc(x.fare.id)}" data-by="${x.by}"` : ''}><span class="ic">${e.mode === 'taxi' ? '🚕' : '🚌'}</span><div><b>${esc(e.mode === 'taxi' ? (en ? 'Taxi' : '택시') : e.route)}</b> ${esc(e.from)} → ${esc(e.to)}<small>${(e.distM / 1000).toFixed(2)} km · ${fmtDur(e.durSec)} · ${fmtTime(e.at)}${e.speed && e.speed !== 'normal' ? ` · ${e.speed === 'fast' ? '⏩' : '⚡'}` : ''}</small></div>${guest ? `<span class="amt">${e.fare ? e.fare.amount : 0}${en ? ' KRW' : '원'}</span>` : fareAmt(x.fare)}</div>`; // 게스트는 기존 줄 그대로
  }
  const e = x.e, ic = e.kind === 'fare' ? MODE_IC[fareMode(e)] : KIND_IC[e.kind] || '💰';
  const title = T(e.title) || (KIND_T[e.kind] ? tr(...KIND_T[e.kind]) : e.kind);
  return `<div class="ride-rec v2w-led" data-kind="${esc(e.kind)}"><span class="ic">${ic}</span><div><b>${esc(title)}</b><small>${e.sub ? `${esc(T(e.sub))} · ` : ''}${fmtTime(e.at)}</small></div>${e.kind === 'fare' ? fareAmt(e) : amt(e.delta)}</div>`;
}

function render(en, base) {
  if (document.body.classList.contains('mobile') || !snap) return base; // 첫 그림은 기존 앱 → 곧 경제 내용으로 다시 그림
  const { guest, b, s, led, mode } = snap;
  const free = !mode?.transitPaid;
  const rides = rideLog.list({ limit: 30 }), tot = rideLog.totals();
  const cardNo = (base.match(/<div class="no">([^<]*)<\/div>/) || [])[1] || '';
  const freeLine = free ? `<div class="v2w-free">${freeBadge('v2w-badge')}<span>${esc(tr('베타 기간 버스·지하철·택시 요금 0', 'Bus, subway and taxi fares are 0 during the beta'))}</span></div>` : '';
  const card = guest
    ? `<div class="tcard v2w-card"><div class="nm">${esc(tr('무료 체험 카드', 'Free Trial Card'))} <span class="v2w-st">${esc(tr('게스트', 'Guest'))}</span></div>
        <button type="button" class="v2w-link" data-wv="link">${EI.coin(16)}${esc(tr('구글 계정 연동하고 bum 받기', 'Link Google account to earn bum'))}</button>
        ${freeLine || `<div class="un">${esc(tr('무제한 무료 탑승', 'Unlimited free rides'))}</div>`}<div class="no">${cardNo}</div></div>`
    : `<div class="tcard v2w-card"><div class="nm">${esc(tr('범프 교통카드', 'Bump transit card'))}</div>
        <div class="bal">${esc(tr('잔액', 'Balance'))} <span class="v2w-coin">${EI.coin(16)}</span><b>${n(b.total)} bum</b><span class="v2w-st on">${esc(tr('계정 연결됨', 'Account linked'))}</span></div>
        ${free ? freeLine : `<div class="un">${esc(tr(`무료 ${n(b.free)} · 유료 ${n(b.paid)} · 외상 없음`, `Free ${n(b.free)} · Paid ${n(b.paid)} · No credit`))}</div>`}
        <div class="no">${cardNo}</div></div>`;
  const week = guest ? '' : `<div class="v2w-week"><b>${esc(tr('이번 주', 'This week'))}</b>
      <span>${esc(tr('번 돈', 'Earned'))} <b class="v2w-plus">${sgn(s.weekEarned)}</b></span><span>${esc(tr('쓴 돈(교통)', 'Spent (transit)'))} <b class="v2w-minus">${sgn(-s.weekSpent)}</b></span>
      <small>${esc(tr(`보통 플레이어 하루 평균: 수입 ${n(s.avgDailyIncome)} · 교통비 ${n(s.avgDailyTransit)}`, `Typical player per day: income ${n(s.avgDailyIncome)} · transit ${n(s.avgDailyTransit)}`))}</small></div>`;
  let list = mergeHistory(rides, guest ? [] : led);
  if (!guest && tab === 'ride') list = list.filter((x) => x.t === 'ride' || RIDE_KINDS.has(x.e.kind));
  if (!guest && tab === 'reward') list = list.filter((x) => x.t === 'led' && x.e.delta > 0 && !RIDE_KINDS.has(x.e.kind));
  const tabs = guest ? '' : `<div class="v2w-tabs">${[['all', '전체', 'All'], ['ride', '탑승', 'Rides'], ['reward', '보상', 'Rewards']].map(([k, ko, enl]) => `<button type="button" data-wtab="${k}" class="${tab === k ? 'on' : ''}">${esc(tr(ko, enl))}</button>`).join('')}</div>`;
  const empty = tab === 'reward' ? tr('아직 받은 보상이 없어요.', 'No rewards yet.') : tr('아직 탑승 기록이 없어요. 정류장에서 E로 버스, Y로 택시.', 'No rides yet. Board a bus with E at a stop, or press Y for a taxi.');
  return `${card}${week}
    <p class="hint v2w-sum">${en ? `${tot.rides} rides · ${(tot.distM / 1000).toFixed(1)} km` : `탑승 ${tot.rides}회 · ${(tot.distM / 1000).toFixed(1)} km`} ${mockTag('mini')}</p>${tabs}
    <div class="ride-recs">${list.map((x) => rowHtml(x, en, guest)).join('') || `<p class="hint">${esc(empty)}</p>`}</div>`;
}

function mounted(pane) {
  if (!pane || pane.dataset.v2w) return;
  pane.dataset.v2w = '1';
  pane.addEventListener('click', (e) => {
    const t = e.target.closest('[data-wtab]'); if (t) { tab = t.dataset.wtab; refreshHandsetApp(ID); return; }
    if (e.target.closest('[data-wv="link"]')) linkFn?.();
  });
  if (!snap || Date.now() - snapAt > 3000) load();
}

/** 경제 UI mount 시 1번. 기존 교통카드 앱에 장식을 등록하고, 잔액·내역이 바뀌면 앱이 열려 있을 때만 다시 읽는다. */
export function mountWalletApp({ link } = {}) {
  if (document.body.classList.contains('mobile')) return;
  linkFn = link;
  let tries = 0;
  const reg = () => { if (H()) { H().setAppDecorator(ID, { render, mounted }); registered = true; } else if (++tries < 240) setTimeout(reg, 500); }; // 폰은 입장 뒤에 생긴다
  reg();
  let t = 0;
  const soon = () => { clearTimeout(t); t = setTimeout(() => { if (visible()) load(); else snapAt = 0; }, 60); };
  for (const ev of ['balance', 'session', 'mode', 'payment']) econ.on(ev, soon);
  load();
}

/** 07 열기: HUD 잔액 칩 · 정산 카드 '교통카드에서 보기' · 데모 바 → 게임 폰의 교통카드 앱 */
export async function openWalletApp({ tab: t = 'all' } = {}) {
  tab = t;
  if (!registered && H()) { H().setAppDecorator(ID, { render, mounted }); registered = true; }
  await load();
  H()?.openApp(ID);
}
