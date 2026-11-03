// [pangyo] 판교역 일대(확장 1단계) 데이터 + 런타임 테스트: node scripts/corridor/test/test-pangyo.mjs
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pangyoEnabled, mergePangyoIndex, mergeTileJson, fetchCorridorTile, PANGYO_DIR } from '../../../src/corridor/pangyo.js';
import { createPangyoLandmarks, edges } from '../../../src/corridor/landmarks/pangyo.js';
import { buildDetailTile, buildLodTile } from '../../../src/corridor/tileMesh.js';
import { setEvening } from '../../../src/evening.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const C = path.join(ROOT, 'public/corridor'), P = path.join(C, 'pangyo');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cIndex = J(path.join(C, 'index.json')), base = J(path.join(C, 'base.json')), streams = J(path.join(C, 'streams.json'));
const pg = J(path.join(P, 'index.json'));
let n = 0; const ok = (name) => { n++; console.log('ok', n, name); };

// 1) 커밋된 데이터 = 스크립트 결과 (data/osm_pangyo_raw.json 기준, 생성 시각만 다름)
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pangyo-'));
  execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-pangyo.mjs'), `--out=${tmp}`], { cwd: ROOT, stdio: 'pipe' });
  const a = J(path.join(tmp, 'index.json')); delete a.meta.generated; const b = { ...pg, meta: { ...pg.meta } }; delete b.meta.generated;
  assert.deepEqual(a, b, 'pangyo/index.json 이 build-pangyo.mjs 결과와 다름 — npm run corridor:pangyo');
  for (const k of Object.keys(pg.tiles)) for (const d of ['tiles', 'lod']) assert.equal(fs.readFileSync(path.join(tmp, d, k + '.json'), 'utf8'), fs.readFileSync(path.join(P, d, k + '.json'), 'utf8'), `${d}/${k} 다름`);
  fs.rmSync(tmp, { recursive: true, force: true });
  ok('committed data matches build-pangyo.mjs output');
}

// 2) 타일 구성: add = 기존 코리더 타일(하도 컷 없음), new = 코리더에 없던 칸. 박스는 코리더 이동 경계 안
const B = pg.meta.box, CB = cIndex.meta.bounds;
assert.ok(B.x0 >= CB.x0 && B.x1 <= CB.x1 && B.z0 >= CB.z0 && B.z1 <= CB.z1, '판교 박스가 코리더 이동 범위 밖');
const tiles = {};
for (const [k, t] of Object.entries(pg.tiles)) {
  assert.equal(t.mode, cIndex.tiles[k] ? 'add' : 'new', k);
  assert.ok(!streams.tiles?.[k] && !streams.lod?.[k], `${k}: streams 컷 타일에 덧붙이면 인덱스가 어긋남`);
  const add = J(path.join(P, 'tiles', k + '.json'));
  tiles[k] = t.mode === 'add' ? mergeTileJson(J(path.join(C, 'tiles', k + '.json')), add) : add;
  if (t.mode === 'add') assert.equal(add.floor.length, 0, `${k}: add 타일은 바닥을 다시 깔지 않음`);
  else assert.ok(add.floor.length > 0, `${k}: 새 타일 바닥`);
  for (const b of add.b) { assert.ok(b.o.length >= 3 && b.h > 0 && (b.mh || 0) < b.h, `${k} 건물 높이`); }
  for (const r of add.r) { assert.ok(r.p.length >= 2 && r.w > 0, `${k} 도로`); for (const [x, z] of r.p) assert.ok(x >= B.x0 - 30 && x <= B.x1 + 30 && z >= B.z0 - 30 && z <= B.z1 + 30, `${k} 도로가 박스 밖`); }
}
ok('tile modes, floors, buildings, roads inside box');

// 3) 기존 코리더 건물과 중복 없음 (새 건물 중심이 기존 건물 안에 있으면 안 됨)
const inRing = (x, z, r) => { let s = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) s = !s; } return s; };
const cen = (r) => r.reduce((a, p) => [a[0] + p[0] / r.length, a[1] + p[1] / r.length], [0, 0]);
for (const [k, t] of Object.entries(pg.tiles)) {
  if (t.mode !== 'add') continue;
  const orig = J(path.join(C, 'tiles', k + '.json')).b, add = J(path.join(P, 'tiles', k + '.json')).b;
  for (const b of add) { const [x, z] = cen(b.o); assert.ok(!orig.some((o) => inRing(x, z, o.o)), `${k}: 기존 건물과 중복 (${x},${z})`); }
}
ok('no duplicates of existing corridor buildings');

