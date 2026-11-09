import { chromium } from 'playwright';
import fs from 'fs';
const B = process.env.BASE || 'http://127.0.0.1:5179/';
const OUT = process.env.OUT || 'artifacts';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(B + '?at=arcade-seohyeon&hour=21&arcade=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(600);
await page.evaluate(() => {
  document.getElementById('bw-launch-notice')?.remove();
  document.getElementById('bw-bp24-poster')?.remove();
  localStorage.setItem('bw.bump24.poster.dismiss', '1');
});
await page.waitForSelector('[data-v2="guest"]', { timeout: 60000 });
await page.click('[data-v2="guest"]', { force: true });
await page.waitForSelector('.v2-world button[data-corridor-open]', { timeout: 30000 });
await page.click('.v2-world button[data-corridor-open]');
const slot = await page.$('.v2-sel-slot button[data-v2-at="seohyeon"]') || await page.$('.v2-sel-slot button[data-v2-at="jeongja"]');
if (slot) await slot.click();
await page.waitForSelector('#lobby-go', { timeout: 180000 });
await page.evaluate(() => { const n = document.querySelector('#nick'); if (n && !n.value.trim()) n.value = '테스터'; });
await page.click('#lobby-go');
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.arcadeGame && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 180000 });
await page.waitForTimeout(1000);
if (await page.$('#cc-overlay:not([hidden])')) await page.click('#cc-overlay .cc-go');
await page.evaluate(() => {
  document.getElementById('bw-bp24-poster')?.remove();
  localStorage.setItem('bw.bump24.poster.dismiss', '1');
  // dismiss any station enter modal
  document.querySelectorAll('[data-close], .gate-close, .modal-close, button').forEach((b) => {
    const t = (b.textContent || '').trim();
    if (t === '닫기' || t === 'Close' || t.includes('다시 보지')) b.click();
  });
});

await page.evaluate(() => {
  const J = window.__jj; const d = J.arcadeGame.store.door;
  const y = J.terrain ? J.terrain.getGroundHeight(d[0], d[1], 0) : 0;
  J.teleport(d[0], d[1] + 5.5, y);
  J.setMode('follow'); J.cam.yaw = Math.PI; J.cam.pitch = 0.18; J.cam.dist = 11;
});
await page.waitForTimeout(2500);
// hide chrome for clean exterior
await page.evaluate(() => {
  const style = document.createElement('style');
  style.id = 'shot-hide';
  style.textContent = `
    #handset, .m-root, #bgm-pill, .explorer-card, .online-pill, .minimap, #chat-bar, .emote-bar,
    .backpack, .v2-top, .phone-fab, #cc-overlay, #bw-bp24-poster, .notice, .gate-modal { display:none !important; }
  `;
  document.head.appendChild(style);
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/arcade-exterior.png` });
console.log('exterior');

await page.evaluate(() => {
  const a = window.__jj.arcadeGame; const p = window.__jj.player.position;
  p.x = a.store.door[0]; p.z = a.store.door[1];
  a.outdoorTick(0.016, p);
  a.onKey({ code: 'KeyE', repeat: false });
});
await page.waitForFunction(() => !!window.__jj?.arcadeGame?.active, null, { timeout: 15000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/arcade-interior.png` });
console.log('interior', await page.evaluate(() => ({
  active: !!window.__jj.arcadeGame.active,
  cabs: window.__jj.arcadeGame.interior?.cabinets?.length,
})));

await page.evaluate(() => window.__jj.arcadeGame.onKey({ code: 'KeyF', repeat: false }));
await page.waitForSelector('.arc-pang [data-go]', { timeout: 10000 });
await page.click('.arc-pang [data-go]');
await page.waitForFunction(() => {
  const c = document.querySelector('.arc-pang [data-count]');
  const t = document.querySelector('.arc-pang [data-time]');
  return c?.hidden && t && Number(t.textContent) < 60 && Number(t.textContent) > 50;
}, null, { timeout: 15000 });
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/arcade-pang-idle.png` });
console.log('idle');

async function tap(r, c) {
  const box = await page.locator('.arc-pang canvas').boundingBox();
  const pad = 10, s = (560 - 20) / 8;
  const x = box.x + (pad + c * s + s / 2) * (box.width / 560);
  const y = box.y + (pad + r * s + s / 2) * (box.height / 560);
  await page.mouse.click(x, y);
}
for (const [a, b] of [[[3,3],[3,4]],[[4,2],[4,3]],[[2,5],[3,5]],[[5,5],[5,6]],[[1,1],[1,2]],[[6,3],[6,4]],[[0,3],[0,4]],[[7,4],[7,5]],[[2,1],[2,2]],[[5,3],[5,4]],[[3,0],[3,1]],[[1,6],[1,7]]]) {
  await tap(...a); await page.waitForTimeout(40);
  await tap(...b); await page.waitForTimeout(420);
}
await page.evaluate(() => {
  const t = document.querySelector('.arc-pang [data-toast]');
  if (t) { t.hidden = false; t.className = 'arc-pang-toast combo'; t.textContent = '콤보 x3!'; }
});
await page.waitForTimeout(120);
await page.screenshot({ path: `${OUT}/arcade-pang-mid.png` });
console.log('mid', await page.evaluate(() => document.querySelector('.arc-pang [data-score]')?.textContent));

await page.evaluate(() => {
  const res = document.querySelector('.arc-pang [data-result]');
  const score = document.querySelector('.arc-pang [data-score]')?.textContent || '0';
  const combo = document.querySelector('.arc-pang [data-combo]')?.textContent || '0';
  res.hidden = false;
  res.innerHTML = `<div class="box cute"><div class="mascot big">🎉</div><h2>시간 끝!</h2>
    <p class="big">${Number(score).toLocaleString()}점</p><p class="stars">★★★</p>
    <p>랭킹 도전 기록 · 최고 콤보 ${combo}</p>
    <div class="row"><button type="button">한 판 더</button><button type="button">순위판</button><button type="button">오락실로</button></div></div>`;
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/arcade-pang-result.png` });
console.log('result');
await browser.close();
console.log('SHOT OK');
