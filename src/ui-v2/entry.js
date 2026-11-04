// [ui-v2] 04 캐릭터 입장(로비) · 05 입장 로딩 — lobby.js 의 DOM 은 그대로 두고 CSS(게임 패널)와 작은 장식만 얹는다.
//   - 로비 배경 = 고른 역의 실제 장면: 로비를 열기 전에(로딩 화면 아래) 그 역으로 순간이동해 둔다(beforeLobby).
//   - 상단 HUD 줄: ‹ 노선 · 역 선택 / 역 칩(노선 배지) / 게스트 칩 · 오른쪽 EN.
//   - 게스트: '로컬 테스트 모드' 줄 오른쪽에 작은 Google 버튼(공식 가이드), 기존 번호 탭에 Google 안내 한 줄.
//   - 로딩 카드: 금색 제목('○○역에 입장하는 중') + 단계 점 5개 + 저장 위치 안내. 진행 막대·문구는 lobby.js 그대로.
import { el, esc, guestChip, lineMark } from './kit.js';
import { setTop, hideTop, backChip, langChip } from './topbar.js';
import { googleButton, GOOGLE_G_SVG, requestGoogleSignIn, googleNotReadyText } from './google.js';
import { stationLabel, stationLines } from './data.js';
import { ALL_GLOBE_STATIONS } from './stations.js';
import { tr, onLangChange } from '../i18n.js';

const state = { region: 'jeongja', at: null };
export function setEntryStation(regionId, at) { state.region = regionId || 'jeongja'; state.at = at || null; }

function stationChip() {
  const lines = stationLines(state.region, state.at, ALL_GLOBE_STATIONS);
  const c = el('div', 'v2-chip v2-stchip', `${lineMark(24, 8)}<b>${esc(stationLabel(state.region, state.at))}</b>${lines.map((l) => `<span class="v2-sub v2-sub-line" style="--c:${l.c}">${esc(l.t)}</span>`).join('')}`);
  return c;
}

// 입장 카드 뒤 역 장면: 로비에선 원래 게임 프레임을 건너뛴다(그리기 0). v2 는 로비를 연 직후 PEEK_FRAMES 만큼만
// 월드를 그려(그 역 타일 스트리밍 포함) 마지막 프레임을 배경으로 남기고, 그 뒤로는 다시 그리기 0.
const PEEK_FRAMES = 240;
let peek = 0;
export function peekFrame() {
  if (peek <= 0 || !document.body.classList.contains('in-lobby')) return false;
  peek -= 1;
  return true;
}

/** 로비를 열기 직전(로딩 화면이 덮고 있을 때) 고른 역으로 순간이동 → 입장 카드 뒤가 그 역 장면 */
export async function beforeLobby({ at, go }) {
  peek = PEEK_FRAMES;
  await new Promise((r) => setTimeout(r, 0)); // game.js 모듈 평가가 끝난 뒤(travel 준비) 실행
  if (!at || typeof go !== 'function') return;
  try { await Promise.race([go(at), new Promise((r) => setTimeout(r, 8000))]); } catch { /* 실패하면 기본 장면 그대로 */ }
}

function decorateLobby(root) {
  const card = root.querySelector('#lobby-card');
  if (!card || card.dataset.v2) return;
  card.dataset.v2 = '1';
  // 로컬 테스트 모드 줄 + Google 저장 버튼
  const phone = card.querySelector('#lobby-phone');
  if (phone) {
    const row = el('div', 'v2-phone-row');
    phone.replaceWith(row);
    row.appendChild(phone);
    const g = googleButton({ size: 'sm', label: 'save' });
    g.addEventListener('click', async () => {
      const r = await requestGoogleSignIn();
      if (!r.ok) { const err = card.querySelector('#lobby-error'); if (err) err.textContent = r.reason === 'not_ready' ? googleNotReadyText() : tr('로그인하지 못했어요.', 'Sign-in failed.'); }
    });
    row.appendChild(g);
  }
  const load = card.querySelector('#lobby-load');
  if (load && !card.querySelector('.v2-ghint')) {
    const hint = el('div', 'v2-ghint', `<span class="v2-ghint-g">${GOOGLE_G_SVG(16)}</span><span></span>`);
    load.after(hint);
  }
  renderLobbyText(card);
}
function renderLobbyText(card) {
  const hint = card.querySelector('.v2-ghint span:last-child');
  if (hint) hint.textContent = tr('Google로 로그인하면 번호·PIN 없이 이어할 수 있어요 (준비 중)', 'With Google sign-in you can resume without a number or PIN (coming soon)');
}

