// [v4b] 왕관 클로즈업: 별도 카메라로 직접 렌더(앞을 가리는 건물 없이). node scripts/shot-crown.mjs PORT OUTDIR TAG [W H]
//   env DIST(수평 거리 m, 기본 110) EL(카메라 높이 = 왕관 높이 + EL, 기본 -6) FOV(기본 16) YAWS(쉼표, 기본 hq-ref 방향 0)
import { chromium } from 'playwright';
import fs from 'node:fs';
const [PORT = '5311', OUT = '/tmp/crown', TAG = 'cur', W = '1280', H = '800'] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: +W, height: +H } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/?ws=mock&at=seongsu&hour=14&weather=clear&shot=1&noticePopup=0&controlscard=0&bgm=0&subwayVoice=0&subwayRt=0`, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.seongsu?.ready, null, { timeout: 300000 });
await page.waitForTimeout(6000);
const opt = { dist: +(process.env.DIST || 110), el: +(process.env.EL || -6), fov: +(process.env.FOV || 16), cy: +(process.env.CY || 53.5), yaws: (process.env.YAWS || '0').split(',').map(Number) };
const shots = await page.evaluate(async (o) => {
  const J = window.__jj; let sc = J.player; while (sc.parent) sc = sc.parent;
  const hq = sc.getObjectByName('haus-nowhere'); const Box = J.camera.position.constructor; const V = (x, y, z) => new Box(x, y, z);
  // 사옥 중심·높이: gm-pframe 월드 bbox (8 꼭짓점 변환)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y1 = -1e9; hq.updateMatrixWorld(true);
  const g = hq.getObjectByName('gm-pframe'); g.geometry.computeBoundingBox(); const b = g.geometry.boundingBox;
  for (const X of [b.min.x, b.max.x]) for (const Y of [b.min.y, b.max.y]) for (const Z of [b.min.z, b.max.z]) { const p = V(X, Y, Z).applyMatrix4(g.matrixWorld); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); y1 = Math.max(y1, p.y); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = o.cy; // 왕관 상자 중간 높이 (v4b 기준 53.5 m)
  // hq-ref 방향 (overview yaw 0.6 에서의 카메라 방향) 그대로
  J.player.visible = false; J.setMode('overview'); Object.assign(J.ov, { dist: 105, pitch: 0.1, yaw: 0.6 }); J.teleport(cx, cz, 0.1); await new Promise((r) => setTimeout(r, 3000));
  const base = Math.atan2(J.camera.position.x - cx, J.camera.position.z - cz);
  const cam = J.camera.clone(); cam.fov = o.fov; cam.aspect = innerWidth / innerHeight; cam.near = 1; cam.far = 4000; cam.updateProjectionMatrix();
  const R = J.renderer, out = [];
  for (const dy of o.yaws) {
    const a = base + dy; cam.position.copy(V(cx + Math.sin(a) * o.dist, cy + o.el, cz + Math.cos(a) * o.dist)); cam.lookAt(cx, cy, cz);
    await new Promise((r) => requestAnimationFrame(r)); R.render(sc, cam);
    out.push({ dy, url: R.domElement.toDataURL('image/png'), cam: cam.position.toArray().map((v) => +v.toFixed(1)) });
  }
  return { center: [cx, cy, cz], top: y1, base, out };
}, opt);
for (const s of shots.out) fs.writeFileSync(`${OUT}/crown-${TAG}-${W}x${H}-y${s.dy}.png`, Buffer.from(s.url.split(',')[1], 'base64'));
console.log(JSON.stringify({ center: shots.center, top: shots.top, base: shots.base, cams: shots.out.map((s) => [s.dy, s.cam]) }), 'errors', errors);
await browser.close();
