// [mobile] 터치 e2e: 키보드 없이 버튼만으로 — 버스(정자) 타고 내리기 · 택시 부르고 타기 · 카카오바이크 타고 내리기 · 지하철 들어가 한 역 타기 · 핀치+조이스틱 동시
// 사용: BASE=http://localhost:4862 OUT=/workspace/bw-mobile-shots/r2e [ONLY=bus,taxi,bike,subway,pinch] node scripts/e2e-mobile-actions.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4862', OUT = process.env.OUT || '/tmp/r2e';
const W = 852, H = 393, ONLY = (process.env.ONLY || 'pinch,bus,taxi,bike,subway').split(',');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, userAgent: UA, locale: 'ko-KR' });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const res = [];
const ok = (name, cond, info = '') => { res.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); console.log(res.at(-1)); return cond; };
const shot = (n) => p.screenshot({ path: `${OUT}-${n}.png`, timeout: 120000 });
const ev = (fn, a) => p.evaluate(fn, a);
const until = (fn, a, t = 60000) => p.waitForFunction(fn, a, { timeout: t, polling: 150 }).then(() => true, () => false);
const label = (which = 'ride') => ev((w) => { const x = document.querySelector(`#m-hud [data-act="${w}"]`); return x && !x.hidden ? x.textContent.trim() : ''; }, which);
const tap = async (sel) => { const r = await p.locator(sel).first().boundingBox(); if (!r) return false; await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700); return true; };
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
async function joyWalk(ms, dx = 0, dy = -44) {
  const r = await p.locator('#m-joy').boundingBox(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  await touch('touchStart', [[cx, cy, 1]]);
  for (let k = 1; k <= 4; k++) { await touch('touchMove', [[cx + dx * k / 4, cy + dy * k / 4, 1]]); await p.waitForTimeout(30); }
  const t0 = Date.now(); while (Date.now() - t0 < ms) { await touch('touchMove', [[cx + dx, cy + dy, 1]]); await p.waitForTimeout(100); }
  await touch('touchEnd', []);
}
await p.goto(`${BASE}/?mobile=1&noticePopup=0&enter=1&at=jeongja&bus=sim&safe=59`);
await p.waitForSelector('#nick', { state: 'visible', timeout: 120000 });
await p.fill('#nick', '폰테스트'); await tap('#lobby-go');
await p.waitForFunction(() => window.__jj?.ready && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 150000 });
await p.waitForTimeout(4000);
const HOME = await ev(() => ({ x: __jj.player.position.x, z: __jj.player.position.z }));

if (ONLY.includes('pinch')) {
  // 장면 위 두 손가락 핀치 + 조이스틱 손가락을 동시에 (식별자별로 따로)
  const d0 = await ev(() => __jj.cam.dist), p0 = await ev(() => ({ x: __jj.player.position.x, z: __jj.player.position.z }));
  const r = await p.locator('#m-joy').boundingBox(); const jx = r.x + r.width / 2, jy = r.y + r.height / 2;
  await touch('touchStart', [[jx, jy, 1]]);
  await touch('touchMove', [[jx, jy - 44, 1]]);
  await touch('touchStart', [[jx, jy - 44, 1], [380, 200, 2]]);
  await touch('touchStart', [[jx, jy - 44, 1], [380, 200, 2], [480, 200, 3]]);
  for (let k = 1; k <= 12; k++) { await touch('touchMove', [[jx, jy - 44, 1], [380 - k * 8, 200, 2], [480 + k * 8, 200, 3]]); await p.waitForTimeout(60); }
  await touch('touchEnd', [[jx, jy - 44, 1]]);
  await p.waitForTimeout(400);
  await touch('touchEnd', []);
  const d1 = await ev(() => __jj.cam.dist), p1 = await ev(() => ({ x: __jj.player.position.x, z: __jj.player.position.z }));
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  ok('pinch out zooms in (cam.dist shrinks)', d1 < d0 - 0.2, `dist ${d0.toFixed(2)} → ${d1.toFixed(2)}`);
  ok('joystick moves while pinching', moved > 0.5, `moved ${moved.toFixed(2)} m`);
  // 크게 오므리기 → 최대값(120)에서 멈춤
  for (let n = 0; n < 6; n++) {
    await touch('touchStart', [[300, 150, 5], [560, 250, 6]]);
    for (let k = 1; k <= 10; k++) { await touch('touchMove', [[300 + k * 12, 150 + k * 4, 5], [560 - k * 12, 250 - k * 4, 6]]); await p.waitForTimeout(30); }
    await touch('touchEnd', []);
  }
  const d2 = await ev(() => __jj.cam.dist);
  ok('pinch clamps to max', d2 <= 120.001 && d2 > d1, `dist → ${d2.toFixed(2)}`);
  await ev(() => { __jj.cam.dist = 9; });
  await p.waitForTimeout(500);
}

