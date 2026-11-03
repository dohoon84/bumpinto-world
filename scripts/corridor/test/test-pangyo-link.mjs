// [pangyo-link] 판교 확장 2단계(정자역 → 판교역 8110) 데이터·런타임 테스트: node scripts/corridor/test/test-pangyo-link.mjs [초]
//   1) link.json = build-pangyo-link.mjs 결과(OSM 원본이 있을 때)  2) 경로 모양: 정자 조각 → 경계 → 코리더/판교 조각, 정류장 순서
//   3) 연속성: 경로 1m 마다 게임에 그려진 차도 폭 안  4) 런타임 합치기(원본 불변·번호 보존)와 ?pangyolink=0 / ?pangyo=0
//   5) 탄천 다리 높이: 게임 상판·하상 vs 공개 자료(기록값) 허용 2m, 차량 높이 주행(하강 ≤ 0.5m, 상판 아래로 안 내려감)
//   6) 시뮬: 8110 버스가 정자역에서 서고, 경계를 넘어 판교역.낙생육교.현대백화점에 정차
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pangyoLinkEnabled, mergeLinkTransit, PANGYO_LINK_FILE } from '../../../src/corridor/pangyo.js';
import { mergeSimExtra } from '../../../src/transit/transit.js';
import { SimulatedBusSource } from '../../../src/transit/busSource.js';
const { mergeTancheon } = await import('../../../src/corridor/tancheon.js');
const { createTerrain } = await import('../../../src/world/terrain.js');
const { loadDrawnRoads, CROSSINGS } = await import('../build-pangyo-link.mjs');

const SEC = Number(process.argv[2]) || 1800;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public', f), 'utf8'));
const L = J('corridor/' + PANGYO_LINK_FILE), CO = J('corridor/transit.json'), JZ = J('transit.json'), X = J('corridor/jz-sim.json');
const CI = J('corridor/index.json'), LB = CI.meta.liveBox;
let n = 0; const ok = (m) => { n++; console.log('ok', n, m); };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dirAt = (pts, i, j) => { const dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };

// 1) 커밋 데이터 = 스크립트 결과
{
  const OSM = path.resolve(ROOT, '../bumpinto-world/data/raw/osm_merged.json');
  if (fs.existsSync(OSM)) {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pglink-')), 'link.json');
    execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-pangyo-link.mjs'), `--out=${tmp}`], { cwd: ROOT, stdio: 'pipe' });
    const a = JSON.parse(fs.readFileSync(tmp, 'utf8')), b = structuredClone(L); delete a.meta.generated; delete b.meta.generated;
    assert.deepEqual(a, b, 'link.json 이 build-pangyo-link.mjs 결과와 다름 — npm run corridor:pangyolink');
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
    ok('committed link.json matches build-pangyo-link.mjs');
  } else console.log('skip 1: OSM 원본 없음', OSM);
}

// 2) 모양·정류장 순서
const lp = L.live.paths[0], cp = L.corridor.paths[0];
assert.equal(L.live.paths.length, 1); assert.equal(L.corridor.paths.length, 1);
assert.ok(lp.ref === 'G8110' && cp.ref === 'G8110' && lp.route === 7090965 && cp.route === 7090965);
// [g8110] 화면 표기 G8110, 내부 id·osmRef 는 relation 그대로 · 정류장 목록의 구형 '8110' 은 G8110 으로 합침
assert.ok(L.live.routes[0].ref === 'G8110' && L.live.routes[0].name === 'G8110번' && L.live.routes[0].osmRef === '8110' && L.live.aliasRefs['8110'] === 'G8110');
{ const T0 = { routes: [], paths: [], stops: [{ id: 1, routes: ['102', 'G8110', '8110'] }, { id: 2, routes: ['8110'] }], refTypes: {} };
  const M = mergeSimExtra(T0, L.live); assert.deepEqual(M.stops.map((s) => s.routes), [['102', 'G8110'], ['G8110']], 'alias 8110 → G8110'); }
