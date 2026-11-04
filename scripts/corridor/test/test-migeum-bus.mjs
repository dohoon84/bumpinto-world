// [migeum-bus] 미금역 일대 버스(G8110 · 7007-1 · 380 · 9407 · 마을 7-1 · 2 · 14) 데이터·런타임 테스트: node scripts/corridor/test/test-migeum-bus.mjs [초]
//   1) migeum/bus.json = build-migeum-bus.mjs 결과(OSM 원본이 있을 때)  2) 출처: GBIS 스냅샷의 정류소만, 순서 그대로, 프록시 주소 없음
//   3) 연속성: 모든 조각 1m 마다 게임에 그려진 차도 폭 안  4) 런타임 합치기(원본 불변·번호 보존) · ?migeumbus=0 / ?migeum=0
//   5) 차량 높이 주행(한 걸음 하강 ≤ 0.5m — 탄천 하도 위 그려지지 않은 다리(돌마교)로 안 들어감)
//   6) 시뮬: 미금 조각마다 같은 버스가 정류장을 순서대로 정차 · 정자 시뮬 G8110 정자역 정차
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { migeumBusEnabled, mergeMigeumBus, MIGEUM_BUS_FILE } from '../../../src/corridor/migeumBus.js';
import { mergeLinkTransit, PANGYO_LINK_FILE } from '../../../src/corridor/pangyo.js';
import { mergeSimExtra } from '../../../src/transit/transit.js';
import { SimulatedBusSource } from '../../../src/transit/busSource.js';
const { mergeTancheon } = await import('../../../src/corridor/tancheon.js');
const { createTerrain } = await import('../../../src/world/terrain.js');
const { loadDrawnRoads } = await import('../build-migeum-bus.mjs');

const SEC = Number(process.argv[2]) || 2400;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public', f), 'utf8'));
const B = J('corridor/' + MIGEUM_BUS_FILE), L = J('corridor/' + PANGYO_LINK_FILE), CO = J('corridor/transit.json'), JZ = J('transit.json'), X = J('corridor/jz-sim.json');
const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/gbis_migeum_stations.json'), 'utf8'));
const LB = J('corridor/index.json').meta.liveBox;
let n = 0; const ok = (m) => { n++; console.log('ok', n, m); };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const ALL = [...B.live.paths.map((p) => ['live', p]), ...B.corridor.paths.map((p) => ['corridor', p])];
const REFS = ['G8110', '7007-1', '380', '9407', '7-1', '2', '14'];

// 1) 커밋 데이터 = 스크립트 결과
{
  const OSM = path.resolve(ROOT, '../bumpinto-world/data/raw/osm_merged.json');
  if (fs.existsSync(OSM)) {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mgbus-')), 'bus.json');
    execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-migeum-bus.mjs'), `--out=${tmp}`], { cwd: ROOT, stdio: 'pipe' });
    const a = JSON.parse(fs.readFileSync(tmp, 'utf8')), b = structuredClone(B); delete a.meta.generated; delete b.meta.generated;
    assert.deepEqual(a, b, 'migeum/bus.json 이 build-migeum-bus.mjs 결과와 다름 — npm run corridor:migeumbus');
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
    ok('committed migeum/bus.json matches build-migeum-bus.mjs');
  } else console.log('skip 1: OSM 원본 없음', OSM);
}

