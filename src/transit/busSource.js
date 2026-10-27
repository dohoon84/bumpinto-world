// 버스 위치/도착 정보 소스 (교체 가능)
//   SimulatedBusSource : OSM 노선 형상 위 시뮬레이션. ?bus=sim 이거나 실시간 조회 실패 시 사용
//   RealtimeBusSource  : 프록시 경유 실시간 위치. 실패하면 SimulatedBusSource 로 폴백
//
// 공통 인터페이스
//   update(dt, ctx)            매 프레임 호출 (ctx.pedLightAt(crossing) 등)
//   vehicles()                 -> [{ id, ref, type, name, x, z, heading, scale, state }]
//   arrivals(stop)             -> [{ ref, type, etaSec|null, text, kind: 'sim'|'virtual'|'live' }]
//   label                      UI 표시용 이름
import { liveryOf } from './livery.js';
import { busLength } from './busModel.js';

export const TIME_COMPRESS = 8; // 실제 배차간격을 1/8로 압축(화면에 버스가 자주 보이도록)
const LIVE_POLL_MS = 15000; // Worker /locations 캐시와 같음. 매 프레임 조회 금지.
const HEADWAY_MIN = { M: 12, express: 12, premium: 15, seat: 12, city: 12, village: 10, intercity: 20, airport: 30 };
const VMAX = { M: 15, intercity: 18, express: 12, premium: 12, seat: 11, city: 11, village: 9.5, airport: 14 };
const ACC = 1.3, DEC = 1.8, DWELL = 9, LANE_OFF = 1.7;
const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

function prepPath(p, bounds) {
  const cum = [0];
  for (let i = 1; i < p.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]));
  p.cum = cum; p.L = cum[cum.length - 1];
  const onEdge = ([x, z]) => Math.min(Math.abs(x - bounds.x0), Math.abs(x - bounds.x1), Math.abs(z - bounds.z0), Math.abs(z - bounds.z1)) < 4;
  p.fadeIn = !onEdge(p.pts[0]); p.fadeOut = !onEdge(p.pts[p.pts.length - 1]);
  return p;
}
export function samplePath(p, s, out = {}) {
  const { pts, cum } = p; s = Math.max(0, Math.min(p.L, s));
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const L = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / L;
  const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = (bx - ax) / L, dz = (bz - az) / L;
  out.x = ax + (bx - ax) * t - dz * LANE_OFF; out.z = az + (bz - az) * t + dx * LANE_OFF; out.dx = dx; out.dz = dz;
  return out;
}
// 점을 경로에 투영 -> {s, d}
export function projectOnPath(p, x, z) {
  let best = { d: Infinity, s: 0 };
  for (let i = 1; i < p.pts.length; i++) {
    const [ax, az] = p.pts[i - 1], [bx, bz] = p.pts[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best.d) best = { d, s: p.cum[i - 1] + t * Math.sqrt(L2) };
  }
  return best;
}

