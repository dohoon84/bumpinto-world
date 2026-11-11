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
import { makeForeignFn } from '../../../src/corridor/islands.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const dem = J('public/corridor/hangang/hangang-dem.json');
const osm = J('public/corridor/hangang/hangang-osm.json');
const hap = { dem: J('public/corridor/hangang/hap-dem.json'), osm: J('public/corridor/hangang/hap-osm.json') };
let n = 0;
const ok = (s) => { n++; console.log('ok', n, s); };

// 다른 지역 기준점 (월드 좌표, 정자역 원점, hangangCoords.projectLatLon 과 같은 투영). 남산서울타워는 OSM 37.55127,126.98830.
const PLACES = {
  '정자동 스폰': [0, 8],
  '서현역': [1325, -2035],
  '탄천 코리더(수내)': [600, -1800],
  '남산서울타워': [-10622, -20424],
  '강남역': [-7098, -14453],
};

// 실제 코리더 섬 (develop 런타임 index.meta.islands / corridors 와 같은 값: 본선(정자~탄천), 강남역, 양재, 남산)
const ISLANDS = [
  { x0: -2500, x1: 3500, z0: -18000, z1: 2500 },
  { x0: -7500, x1: -6000, z0: -15500, z1: -14000 },
  { x0: -5650, x1: -3450, z0: -10000, z1: -8150 },
];
const foreign = makeForeignFn(ISLANDS, []);
const scene = new THREE.Scene();
const surfaces = [];
const terrain = { addGroundSurface: (f) => surfaces.push(f) };
const hg = createHangang({ scene, overlay: null, terrain, dem, osm, hap, foreign });
assert.ok(hg?.bounds, 'hangang bounds');
const B = hg.bounds;
console.log('hangang bounds', JSON.stringify(B));
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
  player.position.set(x, 0, z);
  hg.setNight(1);
  hg.tickPlayer(0.016, player);
  assert.equal(visibleLights(), 0, `${name}: no hangang light reaches shaders`);
  assert.equal(hg.coversTileFlat(x, z), false, `${name}: tile floor not clipped`);
  for (const f of surfaces) assert.equal(f(x, z, Infinity), null, `${name}: no hangang ground surface`);
  assert.equal(hg.heightAt(x, z), null, `${name}: no hangang height`);
  assert.equal(hg.owns(x, z), false, `${name}: not hangang land`);
  ok(`${name}: 0 hangang lights, no ground surface, tile floor untouched`);
}

{
  // 2구간 DEM 사각형이 강남역 섬을 덮지만, 그 안에는 한강 지형·수면 삼각형이 없어야 한다.
  const g = ISLANDS[1];
  let inside = 0;
  hg.root.traverse((o) => {
    if (!o.isMesh || !(o.name === 'hangang-dem' || o.name === 'hangang-water')) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const n = idx ? idx.count : pos.count, v = (i) => (idx ? idx.getX(i) : i);
    for (let i = 0; i + 2 < n; i += 3) {
      const cx = (pos.getX(v(i)) + pos.getX(v(i + 1)) + pos.getX(v(i + 2))) / 3;
      const cz = (pos.getZ(v(i)) + pos.getZ(v(i + 1)) + pos.getZ(v(i + 2))) / 3;
      if (cx > g.x0 && cx < g.x1 && cz > g.z0 && cz < g.z1) inside++;
    }
  });
  assert.equal(inside, 0, `hangang terrain/water triangles inside 강남역 island: ${inside}`);
  ok('no hangang terrain/water triangles inside the 강남역 island');
  const hapPt = hg.spawns['tancheon-hap'];
  assert.ok(hg.owns(hapPt.x, hapPt.z) && surfaces[0](hapPt.x, hapPt.z, Infinity) != null, '합수부 still hangang ground');
  ok('합수부 is still hangang ground');
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

  // 한강에서 강남역으로 바로 가면, 2구간 박스 안이지만 다른 섬이므로 조명을 꺼야 한다.
  // (ownDist 가 1구간 반포까지 거리(~1 km)로 남으면 히스테리시스 때문에 불이 유지된다.)
  player.position.set(s.x, 0, s.z);
  hg.tickPlayer(1, player);
  assert.ok(visibleLights() > 0, 'lights on at hangang before 강남역 hop');
  const [gx, gz] = PLACES['강남역'];
  player.position.set(gx, 0, gz);
  hg.tickPlayer(1, player);
  assert.ok(hg.ownDist(gx, gz) > 1200, `강남역 ownDist ${hg.ownDist(gx, gz)} should be far`);
  assert.equal(visibleLights(), 0, '강남역 after hangang: hangang lights hidden');
  ok('hopping from hangang to 강남역 hides pool lights');
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
