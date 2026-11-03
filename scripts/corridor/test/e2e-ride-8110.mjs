// [pangyo-link] 8110 탑승 e2e: npm run ride:e2e:8110   (판교 확장 2단계 — 정자역 → 판교역)
//   ?bus=sim 정자역에서 8110(OSM relation 7090965) 을 타고 정자 → 코리더 경계(이어 타기) → 궁내교 → 수내 → 서현 → 이매 → 양현교 → 판교역 종점까지.
//   매 샘플: 차 방향 vs 도로 접선 < 20°, 행렬식 > 0·위쪽 ≈ +Y, 한 샘플 하강 ≤ 0.5m, 다리 상판 위 버스 Y ≥ 상판 (e2e-ride-220 과 같은 기준)
//   끝: 정차 순서 = relation 정류장 순서, 경계 이어 타기 1번, 요금 1번, 두 탄천 다리 상판 주행, 판교역에서 하차.
//   ?ws=mock 만 씀. E2E_URL 이 없으면 vite 를 5480 부터 빈 포트에 직접 띄움(4173-4176·5391·5392·8787·8799 제외).
//   SHOT_DIR(기본 /workspace/bw-pangyo-shots/stage2) → ride8110-*.png
//   [g8110-return] 이어서 반대 방향(GBIS routeId 204000082): 판교역 탑승 → 이매촌한신 → 서현역 → 수내역 → 경계 이어 타기 → 정자역 종점 하차.
//   REV_SHOT_DIR(기본 SHOT_DIR) → ride8110r-*.png · E2E_DIR=fwd|rev|both(기본 both)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const { chromium } = await import('playwright');
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ONLY = !!process.env.E2E_SHOTS_ONLY;
const SHOT_DIR = process.env.SHOT_DIR || '/workspace/bw-pangyo-shots/stage2';
const REV_SHOT_DIR = process.env.REV_SHOT_DIR || SHOT_DIR, DIRS = process.env.E2E_DIR || 'both';
fs.mkdirSync(SHOT_DIR, { recursive: true }); fs.mkdirSync(REV_SHOT_DIR, { recursive: true });
const BAD_PORTS = new Set([4173, 4174, 4175, 4176, 5391, 5392, 8787, 8799]);
const freePort = (p) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(freePort(p + 1))); s.listen(p, '127.0.0.1', () => s.close(() => res(p))); });
let vite = null, BASE = process.env.E2E_URL;
if (!BASE) {
  let port = await freePort(5480); while (BAD_PORTS.has(port)) port = await freePort(port + 1);
  vite = spawn(process.execPath, [ROOT + 'node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }); // npx 를 거치지 않아 끝날 때 vite 까지 확실히 종료
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('vite 시작 시간 초과')), 60000); vite.stdout.on('data', (d) => { if (/Local:/.test(String(d))) { clearTimeout(t); res(); } }); vite.on('exit', (c) => rej(new Error('vite 종료 ' + c))); });
  BASE = `http://127.0.0.1:${port}/`;
}
const stopVite = () => { if (vite && vite.exitCode == null) vite.kill('SIGTERM'); };
process.on('exit', stopVite);
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

const LINK = JSON.parse(fs.readFileSync(ROOT + 'public/corridor/pangyo/link.json', 'utf8'));
const norm = (s) => String(s || '').replace(/[\s().·]/g, '');
const REL_STOPS = ['정자역', '롯데백화점.수내역', '서현역.AK플라자', '이매촌한신.서현역.AK프라자', '판교역.낙생육교.현대백화점'].map(norm); // OSM relation 7090965 정류장 순서
const REV_STOPS = LINK.meta.reverse.gbisStops.map((s) => norm(s.name)); // [g8110-return] GBIS 204000082 seq 37~41

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(BASE + '?enter=1&name=e2e&bus=sim&ws=mock&rideSfx=0&rideVoice=0&noticePopup=0' + (process.env.E2E_QS || ''));
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForTimeout(2000);
await page.evaluate(() => document.getElementById('lobby-go').click());
await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
await page.waitForFunction(() => window.__jj.transit?.rideSim && window.__jj.corridor?.life?.buses, null, { timeout: 180000 });
await page.waitForTimeout(1500);
let SHOT_PRE = `${SHOT_DIR}/ride8110-`;
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
        dwell: !!r.dwell, stopIdx: b.stopIdx, stop: r.dwell ? nameOf(P, b.stopIdx) : null };
    },
  };
});