export class SimulatedBusSource {
  constructor(transit, bounds, { seed = 1 } = {}) {
    this.label = `시뮬레이션 (배차 1/${TIME_COMPRESS} 압축)`;
    this.t = 0; this.buses = []; this.nextId = 1;
    this.routes = new Map(transit.routes.map((r) => [r.id, r]));
    this.refTypes = transit.refTypes;
    this.paths = transit.paths.map((p) => {
      const r = this.routes.get(p.route), type = r.type;
      const P = prepPath({ ...p, type, name: r.gbis?.split(' · ')[2]?.split('↔')[1] || r.name }, bounds);
      P.headway = (HEADWAY_MIN[type] || 12) * 60 / TIME_COMPRESS * (0.85 + hash(p.ref + p.id) * 0.3);
      P.vmax = VMAX[type] || 11;
      P.nextSpawn = 0; P.blen = busLength(type);
      // 이 경로가 지나는 신호 횡단보도 (차도 폭 안쪽으로 지나는 것만)
      P.xings = transit.crossings.filter((c) => c.sig).map((c) => ({ c, ...projectOnPath(P, c.x, c.z) })).filter((q) => q.d < c_hw(q.c) && q.s > 5 && q.s < P.L - 2).sort((a, b) => a.s - b.s);
      return P;
    });
    function c_hw(c) { return c.w / 2 + 3; }
    // 시작 시점에 이미 노선 위에 버스가 깔려 있도록 미리 배치
    for (const P of this.paths) {
      const gap = P.headway * P.vmax * 0.75;
      let k = 0;
      for (let s = P.L - 30 - hash(P.ref + 'o') * gap; s > 10 && k < 3; s -= gap, k++) this._spawn(P, s);
      P.nextSpawn = hash(P.ref + 'n' + P.id) * P.headway;
    }
  }
  _spawn(P, s = 0) {
    const bus = { id: this.nextId++, P, s, v: s > 0 ? P.vmax * 0.7 : P.vmax * 0.6, dwell: 0, stopIdx: P.stops.findIndex((st) => st.s > s + 1), state: 'run', age: s > 0 ? 9 : 0, out: 0 };
    if (bus.stopIdx < 0) bus.stopIdx = P.stops.length;
    this.buses.push(bus); return bus;
  }
  update(dt, ctx) {
    this.t += dt;
    for (const P of this.paths) {
      P.nextSpawn -= dt;
      if (P.nextSpawn <= 0) {
        const tooClose = this.buses.some((b) => b.P === P && b.s < P.blen + 12);
        if (!tooClose) { this._spawn(P, 0); P.nextSpawn = P.headway; } else P.nextSpawn = 2;
      }
    }
    for (const b of this.buses) {
      const P = b.P; b.age += dt;
      if (b.dwell > 0) { b.dwell -= dt; b.v = 0; b.state = 'dwell'; if (b.dwell <= 0) b.stopIdx++; continue; }
      const front = b.s + P.blen / 2;
      let limit = P.L + 50, reason = 'run';
      // 1) 다음 정류장
      const st = P.stops[b.stopIdx];
      if (st && st.s - b.s < limit) { limit = st.s - b.s; reason = 'stop'; }
      // 2) 보행 신호가 초록/깜빡이면 횡단보도 앞 정지선에서 대기
      for (const q of P.xings) {
        const gapToLine = q.s - 4 - front;
        if (gapToLine < -1.5) continue; // 이미 진입
        if (gapToLine > 45) break;
        if (ctx.pedLight(q.c) !== 'red') { if (gapToLine < limit) { limit = Math.max(0, gapToLine); reason = 'xing'; } }
        break;
      }
      // 3) 앞 버스와 간격
      for (const o of this.buses) if (o !== b && o.P === P && o.s > b.s) { const g = o.s - P.blen - 6 - b.s; if (g < limit) { limit = Math.max(0, g); reason = 'follow'; } }
      const vAllow = Math.sqrt(Math.max(0, 2 * DEC * limit));
      const target = Math.min(P.vmax, vAllow);
      b.v = b.v < target ? Math.min(target, b.v + ACC * dt) : Math.max(target, b.v - DEC * 2 * dt);
      b.s += b.v * dt;
      b.state = b.v < 0.2 ? (reason === 'xing' ? 'xing' : reason === 'follow' ? 'queue' : 'run') : 'run';
      if (reason === 'stop' && limit < 0.6 && b.v < 0.6) { b.dwell = DWELL * (0.8 + hash(b.id + 'd') * 0.5); b.v = 0; b.state = 'dwell'; }
      if (b.s >= P.L) b.done = true;
    }
    this.buses = this.buses.filter((b) => !b.done);
  }
  vehicles() {
    const out = [];
    for (const b of this.buses) {
      const p = samplePath(b.P, b.s);
      let scale = 1;
      if (b.P.fadeIn && b.s < 15 && b.age < 3) scale = Math.min(1, b.age / 1.2);
      if (b.P.fadeOut && b.P.L - b.s < 12) scale = Math.max(0.01, (b.P.L - b.s) / 12);
      out.push({ id: b.id, ref: b.P.ref, type: b.P.type, name: b.P.name, x: p.x, z: p.z, heading: Math.atan2(p.dx, p.dz), scale, state: b.state, v: b.v });
    }
    return out;
  }
  // 정류장 패널용 도착 예정
  arrivals(stop) {
    const res = new Map();
    for (const P of this.paths) {
      const st = P.stops.find((x) => x.stop === stop.id); if (!st) continue;
      const vAvg = P.vmax * 0.7;
      let best = Infinity, state = '';
      for (const b of this.buses) {
        if (b.P !== P || b.s > st.s + 2) continue;
        const rem = Math.max(0, st.s - b.s), between = P.stops.filter((x) => x.s > b.s + 1 && x.s < st.s - 1).length;
        let eta = rem / vAvg + between * DWELL + (b.dwell > 0 && Math.abs(b.s - st.s) < 3 ? 0 : 0);
        if (b.state === 'dwell' && Math.abs(st.s - b.s) < 3) { eta = 0; state = '정차 중'; }
        if (eta < best) { best = eta; if (eta > 0) state = ''; }
      }
      const spawnEta = P.nextSpawn + st.s / vAvg + P.stops.filter((x) => x.s < st.s - 1).length * DWELL;
      if (spawnEta < best) best = spawnEta;
      const prev = res.get(P.ref);
      if (!prev || best < prev.etaSec) res.set(P.ref, { ref: P.ref, type: P.type, etaSec: best, kind: 'sim', state });
    }
    // 형상이 없는 노선(정류장 route_ref 에만 있음): 가상 배차로 표시
    for (const ref of stop.routes) {
      if (res.has(ref)) continue;
      const type = this.refTypes[ref]?.type || 'city';
      const H = (HEADWAY_MIN[type] || 12) * 60 / TIME_COMPRESS * (0.8 + hash(ref) * 0.5);
      const eta = H - ((this.t + hash(ref + stop.id) * H) % H);
      res.set(ref, { ref, type, etaSec: eta, kind: 'virtual' });
    }
    return [...res.values()].sort((a, b) => a.etaSec - b.etaSec);
  }
}

