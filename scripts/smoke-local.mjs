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
const chipTotal = (t) => { const m = /(\d+)\s*\/\s*(\d+)/.exec(t || ''); return m ? +m[2] : -1; };
// 할 일 시트(매일 탭)의 목록 행 수 — 보너스 D-ALL3 카드는 칩 total 에 들어가지 않으므로 뺌
const qRows = (p) => p.locator('.ve-quests .ve-qlist .ve-qcard:not([data-quest="D-ALL3"])').count().catch(() => 0);
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 }).catch((e) => console.log(`  (스크린샷 ${name} 실패: ${e.message.split('\n')[0]})`));
const api = (p, path, init) => p.evaluate(async ([path, init]) => { const r = await fetch('/_phone' + path, { credentials: 'include', ...(init || {}) }); const j = await r.json().catch(() => null); return { status: r.status, body: j?.data ?? j }; }, [path, init || null]);
const click = (p, sel) => p.locator(sel).first().click({ force: true, timeout: 20000 });
const busRide = (p) => p.evaluate(async () => { const { charge } = await import('/src/ride/fare.js'); return charge({ code: 'bus.base', mode: 'bus', meta: { route: 'smoke' } }); });

function d1(sql) {
  const out = execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'execute', 'bumpinto-accounts', '--local', '--json', '--command', sql], { cwd: new URL('../server/phone/', import.meta.url), env: { ...process.env, CI: '1' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out)[0]?.results || [];
}
// 입장 카드(lobby.js) 상태 — a611504~: 로그인됨 = #lobby-card.is-account(탭·PIN·번호 줄 없음, 계정 캐릭터 + 입장하기 한 번), 게스트(dev:all) = '내 번호 010-…'
const lobbyState = (p) => p.evaluate(() => {
  const vis = (sel) => { const e = document.querySelector(sel); if (!e || !e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const card = document.querySelector('#lobby-card');
  return { checking: !!card?.classList.contains('is-acct-checking'), account: !!card?.classList.contains('is-account'),
    tabs: vis('.lobby-tabs'), pin: vis('#lobby-pin'), loginPin: vis('#login-pin'), nick: vis('#nick'), phone: vis('#lobby-phone'), go: vis('#lobby-go'),
    acctBox: vis('#lobby-acct'), acctName: document.querySelector('#lobby-acct-name')?.textContent?.trim() || '',
    phoneText: (document.querySelector('#lobby-phone')?.textContent || '').replace(/\s+/g, ' ').trim(), sub: (document.querySelector('#lobby-sub')?.textContent || '').trim(),
    goText: (document.querySelector('#lobby-go')?.textContent || '').trim(), bodyText: (card?.textContent || '').replace(/\s+/g, ' ') };
});
// 계정 확인(최대 2.5초)이 끝나 카드가 게스트/계정 중 하나로 그려질 때까지
const lobbySettled = (p) => p.waitForFunction(() => { const c = document.querySelector('#lobby-card'); if (!c || c.classList.contains('is-acct-checking')) return false;
  return c.classList.contains('is-account') ? !!document.querySelector('#lobby-acct-name')?.textContent?.trim() : /\d{3}-\d{3,4}-\d{4}|로컬 테스트 모드/.test(document.querySelector('#lobby-phone')?.textContent || ''); }, null, { timeout: 30000, polling: 300 }).catch(() => null);
function lobbyChecks(tag, mode, L) {
  if (mode.includes('guest')) {
    check(`${tag}: 게스트 입장 카드 '내 번호 010-…'`, /^내 번호 010-\d{3,4}-\d{4}/.test(L.phoneText) && !/로컬 테스트 모드/.test(L.bodyText) && !L.account, L.phoneText.slice(0, 60));
  } else {
    check(`${tag}: 로그인 입장 카드 = 계정 모드(PIN·탭·번호 없음)`, L.account && L.acctBox && !L.tabs && !L.pin && !L.loginPin && !L.phone && L.go,
      `이름 '${L.acctName}' · ${L.sub.slice(0, 40)} · 탭 ${L.tabs} · PIN ${L.pin}/${L.loginPin} · 번호 ${L.phone} · 버튼 '${L.goText}'`);
    if (L.nick) console.log('  (첫 로그인 — 대표 캐릭터가 없어 편집기를 PIN 없이 보여 줌)');
    else check(`${tag}: 로그인 입장 카드 간단(캐릭터 고르기 없음 · 입장하기 한 번)`, !L.nick && L.goText === '입장하기', `버튼 '${L.goText}'`);
  }
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
      globalThis.__adopted = true; globalThis.__back = back;
      await click(p, `[data-v2=${back}]`);
    }
    await shot(p, `${tag}-0a-signed-in-gate`);
  }
  // 9d48af4~: '계속하기 · 이름' 은 게이트 없이 바로 마지막 역(없으면 정자역) 입장 카드로
  const where = await p.waitForFunction(() => { const v = (sel) => { const e = document.querySelector(sel); return !!(e && e.getClientRects().length); };
    return v('#lobby-go') ? 'lobby' : v('[data-enter-at=pangyo]') ? 'gate' : null; }, null, { timeout: 60000, polling: 300 }).then((h) => h.jsonValue()).catch(() => null);
  if (globalThis.__adopted && globalThis.__back === 'account') check(`${tag}: '계속하기' → 게이트 없이 바로 입장 카드`, where === 'lobby', `처음 보인 화면 ${where}`);
  if (where !== 'lobby') {
    await p.waitForSelector('[data-enter-at=pangyo]', { state: 'attached', timeout: 30000 }); await p.waitForTimeout(2500); await shot(p, `${tag}-0b-gate`);
    await click(p, '[data-enter-at=pangyo]:visible');
  }
  await p.waitForSelector('#lobby-go', { state: 'visible', timeout: 60000 });
  await lobbySettled(p);
  await p.waitForTimeout(1500);
  await shot(p, `${tag}-0c-lobby`);
  const L0 = await lobbyState(p);
  lobbyChecks(tag, mode, L0);
  // 번호부가 켜진 dev:all(a611504~)에서 처음 온 게스트는 닉네임이 비어 있다 → 채워야 입장
  if (L0.nick && !(await p.inputValue('#nick').catch(() => '')).trim()) await p.fill('#nick', mode === 'guest' ? '피시게스트' : '피시계정');
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
    { // HUD 할 일 칩 total = 목록 행 수 (dcd7925 dailySlots 고침 확인)
      const chip = ((await p.locator('[data-ve=quest] b').first().textContent().catch(() => '')) || '').trim();
      const sheetRows = await qRows(p);
      check(`${tag}: 할 일 칩 total = 시트 매일 목록 행 수(보너스 D-ALL3 제외)`, chipTotal(chip) === sheetRows, `칩 '${chip}' · 시트 행 ${sheetRows}`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(600);
      await click(p, '[data-ve=quest]').catch(() => {}); await p.waitForTimeout(1000);
      const trk = await p.locator('.ve-trow').count().catch(() => 0);
      const chip2 = ((await p.locator('[data-ve=quest] b').first().textContent().catch(() => '')) || '').trim();
      await shot(p, `${tag}-3b-quest-tracker`);
      check(`${tag}: 할 일 칩 total = 트래커 목록 행 수`, chipTotal(chip2) === trk, `칩 '${chip2}' · 트래커 행 ${trk}`);
      await click(p, '[data-ve=quest]').catch(() => {}); await p.waitForTimeout(500);
    }
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
  if (mode === 'v2entry') return entryMobileAccount();
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
    // 입장 카드(게스트: 닉네임 칸 · 로그인됨: 계정 카드) 또는 바로 게임 — 계정 확인이 끝난 뒤에 본다
    await p.waitForFunction(() => { const c = document.querySelector('#lobby-card'); const g = document.querySelector('#lobby-go');
      return (c && !c.classList.contains('is-acct-checking') && g && g.getClientRects().length) || (window.__jj?.ready && !document.body.classList.contains('in-lobby')); }, null, { timeout: 120000, polling: 500 })
      .catch(async (e) => { await shot(p, `${tag}-x-enter-timeout`); throw e; });
    if (await p.locator('#lobby-go').isVisible().catch(() => false)) {
      await lobbySettled(p);
      const L = await lobbyState(p);
      p.__lobby = p.__lobby || []; p.__lobby.push(L);
      await shot(p, `${tag}-${first ? '1b' : '5a'}-lobby`);
      if (L.nick && await p.locator('#nick').isEditable().catch(() => false)) await p.fill('#nick', mode.includes('guest') ? '폰게스트' : '폰계정');
      await tap('#lobby-go');
    }
    await p.waitForFunction(() => window.__jj?.ready && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 120000 });
    await p.waitForTimeout(4000);
  };
  p.__enter = enter;
  await enter();
  if (p.__lobby?.[0]) lobbyChecks(mode.includes('guest') ? tag : `${tag} (처음 · 게스트)`, 'guest', p.__lobby[0]);
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
    // 로그인된 채로 다시 입장 → 계정 입장 카드(PIN·탭 없음, 입장하기 한 번)
    const n0 = p.__lobby?.length || 0;
    await p.__enter(false);
    if ((p.__lobby?.length || 0) > n0) lobbyChecks(tag, 'account', p.__lobby.at(-1)); else check(`${tag}: 로그인 입장 카드 = 계정 모드`, false, '입장 카드를 못 봄');
    await shot(p, `${tag}-6-after-reload`);
  }
  check(`${tag}: 페이지 오류 없음`, !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
}

