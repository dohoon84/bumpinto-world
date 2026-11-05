// [hud-v3] 데스크톱 상단 HUD v3 스크린샷 (1440x900 · 1280x800). ?hud=v3 켬/끔 둘 다 + 콘솔 오류 수.
//   BASE=http://127.0.0.1:5173 OUT=/tmp/bw-hud-v3 node scripts/shots-hud-v3.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = process.env.OUT || '/tmp/bw-hud-v3';
mkdirSync(OUT, { recursive: true });
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const report = [];

async function run({ w, h, v3 }) {
  const b = await chromium.launch({ args: GL });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ko-KR' });
  const p = await ctx.newPage();
  p.setDefaultTimeout(120000);
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const tag = `${v3 ? 'v3' : 'off'}-${w}`;
  await p.goto(`${BASE}/?noticePopup=0&ga=off${v3 ? '&hud=v3' : ''}`, { timeout: 120000 });
  // 시작 화면 → 게스트 → 지구본(판교) → 입장 카드 → 입장
  await p.waitForSelector('[data-v2=guest]', { timeout: 60000 }); await p.waitForTimeout(1000);
  await p.locator('[data-v2=guest]').first().click({ force: true });
  await p.waitForSelector('[data-enter-at=pangyo]', { state: 'attached', timeout: 60000 }); await p.waitForTimeout(2000);
  await p.locator('[data-enter-at=pangyo]:visible').first().click({ force: true });
  await p.waitForSelector('#lobby-go', { state: 'visible', timeout: 90000 }); await p.waitForTimeout(3500);
  if (await p.locator('#nick').isVisible().catch(() => false) && !(await p.inputValue('#nick').catch(() => '')).trim()) await p.fill('#nick', '도훈');
  await p.locator('#lobby-go').first().click({ force: true });
  await p.waitForFunction(() => !document.body.classList.contains('in-gate') && !document.body.classList.contains('in-lobby') && !document.getElementById('btn-leave').hidden, null, { timeout: 180000 });
  await p.waitForFunction((v3) => (v3 ? !!document.querySelector('#h3-card .h3-cells > *') : !!document.querySelector('#ve-hud .ve-row > *')), v3, { timeout: 60000 });
  await p.waitForFunction(() => { const l = document.getElementById('enter-loading'); return !l || l.hidden || getComputedStyle(l).display === 'none'; }, null, { timeout: 180000 });
  await p.waitForTimeout(4000);
  const shot = async (name) => { await p.screenshot({ path: `${OUT}/${tag}-${name}.png` }); console.log('shot', `${tag}-${name}`); };
  await shot('default');
  const info = await p.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] : 'hidden'; };
    return { cls: document.body.className, card: r('#h3-card'), bar: r('#h3-bar'), online: r('#h3-online'), bgm: r('#bgm'), trk: r('#ve-hud .ve-trk'), hud: r('#hud'), buttons: r('#buttons'), trb: r('#top-right-bar'), btns: [...document.querySelectorAll('#h3-bar .h3-btn')].map((b) => `${b.dataset.h3}:${getComputedStyle(b).display}:${Math.round(b.getBoundingClientRect().width)}`), veRow: r('#ve-hud .ve-row') };
  });
  const ov = (a, c) => Array.isArray(a) && Array.isArray(c) && a[0] < c[0] + c[2] && c[0] < a[0] + a[2] && a[1] < c[1] + c[3] && c[1] < a[1] + a[3];
  info.bgmOverlap = { card: ov(info.bgm, info.card), bar: ov(info.bgm, info.bar), trk: ov(info.bgm, info.trk), row: ov(info.bgm, info.veRow), trb: ov(info.bgm, info.trb), buttons: ov(info.bgm, info.buttons) };
  if (v3) {
    await p.click('[data-h3="map"]'); await p.waitForTimeout(600); await shot('map-menu');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.click('[data-h3="menu"]'); await p.waitForTimeout(600); await shot('hamburger-menu');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.click('[data-h3="shop"]'); await p.waitForTimeout(1500); await shot('shop-panel');
    info.shopOpen = await p.evaluate(() => !!document.querySelector('#ve-layer .ve-wrap[data-key="11"]'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    // 단축키: Q → 할 일 패널, 다시 Q → 닫힘. 채팅 입력 중 Q 는 무시
    await p.mouse.click(Math.round(w / 2), Math.round(h / 2)); await p.waitForTimeout(200);
    await p.keyboard.press('KeyQ'); await p.waitForTimeout(800);
    info.keyQ = await p.evaluate(() => document.querySelector('#ve-layer .ve-wrap')?.dataset.key || '');
    await shot('key-q-quests');
    await p.keyboard.press('KeyQ'); await p.waitForTimeout(500);
    info.keyQclose = await p.evaluate(() => document.querySelector('#ve-layer .ve-wrap')?.dataset.key || '');
    await p.keyboard.press('KeyB'); await p.waitForTimeout(800);
    info.keyB = await p.evaluate(() => document.querySelector('#ve-layer .ve-wrap')?.dataset.key || '');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.focus('#chat-input').catch(() => {});
    await p.keyboard.type('qbj'); await p.waitForTimeout(500);
    info.typing = await p.evaluate(() => ({ val: document.getElementById('chat-input')?.value, panel: document.querySelector('#ve-layer .ve-wrap')?.dataset.key || '', board: !!document.getElementById('board-Launcher')?.classList.contains('active') }));
    await p.evaluate(() => { const c = document.getElementById('chat-input'); if (c) { c.value = ''; c.blur(); } });
    await p.keyboard.press('Escape').catch(() => {});
    await p.mouse.click(Math.round(w / 2), Math.round(h / 2)); await p.waitForTimeout(200);
    await p.keyboard.press('KeyJ'); await p.waitForTimeout(1200);
    info.keyJ = await p.evaluate(() => !!document.getElementById('board-Launcher')?.classList.contains('active') || !!document.querySelector('#board-modal:not([hidden]), .board-modal:not([hidden])'));
    await shot('key-j-board');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await p.click('[data-h3="map"]'); await p.waitForTimeout(400);
    info.mapItems = await p.evaluate(() => [...document.querySelectorAll('#h3-drop .h3-item')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
    await p.click('#h3-drop [data-press="btn-view"]'); await p.waitForTimeout(1500);
    info.afterView = await p.evaluate(() => window.__jj?.cam?.mode);
    await shot('overview-mode');
    await p.keyboard.press('KeyM'); await p.waitForTimeout(800);
    info.afterM = await p.evaluate(() => window.__jj?.cam?.mode);
    await p.click('[data-h3="menu"]'); await p.waitForTimeout(400);
    info.menuItems = await p.evaluate(() => [...document.querySelectorAll('#h3-drop .h3-item')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
    await p.click('#h3-drop [data-lang="en"]'); await p.waitForTimeout(800);
    await shot('menu-english');
    await p.click('#h3-drop [data-lang="ko"]'); await p.waitForTimeout(500);
    await p.keyboard.press('Escape');
    await p.click('#h3-online'); await p.waitForTimeout(600);
    info.presenceOpen = await p.evaluate(() => !document.getElementById('presence-panel')?.hidden);
    await shot('online-panel');
    // mock 경제에서 로그인 상태(잔액·할 일·걸음 칸) 보기 — 로컬 mock 만 (서버 원장 아님)
    await p.evaluate(() => document.getElementById('presence-status')?.click());
    const signed = await p.evaluate(async () => { const { econ } = await import('/src/ui-v2/econ/index.js'); if (!econ.isMock || !econ.dev?.signIn) return false; econ.dev.signIn({ name: '도훈' }); return true; });
    if (signed) { await p.waitForTimeout(2500); await p.keyboard.press('Escape'); await p.waitForTimeout(800); await p.evaluate(async () => { const { close } = await import('/src/ui-v2/econ-ui/layer.js'); close(true); }); await p.waitForTimeout(600); await shot('signed-in-mock'); }
  }
  info.errors = errs;
  report.push({ tag, ...info });
  console.log(JSON.stringify({ tag, ...info }, null, 1));
  await b.close();
}

const ONLY = process.env.ONLY || ''; // 예: v3-1440
for (const v3 of [true, false]) for (const [w, h] of [[1440, 900], [1280, 800]]) if (!ONLY || ONLY === `${v3 ? 'v3' : 'off'}-${w}`) await run({ w, h, v3 });
const bad = report.filter((r) => r.errors.length);
console.log(bad.length ? `CONSOLE ERRORS in ${bad.map((r) => r.tag).join(', ')}` : 'console errors: 0');
