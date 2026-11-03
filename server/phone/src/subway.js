// [subway] 서울 열린데이터광장 지하철 실시간 도착정보 프록시
//   GET /subway/arrival?station=이매   →  { ok, station, src: 'live', fetchedAt, trains: [...] }
//
//   - 인증키는 Worker secret SEOUL_SUBWAY_KEY 로만 (코드·응답·로그·브라우저 번들에 없음)
//       npx wrangler secret put SEOUL_SUBWAY_KEY     (server/phone 에서)
//   - 오픈 프록시가 아니다: 게임에 출입구가 있는 역 이름(ALLOWED)만 받는다
//   - 같은 역은 CACHE_SEC(25초) 동안 Cloudflare 캐시에서 → 접속자가 많아도 API 호출은 역당 25초에 1번 이하
//   - API 가 실패하거나(키 없음·한도 초과·점검) 이 역 도착 정보가 없으면 ok:false + reason → 게임은 시간표 근사로 표시
//   upstream: http://swopenapi.seoul.go.kr/api/subway/{KEY}/json/realtimeStationArrival/0/{N}/{역명}
//     응답 errorMessage.code 'INFO-000' = 정상, 'INFO-200' = 해당 데이터 없음, 'ERROR-*' = 키·요청 오류
export const SUBWAY_CACHE_SEC = 25;
export const ALLOWED = Object.freeze(['정자', '수내', '서현', '이매', '야탑', '모란', '태평', '가천대', '복정', '문정', '가락시장', '송파', '석촌', '잠실']);
const UPSTREAM = 'http://swopenapi.seoul.go.kr/api/subway';
const ROWS = 20;
// subwayId → 게임 노선 키 (src/subway/lines.js SUBWAY_ID 와 같아야 함 — scripts/test-subway-arrivals.mjs 가 확인)
export const SUBWAY_ID = Object.freeze({ 1002: 'l2', 1003: 'l3', 1008: 'l8', 1009: 'l9', 1075: 'suin', 1077: 'shin', 1081: 'gg' });

const str = (v) => (v == null ? '' : String(v));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// 서울 API JSON → 게임용 (필요한 필드만, 문자열 길이 제한)
export function normalizeArrival(j) {
  const em = j?.errorMessage || (j?.status ? j : null) || {};
  const code = str(em.code);
  if (code && code !== 'INFO-000') return { ok: false, reason: code === 'INFO-200' ? 'no_data' : 'upstream', code };
  const list = Array.isArray(j?.realtimeArrivalList) ? j.realtimeArrivalList : [];
  if (!list.length) return { ok: false, reason: 'no_data', code: code || 'EMPTY' };
  const trains = list.map((r) => ({
    line: SUBWAY_ID[str(r.subwayId)] || null,
    subwayId: str(r.subwayId).slice(0, 8),
    updn: str(r.updnLine).slice(0, 8),              // 상행 / 하행 (2호선: 내선 / 외선)
    dest: str(r.bstatnNm).slice(0, 24),              // 종착역
    way: str(r.trainLineNm).slice(0, 48),            // '왕십리행 - 야탑방면'
    msg: str(r.arvlMsg2).slice(0, 40),               // '이매 도착' · '[4]번째 전역 (미금)' · '전역 도착'
    at: str(r.arvlMsg3).slice(0, 24),                // 지금 열차가 있는 역
    etaSec: num(r.barvlDt),                          // 도착까지 초 (0 = 정보 없음/도착)
    code: num(r.arvlCd),                             // 0 진입 1 도착 2 출발 3 전역출발 4 전역진입 5 전역도착 99 운행중
    trainNo: str(r.btrainNo).slice(0, 8),
    kind: str(r.btrainSttus).slice(0, 8),            // 일반 / 급행 / ITX
    last: str(r.lstcarAt) === '1',                   // 막차
    recptnDt: str(r.recptnDt).slice(0, 19),          // 정보 생성 시각 (KST)
  })).filter((t) => t.line);
  if (!trains.length) return { ok: false, reason: 'no_data', code: 'NO_KNOWN_LINE' };
  return { ok: true, trains };
}

export async function subwayArrival(request, env, cors, url, ctx) {
  const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra } });
  if (request.method !== 'GET') return json({ ok: false, error: 'not_found' }, 404);
  const station = (url.searchParams.get('station') || '').trim().replace(/역$/, '');
  if (!ALLOWED.includes(station)) return json({ ok: false, error: 'unknown_station' }, 400);
  if (!env.SEOUL_SUBWAY_KEY) return json({ ok: false, station, reason: 'no_key' }, 200, { 'Cache-Control': 'no-store' });

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(`https://cache.local/subway/arrival?station=${encodeURIComponent(station)}`);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) { const r = new Response(hit.body, hit); for (const [k, v] of Object.entries(cors)) r.headers.set(k, v); r.headers.set('X-Cache', 'HIT'); return r; }
  }
  let out;
  try {
    const up = `${UPSTREAM}/${encodeURIComponent(env.SEOUL_SUBWAY_KEY)}/json/realtimeStationArrival/0/${ROWS}/${encodeURIComponent(station)}`;
    const res = await fetch(up, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 0 } });
    if (!res.ok) out = { ok: false, reason: 'upstream_http', status: res.status };
    else {
      let j = null; try { j = await res.json(); } catch { /* 아래 */ }
      out = j ? normalizeArrival(j) : { ok: false, reason: 'bad_upstream' };
    }
  } catch {
    out = { ok: false, reason: 'upstream_fetch' }; // 오류 메시지에 URL(=키)이 섞일 수 있어 그대로 내보내지 않는다
  }
  const body = { station, src: 'live', fetchedAt: Date.now(), ...out };
  // 실패도 짧게(10초) 캐시해서 장애 때 API 를 두드리지 않게
  const ttl = out.ok ? SUBWAY_CACHE_SEC : 10;
  const resp = json(body, 200, { 'Cache-Control': `public, max-age=${ttl}` });
  if (cache) {
    const put = cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` } }));
    if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
  }
  resp.headers.set('X-Cache', 'MISS');
  return resp;
}
