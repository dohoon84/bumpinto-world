// [traffic-fix] 정자역 사거리 교착 재현·검증(브라우저, 헤드리스): 실제 게임에서 일반 차량 시뮬을 프레임마다 몇 걸음 더 돌려(신호 시계도 같이) 빨리 감음
//   npx vite preview --port 4931 --strictPort &  BASE=http://localhost:4931/ OUT=/workspace/bw-traffic-jam-shots SIM=600 node scripts/shots-jz-gridlock.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://localhost:4931/', OUT = process.env.OUT || '/workspace/bw-traffic-jam-shots';
const JX = Number(process.env.JX ?? -27.3), JZ = Number(process.env.JZ ?? -224.5); // 기본: 느티로×성남대로 사거리(정자역 남쪽, 신호 횡단보도 5곳)
const SIM = Number(process.env.SIM || 600), HOUR = process.env.HOUR || '20', K = Number(process.env.K || 60), DT = Number(process.env.DT || 1 / 30);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = {};
for (const [name, q] of [['before-trafficfix0', 'trafficfix=0'], ['after-default', '']].filter(([n]) => !process.env.ONLY || n.startsWith(process.env.ONLY))) {
  const page = await browser.newPage({ viewport: { width: 990, height: 836 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + `?enter=1&name=Tester&ws=mock&shot=1&lang=ko&subwayRt=0&ga=off&hour=${HOUR}&` + q, { timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
  const rows = await page.evaluate(async ({ SIM, K, DT, JX, JZ }) => {
    const J = { x: JX, z: JZ };
    __jj.teleport(J.x, J.z); __jj.setMode('follow'); __jj.cam.yaw = 2.6; __jj.cam.pitch = 1.2; __jj.cam.dist = 62; if (__jj.player) __jj.player.visible = false;
    const jz = __jj.jzTraffic, s = jz.sim, tr = __jj.transit, cam = __jj.camera;
    const still = new Map(), rows = []; let sim = 0, next = 30;
    const sample = () => {
      let near = 0, moving = 0, s30 = 0, s60 = 0, moto = 0, motoStill = 0;
      for (const t of s.list) if (t && !t.parked && !t.rec.off) { const d = Math.hypot(t.rec.x - J.x, t.rec.z - J.z); if (d > 120) continue; near++; if (t.v > 0.5) moving++; const w = still.get(t.rec) || 0; if (w > 30) s30++; if (w > 60) s60++; if (t.moto) { moto++; if (w > 30) motoStill++; } }
      const c = jz.stats(); return { t: Math.round(sim), near, moving, still30: s30, still60: s60, moto, motoStill30: motoStill, fix: s.fix, stuck: c.stuck, deadlocks: c.deadlocks, cycles: c.cycles, taxiUnlocks: c.taxiUnlocks, stillMax: c.stillMax };
    };
    // 실제 게임 프레임 + 프레임마다 K 걸음(DT, 기본 1/30초) 더: 신호 시계(transit.fastForward)와 일반 차량·택시(jzTraffic.update)
    await new Promise((res) => {
      const f = () => {
        for (let k = 0; k < K; k++) { tr.fastForward(DT, DT); jz.update(DT, cam.position); sim += DT; for (const t of s.list) if (t && !t.parked) still.set(t.rec, t.v < 0.1 ? (still.get(t.rec) || 0) + DT : 0); }
        if (sim >= next) { rows.push(sample()); next += 30; }
        if (sim < SIM) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
    return rows;
  }, { SIM, K, DT, JX, JZ });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}-h${HOUR}.png` });
  report[name] = { errs: errs.slice(0, 5), rows };
  console.log(name, JSON.stringify(rows[rows.length - 1]), 'errs', errs.length);
  await page.close();
}
fs.writeFileSync(`${OUT}/report-h${HOUR}${process.env.ONLY ? '-' + process.env.ONLY : ''}.json`, JSON.stringify(report, null, 1));
await browser.close();
