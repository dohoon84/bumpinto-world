// [corridor] 코리더 버스 실시간 어댑터 (수내 → 롯데). 키는 프록시(Worker secret DATA_GO_KR_KEY)에만 있다.
//
//   - 플레이어 근처(FOCUS_R) 노선만, 한 번에 최대 MAX_ROUTES 개, POLL_MS 주기로 조회 → 일일 호출 한도 보호
//   - 노선 지역은 regionOf (OSM network → GBIS → 번호 체계). 경기 노선은 기본 끔(gg 옵션, ?cbusgg=1)
//   - 서울 노선: /seoul/route-list → busRouteId, /seoul/positions → 차량 GPS(gpsX/gpsY)
//     경기 노선: /route-list → routeId, /route-stations(정류소 좌표) + /locations(정류소 순번)
//     → 차량이 있는 정류소 좌표
//   - 좌표를 같은 노선의 코리더 경로(OSM 형상)에 투영(MATCH_D 이내)해서 그 위에 놓고, 다음 조회까지 천천히 전진(추정)
//   - 실패(프록시 없음/404/한도 초과/키 오류/네트워크)면 그 노선은 BACKOFF_MS 동안 조회하지 않고 시뮬레이션을 그대로 쓴다.
//     화면에 오류를 띄우지 않는다(조용한 폴백).
import { samplePath, projectOnPath } from '../transit/busSource.js';

