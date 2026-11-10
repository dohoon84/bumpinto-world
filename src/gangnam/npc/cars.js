// [gangnam-npc] 강남대로·테헤란로 차량. 엔진은 정자 JzCars(차로·추종·신호 정지·무겹침).
//   그리는 방식은 미금 차량과 같은 BatchedMesh 하나(종류가 달라도 드로우 1).
//   섬 1(강남 박스) 밖에서 obstacles() 는 빈 배열 — 정자·미금·잠실 시뮬에 넣지 않는다.
import * as THREE from 'three';
import { JzCars, mixFor, obbGap } from '../../entities/jzTraffic.js';
import { KINDS, kindGeometry } from '../../entities/vehicleKinds.js';
import { batchedVehicleMaterial } from '../../corridor/migeumNpc.js';
import { watchEvening } from '../../evening.js';
import { gameHour } from '../../weather.js';
import { carViewTarget, inStreetView, STREET_VIEW, pedPeriod } from './density.js';

const KEEP_PAD = { ahead0: STREET_VIEW.ahead0 - 8, ahead1: STREET_VIEW.ahead1 + 10, lat: STREET_VIEW.lat + 8, nearM: STREET_VIEW.nearM + 12 };
const NIGHT_VIEW = { ahead0: -80, ahead1: 12, lat: 26, nearM: 110 };
const NIGHT_KEEP = { ahead0: NIGHT_VIEW.ahead0 - 10, ahead1: NIGHT_VIEW.ahead1 + 12, lat: NIGHT_VIEW.lat + 10, nearM: NIGHT_VIEW.nearM + 16 };

export class GangnamCars extends JzCars {
  constructor({ drive, box, station, transit = null, world = null, base, hour = () => gameHour(), seed = 77, fix = true, peds = null, mobile = false }) {
    super({
      drive, data: { meta: { bboxLocal: box }, station: station || { x: 0, z: 0 } },
      transit, world, base, hour, stops: [], extra: () => [], seed, fix, peds,
    });
    this.gnBox = box;
    this.mobile = !!mobile;
    this.yaw = null;
    this.keepR = 78;
  }
  // 시간대 대수는 화면 안에 모을 수량. 정자 densityFor 곡선은 쓰지 않는다.
  retarget(initial = false) {
    const h = this.hour();
    this.mix = mixFor(h);
    this.target = Math.min(this.cap, carViewTarget(h, { mobile: this.mobile }));
    let act = this.list.filter((t) => t && !t.parked && !t.retire).length;
    for (let i = 0; i < this.cap && act < this.target; i++) {
      const t = this.list[i];
      if (!t || t.parked) { this._spawnVeh(i, initial); if (!this.list[i].parked) act++; }
    }
    for (let i = this.cap - 1; i >= 0 && act > this.target; i--) {
      const t = this.list[i];
      if (t && !t.parked && !t.retire) { t.retire = true; act--; }
    }
  }
  viewBox() {
    const p = pedPeriod(this.hour());
    return (p === 'evening' || p === 'night') ? NIGHT_VIEW : STREET_VIEW;
  }
  keepBox() {
    const p = pedPeriod(this.hour());
    return (p === 'evening' || p === 'night') ? NIGHT_KEEP : KEEP_PAD;
  }
  _inView(x, z, box) {
    const f = this.focus;
    if (!f) return true;
    if (this.yaw == null) return Math.hypot(x - f.x, z - f.z) <= ((this.viewBox() === NIGHT_VIEW) ? 110 : (this.keepR || 78));
    return inStreetView(x, z, f.x, f.z, this.yaw, box || this.viewBox());
  }
  noteLook(yaw) {
    const f = this.focus;
    if (yaw == null) return;
    if (this.homeYaw == null || !f || !this.homeAt || Math.hypot(f.x - this.homeAt.x, f.z - this.homeAt.z) > 26) {
      this.homeYaw = yaw;
      this.homeAt = f ? { x: f.x, z: f.z } : null;
      this._fw = null;
    }
  }
  _edgeInView(e, f, yaw) {
    const a = this.nodes[e.from], b = this.nodes[e.to];
    if (yaw == null) return Math.hypot((a.x + b.x) / 2 - f.x, (a.z + b.z) / 2 - f.z) <= 58;
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      if (inStreetView(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u, f.x, f.z, yaw, this.viewBox())) return true;
    }
    return false;
  }
  _pickSpawn() {
    const f = this.focus;
    if (!f) return super._pickSpawn();
    const yaw = this.homeYaw ?? this.yaw;
    if (!this._fw || Math.hypot(f.x - this._fw.x, f.z - this._fw.z) > 8 || this._fw.yaw !== yaw) {
      const w = this.edges.map((e) => (this._edgeInView(e, f, yaw) ? e.wt : 0));
      this._fw = { x: f.x, z: f.z, yaw, w, tot: w.reduce((a, b) => a + b, 0) };
    }
    if (this._fw.tot <= 0) return null;
    let r = this.rnd() * this._fw.tot;
    for (let k = 0; k < this.edges.length; k++) { r -= this._fw.w[k]; if (r <= 0) return this.edges[k]; }
    return this.edges[this.edges.length - 1];
  }
  _room(r, self) {
    for (const o of this.list) {
      if (!o || o === self || o.parked || !o.rec || o.rec.off) continue;
      if (Math.abs(o.rec.x - r.x) > 18 || Math.abs(o.rec.z - r.z) > 18) continue;
      if (obbGap(r, o.rec) < 1.3) return false;
    }
    return true;
  }
  _slideIntoView(t) {
    const f = this.focus;
    const yaw = this.homeYaw ?? this.yaw;
    if (!f || yaw == null || !t || t.parked) return;
    if (t.rec && inStreetView(t.rec.x, t.rec.z, f.x, f.z, yaw, this.viewBox()) && this._room(t.rec, t)) return;
    const L = t.cum[t.cum.length - 1];
    const opts = [];
    for (let s = t.hl + 0.4; s < L; s += 4) {
      const p = this._sample(t, s);
      if (!inStreetView(p[0], p[1], f.x, f.z, yaw, this.viewBox())) continue;
      const r = this._pose(t, s, t.lat, null);
      if (this._room(r, t)) opts.push(s);
    }
    if (!opts.length) { this._despawn(t); return; }
    t.s = opts[Math.floor(this.rnd() * opts.length)];
    const r = this._pose(t, t.s, t.lat, null);
    t.heading = Math.atan2(r.hx, r.hz);
    this._commit(t, r);
  }
  _spawnVeh(i, initial) {
    super._spawnVeh(i, initial);
    this._slideIntoView(this.list[i]);
  }
  _stepVeh(t, dt) {
    const f = this.focus;
    if (f && t.rec && !t.parked && t.age > 1.2) {
      const yaw = this.homeYaw == null ? null : this.homeYaw;
      const outside = yaw == null
        ? Math.hypot(t.rec.x - f.x, t.rec.z - f.z) > (this.keepR || 78)
        : !inStreetView(t.rec.x, t.rec.z, f.x, f.z, yaw, this.keepBox());
      if (outside) {
        this._despawn(t);
        if (!t.retire) this._spawnVeh(t.i, false);
        else t.retire = false;
        return;
      }
    }
    return super._stepVeh(t, dt);
  }
  // 강남 박스 밖에서 물어보면 아무것도 안 돌려준다 (다른 섬 교통과 섞지 않음)
  obstacles(x, z, R) {
    const b = this.gnBox;
    if (!b || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return [];
    return super.obstacles(x, z, R);
  }
  // 일방통행 칸. slot 은 rules.js 가 버스 전용을 빼고 고른 번호.
  _laneOffset(t, w) {
    if (w?.slot?.length && w.ow) {
      const li = w.slot[(t.i + (t.lane || 0)) % w.slot.length];
      const lanes = w.lanes || Math.max(1, Math.round(w.w / 3.3));
      const lw = w.w / lanes;
      return w.w / 2 - (li + 0.5) * lw;
    }
    return super._laneOffset(t, w);
  }
}

