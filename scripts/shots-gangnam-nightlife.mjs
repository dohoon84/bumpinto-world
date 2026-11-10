// [gangnam-nightlife] 강남 밤거리 스크린샷. vite preview 가 떠 있어야 한다.
//   BASE=http://127.0.0.1:5221/ OUT=/opt/cursor/artifacts node scripts/shots-gangnam-nightlife.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5221/';
const OUT = process.env.OUT || '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0';

async function open({ w = 1280, h = 800, hour = 21, extra = '' } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${B}?${Q}&hour=${hour}&shot=1${extra}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(1200);
  return page;
}
async function surface(page, x, z, yaw = 0, dist = 22, pitch = 0.38, wait = 9000) {
  await page.evaluate(async ({ x, z, yaw, dist, pitch }) => {
    const J = window.__jj; J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    J.teleport(x, z); J.player.rotation.y = yaw; J.cam.yaw = yaw; J.cam.pitch = pitch; J.cam.dist = dist;
  }, { x, z, yaw, dist, pitch });
  await page.waitForFunction(() => window.__jj?.gangnamStreet?.stats?.loaded, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(wait);
}

function streetInfo() {
  return window.__jj && (() => {
    const J = window.__jj;
    const st = J.gangnamStreet;
    const names = [];
    J.scene?.traverse?.((o) => { if (o.isInstancedMesh && o.name?.startsWith?.('gnStreet')) names.push({ name: o.name, count: o.count }); });
    return { stats: st?.stats || null, meshes: names, visible: !!st?.root?.visible };
  })();
}

// 22012 장대 중앙차로 — 3/4 로 쉘터·횡단·버스전용 차로가 함께 보이게
const STOP34 = { x: -7264.39, z: -14841.41, yaw: -1.958, dist: 10, pitch: 0.32 };
// 쉘터 안을 길게 본다 — 벤치·대기인·백패널·BIS·노란점자블록
const STOPIN = { x: -7255.28, z: -14836.03, yaw: -1.229, dist: 4.2, pitch: 0.12 };
// 강남대로92길 도로 위 (11번출구 동쪽 먹자골목)
const ALLEY = { x: -7087.3, z: -14625.2, yaw: -1.222, dist: 7, pitch: 0.13 };

const night = await open({ hour: 21 });
await surface(night, STOP34.x, STOP34.z, STOP34.yaw, STOP34.dist, STOP34.pitch, 7000);
await night.screenshot({ path: `${OUT}/gnight7-busstop-night.png` });
const nightStop = await night.evaluate(streetInfo);

await surface(night, STOPIN.x, STOPIN.z, STOPIN.yaw, STOPIN.dist, STOPIN.pitch, 4500);
await night.screenshot({ path: `${OUT}/gnight7-busstop-close.png` });
const closeStop = await night.evaluate(streetInfo);

await surface(night, ALLEY.x, ALLEY.z, ALLEY.yaw, ALLEY.dist, ALLEY.pitch, 6000);
await night.screenshot({ path: `${OUT}/gnight7-alley-night.png` });
const alleyNight = await night.evaluate(streetInfo);
await night.close();

const day = await open({ hour: 14 });
await surface(day, ALLEY.x, ALLEY.z, ALLEY.yaw, ALLEY.dist, ALLEY.pitch, 6000);
await day.screenshot({ path: `${OUT}/gnight7-alley-day.png` });
const alleyDay = await day.evaluate(streetInfo);
await day.close();
await browser.close();
console.log(JSON.stringify({ out: OUT, nightStop, closeStop, alleyNight, alleyDay }, null, 2));
