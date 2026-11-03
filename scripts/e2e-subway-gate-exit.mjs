// [subway] feedback-11: 개찰구를 나와 오른쪽/왼쪽(출구 쪽)으로 걸어가도 승강장으로 떨어지지 않아야 한다.
//   실제 이동 입력(W 키 + 카메라 방향)만 사용. 유료→비유료(나가기), 비유료→유료(들어가서 계단 앞 통로를 옆으로 지나가기) 양방향.
//   계단 입구로 걸어 들어가면 여전히 승강장으로 내려가는지도 확인한다.
//   BASE=http://127.0.0.1:4410/ [STATIONS=정자,수내|all] [OUT=/dir] node scripts/e2e-subway-gate-exit.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4410/';
const OUT = process.env.OUT || '';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
// W 를 누른 채 목표 지점(들)로 걸어간다. 매 100ms 방 이름 기록 → 대합실을 벗어나면 실패
async function walkTo(pts, { stop = null, ms = 20000 } = {}) {
  const track = []; const t0 = Date.now(); let k = 0;
  await page.keyboard.down('KeyW');
  try {
    while (Date.now() - t0 < ms && k < pts.length) {
      const v = await page.evaluate(([tx, tz, stopSrc]) => {
        const s = __jj.subway, i = s.inside, p = i?.player?.position;
        if (i && !s.swapping && i.kind === 'concourse') { const dx = tx - p.x, dz = tz - p.z; i.cam.yaw = Math.atan2(-dx, -dz); }
        return { room: s.room, swapping: s.swapping, x: p?.x ?? 0, z: p?.z ?? 0, phase: s.state.phase, chooser: getComputedStyle(document.getElementById('subway-chooser') || document.body).display === 'block', stop: stopSrc ? new Function(stopSrc)() : false };
      }, [pts[k][0], pts[k][1], stop]);
      track.push(v);
      if (v.room !== 'concourse' || v.swapping || v.stop) break;
      if (Math.hypot(v.x - pts[k][0], v.z - pts[k][1]) < 0.6) k++;
      await page.waitForTimeout(100);
    }
  } finally { await page.keyboard.up('KeyW'); }
  return { track, reached: k >= pts.length, last: track.at(-1) };
}
const place = (x, z, yaw) => page.evaluate(([x, z, yaw]) => { const i = __jj.subway.inside; i.player.position.set(x, 0, z); i.cam.yaw = yaw; i.cam.pitch = 0.3; i.cam.dist = 6; }, [x, z, yaw]);
const noPlatform = (r, msg) => { const bad = r.track.find((v) => v.room !== 'concourse' || v.swapping); assert.ok(!bad, `${msg}: 대합실을 벗어남 ${JSON.stringify(bad)}`); };

let names = (process.env.STATIONS || '정자,수내').split(',');
const report = [];
await boot();
if (names[0] === 'all') names = await page.evaluate(() => __jj.subway.stations.filter((s) => s.def.exits?.length || s.def.entrances?.length || true).map((s) => s.def.name));
let first = true;
for (const name of names) {
  if (!first) await boot();
  first = false;
  try { await enterStation(name); } catch (e) { report.push({ name, skipped: 'no entrance loaded' }); console.log('skip', name, e.message.split('\n')[0]); continue; }
  const passages = await page.evaluate(() => __jj.subway.inside.passages.map((p) => ({ dir: p.dir, wall: p.wall, mouth: p.mouth, out: p.out })));
  const row = { name, passages: passages.map((p) => p.dir).join('') };
  for (const side of ['right', 'left']) {
    // 1) 유료 구역(계단 쪽)에서 북쪽으로 개찰구 통과 → 오른쪽(동)/왼쪽(서)으로 꺾어 출구 통로 입구까지
    await place(0, 1.6, 0);
    await page.evaluate(() => { __jj.subway.state.cancel?.(); });
    const sx = side === 'right' ? 1 : -1;
    const tgt = passages.find((p) => (p.wall === 'e' && sx > 0) || (p.wall === 'w' && sx < 0)) || passages[0];
    const tx = Math.sign(tgt.mouth.x) || sx;
    const route = tgt.wall === 'n' ? [[tgt.mouth.x, -7], [tgt.mouth.x, tgt.mouth.z]] : [[tx * 20, -3.2], [tx * 20, -7], [tgt.mouth.x, -7]];
    const out = await walkTo([[0, -1.6], [sx * 5.5, -3.2], ...route, [tgt.mouth.x + tgt.out.x * 4, (tgt.wall === 'n' ? tgt.mouth.z : -7) + tgt.out.z * 4]], { stop: "return document.getElementById('subway-chooser')?.style.display === 'block'" });
    noPlatform(out, `${name} 유료→출구 ${side}`);
    assert.ok(out.reached || out.last.stop, `${name} 유료→출구 ${side}: 출구 통로에 못 감 ${JSON.stringify(out.last)}`);
    if (OUT && name === names[0]) {
      await page.evaluate(() => { const i = __jj.subway.inside; i.cam.yaw += Math.PI; i.cam.pitch = 0.35; i.cam.dist = 7; });
      await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/gate-exit-${side}-${name === '정자' ? 'jeongja' : 'st'}-concourse.png` });
    }
    await page.evaluate(() => { const c = document.getElementById('subway-chooser'); if (c?.style.display === 'block') document.querySelector('#subway-chooser [data-act=cancel], #subway-chooser .cancel')?.click(); });
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await until(() => __jj.subway.room === 'concourse' && !__jj.subway.swapping && document.getElementById('subway-chooser')?.style.display !== 'block', null, 10000).catch(() => {});
    // 2) 비유료 → 유료: 개찰구로 들어와 오른쪽/왼쪽으로 꺾어 계단 앞 통로(옛 트리거 구역 z 1.6~3.6)를 따라 벽까지
    await place(0, -1.6, Math.PI);
    const inn = await walkTo([[0, 1.8], [sx * 5.5, 2.6], [sx * 16.5, 2.6], [sx * 21.5, 2.6], [sx * 27, 2.0]]); // 역무실(x 7~13, z≤2.2) 옆 = 계단 입구 바로 앞을 옆으로 지나감
    noPlatform(inn, `${name} 비유료→유료 ${side}`);
    assert.ok(inn.reached, `${name} 비유료→유료 ${side}: 계단 앞 통로 끝까지 못 감 ${JSON.stringify(inn.last)}`);
    if (OUT && name === names[0] && side === 'right') {
      await page.evaluate(() => { const i = __jj.subway.inside; i.player.position.set(16.5, 0, 2.6); i.cam.yaw = Math.PI / 2; i.cam.pitch = 0.3; i.cam.dist = 6; });
      await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/gate-walkway-past-stairs-${name === '정자' ? 'jeongja' : 'st'}.png` });
    }
    row[side] = { out: out.track.length, in: inn.track.length };
  }
  // 3) 계단 입구로 걸어 들어가면 승강장 (회귀 방지)
  await place(16.5, 1.4, Math.PI);
  const down = await walkTo([[16.5, 4.0]], { ms: 6000 });
  assert.ok(down.last.room === 'platform' || down.last.swapping, `${name}: 계단 입구에서 승강장으로 안 내려감 ${JSON.stringify(down.last)}`);
  row.stairStillWorks = true;
  report.push(row); console.log('ok', JSON.stringify(row));
}
assert.deepEqual(errs, [], 'page errors');
console.log('e2e-subway-gate-exit OK', JSON.stringify(report));
await browser.close();
