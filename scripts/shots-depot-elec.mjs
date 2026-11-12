/* eslint-env node */
// [depot] 가전 코너 스크린샷·측정 — node scripts/shots-depot-elec.mjs [baseUrl]
// 결과: artifacts/elec/*.png, artifacts/elec/metrics.json
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:5193/';
const OUT = new URL('../artifacts/elec/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const Q = 'enter=1&name=Tester&ws=mock&weather=clear&hour=14&noticePopup=0&bgm=0&subwayVoice=0&controlscard=0&shot=1';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => { errs.push('PAGE ' + e.message); console.log('PAGEERR', e.message); });
p.on('console', (m) => { if (m.type() === 'error') { errs.push('CON ' + m.text()); console.log('CONSOLEERR', m.text().slice(0, 300)); } });
await p.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
const shot = async (name) => { await p.waitForTimeout(700); await p.screenshot({ path: OUT + name }); console.log('shot', name); };
const metric = (label) => p.evaluate(async (label) => {
  window.gc?.(); await new Promise((r) => setTimeout(r, 300)); window.gc?.();
  const J = window.__jj, info = J.renderer.info;
  await new Promise((r) => requestAnimationFrame(r));
  info.autoReset = false; info.reset();
  await new Promise((r) => requestAnimationFrame(() => r()));
  info.autoReset = true;
  const heapMB = +(performance.memory.usedJSHeapSize / 1048576).toFixed(1);
  const elec = J.depot?.interior?.stats?.()?.elec;
  return { label, heapMB, geometries: info.memory.geometries, textures: info.memory.textures, drawCalls: info.render.calls, triangles: info.render.triangles, programs: info.programs?.length, elec };
}, label);
const metrics = { runs: [], errs: [] };

// 기본 입장 콘솔 에러는 1차에서 0건 확인. 재촬영은 창고로 바로.
if (!process.env.SKIP_DEFAULT) {
  await p.goto(`${BASE}?${Q}`, { timeout: 180000 });
  await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await p.waitForTimeout(2000);
  metrics.defaultEntryErrs = errs.slice();
  console.log('default-entry errors', metrics.defaultEntryErrs.length);
}

await p.goto(`${BASE}?${Q}&at=depot`, { timeout: 180000 });
await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await p.waitForTimeout(2000);
await p.evaluate(() => window.__jj.depot.enter());
await p.waitForFunction(() => window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 90000 });
await p.waitForTimeout(1500);

// 1. TV 월 와이드 — 통로 한가운데 갭에서 동쪽 벽을 봄 (yaw = -π/2)
await p.evaluate(() => {
  const d = window.__jj.depot.interior._dbg;
  d.setMe(73.2, 21.6, -Math.PI / 2, 0.12);
  d.camAt(null); d.run(0.25);
});
await p.waitForTimeout(900);
metrics.runs.push(await metric('tv-wall'));
await shot('01-tv-wall-wide.png');

// 2. 냉장고 문 열림 — 스테인리스 1대 정면
await p.evaluate(() => {
  const d = window.__jj.depot.interior._dbg;
  d.openElecDoors(true);
  d.setMe(67.7, 14.6, Math.PI / 2, 0.06);
  d.run(0.8);
});
await p.waitForTimeout(1000);
await shot('02-fridge-door-open.png');

// 3. 소형가전 테이블 — 남쪽에서 내려다봄
await p.evaluate(() => {
  const d = window.__jj.depot.interior._dbg;
  d.setMe(66.6, 22.15, Math.PI, 0.42);
  d.run(0.25);
});
await shot('03-small-appliances-table.png');

// 4. 노트북 테이블
await p.evaluate(() => {
  const d = window.__jj.depot.interior._dbg;
  d.setMe(77.9, 32.45, -Math.PI / 2, 0.48);
  d.run(0.25);
});
await shot('04-laptop-table.png');

// 5. 85인치 박스를 카트에 가로로
const load = await p.evaluate(() => {
  const I = window.__jj.depot.interior, d = I._dbg;
  d.openElecDoors(false);
  while (I.items.length) d.removeLast();
  d.clearFloor();
  d.grabCart();
  d.setCart(72.5, 19.5, 0);
  const ok = d.drop('tv85', 'upper', 0, -0.05, Math.PI / 2, true);
  d.settle(1.2);
  d.camAt([0.2, 1.85, 1.55], [0, 0.7, -0.2]);
  d.run(0.2);
  return { ok, kg: I.items.reduce((a, it) => a + it.p.kg, 0), n: I.items.length, ids: I.items.map((it) => it.p.id) };
});
metrics.tvInCart = load;
console.log('tv in cart', JSON.stringify(load));
await shot('05-giant-tv-in-cart.png');

// 6. 구매 카드 케이지
await p.evaluate(() => {
  const d = window.__jj.depot.interior._dbg;
  d.camAt(null);
  d.releaseCart();
  d.setMe(70.6, 38.0, Math.PI / 2, 0.12);
  d.run(0.25);
});
await shot('06-ticket-cage.png');

metrics.inside = await p.evaluate(() => window.__jj.depot.interior.stats());
metrics.runs.push(await metric('inside-electronics-cage'));
metrics.errs = errs;
writeFileSync(OUT + 'metrics.json', JSON.stringify(metrics, null, 2));
console.log('metrics', JSON.stringify(metrics, null, 2));
await b.close();
if (errs.length) console.log('HAD_ERRORS', errs.length);
