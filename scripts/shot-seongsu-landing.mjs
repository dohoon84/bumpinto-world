// [seongsu] 랜딩(시작화면·월드 선택·역 선택 노선도)에 성수동이 보이는지 스크린샷. node scripts/shot-seongsu-landing.mjs <port> [outDir]
import fs from 'node:fs';
import { chromium } from 'playwright';
const [PORT = '5311', OUT = '/workspace/seongsu/landing'] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const info = {};
async function run(W, H, mobile) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${W}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${W}] ${m.text()}`); });
  await page.goto(`http://localhost:${PORT}/?ws=mock&noticePopup=0&controlscard=0&bgm=0${mobile ? '&mobile=1' : ''}`, { timeout: 180000 });
  await page.waitForTimeout(12000);
  const tag = `${W}x${H}`;
  await page.screenshot({ path: `${OUT}/${tag}-1-start.png` });
  const clickSel = async (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (e) { e.click(); return true; } return false; }, sel);
  if (!mobile) {
    info.guest = await clickSel('[data-v2="guest"]'); await page.waitForTimeout(5000);
    const card = await page.evaluate(() => { const b = document.querySelector('[data-enter-at="seongsu"]'); const c = b?.closest('.v2-rcard') || b; c?.scrollIntoView({ block: 'center' }); if (c) c.style.outline = '3px solid #33a23d'; return c ? c.textContent.replace(/\s+/g, ' ').trim() : null; });
    info.worldCard = card; await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${tag}-2-world-select.png` });
    info.openMap = await clickSel('[data-corridor-open]'); await page.waitForTimeout(6000);
    const chip = await page.evaluate(() => { const c = document.querySelector('.v2-lm.is-ss'); if (!c) return null; c.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); c.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true })); return c.textContent.replace(/\s+/g, ' ').trim(); });
    info.routeChip = chip; await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${tag}-3-route-map.png` });
  } else {
    const lst = await page.evaluate(() => [...document.querySelectorAll('[data-stn="seongsu"]')].map((e) => e.className + ' | ' + e.textContent.replace(/\s+/g, ' ').trim()));
    info.mobileStart = lst;
    // 시작 → 지역/역 고르기 화면으로 (버튼 이름은 화면마다 달라서 'pick' 계열을 차례로 눌러 본다)
    for (const s of ['[data-act="pick"]', '[data-act="start"]', '[data-act="guest"]', '[data-act="enter"]']) { if (await clickSel(s)) { await page.waitForTimeout(3000); if (await page.$('[data-stn="seongsu"]')) break; } }
    info.mobilePick = await page.evaluate(() => { const e = document.querySelector('[data-stn="seongsu"]'); if (!e) return null; e.click(); return e.textContent.replace(/\s+/g, ' ').trim(); });
    await page.waitForTimeout(1500);
    info.mobileSel = await page.evaluate(() => document.querySelector('.m-rm-sel, .m-picked, [data-act="go"]')?.textContent.replace(/\s+/g, ' ').trim() || null);
    await page.screenshot({ path: `${OUT}/${tag}-2-pick-seongsu.png` });
  }
  await ctx.close();
}
await run(1280, 800, false);
await run(844, 390, true);
await browser.close();
console.log(JSON.stringify(info, null, 1));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'console errors: 0');
fs.writeFileSync(`${OUT}/_run.json`, JSON.stringify({ info, errors }, null, 1));
