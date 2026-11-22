// [depot-leave] 회귀: 범창고 들어갔다 나온 뒤 게임이 멈추지 않는지 (프레임이 계속 흐르고, 에러 0, 매장 상태가 풀림)
//   node scripts/test-depot-leave.mjs   (BASE=http://127.0.0.1:5173/ MOBILE=1 STORY=1 PATH_MODE=exit|button)
//   PATH_MODE=exit: 계산대 출구에서 실제 E 키 · button: depot.leave() (모바일 '출구로 나가기' 버튼과 같은 길)
//   HOUR=22(기본, 밤 — 탄천 다리 조명이 GPU 에 올라가 CPU 배열을 버린 상태) · HOUR=14 낮 · DAY=6 스토리 일차(STORY=1 과 함께)
//   [depot-leave] 상태(active/busy)만 보면 놓친다: 게임 frame() 고리가 throw 로 끊기면 상태는 나왔는데 화면은 매장 그림에 멈춘다.
//   그래서 나온 뒤 게임 frame() 이 계속 돌고 바깥 월드 장면을 실제로 renderer.render 하는지 센다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:5173/', mobile = process.env.MOBILE === '1', mode = process.env.PATH_MODE || 'exit';
const HOUR = process.env.HOUR || '22', DAY = +(process.env.DAY || 0);
const Q = 'enter=1&name=Tester&ws=mock&weather=clear&hour=' + HOUR + '&noticePopup=0&bgm=1&subwayVoice=0&controlscard=0&shot=1' + (mobile ? '&mobile=1' : '') + (process.env.STORY ? '&depotMode=story' : '');
try { await fetch(BASE); } catch { console.log('test-depot-leave: skipped (no dev server at ' + BASE + ' — run `npx vite --port 5173`, or set BASE)'); process.exit(0); }
const { existsSync } = await import('node:fs');
const exe = process.env.CHROME || (existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : undefined);
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 40[134]|Failed to load resource/.test(t)) errs.push(t.slice(0, 200)); });
await p.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
await p.addInitScript((day) => {
  window.__fr = 0; const f = () => { window.__fr++; requestAnimationFrame(f); }; requestAnimationFrame(f);
  // 게임 루프(game.js 의 function frame) 만 따로 센다 — 위 __fr 은 게임 루프가 죽어도 계속 오른다
  window.__gf = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { if (cb.name === 'frame') window.__gf++; cb(t); });
  if (day > 1) { const cleared = {}; for (let i = 1; i < day; i++) cleared[i] = 1; localStorage.setItem('bw.depot.story.v1', JSON.stringify({ v: 1, v2: 1, mode: 'story', day, cleared, intro: { 1: 1 } })); }
}, DAY);
await p.goto(BASE + '?' + Q, { timeout: 180000 });
await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await p.evaluate(() => { const r = window.__jj.renderer, ws = window.__jj.worldRoot.parent, o = r.render.bind(r); window.__wr = 0; r.render = (sc, c) => { if (sc === ws) window.__wr++; return o(sc, c); }; });
await p.waitForTimeout(3000);
await p.evaluate(() => window.__jj.teleport(-492, 496.6)); await p.waitForTimeout(2500);
await p.keyboard.press('e');
await p.waitForFunction(() => window.__jj.depot.active, null, { timeout: 150000 });
await p.waitForTimeout(6000);
if (DAY && process.env.STORY) await p.waitForFunction(() => document.body.classList.contains('dp-story-lock'), null, { timeout: 15000 }).catch(() => {}); // 그날 첫 대화가 열릴 때까지
if (DAY && process.env.STORY && await p.evaluate(() => document.body.classList.contains('dp-story-lock'))) { await p.keyboard.press('Escape'); await p.waitForTimeout(700); await p.keyboard.press('Enter'); await p.waitForTimeout(1200); } // 대화 중: [나가기] → 저장하고 출구로
if (process.env.CART) { // 카트에 상품을 담은 채(계산 안 함) 나가기 — 직원 정리·물리 몸체 정리 경로
  await p.evaluate(() => { const d = window.__jj.depot.interior._dbg; d.setMe(77, 11, 0); d.grabCart(); d.setCart(53.9, 40, 0); d.push(1.0, 1); for (const [id, lv, x, z] of [['soda', 'lower', 0, -0.2], ['water', 'lower', 0, 0.3], ['rice', 'upper', 0, 0.5], ['egg', 'upper', 0, -0.3]]) d.drop(id, lv, x, z, 0); d.run(1); });
  await p.waitForTimeout(1500);
}
if (mode === 'button') await p.evaluate(() => window.__jj.depot.leave());
else { await p.evaluate((cart) => { const i = window.__jj.depot.interior; if (cart) i._dbg.setCart(6, 1.5, 0); else { i.st.me.x = 6; i.st.me.z = 1.0; } }, !!process.env.CART); await p.waitForTimeout(500); await p.keyboard.press('e'); if (process.env.CART) { await p.waitForTimeout(800); await p.keyboard.press('e'); } }
// 나가기 → 최대 45초 안에 매장 상태가 풀려야 한다
const t0 = Date.now(); let left = false;
while (Date.now() - t0 < 45000) { await p.waitForTimeout(1000); const s = await p.evaluate(() => ({ a: window.__jj.depot.active, bz: window.__jj.depot.busy })); if (!s.a && !s.bz) { left = true; break; } }
if (!left) { const st = await p.evaluate(() => ({ a: window.__jj.depot.active, bz: window.__jj.depot.busy, fr: window.__fr, body: document.body.className, co: window.__jj.depot.interior?._dbg?.co && Object.keys(window.__jj.depot.interior._dbg.co).slice(0, 8) })); console.log('STUCK', JSON.stringify(st), errs.slice(0, 3)); await p.screenshot({ path: process.env.SHOT || '/tmp/depot-leave-stuck.png' }); }
assert.ok(left, 'depot leave never finished (active/busy stuck)');
// 5초 걷기 동안 프레임이 계속 흘러야 한다(소프트웨어 렌더라 최소만 요구)
await p.keyboard.down('w'); const f0 = await p.evaluate(() => ({ fr: window.__fr, gf: window.__gf, wr: window.__wr })); await p.waitForTimeout(5000); await p.keyboard.up('w');
const f1 = await p.evaluate(() => ({ fr: window.__fr, gf: window.__gf, wr: window.__wr }));
if (f1.gf - f0.gf < 3 || f1.wr - f0.wr < 3) { console.log('FROZEN VIEW', JSON.stringify({ gameFrames: f1.gf - f0.gf, worldRenders: f1.wr - f0.wr, active: await p.evaluate(() => window.__jj.depot.active) }), errs.slice(0, 2)); await p.screenshot({ path: process.env.SHOT || '/tmp/depot-leave-frozen.png' }); }
assert.ok(f1.fr - f0.fr >= 3, `frames stalled after leaving: ${f1.fr - f0.fr}`);
assert.ok(f1.gf - f0.gf >= 3, `game frame() loop stopped after leaving: ${f1.gf - f0.gf}`);
assert.ok(f1.wr - f0.wr >= 3, `world not rendered after leaving (screen stuck on the store): ${f1.wr - f0.wr}`);
assert.equal(await p.evaluate(() => document.body.classList.contains('depot-inside')), false, 'depot-inside class left on body');
assert.equal(errs.length, 0, 'console errors: ' + errs.slice(0, 3).join(' | '));
console.log(`depot leave ok (${mode}${mobile ? ' mobile' : ''}${process.env.STORY ? ' story' : ''}${DAY ? ' day' + DAY : ''} hour=${HOUR}) frames+${f1.gf - f0.gf} world+${f1.wr - f0.wr}`);
await b.close();
