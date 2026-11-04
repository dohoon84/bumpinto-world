// [econ-ui] 패널: 02a 웰컴 · 02b 잔액 칩 안내 · 04 할 일 시트 · 05a/05a2/05b 보상 · 06 카르마·업적 · 11 탈것 상점 · 01a/01b 로그인
import { econ } from '../econ/index.js';
import { el, coinFly } from '../kit.js';
import { n, sgn, T, tr, esc, EI, AXIS, axisName, axisTile, mockTag, freeBadge, bumPill, karmaPill, bar, stamp, tag, head, closeBtn, unitText } from './kit.js';
import { show, close, toastLayer } from './layer.js';
import { balanceChip, countUp, refresh } from './hud.js';
import { googleButton } from '../google.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const panel = (cls, html) => el('div', `v2-panel ve-panel ${cls}`, html);
const rays = (s) => `<span class="ve-rays" style="width:${s}px;height:${s}px" aria-hidden="true"></span>`;

// ---------- 02a 웰컴 지급
export async function openWelcome({ onDone } = {}) {
  const w = await econ.getWelcome();
  const p = panel('ve-welcome', `${rays(360)}
    <div class="ve-col c">${EI.coin(96)}${tag(tr('웰컴 보상', 'Welcome reward'), '#ffe169')}${mockTag()}
    <h2>${esc(tr('환영해요! 첫 bum이 도착했어요', 'Welcome! Your first bum has arrived'))}</h2>
    <p class="ve-sub">${esc(tr('계정 연결이 끝나서 아래 금액이 교통카드에 들어왔어요.', 'Your account is linked, so the amounts below go onto your transit card.'))}</p></div>
    ${w.grants.map((g) => `<div class="ve-rowc"><span><b>${esc(T(g.title))}</b><small>${esc(T(g.sub))}</small></span>${bumPill(g.amount, { cls: 'lg' })}</div>`).join('')}
    <div class="ve-sum"><b>${esc(tr('합계', 'Total'))}</b><b class="ve-gold">${n(w.total)} bum</b></div>
    <p class="ve-note">${esc(tr('bum은 게임 안에서만 쓰는 돈이에요. 다른 계정으로 보낼 수 없어요.', 'bum is in-game money only. It cannot be sent to other accounts.'))}</p>
    <button type="button" class="v2-btn primary v2-full" data-ve="take"${w.eligible ? '' : ' disabled'}>${esc(w.claimed ? tr('이미 받았어요', 'Already claimed') : tr('받기', 'Claim'))}</button>`);
  const wrap = show(p, { key: '02a', dim: true, sticky: true });
  p.querySelector('[data-ve="take"]').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const before = (await econ.getBalance()).total;
    const r = await econ.claimWelcome();
    if (!r.ok) { close(); return; }
    const coin = p.querySelector('.ve-col .v2-ic');
    const to = balanceChip();
    wrap.classList.add('fading');
    await refresh();
    if (to) await coinFly(coin, balanceChip() || to, { count: 8 });
    countUp(before, r.data.balance.total);
    close(true);
    openChipTip(r.data.balance.total - before);
    onDone?.();
  });
}

// ---------- 02b 잔액 칩 안내
export async function openChipTip(delta = null) {
  const b = await econ.getBalance();
  const w = await econ.getWelcome();
  const parts = w.grants.map((g) => `${T(g.title).replace(/ 지급$/, '')} ${n(g.amount)}`).join(' + ');
  const login = b.total - w.total;
  const chip = balanceChip();
  const r = chip?.getBoundingClientRect();
  const p = panel('ve-tip', `<span class="ve-tip-arrow" aria-hidden="true"></span>
    <div class="v2-hrow">${EI.coin(20)}<b class="ve-gold ve-t17">${esc(tr('여기가 내 잔액이에요', 'This is your balance'))}</b>${mockTag()}</div>
    <p class="ve-t13">${esc(parts)}${login > 0 ? esc(tr(` + 오늘 첫 접속 ${n(login)}`, ` + first visit ${n(login)}`)) : ''} = ${n(b.total)} bum</p>
    <p class="ve-note">${esc(tr('클릭하면 폰 교통카드 앱이 열리고 내역을 볼 수 있어요.', 'Click it to open the transit card app and see your history.'))}</p>
    <button type="button" class="v2-btn sm primary" data-ve="close">${esc(tr('알겠어요', 'Got it'))}</button>`);
  if (r) { p.style.left = `${Math.round(r.left)}px`; p.style.top = `${Math.round(r.bottom + 12)}px`; }
  show(p, { key: '02b' });
  if (delta) countUp(b.total - delta, b.total, { ms: 10 });
}

