// [seongsu-v2] 성수 ↔ 한강(합수부 2구간) 경계 높이·다리 끝 조사 (headless). node scripts/probe-seam.mjs <port>
import fs from 'node:fs';
import { chromium } from 'playwright';
const [PORT = '5311'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
await page.goto(`http://localhost:${PORT}/?ws=mock&at=seongsu&hour=14&shot=1&noticePopup=0&controlscard=0&bgm=0`, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.evaluate((a) => { window.__AXES = a; }, JSON.parse(fs.readFileSync('/tmp/probe/axes.json', 'utf8')));
const out = await page.evaluate(async () => {
  const J = window.__jj, C = J.corridor;
  const r = {};
  for (const [x, z] of [[-4500, -18400], [-6450, -18500], [-3850, -18200]]) { await C.preload?.(x, z); J.teleport(x, z); await new Promise((ok) => setTimeout(ok, 15000)); }
  const hg = C.hangang; r.hgReady = !!hg?.ready; r.keys = hg ? Object.keys(hg).slice(0, 60) : null;
  r.rows = [];
  for (const [name, axis] of Object.entries(window.__AXES)) for (const [x, z] of axis) r.rows.push([name, x, z, hg?.owns?.(x, z) ? 1 : 0, +(hg?.surfaceY?.(x, z, 200) ?? NaN).toFixed?.(1), +(hg?.heightAt?.(x, z) ?? NaN).toFixed?.(1)]);
  return r;
});
console.log(JSON.stringify({ ready: out.hgReady, keys: out.keys }));
for (const row of out.rows) console.log(row.join('\t'));
await page.screenshot({ path: '/tmp/probe/seam.png' });
await browser.close();
