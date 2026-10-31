// [bus-fix] 220 탑승 e2e(엄격): npm run ride:e2e
//   정자역에서 220 을 양방향(북행 path5 → 코리더 102, 남행 path10 → 코리더 104)으로 타고 정자↔코리더 경계를 넘는다.
//   매 샘플(ff 0.2초 + 실제 프레임 1개)마다:
//     - 차 방향 vs 도로 접선 < 20°(차 길이 ±6m 안 접선 기준, 교차로 회전 중엔 이웃 접선 사이면 OK)  - matrixWorld 행렬식 > 0, 위쪽 벡터 ≈ +Y
//     - 한 샘플 하강 ≤ 0.5m, 다리 상판 위에서 버스 Y ≥ 상판
//   탑승 끝: 정차 순서 = data/gbis_route_stations.json 220 순서(한 방향 안), 요금 1번·탑승 기록 1건.
//   그 밖: 탄천 다리(코리더 102 다리, 정자교) 위 다른 차(코리더 버스·차량, 정자 택시·경찰차) 높이 샘플,
//          다리 밑 둔치를 걷는 보행자는 둔치 높이 그대로.
//   ?bus=sim&ws=mock 만 씀(운영 presence 서버에 붙지 않음). E2E_URL 이 없으면 vite 를 빈 포트에 직접 띄움.
//   SHOTS=before|after(기본 after) → /workspace/bw-tancheon-shots/34-<tag>-*.png. E2E_SHOTS_ONLY=1 이면 단언 없이 기록만(수정 전 비교용)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const { chromium } = await import('playwright');
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TAG = process.env.SHOTS || 'after', ONLY = !!process.env.E2E_SHOTS_ONLY;
const SHOT_DIR = process.env.SHOT_DIR || '/workspace/bw-tancheon-shots';
const BAD_PORTS = new Set([4173, 4174, 4175, 4176, 8787, 8799]);
const freePort = (p) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(freePort(p + 1))); s.listen(p, '127.0.0.1', () => s.close(() => res(p))); });
let vite = null, BASE = process.env.E2E_URL;
if (!BASE) {
  let port = await freePort(5450); while (BAD_PORTS.has(port)) port = await freePort(port + 1);
  vite = spawn(process.execPath, [ROOT + 'node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }); // npx 를 거치지 않아 끝날 때 vite 까지 확실히 종료
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('vite 시작 시간 초과')), 60000); vite.stdout.on('data', (d) => { if (/Local:/.test(String(d))) { clearTimeout(t); res(); } }); vite.on('exit', (c) => rej(new Error('vite 종료 ' + c))); });
  BASE = `http://127.0.0.1:${port}/`;
}
const stopVite = () => { if (vite && vite.exitCode == null) vite.kill('SIGTERM'); };
process.on('exit', stopVite);
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

const GB = JSON.parse(fs.readFileSync(ROOT + 'data/gbis_route_stations.json', 'utf8')).routes.find((r) => r.ref === '220');
const norm = (s) => String(s || '').replace(/[\s().·]/g, '');
const GBN = GB.stations.map((s) => norm(s.name)), TURN = GB.turnSeq - 1; // TURN: 회차 정류장 인덱스(두 방향 모두에 속함)

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(BASE + '?enter=1&name=e2e&bus=sim&ws=mock&rideSfx=0&rideVoice=0');
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForTimeout(2000);
await page.evaluate(() => document.getElementById('lobby-go').click());
await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
await page.waitForFunction(() => window.__jj.transit?.rideSim && window.__jj.corridor?.life?.buses, null, { timeout: 180000 });
await page.waitForTimeout(1500);
const shot = (name) => page.screenshot({ path: `${SHOT_DIR}/34-${TAG}-${name}.png` });

