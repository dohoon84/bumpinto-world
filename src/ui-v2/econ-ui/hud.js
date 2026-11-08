// [econ-ui] 03 · 03g HUD: 잔액 칩 · 오늘 이동 칩 · 할 일 칩 (1행 y10, 높이 40, 간격 8) + 할 일 트래커 (12, 58, w344)
//   게스트(03g): 잔액 칩과 트래커 자리에 '구글 계정 연동하고 bum 받기' → registerGoogleSignIn 훅.
//   기존 #hud(조작·시계) 오른쪽에 붙는다. 위치는 #hud 너비를 따라간다(ResizeObserver).
import { econ } from '../econ/index.js';
import { el } from '../kit.js';
import { n, sgn, T, tr, esc, EI, mockTag, bar, unitText } from './kit.js';
import { dailySlots } from './questSlots.js';
import { isMoveGoal, moveGoalsHtml, moveMinuteLabel } from './moveGoals.js';

let root = null, row = null, trk = null, ctx = null;
let shown = 0, anim = 0, deltaT = 0, trackerOpen = true;
let last = { session: null, bal: null, travel: null, daily: null };
let lastMinute = null, pulseText = '', pulseUntil = 0;

// [econ-mobile] 모바일(body.mobile)은 HUD 모양만 다르다: src/mobile/econ/hud.js 가 같은 함수들을 대신 제공한다(패널·보상 흐름은 그대로).
let alt = null;
export function useAltHud(a) { alt = a; }

export function balanceChip() { if (alt) return alt.balanceChip(); return row?.querySelector('[data-ve="bal"]') || null; }
export function balanceCoin() { if (alt) return alt.balanceCoin?.() || null; return row?.querySelector('[data-ve="bal"] .v2-ic') || null; }

export function mountEconHud(o) {
  if (alt) return alt.mount(o);
  ctx = o;
  root = el('div', 've-hud'); root.id = 've-hud';
  row = el('div', 've-row'); trk = el('div', 've-trk');
  root.append(row, trk);
  document.body.appendChild(root);
  const place = () => {
    const h = document.getElementById('hud');
    const r = h?.getBoundingClientRect();
    const left = r && r.width ? Math.round(r.right + 8) : 12;
    row.style.left = `${left}px`;
    trk.style.top = `${Math.max(58, r && r.height ? Math.round(r.bottom + 8) : 58)}px`;
  };
  place();
  const h = document.getElementById('hud');
  if (h && 'ResizeObserver' in window) new ResizeObserver(place).observe(h);
  addEventListener('resize', place);
  row.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ve]'); if (!b) return;
    const k = b.dataset.ve;
    if (k === 'link') ctx.link();
    else if (k === 'bal') ctx.open('07');
    else if (k === 'move' || k === 'quest-open') ctx.open('04a');
    else if (k === 'quest') { trackerOpen = !trackerOpen; render(); }
  });
  trk.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ve]'); if (!b) return;
    if (b.dataset.ve === 'link') ctx.link();
    else if (b.dataset.ve === 'all') ctx.open('04a');
  });
  return { refresh, render, countUp };
}

export async function refresh() {
  if (alt) return alt.refresh();
  const [session, bal, travel, daily] = await Promise.all([econ.getSession(), econ.getBalance(), econ.getTravelToday(), econ.listQuests('daily')]);
  last = { session, bal, travel, daily };
  if (!anim) shown = bal.total;
  render();
  return last;
}

/** 05b: 잔액 숫자 올라가기 + 델타 서브칩 */
export function countUp(from, to, { ms = 900, delta = to - from } = {}) {
  if (alt) return alt.countUp(from, to, { ms, delta });
  cancelAnimationFrame(anim);
  const t0 = performance.now();
  deltaT = Date.now() + 4000;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
    shown = Math.round(from + (to - from) * e);
    const v = row.querySelector('[data-ve="bal-v"]'); if (v) v.textContent = n(shown);
    if (k < 1) anim = requestAnimationFrame(step); else { anim = 0; shown = to; }
  };
  anim = requestAnimationFrame(step);
  render(delta);
  setTimeout(() => render(), 4100);
}

