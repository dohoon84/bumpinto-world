// [ui-v2] 06 HUD: 기존 HUD DOM(#hud · #buttons · #top-right-bar)을 그대로 두고 v2 베이스라인으로 정렬(CSS) +
//   우상단 버튼의 이모지를 키트 아이콘(원본 벡터)으로 바꾼다. game.js 가 버튼 글자를 다시 쓰면(언어 · 시점 전환) 다시 꾸민다.
import { ICON } from './kit.js';

const BTN_ICON = { 'btn-view': () => ICON.map(16), 'btn-home': () => ICON.train(16), 'btn-globe': () => ICON.globe(16), 'btn-dogpark': () => ICON.dog(16) };
const strip = (t) => String(t || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();

function decorate(btn) {
  const mk = BTN_ICON[btn.id];
  if (btn.querySelector(':scope > .v2-ic') || !btn.textContent.trim()) return;
  const label = strip(btn.textContent);
  btn.innerHTML = `${mk ? mk() : ''}<span class="v2-chip-t"></span>`;
  btn.querySelector('.v2-chip-t').textContent = label;
}

export function mountHudV2() {
  const bar = document.getElementById('buttons');
  if (!bar) return;
  const run = () => { mo.disconnect(); for (const b of bar.querySelectorAll(':scope > button')) decorate(b); mo.observe(bar, { childList: true, subtree: true, characterData: true }); };
  const mo = new MutationObserver(run);
  run();
}
