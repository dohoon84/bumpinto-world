// [subway] 헤드리스 스크린샷 + draw call 측정 (SwiftShader)
//   npm run build && npx vite preview --port 4380 --strictPort --host 127.0.0.1
//   BASE=http://127.0.0.1:4380/ OUT=/workspace/bw-subway-shots node scripts/shots-subway.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4380/';
const OUT = process.env.OUT || '/workspace/bw-subway-shots';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = {};
const errs = [];

async function open(qs) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /\[subway\]/.test(m.text())) errs.push(m.type() + ': ' + m.text().slice(0, 160)); });
  await page.goto(B + '?enter=1&name=Tester&ws=mock&shot=1&lang=ko' + qs, { timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  return page;
}
const frames = (page, n = 4) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const calls = async (page) => { const v = []; for (let i = 0; i < 4; i++) { await frames(page, 1); v.push(await page.evaluate(() => __jj.renderer.info.render.calls)); } return Math.round(v.reduce((a, b) => a + b, 0) / v.length); };
// 출입구 정면: 계단 앞 d m, 카메라는 그 뒤
const front = (page, ref, d = 3.2, pitch = 0.22, dist = 9, yawOff = 0.35) => page.evaluate(({ ref, d, pitch, dist, yawOff }) => {
  const e = __jj.subway.entrances.find((q) => q.exit.ref === ref);
  const s = Math.sin(e.ry), c = Math.cos(e.ry);
  __jj.teleport(e.x - s * d, e.z - c * d);
  __jj.player.rotation.y = e.ry;
  __jj.setMode('follow'); __jj.cam.yaw = e.ry + Math.PI + yawOff; __jj.cam.pitch = pitch; __jj.cam.dist = dist;
}, { ref, d, pitch, dist, yawOff });
const POSE_OUT = async (page) => { await front(page, '4', 3.2, 0.3, 14, 0.5); };
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const until = (page, fn, arg, t = 120000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });
const want = (k) => !ONLY || ONLY.has(k);

