// [route-map v1] ui-v2 역 선택 노선도 실화면 검증: 데스크톱 1440×1080 · 좁은 화면 390×844 에서 모달을 열고
//   실측 DOM 으로 이름표↔이름표·노선·점·지시선·랜드마크 칩·선택 바 겹침 0, 콘솔 오류 0 을 확인하고 스크린샷을 남긴다.
//   vite dev 서버에서 돌린다(검사 함수 src/ui-v2/routeMap.js 를 페이지에서 import):
//   npx vite --port 5199 & BASE=http://127.0.0.1:5199/ OUT=. node scripts/verify-route-map.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = (process.env.BASE || 'http://127.0.0.1:5199/').replace(/\/?$/, '/');
const OUT = process.env.OUT || '.';
const LANG = process.env.LANG_MODE || 'ko';
const CHROME = process.env.CHROME || (fs.existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : '/usr/bin/google-chrome');
const OFF = `lang=${LANG}&noticePopup=0&bp24poster=0&bgm=0&ws=mock&bus=sim&weather=clear&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&controlscard=0&hour=21&evening=1`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'] });
const report = {};
let failed = false;
try {
  for (const [mode, vp, dpr] of [['desktop', { width: 1440, height: 1080 }, 2], ['mobile', { width: 390, height: 844 }, 3]]) {
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
    await page.waitForSelector('.v2-picker .v2-map svg polyline', { timeout: 30000 });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(1200); // 지구본 확대 애니메이션·폰트 반영 뒤
    const audit = () => page.evaluate(async () => {
      const { auditRouteMap } = await import('/src/ui-v2/routeMap.js');
      const picker = document.querySelector('.v2-picker');
      const map = picker.querySelector('.v2-map'), m = map.__rm;
      const mr = map.getBoundingClientRect();
      const rel = (r) => ({ l: r.left - mr.left, r: r.right - mr.left, t: r.top - mr.top, b: r.bottom - mr.top });
      const boxes = new Map([...map.querySelectorAll('[data-stn]')].map((e) => [e.dataset.stn, rel(e.getBoundingClientRect())]));
      const lms = [...picker.querySelectorAll('.v2-band .v2-lm')];
      const extra = lms.map((e) => ({ n: 'lm-' + e.dataset.v2At, ...rel(e.getBoundingClientRect()), hit: m.mobile }));
      const audit = auditRouteMap(m, { boxes, extra });
      const issues = [...audit.issues];
      // 랜드마크 칩 간격 12px 이상, 띠 안
      const band = picker.querySelector('.v2-band').getBoundingClientRect();
      if (lms.length === 2) {
        const [a, b] = lms.map((e) => e.getBoundingClientRect());
        if (b.left - a.right < 12 - 0.5) issues.push(`LMGAP ${Math.round(b.left - a.right)}`);
      }
      for (const e of lms) { const r = e.getBoundingClientRect(); if (r.top < band.top || r.bottom > band.bottom || r.right > band.right - 4 || r.left < band.left) issues.push('LMOUT ' + e.dataset.v2At); }
      // 패널 밖·선택 바 아래로 넘치는 요소
      const p = picker.getBoundingClientRect(), wrap = picker.querySelector('.v2-mapwrap').getBoundingClientRect();
      const sel = picker.querySelector('.v2-sel').getBoundingClientRect();
      if (wrap.bottom > sel.top + 0.5 && m.mobile) issues.push('MAP under SELBAR');
      if (sel.bottom > innerHeight + 0.5 || sel.right > innerWidth + 0.5) issues.push('SELBAR off-screen');
      for (const e of picker.querySelectorAll('.v2-stn, .v2-lm')) { const r = e.getBoundingClientRect(); if (r.left < p.left + 4 || r.right > p.right - 4) issues.push('PANEL-X ' + (e.dataset.stn || e.dataset.v2At)); }
      const scrollable = wrap.height + 1 < picker.querySelector('.v2-mapwrap').scrollHeight;
      const scrollDeficit = Math.round(picker.querySelector('.v2-mapwrap').scrollHeight - picker.querySelector('.v2-mapwrap').clientHeight);
      // 노선 색: 장지–복정 = 8호선 분홍
      const pl = [...map.querySelectorAll('svg polyline')].map((e) => ({ c: e.getAttribute('stroke'), w: +e.getAttribute('stroke-width') }));
      const l8 = m.lines.find((l) => l.key === '8호선');
      const legend = [...picker.querySelectorAll('.v2-legend .v2-lg')].map((e) => e.textContent.trim());
      const stn = [...map.querySelectorAll('.v2-stn')];
      return {
        issues, maxLeader: audit.maxLeader,
        compact: picker.classList.contains('is-compact'),
        mapW: Math.round(mr.width), mapH: Math.round(mr.height), scrollable, scrollDeficit,
        l8: l8.ids, lines: pl, legend,
        labels: stn.length, startable: stn.filter((e) => e.tagName === 'BUTTON').length,
        minLabelH: Math.min(...stn.filter((e) => e.tagName === 'BUTTON').map((e) => e.getBoundingClientRect().height)),
        minLabelW: Math.min(...stn.filter((e) => e.tagName === 'BUTTON').map((e) => e.getBoundingClientRect().width)),
        close: (() => { const r = picker.querySelector('.v2-close').getBoundingClientRect(); return [r.width, r.height]; })(),
        band: Math.round(band.height), foot: picker.querySelector('.v2-foot').textContent,
        lm: lms.map((e) => e.textContent.trim()),
      };
    });
    const res = await audit();
    // 다른 역을 가리켜(선택 상태로 커져도) 다시 검사 — 장지(8호선)
    await page.evaluate(() => document.querySelector('.v2-picker [data-stn="jangji"]')?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));
    await page.waitForTimeout(150);
    const res2 = await audit();
    res.selectedJangji = { issues: res2.issues, maxLeader: res2.maxLeader, sel: await page.evaluate(() => document.querySelector('.v2-sel b')?.textContent) };
    if (res2.issues.length) failed = true;
    res.console = logs; res.gpuDriverNotices = gpuNoise.length;
    report[mode] = res;
    const shot = `${OUT}/verify-${mode}${LANG === 'ko' ? '' : '-' + LANG}.png`;
    // 스크린샷은 기본 선택(정자) 상태로
    await page.evaluate(() => document.querySelector('.v2-picker [data-stn="jeongja"]')?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));
    await page.waitForTimeout(150);
    await page.screenshot({ path: shot });
    console.log(mode, JSON.stringify(res, null, 1));
    if (res.issues.length || logs.length || res.compact !== (mode === 'mobile')) failed = true;
    await ctx.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(`${OUT}/verify-report${LANG === 'ko' ? '' : '-' + LANG}.json`, JSON.stringify(report, null, 1));
if (failed) { console.error('route map verify FAILED'); process.exit(1); }
console.log('route map verify OK');
