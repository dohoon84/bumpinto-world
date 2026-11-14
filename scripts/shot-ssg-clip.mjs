// [ssg-facade] 신세계 크리스마스 미디어 파사드 밤 쇼 클립(헤드리스): 쇼 시계를 고정해 가며 프레임을 찍어 mp4 로 묶는다.
//   node scripts/shot-ssg-clip.mjs <port> [out.mp4] [step초=0.5] [fps=12]   — 실제 속도의 step×fps 배 (기본 6배) 타임랩스
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const PORT = process.argv[2] || '5231', OUTF = process.argv[3] || '/workspace/md-ssg-facade.mp4', STEP = +(process.argv[4] || 0.5), FPS = +(process.argv[5] || 12);
const DIR = '/tmp/ssg-clip'; rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/?ws=mock&at=myeongdong&hour=21&weather=clear&shot=1&noticePopup=0&controlscard=0`);
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.myeongdong?.ready, null, { timeout: 300000 });
await page.evaluate(async () => {
  const J = window.__jj, md = J.myeongdong; const px = -11257.5, pz = -21551;
  await J.corridor.preload(px, pz); J.teleport(px, pz, md.surfaceY(px, pz)); J.setMode('follow');
  Object.assign(J.cam, { dist: 5, pitch: 0.06, yaw: Math.atan2(-(-11257 - px), -(-21510 - pz)) });
  const st = document.createElement('style'); st.textContent = '*{visibility:hidden !important} canvas{visibility:visible !important}'; document.head.appendChild(st);
  await new Promise((r) => setTimeout(r, 25000));
});
const N = Math.round(78 / STEP);
for (let k = 0; k < N; k++) {
  await page.evaluate(async (t) => { const J = window.__jj; J.wake?.(); J.myeongdong.ssgShow.setClock(t); Object.assign(J.cam, { dist: 5, pitch: 0.06 }); const R = J.renderer, f0 = R.info.render.frame; const t0 = performance.now(); while (R.info.render.frame < f0 + 2 && performance.now() - t0 < 20000) await new Promise((r) => requestAnimationFrame(r)); }, k * STEP);
  await page.screenshot({ path: `${DIR}/${String(k).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 88 });
  if (k % 20 === 0) console.log('frame', k, '/', N);
}
await browser.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${DIR}/%04d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', OUTF]);
console.log('wrote', OUTF, N, 'frames', errors.length ? 'errors: ' + errors.slice(0, 3).join(' | ') : 'errors 0');
