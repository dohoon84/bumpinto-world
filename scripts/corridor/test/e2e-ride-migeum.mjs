// [migeum-bus] 미금 버스 탑승 e2e: npm run ride:e2e:migeum
//   ?bus=sim · ?ws=mock. 미금을 지나는 노선을 양방향으로 탄다(기본 G8110, 7007-1 — E2E_REFS=G8110,7007-1).
//     북쪽 방향(dir 0): 미금 첫 정류장(코리더) 탑승 → 미금 정류장들 → 정자 bbox 경계 이어 타기 → 정자 첫 정류장에서 하차(E)
//     남쪽 방향(dir 1): 정자 마지막 정류장 탑승 → 경계 이어 타기 → 미금 정류장들 → 게임 범위 끝 종점 하차
//   매 샘플: 차 방향 vs 도로 접선 < 20°, 행렬식 > 0·위쪽 ≈ +Y, 한 샘플 하강 ≤ 0.5m, 상판 위 Y ≥ 상판 (e2e-ride-8110 과 같은 기준)
//   정차 기록은 버스가 그 정류장 위치 ±6m 에 있을 때만(정차 끝 프레임의 다음 번호 오기록 방지).
//   E2E_URL 이 없으면 vite 를 4451 부터 빈 포트에 직접 띄움(4173-4176·5391·5392·8787·8799 제외). SHOT_DIR(기본 /workspace/bw-migeum-shots/bus) → ride-*.png
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const { chromium } = await import('playwright');
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SHOT_DIR = process.env.SHOT_DIR || '/workspace/bw-migeum-shots/bus';
const REFS = (process.env.E2E_REFS || 'G8110,7007-1').split(',');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const BAD_PORTS = new Set([4173, 4174, 4175, 4176, 5391, 5392, 8787, 8799]);
const freePort = (p) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(freePort(p + 1))); s.listen(p, '127.0.0.1', () => s.close(() => res(p))); });
let vite = null, BASE = process.env.E2E_URL;
if (!BASE) {
  let port = await freePort(4451); while (BAD_PORTS.has(port)) port = await freePort(port + 1);
  vite = spawn(process.execPath, [ROOT + 'node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('vite 시작 시간 초과')), 60000); vite.stdout.on('data', (d) => { if (/Local:/.test(String(d))) { clearTimeout(t); res(); } }); vite.on('exit', (c) => rej(new Error('vite 종료 ' + c))); });
  BASE = `http://127.0.0.1:${port}/`;
}
const stopVite = () => { if (vite && vite.exitCode == null) vite.kill('SIGTERM'); };
process.on('exit', stopVite);
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const norm = (s) => String(s || '').replace(/[\s().·]/g, '');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(BASE + '?enter=1&name=e2e&bus=sim&ws=mock&hour=14&weather=clear&rideSfx=0&rideVoice=0&noticePopup=0' + (process.env.E2E_QS || ''));
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForTimeout(2000);
await page.evaluate(() => document.getElementById('lobby-go').click());
await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
await page.waitForFunction(() => window.__jj.transit?.rideSim && window.__jj.corridor?.life?.buses, null, { timeout: 180000 });
await page.waitForTimeout(1500);
let SHOT_PRE = `${SHOT_DIR}/ride-`;
const shot = (name) => page.screenshot({ path: `${SHOT_PRE}${name}.png` });

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
      this.lastB = b; this.lastP = P; // 종점 자동 하차로 ride 가 끝난 뒤에도 마지막 버스 상태를 읽게
      // 도로 접선: 차 길이(±6m) 안의 접선들. 꺾이는 교차로에서는 이웃 접선 사이(회전 중) 방향이면 0, 아니면 가장 가까운 접선과의 각
      let herr = 180;
      for (let k = -12; k < 12; k++) {
        const t0 = tan(P, b.s + k * 0.5), t1 = tan(P, b.s + (k + 1) * 0.5), span = ang(t0, t1);
        const e0 = ang(wyaw, t0), e1 = ang(wyaw, t1);
        herr = Math.min(herr, e0, e1, span < 120 && Math.abs(e0 + e1 - span) < 0.01 ? 0 : 180);
      }
      const x = e[12], y = e[13], z = e[14], d = T.deckAt?.(x, z);
      return { path: r.path, legs: r.legs || 1, s: b.s, L: P.L, x, y, z, herr, det: det / (sx * sy * sz), upY: e[5] / sy, deckH: d && d.h > -0.05 ? d.h : null, road: d?.road?.n || d?.road?.k || null,
        dwell: !!r.dwell, stopIdx: b.stopIdx, stopS: P.stops[b.stopIdx]?.s ?? null, stop: r.dwell ? nameOf(P, b.stopIdx) : null };
    },
  };
});



