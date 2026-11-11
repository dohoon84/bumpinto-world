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

async function setCam(page, { yaw = 0, dist = 8, pitch = 0.12, fov = 54 } = {}) {
  await page.evaluate((o) => {
    const J = window.__jj;
    J.setMode('follow');
    J.cam.distMin = 0.5;
    J.cam.distMax = 2500;
    J.cam.yaw = o.yaw;
    J.cam.pitch = o.pitch;
    J.cam.dist = o.dist;
    if (J.camera) {
      J.camera.fov = o.fov;
      J.camera.updateProjectionMatrix?.();
    }
  }, { yaw, dist, pitch, fov });
}

async function mountRide(page, { x, z, y, heading }) {
  return page.evaluate((o) => {
    const J = window.__jj;
    const bikes = J.bikes;
    if (!bikes?._proto || !J.player) return { ok: false, reason: 'no-bike-proto' };
    if (bikes.riding) J.toggleRide();
    const scene = J.player.parent;
    if (!scene) return { ok: false, reason: 'no-scene' };
    const mesh = bikes._proto.clone(true);
    mesh.position.set(o.x, o.y, o.z);
    mesh.rotation.y = o.heading;
    scene.add(mesh);
    const b = {
      mesh, x: o.x, z: o.z, y: o.y, ry: o.heading,
      wheelF: mesh.getObjectByName('wheelF'),
      wheelR: mesh.getObjectByName('wheelR'),
      crank: mesh.getObjectByName('crank'),
      stand: mesh.getObjectByName('stand'),
      lampF: mesh.getObjectByName('lampF'),
      lampR: mesh.getObjectByName('lampR'),
    };
    bikes.list.push(b);
    J.player.position.set(o.x, o.y + 0.05, o.z);
    J.player.rotation.y = o.heading;
    J.toggleRide();
    if (!bikes.riding) bikes.mount(b);
    bikes.speed = 3.4;
    const r = bikes.riding;
    return {
      ok: !!r,
      x: r?.x, z: r?.z, y: r?.y, ry: r?.ry,
      standHidden: r?.stand ? r.stand.visible === false : null,
    };
  }, { x, z, y, heading });
}

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
  const stop = stops[0];
  let roadPt = null, roadLook = null;
  if (roadWay?.pts && stop) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < roadWay.pts.length; i++) {
      const d = Math.hypot(roadWay.pts[i][0] - stop.x, roadWay.pts[i][1] - stop.z);
      if (d < bd) { bd = d; bi = i; }
    }
    const side = Math.min(roadWay.pts.length - 1, bi + 6);
    roadPt = roadWay.pts[side];
    roadLook = roadWay.pts[Math.min(roadWay.pts.length - 1, side + 12)] || roadPt;
  } else if (roadWay) {
    roadPt = nearTower(roadWay.pts);
    roadLook = roadPt;
  }
  const trailPt = trail?.pts ? nearTower(trail.pts) : null;
  const farEnd = (nameRe) => {
    const group = ways.filter((w) => nameRe.test(w.name || '') && w.pts?.length);
    let best = null, bd = -1;
    for (const w of group) {
      for (const p of w.pts) {
        const d = Math.hypot(p[0] - n.tower.ox, p[1] - n.tower.oz);
        if (d > bd) { bd = d; best = { x: p[0], z: p[1], d, name: w.name, k: w.k }; }
      }
    }
    return best;
  };
  const midOf = (nameRe) => {
    const w = ways.find((w) => nameRe.test(w.name || '') && (w.pts?.length || 0) >= 2);
    if (!w) return null;
    const p = w.pts[Math.floor(w.pts.length / 2)];
    return { x: p[0], z: p[1], name: w.name, k: w.k };
  };
  const drive = ways.find((w) => w.service === 'driveway' && w.pts?.length);
  const drivePt = drive ? { x: drive.pts[0][0], z: drive.pts[0][1], x2: drive.pts[drive.pts.length - 1][0], z2: drive.pts[drive.pts.length - 1][1] } : null;
  return {
    tx: n.tower.ox, tz: n.tower.oz, baseY: n.baseY,
    door, stops,
    roadPt, trailPt, roadLook,
    placedStops: n.roads?.placedStops || [],
    nWays: ways.length,
    edgeY: n.heightAt(n.bounds.x0 + 20, n.bounds.z0 + 20),
    route955: farEnd(/955계단/),
    routeSky: farEnd(/남산하늘숲길/),
    routeEast: farEnd(/남산남측순환로|남산북측순환로/),
    routeOrmi: midOf(/남산오르미/),
    midTrail: midOf(/955계단/),
    drivePt,
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
  await shot(night, 'after-mountain-grounded-v3');
  console.log('wrote after-mountain-grounded-v3 gy', gy);
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
  await shot(night, 'after-mountain-grounded-wide-v3');
  console.log('wrote after-mountain-grounded-wide-v3 gy', gy);
}

