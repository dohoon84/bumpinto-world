// 남은 강남 샷·성능. 본 샷 스크립트가 탑승에서 멈춘 뒤의 보충.
import fs from 'node:fs';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:5188/';
const OUT = process.env.OUT || '/opt/cursor/artifacts/gangnam';
fs.mkdirSync(OUT, { recursive: true });
const log = (m) => process.stderr.write(m + '\n');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&shot=1';
async function open(tag, extra = '', w = 1280, h = 800) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => log(tag + ' ' + e.message));
  await page.addInitScript(() => {
    const st = { draws: 0, frames: 0 }; window.__probe = st;
    for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) if (C) for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = C.prototype[fn]; C.prototype[fn] = function (...a) { st.draws++; return o.apply(this, a); }; }
    const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { st.frames++; cb(t); });
  });
  await page.goto(`${B}?${Q}&${extra}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  log('open ' + tag);
  return page;
}
const until = (page, fn, t = 60000) => page.waitForFunction(fn, null, { timeout: t, polling: 100 });
async function measure(page) {
  return page.evaluate(async () => {
    const st = window.__probe; st.draws = 0; st.frames = 0;
    await new Promise((r) => setTimeout(r, 1600));
    const info = window.__jj.renderer.info;
    return { draws: Math.round(st.draws / Math.max(1, st.frames)), tris: info.render.triangles, geometries: info.memory.geometries, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
  });
}
async function go(page, x, z, yaw = 0, dist = 20, pitch = 0.32) {
  await page.evaluate(async ({ x, z, yaw, dist, pitch }) => {
    const J = window.__jj; J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    const p = J.corridor.freeSpot(x, z);
    J.teleport(p.x, p.z); J.player.rotation.y = yaw; J.cam.yaw = yaw; J.cam.pitch = pitch; J.cam.dist = dist;
  }, { x, z, yaw, dist, pitch });
  await page.waitForTimeout(3500);
}
const perf = {};
const on = await open('on', 'hour=14');
const off = await open('off', 'hour=14&gangnam=0');
for (const [name, x, z, yaw, dist] of [['jeongja', 9, 9, 0.8, 22], ['jamsil', -726, -16218, 0.4, 40], ['gangnam', -7258, -14880, 0, 22]]) {
  await go(on, x, z, yaw, dist); perf[name + '-on'] = await measure(on); log(name + '-on ' + JSON.stringify(perf[name + '-on']));
  await go(off, x, z, yaw, dist); perf[name + '-off'] = await measure(off); log(name + '-off ' + JSON.stringify(perf[name + '-off']));
}
await go(on, -7258, -14880, 0, 24, 0.3); await on.screenshot({ path: `${OUT}/pc-gangnam-daero-day.png` });
await go(on, -7137, -14541, 0.7, 34, 0.5); await on.screenshot({ path: `${OUT}/pc-gangnam-crossing.png` });
const night = await open('night', 'hour=21');
await go(night, -7258, -14880, 0, 24, 0.3); await night.screenshot({ path: `${OUT}/pc-gangnam-daero-night.png` });
log('night hour ' + await night.evaluate(() => document.body.innerText.includes('21') || document.body.innerText.slice(0, 80)));

async function enter(page, id) {
  const ok = await page.evaluate(async (id) => {
    const J = window.__jj; const st = J.subway.ensureStation(id); if (!st?.ent) return 'noent';
    const e = st.ent.list.find((q) => q.ok) || st.ent.list[0];
    if (J.corridor) await J.corridor.preload(e.x, e.z);
    J.teleport(e.x, e.z);
    return J.subway.enterById(e.exit.id) ? 'ok' : 'fail';
  }, id);
  log('enter ' + id + ' ' + ok);
  await until(page, () => window.__jj.subway.state.phase === 'inside' && window.__jj.subway.room === 'concourse' && !window.__jj.subway.swapping);
}
async function plat(page, line, dir) {
  await page.evaluate(({ line, dir }) => window.__jj.subway.toPlatform(line, dir), { line, dir });
  await until(page, () => window.__jj.subway.room === 'platform' && !window.__jj.subway.swapping);
  await page.waitForTimeout(800);
}
await enter(on, 'gangnam');
for (const [x, z, yaw, name] of [[-7.5, -7.2, 0, 'a'], [-7.5, -0.5, Math.PI, 'b'], [-5, -3.6, Math.PI / 2, 'c']]) {
  await on.evaluate(({ x, z, yaw }) => window.__jj.subway.inside.setView(x, z, yaw, 0.05, 5), { x, z, yaw });
  await on.waitForTimeout(400);
  await on.screenshot({ path: `${OUT}/pc-arrival-try-${name}.png` });
}
await plat(on, 'l2', 0);
await on.evaluate(() => window.__jj.subway.inside.setView(8, -1.4, Math.PI / 2, 0.12, 9));
await on.waitForTimeout(400); await on.screenshot({ path: `${OUT}/pc-platform-l2.png` });
await plat(on, 'shin', 1);
await on.evaluate(() => window.__jj.subway.inside.setView(8, -1.4, Math.PI / 2, 0.12, 9));
await on.waitForTimeout(400); await on.screenshot({ path: `${OUT}/pc-platform-shin.png` });

async function ride(fromId, line, dir, file) {
  const page = await open('ride-' + fromId, 'hour=14');
  await enter(page, fromId);
  await plat(page, line, dir);
  await page.evaluate(() => window.__jj.subway.inside.callTrain(8));
  await until(page, () => (window.__jj.subway.inside?.doorsNow || 0) > 0.85, 45000);
  await page.evaluate(() => { const i = window.__jj.subway.inside; const d = i.lay.doors[2]; i.setView(d.x, 0.9, 0, 0.1, 4); });
  await until(page, () => window.__jj.subway.room === 'train' && !window.__jj.subway.swapping, 20000);
  const arr = await page.evaluate(() => window.__jj.subway.inside.segs.find((s) => s.name === '강남').arr);
  log(fromId + ' arr ' + arr);
  await page.evaluate((sec) => window.__jj.subway.inside.skip(sec + 5), arr);
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => { const s = window.__jj.subway.inside; return { stage: s.stage, name: s.segs[s.stopIndex]?.name, open: s.doorOpen }; });
  log(fromId + ' state ' + JSON.stringify(st));
  await page.evaluate(() => { const i = window.__jj.subway.inside; i.cam.yaw = 0.4; i.cam.pitch = 0.1; i.cam.dist = 4.5; });
  await page.screenshot({ path: `${OUT}/${file}.png` });
  await page.close();
}
await ride('jeongja', 'shin', 1, 'pc-ride-from-jeongja');
await ride('jamsil', 'l2', 0, 'pc-ride-from-jamsil');

const mob = await open('mob', 'hour=14&mobile=1', 844, 390);
await go(mob, -7258, -14880, 0, 18, 0.28); await mob.screenshot({ path: `${OUT}/mobile-gangnam-daero-day.png` });
await go(mob, -7137, -14541, 0.6, 28, 0.45); await mob.screenshot({ path: `${OUT}/mobile-crossing.png` });
await enter(mob, 'gangnam'); await mob.screenshot({ path: `${OUT}/mobile-concourse.png` });
await plat(mob, 'l2', 0); await mob.screenshot({ path: `${OUT}/mobile-platform-l2.png` });
const mobN = await open('mobn', 'hour=21&mobile=1', 844, 390);
await go(mobN, -7258, -14880, 0, 18, 0.28); await mobN.screenshot({ path: `${OUT}/mobile-gangnam-daero-night.png` });
const mobMini = await open('mm', 'hour=14&mobile=1&hud=v3'.replace('shot=1&', ''), 844, 390);
// shot is in Q. rebuild without shot for minimap already taken on PC. mobile minimap:
await mobMini.goto(`${B}?enter=1&ws=mock&npcs=0&taxis=0&police=0&trucks=0&clife=0&hour=14&weather=clear&noticePopup=0&bgm=0&mobile=1&hud=v3&subwayVoice=0`, { timeout: 180000 });
await mobMini.waitForFunction(() => window.__jj?.ready, null, { timeout: 180000 });
await go(mobMini, -7137, -14541, 0.4, 24, 0.4);
await mobMini.screenshot({ path: `${OUT}/mobile-minimap.png` });
await mob.evaluate(() => { const st = window.__jj.subway.ensureStation('gangnam'); const e = st.ent.list.find((q) => q.exit.ref === '11'); return e; }).catch(() => {});

const delta = (a, b) => ({ draws: a.draws - b.draws, tris: a.tris - b.tris, heapMB: +(a.heapMB - b.heapMB).toFixed(1) });
const report = { perf, delta: { jeongja: delta(perf['jeongja-on'], perf['jeongja-off']), jamsil: delta(perf['jamsil-on'], perf['jamsil-off']), gangnam: delta(perf['gangnam-on'], perf['gangnam-off']) }, budget: { drawsPlusMax: 120, trisMax: 2200000, heapPlusMB: 40 } };
fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(report, null, 1));
log(JSON.stringify(report.delta));
await browser.close();
