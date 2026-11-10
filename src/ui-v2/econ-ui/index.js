// [econ-ui] 게임 안 경제 UI (?ui=v2, PC 전용). ui-v2/index.js 가 동적으로 불러온다 → ?ui=v2 가 아니면 번들에서도 따로 떨어진 청크.
//   데이터는 econ(=src/ui-v2/econ/index.js, 지금은 로컬 mock)만 쓴다. 서버 원장으로 바뀌어도 이 폴더는 그대로.
//   게임 쪽 교통 트리거: window 'bw:transit' 이벤트 (src/econHook.js · 버스 탑승 / 지하철 개찰구 태그 / 택시 출발·도착).
//   dev: ?ui=v2&demo=econ → 하단 데모 막대(` 키로 접기) + window.__bwEconDemo.open('<프레임 코드>')
import './econ-ui.css';
import { econ } from '../econ/index.js';
import { requestGoogleSignIn } from '../google.js';
import { onLangChange } from '../../i18n.js';
import { mountEconHud, refresh, render } from './hud.js';
import { openWelcome, openChipTip, openQuests, prefetchAllQuests, prefetchAllShop, pushReward, openKarma, openShop, openGoogleWait, openMigrate } from './panels.js';
import { shownInPay, shownReceipts, showPay, payAndShow, openTaxiApp, openSettle, holdToast, openBoard, openGate } from './transit.js';
import { claimIfUiFare, resetSubwayFare, takeSubwayTap } from './farePop.js';import { close, openKey } from './layer.js';
import { mountWalletApp, openWalletApp } from './walletApp.js';
import { coinSound } from './coinSound.js';

let suppressRewards = 0;
let welcomeEvAt = 0; // 서버가 연동 순간 자동 지급한 웰컴의 reward 이벤트(sinceAt 따라잡기)를 받은 시각
let busy = false;

/** 게스트 → 구글 연동. 핸들러(#21)가 있으면 실제 GIS, 없으면 대기/준비 중 카드(+ demo 에서는 예시 계정). */
export async function link() {
  if (busy) return; busy = true;
  try {
    const demo = isDemo();
    // 서버는 로그인 순간 웰컴·베타·D-LOGIN 을 자동 지급하고 sinceAt 로 reward 이벤트를 다시 보낸다 → 01b/02a 흐름이 보여 주므로 토스트는 잠시 끔
    suppressRewards = Date.now() + 20000;
    openGoogleWait({ notReady: false, onDemoAccount: demo ? () => afterSignIn({ name: '예시 계정' }) : null });
    const r = await requestGoogleSignIn();
    if (r.ok) { await afterSignIn(r.account || {}); return; }
    suppressRewards = 0;
    if (r.reason === 'not_ready' && openKey() === '01a') openGoogleWait({ notReady: true, onDemoAccount: demo ? () => afterSignIn({ name: '예시 계정' }) : null });
    else if (openKey() === '01a') close(true);
  } finally { busy = false; }
}
/**
 * 로그인 직후: 01b 기기 데이터 연결 → 02a 웰컴 → 02b 잔액 안내.
 * 세션은 원장 클라이언트가 소유한다. mock 은 dev.signIn 으로 흉내, 서버 클라이언트는 GIS 토큰으로 스스로 세션을 갖고 'session' 이벤트를 낸다.
 */
async function afterSignIn(account) {
  close(true);
  if (econ.isMock && econ.dev && (await econ.getSession()).isGuest) econ.dev.signIn({ name: account.name || '예시 계정' });
  suppressRewards = Date.now() + 20000;
  const w = await econ.getWelcome();
  // 웰컴은 구글 연동 때 계정당 1번 자동 지급(서버). eligible = 아직 안 받음(mock 은 02a '받기'로 지급),
  // claimed = 이미 지급 → '이번 연동에서 막 지급된 경우'에만 01b→02a('확인', 연출만). 예전에 받은 계정의 재로그인은 안내 없이 끝.
  const sess = await econ.getSession();
  const key = `bw.uiv2.econ.welcomeShown.${sess.accountId || ''}`;
  let seen = false; try { seen = !econ.isMock && !!localStorage.getItem(key); } catch { /* noop */ }
  const justGranted = w.claimed && w.grants?.length && (econ.isMock || Date.now() - welcomeEvAt < 60000);
  if (seen || !(w.eligible || justGranted)) { suppressRewards = 0; refresh(); return; }
  try { if (!econ.isMock) localStorage.setItem(key, String(Date.now())); } catch { /* noop */ }
  openMigrate({ onContinue: () => welcome(), onLater: () => welcome() });
}
function welcome() { suppressRewards = Math.max(suppressRewards, Date.now() + 8000); openWelcome(); }

