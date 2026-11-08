// [hud-v3] 왼쪽 위 플레이어 카드 (A안): 아바타(이름 첫 글자) · 이름 · 시계/날씨 | bum 잔액 | 할 일 n/3 | 걸음 m/60분
//   + 카드 아래 '오늘의 할 일' 트래커. econ-ui/hud.js 의 useAltHud 계약(mount·refresh·render·countUp·balanceChip·balanceCoin)을 구현한다
//   → 잔액/할 일 데이터·보상 연출·패널 흐름은 econ-ui 그대로, 모양만 바꾼다. 게스트는 지금 칩처럼 구글 연동으로 안내(ctx.link).
import { econ } from '../econ/index.js';
import { n, sgn, tr, esc, EI, mockTag } from '../econ-ui/kit.js';
import { trackerHtml, guestTrackerHtml } from '../econ-ui/hud.js';
import { dailySlots } from '../econ-ui/questSlots.js';
import { icon } from './icons.js';
import { gicon, giOn } from '../gameIcons.js';
// [game-icons] 칸 이름 앞 작은 아이콘 (?icons=v2 이면 없음)
const ci = (k) => (giOn() ? gicon(k, 13, 'h3-ci') : '');

let card = null, cells = null, trkRoot = null, trk = null, ctx = null;
let shown = 0, anim = 0, deltaT = 0, trackerOpen = true;
let last = { session: null, bal: null, travel: null, daily: null };
const $ = (id) => document.getElementById(id);

/** 플레이어 카드 DOM 을 만든다 (econ 이 없어도 이름·시계는 보이게 먼저) */
export function mountCard() {
  if (card) return card;
  card = document.createElement('div');
  card.id = 'h3-card';
  card.className = 'h3-glass h3-card';
  card.innerHTML = `<div class="h3-me"><span class="h3-av" aria-hidden="true"></span><span class="h3-who"><b class="h3-name"></b><small class="h3-clock"><span class="h3-wx">${icon('sun', 14)}</span><span class="h3-time">--:--</span></small></span></div><div class="h3-cells"></div>`;
  cells = card.querySelector('.h3-cells');
  document.body.appendChild(card);
  // 할 일 트래커: 기존 #ve-hud .ve-trk 스타일(밝은 카드 → v3 CSS 에서 남색 글라스로)을 그대로 쓴다
  trkRoot = document.createElement('div'); trkRoot.id = 've-hud'; trkRoot.className = 've-hud h3-trk-root';
  trk = document.createElement('div'); trk.className = 've-trk';
  trkRoot.appendChild(trk);
  document.body.appendChild(trkRoot);
  cells.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ve]'); if (!b || !ctx) return;
    const k = b.dataset.ve;
    if (k === 'link' || k === 'bal-guest' || k === 'quest-guest') ctx.link();
    else if (k === 'bal') ctx.open('07');
    else if (k === 'move') ctx.open('04a');
    else if (k === 'quest') { trackerOpen = !trackerOpen; render(); }
  });
  trk.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ve]'); if (!b || !ctx) return;
    if (b.dataset.ve === 'link') ctx.link();
    else if (b.dataset.ve === 'all') ctx.open('04a');
  });
  const place = () => {
    // 조작 안내(#hud)를 펼치면 카드 아래에 뜬다 → 트래커는 그 아래로
    const h = $('hud'); const r = h?.getBoundingClientRect();
    const cb = card.getBoundingClientRect();
    const top = Math.max(Math.round(cb.bottom + 8), r && r.width && r.height ? Math.round(r.bottom + 8) : 0);
    trk.style.top = `${top}px`;
  };
  place();
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(place); ro.observe(card); if ($('hud')) ro.observe($('hud')); }
  addEventListener('resize', place);
  setInterval(tick, 1000); tick();
  return card;
}

/** 이름·시계·날씨 (모바일 프로필 칩과 같은 규칙: #nick · #hud-clock 를 읽는다) */
function tick() {
  if (!card) return;
  const nick = ($('nick')?.value || '').trim() || last.session?.displayName || '';
  const name = nick || tr('게스트', 'Guest');
  const nm = card.querySelector('.h3-name'); if (nm.textContent !== name) nm.textContent = name;
  const av = card.querySelector('.h3-av'); const ini = [...name][0]?.toUpperCase() || '';
  if (av.textContent !== ini) av.textContent = ini;
  const ck = ($('hud-clock')?.textContent || '').replace(/\s+/g, ' ').trim();
  const t = card.querySelector('.h3-time'); if (t.textContent !== (ck || '--:--')) t.textContent = ck || '--:--';
}
export const refreshName = tick;