// ---------- 04 할 일 시트 (매일 · 주간 · 월간)
const PERIOD = [['daily', '매일', 'Daily'], ['weekly', '주간', 'Weekly'], ['monthly', '월간', 'Monthly']];
export async function openQuests(period = 'daily', { link } = {}) {
  const list = await econ.listQuests(period);
  const p = panel('ve-quests', '');
  const tabs = PERIOD.map(([k, ko, en]) => `<button type="button" class="ve-tab${k === period ? ' on' : ''}" data-tab="${k}">${esc(tr(ko, en))}</button>`).join('');
  let body;
  if (list.guest) {
    body = `<div class="ve-empty">${EI.lock(28, '#9eb4c6')}<b>${esc(T(list.info))}</b><button type="button" class="v2-btn primary" data-ve="link">${esc(tr('구글 계정 연동하고 bum 받기', 'Link Google account to earn bum'))}</button></div>`;
  } else {
    body = `<p class="ve-info">${esc(T(list.info))}</p>
      <div class="ve-qlist">${list.quests.map((q) => {
        const ok = q.state !== 'active';
        return `<div class="ve-qcard${ok ? ' done' : ''}">${axisTile(q.reward.karma?.axis || 'streak', 48)}
          <div class="ve-qmain"><div class="v2-hrow"><b class="ve-t17">${esc(T(q.title))}</b><span class="ve-id">${esc(q.id)}</span></div>
          <div class="v2-hrow">${bar(q.progress.value, q.progress.target, { w: 340, h: 10, cls: ok ? 'green' : 'gold' })}<span class="ve-prog${ok ? ' ok' : ''}">${ok ? esc(tr('완료', 'Done')) : esc(unitText(q.progress, q.id))}</span></div></div>
          <div class="ve-qrw">${bumPill(q.reward.bum)}${karmaPill(q.reward.karma)}</div>${ok ? stamp() : '<span class="ve-stamp-sp"></span>'}</div>`;
      }).join('')}</div>
      <div class="ve-qfoot">${EI.coin(20)}<b>${esc(period === 'daily' ? tr(`오늘 할 일 보상 최대 ${n(list.maxBum)} bum`, `Today's quest rewards up to ${n(list.maxBum)} bum`) : period === 'weekly' ? tr(`이번 주 할 일 보상 최대 ${n(list.maxBum)} bum`, `This week's quest rewards up to ${n(list.maxBum)} bum`) : tr(`이번 달 할 일 보상 최대 ${n(list.maxBum)} bum`, `This month's quest rewards up to ${n(list.maxBum)} bum`))}</b><span class="v2-grow"></span><small>${esc(tr(`받은 보상 ${n(list.claimedBum)} · 남은 보상 ${n(list.maxBum - list.claimedBum)}`, `Claimed ${n(list.claimedBum)} · Left ${n(list.maxBum - list.claimedBum)}`))}</small></div>`;
  }
  p.innerHTML = `<div class="v2-hrow ve-qhead">${head(tr('할 일', 'Quests'), { icon: EI.quest(24), size: 24 })}<div class="ve-tabs">${tabs}</div>${mockTag()}<span class="v2-grow"></span>${closeBtn()}</div>${body}`;
  p.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]'); if (t) openQuests(t.dataset.tab, { link });
    if (e.target.closest('[data-ve="link"]')) link?.();
  });
  show(p, { key: `04${period[0] === 'd' ? 'a' : period[0] === 'w' ? 'b' : 'c'}` });
}

