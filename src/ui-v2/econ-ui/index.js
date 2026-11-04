// [econ-ui] 게임 안 경제 UI (?ui=v2, PC 전용). ui-v2/index.js 가 동적으로 불러온다 → ?ui=v2 가 아니면 번들에서도 따로 떨어진 청크.
//   데이터는 econ(=src/ui-v2/econ/index.js, 지금은 로컬 mock)만 쓴다. 서버 원장으로 바뀌어도 이 폴더는 그대로.
//   게임 쪽 교통 트리거: window 'bw:transit' 이벤트 (src/econHook.js · 버스 탑승 / 지하철 개찰구 태그 / 택시 출발·도착).
//   dev: ?ui=v2&demo=econ → 하단 데모 막대(` 키로 접기) + window.__bwEconDemo.open('<프레임 코드>')
import './econ-ui.css';
import { econ } from '../econ/index.js';
import { requestGoogleSignIn } from '../google.js';
import { onLangChange } from '../../i18n.js';
import { mountEconHud, refresh, render } from './hud.js';
import { openWelcome, openChipTip, openQuests, pushReward, openKarma, openShop, openGoogleWait, openMigrate } from './panels.js';
import { payAndShow, openWallet, openTaxiApp, openSettle, holdToast, openBoard, openGate } from './transit.js';
import { close, openKey } from './layer.js';

let suppressRewards = 0;
let busy = false;

/** 게스트 → 구글 연동. 핸들러(#21)가 있으면 실제 GIS, 없으면 대기/준비 중 카드(+ demo 에서는 예시 계정). */
export async function link() {
  if (busy) return; busy = true;
  try {
    const demo = isDemo();
    openGoogleWait({ notReady: false, onDemoAccount: demo ? () => afterSignIn({ name: '예시 계정' }) : null });
    const r = await requestGoogleSignIn();
    if (r.ok) { await afterSignIn(r.account || {}); return; }
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
  const w = await econ.getWelcome();
  if (!w.eligible) { refresh(); return; }
  openMigrate({ onContinue: () => welcome(), onLater: () => welcome() });
}
function welcome() { suppressRewards = Date.now() + 8000; openWelcome(); }

export const OPEN = {
  '03': () => close(), '03g': () => close(),
  '01a': () => link(),
  '01b': () => openMigrate({ onContinue: welcome, onLater: welcome }),
  '02a': () => welcome(),
  '02b': () => openChipTip(),
  '04a': () => openQuests('daily', { link }), '04b': () => openQuests('weekly', { link }), '04c': () => openQuests('monthly', { link }),
  '06': () => openKarma({ link }),
  '07': () => openWallet({ link }),
  '11': () => openShop({ link }),
  '08a': () => openBoard(),
  '09a': () => openGate(),
  '10a': () => openTaxiApp({ onCall: (h) => { holdToast(h); setTimeout(async () => { const s = await econ.settleTaxi({ holdId: h.holdId, actualMeters: 4600 }); if (s.ok) openSettle(s.data, { onWallet: OPEN['07'] }); }, 1200); } }),
};
export const open = (code) => OPEN[code]?.();
export const isDemo = () => new URLSearchParams(location.search).get('demo') === 'econ';

// ---------- 게임 교통 훅 (bw:transit) → 결제 화면
const taxiHolds = new Map();
let lastSubTap = 0;
async function onTransit(e) {
  const d = e.detail || {};
  try {
    if (d.mode === 'bus' && d.phase === 'board') {
      await payAndShow({ mode: 'bus', code: d.code || 'bus.city', rideId: d.rideId || `bus-${Date.now()}`, where: d.where || '' });
    } else if (d.mode === 'subway' && d.phase === 'tap') {
      if (Date.now() - lastSubTap < 60000) return; // 개찰구 하나 통과 = 1회 (안쪽 다시 태그 무시)
      lastSubTap = Date.now();
      await payAndShow({ mode: 'subway', code: 'subway.base', rideId: `sub-${Math.floor(Date.now() / 60000)}`, where: d.where || '' });
    } else if (d.mode === 'taxi' && d.phase === 'depart') {
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

export function mountEconUi() {
  if (document.body.classList.contains('mobile')) return null; // PC 전용
  document.body.classList.add('v2-econ');
  mountEconHud({ link, open });
  let t = 0;
  const soon = () => { clearTimeout(t); t = setTimeout(refresh, 30); };
  for (const ev of ['balance', 'quest', 'travel', 'session', 'mode']) econ.on(ev, soon);
  econ.on('reward', (ev) => { if (ev.kind !== 'quest' && ev.kind !== 'achievement') return; if (Date.now() < suppressRewards && ev.questId === 'D-LOGIN') return; if (Date.now() < suppressRewards && ev.kind !== 'quest') return; pushReward(ev); });
  onLangChange(() => render());
  addEventListener('bw:transit', onTransit);
  trackWalk();
  refresh();
  if (isDemo()) import('./demo.js').then((m) => m.mountDemo({ open, link, setSuppress: (ms) => { suppressRewards = Date.now() + ms; } }));
  return { open, link };
}
