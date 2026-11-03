// [subway] feedback-12 · feedback-13: 승강장에서 계단으로 걸어 올라온 직후
//   (1) 계단 위에서 제자리 돌기·비비기·계단 옆 바닥 쪽으로 한두 걸음 → 다시 승강장으로 떨어지지 않음
//   (2) 역무실 옆 계단 앞 통로(점자블록)를 따라 오른쪽/왼쪽으로 걸어감 → 대합실 그대로, 통로가 넓음(벽이 점자블록 안쪽)
//   (3) 그 다음 계단 폭 안에서 계단으로 곧장 걸어 들어가면 여전히 승강장으로 내려감
//   실제 이동 입력(W 키 + 카메라 방향)만. 모든 역 × 두 계단.
//   BASE=http://127.0.0.1:4720/ [STATIONS=정자,수내|all] [OUT=/dir] node scripts/e2e-subway-stair-top.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { WELLS, OFFICE } from '../src/subway/layout.js';
const B = process.env.BASE || 'http://127.0.0.1:4720/';
const OUT = process.env.OUT || '';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const until = (fn, arg, t = 60000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });
async function boot() {
  await page.goto(B + '?enter=1&name=Tester&ws=mock&shot=1&lang=ko&subwayRt=0&bgm=0&noticePopup=0', { timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
}
async function enterStation(name) {
  await page.evaluate((nm) => { const st = __jj.subway.stations.find((s) => s.def.name === nm); __jj.teleport(st.x + 30, st.z + 30); }, name);
  await until((nm) => !!__jj.subway.stations.find((s) => s.def.name === nm)?.ent?.list?.length, name, 90000);
  await page.waitForTimeout(1500);
  await page.evaluate((nm) => {
    const e = __jj.subway.stations.find((s) => s.def.name === nm).ent.list[0];
    const s = Math.sin(e.ry), c = Math.cos(e.ry); __jj.teleport(e.x - s, e.z - c); __jj.player.rotation.y = e.ry; __jj.setMode('follow'); __jj.cam.yaw = e.ry + Math.PI; __jj.cam.pitch = 0.25; __jj.cam.dist = 7;
  }, name);
  await page.waitForTimeout(1200);
  await page.keyboard.down('KeyW');
  await until(() => __jj.subway.state.phase !== 'outside', null, 20000);
  await page.keyboard.up('KeyW');
  await until(() => __jj.subway.room === 'concourse' && !__jj.subway.swapping, null, 40000);
  await page.waitForTimeout(800);
}
const st = () => page.evaluate(() => { const s = __jj.subway, i = s.inside, p = i?.player?.position; return { room: s.room, swapping: s.swapping, x: +(p?.x ?? 0).toFixed(2), z: +(p?.z ?? 0).toFixed(2), armed: i?.wellArmed }; });
// 고정 카메라 방향으로 W 를 ms 만큼 (매 50ms 방 기록)
async function press(yaw, ms, track) {
  await page.evaluate((y) => { __jj.subway.inside.cam.yaw = y; }, yaw);
  await page.keyboard.down('KeyW');
  const t0 = Date.now();
  try { while (Date.now() - t0 < ms) { await page.waitForTimeout(50); const v = await st(); track.push(v); if (v.room !== 'concourse' || v.swapping) break; } } finally { await page.keyboard.up('KeyW'); }
  await page.waitForTimeout(120); track.push(await st());
}
// 목표점들로 걸어가기 (카메라를 매번 목표 쪽으로)
async function walkTo(pts, track, ms = 60000) {
  let k = 0; const t0 = Date.now();
  await page.keyboard.down('KeyW');
  try {
    while (Date.now() - t0 < ms && k < pts.length) {
      const v = await page.evaluate(([tx, tz]) => { const s = __jj.subway, i = s.inside, p = i?.player?.position; if (i && !s.swapping && i.kind === 'concourse') i.cam.yaw = Math.atan2(-(tx - p.x), -(tz - p.z)); return { room: s.room, swapping: s.swapping, x: +(p?.x ?? 0).toFixed(2), z: +(p?.z ?? 0).toFixed(2) }; }, pts[k]);
      track.push(v);
      if (v.room !== 'concourse' || v.swapping) break;
      if (Math.hypot(v.x - pts[k][0], v.z - pts[k][1]) < 0.5) k++;
      await page.waitForTimeout(80);
    }
  } finally { await page.keyboard.up('KeyW'); }
  return k >= pts.length;
}
const stayed = (track, msg) => { const bad = track.find((v) => v.room !== 'concourse' || v.swapping); assert.ok(!bad, `${msg}: 대합실을 벗어남 ${JSON.stringify(bad)}`); };
// 대합실 → (계단 걸어 내려감) → 승강장 → (나가는 곳 계단 걸어 올라옴) → 대합실 계단 위
async function upFromPlatform(w) {
  await page.evaluate(([x]) => { const i = __jj.subway.inside; i.player.position.set(x, 0, 1.2); }, [w.cx]);
  await page.waitForTimeout(200);
  const t = []; const ok = await walkTo([[w.cx, 6]], t, 20000);
  await until(() => __jj.subway.room === 'platform' && !__jj.subway.swapping, null, 40000);
  await page.waitForTimeout(500);
  await page.evaluate(() => { __jj.subway.inside.cam.yaw = 0; });
  await page.keyboard.down('KeyW');
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) { await page.waitForTimeout(100); const ok2 = await page.evaluate(() => { const s = __jj.subway; if (s.inside && !s.swapping && s.room === 'platform') s.inside.cam.yaw = 0; return s.room === 'concourse' && !s.swapping; }); if (ok2) break; }
  } finally { await page.keyboard.up('KeyW'); }
  await until(() => __jj.subway.room === 'concourse' && !__jj.subway.swapping, null, 40000);
  await page.waitForTimeout(400);
  return ok;
}

