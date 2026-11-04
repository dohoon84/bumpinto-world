// [migeum-sub] 미금역 지하철 (PR feat/migeum-subway): 플래그 · 기존 역 시간표 그대로 · 정자↔미금 같은 열차 · 출구 = OSM · 구역 덧붙임 · 실시간 없으면 시간표 근사
//   기존 역 기준 시각(lineOffsets)은 scripts/fixtures/subway-line-offsets-base.json (feat/migeum-station 444b0f6 에서 뽑은 460개) 과 같아야 한다
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ON = process.env.MIGEUM !== '0' && process.env.MIGEUMSUB !== '0';
const { migeumSubEnabled, STATIONS, STATIONS_BASE, EXT_STATIONS } = await import('../src/subway/roster.js');
const { STATIONS: ALL, LINE_STOPS } = await import('../src/subway/stationsData.js');
const R = await import('../src/subway/ride.js');
const { MOTION } = R;
const { ZONES, zoneSlot } = await import('../src/net/zones.js');
const { ALLOWED, subwayArrival } = await import('../server/phone/src/subway.js');
const { createArrivalFeed, simulatedRows } = await import('../src/subway/arrivals.js');
const { stationTheme } = await import('../src/subway/stations.js');

// 1) 플래그
assert.equal(migeumSubEnabled('?migeumsub=0'), false); assert.equal(migeumSubEnabled('?migeum=0'), false);
assert.equal(migeumSubEnabled('?migeum=0&migeumsub=1'), false, '?migeum=0 이 지하철도 끈다');
assert.equal(migeumSubEnabled(''), true); assert.equal(migeumSubEnabled('?ws=mock&migeumsub=1'), true);
{ const { migeumSubwayDrawsEntrances: D } = await import('../src/corridor/migeum.js'); // 1단계 출입구 캐노피와 겹치지 않게
  assert.equal(D(''), true); assert.equal(D('?migeumsub=0'), false); assert.equal(D('?migeum=0'), false); assert.equal(D('?subway=0'), false, '지하철 전체 끔 → 1단계 캐노피 유지'); }
assert.equal(STATIONS_BASE.length, 15); assert.ok(STATIONS_BASE.every((d) => !d.ext));
assert.equal(STATIONS.length, ON ? 16 : 15); assert.deepEqual(EXT_STATIONS.map((d) => d.id), ON ? ['migeum'] : []);
assert.deepEqual(ALL.slice(0, 15).map((d) => d.id), STATIONS_BASE.map((d) => d.id), '기존 역 순서 그대로, 미금은 맨 뒤');

// 2) 기존 역 시각 = 확장 전 (꺼짐: 460개 전부, 켜짐: 미금 4개만 다름)
const base = JSON.parse(fs.readFileSync(new URL('./fixtures/subway-line-offsets-base.json', import.meta.url), 'utf8'));
const now = {};
for (const l of Object.keys(LINE_STOPS)) for (const d of [0, 1]) now[`${l}-${d}`] = Object.fromEntries(R.lineOffsets(l, d));
let n = 0; const diff = [];
for (const [k, m] of Object.entries(base)) for (const [s, v] of Object.entries(m)) { n++; if (now[k][s] !== v) diff.push(`${k}:${s}`); }
assert.equal(n, 460);
assert.deepEqual(diff.sort(), ON ? ['shin-0:미금', 'shin-1:미금', 'suin-0:미금', 'suin-1:미금'] : [], '기존 역 오프셋 그대로');
for (const k of Object.keys(base)) { assert.deepEqual(Object.keys(now[k]), Object.keys(base[k]), k); const first = Object.entries(now[k])[0]; assert.equal(first[1], 0, `${k} 원점 = 첫 역 (${first[0]})`); }
assert.equal(now['suin-0']['정자'], base['suin-0']['정자']); assert.equal(now['shin-1']['정자'], base['shin-1']['정자']);

