// [seongsu] 성수동 · 하우스 노웨어 서울 스크린샷·성능 (headless Chrome + swiftshader). vite 가 PORT 에 떠 있어야 한다.
//   node scripts/shot-seongsu.mjs <port> <hour> [w] [h] [views,...]   OUT=폴더  RIDE=1 → 잠실역에서 2호선 타고 성수역까지
import fs from 'node:fs';
import { chromium } from 'playwright';
const [PORT = '5311', HOUR = '14', W = '1280', H = '800', ONLY = ''] = process.argv.slice(2);
const OUT = process.env.OUT || 'artifacts/seongsu';
const MOBILE = +W < 900;
fs.mkdirSync(OUT, { recursive: true });
// hl = 사옥 로컬 [x,z] (+fl 층), to = 바라볼 로컬 점. w = 월드 [x,z]
const VIEWS0 = [
  { name: 'arrival', spawn: true, toHq: true, pitch: 0.16, dist: 15 },
  { name: 'hq-front', hl: [0, 48], to: [0, 0], pitch: 0.04, dist: 12 },
  { name: 'hq-corner', hl: [38, 36], to: [0, 0], pitch: 0.08, dist: 10 },
  { name: 'street', near: 'road', pitch: 0.1, dist: 9 },
  { name: 'station', station: true, back: 34, pitch: -0.02, dist: 10 },
  { name: 'viaduct', sv: [-170, 4], sto: [0, 0], pitch: -0.06, dist: 12 },
  { name: 'station-side', sv: [-40, -19.5], sto: [20, 0], pitch: -0.28, dist: 8 },
  { name: 'viaduct-under', sv: [-40, -5], sto: [40, 3], pitch: -0.2, dist: 7 },
  { name: 'station-aerial', ov: true, sv: [0, 0], dist: 150, pitch: 0.95, yaw: 2.6 },
  { name: 'exit-3', exit: '3', back: 14, pitch: 0.02, dist: 9 },
  { name: 'exit-1', exit: '1', back: 14, pitch: 0.02, dist: 9 },
  { name: 'seongsu-bridge-n', ov: true, w: [-6470, -18930], dist: 300, pitch: 0.5, yaw: 0.5 },
  { name: 'yeongdong-n', ov: true, w: [-4400, -18700], dist: 260, pitch: 0.45, yaw: 0.25 },
  { name: 'cheongdam-n', ov: true, w: [-3650, -18560], dist: 280, pitch: 0.45, yaw: -0.35 },
  { name: 'aerial-wide', ov: true, w: [-5100, -19380], dist: 1500, pitch: 1.0, yaw: 0.0 },
  { name: 'seoulforest', ov: true, w: [-6000, -19600], dist: 420, pitch: 0.6, yaw: 0.8 },
  { name: 'yd-join', w: [-4335, -18760], wto: [-4354, -18513], pitch: 0.12, dist: 16 },
  { name: 'ss-bridge-approach', w: [-6380, -19330], wto: [-6516, -18615], pitch: 0.15, dist: 18 },
  { name: 'cd-join', w: [-3700, -18700], wto: [-3834, -18282], pitch: 0.15, dist: 18 },
  { name: 'station-street', sv: [-95, -30], sto: [-60, 0], pitch: 0.35, dist: 26 },
  { name: 'station-x', ov: true, sv: [-105, 0], dist: 70, pitch: 0.8, yaw: 0.9 },
  { name: 'yd-join-ov', ov: true, w: [-4370, -18600], dist: 170, pitch: 0.55, yaw: 2.6 },
  { name: 'ss-join-ov', ov: true, w: [-6480, -18950], dist: 330, pitch: 0.5, yaw: 0.15 },
  { name: 'cd-join-ov', ov: true, w: [-3760, -18350], dist: 300, pitch: 0.5, yaw: 0.1 },
  { name: 'aerial', ov: true, hl: [0, 0], dist: 260, pitch: 0.72, yaw: 0.6 },
  { name: 'in-1f', hl: [0, 9.5], fl: 1, to: [0, -4], pitch: 0.12, dist: 4.2, inside: true },
  { name: 'in-2f', hl: [-2, 5], fl: 2, to: [2, -3], pitch: 0.12, dist: 3.8, inside: true },
  { name: 'in-5f', hl: [-5.5, 2.5], fl: 5, to: [1.5, -2.0], pitch: 0.14, dist: 3.6, inside: true },
];
const VIEWS = ONLY ? VIEWS0.filter((v) => ONLY.split(',').includes(v.name)) : VIEWS0;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, isMobile: MOBILE, hasTouch: MOBILE });
const page = await ctx.newPage();
const errors = [], logs = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errors.push(t); else if (/seongsu|gentle|hq/i.test(t)) logs.push(t); });
const RIDE = process.env.RIDE === '1';
const q = `ws=mock&at=${RIDE ? 'jamsil' : 'seongsu'}&hour=${HOUR}&weather=clear&shot=1&noticePopup=0&controlscard=0&bgm=0&subwayVoice=0&subwayRt=0${MOBILE ? '&mobile=1' : ''}${process.env.EXTRA ? '&' + process.env.EXTRA : ''}`;
await page.goto(`http://localhost:${PORT}/?${q}`, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
if (process.env.BREAKDOWN) await page.evaluate(() => { window.__SS_BREAKDOWN = 1; });
const waitPaint = async () => { for (let i = 0; i < 150; i++) { const f = await page.evaluate(async () => { const R = window.__jj.renderer; const a = R.info.render.frame; await new Promise((r) => setTimeout(r, 1500)); return R.info.render.frame - a; }); if (f >= 2) return; } };
const metrics = () => page.evaluate(async () => {
  const J = window.__jj, R = J.renderer; await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  let by;
  if (window.__SS_BREAKDOWN) { // 한 프레임 동안 그려진 객체를 장면 경로 앞 3단 이름별 삼각형 수로
    by = {}; let sc = J.player; while (sc.parent) sc = sc.parent; const saved = [];
    sc.traverse((o) => { if (!o.isMesh) return; let a = o; const path = []; while (a.parent) { path.unshift(a.name || a.type); a = a.parent; } const k = path.slice(0, 3).join('/'); const prev = o.onBeforeRender; saved.push([o, prev, Object.prototype.hasOwnProperty.call(o, 'onBeforeRender')]);
      o.onBeforeRender = function (...a2) { const g = this.geometry; const n = ((g.index ? g.index.count : g.attributes.position.count) / 3) * (this.isInstancedMesh ? this.count : 1); by[k] = (by[k] || 0) + n; return prev.apply(this, a2); }; });
    const f0 = R.info.render.frame; while (R.info.render.frame < f0 + 1) await new Promise((ok) => requestAnimationFrame(ok));
    for (const [o, prev, own] of saved) { if (own) o.onBeforeRender = prev; else delete o.onBeforeRender; }
    by = Object.fromEntries(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, Math.round(v / 1000) + 'k']));
  }
  const i = R.info; const mem = performance.memory;
  return { draws: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null, pos: [+J.player.position.x.toFixed(1), +J.player.position.y.toFixed(2), +J.player.position.z.toFixed(1)], hqFloor: J.seongsu?.hqFloor ?? null, by };
});
const res = { q, views: {}, logs };
const until = (fn, t = 90000) => page.waitForFunction(fn, null, { timeout: t, polling: 150 });
const shot = async (name) => { await page.evaluate(() => window.__jj.wake?.()); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/${W}x${H}-h${HOUR}-${name}.png` }); res.views[name] = await metrics(); console.log(name, JSON.stringify(res.views[name])); };
if (RIDE) {
  try {
    await page.evaluate(() => document.getElementById('lobby-go')?.click());
    await page.waitForTimeout(6000);
    await page.evaluate(async () => {
      const J = window.__jj, S = J.subway; S.ensureStation?.('jamsil');
      for (let k = 0; k < 120 && !S.entrances?.some((e) => e.def?.id === 'jamsil' || e.station?.id === 'jamsil'); k++) await new Promise((r) => setTimeout(r, 500));
      const P = J.player.position;
      const L = S.entrances.slice().sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
      const e = L[0]; const s = Math.sin(e.ry), c = Math.cos(e.ry);
      J.setMode('follow'); J.teleport(e.x - s, e.z - c); J.player.rotation.y = e.ry; J.cam.yaw = e.ry + Math.PI;
    });
    await page.waitForTimeout(1500);
    await page.keyboard.down('KeyW');
    await until(() => window.__jj.subway.state.phase === 'inside' && window.__jj.subway.room === 'concourse' && !window.__jj.subway.swapping);
    await page.keyboard.up('KeyW');
    console.log('station', await page.evaluate(() => window.__jj.subway.station?.name));
    await page.evaluate(() => window.__jj.subway.toPlatform('l2', 1));
    await until(() => window.__jj.subway.room === 'platform' && !window.__jj.subway.swapping);
    await shot('ride-1-jamsil-platform');
    await page.evaluate(() => window.__jj.subway.inside.callTrain(13));
    await until(() => window.__jj.subway.inside?.doorsNow > 0.9, 60000).catch(() => {});
    await page.evaluate(() => { const i = window.__jj.subway.inside; const d = i.lay.doors.find((q) => q.label === '3-2') || i.lay.doors[0]; i.player.position.set(d.x, 0, -0.4); i.player.rotation.y = 0; i.cam.yaw = Math.PI; });
    await page.keyboard.down('KeyW');
    await until(() => window.__jj.subway.room === 'train' && !window.__jj.subway.swapping, 60000);
    await page.keyboard.up('KeyW');
    const segs = await page.evaluate(() => window.__jj.subway.inside.segs?.map((s) => `${s.name}${s.pass ? '(통과)' : s.game ? '' : '(x)'}`));
    console.log('segs', segs); res.segs = segs;
    await shot('ride-2-train');
    const hopped = await page.evaluate(() => {
      const i = window.__jj.subway.inside; let last = {};
      for (let n = 0; n < 500; n++) {
        const cur = i.segs?.[i.stopIndex]; const at = i.stage === 'stop' && cur?.name === '성수';
        if (at && i.canAlight) { last = { ok: true, n, name: cur.name }; break; }
        i.skip(at ? 0.5 : 12); last = { ok: false, n, stage: i.stage, name: cur?.name };
      }
      return last;
    });
    console.log('hopped', JSON.stringify(hopped)); res.hopped = hopped;
    await shot('ride-3-train-at-seongsu');
    await page.evaluate(() => { const i = window.__jj.subway.inside, p = i.player.position; const d = i.doors.reduce((b, x) => (Math.abs(x - p.x) < Math.abs(b - x) ? x : b), i.doors[0]); p.set(d + 0.35, 0, -0.2); i.player.rotation.y = 0; i.cam.yaw = 0; });
    await page.keyboard.down('KeyW');
    for (let t0 = Date.now(); Date.now() - t0 < 12000;) { await page.waitForTimeout(120); if (await page.evaluate(() => window.__jj.subway.room === 'platform' && !window.__jj.subway.swapping)) break; }
    await page.keyboard.up('KeyW');
    res.alight = await page.evaluate(() => ({ room: window.__jj.subway.room, station: window.__jj.subway.station?.name }));
    console.log('alight', JSON.stringify(res.alight));
    await shot('ride-4-seongsu-platform');
    // [seongsu-elevated] 고가 승강장: 길 쪽(뒤 난간 너머)과 건너편 섬식 승강장이 보이게 몇 장 더
    await page.evaluate(() => { const i = window.__jj.subway.inside; i.setView(-30, -2.6, -Math.PI / 2 - 0.35, 0.12, 6); });
    await page.waitForTimeout(1500); await shot('ride-4b-platform-view');
    await page.evaluate(() => { const i = window.__jj.subway.inside; i.setView(22, -3.6, -0.55, 0.32, 5); });
    await page.waitForTimeout(1500); await shot('ride-4c-platform-street');
    // 걸어서 내려가기: 계단 입구 앞 → W 로 계단(아래로) → 대합실
    await page.evaluate(() => { const i = window.__jj.subway.inside; i.setView(0, -3.2, 0, 0.25, 4.5); i.player.rotation.y = Math.PI; });
    await page.waitForTimeout(800);
    await page.keyboard.down('KeyW'); await page.waitForTimeout(1000); await page.keyboard.up('KeyW');
    res.stairY = await page.evaluate(() => +window.__jj.subway.inside?.player?.position?.y?.toFixed?.(2));
    await shot('ride-5a-stairs-down');
    await page.keyboard.down('KeyW');
    for (let t0 = Date.now(); Date.now() - t0 < 15000;) { await page.waitForTimeout(150); if (await page.evaluate(() => window.__jj.subway.room === 'concourse' && !window.__jj.subway.swapping)) break; }
    await page.keyboard.up('KeyW');
    res.walkedDown = await page.evaluate(() => window.__jj.subway.room);
    console.log('walkedDown', res.walkedDown, 'stairY', res.stairY);
    if (res.walkedDown !== 'concourse') { await page.evaluate(() => window.__jj.subway.toConcourse?.({ well: 1 })); await until(() => window.__jj.subway.room === 'concourse' && !window.__jj.subway.swapping, 60000).catch(() => {}); }
    await shot('ride-5-seongsu-concourse');
    await page.evaluate(() => { const S = window.__jj.subway; S.openChooser(); const id = S.exits.find((e) => e.ref === '3')?.id || S.exits[0]?.id; if (id) S.choose(id); S.go(); });
    await until(() => window.__jj.subway.state.phase !== 'inside', 60000).catch(() => {});
    await page.waitForTimeout(6000);
    await page.waitForFunction(() => window.__jj.seongsu?.ready, null, { timeout: 180000 }).catch(() => {});
    await waitPaint();
    await page.evaluate(() => { const J = window.__jj; J.setMode('follow'); Object.assign(J.cam, { dist: 9, pitch: 0.12 }); });
    await page.waitForTimeout(3000);
    await shot('ride-6-seongsu-exit');
    await page.evaluate(() => { const J = window.__jj; Object.assign(J.cam, { dist: 16, pitch: 0.05, yaw: J.cam.yaw + Math.PI }); });
    await page.waitForTimeout(2500);
    await shot('ride-7-exit-looking-back');
  } catch (err) { console.error('ride failed', err.message); errors.push('ride failed: ' + err.message); await page.screenshot({ path: `${OUT}/${W}x${H}-ride-error.png` }).catch(() => {}); }
} else {
  await page.waitForFunction(() => window.__jj?.seongsu?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(4000); await waitPaint();
  for (const v of VIEWS) {
    await page.evaluate(async (v) => {
      const J = window.__jj, S = J.seongsu; const W2 = (p) => S.toWorld(p[0], p[1]);
      const toward = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
      const hqW = W2([0, 0]); let px, pz, yaw = v.yaw ?? 0, y;
      if (v.spawn) { px = S.spawn.x; pz = S.spawn.z; }
      if (v.hl) { [px, pz] = W2(v.hl); }
      if (v.station) { const st = S.station; const d = Math.hypot(hqW[0] - st.x, hqW[1] - st.z); px = st.x + (hqW[0] - st.x) / d * v.back; pz = st.z + (hqW[1] - st.z) / d * v.back; yaw = toward(px, pz, st.x, st.z); }
      if (v.near === 'road') { // 사옥에서 80~140 m 떨어진 차도 위 한 점, 길 방향으로
        let best = null; for (const r of S.roads) { if (!/primary|secondary|tertiary|residential/.test(r.k)) continue; for (let i = 1; i < r.pts.length; i++) { const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i]; const mx = (ax + bx) / 2, mz = (az + bz) / 2; const dd = Math.hypot(mx - hqW[0], mz - hqW[1]); if (dd > 80 && dd < 140 && Math.hypot(bx - ax, bz - az) > 25 && (!best || Math.abs(dd - 110) < best.e)) best = { e: Math.abs(dd - 110), mx, mz, ax, az, bx, bz, w: r.w }; } }
        if (best) { const L = Math.hypot(best.bx - best.ax, best.bz - best.az), nx = -(best.bz - best.az) / L, nz = (best.bx - best.ax) / L; px = best.mx + nx * (best.w / 2 + 2); pz = best.mz + nz * (best.w / 2 + 2); yaw = toward(px, pz, best.bx, best.bz); }
      }
      if (v.w) { [px, pz] = v.w; if (v.wto) yaw = toward(px, pz, v.wto[0], v.wto[1]); }
      if (v.sv) { const q = S.stationAt(v.sv[0], v.sv[1]); px = q.x; pz = q.z; if (v.sto) { const t = S.stationAt(v.sto[0], v.sto[1]); yaw = toward(px, pz, t.x, t.z); } }
      if (v.exit) { const e = J.subway.entrances.find((q) => q.exit?.id === `seongsu-x${v.exit}`); if (!e) return; const s2 = Math.sin(e.ry), c2 = Math.cos(e.ry); px = e.x - s2 * v.back + c2 * 5; pz = e.z - c2 * v.back - s2 * 5; yaw = toward(px, pz, e.x + s2 * 6, e.z + c2 * 6); }
      if (v.toHq) yaw = toward(px, pz, hqW[0], hqW[1]);
      if (v.to) { const t = W2(v.to); yaw = toward(px, pz, t[0], t[1]); }
      if (v.fl) { await S.ensureInterior(); y = S.hq.floorY[v.fl] + 0.05; } else y = S.surfaceY(px, pz, 0.3) ?? 0.05;
      J.setMode('follow'); await J.corridor.preload(px, pz); J.teleport(px, pz, y);
      if (v.ov) { J.setMode('overview'); Object.assign(J.ov, { dist: v.dist, pitch: v.pitch, yaw }); } else Object.assign(J.cam, { dist: v.dist, pitch: v.pitch, yaw });
      J.player.rotation.y = yaw + Math.PI;
      await new Promise((r) => setTimeout(r, 2500));
    }, v);
    await page.waitForTimeout(3500); await waitPaint();
    await shot(v.name);
  }
  res.stats = await page.evaluate(() => window.__jj.seongsu?.stats?.());
  console.log('stats', JSON.stringify(res.stats));
}
res.errors = errors.slice(0, 30);
fs.writeFileSync(`${OUT}/metrics-${W}x${H}-h${HOUR}${RIDE ? '-ride' : ''}.json`, JSON.stringify(res, null, 1));
console.log('logs', logs.slice(0, 10));
console.log('errors', res.errors);
await browser.close();
