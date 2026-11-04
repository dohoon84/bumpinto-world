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