// 페이지 안 도우미: 탑승 버스 샘플(월드 방향·행렬식·위쪽·접선·상판)
await page.evaluate(() => {
  const jj = window.__jj, R = jj.ride, T = jj.terrain;
  const nameOf = (P, i) => { const st = P.stops[i]; if (!st) return null; for (const bs of [jj.transit.rideSim, jj.corridor.life.buses]) { const s = bs?.stopById?.get(st.stop); if (s) return s.name; } return null; };
  const tan = (P, s) => { const { pts, cum } = P; s = Math.max(0, Math.min(P.L, s)); let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1]; return Math.atan2(dx, dz); };
  const at = (P, s) => { const { pts, cum } = P; s = Math.max(0, Math.min(P.L, s)); let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const L = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / L; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; };
  const ang = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) * 180 / Math.PI;
  window.__e2e = {
    nameOf,
    snap() {
      const r = R.ride; if (!r || r.mode !== 'bus') return null;
      const m = r.mesh; m.updateMatrixWorld(true);
      const e = m.matrixWorld.elements;
      const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
      const det = e[0] * (e[5] * e[10] - e[6] * e[9]) - e[4] * (e[1] * e[10] - e[2] * e[9]) + e[8] * (e[1] * e[6] - e[2] * e[5]);
      const wyaw = Math.atan2(e[8], e[10]), b = r.b, P = r.P;
      // 도로 접선: 차 길이(±6m) 안의 접선들. 꺾이는 교차로에서는 이웃 접선 사이(회전 중) 방향이면 0, 아니면 가장 가까운 접선과의 각
      let herr = 180;
      for (let k = -12; k < 12; k++) {
        const t0 = tan(P, b.s + k * 0.5), t1 = tan(P, b.s + (k + 1) * 0.5), span = ang(t0, t1);
        const e0 = ang(wyaw, t0), e1 = ang(wyaw, t1);
        herr = Math.min(herr, e0, e1, span < 120 && Math.abs(e0 + e1 - span) < 0.01 ? 0 : 180);
      }
      const x = e[12], y = e[13], z = e[14], d = T.deckAt?.(x, z);
      return { path: r.path, legs: r.legs || 1, s: b.s, L: P.L, x, y, z, herr, det: det / (sx * sy * sz), upY: e[5] / sy, deckH: d && d.h > -0.05 ? d.h : null, road: d?.road?.n || d?.road?.k || null,
        dwell: !!r.dwell, stopIdx: b.stopIdx, stop: r.dwell ? nameOf(P, b.stopIdx) : null };
    },
  };
});

async function ride220(pathId, label, legStops) {
  const setup = await page.evaluate((PATH) => {
    const jj = window.__jj, J = jj.transit.rideSim;
    const P = J.sim.paths.find((p) => p.id === PATH);
    const k = P.stops.findIndex((st) => /정자역/.test(J.stopById.get(st.stop)?.name)), st = P.stops[k], stop = J.stopById.get(st.stop);
    J.sim.buses = J.sim.buses.filter((b) => !(b.P === P && Math.abs(b.s - st.s) < 150));
    const b = J.sim._spawn(P, Math.max(0.01, st.s - 70));
    jj.teleport(stop._pos.x, stop._pos.z);
    return { k, busId: b.id, ref: P.ref, at: { x: stop._pos.x, z: stop._pos.z }, charges: jj.ride.stats.charges.length, logs: jj.ride.log.list({ limit: 1e4 }).length };
  }, pathId);
  assert.equal(setup.ref, '220');
  for (let i = 0; i < 300; i++) {
    const ok = await page.evaluate(({ busId, k }) => { const R = window.__jj.ride; R.debug.ff(0.3, () => { const b = R.debug.bus(busId, true); return b && b.state === 'dwell' && b.stopIdx === k; }); const b = R.debug.bus(busId, true); if (b?.state === 'dwell') b.dwell = Math.max(b.dwell, 8); return b?.state === 'dwell' && b.stopIdx === k; }, setup);
    if (ok) break;
  }
  await page.evaluate(({ busId, at }) => { const jj = window.__jj, b = jj.ride.debug.bus(busId, true), q = b._q || { x: at.x, z: at.z }; const sp = jj.corridor.freeSpot((q.x + at.x) / 2, (q.z + at.z) / 2); jj.teleport(sp.x, sp.z); }, setup);
  await page.waitForTimeout(1200);
  await page.keyboard.press('e'); await page.waitForTimeout(1200);
  const st0 = await page.evaluate(() => window.__jj.ride.debug.state());
  assert.equal(st0.mode, 'bus', `${label}: 탑승 실패`);
  if (st0.cam === '1p') await page.evaluate(() => window.__jj.ride.toggleCam());
  const res = { label, n: 0, maxHerr: 0, maxDrop: 0, minDet: 1, minUp: 1, deckN: 0, minDeckGap: Infinity, stops: [], transfers: 0, bridges: new Set() };
  let prev = null, shotT = false, shotB = false, shotD = false, shotS = false, belled = false;
  for (let i = 0; i < 4000; i++) {
    const r = await page.evaluate(() => new Promise((ok) => { window.__jj.ride.debug.ff(0.2); requestAnimationFrame(() => ok(window.__e2e.snap())); }));
    if (!r) break;
    res.n++;
    res.maxHerr = Math.max(res.maxHerr, r.herr); res.minDet = Math.min(res.minDet, r.det); res.minUp = Math.min(res.minUp, r.upY);
    if (r.herr >= 20) fails.push(`${label}: 방향 오차 ${r.herr.toFixed(1)}° @path ${r.path} s ${r.s.toFixed(1)}`);
    if (!(r.det > 0) || r.upY < 0.98) fails.push(`${label}: 행렬 det ${r.det.toFixed(3)} up ${r.upY.toFixed(3)} @path ${r.path}`);
    if (r.deckH != null) { res.deckN++; res.bridges.add(r.road); res.minDeckGap = Math.min(res.minDeckGap, r.y - r.deckH); if (r.y < r.deckH - 0.01) fails.push(`${label}: 상판 아래 y ${r.y.toFixed(2)} < ${r.deckH} (${r.road}) @(${r.x.toFixed(0)},${r.z.toFixed(0)})`); }
    if (prev) {
      const drop = prev.y - r.y; res.maxDrop = Math.max(res.maxDrop, drop);
      if (drop > 0.5) fails.push(`${label}: 한 샘플 하강 ${drop.toFixed(2)}m @(${r.x.toFixed(0)},${r.z.toFixed(0)})`);
      if (r.path !== prev.path) { res.transfers++; if (!shotT) { shotT = true; await page.waitForTimeout(500); await shot(`${label}-transfer`); } }
    }
    if (r.deckH != null && !shotB && prev && prev.deckH != null) { shotB = true; await page.waitForTimeout(400); await shot(`${label}-bridge`); }
    if (!shotD && r.y < -1.5) { shotD = true; await page.waitForTimeout(400); await shot(`${label}-dip`); }
    if (!shotS && r.herr > 45) { shotS = true; await page.waitForTimeout(400); await shot(`${label}-sideways`); }
    if (r.dwell && r.stop && (!res.stops.length || res.stops.at(-1).key !== r.path + ':' + r.stopIdx)) res.stops.push({ key: r.path + ':' + r.stopIdx, name: r.stop });
    // 경계를 넘은 뒤 legStops 개 정류장을 지나면 벨 → 다음 정류장에서 하차(종점·지도 끝 동작은 이번 범위 밖)
    if (!belled && !r.dwell && r.legs >= 2 && res.stops.filter((x) => !x.key.startsWith('9')).length >= legStops) { belled = true; await page.evaluate(() => window.__jj.ride.handleE()); }
    prev = r;
  }
  await page.waitForTimeout(800);
  await shot(`${label}-end`);
  const after = await page.evaluate(() => ({ st: window.__jj.ride.debug.state(), charges: window.__jj.ride.stats.charges.length, logs: window.__jj.ride.log.list({ limit: 1e4 }), y: window.__jj.player.position.y }));
  res.charges = after.charges - setup.charges; res.logs = after.logs.length - setup.logs; res.lastLog = after.logs[0];
  // GBIS 순서: 정차 이름이 한 방향 안에서 순서대로
  const dir = pathId === 5 ? [0, TURN] : [TURN, GBN.length - 1];
  let gi = dir[0], ok = true; const seq = [];
  for (const s of res.stops) { const n = norm(s.name); let j = gi; while (j <= dir[1] && GBN[j] !== n) j++; if (j > dir[1]) { ok = false; seq.push(`${s.name}✗`); } else { seq.push(`${s.name}#${j}`); gi = j + 1; } }
  res.order = { ok, seq };
  res.bridges = [...res.bridges];
  return res;
}