// 1) 바깥 draw call: 끈 상태(?subway=0) vs 켠 상태, 같은 자리·같은 카메라 (4번 출구 앞, 정자역 광장 쪽)
if (want('calls')) {
  const p0 = await open('&subway=0');
  await p0.evaluate(() => { __jj.teleport(-49.9 + 3.2, 11.5); __jj.setMode('follow'); __jj.cam.yaw = Math.PI / 2 + Math.PI + 0.5; __jj.cam.pitch = 0.3; __jj.cam.dist = 14; });
  await p0.waitForTimeout(3000);
  report.outdoorOff = await calls(p0);
  report.subwayOff = await p0.evaluate(() => ({ subway: __jj.subway ?? null, entrances: document.querySelectorAll('.subway-exit').length, stencil: __jj.renderer.getContext().getContextAttributes().stencil }));
  await p0.close();
}
const page = await open('');
report.entrances = await page.evaluate(() => __jj.subway.entrances.map((e) => ({ ref: e.exit.ref, osm: e.exit.osm, lat: e.exit.lat, lon: e.exit.lon, x: e.exit.x, z: e.exit.z, placed: [+e.x.toFixed(1), +e.z.toFixed(1)], ry: +e.ry.toFixed(2), shift: +e.shift.toFixed(1), dir: e.exit.dir.ko, hints: e.exit.hints })));
if (want('calls')) {
  await page.evaluate(() => { const e = __jj.subway.entrances.find((q) => q.exit.ref === '4'); __jj.teleport(-49.9 + 3.2, 11.5); __jj.setMode('follow'); __jj.cam.yaw = Math.PI / 2 + Math.PI + 0.5; __jj.cam.pitch = 0.3; __jj.cam.dist = 14; });
  await page.waitForTimeout(3000);
  report.outdoorOn = await calls(page);
}
// 2) 낮 출입구
if (want('day')) {
  await front(page, '4', 4, 0.26, 10, -0.55); await page.waitForTimeout(2500); await shot(page, '01-entrance-exit4-day');
  await front(page, '6', 4.5, 0.32, 12, -0.6); await page.waitForTimeout(2500); await shot(page, '02-entrance-exit6-day');
  await front(page, '1', 2.6, 0.55, 7, 0.0); await page.waitForTimeout(2500); await shot(page, '03-entrance-exit1-stairs');
}
// 3) 들어가기 (걸어 들어감 → 페이드)
await front(page, '4', 1.0, 0.25, 7, 0.0);
await page.waitForTimeout(1200);
await page.keyboard.down('KeyW');
await until(page, () => __jj.subway.state.phase !== 'outside');
await page.keyboard.up('KeyW');
report.enteredBy = await page.evaluate(() => ({ phase: __jj.subway.state.phase, entry: __jj.subway.state.entry }));
await until(page, () => __jj.subway.state.fadeAlpha() > 0.45 || __jj.subway.state.interior);
await shot(page, '04-transition-fade');
await until(page, () => __jj.subway.state.phase === 'inside' && __jj.subway.inside);
await page.waitForTimeout(1500);
await shot(page, '05-concourse-arrive-exit4');
report.concourse = await calls(page);
report.concourseStats = await page.evaluate(() => ({ ...__jj.subway.inside.stats(), tex: __jj.renderer.info.memory.textures, geo: __jj.renderer.info.memory.geometries, tris: __jj.renderer.info.render.triangles }));
const view = (x, z, yaw, pitch, dist, wait = 2500) => page.evaluate((a) => __jj.subway.inside.setView(...a), [x, z, yaw, pitch, dist]).then(() => page.waitForTimeout(wait));
// 상가 (편의점·분식) — 남쪽에서 북쪽 보기
await view(-17, -3.5, 0.15, 0.12, 6); await shot(page, '06-concourse-shops');
// 화장실·보관함·역무실
await view(7.5, -7, 0.25, 0.12, 3.8); await shot(page, '07-concourse-toilet-office');
// 개찰구: 대합실(유료 아님) 쪽에서 남쪽 보기 + 카드 찍기 (내가 통로로 걸어감)
await view(0, -3.2, Math.PI, 0.22, 5.5, 800);
await page.keyboard.down('KeyW');
await until(page, () => __jj.subway.inside.lanes[3].open > 0.7 && __jj.subway.inside.player.position.z > -0.6, null, 60000);
await page.keyboard.up('KeyW');
await shot(page, '08-concourse-gate-tap');
await page.waitForTimeout(1200);
report.afterGate = await page.evaluate(() => ({ z: +__jj.subway.inside.player.position.z.toFixed(2), toast: document.getElementById('subway-toast').textContent }));
await view(-1.5, -6, Math.PI + 0.25, 0.3, 7); await shot(page, '09-concourse-gates-wide');
// 에스컬레이터·계단 + NPC (북쪽 위에서 남쪽 아래로)
await view(-16.5, 1.6, Math.PI + 0.2, 0.75, 6, 4000); await shot(page, '10-escalator-suwon-npcs');
await view(16.5, 1.4, Math.PI - 0.15, 0.5, 7, 3000); await shot(page, '11-escalator-wangsimni-npcs');
// 승강장 쪽은 '준비 중'
await view(16.5, 2.3, Math.PI, 0.2, 3, 2500); await shot(page, '12-platform-coming-soon');
report.wellToast = await page.evaluate(() => document.getElementById('subway-toast').textContent);
// 출구 통로·안내 (동쪽 통로 앞)
await view(23, -3, -1.19, 0.15, 6); await shot(page, '13-exit-passage-east');
// 출구 고르기 (기본 강조 = 들어온 4번)
await view(-27.5, -6, Math.PI / 2, 0.2, 5, 800);
await page.keyboard.down('KeyW');
await until(page, () => __jj.subway.state.phase === 'choosing', null, 60000);
await page.keyboard.up('KeyW');
await page.waitForTimeout(600);
report.chooserDefault = await page.evaluate(() => ({ pick: __jj.subway.exits[__jj.subway.state.pick].ref, items: [...document.querySelectorAll('#subway-chooser li')].map((li) => li.innerText.replace(/\s+/g, ' ')) }));
await shot(page, '14-exit-chooser');
// 6번 고르기 (숫자키)
await page.keyboard.press('Digit6');
await until(page, () => __jj.subway.state.phase === 'outside');
await page.waitForTimeout(2500);
report.exitedAt = await page.evaluate(() => { const p = __jj.player.position, e = __jj.subway.entrances.find((q) => q.exit.ref === '6'); return { target: __jj.subway.state.target, player: [+p.x.toFixed(1), +p.z.toFixed(1)], exit6: [+e.x.toFixed(1), +e.z.toFixed(1)], inSubwayClass: document.body.classList.contains('in-subway') }; });
await shot(page, '15-exit6-back-outside');
report.outdoorAfterExit = await calls(page);
report.memAfterExit = await page.evaluate(() => ({ tex: __jj.renderer.info.memory.textures, geo: __jj.renderer.info.memory.geometries }));
await page.close();
// 4) 밤
if (want('night')) {
  const pn = await open('&hour=21');
  await front(pn, '4', 4, 0.26, 10, -0.55); await pn.waitForTimeout(3000); await shot(pn, '16-entrance-exit4-night');
  await front(pn, '6', 4.5, 0.32, 12, -0.6); await pn.waitForTimeout(2500); await shot(pn, '17-entrance-exit6-night');
  await pn.close();
}
report.errors = errs;
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
