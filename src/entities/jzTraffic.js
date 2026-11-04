// [jz-traffic] 정자(라이브 bbox) 일반 차량 NPC: 배달 오토바이·스쿠터·경차·해치백·세단·SUV·승합차·전기차·1톤 트럭·탑차
//   - 라이브 택시 시뮬(Taxis: drive.json 차로·일방통행·커브 감속·신호 정지)을 상속하고, 종류별 크기·속도·가속만 다르게
//   - 차량끼리 충돌 없음: ① 같은 차로 앞차 추종(종류별 길이·폭) ② 교차로·합류: 내 앞 경로(앞머리 궤적)에 다른 차의 외곽이
//     있으면(또는 1.2초 뒤 있을 예정이면) 그 앞에서 정지 — 서로 양보면 번호 작은 차/택시가 먼저 ③ 안전망: 공간 격자(16m)로
//     이웃만 보고, 한 걸음 움직인 외곽(OBB)이 겹치게 되면 그 걸음을 취소. 라이브 택시도 같은 격자·안전망을 쓴다(taxis.guard)
//     버스(실시간/시뮬, busSource 는 손대지 않음)는 우선: 일반 차량이 양보하고, 버스가 밀고 들어오면 그 차는 사라졌다 다른 곳에 나타남
//   - 보행 신호(=차량 정지)·횡단 중인 NPC 앞에서 정지. 배달 오토바이는 가끔 상가·아파트 앞 갓길에 잠깐 정차
//   - 렌더: 종류별 병합 지오메트리 InstancedMesh 1개(공유 재질, 차체 색 = 인스턴스 색) → draw call ≤ 종류 수(11). 멀면 숨김
//   - ?jzcars=0 끔(기존 동작 그대로), ?jzcars=N 기본 대수(시간대 배수 전). 기본 90대 × 시간대(출퇴근·점심·저녁 ↑, 심야 ↓)
import * as THREE from 'three';
import { Taxis } from './taxis.js';
import { taxiLength } from './taxiModel.js';
import { KINDS, kindGeometry, vehicleMaterial, pickWeighted } from './vehicleKinds.js';

const DEC = 3.0, CELL = 16, SHOW_R = 300, BUS_L = 11.5, BUS_W = 2.5;
export const JZ_DEFAULT = 120, JZ_MAX = 200;
const FADE = 0.6, RECYCLE_R = 330;
const SWEEP = [0.5, 1.2, 2.2, 3.5, 5.5, 8, 11.5, 16, 21];

// ?jzcars: '0'/'off' → 끔, 숫자 → 기본 대수, 없으면 기본
export function parseJzCars(params) {
  const v = params?.get?.('jzcars');
  if (v == null || v === '') return { on: true, base: JZ_DEFAULT };
  if (v === '0' || v === 'off' || v === 'false') return { on: false, base: 0 };
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? { on: true, base: Math.min(JZ_MAX, n) } : { on: true, base: JZ_DEFAULT };
}
// 시간대 밀도 배수(게임 시계 기준)
export function densityFor(h) {
  if (h < 6) return 0.45; if (h < 7) return 0.75; if (h < 10) return 1.25; if (h < 11) return 1.0; if (h < 14) return 1.15;
  if (h < 17) return 1.0; if (h < 20) return 1.3; if (h < 22) return 1.05; return 0.7;
}
// 종류 비율: 점심(11–14)·저녁(17–21)엔 배달 오토바이 ↑, 출퇴근엔 승용차 ↑, 낮엔 택배 ↑, 심야엔 화물 ↓
export function mixFor(h) {
  const m = { sedan: 26, suv: 18, kei: 9, hatch: 7, van: 6, ev: 10, porter: 9, parcel: 4, cvs: 2, scooter: 3, moto: 18 };
  const lunch = h >= 11 && h < 14, dinner = h >= 17 && h < 21, commute = (h >= 7 && h < 10) || (h >= 17 && h < 20);
  if (lunch || dinner) m.moto *= 3.0;
  if (commute) { m.sedan *= 1.3; m.suv *= 1.3; m.ev *= 1.3; }
  if (h >= 9 && h < 18) { m.parcel *= 1.4; m.porter *= 1.2; }
  if (h < 6 || h >= 22) { m.porter *= 0.4; m.parcel *= 0.2; m.cvs *= 1.5; m.moto *= 1.2; }
  return Object.entries(m);
}
// 두 직사각형 외곽(중심 x,z · 방향 hx,hz · 반길이 hl · 반폭 hw) 사이 분리 거리(SAT 하한). > 0 이면 안 겹침
export function obbGap(a, b) {
  let best = -Infinity; const dx = b.x - a.x, dz = b.z - a.z;
  const ax = [a.hx, a.hz, -a.hz, a.hx, b.hx, b.hz, -b.hz, b.hx];
  for (let k = 0; k < 8; k += 2) {
    const ux = ax[k], uz = ax[k + 1], d = Math.abs(dx * ux + dz * uz);
    const ra = a.hl * Math.abs(a.hx * ux + a.hz * uz) + a.hw * Math.abs(-a.hz * ux + a.hx * uz);
    const rb = b.hl * Math.abs(b.hx * ux + b.hz * uz) + b.hw * Math.abs(-b.hz * ux + b.hx * uz);
    if (d - ra - rb > best) best = d - ra - rb;
  }
  return best;
}
// 점이 (확장된) 외곽 안인가
const inObb = (px, pz, o, ex, el) => { const dx = px - o.x, dz = pz - o.z; return Math.abs(dx * o.hx + dz * o.hz) < o.hl + el && Math.abs(-dx * o.hz + dz * o.hx) < o.hw + ex; };
const gkey = (ix, iz) => (ix + 4096) * 8192 + (iz + 4096);