// ---------- 05a 보상 토스트 → 05a2 코인 버스트·흡수 → 05b 잔액 올라가기 + 다음 안내
const queue = [];
let running = false;
export function pushReward(ev) { queue.push(ev); if (!running) drain(); }
async function drain() {
  running = true;
  while (queue.length) { const ev = queue.shift(); await rewardSequence(ev); }
  running = false;
}
/** stopAt: '05a' | '05a2' | '05b' (데모 캡처용으로 그 단계에서 멈춤) */
export async function rewardSequence(ev, { stopAt = null } = {}) {
  const L = toastLayer();
  const weekly = ev.period === 'weekly' || ev.period === 'monthly';
  const t = el('div', 'v2-panel ve-toast', `${rays(240)}
    <span class="ve-tcoin">${EI.coin(64)}</span>
    <div class="ve-col">${tag(weekly ? (ev.period === 'monthly' ? tr('월간 달성!', 'Monthly done!') : tr('주간 달성!', 'Weekly done!')) : ev.kind === 'achievement' ? tr('업적 달성!', 'Achievement!') : tr('할 일 달성!', 'Quest done!'), '#ffe169')}
      <b class="ve-t20">${esc(T(ev.title))}</b>
      <div class="v2-hrow">${bumPill(ev.amount, { cls: 'lg' })}${karmaPill(ev.karma)}${mockTag()}</div>
      ${ev.progressText ? `<small class="ve-sub">${esc(T(ev.progressText))}</small>` : ''}</div>${stamp()}`);
  L.appendChild(t);
  const before = ev.balanceAfter - ev.amount;
  if (stopAt === '05a') return;
  await wait(1400);
  const fly = coinFly(t.querySelector('.ve-tcoin'), balanceChip() || t, { count: ev.coins || 8 });
  if (stopAt === '05a2') { await wait(450); const c = document.querySelector('.v2-coinfly')?.cloneNode(true); if (c) { c.classList.add('ve-freeze'); document.body.appendChild(c); } return; }
  await fly;
  t.remove();
  await refresh();
  countUp(before, ev.balanceAfter, { delta: ev.amount });
  const chip = balanceChip();
  const fl = el('span', 've-float', `+${n(ev.amount)}`);
  if (chip) { const r = chip.getBoundingClientRect(); fl.style.left = `${r.left + 24}px`; fl.style.top = `${r.bottom + 2}px`; }
  L.appendChild(fl);
  const hint = el('div', 'v2-panel ve-next', `${EI.coin(20)}<b>${esc(tr(`잔액 ${n(before)} → ${n(ev.balanceAfter)} bum`, `Balance ${n(before)} → ${n(ev.balanceAfter)} bum`))}</b>${mockTag()}<button type="button" class="v2-btn sm primary">${esc(tr('계속', 'Continue'))}</button>`);
  L.appendChild(hint);
  if (stopAt === '05b') { fl.classList.add('ve-freeze'); return; }
  await new Promise((res) => { const done = () => { hint.remove(); fl.remove(); res(); }; hint.querySelector('button').onclick = done; setTimeout(done, 3200); });
}

