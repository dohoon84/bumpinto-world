// [gyeongbu-bus] 판교IC→청계산→양재→강남대로 본선을 양방향으로 끝까지 달릴 수 있는지,
//   노면이 지형에 묻히지 않는지, 차·사람 높이가 노면에 맞는지 20m 마다 검사한다.
//   고치기 전: 본선 bounds(x0=-2500)와 강남 섬 사이에서 inWorldBounds 가 막히고,
//   걸으면 clampWorld 가 서쪽 끝으로 끌어 가 회색 평원만 보였다. 노면은 y=0.30 인데 지면 높이는 0 이라 차가 묻혔다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inWorldBounds, clampWorld } from '../../../src/corridor/islands.js';
import { mergeGangnamIndex } from '../../../src/corridor/gangnam.js';
import {
  mergeGyeongbuWorld, expressRoadHeight, sampleExpressPts, BEFORE_FIX_STUCK,
  EXPRESS_ROAD_Y, EXPRESS_PAVE_R, CHEONGGYE_ISLAND,
  inPangyoCity, nearPangyoToll, PANGYO_TG, setExpressHeightExtra, buildExpressHeightProfile,
} from '../../../src/corridor/gyeongbuWorld.js';
import { cheonggyeHeightAt, cheonggyeMeshHeightAt } from '../../../src/corridor/cheonggyeTerrain.js';
import { expresswayMedianLine } from '../../../src/corridor/gyeongbuExpress.js';
import { pointInBox } from '../../../src/corridor/islands.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const index0 = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/index.json'), 'utf8'));
const gn = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gangnam/index.json'), 'utf8'));
const ex = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gangnam/gyeongbu-express.json'), 'utf8'));
const dem = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gyeongbu/cheonggye-dem.json'), 'utf8'));
const streets = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gyeongbu/cheonggye-streets.json'), 'utf8'));

const mergedGn = mergeGangnamIndex(index0, gn);
const main = mergedGn.meta.islands[0];
const isle = mergedGn.meta.islands[1];
const oldWorld = { ...main, islands: [main, isle] };

const stuckBefore = [];
const samples = sampleExpressPts(ex.pts, 20);
for (const q of samples) {
  if (!inWorldBounds({ x: q.x, z: q.z }, oldWorld)) {
    if (!stuckBefore.length || q.s - stuckBefore.at(-1).s > 400) stuckBefore.push({ s: +q.s.toFixed(1), x: +q.x.toFixed(1), z: +q.z.toFixed(1) });
  }
}
assert.ok(stuckBefore.length > 0, '고치기 전 막힌 지점이 있어야 한다 (회귀 기준)');
const first = samples.find((q) => !inWorldBounds({ x: q.x, z: q.z }, oldWorld));
assert.ok(first && first.s > 4000 && first.s < 4800 && first.x < -2500, `첫 막힘 ${first && `${first.s.toFixed(0)} (${first.x.toFixed(1)}, ${first.z.toFixed(1)})`}`);
const c0 = clampWorld(first.x, first.z, oldWorld);
assert.ok(Math.abs(c0.x - (-2500)) < 1 || !inWorldBounds({ x: first.x, z: first.z }, oldWorld), '고치기 전 clamp 는 본선 끝으로 끌어 감');
for (const sp of BEFORE_FIX_STUCK) {
  assert.equal(inWorldBounds({ x: sp.x, z: sp.z }, oldWorld), false, `고치기 전 ${sp.name}`);
}
const exits = [{ name: '청계산 1번', x: -4782.8, z: -9114.0 }, { name: '청계산 2번', x: -4720.9, z: -8974.6 }];
for (const e of exits) {
  assert.equal(inWorldBounds({ x: e.x, z: e.z }, oldWorld), false, e.name);
  const c = clampWorld(e.x + 5, e.z, oldWorld);
  assert.ok(Math.hypot(c.x - e.x, c.z - e.z) > 100, `${e.name} 에서 걸으면 멀리 끌려감 (${c.x.toFixed(0)}, ${c.z.toFixed(0)})`);
}

const fixed = mergeGyeongbuWorld(mergedGn, ex.pts, '');
const world = {
  ...fixed.meta.bounds,
  islands: [main, isle, CHEONGGYE_ISLAND],
  corridors: fixed.meta.corridors,
};
assert.ok(fixed.meta.corridors?.length === 1);
assert.ok(fixed.meta.islands.some((b) => b.x0 === CHEONGGYE_ISLAND.x0));

