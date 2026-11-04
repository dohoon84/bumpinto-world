// [econ-mobile] 모바일 시작화면(src/mobile/landing.js) '계속하기' 점검 스크린샷:
//   ?ui=v2 + 로그인 계정 → '계속하기 · {계정}' / ?ui=v2 게스트 → 기존 '이어서 입장 · {캐릭터}' / 기본 UI → 기존 그대로
// 사용: BASE=http://127.0.0.1:5191 W=852 H=393 OUT=/tmp/ml node scripts/shots-econ-mobile-landing.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:5191', OUT = process.env.OUT || '/tmp/ml';
const W = +(process.env.W || 852), H = +(process.env.H || 393), tag = `${W}x${H}`;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, userAgent: UA, locale: 'ko-KR' })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/?mobile=1&ui=v2&demo=econ&noticePopup=0&enter=1&at=yatap&npcs=0&shadow=0`);
await p.waitForSelector('#nick', { state: 'visible', timeout: 120000 });
await p.fill('#nick', '폰테스트');
const r = await p.locator('#lobby-go').boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
await p.waitForFunction(() => !!window.__bwEconDemo && !document.body.classList.contains('in-lobby'), null, { timeout: 150000 });
const land = async (qs, name) => {
  await p.goto(`${BASE}/?mobile=1${qs}&noticePopup=0`);
  await p.waitForSelector('#m-landing .m-start-sheet', { timeout: 60000 });
  await p.waitForTimeout(1500);
  const txt = await p.evaluate(() => document.querySelector('#m-landing .m-start-sheet').innerText.replace(/\n+/g, ' | '));
  await p.screenshot({ path: `${OUT}-${name}-${tag}.png` });
  console.log(name, '→', txt);
};
await p.evaluate(() => window.__bwEconDemo.dev.seed('fig03'));
await land('&ui=v2', 'landing-acct');
await land('', 'landing-default-acct');
// 로그인 '계속하기' → 게스트 입장 화면 없이 마지막 역(야탑)으로 바로
await p.evaluate(() => localStorage.setItem('bw.uiv2.lastStation', JSON.stringify({ region: 'jeongja', at: 'yatap', t: Date.now() })));
await land('&ui=v2', 'landing-acct-last');
{ const r = await p.locator('#m-landing [data-act="resume"]').boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); }
await p.waitForFunction(() => !document.getElementById('m-landing'), null, { timeout: 30000 });
await p.waitForTimeout(4000);
const go = await p.evaluate(() => ({ url: location.search, lobby: document.body.classList.contains('in-lobby'), lobbyVisible: !!document.querySelector('#lobby') && getComputedStyle(document.querySelector('#lobby')).display !== 'none' && document.body.classList.contains('in-lobby') }));
console.log('resume-account →', JSON.stringify(go));
await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 150000 }).catch(() => {});
await p.waitForTimeout(2000); await p.screenshot({ path: `${OUT}-landing-acct-entered-${tag}.png` });
await p.evaluate(() => localStorage.removeItem('bw.uiv2.econ.mock.v1')); // mock 상태 지움 = 게스트
await land('&ui=v2', 'landing-guest');
console.log(errs.length ? errs.join('\n') : 'no page errors');
await b.close();
