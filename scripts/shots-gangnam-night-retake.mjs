// 카메라만 다시: 강남대로 야경, 미디어폴 낮/밤, 전광판, 플래그 비교
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5208/';
const OUT = process.env.OUT || '/opt/cursor/artifacts/gangnam2';
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
async function open(hour, extra = '') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto(`${B}?${Q}&hour=${hour}&shot=1${extra}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(600);
  return page;
}
async function go(page, x, z, yaw, dist, pitch) {
  await page.evaluate(async ({ x, z, yaw, dist, pitch }) => {
    const J = window.__jj;
    J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    const p = J.corridor?.freeSpot ? J.corridor.freeSpot(x, z) : { x, z };
    J.teleport(p.x, p.z);
    J.player.rotation.y = yaw;
    J.cam.yaw = yaw;
    J.cam.pitch = pitch;
    J.cam.dist = dist;
  }, { x, z, yaw, dist, pitch });
  await page.waitForTimeout(2200);
}
// 강남대로 넓은 구간 중심, 북동쪽을 봄
const tx = 0.363, tz = 0.932;
const avenueYaw = Math.atan2(-tx, -tz);
const ax = -7250, az = -14782;

const snap = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 90000 });
const night = await open(21);
const screens = await night.evaluate(() => window.__jj.gangnamAds?.screens || []);
const pole = screens.find((s) => s.id === 'pole-e11');
const board = screens.find((s) => s.id === 'board-cross-w');
const look = (s, stand) => ({ x: s.x + Math.sin(s.yaw) * stand, z: s.z + Math.cos(s.yaw) * stand, yaw: s.yaw });
await go(night, ax, az, avenueYaw, 14, 0.22);
await snap(night, 'pc-daero-night');
if (pole) { const f = look(pole, 6); await go(night, f.x, f.z, f.yaw, 5, -0.15); await snap(night, '_pole-night'); }
if (board) { const f = look(board, 26); await go(night, f.x, f.z, f.yaw, 12, -0.42); await snap(night, 'pc-board-street'); }
await go(night, -7140, -14620, 0.4, 28, 0.35);
await snap(night, 'pc-crossing-night');
await night.close();

const day = await open(14);
await go(day, ax, az, avenueYaw, 14, 0.22);
await snap(day, '_daero-day');
if (pole) { const f = look(pole, 6); await go(day, f.x, f.z, f.yaw, 5, -0.15); await snap(day, '_pole-day'); }
await day.close();

const night0 = await open(21, '&gangnamnight=0');
await go(night0, ax, az, avenueYaw, 14, 0.22);
await snap(night0, '_night0');
await night0.close();

const ads0 = await open(21, '&gangnamads=0');
if (board) { const f = look(board, 26); await go(ads0, f.x, f.z, f.yaw, 12, -0.42); await snap(ads0, '_ads0'); }
await ads0.close();
console.log('retake ok', { avenueYaw, pole: !!pole, board: board?.id });
await browser.close();
