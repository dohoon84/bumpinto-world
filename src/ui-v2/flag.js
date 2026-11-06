// [ui-v2] 게임 UI v2 (Figma iAyaJYqkedi7wtbY8Zj1NW · 13-2 게임 UI 키트, 36-2 입장 흐름 v3) 스위치.
//   [ui-v2-default] 기본 켜짐(주소에 아무것도 없어도 v2). 예전 화면은 ?ui=v1 (이 탭에서만 기억 — 월드 이동 새로고침에도 유지, ?ui=v2 로 해제).
//   PC 전용: 핸드폰·태블릿(모바일은 feat/mobile 이 body.mobile 로 따로 처리)에서는 켜지 않는다.
import { isHandheld } from '../pcOnly.js';

const OPT_OUT = new Set(['v1', 'old', 'legacy', '0', 'off']);
const KEY = 'bw.ui.v1'; // sessionStorage (탭 단위). localStorage 에 남은 예전 선택은 읽지 않는다 → 기존 사용자도 v2

/** 이 주소에서 v2 를 쓸지 (PC·모바일 공통 플래그). ?ui=v1 만 끈다 */
export function uiV2Wanted(search = typeof location !== 'undefined' ? location.search : '') {
  try {
    const q = (new URLSearchParams(search).get('ui') || '').toLowerCase();
    let ss = null; try { ss = sessionStorage; } catch { /* 막힘 */ }
    if (OPT_OUT.has(q)) { try { ss?.setItem(KEY, '1'); } catch { /* noop */ } return false; }
    if (q === 'v2') { try { ss?.removeItem(KEY); } catch { /* noop */ } return true; }
    try { if (ss?.getItem(KEY) === '1') return false; } catch { /* noop */ }
    return true;
  } catch {
    return true;
  }
}

export function isUiV2(search = typeof location !== 'undefined' ? location.search : '') {
  try {
    if (!uiV2Wanted(search)) return false;
    if (typeof document !== 'undefined' && document.body?.classList.contains('mobile')) return false;
    return !isHandheld();
  } catch {
    return false;
  }
}

// [hud-v3] 데스크톱 상단 HUD v3 (A안: 왼쪽 플레이어 카드 + 오른쪽 액션 바).
//   [hud-v3-default] 기본 켜짐(주소에 아무것도 없어도 v3). 예전 HUD 는 ?hud=off|v2|0|old|legacy (이 탭에서만 기억, ?hud=v3 로 해제).
//   PC(ui-v2) 전용 — 모바일(body.mobile)·?ui=v1 에서는 절대 켜지지 않는다(isHudV3 → isUiV2).
const HUD_OFF = new Set(['off', 'v2', '0', 'old', 'legacy', 'v1']);
const HUD_KEY = 'bw.hud.v3.off'; // sessionStorage: '1' = 이 탭에서 v3 끄기. 예전 bw.hud.v3(opt-in) 은 읽지 않음 → 기본 on
export function hudV3Wanted(search = typeof location !== 'undefined' ? location.search : '') {
  try {
    const q = (new URLSearchParams(search).get('hud') || '').toLowerCase();
    let ss = null; try { ss = sessionStorage; } catch { /* 막힘 */ }
    if (HUD_OFF.has(q)) { try { ss?.setItem(HUD_KEY, '1'); } catch { /* noop */ } return false; }
    if (q === 'v3' || q === 'on' || q === '1') { try { ss?.removeItem(HUD_KEY); } catch { /* noop */ } return true; }
    if (q) { try { ss?.setItem(HUD_KEY, '1'); } catch { /* noop */ } return false; } // 알 수 없는 값 → 끔
    try { if (ss?.getItem(HUD_KEY) === '1') return false; } catch { /* noop */ }
    return true;
  } catch {
    return true;
  }
}
export function isHudV3(search = typeof location !== 'undefined' ? location.search : '') {
  return isUiV2(search) && hudV3Wanted(search);
}
