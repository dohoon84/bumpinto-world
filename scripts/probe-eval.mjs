// node scripts/probe-eval.mjs PORT 'async () => {...}'  — 성수 로드 후 페이지에서 함수 실행, JSON 출력
import { chromium } from 'playwright';
const [PORT = '5311', SRC] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 500 } })).newPage();
await page.goto(`http://localhost:${PORT}/?ws=mock&at=seongsu&hour=14&shot=1&noticePopup=0&controlscard=0&bgm=0&subwayVoice=0&subwayRt=0`, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.seongsu?.ready, null, { timeout: 300000 });
await page.evaluate(() => window.__jj.corridor.ensureNear?.(-3900, -18200, { urgent: true }));
await page.waitForFunction(() => window.__jj?.hangang?.ready, null, { timeout: 300000 }); // 한강(합수부) 땅까지 지은 뒤
await page.evaluate(async () => { const J = window.__jj; await J.corridor.ensureNear?.(-3900, -18100, { urgent: true }); });
console.log(JSON.stringify(await page.evaluate(`(${SRC})()`), null, 0));
await browser.close();
