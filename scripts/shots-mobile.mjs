// [mobile] 모바일 모드 스크린샷. 사용: npx vite --port 48xx & URL=http://127.0.0.1:48xx/ OUT=dir node scripts/shots-mobile.mjs
import { chromium, devices } from 'playwright';
const URL = process.env.URL || 'http://127.0.0.1:4861/';
const OUT = process.env.OUT || 'shots-mobile';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (n) => !ONLY || ONLY.includes(n);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ua = devices['iPhone 13'].userAgent;
const errs = [];
const mk = async (w, h, mobile = true) => {
  const ctx = await browser.newContext(mobile ? { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ua, locale: process.env.LOCALE || 'ko-KR' } : { viewport: { width: w, height: h }, locale: process.env.LOCALE || 'ko-KR' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('[console] ' + m.text()));
  return p;
};
const shot = async (p, name) => { await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const Q = 'noticePopup=0&npcs=0&taxis=0';

if (want('portrait')) { const p = await mk(393, 852); await p.goto(URL + '?mobile=1&' + Q); await p.waitForTimeout(2500); await shot(p, '00-portrait-rotate'); await p.context().close(); }

if (want('flow')) {
  const p = await mk(852, 393);
  await p.goto(URL + '?mobile=1&' + Q);
  await p.waitForSelector('#m-landing [data-act="pick"]', { timeout: 60000 }); await p.waitForTimeout(800);
  await shot(p, '01-landing');
  await p.tap('#m-landing [data-act="pick"]'); await p.waitForTimeout(600);
  await shot(p, '02-pick');
  const stn = await p.$$('#m-landing [data-stn]'); if (stn[1]) await stn[1].tap(); await p.waitForTimeout(300);
  await shot(p, '02b-pick-station');
  await p.tap('#m-landing [data-act="go"]');
  await p.waitForSelector('#nick', { state: 'visible', timeout: 120000 }); await p.waitForTimeout(1500);
  await shot(p, '03-lobby');
  await p.fill('#nick', '모바일테스트'); await p.fill('#lobby-pin', '1234').catch(() => {});
  await p.tap('#lobby-go');
  await p.waitForFunction(() => window.__jj?.ready && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 120000 });
  await p.waitForTimeout(5000);
  const err = await p.textContent('#lobby-error').catch(() => ''); if (err) console.log('lobby-error', err);
  await shot(p, '04-walk-hud');
  await p.tap('#m-hud [data-tg="menu"]'); await p.waitForTimeout(400); await shot(p, '05-menu'); await p.tap('#m-hud [data-tg="menu"]'); await p.waitForTimeout(300);
  await p.tap('#m-hud [data-tg="map"]'); await p.waitForTimeout(600); await shot(p, '06-minimap'); await p.tap('#m-hud [data-tg="map"]'); await p.waitForTimeout(300);
  await p.tap('#m-hud [data-tg="emote"]'); await p.waitForTimeout(400); await shot(p, '06b-emote-sheet'); await p.tap('#m-hud .m-sheet:not([hidden]) [data-close]'); await p.waitForTimeout(300);
  // 채팅: 펼쳐서 실제로 3줄 보내기
  await p.tap('#m-hud [data-act="talk"]'); await p.waitForTimeout(300);
  for (const m of ['안녕하세요', '모바일에서 채팅 테스트 중', '정자역 앞이에요']) { await p.fill('#chat-input', m); await p.press('#chat-input', 'Enter'); await p.waitForTimeout(250); }
  await p.waitForTimeout(400); await shot(p, '08-chat-expanded');
  if (process.env.DEBUG) console.log(await p.evaluate(() => ['.m-chat-panel', '.m-chat-panel .m-sheet-head', '.m-chat-hist', '.m-chat-form-slot', '#chat', '#chat-input'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return s + ' ' + [r.top, r.bottom, r.height].map(Math.round); }).join('\n')));
  await p.tap('#m-hud [data-chat-close]'); await p.waitForTimeout(300);
  // 접힘 미리보기: 방금 보낸 줄을 다시 흘려서 확인 (새 메시지 도착 흉내)
  await p.evaluate(() => dispatchEvent(new CustomEvent('bw:chat', { detail: { kind: 'remote', name: '손님', color: '#20c997', text: '반가워요!' } })));
  await p.waitForTimeout(400); await shot(p, '07-chat-collapsed');
  await p.waitForTimeout(5600); await shot(p, '07c-chat-faded');
  // 따릉이 옆으로 이동해서 타기
  const ok = await p.evaluate(() => { const j = window.__jj, pp = j.player.position; let best = null, bd = 1e9; for (const b of j.bikes.list) { const d = Math.hypot(b.x - pp.x, b.z - pp.z); if (d < bd) { bd = d; best = b; } } if (!best) return false; j.teleport(best.x + 0.6, best.z + 0.6, best.y); return true; });
  await p.waitForTimeout(1500); await shot(p, '09-near-bike');
  if (ok) { await p.tap('#m-hud [data-act="ride"]').catch((e) => console.log('ride tap', e.message)); await p.waitForTimeout(2000); await shot(p, '10-riding'); }
  console.log('riding?', await p.evaluate(() => !!window.__jj.bikes.riding));
  await p.context().close();
}

if (want('starbase')) {
  const p = await mk(852, 393);
  await p.goto(URL + '?mobile=1&region=starbase&shot=1&' + Q);
  await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 120000 }); await p.waitForTimeout(4000);
  await shot(p, '11-starbase-event-btn');
  await p.tap('#m-event-btn').catch((e) => console.log('event tap', e.message)); await p.waitForTimeout(500);
  await shot(p, '12-starbase-event-sheet');
  await p.context().close();
}

if (want('pc')) { const p = await mk(1440, 900, false); await p.goto(URL + '?noticePopup=0'); await p.waitForTimeout(6000); await shot(p, '20-pc-unchanged'); console.log('pc body.mobile?', await p.evaluate(() => document.body.classList.contains('mobile'))); await p.context().close(); }
console.log(errs.length ? errs.slice(0, 15).join('\n') : 'no console errors');
await browser.close();
