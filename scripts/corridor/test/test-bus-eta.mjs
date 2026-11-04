// [bus-rt] 정자 실시간 ETA 구동 버스 테스트 (네트워크·키 불필요): node scripts/corridor/test/test-bus-eta.mjs
//   ETA→위치 모델, ETA 시각 도착, 같은 차량 중복 제거, 갱신 시 순간이동 없음, 지도 밖 대기→경계 진입, 폴링(목업 fetch), 프록시 캐시
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import { SimulatedBusSource, RealtimeBusSource, createBusSource, upstreamS, etaFrom, RT_VAVG } from '../../../src/transit/busSource.js';
import worker from '../../../server/bus-proxy/worker.js';

let n = 0; const ok = (m) => console.log('  ok', ++n, m);
const T = {
  routes: [{ id: 1, ref: '220', type: 'city', name: '220' }],
  paths: [{ id: 0, route: 1, ref: '220', pts: [[0, 0], [1000, 0], [2000, 0]], stops: [{ stop: 11, s: 400 }, { stop: 12, s: 900 }, { stop: 13, s: 1500 }] }],
  stops: [{ id: 11, ref: '01111', x: 700, z: 0, routes: ['220'] }, { id: 12, ref: '01112', x: 900, z: 0, routes: ['220'] }, { id: 13, ref: '01113', x: 1100, z: 0, routes: ['220'] }],
  refTypes: {}, crossings: [],
};
const B = { x0: -50, x1: 2050, z0: -50, z1: 50 };
const ctx = { pedLight: () => 'red' };
const mk = () => new RealtimeBusSource(T, B, { proxy: 'http://mock', etaDriven: true, fallback: new SimulatedBusSource(T, B) });
const stop = (id) => T.stops.find((s) => s.id === id);
const at = (P, s) => ({ s, stopIdx: P.stops.findIndex((st) => st.s > s + 1), dwell: 0 });
// 버스가 목표 정류장 idx 에 정차를 시작한 시각
function runUntilDwell(src, idx, maxT = 900, dt = 0.1, onStep) {
  const rt = src.rt;
  for (let t = 0; t < maxT; t += dt) {
    const before = rt.buses.map((b) => [b, b.s]);
    rt.update(dt, ctx); src._rtPending();
    onStep?.(before);
    const b = rt.buses.find((x) => x.dwell > 0 && x.stopIdx === idx);
    if (b) return { t: rt.t, b };
  }
  return null;
}

