// [econ-mobile] 그만둔 자리 이어하기(PC bf72209 bw.uiv2.resume.v1) 모바일 점검: 들어가서 역에서 떨어진 곳으로 옮김 → 저장(4초) → 시작화면 '계속하기' → 입장 카드 → 입장 위치
// 사용: BASE=http://127.0.0.1:5191 W=852 H=393 OUT=/tmp/m-resume-after node scripts/shots-econ-mobile-resume.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:5191', OUT = process.env.OUT || '/tmp/m-resume';
const W = +(process.env.W || 852), H = +(process.env.H || 393), tag = `${W}x${H}`;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, userAgent: UA, locale: 'ko-KR' })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const tap = async (sel) => { const r = await p.locator(sel).boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); };
const joined = () => p.waitForFunction(() => !!window.__jj?.player?.visible && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 150000 });
const pos = () => p.evaluate(() => { const q = window.__jj.player.position; return { x: +q.x.toFixed(1), z: +q.z.toFixed(1) }; });
await p.goto(`${BASE}/?mobile=1&ui=v2&demo=econ&noticePopup=0&enter=1&npcs=0&shadow=0`);
await p.waitForSelector('#nick', { state: 'visible', timeout: 120000 });
await p.fill('#nick', '폰테스트');
await tap('#lobby-go'); await joined();
await p.waitForFunction(() => !!window.__bwEconDemo, null, { timeout: 60000 });
await p.evaluate(() => window.__bwEconDemo.dev.seed('fig03')); // 로그인 계정(mock)
await p.waitForTimeout(1500);
const p0 = await pos();
await p.evaluate(() => { const q = window.__jj.player.position; q.x += 30; q.z += 30; });
await p.waitForTimeout(5500); // 저장 주기 4초
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('bw.uiv2.resume.v1') || '{}'));
const savedPos = await pos();
console.log('station entry', JSON.stringify(p0), '· moved to', JSON.stringify(savedPos), '· saved keys', Object.keys(saved).join(','));
await p.goto(`${BASE}/?mobile=1&ui=v2&noticePopup=0&npcs=0&shadow=0`);
await p.waitForSelector('#m-landing [data-act="resume"]', { timeout: 60000 }); await p.waitForTimeout(1500);
console.log('landing →', await p.evaluate(() => document.querySelector('#m-landing [data-act="resume"]').innerText.replace(/\n+/g, ' ')));
await tap('#m-landing [data-act="resume"]');
await p.waitForSelector('#lobby-go', { state: 'visible', timeout: 150000 }); await p.waitForTimeout(800);
await tap('#lobby-go'); await joined();
await p.waitForFunction(() => { const l = document.getElementById('enter-loading'); return !l || l.hidden; }, null, { timeout: 120000 }).catch(() => {}); await p.waitForTimeout(4000);
if (process.env.DEBUG) console.log('overlays', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#enter-loading, .enter-card')].map((e) => [e.id || e.className, e.hidden, getComputedStyle(e).display, e.getClientRects().length, document.body.className]))));
const p1 = await pos();
const d = (a, c) => Math.hypot(a.x - c.x, a.z - c.z).toFixed(1);
console.log('landed', JSON.stringify(p1), `· from saved spot ${d(p1, savedPos)}m · from station entry ${d(p1, p0)}m →`, +d(p1, savedPos) < 3 ? 'RESUMED' : 'STATION');
await p.screenshot({ path: `${OUT}-${tag}.png` });
console.log(errs.length ? `page errors: ${errs.slice(0, 3).join(' / ')}` : 'no page errors');
await b.close();
