// [econ-ui] 상점(11) 썸네일을 게임 탈것 모델로 오프라인 렌더 → src/ui-v2/econ-ui/assets/shop/<id>.webp
//   사용: npx vite --port 5611 (다른 창) 후 `node scripts/render-shop-thumbs.mjs [http://127.0.0.1:5611]`
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:5611';
const OUT = new URL('../src/ui-v2/econ-ui/assets/shop/', import.meta.url);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`${BASE}/scripts/shop-thumbs/index.html`);
await page.waitForFunction(() => window.__thumbs || window.__thumbsErr, null, { timeout: 120000 });
const err = await page.evaluate(() => window.__thumbsErr);
if (err) { console.error(err); process.exit(1); }
const thumbs = await page.evaluate(() => window.__thumbs);
for (const [id, url] of Object.entries(thumbs)) {
  const buf = Buffer.from(url.split(',')[1], 'base64');
  writeFileSync(new URL(`${id}.webp`, OUT), buf); console.log(id, buf.length, 'bytes');
}
await browser.close();
