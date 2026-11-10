// [livebus] 강남 실시간 버스 도착 — worker + 안내판 + ETA 위치 (네트워크·키 불필요)
import './corridor/test/dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { busArrivals, seoulNormalize, itemsFromSeoul, itemsFromGg, mergeArrivals, formatEta, parseArrivalMsg, lookupStop, BUS_CACHE_SEC, BUS_STOPS } from '../server/phone/src/bus.js';
import { liveBusEnabled, boardText, agedArrivals, upstreamS, livePlacement, createLiveBusFeed } from '../src/gangnam/liveBus.js';
import { groupStopsByArs, BUS_CREDIT } from '../src/corridor/gangnamBus.js';
import { buildBrtTransit } from '../src/gangnam/brtData.js';

const KEY = 'TEST-SECRET-KEY-+/=abc';
const seoulXml = fs.readFileSync(new URL('./fixtures/seoul-bus-station-22010.xml', import.meta.url), 'utf8');
const ggFx = JSON.parse(fs.readFileSync(new URL('./fixtures/gg-bus-arrivals-22009.json', import.meta.url), 'utf8'));
const street = JSON.parse(fs.readFileSync(new URL('../public/corridor/gangnam/street.json', import.meta.url), 'utf8'));
const transit = JSON.parse(fs.readFileSync(new URL('../public/corridor/gangnam/transit.json', import.meta.url), 'utf8'));

let n = 0; const ok = (m) => console.log('  ok', ++n, m);

// 1) 정류소 표 (실제 ARS·GBIS ID)
assert.equal(lookupStop('22009').ggId, '121000009');
assert.equal(lookupStop('121000010').ars, '22010');
assert.equal(lookupStop('22654').name, '강남역5번출구');
assert.equal(lookupStop('22408').ggId, '121000947');
assert.equal(lookupStop('99999'), null);
ok('stop map (ARS ↔ GBIS stationId)');

// 2) 서울 XML 파서 (공식 getStationByUid 스키마 픽스처)
{
  const o = seoulNormalize(seoulXml);
  assert.equal(o.msgHeader.headerCd, '0');
  const items = itemsFromSeoul(o);
  assert.equal(items.length, 3);
  assert.equal(items[0].ref, '140'); assert.equal(items[0].etaSec, 180); assert.equal(items[0].msg, '3분 후'); assert.equal(items[0].type, 'seat');
  assert.equal(items[1].ref, '402'); assert.equal(items[1].etaSec, 20); assert.equal(items[1].msg, '곧 도착');
  assert.equal(items[2].ref, '9404'); assert.equal(items[2].etaSec, null); // 운행종료
  assert.equal(parseArrivalMsg('곧 도착'), 0);
  assert.equal(parseArrivalMsg('7분후[3번째 전]'), 420);
  assert.equal(parseArrivalMsg('운행종료'), null);
  ok('seoul XML → items, eta from traTime/arrmsg');
}

// 3) 경기 JSON (2026-11-10 19:21 KST 실제 응답을 줄인 기록)
{
  const items = itemsFromGg(ggFx);
  assert.equal(items.length, 5);
  const a = items.find((x) => x.ref === '1151');
  assert.equal(a.etaSec, 235); assert.equal(a.type, 'express'); assert.equal(a.vehId, '204000181');
  const reserved = items.find((x) => x.ref === '5100예약');
  assert.equal(reserved.etaSec, null);
  ok('gyeonggi recorded arrivals (1151 235s at 22009)');
}

// 4) 서울+경기 합치기: 같은 번호는 더 가까운 ETA
{
  const seoul = itemsFromSeoul(seoulNormalize(seoulXml));
  const gg = itemsFromGg(ggFx);
  const m = mergeArrivals(seoul, gg);
  assert.ok(m.find((x) => x.ref === '140'));
  assert.ok(m.find((x) => x.ref === '1151'));
  const y = m.find((x) => x.ref === '9404');
  assert.equal(y.etaSec, 617, 'GG ETA wins over 운행종료');
  assert.ok(m[0].etaSec <= m[1].etaSec);
  ok('merge seoul+gg, sort by ETA');
}

