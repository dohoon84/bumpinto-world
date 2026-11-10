// [migeum] 미금역 일대(확장 1단계) 데이터 + 런타임 테스트: node scripts/corridor/test/test-migeum.mjs
//   데이터 = node scripts/corridor/build-pangyo.mjs --region=migeum (판교와 같은 스크립트·규칙)
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { migeumEnabled, mergeMigeumIndex, MIGEUM_DIR } from '../../../src/corridor/migeum.js';
import { mergePangyoIndex, mergeTileJson, fetchCorridorTile } from '../../../src/corridor/pangyo.js';
import { createPangyoLandmarks } from '../../../src/corridor/landmarks/pangyo.js';
import { buildDetailTile, buildLodTile } from '../../../src/corridor/tileMesh.js';
import { mergeTancheon } from '../../../src/corridor/tancheon.js';
import { setEvening } from '../../../src/evening.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const C = path.join(ROOT, 'public/corridor'), M = path.join(C, 'migeum');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cIndex = J(path.join(C, 'index.json')), base = J(path.join(C, 'base.json')), streams = J(path.join(C, 'streams.json'));
const mg = J(path.join(M, 'index.json')), pg = J(path.join(C, 'pangyo/index.json'));
let n = 0; const ok = (name) => { n++; console.log('ok', n, name); };

// 1) 커밋된 데이터 = 스크립트 결과 (data/osm_migeum_raw.json 기준, 생성 시각만 다름)
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migeum-'));
  execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-pangyo.mjs'), '--region=migeum', `--out=${tmp}`], { cwd: ROOT, stdio: 'pipe' });
  const a = J(path.join(tmp, 'index.json')); delete a.meta.generated; const b = { ...mg, meta: { ...mg.meta } }; delete b.meta.generated;
  assert.deepEqual(a, b, 'migeum/index.json 이 build-pangyo.mjs --region=migeum 결과와 다름 — npm run corridor:migeum');
  for (const k of Object.keys(mg.tiles)) for (const d of ['tiles', 'lod']) assert.equal(fs.readFileSync(path.join(tmp, d, k + '.json'), 'utf8'), fs.readFileSync(path.join(M, d, k + '.json'), 'utf8'), `${d}/${k} 다름`);
  fs.rmSync(tmp, { recursive: true, force: true });
  ok('committed data matches build-pangyo.mjs --region=migeum output');
}

// 2) 9칸(x −500..1000, z 1000..2500): add = 기존 코리더 타일(-1_2·0_2, 하도 컷 없음), new = 나머지 7칸. 판교 칸과 안 겹침
const B = mg.meta.box;
assert.deepEqual(B, { x0: -500, x1: 1000, z0: 1000, z1: 2500 });
assert.deepEqual(Object.keys(mg.tiles).sort(), ['-1_2', '-1_3', '-1_4', '0_2', '0_3', '0_4', '1_2', '1_3', '1_4']);
assert.ok(Object.keys(mg.tiles).every((k) => !pg.tiles[k]), '판교 칸과 겹침');
const inBox = (x, z, m) => x >= B.x0 - m && x <= B.x1 + m && z >= B.z0 - m && z <= B.z1 + m;
const tiles = {};
for (const [k, t] of Object.entries(mg.tiles)) {
  assert.equal(t.mode, cIndex.tiles[k] ? 'add' : 'new', k);
  assert.ok(!streams.tiles?.[k] && !streams.lod?.[k], `${k}: streams 컷 타일에 덧붙이면 인덱스가 어긋남`);
  const add = J(path.join(M, 'tiles', k + '.json'));
  tiles[k] = t.mode === 'add' ? mergeTileJson(J(path.join(C, 'tiles', k + '.json')), add) : add;
  if (t.mode === 'add') assert.equal(add.floor.length, 0, `${k}: add 타일은 바닥을 다시 깔지 않음`);
  else assert.ok(add.floor.length > 0, `${k}: 새 타일 바닥`);
  for (const b of add.b) assert.ok(b.o.length >= 3 && b.h > 0 && (b.mh || 0) < b.h, `${k} 건물 높이`);
  for (const r of add.r) { // 겹침(o) 꼭짓점 = 이웃 조각과 공유하는 이음점(박스 밖일 수 있음) → 나머지만 박스 안
    assert.ok(r.p.length >= 2 && r.w > 0, `${k} 도로`);
    const [oh, ot] = r.o || [0, 0];
    for (const [x, z] of r.p.slice(oh, r.p.length - ot)) assert.ok(inBox(x, z, 30), `${k} 도로가 박스 밖 (${x},${z})`);
  }
}
const st0 = mg.meta.stats;
assert.equal(st0.height + st0.levels + st0.default, st0.osmBuildings, 'height rule counts add up');
assert.equal(Object.values(mg.tiles).reduce((s, t) => s + t.nb, 0), st0.osmBuildings);
ok(`9 tiles (2 add, 7 new), ${st0.osmBuildings} buildings (height ${st0.height} / levels ${st0.levels} / default ${st0.default}; outline-only ${st0.outlines})`);

