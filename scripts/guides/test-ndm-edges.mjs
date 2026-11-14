// [ndm-walk] 남대문시장 섬 경계 검사: 시장 섬 네 변(+ 명동 섬과 맞닿는 x=-11420) 곳곳에서 바깥쪽으로 KeyW 를 누른 채 달려도
//   섬 밖으로 나가지 않고(clampWorld), 땅 아래로 빠지지 않는지(player.y ≈ 땅 높이). node scripts/guides/test-ndm-edges.mjs <port>
import { chromium } from 'playwright';
const PORT = process.argv[2] || process.env.MYEONGDONG_WALK_PORT || '5231';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 500 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/?ws=mock&at=myeongdong&hour=14&shot=1&noticePopup=0&controlscard=0`);
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.myeongdong?.ready, null, { timeout: 300000 });
await page.mouse.click(400, 250);
// [x, z, 바깥 방향 dx, dz]
const M = { x0: -11528, z0: -21545, x1: -11420, z1: -21300 };
const cases = [];
for (const z of [-21330, -21400, -21470, -21530]) cases.push([M.x0 + 4, z, -1, 0]);
for (const x of [-11510, -11470, -11440]) { cases.push([x, M.z1 - 4, 0, 1]); cases.push([x, M.z0 + 4, 0, -1]); }
const res = [];
for (const [x, z, dx, dz] of cases) {
  const r0 = await page.evaluate(async ([x, z, dx, dz]) => {
    const J = window.__jj, md = J.myeongdong; let px = x, pz = z;
    for (let k = 0; k < 40 && J.world.isBlocked(px, pz); k++) { px -= dx * 0.6 + (k % 2 ? 0.7 : -0.7) * dz; pz -= dz * 0.6 + (k % 2 ? 0.7 : -0.7) * dx; }
    await J.teleport(px, pz, md.surfaceY(px, pz) ?? undefined); await new Promise((r) => setTimeout(r, 700));
    J.setMode?.('follow'); J.cam.yaw = Math.atan2(-dx, -dz); return { px, pz };
  }, [x, z, dx, dz]);
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
  let worst = null;
  for (let t = 0; t < 8; t++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(([dx, dz]) => { const J = window.__jj, p = J.player.position; J.cam.yaw = Math.atan2(-dx, -dz); const g = J.terrain.getGroundHeight(p.x, p.z, p.y + 1.5); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2), g: g == null ? null : +g.toFixed(2), inW: J.clampWorld ? (() => { const c = J.clampWorld(p.x, p.z, J.world.bounds); return Math.hypot(c.x - p.x, c.z - p.z) < 1e-6; })() : true }; }, [dx, dz]);
    if (!s.inW || s.g == null || Math.abs(s.y - s.g) > 0.6) worst = s;
    if (t === 7 && !worst) worst = { ...s, ok: true };
  }
  await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
  res.push({ at: [x, z], dir: [dx, dz], start: r0, ...worst });
}
await browser.close();
const bad = res.filter((q) => !q.ok);
for (const q of res) console.log(q.ok ? 'ok  ' : 'BAD ', JSON.stringify(q));
const fails = [];
if (bad.length) fails.push(`${bad.length}/${res.length} edge runs left the island or the ground`);
if (errors.length) fails.push('console errors: ' + errors.slice(0, 3).join(' | '));
if (fails.length) { console.error('test-ndm-edges FAIL:', fails.join('; ')); process.exit(1); }
console.log(`test-ndm-edges ok — ${res.length} runs into the 남대문시장 island edges: stayed inside, on the ground`);