// (b) bus road + nearby trail on the mountain (not past the DEM edge)
if (info.roadPt) {
  const [rx, rz] = info.roadPt;
  const y = await hAt(rx, rz);
  const lx = info.roadLook ? info.roadLook[0] : info.tx;
  const lz = info.roadLook ? info.roadLook[1] : info.tz;
  const L = Math.hypot(lx - rx, lz - rz) || 1;
  const hx = (lx - rx) / L, hz = (lz - rz) / L;
  // 도로 위에 서서 가까운 전방을 본다. 타워 전경이 아니라 아스팔트·차선·연석이 주인공.
  const cx = rx - hx * 1.2;
  const cz = rz - hz * 1.2;
  const lx2 = rx + hx * 14;
  const lz2 = rz + hz * 14;
  const cy = await hAt(cx, cz);
  await go(night, {
    x: cx, z: cz, y: Math.max(y, cy) + 1.55,
    yaw: look(cx, cz, lx2, lz2),
    dist: 3.4, pitch: -0.14, fov: 52, hidePlayer: true,
  });
  await shot(night, 'after-bus-road-close-v3');
  console.log('wrote after-bus-road-close-v3 at', rx, rz, y, 'cam', cx, cz);
}
if (info.trailPt) {
  const [rx, rz] = info.trailPt;
  const y = await hAt(rx, rz);
  await go(night, {
    x: rx, z: rz, y: y + 1.4,
    yaw: look(rx, rz, info.tx, info.tz),
    dist: 10, pitch: -0.2, fov: 58, hidePlayer: false,
  });
  await shot(night, 'after-trail-night-v3');
  console.log('wrote after-trail-night-v3 at', rx, rz, y);
}
if (info.roadPt && info.trailPt) {
  const [rx, rz] = info.roadPt;
  const y = await hAt(rx, rz);
  await go(night, {
    x: rx, z: rz, y: y + 2.2,
    yaw: look(rx, rz, info.trailPt[0], info.trailPt[1]),
    dist: 16, pitch: -0.22, fov: 55, hidePlayer: true,
  });
  await shot(night, 'after-road-trail-night-v3');
  console.log('wrote after-road-trail-night-v3');
}

// (c) top bus stop
if (info.stops?.[0]) {
  const s = info.placedStops?.[0] || info.stops[0];
  const y = s.y ?? await hAt(s.x, s.z);
  const nrmx = s.nrmx ?? 0, nrmz = s.nrmz ?? -1;
  const hx = s.hx ?? 1, hz = s.hz ?? 0;
  // 도로 쪽에서 살짝 옆으로 봐 지붕·벤치·01A 판과 성벽이 함께 보이게
  const cx = s.x - nrmx * 8.5 + hx * 5.5;
  const cz = s.z - nrmz * 8.5 + hz * 5.5;
  await go(night, {
    x: cx, z: cz, y: y + 1.7,
    yaw: look(cx, cz, s.x, s.z),
    dist: 6.2, pitch: -0.08, fov: 52, hidePlayer: true,
  });
  await shot(night, 'after-bus-stop-v3');
  console.log('wrote after-bus-stop-v3', s.x, s.z, y);
}

