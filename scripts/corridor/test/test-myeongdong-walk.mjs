// [walk-sweep] 명동 보행 검사: 명동 상자 안 모든 OSM 길(명동길·명동8길·중앙로·골목·성당 길 …) 의 길 띠(가운데 선 ± 폭/2)를
//   0.5 m 격자로 깔고, 플레이어와 같은 판정(world.isBlocked(x,z) 기본 반경 + terrain.canMove 높이 단차)으로 스폰에서 채워 나간다.
//   - 끊김: 길을 1 m 마다 가로질러 봐서 폭 안에 닿는 칸이 하나도 없는 곳 (이유 = bld:<id> · street · station · cathedral · signature · corridor/namsan · step/pocket)
//   - 빈 곳: 통과 가능한데 스폰에서 닿지 않는 덩어리(≥ 4 m²) = "들어가지 않는 데". 둘레를 막은 것을 센다.
//   node scripts/corridor/test/test-myeongdong-walk.mjs <vite port> [--json out.json]   (npm run myeongdong:walk — MYEONGDONG_WALK_PORT)
//   포트가 없으면 건너뛴다(myeongdong:test 안에서 서버 없이 돌 때). WALK_DUMP="x,z;…" = 그 둘레 글자 지도.
//   바깥 띠(apron) 바깥 가장자리는 명동 땅(남산 바닥 높이로 내려감)과 그 밖 0 m 바닥이 만나 단차가 있다 — 보고는 명동 상자(B) 안만.
//   허용: OSM 상 건물 안을 지나는 길(통로·아케이드) 끊김은 'bld:' 로 따로 센다. 그 외 끊김 0 · 빈 곳 0 이어야 통과.
import fs from 'node:fs';
import { chromium } from 'playwright';
const PORT = /^\d+$/.test(process.argv[2] || '') ? process.argv[2] : process.env.MYEONGDONG_WALK_PORT;
if (!PORT) { console.log('test-myeongdong-walk: skipped (no vite port — npm run myeongdong:walk with MYEONGDONG_WALK_PORT=5231)'); process.exit(0); }
const outJson = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/?ws=mock&at=myeongdong&hour=20&weather=clear&shot=1&noticePopup=0&controlscard=0&mdstalls=all`);
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.myeongdong?.ready, null, { timeout: 300000 });
await page.waitForTimeout(6000);
const DUMP = (process.env.WALK_DUMP || '').split(';').filter(Boolean).map((t) => t.split(',').map(Number));
const res = await page.evaluate(async (DUMP) => {
  const J = window.__jj, md = J.myeongdong, W = J.world, T = J.terrain, MB = md.bounds;
  try { await J.corridor.ensureNear?.((MB.x0 + MB.x1) / 2, MB.z1, { urgent: true }); } catch {}
  const t0 = performance.now();
  // 채우기는 명동 상자 + 바깥 띠까지 (가장자리 빈 곳이 바깥 길로 이어지는지 보려고). 보고는 명동 상자 안만.
  // 바깥 띠(apron, build-myeongdong.py APRON)까지 + 10 m, 남쪽은 남산 쪽 60 m
  const B = { x0: -11540, z0: -22310, x1: -10445, z1: MB.z1 + 60 };
  const inMB = (x, z) => x > MB.x0 + 1 && x < MB.x1 - 1 && z > MB.z0 + 1 && z < MB.z1 - 1;
  const inB = (x, z) => x > B.x0 + 1 && x < B.x1 - 1 && z > B.z0 + 1 && z < B.z1 - 1;
  const WALK = new Set(['footway', 'pedestrian', 'living_street', 'residential', 'service', 'path', 'steps', 'unclassified', 'tertiary', 'secondary', 'primary', 'corridor', 'track', 'cycleway']);
  const ways = md.walkWays().filter((w) => WALK.has(w.k));
  // 1) 길 띠(가운데 선 ± 폭/2) 를 0.5 m 격자로
  const G = 0.5, nx = Math.ceil((B.x1 - B.x0) / G), nz = Math.ceil((B.z1 - B.z0) / G);
  const idx = (i, j) => j * nx + i, cx = (i) => B.x0 + (i + 0.5) * G, cz = (j) => B.z0 + (j + 0.5) * G;
  // 1 = 길 띠, 2 = 띠 바깥 HALO m (OSM 선이 실제 골목에서 1–2 m 비껴 그려진 곳도 플레이어처럼 지나가게 — 채우기만 쓰고 보고는 띠만)
  const HALO = 4;
  const mask = new Uint8Array(nx * nz);
  for (const w of ways) {
    const hw0 = Math.max(1.2, (w.w || 4) / 2), hw = hw0 + HALO;
    for (let k = 1; k < w.pts.length; k++) {
      const [ax, az] = w.pts[k - 1], [bx, bz] = w.pts[k], L = Math.hypot(bx - ax, bz - az) || 1e-6;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw - B.x0) / G)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + hw - B.x0) / G));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - hw - B.z0) / G)), j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz) + hw - B.z0) / G));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = cx(i), z = cz(j); if (!inB(x, z)) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L)));
        const d = Math.hypot(ax + (bx - ax) * t - x, az + (bz - az) * t - z), k = idx(i, j);
        if (d <= hw0) mask[k] = 1; else if (d <= hw && !mask[k]) mask[k] = 2;
      }
    }
  }
  // 2) 통과 가능 칸 + 높이
  const free = new Uint8Array(nx * nz), Y = new Float32Array(nx * nz); let nMask = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = idx(i, j); if (!mask[k]) continue; if (mask[k] === 1) nMask++; const x = cx(i), z = cz(j); free[k] = W.isBlocked(x, z) ? 0 : 1; Y[k] = T.getGroundHeight(x, z, 60); }
  // 3) 스폰에서 4방향 채우기 (terrain.canMove 로 단차 판정)
  const sp = md.spawn; let si = Math.floor((sp.x - B.x0) / G), sj = Math.floor((sp.z - B.z0) / G);
  let seed = -1; for (let r = 0; r < 40 && seed < 0; r++) for (let dj = -r; dj <= r && seed < 0; dj++) for (let di = -r; di <= r; di++) { const i = si + di, j = sj + dj; if (i >= 0 && j >= 0 && i < nx && j < nz && free[idx(i, j)]) { seed = idx(i, j); break; } }
  const reach = new Uint8Array(nx * nz); const q = [seed]; reach[seed] = 1; let steps = 0; const stepAt = [];
  Y[seed] = T.getGroundHeight(cx(seed % nx), cz((seed - seed % nx) / nx), sp.y ?? 60);
  // 8방향: 대각선은 두 칸 사이 가운데 점도 비어 있어야 (플레이어는 연속으로 움직인다 — 비스듬한 좁은 골목)
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const diagOk = (i, j, a, b) => (i === a || j === b) || !W.isBlocked((cx(i) + cx(a)) / 2, (cz(j) + cz(b)) / 2);
  // 길 띠 밖 땅(빈터·마당·OSM 에 없는 통로)도 플레이어는 걷는다 → 필요할 때만 계산하는 '바깥 칸'
  const freeAt = (k) => { if (free[k] === 0 && !mask[k]) { const i = k % nx, j = (k - i) / nx; free[k] = W.isBlocked(cx(i), cz(j)) ? 3 : 4; } return free[k] === 1 || free[k] === 4; };
  while (q.length) {
    const k = q.pop(), i = k % nx, j = (k - i) / nx;
    for (const [di, dj] of N8) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const n = idx(a, b); if (reach[n] || !free[n] || free[n] > 1) continue;
      if (!diagOk(i, j, a, b)) continue;
      // 플레이어처럼 실제 높이를 이어 간다 (canMove 가 돌려준 새 높이)
      const ny = T.canMove ? T.canMove(cx(i), cz(j), Y[k], cx(a), cz(b)) : Y[n];
      if (ny == null) { steps++; if (stepAt.length < 4000) stepAt.push([cx(a), cz(b), +Y[k].toFixed(2), +T.getGroundHeight(cx(a), cz(b), Y[k]).toFixed(2), +md.heightAt(cx(i), cz(j)).toFixed(2), +md.heightAt(cx(a), cz(b)).toFixed(2)]); continue; }
      Y[n] = ny; reach[n] = 1; q.push(n);
    }
  }
  // 빈 곳이 길 띠 밖 땅으로 닿는 칸까지 이어지면(≤ 80 m) 빈 곳이 아니다 — 닿음으로 칠한다
  const escapes = (cells) => {
    if (!cells.length) return false;
    const k0 = cells[0], X0 = cx(k0 % nx), Z0 = cz((k0 - k0 % nx) / nx);
    const vis = new Map(); const st = []; for (const k of cells) { vis.set(k, Y[k] || T.getGroundHeight(cx(k % nx), cz((k - k % nx) / nx), 60)); st.push(k); }
    let found = false, guard = 0;
    while (st.length && !found && guard++ < 400000) {
      const k = st.pop(), i = k % nx, j = (k - i) / nx, y = vis.get(k);
      for (const [di, dj] of N8) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const m = idx(a, b); if (vis.has(m)) continue;
        if (Math.abs(cx(a) - X0) > 80 || Math.abs(cz(b) - Z0) > 80) continue;
        if (!freeAt(m) || !diagOk(i, j, a, b)) continue;
        const ny = T.canMove(cx(i), cz(j), y, cx(a), cz(b)); if (ny == null) continue;
        if (reach[m]) { found = true; break; }
        vis.set(m, ny); st.push(m);
      }
    }
    if (found) for (const k of vis.keys()) if (mask[k] === 1) { reach[k] = 1; escaped++; }
    return found;
  };
  let escaped = 0;
  const seen = new Uint8Array(nx * nz), pockets = [];
  for (let k0 = 0; k0 < nx * nz; k0++) {
    if (free[k0] !== 1 || reach[k0] || seen[k0]) continue;
    const st = [k0]; seen[k0] = 1; let n = 0, sx = 0, sz = 0; const cells = [];
    while (st.length) { const k = st.pop(), i = k % nx, j = (k - i) / nx; if (mask[k] === 1) { n++; sx += cx(i); sz += cz(j); if (cells.length < 2000) cells.push(k); } for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const m = idx(a, b); if (free[m] === 1 && !reach[m] && !seen[m]) { seen[m] = 1; st.push(m); } } }
    if (n * G * G >= 4 && inMB(sx / n, sz / n) && !escapes(cells)) { // 띠 칸 면적만 센다
      // 둘레의 막는 것
      const tally = {}; for (const k of cells) { const i = k % nx, j = (k - i) / nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const m = idx(a, b); if (mask[m] && (free[m] === 0 || free[m] === 3)) { const r = (md.blockedBy(cx(a), cz(b), 0.35) || (J.namsan?.isBlocked?.(cx(a), cz(b), 0.35) ? 'namsan' : 'corridor')).split(':')[0]; tally[r] = (tally[r] || 0) + 1; } else if (mask[m] && reach[m]) tally.step = (tally.step || 0) + 1; } }
      pockets.push({ x: sx / n, z: sz / n, m2: n * G * G, walls: tally });
    }
  }
  // 5) 길마다 (빈 곳 탈출로 닿음 칠한 뒤) 1 m 간격 단면: 단면(폭 안) 에 닿는 칸이 하나도 없으면 '끊김'. 이유 = 단면 가운데를 막는 것
  const why = (x, z) => md.blockedBy(x, z, 0.35) || md.blockedBy(x, z, 0.45) || (J.namsan?.isBlocked?.(x, z, 0.35) ? 'namsan' : W.isBlocked(x, z) ? 'corridor' : 'step/pocket');
  const runs = []; let stations = 0;
  for (const w of ways) {
    const hw = Math.max(1.2, (w.w || 4) / 2); let cur = null;
    const flush = () => { if (cur) { runs.push(cur); cur = null; } };
    for (let k = 1; k < w.pts.length; k++) {
      const [ax, az] = w.pts[k - 1], [bx, bz] = w.pts[k], L = Math.hypot(bx - ax, bz - az) || 1e-6, tx = (bx - ax) / L, tz = (bz - az) / L;
      for (let s = 0; s < L; s += 1) {
        const x = ax + tx * s, z = az + tz * s; if (!inMB(x, z)) { flush(); continue; }
        stations++;
        let ok = false, blk = null;
        for (let o = -hw; o <= hw + 1e-6; o += 0.25) { const px = x - tz * o, pz = z + tx * o, i = Math.floor((px - B.x0) / G), j = Math.floor((pz - B.z0) / G); if (i < 0 || j < 0 || i >= nx || j >= nz) continue; const n = idx(i, j); if (reach[n]) { ok = true; break; } }
        if (!ok) {
          blk = why(x, z);
          if (cur && cur.why === blk && Math.hypot(x - cur.x1, z - cur.z1) < 1.6) { cur.x1 = x; cur.z1 = z; cur.n++; }
          else { flush(); cur = { way: w.id, name: w.n || '', k: w.k, w: w.w, why: blk, x0: x, z0: z, x1: x, z1: z, n: 1 }; }
        } else flush();
      }
    }
    flush();
  }
  // 5) 길 띠 안의 '들어갈 수 없는 빈 곳'(통과 가능하지만 스폰에서 닿지 않는 칸 덩어리) ≥ 4 m²
  pockets.sort((a, b) => b.m2 - a.m2);
  let nReach = 0, nFree = 0; for (let k = 0; k < nx * nz; k++) { if (mask[k] !== 1) continue; if (free[k]) nFree++; if (reach[k]) nReach++; }
  // 디버그: WALK_DUMP="x,z;x,z" → 그 둘레 40 m 를 1 m 글자 지도로 (r 닿음 · . 통과가능·못닿음 · # 막힘 · 공백 길 아님)
  const dumps = DUMP.map(([X, Z]) => { const rows = []; for (let j = -40; j <= 40; j += 2) { let s = ''; for (let i = -40; i <= 40; i += 2) { const a = Math.floor((X + i * 0.5 - B.x0) / G), b = Math.floor((Z + j * 0.5 - B.z0) / G); const k = idx(a, b); s += !mask[k] ? ' ' : !free[k] ? '#' : reach[k] ? 'r' : '.'; } rows.push(s); } return { X, Z, rows }; });
  return { escaped, dumps, stepAt, ways: ways.length, stations, cells: nMask, free: nFree, reached: nReach, steps, runs, pockets, ms: Math.round(performance.now() - t0) };
}, DUMP);
for (const d of res.dumps) console.log(`map @(${d.X},${d.Z}) 1 m/char, x→ z↓\n` + d.rows.join('\n'));
const r = (v) => +v.toFixed(1);
const by = {}; for (const q of res.runs) { const k = q.why.split(':')[0]; by[k] = (by[k] || 0) + q.n; }
const bad = res.runs.filter((q) => !q.why.startsWith('bld:'));
const viaBld = res.runs.filter((q) => q.why.startsWith('bld:'));
const pk = res.pockets;
console.log(`ways ${res.ways} · street-band cells ${res.cells} (0.5 m) · free ${res.free} · reachable from spawn ${res.reached} (${(100 * res.reached / Math.max(1, res.free)).toFixed(1)}%) · step-refusals ${res.steps} · band cells reached via off-band ground ${res.escaped} · ${res.ms} ms`);
console.log(`cut cross-sections (no reachable cell across the way's width): runs ${res.runs.length} (non-building ${bad.length}, OSM-way-through-building ${viaBld.length}) · metres by cause ${JSON.stringify(by)}`);
for (const q of bad.slice(0, 60)) console.log(`  CUT ${q.why.padEnd(10)} ${q.k.padEnd(11)} ${String(q.name).padEnd(10)} way ${q.way}  (${r(q.x0)},${r(q.z0)})→(${r(q.x1)},${r(q.z1)})  ${q.n} m`);
console.log(`unreachable free pockets ≥4 m² in street bands: ${pk.length}`);
for (const p of pk.slice(0, 40)) console.log(`  POCKET (${r(p.x)},${r(p.z)}) ${p.m2.toFixed(1)} m²  walls ${JSON.stringify(p.walls)}`);
if (outJson) fs.writeFileSync(outJson, JSON.stringify({ ...res, errors }, null, 1));
await browser.close();
const bigPockets = pk.filter((p) => p.m2 >= 4);
const fail = bad.length > 0 || bigPockets.length > 0 || errors.length > 0;
console.log(fail ? `test-myeongdong-walk: FAIL (${bad.length} cut runs, ${bigPockets.length} pockets, ${errors.length} console errors)` : 'test-myeongdong-walk: ok');
process.exit(fail ? 1 : 0);
