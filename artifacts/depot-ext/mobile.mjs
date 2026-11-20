// [depot-ext] 모바일(844×390 가로 터치 — 세로는 회전 안내, ?mobile=1) 외관 스샷·측정
import { open, cam } from './lib.mjs';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const out = new URL('./', import.meta.url).pathname;
const { b, p, errs, bootMs } = await open('&at=depot&mobile=1', { w: 844, h: 390, mobile: true });
console.log('boot', bootMs);
await p.waitForFunction(() => window.__jj.depot?.exterior?.stats?.near, null, { timeout: 120000 });
const shot = async (n) => { await p.waitForTimeout(800); await p.screenshot({ path: out + n, timeout: 300000 }); console.log('shot', n); };
const metric = (label) => p.evaluate(async (label) => {
  const J = window.__jj, info = J.renderer.info, ext = J.depot.exterior;
  await new Promise((r) => requestAnimationFrame(r)); info.autoReset = false; info.reset();
  await new Promise((r) => requestAnimationFrame(() => r())); info.autoReset = true;
  const calls = info.render.calls, tris = info.render.triangles;
  let depot = 0, depotTris = 0; const tv = (o) => { if (o.isMesh && /^depot/.test(o.name) && (!o.isInstancedMesh || o.count > 0)) { depot++; const ix = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; depotTris += ix / 3 * (o.isInstancedMesh ? o.count : 1); } }; ext.root.traverseVisible(tv); ext.way.root.traverseVisible(tv);
  // 외관 update() CPU 비용 (200회 평균)
  const pos = J.player.position; let t = performance.now(); for (let i = 0; i < 200; i++) ext.update(0.016, pos); const updMs = (performance.now() - t) / 200;
  return { label, drawCalls: calls, tris, depotMeshes: depot, depotTris: Math.round(depotTris), updateMs: +updMs.toFixed(3), stats: ext.stats, arrows: ext.way.arrowCount, dpr: J.renderer.getPixelRatio() };
}, label);
const M = existsSync(out + 'metrics.json') ? JSON.parse(readFileSync(out + 'metrics.json', 'utf8')) : {};
M.mobile = [];
await cam(p, { tp: [-492, 462], cam: { yaw: Math.PI, pitch: 0.22, dist: 14 } }); await p.waitForTimeout(3000);
await shot('m-01-mobile-walkway.png'); M.mobile.push(await metric('mobile walkway → 입구'));
await cam(p, { tp: [-583.5, 400], cam: { yaw: Math.PI + 0.3, pitch: 0.18, dist: 11 } }); await p.waitForTimeout(3000);
await shot('m-02-mobile-daewang.png'); M.mobile.push(await metric('mobile 대왕판교로 보도'));
M.mobileErrors = errs; M.mobileBoot = bootMs;
writeFileSync(out + 'metrics.json', JSON.stringify(M, null, 1));
console.log(JSON.stringify(M.mobile, null, 1), 'errors', errs.length);
await b.close();
