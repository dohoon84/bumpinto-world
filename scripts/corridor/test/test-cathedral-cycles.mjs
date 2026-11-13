// [myeongdong-cathedral] 성당 실내 드나들기 3번 — 힙·지오메트리·텍스처가 늘지 않는지 + 실내 draw/tris
//   node scripts/corridor/test/test-cathedral-cycles.mjs <vite port>
import { chromium } from 'playwright';
const PORT = process.argv[2] || process.env.MYEONGDONG_WALK_PORT || '5231';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/?ws=mock&at=myeongdong&hour=14&weather=clear&shot=1&noticePopup=0&controlscard=0&mobile=1`);
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.myeongdong?.ready, null, { timeout: 300000 });
await page.waitForTimeout(5000);
const res = await page.evaluate(async () => {
  const J = window.__jj, md = J.myeongdong, R = J.renderer, F = md.cathedral.frame;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = async (n) => { const f0 = R.info.render.frame; const t = performance.now(); while (R.info.render.frame < f0 + n && performance.now() - t < 20000) await sleep(100); };
  const snap = async () => { window.gc?.(); await sleep(300); window.gc?.(); return { heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geos: R.info.memory.geometries, tex: R.info.memory.textures }; };
  const go = async (u, v) => { const [x, z] = md.cathedralAt(u, v); J.setMode('follow'); J.teleport(x, z, md.surfaceY(x, z)); await sleep(2500); await frames(3); };
  const out = [];
  await go(F.uF + 40, 0); out.push({ at: 'outside-0', ...(await snap()) });
  for (let i = 1; i <= 3; i++) {
    await go((F.uT + F.uBF) / 2, 0);
    const ins = { at: 'inside-' + i, inside: md.inCathedral(J.player.position.x, J.player.position.z), interiorVisible: !!md.cathedralInterior?.group?.visible, draws: R.info.render.calls, tris: R.info.render.triangles, ...(await snap()) };
    out.push(ins);
    await go(F.uF + 40, 0);
    out.push({ at: 'outside-' + i, interiorVisible: !!md.cathedralInterior?.group?.visible, ...(await snap()) });
  }
  return { cycles: out, interior: md.cathedralInterior?.stats };
});
console.log(JSON.stringify(res, null, 1));
const o = res.cycles.filter((c) => c.at.startsWith('outside'));
const dHeap = o[o.length - 1].heapMB - o[1].heapMB, dGeo = o[o.length - 1].geos - o[1].geos, dTex = o[o.length - 1].tex - o[1].tex;
console.log(`cycle growth after 1st build: heap ${dHeap.toFixed(1)} MB · geometries ${dGeo} · textures ${dTex}`);
console.log('errors', errors.slice(0, 10));
await browser.close();
if (errors.length || dGeo > 0 || dTex > 0 || dHeap > 8) process.exit(1);
