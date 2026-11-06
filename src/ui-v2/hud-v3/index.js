// [hud-v3] 데스크톱 상단 HUD v3 (PROPOSAL A안) — PC ui-v2 기본 켜짐. ?hud=off|v2 로 끔. 모바일·?ui=v1 제외.
//   왼쪽 위: 플레이어 카드(card.js) + 할 일 트래커. 오른쪽 위: 액션 바 [지도·이동 M][할 일 Q][탈것 상점 B][게시판 J][☰] + 접속자 알약(바 왼쪽 같은 줄).
//   기존 버튼(#hud · #buttons · #top-right-bar)은 DOM 에 그대로 두고 CSS 로만 숨긴다 → 새 버튼은 기존 버튼을 .click() 으로 부른다
//   (game.js 핸들러·문구·상태를 복제하지 않는다). 경제 패널은 econ-ui 의 open('04a'|'11'|'06') 을 그대로 쓴다.
import './hud-v3.css';
import { tr, isEn, onLangChange } from '../../i18n.js';
import { esc } from '../kit.js';
import { useAltHud } from '../econ-ui/hud.js';
import { close as closePanel, openKey } from '../econ-ui/layer.js';
import { cardAlt, mountCard, questsLeft, refreshName } from './card.js';
import { icon } from './icons.js';
import { mountMinimap, minimapOn, toggle as toggleMinimap } from './minimap.js'; // [hud-v3-minimap]

const $ = (id) => document.getElementById(id);
const strip = (t) => String(t || '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim();
/** 숨겨 둔 기존 버튼을 누른다 (없거나 숨김이면 false) */
const press = (id) => { const b = $(id); if (!b || b.disabled) return false; b.click(); return true; };

let api = null; // econ-ui { open, link }
let bar = null, online = null, drop = null, dropKind = '';

export async function mountHudV3(econUiPromise) {
  if (document.body.classList.contains('mobile') || $('h3-bar')) return;
  useAltHud(cardAlt);
  document.body.classList.add('hud-v3');
  mountCard();
  mountBar();
  mountMinimap({ onToggle: () => { if (dropKind === 'map') openDrop('map', true); } }); // [hud-v3-minimap] 바·알약 아래 원형 미니맵 (N)
  bindMinimapKey();
  dispatchEvent(new Event('bw:hud-layout')); // BGM 막대가 새 카드·바를 피해 자리를 다시 잡게
  try {
    const m = await econUiPromise;
    api = m.mountEconUi();
  } catch (e) { console.warn('[hud-v3] econ-ui', e); }
  paint();
}

/** 오른쪽 위 액션 바 + 접속자 알약(바 왼쪽 같은 줄). 좁으면 바 아래로. */
let trWrap = null;
function mountBar() {
  trWrap = document.createElement('div');
  trWrap.id = 'h3-tr';
  bar = document.createElement('nav');
  bar.id = 'h3-bar'; bar.className = 'h3-glass h3-actbar';
  bar.setAttribute('aria-label', 'HUD');
  online = document.createElement('button');
  online.type = 'button'; online.id = 'h3-online'; online.className = 'h3-online';
  // DOM 순서 [bar, online] + CSS row-reverse → 화면에 알약 | 바 (알약이 바 왼쪽)
  trWrap.appendChild(bar);
  trWrap.appendChild(online);
  document.body.appendChild(trWrap);
  online.addEventListener('click', () => {
    closeDrop();
    $('presence-status')?.click();
    // 패널이 열린 뒤 알약 기준으로 위치(아래로·왼쪽 — 미니맵을 가리지 않음)
    requestAnimationFrame(() => { placePresence(); layoutOnline(); });
  });

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-h3]'); if (!b) return;
    act(b.dataset.h3);
    b.blur();
  });
  addEventListener('pointerdown', (e) => { if (drop && !drop.contains(e.target) && !e.target.closest('#h3-tr')) closeDrop(); }, true);
  addEventListener('keydown', onKey);
  addEventListener('resize', () => { layoutOnline(); placePresence(); });
  onLangChange(() => { paint(); if (drop) openDrop(dropKind, true); refreshName(); layoutOnline(); });
  // 기존 버튼의 상태(게시판 새 글 N · 게시판 열림 · 접속자 수 · 시점 글자)를 따라 그린다
  const mo = new MutationObserver(() => paintSoon());
  for (const id of ['board-Launcher', 'presence-status', 'buttons']) { const n = $(id); if (n) mo.observe(n, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] }); }
  const pp = $('presence-panel');
  if (pp) new MutationObserver(() => placePresence()).observe(pp, { attributes: true, attributeFilter: ['hidden'] });
  setInterval(paint, 1000);
  paint();
  layoutOnline();
}
/** 접속자 알약: 기본은 바 왼쪽 같은 줄. 카드·BGM 과 겹치면 바 아래(바 왼쪽 가장자리 정렬). */
function layoutOnline() {
  if (!trWrap || !online || !bar) return;
  // 같은 줄로 가정하고 가상 위치를 계산(클래스 토글 flicker 방지)
  const br = bar.getBoundingClientRect();
  const ow = online.offsetWidth || 120;
  const oh = online.offsetHeight || 32;
  // 같은 줄일 때 알약 오른쪽 = 바 왼쪽 - 8
  const same = { left: br.left - 8 - ow, right: br.left - 8, top: br.top + (br.height - oh) / 2, bottom: br.top + (br.height - oh) / 2 + oh, width: ow, height: oh };
  const card = $('h3-card')?.getBoundingClientRect();
  const bgm = $('bgm')?.getBoundingClientRect();
  const hit = (a, b) => !!(a && b && a.width > 0 && b.width > 0 && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom);
  const tight = !!(card && same.width && same.left < card.right + 12);
  const below = hit(same, card) || hit(same, bgm) || tight || same.left < 12;
  const changed = trWrap.classList.contains('h3-online-below') !== below;
  trWrap.classList.toggle('h3-online-below', below);
  document.body.classList.toggle('h3-online-below', below);
  placePresence();
  if (changed) dispatchEvent(new Event('bw:hud-layout'));
}
/** 접속자 패널을 알약 바로 아래·왼쪽 방향으로 (미니맵 원과 안 겹치게) */
function placePresence() {
  const panel = $('presence-panel');
  if (!panel || panel.hidden || !online) return;
  const o = online.getBoundingClientRect();
  if (!o.width) return;
  const br = bar?.getBoundingClientRect();
  const w = Math.min(320, innerWidth - 24);
  // 패널 오른쪽을 알약 오른쪽에 맞춤 → 왼쪽으로 펼쳐짐. 바·알약 둘 다 아래로 비킴.
  let left = Math.round(o.right - w);
  left = Math.max(12, Math.min(left, innerWidth - 12 - w));
  const top = Math.max(o.bottom, br?.bottom || 0) + 8;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.left = `${left}px`;
  panel.style.right = 'auto';
}
let paintT = 0;
const paintSoon = () => { if (paintT) return; paintT = requestAnimationFrame(() => { paintT = 0; paint(); }); };