function drive(dir) {
  const pts = dir > 0 ? samples : samples.slice().reverse();
  const stuck = [];
  let x = pts[0].x, z = pts[0].z;
  for (const q of pts) {
    const steps = Math.max(1, Math.ceil(Math.hypot(q.x - x, q.z - z) / 8));
    for (let i = 1; i <= steps; i++) {
      const tx = x + ((q.x - x) * i) / steps, tz = z + ((q.z - z) * i) / steps;
      if (!inWorldBounds({ x: tx, z: tz }, world)) {
        stuck.push({ s: q.s, x: +tx.toFixed(2), z: +tz.toFixed(2), why: 'inWorldBounds' });
        return stuck;
      }
      const c = clampWorld(tx, tz, world);
      if (Math.hypot(c.x - tx, c.z - tz) > 0.25) {
        stuck.push({ s: q.s, x: +tx.toFixed(2), z: +tz.toFixed(2), clamp: { x: +c.x.toFixed(2), z: +c.z.toFixed(2) }, why: 'clampWorld' });
        return stuck;
      }
    }
    x = q.x; z = q.z;
  }
  return stuck;
}

const go = drive(1), back = drive(-1);
assert.deepEqual(go, [], `판교→강남 막힘 ${JSON.stringify(go[0] || {})}`);
assert.deepEqual(back, [], `강남→판교 막힘 ${JSON.stringify(back[0] || {})}`);
for (const e of exits) {
  assert.equal(inWorldBounds({ x: e.x, z: e.z }, world), true, `${e.name} 출구는 범위 안`);
  for (const [dx, dz] of [[50, 0], [-50, 0], [0, 50], [0, -50], [35, 35]]) {
    const x = e.x + dx, z = e.z + dz;
    assert.equal(inWorldBounds({ x, z }, world), true, `${e.name} ${dx},${dz}`);
    const c = clampWorld(x, z, world);
    assert.ok(Math.hypot(c.x - x, c.z - z) < 0.01, `${e.name} 50m 보행 clamp`);
  }
}
assert.equal(inWorldBounds({ x: 251, z: -3080 }, world), true, '판교역');
assert.equal(inWorldBounds({ x: -7100, z: -14500 }, world), true, '강남 섬');
assert.equal(inWorldBounds({ x: -4000, z: -14500 }, world), false, '본선과 강남 사이 빈 땅은 그대로 막힘');

const buried = [], sink = [];
for (const q of samples) {
  const roadY = expressRoadHeight(q.x, q.z, ex.pts);
  assert.equal(roadY, EXPRESS_ROAD_Y, `노면 ${q.s.toFixed(0)} (${q.x.toFixed(1)}, ${q.z.toFixed(1)})`);
  // 차·사람 높이 = 노면 (addGroundExtra 가 이 값을 씀). 고치기 전엔 0 이라 0.30m 아래에 묻힘.
  const vehY = Math.max(0, roadY);
  if (Math.abs(vehY - EXPRESS_ROAD_Y) > 0.02) sink.push({ s: q.s, vehY, roadY });
  const demY = cheonggyeHeightAt(q.x, q.z, dem, streets, ex.pts);
  if (demY != null && demY > EXPRESS_ROAD_Y + 0.02) buried.push({ s: +q.s.toFixed(1), x: +q.x.toFixed(1), z: +q.z.toFixed(1), demY: +demY.toFixed(2) });
  for (const side of [-1, 1]) {
    const wx = q.x + q.hx * 0 /* along */ + (-q.hz) * side * 8, wz = q.z + q.hz * 0 + q.hx * side * 8;
    const h = expressRoadHeight(wx, wz, ex.pts);
    assert.equal(h, EXPRESS_ROAD_Y, `차로 ${side} ${q.s.toFixed(0)}`);
    const dy = cheonggyeHeightAt(wx, wz, dem, streets, ex.pts);
    if (dy != null && dy > EXPRESS_ROAD_Y + 0.02) buried.push({ s: +q.s.toFixed(1), x: +wx.toFixed(1), z: +wz.toFixed(1), demY: +dy.toFixed(2), lane: side });
  }
}
assert.deepEqual(sink, [], `차가 노면보다 낮음 ${JSON.stringify(sink[0] || {})}`);
assert.deepEqual(buried, [], `노면이 지형에 묻힘 ${JSON.stringify(buried[0] || {})}`);
assert.ok(EXPRESS_PAVE_R > 27, '4+4 바깥 갓길까지 덮는 반경');
assert.ok(pointInBox(-4782.8, -9114.0, CHEONGGYE_ISLAND) && pointInBox(-4720.9, -8974.6, CHEONGGYE_ISLAND));

