// [depot] 통합 측정 — 진열 16시점 + 계산대 + 가전, PC 1280×800 과 모바일 844×390(터치). 시점마다 draw calls·tris(1프레임) + 스샷.
//   node scripts/metrics-depot-all.mjs [baseUrl]  → artifacts/depot-int/{d,m}-*.png, metrics-<TAG>.json
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:5211/';
const TAG = process.env.TAG || 'int';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const MODES = (process.env.MODES || 'd,m').split(',');
const OUT = new URL('../artifacts/depot-int/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const Q = 'enter=1&name=Tester&ws=mock&weather=clear&hour=14&noticePopup=0&bgm=0&subwayVoice=0&controlscard=0&shot=1&hangang=0&namsan=0&at=depot';
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
  ['17-mid-aisle-29', [29, 1.6, 30], [29, 1.5, 60]],
  ['20-checkout-overview', [9, 6.5, 17.5], [35, 0.3, 5]],
  ['21-checkout-lane', [27.5, 1.6, 17.5], [27.5, 1.2, 10]],
  ['30-elec-tv-wall', [74.25, 1.75, 16.2], [74.25, 2.55, 29.5]],
  ['31-elec-fridges', [70.1, 1.65, 33.7], [70.1, 1.0, 30.4], 'fridge'],
  ['32-elec-tables', [67.3, 1.5, 33.25], [67.6, 0.95, 34.6]],
];
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const M = { tag: TAG, d: [], m: [], errors: [] };
for (const mode of MODES) {
  const ctx = mode === 'm' ? await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }) : await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { M.errors.push(`${mode} ${e.message}`); console.log('PAGEERR', e.message); });
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) { M.errors.push(`${mode} ${m.text().slice(0, 200)}`); console.log('CONSOLEERR', m.text().slice(0, 200)); } });
  await p.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
  const metric = (label) => p.evaluate(async (label) => {
    const info = window.__jj.renderer.info; await new Promise((r) => requestAnimationFrame(r));
    info.autoReset = false; info.reset(); await new Promise((r) => requestAnimationFrame(() => r())); info.autoReset = true;
    return { label, drawCalls: info.render.calls, triangles: info.render.triangles };
  }, label);
  await p.goto(`${BASE}?${Q}${mode === 'm' ? '&mobile=1' : ''}`, { timeout: 240000 });
  await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 300000 });
  await p.waitForTimeout(4000);
  if (!ONLY || ONLY.includes('ext')) {
    await p.evaluate(() => { const J = window.__jj; J.teleport(-492, 493.5); J.cam.yaw = Math.PI; J.cam.pitch = 0.12; J.cam.dist = 7; });
    await p.waitForTimeout(3500);
    const m = await metric('00-exterior-door'); M[mode].push(m); console.log(mode, JSON.stringify(m));
    await p.screenshot({ path: `${OUT}${mode}-00-exterior-door.png` });
  }
  await p.evaluate(() => window.__jj.depot.enter());
  await p.waitForFunction(() => window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 120000 });
  await p.waitForTimeout(1500);
  for (const [name, pos, tgt, pre] of V) {
    if (ONLY && !ONLY.some((o) => name.includes(o))) continue;
    await p.evaluate(([pos, tgt, pre]) => {
      const d = window.__jj.depot.interior._dbg;
      if (pre === 'fridge') for (let i = 0; i < 6; i++) d.elec.openFridge(i, i % 2 === 0);
      d.setMe(pos[0], pos[2], Math.atan2(pos[0] - tgt[0], pos[2] - tgt[2])); d.camWorld(pos, tgt); d.run(0.3);
    }, [pos, tgt, pre]);
    await p.waitForTimeout(900);
    const m = await metric(name); M[mode].push(m); console.log(mode, JSON.stringify(m));
    await p.screenshot({ path: `${OUT}${mode}-${name}.png` });
  }
  await ctx.close();
}
for (const mode of MODES) { const L = M[mode].filter((v) => !v.label.startsWith('00')); if (L.length) M[`${mode}Max`] = { calls: Math.max(...L.map((v) => v.drawCalls)), tris: Math.max(...L.map((v) => v.triangles)) }; }
writeFileSync(`${OUT}metrics-${TAG}.json`, JSON.stringify(M, null, 1));
console.log('SUMMARY', JSON.stringify({ dMax: M.dMax, mMax: M.mMax, errors: M.errors }));
await b.close();
