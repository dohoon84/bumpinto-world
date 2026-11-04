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
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 }).catch((e) => console.log(`  (스크린샷 ${name} 실패: ${e.message.split('\n')[0]})`));
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
  p.setDefaultTimeout(90000);
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
    await p.waitForTimeout(4000);
    // 이미 있는 계정(같은 dev sub)에 새 기기로 들어오면 대표 캐릭터를 맞추려고 새로고침 → 시작 화면으로 돌아온다(2번째 기기와 같은 흐름)
    // 시작 화면(12dd645~): 로그인된 계정이면 '계속하기 · {이름}'([data-v2=account]), 예전 빌드는 '게스트로 계속'([data-v2=guest])
    const back = await p.waitForFunction(() => {
      const vis = (sel) => { const e = document.querySelector(sel); return !!(e && e.getClientRects().length); };
      return vis('[data-v2=account]') ? 'account' : vis('[data-v2=guest]') ? 'guest' : vis('[data-enter-at=pangyo]') ? 'gate' : null;
    }, null, { timeout: 60000, polling: 300 }).then((h) => h.jsonValue()).catch(() => null);
    if (back === 'account' || back === 'guest') {
      const s0 = await api(p, '/econ/state');
      await shot(p, `${tag}-0-start-signed-in`);
      if (back === 'account') {
        const label = ((await p.locator('[data-v2=account]').first().textContent().catch(() => '')) || '').trim();
        check(`${tag}: (기존 계정 · 새 기기) 시작 화면 '계속하기 · 이름'`, /^계속하기 · .+/.test(label) && s0.body?.session?.signedIn === true, label);
      } else check(`${tag}: (기존 계정 · 새 기기) 새로고침 뒤 로그인 유지`, s0.body?.session?.signedIn === true, '시작 화면 → 게스트로 계속(쿠키 세션, 12dd645 이전 빌드)');
      globalThis.__adopted = true;
      await click(p, `[data-v2=${back}]`);
    }
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
    const h = globalThis.__adopted ? null : await p.waitForFunction(() => [...document.querySelectorAll('.ve-toast')].map((x) => x.textContent.replace(/\s+/g, ' ')).find((x) => /20,000/.test(x)) || null, null, { timeout: 120000, polling: 200 }).catch(() => null);
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
    if (globalThis.__adopted) console.log('  (기존 계정이라 웰컴 토스트는 건너뜀 — 처음 계정은 npm run dev:all:reset 후)');
    else check(`${tag}: 웰컴 토스트(20,000)`, /20,000/.test(toast), toast.slice(0, 90));
    await p.waitForTimeout(6000);
    const balTxt = await p.locator('[data-ve=bal-v]').first().textContent().catch(() => '');
    check(`${tag}: 잔액 칩`, /\d/.test(balTxt || ''), `칩 ${balTxt} · 서버 total ${st.body?.balance?.total ?? JSON.stringify(st.body?.balance)}`);
    await shot(p, `${tag}-2-balance-chip`);
    await click(p, '[data-ve=move]');
    await p.waitForTimeout(2000);
    await shot(p, `${tag}-3-quest-sheet`);
    const sheet = await p.locator('[data-tab=daily]').first().isVisible().catch(() => false);
    check(`${tag}: 할 일 시트 열림(매일·주간·월간)`, sheet);
    await p.keyboard.press('Escape');
    const before = await api(p, '/econ/state');
    const r = await busRide(p);
    await p.waitForTimeout(2500);
    const after = await api(p, '/econ/state');
    const acct = after.body?.session?.accountId;
    const ev = d1(`SELECT mode, ref, listed_amount, charged_amount FROM econ_events WHERE account_id = '${String(acct).replace(/[^0-9a-f-]/g, '')}' AND mode = 'bus' ORDER BY rowid DESC LIMIT 1`)[0];
    check(`${tag}: 무료 버스 탑승 기록(정가)`, r.ok && r.free && ev && ev.charged_amount === 0 && ev.listed_amount > 0, `fare ok=${r.ok} free=${r.free} · econ_events ${JSON.stringify(ev)} · 잔액 ${before.body?.balance?.total} → ${after.body?.balance?.total}`);
    await shot(p, `${tag}-4-after-bus`);
    const led = await api(p, '/econ/ledger?limit=10');
    const fr = (Array.isArray(led.body) ? led.body : []).find((x) => x.kind === 'fare');
    check(`${tag}: 지갑 요금 줄 rideId(무료 0원 · 정가)`, fr && fr.rideId && fr.delta === 0 && fr.listAmount > 0 && fr.mode === 'bus', fr ? `${fr.title?.ko} rideId=${fr.rideId} delta=${fr.delta} listAmount=${fr.listAmount}` : '없음');
    await p.evaluate(async () => (await import('/src/ui-v2/econ-ui/index.js')).open('11')); // 11 탈것 상점(미리보기)
    await p.waitForTimeout(1500);
    await shot(p, `${tag}-5-shop-preview`);
    check(`${tag}: 상점 화면 '준비중'`, await p.getByText('미리보기 · 준비중').first().isVisible().catch(() => false));
    await p.keyboard.press('Escape');
    const shop = await api(p, '/econ/shop');
    const items = shop.body?.items || [];
    const buy = await api(p, '/econ/shop/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: 'roadbike' }) });
    const after2 = await api(p, '/econ/state');
    check(`${tag}: 상점 미리보기(4개 준비중, 구매 거절)`, items.length === 4 && items.every((i) => i.available === false && i.comingSoon) && buy.status === 409 && buy.body?.error?.code === 'coming_soon' && after2.body?.balance?.total === after.body?.balance?.total,
      `${items.map((i) => `${i.name?.ko} ${i.price}`).join(' · ')} · buy HTTP ${buy.status} ${buy.body?.error?.code}`);
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
  p.setDefaultTimeout(90000);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const tap = async (sel) => { const r = await p.locator(sel).first().boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700); };
  const v2 = mode.startsWith('v2'); // v2guest · v2account = 모바일 경제 UI(?ui=v2, feat/econ-ui-mobile)
  const tag = `mobile-${eng}-${mode}`;
  await p.goto(`${MBASE}/?mobile=1${v2 ? '&ui=v2' : ''}&noticePopup=0`);
  const cfg = await api(p, '/auth/config');
  check(`${tag}: /auth/config (${new URL(MBASE).host})`, cfg.status === 200, `devLogin=${cfg.body?.devLogin} · isSecureContext=${await p.evaluate(() => isSecureContext)}`);
  const enter = async (first = true) => {
    await p.waitForSelector('#m-landing [data-act="pick"]', { timeout: 90000 }); await p.waitForTimeout(600);
    if (first) await shot(p, `${tag}-1-landing`);
    await tap('#m-landing [data-act="pick"]');
    await tap('#m-landing [data-stn]:nth-child(2)');
    await tap('#m-landing [data-act="go"]');
    // 로그인된 계정은 로비(닉네임)를 건너뛸 수 있다 → 닉네임 칸 또는 게임 준비 중 먼저 오는 쪽
    await p.waitForFunction(() => { const n = document.querySelector('#nick'); return (n && n.getClientRects().length) || (window.__jj?.ready && !document.body.classList.contains('in-lobby')); }, null, { timeout: 120000, polling: 500 })
      .catch(async (e) => { await shot(p, `${tag}-x-enter-timeout`); throw e; });
    if (await p.locator('#nick').isVisible().catch(() => false)) {
      if (await p.locator('#nick').isEditable().catch(() => false)) await p.fill('#nick', mode.includes('guest') ? '폰게스트' : '폰계정');
      await tap('#lobby-go');
    }
    await p.waitForFunction(() => window.__jj?.ready && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 120000 });
    await p.waitForTimeout(4000);
  };
  p.__enter = enter;
  await enter();
  await shot(p, `${tag}-2-hud`);
  if (v2) return mobileV2(p, ctx, b, tag, mode, tap, errs);
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