// 1) upstreamS
{
  const P = mk().rt.paths[0], v = P.vmax * RT_VAVG;
  assert.equal(upstreamS(P, 2, 0), 1500);
  assert.ok(Math.abs(upstreamS(P, 2, 30) - (1500 - 30 * v)) < 1e-6);
  const s = upstreamS(P, 2, 200); assert.ok(s < 900 && s > 0, 'crosses an intermediate stop: ' + s);
  assert.ok(Math.abs(etaFrom(P, at(P, s), 2) - 200) < 1e-6, 'etaFrom inverts upstreamS');
  assert.ok(upstreamS(P, 0, 600) < 0, 'beyond path start → negative');
  ok('upstreamS / etaFrom inverse');
}
// 2) ETA 180초 → 180초쯤 그 정류장 도착(정차), 이후 계속 운행
{
  const src = mk();
  src.reconcile(src.observe(stop(13), [{ routeName: '220', routeTypeCd: 13, predictTimeSec1: 180, vehId1: 'V1' }]));
  assert.equal(src.rt.buses.length, 1);
  const r = runUntilDwell(src, 2);
  assert.ok(r && r.t > 165 && r.t < 188, 'arrived at ' + r?.t);
  while (src.rt.t < 180) src.rt.update(0.1, ctx);
  assert.ok(r.b.dwell > 0 && r.b.stopIdx === 2, 'still at stop at ETA');
  ok(`arrives at ETA (180s → at stop from ${r.t.toFixed(1)}s, still there at 180s)`);
}
// 3) 일찍 도착하면 ETA 까지 정차
{
  const src = mk();
  src.reconcile(src.observe(stop(13), [{ routeName: '220', predictTimeSec1: 30, vehId1: 'V9' }]));
  const b = src.rt.buses[0]; b.tgt.at = src.rt.t + 70; // 갑자기 ETA 가 늘어난 상황(이미 가까이 있음)
  let dep = null;
  for (let t = 0; t < 200 && dep == null; t += 0.1) { src.rt.update(0.1, ctx); if (b.stopIdx > 2 || (b.stopIdx === 3)) dep = src.rt.t; }
  assert.ok(dep != null && dep >= 69, 'left before ETA: ' + dep);
  ok('early bus holds at stop until ETA');
}
// 4) 중복 제거: 같은 차량을 두 정류장에서 → 한 대 (차량 id 있음/없음)
{
  const src = mk();
  const P = src.rt.paths[0], s = upstreamS(P, 1, 60);
  const at2 = etaFrom(P, at(P, s), 2);
  src.reconcile([...src.observe(stop(12), [{ routeName: '220', predictTimeSec1: 60, vehId1: 'A' }]), ...src.observe(stop(13), [{ routeName: '220', predictTimeSec1: at2, vehId1: 'A' }])]);
  assert.equal(src.rt.buses.length, 1); assert.equal(src.rt.buses[0].tgt.idx, 1, 'nearest stop target wins');
  const src2 = mk();
  src2.reconcile([...src2.observe(stop(12), [{ routeName: '220', predictTimeSec1: 60 }]), ...src2.observe(stop(13), [{ routeName: '220', predictTimeSec1: at2 + 20 }])]);
  assert.equal(src2.rt.buses.length, 1);
  src2.reconcile([...src2.observe(stop(12), [{ routeName: '220', predictTimeSec1: 55 }])]); // 다음 갱신: 같은 버스
  assert.equal(src2.rt.buses.length, 1);
  // 1·2번째 버스는 서로 다른 두 대
  const src3 = mk();
  src3.reconcile(src3.observe(stop(13), [{ routeName: '220', predictTimeSec1: 60, predictTimeSec2: 300 }]));
  assert.equal(src3.rt.buses.length + src3.pending.size, 2);
  for (let t = 0; t < 120; t += 0.1) { src3.rt.update(0.1, ctx); src3._rtPending(); }
  assert.equal(src3.rt.nextId - 1000000, 2, "2nd bus enters later, not merged");
  ok('dedupe by vehId and by ETA consistency; 1st/2nd bus distinct');
}
// 5) 갱신: ETA 가 60초 늘어도 순간이동 없음, 새 ETA 에 도착
{
  const src = mk();
  src.reconcile(src.observe(stop(13), [{ routeName: '220', predictTimeSec1: 150, vehId1: 'V2' }]));
  for (let t = 0; t < 40; t += 0.1) src.rt.update(0.1, ctx);
  src.reconcile(src.observe(stop(13), [{ routeName: '220', predictTimeSec1: 170, vehId1: 'V2' }])); // 40초 뒤 ETA 170 (원래 110 → +60)
  assert.equal(src.rt.buses.length, 1);
  let maxJump = 0;
  const r = runUntilDwell(src, 2, 600, 0.1, (before) => { for (const [b, s] of before) maxJump = Math.max(maxJump, Math.abs(b.s - s)); });
  assert.ok(maxJump < src.rt.paths[0].vmax * 1.3 * 0.1 + 0.05, 'jump ' + maxJump);
  assert.ok(r && r.t > 195 && r.t < 220, 'arrived at ' + r?.t);
  ok(`reconcile eases (max step ${maxJump.toFixed(2)}m), new ETA met (${r.t.toFixed(1)}s ≈ 210s)`);
}
// 6) 지도 밖(경로 시작 전) → 대기, 시간이 되면 경로 시작에서 생성
{
  const src = mk();
  src.reconcile(src.observe(stop(11), [{ routeName: '220', predictTimeSec1: 400, vehId1: 'F' }]));
  assert.equal(src.rt.buses.length, 0); assert.equal(src.pending.size, 1);
  let nextPoll = 25;
  const r = runUntilDwell(src, 0, 600, 0.1, () => { if (src.rt.t >= nextPoll) { nextPoll += 25; src.reconcile(src.observe(stop(11), [{ routeName: '220', predictTimeSec1: Math.max(0, 400 - src.rt.t), vehId1: 'F' }])); } });
  assert.ok(src.pending.size === 0 && r && r.t > 385 && r.t < 410, 'arrived ' + r?.t);
  ok(`pending → spawn at map edge, arrives on time (${r.t.toFixed(1)}s)`);
}
// 7) 폴링(목업 프록시) + 상태/라벨 + 폴백 + ?busrt=0
{
  const calls = [];
  globalThis.fetch = async (u) => {
    calls.push(String(u)); const url = new URL(String(u));
    if (url.pathname === '/stations') return new Response(JSON.stringify({ response: { msgHeader: { resultCode: 0 }, msgBody: { busStationList: [{ stationId: 'S' + url.searchParams.get('keyword'), mobileNo: url.searchParams.get('keyword') }] } } }));
    if (url.pathname === '/arrivals') return new Response(JSON.stringify({ response: { msgHeader: { resultCode: 0 }, msgBody: { busArrivalList: [{ routeName: '220', routeTypeCd: 13, predictTimeSec1: { S01111: 30, S01112: 104, S01113: 191 }[url.searchParams.get('stationId')], locationNo1: 2, vehId1: 'Z1', plateNo1: '경기70바1234' }] } } }));
    return new Response('{}', { status: 404 });
  };
  const src = mk();
  const okN = await src._rtPoll({ x: 900, z: 0 });
  assert.equal(okN, 3); assert.equal(src.rt.buses.length, 1, 'same vehicle seen from 3 stops → 1 bus');
  assert.equal(calls.filter((c) => c.includes('/arrivals')).length, 3);
  src.rtState = 'ok';
  assert.equal(src.vehicles().length, 1); assert.ok(src.vehicles()[0].id >= 1000000);
  const a = src.arrivals(stop(13)); assert.equal(a[0].ref, '220'); assert.ok(a[0].etaSec <= 191 && a[0].etaSec > 185);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'gateway' }), { status: 502 });
  const bad = mk(); assert.equal(await bad._rtPoll({ x: 900, z: 0 }), 0); assert.ok(bad.vehicles().length > 0, 'falls back to sim');
  const old = createBusSource('realtime', T, B, { proxy: 'http://mock' });
  assert.equal(old.rt, null); assert.equal(old.fallback.spacing, false);
  ok('poll via proxy, dedupe across stops, label/fallback, busrt=0 → old source');
}
// 8) 프록시 공유 캐시: /arrivals 30초 TTL, 같은 정류장 두 번 → 상류 1번, 키 노출 없음
{
  const store = new Map(); let up = 0;
  globalThis.caches = { default: { match: async (r) => store.get(r.url)?.clone(), put: async (r, res) => { store.set(r.url, res); } } };
  globalThis.fetch = async () => { up++; return new Response(JSON.stringify({ response: { msgHeader: { resultCode: 0 }, msgBody: { busArrivalList: [] } } })); };
  const env = { DATA_GO_KR_KEY: 'SECRET-KEY' };
  const call = async () => { const w = []; const res = await worker.fetch(new Request('https://p.test/arrivals?stationId=206000999'), env, { waitUntil: (p) => w.push(p) }); await Promise.all(w); return res; };
  const r1 = await call(); const r2 = await call();
  assert.equal(up, 1); assert.equal(r1.headers.get('Cache-Control'), 'public, max-age=30');
  assert.ok(!(await r2.text()).includes('SECRET-KEY'));
  ok('worker /arrivals shared cache (30s), 1 upstream call for 2 requests');
}
console.log('test-bus-eta: ok');
// 9) 실제 정자 데이터(+시뮬 추가 경로)·보행 신호 대기 포함: 경로마다 마지막 정류장 ETA 150초 → 오차
{
  const fs = await import('node:fs');
  const { mergeSimExtra } = await import('../../../src/transit/transit.js');
  const read = (f) => JSON.parse(fs.readFileSync(new URL(`../../../public/${f}`, import.meta.url)));
  const JZ = mergeSimExtra(read('transit.json'), read('corridor/jz-sim.json'));
  const JB = { x0: -606, x1: 597.2, z0: -608, z1: 939.6 };
  const src = new RealtimeBusSource(JZ, JB, { proxy: 'http://mock', etaDriven: true, fallback: null });
  const rt = src.rt, stopById = new Map(JZ.stops.map((s) => [s.id, s]));
  const want = new Map();
  for (const P of rt.paths) {
    if (P.stops.length < 2) continue;
    const idx = P.stops.length - 1, st = stopById.get(P.stops[idx].stop);
    if (!st || upstreamS(P, idx, 150) < 0) continue;
    const o = { key: `${P.ref}:${P.id}`, P, idx, at: rt.t + 150, stop: st.id };
    src.reconcile([o]); want.set(o.key, { idx, got: null });
  }
  const sig = { pedLight: (c) => ((rt.t + Math.abs(c.x * 7.3 + c.z * 3.1)) % 60 < 26 ? 'green' : 'red') }; // 게임과 같은 60초 주기·보행 26초, 횡단보도마다 위상 다름
  for (let t = 0; t < 260; t += 1 / 30) {
    rt.update(1 / 30, sig);
    for (const b of rt.buses) { const w = want.get(b.key); if (w && w.got == null && b.dwell > 0 && b.stopIdx === w.idx) w.got = rt.t; }
  }
  if (process.env.DBG) console.log([...want].map(([k, w]) => k + "=" + (w.got == null ? "none" : (w.got - 150).toFixed(1))).join(" "));
  const errs = [...want.values()].map((w) => (w.got == null ? Infinity : w.got > 150 ? w.got - 150 : (150 - w.got > 40 ? 150 - w.got - 40 : 0))); // 늦음 / 40초 넘게 일찍(대기로 못 메움)
  const okN = errs.filter((e) => e < 20).length;
  console.log(`  jz real paths: ${okN}/${errs.length} within 20s, median lateness ${errs.sort((a, b) => a - b)[errs.length >> 1]?.toFixed(1)}s, buses ${rt.buses.length}`);
  assert.ok(errs.length >= 3 && okN >= errs.length * 0.8, 'ETA accuracy on real paths');
  ok('real 정자 paths with signals/spacing: arrivals near ETA');
}
console.log('test-bus-eta: all ok');
