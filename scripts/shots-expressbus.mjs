// [gyeongbu-bus] 광역버스·서울TG·버스전용차로 스크린샷.
//   BASE=http://127.0.0.1:5195/ OUT=artifacts node scripts/shots-expressbus.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5195/';
const OUT = process.env.OUT || path.resolve('artifacts');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const Q = 'lang=ko&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&gangnamnpc=0&bp24game=0&controlscard=0';
const errs = [];

async function open(tag, { w = 1440, h = 900, hour = 14 } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
  await page.goto(`${B}?${Q}&hour=${hour}&enter=1&shot=1`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return page;
}

// follow-cam: camera sits at player + (sin yaw, cos yaw) * dist and looks the opposite way.
// To look from `from` toward `to`: yaw = atan2(-(toX-fromX), -(toZ-fromZ)).
function lookYaw(fromX, fromZ, toX, toZ) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
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
  await page.waitForTimeout(2800);
}

async function findBus(page) {
  return page.evaluate(() => {
    const hits = [];
    const root = window.__jj.corridor?.root;
    if (!root) return hits;
    root.traverse((o) => {
      if (!o.isInstancedMesh || !String(o.name || '').startsWith('gyeongbuExpressBuses')) return;
      const arr = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) {
        const b = i * 16;
        const sx = Math.hypot(arr[b], arr[b + 1], arr[b + 2]);
        if (sx < 0.5) continue;
        hits.push({
          name: o.name,
          x: arr[b + 12], y: arr[b + 13], z: arr[b + 14],
          fx: arr[b + 8], fy: arr[b + 9], fz: arr[b + 10],
        });
      }
    });
    return hits;
  });
}

async function waitBus(page, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const hits = await findBus(page);
    if (hits.length) return hits;
    await page.waitForTimeout(800);
  }
  return [];
}

function shot(page, name) {
  return page.screenshot({ path: path.join(OUT, name), type: 'png' });
}

async function dumpCam(page, label) {
  const info = await page.evaluate(() => {
    const J = window.__jj || {};
    const scene = J.scene || J.world?.scene;
    let bbox = null, hasToll = false;
    try {
      const box = scene?.getObjectByName?.('seoulTollBody');
      hasToll = !!(scene?.getObjectByName?.('seoulToll') || box);
      if (box && window.THREE) {
        box.updateWorldMatrix(true, true);
        const b = new window.THREE.Box3().setFromObject(box);
        bbox = { min: [...b.min], max: [...b.max] };
      }
    } catch (_) {}
    return {
      player: J.player ? { x: J.player.position.x, y: J.player.position.y, z: J.player.position.z, ry: J.player.rotation.y } : null,
      cam: J.cam ? { yaw: J.cam.yaw, pitch: J.cam.pitch, dist: J.cam.dist, mode: J.cam.mode } : null,
      hasToll, bbox,
    };
  });
  console.log(label, JSON.stringify(info));
  return info;
}

// 1-4) 차체·차로: 첨두 시각 본선 중간의 버스를 찾아 가까이·옆·뒤에서
{
  const page = await open('body', { hour: 8 });
  await go(page, -4058, -8074, 0.4, 40, 0.5);
  let buses = await waitBus(page);
  if (!buses.length) {
    await go(page, -3000, -6700, 0.4, 40, 0.5);
    buses = await waitBus(page);
  }
  if (!buses.length) {
    await go(page, -5200, -9500, 0.4, 40, 0.5);
    buses = await waitBus(page);
  }
  const bus = buses[0];
  fs.writeFileSync(path.join(OUT, 'expressbus-found.json'), JSON.stringify({ buses, used: bus }, null, 2));
  if (bus) {
    const sideX = bus.fz, sideZ = -bus.fx;
    // 3/4 전면: 버스 앞옆 바로 옆에 서서 차체가 화면을 채우게
    const closeX = bus.x + bus.fx * 7.2 + sideX * 5.6;
    const closeZ = bus.z + bus.fz * 7.2 + sideZ * 5.6;
    await go(page, closeX, closeZ, lookYaw(closeX, closeZ, bus.x, bus.z), 13, 0.16);
    await dumpCam(page, 'body-close');
    await shot(page, 'expressbus-body-close.png');

    const sx = bus.x + sideX * 4.8;
    const sz = bus.z + sideZ * 4.8;
    await go(page, sx, sz, lookYaw(sx, sz, bus.x, bus.z), 12, 0.07);
    await dumpCam(page, 'body-side');
    await shot(page, 'expressbus-body-side.png');

    const rx = bus.x - bus.fx * 7.5;
    const rz = bus.z - bus.fz * 7.5;
    await go(page, rx, rz, lookYaw(rx, rz, bus.x + bus.fx, bus.z + bus.fz), 12, 0.17);
    await dumpCam(page, 'ride');
    await shot(page, 'expressbus-ride.png');

    const lx = bus.x - bus.fx * 22;
    const lz = bus.z - bus.fz * 22;
    await go(page, lx, lz, lookYaw(lx, lz, bus.x + bus.fx * 50, bus.z + bus.fz * 50), 52, 0.95);
    await dumpCam(page, 'buslane');
    await shot(page, 'expressbus-buslane.png');
  } else {
    console.warn('no express bus found; writing placeholders from mid-mainline');
    await shot(page, 'expressbus-body-close.png');
    await shot(page, 'expressbus-body-side.png');
    await shot(page, 'expressbus-ride.png');
    await shot(page, 'expressbus-buslane.png');
  }
  await page.close();
}

// 5-6) 서울TG 낮/밤 — 남쪽에서 북쪽(본선 진행)을 바라봄. yaw=0 이 북쪽.
{
  const day = await open('tg-day', { hour: 14 });
  await go(day, -442.4, 198, 0, 56, 0.24);
  await dumpCam(day, 'tg-day');
  await shot(day, 'expressbus-tollgate-day.png');
  // 예비: 위에서 내려다본 각도
  await go(day, -442.4, 148.3, 0, 95, 1.08);
  await shot(day, 'expressbus-tollgate-day-aerial.png');
  await day.close();
}
{
  const night = await open('tg-night', { hour: 21 });
  await go(night, -442.4, 198, 0, 56, 0.24);
  await dumpCam(night, 'tg-night');
  await shot(night, 'expressbus-tollgate-night.png');
  await go(night, -442.4, 148.3, 0, 95, 1.08);
  await shot(night, 'expressbus-tollgate-night-aerial.png');
  await night.close();
}

await browser.close();
if (errs.length) {
  console.log('page errors:', errs.slice(0, 12));
}
console.log('wrote shots to', OUT);
