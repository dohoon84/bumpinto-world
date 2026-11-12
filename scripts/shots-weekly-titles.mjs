// node scripts/shots-weekly-titles.mjs — 머리 위 칭호 미리보기 스크린샷 (데스크톱·모바일, 낮·밤, 획득 연출)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:13721';
const OUT = process.env.OUT || '/workspace/bw-weekly-titles/artifacts/weekly-titles';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader-webgl',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-dev-shm-usage',
  ],
});

const errors = [];
async function openPage({ mobile = false, hour = 14, preview = 1, earn = 0, extra = '' } = {}) {
  const viewport = mobile
    ? { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { width: 1280, height: 800, deviceScaleFactor: 1 };
  const context = await browser.newContext({ viewport, ...(!mobile ? {} : { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }) });
  const page = await context.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
  const q = new URLSearchParams({
    shot: '1',
    titlePreview: String(preview),
    titleEarn: String(earn),
    hour: String(hour),
    npcs: '0',
    ws: 'off',
  });
  const url = `${ORIGIN}/?${q}${extra}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready && window.__jj?.titles?.ready, null, { timeout: 180000 });
  await page.waitForTimeout(hour >= 20 ? 2500 : 1200);
  // 카메라를 내 아바타 머리 가까이
  await page.evaluate(() => {
    const p = __jj.player.position;
    __jj.setMode?.('follow');
    if (__jj.cam) { __jj.cam.mode = 'follow'; __jj.cam.yaw = 0.35; __jj.cam.pitch = -0.22; __jj.cam.dist = 4.2; }
    const y = __jj.terrain ? __jj.terrain.getGroundHeight(p.x, p.z, 0) : p.y;
    __jj.teleport(p.x, p.z, y);
  });
  await page.waitForTimeout(600);
  return { page, context };
}

async function shot(name, opts) {
  const { page, context } = await openPage(opts);
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, type: 'png' });
  const stats = await page.evaluate(() => {
    const info = __jj.renderer?.info;
    const t = __jj.titles?.stats;
    return {
      draws: info?.render?.calls,
      tris: info?.render?.triangles,
      titleDraws: t?.draws,
      titleQuads: t?.quads,
      titleTris: t?.tris,
    };
  });
  console.log('ok', name, stats);
  await context.close();
  return stats;
}

async function shotFrames(name, opts, times) {
  const { page, context } = await openPage({ ...opts, earn: 0 });
  await page.evaluate((rank) => {
    const id = { 1: 'title_bigspender', 2: 'title_flexregular', 3: 'title_bogohunter' }[rank] || 'title_bigspender';
    __jj.titles.playEarn(id);
  }, opts.preview || 1);
  const framePaths = [];
  let last = 0;
  for (const ms of times) {
    await page.waitForTimeout(ms - last);
    last = ms;
    const path = `${OUT}/${name}-t${String(ms).padStart(4, '0')}.png`;
    await page.screenshot({ path, type: 'png' });
    framePaths.push(path);
    console.log('ok frame', path);
  }
  await context.close();
  return framePaths;
}

const base = {};
const dayDesk = await shot('title-desktop-day', { hour: 14, preview: 1, earn: 0 });
const nightDesk = await shot('title-desktop-night', { hour: 21, preview: 1, earn: 0 });
const dayMob = await shot('title-mobile-day', { mobile: true, hour: 14, preview: 1, earn: 0 });
const nightMob = await shot('title-mobile-night', { mobile: true, hour: 21, preview: 1, earn: 0 });
await shot('title-desktop-r2-day', { hour: 14, preview: 2, earn: 0 });
await shot('title-desktop-r3-day', { hour: 14, preview: 3, earn: 0 });
await shotFrames('title-acquire', { hour: 14, preview: 1 }, [200, 500, 850, 1100, 1400, 2000, 2800]);

await browser.close();
const uniqErr = [...new Set(errors)];
console.log(JSON.stringify({ dayDesk, nightDesk, dayMob, nightMob, errors: uniqErr }, null, 2));
if (uniqErr.length) process.exit(2);