const BTNS = () => [
  { k: 'map', ic: 'map', label: tr('지도·이동', 'Map'), key: 'M' },
  { k: 'quest', ic: 'quest', label: tr('할 일', 'Quests'), key: 'Q' },
  { k: 'shop', ic: 'shop', label: tr('탈것 상점', 'Rides'), key: 'B', cls: 'gold', tag: tr('준비중', 'Soon') },
  { k: 'board', ic: 'board', label: tr('게시판', 'Board'), key: 'J' },
  { k: 'menu', ic: 'menu', label: tr('메뉴', 'Menu'), key: '' },
];

function paint() {
  if (!bar) return;
  const lang = isEn() ? 'en' : 'ko';
  if (bar.dataset.lang !== lang) {
    bar.dataset.lang = lang;
    bar.innerHTML = BTNS().map((b) => `<button type="button" class="h3-btn${b.cls ? ` ${b.cls}` : ''}" data-h3="${b.k}" title="${esc(b.label)}${b.key ? ` (${b.key})` : ''}" aria-label="${esc(b.label)}"${b.k === 'map' || b.k === 'menu' ? ' aria-haspopup="menu" aria-expanded="false"' : ''}>
      ${icon(b.ic, 24)}<span class="h3-lbl">${esc(b.label)}</span>${b.key ? `<kbd class="h3-kbd">${b.key}</kbd>` : ''}${b.tag ? `<span class="h3-tag">${esc(b.tag)}</span>` : ''}<span class="h3-badge" hidden></span></button>`).join('');
  }
  const q = bar.querySelector('[data-h3="quest"]');
  const left = questsLeft();
  const qb = q.querySelector('.h3-badge'); qb.hidden = !left; qb.textContent = left ? String(left) : '';
  const bb = bar.querySelector('[data-h3="board"] .h3-badge'); const nb = $('board-new-badge');
  bb.hidden = !nb || nb.hidden; bb.textContent = 'N';
  const k = openKey();
  q.classList.toggle('on', k.startsWith('04'));
  bar.querySelector('[data-h3="shop"]').classList.toggle('on', k === '11');
  bar.querySelector('[data-h3="board"]').classList.toggle('on', !!$('board-Launcher')?.classList.contains('active'));
  for (const kind of ['map', 'menu']) {
    const b = bar.querySelector(`[data-h3="${kind}"]`);
    b.classList.toggle('on', dropKind === kind); b.setAttribute('aria-expanded', String(dropKind === kind));
  }
  // 접속자 알약: '● 접속 N명 ▾'
  const ps = $('presence-status');
  // .live-count 텍스트는 언어에 따라 '2명' 또는 '2'처럼 단위가 붙어 올 수 있어 숫자만 뽑는다.
  const cnt = (ps?.querySelector('.live-count')?.textContent || '').match(/\d[\d,]*/)?.[0] || '';
  const txt = cnt ? tr(`접속 ${cnt}명`, `${cnt} online`) : tr('접속자', 'Online');
  const key = `${txt}|${ps?.classList.contains('open') ? 1 : 0}`;
  if (online.dataset.k !== key) {
    online.dataset.k = key;
    online.innerHTML = `<i class="h3-dot" aria-hidden="true"></i><span>${esc(txt)}</span>${icon('caret', 14)}`;
    online.classList.toggle('on', !!ps?.classList.contains('open'));
    online.title = tr('접속자 위치 및 목록 보기', 'Show who is online');
    layoutOnline(); // 알약 폭·열림 상태가 바뀌면 자리 다시
  }
  online.hidden = !ps;
}