// (d) entrance with sign and guide arrows
if (info.door) {
  const d = info.door;
  const sx = d.x + (d.nx || 1) * 13;
  const sz = d.z + (d.nz || 0) * 13;
  await go(night, {
    x: sx, z: sz, y: info.baseY + 1.55,
    yaw: look(sx, sz, d.x, d.z),
    dist: 7.0, pitch: 0.22, fov: 52, hidePlayer: true,
  });
  await shot(night, 'after-entrance-v3');
  console.log('wrote after-entrance-v3');
}

// ----- v5 self-check: plaza 4 ways, entrance, bike, route starts, mid-trail, 도훈 angles -----
const plazaY = info.baseY;
const dirs = [
  ['plaza-north-v5', 0, -95],
  ['plaza-east-v5', 78, 8],
  ['plaza-south-v5', 0, 95],
  ['plaza-west-v5', -85, 0],
];
for (const [name, dx, dz] of dirs) {
  const x = info.tx + dx, z = info.tz + dz;
  const y = await hAt(x, z);
  await go(night, {
    x, z, y: y + 2.4,
    yaw: look(x, z, info.tx, info.tz),
    dist: 16, pitch: 0.06, fov: 50, hidePlayer: true,
  });
  await shot(night, name);
  console.log('wrote', name, 'y', y);
}

if (info.door) {
  const d = info.door;
  const sx = d.x + (d.nx || 1) * 14;
  const sz = d.z + (d.nz || 0) * 14;
  await go(night, {
    x: sx, z: sz, y: plazaY + 1.55,
    yaw: look(sx, sz, d.x, d.z),
    dist: 8.0, pitch: 0.08, fov: 52, hidePlayer: true,
  });
  await shot(night, 'after-entrance-v5');
  console.log('wrote after-entrance-v5');
}

// bike-style third person on summit loop road
if (info.roadPt) {
  const [rx, rz] = info.roadPt;
  const y = await hAt(rx, rz);
  const lx = info.roadLook ? info.roadLook[0] : info.tx;
  const lz = info.roadLook ? info.roadLook[1] : info.tz;
  await go(night, {
    x: rx, z: rz, y: y + 0.2,
    yaw: look(rx, rz, lx, lz),
    dist: 4.2, pitch: 0.08, fov: 55, hidePlayer: false,
  });
  await shot(night, 'bike-summit-road-v5');
  console.log('wrote bike-summit-road-v5', rx, rz, y);
}

async function routeShot(tag, pt, lookX, lookZ) {
  if (!pt) { console.log('skip', tag); return; }
  const y = await hAt(pt.x, pt.z);
  await go(night, {
    x: pt.x, z: pt.z, y: y + 1.5,
    yaw: look(pt.x, pt.z, lookX, lookZ),
    dist: 8, pitch: 0.08, fov: 55, hidePlayer: false,
  });
  await shot(night, tag);
  console.log('wrote', tag, pt, 'y', y);
}
await routeShot('route-955-start-v5', info.route955, info.tx, info.tz);
await routeShot('route-library-start-v5', info.routeSky, info.tx, info.tz);
await routeShot('route-east-start-v5', info.routeEast, info.tx, info.tz);
await routeShot('route-ormi-v5', info.routeOrmi, info.tx, info.tz);
await routeShot('mid-trail-night-v5', info.midTrail, info.tx, info.tz);

