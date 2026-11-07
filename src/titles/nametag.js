// [titles] 닉네임 옆(위) 칭호. 이름표 DOM 만 고친다. 도감·인벤과 무관.
import { isEn } from '../i18n.js';
import { titleById } from './catalog.js';
import { gradeOf, iconRev, iconSrc } from './icons.js';

let enabled = true;
export function setTitleTagsEnabled(on) { enabled = !!on; }

export function titleLabel(title) {
  if (!title) return '';
  return isEn() ? title.name.en : title.name.ko;
}

/**
 * @param {HTMLElement} el
 * @param {{ name: string, afk?: boolean, titleId?: string, afkText?: string }} spec
 */
export function paintTitleTag(el, { name, afk = false, titleId = '', afkText = '자리비움' }) {
  const title = enabled ? titleById(titleId) : null;
  const who = afk ? `${name} 💤 ${afkText}` : name;
  const sig = `${who}|${title ? title.id : ''}|${gradeOf(title)}|${iconRev()}|${isEn() ? 'en' : 'ko'}`;
  if (el.dataset.tb === sig) return;
  el.dataset.tb = sig;
  el.classList.toggle('is-afk', !!afk);
  el.classList.toggle('has-title', !!title);
  if (!title) {
    el.textContent = who;
    return;
  }
  const row = document.createElement('span');
  row.className = `tb-chip g-${gradeOf(title)}`;
  const img = document.createElement('img');
  img.className = 'tb-ico';
  img.alt = '';
  img.width = 18;
  img.height = 18;
  img.src = iconSrc(title);
  const nm = document.createElement('span');
  nm.className = 'tb-t';
  nm.textContent = titleLabel(title);
  row.append(img, nm);
  const nameEl = document.createElement('span');
  nameEl.className = 'tb-name';
  nameEl.textContent = who;
  el.replaceChildren(row, nameEl);
}
