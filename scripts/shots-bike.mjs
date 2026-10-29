// [bike] Admin Cruiser 스크린샷. 사용: npx vite --port 5179 & node scripts/shots-bike.mjs   (env: URL, ONLY=name,..)
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:5179/';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
page.on('console', (m) => m.type() === 'error' && errs.push('[console] ' + m.text()));
await page.goto(URL + '?region=starbase&shot=1&taxis=0&terrain=0&npcs=0&show=0&launch=0&trucks=0' + (process.env.Q || ''));
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const ev = (f, a) => page.evaluate(f, a);
console.log(JSON.stringify(await ev(() => { const b = window.__jj.bike.bike, p = window.__jj.player.position; const box = new window.__jj.bike.mesh.constructor().constructor; void box;
  return { x: +b.x.toFixed(1), z: +b.z.toFixed(1), h: +b.h.toFixed(2), spawn: [p.x, p.z] }; })));
// 카메라 헬퍼: 바이크 기준 (side: 0=왼쪽 측면, π=오른쪽), 바라보는 높이 lookY
await ev(() => { const css = document.createElement('style'); css.id = 'hideui'; css.textContent = '#bike-prompt,#trk-prompt,.tag{display:none!important}'; document.head.appendChild(css);
  window.__side = (side, dist, pitch, lookY = 0.55, fwd = 0) => { const j = window.__jj, b = j.bike.bike, s = Math.sin(b.h), c = Math.cos(b.h);
    j.player.visible = false; j.player.position.set(b.x + s * fwd, lookY - 1.6, b.z + c * fwd); j.cam.yaw = Math.atan2(c, -s) + side; j.cam.pitch = pitch; j.cam.dist = dist; }; });
// zoom: 화면 중앙을 잘라 확대 (deviceScaleFactor 2 라 해상도 유지)
const run = async (name, fn, zoom = 1, wait = 900, dy = 40) => { if (ONLY && !ONLY.includes(name)) return; await fn(); await page.waitForTimeout(wait);
  const w = 1280 / zoom, h = 720 / zoom; await page.screenshot({ path: `shot-bike-${name}.png`, scale: zoom > 1 ? 'device' : 'css', clip: { x: (1280 - w) / 2, y: Math.min(720 - h, (720 - h) / 2 + (zoom > 1 ? dy : 0)), width: w, height: h } }); console.log('shot', name); };

await run('parked', () => ev(() => window.__side(0, 4, 0.02, 0.55)), 2);
await run('parked34', () => ev(() => window.__side(-0.75, 4.2, 0.18, 0.6)), 1.6);
await run('rightside', () => ev(() => window.__side(Math.PI, 4, 0.04, 0.55)), 2);
// 아바타와 크기 비교 (바이크 왼쪽 옆에 서 있음)
await run('scale', () => ev(() => { const j = window.__jj, b = j.bike.bike, s = Math.sin(b.h), c = Math.cos(b.h);
  j.player.visible = true; j.player.position.set(b.x + 0.8 * c + 0.2 * s, 0, b.z - 0.8 * s + 0.2 * c); j.player.rotation.y = b.h + Math.PI / 2;
  j.cam.yaw = Math.atan2(c, -s) + 0.25; j.cam.pitch = 0.05; j.cam.dist = 5.2; }), 1.3);
// 탑승 프롬프트
await run('prompt', () => ev(() => { const j = window.__jj, b = j.bike.bike, s = Math.sin(b.h), c = Math.cos(b.h); document.getElementById('hideui').textContent = '.tag{display:none!important}';
  j.player.visible = true; j.player.position.set(b.x + 1.3 * c + 0.2 * s, 0, b.z - 1.3 * s + 0.2 * c); j.player.rotation.y = b.h - Math.PI / 2;
  j.cam.yaw = Math.atan2(c, -s) + 0.55; j.cam.pitch = 0.35; j.cam.dist = 6.5; }));
// 탑승 → 주행 (앞이 트인 방향으로 돌려 세움)
if (!ONLY || ONLY.some((n) => ['rideside', 'riding', 'lean', 'smoke', 'exited'].includes(n))) {
  await ev(() => { const j = window.__jj, b = j.bike.bike; const clear = (h) => { for (let d = 3; d < 80; d += 2) { if (j.world.isBlocked(b.x + Math.sin(h) * d, b.z + Math.cos(h) * d, 0.8)) return d; } return 80; };
    if (clear(b.h + Math.PI) > clear(b.h)) b.h += Math.PI; j.bike.mount(); });
  // 공회전 연기
  await page.waitForTimeout(2200);
  await run('rideside', () => ev(() => { const j = window.__jj, b = j.bike.bike, s = Math.sin(b.h), c = Math.cos(b.h); j.bike.holdCam(30); j.cam.yaw = Math.atan2(c, -s) + 0.12; j.cam.pitch = 0.02; j.cam.dist = 5.5; }), 1.6, 600);
  await run('smoke', () => ev(() => { const j = window.__jj, b = j.bike.bike; j.bike.holdCam(30); j.cam.yaw = b.h + Math.PI + 0.75; j.cam.pitch = 0.05; j.cam.dist = 4.4; }), 1.6, 6000, 400);
  await ev(() => window.__jj.bike.holdCam(0));
  await ev(() => { window.__jj.cam.dist = 6.8; window.__jj.cam.pitch = 0.17; });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(3200);
  await run('riding', async () => { console.log('riding', JSON.stringify(await ev(() => { const b = window.__jj.bike.bike; return { kmh: +(b.v * 3.6).toFixed(1), lean: +b.lean.toFixed(2) }; }))); }, 1, 10);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(2200);
  await run('lean', async () => { console.log('lean', JSON.stringify(await ev(() => { const b = window.__jj.bike.bike; return { kmh: +(b.v * 3.6).toFixed(1), leanDeg: +(b.lean * 57.3).toFixed(1), steerDeg: +(b.steer * 57.3).toFixed(1) }; }))); }, 1, 10);
  await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS'); await page.waitForTimeout(2500); await page.keyboard.up('KeyS'); await page.waitForTimeout(1200);
  await page.keyboard.press('KeyF'); await page.waitForTimeout(300);
  await run('exited', () => ev(() => { const j = window.__jj, b = j.bike.bike; j.cam.yaw = b.h + Math.PI / 2 + 0.6; j.cam.pitch = 0.25; j.cam.dist = 6; }));
}
console.log(errs.length ? errs.join('\n') : 'no console errors');
await browser.close();
