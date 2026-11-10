// 판교TG 차로·기둥·표지 + 정자 시내버스와 같은 차체 확인
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
  await page.waitForTimeout(2500);
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

function sceneRootEval() {
  return `(() => {
    let root = window.__jj?.corridor?.root;
    if (!root) return null;
    while (root.parent) root = root.parent;
    return root;
  })()`;
}

async function findExpress(page) {
  return page.evaluate(() => {
    const hits = [];
    let root = window.__jj?.corridor?.root;
    if (!root) return hits;
    root.traverse((o) => {
      if (!o.visible || !String(o.name || '').startsWith('gyeongbuExpressBuses')) return;
      hits.push({
        name: o.name, x: o.position.x, z: o.position.z,
        fx: Math.sin(o.rotation.y), fz: Math.cos(o.rotation.y),
      });
    });
    return hits;
  });
}

async function findCity(page) {
  return page.evaluate(() => {
    const hits = [];
    let root = window.__jj?.corridor?.root;
    if (!root) return hits;
    while (root.parent) root = root.parent;
    root.traverse((o) => {
      const u = o.userData;
      if (!u?.ref || !u.type || !o.visible) return;
      if (u.ref === '9004' || u.ref === '1151' || u.type === 'express') return;
      if (String(o.name || '').startsWith('gyeongbuExpressBuses')) return;
      hits.push({
        name: `${u.ref}/${u.type}`, x: o.position.x, z: o.position.z,
        fx: Math.sin(o.rotation.y), fz: Math.cos(o.rotation.y),
      });
    });
    return hits;
  });
}

const tg = { x: -482, z: -3232 };

async function followBus(page, bus, side = false, kind = 'follow') {
  if (!bus) return;
  if (side) {
    const px = bus.x + bus.fz * 13;
    const pz = bus.z - bus.fx * 13;
    await go(page, px, pz, lookYaw(px, pz, bus.x, bus.z), kind === 'close' ? 8 : 10, 0.08);
  } else if (kind === 'plaza') {
    const px = bus.x - bus.fx * 22;
    const pz = bus.z - bus.fz * 22;
    await go(page, px, pz, lookYaw(px, pz, bus.x + bus.fx * 18, bus.z + bus.fz * 18), 22, 0.22);
  } else {
    const px = bus.x - bus.fx * 14 + bus.fz * 3;
    const pz = bus.z - bus.fz * 14 - bus.fx * 3;
    await go(page, px, pz, lookYaw(px, pz, bus.x + bus.fx * 4, bus.z + bus.fz * 4), 8, 0.14);
  }
}

{
  const page = await open(8.018);
  await go(page, -400, -3185, lookYaw(-400, -3185, -482, -3232), 34, 0.18);
  const buses = await findExpress(page);
  buses.sort((a, b) => Math.hypot(a.x - tg.x, a.z - tg.z) - Math.hypot(b.x - tg.x, b.z - tg.z));
  const near = buses[0] && Math.hypot(buses[0].x - tg.x, buses[0].z - tg.z) < 280 ? buses[0] : null;
  console.log('tg-day express', buses.length, near);
  if (near) await followBus(page, near, false, 'plaza');
  await page.screenshot({ path: path.join(OUT, 'expressbus-pangyotg2-day.png'), type: 'png' });

  if (near) {
    await followBus(page, near, false, 'close');
    await page.screenshot({ path: path.join(OUT, 'expressbus-body2-close.png'), type: 'png' });
    await followBus(page, near, true, 'close');
    await page.screenshot({ path: path.join(OUT, 'expressbus-body2-side.png'), type: 'png' });
  }
  await page.close();
}

{
  const page = await open(21.018);
  await go(page, -400, -3185, lookYaw(-400, -3185, -482, -3232), 34, 0.18);
  const buses = await findExpress(page);
  buses.sort((a, b) => Math.hypot(a.x - tg.x, a.z - tg.z) - Math.hypot(b.x - tg.x, b.z - tg.z));
  const near = buses[0] && Math.hypot(buses[0].x - tg.x, buses[0].z - tg.z) < 280 ? buses[0] : null;
  console.log('tg-night express', buses.length, near);
  if (near) await followBus(page, near, false, 'plaza');
  await page.screenshot({ path: path.join(OUT, 'expressbus-pangyotg2-night.png'), type: 'png' });
  await page.close();
}

{
  const page = await open(14);
  await go(page, -20, 50, 0, 18, 0.15);
  let city = await findCity(page);
  console.log('city at jeongja', city.length, city[0]);
  if (!city.length) {
    await go(page, -2.8, -23.7, 0, 20, 0.12);
    city = await findCity(page);
    console.log('city retry 정자역', city.length, city[0]);
  }
  if (city[0]) {
    const c = city[0];
    const px = c.x + c.fz * 12, pz = c.z - c.fx * 12;
    await go(page, px, pz, lookYaw(px, pz, c.x, c.z), 9, 0.08);
  }
  await page.screenshot({ path: path.join(OUT, 'expressbus-city-side.png'), type: 'png' });
  await page.close();
}

await browser.close();
console.log('wrote pangyotg2 shots to', OUT);