// 도훈's plaza angles
if (info.door) {
  const d = info.door;
  const sx = d.x + (d.nx || 1) * 18;
  const sz = d.z + (d.nz || 0) * 2 + 8;
  await go(night, {
    x: sx, z: sz, y: plazaY + 1.6,
    yaw: look(sx, sz, d.x, d.z),
    dist: 10, pitch: 0.10, fov: 55, hidePlayer: true,
  });
  await shot(night, 'user4-plaza-v5');
  const sx2 = d.x + (d.nx || 1) * 22;
  const sz2 = d.z - 18;
  const y2 = await hAt(sx2, sz2);
  await go(night, {
    x: sx2, z: sz2, y: Math.max(y2, plazaY) + 1.7,
    yaw: look(sx2, sz2, info.tx, info.tz),
    dist: 16, pitch: 0.10, fov: 52, hidePlayer: true,
  });
  await shot(night, 'user4-plaza-wide-v5');
  console.log('wrote user4 plaza angles');
  await go(night, {
    x: sx, z: sz, y: plazaY + 1.6,
    yaw: look(sx, sz, d.x, d.z),
    dist: 10, pitch: 0.10, fov: 55, hidePlayer: true,
  });
  await shot(night, 'user4-plaza-v6');
  const xE = info.tx + 78, zE = info.tz + 8;
  const yE = await hAt(xE, zE);
  await go(night, {
    x: xE, z: zE, y: yE + 2.4,
    yaw: look(xE, zE, info.tx, info.tz),
    dist: 16, pitch: 0.06, fov: 50, hidePlayer: true,
  });
  await shot(night, 'plaza-east-v6');
  console.log('wrote plaza v6 label-check shots');
}
if (info.roadPt) {
  const [rx, rz] = info.roadPt;
  const y = await hAt(rx, rz);
  const lx = info.roadLook ? info.roadLook[0] : info.tx;
  const lz = info.roadLook ? info.roadLook[1] : info.tz;
  await go(night, {
    x: rx, z: rz, y: y + 0.15,
    yaw: look(rx, rz, lx, lz),
    dist: 3.6, pitch: 0.12, fov: 58, hidePlayer: false,
  });
  await shot(night, 'user4-bike-v5');
  console.log('wrote user4-bike-v5');
}
if (info.drivePt) {
  const p = info.drivePt;
  const y = await hAt(p.x, p.z);
  await go(night, {
    x: p.x, z: p.z, y: y + 1.5,
    yaw: look(p.x, p.z, p.x2, p.z2),
    dist: 6, pitch: 0.08, fov: 55, hidePlayer: false,
  });
  await shot(night, 'user4-ribbon-v5');
  console.log('wrote user4-ribbon-v5');
}

// day plaza check: no flat black leftover in sunlight either
{
  const day = await open('day', { hour: 14, extra: '' });
  if (info.door) {
    const d = info.door;
    const sx = d.x + (d.nx || 1) * 18;
    const sz = d.z + (d.nz || 0) * 2 + 8;
    await go(day, {
      x: sx, z: sz, y: plazaY + 1.6,
      yaw: look(sx, sz, d.x, d.z),
      dist: 10, pitch: 0.10, fov: 55, hidePlayer: true,
    });
    await shot(day, 'user4-plaza-day-v5');
    const sx2 = d.x + (d.nx || 1) * 14;
    const sz2 = d.z + (d.nz || 0) * 14;
    await go(day, {
      x: sx2, z: sz2, y: plazaY + 1.55,
      yaw: look(sx2, sz2, d.x, d.z),
      dist: 8, pitch: 0.08, fov: 52, hidePlayer: true,
    });
    await shot(day, 'after-entrance-day-v5');
    console.log('wrote day plaza shots');
  }
  await day.close();
}

