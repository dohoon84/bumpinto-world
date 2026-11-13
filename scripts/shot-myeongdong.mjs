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
  { name: 'cathedral', px: -10745, pz: -21815, yaw: 2.6, pitch: 0.22, dist: 14 },
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
const res = { q, views: {}, build: warns };
for (const v of VIEWS) {
  const info = await page.evaluate(async (v) => {
    const J = window.__jj, md = J.myeongdong;
    let px = v.px, pz = v.pz, yaw = v.yaw;
    if (px === 'spawn') { px = md.spawn.x; pz = md.spawn.z; }
    if (px === 'ntower') { const t = J.namsan?.spawn; px = t.x; pz = t.z; }
    if (yaw === 'face') yaw = md.face;
    const toward = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
    if (px === 'cath') { const c = md.cathedral; const f = c.facade; const k = v.back || 0; px = f[0] + c.axis[0] * k; pz = f[1] + c.axis[1] * k; yaw = toward(px, pz, c.x, c.z) + (v.yawOff || 0); }
    if (px === 'oreumi') { const c = md.hooks.course; const a = c[1], b = c[2]; px = a.x + (a.x - b.x) * 0.25 + (v.ox || 0); pz = a.z + (a.z - b.z) * 0.25 + (v.oz || 0); yaw = toward(px, pz, b.x, b.z) + (v.yawOff || 0); }
    if (px === 'stall') { const st = md.hooks.stalls[v.i || 0]; px = st.x + (v.ox || 0); pz = st.z + (v.oz || 0); }
    if (typeof yaw === 'string' && yaw.startsWith('to:')) { const [tx, tz] = yaw.slice(3).split(',').map(Number); yaw = toward(px, pz, tx, tz); }
    J.setMode('follow');
    if (v.home) J.teleport(0, 0); else { await J.corridor.preload(px, pz); const y = md.owns(px, pz) ? md.surfaceY(px, pz) : (v.px === 'ntower' ? J.namsan.spawnY() : (J.namsan?.surfaceY?.(px, pz) ?? undefined)); J.teleport(px, pz, y); }
    if (v.ov) { J.setMode('overview'); Object.assign(J.ov, { dist: v.dist, pitch: v.pitch, yaw }); } else Object.assign(J.cam, { dist: v.dist, pitch: v.pitch, yaw });
    await new Promise((r) => setTimeout(r, 3000));
    return { px: +px.toFixed?.(1), pz: +pz.toFixed?.(1), y: +J.player?.position.y.toFixed(2) };
  }, v);
  await page.waitForTimeout(4000);
  const m = await page.evaluate(async () => {
    const R = window.__jj.renderer; await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    const info = R.info;
    // fps (swiftshader = CPU 렌더라 실기기보다 훨씬 낮다 — 상대 비교용)
    const t0 = performance.now(); let n = 0; await new Promise((ok) => { const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else ok(); }; requestAnimationFrame(f); });
    // 어느 덩어리가 그리나 (__MD_BREAKDOWN 일 때만): 보이는 메시 중 화면 안(경계구 중심 투영 근사)을 장면 2단 이름별로 센다
    const by = {};
    if (window.__MD_BREAKDOWN) {
      const J = window.__jj, cam = J.camera; let sc = J.player; while (sc.parent) sc = sc.parent;
      const V = J.player.position.constructor, v = new V(), cp = cam.getWorldPosition(new V());
      sc.traverseVisible((o) => {
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.geometry) return;
        const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
        const bs = o.isInstancedMesh ? (o.boundingSphere || (o.computeBoundingSphere(), o.boundingSphere)) : g.boundingSphere;
        v.copy(bs.center).applyMatrix4(o.matrixWorld);
        const r = bs.radius * o.matrixWorld.getMaxScaleOnAxis();
        const d = v.distanceTo(cp);
        if (d > r) { v.project(cam); const m = 1 + r / Math.max(1, d) * 2; if (v.z > 1 || Math.abs(v.x) > m || Math.abs(v.y) > m) return; }
        let a = o; const path = []; while (a.parent) { path.unshift(a.name || a.type); a = a.parent; }
        const k = path.slice(0, (path[0] === 'corridor' ? 2 : 1) + (window.__MD_BREAKDOWN - 1)).join('/');
        by[k] = (by[k] || 0) + 1;
      });
    }
    return { by: window.__MD_BREAKDOWN ? Object.fromEntries(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 30)) : undefined, draws: info.render.calls, tris: info.render.triangles, geos: info.memory.geometries, tex: info.memory.textures, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, fpsSw: +(n / ((performance.now() - t0) / 1000)).toFixed(1) };
  });
  res.views[v.name] = { ...info, ...m };
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
