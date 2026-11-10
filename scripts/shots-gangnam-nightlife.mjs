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

// 22012 중앙차로 강남역(중) — 섬 옆에서 쉘터·BIS·난간·대기인을 본다
const STOP = { x: -7256.5, z: -14841.0, yaw: -2.40, dist: 7, pitch: 0.20 };
// 강남역 서쪽 이면 — 자전거·배달 스쿠터·키오스크가 모인 인도
const ALLEY = { x: -7176, z: -14540, yaw: 0.05, dist: 8, pitch: 0.12 };

const night = await open({ hour: 21 });
await surface(night, STOP.x, STOP.z, STOP.yaw, STOP.dist, STOP.pitch, 8000);
await night.screenshot({ path: `${OUT}/gnight6-busstop-night.png` });
const nightStop = await night.evaluate(streetInfo);

await surface(night, ALLEY.x, ALLEY.z, ALLEY.yaw, ALLEY.dist, ALLEY.pitch, 6000);
await night.screenshot({ path: `${OUT}/gnight6-alley.png` });
const alley = await night.evaluate(streetInfo);
await night.close();

const day = await open({ hour: 14 });
await surface(day, STOP.x, STOP.z, STOP.yaw, STOP.dist, STOP.pitch, 8000);
await day.screenshot({ path: `${OUT}/gnight6-busstop-day.png` });
const dayStop = await day.evaluate(streetInfo);
await day.close();
await browser.close();
console.log(JSON.stringify({ out: OUT, nightStop, alley, dayStop }, null, 2));
