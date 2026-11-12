/* eslint-env node */
// [depot] 가전 코너 2차 스크린샷·측정 — node scripts/shots-depot-elec2.mjs [baseUrl]
// 결과: artifacts/elec2/*.png, artifacts/elec2/metrics.json  (ONLY=wide,close,... 로 일부만)
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:5193/';
const OUT = new URL('../artifacts/elec2/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const Q = 'enter=1&name=Tester&ws=mock&weather=clear&hour=14&noticePopup=0&bgm=0&subwayVoice=0&controlscard=0&shot=1&hangang=0&namsan=0';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const metrics = { runs: [], errs: [] };
const wire = (p, errs) => {
  p.on('pageerror', (e) => { errs.push('PAGE ' + e.message); console.log('PAGEERR', e.message); });
  p.on('console', (m) => { if (m.type() === 'error') { errs.push('CON ' + m.text()); console.log('CONSOLEERR', m.text().slice(0, 300)); } });
  p.setDefaultTimeout(120000);
  return 0 && p.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
};
const metric = (p, label) => p.evaluate(async (label) => {
  window.gc?.(); await new Promise((r) => setTimeout(r, 200));
  const J = window.__jj, info = J.renderer.info, I = J.depot.interior;
  await new Promise((r) => requestAnimationFrame(r));
  info.autoReset = false; info.reset();
  await new Promise((r) => requestAnimationFrame(() => r()));
  info.autoReset = true;
  const calls = info.render.calls, tris = info.render.triangles;
  // 프레임 비용: update+render 를 직접 20번 재서 평균 (swiftshader라 절대값보다 상대 비교용)
  const t0 = performance.now(); for (let i = 0; i < 20; i++) { I.update(1 / 30); I.render(J.renderer); J.renderer.getContext().finish(); } const ms = (performance.now() - t0) / 20;
  return { label, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), drawCalls: calls, triangles: tris, frameMs: +ms.toFixed(1), elec: I.stats().elec, scene: { meshes: I.stats().meshes, tris: I.stats().tris } };
}, label);
const enterDepot = async (p) => {
  await p.goto(`${BASE}?${Q}&at=depot`, { timeout: 180000 });
  await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__jj.depot.enter());
  await p.waitForFunction(() => window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 90000 });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { window.__sfx = []; window.__jj.depot.interior._dbg.elec.setAudio({ play: (n, o) => window.__sfx.push(n + (o?.on === false ? ':off' : o?.on ? ':on' : '')) }); });
};
const cam = (p, pos, tgt, pre = '') => p.evaluate(([pos, tgt, pre]) => { const d = window.__jj.depot.interior._dbg; if (pre) (0, eval)(pre); d.setMe(pos[0], pos[2], Math.atan2(pos[0] - tgt[0], pos[2] - tgt[2])); d.camWorld(pos, tgt); d.run(0.4); }, [pos, tgt, pre]);

