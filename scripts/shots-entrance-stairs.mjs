// [subway] 지상 출입구 캐노피 안 계단 스크린샷 (정자 2번 + 다른 역)
//   BASE=http://127.0.0.1:4410/ OUT=/workspace/bw-subway-shots TAG=after node scripts/shots-entrance-stairs.mjs
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4410/';
const OUT = process.env.OUT || '/workspace/bw-subway-shots';
const TAG = process.env.TAG || 'after';
const TARGETS = (process.env.TARGETS || '정자:2,수내:1').split(',').map((s) => s.split(':'));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(B + '?enter=1&name=Tester&ws=mock&shot=1&lang=ko&subwayRt=0&bgm=0', { timeout: 120000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.getElementById('lobby-go')?.click());
await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
await page.waitForTimeout(1500);
const out = {};
for (const [name, ref] of TARGETS) {
  await page.evaluate((nm) => { const st = __jj.subway.stations.find((s) => s.def.name === nm); __jj.teleport(st.x + 25, st.z + 25); }, name);
  await page.waitForFunction((nm) => !!__jj.subway.stations.find((s) => s.def.name === nm)?.ent?.list?.length, name, { timeout: 60000, polling: 200 });
  const ok = await page.evaluate(([nm, ref]) => {
    const st = __jj.subway.stations.find((s) => s.def.name === nm);
    const e = st.ent.list.find((q) => q.exit.ref === ref) || st.ent.list[0];
    // 출입구 앞 5m 에서 입구 안쪽을 내려다봄
    const s = Math.sin(e.ry), c = Math.cos(e.ry);
    __jj.teleport(e.x - s * 4.5, e.z - c * 4.5); __jj.player.rotation.y = e.ry; __jj.setMode('follow');
    __jj.cam.yaw = e.ry + Math.PI; __jj.cam.pitch = 0.55; __jj.cam.dist = 5.5;
    return e.exit.ref;
  }, [name, ref]);
  await page.waitForTimeout(2500);
  const slug = name === '정자' ? 'jeongja' : name === '수내' ? 'sunae' : 'st';
  await page.screenshot({ path: `${OUT}/entrance-stairs-${TAG}-${slug}-${ok}.png` });
  // 옆에서 비스듬히
  await page.evaluate(() => { __jj.cam.yaw += 0.7; __jj.cam.pitch = 0.75; __jj.cam.dist = 7; });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/entrance-stairs-${TAG}-${slug}-${ok}-side.png` });
  out[name] = { ref: ok, calls: await page.evaluate(() => __jj.renderer.info.render.calls) };
}
console.log(JSON.stringify(out), errs);
await browser.close();
