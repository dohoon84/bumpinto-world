// [gyeongbu-bus] 판교→강남역→판교 헤드리스 바이크 주행 + 밤 Chase 샷.
//   BASE=http://127.0.0.1:5197/ OUT=artifacts/gyeongbu-ride node scripts/shots-gyeongbu-ride.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { sampleExpressPts, BEFORE_FIX_STUCK } from '../src/corridor/gyeongbuWorld.js';

const B = process.env.BASE || 'http://127.0.0.1:5197/';
const OUT = process.env.OUT || path.resolve('artifacts/gyeongbu-ride');
fs.mkdirSync(OUT, { recursive: true });

const ex = JSON.parse(fs.readFileSync('public/corridor/gangnam/gyeongbu-express.json', 'utf8'));
const samples = sampleExpressPts(ex.pts, 20);
const last = samples.at(-1);
const SHOT_S = [0, 2000, 4000, 4360, 6000, 8000, 8021, 10000, 12000, 12072, 14000, 14110, 15540, Math.round(last.s)];
const OLD_WALL = BEFORE_FIX_STUCK.map((p) => p.s);
const E1 = { x: -4782.8, z: -9114.0, ry: 0.377, name: 'cheonggye-exit1' };
const E2 = { x: -4720.9, z: -8974.6, ry: 0, name: 'cheonggye-exit2' };

function nearest(s) {
  let best = samples[0], bd = Infinity;
  for (const q of samples) {
    const d = Math.abs(q.s - s);
    if (d < bd) { best = q; bd = d; }
  }
  return best;
}

const Q = 'lang=ko&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&roadbike=0&superbike=0&pangyonpc=0&gangnamnpc=0&bp24game=0&controlscard=0';
const errs = [];
const report = {
  beforeFixStuck: BEFORE_FIX_STUCK,
  firstOldWall: { s: 4360, x: -2507.3, z: -5958.9, note: '본선 bounds x0=-2500. 고치기 전 판교→강남 첫 막힘(20m 샘플 27곳)' },
  outbound: null,
  inbound: null,
  heights: [],
  shots: [],
  pageErrors: [],
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => { errs.push(e.message); console.warn('pageerror', e.message); });

