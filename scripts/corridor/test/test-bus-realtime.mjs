// [corridor] 코리더 버스 실시간 어댑터 오프라인 목업 테스트: node scripts/corridor/test/test-bus-realtime.mjs
//   실제 코리더 노선 데이터(public/corridor/transit.json) + 가짜 프록시 응답으로
//   서울 GPS / 경기 정류소순번 → 경로 위 위치, 실패 → 조용히 시뮬레이션 폴백 을 확인한다.
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { SimulatedBusSource, samplePath, projectOnPath } = await import('../../../src/transit/busSource.js');
const { CorridorRealtimeSource, lonLatToXZ, regionOf, POLL_MS, BACKOFF_MS, MAX_ROUTES } = await import('../../../src/corridor/busRealtime.js');

const T = JSON.parse(fs.readFileSync(new URL('../../../public/corridor/transit.json', import.meta.url)));
const data = { ...T, crossings: [] };
const big = { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 };
const C = { lat: 37.36650, lon: 127.10835 }, kx = Math.cos((C.lat * Math.PI) / 180) * 111320, kz = 110540;
const toLL = (x, z) => [x / kx + C.lon, C.lat - z / kz];
const tick = () => new Promise((r) => setTimeout(r, 0));
const flush = async () => { for (let i = 0; i < 20; i++) await tick(); };
let n = 0; const ok = (m) => console.log('  ok', ++n, m);

// 좌표 변환 왕복
{ const [x, z] = lonLatToXZ(...toLL(1234.5, -8765.4)); assert.ok(Math.abs(x - 1234.5) < 1e-6 && Math.abs(z + 8765.4) < 1e-6); ok('lonLatToXZ round trip'); }
// 지역 분류
assert.equal(regionOf({ ref: '340', network: '' }), 'seoul'); assert.equal(regionOf({ ref: '220', src: 'gbis' }), 'gg');
assert.equal(regionOf({ ref: '9401', network: '' }), 'seoul'); assert.equal(regionOf({ ref: '9300', network: '경기 성남시' }), 'gg');
assert.equal(regionOf({ ref: '3217', network: '서울특별시 시내버스' }), 'seoul'); assert.equal(regionOf({ ref: '602-1A', network: '경기도 시내버스' }), 'gg');
ok('regionOf (network / gbis / numbering)');

const make = (fetchImpl, gg = false) => {
  const sim = new SimulatedBusSource(data, big, { seed: 7 });
  let t = 0; const src = new CorridorRealtimeSource(data, { proxy: 'https://proxy.test/', fallback: sim, gg, fetchImpl, now: () => t });
  return { sim, src, adv: (ms) => { t += ms; } };
};
const json = (o) => ({ ok: true, status: 200, json: async () => o });

