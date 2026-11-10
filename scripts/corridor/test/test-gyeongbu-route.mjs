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
} from '../../../src/corridor/gyeongbuWorld.js';
import { cheonggyeHeightAt } from '../../../src/corridor/cheonggyeTerrain.js';
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

console.log(`gyeongbu route: ${samples.length} pts / 20m, 왕복 통과, 노면 y=${EXPRESS_ROAD_Y}. 고치기 전 막힘 ${stuckBefore.length}곳 첫 s=${first.s.toFixed(0)} (${first.x.toFixed(1)}, ${first.z.toFixed(1)})`);
