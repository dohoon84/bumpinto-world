// [gangnam-night] 야경·전광판·미니맵 스크린샷과 성능. vite preview 가 떠 있어야 한다.
//   BASE=http://127.0.0.1:5208/ OUT=/opt/cursor/artifacts/gangnam2 node scripts/shots-gangnam-night.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5208/';
const OUT = process.env.OUT || '/opt/cursor/artifacts/gangnam2';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const errs = [];
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0';

function hook(page) {
  return page.addInitScript(() => {
    const st = { draws: 0, frames: 0 }; window.__probe = st;
    for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
      if (!C) continue;
      for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const o = C.prototype[fn]; if (!o) continue;
        C.prototype[fn] = function (...a) { st.draws++; return o.apply(this, a); };
      }
    }
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { st.frames++; cb(t); });
  });
}
async function open(tag, { w = 1280, h = 800, hour = 14, extra = '', mobile = false } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
  page.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
  await hook(page);
  const q = `?${Q}&hour=${hour}&shot=1${extra}`;
  await page.goto(B + q, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(800);
  return page;
}
async function measure(page) {
  return page.evaluate(async () => {
    const st = window.__probe; st.draws = 0; st.frames = 0;
    const t0 = performance.now(); await new Promise((r) => setTimeout(r, 1600));
    const dt = (performance.now() - t0) / 1000;
    const info = window.__jj.renderer.info;
    const stop = document.getElementById('stop-panel');
    const cstop = document.getElementById('corridor-stop-panel');
    const cap = window.__jj.placeCaption?.(window.__jj.player.position.x, window.__jj.player.position.z);
    return {
      draws: Math.round(st.draws / Math.max(1, st.frames)),
      tris: info.render.triangles,
      geometries: info.memory.geometries,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      fps: +(st.frames / dt).toFixed(1),
      place: cap?.name || '',
      stopOpen: !!(stop?.classList.contains('open') || cstop?.classList.contains('open')),
      stopText: (stop?.classList.contains('open') ? stop.innerText : cstop?.classList.contains('open') ? cstop.innerText : '').slice(0, 80),
    };
  });
}
async function surface(page, x, z, yaw = 0, dist = 22, pitch = 0.38) {
  await page.evaluate(async ({ x, z, yaw, dist, pitch }) => {
    const J = window.__jj; J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    const p = J.corridor?.freeSpot ? J.corridor.freeSpot(x, z) : { x, z };
    J.teleport(p.x, p.z); J.player.rotation.y = yaw; J.cam.yaw = yaw; J.cam.pitch = pitch; J.cam.dist = dist;
  }, { x, z, yaw, dist, pitch });
  await page.waitForTimeout(2800);
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

const perf = { errors: errs };
const on = await open('on');
const off = await open('off', { extra: '&gangnam=0' });
const night = await open('night', { hour: 21 });
const nightOff = await open('nightOff', { hour: 21, extra: '&gangnamnight=0' });
const adsOff = await open('adsOff', { hour: 21, extra: '&gangnamads=0' });
const mob = await open('mob', { w: 900, h: 480, hour: 21, extra: '&mobile=1', mobile: true });

for (const [k, pg] of [['on', on], ['off', off]]) {
  await surface(pg, 9, 9, 0.8, 22, 0.38);
  perf[`jeongja-street-day-${k}`] = await measure(pg);
  await surface(pg, -726, -16218, 0.4, 40, 0.45);
  perf[`jamsil-street-day-${k}`] = await measure(pg);
}
await surface(on, -7135, -14920, 0, 18, 0.28);
perf['gangnam-daero-day-on'] = await measure(on);
await surface(off, -7135, -14920, 0, 18, 0.28);
perf['gangnam-daero-day-off'] = await measure(off);

await surface(night, -7135, -14920, 0, 18, 0.28);
perf['gangnam-daero-night-on'] = await measure(night);
await shot(night, 'pc-daero-night');
await surface(night, -7140, -14620, 0.6, 36, 0.42);
perf['gangnam-crossing-night-on'] = await measure(night);
await shot(night, 'pc-crossing-night');

const screens = await night.evaluate(() => window.__jj.gangnamAds?.screens || []);
const pole = screens.find((s) => s.id === 'pole-e11') || screens.find((s) => s.kind === 'pole');
const board = screens.find((s) => s.id === 'board-e11') || screens.find((s) => s.kind === 'board');
function front(s, dist) {
  const yaw = s.yaw + Math.PI;
  return { x: s.x + Math.sin(s.yaw) * dist, z: s.z + Math.cos(s.yaw) * dist, yaw };
}
if (pole) {
  const f = front(pole, 7);
  await surface(on, f.x, f.z, f.yaw, 6, 0.15);
  await shot(on, '_pole-day');
  await surface(night, f.x, f.z, f.yaw, 6, 0.15);
  perf['pole-night'] = await measure(night);
  await shot(night, '_pole-night');
}
if (board) {
  const f = front(board, 28);
  await surface(night, f.x, f.z, f.yaw, 16, 0.2);
  perf['board-night'] = await measure(night);
  await shot(night, 'pc-board-street');
}
await surface(nightOff, -7135, -14920, 0, 18, 0.28);
perf['gangnam-daero-night-gangnamnight0'] = await measure(nightOff);
await shot(nightOff, '_night0');
await surface(adsOff, -7140, -14620, 0.6, 36, 0.42);
perf['gangnam-crossing-night-gangnamads0'] = await measure(adsOff);
await shot(adsOff, '_ads0');

await surface(mob, -7135, -14920, 0, 16, 0.3);
perf['gangnam-daero-night-mobile'] = await measure(mob);
await shot(mob, 'mobile-daero-night');

await surface(night, -7135, -14920, 0, 18, 0.28);
await shot(night, '_minimap-after');
perf.minimapAfter = await measure(night);
if (perf.minimapAfter.place !== '강남역' && !String(perf.minimapAfter.place).includes('강남')) {
  errs.push('place caption ' + perf.minimapAfter.place);
}
if (perf.minimapAfter.stopOpen) errs.push('stop card open at gangnam: ' + perf.minimapAfter.stopText);

await browser.close();
fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify({ ...perf, errors: errs }, null, 2));
console.log(JSON.stringify({ place: perf.minimapAfter?.place, stop: perf.minimapAfter?.stopOpen, draws: {
  dayOn: perf['gangnam-daero-day-on']?.draws, dayOff: perf['gangnam-daero-day-off']?.draws,
  nightOn: perf['gangnam-daero-night-on']?.draws, night0: perf['gangnam-daero-night-gangnamnight0']?.draws,
  mob: perf['gangnam-daero-night-mobile']?.draws,
  jzOn: perf['jeongja-street-day-on']?.draws, jzOff: perf['jeongja-street-day-off']?.draws,
}, tris: { dayOn: perf['gangnam-daero-day-on']?.tris, dayOff: perf['gangnam-daero-day-off']?.tris, night: perf['gangnam-daero-night-on']?.tris }, heap: { dayOn: perf['gangnam-daero-day-on']?.heapMB, dayOff: perf['gangnam-daero-day-off']?.heapMB }, errs }, null, 2));
