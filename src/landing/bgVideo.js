// [landing] PC 시작화면 배경 영상: 실제 게임 화면(정자 · 판교 · 미금)을 고정 시간 간격으로 녹화한 12.8s 무음 루프.
//   public/landing/bg-landscape.{webm(VP9), mp4(H.264), jpg(포스터)} · 1920x1080.
//   - PC 기본값. ?bgvideo=0 이면 끈다.
//   - 모바일에서는 절대 불러오지 않는다: 모바일 모드(body.mobile / isMobileMode), 터치 전용(coarse pointer) 작은 화면,
//     움직임 줄이기(prefers-reduced-motion), 데이터 절약(Save-Data).
//   - 첫 화면이 그려진 뒤(load + 2rAF + idle)에야 <video> 를 만든다 → 첫 페인트·LCP 는 기존 이미지 그대로.
//   - 실제 재생('playing') 전까지는 기존 배경 이미지가 보이고, 재생되면 페이드 인. 자동재생 거부·로드 실패 → 이미지 유지.
import { isMobileMode } from '../mobile/flag.js';

export function bgVideoAllowed() {
  try { if (new URLSearchParams(location.search).get('bgvideo') === '0') return false; } catch { /* noop */ }
  try { if (document.body.classList.contains('mobile') || isMobileMode()) return false; } catch { return false; }
  try {
    const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    const small = Math.min(screen.width || 0, screen.height || 0) < 900 || Math.min(innerWidth, innerHeight) < 600;
    if (touchOnly && small) return false;
  } catch { /* noop */ }
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch { /* noop */ }
  try { if (navigator.connection && navigator.connection.saveData) return false; } catch { /* noop */ }
  return true;
}

function afterFirstPaint(fn) {
  let done = false;
  const run = () => { if (done) return; done = true; fn(); };
  const idle = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 200);
  };
  const painted = () => requestAnimationFrame(() => requestAnimationFrame(idle));
  if (document.readyState === 'complete') painted();
  else window.addEventListener('load', painted, { once: true });
}

/**
 * host 끝(또는 before 앞)에 배경 영상 레이어를 붙인다. 허용되지 않으면 아무 것도 안 하고 null.
 * @param {{ host: HTMLElement, before?: Node|null, className?: string, onPlaying?: () => void, onFail?: (why: string) => void }} o
 * @returns {{ destroy: () => void } | null}
 */
export function mountBgVideo({ host, before = null, className = '', onPlaying, onFail } = {}) {
  if (!host || !bgVideoAllowed()) return null;
  const base = import.meta.env.BASE_URL || '/';
  let video = null, alive = true, playing = false;

  const fail = (why) => {
    if (!alive) return;
    try { console.info('[bgvideo] fallback to image:', why); } catch { /* noop */ }
    destroy();
    onFail && onFail(why);
  };

  afterFirstPaint(() => {
    if (!alive) return;
    video = document.createElement('video');
    video.className = `bw-bgvideo ${className}`.trim();
    video.muted = true; video.defaultMuted = true;
    video.autoplay = true; video.loop = true; video.playsInline = true;
    video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
    video.setAttribute('aria-hidden', 'true'); video.setAttribute('tabindex', '-1');
    video.disablePictureInPicture = true;
    video.preload = 'auto';
    video.poster = `${base}landing/bg-landscape.jpg`;
    video.addEventListener('playing', () => {
      if (!alive || playing) return;
      playing = true;
      video.classList.add('is-on');
      onPlaying && onPlaying();
    });
    video.addEventListener('error', () => fail('video error'));
    video.innerHTML = `<source src="${base}landing/bg-landscape.webm" type="video/webm"><source src="${base}landing/bg-landscape.mp4" type="video/mp4">`;
    const last = video.lastElementChild;
    if (last) last.addEventListener('error', () => fail('no playable source'));
    if (before && before.parentNode === host) host.insertBefore(video, before); else host.appendChild(video);
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch((e) => fail(`play() rejected: ${e && e.name}`));
  });

  function destroy() {
    if (!alive) return;
    alive = false;
    if (video) {
      try { video.pause(); video.innerHTML = ''; video.removeAttribute('src'); video.load(); } catch { /* noop */ }
      video.remove();
      video = null;
    }
  }
  return { destroy };
}
