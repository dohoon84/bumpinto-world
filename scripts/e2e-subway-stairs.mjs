// [subway] 승강장 ↔ 대합실 계단을 실제 이동 입력(W 키)으로 오가기 — 정자·수내, 양방향 승강장
//   (toPlatform/skip 훅 없이: 대합실에서 계단 우물 쪽으로 걸어 내려가고, 승강장에서 '나가는 곳' 계단으로 걸어 올라감)
//   BASE=http://127.0.0.1:4410/ node scripts/e2e-subway-stairs.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4410/';
const SHOTS = process.env.OUT || '';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
async function boot() {
  await page.goto(B + '?enter=1&name=Tester&ws=mock&shot=1&lang=ko&subwayRt=0&bgm=0', { timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
}
const until = (fn, arg, t = 60000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });
const settled = (room) => until((r) => __jj.subway.room === r && !__jj.subway.swapping, room, 40000);
const info = () => page.evaluate(() => { const s = __jj.subway, i = s.inside, p = i?.player?.position; return { room: s.room, line: i?.line, dir: i?.dir, p: p ? [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] : null }; });
// W 를 누른 채 조건이 될 때까지 (매 100ms 기록: 최고 높이·멈춤 여부)
async function walk(yaw, doneFn, arg, ms = 15000, midShot = '') {
  await page.evaluate((y) => { const i = __jj.subway.inside; i.cam.yaw = y; }, yaw);
  const track = []; const t0 = Date.now();
  await page.keyboard.down('KeyW');
  let ok = false;
  while (Date.now() - t0 < ms) {
    await page.waitForTimeout(100);
    const v = await page.evaluate(({ y, arg, src }) => { const s = __jj.subway; if (s.inside && !s.swapping) s.inside.cam.yaw = y; const p = s.inside?.player?.position; return { done: new Function('arg', src)(arg), room: s.room, swapping: s.swapping, y: p?.y ?? 0, z: p?.z ?? 0, x: p?.x ?? 0 }; }, { y: yaw, arg, src: `return (${doneFn.toString()})(arg)` });
    track.push(v);
    if (midShot && v.room === 'platform' && v.y > 0.45) { await page.screenshot({ path: midShot }); midShot = ''; }
    if (v.done) { ok = true; break; }
  }
  await page.keyboard.up('KeyW');
  return { ok, track };
}
const report = [];
async function enterStation(name) {
  await page.evaluate((nm) => { const st = __jj.subway.stations.find((s) => s.def.name === nm); __jj.teleport(st.x + 30, st.z + 30); }, name);
  await until((nm) => !!__jj.subway.stations.find((s) => s.def.name === nm)?.ent?.list?.length, name, 60000);
  await page.waitForTimeout(1500);
  const ok = await page.evaluate((nm) => {
    const st = __jj.subway.stations.find((s) => s.def.name === nm);
    const list = st.ent?.list || []; const e = list[0]; if (!e) return false;
    const s = Math.sin(e.ry), c = Math.cos(e.ry); __jj.teleport(e.x - s, e.z - c); __jj.player.rotation.y = e.ry; __jj.setMode('follow'); __jj.cam.yaw = e.ry + Math.PI; __jj.cam.pitch = 0.25; __jj.cam.dist = 7; return true;
  }, name);
  assert.ok(ok, `${name} 출입구 없음`);
  await page.waitForTimeout(1200);
  await page.keyboard.down('KeyW');
  await until(() => __jj.subway.state.phase !== 'outside', null, 20000);
  await page.keyboard.up('KeyW');
  await settled('concourse');
  await page.waitForTimeout(800);
}
for (const name of ['정자', '수내']) {
  await boot();
  await enterStation(name);
  for (const dir of [0, 1]) {
    // 대합실: 계단 우물 위 2m 앞(대합실 바닥)에 세우고 +z(우물 쪽)로 걸어 내려가기
    await page.evaluate((d) => { const i = __jj.subway.inside; i.player.position.set(d ? 16.5 : -16.5, 0, 1.2); }, dir);
    await page.waitForTimeout(300);
    const down = await walk(Math.PI, () => __jj.subway.room === 'platform' && !__jj.subway.swapping, null);
    assert.ok(down.ok, `${name} dir${dir}: 대합실 → 승강장 못 감 ${JSON.stringify(await info())} ${JSON.stringify(down.track.slice(0, 5))}`);
    await page.waitForTimeout(600);
    const onPlat = await info();
    assert.equal(onPlat.dir, dir, `${name}: 내려간 승강장 방면`);
    // 승강장: 플랫폼으로 3m 걸어 나왔다가(입구 틈 확인) 돌아서 '나가는 곳' 계단으로 걸어 올라가기
    const outW = await walk(Math.PI, (z) => __jj.subway.inside.player.position.z > z, onPlat.p[2] + 3, 4000);
    assert.ok(outW.ok, `${name} dir${dir}: 계단 아래에서 승강장으로 못 나옴`);
    const tag = `${name === '정자' ? 'jeongja' : 'sunae'}-${dir}`;
    if (SHOTS) { await page.evaluate(() => { const c = __jj.subway.inside.cam; c.yaw = 0; c.pitch = 0.12; c.dist = 5; }); await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/stairs-${tag}-wayout-opening.png` }); }
    const up = await walk(0, () => __jj.subway.room === 'concourse' && !__jj.subway.swapping, null, 15000, SHOTS ? `${SHOTS}/stairs-${tag}-climbing.png` : '');
    const maxY = Math.max(...up.track.filter((v) => v.room === 'platform').map((v) => v.y));
    const stairSteps = up.track.filter((v) => v.room === 'platform' && v.z < -5);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/stairs-${name === '정자' ? 'jeongja' : 'sunae'}-${dir}-back-in-concourse.png` });
    assert.ok(up.ok, `${name} dir${dir}: 승강장 → 대합실 못 감 (최고 y ${maxY}, 마지막 ${JSON.stringify(up.track.at(-1))})`);
    assert.ok(maxY > 0.4, `${name} dir${dir}: 계단을 오르지 않음 (y ${maxY})`);
    // 계단에서 z 가 계속 줄어듦 (끼임 없음)
    for (let k = 1; k < stairSteps.length; k++) if (!stairSteps[k].swapping) assert.ok(stairSteps[k].z <= stairSteps[k - 1].z + 1e-3, `${name} dir${dir}: 계단에서 뒤로 밀림`);
    await page.waitForTimeout(800);
    report.push({ name, dir, down: down.track.length, up: up.track.length, maxY: +maxY.toFixed(2), back: await info() });
    console.log('ok', name, dir, JSON.stringify(report.at(-1)));
  }
}
assert.deepEqual(errs, [], 'page errors');
console.log('e2e-subway-stairs OK', report.length);
await browser.close();