// ---------- 서울: GPS → 같은 노선 경로 위 ----------
{
  const seoul = T.routes.find((r) => !r.generic && regionOf(r) === 'seoul' && T.paths.some((p) => p.route === r.id));
  const calls = [];
  let pts = [];
  const fetchImpl = async (url) => {
    calls.push(url); const u = new URL(url);
    if (u.pathname === '/seoul/route-list') return json({ msgHeader: { headerCd: '0' }, msgBody: { itemList: [{ busRouteId: '900', busRouteNm: seoul.ref }, { busRouteId: '901', busRouteNm: seoul.ref + '-1' }] } });
    if (u.pathname === '/seoul/positions') return json({ msgHeader: { headerCd: '0' }, msgBody: { itemList: pts } });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const { sim, src, adv } = make(fetchImpl);
  const P = src.pathsByRoute.get('seoul|' + seoul.ref)[0];
  const at = samplePath(P, Math.min(400, P.L / 2));
  // 진행 차로 쪽으로 6m 떨어진 GPS(오차) + 경로에서 먼(800m) 엉뚱한 GPS + 운행 안 함
  const [lon, lat] = toLL(at.x - at.dz * 6, at.z + at.dx * 6);
  const [flon, flat] = toLL(at.x + 800, at.z + 800);
  pts = [{ gpsX: String(lon), gpsY: String(lat), vehId: 'A1', plainNo: '서울1', isrunyn: '1' }, { gpsX: String(flon), gpsY: String(flat), vehId: 'A2', isrunyn: '1' }, { gpsX: String(lon), gpsY: String(lat), vehId: 'A3', isrunyn: '0' }];
  src.update(0.1, {}, { x: at.x, z: at.z }); await flush();
  assert.ok(calls.some((c) => c.startsWith('https://proxy.test/seoul/route-list?keyword=')), 'route-list called');
  assert.ok(calls.some((c) => c === 'https://proxy.test/seoul/positions?busRouteId=900'), 'positions with exact-name match busRouteId');
  assert.ok(calls.length <= MAX_ROUTES * 2, 'at most MAX_ROUTES routes per poll');
  const live = src.vehicles().filter((v) => v.live);
  const mine = live.filter((v) => v.id === 'LSA1');
  assert.equal(mine.length, 1, 'vehicle on path'); assert.ok(!live.some((v) => v.id === 'LSA2' || v.id === 'LSA3'), 'far / not-running dropped');
  const q = src.pathsByRoute.get('seoul|' + seoul.ref).map((pp) => projectOnPath(pp, mine[0].x, mine[0].z)).sort((a, b) => a.d - b.d)[0]; assert.ok(q.d < 1.8, 'snapped onto a path of that route (either direction; sample adds 1.7m lane offset)'); assert.ok(Math.hypot(mine[0].x - at.x, mine[0].z - at.z) < 3, 'at GPS position along path');
  // 실시간 노선의 시뮬 버스는 숨김, 다른 노선 시뮬은 유지
  const simOfRoute = sim.buses.filter((b) => src.keyByRoute.get(b.P.route) === 'seoul|' + seoul.ref).length;
  const others = src.vehicles().filter((v) => !v.live).length;
  assert.equal(others, sim.vehicles().length - simOfRoute);
  ok(`seoul ${seoul.ref}: GPS 6m off path → snapped (d=${q.d.toFixed(2)}m), far/not-running dropped, sim of that route hidden`);
  // 추정 전진 + 다음 폴링 주기
  const st = [...src.state.values()].find((x) => x.vehicles.has('SA1')).vehicles.get('SA1'); const s0 = st.s; src.update(2, {}, null);
  assert.ok(st.s > s0, 'dead reckoning forward');
  const before = calls.length; adv(POLL_MS - 1000); src.update(0.1, {}, null); await flush(); assert.equal(calls.filter((c) => c.includes('/seoul/positions')).length, calls.slice(0, before).filter((c) => c.includes('/seoul/positions')).length, 'no poll before POLL_MS');
  adv(2000); src.update(0.1, {}, null); await flush(); assert.ok(calls.length > before && !calls.slice(before).some((c) => c.includes('route-list')), 'repoll positions only (busRouteId remembered)');
  ok('dead reckoning between polls, poll interval respected, busRouteId cached');
}

// ---------- 경기: 정류소 순번 → 정류소 좌표 → 경로 위 ----------
{
  const gr = T.routes.find((r) => !r.generic && r.src === 'gbis' && T.paths.some((p) => p.route === r.id));
  const { src: off } = make(async () => json({}), false);
  assert.ok(!off.routes.some((r) => r.id === 'gg|' + gr.ref), 'gg routes off by default');
  const sim0 = new SimulatedBusSource(data, big, { seed: 7 });
  const P = sim0.paths.find((p) => p.route === gr.id);
  const a = samplePath(P, Math.min(300, P.L / 3)), b = samplePath(P, Math.min(700, (P.L * 2) / 3));
  const [ax, ay] = toLL(a.x, a.z), [bx, by] = toLL(b.x, b.z);
  const ends = gr.gbis?.split(' · ')[2]?.split('↔').map((s) => s.trim());
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.pathname === '/route-list') return json({ response: { msgHeader: { resultCode: 0 }, msgBody: { busRouteList: [{ routeId: 'G1', routeName: gr.ref, startStationName: ends?.[0], endStationName: ends?.[1] }] } } });
    if (u.pathname === '/route-stations') return json({ response: { msgHeader: { resultCode: 0 }, msgBody: { busRouteStationList: [{ stationSeq: 5, x: ax, y: ay }, { stationSeq: 6, x: bx, y: by }] } } });
    if (u.pathname === '/locations') return json({ response: { msgHeader: { resultCode: 0 }, msgBody: { busLocationList: { stationSeq: 5, vehId: 'V9', plateNo: '경기70바1234' } } } });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const { src } = make(fetchImpl, true);
  src.update(0.1, {}, { x: a.x, z: a.z }); await flush();
  const v = src.vehicles().find((v) => v.id === 'LGV9');
  assert.ok(v, 'gg vehicle placed'); assert.ok(Math.hypot(v.x - a.x, v.z - a.z) < 2, 'at its station');
  ok(`gyeonggi ${gr.ref}: stationSeq → station coords on path (?cbusgg=1)`);
}

// ---------- 실패 → 조용한 시뮬 폴백 + 백오프 ----------
for (const [name, impl] of [['network', async () => { throw new Error('offline'); }], ['404 (worker without seoul routes)', async () => ({ ok: false, status: 404, json: async () => ({}) })], ['502 key error', async () => ({ ok: false, status: 502, json: async () => ({ error: 'gateway', code: '30' }) })]]) {
  let calls = 0; const { sim, src, adv } = make(async (u) => { calls++; return impl(u); });
  const P = src.paths.find((p) => src.keyByRoute.has(p.route)); const at = samplePath(P, 100);
  src.update(0.1, {}, { x: at.x, z: at.z }); await flush();
  assert.equal(src.stats.live, 0); assert.ok(src.stats.fail >= 1);
  assert.equal(src.vehicles().length, sim.vehicles().length, 'all sim buses kept');
  const c1 = calls; adv(BACKOFF_MS - 1000); for (let i = 0; i < 5; i++) { src.update(0.1, {}, null); await flush(); }
  const during = calls - c1; // 백오프 중: 아직 안 해 본 근처 노선만 시도 가능(여기선 첫 폴링이 근처 노선 MAX_ROUTES 개를 모두 시도)
  const c2 = calls; adv(2000); src.update(0.1, {}, null); await flush();
  assert.ok(calls > c2, 'retries after backoff');
  ok(`${name} → silent sim fallback (vehicles=${src.vehicles().length}), ${during} calls during ${BACKOFF_MS / 60000}min backoff, retry after`);
}
// 프록시 없음 → 조회 안 함
{ let calls = 0; const sim = new SimulatedBusSource(data, big, { seed: 7 }); const src = new CorridorRealtimeSource(data, { proxy: '', fallback: sim, fetchImpl: async () => { calls++; } }); src.update(0.1, {}, { x: 0, z: -5000 }); await flush(); assert.equal(calls, 0); ok('no proxy → no requests'); }
console.log(`bus-realtime: ${n} passed`);