// 3) 기존 코리더 건물과 중복 없음
const inRing = (x, z, r) => { let s = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) s = !s; } return s; };
const cen = (r) => r.reduce((a, p) => [a[0] + p[0] / r.length, a[1] + p[1] / r.length], [0, 0]);
for (const [k, t] of Object.entries(mg.tiles)) {
  if (t.mode !== 'add') continue;
  const orig = J(path.join(C, 'tiles', k + '.json')).b, add = J(path.join(M, 'tiles', k + '.json')).b;
  for (const b of add) { const [x, z] = cen(b.o); assert.ok(!orig.some((o) => inRing(x, z, o.o)), `${k}: 기존 건물과 중복 (${x},${z})`); }
}
ok('no duplicates of existing corridor buildings');

// 4) 탄천 띠(라이브 terrain.json 축 + 제방 윗면 폭): 새 건물·도로 꼭짓점·바닥 없음 → 라이브 하도가 그대로 보임
{
  const T = mergeTancheon(J(path.join(ROOT, 'public/terrain.json')), J(path.join(C, 'tancheon.json')));
  const ax = T.axis, prof = T.prof;
  const off = (x, z) => { // 축에서 거리(좌/우 윗면 폭과 비교)
    let best = Infinity, w = 0;
    for (let i = 1; i < ax.length; i++) {
      const [a0, a1] = ax[i - 1], [b0, b1] = ax[i], dx = b0 - a0, dz = b1 - a1, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a0) * dx + (z - a1) * dz) / L2));
      const d = Math.hypot(a0 + dx * t - x, a1 + dz * t - z); if (d < best) { best = d; const side = dz * (x - a0) - dx * (z - a1) > 0 ? prof.topR : prof.topL; /* 오른쪽 법선 (dz, −dx) = build 와 같은 부호 */ w = side[i]; }
    }
    return best - w;
  };
  let nb = 0, nv = 0, nf = 0;
  for (const k of Object.keys(mg.tiles)) {
    const t = J(path.join(M, 'tiles', k + '.json'));
    for (const b of t.b) { const [x, z] = cen(b.o); assert.ok(off(x, z) > 0, `${k} 건물이 탄천 띠 안 (${x.toFixed(0)},${z.toFixed(0)})`); nb++; }
    for (const r of t.r) for (let i = 1; i < r.p.length; i++) { const x = (r.p[i - 1][0] + r.p[i][0]) / 2, z = (r.p[i - 1][1] + r.p[i][1]) / 2; assert.ok(off(x, z) > -1, `${k} 도로가 탄천 띠 안 (${x.toFixed(0)},${z.toFixed(0)})`); nv++; }
    for (const poly of t.floor) for (const ring of [poly.o, ...(poly.holes || [])]) for (const [x, z] of ring) { assert.ok(off(x, z) > -1.5, `${k} 바닥이 탄천 띠 안 (${x},${z})`); nf++; }
  }
  ok(`tancheon strip kept clear (${nb} buildings, ${nv} road segments, ${nf} floor vertices)`);
}

