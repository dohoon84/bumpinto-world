// [game-icons] 모바일 ☰ 메뉴 시트 · 왼쪽 위 칩 아이콘 전/후 (844x390 가로 · 390x844 세로). ?icons=v2 킬 스위치 확인도.
//   BASE=http://127.0.0.1:5173 OUT=/tmp/bw-m PHASE=after [ICONS=v2] node scripts/shots-mobile-icons.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = process.env.OUT || '/tmp/bw-m';
const PHASE = process.env.PHASE || 'after';
const ICONS = process.env.ICONS || '';
mkdirSync(OUT, { recursive: true });
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const res = [];
const SIZES = (process.env.SIZES || '844x390,667x375,390x844').split(',').map((v) => v.split('x').map(Number));
for (const [w, h] of SIZES) {
  const b = await chromium.launch({ args: GL });
  const p = await (await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, locale: 'ko-KR', deviceScaleFactor: +(process.env.DPR || 1) })).newPage();
  const errs = [];
  p.on('crash', () => console.error('page crashed', w, h));
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(`${BASE}/?mobile=1&ui=v2&demo=econ&noticePopup=0&enter=1&at=yatap&npcs=0&shadow=0&ga=off${ICONS ? `&icons=${ICONS}` : ''}`);
  await p.waitForSelector('#nick', { state: 'visible', timeout: 120000 });
  await p.fill('#nick', '김도훈');
  const r = await p.locator('#lobby-go').boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
  await p.waitForFunction(() => window.__jj?.ready && (!document.body.classList.contains('in-lobby') || innerHeight > innerWidth /* 세로: 화면을 돌려 그려서 in-lobby 가 남음 */), null, { timeout: 150000 });
  await p.waitForTimeout(4000);
  // 로컬 mock 경제 로그인(서버 원장 아님) → 잔액 · 할 일 칩
  await p.evaluate(async () => { try { const { econ } = await import('/src/ui-v2/econ/index.js'); if (econ.isMock && econ.dev?.signIn) econ.dev.signIn({ name: '김도훈' }); } catch { /* noop */ } });
  await p.waitForTimeout(2500);
  await p.evaluate(async () => { try { const { close } = await import('/src/ui-v2/econ-ui/layer.js'); close(true); } catch { /* noop */ } });
  await p.waitForTimeout(1500);
  // 계정 칩: 로그인 상태를 흉내(긴 이름 · 잔액) — 시트 타일 글자 잘림 확인용
  await p.evaluate(() => {
    let a = document.getElementById('account-chip');
    if (!a) { // 로컬엔 계정 서버가 없어 칩이 안 생김 → account/ui.js 와 같은 구조로 만든다
      a = document.createElement('button'); a.id = 'account-chip'; a.type = 'button'; a.className = 'board-launcher account-chip';
      a.innerHTML = '<span class="board-icon" aria-hidden="true">👤</span><span class="board-label"></span>';
      const bar = document.getElementById('top-right-bar'); (bar || document.body).insertBefore(a, bar ? bar.firstChild : null);
    }
    a.hidden = false; const l = a.querySelector('.board-label'); if (l) l.textContent = '김도훈 · 20,500 bum'; else a.textContent = '김도훈 · 20,500 bum';
    const d = document.querySelector('.ve-demo'); if (d) d.style.display = 'none'; // demo=econ 디버그 바(스크린샷 가림)
  });
  const tag = `mobile-${ICONS ? 'icons-' + ICONS : PHASE}-${w}x${h}`;
  await p.screenshot({ path: `${OUT}/${tag}-hud.png` });
  if (h > w) { res.push({ tag, portrait: '가로로 돌려 주세요 안내(게임은 가로 전용) — 메뉴 시트 없음', errors: errs }); await b.close(); continue; }
  await p.locator('#m-hud [data-tg="menu"]').click({ force: true }); await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/${tag}-menu.png` });
  await p.evaluate(() => { const s = document.querySelector('#m-hud .m-menu-sheet .m-menu-body') || document.querySelector('#m-hud .m-menu-sheet'); s.scrollTop = 1e5; const sh = document.querySelector('#m-hud .m-menu-sheet'); sh.scrollTop = 1e5; });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${tag}-menu-bottom.png` });
  const info = await p.evaluate(() => {
    const acct = document.querySelector('#m-hud [data-menu="account-chip"]');
    const sp = acct?.querySelector('span');
    const attr = document.querySelector('#m-hud .m-attr'); const more = attr?.querySelector('.attr-more');
    const mr = more?.getBoundingClientRect();
    return { acctText: acct?.textContent, acctTrunc: sp ? sp.scrollWidth > sp.clientWidth + 1 : null, attrMoreVisible: !!(mr && mr.width && getComputedStyle(more).display !== 'none'), gi: document.querySelectorAll('#m-hud .gi').length };
  });
  res.push({ tag, ...info, errors: errs });
  await b.close();
}
console.log(JSON.stringify(res, null, 1));
