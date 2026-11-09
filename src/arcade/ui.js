// [arcade] DOM UI: 힌트 · 페이드 · 순위판 · 음소거
import './ui.css';

export function createArcadeUI({ onHintTap, onExit, onMute } = {}) {
  let root = document.getElementById('arc-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'arc-root';
    document.body.appendChild(root);
  }
  root.innerHTML = `
    <div class="arc-hint" data-hint></div>
    <div class="arc-cab-hint" data-cab></div>
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

  hint.addEventListener('click', () => onHintTap?.());
  exitBtn.addEventListener('click', () => onExit?.());
  muteBtn.addEventListener('click', () => onMute?.());

  return {
    root,
    setInside(on) { root.classList.toggle('is-inside', !!on); },
    setHint(text, on = !!text) {
      hint.classList.toggle('on', on);
      hint.innerHTML = text || '';
    },
    setCabHint(text, on = !!text) {
      cab.classList.toggle('on', on);
      cab.textContent = text || '';
    },
    setFade(a, title = '', sub = '') {
      fade.style.opacity = String(a);
      fade.style.pointerEvents = a > 0.05 ? 'auto' : 'none';
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
