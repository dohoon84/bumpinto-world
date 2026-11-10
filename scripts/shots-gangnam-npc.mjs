// [gangnam-npc] 강남 보행·차량·횡단 스크린샷과 성능. vite preview 가 떠 있어야 한다.
//   BASE=http://127.0.0.1:5218/ OUT=/opt/cursor/artifacts/gangnam-npc node scripts/shots-gangnam-npc.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5218/';
const OUT = process.env.OUT || '/opt/cursor/artifacts/gangnam-npc';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const errs = [];
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&migeumnpc=0';

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
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${tag}: ${m.text().slice(0, 180)}`); });
  await hook(page);
  await page.goto(B + `?${Q}&hour=${hour}&shot=1${extra}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(600);
  return page;
}
async function measure(page) {
  return page.evaluate(async () => {
    const st = window.__probe; st.draws = 0; st.frames = 0;
    const t0 = performance.now(); await new Promise((r) => setTimeout(r, 1600));
    const dt = (performance.now() - t0) / 1000;
    const info = window.__jj.renderer.info;
    const npc = window.__jj.gangnamNpc?.stats?.() || null;
    return {
      draws: Math.round(st.draws / Math.max(1, st.frames)),
      tris: info.render.triangles,
      geometries: info.memory.geometries,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      fps: +(st.frames / dt).toFixed(1),
      npcDraws: npc?.draws ?? 0,
      peds: npc?.peds?.visible ?? 0,
      cars: npc?.cars?.drawn ?? 0,
      ready: !!npc?.ready,
    };
  });
}
async function surface(page, x, z, yaw = 0.4, dist = 22, pitch = 0.32, raw = false) {
  await page.evaluate(async ({ x, z, yaw, dist, pitch, raw }) => {
    const J = window.__jj; J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    const p = !raw && J.corridor?.freeSpot ? J.corridor.freeSpot(x, z) : { x, z };
    J.teleport(p.x, p.z); J.player.rotation.y = yaw; J.cam.yaw = yaw; J.cam.pitch = pitch; J.cam.dist = dist;
  }, { x, z, yaw, dist, pitch, raw });
  await page.waitForTimeout(2200);
}
async function waitNpc(page) {
  await page.waitForFunction(() => {
    const s = window.__jj.gangnamNpc?.stats?.();
    return s?.ready && (s.cars?.drawn > 0 || s.peds?.placed > 0);
  }, null, { timeout: 40000 });
  await page.waitForTimeout(1800);
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const perf = {};

const on = await open('on', { hour: 14 });
await surface(on, -7299.3, -14894.8, 0.38, 36, 0.58, true);
await waitNpc(on);
perf['gangnam-daero-day-on'] = await measure(on);
await shot(on, 'day-daero-peds-cars');

await surface(on, -7142, -14540, 0.35, 24, 0.42);
await pageWait(on);
const redAt = await on.evaluate(() => window.__jj.gangnamNpc.seek('강남대로', 'red'));
await on.waitForTimeout(2800);
perf['cross-red'] = await measure(on);
await shot(on, 'crosswalk-red');
const greenAt = await on.evaluate(() => window.__jj.gangnamNpc.seek('강남대로', 'green'));
await on.waitForTimeout(2800);
perf['cross-green'] = await measure(on);
await shot(on, 'crosswalk-green');

const night = await open('night', { hour: 21 });
await surface(night, -7299.3, -14894.8, 0.38, 36, 0.58, true);
await waitNpc(night);
perf['gangnam-daero-night-21'] = await measure(night);
await shot(night, 'night-21-daero');

const bubble = await on.evaluate(() => {
  const n = window.__jj.gangnamNpc;
  const list = n.peds.actors.filter((a) => a.tourist && a.path);
  if (!list.length) return null;
  list.sort((a, b) => Math.hypot(a.mesh.position.x + 7140, a.mesh.position.z + 14540) - Math.hypot(b.mesh.position.x + 7140, b.mesh.position.z + 14540));
  const a = list[0];
  return { x: a.mesh.position.x, z: a.mesh.position.z };
});
if (bubble) {
  await surface(on, bubble.x + 2.4, bubble.z + 1.2, Math.atan2(-2.4, -1.2), 4.5, 0.08);
  await on.evaluate(() => {
    const p = window.__jj.player.position;
    window.__jj.gangnamNpc.shoutNearest(p.x, p.z);
  });
  await on.waitForTimeout(700);
  perf.bubble = await on.evaluate(() => {
    const el = document.querySelector('.bubble.npc');
    return { text: el && el.style.display !== 'none' ? el.textContent : '', shown: !!el && !el.hidden };
  });
  await shot(on, 'tourist-bubble');
} else errs.push('no tourist to photograph');

const mob = await open('mob', { w: 900, h: 480, hour: 14, extra: '&mobile=1', mobile: true });
await surface(mob, -7299.3, -14894.8, 0.38, 28, 0.5, true);
await waitNpc(mob);
perf['gangnam-daero-day-mobile'] = await measure(mob);
await shot(mob, 'mobile-landscape');

const npc0 = await open('npc0', { hour: 14, extra: '&gangnamnpc=0' });
await surface(npc0, -7299.3, -14894.8, 0.38, 36, 0.58, true);
await npc0.waitForTimeout(1600);
perf['gangnam-daero-day-gangnamnpc0'] = await measure(npc0);

const gz = await open('gz', { hour: 14, extra: '&gangnam=0' });
await surface(gz, -7299.3, -14894.8, 0.38, 36, 0.58, true);
await gz.waitForTimeout(1200);
perf['gangnam-daero-day-gangnam0'] = await measure(gz);

await surface(on, 9, 9, 0.8, 22, 0.38);
await on.waitForTimeout(1500);
perf['jeongja-day-npc-on'] = await measure(on);
await shot(on, 'jeongja-unchanged');
await surface(gz, 9, 9, 0.8, 22, 0.38);
await gz.waitForTimeout(1200);
perf['jeongja-day-gangnam0'] = await measure(gz);

await browser.close();
const dayOn = perf['gangnam-daero-day-on'];
const day0 = perf['gangnam-daero-day-gangnamnpc0'];
const dayGz = perf['gangnam-daero-day-gangnam0'];
const summary = {
  redAt, greenAt,
  draws: { on: dayOn?.draws, npc0: day0?.draws, gangnam0: dayGz?.draws, deltaNpc: dayOn && day0 ? dayOn.draws - day0.draws : null, deltaAll: dayOn && dayGz ? dayOn.draws - dayGz.draws : null },
  tris: { on: dayOn?.tris, npc0: day0?.tris, gangnam0: dayGz?.tris },
  heapMB: { on: dayOn?.heapMB, npc0: day0?.heapMB, gangnam0: dayGz?.heapMB, deltaAll: dayOn && dayGz ? +(dayOn.heapMB - dayGz.heapMB).toFixed(1) : null },
  npc: { draws: dayOn?.npcDraws, peds: dayOn?.peds, cars: dayOn?.cars },
  errs,
};
fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify({ ...perf, summary, errors: errs }, null, 2));
console.log(JSON.stringify(summary, null, 2));

function pageWait(page) { return page.waitForTimeout(400); }
