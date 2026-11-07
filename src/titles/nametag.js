// [titles] 닉네임 위 작은 메달. 앞면은 SVG 슬롯, 뒷면은 등급 색 원. Y축으로 천천히 한 바퀴.
import { isEn, tr } from '../i18n.js';
import { GRADES, titleById } from './catalog.js';
import { gradeOf, iconRev, iconSrc, markLetter } from './icons.js';

let enabled = true;
let fxOn = true;
export function setTitleTagsEnabled(on) { enabled = !!on; }
export function setTitleFxEnabled(on) { fxOn = !!on; }

export function titleLabel(title) {
  if (!title) return '';
  return isEn() ? title.name.en : title.name.ko;
}

const SPARK_N = { bronze: 0, silver: 0, gold: 2, event: 3, legendary: 5 };
const INK = { bronze: '#fff8e7', silver: '#1c2836', gold: '#3a2500', legendary: '#fff6c2', event: '#e8fff8' };

function sparkCount(grade, lite) {
  if (!fxOn || lite) return 0;
  const n = SPARK_N[grade] || 0;
  const mobile = typeof document !== 'undefined' && document.body.classList.contains('mobile');
  if (!mobile) return n;
  if (grade === 'legendary') return Math.min(n, 3);
  if (grade === 'event') return Math.min(n, 2);
  return Math.min(n, 1);
}

/**
 * @param {HTMLElement} el
 * @param {{ name: string, afk?: boolean, titleId?: string, afkText?: string, celebrate?: boolean, lite?: boolean }} spec
 */
export function paintTitleTag(el, { name, afk = false, titleId = '', afkText = '자리비움', celebrate = false, lite = false } = {}) {
  const title = enabled ? titleById(titleId) : null;
  const who = afk ? `${name} 💤 ${afkText}` : name;
  const grade = title ? gradeOf(title) : '';
  const sparks = title ? sparkCount(grade, lite) : 0;
  const hot = !!(title && celebrate);
  const sig = `${who}|${title ? title.id : ''}|${grade}|${iconRev()}|${hot ? 1 : 0}|${sparks}|${fxOn ? 1 : 0}|${isEn() ? 'en' : 'ko'}`;
  if (el.dataset.tb === sig) return;
  el.dataset.tb = sig;
  el.classList.toggle('is-afk', !!afk);
  el.classList.toggle('has-title', !!title);
  el.classList.remove('g-bronze', 'g-silver', 'g-gold', 'g-legendary', 'g-event');
  if (!title) {
    el.textContent = who;
    return;
  }
  if (grade) el.classList.add(`g-${grade}`);
  const g = GRADES[grade] || GRADES.gold;
  const row = document.createElement('span');
  row.className = `tb-chip g-${grade}${hot ? ' is-earn' : ''}`;
  const slot = document.createElement('span');
  slot.className = 'tb-slot';
  const coin = document.createElement('span');
  coin.className = 'tb-coin';
  coin.style.setProperty('--back', g.metal);
  coin.style.setProperty('--ink', INK[grade] || '#fff');
  coin.style.setProperty('--rim', g.rim);
  const front = document.createElement('span');
  front.className = 'tb-front';
  const img = document.createElement('img');
  img.alt = '';
  img.width = 28;
  img.height = 28;
  img.src = iconSrc(title);
  front.appendChild(img);
  const back = document.createElement('span');
  back.className = 'tb-back';
  back.textContent = markLetter(title);
  const edge = document.createElement('span');
  edge.className = 'tb-edge';
  coin.append(front, back, edge);
  slot.appendChild(coin);
  for (let i = 0; i < sparks; i++) {
    const s = document.createElement('i');
    s.className = 'tb-spark';
    const a = (i / sparks) * Math.PI * 2;
    s.style.setProperty('--dx', `${Math.cos(a) * 16}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * 14}px`);
    s.style.setProperty('--i', String(i));
    slot.appendChild(s);
  }
  const nm = document.createElement('span');
  nm.className = 'tb-t';
  nm.textContent = titleLabel(title);
  if (hot) {
    const k = document.createElement('span');
    k.className = 'tb-kicker';
    k.textContent = tr('칭호 획득', 'Title earned');
    row.append(k, slot, nm);
  } else row.append(slot, nm);
  const nameEl = document.createElement('span');
  nameEl.className = 'tb-name';
  nameEl.textContent = who;
  el.replaceChildren(row, nameEl);
}
