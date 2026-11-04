// [ui-v2] 게임 UI v2 (Figma iAyaJYqkedi7wtbY8Zj1NW · 13-2 게임 UI 키트, 36-2 입장 흐름 v3) 스위치.
//   ?ui=v2 일 때만 켠다. 주소에 없으면 지금 화면 그대로 (기억하지 않음 — 기본값은 나중에 정함).
//   PC 전용: 핸드폰·태블릿(모바일은 feat/mobile 이 body.mobile 로 따로 처리)에서는 켜지 않는다.
import { isHandheld } from '../pcOnly.js';

export function isUiV2(search = typeof location !== 'undefined' ? location.search : '') {
  try {
    if (new URLSearchParams(search).get('ui') !== 'v2') return false;
    if (typeof document !== 'undefined' && document.body?.classList.contains('mobile')) return false;
    return !isHandheld();
  } catch {
    return false;
  }
}
