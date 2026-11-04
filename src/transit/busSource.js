// 버스 위치/도착 정보 소스 (교체 가능)
//   SimulatedBusSource : OSM 노선 형상 위 시뮬레이션. ?bus=sim 이거나 실시간 조회 실패 시 사용
//   RealtimeBusSource  : 프록시 경유 실시간 위치. 실패하면 SimulatedBusSource 로 폴백
//
// 공통 인터페이스
//   update(dt, ctx[, focus])   매 프레임 호출 (ctx.pedLightAt(crossing) 등, focus={x,z}: 간격 계산 반경 중심)
//   vehicles()                 -> [{ id, ref, type, name, x, z, heading, scale, state }]
//   arrivals(stop)             -> [{ ref, type, etaSec|null, text, kind: 'sim'|'virtual'|'live' }]
//   label                      UI 표시용 이름
import { liveryOf } from './livery.js';
import { busLength } from './busModel.js';

export const TIME_COMPRESS = 8; // 실제 배차간격을 1/8로 압축(화면에 버스가 자주 보이도록)
const LIVE_POLL_MS = 120000; // 일일 1,000건 한도 보호를 위해 2분 주기로 위치 폴링
const LIVE_BACKOFF_MS = 600000; // 한도 초과/오류 시 10분 백오프
const ARRIVAL_TTL_MS = 60000; // 정류장 도착정보 캐시 60초
// [bus-rt] ETA 구동 모드(기본 켬, ?busrt=0 이면 위 예전 동작 그대로)
const RT_POLL_MS = 25000; // 플레이어 주변 정류장 도착정보 주기(프록시가 30초 캐시 → 모든 플레이어가 같은 상류 호출 공유)
const RT_BACKOFF_MS = 120000; // 전부 실패 시 2분 뒤 재시도(그동안 시뮬 폴백)
const RT_FOCUS_R = 450, RT_FOCUS_N = 6; // 플레이어 반경·정류장 수 상한
const RT_MAX_BUS = 36, RT_MAX_ETA = 1200; // ETA 버스 상한·20분 넘는 ETA 무시
const RT_PENDING_TTL = 180; // 갱신 안 된 대기(아직 지도 밖) 항목 수명(초)
const HEADWAY_MIN = { M: 12, express: 12, premium: 15, seat: 12, city: 12, village: 10, intercity: 20, airport: 30 };
const VMAX = { M: 15, intercity: 18, express: 12, premium: 12, seat: 11, city: 11, village: 9.5, airport: 14 };
const ACC = 1.3, DEC = 1.8, DWELL = 9, LANE_OFF = 1.7;
const GRID = 24, LANE_W = 2.5, FOLLOW_GAP = 2.5, GIVE_UP = 8, LOOK = 40, MERGE_COS = 0.5; // [bus-net] 노선 간 간격(m)·차로 폭 허용·교착 포기(초)
const SPACE_R = 650; // [bus-net] 코리더에서 간격 계산 반경(m) — 렌더 반경 450m 보다 넉넉히
const gkey = (i, j) => i * 100003 + j;
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

// ---- [bus-rt] ETA → 위치/속도 모델 (순수 함수, 테스트용 export) ----
const XWAIT = 6;
export const RT_VAVG = 0.6; // 배치용 평균 주행속도 = vmax × 0.6 (신호 대기·가감속 포함, 시뮬 도착 계산 0.7 보다 보수적 → 늦지 않게 가까이 배치)
// 정류장 idx 에 eta 초 뒤 도착하려면 지금 경로 위 어디(s)에 있어야 하나 — 앞 정류장 정차(DWELL)를 거슬러 계산. 경로 시작 이전이면 음수.
export function upstreamS(P, idx, eta, vAvg = P.vmax * RT_VAVG) {
  let t = Math.max(0, eta), s = P.stops[idx].s;
  for (let k = idx - 1; k >= 0; k--) {
    const seg = (s - P.stops[k].s) / vAvg;
    if (seg >= t) return s - t * vAvg;
    t -= seg + DWELL; s = P.stops[k].s;
    if (t <= 0) return s;
  }
  return s - t * vAvg;
}
// 버스 b 가 지금 위치에서 정류장 idx 까지 걸릴 예상 시간(초)
export function etaFrom(P, b, idx, vAvg = P.vmax * RT_VAVG) {
  const st = P.stops[idx]; if (!st) return Infinity;
  let between = 0; for (let k = Math.max(0, b.stopIdx + (b.dwell > 0 ? 1 : 0)); k < idx; k++) between++;
  return Math.max(0, st.s - b.s) / vAvg + between * DWELL + (b.dwell > 0 ? b.dwell : 0);
}
// 목표 시각(보다 10초 일찍)에 닿기 위한 속도 상한(가감속·신호 손실 보정 ×1.15), 최저 1.5m/s ~ 최고 vmax×1.3
export function etaSpeed(P, b, g, now) {
  const st = P.stops[g.idx]; if (!st) return P.vmax;
  let between = 0; for (let k = Math.max(0, b.stopIdx + (b.dwell > 0 ? 1 : 0)); k < g.idx; k++) between++;
  let nx = 0; for (const q of P.xings || []) if (q.s > b.s && q.s < st.s) nx++; // 앞 신호 횡단보도 기대 대기(주기 60초 중 보행 26초 → 평균 ~6초)
  const left = g.at - now, T = left - between * DWELL - nx * XWAIT - (b.dwell > 0 ? b.dwell : 0) - Math.min(10, Math.max(0, left - 3)), D = Math.max(0, st.s - b.s); // 신호 대기 여유: 조금 일찍 닿고 정류장에서 ETA 까지 대기
  const v = T > 1 ? (D / T) * 1.15 : P.vmax * 1.3;
  return Math.max(1.5, Math.min(P.vmax * 1.3, v));
}