// ---------- 06 카르마 · 업적
export async function openKarma({ link } = {}) {
  const k = await econ.getKarma();
  const ach = k.achievements;
  const un = ach.find((a) => a.state === 'unlocked'), nx = ach.find((a) => a.state !== 'unlocked');
  const p = panel('ve-karma', '');
  const axisRow = (a) => {
    const s = k.axes[a], c = AXIS[a].c;
    const pts = a === 'streak' && s.days != null ? s.points : s.points;
    const nextTxt = s.next ? (a === 'streak' ? tr(`다음: ${T(s.next.title)} (${s.days}/${s.next.at}일)`, `Next: ${T(s.next.title)} (${s.days}/${s.next.at} days)`) : tr(`다음: ${T(s.next.title)} ${n(s.next.at)}`, `Next: ${T(s.next.title)} ${n(s.next.at)}`)) : tr('최고 칭호', 'Top title');
    const prog = s.next ? (a === 'streak' ? (s.days || 0) / s.next.at : pts / s.next.at) : 1;
    return `<div class="ve-krow">${axisTile(a, 40)}<div class="ve-kmain"><div class="v2-hrow"><b>${esc(axisName(a))}</b><b style="color:${c}">${esc(tr(`${n(pts)} 점`, `${n(pts)} pts`))}</b>${s.title ? tag(T(s.title), c) : ''}</div>
      <div class="v2-hrow">${`<span class="ve-bar" style="width:280px;height:8px;--bc:${c}"><i style="width:${Math.min(1, prog) * 100}%;background:${c}"></i></span>`}<small>${esc(nextTxt)}</small></div></div></div>`;
  };
  p.innerHTML = `${k.asOf ? `<span class="ve-asof">${esc(T(k.asOf))}</span>` : ''}
    <div class="ve-kl">
      <div class="v2-hrow">${head(tr('카르마', 'Karma'), { icon: EI.karma(20), size: 22 })}<b class="ve-t22 ve-gold">${esc(tr(`총 ${n(k.total)}`, `Total ${n(k.total)}`))}</b>${k.featured ? tag(tr(`대표 칭호 · ${T(k.featured)}`, `Title · ${T(k.featured)}`), '#20c997') : ''}${mockTag()}</div>
      <p class="ve-note">${esc(tr('행동을 하면 축별로 쌓여요. 칭호는 누적 점수로 열려요.', 'Actions add up per axis. Titles unlock by total points.'))}</p>
      ${k.guest ? `<div class="ve-empty sm"><b>${esc(tr('구글 계정을 연동하면 카르마와 업적이 쌓여요', 'Link a Google account to build karma and achievements'))}</b><button type="button" class="v2-btn sm primary" data-ve="link">${esc(tr('구글 계정 연동하고 bum 받기', 'Link Google account to earn bum'))}</button></div>` : ''}
      ${['health', 'explore', 'transit', 'neighbor', 'streak'].map(axisRow).join('')}
    </div>
    <div class="ve-kr">
      ${un ? `<div class="ve-ach on">${tag(tr('업적 달성!', 'Unlocked!'), '#ffe169')}<span class="ve-ach-coin">${EI.coin(28)}</span><b class="ve-t20">${esc(T(un.title))}</b><small class="ve-mono">${esc(un.rule)}</small>${bumPill(un.bonus, { cls: 'lg' })}<small>${esc(tr('(1회)', '(once)'))}</small></div>` : ''}
      ${nx ? `<div class="ve-ach"><b>${esc(tr('진행 중 업적', 'In progress'))}</b><small>${esc(T(nx.title))} · ${esc(tr(`보너스 +${n(nx.bonus)}`, `bonus +${n(nx.bonus)}`))}</small>${bar(nx.progress.value, nx.progress.target, { w: 380, h: 8, cls: 'violet' })}<small>${esc(unitText(nx.progress))}</small></div>` : ''}
      <div class="ve-ach"><b>${esc(tr('칭호 사다리', 'Title ladder'))}</b>${k.ladders.map((l) => `<div class="v2-hrow ve-lad"><span class="ve-dot" style="background:${AXIS[l.axis].c}">${EI[l.axis](10)}</span>${l.steps.map((s) => `<span class="ve-step${s.unlocked ? ' on' : ''}" style="--c:${AXIS[l.axis].c}">${s.unlocked ? '' : EI.lock(10)}${esc(T(s.title))} ${n(s.at)}</span>`).join('')}</div>`).join('')}</div>
    </div>${closeBtn()}`;
  p.addEventListener('click', (e) => { if (e.target.closest('[data-ve="link"]')) link?.(); });
  show(p, { key: '06' });
}

