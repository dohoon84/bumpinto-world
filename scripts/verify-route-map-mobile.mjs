// [route-map mobile] 실제 폰(모바일 UA · 터치 · 가로)에서 모바일 시작화면 → '입장할 곳 고르기' → 가로 노선도 검증.
//   - 844×390 · 740×360 · 932×430 (dpr 3, ?mobile=1 없이 UA/터치로 모바일 모드): 노선도가 뜨고 겹침 0(auditRouteMap 실측),
//     선택 칸·입장 버튼·뒤로 버튼이 화면 안(스크롤 없이), 칩 탭 = 선택만(입장 안 함), 다른 지역(스타베이스) ↔ 노선도 왕복
//   - 게스트: 역 고르기 → 입장 → 시작화면이 닫히고 URL 에 enter=1 · at=<역>, 입장 카드(로비)가 뜬다
//   - 로그인(계정 API mock, ?accounts=1&acctapi=): '계속하기 · {이름}' → 고르기 → 노선도 → 입장(at=<역>)
//     약관 재동의 필요(needsTerms) 계정: 고르기 탭 → 재동의 창이 먼저 뜨고 노선도는 안 열림 → '동의하지 않음' = 게스트 시작화면
//   - 명동(4호선) 칩이 있는 브랜치면(MYEONGDONG=1 이면 필수) 명동 선택 → at=myeongdong
//   - 콘솔 오류 0. 스크린샷은 OUT 에.
//   npx vite --port 5317 --strictPort & BASE=http://127.0.0.1:5317/ OUT=/tmp/rmm node scripts/verify-route-map-mobile.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = (process.env.BASE || 'http://127.0.0.1:5317/').replace(/\/?$/, '/');
const OUT = process.env.OUT || '/tmp/routemap-mobile';
const TAG = process.env.TAG ? `-${process.env.TAG}` : '';
const NEED_MD = process.env.MYEONGDONG === '1';
const CHROME = process.env.CHROME || (fs.existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : '/usr/bin/google-chrome');
const OFF = 'noticePopup=0&bp24poster=0&bgm=0&ws=mock&bus=sim&weather=clear&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&controlscard=0';
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
};
const MOCK = 'http://acct.mock';
fs.mkdirSync(OUT, { recursive: true });

const VPS = [['844x390', 844, 390, 'iphone'], ['740x360', 740, 360, 'android'], ['932x430', 932, 430, 'iphone']]
  .filter(([n]) => !process.env.ONLY || process.env.ONLY.split(',').includes(n));

