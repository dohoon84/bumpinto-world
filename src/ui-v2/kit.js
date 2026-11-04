// [ui-v2] 게임 UI 키트 (Figma 14-3): 원본 벡터 아이콘 · DOM 헬퍼 · 코인 플라이 보상 효과.
//   아이콘은 Figma 키트(lib2.js SVG)와 같은 패스. 브랜드 마크는 Google 로그인 버튼의 공식 G 하나뿐(google.js).
import { tr } from '../i18n.js';

let uid = 0;
export const ICON = {
  coin: (s = 24) => { const id = `v2cg${++uid}`; return `<svg class="v2-ic" width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#ffd23f"/><stop offset="1" stop-color="#f5a200"/></linearGradient></defs><circle cx="32" cy="35" r="27" fill="#b8680a"/><circle cx="32" cy="31" r="27" fill="url(#${id})"/><circle cx="32" cy="31" r="20.5" fill="none" stroke="#d98a00" stroke-width="3"/><rect x="22.5" y="15" width="7" height="31" rx="3.5" fill="#8a4b00"/><circle cx="35.5" cy="35" r="7.6" fill="none" stroke="#8a4b00" stroke-width="6.4"/><path d="M13 25 A20 20 0 0 1 29 10" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity=".75"/></svg>`; },
  map: (s = 16, c = '#122033') => `<svg class="v2-ic" width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5 L5.5 2 L10.5 3.5 L14.5 2 V12.5 L10.5 14 L5.5 12.5 L1.5 14 Z" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><path d="M5.5 2 V12.5 M10.5 3.5 V14" stroke="${c}" stroke-width="1.4"/></svg>`,
  train: (s = 16, c = '#122033') => `<svg class="v2-ic" width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="1.5" width="10" height="10.5" rx="2.4" fill="none" stroke="${c}" stroke-width="1.6"/><rect x="4.8" y="3.6" width="6.4" height="3.4" rx=".8" fill="${c}"/><circle cx="5.8" cy="9.4" r=".9" fill="${c}"/><circle cx="10.2" cy="9.4" r=".9" fill="${c}"/><path d="M4.5 15 L6 12 M11.5 15 L10 12" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  globe: (s = 16, c = '#122033') => `<svg class="v2-ic" width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.3" fill="none" stroke="${c}" stroke-width="1.6"/><ellipse cx="8" cy="8" rx="2.8" ry="6.3" fill="none" stroke="${c}" stroke-width="1.3"/><path d="M1.9 8 H14.1" stroke="${c}" stroke-width="1.3"/></svg>`,
  board: (s = 16, c = '#122033') => `<svg class="v2-ic" width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="12" rx="2" fill="none" stroke="${c}" stroke-width="1.6"/><rect x="5.5" y="1" width="5" height="3" rx="1" fill="${c}"/><path d="M5 8 H11 M5 11 H9" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  heart: (s = 16, c = '#f5a200') => `<svg class="v2-ic" width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14 C3 10.5 1.2 8 1.2 5.6 A3.3 3.3 0 0 1 8 4.2 A3.3 3.3 0 0 1 14.8 5.6 C14.8 8 13 10.5 8 14 Z" fill="${c}"/></svg>`,
  lock: (s = 12, c = '#9eb4c6') => `<svg class="v2-ic" width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="2" fill="${c}"/><path d="M5.2 7 V5 A2.8 2.8 0 0 1 10.8 5 V7" fill="none" stroke="${c}" stroke-width="1.7"/></svg>`,
  close: (s = 16, c = '#e8f2f8') => `<svg class="v2-ic" width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 L12 12 M12 4 L4 12" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  check: (s = 16, c = '#ffffff') => `<svg class="v2-ic" width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 L6.6 11.5 L12.5 4.8" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  dog: (s = 16, c = '#122033') => `<svg class="v2-ic" width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6.5 L3.6 2.6 L6 4.6 H10 L12.4 2.6 L13 6.5 C13.6 10.6 11.4 13.5 8 13.5 C4.6 13.5 2.4 10.6 3 6.5 Z" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="6.2" cy="8" r=".95" fill="${c}"/><circle cx="9.8" cy="8" r=".95" fill="${c}"/><path d="M7 10.6 H9 L8 11.6 Z" fill="${c}"/></svg>`,
  door: (s = 16, c = '#122033') => `<svg class="v2-ic" width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2 H3.5 V14 H9.5" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 8 H14 M11.5 5.5 L14 8 L11.5 10.5" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

/** 신분당선 2색 마크(빨강|주황) */
export const lineMark = (w = 24, h = 8) => `<span class="v2-linemark" style="width:${w}px;height:${h}px" aria-hidden="true"></span>`;

export function el(tag, cls = '', html = '') {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html) n.innerHTML = html;
  return n;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 게임 패널 제목: 왼쪽 4px 신분당선 그라디언트 바 + 금색 제목 */
export const headHtml = (title, { size = 22, icon = '' } = {}) => `<div class="v2-head" style="--hs:${size}px"><span class="v2-accent" aria-hidden="true"></span>${icon}<span class="v2-head-t">${esc(title)}</span></div>`;

/** 색 태그 (bg 18% · 테두리 55% · 글자 100%) */
export const tagHtml = (t, col, { cls = '', size = 12 } = {}) => `<span class="v2-tag ${cls}" style="--c:${col};font-size:${size}px">${esc(t)}</span>`;

/** 우측 HUD 라이트 칩 (높이 40) */
export function chipBtn(label, iconHtml = '', { cls = '', title = '' } = {}) {
  const b = el('button', `v2-chip v2-chip-btn ${cls}`.trim(), `${iconHtml}<span class="v2-chip-t">${esc(label)}</span>`);
  b.type = 'button';
  if (title) b.title = title;
  return b;
}

/**
 * 계정 칩 (월드·역 선택 · 입장 카드 · 로딩 왼쪽 위). 이름은 guestChip 그대로 두고, econ 'session' 이벤트를 받아
 * 로그인 뒤에는 '이름 · 구글 계정 연결됨' 으로 바뀐다(이미 화면에 있는 칩도 함께 갱신).
 */
let acctSession = null, acctSub = false;
function acctHtml(s) {
  if (!s || s.isGuest) return `<span class="v2-acct-q" aria-hidden="true">?</span><b>${esc(tr('게스트', 'Guest'))}</b><span class="v2-sub v2-sub-muted">${esc(tr('이 기기에만 저장', 'Saved on this device'))}</span>`;
  const name = s.displayName || tr('내 계정', 'My account');
  return `<span class="v2-acct-q on" aria-hidden="true">${esc([...name][0] || '•')}</span><b>${esc(name)}</b><span class="v2-sub v2-sub-muted">${esc(tr('구글 계정 연결됨', 'Google account linked'))}</span>`;
}
function paintAcct() { document.querySelectorAll('.v2-acct').forEach((c) => { c.innerHTML = acctHtml(acctSession); c.classList.toggle('is-guest', !acctSession || acctSession.isGuest); }); }
function watchAcct() {
  if (acctSub) return; acctSub = true;
  import('./econ/index.js').then(({ econ }) => {
    econ.on('session', (s) => { acctSession = s; paintAcct(); });
    econ.getSession().then((s) => { acctSession = s; paintAcct(); }).catch(() => {});
  }).catch(() => {});
}
export function guestChip() {
  watchAcct();
  const c = el('div', 'v2-chip v2-acct', acctHtml(acctSession));
  c.classList.toggle('is-guest', !acctSession || acctSession.isGuest);
  return c;
}

/**
 * 코인 플라이 (키트 05a → 05a2 → 05b): from 위치에서 코인 n개가 별 모양으로 퍼졌다가 to 칩으로 날아가 흡수, 칩 금색 발광.
 * DOM + CSS transform 만 쓴다(WebGL 드로우콜 없음). 끝나면 노드를 모두 지운다.
 */
export function coinFly(from, to, { count = 8, amount = '' } = {}) {
  const fr = from.getBoundingClientRect?.() || from, tr2 = to.getBoundingClientRect();
  const fx = (fr.left ?? fr.x) + (fr.width || 0) / 2, fy = (fr.top ?? fr.y) + (fr.height || 0) / 2;
  const tx = tr2.left + 20, ty = tr2.top + tr2.height / 2;
  const layer = el('div', 'v2-coinfly');
  document.body.appendChild(layer);
  const coins = [];
  for (let i = 0; i < count; i++) {
    const c = el('span', 'v2-coinfly-c', ICON.coin(28));
    c.style.left = `${fx - 14}px`; c.style.top = `${fy - 14}px`;
    layer.appendChild(c);
    coins.push(c);
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      coins.forEach((c, i) => {
        const a = (i / count) * Math.PI * 2 - Math.PI / 2, r = 54 + (i % 2) * 18;
        c.style.transform = `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px) scale(1.1)`;
      });
      setTimeout(() => {
        coins.forEach((c, i) => {
          c.style.transitionDuration = '.6s';
          c.style.transitionDelay = `${i * 0.04}s`;
          c.style.transform = `translate(${tx - fx}px, ${ty - fy}px) scale(.55)`;
          c.style.opacity = '0.2';
        });
        setTimeout(() => {
          to.classList.add('v2-glow');
          if (amount) {
            const badge = el('span', 'v2-coinfly-badge', esc(amount));
            badge.style.left = `${tr2.right - 8}px`; badge.style.top = `${tr2.top - 10}px`;
            layer.appendChild(badge);
          }
          setTimeout(() => { to.classList.remove('v2-glow'); layer.remove(); resolve(); }, 900);
        }, 600 + count * 40);
      }, 520);
    });
  });
}