// ---------- 11 탈것 상점
export async function openShop({ link } = {}) {
  const [items, goal, bal, mode] = await Promise.all([econ.listShopItems(), econ.getShopGoal(), econ.getBalance(), econ.getEconMode()]);
  let sel = items.find((i) => !i.owned)?.id || items[0].id;
  const p = panel('ve-shop', '');
  const draw = () => {
    const it = items.find((i) => i.id === sel);
    const can = !bal.guest && !it.owned && (it.free || it.affordable);
    const btn = bal.guest ? `<button type="button" class="v2-btn primary" data-ve="link">${esc(tr('구글 계정 연동하고 bum 받기', 'Link Google account to earn bum'))}</button>`
      : it.owned ? `<button type="button" class="v2-btn secondary" disabled>${EI.check(14)}${esc(tr('보유 중', 'Owned'))}</button>`
        : can ? `<button type="button" class="v2-btn primary" data-ve="buy">${esc(it.free ? tr(`${T(it.name)} 받기 · 무료(베타)`, `Get ${T(it.name)} · Free (Beta)`) : tr(`${T(it.name)} 구매 · ${n(it.price)} bum`, `Buy ${T(it.name)} · ${n(it.price)} bum`))}</button>`
          : `<button type="button" class="v2-btn secondary ve-locked" disabled>${EI.lock(12)}${esc(tr('잔액 부족 · 구매 불가', 'Not enough bum · cannot buy'))}</button>`;
    const pct = goal ? Math.floor((goal.balance / goal.price) * 100) : 0;
    p.innerHTML = `<div class="v2-hrow">${head(tr('탈것 상점', 'Vehicle shop'), { size: 24 })}${tag(tr('실제 가격의 50%', '50% of real price'), '#4cc9f0')}${mode.shopPaid ? '' : freeBadge()}${mockTag()}<span class="v2-grow"></span>${bal.guest ? '' : `<span class="ve-bum lg">${EI.coin(16)}<b>${esc(tr(`내 잔액 ${n(bal.total)} bum`, `Balance ${n(bal.total)} bum`))}</b></span>`}${closeBtn()}</div>
      ${goal ? `<div class="ve-goal"><div class="v2-hrow"><b>${esc(tr(`목표: ${T(items.find((i) => i.id === goal.itemId).name)} ${n(goal.price)} bum`, `Goal: ${T(items.find((i) => i.id === goal.itemId).name)} ${n(goal.price)} bum`))}</b><span class="v2-grow"></span><b class="ve-gold ve-t20">${esc(tr(`${goal.daysLeft}일 남음`, `${goal.daysLeft} days left`))}</b></div>
        ${bar(goal.balance, goal.price, { w: 1180, h: 10, cls: 'gold ve-wide' })}<div class="v2-hrow"><small>${esc(tr(`${n(goal.balance)} / ${n(goal.price)} (${pct}%) · 남은 ${n(goal.remaining)} bum`, `${n(goal.balance)} / ${n(goal.price)} (${pct}%) · ${n(goal.remaining)} bum to go`))}</small><span class="v2-grow"></span><small>${esc(tr(`보통 페이스 하루 순 +${n(goal.typicalDailyNet)} 기준`, `At a typical net +${n(goal.typicalDailyNet)} per day`))}</small></div>
        ${mode.shopPaid ? '' : `<small class="ve-freenote">${esc(tr('베타 기간에는 탈것을 무료로 받을 수 있어요. 목표는 유료 전환 후 기준이에요.', 'During the beta, vehicles are free. The goal shows the post-beta price.'))}</small>`}</div>` : ''}
      <div class="ve-items">${items.map((i) => `<button type="button" class="ve-item${i.id === sel ? ' on' : ''}" data-item="${i.id}"><span class="ve-thumb">${esc(T(i.name))}</span>
        <span class="v2-hrow"><b>${esc(T(i.name))}</b>${!i.owned && !i.affordable && !i.free ? EI.lock(12) : ''}${i.owned ? tag(tr('보유', 'Owned'), '#20c997') : ''}</span>
        <span class="ve-iprice">${EI.coin(18)}${i.free ? `<b>0 bum</b><s>${n(i.listPrice)}</s>` : `<b>${n(i.price)} bum</b>`}</span>
        <small>${esc(tr(`보통 플레이어 약 ${n(i.daysForTypical)}일`, `About ${n(i.daysForTypical)} days for a typical player`))}</small></button>`).join('')}</div>
      <div class="v2-hrow ve-sfoot"><small>${esc(tr('첫 자전거 기준: 라이트 80일 · 헤비 14일 · 구매한 탈것은 선물 불가', 'First bicycle: light player 80 days · heavy 14 days · bought vehicles cannot be gifted'))}</small><span class="v2-grow"></span>${btn}</div>
      <p class="ve-msg" hidden></p>`;
  };
  draw();
  p.addEventListener('click', async (e) => {
    const it = e.target.closest('[data-item]'); if (it) { sel = it.dataset.item; draw(); return; }
    if (e.target.closest('[data-ve="link"]')) { link?.(); return; }
    if (e.target.closest('[data-ve="buy"]')) {
      const r = await econ.purchase(sel);
      const m = p.querySelector('.ve-msg');
      if (r.ok) { const i = items.findIndex((x) => x.id === sel); items[i] = r.data.item; Object.assign(bal, r.data.balance); draw(); const m2 = p.querySelector('.ve-msg'); m2.hidden = false; m2.textContent = r.data.free ? tr(`${T(r.data.item.name)}을(를) 받았어요 (무료 베타, 차감 없음). 탈것 기능은 아직 게임에 연결 전이에요.`, `You got ${T(r.data.item.name)} (free beta, nothing deducted). Vehicles are not wired into the game yet.`) : tr(`${T(r.data.item.name)} 구매 완료 · −${n(r.data.amount)} bum`, `Bought ${T(r.data.item.name)} · −${n(r.data.amount)} bum`); }
      else { m.hidden = false; m.textContent = r.error.code === 'insufficient_balance' ? tr(`잔액 ${n(r.error.shortBy)} bum 부족`, `${n(r.error.shortBy)} bum short`) : T(r.error.message) || r.error.code; }
    }
  });
  show(p, { key: '11' });
}

