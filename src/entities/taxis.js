// [taxi] 시뮬레이션 택시 (실제 택시 위치/배차 데이터 아님 — 무작위 경로 시뮬레이션)
//   - 도로망: public/drive.json (OSM 차도 + 일방통행 정보, scripts/convert-taxi-terrain.mjs)
//             없으면 jeongja.json 의 차도로 대체(일방통행 무시)
//   - 교차점마다 무작위로 진행 (유턴 금지, 막다른 길만 유턴), 큰 길 가중치 ↑, 영역 밖으로 나가면 다른 곳에서 재등장
//   - 우측 차로 주행, 도로 등급별 속도, 커브 감속, 앞차(택시/버스) 간격 유지
//   - 신호 횡단보도: 버스와 같은 규칙 — 보행자 신호가 빨간불이 아니면(=보행 신호) 정지선 앞에서 멈춤
//   - 가끔 정자역 출입구 근처 갓길에 정차해 손님을 태움 (6~10초)
//   사용: const taxis = new Taxis(scene, overlay, { drive, data, transit, world, count })
//         taxis.update(dt)  /  taxis.fastForward(sec)  /  taxis.list
import * as THREE from 'three';
import { createTaxi, pickLivery, TAXI_LIVERIES, taxiLength } from './taxiModel.js';

const SPEED = { motorway: 22, motorway_link: 13, trunk: 17, trunk_link: 12, primary: 13.9, primary_link: 10, secondary: 12, secondary_link: 9, tertiary: 10, tertiary_link: 8, residential: 7, unclassified: 7.5, living_street: 4, service: 4.5 };
const WEIGHT = { motorway: 0.5, motorway_link: 0.25, trunk: 0.8, trunk_link: 0.4, primary: 3, primary_link: 1, secondary: 2.4, secondary_link: 0.8, tertiary: 1.8, residential: 0.9, unclassified: 0.9, living_street: 0.3, service: 0.12 };
const CAR_KINDS = new Set(Object.keys(SPEED));
const ACC = 2.0, DEC = 3.0, GAP = 3.0;
// [ride] 손님을 태운(호출된) 코리더 택시만 t.vmul(기본 없음 = 1)로 구간 제한속도를 올린다. 상한 VCAP(100 km/h).
//   vmul > 1 이면 커브·신호·앞차를 더 멀리 보고 미리 감속한다(정지 거리 v²/2·DEC). vmul 이 없으면 기존 동작 그대로.
const VCAP = 27.8;

