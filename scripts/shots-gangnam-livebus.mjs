import fs from 'node:fs';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:5228/';
const OUT = process.env.OUT || '/workspace/bw-gangnam-livebus/artifacts';
fs.mkdirSync(OUT, { recursive: true });
const LIVE = {
  22009: [
    { ref: '1151', etaSec: 12, msg: '곧 도착', type: 'express', vehId: '204000181', routeId: '204000081' },
    { ref: '441', etaSec: 96, msg: '2분 후', type: 'city', vehId: '121047069' },
    { ref: '9404', etaSec: 150, msg: '3분 후', type: 'express', vehId: '113008248' },
  ],
  22010: [{ ref: '9404', etaSec: 40, msg: '곧 도착', type: 'express', vehId: '113008251' }],
};
const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.route('**/bus/arrivals**', async (route) => {
  const u = new URL(route.request().url());
  const stop = u.searchParams.get('stop');
  await route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ ok: true, src: 'live', stop, name: '신분당선강남역(중)', fetchedAt: Date.now(), providers: ['gg'], arrivals: LIVE[stop] || LIVE['22009'] }),
  });
});
const Q = 'enter=1&name=Tester&ws=mock&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&at=gangnam&hour=19&shot=1';
await page.goto(`${B}?${Q}`, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
const STOP = { x: -7051.5, z: -14313.7 };
await page.evaluate(async ({ x, z }) => {
  const J = window.__jj;
  J.setMode('follow');
  if (J.corridor) await J.corridor.preload(x, z);
  J.teleport(x + 4, z + 6);
}, STOP);
await page.waitForFunction(() => window.__jj?.gangnamBrt?.stats?.loaded, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1800);
await page.evaluate(({ x, z }) => window.__jj.liveBus?.tick(30, { x, z }), STOP);
await page.waitForFunction(() => (window.__jj?.liveBus?.board('22009') || '').includes('1151'), null, { timeout: 15000 });
await page.waitForTimeout(2200);
const bus = await page.evaluate(({ x, z }) => {
  const vs = window.__jj.gangnamBrt?.vehicles?.() || [];
  return vs
    .map((v) => ({ ref: v.ref, state: v.state, x: v.x, z: v.z, heading: v.heading, d: Math.hypot(v.x - x, v.z - z) }))
    .filter((v) => v.ref === '1151')
    .sort((a, b) => a.d - b.d)[0];
}, STOP);
console.log('bus', bus);

// board + bus: stand on red lane looking at dwelling 1151, overlay still in view
await page.evaluate(({ bus, stop }) => {
  const J = window.__jj;
  const px = stop.x + 6, pz = stop.z + 10;
  const lookX = (bus.x + stop.x) / 2 - 2;
  const lookZ = (bus.z + stop.z) / 2;
  const yaw = Math.atan2(lookX - px, lookZ - pz);
  J.teleport(px, pz);
  J.player.rotation.y = yaw;
  J.cam.yaw = yaw;
  J.cam.pitch = 0.08;
  J.cam.dist = 12;
}, { bus, stop: STOP });
await page.waitForTimeout(1100);
await page.screenshot({ path: `${OUT}/livebus-22009-board.png` });

// closer front-left of the 1151
await page.evaluate(({ bus }) => {
  const J = window.__jj;
  const h = bus.heading;
  const px = bus.x + Math.sin(h) * 16 - Math.cos(h) * 7;
  const pz = bus.z + Math.cos(h) * 16 + Math.sin(h) * 7;
  const yaw = Math.atan2(bus.x - px, bus.z - pz);
  J.teleport(px, pz);
  J.player.rotation.y = yaw;
  J.cam.yaw = yaw;
  J.cam.pitch = 0.05;
  J.cam.dist = 10;
}, { bus });
await page.waitForTimeout(1100);
await page.screenshot({ path: `${OUT}/livebus-22009-bus.png` });

// extra angle: farther back on the lane
await page.evaluate(({ bus, stop }) => {
  const J = window.__jj;
  const px = stop.x + 8, pz = stop.z + 18;
  const yaw = Math.atan2(bus.x - px, bus.z - pz);
  J.teleport(px, pz);
  J.player.rotation.y = yaw;
  J.cam.yaw = yaw;
  J.cam.pitch = 0.14;
  J.cam.dist = 14;
}, { bus, stop: STOP });
await page.waitForTimeout(1100);
await page.screenshot({ path: `${OUT}/livebus-22009-wide.png` });

await browser.close();
console.log('done');
