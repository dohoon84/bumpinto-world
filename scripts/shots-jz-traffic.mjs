// [jz-traffic] 정자역 사거리 일반 차량 스크린샷 + draw call·프레임 시간 (SwiftShader, 헤드리스)
//   npx vite preview --port 4810 --strictPort &  BASE=http://127.0.0.1:4810/ OUT=/workspace/bw-jz-traffic-shots node scripts/shots-jz-traffic.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4810/';
const OUT = process.env.OUT || '/workspace/bw-jz-traffic-shots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = {};
const VIEWS = [
  ['wide', [-20, 20], 2.9, 0.55, 46],
  ['close', [-14, 30], 2.5, 0.22, 13],
];
for (const [name, q] of [['off-15h', 'jzcars=0&hour=15'], ['day-15h', 'hour=15'], ['lunch-12h', 'hour=12']].filter(([n]) => !process.env.ONLY || process.env.ONLY.split(',').includes(n))) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (/ERROR: |program not valid/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await page.goto(B + '?enter=1&name=Tester&ws=mock&shot=1&lang=ko&subwayRt=0&' + q, { timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
  const r = (report[name] = { errs });
  for (const [v, [x, z], yaw, pitch, dist] of VIEWS) {
    await page.evaluate((a) => { const [x, z, yaw, pitch, dist] = a; __jj.teleport(x, z); __jj.setMode('follow'); __jj.cam.yaw = yaw; __jj.cam.pitch = pitch; __jj.cam.dist = dist; }, [x, z, yaw, pitch, dist]);
    await page.waitForTimeout(v === 'wide' ? 9000 : 3000);
    // 2.5초 동안 프레임 시간·draw call 평균
    const m = await page.evaluate(() => new Promise((res) => { const ts = [], calls = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; calls.push(__jj.renderer.info.render.calls); if (n - t0 < 2500) requestAnimationFrame(f); else res({ ms: ts.slice(2).reduce((a, b) => a + b, 0) / Math.max(1, ts.length - 2), calls: Math.round(calls.reduce((a, b) => a + b, 0) / calls.length), tris: __jj.renderer.info.render.triangles, jz: __jj.jzTraffic?.stats?.() || null }); }; requestAnimationFrame(f); }));
    r[v] = m;
    await page.screenshot({ path: `${OUT}/jz-${name}-${v}.png` });
  }
  if (name === 'lunch-12h') { // 종류별 근접 사진: 차를 잠시 세우고(정차 상태) 옆에서 찍음
    for (const kind of ['moto', 'scooter', 'kei', 'hatch', 'sedan', 'suv', 'van', 'ev', 'porter', 'parcel', 'cvs']) {
      const ok = await page.evaluate((kind) => {
        const s = __jj.jzTraffic.sim, f = s.focus || { x: 0, z: 0 };
        let t = s.list.filter((u) => u && !u.parked && u.kind === kind && !u.rec.off).sort((a, b) => Math.hypot(a.rec.x - f.x, a.rec.z - f.z) - Math.hypot(b.rec.x - f.x, b.rec.z - f.z))[0];
        if (!t) return false;
        t.stop = { s: t.s, curb: t.lat, dwell: 1e9 }; t.state = 'pickup'; t.wait = 1e9; t.v = 0;
        const h = Math.atan2(t.rec.hx, t.rec.hz), side = h + Math.PI / 2 + 0.5, d = t.moto ? 4 : 6.5;
        __jj.teleport(t.rec.x + Math.sin(side) * d, t.rec.z + Math.cos(side) * d); __jj.setMode('follow');
        __jj.cam.yaw = side; __jj.cam.pitch = 0.18; __jj.cam.dist = t.moto ? 2.5 : 3.5; __jj.player.visible = false; return true;
      }, kind);
      if (!ok) continue;
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${OUT}/model-${kind}.png`, clip: { x: 140, y: 120, width: 1000, height: 560 } });
    }
  }
  await page.close();
}
fs.writeFileSync(`${OUT}/report${process.env.ONLY ? '-' + process.env.ONLY : ''}.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
await browser.close();
