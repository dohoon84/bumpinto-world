// [mobile] 전체 화면.
//   Android·데스크톱 Chrome: Fullscreen API (webkit 접두사 포함) → 가능하면 가로 고정(screen.orientation.lock).
//   iPhone·iPad(iOS 의 Safari·Chrome 모두 WebKit): 요소 전체 화면이 없으니 토글을 숨기고 '홈 화면에 추가' 안내 + 웹 앱 매니페스트.
const UA = () => navigator.userAgent || '';

export function isIOS() {
  return /iPhone|iPad|iPod/i.test(UA()) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
}

export function isStandalone() {
  try {
    if (navigator.standalone) return true;
    return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
  } catch { return false; }
}

export function canFullscreen() {
  if (isIOS()) return false;
  const d = document.documentElement;
  if (!d.requestFullscreen && !d.webkitRequestFullscreen) return false;
  const en = document.fullscreenEnabled ?? document.webkitFullscreenEnabled;
  return en !== false;
}

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

// 사용자 탭(클릭 핸들러) 안에서 불러야 한다. 실패해도 조용히 넘어간다.
export function enterFullscreen() {
  if (!canFullscreen() || isFullscreen()) return Promise.resolve(false);
  const d = document.documentElement;
  let p;
  try {
    p = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen();
  } catch { return Promise.resolve(false); }
  return Promise.resolve(p).then(() => {
    try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* 지원 안 함 */ }
    return true;
  }).catch(() => false);
}

export function exitFullscreen() {
  if (!isFullscreen()) return Promise.resolve();
  try {
    return Promise.resolve(document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen?.()).catch(() => {});
  } catch { return Promise.resolve(); }
}

export function toggleFullscreen() {
  return isFullscreen() ? exitFullscreen() : enterFullscreen();
}

export function onFullscreenChange(fn) {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
}

// 모바일 모드에서만 머리에 붙인다 (PC 는 index.html 그대로 → 설치 아이콘 등 PC 동작 변화 없음)
export function installWebAppMeta() {
  const head = document.head;
  const add = (tag, attrs) => {
    const sel = Object.entries(attrs).filter(([k]) => k === 'name' || k === 'rel').map(([k, v]) => `[${k}="${v}"]`).join('');
    if (sel && head.querySelector(tag + sel)) return;
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    head.appendChild(el);
  };
  const base = import.meta.env.BASE_URL || '/';
  add('link', { rel: 'manifest', href: `${base}mobile/manifest.webmanifest` });
  add('link', { rel: 'apple-touch-icon', href: `${base}mobile/icon-180.png` });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'Bumpinto World' });
  add('meta', { name: 'theme-color', content: '#0e182c' });
}

const HINT_KEY = 'bw.m.a2hsHintDismissed';
export function shouldShowHomeScreenHint() {
  if (!isIOS() || isStandalone()) return false;
  try { return localStorage.getItem(HINT_KEY) !== '1'; } catch { return true; }
}
export function dismissHomeScreenHint() {
  try { localStorage.setItem(HINT_KEY, '1'); } catch { /* 저장소 막힘 */ }
}
