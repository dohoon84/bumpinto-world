// [subway×camera] 지하(대합실·승강장·열차)에서 폰 카메라로 찍으면 지금 보이는 방이 찍히고(바깥 거리 아님),
//   사진 장소가 '정자역 대합실' · '정자역 · 수인분당선 승강장' · '수인분당선 열차 · …' 로 저장되는지 (IndexedDB 까지)
//   BASE=http://127.0.0.1:4410/ OUT=/workspace/bw-subway-shots node scripts/e2e-subway-camera.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4410/';
const OUT = process.env.OUT || '/workspace/bw-subway-shots';
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
const report = { shots: [] };

// 사진 한 장: 뷰파인더 열기 → Space → 확인 화면의 사진을 화면(같은 틀 영역)과 비교 → 저장(IndexedDB) → 닫기
async function snap(tag) {
  await page.evaluate(() => __jj.cameraApp.load().then((a) => a.openViewfinder()));
  await until(() => !!document.querySelector('.cam-root .cam-frame'));
  await page.waitForTimeout(700);
  const fr = await page.evaluate(() => { const r = document.querySelector('.cam-frame').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  const screen = (await page.screenshot({ clip: fr })).toString('base64'); // 셔터 직전 화면(틀 안)
  await page.keyboard.press('Space');
  await until(() => { const b = document.querySelector('.cam-review'); return b && !b.hidden && b.querySelector('.cr-photo img')?.complete; }, null, 20000);
  await page.waitForTimeout(400);
  const cmp = await page.evaluate(async (scr) => {
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const small = (img) => { const c = document.createElement('canvas'); c.width = 32; c.height = 24; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 32, 24); return g.getImageData(0, 0, 32, 24).data; };
    const photo = small(await load(document.querySelector('.cam-review .cr-photo img').src));
    const s = small(await load('data:image/png;base64,' + scr));
    let d = 0; for (let k = 0; k < photo.length; k += 4) d += Math.abs(photo[k] - s[k]) + Math.abs(photo[k + 1] - s[k + 1]) + Math.abs(photo[k + 2] - s[k + 2]);
    return { diff: d / (32 * 24 * 3), photo: Array.from(photo) };
  }, screen);
  await page.screenshot({ path: `${OUT}/camera-${tag}-captured.png` });
  await page.click('.cam-review [data-r="save"]');
  await until(() => !!document.querySelector('.cam-review [data-r="save"][disabled]'), null, 15000);
  const rec = await page.evaluate(() => new Promise((ok, no) => { const q = indexedDB.open('bumpinto.photos'); q.onerror = no; q.onsuccess = () => { const db = q.result; const r = db.transaction('photos').objectStore('photos').getAll(); r.onsuccess = () => { const all = r.result.sort((a, b) => b.takenAt - a.takenAt); db.close(); const p = all[0]; ok(p && { regionName: p.regionName, regionEnName: p.regionEnName, n: all.length, blob: !!p.blob }); }; }; }));
  await page.click('.cam-review [data-r="done"]').catch(() => {});
  await page.evaluate(() => __jj.cameraApp.close());
  await page.waitForTimeout(500);
  const out = { tag, room: await page.evaluate(() => __jj.subway.room), diff: +cmp.diff.toFixed(1), rec, photo: cmp.photo };
  report.shots.push(out);
  return out;
}
const pdiff = (a, b) => { let d = 0; for (let k = 0; k < a.length; k += 4) d += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]); return d / (a.length / 4 * 3); };

