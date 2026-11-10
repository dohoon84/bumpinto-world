// 판교→강남 광역버스 경로 점검 + 청계산입구역 출입구
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5195/';
const OUT = process.env.OUT || path.resolve('artifacts');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const Q = 'lang=ko&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&gangnamnpc=0&bp24game=0&controlscard=0';

function lookYaw(fromX, fromZ, toX, toZ) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

async function open(hour) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${B}?${Q}&hour=${hour}&enter=1&shot=1`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2200);
  return page;
}

async function go(page, x, z, yaw = 0, dist = 28, pitch = 0.35) {
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
  await page.waitForTimeout(3200);
}

async function waitStation(page) {
  await page.waitForFunction(() => {
    const root = window.__jj?.corridor?.root?.parent;
    if (!root) return false;
    let ok = false;
    root.traverse((o) => {
      if (o.name === 'cheonggyeStationSign' || o.name === 'cheonggyeEntrances') ok = true;
    });
    return ok;
  }, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function shot(page, name, x, z, tx, tz, dist, pitch) {
  await go(page, x, z, lookYaw(x, z, tx, tz), dist, pitch);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, type: 'png' });
  console.log('wrote', name);
}

const e1 = { x: -4782.8, z: -9114.0, ry: 0.377 };
const e1fx = Math.sin(e1.ry), e1fz = Math.cos(e1.ry);

{
  const page = await open(14);
  // 1 판교역 출발 거리
  await shot(page, 'route-audit-pangyo-depart.png', 300, -2788, 240, -2820, 22, 0.16);
  // 2 판교IC 램프 (요금소 직전 접근로)
  await shot(page, 'route-audit-pangyo-ic.png', -760, -3850, -820, -3920, 36, 0.22);
  // 3 판교TG
  await shot(page, 'route-audit-pangyotg-day.png', -413, -3198, -482, -3232, 36, 0.22);
  // 4 금토동 본선
  await shot(page, 'route-audit-geumto-ride.png', -2840, -6370, -2920, -6470, 18, 0.14);
  await shot(page, 'route-audit-geumto-aerial.png', -2700, -6200, -3000, -6600, 160, 0.52);
  // 5 청계산 본선
  await shot(page, 'route-audit-cheonggye-ride.png', -4780, -8990, -4860, -9100, 18, 0.14);
  await shot(page, 'route-audit-cheonggye-aerial.png', -4650, -8880, -5000, -9300, 190, 0.50);
  // 6 청계산입구역 출입구
  await go(page, e1.x - e1fx * 9.5, e1.z - e1fz * 9.5, lookYaw(e1.x - e1fx * 9.5, e1.z - e1fz * 9.5, e1.x + e1fx * 3, e1.z + e1fz * 3), 12, 0.10);
  await waitStation(page);
  await page.screenshot({ path: path.join(OUT, 'route-cheonggye-station-near.png'), type: 'png' });
  console.log('wrote route-cheonggye-station-near.png');
  await shot(page, 'route-cheonggye-station-road.png', -4812, -9038, -4782.8, -9114.0, 32, 0.16);
  // 7 원지동
  await shot(page, 'route-audit-wonji-ride.png', -5270, -9668, -5360, -9780, 18, 0.14);
  // 8 양재IC (본선→지선)
  await shot(page, 'route-audit-yangjae-ic.png', -6040, -10730, -6160, -10860, 28, 0.20);
  await shot(page, 'route-audit-yangjae-aerial.png', -5900, -10580, -6300, -11050, 170, 0.50);
  // 9 서초IC
  await shot(page, 'route-audit-seocho-ic.png', -7088, -12340, -7200, -12520, 28, 0.20);
  // 10 강남대로 진입
  await shot(page, 'route-audit-gangnam-approach.png', -7780, -14680, -7500, -15180, 26, 0.16);
  await shot(page, 'route-audit-leave-expressway.png', -6220, -10960, -6400, -11200, 32, 0.22);
  await page.close();
}

{
  const page = await open(21);
  await shot(page, 'route-audit-pangyotg-night.png', -413, -3198, -482, -3232, 36, 0.22);
  await shot(page, 'route-audit-cheonggye-night.png', -4780, -8990, -4860, -9100, 20, 0.14);
  await go(page, e1.x - e1fx * 9.5, e1.z - e1fz * 9.5, lookYaw(e1.x - e1fx * 9.5, e1.z - e1fz * 9.5, e1.x + e1fx * 3, e1.z + e1fz * 3), 12, 0.10);
  await waitStation(page);
  await page.screenshot({ path: path.join(OUT, 'route-audit-cheonggye-station-night.png'), type: 'png' });
  console.log('wrote route-audit-cheonggye-station-night.png');
  await shot(page, 'route-audit-gangnam-approach-night.png', -7780, -14680, -7500, -15180, 26, 0.16);
  await page.close();
}

await browser.close();
console.log('route audit shots done');
