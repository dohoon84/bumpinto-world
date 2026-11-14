// [guide-walk] 남대문시장 가이드: 플레이어 컨트롤러와 같은 이동 규칙(world.isBlocked + terrain.canMove, 축별 미끄러짐, 4.2 m/s · 30 fps)으로
//   'Take me there' 길을 실제로 걸어 본다 — 출발점(게이트·안내원·안내판·각 목적지) × 목적지 전부. 하나라도 못 가면 실패.
//   + 시장 깃발·등이 머리 위(≥ 2.6 m)에 있고 충돌이 없는지.
//   node scripts/guides/test-guide-walk.mjs <vite port>   (npm run guide:walk — MYEONGDONG_WALK_PORT, 기본 5231)
import { chromium } from 'playwright';
const PORT = /^\d+$/.test(process.argv[2] || '') ? process.argv[2] : process.env.MYEONGDONG_WALK_PORT;
if (!PORT) { console.log('test-guide-walk: skipped (no vite port)'); process.exit(0); }
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const [VW, VH] = (process.env.WALK_VIEW || '1280x800').split('x').map(Number), MOB = VW < 900; // 844x390 = 폰 가로
const page = await (await browser.newContext({ viewport: { width: VW, height: VH }, isMobile: MOB, hasTouch: MOB })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/?ws=mock&at=myeongdong&hour=14&shot=1&noticePopup=0&controlscard=0${MOB ? '&mobile=1' : ''}`);
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.myeongdong?.ready, null, { timeout: 300000 });
const r = await page.evaluate(async () => {
  const J = window.__jj, md = J.myeongdong, W = J.world, T = J.terrain, B = J.bikes;
  const bike = (x, z, y) => !!B?.blocks?.(x, z, null, y);
  const px0 = -11358.4, pz0 = -21470.5; await J.teleport(px0, pz0, md.surfaceY(px0, pz0));
  for (let i = 0; i < 80 && !J.placeGuide; i++) await new Promise((res) => setTimeout(res, 250));
  const G = J.placeGuide; if (!G) return { err: 'guide not mounted' };
  const g = G.ui.guide, spots = g.spots, A = g.anchors;
  const starts = [{ id: 'npc', x: px0, z: pz0 }, { id: 'gate', x: A.gate.x, z: A.gate.z }, { id: 'board', x: A.board.x + 2, z: A.board.z - 2 }, ...spots.map((s) => ({ id: s.id, x: s.x, z: s.z }))];
  // 출발점이 막힌 칸이면 가까운 빈 칸으로
  for (const s of starts) for (let rr = 0, a = 0; W.isBlocked(s.x, s.z) && rr < 6; a += 0.7, rr += 0.15) { s.x += Math.cos(a) * rr; s.z += Math.sin(a) * rr; }
  const walk = (s, k) => {
    const path = G.route.pathTo(spots, k, s.x, s.z), end = path[path.length - 1];
    const p = { x: s.x, z: s.z, y: T.getGroundHeight(s.x, s.z, (md.surfaceY(s.x, s.z) ?? 0) + 0.5) };
    let i = 1, best = Infinity, still = 0, n = 0;
    while (n++ < 30000) {
      if (Math.hypot(end[0] - p.x, end[1] - p.z) < 2.5) return { ok: true };
      while (i < path.length - 1 && Math.hypot(path[i][0] - p.x, path[i][1] - p.z) < 0.6) i++;
      let mx = path[i][0] - p.x, mz = path[i][1] - p.z; const L = Math.hypot(mx, mz) || 1; mx /= L; mz /= L;
      const st = 4.2 / 30, CW = J.clampWorld, bb = W.bounds, nx = CW ? CW(p.x + mx * st, p.z, bb).x : p.x + mx * st, nz = CW ? CW(p.x, p.z + mz * st, bb).z : p.z + mz * st, stuckNow = W.isBlocked(p.x, p.z); let y;
      if ((!W.isBlocked(nx, p.z) || stuckNow) && !bike(nx, p.z, p.y) && (y = T.canMove(p.x, p.z, p.y, nx, p.z)) != null) { p.x = nx; p.y = y; }
      if ((!W.isBlocked(p.x, nz) || stuckNow) && !bike(p.x, nz, p.y) && (y = T.canMove(p.x, p.z, p.y, p.x, nz)) != null) { p.z = nz; p.y = y; }
      const rem = Math.hypot(path[i][0] - p.x, path[i][1] - p.z) + (path.length - i) * 1000;
      if (rem < best - 0.03) { best = rem; still = 0; } else if (++still > 60) {
        const ax = p.x + mx * 0.3, az = p.z + mz * 0.3;
        return { ok: false, seg: [path[i - 1], path[i]].map((q) => q.map((v) => +v.toFixed(1))), i, n: path.length, at: [+p.x.toFixed(1), +p.z.toFixed(1), +p.y.toFixed(2)], blocked: W.isBlocked(ax, az), by: md.blockedBy(ax, az), canMove: T.canMove(p.x, p.z, p.y, ax, az), ground: +T.getGroundHeight(ax, az, p.y + 0.5).toFixed(2) };
      }
    }
    return { ok: false, at: [p.x, p.z], why: 'timeout' };
  };
  const res = [];
  for (const s of starts) for (let k = 0; k < spots.length; k++) { if (s.id === spots[k].id) continue; res.push({ from: s.id, to: spots[k].id, ...walk(s, k) }); }
  // 길 중간에서 다시 출발(골목 안 깃발 줄 앞 등): 게이트→각 목적지 길 위 12 m 마다
  const gate = starts[1];
  for (let k = 0; k < spots.length; k++) {
    const path = G.route.pathTo(spots, k, gate.x, gate.z);
    for (let i = 1, acc = 0, next = 12; i < path.length; i++) {
      const a = path[i - 1], b = path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (acc + L >= next) { const t = (next - acc) / L, s = { id: `mid${Math.round(next)}`, x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t }; if (!W.isBlocked(s.x, s.z)) res.push({ from: `gate+${Math.round(next)}m`, to: spots[k].id, ...walk(s, k) }); next += 12; }
      acc += L;
    }
  }
  // 깃발 줄·등 높이: 시장 서명 메시에서 깃발 색 삼각형·등 상자의 가장 낮은 점 − 그 자리 땅
  let sc = J.player; while (sc.parent) sc = sc.parent;
  const mesh = sc.getObjectByName('md-sig-namdaemun'); let low = Infinity, lowAt = null, nTop = 0;
  if (mesh) { const P = mesh.geometry.attributes.position, C = mesh.geometry.attributes.color; mesh.updateMatrixWorld(true);
    const red = (i) => C && Math.abs(C.getX(i) - 0.672) < 0.02 && Math.abs(C.getY(i) - 0.0212) < 0.004 && Math.abs(C.getZ(i) - 0.0212) < 0.004; // 등 #d62828 (선형)
    for (let i = 0; i < P.count; i++) { if (!red(i)) continue; const x = P.getX(i), y = P.getY(i), z = P.getZ(i), gh = T.getGroundHeight(x, z, y); if (gh == null || y - gh > 12) continue; nTop++; if (y - gh < low) { low = y - gh; lowAt = [Math.round(x), Math.round(z)]; } } }
  return { res, lantern: { n: nTop, lowest: +low.toFixed(2), at: lowAt } };
});
// ---- 실제 입력: KeyW(+Shift 달리기)를 누른 채 카메라 yaw 만 길 쪽으로 돌린다 → game.js 이동 코드(clampWorld·bikes·isBlocked·canMove) 그대로 ----
const keyRes = [];
const KEY_ROUTES = (process.env.KEY_ROUTES || 'kal177:kalguksu,gate:galchi,gate:glasses,gate:stationery').split(',');
await page.mouse.click(VW / 2, VH / 2);
for (const spec of KEY_ROUTES) {
  const [from, to] = spec.split(':');
  const ids = await page.evaluate(() => window.__jj.placeGuide.ui.guide.spots.map((s) => s.id));
  for (const id of to === '*' ? ids : [to]) {
    await page.evaluate(async ({ from, id }) => {
      const J = window.__jj, md = J.myeongdong, G = J.placeGuide, spots = G.ui.guide.spots, k = spots.findIndex((s) => s.id === id), A = G.ui.guide.anchors;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      let x = A.gate.x, z = A.gate.z;
      let P = G.route.pathTo(spots, k, x, z);
      if (from.startsWith('kal')) { // 칼국수까지 남은 거리 N m 지점(도훈 스크린샷 자리)
        const rem = +from.slice(3); let tot = 0; for (let i = 1; i < P.length; i++) tot += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
        let acc = 0; const at = tot - rem;
        for (let i = 1; i < P.length; i++) { const L = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (acc + L >= at) { const f = (at - acc) / L; x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f; z = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f; break; } acc += L; }
      }
      await J.teleport(x, z, md.surfaceY(x, z)); await wait(800); J.setMode?.('follow');
      P = G.route.pathTo(spots, k, J.player.position.x, J.player.position.z);
      window.__kw = { P, i: 1 };
      clearInterval(window.__kwT);
      window.__kwT = setInterval(() => { const w = window.__kw, p = J.player.position; while (w.i < w.P.length - 1 && Math.hypot(w.P[w.i][0] - p.x, w.P[w.i][1] - p.z) < 1.5) w.i++; const q = w.P[w.i]; J.cam.yaw = Math.atan2(-(q[0] - p.x), -(q[1] - p.z)); }, 30);
    }, { from, id });
    const run = !from.startsWith('kal'); // 도훈 자리는 걷기, 나머지는 달리기(같은 이동 코드, 빨리 끝남)
    if (run) await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    let ok = false, best = Infinity, still = 0, last = null;
    for (let t = 0; t < 240; t++) {
      await page.waitForTimeout(500);
      last = await page.evaluate(() => { const J = window.__jj, p = J.player.position, w = window.__kw; let rem = Math.hypot(w.P[w.i][0] - p.x, w.P[w.i][1] - p.z); for (let i = w.i + 1; i < w.P.length; i++) rem += Math.hypot(w.P[i][0] - w.P[i - 1][0], w.P[i][1] - w.P[i - 1][1]); const fx = -Math.sin(J.cam.yaw), fz = -Math.cos(J.cam.yaw); return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), rem: +rem.toFixed(1), by: J.myeongdong.blockedBy(p.x + fx * 0.3, p.z + fz * 0.3), wb: J.world.isBlocked(p.x + fx * 0.3, p.z + fz * 0.3), bike: !!J.bikes?.blocks?.(p.x + fx * 0.3, p.z + fz * 0.3, null, p.y), cm: J.terrain.canMove(p.x, p.z, p.y, p.x + fx * 0.3, p.z + fz * 0.3) != null, yaw: +J.cam.yaw.toFixed(2), sit: !!J.pose?.sit, afk: !!J.pose?.afk }; });
      if (last.rem < 3) { ok = true; break; }
      if (last.rem < best - 0.3) { best = last.rem; still = 0; } else if (++still > 8) break;
    }
    await page.keyboard.up('KeyW'); if (run) await page.keyboard.up('ShiftLeft');
    keyRes.push({ from, to: id, ok, ...last }); if (process.env.WALK_SHOW) console.log("key", from, id, ok, JSON.stringify(last), new Date().toISOString().slice(11, 19));
  }
}
await page.evaluate(() => clearInterval(window.__kwT));
await browser.close();
const fails = [];
const kbad = keyRes.filter((q) => !q.ok);
for (const q of kbad) console.log('key-stuck', JSON.stringify(q));
if (kbad.length) fails.push(`${kbad.length}/${keyRes.length} real-input (KeyW) walks blocked`);

if (r.err) fails.push(r.err);
const bad = (r.res || []).filter((q) => !q.ok);
for (const q of bad.slice(0, +(process.env.WALK_SHOW || 12))) console.log('stuck', JSON.stringify(q));
if (bad.length) fails.push(`${bad.length}/${r.res.length} guide walks blocked`);
if (r.lantern && r.lantern.n && r.lantern.lowest < 2.6) fails.push(`lantern low ${r.lantern.lowest} m at ${r.lantern.at}`);
if (errors.length) fails.push('console errors: ' + errors.slice(0, 3).join(' | '));
if (fails.length) { console.error('test-guide-walk FAIL:', fails.join('; ')); process.exit(1); }
console.log(`test-guide-walk ok — ${keyRes.length} real KeyW walks + ${r.res.length} controller walks (gate·NPC·board·8 spots → every spot, + restarts every 12 m along each route) all arrive; lanterns ${r.lantern.n} verts, lowest ${r.lantern.lowest} m above ground`);
