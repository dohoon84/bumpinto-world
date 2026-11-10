// [gangnam-npc] 밀도 올린 뒤 강남대로 낮·21시·모바일과 힙 중앙값.
//   BASE=http://127.0.0.1:5218/ OUT=/opt/cursor/artifacts/gangnam-npc2 node scripts/shots-gangnam-npc-density.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5218/';
const OUT = process.env.OUT || '/opt/cursor/artifacts/gangnam-npc2';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const errs = [];
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&migeumnpc=0';
const CAM = { x: -7299.3, z: -14894.8, yaw: 0.38, dist: 36, pitch: 0.58 };

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
  console.log('open', tag);
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
  page.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
  await hook(page);
  await page.goto(`${B}?${Q}&hour=${hour}&shot=1${extra}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  return page;
}
async function surface(page) {
  await page.evaluate(async (CAM) => {
    const J = window.__jj;
    J.setMode('follow');
    if (J.corridor) await J.corridor.preload(CAM.x, CAM.z);
    J.teleport(CAM.x, CAM.z);
    J.player.rotation.y = CAM.yaw; J.cam.yaw = CAM.yaw; J.cam.pitch = CAM.pitch; J.cam.dist = CAM.dist;
  }, CAM);
  await page.waitForTimeout(2800);
}
function projectCount() {
  const J = window.__jj;
  const cam = J.camera;
  cam.updateMatrixWorld();
  const e = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements;
  const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
  const ndc = (x, y, z) => {
    const x0 = e[0] * x + e[4] * y + e[8] * z + e[12];
    const y0 = e[1] * x + e[5] * y + e[9] * z + e[13];
    const z0 = e[2] * x + e[6] * y + e[10] * z + e[14];
    const w0 = e[3] * x + e[7] * y + e[11] * z + e[15];
    const x1 = p[0] * x0 + p[4] * y0 + p[8] * z0 + p[12] * w0;
    const y1 = p[1] * x0 + p[5] * y0 + p[9] * z0 + p[13] * w0;
    const z1 = p[2] * x0 + p[6] * y0 + p[10] * z0 + p[14] * w0;
    const w1 = p[3] * x0 + p[7] * y0 + p[11] * z0 + p[15] * w0;
    return { x: x1 / w1, y: y1 / w1, z: z1 / w1, w: w1 };
  };
  const on = (x, y, z) => {
    const q = ndc(x, y, z);
    const dist = Math.hypot(x - cx, y - cy, z - cz);
    return q.w > 0 && q.z < 1 && Math.abs(q.x) < 0.98 && Math.abs(q.y) < 0.98 && dist < 85;
  };
  let peds = 0, cars = 0;
  const n = J.gangnamNpc;
  if (n?.peds) for (const a of n.peds.actors) if (a.path && a.mesh.visible && on(a.mesh.position.x, a.mesh.position.y + 1, a.mesh.position.z)) peds++;
  if (n?.traffic) for (const t of n.traffic.sim.list) if (t && !t.parked && t.mesh.visible && on(t.mesh.position.x, t.mesh.position.y + 0.8, t.mesh.position.z)) cars++;
  return { peds, cars, dist: 85 };
}
async function measure(page) {
  const heaps = [];
  for (let i = 0; i < 5; i++) {
    const h = await page.evaluate(() => {
      try { window.gc?.(); } catch { /* expose-gc 없으면 생략 */ }
      return performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
    });
    heaps.push(h);
    await page.waitForTimeout(120);
  }
  heaps.sort((a, b) => a - b);
  const rest = await page.evaluate(async () => {
    const st = window.__probe; st.draws = 0; st.frames = 0;
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 1200));
    const info = window.__jj.renderer.info;
    return {
      draws: Math.round(st.draws / Math.max(1, st.frames)),
      tris: info.render.triangles,
      fps: +((st.frames / ((performance.now() - t0) / 1000)).toFixed(1)),
    };
  });
  const seen = await page.evaluate(projectCount);
  return { ...rest, heapMB: +heaps[2].toFixed(1), heapSamples: heaps.map((v) => +v.toFixed(1)), seen };
}
const perf = { cam: CAM, errors: errs };
const shots = [
  ['day-on', { hour: 14 }, 'day-daero.png'],
  ['night-on', { hour: 21 }, 'night-21-daero.png'],
  ['mobile', { hour: 14, w: 900, h: 480, extra: '&mobile=1', mobile: true }, 'mobile-landscape.png'],
];
for (const [key, opt, file] of shots) {
  const page = await open(key, opt);
  if (key === 'mobile') {
    await page.evaluate(async (CAM) => {
      const J = window.__jj; J.setMode('follow');
      if (J.corridor) await J.corridor.preload(CAM.x, CAM.z);
      J.teleport(CAM.x, CAM.z);
      J.player.rotation.y = CAM.yaw; J.cam.yaw = CAM.yaw; J.cam.pitch = 0.5; J.cam.dist = 28;
    }, CAM);
    await page.waitForTimeout(2800);
  } else await surface(page);
  perf[key] = await measure(page);
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log(key, JSON.stringify(perf[key]));
  await page.close();
}
for (const [key, opt] of [['day-npc0', { hour: 14, extra: '&gangnamnpc=0' }], ['day-off', { hour: 14, extra: '&gangnam=0' }], ['night-npc0', { hour: 21, extra: '&gangnamnpc=0' }], ['night-off', { hour: 21, extra: '&gangnam=0' }]]) {
  const page = await open(key, opt);
  await surface(page);
  perf[key] = await measure(page);
  console.log(key, JSON.stringify(perf[key]));
  await page.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(perf, null, 2));
console.log('wrote', OUT);
