import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BASE = 'http://127.0.0.1:5611/';
const OUT = '/workspace/bw-snowpile-shots';
fs.mkdirSync(OUT, { recursive: true });

const common = 'shot=1&corridor=0&npc=0&ui=v1&hour=14';
const shots = [
  { name: 'v2-00-default', qs: common, note: 'no snowpile' },
  { name: 'v2-01-full-day', qs: common + '&weather=snow&snowpile=full', note: 'full day' },
  { name: 'v2-02-half', qs: common + '&weather=snow&snowpile=0.5', note: '0.5' },
  { name: 'v2-03-full-night', qs: 'shot=1&corridor=0&npc=0&ui=v1&weather=snow&snowpile=full&evening=1', note: 'night' },
  { name: 'v2-04-trees-close', qs: common + '&weather=snow&snowpile=full', note: 'trees close', close: true },
];

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

async function ready(page) {
  await page.waitForFunction(() => window.__jj?.ready === true, null, { timeout: 120000 });
  await page.evaluate(() => {
    document.body.classList.remove('in-gate', 'in-lobby');
    const ov = document.getElementById('overlay');
    if (ov) ov.style.display = 'none';
  });
  await page.waitForTimeout(800);
}

async function frame(page, { close = false } = {}) {
  await page.evaluate(({ close }) => {
    const j = window.__jj;
    if (close) {
      j.teleport(-70, 30);
      j.setMode('follow');
      j.cam.yaw = Math.PI * 0.95;
      j.cam.pitch = 0.28;
      j.cam.dist = 18;
    } else {
      j.teleport(-74, 25);
      j.setMode('follow');
      j.cam.yaw = Math.PI * 1.05;
      j.cam.pitch = 0.42;
      j.cam.dist = 48;
    }
  }, { close });
  await page.waitForTimeout(1200);
}

async function attachErr(page) {
  await page.addInitScript(() => {
    window.__shotErrs = [];
    const orig = console.error;
    console.error = (...a) => {
      window.__shotErrs.push(String(a[0]).slice(0, 220));
      orig.apply(console, a);
    };
  });
  page.on('pageerror', (e) => console.log('PAGEERR', e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('CONERR', msg.text().slice(0, 200));
  });
}

async function metrics(page) {
  return page.evaluate(() => {
    const j = window.__jj;
    const info = j.renderer?.info;
    const s = j.snowPile;
    const modes = {};
    for (const e of (s?.entries || [])) modes[e.mode] = (modes[e.mode] || 0) + 1;
    return {
      snowEnabled: !!s?.enabled,
      amount: s?.amount ?? null,
      patched: s?.patched ?? 0,
      flakeCount: s?.flakeCount ?? 0,
      modes,
      softSnow: !!j.weather?.state?.softSnow,
      kind: j.weather?.state?.kind,
      evening: !!j.weather?.state?.evening,
      drawCalls: info?.render?.calls ?? null,
      triangles: info?.render?.triangles ?? null,
      programs: info?.programs?.length ?? null,
      consoleErrors: window.__shotErrs || [],
    };
  });
}

const results = [];
for (const s of shots) {
  console.log('SHOT', s.name, s.note);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(120000);
  await attachErr(page);
  await page.goto(BASE + '?' + s.qs, { waitUntil: 'domcontentloaded' });
  await ready(page);
  const pre = await page.evaluate(() => {
    const s = window.__jj?.snowPile;
    const inst = s?.install?.();
    return { amount: s?.amount, patched: s?.patched, inst, enabled: s?.enabled };
  });
  console.log('  pre', pre);
  await frame(page, { close: !!s.close });
  await page.evaluate(async () => {
    const j = window.__jj;
    for (let i = 0; i < 10; i++) {
      j.renderer.render(j.player.parent, j.camera);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  const m = await metrics(page);
  console.log('  metrics', JSON.stringify(m));
  results.push({ name: s.name, ...m });
  await page.screenshot({ path: path.join(OUT, s.name + '.png'), type: 'png' });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await attachErr(page);
  await page.goto(BASE + '?' + common, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await frame(page);
  await page.evaluate(async () => {
    const j = window.__jj;
    for (let i = 0; i < 6; i++) {
      j.renderer.render(j.player.parent, j.camera);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  const base = await page.evaluate(() => {
    const info = window.__jj.renderer.info;
    return { calls: info.render.calls, programs: info.programs?.length };
  });
  await page.close();

  const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await attachErr(page2);
  await page2.goto(BASE + '?' + common + '&weather=snow&snowpile=full', { waitUntil: 'domcontentloaded' });
  await ready(page2);
  await frame(page2);
  await page2.evaluate(async () => {
    const j = window.__jj;
    j.snowPile?.install?.();
    for (let i = 0; i < 10; i++) {
      j.renderer.render(j.player.parent, j.camera);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  const full = await page2.evaluate(() => {
    const info = window.__jj.renderer.info;
    const s = window.__jj.snowPile;
    const modes = {};
    for (const e of (s?.entries || [])) modes[e.mode] = (modes[e.mode] || 0) + 1;
    return {
      calls: info.render.calls,
      programs: info.programs?.length,
      patched: s?.patched,
      flakeCount: s?.flakeCount,
      modes,
    };
  });
  console.log('DELTA base', base, 'full', full);
  fs.writeFileSync(path.join(OUT, 'v2-metrics.json'), JSON.stringify({ base, full, results }, null, 2));
  await page2.close();
}

await browser.close();

execSync(`python3 - <<'PY'
from PIL import Image, ImageDraw
import os
OUT = ${JSON.stringify(OUT)}
files = [
  ('v2-00-default.png', 'default (no ?snowpile)'),
  ('v2-01-full-day.png', 'snowpile=full day'),
  ('v2-02-half.png', 'snowpile=0.5'),
  ('v2-03-full-night.png', 'evening+full'),
]
imgs = []
for f, lab in files:
  im = Image.open(os.path.join(OUT, f)).convert('RGB').resize((640, 360))
  canvas = Image.new('RGB', (640, 390), (30, 30, 30))
  canvas.paste(im, (0, 30))
  d = ImageDraw.Draw(canvas)
  d.text((8, 6), lab, fill=(240, 240, 240))
  imgs.append(canvas)
row1 = Image.new('RGB', (1280, 390)); row1.paste(imgs[0], (0, 0)); row1.paste(imgs[1], (640, 0))
row2 = Image.new('RGB', (1280, 390)); row2.paste(imgs[2], (0, 0)); row2.paste(imgs[3], (640, 0))
out = Image.new('RGB', (1280, 780)); out.paste(row1, (0, 0)); out.paste(row2, (0, 390))
out.save(os.path.join(OUT, 'v2-compare.jpg'), quality=88)
print('compare ok')
PY`);
console.log('done');
