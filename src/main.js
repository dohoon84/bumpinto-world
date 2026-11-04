import { isHandheld, showPcOnly } from './pcOnly.js';
import { initAnalytics, trackEvent } from './analytics.js';

initAnalytics();
// [notice-launch] 첫 화면 모바일 오픈 안내(자체 완결 모듈, 실패해도 무시)
import('./notice/launchPopup.js').then((m) => m.showLaunchNotice()).catch(() => {});

if (isHandheld()) {
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
