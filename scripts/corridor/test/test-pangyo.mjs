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
const B = pg.meta.box, CB = cIndex.meta.bounds, BOXES = pg.meta.boxes || [B]; // [ncsoft] 덧박스 포함
for (const X of BOXES) assert.ok(X.x0 >= CB.x0 && X.x1 <= CB.x1 && X.z0 >= CB.z0 && X.z1 <= CB.z1, '판교 박스가 코리더 이동 범위 밖');
const nearBox = (x, z, m) => BOXES.some((X) => x >= X.x0 - m && x <= X.x1 + m && z >= X.z0 - m && z <= X.z1 + m);
const tiles = {};
for (const [k, t] of Object.entries(pg.tiles)) {
  assert.equal(t.mode, cIndex.tiles[k] ? 'add' : 'new', k);
  assert.ok(!streams.tiles?.[k] && !streams.lod?.[k], `${k}: streams 컷 타일에 덧붙이면 인덱스가 어긋남`);
  const add = J(path.join(P, 'tiles', k + '.json'));
  tiles[k] = t.mode === 'add' ? mergeTileJson(J(path.join(C, 'tiles', k + '.json')), add) : add;
  if (t.mode === 'add') assert.equal(add.floor.length, 0, `${k}: add 타일은 바닥을 다시 깔지 않음`);
  else assert.ok(add.floor.length > 0, `${k}: 새 타일 바닥`);
  for (const b of add.b) { assert.ok(b.o.length >= 3 && b.h > 0 && (b.mh || 0) < b.h, `${k} 건물 높이`); }
  for (const r of add.r) { assert.ok(r.p.length >= 2 && r.w > 0, `${k} 도로`); for (const [x, z] of r.p) assert.ok(nearBox(x, z, 30), `${k} 도로가 박스 밖`); }
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
assert.deepEqual(pg.landmarks.map((l) => l.model).sort(), ['ncsoftRnd', 'pangyoDeck', 'pangyoDept', 'pangyoEntrances', 'pangyoTowers']);
const lmB = Object.values(tiles).flatMap((t) => t.b.filter((b) => b.lm));
assert.ok(lmB.length >= 9 && lmB.every((b) => b.nr), 'landmark footprints nr');
const t07 = buildDetailTile('0_-7', tiles['0_-7'], { terrain: null, onRoadAll: () => false });
const tower = pg.landmarks.find((l) => l.model === 'pangyoTowers').parts[0], deck = pg.landmarks.find((l) => l.model === 'pangyoDeck').parts[0];
assert.ok(t07.blocked(...cen(tower.o)), 'tower collision');
const deckPt = deck.o.map((p, i) => [(p[0] + deck.o[(i + 7) % deck.o.length][0]) / 2, (p[1] + deck.o[(i + 7) % deck.o.length][1]) / 2]).find(([x, z]) => inRing(x, z, deck.o));
assert.ok(deckPt && !t07.blocked(...deckPt), 'deck walkable beneath');
// [deck-v2] 데크 상판 10–12m('3~4층 높이' 기사 서술) · 엘리베이터는 OSM highway=elevator 노드만(지어내지 않음)
assert.ok(deck.mh === 10 && deck.h === 12, `deck 10–12 m (got ${deck.mh}–${deck.h})`);
const deckL = pg.landmarks.find((l) => l.model === 'pangyoDeck'), elevSrc = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/osm_pangyo_deck_elevators.json'), 'utf8')).elements.map((e) => e.id));
assert.ok(deckL.elevators.length >= 1 && deckL.elevators.every((e) => elevSrc.has(e.osm)), 'deck elevators from OSM');
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
  assert.deepEqual(lm.keys.sort(), ['0_-6', '0_-7', '0_-8']);
  assert.equal(labels.length, 3);
  // 상호는 글자로만 허용(도훈님 승인): 백화점 라벨 = '현대백화점' 평문, 다른 라벨엔 상호 없음. 로고·이미지 텍스처는 없음(표지 = 캔버스 글자)
  assert.ok(labels.some((s) => s.includes('현대백화점')), 'dept label = 현대백화점 ' + labels.join(','));
  assert.ok(labels.filter((s) => /현대|Hyundai/i.test(s)).length === 1, 'brand name only on the dept label');
  let meshes = 0, tris = 0; const mats = new Set(), glow = [];
  for (const k of lm.keys) {
    const g = lm.build(k);
    g.traverse((o) => { if (!o.isMesh) return; meshes++; mats.add(o.material); const gi = o.geometry; tris += (gi.index ? gi.index.count : gi.attributes.position.count) / 3; if (/Glow/.test(o.name)) glow.push(o); });
  }
  assert.ok(meshes <= 20, 'landmark meshes ' + meshes);
  assert.ok(tris < 80000, 'landmark tris ' + tris);
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
// 10) 지구본 노선도: 판교역 = 정자에서 갈라지는 지선 역(목록·역 수·이름), ?pangyo=0 이면 본선 목록 그대로
{
  const G = await import('../../../src/corridor/globeCorridor.js');
  const S = await import('../../../src/corridor/globeStations.js');
  assert.deepEqual(S.PANGYO_GLOBE_STATIONS.map((s) => [s.id, s.x, s.z]), pg.stations.map((s) => ['pangyo', s.x, s.z]), 'globe pangyo = pangyo index station');
  assert.ok(G.CORRIDOR_STATION_IDS.has('pangyo') && G.CORRIDOR_STATION_COUNT === S.CORRIDOR_STATIONS.length + 1 + G.BRANCH_STATIONS.length, 'pangyo in globe list');
  assert.deepEqual(G.corridorStationLabel('pangyo'), { ko: '판교역', en: 'Pangyo Station', short: 'Pangyo' });
  const on = G.layoutCorridorMap(), off = G.layoutCorridorMap({ branches: [] });
  assert.deepEqual(on.items, off.items, 'main line layout unchanged');
  assert.equal(off.branches.length, 0);
  const b = on.branches.find((x) => x.id === 'pangyo'); // [migeum] 미금역도 지선 목록에 있다(test-migeum-globe.mjs)
  assert.ok(b && b.id === 'pangyo' && b.from.id === 'jeongja' && b.side === 'left', 'branch from jeongja');
  for (const it of on.items.filter((x) => x.side === b.side)) assert.ok(Math.abs(it.dy - b.dy) >= 14, `label gap ${it.id} ${Math.abs(it.dy - b.dy).toFixed(1)}px`);
  assert.equal(pangyoEnabled('?pangyo=0'), false); // worldGate/globeCorridor 는 이 값으로 BRANCH_STATIONS=[] (본선 15역 그대로)
}
ok('globe station list + branch layout');

// 11) [ncsoft] 엔씨소프트 R&D센터: 덧박스 안, OSM 부분 5개 높이 그대로, 이름 표지·라벨·로고 없음, 작은 메시 수
{
  const L = pg.landmarks.find((l) => l.model === 'ncsoftRnd');
  assert.ok(L && !L.label, 'ncsoft: 라벨 없음');
  // [ncsoft-44m] 다리동 밑면 44m · 동동 윗면 44m 는 사진 기준값(참고 사진 ref/ncsoft-reference.png), 나머지 3개는 OSM 그대로. OSM 원래 값은 osm 에 남음
  assert.deepEqual(L.parts.map((p) => [p.id, p.mh, p.h]).sort(), [['w478539437', 8, 40], ['w478539439', 8, 44], ['w694434544', 0, 8], ['w694434545', 44, 58], ['w694434546', 40, 48]], 'OSM height/min_height (+ photo 44m)');
  assert.ok(L.parts.every((p) => (p.id === 'w694434545' || p.id === 'w478539439' ? p.s === 'photo:ref/ncsoft-reference.png' && p.osm : p.s === 'osm:height' && !p.osm)), 'heights from OSM tags except photo-based 2');
  assert.deepEqual([L.parts.find((p) => p.id === 'w694434545').osm, L.parts.find((p) => p.id === 'w478539439').osm], [{ mh: 32, h: 58 }, { mh: 8, h: 32, fl: 6 }], 'OSM 원래 값 기록');
  for (const t of Object.values(tiles)) for (const b of t.b) if (b.lm === 'ncsoft-rnd' && Math.abs(b.h - 58) < 0.01) assert.equal(b.mh, 44, '타일 충돌/LOD 도 44m');
  const NB = pg.meta.boxes[1]; assert.ok(L.parts.every((p) => p.o.every(([x, z]) => x >= NB.x0 && x <= NB.x1 && z >= NB.z0 && z <= NB.z1)), 'ncsoft 덧박스 안');
  const lm2 = createPangyoLandmarks(pg, { overlay: { add: () => {} } });
  // 이름 없는 메시 = 코리더 공용 office 파사드(창 텍스처) — 그 외엔 텍스처 없음
  const g = lm2.build('0_-8'); let n = 0, tri = 0; const names = [];
  g.traverse((o) => { if (o.isMesh) { n++; names.push(o.name); tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; assert.ok(!/sign|label|logo/i.test(o.name) && (!o.name || !o.material.map), 'ncsoft: 표지·글자·로고 텍스처 없음 ' + o.name); } });
  assert.ok(n <= 2, 'ncsoft meshes ' + n); // [ncsoft-v2] 본체 1 + 야간 불빛 1
  ok(`ncsoft: ${L.parts.length} OSM parts (0–58m, 다리동 밑면 44m = 사진 기준, OSM 32m), ${n} meshes, ${Math.round(tri)} tris, no sign/label/logo`);
}
// 12) [ncsoft-roads] HQ 둘레 도로(대왕판교로 · 대왕판교로644번길 · 판교역로)가 BOX 도로망(z > -3490)과 이어지고, 덧박스 바깥 변에 잘린 차도 끝이 없다
{
  const NB = pg.meta.boxes[1], FOOT = new Set(['footway', 'cycleway', 'path', 'steps', 'pedestrian', 'track']);
  const R = Object.keys(pg.tiles).flatMap((k) => J(path.join(P, 'tiles', k + '.json')).r).filter((r) => !FOOT.has(r.k));
  const key = ([x, z]) => `${x},${z}`, par = new Map(), find = (a) => { while (par.get(a) !== a) a = par.get(a); return a; };
  const uni = (a, b) => { for (const k of [a, b]) if (!par.has(k)) par.set(k, k); par.set(find(a), find(b)); };
  for (const r of R) for (let i = 1; i < r.p.length; i++) uni(key(r.p[i - 1]), key(r.p[i]));
  const south = new Set([...par.keys()].filter((k) => +k.split(',')[1] > -3490).map(find));
  const ring = R.filter((r) => ['대왕판교로', '대왕판교로644번길', '판교역로'].includes(r.n) && r.p.some(([, z]) => z < -3600));
  assert.deepEqual([...new Set(ring.map((r) => r.n))].sort(), ['대왕판교로', '대왕판교로644번길', '판교역로'], 'HQ ring roads present');
  for (const r of ring) assert.ok(south.has(find(key(r.p[0]))), `${r.n} connected to BOX network`);
  const onEdge = ([x, z]) => z < B.z0 - 0.1 && (Math.abs(x - NB.x0) < 0.3 || Math.abs(x - NB.x1) < 0.3 || Math.abs(z - NB.z0) < 0.3);
  const cut = R.flatMap((r) => [r.p[0], r.p[r.p.length - 1]]).filter(onEdge);
  assert.equal(cut.length, 0, 'vehicle road ends cut at NC box edge: ' + JSON.stringify(cut));
  ok(`ncsoft roads: ${ring.length} HQ ring pieces connected to BOX network, no cut ends at NC box edge`);
}
console.log('pangyo: all', n, 'checks passed');
