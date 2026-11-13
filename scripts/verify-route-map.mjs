// [route-map v1 + landscape] ui-v2 역 선택 노선도 실화면 검증.
//   - desktop 1440×1080: 모달(시안 v1) — 이름표↔이름표·노선·점·지시선·랜드마크 칩·선택 바 겹침 0
//   - 폰 가로 844×390 · 740×360 · 932×430 (dpr 3): 전체 화면 가로 노선도(routeMapLand.js) — 겹침 0, 선택 바·입장 버튼·닫기 버튼이
//     화면 안에 다 보임(페이지·옆 칸 스크롤 없이), 이름표 글자 ≥ 11px, 칩을 누르면 선택만 바뀜(입장 안 함)
//   - 콘솔 오류 0, 스크린샷 + verify-report.json
//   vite dev 서버에서 돌린다(검사 함수 src/ui-v2/routeMap.js 를 페이지에서 import):
//   npx vite --port 5201 --strictPort & BASE=http://localhost:5201/ OUT=artifacts/landscape node scripts/verify-route-map.mjs
//   ONLY=land-844x390 처럼 한 경우만 돌릴 수 있다.
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = (process.env.BASE || 'http://127.0.0.1:5199/').replace(/\/?$/, '/');
const OUT = process.env.OUT || '.';
const LANG = process.env.LANG_MODE || 'ko';
const CHROME = process.env.CHROME || (fs.existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : '/usr/bin/google-chrome');
const OFF = `lang=${LANG}&noticePopup=0&bp24poster=0&bgm=0&ws=mock&bus=sim&weather=clear&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&controlscard=0&hour=21&evening=1`;
const SFX = LANG === 'ko' ? '' : '-' + LANG;
fs.mkdirSync(OUT, { recursive: true });

const CASES = [
  ['desktop', { width: 1440, height: 1080 }, 2],
  ['land-844x390', { width: 844, height: 390 }, 3],
  ['land-740x360', { width: 740, height: 360 }, 3],
  ['land-932x430', { width: 932, height: 430 }, 3],
].filter(([n]) => !process.env.ONLY || process.env.ONLY.split(',').includes(n));

// 데스크톱 모달 검사 (route-map v1 그대로)
const auditDesktop = () => {
  return import('/src/ui-v2/routeMap.js').then(({ auditRouteMap }) => {
    const picker = document.querySelector('.v2-picker');
    const map = picker.querySelector('.v2-map'), m = map.__rm;
    const mr = map.getBoundingClientRect();
    const rel = (r) => ({ l: r.left - mr.left, r: r.right - mr.left, t: r.top - mr.top, b: r.bottom - mr.top });
    const boxes = new Map([...map.querySelectorAll('[data-stn]')].map((e) => [e.dataset.stn, rel(e.getBoundingClientRect())]));
    const lms = [...picker.querySelectorAll('.v2-band .v2-lm')];
    const extra = lms.map((e) => ({ n: 'lm-' + e.dataset.v2At, ...rel(e.getBoundingClientRect()), hit: m.mobile }));
    const audit = auditRouteMap(m, { boxes, extra });
    const issues = [...audit.issues];
    const band = picker.querySelector('.v2-band').getBoundingClientRect();
    if (lms.length === 2) {
      const [a, b] = lms.map((e) => e.getBoundingClientRect());
      if (b.left - a.right < 12 - 0.5) issues.push(`LMGAP ${Math.round(b.left - a.right)}`);
    }
    for (const e of lms) { const r = e.getBoundingClientRect(); if (r.top < band.top || r.bottom > band.bottom || r.right > band.right - 4 || r.left < band.left) issues.push('LMOUT ' + e.dataset.v2At); }
    const p = picker.getBoundingClientRect();
    const sel = picker.querySelector('.v2-sel').getBoundingClientRect();
    if (sel.bottom > innerHeight + 0.5 || sel.right > innerWidth + 0.5) issues.push('SELBAR off-screen');
    for (const e of picker.querySelectorAll('.v2-stn, .v2-lm')) { const r = e.getBoundingClientRect(); if (r.left < p.left + 4 || r.right > p.right - 4) issues.push('PANEL-X ' + (e.dataset.stn || e.dataset.v2At)); }
    const stn = [...map.querySelectorAll('.v2-stn')];
    return {
      issues, maxLeader: audit.maxLeader, land: picker.classList.contains('is-land'), compact: picker.classList.contains('is-compact'),
      mapW: Math.round(mr.width), mapH: Math.round(mr.height), legend: [...picker.querySelectorAll('.v2-legend .v2-lg')].map((e) => e.textContent.trim()),
      labels: stn.length, startable: stn.filter((e) => e.tagName === 'BUTTON').length,
      sel: picker.querySelector('.v2-sel b')?.textContent, enterAt: picker.querySelector('.v2-sel .v2-btn')?.dataset.v2At,
    };
  });
};

