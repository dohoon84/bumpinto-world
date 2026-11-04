// 로컬 전체 실행(npm run dev:all) 위에서 게스트 · 계정(개발용 로그인) 두 모드를 PC(1440x900, chromium) 와
// 모바일(852x393 가로, webkit 아이폰 프로필) 로 훑고 스크린샷을 남긴다.
//   BASE=http://localhost:5173  MBASE=http://<LAN IP>:5173  OUT=/tmp/shots  ONLY=pc|mobile  node scripts/smoke-local.mjs
// 실제 D1(로컬) 에 계정 행이 생긴다 — 매번 새 기기 id 라 서로 겹치지 않는다. 초기화는 npm run dev:all:reset.
import { chromium, webkit } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:5173';
const MBASE = process.env.MBASE || BASE;
const OUT = process.env.OUT || '/tmp/bw-smoke';
const ONLY = process.env.ONLY || '';
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? '✓' : '✗'} ${name}${info ? ' — ' + info : ''}`); };
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });
const api = (p, path, init) => p.evaluate(async ([path, init]) => { const r = await fetch('/_phone' + path, { credentials: 'include', ...(init || {}) }); const j = await r.json().catch(() => null); return { status: r.status, body: j?.data ?? j }; }, [path, init || null]);
const click = (p, sel) => p.locator(sel).first().click({ force: true, timeout: 20000 });
const busRide = (p) => p.evaluate(async () => { const { charge } = await import('/src/ride/fare.js'); return charge({ code: 'bus.base', mode: 'bus', meta: { route: 'smoke' } }); });

function d1(sql) {
  const out = execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'execute', 'bumpinto-accounts', '--local', '--json', '--command', sql], { cwd: new URL('../server/phone/', import.meta.url), env: { ...process.env, CI: '1' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out)[0]?.results || [];
}
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function pc(mode) {
  const b = await chromium.launch({ args: GL });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${BASE}/?ui=v2&noticePopup=0`);
  await p.waitForSelector('[data-v2=guest]', { timeout: 60000 });
  await p.waitForTimeout(1500);
  const tag = `pc-${mode}`;
  if (mode === 'guest') {
    await click(p, '[data-v2=guest]');
  } else {
    await click(p, '[data-v2=google]');
    await p.waitForSelector('text=개발용 로그인 (로컬)', { timeout: 20000 });
    await shot(p, `${tag}-0-signin-window`);
    await click(p, 'text=개발용 로그인 (로컬)');
    await p.waitForTimeout(2500);
    await shot(p, `${tag}-0a-signed-in-gate`);
  }
  await p.waitForSelector('[data-enter-at=pangyo]', { state: 'attached', timeout: 30000 }); await p.waitForTimeout(2500); await shot(p, `${tag}-0b-gate`);
  await click(p, '[data-enter-at=pangyo]:visible');
  await p.waitForSelector('#lobby-go', { state: 'visible', timeout: 60000 });
  await p.waitForTimeout(1500);
  await shot(p, `${tag}-0c-lobby`);
  await click(p, '#lobby-go');
  if (mode !== 'guest') {
    // 로그인 직후 보상(웰컴·첫 접속)은 게임에 들어온 뒤 토스트로 나온다
    const h = await p.waitForFunction(() => [...document.querySelectorAll('.ve-toast')].map((x) => x.textContent.replace(/\s+/g, ' ')).find((x) => /20,000/.test(x)) || null, null, { timeout: 120000, polling: 200 }).catch(() => null);
    globalThis.__toast = { text: h ? await h.jsonValue() : '' };
    await shot(p, `${tag}-1a-welcome-toast`);
  }
  await p.waitForFunction(() => { const h = document.getElementById('ve-hud'); return h && getComputedStyle(h).display !== 'none' && h.querySelector('.ve-row > *'); }, null, { timeout: 120000 });
  await p.waitForTimeout(mode === 'guest' ? 6000 : 3000);
  await shot(p, `${tag}-1-hud`);
  const st = await api(p, '/econ/state');
  if (mode === 'guest') {
    const link = await p.locator('[data-ve=link]').count();
    check(`${tag}: '구글 계정 연동하고 bum 받기' 보임`, link > 0 && await p.getByText('구글 계정 연동하고 bum 받기').first().isVisible(), `버튼 ${link}개`);
    check(`${tag}: 서버 상태 = 게스트`, st.status === 200 && st.body?.session?.signedIn === false, `HTTP ${st.status} signedIn=${st.body?.session?.signedIn}`);
    const r = await busRide(p);
    const st2 = await api(p, '/econ/state');
    const led = await api(p, '/econ/ledger');
    const rows = Array.isArray(led.body) ? led.body : (led.body?.rows || []);
    check(`${tag}: 버스 타도 적립 없음`, st2.body?.session?.signedIn === false && (st2.body?.balance?.total || 0) === 0 && !rows.length, `fare ok=${r.ok} amount=${r.amount} · 잔액 ${st2.body?.balance?.total} · 원장 HTTP ${led.status} ${rows.length}행`);
    await click(p, '[data-ve=link]').catch(() => {});
    await p.waitForTimeout(1200);
    await shot(p, `${tag}-2-link-prompt`);
  } else {
    const toast = globalThis.__toast?.text || '';
    check(`${tag}: 웰컴 토스트(20,000)`, /20,000/.test(toast), toast.slice(0, 90));
    await p.waitForTimeout(6000);
    const balTxt = await p.locator('[data-ve=bal-v]').first().textContent().catch(() => '');
    check(`${tag}: 잔액 칩`, /\d/.test(balTxt || ''), `칩 ${balTxt} · 서버 total ${st.body?.balance?.total ?? JSON.stringify(st.body?.balance)}`);
    await shot(p, `${tag}-2-balance-chip`);
    await click(p, '[data-ve=move]');
    await p.waitForTimeout(2000);
    await shot(p, `${tag}-3-quest-sheet`);
    const sheet = await p.getByText('D-LOGIN').first().isVisible().catch(() => false);
    check(`${tag}: 할 일 시트 열림`, sheet);
    await p.keyboard.press('Escape');
    const before = await api(p, '/econ/state');
    const r = await busRide(p);
    await p.waitForTimeout(2500);
    const after = await api(p, '/econ/state');
    const acct = after.body?.session?.accountId;
    const ev = d1(`SELECT mode, ref, listed_amount, charged_amount FROM econ_events WHERE account_id = '${String(acct).replace(/[^0-9a-f-]/g, '')}' AND mode = 'bus' ORDER BY rowid DESC LIMIT 1`)[0];
    check(`${tag}: 무료 버스 탑승 기록(정가)`, r.ok && r.free && ev && ev.charged_amount === 0 && ev.listed_amount > 0, `fare ok=${r.ok} free=${r.free} · econ_events ${JSON.stringify(ev)} · 잔액 ${before.body?.balance?.total} → ${after.body?.balance?.total}`);
    await shot(p, `${tag}-4-after-bus`);
    const shop = await api(p, '/econ/shop');
    const items = shop.body?.items || [];
    const buy = await api(p, '/econ/shop/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: 'roadbike' }) });
    const after2 = await api(p, '/econ/state');
    check(`${tag}: 상점 미리보기(4개 준비중, 구매 거절)`, items.length === 4 && items.every((i) => i.available === false && i.comingSoon) && buy.status === 409 && buy.body?.error?.reason === 'coming_soon' && after2.body?.balance?.total === after.body?.balance?.total,
      `${items.map((i) => `${i.name?.ko} ${i.price}`).join(' · ')} · buy HTTP ${buy.status} ${buy.body?.error?.code}/${buy.body?.error?.reason}`);
    await p.reload(); await p.waitForTimeout(4000);
    const st3 = await api(p, '/econ/state');
    check(`${tag}: 새로고침 뒤에도 로그인 유지`, st3.body?.session?.signedIn === true);
  }
  check(`${tag}: 페이지 오류 없음`, !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
}

async function mobile(mode) {
  // 기본 WebKit(아이폰 Chrome 도 WebKit). WebKit 실행 라이브러리가 없는 환경이면 MENGINE=chromium (아이폰 UA + 터치로 흉내)
  const eng = process.env.MENGINE || 'webkit';
  const b = eng === 'webkit' ? await webkit.launch() : await chromium.launch({ args: GL });
  const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, hasTouch: true, ...(eng === 'webkit' ? {} : { isMobile: true }), locale: 'ko-KR',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const tap = async (sel) => { const r = await p.locator(sel).first().boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700); };
  const tag = `mobile-${eng}-${mode}`;
  await p.goto(`${MBASE}/?mobile=1&noticePopup=0`);
  const cfg = await api(p, '/auth/config');
  check(`${tag}: /auth/config (${new URL(MBASE).host})`, cfg.status === 200, `devLogin=${cfg.body?.devLogin} · isSecureContext=${await p.evaluate(() => isSecureContext)}`);
  await p.waitForSelector('#m-landing [data-act="pick"]', { timeout: 90000 }); await p.waitForTimeout(600);
  await shot(p, `${tag}-1-landing`);
  await tap('#m-landing [data-act="pick"]');
  await tap('#m-landing [data-stn]:nth-child(2)');
  await tap('#m-landing [data-act="go"]');
  await p.waitForSelector('#nick', { state: 'visible', timeout: 90000 });
  await p.fill('#nick', mode === 'guest' ? '폰게스트' : '폰계정');
  await tap('#lobby-go');
  await p.waitForFunction(() => window.__jj?.ready && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 120000 });
  await p.waitForTimeout(4000);
  await shot(p, `${tag}-2-hud`);
  await tap('#m-hud [data-tg="menu"]');
  await shot(p, `${tag}-3-menu`);
  const tile = p.locator('.m-tile[data-menu="account-chip"]');
  const tileTxt = (await tile.first().textContent().catch(() => '')) || '';
  check(`${tag}: 메뉴에 계정 타일`, await tile.count() > 0, tileTxt.trim());
  await tap('.m-tile[data-menu="account-chip"]');
  await p.waitForTimeout(1200);
  await shot(p, `${tag}-4-account-panel`);
  if (mode === 'guest') {
    const st = await api(p, '/econ/state');
    check(`${tag}: 게스트 상태 · 잔액 0`, st.body?.session?.signedIn === false && (st.body?.balance?.total || 0) === 0);
  } else {
    const dev = p.getByText('개발용 로그인 (로컬)').first();
    check(`${tag}: 개발용 로그인 버튼(LAN)`, await dev.isVisible().catch(() => false));
    const bb = await dev.boundingBox().catch(() => null);
    if (bb) await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await p.waitForTimeout(3000);
    await shot(p, `${tag}-5-signed-in`);
    const st = await api(p, '/econ/state');
    check(`${tag}: 로그인됨 · 잔액`, st.body?.session?.signedIn === true, `잔액 ${st.body?.balance?.total}`);
    const ck = (await ctx.cookies()).find((c) => c.name === 'bw_s');
    check(`${tag}: bw_s 쿠키 (http LAN, Secure 없음)`, ck && !ck.secure, ck ? `sameSite=${ck.sameSite} secure=${ck.secure} httpOnly=${ck.httpOnly}` : '없음');
    await p.reload(); await p.waitForTimeout(5000);
    const st2 = await api(p, '/econ/state');
    check(`${tag}: 새로고침 뒤 로그인 유지`, st2.body?.session?.signedIn === true);
    await shot(p, `${tag}-6-after-reload`);
  }
  check(`${tag}: 페이지 오류 없음`, !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
}

for (const [k, fn] of [['pc', pc], ['mobile', mobile]]) {
  if (ONLY && ONLY !== k) continue;
  for (const m of (process.env.MODES || 'guest,account').split(',')) {
    try { await fn(m); } catch (e) { check(`${k}-${m}: 실행`, false, e.message.split('\n')[0]); }
  }
}
const bad = results.filter((r) => !r.ok);
console.log(`\nsmoke: ${results.length - bad.length}/${results.length} ok`);
process.exit(bad.length ? 1 : 0);
