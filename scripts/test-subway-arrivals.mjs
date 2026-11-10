// [subway] 실시간 도착 프록시(server/phone/src/subway.js) + 안내판 데이터(src/subway/arrivals.js) 픽스처 테스트
//   네트워크 안 씀: fetch·caches 를 가짜로. 실제 응답 확인은 도훈 환경(.env.local 키) 또는 배포된 worker 에서.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeArrival, subwayArrival, ALLOWED, SUBWAY_ID as WORKER_IDS, SUBWAY_CACHE_SEC } from '../server/phone/src/subway.js';
import { SUBWAY_ID, LINES } from '../src/subway/lines.js';
import { STATIONS, stationTheme } from '../src/subway/stations.js';
import { STATIONS as STATIONS_DATA } from '../src/subway/stationsData.js';
import { boardRows, simulatedRows, kstMinute, createArrivalFeed, POLL_SEC } from '../src/subway/arrivals.js';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/subway-arrival-imae.json', import.meta.url), 'utf8'));
const KEY = 'TESTKEY-not-real-0123456789abc';

// 노선 id 표는 클라이언트·worker 가 같다, 허용 역 = 게임 역
assert.deepEqual({ ...WORKER_IDS }, { ...SUBWAY_ID });
assert.deepEqual([...ALLOWED], STATIONS_DATA.map((d) => d.name).concat(['판교', '청계산입구'])); // [gyeongbu-bus] extraStations 역은 stationsData 뒤에 덧붙임
assert.equal(ALLOWED.at(-2), '판교'); assert.equal(ALLOWED.at(-1), '청계산입구'); // [gyeongbu-bus] 강남 다음, 맨 뒤
for (const k of Object.values(SUBWAY_ID)) assert.ok(LINES[k]);
assert.ok(SUBWAY_CACHE_SEC >= 20 && SUBWAY_CACHE_SEC <= 30 && POLL_SEC >= SUBWAY_CACHE_SEC);

// ---------- normalizeArrival ----------
{
  const n = normalizeArrival(fx);
  assert.equal(n.ok, true); assert.equal(n.trains.length, 4);
  const t = n.trains[0];
  assert.deepEqual([t.line, t.updn, t.dest, t.way, t.msg, t.etaSec, t.code, t.trainNo, t.kind, t.last, t.recptnDt], ['suin', '상행', '왕십리', '왕십리행 - 야탑방면', '이매 도착', 0, 1, '6130', '일반', false, '2026-11-03 15:55:24']);
  assert.equal(n.trains[3].line, 'gg');
  assert.deepEqual(normalizeArrival({ errorMessage: { code: 'INFO-200' } }), { ok: false, reason: 'no_data', code: 'INFO-200' });
  assert.equal(normalizeArrival({ status: 500, code: 'ERROR-337', message: '일일 트래픽 초과' }).reason, 'upstream');
  assert.equal(normalizeArrival({ errorMessage: { code: 'INFO-000' }, realtimeArrivalList: [{ subwayId: '1063' }] }).code, 'NO_KNOWN_LINE', '모르는 노선만 있으면 없음');
  assert.equal(normalizeArrival(null).ok, false);
  const long = normalizeArrival({ errorMessage: { code: 'INFO-000' }, realtimeArrivalList: [{ subwayId: '1075', arvlMsg2: 'x'.repeat(500) }] });
  assert.equal(long.trains[0].msg.length, 40, '길이 제한');
}