let names = (process.env.STATIONS || 'all').split(',');
const report = [];
await boot();
if (names[0] === 'all') names = await page.evaluate(() => __jj.subway.stations.map((s) => s.def.name));
let first = true;
for (const name of names) {
  if (!first) await boot();
  first = false;
  try { await enterStation(name); } catch (e) { report.push({ name, skipped: 'no entrance loaded' }); console.log('skip', name, e.message.split('\n')[0]); continue; }
  const slug = await page.evaluate((nm) => __jj.subway.stations.find((s) => s.def.name === nm).def.id, name);
  const row = { name };
  for (const w of WELLS) {
    const sg = Math.sign(w.cx);
    await upFromPlatform(w);
    const a = await st();
    assert.ok(Math.abs(a.x - w.cx) < 0.6 && Math.abs(a.z - 2.6) < 0.6, `${name} ${w.id}: 계단 위 스폰 ${JSON.stringify(a)}`);
    assert.equal(a.armed, false, `${name} ${w.id}: 올라온 직후엔 계단 트리거 꺼짐`);
    if (OUT && w.id === 'se') { await page.evaluate(() => { const c = __jj.subway.inside.cam; c.yaw = Math.PI; c.pitch = 0.45; c.dist = 4.5; }); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/stair-top-arrival-${slug}.png` }); }
    // (1) 제자리에서 돌고 비비기: 짧은 걸음들 — 계단 쪽 대각선(옆 바닥, 노란 선 쪽)·옆·뒤·살짝 남쪽까지
    const t1 = [];
    for (const y of [0.4, Math.PI - 0.5, -0.4, Math.PI + 0.5, Math.PI / 2, -Math.PI / 2, Math.PI - 0.9, 0, Math.PI + 0.9, Math.PI]) {
      await page.evaluate((yy) => { __jj.subway.inside.cam.yaw = yy; }, y); await page.waitForTimeout(80); // 제자리 돌기
      await press(y, 140, t1);
    }
    // 계단 옆 바닥(손잡이 바깥·노란 점자블록 쪽)으로 비스듬히 몇 걸음
    await press(Math.PI + sg * 0.8, 450, t1);
    await press(Math.PI - sg * 0.8, 450, t1);
    stayed(t1, `${name} ${w.id} 계단 위 비비기`);
    // (2) 계단 앞 통로를 따라 오른쪽(북쪽을 보고)·왼쪽으로 — 역무실 옆(넓어진 통로) 포함
    const t2 = [];
    const toGate = await walkTo([[w.cx - sg * 3.5, 2.4], [sg * (OFFICE.x1 - 1), OFFICE.z1 + 0.9], [sg * (OFFICE.x0 + 0.5), OFFICE.z1 + 0.6], [sg * 5.5, 2.0], [0, 1.8]], t2);
    stayed(t2, `${name} ${w.id} 통로 → 개찰구 쪽`); assert.ok(toGate, `${name} ${w.id}: 통로를 못 지나감 ${JSON.stringify(t2.at(-1))}`);
    if (OUT && w.id === 'se') {
      await page.evaluate(([x, z]) => { const i = __jj.subway.inside; i.player.position.set(x, 0, z); i.cam.yaw = Math.PI / 2 - 0.15; i.cam.pitch = 0.2; i.cam.dist = 4; }, [OFFICE.x1 + 1.5, 2.3]);
      await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/walkway-wider-${slug}.png` });
      await page.evaluate(() => { const i = __jj.subway.inside; i.player.position.set(0, 0, 1.8); });
    }
    const t3 = [];
    const toWall = await walkTo([[sg * 5.5, 2.4], [sg * 10, OFFICE.z1 + 0.5], [w.cx, 2.6], [sg * 27, 2.6]], t3);
    stayed(t3, `${name} ${w.id} 통로 → 벽 끝`); assert.ok(toWall, `${name} ${w.id}: 벽 끝까지 못 감 ${JSON.stringify(t3.at(-1))}`);
    // (3) 계단 폭 안에서 곧장 걸어 들어가면 내려감 (계단 쪽 줄, 에스컬레이터 아님)
    const lx = w.x0 + 1.4;
    const t4 = []; await walkTo([[lx, 2.0]], t4); stayed(t4, `${name} ${w.id} 계단 앞으로`);
    const t5 = []; await walkTo([[lx, 6]], t5, 15000);
    await until(() => __jj.subway.room === 'platform', null, 20000);
    await until(() => !__jj.subway.swapping, null, 40000);
    // 승강장 → 다시 대합실로 (다음 계단 검사용)
    await page.evaluate(() => { __jj.subway.inside.cam.yaw = 0; });
    await page.keyboard.down('KeyW');
    try { const t0 = Date.now(); while (Date.now() - t0 < 20000) { await page.waitForTimeout(100); if (await page.evaluate(() => { const s = __jj.subway; if (s.inside && !s.swapping && s.room === 'platform') s.inside.cam.yaw = 0; return s.room === 'concourse' && !s.swapping; })) break; } } finally { await page.keyboard.up('KeyW'); }
    await until(() => __jj.subway.room === 'concourse' && !__jj.subway.swapping, null, 40000);
    row[w.id] = { wiggle: t1.length, walk: t2.length + t3.length, down: true };
  }
  report.push(row); console.log('ok', JSON.stringify(row));
}
assert.deepEqual(errs, [], 'page errors');
assert.ok(report.some((r) => !r.skipped), 'no station tested');
console.log('e2e-subway-stair-top OK', JSON.stringify(report));
await browser.close();
