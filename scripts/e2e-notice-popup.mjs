// [notice-popup] 헤드리스 확인: npm run build && vite preview --port 4231 후 node scripts/e2e-notice-popup.mjs
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4231/';
const OUT = process.env.OUT || '/workspace/bw-notice-popup-shots/';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  if (!localStorage.getItem('jeongja3d.profile')) localStorage.setItem('jeongja3d.profile', JSON.stringify({ name: 'Tester', look: {} }));
});
const page = await ctx.newPage();
const res = [];
async function enter(name, qs, expectOpen) {
  await page.goto(B + '?passport=1' + qs, { timeout: 120000 });
  // wait until joined (player visible / gate closed)
  await page.waitForFunction(() => !document.body.classList.contains('in-gate') && !document.body.classList.contains('in-lobby') && !document.getElementById('btn-leave').hidden, null, { timeout: 180000 });
  const tJoin = Date.now();
  const openAtJoin = await page.evaluate(() => !document.getElementById('board-modal').hidden);
  await page.waitForTimeout(4000);
  const open = await page.evaluate(() => !document.getElementById('board-modal').hidden);
  const tab = await page.evaluate(() => document.querySelector('#board-modal .board-cat.on')?.textContent || '');
  const seen = await page.evaluate(() => localStorage.getItem('bw.noticeSeen'));
  await page.screenshot({ path: OUT + name + '.png' });
  const pass = open === expectOpen && !openAtJoin;
  res.push({ name, expectOpen, open, openAtJoin, tab, seen, pass });
  console.log(JSON.stringify(res.at(-1)));
  if (open) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
}
await enter('1-first-entry-jeongja', '', true);
await enter('2-reload-jeongja', '', false);
await enter('3-other-neighborhood-jamsil', '&at=jamsil', false);
await page.evaluate(() => localStorage.removeItem('bw.noticeSeen'));
await enter('4-cleared-key-jamsil', '&at=jamsil', true);
await page.evaluate(() => localStorage.setItem('bw.noticeSeen', 'notice-2000-01-01-old'));
await enter('5-newer-notice', '', true);
await page.evaluate(() => localStorage.removeItem('bw.noticeSeen'));
await enter('6-flag-off', '&noticePopup=0', false);
console.log(res.every((r) => r.pass) ? 'E2E PASS' : 'E2E FAIL');
await browser.close();
