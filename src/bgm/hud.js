// [bgm] 상단 가운데 BGM 플레이어 HUD (DOM 전용 — three.js 객체 없음)
//   ▶/❚❚ 원형 버튼 · "♪ 곡 제목" · 주파수 막대 24개(AnalyserNode) · 2px 진행선(표시 전용: 손잡이·탐색·클릭 없음)
//   · 스피커(음소거 토글) — 마우스를 올리면 볼륨 슬라이더가 펼쳐진다(손잡이가 있는 유일한 조작)
//   막대는 재생 중 + 음소거 아님 + 탭 보임일 때만 requestAnimationFrame 으로 갱신, 아니면 낮고 흐린 고정 모양
import { BAR_COUNT, barBins } from './playlist.js';

const ICON = {
  play: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4.2 2.6v8.8L11.2 7z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  pause: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4.8 2.8v8.4M9.2 2.8v8.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  vol: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2.8 6.8h2.6L9 3.8v10.4l-3.6-3H2.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M11.6 6.6a3.4 3.4 0 0 1 0 4.8M13.6 4.6a6.2 6.2 0 0 1 0 8.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  muted: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2.8 6.8h2.6L9 3.8v10.4l-3.6-3H2.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M11.8 7l4 4M15.8 7l-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
};
// 멈춤/음소거 때 보여 줄 낮은 고정 막대 (디자인 시안의 정지 상태 모양, 0..1)
const TILT = Array.from({ length: BAR_COUNT }, (_, i) => 1.05 + 0.7 * i / (BAR_COUNT - 1));
const IDLE = [0.17, 0.25, 0.33, 0.21, 0.29, 0.17, 0.25, 0.33, 0.21, 0.29, 0.17, 0.25, 0.33, 0.21, 0.17, 0.29, 0.25, 0.17, 0.33, 0.21, 0.25, 0.17, 0.29, 0.21];