export class JzCars extends Taxis {
  constructor({ drive, data, transit, world, taxis = null, base = JZ_DEFAULT, hour = () => 12, stops = [], peds = null, extra = null, seed = 23 }) {
    super(null, null, { drive, data, transit, world, count: 0, seed });
    this.taxis = taxis; this.base = base; this.hour = hour; this.peds = peds; this.extra = extra;
    this.cap = Math.min(JZ_MAX, Math.ceil(base * 1.3));
    this.grid = new Map(); this.recs = []; this.busV = new Map(); this.stats0 = { reverts: 0, respawns: 0, busHits: 0, stuck: 0, yields: 0, deadlocks: 0 };
    // 스폰 가중치: 정자역 가까운 큰길 위주
    const st = data.station || { x: 0, z: 0 };
    this.spawnW = this.edges.map((e) => { const n = this.nodes[e.from]; return e.wt * (1 + 3 * Math.exp(-Math.hypot(n.x - st.x, n.z - st.z) / 350)); });
    this.spawnTot = this.spawnW.reduce((a, b) => a + b, 0);
    // 배달 정차 지점(상가·아파트 입구) 격자(50m)
    this.stopCells = new Map();
    for (const [x, z] of stops) { const k = Math.floor(x / 50) + ',' + Math.floor(z / 50); if (!this.stopCells.has(k)) this.stopCells.set(k, []); this.stopCells.get(k).push({ x, z, ref: 'shop' }); }
    this.motoExits = this.exits; this.exits = [];
    this.target = 0; this._buildGrid(); this.retarget(true);
    if (taxis) { taxis.guard = (t) => this._taxiGuard(t); taxis.extraLimit = (t, x, z, dx, dz) => this._taxiLimit(t, x, z, dx, dz); }
  }
  retarget(initial = false) {
    const h = this.hour(); this.mix = mixFor(h);
    this.target = Math.min(this.cap, Math.round(this.base * densityFor(h)));
    let act = this.list.filter((t) => t && !t.parked && !t.retire).length;
    for (let i = 0; i < this.cap && act < this.target; i++) { const t = this.list[i]; if (!t || t.parked) { this._spawnVeh(i, initial); if (!this.list[i].parked) act++; } }
    for (let i = this.cap - 1; i >= 0 && act > this.target; i--) { const t = this.list[i]; if (t && !t.parked && !t.retire) { t.retire = true; act--; } }
  }
  _laneOffset(t, w) { return Math.max(1.2, super._laneOffset(t, w)); } // 좁은 양방향 길도 마주 오는 차와 겹치지 않게
  _pickSpawn() {
    let W = this.spawnW, tot = this.spawnTot;
    const f = this.focus;
    if (f) { // 플레이어(카메라) 주변에 몰아서: 보이는 곳이 붐비게
      if (!this._fw || Math.hypot(f.x - this._fw.x, f.z - this._fw.z) > 40) {
        const w = this.edges.map((e) => { const n = this.nodes[e.from], d = Math.hypot(n.x - f.x, n.z - f.z); return d > RECYCLE_R - 40 ? 0 : e.wt * Math.exp(-d / 110) * (d < 50 ? 0.4 : 1); });
        this._fw = { x: f.x, z: f.z, w, tot: w.reduce((a, b) => a + b, 0) };
      }
      if (this._fw.tot > 0) { W = this._fw.w; tot = this._fw.tot; }
    }
    let r = this.rnd() * tot; for (let k = 0; k < this.edges.length; k++) { r -= W[k]; if (r <= 0) return this.edges[k]; } return this.edges[this.edges.length - 1];
  }
  _spawnVeh(i, initial) {
    let t = this.list[i];
    if (!t) { t = this.list[i] = { i, mesh: new THREE.Object3D(), v: 0, lane: 0, state: 'drive', cool: 0, lat: 0, latT: 0, age: 0, heading: 0, parked: true, pts: [[0, 0], [0, 0.01]], cum: [0, 0.01], segs: [], sigQ: [], s: 0, rec: null }; }
    t.retire = false; t.stuckT = 0; t.busT = 0; t.yieldTo = null;
    const kind = pickWeighted(this.mix, this.rnd()), K = KINDS[kind];
    t.kind = kind; t.K = K; t.hl = K.L / 2; t.hw = K.W / 2; t.moto = !!K.moto;
    t.color = new THREE.Color(pickWeighted(K.paint, this.rnd()));
    for (let tries = 0; tries < 10; tries++) {
      const e = this._pickSpawn(); if (!e) break;
      t.vf = K.vf * (0.9 + this.rnd() * 0.2); t.lane = K.truck ? 0 : this.rnd() < 0.65 ? 0 : 1; t.state = 'drive'; t.stop = null; t.leaving = false;
      t.lat = t.latT = t.moto ? 0.55 : 0; t.age = initial ? 1 : 0; t.cool = t.moto ? 15 + this.rnd() * 50 : 1e9;
      t.pts = [null]; t.cum = [0]; t.segs = []; t.sigQ = []; t.prevNode = e.from; t.node = e.from; t.s = 0;
      const n0 = this.nodes[e.from]; this._append(t, e); t.pts[0] = t.pts[0] || [n0.x, n0.z];
      const L0 = t.cum[t.cum.length - 1]; if (L0 < K.L + 2) continue;
      t.s = t.hl + 0.5 + this.rnd() * Math.max(0, L0 - K.L - 1);
      this._extend(t);
      const r = this._pose(t, t.s, t.lat, null);
      if (this._clear(r, null, 1.5)) { t.parked = false; t.v = initial ? 4 : 2; t.heading = Math.atan2(r.hx, r.hz); this._commit(t, r); this._gridAdd(t.rec); return t; }
    }
    t.parked = true; t.retry = 1; if (t.rec) t.rec.off = true; return t;
  }
  // 경로 위 s 의 외곽(옆으로 lat 만큼). heading 은 렌더 쪽에서 부드럽게(따로)
  _pose(t, s, lat, hd) {
    const [px, pz, hx, hz] = this._sample(t, s), x = px - hz * lat, z = pz + hx * lat;
    let ux = hx, uz = hz; if (hd != null) { ux = Math.sin(hd); uz = Math.cos(hd); }
    return { x, z, hx: ux, hz: uz, hl: t.hl, hw: t.hw };
  }
  _commit(t, r) {
    const rec = t.rec || (t.rec = { ref: t, mine: true, x: 0, z: 0, hx: 0, hz: 1, hl: t.hl, hw: t.hw, v: 0 });
    rec.x = r.x; rec.z = r.z; rec.hx = r.hx; rec.hz = r.hz; rec.hl = t.hl; rec.hw = t.hw; rec.v = t.v; rec.off = false;
  }
  _gridAdd(r) { const k = gkey(Math.floor(r.x / CELL), Math.floor(r.z / CELL)); let c = this.grid.get(k); if (!c) this.grid.set(k, (c = [])); if (!c.includes(r)) c.push(r); }
  _near(x, z, f) {
    const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const c = this.grid.get(gkey(ix + i, iz + j)); if (c) for (const o of c) if (!o.off) f(o); }
  }
  _clear(r, self, m = 0.05) { let ok = true; this._near(r.x, r.z, (o) => { if (ok && o !== self && Math.abs(o.x - r.x) < 16 && Math.abs(o.z - r.z) < 16 && obbGap(r, o) < m) ok = false; }); return ok; }
  // 다른 차량이 이 걸음으로 더 가까워지며 겹치게 되는가(되돌림 판정)
  _blocked(r0, r1, self) {
    let bad = null;
    this._near(r1.x, r1.z, (o) => { if (bad || o === self || Math.abs(o.x - r1.x) > 16 || Math.abs(o.z - r1.z) > 16) return; const g1 = obbGap(r1, o); if (g1 < 0.05 && g1 < obbGap(r0, o) - 1e-6) bad = o; });
    return bad;
  }
  _buildGrid() {
    const recs = this.recs; recs.length = 0; this.grid.clear();
    for (const t of this.list) if (t && !t.parked && t.rec) recs.push(t.rec);
    for (const t of this.taxis?.list || []) { const r = t._jzRec || (t._jzRec = { ref: t, taxi: true, hl: taxiLength() / 2, hw: 0.9 }); this._syncTaxi(t, r); recs.push(r); }
    const seen = new Set();
    for (const b of this.transit?.source?.vehicles?.() || []) {
      const id = b.id ?? b.ref + ':' + Math.round(b.x) + ',' + Math.round(b.z); seen.add(id);
      const p = this.busV.get(id), hx = Math.sin(b.heading ?? 0), hz = Math.cos(b.heading ?? 0), sc = b.scale ?? 1;
      const v = b.v ?? (p ? Math.hypot(b.x - p.x, b.z - p.z) / Math.max(1e-3, this._dt || 0.016) : 0);
      const r = p?.r || { bus: true }; Object.assign(r, { x: b.x, z: b.z, hx, hz, hl: (BUS_L / 2) * sc, hw: (BUS_W / 2) * Math.max(0.3, sc), v, off: sc < 0.3 });
      this.busV.set(id, { x: b.x, z: b.z, r }); recs.push(r);
    }
    for (const id of this.busV.keys()) if (!seen.has(id)) this.busV.delete(id);
    for (const r of this.extra?.() || []) recs.push(r); // [ride] 정자 안 호출 택시 등(읽기만)
    for (const r of recs) this._gridAdd(r);
  }
  _syncTaxi(t, r) { const p = t.mesh.position, h = t.mesh.rotation.y; r.x = p.x; r.z = p.z; r.hx = Math.sin(h); r.hz = Math.cos(h); r.v = t.v; r.off = false; }
  // 안전망(택시): 새 자세가 겹치게 되면 true → 택시 걸음 취소
  _taxiGuard(t) {
    const r = t._jzRec; if (!r) return false;
    const h = t.mesh.rotation.y, r1 = { x: t.mesh.position.x, z: t.mesh.position.z, hx: Math.sin(h), hz: Math.cos(h), hl: r.hl, hw: r.hw };
    if (this._blocked(r, r1, r)) { this.stats0.reverts++; return true; }
    Object.assign(r, r1); r.v = t.v; return false;
  }
  _taxiLimit(t, x, z, dx, dz) {
    const r = t._jzRec; if (!r) return Infinity;
    const me = { x: r.x, z: r.z, hx: r.hx, hz: r.hz, hl: r.hl, hw: r.hw, v: t.v, rec: r, taxi: true, lat: t.lat };
    const res = this._limit(me, (d) => this._sample(t, t.s + d), true);
    t._jzYield = res.yieldTo; return res.limit;
  }
  // 앞차 추종 + 경로 점유(교차로·합류) 제한 속도. front(d) = 경로 위 중심에서 d 앞 점
  _limit(me, front, mineOnly) {
    const vAllow = (d, v1 = 0) => Math.sqrt(Math.max(0, v1 * v1 + 2 * DEC * Math.max(0, d)));
    const look = Math.max(30, (me.v * me.v) / (2 * DEC) + 14), gapK = me.moto ? 1.6 : 2.6;
    let limit = Infinity, yieldTo = null, sw = null;
    // 내 외곽을 경로 따라 앞으로 밀어 본 자세들(조금 부풀림) — 교차로·합류·회전 중 옆차까지 잡음
    const sweep = () => { if (sw) return sw; sw = []; for (const d of SWEEP) { if (d > look) break; const p = front(d); sw.push([d, { x: p[0] - p[3] * (me.lat || 0), z: p[1] + p[2] * (me.lat || 0), hx: p[2], hz: p[3], hl: me.hl + 0.3, hw: me.hw + 0.2 }]); } return sw; };
    this._near(me.x, me.z, (o) => {
      if (o === me.rec || (mineOnly && !o.mine)) return;
      const rx = o.x - me.x, rz = o.z - me.z; if (Math.abs(rx) > look || Math.abs(rz) > look) return;
      const ahead = rx * me.hx + rz * me.hz, lat = -rx * me.hz + rz * me.hx;
      if (ahead < -(me.hl + o.hl) || ahead > look) return;
      const cos = o.hx * me.hx + o.hz * me.hz;
      if (ahead > 0 && cos > 0.6 && Math.abs(lat) < me.hw + o.hw + 0.25) { // 같은 차로 앞차
        const gap = ahead - me.hl - o.hl - gapK; const l = vAllow(gap, (o.v || 0) * 0.9); if (l < limit) { limit = l; if (gap < 1) yieldTo = o; } return;
      }
      if (ahead > SWEEP[SWEEP.length - 1] + me.hl + o.hl + 4) return;
      if (cos < -0.6 && Math.abs(lat) > me.hw + o.hw - 0.15) return; // 마주 오는 차(다른 차로)
      // 양보 순서: 택시 > 번호 작은 일반 차량. 상대가 이미 나에게 양보 중이고 내가 우선이면 무시
      const oy = o.mine ? o.ref.yieldTo : o.taxi ? o.ref._jzYield : null;
      const prio = oy === me.rec && (o.v || 0) < 1.5 && (me.taxi || (o.mine && me.rec?.ref?.i < o.ref.i)); // 우선이면 바로 앞 몸통만 봄
      const g0 = obbGap(me, o), pr = (o.v || 0) > 0.5 && cos < 0.6 ? Math.min(8, 1.2 * o.v) : 0;
      const q = pr && !prio ? { x: o.x + o.hx * pr, z: o.z + o.hz * pr, hx: o.hx, hz: o.hz, hl: o.hl, hw: o.hw } : null; // 엇갈려 오는 차의 1.2초 뒤 자리
      for (const [d, r] of sweep()) {
        if (prio && d > 2.2) break;
        const g = obbGap(r, o); let hit = g < 0.1 && g < g0 - 0.02;
        if (!hit && q && d > 2) hit = obbGap(r, q) < 0;
        if (hit) { const l = vAllow(d - SWEEP[0] - 0.3); if (l < limit) { limit = l; yieldTo = o; } break; }
      }
    });
    if (yieldTo) this.stats0.yields++;
    return { limit, yieldTo: limit < 1.5 ? yieldTo : null };
  }
  _append(t, e) {
    if (t.moto && t.cool <= 0 && !t.stop) { // 배달 정차 후보: 이 구간 근처 상가·아파트(격자) + 역 출입구
      const a = this.nodes[t.node], b = this.nodes[e.to], c = [];
      for (const n of [a, b]) { const k = Math.floor(n.x / 50) + ',' + Math.floor(n.z / 50); for (const p of this.stopCells.get(k) || []) c.push(p); }
      this.exits = c.length ? c : this.motoExits;
      try { super._append(t, e); } finally { this.exits = []; }
    } else super._append(t, e);
    this._fillet(t);
  }
  // 교차로 모서리를 짧은 곡선으로(제자리 회전 없이 돌아 나감 → 옆 차로 차와 엇갈림 줄임)
  _fillet(t) {
    const P = t.pts, C = t.cum, k = P.length - 2; if (k < 1) return;
    const a = P[k - 1], c = P[k], b = P[k + 1], l1 = C[k] - C[k - 1], l2 = C[k + 1] - C[k]; if (l1 < 1.6 || l2 < 1.6) return;
    const ux = (c[0] - a[0]) / l1, uz = (c[1] - a[1]) / l1, vx = (b[0] - c[0]) / l2, vz = (b[1] - c[1]) / l2;
    if (ux * vx + uz * vz > 0.95) return;
    const T = Math.min(6, 0.45 * l1, 0.45 * l2), s0 = C[k] - T; if (t.s + t.hl + 1 > s0) return;
    const p1 = [c[0] - ux * T, c[1] - uz * T], p2 = [c[0] + vx * T, c[1] + vz * T], arc = [p1];
    for (const u of [0.25, 0.5, 0.75]) { const w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u; arc.push([w0 * p1[0] + w1 * c[0] + w2 * p2[0], w0 * p1[1] + w1 * c[1] + w2 * p2[1]]); }
    arc.push(p2);
    const oldEnd = C[C.length - 1]; P.splice(k, 1, ...arc); C.length = k;
    for (let i = k; i < P.length; i++) C[i] = C[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const d = C[C.length - 1] - oldEnd;
    for (const g of t.segs) if (g.sEnd > s0) g.sEnd += d;
    for (const q of t.sigQ) if (q.s > s0) q.s += d;
    if (t.stop && t.stop.s > s0) t.stop.s += d;
  }
  update(dt) {
    this._dt = dt;
    this._acc = (this._acc || 0) + dt; if (this._acc > 15) { this._acc = 0; this.retarget(); }
    this._buildGrid();
    this.taxis?.update(dt); // 라이브 택시(안전망·일반 차량 인식 포함)
    for (const t of this.taxis?.list || []) if (t._jzRec) {
      this._syncTaxi(t, t._jzRec);
      // 새로 나타난 택시(원래 스폰 로직 그대로) 자리에 겹친 일반 차량은 서서히 사라짐
      if (t.age < 0.3) this._near(t._jzRec.x, t._jzRec.z, (o) => { if (o.mine && !o.off && obbGap(o, t._jzRec) < 0.05) { this.stats0.taxiSpawnClears = (this.stats0.taxiSpawnClears || 0) + 1; this._fadeOut(o.ref); } });
    }
    this.pedPts = this.peds?.() || null;
    for (const t of this.list) {
      if (!t) continue;
      if (t.parked) { if (!t.retire && this._activeCount() < this.target) { t.retry -= dt; if (t.retry <= 0) { this._spawnVeh(t.i, false); if (t.parked) t.retry = 1; } } continue; }
      this._stepVeh(t, dt);
    }
  }
  _activeCount() { let n = 0; for (const t of this.list) if (t && !t.parked) n++; return n; }
  _fadeOut(t) { t.fade = FADE; if (t.rec) t.rec.off = true; t.v = 0; }
  _despawn(t) { t.fade = 0; t.dlT = 0; t.parked = true; t.retry = 0.5 + this.rnd(); if (t.rec) t.rec.off = true; this.stats0.respawns++; }
  _stepVeh(t, dt) {
    const K = t.K; t.age += dt; t.cool -= dt;
    if (t.fade > 0) { t.fade -= dt; t.mesh.scale.setScalar(Math.max(0.01, t.fade / FADE)); if (t.fade <= 0) { this._despawn(t); if (!t.retire) this._spawnVeh(t.i, false); else t.retire = false; } return; }
    const end = t.cum[t.cum.length - 1];
    // 플레이어에서 멀어진(안 보이는) 차는 주변으로 다시 배치
    if (this.focus && t.age > 2 && Math.hypot(t.rec.x - this.focus.x, t.rec.z - this.focus.z) > RECYCLE_R) { this._despawn(t); this.stats0.recycled = (this.stats0.recycled || 0) + 1; if (!t.retire) this._spawnVeh(t.i, false); else t.retire = false; return; }
    if (t.leaving && end - t.s < 8) { this._despawn(t); if (!t.retire) this._spawnVeh(t.i, false); else t.retire = false; return; }
    const [x, z, dx, dz] = this._sample(t, t.s);
    const vAllow = (d, v1 = 0) => Math.sqrt(Math.max(0, v1 * v1 + 2 * DEC * Math.max(0, d)));
    let limit = Infinity, why = '';
    const seg = t.segs.find((g) => g.sEnd >= t.s) || t.segs[t.segs.length - 1];
    const vmax = seg ? seg.vmax : 8;
    { let prevEnd = seg ? seg.sEnd : t.s; for (const g of t.segs) if (g.sEnd > prevEnd) { limit = Math.min(limit, vAllow(prevEnd - t.s, g.vmax)); prevEnd = g.sEnd; } }
    for (let i = 1; i < t.pts.length - 1; i++) { // 커브
      const d = t.cum[i] - t.s; if (d < 0) continue; if (d > 40) break;
      const a = t.pts[i - 1], b = t.pts[i], c = t.pts[i + 1], ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1];
      const ang = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / ((Math.hypot(ux, uz) * Math.hypot(vx, vz)) || 1))));
      if (ang > 0.25) { const R = Math.min(t.cum[i] - t.cum[i - 1], t.cum[i + 1] - t.cum[i]) / ang; limit = Math.min(limit, vAllow(d - 1, Math.max(3, Math.min((t.moto ? 14 : 12) * (1 - ang / 2), Math.sqrt((t.moto ? 3.2 : 2.5) * R))))); }
    }
    const front = t.s + t.hl;
    if (this.transit) for (const q of t.sigQ) { // 신호: 보행 신호면 정지선 앞
      const stopAt = q.s - ((q.c.depth || 2.2) + 2.3); if (stopAt < front - 1.5) continue; if (stopAt - front > 60) break;
      if (this.transit.pedLight(q.c) !== 'red') { const l = vAllow(stopAt - front - 0.5); if (l < limit) { limit = l; why = 'sig'; } break; }
    }
    if (this.pedPts) for (const p of this.pedPts) { // 차도 위 보행자(횡단 중인 NPC)
      const rx = p.x - x, rz = p.z - z; if (Math.abs(rx) > 20 || Math.abs(rz) > 20) continue;
      const ah = rx * dx + rz * dz, la = Math.abs(-rx * dz + rz * dx - t.lat); if (ah < 0 || ah > 16 || la > t.hw + 1.0) continue;
      const l = vAllow(ah - t.hl - 1.5); if (l < limit) { limit = l; why = 'ped'; }
    }
    const me = { x: t.rec.x, z: t.rec.z, hx: t.rec.hx, hz: t.rec.hz, hl: t.hl, hw: t.hw, v: t.v, rec: t.rec, moto: t.moto, lat: t.lat };
    const res = this._limit(me, (d) => this._sample(t, t.s + d), false);
    t.yieldTo = res.yieldTo; if (res.limit < limit) { limit = res.limit; why = 'veh'; }
    if (t.stop) { // 배달 정차(갓길)
      const d = t.stop.s - t.s;
      if (t.state === 'drive' && d < 25) t.latT = t.stop.curb;
      if (t.state === 'drive' && d < 0.4 && t.v < 1.0) { t.state = 'pickup'; t.wait = t.stop.dwell + 4 * this.rnd(); }
      if (t.state === 'drive') limit = Math.min(limit, vAllow(d));
      if (t.state === 'pickup') { limit = 0; why = 'stop'; t.wait -= dt; if (t.wait <= 0) { t.state = 'drive'; t.stop = null; t.latT = 0.55; } }
    }
    const target = Math.min(vmax, limit), v0 = t.v, s0 = t.s, l0 = t.lat, h0 = t.heading;
    t.v = t.v < target ? Math.min(target, t.v + K.acc * dt) : Math.max(target, t.v - DEC * 1.6 * dt);
    if (t.v < 0.05 && target < 0.05) t.v = 0;
    t.s += t.v * dt;
    t.lat += Math.sign(t.latT - t.lat) * Math.min(Math.abs(t.latT - t.lat), 0.9 * dt);
    const p = this._sample(t, t.s), hd = Math.atan2(p[2], p[3]);
    if (t.age < 0.15) t.heading = hd;
    { const e = Math.atan2(Math.sin(hd - t.heading), Math.cos(hd - t.heading)), mx = (0.4 + t.v * (t.moto ? 0.5 : 0.35)) * dt; t.heading += Math.max(-mx, Math.min(mx, e * Math.min(1, dt * (t.moto ? 10 : 8)))); }
    const r1 = this._pose(t, t.s, t.lat, t.heading), r0 = t.rec;
    const hit = this._blocked(r0, r1, r0);
    if (hit) { // 안전망: 이 걸음 취소(뒤차가 멈춤)
      t.s = s0; t.lat = l0; t.heading = h0; t.v = 0; this.stats0.reverts++;
      if (hit.bus && obbGap(r0, hit) < 0.05) { t.busT += dt; if (t.busT > 0.6) { this.stats0.busHits++; this._fadeOut(t); return; } }
    } else { t.busT = 0; this._commit(t, r1); }
    // 막힘 해소: 신호·정차가 아닌데 25초 넘게 못 움직이면 다른 곳으로
    // 줄 서 있음(신호·보행자·정차 대기 중인 앞차 뒤): 막힘으로 세지 않음
    const ly = t.yieldTo; t.queued = why === 'sig' || why === 'ped' || why === 'stop' || (why === 'veh' && !!ly && (!ly.mine || (ly.ref.queued && ly.ref !== t)));
    if (t.v < 0.1 && (hit || (why === 'veh' && !t.queued))) { t.stuckT += dt; if (t.stuckT > 25) { this.stats0.stuck++; this._fadeOut(t); return; } } else t.stuckT = 0;
    // 서로 막힘(교차로 안에서 엇갈려 멈춤): 우선순위 낮은 쪽이 3초 뒤 사라짐(서서히)
    const o = hit || t.yieldTo, lowPrio = o && (o.taxi || (o.mine && o.ref.i < t.i));
    if (t.v < 0.1 && lowPrio && (o.taxi ? o.ref._jzYield === t.rec : o.ref.yieldTo === t.rec || o.ref.hitBy === t.rec)) { t.dlT = (t.dlT || 0) + dt; if (t.dlT > 3) { this.stats0.deadlocks++; this._fadeOut(t); return; } } else t.dlT = 0;
    t.hitBy = hit || null;
    t.rec.v = t.v;
    this._extend(t);
    const y = this.groundY ? this.groundY(t.rec.x, t.rec.z, t.mesh.position.y || 0) : 0;
    t.mesh.position.set(t.rec.x, y + 0.05, t.rec.z); t.mesh.rotation.y = Math.atan2(t.rec.hx, t.rec.hz);
    t.mesh.scale.setScalar(Math.max(0.01, Math.min(1, t.age / 0.8)));
    void v0;
  }
  // 정자 호출 택시(ride)가 피할 장애물(읽기만)
  obstacles(x, z, R) {
    const out = [];
    for (const t of this.list) if (t && !t.parked && t.rec && Math.abs(t.rec.x - x) < R && Math.abs(t.rec.z - z) < R) out.push({ x: t.rec.x, z: t.rec.z, dx: t.rec.hx, dz: t.rec.hz, t });
    return out;
  }
  counts() { const c = {}; let n = 0; for (const t of this.list) if (t && !t.parked) { c[t.kind] = (c[t.kind] || 0) + 1; n++; } return { total: n, target: this.target, byKind: c, ...this.stats0 }; }
}