const inLB = ([x, z]) => x >= LB.x0 && x <= LB.x1 && z >= LB.z0 && z <= LB.z1;
assert.ok(lp.pts.every(inLB), '정자 조각은 정자 bbox 안');
assert.ok(Math.abs(lp.pts.at(-1)[1] - LB.z0) < 0.1, '정자 조각 끝 = 정자 bbox 북쪽 경계');
assert.ok(dist(lp.pts.at(-1), cp.pts[0]) < 0.2, '코리더 조각이 정자 조각 끝에서 시작');
{ const a = dirAt(lp.pts, lp.pts.length - 2, lp.pts.length - 1), b = dirAt(cp.pts, 0, 1); assert.ok(a[0] * b[0] + a[1] * b[1] > 0.9, '경계 방향 일치'); }
const stopName = new Map([...JZ.stops, ...CO.stops, ...L.corridor.stops].map((s) => [s.id, s.name]));
const seq = [...lp.stops, ...cp.stops].map((s) => stopName.get(s.stop));
assert.deepEqual(seq, ['정자역', '롯데백화점.수내역', '서현역.AK플라자', '이매촌한신.서현역.AK프라자', '판교역.낙생육교.현대백화점'], 'relation 정류장 순서');
for (const p of [lp, cp]) for (let i = 1; i < p.stops.length; i++) assert.ok(p.stops[i].s > p.stops[i - 1].s);
const pgStop = L.corridor.stops.find((s) => /^판교역/.test(s.name));
assert.ok(pgStop && pgStop.x > 0 && pgStop.x < 1000 && pgStop.z < -2500 && pgStop.z > -3500 && pgStop.routes.includes('G8110'), '판교역 정류장(판교 박스 안)');
assert.ok(cp.pts.at(-1)[0] >= -250, '판교 박스 안에서 끝남');
ok(`shape: 정자 ${lp.len}m + 코리더 ${cp.len}m, 정류장 ${seq.join(' → ')}`);

// 3) 연속성
{
  const { near } = loadDrawnRoads();
  let worst = -Infinity, at = null, cnt = 0;
  const kinds = new Map();
  for (const p of [lp, cp]) for (let i = 1; i < p.pts.length; i++) {
    const a = p.pts[i - 1], b = p.pts[i], D = dist(a, b);
    for (let s = 0; s < D; s += 1) { const x = a[0] + (b[0] - a[0]) * s / D, z = a[1] + (b[1] - a[1]) * s / D, q = near(x, z); cnt++; kinds.set(q.road?.src, (kinds.get(q.road?.src) || 0) + 1); if (q.gap > worst) { worst = q.gap; at = [x.toFixed(0), z.toFixed(0)]; } }
  }
  assert.ok(worst <= 0, `경로가 그려진 차도 밖 ${worst.toFixed(1)}m @${at}`);
  assert.ok(kinds.get('pangyo') > 300 && kinds.get('tancheon') > 50 && kinds.get('jeongja') > 300 && kinds.get('corridor') > 1000, JSON.stringify([...kinds]));
  ok(`continuity: ${cnt} samples (1m) all inside drawn road (worst edge gap ${worst.toFixed(1)}m) — ${JSON.stringify(Object.fromEntries(kinds))}`);
}

// 4) 런타임 합치기 + 플래그
{
  assert.equal(pangyoLinkEnabled(''), true); assert.equal(pangyoLinkEnabled('?pangyolink=0'), false); assert.equal(pangyoLinkEnabled('?pangyo=0'), false); assert.equal(pangyoLinkEnabled('?pangyolink=1'), true);
  const before = JSON.stringify(CO), T = mergeLinkTransit(CO, L);
  assert.equal(JSON.stringify(CO), before, '원본 불변');
  assert.equal(T.paths.length, CO.paths.length + 1); assert.ok(T.paths.slice(0, CO.paths.length).every((p, i) => p.id === i && p === CO.paths[i]), '기존 경로 번호 그대로');
  assert.equal(T.stops.length, CO.stops.length + L.corridor.stops.length);
  for (const id of L.corridor.addRoute) assert.ok(T.stops.find((s) => s.id === id).routes.includes('G8110') && !CO.stops.find((s) => s.id === id).routes.includes('G8110'));
  assert.equal(mergeLinkTransit(CO, null), CO, 'link 없으면 원본 그대로');
  const base = mergeSimExtra(JZ, X), TL = mergeSimExtra(base, L.live);
  assert.equal(TL.paths.length, base.paths.length + 1); assert.equal(TL.paths.at(-1).ref, 'G8110'); assert.equal(mergeSimExtra(base, null), base);
  assert.equal(base.paths.length, 14, 'e2e-ride-220 이 쓰는 정자 경로 번호(5·10) 앞쪽 그대로');
  ok('runtime merge keeps originals; ?pangyolink=0 / ?pangyo=0 off');
}