export function createBgmHud({ player, tr, onLangChange }) {
  const root = document.createElement('div');
  root.id = 'bgm';
  root.className = 'bgm';
  root.hidden = true;
  root.innerHTML = `
    <button type="button" class="bgm-play"></button>
    <div class="bgm-info">
      <div class="bgm-title"><span class="bgm-name"></span><span class="bgm-flag"></span></div>
      <div class="bgm-bars" aria-hidden="true">${'<i></i>'.repeat(BAR_COUNT)}</div>
      <div class="bgm-progress" aria-hidden="true"><i></i></div>
    </div>
    <div class="bgm-vol">
      <button type="button" class="bgm-mute"></button>
      <input class="bgm-slider" type="range" min="0" max="1" step="0.01" />
    </div>`;
  document.body.appendChild(root);
  const $ = (sel) => root.querySelector(sel);
  const playBtn = $('.bgm-play'), muteBtn = $('.bgm-mute'), slider = $('.bgm-slider');
  const nameEl = $('.bgm-name'), flagEl = $('.bgm-flag'), progEl = $('.bgm-progress i');
  const bars = [...root.querySelectorAll('.bgm-bars i')];
  const bins = barBins(player.binCount);

  // 버튼이 포커스를 가져가면 Space(점프)가 버튼을 눌러 버리므로 마우스 클릭으로는 포커스를 주지 않는다
  for (const b of [playBtn, muteBtn]) b.addEventListener('mousedown', (e) => e.preventDefault());
  playBtn.addEventListener('click', () => player.togglePause());
  muteBtn.addEventListener('click', () => player.setMuted(!player.muted));
  slider.addEventListener('input', () => player.setVolume(slider.value));
  // 슬라이더에 포커스가 남으면 WASD 가 막히므로 놓으면 바로 돌려준다
  slider.addEventListener('change', () => slider.blur());
  slider.addEventListener('pointerup', () => slider.blur());

  let raf = 0, shown = false, lastIdle = false;
  const setBar = (i, v) => { bars[i].style.transform = `scaleY(${Math.max(0.08, Math.min(1, v)).toFixed(3)})`; };
  function drawIdle() { if (lastIdle) return; lastIdle = true; for (let i = 0; i < BAR_COUNT; i++) setBar(i, IDLE[i]); }
  const live = () => shown && player.playing && !document.hidden;
  function frame() {
    raf = 0;
    if (!live()) { drawIdle(); return; }
    const spec = player.muted ? null : player.spectrum();
    if (spec) {
      lastIdle = false;
      for (let i = 0; i < BAR_COUNT; i++) {
        const [a, b] = bins[i]; let m = 0;
        for (let k = a; k < b; k++) if (spec[k] > m) m = spec[k];
        setBar(i, Math.pow(m / 255, 1.6) * TILT[i]); // 제곱 곡선으로 대비를 주고, 에너지가 적은 고음 쪽은 조금 키운다
      }
    } else drawIdle();
    progEl.style.transform = `scaleX(${player.progress().toFixed(4)})`;
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && live()) raf = requestAnimationFrame(frame); };

  function render() {
    const paused = !player.playing, muted = player.muted;
    root.classList.toggle('is-paused', paused);
    root.classList.toggle('is-muted', muted);
    playBtn.innerHTML = paused ? ICON.play : ICON.pause;
    playBtn.setAttribute('aria-label', paused ? tr('배경음악 재생', 'Play music') : tr('배경음악 일시정지', 'Pause music'));
    playBtn.title = playBtn.getAttribute('aria-label');
    muteBtn.innerHTML = muted ? ICON.muted : ICON.vol;
    muteBtn.setAttribute('aria-label', muted ? tr('음소거 해제', 'Unmute') : tr('음소거', 'Mute'));
    muteBtn.title = muteBtn.getAttribute('aria-label');
    slider.setAttribute('aria-label', tr('배경음악 볼륨', 'Music volume'));
    if (document.activeElement !== slider) slider.value = String(player.volume);
    root.style.setProperty('--bgm-vol', `${Math.round(player.volume * 100)}%`);
    const t = player.track;
    nameEl.textContent = `♪ ${t.title}`;
    flagEl.textContent = muted ? tr(' · 음소거', ' · Muted') : '';
    root.setAttribute('aria-label', tr(`배경음악: ${t.title}`, `Background music: ${t.title}`));
    progEl.style.transform = `scaleX(${player.progress().toFixed(4)})`;
    if (paused || muted) drawIdle();
    kick();
  }
  // 좁은 화면(≈1280px)에서 볼륨 슬라이더까지 펼친 폭이 오른쪽 위 버튼 줄(#top-right-bar 등)과 겹치지 않게
  // 가운데에서 필요한 만큼만 옆으로 민다. 둘 다 피할 수 없으면 눌러야 하는 오른쪽 버튼을 우선 피한다
  const NEIGHBORS = ['#hud', '#buttons', '#top-right-bar'];
  const SLIDER_OPEN = 80 + 14, MARGIN = 8;
  function fit() {
    if (!shown) return;
    const r = root.getBoundingClientRect(), vw = innerWidth, mid = vw / 2;
    const open = slider.getBoundingClientRect().width + (parseFloat(getComputedStyle(slider).marginLeft) || 0);
    const half = (r.width - open + SLIDER_OPEN) / 2;
    let lo = -Infinity, hi = Infinity;
    for (const sel of NEIGHBORS) {
      const n = document.querySelector(sel)?.getBoundingClientRect();
      if (!n || !n.width || n.bottom <= r.top || n.top >= r.bottom) continue;
      if (n.left + n.width / 2 < mid) lo = Math.max(lo, n.right + MARGIN + half);
      else hi = Math.min(hi, n.left - MARGIN - half);
    }
    const c = lo <= hi ? Math.min(Math.max(mid, lo), hi) : Math.min(mid, hi);
    const shift = Math.round(c - mid);
    if (shift !== fit.last) { fit.last = shift; root.style.setProperty('--bgm-shift', `${shift}px`); }
  }
  const refit = () => requestAnimationFrame(fit);
  addEventListener('resize', refit);
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(refit);
    for (const sel of NEIGHBORS) { const n = document.querySelector(sel); if (n) ro.observe(n); }
    ro.observe(root); // 제목·음소거 표시로 폭이 바뀔 때 (슬라이더 펼침은 계산에서 빼므로 위치는 그대로)
  }

  onLangChange?.(() => { render(); refit(); });
  document.addEventListener('visibilitychange', kick);

  return {
    el: root,
    render,
    show() { if (shown) return; shown = true; root.hidden = false; document.body.classList.add('has-bgm'); render(); fit(); },
    hide() { shown = false; root.hidden = true; document.body.classList.remove('has-bgm'); },
  };
}
