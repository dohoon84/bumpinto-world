// [subway] 열차에서 실제 이동 입력(W 키)으로 내리기 — 정자 → 수내 (수인분당선 왕십리 방면)
//   문이 열리면 문 자리가 비어 있어야 하고(창 아래 벽·문짝·스크린도어가 막지 않음), 걸어서 승강장으로 나와 몇 걸음 더 걸을 수 있어야 함
//   BASE=http://127.0.0.1:4410/ OUT=/workspace/bw-subway-shots [STOPS=all] node scripts/e2e-subway-alight.mjs
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
// [feedback-10] STOPS=all 이면 (+ 복정에서 8호선 잠실 방면으로 잠실까지, 다시 모란 방면으로 장지까지 — 장지 정차·안내 확인)
//   정자에서 가천대 방면으로 한 역씩: 내려서 → 같은 승강장에서 다음 열차를 타고 → 다음 역에서 또 내림 (모든 역 왼쪽 문)
const ALL = process.env.STOPS === 'all';
const SLUG = { 수내: 'sunae', 서현: 'seohyeon', 이매: 'imae', 야탑: 'yatap', 모란: 'moran', 태평: 'taepyeong', 가천대: 'gachon', 복정: 'bokjeong', 장지: 'jangji', 문정: 'munjeong', 가락시장: 'garak', 송파: 'songpa', 석촌: 'seokchon', 잠실: 'jamsil' };
const results = [];
async function rideAndAlight() {
  // 열차: 다음 내릴 수 있는 역까지 시간만 빨리 (내리기는 걷기로)
  await page.waitForTimeout(800);
  for (let k = 0; k < 200; k++) {
    const st = await page.evaluate(() => { const i = __jj.subway.inside; if (i.stage !== 'stop' || !i.segs[i.stopIndex]?.game) i.skip(1); return { stage: i.stage, open: i.doorOpen, can: i.canAlight }; });
    if (st.stage === 'stop' && (await page.evaluate(() => !!__jj.subway.inside.segs[__jj.subway.inside.stopIndex]?.game))) break;
  }
  await until(() => __jj.subway.inside?.canAlight === true, null, 30000);
  // 가장 가까운 문 앞(가운데 기둥 옆 0.35m), 문(왼쪽 = -z)을 바라봄: yaw 0 = -z 로 걷기, 카메라는 뒤에서
  const want = await page.evaluate(() => { const i = __jj.subway.inside; return i.segs[i.stopIndex].name; });
  const at = await page.evaluate(() => { const i = __jj.subway.inside, p = i.player.position; const d = i.doors.reduce((b, x) => (Math.abs(x - p.x) < Math.abs(b - p.x) ? x : b), i.doors[0]); p.set(d + 0.35, 0, -0.2); i.player.rotation.y = 0; i.cam.yaw = 0; i.cam.pitch = 0.02; i.cam.dist = 0.9; return { d, hw: i.halfWidth, stop: i.stopIndex }; });
  await page.waitForTimeout(900);
  if (OUT) await page.screenshot({ path: `${OUT}/train-door-open-${SLUG[want] || want}.png` });
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
  assert.equal(await page.evaluate(() => __jj.subway.station.name), want, `${want}에서 내림`);
  // 승강장에서 몇 걸음 더 (스크린도어·문 쪽 막힘 없음)
  await page.waitForTimeout(700);
  await until(() => __jj.subway.room === 'platform' && !__jj.subway.swapping);
  const p0 = await pos();
  await page.evaluate(() => { const i = __jj.subway.inside; i.cam.yaw = 0; });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  const p1 = await pos();
  assert.ok(p0.z - p1.z > 1.5, `승강장으로 걸어 나가지 못함 ${JSON.stringify([p0, p1])}`);
  if (OUT) { await page.evaluate(() => { const i = __jj.subway.inside; i.cam.yaw = Math.PI; i.cam.pitch = 0.15; i.cam.dist = 5; }); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/train-door-alighted-${SLUG[want] || want}.png` }); }
  const r = { station: want, door: at, steps: inTrain.length, minZ: +Math.min(...inTrain.map((v) => v.z)).toFixed(2), platform: [p0, p1].map((p) => +p.z.toFixed(2)) };
  results.push(r); console.log(JSON.stringify(r));
  return want;
}
let got = await rideAndAlight();
if (!ALL) assert.equal(got, '수내', '정자 다음 역 수내');
// 다음 역들: 내린 승강장(같은 방면)에서 다음 열차를 불러 걸어서 타고, 다음 역에서 또 걸어서 내림
// 자막 기록 (장지 안내 KO/EN/JA 확인)
await page.evaluate(() => { window.__subs = []; const el = document.getElementById('subway-sub'); new MutationObserver(() => { const t = el.innerText; if (t && window.__subs.at(-1) !== t) window.__subs.push(t); }).observe(el, { childList: true, subtree: true, characterData: true }); });
// 8호선 구간: 복정 → 잠실 방면(1) 끝까지, 잠실 → 모란 방면(0) 으로 장지까지
const L8 = [['l8', 1, null], ['l8', 0, '장지']];
let leg = -1;
while (ALL) {
  let more = await page.evaluate(() => { const i = __jj.subway.inside; return i?.kind === 'platform' && i.rides.some((q) => q.game); });
  if (leg >= 0 && L8[leg][2] && got === L8[leg][2]) more = false;
  if (!more) {
    if (++leg >= L8.length) break;
    const [line, dir] = L8[leg];
    if (got !== (leg === 0 ? '복정' : '잠실')) break;
    await page.evaluate(([l, d]) => __jj.subway.toPlatform(l, d), [line, dir]);
    await until(() => __jj.subway.room === 'platform' && !__jj.subway.swapping);
    await page.waitForTimeout(800);
  }
  await page.evaluate(() => __jj.subway.inside.callTrain(13));
  await until(() => document.getElementById('subway-sub').innerText.includes('내리는'), null, 60000).catch(() => {});
  await page.waitForTimeout(3500);
  await page.evaluate(() => { const i = __jj.subway.inside, d = i.lay.doors.find((q) => q.label === '3-2'); i.player.position.set(d.x, 0, -0.4); i.player.rotation.y = 0; i.cam.yaw = Math.PI; });
  await page.keyboard.down('KeyW');
  await until(() => __jj.subway.room === 'train' && !__jj.subway.swapping, null, 60000);
  await page.keyboard.up('KeyW');
  got = await rideAndAlight();
}
if (ALL) {
  const names = results.map((r) => r.station);
  for (const n of ['복정', '장지', '문정', '가락시장', '송파', '석촌', '잠실']) assert.ok(names.includes(n), `8호선 ${n} 에서 내림 ${names}`);
  assert.equal(names.filter((n) => n === '장지').length, 2, '장지: 잠실 방면·모란 방면 둘 다 정차');
  const subs = await page.evaluate(() => window.__subs);
  const jj = subs.filter((t) => t.includes('장지'));
  assert.ok(jj.some((t) => t.includes('Jangji') && t.includes('チャンジ')), `장지 안내 KO/EN/JA ${JSON.stringify(jj.slice(0, 4))}`);
  console.log('jangji subtitles', JSON.stringify(jj.slice(0, 3)));
}
assert.deepEqual(errs, [], 'page errors');
console.log(`e2e-subway-alight OK (${results.map((r) => r.station).join(', ')})`);
await browser.close();