// 5) 도로 이음: 겹침(o) 꼭짓점은 다른 조각에도 있어야 함
{
  const key = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1);
  const owner = new Map(), all = [];
  for (const [k, t] of Object.entries(tiles)) t.r.forEach((r, i) => all.push({ id: k + ':' + i, r }));
  for (const k of Object.keys(cIndex.tiles)) if (!tiles[k] && Object.keys(mg.tiles).some((q) => { const [a, b] = q.split('_').map(Number), [c, d] = k.split('_').map(Number); return Math.abs(a - c) <= 1 && Math.abs(b - d) <= 1; })) J(path.join(C, 'tiles', k + '.json')).r.forEach((r, i) => all.push({ id: k + ':' + i, r }));
  for (const { id, r } of all) for (const p of r.p) { const s = owner.get(key(p)) || new Set(); s.add(id); owner.set(key(p), s); }
  let checked = 0;
  for (const k of Object.keys(mg.tiles)) J(path.join(M, 'tiles', k + '.json')).r.forEach((r) => {
    if (!r.o) return;
    const [oh, ot] = r.o;
    for (const p of [...r.p.slice(0, oh ? oh + 1 : 0), ...r.p.slice(ot ? r.p.length - ot - 1 : r.p.length)]) { checked++; assert.ok((owner.get(key(p))?.size || 0) >= 2, `${k}: 이음 꼭짓점 ${key(p)} 를 공유하는 조각 없음`); }
  });
  assert.ok(checked > 20, 'seam checks ' + checked);
  ok(`road seams share overlap vertices (${checked})`);
}

// 6) 미금역: OSM 역 노드 3개(신분당선 네오트랜스 · 수인분당선 한국철도공사), 출입구 1–8번 = OSM subway_entrance ref, 서 있을 수 있는 자리
const st = mg.stations[0];
assert.equal(st.id, 'migeum'); assert.equal(st.name, '미금'); assert.deepEqual(st.lines, ['수인분당선', '신분당선']);
assert.deepEqual(st.exits.map((e) => e.ref), ['1', '2', '3', '4', '5', '6', '7', '8']);
const raw = J(path.join(ROOT, 'data/osm_migeum_raw.json')).elements;
const ent = new Map(raw.filter((e) => e.tags?.railway === 'subway_entrance').map((e) => [e.id, e.tags.ref]));
const gates = mg.landmarks[0].entrances; // 캐노피 = 출입구 노드(osm id·방향·건물 안 여부)
assert.deepEqual(gates.map((e) => [e.ref, e.x, e.z]), st.exits.map((e) => [e.ref, e.x, e.z]));
for (const e of gates) assert.equal(ent.get(e.osm), e.ref, `exit ${e.ref} = OSM node ${e.osm}`);
const det = {}; const D = (k) => (det[k] ||= buildDetailTile(k, tiles[k], { terrain: null, onRoadAll: () => false }));
for (const e of gates) { const k = `${Math.floor(e.x / 500)}_${Math.floor(e.z / 500)}`; if (!e.indoor) assert.ok(!D(k).blocked(e.x, e.z) && !D(k).onRoad(e.x, e.z), `exit ${e.ref} free`); }
assert.ok(st.signAt && !D('0_3').blocked(st.signAt.x, st.signAt.z), 'sign spot free');
for (const t of Object.values(det)) t.dispose();
assert.deepEqual(mg.landmarks.map((l) => l.model), ['migeumEntrances']);
ok(`station 미금 (${st.lines.join('·')}), exits 1–8 from OSM refs (${gates.filter((e) => e.indoor).length} indoor), free`);

