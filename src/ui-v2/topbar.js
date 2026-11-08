// [ui-v2] 입장 전 화면(시작 · 월드 · 역 · 입장 · 로딩)의 상단 HUD 줄. 게임 HUD 와 같은 베이스라인:
//   1행 top 10 · 높이 40 · 칩 간격 8 · 좌우 여백 12 (spec 3.1). 게임에 들어가면 숨김(게임 HUD 가 대신).
import { el, ICON, esc, chipBtn } from './kit.js';
import { tr, toggleLang, isEn } from '../i18n.js';
import { fetchLiveStats, telemetryText } from './data.js';

let bar = null;
function ensure() {
  if (bar) return bar;
  bar = el('div', 'v2-top');
  bar.id = 'v2-top';
  bar.innerHTML = '<div class="v2-row v2-row-l"></div><div class="v2-row v2-row-r"></div>';
  document.body.appendChild(bar);
  return bar;
}
export function setTop(left = [], right = []) {
  const b = ensure();
  b.hidden = false;
  b.querySelector('.v2-row-l').replaceChildren(...left.filter(Boolean));
  b.querySelector('.v2-row-r').replaceChildren(...right.filter(Boolean));
}
export function hideTop() { if (bar) bar.hidden = true; }

export function backChip(label, onClick) {
  const b = el('button', 'v2-chip v2-chip-btn v2-back', `<span class="v2-back-arrow" aria-hidden="true">‹</span><span class="v2-chip-t">${esc(label)}</span>`);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function langChip() {
  const b = chipBtn(isEn() ? 'KO' : 'EN', ICON.globe(16), { title: 'Switch UI Language (KO / EN)', cls: 'v2-lang' });
  b.addEventListener('click', () => toggleLang());
  return b;
}

export function contributeChip(href) {
  const a = el('a', 'v2-chip v2-chip-btn v2-chip-gold', `${ICON.heart(16)}<span class="v2-chip-t">${esc(tr('함께 만들기', 'Contribute'))}</span>`);
  a.href = href; a.target = '_blank'; a.rel = 'noopener';
  return a;
}

/** 다크 LIVE 칩: 점 · LIVE · 위성 관측 문구 · 서브칩 2개(산책 중 / 등록 입주민). 값은 지구본 /stats 그대로 */
export function liveChip(region) {
  const c = el('div', 'v2-chip v2-live');
  c.innerHTML = `<span class="v2-live-dot" aria-hidden="true"></span><b class="v2-live-k">LIVE</b><span class="v2-live-t">${esc(telemetryText(region))}</span>
    <span class="v2-dsub"><small>${esc(tr('거리 산책 중', 'Exploring now'))}</small><b data-k="a">…</b></span>
    <span class="v2-dsub"><small>${esc(tr('등록 입주민', 'Citizens'))}</small><b data-k="b">…</b></span>`;
  fetchLiveStats().then((s) => {
    c.querySelector('[data-k="a"]').textContent = s.a;
    c.querySelector('[data-k="b"]').textContent = s.b;
  });
  return c;
}
