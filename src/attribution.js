// [attrib] 화면 아래 출처 표기: "© CrazyLabs · 소스 공개 · 지도 © OpenStreetMap" 까지는 늘 보이고,
//   나머지(ODbL · Overture · 브이월드 · 상가 …)는 ⓘ 버튼 뒤에 접어 둔다. 누르면 오른쪽으로 펼쳐지고, 다시 누르거나 바깥을 누르면 접힌다
//   (법적 표기라 문구·링크는 하나도 빼지 않는다 — 접기만 한다)
import { hudButton } from './ui-keys.js';

const ICON = '<svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M7 6.2v3.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="7" cy="4.1" r=".85" fill="currentColor"/></svg>';

export function mountAttribution(el) {
  el.innerHTML = '<span class="attr-main"></span><button type="button" class="attr-more" aria-controls="attr-rest" aria-expanded="false"></button><span class="attr-rest" id="attr-rest"></span>';
  const main = el.querySelector('.attr-main'), btn = el.querySelector('.attr-more'), rest = el.querySelector('.attr-rest');
  btn.innerHTML = ICON;
  let open = false, en = false;

  function sync() {
    el.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    const label = open ? (en ? 'Hide other attributions' : '나머지 출처 접기') : (en ? 'Show other attributions' : '나머지 출처 보기');
    btn.setAttribute('aria-label', label); btn.title = label;
    // 접힌 동안엔 안의 링크로 Tab 이동·스크린리더 읽기가 안 되게
    rest.inert = !open; rest.setAttribute('aria-hidden', String(!open));
    // 폭 애니메이션: 펼칠 땐 실제 글자 폭까지 (화면을 넘지 않게)
    rest.style.maxWidth = open ? `${Math.min(rest.scrollWidth + 2, Math.max(0, innerWidth - rest.getBoundingClientRect().left - 8))}px` : '0px';
  }
  const setOpen = (v) => { if (open === !!v) return; open = !!v; sync(); };

  // 마우스 클릭으론 포커스를 가져가지 않고(WASD·Space 가 게임으로), Tab 으로 왔을 땐 Enter/Space 가 게임 단축키로 새지 않게
  hudButton(btn);
  btn.addEventListener('click', () => setOpen(!open));
  btn.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); btn.blur(); } });
  document.addEventListener('pointerdown', (e) => { if (open && !el.contains(e.target)) setOpen(false); }, { capture: true });
  addEventListener('resize', () => { if (open) sync(); });

  return {
    el,
    get open() { return open; },
    setOpen,
    /** mainHtml: 늘 보이는 부분(… OpenStreetMap 까지), restHtml: ⓘ 뒤에 접히는 나머지 */
    set(mainHtml, restHtml, isEn) {
      en = !!isEn;
      main.innerHTML = mainHtml;
      rest.innerHTML = restHtml;
      btn.hidden = !restHtml;
      sync();
    },
  };
}