export const cardAlt = {
  mount(o) { ctx = o; mountCard(); return { refresh: this.refresh, render: this.render, countUp: this.countUp }; },
  async refresh() {
    const [session, bal, travel, daily] = await Promise.all([econ.getSession(), econ.getBalance(), econ.getTravelToday(), econ.listQuests('daily')]);
    last = { session, bal, travel, daily };
    if (!anim) shown = bal.total;
    render(); tick();
    return last;
  },
  render: (d) => render(d),
  countUp(from, to, { ms = 900, delta = to - from } = {}) {
    cancelAnimationFrame(anim);
    const t0 = performance.now();
    deltaT = Date.now() + 4000;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
      shown = Math.round(from + (to - from) * e);
      const v = cells?.querySelector('[data-ve="bal-v"]'); if (v) v.textContent = n(shown);
      if (k < 1) anim = requestAnimationFrame(step); else { anim = 0; shown = to; }
    };
    anim = requestAnimationFrame(step);
    render(delta);
    setTimeout(() => render(), 4100);
  },
  balanceChip: () => cells?.querySelector('[data-ve="bal"], [data-ve="bal-guest"]') || null,
  balanceCoin: () => cells?.querySelector('[data-ve="bal"] .v2-ic, [data-ve="bal-guest"] .v2-ic') || null,
};

/** 남은 할 일 수 (액션 바 '할 일' 배지). 게스트·데이터 전이면 null */
export function questsLeft() {
  if (!last.session || last.session.isGuest || !last.daily) return null;
  const { done, total } = dailySlots(last.daily.quests);
  return Math.max(0, total - done);
}

function render(delta = null) {
  if (!cells || !last.session) return;
  const { session, bal, travel, daily } = last;
  const guest = session.isGuest;
  card.classList.toggle('is-guest', guest);
  if (guest) {
    cells.innerHTML = `<button type="button" class="h3-cell h3-bal" data-ve="bal-guest" title="${esc(tr('구글 계정 연동하고 bum 받기', 'Link Google account to earn bum'))}">${EI.coin(24)}<span class="h3-v"><b>0</b><small>bum</small></span></button>
      <button type="button" class="h3-cell h3-link" data-ve="link"><span class="h3-v"><b>${esc(tr('구글 연동하고 bum 받기', 'Link Google to earn bum'))}</b><small>${esc(tr('게스트로 플레이 중', 'Playing as a guest'))}</small></span></button>`;
    trk.innerHTML = trackerOpen ? guestTrackerHtml() : '';
    return;
  }
  const dShow = delta ?? (Date.now() < deltaT ? cells.dataset.delta && +cells.dataset.delta : null);
  if (delta != null) cells.dataset.delta = String(delta);
  const { done, total } = dailySlots(daily.quests);
  const m = travel.minutes, cap = travel.capMinutes || 60;
  const pct = (v, t) => Math.round(Math.max(0, Math.min(1, t ? v / t : 0)) * 100);
  cells.innerHTML = `<button type="button" class="h3-cell h3-bal${dShow ? ' v2-glow' : ''}" data-ve="bal" title="${esc(tr('교통카드 · 지갑 열기', 'Open transit card · wallet'))}">${EI.coin(24)}<span class="h3-v"><b data-ve="bal-v">${n(anim ? shown : bal.total)}</b><small>bum${dShow ? ` <em class="h3-d${dShow < 0 ? ' neg' : ''}">${sgn(dShow)}</em>` : ''}</small></span>${mockTag('mini')}</button>
    <button type="button" class="h3-cell h3-q" data-ve="quest" aria-expanded="${trackerOpen}" title="${esc(trackerOpen ? tr('할 일 접기', 'Hide quests') : tr('할 일 펼치기', 'Show quests'))}"><span class="h3-v"><small>${ci('quest')}${esc(tr('할 일', 'Quests'))}</small><b>${done}/${total}</b></span><span class="h3-prog"><i style="width:${pct(done, total)}%"></i></span><span class="h3-caret${trackerOpen ? ' up' : ''}">${icon('caret', 14)}</span></button>
    <button type="button" class="h3-cell h3-walk" data-ve="move" title="${esc(tr('할 일 · 이동 인정 보기', 'Quests · counted travel'))}"><span class="h3-v"><small>${ci('walk')}${esc(tr('걸음', 'Walk'))}</small><b>${esc(tr(`${m}/${cap}분`, `${m}/${cap} min`))}</b></span><span class="h3-prog mint"><i style="width:${pct(m, cap)}%"></i></span></button>`;
  trk.innerHTML = trackerOpen ? trackerHtml(daily) : '';
}
