// [depot] 계산대 화면 절반 하늘색 재현·검증 — node scripts/shots-depot-halfsky.mjs [baseUrl] [tag] [w] [h] [dsf] [mobile]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:5231/';
const TAG = process.argv[3] || 'd';
const W = +(process.argv[4] || 1280), H = +(process.argv[5] || 635), DSF = +(process.argv[6] || 2), MOB = process.argv[7] === '1';
const LANES = (process.env.LANES || '9').split(',').map(Number);
const OUT = new URL('../artifacts/halfsky/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const Q = `enter=1&name=Tester&ws=mock&weather=clear&hour=14&noticePopup=0&bgm=0&controlscard=0${process.env.SHOT === '0' ? '' : '&shot=1'}&hangang=0&namsan=0&at=depot${MOB ? '&mobile=1' : ''}`;
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await b.newContext(MOB ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: DSF, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: W, height: H }, deviceScaleFactor: DSF });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message); });
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) { errs.push(m.text()); console.log('CONSOLEERR', m.text().slice(0, 300)); } });
await p.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
const ev = (f, a) => p.evaluate(f, a);
const run = (sec) => ev((s) => window.__jj.depot.interior._dbg.run(s), sec);
// 캔버스 픽셀 검사: 오른쪽 절반 vs 왼쪽 절반, 그리고 GL viewport/scissor 상태
const probe = (label) => ev((label) => {
  const r = window.__jj?.renderer || null;
  const c = document.querySelector('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  const vp = gl.getParameter(gl.VIEWPORT), sc = gl.getParameter(gl.SCISSOR_BOX), st = gl.isEnabled(gl.SCISSOR_TEST);
  const els = document.elementsFromPoint(innerWidth * 0.75, innerHeight * 0.5).slice(0, 4).map((e) => `${e.tagName}#${e.id}.${String(e.className).slice(0, 40)}`);
  return { label, els, cssW: c.clientWidth, cssH: c.clientHeight, bufW: c.width, bufH: c.height, vp: [...vp], sc: [...sc], scissorTest: st, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio };
}, label);
const shot = async (n) => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}${TAG}-${n}.png` }); const pr = await probe(n); console.log('shot', n, pr.cssW === pr.iw && pr.cssH === pr.ih && pr.vp[2] === pr.bufW ? 'FULL' : 'MISMATCH', JSON.stringify(pr)); };
const W0 = +(process.env.W0 || 0); // 처음엔 좁은 창으로 열고, 입장 카드(로딩) 중에 창을 넓힘 = 도훈님 맥 재현
if (W0) await p.setViewportSize({ width: W0, height: H });
await p.goto(`${BASE}?${Q}`, { timeout: 240000 });
if (W0) { await p.waitForFunction(() => document.querySelector('#app canvas'), null, { timeout: 300000, polling: 50 }); await p.waitForTimeout(+(process.env.RZ_DELAY || 0)); await p.setViewportSize({ width: W, height: H }); console.log('resized', W0, '->', W); }
await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 300000 });
if (await ev(() => document.body.classList.contains('in-lobby'))) { // ui-v2 입장 카드 → 입장 버튼
  await p.locator('#lobby-go').click({ timeout: 120000 }); await p.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 120000 }); await p.waitForTimeout(3000);
}
if (!(await ev(() => window.__jj.depot.active))) await ev(() => window.__jj.depot.enter());
await p.waitForFunction(() => window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 120000 });
await p.waitForTimeout(1200);
await shot('00-entrance');
const MODE = process.env.MODE || 'free';
for (let i = 0; i < 6; i++) { // 공지 포스터 닫기 · 모드 고르기
  const did = await ev((mode) => {
    const close = [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent.trim() === '닫기'); if (close) { close.click(); return 'close'; }
    const mc = document.querySelector(`#dp-story .mode .mc[data-v="${mode}"]`); if (mc && mc.offsetParent) return 'mode';
    return '';
  }, MODE);
  if (!did) break;
  if (did === 'mode') await p.locator(`#dp-story .mode .mc[data-v="${MODE}"]`).click(); console.log('ui', did); await p.waitForTimeout(800);
}
if (MODE === 'story') { for (let i = 0; i < 60; i++) { const locked = await ev(() => window.__jj.depot.interior._dbg.story?.locked ?? window.__jj.depot.interior.story?.locked); if (!locked) break; await p.keyboard.press('Space'); await p.waitForTimeout(250); } }
await shot('01-after-ui');
for (const lane of LANES) { try {
  const lx = 16 + (lane - 1) * 3.6 + 0.15;
  await ev((lx) => { const d = window.__jj.depot.interior._dbg; d.setMe(77, 11, 0); d.grabCart();
    for (const [n, x, z] of [['egg', -0.08, 0.15], ['chips', 0.1, -0.2], ['ramen', 0, 0.2], ['tissue', 0, -0.1], ['meat', 0.12, 0]]) d.drop(n, 'upper', x, z, 0);
    d.setCart(lx, 11.5, 0); d.setMe(lx, 12.7, 0); d.grabCart(); d.run(0.3); }, lx);
  await p.waitForTimeout(900);
  await shot(`L${lane}-1-prompt`);
  if (MOB) { const loc = p.locator('#m-hud .m-act:not([hidden])').filter({ hasText: /계산 시작/ }).first(); await loc.waitFor({ timeout: 8000 }); await loc.tap(); }
  else await p.keyboard.press('KeyE');
  await run(2.6);
  await shot(`L${lane}-2-unload`);
  for (let i = 0; i < 40 && (await ev(() => window.__jj.depot.interior._dbg.co.state().phase)) === 'unload'; i++) await run(0.5);
  await run(0.5); await p.waitForTimeout(900);
  console.log('phase', await ev(() => window.__jj.depot.interior._dbg.co.state().phase));
  await shot(`L${lane}-3-pay`);
  if (MOB) await p.locator('#depot-hud .co-pay button').first().tap(); else await p.keyboard.press('KeyE');
  await run(2.0);
  await shot(`L${lane}-4-receipt`);
  await run(9.5); await p.waitForTimeout(500);
  await shot(`L${lane}-5-after`);
  await ev(() => { const d = window.__jj.depot.interior._dbg; d.releaseCart?.(); });
} catch (e) { console.log('lane', lane, 'ERR', e.message.slice(0, 200)); } }
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 5)));
await b.close();
