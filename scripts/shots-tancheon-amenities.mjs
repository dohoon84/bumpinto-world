import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire('/workspace/bw-cityhall-fountain/package.json')('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5199/';
const OUT = process.env.OUT || '/workspace/bw-tancheon-shots';
fs.mkdirSync(OUT, { recursive: true });
const Q = '?enter=1&name=Tester&ws=mock&bus=sim&hour=21&weather=clear&shot=1&lang=ko&noticePopup=0&bgm=0&npcs=0&taxis=0&police=0&trucks=0&bike=0&roadbike=0&superbike=0&clife=1&ccars=16';
const VIEWS = [
  { name: 'dogpark-aerial', x: 880, z: -5985, mode: 'overview', dist: 140, pitch: 0.85, yaw: 0.3 },
  { name: 'dogpark-eye', x: 885, z: -5965, dist: 14, pitch: 0.1, yaw: -0.2 },
  { name: 'stairs-eye', x: 912, z: -5978, dist: 14, pitch: 0.05, yaw: 1.55 },
  { name: 'stairs-aerial', x: 890, z: -5975, mode: 'overview', dist: 70, pitch: 0.9, yaw: 0.05 },
  { name: 'signal-aerial', x: 1102, z: -5149, mode: 'overview', dist: 55, pitch: 1.05, yaw: -0.6 },
  { name: 'signal-eye', x: 1095, z: -5160, dist: 18, pitch: 0.2, yaw: 0.2 },
  { name: 'signal-leftturn', x: 1105, z: -5140, dist: 22, pitch: 0.28, yaw: -2.2 },
];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e.message || e)));
await page.goto(BASE + Q, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 180000 });
await page.waitForTimeout(4000);
for (const v of VIEWS) {
  const info = await page.evaluate(async (v) => {
    const J = window.__jj;
    J.setMode('follow');
    if (J.corridor?.preload) await J.corridor.preload(v.x, v.z);
    J.teleport(v.x, v.z);
    if (v.mode === 'overview') { J.setMode('overview'); Object.assign(J.ov, { dist: v.dist, pitch: v.pitch, yaw: v.yaw }); }
    else Object.assign(J.cam, { dist: v.dist, pitch: v.pitch, yaw: v.yaw });
    await new Promise((r) => setTimeout(r, 3000));
    return { y: +J.player.position.y.toFixed(2), hasDog: !!J.corridor?.amenities?.dogPark, hasSig: !!J.corridor?.amenities?.signals };
  }, v);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${v.name}.png` });
  console.log(v.name, info);
}
console.log('errors', errors.slice(0, 5));
await browser.close();