// 페이지 안: 실측 박스로 겹침 검사 + 화면 안·스크롤 없음
const auditMap = () => import('/src/ui-v2/routeMap.js').then(({ auditRouteMap }) => {
  const root = document.querySelector('#m-landing');
  const map = root?.querySelector('.m-rm-map'), m = map?.__rm;
  if (!map || !m) return { issues: ['NO MAP'] };
  const mr = map.getBoundingClientRect();
  const rel = (r) => ({ l: r.left - mr.left, r: r.right - mr.left, t: r.top - mr.top, b: r.bottom - mr.top });
  const boxes = new Map([...map.querySelectorAll('[data-stn], [data-pass]')].map((e) => [e.dataset.stn || e.dataset.pass, rel(e.getBoundingClientRect())]));
  const a = auditRouteMap(m, { boxes });
  const issues = [...a.issues];
  const vw = innerWidth, vh = innerHeight;
  const R = (sel) => root.querySelector(sel)?.getBoundingClientRect();
  const onScreen = (n, r) => { if (!r) issues.push(`MISSING ${n}`); else if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5 || r.width < 1) issues.push(`OFFSCREEN ${n}`); };
  const go = R('.m-rm-sel [data-act="go"]'), back = R('[data-act="back"]'), side = R('.m-rm-side');
  onScreen('go', go); onScreen('back', back); onScreen('selbar', R('.m-rm-sel'));
  for (const e of root.querySelectorAll('.m-rm-lm, .m-rm-region')) onScreen('side-' + (e.dataset.stn || e.dataset.region), e.getBoundingClientRect());
  const se = document.scrollingElement;
  if (se.scrollHeight > vh + 1 || se.scrollWidth > vw + 1) issues.push(`PAGE-SCROLL ${se.scrollWidth}x${se.scrollHeight}`);
  const sideEl = root.querySelector('.m-rm-side');
  if (sideEl.scrollHeight > sideEl.clientHeight + 1) issues.push(`SIDE-SCROLL ${sideEl.scrollHeight - sideEl.clientHeight}`);
  let minFont = 99, minHitH = 99, minHitW = 99;
  for (const e of map.querySelectorAll('.m-rm-stn')) {
    const r = e.getBoundingClientRect();
    if (r.left < mr.left + 1 || r.right > mr.right - 1 || r.top < mr.top + 1 || r.bottom > mr.bottom - 1) issues.push('MAP-OUT ' + (e.dataset.stn || e.dataset.pass));
    if (side && r.right > side.left) issues.push('SIDE× ' + e.dataset.stn);
    minFont = Math.min(minFont, parseFloat(getComputedStyle(e.querySelector('b')).fontSize));
    if (e.tagName === 'BUTTON') {
      const hb = getComputedStyle(e, '::before');
      const ext = (parseFloat(hb.top) < 0 ? -parseFloat(hb.top) : 0) + (parseFloat(hb.bottom) < 0 ? -parseFloat(hb.bottom) : 0);
      minHitH = Math.min(minHitH, r.height + ext); minHitW = Math.min(minHitW, r.width);
    }
  }
  if (minFont < 11) issues.push(`FONT ${minFont}`);
  for (const e of root.querySelectorAll('.m-rm-lm, .m-rm-region, [data-act="go"], [data-act="back"]')) { const r = e.getBoundingClientRect(); if (r.height < 37.5) issues.push(`HIT-H ${e.dataset.stn || e.dataset.region || e.dataset.act} ${Math.round(r.height)}`); }
  return {
    issues, mobileBody: document.body.classList.contains('mobile'), mapW: Math.round(mr.width), mapH: Math.round(mr.height),
    labels: map.querySelectorAll('.m-rm-stn').length, startable: map.querySelectorAll('button.m-rm-stn').length,
    landmarks: [...root.querySelectorAll('.m-rm-lm')].map((e) => e.dataset.stn), regions: [...root.querySelectorAll('.m-rm-region')].map((e) => e.dataset.region),
    minFont, minHitH: Math.round(minHitH), minHitW: Math.round(minHitW), fallback: m.fallback,
    sel: root.querySelector('.m-rm-sel b')?.textContent, go: root.querySelector('.m-rm-sel [data-act="go"]')?.textContent,
    selected: root.querySelector('.m-rm-stn.on, .m-rm-lm.on')?.dataset.stn,
  };
});

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'] });
const report = {};
let failed = false;
const fail = (rep, msg) => { rep.issues.push(msg); };

