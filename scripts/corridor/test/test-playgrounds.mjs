// [playgrounds] 놀이터 세트 데이터·런타임 테스트: node scripts/corridor/test/test-playgrounds.mjs
//   - public/corridor/playgrounds.json 의 모든 세트가 건물과 겹치지 않고 차도에 걸치지 않으며 서로 겹치지 않는지 (베이크와 독립 구현)
//   - 꿈동산어린이공원(예외 목록) 포함 · 놀이터당 최대 2세트 · 배율 범위
//   - 세트 삼각형 수 · InstancedMesh 5개 · 거리/타일 컬링 · 안 보이면 GPU 리소스 해제
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Scene } from 'three';
import { buildPartGeometries, triangleCount, createPlaygrounds, SET_W, SET_D } from '../../../src/world/playgrounds.js';

const D = new URL('../../../public/', import.meta.url);
const J = (f) => JSON.parse(fs.readFileSync(new URL(f, D)));
const pg = J('corridor/playgrounds.json'), index = J('corridor/index.json'), live = J('jeongja.json'), base = J('corridor/base.json');

// ---- 데이터 ----
assert.deepEqual(pg.meta.set, { w: SET_W, d: SET_D }, 'set size must match runtime');
const dream = pg.playgrounds.find((p) => p.id === 'way/429371477');
assert.ok(dream && dream.extra && dream.sets.length >= 1, '꿈동산어린이공원 override placed');
const all = [];
for (const p of pg.playgrounds) {
  assert.ok(p.sets.length >= 1 && p.sets.length <= 2, p.id + ' 1..2 sets');
  for (const [x, z, ry, s] of p.sets) { assert.ok(s >= 0.6 && s <= 1, 'scale'); all.push({ id: p.id, x, z, ry, s }); }
}
assert.equal(all.length, pg.meta.stats.sets);
assert.equal(pg.playgrounds.length, pg.meta.stats.placed);
assert.equal(pg.meta.stats.placed + pg.meta.stats.skipped, pg.meta.stats.polygons);

const rect = ({ x, z, ry, s }) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
  const lx = (a * SET_W * s) / 2, lz = (b * SET_D * s) / 2;
  return [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
});
// 볼록 다각형 분리축 판정 (건물은 볼록 껍질 대신 꼭짓점·변 교차로)
const inRing = (x, z, o) => { let c = false; for (let i = 0, j = o.length - 1; i < o.length; j = i++) { const [xi, zi] = o[i], [xj, zj] = o[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
const overlap = (A, B) => A.some(([x, z]) => inRing(x, z, B)) || B.some(([x, z]) => inRing(x, z, A)) || A.some((a, i) => B.some((b, j) => cross(a, A[(i + 1) % A.length], b, B[(j + 1) % B.length])));
const sd = (x, z, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); return Math.hypot(x - ax - dx * k, z - az - dz * k); };

const rings = live.buildings.map((b) => b.o), roads = [...live.roads, ...base.ch];
for (const k of Object.keys(index.tiles)) { const t = J(`corridor/tiles/${k}.json`); for (const b of t.b) rings.push(b.o); roads.push(...t.r); }
const CAR = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street)/;
const carSegs = []; for (const r of roads) if (CAR.test(r.k)) for (let i = 1; i < r.p.length; i++) carSegs.push([r.p[i - 1], r.p[i], r.w / 2]);
let bad = 0;
for (const st of all) {
  const R = rect(st), near = (p) => Math.abs(p[0] - st.x) < 200 && Math.abs(p[1] - st.z) < 200;
  for (const o of rings) if (near(o[0]) && overlap(R, o)) { bad++; console.error('building overlap', st.id); break; }
  // 세트 바닥을 1m 간격으로 훑어 차도 리본 안에 드는 점이 없는지
  const segs = carSegs.filter(([a, b]) => near(a) || near(b));
  const hit = (() => { for (let a = -1; a <= 1.001; a += 2 / Math.ceil(SET_W * st.s)) for (let b = -1; b <= 1.001; b += 2 / Math.ceil(SET_D * st.s)) {
    const lx = (a * SET_W * st.s) / 2, lz = (b * SET_D * st.s) / 2, x = st.x + lx * Math.cos(st.ry) + lz * Math.sin(st.ry), z = st.z - lx * Math.sin(st.ry) + lz * Math.cos(st.ry);
    if (segs.some(([p, q, hw]) => sd(x, z, p, q) < hw)) return true;
  } return false; })();
  if (hit) { bad++; console.error('road intrusion', st.id); }
}
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
  if (Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) > 25) continue;
  if (overlap(rect(all[i]), rect(all[j]))) { bad++; console.error('set overlap', all[i].id, all[j].id); }
}
assert.equal(bad, 0, 'no building / road / set conflicts');

// ---- 지오메트리 ----
const geos = buildPartGeometries();
assert.equal(geos.length, 5, '5 part types → 5 InstancedMesh');
const tris = triangleCount(geos);
assert.ok(tris <= 1000, `one set ${tris} tris ≤ 1000`);
for (const { geometry: g } of geos) { assert.ok(g.attributes.color && !g.attributes.uv, 'vertex colours, no uv'); const r = g.boundingSphere; assert.ok(Math.abs(r.center.x) + r.radius < 12, 'part inside set'); }

// ---- 런타임: 컬링 · 해제 ----
const json = JSON.stringify(pg);
globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(json) });
const scene = new Scene();
const states = new Map(); // 코리더 타일 상태 흉내
const corridor = { tiles: { get: (k) => ({ dState: states.get(k) ?? 0 }) } };
const L = live.meta.bboxLocal;
const P = createPlaygrounds({ scene, terrain: { renderHeight: () => 2 }, corridor, liveBox: L, url: 'x' });
await P.ready;
assert.equal(P.stats.sets, all.length);
const liveSet = P.sets.find((s) => !s.tile), farSet = P.sets.find((s) => s.tile);
assert.ok(liveSet && farSet);
const meshes = () => P.root.children.filter((m) => m.isInstancedMesh);
P.update(1, liveSet.x, liveSet.z);
assert.equal(meshes().length, 5);
assert.ok(meshes()[0].count >= 1 && P.stats.visible >= 1);
assert.equal(P.sets[0].parts[0].elements[13], 2, 'snapped to terrain height');
P.update(1, 1e5, 1e5); // 멀리: 모두 숨김 → 해제
assert.equal(meshes().length, 0, 'freed when nothing visible');
P.update(1, farSet.x, farSet.z); // 코리더 타일이 아직 안 빌드됨
assert.equal(meshes().length, 0, 'waits for corridor detail tile');
states.set(farSet.tile, 3);
P.update(1, farSet.x, farSet.z);
assert.ok(meshes().length === 5 && P.stats.visible >= 1, 'shows after tile built');
P.update(1, farSet.x, farSet.z, 'overview');
assert.equal(meshes().length, 0, 'hidden in overview');
P.dispose();
assert.equal(scene.children.length, 0);
console.log(`test-playgrounds OK · ${pg.meta.stats.placed} playgrounds (${pg.meta.stats.oneSet}×1 + ${pg.meta.stats.twoSets}×2) · ${all.length} sets · skipped ${pg.meta.stats.skipped} · ${tris} tris/set`);
