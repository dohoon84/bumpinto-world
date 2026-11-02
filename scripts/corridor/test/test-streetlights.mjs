// [streetlights] 가로등 배치 데이터 + 런타임 모듈 테스트: node scripts/corridor/test/test-streetlights.mjs
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { setEvening } from '../../../src/evening.js';
import { createStreetlights, buildStreetlightGeometries } from '../../../src/world/streetlights.js';
import { createTerrain } from '../../../src/world/terrain.js';
import { mergeTancheon } from '../../../src/corridor/tancheon.js';

const ROOT = new URL('../../../', import.meta.url).pathname;
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const FILE = 'public/corridor/streetlights.json';
const data = J(FILE);

// 1) 결정적: 다시 구우면 커밋된 파일과 바이트 단위로 같다
{
  const tmp = path.join(os.tmpdir(), `streetlights-test-${process.pid}.json`);
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/corridor/build-streetlights.mjs'), `--out=${tmp}`], { stdio: 'pipe' });
  assert.equal(fs.readFileSync(tmp, 'utf8'), fs.readFileSync(path.join(ROOT, FILE), 'utf8'), '다시 구운 결과가 커밋된 streetlights.json 과 다름 (npm run corridor:streetlights)');
  fs.rmSync(tmp);
}

// 2) 데이터 규칙
const lamps = [];
for (const [k, a] of Object.entries(data.cells)) {
  assert.equal(a.length % 4, 0);
  for (let i = 0; i < a.length; i += 4) {
    const l = { x: a[i], z: a[i + 1], yaw: a[i + 2], kind: a[i + 3] };
    assert.equal(`${Math.floor(l.x / data.cell)}_${Math.floor(l.z / data.cell)}`, k, '칸 키가 좌표와 다름');
    assert.ok(l.yaw >= 0 && l.yaw <= Math.PI + 1e-3 && [0, 1, 2, 3].includes(l.kind));
    lamps.push(l);
  }
}
const c = data.meta.counts;
assert.equal(lamps.length, c.total);
assert.equal(c.osm + c.generated, c.total);
assert.equal(Object.values(c.byClass).reduce((a, b) => a + b, 0) + c.tancheon, c.generated);
assert.equal(lamps.filter((l) => l.kind === 3).length, c.tancheon, '탄천 공원등 수');
assert.ok(c.tancheon > 500, `탄천 공원등이 너무 적음: ${c.tancheon}`);
assert.ok(c.tancheonLive > 50, '정자 구간 탄천 공원등이 너무 적음');
assert.equal(lamps.filter((l) => l.kind === 2).length, c.osm, 'OSM 가로등 수');
assert.ok(c.osm > 0, 'OSM highway=street_lamp 노드를 하나도 안 씀');
assert.ok(c.live > 300, '정자(라이브) 구간 가로등이 너무 적음');
assert.ok(c.total > 8000 && c.total < 30000, `총 개수 이상: ${c.total}`);

