// [gangnam] 강남 거리·출구·대합실·승강장·탑승 도착 스크린샷 + draws/tris/heap
//   npm run build && npx vite preview --port 5188 --strictPort --host 127.0.0.1
//   BASE=http://127.0.0.1:5188/ OUT=/opt/cursor/artifacts/gangnam node scripts/shots-gangnam.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5188/';
const OUT = process.env.OUT || '/opt/cursor/artifacts/gangnam';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const errs = [];
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0';

function hook(page) {
  return page.addInitScript(() => {
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
}
async function open(tag, { w = 1280, h = 800, qs = '', shot = true } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
  await hook(page);
  const q = `?${Q}&hour=14${shot ? '&shot=1' : ''}${qs}`;
  await page.goto(B + q, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return page;
}
const until = (page, fn, arg, t = 90000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });
async function measure(page) {
  return page.evaluate(async () => {
    const st = window.__probe; st.draws = 0; st.frames = 0;
    const t0 = performance.now(); await new Promise((r) => setTimeout(r, 1800));
    const dt = (performance.now() - t0) / 1000;
    const info = window.__jj.renderer.info;
    return { draws: Math.round(st.draws / Math.max(1, st.frames)), tris: info.render.triangles, geometries: info.memory.geometries, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, fps: +(st.frames / dt).toFixed(1) };
  });
}
async function surface(page, x, z, yaw = 0, dist = 22, pitch = 0.38) {
  await page.evaluate(async ({ x, z, yaw, dist, pitch }) => {
    const J = window.__jj; J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    const p = J.corridor?.freeSpot ? J.corridor.freeSpot(x, z) : { x, z };
    J.teleport(p.x, p.z); J.player.rotation.y = yaw; J.cam.yaw = yaw; J.cam.pitch = pitch; J.cam.dist = dist;
  }, { x, z, yaw, dist, pitch });
  await page.waitForTimeout(4500);
}
async function shot(page, name) { await page.screenshot({ path: `${OUT}/${name}.png` }); }

const perf = {};
const on = await open('on');
const off = await open('off', { qs: '&gangnam=0' });

// 정자·잠실: 강남 켜고 끈 뒤 (회귀)
for (const [k, pg] of [['on', on], ['off', off]]) {
  await surface(pg, 9, 9, 0.8, 22, 0.38);
  perf[`jeongja-street-${k}`] = await measure(pg);
  await surface(pg, -726, -16218, 0.4, 40, 0.45);
  perf[`jamsil-street-${k}`] = await measure(pg);
}
// 강남대로 (역 남쪽, 북쪽을 봄) · 사거리 · 출구 10/11 · 삼성 서초사옥
const gnIndex = JSON.parse(fs.readFileSync(new URL('../public/corridor/gangnam/index.json', import.meta.url), 'utf8'));
const signOf = (ko) => gnIndex.landmarks.find((l) => l.label?.ko === ko)?.pos;
const spots = { samsung: signOf('삼성전자 서초사옥'), finance: signOf('강남파이낸스센터'), kukki: signOf('국기원'), st: gnIndex.stations[0] };
spots.e10 = await on.evaluate(() => { const st = window.__jj.subway.ensureStation('gangnam'); const e = st.ent.list.find((q) => q.exit.ref === '10'); return e && { x: e.x, z: e.z, ry: e.ry }; });
spots.e11 = await on.evaluate(() => { const st = window.__jj.subway.ensureStation('gangnam'); const e = st.ent.list.find((q) => q.exit.ref === '11'); return e && { x: e.x, z: e.z, ry: e.ry }; });
await surface(on, -7135, -14920, 0, 18, 0.28); perf['gangnam-street-on'] = await measure(on); await shot(on, 'pc-gangnam-daero-day');
await surface(off, -7135, -14920, 0, 18, 0.28); perf['gangnam-street-off'] = await measure(off);
await surface(on, -7140, -14620, 0.6, 36, 0.55); perf['gangnam-crossing-on'] = await measure(on); await shot(on, 'pc-gangnam-crossing');
if (spots.e10) { await surface(on, spots.e10.x + 8, spots.e10.z + 6, 2.4, 14, 0.3); await shot(on, 'pc-exit-10'); }
if (spots.e11) { await surface(on, spots.e11.x + 6, spots.e11.z + 8, 2.2, 14, 0.3); await shot(on, 'pc-exit-11'); }
if (spots.samsung) { await surface(on, spots.samsung.x + 40, spots.samsung.z + 80, 0.3, 70, 0.35); await shot(on, 'pc-samsung-seocho'); }
// 미니맵 (HUD v3, shot 아님)
const mini = await open('mini', { shot: false, qs: '&hud=v3' });
await surface(mini, -7140, -14620, 0.4, 28, 0.5);
await mini.waitForTimeout(1500);
await shot(mini, 'pc-minimap');
await mini.close();

// 밤
const night = await open('night', { qs: '&hour=21' });
await surface(night, -7135, -14920, 0, 18, 0.28); await shot(night, 'pc-gangnam-daero-night');
await night.close();

// 지하철: 대합실 · 안내판 · 2호선/신분당 승강장 · 정자·잠실에서 도착
async function enterStation(page, id) {
  await page.evaluate(async (id) => {
    const J = window.__jj; const st = J.subway.ensureStation(id); if (!st?.ent) throw new Error('no ent ' + id);
    const e = st.ent.list.find((q) => q.ok) || st.ent.list[0];
    if (J.corridor) await J.corridor.preload(e.x, e.z);
    J.teleport(e.x, e.z);
    J.subway.enterById(e.exit.id);
  }, id);
  await until(page, () => window.__jj.subway.state.phase === 'inside' && window.__jj.subway.room === 'concourse' && !window.__jj.subway.swapping);
  await page.waitForTimeout(1800);
}
async function platform(page, line, dir) {
  await page.evaluate(({ line, dir }) => window.__jj.subway.toPlatform(line, dir), { line, dir });
  await until(page, () => window.__jj.subway.room === 'platform' && !window.__jj.subway.swapping);
  await page.waitForTimeout(1500);
}
console.log('street shots done', Object.keys(perf));
await enterStation(on, 'gangnam');
await on.evaluate(() => window.__jj.subway.inside.setView(-6.2, -2.2, 0.4, 0.15, 7));
await on.waitForTimeout(800); await shot(on, 'pc-concourse'); perf['gangnam-concourse'] = await measure(on);
await on.evaluate(() => window.__jj.subway.inside.setView(-7.2, -1.2, 0, 0.05, 4.2));
await on.waitForTimeout(600); await shot(on, 'pc-arrival-board');
await platform(on, 'l2', 0); await shot(on, 'pc-platform-l2'); perf['gangnam-platform-l2'] = await measure(on);
await platform(on, 'shin', 1); await shot(on, 'pc-platform-shin');

async function rideToGangnam(fromId, line, dir, file) {
  const page = await open('ride-' + fromId);
  await enterStation(page, fromId);
  await platform(page, line, dir);
  await page.evaluate(() => window.__jj.subway.inside.callTrain(10));
  await until(page, () => (window.__jj.subway.inside?.doorsNow || 0) > 0.9, null, 60000);
  await page.evaluate(() => {
    const i = window.__jj.subway.inside; const d = i.doors?.[0];
    if (d) i.setView(d.x || 0, -1.2, 0, 0.1, 3);
  });
  await page.keyboard.down('KeyW');
  await until(page, () => window.__jj.subway.room === 'train' && !window.__jj.subway.swapping, null, 40000);
  await page.keyboard.up('KeyW');
  const arr = await page.evaluate(() => {
    const segs = window.__jj.subway.inside.segs || [];
    const g = segs.find((s) => s.name === '강남');
    return g ? g.arr : null;
  });
  if (arr == null) throw new Error('no gangnam seg from ' + fromId);
  await page.evaluate((sec) => window.__jj.subway.inside.skip(sec + 4), arr);
  await until(page, () => { const s = window.__jj.subway.inside; return s && s.stage === 'stop' && s.segs?.[s.stopIndex]?.name === '강남'; }, null, 20000);
  await page.waitForTimeout(800);
  await page.evaluate(() => { const i = window.__jj.subway.inside; i.cam.yaw = Math.PI * 0.15; i.cam.pitch = 0.12; i.cam.dist = 5; });
  await shot(page, file);
  perf['ride-' + fromId] = { ...(await measure(page)), stop: await page.evaluate(() => window.__jj.subway.inside?.stop || window.__jj.subway.inside?.segs?.[window.__jj.subway.inside.stopIndex]?.name) };
  await page.close();
}
await rideToGangnam('jeongja', 'shin', 1, 'pc-ride-from-jeongja');
await rideToGangnam('jamsil', 'l2', 0, 'pc-ride-from-jamsil');

// 모바일 가로
const mob = await open('mob', { w: 844, h: 390, qs: '&mobile=1' });
await surface(mob, -7135, -14920, 0, 16, 0.26); await shot(mob, 'mobile-gangnam-daero-day'); console.log('mobile day');
await surface(mob, -7140, -14620, 0.5, 30, 0.5); await shot(mob, 'mobile-crossing');
if (spots.e11) { await surface(mob, spots.e11.x + 6, spots.e11.z + 8, 2.2, 12, 0.28); await shot(mob, 'mobile-exit-11'); }
await enterStation(mob, 'gangnam');
await mob.evaluate(() => window.__jj.subway.inside.setView(-6.2, -2.2, 0.4, 0.12, 6));
await mob.waitForTimeout(600); await shot(mob, 'mobile-concourse');
await platform(mob, 'l2', 0); await shot(mob, 'mobile-platform-l2');
const mobMini = await open('mobmini', { w: 844, h: 390, shot: false, qs: '&mobile=1&hud=v3' });
await surface(mobMini, -7140, -14620, 0.3, 24, 0.45); await shot(mobMini, 'mobile-minimap');
const nightM = await open('nightm', { w: 844, h: 390, qs: '&mobile=1&hour=21' });
await surface(nightM, -7135, -14920, 0, 16, 0.26); await shot(nightM, 'mobile-gangnam-daero-night'); console.log('mobile night');

const delta = (a, b) => a && b ? { draws: a.draws - b.draws, tris: a.tris - b.tris, heapMB: +(a.heapMB - b.heapMB).toFixed(1) } : null;
const report = {
  perf,
  delta: {
    jeongja: delta(perf['jeongja-street-on'], perf['jeongja-street-off']),
    jamsil: delta(perf['jamsil-street-on'], perf['jamsil-street-off']),
    gangnamStreet: delta(perf['gangnam-street-on'], perf['gangnam-street-off']),
  },
  budget: { drawsPlus: 120, trisMax: 2200000, heapPlusMB: 40, tileDetailKB: 452 },
  spots, errors: errs.slice(0, 20),
};
fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
await browser.close();
