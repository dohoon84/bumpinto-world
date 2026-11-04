// [migeum-taxibike] 미금역 택시 승차 지점 · 카카오바이크 테스트: node scripts/corridor/test/test-migeum-taxibike.mjs
//   데이터 = node scripts/corridor/build-migeum-taxibike.mjs (OSM 0개 → 규칙 배치)
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Group, Scene } from 'three';
import { buildTaxiBike, RULE } from '../build-migeum-taxibike.mjs';
import { migeumTaxiEnabled, migeumBikeEnabled, pickMigeumTaxiBike, migeumTaxiExits, mergeMigeumDrive, MIGEUM_TAXIBIKE_FILE } from '../../../src/corridor/migeum.js';
import { loadCorridorData } from '../../../src/corridor/index.js';
import { createCorridorTraffic } from '../../../src/corridor/traffic.js';
import { KakaoBikes } from '../../../src/entities/bike.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const TB = J('public/corridor/migeum/taxibike.json'), mi = J('public/corridor/migeum/index.json'), drive = J('public/corridor/drive.json');
const cIndex = J('public/corridor/index.json'), base = J('public/corridor/base.json');
const st = mi.stations.find((s) => s.name === '미금');
let n = 0; const ok = (name) => { n++; console.log('ok', n, name); };
const sd = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); return Math.hypot(x - ax - dx * k, z - az - dz * k); };

// 1) 커밋된 데이터 = 빌드 결과
assert.deepEqual(buildTaxiBike(), TB, 'taxibike.json 이 build-migeum-taxibike.mjs 결과와 다름 — node scripts/corridor/build-migeum-taxibike.mjs');
ok('taxibike.json = build-migeum-taxibike.mjs 결과');

// 2) OSM 조회 결과: 택시 승강장 0 · 대여 자전거 0 (그래서 규칙 배치) — 출처 명시
const q = J('data/osm_migeum_taxibike_raw.json');
assert.equal(q.elements.filter((e) => e.tags?.amenity === 'taxi' || e.tags?.taxi).length, 0);
assert.equal(q.elements.filter((e) => e.tags?.amenity === 'bicycle_rental' || e.tags?.bicycle_rental).length, 0);
assert.equal(J('data/osm_migeum_raw.json').elements.filter((e) => ['taxi', 'bicycle_rental'].includes(e.tags?.amenity)).length, 0, '미금 원본 OSM 에도 없음');
assert.ok(fs.existsSync(path.join(ROOT, TB.meta.osm.query)) && fs.existsSync(path.join(ROOT, TB.meta.osm.result)));
assert.match(TB.meta.note, /규칙 배치/); assert.match(TB.meta.attribution, /OpenStreetMap/);
ok('OSM amenity=taxi 0 · bicycle_rental 0, 쿼리·결과 파일 · 규칙 배치 표기');