// ───────── 데스크톱 ─────────
{
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; await wire(p, errs);
  const shot = async (name) => { await p.waitForTimeout(600); await p.screenshot({ path: OUT + name, timeout: 120000 }); console.log('shot', name); };
  if (!process.env.SKIP_DEFAULT) {
    await p.goto(`${BASE}?${Q.replace('&hangang=0&namsan=0', '')}`, { timeout: 180000 });
    await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
    await p.waitForTimeout(2500);
    metrics.defaultEntryErrs = errs.slice(); console.log('default-entry errors', errs.length);
  }
  await enterDepot(p);
  if (want('wide')) { await cam(p, [74.25, 1.75, 16.2], [74.25, 2.55, 29.5]); metrics.runs.push(await metric(p, 'tv-wall-wide')); await shot('01-tv-wall-wide.png'); }
  if (want('close')) { await cam(p, [72.6, 1.6, 26.6], [74.4, 2.05, 29.45]); await shot('02-tv-wall-close.png'); }
  if (want('flicker')) { await cam(p, [72.5, 1.6, 24.5], [74.5, 2.3, 29.45], 'window.__jj.depot.interior._dbg.elec.flicker(0.8)'); await shot('02b-tv-wall-flicker.png'); }
  if (want('fridge')) {
    await p.evaluate(() => { const e = window.__jj.depot.interior._dbg.elec; for (let i = 0; i < 6; i++) e.openFridge(i, i % 2 === 0); });
    await cam(p, [70.1, 1.65, 33.7], [70.1, 1.0, 30.4]); metrics.runs.push(await metric(p, 'fridges')); await shot('03-fridge-open.png');
    await cam(p, [67.75, 1.55, 32.3], [67.65, 1.0, 30.4]); await shot('03b-fridge-open-close.png');
    await p.evaluate(() => { const e = window.__jj.depot.interior._dbg.elec; for (let i = 0; i < 6; i++) e.openFridge(i, false); });
  }
  if (want('washer')) { await p.evaluate(() => { const e = window.__jj.depot.interior._dbg.elec; e.act('washer', 0); e.act('washer', 1); }); await cam(p, [75.4, 1.5, 32.6], [75.6, 0.65, 30.4]); await shot('04-washer.png'); }
  if (want('small')) { await cam(p, [78.2, 1.55, 33.05], [78.3, 0.95, 34.6]); await shot('05-small-appliances.png'); }
  if (want('laptop')) { await cam(p, [67.3, 1.5, 33.25], [67.6, 0.95, 34.6]); metrics.runs.push(await metric(p, 'tables')); await shot('06-laptop-table.png'); }
  if (want('robot')) { { const rb = await p.evaluate(() => { const r = window.__jj.depot.interior._dbg.elec.S.robots[0]; return [r.x, r.z]; }); await cam(p, [rb[0] - 0.2, 0.75, rb[1] - 1.15], [rb[0], 0.05, rb[1]]); } await shot('07-robot-vacuum.png'); }
  if (want('chair')) { await p.evaluate(() => window.__jj.depot.interior._dbg.elec.act('chair', 0)); await cam(p, [66.2, 1.6, 36.2], [66.0, 0.7, 38.8]); await shot('07b-massage-chair.png'); }
  if (want('cart')) {
    const load = await p.evaluate(() => {
      const I = window.__jj.depot.interior, d = I._dbg;
      d.camWorld(null);
      while (I.items.length) d.removeLast(); d.clearFloor();
      d.grabCart(); d.setCart(72.5, 19.5, 0);
      const ok = d.drop('tv85', 'upper', 0, -0.05, Math.PI / 2, true);
      d.settle(1.2);
      d.camAt([0.25, 1.9, 1.4], [0, 0.7, -0.2]); d.run(0.2);
      return { ok, kg: I.items.reduce((a, it) => a + it.p.kg, 0), n: I.items.length, ids: I.items.map((it) => it.p.id) };
    });
    metrics.tvInCart = load; console.log('tv in cart', JSON.stringify(load));
    await shot('08-85-box-in-cart.png');
    await p.evaluate(() => { const d = window.__jj.depot.interior._dbg; d.camAt(null); d.releaseCart(); });
  }
  if (want('island')) { await cam(p, [71.2, 1.55, 10.6], [69.4, 0.75, 14.2]); await shot('09-box-island.png'); }
  // 소리 이벤트: 문 열기/닫기·세탁기·TV·청소기
  metrics.sfx = await p.evaluate(async () => {
    const d = window.__jj.depot.interior._dbg, e = d.elec;
    d.camWorld([20, 1.7, 5], [10, 1.7, 5]); d.run(0.5); window.__sfx.length = 0;
    e.act('fridge', 1); d.run(0.2); e.act('fridge', 1); d.run(0.2); e.act('washer', 2); d.run(8);
    d.camWorld([74, 1.7, 22], [74, 2, 29]); d.run(0.5); d.camWorld([80, 1.7, 37], [80, 0, 39]); d.run(0.5); d.camWorld(null);
    return [...new Set(window.__sfx)];
  });
  console.log('sfx', metrics.sfx);
  metrics.desktopErrs = errs;
  await p.close();
}