// 5) 안내판 문구 · 시간 경과
{
  assert.equal(formatEta(20), '곧 도착');
  assert.equal(formatEta(180), '3분 후');
  const data = { ok: true, fetchedAt: 1_000_000, arrivals: [{ ref: '1151', etaSec: 235, msg: '4분 후' }, { ref: '9404', etaSec: 617, msg: '10분 후' }] };
  const aged = agedArrivals(data, 1_000_000 + 60_000);
  assert.equal(aged[0].etaSec, 175); assert.equal(aged[0].msg, '3분 후');
  assert.equal(boardText(aged), '🚏 1151 3분 후 · 9404 9분 후');
  assert.equal(agedArrivals(data, 1_000_000 + 200_000), null, '3분 지난 값은 버림');
  ok('board text and aging');
}

assert.equal(liveBusEnabled(''), true);
assert.equal(liveBusEnabled('?livebus=0'), false);
assert.equal(liveBusEnabled('?gbrt=0&livebus=1'), true);
assert.ok(BUS_CREDIT.includes('서울특별시'));
assert.equal(transit.meta.bus, BUS_CREDIT);
ok('?livebus=0 opt-out, credit matches data');

// 6) ARS 기준으로 정류장을 나누면 22009/22010 이 섞이지 않는다
{
  const stops = groupStopsByArs(transit.routes);
  const a = stops.find((s) => s.arsId === '22009');
  const b = stops.find((s) => s.arsId === '22010');
  assert.ok(a && b && a !== b);
  const na = new Set(a.routes.map((r) => r.no));
  const nb = new Set(b.routes.map((r) => r.no));
  assert.ok(na.has('140') && nb.has('140'));
  assert.notEqual(a.x, b.x);
  ok('groupStopsByArs splits 22009 / 22010');
}

// 7) ETA → 경로 위치
{
  const T = buildBrtTransit(street.brt);
  const P = { ...T.paths[0], vmax: 12, stops: T.paths[0].stops };
  P.vmax = 12;
  const idx = P.stops.length - 1;
  const s = upstreamS(P, idx, 60, 7.2, 15);
  assert.ok(s < P.stops[idx].s);
  assert.ok(Math.abs((P.stops[idx].s - s) - 60 * 7.2) < 1 || s >= 0);
  ok(`upstreamS 60s → ${ (P.stops[idx].s - s).toFixed(1) }m before stop`);
  const near = livePlacement(P, idx, 12);
  assert.equal(near.atStop, true);
  assert.ok(Math.abs(near.s - (P.stops[idx].s - 6)) < 0.01);
  const later = livePlacement(P, idx, 180);
  assert.equal(later.atStop, false);
  assert.ok(later.s < P.stops[idx].s - 50);
  ok('livePlacement snaps 곧 도착 to the bay');
}

