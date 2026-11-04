import { isHandheld, showPcOnly } from './pcOnly.js';
import { initAnalytics, trackEvent } from './analytics.js';
import { isMobileMode } from './mobile/flag.js';

initAnalytics();

if (isMobileMode()) {
  // [mobile] 핸드폰·태블릿(또는 ?mobile=1): PC 전용 안내 대신 모바일 전용 시작화면 → 게임. ?mobile=0 이면 아래 기존 경로
  const { bootMobile } = await import('./mobile/boot.js');
  await bootMobile();
  await import('./game.js');
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