// 1) 바깥(정자역 4번 출구 앞)
await page.evaluate(() => { const e = __jj.subway.entrances.find((q) => q.exit.ref === '4'); const s = Math.sin(e.ry), c = Math.cos(e.ry); __jj.teleport(e.x - s * 3, e.z - c * 3); __jj.player.rotation.y = e.ry; __jj.setMode('follow'); __jj.cam.yaw = e.ry + Math.PI; });
await page.waitForTimeout(2000);
const outdoor = await snap('outdoor');
assert.ok(/^정자동/.test(outdoor.rec.regionName), `바깥 사진 장소 ${outdoor.rec.regionName}`);
// 2) 대합실 (걸어 들어가기)
await page.evaluate(() => { const e = __jj.subway.entrances.find((q) => q.exit.ref === '4'); const s = Math.sin(e.ry), c = Math.cos(e.ry); __jj.teleport(e.x - s, e.z - c); __jj.cam.yaw = e.ry + Math.PI; });
await page.waitForTimeout(800);
await page.keyboard.down('KeyW');
await until(() => __jj.subway.state.phase === 'inside' && __jj.subway.room === 'concourse' && !__jj.subway.swapping);
await page.keyboard.up('KeyW');
await page.waitForTimeout(1500);
const conc = await snap('concourse');
// 3) 승강장 (수인분당선 왕십리 방면)
await page.evaluate(() => __jj.subway.toPlatform('suin', 1));
await until(() => __jj.subway.room === 'platform' && !__jj.subway.swapping);
await page.evaluate(() => __jj.subway.inside.setView(-6, -2.4, -Math.PI / 2 - 0.4, 0.15, 6));
await page.waitForTimeout(1500);
const plat = await snap('platform');
// 4) 열차 (열차 불러서 3-2 문으로 타기)
await page.evaluate(() => __jj.subway.inside.callTrain(13));
await until(() => __jj.subway.inside?.stage == null && document.getElementById('subway-sub').innerText.includes('내리는'), null, 60000).catch(() => {});
await page.waitForTimeout(3500);
await page.evaluate(() => { const i = __jj.subway.inside, d = i.lay.doors.find((q) => q.label === '3-2'); i.player.position.set(d.x, 0, -0.4); i.player.rotation.y = 0; i.cam.yaw = Math.PI; });
await page.keyboard.down('KeyW');
await until(() => __jj.subway.room === 'train' && !__jj.subway.swapping, null, 60000);
await page.keyboard.up('KeyW');
await page.waitForTimeout(1200);
await page.evaluate(() => { const i = __jj.subway.inside; i.cam.pitch = 0.12; i.cam.dist = 2.2; i.cam.yaw = Math.PI / 2; });
await page.waitForTimeout(800);
const train = await snap('train');
// EN 장소 (같은 열차 안)
const en = await page.evaluate(() => __jj.subway.place(true));

for (const s of [conc, plat, train]) {
  assert.ok(s.diff < 30, `${s.tag}: 사진이 화면(뷰파인더)과 다름 diff ${s.diff}`);
  const vsOut = pdiff(s.photo, outdoor.photo);
  s.vsOutdoor = +vsOut.toFixed(1);
  assert.ok(vsOut > s.diff * 1.5, `${s.tag}: 사진이 바깥 거리와 더 비슷함 (screen ${s.diff} / outdoor ${vsOut.toFixed(1)})`);
  assert.ok(s.rec?.blob, `${s.tag}: IndexedDB 저장`);
}
assert.equal(conc.rec.regionName, '정자역 대합실'); assert.equal(conc.rec.regionEnName, 'Jeongja Stn. concourse');
assert.equal(plat.rec.regionName, '정자역 · 수인분당선 승강장'); assert.equal(plat.rec.regionEnName, 'Jeongja Stn. · Suin-Bundang platform');
assert.equal(train.rec.regionName, '수인분당선 열차 · 왕십리 방면'); assert.equal(train.rec.regionEnName, 'Suin-Bundang train · for Wangsimni');
assert.equal(en, 'Suin-Bundang train · for Wangsimni');
for (const s of report.shots) assert.ok(s.rec.regionName.length <= 40 && s.rec.regionEnName.length <= 40, '사진 서버 40자');
assert.deepEqual(errs, [], 'page errors');
for (const s of report.shots) delete s.photo;
fs.writeFileSync(`${OUT}/camera-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.shots));
console.log('e2e-subway-camera OK');
await browser.close();