async function mobileV2(p, ctx, b, tag, mode, tap, errs) {
  const balTxt = async () => ((await p.locator('.m-econ-bal').first().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  await p.waitForSelector('.m-econ-bal', { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  check(`${tag}: 프로필 칩 잔액`, (await p.locator('.m-econ-bal').count()) > 0, await balTxt());
  await tap('#m-hud [data-tg="menu"]');
  await shot(p, `${tag}-3-menu`);
  check(`${tag}: ☰ 메뉴 bum 묶음`, (await p.locator('.m-econ-sec [data-econ]').count()) >= 4);
  if (mode === 'v2guest') {
    const st = await api(p, '/econ/state');
    check(`${tag}: 게스트 · 잔액 0`, st.body?.session?.signedIn === false && (st.body?.balance?.total || 0) === 0);
    await tap('.m-econ-sec [data-econ="11"]');
    await p.waitForTimeout(1500);
    await shot(p, `${tag}-4-shop-preview`);
    check(`${tag}: 상점 미리보기 '준비중'`, await p.getByText('미리보기 · 준비중').first().isVisible().catch(() => false));
  } else {
    await tap('.m-econ-sec [data-econ="link"]');
    const dev = p.locator('text=개발용 로그인 (로컬) >> visible=true').first();
    await dev.waitFor({ timeout: 30000 }).catch(() => {});
    await shot(p, `${tag}-4-signin`);
    check(`${tag}: 개발용 로그인 버튼(LAN)`, await dev.isVisible().catch(() => false));
    const bb = await dev.boundingBox().catch(() => null);
    if (bb) await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await p.waitForTimeout(6000);
    // 기존 계정 + 새 기기 → 대표 캐릭터 맞추려고 새로고침 → 첫 화면부터 다시(로그인은 쿠키로 유지)
    await p.waitForFunction(() => { const l = document.querySelector('#m-landing [data-act="pick"]'); return (l && l.getClientRects().length) || /\d/.test(document.querySelector('.m-econ-bal')?.textContent || ''); }, null, { timeout: 120000, polling: 500 }).catch(() => {});
    if (await p.locator('#m-landing [data-act="pick"]').isVisible().catch(() => false)) { console.log('  (새로고침됨 → 다시 입장)'); await p.__enter(false); await p.waitForTimeout(3000); }
    await shot(p, `${tag}-5-signed-in`);
    const st = await api(p, '/econ/state');
    const chip = await balTxt();
    check(`${tag}: 로그인됨 · 칩 잔액 = 서버`, st.body?.session?.signedIn === true && chip.replace(/\D/g, '').includes(String(st.body?.balance?.total)), `칩 '${chip}' · 서버 ${st.body?.balance?.total}`);
    await p.locator('.m-econ-q').first().click({ force: true }).catch(() => {});
    await p.waitForTimeout(1500);
    await shot(p, `${tag}-6-quests`);
    check(`${tag}: 할 일 시트`, await p.locator('[data-tab=daily]').first().isVisible().catch(() => false));
    await p.reload(); await p.waitForTimeout(5000);
    check(`${tag}: 새로고침 뒤 로그인 유지`, (await api(p, '/econ/state')).body?.session?.signedIn === true);
  }
  check(`${tag}: 페이지 오류 없음`, !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
}

for (const [k, fn] of [['pc', pc], ['mobile', mobile]]) {
  if (ONLY && ONLY !== k) continue;
  for (const m of (process.env.MODES || (k === 'mobile' ? 'guest,account,v2guest,v2account' : 'guest,account')).split(',')) {
    try { await fn(m); } catch (e) { check(`${k}-${m}: 실행`, false, e.message.split('\n')[0]); }
  }
}
const bad = results.filter((r) => !r.ok);
console.log(`\nsmoke: ${results.length - bad.length}/${results.length} ok`);
process.exit(bad.length ? 1 : 0);