// 3) 정자 ↔ 미금: 실제 거리(역 좌표 직선) · 같은 열차(run)
const J = ALL.find((d) => d.id === 'jeongja'), M = ALL.find((d) => d.id === 'migeum');
const dist = R.segmentDist('정자', '미금');
if (ON) {
  assert.ok(Math.abs(dist - Math.hypot(M.x - J.x, M.z - J.z)) < 1e-9 && Math.abs(dist - 1845.94) < 0.01, `정자→미금 ${dist}`);
  const hop = MOTION.DWELL + R.segmentProfile(dist).T; // 정자 정차 시작 → 미금 정차 시작
  const close = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} vs ${b}`);
  close(now['suin-0']['미금'] - now['suin-0']['정자'], hop, 'suin 수원 방면: 정자 → 미금');
  close(now['suin-1']['정자'] - now['suin-1']['미금'], hop, 'suin 왕십리 방면: 미금 → 정자');
  close(now['shin-0']['미금'] - now['shin-0']['정자'], hop, 'shin 광교 방면');
  close(now['shin-1']['정자'] - now['shin-1']['미금'], hop, 'shin 신사 방면');
  // 열차 안 타임라인 도착(arr) = 미금 승강장 정차 시각, 같은 run
  for (const [l, d, a, b] of [['suin', 0, 'jeongja', 'migeum'], ['shin', 0, 'jeongja', 'migeum'], ['suin', 1, 'migeum', 'jeongja'], ['shin', 1, 'migeum', 'jeongja']]) {
    const A = ALL.find((s) => s.id === a), B = ALL.find((s) => s.id === b);
    const rides = R.rideStops(l, d, A.name); assert.equal(rides[0].id, b, `${l}-${d} ${A.name} → ${B.name}`);
    const seg = R.rideTimeline(A.name, rides)[0];
    for (const ms of [Date.UTC(2026, 10, 4, 5, 3, 17), Date.UTC(2026, 10, 4, 13, 59, 2)]) {
      const at0 = R.simNextArrival(l, d, a, ms), at1 = R.simNextArrival(l, d, b, at0.at + 1000); // 정자 정차 1초 뒤 → 다음 미금 정차
      assert.equal(at1.run, at0.run, `${l}-${d} 같은 열차`); close((at1.at - at0.at) / 1000, seg.arr, `${l}-${d} 타임라인 도착 = 승강장 시각`);
    }
  }
  assert.deepEqual(R.rideStops('suin', 0, '정자').map((q) => q.id), ['migeum']); assert.deepEqual(R.rideStops('shin', 0, '정자').map((q) => q.id), ['migeum']);
} else {
  assert.deepEqual(R.rideStops('suin', 0, '정자'), []); assert.deepEqual(R.rideStops('shin', 0, '정자'), []);
  assert.equal(R.isGameStop('suin', '미금'), false);
}

// 4) 출구 = OSM (data/osm_migeum_raw.json subway_entrance), 템플릿 배치 bad = 0, 5번 = 실내(indoor) 라 뺌
const raw = JSON.parse(fs.readFileSync(new URL('../data/osm_migeum_raw.json', import.meta.url), 'utf8')).elements;
const ent = new Map(raw.filter((e) => e.type === 'node' && e.tags?.railway === 'subway_entrance').map((e) => [e.id, e]));
assert.deepEqual(M.lines, ['suin', 'shin']); assert.equal(M.ext, 'migeum'); assert.equal(M.nameEn, 'Migeum');
assert.deepEqual(M.exits.map((e) => e.ref), ['1', '2', '3', '4', '6', '7', '8']);
for (const e of M.exits) {
  const o = ent.get(e.osm); assert.ok(o, `출구 ${e.ref} osm ${e.osm}`); assert.equal(o.tags.ref, e.ref); assert.equal(o.lat, e.lat); assert.equal(o.lon, e.lon);
  assert.equal(e.place.bad, 0, `출구 ${e.ref} 배치`); assert.ok(Math.hypot(e.place.x - M.x, e.place.z - M.z) < 120, `출구 ${e.ref} 역 근처`);
}
for (const id of M.osmStations) assert.ok(raw.some((e) => e.id === id && e.tags?.name === '미금'), `역 노드 ${id}`);

// 5) 구역 (append-only): 116..120
assert.deepEqual(ZONES.slice(116, 121), ['migeum-station', 'migeum-station/p-suin-0', 'migeum-station/p-suin-1', 'migeum-station/p-shin-0', 'migeum-station/p-shin-1']);
assert.equal(zoneSlot(R.platformZone('migeum', 'shin', 1)), 120);

// 6) 실시간: worker 코드는 미금 허용 (배포는 도훈님). 배포 전 worker = 400 unknown_station → 화면은 시간표 근사
assert.ok(ALLOWED.includes('미금'));
{
  const url = new URL('https://w.example/subway/arrival?station=' + encodeURIComponent('미금'));
  const r = await subwayArrival(new Request(url), {}, {}, url, { waitUntil: (p) => p });
  assert.equal(r.status, 200); assert.equal((await r.json()).reason, 'no_key', '새 코드: 미금 = 허용 (키 없으면 no_key)');
}
{
  const th = stationTheme(M); const t = Date.UTC(2026, 10, 4, 6, 0, 0);
  const old = createArrivalFeed({ theme: th, base: 'https://w.example', now: () => t, fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: 'unknown_station' }), { status: 400 }) });
  await old._poll(); const g = old.get();
  assert.equal(g.live, false); assert.deepEqual(g.rows, simulatedRows(th, t, th.id)); assert.equal(old.raw(), null, '열차 시각도 시간표 근사');
}

// 7) 같은 검사를 반대 플래그로 한 번 더 (자식 프로세스)
if (!process.env.MIGEUM_CHILD) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, MIGEUM_CHILD: '1', MIGEUMSUB: ON ? '0' : '1' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
}
console.log(`subway migeum (${ON ? 'on' : 'off'}${process.env.MIGEUM_CHILD ? '' : ' + ' + (ON ? 'off' : 'on')}): flag · base offsets (460) · 정자↔미금 ${dist.toFixed(1)}m same run · exits = OSM · zones 116..120 · worker 400 → sim OK`);