// 약수터길·공중부양 재촬영 (user9)
{
  const yaksuStart = { x: -9685.2, z: -20372.44 };
  const y0 = await hAt(yaksuStart.x, yaksuStart.z);
  await go(night, {
    x: yaksuStart.x, z: yaksuStart.z, y: y0 + 0.15,
    yaw: look(yaksuStart.x, yaksuStart.z, info.tx, info.tz),
    dist: 9, pitch: 0.12, fov: 52, hidePlayer: false,
  });
  await shot(night, 'yaksu-start');
  const apt = { x: -9971, z: -20942 };
  const ya = await hAt(apt.x, apt.z);
  await go(night, {
    x: apt.x, z: apt.z, y: ya + 0.12,
    yaw: look(apt.x, apt.z, info.tx, info.tz),
    dist: 7, pitch: 0.09, fov: 55, hidePlayer: false,
  });
  await shot(night, 'user9-floating-road-fixed');
  const mid = { x: -10153.58, z: -20030.69 };
  const ym = await hAt(mid.x, mid.z);
  await go(night, {
    x: mid.x, z: mid.z, y: ym + 0.15,
    yaw: look(mid.x, mid.z, info.tx, info.tz),
    dist: 7, pitch: 0.08, fov: 54, hidePlayer: false,
  });
  await shot(night, 'yaksu-mid');
  console.log('wrote yaksu / user9 floating-road-fixed shots');
}

// 약수터길 v2: roadside detail + actually riding a bicycle
{
  const mid = { x: -10153.58, z: -20030.69 };
  const climb = { x: -10011.2, z: -19779.46 };
  const ym = await hAt(mid.x, mid.z);
  const yc = await hAt(climb.x, climb.z);
  const midLook = look(mid.x, mid.z, info.tx, info.tz);
  const climbLook = look(climb.x, climb.z, -10084.64, -19811.55);
  await go(night, {
    x: mid.x, z: mid.z, y: ym + 0.12,
    yaw: midLook, dist: 7, pitch: 0.08, fov: 54, hidePlayer: false,
  });
  const mMid = await mountRide(night, { x: mid.x, z: mid.z, y: ym + 0.02, heading: midLook });
  await setCam(night, { yaw: midLook, dist: 7, pitch: 0.08, fov: 54 });
  await night.waitForTimeout(700);
  await shot(night, 'yaksu-mid-v2');
  await go(night, {
    x: climb.x, z: climb.z, y: yc + 0.12,
    yaw: climbLook, dist: 6.6, pitch: 0.10, fov: 50, hidePlayer: false,
  });
  const mClimb = await mountRide(night, { x: climb.x, z: climb.z, y: yc + 0.02, heading: climbLook });
  await night.evaluate((o) => {
    const J = window.__jj;
    const shuttle = J.namsan?.roads?.group?.getObjectByName?.('namsan-shuttle');
    if (!shuttle) return;
    J.namsan.roads.update = function () {};
    const hx = -Math.sin(o.yaw), hz = -Math.cos(o.yaw);
    const x = o.x + hx * 14, z = o.z + hz * 14;
    shuttle.position.set(x, J.namsan.heightAt(x, z) + 0.03, z);
    shuttle.rotation.y = o.yaw;
    shuttle.visible = true;
  }, { x: climb.x, z: climb.z, yaw: climbLook });
  await setCam(night, { yaw: climbLook + Math.PI * 0.48, dist: 6.4, pitch: 0.10, fov: 50 });
  await night.waitForTimeout(700);
  await shot(night, 'yaksu-climb-bike-v2');
  await setCam(night, { yaw: climbLook, dist: 6.8, pitch: 0.16, fov: 50 });
  await night.waitForTimeout(450);
  await shot(night, 'yaksu-bike-rear-v2');
  await go(night, {
    x: mid.x, z: mid.z, y: ym + 80,
    yaw: midLook, dist: 220, pitch: 0.72, fov: 50, hidePlayer: true,
  });
  await shot(night, 'yaksu-aerial-v2');
  console.log('wrote yaksu-*-v2 shots', JSON.stringify({ mMid, mClimb }));
}