export class Taxis {
  constructor(scene, overlay, { drive, data, transit, world, count = 24, seed = 7 }) {
    this.scene = scene; this.overlay = overlay; this.transit = transit; this.world = world; this.list = [];
    this.groundY = world?.vehicleY || world?.groundY || null; // [vehicle-h] 차량: 다리 상판을 따라감
    let s = seed; this.rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.bb = data.meta.bboxLocal;
    this._graph(drive, data);
    this.exits = (drive?.exits || []).length ? drive.exits : [];
    this.station = data.station;
    this.sigs = (transit?.crossings || []).filter((c) => c.sig);
    for (let i = 0; i < count; i++) this._spawn(i, true);
  }
  // ---------- 도로 그래프 ----------
  _graph(drive, data) {
    const nodes = [], ways = [], key = new Map();
    if (drive?.nodes?.length) {
      for (const n of drive.nodes) nodes.push({ x: n[0], z: n[1], out: [] });
      for (const w of drive.ways) ways.push(w);
    } else {
      const nid = (x, z) => { const k = Math.round(x * 2) + ',' + Math.round(z * 2); if (!key.has(k)) { key.set(k, nodes.length); nodes.push({ x, z, out: [] }); } return key.get(k); };
      for (const r of data.roads) if (CAR_KINDS.has(r.k) && r.k !== 'service') ways.push({ k: r.k, w: r.w, ow: 0, name: r.n, n: r.p.map(([x, z]) => nid(x, z)) });
    }
    for (const [wi, w] of ways.entries()) {
      for (let i = 1; i < w.n.length; i++) {
        const a = w.n[i - 1], b = w.n[i]; if (a === b) continue;
        if (w.ow >= 0) nodes[a].out.push({ to: b, way: wi });
        if (w.ow <= 0) nodes[b].out.push({ to: a, way: wi });
      }
    }
    this.nodes = nodes; this.ways = ways;
    this.edges = []; // 스폰용 (가중치)
    for (const [ni, n] of nodes.entries()) for (const e of n.out) { const w = ways[e.way]; if (w.k === 'service' || !this._inBox(n.x, n.z, -20)) continue; this.edges.push({ from: ni, ...e, wt: (WEIGHT[w.k] || 0.5) * Math.hypot(nodes[e.to].x - n.x, nodes[e.to].z - n.z) }); }
    this.edgeW = this.edges.reduce((a, e) => a + e.wt, 0);
  }
  _inBox(x, z, m = 0) { const b = this.bb; return x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m; }
  _laneOffset(t, w) {
    const lanes = w.lanes || Math.max(1, Math.round(w.w / 3.3));
    if (w.ow) { const lw = w.w / lanes, li = Math.min(lanes - 1, t.lane); return w.w / 2 - (li + 0.5) * lw; }
    const per = Math.max(1, Math.floor(lanes / 2)), lw = w.w / 2 / per, li = Math.min(per - 1, t.lane);
    return Math.max(0.9, w.w / 2 - (li + 0.5) * lw);
  }
  // ---------- 택시 생성/경로 ----------
  _spawn(i, initial) {
    let r = this.rnd() * this.edgeW, e = this.edges[0];
    for (const x of this.edges) { r -= x.wt; if (r <= 0) { e = x; break; } }
    let t = this.list[i];
    if (!t) {
      const liv = pickLivery(this.rnd()), mesh = createTaxi(liv);
      this.scene.add(mesh);
      const L = TAXI_LIVERIES[liv];
      t = { i, liv, mesh, v: 0, lane: 0, state: 'drive', cool: 20 + this.rnd() * 60, lat: 0, latT: 0, age: 0, heading: 0 };
      t.tag = this.overlay?.add({ cls: 'tag bus taxi', text: `🚕 ${L.label}`, getPos: () => t.mesh.position.clone().setY(t.mesh.position.y + 2.5), maxDist: 40 });
      if (t.tag) { t.tag.el.style.background = L.tag; t.tag.el.style.color = L.tagFg; }
      this.list[i] = t;
    }
    t.vf = 0.9 + this.rnd() * 0.2; t.lane = this.rnd() < 0.7 ? 0 : 1; t.state = 'drive'; t.stop = null; t.lat = t.latT = 0; t.age = 0;
    t.pts = []; t.cum = [0]; t.segs = []; t.sigQ = []; t.prevNode = e.from; t.node = e.from; t.s = 0;
    const n0 = this.nodes[e.from];
    t.pts.push(null); // 첫 점은 첫 구간 추가 시 채움
    this._append(t, e);
    t.pts[0] = t.pts[0] || [n0.x, n0.z];
    t.s = initial ? this.rnd() * Math.min(20, t.cum[t.cum.length - 1] * 0.5) : 0;
    t.v = initial ? (SPEED[this.ways[e.way].k] || 8) * 0.6 : 3;
    this._extend(t);
  }
  _choose(t) {
    const n = this.nodes[t.node], back = t.prevNode;
    let opts = n.out.filter((e) => e.to !== back);
    if (!opts.length) opts = n.out; // 막다른 길: 유턴
    if (!opts.length) return null;
    const cur = t.segs.length ? t.segs[t.segs.length - 1] : null;
    const ws = opts.map((e) => {
      const w = this.ways[e.way], m = this.nodes[e.to]; let wt = WEIGHT[w.k] || 0.5;
      if (cur && e.way === cur.way) wt *= 2.2; // 직진 선호
      if (!this._inBox(m.x, m.z, 10)) wt *= 0.15;
      if (cur) { const dx = m.x - n.x, dz = m.z - n.z, L = Math.hypot(dx, dz) || 1, dot = (dx * cur.dx + dz * cur.dz) / L; if (dot < -0.3) wt *= 0.1; }
      return wt;
    });
    let r = this.rnd() * ws.reduce((a, b) => a + b, 0);
    for (let k = 0; k < opts.length; k++) { r -= ws[k]; if (r <= 0) return opts[k]; }
    return opts[opts.length - 1];
  }
  // 오프셋(우측 차로) 폴리라인에 한 구간 추가: 이전 구간과의 꺾임은 오프셋 선의 교점으로 이음
  _append(t, e) {
    const a = this.nodes[t.node], b = this.nodes[e.to], w = this.ways[e.way];
    const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.01) { t.prevNode = t.node; t.node = e.to; return; }
    const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L, rx = -dz, rz = dx, off = this._laneOffset(t, w);
    const A = [a.x + rx * off, a.z + rz * off], B = [b.x + rx * off, b.z + rz * off];
    const prev = t.segs[t.segs.length - 1];
    const last = t.pts.length - 1;
    if (!prev) { t.pts[last] = A; }
    else {
      const cross = prev.dx * dz - prev.dz * dx, dot = prev.dx * dx + prev.dz * dz;
      const P0 = t.pts[last];
      if (Math.abs(cross) > 0.15 && dot > -0.6) {
        // 두 오프셋 선의 교점
        const qx = A[0] - P0[0], qz = A[1] - P0[1], u = (qx * dz - qz * dx) / cross;
        const I = [P0[0] + prev.dx * u, P0[1] + prev.dz * u];
        if (Math.hypot(I[0] - a.x, I[1] - a.z) < 3 * Math.max(off, prev.off) + 2) { t.pts[last] = I; this._recum(t, last); }
        else { t.pts.push(A); this._pushCum(t); }
      } else if (Math.hypot(P0[0] - A[0], P0[1] - A[1]) > 0.05) { t.pts.push(A); this._pushCum(t); }
    }
    t.pts.push(B); this._pushCum(t);
    t.segs.push({ way: e.way, dx, dz, off, k: w.k, sEnd: t.cum[t.cum.length - 1], vmax: (SPEED[w.k] || 8) * t.vf });
    // 이 구간 위의 신호 횡단보도
    const s0 = t.cum[t.cum.length - 1] - L;
    for (const c of this.sigs) {
      if (Math.abs(c.dir[0] * dx + c.dir[1] * dz) < 0.6) continue;
      const px = c.x - a.x, pz = c.z - a.z, u = px * dx + pz * dz, v = Math.abs(px * -dz + pz * dx);
      if (u < -1 || u > L + 1 || v > Math.max(3.5, w.w / 2 + 1)) continue;
      t.sigQ.push({ s: s0 + u, c });
    }
    // 정자역 출입구 근처 손님 태우기 예약
    if (t.cool <= 0 && !t.stop && this.exits.length && !/motorway|trunk/.test(w.k)) {
      for (const x of this.exits) {
        const px = x.x - a.x, pz = x.z - a.z, u = px * dx + pz * dz, v = px * -dz + pz * dx;
        if (u > 8 && u < L - 4 && v > -2 && v < w.w / 2 + 16) { // 진행방향 오른쪽(갓길 쪽)에 출입구
          if (this.rnd() < 0.6) { t.stop = { s: s0 + u, ref: x.ref, curb: Math.max(0, w.w / 2 - 1.2 - off), dwell: 6 + this.rnd() * 4 }; }
          t.cool = 45 + this.rnd() * 60; break;
        }
      }
    }
    t.prevNode = t.node; t.node = e.to;
  }
  _pushCum(t) { const n = t.pts.length - 1; t.cum[n] = (t.cum[n - 1] ?? 0) + Math.hypot(t.pts[n][0] - t.pts[n - 1][0], t.pts[n][1] - t.pts[n - 1][1]); }
  _recum(t, i) { if (i > 0) t.cum[i] = t.cum[i - 1] + Math.hypot(t.pts[i][0] - t.pts[i - 1][0], t.pts[i][1] - t.pts[i - 1][1]); }
  _extend(t) {
    let guard = 0;
    while (t.cum[t.cum.length - 1] - t.s < 90 && guard++ < 40) {
      const e = this._choose(t);
      const n = this.nodes[t.node];
      if (!e || (!this._inBox(n.x, n.z, 40))) { t.leaving = true; return; }
      this._append(t, e);
    }
    // 지나간 구간 정리
    while (t.cum.length > 3 && t.cum[1] < t.s - 30) {
      const d = t.cum[1]; t.pts.shift(); t.cum.shift(); for (let k = 0; k < t.cum.length; k++) t.cum[k] -= d;
      t.s -= d; for (const g of t.segs) g.sEnd -= d; for (const q of t.sigQ) q.s -= d; if (t.stop) t.stop.s -= d;
    }
    t.segs = t.segs.filter((g) => g.sEnd > t.s - 5);
    t.sigQ = t.sigQ.filter((q) => q.s > t.s - 10);
  }
  _sample(t, s) {
    const c = t.cum; let i = 1; while (i < c.length - 1 && c[i] < s) i++;
    const a = t.pts[i - 1], b = t.pts[i], L = c[i] - c[i - 1] || 1, k = Math.max(0, Math.min(1, (s - c[i - 1]) / L));
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, (b[0] - a[0]) / L, (b[1] - a[1]) / L, i];
  }
  // ---------- 매 프레임 ----------
  update(dt) {
    const buses = this.transit?.source?.vehicles?.() || [];
    const others = this.list.map((t) => { const [x, z, dx, dz] = this._sample(t, t.s); return { x, z, dx, dz, t }; }).concat(buses.map((b) => ({ x: b.x, z: b.z, dx: Math.sin(b.heading ?? 0), dz: Math.cos(b.heading ?? 0), bus: true })));
    for (const t of this.list) this._step(t, dt, others);
  }
  fastForward(sec, step = 0.1) {
    for (let k = 0; k < sec; k += step) { this.transit?.fastForward?.(step, step); this.update(step); }
  }
  _step(t, dt, others) {
    t.age += dt; t.cool -= dt;
    const end = t.cum[t.cum.length - 1];
    if (t.leaving && end - t.s < 8) { this._spawn(t.i, false); return; }
    const [x, z, dx, dz] = this._sample(t, t.s);
    // 속도 제한: 구간 제한속도, 앞 커브, 신호, 앞차, 정차
    let limit = Infinity; const vAllow = (d, v1 = 0) => Math.sqrt(Math.max(0, v1 * v1 + 2 * DEC * Math.max(0, d)));
    const seg = t.segs.find((g) => g.sEnd >= t.s) || t.segs[t.segs.length - 1];
    const boost = t.vmul > 1 ? t.vmul : 1, vb = (v) => (boost > 1 ? Math.min(VCAP, (v / (t.vf || 1)) * boost) : v); // [ride]
    const brake = boost > 1 ? (t.v * t.v) / (2 * DEC) + 15 : 0; // [ride] 빠를 때 더 멀리 봄
    let vmax = seg ? vb(seg.vmax) : 8;
    // 다음 구간들이 더 느린 길이면 미리 감속
    { let prevEnd = seg ? seg.sEnd : t.s; for (const g of t.segs) if (g.sEnd > prevEnd) { limit = Math.min(limit, vAllow(prevEnd - t.s, vb(g.vmax))); prevEnd = g.sEnd; } }
    // 커브: 앞 40m 의 꺾임
    const curveLook = Math.max(40, brake);
    for (let i = 1; i < t.pts.length - 1; i++) {
      const d = t.cum[i] - t.s; if (d < 0) continue; if (d > curveLook) break;
      const a = t.pts[i - 1], b = t.pts[i], c = t.pts[i + 1];
      const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1];
      const ang = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / ((Math.hypot(ux, uz) * Math.hypot(vx, vz)) || 1))));
      if (ang > 0.25) limit = Math.min(limit, vAllow(d - 1, Math.max(3, 12 * (1 - ang / 2))));
    }
    // 신호: 보행 신호(=차량 정지)면 정지선 앞에서
    const front = t.s + taxiLength() / 2;
    if (this.transit) for (const q of t.sigQ) {
      const stopAt = q.s - ((q.c.depth || 2.2) + 2.3); if (stopAt < front - 1.5) continue; if (stopAt - front > Math.max(60, brake + 10)) break;
      if (this.transit.pedLight(q.c) !== 'red') { limit = Math.min(limit, vAllow(stopAt - front - 0.5)); break; }
    }
    // 앞차
    for (const o of others) {
      if (o.t === t) continue;
      const rx = o.x - x, rz = o.z - z, ahead = rx * dx + rz * dz, lat = Math.abs(rx * -dz + rz * dx);
      if (ahead <= 0 || ahead > Math.max(45, brake + 10) || lat > 1.9 || o.dx * dx + o.dz * dz < 0.3) continue;
      const half = o.bus ? 6 : taxiLength() / 2, gap = ahead - half - taxiLength() / 2 - GAP;
      limit = Math.min(limit, vAllow(gap, o.t ? o.t.v * 0.9 : 0));
    }
    // 손님 태우기
    if (t.stop) {
      const d = t.stop.s - t.s;
      if (t.state === 'drive' && d < 30) t.latT = t.stop.curb;
      if (t.state === 'drive' && d < 0.4 && t.v < 1.0) { t.state = 'pickup'; t.wait = t.stop.dwell; this._tag(t, '🙋 승객 탑승 중'); }
      if (t.state === 'drive') limit = Math.min(limit, vAllow(d));
      if (t.state === 'pickup') { limit = 0; t.wait -= dt; if (t.wait <= 0) { t.state = 'drive'; t.stop = null; t.latT = 0; this._tag(t, '🚗 손님 태우고 출발'); setTimeout(() => this._tag(t), 6000); } }
    }
    const target = Math.min(vmax, limit);
    t.v = t.v < target ? Math.min(target, t.v + ACC * (boost > 1 ? 1.6 : 1) * dt) : Math.max(target, t.v - DEC * 1.6 * dt);
    if (t.v < 0.05 && target < 0.05) t.v = 0;
    t.s += t.v * dt;
    t.lat += Math.sign(t.latT - t.lat) * Math.min(Math.abs(t.latT - t.lat), 0.9 * dt);
    this._extend(t);
    // 렌더
    const [px, pz, hx, hz] = this._sample(t, t.s), rx = -hz, rz = hx;
    const fx = px + rx * t.lat, fz = pz + rz * t.lat;
    const hd = Math.atan2(hx, hz);
    if (t.age < 0.15) t.heading = hd;
    t.heading += Math.atan2(Math.sin(hd - t.heading), Math.cos(hd - t.heading)) * Math.min(1, dt * 8);
    const y = this.groundY ? this.groundY(fx, fz, t.mesh.position.y || 0) : 0;
    t.mesh.position.set(fx, y + 0.05, fz); t.mesh.rotation.y = t.heading;
    const sc = Math.min(1, t.age / 1.0); t.mesh.scale.setScalar(Math.max(0.01, sc));
  }
  _tag(t, extra) { if (t.tag) t.tag.el.textContent = `🚕 ${TAXI_LIVERIES[t.liv].label}` + (extra ? ' · ' + extra : ''); }
  stats() { const c = {}; for (const t of this.list) c[t.liv] = (c[t.liv] || 0) + 1; return { count: this.list.length, byLivery: c, pickups: this.list.filter((t) => t.state === 'pickup').length }; }
}