export class SimulatedBusSource {
  constructor(transit, bounds, { seed = 1, spacing = false, eta = false } = {}) {
    // [bus-rt] eta: 자동 배차 없이 바깥(RealtimeBusSource)이 도착 ETA 로 버스를 넣고(spawnEta) 목표 시각에 맞춰 속도를 조절한다.
    this.eta = eta;
    // [bus-net] spacing: 다른 노선 버스와도 간격 유지·정류장 2번째 정차칸·노선 간 스폰 간격(?bus=sim 정자·코리더만 켬).
    //   끄면(기본: 정자 실시간 모드의 폴백 시뮬) 예전과 완전히 같다.
    this.spacing = spacing; this.stats = { done: 0, xfollow: 0, bay2: 0, giveUp: 0 };
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
    if (!eta) for (const P of this.paths) {
      const gap = P.headway * P.vmax * 0.75;
      let k = 0;
      for (let s = P.L - 30 - hash(P.ref + 'o') * gap; s > 10 && k < 3; s -= gap, k++) this._spawn(P, s);
      P.nextSpawn = hash(P.ref + 'n' + P.id) * P.headway;
    }
  }
  _spawn(P, s = 0) {
    const bus = { id: this.nextId++, P, s, v: s > 0 ? P.vmax * 0.7 : P.vmax * 0.6, dwell: 0, stopIdx: P.stops.findIndex((st) => st.s > s + 1), state: 'run', age: s > 0 ? 9 : 0, out: 0,
      _q: null, _fut: null, _futT: -1, _si: 1, _near: false, _blk: null, _wait: 0, _ign: 0, _hit: null, _hitT: -1 - hash(String(s + P.id)) * 0.06, _hitS: 0, key: null, tgt: null, vcap: null, fade: false, seen: 0, _mb: '' }; // [bus-net] · [bus-rt] key·tgt·vcap(ETA 맞춤 속도 상한) 간격 계산용 필드(모양 고정 → V8 최적화 유지)
    if (bus.stopIdx < 0) bus.stopIdx = P.stops.length;
    this.buses.push(bus); return bus;
  }
  update(dt, ctx, focus) {
    this.t += dt;
    if (this.eta) this._etaSteer(dt);
    else for (const P of this.paths) {
      P.nextSpawn -= dt;
      if (P.nextSpawn <= 0) {
        const tooClose = this.buses.some((b) => b.P === P && b.s < P.blen + 12) || (this.spacing && this._spawnBlocked(P));
        if (!tooClose) { this._spawn(P, 0); P.nextSpawn = P.headway; } else P.nextSpawn = 2;
      }
    }
    if (this.spacing) this._buildGrid(focus);
    for (const b of this.buses) {
      const P = b.P; b.age += dt;
      if (b.dwell > 0) { b.dwell -= dt; b.v = 0; b.state = 'dwell'; if (b.dwell <= 0) b.stopIdx++; continue; }
      const front = b.s + P.blen / 2;
      let limit = P.L + 50, reason = 'run';
      // 1) 다음 정류장
      const st = P.stops[b.stopIdx];
      if (st && st.s - b.s < limit) { limit = st.s - b.s; reason = 'stop'; }
      // [pangyo-express] endStop: 경로 끝(고속도로 합류 뒤)에서 서서히 멈춘 뒤 3초 뒤 사라짐(페이드 1.5초)
      if (P.endStop) { const g = P.L - 1 - b.s; if (g < limit) { limit = Math.max(0, g); reason = 'end'; } }
      // 2) 보행 신호가 초록/깜빡이면 횡단보도 앞 정지선에서 대기
      for (const q of P.xings) {
        const stopOffset = (q.c.depth || 2.2) + 1.8;
        const gapToLine = q.s - stopOffset - front;
        if (gapToLine < -1.5) continue; // 이미 진입
        if (gapToLine > 45) break;
        if (ctx.pedLight(q.c) !== 'red') { if (gapToLine < limit) { limit = Math.max(0, gapToLine); reason = 'xing'; } }
        break;
      }
      // 3) 앞 버스와 간격
      let lead = null;
      for (const o of this.buses) if (o !== b && o.P === P && o.s > b.s) { const g = o.s - P.blen - 6 - b.s; if (g < limit) { limit = Math.max(0, g); reason = 'follow'; lead = o; } }
      // 4) [bus-net] 다른 노선 버스(같은 방향·같은 차로 앞)와 간격 + 정류장 2번째 정차칸
      let blocker = null;
      if (this.spacing && b._near) {
        // 60fps 에선 ~16Hz 로만 다시 계산(버스마다 위상 분산), 사이 프레임은 지난 결과에서 내가 간 거리만큼 간격을 줄여 씀(보수적)
        let hit;
        if (this.t - b._hitT >= 0.06 || b._ign > 0) { hit = this._ahead(b, this.t - (b._hitT < 0 ? this.t - dt : b._hitT)); b._hit = hit; b._hitT = this.t; b._hitS = b.s; }
        else if ((hit = b._hit)) hit = { o: hit.o, gap: hit.gap - (b.s - b._hitS) };
        if (hit && hit.gap < limit) { limit = Math.max(0, hit.gap); reason = 'follow'; blocker = lead = hit.o; }
        b._blk = reason === 'follow' ? lead : null;
      }
      const vAllow = Math.sqrt(Math.max(0, 2 * DEC * limit));
      const target = Math.min(b.vcap ?? P.vmax, vAllow);
      b.v = b.v < target ? Math.min(target, b.v + ACC * dt) : Math.max(target, b.v - DEC * 2 * dt);
      b.s += b.v * dt;
      b.state = b.v < 0.2 ? (reason === 'xing' ? 'xing' : reason === 'follow' ? 'queue' : 'run') : 'run';
      if (reason === 'stop' && limit < 0.6 && b.v < 0.6) { b.dwell = DWELL * (0.8 + hash(b.id + 'd') * 0.5); b.v = 0; b.state = 'dwell'; }
      // [bus-net] 앞 버스가 같은 정류장에 서 있으면 그 뒤(한 대 길이 뒤)에서 정차 = 2번째 정차칸
      if (blocker && st && b.v < 0.6 && limit < 0.8 && blocker.state === 'dwell' && blocker.P.stops[blocker.stopIdx]?.stop === st.stop && st.s - b.s < blocker.P.blen + 12) {
        b.dwell = DWELL * (0.8 + hash(b.id + 'd') * 0.5); b.v = 0; b.state = 'dwell'; this.stats.bay2++;
      }
      if (reason === 'end' && limit < 1.5 && b.v < 0.3) { b.endT = (b.endT || 0) + dt; b.state = 'end'; if (b.endT > 3) b.s = P.L; } // [pangyo-express]
      if (b.s >= P.L) { b.done = true; this.stats.done++; }
    }
    this.buses = this.buses.filter((b) => !b.done);
  }
  // ---- [bus-net] 노선 무관 간격 유지 (spacing 일 때만) ----
  _seg(b, s) { // 경로 구간 인덱스(버스마다 마지막 위치를 기억해 앞으로만 훑음 — 긴 코리더 경로에서 선형 탐색 비용 제거)
    const cum = b.P.cum; let i = b._si || 1; if (i >= cum.length || cum[i - 1] > s) i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    return i;
  }
  _pose(b) {
    const P = b.P, { pts, cum } = P, s = Math.max(0, Math.min(P.L, b.s)), i = (b._si = this._seg(b, s)), q = b._q || (b._q = {});
    const L = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / L, [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = (bx - ax) / L, dz = (bz - az) / L;
    q.x = ax + (bx - ax) * t - dz * LANE_OFF; q.z = az + (bz - az) * t + dx * LANE_OFF; q.dx = dx; q.dz = dz;
    return q;
  }
  // focus(코리더: 플레이어 위치)가 있으면 SPACE_R 안쪽 버스만 간격 계산(화면 밖 원거리 버스는 예전 그대로 → 프레임 비용 절약)
  _buildGrid(focus) {
    const g = this._grid || (this._grid = new Map()); g.clear();
    for (const b of this.buses) {
      const q = this._pose(b);
      if (focus) { const dx = q.x - focus.x, dz = q.z - focus.z, d2 = dx * dx + dz * dz; b._near = d2 < SPACE_R * SPACE_R; if (d2 > (SPACE_R + 80) ** 2) continue; } else b._near = true;
      const k = gkey(Math.floor(q.x / GRID), Math.floor(q.z / GRID));
      let c = g.get(k); if (!c) g.set(k, (c = [])); c.push(b);
    }
  }
  // 다른 노선 버스와의 충돌은 "앞으로 지나갈 길" 끼리 비교한다(차체 뒤끝 ~ 앞 LOOK m, 2m 간격, 차로 오프셋 포함).
  //   두 버스의 길이 처음 만나는 점(같은 방향: 진행 방향 내적 > MERGE_COS, 옆 거리 < LANE_W)에서
  //   X = (내가 그 점까지 갈 거리) - (상대가 그 점까지 갈 거리) = 내 길 위에서 상대가 얼마나 앞서 있나.
  //   X > 0 이면 상대가 앞 → 따라간다(같은 차로 추종·합류 모두 같은 식). X < 0 이면 내가 앞 → 무시.
  //   |X| < 1(나란히·이미 겹침)이면 id 큰 쪽이 양보. 반대 차로·교차로를 가로지르는 버스는 무시.
  //   8초 넘게 서 있고 앞차 사슬이 다시 나로 돌아오면(교착) 4초 동안 다른 노선 무시
  _fut(b) {
    if (b._futT === this.t) return b._fut;
    const P = b.P, { pts, cum } = P, out = b._fut || (b._fut = []);
    out.length = 0;
    const s0 = Math.max(0, b.s - P.blen / 2), end = Math.min(P.L, b.s + P.blen / 2 + LOOK);
    let i = this._seg(b, s0);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let s = s0; s <= end; s += 2) {
      while (i < cum.length - 1 && cum[i] < s) i++;
      const L = cum[i] - cum[i - 1] || 1, t = Math.max(0, Math.min(1, (s - cum[i - 1]) / L));
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = (bx - ax) / L, dz = (bz - az) / L;
      const x = ax + (bx - ax) * t - dz * LANE_OFF, z = az + (bz - az) * t + dx * LANE_OFF;
      out.push({ d: s - b.s, x, z, dx, dz });
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    out.box = [x0 - LANE_W, x1 + LANE_W, z0 - LANE_W, z1 + LANE_W];
    b._futT = this.t; return out;
  }
  _conf(b, o) { // 내 길 위에서 o 가 앞선 거리 X (만나는 점 없으면 null)
    const F = this._fut(b), G = this._fut(o), A = F.box, B = G.box;
    if (A[1] < B[0] || B[1] < A[0] || A[3] < B[2] || B[3] < A[2]) return null;
    const W2 = LANE_W * LANE_W;
    for (const f of F) {
      if (f.x < B[0] || f.x > B[1] || f.z < B[2] || f.z > B[3]) continue;
      let bestD2 = W2, X = null;
      for (const g of G) {
        const ex = f.x - g.x, ez = f.z - g.z, d2 = ex * ex + ez * ez;
        if (d2 < bestD2 && f.dx * g.dx + f.dz * g.dz > MERGE_COS) { bestD2 = d2; X = f.d - g.d; }
      }
      if (X !== null) return X;
    }
    return null;
  }
  _ahead(b, dt) {
    if (b._ign > 0) { b._ign -= dt; return null; }
    const q = b._q, cx = Math.floor(q.x / GRID), cz = Math.floor(q.z / GRID), R = LOOK + 20;
    let best = null;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const c = this._grid.get(gkey(cx + i, cz + j)); if (!c) continue;
      for (const o of c) {
        if (o === b || o.P === b.P || o.done) continue;
        const r = o._q; if (Math.abs(r.x - q.x) > R || Math.abs(r.z - q.z) > R) continue;
        const X = this._conf(b, o); if (X === null) continue;
        if (X < -1 || (X < 1 && o.id > b.id)) continue; // 내가 앞(또는 나란히인데 내가 우선)
        const gap = Math.max(X, 0) - (b.P.blen + o.P.blen) / 2 - FOLLOW_GAP;
        if (!best || gap < best.gap) best = { o, gap };
      }
    }
    if (best && b.v < 0.2) {
      b._wait = (b._wait || 0) + dt;
      if (b._wait > GIVE_UP) {
        b._wait = 0;
        let o = best.o, cyc = false;
        for (let k = 0; k < 24 && o; k++) { if (o === b) { cyc = true; break; } if (o.state === 'dwell' || o.v > 0.3) break; o = o._blk; }
        if (cyc) { b._ign = 4; this.stats.giveUp++; return null; }
      }
    } else b._wait = 0;
    if (best) this.stats.xfollow++;
    return best;
  }
  _spawnBlocked(P) {
    const q = samplePath(P, 0), R = P.blen + 12;
    for (const o of this.buses) {
      if (o.P === P) continue;
      const r = o._q || this._pose(o);
      if (Math.abs(r.x - q.x) < R && Math.abs(r.z - q.z) < R && Math.hypot(r.x - q.x, r.z - q.z) < R && q.dx * r.dx + q.dz * r.dz > 0.5) return true;
    }
    return false;
  }
  // ---- [bus-rt] ETA 구동 (eta 일 때만) ----
  // 목표: 버스 b 가 P.stops[tgt.idx] 에 this.t == tgt.at 에 도착. 남은 거리/남은 시간(중간 정류장 정차 시간 뺌)으로
  //   속도 상한 vcap 을 부드럽게(초당 ~40%) 맞춘다. 위치는 절대 옮기지 않음(순간이동 없음). 일찍 도착하면 목표 시각까지 정차를 늘림(최대 40초).
  _etaSteer(dt) {
    const k = Math.min(1, dt * 0.4);
    for (const b of this.buses) {
      const g = b.tgt, P = b.P;
      if (!g) { if (b.vcap != null) { b.vcap += (P.vmax - b.vcap) * k; if (Math.abs(b.vcap - P.vmax) < 0.05) b.vcap = null; } continue; }
      if (b.stopIdx > g.idx) { b.tgt = null; continue; } // 목표 정류장 지남 → 평소 속도로 계속 운행
      if (b.dwell > 0 && b.stopIdx === g.idx) { // 목표 정류장 정차 중: 일찍 왔으면 ETA(+3초)까지 대기
        if (!g.held) { g.held = true; const w = Math.min(40, g.at - this.t + 3); if (w > b.dwell) b.dwell = w; }
        continue;
      }
      b.vcap = b.vcap == null ? Math.min(P.vmax, b.v || P.vmax) : b.vcap;
      const want = etaSpeed(P, b, g, this.t);
      b.vcap += (want - b.vcap) * k;
    }
  }
  // ETA 로 버스 넣기: 경로 위 위치 s 에 생성(페이드인), 목표 지정
  spawnEta(P, s, tgt, key = null) {
    const b = this._spawn(P, Math.max(0.01, s));
    b.age = 0; b.fade = true; b.key = key; b.tgt = tgt; b.seen = this.t;
    b.vcap = etaSpeed(P, b, tgt, this.t); b.v = Math.min(b.vcap, P.vmax * 0.7);
    return b;
  }
  vehicles() {
    const out = [];
    for (const b of this.buses) {
      const p = samplePath(b.P, b.s);
      let scale = 1;
      if ((b.fade || (b.P.fadeIn && b.s < 15)) && b.age < 3) scale = Math.min(1, b.age / 1.2);
      if (b.P.endStop) { if (b.endT > 1.5) scale = Math.max(0.01, 1 - (b.endT - 1.5) / 1.5); } // [pangyo-express]
      else if (b.P.fadeOut && b.P.L - b.s < 12) scale = Math.max(0.01, (b.P.L - b.s) / 12);
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
  constructor(transit, bounds, { proxy, stationIds = {}, fallback, etaDriven = false, rtData = null } = {}) {
    this._liveLabel = '실시간(경기도 버스 API)';
    // [bus-rt] 도착 ETA 로 움직이는 버스: 별도 시뮬(eta 모드, 자동 배차 없음). 탑승(ride)도 이 시뮬을 그대로 쓴다
    this.rt = etaDriven ? new SimulatedBusSource(rtData || transit, bounds, { spacing: true, eta: true }) : null;
    if (this.rt) this.rt.nextId = 1000000; // 폴백 시뮬 버스 id 와 겹치지 않게(메시 캐시·탑승 판정이 id 기준)
    if (this.rt) { this.rtState = 'init'; this.rtNext = 0; this.rtInflight = false; this.pending = new Map(); this.rtBatch = 0; this.rtCalls = 0; this._rtLabel = '실시간 도착정보 연동(경기도 버스 API)'; }
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
    if (this.rt) return this.rtState === 'ok' ? this._rtLabel : (this.fallback?.label || this._rtLabel);
    return this.locState === 'ok' ? this._liveLabel : (this.fallback?.label || this._liveLabel);
  }
  panelLabel(stop) {
    const key = stop?.ref?.split(';')[0];
    const c = key ? this.cache.get(key) : null;
    if (c?.list) return this.rt ? this._rtLabel : this._liveLabel;
    if (c?.error) return `${this.fallback?.label || '시뮬레이션'} · 실시간 한도 초과/지연 폴백`;
    return this._liveLabel;
  }
  update(dt, ctx) {
    if (this.rt) return this._rtUpdate(dt, ctx);
    this.fallback?.update(dt, ctx);
    if (!this.proxy) { this.locState = 'error'; this.locError = 'proxy URL 없음'; return; }
    const now = performance.now();
    if (this.inflight || now < this.nextPoll) return;
    this.nextPoll = now + LIVE_POLL_MS;
    this.inflight = true;
    this._refresh()
      .catch((e) => {
        this.locState = 'error';
        this.locError = String(e.message || e);
        this.nextPoll = performance.now() + LIVE_BACKOFF_MS;
      })
      .finally(() => {
        if (this.locState === 'error') this.nextPoll = Math.max(this.nextPoll, performance.now() + LIVE_BACKOFF_MS);
        this.inflight = false;
      });
  }
  vehicles() {
    if (this.rt) return this.rtState === 'ok' ? this.rt.vehicles() : (this.fallback ? this.fallback.vehicles() : []);
    if (this.locState === 'ok') return this.liveVehicles;
    return this.fallback ? this.fallback.vehicles() : [];
  }
  arrivals(stop) {
    const key = stop.ref.split(';')[0];
    const c = this.cache.get(key);
    if (!c || performance.now() - c.at > (this.rt ? RT_POLL_MS : ARRIVAL_TTL_MS)) this._fetch(key);
    if (c?.list && this.rt) { // [bus-rt] 받은 뒤 지난 시간만큼 줄여 보여 줌(화면 버스와 같은 시계)
      const age = (performance.now() - c.got) / 1000;
      return c.list.map((a) => (a.etaSec == null ? a : { ...a, etaSec: Math.max(0, a.etaSec - age) })).sort((a, b) => (a.etaSec ?? 1e9) - (b.etaSec ?? 1e9));
    }
    if (c?.list) return c.list;
    if (c?.error) return this.fallback ? this.fallback.arrivals(stop) : [{ ref: '⚠', type: 'city', etaSec: null, kind: 'live', text: c.error }];
    return [{ ref: '…', type: 'city', etaSec: null, kind: 'live', text: '실시간 정보 불러오는 중' }];
  }
  _fetch(mobileNo) {
    const prev = this.cache.get(mobileNo);
    if (prev?.p) return prev.p; // 진행 중이면 같은 요청 공유
    const c = prev || {}; c.at = performance.now(); this.cache.set(mobileNo, c);
    c.p = this._fetchOne(mobileNo, c).finally(() => { c.p = null; });
    return c.p;
  }
  async _fetchOne(mobileNo, prev) {
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
      if (this.rt) this.rtCalls++;
      const items = [].concat(j?.response?.msgBody?.busArrivalList || []);
      prev.items = items; prev.got = performance.now(); // [bus-rt] 원본(차량 id·2번째 버스 포함)
      prev.list = items.map((it) => ({ ref: String(it.routeName), type: ROUTE_TYPE_CD[it.routeTypeCd] || 'city', etaSec: it.predictTimeSec1 ?? (it.predictTime1 != null ? it.predictTime1 * 60 : null), kind: 'live', text: it.locationNo1 ? `${it.locationNo1}정거장 전` : '', seats: it.remainSeatCnt1 }))
        .sort((a, b) => (a.etaSec ?? 1e9) - (b.etaSec ?? 1e9));
      prev.error = null;
    } catch (e) { prev.error = String(e.message || e); }
  }
  // ---- [bus-rt] ETA 구동 ----
  _rtUpdate(dt, ctx) {
    const rt = this.rt;
    if (this.rtState !== 'ok') this.fallback?.update(dt, ctx); // 폴백이 보일 때만 폴백 시뮬 계산
    rt.update(dt, ctx, ctx?.focus);
    this._rtPending();
    if (!this.proxy) { this.rtState = 'error'; return; }
    const now = performance.now();
    if (this.rtInflight || now < this.rtNext) return;
    this.rtNext = now + RT_POLL_MS;
    this.rtInflight = true;
    this._rtPoll(ctx?.focus).then((okN) => {
      if (okN > 0) this.rtState = 'ok';
      else if (okN === 0) { this.rtState = this.rtState === 'ok' ? 'ok' : 'error'; this.rtNext = performance.now() + RT_BACKOFF_MS; }
    }).catch(() => { this.rtState = 'error'; this.rtNext = performance.now() + RT_BACKOFF_MS; })
      .finally(() => { this.rtInflight = false; });
  }
  // 플레이어 주변(없으면 맵 중앙) 정류소번호 있는 정류장 최대 RT_FOCUS_N 개
  focusStops(focus) {
    const f = focus || { x: 0, z: 0 };
    const seen = new Set(), out = [];
    const list = (this.transit.stops || []).filter((s) => mobileOf(s)).map((s) => ({ s, d: Math.hypot(s.x - f.x, s.z - f.z) })).sort((a, b) => a.d - b.d);
    for (const { s, d } of list) {
      if (out.length >= RT_FOCUS_N || (out.length && d > RT_FOCUS_R)) break;
      const k = mobileOf(s); if (seen.has(k)) continue; seen.add(k); out.push(s);
    }
    return out;
  }
  // 반환: 성공한 정류장 수(-1: 대상 없음)
  async _rtPoll(focus) {
    const stops = this.focusStops(focus);
    if (!stops.length) return -1;
    await Promise.all(stops.map((s) => this._fetch(mobileOf(s))));
    const obs = [];
    let okN = 0;
    for (const s of stops) {
      const c = this.cache.get(mobileOf(s));
      if (!c?.items || c.error) continue;
      okN++;
      obs.push(...this.observe(s, c.items, (performance.now() - c.got) / 1000));
    }
    if (okN) this.reconcile(obs);
    return okN;
  }
  // 도착정보 한 줄(1·2번째 버스) → 관측 { key, P, idx, at } (이 정류장을 지나는 OSM 경로가 있는 노선만)
  observe(stop, items, ageSec = 0) {
    const rt = this.rt, out = [];
    for (const it of items) {
      const ref = String(it.routeName ?? '').trim(); if (!ref) continue;
      let best = null;
      for (const P of rt.paths) {
        if (P.ref !== ref && P.ref !== ref.replace(/^G(?=\d)/, '') && 'G' + P.ref !== ref) continue;
        const idx = P.stops.findIndex((st) => st.stop === stop.id);
        if (idx >= 0 && (!best || P.stops[idx].s > best.P.stops[best.idx].s)) best = { P, idx }; // 상류 여유가 가장 긴 경로
      }
      if (!best) continue;
      for (const n of [1, 2]) {
        const sec = it[`predictTimeSec${n}`] != null && it[`predictTimeSec${n}`] !== '' ? Number(it[`predictTimeSec${n}`]) : (it[`predictTime${n}`] != null && it[`predictTime${n}`] !== '' ? Number(it[`predictTime${n}`]) * 60 : NaN);
        const loc = Number(it[`locationNo${n}`]);
        let eta = Number.isFinite(sec) ? sec - ageSec : NaN;
        if (!Number.isFinite(eta) && Number.isFinite(loc) && loc > 0) { // ETA 없고 몇 정거장 전만 있으면: 그 정류장 위치 기준
          const k = best.idx - loc; eta = k >= 0 ? etaFrom(best.P, { s: best.P.stops[k].s, stopIdx: k, dwell: 0 }, best.idx) : NaN;
        }
        if (!Number.isFinite(eta) || eta > RT_MAX_ETA) continue;
        const vid = String(it[`vehId${n}`] ?? '').trim() || String(it[`plateNo${n}`] ?? '').trim();
        out.push({ key: vid ? `${ref}:${vid}` : null, P: best.P, idx: best.idx, at: rt.t + Math.max(0, eta), stop: stop.id });
      }
    }
    return out;
  }
  // 관측 → 기존 버스에 목표 갱신 / 새 버스(또는 아직 지도 밖이면 대기) — 같은 차량은 여러 정류장에서 보여도 한 대
  reconcile(obs) {
    const rt = this.rt, t = rt.t, batch = ++this.rtBatch;
    obs.sort((a, b) => (a.at - t) - (b.at - t)); // 가까운(정확한) ETA 먼저
    for (const o of obs) {
      const P = o.P;
      let b = o.key ? rt.buses.find((x) => x.key === o.key) : null;
      if (!b) { // 차량 id 없음/처음 봄: 같은 경로·아직 안 지난 버스 중 예상 도착이 비슷한 것
        const tol = Math.max(60, 0.3 * (o.at - t));
        let bd = tol;
        for (const x of rt.buses) {
          if (x.P !== P || x.stopIdx > o.idx || x._mb === `${batch}:${o.idx}` || (o.key && x.key && x.key !== o.key)) continue;
          const d = Math.abs(t + etaFrom(P, x, o.idx) - o.at); if (d < bd) { bd = d; b = x; }
        }
      }
      if (b) {
        if (b.stopIdx > o.idx) continue;
        b._mb = `${batch}:${o.idx}`; b.seen = t; if (o.key && !b.key) b.key = o.key;
        if (b._batch !== batch || !b.tgt || o.idx <= b.tgt.idx) { b.tgt = { idx: o.idx, at: o.at, held: false }; b._batch = batch; }
        continue;
      }
      // 대기 목록(아직 경로 시작 전)
      const pk = o.key || this._pendingMatch(o);
      const pe = this.pending.get(pk);
      if (pe && pe._batch === batch && pe.idx < o.idx) continue; // 이번에 더 가까운 정류장 관측이 이미 있음
      this.pending.set(pk, { key: o.key, P, idx: o.idx, at: o.at, seen: t, _batch: batch });
    }
    this._rtPending();
  }
  _pendingMatch(o) {
    const t = this.rt.t;
    for (const [k, pe] of this.pending) if (!pe.key && pe.P === o.P && pe.idx === o.idx && Math.abs(pe.at - o.at) < Math.max(60, 0.3 * (o.at - t))) return k;
    return `anon:${o.P.id}:${o.idx}:${Math.round(o.at)}`;
  }
  // 대기 항목: 지금 있어야 할 위치가 경로 위로 들어오면 그 자리에 생성(지도 경계면 경계에서 페이드인)
  _rtPending() {
    const rt = this.rt, t = rt.t;
    for (const [k, pe] of this.pending) {
      if (t - pe.seen > RT_PENDING_TTL || pe.at < t - 5) { this.pending.delete(k); continue; }
      const s0 = upstreamS(pe.P, pe.idx, pe.at - t);
      if (s0 < 0) continue;
      if (!pe.key) { // 같은 차를 다른 정류장에서 본 것일 수 있음 → 이미 달리는 버스와 예상 도착이 비슷하면 합침
        const tol = Math.max(60, 0.3 * (pe.at - t));
        if (rt.buses.some((x) => x.P === pe.P && x.stopIdx <= pe.idx && Math.abs(t + etaFrom(pe.P, x, pe.idx) - pe.at) < tol)) { this.pending.delete(k); continue; }
      }
      if (rt.buses.length >= RT_MAX_BUS) break;
      if (rt.buses.some((x) => x.P === pe.P && Math.abs(x.s - s0) < pe.P.blen + 4)) continue; // 바로 겹치면 다음 프레임
      rt.spawnEta(pe.P, s0, { idx: pe.idx, at: pe.at, held: false }, pe.key);
      this.pending.delete(k);
    }
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
  // [bus-net] 노선 간 간격은 ?bus=sim(kind 'sim')에서만. 실시간 모드의 폴백 시뮬은 예전 그대로(정자 기본 모드 불변)
  const sim = new SimulatedBusSource(transit, bounds, { spacing: kind === 'sim' && opts.spacing !== false });
  if (kind === 'realtime') return new RealtimeBusSource(transit, bounds, { ...opts, fallback: sim }); // [bus-rt] opts.etaDriven·rtData
  return sim;
}
export { liveryOf };
