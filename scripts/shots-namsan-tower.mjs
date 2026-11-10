// [namsan] 남산서울타워·케이블카 스크린샷. vite preview 가 떠 있어야 한다.
//   BASE=http://127.0.0.1:5179/ OUT=/workspace/bw-ntower/artifacts node scripts/shots-namsan-tower.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5179/';
const OUT = process.env.OUT || '/workspace/bw-ntower/artifacts';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errs = [];
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&cityhall=0&pangyo=0&migeum=0&controlscard=0';

async function open(tag, { hour = 14, extra = '' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => { errs.push(`${tag}: ${e.message}`); console.error('pageerror', tag, e.message); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', tag, m.text()); });
  const q = `?${Q}&hour=${hour}&shot=1${extra}`;
  await page.goto(B + q, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready && window.__jj?.namsan, null, { timeout: 240000 });
  await page.waitForTimeout(1200);
  return page;
}

async function info(page) {
  return page.evaluate(() => {
    const n = window.__jj.namsan;
    const cab = n.cable;
    return {
      spawn: n.spawn,
      spawnY: n.spawnY(),
      baseY: n.baseY,
      tx: n.tower.ox,
      tz: n.tower.oz,
      shaftBottom: n.tower.shaftBottom,
      floors: n.interior.floors,
      upper: cab?.pts?.[0] || null,
      lower: cab?.pts?.[cab.pts.length - 1] || null,
    };
  });
}

async function go(page, { x, z, y, yaw = 0, dist = 22, pitch = 0.28, stage = null }) {
  await page.evaluate((o) => {
    const J = window.__jj;
    J.setMode('follow');
    if (o.stage != null && J.namsan?.stage) J.namsan.stage(o.stage);
    J.teleport(o.x, o.z, o.y);
    if (J.player) { J.player.rotation.y = o.yaw; if (o.y != null) J.player.position.y = o.y; }
    J.cam.yaw = o.yaw;
    J.cam.pitch = o.pitch;
    J.cam.dist = o.dist;
  }, { x, z, y, yaw, dist, pitch, stage });
  await page.waitForTimeout(1600);
}

const look = (fromX, fromZ, toX, toZ) => Math.atan2(fromX - toX, fromZ - toZ); // cam.yaw = atan2(-dx,-dz)
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

const day = await open('day', { hour: 14, extra: '&evening=0' });
const night = await open('night', { hour: 21, extra: '&evening=1' });
const I = await info(day);
console.log('namsan info', JSON.stringify(I, null, 2));
if (!I?.tx) {
  console.error('namsan not mounted');
  await browser.close();
  process.exit(1);
}

const hAt = (page, x, z) => page.evaluate(({ x, z }) => window.__jj.namsan.heightAt(x, z), { x, z });

// day far — SE hillside, camera high enough to clear the canopy
{
  const x = I.tx + 52, z = I.tz + 42;
  const y = await hAt(day, x, z);
  await go(day, { x, z, y: y + 0.4, yaw: look(x, z, I.tx, I.tz), dist: 290, pitch: 0.2 });
  await shot(day, 'ntower-day-far');
}
// day near — east plaza approach
{
  const x = I.tx + 36, z = I.tz + 12;
  await go(day, { x, z, y: I.shaftBottom + 0.35, yaw: look(x, z, I.tx, I.tz), dist: 28, pitch: 0.16 });
  await shot(day, 'ntower-day-near');
}
// aerial + terrain — stand near the tower so it stays in frame
{
  const x = I.tx + 30, z = I.tz + 50;
  const y = await hAt(day, x, z);
  await go(day, { x, z, y: y + 6, yaw: look(x, z, I.tx, I.tz), dist: 360, pitch: 0.98 });
  await shot(day, 'ntower-aerial-terrain');
}
// plaza love locks on the east parapet
{
  const x = I.tx + 32, z = I.tz + 10;
  await go(day, { x, z, y: I.shaftBottom + 0.25, yaw: look(x, z, I.tx + 36, I.tz - 8), dist: 5.2, pitch: -0.22 });
  await shot(day, 'ntower-plaza-locks');
}
// observation 4F — look outward through the glass
{
  const x = I.tx + 7.2, z = I.tz + 2.0;
  await go(day, { x, z, y: I.floors.t4 + 0.2, yaw: look(x, z, I.tx + 20, I.tz + 4), dist: 6.4, pitch: 0.02 });
  await shot(day, 'ntower-obs-interior');
}
// 7F restaurant — among the window tables
{
  const x = I.tx + 8.2, z = I.tz + 2.6;
  await go(day, { x, z, y: I.floors.t7 + 0.2, yaw: look(x, z, I.tx + 14, I.tz + 6), dist: 6.8, pitch: 0.04 });
  await shot(day, 'ntower-7f-interior');
}

if (I.lower && I.upper) {
  {
    const ux = Math.sin(Math.atan2(I.upper.x - I.lower.x, I.upper.z - I.lower.z));
    const uz = Math.cos(Math.atan2(I.upper.x - I.lower.x, I.upper.z - I.lower.z));
    const x = I.lower.x - ux * 20 + uz * 10;
    const z = I.lower.z - uz * 20 - ux * 10;
    await go(day, { x, z, y: I.lower.ground + 2.2, yaw: look(x, z, I.lower.x, I.lower.z), dist: 16, pitch: 0.2, stage: 1 });
    await shot(day, 'ntower-cable-lower');
  }
  {
    const ux = Math.sin(Math.atan2(I.lower.x - I.upper.x, I.lower.z - I.upper.z));
    const uz = Math.cos(Math.atan2(I.lower.x - I.upper.x, I.lower.z - I.upper.z));
    const x = I.upper.x + ux * 18 + uz * 8;
    const z = I.upper.z + uz * 18 - ux * 8;
    await go(day, { x, z, y: I.upper.ground + 2.2, yaw: look(x, z, I.upper.x, I.upper.z), dist: 17, pitch: 0.18, stage: 0 });
    await shot(day, 'ntower-cable-upper');
  }
  {
    const p = await day.evaluate(() => {
      const c = window.__jj.namsan.cable;
      c.stage(0.52);
      return c.at(0.52);
    });
    const yaw = look(p.x, p.z, I.tx, I.tz);
    const lx = Math.sin(Math.atan2(I.tx - p.x, I.tz - p.z));
    const lz = Math.cos(Math.atan2(I.tx - p.x, I.tz - p.z));
    await go(day, {
      x: p.x + lx * 0.7, z: p.z + lz * 0.7, y: p.y - 3.48,
      yaw, dist: 1.9, pitch: 0.04, stage: 0.52,
    });
    await shot(day, 'ntower-cable-day-ride');
  }
}

{
  const x = I.tx + 52, z = I.tz + 42;
  const y = await hAt(night, x, z);
  await go(night, { x, z, y: y + 0.4, yaw: look(x, z, I.tx, I.tz), dist: 290, pitch: 0.2 });
  await shot(night, 'ntower-night-far');
}
{
  const x = I.tx + 36, z = I.tz + 12;
  await go(night, { x, z, y: I.shaftBottom + 0.35, yaw: look(x, z, I.tx, I.tz), dist: 28, pitch: 0.16 });
  await shot(night, 'ntower-night-near');
}
if (I.lower && I.upper) {
  {
    const p = await night.evaluate(() => {
      const c = window.__jj.namsan.cable;
      c.stage(0.36);
      return c.at(0.36);
    });
    const yaw = look(p.x, p.z, I.tx, I.tz);
    const lx = Math.sin(Math.atan2(I.tx - p.x, I.tz - p.z));
    const lz = Math.cos(Math.atan2(I.tx - p.x, I.tz - p.z));
    await go(night, {
      x: p.x + lx * 0.7, z: p.z + lz * 0.7, y: p.y - 3.48,
      yaw, dist: 1.9, pitch: 0.06, stage: 0.36,
    });
    await shot(night, 'ntower-cable-night-ride');
  }
  {
    const p = await night.evaluate(() => {
      const c = window.__jj.namsan.cable;
      c.stage(0.18);
      return c.at(0.18);
    });
    const toA = Math.atan2(I.tx - p.x, I.tz - p.z);
    const lx = Math.sin(toA), lz = Math.cos(toA);
    const px = -lz, pz = lx;
    const x = p.x - lx * 12 + px * 9;
    const z = p.z - lz * 12 + pz * 9;
    await go(night, {
      x, z, y: p.y - 1.4,
      yaw: look(x, z, I.tx, I.tz),
      dist: 16, pitch: 0.14, stage: 0.18,
    });
    await shot(night, 'ntower-cabin-night');
  }
}

console.log('errors', errs);
await browser.close();
if (errs.length) process.exitCode = 2;
