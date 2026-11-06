// [hud-v3-icons] 아이콘 전/후 비교 스크린샷 (1440x900 · 1280x800). 액션 바 · 지도·이동 / ☰ 메뉴 · 할 일 · 탈것 상점 · 게시판 · 미니맵 가장자리 · 플레이어 카드.
//   BASE=http://127.0.0.1:5173 OUT=/tmp/bw-icons PHASE=after node scripts/shots-hud-v3-icons.mjs   (HUD=off 이면 플래그 끔 비교)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = process.env.OUT || '/tmp/bw-icons';
const PHASE = process.env.PHASE || 'after';
const HUD = process.env.HUD || 'v3';
const SIZES = (process.env.SIZES || '1440x900,1280x800').split(',').map((s) => s.split('x').map(Number));
mkdirSync(OUT, { recursive: true });
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function run(w, h) {
  const b = await chromium.launch({ args: GL });
  const p = await (await b.newContext({ viewport: { width: w, height: h }, locale: 'ko-KR' })).newPage();
  p.setDefaultTimeout(120000);
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const tag = HUD === 'v3' ? `icons-${PHASE}` : `icons-off-${PHASE}`;
  const shot = async (name, clip) => { await p.screenshot({ path: `${OUT}/${tag}-${name}-${w}.png`, ...(clip ? { clip } : {}) }); console.log('shot', `${tag}-${name}-${w}`); };
  await p.goto(`${BASE}/?noticePopup=0&ga=off&hud=${HUD}`, { timeout: 120000 });
  await p.waitForSelector('[data-v2=guest]', { timeout: 60000 }); await p.waitForTimeout(1000);
  await p.locator('[data-v2=guest]').first().click({ force: true });
  await p.waitForSelector('[data-enter-at=pangyo]', { state: 'attached', timeout: 60000 }); await p.waitForTimeout(2000);
  await p.locator('[data-enter-at=pangyo]:visible').first().click({ force: true });
  await p.waitForSelector('#lobby-go', { state: 'visible', timeout: 90000 }); await p.waitForTimeout(3500);
  if (await p.locator('#nick').isVisible().catch(() => false) && !(await p.inputValue('#nick').catch(() => '')).trim()) await p.fill('#nick', '도훈');
  await p.locator('#lobby-go').first().click({ force: true });
  await p.waitForFunction(() => !document.body.classList.contains('in-gate') && !document.body.classList.contains('in-lobby') && !document.getElementById('btn-leave').hidden, null, { timeout: 180000 });
  await p.waitForFunction(() => { const l = document.getElementById('enter-loading'); return !l || l.hidden || getComputedStyle(l).display === 'none'; }, null, { timeout: 180000 });
  await p.waitForTimeout(3000);
  // mock 경제 로그인(로컬 mock 만) → 할 일 목록이 보이게
  const signed = await p.evaluate(async () => { const { econ } = await import('/src/ui-v2/econ/index.js'); if (!econ.isMock || !econ.dev?.signIn) return false; econ.dev.signIn({ name: '도훈' }); return true; });
  if (signed) { await p.waitForTimeout(2500); await p.keyboard.press('Escape'); await p.evaluate(async () => { const { close } = await import('/src/ui-v2/econ-ui/layer.js'); close(true); }); await p.waitForTimeout(800); }
  const center = async () => { await p.mouse.click(Math.round(w / 2), Math.round(h * 0.55)); await p.waitForTimeout(200); };
  if (HUD === 'v3') {
    await shot('bar', { x: w - 560, y: 0, width: 560, height: 360 });
    await shot('card', { x: 0, y: 0, width: 560, height: 120 });
    await p.click('[data-h3="map"]'); await p.waitForTimeout(600); await shot('mapmenu', { x: w - 560, y: 0, width: 560, height: 420 });
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.click('[data-h3="menu"]'); await p.waitForTimeout(600); await shot('menu', { x: w - 560, y: 0, width: 560, height: 560 });
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.mouse.move(w - 100, 220); await p.waitForTimeout(400);
    await shot('minimap', { x: w - 240, y: 90, width: 240, height: 270 });
  }
  if (w === 1440) {
    await center(); await p.keyboard.press('KeyQ'); await p.waitForTimeout(1200); await shot('quests');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await center(); await p.keyboard.press('KeyB'); await p.waitForTimeout(1500); await shot('shop');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await center(); await p.keyboard.press('KeyJ'); await p.waitForTimeout(1500); await shot('board');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  }
  console.log(JSON.stringify({ w, signed, errors: errs }));
  await b.close();
}
for (const [w, h] of SIZES) await run(w, h);
