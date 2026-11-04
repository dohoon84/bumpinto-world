// [econ-mobile] 모바일 경제 UI 점검 스크린샷: 터치 · body.mobile · ?ui=v2&demo=econ (mock) 으로 입장 → 프레임별 스크린샷
// 사용: BASE=http://127.0.0.1:5191 OUT=/workspace/bw-econ-mobile-shots/m [W=852 H=393] [SAFE=59] [STATES=hud,04a,...] node scripts/shots-econ-mobile.mjs
//   상태 이름: hud-guest · hud · menu · menu-guest · 01a · 01b · 02a · 02b · 04a · 04b · 04c · 05a · 05a2 · 05b · 06 · 07 · 07-guest · 08a · 08b · 08c · 09a · 09b · 10a · 10b · 11 · travel · board
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:5191', OUT = process.env.OUT || '/tmp/em';
const W = +(process.env.W || 852), H = +(process.env.H || 393), SAFE = process.env.SAFE ?? '';
const STATES = (process.env.STATES || 'hud-guest,hud').split(',');
const EXTRA = process.env.QS || '';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: +(process.env.DPR || 1), isMobile: true, hasTouch: true, userAgent: UA, locale: 'ko-KR' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' || /econ-mobile/.test(m.text())) errs.push('[console] ' + m.text().slice(0, 200)); });
const tag = `${W}x${H}`;
const shot = (n) => p.screenshot({ path: `${OUT}-${n}-${tag}.png`, timeout: 120000 });
const tap = async (sel) => { const r = await p.locator(sel).first().boundingBox(); if (!r) { console.log('no box', sel); return false; } await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700); return true; };
await p.goto(`${BASE}/?mobile=1&ui=v2&demo=econ&noticePopup=0&enter=1&at=${process.env.AT || 'yatap'}${SAFE ? '&safe=' + SAFE : ''}${EXTRA}`);
await p.waitForSelector('#nick', { state: 'visible', timeout: 120000 });
await p.fill('#nick', '폰테스트');
await tap('#lobby-go');
await p.waitForFunction(() => window.__jj?.ready && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 150000 });
await p.waitForFunction(() => !!window.__bwEconDemo && !!document.querySelector('#m-hud .m-econ-bal'), null, { timeout: 30000 });
await p.evaluate((d) => { document.body.classList.add('ve-shot'); if (d) window.__dumpToast = 1; }, !!process.env.DUMP);
await p.waitForTimeout(3000);
const D = (code) => p.evaluate((c) => window.__bwEconDemo.open(c), code);
const dev = (fn, ...a) => p.evaluate(([f, a]) => window.__bwEconDemo.dev[f](...a), [fn, a]);
const guest = () => p.evaluate(() => { window.__bwEconDemo.suppress(4000); window.__bwEconDemo.dev.reset(); });
const acct = (seed = 'fig03') => p.evaluate((s) => { window.__bwEconDemo.suppress(4000); window.__bwEconDemo.dev.seed(s); }, seed);
const closeAll = () => p.evaluate(() => { document.querySelectorAll('.ve-toast, .ve-next, .ve-float, .v2-coinfly, .ve-paystack, .ve-mini').forEach((e) => e.remove()); document.querySelector('.ve-wrap [data-ve="close"]')?.click(); window.__jjHandset?.close?.(); window.__bwEconMobile?.closePhone?.(); document.querySelector('#m-hud .m-scrim:not([hidden])')?.click(); });
const ACT = {
  'hud-guest': async () => { await guest(); await p.waitForTimeout(600); },
  hud: async () => { await acct(); await p.waitForTimeout(800); },
  'menu-guest': async () => { await guest(); await p.waitForTimeout(300); await tap('#m-hud [data-tg="menu"]'); },
  menu: async () => { await acct(); await p.waitForTimeout(300); await tap('#m-hud [data-tg="menu"]'); },
  '01a': async () => { await D('01a'); await p.waitForTimeout(600); },
  '01b': async () => { await D('01b'); await p.waitForTimeout(600); },
  '02a': async () => { await D('02a'); await p.waitForTimeout(900); },
  '02b': async () => { await D('02b'); await p.waitForTimeout(600); },
  '04a': async () => { await acct(); await tap('#m-hud .m-econ-q'); await p.waitForTimeout(400); },
  '04b': async () => { await D('04b'); await p.waitForTimeout(500); },
  '04c': async () => { await D('04c'); await p.waitForTimeout(500); },
  '05a': async () => { await D('05a'); await p.waitForTimeout(1500); },
  '05a2': async () => { await D('05a2'); await p.waitForTimeout(1500); },
  '05b': async () => { await D('05b'); await p.waitForTimeout(2600); },
  '06': async () => { await D('06'); await p.waitForTimeout(600); },
  '07': async () => { await acct('fig07'); await p.waitForTimeout(300); await tap('#m-hud .m-econ-bal'); await p.waitForTimeout(900); },
  '07-guest': async () => { await guest(); await p.waitForTimeout(300); await p.evaluate(() => window.__bwEconMobile.wallet.open()); await p.waitForTimeout(900); },
  '08a': async () => { await D('08a'); await p.waitForTimeout(600); },
  '08b': async () => { await D('08b'); await p.waitForTimeout(900); },
  '08c': async () => { await D('08c'); await p.waitForTimeout(900); },
  '09a': async () => { await D('09a'); await p.waitForTimeout(600); },
  '09b': async () => { await D('09b'); await p.waitForTimeout(900); },
  '10a': async () => { await D('10a'); await p.waitForTimeout(600); },
  '10b': async () => { await D('10b'); await p.waitForTimeout(900); },
  '11': async () => { await D('11'); await p.waitForTimeout(600); },
  travel: async () => { await acct(); await p.evaluate(() => { window.__bwEconDemo.suppress(0); }); await dev('addWalkMinutes', 60); await p.waitForTimeout(1400); },
  board: async () => { await acct(); await p.evaluate(() => { window.__bwEconDemo.suppress(0); }); await dev('boardPost'); await p.waitForTimeout(1400); },
};
const audit = () => p.evaluate(() => {
  // 조이스틱·행동 버튼과 겹치는 경제 UI 요소
  const box = (el) => el && el.getBoundingClientRect();
  const joy = box(document.getElementById('m-joy')), act = box(document.querySelector('#m-hud .m-actions'));
  const hit = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const out = [];
  for (const el of document.querySelectorAll('.ve-panel, .ve-toast, .ve-paystack, .ve-board, .ve-tip, .ve-next, .ve-mini, .ve-phone, #m-hud .m-econ-q, #m-hud .m-econ-bal')) {
    const r = el.getBoundingClientRect(); if (r.width < 2) continue;
    if (hit(r, joy) || hit(r, act)) out.push(`OVERLAP ${el.className} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`);
    if (r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push(`OFFSCREEN ${el.className}`);
  }
  if (window.__dumpToast) for (const el of document.querySelectorAll('#ve-layer, #ve-layer > *')) { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); out.push('DUMP ' + el.id + '.' + el.className + ' ' + [r.left, r.top, r.width, r.height].map(Math.round) + ' op=' + cs.opacity + ' vis=' + cs.visibility + ' disp=' + cs.display + ' z=' + cs.zIndex); }
  const ids = [...document.querySelectorAll('body *')].filter((e) => e.childElementCount === 0 && /\b[DWM]-[A-Z0-9]{3,}\b/.test(e.textContent || '') && e.getClientRects().length && getComputedStyle(e).display !== 'none').map((e) => e.textContent.trim());
  if (ids.length) out.push('QUEST-ID VISIBLE ' + ids.join(' | '));
  return out;
});
for (const s of STATES) {
  if (!ACT[s]) { console.log('unknown', s); continue; }
  try {
    await ACT[s]();
    await shot(s);
    const a = await audit();
    console.log(s, a.length ? a.join('; ') : 'ok');
  } catch (e) { console.log(s, 'ERR', e.message.split('\n')[0]); }
  await closeAll(); await p.waitForTimeout(500);
}
console.log(errs.slice(0, 12).join('\n') || 'no page errors');
await b.close();
