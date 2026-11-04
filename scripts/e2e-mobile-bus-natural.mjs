// [mobile] 자연 플레이 버스 e2e — 테스트 훅(setupBus·ff·teleport·?bus=) 없이: 기본 URL로 들어가 조이스틱만으로 가까운 정류장까지 걷고,
//   실제 시간으로 버스를 기다려 '버스 타기' 버튼이 뜨는지 · 눌러서 타지는지 본다. (읽기 전용 상태 조회와 카메라 방향 읽기만 씀)
// 사용: BASE=http://localhost:4862 OUT=/workspace/bw-mobile-shots/nat [AT=jeongja,migeum,pangyo] [WAIT=240] [ENGINE=chromium|webkit] [EXTRA=&bus=realtime]
import { chromium, webkit, devices } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4862', OUT = process.env.OUT || '/tmp/nat';
const ATS = (process.env.AT || 'jeongja,migeum,pangyo').split(','), WAIT = +(process.env.WAIT || 240), ENGINE = process.env.ENGINE || 'chromium', EXTRA = process.env.EXTRA || '';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const res = []; let fails = 0;
const ok = (n, c, i = '') => { res.push(`${c ? 'PASS' : 'FAIL'} ${n}${i ? ' — ' + i : ''}`); if (!c) fails++; console.log(res.at(-1)); return c; };
const eng = ENGINE === 'webkit' ? webkit : chromium;
const b = await eng.launch(ENGINE === 'webkit' ? {} : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const AT of ATS) {
  const ctx = ENGINE === 'webkit'
    ? await b.newContext({ ...devices['iPhone 14 Pro landscape'], userAgent: UA, locale: 'ko-KR' })
    : await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true, userAgent: UA, locale: 'ko-KR' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const cdp = ENGINE === 'chromium' ? await ctx.newCDPSession(p) : null;
  const ev = (fn, a) => p.evaluate(fn, a);
  const shot = (n) => p.screenshot({ path: `${OUT}-${ENGINE}-${AT}-${n}.png`, timeout: 120000 }).catch(() => {});
  const tap = async (sel) => { const r = await p.locator(sel).first().boundingBox(); if (!r) return false; await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); return true; };
  // 조이스틱: CDP 터치(크롬) — 웹킷은 합성 터치 이벤트 디스패치
  const touch = async (type, pts) => {
    if (cdp) return cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
    return ev(([type, pts]) => {
      const el = document.getElementById('m-joy'); const map = { touchStart: 'touchstart', touchMove: 'touchmove', touchEnd: 'touchend' };
      const ts = pts.map(([x, y, id]) => new Touch({ identifier: id, target: el, clientX: x, clientY: y }));
      const ch = ts.length ? ts : [new Touch({ identifier: 1, target: el, clientX: 0, clientY: 0 })];
      el.dispatchEvent(new TouchEvent(map[type], { bubbles: true, cancelable: true, touches: ts, targetTouches: ts, changedTouches: ch }));
    }, [type, pts]);
  };
  await p.goto(`${BASE}/?mobile=1&noticePopup=0&enter=1&at=${AT}&safe=59${EXTRA}`);
  await p.waitForSelector('#nick', { state: 'visible', timeout: 150000 });
  await p.fill('#nick', '자연테스트'); await tap('#lobby-go');
  await p.waitForFunction(() => window.__jj?.ready && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 180000 });
  await p.waitForTimeout(5000);
  // 역 안에서 시작하면(?at=migeum 등) 사람처럼 출구 고르기에서 기본 출구를 눌러 밖으로
  const inStation = await ev(() => !!__jj.subway?.active);
  if (inStation) {
    await p.locator('#subway-chooser li').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    // 안 열려 있으면 오른쪽 행동 버튼 '출구 고르기'를 눌러 연다
    if (!await p.locator('#subway-chooser li').first().isVisible().catch(() => false)) {
      const lab = await p.locator('#m-hud [data-act="ride"]').first().textContent().catch(() => '');
      if (/출구/.test(lab || '')) await tap('#m-hud [data-act="ride"]');
      await p.locator('#subway-chooser li').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    }
  }
  if (inStation || await p.locator('#subway-chooser li').first().isVisible().catch(() => false)) {
    await tap('#subway-chooser li.on, #subway-chooser li');
    const out = await p.waitForFunction(() => !__jj.subway?.active, null, { timeout: 90000 }).then(() => true, () => false);
    ok(`${AT}: left the station by the exit chooser`, out);
    await p.waitForTimeout(3000);
  }
  // 가까운 정류장(정자 transit 정류장 + 코리더 정류장) — 읽기만
  const stop = await ev(() => {
    const P = __jj.player.position, out = [];
    for (const s of __jj.transit?.stops || []) { const x = s._pos?.x ?? s.x, z = s._pos?.z ?? s.z; if (x != null) out.push({ id: s.id, name: s.name, x, z }); }
    for (const s of __jj.corridor?.life?.buses?.stopById?.values?.() || []) if (s._pos) out.push({ id: s.id, name: s.name, x: s._pos.x, z: s._pos.z });
    // 사람이 고르듯: 가까운(150m 안) 정류장 중 실제로 버스가 서는(노선이 지나가는 버스가 많은) 곳 — 없으면 그냥 가장 가까운 곳
    const serve = new Map();
    for (const sys of [__jj.transit?.rideSim?.sim, __jj.corridor?.life?.buses?.sim]) for (const bu of sys?.buses || []) for (const st of bu.P?.stops || []) serve.set(st.stop, (serve.get(st.stop) || 0) + 1);
    out.forEach((s) => { s.d = Math.hypot(s.x - P.x, s.z - P.z); s.n = serve.get(s.id) || 0; }); out.sort((a, c) => a.d - c.d);
    const busy = out.filter((s) => s.d < 150 && s.n >= 3).sort((a, c) => c.n - a.n || a.d - c.d);
    return busy[0] || out[0] || null;
  });
  ok(`${AT}: found a stop near spawn`, !!stop, stop ? `${stop.name} ${stop.d.toFixed(0)}m · 이 정류장을 지나는 버스 ${stop.n}대` : '');
  if (!stop) { await ctx.close(); continue; }
  if (stop.d > 30) await tap('#m-hud [data-act="run"]'); // 멀면 사람처럼 '달리기' 켜고
  const r = await p.locator('#m-joy').boundingBox(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const t0 = Date.now(); let d = stop.d, prevD = Infinity, stuck = 0;
  while (d > 7 && Date.now() - t0 < +(process.env.WALK || 300) * 1000) {
    const v = await ev((s) => { const P = __jj.player.position, f = new __jj.player.position.constructor(); __jj.camera.getWorldDirection(f); const fl = Math.hypot(f.x, f.z) || 1; const fx = f.x / fl, fz = f.z / fl; const tx = s.x - P.x, tz = s.z - P.z, tl = Math.hypot(tx, tz) || 1; return { fw: (tx * fx + tz * fz) / tl, rt: (tx * -fz + tz * fx) / tl, d: tl }; }, stop);
    d = v.d; if (d <= 7) break;
    // 막혔으면(벽·난간) 사람처럼 옆으로 비켜 걷는다: 진행이 없을 때마다 ±70° 번갈아
    stuck = prevD - d < 0.4 ? stuck + 1 : 0; prevD = d;
    let fw = v.fw, rt = v.rt;
    if (stuck) { const a = (stuck % 2 ? 1 : -1) * 1.22, c = Math.cos(a), sn = Math.sin(a); [fw, rt] = [fw * c - rt * sn, fw * sn + rt * c]; }
    const k = 44 / (Math.hypot(fw, rt) || 1), jx = cx + rt * k, jy = cy - fw * k;
    await touch('touchStart', [[cx, cy, 1]]); await touch('touchMove', [[(cx + jx) / 2, (cy + jy) / 2, 1]]);
    for (let i = 0; i < 6; i++) { await touch('touchMove', [[jx, jy, 1]]); await p.waitForTimeout(100); }
    await touch('touchEnd', []);
  }
  ok(`${AT}: walked to the stop by joystick (탑승 반경 12m 안)`, d <= 12, `${d.toFixed(1)}m in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await shot('0-at-stop');
  // 실제 시간으로 기다리며 버튼 관찰
  const w0 = Date.now(); let seen = null, samples = 0, dwellNear = 0, hintSeen = '';
  while (Date.now() - w0 < WAIT * 1000) {
    const st = await ev(() => { const x = document.querySelector('#m-hud [data-act="ride"]'); const lab = x && !x.hidden ? x.textContent.trim() : ''; const chip = document.querySelector('#m-hud [data-act="stop"]'); return { lab, can: !!__jj.ride.canBoardBus, chip: chip && !chip.hidden ? chip.textContent.trim() : '', hint: document.querySelector('#m-hud .m-bus-wait')?.textContent?.trim() || '' }; });
    samples++; if (st.can) dwellNear++; if (st.hint) hintSeen = st.hint;
    if (/버스 타기/.test(st.lab)) { seen = { ...st, t: (Date.now() - w0) / 1000 }; break; }
    await p.waitForTimeout(500);
  }
  ok(`${AT}: '버스 타기' appeared while waiting (real time)`, !!seen, seen ? `after ${seen.t.toFixed(0)}s · chip "${seen.chip}"` : `waited ${WAIT}s · canBoardBus ${dwellNear}/${samples} · hint "${hintSeen}"`);
  if (hintSeen) ok(`${AT}: waiting hint shown`, true, hintSeen);
  if (seen) {
    await shot('1-board-btn');
    await tap('#m-hud [data-act="ride"]');
    const on = await p.waitForFunction(() => __jj.ride.ride?.mode === 'bus', null, { timeout: 15000 }).then(() => true, () => false);
    ok(`${AT}: boarded by tapping`, on, on ? JSON.stringify(await ev(() => { const s = __jj.ride.debug.state(); return { ref: s.ref, next: s.nextStop }; })) : '');
    await p.waitForTimeout(2500); await shot('2-riding');
  } else await shot('1-no-btn');
  ok(`${AT}: no page errors`, !errs.length, errs.slice(0, 2).join(' | '));
  await ctx.close();
}
await b.close();
console.log(`\n${res.length - fails}/${res.length} passed`);
process.exit(fails ? 1 : 0);
