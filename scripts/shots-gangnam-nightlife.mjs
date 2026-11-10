// [gangnam-nightlife] 강남 밤거리 스크린샷. vite preview 가 떠 있어야 한다.
//   BASE=http://127.0.0.1:5221/ OUT=/opt/cursor/artifacts node scripts/shots-gangnam-nightlife.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5221/';
const OUT = process.env.OUT || '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&gangnamnpc=0';
const JZ_Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0';

async function open({ w = 1280, h = 800, hour = 21, extra = '' } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${B}?${extra.includes('jzq=1') ? JZ_Q : Q}&hour=${hour}&shot=1${extra.replace('&jzq=1','')}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(1200);
  return page;
}
async function surface(page, x, z, yaw = 0, dist = 22, pitch = 0.38, wait = 5200) {
  await page.evaluate(async ({ x, z, yaw, dist, pitch }) => {
    const J = window.__jj; J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    J.teleport(x, z); J.player.rotation.y = yaw; J.cam.yaw = yaw; J.cam.pitch = pitch; J.cam.dist = dist;
  }, { x, z, yaw, dist, pitch });
  await page.waitForTimeout(wait);
}

const night = await open({ hour: 21 });
await surface(night, -7150, -14590, 0.22, 34, 0.16);
await night.screenshot({ path: `${OUT}/gnight4-daero.png` });

await surface(night, -7140, -14530, 0.35, 200, 1.05);
await night.screenshot({ path: `${OUT}/gnight4-aerial.png` });

const stats = await night.evaluate(() => ({
  nl: window.__jj.gangnamNightlife?.stats || null,
  night: window.__jj.gangnamNight?.stats || null,
  cars: (() => {
    const root = window.__jj.gangnamNightlife?.root;
    if (!root) return null;
    const mesh = root.getObjectByName('gnightCars');
    return {
      name: mesh?.name || null,
      isBatched: !!mesh?.isBatchedMesh,
      geoName: mesh?.geometry?.type || null,
    };
  })(),
}));
await night.close();

const jz = await open({ hour: 21, extra: '&jzq=1' });
await surface(jz, -20, 20, 2.9, 28, 0.18, 9000);
await jz.screenshot({ path: `${OUT}/gnight4-compare-jeongja.png` });
const jzStats = await jz.evaluate(() => ({
  jz: window.__jj.jzTraffic?.stats?.() || null,
  pos: window.__jj.player ? { x: window.__jj.player.position.x, z: window.__jj.player.position.z } : null,
}));
await jz.close();
await browser.close();
console.log(JSON.stringify({ out: OUT, stats, jzStats }, null, 2));