// 5) 탄천 다리 높이 + 차량 높이
{
  const T0 = J('terrain.json'), ext = J('corridor/tancheon.json'), data = J('jeongja.json'), base = J('corridor/base.json');
  const terr = createTerrain(mergeTancheon(T0, ext), data);
  terr.annotate(data);
  terr.annotate({ roads: base.ch.map((r) => ({ ...r, p: r.p.map((p) => p.slice()) })), water: [], waterLines: [], parks: [] });
  const P = terr.params || {};
  const pts = [...lp.pts, ...cp.pts.slice(1)], dense = [];
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], D = dist(a, b), k = Math.max(1, Math.ceil(D / 0.5)); for (let j = 0; j < k; j++) dense.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]); }
  let y = 0, maxDrop = 0, under = 0;
  const rep = [];
  for (const [x, z] of dense) { const ny = terr.getVehicleHeight(x, z, y); maxDrop = Math.max(maxDrop, y - ny); const d = terr.deckAt(x, z); if (d && d.h > -0.05 && ny < d.h - 0.01) under++; y = ny; }
  assert.ok(maxDrop <= 0.5, `차량 높이 한 걸음 하강 ${maxDrop.toFixed(2)}`); assert.equal(under, 0, '상판 아래로 내려감');
  for (const c of CROSSINGS) {
    const near = dense.filter(([x, z]) => Math.hypot(x - c.at[0], z - c.at[1]) < 110);
    assert.ok(near.length > 100, `${c.name} 경로가 지남`);
    const decks = near.map(([x, z]) => terr.deckAt(x, z)).filter((d) => d && d.h > -0.05);
    assert.ok(decks.length > 40, `${c.name} 상판 위를 달림 ${decks.length}`);
    const deckH = Math.max(...decks.map((d) => d.h)), bed = Math.min(...near.map(([x, z]) => terr.baseHeight(x, z)));
    const relief = deckH - bed, pubR = c.public.heightM ? [Math.min(c.public.heightM, c.dem.reliefM[0]), Math.max(c.public.heightM, c.dem.reliefM[1])] : c.dem.reliefM;
    const off = relief < pubR[0] ? pubR[0] - relief : relief > pubR[1] ? relief - pubR[1] : 0;
    rep.push(`${c.name} 게임 상판 ${deckH.toFixed(1)} / 하상 ${bed.toFixed(1)} (차 ${relief.toFixed(1)}m) vs 공개 ${pubR.join('~')}m (벗어남 ${off.toFixed(1)}m)`);
    assert.ok(off <= 2, `${c.name} 상판-하상 차 ${relief.toFixed(1)}m 가 공개 자료 ${pubR}m 에서 2m 넘게 벗어남`);
    assert.equal(deckH, 0, `${c.name} 상판 = 도로 높이 0`);
  }
  ok(`bridges: ${rep.join(' · ')} · 주행 ${dense.length}점 최대 하강 ${maxDrop.toFixed(2)}m (FLOOR ${P.FLOOR} BED ${P.BED})`);
}

// 6) 시뮬: 코리더(8110 → 판교역) + 정자(시뮬 모드, 정자역 정차)
{
  const T = mergeLinkTransit(CO, L), ctx = { pedLight: () => 'red' };
  const sim = new SimulatedBusSource({ ...T, crossings: [] }, { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 }, { seed: 7, spacing: true }); // buses.js 와 같은 큰 상자
  const P = sim.paths.find((p) => p.ref === 'G8110'), k = P.stops.length - 1;
  let first = null, served = new Set(), track = null; // track: 경계 근처에서 처음 생긴 버스 하나를 끝까지 따라감
  for (let t = 0; t < SEC; t += 0.2) {
    sim.update(0.2, ctx);
    for (const b of sim.buses) {
      if (b.P !== P) continue;
      if (!track && b.s < 30) track = { b, t0: t, stops: [] };
      if (b.state === 'dwell' && b.dwell > 0) { served.add(b.stopIdx); if (track?.b === b && track.stops.at(-1) !== b.stopIdx) track.stops.push(b.stopIdx); if (track?.b === b && b.stopIdx === k && first == null) first = t - track.t0; }
    }
  }
  assert.equal(served.size, P.stops.length, `코리더 G8110 정차 ${[...served]}`);
  assert.ok(first != null, '경계에서 출발한 버스가 판교역 정차');
  assert.deepEqual(track.stops, P.stops.map((_, i) => i), '같은 버스가 정류장을 순서대로');
  const live = mergeSimExtra(mergeSimExtra(JZ, X), L.live), js = new SimulatedBusSource(live, LB, { seed: 7, spacing: true });
  const LP = js.paths.find((p) => p.ref === 'G8110'); let jz = false;
  for (let t = 0; t < 900 && !jz; t += 0.2) { js.update(0.2, ctx); jz = js.buses.some((b) => b.P === LP && b.state === 'dwell' && b.dwell > 0); }
  assert.ok(jz, '정자 시뮬: 정자역 정차');
  ok(`sim: 코리더 G8110 정류장 ${served.size}/${P.stops.length} 정차, 경계(정자 bbox) → 판교역 한 대 ${(first / 60).toFixed(1)}분 정류장 ${track.stops.join('→')} · 정자 시뮬 정자역 정차`);
}
console.log('pangyo-link: all', n, 'checks passed');
