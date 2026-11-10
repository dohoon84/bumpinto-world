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

async function go(page, { x, z, y, yaw = 0, dist = 22, pitch = 0.28, stage = null, fov = null, hidePlayer = false, view = null }) {
  await page.evaluate((o) => {
    const J = window.__jj;
    J.setMode('follow');
    if (o.stage != null && J.namsan?.stage) J.namsan.stage(o.stage);
    if (o.view && J.namsan?.cable?.setView) J.namsan.cable.setView(o.view);
    J.teleport(o.x, o.z, o.y);
    if (J.player) {
      J.player.rotation.y = o.yaw;
      if (o.y != null) J.player.position.y = o.y;
      J.player.visible = !o.hidePlayer;
    }
    J.cam.distMin = 0.5;
    J.cam.distMax = 2500;
    J.cam.yaw = o.yaw;
    J.cam.pitch = o.pitch;
    J.cam.dist = o.dist;
    if (J.camera) {
      J.camera.fov = o.fov != null ? o.fov : 55;
      J.camera.updateProjectionMatrix?.();
    }
    document.getElementById('stop-panel')?.classList.remove('open');
    document.getElementById('corridor-stop-panel')?.classList.remove('open');
    document.querySelectorAll('.tag, .emote-floater').forEach((el) => { el.style.display = 'none'; el.hidden = true; });
    const hint = document.getElementById('namsan-cable-hint');
    if (hint) hint.style.display = 'none';
  }, { x, z, y, yaw, dist, pitch, stage, fov, hidePlayer, view });
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    document.querySelectorAll('.tag, .emote-floater').forEach((el) => { el.style.display = 'none'; el.hidden = true; });
    const hint = document.getElementById('namsan-cable-hint');
    if (hint) hint.style.display = 'none';
  });
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

// whole tower day from ~900 m NNW, above the downtown rooftops, looking at the tower
{
  const ang = 25 * Math.PI / 180;
  const d = 900;
  const x = I.tx - Math.sin(ang) * d;
  const z = I.tz - Math.cos(ang) * d;
  const gy = await hAt(day, x, z);
  await go(day, {
    x, z, y: gy + 85,
    yaw: look(x, z, I.tx, I.tz),
    dist: 14, pitch: -0.1, fov: 48, hidePlayer: true,
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
      c.stage(0.68);
      c.setView?.('city');
      return c.at(0.68);
    });
    const cityX = I.tx - 980, cityZ = I.tz - 790;
    const yaw = look(p.x, p.z, cityX, cityZ);
    const lx = Math.sin(yaw), lz = Math.cos(yaw);
    await go(day, {
      x: p.x - lx * 0.2, z: p.z - lz * 0.2, y: p.y - 3.88,
      yaw, dist: 0.8, pitch: 0.1, stage: 0.68, view: 'city', hidePlayer: true, fov: 56,
    });
    await shot(day, 'ntower-cable-day-ride');
  }
}

// night whole tower from ~900 m NNW above downtown, city lights in the foreground
{
  const ang = 25 * Math.PI / 180;
  const d = 900;
  const x = I.tx - Math.sin(ang) * d;
  const z = I.tz - Math.cos(ang) * d;
  const gy = await hAt(night, x, z);
  await go(night, {
    x, z, y: gy + 85,
    yaw: look(x, z, I.tx, I.tz),
    dist: 14, pitch: -0.1, fov: 48, hidePlayer: true,
  });
  await shot(night, 'ntower-night-far');
}

// night near: whole tower from just east of the plaza (wide FOV, hover so look-up isn't floor-clamped)
{
  const x = I.tx + 50, z = I.tz + 12;
  await go(night, {
    x, z, y: I.baseY + 42,
    yaw: look(x, z, I.tx, I.tz),
    dist: 58, pitch: -0.5, fov: 74, hidePlayer: true,
  });
  await shot(night, 'ntower-night-near');
}

// city streets below (~1.1 km NNW toward 명동), hover above rooftops so the tower reads
{
  const x = -11820, z = -21360; // 회현·남대문 건물 밀집 — 타워가 스카이라인 위로 읽힘
  const y = await hAt(night, x, z);
  await go(night, {
    x, z, y: y + 48,
    yaw: look(x, z, I.tx, I.tz),
    dist: 16, pitch: -0.08, fov: 46, hidePlayer: true,
  });
  await shot(night, 'ntower-night-street');
}

// hero: rooftop on the 회현·남대문 side (~1.2 km NW), lit buildings in front, whole tower on the summit
{
  const x = -11680, z = -21340;
  const y = await hAt(night, x, z);
  await go(night, {
    x, z, y: y + 118,
    yaw: look(x, z, I.tx, I.tz),
    dist: 14, pitch: -0.06, fov: 40, hidePlayer: true,
  });
  await shot(night, 'ntower-night-hero');
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
      c.stage(0.68);
      c.setView?.('city');
      return c.at(0.68);
    });
    const cityX = I.tx - 980, cityZ = I.tz - 790;
    const yaw = look(p.x, p.z, cityX, cityZ);
    const lx = Math.sin(yaw), lz = Math.cos(yaw);
    await go(night, {
      x: p.x - lx * 0.2, z: p.z - lz * 0.2, y: p.y - 3.88,
      yaw, dist: 0.8, pitch: 0.1, stage: 0.68, view: 'city', hidePlayer: true, fov: 56,
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
    const x = p.x - lx * 18 + px * 10;
    const z = p.z - lz * 18 + pz * 10;
    await go(night, {
      x, z, y: p.y + 6,
      yaw: look(x, z, I.tx, I.tz),
      dist: 16, pitch: -0.28, fov: 62, stage: 0.2, hidePlayer: true,
    });
    await shot(night, 'ntower-cabin-night');
  }
}

console.log('errors', errs);
await browser.close();
if (errs.length) process.exitCode = 2;