// ---- 실시간 소스 ----
// 기본(로컬)은 main.js 가 http://127.0.0.1:8788 프록시를 넘긴다. ?bus=sim 이면 이 클래스를 쓰지 않는다.
// 키는 프록시(Worker secret)에만 있다. 여기서는 키를 다루지 않음.
// 위치: getBusLocationListv2 의 stationSeq 를, getBusRouteStationListv2 의 mobileNo 로
//   transit.json 정류장 ref(정류소번호)에 맞춰 기존 노선 폴리라인 위에 놓는다.
//   기점·종점은 노선 gbis 의 "출발↔도착" 과 route list 의 startStationName/endStationName 이 같을 때만 고른다.
//   맞는 정류장이 없는 차량은 그리지 않는다. 조회가 실패하면 fallback(시뮬) 위치를 쓴다.
// stateCd 는 응답에 있으나 문서에 값의 의미가 없어 위치 계산에 쓰지 않는다.
import { ROUTE_TYPE_CD } from './livery.js';

function msgCode(j) { return j?.response?.msgHeader?.resultCode; }
function codeOk(c) { return c === 0 || c === '0' || c === 4 || c === '4'; }
function gbisEnds(gbis) {
  const part = gbis?.split(' · ')[2];
  if (!part || !part.includes('↔')) return null;
  const [a, b] = part.split('↔').map((s) => s.trim());
  return a && b ? [a, b] : null;
}
function pickRoute(list, ref, gbis) {
  const exact = [].concat(list).filter((r) => String(r.routeName).trim() === ref);
  const ends = gbisEnds(gbis);
  if (ends) {
    const hit = exact.filter((r) => {
      const s = String(r.startStationName || '').trim(), e = String(r.endStationName || '').trim();
      return (s === ends[0] && e === ends[1]) || (s === ends[1] && e === ends[0]);
    });
    return hit.length === 1 ? hit[0] : null;
  }
  return exact.length === 1 ? exact[0] : null;
}
function mobileOf(stop) {
  const m = String(stop?.ref || '').split(';')[0].trim();
  return m || '';
}
function matchStops(ordered, stations, claimed) {
  const out = [];
  let from = 0;
  for (const st of ordered) {
    let found = -1;
    for (let k = from; k < stations.length; k++) {
      if (claimed.has(k)) continue;
      if (stations[k].mobile === st.mobile) { found = k; break; }
    }
    if (found < 0) continue;
    from = found + 1;
    out.push({ index: found, seq: stations[found].seq, s: st.s });
  }
  return out;
}
function alignPath(stops, stations, claimed) {
  if (!stops.length) return [];
  const fwd = matchStops(stops, stations, claimed);
  const rev = matchStops([...stops].reverse(), stations, claimed);
  const span = (ms) => (ms.length < 2 ? 0 : Math.max(...ms.map((m) => m.seq)) - Math.min(...ms.map((m) => m.seq)));
  if (rev.length > fwd.length) return rev;
  if (rev.length === fwd.length && rev.length > 1 && span(rev) < span(fwd)) return rev;
  return fwd;
}
async function proxyJson(url) {
  const r = await fetch(url);
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (!r.ok || !j || j.error) throw new Error(j?.msg || j?.error || `proxy ${r.status}`);
  return j;
}

