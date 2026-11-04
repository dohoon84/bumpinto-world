// [ui-v2] 게임 UI v2 진입점. game.js 가 ?ui=v2 일 때만 동적으로 불러온다(없으면 이 폴더는 번들에서도 따로 떨어진 청크).
//   흐름: 01 시작화면 → 02 월드 선택(지구본) → 03 역 선택 → 04 캐릭터 입장(그 역 배경) → 05 입장 로딩 → 06 HUD
//   스타일은 모두 body.ui-v2:not(.mobile) 아래로만 건다(모바일 PR #25 의 body.mobile 과 겹치지 않게).
import './ui-v2.css';
import { setGateDecorator } from '../worldGate.js';
import { makeGateDecorator, setGateView } from './gate.js';
import { openStart } from './start.js';
import { mountEntryWatch, setEntryStation, beforeLobby as entryBeforeLobby, peekFrame as entryPeekFrame } from './entry.js';
import { mountHudV2 } from './hud.js';
import { saveLastStation, readLastStation } from './data.js';
import { startResumeSaver, readResume, whoOf } from './resume.js';

export { registerGoogleSignIn } from './google.js'; // #21 연결 지점
export { coinFly } from './kit.js';

let flow = null;

/**
 * game.js 의 '지구본 열기' 대신 호출.
 * @param {{ region: object, at?: string|null, openGate: () => void, enter: (regionId: string, opts?: { at?: string }) => void }} o
 */
export function openEntryFlow(o) {
  flow = o;
  setEntryStation(o.region.id, o.at || null);
  const showStart = () => openStart({
    region: o.region,
    onGuest: () => o.openGate(),
    onContinue: (last, ses) => enterResume(o, last, ses),
    onAccount: (d, ses) => enterResume(o, d, ses), // 로그인된 계정: 게이트·캐릭터/PIN 고르기 없이 바로 그 역 입장 카드 (+그만둔 자리)
    defaultAt: o.at || null,
  });
  setGateDecorator(makeGateDecorator({ onBackToStart: showStart }));
  showStart();
}

/** '계속하기'·'이어하기': 그 역 입장 카드로. 이 월드에서 그만둔 자리(7일 이내, 그 뒤에 다른 역을 고르지 않음)가 있으면 입장 때 그 자리로 */
function enterResume(o, d, ses) {
  const last = readLastStation();
  const place = d.region === o.region.id ? readResume(whoOf(ses), o.region.id, { since: last?.t || 0 }) : null;
  o.enter(d.region, d.at || place ? { ...(d.at ? { at: d.at } : {}), ...(place ? { place } : {}) } : undefined);
}

/** handleGateEnter 가 부른다: 마지막 역 저장 + 입장 카드/로딩의 역 이름 */
export function noteEnter(regionId, at) {
  saveLastStation(regionId, at);
  setEntryStation(regionId, at);
  setGateView(at ? 'station' : 'world');
}

export const beforeLobby = entryBeforeLobby;
export const peekFrame = entryPeekFrame;

export function initUiV2() {
  document.body.classList.add('ui-v2');
  mountEntryWatch();
  mountHudV2();
  // 그만둔 자리 저장 (계정/게스트 · 월드별). 계정은 econ 세션을 따라간다
  let ses = null;
  import('./econ/index.js').then(({ econ }) => { econ.getSession().then((x) => { ses = x; }).catch(() => {}); econ.on('session', (x) => { ses = x; }); }).catch(() => {});
  startResumeSaver(new URLSearchParams(location.search).get('region') || 'jeongja', () => whoOf(ses));
  // [econ-ui] 경제 UI (bum 잔액·할 일·교통 결제·상점) — PC 전용, 별도 청크
  if (!document.body.classList.contains('mobile')) import('./econ-ui/index.js').then((m) => m.mountEconUi()).catch(() => {});
  if (!flow) setGateDecorator(makeGateDecorator({ onBackToStart: () => location.reload() }));
}
initUiV2();
