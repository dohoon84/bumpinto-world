// [livebus] 강남 버스 도착정보 프록시 (jeongja-phone)
//   GET /bus/arrivals?stop=22010
//     → { ok, src:'live', stop, name, fetchedAt, providers, arrivals:[{ ref, etaSec, msg, vehId, routeId, type, next, second? }] }
//
//   - 인증키는 Worker secret SEOUL_BUS_KEY 만 쓴다 (코드·응답·로그·브라우저에 없음)
//       cd server/phone && npx wrangler secret put SEOUL_BUS_KEY
//   - 서울시 API 는 HTTP 전용(ws.bus.go.kr)이라 브라우저/박스가 아니라 이 Worker 에서만 호출한다
//       getStationByUid (arsId) 정류소별 도착
//   - 경기도 API 는 HTTPS (apis.data.go.kr) — 같은 키. 중앙차로 정류소는 GBIS stationId 로도 조회해 광역(1151·9004 등)을 합친다
//   - 게임에 있는 정류소만 받는다(오픈 프록시 방지). 같은 정류소는 CACHE_SEC(25초) 캐시
//   - 실패(키 없음·한도·점검)면 ok:false → 게임은 시간표 근사로 표시
export const BUS_CACHE_SEC = 25;
const SEOUL_BASE = 'http://ws.bus.go.kr/api/rest';
const GG_BASE = 'https://apis.data.go.kr/6410000';

// 강남역 일대 실제 정류소. ARS·GBIS stationId 는 경기도 정류소 API(2026-11-10)와
// public/corridor/gangnam/transit.json · street.json 의 공식 번호.
//   22009/22010 신분당선강남역(중), 22011/22012 지하철2호선강남역(중), 22014 논현역(중)
//   22408 신논현역.유화빌딩 (9004), 22654 강남역5번출구 (9004 종점)
const STOP_ROWS = [
  { ars: '22009', ggId: '121000009', name: '신분당선강남역(중)' },
  { ars: '22010', ggId: '121000010', name: '신분당선강남역(중)' },
  { ars: '22011', ggId: '121000011', name: '지하철2호선강남역(중)' },
  { ars: '22012', ggId: '121000012', name: '지하철2호선강남역(중)' },
  { ars: '22014', ggId: '121000014', name: '논현역(중)' },
  { ars: '22408', ggId: '121000947', name: '신논현역.유화빌딩' },
  { ars: '22654', ggId: '121000973', name: '강남역5번출구' },
  { ars: '23284', ggId: null, name: '강남역12번출구' },
  { ars: '22167', ggId: null, name: '강남역9번출구' },
  { ars: '22166', ggId: null, name: '진흥아파트' },
  { ars: '23287', ggId: null, name: '강남역1번출구.역삼세무서' },
  { ars: '23572', ggId: null, name: '신분당선.강남역4번출구' },
  { ars: '22114', ggId: null, name: '롯데칠성' },
];
export const BUS_STOPS = Object.freeze(Object.fromEntries(STOP_ROWS.flatMap((s) => {
  const row = Object.freeze({ ...s });
  const out = [[s.ars, row]];
  if (s.ggId) out.push([s.ggId, row]);
  return out;
})));

