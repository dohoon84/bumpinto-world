// [controls-card] 조작 안내를 화면 가운데 튜토리얼 카드로. 기본 켜짐 (?controlscard=0 이면 예전 접기 카드).
//   PC 는 키캡, 모바일(body.mobile)은 실제 터치 HUD(조이스틱·버튼) 안내.
//   처음 한 번 자동으로 열고, 닫으면 기억했다가 금색 ? 로 다시 연다. Esc 는 데스크톱에서만.
import './controlsCard.css';
import { tr, onLangChange } from '../i18n.js';
import { readDismissed, writeDismissed } from './flag.js';

const WALK = new Set([
  'WASD/방향키 이동 · Shift 달리기 · Space 점프 · C 앉기 · Z 자리비움 · 1~9 리액션 · Enter 채팅(!! 외침) · M 위에서 보기 · E 바이크',
  'WASD/Arrows Move · Shift Run · Space Jump · C Sit · Z AFK · 1~9 Emotes · Enter Chat (!! Shout) · M Overview · E Bike',
]);

const svg = (body) => `<svg class="cc-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${body}</svg>`;
const I = {
  move: svg('<path d="M12 3.2 15.2 7H8.8Z M12 20.8 8.8 17h6.4Z M3.2 12 7 8.8v6.4Z M20.8 12 17 15.2V8.8Z" fill="currentColor"/>'),
  run: svg('<circle cx="15" cy="5" r="1.7" fill="currentColor"/><path d="M10 20.5 12.2 15l2.6 2.2.8 3.6M8.2 12.2 11 9l3.2.8 2.2 3.2M12.2 15 13.2 10.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.2 11.2h3.2M2.4 14.2h4.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
  jump: svg('<circle cx="12" cy="6.2" r="1.8" fill="currentColor"/><path d="M12 8.4v4.2M9.2 10.2 12 8.4l2.8 1.8M8.4 16.2c1.2-1.6 2.4-2.2 3.6-2.2s2.4.6 3.6 2.2M9.2 20.2 12 16.8l2.8 3.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'),
  sit: svg('<circle cx="9" cy="5.2" r="1.8" fill="currentColor"/><path d="M9 7.4v4.2h5.6l1.2 4.6M9 11.6 7.2 16.2M5 20.4h14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'),
  afk: svg('<text x="12" y="16" text-anchor="middle" font-size="10" font-weight="900" fill="currentColor" font-family="inherit">Zzz</text>'),
  emote: svg('<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9.2" cy="10.2" r="1.1" fill="currentColor"/><circle cx="14.8" cy="10.2" r="1.1" fill="currentColor"/><path d="M8.6 14.2c1.2 1.8 5.6 1.8 6.8 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
  bike: svg('<circle cx="6.2" cy="16.2" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="17.8" cy="16.2" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6.2 16.2 10 9.2h4.6L17.8 16.2M10 9.2 12.2 16.2H6.2M13.4 6.4h2.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'),
  view: svg('<path d="M4 15.5 12 11l8 4.5L12 20Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 18.2 12 22.6 20 18.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" opacity=".65"/><path d="M12 3.2v4.2M10 5.6 12 7.6l2-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'),
  chat: svg('<path d="M4 5.2h16V15H11l-3.6 3.2V15H4Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
  joy: svg('<circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
  look: svg('<path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>'),
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const touchMode = () => document.body.classList.contains('mobile');
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const inMenu = () => ['in-gate', 'in-lobby', 'in-mobile-landing', 'v2-in-start'].some((c) => document.body.classList.contains(c));
const loading = () => { const n = document.getElementById('enter-loading'); return !!n && !n.hidden; };

function keysHtml(keys) {
  if (keys === 'wasd') {
    const pad = (chars) => `<span class="cc-pad" aria-hidden="true">${chars.map((ch, i) => `<kbd class="cc-key${i === 0 ? ' cc-up' : ''}" style="--k:${i}">${ch}</kbd>`).join('')}</span>`;
    return `<span class="cc-keys">${pad(['W', 'A', 'S', 'D'])}${pad(['▲', '◀', '▼', '▶'])}</span>`;
  }
  if (Array.isArray(keys) && keys.length > 4) {
    return `<span class="cc-keys"><span class="cc-digits" aria-hidden="true">${keys.map((k, i) => `<kbd class="cc-key" style="--k:${i}">${esc(k)}</kbd>`).join('')}</span></span>`;
  }
  const list = keys || [];
  return `<span class="cc-keys" aria-hidden="true">${list.map((k, i) => `<kbd class="cc-key${k.length > 1 ? ' wide' : ''}" style="--k:${i}">${esc(k)}</kbd>`).join('')}</span>`;
}

function rowHtml(row, i) {
  const name = tr(row.ko, row.en);
  const desc = tr(row.dko, row.den);
  const badge = row.bko ? `<span class="cc-badge">${esc(tr(row.bko, row.ben))}</span>` : '';
  const extra = row.ico === 'afk' ? '<i class="cc-z" aria-hidden="true">z</i>' : row.ico === 'chat' ? '<i class="cc-bang" aria-hidden="true">!!</i>' : '';
  return `<div class="cc-row" style="--d:${i}"><span class="cc-ico ${row.ico}">${I[row.ico] || ''}${extra}</span><div><div class="cc-name">${esc(name)}${badge}</div><div class="cc-desc">${esc(desc)}</div></div>${row.keys ? keysHtml(row.keys) : ''}</div>`;
}

const KEY_GROUPS = () => [
  { ko: '이동', en: 'Move', rows: [
    { ico: 'move', ko: '이동', en: 'Move', dko: 'WASD 또는 방향키', den: 'WASD or the arrow keys', keys: 'wasd' },
    { ico: 'run', ko: '달리기', en: 'Run', dko: '누르고 있는 동안 더 빠르게', den: 'Hold to move faster', keys: ['Shift'] },
    { ico: 'jump', ko: '점프', en: 'Jump', dko: '그 자리에서 뛰어오릅니다', den: 'Hop in place', keys: ['Space'] },
  ] },
  { ko: '행동', en: 'Actions', rows: [
    { ico: 'sit', ko: '앉기', en: 'Sit', dko: '한 번 더 누르면 일어섭니다', den: 'Press again to stand', keys: ['C'] },
    { ico: 'afk', ko: '자리비움', en: 'Away', dko: '잠깐 자리를 비울 때', den: 'Step away for a moment', keys: ['Z'] },
    { ico: 'emote', ko: '리액션', en: 'Reactions', dko: '숫자 키로 바로 표현', den: 'Number keys, right away', keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] },
    { ico: 'bike', ko: '바이크', en: 'Bike', dko: '가까이에서 타기 · 내리기', den: 'Mount or get off nearby', keys: ['E'] },
  ] },
  { ko: '보기 · 대화', en: 'Look & chat', rows: [
    { ico: 'view', ko: '위에서 보기', en: 'Top-down', dko: '동네를 내려다봅니다', den: 'Look down over the town', keys: ['M'] },
    { ico: 'chat', ko: '채팅', en: 'Chat', dko: '말 끝에 !! 를 붙이면 외침', den: 'Add !! at the end to shout', keys: ['Enter'] },
    { ico: 'look', ko: '둘러보기', en: 'Look around', dko: '화면을 드래그하고, 휠로 줌', den: 'Drag to look, wheel to zoom', keys: null },
  ] },
];

const TOUCH_GROUPS = () => [
  { ko: '이동', en: 'Move', rows: [
    { ico: 'joy', ko: '조이스틱', en: 'Joystick', dko: '왼쪽 아래 스틱을 밀면 이동합니다', den: 'Drag the stick at the lower left', bko: '왼쪽', ben: 'Left' },
    { ico: 'look', ko: '둘러보기', en: 'Look around', dko: '화면을 밀면 시선, 두 손가락은 줌', den: 'Drag to look · pinch to zoom' },
    { ico: 'run', ko: '달리기', en: 'Run', dko: '오른쪽 버튼을 누르면 켜지고 꺼집니다', den: 'Tap the button on the right to toggle', bko: '버튼', ben: 'Button' },
  ] },
  { ko: '행동', en: 'Actions', rows: [
    { ico: 'sit', ko: '앉기', en: 'Sit', dko: '오른쪽 앉기 버튼. 한 번 더 누르면 일어섭니다', den: 'Sit on the right. Tap again to stand', bko: '버튼', ben: 'Button' },
    { ico: 'emote', ko: '리액션 · 자리비움', en: 'Reactions · away', dko: '이모트 버튼에서 표현과 자리비움을 고릅니다', den: 'The emote button opens reactions and away', bko: '버튼', ben: 'Button' },
    { ico: 'bike', ko: '바이크', en: 'Bike', dko: '가까이 가면 오른쪽에 금색 버튼이 뜹니다', den: 'A gold button appears on the right when you are close', bko: '금색', ben: 'Gold' },
  ] },
  { ko: '보기 · 대화', en: 'Look & chat', rows: [
    { ico: 'chat', ko: '채팅', en: 'Chat', dko: '아래 가운데 채팅. 끝에 !! 면 외침', den: 'Chat at the bottom center. !! shouts', bko: '버튼', ben: 'Button' },
    { ico: 'view', ko: '위에서 보기', en: 'Top-down', dko: '메뉴에서 위에서 보기를 고릅니다', den: 'Open the menu, then Overview', bko: '메뉴', ben: 'Menu' },
  ] },
];

function rideBanner() {
  if (touchMode()) return '';
  const t = (document.querySelector('#hud .help')?.textContent || '').replace(/\s+/g, ' ').trim();
  if (!t || WALK.has(t)) return '';
  const parts = t.split('·').map((s) => s.trim()).filter(Boolean);
  let title = tr('탑승 중', 'Riding');
  const bits = [];
  for (const p of parts) {
    const m = p.match(/^([A-Za-z0-9↑↓←→]+(?:\/[A-Za-z0-9↑↓←→]+)?)\s+(.+)$/);
    if (!m) { title = p.replace(/카카오바이크/g, '바이크').replace(/kakao\s*bike/gi, 'Bike'); continue; }
    bits.push(`<span><kbd class="cc-key">${esc(m[1])}</kbd><em>${esc(m[2])}</em></span>`);
  }
  if (!bits.length) return '';
  return `<div class="cc-ride"><b>${esc(title)}</b><div class="cc-ride-row">${bits.join('')}</div></div>`;
}

let overlay = null;
let hotTimer = 0;
let hotIdx = 0;
let helpObs = null;

function render() {
  if (!overlay) return;
  const groups = touchMode() ? TOUCH_GROUPS() : KEY_GROUPS();
  let i = 0;
  const body = groups.map((g) => {
    const rows = g.rows.map((r) => rowHtml(r, i++)).join('');
    return `<div class="cc-sec">${esc(tr(g.ko, g.en))}</div>${rows}`;
  }).join('');
  const hint = touchMode()
    ? tr('닫아도 왼쪽 위 금색 ? 로 언제든 다시 볼 수 있어요', 'Close it anytime — the gold ? at the top left brings it back')
    : tr('Esc 또는 바깥을 눌러 닫기 · 왼쪽 위 금색 ? 로 다시 열 수 있어요', 'Esc or tap outside to close · the gold ? at the top left brings it back');
  overlay.querySelector('.cc-body').innerHTML = rideBanner() + body;
  overlay.querySelector('.cc-kicker').textContent = tr('처음 안내', 'First look');
  overlay.querySelector('.cc-title').textContent = tr('조작 안내', 'Controls');
  overlay.querySelector('.cc-sub').textContent = touchMode()
    ? tr('손가락으로 이 동네를 걷는 방법이에요', 'How to walk this town with your fingers')
    : tr('키로 이 동네를 걷는 방법이에요', 'How to walk this town with the keys');
  overlay.querySelector('.cc-x').setAttribute('aria-label', tr('닫기', 'Close'));
  overlay.querySelector('.cc-go').textContent = tr('알겠어요', 'Got it');
  overlay.querySelector('.cc-hint').textContent = hint;
  const btn = document.getElementById('cc-reopen');
  if (btn) {
    const label = tr('조작 안내', 'Controls');
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }
  hotIdx = 0;
  markHot();
}

function rows() { return [...(overlay?.querySelectorAll('.cc-row') || [])]; }
function markHot() {
  const list = rows();
  list.forEach((n, i) => n.classList.toggle('is-hot', !reduceMotion() && i === hotIdx % Math.max(1, list.length)));
}
function startHot() {
  stopHot();
  if (reduceMotion()) return;
  hotTimer = setInterval(() => { hotIdx += 1; markHot(); }, 1600);
}
function stopHot() { if (hotTimer) { clearInterval(hotTimer); hotTimer = 0; } }

function worldReady() { return !inMenu() && !loading(); }

export function openControlsCard() {
  if (!overlay || !worldReady()) return;
  render();
  overlay.hidden = false;
  document.body.classList.add('cc-open');
  document.getElementById('cc-reopen')?.setAttribute('aria-expanded', 'true');
  startHot();
  overlay.querySelector('.cc-x')?.focus();
}

export function closeControlsCard({ remember = true } = {}) {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.classList.remove('cc-open');
  document.getElementById('cc-reopen')?.setAttribute('aria-expanded', 'false');
  stopHot();
  if (remember) writeDismissed();
  if (overlay.contains(document.activeElement)) document.activeElement.blur();
}

function maybeAuto() {
  if (!overlay || !overlay.hidden || !worldReady() || readDismissed()) return;
  openControlsCard();
}

function park() {
  const btn = document.getElementById('cc-reopen');
  if (!btn) return;
  const host = touchMode() ? document.querySelector('#m-hud .m-top-l') : document.querySelector('#hud .hud-meta');
  if (host && btn.parentElement !== host) host.appendChild(btn);
}

function watchHelp() {
  const help = document.querySelector('#hud .help');
  if (!help || helpObs) return;
  helpObs = new MutationObserver(() => { if (overlay && !overlay.hidden) render(); });
  helpObs.observe(help, { childList: true, characterData: true, subtree: true });
}

export function mountControlsCard() {
  if (overlay || document.getElementById('cc-overlay')) return;
  document.body.classList.add('cc-on');
  overlay = document.createElement('div');
  overlay.id = 'cc-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<div class="cc-card" role="dialog" aria-modal="true" aria-labelledby="cc-title">
    <div class="cc-head"><span class="cc-accent" aria-hidden="true"></span><div class="cc-head-t"><span class="cc-kicker"></span><h2 id="cc-title" class="cc-title"></h2><p class="cc-sub"></p></div><button type="button" class="cc-x" aria-label="Close"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button></div>
    <div class="cc-body"></div>
    <button type="button" class="cc-go"></button>
    <p class="cc-hint"></p>
  </div>`;
  document.body.appendChild(overlay);
  park();
  render();
  watchHelp();

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeControlsCard(); });
  overlay.querySelector('.cc-x').addEventListener('click', () => closeControlsCard());
  overlay.querySelector('.cc-go').addEventListener('click', () => closeControlsCard());
  document.getElementById('cc-reopen')?.addEventListener('click', () => {
    if (document.body.classList.contains('cc-open')) closeControlsCard();
    else openControlsCard();
  });
  document.getElementById('help-fold')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (document.body.classList.contains('cc-open')) closeControlsCard();
    else openControlsCard();
  }, true);
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || touchMode() || !document.body.classList.contains('cc-open')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    closeControlsCard();
  }, true);

  const armLoading = () => {
    const loadEl = document.getElementById('enter-loading');
    if (!loadEl || loadEl.dataset.ccw) return;
    loadEl.dataset.ccw = '1';
    new MutationObserver(() => maybeAuto()).observe(loadEl, { attributes: true, attributeFilter: ['hidden'] });
  };
  const mo = new MutationObserver(() => { park(); armLoading(); maybeAuto(); });
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });
  armLoading();
  onLangChange(() => { if (!overlay.hidden) render(); else { const b = document.getElementById('cc-reopen'); if (b) { b.title = tr('조작 안내', 'Controls'); b.setAttribute('aria-label', b.title); } } });
  maybeAuto();
}