export class RealtimeBusSource {
  constructor(transit, bounds, { proxy, stationIds = {}, fallback } = {}) {
    this._liveLabel = '실시간(경기도 버스 API)';
    this.proxy = proxy?.replace(/\/$/, '');
    this.stationIds = stationIds; // { '07624': '206000xxx', ... }
    this.cache = new Map();
    this.fallback = fallback;
    this.transit = transit;
    this.stopById = new Map((transit.stops || []).map((s) => [s.id, s]));
    this.locState = 'init'; // init | ok | error
    this.locError = '';
    this.liveVehicles = [];
    this.seqIndex = null; // `${routeId}:${stationSeq}` -> { path, s }
    this.trackedRouteIds = [];
    this.nextPoll = 0;
    this.inflight = false;
  }
  get label() {
    return this.locState === 'ok' ? this._liveLabel : (this.fallback?.label || this._liveLabel);
  }
  update(dt, ctx) {
    this.fallback?.update(dt, ctx);
    if (!this.proxy) { this.locState = 'error'; this.locError = 'proxy URL 없음'; return; }
    const now = performance.now();
    if (this.inflight || now < this.nextPoll) return;
    this.nextPoll = now + LIVE_POLL_MS;
    this.inflight = true;
    this._refresh().catch((e) => { this.locState = 'error'; this.locError = String(e.message || e); }).finally(() => { this.inflight = false; });
  }
  vehicles() {
    if (this.locState === 'ok') return this.liveVehicles;
    return this.fallback ? this.fallback.vehicles() : [];
  }
  arrivals(stop) {
    const key = stop.ref.split(';')[0];
    const c = this.cache.get(key);
    if (!c || performance.now() - c.at > 30000) this._fetch(key);
    if (c?.list) return c.list;
    if (c?.error) return this.fallback ? this.fallback.arrivals(stop) : [{ ref: '⚠', type: 'city', etaSec: null, kind: 'live', text: c.error }];
    return [{ ref: '…', type: 'city', etaSec: null, kind: 'live', text: '실시간 정보 불러오는 중' }];
  }
  async _fetch(mobileNo) {
    const prev = this.cache.get(mobileNo) || {}; prev.at = performance.now(); this.cache.set(mobileNo, prev);
    try {
      if (!this.proxy) throw new Error('proxy URL 없음 (?proxy=)');
      let stationId = this.stationIds[mobileNo];
      if (!stationId) {
        const s = await proxyJson(`${this.proxy}/stations?keyword=${encodeURIComponent(mobileNo)}`);
        const list = [].concat(s?.response?.msgBody?.busStationList || []);
        stationId = list.find((x) => String(x.mobileNo).trim() === mobileNo)?.stationId || list[0]?.stationId;
        if (!stationId) throw new Error('stationId 매핑 실패');
        this.stationIds[mobileNo] = stationId;
      }
      const j = await proxyJson(`${this.proxy}/arrivals?stationId=${stationId}`);
      const items = [].concat(j?.response?.msgBody?.busArrivalList || []);
      prev.list = items.map((it) => ({ ref: String(it.routeName), type: ROUTE_TYPE_CD[it.routeTypeCd] || 'city', etaSec: it.predictTimeSec1 ?? (it.predictTime1 != null ? it.predictTime1 * 60 : null), kind: 'live', text: it.locationNo1 ? `${it.locationNo1}정거장 전` : '', seats: it.remainSeatCnt1 }))
        .sort((a, b) => (a.etaSec ?? 1e9) - (b.etaSec ?? 1e9));
      prev.error = null;
    } catch (e) { prev.error = String(e.message || e); }
  }
  async _refresh() {
    try {
      if (!this.seqIndex) await this._buildIndex();
    } catch (e) {
      this.seqIndex = null;
      this.locState = 'error';
      this.locError = String(e.message || e);
      return;
    }
    try {
      await this._pollLocations();
    } catch (e) {
      this.locState = 'error';
      this.locError = String(e.message || e);
    }
  }
  async _buildIndex() {
    const index = new Map();
    const routeIds = [];
    const byRef = new Map();
    for (const p of this.fallback?.paths || []) {
      if (!p.ref) continue;
      const hasMobile = p.stops.some((st) => mobileOf(this.stopById.get(st.stop)));
      if (!hasMobile) continue;
      if (!byRef.has(p.ref)) byRef.set(p.ref, []);
      byRef.get(p.ref).push(p);
    }
    let sawProxy = false;
    for (const [ref, paths] of byRef) {
      const meta = (this.transit.routes || []).find((r) => r.ref === ref && r.gbis) || (this.transit.routes || []).find((r) => r.ref === ref);
      let j;
      try {
        j = await proxyJson(`${this.proxy}/route-list?keyword=${encodeURIComponent(ref)}`);
        sawProxy = true;
      } catch (e) {
        if (!sawProxy) throw e;
        continue;
      }
      if (!codeOk(msgCode(j))) continue;
      const route = pickRoute(j?.response?.msgBody?.busRouteList, ref, meta?.gbis);
      if (!route?.routeId) continue;
      let sj;
      try { sj = await proxyJson(`${this.proxy}/route-stations?routeId=${encodeURIComponent(route.routeId)}`); }
      catch (e) { if (!sawProxy) throw e; continue; }
      if (!codeOk(msgCode(sj))) continue;
      const stations = [].concat(sj?.response?.msgBody?.busRouteStationList || [])
        .map((s) => ({ mobile: String(s.mobileNo || '').trim(), seq: Number(s.stationSeq) }))
        .filter((s) => s.mobile && Number.isFinite(s.seq))
        .sort((a, b) => a.seq - b.seq);
      const claimed = new Set();
      let matched = 0;
      const ordered = [...paths].sort((a, b) => b.stops.length - a.stops.length);
      for (const p of ordered) {
        const stops = p.stops.map((st) => ({ mobile: mobileOf(this.stopById.get(st.stop)), s: st.s })).filter((s) => s.mobile);
        const best = alignPath(stops, stations, claimed);
        if (best.length < 2) continue;
        for (const m of best) {
          claimed.add(m.index);
          index.set(`${route.routeId}:${m.seq}`, { path: p, s: m.s });
          matched++;
        }
      }
      if (matched > 0) routeIds.push(String(route.routeId));
    }
    this.seqIndex = index;
    this.trackedRouteIds = routeIds;
  }
  async _pollLocations() {
    if (!this.trackedRouteIds.length) {
      this.liveVehicles = [];
      this.locState = 'ok';
      this.locError = '';
      return;
    }
    const results = await Promise.all(this.trackedRouteIds.map(async (routeId) => {
      try { return { routeId, j: await proxyJson(`${this.proxy}/locations?routeId=${encodeURIComponent(routeId)}`) }; }
      catch (e) { return { routeId, error: e }; }
    }));
    const vehicles = [];
    let any = false;
    for (const { routeId, j, error } of results) {
      if (error || !codeOk(msgCode(j))) continue;
      any = true;
      const items = [].concat(j?.response?.msgBody?.busLocationList || []);
      for (const it of items) {
        const seq = Number(it.stationSeq);
        if (!Number.isFinite(seq)) continue;
        const pose = this.seqIndex.get(`${routeId}:${seq}`);
        if (!pose) continue;
        const vid = it.vehId != null && String(it.vehId) !== '' ? String(it.vehId) : (it.plateNo ? String(it.plateNo).trim() : '');
        if (!vid) continue;
        const p = samplePath(pose.path, pose.s);
        vehicles.push({
          id: `live-${routeId}-${vid}`, ref: pose.path.ref, type: pose.path.type, name: pose.path.name,
          x: p.x, z: p.z, heading: Math.atan2(p.dx, p.dz), scale: 1, state: 'live', v: 0, live: true,
        });
      }
    }
    if (!any) throw new Error('locations failed');
    this.liveVehicles = vehicles;
    this.locState = 'ok';
    this.locError = '';
  }
}
export function createBusSource(kind, transit, bounds, opts = {}) {
  const sim = new SimulatedBusSource(transit, bounds);
  if (kind === 'realtime') return new RealtimeBusSource(transit, bounds, { ...opts, fallback: sim });
  return sim;
}
export { liveryOf };
