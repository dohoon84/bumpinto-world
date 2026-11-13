// [myeongdong] 명동 스크린샷·성능 측정 (headless Chrome + swiftshader). 개발용 — vite 가 PORT 에 떠 있어야 한다.
//   node scripts/shot-myeongdong.mjs <port> <hour> [w] [h] [views,...]
//   결과: artifacts/myeongdong/<w>x<h>-h<hour>-<view>.png + metrics-<w>x<h>-h<hour>.json
import fs from 'node:fs';
import { chromium } from 'playwright';
const [PORT = '5203', HOUR = '14', W = '1280', H = '800', ONLY = ''] = process.argv.slice(2);
const OUT = process.env.OUT || 'artifacts/myeongdong';
const MOBILE = +W < 900;
// 시점: 플레이어 위치(px,pz) + 카메라 yaw(앞 = (-sin, -cos)) / pitch / dist. ov = 공중(overview)
const VIEWS0 = [
  { name: 'station-exit', px: 'spawn', yaw: 'face', pitch: 0.08, dist: 7.5 },
  { name: 'main-street', px: -10916, pz: -21560, yaw: 0.02, pitch: 0.1, dist: 8 },
  { name: 'food-stalls', px: -10921, pz: -21640, yaw: -0.25, pitch: 0.2, dist: 9 },
  { name: 'myeongdong-gil', px: -10980, pz: -21800, yaw: -1.45, pitch: 0.12, dist: 9 },
  // 첨탑·십자가가 1280x800 과 모바일 가로 844x390 모두에 들어오게 조금 물러서서 위를 본다
  { name: 'cathedral', px: 'cath', back: 22, side: -3.5, pitch: -0.18, dist: 10 },
  { name: 'cathedral-stairs', px: 'cath', back: 52, side: -3.5, pitch: -0.14, dist: 11 },
  { name: 'cathedral-aerial', px: 'cath', back: 10, ov: true, dist: 95, pitch: 0.55, yawOff: 0.5 },
  // [myeongdong-cathedral] 옆·뒤 공중 + 정문 앞 + 실내 (u,v = 성당 축 좌표, 문자열이면 F.<이름> 식)
  { name: 'cathedral-side', px: 'cath', back: 10, ov: true, dist: 110, pitch: 0.42, yawOff: 1.25 },
  { name: 'cathedral-door', px: 'cathIn', u: 'F.uF+9', v: 0, tu: 'F.uF', tv: 0, pitch: -0.22, dist: 6 },
  { name: 'in-nave', px: 'cathIn', u: 'F.uBF-1.5', v: 0, tu: 'F.uC-4', tv: 0, pitch: -0.06, dist: 4.5, inside: true },
  { name: 'in-vault', px: 'cathIn', u: '(F.uT+F.uBF)/2', v: 0, tu: 'F.uC', tv: 0, pitch: -1.05, dist: 3.2, inside: true },
  { name: 'in-floorlight', px: 'cathPatch', pitch: 0.62, dist: 4.5, inside: true },
  { name: 'in-rose', px: 'cathIn', u: 'F.uBF-7', v: 0, tu: 'F.uF', tv: 0, pitch: -0.5, dist: 2.5, inside: true },
  { name: 'in-apse', px: 'cathIn', u: 'F.uT+4', v: 0, tu: 'F.uC-6', tv: 0, pitch: -0.32, dist: 3.5, inside: true },
  // 낮에 열린 회오리감자 노점 클로즈업 (닫힌 노점을 비추지 않게 day+kind 지정)
  { name: 'food-closeup', px: 'stallSide', kind: 2, day: true, near: [-10916, -21580], side: 1.7, yawOff: -0.35, pitch: 0.38, dist: 4.0 },
  { name: 'cable-link', px: -11030, pz: -21085, yaw: 0.35, pitch: 0.25, dist: 12 },
  { name: 'aerial', ov: true, px: -10930, pz: -21700, dist: 420, pitch: 0.72, yaw: 0.5 },
  { name: 'jeongja', px: 0, pz: 0, yaw: 0, pitch: 0.1, dist: 8, home: true },
  { name: 'namsan-tower', px: 'ntower', yaw: 0, pitch: 0.12, dist: 9 },
];
const VIEWS = process.env.VIEWS_JSON ? JSON.parse(process.env.VIEWS_JSON) : ONLY ? VIEWS0.filter((v) => ONLY.split(',').includes(v.name)) : VIEWS0;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, isMobile: MOBILE, hasTouch: MOBILE });
const page = await ctx.newPage();
if (process.env.BREAKDOWN) await page.addInitScript((d) => { window.__MD_BREAKDOWN = d; }, +process.env.BREAKDOWN || 1);
const errors = [], warns = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errors.push(t); else if (/myeongdong/.test(t)) warns.push(t); });
const q = `ws=mock&at=myeongdong&hour=${HOUR}&weather=clear&shot=1&noticePopup=0&controlscard=0${MOBILE ? '&mobile=1' : ''}${process.env.EXTRA ? '&' + process.env.EXTRA : ''}`;
await page.goto(`http://127.0.0.1:${PORT}/?${q}`);
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.myeongdong?.ready, null, { timeout: 240000 });
await page.waitForTimeout(5000);
// 소프트웨어 GPU 에서는 한강·남산을 짓는 동안 그림을 거의 건너뛴다 → 다 지어 그림이 다시 돌 때까지 기다린다(묵은 화면 방지)
const waitPaint = async () => { for (let i = 0; i < 150; i++) { const f = await page.evaluate(async () => { const R = window.__jj.renderer; const a = R.info.render.frame; await new Promise((r) => setTimeout(r, 1500)); return R.info.render.frame - a; }); if (f >= 2) return; } };
await waitPaint();
const res = { q, views: {}, build: warns };
for (const v of VIEWS) {
  const info = await page.evaluate(async (v) => {
    const J = window.__jj, md = J.myeongdong;
    let px = v.px, pz = v.pz, yaw = v.yaw;
    if (px === 'spawn') { px = md.spawn.x; pz = md.spawn.z; }
    if (px === 'ntower') { const t = J.namsan?.spawn; px = t.x; pz = t.z; }
    if (yaw === 'face') yaw = md.face;
    const toward = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
    if (px === 'cath') { const c = md.cathedral; const f = c.facade; const k = v.back || 0; const sd = v.side || 0; px = f[0] + c.axis[0] * k - c.axis[1] * sd; pz = f[1] + c.axis[1] * k + c.axis[0] * sd; yaw = toward(px, pz, c.x, c.z) + (v.yawOff || 0); }
    if (px === 'cableLower') { // [myeongdong-detail] 남산 케이블카 하부정류장 입구 앞
      await J.corridor.preload(-10995.2, -21019.5);
      for (let i = 0; i < 60 && !J.namsan?.cable?.stationInfo; i++) await new Promise((r) => setTimeout(r, 500));
      const d = J.namsan?.cable?.stationInfo?.[1]?.door || { x: -10995.2, z: -21019.5, nx: 0, nz: 1 };
      const b = v.back || 10, sd = v.side || 0; px = d.x + d.nx * b + d.nz * sd; pz = d.z + d.nz * b - d.nx * sd; yaw = toward(px, pz, d.x, d.z) + (v.yawOff || 0);
    }
    if (px === 'oreumi') { const c = md.hooks.course; const a = c[1], b = c[2]; px = a.x + (a.x - b.x) * 0.25 + (v.ox || 0); pz = a.z + (a.z - b.z) * 0.25 + (v.oz || 0); yaw = toward(px, pz, b.x, b.z) + (v.yawOff || 0); }
    if (px === 'exitSign') { // [text-orientation] 명동역 출구 표지판 앞(back>0) / 뒤(back<0)에서. ref = 출구 번호
      const e = md.station.exits.find((q) => String(q.ref) === String(v.ref || 6)) || md.station.exits[0];
      const b = v.back ?? 7; px = e.x + e.ax * b + (v.side || 0) * -e.az; pz = e.z + e.az * b + (v.side || 0) * e.ax; yaw = toward(px, pz, e.x, e.z) + (v.yawOff || 0);
    }
    if (px === 'cathIn' || px === 'cathPatch') { // [myeongdong-cathedral] 성당 축 좌표
      const F = md.cathedral.frame; const U = (q) => (typeof q === 'number' ? q : Function('F', 'return ' + q)(F));
      md.cathedralInterior?.setVisible?.(true);
      if (px === 'cathPatch') {
        const c = md.cathedralInterior?.brightPatch?.(); // 가장 밝은 빛 조각 (없으면 측랑 바닥)
        const A = md.cathedralAt(F.uT + F.BAY * 2.5, 6.5), T = c || md.cathedralAt(F.uT + F.BAY * 2.5, 11);
        const dx = T[0] - A[0], dz = T[1] - A[1], d = Math.hypot(dx, dz) || 1;
        px = T[0] - dx / d * 3.2; pz = T[1] - dz / d * 3.2; yaw = toward(px, pz, T[0], T[1]) + (v.yawOff || 0);
      } else {
        const [x, z] = md.cathedralAt(U(v.u), U(v.v)), [tx, tz] = md.cathedralAt(U(v.tu), U(v.tv));
        px = x; pz = z; yaw = toward(px, pz, tx, tz) + (v.yawOff || 0);
      }
    }
    if (px === 'stall') { const st = md.hooks.stalls[v.i || 0]; px = st.x + (v.ox || 0); pz = st.z + (v.oz || 0); }
    if (px === 'stallSide') { // [myeongdong-detail] 노점 옆(보도)에서 판매대를 내려다보기. kind 를 주면 그 음식 노점
      const L = md.hooks.stalls.filter((s) => (v.kind == null || s.kind === v.kind) && (v.day == null || s.day === v.day)); const [qx, qz] = v.near || [-10930, -21650];
      L.sort((a, b) => Math.hypot(a.x - qx, a.z - qz) - Math.hypot(b.x - qx, b.z - qz));
      const s = L[v.k || 0]; const sd = v.sd || 1; const nx = -s.tz * sd, nz = s.tx * sd;
      px = s.x + nx * (v.back ?? 2.3) + s.tx * (v.side || 0); pz = s.z + nz * (v.back ?? 2.3) + s.tz * (v.side || 0); yaw = Math.atan2(nx, nz) + (v.yawOff || 0);
    }
    if (px === 'shop') { // [myeongdong-detail] 종류(type)의 가게 중 near 에 가장 가까운 곳 문 앞
      const L = md.hooks.shops.filter((s) => s.type === v.type && (!v.minW || s.w >= v.minW)); const [qx, qz] = v.near || [-10916, -21600];
      L.sort((a, b) => Math.hypot(a.x - qx, a.z - qz) - Math.hypot(b.x - qx, b.z - qz));
      const s = L[v.k || 0]; const nx = Math.sin(s.face), nz = Math.cos(s.face);
      px = s.x + nx * (v.back || 0) + nz * (v.side || 0); pz = s.z + nz * (v.back || 0) - nx * (v.side || 0); yaw = s.face + (v.yawOff || 0);
    }
    if (typeof yaw === 'string' && yaw.startsWith('to:')) { const [tx, tz] = yaw.slice(3).split(',').map(Number); yaw = toward(px, pz, tx, tz); }
    J.setMode('follow');
    if (v.home) J.teleport(0, 0); else { await J.corridor.preload(px, pz); const y = md.owns(px, pz) ? md.surfaceY(px, pz) : (v.px === 'ntower' ? J.namsan.spawnY() : (J.namsan?.surfaceY?.(px, pz) ?? undefined)); J.teleport(px, pz, y); }
    if (v.ov) { J.setMode('overview'); Object.assign(J.ov, { dist: v.dist, pitch: v.pitch, yaw }); } else Object.assign(J.cam, { dist: v.dist, pitch: v.pitch, yaw });
    await new Promise((r) => setTimeout(r, 3000));
    return { px: +px.toFixed?.(1), pz: +pz.toFixed?.(1), yaw: typeof yaw === 'number' ? +yaw.toFixed(4) : yaw, y: +J.player?.position.y.toFixed(2) };
  }, v);
  await page.waitForTimeout(4000);
  await waitPaint();
  const m = await page.evaluate(async () => {
    const R = window.__jj.renderer; await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    const info = R.info;
    // fps (swiftshader = CPU 렌더라 실기기보다 훨씬 낮다 — 상대 비교용)
    const t0 = performance.now(); let n = 0; await new Promise((ok) => { const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else ok(); }; requestAnimationFrame(f); });
    // 어느 덩어리가 그리나 (__MD_BREAKDOWN 일 때만): 보이는 메시 중 화면 안(경계구 중심 투영 근사)을 장면 2단 이름별로 센다
    // 정확한 드로우 출처: 한 프레임 동안 그려진 객체마다 onBeforeRender 로 센다(장면 경로 앞 N단 이름별)
    const by = {};
    if (window.__MD_BREAKDOWN) {
      const J = window.__jj; let sc = J.player; while (sc.parent) sc = sc.parent;
      const saved = [];
      sc.traverse((o) => {
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
        let a = o; const path = []; while (a.parent) { path.unshift(a.name || a.type); a = a.parent; }
        const k = path.slice(0, (path[0] === 'corridor' ? 2 : 1) + (window.__MD_BREAKDOWN - 1)).join('/');
        const prev = o.onBeforeRender; saved.push([o, prev, Object.prototype.hasOwnProperty.call(o, 'onBeforeRender')]);
        o.onBeforeRender = function (...a2) { by[k] = (by[k] || 0) + 1; return prev.apply(this, a2); };
      });
      const f0 = R.info.render.frame; const tw = performance.now();
      while (R.info.render.frame < f0 + 2 && performance.now() - tw < 15000) await new Promise((ok) => requestAnimationFrame(ok));
      const nf = Math.max(1, R.info.render.frame - f0);
      for (const k in by) by[k] = Math.round(by[k] / nf);
      for (const [o, prev, own] of saved) { if (own) o.onBeforeRender = prev; else delete o.onBeforeRender; }
    }
    return { by: window.__MD_BREAKDOWN ? Object.fromEntries(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 30)) : undefined, draws: info.render.calls, tris: info.render.triangles, geos: info.memory.geometries, tex: info.memory.textures, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, fpsSw: +(n / ((performance.now() - t0) / 1000)).toFixed(1) };
  });
  res.views[v.name] = { ...info, ...m };
  await page.evaluate(() => window.__jj.wake?.()); await page.waitForTimeout(1500); // 느린 swiftshader 에서 쌓인 자동 AFK(Zzz) 풀기
  await page.screenshot({ path: `${OUT}/${W}x${H}-h${HOUR}-${v.name}.png` });
  console.log(v.name, JSON.stringify(res.views[v.name]));
}
res.stats = await page.evaluate(() => window.__jj.myeongdong?.stats?.());
res.errors = errors.slice(0, 20);
fs.writeFileSync(`${OUT}/metrics-${W}x${H}-h${HOUR}.json`, JSON.stringify(res, null, 1));
console.log('stats', JSON.stringify(res.stats));
console.log('build', warns.slice(0, 5));
console.log('errors', res.errors);
await browser.close();
