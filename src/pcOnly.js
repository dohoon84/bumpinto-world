// 핸드폰·태블릿만 가린다. 데스크톱은 창을 줄여도 그대로 둔다.
export function isHandheld() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  if (/iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini|CriOS|FxiOS|EdgiOS|Mobile|Silk|Kindle|PlayBook/i.test(ua)) return true;
  if (/iPhone|iPad|iPod/i.test(platform)) return true;
  if (navigator.userAgentData?.mobile === true) return true;

  const points = Number(navigator.maxTouchPoints) || 0;
  // iPadOS는 데스크톱 Safari로 속이고, 터치 포인트만 남긴다.
  if (points > 1 && (/Macintosh|Mac OS X/i.test(ua) || platform === 'MacIntel')) return true;

  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && points > 0;
}

export function showPcOnly() {
  document.documentElement.classList.add('pc-only');
  document.body.classList.add('pc-only');
  document.body.classList.remove('in-gate', 'in-lobby', 'touch');
  const panel = document.getElementById('pc-only');
  if (panel) panel.hidden = false;
}
