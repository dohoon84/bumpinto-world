import { open, cam } from './lib.mjs';
const out = new URL('./', import.meta.url).pathname;
const { b, p, errs } = await open('', { w: 1200, h: 750 });
await cam(p, { tp: [-14, 30], cam: { yaw: 0.3, pitch: 0.3, dist: 9 } }); await p.waitForTimeout(3000);
console.log(await p.evaluate(() => { const w = window.__jj.depot.exterior.way; const pts = []; w.root.traverse((o) => { if (o.isInstancedMesh) pts.push([o.name, o.count, o.visible]); }); return { n: w.arrowCount, pts, near: window.__jj.depot.exterior.stats.near }; }));
await cam(p, { tp: [-14, 30], cam: { yaw: 0.0, pitch: 1.2, dist: 40 } }); await p.waitForTimeout(3000);
await p.screenshot({ path: out + 'probe-st.png', timeout: 300000 });
console.log('errs', errs.length, errs.slice(0, 3)); await b.close();