export const OPEN = {
  '03': () => close(), '03g': () => close(),
  '01a': () => link(),
  '01b': () => openMigrate({ onContinue: welcome, onLater: welcome }),
  '02a': () => welcome(),
  '02b': () => openChipTip(),
  '04a': () => openQuests('daily', { link }), '04b': () => openQuests('weekly', { link }), '04c': () => openQuests('monthly', { link }),
  '06': () => openKarma({ link }),
  '07': () => { close(true); return openWalletApp(); }, // 별도 화면이 아니라 게임 폰의 기존 '교통카드' 앱
  '11': () => openShop({ link }),
  '08a': () => openBoard(),
  '09a': () => openGate(),
  '10a': () => openTaxiApp({ onCall: (h) => { holdToast(h); setTimeout(async () => { const s = await econ.settleTaxi({ holdId: h.holdId, actualMeters: 4600 }); if (s.ok) openSettle(s.data, { onWallet: OPEN['07'] }); }, 1200); } }),
};
export const open = (code) => OPEN[code]?.();
export const isDemo = () => new URLSearchParams(location.search).get('demo') === 'econ';

// ---------- 게임 교통 훅 (bw:transit) → 결제 화면
const taxiHolds = new Map();
let pendingSettle = null; // 서버 모드: 게임 택시는 출발 때 바로 정산(rideProvider) → 도착 때 10b 로 보여 준다
let taxiRiding = false;
async function onTransit(e) {
  const d = e.detail || {};
  try {
    // 서버 원장 클라이언트(#30)는 ride/fare.js 결제 계층(rideProvider)으로 버스·택시를 직접 결제한다.
    // 여기서 또 결제하면 이중 기록 → 결제는 하지 않고, 'payment' 이벤트(onServerPayment)로 화면만 띄운다.
    if (clientPaysRides() && (d.mode === 'bus' || d.mode === 'taxi')) {
      if (d.mode === 'taxi' && d.phase === 'depart') taxiRiding = true;
      if (d.mode === 'taxi' && d.phase === 'arrive') {
        taxiRiding = false;
        if (pendingSettle) { const st = pendingSettle; pendingSettle = null; openSettle(st, { dest: d.dest || { ko: '목적지', en: 'Destination' }, example: false, onWallet: OPEN['07'] }); }
      }
      return;
    }
    if (d.mode === 'bus' && d.phase === 'board') {
      await payAndShow({ mode: 'bus', code: d.code || 'bus.city', rideId: d.rideId || `bus-${Date.now()}`, where: d.where || '' });
    } else if (d.mode === 'subway' && d.phase === 'leave') {
      resetSubwayFare(); // 역 밖으로 나감 → 다음 승차는 새 탑승
    } else if (d.mode === 'subway' && d.phase === 'tap') {
      // 하차 태그는 승차 요금에 포함. 같은 방문(in-subway)에서 들어온 태그는 rideId 하나로 한 번만.
      const inside = document.body.classList.contains('in-subway');
      const next = takeSubwayTap({ gate: d.gate === 'out' ? 'out' : 'in', inside }, Date.now());
      if (next.action !== 'pay') return;
      await payAndShow({ mode: 'subway', code: 'subway.base', rideId: next.rideId, where: d.where || '' });    } else if (d.mode === 'taxi' && d.phase === 'depart') {
      const h = await econ.holdTaxi({ code: d.code || 'taxi.drive', estimateMeters: Math.round(d.meters || 0), rideId: d.rideId || `taxi-${Date.now()}` });
      if (h.ok) { taxiHolds.set(d.rideId, h.data); holdToast(h.data); }
      else if (h.error.code === 'insufficient_balance') { const { openBlock } = await import('./transit.js'); openBlock({ mode: 'taxi', err: h.error, onQuests: OPEN['04a'] }); }
    } else if (d.mode === 'taxi' && d.phase === 'arrive') {
      const h = taxiHolds.get(d.rideId); if (!h) return;
      taxiHolds.delete(d.rideId);
      const s = await econ.settleTaxi({ holdId: h.holdId, actualMeters: Math.round(d.meters || 0) });
      if (s.ok) openSettle(s.data, { dest: d.dest || { ko: '목적지', en: 'Destination' }, example: false, onWallet: OPEN['07'] });
    }
  } catch { /* 결제 화면 오류는 게임 진행과 무관 */ }
}