// 렌더러: 종류별 InstancedMesh 1개(공유 재질). 시점에서 SHOW_R 밖은 그리지 않음
export function createJzTraffic(scene, opts) {
  const sim = new JzCars(opts);
  const group = new THREE.Group(); group.name = 'jzTraffic'; scene?.add(group);
  const mat = vehicleMaterial(), ims = {};
  for (const k of Object.keys(KINDS)) {
    const im = new THREE.InstancedMesh(kindGeometry(k), mat, sim.cap);
    im.count = 0; im.castShadow = true; im.receiveShadow = false; im.frustumCulled = false; im.visible = false;
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sim.cap * 3), 3); im.name = 'jz-' + k;
    group.add(im); ims[k] = im;
  }
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), m4 = new THREE.Matrix4();
  let release = null;
  if (opts.watchEvening) release = opts.watchEvening((on) => { mat.userData.eve.value = on ? 1 : 0; });
  function render(fx, fz) {
    const n = {}; for (const k in ims) n[k] = 0;
    for (const t of sim.list) {
      if (!t || t.parked) continue; const p = t.mesh.position;
      if (fx != null && Math.abs(p.x - fx) > SHOW_R || fz != null && Math.abs(p.z - fz) > SHOW_R) continue;
      const im = ims[t.kind]; q.setFromAxisAngle(up, t.mesh.rotation.y); sc.setScalar(t.mesh.scale.x);
      m4.compose(p, q, sc); im.setMatrixAt(n[t.kind], m4); im.setColorAt(n[t.kind], t.color); n[t.kind]++;
    }
    for (const k in ims) { const im = ims[k]; im.count = n[k]; im.visible = n[k] > 0; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
  }
  return {
    sim, group,
    update(dt, focus) { if (focus) sim.focus = { x: focus.x, z: focus.z }; sim.update(dt); render(focus?.x, focus?.z); },
    obstacles: (x, z, R) => sim.obstacles(x, z, R),
    stats: () => ({ ...sim.counts(), drawCalls: Object.values(ims).filter((im) => im.visible).length }),
    dispose() { release?.(); group.removeFromParent(); for (const im of Object.values(ims)) im.dispose(); },
  };
}

// game.js 진입점: ?jzcars=0 이거나 차도 데이터가 없으면 null(아무것도 만들지 않음 → 기존 동작 그대로)
export function mountJzTraffic(scene, { params, ...opts }) {
  const c = parseJzCars(params);
  if (!c.on || !opts.drive?.nodes?.length) return null;
  return createJzTraffic(scene, { ...opts, base: c.base });
}
// 정자 상가(1층 상가 데이터 [.., x, z, ..])·아파트(건물 외곽 첫 점) → 배달 정차 후보 [x, z]
export function deliveryStops(shopsData, data) {
  const out = [];
  for (const r of shopsData?.b || []) if (Number.isFinite(r[3]) && Number.isFinite(r[4])) out.push([r[3], r[4]]);
  for (const b of data?.buildings || []) if (b.k === 'apartments' && b.o?.length) { let x = 0, z = 0; for (const p of b.o) { x += p[0]; z += p[1]; } out.push([x / b.o.length, z / b.o.length]); }
  return out;
}