// 탑승할 경로·정류장 고르기 + 기대 정차 순서
async function plan(ref, dir) {
  return page.evaluate(({ ref, dir }) => {
    const jj = window.__jj, J = jj.transit.rideSim, C = jj.corridor.life.buses, near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 8;
    const cps = C.sim.paths.filter((p) => p.ref === ref && p.dir === dir && p.migeumBus);
    if (!cps.length) return { err: `코리더 시뮬에 미금 ${ref} dir${dir} 없음` };
    const nm = (bs, P, i) => bs.stopById.get(P.stops[i].stop)?.name;
    if (dir === 0) { // 미금 → 정자: 정자 bbox 경계에서 끝나는 코리더 조각
      const P = cps.find((p) => J.sim.paths.some((q) => q.ref === ref && q.dir === dir && near(q.pts[0], p.pts.at(-1))));
      if (!P) return { err: `${ref} dir0 경계 이어지는 코리더 조각 없음` };
      const Q = J.sim.paths.find((q) => q.ref === ref && q.dir === dir && near(q.pts[0], P.pts.at(-1)));
      return { jz: false, path: P.id, k: 0, want: [...P.stops.map((_, i) => nm(C, P, i)), nm(J, Q, 0)], endSys: 'live' };
    }
    const P = cps.find((p) => J.sim.paths.some((q) => q.ref === ref && q.dir === dir && near(q.pts.at(-1), p.pts[0])));
    if (!P) return { err: `${ref} dir1 경계에서 시작하는 코리더 조각 없음` };
    const Q = J.sim.paths.find((q) => q.ref === ref && q.dir === dir && near(q.pts.at(-1), P.pts[0]));
    const k = Q.stops.length - 1;
    return { jz: true, path: Q.id, k, want: [nm(J, Q, k), ...P.stops.map((_, i) => nm(C, P, i))], endSys: 'corridor', end: (() => { const s = C.stopById.get(P.stops.at(-1).stop); return [s.x, s.z]; })() };
  }, { ref, dir });
}

