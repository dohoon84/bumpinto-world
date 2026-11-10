// [gangnam] 개통 스크린샷. 빌드 미리보기 위에 헤드리스로 찍는다.
//   npm run build && npx vite preview --port 5191 --strictPort --host 127.0.0.1
//   BASE=http://127.0.0.1:5191/ node scripts/shots-gangnam-open.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5191/';
const OUT = process.env.OUT || '/opt/cursor/artifacts/gangnam-open';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const errs = [];
const Q = 'lang=ko&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&gangnamnpc=0';

function hook(page) {
  return page.addInitScript(() => {
    const st = { draws: 0, frames: 0 };
    window.__probe = st;
    for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
      if (!C) continue;
      for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const o = C.prototype[fn];
        if (!o) continue;
        C.prototype[fn] = function (...a) { st.draws++; return o.apply(this, a); };
      }
    }
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { st.frames++; cb(t); });
  });
}
async function open(tag, { w = 1280, h = 800, qs = '', enter = true, shot = true } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
  await hook(page);
  const flags = enter ? `&enter=1${shot ? '&shot=1' : ''}` : '';
  await page.goto(`${B}?${Q}&hour=14${flags}${qs}`, { timeout: 180000 });
  if (!enter) return page;
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return page;
}
async function measure(page) {
  return page.evaluate(async () => {
    const st = window.__probe; st.draws = 0; st.frames = 0;
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 1600));
    const dt = (performance.now() - t0) / 1000;
    const info = window.__jj.renderer.info;
    return {
      draws: Math.round(st.draws / Math.max(1, st.frames)),
      tris: info.render.triangles,
      geometries: info.memory.geometries,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      fps: +(st.frames / dt).toFixed(1),
    };
  });
}
async function surface(page, x, z, yaw = 0, dist = 28, pitch = 0.42) {
  await page.evaluate(async ({ x, z, yaw, dist, pitch }) => {
    const J = window.__jj;
    J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    J.teleport(x, z);
    J.player.rotation.y = yaw;
    J.cam.yaw = yaw;
    J.cam.pitch = pitch;
    J.cam.dist = dist;
  }, { x, z, yaw, dist, pitch });
  await page.waitForTimeout(2500);
}

const perf = {};

// 1) 지구본 — 강남이 열림
{
  const gate = await open('gate', { enter: false });
  await gate.waitForSelector('[data-v2=guest]', { timeout: 60000 });
  await gate.click('[data-v2=guest]');
  const card = gate.locator('.v2-rcard [data-enter-at="gangnam"]');
  await card.waitFor({ state: 'visible', timeout: 90000 });
  await card.scrollIntoViewIfNeeded();
  await gate.waitForTimeout(800);
  await gate.screenshot({ path: `${OUT}/globe-gangnam-open.png` });
  await gate.close();
}

const on = await open('on', { qs: '&enter=1&ui=v2' });
const off = await open('off', { qs: '&enter=1&ui=v2&gangnam=0' });

await surface(on, 12, 18, 0.6, 24, 0.4);
perf['jeongja-on'] = await measure(on);
await surface(off, 12, 18, 0.6, 24, 0.4);
perf['jeongja-off'] = await measure(off);

// 강남역 남쪽 — 경부/강남대로와 버스
await surface(on, -7054, -14324, 0.35, 62, 0.72);
perf['gangnam-road-on'] = await measure(on);
await on.screenshot({ path: `${OUT}/gyeongbu-bus-day.png` });
await surface(off, -7054, -14324, 0.35, 62, 0.72);
perf['gangnam-road-off'] = await measure(off);

async function routeMap(page, id, line, dir, file) {
  const inside = await page.evaluate(() => window.__jj.subway?.room);
  if (inside !== 'platform' && inside !== 'concourse') {
    await page.evaluate(async (id) => {
      const J = window.__jj;
      const st = J.subway.ensureStation(id);
      const e = st.ent.list.find((q) => q.ok) || st.ent.list[0];
      if (J.corridor) await J.corridor.preload(e.x, e.z);
      J.teleport(e.x, e.z);
      J.subway.enterById(e.exit.id);
    }, id);
    await page.waitForFunction(() => window.__jj.subway.state.phase === 'inside' && window.__jj.subway.room === 'concourse' && !window.__jj.subway.swapping, null, { timeout: 90000 });
  }
  await page.evaluate(({ line, dir }) => window.__jj.subway.toPlatform(line, dir), { line, dir });
  await page.waitForFunction(() => window.__jj.subway.room === 'platform' && !window.__jj.subway.swapping, null, { timeout: 60000 });
  await page.waitForTimeout(700);
  const opened = await page.evaluate(() => window.__jj.subway.openRouteMap());
  if (!opened) throw new Error('route map did not open ' + line);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${file}.png` });
  await page.evaluate(() => window.__jj.subway.closeRouteMap());
}

await routeMap(on, 'gangnam', 'shin', 1, 'routemap-shin-pass');
await routeMap(on, 'gangnam', 'l2', 0, 'routemap-l2-pass');

// 요금 팝업 — 유료 모드에서 -N bum, 화면 가운데
{
  const fare = await open('fare', { shot: false, qs: '&demo=econ' });
  const guest = fare.locator('[data-v2=guest]');
  if (await guest.count()) await guest.click();
  await fare.waitForFunction(() => document.body.classList.contains('ui-v2') && window.__bwEconDemo?.dev, null, { timeout: 90000 });
  await fare.evaluate(() => {
    const dev = window.__bwEconDemo.dev;
    dev.seed?.('fig03');
    dev.setMode?.({ transitPaid: true });
    dev.setBalance?.(20000);
  });
  await fare.evaluate(() => window.__bwEconDemo.open('09b'));
  await fare.waitForSelector('.ve-paystack .ve-amt-big', { timeout: 20000 });
  await fare.waitForTimeout(500);
  await fare.screenshot({ path: `${OUT}/fare-centered.png` });
  const box = await fare.evaluate(() => {
    const el = document.querySelector('.ve-paystack');
    const amt = document.querySelector('.ve-amt-big');
    const r = el.getBoundingClientRect();
    return { text: amt?.textContent || '', left: Math.round(r.left), width: Math.round(r.width), vw: innerWidth, center: Math.round(r.left + r.width / 2) };
  });
  fs.writeFileSync(`${OUT}/fare-box.json`, JSON.stringify(box, null, 1));
  await fare.close();
}

const delta = (a, b) => a && b ? { draws: a.draws - b.draws, tris: a.tris - b.tris, heapMB: a.heapMB != null && b.heapMB != null ? +(a.heapMB - b.heapMB).toFixed(1) : null } : null;
const report = {
  perf,
  delta: { jeongja: delta(perf['jeongja-on'], perf['jeongja-off']), gangnamRoad: delta(perf['gangnam-road-on'], perf['gangnam-road-off']) },
  errors: errs.slice(0, 20),
};
fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
await browser.close();
