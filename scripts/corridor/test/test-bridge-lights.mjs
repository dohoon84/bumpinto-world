// [bridgeLights] 저녁 다리 조명 테스트: node scripts/corridor/test/test-bridge-lights.mjs
//   - 다리 조명 전체가 메시 1개(그리기 1번), 가산 발광·깊이 안 씀, 낮(시작)엔 숨김
//   - 탄천 본류 다리 = major(난간 LED 기둥·수면 반사), 지류·보행교 = minor 도 있음
//   - 셰이더에 logdepthbuf 청크 (game.js 렌더러가 logarithmicDepthBuffer → 없으면 전부 가려짐)
//   - 수면 반사 사각형은 물 위(물 높이 + 0.04m)에만
//   - ?bridgeLights=0 이면 아무것도 안 만듦
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const THREE = await import('three');
const { mergeTancheon } = await import('../../../src/corridor/tancheon.js');
const { createTerrain } = await import('../../../src/world/terrain.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../../../public/' + f, import.meta.url)));
const T = rd('terrain.json'), ext = rd('corridor/tancheon.json'), data = rd('jeongja.json'), S = rd('corridor/streams.json'), base = rd('corridor/base.json');
let n = 0; const ok = (m) => console.log('  ok', ++n, m);

const on = createTerrain({ ...mergeTancheon(T, ext), streams: S }, data);
const cp = (r) => ({ ...r, p: r.p.map((p) => p.slice()) });
on.annotate({ roads: base.ch.concat(S.mainBridges || []).map(cp).concat(S.bridges.map(cp)), water: [], waterLines: [], parks: [] });
const scene = new THREE.Scene();
const res = on.build(scene, { onRoad: () => false, ground: null, block: null, isBlocked: () => false }, null);
const bl = res.bridgeLights;
assert.ok(bl && bl.mesh, 'bridgeLights built');
const meshes = []; scene.traverse((o) => { if (o.name === 'bridge-lights') meshes.push(o); });
assert.equal(meshes.length, 1);
const m = bl.mesh, mat = m.material, g = m.geometry;
assert.equal(mat.blending, THREE.AdditiveBlending); assert.equal(mat.depthWrite, false); assert.equal(mat.transparent, true);
assert.equal(m.visible, false, 'hidden until evening');
assert.equal(g.attributes.position.count, bl.quads * 4); assert.equal(g.index.count, bl.quads * 6);
ok(`one mesh / one draw: ${bl.quads} quads (${bl.quads * 2} tris), additive, no depth write, hidden by day`);

assert.ok(mat.vertexShader.includes('<logdepthbuf_vertex>') && mat.fragmentShader.includes('<logdepthbuf_fragment>'));
ok('shader carries logdepthbuf chunks (renderer uses logarithmicDepthBuffer)');

const kf = g.attributes.aKF.array, pos = g.attributes.position.array, col = g.attributes.color.array;
let major = 0, minor = 0, bars = 0, water = 0;
for (let q = 0; q < bl.quads; q++) {
  const v = q * 4, k = kf[v * 2], far = kf[v * 2 + 1];
  far > 500 ? major++ : minor++;
  if (k === 0 && far > 500 && Math.abs(col[v * 3] - col[v * 3 + 1]) > 0.2) bars++; // 색 있는 난간 LED
  if (k === 4) {
    water++;
    const cx = (pos[v * 3] + pos[v * 3 + 6]) / 2, cz = (pos[v * 3 + 2] + pos[v * 3 + 8]) / 2, y = pos[v * 3 + 1];
    assert.ok(y > on.getGroundHeight(cx, cz, -99) - 0.5, `reflection at ${cx.toFixed(1)},${cz.toFixed(1)} not buried`);
  }
}
assert.ok(major > 5000 && minor > 1000 && bars > 1000 && water > 500, `major ${major} minor ${minor} bars ${bars} water ${water}`);
ok(`major ${major} quads (incl. ${bars} coloured parapet LEDs), minor ${minor}, water reflections ${water}`);

globalThis.location = { search: '?bridgeLights=0' };
const off = await import('../../../src/world/bridgeLights.js?off');
assert.equal(off.BRIDGE_LIGHTS_ON, false);
assert.equal(off.buildBridgeLights(new THREE.Scene(), { pieces: [{ x0: 0, z0: 0, h0: 0, x1: 10, z1: 0, h1: 0, W: 4, th: 1, tier: 'major' }], piers: [], waterAt: () => null }), null);
delete globalThis.location;
ok('?bridgeLights=0 builds nothing');
console.log('bridge lights: all ok');
