import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://127.0.0.1:5611/';
const OUT = '/workspace/bw-snowpile-shots';
fs.mkdirSync(OUT, { recursive: true });

const common = 'shot=1&corridor=0&npc=0&ui=v1&hour=14';
const shots = [
  { name: '00-default', qs: common, note: 'no snowpile param' },
  { name: '01-snow-pile0', qs: common + '&weather=snow&snowpile=0', note: 'particles only' },
  { name: '02-snow-pile05', qs: common + '&weather=snow&snowpile=0.5', note: 'force 0.5' },
  { name: '03-snow-pile1', qs: common + '&weather=snow&snowpile=full', note: 'force 1 (full)' },
  { name: '04-snow-pile1-night', qs: 'shot=1&corridor=0&npc=0&ui=v1&weather=snow&snowpile=full&evening=1', note: 'night full' },
  { name: '05-snow-pile-ramp', qs: common + '&weather=snow&snowpile=1', note: 'ramp mode, wait' },
];

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

async function ready(page) {
  await page.waitForFunction(() => window.__jj?.ready === true, null, { timeout: 120000 });
  await page.evaluate(() => {
    document.body.classList.remove('in-gate', 'in-lobby');
  });
  await page.waitForTimeout(600);
}

async function framePlaza(page, { waitRamp = false } = {}) {
  await page.evaluate(() => {
    const j = window.__jj;
    j.teleport(-62, 38);
    j.setMode('follow');
    j.cam.yaw = Math.PI * 1.05;
    j.cam.pitch = 0.42;
    j.cam.dist = 48;
  });
  if (waitRamp) {
    await page.waitForFunction(() => (window.__jj?.snowPile?.amount || 0) >= 0.95, null, { timeout: 10000 }).catch(async () => {
      await page.evaluate(() => window.__jj?.snowPile?.setAmount?.(1));
    });
  }
  await page.waitForTimeout(1000);
}

for (const s of shots) {
  const url = BASE + '?' + s.qs;
  console.log('SHOT', s.name, s.note, url);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(120000);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await ready(page);
  const info = await page.evaluate(() => {
    const s = window.__jj?.snowPile;
    const g = window.__jj?.world?.ground?.material?.color;
    return {
      hasHook: !!s,
      kind: window.__jj?.weather?.state?.kind,
      snowEnabled: !!s?.enabled,
      amount: s?.amount ?? null,
      nMats: s?.entries?.length ?? 0,
      kinds: s?.entries ? [...new Set(s.entries.map((e) => e.kind))] : [],
      groundHex: g ? '#' + g.getHexString() : null,
      skipped: s?.skipped || null,
    };
  });
  console.log('  state', info);
  await framePlaza(page, { waitRamp: s.name.includes('ramp') || s.name.includes('pile1') });
  const info2 = await page.evaluate(() => {
    const g = window.__jj?.world?.ground?.material?.color;
    return {
      amount: window.__jj?.snowPile?.amount ?? null,
      groundHex: g ? '#' + g.getHexString() : null,
      part: window.__jj?.weather?.state?.part,
    };
  });
  console.log('  after', info2);
  await page.screenshot({ path: path.join(OUT, s.name + '.png'), type: 'png' });
  await page.close();
}

await browser.close();
console.log('done');