export function render(delta = null) {
  if (alt) return alt.render(delta);
  if (!row || !last.session) return;
  const { session, bal, travel, daily } = last;
  const guest = session.isGuest;
  root.classList.toggle('is-guest', guest);
  if (guest) {
    row.innerHTML = `<div class="v2-chip ve-bal ve-bal-guest" data-ve="bal-guest">${EI.coin(24)}<span class="ve-gst"><small>${esc(tr('게스트', 'Guest'))}</small><b>0 bum</b></span>
      <button type="button" class="v2-btn sm primary ve-link" data-ve="link">${esc(tr('구글 계정 연동하고 bum 받기', 'Link Google account to earn bum'))}</button></div>`;
    trk.innerHTML = guestTrackerHtml();
    return;
  }
  const dShow = delta ?? (Date.now() < deltaT ? row.dataset.delta && +row.dataset.delta : null);
  if (delta != null) row.dataset.delta = String(delta);
  const { done, total } = dailySlots(daily.quests); // 서버가 배정한 일일 슬롯 (계정·날짜마다 다름)
  const lab = moveMinuteLabel(travel);
  if (lastMinute != null && lab.m > lastMinute) { pulseText = `+${lab.m - lastMinute}분`; pulseUntil = Date.now() + 1600; }
  lastMinute = lab.m;
  const pulsing = Date.now() < pulseUntil;
  const sub = lab.near
    ? esc(lab.capText)
    : (lab.m && travel.settled ? esc(tr('오늘 지급 완료', 'Paid today')) : lab.m ? esc(tr(`정산 예정 ${n(travel.pendingBum)}`, `Pending ${n(travel.pendingBum)}`)) : esc(tr(`걸으면 분당 ${travel.ratePerMin} bum`, `${travel.ratePerMin} bum per walking min`)));
  row.innerHTML = `<button type="button" class="v2-chip ve-bal${dShow ? ' v2-glow' : ''}" data-ve="bal" title="${esc(tr('교통카드 · 지갑 열기', 'Open transit card · wallet'))}">${EI.coin(24)}<b data-ve="bal-v">${n(anim ? shown : bal.total)}</b><small>bum</small>${dShow ? `<span class="v2-sub ve-d ${dShow < 0 ? 'neg' : ''}">${sgn(dShow)}</span>` : ''}${mockTag('mini')}</button>
    <button type="button" class="v2-chip ve-move${pulsing ? ' ve-tick' : ''}" data-ve="move" title="${esc(lab.near ? `${lab.main} · ${lab.capText}` : lab.main)}"><span class="ve-tile" style="--c:#20c997">${EI.walk(16)}</span><span class="ve-move-copy"><small>${esc(tr('오늘 이동', 'Today'))}</small><b class="${pulsing ? 've-min-pop' : ''}">${esc(lab.short)}</b></span>${pulsing ? `<em class="ve-plus">${esc(pulseText)}</em>` : ''}${lab.near ? bar(lab.m, lab.cap, { w: 56, h: 6, cls: 'mint' }) : ''}
      <span class="v2-sub ve-pend">${sub}</span></button>
    <button type="button" class="v2-chip ve-qchip" data-ve="quest" aria-expanded="${trackerOpen}">${EI.quest(20)}<small>${esc(tr('할 일', 'Quests'))}</small><b>${done}/${total}</b><span class="ve-caret">${trackerOpen ? '▴' : '▾'}</span></button>`;
  if (!trackerOpen) { trk.innerHTML = ''; return; }
  trk.innerHTML = trackerHtml(daily, travel);
}

/** 게스트 트래커 카드 (03g). [hud-v3] 플레이어 카드(src/ui-v2/hud-v3/card.js)도 같은 마크업을 쓴다 */
export function guestTrackerHtml() {
  return `<div class="ve-card ve-guest">
      <div class="ve-trk-h"><span class="ve-tile" style="--c:#20c997">${EI.walk(16)}</span><b>${esc(tr('게스트로 플레이 중', 'Playing as a guest'))}</b></div>
      <p>${esc(tr('걷기·구경·사진, 버스·지하철·택시는 그대로 할 수 있어요. 할 일 보상과 bum 지갑은 구글 계정을 연동하면 열려요.', 'Walking, sightseeing, photos, buses, the subway and taxis all work as usual. Quest rewards and the bum wallet open once you link a Google account.'))}</p>
      <button type="button" class="v2-btn sm primary ve-link" data-ve="link">${esc(tr('구글 계정 연동하고 bum 받기', 'Link Google account to earn bum'))}</button>
      <p class="ve-gnote">${esc(tr('연동하면 지금까지의 기록이 계정으로 이어져요.', 'Linking carries your progress over to the account.'))}</p></div>`;
}

/** 오늘의 할 일 트래커 카드. [hud-v3] 플레이어 카드도 같은 마크업을 쓴다 */
export function trackerHtml(daily, travel = null) {
  const { slots, done, total } = dailySlots(daily.quests);
  const all3 = daily.quests.find((q) => q.id === 'D-ALL3');
  const rest = slots.filter((q) => !isMoveGoal(q.id));
  return `<div class="ve-card">
    <div class="ve-trk-h">${EI.quest(20)}<b>${esc(tr('오늘의 할 일', "Today's quests"))}</b><b class="ve-blue">${done}/${total}</b>${mockTag('mini')}<span class="v2-grow"></span><button type="button" class="ve-lnk" data-ve="all">${esc(tr('전체 보기 ›', 'View all ›'))}</button></div>
    ${moveGoalsHtml(daily.quests, travel)}
    ${rest.map((q) => {
      const ok = q.state !== 'active';
      return `<div class="ve-trow${ok ? ' done' : ''}"><span class="ve-chk">${ok ? EI.check(14) : ''}</span><span class="ve-tt"><span><b>${esc(T(q.title))}</b>${ok ? `<em class="ve-ok">${esc(tr('완료', 'Done'))}</em>` : `<em>${esc(unitText(q.progress, q.id))}</em>`}</span>${ok ? '' : bar(q.progress.value, q.progress.target, { w: 168, h: 6, cls: 'blue' })}</span><span class="ve-amt">${EI.coin(16)}+${n(q.reward.bum)}</span></div>`;
    }).join('')}
    ${all3 ? `<p class="ve-foot">${esc(tr(`${total}개 모두 완료 +${n(all3.reward.bum)} · 꾸준함 ${all3.reward.karma.points}`, `All ${total} done +${n(all3.reward.bum)} · Streak ${all3.reward.karma.points}`))}${all3.state !== 'active' ? ` · ${esc(tr('받음', 'claimed'))}` : ''}</p>` : ''}
  </div>`;
}