const list = (v) => (v == null ? [] : [].concat(v));
const str = (v) => (v == null ? '' : String(v).trim());
const num = (v) => { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

export function lookupStop(id) {
  const raw = str(id);
  return BUS_STOPS[raw] || null;
}

// 서울 버스 API 응답 정리 (bus-proxy seoulNormalize 와 같은 규칙)
export function seoulNormalize(text) {
  const t = String(text || '').trimStart();
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
const seoulOk = (o) => !o?.error && (o.msgHeader?.headerCd === '0' || o.msgHeader?.headerCd === '4');

export function parseArrivalMsg(msg) {
  const s = str(msg);
  if (!s) return null;
  if (/운행종료|회차대기|출발대기|정보없음|통신장애/.test(s)) return null;
  if (/곧\s*도착|도착\s*$/.test(s) && !/분/.test(s)) return 0;
  const m = s.match(/(\d+)\s*분/);
  if (m) return Number(m[1]) * 60;
  return null;
}

export function etaFromSeoul(it, n = 1) {
  const sec = num(it[`traTime${n}`]);
  if (sec != null && sec >= 0) return sec;
  return parseArrivalMsg(it[`arrmsg${n}`]);
}

export function etaFromGg(it, n = 1) {
  const sec = num(it[`predictTimeSec${n}`]);
  if (sec != null && sec >= 0) return sec;
  const min = num(it[`predictTime${n}`]);
  return min != null && min >= 0 ? min * 60 : null;
}

export function formatEta(etaSec) {
  if (etaSec == null) return '';
  if (etaSec < 60) return '곧 도착';
  return `${Math.round(etaSec / 60)}분 후`;
}

const SEOUL_TYPE = { 1: 'airport', 2: 'village', 3: 'seat', 4: 'city', 5: 'city', 6: 'express', 7: 'express', 8: 'express' };
const GG_TYPE = { 11: 'express', 12: 'seat', 13: 'city', 14: 'M', 15: 'city', 16: 'express', 17: 'express' };

export function itemsFromSeoul(o) {
  if (!seoulOk(o)) return null;
  return list(o.msgBody?.itemList).map((it) => {
    const ref = str(it.rtNm || it.busRouteAbrv);
    if (!ref) return null;
    const etaSec = etaFromSeoul(it, 1);
    const eta2 = etaFromSeoul(it, 2);
    const type = SEOUL_TYPE[str(it.routeType)] || SEOUL_TYPE[num(it.routeType)] || 'seat';
    return {
      ref, routeId: str(it.busRouteId), type, provider: 'seoul',
      etaSec, msg: formatEta(etaSec) || str(it.arrmsg1).slice(0, 24),
      vehId: str(it.vehId1 || it.plainNo1),
      next: str(it.nxtStn).slice(0, 24),
      second: eta2 == null && !str(it.vehId2) ? null : { etaSec: eta2, msg: formatEta(eta2) || str(it.arrmsg2).slice(0, 24), vehId: str(it.vehId2 || it.plainNo2) },
    };
  }).filter(Boolean);
}

export function itemsFromGg(j) {
  const code = j?.response?.msgHeader?.resultCode;
  if (!(code === 0 || code === '0' || code === 4 || code === '4')) return null;
  return list(j?.response?.msgBody?.busArrivalList).map((it) => {
    const ref = str(it.routeName);
    if (!ref) return null;
    const etaSec = etaFromGg(it, 1);
    const eta2 = etaFromGg(it, 2);
    const type = GG_TYPE[num(it.routeTypeCd)] || GG_TYPE[str(it.routeTypeCd)] || 'express';
    return {
      ref, routeId: str(it.routeId), type, provider: 'gg',
      etaSec, msg: formatEta(etaSec),
      vehId: str(it.vehId1 || it.plateNo1),
      loc: num(it.locationNo1),
      second: eta2 == null && !str(it.vehId2) ? null : { etaSec: eta2, msg: formatEta(eta2), vehId: str(it.vehId2 || it.plateNo2) },
    };
  }).filter(Boolean);
}

export function mergeArrivals(seoulItems, ggItems) {
  const byRef = new Map();
  for (const it of [...(seoulItems || []), ...(ggItems || [])]) {
    const prev = byRef.get(it.ref);
    if (!prev) { byRef.set(it.ref, { ...it }); continue; }
    const pe = prev.etaSec, ne = it.etaSec;
    if (pe == null && ne != null) byRef.set(it.ref, { ...it, alt: prev });
    else if (pe != null && ne != null && ne < pe) byRef.set(it.ref, { ...it, alt: prev });
    else if (!prev.vehId && it.vehId) prev.vehId = it.vehId;
  }
  return [...byRef.values()].sort((a, b) => (a.etaSec ?? 1e9) - (b.etaSec ?? 1e9));
}

function json(data, status, cors, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra } });
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json, text/xml' }, cf: { cacheTtl: 0 } });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function busArrivals(request, env, cors, url, ctx) {
  if (request.method !== 'GET') return json({ ok: false, error: 'not_found' }, 404, cors);
  const raw = str(url.searchParams.get('stop') || url.searchParams.get('arsId'));
  if (!raw || !/^[\w가-힣.\-]{1,20}$/.test(raw)) return json({ ok: false, error: 'unknown_stop' }, 400, cors);
  const stop = lookupStop(raw);
  if (!stop) return json({ ok: false, error: 'unknown_stop' }, 400, cors);
  const key = env?.SEOUL_BUS_KEY;
  if (!key) return json({ ok: false, stop: stop.ars, name: stop.name, reason: 'no_key' }, 200, cors, { 'Cache-Control': 'no-store' });

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(`https://cache.local/bus/arrivals?stop=${encodeURIComponent(stop.ars)}`);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) { const r = new Response(hit.body, hit); for (const [k, v] of Object.entries(cors)) r.headers.set(k, v); r.headers.set('X-Cache', 'HIT'); return r; }
  }

  const providers = [];
  let seoulItems = null, ggItems = null, reason = null;
  try {
    const jobs = [];
    if (stop.ars) {
      jobs.push((async () => {
        try {
          const up = `${SEOUL_BASE}/stationinfo/getStationByUid?serviceKey=${encodeURIComponent(key)}&arsId=${encodeURIComponent(stop.ars)}&resultType=json`;
          const { text } = await fetchText(up);
          const o = seoulNormalize(text);
          if (o.error && o.error !== 'bad_upstream') { reason = reason || 'upstream'; return; }
          const items = itemsFromSeoul(o);
          if (items) { seoulItems = items; providers.push('seoul'); }
        } catch { reason = reason || 'upstream_fetch'; }
      })());
    }
    if (stop.ggId) {
      jobs.push((async () => {
        try {
          const up = `${GG_BASE}/busarrivalservice/v2/getBusArrivalListv2?serviceKey=${encodeURIComponent(key)}&stationId=${encodeURIComponent(stop.ggId)}&format=json`;
          const { text } = await fetchText(up);
          if (text.trimStart().startsWith('<')) {
            const code = text.match(/<returnReasonCode>(\d+)</)?.[1];
            if (code) { reason = reason || 'upstream'; return; }
          }
          let j = null; try { j = JSON.parse(text); } catch { reason = reason || 'bad_upstream'; return; }
          const hdr = j?.OpenAPI_ServiceResponse?.cmmMsgHeader;
          if (hdr) { reason = reason || 'upstream'; return; }
          const items = itemsFromGg(j);
          if (items) { ggItems = items; providers.push('gg'); }
        } catch { reason = reason || 'upstream_fetch'; }
      })());
    }
    await Promise.all(jobs);
  } catch {
    reason = reason || 'upstream_fetch';
  }

  const arrivals = mergeArrivals(seoulItems, ggItems);
  const ok = arrivals.length > 0 || providers.length > 0;
  const body = {
    stop: stop.ars, name: stop.name, src: 'live', fetchedAt: Date.now(),
    ...(ok ? { ok: true, providers, arrivals } : { ok: false, reason: reason || 'no_data', providers }),
  };
  const ttl = ok ? BUS_CACHE_SEC : 10;
  const resp = json(body, 200, cors, { 'Cache-Control': `public, max-age=${ttl}` });
  if (cache) {
    const put = cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` } }));
    if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
  }
  resp.headers.set('X-Cache', 'MISS');
  return resp;
}
