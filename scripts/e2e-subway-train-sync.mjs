// [subway-sync] 2인: 같은 승강장에서 같은 열차를 타면 같은 순간 문 열림·출발·도착 (서버 시계 기준), 타는 내내 서로 보임.
//   B 의 로컬 시계를 SKEW ms (기본 +8000, -8000 도 돌려 볼 것) 틀어 둔다 (Date.now 덮어쓰기). 둘 다 정자(수인분당 왕십리 방면) → 수내.
//   dev relay 를 이 스크립트가 직접 띄움 (TIME_SKEW_MS 로 서버 시계를 낮 시간표 열차 LEAD 초 전으로) → 끝나면 그 PID 만 종료.
//   BASE=http://127.0.0.1:4720/ RELAY_PORT=4722 SKEW=8000 OUT=/workspace/bw-subway-shots node scripts/e2e-subway-train-sync.mjs
//   [migeum-sub] ROUTE=sunae(기본, 위 그대로) | migeum-suin (정자 수인분당 수원·인천 방면 → 미금) | migeum-shin (정자 신분당 광교 방면 → 미금)
//     EXTRA='&migeumsub=0' 처럼 쿼리 덧붙이기 (플래그 끈 채 기본 경로가 그대로인지). 이 스크립트(Node) 쪽 시간표도 같은 플래그로: MIGEUMSUB=0
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { simNextArrival } from '../src/subway/ride.js';
const B = process.env.BASE || 'http://127.0.0.1:4720/';
const RP = Number(process.env.RELAY_PORT || 4722);
const SKEW = Number(process.env.SKEW ?? 8000);
const LEAD = Number(process.env.LEAD_SEC || 170);
const OUT = process.env.OUT || '';
const ROUTES = { sunae: { line: 'suin', dir: 1, to: '수내', toId: 'sunae' }, 'migeum-suin': { line: 'suin', dir: 0, to: '미금', toId: 'migeum' }, 'migeum-shin': { line: 'shin', dir: 0, to: '미금', toId: 'migeum' } };
const ROUTE = process.env.ROUTE || 'sunae', RT = ROUTES[ROUTE];
if (!RT) throw new Error('ROUTE ' + ROUTE);
const EXTRA = process.env.EXTRA || '';
const TAG = (ROUTE === 'sunae' ? '' : ROUTE + '-') + (EXTRA.includes('migeumsub=0') ? 'off-' : '') + (SKEW >= 0 ? `p${SKEW / 1000}` : `m${-SKEW / 1000}`);
// 서버 시계: 오늘(KST) 12:00 이후 첫 정자 왕십리 방면 열차의 LEAD 초 전
const kstNoon = (() => { const d = new Date(Date.now() + 9 * 3600e3); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12) - 9 * 3600e3; })();
const first = simNextArrival(RT.line, RT.dir, 'jeongja', kstNoon);
const skewSrv = Math.round(first.at - LEAD * 1000 - Date.now());
const relay = spawn(process.execPath, ['server/dev-relay.mjs'], { env: { ...process.env, PORT: String(RP), TIME_SKEW_MS: String(skewSrv) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res, rej) => { relay.stdout.on('data', (b) => String(b).includes('listening') && res()); relay.on('exit', (c) => rej(new Error('relay exit ' + c))); });
const WS = `ws://127.0.0.1:${RP}`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
async function open(name, skew = 0) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (skew) await ctx.addInitScript((k) => { const o = Date.now.bind(Date); Date.now = () => o() + k; }, skew);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  await page.goto(`${B}?enter=1&name=${encodeURIComponent(name)}&ws=${encodeURIComponent(WS)}&shot=1&lang=ko&subwayRt=0&noticePopup=0&bgm=0&subwayVoice=0${EXTRA}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
  return page;
}
const until = (page, fn, arg, t = 60000) => page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
const settled = (page, room) => until(page, (r) => __jj.subway.room === r && !__jj.subway.swapping, room, 60000);
const shot = (page, n) => OUT && page.screenshot({ path: `${OUT}/sync-${TAG}-${n}.png` });
// 페이지 안 기록기: 10ms 마다 지금 상태(프레임과 무관한 순수 상태)를 보고, 바뀌는 순간의 serverNow 를 남김
const recorder = () => {
  const ev = (window.__syncEv = []); let last = '';
  setInterval(() => {
    const s = __jj.subway, i = s.inside, now = __jj.serverClock.serverNow();
    if (!i) return;
    let key = '';
    if (i.kind === 'platform') key = `p:${i.def.id}:${i.sched?.run}:${i.doorsNow > 0.5 ? 'open' : 'shut'}`;
    else if (i.kind === 'train') { const st = i.state; key = `t:${i.run}:${st.stage}:${st.i}:${st.open > 0.5 ? 'open' : 'shut'}`; }
    if (key && key !== last) { ev.push({ key, s: now }); last = key; }
  }, 10);
};
const report = { skewB: SKEW, serverSkew: skewSrv };
try {
  const A = await open('동기A');
  const Bp = await open('동기B', SKEW);
  // 서버 시계 맞춤: 둘 다 synced, B 의 offset ≈ -SKEW (+ 서버 skew)
  for (const pg of [A, Bp]) await until(pg, () => __jj.serverClock.synced && __jj.serverClock.samples >= 3, null, 30000);
  const ck = await Promise.all([A, Bp].map((pg) => pg.evaluate(() => ({ off: __jj.serverClock.offset, rtt: __jj.serverClock.rtt, now: __jj.serverClock.serverNow() }))));
  report.clock = ck.map((c) => ({ off: Math.round(c.off), rtt: c.rtt }));
  assert.ok(Math.abs((ck[0].off - ck[1].off) - SKEW) < 150, `B offset 이 시계 틀어짐을 상쇄 ${JSON.stringify(ck)}`);
  for (const pg of [A, Bp]) await pg.evaluate(recorder);
  // 정자 대합실 → 승강장 (수인분당 왕십리 방면)
  for (const pg of [A, Bp]) {
    await pg.evaluate(() => __jj.subway.enterById(__jj.subway.exits.find((e) => e.ref === '4').id));
    await settled(pg, 'concourse');
    await pg.evaluate((r) => __jj.subway.toPlatform(r.line, r.dir), RT);
    await settled(pg, 'platform');
  }
  const sc = await Promise.all([A, Bp].map((pg) => pg.evaluate(() => { const i = __jj.subway.inside; return { run: i.sched.run, at: i.sched.at, eta: (i.sched.at - __jj.serverClock.serverNow()) / 1000 }; })));
  report.platform = sc;
  assert.equal(sc[0].run, sc[1].run, '승강장에서 같은 다음 열차'); assert.ok(Math.abs(sc[0].at - sc[1].at) < 1, '같은 도착 시각');
  // 문 열릴 때까지 (둘 다): 문 앞에 서 있다가 걸어 들어감
  const doorOf = { [A._guid]: '3-2', [Bp._guid]: '3-3' };
  await Promise.all([A, Bp].map(async (pg, k) => {
    await until(pg, () => { const i = __jj.subway.inside; return i.kind === 'platform' && i.doorsNow > 0.95; }, null, (sc[k].eta + 60) * 1000);
    await pg.waitForTimeout(800 + k * 400);
    await pg.evaluate((lab) => { const i = __jj.subway.inside, d = i.lay.doors.find((q) => q.label === lab); i.player.position.set(d.x, 0, -0.4); i.cam.yaw = Math.PI; }, k ? '3-3' : '3-2');
    await pg.keyboard.down('KeyW'); await settled(pg, 'train'); await pg.keyboard.up('KeyW');
  }));
  void doorOf;
  const tr = await Promise.all([A, Bp].map((pg) => pg.evaluate(() => { const i = __jj.subway.inside; return { run: i.run, zone: i.zone, at: i.at, rz: __jj.remotes.zone, stops: i.segs.map((g) => g.name), arr0: i.segs[0]?.arr }; })));
  report.route = ROUTE; report.extra = EXTRA; report.stops = tr[0].stops;
  report.train = tr.map(({ stops, arr0, ...r }) => r);
  assert.equal(tr[0].run, tr[1].run, '같은 run'); assert.equal(tr[0].zone, tr[1].zone, '같은 열차 구역'); assert.ok(Math.abs(tr[0].at - tr[1].at) < 1, '같은 정차 시각');
  assert.equal(tr[0].stops[0], RT.to);
  // 타는 내내 서로 보임 (같은 구역, 열차 Scene 안)
  const sees = (pg, n) => pg.evaluate((nm) => { const p = [...__jj.remotes.peers.values()].find((q) => q.name === nm); return !!p && p.zone === __jj.remotes.zone && p.mesh.parent === __jj.subway.inside?.scene; }, n);
  await until(A, () => [...__jj.remotes.peers.values()].some((q) => q.name === '동기B' && q.zone === __jj.remotes.zone), null, 15000);
  await until(Bp, () => [...__jj.remotes.peers.values()].some((q) => q.name === '동기A' && q.zone === __jj.remotes.zone), null, 15000);
  await A.evaluate(() => { const i = __jj.subway.inside; i.cam.yaw = -Math.PI / 2 - 0.4; i.cam.pitch = 0.15; i.cam.dist = 2.6; });
  await Bp.evaluate(() => { const i = __jj.subway.inside; i.cam.yaw = Math.PI / 2 + 0.4; i.cam.pitch = 0.15; i.cam.dist = 2.6; });
  let samples = 0, misses = [], shotRun = false;
  for (;;) {
    const [sa, sb] = await Promise.all([A, Bp].map((pg) => pg.evaluate(() => { const i = __jj.subway.inside; return i?.kind === 'train' ? i.state : null; })));
    if (!sa || !sb) break;
    const [va, vb] = await Promise.all([sees(A, '동기B'), sees(Bp, '동기A')]);
    samples++; if (!va || !vb) misses.push({ a: va, b: vb, stage: sa.stage });
    if (sa.stage === 'run' && !shotRun && sa.t > 8) { shotRun = true; await Promise.all([shot(A, 'A-run-sees-B'), shot(Bp, 'B-run-sees-A')]); }
    if (sa.stage === 'stop' && sb.stage === 'stop' && sa.open > 0.95 && sb.open > 0.95) break;
    await A.waitForTimeout(500);
  }
  report.ride = { samples, misses: misses.length };
  assert.ok(samples > 40 && misses.length === 0, `타는 동안 서로 안 보인 순간 ${JSON.stringify(misses.slice(0, 5))} / ${samples}`);
  await Promise.all([shot(A, `A-${RT.toId}-doors-open`), shot(Bp, `B-${RT.toId}-doors-open`)]);
  // 내리기: 둘 다 문으로 걸어 나감 → 수내 승강장 = 같은 열차(run), 같은 정차 시각
  await Promise.all([A, Bp].map(async (pg) => {
    await pg.evaluate(() => { const i = __jj.subway.inside, p = i.player.position; const d = i.doors.reduce((b, x) => (Math.abs(x - p.x) < Math.abs(b - p.x) ? x : b), i.doors[0]); p.set(d + 0.35, 0, -0.2); i.player.rotation.y = 0; i.cam.yaw = 0; });
    await pg.keyboard.down('KeyW'); await settled(pg, 'platform'); await pg.keyboard.up('KeyW');
  }));
  const ar = await Promise.all([A, Bp].map((pg) => pg.evaluate(() => { const i = __jj.subway.inside; return { st: __jj.subway.station.name, run: i.sched.run, at: i.sched.at, zone: __jj.subway.zone }; })));
  report.alight = ar;
  assert.equal(ar[0].st, RT.to); assert.equal(ar[1].st, RT.to);
  report.alightVsTimeline = Math.round(ar[0].at - (tr[0].at + tr[0].arr0 * 1000)); // 내린 역 승강장 정차 시각 = 열차 안 타임라인 도착 (같은 열차)
  assert.ok(Math.abs(report.alightVsTimeline) < 50, `내린 역 시각 = 타임라인 ${report.alightVsTimeline}ms`);
  assert.equal(ar[0].run, ar[1].run); assert.ok(Math.abs(ar[0].at - ar[1].at) < 1, `${RT.to} 정차 시각 같음`); assert.equal(ar[0].zone, ar[1].zone);
  await until(A, () => [...__jj.remotes.peers.values()].some((q) => q.name === '동기B' && q.zone === __jj.remotes.zone && q.mesh.parent === __jj.subway.inside?.scene), null, 15000);
  await until(Bp, () => [...__jj.remotes.peers.values()].some((q) => q.name === '동기A' && q.zone === __jj.remotes.zone && q.mesh.parent === __jj.subway.inside?.scene), null, 15000);
  await A.evaluate(() => { const i = __jj.subway.inside; i.cam.yaw = Math.PI * 0.75; i.cam.pitch = 0.25; i.cam.dist = 5; }); await A.waitForTimeout(500);
  await shot(A, `A-${RT.toId}-platform-sees-B`);
  // 기록 비교 (serverNow): 정자 문 열림 · 출발 · 수내 도착 · 수내 문 열림
  const ev = await Promise.all([A, Bp].map((pg) => pg.evaluate(() => window.__syncEv)));
  const run = tr[0].run;
  const find = (list, re) => list.find((e) => re.test(e.key))?.s;
  const marks = {
    jeongjaDoorOpen: new RegExp(`^p:jeongja:${run}:open$`),
    depart: new RegExp(`^t:${run}:run:0:`),
    arriveSunae: new RegExp(`^t:${run}:stop:0:`),
    sunaeDoorOpen: new RegExp(`^t:${run}:stop:0:open$`),
  };
  report.diffMs = {};
  for (const [k, re] of Object.entries(marks)) {
    const a = find(ev[0], re), b = find(ev[1], re);
    assert.ok(Number.isFinite(a) && Number.isFinite(b), `${k} 기록 없음 ${JSON.stringify(ev.map((l) => l.map((e) => e.key)))}`);
    report.diffMs[k] = Math.round(Math.abs(a - b));
    assert.ok(Math.abs(a - b) < 200, `${k} 차이 ${a - b}ms`);
  }
  const a0 = find(ev[0], marks.depart);
  report.departVsTimetable = Math.round(a0 - (tr[0].at + 30000)); // 출발 = 정차 + 30초
  assert.deepEqual(errs, [], 'page errors');
  console.log('e2e-subway-train-sync OK', JSON.stringify(report));
} finally {
  await browser.close().catch(() => {});
  relay.kill('SIGTERM');
}
