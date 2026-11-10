// [gangnam] 강남역 일대 9칸 섬: 데이터 = build-pangyo.mjs --region=gangnam, 본선 bounds 는 그대로, ?gangnam=0 이면 요청 없음
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gangnamEnabled, mergeGangnamIndex, GANGNAM_DIR } from '../../../src/corridor/gangnam.js';
import { mergePangyoIndex, mergeTileJson, fetchCorridorTile } from '../../../src/corridor/pangyo.js';
import { mergeMigeumIndex } from '../../../src/corridor/migeum.js';
import { inWorldBounds, clampWorld } from '../../../src/corridor/islands.js';
import { createPangyoLandmarks } from '../../../src/corridor/landmarks/pangyo.js';
import { buildDetailTile, buildLodTile } from '../../../src/corridor/tileMesh.js';
import { setEvening } from '../../../src/evening.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const C = path.join(ROOT, 'public/corridor'), G = path.join(C, 'gangnam');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cIndex = J(path.join(C, 'index.json')), base = J(path.join(C, 'base.json'));
const gn = J(path.join(G, 'index.json')), pg = J(path.join(C, 'pangyo/index.json')), mg = J(path.join(C, 'migeum/index.json'));
let n = 0; const ok = (name) => { n++; console.log('ok', n, name); };

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gangnam-'));
  execFileSync('node', ['--max-old-space-size=8192', path.join(ROOT, 'scripts/corridor/build-pangyo.mjs'), '--region=gangnam', `--out=${tmp}`], { cwd: ROOT, stdio: 'pipe' });
  const a = J(path.join(tmp, 'index.json')); delete a.meta.generated; const b = { ...gn, meta: { ...gn.meta } }; delete b.meta.generated;
  assert.deepEqual(a, b, 'gangnam/index.json 이 build 결과와 다름 — npm run corridor:gangnam');
  for (const k of Object.keys(gn.tiles)) for (const d of ['tiles', 'lod']) assert.equal(fs.readFileSync(path.join(tmp, d, k + '.json'), 'utf8'), fs.readFileSync(path.join(G, d, k + '.json'), 'utf8'), `${d}/${k}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  ok('committed data matches build-pangyo.mjs --region=gangnam');
}

const B = gn.meta.box;
assert.deepEqual(B, { x0: -7500, x1: -6000, z0: -15500, z1: -14000 });
assert.equal(gn.meta.island, true);
const VW_CREDIT = '건물 높이: 국토교통부 브이월드 GIS건물통합정보 (공공누리 제1유형: 출처표시), https://www.data.go.kr/data/15083092/fileData.do';
assert.equal(gn.meta.attribution, '© OpenStreetMap contributors (ODbL) · ' + VW_CREDIT);
assert.match(gn.meta.heightRule, /V-World dt_d010 hg/);
assert.equal(gn.meta.source.vworld, 'data/gangnam_vworld_heights.json');
assert.deepEqual(Object.keys(gn.tiles).sort(), ['-13_-29', '-13_-30', '-13_-31', '-14_-29', '-14_-30', '-14_-31', '-15_-29', '-15_-30', '-15_-31']);
assert.ok(Object.keys(gn.tiles).every((k) => !cIndex.tiles[k] && !pg.tiles[k] && !mg.tiles[k]), '기존 칸과 안 겹침');
const inBox = (x, z, m) => x >= B.x0 - m && x <= B.x1 + m && z >= B.z0 - m && z <= B.z1 + m;
let detailBytes = 0;
for (const [k, t] of Object.entries(gn.tiles)) {
  assert.equal(t.mode, 'new', k);
  const tile = J(path.join(G, 'tiles', k + '.json'));
  detailBytes += fs.statSync(path.join(G, 'tiles', k + '.json')).size;
  assert.ok(tile.floor.length > 0, `${k} 바닥`);
  for (const b of tile.b) assert.ok(b.o.length >= 3 && b.h > 0 && (b.mh || 0) < b.h, `${k} 높이`);
  for (const r of tile.r) {
    const [oh, ot] = r.o || [0, 0];
    for (const [x, z] of r.p.slice(oh, r.p.length - ot)) assert.ok(inBox(x, z, 30), `${k} 도로 박스 밖 ${x},${z}`);
  }
}
const st0 = gn.meta.stats;
const BEFORE_BUILDINGS = 2709; // acfe2f1 강남 건물 수. 높이만 바꾸고 풋프린트는 그대로
assert.equal(st0.osmBuildings, BEFORE_BUILDINGS, '건물이 줄거나 늘지 않음');
assert.equal(st0.height + st0.vwHg + st0.vwFloors + st0.levels + st0.default, st0.osmBuildings);
assert.deepEqual(
  { height: st0.height, vwHg: st0.vwHg, vwFloors: st0.vwFloors, levels: st0.levels, default: st0.default },
  { height: 395, vwHg: 1655, vwFloors: 373, levels: 67, default: 219 },
  '높이 출처: OSM height / 브이월드 hg / 브이월드 층수 / OSM levels / 기본값',
);
assert.equal(Object.values(gn.tiles).reduce((s, t) => s + t.nb, 0), st0.osmBuildings);
assert.deepEqual(Object.fromEntries(Object.entries(gn.tiles).map(([k, t]) => [k, t.nb])), {
  '-13_-29': 485, '-13_-30': 219, '-13_-31': 499, '-14_-29': 401, '-14_-30': 260, '-14_-31': 186, '-15_-29': 117, '-15_-30': 303, '-15_-31': 239,
}, '칸마다 건물 수 유지');
assert.ok(detailBytes <= 900 * 1024, `상세 타일 ${detailBytes} > 900KB`);
assert.ok(!gn.meta.defaultHeights.some((d) => /지하쇼핑|지하상가/.test(d.n || '')), '지하상가 이름을 지상 기본높이에 넣지 않음');
assert.ok(gn.meta.defaultHeights.some((d) => d.id === 'w117790043' && d.h === 16.6), '국기원 캠퍼스 외곽은 한 동과 안 겹쳐 기본값');
{
  const table = J(path.join(ROOT, 'data/gangnam_vworld_heights.json'));
  assert.equal(table.meta.attribution, VW_CREDIT);
  assert.equal(table.rows.length, st0.vwHg + st0.vwFloors, '표의 행 = 실제로 쓴 브이월드 높이');
  const osmIds = new Set(J(path.join(ROOT, 'data/osm_gangnam_raw.json')).elements.map((e) => e.type[0] + e.id));
  let hg = 0, fl = 0;
  for (const [id, src, val] of table.rows) {
    assert.ok(osmIds.has(String(id).split('@')[0]), id);
    if (src === 'hg') { hg++; assert.ok(val >= 2 && val <= 300, id); }
    else if (src === 'fl') { fl++; assert.ok(val >= 1 && val <= 60, id); }
    else assert.fail(src);
  }
  assert.equal(hg, 1655); assert.equal(fl, 373);
  assert.ok(table.meta.counts.hgAbsurd >= 1, '비현실 hg 는 기록');
}
ok(`9 new tiles, ${st0.osmBuildings} buildings (OSM height ${st0.height} / vw hg ${st0.vwHg} / vw floors ${st0.vwFloors} / levels ${st0.levels} / default ${st0.default}), detail ${(detailBytes / 1024).toFixed(0)}KB`);

const st = gn.stations[0];
assert.equal(st.id, 'gangnam'); assert.equal(st.name, '강남'); assert.equal(st.nameEn, 'Gangnam');
assert.deepEqual(st.lines, ['2호선', '신분당선']);
assert.deepEqual(st.exits.map((e) => e.ref), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
assert.ok(Math.abs(st.x + 7097.7) < 1 && Math.abs(st.z + 14453.3) < 1, `역 좌표 ${st.x},${st.z}`);
const raw = J(path.join(ROOT, 'data/osm_gangnam_raw.json')).elements;
const ent = new Map(raw.filter((e) => e.tags?.railway === 'subway_entrance').map((e) => [e.id, e.tags.ref]));
const gates = gn.landmarks.find((l) => l.model === 'gangnamEntrances').entrances;
assert.deepEqual(gates.map((e) => e.ref), st.exits.map((e) => e.ref));
for (const e of gates) assert.equal(ent.get(e.osm), e.ref, `exit ${e.ref}`);
const signs = gn.landmarks.filter((l) => l.model === 'textSign');
assert.ok(signs.length >= 5, '평문 표지');
for (const s of signs) assert.ok(s.label.ko && !/logo|brand/i.test(s.model));
assert.ok(signs.some((s) => s.label.ko === '국기원' && s.label.en.includes('Kukkiwon')));
assert.ok(signs.some((s) => s.label.ko === '강남파이낸스센터' && s.pos.y === 204));
assert.ok(signs.some((s) => s.label.ko === '삼성전자 서초사옥' && s.pos.y === 203));
ok('station Gangnam, exits 1–12 = OSM refs, plain-text signs (ko + name:en)');

assert.equal(gangnamEnabled(''), true); assert.equal(gangnamEnabled('?gangnam=0'), false);
{
  const before = JSON.stringify(cIndex);
  const merged = mergeGangnamIndex(mergeMigeumIndex(mergePangyoIndex(cIndex, pg), mg), gn);
  assert.equal(JSON.stringify(cIndex), before, '원본 index 불변');
  assert.deepEqual(merged.meta.bounds, mergeMigeumIndex(mergePangyoIndex(cIndex, pg), mg).meta.bounds, '본선 bounds 숫자 그대로');
  assert.equal(merged.meta.islands.length, 2);
  assert.deepEqual(merged.meta.islands[1], { x0: -7500, x1: -6000, z0: -15500, z1: -14000 });
  const main = merged.meta.islands[0], isle = merged.meta.islands[1];
  const world = { ...main, islands: [main, isle] };
  assert.equal(inWorldBounds({ x: 0, z: 0 }, world), true, '정자');
  assert.equal(inWorldBounds({ x: -7100, z: -14500 }, world), true, '강남');
  assert.equal(inWorldBounds({ x: -4000, z: -14500 }, world), false, '사이 빈 땅');
  const c = clampWorld(-4000, -14500, world);
  assert.ok(inWorldBounds(c, world), '빈 땅 클램프는 섬 안');
  assert.deepEqual(clampWorld(10, 10, { x0: -1, x1: 2, z0: -3, z1: 4 }), { x: 2, z: 4 }, '섬 없으면 예전 사각형');
  for (const [k, t] of Object.entries(gn.tiles)) { assert.equal(merged.tiles[k].ext, GANGNAM_DIR); assert.equal(merged.tiles[k].extMode, t.mode); }
  const { loadCorridorData } = await import('../../../src/corridor/index.js');
  const reqs = [];
  const fetchFn = async (u) => { reqs.push(u); const f = path.join(C, u.replace(/^\/corridor\//, '')); return fs.existsSync(f) ? { ok: true, json: async () => J(f) } : { ok: false }; };
  const off = await loadCorridorData('/corridor/', { fetchFn, gangnam: false, migeum: false, pangyo: false, streams: false });
  assert.ok(!reqs.some((u) => u.includes(GANGNAM_DIR)), '꺼지면 요청 없음');
  assert.ok(!off.index.meta.islands, '꺼지면 섬 없음');
  assert.deepEqual(off.index.meta.bounds, cIndex.meta.bounds);
  reqs.length = 0;
  const on = await loadCorridorData('/corridor/', { fetchFn, gangnam: true, migeum: false, pangyo: false, streams: false });
  assert.ok(reqs.includes('/corridor/' + GANGNAM_DIR + 'index.json') && on.gangnam && on.index.meta.islands[1].x0 === -7500);
  assert.deepEqual(on.index.meta.bounds, cIndex.meta.bounds, '켜도 bounds 숫자는 본선');
  const seen = [];
  const get = async (f) => { seen.push(f); return { b: [f] }; };
  assert.deepEqual(await fetchCorridorTile(get, { key: '-15_-30', ...on.index.tiles['-15_-30'] }, 'tiles'), { b: [GANGNAM_DIR + 'tiles/-15_-30.json'] });
}
ok('island bounds, ?gangnam=0 = no request / no island, tiles from gangnam/');

{
  const labels = [];
  const lm = createPangyoLandmarks(gn, { overlay: { add: (o) => labels.push(o.text) }, prefix: 'gangnam' });
  const key = `${Math.floor(st.x / 500)}_${Math.floor(st.z / 500)}`;
  assert.ok(lm.keys.includes(key), '캐노피 타일 ' + lm.keys.join(','));
  let meshes = 0, tris = 0; const names = [], glow = [];
  const g = lm.build(key);
  g.traverse((o) => { if (!o.isMesh) return; meshes++; names.push(o.name); const gi = o.geometry; tris += (gi.index ? gi.index.count : gi.attributes.position.count) / 3; if (/Glow/.test(o.name)) glow.push(o); });
  assert.ok(names.every((s) => s.startsWith('gangnam') && !/logo|brand/i.test(s)), names.join(','));
  assert.ok(meshes <= 8 && tris < 20000, `canopy meshes ${meshes} tris ${tris}`);
  assert.ok(glow.length === 1 && !glow[0].visible);
  const THREE = await import('three'); const scene = new THREE.Scene(); scene.add(g);
  setEvening(true); assert.ok(glow[0].visible); setEvening(false);
  ok(`entrance canopies ${gates.filter((e) => !e.indoor).length} gates, ${meshes} meshes, ${Math.round(tris)} tris`);
}

for (const [k, t] of Object.entries(gn.tiles)) {
  const L = J(path.join(G, 'lod', k + '.json'));
  const lod = buildLodTile(k, L, base);
  assert.ok(lod.group.children.length > 0, k); lod.dispose();
  const det = buildDetailTile(k, J(path.join(G, 'tiles', k + '.json')), { terrain: null, onRoadAll: () => false });
  assert.ok(det.group.children.length > 0, k); det.dispose();
}
ok('detail + lod tiles build');
console.log('gangnam: all', n, 'checks passed');
