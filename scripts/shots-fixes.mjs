// [subway] 도훈 피드백 (2026-11-03) 다시 찍기: 정자 2번 출구(다리 난간과 간격) · 광장 옆 4번 출구(방향)
//   BASE=http://127.0.0.1:4410/ OUT=/workspace/bw-subway-shots node scripts/shots-fixes.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4410/';
const OUT = process.env.OUT || '/workspace/bw-subway-shots';
const YAWS = (process.env.YAWS || '').split(',').filter(Boolean).map(Number);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(B + '?enter=1&name=Tester&ws=mock&shot=1&lang=ko&subwayRt=0', { timeout: 120000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.getElementById('lobby-go')?.click());
await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
await page.waitForTimeout(1500);
const ents = await page.evaluate(() => __jj.subway.ensureStation('jeongja').ent.list.map((e) => ({ ref: e.exit.ref, x: +e.x.toFixed(1), z: +e.z.toFixed(1), ry: +e.ry.toFixed(3), shift: +e.shift.toFixed(1), ok: e.ok, clr: e.clr, front: e.front, stairs: e.exit.stairs || null })));
console.log(JSON.stringify(ents));
const shot = async (name, x, z, yaw, pitch, dist, wait = 2500) => {
  await page.evaluate(({ x, z, yaw, pitch, dist }) => { __jj.teleport(x, z); __jj.setMode('follow'); __jj.cam.yaw = yaw; __jj.cam.pitch = pitch; __jj.cam.dist = dist; }, { x, z, yaw, pitch, dist });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}` });
};
const e2 = ents.find((e) => e.ref === '2'), e4 = ents.find((e) => e.ref === '4');
// 2번: 피드백 1 처럼 비스듬히 위에서 (출입구 + 남쪽 다리 난간이 같이 보이게)
//   중심 = 출입구와 북쪽 다리 상판 사이, 비스듬히 (다리 난간까지 간격이 보이게)
const Y2 = (process.env.Y2 || '0.6').split(',').map(Number);
for (const y of Y2) await shot(Y2.length > 1 ? `fix-exit2-yaw${y}.png` : 'stations-fix-exit2.png', e2.x + 1, e2.z - 1.5, y, 0.85, 20, 4000);
// 광장 4번: 피드백 2 처럼 위에서 (화면 오른쪽 = 북)
for (const y of YAWS.length ? YAWS : [1.57]) await shot(YAWS.length ? `fix-plaza-yaw${y}.png` : 'stations-fix-plaza.png', -60, 20, y, 1.42, 42, 4000);
// 4번 입구를 북쪽(화살표 꼬리 쪽)에서 비스듬히: 계단 입구가 보이는지
await shot('stations-fix-plaza-mouth.png', e4.x, e4.z - 3, Math.PI, 0.55, 11, 3000);
fs.writeFileSync(`${OUT}/stations-fix-report.json`, JSON.stringify({ entrances: ents, errors: errs }, null, 2));
await browser.close();
