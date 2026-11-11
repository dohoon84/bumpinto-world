// [hangang-isolation] 한강 코스가 정자·서현·강남역·남산·탄천 등 다른 지역 렌더링을 건드리지 않는지 확인한다.
//   node scripts/corridor/test/test-hangang-isolation.mjs
//   회귀 배경: 한강 가로등·반포대교 아랫면마다 PointLight 를 심어 장면 점광원이 343개가 됐고,
//   모든 조명 재질 셰이더가 실제 GPU 의 fragment uniform 한도(보통 1024 vec4)를 넘어
//   정자동 기본 스폰에서도 땅·도로·건물이 안 그려지고 이름표만 떴다.
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { createHangang } from '../../../src/corridor/landmarks/hangang.js';
import { setFlatClip, clipFlatGeometry, clipOutsideRect } from '../../../src/corridor/tileMesh.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const dem = J('public/corridor/hangang/hangang-dem.json');
const osm = J('public/corridor/hangang/hangang-osm.json');
const hap = { dem: J('public/corridor/hangang/hap-dem.json'), osm: J('public/corridor/hangang/hap-osm.json') };
let n = 0;
const ok = (s) => { n++; console.log('ok', n, s); };

// 다른 지역 기준점 (월드 좌표, 정자역 원점). 남산·강남은 한강 북쪽/남쪽이지만 한강 경계 밖이다.
const PLACES = {
  '정자동 스폰': [0, 8],
  '서현': [2300, -2600],
  '탄천 코리더(수내)': [600, -1800],
  '강남역': [-7600, -9900],
};

const scene = new THREE.Scene();
const hg = createHangang({ scene, overlay: null, terrain: null, dem, osm, hap });
assert.ok(hg?.bounds, 'hangang bounds');
const B = hg.bounds;
const count = () => { let c = 0; scene.traverse((o) => { if (o.isLight) c++; }); return c; };
const visibleLights = () => { let c = 0; scene.traverseVisible((o) => { if (o.isLight) c++; }); return c; };

{
  const c = count();
  // 실제 GPU 한도: 점광원 하나가 fragment uniform 3~4 vec4. 기존 장면 5개 + 한강 풀이 수십을 넘으면 안 된다.
  assert.ok(c <= 16, `hangang PointLights ${c} (must be a small fixed pool, was 338)`);
  ok(`hangang point lights total ${c} (fixed pool, was 338)`);
}

const player = { position: new THREE.Vector3() };
for (const [name, [x, z]] of Object.entries(PLACES)) {
  const inside = x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1;
  assert.ok(!inside, `${name} must be outside hangang bounds`);
  player.position.set(x, 0, z);
  hg.setNight(1);
  hg.tickPlayer(0.016, player);
  assert.equal(visibleLights(), 0, `${name}: no hangang light reaches shaders`);
  assert.equal(hg.coversTileFlat(x, z), false, `${name}: tile floor not clipped`);
  ok(`${name}: 0 hangang lights in shaders, tile floor untouched`);
}

{
  // 한강 안에서는 풀 점광원이 켜지고 개수는 고정이다.
  const s = hg.spawn;
  player.position.set(s.x, 0, s.z);
  hg.setNight(1);
  hg.tickPlayer(1, player);
  const v = visibleLights();
  assert.ok(v > 0 && v === count(), `hangang spawn: pool lights visible (${v})`);
  let lit = 0; scene.traverse((o) => { if (o.isLight && o.intensity > 0) lit++; });
  assert.ok(lit > 0, 'night lamps near 반포 spawn are lit');
  ok(`반포 spawn: ${v} pool lights visible, ${lit} lit at night`);
  player.position.set(0, 0, 8);
  hg.tickPlayer(1, player);
  assert.equal(visibleLights(), 0, 'lights hidden again after leaving hangang');
  ok('leaving hangang hides pool lights again');
}

{
  // 코리더 타일 바닥 클립: 한강 사각형 밖 삼각형은 그대로 (정자·서현·탄천 타일).
  const rect = hg.hap?.flatClipRect?.();
  assert.ok(rect, 'hap flatClipRect');
  assert.ok(rect.z1 <= -15800, 'clip rect stays at 한강 남단');
  setFlatClip((x, z) => hg.coversTileFlat(x, z));
  for (const [name, [x, z]] of Object.entries(PLACES)) {
    const g = new THREE.PlaneGeometry(400, 400, 8, 8); g.rotateX(-Math.PI / 2); g.translate(x, 0, z);
    const before = g.index.count;
    clipFlatGeometry(g);
    assert.equal(g.index.count, before, `${name}: tile flat triangles kept`);
    const g2 = new THREE.PlaneGeometry(400, 400, 8, 8); g2.rotateX(-Math.PI / 2); g2.translate(x, 0, z);
    assert.equal(clipOutsideRect(g2, rect), g2, `${name}: outer ground untouched`);
  }
  setFlatClip(null);
  ok('tile flat / outer ground outside the hangang rect are unchanged');
}

console.log(`hangang-isolation ${n} checks passed`);
