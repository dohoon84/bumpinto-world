// [taxi] [terrain] 스크린샷: shot-7-taxi.png (정자역 출입구 앞 택시), shot-8-tancheon.png (탄천 제방/둔치 고저차), shot-9-stairs.png (탄천 계단)
//   npm run build && npm run preview  (다른 터미널)  ->  npm run shots-taxi-terrain
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
const wait = (ms) => page.waitForTimeout(ms);
await page.goto(URL + '?shot=1' + (process.env.Q || ''));
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 120000 });
await wait(2500);

// ---- 자체 점검: 계단 걸어 내려가기 / 제방 직하강 막힘 ----
const selfTest = await page.evaluate(() => {
  const T = __jj.terrain, out = [];
  for (const s of T.stairs) {
    let x = s.ax - s.ux * 2, z = s.az - s.uz * 2, y = T.getGroundHeight(x, z, 0), ok = true, maxStep = 0;
    for (let k = 0; k < (s.L + 4) / 0.2; k++) { const nx = x + s.ux * 0.2, nz = z + s.uz * 0.2, r = T.canMove(x, z, y, nx, nz); if (r == null) { ok = false; break; } maxStep = Math.max(maxStep, Math.abs(r - y)); x = nx; z = nz; y = r; }
    // 계단 옆 4m 에서 같은 방향으로 내려가기 -> 막혀야 정상
    let bx = s.ax - s.ux * 2 - s.uz * 5, bz = s.az - s.uz * 2 + s.ux * 5, by = T.getGroundHeight(bx, bz, 0), blocked = false;
    for (let k = 0; k < (s.L + 4) / 0.2; k++) { const nx = bx + s.ux * 0.2, nz = bz + s.uz * 0.2, r = T.canMove(bx, bz, by, nx, nz); if (r == null) { blocked = true; break; } bx = nx; bz = nz; by = r; }
    out.push({ name: s.name, steps: s.n, down: ok ? y.toFixed(2) : 'BLOCKED', maxStep: maxStep.toFixed(2), sideBlocked: blocked });
  }
  return out;
});
console.log('selftest', JSON.stringify(selfTest, null, 0));

// ---- shot 7: 정자역 출입구 앞에서 손님 태우는 택시 ----
const info7 = await page.evaluate(() => {
  const X = __jj.taxis; let t = null;
  for (let k = 0; k < 1500 && !t; k++) { X.fastForward(1); t = X.list.find((q) => q.state === 'pickup' && q.wait > 3 && (q.liv === 'kakao' || k > 1200)); }
  if (!t) return { ok: false, stats: X.stats() };
  t.wait = 40;
  const p = t.mesh.position, h = t.heading, hx = Math.sin(h), hz = Math.cos(h), rx = -hz, rz = hx;
  __jj.setMode('follow');
  __jj.teleport(p.x + rx * 4.5 + hx * 7, p.z + rz * 4.5 + hz * 7);
  Object.assign(__jj.cam, { yaw: Math.atan2(rx * 0.9 + hx * 0.8, rz * 0.9 + hz * 0.8), pitch: 0.28, dist: 16 });
  return { ok: true, liv: t.liv, exit: t.stop?.ref, at: [p.x.toFixed(1), p.z.toFixed(1)], stats: X.stats() };
});
console.log('shot7', JSON.stringify(info7));
await wait(2500);
await page.screenshot({ path: 'shot-7-taxi.png' });

// ---- shot 8: 탄천 — 동안 제방 위에서 둔치/수면/서안 제방을 내려다봄 ----
const info8 = await page.evaluate(() => {
  const T = __jj.terrain;
  __jj.setMode('follow');
  // 동안 둔치 산책로에 서서 남쪽(정자역 방향)에서 북쪽(정자교 방향)으로 하천을 따라 바라봄
  __jj.teleport(72, -70);
  Object.assign(__jj.cam, { yaw: Math.atan2(0.35, 1), pitch: 0.3, dist: 48 });
  const P = __jj.player.position;
  return { player: [P.x, P.y.toFixed(2), P.z], profile: [-10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130].map((x) => [x, T.baseHeight(x, -70).toFixed(1)]) };
});
console.log('shot8', JSON.stringify(info8));
await wait(2500);
await page.screenshot({ path: 'shot-8-tancheon.png' });

// ---- shot 9: 계단 중간에 선 플레이어 ----
const info9 = await page.evaluate(() => {
  const T = __jj.terrain, st = __jj.data.station, want = new URLSearchParams(location.search).get('stair');
  const s = want ? T.stairs.find((q) => String(q.id) === want || q.name.includes(want)) : T.stairs.filter((q) => q.osm).sort((a, b) => Math.hypot(a.ax - st.x, a.az - st.z) - Math.hypot(b.ax - st.x, b.az - st.z))[0];
  const u = s.L * 0.55, x = s.ax + s.ux * u, z = s.az + s.uz * u;
  __jj.setMode('follow');
  __jj.teleport(x, z, T.getGroundHeight(x, z, s.h0));
  __jj.player.rotation.y = Math.atan2(s.ux, s.uz);
  // 옆+위에서 비스듬히
  const rx = -s.uz, rz = s.ux;
  Object.assign(__jj.cam, { yaw: Math.atan2(rx * 0.85 - s.ux * 0.55, rz * 0.85 - s.uz * 0.55), pitch: 0.3, dist: 15 });
  return { stair: s.name, osm: s.osm, steps: s.n, riser: s.riser, tread: s.tread, y: __jj.player.position.y.toFixed(2) };
});
console.log('shot9', JSON.stringify(info9));
await wait(2500);
await page.screenshot({ path: 'shot-9-stairs.png' });

// 택시 상태 점검 (신호 대기 등)
await wait(8000);
const stat = await page.evaluate(() => { const X = __jj.taxis; return { ...X.stats(), stopped: X.list.filter((t) => t.v < 0.2).length, avgSpeed: (X.list.reduce((a, t) => a + t.v, 0) / X.list.length).toFixed(1) }; });
console.log('stat', JSON.stringify(stat), 'errors', errors.length);
await browser.close();
