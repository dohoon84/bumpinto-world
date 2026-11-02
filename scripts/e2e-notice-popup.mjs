// [notice-popup] 헤드리스 확인 (로컬 테스트 게시판 = localhost 의 localStorage 게시판 사용)
// npm run build && npx vite preview --port 4231 --strictPort  후  node scripts/e2e-notice-popup.mjs
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4231/';
const OUT = process.env.OUT || '/workspace/bw-notice-popup-shots/v2-';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  if (!localStorage.getItem('jeongja3d.profile')) localStorage.setItem('jeongja3d.profile', JSON.stringify({ name: 'Tester', look: {} }));
});
const page = await ctx.newPage();
const res = [];
const boardOpen = () => page.evaluate(() => !document.getElementById('board-modal').hidden);
async function enter(name, qs, expectOpen) {
  await page.goto(B + '?passport=1' + qs, { timeout: 120000 });
  await page.waitForFunction(() => !document.body.classList.contains('in-gate') && !document.body.classList.contains('in-lobby') && !document.getElementById('btn-leave').hidden, null, { timeout: 180000 });
  const openAtJoin = await boardOpen();
  await page.waitForTimeout(4000);
  const open = await boardOpen();
  const shown = await page.evaluate(() => [...document.querySelectorAll('#board-modal td')].map((t) => t.textContent.trim()).filter((t) => t.includes('관리자 작성') || t.includes('admin')).slice(0, 1).join(''));
  const seen = await page.evaluate(() => localStorage.getItem('bw.noticeSeen'));
  await page.screenshot({ path: OUT + name + '.png' });
  const r = { name, expectOpen, open, openAtJoin, seen, shown, pass: open === expectOpen && !openAtJoin };
  res.push(r); console.log(JSON.stringify(r));
  if (open) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
}
// 0) 옛 형식 seen 값 + 기존(번들) 공지만 → 1회 표시(마이그레이션)
await page.goto(B, { timeout: 120000 });
await page.evaluate(() => localStorage.setItem('bw.noticeSeen', 'notice-2026-10-28-launch'));
await enter('1-old-format-migrates', '', true);
await enter('2-reload-no', '', false);
// 1) 관리자(레드 탱크)가 게시판에 새 공지 작성 (로컬 게시판에 직접 추가 = 서버 posts 와 같은 형태)
await page.evaluate(() => {
  const k = 'jeongja3d.board.v1'; const s = JSON.parse(localStorage.getItem(k));
  const now = Date.now();
  s.posts.push({ id: s.nextPostId++, category: 'notice', title: '[업데이트] 관리자 작성 공지 테스트 (레드 탱크)', body: 'e2e', authorId: 'admin', authorPhone: '', authorName: '레드 탱크', views: 0, createdAt: now, updatedAt: now });
  localStorage.setItem(k, JSON.stringify(s));
});
await enter('3-new-admin-notice-opens', '', true);
await enter('4-reload-no', '', false);
await enter('5-other-neighborhood-jamsil-no', '&at=jamsil', false);
await page.evaluate(() => localStorage.removeItem('bw.noticeSeen'));
await enter('6-flag-off', '&noticePopup=0', false);
console.log(res.every((r) => r.pass) ? 'E2E PASS' : 'E2E FAIL');
await browser.close();
