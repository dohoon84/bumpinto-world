// [playgrounds] 놀이터 세트 데이터·런타임 테스트: node scripts/corridor/test/test-playgrounds.mjs
//   - public/corridor/playgrounds.json 의 모든 세트가 건물과 겹치지 않고 차도에 걸치지 않으며 서로 겹치지 않는지 (베이크와 독립 구현)
//   - 꿈동산어린이공원(예외 목록) 포함 · 놀이터당 최대 2세트 · 배율 범위
//   - 세트 삼각형 수 · InstancedMesh 5개 · 거리/타일 컬링 · 안 보이면 GPU 리소스 해제
//   - 조경(playground-land.json): 놀이터(또는 그 공원) 폴리곤 안 · 건물/물/차도 밖 · 세트 바닥 밖, 메시 3개 · ?pgland=0 동작
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Scene, ShaderLib } from 'three';
import { buildPartGeometries, triangleCount, createPlaygrounds, SET_W, SET_D } from '../../../src/world/playgrounds.js';
import { buildLandGeometries } from '../../../src/world/playgroundLand.js';

const D = new URL('../../../public/', import.meta.url);
const J = (f) => JSON.parse(fs.readFileSync(new URL(f, D)));
const pg = J('corridor/playgrounds.json'), landJ = J('corridor/playground-land.json'), index = J('corridor/index.json'), live = J('jeongja.json'), base = J('corridor/base.json');

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

// ---- 조경 데이터 (베이크와 독립): 원본 캐시의 OSM 폴리곤으로 확인 ----
const raw = JSON.parse(fs.readFileSync(new URL('../../../data/osm_playgrounds_raw.json', import.meta.url)));
const Cc = live.meta.center, kx = Math.cos((Cc.lat * Math.PI) / 180) * 111320, kz = 110540;
const proj = (g) => [(g.lon - Cc.lon) * kx, -(g.lat - Cc.lat) * kz];
const polyOf = new Map(), parkRings = [];
for (const e of raw.elements) if (e.type === 'way' && e.geometry) {
  const r = e.geometry.map(proj);
  if (e.tags?.leisure === 'playground' || e.id === 429371477) polyOf.set('way/' + e.id, r); else parkRings.push(r);
}
const waters = [...(live.water || []).map((w) => w.o)];
for (const k of Object.keys(index.tiles)) for (const w of J(`corridor/tiles/${k}.json`).water || []) waters.push(w.o);
const setsOf = new Map(); for (const st of all) { if (!setsOf.has(st.id)) setsOf.set(st.id, []); setsOf.get(st.id).push(st); }
const ptRect = (x, z, st) => { // 점 → 세트 바닥 사각형 거리 (안이면 0)
  const dx = x - st.x, dz = z - st.z, lx = dx * Math.cos(st.ry) - dz * Math.sin(st.ry), lz = dx * Math.sin(st.ry) + dz * Math.cos(st.ry);
  return Math.hypot(Math.max(0, Math.abs(lx) - (SET_W * st.s) / 2), Math.max(0, Math.abs(lz) - (SET_D * st.s) / 2));
};
const LS = landJ.meta.land, landCount = { t: 0, b: 0, h: 0, u: 0, g: 0 };
let lbad = 0;
const fail = (why, id, x, z) => { lbad++; if (lbad < 20) console.error('land', why, id, x, z); };
assert.equal(landJ.playgrounds.length, pg.playgrounds.length, 'land entry per placed playground');
for (const e of landJ.playgrounds) {
  const ring = polyOf.get(e.id); assert.ok(ring, 'polygon for ' + e.id);
  const near = (p) => Math.abs(p[0] - ring[0][0]) < 300 && Math.abs(p[1] - ring[0][1]) < 300;
  const bl = rings.filter((o) => near(o[0])), wl = waters.filter((o) => o.some(near) || inRing(ring[0][0], ring[0][1], o));
  const segs = carSegs.filter(([a, b]) => near(a) || near(b));
  const pts = [];
  for (const [x, z, s] of e.t || []) pts.push({ k: 't', x, z, s });
  for (const [x, z] of e.b || []) pts.push({ k: 'b', x, z });
  for (const [x0, z0, ang, n] of e.h || []) for (let i = 0; i < n; i++) pts.push({ k: 'h', x: x0 + Math.cos(ang) * LS.hedgeStep * i, z: z0 + Math.sin(ang) * LS.hedgeStep * i });
  for (const [x, z] of e.u || []) pts.push({ k: 'u', x, z });
  for (const [x, z] of e.g || []) pts.push({ k: 'g', x, z });
  for (const p of pts) {
    landCount[p.k]++;
    const inPg = inRing(p.x, p.z, ring);
    if (!inPg && !(p.k === 't' && parkRings.some((r) => inRing(p.x, p.z, r)))) fail('outside polygon', e.id, p.x, p.z);
    if (bl.some((o) => inRing(p.x, p.z, o))) fail('in building', e.id, p.x, p.z);
    if (wl.some((o) => inRing(p.x, p.z, o))) fail('in water', e.id, p.x, p.z);
    if (segs.some(([a, b, hw]) => sd(p.x, p.z, a, b) < hw)) fail('on car road', e.id, p.x, p.z);
    const dSet = Math.min(...all.filter((st) => Math.abs(st.x - p.x) < 30 && Math.abs(st.z - p.z) < 30).map((st) => ptRect(p.x, p.z, st)), Infinity);
    // 나무: 수관이 세트 위로 0.8m 넘게 걸치지 않음 · 그 밖: 세트 바닥 밖
    if (p.k === 't' ? dSet < LS.crownR * p.s - 0.45 : dSet < 0.3) fail('over set', e.id, p.x, p.z);
    if (p.k === 't') for (let a = 0; a < 6.28; a += 0.785) { // 수관이 건물에 안 들어감
      const cx = p.x + Math.cos(a) * LS.crownR * p.s * 0.95, cz = p.z + Math.sin(a) * LS.crownR * p.s * 0.95;
      if (bl.some((o) => inRing(cx, cz, o))) { fail('crown in building', e.id, p.x, p.z); break; }
    }
  }
}
assert.equal(lbad, 0, 'landscaping stays inside OSM polygons, off buildings/water/car roads/sets');
const ls = landJ.meta.stats;
assert.deepEqual([landCount.t, landCount.b, landCount.h, landCount.u, landCount.g], [ls.trees, ls.benches, ls.hedgeModules, ls.bushes, ls.grass], 'land stats');
const dreamLand = landJ.playgrounds.find((p) => p.id === 'way/429371477');
assert.ok(dreamLand.t?.length >= 4 && dreamLand.b?.length >= 1, '꿈동산 gets trees and benches');