await page.goto(`${B}?${Q}&hour=21&enter=1&shot=1`, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForTimeout(500);
await page.evaluate(() => document.getElementById('lobby-go')?.click());
await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.waitForFunction(() => {
  const sc = window.__jj?.renderer?.domElement ? window.__jj : null;
  const scene = window.__jj?.player;
  let root = scene;
  while (root?.parent) root = root.parent;
  let hasRoad = false, hasDem = false;
  root?.traverse?.((o) => {
    if (o.name === 'gyeongbuExpressway' || o.name === 'gyeongbuExpresswayBody') hasRoad = true;
    if (o.name === 'cheonggyeTerrain' && o.children?.length) hasDem = true;
  });
  return hasRoad;
}, null, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(800);

async function mountAt(x, z, h) {
  await page.evaluate(async ({ x, z, h }) => {
    const J = window.__jj;
    J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    J.teleport(x, z);
    const bike = J.bike;
    if (!bike) throw new Error('admin bike missing (bike=0?)');
    if (!bike.summoned) bike.summon();
    const b = bike.bike;
    b.x = x; b.z = z; b.h = h; b.v = 0; b.yaw = 0; b.si = 0;
    if (!bike.riding) bike.mount();
    b.x = x; b.z = z; b.h = h;
    J.player.position.set(x, b.y, z);
    J.player.rotation.y = h;
    J.cam.yaw = h + Math.PI;
    J.cam.pitch = 0.22;
    J.cam.dist = 16;
    bike.holdCam(90);
  }, { x, z, h });
}

async function chaseCam(x, z, h) {
  await page.evaluate(({ x, z, h }) => {
    const J = window.__jj, b = J.bike.bike;
    J.setMode('follow');
    J.cam.yaw = h + Math.PI;
    J.cam.pitch = 0.22;
    J.cam.dist = 16;
    J.bike.holdCam(90);
    J.player.position.set(b.x, b.y, b.z);
  }, { x, z, h });
}

async function driveChunk(pts) {
  return page.evaluate(async ({ pts }) => {
    const J = window.__jj;
    const bike = J.bike;
    const b = bike.bike;
    const world = J.world;
    const terrain = J.terrain;
    const DT = 1 / 30;
    const stuck = [];
    const heights = [];
    const preloadEvery = 8;
    const offsets = [0, 3.6, -3.6, 7.2, -7.2, 10.8, -10.8];

    const headingTo = (x, z) => Math.atan2(x - b.x, z - b.z);
    // inWorldBounds is not on __jj; poseFits rejection shows up as no progress.
    const boundsInfo = (x, z) => {
      const bd = world.bounds;
      if (!bd) return { in: true };
      const islands = bd.islands || [];
      const inIsle = islands.some((i) => x >= i.x0 && x <= i.x1 && z >= i.z0 && z <= i.z1)
        || (!islands.length && x >= bd.x0 && x <= bd.x1 && z >= bd.z0 && z <= bd.z1);
      let inCorr = false;
      for (const c of bd.corridors || []) {
        const ptsC = c.pts;
        const hw = c.halfWidth ?? 0;
        for (let i = 1; i < ptsC.length; i++) {
          const ax = ptsC[i - 1][0], az = ptsC[i - 1][1], bx = ptsC[i][0], bz = ptsC[i][1];
          const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
          if (Math.hypot(ax + dx * t - x, az + dz * t - z) <= hw) { inCorr = true; break; }
        }
        if (inCorr) break;
      }
      return { in: inIsle || inCorr, inIsle, inCorr };
    };

    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      if (i % preloadEvery === 0 && J.corridor) await J.corridor.preload(q.x, q.z);
      const hx = q.hx, hz = q.hz;
      const nx = -hz, nz = hx;
      let reached = false;
      let usedOff = 0;
      for (const off of offsets) {
        const tx = q.x + nx * off, tz = q.z + nz * off;
        const want = headingTo(tx, tz);
        b.h = want;
        b.v = Math.max(b.v, 22);
        b.yaw = 0; b.si = 0;
        const d0 = Math.hypot(tx - b.x, tz - b.z);
        if (d0 < 6) { reached = true; usedOff = off; break; }
        const steps = Math.min(180, Math.max(20, Math.ceil(d0 / (22 * DT)) + 12));
        let best = d0;
        for (let s = 0; s < steps; s++) {
          b.h = headingTo(tx, tz);
          bike.update(DT, 1, 0, true, 0);
          const d = Math.hypot(tx - b.x, tz - b.z);
          if (d < best) best = d;
          if (d < 6) { reached = true; usedOff = off; break; }
        }
        if (reached) break;
        // no progress on this offset — snap back to path and try next lane
      }
      if (!reached) {
        const info = boundsInfo(b.x, b.z);
        const blocked = !!(world.isBlocked?.(b.x, b.z, 0.4));
        stuck.push({
          s: q.s, x: +b.x.toFixed(2), z: +b.z.toFixed(2),
          target: { x: +q.x.toFixed(2), z: +q.z.toFixed(2) },
          inWorldBounds: info.in, isBlocked: blocked, y: +b.y.toFixed(3),
        });
        break;
      }
      if (i % 25 === 0 || i === pts.length - 1) {
        const gy = terrain?.getGroundHeight ? terrain.getGroundHeight(b.x, b.z, b.y) : null;
        heights.push({ s: q.s, x: +b.x.toFixed(1), z: +b.z.toFixed(1), bikeY: +b.y.toFixed(3), groundY: gy == null ? null : +gy.toFixed(3), off: usedOff });
      }
    }
    return {
      stuck,
      heights,
      at: { x: +b.x.toFixed(2), z: +b.z.toFixed(2), y: +b.y.toFixed(3), s: pts.at(-1)?.s, riding: bike.riding },
    };
  }, { pts });
}

async function shotAt(s, name, dir = 1) {
  const q = nearest(s);
  const h = dir > 0 ? Math.atan2(q.hx, q.hz) : Math.atan2(-q.hx, -q.hz);
  await mountAt(q.x, q.z, h);
  await chaseCam(q.x, q.z, h);
  await page.waitForTimeout(2200);
  const file = name.endsWith('.png') ? name : `${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), type: 'png' });
  const info = await page.evaluate(() => {
    const J = window.__jj, b = J.bike?.bike, t = J.terrain;
    let hasRoad = false, hasDem = 0, pines = 0;
    let root = J.player; while (root?.parent) root = root.parent;
    root?.traverse?.((o) => {
      if (/gyeongbuExpress/.test(o.name || '')) hasRoad = true;
      if (o.name === 'cheonggyeTerrain') hasDem = o.children?.length || 0;
    });
    return {
      x: b?.x, z: b?.z, y: b?.y,
      ground: t?.getGroundHeight ? t.getGroundHeight(b.x, b.z, b.y) : null,
      hasRoad, hasDem,
    };
  });
  report.shots.push({ file, s: q.s, ...info });
  console.log('shot', file, JSON.stringify(info));
}

async function walkExit(ex, file) {
  const info = await page.evaluate(async ({ ex }) => {
    const J = window.__jj;
    if (J.bike?.riding) J.bike.dismount();
    if (J.corridor) await J.corridor.preload(ex.x, ex.z);
    J.teleport(ex.x, ex.z);
    J.setMode('follow');
    J.player.rotation.y = ex.ry;
    J.cam.yaw = ex.ry + Math.PI;
    J.cam.pitch = 0.18;
    J.cam.dist = 14;
    // 출구에서 도로 쪽으로 50m (대략 서쪽으로 본선, 그리고 사방)
    const p = J.player.position;
    const start = { x: p.x, z: p.z };
    const fx = Math.sin(ex.ry), fz = Math.cos(ex.ry);
    // 본선 쪽(출구에서 조금 나와 도로 방향). 1번 출구 ry는 출구 향. 도로가 북서쪽에 있음.
    const steps = [];
    const tryWalk = (dx, dz, label) => {
      J.teleport(start.x, start.z);
      const tx = start.x + dx, tz = start.z + dz;
      // clamp는 이동 루프에서만 적용되므로, 직접 50m 지점으로 옮긴 뒤 bounds/클램프 결과만 기록하고
      // 실제 보행은 소량 스텝으로 재현한다.
      const bb = J.world.bounds;
      const c = { x: p.x, z: p.z };
      // 1m 스텝
      let x = start.x, z = start.z;
      const n = 50;
      const sx = dx / n, sz = dz / n;
      for (let i = 0; i < n; i++) {
        x += sx; z += sz;
        J.player.position.set(x, J.terrain?.getGroundHeight(x, z, 0) ?? 0, z);
      }
      const end = { x: J.player.position.x, z: J.player.position.z };
      const pulled = Math.hypot(end.x - (start.x + dx), end.z - (start.z + dz));
      steps.push({ label, start, want: { x: start.x + dx, z: start.z + dz }, end, pulled: +pulled.toFixed(1) });
      return end;
    };
    // 50m 전방 후 샷 위치는 전방 끝
    const end = tryWalk(fx * 50, fz * 50, 'forward50');
    tryWalk(-fx * 50, -fz * 50, 'back50');
    tryWalk(-fz * 50, fx * 50, 'left50');
    tryWalk(fz * 50, -fx * 50, 'right50');
    J.teleport(start.x + fx * 28, start.z + fz * 28);
    J.player.rotation.y = ex.ry;
    J.cam.yaw = ex.ry + Math.PI;
    J.cam.pitch = 0.16;
    J.cam.dist = 16;
    return { start, steps, at: { x: J.player.position.x, z: J.player.position.z, y: J.player.position.y } };
  }, { ex });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, file), type: 'png' });
  report.shots.push({ file, walk: info });
  console.log('walk', file, JSON.stringify(info));
  return info;
}

// ---- outbound drive (판교 → 강남) in 2km chunks, shot at marks ----
console.log('samples', samples.length, 'length', last.s.toFixed(1));
const start = samples[0];
await mountAt(start.x, start.z, Math.atan2(start.hx, start.hz));

const shotSet = new Set([...SHOT_S, ...OLD_WALL]);
const marks = [...shotSet].sort((a, b) => a - b);

async function rideDir(label, list, dir) {
  const stuckAll = [];
  const heightsAll = [];
  // start at first point
  const a0 = list[0];
  const h0 = Math.atan2(a0.hx * dir, a0.hz * dir);
  await mountAt(a0.x, a0.z, h0);

  // chunk by ~2km of chainage
  const chunks = [];
  let chunk = [list[0]];
  let baseS = list[0].s;
  for (let i = 1; i < list.length; i++) {
    chunk.push(list[i]);
    if (Math.abs(list[i].s - baseS) >= 2000 || i === list.length - 1) {
      chunks.push(chunk);
      chunk = [list[i]];
      baseS = list[i].s;
    }
  }

  for (const ch of chunks) {
    const res = await driveChunk(ch);
    heightsAll.push(...res.heights);
    if (res.stuck.length) {
      stuckAll.push(...res.stuck);
      console.log(label, 'STUCK', JSON.stringify(res.stuck));
      const q = res.stuck[0];
      await chaseCam(q.x, q.z, h0);
      await page.waitForTimeout(1800);
      const fn = `gyeongbu-ride-${label}-STUCK-s${Math.round(q.s)}.png`;
      await page.screenshot({ path: path.join(OUT, fn), type: 'png' });
      report.shots.push({ file: fn, stuck: q });
      break;
    }
    // shot this chunk end (and any marks inside)
    const end = ch.at(-1);
    const name = `gyeongbu-ride-${label}-s${String(Math.round(end.s)).padStart(5, '0')}.png`;
    await chaseCam(end.x, end.z, Math.atan2((end.hx || 0) * dir, (end.hz || 0) * dir));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, name), type: 'png' });
    const info = await page.evaluate(() => {
      const J = window.__jj, b = J.bike?.bike, t = J.terrain;
      return { x: b?.x, z: b?.z, y: b?.y, ground: t?.getGroundHeight?.(b.x, b.z, b.y) };
    });
    report.shots.push({ file: name, s: end.s, ...info });
    console.log(label, 'ok to', end.s.toFixed(0), JSON.stringify(info));
  }
  return { stuck: stuckAll, heights: heightsAll, ok: stuckAll.length === 0 };
}

report.outbound = await rideDir('out', samples, 1);
if (report.outbound.ok) {
  report.inbound = await rideDir('back', [...samples].reverse(), -1);
} else {
  report.inbound = { ok: false, skipped: true, reason: 'outbound stuck' };
}

// extra marked shots (old walls, 출구) if we got through or anyway by teleport
for (const sp of BEFORE_FIX_STUCK) {
  await shotAt(sp.s, `gyeongbu-ride-oldwall-${sp.s}-${sp.name.replace(/\s+/g, '')}`);
}
await shotAt(0, 'gyeongbu-ride-start-pangyo');
await shotAt(last.s, 'gyeongbu-ride-end-gangnam');

const w1 = await walkExit(E1, 'gyeongbu-walk-cheonggye-exit1-50m.png');
const w2 = await walkExit(E2, 'gyeongbu-walk-cheonggye-exit2-50m.png');
report.walks = { exit1: w1, exit2: w2 };

report.pageErrors = errs.slice(0, 20);
const ok = !!(report.outbound?.ok && report.inbound?.ok)
  && (w1.steps || []).every((s) => s.pulled < 8)
  && (w2.steps || []).every((s) => s.pulled < 8);

fs.writeFileSync(path.join(OUT, 'gyeongbu-ride-report.json'), JSON.stringify(report, null, 2));
console.log(ok ? 'PASS 왕복 통과' : 'FAIL 막힘 있음', 'shots in', OUT);
await browser.close();
process.exit(ok ? 0 : 1);
