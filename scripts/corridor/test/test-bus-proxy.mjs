// [corridor] 버스 프록시 Worker 오프라인 목업 테스트 (네트워크·키 불필요): node scripts/corridor/test/test-bus-proxy.mjs
//   가짜 caches.default / fetch 로 worker.fetch 를 직접 부른다. 응답·로그 어디에도 서비스키가 나오지 않는지 확인.
import assert from 'node:assert/strict';
import worker, { seoulNormalize } from '../../../server/bus-proxy/worker.js';

const KEY = 'TEST-SECRET-KEY-+/=abc';
const store = new Map();
globalThis.caches = { default: { match: async (r) => store.get(r.url)?.clone(), put: async (r, res) => { store.set(r.url, res); } } };
let upstream = [], reply = () => new Response('{}');
globalThis.fetch = async (url) => { upstream.push(String(url)); return reply(String(url)); };
const env = { DATA_GO_KR_KEY: KEY };
const call = async (path, origin = 'http://localhost:4173') => {
  const waits = []; const ctx = { waitUntil: (p) => waits.push(p) };
  const res = await worker.fetch(new Request('https://proxy.test' + path, { headers: { Origin: origin } }), env, ctx);
  await Promise.all(waits);
  const text = await res.text();
  assert.ok(!text.includes(KEY) && !text.includes(encodeURIComponent(KEY)), 'key leaked in body: ' + path);
  for (const [, v] of res.headers) assert.ok(!v.includes(KEY), 'key leaked in header');
  return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })(), headers: res.headers };
};
let n = 0; const ok = (m) => console.log('  ok', ++n, m);

// 1) 서울 위치: XML(기본 포맷) → itemList JSON, 캐시
const posXml = `<?xml version="1.0" encoding="UTF-8"?><ServiceResult><comMsgHeader/><msgHeader><headerCd>0</headerCd><headerMsg>정상적으로 처리되었습니다.</headerMsg><itemCount>0</itemCount></msgHeader><msgBody>
<itemList><gpsX>127.1040</gpsX><gpsY>37.5110</gpsY><vehId>111</vehId><plainNo>서울74사1234</plainNo><isrunyn>1</isrunyn></itemList>
<itemList><gpsX>127.1010</gpsX><gpsY>37.5050</gpsY><vehId>112</vehId><plainNo>서울74사5678</plainNo><isrunyn>1</isrunyn></itemList></msgBody></ServiceResult>`;
reply = () => new Response(posXml, { headers: { 'Content-Type': 'text/xml' } });
let r = await call('/seoul/positions?busRouteId=100100411');
assert.equal(r.status, 200); assert.equal(r.json.msgBody.itemList.length, 2); assert.equal(r.json.msgBody.itemList[0].gpsX, '127.1040');
assert.equal(upstream.length, 1); assert.ok(upstream[0].startsWith('http://ws.bus.go.kr/api/rest/buspos/getBusPosByRtid?serviceKey='));
assert.ok(upstream[0].includes('busRouteId=100100411') && upstream[0].includes('resultType=json'));
assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*'); // ALLOWED_ORIGINS 미설정 = *
ok('seoul positions XML → JSON itemList, upstream URL/params');
r = await call('/seoul/positions?busRouteId=100100411');
assert.equal(r.status, 200); assert.equal(upstream.length, 1, 'second call must hit cache');
ok('seoul positions cached (1 upstream call for 2 requests)');

// 2) 서울 노선 목록: JSON, keyword → strSrch
upstream = [];
reply = () => new Response(JSON.stringify({ msgHeader: { headerCd: '0', headerMsg: 'ok' }, msgBody: { itemList: { busRouteId: '100100411', busRouteNm: '340' } } }));
r = await call('/seoul/route-list?keyword=340');
assert.equal(r.status, 200); assert.deepEqual(r.json.msgBody.itemList, [{ busRouteId: '100100411', busRouteNm: '340' }]);
assert.ok(upstream[0].includes('/busRouteInfo/getBusRouteList?') && upstream[0].includes('strSrch=340'));
ok('seoul route-list JSON (single item → array), strSrch param');

// 3) 오류: 키 미등록(게이트웨이 XML) → 502, 캐시하지 않음
upstream = []; store.clear();
reply = () => new Response('<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>');
r = await call('/seoul/positions?busRouteId=1');
assert.equal(r.status, 502); assert.equal(r.json.error, 'gateway'); assert.equal(r.json.code, '30');
await call('/seoul/positions?busRouteId=1'); assert.equal(upstream.length, 2, 'errors must not be cached');
ok('gateway error → 502, not cached');
// 서울 headerCd 오류(예: 7 = 요청 한도 초과) → 502
reply = () => new Response('<ServiceResult><msgHeader><headerCd>7</headerCd><headerMsg>LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR</headerMsg></msgHeader><msgBody/></ServiceResult>');
r = await call('/seoul/positions?busRouteId=2'); assert.equal(r.status, 502); assert.equal(r.json.code, '7');
ok('seoul headerCd error → 502');
// 결과 없음(headerCd 4)은 정상(빈 목록)
reply = () => new Response('<ServiceResult><msgHeader><headerCd>4</headerCd><headerMsg>결과가 없습니다.</headerMsg></msgHeader><msgBody/></ServiceResult>');
r = await call('/seoul/positions?busRouteId=3'); assert.equal(r.status, 200); assert.deepEqual(r.json.msgBody.itemList, []);
ok('headerCd 4 (no result) → 200 empty list');
// 네트워크 오류 → 502
globalThis.fetch = async () => { throw new Error('connect ECONNREFUSED'); };
r = await call('/seoul/positions?busRouteId=4'); assert.equal(r.status, 502); assert.equal(r.json.error, 'upstream_unreachable');
globalThis.fetch = async (url) => { upstream.push(String(url)); return reply(String(url)); };
ok('network error → 502');

// 4) 경로 화이트리스트·파라미터 검증
r = await call('/seoul/anything?busRouteId=1'); assert.equal(r.status, 404);
r = await call('/seoul/positions?busRouteId=' + encodeURIComponent('1&serviceKey=x')); assert.equal(r.status, 400);
r = await call('/seoul/positions'); assert.equal(r.status, 400);
ok('unknown path 404, bad/missing param 400');

// 5) 기존 경기 경로는 그대로
upstream = [];
reply = () => new Response(JSON.stringify({ response: { msgHeader: { resultCode: 0 }, msgBody: { busArrivalList: [] } } }));
r = await call('/arrivals?stationId=206000999');
assert.equal(r.status, 200); assert.ok(upstream[0].startsWith('https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2?serviceKey='));
assert.ok(upstream[0].includes('format=json'));
ok('existing Gyeonggi /arrivals unchanged');

// 6) seoulNormalize 단위
assert.deepEqual(seoulNormalize('not json'), { error: 'bad_upstream' });
assert.equal(seoulNormalize('{"msgHeader":{"headerCd":0},"msgBody":{"itemList":null}}').msgHeader.headerCd, '0');
ok('seoulNormalize edge cases');
console.log(`bus-proxy: ${n} passed`);
