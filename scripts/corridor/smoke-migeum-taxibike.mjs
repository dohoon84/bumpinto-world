// [migeum-taxibike] 미금역 택시·카카오바이크 브라우저 스모크 + draw 비교 (헤드리스 Chromium 1개, 순서대로)
//   SHOT_DIR=/path E2E_URL=http://localhost:PORT/ node scripts/corridor/smoke-migeum-taxibike.mjs
//   1) on / off(?migeumtaxi=0&migeumbike=0) / ?migeum=0 같은 뷰(정자 거리 · 미금역 · 미금 자전거)의 draws·삼각형·스크린샷
//   2) on: 미금 2번 출구 앞(돌마로, 연장 차도)에서 택시 호출 → 도착 → 탑승 → 성남대로 북쪽 하차
//   3) on: 미금 카카오바이크 타기(인스턴스 → 개별 메시) → W 4초 → 내리기(다시 인스턴스)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const SHOT_DIR = process.env.SHOT_DIR; const BASE = process.env.E2E_URL;
if (!SHOT_DIR || !BASE) { console.error('SHOT_DIR, E2E_URL 필요'); process.exit(2); }
fs.mkdirSync(SHOT_DIR, { recursive: true });
const ST = { x: 58.9, z: 1845 };
const VIEWS = [
  { name: 'jeongja-street', fn: 'sign', dx: 9, dz: 9, dist: 22, pitch: 0.38, yaw: 0.8 },
  { name: 'migeum-station', x: 92, z: 1806, dist: 70, pitch: 0.7, yaw: 2.4 },
  { name: 'migeum-bikes', x: 84, z: 1842, dist: 16, pitch: 0.45, yaw: 1.2 },
];
const RUNS = [['on', ''], ['off', 'migeumtaxi=0&migeumbike=0'], ['nomg', 'migeum=0']];
const Q = '?enter=1&name=e2e&ws=mock&bus=sim&rideSfx=0&rideVoice=0&noticePopup=0&npcs=0&taxis=0&police=0&trucks=0&bike=0&roadbike=0&superbike=0&evening=0';
const out = { runs: {}, taxi: null, bike: null, errors: [] };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [tag, extra] of RUNS) {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', (e) => out.errors.push(tag + ': ' + e.message));
  await page.addInitScript(() => {
    const st = { draws: 0, frames: 0 }; window.__probe = st;
    for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) if (C) for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = C.prototype[fn]; C.prototype[fn] = function (...a) { st.draws++; return o.apply(this, a); }; }
    const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { st.frames++; cb(t); });
  });
  await page.goto(BASE + Q + (extra ? '&' + extra : ''));
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForFunction(() => window.__jj.corridor?.life?.traffic || !window.__jj.corridor, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const J = window.__jj, tr = J.corridor?.life?.traffic;
    return { bikes: J.bikes.list.length, bikesInst: J.bikes.list.filter((b) => b.inst).length, instMeshes: J.bikes._inst ? 1 : 0, exits: tr?.cars?.exits?.length ?? null, migeumExits: tr?.cars?.exits?.filter((e) => String(e.ref).startsWith('미금')).length ?? null, ways: tr?.cars?.ways?.length ?? null, mgWays: tr?.cars?.ways?.filter((w) => w.mg).length ?? null };
  });
  const views = {};
  for (const v of VIEWS) {
    if (tag === 'nomg' && v.name !== 'jeongja-street') continue;
    await page.evaluate(async (v) => {
      const J = window.__jj; J.setMode('follow');
      let x = v.x, z = v.z;
      if (v.fn === 'sign') { x = J.world.signPos.x + v.dx; z = J.world.signPos.z + v.dz; }
      else { await J.corridor.preload(x, z); ({ x, z } = J.corridor.freeSpot(x, z)); }
      J.teleport(x, z); Object.assign(J.cam, { dist: v.dist, pitch: v.pitch, yaw: v.yaw });
    }, v);
    await page.waitForTimeout(5000);
    const m = await page.evaluate(async () => {
      const st = window.__probe; st.draws = 0; st.frames = 0; const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 3000));
      const dt = (performance.now() - t0) / 1000, ri = window.__jj.renderer.info;
      return { fps: +(st.frames / dt).toFixed(1), drawsPerFrame: Math.round(st.draws / Math.max(1, st.frames)), calls: ri.render.calls, triangles: ri.render.triangles, geometries: ri.memory.geometries };
    });
    const file = path.join(SHOT_DIR, `${tag}-${v.name}.png`); await page.screenshot({ path: file });
    views[v.name] = { ...m, file }; console.log(tag, v.name, JSON.stringify(m));
  }
  out.runs[tag] = { info, views }; console.log(tag, JSON.stringify(info));

  if (tag === 'on') {
    // --- 택시: 2번 출구(돌마로 갓길) ---
    const T = {};
    T.hail = await page.evaluate(async () => {
      const J = window.__jj; const x = 106.2, z = 1803.5; await J.corridor.preload(x, z); J.teleport(x, z);
      await new Promise((r) => setTimeout(r, 1500));
      return J.ride.hail();
    });
    if (T.hail) {
      T.called = await page.evaluate(() => window.__jj.ride.debug.state());
      T.ffArrive = await page.evaluate(() => window.__jj.ride.debug.ffTaxi(240, () => window.__jj.ride.debug.state().phase === 'wait'));
      T.wait = await page.evaluate(() => window.__jj.ride.debug.state());
      await page.evaluate(() => { const s = window.__jj.ride.debug.state(); window.__jj.teleport(s.tx + 1.5, s.tz + 1.5); Object.assign(window.__jj.cam, { dist: 18, pitch: 0.45, yaw: 2.0 }); });
      await page.waitForTimeout(2500); await page.screenshot({ path: path.join(SHOT_DIR, 'taxi-1-arrived-exit2.png') });
      T.board = await page.evaluate(() => window.__jj.ride.handleE());
      T.choose = await page.evaluate(() => window.__jj.ride.debug.state());
      T.dest = await page.evaluate(() => window.__jj.ride.debug.pickPoint(40, 1560));
      await page.evaluate(() => window.__jj.ride.debug.depart('drive'));
      await page.waitForTimeout(1500);
      T.drive = await page.evaluate(() => window.__jj.ride.debug.state());
      T.ffRide = await page.evaluate(() => window.__jj.ride.debug.ffTaxi(300, () => window.__jj.ride.debug.state().mode !== 'taxi' || window.__jj.ride.debug.state().phase !== 'drive'));
      T.end = await page.evaluate(() => { const s = window.__jj.ride.debug.state(), p = window.__jj.player.position; return { ...s, px: +p.x.toFixed(1), pz: +p.z.toFixed(1) }; });
      await page.waitForTimeout(2500); await page.screenshot({ path: path.join(SHOT_DIR, 'taxi-2-dropoff.png') });
      await page.evaluate(() => window.__jj.ride.forceAlight?.('teleport'));
    }
    out.taxi = T; console.log('taxi', JSON.stringify(T));
    // --- 자전거 ---
    const Bk = {};
    Bk.pick = await page.evaluate(async () => {
      const J = window.__jj, b = J.bikes.list.filter((q) => q.inst).sort((a, c) => Math.hypot(a.x - 88.5, a.z - 1839.7) - Math.hypot(c.x - 88.5, c.z - 1839.7))[0];
      if (!b) return null; await J.corridor.preload(b.x, b.z);
      J.teleport(b.x + 1.2, b.z, b.y); Object.assign(J.cam, { dist: 10, pitch: 0.35, yaw: b.ry + Math.PI });
      return { x: b.x, z: b.z, y: b.y, ry: b.ry, ground: +J.terrain.getGroundHeight(b.x, b.z).toFixed(2) };
    });
    await page.waitForTimeout(2000); await page.screenshot({ path: path.join(SHOT_DIR, 'bike-0-parked.png') });
    Bk.mount = await page.evaluate(() => { const J = window.__jj; J.toggleRide(); const b = J.bikes.riding; return b ? { inst: !!b.inst, mesh: !!b.mesh, hiddenScale0: J.bikes._inst.instanceMatrix.array[b.idx * 16] === 0 } : null; });
    if (Bk.mount) {
      await page.keyboard.down('KeyW'); await page.waitForTimeout(4000); await page.keyboard.up('KeyW');
      await page.screenshot({ path: path.join(SHOT_DIR, 'bike-1-riding.png') });
      Bk.ride = await page.evaluate(() => { const J = window.__jj, b = J.bikes.riding; return b ? { x: +b.x.toFixed(1), z: +b.z.toFixed(1), y: +(b.y || 0).toFixed(2), ground: +J.terrain.getGroundHeight(b.x, b.z, b.y).toFixed(2) } : null; });
      Bk.dismount = await page.evaluate(() => { const J = window.__jj, b = J.bikes.list.find((q) => q.inst && q.mesh); J.toggleRide(); const c = J.bikes.list.filter((q) => q.inst && q.mesh).length; return { riding: !!J.bikes.riding, meshesLeft: c }; });
    }
    if (Bk.pick && Bk.ride) Bk.moved = +Math.hypot(Bk.ride.x - Bk.pick.x, Bk.ride.z - Bk.pick.z).toFixed(1);
    out.bike = Bk; console.log('bike', JSON.stringify(Bk));
  }
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(SHOT_DIR, 'smoke.json'), JSON.stringify(out, null, 1));
console.log('errors', out.errors.length, out.errors.slice(0, 5));
