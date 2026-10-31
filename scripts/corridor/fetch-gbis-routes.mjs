// [bus-net] 코리더 버스 노선(경기버스정보 GBIS 정류소 순서) 스냅샷: data/gbis_route_stations.json
//   운영 중인 정자 버스 프록시(Cloudflare Worker)의 /route-list·/route-stations 를 그대로 쓴다(키는 프록시 안에만 있음).
//   노선 형상은 이 정류소 순서를 코리더·정자 차도 그래프 위로 이어 만든다(scripts/corridor/build-transit.mjs).
//   사용: node scripts/corridor/fetch-gbis-routes.mjs [--proxy=https://jeongja-bus-proxy.xn0texn073.workers.dev]
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PROXY = arg('proxy', 'https://jeongja-bus-proxy.xn0texn073.workers.dev');
const OUT = path.resolve(ROOT, arg('out', 'data/gbis_route_stations.json'));
// 노선 번호 + 운행 지역(같은 번호가 여러 시에 있어 관할로 고른다)
export const WANT = [
  { ref: '220', admin: '경기도 성남시' },
  { ref: '9407', admin: '경기도 성남시' },
  { ref: '7007-1', admin: '경기도 용인시' },
  { ref: '380', admin: '경기도 성남시' },
];
const list = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const get = async (u) => { const r = await fetch(PROXY + u); if (!r.ok) throw new Error(`${u} → ${r.status}`); return r.json(); };
const out = { source: `GBIS 버스노선 정류소 목록 (busrouteservice/v2 getBusRouteStationListv2) via ${PROXY}`, fetched: new Date().toISOString(), routes: [] };
for (const w of WANT) {
  const rl = list((await get(`/route-list?keyword=${encodeURIComponent(w.ref)}`)).response?.msgBody?.busRouteList);
  const r = rl.find((x) => String(x.routeName) === w.ref && x.adminName === w.admin);
  if (!r) { console.warn('노선 없음', w.ref); continue; }
  const st = list((await get(`/route-stations?routeId=${r.routeId}`)).response?.msgBody?.busRouteStationList);
  out.routes.push({
    ref: w.ref, routeId: r.routeId, routeTypeName: r.routeTypeName, adminName: r.adminName, start: r.startStationName, end: r.endStationName,
    turnSeq: st[0]?.turnSeq ?? null,
    stations: st.map((s) => ({ seq: s.stationSeq, id: s.stationId, name: s.stationName, no: String(s.mobileNo ?? '').trim() || null, lon: s.x, lat: s.y })),
  });
  console.log(w.ref, r.routeId, st.length, '정류소');
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('→', path.relative(ROOT, OUT), (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
