// [myeongdong-perf] 명동 걷기 프레임 측정 (headless Chrome + swiftshader). vite 가 PORT 에 떠 있어야 한다.
//   node scripts/walk-myeongdong.mjs <port> [w] [h] [hour] [secs]   PROFILE=1 → CPU 프로파일 상위 함수
import fs from 'node:fs';
import { chromium } from 'playwright';
const [PORT = '5231', W = '1280', H = '800', HOUR = '14', SECS = '30'] = process.argv.slice(2);
const MOBILE = +W < 900;
const OUT = process.env.OUT || 'artifacts/md-walk';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, isMobile: MOBILE, hasTouch: MOBILE });
const page = await ctx.newPage();
// rAF 콜백마다 메인 스레드 JS 시간을 잰다 (swiftshader 는 GPU 그림이 느려 rAF 간격만으로는 JS 끊김을 못 가린다)
await page.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const J = window.__rafJs = [];
  window.requestAnimationFrame = (cb) => raf((t) => { const t0 = performance.now(); try { cb(t); } finally { if (window.__rafOn) J.push([t0, performance.now() - t0, cb.name || '']); } });
});
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const at = process.env.AT || 'myeongdong';
const q = `ws=mock&at=${at}&hour=${HOUR}&weather=clear&enter=1&noticePopup=0&controlscard=0${MOBILE ? '&mobile=1' : ''}${process.env.EXTRA ? '&' + process.env.EXTRA : ''}`;
await page.goto(`http://127.0.0.1:${PORT}/?${q}`);
await page.waitForFunction((at) => window.__jj?.ready && (at !== 'myeongdong' || window.__jj?.myeongdong?.ready), at, { timeout: 240000 });
await page.waitForTimeout(3000);
{ const b = page.getByText(/Enter World|입장하기|월드 입장/).first(); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(4000); } }
await page.waitForTimeout(6000);
// 출발점 + 경유지
const route = await page.evaluate((at) => {
  const J = window.__jj, md = J.myeongdong;
  J.setMode('follow');
  if (at !== 'myeongdong') { const p = J.player.position; return { start: [p.x, p.z], wps: [[p.x + 60, p.z], [p.x + 60, p.z + 60], [p.x, p.z + 60], [p.x, p.z]] }; }
  const c = md.cathedral; const f = c.facade;
  return { start: [md.spawn.x, md.spawn.z], wps: [[-10916, -21540], [-10916, -21560], [-10921, -21640], [-10930, -21700], [-10980, -21800], [f[0] + c.axis[0] * 30, f[1] + c.axis[1] * 30], [f[0] + c.axis[0] * 6, f[1] + c.axis[1] * 6]] };
}, at);
await page.evaluate(async ([x, z]) => { const J = window.__jj; await J.corridor?.preload?.(x, z); await J.teleport(x, z); J.wake?.(); }, route.start);
await page.waitForTimeout(4000);
// 측정 시작
await page.evaluate(() => {
  const S = window.__walk = { ft: [], loaf: [], geo: [], t0: performance.now() }; window.__rafOn = true; window.__rafJs.length = 0; S.slice0 = (window.__boot?.lazySlices || []).length;
  let last = performance.now();
  const f = (t) => { S.ft.push(t - last); last = t; if (S.on !== false) requestAnimationFrame(f); };
  requestAnimationFrame(f);
  new PerformanceObserver((l) => { for (const e of l.getEntries()) S.loaf.push({ t: e.startTime - S.t0, d: e.duration, block: e.blockingDuration, scripts: (e.scripts || []).map((s) => ({ inv: s.invoker, src: (s.sourceURL || '').split('/').pop() + ':' + s.sourceCharPosition, fn: s.sourceFunctionName, d: s.duration })) }); }).observe({ type: 'long-animation-frame' });
  S.iv = setInterval(() => { const m = window.__jj.renderer.info; S.geo.push({ t: performance.now() - S.t0, geo: m.memory.geometries, tex: m.memory.textures, prog: m.programs?.length, calls: m.render.calls, tris: m.render.triangles, heap: performance.memory?.usedJSHeapSize, x: window.__jj.player.position.x, z: window.__jj.player.position.z }); }, 1000);
});
let cdp;
if (process.env.PROFILE) { cdp = await ctx.newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
const tEnd = Date.now() + +SECS * 1000;
await page.keyboard.down('KeyW');
let wi = 0, hops = 0;
while (Date.now() < tEnd) {
  const r = await page.evaluate(([wps, wi]) => {
    const J = window.__jj; const p = J.player.position; J.wake?.();
    // 막히면(1.2 초 동안 0.6 m 미만) 다음 경유지 쪽으로 3 m 건너뛴다 — 경로 탐색 대신 측정용
    const W = window.__walkStuck ||= { x: p.x, z: p.z, t: performance.now(), hops: 0 };
    let [tx, tz] = wps[wi]; if (Math.hypot(tx - p.x, tz - p.z) < 4 && wi < wps.length - 1) { wi++; [tx, tz] = wps[wi]; }
    if (performance.now() - W.t > 1200) {
      if (Math.hypot(p.x - W.x, p.z - W.z) < 0.6) { const L = Math.hypot(tx - p.x, tz - p.z) || 1; const k = Math.min(3, L); J.teleport(p.x + (tx - p.x) / L * k, p.z + (tz - p.z) / L * k); W.hops++; }
      W.x = p.x; W.z = p.z; W.t = performance.now();
    }
    const yaw = Math.atan2(-(tx - p.x), -(tz - p.z)); J.cam.yaw = yaw;
    return { wi, done: wi === wps.length - 1 && Math.hypot(tx - p.x, tz - p.z) < 4 };
  }, [route.wps, wi]);
  wi = r.wi; if (r.done) { wi = 0; route.wps.reverse(); }
  await page.waitForTimeout(150);
}
await page.keyboard.up('KeyW');
let prof;
if (cdp) prof = (await cdp.send('Profiler.stop')).profile;
const S = await page.evaluate(() => { const S = window.__walk; S.on = false; clearInterval(S.iv); window.__rafOn = false; return { slices: (window.__boot?.lazySlices || []).slice(S.slice0).sort((a, b) => b.jsMs - a.jsMs).slice(0, 10), js: window.__rafJs.filter((r) => r[2] === 'frame').map((r) => r[1]), ft: S.ft, loaf: S.loaf, geo: S.geo, hops: window.__walkStuck?.hops || 0 }; });
const ft = S.ft.slice(2).sort((a, b) => a - b);
const pct = (p) => +ft[Math.min(ft.length - 1, Math.floor(ft.length * p))].toFixed(1);
const js = S.js.slice().sort((a, b) => a - b); const jp = (p) => +js[Math.min(js.length - 1, Math.floor(js.length * p))].toFixed(1);
// 게임 frame() JS 시간 — 끊김 판정은 이쪽 (p50/p95/max, 100 ms 넘는 프레임 수, 30 초당)
const frameJs = { n: js.length, p50: jp(0.5), p95: jp(0.95), p99: jp(0.99), max: +js[js.length - 1].toFixed(1), over50: js.filter((v) => v > 50).length, over100: js.filter((v) => v > 100).length, per30s: +(js.filter((v) => v > 100).length * 30 / +SECS).toFixed(1) };
const res = { frameJs, slices: S.slices, q, frames: ft.length, fps: +(ft.length / (+SECS)).toFixed(1), p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: +ft[ft.length - 1].toFixed(1), long50: S.loaf.length, long100: S.loaf.filter((e) => e.d > 100).length, hops: S.hops, walked: Math.round(S.geo.reduce((a, g, i) => i ? a + Math.hypot(g.x - S.geo[i - 1].x, g.z - S.geo[i - 1].z) : 0, 0)), geoStart: S.geo[0], geoEnd: S.geo[S.geo.length - 1], errors };
// 롱프레임 스크립트 원인 집계
const by = {};
for (const e of S.loaf) for (const s of e.scripts) { const k = (s.inv || '') + ' | ' + (s.fn || '') + ' @' + s.src; by[k] = (by[k] || 0) + s.d; }
res.loafScripts = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, Math.round(v)]);
res.worstFrames = S.loaf.sort((a, b) => b.d - a.d).slice(0, 6).map((e) => ({ t: Math.round(e.t), d: Math.round(e.d), s: e.scripts.slice(0, 3) }));
if (prof) {
  const self = new Map(); const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
  const dt = prof.timeDeltas; const cnt = new Map();
  prof.samples.forEach((id, i) => cnt.set(id, (cnt.get(id) || 0) + (dt[i] || 0)));
  for (const [id, us] of cnt) { const n = nodes.get(id); const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + us); }
  const tot = [...self.values()].reduce((a, b) => a + b, 0);
  res.profileTop = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, +(100 * v / tot).toFixed(1) + '%']);
  fs.writeFileSync(`${OUT}/profile-${at}-${W}x${H}.cpuprofile`, JSON.stringify(prof));
}
fs.writeFileSync(`${OUT}/walk-${at}-${W}x${H}${process.env.TAG ? '-' + process.env.TAG : ''}.json`, JSON.stringify({ ...res, geo: S.geo }, null, 1));
await page.screenshot({ path: `${OUT}/walk-${at}-${W}x${H}${process.env.TAG ? '-' + process.env.TAG : ''}.png` });
console.log(JSON.stringify(res, null, 1));
await browser.close();
