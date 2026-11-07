// [titles] 칭호 획득·머리 위·도감·아이콘 시트 스크린샷.
//   BASE=http://127.0.0.1:5173 OUT=/tmp/title-shots node scripts/shots-titles.mjs
import { chromium } from 'playwright';
import { mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

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
  if (mobile) await p.addStyleTag({ content: '@media (orientation: portrait){body.mobile #m-rotate{display:none !important}}' });
  await p.waitForFunction(() => window.__jj.titles.iconsReady(), null, { timeout: 20000 });
  await p.evaluate(() => window.__jj.titles.present('health.marathon'));
  await p.waitForFunction(() => !!document.querySelector('.tb-chip.is-earn'), null, { timeout: 20000 });
  await p.evaluate(() => {
    const j = window.__jj;
    j.cam.mode = 'follow';
    j.cam.dist = 6.2;
    j.cam.pitch = -0.02;
    j.cam.yaw = (j.player.rotation.y || 0) + Math.PI * 0.15;
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${kind}-acquire.png` });
  console.log('shot', kind + '-acquire');
  await p.waitForFunction(() => !window.__jj.titles.playing(), null, { timeout: 20000 });
  await p.waitForFunction(() => window.__jj.titles.iconsReady(), null, { timeout: 20000 });
  await p.waitForTimeout(400);
  await p.evaluate((ids) => {
    const j = window.__jj;
    j.cam.dist = 7.2;
    j.cam.pitch = 0.06;
    j.titles.grant(ids);
  }, GRANT);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${kind}-head.png` });
  console.log('shot', kind + '-head');
  await p.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'tb-tier-row';
    host.style.cssText = 'position:fixed;left:50%;top:96px;transform:translateX(-50%);z-index:80;display:flex;gap:18px;align-items:flex-end;padding:12px 16px;border-radius:16px;background:rgba(15,25,42,.72)';
    const rows = [['health.stroll', '동'], ['explore.alley', '은'], ['health.walker', '금'], ['health.marathon', '전설']];
    for (const [id, name] of rows) {
      const el = document.createElement('div');
      el.className = 'tag';
      el.style.position = 'relative';
      host.appendChild(el);
      window.__jj.titles.paintTag(el, { name, titleId: id });
    }
    document.body.appendChild(host);
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${kind}-tiers.png` });
  console.log('shot', kind + '-tiers');
  await p.evaluate(() => document.getElementById('tb-tier-row')?.remove());
  await p.evaluate(() => window.__jj.titles.openBook());
  await p.waitForSelector('.tb-rare', { timeout: 10000 });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${kind}-rarity.png` });
  console.log('shot', kind + '-rarity');
  await p.evaluate(() => window.__jj.titles.closeBook());
  await p.evaluate(() => {
    const p = window.__jj.player.position;
    window.__jj.presence.emit('title', { t: 'title', id: 'mock-1', name: '판교러버', title: 'health.marathon', x: p.x + 4, z: p.z + 2 });
  });
  await p.waitForSelector('.tb-clap', { timeout: 5000 });
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${OUT}/${kind}-cheer.png` });
  console.log('shot', kind + '-cheer');
  await p.evaluate(() => { document.querySelector('.tb-cheers')?.remove(); window.__jj.titles.showSheet(); });
  await p.waitForFunction(() => [...document.querySelectorAll('.tb-sheet-grid img')].length >= 13 && [...document.querySelectorAll('.tb-sheet-grid img')].every((img) => img.getAttribute('src')?.includes('.svg')), null, { timeout: 10000 });
  await p.waitForTimeout(200);
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

if (!only || only === 'spin') {
  const b = await chromium.launch({ args: GL });
  const ctx = await b.newContext({
    viewport: { width: 960, height: 540 },
    recordVideo: { dir: OUT, size: { width: 960, height: 540 } },
    locale: 'ko-KR',
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/?${QS}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__jj?.ready && document.querySelector('.tb-coin') && !window.__jj.titles.playing(), null, { timeout: 180000 });
  await p.evaluate(() => {
    const j = window.__jj;
    j.cam.mode = 'follow';
    j.cam.dist = 5.4;
    j.cam.pitch = 0.02;
    j.cam.yaw = (j.player.rotation.y || 0) + Math.PI * 0.15;
  });
  await p.waitForTimeout(5000);
  const video = p.video();
  await ctx.close();
  await b.close();
  const src = await video.path();
  const dest = `${OUT}/pc-rotate.webm`;
  const ff = spawnSync('ffmpeg', ['-y', '-sseof', '-4.6', '-i', src, '-an', '-c:v', 'libvpx-vp9', '-b:v', '800k', dest], { stdio: 'inherit' });
  if (ff.status !== 0) {
    spawnSync('cp', [src, dest]);
  }
  console.log('video', dest, statSync(dest).size);
}