const CI = J('public/corridor/index.json'), live = J('public/jeongja.json'), base = J('public/corridor/base.json');
const LB = CI.meta.liveBox;
const inLive = (x, z) => x >= LB.x0 && x <= LB.x1 && z >= LB.z0 && z <= LB.z1;
const roads = [...live.roads, ...base.ch], rings = live.buildings.filter((b) => !((b.mh || 0) >= 2.5)).map((b) => b.o);
for (const k of Object.keys(CI.tiles)) { const t = J(`public/corridor/tiles/${k}.json`); roads.push(...t.r); for (const b of t.b) if (!((b.mh || 0) >= 2.5)) rings.push(b.o); }
const CAR = /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|road|service|busway)/;
const G = 50, grid = new Map(), add = (x, z, v) => { const key = Math.floor(x / G) + ',' + Math.floor(z / G); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(v); };
const near = (x, z) => { const out = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(grid.get((Math.floor(x / G) + i) + ',' + (Math.floor(z / G) + j)) || [])); return out; };
const sd = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z); };
for (const r of roads) if (CAR.test(r.k) || r.br) for (let i = 1; i < r.p.length; i++) { const s = { a: r.p[i - 1], b: r.p[i], hw: r.w / 2, br: !!r.br, k: r.k }; for (let t = 0; t <= 1; t += 0.1) add(s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t, s); }
const inRing = (x, z, o) => { let q = false; for (let i = 0, j = o.length - 1; i < o.length; j = i++) { const [xi, zi] = o[i], [xj, zj] = o[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) q = !q; } return q; };
const bgrid = new Map(); rings.forEach((o) => { const [x, z] = o[0], key = Math.floor(x / 100) + ',' + Math.floor(z / 100); if (!bgrid.has(key)) bgrid.set(key, []); bgrid.get(key).push(o); });
const nearB = (x, z) => { const out = []; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) out.push(...(bgrid.get((Math.floor(x / 100) + i) + ',' + (Math.floor(z / 100) + j)) || [])); return out; };
let bad = { road: 0, bridge: 0, bld: 0, area: 0 };
for (const l of lamps) {
  if (!inLive(l.x, l.z) && !CI.tiles[`${Math.floor(l.x / 500)}_${Math.floor(l.z / 500)}`]) bad.area++;
  for (const s of new Set(near(l.x, l.z))) {
    const d = sd(l.x, l.z, s.a, s.b);
    if (s.br && d < s.hw + 2.9) { bad.bridge++; break; }
    if (l.kind !== 2 && !s.br && CAR.test(s.k) && d < s.hw + 0.25) { bad.road++; break; }
  }
  if (nearB(l.x, l.z).some((o) => inRing(l.x, l.z, o))) bad.bld++;
}
assert.deepEqual(bad, { road: 0, bridge: 0, bld: 0, area: 0 }, '규칙 위반 가로등');
// 탄천 공원등: 게임 지형의 탄천 단면 안(물·하상 아님), 다리 아님(위에서 확인)
{
  const T = mergeTancheon(J('public/terrain.json'), J('public/corridor/tancheon.json'));
  const terrain = createTerrain(T, live), FLOOR = T.params.FLOOR, N = T.axis.length;
  let off = 0, wet = 0;
  for (const l of lamps) {
    if (l.kind !== 3) continue;
    const q = terrain.project(l.x, l.z);
    if (!q || q.end) { off++; continue; }
    const sd2 = q.d < 0 ? 'L' : 'R', j = Math.min(N - 1, q.i + 1), f = (k) => T.prof[k + sd2][q.i] * (1 - q.t) + T.prof[k + sd2][j] * q.t;
    if (Math.abs(q.d) > f('top') + 8.5) off++;
    if (Math.abs(q.d) < f('w') + 1.4 || terrain.renderHeight(l.x, l.z) < FLOOR - 0.2) wet++;
  }
  assert.deepEqual({ off, wet }, { off: 0, wet: 0 }, '탄천 공원등이 단면 밖이거나 물·하상 위');
}
// 횡단보도 바로 옆 없음
const crossings = [...base.crossings, ...J('public/transit.json').crossings];
const atCross = lamps.filter((l) => l.kind !== 2 && crossings.some((q) => { const [dx, dz] = q.dir || [1, 0], rx = l.x - q.x, rz = l.z - q.z; return Math.abs(rx * dx + rz * dz) < 4 && Math.abs(-rx * dz + rz * dx) < (q.w || 8) / 2 + 1.5; }));
assert.equal(atCross.length, 0, '횡단보도 위/옆 가로등');
// 서로 너무 가깝지 않음(같은 자리 중복 없음)
{
  const g = new Map(); let dup = 0;
  for (const l of lamps) { const key = Math.floor(l.x / 10) + ',' + Math.floor(l.z / 10); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of g.get((Math.floor(l.x / 10) + i) + ',' + (Math.floor(l.z / 10) + j)) || []) if (l.kind !== 2 && o.kind !== 2 && Math.hypot(o.x - l.x, o.z - l.z) < 8) dup++; if (!g.has(key)) g.set(key, []); g.get(key).push(l); }
  assert.equal(dup, 0, '8 m 안에 겹친 가로등');
}

// 3) 런타임: 부품 3개(InstancedMesh), 타일 게이트, 밤 페이드, 해제
const geo = buildStreetlightGeometries();
const triCount = Object.values(geo).reduce((a, g) => a + (g.index ? g.index.count : g.attributes.position.count) / 3, 0);
assert.ok(triCount <= 100, `가로등 하나 삼각형이 너무 많음: ${triCount}`);
assert.ok(!geo.body.attributes.uv && !geo.lens.attributes.uv, '텍스처 좌표 없음');
Object.values(geo).forEach((g) => g.dispose());

