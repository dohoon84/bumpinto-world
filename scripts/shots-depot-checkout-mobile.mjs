// [depot] 계산대 모바일 검증 — node scripts/shots-depot-checkout-mobile.mjs [baseUrl]  → artifacts/checkout/m-*.png, metrics-mobile.json
//   844×390 가로 + 390×844 세로, 터치 에뮬레이션(isMobile·hasTouch). 행동 버튼(.m-act)·결제 패널 버튼을 실제 tap 으로 누른다.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:5211/';
const OUT = new URL('../artifacts/checkout/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const Q = 'enter=1&name=Tester&ws=mock&weather=clear&hour=14&noticePopup=0&bgm=0&controlscard=0&shot=1&hangang=0&namsan=0&at=depot&mobile=1';
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message); });
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) { errs.push(m.text()); console.log('CONSOLEERR', m.text().slice(0, 300)); } });
await p.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
const M = { steps: [] };
const ev = (f, a) => p.evaluate(f, a);
const run = (sec) => ev((s) => window.__jj.depot.interior._dbg.run(s), sec);
const shot = async (n) => { await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}${n}.png` }); console.log('shot', n); };
// HUD 사각형 + 겹침 검사: 알림(패널·토스트·업적·계산 UI) vs 조이스틱·행동 버튼·미니맵·상단 줄
const rects = (label) => ev((label) => {
  const r = (s) => [...document.querySelectorAll(s)].filter((e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.hidden) return false; const b = e.getBoundingClientRect(); return b.width > 2 && b.height > 2; }).map((e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); });
  const msgs = { panel: '#depot-hud .dh-panel', toast: '#depot-hud .dh-toast', ach: '#depot-hud .dh-ach div', pay: '#depot-hud .co-pay', rcpt: '#depot-hud .co-rcpt', chip: '#depot-hud .co-chip', scan: '#depot-hud .co-scan', target: '#depot-hud .dh-target' };
  const ctrl = { joy: '#m-joy', actions: '#m-hud .m-act:not([hidden])', map: '#phone', topL: '#m-hud .m-top-l > *', topR: '#m-hud .m-top-r > *', row2: '#m-hud .m-row2-l > *' };
  const A = {}, B = {}; for (const [k, s] of Object.entries(msgs)) A[k] = r(s); for (const [k, s] of Object.entries(ctrl)) B[k] = r(s);
  const hit = (a, b) => a[0] < b[2] - 1 && a[2] > b[0] + 1 && a[1] < b[3] - 1 && a[3] > b[1] + 1;
  const overlaps = []; for (const [ka, la] of Object.entries(A)) for (const a of la) for (const [kb, lb] of Object.entries(B)) for (const bb of lb) if (hit(a, bb)) overlaps.push(`${ka}×${kb}`);
  const mm = []; const ks = Object.keys(A).filter((k) => k !== 'target'); for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) for (const a of A[ks[i]]) for (const bb of A[ks[j]]) if (hit(a, bb)) mm.push(`${ks[i]}×${ks[j]}`);
  const acts = [...document.querySelectorAll('#m-hud .m-act:not([hidden])')].map((e) => e.textContent.trim()).filter(Boolean);
  return { label, vw: innerWidth, vh: innerHeight, msgs: A, ctrl: B, overlaps, msgOverlaps: mm, acts, rotate: getComputedStyle(document.getElementById('m-rotate') || document.body).display };
}, label);
const step = async (label, png) => { const r = await rects(label); M.steps.push(r); console.log(label, JSON.stringify({ acts: r.acts, overlaps: r.overlaps, msgOverlaps: r.msgOverlaps })); if (png) await shot(png); return r; };
const tapAct = async (re) => { const loc = p.locator('#m-hud .m-act:not([hidden])').filter({ hasText: re }).first(); await loc.waitFor({ timeout: 8000 }); await loc.tap(); };

await p.goto(`${BASE}?${Q}`, { timeout: 240000 });
await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 300000 });
await ev(() => window.__jj.depot.enter());
await p.waitForFunction(() => window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 120000 });
// 터치 안내 문구: 들어온 직후(카트 없음) · 카트 잡은 뒤 — 키 이름(E·WASD·G·Esc·클릭) 없이 탭/버튼 문구여야
const hints = () => ev(() => { const t = (s) => document.querySelector(s)?.textContent || ''; return { panel: t('#depot-hud .dh-kg'), help: t('#depot-hud .dh-help'), target: t('#depot-hud .dh-target') }; });
const keyRe = /(^|[^가-힣A-Za-z])(E|G|R|Q|Esc|WASD|W\/S|A\/D|Tab)([^A-Za-z]|$)|클릭|마우스/;
await p.waitForTimeout(1300);
M.hintsEntry = await hints(); M.hintsEntry.keys = keyRe.test(Object.values(M.hintsEntry).join(' '));
await step('m-entrance', 'm00-landscape-entrance'); console.log('hints', JSON.stringify(M.hintsEntry));
await ev(() => { const d = window.__jj.depot.interior._dbg; d.setMe(29, 30, 0); d.grabCart(); d.run(0.3); });
await p.waitForTimeout(1300);
M.hintsCart = await hints(); M.hintsCart.keys = keyRe.test(Object.values(M.hintsCart).join(' '));
await step('m-cart', 'm00b-landscape-with-cart'); console.log('hints', JSON.stringify(M.hintsCart));
// 장보기 상태: 카트 + 상품 8개, 계산대 04 앞
await ev(() => { const d = window.__jj.depot.interior._dbg; d.setMe(77, 11, 0); d.grabCart();
  d.drop('egg', 'upper', -0.08, 0.15, 0); d.drop('chips', 'upper', 0.1, -0.2, 0); d.drop('ramen', 'upper', 0.0, 0.2, 0); d.drop('tissue', 'upper', 0, -0.1, 0); d.drop('meat', 'upper', 0.12, 0.0, 0); d.drop('soda', 'upper', -0.1, -0.25, 0); d.drop('rice', 'lower', 0, 0, 0); d.drop('water', 'lower', 0.05, 0.2, 0); d.run(1.5);
  const lx = 16 + 3 * 3.6 + 0.15; d.setCart(lx, 11.5, 0); d.setMe(lx, 12.7, 0); d.grabCart(); d.run(0.3); });
await p.waitForTimeout(1300); // 모바일 HUD tick (0.5 s)
await step('m-lane-prompt', 'm01-landscape-lane-action');
await tapAct(/계산 시작/);
await run(2.6);
await p.waitForTimeout(800);
await step('m-unloading', 'm02-landscape-unloading');
for (let i = 0; i < 40 && (await ev(() => window.__jj.depot.interior._dbg.co.state().phase)) === 'unload'; i++) await run(0.5);
await run(0.5); await p.waitForTimeout(1300);
await step('m-pay', 'm03-landscape-pay-panel');
// 결제 패널 안의 범카드 버튼을 직접 tap (행동 버튼도 같은 일)
await p.locator('#depot-hud .co-pay button').first().tap();
await run(2.0);
M.afterPayTap = await ev(() => window.__jj.depot.interior._dbg.co.state().phase);
await step('m-receipt', 'm04-landscape-receipt');
await run(9.5); await p.waitForTimeout(700);
// 출구로
await ev(() => { const d = window.__jj.depot.interior._dbg; d.setCart(8.2, 5.2, 0); d.releaseCart(); d.setMe(7.6, 2.6, 0); d.run(0.2); });
await p.waitForTimeout(1300);
await step('m-exit-prompt');
await tapAct(/영수증/);
await run(0.8);
M.afterCheckTap = await ev(() => window.__jj.depot.interior._dbg.co.state().checked);
await step('m-exit-checked', 'm05-landscape-exit-check');
// 알림 몰아치기 (토스트 + 업적) — 왼쪽 열이 조이스틱/미니맵을 안 덮는지
await ev(() => { const d = window.__jj.depot.interior._dbg; d.mischief('ram', 3); d.ach('범퍼카 3회'); d.ach('계란탑 5층!'); d.run(0.2); });
await p.waitForTimeout(400);
await step('m-hud-messages', 'm06-landscape-hud-messages');
// 세로 390×844
await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(1200);
await ev(() => { const d = window.__jj.depot.interior._dbg; d.mischief('ram', 3); d.ach('세로 화면 업적'); d.run(0.2); });
await step('m-portrait', 'm07-portrait');
M.errors = errs;
writeFileSync(`${OUT}metrics-mobile.json`, JSON.stringify(M, null, 1));
console.log('SUMMARY', JSON.stringify({ afterPayTap: M.afterPayTap, afterCheckTap: M.afterCheckTap, errors: errs }));
await b.close();
