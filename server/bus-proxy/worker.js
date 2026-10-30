// 경기도 버스 API(data.go.kr) 프록시 — Cloudflare Worker 예시 (배포하지 않았음, 직접 배포 필요)
//  - 서비스키는 코드/브라우저에 노출하지 않고 Worker secret(DATA_GO_KR_KEY)로만 보관
//  - 아래 경로만 중계(오픈 프록시 방지) + 짧은 캐시(일일 트래픽 1,000건 절약) + CORS
//  GET /arrivals?stationId=...        -> busarrivalservice/v2/getBusArrivalListv2
//  GET /stations?keyword=...          -> busstationservice/v2/getBusStationListv2   (정류소번호 mobileNo -> stationId)
//  GET /locations?routeId=...         -> buslocationservice/v2/getBusLocationListv2 (정류소 순번, 좌표 없음)
//  GET /route-list?keyword=...        -> busrouteservice/v2/getBusRouteListv2       (노선번호 -> routeId)
//  GET /route-stations?routeId=...    -> busrouteservice/v2/getBusRouteStationListv2 (경유 정류소 순번·번호)
//  [corridor] 수내 → 롯데 코리더(서울 송파 구간)용 추가 경로 — 같은 secret(DATA_GO_KR_KEY), 서울시 버스(ws.bus.go.kr)
//  GET /seoul/route-list?keyword=...  -> busRouteInfo/getBusRouteList   (노선번호 strSrch -> busRouteId)
//  GET /seoul/positions?busRouteId=.. -> buspos/getBusPosByRtid        (차량 GPS 좌표 gpsX/gpsY, WGS84)
//    서울 API 는 XML 이 기본이라 resultType=json 을 요청하고, XML 이 오면 itemList 만 JSON 으로 바꿔 준다.
const BASE = 'https://apis.data.go.kr/6410000';
const SEOUL_BASE = 'http://ws.bus.go.kr/api/rest';
const ROUTES = {
  '/arrivals': { path: '/busarrivalservice/v2/getBusArrivalListv2', param: 'stationId', ttl: 45 },
  '/stations': { path: '/busstationservice/v2/getBusStationListv2', param: 'keyword', ttl: 86400 },
  '/locations': { path: '/buslocationservice/v2/getBusLocationListv2', param: 'routeId', ttl: 120 },
  '/route-list': { path: '/busrouteservice/v2/getBusRouteListv2', param: 'keyword', ttl: 86400 },
  '/route-stations': { path: '/busrouteservice/v2/getBusRouteStationListv2', param: 'routeId', ttl: 86400 },
  // [corridor]
  '/seoul/route-list': { base: SEOUL_BASE, path: '/busRouteInfo/getBusRouteList', param: 'keyword', upParam: 'strSrch', ttl: 86400, seoul: true },
  '/seoul/positions': { base: SEOUL_BASE, path: '/buspos/getBusPosByRtid', param: 'busRouteId', ttl: 30, seoul: true },
};

// [corridor] 서울 버스 API 응답 정리: {msgHeader:{headerCd,headerMsg}, msgBody:{itemList:[...]}}
//   headerCd 0 = 정상, 4 = 결과 없음(정상 취급). 그 밖(인증 실패·한도 초과 등)은 오류.
export function seoulNormalize(text) {
  const t = text.trimStart();
  if (t.startsWith('<')) {
    if (!/<msgHeader>/.test(t)) {
      const code = t.match(/<returnReasonCode>(\d+)</)?.[1], msg = t.match(/<returnAuthMsg>([^<]+)</)?.[1];
      return { error: 'gateway', code, msg };
    }
    const headerCd = t.match(/<headerCd>([^<]*)</)?.[1] ?? '', headerMsg = t.match(/<headerMsg>([^<]*)</)?.[1] ?? '';
    const itemList = [...t.matchAll(/<itemList>([\s\S]*?)<\/itemList>/g)].map((m) => {
      const o = {}; for (const f of m[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g)) o[f[1]] = f[2]; return o;
    });
    return { msgHeader: { headerCd, headerMsg }, msgBody: { itemList } };
  }
  try {
    const j = JSON.parse(t);
    const hdr = j?.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (hdr) return { error: 'gateway', code: hdr.returnReasonCode, msg: hdr.returnAuthMsg || hdr.errMsg };
    const items = j?.msgBody?.itemList;
    return { msgHeader: { headerCd: String(j?.msgHeader?.headerCd ?? ''), headerMsg: j?.msgHeader?.headerMsg ?? '' }, msgBody: { itemList: items == null ? [] : [].concat(items) } };
  } catch {
    return { error: 'bad_upstream' };
  }
}
const seoulOk = (o) => !o.error && (o.msgHeader.headerCd === '0' || o.msgHeader.headerCd === '4');

