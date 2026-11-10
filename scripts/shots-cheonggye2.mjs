// 청계산 본선 2차 스크린샷: 4+4 고속도로 · 방음벽 · OSM 건물 · 숲 · 버스
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
  await page.waitForTimeout(3500);
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

const hx = -4795.8, hz = -9012.3;
const fx = -0.587, fz = -0.81;

{
  const page = await open(14);
  // 운전자에 가깝게: 1차로 쪽을 보며 노면 글자·차선·분리대가 보이게
  const rx = hx - fx * 14, rz = hz - fz * 14;
  await go(page, rx, rz, lookYaw(rx, rz, hx + fx * 55, hz + fz * 55), 13, 0.10);
  await page.screenshot({ path: path.join(OUT, 'expressbus-cheonggye2-ride.png'), type: 'png' });

  // 건물(동) + 본선 4+4 + 서남 청계산 능선
  const ax = hx + 150, az = hz - 30;
  await go(page, ax, az, lookYaw(ax, az, -5850, -6200), 190, 0.50);
  await page.screenshot({ path: path.join(OUT, 'expressbus-cheonggye2-aerial.png'), type: 'png' });
  await page.close();
}

{
  // 8:06:32 경 — 08:00 출발 버스가 청계산 본선(s≈8188) 근처
  const page = await open(8.109);
  await go(page, hx, hz, lookYaw(hx - fx * 20, hz - fz * 20, hx + fx * 40, hz + fz * 40), 18, 0.16);
  const buses = await findBus(page);
  const near = [...buses].sort((a, b) => Math.hypot(a.x - hx, a.z - hz) - Math.hypot(b.x - hx, b.z - hz))[0];
  const ok = near && Math.hypot(near.x - hx, near.z - hz) < 420;
  console.log('cheonggye buses', buses.length, 'near', ok ? near : null);
  if (ok) {
    const px = near.x - near.fx * 24;
    const pz = near.z - near.fz * 24;
    await go(page, px, pz, lookYaw(px, pz, near.x + near.fx * 20, near.z + near.fz * 20), 18, 0.16);
  }
  await page.screenshot({ path: path.join(OUT, 'expressbus-cheonggye2-bus.png'), type: 'png' });
  await page.close();
}

await browser.close();
console.log('wrote cheonggye2 shots to', OUT);
