// [subway] 한 역의 지상 출입구 · 대합실 · 승강장(두 방면) 스크린샷 (새 역 추가 확인용)
//   BASE=http://127.0.0.1:4720/ OUT=/workspace/bw-subway-shots STATION=장지 node scripts/shots-subway-station.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4720/';
const OUT = process.env.OUT || '/workspace/bw-subway-shots';
const NAME = process.env.STATION || '장지';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const until = (fn, arg, t = 90000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });
await page.goto(B + '?enter=1&name=Tester&ws=mock&shot=1&lang=ko&subwayRt=0&bgm=0&noticePopup=0', { timeout: 120000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.getElementById('lobby-go')?.click());
await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate((nm) => { const st = __jj.subway.stations.find((s) => s.def.name === nm); __jj.teleport(st.x + 30, st.z + 30); }, NAME);
await until((nm) => !!__jj.subway.stations.find((s) => s.def.name === nm)?.ent?.list?.length, NAME);
await page.waitForTimeout(3000);
const slug = await page.evaluate((nm) => __jj.subway.stations.find((s) => s.def.name === nm).def.id, NAME);
const ents = await page.evaluate((nm) => __jj.subway.stations.find((s) => s.def.name === nm).ent.list.map((e) => ({ ref: e.exit?.ref, x: +e.x.toFixed(1), z: +e.z.toFixed(1), ry: +e.ry.toFixed(2) })), NAME);
console.log('entrances', JSON.stringify(ents));
// 출입구: 바깥에서 입구를 마주 보게 (입구 앞 DIST m, 기본 5 · 카메라는 그 뒤)
for (const [k, e] of ents.entries()) {
  await page.evaluate((e) => { const s = Math.sin(e.ry), c = Math.cos(e.ry); __jj.teleport(e.x - s * e.D, e.z - c * e.D); __jj.player.rotation.y = e.ry; __jj.setMode("follow"); __jj.cam.yaw = e.ry + Math.PI; __jj.cam.pitch = 0.3; __jj.cam.dist = 8; __jj.cam.yaw = e.ry + Math.PI + (e.D > 6 ? 0.35 : 0); }, { ...e, D: +(process.env.DIST || 5) });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/station-${slug}-entrance-${e.ref ?? k}.png` });
}
// 걸어 들어가기 → 대합실
const e0 = ents[0];
await page.evaluate((e) => { const s = Math.sin(e.ry), c = Math.cos(e.ry); __jj.teleport(e.x - s, e.z - c); __jj.player.rotation.y = e.ry; __jj.cam.yaw = e.ry + Math.PI; __jj.cam.pitch = 0.25; __jj.cam.dist = 7; }, e0);
await page.waitForTimeout(1200);
await page.keyboard.down('KeyW');
await until(() => __jj.subway.state.phase !== 'outside', null, 20000);
await page.keyboard.up('KeyW');
await until(() => __jj.subway.room === 'concourse' && !__jj.subway.swapping);
assert.equal(await page.evaluate(() => __jj.subway.station?.name), NAME);
await page.evaluate(() => { const i = __jj.subway.inside; i.player.position.set(0, 0, -3); i.cam.yaw = 0; i.cam.pitch = 0.3; i.cam.dist = 7; });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/station-${slug}-concourse.png` });
await page.evaluate(() => { const i = __jj.subway.inside; i.player.position.set(0, 0, 1.8); i.cam.yaw = Math.PI; i.cam.pitch = 0.3; i.cam.dist = 7; });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/station-${slug}-concourse-paid.png` });
const zone = await page.evaluate(() => __jj.subway.zone ?? __jj.subway.inside?.zone ?? null);
// 승강장 두 방면
const line = await page.evaluate((nm) => __jj.subway.stations.find((s) => s.def.name === nm).def.lines[0], NAME);
const plats = [];
for (const dir of [0, 1]) {
  await page.evaluate(([l, d]) => __jj.subway.toPlatform(l, d), [line, dir]);
  await until(() => __jj.subway.room === 'platform' && !__jj.subway.swapping);
  await page.waitForTimeout(1500);
  await page.evaluate(() => __jj.subway.inside.setView(-6, -2.4, -Math.PI / 2 - 0.4, 0.15, 6));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/station-${slug}-platform-${line}-${dir}.png` });
  plats.push(await page.evaluate(() => ({ zone: __jj.subway.inside?.zone, rides: __jj.subway.inside?.rides?.slice(0, 2).map((q) => q.name) })));
}
console.log(JSON.stringify({ slug, zone, plats }));
assert.deepEqual(errs, [], 'page errors');
console.log('shots-subway-station OK', NAME);
await browser.close();