// 폰 가로 전체 화면 검사
const auditLand = () => {
  return import('/src/ui-v2/routeMap.js').then(({ auditRouteMap }) => {
    const picker = document.querySelector('.v2-picker');
    const map = picker.querySelector('.v2-lmap'), m = map?.__rm;
    if (!map || !m) return { issues: ['NO LAND MAP'], land: picker.classList.contains('is-land') };
    const mr = map.getBoundingClientRect();
    const rel = (r) => ({ l: r.left - mr.left, r: r.right - mr.left, t: r.top - mr.top, b: r.bottom - mr.top });
    const boxes = new Map([...map.querySelectorAll('[data-stn]')].map((e) => [e.dataset.stn, rel(e.getBoundingClientRect())]));
    const audit = auditRouteMap(m, { boxes });
    const issues = [...audit.issues];
    const vw = innerWidth, vh = innerHeight;
    const R = (sel) => picker.querySelector(sel)?.getBoundingClientRect();
    const onScreen = (n, r) => { if (!r) issues.push(`MISSING ${n}`); else if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5 || r.width < 1) issues.push(`OFFSCREEN ${n}`); };
    const btn = R('.v2-sel .v2-btn'), selbar = R('.v2-sel'), close = R('.v2-close'), side = R('.v2-lside');
    onScreen('selbar', selbar); onScreen('enter', btn); onScreen('close', close);
    for (const e of picker.querySelectorAll('.v2-lm')) onScreen('lm-' + (e.dataset.pick || e.dataset.v2At), e.getBoundingClientRect());
    // 스크롤 없이: 문서·옆 칸 모두 넘침 0
    const se = document.scrollingElement;
    if (se.scrollHeight > vh + 1 || se.scrollWidth > vw + 1) issues.push(`PAGE-SCROLL ${se.scrollWidth}x${se.scrollHeight}`);
    const sideEl = picker.querySelector('.v2-lside');
    if (sideEl.scrollHeight > sideEl.clientHeight + 1) issues.push(`SIDE-SCROLL ${sideEl.scrollHeight - sideEl.clientHeight}`);
    // 이름표가 지도 칸 안 · 옆 칸과 안 겹침, 글자 크기
    let minFont = 99, minStartFont = 99, minHitH = 99, minHitW = 99;
    for (const e of map.querySelectorAll('.v2-stn')) {
      const r = e.getBoundingClientRect();
      if (r.left < mr.left + 1 || r.right > mr.right - 1 || r.top < mr.top + 1 || r.bottom > mr.bottom - 1) issues.push('MAP-OUT ' + e.dataset.stn);
      if (side && r.right > side.left) issues.push('SIDE× ' + e.dataset.stn);
      const fs = parseFloat(getComputedStyle(e.querySelector('b')).fontSize);
      minFont = Math.min(minFont, fs);
      if (e.tagName === 'BUTTON') {
        minStartFont = Math.min(minStartFont, fs);
        const hb = getComputedStyle(e, '::before');
        const ext = (parseFloat(hb.top) < 0 ? -parseFloat(hb.top) : 0) + (parseFloat(hb.bottom) < 0 ? -parseFloat(hb.bottom) : 0);
        minHitH = Math.min(minHitH, r.height + ext); minHitW = Math.min(minHitW, r.width);
      }
    }
    if (minFont < 11) issues.push(`FONT ${minFont}`);
    if (minStartFont < 12) issues.push(`FONT-START ${minStartFont}`);
    const stn = [...map.querySelectorAll('.v2-stn')];
    return {
      issues, land: picker.classList.contains('is-land'), compact: picker.classList.contains('is-compact'),
      mapW: Math.round(mr.width), mapH: Math.round(mr.height), minHitSpacing: m.M.minHit,
      labels: stn.length, startable: stn.filter((e) => e.tagName === 'BUTTON').length,
      minFont, minStartFont, minHitH: Math.round(minHitH), minHitW: Math.round(minHitW),
      enterBtn: btn && [btn.left, btn.top, btn.right, btn.bottom].map(Math.round), enterH: btn && Math.round(btn.height),
      close: close && [Math.round(close.width), Math.round(close.height)],
      topbarVisible: !!document.querySelector('#v2-top') && getComputedStyle(document.querySelector('#v2-top')).display !== 'none',
      sel: picker.querySelector('.v2-sel b')?.textContent, enterAt: picker.querySelector('.v2-sel .v2-btn')?.dataset.v2At,
    };
  });
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'] });
const report = {};
let failed = false;
try {
  for (const [mode, vp, dpr] of CASES) {
    const land = mode.startsWith('land');
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    const logs = [];
    const gpuNoise = [];
    // swiftshader(소프트웨어 GL) 드라이버의 성능 안내('GPU stall due to ReadPixels')는 앱 경고가 아니라 따로 센다
    page.on('console', (m) => { if (m.type() !== 'error' && m.type() !== 'warning') return; const t = `${m.type()}: ${m.text()}`; (/GL Driver Message/.test(t) ? gpuNoise : logs).push(t); });
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    await page.goto(`${B}?${OFF}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('#bw-launch-notice [data-close]')?.click());
    await page.waitForSelector('[data-v2="guest"]', { timeout: 180000 });
    await page.locator('[data-v2="guest"]').click({ force: true, timeout: 60000 });
    await page.waitForSelector('.v2-world button[data-corridor-open]', { timeout: 60000 });
    await page.click('.v2-world button[data-corridor-open]', { force: true });
    await page.waitForSelector('.v2-picker svg polyline', { timeout: 30000 });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(1200); // 지구본 확대 애니메이션·폰트 반영 뒤
    const audit = () => page.evaluate(land ? auditLand : auditDesktop);
    const res = await audit();
    if (res.land !== land) res.issues.push(`MODE land=${res.land}`);
    const shot = `${OUT}/verify-${mode}${SFX}.png`;
    await page.screenshot({ path: shot });
    // 다른 역 선택 — 데스크톱은 가리키기(hover), 폰 가로는 실제 탭(클릭): 선택만 바뀌고 입장하지 않아야 한다
    if (land) {
      await page.locator('.v2-picker [data-stn="jangji"]').click({ timeout: 10000 });
    } else {
      await page.evaluate(() => document.querySelector('.v2-picker [data-stn="jangji"]')?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));
    }
    await page.waitForTimeout(250);
    const res2 = await audit();
    if (res2.enterAt !== 'jangji') res2.issues.push(`SELECT jangji → ${res2.enterAt}`);
    if (land && !(await page.locator('.v2-picker.is-land').isVisible())) res2.issues.push('ENTERED on chip tap');
    res.selectedJangji = { issues: res2.issues, sel: res2.sel, enterAt: res2.enterAt };
    if (land) await page.screenshot({ path: `${OUT}/verify-${mode}-jangji${SFX}.png` });
    res.console = logs; res.gpuDriverNotices = gpuNoise.length;
    report[mode] = res;
    console.log(mode, JSON.stringify(res, null, 1));
    if (res.issues.length || res2.issues.length || logs.length) failed = true;
    await ctx.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(`${OUT}/verify-report${SFX}.json`, JSON.stringify(report, null, 1));
if (failed) { console.error('route map verify FAILED'); process.exit(1); }
console.log('route map verify OK');