// ---------- worker 라우트 (가짜 fetch + caches) ----------
{
  const store = new Map(); let upstream = [];
  globalThis.caches = { default: { match: async (r) => { const v = store.get(r.url); return v ? new Response(v.body, { headers: v.headers }) : undefined; }, put: async (r, res) => { store.set(r.url, { body: await res.text(), headers: Object.fromEntries(res.headers) }); } } };
  let mode = 'ok';
  globalThis.fetch = async (u) => {
    upstream.push(String(u));
    if (mode === 'throw') throw new Error('connect failed ' + u); // 진짜 런타임 오류에 URL 이 섞이는 경우
    if (mode === '500') return new Response('err', { status: 500 });
    return new Response(JSON.stringify(fx), { headers: { 'Content-Type': 'application/json' } });
  };
  const logs = []; const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = (...a) => logs.push(a.join(' '));
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const call = async (q, env = { SEOUL_SUBWAY_KEY: KEY }, method = 'GET') => {
    const url = new URL('https://w.example/subway/arrival' + q);
    const r = await subwayArrival(new Request(url, { method }), env, cors, url, { waitUntil: (p) => p });
    const text = await r.text();
    return { r, text, j: JSON.parse(text) };
  };
  try {
    const a = await call('?station=' + encodeURIComponent('이매'));
    assert.equal(a.r.status, 200); assert.equal(a.j.ok, true); assert.equal(a.j.station, '이매'); assert.equal(a.j.trains.length, 4); assert.equal(a.r.headers.get('X-Cache'), 'MISS');
    assert.equal(a.r.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(upstream.length, 1);
    assert.ok(upstream[0].startsWith('http://swopenapi.seoul.go.kr/api/subway/' + KEY + '/json/realtimeStationArrival/0/'), 'upstream URL 형식');
    assert.ok(upstream[0].endsWith('/' + encodeURIComponent('이매')));
    assert.match(a.r.headers.get('Cache-Control'), /max-age=25/);
    // 캐시: 두 번째는 upstream 안 감
    await new Promise((r) => setTimeout(r, 5));
    const b = await call('?station=' + encodeURIComponent('이매역'));
    assert.equal(b.r.headers.get('X-Cache'), 'HIT'); assert.equal(upstream.length, 1, '25초 캐시'); assert.equal(b.j.fetchedAt, a.j.fetchedAt);
    // 허용 안 된 역 / 메서드
    assert.equal((await call('?station=' + encodeURIComponent('서울'))).r.status, 400);
    assert.equal((await call('?station=..%2F..%2Fx')).j.error, 'unknown_station');
    assert.equal((await call('?station=' + encodeURIComponent('잠실'), undefined, 'POST')).r.status, 404);
    assert.equal(upstream.length, 1);
    // 키 없음 → 게임은 근사로
    const nk = await call('?station=' + encodeURIComponent('잠실'), {});
    assert.deepEqual([nk.j.ok, nk.j.reason], [false, 'no_key']); assert.equal(upstream.length, 1);
    // upstream 실패 (URL 섞인 오류) → 키가 응답에 안 나감, 10초만 캐시
    mode = 'throw';
    const f = await call('?station=' + encodeURIComponent('잠실'));
    assert.deepEqual([f.j.ok, f.j.reason], [false, 'upstream_fetch']); assert.match(f.r.headers.get('Cache-Control'), /max-age=10/);
    mode = '500';
    const g = await call('?station=' + encodeURIComponent('석촌'));
    assert.deepEqual([g.j.reason, g.j.status], ['upstream_http', 500]);
    for (const x of [a, b, nk, f, g]) { assert.ok(!x.text.includes(KEY), '응답 본문에 키 없음'); for (const [, v] of x.r.headers) assert.ok(!v.includes(KEY), '헤더에 키 없음'); }
    for (const v of store.values()) assert.ok(!v.body.includes(KEY), '캐시에 키 없음');
  } finally { Object.assign(console, orig); }
  assert.ok(!logs.some((l) => l.includes(KEY)), '로그에 키 없음');
}

// ---------- 안내판 줄 ----------
{
  const imae = stationTheme(STATIONS.find((d) => d.id === 'imae'));
  const data = { ok: true, fetchedAt: 1000, ...normalizeArrival(fx) };
  const rows = boardRows(imae, data, 1000);
  assert.deepEqual(rows.map((r) => [r.line, r.dest, r.msg]), [['suin', '왕십리행', '이매 도착'], ['suin', '인천행', '전역 도착'], ['gg', '여주행', '3분 후']], '방면별 첫 열차, 노선 순서');
  assert.equal(rows[0].color, LINES.suin.color);
  assert.equal(boardRows(imae, data, 1000 + 100e3)[2].msg, '1분 후', '받은 뒤 흐른 시간만큼 줄임');
  assert.equal(boardRows(imae, data, 1000 + 130e3)[2].msg, '곧 도착');
  assert.equal(boardRows(imae, { ok: false }), null);
  assert.equal(boardRows(stationTheme(STATIONS.find((d) => d.id === 'jamsil')), data), null, '다른 역 노선은 안 씀');
  const sim = simulatedRows(imae, 12 * 60, 'imae');
  assert.equal(sim.length, 4); assert.deepEqual(sim.map((r) => r.line), ['suin', 'suin', 'gg', 'gg']);
  for (const r of sim) assert.match(r.msg, /^(약 \d+분 후|곧 도착)$/);
  assert.ok(simulatedRows(imae, 3 * 60, 'imae').every((r) => r.msg === '운행 종료'));
  assert.equal(kstMinute(Date.UTC(2026, 10, 3, 6, 55)), 15 * 60 + 55);
  // 피드: 실시간 → 실패하면 근사, 표시 문구
  let resp = { ok: true, json: async () => data };
  const urls = [];
  const feed = createArrivalFeed({ theme: imae, base: 'https://w.example/', fetchImpl: async (u) => (urls.push(u), resp), now: () => 1000 });
  assert.equal(feed.get().live, false, '받기 전엔 근사'); assert.match(feed.get().note, /시간표 근사/);
  feed.tick(0.1); await new Promise((r) => setTimeout(r, 0));
  assert.equal(urls[0], 'https://w.example/subway/arrival?station=' + encodeURIComponent('이매'));
  const v = feed.version; const g = feed.get(); assert.equal(g.live, true); assert.match(g.note, /실시간/); assert.ok(feed.version > v);
  feed.tick(1); assert.equal(urls.length, 1, '30초마다');
  resp = { ok: false };
  await feed._poll(); assert.equal(feed.get().live, false);
  const off = createArrivalFeed({ theme: imae, base: 'https://w.example', enabled: false, fetchImpl: async (u) => (urls.push(u), resp) });
  off.tick(1); await off._poll(); assert.equal(urls.length, 2, '?subwayRt=0 이면 요청 안 함');
  feed.stop(); feed.tick(100); assert.equal(urls.length, 2);
}
console.log('subway arrivals: normalize · worker proxy (cache · allow-list · no key leak) · board rows · feed OK');