// 7) 런타임 합치기 · 플래그 · 이동 범위
assert.equal(migeumEnabled(''), true); assert.equal(migeumEnabled('?migeum=0'), false); assert.equal(migeumEnabled('?a=1&migeum=1'), true);
{
  const before = JSON.stringify(cIndex);
  const base0 = mergePangyoIndex(cIndex, pg), mi = mergeMigeumIndex(base0, mg);
  assert.equal(JSON.stringify(cIndex), before, '원본 index 변경 없음');
  assert.equal(mergeMigeumIndex(base0, null), base0, 'migeum=0 → 같은 객체');
  for (const [k, t] of Object.entries(mg.tiles)) { assert.equal(mi.tiles[k].ext, MIGEUM_DIR); assert.equal(mi.tiles[k].extMode, t.mode); }
  for (const [k, t] of Object.entries(base0.tiles)) if (!mg.tiles[k]) assert.deepEqual(mi.tiles[k], t, `${k} unchanged`);
  assert.equal(Object.keys(mi.tiles).length, Object.keys(base0.tiles).length + 7);
  assert.equal(mi.meta.bounds.z1, 2500); assert.deepEqual({ ...mi.meta.bounds, z1: 0 }, { ...base0.meta.bounds, z1: 0 });
  const seen = [], get = async (f) => { seen.push(f); return { b: [f] }; };
  assert.deepEqual(await fetchCorridorTile(get, { key: '0_2', ...mi.tiles['0_2'] }, 'tiles'), { b: ['tiles/0_2.json', MIGEUM_DIR + 'tiles/0_2.json'] });
  assert.deepEqual(await fetchCorridorTile(get, { key: '0_3', ...mi.tiles['0_3'] }, 'lod'), { b: [MIGEUM_DIR + 'lod/0_3.json'] });
  assert.deepEqual(await fetchCorridorTile(get, { key: '0_2', ...base0.tiles['0_2'] }, 'tiles'), { b: ['tiles/0_2.json'] });
  assert.deepEqual(await fetchCorridorTile(get, { key: '0_-6', pangyo: 'add' }, 'tiles'), { b: ['tiles/0_-6.json', 'pangyo/tiles/0_-6.json'] }, 'pangyo unchanged');
  // 로더: ?migeum=0 이면 migeum/ 요청 0건, 결과 index = 판교만 합친 것과 같음
  const { loadCorridorData } = await import('../../../src/corridor/index.js');
  const reqs = [];
  const fetchFn = async (u) => { reqs.push(u); const f = path.join(C, u.replace(/^\/corridor\//, '')); return fs.existsSync(f) ? { ok: true, json: async () => J(f) } : { ok: false }; };
  const off = await loadCorridorData('/corridor/', { fetchFn, migeum: false, gangnam: false, streams: false });
  assert.ok(!reqs.some((u) => u.includes(MIGEUM_DIR)), 'no migeum requests when off');
  assert.ok(!off.migeum && !Object.values(off.index.tiles).some((t) => t.ext), 'no migeum tiles when off');
  assert.deepEqual(off.index.meta.bounds, cIndex.meta.bounds, 'bounds unchanged when off');
  reqs.length = 0;
  const on = await loadCorridorData('/corridor/', { fetchFn, migeum: true, gangnam: false, streams: false });
  assert.ok(reqs.includes('/corridor/' + MIGEUM_DIR + 'index.json') && on.migeum && on.index.meta.bounds.z1 === 2500, 'loads when on');
}
ok('runtime merge, ?migeum=0 = no requests / tiles / bounds change');

// 8) 출입구 캐노피: 타일 0_3 하나, 메시·삼각형 예산, 로고·브랜드 텍스처 없음, 야간 발광 토글
{
  const labels = [];
  const lm = createPangyoLandmarks(mg, { overlay: { add: (o) => labels.push(o.text) }, prefix: 'migeum' });
  assert.deepEqual(lm.keys, ['0_3']); assert.equal(labels.length, 0, '랜드마크 라벨 없음(역 라벨은 코리더 역 라벨)');
  let meshes = 0, tris = 0; const glow = [], names = [];
  const g = lm.build('0_3'); assert.equal(g.name, 'migeumLandmarks:0_3');
  g.traverse((o) => { if (!o.isMesh) return; meshes++; names.push(o.name); const gi = o.geometry; tris += (gi.index ? gi.index.count : gi.attributes.position.count) / 3; if (/Glow/.test(o.name)) glow.push(o); });
  assert.ok(names.every((s) => s.startsWith('migeum') && !/logo|brand/i.test(s)), names.join(','));
  assert.ok(meshes <= 5, 'entrance meshes ' + meshes); assert.ok(tris < 10000, 'entrance tris ' + tris);
  assert.ok(glow.length === 1 && !glow[0].visible, 'glow off by day');
  const THREE = await import('three'); const scene = new THREE.Scene(); scene.add(g);
  setEvening(true); assert.ok(glow[0].visible, 'glow on at night'); setEvening(false);
  ok(`entrance canopies: ${mg.landmarks[0].entrances.filter((e) => !e.indoor).length} outdoor gates, ${meshes} meshes, ${Math.round(tris)} tris`);
}

// 9) LOD 타일 빌드
for (const [k, t] of Object.entries(mg.tiles)) {
  const L = J(path.join(M, 'lod', k + '.json'));
  const lod = buildLodTile(k, t.mode === 'add' ? mergeTileJson(J(path.join(C, 'lod', k + '.json')), L) : L, base);
  assert.ok(lod.group.children.length > 0, k); lod.dispose();
  for (const [, , ki] of L.b) assert.ok(base.buildingKinds[ki], `${k} lod kind`);
}
ok('lod tiles build');
console.log('migeum: all', n, 'checks passed');
