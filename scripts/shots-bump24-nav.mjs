// BUMP24 길찾기 스크린샷. 지도는 입장 화면을 통과한 기본 HUD, 표지·이정표는 ?shot=1.
//   OUT=... node scripts/shots-bump24-nav.mjs
import { chromium } from 'playwright';

const B = 'http://127.0.0.1:5173/';
const OUT = process.env.OUT || 'artifacts';
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});

async function bootPc(page) {
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(B + '?hour=14', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('#bw-launch-notice [data-close]')?.click());
  await page.waitForSelector('[data-v2="guest"]', { timeout: 30000 });
  await page.click('[data-v2="guest"]');
  await page.waitForSelector('.v2-world button[data-corridor-open]', { timeout: 30000 });
  await page.click('.v2-world button[data-corridor-open]');
  await page.waitForSelector('.v2-sel-slot button[data-v2-at="jeongja"]', { timeout: 30000 });
  await page.click('.v2-sel-slot button[data-v2-at="jeongja"]');
  await page.waitForSelector('#lobby-go', { timeout: 180000 });
  await page.evaluate(() => { const n = document.querySelector('#nick'); if (n && !n.value.trim()) n.value = '테스터'; });
  await page.click('#lobby-go');
  await page.waitForFunction(() => window.__jj?.ready && window.__jj.player && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('.board-close')?.click());
}

async function bootMobile(page) {
  page.on('pageerror', (e) => console.log('[pageerror m]', e.message));
  await page.goto(B + '?hour=14', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#bw-launch-notice [data-close]')?.click());
  await page.waitForSelector('[data-act="pick"]', { timeout: 30000 });
  await page.click('[data-act="pick"]');
  await page.waitForSelector('[data-act="go"]', { timeout: 20000 });
  await page.click('[data-act="go"]');
  await page.waitForSelector('#lobby-go', { timeout: 180000 });
  await page.evaluate(() => { const n = document.querySelector('#nick'); if (n && !n.value.trim()) n.value = '테스터'; });
  await page.click('#lobby-go');
  await page.waitForFunction(() => window.__jj?.ready && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate') && !document.body.classList.contains('in-mobile-landing'), null, { timeout: 180000 });
  await page.waitForTimeout(800);
}

async function stand(page, x, z, yaw, pitch, dist) {
  await page.evaluate((p) => {
    const y = window.__jj.terrain ? window.__jj.terrain.getGroundHeight(p.x, p.z, 0) : 0;
    window.__jj.teleport(p.x, p.z, y);
    window.__jj.setMode('follow');
    window.__jj.cam.yaw = p.yaw; window.__jj.cam.pitch = p.pitch; window.__jj.cam.dist = p.dist;
    document.querySelector('.board-close')?.click();
  }, { x, z, yaw, pitch, dist });
  await page.waitForTimeout(900);
}

const pc = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await bootPc(pc);
await stand(pc, -42, -78, Math.PI / 2, 0.35, 14);
await pc.waitForTimeout(600);
await pc.locator('#h3-mm').screenshot({ path: `${OUT}/bump24-nav-minimap.png` });
console.log('minimap');

const hit = await pc.evaluate(() => window.__h3mm?.navHits?.[0] || null);
if (!hit) throw new Error('미니맵에 매장 아이콘이 없음');
const box = await pc.locator('#h3-mm canvas').boundingBox();
await pc.mouse.click(box.x + hit.sx * (box.width / 176), box.y + hit.sy * (box.height / 176));
await pc.waitForTimeout(500);
await pc.screenshot({ path: `${OUT}/bump24-nav-tap.png` });
console.log('tap', hit);

await pc.evaluate(() => window.__h3mm.toggle(false));
await stand(pc, -42, -78, Math.PI / 2, 0.35, 14);
await pc.evaluate(() => {
  const p = document.getElementById('phone');
  p.style.width = '560px';
  p.style.bottom = '80px';
  const s = document.getElementById('phone-screen');
  s.style.height = '420px';
});
await pc.waitForTimeout(700);
await pc.locator('#phone').screenshot({ path: `${OUT}/bump24-nav-bigmap.png` });
console.log('bigmap');
await pc.close();

const shot = await browser.newPage({ viewport: { width: 1280, height: 800 } });
shot.on('pageerror', (e) => console.log('[pageerror shot]', e.message));
await shot.goto(B + '?shot=1&hour=14', { waitUntil: 'domcontentloaded', timeout: 120000 });
await shot.waitForFunction(() => window.__jj?.ready && window.__jj.bp24Nav, null, { timeout: 180000 });
await shot.waitForTimeout(500);
const signs = await shot.evaluate(() => window.__jj.bp24Nav.signs());
const door = await shot.evaluate(() => window.__jj.bp24Nav.points()[0]);
await stand(shot, signs[0].x + 3, signs[0].z - 6, 3.4, 0.08, 6);
await shot.screenshot({ path: `${OUT}/bump24-nav-signpost-exit6.png` });
console.log('sign', signs[0]);
await stand(shot, door.x + 22, door.z, Math.PI / 2, -0.12, 13);
await shot.screenshot({ path: `${OUT}/bump24-nav-label-marker.png` });
console.log('label');
await shot.close();

const mobile = await browser.newPage({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
await bootMobile(mobile);
await stand(mobile, -42, -78, 0, 0.3, 12);
await mobile.click('[data-tg="map"]');
await mobile.waitForTimeout(800);
await mobile.screenshot({ path: `${OUT}/bump24-nav-bigmap-mobile.png` });
console.log('mobile map');
await mobile.close();
await browser.close();
console.log('shots ok');
