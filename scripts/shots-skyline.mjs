// 스카이라인 OSM(acfe2f1) vs 브이월드. 두 preview.
//   BEFORE=http://127.0.0.1:5210/ AFTER=http://127.0.0.1:5208/ node scripts/shots-skyline.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const BEFORE = process.env.BEFORE || 'http://127.0.0.1:5210/';
const AFTER = process.env.AFTER || 'http://127.0.0.1:5208/';
const OUT = process.env.OUT || '/opt/cursor/artifacts/skyline';
fs.mkdirSync(OUT, { recursive: true });
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&hour=14&shot=1&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&pangyonpc=0&gangnamnight=0&gangnamads=0';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
async function open(base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto(`${base}?${Q}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  return page;
}
async function settle(page, x, z, yaw, dist, pitch, mode = 'follow') {
  await page.evaluate(async ({ x, z, yaw, dist, pitch, mode }) => {
    const J = window.__jj;
    J.setMode(mode);
    if (J.corridor) {
      await J.corridor.preload(x, z, mode === 'overview' ? 1600 : 700);
      const tiles = [...(J.corridor.tiles?.values?.() || [])];
      const pending = () => tiles.some((t) => {
        const d = Math.hypot(Math.max(t.x0 - x, 0, x - t.x0 - 500), Math.max(t.z0 - z, 0, z - t.z0 - 500));
        return d < (mode === 'overview' ? 1400 : 500) && t.dState !== 3 && t.lState !== 3;
      });
      for (let i = 0; i < 40 && pending(); i++) await new Promise((r) => setTimeout(r, 250));
    }
    J.teleport(x, z);
    if (mode === 'overview') { J.ov.yaw = yaw; J.ov.pitch = pitch; J.ov.dist = dist; }
    else { J.player.rotation.y = yaw; J.cam.yaw = yaw; J.cam.pitch = pitch; J.cam.dist = dist; }
  }, { x, z, yaw, dist, pitch, mode });
  await page.waitForTimeout(1800);
}
const before = await open(BEFORE);
const after = await open(AFTER);
// 따라보기 붐은 빌드마다 길이가 달라진다. 높이 비교는 조감(같은 수식)으로 맞춘다.
// 교보 일대: 13m → 39m 로 가장 또렷이 오른 강남대로 건물. 아파트: 기본 48.6m → 실측.
const shots = [
  ['gyobo', -7332, -15136, 0.9, 70, 0.38, 'overview'],
  ['apt', -6516, -14505, 0.15, 78, 0.34, 'overview'],
  ['aerial', -6750, -14750, 0.45, 1600, 0.78, 'overview'],
];
for (const [name, x, z, yaw0, dist, pitch, mode] of shots) {
  const yaw = await after.evaluate(async ({ x, z, yaw0, pitch, dist, mode }) => {
    const J = window.__jj;
    if (J.corridor) await J.corridor.preload(x, z, mode === 'overview' ? 1600 : 700);
    if (mode !== 'overview' || !J.corridor?.roofAt) return yaw0;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    for (let k = 0; k < 12; k++) {
      const y = yaw0 + k * (Math.PI / 6);
      const cx = x + Math.sin(y) * cp * dist, cz = z + Math.cos(y) * cp * dist;
      if (J.corridor.roofAt(cx, cz) < sp * dist - 4) return y;
    }
    return yaw0;
  }, { x, z, yaw0, pitch, dist, mode });
  await settle(before, x, z, yaw, dist, pitch, mode);
  await before.screenshot({ path: `${OUT}/_${name}-before.png`, timeout: 90000 });
  await settle(after, x, z, yaw, dist, pitch, mode);
  await after.screenshot({ path: `${OUT}/_${name}-after.png`, timeout: 90000 });
  console.log('shot', name, 'yaw', +yaw.toFixed(2));
}
await browser.close();
console.log('skyline raw ok');
