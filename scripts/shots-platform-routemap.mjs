// 승강장 노선도 스크린샷 (패널 · 상세 오버레이 · 모바일)
//   npm run build && npx vite preview --port 4397 --strictPort --host 127.0.0.1
//   BASE=http://127.0.0.1:4397/ OUT=/workspace/bw-routemap-shots node scripts/shots-platform-routemap.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:4397/';
const OUT = process.env.OUT || '/workspace/bw-routemap-shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const errs = [];
const Q = '?enter=1&name=Tester&ws=mock&bus=sim&hour=14&weather=clear&shot=1&lang=ko&subwayRt=0&noticePopup=0&bgm=0&subwayVoice=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0';

async function open(tag, qs, viewport = { width: 1280, height: 800 }) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${tag} console: ${m.text().slice(0, 180)}`); });
  await page.addInitScript(() => {
    const st = { draws: 0, frames: 0 }; window.__probe = st;
    for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
      if (!C) continue;
      for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const o = C.prototype[fn]; C.prototype[fn] = function (...a) { st.draws++; return o.apply(this, a); };
      }
    }
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { st.frames++; cb(t); });
  });
  await page.goto(B + Q + qs, { timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  return page;
}

const measure = (page) => page.evaluate(async () => {
  window.gc?.(); const st = window.__probe; st.draws = 0; st.frames = 0;
  const t0 = performance.now(); await new Promise((r) => setTimeout(r, 2500));
  const dt = (performance.now() - t0) / 1000;
  const info = __jj.renderer.info;
  return {
    fps: +(st.frames / dt).toFixed(1),
    draws: Math.round(st.draws / Math.max(1, st.frames)),
    calls: info.render.calls, tris: info.render.triangles,
    geometries: info.memory.geometries, textures: info.memory.textures,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  };
});

const until = (page, fn, arg, t = 120000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });

const R = { on: {}, off: {}, meta: {} };

const page = await open('on', '');
// 정자 수인분당 왕십리 방면 승강장
await page.evaluate(() => __jj.subway.enterById('x1'));
await until(page, () => __jj.subway.state.phase === 'inside' && __jj.subway.room === 'concourse' && !__jj.subway.swapping);
await page.waitForTimeout(800);
await page.evaluate(() => __jj.subway.toPlatform('suin', 1));
await until(page, () => __jj.subway.room === 'platform' && !__jj.subway.swapping);
await page.waitForTimeout(1200);

R.meta.platform = await page.evaluate(() => {
  const p = __jj.subway.inside;
  return {
    station: __jj.subway.station.name, line: p.line, dir: p.dir,
    slots: p.mapSlots?.length || 0, hasMesh: !!p.mapMesh, hasData: !!p.routeMap,
    me: p.routeMap?.me, stops: p.routeMap?.stops?.length, transfer: p.routeMap?.transfer?.map((t) => t.key),
  };
});

// 패널 정면으로 카메라
await page.evaluate(() => {
  const p = __jj.subway.inside;
  const s = p.mapSlots?.[0] || { x: 12 };
  p.setView(s.x, -1.4, Math.PI, 0.12, 3.2);
});
await page.waitForTimeout(900);
R.on.panel = await measure(page);
await page.screenshot({ path: `${OUT}/platform-panel-jeongja-suin.png` });

// 상세 오버레이
await page.evaluate(() => __jj.subway.openRouteMap());
await page.waitForFunction(() => __jj.subway.routeMapOpen);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/overlay-desktop.png` });
R.meta.overlayOpen = await page.evaluate(() => ({
  open: __jj.subway.routeMapOpen,
  title: document.querySelector('#subway-routemap .srm-tt b')?.textContent,
  me: document.querySelector('#subway-routemap li.me b')?.textContent,
  n: document.querySelectorAll('#subway-routemap .srm-list li').length,
}));
await page.evaluate(() => __jj.subway.closeRouteMap());

// 플래그 끔 비교
const off = await open('off', '&routemap=0');
await off.evaluate(() => __jj.subway.enterById('x1'));
await until(off, () => __jj.subway.state.phase === 'inside' && __jj.subway.room === 'concourse' && !__jj.subway.swapping);
await off.evaluate(() => __jj.subway.toPlatform('suin', 1));
await until(off, () => __jj.subway.room === 'platform' && !__jj.subway.swapping);
await off.waitForTimeout(1000);
await off.evaluate(() => __jj.subway.inside.setView(12, -1.4, Math.PI, 0.12, 3.2));
await off.waitForTimeout(700);
R.off.panel = await measure(off);
R.meta.off = await off.evaluate(() => {
  const p = __jj.subway.inside;
  return { slots: p.mapSlots?.length || 0, hasMesh: !!p.mapMesh, openFn: typeof __jj.subway.openRouteMap };
});
await off.screenshot({ path: `${OUT}/platform-panel-flagoff.png` });
await off.close();

// 모바일 뷰포트 오버레이
const mob = await open('mob', '&mobile=1', { width: 390, height: 844 });
await mob.evaluate(() => __jj.subway.enterById('x1'));
await until(mob, () => __jj.subway.state.phase === 'inside' && __jj.subway.room === 'concourse' && !__jj.subway.swapping);
await mob.evaluate(() => __jj.subway.toPlatform('suin', 1));
await until(mob, () => __jj.subway.room === 'platform' && !__jj.subway.swapping);
await mob.waitForTimeout(800);
await mob.evaluate(() => {
  const p = __jj.subway.inside; const s = p.mapSlots?.[0] || { x: 12 };
  p.setView(s.x, -1.4, Math.PI, 0.12, 2.8);
});
await mob.waitForTimeout(600);
await mob.evaluate(() => __jj.subway.openRouteMap());
await mob.waitForFunction(() => __jj.subway.routeMapOpen);
await mob.waitForTimeout(400);
await mob.screenshot({ path: `${OUT}/overlay-mobile.png` });
await mob.close();

await page.close();
await browser.close();

fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(R, null, 2));
console.log(JSON.stringify(R, null, 2));
if (errs.length) { console.error('ERRS', errs.slice(0, 12)); process.exit(1); }
if (!R.meta.platform?.slots) { console.error('no map slots'); process.exit(1); }
if (!R.meta.overlayOpen?.open) { console.error('overlay failed'); process.exit(1); }
console.log('shots ok →', OUT);
