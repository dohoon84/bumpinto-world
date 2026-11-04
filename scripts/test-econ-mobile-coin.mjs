// [econ-mobile] 모바일 코인 효과음 점검: 터치 전 무음(AudioContext 없음) → 터치 후 잠금 해제 → 05a/이동/게시판 보상 때 1번씩, 400 ms 안 겹침은 1번
// 사용: BASE=http://127.0.0.1:5191 node scripts/test-econ-mobile-coin.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:5191';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=user-gesture-required'] });
const p = await (await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true, locale: 'ko-KR' })).newPage();
await p.goto(`${BASE}/?mobile=1&ui=v2&demo=econ&noticePopup=0&enter=1&at=yatap&npcs=0&shadow=0`);
await p.waitForSelector('#nick', { state: 'visible', timeout: 120000 });
const before = await p.evaluate(() => window.__bwEconMobile?.coin?.state ?? 'not-mounted');
await p.fill('#nick', '소리');
const r = await p.locator('#lobby-go').boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
await p.waitForFunction(() => window.__jj?.ready && window.__bwEconMobile?.coin && !document.body.classList.contains('in-lobby'), null, { timeout: 150000 });
const afterLobby = await p.evaluate(() => window.__bwEconMobile.coin.state);
await p.touchscreen.tap(426, 200); await p.waitForTimeout(1500);
const s1 = await p.evaluate(() => ({ state: window.__bwEconMobile.coin.state, ready: window.__bwEconMobile.coin.ready }));
await p.evaluate(() => { window.__bwEconDemo.suppress(4000); window.__bwEconDemo.dev.seed('fig03'); });
await p.waitForTimeout(800);
await p.evaluate(() => window.__bwEconDemo.open('05a')); await p.waitForTimeout(1500);
await p.evaluate(() => { window.__bwEconDemo.suppress(0); return window.__bwEconDemo.dev.addWalkMinutes(60); }); await p.waitForTimeout(6000);
await p.evaluate(() => window.__bwEconDemo.dev.boardPost()); await p.waitForTimeout(6000); await p.evaluate(() => { window.__bwEconDemo.open('05a'); window.__bwEconDemo.open('05a2'); }); await p.waitForTimeout(6000);
await p.evaluate(() => { const c = window.__bwEconMobile.coin; c.play('quest'); c.play('quest'); });
const log = await p.evaluate(() => window.__bwEconMobile.coin.debug());
console.log(JSON.stringify({ before, afterLobby, s1 }));
for (const e of log) console.log(JSON.stringify(e));
const played = log.filter((e) => e.play);
const ok = s1.state === 'running' && played.length >= 2 && played.every((e, i) => !i || e.t - played[i - 1].t >= 400) && log.some((e) => !e.play) && log.some((e) => e.kind === 'travel' && e.short) && log.some((e) => e.kind === 'board' && e.short);
console.log(ok ? 'coin sound: ok' : 'coin sound: CHECK');
await b.close();
