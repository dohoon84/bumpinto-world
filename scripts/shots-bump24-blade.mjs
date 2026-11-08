import { chromium } from 'playwright';
const OUT = process.env.OUT || 'artifacts';
const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});
async function shot(name, hour, place) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('[pageerror]', name, e.message));
  await page.goto(`http://127.0.0.1:5173/?shot=1&bp24game=1&at=bump24-jeongja&hour=${hour}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 180000 });
  await page.waitForTimeout(hour >= 20 ? 4500 : 1400);
  await page.evaluate((p) => {
    const y = __jj.terrain ? __jj.terrain.getGroundHeight(p.x, p.z, 0) : 0;
    __jj.teleport(p.x, p.z, y);
    __jj.setMode('follow');
    __jj.cam.yaw = p.yaw; __jj.cam.pitch = p.pitch; __jj.cam.dist = p.dist; __jj.cam.mode = 'follow';
  }, place);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.close();
  console.log('ok', name);
}
const street = { x: -80.4, z: -86.5, yaw: 0.42, pitch: -0.38, dist: 12.5 };
await shot('bump24-jeongja-blade-day', 14, street);
await shot('bump24-jeongja-blade-night', 21, street);
await shot('bump24-jeongja-blade-side', 14, { x: -79.2, z: -82.2, yaw: 1.1, pitch: -0.08, dist: 7 });
await browser.close();
console.log('shots ok');
