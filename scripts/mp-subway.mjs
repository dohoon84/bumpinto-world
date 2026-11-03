// [zone] 헤드리스 2인 확인: 대합실 안끼리는 서로 보이고, 바깥에서는 역 안 사람이 안 보인다 (서버 변경 없음 = dev-relay 그대로)
//   PORT=4391 node server/dev-relay.mjs &   npm run build && npx vite preview --port 4380 --strictPort --host 127.0.0.1 &
//   BASE=http://127.0.0.1:4380/ WS=ws://127.0.0.1:4391 OUT=/workspace/bw-subway-shots node scripts/mp-subway.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4380/';
const WS = process.env.WS || 'ws://127.0.0.1:4391';
const OUT = process.env.OUT || '/workspace/bw-subway-shots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
const report = { steps: [] };
const log = (s, v) => { report.steps.push({ s, ...(v || {}) }); console.log(s, v ? JSON.stringify(v) : ''); };

async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); // 탭마다 다른 기기(deviceId)
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|ERR_/.test(m.text())) errs.push(`${name} ${m.type()}: ${m.text().slice(0, 160)}`); });
  await page.goto(`${B}?enter=1&name=${encodeURIComponent(name)}&ws=${encodeURIComponent(WS)}&shot=1&lang=ko`, { timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
  return page;
}
const until = (page, fn, arg, t = 120000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
// 상대(이름으로) 상태: 구역, 보이는지, 어느 Scene, 이름표가 화면에 떴는지
const peerView = (page, name) => page.evaluate((name) => {
  const p = [...__jj.remotes.peers.values()].find((q) => q.name === name);
  if (!p) return null;
  const inScene = p.mesh.parent === (__jj.subway.inside?.scene || null) ? 'interior' : p.mesh.parent?.isScene ? 'outdoor' : String(p.mesh.parent);
  return { zone: p.zone, visible: p.mesh.visible, scene: inScene, tagShown: p.tag.el.style.display !== 'none' && p.tag.visible, x: +p.mesh.position.x.toFixed(2), z: +p.mesh.position.z.toFixed(2), myZone: __jj.remotes.zone, list: __jj.remotes.list().map((q) => q.name) };
}, name);
const goInside = async (page) => {
  await page.evaluate(() => __jj.subway.enterById(__jj.subway.exits.find((e) => e.ref === '4').id));
  await until(page, () => __jj.subway.state.phase === 'inside');
};
// 바깥: 4번 출구 앞, 입구를 보는 카메라
const watchExit4 = (page, d = 6.5, side = 1.6) => page.evaluate(({ d, side }) => {
  const e = __jj.subway.entrances.find((q) => q.exit.ref === '4');
  const s = Math.sin(e.ry), c = Math.cos(e.ry);
  __jj.teleport(e.x - s * d + c * side, e.z - c * d - s * side);
  __jj.player.rotation.y = e.ry + Math.PI;
  __jj.setMode('follow'); __jj.cam.yaw = e.ry + Math.PI + 0.25; __jj.cam.pitch = 0.3; __jj.cam.dist = 7.5;
}, { d, side });

const A = await open('도훈A');
const Bp = await open('손님B');
await until(A, () => __jj.remotes.peers.size >= 1);
await until(Bp, () => __jj.remotes.peers.size >= 1);

// 1) 둘 다 바깥 4번 출구 앞 → 서로 보임
await watchExit4(A, 3.0, -1.2);
await watchExit4(Bp, 6.5, 1.6);
await until(Bp, () => { const p = [...__jj.remotes.peers.values()][0]; return p && Math.abs(p.mesh.position.x - __jj.player.position.x) < 12; });
await Bp.waitForTimeout(1500);
const v1 = await peerView(Bp, '도훈A');
log('1 both outside: B sees A', v1);
assert.ok(v1.visible && v1.zone === '' && v1.scene === 'outdoor');
await shot(Bp, 'mp-01-outside-both');

// 2) A 가 4번 출구로 들어감 → 바깥 B 에게선 입구에서 가라앉고 사라짐
await A.evaluate(() => { __jj.subway.enterById(__jj.subway.exits.find((e) => e.ref === '4').id); });
await until(Bp, () => [...__jj.remotes.peers.values()][0]?.fx);
await until(Bp, () => { const p = [...__jj.remotes.peers.values()][0]; return p.fx && p.mesh.position.y < -0.3; }, null, 30000).catch(() => {});
await shot(Bp, 'mp-02-outside-A-going-down');
await until(A, () => __jj.subway.state.phase === 'inside');
await until(Bp, () => { const p = [...__jj.remotes.peers.values()][0]; return !p.fx && !p.mesh.visible; });
await Bp.waitForTimeout(800);
const v2 = await peerView(Bp, '도훈A');
log('2 A inside, B outside: B does not see A', v2);
assert.equal(v2.zone, 'jeongja-station'); assert.equal(v2.visible, false); assert.equal(v2.tagShown, false); assert.deepEqual(v2.list, []);
await shot(Bp, 'mp-03-outside-A-gone');
const vA2 = await peerView(A, '손님B');
log('2b A inside does not see outside B', vA2);
assert.equal(vA2.visible, false);

// 3) B 도 들어감 → 둘 다 대합실, 서로 보임 (A 는 B 를 보도록 카메라 조정)
await goInside(Bp);
await until(A, () => [...__jj.remotes.peers.values()][0]?.zone === 'jeongja-station' && [...__jj.remotes.peers.values()][0].mesh.visible);
// A 를 대합실 가운데 쪽으로, B 는 입구 쪽에 있으니 서로 마주보게
await A.evaluate(() => { const i = __jj.subway.inside; i.setView(0.5, -4.2, Math.PI / 2 + 0.35, 0.22, 6.5); });
await Bp.evaluate(() => { const i = __jj.subway.inside; i.setView(-3.5, -5.0, -Math.PI / 2 - 0.25, 0.25, 5.5); });
await until(A, () => { const p = [...__jj.remotes.peers.values()][0]; return Math.hypot(p.mesh.position.x + 3.5, p.mesh.position.z + 5.0) < 0.4; });
await until(Bp, () => { const p = [...__jj.remotes.peers.values()][0]; return Math.hypot(p.mesh.position.x - 0.5, p.mesh.position.z + 4.2) < 0.4; });
// 채팅 + 리액션
await A.evaluate(() => { const i = document.getElementById('chat-input'); i.value = '역 안에서 만났네요!'; document.getElementById('chat').requestSubmit(); });
await Bp.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', bubbles: true })); });
await until(Bp, () => [...document.querySelectorAll('.bubble.remote')].some((b) => b.style.display !== 'none' && /역 안에서/.test(b.textContent)));
await A.waitForTimeout(1200);
const v3a = await peerView(A, '손님B'), v3b = await peerView(Bp, '도훈A');
const bubbleB = await Bp.evaluate(() => [...document.querySelectorAll('.bubble.remote')].filter((b) => b.style.display !== 'none').map((b) => b.textContent));
const emoteA = await A.evaluate(() => [...__jj.remotes.peers.values()][0].emote);
log('3 both inside: see each other', { v3a, v3b, bubbleB, emoteSeenByA: emoteA });
assert.ok(v3a.visible && v3a.scene === 'interior' && v3a.tagShown);
assert.ok(v3b.visible && v3b.scene === 'interior' && v3b.tagShown);
assert.ok(bubbleB.some((t) => /역 안에서/.test(t)), '채팅 말풍선');
await shot(A, 'mp-04-inside-A-sees-B');
await shot(Bp, 'mp-05-inside-B-sees-A-chat');
report.drawCallsInside2 = await A.evaluate(() => __jj.renderer.info.render.calls);

// 4) A 가 6번 출구로 나감 → 대합실 B 에게서 사라짐, 바깥 A 에게 B 는 안 보임
await A.evaluate(() => { __jj.subway.openChooser(); __jj.subway.choose(__jj.subway.exits.find((e) => e.ref === '6').id); __jj.subway.go(); });
await until(A, () => __jj.subway.state.phase === 'outside');
await until(Bp, () => [...__jj.remotes.peers.values()][0]?.zone === '');
await A.waitForTimeout(1500);
const v4b = await peerView(Bp, '도훈A'), v4a = await peerView(A, '손님B');
log('4 A outside at exit 6, B inside', { v4a, v4b });
assert.equal(v4b.visible, false); assert.equal(v4a.visible, false); assert.equal(v4a.zone, 'jeongja-station');
await shot(Bp, 'mp-06-inside-B-after-A-left');
await shot(A, 'mp-07-outside-A-exit6-no-B');
// 5) B 도 6번으로 나옴 → A 가 보는 앞에서 올라옴
await A.evaluate(() => { const e = __jj.subway.entrances.find((q) => q.exit.ref === '6'); const s = Math.sin(e.ry), c = Math.cos(e.ry); __jj.teleport(e.x + s * 6 + c * 2, e.z + c * 6 - s * 2); __jj.setMode('follow'); __jj.cam.yaw = e.ry + 0.9; __jj.cam.pitch = 0.28; __jj.cam.dist = 8; });
await Bp.evaluate(() => { __jj.subway.openChooser(); __jj.subway.choose(__jj.subway.exits.find((e) => e.ref === '6').id); __jj.subway.go(); });
await until(A, () => { const p = [...__jj.remotes.peers.values()][0]; return p.zone === '' && p.mesh.visible; });
await until(A, () => { const p = [...__jj.remotes.peers.values()][0]; return !p.fx; });
await A.waitForTimeout(1200);
const v5 = await peerView(A, '손님B');
log('5 B came out at exit 6: A sees B', v5);
assert.ok(v5.visible && v5.zone === '' && v5.scene === 'outdoor');
await shot(A, 'mp-08-outside-B-came-out');

report.errors = errs;
fs.writeFileSync(`${OUT}/mp-report.json`, JSON.stringify(report, null, 1));
console.log('errors', errs.length ? errs : 'none');
await browser.close();
