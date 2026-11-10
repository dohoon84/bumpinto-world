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
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&cityhall=0&pangyo=0&migeum=0&controlscard=0&at=ntower';

async function open(tag, { hour = 14, extra = '' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => { errs.push(`${tag}: ${e.message}`); console.error('pageerror', tag, e.message); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', tag, m.text()); });
  const q = `?${Q}&hour=${hour}&shot=1${extra}`;
  await page.goto(B + q, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready && window.__jj?.namsan, null, { timeout: 240000 });
  await page.waitForTimeout(1600);
  await page.evaluate(() => {
    document.getElementById('stop-panel')?.classList.remove('open');
    document.getElementById('corridor-stop-panel')?.classList.remove('open');
  });
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
      tipY: n.tower.tipY,
      floors: n.interior.floors,
      upper: cab?.pts?.[0] || null,
      lower: cab?.pts?.[cab.pts.length - 1] || null,
      nCity: n.city ? true : false,
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
    document.getElementById('stop-panel')?.classList.remove('open');
    document.getElementById('corridor-stop-panel')?.classList.remove('open');
  }, { x, z, y, yaw, dist, pitch, stage });
  await page.waitForTimeout(1800);
}

const look = (fromX, fromZ, toX, toZ) => Math.atan2(fromX - toX, fromZ - toZ);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 });

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

// whole tower day from ~600 m — camera high at mid-shaft height so drum+antenna fit
{
  const midY = (I.baseY + I.tipY) * 0.5;
  const cx = I.tx - 390, cz = I.tz + 470;
  await go(day, {
    x: I.tx + 16, z: I.tz + 16, y: midY,
    yaw: look(cx, cz, I.tx, I.tz), dist: 610, pitch: 0.04,
  });
  await shot(day, 'ntower-day-far');
}

// day near — entrance plaza ground, looking up the tiered building + shaft + drum
{
  const x = I.tx + 50, z = I.tz + 12;
  await go(day, { x, z, y: I.baseY + 0.28, yaw: look(x, z, I.tx, I.tz), dist: 28, pitch: -0.2 });
  await shot(day, 'ntower-day-near');
}

// plaza love locks on the east entrance fence (ground)
{
  const x = I.tx + 44.8, z = I.tz + 1.2;
  await go(day, { x, z, y: I.baseY + 0.3, yaw: look(x, z, I.tx + 47.2, I.tz - 8), dist: 5.4, pitch: 0.05 });
  await shot(day, 'ntower-plaza-locks');
}

// observation deck day — north glass, looking toward 명동 / downtown
{
  const x = I.tx + 2.0, z = I.tz - 11.4;
  await go(day, { x, z, y: I.floors.t4 + 0.15, yaw: look(x, z, I.tx + 8, I.tz - 90), dist: 2.15, pitch: 0.0 });
  await shot(day, 'ntower-obs-interior');
}

// 7F restaurant — north window tables looking out at the city
{
  const x = I.tx + 1.6, z = I.tz - 10.2;
  await go(day, { x, z, y: I.floors.t7 + 0.15, yaw: look(x, z, I.tx + 6, I.tz - 80), dist: 2.35, pitch: 0.02 });
  await shot(day, 'ntower-7f-interior');
}

if (I.lower && I.upper) {
  {
    const p = await day.evaluate(() => {
      const c = window.__jj.namsan.cable;
      c.stage(0.42);
      return c.at(0.42);
    });
    const sideL = Math.hypot(-p.tz, p.tx) || 1;
    const sx = (-p.tz / sideL) * 0.5, sz = (p.tx / sideL) * 0.5;
    await go(day, {
      x: p.x + sx, z: p.z + sz, y: p.y - 3.88,
      yaw: look(p.x, p.z, I.tx, I.tz), dist: 1.42, pitch: 0.03, stage: 0.42,
    });
    await shot(day, 'ntower-cable-day-ride');
  }
}

// night whole tower from ~600 m
{
  const midY = (I.baseY + I.tipY) * 0.5;
  const cx = I.tx - 390, cz = I.tz + 470;
  await go(night, {
    x: I.tx + 16, z: I.tz + 16, y: midY,
    yaw: look(cx, cz, I.tx, I.tz), dist: 610, pitch: 0.04,
  });
  await shot(night, 'ntower-night-far');
}

// night near from the entrance plaza, looking up
{
  const x = I.tx + 50, z = I.tz + 12;
  await go(night, { x, z, y: I.baseY + 0.28, yaw: look(x, z, I.tx, I.tz), dist: 28, pitch: -0.2 });
  await shot(night, 'ntower-night-near');
}

// city streets below (명동-ish primary ~1.1 km NNW), looking up at the lit tower
{
  const x = -11053.48, z = -21465.73;
  const y = await hAt(night, x, z);
  await go(night, { x, z, y: y + 0.35, yaw: look(x, z, I.tx, I.tz), dist: 11, pitch: -0.3 });
  await shot(night, 'ntower-night-street');
}

// observation deck night looking north over the lit city
{
  const x = I.tx + 2.0, z = I.tz - 11.4;
  await go(night, { x, z, y: I.floors.t4 + 0.15, yaw: look(x, z, I.tx + 8, I.tz - 90), dist: 2.15, pitch: 0.0 });
  await shot(night, 'ntower-obs-interior-night');
}

if (I.lower && I.upper) {
  {
    const p = await night.evaluate(() => {
      const c = window.__jj.namsan.cable;
      c.stage(0.34);
      return c.at(0.34);
    });
    const sideL = Math.hypot(-p.tz, p.tx) || 1;
    const sx = (-p.tz / sideL) * 0.5, sz = (p.tx / sideL) * 0.5;
    await go(night, {
      x: p.x + sx, z: p.z + sz, y: p.y - 3.88,
      yaw: look(p.x, p.z, I.tx, I.tz), dist: 1.42, pitch: 0.04, stage: 0.34,
    });
    await shot(night, 'ntower-cable-night-ride');
  }
  {
    const p = await night.evaluate(() => {
      const c = window.__jj.namsan.cable;
      c.stage(0.2);
      return c.at(0.2);
    });
    const toA = Math.atan2(I.tx - p.x, I.tz - p.z);
    const lx = Math.sin(toA), lz = Math.cos(toA);
    const px = -lz, pz = lx;
    const x = p.x - lx * 11 + px * 7;
    const z = p.z - lz * 11 + pz * 7;
    await go(night, {
      x, z, y: p.y - 0.4,
      yaw: look(x, z, I.tx, I.tz),
      dist: 13, pitch: 0.06, stage: 0.2,
    });
    await shot(night, 'ntower-cabin-night');
  }
}

console.log('errors', errs);
await browser.close();
if (errs.length) process.exitCode = 2;