const CAR_SHOW_R = 280;

export function createGangnamTraffic(parent, opts) {
  const sim = new GangnamCars(opts);
  const group = new THREE.Group();
  group.name = 'gangnamTraffic';
  parent?.add(group);
  const kinds = Object.keys(KINDS);
  const geos = kinds.map((k) => kindGeometry(k));
  const nV = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const mat = batchedVehicleMaterial();
  const bm = new THREE.BatchedMesh(Math.max(1, sim.cap), nV, 0, mat);
  bm.name = 'gn-vehicles';
  bm.castShadow = false;
  bm.receiveShadow = false;
  bm.perObjectFrustumCulled = true;
  bm.sortObjects = false;
  const gid = {};
  kinds.forEach((k, i) => { gid[k] = bm.addGeometry(geos[i]); });
  const slots = [];
  for (let i = 0; i < sim.cap; i++) {
    const id = bm.addInstance(gid.sedan);
    bm.setVisibleAt(id, false);
    slots.push(id);
  }
  group.add(bm);
  const release = opts.watchEvening ? opts.watchEvening((on) => { mat.userData.eve.value = on ? 1 : 0; }) : null;
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), m4 = new THREE.Matrix4();
  let drawn = 0;
  function render(fx, fz) {
    drawn = 0;
    for (let i = 0; i < slots.length; i++) {
      const t = sim.list[i], id = slots[i];
      if (!t || t.parked || (fx != null && (Math.abs(t.mesh.position.x - fx) > CAR_SHOW_R || Math.abs(t.mesh.position.z - fz) > CAR_SHOW_R))) {
        bm.setVisibleAt(id, false); continue;
      }
      if (t._gk !== t.kind) { bm.setGeometryIdAt(id, gid[t.kind]); t._gk = t.kind; }
      q.setFromAxisAngle(up, t.mesh.rotation.y);
      sc.setScalar(t.mesh.scale.x);
      m4.compose(t.mesh.position, q, sc);
      bm.setMatrixAt(id, m4);
      bm.setColorAt(id, t.color);
      bm.setVisibleAt(id, true);
      drawn++;
    }
    bm.visible = drawn > 0;
  }
  return {
    sim, group, mesh: bm,
    update(dt, focus) {
      if (focus) sim.focus = { x: focus.x, z: focus.z };
      if (sim.pendingYaw != null) sim.noteLook(sim.pendingYaw);
      sim.update(dt);
      render(focus?.x, focus?.z);
    },
    obstacles: (x, z, R) => sim.obstacles(x, z, R),
    stats: () => ({ ...sim.counts(), drawn, drawCalls: bm.visible ? 1 : 0, nodes: sim.nodes.length, ways: sim.ways.length }),
    dispose() { release?.(); group.removeFromParent(); bm.dispose(); mat.dispose(); },
  };
}

export { watchEvening };
