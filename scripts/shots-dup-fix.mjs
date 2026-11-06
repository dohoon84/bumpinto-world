// dup-fix shots: minimap open/closed + online panel; 1440 & 1280
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = process.env.OUT || '/workspace/bw-hud-v3-shots';
mkdirSync(OUT, { recursive: true });
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const report = [];

async function enter(p) {
  await p.goto(`${BASE}/?noticePopup=0&ga=off&hud=v3`, { timeout: 120000 });
  await p.waitForSelector('[data-v2=guest]', { timeout: 60000 }); await p.waitForTimeout(800);
  await p.locator('[data-v2=guest]').first().click({ force: true });
  await p.waitForSelector('[data-enter-at=pangyo]', { state: 'attached', timeout: 60000 }); await p.waitForTimeout(1500);
  await p.locator('[data-enter-at=pangyo]:visible').first().click({ force: true });
  await p.waitForSelector('#lobby-go', { state: 'visible', timeout: 90000 }); await p.waitForTimeout(2500);
  if (await p.locator('#nick').isVisible().catch(() => false) && !(await p.inputValue('#nick').catch(() => '')).trim()) await p.fill('#nick', '도훈');
  await p.locator('#lobby-go').first().click({ force: true });
  await p.waitForFunction(() => !document.body.classList.contains('in-gate') && !document.body.classList.contains('in-lobby') && !document.getElementById('btn-leave')?.hidden, null, { timeout: 180000 });
  await p.waitForFunction(() => !!document.getElementById('h3-bar') && !!document.getElementById('h3-online'), null, { timeout: 60000 });
  await p.waitForFunction(() => { const l = document.getElementById('enter-loading'); return !l || l.hidden || getComputedStyle(l).display === 'none'; }, null, { timeout: 180000 });
  await p.waitForTimeout(4000);
}

const rect = () => {
  const r = (s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (cs.display === 'none' || !b.width) return 'hidden'; return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  return {
    body: [...document.body.classList],
    card: r('#h3-card'), bar: r('#h3-bar'), online: r('#h3-online'), tr: r('#h3-tr'),
    mm: r('#h3-mm'), mmRing: r('#h3-mm .h3-mm-ring'), phone: r('#phone'),
    presence: r('#presence-panel'), bgm: r('#bgm'),
    mmOn: document.body.classList.contains('h3-mm-on'),
    onlineBelow: document.body.classList.contains('h3-online-below'),
  };
};
const ov = (a, c) => Array.isArray(a) && Array.isArray(c) && a[0] < c[0] + c[2] && c[0] < a[0] + a[2] && a[1] < c[1] + c[3] && c[1] < a[1] + a[3];

async function run(w, h) {
  const b = await chromium.launch({ args: GL });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ko-KR' });
  const p = await ctx.newPage();
  p.setDefaultTimeout(120000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await enter(p);
  const shot = async (name) => {
    await p.waitForTimeout(500);
    const path = `${OUT}/dup-fix-${w}-${name}.png`;
    await p.screenshot({ path });
    console.log('shot', path);
    return path;
  };
  const info = { w, h, errs };

  // ensure minimap open
  await p.evaluate(() => { window.__h3mm?.toggle(true); });
  await p.waitForTimeout(800);
  info.open = await p.evaluate(rect);
  info.open.phoneHidden = info.open.phone === 'hidden' || info.open.phone === null;
  info.open.overlaps = {
    onlineMm: ov(info.open.online, info.open.mmRing),
    onlineCard: ov(info.open.online, info.open.card),
    onlineBgm: ov(info.open.online, info.open.bgm),
    mmPhone: ov(info.open.mmRing, info.open.phone),
  };
  await shot('minimap-open');

  // online panel open with minimap open
  await p.click('#h3-online');
  await p.waitForTimeout(700);
  info.panel = await p.evaluate(rect);
  info.panel.overlaps = {
    panelMm: ov(info.panel.presence, info.panel.mmRing),
    panelOnline: ov(info.panel.presence, info.panel.online),
    onlineMm: ov(info.panel.online, info.panel.mmRing),
  };
  await shot('online-panel-minimap-open');
  // close panel
  await p.evaluate(() => document.getElementById('presence-status')?.click());
  await p.waitForTimeout(300);

  // minimap closed → phone visible
  await p.evaluate(() => { window.__h3mm?.toggle(false); });
  await p.waitForTimeout(800);
  info.closed = await p.evaluate(rect);
  info.closed.phoneVisible = Array.isArray(info.closed.phone);
  info.closed.mmHidden = info.closed.mm === 'hidden' || info.closed.mm === null;
  await shot('minimap-closed');

  report.push(info);
  console.log(JSON.stringify(info, null, 2));
  await b.close();
}

for (const [w, h] of [[1440, 900], [1280, 800]]) await run(w, h);
writeFileSync(`${OUT}/dup-fix-report.json`, JSON.stringify(report, null, 2));
const bad = [];
for (const r of report) {
  if (!r.open.phoneHidden) bad.push(`${r.w}: phone still visible with minimap open`);
  if (!r.open.mmOn) bad.push(`${r.w}: h3-mm-on missing`);
  if (r.open.overlaps.onlineMm) bad.push(`${r.w}: online overlaps minimap`);
  if (r.open.overlaps.onlineCard) bad.push(`${r.w}: online overlaps card`);
  if (r.panel.overlaps.panelMm) bad.push(`${r.w}: presence panel overlaps minimap`);
  if (!r.closed.phoneVisible) bad.push(`${r.w}: phone not visible with minimap closed`);
  if (!r.closed.mmHidden) bad.push(`${r.w}: minimap still visible when closed`);
  if (r.errs.length) bad.push(`${r.w}: page errors ${r.errs.join('; ')}`);
}
console.log(bad.length ? 'FAIL:\n' + bad.join('\n') : 'dup-fix checks: OK');
if (bad.length) process.exitCode = 1;
