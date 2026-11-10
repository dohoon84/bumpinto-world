import { chromium } from 'playwright';
import fs from 'fs';
const B = process.env.BASE || 'http://127.0.0.1:5179/';
const OUT = process.env.OUT || 'artifacts';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
fs.mkdirSync(OUT, { recursive: true });

async function boot(page) {
  await page.goto(B + '?at=arcade-seohyeon&hour=14&arcade=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('bw-launch-notice')?.remove(); document.getElementById('bw-bp24-poster')?.remove(); });
  await page.waitForSelector('[data-v2="guest"]', { timeout: 60000, state: 'attached' });
  await page.locator('[data-v2="guest"]').click({ force: true });
  await page.waitForSelector('.v2-world button[data-corridor-open]', { timeout: 30000 });
  await page.click('.v2-world button[data-corridor-open]');
  const slot = await page.$('.v2-sel-slot button[data-v2-at="seohyeon"]') || await page.$('.v2-sel-slot button[data-v2-at="jeongja"]');
  if (slot) await slot.click();
  await page.waitForSelector('#lobby-go', { timeout: 180000 });
  await page.evaluate(() => { const n = document.querySelector('#nick'); if (n && !n.value.trim()) n.value = '테스터'; });
  await page.click('#lobby-go');
  await page.waitForFunction(() => window.__jj?.ready && window.__jj?.arcadeGame, null, { timeout: 180000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector('#cc-overlay .cc-go')?.click(); document.getElementById('bw-bp24-poster')?.remove(); });
}

async function enterArcade(page) {
  await page.evaluate(() => {
    const a = window.__jj.arcadeGame; const p = window.__jj.player.position;
    p.x = a.store.door[0]; p.z = a.store.door[1];
    a.outdoorTick(0.016, p); a.onKey({ code: 'KeyE', repeat: false });
  });
  await page.waitForFunction(() => !!window.__jj?.arcadeGame?.active && !window.__jj.arcadeGame.busy, null, { timeout: 25000 });
}

async function waitAssets(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all([...document.images].map((img) => {
      if (img.complete) return null;
      return new Promise((r) => { img.onload = img.onerror = r; });
    }));
  });
  await page.waitForTimeout(280);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await boot(page);
await enterArcade(page);
await page.evaluate(() => window.__jj.arcadeGame.onKey({ code: 'KeyF', repeat: false }));
await page.waitForSelector('.arc-pick', { timeout: 10000 });
await waitAssets(page);
await page.screenshot({ path: `${OUT}/merge-select.png` });
console.log('select', await page.evaluate(() => ({
  title: document.querySelector('.arc-pick-panel h2')?.textContent,
  games: [...document.querySelectorAll('[data-pick]')].map((b) => b.getAttribute('data-pick')),
})));

await page.click('.arc-pick-game[data-pick="merge"]');
await page.waitForSelector('.arc-merge', { timeout: 10000 });
await page.waitForFunction(() => window.__jj?.arcadeGame?.sessionKind === 'merge', null, { timeout: 10000 });

// mobile play
await page.evaluate(() => { document.body.classList.add('mobile'); document.querySelector('.arc-merge')?.classList.add('is-touch'); document.querySelector('.arc-merge')?.classList.remove('is-desk', 'is-wide'); });
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await page.evaluate(() => window.__jj.arcadeGame.merge?.debug?.seedDemo?.());
await page.waitForTimeout(200);
await waitAssets(page);
await page.screenshot({ path: `${OUT}/merge-mobile-play.png` });
console.log('mobile-play', await page.evaluate(() => ({
  score: document.querySelector('.arc-merge [data-score]')?.textContent,
  next: document.querySelector('.arc-merge [data-next-img]')?.alt,
  wide: document.querySelector('.arc-merge')?.classList.contains('is-wide'),
})));

await page.evaluate(() => window.__jj.arcadeGame.merge?.debug?.showResult?.());
await waitAssets(page);
await page.screenshot({ path: `${OUT}/merge-mobile-result.png` });
console.log('mobile-result', await page.evaluate(() => document.querySelector('.arc-merge-result .res-msg')?.textContent));

await page.evaluate(() => {
  window.__jj.arcadeGame.merge?.debug?.hideOverlays?.();
  window.__jj.arcadeGame.merge?.debug?.showRanking?.([
    { rank: 1, name: '범돌이', score: 18900 },
    { rank: 2, name: '장바구니요정', score: 15240 },
    { rank: 3, name: '삼각의달인', score: 12200, me: true },
    { rank: 4, name: '민트캔', score: 9880 },
    { rank: 5, name: '버터냥', score: 7410 },
  ]);
});
await waitAssets(page);
await page.screenshot({ path: `${OUT}/merge-ranking.png` });
console.log('ranking', await page.evaluate(() => document.querySelector('.arc-merge-rank .eyebrow')?.textContent));

// PC landscape
await page.evaluate(() => {
  document.body.classList.remove('mobile');
  const m = document.querySelector('.arc-merge');
  m?.classList.add('is-desk', 'is-wide');
  m?.classList.remove('is-touch');
  window.__jj.arcadeGame.merge?.debug?.hideOverlays?.();
  window.__jj.arcadeGame.merge?.debug?.seedDemo?.();
});
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await page.waitForTimeout(300);
await waitAssets(page);
await page.screenshot({ path: `${OUT}/merge-pc-play.png` });
console.log('pc-play', await page.evaluate(() => ({
  wide: document.querySelector('.arc-merge')?.classList.contains('is-wide'),
  logo: !!document.querySelector('.arc-merge-logo'),
  guide: document.querySelectorAll('.arc-merge-guide li').length,
})));

await browser.close();
console.log('wrote', ['merge-select','merge-mobile-play','merge-mobile-result','merge-ranking','merge-pc-play'].map((n) => `${OUT}/${n}.png`).join(' '));