// 화면에 깔리는 지면 메시(도로 근처 10m 칸)가 차로 폭 전체에서 노면보다 낮아야 한다.
// 고치기 전엔 50m 칸 보간으로 잔디가 아스팔트를 덮었다.
const meshBuried = [];
const dense = sampleExpressPts(ex.pts, 10);
const offsets = [];
for (let o = -30; o <= 30; o += 2) offsets.push(o);
for (const q of dense) {
  const lx = -q.hz, lz = q.hx;
  for (const off of offsets) {
    const wx = q.x + lx * off, wz = q.z + lz * off;
    const mh = cheonggyeMeshHeightAt(wx, wz, dem, streets, ex.pts);
    if (mh != null && mh > EXPRESS_ROAD_Y - 0.08) {
      meshBuried.push({ s: +q.s.toFixed(1), off, x: +wx.toFixed(1), z: +wz.toFixed(1), meshY: +mh.toFixed(3) });
    }
  }
}
assert.deepEqual(meshBuried, [], `메시 지면이 노면을 덮음 ${JSON.stringify(meshBuried[0] || {})} (${meshBuried.length}곳)`);

const streetBuried = [];
for (const r of streets.roads || []) {
  const pts = r.p || [];
  if (pts.length < 2) continue;
  const y0 = 0.20; // 청계산로 리본 ≈ ROAD_STYLE y + 0.12
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const seg = Math.hypot(bx - ax, bz - az) || 1e-9;
    const hx = (bx - ax) / seg, hz = (bz - az) / seg, lx = -hz, lz = hx;
    const hw = (r.w || 6) * 0.5;
    for (let t = 0; t <= seg; t += 6) {
      const x = ax + hx * t, z = az + hz * t;
      for (const off of [-hw, 0, hw]) {
        const mh = cheonggyeMeshHeightAt(x + lx * off, z + lz * off, dem, streets, ex.pts);
        if (mh != null && mh > y0 - 0.06) {
          streetBuried.push({ name: r.name || r.id, x: +(x + lx * off).toFixed(1), z: +(z + lz * off).toFixed(1), meshY: +mh.toFixed(3), roadY: y0 });
        }
      }
    }
  }
}
assert.deepEqual(streetBuried, [], `청계산로가 지형에 묻힘 ${JSON.stringify(streetBuried[0] || {})} (${streetBuried.length}곳)`);

const trunk = ex.pts.filter((p) => p[3] === 'main' || p[3] === 'spur');
const median = expresswayMedianLine(trunk);
assert.ok(median.length > 80, `분리대 샘플 ${median.length}`);
let maxGap = 0, maxTurn = 0;
for (let i = 1; i < median.length; i++) {
  const d = Math.hypot(median[i].x - median[i - 1].x, median[i].z - median[i - 1].z);
  if (d > maxGap) maxGap = d;
  assert.ok(d > 0.8 && d < 12, `분리대 간격 ${d.toFixed(2)}m @${i}`);
  if (i >= 2) {
    const h0 = Math.atan2(median[i - 1].x - median[i - 2].x, median[i - 1].z - median[i - 2].z);
    const h1 = Math.atan2(median[i].x - median[i - 1].x, median[i].z - median[i - 1].z);
    let dh = Math.abs(h1 - h0);
    if (dh > Math.PI) dh = Math.PI * 2 - dh;
    if (dh > maxTurn) maxTurn = dh;
  }
}
assert.ok(maxGap < 12, `분리대 최대 간격 ${maxGap.toFixed(2)}m`);
assert.ok(maxTurn < 0.50, `분리대 최대 꺾임 ${(maxTurn * 180 / Math.PI).toFixed(1)}deg / 5m`);

