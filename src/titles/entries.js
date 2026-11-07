// [titles] 도감을 여는 입구. 모델과 떨어져 있어서 메뉴 위치는 여기만 바꾸면 된다.
import { onLangChange, tr } from '../i18n.js';

const MEDAL = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 4.5 12 8l3-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10.2l1.1 2.2 2.4.3-1.8 1.7.5 2.4L12 15.6 9.8 16.8l.5-2.4-1.8-1.7 2.4-.3z" fill="currentColor"/></svg>`;

export function mountTitleEntries({ openBook, closeBook, isOpen }) {
  const typing = (n) => {
    const a = n || document.activeElement;
    if (!a || a === document.body) return false;
    const tag = a.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || a.isContentEditable;
  };
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return;
    if (typing(e.target)) return;
    if (['in-gate', 'in-lobby'].some((c) => document.body.classList.contains(c))) return;
    e.preventDefault();
    if (isOpen()) closeBook();
    else openBook();
  });

  const bar = document.getElementById('buttons');
  if (bar && !document.getElementById('btn-titles')) {
    const b = document.createElement('button');
    b.id = 'btn-titles';
    b.type = 'button';
    const paint = () => { b.textContent = tr('🏅 칭호', '🏅 Titles'); };
    paint();
    onLangChange(paint);
    b.addEventListener('click', () => openBook());
    bar.appendChild(b);
  }

  const inject = () => {
    const body = document.querySelector('#m-hud .m-menu-body');
    if (!body || !body.childElementCount || body.querySelector('[data-titles]')) return;
    const h = document.createElement('p');
    h.className = 'm-sec';
    h.dataset.titles = '1';
    h.textContent = tr('칭호', 'Titles');
    const tiles = document.createElement('div');
    tiles.className = 'm-tiles';
    tiles.dataset.titles = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'm-tile';
    btn.innerHTML = `${MEDAL}<span>${tr('칭호 도감', 'Title book')}</span>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelector('#m-hud .m-scrim:not([hidden])')?.click();
      openBook();
    });
    tiles.appendChild(btn);
    body.append(h, tiles);
  };
  const mo = new MutationObserver(inject);
  mo.observe(document.body, { childList: true, subtree: true });
  inject();
  return { inject };
}
