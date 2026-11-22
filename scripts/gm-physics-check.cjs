// [gentle-monster] 걷기 경로 점검: 에스컬레이터 2개, 계단 1→5층, 정문 진입. node scripts/gm-physics-check.cjs [port]
const { chromium } = require('playwright');
(async () => {
  const port = process.argv[2] || '5311';
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const p = await b.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${port}/?gm=1`); await p.waitForFunction(() => window.__gm?.ready, null, { timeout: 240000 });
  const r = await p.evaluate(() => {
    const G = window.__gm, P = G.physics, out = [];
    const run = (q, dx, dz, n) => { for (let i = 0; i < n; i++) P.tryMove(q, dx, dz); return `${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)}`; };
    let q = { x: -13, z: 10, y: 0.12 }; out.push('escA 1F→2F: ' + run(q, 0, -0.08, 200));
    q = { x: 13.5, z: -2.2, y: 5.0 }; out.push('escB 2F→3F: ' + run(q, 0, 0.08, 200));
    q = { x: 9.4, z: -4.4, y: 0.12 };
    // 각 목적지에 도달할 때까지 작은 스텝. 4층은 문이 없으므로 경사 상단(-5.1)에서 바로 다음 계단으로 돌아선다.
    const goZ = (zz) => { for (let i = 0; i < 400 && Math.abs(q.z - zz) > 0.03; i++) { const d = Math.max(-0.05, Math.min(0.05, zz - q.z)); if (!P.tryMove(q, 0, d)) break; } };
    const goX = (xx) => { for (let i = 0; i < 200 && Math.abs(q.x - xx) > 0.03; i++) { const d = Math.max(-0.05, Math.min(0.05, xx - q.x)); if (!P.tryMove(q, d, 0)) break; } };
    for (let f = 1; f <= 4; f++) { goX(9.4); goZ(-10.5); goX(11.7); goZ(-5.1); out.push(`stair ${f}F→${f + 1}F: ${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)}`); }
    q = { x: G.ext.door.x, z: 30, y: 0.03 }; out.push('enter front door: ' + run(q, 0, -0.08, 300));
    q = { x: 11.9, z: -4.6, y: 19.1 }; out.push('5F exit stair to floor: ' + run(q, 0, 0.08, 60));
    q = { x: 11.9, z: -4.6, y: 14.4 }; out.push('4F sealed (z should stay ≤ -4.25): ' + run(q, 0, 0.08, 60));
    return out.join('\n');
  });
  console.log(r); await b.close();
})();
