// 버스전용 노면 글자 방향 확인. BASE=http://127.0.0.1:5195/ OUT=artifacts node scripts/shots-buslane-text.mjs
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

async function open(pageHour = 8) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${B}?${Q}&hour=${pageHour}&enter=1&shot=1`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1000);
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
  await page.waitForTimeout(2800);
}

async function findDecals(page) {
  return page.evaluate(() => {
    const hits = [];
    const root = window.__jj.corridor?.root;
    if (!root) return hits;
    root.traverse((o) => {
      if (!o.isMesh || o.geometry?.type !== 'PlaneGeometry') return;
      const w = o.geometry.parameters?.width;
      const h = o.geometry.parameters?.height;
      if (Math.abs((w || 0) - 2.15) > 0.15 || Math.abs((h || 0) - 9.2) > 0.15) return;
      o.updateWorldMatrix(true, false);
      const e = o.matrixWorld.elements;
      hits.push({ x: e[12], z: e[14], fx: e[4], fy: e[5], fz: e[6], nx: e[8], ny: e[9], nz: e[10] });
    });
    return hits;
  });
}

const page = await open(8);
await go(page, -4058, -8074, 0.4, 40, 0.5);
let decals = await findDecals(page);
if (!decals.length) {
  await go(page, -3000, -6700, 0.4, 40, 0.5);
  decals = await findDecals(page);
}
console.log('decals', decals.length, decals[0] || null);
fs.writeFileSync(path.join(OUT, 'expressbus-decals.json'), JSON.stringify({ count: decals.length, sample: decals.slice(0, 5) }, null, 2));

if (!decals.length) {
  console.error('no decals found');
  await browser.close();
  process.exit(1);
}

// 버스 근처 글자를 고른다
const buses = await page.evaluate(() => {
  const hits = [];
  const root = window.__jj.corridor?.root;
  if (!root) return hits;
  root.traverse((o) => {
    if (!o.isInstancedMesh || !String(o.name || '').startsWith('gyeongbuExpressBuses')) return;
    const arr = o.instanceMatrix.array;
    for (let i = 0; i < o.count; i++) {
      const b = i * 16;
      if (Math.hypot(arr[b], arr[b + 1], arr[b + 2]) < 0.5) continue;
      hits.push({ x: arr[b + 12], z: arr[b + 14], fx: arr[b + 8], fz: arr[b + 10] });
    }
  });
  return hits;
});
const origin = buses[0] || { x: -4202, z: -8038 };
decals.sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z));
const d = decals[0];
console.log('using decal', d, 'near', origin);

// 위에서: 진행 방향이 화면 위, 글자가 화면 가운데
const topX = d.x - d.fx * 4;
const topZ = d.z - d.fz * 4;
await go(page, topX, topZ, lookYaw(topX, topZ, d.x + d.fx, d.z + d.fz), 22, 1.22);
await page.screenshot({ path: path.join(OUT, 'expressbus-buslane2.png'), type: 'png' });

// 운전자: 글자 뒤에서 진행 방향을 보며 노면을 내려다봄
const drX = d.x - d.fx * 15;
const drZ = d.z - d.fz * 15;
await go(page, drX, drZ, lookYaw(drX, drZ, d.x + d.fx * 8, d.z + d.fz * 8), 10, 0.38);
await page.screenshot({ path: path.join(OUT, 'expressbus-buslane-driver.png'), type: 'png' });

await browser.close();
console.log('wrote buslane text shots to', OUT);
