// [place-guide] 남대문시장 가이드: (renderer geo/tex 수는 월드 스트리밍으로 출렁여 참고만 — 패널은 DOM 뿐)
// 열기(E·클릭·모바일 버튼) · 탭/EN·KO · 5번 열고 닫아도 새지 않음 · draw 증가 · 'Take me there' 길(거리 = 실제 경로) · 도착.
//   node scripts/guides/test-place-guide.mjs <vite port>   (npm run guide:test — MYEONGDONG_WALK_PORT, 기본 5231)
import { chromium } from 'playwright';
const PORT = /^\d+$/.test(process.argv[2] || '') ? process.argv[2] : process.env.MYEONGDONG_WALK_PORT;
if (!PORT) { console.log('test-place-guide: skipped (no vite port)'); process.exit(0); }
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
const fails = []; const out = {};
async function run(label, w, h, mobile) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?ws=mock&at=myeongdong&hour=16&weather=clear&shot=1&noticePopup=0&controlscard=0${mobile ? '&mobile=1' : ''}`);
  await page.waitForFunction(() => window.__jj?.ready && window.__jj?.myeongdong?.ready, null, { timeout: 300000 });
  const r = await page.evaluate(async ({ mobile }) => {
    const J = window.__jj, md = J.myeongdong, wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    const R = {};
    // 안내원 앞
    const px = -11358.4, pz = -21470.5;
    await J.teleport(px, pz, md.surfaceY(px, pz)); J.wake?.();
    for (let i = 0; i < 60 && !J.placeGuide; i++) await wait(250);
    const G = J.placeGuide; if (!G) return { err: 'guide not mounted' };
    await frames(6);
    R.canOpen = G.canOpen;
    let SC = J.player; while (SC.parent) SC = SC.parent;
    const draws = async () => { await frames(2); const Rn = J.renderer, orig = Rn.render; const got = []; Rn.render = function (sc, ...a) { orig.call(this, sc, ...a); if (sc === SC) got.push(Rn.info.render.calls); }; const t0 = performance.now(); while (got.length < 3 && performance.now() - t0 < 30000) await frames(1); Rn.render = orig; return got.length ? Math.max(...got) : -1; };
    const mem = () => { window.gc?.(); return { geo: J.renderer.info.memory.geometries, tex: J.renderer.info.memory.textures, dom: document.getElementsByTagName('*').length, heap: performance.memory?.usedJSHeapSize || 0, objs: (() => { let n = 0; G.group.traverse(() => n++); return n; })(), pgNodes: document.getElementById('pg-root').getElementsByTagName('*').length }; };
    R.drawsClosed = await draws();
    // 열기: 데스크톱 = E 키, 모바일 = HUD 버튼 행동
    if (mobile) { const btn = [...document.querySelectorAll('button')].find((b) => /시장 안내|Guide/.test(b.textContent || '') && b.offsetParent); R.hudBtn = !!btn; btn ? btn.click() : G.open(); }
    else window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
    await frames(3);
    R.openedByInput = G.isOpen; if (!G.isOpen) G.open();
    R.drawsOpen = await draws();
    const root = document.getElementById('pg-root');
    const pane = root.querySelector(mobile ? '.pg-m' : '.pg-panel');
    const box = pane.getBoundingClientRect(); R.pane = { x: Math.round(box.x), w: Math.round(box.width), h: Math.round(box.height) };
    // 탭 6개 · 언어
    const tabs = [...pane.querySelectorAll('[data-tab]')]; R.tabs = tabs.length;
    const small = [...pane.querySelectorAll('button')].filter((b) => b.offsetParent && b.getBoundingClientRect().height > 0 && Math.min(b.getBoundingClientRect().height, b.getBoundingClientRect().width) < 44).map((b) => (b.className || b.tagName) + ':' + Math.round(b.getBoundingClientRect().height));
    R.smallTargets = small.slice(0, 8); R.nSmall = small.length;
    pane.querySelector('[data-lang="en"]')?.click(); await frames(2); R.en = /Namdaemun/.test(pane.textContent) && /5·6·7/.test(pane.textContent);
    pane.querySelector('[data-lang="ko"]')?.click(); await frames(2); R.ko = /남대문시장/.test(pane.textContent) && /5·6·7/.test(pane.textContent);
    R.footnote = /2026|확인|Checked/.test(pane.textContent);
    pane.querySelector('[data-lang="en"]')?.click();
    G.close(); await frames(3);
    // 5번 열고 닫기 (탭 다 돌기)
    const m0 = mem();
    for (let k = 0; k < 5; k++) {
      G.open(); await frames(2);
      for (const tb of G.ui.guide.tabs) { G.ui.setTab(tb.key); await frames(1); }
      G.ui.lang = k % 2 ? 'ko' : 'en'; await frames(1);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); await frames(2);
      if (G.isOpen) G.close();
    }
    G.ui.lang = 'en';
    await wait(300); const m1 = mem();
    R.roots = document.querySelectorAll('#pg-root').length + document.querySelectorAll('#pg-style').length;
    R.leak = { objs: m1.objs - m0.objs, pgNodes: m1.pgNodes - m0.pgNodes, geo: m1.geo - m0.geo, tex: m1.tex - m0.tex, dom: m1.dom - m0.dom, heapKB: Math.round((m1.heap - m0.heap) / 1024) };
    // 길 안내: 칼국수골목
    G.open('food'); await frames(2);
    if (mobile) { pane.querySelector('[data-det]')?.click(); await frames(2); }
    const go = pane.querySelector('[data-go="kalguksu"]') || pane.querySelector('[data-go]'); R.goBtn = !!go; go ? go.click() : G.startRoute('kalguksu');
    await frames(8); await wait(500); await frames(4);
    R.closedOnGo = !G.isOpen;
    const c = G.current; R.route = c;
    const path = G.route.path || [];
    let L = 0; for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    const sp = G.ui.guide.spots.find((s) => s.id === (c?.spot || 'kalguksu'));
    R.pathLen = Math.round(L); R.straight = Math.round(Math.hypot(sp.x - px, sp.z - pz));
    const shown = (mobile ? root.querySelector('.msign') : root.querySelector('.eta'))?.textContent || '';
    R.shownM = +(/≈(\d+) m/.exec(shown)?.[1] || -1);
    R.cableSuppressed = !!J.namsan?.cableGuide?.suppressed;
    R.drawsRoute = await draws();
    // 경로 따라 걸어가기(순간이동) → 도착
    for (let i = Math.floor(path.length / 2); i < path.length; i++) { const [x, z] = path[i]; await J.teleport(x, z, md.surfaceY(x, z) ?? 0); await frames(2); }
    await J.teleport(sp.x, sp.z, md.surfaceY(sp.x, sp.z) ?? 0);
    for (let i = 0; i < 30 && G.routing; i++) { await frames(2); await wait(200); }
    R.endState = G.current; R.endPath = (G.route.path || []).length; R.endP = [J.player.position.x, J.player.position.z];
    R.arrivedEnded = !G.routing; R.cableRestored = !J.namsan?.cableGuide?.suppressed;
    R.toast = root.querySelector('.pgtoast')?.textContent || '';
    return R;
  }, { mobile });
  r.errors = errors.slice(0, 5);
  out[label] = r;
  const f = (m) => fails.push(`${label}: ${m}`);
  if (r.err) { f(r.err); return; }
  if (!r.canOpen) f('not in range at the guide NPC');
  if (!r.openedByInput) f(mobile ? 'HUD Guide button did not open' : 'E did not open');
  if (r.tabs < 6) f(`tabs ${r.tabs}`);
  if (!r.en || !r.ko) f(`EN/KO text en=${r.en} ko=${r.ko}`);
  if (!r.footnote) f('no checked/source footnote');
  if (r.nSmall) f(`touch targets < 44px: ${r.smallTargets.join(',')}`);
  if (r.leak.objs !== 0 || r.leak.pgNodes > 0 || r.leak.dom > 3 || r.leak.heapKB > 16384 || r.roots !== 2) f(`leak ${JSON.stringify(r.leak)}`);
  if (r.drawsOpen - r.drawsClosed > 4) f(`panel adds draws ${r.drawsClosed}→${r.drawsOpen}`);
  if (r.drawsRoute > 1000 || r.drawsOpen > 1000) f('draws > 1000');
  if (!r.closedOnGo) f('panel stays open after Take me there');
  if (!r.route || !(r.route.arrows > 0)) f('no route arrows');
  if (!(r.pathLen > 0) || r.pathLen < r.straight * 0.98) f(`path ${r.pathLen} < straight ${r.straight}`);
  if (Math.abs(r.shownM - r.pathLen) > 6) f(`shown distance ${r.shownM} ≠ path ${r.pathLen}`);
  if (!r.cableSuppressed) f('cable arrows not suppressed while routing');
  if (!r.arrivedEnded || !r.cableRestored) f('route did not end on arrival');
  if (errors.length) f('console errors: ' + errors.slice(0, 3).join(' | '));
}
await run('desktop', 1280, 800, false);
await run('mobile', 844, 390, true);
await browser.close();
console.log(JSON.stringify(out, null, 1));
if (fails.length) { console.error('test-place-guide FAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log(`test-place-guide ok — desktop path ${out.desktop.pathLen} m (straight ${out.desktop.straight}), draws ${out.desktop.drawsClosed}→${out.desktop.drawsOpen} open→${out.desktop.drawsRoute} route; mobile draws ${out.mobile.drawsClosed}→${out.mobile.drawsOpen}`);