let fetched = 0;
globalThis.fetch = async () => { fetched++; return { ok: true, json: async () => data }; };
const st = CI.stations.find((s) => s.id === 'sunae');
const tk = `${Math.floor(st.x / 500)}_${Math.floor(st.z / 500)}`;
const tiles = new Map(Object.keys(CI.tiles).map((k) => [k, { dState: 0 }]));
const scene = new THREE.Scene();
const sl = createStreetlights({ scene, terrain: null, corridor: { tiles }, liveBox: LB, url: 'x' });
await sl.ready;
assert.equal(fetched, 1);
assert.equal(sl.stats.lamps, c.total);
const inst = () => sl.root.children.filter((o) => o.isInstancedMesh);
setEvening(false);
sl.update(1, st.x, st.z);
assert.equal(inst().length, 0, '타일이 안 빌드됐으면 코리더 가로등 없음');
tiles.get(tk).dState = 3;
sl.update(1, st.x, st.z);
assert.equal(inst().length, 3, 'InstancedMesh 3개(기둥·램프·웅덩이)');
const n = sl.stats.visible;
assert.ok(n > 20, `수내 주변 가로등이 너무 적음: ${n}`);
assert.ok(inst().every((m) => m.count === n));
const pool = inst().find((m) => m.name === 'streetlight-pool');
assert.equal(pool.visible, false, '낮엔 웅덩이 숨김');
setEvening(true);
for (let i = 0; i < 10; i++) sl.update(0.5, st.x, st.z);
assert.equal(sl.stats.night, 1);
assert.equal(pool.visible, true, '밤엔 웅덩이');
assert.equal(pool.material.uniforms.uNight.value, 1);
assert.equal(pool.material.blending, THREE.AdditiveBlending);
// 정자 라이브 구간은 타일 없이도 보임
sl.update(1, 0, 0);
assert.ok(sl.stats.visible > 50, '정자 라이브 구간 가로등');
// 타일 언로드 → 그 칸 빠짐, 멀리 가면 GPU 버퍼 해제
tiles.get(tk).dState = 0;
sl.update(1, st.x, st.z);
assert.ok(sl.stats.visible < n);
sl.update(1, 50000, 50000);
assert.equal(inst().length, 0, '보이는 게 없으면 메시 해제');
// 위에서 보기(밤): 상세 타일이 없어도 웅덩이만 그림(기둥·램프 0), 개수 상한, 낮엔 아무것도 없음
sl.update(1, st.x, st.z, 'overview');
const byName = (k) => inst().find((m) => m.name === 'streetlight-' + k);
assert.equal(inst().length, 3);
assert.ok(sl.stats.overview > 200 && sl.stats.overview <= 8192, `위에서 보기 웅덩이 수 ${sl.stats.overview}`);
assert.equal(byName('pool').count, sl.stats.overview);
assert.equal(byName('pool').visible, true);
assert.equal(byName('body').visible, false, '위에서 보기엔 기둥 없음');
assert.equal(byName('lens').visible, false);
const ovN = sl.stats.overview;
setEvening(false);
for (let i = 0; i < 10; i++) sl.update(0.5, st.x, st.z, 'overview');
assert.equal(inst().length, 0, '낮의 위에서 보기엔 메시 없음');
setEvening(true);
for (let i = 0; i < 10; i++) sl.update(0.5, st.x, st.z, 'overview');
assert.equal(sl.stats.overview, ovN);
tiles.get(tk).dState = 3;
sl.update(1, st.x, st.z);
assert.equal(byName('body').visible, true, '걸어다니기로 돌아오면 기둥 다시');
assert.equal(sl.stats.visible, n);
sl.dispose();
assert.equal(scene.children.length, 0);
// 둔치 바닥(-6 m): 차도 가로등은 건너뛰고 탄천 공원등(kind 3)만 선다
{
  const one = { v: 1, cell: data.cell, cells: { '0_0': [10, 10, 0, 0, 20, 20, 0, 3, 30, 30, 0, 1] } };
  globalThis.fetch = async () => ({ ok: true, json: async () => one });
  const sc = new THREE.Scene();
  const s2 = createStreetlights({ scene: sc, terrain: { renderHeight: () => -6, params: { FLOOR: -6 } }, corridor: null, liveBox: { x0: 0, x1: 100, z0: 0, z1: 100 }, url: 'x' });
  await s2.ready; s2.update(1, 20, 20);
  assert.equal(s2.stats.visible, 1, '둔치에선 공원등만');
  s2.dispose();
}
setEvening(false);

console.log(`test-streetlights: ok (${c.total} lamps · OSM ${c.osm} · 탄천 ${c.tancheon} · ${triCount} tris/lamp · Sunae visible ${n} · overview ${ovN})`);
