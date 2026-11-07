// [titles] 칭호 획득·머리 위·도감·아이콘 시트 스크린샷.
//   BASE=http://127.0.0.1:5173 OUT=/tmp/title-shots node scripts/shots-titles.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = process.env.OUT || '/tmp/title-shots';
mkdirSync(OUT, { recursive: true });
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const QS = 'shot&name=도훈&npcs=0&taxis=0&jzcars=0&bus=sim&bgm=0&noticePopup=0&ga=off&corridor=0&subway=0&hour=11&streams=0&titledemo=health.marathon';

const GRANT = ['health.stroll', 'health.walker', 'explore.alley', 'transit.transfer', 'transit.vip', 'neighbor.hello', 'streak.d7', 'streak.d30', 'store.grocery'];

async function run(kind) {
  const mobile = kind === 'mobile';
  const b = await chromium.launch({ args: GL });
  const ctx = await b.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    locale: 'ko-KR',
    hasTouch: mobile,
    isMobile: mobile,
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(180000);
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(`${BASE}/?${QS}${mobile ? '&mobile=1' : ''}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__jj?.ready && window.__jj.player, null, { timeout: 180000 });
  await p.waitForFunction(() => window.__jj.titles.iconsReady(), null, { timeout: 20000 });
  if (mobile) await p.addStyleTag({ content: '@media (orientation: portrait){body.mobile #m-rotate{display:none !important}}' });
  await p.waitForFunction(() => !!document.querySelector('.tb-pop-name'), null, { timeout: 20000 });
  await p.evaluate(() => {
    const j = window.__jj;
    j.cam.mode = 'follow';
    j.cam.dist = 6.2;
    j.cam.pitch = -0.02;
    j.cam.yaw = (j.player.rotation.y || 0) + Math.PI * 0.15;
  });
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/${kind}-acquire.png` });
  console.log('shot', kind + '-acquire');
  await p.waitForFunction(() => !window.__jj.titles.playing(), null, { timeout: 20000 });
  await p.waitForTimeout(400);
  await p.evaluate((ids) => {
    const j = window.__jj;
    j.cam.dist = 7.2;
    j.cam.pitch = 0.06;
    j.titles.grant(ids);
  }, GRANT);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/${kind}-head.png` });
  console.log('shot', kind + '-head');
  await p.evaluate(() => window.__jj.titles.openBook());
  await p.waitForSelector('.tb-book', { timeout: 10000 });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${kind}-book.png` });
  console.log('shot', kind + '-book');
  await p.evaluate(() => { window.__jj.titles.closeBook(); window.__jj.titles.showSheet(); });
  await p.waitForFunction(() => [...document.querySelectorAll('.tb-sheet-grid img')].length >= 13 && [...document.querySelectorAll('.tb-sheet-grid img')].every((img) => img.getAttribute('src')?.includes('.svg')), null, { timeout: 10000 });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${kind}-sheet.png` });
  console.log('shot', kind + '-sheet');
  const info = await p.evaluate(() => ({
    title: document.querySelector('.tb-chip .tb-t')?.textContent || '',
    wearing: document.querySelector('.tb-card.is-on b')?.textContent || '',
    medals: document.querySelectorAll('.tb-sheet-grid img').length,
    pop: !!document.querySelector('.tb-pop-name'),
    remote: [...document.querySelectorAll('.tag.remote .tb-t')].map((n) => n.textContent),
  }));
  console.log(kind, JSON.stringify({ ...info, errors: errs.slice(0, 12) }, null, 0));
  await b.close();
  return errs;
}

const bad = [];
const only = process.env.ONLY || '';
for (const kind of ['pc', 'mobile']) {
  if (only && kind !== only) continue;
  const errs = await run(kind);
  if (errs.length) bad.push(kind);
}
if (bad.length) {
  console.error('console errors in ' + bad.join(', '));
  process.exitCode = 1;
}