async function ride(ref, dir) {
  SHOT_PRE = `${SHOT_DIR}/ride-${ref}-d${dir}-`;
  const pl = await plan(ref, dir); assert.ok(!pl.err, pl.err);
  // 탑승 정류장 근처로 먼저 옮겨 타일·정류장을 불러옴
  await page.evaluate(({ jz, path, k }) => { const jj = window.__jj, bs = jz ? jj.transit.rideSim : jj.corridor.life.buses, P = bs.sim.paths.find((p) => p.id === path), st = bs.stopById.get(P.stops[k].stop); jj.teleport(st._pos.x + 6, st._pos.z); }, pl);
  await page.waitForTimeout(6000);
  const setup = await page.evaluate(({ jz, path, k }) => {
    const jj = window.__jj, J = jz ? jj.transit.rideSim : jj.corridor.life.buses, P = J.sim.paths.find((p) => p.id === path), st = P.stops[k], stop = J.stopById.get(st.stop);
    J.sim.buses = J.sim.buses.filter((b) => !(b.P === P && Math.abs(b.s - st.s) < 150));
    const b = J.sim._spawn(P, Math.max(0.01, st.s - 70));
    jj.teleport(stop._pos.x, stop._pos.z);
    return { k, jz, busId: b.id, path: P.id, ref: P.ref, at: { x: stop._pos.x, z: stop._pos.z }, charges: jj.ride.stats.charges.length };
  }, pl);
  assert.equal(setup.ref, ref);
  for (let i = 0; i < 300; i++) {
    const ok = await page.evaluate(({ busId, k, jz }) => { const R = window.__jj.ride; R.debug.ff(0.3, () => { const b = R.debug.bus(busId, jz); return b && b.state === 'dwell' && b.stopIdx === k; }); const b = R.debug.bus(busId, jz); if (b?.state === 'dwell') b.dwell = Math.max(b.dwell, 8); return b?.state === 'dwell' && b.stopIdx === k; }, setup);
    if (ok) break;
  }
  await page.evaluate(({ busId, at, jz }) => { const jj = window.__jj, b = jj.ride.debug.bus(busId, jz), q = b._q || { x: at.x, z: at.z }; const sp = jj.corridor.freeSpot((q.x + at.x) / 2, (q.z + at.z) / 2); jj.teleport(sp.x, sp.z); }, setup);
  await page.waitForTimeout(1200);
  await shot('0-board');
  await page.keyboard.press('e'); await page.waitForTimeout(1200);
  const st0 = await page.evaluate(() => window.__jj.ride.debug.state());
  assert.equal(st0.mode, 'bus', `${ref} dir${dir} 탑승 실패`);
  if (st0.cam === '1p') await page.evaluate(() => window.__jj.ride.toggleCam());
  const res = { ref, dir, n: 0, maxHerr: 0, maxDrop: 0, minDet: 1, minUp: 1, deckN: 0, stops: [], transfers: 0, paths: new Set(), alight: null };
  let prev = null; const shotAt = new Set();
  const once = async (name) => { if (shotAt.has(name)) return; shotAt.add(name); await page.waitForTimeout(400); await shot(name); };
  const WANT = pl.want.map(norm);
  for (let i = 0; i < 6000; i++) {
    const r = await page.evaluate(() => new Promise((ok) => { window.__jj.ride.debug.ff(0.2); requestAnimationFrame(() => ok(window.__e2e.snap())); }));
    if (!r) {
      const fin = await page.evaluate(() => { const E = window.__e2e, b = E.lastB; return b && b.state === 'dwell' ? { path: E.lastP?.id, stopIdx: b.stopIdx, name: E.nameOf(E.lastP, b.stopIdx) } : null; });
      if (fin?.name && (!res.stops.length || res.stops.at(-1).key !== fin.path + ':' + fin.stopIdx)) res.stops.push({ key: fin.path + ':' + fin.stopIdx, name: fin.name, alight: 1 });
      res.alight = 'auto'; await once('3-end-of-line');
      break;
    }
    res.n++; res.paths.add(r.path);
    res.maxHerr = Math.max(res.maxHerr, r.herr); res.minDet = Math.min(res.minDet, r.det); res.minUp = Math.min(res.minUp, r.upY);
    if (r.herr >= 20) fails.push(`${ref}/${dir} 방향 오차 ${r.herr.toFixed(1)}° @path ${r.path} s ${r.s.toFixed(1)} (${r.x.toFixed(0)},${r.z.toFixed(0)})`);
    if (!(r.det > 0) || r.upY < 0.98) fails.push(`${ref}/${dir} 행렬 det ${r.det.toFixed(3)} up ${r.upY.toFixed(3)} @path ${r.path}`);
    if (r.deckH != null) { res.deckN++; if (r.y < r.deckH - 0.01) fails.push(`${ref}/${dir} 상판 아래 y ${r.y.toFixed(2)} < ${r.deckH} @(${r.x.toFixed(0)},${r.z.toFixed(0)})`); }
    if (prev) {
      const drop = prev.y - r.y; res.maxDrop = Math.max(res.maxDrop, drop);
      if (drop > 0.5) fails.push(`${ref}/${dir} 한 샘플 하강 ${drop.toFixed(2)}m @(${r.x.toFixed(0)},${r.z.toFixed(0)})`);
      if (r.path !== prev.path) { res.transfers++; await once('2-boundary'); }
    }
    if (r.z > 1700 && r.z < 1900 && !r.dwell) await once('1-migeum');
    if (r.dwell && r.stop && r.stopS != null && Math.abs(r.s - r.stopS) < 6 && (!res.stops.length || res.stops.at(-1).key !== r.path + ':' + r.stopIdx)) {
      res.stops.push({ key: r.path + ':' + r.stopIdx, name: r.stop, at: [Math.round(r.x), Math.round(r.z)] });
      if (/미금역/.test(r.stop)) await once('1-migeum-stop');
      if (dir === 0 && res.transfers >= 1 && norm(r.stop) === WANT.at(-1)) { // 정자 첫 정류장 → 하차
        await once('3-jeongja-stop');
        await page.keyboard.press('e'); await page.waitForTimeout(600); res.alight = 'E'; break;
      }
    }
    prev = r;
  }
  await page.waitForTimeout(800);
  await shot('4-after');
  const after = await page.evaluate(() => ({ st: window.__jj.ride.debug.state(), charges: window.__jj.ride.stats.charges.length, p: window.__jj.player.position }));
  res.charges = after.charges - setup.charges; res.end = { mode: after.st.mode, x: Math.round(after.p.x), z: Math.round(after.p.z) };
  let gi = 0, ok = true; const seq = [];
  for (const s of res.stops) { const nn = norm(s.name); let j = gi; while (j < WANT.length && WANT[j] !== nn) j++; if (j >= WANT.length) { ok = false; seq.push(`${s.name}✗`); } else { seq.push(`${s.name}#${j}`); gi = j + 1; } }
  res.order = { ok, seq, complete: gi === WANT.length, want: pl.want };
  res.paths = [...res.paths]; res.endWant = pl.end;
  return res;
}