// 4) 도로 이음: 겹침(o) 꼭짓점은 다른 조각(판교 또는 기존 코리더)에도 있어야 함
{
  const key = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1);
  const owner = new Map();
  const all = [];
  for (const [k, t] of Object.entries(tiles)) t.r.forEach((r, i) => all.push({ id: k + ':' + i, r }));
  for (const k of Object.keys(cIndex.tiles)) if (!tiles[k] && Object.keys(pg.tiles).some((q) => { const [a, b] = q.split('_').map(Number), [c, d] = k.split('_').map(Number); return Math.abs(a - c) <= 1 && Math.abs(b - d) <= 1; })) J(path.join(C, 'tiles', k + '.json')).r.forEach((r, i) => all.push({ id: k + ':' + i, r }));
  for (const { id, r } of all) for (const p of r.p) { const s = owner.get(key(p)) || new Set(); s.add(id); owner.set(key(p), s); }
  let checked = 0;
  for (const [k, t] of Object.entries(pg.tiles)) J(path.join(P, 'tiles', k + '.json')).r.forEach((r) => {
    if (!r.o) return;
    const [oh, ot] = r.o;
    for (const p of [...r.p.slice(0, oh ? oh + 1 : 0), ...r.p.slice(ot ? r.p.length - ot - 1 : r.p.length)]) { checked++; assert.ok((owner.get(key(p))?.size || 0) >= 2, `${k}: 이음 꼭짓점 ${key(p)} 를 공유하는 조각 없음`); }
  });
  assert.ok(checked > 20, 'seam checks ' + checked);
  ok(`road seams share overlap vertices (${checked})`);
}

// 5) 역·랜드마크: 판교역(신분당선·경강선) 출구 4개, 랜드마크 4종, 랜드마크 건물은 타일에서 nr(전용 모델), 충돌 유지(데크는 아래로 통과)
const st = pg.stations[0];
assert.equal(st.id, 'pangyo'); assert.deepEqual(st.lines, ['신분당선', '경강선']); assert.equal(st.exits.length, 4);
assert.deepEqual(pg.landmarks.map((l) => l.model).sort(), ['pangyoDeck', 'pangyoDept', 'pangyoEntrances', 'pangyoTowers']);
const lmB = Object.values(tiles).flatMap((t) => t.b.filter((b) => b.lm));
assert.ok(lmB.length >= 9 && lmB.every((b) => b.nr), 'landmark footprints nr');
const t07 = buildDetailTile('0_-7', tiles['0_-7'], { terrain: null, onRoadAll: () => false });
const tower = pg.landmarks.find((l) => l.model === 'pangyoTowers').parts[0], deck = pg.landmarks.find((l) => l.model === 'pangyoDeck').parts[0];
assert.ok(t07.blocked(...cen(tower.o)), 'tower collision');
const deckPt = deck.o.map((p, i) => [(p[0] + deck.o[(i + 7) % deck.o.length][0]) / 2, (p[1] + deck.o[(i + 7) % deck.o.length][1]) / 2]).find(([x, z]) => inRing(x, z, deck.o));
assert.ok(deckPt && !t07.blocked(...deckPt), 'deck walkable beneath');
for (const e of st.exits) assert.ok(!t07.blocked(e.x, e.z) && !buildDetailTile('x', tiles[`${Math.floor(e.x / 500)}_${Math.floor(e.z / 500)}`], { terrain: null, onRoadAll: () => false }).onRoad(e.x, e.z), `exit ${e.ref} free`);
t07.dispose();
ok('station, exits free, landmark collisions');

