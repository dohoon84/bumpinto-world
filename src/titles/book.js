// [titles] 칭호 도감. 데이터는 store 가 갖고, 이 파일은 그리는 입구 중 하나일 뿐이다.
import { AXIS_ORDER, TITLES, axisLabel } from './catalog.js';
import { gradeOf, iconSrc } from './icons.js';
import { isEn, onLangChange, tr } from '../i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GRADE_NAME = {
  bronze: ['동', 'Bronze'], silver: ['은', 'Silver'], gold: ['금', 'Gold'], legendary: ['전설', 'Legendary'], event: ['특별', 'Event'],
};

export function createTitleBook({ store, onEquip, onUnequip }) {
  let root = null;
  let offLang = null;
  function open() {
    if (!root) mount();
    root.hidden = false;
    paint();
  }
  function close() {
    if (root) root.hidden = true;
  }
  function mount() {
    root = document.createElement('div');
    root.className = 'tb-layer';
    root.hidden = true;
    root.innerHTML = `<div class="tb-scrim" data-tb="close"></div><div class="tb-book" role="dialog" aria-modal="true"></div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-tb="close"]')) { close(); return; }
      const btn = e.target.closest('[data-tb-pick]');
      if (!btn || btn.disabled) return;
      const id = btn.dataset.tbPick || '';
      if (!id || id === store.selected) onUnequip?.();
      else onEquip?.(id);
      paint();
    });
    offLang = onLangChange(() => { if (root && !root.hidden) paint(); });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root && !root.hidden) { e.stopPropagation(); close(); }
    });
  }
  function paint() {
    const book = root.querySelector('.tb-book');
    const earned = new Set(store.earnedIds());
    const sel = store.selected;
    const total = store.all().length;
    const groups = AXIS_ORDER.map((axis) => {
      const items = store.all().filter((t) => t.axis === axis);
      if (!items.length) return '';
      const cards = items.map((t) => card(t, earned.has(t.id), sel === t.id)).join('');
      const ax = axisLabel(axis);
      return `<section class="tb-axis"><h3>${esc(isEn() ? ax.en : ax.ko)}</h3><div class="tb-grid">${cards}</div></section>`;
    }).join('');
    book.innerHTML = `
      <header class="tb-head">
        <i class="tb-accent" aria-hidden="true"></i>
        <h2>${esc(tr('칭호 도감', 'Title book'))}</h2>
        <b class="tb-count">${earned.size} / ${total}</b>
        <button type="button" class="tb-x" data-tb="close" aria-label="${esc(tr('닫기', 'Close'))}">×</button>
      </header>
      <p class="tb-note">${esc(tr('얻은 칭호 중 하나를 골라 머리 위에 답니다. 도감은 인벤토리와 따로예요.', 'Pick an earned title to wear above your head. The book is separate from the inventory.'))}</p>
      ${groups}
      <footer class="tb-foot">
        <button type="button" class="tb-btn tb-btn-ghost" data-tb-pick="" ${sel ? '' : 'disabled'}>${esc(tr('칭호 내리기', 'Take off'))}</button>
      </footer>`;
    book.setAttribute('aria-label', tr('칭호 도감', 'Title book'));
  }
  return { open, close, get openNow() { return !!root && !root.hidden; }, refresh: () => { if (root && !root.hidden) paint(); } };
}

function card(t, have, on) {
  const name = isEn() ? t.name.en : t.name.ko;
  const grade = GRADE_NAME[gradeOf(t)] || GRADE_NAME.gold;
  const gname = isEn() ? grade[1] : grade[0];
  const req = t.axis === 'store'
    ? (isEn() ? 'BUMP24 store' : 'BUMP24 상점')
    : (isEn() ? `${t.at}` : `${t.at}`);
  const btn = !have
    ? `<span class="tb-lock">${esc(tr('잠김', 'Locked'))}</span>`
    : `<button type="button" class="tb-btn${on ? ' tb-btn-on' : ''}" data-tb-pick="${esc(t.id)}">${esc(on ? tr('다는 중', 'Wearing') : tr('달기', 'Wear'))}</button>`;
  return `<article class="tb-card g-${gradeOf(t)}${have ? ' is-have' : ''}${on ? ' is-on' : ''}">
    <img src="${iconSrc(t)}" alt="" width="72" height="72">
    <div class="tb-card-t"><b>${esc(name)}</b><small>${esc(gname)} · ${esc(req)}</small></div>
    ${btn}
  </article>`;
}

export function createIconSheet() {
  let root = null;
  function open() {
    if (!root) {
      root = document.createElement('div');
      root.className = 'tb-sheet';
      root.hidden = true;
      document.body.appendChild(root);
      root.addEventListener('click', (e) => { if (e.target.closest('[data-tb="close"]')) root.hidden = true; });
    }
    root.hidden = false;
    root.innerHTML = `<button type="button" class="tb-x" data-tb="close" aria-label="close">×</button><div class="tb-sheet-grid">${TITLES.map((t) => `<figure class="g-${gradeOf(t)}"><img src="${iconSrc(t)}" alt="${esc(isEn() ? t.name.en : t.name.ko)}" width="160" height="160"><figcaption>${esc(isEn() ? t.name.en : t.name.ko)}</figcaption><small>PLACEHOLDER · ${esc(gradeOf(t))}</small></figure>`).join('')}</div>`;
  }
  function close() { if (root) root.hidden = true; }
  return { open, close };
}
