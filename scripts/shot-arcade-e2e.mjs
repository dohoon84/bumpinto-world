import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:5179/';
const OUT = process.env.OUT || 'artifacts';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });

await page.goto(B + '?at=arcade-seohyeon&hour=21', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('#bw-launch-notice [data-close]')?.click());
await page.waitForSelector('[data-v2="guest"]', { timeout: 60000 });
await page.click('[data-v2="guest"]');
await page.waitForSelector('.v2-world button[data-corridor-open]', { timeout: 30000 });
await page.click('.v2-world button[data-corridor-open]');
const slot = await page.$('.v2-sel-slot button[data-v2-at="seohyeon"]') || await page.$('.v2-sel-slot button[data-v2-at="jeongja"]');
if (slot) await slot.click();
await page.waitForSelector('#lobby-go', { timeout: 180000 });
await page.evaluate(() => { const n = document.querySelector('#nick'); if (n && !n.value.trim()) n.value = '테스터'; });
await page.click('#lobby-go');
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.arcadeGame && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 180000 });
await page.waitForTimeout(1200);

// Dismiss Controls if present (real user: Got it)
if (await page.$('#cc-overlay:not([hidden])')) {
  await page.click('#cc-overlay .cc-go');
  await page.waitForTimeout(300);
}
// Do NOT dismiss poster yet — leave it so enter/F must clear it (repro path)
await page.waitForTimeout(1500); // poster schedules at 800ms

const hasPoster = await page.evaluate(() => !!document.getElementById('bw-bp24-poster'));
console.log('posterBeforeEnter', hasPoster);

await page.evaluate(() => {
  const J = window.__jj; const d = J.arcadeGame.store.door;
  const y = J.terrain ? J.terrain.getGroundHeight(d[0], d[1], 0) : 0;
  J.teleport(d[0], d[1] + 5.5, y);
  J.setMode('follow'); J.cam.yaw = Math.PI; J.cam.pitch = 0.15; J.cam.dist = 10;
});
await page.waitForTimeout(3000);
// close poster only for exterior shot clarity, then reopen? Better: exterior after closing
await page.evaluate(() => document.querySelector('#bw-bp24-poster [data-close]')?.click());
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/arcade-exterior.png` });
console.log('exterior');

// Re-show poster to test dismiss-on-pang (simulate 도훈 who skipped closing it)
await page.evaluate(async () => {
  const m = await import('/src/notice/posterPopup.js');
  // force show ignoring dismiss for test — remove dismiss key then show
  localStorage.removeItem('bw.bump24.poster.dismiss');
  document.getElementById('bw-bp24-poster')?.remove();
  m.showPoster({ params: new URLSearchParams('') });
});
await page.waitForTimeout(400);
console.log('posterForced', await page.evaluate(() => !!document.getElementById('bw-bp24-poster')));

await page.evaluate(() => {
  const a = window.__jj.arcadeGame; const p = window.__jj.player.position;
  p.x = a.store.door[0]; p.z = a.store.door[1];
  a.outdoorTick(0.016, p); a.onKey({ code: 'KeyE', repeat: false });
});
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/arcade-interior.png` });
console.log('inside', await page.evaluate(() => !!window.__jj.arcadeGame?.active));

await page.evaluate(() => window.__jj.arcadeGame.onKey({ code: 'KeyF', repeat: false }));
await page.waitForSelector('.arc-pang [data-go]', { timeout: 10000 });
await page.waitForTimeout(400);

const layer = await page.evaluate(() => {
  const btn = document.querySelector('.arc-pang [data-go]');
  const r = btn.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    posterGone: !document.getElementById('bw-bp24-poster'),
    arcZ: getComputedStyle(document.getElementById('arc-root')).zIndex,
    isPang: document.getElementById('arc-root').classList.contains('is-pang'),
    topTag: top?.tagName, topCls: String(top?.className || '').slice(0, 80), topId: top?.id,
    fadePe: document.querySelector('[data-fade]')?.style?.pointerEvents,
    fadeOp: document.querySelector('[data-fade]')?.style?.opacity,
  };
});
console.log('layer', layer);

await page.click('.arc-pang [data-go]', { force: false, timeout: 10000 });
await page.waitForTimeout(700);
const after = await page.evaluate(() => ({
  introHidden: !!document.querySelector('.arc-pang [data-intro]')?.hidden,
  time: document.querySelector('.arc-pang [data-time]')?.textContent,
}));
console.log('afterStart', after);
if (!after.introHidden) throw new Error('시작 failed');

// swaps
async function tap(r, c) {
  const box = await page.locator('.arc-pang canvas').boundingBox();
  const pad = 8, s = (560 - 16) / 8;
  const x = box.x + (pad + c * s + s / 2) * (box.width / 560);
  const y = box.y + (pad + r * s + s / 2) * (box.height / 560);
  await page.mouse.click(x, y);
  await page.waitForTimeout(100);
}
for (const [a, b] of [[[3,3],[3,4]],[[4,2],[4,3]],[[2,5],[3,5]],[[5,5],[5,6]],[[1,1],[1,2]],[[6,3],[6,4]]]) {
  await tap(...a); await tap(...b); await page.waitForTimeout(350);
}
await page.waitForTimeout(500);
const mid = await page.evaluate(() => ({
  score: document.querySelector('.arc-pang [data-score]')?.textContent,
  time: document.querySelector('.arc-pang [data-time]')?.textContent,
}));
console.log('midPlay', mid);
await page.screenshot({ path: `${OUT}/arcade-pang-mid.png` });

console.log('ERRORS', errors);
await browser.close();
if (!layer.posterGone) throw new Error('poster still present');
if (!layer.isPang || Number(layer.arcZ) < 5000) throw new Error('arc z-index not raised');
if (Number(mid.time) >= 60) console.warn('timer may not have ticked yet');
console.log('E2E OK');