// 6) 런타임 합치기 · 플래그
assert.equal(pangyoEnabled(''), true); assert.equal(pangyoEnabled('?pangyo=0'), false); assert.equal(pangyoEnabled('?a=1&pangyo=1'), true);
const before = JSON.stringify(cIndex.tiles);
const mi = mergePangyoIndex(cIndex, pg);
assert.equal(JSON.stringify(cIndex.tiles), before, '원본 index 변경 없음');
assert.equal(mergePangyoIndex(cIndex, null), cIndex);
for (const [k, t] of Object.entries(pg.tiles)) assert.equal(mi.tiles[k].pangyo, t.mode);
assert.equal(Object.keys(mi.tiles).length, Object.keys(cIndex.tiles).length + Object.values(pg.tiles).filter((t) => t.mode === 'new').length);
assert.deepEqual(mergeTileJson({ b: [1], r: [2], floor: [3] }, { b: [4], r: [], floor: [] }), { b: [1, 4], r: [2], floor: [3] });
const seen = [];
const get = async (f) => { seen.push(f); return { b: [f] }; };
assert.deepEqual(await fetchCorridorTile(get, { key: '0_-6', pangyo: 'add' }, 'tiles'), { b: ['tiles/0_-6.json', PANGYO_DIR + 'tiles/0_-6.json'] });
assert.deepEqual(await fetchCorridorTile(get, { key: '0_-7', pangyo: 'new' }, 'lod'), { b: [PANGYO_DIR + 'lod/0_-7.json'] });
assert.deepEqual(await fetchCorridorTile(get, { key: '5_-9' }, 'tiles'), { b: ['tiles/5_-9.json'] });
ok('runtime merge + ?pangyo=0 flag');

// 7a) 변 바깥 법선: 시계/반시계 링 모두 중심에서 멀어지는 쪽
for (const ring of [[[0, 0], [10, 0], [10, 10], [0, 10]], [[0, 0], [0, 10], [10, 10], [10, 0]]]) for (const e of edges(ring)) assert.ok(e.nx * (e.mx - 5) + e.nz * (e.mz - 5) > 0, 'outward normal');
ok('edge normals point outward');

// 7) 랜드마크 메시: 타일 키별 빌드, draw(메시) 수·삼각형 예산, 공유 재질, 야간 발광 토글
{
  const labels = [];
  const lm = createPangyoLandmarks(pg, { overlay: { add: (o) => labels.push(o.text) } });
  assert.deepEqual(lm.keys.sort(), ['0_-6', '0_-7']);
  assert.equal(labels.length, 3);
  // 상호는 글자로만 허용(도훈님 승인): 백화점 라벨 = '현대백화점' 평문, 다른 라벨엔 상호 없음. 로고·이미지 텍스처는 없음(표지 = 캔버스 글자)
  assert.ok(labels.some((s) => s.includes('현대백화점')), 'dept label = 현대백화점 ' + labels.join(','));
  assert.ok(labels.filter((s) => /현대|Hyundai/i.test(s)).length === 1, 'brand name only on the dept label');
  let meshes = 0, tris = 0; const mats = new Set(), glow = [];
  for (const k of lm.keys) {
    const g = lm.build(k);
    g.traverse((o) => { if (!o.isMesh) return; meshes++; mats.add(o.material); const gi = o.geometry; tris += (gi.index ? gi.index.count : gi.attributes.position.count) / 3; if (/Glow/.test(o.name)) glow.push(o); });
  }
  assert.ok(meshes <= 16, 'landmark meshes ' + meshes);
  assert.ok(tris < 60000, 'landmark tris ' + tris);
  assert.ok(glow.length >= 3 && glow.every((m) => !m.visible), 'glow off by day');
  // build() 로 만든 그룹이 씬에 붙어 있어야 토글됨 → 붙인 뒤 확인
  const THREE = await import('three'); const scene = new THREE.Scene(); const roots = new Set(glow.map((m) => { let o = m; while (o.parent) o = o.parent; return o; })); for (const o of roots) scene.add(o);
  setEvening(true); assert.ok(glow.every((m) => m.visible), 'glow on at night'); setEvening(false);
  ok(`landmarks: ${meshes} meshes, ${Math.round(tris)} tris, ${mats.size} materials`);
}

// 8) LOD 타일 빌드 (기존 base 종류 인덱스)
for (const [k, t] of Object.entries(pg.tiles)) {
  const L = J(path.join(P, 'lod', k + '.json'));
  const lod = buildLodTile(k, t.mode === 'add' ? mergeTileJson(J(path.join(C, 'lod', k + '.json')), L) : L, base);
  assert.ok(lod.group.children.length > 0, k); lod.dispose();
  for (const [, , ki] of L.b) assert.ok(base.buildingKinds[ki], `${k} lod kind`);
}
ok('lod tiles build');
console.log('pangyo: all', n, 'checks passed');
