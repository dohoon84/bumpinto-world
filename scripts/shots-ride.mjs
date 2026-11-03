// [subway] 2단계: 승강장 → 열차 → 다음 역 → 대합실 흐름 스크린샷 + draw call (SwiftShader)
//   BASE=http://127.0.0.1:4410/ OUT=/workspace/bw-subway-shots node scripts/shots-ride.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4410/';
const OUT = process.env.OUT || '/workspace/bw-subway-shots';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [], report = { steps: [] };
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || /\[subway\]/.test(m.text())) errs.push(m.type() + ': ' + m.text().slice(0, 200)); });
await page.goto(B + '?enter=1&name=Tester&ws=mock&shot=1&lang=ko&subwayRt=0', { timeout: 120000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.getElementById('lobby-go')?.click());
await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
await page.waitForTimeout(1500);
const until = (fn, arg, t = 120000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });
const frames = (n = 4) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const calls = async () => { const v = []; for (let i = 0; i < 4; i++) { await frames(1); v.push(await page.evaluate(() => __jj.renderer.info.render.calls)); } return Math.round(v.reduce((a, b) => a + b, 0) / v.length); };
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const info = () => page.evaluate(() => { const s = __jj.subway, i = s.inside; return { room: s.room, zone: s.zone, station: s.station?.id ?? s.theme?.id ?? null, phase: s.state.phase, sub: document.getElementById('subway-sub')?.innerText || '', hint: document.getElementById('subway-hint')?.innerText || '', p: i ? [+i.player.position.x.toFixed(2), +i.player.position.z.toFixed(2)] : null, stage: i?.stage ?? null }; });
const step = async (k) => { const v = await info(); report.steps.push({ k, ...v }); console.log(k, JSON.stringify(v)); };
// 정자 4번 출구 앞에서 걸어 들어가기
await page.evaluate(() => { const e = __jj.subway.entrances.find((q) => q.exit.ref === '4'); const s = Math.sin(e.ry), c = Math.cos(e.ry); __jj.teleport(e.x - s, e.z - c); __jj.player.rotation.y = e.ry; __jj.setMode('follow'); __jj.cam.yaw = e.ry + Math.PI; __jj.cam.pitch = 0.25; __jj.cam.dist = 7; });
await page.waitForTimeout(1200);
await page.keyboard.down('KeyW');
await until(() => __jj.subway.state.phase !== 'outside');
await page.keyboard.up('KeyW');
await until(() => __jj.subway.state.phase === 'inside' && __jj.subway.room === 'concourse' && !__jj.subway.swapping);
await page.waitForTimeout(1200);
await step('concourse');
// 갈아타는 곳 표지 (정자 = 신분당) 보기
await page.evaluate(() => __jj.subway.inside.setView(0, 9.5, Math.PI, 0.15, 6)); await page.waitForTimeout(1500); await shot('platform-00-concourse-transfer-sign');
// 수인분당 왕십리 방면 승강장
await page.evaluate(() => __jj.subway.toPlatform('suin', 1));
await until(() => __jj.subway.room === 'platform' && !__jj.subway.swapping);
await page.waitForTimeout(1500);
await step('platform');
report.platformStats = await page.evaluate(() => ({ ...(__jj.subway.inside.stats?.() || {}), tex: __jj.renderer.info.memory.textures, geo: __jj.renderer.info.memory.geometries, tris: __jj.renderer.info.render.triangles, doors: __jj.subway.inside.lay.doors.length, cars: __jj.subway.inside.lay.cars }));
report.platformCallsEmpty = await calls();
const pv = (x, z, yaw, pitch, dist) => page.evaluate((a) => __jj.subway.inside.setView(...a), [x, z, yaw, pitch, dist]);
await pv(0, -2.6, -Math.PI / 2 - 0.5, 0.18, 6); await page.waitForTimeout(1200); await shot('platform-01-jeongja-suin-wangsimni');
await pv(-6, -2.2, Math.PI + 0.25, 0.12, 2.8); await page.waitForTimeout(1000); await shot('platform-02-screen-door-number');
await pv(-14, -2.5, 0.25, 0.15, 2.4); await page.waitForTimeout(1000); await shot('platform-03-name-board-backwall');
// 열차 호출 (테스트 훅): 13초 뒤 도착
await page.evaluate(() => __jj.subway.inside.callTrain(13));
await pv(-30, -1.6, -Math.PI / 2 - 0.35, 0.12, 7);
await page.waitForTimeout(9500); await shot('train-01-arriving'); await step('arriving');
await page.waitForTimeout(6500); await shot('platform-04-doors-open'); await step('doors-open');
report.platformCallsTrain = await calls();
// 3-2 문으로 타기
const d = await page.evaluate(() => { const i = __jj.subway.inside, d = i.lay.doors.find((q) => q.label === '3-2'); i.player.position.set(d.x, 0, -0.4); i.player.rotation.y = 0; i.cam.yaw = Math.PI; return d; });
report.boardDoor = d;
await page.keyboard.down('KeyW');
await until(() => __jj.subway.room === 'train' && !__jj.subway.swapping, null, 30000).catch(() => {});
await page.keyboard.up('KeyW');
await page.waitForTimeout(1200);
await step('train-board');
const tv = (x, z, yaw, pitch, dist) => page.evaluate((a) => __jj.subway.inside.setView(...a), [x, z, yaw, pitch, dist]);
await tv(8.9, 0, Math.PI / 2, 0.15, 1.0); await page.waitForTimeout(1200); await shot('train-02-interior');
await tv(-8.9, 0, -Math.PI / 2, 0.15, 1.0); await page.waitForTimeout(800); await shot('train-02b-interior-other-way');
report.trainCallsStation = await calls();
report.trainStats = await page.evaluate(() => ({ ...(__jj.subway.inside.stats?.() || {}), tex: __jj.renderer.info.memory.textures, geo: __jj.renderer.info.memory.geometries, tris: __jj.renderer.info.render.triangles }));
await page.evaluate(() => __jj.subway.inside.skip(40));
await page.waitForTimeout(1500); await step('train-run');
await tv(4.7, 0.95, 0.0, 0.02, 0.9); await page.waitForTimeout(800); await shot('train-03-tunnel-window');
report.trainCallsTunnel = await calls();
await page.evaluate(() => __jj.subway.inside.toggleSit()); await page.evaluate(() => { const i = __jj.subway.inside; i.cam.pitch = 0.15; i.cam.dist = 2.2; }); await page.waitForTimeout(600); await shot('train-04-led-sit');
// 다음 역(수내)까지
await page.evaluate(() => { const i = __jj.subway.inside; for (let k = 0; k < 200 && i.stage !== 'stop'; k++) i.skip(1); i.skip(3); });
await page.waitForTimeout(1500); await step('train-stop');
await page.evaluate(() => { const i = __jj.subway.inside; if (i.sitting) i.toggleSit(); }); await tv(4.7, 0.95, 0.0, 0.02, 0.9); await page.waitForTimeout(800); await shot('train-05-arrived-sunae');
// 왼쪽(-z) 문으로 내리기
await page.evaluate(() => { const i = __jj.subway.inside; i.player.position.set(2.35, 0, -1.2); i.player.rotation.y = Math.PI; i.cam.yaw = 0; });
await page.keyboard.down('KeyW');
await until(() => __jj.subway.room === 'platform' && !__jj.subway.swapping, null, 30000).catch(() => {});
await page.keyboard.up('KeyW');
await page.waitForTimeout(1500); await step('alighted');
await pv(10, -2.6, -Math.PI / 2 - 0.5, 0.18, 6); await page.waitForTimeout(1000); await shot('platform-05-sunae-alighted');
// 계단 → 대합실 → 출구
await page.evaluate(() => { const i = __jj.subway.inside; i.player.position.set(0, 0, -3.6); i.player.rotation.y = Math.PI; i.cam.yaw = 0; });
await page.keyboard.down('KeyW');
await until(() => __jj.subway.room === 'concourse' && !__jj.subway.swapping, null, 30000).catch(() => {});
await page.keyboard.up('KeyW');
await page.waitForTimeout(1500); await step('concourse-2');
await shot('platform-06-sunae-concourse-up');
report.errors = errs;
fs.writeFileSync(`${OUT}/ride-report.json`, JSON.stringify(report, null, 2));
await browser.close();
