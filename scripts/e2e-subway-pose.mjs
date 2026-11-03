// [subway-pose] 지하(대합실·승강장·열차)에서도 점프(Space)·앉기(C/버튼)·자리비움(Z/버튼)이 바깥과 같게 되고,
//   같은 역(구역)에 있는 다른 사람에게도 보이는지 2인 헤드리스로 확인. 점프하며 걸어도 계단 트리거·구역 전환이 그대로인지도.
//   PORT=4411 node server/dev-relay.mjs &   (preview 4410)
//   BASE=http://127.0.0.1:4410/ WS=ws://127.0.0.1:4411 OUT=/workspace/bw-subway-shots node scripts/e2e-subway-pose.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4410/';
const WS = process.env.WS || 'ws://127.0.0.1:4411';
const OUT = process.env.OUT || '';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  await page.goto(`${B}?enter=1&name=${encodeURIComponent(name)}&ws=${encodeURIComponent(WS)}&shot=1&lang=ko&subwayRt=0&noticePopup=0&bgm=0&subwayVoice=0`, { timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  return page;
}
const until = (page, fn, arg, t = 60000) => page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
const settled = (page, room) => until(page, (r) => __jj.subway.room === r && !__jj.subway.swapping, room, 60000);
const peer = (page, name) => page.evaluate((n) => { const p = [...__jj.remotes.peers.values()].find((q) => q.name === n); return p ? { zone: p.zone, sit: p.mesh.userData.sit, afk: p.mesh.userData.afk, jy: p.mesh.userData.jumpY, tag: p.tag.el.textContent, scene: p.mesh.parent === __jj.subway.inside?.scene } : null; }, name);
const seenBy = (page, name, src, t = 15000) => until(page, ({ n, src }) => { const p = [...__jj.remotes.peers.values()].find((q) => q.name === n); return p && p.mesh.parent === __jj.subway.inside?.scene && new Function('u', 'p', src)(p.mesh.userData, p); }, { n: name, src }, t);
const pose = (page) => page.evaluate(() => ({ ...__jj.pose, room: __jj.subway.room, kind: __jj.subway.sitKind, mine: __jj.subway.inside?.player.userData.sit || '', jyMesh: __jj.subway.inside?.player.userData.jumpY || 0 }));
const place = (page, x, z, yaw, pitch = 0.3, dist = 5) => page.evaluate(([x, z, yaw, pitch, dist]) => { const i = __jj.subway.inside; i.player.position.set(x, 0, z); i.cam.yaw = yaw; i.cam.pitch = pitch; i.cam.dist = dist; }, [x, z, yaw, pitch, dist]);
const shot = (page, n) => OUT && page.screenshot({ path: `${OUT}/${n}.png` });
const report = {};

const A = await open('도훈A');
const Bp = await open('손님B');
for (const pg of [A, Bp]) {
  await pg.evaluate(() => __jj.subway.enterById(__jj.subway.exits.find((e) => e.ref === '4').id));
  await settled(pg, 'concourse');
}
// ── 대합실: A 는 (2,-4), B 는 그 북쪽에서 A 를 봄
await place(A, 2, -4, Math.PI);
await place(Bp, 2, -8.2, Math.PI, 0.25, 3);
await seenBy(Bp, '도훈A', 'return true;', 30000);
await A.waitForTimeout(800);
// 점프 (Space): 내 아바타와 B 화면의 A 둘 다 뛰어오름
await A.keyboard.press('Space');
await until(A, () => __jj.pose.jy > 0.2 && __jj.subway.inside.player.userData.jumpY > 0.2, null, 10000);
await seenBy(Bp, '도훈A', 'return (u.jumpY || 0) > 0.15;', 10000);
report.concourseJump = true;
await until(A, () => __jj.pose.jy === 0 && !__jj.subway.inside.player.userData.jumpY, null, 8000); // 착지
// 앉기 (C): 대합실엔 의자가 없어 바닥
await A.keyboard.press('KeyC');
await until(A, () => __jj.pose.sit === 'ground' && __jj.subway.inside.player.userData.sit === 'ground', null, 10000);
await seenBy(Bp, '도훈A', "return u.sit === 'ground';");
await Bp.waitForTimeout(500); await shot(Bp, 'pose-concourse-sit-seen-by-B');
// 걸으면 일어남
await A.keyboard.down('KeyW'); await A.waitForTimeout(400); await A.keyboard.up('KeyW');
await until(A, () => __jj.pose.sit === '' && __jj.subway.inside.player.userData.sit === '', null, 10000);
await seenBy(Bp, '도훈A', "return !u.sit;");
// 자리비움 (Z): 바닥에 앉고 💤, B 이름표에도
await A.keyboard.press('KeyZ');
await until(A, () => __jj.pose.afk && __jj.pose.sit === 'ground', null, 10000);
await seenBy(Bp, '도훈A', "return u.afk && u.sit === 'ground' && p.tag.el.textContent.includes('💤');");
await Bp.waitForTimeout(800); await shot(Bp, 'pose-concourse-afk-seen-by-B');
await A.keyboard.press('KeyZ');
await until(A, () => !__jj.pose.afk && !__jj.pose.sit, null, 10000);
await seenBy(Bp, '도훈A', 'return !u.afk && !u.sit;');
// 리액션 바 버튼(앉기·자리비움)도 지하에서
await A.click('[data-sit-toggle]'); await until(A, () => __jj.pose.sit === 'ground', null, 10000);
await A.click('[data-sit-toggle]'); await until(A, () => !__jj.pose.sit, null, 10000);
await A.click('[data-afk-toggle]'); await until(A, () => __jj.pose.afk, null, 10000);
await A.click('[data-afk-toggle]'); await until(A, () => !__jj.pose.afk, null, 10000);
await A.evaluate(() => document.activeElement?.blur?.()); // 버튼 포커스가 Space 를 먹지 않게
report.concourse = { sit: 'ground', afk: true, buttons: true };

// ── 점프하면서 계단 입구로 걸어 들어가도 승강장으로 (트리거 그대로) — 둘 다 왕십리 방면
async function walkJumping(page, yaw, doneSrc, ms = 240000) {
  await page.evaluate((y) => { __jj.subway.inside.cam.yaw = y; }, yaw);
  await page.keyboard.down('KeyW');
  const t0 = Date.now(); let ok = false, maxJ = 0;
  while (Date.now() - t0 < ms) {
    await page.keyboard.press('Space');
    const v = await page.evaluate(({ y, src }) => { const s = __jj.subway; if (s.inside && !s.swapping) s.inside.cam.yaw = y; return { done: new Function(src)(), jy: __jj.pose.jy }; }, { y: yaw, src: doneSrc });
    maxJ = Math.max(maxJ, v.jy);
    if (v.done) { ok = true; break; }
    await page.waitForTimeout(250);
  }
  await page.keyboard.up('KeyW');
  return { ok, maxJ };
}
await place(A, 16.5, 1.2, Math.PI);
const dn = await walkJumping(A, Math.PI, "return __jj.subway.room === 'platform' && !__jj.subway.swapping;");
assert.ok(dn.ok && dn.maxJ > 0.2, `점프하며 계단 → 승강장 실패 ${JSON.stringify(dn)}`);
assert.equal(await A.evaluate(() => __jj.subway.inside.dir), 1);
await place(Bp, 16.5, 1.2, Math.PI);
await Bp.keyboard.down('KeyW'); await settled(Bp, 'platform'); await Bp.keyboard.up('KeyW');
report.jumpIntoStairs = dn;
// ── 승강장: 벤치 앞에서 C → 벤치에 앉음 (B 에게도)
const bench = await A.evaluate(() => { const i = __jj.subway.inside; const q = i.benchSeats[0]; return q; });
assert.ok(bench, '승강장 벤치');
await place(A, bench.x + 0.4, bench.z + 1.0, 0);
await A.waitForTimeout(400);
await A.keyboard.press('KeyC');
await until(A, () => __jj.pose.sit === 'bench', null, 10000);
const ap = await A.evaluate(() => { const p = __jj.subway.inside.player.position; return { x: p.x, z: p.z }; });
assert.ok(Math.abs(ap.z - bench.z) < 0.05, `벤치 자리로 앉음 ${JSON.stringify([ap, bench])}`);
await place(Bp, bench.x + 1.6, bench.z + 3.2, -0.5, 0.2, 2.5);
await seenBy(Bp, '도훈A', "return u.sit === 'bench';");
await Bp.waitForTimeout(800); await shot(Bp, 'pose-platform-bench-seen-by-B');
await A.evaluate(() => { const i = __jj.subway.inside; i.cam.yaw = 0.5; i.cam.pitch = 0.25; i.cam.dist = 4; }); await A.waitForTimeout(500); await shot(A, 'pose-platform-bench-self');
// Space → 일어나며 점프 (바깥과 같게)
await A.keyboard.press('Space');
await until(A, () => !__jj.pose.sit && __jj.pose.jy > 0.1, null, 10000);
await seenBy(Bp, '도훈A', 'return !u.sit;');
// 승강장 자리비움 (벤치 멀면 바닥)
await place(A, 0, -2.5, 0); await A.waitForTimeout(300);
await A.keyboard.press('KeyZ');
await until(A, () => __jj.pose.afk && __jj.pose.sit === 'ground', null, 10000);
await seenBy(Bp, '도훈A', "return u.afk && p.tag.el.textContent.includes('💤');");
await A.keyboard.press('KeyZ'); await until(A, () => !__jj.pose.afk, null, 10000);
report.platform = { bench: true, jumpStands: true, afk: true };
// 점프하며 '나가는 곳' 계단으로 올라가도 대합실로 (구역 전환 그대로)
await place(A, 0, -3.5, 0);
const up = await walkJumping(A, 0, "return __jj.subway.room === 'concourse' && !__jj.subway.swapping;");
assert.ok(up.ok, `점프하며 계단 → 대합실 실패 ${JSON.stringify(up)}`);
await until(A, () => __jj.remotes.zone === __jj.subway.zone, null, 10000);
report.jumpUpStairs = up;

// ── 열차: 정자 승강장(왕십리) → 열차, 좌석 C · 점프 · 자리비움
await A.evaluate(() => __jj.subway.toPlatform('suin', 1));
await settled(A, 'platform');
await A.evaluate(() => __jj.subway.inside.callTrain(13));
await A.waitForTimeout(6000);
await A.evaluate(() => { const i = __jj.subway.inside, d = i.lay.doors.find((q) => q.label === '3-2'); i.player.position.set(d.x, 0, -0.4); i.cam.yaw = Math.PI; });
await A.keyboard.down('KeyW'); await settled(A, 'train'); await A.keyboard.up('KeyW');
await A.waitForTimeout(800);
await A.keyboard.press('KeyC');
await until(A, () => __jj.pose.sit !== '', null, 10000);
const tp = await pose(A);
await A.evaluate(() => { const i = __jj.subway.inside; i.cam.pitch = 0.15; i.cam.dist = 2.4; i.cam.yaw = i.player.rotation.y + 0.6; }); await A.waitForTimeout(600); await shot(A, 'pose-train-seat');
await A.keyboard.press('Space');
await until(A, () => !__jj.pose.sit, null, 10000);
await A.waitForTimeout(800);
await A.keyboard.press('KeyZ'); await until(A, () => __jj.pose.afk && !!__jj.pose.sit, null, 10000);
await A.keyboard.press('KeyZ'); await until(A, () => !__jj.pose.afk, null, 10000);
report.train = { sit: tp.sit, afk: true };
// 열차 E(기존 좌석 키)와 C 상태가 같은지
await A.keyboard.press('KeyE'); await A.waitForTimeout(200);
const eSit = await pose(A);
assert.equal(eSit.sit, eSit.mine, 'E 앉기 ↔ 내 상태 동기화');
report.trainE = eSit.sit;
assert.deepEqual(errs, [], 'page errors');
console.log('e2e-subway-pose OK', JSON.stringify(report));
await browser.close();