// 다른 차들: 다리 근처로 가서 실제 프레임마다 높이 기록
async function sampleTraffic(label, x, z, sec) {
  await page.evaluate(({ x, z }) => window.__jj.teleport(x, z), { x, z });
  await page.waitForTimeout(1500);
  const out = await page.evaluate((sec) => new Promise((done) => {
    const jj = window.__jj, T = jj.terrain, life = jj.corridor.life;
    const groups = () => [
      ...(life?.buses?.group?.children || []).filter((m) => m.visible).map((m) => ['corridor-bus', m]),
      ...(life?.traffic?.cars?.list || []).map((t) => ['corridor-car', t.mesh]),
      ...(jj.taxis?.list || []).map((t) => ['taxi', t.mesh]),
      ...(jj.police?.list || []).map((c) => ['police', c.mesh]),
    ].filter(([, m]) => m && m.visible !== false);
    const last = new Map(), st = { samples: 0, onDeck: 0, vehiclesOnDeck: new Set(), kinds: {}, maxDrop: 0, bad: [] };
    const t0 = performance.now();
    const tick = () => {
      for (const [kind, m] of groups()) {
        const p = m.position, d = T.deckAt?.(p.x, p.z), deck = d && d.h > -0.05 ? d.h : null, prev = last.get(m);
        st.samples++;
        if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < 6) { // 재생성(순간이동) 제외
          const drop = prev.y - p.y; st.maxDrop = Math.max(st.maxDrop, drop);
          if (drop > 0.5) st.bad.push(`${kind} 하강 ${drop.toFixed(2)} @(${p.x.toFixed(0)},${p.z.toFixed(0)})`);
          if (deck != null && prev.y >= deck - 0.6 && p.y < deck - 0.05) st.bad.push(`${kind} 상판 아래 ${p.y.toFixed(2)} @(${p.x.toFixed(0)},${p.z.toFixed(0)})`);
        }
        if (deck != null && p.y >= deck - 0.05) { st.onDeck++; st.vehiclesOnDeck.add(m.uuid); st.kinds[kind] = (st.kinds[kind] || 0) + 1; }
        last.set(m, { x: p.x, y: p.y, z: p.z });
      }
      if (performance.now() - t0 < sec * 1000) requestAnimationFrame(tick);
      else done({ ...st, vehiclesOnDeck: st.vehiclesOnDeck.size, bad: st.bad.slice(0, 10), nBad: st.bad.length });
    };
    requestAnimationFrame(tick);
  }), sec);
  await shot(`traffic-${label}`);
  return out;
}