/** 버튼·단축키 공통 */
function act(k) {
  if (k === 'map' || k === 'menu') { if (dropKind === k) closeDrop(); else openDrop(k); return; }
  closeDrop();
  if (k === 'quest') { if (openKey().startsWith('04')) closePanel(); else api?.open('04a'); }
  else if (k === 'shop') { if (openKey() === '11') closePanel(); else api?.open('11'); }
  else if (k === 'board') press('board-Launcher');
  paintSoon();
}

/** 지도·이동 / ☰ 드롭다운. 항목은 기존 버튼에서 읽어 와서 그 버튼을 누른다 */
function openDrop(kind, keep = false) {
  if (!keep) closeDrop();
  drop?.remove();
  dropKind = kind;
  drop = document.createElement('div');
  drop.id = 'h3-drop'; drop.className = `h3-glass h3-drop h3-drop-${kind}`;
  drop.setAttribute('role', 'menu');
  const item = (id, ic, label, { kbd = '', cls = '', extra = '' } = {}) => `<button type="button" role="menuitem" class="h3-item${cls ? ` ${cls}` : ''}" data-press="${esc(id)}">${icon(ic, 20)}<span class="h3-it">${esc(label)}</span>${extra}${kbd ? `<kbd class="h3-kbd">${kbd}</kbd>` : ''}</button>`;
  const sec = (t) => `<div class="h3-sec">${esc(t)}</div>`;
  let html = '';
  if (kind === 'map') {
    const vb = $('btn-view');
    html += sec(tr('보기', 'View'));
    if (vb && !vb.hidden) html += item('btn-view', 'top', strip(vb.textContent) || tr('위에서 보기', 'Overview'), { kbd: 'M' });
    // [hud-v3-minimap] 미니맵 켜기/끄기 (N)
    const mo = minimapOn();
    html += `<button type="button" role="menuitemcheckbox" aria-checked="${mo}" class="h3-item" data-act="minimap">${icon('radar', 20)}<span class="h3-it">${esc(tr('미니맵', 'Minimap'))}</span><span class="h3-sw${mo ? ' on' : ''}" aria-hidden="true"><i></i></span><kbd class="h3-kbd">N</kbd></button>`;
    html += sec(tr('이동', 'Travel'));
    const hb = $('btn-home'); if (hb && !hb.hidden) html += item('btn-home', 'train', strip(hb.textContent) || tr('역으로', 'To station'), { kbd: 'H' });
    const gb = $('btn-globe'); if (gb && !gb.hidden) html += item('btn-globe', 'globe', tr('지구본 · 다른 동네로', 'Globe · other towns'));
    // 동네마다 있는 빠른 이동(btn-spot-* · 강아지 공원 등): #buttons 에 보이는 나머지 버튼 전부
    const skip = new Set(['btn-view', 'btn-home', 'btn-globe', 'btn-leave']);
    const spots = [...($('buttons')?.querySelectorAll(':scope > button') || [])].filter((b) => b.id && !skip.has(b.id) && !b.hidden && strip(b.textContent));
    if (spots.length) { html += sec(tr('빠른 이동', 'Quick spots')); for (const b of spots) html += item(b.id, 'pin', strip(b.textContent)); }
  } else {
    const ac = $('account-chip');
    if (ac && !ac.hidden) html += item('account-chip', 'user', tr('내 계정', 'My account'), { extra: `<small class="h3-sub">${esc(strip(ac.querySelector('.board-label')?.textContent))}</small>` });
    const en = isEn();
    html += `<div class="h3-item h3-lang" role="group" aria-label="${esc(tr('언어', 'Language'))}">${icon('lang', 20)}<span class="h3-it">${esc(tr('언어', 'Language'))}</span><span class="h3-seg"><button type="button" data-lang="ko" class="${en ? '' : 'on'}" aria-pressed="${!en}">한국어</button><button type="button" data-lang="en" class="${en ? 'on' : ''}" aria-pressed="${en}">EN</button></span></div>`;
    html += item('help-fold', 'help', $('hud')?.classList.contains('is-folded') === false ? tr('조작 안내 접기', 'Hide controls') : tr('조작 안내', 'Controls'));
    if (api) html += `<button type="button" role="menuitem" class="h3-item" data-open="06">${icon('karma', 20)}<span class="h3-it">${esc(tr('카르마 · 업적', 'Karma · achievements'))}</span></button>`;
    if ($('contribute-launcher')) html += item('contribute-launcher', 'heart', tr('함께 만들기', 'Contribute'), { cls: 'gold' });
    if ($('btn-leave')) html += `<div class="h3-hr"></div>${item('btn-leave', 'door', strip($('btn-leave').textContent) || tr('나가기', 'Leave'), { cls: 'red' })}`;
  }
  drop.innerHTML = html;
  document.body.appendChild(drop);
  drop.addEventListener('click', (e) => {
    const lb = e.target.closest('[data-lang]');
    if (lb) { if ((lb.dataset.lang === 'en') !== isEn()) press('lang-launcher'); return; } // 메뉴는 열어 둔다(onLangChange 가 다시 그림)
    if (e.target.closest('[data-act="minimap"]')) { toggleMinimap(); return; } // 메뉴는 열어 둔 채 스위치만 바뀜(onToggle 이 다시 그림)
    const b = e.target.closest('[data-press], [data-open]'); if (!b) return;
    const id = b.dataset.press, code = b.dataset.open;
    closeDrop();
    if (code) api?.open(code);
    else press(id);
    paintSoon();
  });
  place();
  paint();
}
function place() {
  if (!drop) return;
  const b = bar.querySelector(`[data-h3="${dropKind}"]`)?.getBoundingClientRect();
  const br = bar.getBoundingClientRect();
  if (!b) return;
  drop.style.top = `${Math.round(br.bottom + 8)}px`;
  const w = drop.offsetWidth;
  drop.style.left = `${Math.round(Math.max(12, Math.min(innerWidth - 12 - w, b.right - w)))}px`;
}
addEventListener('resize', () => place());
function closeDrop() {
  if (!drop) { dropKind = ''; return; }
  drop.remove(); drop = null; dropKind = '';
  paint();
}

