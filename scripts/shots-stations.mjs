// [subway] 코리더 역 헤드리스 스크린샷 + draw call (SwiftShader)
//   npm run build && npx vite preview --port 4410 --strictPort --host 127.0.0.1
//   BASE=http://127.0.0.1:4410/ OUT=/workspace/bw-subway-shots STATIONS=jeongja,imae,garak,jamsil node scripts/shots-stations.mjs
//   출입구 정면(바깥) · 대합실(노선도·안내판) · 같은 자리 ?subway=0 대비 draw call
import fs from 'node:fs';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4410/';
const OUT = process.env.OUT || '/workspace/bw-subway-shots';
const IDS = (process.env.STATIONS || 'jeongja,imae,garak,jamsil').split(',');
const REF = { jeongja: '4', imae: '1', garak: '3', jamsil: '8', moran: '5', seohyeon: '2' };
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = { stations: {} };
const errs = [];
async function open(qs) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /\[subway\]/.test(m.text())) errs.push(m.type() + ': ' + m.text().slice(0, 160)); });
  await page.goto(B + '?enter=1&name=Tester&ws=mock&shot=1&lang=ko&subwayRt=0' + qs, { timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  return page;
}
const frames = (page, n = 4) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const calls = async (page) => { const v = []; for (let i = 0; i < 4; i++) { await frames(page, 1); v.push(await page.evaluate(() => __jj.renderer.info.render.calls)); } return Math.round(v.reduce((a, b) => a + b, 0) / v.length); };
const until = (page, fn, arg, t = 120000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });
// 출입구 정면 포즈 (같은 포즈를 ?subway=0 페이지에도 적용하려고 좌표로 반환)
const poseOf = (page, id, ref) => page.evaluate(({ id, ref }) => {
  const st = __jj.subway.ensureStation(id);
  const e = st.ent.list.find((q) => q.exit.ref === ref) || st.ent.list[0];
  return { x: e.x, z: e.z, ry: e.ry, ref: e.exit.ref, exitId: e.exit.id };
}, { id, ref });
const applyPose = (page, p, d = 4.2, yawOff = -0.55, pitch = 0.26, dist = 11) => page.evaluate(({ p, d, yawOff, pitch, dist }) => {
  const s = Math.sin(p.ry), c = Math.cos(p.ry);
  __jj.teleport(p.x - s * d, p.z - c * d); __jj.player.rotation.y = p.ry;
  __jj.setMode('follow'); __jj.cam.yaw = p.ry + Math.PI + yawOff; __jj.cam.pitch = pitch; __jj.cam.dist = dist;
}, { p, d, yawOff, pitch, dist });

const on = await open('');
const off = await open('&subway=0');
for (const id of IDS) {
  const r = (report.stations[id] = {});
  const pose = await poseOf(on, id, REF[id] || '1');
  r.exit = pose.ref;
  await applyPose(on, pose); await applyPose(off, pose);
  await on.waitForTimeout(9000); await off.waitForTimeout(9000); // 코리더 타일 스트리밍
  r.callsOn = await calls(on); r.callsOff = await calls(off); r.delta = r.callsOn - r.callsOff;
  r.subwayMeshes = await on.evaluate(() => __jj.subway.drawCalls());
  r.builtStations = await on.evaluate(() => __jj.subway.stations.filter((s) => s.ent).map((s) => s.def.id));
  await on.screenshot({ path: `${OUT}/stations-${id}-entrance.png` });
  // 대합실
  await on.evaluate((eid) => __jj.subway.enterById(eid), pose.exitId);
  await until(on, () => __jj.subway.state.phase === 'inside' && __jj.subway.inside);
  await on.waitForTimeout(2500);
  r.zone = await on.evaluate(() => __jj.subway.zone);
  r.concourseCalls = await calls(on);
  await on.screenshot({ path: `${OUT}/stations-${id}-concourse.png` });
  // 노선도 + 안내판 (서쪽 벽 쪽을 보기)
  await on.evaluate(() => __jj.subway.inside.setView(-8.6, -7.2, Math.PI, 0.02, 3.2)); await on.waitForTimeout(2500);
  r.board = await on.evaluate(() => document.querySelector('#subway-toast')?.textContent || '');
  await on.screenshot({ path: `${OUT}/stations-${id}-board.png` });
  // 나가기: 들어온 출구로
  await on.evaluate(() => __jj.subway.openChooser()); await on.waitForTimeout(500);
  await on.screenshot({ path: `${OUT}/stations-${id}-chooser.png` });
  r.chooser = await on.evaluate(() => [...document.querySelectorAll('#subway-chooser li')].map((li) => li.innerText.replace(/\s+/g, ' ')));
  await on.evaluate(() => __jj.subway.go());
  await until(on, () => __jj.subway.state.phase === 'outside');
  await on.waitForTimeout(1500);
  r.after = await on.evaluate(() => ({ zone: __jj.subway.zone, p: [+__jj.player.position.x.toFixed(1), +__jj.player.position.z.toFixed(1)] }));
  console.log(id, JSON.stringify(r));
}
// 경부 서울 방면 '준비 중'
await on.evaluate(() => { __jj.teleport(-446, -1700); });
await on.waitForTimeout(1500);
await on.evaluate(() => { __jj.teleport(-446, -1790); });
await on.waitForTimeout(2500);
report.gyeongbuToast = await on.evaluate(() => [...document.querySelectorAll('div')].filter((d) => /준비 중/.test(d.textContent) && d.children.length === 0 && getComputedStyle(d).opacity !== '0').map((d) => d.textContent).slice(0, 3));
await on.screenshot({ path: `${OUT}/stations-gyeongbu-soon.png` });
report.errors = errs;
fs.writeFileSync(`${OUT}/stations-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
