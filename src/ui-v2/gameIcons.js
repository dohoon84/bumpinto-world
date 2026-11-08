// [game-icons] 공용 게임 아이콘 세트 (24 그리드 · 2px 선 · 반투명 몸통 + 금색 포인트, 인라인 SVG · 외부 라이브러리 없음 · 브랜드 로고 없음)
//   쓰는 곳: PC HUD v3(기본) 액션 바·드롭다운·미니맵·패널, 모바일 ☰ 메뉴 시트·HUD 칩(기본 켜짐).
//   끄기: ?icons=v2 → 예전 아이콘(이 탭에서 기억, ?icons=v3 로 해제).
//   색: 선·몸통 = currentColor, 포인트 = var(--gi-a) (기본 금색), 포인트 테두리(겹침 분리) = var(--gi-k) (기본 남색).
//   클래스: f 반투명 몸통 · s 꽉 찬 currentColor · a 금색+분리 테두리 · ac 금색+선 유지 · an 금색(선 없음) · as 금색 선 · k 남색 점
const KEY = 'bw.icons.v2';
let on = null;
/** 새 아이콘을 쓸지 (?icons=v2 킬 스위치) */
export function giOn() {
  if (on != null) return on;
  try {
    const q = (new URLSearchParams(location.search).get('icons') || '').toLowerCase();
    let ss = null; try { ss = sessionStorage; } catch { /* 막힘 */ }
    if (q === 'v2' || q === 'old' || q === 'off') { try { ss?.setItem(KEY, '1'); } catch { /* noop */ } on = false; }
    else if (q === 'v3' || q === 'new') { try { ss?.removeItem(KEY); } catch { /* noop */ } on = true; }
    else { let v = null; try { v = ss?.getItem(KEY); } catch { /* noop */ } on = v !== '1'; }
  } catch { on = true; }
  return on;
}

