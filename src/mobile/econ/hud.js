// [econ-mobile] 모바일 경제 HUD (Figma 45-2 · 01 걷기 HUD 기준)
//   - 1행 프로필 칩 안: 아바타 · [코인 잔액] · | 날씨 · 시각  (Figma 01 의 '30,500' 자리). 누르면 폰 '교통카드' 앱(지갑)
//   - 2행 가방 칩 오른쪽: [할 일 n/total · 이동 m/60분] 칩 하나. 누르면 할 일 시트(매일·주간·월간)
//     탑승 중·정류장 칩이 있을 때는 아이콘+숫자만(화면을 덜 가리게)
//   - 게스트: 프로필 칩에는 '게스트', 2행에는 '구글 계정 연동하고 bum 받기' 칩
//   PC HUD(src/ui-v2/econ-ui/hud.js)와 같은 함수(refresh · render · countUp · balanceChip)를 내놓아
//   패널·보상·결제 흐름(panels.js · transit.js)은 PC 코드를 그대로 쓴다(useAltHud).
import { econ } from '../../ui-v2/econ/index.js';
import { n, sgn, tr, esc, EI, mockTag } from '../../ui-v2/econ-ui/kit.js';
import { GOOGLE_G_SVG } from '../../ui-v2/google.js';
import { dailySlots } from '../../ui-v2/econ-ui/questSlots.js';

let ctx = null, bal = null, row = null;
let shown = 0, anim = 0, deltaT = 0, lastDelta = 0;
let last = { session: null, bal: null, travel: null, daily: null };

export const balanceChip = () => (bal && bal.isConnected && bal.getClientRects().length ? bal : null);
export const balanceCoin = () => bal?.querySelector('.v2-ic') || null;

function place() {
  const prof = document.querySelector('#m-hud .m-profile');
  if (prof && bal && bal.parentNode !== prof) {
    const av = prof.querySelector('.m-avatar');
    if (av) av.after(bal); else prof.prepend(bal);
  }
  const r2 = document.querySelector('#m-hud .m-row2-l');
  if (r2 && row && row.parentNode !== r2) r2.appendChild(row);
  return !!(prof && r2);
}

export function mount(o) {
  ctx = o;
  bal = document.createElement('button');
  bal.type = 'button';
  bal.className = 'm-econ-bal';
  bal.dataset.me = 'bal';
  row = document.createElement('button');
  row.type = 'button';
  row.className = 'm-chip m-econ-q';
  bal.addEventListener('click', () => { if (last.session?.isGuest) ctx.link(); else ctx.open('07'); });
  row.addEventListener('click', () => { if (last.session?.isGuest) ctx.link(); else ctx.open('04a'); });
  // #m-hud 는 game.js 가 먼저 붙인다. 늦으면 생길 때까지 본다.
  if (!place()) {
    const mo = new MutationObserver(() => { if (place()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  return { refresh, render, countUp };
}

export async function refresh() {
  const [session, b, travel, daily] = await Promise.all([econ.getSession(), econ.getBalance(), econ.getTravelToday(), econ.listQuests('daily')]);
  last = { session, bal: b, travel, daily };
  if (!anim) shown = b.total;
  render();
  return last;
}

export function countUp(from, to, { ms = 900, delta = to - from } = {}) {
  cancelAnimationFrame(anim);
  const t0 = performance.now();
  deltaT = Date.now() + 4000; lastDelta = delta;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
    shown = Math.round(from + (to - from) * e);
    const v = bal?.querySelector('[data-me="v"]'); if (v) v.textContent = n(shown);
    if (k < 1) anim = requestAnimationFrame(step); else { anim = 0; shown = to; }
  };
  anim = requestAnimationFrame(step);
  render(delta);
  setTimeout(() => render(), 4100);
}

export function render(delta = null) {
  if (!bal || !last.session) return;
  place();
  const { session, bal: b, travel, daily } = last;
  const guest = session.isGuest;
  document.body.classList.toggle('m-econ-guest', guest);
  if (guest) {
    bal.className = 'm-econ-bal is-guest';
    bal.setAttribute('aria-label', tr('게스트 · 구글 계정 연동하고 bum 받기', 'Guest · Link Google account to earn bum'));
    bal.innerHTML = `${EI.coin(20)}<span class="m-econ-gst">${esc(tr('게스트', 'Guest'))}</span>`;
    row.className = 'm-chip m-econ-q is-link';
    row.innerHTML = `<span class="m-econ-g">${GOOGLE_G_SVG(18)}</span><span class="m-econ-lbl">${esc(tr('구글 계정 연동하고 bum 받기', 'Link Google account to earn bum'))}</span>`;
    row.setAttribute('aria-label', tr('구글 계정 연동하고 bum 받기', 'Link Google account to earn bum'));
    return;
  }
  const d = delta ?? (Date.now() < deltaT ? lastDelta : null);
  bal.className = `m-econ-bal${d ? ' v2-glow' : ''}`;
  bal.setAttribute('aria-label', tr('교통카드 · 지갑 열기', 'Open transit card · wallet'));
  bal.innerHTML = `${EI.coin(20)}<b data-me="v">${n(anim ? shown : b.total)}</b>${d ? `<span class="m-econ-d${d < 0 ? ' neg' : ''}">${sgn(d)}</span>` : ''}${mockTag('mini')}`;
  const { done, total } = dailySlots(daily.quests); // 서버 pickDaily 배정(D-LOGIN + 풀 2개) 그대로, 보너스 D-ALL3 제외
  const m = travel.minutes, cap = travel.capMinutes;
  const pct = Math.max(m > 0 ? 4 : 0, Math.min(100, (m / cap) * 100));
  row.className = 'm-chip m-econ-q';
  row.setAttribute('aria-label', tr(`할 일 ${done}/${total} · 이동 인정 ${m}/${cap}분 · 할 일 열기`, `Quests ${done}/${total} · counted travel ${m}/${cap} min · open quests`));
  row.innerHTML = `${EI.quest(18)}<b class="m-econ-n">${done}/${total}</b><i class="m-econ-div"></i><span class="m-econ-walk">${EI.walk(14)}</span><span class="m-econ-mv"><b>${esc(travel.settled && m ? tr('지급 완료', 'Paid') : tr(`${m}/${cap}분`, `${m}/${cap}m`))}</b><span class="m-econ-bar"><i style="width:${pct}%"></i></span></span>`;
}