// 보행자: 다리 밑 둔치
async function pedestrianUnder() {
  return page.evaluate(async () => {
    const jj = window.__jj, T = jj.terrain, FLOOR = T.params.FLOOR;
    let spot = null;
    for (const d of T.decks) {
      if (!(d.h > -0.05) || !d.road || !/^(primary|secondary|tertiary)/.test(d.road.k)) continue;
      for (let t = 0.3; t <= 0.7 && !spot; t += 0.05) { const x = d.ax + (d.bx - d.ax) * t, z = d.az + (d.bz - d.az) * t; if (Math.abs(T.baseHeight(x, z) - FLOOR) < 0.01 && Math.hypot(x, z + 680) < 400) spot = { x, z, road: d.road.n || d.road.k, h: d.h }; }
      if (spot) break;
    }
    if (!spot) return null;
    jj.teleport(spot.x, spot.z, FLOOR);
    await new Promise((r) => setTimeout(r, 1500));
    const y0 = jj.player.position.y;
    return { ...spot, FLOOR, y0 };
  });
}

const north = await ride220(5, 'north', 1);
console.log('[north]', JSON.stringify({ ...north, stops: undefined }));
const south = await ride220(10, 'south', 6);
console.log('[south]', JSON.stringify({ ...south, stops: undefined }));
const trA = await sampleTraffic('corridor-102-bridge', 12, -690, 25);
console.log('[traffic 102 다리]', JSON.stringify(trA));
const trB = await sampleTraffic('jeongja-bridge', 57, -232, 20);
console.log('[traffic 정자교]', JSON.stringify(trB));
const ped = await pedestrianUnder();
let pedAfter = null;
if (ped) { await page.keyboard.down('w'); await page.waitForTimeout(1200); await page.keyboard.up('w'); await page.waitForTimeout(500); pedAfter = await page.evaluate(() => window.__jj.player.position.y); await shot('pedestrian-under-bridge'); }
console.log('[pedestrian]', JSON.stringify({ ...ped, yAfterWalk: pedAfter }));
console.log('page errors', errs.length, errs.slice(0, 3));
await browser.close();
stopVite();

if (!ONLY) {
  for (const r of [north, south]) {
    check(r.n > 100, `${r.label}: 샘플 ${r.n}`);
    check(r.transfers === 1, `${r.label}: 경계 이어 타기 ${r.transfers}번`);
    check(r.charges === 1, `${r.label}: 요금 ${r.charges}번`);
    check(r.logs === 1, `${r.label}: 탑승 기록 ${r.logs}건`);
    check(r.order.ok && r.stops.length >= 2, `${r.label}: 정차 순서 ${r.order.seq.join(' → ')}`);
  }
  check(north.deckN > 0 || south.deckN > 0, '탄 버스가 다리를 한 번도 안 건넘');
  for (const t of [trA, trB]) { check(t.nBad === 0, `다른 차: ${t.bad.join(' / ')}`); }
  check(trA.onDeck + trB.onDeck > 0, '다리 위 다른 차 샘플 없음');
  check(ped && ped.y0 < ped.FLOOR + 0.6 && pedAfter < ped.FLOOR + 0.6, `보행자 다리 밑: ${JSON.stringify(ped)} → ${pedAfter}`);
  check(errs.length === 0, `페이지 오류 ${errs.slice(0, 3).join(' / ')}`);
  if (fails.length) { console.error('FAIL\n  ' + [...new Set(fails)].slice(0, 40).join('\n  ')); process.exit(1); }
  console.log(`e2e-ride-220: ok — 북행 ${north.n}샘플 최대 방향오차 ${north.maxHerr.toFixed(2)}° 최대 하강 ${north.maxDrop.toFixed(3)}m 상판 ${north.deckN}샘플 / 남행 ${south.n}샘플 ${south.maxHerr.toFixed(2)}° ${south.maxDrop.toFixed(3)}m 상판 ${south.deckN}샘플`);
} else {
  console.log('기록만(E2E_SHOTS_ONLY) — 실패 후보', fails.length, [...new Set(fails)].slice(0, 8));
}