const CSS = `.gi{display:block;flex:none;overflow:visible}
.gi .f{fill:currentColor;fill-opacity:.28}.gi .s{fill:currentColor;stroke:none}
.gi .a{fill:var(--gi-a,#ffd54a);stroke:var(--gi-k,#13213a);stroke-width:1.5}
.gi .ac{fill:var(--gi-a,#ffd54a)}.gi .an{fill:var(--gi-a,#ffd54a);stroke:none}
.gi .as{stroke:var(--gi-a,#ffd54a)}.gi .k{fill:var(--gi-k,#13213a);stroke:none}
.gi text{stroke:none;font-family:"Noto Sans KR",system-ui,sans-serif;font-weight:900;text-anchor:middle}`;
let css = false;
function ensureCss() {
  if (css || typeof document === 'undefined') return;
  css = true;
  const st = document.createElement('style'); st.id = 'gi-css'; st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

const BIKE = (bar) => `<circle class="f" cx="6" cy="16" r="3.8"/><circle class="f" cx="18" cy="16" r="3.8"/><path class="as" d="M6 16l3.6-7h6.6M12.2 16 9.6 9m2.6 7 4-7 1.8 7" stroke-width="2.2"/><path d="M8 7.2h3.4${bar}" stroke-width="2"/>`;
export const GI = {
  // 액션 바
  map: '<path class="f" d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20" stroke-width="1.6" opacity=".7"/><path class="a" d="M17.5 14.6s-3.7-3.3-3.7-6.1a3.7 3.7 0 0 1 7.4 0c0 2.8-3.7 6.1-3.7 6.1z"/><circle class="k" cx="17.5" cy="8.5" r="1.3"/>',
  quest: '<rect class="f" x="4" y="4.5" width="16" height="17" rx="3"/><rect class="a" x="8" y="2" width="8" height="5" rx="1.6"/><path d="M8.2 13.8l2.7 2.7 5-5.6" stroke-width="2.6"/>',
  shop: BIKE('M16.2 9l-.8-3h2.8'),
  board: '<rect class="f" x="3" y="4" width="18" height="13" rx="2.5"/><path d="M7 17.5 5.6 21.5M17 17.5l1.4 4"/><path d="M6.8 9h6M6.8 12.5h8.4" stroke-width="1.8"/><circle class="a" cx="17" cy="8.6" r="2.6"/>',
  menu: '<path d="M4 6.5h16M4 17.5h16" stroke-width="2.6"/><path class="as" d="M4 12h16" stroke-width="2.6"/>',
  // 지도·이동
  top: '<path class="f" d="M3.5 14 12 10l8.5 4-8.5 4z"/><path d="M3.5 17.5 12 21.5l8.5-4" stroke-width="1.7" opacity=".6"/><path class="as" d="M12 2.5V8M9 5.5l3 3 3-3" stroke-width="2.4"/>',
  train: '<rect class="f" x="5" y="3" width="14" height="14" rx="3.5"/><rect class="an" x="7.5" y="5.5" width="9" height="4.5" rx="1.2"/><circle class="s" cx="8.8" cy="13.6" r="1.2"/><circle class="s" cx="15.2" cy="13.6" r="1.2"/><path d="M8 17l-2.5 4M16 17l2.5 4M7.2 19.6h9.6"/>',
  globe: '<circle class="f" cx="12" cy="12" r="8.6"/><ellipse cx="12" cy="12" rx="3.6" ry="8.6" stroke-width="1.6"/><path d="M3.4 12h17.2" stroke-width="1.6"/><ellipse class="as" cx="12" cy="12" rx="11" ry="3.4" transform="rotate(-24 12 12)" stroke-width="1.9"/>',
  pin: '<path class="f" d="M12 21.5s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle class="a" cx="12" cy="10.2" r="2.8"/>',
  radar: '<circle class="f" cx="12" cy="12" r="9"/><path class="an" d="M12 12V3a9 9 0 0 1 7.8 4.5z" opacity=".9"/><circle cx="12" cy="12" r="4.6" stroke-width="1.4" opacity=".55"/><circle class="s" cx="12" cy="12" r="1.7"/>',
  // ☰ 메뉴
  user: '<circle class="f" cx="12" cy="8.3" r="4"/><path class="f" d="M4.5 21c.6-4.2 3.6-6.6 7.5-6.6s6.9 2.4 7.5 6.6z"/><circle class="a" cx="18.6" cy="5.6" r="2.4"/>',
  people: '<circle class="f" cx="9" cy="8.4" r="3.4"/><path class="f" d="M2.8 20.2c.5-3.6 3-5.6 6.2-5.6s5.7 2 6.2 5.6z"/><circle class="an" cx="16.8" cy="7.6" r="2.7"/><path class="an" d="M16.6 12.6c2.9 0 4.8 1.9 5.2 5h-4.6c-.3-1.9-1.1-3.5-2.4-4.6.6-.3 1.1-.4 1.8-.4z"/>',
  lang: '<rect class="f" x="2.5" y="4" width="19" height="16" rx="3"/><text class="s" x="8" y="15.6" font-size="8.6">가</text><text class="an" x="16.3" y="15.6" font-size="8.6">A</text>',
  help: '<circle class="f" cx="12" cy="12" r="9"/><path class="as" d="M9.4 9.4a2.7 2.7 0 0 1 5.2 1c0 1.9-2.6 2.2-2.6 4" stroke-width="2.3"/><circle class="an" cx="12" cy="17.4" r="1.3"/>',
  karma: '<path class="ac" d="M12 2.5l2.4 7.1 7.1 2.4-7.1 2.4L12 21.5l-2.4-7.1L2.5 12l7.1-2.4z"/>',
  heart: '<path class="f" d="M12 20.5s-8-4.8-8-10.6A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 8 2.6c0 5.8-8 10.6-8 10.6z"/><path class="as" d="M12 10.8v5.2M9.4 13.4h5.2" stroke-width="2.2"/>',
  door: '<path class="f" d="M5.5 3.5h8v17h-8z"/><circle class="s" cx="11" cy="12.3" r="1.1"/><path class="as" d="M14 12h7.5M18.2 8.7 21.5 12l-3.3 3.3" stroke-width="2.3"/>',
  sun: '<circle class="ac" cx="12" cy="12" r="4.2"/><path class="as" d="M12 2.5V5m0 14v2.5M2.5 12H5m14 0h2.5M5.3 5.3l1.8 1.8m9.8 9.8 1.8 1.8M5.3 18.7l1.8-1.8m9.8-9.8 1.8-1.8" stroke-width="1.9"/>',
  caret: '<path d="M7 10l5 5 5-5" stroke-width="2.4"/>',
  // 미니맵 가장자리
  rotate: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" stroke-width="2.6"/><path class="as" d="M19.5 3.5v4.2h-4.2" stroke-width="2.6"/>',
  compass: '<path class="ac" d="M12 2.5l4.2 9.5H7.8z"/><path class="f" d="M7.8 12h8.4L12 21.5z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" stroke-width="3"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke-width="3"/>',
  minus: '<path d="M5 12h14" stroke-width="3"/>',
  // 경제 · 패널
  card: '<rect class="f" x="2.5" y="5" width="19" height="14" rx="2.6"/><path d="M2.5 9.6h19" stroke-width="2.6"/><rect class="an" x="5.5" y="13" width="4.6" height="3.2" rx=".8"/>',
  bag: '<path class="f" d="M5.5 8h13l1 12.5h-15z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/><rect class="an" x="10" y="12.4" width="4" height="3.2" rx=".8"/>',
  bike: BIKE('M16.2 9l-.8-3h2.8'),
  roadbike: BIKE('M16.2 9l-.6-3h2.6a1.8 1.8 0 0 1 0 3.4'),
  scooter: '<circle class="f" cx="6" cy="17.4" r="2.9"/><circle class="f" cx="18.5" cy="17.4" r="2.9"/><path class="ac" d="M2.8 16c0-3 2.2-5 5.2-5h3.6c.8 0 1.4.6 1.4 1.4V16z"/><path d="M5.6 8.4h4.6" stroke-width="2.4"/><path d="M13 16h4.2l-1.8-10.5H13m2.4 0h2.8"/>',
  car: '<path class="f" d="M2.5 16.5v-4L5.3 7h13.4l2.8 5.5v4z"/><path class="an" d="M6.6 8.6h4.4v3.6H5zm6.4 0h4.4l1.6 3.6h-6z"/><circle class="s" cx="7" cy="17" r="2.2"/><circle class="s" cx="17" cy="17" r="2.2"/>',
  clock: '<circle class="f" cx="12" cy="12" r="9"/><path class="as" d="M12 7v5.2l3.4 2" stroke-width="2.3"/>',
  lock: '<rect class="f" x="5" y="10.5" width="14" height="10.5" rx="2.6"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle class="an" cx="12" cy="15.7" r="1.7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke-width="2.8"/>',
  cal: '<rect class="f" x="3.5" y="5" width="17" height="15.5" rx="2.6"/><path d="M3.5 9.6h17M8 3v4M16 3v4"/><rect class="an" x="13" y="13" width="4.2" height="4.2" rx="1"/>',
  trophy: '<path class="ac" d="M7 3.5h10v5.5a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.5a3 3 0 0 0 3 4.6M17 5.5h2.5a3 3 0 0 1-3 4.6M12 14v3.6M8.5 20.5h7M9.6 17.6h4.8"/>',
  pushpin: '<path class="ac" d="M9 3h6l-1 5.6 3 3.2H7l3-3.2z"/><path d="M12 11.8v9"/>',
  megaphone: '<path class="f" d="M3.5 9.8v4.4h3.2l8.3 4.6V5.2L6.7 9.8z"/><path class="as" d="M18 9.2a4 4 0 0 1 0 5.6M20.4 6.6a7.6 7.6 0 0 1 0 10.8" stroke-width="2"/>',
  pencil: '<path class="ac" d="M15.5 4.3l4.2 4.2L9 19.2H4.8V15z"/><path d="M13.3 6.5l4.2 4.2"/>',
  chat: '<path class="f" d="M4 5h16v11h-9l-4.5 4v-4H4z"/><path class="as" d="M8 9.4h8M8 12.4h5" stroke-width="2"/>',
  paw: '<circle class="s" cx="6.3" cy="10" r="2"/><circle class="s" cx="10.2" cy="6.4" r="2"/><circle class="s" cx="13.8" cy="6.4" r="2"/><circle class="s" cx="17.7" cy="10" r="2"/><path class="ac" d="M12 11.5c2.8 0 5.3 3.4 5.3 5.8 0 1.8-1.4 2.7-3 2.7-1 0-1.5-.5-2.3-.5s-1.3.5-2.3.5c-1.6 0-3-.9-3-2.7 0-2.4 2.5-5.8 5.3-5.8z"/>',
  expand: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5" stroke-width="2.4"/><rect class="an" x="9" y="9" width="6" height="6" rx="1.4"/>',
  walk: '<path class="f" d="M8.4 3.2c1.8 0 2.8 1.9 2.8 4.3 0 2-.9 3.8-2.6 3.8S5.9 9.9 5.9 7.9c0-2.7 1-4.7 2.5-4.7z"/><path class="ac" d="M15.6 8.8c1.6 0 2.6 1.7 2.6 3.9 0 2-.9 3.7-2.5 3.7s-2.6-1.6-2.6-3.6c0-2.4.9-4 2.5-4z"/><path d="M7.2 14.6h2.8M14.4 20h2.6" stroke-width="2.6"/>',
  rain: '<path class="f" d="M7 14a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1 3.5 3.5 0 0 1 0 7z"/><path d="M8 17l-1 2.6M12 17l-1 2.6M16 17l-1 2.6" stroke="#7cc4ff" stroke-width="2"/>',
};
/** 아이콘 SVG 문자열. cls 로 추가 클래스 */
export function gicon(k, s = 24, cls = '') {
  ensureCss();
  return `<svg class="gi${cls ? ' ' + cls : ''}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GI[k] || ''}</svg>`;
}
