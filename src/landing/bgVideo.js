// [landing] 시작화면 배경 영상 (미리보기 · ?bgvideo=1 일 때만).
//   실제 게임 화면을 고정 시간 간격으로 녹화한 무음 루프 영상(public/landing/bg-*.{webm,mp4}).
//   - 기본 동작은 그대로: 플래그가 없으면 아무것도 하지 않는다.
//   - 첫 화면이 그려진 뒤(load + idle)에야 <video> 를 만든다 → 첫 페인트·LCP 는 기존 이미지 그대로.
//   - 영상이 실제로 재생('playing')되기 전까지는 기존 배경 이미지가 보인다. 재생되면 0.6s 페이드 인.
//   - 움직임 줄이기(prefers-reduced-motion), 데이터 절약(Save-Data), 자동재생 거부·로드 실패 → 영상 없이 이미지 유지.
//   - 가로/세로 화면에 맞는 파일을 고른다(세로 = 1080x1920, 가로 = 1920x1080), 회전하면 다시 고른다.

const FLAG = 'bgvideo';

export function bgVideoRequested() {
  try { return new URLSearchParams(location.search).get(FLAG) === '1'; } catch { return false; }
}

/** 영상을 틀어도 되는 환경인지 (플래그 + 움직임 줄이기/데이터 절약 아님). */
export function bgVideoAllowed() {
  if (!bgVideoRequested()) return false;
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch { /* noop */ }
  try { if (navigator.connection && navigator.connection.saveData) return false; } catch { /* noop */ }
  return true;
}

const isPortrait = () => (window.innerHeight || 0) > (window.innerWidth || 0);

function afterFirstPaint(fn) {
  let done = false;
  const run = () => { if (done) return; done = true; fn(); };
  const idle = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 200);
  };
  // 두 번의 rAF = 첫 프레임이 실제로 그려진 뒤
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
  let video = null, alive = true, playing = false, mq = null;

  const fail = (why) => {
    if (!alive) return;
    try { console.info('[bgvideo] fallback to image:', why); } catch { /* noop */ }
    destroy();
    onFail && onFail(why);
  };

  const setSources = () => {
    if (!video) return;
    const kind = isPortrait() ? 'portrait' : 'landscape';
    if (video.dataset.kind === kind) return;
    video.dataset.kind = kind;
    video.poster = `${base}landing/bg-${kind}.jpg`;
    video.innerHTML = `<source src="${base}landing/bg-${kind}.webm" type="video/webm"><source src="${base}landing/bg-${kind}.mp4" type="video/mp4">`;
    const last = video.lastElementChild;
    if (last) last.addEventListener('error', () => fail('no playable source'));
    video.load();
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch((e) => fail(`play() rejected: ${e && e.name}`));
  };

  const onOrient = () => setSources();

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
    video.addEventListener('playing', () => {
      if (!alive || playing) return;
      playing = true;
      video.classList.add('is-on');
      onPlaying && onPlaying();
    });
    video.addEventListener('error', () => fail('video error'));
    if (before && before.parentNode === host) host.insertBefore(video, before); else host.appendChild(video);
    try { mq = matchMedia('(orientation: portrait)'); mq.addEventListener ? mq.addEventListener('change', onOrient) : mq.addListener(onOrient); } catch { mq = null; }
    setSources();
  });

  function destroy() {
    if (!alive) return;
    alive = false;
    try { if (mq) (mq.removeEventListener ? mq.removeEventListener('change', onOrient) : mq.removeListener(onOrient)); } catch { /* noop */ }
    if (video) {
      try { video.pause(); video.removeAttribute('src'); video.innerHTML = ''; video.load(); } catch { /* noop */ }
      video.remove();
      video = null;
    }
  }
  return { destroy };
}