/** 단축키: Q 할 일 · B 탈것 상점 · J 게시판 (M·H 는 game.js 그대로). 입력 중·게이트·로비·조합키·반복 입력에서는 무시 */
function typing(t) {
  const a = document.activeElement;
  for (const n of [t, a]) {
    if (!n || n === document.body) continue;
    const tag = n.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable) return true;
  }
  return false;
}
const KEYS = { KeyQ: 'quest', KeyB: 'shop', KeyJ: 'board' };
const blockedKey = (e) => e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing || typing(e.target) || ['in-gate', 'in-lobby', 'mobile'].some((c) => document.body.classList.contains(c));
function onKey(e) {
  if (e.key === 'Escape' && drop) { closeDrop(); return; }
  const k = KEYS[e.code];
  if (!k || blockedKey(e)) return;
  e.preventDefault();
  act(k);
}
// [hud-v3-minimap] N = 미니맵. N 은 바이크 엔진음 음소거(bikeAudio.js)에도 쓰여서: 바이크(크루저·슈퍼바이크)를 타는 중이면 그대로 음소거로 넘기고,
//   걷는 중이면 미니맵만 토글하고 이벤트를 멈춘다(안 보이는 바이크 소리가 몰래 음소거되지 않게). capture 라 bikeAudio 보다 먼저 받는다.
const onBike = () => { const J = window.__jj; return !!(J?.bike?.riding || J?.giftRides?.some?.((g) => g.ride?.riding)); };
function bindMinimapKey() {
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyN' || blockedKey(e) || onBike()) return;
    e.preventDefault(); e.stopImmediatePropagation();
    toggleMinimap();
  }, true);
}
