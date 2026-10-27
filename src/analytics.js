// Google Analytics (GA4) 로더 및 주요 인게임 이벤트 트래킹
const DEFAULT_GA_ID = import.meta.env?.VITE_GA_ID || 'G-WVF00T91DQ';

let initialized = false;
let activeId = '';

export function initAnalytics(customId) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(location.search);
  if (params.has('shot') || params.get('ga') === 'off') return;
  const id = (customId || params.get('ga') || DEFAULT_GA_ID || '').trim();
  if (!id || !/^G-[A-Z0-9]+$/i.test(id)) return;
  if (typeof window.gtag === 'function') {
    initialized = true;
    activeId = id;
    return;
  }
  if (initialized && activeId === id) return;

  initialized = true;
  activeId = id;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id, {
    page_title: document.title,
    page_location: location.href,
  });

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

export function trackEvent(name, params = {}) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', name, params);
  } catch {}
}
