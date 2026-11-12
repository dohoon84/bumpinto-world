// [depot] 계산대 구역 스샷·측정 — node scripts/shots-depot-checkout.mjs [baseUrl]  → artifacts/checkout/*.png, metrics.json
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:5211/';
const OUT = new URL('../artifacts/checkout/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const Q = 'enter=1&name=Tester&ws=mock&weather=clear&hour=14&noticePopup=0&bgm=0&controlscard=0&shot=1&hangang=0&namsan=0&at=depot';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message, (e.stack || '').split('\n').slice(1, 3).join('|')); });
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) { errs.push(m.text()); console.log('CONSOLEERR', m.text().slice(0, 300)); } });
await p.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
const M = { views: [] };
const ev = (f, a) => p.evaluate(f, a);
const shot = async (n) => { await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}${n}.png` }); console.log('shot', n); };
const metric = (label) => p.evaluate(async (label) => {
  window.gc?.(); await new Promise((r) => setTimeout(r, 200));
  const info = window.__jj.renderer.info; await new Promise((r) => requestAnimationFrame(r)); info.autoReset = false; info.reset(); await new Promise((r) => requestAnimationFrame(() => r())); info.autoReset = true;
  return { label, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geometries: info.memory.geometries, textures: info.memory.textures, drawCalls: info.render.calls, triangles: info.render.triangles };
}, label);
await p.goto(`${BASE}?${Q}`, { timeout: 240000 });
await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 300000 });
await ev(() => { window.__sfx = []; addEventListener('depot:sfx', (e) => window.__sfx.push(e.detail.name)); });
M.outsideBefore = await metric('outside-door (before)');
await ev(() => window.__jj.depot.enter());
await p.waitForFunction(() => window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 120000 });
const D = 'window.__jj.depot.interior._dbg';
const run = (sec) => ev((s) => window.__jj.depot.interior._dbg.run(s), sec);
// 01 개요: 카트를 (30,15) yaw 0 에 두면 camAt 은 카트 기준 = 월드 오프셋
await ev(() => { const d = window.__jj.depot.interior._dbg; d.setMe(77, 11, 0); d.grabCart(); d.setCart(30, 15, 0); d.releaseCart(); d.setMe(30, 16.2, 0); d.camAt([-21, 6.5, 2.5], [5, 0.3, -10]); d.run(0.3); });
for (const hide of [true, false]) { await ev((h) => window.__jj.depot.interior._dbg.co.hide(h), hide); await p.waitForTimeout(400); M.views.push(await metric(hide ? 'checkout-overview (zone hidden = before)' : 'checkout-overview (zone on = after)')); }
await shot('01-checkout-overview');
await ev(() => window.__jj.depot.interior._dbg.camAt([-9, 2.6, -1.6], [-13, 0.9, -7]));
await shot('01b-lanes-closeup');
// 담고 계산대 04 로
await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; d.camAt(null); I.onKey({ code: 'KeyE' }); const lx = 16 + 3 * 3.6 + 0.15; d.setCart(lx, 11.5, 0);
  d.drop('egg', 'upper', -0.08, 0.15, 0); d.drop('chips', 'upper', 0.1, -0.2, 0); d.drop('ramen', 'upper', 0.0, 0.2, 0); d.drop('tissue', 'upper', 0, -0.1, 0); d.drop('meat', 'upper', 0.12, 0.0, 0); d.drop('soda', 'upper', -0.1, -0.25, 0); d.drop('rice', 'lower', 0, 0, 0); d.drop('water', 'lower', 0.05, 0.2, 0); d.run(1.5); });
M.prompt = await ev(() => document.querySelector('#depot-hud .dh-target').textContent);
await ev(() => window.__jj.depot.interior.onKey({ code: 'KeyE' }));
await run(2.6);
await ev(() => window.__jj.depot.interior._dbg.camAt([0.7, 1.75, 0.9], [-1.15, 0.85, -2.0]));
await shot('02-unloading-conveyor');
await run(1.6);
await ev(() => window.__jj.depot.interior._dbg.camAt([-0.82, 1.52, -3.22], [-0.88, 1.5, -3.96]));
await shot('03-customer-display-total');
for (let i = 0; i < 40 && (await ev(() => window.__jj.depot.interior._dbg.co.state().phase)) === 'unload'; i++) await run(0.5);
await run(0.7);
await ev(() => window.__jj.depot.interior._dbg.camAt(null));
M.payState = await ev(() => window.__jj.depot.interior._dbg.co.state());
await shot('04-payment-panel');
await ev(() => window.__jj.depot.interior.onKey({ code: 'KeyE' }));
await run(1.9);
await ev(() => window.__jj.depot.interior._dbg.camAt([-0.78, 1.04, -3.6], [-0.98, 0.93, -3.8]));
await shot('05-receipt-printing');
await run(2);
M.done = await ev(() => window.__jj.depot.interior._dbg.co.state());
// 06 출구 영수증 확인
await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; d.camAt(null); d.setCart(8.2, 5.2, 0); d.releaseCart(); d.setMe(7.6, 2.6, 0); d.run(0.2); });
M.exitPrompt = await ev(() => document.querySelector('#depot-hud .dh-target').textContent);
await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; I.onKey({ code: 'KeyE' }); d.run(0.8); d.camAt([-1.4, 1.62, -1.9], [1.8, 1.15, -3.2]); });
M.checked = await ev(() => window.__jj.depot.interior._dbg.co.state());
await shot('06-exit-receipt-check');
// 07 빈 박스 코너 + 포장대
await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; d.camAt(null); d.setCart(12.6, 8.5, 0); d.setMe(11.4, 8.0, 0); d.run(0.2); I.onKey({ code: 'KeyE' }); d.run(0.2); d.camAt([1.2, 2.5, 4.6], [-6.5, 0.4, -2.8]); });
await shot('07-free-box-corner');
await ev(() => window.__jj.depot.interior._dbg.camAt([1.4, 2.3, -7.7], [17.4, 0.6, -5.5]));
await shot('07b-packing-tables');
// 08 왼쪽 HUD 알림 (토스트 + 업적, 미니맵 비켜감) — 직원 단계 올리기
await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; d.camAt(null); d.setCart(30, 16, 0); I.onKey({ code: 'KeyE' }); d.staffAt(30, 21); d.mischief('egg', 4); d.run(2.5); d.mischief('ram', 3); d.run(1.5); d.ach('계란탑 5층!'); });
await ev(() => { const I = window.__jj.depot.interior; I._dbg.mischief('floor', 1); });
await run(0.3);
M.hud = await ev(() => { const r = (s) => { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); }; return { panel: r('#depot-hud .dh-panel'), toast: r('#depot-hud .dh-toast'), ach: r('#depot-hud .dh-ach'), bubble: r('#depot-hud .dh-bubble'), chip: r('#depot-hud .co-chip') }; });
await shot('08-hud-left-messages');
await p.setViewportSize({ width: 412, height: 860 }); await ev(() => { const d = window.__jj.depot.interior._dbg; d.mischief('ram', 2); d.ach('범퍼카 3회'); }); await run(0.4);
M.hudMobile = await ev(() => { const r = (s) => { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); }; return { panel: r('#depot-hud .dh-panel'), toast: r('#depot-hud .dh-toast'), ach: r('#depot-hud .dh-ach'), chip: r('#depot-hud .co-chip') }; });
await shot('08b-hud-left-mobile');
await p.setViewportSize({ width: 1280, height: 800 });
// 09 직원 거리 유지 + 표정
const st9 = await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; d.staffAt(30, 10); d.mischief('egg', 7); for (let i = 0; i < 12; i++) d.run(0.5); const S = d.staff(), me = I.st.me, c = I.st.cart; return { mode: S.mode, line: S.line, dMe: +Math.hypot(S.x - me.x, S.z - me.z).toFixed(2), dCart: +Math.hypot(S.x - c.x, S.z - c.z).toFixed(2) }; });
M.staff = st9;
await ev(() => { const I = window.__jj.depot.interior, d = I._dbg, S = d.staff(), me = I.st.me, c = I.st.cart; let ux = me.x - S.x, uz = me.z - S.z; const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L; const px = -uz, pz = ux; d.camAt([S.x + ux * 3.0 + px * 1.6 - c.x, 2.1, S.z + uz * 3.0 + pz * 1.6 - c.z], [(S.x + me.x) / 2 - c.x, 1.0, (S.z + me.z) / 2 - c.z]); d.run(0.1); });
await shot('09-staff-standoff-face');
M.inside = await metric('inside (staff view)');
M.stats = await ev(() => window.__jj.depot.interior.stats());
M.sfx = await ev(() => [...new Set(window.__sfx)]);
await ev(() => window.__jj.depot.leave());
await p.waitForFunction(() => !window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 60000 });
await p.waitForTimeout(2000);
M.outsideAfter = await metric('outside-door (after exit)');
M.errors = errs;
writeFileSync(`${OUT}metrics.json`, JSON.stringify(M, null, 1));
console.log('SUMMARY', JSON.stringify(M));
await b.close();