// 2) 출처: GBIS 정류소만, GBIS 순서대로
{
  const raw = JSON.stringify(G) + JSON.stringify(B);
  assert.ok(!/https?:\/\//.test(raw), '프록시/API 주소가 데이터에 들어가면 안 됨');
  assert.deepEqual(G.routes.map((r) => r.ref), REFS, 'GBIS 스냅샷 노선');
  for (const r of G.routes) assert.ok(r.routeId && r.stations.length > 2 && r.queried, `${r.ref} routeId·정류소·조회 시각`);
  const byGbis = new Map(), stopOf = new Map([...JZ.stops, ...CO.stops, ...L.corridor.stops, ...B.corridor.stops].map((s) => [s.id, s]));
  for (const r of G.routes) for (const s of r.stations) byGbis.set(s.id, s);
  for (const s of B.corridor.stops) { assert.ok(/^g\d+$/.test(s.id) && s.src === 'gbis' && byGbis.has(s.gbisId), `새 정류장 ${s.id} 은 GBIS 정류소`); assert.ok(!CO.stops.some((c) => c.id === s.id)); }
  assert.equal(new Set(B.corridor.stops.map((s) => s.id)).size, B.corridor.stops.length);
  const per = {};
  for (const [, p] of ALL) {
    assert.equal(p.src, 'gbis-routed'); assert.ok(REFS.includes(p.ref));
    for (let i = 1; i < p.stops.length; i++) assert.ok(p.stops[i].s > p.stops[i - 1].s, `${p.ref} 정류장 순서`);
    for (const st of p.stops) assert.ok(stopOf.has(st.stop), `${p.ref} 정류장 ${st.stop} 있음`);
    (per[p.ref] ||= new Set()); for (const st of p.stops) per[p.ref].add(st.stop);
  }
  // GBIS 순서: 각 조각의 GBIS 정류장(새 정류장 gbisId)이 그 노선·방향 GBIS seq 범위 안에서 증가
  let chk = 0;
  for (const [, p] of ALL) {
    const r = G.routes.find((q) => q.ref === p.ref), lo = p.dir ? r.turnSeq : 1, hi = p.dir ? r.stations.length : r.turnSeq;
    let last = 0;
    for (const st of p.stops) { const s = stopOf.get(st.stop); if (!s.gbisId) continue; const g = r.stations.find((q) => q.id === s.gbisId && q.seq >= lo && q.seq <= hi && q.seq > last); assert.ok(g, `${p.ref} d${p.dir} ${s.name} GBIS seq`); last = g.seq; chk++; }
  }
  assert.ok(chk >= 40, `GBIS 순서 확인 ${chk}`);
  ok(`source: GBIS ${G.routes.map((r) => `${r.ref}(${r.routeId})`).join(' ')} · 새 정류장 ${B.corridor.stops.length} · 노선별 정차 ${REFS.map((r) => `${r} ${per[r]?.size || 0}`).join(' / ')}`);
}

// 3) 연속성
{
  const near = loadDrawnRoads(); let worst = -Infinity, at = null, cnt = 0;
  for (const [sys, p] of ALL) for (let i = 1; i < p.pts.length; i++) {
    const a = p.pts[i - 1], b = p.pts[i], D = dist(a, b);
    for (let s = 0; s < D; s += 1) { const x = a[0] + (b[0] - a[0]) * s / D, z = a[1] + (b[1] - a[1]) * s / D, g = near(x, z); cnt++; if (g > worst) { worst = g; at = `${sys} ${p.ref} ${x.toFixed(0)},${z.toFixed(0)}`; } }
  }
  assert.ok(worst <= 0, `경로가 그려진 차도 밖 ${worst.toFixed(1)}m @${at}`);
  const inLB = ([x, z]) => x >= LB.x0 - 0.1 && x <= LB.x1 + 0.1 && z >= LB.z0 - 0.1 && z <= LB.z1 + 0.1;
  for (const p of B.live.paths) assert.ok(p.pts.every(inLB), 'live 조각은 정자 bbox 안');
  for (const p of B.corridor.paths) assert.ok(p.pts.every(([x, z]) => !inLB([x, z]) || z >= LB.z1 - 0.1 || z <= LB.z0 + 0.1 || x <= LB.x0 + 0.1 || x >= LB.x1 - 0.1), 'corridor 조각은 정자 bbox 밖');
  ok(`continuity: ${cnt} samples (1m) all inside drawn road (worst ${worst.toFixed(1)}m)`);
}

// 4) 런타임 합치기 + 플래그
{
  assert.equal(migeumBusEnabled(''), true); assert.equal(migeumBusEnabled('?migeumbus=0'), false); assert.equal(migeumBusEnabled('?migeum=0'), false); assert.equal(migeumBusEnabled('?migeumbus=1'), true);
  // 플래그 끔 → bus.json 을 안 읽음(null) → 입력 객체 그대로(바이트 동일)
  const C0 = mergeLinkTransit(CO, L), live0 = mergeSimExtra(mergeSimExtra(JZ, X), L.live);
  assert.equal(mergeMigeumBus(C0, null), C0); assert.equal(mergeMigeumBus(live0, null), live0); assert.equal(mergeMigeumBus(live0, undefined, { flag: 'simExtra' }), live0);
  const sC = JSON.stringify(C0), sL = JSON.stringify(live0);
  const C1 = mergeMigeumBus(C0, B.corridor), L1 = mergeMigeumBus(live0, B.live, { flag: 'simExtra' });
  assert.equal(JSON.stringify(C0), sC, '코리더 원본 불변'); assert.equal(JSON.stringify(live0), sL, '정자 원본 불변');
  for (const [A, Z] of [[C0, C1], [live0, L1]]) {
    assert.ok(Z.paths.length >= A.paths.length);
    A.paths.forEach((p, i) => { const q = Z.paths[i]; assert.equal(q.id ?? i, p.id ?? i, '경로 번호 유지'); assert.equal(q.route, p.route); if (q !== p) assert.ok((q.migeumBus || q.simExtra) && q.ref === p.ref, '바뀐 경로는 같은 번호 대체'); });
    Z.paths.slice(A.paths.length).forEach((p, k) => assert.equal(p.id, A.paths.length + k));
    for (const r of Z.routes) for (const id of r.paths) assert.equal(Z.paths[id].route, r.id, `노선 ${r.ref} 경로 ${id}`);
  }
  assert.deepEqual(C1.migeumBusStats, { added: 12, replaced: 4, skipped: 0 }, JSON.stringify(C1.migeumBusStats));
  assert.deepEqual(L1.migeumBusStats, { added: 2, replaced: 2, skipped: 4 }, JSON.stringify(L1.migeumBusStats));
  assert.deepEqual([110, 113, 116, 117].map((i) => C1.paths[i].migeumBus), [true, true, true, true], '코리더 7007-1·380 미금 쪽 짧은 조각 대체');
  assert.equal(L1.paths.slice(0, 14).every((p, i) => p === live0.paths[i]), true, 'e2e-ride-220 이 쓰는 정자 경로(0~13) 그대로');
  // 정류장: 기존 정류장 객체 재사용(같은 메시 인스턴스) + 새 정류장만 뒤에
  assert.equal(C1.stops.length, C0.stops.length + B.corridor.stops.length); assert.ok(C0.stops.every((s, i) => C1.stops[i] === s || C1.stops[i].id === s.id));
  const reused = new Set(); for (const p of B.corridor.paths) for (const st of p.stops) if (C0.stops.some((s) => s.id === st.stop)) reused.add(st.stop);
  assert.ok(reused.size >= 1, '기존 코리더 정류장 재사용');
  for (const r of ['9407', '7-1', '2', '14', '380']) assert.ok(C1.refTypes[r]?.type, `refTypes ${r}`);
  // ?pangyo=0 (link 없음)에서도 합쳐짐(G8110 노선 새로)
  const C2 = mergeMigeumBus(CO, B.corridor); assert.ok(C2.routes.some((r) => r.ref === 'G8110') && C2.paths.length > CO.paths.length);
  ok(`runtime merge: corridor +${C1.migeumBusStats.added} / 대체 ${C1.migeumBusStats.replaced}, live +${L1.migeumBusStats.added} / 대체 ${L1.migeumBusStats.replaced} / 기존 유지 ${L1.migeumBusStats.skipped} · 기존 정류장 재사용 ${reused.size} · flags off = 입력 그대로`);
}

// 5) 차량 높이(게임과 같은 탄천 + 지류 지형)
{
  const T0 = J('terrain.json'), ext = J('corridor/tancheon.json'), data = J('jeongja.json'), base = J('corridor/base.json'), streams = J('corridor/streams.json');
  const terr = createTerrain({ ...mergeTancheon(T0, ext), streams }, data);
  terr.annotate(data);
  terr.annotate({ roads: base.ch.map((r) => ({ ...r, p: r.p.map((p) => p.slice()) })), water: [], waterLines: [], parks: [] });
  let worst = 0, wAt = '', cnt = 0;
  for (const [, p] of ALL) {
    let y = null;
    for (let i = 1; i < p.pts.length; i++) { const a = p.pts[i - 1], b = p.pts[i], D = dist(a, b), k = Math.max(1, Math.ceil(D / 0.5));
      for (let j = 0; j < k; j++) { const x = a[0] + (b[0] - a[0]) * j / k, z = a[1] + (b[1] - a[1]) * j / k; const ny = terr.getVehicleHeight(x, z, y ?? terr.getVehicleHeight(x, z, 0)); if (y != null && y - ny > worst) { worst = y - ny; wAt = `${p.ref} d${p.dir} ${x.toFixed(0)},${z.toFixed(0)}`; } y = ny; cnt++; } }
  }
  assert.ok(worst <= 0.5, `차량 높이 한 걸음 하강 ${worst.toFixed(2)}m @${wAt}`);
  ok(`vehicle height: ${cnt}점(0.5m) 한 걸음 최대 하강 ${worst.toFixed(2)}m${wAt ? ' @' + wAt : ''}`);
}

// 6) 시뮬
{
  const ctx = { pedLight: () => 'red' };
  const T = mergeMigeumBus(mergeLinkTransit(CO, L), B.corridor);
  const sim = new SimulatedBusSource({ ...T, crossings: [] }, { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 }, { seed: 7, spacing: true });
  const mine = sim.paths.filter((p) => p.migeumBus && p.stops.length);
  const track = new Map();
  for (let t = 0; t < SEC; t += 0.2) {
    sim.update(0.2, ctx);
    for (const b of sim.buses) { if (!b.P.migeumBus) continue; let r = track.get(b.P); if (!r && b.s < 40) track.set(b.P, r = { b, stops: [] }); if (r?.b === b && b.state === 'dwell' && b.dwell > 0 && r.stops.at(-1) !== b.stopIdx) r.stops.push(b.stopIdx); }
  }
  const rep = [];
  for (const P of mine) { const r = track.get(P); assert.ok(r, `${P.ref} d${P.dir} 버스 생김`); assert.deepEqual(r.stops, P.stops.map((_, i) => i), `${P.ref} d${P.dir} 같은 버스가 정류장을 순서대로 ${r.stops}`); rep.push(`${P.ref}/${P.dir}:${r.stops.length}`); }
  const live = mergeMigeumBus(mergeSimExtra(mergeSimExtra(JZ, X), L.live), B.live, { flag: 'simExtra' }), js = new SimulatedBusSource(live, LB, { seed: 7, spacing: true });
  const LP = js.paths.filter((p) => p.ref === 'G8110' || p.ref === '2'); const seen = new Set();
  for (let t = 0; t < 1200 && seen.size < LP.length; t += 0.2) { js.update(0.2, ctx); for (const b of js.buses) if (LP.includes(b.P) && b.state === 'dwell' && b.dwell > 0) seen.add(b.P); }
  assert.equal(seen.size, LP.length, '정자 시뮬: G8110·마을 2 조각 정차');
  ok(`sim: 미금 조각 ${mine.length}개 모두 같은 버스가 순서대로 정차 (${rep.join(' ')}) · 정자 G8110/마을 2 정차`);
}
console.log('migeum-bus: all', n, 'checks passed');
