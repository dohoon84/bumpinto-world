// [namsan] 산자락·순환로·산책로·타워 입구 확인 샷.
//   BASE=http://127.0.0.1:5179/ OUT=/workspace/bw-ntower/artifacts/namsan-roads node scripts/shots-namsan-roads.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5179/';
const OUT = process.env.OUT || '/workspace/bw-ntower/artifacts/namsan-roads';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errs = [];
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&cityhall=0&pangyo=0&migeum=0&controlscard=0&at=ntower';

async function open(tag, { hour = 21, extra = '' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => { errs.push(`${tag}: ${e.message}`); console.error('pageerror', tag, e.message); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', tag, m.text()); });
  await page.goto(`${B}?${Q}&hour=${hour}&evening=1&shot=1${extra}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready && window.__jj?.namsan, null, { timeout: 240000 });
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    document.getElementById('stop-panel')?.classList.remove('open');
    document.getElementById('corridor-stop-panel')?.classList.remove('open');
  });
  return page;
}

async function go(page, { x, z, y, yaw = 0, dist = 22, pitch = 0.28, fov = 55, hidePlayer = false }) {
  await page.evaluate((o) => {
    const J = window.__jj;
    J.setMode('follow');
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
      J.camera.fov = o.fov;
      J.camera.updateProjectionMatrix?.();
    }
    document.getElementById('stop-panel')?.classList.remove('open');
    document.getElementById('corridor-stop-panel')?.classList.remove('open');
    document.querySelectorAll('.tag, .emote-floater').forEach((el) => { el.style.display = 'none'; el.hidden = true; });
    const hint = document.getElementById('namsan-cable-hint');
    if (hint) hint.style.display = 'none';
  }, { x, z, y, yaw, dist, pitch, fov, hidePlayer });
  await page.waitForTimeout(2000);
}

const look = (fromX, fromZ, toX, toZ) => Math.atan2(fromX - toX, fromZ - toZ);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 });

const night = await open('night', { hour: 21, extra: '' });
const info = await night.evaluate(() => {
  const n = window.__jj.namsan;
  const door = n.tower?.door;
  const stops = n.roads?.busStops || [];
  const ways = n.roads?.ways || [];
  const loop = ways.filter((w) => w.name === '남산공원길' && (w.pts?.length || 0) > 20);
  const trail = ways.find((w) => w.k === 'steps' && (w.name || '').includes('북측'))
    || ways.find((w) => w.k === 'steps')
    || ways.find((w) => w.k === 'path');
  const nearTower = (pts) => {
    let best = pts[0], bd = Infinity;
    for (const p of pts) {
      const d = Math.hypot(p[0] - n.tower.ox, p[1] - n.tower.oz);
      if (d < bd && d > 70) { bd = d; best = p; }
    }
    return best;
  };
  const roadWay = loop.sort((a, b) => (b.pts?.length || 0) - (a.pts?.length || 0))[0];
  const roadPt = roadWay ? nearTower(roadWay.pts) : null;
  const trailPt = trail?.pts ? nearTower(trail.pts) : null;
  const roadLook = roadWay && roadPt ? roadWay.pts[Math.min(roadWay.pts.length - 1, roadWay.pts.findIndex((p) => p[0] === roadPt[0] && p[1] === roadPt[1]) + 8)] || roadPt : null;
  return {
    tx: n.tower.ox, tz: n.tower.oz, baseY: n.baseY,
    door, stops,
    roadPt, trailPt, roadLook,
    nWays: ways.length,
    edgeY: n.heightAt(n.bounds.x0 + 20, n.bounds.z0 + 20),
  };
});
console.log('info', JSON.stringify(info, null, 2));
if (!info?.tx) {
  console.error('namsan not mounted');
  await browser.close();
  process.exit(1);
}

const hAt = (x, z) => night.evaluate(({ x, z }) => window.__jj.namsan.heightAt(x, z), { x, z });

// (a) distant night from 회현/명동 (NNW), high enough to clear downtown roofs
{
  const ang = 25 * Math.PI / 180;
  const d = 900;
  const x = info.tx - Math.sin(ang) * d;
  const z = info.tz - Math.cos(ang) * d;
  const gy = await hAt(x, z);
  await go(night, {
    x, z, y: gy + 85,
    yaw: look(x, z, info.tx, info.tz),
    dist: 14, pitch: -0.1, fov: 48, hidePlayer: true,
  });
  await shot(night, 'after-mountain-grounded');
  console.log('wrote after-mountain-grounded gy', gy);
}
{
  const ang = 38 * Math.PI / 180;
  const d = 1450;
  const x = info.tx - Math.sin(ang) * d;
  const z = info.tz - Math.cos(ang) * d;
  const gy = await hAt(x, z);
  await go(night, {
    x, z, y: Math.max(gy + 160, 140),
    yaw: look(x, z, info.tx, info.tz),
    dist: 18, pitch: -0.14, fov: 46, hidePlayer: true,
  });
  await shot(night, 'after-mountain-grounded-wide');
  console.log('wrote after-mountain-grounded-wide gy', gy);
}

// (b) bus road + nearby trail on the mountain (not past the DEM edge)
if (info.roadPt) {
  const [rx, rz] = info.roadPt;
  const y = await hAt(rx, rz);
  const lx = info.roadLook ? info.roadLook[0] : info.tx;
  const lz = info.roadLook ? info.roadLook[1] : info.tz;
  await go(night, {
    x: rx, z: rz, y: y + 1.5,
    yaw: look(rx, rz, lx, lz),
    dist: 11, pitch: -0.18, fov: 58, hidePlayer: false,
  });
  await shot(night, 'after-bus-road-close');
  console.log('wrote after-bus-road-close at', rx, rz, y);
}
if (info.trailPt) {
  const [rx, rz] = info.trailPt;
  const y = await hAt(rx, rz);
  await go(night, {
    x: rx, z: rz, y: y + 1.4,
    yaw: look(rx, rz, info.tx, info.tz),
    dist: 10, pitch: -0.2, fov: 58, hidePlayer: false,
  });
  await shot(night, 'after-trail-night');
  console.log('wrote after-trail-night at', rx, rz, y);
}
if (info.roadPt && info.trailPt) {
  const [rx, rz] = info.roadPt;
  const y = await hAt(rx, rz);
  await go(night, {
    x: rx, z: rz, y: y + 2.2,
    yaw: look(rx, rz, info.trailPt[0], info.trailPt[1]),
    dist: 16, pitch: -0.22, fov: 55, hidePlayer: true,
  });
  await shot(night, 'after-road-trail-night');
  console.log('wrote after-road-trail-night');
}

// (c) top bus stop
if (info.stops?.[0]) {
  const s = info.stops[0];
  const y = await hAt(s.x, s.z);
  const cx = s.x + 14, cz = s.z - 10;
  await go(night, {
    x: cx, z: cz, y: y + 3.2,
    yaw: look(cx, cz, s.x, s.z),
    dist: 7, pitch: -0.12, fov: 55, hidePlayer: true,
  });
  await shot(night, 'after-bus-stop');
  console.log('wrote after-bus-stop', s.x, s.z, y);
}

// (d) entrance with sign and guide arrows
if (info.door) {
  const d = info.door;
  const sx = d.x + (d.nx || 1) * 9.5;
  const sz = d.z + (d.nz || 0) * 9.5;
  await go(night, {
    x: sx, z: sz, y: info.baseY + 1.55,
    yaw: look(sx, sz, d.x, d.z),
    dist: 5.6, pitch: 0.08, fov: 52, hidePlayer: true,
  });
  await shot(night, 'after-entrance');
  console.log('wrote after-entrance');
}

await browser.close();
if (errs.length) {
  console.error('page errors', errs);
  process.exit(1);
}
console.log('shots ok', OUT);