// downward black-pixel survey every 20 m along access routes
{
  const samples = await night.evaluate(() => {
    const ways = window.__jj.namsan.roads?.ways || [];
    const re = /남산공원길|남산남측순환로|남산북측순환로|955계단|남산하늘숲길|한양도성|와룡묘길|남산오르미/;
    const out = [];
    for (const w of ways) {
      if (!re.test(w.name || '') || !w.pts?.length) continue;
      const pts = w.pts;
      out.push({ x: pts[0][0], z: pts[0][1], name: w.name });
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        acc += L;
        if (acc >= 20) {
          out.push({ x: pts[i][0], z: pts[i][1], name: w.name });
          acc = 0;
        }
      }
    }
    return out;
  });
  const tmp = '/tmp/namsan-down';
  fs.mkdirSync(tmp, { recursive: true });
  const py = `import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
crop = im.crop((int(w*0.22), int(h*0.16), int(w*0.78), int(h*0.72)))
pix = list(crop.getdata())
black = sum(1 for r,g,b in pix if r < 12 and g < 12 and b < 12)
print(f"{black} {len(pix)} {black/len(pix):.6f}")
`;
  fs.writeFileSync(`${tmp}/count.py`, py);
  const { execFileSync } = await import('node:child_process');
  const byName = new Map();
  let worst = { ratio: 0 };
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const y = await hAt(s.x, s.z);
    await night.evaluate((o) => {
      const J = window.__jj;
      J.setMode('follow');
      J.teleport(o.x, o.z, o.y);
      if (J.player) { J.player.rotation.y = 0; J.player.position.y = o.y; J.player.visible = false; }
      J.cam.distMin = 0.5; J.cam.distMax = 2500;
      J.cam.yaw = 0; J.cam.pitch = 1.45; J.cam.dist = 6.5;
      if (J.camera) { J.camera.fov = 70; J.camera.updateProjectionMatrix?.(); }
    }, { x: s.x, z: s.z, y: y + 1.4 });
    await night.waitForTimeout(280);
    const fp = `${tmp}/s${i}.png`;
    await night.screenshot({ path: fp, timeout: 60000 });
    const out = execFileSync('python3', [`${tmp}/count.py`, fp], { encoding: 'utf8' }).trim();
    const [black, total, ratioS] = out.split(' ');
    const ratio = Number(ratioS);
    if (!byName.has(s.name)) byName.set(s.name, { n: 0, sum: 0, max: 0 });
    const rec = byName.get(s.name);
    rec.n += 1; rec.sum += ratio; if (ratio > rec.max) rec.max = ratio;
    if (ratio > worst.ratio) worst = { ...s, y, ratio, i };
    if ((i + 1) % 25 === 0) console.log(`black-scan ${i + 1}/${samples.length} worst=${worst.ratio.toFixed(4)}`);
  }
  console.log('BLACK PIXEL SURVEY (downward, 20 m)');
  for (const [name, rec] of byName) {
    console.log(`  ${name}: n=${rec.n} mean=${(rec.sum / rec.n).toFixed(4)} max=${rec.max.toFixed(4)}`);
  }
  console.log('  worst', JSON.stringify(worst));
  fs.writeFileSync(`${OUT}/black-scan-v5.json`, JSON.stringify({
    samples: samples.length, byName: Object.fromEntries(byName), worst,
  }, null, 2));
}

// default entry: no ntower deep-link, console must stay clean
{
  const home = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const homeErrs = [];
  home.on('pageerror', (e) => { homeErrs.push(e.message); errs.push(`default: ${e.message}`); console.error('pageerror default', e.message); });
  home.on('console', (m) => { if (m.type() === 'error') console.error('console default', m.text()); });
  const homeQ = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&controlscard=0';
  await home.goto(`${B}?${homeQ}&hour=21&shot=1`, { timeout: 180000 });
  await home.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await home.waitForTimeout(1500);
  if (homeErrs.length) console.error('default entry errors', homeErrs);
  else console.log('default entry loaded with no pageerrors');
  await home.close();
}

await browser.close();
if (errs.length) {
  console.error('page errors', errs);
  process.exit(1);
}
console.log('shots ok', OUT);