async function ride8110(rev = false) {
  SHOT_PRE = rev ? `${REV_SHOT_DIR}/ride8110r-` : `${SHOT_DIR}/ride8110-`;
  const WANT = rev ? REV_STOPS : REL_STOPS;
  if (rev) { // 판교역 근처로 먼저 옮겨 타일·정류장을 불러옴
    await page.evaluate(() => { const jj = window.__jj, J = jj.corridor.life.buses, P = J.sim.paths.find((p) => p.ref === 'G8110' && p.dir === 1), st = J.stopById.get(P.stops[0].stop); jj.teleport(st._pos.x + 6, st._pos.z); });
    await page.waitForTimeout(6000);
  }
  const setup = await page.evaluate((rev) => {
    const jj = window.__jj, J = rev ? jj.corridor.life.buses : jj.transit.rideSim;
    const P = rev ? J.sim.paths.find((p) => p.ref === 'G8110' && p.dir === 1) : J.sim.paths.filter((p) => p.ref === 'G8110' && p.dir !== 1).at(rev ? -1 : 0);
    if (!P) return { err: (rev ? '코리더' : '정자') + ' 시뮬에 G8110 경로 없음' };
    const k = rev ? 0 : P.stops.findIndex((st) => /정자역/.test(J.stopById.get(st.stop)?.name)), st = P.stops[k], stop = J.stopById.get(st.stop);
    J.sim.buses = J.sim.buses.filter((b) => !(b.P === P && Math.abs(b.s - st.s) < 150));
    const b = J.sim._spawn(P, Math.max(0.01, st.s - 70));
    jj.teleport(stop._pos.x, stop._pos.z);
    return { k, jz: !rev, busId: b.id, path: P.id, ref: P.ref, at: { x: stop._pos.x, z: stop._pos.z }, charges: jj.ride.stats.charges.length };
  }, rev);
  assert.ok(!setup.err, setup.err); assert.equal(setup.ref, 'G8110');
  for (let i = 0; i < 300; i++) {
    const ok = await page.evaluate(({ busId, k, jz }) => { const R = window.__jj.ride; R.debug.ff(0.3, () => { const b = R.debug.bus(busId, jz); return b && b.state === 'dwell' && b.stopIdx === k; }); const b = R.debug.bus(busId, jz); if (b?.state === 'dwell') b.dwell = Math.max(b.dwell, 8); return b?.state === 'dwell' && b.stopIdx === k; }, setup);
    if (ok) break;
  }
  await page.evaluate(({ busId, at, jz }) => { const jj = window.__jj, b = jj.ride.debug.bus(busId, jz), q = b._q || { x: at.x, z: at.z }; const sp = jj.corridor.freeSpot((q.x + at.x) / 2, (q.z + at.z) / 2); jj.teleport(sp.x, sp.z); }, setup);
  await page.waitForTimeout(1200);
  await shot(rev ? '0-board-pangyo' : '0-board-jeongja');
  await page.keyboard.press('e'); await page.waitForTimeout(1200);
  const st0 = await page.evaluate(() => window.__jj.ride.debug.state());
  assert.equal(st0.mode, 'bus', (rev ? '판교역' : '정자역') + ' 탑승 실패');
  if (st0.cam === '1p') await page.evaluate(() => window.__jj.ride.toggleCam());
  const res = { n: 0, maxHerr: 0, maxDrop: 0, minDet: 1, minUp: 1, deckN: 0, stops: [], transfers: 0, bridges: {}, paths: new Set() };
  let prev = null; const shotAt = new Set();
  const once = async (name) => { if (shotAt.has(name)) return; shotAt.add(name); await page.waitForTimeout(400); await shot(name); };
  for (let i = 0; i < 6000; i++) {
    const r = await page.evaluate(() => new Promise((ok) => { window.__jj.ride.debug.ff(0.2); requestAnimationFrame(() => ok(window.__e2e.snap())); }));
    if (!r) { // 하차(종점 자동 하차 포함) — 같은 프레임에 정차 중이던 정류장도 기록
      const fin = await page.evaluate(() => { const E = window.__e2e, b = E.lastB; return b && b.state === 'dwell' ? { path: E.lastP?.id, stopIdx: b.stopIdx, name: E.nameOf(E.lastP, b.stopIdx) } : null; });
      if (fin?.name && (!res.stops.length || res.stops.at(-1).key !== fin.path + ':' + fin.stopIdx)) {
        const p = await page.evaluate(() => window.__jj.player.position);
        res.stops.push({ key: fin.path + ':' + fin.stopIdx, name: fin.name, at: [Math.round(p.x), Math.round(p.z)], alight: 1 });
        if (!rev && /^판교역/.test(fin.name)) await once('4-arrive-pangyo');
        if (rev && /^정자역/.test(fin.name)) await once('4-arrive-jeongja');
      }
      break;
    }
    res.n++; res.paths.add(r.path);
    if (process.env.E2E_PROGRESS && res.n % 100 === 0) console.log('…', res.n, r.path, r.s?.toFixed(0), Math.round(r.x), Math.round(r.z), r.dwell ? 'dwell ' + r.stop : '');
    res.maxHerr = Math.max(res.maxHerr, r.herr); res.minDet = Math.min(res.minDet, r.det); res.minUp = Math.min(res.minUp, r.upY);
    if (r.herr >= 20) fails.push(`방향 오차 ${r.herr.toFixed(1)}° @path ${r.path} s ${r.s.toFixed(1)} (${r.x.toFixed(0)},${r.z.toFixed(0)})`);
    if (!(r.det > 0) || r.upY < 0.98) fails.push(`행렬 det ${r.det.toFixed(3)} up ${r.upY.toFixed(3)} @path ${r.path}`);
    if (r.deckH != null) {
      res.deckN++; const key = Math.hypot(r.x - 50, r.z + 735) < 150 ? '궁내교' : Math.hypot(r.x - 1162, r.z + 2665) < 150 ? '양현교' : (r.road || '?');
      res.bridges[key] = (res.bridges[key] || 0) + 1;
      if (r.y < r.deckH - 0.01) fails.push(`상판 아래 y ${r.y.toFixed(2)} < ${r.deckH} @(${r.x.toFixed(0)},${r.z.toFixed(0)})`);
      if (key === '양현교' && res.bridges[key] === 6) await once('2-on-yanghyeon-bridge');
      if (key === '궁내교' && res.bridges[key] === 6) await once('1-on-gungnae-bridge');
      if (rev && key !== '궁내교' && key !== '양현교' && res.bridges[key] === 6) await once('2-on-' + (/[가-힣]/.test(key) ? 'bridge' : 'deck'));
    }
    if (prev) {
      const drop = prev.y - r.y; res.maxDrop = Math.max(res.maxDrop, drop);
      if (drop > 0.5) fails.push(`한 샘플 하강 ${drop.toFixed(2)}m @(${r.x.toFixed(0)},${r.z.toFixed(0)})`);
      if (r.path !== prev.path) res.transfers++;
    }
    if (!rev && r.z < -2700 && r.x < 700 && !r.dwell) await once('3-seohyeonro-west-approach');
    if (rev && r.z < -2200 && r.x > 700 && !r.dwell) await once('1-seohyeonro-east');
    if (rev && prev && r.path !== prev.path) await once('3-boundary-into-jeongja');
    if (r.dwell && r.stop && (!res.stops.length || res.stops.at(-1).key !== r.path + ':' + r.stopIdx)) {
      res.stops.push({ key: r.path + ':' + r.stopIdx, name: r.stop, at: [Math.round(r.x), Math.round(r.z)] });
      if (!rev && /^판교역/.test(r.stop)) await once('4-arrive-pangyo');
      if (rev && /서현역/.test(r.stop)) await once('2-seohyeon-stop');
      if (rev && /^정자역/.test(r.stop)) await once('4-arrive-jeongja');
    }
    prev = r;
  }
  await page.waitForTimeout(800);
  await shot('5-end');
  const after = await page.evaluate(() => ({ st: window.__jj.ride.debug.state(), charges: window.__jj.ride.stats.charges.length, p: window.__jj.player.position }));
  res.charges = after.charges - setup.charges; res.end = { mode: after.st.mode, x: Math.round(after.p.x), z: Math.round(after.p.z) };
  let gi = 0, ok = true; const seq = [];
  for (const s of res.stops) { const nn = norm(s.name); let j = gi; while (j < WANT.length && WANT[j] !== nn) j++; if (j >= WANT.length) { ok = false; seq.push(`${s.name}✗`); } else { seq.push(`${s.name}#${j}`); gi = j + 1; } }
  res.order = { ok, seq, complete: gi === WANT.length };
  res.paths = [...res.paths];
  return res;
}

