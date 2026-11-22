// [v4c] 한 자리 스크린샷. node scripts/shot-spot.mjs PORT OUT NAME X Z TX TZ [DIST PITCH W H]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [PORT = '5311', OUT = '/tmp/spot', NAME = 'spot', X, Z, TX, TZ, DIST = '9', PITCH = '-0.05', W = '1280', H = '800'] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const MOBILE = +W < 900;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: +W, height: +H }, ...(MOBILE ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}) })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/?ws=mock&at=seongsu&hour=14&weather=clear&shot=1&noticePopup=0&controlscard=0&bgm=0&subwayVoice=0&subwayRt=0${MOBILE ? '&mobile=1' : ''}`, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.seongsu?.ready, null, { timeout: 300000 });
const info = await page.evaluate(async (o) => {
  const J = window.__jj; J.setMode('follow'); await J.corridor.preload?.(o.x, o.z);
  const y = J.terrain.getGroundHeight(o.x, o.z, 1); J.teleport(o.x, o.z, y);
  const yaw = Math.atan2(-(o.tx - o.x), -(o.tz - o.z)); if (o.ov) { J.setMode('overview'); Object.assign(J.ov, { dist: o.dist, pitch: o.pitch, yaw }); } else Object.assign(J.cam, { dist: o.dist, pitch: o.pitch, yaw }); J.player.rotation.y = yaw + Math.PI; J.player.visible = !o.hide;
  await new Promise((r) => setTimeout(r, 6000));
  return { y };
}, { x: +X, z: +Z, tx: +TX, tz: +TZ, dist: +DIST, pitch: +PITCH, ov: process.env.OV === '1', hide: process.env.HIDE === '1' });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/${W}x${H}-${NAME}.png` });
const m = await page.evaluate(() => { const i = window.__jj.renderer.info; return { draws: i.render.calls, tris: i.render.triangles }; });
console.log(JSON.stringify({ info, m, errors }));
await browser.close();
