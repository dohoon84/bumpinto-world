import { isHandheld, showPcOnly } from './pcOnly.js';
import { initAnalytics, trackEvent } from './analytics.js';
import { isMobileMode } from './mobile/flag.js';

initAnalytics();
// [bp24-poster] 이벤트 포스터는 첫 화면이 아니라 게임 입장 뒤에 띄운다 (game.js completeWorldJoin).
import('./notice/launchPopup.js').then((m) => m.showLaunchNotice()).catch(() => {});

if (isMobileMode()) {
  // [mobile] 핸드폰·태블릿(또는 ?mobile=1): PC 전용 안내 대신 모바일 전용 시작화면 → 게임. ?mobile=0 이면 아래 기존 경로
  //   역을 고른 뒤 게임을 여는 중 오류가 나도 빈 화면으로 멈추지 않게 guard 가 '다시 시도' 카드를 띄운다.
  const guard = await import('./mobile/guard.js');
  try {
    const { bootMobile } = await import('./mobile/boot.js');
    await bootMobile();
  } catch (e) { console.error('[mobile] boot', e); }
  guard.startEntryWatch();
  try {
    await import('./game.js');
  } catch (e) {
    console.error('[mobile] game', e);
    guard.showEntryError(e);
  }
} else if (isHandheld()) {
  trackEvent('mobile_globe_view');
  const { openWorldGate } = await import('./worldGate.js');
  const mountMobileGate = () => {
    document.body.classList.add('in-gate');
    openWorldGate({
      onEnter() {
        trackEvent('pc_only_blocked');
        showPcOnly({ onClose: mountMobileGate });
      },
    });
  };
  mountMobileGate();
} else {
  await import('./game.js');
}
