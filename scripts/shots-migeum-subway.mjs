// [migeum-sub] 미금역 지하철: 스크린샷(출입구·개찰구·대합실·두 승강장 + 열차) + draw/tris/heap (켬 vs ?migeumsub=0, SwiftShader)
//   npm run build && npx vite preview --port 4391 --strictPort --host 127.0.0.1
//   BASE=http://127.0.0.1:4391/ OUT=/workspace/bw-migeum-shots/subway node scripts/shots-migeum-subway.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4391/';
const OUT = process.env.OUT || '/workspace/bw-migeum-shots/subway';
const MODE = process.env.MODE || 'all'; // all | perf
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const errs = [];
const Q = '?enter=1&name=Tester&ws=mock&bus=sim&hour=14&weather=clear&shot=1&lang=ko&subwayRt=0&noticePopup=0&bgm=0&subwayVoice=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0';
async function open(tag, qs) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${tag} console: ${m.text().slice(0, 160)}`); });
  await page.addInitScript(() => {
    const st = { draws: 0, frames: 0 }; window.__probe = st;
    for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) { if (!C) continue;
      for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = C.prototype[fn]; C.prototype[fn] = function (...a) { st.draws++; return o.apply(this, a); }; } }
    const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { st.frames++; cb(t); });
  });
  await page.goto(B + Q + qs, { timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  return page;
}
const until = (page, fn, arg, t = 120000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });
const measure = (page) => page.evaluate(async () => {
  window.gc?.(); const st = window.__probe; st.draws = 0; st.frames = 0;
  const t0 = performance.now(); await new Promise((r) => setTimeout(r, 3000)); const dt = (performance.now() - t0) / 1000;
  const info = __jj.renderer.info;
  return { fps: +(st.frames / dt).toFixed(1), draws: Math.round(st.draws / Math.max(1, st.frames)), calls: info.render.calls, tris: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
});
const surface = async (page, x, z, ry, dist = 14) => {
  await page.evaluate(async ({ x, z, ry, dist }) => { const J = __jj; J.setMode('follow'); if (J.corridor) await J.corridor.preload(x, z); J.teleport(x, z); J.player.rotation.y = ry; J.cam.yaw = ry + Math.PI - 0.5; J.cam.pitch = 0.26; J.cam.dist = dist; }, { x, z, ry, dist });
  await page.waitForTimeout(9000);
};
const R = { surface: {}, inside: {} };
const on = await open('on', '');
const off = await open('off', '&migeumsub=0');
// 출구 2번 정면 (OSM 3406781696). 같은 자리를 켬/끔 둘 다
const ex = await on.evaluate(() => { const st = __jj.subway.ensureStation('migeum'); const e = st.ent.list.find((q) => q.exit.ref === '2'); return { x: e.x, z: e.z, ry: e.ry, id: e.exit.id, n: st.ent.list.length, refs: st.ent.list.map((q) => q.exit.ref), ok: st.ent.list.map((q) => q.ok) }; });
R.entrances = ex;
R.stationsOff = await off.evaluate(() => __jj.subway?.stations.map((s) => s.def.id));
const pose = { x: ex.x - Math.sin(ex.ry) * 4.2, z: ex.z - Math.cos(ex.ry) * 4.2, ry: ex.ry };
for (const [k, pg] of [['on', on], ['off', off]]) { await surface(pg, pose.x, pose.z, pose.ry); R.surface[`migeum-exit2-${k}`] = await measure(pg); }
if (MODE !== 'perf') { await on.screenshot({ path: `${OUT}/migeum-exit2-entrance.png` }); await off.screenshot({ path: `${OUT}/migeum-exit2-entrance-flagoff.png` }); }
// 넓게 (역 위) — 출구 7개
for (const [k, pg] of [['on', on], ['off', off]]) { await surface(pg, 58.9, 1845, 0, 120); R.surface[`migeum-wide-${k}`] = await measure(pg); }
if (MODE !== 'perf') await on.screenshot({ path: `${OUT}/migeum-wide-exits.png` });
// 정자역 (기존) 같은 자리 켬/끔
for (const [k, pg] of [['on', on], ['off', off]]) { await surface(pg, -212, -195, 0, 24); R.surface[`jeongja-${k}`] = await measure(pg); }
await off.close();
// 걸어서 진입: 출구 2번 앞에서 W
await surface(on, ex.x - Math.sin(ex.ry) * 1, ex.z - Math.cos(ex.ry) * 1, ex.ry, 6);
await on.evaluate(() => { __jj.cam.yaw = __jj.player.rotation.y + Math.PI; });
await on.keyboard.down('KeyW');
await until(on, () => __jj.subway.state.phase === 'inside' && __jj.subway.room === 'concourse' && !__jj.subway.swapping, null, 60000);
await on.keyboard.up('KeyW');
R.enteredBy = await on.evaluate(() => ({ station: __jj.subway.station.name, zone: __jj.subway.zone, place: __jj.subway.place() }));
await on.waitForTimeout(2500);
R.inside.concourse = await measure(on);
if (MODE !== 'perf') await on.screenshot({ path: `${OUT}/migeum-concourse.png` });
// 개찰구 (z=0 줄) 를 대합실 안쪽에서
await on.evaluate(() => __jj.subway.inside.setView(0, 4.2, 0, 0.22, 5.5)); await on.waitForTimeout(1500);
if (MODE !== 'perf') await on.screenshot({ path: `${OUT}/migeum-gate.png` });
await on.evaluate(() => __jj.subway.inside.setView(0, -4.2, Math.PI, 0.22, 5.5)); await on.waitForTimeout(1500);
if (MODE !== 'perf') await on.screenshot({ path: `${OUT}/migeum-gate-2.png` });
// 승강장 + 열차: 수인분당 수원·인천(0) / 왕십리(1), 신분당 광교(0) / 신사(1)
for (const [line, dir] of [['suin', 1], ['suin', 0], ['shin', 1], ['shin', 0]]) {
  await on.evaluate(({ line, dir }) => __jj.subway.toPlatform(line, dir), { line, dir });
  await until(on, () => __jj.subway.room === 'platform' && !__jj.subway.swapping);
  await on.waitForTimeout(1500);
  R.inside[`platform-${line}-${dir}-empty`] = await measure(on);
  await on.evaluate(() => __jj.subway.inside.callTrain(13));
  await until(on, () => __jj.subway.inside?.doorsNow > 0.95, null, 60000);
  await on.evaluate(() => { const i = __jj.subway.inside; i.cam.yaw = Math.PI * 0.8; i.cam.pitch = 0.18; i.cam.dist = 6; }); await on.waitForTimeout(800);
  R.inside[`platform-${line}-${dir}-train`] = { ...(await measure(on)), zone: await on.evaluate(() => __jj.subway.zone), rides: await on.evaluate(() => __jj.subway.inside.rides.map((q) => q.name).slice(0, 3)), sign: await on.evaluate(() => { const s = __jj.subway.inside.sign; return s ? { prev: s.prev, next: s.next, dir: s.dirKo } : null; }) };
  if (MODE !== 'perf') await on.screenshot({ path: `${OUT}/migeum-platform-${line}-${dir}-train.png` });
}
R.errors = errs;
fs.writeFileSync(`${OUT}/report${MODE === 'perf' ? '-perf' : ''}.json`, JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));
await browser.close();