/** 버스·택시 게임 탑승을 econ 클라이언트가 직접 결제하나(서버 클라이언트, 또는 mock dev.setServerRides(true)) */
const clientPaysRides = () => !econ.isMock || !!econ.dev?.serverRides?.();
function onServerPayment(p) {
  if (!clientPaysRides() || !p) return;
  // 결제 실패(PaymentFailed, #30 543f195): 게임 탑승에서만 1번 온다. 잔액 부족이면 08c, 어떤 실패든 showPay 로는 보내지 않는다.
  // (UI 가 payFare/holdTaxi 를 직접 부른 경우는 이벤트가 없고 결과로 08c 를 띄우므로 두 번 뜨지 않는다.)
  if (p.ok === false) {
    if (p.status === 'insufficient') import('./transit.js').then(({ openBlock }) => openBlock({ mode: p.mode, code: p.code, err: p.error, onQuests: OPEN['04a'] }));
    return;
  }
  // UI 가 payFare 를 직접 부르는 중이면 그 호출이 화면을 그린다.
  // 영수증은 emit 순간에 찍는다. payFare 가 afterWrite(상태 새로고침)를 끝낸 뒤에야 showPay 가 돌아가서,
  // 300ms 뒤에 한 번 더 그리면 같은 카드가 연달아 두 번 떴다.
  if (claimIfUiFare(p, shownReceipts) === 'claimed') return;
  setTimeout(() => {
    if (p.receiptId && shownReceipts.has(p.receiptId)) return; // 지하철 등 이 화면이 직접 결제해서 이미 띄운 것
    if (p.receiptId) shownReceipts.add(p.receiptId);
    if (p.mode === 'taxi' || 'charged' in p) {
      if (taxiRiding) pendingSettle = p;
      else openSettle(p, { dest: { ko: '목적지', en: 'Destination' }, example: false, onWallet: OPEN['07'] });
    } else showPay({ ...p, reward: p.reward || [] });
  }, 300);
}

// ---------- 이동 인정 (mock 힌트): 1초마다 플레이어가 걸은 거리. 서버는 자체 검증한다.
function trackWalk() {
  let lx = null, lz = null;
  setInterval(async () => {
    const p = window.__jj?.player?.position;
    if (!p || document.hidden || document.body.classList.contains('in-gate') || document.body.classList.contains('in-lobby')) { lx = null; return; }
    if (lx != null && !window.__jj.ride) {
      const d = Math.hypot(p.x - lx, p.z - lz);
      if (d > 0.4 && d < 9) econ.reportActivity({ kind: 'walk', seconds: 1, meters: d });
    }
    lx = p.x; lz = p.z;
  }, 1000);
}

export function mountEconUi({ mobile = false } = {}) {
  // PC 전용. 모바일은 src/mobile/econ/index.js 가 HUD 를 바꿔 끼우고(useAltHud) mobile:true 로 부른다.
  if (document.body.classList.contains('mobile') !== mobile) return null;
  document.body.classList.add(mobile ? 'm-econ' : 'v2-econ');
  mountEconHud({ link, open });
  mountWalletApp({ link, mobile });
  coinSound.get(); // 첫 입력 때 소리 잠금 해제 + 코인 효과음 버퍼 1번 디코드
  let t = 0;
  const soon = () => { clearTimeout(t); t = setTimeout(refresh, 30); };
  for (const ev of ['balance', 'quest', 'travel', 'session', 'mode']) econ.on(ev, soon);
  econ.on('payment', onServerPayment);
  econ.on('reward', (ev) => {
    if (ev?.kind === 'welcome') welcomeEvAt = Date.now();
    if (!ev || !['quest', 'achievement', 'welcome', 'beta', 'board', 'travel'].includes(ev.kind)) return; // board = 게시판 글 보상(하루 1번), travel = 이동 보상(하루 1번, #30 v4)
    if (Date.now() < suppressRewards) return; // 로그인 직후 자동 지급(웰컴·베타·D-LOGIN)·데모 시드 중에는 토스트 없이
    if ((ev.kind === 'welcome' || ev.kind === 'beta') && ['01a', '01b', '02a', '02b'].includes(openKey())) return;
    // 결제 카드(08b·09b·10b)가 같은 보상을 '할 일 달성' 줄로 보여 주면 05a 토스트는 생략
    setTimeout(() => { const t = shownInPay.get(ev.questId); if (t && Date.now() - t < 5000) return; pushReward(ev); }, 400);
  });
  onLangChange(() => render());
  addEventListener('bw:transit', onTransit);
  // 역 밖으로 나가면(in-subway 해제) 개찰구 탑승 id 를 비운다. 하차 태그는 같은 id 로 막혀 있다.
  new MutationObserver(() => { if (!document.body.classList.contains('in-subway')) resetSubwayFare(); })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  trackWalk();
  refresh().then(() => { prefetchAllQuests(); prefetchAllShop(); }).catch(() => { prefetchAllQuests(); prefetchAllShop(); });
  if (isDemo() && econ.dev) import('./demo.js').then((m) => m.mountDemo({ open, link, setSuppress: (ms) => { suppressRewards = Date.now() + ms; } }));
  return { open, link };
}