if (ONLY.includes('bus')) {
  const s = await ev(() => { const s = __jj.ride.debug.setupBus(50, 260, true) || __jj.ride.debug.setupBus(); if (s) __jj.teleport(s.x, s.z); return s; });
  ok('bus: setup stop near 정자', !!s, s ? `${s.ref} @ ${s.name}` : 'no candidate');
  if (s) {
    await p.waitForTimeout(800);
    await shot('bus-0-stop'); // 정류장 칩
    await ev(() => __jj.ride.debug.ff(90, () => __jj.ride.canBoardBus));
    await until(() => /버스 타기/.test(document.querySelector('#m-hud [data-act="ride"]')?.textContent || ''), null, 4000);
    const l0 = await label(); ok('bus: primary = 버스 타기', /버스 타기/.test(l0), l0);
    await shot('bus-1-board-btn');
    await tap('#m-hud [data-act="ride"]');
    const boarded = await until(() => __jj.ride.ride?.mode === 'bus', null, 15000);
    ok('bus: boarded by tap', boarded);
    await p.waitForTimeout(900);
    const ld = await label(); ok('bus: still at stop → primary = 내리기', /내리기/.test(ld), ld);
    await ev(() => __jj.ride.debug.ff(60, () => !__jj.ride.ride?.dwell));
    await p.waitForTimeout(900);
    const l1 = await label(), l2 = await label('ride2'); ok('bus: 하차 벨 + 시점', /하차 벨/.test(l1) && /시점/.test(l2), `${l1} / ${l2}`);
    await shot('bus-2-riding');
    await tap('#m-hud [data-act="ride"]');
    ok('bus: bell on by tap', await ev(() => !!__jj.ride.ride?.bell), await label());
    await ev(() => __jj.ride.debug.ff(240, () => !__jj.ride.ride || __jj.ride.ride.dwell));
    await p.waitForTimeout(700);
    const st = await ev(() => __jj.ride.debug.state());
    if (st.mode === 'bus') {
      const l3 = await label(); ok('bus: at stop primary = 내리기', /내리기/.test(l3), l3);
      await shot('bus-3-alight-btn');
      await tap('#m-hud [data-act="ride"]');
    }
    ok('bus: alighted', await until(() => !__jj.ride.ride, null, 15000), JSON.stringify(st).slice(0, 120));
  }
}

if (ONLY.includes('taxi')) {
  await ev((h) => { __jj.teleport(h.x, h.z); }, HOME); await p.waitForTimeout(1500); // 버스 시나리오가 길가에서 먼 정류장에 내려 줄 수 있어 처음 자리로
  await tap('#m-hud [data-tg="phone"]'); await p.waitForTimeout(700);
  const opened = await ev(() => { const a = [...document.querySelectorAll('#handset [data-app], #handset button')].find((x) => /택시|taxi/i.test(x.dataset.app || x.textContent)); a?.click(); return !!a; });
  await p.waitForTimeout(800);
  await shot('taxi-0-app');
  const hb = await p.locator('#handset [data-xact="hail"]').count();
  ok('taxi: phone app has 부르기 button', opened && hb > 0);
  if (hb) await tap('#handset [data-xact="hail"]');
  const called = await until(() => __jj.ride.ride?.mode === 'taxi', null, 8000);
  ok('taxi: called from phone', called, called ? '' : await ev(() => [...document.querySelectorAll('[class*=toast],[id*=toast]')].map((x) => x.textContent.trim()).filter(Boolean).join(' | ').slice(0, 300)));
  if (called) {
    await ev(() => __jj.ride.debug.ffTaxi(180, () => __jj.ride.ride?.phase === 'wait'));
    await ev(() => { const t = __jj.ride.ride.t.mesh.position; __jj.player.position.set(t.x + 1.6, __jj.player.position.y, t.z + 1.6); });
    await p.waitForTimeout(900);
    const l0 = await label(); ok('taxi: primary = 택시 타기', /택시 타기/.test(l0), l0);
    await shot('taxi-1-getin-btn');
    await tap('#m-hud [data-act="ride"]');
    ok('taxi: in (choose)', await until(() => __jj.ride.ride?.phase === 'choose', null, 8000), await ev(() => __jj.ride.ride?.phase));
    await p.waitForTimeout(600);
    await shot('taxi-2-dest');
    await ev(() => document.querySelector('.taxi-panel [data-dest]:not([data-dest="@map"]), [data-dest]:not([data-dest="@map"])')?.click());
    await p.waitForTimeout(300);
    await tap('[data-go="normal"]');
    ok('taxi: driving', await until(() => __jj.ride.ride?.phase === 'drive', null, 8000));
    await ev(() => __jj.ride.debug.ffTaxi(6));
    await p.waitForTimeout(800);
    const l1 = await label(); ok('taxi: primary = 세워주세요', /세워주세요/.test(l1), l1);
    await shot('taxi-3-drive');
    await tap('#m-hud [data-act="ride"]');
    ok('taxi: stop requested by tap', await ev(() => !!__jj.ride.ride?.stopReq));
    await ev(() => __jj.ride.debug.ffTaxi(120, () => !__jj.ride.ride));
    ok('taxi: got out', await until(() => !__jj.ride.ride, null, 15000));
  }
}

