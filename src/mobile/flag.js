// [mobile] 모바일 모드 플래그.
//   핸드폰·태블릿(isHandheld)이면 자동으로 켜고, ?mobile=1 로 데스크톱에서도 강제로 켠다. ?mobile=0 은 강제로 끈다(기존 PC 전용 안내).
//   지역 이동(?region=) 처럼 페이지를 다시 불러도 유지되도록 sessionStorage 에 기억한다.
import { isHandheld } from '../pcOnly.js';

const KEY = 'bw.mobileMode';
let cached = null;

export function isMobileMode() {
  if (cached != null) return cached;
  let forced = null;
  try {
    const q = new URLSearchParams(location.search).get('mobile');
    if (q === '1' || q === '0') {
      forced = q === '1';
      sessionStorage.setItem(KEY, q);
    } else {
      const s = sessionStorage.getItem(KEY);
      if (s === '1' || s === '0') forced = s === '1';
    }
  } catch { /* 저장소가 막혀 있으면 URL 만 본다 */ }
  cached = forced ?? isHandheld();
  return cached;
}

// ?mobile=0 으로 핸드폰에서 모바일 모드를 끈 경우 (기존 PC 전용 안내 경로)
export function isMobileForcedOff() {
  return !isMobileMode() && isHandheld();
}
