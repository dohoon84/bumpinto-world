// 남대문 골목 실제 키 입력(KeyW 누름) 재현: 칼국수 길 위 남은 거리 REM m 지점에서 길 방향으로 걷기
import { chromium } from 'playwright';
const [PORT = '5231', W = '1280', H = '800', REM = '177', SHOT = ''] = process.argv.slice(2);
const MOBILE = +W < 900;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: +W, height: +H }, isMobile: MOBILE, hasTouch: MOBILE })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/?ws=mock&at=myeongdong&hour=16&shot=1&noticePopup=0&controlscard=0${MOBILE ? '&mobile=1' : ''}`);
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.myeongdong?.ready, null, { timeout: 300000 });
const st = await page.evaluate(async ([REM, OLD]) => {
  const J = window.__jj, md = J.myeongdong, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (OLD) { const B = J.world.bounds; B.islands = B.islands.filter((b) => b.x0 !== -11528); } // 고치기 전 경계 재현
  const gx = -11364, gz = -21463.9; await J.teleport(gx, gz, md.surfaceY(gx, gz)); await wait(1500);
  for (let i = 0; i < 80 && !J.placeGuide; i++) await wait(250);
  const G = J.placeGuide; G.startRoute('kalguksu'); await wait(1200);
  const P = G.route.pathTo(G.ui.guide.spots, G.ui.guide.spots.findIndex((s) => s.id === 'kalguksu'), gx, gz);
  let tot = 0; for (let i = 1; i < P.length; i++) tot += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const at = Math.max(0, tot - REM); let acc = 0, x = gx, z = gz, hx = 0, hz = 1;
  for (let i = 1; i < P.length; i++) { const L = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (acc + L >= at) { const f = (at - acc) / L; x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f; z = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f; hx = (P[i][0] - P[i - 1][0]) / L; hz = (P[i][1] - P[i - 1][1]) / L; break; } acc += L; }
  await J.teleport(x, z, md.surfaceY(x, z)); await wait(2500);
  J.setMode?.('follow'); const yaw = Math.atan2(-hx, -hz); Object.assign(J.cam, { yaw, pitch: 0.35, dist: 9 });
  G.startRoute('kalguksu'); await wait(1500);
  return { tot: +tot.toFixed(1), x, z, hx, hz, yaw, path: P.map((q) => q.map((v) => +v.toFixed(1))) };
}, [+REM, !!process.env.OLD]);
console.log('start', JSON.stringify({ ...st, path: undefined }), 'path', JSON.stringify(st.path.slice(0, 8)));
if (SHOT) await page.screenshot({ path: SHOT.replace('.png', '-0.png') });
await page.mouse.click(+W / 2, +H / 2); await page.waitForTimeout(300);
await page.evaluate((yaw) => { Object.assign(window.__jj.cam, { yaw }); }, st.yaw);
await page.keyboard.down('KeyW');
const log = [];
for (let t = 0; t < 24; t++) {
  await page.waitForTimeout(500);
  if (SHOT && t === +(process.env.SHOTAT || -1)) await page.screenshot({ path: SHOT.replace('.png', '-mid.png') });
  log.push(await page.evaluate((yaw) => {
    const J = window.__jj, p = J.player.position, md = J.myeongdong, W = J.world, T = J.terrain; J.cam.yaw = yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), ax = p.x + fx * 0.15, az = p.z + fz * 0.15;
    return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2), wb: W.isBlocked(ax, az), by: md.blockedBy(ax, az), bike: J.bikes?.blocks?.(ax, az, null, p.y), cm: T.canMove(p.x, p.z, p.y, ax, az), stuck: W.isBlocked(p.x, p.z), joined: !!J.player.visible };
  }, st.yaw));
}
await page.keyboard.up('KeyW');
if (SHOT) await page.screenshot({ path: SHOT });
await browser.close();
for (const l of log) console.log(JSON.stringify(l));
const moved = Math.hypot(log[log.length - 1].x - st.x, log[log.length - 1].z - st.z);
console.log('moved', moved.toFixed(1), 'm in 12 s', 'errors', errors.length, errors.slice(0, 2));
