// [depot-ext] 외관 스샷·측정: node artifacts/depot-ext/shots.mjs [day|night] [only,...]
import { open, cam } from './lib.mjs';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const mode = process.argv[2] || 'day', only = (process.argv[3] || '').split(',').filter(Boolean);
const out = new URL('./', import.meta.url).pathname;
const { b, p, errs, bootMs } = await open(`&at=depot${mode === 'night' ? '&hour=21' : ''}`, { w: 1200, h: 750 });
console.log('boot', bootMs);
const want = (n) => !only.length || only.includes(n);
const shot = async (n) => { await p.waitForTimeout(800); await p.screenshot({ path: out + n, timeout: 300000 }); console.log('shot', n); };
const metric = (label) => p.evaluate(async (label) => {
  const J = window.__jj, info = J.renderer.info;
  await new Promise((r) => requestAnimationFrame(r)); info.autoReset = false; info.reset();
  await new Promise((r) => requestAnimationFrame(() => r())); info.autoReset = true;
  let depotCalls = 0; const tv = (o) => { if (o.isMesh && /^depot/.test(o.name) && (!o.isInstancedMesh || o.count > 0)) depotCalls += Array.isArray(o.material) ? o.geometry.groups.length || o.material.length : 1; }; J.depot.exterior.root.traverseVisible(tv); J.depot.exterior.way.root.traverseVisible(tv);
  const ext = J.depot?.exterior;
  return { label, drawCalls: info.render.calls, tris: info.render.triangles, geos: info.memory.geometries, tex: info.memory.textures, depotMeshesVisible: depotCalls, near: ext?.stats, arrows: ext?.way?.arrowCount, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) };
}, label);
const M = existsSync(out + 'metrics.json') ? JSON.parse(readFileSync(out + 'metrics.json', 'utf8')) : {};
M[mode] = [];
await p.waitForFunction(() => window.__jj.depot?.exterior?.stats?.near, null, { timeout: 120000 });
M[mode].push(await metric('at door (near built)'));
const V = mode === 'night' ? 'n-' : '';
if (want('aerial')) { await cam(p, { tp: [-525, 455], cam: { yaw: Math.PI * 0.82, pitch: 0.95, dist: 150 } }); await p.waitForTimeout(3000); await shot(V + '01-aerial-lot.png'); M[mode].push(await metric('aerial')); }
if (want('approach')) { await cam(p, { tp: [-583.5, 405], cam: { yaw: Math.PI * 1.02 + 0.25, pitch: 0.12, dist: 9 } }); await p.waitForTimeout(3000); await shot(V + '02-approach-daewang.png'); }
if (want('canopy')) { await cam(p, { tp: [-492, 480], cam: { yaw: Math.PI, pitch: 0.08, dist: 8 } }); await p.waitForTimeout(3000); await shot(V + '03-entrance-canopy.png'); }
if (want('pylon')) { await cam(p, { tp: [-593, 398], cam: { yaw: Math.PI + 0.36, pitch: 0.0, dist: 8 } }); await p.waitForTimeout(3000); await shot(V + '04-pylon-sign.png'); }
if (want('pylon2')) { await cam(p, { tp: [-440, 340], cam: { yaw: Math.PI * 0.75, pitch: 0.05, dist: 10 } }); await p.waitForTimeout(3000); await shot(V + '04b-pylon-highway.png'); }
if (want('arrows')) { await cam(p, { tp: [-583, 381], cam: { yaw: Math.PI / 2 + 0.55, pitch: 0.62, dist: 11 } }); await p.waitForTimeout(3000); await shot(V + '06-ground-arrows.png'); }
if (want('walkway')) { await cam(p, { tp: [-492, 440], cam: { yaw: Math.PI, pitch: 0.25, dist: 8 } }); await p.waitForTimeout(3000); await shot(V + '06b-walkway-arrows.png'); }
if (want('dock')) { await cam(p, { tp: [-492, 662], cam: { yaw: 0.75, pitch: 0.32, dist: 34 } }); await p.waitForTimeout(3000); await shot(V + '07-loading-dock.png'); }
if (want('minimap')) { await cam(p, { tp: [-520, 430], cam: { yaw: Math.PI, pitch: 0.3, dist: 10 } }); await p.waitForTimeout(3000); await p.screenshot({ path: out + V + '05-minimap-marker.png', clip: { x: 760, y: 440, width: 440, height: 310 }, timeout: 300000 }); console.log('shot minimap'); }
if (want('station')) {
  await cam(p, { tp: [-6, 22], cam: { yaw: Math.PI - 0.5, pitch: 0.6, dist: 18 } }); await p.waitForTimeout(4000); await shot(V + '08-station-arrows.png');
  M[mode].push(await metric('at 정자역 (far)'));
  await cam(p, { tp: [-300, 160], cam: { yaw: Math.PI / 2, pitch: 0.2, dist: 9 } }); await p.waitForTimeout(3000);
  M[mode].push(await metric('300m east (far)'));
}
M[mode + 'Errors'] = errs; M[mode + 'Boot'] = bootMs;
writeFileSync(out + 'metrics.json', JSON.stringify(M, null, 1));
console.log(JSON.stringify(M[mode], null, 1), 'errors', errs.length);
await b.close();
