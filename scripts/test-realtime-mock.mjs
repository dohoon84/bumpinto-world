// 실시간 모드 스텁 확인: npm run mock-bus-proxy (다른 터미널) + npm run preview 후 실행
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4173/?shot=1&bus=realtime&proxy=http://localhost:8799');
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 120000 });
await page.evaluate(() => { const s = __jj.transit.stops.find((s) => s.ref.startsWith('07624')); __jj.setMode('follow'); __jj.teleport(s._pos.x - s.tr[0] * 3, s._pos.z - s.tr[1] * 3); });
await page.waitForTimeout(4000);
console.log(await page.evaluate(() => document.getElementById('stop-panel').innerText.replace(/\n/g, ' | ')));
await browser.close();