export const POLL_MS = 60000, BACKOFF_MS = 600000, MAX_ROUTES = 3, FOCUS_R = 1200, MATCH_D = 60, DRIFT_V = 5, DRIFT_MAX = 250;
const CENTER = { lat: 37.36650, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
export const lonLatToXZ = (lon, lat) => [(lon - CENTER.lon) * kx, -(lat - CENTER.lat) * kz];

const list = (v) => (v == null ? [] : [].concat(v));
const gbisEnds = (g) => { const p = g?.split(' · ')[2]; return p && p.includes('↔') ? p.split('↔').map((s) => s.trim()) : null; };

// 노선의 운영 지역: 서울(ws.bus.go.kr GPS) / 경기(GBIS 정류소 순번). OSM network 태그 → GBIS 인허가 목록 → 번호 체계 순.
//   서울 번호 체계: 간선 3자리, 지선 4자리(1~7xxx), 광역 94xx, 심야 N, 마을(강남05 등)
const SEOUL_REF = /^(N\d{1,3}|\d{3}|[1-7]\d{3}|94\d\d|(강남|송파|서초|강동)\d{2})$/;
export function regionOf(r) {
  const net = r.network || '';
  if (/서울/.test(net)) return 'seoul';
  if (/경기|성남|용인/.test(net) || r.src === 'gbis') return 'gg';
  return SEOUL_REF.test(String(r.ref)) ? 'seoul' : 'gg';
}

export class CorridorRealtimeSource {
  // gg: 경기 노선(gbis)도 조회할지. 기본 false — 경기 API 는 정자 라이브(도착정보)와 같은 키·일일 한도를 쓰므로
  //     운영 계정 트래픽을 확보한 뒤 ?cbusgg=1 로 켠다. 서울 노선은 별도 서비스(서울특별시_버스위치정보조회)라 기본 조회.
  constructor(transit, { proxy, fallback, gg = false, fetchImpl = (...a) => fetch(...a), now = () => performance.now() } = {}) {
    this.proxy = (proxy || '').replace(/\/$/, '');
    this.fallback = fallback;
    this.fetch = fetchImpl; this.now = now;
    // 같은 번호의 OSM 노선(상·하행 relation 등)은 하나의 실시간 노선으로 묶는다: key = 지역|번호
    const keyOf = (r) => regionOf(r) + '|' + r.ref;
    const routes = transit.routes.filter((r) => !r.generic && (gg || regionOf(r) === 'seoul'));
    this.keyByRoute = new Map(routes.map((r) => [r.id, keyOf(r)]));
    this.routes = [...new Map(routes.map((r) => [keyOf(r), { ...r, id: keyOf(r) }])).values()];
    this.paths = fallback.paths; // prepPath 된 경로 (cum/L 포함)
    this.pathsByRoute = new Map(); // key -> paths
    for (const P of this.paths) { const k = this.keyByRoute.get(P.route); if (!k) continue; if (!this.pathsByRoute.has(k)) this.pathsByRoute.set(k, []); this.pathsByRoute.get(k).push(P); }
    this.state = new Map(); // key -> { kind, upId, stations, next, vehicles: Map, ok }
    this.inflight = false;
    this.focus = null;
    this.stats = { polls: 0, ok: 0, fail: 0, live: 0 };
  }
  get label() { return this.stats.live ? '실시간(공공데이터) + 시뮬레이션' : this.fallback.label; }
  get liveRoutes() { return [...this.state.values()].filter((s) => s.ok).length; }

  _get(path, q) {
    const url = `${this.proxy}${path}?${new URLSearchParams(q)}`;
    return Promise.resolve(this.fetch(url)).then((r) => {
      if (!r || !r.ok) throw new Error('http ' + (r && r.status));
      return r.json();
    });
  }
  _near(x, z) {
    const out = [];
    for (const r of this.routes) {
      const ps = this.pathsByRoute.get(r.id); if (!ps) continue;
      let best = Infinity;
      for (const P of ps) best = Math.min(best, projectOnPath(P, x, z).d);
      if (best < FOCUS_R) out.push({ r, d: best });
    }
    return out.sort((a, b) => a.d - b.d).map((o) => o.r);
  }
  update(dt, ctx, focus) {
    this.fallback.update(dt, ctx, focus);
    if (focus) this.focus = focus;
    // 추정 전진
    for (const st of this.state.values()) for (const v of st.vehicles?.values() || []) {
      if (v.drift < DRIFT_MAX && v.s < v.P.L - 2) { const d = DRIFT_V * dt; v.s += d; v.drift += d; }
    }
    if (!this.proxy || this.inflight || !this.focus) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const t = this.now();
    const due = this._near(this.focus.x, this.focus.z).filter((r) => (this.state.get(r.id)?.next ?? 0) <= t).slice(0, MAX_ROUTES);
    if (!due.length) return;
    this.inflight = true;
    Promise.all(due.map((r) => this._poll(r).then(
      () => { this.stats.ok++; },
      () => { const s = this._st(r); s.ok = false; s.vehicles = new Map(); s.next = this.now() + BACKOFF_MS; this.stats.fail++; },
    ))).finally(() => { this.inflight = false; this._count(); });
  }
  _st(r) { if (!this.state.has(r.id)) this.state.set(r.id, { vehicles: new Map(), next: 0, ok: false }); return this.state.get(r.id); }
  _count() { let n = 0; for (const s of this.state.values()) if (s.ok) n += s.vehicles.size; this.stats.live = n; }

  async _poll(r) {
    const s = this._st(r); this.stats.polls++;
    s.next = this.now() + POLL_MS;
    s.kind ||= regionOf(r);
    const pts = []; // { x, z, id, nx?, nz? }
    if (s.kind === 'seoul') {
      if (!s.upId) {
        const j = await this._get('/seoul/route-list', { keyword: r.ref });
        const hit = list(j?.msgBody?.itemList).filter((it) => String(it.busRouteNm).trim() === r.ref);
        if (hit.length !== 1) throw new Error('route match');
        s.upId = String(hit[0].busRouteId);
      }
      const j = await this._get('/seoul/positions', { busRouteId: s.upId });
      for (const it of list(j?.msgBody?.itemList)) {
        if (it.isrunyn === '0') continue;
        const lon = parseFloat(it.gpsX), lat = parseFloat(it.gpsY);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const [x, z] = lonLatToXZ(lon, lat);
        pts.push({ id: 'S' + (it.vehId || it.plainNo), x, z, plate: it.plainNo || '' });
      }
    } else {
      if (!s.upId) {
        const j = await this._get('/route-list', { keyword: r.ref });
        const code = j?.response?.msgHeader?.resultCode;
        if (!(code === 0 || code === '0' || code === 4 || code === '4')) throw new Error('gg code');
        let hit = list(j?.response?.msgBody?.busRouteList).filter((it) => String(it.routeName).trim() === r.ref);
        const ends = gbisEnds(r.gbis);
        if (hit.length > 1 && ends) hit = hit.filter((it) => { const a = String(it.startStationName || '').trim(), b = String(it.endStationName || '').trim(); return (a === ends[0] && b === ends[1]) || (a === ends[1] && b === ends[0]); });
        if (hit.length !== 1) throw new Error('route match');
        s.upId = String(hit[0].routeId);
        const js = await this._get('/route-stations', { routeId: s.upId });
        s.stations = new Map(list(js?.response?.msgBody?.busRouteStationList).map((st) => [String(st.stationSeq), st]));
      }
      const j = await this._get('/locations', { routeId: s.upId });
      const code = j?.response?.msgHeader?.resultCode;
      if (!(code === 0 || code === '0' || code === 4 || code === '4')) throw new Error('gg code');
      for (const it of list(j?.response?.msgBody?.busLocationList)) {
        const st = s.stations.get(String(it.stationSeq)), nx = s.stations.get(String(Number(it.stationSeq) + 1));
        const lon = parseFloat(st?.x), lat = parseFloat(st?.y);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const [x, z] = lonLatToXZ(lon, lat);
        const n = nx && Number.isFinite(parseFloat(nx.x)) ? lonLatToXZ(parseFloat(nx.x), parseFloat(nx.y)) : null;
        pts.push({ id: 'G' + (it.vehId || it.plateNo), x, z, next: n, plate: it.plateNo || '' });
      }
    }
    // 경로 투영
    const paths = this.pathsByRoute.get(r.id) || [];
    const prev = s.vehicles, vehicles = new Map();
    for (const p of pts) {
      let best = null;
      for (const P of paths) {
        const q = projectOnPath(P, p.x, p.z); if (q.d > MATCH_D) continue;
        let score = q.d;
        const old = prev.get(p.id);
        if (old && old.P === P) score -= 40; // 같은 방향 경로 유지
        if (p.next) { const qn = projectOnPath(P, p.next[0], p.next[1]); if (qn.d < MATCH_D * 2 && qn.s < q.s) score += 100; } // 다음 정류소가 뒤쪽이면 반대 방향
        if (!best || score < best.score) best = { P, s: q.s, score };
      }
      if (best) vehicles.set(p.id, { id: p.id, P: best.P, s: best.s, drift: 0, plate: p.plate });
    }
    s.vehicles = vehicles; s.ok = true;
  }

  vehicles() {
    const liveIds = new Set(); const out = [];
    for (const [rid, st] of this.state) if (st.ok) {
      liveIds.add(rid);
      for (const v of st.vehicles.values()) {
        const p = samplePath(v.P, v.s);
        out.push({ id: 'L' + v.id, ref: v.P.ref, type: v.P.type, name: v.P.name, x: p.x, z: p.z, heading: Math.atan2(p.dx, p.dz), scale: 1, state: 'run', v: DRIFT_V, live: true });
      }
    }
    // 실시간이 정상인 노선은 시뮬 버스를 숨김(중복 방지). 나머지 노선은 시뮬 그대로.
    const bs = this.fallback.buses, sim = this.fallback.vehicles(); // vehicles() 는 buses 와 같은 순서
    for (let i = 0; i < sim.length; i++) if (!liveIds.has(this.keyByRoute.get(bs[i]?.P.route))) out.push(sim[i]);
    return out;
  }
  arrivals(stop) { return this.fallback.arrivals(stop); }
}