const out = [];
for (const ref of REFS) for (const dir of [0, 1]) {
  const r = await ride(ref, dir); out.push(r);
  console.log(`[${ref} dir${dir}]`, JSON.stringify(r));
  check(r.n > 150, `${ref}/${dir} 샘플 ${r.n}`);
  check(r.transfers === 1, `${ref}/${dir} 경계 이어 타기 ${r.transfers}번`);
  check(r.charges === 1, `${ref}/${dir} 요금 ${r.charges}번`);
  check(r.order.ok && r.order.complete, `${ref}/${dir} 정차 순서 ${r.order.seq.join(' → ')} (기대 ${r.order.want.join(' → ')})`);
  check(r.end.mode == null, `${ref}/${dir} 하차 ${JSON.stringify(r.end)}`);
  if (dir === 1) check(r.alight === 'auto' && Math.hypot(r.end.x - r.endWant[0], r.end.z - r.endWant[1]) < 60, `${ref}/${dir} 미금 종점 구간 하차 ${JSON.stringify(r.end)}`);
}
console.log('page errors', errs.length, errs.slice(0, 3));
await browser.close();
stopVite();
check(errs.length === 0, `페이지 오류 ${errs.slice(0, 3).join(' / ')}`);
if (fails.length) { console.error('FAIL\n  ' + [...new Set(fails)].slice(0, 40).join('\n  ')); process.exit(1); }
console.log('e2e-ride-migeum: ok — ' + out.map((x) => `${x.ref} dir${x.dir} ${x.n}샘플 최대 방향오차 ${x.maxHerr.toFixed(2)}° 최대 하강 ${x.maxDrop.toFixed(3)}m · ${x.order.seq.join(' → ')}`).join(' / ') + ' · page errors 0');