if (ONLY.includes('bike')) {
  const bk = await ev(() => { const l = __jj.bikes.list; const p = __jj.player.position; let best = null, bd = 1e9; for (const b of l) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; best = b; } } if (best) __jj.teleport(best.x + 0.8, best.z + 0.8); return best ? { x: best.x, z: best.z } : null; });
  await p.waitForTimeout(1200);
  const l0 = await label(); ok('bike: primary near bike', /자전거|타기/.test(l0), l0 || JSON.stringify(bk));
  await shot('bike-0-near');
  await tap('#m-hud [data-act="ride"]');
  ok('bike: mounted', await until(() => !!__jj.bikes.riding, null, 5000));
  await joyWalk(1200);
  const l1 = await label(); ok('bike: primary = 내리기', /내리기/.test(l1), l1);
  await shot('bike-1-riding');
  await tap('#m-hud [data-act="ride"]');
  ok('bike: dismounted', await until(() => !__jj.bikes.riding, null, 5000));
}

if (ONLY.includes('subway')) {
  await ev(() => { const e = __jj.subway.entrances.find((q) => q.exit.ref === '4'); const s = Math.sin(e.ry), c = Math.cos(e.ry); __jj.teleport(e.x - s * 3, e.z - c * 3); __jj.player.rotation.y = e.ry; __jj.setMode('follow'); __jj.cam.yaw = e.ry + Math.PI; });
  await p.waitForTimeout(1200);
  await until(() => /내려가기/.test(document.querySelector('#m-hud [data-act="ride"]')?.textContent || ''), null, 6000);
  const l0 = await label(); ok('subway: primary = 내려가기', /내려가기/.test(l0), l0 + ' ' + JSON.stringify(await ev(() => ({ act: __jj.subway.active, hint: document.getElementById('subway-hint')?.innerHTML?.slice(0, 80) }))));
  await shot('subway-0-entrance');
  await tap('#m-hud [data-act="ride"]');
  ok('subway: in concourse', await until(() => __jj.subway.room === 'concourse' && !__jj.subway.swapping, null, 30000));
  await p.waitForTimeout(800);
  await p.waitForTimeout(1200); const l1 = await label(); ok('subway: concourse primary = 출구 고르기', /출구/.test(l1), l1 + ' ' + JSON.stringify(await ev(() => ({ ph: __jj.subway.state.phase, k: __jj.subway.inside?.kind, sw: __jj.subway.swapping, hint: document.getElementById('subway-hint')?.innerText }))));
  await shot('subway-1-concourse');
  await ev(() => __jj.subway.toPlatform('suin', 1));
  await until(() => __jj.subway.room === 'platform' && !__jj.subway.swapping);
  await ev(() => __jj.subway.inside.callTrain(13));
  await until(() => document.getElementById('subway-sub')?.innerText.includes('내리는'), null, 60000);
  await p.waitForTimeout(3500);
  await ev(() => { const i = __jj.subway.inside, d = i.lay.doors.find((q) => q.label === '3-2'); i.player.position.set(d.x, 0, -0.4); i.player.rotation.y = 0; i.cam.yaw = Math.PI; });
  await shot('subway-2-platform');
  for (let k = 0; k < 6 && !(await ev(() => __jj.subway.room === 'train')); k++) await joyWalk(1500);
  ok('subway: boarded train by joystick', await until(() => __jj.subway.room === 'train' && !__jj.subway.swapping, null, 20000));
  await p.waitForTimeout(900);
  const l2 = await label(); ok('subway: train primary = 앉기', /앉기/.test(l2), l2);
  await shot('subway-3-train');
  const from = await ev(() => __jj.subway.station.name);
  for (let k = 0; k < 200; k++) { const st = await ev(() => { const i = __jj.subway.inside; if (i.stage !== 'stop' || !i.segs[i.stopIndex]?.game) i.skip(1); return i.stage === 'stop' && !!i.segs[i.stopIndex]?.game; }); if (st) break; }
  await until(() => __jj.subway.inside?.canAlight === true, null, 30000);
  await ev(() => { const i = __jj.subway.inside, p = i.player.position; const d = i.doors.reduce((b, x) => (Math.abs(x - p.x) < Math.abs(b - p.x) ? x : b), i.doors[0]); p.set(d + 0.35, 0, -0.2); i.player.rotation.y = 0; i.cam.yaw = 0; i.cam.pitch = 0.02; i.cam.dist = 0.9; });
  await p.waitForTimeout(700);
  for (let k = 0; k < 6 && !(await ev(() => __jj.subway.room === 'platform')); k++) await joyWalk(1200);
  const to = await ev(() => __jj.subway.station?.name);
  ok('subway: rode one stop & alighted by joystick', (await ev(() => __jj.subway.room)) === 'platform' && to !== from, `${from} → ${to}`);
  await p.waitForTimeout(800);
  await shot('subway-4-alighted');
}
console.log('\n' + res.join('\n'));
console.log('page errors:', errs.slice(0, 8).join(' | ') || 'none');
await b.close();
