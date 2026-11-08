// [mobile] 실기기 비슷하게: iPhone Chrome(CriOS) UA · 터치 · LAN IP(비보안 http) 로 시작화면 → 역 → 로비 → 입장 → HUD
// 사용: URL="http://<LAN IP>:48xx/?noticePopup=0" OUT=/tmp/shot [UA=...] [ENGINE=webkit] node scripts/e2e-mobile-lan.mjs
import { chromium, webkit } from 'playwright';
const URL = process.env.URL, OUT = process.env.OUT || '/tmp/repro', ENG = process.env.ENGINE || 'chromium';
const UA = process.env.UA || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const b = await (ENG === 'webkit' ? webkit : chromium).launch(ENG === 'webkit' ? {} : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: ENG !== 'webkit' ? true : undefined, hasTouch: true, userAgent: UA, locale: 'ko-KR' });
const p = await ctx.newPage();
const log = [];
p.on('pageerror', (e) => log.push('[pageerror] ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 2).join(' | ')));
p.on('console', (m) => m.type() === 'error' && log.push('[console.error] ' + m.text()));
const tap = async (sel) => { const r = await p.locator(sel).first().boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700); };
const shot = (n) => p.screenshot({ path: `${OUT}-${n}.png` });
await p.goto(URL);
console.log('env', JSON.stringify(await p.evaluate(() => ({ secure: isSecureContext, uuid: typeof crypto.randomUUID, mobile: document.body.className, fs: typeof document.documentElement.requestFullscreen, manifest: !!document.querySelector('link[rel=manifest]') }))));
await p.waitForSelector('#m-landing [data-act="pick"]', { timeout: 90000 }); await p.waitForTimeout(600);
await shot('1-landing');
await tap('#m-landing [data-act="pick"]');
await tap('#m-landing [data-stn]:nth-child(2)');
await shot('2-pick');
await tap('#m-landing [data-act="go"]');
let lobby = false;
try { await p.waitForSelector('#nick', { state: 'visible', timeout: 90000 }); lobby = true; } catch { /* 로그로 */ }
console.log('after go', JSON.stringify(await p.evaluate(() => ({ q: location.search, landing: !!document.getElementById('m-landing'), fatal: document.getElementById('m-fatal')?.innerText || null, body: document.body.className }))), 'lobby', lobby);
await shot('3-lobby');
if (lobby) {
  await p.fill('#nick', '폰테스트');
  console.log('go visible', JSON.stringify(await p.evaluate(() => { const r = document.getElementById('lobby-go').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight]; })));
  await tap('#lobby-go');
  try { await p.waitForFunction(() => window.__jj?.ready && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 120000 }); } catch { console.log('join timeout'); }
  await p.waitForTimeout(4000);
  console.log('hud', JSON.stringify(await p.evaluate(() => ({ hud: !!document.getElementById('m-hud')?.getClientRects().length, joy: !!document.getElementById('m-joy')?.getClientRects().length, body: document.body.className }))));
  await shot('4-hud');
  await tap('#m-hud [data-tg="menu"]'); await shot('5-menu');
  console.log('menu', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.m-menu-item')].map((x) => x.textContent))));
}
console.log(log.slice(0, 20).join('\n') || 'no page errors');
await b.close();
