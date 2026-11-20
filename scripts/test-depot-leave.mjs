// [depot-leave] 회귀: 범창고 들어갔다 나온 뒤 게임이 멈추지 않는지 (프레임이 계속 흐르고, 에러 0, 매장 상태가 풀림)
//   node scripts/test-depot-leave.mjs   (BASE=http://127.0.0.1:5173/ MOBILE=1 STORY=1 PATH_MODE=exit|button)
//   PATH_MODE=exit: 계산대 출구에서 실제 E 키 · button: depot.leave() (모바일 '출구로 나가기' 버튼과 같은 길)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:5173/', mobile = process.env.MOBILE === '1', mode = process.env.PATH_MODE || 'exit';
const Q = 'enter=1&name=Tester&ws=mock&weather=clear&hour=14&noticePopup=0&bgm=1&subwayVoice=0&controlscard=0&shot=1' + (mobile ? '&mobile=1' : '') + (process.env.STORY ? '&depotMode=story' : '');
try { await fetch(BASE); } catch { console.log('test-depot-leave: skipped (no dev server at ' + BASE + ' — run `npx vite --port 5173`, or set BASE)'); process.exit(0); }
const { existsSync } = await import('node:fs');
const exe = process.env.CHROME || (existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : undefined);
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 40[134]|Failed to load resource/.test(t)) errs.push(t.slice(0, 200)); });
await p.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
await p.addInitScript(() => { window.__fr = 0; const f = () => { window.__fr++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
await p.goto(BASE + '?' + Q, { timeout: 180000 });
await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await p.waitForTimeout(3000);
await p.evaluate(() => window.__jj.teleport(-492, 496.6)); await p.waitForTimeout(2500);
await p.keyboard.press('e');
await p.waitForFunction(() => window.__jj.depot.active, null, { timeout: 150000 });
await p.waitForTimeout(6000);
if (mode === 'button') await p.evaluate(() => window.__jj.depot.leave());
else { await p.evaluate(() => { const i = window.__jj.depot.interior; i.st.me.x = 6; i.st.me.z = 1.0; }); await p.waitForTimeout(500); await p.keyboard.press('e'); }
// 나가기 → 최대 45초 안에 매장 상태가 풀려야 한다
const t0 = Date.now(); let left = false;
while (Date.now() - t0 < 45000) { await p.waitForTimeout(1000); const s = await p.evaluate(() => ({ a: window.__jj.depot.active, bz: window.__jj.depot.busy })); if (!s.a && !s.bz) { left = true; break; } }
assert.ok(left, 'depot leave never finished (active/busy stuck)');
// 5초 걷기 동안 프레임이 계속 흘러야 한다(소프트웨어 렌더라 최소만 요구)
await p.keyboard.down('w'); const f0 = await p.evaluate(() => window.__fr); await p.waitForTimeout(5000); await p.keyboard.up('w');
const f1 = await p.evaluate(() => window.__fr);
assert.ok(f1 - f0 >= 3, `frames stalled after leaving: ${f1 - f0}`);
assert.equal(await p.evaluate(() => document.body.classList.contains('depot-inside')), false, 'depot-inside class left on body');
assert.equal(errs.length, 0, 'console errors: ' + errs.slice(0, 3).join(' | '));
console.log(`depot leave ok (${mode}${mobile ? ' mobile' : ''}${process.env.STORY ? ' story' : ''}) frames+${f1 - f0}`);
await b.close();
