// [gyeongbu-bus] 코너맵에 경부 본선·청계산로가 보이는지 재촬영.
//   BASE=http://127.0.0.1:5197/ OUT=artifacts/gyeongbu-ride node scripts/shots-gyeongbu-minimap.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5197/';
const OUT = process.env.OUT || path.resolve('artifacts/gyeongbu-ride');
fs.mkdirSync(OUT, { recursive: true });
const Q = 'lang=ko&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&roadbike=0&superbike=0&pangyonpc=0&gangnamnpc=0&bp24game=0&controlscard=0';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${B}?${Q}&hour=21&enter=1&shot=1`, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForTimeout(400);
await page.evaluate(() => document.getElementById('lobby-go')?.click());
await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(1500);

async function go(x, z, yaw, dist, pitch, { bike = false } = {}) {
  await page.evaluate(async ({ x, z, yaw, dist, pitch, bike }) => {
    const J = window.__jj;
    J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    J.teleport(x, z);
    if (bike) {
      if (!J.bike.summoned) J.bike.summon();
      const b = J.bike.bike;
      b.x = x; b.z = z; b.h = yaw; b.v = 0; b.yaw = 0; b.si = 0;
      if (!J.bike.riding) J.bike.mount();
      b.x = x; b.z = z; b.h = yaw;
      J.player.position.set(x, b.y, z);
      J.player.rotation.y = yaw;
      J.bike.holdCam(90);
    } else if (J.bike?.riding) J.bike.dismount();
    J.cam.yaw = yaw + Math.PI;
    J.cam.pitch = pitch;
    J.cam.dist = dist;
  }, { x, z, yaw, dist, pitch, bike });
  await page.waitForTimeout(2500);
}

async function mapInfo() {
  return page.evaluate(() => {
    const J = window.__jj;
    const x = J.player.position.x, z = J.player.position.z;
    const maps = J.corridor?.mapTiles?.() || [];
    const minis = J.corridor?.miniTiles?.() || [];
    const nearMap = maps.filter((t) => t.b && x > t.b.x0 - 20 && x < t.b.x1 + 20 && z > t.b.z0 - 20 && z < t.b.z1 + 20);
    const nearMini = minis.filter((t) => x >= t.x0 - 20 && x <= t.x0 + t.size + 20 && z >= t.z0 - 20 && z <= t.z0 + t.size + 20);
    const roads = nearMini.flatMap((t) => (t.data.roads || []).map((r) => ({ k: r.k, name: r.name || '', w: r.w, n: r.p?.length })));
    return {
      x, z,
      phone: !document.body.classList.contains('h3-mm-on'),
      mapTiles: maps.length,
      miniTiles: minis.length,
      nearMaps: nearMap.length,
      nearRoads: roads,
    };
  });
}

const shots = [
  { file: 'gyeongbu-ride-out-s08000.png', x: -4686.27, z: -8858.57, yaw: Math.atan2(-4686.27 - (-4550), -8858.57 - (-8700)), dist: 16, pitch: 0.22, bike: true },
  { file: 'gyeongbu-walk-cheonggye-exit1-50m.png', x: -4772.49, z: -9087.97, yaw: 0.377, dist: 16, pitch: 0.16, bike: false },
  { file: 'gyeongbu-ride-oldwall-12072-양재IC부근.png', x: -7044.11, z: -12165.71, yaw: Math.atan2(-7044.11 - (-7100), -12165.71 - (-12300)), dist: 16, pitch: 0.22, bike: true },
];

const report = [];
for (const s of shots) {
  await go(s.x, s.z, s.yaw, s.dist, s.pitch, { bike: s.bike });
  const info = await mapInfo();
  await page.screenshot({ path: path.join(OUT, s.file), type: 'png' });
  report.push({ file: s.file, ...info });
  console.log('shot', s.file, JSON.stringify(info));
}
fs.writeFileSync(path.join(OUT, 'gyeongbu-minimap-retake.json'), JSON.stringify({ report, errs }, null, 2));
const bad = report.filter((r) => r.nearMaps < 1 || !r.nearRoads.length);
await browser.close();
if (bad.length) {
  console.error('FAIL blank minimap', JSON.stringify(bad, null, 2));
  process.exit(1);
}
console.log('PASS minimap roads present', OUT);
