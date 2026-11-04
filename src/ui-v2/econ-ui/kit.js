// [econ-ui] 경제 UI 공통: 숫자 · 문구 · 아이콘 · 알약 · 막대 · 예시 데이터 표시 · 무료(베타) 배지
//   모양은 Figma 13:2 키트(14:3)와 game-ui-spec.md 의 토큰 그대로. 모든 문구는 i18n tr() 을 거친다.
import { tr, isEn } from '../../i18n.js';
import { ICON, esc } from '../kit.js';
import { econ } from '../econ/index.js';

export const n = (v) => Math.round(+v || 0).toLocaleString('en-US');
export const sgn = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${n(Math.abs(v))}`;
export const T = (t) => (t ? (isEn() ? t.en : t.ko) : '');
export { tr, esc, ICON };

export const AXIS = {
  health: { c: '#2fbf71', ko: '건강', en: 'Health' },
  explore: { c: '#f08c2e', ko: '탐험', en: 'Explore' },
  transit: { c: '#3b82f6', ko: '교통', en: 'Transit' },
  neighbor: { c: '#ec5f9a', ko: '이웃', en: 'Neighbor' },
  streak: { c: '#8b6cff', ko: '꾸준함', en: 'Streak' },
};
export const axisName = (a) => (AXIS[a] ? tr(AXIS[a].ko, AXIS[a].en) : a);

const sv = (s, vb, body) => `<svg class="v2-ic" width="${s}" height="${s}" viewBox="0 0 ${vb} ${vb}" aria-hidden="true">${body}</svg>`;
export const EI = {
  coin: (s = 16) => ICON.coin(s),
  walk: (s = 16, c = '#fff') => sv(s, 16, `<ellipse cx="5.6" cy="5.4" rx="2.3" ry="3.4" fill="${c}"/><ellipse cx="10.6" cy="8.6" rx="2.3" ry="3.4" fill="${c}"/><circle cx="5.4" cy="11.4" r="1.4" fill="${c}"/><circle cx="10.8" cy="14" r="1.3" fill="${c}"/>`),
  quest: (s = 16) => sv(s, 16, `<rect x="2" y="2.5" width="12" height="12.5" rx="2.4" fill="#1f5fbf"/><rect x="5" y="1" width="6" height="3.2" rx="1.2" fill="#ffe169"/><path d="M5 9 L7.2 11.2 L11.2 6.8" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`),
  card: (s = 20) => sv(s, 20, `<rect x="1.5" y="4" width="17" height="12" rx="2.4" fill="#fff"/><rect x="1.5" y="6.6" width="17" height="2.4" fill="#d4003b"/><rect x="1.5" y="9" width="17" height="1.4" fill="#f5a200"/><rect x="4" y="12" width="5" height="1.6" rx=".8" fill="#9eb4c6"/>`),
  karma: (s = 16, c = '#ffe169') => sv(s, 16, `<path d="M8 1 L9.8 6.2 L15 8 L9.8 9.8 L8 15 L6.2 9.8 L1 8 L6.2 6.2 Z" fill="${c}"/>`),
  check: (s = 14, c = '#fff') => ICON.check(s, c),
  lock: (s = 12, c = '#9eb4c6') => ICON.lock(s, c),
  close: (s = 16) => ICON.close(s),
  board: (s = 20) => sv(s, 20, `<rect x="2" y="3" width="16" height="11" rx="2.6" fill="#ec5f9a"/><path d="M6 14 L6 17.5 L10 14 Z" fill="#ec5f9a"/><rect x="5" y="6.4" width="10" height="1.5" rx=".75" fill="#fff"/><rect x="5" y="9.4" width="6.5" height="1.5" rx=".75" fill="#fff"/>`),
  nfc: (s = 20, c = '#fff') => sv(s, 20, `<path d="M6 5 A7 7 0 0 1 6 15 M9.5 3 A10 10 0 0 1 9.5 17 M13 1.5 A12.5 12.5 0 0 1 13 18.5" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`),
  // 5축 아이콘 (흰색, 축 색 타일 위)
  health: (s = 16, c = '#fff') => sv(s, 16, `<path d="M3 13 C3 6 8 2.5 14 2.5 C14 8.5 10.5 13 3.8 13 Z" fill="${c}"/><path d="M3 13 L9 7" stroke="#2fbf71" stroke-width="1.4" stroke-linecap="round"/>`),
  explore: (s = 16, c = '#fff') => sv(s, 16, `<circle cx="8" cy="8" r="6.2" fill="none" stroke="${c}" stroke-width="1.8"/><path d="M10.8 5.2 L9 9 L5.2 10.8 L7 7 Z" fill="${c}"/>`),
  transit: (s = 16, c = '#fff') => sv(s, 16, `<rect x="3" y="1.8" width="10" height="10.8" rx="2.2" fill="${c}"/><rect x="4.6" y="3.6" width="6.8" height="3.6" rx=".8" fill="#3b82f6"/><circle cx="5.6" cy="10" r=".9" fill="#3b82f6"/><circle cx="10.4" cy="10" r=".9" fill="#3b82f6"/><path d="M4.5 15 L5.5 12.6 M11.5 15 L10.5 12.6" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>`),
  neighbor: (s = 16, c = '#fff') => sv(s, 16, `<circle cx="5.6" cy="5.4" r="2.4" fill="${c}"/><circle cx="11" cy="6" r="2" fill="${c}"/><path d="M1.5 14 C1.8 10.2 9.4 10.2 9.7 14 Z M8.6 13.4 C9 10.6 14.2 10.4 14.6 13.4 Z" fill="${c}"/>`),
  streak: (s = 16, c = '#fff') => sv(s, 16, `<path d="M8 15 C4.6 15 3 12.6 3 10.2 C3 7 5.6 5.8 6.4 1.5 C9 3.4 13 6.4 13 10.4 C13 12.8 11.2 15 8 15 Z" fill="${c}"/><path d="M8 13.6 C6.8 13.6 6 12.6 6 11.6 C6 10.2 7.2 9.4 7.6 7.8 C9 9 10 10.2 10 11.6 C10 12.7 9.2 13.6 8 13.6 Z" fill="#8b6cff"/>`),
};
export const axisTile = (axis, s = 48) => `<span class="ve-axt" style="--c:${AXIS[axis]?.c || '#9eb4c6'};width:${s}px;height:${s}px">${(EI[axis] || EI.karma)(Math.round(s * 0.46))}</span>`;

/** '예시 데이터' 표시: 금액·할 일이 mock 일 때만 */
export const isMock = () => !!econ.isMock;
export const mockTag = (cls = '') => (isMock() ? `<span class="ve-mock ${cls}" title="${esc(tr('로컬 mock 경제 · 서버 원장이 아니에요', 'Local mock economy · not the server ledger'))}">${esc(tr('예시 데이터', 'Example data'))}</span>` : '');
export const freeBadge = (cls = '') => `<span class="ve-free ${cls}">${esc(tr('무료(베타)', 'Free (Beta)'))}</span>`;
export const bumPill = (amount, { sign = true, cls = '' } = {}) => `<span class="ve-bum ${cls}">${EI.coin(16)}<b>${sign ? sgn(amount) : n(amount)}</b></span>`;
export const karmaPill = (k) => (k && k.axis ? `<span class="ve-kp" style="--c:${AXIS[k.axis]?.c}">${(EI[k.axis] || EI.karma)(12)}<b>${esc(axisName(k.axis))} +${n(k.points)}</b></span>` : '');
export const bar = (v, t, { w = 340, h = 10, cls = '' } = {}) => `<span class="ve-bar ${cls}" style="width:${w}px;height:${h}px"><i style="width:${Math.max(t ? Math.min(1, v / t) : 0, v > 0 ? 0.03 : 0) * 100}%"></i></span>`;
export const stamp = (small = false) => `<span class="ve-stamp${small ? ' sm' : ''}"><b>${esc(tr('완료', 'DONE'))}</b><small>CLEAR</small></span>`;
export const tag = (t, c, cls = '') => `<span class="v2-tag v2-tag-sm ${cls}" style="--c:${c};font-size:12px">${esc(t)}</span>`;
export const head = (title, { icon = '', size = 22 } = {}) => `<div class="v2-head" style="--hs:${size}px"><span class="v2-accent" aria-hidden="true"></span>${icon}<span class="v2-head-t">${esc(title)}</span></div>`;
export const closeBtn = () => `<button type="button" class="v2-close" data-ve="close" aria-label="${esc(tr('닫기', 'Close'))}">${EI.close(16)}</button>`;
/** 정가에 줄 긋고 0 bum + 무료(베타) */
export const priceHtml = (q, { size = 30 } = {}) => (q.free
  ? `<span class="ve-price free" style="--ps:${size}px">${EI.coin(Math.round(size * 0.8))}<b>0 bum</b><s>${n(q.listAmount ?? q.listPrice)}</s>${freeBadge()}</span>`
  : `<span class="ve-price" style="--ps:${size}px">${EI.coin(Math.round(size * 0.8))}<b>${n(q.amount ?? q.price)} bum</b></span>`);
export const unitText = (p, id = '') => {
  const u = p.unit;
  if (/^(D-ALL3|W-DAILY|M-WEEKLY)$/.test(id)) return tr(`${p.value} / ${p.target}개`, `${p.value} / ${p.target}`);
  if (u === 'min') return tr(`${n(p.value)} / ${n(p.target)}분`, `${n(p.value)} / ${n(p.target)} min`);
  if (u === 'day') return tr(`${p.value} / ${p.target}일`, `${p.value} / ${p.target} days`);
  if (u === 'kind') return tr(`${p.value} / ${p.target}종`, `${p.value} / ${p.target} kinds`);
  if (u === 'place') return tr(`${p.value} / ${p.target}곳`, `${p.value} / ${p.target} places`);
  return `${n(p.value)} / ${n(p.target)}${tr('회', '')}`;
};
