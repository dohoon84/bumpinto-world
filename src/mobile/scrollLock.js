// [mobile-scroll-lock] iOS Safari: 채팅 입력칸에 포커스가 가면 키보드를 피하려고 문서(레이아웃 뷰포트)를 위로 밀어 올리고,
//   키보드가 내려가도 window.scrollY 를 0 으로 되돌리지 않을 때가 있다. 그러면 position:fixed HUD 는 원래 자리에 그려지는데
//   터치 판정은 밀린 만큼 어긋나서 "버튼을 눌러도 안 되고 옆을 눌러야 되는" 상태가 된다 (한참 뒤 저절로 풀림).
//   게임 화면은 스크롤할 일이 없으니, 입력 중이 아닐 때 문서가 밀려 있으면 바로 (0,0) 으로 되돌린다. body.mobile 에서만 설치.
const EDIT = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const typing = () => !!document.activeElement?.matches?.(EDIT);
const shifted = () => {
  const de = document.documentElement, b = document.body;
  return !!(window.scrollX || window.scrollY || de.scrollTop || de.scrollLeft || b?.scrollTop || b?.scrollLeft);
};
export function resetDocScroll() {
  if (!shifted()) return false;
  try { window.scrollTo(0, 0); } catch { /* 무시 */ }
  for (const el of [document.documentElement, document.body]) { if (el) { el.scrollTop = 0; el.scrollLeft = 0; } }
  return true;
}

let installed = false;
export function installScrollLock() {
  if (installed) return;
  installed = true;
  const fix = () => { if (!typing()) resetDocScroll(); };
  // 키보드가 내려가는 애니메이션 동안 iOS 가 한 번 더 밀 수 있어 몇 번 나눠서 확인
  const settle = () => { fix(); setTimeout(fix, 80); setTimeout(fix, 300); setTimeout(fix, 700); };
  document.addEventListener('focusout', (e) => { if (e.target?.matches?.(EDIT)) setTimeout(settle, 0); }, true);
  window.visualViewport?.addEventListener('resize', settle);
  window.visualViewport?.addEventListener('scroll', fix);
  addEventListener('scroll', fix, { passive: true });
  addEventListener('orientationchange', settle);
  addEventListener('resize', settle);
  addEventListener('pageshow', settle);
  document.addEventListener('fullscreenchange', settle);
  document.addEventListener('webkitfullscreenchange', settle);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) settle(); });
  // 혹시 놓친 경우에도 다음 터치부터는 맞게 (이번 터치 판정은 이미 정해졌으므로 바로 다음 탭부터 정상)
  document.addEventListener('touchstart', fix, { capture: true, passive: true });
  document.addEventListener('pointerdown', fix, { capture: true, passive: true });
}
