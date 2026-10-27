import { isHandheld, showPcOnly } from './pcOnly.js';
import { initAnalytics, trackEvent } from './analytics.js';

initAnalytics();

if (isHandheld()) {
  trackEvent('pc_only_blocked');
  showPcOnly();
} else {
  await import('./game.js');
}
