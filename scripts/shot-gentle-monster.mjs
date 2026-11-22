// [gentle-monster] 스크린샷·점검 (headless Chrome + swiftshader). vite 가 PORT 에 떠 있어야 한다.
//   node scripts/shot-gentle-monster.mjs <port> <w> <h> '<views json>' [outDir]
//   view: { name, night, cam:{th,ph,d,tx,ty,tz} | at:{x,z,yaw,pitch,dist,floor?} , tour? }
import fs from 'node:fs';
import { chromium } from 'playwright';
const [PORT = '5311', W = '1280', H = '800', VIEWS_JSON = '[]', OUT = '/workspace/gm-hq'] = process.argv.slice(2);
const MOBILE = +W < 900;
fs.mkdirSync(OUT, { recursive: true });
const views = JSON.parse(VIEWS_JSON);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, isMobile: MOBILE, hasTouch: MOBILE });
const errors = [];
const results = {};
for (const v of views) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${v.name}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${v.name}] ${m.text()}`); });
  const q = `gm=1${v.night ? '&night=1' : ''}${MOBILE ? '&mobile=1' : ''}${v.q ? '&' + v.q : ''}`;
  await page.goto(`http://localhost:${PORT}/?${q}`);
  await page.waitForFunction(() => window.__gm?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(800);
  const info = await page.evaluate(async (v) => {
    const G = window.__gm;
    if (v.cam) { Object.assign(G.cam, v.cam); G.place?.(); }
    if (v.at && G.teleport) G.teleport(v.at);
    if (v.js) await (new Function('G', `return (async()=>{${v.js}})()`))(G);
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, v.wait ?? 1500));
    let top;
    if (v.top) { const L = []; G.scene.traverseVisible((o) => { if (!o.isMesh) return; const g = o.geometry; const t = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); L.push([o.name || o.parent?.name || '?', Math.round(t)]); }); L.sort((a, b) => b[1] - a[1]); top = L.slice(0, v.top); }
    return { top, draws: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles, geo: G.renderer.info.memory.geometries, tex: G.renderer.info.memory.textures, mem: G.mem ? G.mem() : null };
  }, v);
  await page.screenshot({ path: `${OUT}/${v.file || v.name}.png` });
  results[v.name] = info;
  console.log(v.name, JSON.stringify(info));
  await page.close();
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'console errors: 0');
fs.writeFileSync(`${OUT}/_last-run.json`, JSON.stringify({ results, errors }, null, 1));
