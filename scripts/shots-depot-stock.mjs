// [depot] 범창고 상품 채우기·최적화 스샷/측정 — node scripts/shots-depot-stock.mjs [baseUrl]
// 결과: artifacts/depot-stock/*.png, metrics.json  (SHOTS=0 이면 측정만)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:5197/';
const TAG = process.env.TAG || 'after';
const OUT = new URL('../artifacts/depot-stock/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const Q = 'enter=1&name=Tester&ws=mock&weather=clear&hour=14&noticePopup=0&bgm=0&subwayVoice=0&controlscard=0&shot=1&hangang=0&namsan=0';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message); });
p.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); console.log('CONSOLEERR', m.text().slice(0, 300)); } });
await p.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
const SHOTS = process.env.SHOTS !== '0';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const metric = (label) => p.evaluate(async (label) => {
  window.gc?.(); await new Promise((r) => setTimeout(r, 300)); window.gc?.();
  const J = window.__jj, info = J.renderer.info;
  await new Promise((r) => requestAnimationFrame(r));
  info.autoReset = false; info.reset();
  await new Promise((r) => requestAnimationFrame(() => r()));
  info.autoReset = true;
  const t0 = performance.now(); for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r)); const ft = (performance.now() - t0) / 3;
  return { label, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geometries: info.memory.geometries, textures: info.memory.textures, drawCalls: info.render.calls, triangles: info.render.triangles, frameMs: +ft.toFixed(1) };
}, label);
const M = { tag: TAG, runs: [], views: [] };
await p.goto(`${BASE}?${Q}&at=depot`, { timeout: 240000 });
await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 300000 });
await p.waitForTimeout(5000);
await p.evaluate(() => { const J = window.__jj; J.teleport(-492, 493.5); J.cam.yaw = Math.PI; J.cam.pitch = 0.12; J.cam.dist = 7; });
await p.waitForTimeout(3000);
M.runs.push(await metric('outside-door (before entry)'));
const tEnter = Date.now();
await p.evaluate(() => window.__jj.depot.enter());
await p.waitForFunction(() => window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 120000 });
M.enterMs = Date.now() - tEnter;
await p.waitForTimeout(1500);
M.stats = await p.evaluate(() => window.__jj.depot.interior.stats());
// 시점: [이름, 카메라 월드 pos, target] — 카트를 원점·yaw 0 에 두면 camAt 이 월드 좌표
const V = [
  ['01-entrance-view', [70, 1.6, 9], [52, 2.2, 40]],
  ['02-aisle-grocery', [53.9, 1.6, 15.5], [53.9, 1.3, 40]],
  ['03-aisle-B', [59.4, 1.6, 15.5], [59.4, 1.4, 40]],
  ['04-main-alley', [47, 1.6, 15], [47, 1.8, 100]],
  ['05-wide-overview', [6, 7.4, 6], [50, 1.5, 70]],
  ['06-upper-racks', [27.9, 1.4, 50], [27.9, 4.6, 66]],
  ['07-ceiling', [40, 1.6, 50], [44, 8.6, 70]],
  ['08-frozen', [78, 1.6, 72], [83.2, 1.2, 80]],
  ['09-fresh-back', [43.5, 1.95, 114.6], [47.5, 0.95, 118.7]],
  ['10-produce', [16, 1.65, 107.5], [16, 0.7, 113]],
  ['11-bakery-west', [11, 1.6, 20], [5, 0.9, 28]],
  ['12-household-aisle', [17.2, 1.6, 48], [17.2, 1.4, 74]],
  ['13-deli', [74, 1.65, 110], [74, 1.15, 115]],
  ['14-seasonal', [64, 1.7, 52], [74, 0.8, 70]],
  ['15-alcohol-pet', [12, 1.6, 44], [3, 1.0, 62]],
  ['16-back-aisles', [33.4, 1.6, 81], [33.4, 1.4, 106]],
];
for (const [name, pos, tgt] of V) {
  if (ONLY && !ONLY.some((o) => name.includes(o))) continue;
  console.log('view', name);
  await p.evaluate(([pos, tgt]) => { const d = window.__jj.depot.interior._dbg; d.setCart(0, 0, 0); d.camAt(pos, tgt); d.run(0.05); }, [pos, tgt]);
  await p.waitForTimeout(700);
  const m = await metric(name); M.views.push(m); console.log(JSON.stringify(m));
  if (SHOTS) await p.screenshot({ path: `${OUT}${name}.png` });
}
await p.evaluate(() => window.__jj.depot.interior._dbg.camAt(null));
M.runs.push(await metric('inside (last view)'));
await p.evaluate(() => window.__jj.depot.leave());
await p.waitForFunction(() => !window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 60000 });
await p.waitForTimeout(2500);
M.runs.push(await metric('outside-door (after exit)'));
// 모바일 844×390 (터치) 한 장 — 통로 가운데
if (SHOTS && !ONLY) {
  await p.close();
  const mc = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const mp = await mc.newPage(); mp.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR(m)', e.message); });
  await mp.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
  await mp.goto(`${BASE}?${Q}&at=depot&mobile=1`, { timeout: 240000 });
  await mp.waitForFunction(() => window.__jj?.ready, null, { timeout: 300000 });
  await mp.evaluate(() => window.__jj.depot.enter());
  await mp.waitForFunction(() => window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 120000 });
  await mp.evaluate(() => { const d = window.__jj.depot.interior._dbg; d.setCart(0, 0, 0); d.camAt([29.0, 1.6, 30], [29.0, 1.5, 60]); d.run(0.05); });
  await mp.waitForTimeout(1500);
  M.mobile = await mp.evaluate(async () => { const info = window.__jj.renderer.info; await new Promise((r) => requestAnimationFrame(r)); info.autoReset = false; info.reset(); await new Promise((r) => requestAnimationFrame(() => r())); info.autoReset = true; return { drawCalls: info.render.calls, triangles: info.render.triangles }; });
  console.log('mobile', JSON.stringify(M.mobile));
  await mp.screenshot({ path: `${OUT}20-mobile-844x390.png` });
}
M.maxTris = Math.max(...M.views.map((v) => v.triangles)); M.maxCalls = Math.max(...M.views.map((v) => v.drawCalls));
M.errors = errs;
writeFileSync(`${OUT}metrics-${TAG}.json`, JSON.stringify(M, null, 1));
console.log('SUMMARY', JSON.stringify({ runs: M.runs, maxTris: M.maxTris, maxCalls: M.maxCalls, enterMs: M.enterMs, stats: M.stats, errs: errs.length }));
await b.close();
