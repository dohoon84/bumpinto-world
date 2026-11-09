// [arcade] DOM UI: 힌트 · 페이드 · 순위판 · 음소거 — 터치는 BUMP24 식 '탭하여' 버튼
import './ui.css';

const isTouch = () => {
  try { return document.body.classList.contains('mobile') || matchMedia('(hover: none) and (pointer: coarse)').matches; }
  catch { return false; }
};
const HAND = `<svg class="hand" viewBox="0 0 64 64" aria-hidden="true"><path fill="#fff" d="M28 8c2.5 0 4.5 2 4.5 4.5V30l1.2-.6c1.4-.7 3.1-.4 4.1.8l.4.5V18.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5V36l1.5-1c1.5-1 3.6-.7 4.7.8 1.1 1.5.9 3.6-.4 4.9L42 52.5C38.5 56.5 33.5 59 28 59c-9 0-16.5-6.5-18.5-15.2L7 30.5c-.7-2.3.6-4.7 2.9-5.4 2.3-.7 4.7.6 5.4 2.9l2.2 7.5V12.5C17.5 10 19.5 8 22 8s4.5 2 4.5 4.5V28L28 8z"/></svg>`;

export function createArcadeUI({ onHintTap, onCabTap, onExit, onMute } = {}) {
  let root = document.getElementById('arc-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'arc-root';
    document.body.appendChild(root);
  }
  root.innerHTML = `
    <div class="arc-hint" data-hint role="status"></div>
    <div class="arc-cab-hint" data-cab role="status"></div>
    <div class="arc-fade" data-fade style="opacity:0"><b></b><span></span></div>
    <div class="arc-inside-bar">
      <button type="button" data-mute>🔊</button>
      <button type="button" data-exit>나가기</button>
    </div>
    <div data-modal-host></div>
  `;
  const hint = root.querySelector('[data-hint]');
  const cab = root.querySelector('[data-cab]');
  const fade = root.querySelector('[data-fade]');
  const muteBtn = root.querySelector('[data-mute]');
  const exitBtn = root.querySelector('[data-exit]');
  const modalHost = root.querySelector('[data-modal-host]');

  const fireHint = (e) => { e?.preventDefault?.(); e?.stopPropagation?.(); onHintTap?.(); };
  const fireCab = (e) => { e?.preventDefault?.(); e?.stopPropagation?.(); onCabTap?.(); };
  const bindTap = (el, fn) => {
    el.addEventListener('click', fn);
    el.addEventListener('pointerdown', (e) => {
      if (!el.classList.contains('tap')) return;
      e.preventDefault(); e.stopPropagation();
      el.classList.add('press');
      fn(e);
    });
    el.addEventListener('pointerup', () => el.classList.remove('press'));
    el.addEventListener('pointercancel', () => el.classList.remove('press'));
  };
  bindTap(hint, fireHint);
  bindTap(cab, fireCab);
  exitBtn.addEventListener('click', () => onExit?.());
  muteBtn.addEventListener('click', () => onMute?.());

  function paintAct(el, text, { act = false, tap = null, key = 'E', on = !!text } = {}) {
    el.classList.toggle('on', on);
    if (!on || !text) { el.innerHTML = ''; el.classList.remove('tap'); el.setAttribute('role', 'status'); return; }
    const touch = act && isTouch();
    if (touch) {
      el.classList.add('tap');
      el.setAttribute('role', 'button');
      el.innerHTML = `<span class="arc-tapbtn"><span class="ico" aria-hidden="true"><i class="rip"></i><i class="rip r2"></i>${HAND}</span><span class="lb"><b class="tw">탭하여</b>${esc(tap || text)}</span></span>`;
    } else if (act) {
      el.classList.remove('tap');
      el.setAttribute('role', 'status');
      el.innerHTML = `<kbd>${esc(key)}</kbd> ${text}`;
    } else {
      el.classList.remove('tap');
      el.setAttribute('role', 'status');
      el.innerHTML = text;
    }
  }

  return {
    root,
    isTouch,
    setInside(on) { root.classList.toggle('is-inside', !!on); },
    setHint(text, on = !!text, opts = {}) {
      paintAct(hint, text, { ...opts, act: opts.act ?? !!text, on });
    },
    setCabHint(text, on = !!text, opts = {}) {
      paintAct(cab, text, { ...opts, act: opts.act ?? !!text, key: opts.key || 'F', on });
    },
    setFade(a, title = '', sub = '') {
      const v = Math.min(1, Math.max(0, Number(a) || 0));
      fade.style.opacity = String(v);
      fade.style.pointerEvents = v > 0.05 ? 'auto' : 'none';
      if (v <= 0.05) { fade.style.visibility = 'hidden'; } else { fade.style.visibility = 'visible'; }
      fade.querySelector('b').textContent = title;
      fade.querySelector('span').textContent = sub;
    },
    setMuted(m) { muteBtn.textContent = m ? '🔇' : '🔊'; },
    showBoard({ title = '범핑팡 랭킹', sub = '오락실 통합 · 월간 1·2·3만 보상', rows = [], period = 'today', onClose, onTab } = {}) {
      modalHost.innerHTML = `<div class="arc-modal"><div class="board" role="dialog">
        <h3>${esc(title)}</h3><div class="sub">${esc(sub)}</div>
        <div class="tabs">
          <button type="button" data-p="today" class="${period === 'today' ? 'on' : ''}">오늘</button>
          <button type="button" data-p="week" class="${period === 'week' ? 'on' : ''}">이번 주</button>
          <button type="button" data-p="month" class="${period === 'month' ? 'on' : ''}">이달 ★</button>
        </div>
        <ol>${rows.length ? rows.map((r) => `<li><span class="rk">${r.rank}</span><span>${esc(r.name || '나')}</span><span class="sc">${Number(r.score || 0).toLocaleString()}</span></li>`).join('') : '<li style="opacity:.6">아직 기록이 없어요</li>'}</ol>
        <button type="button" class="close" data-close>닫기</button>
      </div></div>`;
      modalHost.querySelector('[data-close]')?.addEventListener('click', () => { modalHost.innerHTML = ''; onClose?.(); });
      modalHost.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => onTab?.(b.getAttribute('data-p'))));
    },
    hideBoard() { modalHost.innerHTML = ''; },
    dispose() { root.remove(); },
  };
}

function esc(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
