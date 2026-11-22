// [seongsu-v3] 성수 땅 남쪽 끝(A.z1) ↔ 합수부(2구간) 땅 사이 틈: x 25m마다 남쪽으로 2구간 높이 조사 → /tmp/probe/edge.json
import fs from 'node:fs';
import { chromium } from 'playwright';
const [PORT = '5311'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
await page.goto(`http://localhost:${PORT}/?ws=mock&at=seongsu&hour=14&shot=1&noticePopup=0&controlscard=0&bgm=0`, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  const J = window.__jj, C = J.corridor;
  for (const [x, z] of [[-4500, -18400], [-6450, -18500], [-3850, -18200]]) { await C.preload?.(x, z); J.teleport(x, z); await new Promise((ok) => setTimeout(ok, 12000)); }
  const hg = C.hangang, S = J.seongsu, rows = [];
  const A = S.bounds; // B (bounds) — apron 은 seongsuFlags
  for (let x = -6830; x <= -3360; x += 25) {
    const row = { x, s: [] };
    for (let z = -18700; z <= -18540; z += 5) { const own = hg?.owns?.(x, z) ? 1 : 0; const h = hg?.heightAt?.(x, z); const sy = hg?.surfaceY?.(x, z, 200); row.s.push([z, own, h == null ? null : +h.toFixed(2), sy == null ? null : +sy.toFixed(2)]); }
    rows.push(row);
  }
  return { ready: !!hg?.ready, A, rows };
});
fs.mkdirSync('/tmp/probe', { recursive: true });
fs.writeFileSync('/tmp/probe/edge.json', JSON.stringify(out));
console.log('ready', out.ready, out.rows.length);
await browser.close();