// ---------- 01a Google 로그인 대기 · 01b 기존 기기 데이터 연결
/** Google 계정 선택 화면 자체는 Google 이 띄운다(GIS 팝업). 여기서는 그동안 게임 쪽 대기 카드만. */
export function openGoogleWait({ onDemoAccount = null, onCancel = null, notReady = false } = {}) {
  const p = panel('ve-gwait', `<div class="v2-hrow">${head(tr('구글 계정 연동', 'Link Google account'), { size: 22 })}<span class="v2-grow"></span>${closeBtn()}</div>
    <p class="ve-t15">${esc(notReady ? tr('Google 로그인은 곧 열려요. 지금은 게스트로 계속할 수 있어요.', 'Google sign-in opens soon. You can keep playing as a guest.') : tr('Google 창에서 계정을 골라 주세요. 이름·이메일·프로필 사진만 받아요.', 'Choose an account in the Google window. We only receive your name, email and profile picture.'))}</p>
    <div class="ve-gbox">${notReady ? '' : '<span class="ve-spin" aria-hidden="true"></span>'}<span>${esc(tr('Google 계정 선택 화면은 Google이 직접 띄워요 (이 카드는 게임 쪽 대기 화면).', 'Google shows its own account chooser (this card is the in-game waiting screen).'))}</span></div>
    <div class="ve-grow2"></div>
    ${onDemoAccount ? `<div class="ve-demo-acc">${mockTag()}<button type="button" class="v2-btn sm secondary" data-ve="demo-acc">${esc(tr('예시 계정으로 계속 (개발용)', 'Continue with example account (dev)'))}</button></div>` : ''}`);
  const gb = googleButton({ label: 'continue', full: true });
  gb.disabled = !notReady ? true : true;
  p.querySelector('.ve-grow2').appendChild(gb);
  p.addEventListener('click', (e) => { if (e.target.closest('[data-ve="demo-acc"]')) onDemoAccount?.(); });
  show(p, { key: '01a', dim: true, onClose: onCancel });
}