const pg = LINK.corridor.stops.find((s) => /^판교역/.test(s.name) && s.src !== 'gbis');
let r = null, rr = null;
if (DIRS !== 'rev') {
  r = await ride8110(false);
  console.log('[8110]', JSON.stringify({ ...r, stops: r.stops }));
  check(r.n > 300, `샘플 ${r.n}`);
  check(r.transfers === 1, `경계 이어 타기 ${r.transfers}번`);
  check(r.charges === 1, `요금 ${r.charges}번`);
  check(r.order.ok && r.order.complete, `정차 순서 ${r.order.seq.join(' → ')}`);
  check(r.bridges['궁내교'] > 5 && r.bridges['양현교'] > 5, `다리 상판 주행 ${JSON.stringify(r.bridges)}`);
  check(r.end.mode == null && Math.hypot(r.end.x - pg.x, r.end.z - pg.z) < 40, `판교역 하차 ${JSON.stringify(r.end)}`);
}
if (DIRS !== 'fwd') { // [g8110-return]
  rr = await ride8110(true);
  console.log('[8110 reverse]', JSON.stringify({ ...rr, stops: rr.stops }));
  const JZT = JSON.parse(fs.readFileSync(ROOT + 'public/transit.json', 'utf8')), jzs = JZT.stops.find((s) => s.id === LINK.live.paths.find((p) => p.dir === 1).stops.at(-1).stop); // 반대 방향 정자역 정류장
  check(rr.n > 300, `반대 샘플 ${rr.n}`);
  check(rr.transfers === 1, `반대 경계 이어 타기 ${rr.transfers}번`);
  check(rr.charges === 1, `반대 요금 ${rr.charges}번`);
  check(rr.order.ok && rr.order.complete, `반대 정차 순서 ${rr.order.seq.join(' → ')}`);
  check(rr.end.mode == null && Math.hypot(rr.end.x - jzs.x, rr.end.z - jzs.z) < 60, `정자역 하차 ${JSON.stringify(rr.end)}`);
}
console.log('page errors', errs.length, errs.slice(0, 3));
await browser.close();
stopVite();
check(errs.length === 0, `페이지 오류 ${errs.slice(0, 3).join(' / ')}`);
const fmt = (x) => `${x.n}샘플 최대 방향오차 ${x.maxHerr.toFixed(2)}° 최대 하강 ${x.maxDrop.toFixed(3)}m 상판 ${x.deckN}샘플 ${JSON.stringify(x.bridges)} · ${x.order.seq.join(' → ')}`;
if (!ONLY) {
  if (fails.length) { console.error('FAIL\n  ' + [...new Set(fails)].slice(0, 40).join('\n  ')); process.exit(1); }
  console.log(`e2e-ride-8110: ok — ${r ? '정방향 ' + fmt(r) : ''}${r && rr ? ' / ' : ''}${rr ? '반대 방향 ' + fmt(rr) : ''}`);
} else console.log('기록만(E2E_SHOTS_ONLY) — 실패 후보', fails.length, [...new Set(fails)].slice(0, 8));