async function newPhone(w, h, ua, { acct = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA[ua], locale: 'ko-KR' });
  const page = await ctx.newPage();
  const logs = [], gpu = [];
  page.on('console', (m) => { if (m.type() !== 'error') return; const t = `${m.type()}: ${m.text()}`; (/GL Driver Message|GPU stall/.test(t) ? gpu : logs).push(t); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  const calls = [];
  if (acct) {
    await ctx.route(`${MOCK}/**`, async (route) => {
      const req = route.request(), u = new URL(req.url());
      const cors = { 'access-control-allow-origin': new URL(B).origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      calls.push(`${req.method()} ${u.pathname}`);
      const json = (o) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
      if (u.pathname === '/econ/state') return json({ ok: true, data: { session: acct.signedIn ? { signedIn: true, accountId: 'acc-test', displayName: '도훈테스트' } : { signedIn: false }, balance: { total: 0, free: 0, paid: 0, currency: 'bum', updatedAt: Date.now() }, lastId: 0, events: [] } });
      if (u.pathname === '/auth/me') return json(acct.signedIn ? { ok: true, account: { id: 'acc-test', name: '도훈테스트' }, consent: { needsTerms: !!acct.needsTerms } } : { ok: false });
      if (u.pathname === '/auth/config') return json({ ok: true, enabled: true, clientId: 'x', consent: { termsVersion: 't1', privacyVersion: 'p1' } });
      if (u.pathname === '/auth/logout') { acct.signedIn = false; return json({ ok: true }); }
      if (u.pathname === '/auth/consent') { acct.needsTerms = false; return json({ ok: true }); }
      if (u.pathname === '/econ/config') return json({ ok: true, data: { mode: { transitPaid: false, shopPaid: false, beta: true } } });
      return json({ ok: false, error: { code: 'not_found' } }); // 200 + ok:false (콘솔 404 소음 없이)
    });
  }
  return { ctx, page, logs, gpu, calls };
}
const tap = async (page, sel) => {
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: 'visible', timeout: 30000 });
  const r = await loc.boundingBox();
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
};
const openStart = async (page, qs) => {
  await page.goto(`${B}?${OFF}${qs}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('#m-landing .m-start-sheet', { timeout: 120000 });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(1200); // 계정 세션·Google 버튼 비동기 렌더 뒤
};
const openMap = async (page) => {
  await tap(page, '#m-landing [data-act="pick"]');
  await page.waitForSelector('#m-landing .m-rm-map svg polyline', { timeout: 30000 });
  await page.waitForTimeout(300);
};
const hasMd = async (page) => page.evaluate(() => import('/src/corridor/globeCorridor.js').then((g) => !!g.MYEONGDONG_LANDMARK));
const entered = async (page, at) => {
  await page.waitForFunction(() => !document.getElementById('m-landing'), null, { timeout: 30000 });
  const url = await page.evaluate(() => location.search);
  const q = new URLSearchParams(url);
  const ok = q.get('enter') === '1' && (at === 'jeongja' ? !q.has('at') : q.get('at') === at);
  await page.waitForFunction(() => document.body.classList.contains('in-lobby') && !!document.querySelector('#lobby-card'), null, { timeout: 180000 }).catch(() => {});
  const lobby = await page.evaluate(() => ({ lobby: document.body.classList.contains('in-lobby'), title: document.querySelector('#lobby-fields h1')?.innerText || '' }));
  return { ok, url, ...lobby };
};

try {
  for (const [name, w, h, ua] of VPS) {
    // ── 게스트 ──
    const rep = { issues: [] };
    const { ctx, page, logs, gpu } = await newPhone(w, h, ua);
    await openStart(page, '&lang=ko');
    if (!(await page.evaluate(() => document.body.classList.contains('mobile')))) fail(rep, 'NOT MOBILE MODE (UA/touch)');
    await openMap(page);
    rep.map = await page.evaluate(auditMap);
    rep.issues.push(...rep.map.issues);
    const md = await hasMd(page);
    rep.myeongdong = md;
    if (NEED_MD && !md) fail(rep, 'MYEONGDONG missing');
    if (md && !rep.map.landmarks.includes('myeongdong')) fail(rep, 'MYEONGDONG chip missing');
    await page.screenshot({ path: `${OUT}/${name}-map-ko${TAG}.png` });
    // 칩 탭 = 선택만
    await tap(page, '#m-landing .m-rm-map [data-stn="jangji"]');
    await page.waitForTimeout(250);
    const a2 = await page.evaluate(auditMap);
    if (a2.selected !== 'jangji') fail(rep, `SELECT jangji → ${a2.selected}`);
    if (!(await page.locator('#m-landing .m-rm-map').isVisible())) fail(rep, 'ENTERED on chip tap');
    rep.issues.push(...a2.issues.map((x) => 'jangji: ' + x));
    rep.jangji = { sel: a2.sel, go: a2.go };
    await page.screenshot({ path: `${OUT}/${name}-map-ko-jangji${TAG}.png` });
    // 다른 지역 ↔ 노선도
    if (a2.regions.length) {
      const rid = a2.regions[0];
      const dis = await page.locator(`#m-landing .m-rm-region[data-region="${rid}"]`).isDisabled();
      if (!dis) {
        await tap(page, `#m-landing .m-rm-region[data-region="${rid}"]`);
        await page.waitForSelector('#m-landing .m-regions', { timeout: 5000 }).catch(() => fail(rep, 'REGION switch: old view not shown'));
        await page.screenshot({ path: `${OUT}/${name}-region-${rid}${TAG}.png` });
        await tap(page, '#m-landing .m-regions .m-region[data-region="jeongja"]');
        await page.waitForSelector('#m-landing .m-rm-map svg polyline', { timeout: 5000 }).catch(() => fail(rep, 'REGION switch back: map not shown'));
      } else rep.regionLocked = rid;
    }
    // 뒤로 → 시작 → 다시 고르기
    await tap(page, '#m-landing [data-act="back"]');
    await page.waitForSelector('#m-landing .m-start-sheet', { timeout: 5000 });
    await openMap(page);
    const target = md && name === '844x390' ? 'myeongdong' : 'yatap';
    await tap(page, `#m-landing [data-stn="${target}"]`);
    await page.waitForTimeout(200);
    if (target === 'myeongdong') await page.screenshot({ path: `${OUT}/${name}-map-ko-myeongdong${TAG}.png` });
    await tap(page, '#m-landing .m-rm-sel [data-act="go"]');
    rep.guestEnter = await entered(page, target);
    if (!rep.guestEnter.ok) fail(rep, `GUEST ENTER ${target} → ${rep.guestEnter.url}`);
    if (!rep.guestEnter.lobby) fail(rep, 'GUEST ENTER: no entry card');
    await page.screenshot({ path: `${OUT}/${name}-guest-entered-${target}${TAG}.png` });
    rep.console = logs; rep.gpuNotices = gpu.length;
    if (logs.length) failed = true;
    await ctx.close();

    // ── 영어 (가장 좁은 화면에서 이름표·옆 칸) ──
    if (name === '740x360' || name === '844x390') {
      const r = await newPhone(w, h, ua);
      await openStart(r.page, '&lang=en');
      await openMap(r.page);
      const ae = await r.page.evaluate(auditMap);
      rep.en = { issues: ae.issues, sel: ae.sel };
      rep.issues.push(...ae.issues.map((x) => 'en: ' + x));
      await r.page.screenshot({ path: `${OUT}/${name}-map-en${TAG}.png` });
      if (r.logs.length) { rep.console.push(...r.logs); failed = true; }
      await r.ctx.close();
    }

    // ── 로그인 계정 (mock) ──
    if (name === '844x390' || name === '932x430') {
      const acct = { signedIn: true, needsTerms: false };
      const r = await newPhone(w, h, ua, { acct });
      await openStart(r.page, `&lang=ko&accounts=1&acctapi=${encodeURIComponent(MOCK)}`);
      await r.page.waitForSelector('#m-landing .m-acct', { timeout: 15000 }).catch(() => fail(rep, 'ACCT: signed-in line not shown'));
      const startTxt = await r.page.evaluate(() => document.querySelector('#m-landing .m-start-sheet')?.innerText.replace(/\n+/g, ' | '));
      await r.page.screenshot({ path: `${OUT}/${name}-acct-start${TAG}.png` });
      await openMap(r.page);
      const aa = await r.page.evaluate(auditMap);
      rep.issues.push(...aa.issues.map((x) => 'acct: ' + x));
      await tap(r.page, '#m-landing [data-stn="pangyo"]');
      await r.page.waitForTimeout(200);
      await tap(r.page, '#m-landing .m-rm-sel [data-act="go"]');
      const ent = await entered(r.page, 'pangyo');
      rep.acct = { start: startTxt, enter: ent, calls: [...new Set(r.calls)] };
      if (!ent.ok) fail(rep, `ACCT ENTER pangyo → ${ent.url}`);
      await r.page.screenshot({ path: `${OUT}/${name}-acct-entered-pangyo${TAG}.png` });
      if (r.logs.length) { rep.console.push(...r.logs.map((x) => 'acct: ' + x)); failed = true; }
      await r.ctx.close();

      // 약관 재동의 필요 계정: 고르기 → 재동의 창(노선도 안 열림) → 동의하지 않음 → 게스트 시작화면
      const acct2 = { signedIn: true, needsTerms: true };
      const r2 = await newPhone(w, h, ua, { acct: acct2 });
      await r2.page.goto(`${B}?${OFF}&lang=ko&accounts=1&acctapi=${encodeURIComponent(MOCK)}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      // 시작화면이 뜨자마자 재동의 창이 뜰 수 있다(로그인 세션 확인 시) — 그 경우도 규칙대로
      await r2.page.waitForSelector('#m-landing .m-start-sheet', { timeout: 120000 });
      await r2.page.waitForSelector('.acct-reconsent', { timeout: 15000 }).catch(() => {});
      let modal = await r2.page.locator('.acct-reconsent').isVisible().catch(() => false);
      if (!modal) { // 창이 아직 없으면 고르기 탭으로 띄운다
        await tap(r2.page, '#m-landing [data-act="pick"]').catch(() => {});
        await r2.page.waitForSelector('.acct-reconsent', { timeout: 10000 }).catch(() => {});
        modal = await r2.page.locator('.acct-reconsent').isVisible().catch(() => false);
      }
      const mapOpen = await r2.page.locator('#m-landing .m-rm-map').count();
      await r2.page.screenshot({ path: `${OUT}/${name}-acct-needsterms${TAG}.png` });
      if (!modal) fail(rep, 'NEEDS-TERMS: reconsent modal not shown');
      if (mapOpen) fail(rep, 'NEEDS-TERMS: map opened before consent');
      // 거절(동의하지 않음) → 게스트 시작화면
      const btns = await r2.page.locator('.acct-reconsent button').allInnerTexts();
      const declineIdx = btns.findIndex((x) => /동의하지 않|Decline|게스트/.test(x));
      if (declineIdx >= 0) await r2.page.locator('.acct-reconsent button').nth(declineIdx).click();
      await r2.page.waitForFunction(() => !document.querySelector('.acct-reconsent'), null, { timeout: 10000 }).catch(() => fail(rep, 'NEEDS-TERMS: modal did not close on decline'));
      await r2.page.waitForTimeout(800);
      const after = await r2.page.evaluate(() => ({ start: !!document.querySelector('#m-landing .m-start-sheet'), acctLine: !!document.querySelector('#m-landing .m-acct'), map: !!document.querySelector('#m-landing .m-rm-map') }));
      rep.needsTerms = { modal, buttons: btns, after, calls: [...new Set(r2.calls)] };
      if (!after.start || after.acctLine || after.map) fail(rep, `NEEDS-TERMS decline → ${JSON.stringify(after)}`);
      await r2.page.screenshot({ path: `${OUT}/${name}-acct-needsterms-declined${TAG}.png` });
      // 게스트로 고르기 → 노선도는 열린다
      await openMap(r2.page);
      if (!(await r2.page.locator('#m-landing .m-rm-map').isVisible())) fail(rep, 'NEEDS-TERMS: guest map after decline');
      if (r2.logs.length) { rep.console.push(...r2.logs.map((x) => 'terms: ' + x)); failed = true; }
      await r2.ctx.close();
    }
    report[name] = rep;
    console.log(name, JSON.stringify(rep, null, 1));
    if (rep.issues.length) failed = true;
  }
} finally {
  await browser.close();
}
fs.writeFileSync(`${OUT}/verify-report${TAG}.json`, JSON.stringify(report, null, 1));
if (failed) { console.error('mobile route map verify FAILED'); process.exit(1); }
console.log('mobile route map verify OK');