export async function openMigrate({ onContinue, onLater } = {}) {
  const w = await econ.getWelcome();
  const beta = w.grants.find((g) => g.kind === 'beta');
  const local = localItems();
  const p = panel('ve-migrate', `${tag(tr('Google 로그인 완료', 'Signed in with Google'), '#20c997')}
    <div class="v2-hrow">${head(tr('기존 기기 데이터 연결', 'Link data from this device'), { size: 24 })}${mockTag()}</div>
    <p class="ve-t15">${esc(tr('이 PC에서 플레이한 데이터를 계정으로 옮길까요? 다른 PC에서도 같은 기록으로 이어서 할 수 있어요.', 'Move what you played on this PC to your account? You can then continue on other PCs.'))}</p>
    ${local.map(([ko, en, v]) => `<div class="ve-rowc"><span class="v2-hrow">${EI.check(14, '#20c997')}<b>${esc(tr(ko, en))}</b></span><small>${esc(v)}</small></div>`).join('')}
    ${beta ? `<div class="ve-rowc gold"><b>${esc(tr('베타 감사 지급 (오픈 30일 안에 연결)', 'Beta thank-you (link within 30 days of launch)'))}</b>${bumPill(beta.amount, { cls: 'lg' })}</div>` : ''}
    <p class="ve-note">${esc(tr('계정당 PC 최대 5대 (가정) · 이 PC 1/5', 'Up to 5 PCs per account (assumed) · this PC 1/5'))}</p>
    <div class="ve-warn"><b>${esc(tr('다른 계정에 이미 연결된 기기라면', 'If this device is linked to another account'))}</b><small>${esc(tr('"이 기기는 다른 계정에 연결돼 있어요" · 재연결은 7일 후 · 복구는 전화번호 + PIN', '"This device is linked to another account" · relink after 7 days · recover with phone + PIN'))}</small></div>
    <div class="v2-hrow"><button type="button" class="v2-btn primary ve-g2" data-ve="go">${esc(tr('연결하고 계속', 'Link and continue'))}</button><button type="button" class="v2-btn secondary" data-ve="later">${esc(tr('나중에', 'Later'))}</button></div>`);
  p.addEventListener('click', (e) => {
    if (e.target.closest('[data-ve="go"]')) { close(true); onContinue?.(); }
    if (e.target.closest('[data-ve="later"]')) { close(true); onLater?.(); }
  });
  show(p, { key: '01b', dim: true, sticky: true });
}
// 이 기기에 있는 것(로컬 저장값)만 세어 보여준다. 실제 옮기기는 #21(feat/accounts) 의 계정 연결이 한다.
function localItems() {
  let rides = 0;
  try { rides = JSON.parse(localStorage.getItem('bw.rideLog.v1') || '[]').length || 0; } catch { /* noop */ }
  const mv = tr('이 PC → 계정으로 이동', 'This PC → account');
  return [['받은 선물', 'Gifts received', mv], ['사진', 'Photos', mv], ['이동·탑승 기록', 'Travel & ride log', rides ? tr(`${rides}건 · 계정으로 이동`, `${rides} · moves to account`) : mv]];
}
