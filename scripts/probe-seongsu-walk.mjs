// [v4b] 성수 ↔ 북단 도시 바닥 ↔ 다리·한강공원 보행 확인. node scripts/probe-seongsu-walk.mjs PORT [OUT.json]
//   1) 선 따라 0.5 m 간격 정적 판정(섬 경계 · isBlocked · canMove 높이)  2) 실제 W 키 걷기 (위치 기록)
import { chromium } from 'playwright';
import fs from 'node:fs';
const [PORT = '5311', OUT = '/tmp/walk.json'] = process.argv.slice(2);
const LINES = JSON.parse(process.env.LINES || 'null') || [
  { name: '성수→북단(-5000, 강물 쪽: 막혀야 정상)', a: [-5000, -18900], b: [-5000, -18300] },
  { name: '성수→북단(-4200)', a: [-4200, -18850], b: [-4200, -18300] },
  { name: '성수→북단(-3950)', a: [-3950, -18850], b: [-3950, -18300] },
  { name: '성수→북단(-3600)', a: [-3600, -18850], b: [-3600, -18300] },
  { name: '성수→영동대교 북단', a: [-4420, -18900], b: [-4360, -18454] },
  { name: '성수→청담대교 북단', a: [-3800, -18850], b: [-3741, -18090] },
  { name: '북단→한강공원(-3900, 경사로 없음: 막힘 확인)', a: [-3900, -18400], b: [-3900, -17960] },
  { name: '성수→공원 경사로 x-4300', a: [-4300, -18700], b: [-4300, -17960] },
  { name: '성수→공원 경사로 x-3850', a: [-3850, -18850], b: [-3850, -17960] },
  { name: '성수→공원 경사로 x-3700', a: [-3700, -18850], b: [-3700, -17960] },
  { name: '성수→공원 경사로 x-3550', a: [-3550, -18850], b: [-3550, -17960] },
  { name: '성수대교 남행', a: [-6460, -18960], b: [-6489, -18830] },
];
const WALK = process.env.WALK !== '0';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/?ws=mock&at=seongsu&hour=14&weather=clear&shot=1&noticePopup=0&controlscard=0&bgm=0&subwayVoice=0&subwayRt=0`, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.seongsu?.ready, null, { timeout: 300000 });
await page.evaluate(() => window.__jj.corridor.ensureNear?.(-3900, -18200, { urgent: true }));
await page.waitForFunction(() => window.__jj?.hangang?.ready, null, { timeout: 300000 }); // 한강(합수부) 땅까지 지은 뒤
const res = [];
for (const L of LINES) {
  // 먼저 그쪽 땅을 짓게
  await page.evaluate(async (L) => { const J = window.__jj; await J.corridor.preload?.(L.b[0], L.b[1]); await J.corridor.ensureNear?.(L.b[0], L.b[1], { urgent: true }); }, L);
  const scan = await page.evaluate((L) => {
    const J = window.__jj, T = J.terrain, B = J.corridor.bounds, W = J.world;
    const inIsl = (x, z) => !B?.islands?.length || B.islands.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) || (B.corridors || []).some(() => false);
    const PTS = [L.a, ...(L.via || []), L.b]; let y = T.getGroundHeight(L.a[0], L.a[1], L.y0 ?? 1), firstStop = null; const samples = [];
    for (let sgi = 0; sgi < PTS.length - 1 && !firstStop; sgi++) { const [ax, az] = PTS[sgi], [bx, bz] = PTS[sgi + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
    for (let i = 1; i <= n; i++) {
      const x0 = ax + (bx - ax) * (i - 1) / n, z0 = az + (bz - az) * (i - 1) / n, x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      const isl = inIsl(x, z), blk = W.isBlocked(x, z, 0.35), ny = T.canMove(x0, z0, y, x, z);
      if (i % 40 === 0) samples.push([Math.round(x), Math.round(z), ny == null ? null : +ny.toFixed(2)]);
      const why = !isl ? 'outside-islands' : blk ? ('blocked:' + (J.corridor.blockedBy?.(x, z, 0.35) || J.seongsu?.blockedBy?.(x, z, 0.35) || 'world')) : ny == null ? `canMove-null(y ${y.toFixed(2)} → ground ${T.getGroundHeight(x, z, y).toFixed(2)}, grade ${T.grade?.(x, z)?.toFixed?.(2)})` : null;
      if (why) { const prof = []; for (let k = -6; k <= 6; k++) { const t = (i + k * 2) / n; const px = ax + (bx - ax) * t, pz = az + (bz - az) * t; prof.push(+T.getGroundHeight(px, pz, y).toFixed(2)); } firstStop = { at: [+x.toFixed(1), +z.toFixed(1)], why, prof1m: prof }; break; }
      y = ny;
    }
    }
    return { firstStop, endY: +y.toFixed(2), samples };
  }, L);
  let walk = null;
  if (WALK) {
    await page.evaluate((L) => { const J = window.__jj; J.setMode('follow'); const y = J.terrain.getGroundHeight(L.a[0], L.a[1], L.y0 ?? 1); J.teleport(L.a[0], L.a[1], y); const t0 = (L.via || [L.b])[0]; const yaw = Math.atan2(-(t0[0] - L.a[0]), -(t0[1] - L.a[1])); J.cam.yaw = yaw; J.player.rotation.y = yaw + Math.PI; }, L);
    await page.waitForTimeout(2500);
    await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); const trace = [], TG = [...(L.via || []), L.b]; let ti = 0, kSw = -9; const PT = [L.a, ...TG]; let dist = 0; for (let i = 1; i < PT.length; i++) dist += Math.hypot(PT[i][0] - PT[i - 1][0], PT[i][1] - PT[i - 1][1]);
    for (let k = 0; k < Math.min(+(process.env.MAXS || 70), Math.ceil(dist / 7) + 6); k++) { await page.waitForTimeout(2000); trace.push(await page.evaluate(() => { const p = window.__jj.player.position; return [+p.x.toFixed(1), +p.z.toFixed(1), +p.y.toFixed(2)]; })); const c = trace[trace.length - 1]; if (process.env.SHOTS && (k % 3 === 0)) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.SHOTS}/${res.length}-${String(k).padStart(2, '0')}.png` }); } if (ti < TG.length - 1 && Math.hypot(TG[ti][0] - c[0], TG[ti][1] - c[1]) < 5) { ti++; kSw = k; await page.evaluate((t) => { const J = window.__jj, p = J.player.position; const yaw = Math.atan2(-(t[0] - p.x), -(t[1] - p.z)); J.cam.yaw = yaw; J.player.rotation.y = yaw + Math.PI; }, TG[ti]); continue; } if (Math.hypot(L.b[0] - c[0], L.b[1] - c[1]) < 6) break; if (trace.length > 4 && k - kSw > 3) { const o = trace[trace.length - 4]; if (Math.hypot(c[0] - o[0], c[1] - o[1]) < 1 || Math.hypot(TG[ti][0] - o[0], TG[ti][1] - o[1]) - Math.hypot(TG[ti][0] - c[0], TG[ti][1] - c[1]) < 1.5) break; } }
    await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
    const last = trace[trace.length - 1], prev = trace[Math.max(0, trace.length - 4)];
    walk = { trace, end: last, stuck: Math.hypot(last[0] - prev[0], last[1] - prev[1]) < 1, toGo: +Math.hypot(L.b[0] - last[0], L.b[1] - last[1]).toFixed(1) };
  }
  res.push({ ...L, ...scan, walk }); console.log(L.name, JSON.stringify(scan.firstStop), walk ? `walk end ${walk.end} stuck=${walk.stuck} toGo=${walk.toGo}` : '');
}
const isl = await page.evaluate(() => window.__jj.corridor.bounds.islands?.map((b) => [b.x0, b.z0, b.x1, b.z1].map(Math.round)));
const ramps = await page.evaluate(() => { const R = window.__jj.hangang?.hap?.northRamps?.map((r) => [r.x, r.z0, r.z1]); let sc = window.__jj.player; while (sc.parent) sc = sc.parent; const m = sc.getObjectByName('hangang-north-ramps'); if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return { R, tris: m.geometry.attributes.position.count / 3, box: [b.min.x, b.min.z, b.max.x, b.max.z].map(Math.round) }; }); console.log('ramps', JSON.stringify(ramps));
fs.writeFileSync(OUT, JSON.stringify({ res, islands: isl, errors }, null, 1)); console.log('islands', JSON.stringify(isl)); console.log('errors', errors.length);
await browser.close();