// ---- 지오메트리 ----
const geos = buildPartGeometries();
assert.equal(geos.length, 5, '5 part types → 5 InstancedMesh');
const tris = triangleCount(geos);
assert.ok(tris <= 1000, `one set ${tris} tris ≤ 1000`);
for (const { geometry: g } of geos) { assert.ok(g.attributes.color && !g.attributes.uv, 'vertex colours, no uv'); const r = g.boundingSphere; assert.ok(Math.abs(r.center.x) + r.radius < 12, 'part inside set'); }

const lgeos = buildLandGeometries();
assert.deepEqual(lgeos.map((g) => g.name), ['tree', 'green', 'bench'], '3 landscaping InstancedMesh');
const ltris = Object.fromEntries(lgeos.map(({ name, geometry: g }) => [name, g.attributes.position.count / 3]));
for (const { geometry: g } of lgeos) assert.ok(g.attributes.color && !g.attributes.uv && g.attributes.position.count / 3 <= 60, 'land: vertex colours, ≤60 tris');
const matTris = triangleCount(buildPartGeometries({ mat: true })) - tris;
assert.ok(matTris > 0 && matTris <= 80, 'safety mat merged into sandbox');
assert.ok(ShaderLib.lambert.vertexShader.includes('#include <color_vertex>'), 'tree tint patch hook present');

// ---- 런타임: 컬링 · 해제 ----
const json = JSON.stringify(pg), ljson = JSON.stringify(landJ);
const fetched = [];
globalThis.fetch = async (u) => { fetched.push(u); return { ok: true, json: async () => JSON.parse(u === 'land' ? ljson : json) }; };
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
assert.deepEqual(fetched, ['x'], 'no land fetch without landUrl (?pgland=0)');

// 조경 켬: 같은 놀이터가 보일 때 메시 3개 더, 멀어지면 해제, overview 숨김
const Q = createPlaygrounds({ scene, terrain: { renderHeight: () => 2 }, corridor, liveBox: L, url: 'x', landUrl: 'land' });
await Q.ready;
const dreamSet = Q.sets.find((s) => s.id === 'way/429371477');
states.set(dreamSet.tile, 3);
Q.update(1, dreamSet.x, dreamSet.z);
const qm = () => Q.root.children.filter((m) => m.isInstancedMesh);
assert.equal(qm().length, 8, '5 set parts + 3 landscaping meshes');
const lm = Object.fromEntries(qm().map((m) => [m.name, m]));
assert.ok(lm['playground-land-tree'].count >= 4 && lm['playground-land-green'].count >= 10 && lm['playground-land-bench'].count >= 1);
assert.ok(lm['playground-land-tree'].castShadow && lm['playground-land-green'].castShadow && !lm['playground-land-bench'].castShadow);
const tm = new Float32Array(16); lm['playground-land-tree'].instanceMatrix.array.slice(0, 16).forEach((v, i) => (tm[i] = v));
assert.equal(tm[13], 2, 'land snapped to terrain');
Q.update(1, 1e5, 1e5);
assert.equal(qm().length, 0, 'land freed when far');
Q.update(1, dreamSet.x, dreamSet.z, 'overview');
assert.equal(qm().length, 0, 'land hidden in overview');
Q.dispose();
assert.equal(scene.children.length, 0);
console.log(`test-playgrounds land OK · trees ${ls.trees} · benches ${ls.benches} · hedge modules ${ls.hedgeModules} · bushes ${ls.bushes} · grass ${ls.grass} · tris ${JSON.stringify(ltris)} + mat ${matTris}`);
console.log(`test-playgrounds OK · ${pg.meta.stats.placed} playgrounds (${pg.meta.stats.oneSet}×1 + ${pg.meta.stats.twoSets}×2) · ${all.length} sets · skipped ${pg.meta.stats.skipped} · ${tris} tris/set`);
