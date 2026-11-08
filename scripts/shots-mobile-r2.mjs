// [mobile] r2 레이아웃 점검: iPhone CriOS UA · 터치 · 안전 영역 흉내(?safe=59) 로 입장 → 각 상태 스크린샷
// 사용: BASE=http://172.30.0.2:4862 OUT=/workspace/bw-mobile-shots/r2 [W=852 H=393] [AT=yatap] [STATES=hud,menu,...] node scripts/shots-mobile-r2.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4862', OUT = process.env.OUT || '/tmp/r2';
const W = +(process.env.W || 852), H = +(process.env.H || 393), AT = process.env.AT || 'yatap', SAFE = process.env.SAFE ?? '59';
const STATES = (process.env.STATES || 'hud,audit').split(',');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: +(process.env.DPR || 1), isMobile: true, hasTouch: true, userAgent: UA, locale: 'ko-KR' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
const tag = `${W}x${H}`;
const shot = (n) => p.screenshot({ path: `${OUT}-${tag}-${n}.png`, timeout: 120000 });
const tap = async (sel) => { const r = await p.locator(sel).first().boundingBox(); if (!r) { console.log('no box', sel); return false; } await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(800); return true; };
await p.goto(`${BASE}/?mobile=1&noticePopup=0&enter=1&at=${AT}${SAFE ? '&safe=' + SAFE : ''}`);
await p.waitForSelector('#nick', { state: 'visible', timeout: 120000 });
await p.waitForTimeout(800);
if (STATES.includes('lobby')) await shot('lobby');
await p.fill('#nick', '폰테스트');
await tap('#lobby-go');
await p.waitForFunction(() => window.__jj?.ready && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 150000 });
await p.waitForTimeout(5000);
const audit = () => p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('#m-hud') || el.tagName === 'CANVAS' || el.tagName === 'SCRIPT') continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    if (el.parentElement && el.parentElement !== document.body && getComputedStyle(el.parentElement).position !== 'static' && el.parentElement.closest('body > *') !== el) { /* 하위 요소는 건너뜀 */ if (el.parentElement !== document.body) continue; }
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
    out.push(`${el.tagName.toLowerCase()}#${el.id}.${[...el.classList].join('.')} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}] z=${cs.zIndex} "${(el.innerText || '').replace(/\s+/g, ' ').slice(0, 40)}"`);
  }
  return out;
});
const ACT = {
  hud: async () => {},
  audit: async () => { console.log((await audit()).join('\n')); },
  menu: async () => { await tap('#m-hud [data-tg="menu"]'); },
  map: async () => { await tap('#m-hud [data-tg="map"]'); },
  phone: async () => { await tap('#m-hud [data-tg="phone"]'); await p.waitForTimeout(600); },
  emote: async () => { await tap('#m-hud [data-tg="emote"]'); },
  chat: async () => { await tap('#m-hud [data-act="talk"]'); },
  inv: async () => { await tap('#m-hud [data-act="bag"]'); },
  board: async () => { await tap('#m-hud [data-tg="menu"]'); await tap('#m-hud .m-tile[data-menu="board-Launcher"]'); await p.waitForTimeout(2500); },
  chatmsg: async () => { await p.evaluate(() => { for (const [n, c, x] of [['민지', '#ff9f43', '안녕하세요! 야탑 처음 와봐요'], ['지훈', '#5ac8fa', '버스 정류장 쪽으로 같이 가요'], ['폰테스트', '#ffe169', '좋아요 ㅎㅎ']]) dispatchEvent(new CustomEvent('bw:chat', { detail: { name: n, color: c, text: x, kind: n === '폰테스트' ? 'me' : 'remote' } })); }); await p.waitForTimeout(400); },
  bgm: async () => { await tap('#m-hud [data-tg="bgm"]'); },
  camera: async () => { await tap('#m-hud [data-tg="phone"]'); await p.waitForTimeout(500); await tap('#handset [data-app="x:camera"]'); await p.waitForFunction(() => !!document.querySelector('.cam-root'), null, { timeout: 20000 }); await p.waitForTimeout(900); },
  review: async () => { await ACT.camera(); await tap('.cam-shutter'); await p.waitForFunction(() => !!window.__jj.cameraApp && !document.querySelector('.cam-review')?.hidden, null, { timeout: 20000 }); await p.waitForTimeout(1200); await p.evaluate(() => document.activeElement?.blur?.()); await p.waitForTimeout(300); },
  photos: async () => { await ACT.review(); await tap('.cr-btn.blue'); await p.waitForTimeout(800); await tap('[data-r="done"]'); await p.waitForTimeout(600); await tap('#m-hud [data-tg="phone"]'); await p.waitForTimeout(500); await tap('#handset [data-app="x:photos"]'); await p.waitForTimeout(1500); },
  stop: async () => { await p.evaluate(() => { const s = __jj.ride.debug.setupBus(50, 260, true) || __jj.ride.debug.setupBus(); if (s) __jj.teleport(s.x, s.z); }); await p.waitForTimeout(1500); },
  stopsheet: async () => { await tap('#m-hud [data-act="stop"]'); await p.waitForTimeout(600); },
  labels: async () => { await p.evaluate(() => { __jj.setMode('follow'); __jj.cam.dist = 14; __jj.cam.pitch = 0.25; }); await p.waitForTimeout(1500); },
  presence: async () => { await tap('#m-hud [data-act="presence"]'); },
};
const reset = async () => { if (process.env.NORESET) return; await p.evaluate(() => { document.activeElement?.blur?.(); document.querySelector('#board-modal .board-close')?.click(); window.__jjHandset?.close?.(); }); await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(500); };
for (const s of STATES) {
  if (!ACT[s]) continue;
  await ACT[s]();
  if (s !== 'audit') { await shot(s); if (process.env.AUDIT_EACH) console.log('--', s, '\n' + (await audit()).join('\n')); await reset(); }
}
console.log(errs.slice(0, 10).join('\n') || 'no page errors');
await b.close();