function lobbyTop() {
  setTop([
    backChip(tr('노선 · 역 선택', 'Line · Station'), () => document.getElementById('lobby-back-globe')?.click()),
    stationChip(),
    guestChip(),
  ], [langChip()]);
}

// ---- 로딩 카드
let dotsObs = null;
function decorateLoading(load) {
  const card = load.querySelector('.enter-card');
  if (!card) return;
  if (!card.querySelector('.v2-enter-title')) {
    card.querySelector('.enter-flight')?.after(el('h2', 'v2-enter-title'));
    const fill = card.querySelector('.enter-fill');
    const dots = el('div', 'v2-enter-dots', '<i></i><i></i><i></i><i></i><i></i>');
    card.querySelector('.enter-track')?.after(dots, el('p', 'v2-enter-foot'));
    dotsObs?.disconnect();
    dotsObs = new MutationObserver(() => {
      const p = parseFloat(fill.style.width) || 0;
      const n = Math.max(1, Math.min(5, Math.ceil(p / 20)));
      dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < n));
    });
    dotsObs.observe(fill, { attributes: true, attributeFilter: ['style'] });
  }
  const label = stationLabel(state.region, state.at);
  card.querySelector('.v2-enter-title').textContent = tr(`${label}에 입장하는 중`, `Entering ${label}`);
  card.querySelector('.v2-enter-foot').textContent = tr('모습·닉네임은 이 기기에 저장돼요 · 게스트', 'Look and nickname are saved on this device · Guest');
}
function loadingTop() { setTop([stationChip(), guestChip()], []); }

/** body 클래스·로딩 화면 상태를 보고 상단 줄을 맞춘다(시작·지구본 화면은 각자 그린다) */
export function mountEntryWatch() {
  let lastMode = '';
  const sync = () => {
    const b = document.body.classList;
    const load = document.getElementById('enter-loading');
    const loading = load && !load.hidden;
    const mode = loading ? 'loading' : b.contains('in-lobby') ? 'lobby' : b.contains('v2-in-start') || b.contains('in-gate') ? 'gate' : 'game';
    if (loading) decorateLoading(load);
    if (mode === 'lobby') { const lb = document.getElementById('lobby'); if (lb) decorateLobby(lb); }
    if (mode === lastMode) return;
    lastMode = mode;
    if (mode === 'loading') loadingTop();
    else if (mode === 'lobby') lobbyTop();
    else if (mode === 'game') hideTop();
  };
  const mo = new MutationObserver(sync);
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });
  const lobby = document.getElementById('lobby');
  if (lobby) mo.observe(lobby, { childList: true });
  // #enter-loading 은 처음 쓸 때 만들어진다 → 생기면 hidden 속성도 본다
  const watchLoading = () => { const l = document.getElementById('enter-loading'); if (l && !l.dataset.v2w) { l.dataset.v2w = '1'; mo.observe(l, { attributes: true, attributeFilter: ['hidden'] }); } };
  new MutationObserver(watchLoading).observe(document.body, { childList: true });
  watchLoading();
  onLangChange(() => {
    lastMode = '';
    const card = document.querySelector('#lobby-card');
    if (card) renderLobbyText(card);
    sync();
  });
  sync();
}
