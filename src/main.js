import { isHandheld, showPcOnly } from './pcOnly.js';
import { initAnalytics, trackEvent } from './analytics.js';

initAnalytics();

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
