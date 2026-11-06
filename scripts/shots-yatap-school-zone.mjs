// [schoolzone] 야탑초 어린이 보호구역 스크린샷.
//   눈높이(학교·횡단보도·표지·노면) / 위에서 / ?schoolzone=0
//   BASE=http://127.0.0.1:4173/ OUT=/opt/cursor/artifacts node scripts/shots-yatap-school-zone.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:4173/';
const OUT = process.env.OUT || '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome-stable',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errs = [];
async function open(qs) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 240)); });
  await page.goto(B + '?shot=1&ws=mock&lang=ko&hour=11&weather=clear&evening=0' + qs, { timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 180000 });
  await page.evaluate(() => {
    for (const id of ['hud', 'chat', 'overlay', 'buttons', 'emote-bar', 'top-right-bar', 'handset', 'phone', 'attribution', 'ride-btn', 'stop-panel', 'joystick']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
  });
  return page;
}
const frames = (page, n = 6) => page.evaluate((n) => new Promise((res) => {
  let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);

const on = await open('');
await on.evaluate(() => {
  __jj.player.visible = false;
  __jj.teleport(1564, -5562);
  __jj.setMode('follow');
});
await on.waitForFunction(() => {
  const t = __jj.corridor?.tiles;
  return t?.get('3_-12')?.dState === 3 && t?.get('2_-12')?.dState === 3;
}, null, { timeout: 120000 });
await on.waitForTimeout(1200);

const look = async (px, pz, tx, tz, pitch, dist, file) => {
  await on.evaluate(({ px, pz, tx, tz, pitch, dist }) => {
    __jj.teleport(px, pz);
    __jj.player.visible = false;
    const dx = tx - px, dz = tz - pz, L = Math.hypot(dx, dz) || 1;
    __jj.cam.yaw = Math.atan2(-dx / L, -dz / L);
    __jj.cam.pitch = pitch;
    __jj.cam.dist = dist;
    __jj.setMode('follow');
  }, { px, pz, tx, tz, pitch, dist });
  await frames(on, 6);
  await on.waitForTimeout(350);
  await on.screenshot({ path: `${OUT}/${file}` });
  console.log('shot', file);
};
// 차도에서 학교 정면·명판·표지·노면 글자·횡단보도를 한 프레임에.
await look(1538, -5566, 1592, -5544, 0.1, 2.4, 'yatap-school-zone-street.png');

const streetInfo = await on.evaluate(() => {
  let zone = 0;
  __jj.corridor.root.traverse((o) => { if (o.name === 'yatapSchoolZone') zone++; });
  return { zone, signs: __jj.schoolZone?.plan?.signs?.length || 0 };
});

await on.evaluate(() => {
  __jj.teleport(1568, -5556);
  __jj.player.visible = false;
  __jj.setMode('overview');
  __jj.ov.pitch = 1.22;
  __jj.ov.yaw = Math.PI;
  __jj.ov.dist = 145;
});
await frames(on, 8);
await on.waitForTimeout(400);
await on.screenshot({ path: `${OUT}/yatap-school-zone-aerial.png` });
console.log('aerial on');

const off = await open('&schoolzone=0');
await off.evaluate(() => {
  __jj.player.visible = false;
  __jj.teleport(1568, -5556);
  __jj.setMode('follow');
});
await off.waitForFunction(() => __jj.corridor?.tiles?.get('3_-12')?.dState === 3, null, { timeout: 120000 });
await off.evaluate(() => {
  __jj.teleport(1568, -5556);
  __jj.player.visible = false;
  __jj.setMode('overview');
  __jj.ov.pitch = 1.22;
  __jj.ov.yaw = Math.PI;
  __jj.ov.dist = 145;
});
await frames(off, 8);
await off.waitForTimeout(400);
const offInfo = await off.evaluate(() => {
  let zone = 0;
  __jj.corridor.root.traverse((o) => { if (o.name === 'yatapSchoolZone' || o.name?.startsWith?.('schoolzone-')) zone++; });
  return { schoolZone: __jj.schoolZone, named: zone };
});
await off.screenshot({ path: `${OUT}/yatap-school-zone-off.png` });
console.log('off', JSON.stringify(offInfo));
if (offInfo.schoolZone || offInfo.named) throw new Error('school zone still present with ?schoolzone=0');
if (!streetInfo.zone) throw new Error('school zone missing on the default URL');
if (errs.length) console.log('errors', errs.slice(0, 8));
await browser.close();
console.log('shots ok', OUT);
