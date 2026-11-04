// [econ-ui] ?ui=v2&demo=econ 전용 데모 막대. 모든 프레임을 바로 열고, 상태·무료/유료 모드를 바꾼다. ` (백틱) 키로 접기/펴기.
//   콘솔: __bwEconDemo.open('08c') · __bwEconDemo.dev.boardPost() · __bwEconDemo.dev.setShopAvailable(['roadbike'])
//   콘솔(이전): __bwEconDemo.open('08c') · __bwEconDemo.dev.seed('fig03') · __bwEconDemo.dev.setMode({ transitPaid: true })
import { econ } from '../econ/index.js';
import { el } from '../kit.js';
import { tr, esc } from './kit.js';
import { close } from './layer.js';
import { rewardSequence, openChipTip } from './panels.js';
import { payAndShow, openBlock, showPay } from './transit.js';

export const FRAMES = ['03g', '03', '01a', '01b', '02a', '02b', '04a', '04b', '04c', '05a', '05a2', '05b', '06', '07', '08a', '08b', '08c', '09a', '09b', '10a', '10b', '11'];

export function mountDemo({ open, link, setSuppress }) {
  const dev = econ.dev;
  const paid = async () => (await econ.getEconMode()).transitPaid;
  const ensureSigned = async (seed = 'fig03') => { if ((await econ.getSession()).isGuest) { setSuppress(4000); dev.seed(seed); } };
  const weeklyEv = { kind: 'quest', questId: 'W-WALK', period: 'weekly', amount: 3000, karma: { axis: 'health', points: 20 }, title: { ko: '주간 걷기 120분', en: 'Walk 120 min this week' }, progressText: { ko: '120 / 120분', en: '120 / 120 min' }, coins: 8, balanceAfter: 33500 };
  const extra = {
    '03g': async () => { close(true); dev.reset(); },
    '03': async () => { close(true); setSuppress(4000); dev.seed('fig03'); },
    '02a': async () => { close(true); dev.reset(); dev.signIn({ name: '예시 계정' }); open('02a'); },
    '01b': async () => { close(true); dev.reset(); dev.signIn({ name: '예시 계정' }); open('01b'); },
    '01a': async () => { close(true); dev.reset(); open('01a'); },
    '02b': async () => { await ensureSigned(); openChipTip(); },
    '05a': async () => { await ensureSigned(); close(true); rewardSequence({ ...weeklyEv, balanceAfter: (await econ.getBalance()).total + 3000 }, { stopAt: '05a' }); },
    '05a2': async () => { await ensureSigned(); close(true); rewardSequence({ ...weeklyEv, balanceAfter: (await econ.getBalance()).total + 3000 }, { stopAt: '05a2' }); },
    '05b': async () => { await ensureSigned(); close(true); rewardSequence({ ...weeklyEv, balanceAfter: (await econ.getBalance()).total + 3000 }, { stopAt: '05b' }); },
    '06': async () => { setSuppress(4000); dev.seed('day45'); open('06'); },
    '07': async () => { setSuppress(4000); dev.seed('fig07'); open('07'); },
    '08b': async () => { await ensureSigned(); close(true); await payAndShow({ mode: 'bus', code: 'bus.city', rideId: `demo-bus-${Date.now()}`, where: tr('정자역 07624', 'Jeongja 07624'), hold: true }); },
    '08c': async () => { await ensureSigned(); close(true); dev.setMode({ transitPaid: true }); dev.setBalance(400); const r = await econ.payFare({ mode: 'bus', code: 'bus.city', rideId: `demo-bus-${Date.now()}` }); if (!r.ok) openBlock({ mode: 'bus', code: 'bus.city', err: r.error, onQuests: () => open('04a') }); },
    '09b': async () => { await ensureSigned(); close(true); await payAndShow({ mode: 'subway', code: 'subway.base', rideId: `demo-sub-${Date.now()}`, where: tr('정자역', 'Jeongja Stn.'), hold: true }); },
    '10b': async () => {
      await ensureSigned(); close(true);
      const h = await econ.holdTaxi({ code: 'taxi.drive', estimateMeters: 5000, rideId: `demo-taxi-${Date.now()}` });
      if (!h.ok) return openBlock({ mode: 'taxi', err: h.error, onQuests: () => open('04a') });
      const s = await econ.settleTaxi({ holdId: h.data.holdId, actualMeters: 4600 });
      if (s.ok) { const { openSettle } = await import('./transit.js'); openSettle(s.data, { onWallet: () => open('07') }); }
    },
    '11': async () => { await ensureSigned(); open('11'); },
  };
  const go = async (code) => { if (extra[code]) await extra[code](); else { if (/^0[4-9]|^1[01]/.test(code)) await ensureSigned(); open(code); } };

  const bar = el('div', 've-demo', '');
  const draw = async () => {
    const [s, m] = await Promise.all([econ.getSession(), econ.getEconMode()]);
    bar.innerHTML = `<b class="ve-demo-t">${esc(tr('경제 UI 데모', 'Econ UI demo'))}</b><span class="ve-mock">${esc(tr('예시 데이터', 'Example data'))}</span>
      <span class="ve-demo-g">${[['guest', '게스트', 'Guest'], ['fig03', 'Figma 예시', 'Figma sample'], ['fig07', '지갑 예시', 'Wallet sample'], ['day45', '45일차', 'Day 45'], ['walk', '+걷기 5분', '+Walk 5 min'], ['board', '+게시판 글', '+Board post'], ['srv', '서버식 로그인', 'Server-style login'], ['shopna', '상점: 로드바이크만', 'Shop: road bike only']].map(([k, ko, en]) => `<button type="button" data-st="${k}">${esc(tr(ko, en))}</button>`).join('')}</span>
      <button type="button" class="ve-demo-mode${m.transitPaid ? ' paid' : ''}" data-st="mode">${esc(m.transitPaid ? tr('유료 모드', 'Paid mode') : tr('무료(베타) 모드', 'Free (beta) mode'))}</button>
      <span class="ve-demo-who">${esc(s.isGuest ? tr('게스트', 'Guest') : s.displayName || '')}</span>
      <span class="ve-demo-g ve-demo-f">${FRAMES.map((c) => `<button type="button" data-fr="${c}">${c}</button>`).join('')}</span>`;
  };
  bar.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-fr]'); if (f) { await go(f.dataset.fr); return; }
    const st = e.target.closest('[data-st]')?.dataset.st; if (!st) return;
    close(true);
    if (st === 'guest') dev.reset();
    else if (st === 'mode') { const p = await paid(); dev.setMode({ transitPaid: !p, shopPaid: !p }); }
    else if (st === 'walk') { await ensureSigned(); dev.addWalkMinutes(5); }
    else if (st === 'board') { await ensureSigned(); dev.boardPost(); open('07'); } // 하루 1번: 첫 글만 원장 'board' 행 + 토스트, 그 뒤 글은 아무것도 없음
    else if (st === 'srv') { setSuppress(20000); dev.reset(); dev.signIn({ name: '예시 계정' }); await econ.claimWelcome(); open('01b'); } // 서버: 로그인 때 웰컴 자동 지급 → 02a 는 '확인'
    else if (st === 'shopna') { await ensureSigned(); const all = !(await econ.listShopItems()).every((i) => i.available !== false); dev.setShopAvailable(all ? null : ['roadbike']); open('11'); }
    else { setSuppress(4000); dev.seed(st); }
    draw();
  });
  for (const ev of ['session', 'mode']) econ.on(ev, draw);
  document.body.appendChild(bar);
  draw();
  addEventListener('keydown', (e) => { if (e.key === '`' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) bar.classList.toggle('min'); });
  window.__bwEconDemo = { open: go, openRaw: open, frames: FRAMES, econ, dev, link, showPay, suppress: setSuppress, rewardSequence };
}
