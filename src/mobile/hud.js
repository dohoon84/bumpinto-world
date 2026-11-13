// [mobile] 모바일 HUD (Figma 프로토타입 v4 · 모바일 HUD 기준)
//   - 왼쪽 위 작은 칩(시각), 오른쪽 위 아이콘 토글(BGM · 휴대폰 · 지도) + 접속자 칩 + ☰ 메뉴(옮겨 온 버튼들)
//   - 왼쪽 아래 가상 조이스틱, 오른쪽 아래 행동 버튼(타기/내리기 상황별 · 달리기 · 앉기 · 이모트), 아래 가운데 '말 걸기'
//   - 스타베이스: 가운데 배너·떠 있는 칩 대신 옆에 이벤트 버튼 하나 → 이벤트 시트(기록 · 로드스터 쇼 · 쇼 카메라 · 발사 상태)
// 기존 PC DOM 은 지우지 않고 body.mobile CSS 로 숨기거나 옮긴다. 버튼은 원래 버튼을 대신 눌러 준다(.click / 키 입력).
import { virtualPad } from '../input.js';
import { isEn, onLangChange } from '../i18n.js';
import { resetDocScroll } from './scrollLock.js'; // [mobile-scroll-lock]
import { canFullscreen, isFullscreen, toggleFullscreen, onFullscreenChange } from './fullscreen.js';
import { GI, gicon, giOn } from '../ui-v2/gameIcons.js'; // [game-icons]

