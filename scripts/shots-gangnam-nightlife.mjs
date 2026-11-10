// [gangnam-nightlife] 강남 밤거리 스크린샷. vite preview 가 떠 있어야 한다.
//   BASE=http://127.0.0.1:5221/ OUT=/workspace/bw-gangnam-nightlife/artifacts node scripts/shots-gangnam-nightlife.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5221/';
const OUT = process.env.OUT || '/workspace/bw-gangnam-nightlife/artifacts';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0';

async function open({ w = 1280, h = 800, hour = 21 } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${B}?${Q}&hour=${hour}&shot=1`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(1000);
  return page;
}
async function surface(page, x, z, yaw = 0, dist = 22, pitch = 0.38, wait = 3500) {
  await page.evaluate(async ({ x, z, yaw, dist, pitch }) => {
    const J = window.__jj; J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    J.teleport(x, z); J.player.rotation.y = yaw; J.cam.yaw = yaw; J.cam.pitch = pitch; J.cam.dist = dist;
  }, { x, z, yaw, dist, pitch });
  await page.waitForFunction(() => window.__jj?.gangnamStreet?.stats?.loaded, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(wait);
}

const ISLAND = { x: -7261.0, z: -14834.9, yaw: 1.945 };
const fx = Math.sin(ISLAND.yaw), fz = Math.cos(ISLAND.yaw);
const rx = Math.cos(ISLAND.yaw), rz = -Math.sin(ISLAND.yaw);
const ALLEY = { x: -7084, z: -14620, yaw: 1.15 };
const IX = { x: -7144, z: -14531 };
const STATION = { x: -7097.7, z: -14453.3 };

async function stage(page) {
  return page.evaluate(() => {
    const brt = window.__jj?.gangnamBrt;
    if (!brt?.stageAt) return { ok: false };
    return { ok: true, ...brt.stageAt('22012'), stats: { ...brt.stats } };
  });
}

const notes = {};

// --- paint regression: dwell night ---
const night = await open({ hour: 21 });
await surface(night, ISLAND.x + fx * 12 + rx * -6, ISLAND.z + fz * 12 + rz * -6, ISLAND.yaw - 0.5, 16, 0.32, 7000);
notes.dwellStage = await stage(night);
await night.waitForTimeout(500);
await night.screenshot({ path: `${OUT}/gnight9-brt-dwell-night.png` });

// pylon readable at 3/4 — stand along the outward face normal, look back at the board
const pylon = { x: -7254, z: -14817.1, yaw: 1.945 };
await surface(night, pylon.x + Math.sin(pylon.yaw) * 10, pylon.z + Math.cos(pylon.yaw) * 10, pylon.yaw, 9, 0.34, 3500);
await night.screenshot({ path: `${OUT}/gnight10-pylon-night.png` });

// shop interiors — stand in the street looking into the window
const shop = { x: -7078.9, z: -14624.9, yaw: -2.792 };
await surface(night, shop.x + Math.sin(shop.yaw) * 8.5, shop.z + Math.cos(shop.yaw) * 8.5, shop.yaw, 9, 0.05, 4000);
await night.screenshot({ path: `${OUT}/gnight10-shop-interior-night.png` });

const auditNight = [
  ['audit-ix-night', IX.x + 10, IX.z + 22, 0.15, 24, 0.26],
  ['audit-exit-station-night', STATION.x + 12, STATION.z + 8, -0.4, 18, 0.22],
  ['audit-teheran-night', -6880, -14540, -1.15, 22, 0.24],
  ['audit-seocho-night', -7340, -14590, 2.05, 22, 0.24],
  ['audit-rooftops-night', IX.x - 8, IX.z + 30, 0.05, 16, 0.62],
  ['audit-edge-north-night', -7488, -15420, 0.4, 26, 0.28],
  ['audit-edge-east-night', -6550, -14740, -1.4, 28, 0.3],
];
for (const [name, x, z, yaw, dist, pitch] of auditNight) {
  await surface(night, x, z, yaw, dist, pitch, 2800);
  await night.screenshot({ path: `${OUT}/gnight10-${name}.png` });
}
await night.close();

const day = await open({ hour: 14 });
await surface(day, ISLAND.x + fx * 12 + rx * -6, ISLAND.z + fz * 12 + rz * -6, ISLAND.yaw - 0.5, 16, 0.32, 6000);
await stage(day);
await day.waitForTimeout(400);
await day.screenshot({ path: `${OUT}/gnight9-brt-day.png` });
await surface(day, ISLAND.x, ISLAND.z, 0.374, 52, 1.38, 4000);
await stage(day);
await day.screenshot({ path: `${OUT}/gnight10-brt-top.png` });
await surface(day, pylon.x + Math.sin(pylon.yaw) * 10, pylon.z + Math.cos(pylon.yaw) * 10, pylon.yaw, 9, 0.34, 3000);
await day.screenshot({ path: `${OUT}/gnight10-pylon-day.png` });
await surface(day, shop.x + Math.sin(shop.yaw) * 8.5, shop.z + Math.cos(shop.yaw) * 8.5, shop.yaw, 9, 0.05, 3500);
await day.screenshot({ path: `${OUT}/gnight10-shop-interior-day.png` });

const auditDay = [
  ['audit-ix-day', IX.x + 10, IX.z + 22, 0.15, 24, 0.26],
  ['audit-teheran-day', -6880, -14540, -1.15, 22, 0.24],
  ['audit-seocho-day', -7340, -14590, 2.05, 22, 0.24],
  ['audit-rooftops-day', IX.x - 8, IX.z + 30, 0.05, 16, 0.62],
  ['audit-edge-south-day', -7020, -14190, 0.35, 26, 0.28],
  ['audit-alley-day', -7085.7, -14627.8, -2.792, 12, 0.12],
];
for (const [name, x, z, yaw, dist, pitch] of auditDay) {
  await surface(day, x, z, yaw, dist, pitch, 2800);
  await day.screenshot({ path: `${OUT}/gnight10-${name}.png` });
}
await day.close();
await browser.close();
console.log(JSON.stringify({ out: OUT, dwellStage: notes.dwellStage, files: fs.readdirSync(OUT).filter((f) => f.startsWith('gnight9') || f.startsWith('gnight10')) }, null, 2));
