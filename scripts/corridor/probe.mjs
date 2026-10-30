// 성능·스크린샷 프로브 (헤드리스 Chromium, SwiftShader).
// 같은 뷰를 develop 빌드와 브랜치 빌드에 돌려 draw call / 삼각형 / fps 를 비교한다.
//   node scripts/corridor/probe.mjs --url=http://localhost:4173/ --out=/tmp/shots --tag=branch [--views=a,b] [--q=extra&query]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const URL = arg('url', 'http://localhost:4173/');
const OUT = path.resolve(arg('out', 'probe-out'));
const TAG = arg('tag', 'run');
const EXTRA = arg('q', '');
const ONLY = arg('views', '');
const W = +arg('w', 960), H = +arg('h', 600);
fs.mkdirSync(OUT, { recursive: true });

// 뷰: 정자 내부(develop 과 픽셀 비교) + 코리더 지점. at = 역 id 로 이동(코리더 빌드에서만).
const VIEWS = [
  { name: 'jeongja-overview', mode: 'overview' },
  { name: 'jeongja-street', fn: 'sign', dx: 9, dz: 9, dist: 22, pitch: 0.38, yaw: 0.8 },
  { name: 'jeongja-street2', fn: 'sign', dx: -40, dz: 120, dist: 30, pitch: 0.42, yaw: 2.4 },
  { name: 'jeongja-seam', x: -12, z: -600, dist: 45, pitch: 0.55, yaw: 0.1 },
  { name: 'seohyeon', at: 'seohyeon', dist: 110, pitch: 0.75, yaw: 2.2 },
  { name: 'moran', at: 'moran', dist: 60, pitch: 0.45, yaw: 2.6 },
  { name: 'bokjeong', at: 'bokjeong', dist: 60, pitch: 0.45, yaw: 2.6 },
  { name: 'songpa', at: 'songpa', dist: 60, pitch: 0.45, yaw: 2.6 },
  { name: 'jamsil', at: 'jamsil', dist: 60, pitch: 0.45, yaw: 2.6 },
  { name: 'lotte', x: -712, z: -16212, dist: 24, pitch: -0.22, yaw: -1.9 }, // 잠실역 사거리에서 타워를 올려다봄
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  const st = { draws: 0, tris: 0, frames: 0 };
  window.__probe = st;
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const orig = C.prototype[fn];
      C.prototype[fn] = function (...a) { st.draws++; return orig.apply(this, a); };
    }
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { st.frames++; cb(t); });
});
const q = `?shot=1&npcs=0&taxis=0&police=0&trucks=0&bike=0&roadbike=0&evening=0${EXTRA ? '&' + EXTRA : ''}`;
await page.goto(URL + q);
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 180000 });
await page.waitForTimeout(4000);
const results = { tag: TAG, url: URL + q, views: {} };
for (const v of VIEWS) {
  if (ONLY && !ONLY.split(',').includes(v.name)) continue;
  const ok = await page.evaluate(async (v) => {
    const J = window.__jj;
    if (v.mode === 'overview') { J.setMode('overview'); return true; }
    J.setMode('follow');
    let x = v.x, z = v.z;
    if (v.fn === 'sign') { x = J.world.signPos.x + v.dx; z = J.world.signPos.z + v.dz; }
    if (v.at) {
      if (!J.corridor) return false;
      const p0 = J.corridor.placeOf(v.at); if (!p0) return false;
      const p = { x: p0.x + (v.ox || 0), z: p0.z + (v.oz || 0) };
      await J.corridor.preload(p.x, p.z);
      ({ x, z } = J.corridor.freeSpot(p.x, p.z));
    }
    J.teleport(x, z);
    Object.assign(J.cam, { dist: v.dist, pitch: v.pitch, yaw: v.yaw });
    return true;
  }, v);
  if (!ok) continue;
  await page.waitForTimeout(3500);
  const m = await page.evaluate(async () => {
    const st = window.__probe; st.draws = 0; st.frames = 0;
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 3000));
    const dt = (performance.now() - t0) / 1000;
    const info = window.__jj.renderer?.info?.render;
    const mem = window.__jj.renderer?.info?.memory;
    return { fps: +(st.frames / dt).toFixed(1), drawsPerFrame: Math.round(st.draws / Math.max(1, st.frames)), triangles: info?.triangles ?? null, geometries: mem?.geometries ?? null, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  });
  const file = path.join(OUT, `${TAG}-${v.name}.png`);
  await page.screenshot({ path: file });
  results.views[v.name] = { ...m, file };
  console.log(TAG, v.name, JSON.stringify(m));
}
results.errors = errors;
fs.writeFileSync(path.join(OUT, `${TAG}-probe.json`), JSON.stringify(results, null, 1));
if (errors.length) console.log('page errors:', errors.slice(0, 5));
await browser.close();