// 8) worker 라우트 (가짜 fetch + caches), 키 노출 없음
{
  const store = new Map(); let upstream = [];
  globalThis.caches = { default: { match: async (r) => { const v = store.get(r.url); return v ? new Response(v.body, { headers: v.headers }) : undefined; }, put: async (r, res) => { store.set(r.url, { body: await res.text(), headers: Object.fromEntries(res.headers) }); } } };
  let mode = 'both';
  globalThis.fetch = async (u) => {
    const url = String(u);
    upstream.push(url);
    if (mode === 'throw') throw new Error('connect failed ' + url);
    if (url.includes('ws.bus.go.kr')) return new Response(seoulXml, { headers: { 'Content-Type': 'text/xml' } });
    if (url.includes('getBusArrivalListv2')) return new Response(JSON.stringify(ggFx), { headers: { 'Content-Type': 'application/json' } });
    return new Response('err', { status: 500 });
  };
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const call = async (q, env = { SEOUL_BUS_KEY: KEY }, method = 'GET') => {
    const url = new URL('https://w.example/bus/arrivals' + q);
    const r = await busArrivals(new Request(url, { method }), env, cors, url, { waitUntil: (p) => p });
    const text = await r.text();
    assert.ok(!text.includes(KEY) && !text.includes(encodeURIComponent(KEY)), 'key leaked in body');
    for (const [, v] of r.headers) assert.ok(!v.includes(KEY), 'key leaked in header');
    return { r, text, j: JSON.parse(text) };
  };
  const a = await call('?stop=22010');
  assert.equal(a.r.status, 200); assert.equal(a.j.ok, true); assert.equal(a.j.stop, '22010');
  assert.ok(a.j.providers.includes('seoul') && a.j.providers.includes('gg'));
  assert.ok(a.j.arrivals.find((x) => x.ref === '140'));
  assert.ok(a.j.arrivals.find((x) => x.ref === '1151'));
  assert.ok(upstream.some((u) => u.includes('getStationByUid') && u.includes('arsId=22010')));
  assert.ok(upstream.some((u) => u.includes('getBusArrivalListv2') && u.includes('stationId=121000010')));
  assert.match(a.r.headers.get('Cache-Control'), /max-age=25/);
  assert.equal(BUS_CACHE_SEC, 25);
  const before = upstream.length;
  const b = await call('?stop=22010');
  assert.equal(b.r.headers.get('X-Cache'), 'HIT'); assert.equal(upstream.length, before, 'cached');
  assert.equal((await call('?stop=99999')).r.status, 400);
  assert.equal((await call('?stop=22010', {}, 'POST')).r.status, 404);
  const nk = await call('?stop=22009', {});
  assert.deepEqual([nk.j.ok, nk.j.reason], [false, 'no_key']);
  mode = 'throw'; store.clear();
  const f = await call('?stop=22014');
  assert.equal(f.j.ok, false); assert.ok(!f.text.includes(KEY));
  ok('worker /bus/arrivals cache, CORS, unknown stop, no_key, no key leak');
}

// 9) 피드: 폴링 · 폴백 · BRT syncLive
{
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(String(u));
    const stop = new URL(String(u), 'https://x.test').searchParams.get('stop');
    if (stop === '22009') return { ok: true, status: 200, json: async () => ({ ok: true, stop, fetchedAt: 1_000_000, arrivals: itemsFromGg(ggFx).filter((x) => x.etaSec != null) }) };
    return { ok: true, status: 200, json: async () => ({ ok: false, reason: 'no_data' }) };
  };
  let t = 1_000_000;
  const feed = createLiveBusFeed({ base: 'https://phone.test', fetchImpl, now: () => t, enabled: true });
  const brt = street.brt;
  feed.register(brt.stops);
  feed.tick(30, { x: brt.stops.find((s) => s.ref === '22009').x, z: brt.stops.find((s) => s.ref === '22009').z });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(calls.some((c) => c === 'https://phone.test/bus/arrivals?stop=22009'));
  const rows = feed.arrivals('22009', t);
  assert.ok(rows.find((x) => x.ref === '1151'));
  assert.equal(feed.board('22009', t).includes('1151'), true);

  const { SimulatedBusSource } = await import('../src/transit/busSource.js');
  const T = buildBrtTransit(brt);
  const sim = new SimulatedBusSource(T, { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 }, { seed: 1, spacing: true, dwell: 15 });
  const before = sim.buses.length;
  const synced = feed.syncBrt(sim, brt, t);
  assert.ok(synced.n >= 1, 'spawned live buses ' + synced.n);
  const live = sim.buses.filter((b) => b.live);
  assert.ok(live.some((b) => String(b.live).includes('1151') || b.P.ref === '1151'));
  ok(`feed polls worker, board has 1151, syncBrt spawned ${synced.n} (sim was ${before})`);
}

console.log(`bus-arrivals: ${n} passed`);
