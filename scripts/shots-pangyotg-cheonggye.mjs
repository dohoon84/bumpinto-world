// 판교TG·청계산 지형 스크린샷
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
  await page.waitForTimeout(1500);
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

async function findBus(page) {
  return page.evaluate(() => {
    const hits = [];
    const root = window.__jj.corridor?.root;
    if (!root) return hits;
    root.traverse((o) => {
      if (!o.visible || !String(o.name || '').startsWith('gyeongbuExpressBuses')) return;
      hits.push({ name: o.name, x: o.position.x, z: o.position.z, fx: Math.sin(o.rotation.y), fz: Math.cos(o.rotation.y) });
    });
    return hits;
  });
}

// 판교TG 낮
{
  const page = await open(8.018);
  await go(page, -413, -3198, lookYaw(-413, -3198, -482, -3232), 36, 0.22);
  // 버스가 요금소 근처에 있으면 그 뒤를 따라 다시 잡음
  const buses = await findBus(page);
  const tg = { x: -482, z: -3232 };
  buses.sort((a, b) => Math.hypot(a.x - tg.x, a.z - tg.z) - Math.hypot(b.x - tg.x, b.z - tg.z));
  const near = buses[0] && Math.hypot(buses[0].x - tg.x, buses[0].z - tg.z) < 280 ? buses[0] : null;
  console.log('tg buses', buses.length, 'near', near);
  if (near) {
    const px = near.x - near.fx * 22;
    const pz = near.z - near.fz * 22;
    await go(page, px, pz, lookYaw(px, pz, near.x + near.fx * 18, near.z + near.fz * 18), 22, 0.24);
  }
  await page.screenshot({ path: path.join(OUT, 'expressbus-pangyotg-day.png'), type: 'png' });
  await page.close();
}
{
  const page = await open(21.018);
  await go(page, -413, -3198, lookYaw(-413, -3198, -482, -3232), 36, 0.22);
  const buses = await findBus(page);
  const tg = { x: -482, z: -3232 };
  buses.sort((a, b) => Math.hypot(a.x - tg.x, a.z - tg.z) - Math.hypot(b.x - tg.x, b.z - tg.z));
  const near = buses[0] && Math.hypot(buses[0].x - tg.x, buses[0].z - tg.z) < 280 ? buses[0] : null;
  if (near) {
    const px = near.x - near.fx * 22;
    const pz = near.z - near.fz * 22;
    await go(page, px, pz, lookYaw(px, pz, near.x + near.fx * 18, near.z + near.fz * 18), 22, 0.24);
  }
  await page.screenshot({ path: path.join(OUT, 'expressbus-pangyotg-night.png'), type: 'png' });
  await page.close();
}

// 청계산 본선
{
  const page = await open(14);
  const hx = -4795.8, hz = -9012.3;
  const fx = -0.59, fz = -0.81;
  const rx = hx - fx * 18, rz = hz - fz * 18;
  await go(page, rx, rz, lookYaw(rx, rz, hx + fx * 40, hz + fz * 40), 16, 0.2);
  await page.screenshot({ path: path.join(OUT, 'expressbus-cheonggye-ride.png'), type: 'png' });
  // 청계산입구 건물 쪽에서 청계산 정상을 바라봄 — 전경 도로·건물, 원경 산자락
  const ax = hx + 100, az = hz - 80;
  await go(page, ax, az, lookYaw(ax, az, -5850, -6200), 180, 0.42);
  await page.screenshot({ path: path.join(OUT, 'expressbus-cheonggye-aerial.png'), type: 'png' });
  await page.close();
}

await browser.close();
console.log('wrote pangyoTG + cheonggye shots to', OUT);