// 모바일 ?mobile=1&ui=v2 — 로그인(개발용) 뒤 시작화면 '계속하기 · 이름' → 마지막 역(없으면 정자역) 입장 카드(계정 모드) 바로. 스크린샷 entry-mobile-account-*
async function entryMobileAccount() {
  const eng = process.env.MENGINE || 'webkit';
  const b = await (eng === 'webkit' ? webkit : chromium).launch(eng === 'webkit' ? {} : { args: GL });
  const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, hasTouch: true, ...(eng === 'webkit' ? {} : { isMobile: true }), locale: 'ko-KR',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage();
  p.setDefaultTimeout(90000);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const tap = async (sel) => { const r = await p.locator(sel).first().boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700); };
  const tag = 'entry-mobile-account';
  const sh = (n) => p.screenshot({ path: `${OUT}/${tag}-${n}.png`, timeout: 120000 }).catch((e) => console.log(`  (스크린샷 ${n} 실패: ${e.message.split('\n')[0]})`));
  const URL0 = `${MBASE}/?mobile=1&ui=v2&noticePopup=0`;
  await p.goto(URL0);
  await p.waitForSelector('#m-landing [data-act="pick"]', { timeout: 90000 });
  // 개발용 로그인 = 메뉴 '개발용 로그인 (로컬)' 버튼과 같은 호출(signin.devLogin) + 같은 대표 캐릭터 맞춤(adoptPrimary)
  const r = await p.evaluate(async () => { const m = await import('/src/account/signin.js'); const r = await m.devLogin(m.currentDeviceId()); if (r.ok && r.primaryUserId) m.adoptPrimary(r.primaryUserId, { delayMs: 999999 }); return { ok: r.ok, status: r.status, primary: !!r.primaryUserId }; });
  check(`${tag}: 개발용 로그인`, r.ok, `HTTP ${r.status} · 대표 캐릭터 ${r.primary ? '있음' : '없음'}`);
  const card = async (n) => {
    await p.waitForFunction(() => { const c = document.querySelector('#lobby-card'); const g = document.querySelector('#lobby-go');
      return (c && !c.classList.contains('is-acct-checking') && g && g.getClientRects().length) || (window.__jj?.ready && !document.body.classList.contains('in-lobby')); }, null, { timeout: 120000, polling: 500 }).catch(() => {});
    if (!(await p.locator('#lobby-go').isVisible().catch(() => false))) { await sh(`${n}-no-card`); return null; }
    await lobbySettled(p); await p.waitForTimeout(1200);
    const L = await p.evaluate(() => {
      const vis = (e) => { if (!e || !e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
      const SEL = { 'PIN (.lobby-pin-field/#lobby-pin)': '.lobby-pin-field, #lobby-pin', '탭 (.lobby-tabs)': '.lobby-tabs', '번호로 이어하기 (#lobby-pane-login)': '#lobby-pane-login',
        '캐릭터 고르기 (#lobby-pane-join)': '#lobby-pane-join', '닉네임 (#nick)': '#nick', '번호 줄 (#lobby-phone)': '#lobby-phone', '번호+Google 줄 (.v2-phone-row)': '.v2-phone-row',
        'Google 안내 (.v2-ghint)': '.v2-ghint', 'Google 저장 (.v2-save-google)': '.v2-save-google' };
      const shown = Object.entries(SEL).filter(([, q]) => [...document.querySelectorAll(q)].some(vis)).map(([k]) => k);
      const c = document.querySelector('#lobby-card');
      return { isAccount: !!c?.classList.contains('is-account'), signedIn: document.body.classList.contains('bw-signed-in'), shown,
        title: document.querySelector('#lobby-title')?.textContent?.trim() || '', name: document.querySelector('#lobby-acct-name')?.textContent?.trim() || '',
        go: document.querySelector('#lobby-go')?.textContent?.trim() || '', url: location.search };
    });
    await sh(n);
    return L;
  };
  // 1) 마지막 역 없음 → 정자역
  await p.evaluate(() => { try { localStorage.removeItem('bw.uiv2.lastStation'); } catch {} });
  await p.goto(URL0);
  const resume = p.locator('#m-landing [data-act="resume"].m-acct-go');
  await resume.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(800);
  await sh('1-start');
  const rtxt = ((await resume.first().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  check(`${tag}: 시작화면 '계속하기 · 이름'(로그인)`, /^계속하기 · /.test(rtxt), rtxt);
  if (await resume.isVisible().catch(() => false)) await tap('#m-landing [data-act="resume"].m-acct-go');
  const L1 = await card('2-card-jeongja');
  const report = (L, where) => {
    if (!L) { check(`${tag}: '계속하기' → ${where} 입장 카드`, false, '입장 카드가 안 나옴(바로 게임으로 들어감)'); return; }
    check(`${tag}: '계속하기' → ${where} 입장 카드`, where === '정자역' ? /정자/.test(L.title) : L.title.includes(where), `제목 '${L.title}' · ${L.url}`);
    check(`${tag}: #lobby-card.is-account · body.bw-signed-in`, L.isAccount && L.signedIn, `is-account=${L.isAccount} bw-signed-in=${L.signedIn}`);
    check(`${tag}: PIN·탭·캐릭터 고르기·번호 줄 숨김`, !L.shown.length, L.shown.length ? `보이는 것: ${L.shown.join(', ')}` : `이름 '${L.name}' · 버튼 '${L.go}'`);
  };
  report(L1, '정자역');
  if (L1) { await tap('#lobby-go'); await p.waitForFunction(() => window.__jj?.ready && !document.body.classList.contains('in-lobby'), null, { timeout: 120000 }).catch(() => {}); await p.waitForTimeout(3000); await sh('3-in-game'); }
  // 2) 다른 역에 한 번 들어간 뒤 → '계속하기' = 그 역
  await p.goto(URL0);
  await p.waitForSelector('#m-landing [data-act="pick"]', { timeout: 90000 }); await p.waitForTimeout(800);
  await tap('#m-landing [data-act="pick"]');
  const stn = p.locator('#m-landing [data-stn]:not(.on)').first();
  const stnLabel = ((await stn.textContent().catch(() => '')) || '').trim();
  await tap('#m-landing [data-stn]:not(.on)');
  await tap('#m-landing [data-act="go"]');
  const L2a = await card('4-card-picked');
  if (L2a) { await tap('#lobby-go'); await p.waitForFunction(() => window.__jj?.ready && !document.body.classList.contains('in-lobby'), null, { timeout: 120000 }).catch(() => {}); await p.waitForTimeout(2500); }
  const last = await p.evaluate(() => { try { return localStorage.getItem('bw.uiv2.lastStation'); } catch { return null; } });
  await p.goto(URL0);
  await resume.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(800);
  await sh('5-start-last');
  const rtxt2 = ((await resume.first().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  check(`${tag}: 시작화면에 마지막 역 표시`, rtxt2.includes(stnLabel.replace(/역$/, '')), `'${rtxt2}' · 고른 역 ${stnLabel} · 저장 ${last}`);
  if (await resume.isVisible().catch(() => false)) await tap('#m-landing [data-act="resume"].m-acct-go');
  const L2 = await card('6-card-last');
  report(L2, stnLabel.replace(/역$/, ''));
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
    if (await p.locator('#m-landing [data-act="pick"]').isVisible().catch(() => false)) {
      console.log('  (새로고침됨 → 다시 입장)'); const n0 = p.__lobby?.length || 0; await p.__enter(false); await p.waitForTimeout(3000);
      if ((p.__lobby?.length || 0) > n0) lobbyChecks(tag, 'account', p.__lobby.at(-1)); else check(`${tag}: 로그인 입장 카드 = 계정 모드`, false, '입장 카드를 못 봄');
    }
    await shot(p, `${tag}-5-signed-in`);
    const st = await api(p, '/econ/state');
    const chip = await balTxt();
    check(`${tag}: 로그인됨 · 칩 잔액 = 서버`, st.body?.session?.signedIn === true && chip.replace(/\D/g, '').includes(String(st.body?.balance?.total)), `칩 '${chip}' · 서버 ${st.body?.balance?.total}`);
    const mchip = ((await p.locator('.m-econ-n').first().textContent().catch(() => '')) || '').trim();
    await p.locator('.m-econ-q').first().click({ force: true }).catch(() => {});
    await p.waitForTimeout(1500);
    await shot(p, `${tag}-6-quests`);
    check(`${tag}: 할 일 시트`, await p.locator('[data-tab=daily]').first().isVisible().catch(() => false));
    { const rows = await qRows(p); check(`${tag}: 할 일 칩 total = 시트 매일 목록 행 수(보너스 D-ALL3 제외)`, chipTotal(mchip) === rows, `칩 '${mchip}' · 시트 행 ${rows}`); }
    await p.reload(); await p.waitForTimeout(5000);
    check(`${tag}: 새로고침 뒤 로그인 유지`, (await api(p, '/econ/state')).body?.session?.signedIn === true);
  }
  check(`${tag}: 페이지 오류 없음`, !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
}

for (const [k, fn] of [['pc', pc], ['mobile', mobile]]) {
  if (ONLY && ONLY !== k) continue;
  for (const m of (process.env.MODES || (k === 'mobile' ? 'guest,account,v2guest,v2account,v2entry' : 'guest,account')).split(',')) {
    try { await fn(m); } catch (e) { check(`${k}-${m}: 실행`, false, e.message.split('\n')[0]); }
  }
}
const bad = results.filter((r) => !r.ok);
console.log(`\nsmoke: ${results.length - bad.length}/${results.length} ok`);
process.exit(bad.length ? 1 : 0);