const decked = ex.pts.filter((p) => p[3] === 'main' || p[3] === 'spur' || (p[3] === 'approach' && (p[0] < -200 || !inPangyoCity(p[0], p[1]))));
const approachDeck = decked.filter((p) => p[3] === 'approach');
assert.ok(approachDeck.length > 40, `접근로 차도 점 ${approachDeck.length}`);
assert.ok(approachDeck.every((p) => p[0] < -180), '접근로 차도는 판교 시가 서쪽에서 시작');
assert.ok(approachDeck.some((p) => nearPangyoToll(p[0], p[1], 80)), '접근로 차도가 판교요금소를 지남');
assert.ok(nearPangyoToll(PANGYO_TG.x, PANGYO_TG.z));
const gySrc = fs.readFileSync(path.join(root, 'src/corridor/gyeongbuExpress.js'), 'utf8');
assert.ok(gySrc.includes('gyeongbuApproachFill'));
assert.ok(gySrc.includes('nearPangyoToll'));
assert.ok(gySrc.includes('keepDeckPoint'));
assert.ok(/notToll\(s\)/.test(gySrc) && gySrc.includes('wallBoxGeo(run, medOff'));
const idxSrc = fs.readFileSync(path.join(root, 'src/corridor/index.js'), 'utf8');
assert.ok(idxSrc.includes('setExpressHeightExtra') && idxSrc.includes('buildExpressHeightProfile'));

const pangyo = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/pangyo/express.json'), 'utf8'));
function pangyoY(x, z) {
  let best = null;
  for (const l of pangyo.lines || []) {
    const pts = l.pts || [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const hw = Math.max(a[3] || 8, b[3] || 8) / 2 + 1.5;
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
      if (Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) > hw) continue;
      const y = a[2] + (b[2] - a[2]) * t;
      if (best == null || y > best) best = y;
    }
  }
  return best;
}
setExpressHeightExtra(buildExpressHeightProfile(ex.pts, pangyoY));

const MAX_STEP = 0.5;
const ride = sampleExpressPts(ex.pts, 5);
assert.ok(ride.length > 200, `전 구간 샘플 ${ride.length}`);
let playerY = expressRoadHeight(ride[0].x, ride[0].z, ex.pts);
assert.ok(playerY != null);
const heightMiss = [];
let maxRise = 0;
for (const q of ride) {
  const road = expressRoadHeight(q.x, q.z, ex.pts);
  if (road == null) {
    heightMiss.push({ s: +q.s.toFixed(1), x: +q.x.toFixed(1), z: +q.z.toFixed(1), why: 'no-road' });
    continue;
  }
  let h = 0;
  if (road > h && road <= playerY + MAX_STEP + 0.1) h = road;
  if (Math.abs(h - road) > 0.02 || Math.abs(playerY - road) > 0.61) {
    heightMiss.push({ s: +q.s.toFixed(1), player: +playerY.toFixed(3), next: +road.toFixed(3), got: +h.toFixed(3) });
  }
  const rise = Math.abs(road - playerY);
  if (rise > maxRise) maxRise = rise;
  playerY = h;
}
assert.deepEqual(heightMiss, [], `전 구간 높이가 노면과 다름 ${JSON.stringify(heightMiss[0] || {})} (${heightMiss.length}곳)`);

const tgRide = ride.filter((q) => nearPangyoToll(q.x, q.z, 80));
assert.ok(tgRide.length > 4, `요금소 부근 샘플 ${tgRide.length}`);
for (const q of tgRide) {
  const road = expressRoadHeight(q.x, q.z, ex.pts);
  assert.ok(road != null && road >= EXPRESS_ROAD_Y - 0.001, `요금소 노면 ${q.s.toFixed(0)} y=${road}`);
}

const cityEdge = ride.find((q) => q.x < -200 && q.kind === 'approach');
assert.ok(cityEdge, '판교 시가 서쪽 접근로 샘플');
assert.equal(expressRoadHeight(cityEdge.x, cityEdge.z, ex.pts) != null, true);

console.log(`gyeongbu route: ${samples.length} pts / 20m, dense ${dense.length}×${offsets.length} 메시, 분리대 ${median.length} (gap≤${maxGap.toFixed(2)}m turn≤${(maxTurn * 180 / Math.PI).toFixed(1)}°), 노면 y=${EXPRESS_ROAD_Y}, 전구간 ${ride.length} (Δy≤${maxRise.toFixed(3)}m/5m), 접근로 ${approachDeck.length}. 고치기 전 막힘 ${stuckBefore.length}곳 첫 s=${first.s.toFixed(0)} (${first.x.toFixed(1)}, ${first.z.toFixed(1)})`);