const t = (ko, en) => (isEn() ? en : ko);
const I = {
  music: '<path d="M9 18 V6 L20 4 V16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.8" fill="currentColor"/><circle cx="17.5" cy="16" r="2.8" fill="currentColor"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M10.5 18.5 H13.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  map: '<path d="M3 6 L9 3.5 L15 6 L21 3.5 V18 L15 20.5 L9 18 L3 20.5 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 3.5 V18 M15 6 V20.5" stroke="currentColor" stroke-width="1.8"/>',
  menu: '<path d="M4 7 H20 M4 12 H20 M4 17 H20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  users: '<circle cx="9" cy="8.5" r="3.2" fill="currentColor"/><path d="M3.5 19 C3.5 14.8 6 13.2 9 13.2 C12 13.2 14.5 14.8 14.5 19 Z" fill="currentColor"/><circle cx="16.5" cy="9" r="2.6" fill="currentColor" opacity=".7"/><path d="M14 13.6 C17.6 13.2 20.5 14.6 20.5 19 H15.6" fill="currentColor" opacity=".7"/>',
  run: '<circle cx="14.5" cy="4.5" r="2.2" fill="currentColor"/><path d="M10 21 L12.5 15 L15.5 17.5 L16.5 22 M8 12 L11 8.5 L15 9.5 L17.5 13 L20 13.5 M12.5 15 L13.5 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12 H7 M3 15.5 H8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  sit: '<circle cx="9" cy="4.5" r="2.3" fill="currentColor"/><path d="M9 8 V13.5 H15.5 L17 20 M9 13.5 L7 20 M5 20 H19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  emote: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="9" cy="10" r="1.4" fill="currentColor"/><circle cx="15" cy="10" r="1.4" fill="currentColor"/><path d="M8 14.2 C9.5 16.8 14.5 16.8 16 14.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  bike: '<circle cx="6" cy="16.5" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16.5" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 16.5 L10 9 H15.5 L18 16.5 M10 9 L12.5 16.5 H6 M14 6 H17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  off: '<path d="M10 4 H5 V20 H10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 12 H21 M17 8 L21 12 L17 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  chat: '<path d="M4 5 H20 V16 H11 L6.5 20 V16 H4 Z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/>',
  rocket: '<path d="M12 2.5 C15.5 5 17 9 16.2 14 H7.8 C7 9 8.5 5 12 2.5 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="9" r="1.9" fill="currentColor"/><path d="M7.8 12 L5 16.5 L8.5 16 M16.2 12 L19 16.5 L15.5 16 M10 17 L12 21.5 L14 17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>',
  close: '<path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  flag: '<path d="M6 21 V4 M6 4 H18 L15.5 8 L18 12 H6" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"/>',
  cam: '<rect x="3" y="7" width="18" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 7 L10 4.5 H14 L15.5 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.4" fill="none" stroke="currentColor" stroke-width="2"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 10 H19 M8.5 20.5 L10 17 M15.5 20.5 L14 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="13.5" r="1.2" fill="currentColor"/><circle cx="15" cy="13.5" r="1.2" fill="currentColor"/>',
  globe: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12 H21 M12 3 C15 6 15 18 12 21 C9 18 9 6 12 3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  heart: '<path d="M12 20 C5 15 3 11.5 3 8.5 A4.5 4.5 0 0 1 12 6.5 A4.5 4.5 0 0 1 21 8.5 C21 11.5 19 15 12 20 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  board: '<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 9 H16 M8 12.5 H16 M8 16 H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  door: '<path d="M14 4 H6 V20 H14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M11 12 H20 M17 9 L20 12 L17 15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  bus: '<rect x="5" y="3" width="14" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 11 H19 M8 18 V21 M16 18 V21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8.5" cy="14.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="14.5" r="1.2" fill="currentColor"/>',
  bag: '<path d="M6 8 H18 L19 20 H5 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8 V6.5 A3 3 0 0 1 15 6.5 V8" fill="none" stroke="currentColor" stroke-width="2"/>',
  paw: '<circle cx="7" cy="9" r="2" fill="currentColor"/><circle cx="12" cy="6.5" r="2" fill="currentColor"/><circle cx="17" cy="9" r="2" fill="currentColor"/><path d="M12 11.5 C8.5 11.5 6.5 15.5 7.5 18 C8.5 20 15.5 20 16.5 18 C17.5 15.5 15.5 11.5 12 11.5 Z" fill="currentColor"/>',
  expand: '<path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  log: '<path d="M4 5 H20 V16 H11 L6.5 20 V16 H4 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 9 H16 M8 12.5 H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  rain: '<path d="M7 14 A4 4 0 0 1 7.5 6 A5 5 0 0 1 17 7 A3.5 3.5 0 0 1 17 14 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 17 L7 20 M12 17 L11 20 M16 17 L15 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  sun: '<circle cx="12" cy="12" r="4" fill="#f5a200"/><path d="M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.3 5.3 L7 7 M17 17 L18.7 18.7 M5.3 18.7 L7 17 M17 7 L18.7 5.3" stroke="#f5a200" stroke-width="2" stroke-linecap="round"/>',
  moon: '<path d="M19 14.5 A7.5 7.5 0 1 1 9.5 5 A6 6 0 0 0 19 14.5 Z" fill="#ffc83d"/>',
  cloud: '<path d="M7 18 A4.5 4.5 0 0 1 7 9 A5.5 5.5 0 0 1 17.5 10 A4 4 0 0 1 17 18 Z" fill="#8fa3bb"/>',
  snow: '<path d="M12 3 V21 M4.2 7.5 L19.8 16.5 M4.2 16.5 L19.8 7.5" stroke="#6fb2e8" stroke-width="2" stroke-linecap="round"/>',
  bell: '<path d="M6 16 V11 A6 6 0 0 1 18 11 V16 L19.5 18 H4.5 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 20.5 A2 2 0 0 0 14 20.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  taxi: '<path d="M5 16 V12 L7 7 H17 L19 12 V16 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 4 H15 M5 12 H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="16.5" r="1.6" fill="currentColor"/><circle cx="16" cy="16.5" r="1.6" fill="currentColor"/>',
  stop: '<path d="M8.5 3 H15.5 L21 8.5 V15.5 L15.5 21 H8.5 L3 15.5 V8.5 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 12 H16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  hourglass: '<path d="M6 3 H18 M6 21 H18 M7.5 3 C7.5 9 16.5 9 16.5 12 C16.5 15 7.5 15 7.5 21 M16.5 3 C16.5 9 7.5 9 7.5 12 C7.5 15 16.5 15 16.5 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
};
const svg = (k, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;
// [game-icons] ☰ 메뉴 시트 · 가방 · 나가기는 공용 게임 아이콘(기본). ?icons=v2 이면 예전 선 아이콘
const MENU_GI = { 'btn-view': 'top', 'presence-status': 'people', 'lang-launcher': 'lang', 'account-chip': 'user', 'chat-log-toggle': 'chat' };
const gsvg = (k, s = 22, id = '') => { const g = MENU_GI[id] || k; return giOn() && GI[g] ? gicon(g, s, 'm-gi') : svg(k, s); };
const $ = (id) => document.getElementById(id);
const shown = (el) => !!el && !el.hidden && el.style.display !== 'none' && el.getClientRects().length > 0; // fixed 요소는 offsetParent 가 null 이라 rect 로 본다

function pressKey(code, holdMs = 60) {
  const o = { code, key: code.replace(/^Key/, '').toLowerCase(), bubbles: true };
  dispatchEvent(new KeyboardEvent('keydown', o));
  setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', o)), holdMs);
}

export function mountMobileHud({ handset } = {}) {
  const root = document.createElement('div');
  root.id = 'm-hud';
  const head = (ko, en, extra = '') => `<div class="m-sheet-head"><span class="m-h"><i class="m-accent"></i><b>${t(ko, en)}</b></span>${extra}<button type="button" class="m-x" data-close aria-label="${t('닫기', 'Close')}">${svg('close', 16)}</button></div>`;
  root.innerHTML = `
    <div class="m-top-l">
      <div class="m-chip m-profile"><span class="m-avatar"></span><i class="m-div"></i><span class="m-wx"></span><span class="m-clock">--:--</span></div>
    </div>
    <div class="m-row2-l">
      <button type="button" class="m-tg m-bag" data-act="bag" aria-label="${t('가방', 'Bag')}">${gsvg('bag', 20)}<i class="m-count" hidden></i></button>
      <div class="m-chip m-ride-strip" hidden></div>
      <button type="button" class="m-chip m-stop-chip" data-act="stop" hidden>${svg('bus', 18)}<b></b><small></small><span class="m-bus-wait" hidden></span></button>
    </div>
    <div class="m-top-r">
      <button type="button" class="m-tg" data-tg="bgm" aria-label="BGM">${svg('music', 20)}</button>
      <button type="button" class="m-tg" data-tg="phone" aria-label="${t('휴대폰', 'Phone')}">${svg('phone', 20)}<i class="m-badge" hidden></i></button>
      <button type="button" class="m-tg" data-tg="map" aria-label="${t('지도', 'Map')}">${svg('map', 20)}</button>
      <button type="button" class="m-chip m-live" data-act="presence"><i class="m-live-dot"></i>${svg('users', 16)}<b class="m-live-n"></b></button>
      <button type="button" class="m-tg m-menu-btn" data-tg="menu" aria-label="${t('메뉴', 'Menu')}">${svg('menu', 20)}</button>
    </div>
    <button type="button" id="m-event-btn" class="m-tg" data-tg="event" aria-label="${t('이벤트', 'Events')}" hidden>${svg('rocket', 20)}<i class="m-badge m-live-badge" hidden></i></button>
    <div id="m-joy" aria-hidden="true"><svg class="m-joy-arrows" viewBox="0 0 112 112" aria-hidden="true"><path d="M56 12 L61 19 H51 Z M56 100 L61 93 H51 Z M12 56 L19 51 V61 Z M100 56 L93 51 V61 Z" fill="rgba(255,255,255,.85)"/></svg><div id="m-joy-knob"></div></div>
    <div class="m-actions">
      <button type="button" class="m-act m-act-ride" data-act="ride" hidden>${svg('bike', 26)}<span></span></button>
      <button type="button" class="m-act m-act-ride2" data-act="ride2" hidden></button>
      <button type="button" class="m-act m-act-ride3" data-act="ride3" hidden></button>
      <button type="button" class="m-act m-act-run" data-act="run">${svg('run', 20)}<span>${t('달리기', 'Run')}</span></button>
      <button type="button" class="m-act m-act-sit" data-act="sit">${svg('sit', 20)}<span>${t('앉기', 'Sit')}</span></button>
      <button type="button" class="m-act m-act-emote" data-tg="emote">${svg('emote', 20)}<span>${t('이모트', 'Emote')}</span></button>
    </div>
    <div class="m-chat-toast" aria-live="polite"></div>
    <button type="button" class="m-chip m-talk" data-act="talk">${svg('chat', 18)}<span>${t('채팅', 'Chat')}</span><i class="m-count" hidden></i></button>
    <div class="m-chat-panel" hidden>
      <div class="m-sheet-head"><span class="m-h"><i class="m-accent"></i><b>${t('주변 채팅', 'Nearby chat')}</b></span><button type="button" class="m-x" data-chat-close aria-label="${t('닫기', 'Close')}">${svg('close', 16)}</button></div>
      <div class="m-chat-hist"></div>
      <div class="m-chat-form-slot"></div>
    </div>
    <div class="m-scrim" hidden></div>
    <div class="m-sheet m-menu-sheet" data-sheet="menu" hidden>
      ${head('메뉴', 'Menu', `<button type="button" class="m-leave" data-menu="btn-leave">${gsvg('door', 16)}<span>${t('나가기', 'Leave')}</span></button>`)}
      <div class="m-menu-body"></div>
      <div class="m-attr"></div>
    </div>
    <div class="m-sheet m-map-sheet" data-sheet="map" hidden>
      <div class="m-sheet-head"><div class="m-seg" role="tablist"><button type="button" class="on" data-maptab="map">${t('지도', 'Map')}</button><button type="button" data-maptab="stop">${t('정류장', 'Stops')}</button></div><button type="button" class="m-x" data-close aria-label="${t('닫기', 'Close')}">${svg('close', 16)}</button></div>
      <div class="m-map-pane" data-pane="map"><div class="m-map-box"></div><p class="m-cap m-map-cap"></p><div class="m-stop-card"></div></div>
      <div class="m-map-pane" data-pane="stop" hidden><div class="m-stop-card is-full"></div></div>
    </div>
    <div class="m-sheet m-event-sheet" data-sheet="event" hidden>
      ${head('이벤트 · 스타베이스', 'Events · Starbase')}
      <div class="m-ev-record">${svg('flag', 18)}<span class="m-ev-rec-k">0–60 mph</span><span class="m-ev-rec-v"></span><em>${t('연출 기록', 'Scripted')}</em></div>
      <div class="m-ev-row">${svg('rocket', 18)}<span>${t('로드스터 쇼', 'Roadster show')}</span><button type="button" class="m-btn-s" data-ev="rs-start">${t('보기', 'Watch')}</button></div>
      <div class="m-ev-row">${svg('cam', 18)}<span>${t('쇼 카메라', 'Show camera')}</span><button type="button" class="m-switch" data-ev="cam" role="switch" aria-checked="false"><i></i></button></div>
      <div class="m-ev-row">${svg('hourglass', 18)}<span>${t('발사', 'Launch')}</span><button type="button" class="m-btn-s m-ev-launch" data-ev="ls-start"></button></div>
    </div>
    <div class="m-sheet m-emote-sheet" data-sheet="emote" hidden>
      ${head('이모트', 'Emotes')}
      <div class="m-emote-grid"></div>
    </div>
    <button type="button" class="m-phone-x" aria-label="${t('휴대폰 닫기', 'Close phone')}" hidden>${svg('close', 16)}</button>`;
  document.body.appendChild(root);
  const q = (s) => root.querySelector(s);

  // ---- 시트 / 토글 ----
  let open = '';
  const scrim = q('.m-scrim');
  const closePresence = () => { const pp = $('presence-panel'); if (pp && !pp.hidden) $('presence-status')?.click(); };
  const setOpen = (name) => {
    open = open === name ? '' : name;
    for (const s of root.querySelectorAll('[data-sheet]')) s.hidden = s.dataset.sheet !== open;
    for (const b of root.querySelectorAll('[data-tg]')) b.classList.toggle('on', b.dataset.tg === open);
    scrim.hidden = open !== 'menu'; // Figma 02: 메뉴만 화면을 어둡게 덮는다
    document.body.classList.toggle('m-show-bgm', open === 'bgm');
    document.body.classList.toggle('m-show-map', open === 'map');
    document.body.classList.toggle('m-sheet-open', !!open);
    document.body.dataset.mSheet = open;
    if (open) { closeInv(); if (handset?.open) handset.close?.(); closePresence(); }
    if (open === 'menu') fillMenu();
    if (open === 'event') paintEvent();
    if (open === 'emote') paintEmotes();
    if (open === 'map') paintStops();
  };
  scrim.addEventListener('click', () => open && setOpen(open));
  addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (chatOpen) closeChat(); else if (open) setOpen(open); closeInv(); if (handset?.open) handset.close?.(); closePresence(); });
  // 지도·이벤트·이모트 시트는 바깥(장면)을 누르면 닫힌다. 장면 조작은 그대로 통과.
  document.addEventListener('pointerdown', (e) => {
    if (!open || open === 'menu' || open === 'bgm') return;
    const sh = q(`[data-sheet="${open}"]`);
    if (sh?.contains(e.target) || e.target.closest?.(`[data-tg="${open}"]`) || e.target.closest?.('#phone') || (open === 'map' && e.target.closest?.('[data-act="stop"]'))) return;
    setOpen(open);
  }, true);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { setOpen(open); return; }
    if (b.dataset.maptab) { for (const x of root.querySelectorAll('[data-maptab]')) x.classList.toggle('on', x === b); for (const p of root.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== b.dataset.maptab; document.body.classList.toggle('m-map-stop', b.dataset.maptab === 'stop'); paintStops(); return; }
    if (b.dataset.emo) { clickEmote(b.dataset.emo); setOpen(open); return; }
    const tg = b.dataset.tg;
    if (tg === 'phone') { togglePhone(); return; }
    if (tg) { setOpen(tg); return; }
    const act = b.dataset.act;
    if (act === 'presence') { if (open) setOpen(open); $('presence-status')?.click(); return; }
    if (act === 'bag') { toggleInv(); return; }
    if (act === 'stop') { if (open !== 'map') setOpen('map'); q('[data-maptab="stop"]')?.click(); return; }
    if (act === 'run') { virtualPad.run = !virtualPad.run; b.classList.toggle('on', virtualPad.run); return; }
    if (act === 'sit') { pressKey('KeyC'); return; }
    if (act === 'ride' || act === 'ride2') { const x = curActs[act === 'ride' ? 0 : 1]; x?.run(); setTimeout(tick, 120); return; }
    if (act === 'talk') { if (chatOpen) closeChat(); else openChat(); return; }
    if (b.dataset.fs) { toggleFullscreen().then(() => setTimeout(fillMenu, 120)); return; }
    if (b.dataset.menu) { const src = $(b.dataset.menu); setOpen(open); src?.click(); return; }
    const ev = b.dataset.ev;
    if (ev === 'cam') { $('rs-cam')?.click(); setTimeout(paintEvent, 50); return; }
    if (ev) { $(ev)?.click(); setTimeout(paintEvent, 50); }
  });

  // ---- 이모트: PC 퀵바(#emote-bar)는 옮기지 않고, 그 버튼을 그대로 비춘 그리드에서 원래 버튼을 누른다 ----
  const emoBtns = () => {
    const bar = $('emote-bar');
    if (bar?.classList.contains('folded')) bar.querySelector('[data-emote-fold="0"]')?.click(); // 접혀 있으면 펼쳐서 목록을 만든다
    return [...(bar?.querySelectorAll('[data-emote-id], [data-afk-toggle]') || [])];
  };
  const paintEmotes = () => {
    const grid = q('.m-emote-grid');
    grid.replaceChildren(...emoBtns().map((src) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'm-emo' + (src.classList.contains('active') ? ' on' : '');
      b.dataset.emo = src.dataset.emoteId || 'afk';
      const i = document.createElement('span'); i.className = 'm-emo-i'; i.textContent = src.querySelector('.em-ico')?.textContent?.trim() || '';
      const l = document.createElement('span'); l.className = 'm-emo-l'; l.textContent = src.querySelector('.em-lbl')?.textContent?.trim() || '';
      b.append(i, l);
      return b;
    }));
  };
  const clickEmote = (id) => {
    const bar = $('emote-bar');
    const src = id === 'afk' ? bar?.querySelector('[data-afk-toggle]') : bar?.querySelector(`[data-emote-id="${CSS.escape(id)}"]`);
    src?.click();
  };

  // ---- 가방(인벤토리): PC 의 떠 있는 동그라미 대신 2행 왼쪽 칩. 바깥 pointerdown 이 닫기라 그 전 상태를 기억 ----
  const dock = () => $('inventory-dock');
  const invOpen = () => !!dock()?.classList.contains('open');
  let invWasOpen = false;
  q('[data-act="bag"]').addEventListener('pointerdown', () => { invWasOpen = invOpen(); });
  const toggleInv = () => { if (open) setOpen(open); if (!invWasOpen && !invOpen()) pressKey('KeyI'); else if (invOpen()) pressKey('KeyI'); };
  const closeInv = () => { if (invOpen()) pressKey('KeyI'); };

  const stopPanel = () => { const a = $('stop-panel'), c = $('corridor-stop-panel'); return a?.classList.contains('open') ? a : c?.classList.contains('open') ? c : a; };
  // ---- 정류장 도착 정보: PC 의 #stop-panel(근처 정류장일 때만 열림) 내용을 카드로 ----
  // 정류장 가까이: 왼쪽 둘째 줄에 '🚌 정류장 · 곧 도착' 칩 → 누르면 지도 시트의 정류장 탭 (PC 의 왼쪽 큰 패널 대신)
  const stopChip = q('.m-stop-chip');
  const paintStopChip = () => {
    const sp = stopPanel();
    const on = !!sp?.classList.contains('open') && shown(sp) && !window.__jj?.ride?.active;
    stopChip.hidden = !on;
    if (!on) return;
    const nm = [...(sp.querySelector('.hd')?.childNodes || [])].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/^[^\p{L}\p{N}]+/u, '').trim(); // \W 는 한글도 지워서 정류장 이름이 비었음
    const etas = [...sp.querySelectorAll('tr')].map((tr) => ({ ref: tr.querySelector('.chip')?.textContent?.trim(), eta: tr.querySelector('.eta')?.textContent?.trim() || '' })).filter((r) => r.ref);
    const soon = etas.find((r) => /곧|정차|Arriv|Now/.test(r.eta)) || etas[0];
    stopChip.querySelector('b').textContent = nm;
    stopChip.querySelector('small').textContent = soon ? `${soon.ref} ${soon.eta}` : '';
    // 정류장에서 기다리는 중 안내(칩 아래 한 줄): 시뮬·실시간 모두 — 버스가 서면 오른쪽에 '버스 타기' 가 뜬다.
    //   [live-ride] 다음 도착(실시간이면 정류장 패널의 실제 도착 정보, 시뮬이면 시뮬 예상)을 붙인다
    const w = stopChip.querySelector('.m-bus-wait'), J = window.__jj;
    const nx = soon?.eta ? ` · ${soon.ref} ${soon.eta}` : '';
    const txt = J?.ride?.canBoardBus ? '' : t('버스 기다리는 중', 'Waiting for a bus') + nx;
    if (w.textContent !== txt) w.textContent = txt;
    w.hidden = !txt;
  };
  const paintStops = () => {
    const sp = stopPanel();
    const openNear = !!sp?.classList.contains('open');
    const name = sp?.querySelector('.hd')?.childNodes;
    let title = '', sub = '';
    if (openNear && name) { title = [...name].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/^[^\p{L}\p{N}]+/u, '').trim(); sub = sp.querySelector('.hd small')?.textContent?.trim() || ''; }
    const rows = openNear ? [...sp.querySelectorAll('tr')].map((tr) => ({ ref: tr.querySelector('.chip')?.textContent?.trim(), bg: tr.querySelector('.chip')?.style.background, ty: tr.querySelector('.ty')?.textContent?.trim(), eta: tr.querySelector('.eta')?.childNodes?.[0]?.textContent?.trim() || tr.textContent.trim() })) : [];
    for (const card of root.querySelectorAll('.m-stop-card')) {
      const full = card.classList.contains('is-full');
      card.replaceChildren();
      if (!openNear) { const p = document.createElement('p'); p.className = 'm-cap'; p.textContent = t('정류장 가까이 가면 버스 도착 정보가 나와요', 'Walk near a bus stop to see arrivals'); card.append(p); card.classList.add('is-empty'); continue; }
      card.classList.remove('is-empty');
      const h = document.createElement('div'); h.className = 'm-stop-h';
      h.innerHTML = `${svg('bus', 16)}<b></b><small></small>`; h.querySelector('b').textContent = title; h.querySelector('small').textContent = sub;
      card.append(h);
      for (const r of rows.slice(0, full ? 20 : 2)) {
        const d = document.createElement('div'); d.className = 'm-bus-row';
        if (!r.ref) { d.textContent = r.eta; card.append(d); continue; }
        const pill = document.createElement('span'); pill.className = 'm-route'; pill.textContent = r.ref; if (r.bg) pill.style.background = r.bg;
        const ty = document.createElement('span'); ty.className = 'm-ty'; ty.textContent = r.ty || '';
        const eta = document.createElement('b'); eta.className = 'm-eta' + (/곧|정차|Arriv/.test(r.eta) ? ' soon' : ''); eta.textContent = r.eta;
        d.append(pill, ty, eta); card.append(d);
      }
    }
    q('.m-map-cap').textContent = t('지도를 크게 보려면 메뉴 → 위에서 보기', 'Menu → Top view for the big map');
  };

  // ---- 휴대폰: 원래 #handset 을 연다/닫는다 (바깥 pointerdown 이 닫기라 그 전 상태를 기억) ----
  const phoneBtn = q('[data-tg="phone"]');
  let phoneWasOpen = false;
  phoneBtn.addEventListener('pointerdown', () => { phoneWasOpen = !!handset?.open; });
  const phoneX = q('.m-phone-x');
  phoneX.addEventListener('click', () => handset?.close?.());
  const togglePhone = () => {
    if (open) setOpen(open);
    closeInv();
    if (!phoneWasOpen && !handset?.open) $('handset')?.click();
    else handset?.close?.();
  };

  // ---- 채팅: 아래 가운데 '채팅' 칩 위에 붙는다 ----
  //   접힘: 새 메시지가 오면 최근 2~3줄을 칩 바로 위에 반투명하게, 약 5초 뒤 사라짐 (터치는 통과)
  //   펼침: 칩을 누르면 위로 좁은 패널(최근 대화 몇 줄 + 입력칸). 키보드가 올라오면 visualViewport 로 입력칸을 키보드 위에 둔다.
  //         열려 있는 동안 조이스틱·행동 버튼은 숨기고, 바깥을 누르거나 ✕ 로 닫는다.
  const chatInput = $('chat-input'), chatForm = $('chat');
  const panel = q('.m-chat-panel'), hist = q('.m-chat-hist'), toast = q('.m-chat-toast'), talkBadge = q('.m-talk .m-count');
  const logs = [];
  let toastTimer = 0, unread = 0;
  const line = (m) => {
    const d = document.createElement('div');
    d.className = 'm-chat-line is-' + (m.kind || 'remote');
    const n = document.createElement('b'); n.textContent = m.name || ''; n.style.color = m.color || '';
    const x = document.createElement('span'); x.textContent = m.text || '';
    d.append(n, x);
    return d;
  };
  const paintHist = () => {
    hist.replaceChildren(...logs.slice(-30).map(line));
    hist.scrollTop = hist.scrollHeight;
    if (!logs.length) { const e = document.createElement('div'); e.className = 'm-chat-empty'; e.textContent = t('아직 주변 대화가 없어요', 'No nearby chat yet'); hist.append(e); }
  };
  const showToast = () => {
    toast.replaceChildren(...logs.slice(-3).map(line));
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('on'), 5000);
  };
  addEventListener('bw:chat', (e) => {
    logs.push(e.detail); if (logs.length > 60) logs.shift();
    if (chatOpen) paintHist();
    else { showToast(); if (e.detail?.kind !== 'me') { unread++; talkBadge.hidden = false; talkBadge.textContent = unread > 9 ? '9+' : String(unread); } }
  });
  let chatOpen = false;
  const placePanel = () => {
    const vv = window.visualViewport;
    const kb = vv ? Math.max(0, innerHeight - (vv.height + vv.offsetTop)) : 0;
    panel.style.setProperty('--m-kb', kb + 'px');
    if (vv) panel.style.maxHeight = Math.max(120, vv.height - 16) + 'px';
  };
  const openChat = () => {
    if (open) setOpen(open);
    chatOpen = true; unread = 0; talkBadge.hidden = true;
    closeInv(); if (handset?.open) handset.close?.();
    if (chatInput) chatInput.placeholder = t('말 걸기…', 'Say something…');
    toast.classList.remove('on');
    if (chatForm) q('.m-chat-form-slot').appendChild(chatForm);
    panel.hidden = false;
    document.body.classList.add('m-chat-open');
    paintHist(); placePanel();
    chatInput?.focus({ preventScroll: true }); // [mobile-scroll-lock] 문서를 밀어 올리지 않게
  };
  const closeChat = () => {
    if (!chatOpen) return;
    chatOpen = false;
    panel.hidden = true;
    document.body.classList.remove('m-chat-open');
    chatInput?.blur();
    resetDocScroll(); setTimeout(resetDocScroll, 300); // [mobile-scroll-lock] iOS 키보드가 밀어 둔 문서를 되돌려 터치 판정 어긋남 방지
    if (chatForm && chatForm.parentElement !== document.body) document.body.insertBefore(chatForm, $('ride-btn'));
  };
  q('[data-chat-close]').addEventListener('click', (e) => { e.stopPropagation(); closeChat(); });
  document.addEventListener('pointerdown', (e) => { if (chatOpen && !panel.contains(e.target) && !e.target.closest?.('.m-talk')) closeChat(); }, true);
  window.visualViewport?.addEventListener('resize', () => chatOpen && placePanel());
  window.visualViewport?.addEventListener('scroll', () => chatOpen && placePanel());

  // ---- 메뉴 (Figma 02): 섹션 '이동' · '함께' · '설정' 의 80x56 타일. 원래 PC 버튼을 그대로 누른다 (숨겨진 건 빼고) ----
  const SECTIONS = [
    [t('이동', 'Go'), [['btn-view', 'map'], ['btn-home', 'train'], ['btn-globe', 'globe'], ['btn-dogpark', 'paw']]],
    [t('함께', 'Together'), [['contribute-launcher', 'heart', 'gold'], ['board-Launcher', 'board'], ['presence-status', 'users'], ['lang-launcher', 'globe'], ['account-chip', 'users']]],
    [t('설정', 'Settings'), [['fs', 'expand'], ['chat-log-toggle', 'log'], ['weather-rain', 'rain']]],
  ];
  const clean = (el) => {
    const c = el.cloneNode(true);
    c.querySelectorAll('.board-new-badge, .chat-unread, [hidden], .live-dot, .sr-only').forEach((x) => x.remove());
    return (c.textContent || '').replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  };
  const fillMenu = () => {
    const body = q('.m-menu-body');
    body.innerHTML = '';
    for (const [title, items] of SECTIONS) {
      const tiles = [];
      for (const [id, icon, tone] of items) {
        let label = '', on = false, dot = false;
        if (id === 'fs') { if (!canFullscreen()) continue; on = isFullscreen(); label = on ? t('전체 화면 끄기', 'Exit full') : t('전체 화면', 'Full screen'); }
        else {
          const src = $(id);
          if (!src || src.hidden) continue;
          label = id === 'presence-status' ? (q('.m-live-n').textContent ? t(`접속자 ${q('.m-live-n').textContent}`, `${q('.m-live-n').textContent} online`) : t('접속자', 'Online')) : clean(src);
          if (id === 'chat-log-toggle') label = t('채팅 기록', 'Chat log');
          if (!label) continue;
          on = src.classList.contains('active') || src.getAttribute('aria-pressed') === 'true' || src.getAttribute('aria-expanded') === 'true';
          const nb = src.querySelector('.board-new-badge, .chat-unread');
          dot = !!nb && !nb.hidden && getComputedStyle(nb).display !== 'none';
        }
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'm-tile' + (tone ? ' is-' + tone : '') + (on ? ' on' : '');
        if (id === 'fs') b.dataset.fs = '1'; else b.dataset.menu = id;
        b.innerHTML = `${gsvg(icon, 20, id)}<span></span>${dot ? '<i class="m-dot"></i>' : ''}`;
        // 계정 타일: '이름 · 잔액' 이 80px 에 잘리던 것 → 두 칸 너비 · 두 줄(이름 / 잔액)
        const parts = id === 'account-chip' ? label.split(/\s*·\s*/) : [];
        if (parts.length > 1) {
          b.classList.add('m-tile-wide');
          const sp = b.querySelector('span'); sp.textContent = parts[0];
          const sm = document.createElement('small'); sm.textContent = parts.slice(1).join(' · '); sp.after(sm);
          b.setAttribute('aria-label', label);
        } else b.querySelector('span').textContent = label;
        tiles.push(b);
      }
      if (!tiles.length) continue;
      const h = document.createElement('p'); h.className = 'm-sec'; h.textContent = title;
      const g = document.createElement('div'); g.className = 'm-tiles'; g.append(...tiles);
      body.append(h, g);
    }
    q('.m-leave').hidden = !$('btn-leave') || $('btn-leave').hidden;
    q('.m-leave span').textContent = clean($('btn-leave') || document.createElement('i')) || t('나가기', 'Leave');
    const attr = $('attribution');
    if (attr) q('.m-attr').innerHTML = attr.innerHTML;
  };

  // ---- 조이스틱 ----
  const joy = q('#m-joy'), knob = q('#m-joy-knob');
  let joyId = null, cx = 0, cy = 0;
  const R = 44;
  const setKnob = (dx, dy) => {
    const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
    dx *= k; dy *= k;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, d / R);
    const dead = m < 0.12;
    virtualPad.s = dead ? 0 : dx / R;
    virtualPad.f = dead ? 0 : -dy / R;
  };
  joy.addEventListener('pointerdown', (e) => {
    joyId = e.pointerId; joy.setPointerCapture(e.pointerId);
    const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    joy.classList.add('on'); setKnob(e.clientX - cx, e.clientY - cy); e.preventDefault();
  });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) setKnob(e.clientX - cx, e.clientY - cy); });
  const endJoy = (e) => { if (e.pointerId !== joyId) return; joyId = null; joy.classList.remove('on'); knob.style.transform = ''; virtualPad.f = 0; virtualPad.s = 0; };
  joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);

  // ---- 스타베이스 이벤트 ----
  const evBtn = q('#m-event-btn'), liveBadge = q('.m-live-badge');
  const paintEvent = () => {
    const rsHud = $('rs-hud'), lsHud = $('ls-hud'), tm = $('rs-timer');
    const rec = q('.m-ev-rec-v');
    const timer = tm && tm.style.display === 'block' && rsHud?.style.display !== 'none' ? tm.querySelector('.v')?.textContent?.trim() : '';
    rec.classList.toggle('n', !!timer);
    rec.textContent = timer || t('쇼가 시작되면 0–60 mph 기록이 나와요', '0–60 mph appears when the show runs');
    const cam = $('rs-cam');
    const camOn = !!cam && /Exit|✖/.test(cam.textContent);
    const sw = q('.m-switch'); sw.classList.toggle('on', camOn); sw.setAttribute('aria-checked', camOn ? 'true' : 'false');
    const ls = $('ls-start');
    const lb = q('.m-ev-launch');
    lb.hidden = !ls; if (ls) lb.textContent = (ls.textContent || '').trim();
    q('[data-ev="rs-start"]').hidden = !$('rs-start');
    const live = (rsHud && rsHud.style.display !== 'none') || (lsHud && lsHud.style.display !== 'none');
    liveBadge.hidden = !live;
  };

  // ---- 상태 동기화 (가벼운 주기 폴링) ----
  const rideBtn = $('ride-btn');
  const rideAct = q('[data-act="ride"]');
  const PROMPTS = ['trk-prompt', 'bike-prompt'];
  // 2행 라이드 스트립 (Figma 04): PC 속도계(#bike-hud/#trk-hud .v) · 카카오바이크 HUD · 버스/택시 HUD 한 줄 요약
  const strip = q('.m-ride-strip');
  const paintRide = (riding) => {
    let html = '';
    const sp = [$('bike-hud'), $('trk-hud')].find(shown);
    const rh = $('ride-hud');
    const rb = [...document.querySelectorAll('.rb-hud')].find(shown);
    if (rb) {
      const g = (k) => rb.querySelector('.' + k)?.textContent?.trim() || '0';
      html = `<span class="m-rs-ic">${svg('bike', 18)}</span><b class="m-rs-v">${g('v')}</b><small>km/h</small><i class="m-div"></i><small>${t('평균', 'Avg')}</small><b class="m-rs-s">${g('a')}</b><small>km/h</small><i class="m-div"></i><small>${t('케이던스', 'Cadence')}</small><b class="m-rs-s">${g('c')}</b><small>rpm</small>`;
    } else if (sp) html = `<span class="m-rs-ic">${svg('bike', 18)}</span><b class="m-rs-v">${sp.querySelector('.v')?.textContent?.trim() || '0'}</b><small>km/h</small>`;
    document.body.classList.toggle('m-ride-hud', shown(rh) && !!window.__jj?.ride?.active); // 버스·택시 HUD 는 그 자체를 2행 칩으로 쓴다 (CSS)
    if (strip.dataset.h !== html) { strip.dataset.h = html; strip.innerHTML = html; }
    strip.hidden = !riding || !html;
  };
  // ---- 상황별 행동 버튼: PC 의 키(E·F·G·X·Y…)로만 되던 걸 전부 여기서 버튼으로 (주 1개 + 보조 1개) ----
  //   지하철(대합실·열차) → 버스(하차 벨/내리기) → 택시(타기·목적지·세워주세요) → 정차 버스 타기 → 탈것 안내(트럭·관리자 바이크·선물 탈것)
  //   → 카카오바이크 → 지하철 출입구 → 반려견 놀이터 문 → 후원 전단지
  const rideAct2 = q('[data-act="ride2"]');
  const rideAct3 = q('[data-act="ride3"]');
  let curActs = [];
  const key = (code) => () => pressKey(code);
  const clk = (el) => () => el?.click();
  const strip2 = (el) => (el?.textContent || '').replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const contextActions = () => {
    const J = window.__jj, R = J?.ride, r = R?.ride, S = J?.subway;
    const A = []; A.riding = false;
    const add = (label, icon, run, gold = true) => A.push({ label, icon, run, gold });
    if (S?.active) {
      A.riding = true; // 지하철 안: 걷기는 조이스틱, 달리기·이모트는 그대로 두지 않고 행동만
      const k = S.inside?.kind, ph = S.state?.phase;
      if (ph === 'choosing') add(t('닫기', 'Close'), 'stop', () => pressKey('Escape'), false);
      else if (ph === 'inside' && !S.swapping) {
        if (k === 'train') add(S.inside.sitting ? t('일어나기', 'Stand') : t('앉기', 'Sit'), 'sit', key('KeyE'));
        else if (k !== 'platform') add(t('출구 고르기', 'Exits'), 'door', key('KeyE'));
      }
      A.riding = false;
      return A;
    }
    // [cathedral-sit] 명동성당 장의자: 가까이 가면 앉기, 앉아 있으면 일어나기 (C 키와 같음)
    const pw = J?.pew;
    if (pw?.near || pw?.seated) { add(pw.seated ? t('일어나기', 'Stand') : t('장의자에 앉기', 'Sit on pew'), 'sit', key('KeyC')); return A; }
    // [cableguide] 남산 케이블카 승강장: 타기 · 다음 칸 예약
    const cg = J?.namsan?.cableGuide;
    if (cg?.canAct && !J?.namsan?.cable?.riding) { add(cg.actLabel || t('케이블카 타기', 'Board'), 'train', () => cg.act()); return A; }
    if (r?.mode === 'bus') {
      A.riding = true;
      if (r.dwell) add(t('내리기', 'Get off'), 'door', key('KeyE'));
      else add(r.bell ? t('벨 취소', 'Cancel bell') : t('하차 벨', 'Stop bell'), 'bell', key('KeyE'));
      add(t('시점', 'View'), 'cam', () => R.toggleCam(), false);
      return A;
    }
    if (r?.mode === 'taxi') {
      if (r.phase === 'wait') add(t('택시 타기', 'Get in'), 'taxi', key('KeyE'));
      else if (r.phase === 'choose') { A.riding = true; add(t('목적지', 'Destination'), 'map', key('KeyE')); }
      else if (r.phase === 'drive') { A.riding = true; add(r.stopReq ? t('정차 요청됨', 'Pulling over') : t('세워주세요', 'Pull over'), 'stop', () => R.requestStop()); add(t('시점', 'View'), 'cam', () => R.toggleCam(), false); }
      if (A.length) return A;
    }
    if (R?.canBoardBus) add(t('버스 타기', 'Board'), 'bus', key('KeyE'));
    // 탈것 안내 버튼(PC 화면 아래 'F 탑승/내리기'): 안 보이게 두고 같은 버튼을 누른다
    for (const el of [$('trk-prompt'), $('bike-prompt'), ...document.querySelectorAll('.rb-prompt')]) {
      if (!shown(el)) continue;
      const off = /내리기|Get off|Dismount/i.test(el.textContent);
      if (off) A.riding = true;
      add(off ? t('내리기', 'Get off') : t('타기', 'Ride'), 'bike', clk(el));
    }
    if (shown($('trk-hud')) || shown($('bike-hud')) || [...document.querySelectorAll('.rb-hud')].some(shown)) { A.riding = true; if (!A.some((x) => /내리기|Get off/.test(x.label))) add(t('내리기', 'Get off'), 'bike', key('KeyF')); }
    // 지하철 입구 안내가 떠 있으면 '내려가기'가 먼저, 근처 자전거는 두 번째 버튼으로 (자전거 타는 중이면 '내리기'가 먼저)
    const sh = $('subway-hint'), rbOn = rideBtn && !rideBtn.hidden, rbOff = rbOn && /내리기|Dismount|Get off/i.test(rideBtn.textContent);
    const goDown = () => { if (shown(sh) && sh.querySelector('kbd')) add(t('내려가기', 'Go down'), 'train', key('KeyE')); };
    if (!rbOff) goDown();
    if (rbOn) { if (rbOff) A.riding = true; add(rbOff ? t('내리기', 'Get off') : t('자전거', 'Bike'), 'bike', clk(rideBtn)); }
    if (rbOff) goDown();
    const dp = J?.dogPark?.nearGate;
    if (dp) add(dp.open ? t('문 닫기', 'Close gate') : t('문 열기', 'Open gate'), 'door', key('KeyG'), false);
    const dn = $('donate-near-btn');
    if (shown(dn)) add(t('전단지', 'Flyer'), 'board', clk(dn), false);
    // [arcade] 오락실 — E/F/R 대신 터치 행동 버튼 (BUMP24 문 앞과 같은 패턴)
    const arc = J?.arcadeGame;
    if (arc && !S?.active) {
      if (arc.boardOpen) return A;
      if (arc.active && !arc.playing) {
        A.riding = true; // 안에서는 걷기 대신 행동 강조
        add(t('범핑팡', 'Play'), 'board', () => arc.actPlay?.() || pressKey('KeyF'));
        add(t('나가기', 'Exit'), 'door', () => arc.actLeave?.() || pressKey('KeyE'), false);
        add(t('랭킹', 'Ranks'), 'board', () => arc.actBoard?.() || pressKey('KeyR'), false);
        return A;
      }
      if (!arc.active) {
        if (arc.nearDoor) add(t('오락실 들어가기', 'Enter arcade'), 'door', () => arc.actEnter?.() || pressKey('KeyE'));
        else if (arc.nearBoard) add(t('범핑팡 랭킹', 'Arcade ranks'), 'board', () => arc.actBoard?.() || pressKey('KeyR'), false);
      }
    }
    return A;
  };
  const paintAct = (btn, a) => {
    btn.hidden = !a;
    if (!a) return;
    const k = a.icon + '|' + a.label + '|' + a.gold;
    if (btn.dataset.k !== k) { btn.dataset.k = k; btn.innerHTML = `${svg(I[a.icon] ? a.icon : 'bike', btn === rideAct ? 26 : 20)}<span></span>`; btn.querySelector('span').textContent = a.label; }
    btn.classList.toggle('is-plain', !a.gold);
  };
  const tick = () => {
    // 프로필 칩 (Figma 01): 아바타 이니셜 · 날씨 아이콘 · "15:30 · 18°"
    const ck = ($('hud-clock')?.textContent || '').replace(/\s+/g, ' ').trim();
    const hm = ck.match(/\d{1,2}:\d{2}/)?.[0] || '--:--', deg = ck.match(/-?\d+(?:\.\d)?°/)?.[0];
    q('.m-clock').textContent = deg ? `${hm} · ${deg}` : hm;
    const wx = /눈|snow/i.test(ck) ? 'snow' : /비|rain|소나기/i.test(ck) ? 'rain' : /흐림|구름|cloud|overcast/i.test(ck) && !/맑/.test(ck) ? 'cloud' : /밤|night/i.test(ck) ? 'moon' : 'sun';
    const wxEl = q('.m-wx'); if (wxEl.dataset.k !== wx) { wxEl.dataset.k = wx; wxEl.innerHTML = svg(wx, 18); }
    const nick = ($('nick')?.value || '').trim();
    q('.m-avatar').textContent = nick ? [...nick][0].toUpperCase() : '';
    // 가방 칩: 인벤토리가 있을 때만 (보유 수 표시)
    const dk = dock();
    const bag = q('.m-bag');
    bag.hidden = !dk || document.body.classList.contains('m-riding');
    bag.classList.toggle('on', invOpen());
    const ce = dk?.querySelector('.inv-orb-count'); const cnt = ce && !ce.hidden ? ce.textContent.trim() : '';
    const bc = bag.querySelector('.m-count'); bc.hidden = !cnt || cnt === '0'; bc.textContent = cnt || '';
    q('.m-phone-x').hidden = !handset?.open;
    document.body.classList.toggle('m-phone-open', !!handset?.open);
    const ps = $('presence-status');
    const n = ps?.querySelector('.live-count')?.textContent?.trim();
    q('.m-live-n').textContent = n || '';
    q('.m-live').hidden = !ps || !ps.innerHTML.trim();
    q('[data-tg="bgm"]').hidden = !$('bgm');
    // 타기/내리기: 카카오바이크 버튼 · 버스/택시 탑승 HUD · 트럭/바이크 안내가 있을 때만
    const acts = contextActions(); curActs = acts;
    paintStopChip();
    const riding = acts.riding;
    paintAct(rideAct, acts[0]);
    paintAct(rideAct2, acts[1]);
    if (rideAct3) paintAct(rideAct3, acts[2]);
    document.body.classList.toggle('m-act2', !!acts[1]);
    document.body.classList.toggle('m-act3', !!acts[2]);
    document.body.classList.toggle('m-ctx-sit', acts[0]?.icon === 'sit');
    document.body.classList.toggle('m-riding', riding);
    paintRide(riding);
    q('[data-tg="phone"] .m-badge').hidden = !$('handset')?.classList.contains('has-mail');
    const hasEvent = !!$('rs-btns');
    evBtn.hidden = !hasEvent;
    if (hasEvent) paintEvent();
  };
  tick();
  setInterval(tick, 500);
  onLangChange(() => { fillMenu(); tick(); });
  onFullscreenChange(() => { if (open === 'menu') fillMenu(); });
  return { root, setOpen };
}