// 3) 플래그
assert.equal(migeumTaxiEnabled(''), true); assert.equal(migeumBikeEnabled(''), true);
assert.equal(migeumTaxiEnabled('?migeumtaxi=0'), false); assert.equal(migeumBikeEnabled('?migeumtaxi=0'), true);
assert.equal(migeumBikeEnabled('?migeumbike=0'), false); assert.equal(migeumTaxiEnabled('?migeumbike=0'), true);
assert.equal(migeumTaxiEnabled('?migeum=0'), false); assert.equal(migeumBikeEnabled('?migeum=0'), false);
assert.equal(pickMigeumTaxiBike(TB, { taxi: false, bike: false }), null);
assert.equal(pickMigeumTaxiBike(TB, { taxi: false }).taxi, null); assert.equal(pickMigeumTaxiBike(TB, { bike: false }).bike, null);
{
  const asked = [];
  const fetchFn = async (u) => { asked.push(u); const f = path.join(ROOT, 'public/corridor', u.replace(/^\/corridor\//, '')); return fs.existsSync(f) ? { ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) } : { ok: false }; };
  const opt = { streams: false, pangyo: false, fetchFn };
  const off = await loadCorridorData('/corridor/', { ...opt, migeum: false });
  assert.ok(!asked.some((u) => u.endsWith(MIGEUM_TAXIBIKE_FILE)) && off.migeumTaxiBike === null, '?migeum=0 → 요청 없음');
  asked.length = 0;
  const none = await loadCorridorData('/corridor/', { ...opt, migeum: true, migeumTaxi: false, migeumBike: false });
  assert.ok(!asked.some((u) => u.endsWith(MIGEUM_TAXIBIKE_FILE)) && none.migeumTaxiBike === null, '둘 다 끄면 요청 없음');
  const on = await loadCorridorData('/corridor/', { ...opt, migeum: true, migeumTaxi: true, migeumBike: false });
  assert.ok(on.migeumTaxiBike.taxi && on.migeumTaxiBike.bike === null);
}
ok('?migeumtaxi=0 · ?migeumbike=0 · ?migeum=0 (끄면 파일 요청도 없음)');

// 4) 택시 승차 지점: 출입구 8곳 모두 · 출입구에서 TAXI_D 안 · primary/secondary 가장자리(중심선에서 폭/2) · 진행방향 오른쪽
const ext = TB.taxi.drive, merged = mergeMigeumDrive(drive, ext);
const P = TB.taxi.points;
assert.equal(P.length + TB.taxi.skipped.length, st.exits.length);
assert.equal(P.length, 8, '출입구 8곳 모두 승차 지점');
for (const p of P) {
  const e = st.exits.find((x) => x.ref === p.ref);
  assert.ok(Math.hypot(e.x - p.exit[0], e.z - p.exit[1]) < 0.01 && p.d <= RULE.TAXI_D && ['primary', 'secondary'].includes(p.k) && p.right, p.ref);
  const w = merged.ways.find((x) => x.id === p.way); assert.ok(w, 'way ' + p.way);
  let dc = Infinity; for (const ww of merged.ways.filter((x) => x.id === p.way)) for (let i = 1; i < ww.n.length; i++) dc = Math.min(dc, sd(p.x, p.z, ...merged.nodes[ww.n[i - 1]], ...merged.nodes[ww.n[i]]));
  assert.ok(Math.abs(dc - w.w / 2) < 0.15, `${p.ref} 중심선에서 ${dc.toFixed(2)}m (폭/2=${w.w / 2})`);
}
// taxis.js 정차 판정(진행방향 오른쪽, u>8 · u<L-4 · -2<v<폭/2+16)을 만족하는 방향 간선이 (코리더+미금 연장) 그래프에 모두 있다
for (const p of P) {
  let hit = false;
  for (const w of merged.ways) for (const sgn of w.ow === 1 ? [1] : w.ow === -1 ? [-1] : [1, -1]) {
    const nn = sgn === 1 ? w.n : [...w.n].reverse();
    for (let i = 1; i < nn.length && !hit; i++) {
      const a = merged.nodes[nn[i - 1]], b = merged.nodes[nn[i]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
      const u = (p.x - a[0]) * dx + (p.z - a[1]) * dz, v = (p.x - a[0]) * -dz + (p.z - a[1]) * dx;
      if (u > 8 && u < L - 4 && v > -2 && v < w.w / 2 + 16) hit = true;
    }
  }
  assert.ok(hit, `${p.ref}번 승차 지점에 정차할 차로 없음`);
  if (p.src === 'corridor') assert.ok(drive.ways.some((w) => w.id === p.way));
}
ok(`택시 승차 지점 ${P.length}곳 (출입구별 ${P.map((p) => p.ref + ':' + p.road + '/' + p.d + 'm').join(' ')})`);

// 5) 미금 차도 연장: 원본 불변 · 교차점에서 이어짐 · 같은 way 없음
assert.equal(drive.nodes.length, 16887); assert.notEqual(merged, drive);
assert.equal(merged.nodes.length, drive.nodes.length + ext.nodes.length - ext.joined, `노드 ${ext.joined}개는 기존 성남대로 끝과 공유`);
assert.ok(ext.joined >= 2 && ext.ways.every((w) => !drive.ways.some((d) => d.id === w.id)));
assert.equal(mergeMigeumDrive(drive, null), drive);
ok(`차도 연장 way ${ext.ways.length} · 노드 ${ext.nodes.length}(기존과 공유 ${ext.joined})`);

// 6) 코리더 택시: 플래그 끔(extraExits 없음) = 예전과 같은 출입구 목록 · 켜면 미금 지점 8개 추가 · 미금에서 실제로 정차
const crossings = { crossings: base.crossings.map((c, i) => ({ ...c, id: 'cc' + i, sig: c.w >= 10, cl: '0', g: 0 })), pedLight: () => 'red' };
const world = { onRoad: () => false, isBlocked: () => false, groundY: null };
const make = (dr, extra) => createCorridorTraffic(new Group(), { drive: dr, crossings, terrain: null, terrainT: null, world, stations: cIndex.stations, liveBox: cIndex.meta.liveBox, getBuses: () => [], params: new URLSearchParams('cwalkers=0&ctrucks=0'), overlay: null, extraExits: extra });
const A = make(drive, null), B = make(drive, undefined);
assert.deepEqual(A.cars.exits, B.cars.exits); assert.equal(A.cars.exits.length, cIndex.stations.flatMap((s) => s.exits || []).length);
const C = make(merged, migeumTaxiExits(TB.taxi));
assert.equal(C.cars.exits.length, A.cars.exits.length + 8);
const stops = new Set();
for (let k = 0; k < 2400; k++) { C.update(0.1, st.x, st.z); for (const t of C.cars.list) if (t.stop?.ref?.startsWith('미금')) stops.add(t.i + ':' + t.stop.ref); }
const refs = [...new Set([...stops].map((s) => s.split(':')[1]))].sort();
assert.ok(stops.size >= 2, '미금 승차 정차 ' + stops.size);
ok(`코리더 택시 미금 정차 ${stops.size}회(240s) · 출입구 ${refs.join(', ')} · 끄면 출입구 목록 동일`);

// 7) 카카오바이크 자리: 보도 위(보도 선에서 0.6m 안) · 차도 밖 · 반경 안 · 간격 · 상한
const S = TB.bike.spots;
const tiles = fs.readdirSync(path.join(ROOT, 'public/corridor/migeum/tiles')).map((f) => J('public/corridor/migeum/tiles/' + f));
const walk = tiles.flatMap((t) => t.r.filter((r) => RULE.SIDEWALK.includes(r.k)));
assert.ok(S.length > 0 && S.length <= RULE.MAX);
for (const [x, z] of S) {
  assert.ok(Math.hypot(x - st.x, z - st.z) <= RULE.RADIUS + 0.6);
  assert.ok(walk.some((r) => r.p.some((p, i) => i && sd(x, z, ...r.p[i - 1], ...p) <= 0.51)), `보도 위 ${x},${z}`);
}
for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) assert.ok(Math.hypot(S[i][0] - S[j][0], S[i][1] - S[j][1]) >= RULE.SEPARATION);
ok(`카카오바이크 ${S.length}자리 (반경 ${RULE.RADIUS}m · 간격 ≥${RULE.SEPARATION}m · 상한 ${RULE.MAX})`);

// 8) 런타임: 정자 자전거 그대로 + 미금 인스턴스 1개 · 탈 때만 개별 메시
{
  const data = { station: { x: 0, z: 0 } };
  const wpath = [{ kind: 'footway', pts: [[-100, 5], [100, 5]] }, { kind: 'footway', pts: [[5, -100], [5, 100]] }];
  const w = { walkPaths: wpath, signPos: { x: 999, z: 999 }, isBlocked: () => false, onRoad: () => false, groundY: () => 0 };
  const s1 = new Scene(), s2 = new Scene();
  const k1 = new KakaoBikes(s1, w, data), k2 = new KakaoBikes(s2, w, data);
  const n0 = k1.list.length, kids = s2.children.length;
  assert.ok(n0 > 0);
  assert.equal(k2.addInstanced(s2, S, () => 12.5), S.length);
  assert.deepEqual(k2.list.slice(0, n0).map((b) => [b.x, b.z, b.y, b.ry]), k1.list.map((b) => [b.x, b.z, b.y, b.ry]), '정자 자전거 동일');
  assert.equal(s2.children.length, kids + 1, '미금 자전거는 객체 1개');
  const im = s2.children.at(-1); assert.ok(im.isInstancedMesh && im.count === S.length && im.castShadow);
  const b = k2.list[n0 + 3]; assert.equal(b.y, 12.5); assert.equal(b.mesh, null);
  assert.equal(k2.nearest(b.x + 1, b.z), b);
  k2.mount(b); assert.ok(b.mesh && b.wheelF && b.stand && s2.children.includes(b.mesh) && k2.riding === b);
  const e = im.instanceMatrix.array; assert.equal(e[(n0 + 3 - n0) * 16], 0, '탄 자전거 인스턴스 숨김');
  b.x += 20; k2.place(b); k2.spin(0.1);
  k2.dismount(); assert.equal(b.mesh, null); assert.equal(s2.children.length, kids + 1);
  assert.ok(Math.abs(e[3 * 16 + 12] - b.x) < 1e-4, '내린 자리로 인스턴스 이동');
  assert.equal(new KakaoBikes(new Scene(), w, data).addInstanced(new Scene(), [], null), 0);
}
ok('KakaoBikes.addInstanced: 정자 목록 동일 · InstancedMesh 1개 · 탈 때만 개별 메시 → 내리면 인스턴스로');
console.log('test-migeum-taxibike: all', n, 'ok');