function allowOrigin(origin, env) {
  if (!origin) return '*';
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.includes('*')) return '*';
  if (allowed.includes(origin)) return origin;
  try {
    const host = new URL(origin).hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return origin;
    if (
      host === 'bumpinto.world' ||
      host.endsWith('.bumpinto.world') ||
      host.endsWith('.pages.dev') ||
      host.endsWith('.workers.dev') ||
      host === 'crazylabs.co.kr' ||
      host.endsWith('.crazylabs.co.kr')
    ) {
      return origin;
    }
  } catch {}
  return allowed[0] || '*';
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin(origin, env),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const r = ROUTES[url.pathname];
    if (!r || req.method !== 'GET') return new Response('not found', { status: 404, headers: cors });
    const v = url.searchParams.get(r.param);
    if (!v || !/^[\w가-힣.\- ]{1,40}$/.test(v)) return new Response(`bad ${r.param}`, { status: 400, headers: cors });

    // 캐시 키에는 서비스키를 넣지 않음
    const cacheKey = new Request(`https://cache.local${url.pathname}?${r.param}=${encodeURIComponent(v)}`);
    const cache = caches.default;
    let res = await cache.match(cacheKey);
    if (!res) {
      // data.go.kr 의 "일반 인증키(Decoding)" 값을 secret 으로 넣으면 여기서 한 번만 인코딩됨
      const up = r.seoul
        ? `${r.base}${r.path}?serviceKey=${encodeURIComponent(env.DATA_GO_KR_KEY)}&${r.upParam || r.param}=${encodeURIComponent(v)}&resultType=json` // [corridor]
        : `${BASE}${r.path}?serviceKey=${encodeURIComponent(env.DATA_GO_KR_KEY)}&${r.param}=${encodeURIComponent(v)}&format=json`;
      let upstream;
      try {
        upstream = await fetch(up, { cf: { cacheTtl: 0 } });
      } catch (e) {
        return json({ error: 'upstream_unreachable', detail: String(e) }, 502, cors);
      }
      const text = await upstream.text();
      if (r.seoul) { // [corridor] 서울: 정상일 때만 캐시, 오류는 502 (클라이언트는 조용히 시뮬로 폴백)
        const o = seoulNormalize(text);
        if (!seoulOk(o)) return json(o.error ? o : { error: 'gateway', code: o.msgHeader.headerCd, msg: o.msgHeader.headerMsg }, 502, cors);
        res = new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${r.ttl}` } });
        if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
        const out = new Response(res.body, res);
        for (const [k, val] of Object.entries(cors)) out.headers.set(k, val);
        return out;
      }
      // 키 오류/한도 초과는 XML 또는 JSON(OpenAPI_ServiceResponse)으로 올 수 있음: returnReasonCode 20/22/23/29 등
      if (text.trimStart().startsWith('<')) {
        const code = text.match(/<returnReasonCode>(\d+)</)?.[1], msg = text.match(/<returnAuthMsg>([^<]+)</)?.[1];
        return json({ error: 'gateway', code, msg }, 502, cors);
      }
      if (text.includes('OpenAPI_ServiceResponse')) {
        try {
          const parsed = JSON.parse(text);
          const hdr = parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader;
          if (hdr) {
            return json({ error: 'gateway', code: hdr.returnReasonCode, msg: hdr.returnAuthMsg || hdr.errMsg }, 502, cors);
          }
        } catch {}
      }
      res = new Response(text, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${r.ttl}` } });
      if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    const out = new Response(res.body, res);
    for (const [k, val] of Object.entries(cors)) out.headers.set(k, val);
    return out;
  },
};
const json = (o, status, headers) => new Response(JSON.stringify(o), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
