// [mobile] 모바일 HUD (Figma 프로토타입 v4 · 모바일 HUD 기준)
//   - 왼쪽 위 작은 칩(시각), 오른쪽 위 아이콘 토글(BGM · 휴대폰 · 지도) + 접속자 칩 + ☰ 메뉴(옮겨 온 버튼들)
//   - 왼쪽 아래 가상 조이스틱, 오른쪽 아래 행동 버튼(타기/내리기 상황별 · 달리기 · 앉기 · 이모트), 아래 가운데 '말 걸기'
//   - 스타베이스: 가운데 배너·떠 있는 칩 대신 옆에 이벤트 버튼 하나 → 이벤트 시트(기록 · 로드스터 쇼 · 쇼 카메라 · 발사 상태)
// 기존 PC DOM 은 지우지 않고 body.mobile CSS 로 숨기거나 옮긴다. 버튼은 원래 버튼을 대신 눌러 준다(.click / 키 입력).
import { virtualPad } from '../input.js';
import { isEn, onLangChange } from '../i18n.js';
import { canFullscreen, isFullscreen, toggleFullscreen, onFullscreenChange } from './fullscreen.js';

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
  hourglass: '<path d="M6 3 H18 M6 21 H18 M7.5 3 C7.5 9 16.5 9 16.5 12 C16.5 15 7.5 15 7.5 21 M16.5 3 C16.5 9 7.5 9 7.5 12 C7.5 15 16.5 15 16.5 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
};
const svg = (k, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;
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
  root.innerHTML = `
    <div class="m-top-l"><div class="m-chip m-clock-chip"><span class="m-clock">--:--</span></div></div>
    <div class="m-top-r">
      <button type="button" class="m-tg" data-tg="bgm" aria-label="BGM">${svg('music', 20)}</button>
      <button type="button" class="m-tg" data-tg="phone" aria-label="${t('휴대폰', 'Phone')}">${svg('phone', 20)}<i class="m-badge" hidden></i></button>
      <button type="button" class="m-tg" data-tg="map" aria-label="${t('지도', 'Map')}">${svg('map', 20)}</button>
      <button type="button" class="m-chip m-live" data-act="presence"><i class="m-live-dot"></i>${svg('users', 18)}<b class="m-live-n"></b></button>
      <button type="button" class="m-tg m-menu-btn" data-tg="menu" aria-label="${t('메뉴', 'Menu')}">${svg('menu', 20)}</button>
    </div>
    <button type="button" id="m-event-btn" class="m-tg" data-tg="event" aria-label="${t('이벤트', 'Events')}" hidden>${svg('rocket', 20)}<i class="m-badge m-live-badge" hidden></i></button>
    <div id="m-joy" aria-hidden="true"><div id="m-joy-knob"></div></div>
    <div class="m-actions">
      <button type="button" class="m-act m-act-ride" data-act="ride" hidden>${svg('bike', 24)}<span></span></button>
      <button type="button" class="m-act" data-act="run">${svg('run', 22)}<span>${t('달리기', 'Run')}</span></button>
      <button type="button" class="m-act" data-act="sit">${svg('sit', 22)}<span>${t('앉기', 'Sit')}</span></button>
      <button type="button" class="m-act" data-tg="emote">${svg('emote', 22)}<span>${t('이모트', 'Emote')}</span></button>
    </div>
    <div class="m-chat-toast" aria-live="polite"></div>
    <button type="button" class="m-chip m-talk" data-act="talk">${svg('chat', 18)}<span>${t('채팅', 'Chat')}</span><i class="m-badge" hidden></i></button>
    <div class="m-sheet m-chat-panel" hidden>
      <div class="m-sheet-head"><b>${t('주변 채팅', 'Nearby chat')}</b><button type="button" class="m-x" data-chat-close>${svg('close', 18)}</button></div>
      <div class="m-chat-hist"></div>
      <div class="m-chat-form-slot"></div>
    </div>
    <div class="m-sheet m-menu-sheet" data-sheet="menu" hidden>
      <div class="m-sheet-head"><b>${t('메뉴', 'Menu')}</b><button type="button" class="m-x" data-close>${svg('close', 18)}</button></div>
      <div class="m-menu-list"></div>
      <div class="m-attr"></div>
    </div>
    <div class="m-sheet m-event-sheet" data-sheet="event" hidden>
      <div class="m-sheet-head"><b>${t('이벤트 · 스타베이스', 'Events · Starbase')}</b><button type="button" class="m-x" data-close>${svg('close', 18)}</button></div>
      <div class="m-ev-record">${svg('flag', 18)}<span class="m-ev-rec-v"></span><em>${t('연출 기록', 'Scripted')}</em></div>
      <div class="m-ev-row">${svg('rocket', 18)}<span>${t('로드스터 쇼', 'Roadster show')}</span><button type="button" class="m-btn-s" data-ev="rs-start">${t('보기', 'Watch')}</button></div>
      <div class="m-ev-row">${svg('cam', 18)}<span>${t('쇼 카메라', 'Show camera')}</span><button type="button" class="m-switch" data-ev="cam" role="switch" aria-checked="false"><i></i></button></div>
      <div class="m-ev-row">${svg('hourglass', 18)}<span>${t('발사', 'Launch')}</span><button type="button" class="m-btn-s m-ev-launch" data-ev="ls-start"></button></div>
    </div>
    <div class="m-sheet m-emote-sheet" data-sheet="emote" hidden>
      <div class="m-sheet-head"><b>${t('이모트', 'Emotes')}</b><button type="button" class="m-x" data-close>${svg('close', 18)}</button></div>
      <div class="m-emote-slot"></div>
    </div>`;
  document.body.appendChild(root);
  const q = (s) => root.querySelector(s);

  // ---- 시트 / 토글 ----
  let open = '';
  const setOpen = (name) => {
    open = open === name ? '' : name;
    for (const s of root.querySelectorAll('[data-sheet]')) s.hidden = s.dataset.sheet !== open;
    for (const b of root.querySelectorAll('[data-tg]')) b.classList.toggle('on', b.dataset.tg === open);
    document.body.classList.toggle('m-show-bgm', open === 'bgm');
    document.body.classList.toggle('m-show-map', open === 'map');
    document.body.classList.toggle('m-sheet-open', !!open);
    if (open === 'menu') fillMenu();
    if (open === 'event') paintEvent();
    if (open === 'emote') { const bar = $('emote-bar'); if (bar) q('.m-emote-slot').appendChild(bar); }
    else { const bar = $('emote-bar'); if (bar && bar.parentElement !== document.body) document.body.insertBefore(bar, $('chat')); }
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { setOpen(open); return; }
    const tg = b.dataset.tg;
    if (tg === 'phone') { togglePhone(); return; }
    if (tg) { setOpen(tg); return; }
    const act = b.dataset.act;
    if (act === 'presence') { $('presence-status')?.click(); return; }
    if (act === 'run') { virtualPad.run = !virtualPad.run; b.classList.toggle('on', virtualPad.run); return; }
    if (act === 'sit') { pressKey('KeyC'); return; }
    if (act === 'ride') {
      const tp = $('trk-prompt'), bp = $('bike-prompt');
      if (shown(tp)) tp.click(); else if (shown(bp)) bp.click();
      else if (shown($('trk-hud')) || shown($('bike-hud'))) pressKey('KeyF'); // 트럭·관리자 바이크는 F 로 내린다
      else pressKey('KeyE'); // 버스·택시 → 카카오바이크 순서 (PC 의 E 와 같음)
      return;
    }
    if (act === 'talk') { if (chatOpen) closeChat(); else openChat(); return; }
    if (b.dataset.fs) { toggleFullscreen().then(() => setTimeout(fillMenu, 120)); return; }
    if (b.dataset.menu) { const src = $(b.dataset.menu); setOpen(open); src?.click(); return; }
    const ev = b.dataset.ev;
    if (ev === 'cam') { $('rs-cam')?.click(); setTimeout(paintEvent, 50); return; }
    if (ev) { $(ev)?.click(); setTimeout(paintEvent, 50); }
  });

  // ---- 휴대폰: 원래 #handset 을 연다/닫는다 (바깥 pointerdown 이 닫기라 그 전 상태를 기억) ----
  const phoneBtn = q('[data-tg="phone"]');
  let phoneWasOpen = false;
  phoneBtn.addEventListener('pointerdown', () => { phoneWasOpen = !!handset?.open; });
  const togglePhone = () => {
    if (open) setOpen(open);
    if (!phoneWasOpen && !handset?.open) $('handset')?.click();
    else handset?.close?.();
  };

  // ---- 채팅: 아래 가운데 '채팅' 칩 위에 붙는다 ----
  //   접힘: 새 메시지가 오면 최근 2~3줄을 칩 바로 위에 반투명하게, 약 5초 뒤 사라짐 (터치는 통과)
  //   펼침: 칩을 누르면 위로 좁은 패널(최근 대화 몇 줄 + 입력칸). 키보드가 올라오면 visualViewport 로 입력칸을 키보드 위에 둔다.
  //         열려 있는 동안 조이스틱·행동 버튼은 숨기고, 바깥을 누르거나 ✕ 로 닫는다.
  const chatInput = $('chat-input'), chatForm = $('chat');
  const panel = q('.m-chat-panel'), hist = q('.m-chat-hist'), toast = q('.m-chat-toast'), talkBadge = q('.m-talk .m-badge');
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
    else { showToast(); if (e.detail?.kind !== 'me') { unread++; talkBadge.hidden = false; } }
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
    toast.classList.remove('on');
    if (chatForm) q('.m-chat-form-slot').appendChild(chatForm);
    panel.hidden = false;
    document.body.classList.add('m-chat-open');
    paintHist(); placePanel();
    chatInput?.focus();
  };
  const closeChat = () => {
    if (!chatOpen) return;
    chatOpen = false;
    panel.hidden = true;
    document.body.classList.remove('m-chat-open');
    chatInput?.blur();
    if (chatForm && chatForm.parentElement !== document.body) document.body.insertBefore(chatForm, $('ride-btn'));
  };
  q('[data-chat-close]').addEventListener('click', (e) => { e.stopPropagation(); closeChat(); });
  document.addEventListener('pointerdown', (e) => { if (chatOpen && !panel.contains(e.target) && !e.target.closest?.('.m-talk')) closeChat(); }, true);
  window.visualViewport?.addEventListener('resize', () => chatOpen && placePanel());
  window.visualViewport?.addEventListener('scroll', () => chatOpen && placePanel());

  // ---- 메뉴: 오른쪽 위·상단 버튼들을 그대로 옮겨 보여 준다 (숨겨진 건 빼고) ----
  const MENU = ['btn-view', 'btn-home', 'btn-dogpark', 'btn-globe', 'board-Launcher', 'contribute-launcher', 'lang-launcher', 'chat-log-toggle', 'weather-rain', 'btn-leave'];
  const fillMenu = () => {
    const list = q('.m-menu-list');
    list.innerHTML = '';
    for (const id of MENU) {
      const src = $(id);
      if (!src || src.hidden) continue;
      const label = (src.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'm-menu-item' + (id === 'btn-leave' ? ' is-leave' : ''); b.dataset.menu = id;
      b.textContent = label;
      list.appendChild(b);
    }
    if (canFullscreen()) { // iOS 에선 숨김 (요소 전체 화면이 없다)
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'm-menu-item' + (isFullscreen() ? ' on' : ''); b.dataset.fs = '1';
      b.textContent = isFullscreen() ? t('전체 화면 끄기', 'Exit full screen') : t('전체 화면', 'Full screen');
      list.prepend(b);
    }
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
  const tick = () => {
    q('.m-clock').textContent = ($('hud-clock')?.textContent || '').trim() || '--:--';
    const ps = $('presence-status');
    const n = ps?.querySelector('.live-count')?.textContent?.trim();
    q('.m-live-n').textContent = n || '';
    q('.m-live').hidden = !ps || !ps.innerHTML.trim();
    q('[data-tg="bgm"]').hidden = !$('bgm');
    // 타기/내리기: 카카오바이크 버튼 · 버스/택시 탑승 HUD · 트럭/바이크 안내가 있을 때만
    const riding = shown($('ride-hud')) || shown($('trk-hud')) || shown($('bike-hud')) || (!!rideBtn && !rideBtn.hidden && /내리기|Dismount/.test(rideBtn.textContent));
    const canRide = riding || (!!rideBtn && !rideBtn.hidden) || PROMPTS.some((id) => shown($(id)));
    const subwayHint = !canRide && shown($('subway-hint')); // 지하철 출입구: PC 의 E 와 같은 동작
    rideAct.hidden = !canRide && !subwayHint;
    rideAct.classList.toggle('is-subway', subwayHint);
    rideAct.querySelector('span').textContent = subwayHint ? t('들어가기', 'Go in') : riding ? t('내리기', 'Get off') : t('타기', 'Ride');
    rideAct.classList.toggle('is-off', riding);
    document.body.classList.toggle('m-riding', riding);
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