// ───────── 모바일 (?mobile=1 + 터치) ─────────
for (const [w, h, tag] of [[390, 844, 'portrait'], [844, 390, 'landscape']]) {
  if (ONLY && !ONLY.includes('mobile')) break;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent });
  const p = await ctx.newPage(); const errs = []; await wire(p, errs);
  await p.goto(`${BASE}?${Q}&at=depot&mobile=1`, { timeout: 180000 });
  await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__jj.depot.enter());
  await p.waitForFunction(() => window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 90000 });
  await p.waitForTimeout(1000);
  const r = { tag };
  // 1) TV 월 앞 — 프레임 비용 + 스크린샷
  await p.evaluate(() => { const d = window.__jj.depot.interior._dbg; d.setMe(74.25, 19.0, Math.PI, 0.1); d.run(0.4); });
  r.tv = await metric(p, `mobile-${tag}-tvwall`);
  await p.waitForTimeout(500); await p.screenshot({ path: OUT + `10-mobile-${tag}-tvwall.png` });
  // 2) 냉장고 탭 — 냉장고 앞에서 화면 위쪽(문)을 탭
  await p.evaluate(() => { const d = window.__jj.depot.interior._dbg; d.setMe(67.65, 32.2, 0, -0.1); d.run(0.4); });
  const fx = await p.evaluate(() => { const I = window.__jj.depot.interior, t = I._dbg.elec.targets.find((t) => t.kind === 'fridge' && t.i === 0); const c = t.box.getCenter(new (I.camera.position.constructor)()); c.y = 1.3; c.project(I.camera); return [(c.x + 1) / 2 * innerWidth, (1 - c.y) / 2 * innerHeight]; });
  await p.touchscreen.tap(fx[0], fx[1]); await p.waitForTimeout(1500);
  r.fridgeTap = await p.evaluate(() => ({ want: window.__jj.depot.interior._dbg.elec.S.fridges[0].want, open: +window.__jj.depot.interior._dbg.elec.S.fridges[0].open.toFixed(2) }));
  await p.screenshot({ path: OUT + `11-mobile-${tag}-fridge-tap.png` });
  // 3) 박스 집기 — 카트를 잡고 앞 섬 55" 박스 앞에서 화면 가운데(조준점)를 탭
  await p.evaluate(() => { const I = window.__jj.depot.interior, d = I._dbg; d.elec.openFridge(0, false); d.grabCart(); d.setCart(72.75, 12.45, Math.PI); I.st.head.pitch = -0.5; d.run(0.4); });
  const hov = await p.evaluate(() => { const h = window.__jj.depot.interior.hover; return h?.p?.id || h?.id || (h ? 'yes' : null); });
  await p.touchscreen.tap(w / 2, h / 2); await p.waitForTimeout(900);
  r.pick = await p.evaluate((hov) => { const I = window.__jj.depot.interior; return { hover: hov, mode: I.st.mode, held: I.st.held?.p?.id || null }; }, hov);
  await p.screenshot({ path: OUT + `12-mobile-${tag}-pick.png` });
  if (r.pick.held) { await p.touchscreen.tap(w / 2, h / 2 + 40); await p.waitForTimeout(900); r.place = await p.evaluate(() => { const I = window.__jj.depot.interior; return { mode: I.st.mode, items: I.items.map((it) => it.p.id) }; }); await p.screenshot({ path: OUT + `13-mobile-${tag}-placed.png` }); }
  r.errs = errs; console.log('mobile', JSON.stringify(r));
  (metrics.mobile ||= []).push(r);
  await ctx.close();
}
writeFileSync(OUT + 'metrics.json', JSON.stringify(metrics, null, 2));
console.log('metrics', JSON.stringify(metrics.runs));
await b.close();
