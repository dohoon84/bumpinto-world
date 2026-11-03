// [subway] 열차에서 실제 이동 입력(W 키)으로 내리기 — 정자 → 수내 (수인분당선 왕십리 방면)
//   문이 열리면 문 자리가 비어 있어야 하고(창 아래 벽·문짝·스크린도어가 막지 않음), 걸어서 승강장으로 나와 몇 걸음 더 걸을 수 있어야 함
//   BASE=http://127.0.0.1:4410/ OUT=/workspace/bw-subway-shots node scripts/e2e-subway-alight.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4410/';
const OUT = process.env.OUT || '';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(B + '?enter=1&name=Tester&ws=mock&lang=ko&subwayRt=0&noticePopup=0&bgm=0&subwayVoice=0', { timeout: 120000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.getElementById('lobby-go')?.click());
await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
await page.waitForTimeout(1500);
const until = (fn, arg, t = 120000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });
const pos = () => page.evaluate(() => { const s = __jj.subway, p = s.inside?.player?.position; return { room: s.room, swapping: s.swapping, x: p?.x, z: p?.z, station: s.station?.name }; });
// 정자 대합실 → 승강장(왕십리 방면) → 열차 (탈 때도 걸어서)
await page.evaluate(() => { const e = __jj.subway.entrances.find((q) => q.exit.ref === '4'); const s = Math.sin(e.ry), c = Math.cos(e.ry); __jj.teleport(e.x - s, e.z - c); __jj.player.rotation.y = e.ry; __jj.setMode('follow'); __jj.cam.yaw = e.ry + Math.PI; });
await page.waitForTimeout(1200);
await page.keyboard.down('KeyW');
await until(() => __jj.subway.state.phase === 'inside' && __jj.subway.room === 'concourse' && !__jj.subway.swapping);
await page.keyboard.up('KeyW');
await page.evaluate(() => __jj.subway.toPlatform('suin', 1));
await until(() => __jj.subway.room === 'platform' && !__jj.subway.swapping);
await page.evaluate(() => __jj.subway.inside.callTrain(13));
await until(() => document.getElementById('subway-sub').innerText.includes('내리는'), null, 60000).catch(() => {});
await page.waitForTimeout(3500);
await page.evaluate(() => { const i = __jj.subway.inside, d = i.lay.doors.find((q) => q.label === '3-2'); i.player.position.set(d.x, 0, -0.4); i.player.rotation.y = 0; i.cam.yaw = Math.PI; });
await page.keyboard.down('KeyW');
await until(() => __jj.subway.room === 'train' && !__jj.subway.swapping, null, 60000);
await page.keyboard.up('KeyW');
// 열차: 수내까지 시간만 빨리 (내리기는 걷기로)
await page.waitForTimeout(800);
for (let k = 0; k < 200; k++) {
  const st = await page.evaluate(() => { const i = __jj.subway.inside; if (i.stage !== 'stop') i.skip(1); return { stage: i.stage, open: i.doorOpen, can: i.canAlight }; });
  if (st.stage === 'stop') break;
}
await until(() => __jj.subway.inside?.canAlight === true, null, 30000);
// 가장 가까운 문 앞(가운데 기둥 옆 0.35m), 문(왼쪽 = -z)을 바라봄: yaw 0 = -z 로 걷기, 카메라는 뒤에서
const at = await page.evaluate(() => { const i = __jj.subway.inside, p = i.player.position; const d = i.doors.reduce((b, x) => (Math.abs(x - p.x) < Math.abs(b - p.x) ? x : b), i.doors[0]); p.set(d + 0.35, 0, -0.2); i.player.rotation.y = 0; i.cam.yaw = 0; i.cam.pitch = 0.02; i.cam.dist = 0.9; return { d, hw: i.halfWidth, stop: i.stopIndex }; });
await page.waitForTimeout(900);
if (OUT) await page.screenshot({ path: `${OUT}/train-door-open-sunae.png` });
// 실제 W 로 걸어 나가기
const track = []; const t0 = Date.now();
await page.keyboard.down('KeyW');
while (Date.now() - t0 < 12000) {
  await page.waitForTimeout(100);
  const v = await pos(); track.push(v);
  if (v.room === 'platform' && !v.swapping) break;
}
await page.keyboard.up('KeyW');
const last = track.at(-1);
assert.equal(last.room, 'platform', `문으로 못 나감: ${JSON.stringify(track.slice(-5))}`);
const inTrain = track.filter((v) => v.room === 'train');
assert.ok(inTrain.some((v) => v.z < -at.hw), `문턱을 넘지 못함 (최소 z ${Math.min(...inTrain.map((v) => v.z))}, 차 반폭 ${at.hw})`);
for (let k = 1; k < inTrain.length; k++) assert.ok(inTrain[k].z <= inTrain[k - 1].z + 1e-3, '문에서 뒤로 밀림');
assert.equal(await page.evaluate(() => __jj.subway.station.name), '수내', '수내에서 내림');
// 승강장에서 몇 걸음 더 (스크린도어·문 쪽 막힘 없음)
await page.waitForTimeout(700);
const p0 = await pos();
await page.evaluate(() => { const i = __jj.subway.inside; i.cam.yaw = 0; });
await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
const p1 = await pos();
assert.ok(p0.z - p1.z > 1.5, `승강장으로 걸어 나가지 못함 ${JSON.stringify([p0, p1])}`);
if (OUT) { await page.evaluate(() => { const i = __jj.subway.inside; i.cam.yaw = Math.PI; i.cam.pitch = 0.15; i.cam.dist = 5; }); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/train-door-alighted-sunae.png` }); }
assert.deepEqual(errs, [], 'page errors');
console.log(JSON.stringify({ door: at, steps: inTrain.length, minZ: +Math.min(...inTrain.map((v) => v.z)).toFixed(2), platform: [p0, p1].map((p) => +p.z.toFixed(2)) }));
console.log('e2e-subway-alight OK');
await browser.close();
