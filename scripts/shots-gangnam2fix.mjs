// 강남 2단계 수정 스크린샷. BASE=머지된 preview.
//   OUT=/opt/cursor/artifacts/gangnam2fix BASE=http://127.0.0.1:5208/ node scripts/shots-gangnam2fix.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5208/';
const OUT = process.env.OUT || '/opt/cursor/artifacts/gangnam2fix';
fs.mkdirSync(OUT, { recursive: true });
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const errs = [];
async function open(hour, extra = '') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => {
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
  await page.goto(`${B}?${Q}&hour=${hour}&shot=1${extra}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(500);
  return page;
}
async function go(page, x, z, yaw, dist, pitch) {
  await page.evaluate(async ({ x, z, yaw, dist, pitch }) => {
    const J = window.__jj;
    J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    const p = J.corridor?.freeSpot ? J.corridor.freeSpot(x, z) : { x, z };
    J.teleport(p.x, p.z);
    J.player.rotation.y = yaw; J.cam.yaw = yaw; J.cam.pitch = pitch; J.cam.dist = dist;
  }, { x, z, yaw, dist, pitch });
  await page.waitForTimeout(2200);
}
const snap = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 90000 });
async function measure(page) {
  return page.evaluate(async () => {
    const st = window.__probe; st.draws = 0; st.frames = 0;
    await new Promise((r) => setTimeout(r, 1200));
    const info = window.__jj.renderer.info;
    const stop = document.getElementById('stop-panel');
    const cap = window.__jj.placeCaption?.(window.__jj.player.position.x, window.__jj.player.position.z);
    return {
      draws: Math.round(st.draws / Math.max(1, st.frames)),
      tris: info.render.triangles,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      place: cap?.name || '',
      stopOpen: !!stop?.classList.contains('open'),
      camDist: +window.__jj.cam.dist.toFixed(2),
    };
  });
}
const tx = 0.363, tz = 0.932, avenueYaw = Math.atan2(-tx, -tz);
const perf = { errors: errs };

const night = await open(21);
const screens = await night.evaluate(() => window.__jj.gangnamAds?.screens || []);
const board = screens.find((s) => s.id === 'board-cross-w');
const pole = screens.find((s) => s.id === 'pole-e11');
await go(night, -7250, -14782, avenueYaw, 14, 0.22);
perf.daeroNight = await measure(night);
await snap(night, '_daero-after');
await go(night, -7145.7, -14614.3, 0.4, 12, 0.22);
perf.crossing = await measure(night);
await snap(night, '_crossing-after');
if (pole) {
  // 기둥 옆 1.4m. 화면은 기둥 반지름보다 앞에 있어 로고가 가리지 않는다.
  const side = 1.4;
  await go(night, pole.x + Math.cos(pole.yaw) * side, pole.z - Math.sin(pole.yaw) * side, pole.yaw, 6, -0.5);
  await snap(night, '_pole-after');
  const backYaw = pole.yaw + Math.PI;
  await go(night, pole.x + Math.sin(pole.yaw) * -9, pole.z + Math.cos(pole.yaw) * -9, backYaw, 12, -0.28);
  await snap(night, 'board-back');
}
if (board) {
  const sin = Math.sin(board.yaw), cos = Math.cos(board.yaw);
  await go(night, board.x + sin * 26, board.z + cos * 26, board.yaw, 12, -0.36);
  await snap(night, 'board-front');
}
await night.close();

const day = await open(14);
await go(day, 9, 9, 0.6, 18, 0.35);
perf.jeongjaOn = await measure(day);
await go(day, -726, -16218, 0.4, 36, 0.4);
perf.jamsilOn = await measure(day);
await go(day, -7135, -14920, 0, 18, 0.28);
perf.gangnamDayOn = await measure(day);
// 정자에서 목업을 맵 밖으로 떨어뜨려 이름+화살표
await day.evaluate(() => window.__jj.teleport(220, 30));
await day.waitForTimeout(800);
await snap(day, '_jeongja-peer');
perf.jeongjaPeer = await day.evaluate(() => {
  const peers = [];
  return document.body.innerText.includes('판교러버') ? 'dom' : 'shot';
});
await day.close();
const off = await open(14, '&gangnam=0');
await go(off, 9, 9, 0.6, 18, 0.35);
perf.jeongjaOff = await measure(off);
await go(off, -726, -16218, 0.4, 36, 0.4);
perf.jamsilOff = await measure(off);
await go(off, -7135, -14920, 0, 18, 0.28);
perf.gangnamDayOff = await measure(off);
await off.close();
fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify({ ...perf, errors: errs }, null, 2));
console.log(JSON.stringify({ crossing: perf.crossing, daero: perf.daeroNight, day: perf.gangnamDayOn, off: perf.gangnamDayOff, jz: perf.jeongjaOn, jam: perf.jamsilOn, errs }, null, 2));
await browser.close();
