// [corridor] 수내 → 롯데 코리더 차량 NPC(택시·일반 차량) + 보행 NPC
//   - 차량: 라이브 택시 시뮬(Taxis: 차로·일방통행·커브 감속·앞차/버스 간격·신호 정지·역 출입구 승차)을 그대로 상속하고,
//     영역만 '시점 주변 상자(BOX)'로 바꾼다. 상자 밖으로 나가거나 정자 bbox(라이브 택시 영역)로 들어가면 상자 안
//     다른 곳(시점에서 SPAWN_MIN 이상 떨어진 곳)에 다시 나타남 → 거리 기반 스폰/디스폰, 총 대수 상한 COUNT.
//   - 렌더: 라이브 택시 모델(createTaxi)을 템플릿으로 부품별 InstancedMesh(재질 색은 instanceColor). 일반 차량은 같은
//     세단에서 지붕 표시등을 뺀 무작위 색. → 차량 수와 무관하게 draw call 이 부품 수 정도로 고정
//   - 보행 NPC: 라이브 아바타(createAvatar/animateAvatar)를 WALKERS 명까지 풀로 재사용. 보도(차도 가장자리 바깥)와
//     탄천 둔치 산책로(낮은 층)를 왕복. 높이는 terrain.groundY → 떠 있거나 빠지지 않음. WALK_R 밖이면 다른 곳으로 이동
import * as THREE from 'three';
import { Taxis } from '../entities/taxis.js';
import { createTaxi, pickLivery, TAXI_LIVERIES } from '../entities/taxiModel.js';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { createTruck, truckShared, COLORS as TRUCK_PAINT, DIM } from '../entities/truckModel.js'; // [life] 스타베이스 'Steel Truck' (로고 없음)
import { isEvening, watchEvening } from '../evening.js';

const BOX = 380, SPAWN_MIN = 140, CELL = 250;
// [life] Steel Truck 도색: 절반은 무도장 스테인리스(브러시드 금속 재질), 나머지는 도장 재질에 인스턴스 색
const TRUCK_MIX = [['truck-s', 'stainless', 0.5], ['truck-p', 'black', 0.12], ['truck-p', 'white', 0.12], ['truck-p', 'blue', 0.07], ['truck-p', 'red', 0.06], ['truck-p', 'green', 0.05], ['truck-p', 'tan', 0.05], ['truck-p', 'orange', 0.03]];
export function pickTruckPaint(r) { for (const [key, c, w] of TRUCK_MIX) { r -= w; if (r <= 0) return { key, color: TRUCK_PAINT[c].color }; } return { key: 'truck-s', color: TRUCK_PAINT.stainless.color }; }
const CAR_COLORS = ['#f2f2ef', '#f2f2ef', '#1d1f22', '#1d1f22', '#c3c8ce', '#c3c8ce', '#6b7178', '#2a3a5a', '#a3262a', '#d9cfb8'];

// [ride] 정자(라이브 bbox) 안 차도: 라이브 택시용 public/drive.json 의 길을 코리더 그래프에 '덧붙인다'(정자 데이터는 읽기만).
//   - 코리더 그래프에 이미 있는 구간(같은 두 노드 사이 간선)은 건너뛰고, 좌표가 같은 노드(0.5m 격자)는 하나로 이어 붙인다.
//   - 덧붙인 길(way.jz)은 호출된 택시(ride)만 달린다: 스폰·무작위 주행 후보에서 빠지므로 코리더 NPC 차량 동작은 그대로.
export function mergeLiveDrive(drive, live, box, M = 40) {
  if (!drive?.nodes?.length || !live?.nodes?.length || !box) return { drive, added: 0 };
  const nodes = drive.nodes.slice(), ways = drive.ways.slice();
  const key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
  const idx = new Map(); drive.nodes.forEach((n, i) => { const k = key(n[0], n[1]); if (!idx.has(k)) idx.set(k, i); });
  const have = new Set(); for (const w of drive.ways) for (let i = 1; i < w.n.length; i++) { have.add(w.n[i - 1] + '>' + w.n[i]); have.add(w.n[i] + '>' + w.n[i - 1]); }
  const inB = (p) => p[0] >= box.x0 - M && p[0] <= box.x1 + M && p[1] >= box.z0 - M && p[1] <= box.z1 + M;
  const nid = (p) => { const k = key(p[0], p[1]); let j = idx.get(k); if (j == null) { j = nodes.length; nodes.push([p[0], p[1]]); idx.set(k, j); } return j; };
  let added = 0;
  for (const w of live.ways) {
    if (!w?.n || w.k === 'service') continue;
    let run = [];
    const flush = () => { if (run.length >= 2) { ways.push({ ...w, n: run, jz: 1 }); added++; } run = []; };
    for (let i = 0; i < w.n.length; i++) {
      const p = live.nodes[w.n[i]]; if (!p || !inB(p)) { flush(); continue; }
      const j = nid(p);
      if (run.length && have.has(run[run.length - 1] + '>' + j)) { flush(); }
      if (run[run.length - 1] !== j) run.push(j);
    }
    flush();
  }
  return { drive: { ...drive, nodes, ways }, added };
}

class CorridorCars extends Taxis {
  constructor({ drive, transit, world, exits, liveBox, count, taxiShare, seed = 11, liveSigs = [], nTaxi = null, trucks = 0 }) {
    super(null, null, { drive, data: { meta: { bboxLocal: { x0: 0, x1: 0, z0: 0, z1: 0 } } }, transit, world, count: 0, seed });
    this.live = liveBox; this.box = { x0: 0, x1: 0, z0: 0, z1: 0 }; this.focus = { x: 0, z: 0 };
    this.exits = exits || []; this.count = count; this.taxiShare = taxiShare;
    // [life] 슬롯 배치: [0, nTaxi) 택시 · … 일반 차량 · [count - trucks, count) 주행 Steel Truck (호출 불가)
    this.nTaxi = nTaxi ?? Math.round(count * taxiShare); this.nTruck = Math.max(0, Math.min(trucks, count - this.nTaxi));
    this.jz = this.ways.some((w) => w.jz); // [ride] 정자 차도가 붙어 있으면 정자에서도 택시 호출 가능
    if (this.jz) { this.edges = this.edges.filter((e) => !this.ways[e.way].jz); this.sigs = this.sigs.concat(liveSigs); }
    this.cells = new Map();
    for (const e of this.edges) {
      const n = this.nodes[e.from], k = Math.floor(n.x / CELL) + ',' + Math.floor(n.z / CELL);
      if (!this.cells.has(k)) this.cells.set(k, []); this.cells.get(k).push(e);
    }
    // [ride] 길가 정차 지점 찾기용 격자: 정자 덧붙인 길 포함
    this.curbCells = this.cells;
    if (this.jz) {
      this.curbCells = new Map();
      for (const [ni, n] of this.nodes.entries()) for (const e of n.out) {
        if (this.ways[e.way].k === 'service') continue;
        const k = Math.floor(n.x / CELL) + ',' + Math.floor(n.z / CELL);
        if (!this.curbCells.has(k)) this.curbCells.set(k, []); this.curbCells.get(k).push({ from: ni, ...e });
      }
    }
    this.started = false;
  }
  // [ride] 무작위 주행은 정자 덧붙인 길(jz)을 고르지 않음 — 호출 택시(hired)나 정자에서 손님을 내려 준 택시(keep)만 예외
  _choose(t) {
    const n = this.nodes[t.node];
    if (!this.jz || t.hired || t.keep || !n.out.some((e) => this.ways[e.way].jz)) return super._choose(t);
    const o = n.out; n.out = o.filter((e) => !this.ways[e.way].jz);
    try { return super._choose(t); } finally { n.out = o; }
  }
  _inLive(x, z) { const b = this.live; return b && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1; }
  _inBox(x, z, m = 0) {
    if (!this.box) return true; // super() 의 _graph 단계: 모든 간선
    const b = this.box; return x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m && !this._inLive(x, z);
  }
  _pickEdge(initial) {
    const { x, z } = this.focus, c0 = Math.floor((x - BOX) / CELL), c1 = Math.floor((x + BOX) / CELL), r0 = Math.floor((z - BOX) / CELL), r1 = Math.floor((z + BOX) / CELL);
    const cand = []; let W = 0;
    for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) for (const e of this.cells.get(i + ',' + j) || []) {
      const n = this.nodes[e.from]; if (!this._inBox(n.x, n.z, -10)) continue;
      const d = Math.hypot(n.x - x, n.z - z); if (!initial && d < SPAWN_MIN) continue;
      cand.push(e); W += e.wt;
    }
    if (!cand.length) return null;
    let r = this.rnd() * W; for (const e of cand) { r -= e.wt; if (r <= 0) return e; }
    return cand[cand.length - 1];
  }
  _spawn(i, initial) {
    const e = this._pickEdge(initial);
    let t = this.list[i];
    if (!t) {
      const taxi = i < this.nTaxi, truck = !taxi && i >= this.count - this.nTruck;
      const paint = truck ? pickTruckPaint(this.rnd()) : null;
      t = { i, taxi, truck, liv: taxi ? pickLivery(this.rnd()) : truck ? paint.key : 'car', color: truck ? paint.color : CAR_COLORS[Math.floor(this.rnd() * CAR_COLORS.length)], mesh: new THREE.Object3D(), v: 0, lane: 0, state: 'drive', cool: 0, lat: 0, latT: 0, age: 0, heading: 0 };
      this.list[i] = t;
    }
    t.parked = !e; if (!e) { t.pts = [[0, 0], [0, 0.01]]; t.cum = [0, 0.01]; t.segs = []; t.sigQ = []; t.s = 0; t.v = 0; return; }
    t.cool = t.taxi ? 20 + this.rnd() * 60 : 1e9; t.leaving = false; t.keep = false; t.vmul = 0;
    t.vf = 0.9 + this.rnd() * 0.2; t.lane = this.rnd() < 0.7 ? 0 : 1; t.state = 'drive'; t.stop = null; t.lat = t.latT = 0; t.age = 0;
    t.pts = [null]; t.cum = [0]; t.segs = []; t.sigQ = []; t.prevNode = e.from; t.node = e.from; t.s = 0;
    const n0 = this.nodes[e.from];
    this._append(t, e);
    t.pts[0] = t.pts[0] || [n0.x, n0.z];
    t.s = initial ? this.rnd() * Math.min(20, t.cum[t.cum.length - 1] * 0.5) : 0;
    t.v = initial ? 6 : 3;
    this._extend(t);
  }
  _tag() {}
  // [ride] 호출(배차)된 택시: 정해진 경로(plan)만 따라가고, 상자/정자 영역 제한·재배치에서 빠진다.
  _extend(t) {
    if (t.keep && !t.hired) {
      // [ride] 정자 안에서 손님을 내려 준 택시: 정자 길도 골라 계속 달림(상자/정자 제한 없이). 멀어지면 updateLive 가 재배치
      let guard = 0;
      while (t.cum[t.cum.length - 1] - t.s < 90 && guard++ < 40) { const e = this._choose(t); if (!e) { t.leaving = true; break; } this._append(t, e); }
    } else if (!t.hired) return super._extend(t);
    while (t.cum.length > 3 && t.cum[1] < t.s - 30) {
      const d = t.cum[1]; t.pts.shift(); t.cum.shift(); for (let k = 0; k < t.cum.length; k++) t.cum[k] -= d;
      t.s -= d; for (const g of t.segs) g.sEnd -= d; for (const q of t.sigQ) q.s -= d; if (t.stop) t.stop.s -= d;
    }
    t.segs = t.segs.filter((g) => g.sEnd > t.s - 5);
    t.sigQ = t.sigQ.filter((q) => q.s > t.s - 10);
  }
  hire(t) { t.hired = true; t.keep = false; t.cool = 1e9; t.stop = null; t.leaving = false; if (t.state === 'pickup') { t.state = 'drive'; t.latT = 0; } }
  // [ride] 빈 택시를 간선 e 위에 새로 세움(정자처럼 근처에 빈 코리더 택시가 없을 때 호출용). hire 와 함께 씀
  // [ride] 아직 한 번도 배치되지 않은 택시 슬롯(정자에서 바로 시작하면 코리더 차량이 없음)을 빈 택시로 만들어 둠
  ensureTaxis() {
    const n = this.nTaxi;
    for (let i = 0; i < n; i++) if (!this.list[i]) { this._spawnSlot(i); }
  }
  _spawnSlot(i) {
    this.list[i] = { i, taxi: true, liv: pickLivery(this.rnd()), color: CAR_COLORS[0], mesh: new THREE.Object3D(), v: 0, lane: 0, state: 'drive', cool: 0, lat: 0, latT: 0, age: 0, heading: 0, parked: true, vf: 1, pts: [[0, 0], [0, 0.01]], cum: [0, 0.01], segs: [], sigQ: [], s: 0 };
  }
  placeOn(t, e) {
    t.vf = t.vf || 1;
    t.parked = false; t.leaving = false; t.vf = 1; t.lane = 0; t.state = 'drive'; t.stop = null; t.lat = t.latT = 0; t.age = 0; t.cool = 1e9;
    t.pts = [null]; t.cum = [0]; t.segs = []; t.sigQ = []; t.prevNode = e.from; t.node = e.from; t.s = 0;
    const n0 = this.nodes[e.from]; this._append(t, e); t.pts[0] = t.pts[0] || [n0.x, n0.z]; t.v = 6;
  }
  // edges: [{ from, to, way }] (from 은 t.node 부터 이어짐). 다 붙인 뒤 폴리라인 길이를 돌려준다.
  appendRoute(t, edges) { for (const e of edges) this._append(t, e); return t.cum[t.cum.length - 1]; }
  release(t) { t.hired = false; t.manual = false; t.vmul = 0; t.stop = null; t.state = 'drive'; t.latT = 0; t.cool = 40; t.leaving = false; t.keep = this._inLive(t.mesh.position.x, t.mesh.position.z); this._extend(t); }
  // [ride] 시점이 정자 안일 때: 코리더 차량은 멈춰 숨기되, 호출 택시(hired)·정자에서 내려 준 택시(keep)만 움직이고 그린다
  updateLive(dt, fx, fz) {
    const act = this.list.filter((t) => !t.parked && (t.hired || t.keep));
    for (const t of act) if (t.keep && !t.hired && Math.hypot(t.mesh.position.x - fx, t.mesh.position.z - fz) > 260) { t.keep = false; t.parked = true; t.retry = 0; }
    const others = act.filter((t) => !t.parked).map((t) => { const [x, z, dx, dz] = this._sample(t, t.s); return { x, z, dx, dz, t }; });
    for (const t of act) if (!t.parked && !t.manual) this._step(t, dt, others);
    return act.filter((t) => !t.parked);
  }
  // 라이브 update 와 같되, 스폰할 차도가 없어 대기 중인 차는 건너뜀
  update(dt) {
    const act = this.list.filter((t) => !t.parked);
    const buses = this.transit?.source?.vehicles?.() || [];
    const others = act.map((t) => { const [x, z, dx, dz] = this._sample(t, t.s); return { x, z, dx, dz, t }; }).concat(buses.map((b) => ({ x: b.x, z: b.z, dx: Math.sin(b.heading ?? 0), dz: Math.cos(b.heading ?? 0), bus: true })));
    for (const t of act) if (!t.manual) this._step(t, dt, others); // [ride] 탑승 중인 택시는 ride 가 직접 움직임
  }
  tick(dt, fx, fz) {
    const moved = Math.hypot(fx - this.focus.x, fz - this.focus.z) > BOX * 1.5;
    this.focus.x = fx; this.focus.z = fz;
    this.box = { x0: fx - BOX, x1: fx + BOX, z0: fz - BOX, z1: fz + BOX };
    if (!this.started || moved) { this.started = true; for (let i = 0; i < this.count; i++) if (!this.list[i]?.hired) this._spawn(i, true); } // [ride] 호출된 택시는 유지
    for (const t of this.list) {
      if (t.hired) continue; // [ride]
      if (t.parked) { t.retry = (t.retry || 0) - dt; if (t.retry <= 0) { t.retry = 1; this._spawn(t.i, false); } continue; }
      const p = t.mesh.position;
      if (t.age > 0.5 && (Math.abs(p.x - fx) > BOX + 60 || Math.abs(p.z - fz) > BOX + 60)) this._spawn(t.i, false);
    }
    this.update(dt);
  }
}

// ---------- 인스턴싱 렌더러 ----------
function buildInstancer(group, cap) {
  const variants = {}; // key -> [{ part, local, color }]
  const parts = new Map(); // key -> { im, n, evening }
  const tmp = new THREE.Matrix4();
  const templates = [];
  const addTemplate = (key, root, { recolor = null, noSign = false, tint = null } = {}) => { // [life] tint: 표준 재질을 인스턴스 색으로 칠함(트럭 차체)
    root.updateMatrixWorld(true);
    const list = [];
    root.traverse((o) => {
      if (!o.isMesh || o.isSprite) return;
      const evening = !!o.parent && o.parent.name === 'eveningLights';
      const multi = Array.isArray(o.material);
      if (multi && noSign) return;
      const isCab = o.geometry.type === 'ExtrudeGeometry';
      const lambert = !multi && o.material.isMeshLambertMaterial && !isCab;
      const tinted = !multi && !lambert && !!tint?.has(o.material);
      const pk = lambert ? 'L|' + o.geometry.uuid : (tinted ? 'T|' : 'M|') + o.geometry.uuid + '|' + (multi ? o.material.map((m) => m.uuid).join(',') : o.material.uuid);
      if (!parts.has(pk)) parts.set(pk, { geo: o.geometry, mat: lambert ? null : o.material, lambert, tint: tinted, cast: o.castShadow, evening, src: o, n: 0 });
      let color = lambert ? o.material.color.clone() : tinted ? 'BODY' : null;
      if (lambert && recolor && recolor.has(o.material)) color = recolor.get(o.material);
      list.push({ pk, local: o.matrixWorld.clone(), color });
    });
    variants[key] = list; templates.push(root);
  };
  return {
    variants, parts, addTemplate,
    finalize() {
      const cnt = new Map();
      for (const list of Object.values(variants)) { const c = new Map(); for (const it of list) c.set(it.pk, (c.get(it.pk) || 0) + 1); for (const [k, v] of c) cnt.set(k, Math.max(cnt.get(k) || 0, v)); }
      for (const [pk, P] of parts) {
        const mat = P.lambert ? new THREE.MeshLambertMaterial({ color: '#ffffff' }) : P.tint ? P.mat.clone() : P.mat;
        if (P.tint) mat.color.set('#ffffff');
        const im = new THREE.InstancedMesh(P.geo, mat, cap * (cnt.get(pk) || 1));
        im.count = 0; im.castShadow = P.cast; im.frustumCulled = false;
        if (P.lambert || P.tint) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * (cnt.get(pk) || 1) * 3), 3);
        P.im = im; group.add(im);
      }
    },
    write(vehicles) {
      for (const P of parts.values()) P.n = 0;
      for (const { key, matrix, color } of vehicles) {
        for (const it of variants[key]) {
          const P = parts.get(it.pk);
          tmp.multiplyMatrices(matrix, it.local);
          P.im.setMatrixAt(P.n, tmp);
          if (P.lambert || P.tint) P.im.setColorAt(P.n, it.color === 'BODY' ? color : it.color);
          P.n++;
        }
      }
      const eve = isEvening();
      for (const P of parts.values()) {
        P.im.count = P.n; P.im.visible = P.n > 0 && (!P.evening || eve);
        if (!P.lambert && !P.tint && P.src.material !== P.im.material && !Array.isArray(P.src.material)) P.im.material = P.src.material; // 저녁 캐빈 유리 등 템플릿 재질 교체 따라감
        P.im.instanceMatrix.needsUpdate = true; if (P.im.instanceColor) P.im.instanceColor.needsUpdate = true;
      }
    },
    dispose() { for (const r of templates) r.userData.releaseLights?.(); },
  };
}

// ---------- 보행 NPC ----------
const LOOKS = [
  { color: '#4f7cff', pants: '#2d3436', gender: 'm', hair: 'short' }, { color: '#e17055', pants: '#2d3436', gender: 'f', hair: 'long' },
  { color: '#00b894', pants: '#636e72', gender: 'm', hair: 'short', bag: '#2d3436' }, { color: '#fdcb6e', pants: '#2c3e50', gender: 'f', hair: 'pony' },
  { color: '#6c5ce7', pants: '#222', gender: 'm', hair: 'short', glasses: true }, { color: '#fab1a0', pants: '#3d342c', gender: 'f', hair: 'long', top: 'short' },
  { color: '#2d3436', pants: '#2d3436', gender: 'm', hair: 'short', top: 'hoodie' }, { color: '#81ecec', pants: '#34495e', gender: 'f', hair: 'pony', hat: '#222' },
  { color: '#a29bfe', pants: '#636e72', gender: 'm', face: 'long', beard: 'full' }, { color: '#ff7675', pants: '#2d3436', gender: 'f', face: 'round', hair: 'long', bag: '#8e6e53' },
];
const SKINS = ['#f2d0b0', '#e8c4a8', '#f6d7c3', '#d7a888'];
// [life] 기존 10종 뒤로는 시드 난수 조합(상의·하의·머리·소품). avatar 재질은 색별 공유 Lambert 라 인스턴스 색으로 흡수된다
const TOPS = ['#4f7cff', '#e17055', '#00b894', '#fdcb6e', '#6c5ce7', '#fab1a0', '#2d3436', '#81ecec', '#a29bfe', '#ff7675', '#dfe6e9', '#b2bec3', '#636e72', '#e84393', '#55efc4', '#ffeaa7', '#74b9ff', '#2c3e50', '#c0392b', '#8e6e53'];
const PANTS = ['#2d3436', '#636e72', '#2c3e50', '#34495e', '#3d342c', '#222222', '#576574', '#1e3799'];
function lookFor(i, r) {
  if (i < LOOKS.length) return { ...LOOKS[i], skin: SKINS[i % SKINS.length] };
  const pick = (a) => a[Math.floor(r() * a.length)], f = r() < 0.5;
  const look = { color: pick(TOPS), pants: pick(PANTS), gender: f ? 'f' : 'm', hair: f ? pick(['long', 'pony', 'short']) : 'short', skin: pick(SKINS) };
  if (r() < 0.25) look.bag = pick(['#2d3436', '#8e6e53', '#636e72']);
  if (r() < 0.15) look.glasses = true;
  if (r() < 0.12) look.hat = pick(['#222222', '#c0392b', '#2c3e50']);
  if (r() < 0.2) look.top = pick(['short', 'hoodie']);
  return look;
}

// [life] 보행 NPC 인스턴싱: 아바타(장면 밖 Object3D)를 그대로 애니메이션한 뒤, 부품(공유 지오메트리)별 InstancedMesh 에 행렬·색을 쓴다.
//   → 보행자 수와 무관하게 draw call 은 부품 종류 수(≈20)로 고정. 55m 밖에서는 눈·안경 같은 작은 부품은 생략(LOD)
function buildCrowd(group) {
  const parts = new Map();
  const shown = (o, root) => { for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false; return true; };
  return {
    parts,
    register(root) {
      root.updateMatrixWorld(true);
      const list = [];
      root.traverse((o) => {
        if (!o.isMesh || Array.isArray(o.material)) return;
        const m = o.material;
        const lam = m.isMeshLambertMaterial && !m.map && !m.transparent && m.side === THREE.FrontSide && (!m.emissive || m.emissive.getHex() === 0);
        const key = (lam ? 'L|' : 'M|' + m.uuid + '|') + o.geometry.uuid;
        let P = parts.get(key);
        if (!P) parts.set(key, (P = { geo: o.geometry, mat: lam ? null : m, lam, cast: o.castShadow, cap: 0, n: 0, im: null }));
        P.cap++;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        list.push({ o, P, small: o.geometry.boundingSphere.radius < 0.09 });
      });
      return list;
    },
    finalize() {
      for (const P of parts.values()) {
        const im = new THREE.InstancedMesh(P.geo, P.lam ? new THREE.MeshLambertMaterial({ color: '#ffffff' }) : P.mat, Math.max(1, P.cap));
        im.count = 0; im.castShadow = P.cast; im.receiveShadow = true; im.frustumCulled = false; im.name = 'corridorCrowd';
        if (P.lam) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, P.cap) * 3), 3);
        P.im = im; group.add(im);
      }
    },
    begin() { for (const P of parts.values()) P.n = 0; },
    add(root, list, far) {
      root.updateMatrixWorld(true);
      for (const it of list) {
        if ((far && it.small) || !shown(it.o, root)) continue;
        const P = it.P; if (P.n >= P.im.instanceMatrix.count) continue;
        P.im.setMatrixAt(P.n, it.o.matrixWorld);
        if (P.lam) P.im.setColorAt(P.n, it.o.material.color);
        P.n++;
      }
    },
    end() {
      for (const P of parts.values()) {
        P.im.count = P.n; P.im.visible = P.n > 0;
        if (P.n) { P.im.instanceMatrix.needsUpdate = true; if (P.im.instanceColor) P.im.instanceColor.needsUpdate = true; }
      }
    },
  };
}

// 선분까지 거리
const segDist = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); return Math.hypot(x - ax - dx * k, z - az - dz * k); };

export function createCorridorTraffic(root, { drive, crossings, terrain, terrainT, world, stations, liveBox, getBuses, params, overlay, liveDrive = null, liveCrossings = null, renderer = null, hints = null }) {
  const group = new THREE.Group(); group.name = 'corridorTraffic'; root.add(group);
  const num = (k, d, hi) => { const v = params?.get?.(k); return Math.max(0, Math.min(hi, v == null ? d : Math.round(Number(v)) || 0)); };
  // [life] 일반 차량 72대 중 택시 0.3(≈22대 — ride 패치와 같은 택시 수). 인스턴싱이라 draw call 은 대수와 무관. ?ccars= / ?ctaxi=(0~1)
  const CARS = num('ccars', 72, 120);
  const SHARE = Math.max(0, Math.min(1, Number(params?.get?.('ctaxi') ?? 0.3)));
  const NTAXI = Math.round(CARS * SHARE);
  // [life] Steel Truck ?ctrucks=N (기본 12): 절반(올림)은 차량 흐름 속 주행, 나머지는 단지 주차장·이면도로 길가에 주차
  const TRUCKS = num('ctrucks', 12, 40), TDRIVE = Math.ceil(TRUCKS / 2), TPARK = TRUCKS - TDRIVE;
  // [life] 보행 NPC 기본 48명(이전 10명). 인스턴싱이라 draw call 은 부품 종류 수로 고정. ?cwalkers=
  const WALKERS = num('cwalkers', 48, 120);
  const COUNT = CARS + TDRIVE;
  const exits = stations.flatMap((s) => s.exits || []);
  const transit = { crossings: crossings.crossings, pedLight: crossings.pedLight, source: { vehicles: getBuses } };
  const inLB = (c) => liveBox && c.x >= liveBox.x0 && c.x <= liveBox.x1 && c.z >= liveBox.z0 && c.z <= liveBox.z1;
  const merged = liveDrive ? mergeLiveDrive(drive, liveDrive, liveBox) : { drive, added: 0 };
  const liveSigs = merged.added ? (liveCrossings || []).filter((c) => c.sig && inLB(c)) : [];
  const cars = COUNT || WALKERS || TPARK ? new CorridorCars({ drive: merged.drive, transit, world, exits, liveBox, count: COUNT, taxiShare: SHARE, nTaxi: NTAXI, trucks: TDRIVE, liveSigs }) : null;

  // 템플릿: 택시 리버리 5종 + 일반 차량(표시등 없는 세단, 차체 색은 인스턴스별) + [life] Steel Truck 2종(스테인리스/도장)
  const inst = buildInstancer(group, Math.max(1, COUNT + TPARK));
  for (const liv of Object.keys(TAXI_LIVERIES)) inst.addTemplate(liv, createTaxi(liv));
  const carT = createTaxi('white');
  const bodyMat = carT.children.find((o) => o.isMesh)?.material;
  inst.addTemplate('car', carT, { noSign: true, recolor: new Map([[bodyMat, 'BODY']]) });
  if (TRUCKS) {
    const TS = truckShared(renderer);
    inst.addTemplate('truck-s', createTruck('stainless', renderer), { tint: new Set([TS.bodyMats.stainless]) });
    inst.addTemplate('truck-p', createTruck('white', renderer), { tint: new Set([TS.bodyMats.white]) });
  }
  inst.finalize();
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new Map();
  const colorOf = (c) => (col.has(c) ? col.get(c) : col.set(c, new THREE.Color(c)).get(c));

  // ---------- [life] 동네 힌트(역 출구·상가·아파트·보행자 거리·주차 통로) ----------
  let H = { spots: [], svc: [], foot: [] }, hAt = null, hAcc = 0;
  const hintsNear = (fx, fz) => {
    if (hints && (!hAt || hAcc > 3 || Math.hypot(fx - hAt.x, fz - hAt.z) > 60)) { H = hints(fx, fz, 330); hAt = { x: fx, z: fz }; hAcc = 0; }
    return H;
  };
  const exitPts = stations.flatMap((s) => (s.exits?.length ? s.exits : [s]).map((e) => ({ x: e.x, z: e.z, kind: 'station' })));

  // ---------- 보행 NPC ----------
  const gy = (x, z, ref) => (terrain ? terrain.getGroundHeight(x, z, ref) : 0);
  let wr = 12345; const wrnd = () => ((wr = (wr * 16807) % 2147483647) / 2147483647);
  const crowd = buildCrowd(group);
  const walkers = [];
  for (let i = 0; i < WALKERS; i++) {
    const mesh = createAvatar(lookFor(i, wrnd)); mesh.visible = false;
    walkers.push({ mesh, parts: crowd.register(mesh), path: null, s: 0, dir: 1, speed: 0.9 + ((i * 37) % 10) / 20, idle: 0, kind: null, cross: null });
  }
  crowd.finalize();
  const blocked = (x, z) => world.onRoad?.(x, z) || world.isBlocked?.(x, z, 0.4);
  const river = (x, z) => terrain && terrain.renderHeight(x, z) < -0.3;
  const inLiveP = (x, z, m = 0) => liveBox && x >= liveBox.x0 - m && x <= liveBox.x1 + m && z >= liveBox.z0 - m && z <= liveBox.z1 + m;
  const pickOf = (a) => a[Math.floor(wrnd() * a.length)];
  // 씨앗(사람이 모이는 곳): 역 출구 > 상가 > 아파트 > 업무 시설 — 시점 180m 안
  function pickSeed(fx, fz) {
    const R = 180, near = (p) => Math.abs(p.x - fx) < R && Math.abs(p.z - fz) < R;
    const r = wrnd(), h = hintsNear(fx, fz);
    const of = (kind) => { const a = []; for (const s of h.spots) if (s[2] === kind && Math.abs(s[0] - fx) < R && Math.abs(s[1] - fz) < R) a.push(s); return a.length ? (([x, z]) => ({ x, z, kind }))(pickOf(a)) : null; };
    if (r < 0.28) { const a = exitPts.filter(near); if (a.length) return pickOf(a); }
    if (r < 0.58) { const s = of('shop'); if (s) return s; }
    if (r < 0.84) { const s = of('apt'); if (s) return s; }
    if (r < 0.92) { const s = of('office'); if (s) return s; }
    return null;
  }
  // 씨앗 근처 차도(코리더 그래프, 정자 제외) 간선들 — 가까운 순
  function edgesNear(x, z, n = 8) {
    const out = [], c0 = Math.floor(x / CELL), r0 = Math.floor(z / CELL);
    for (let i = c0 - 1; i <= c0 + 1; i++) for (let j = r0 - 1; j <= r0 + 1; j++) for (const e of cars.cells.get(i + ',' + j) || []) {
      const a = cars.nodes[e.from], b = cars.nodes[e.to];
      if (Math.abs(a.x - x) > 160 || Math.abs(a.z - z) > 160) continue;
      out.push([segDist(x, z, a.x, a.z, b.x, b.z), e]);
    }
    return out.sort((p, q2) => p[0] - q2[0]).slice(0, n).map((p) => p[1]);
  }
  const sidewalkPath = (fx, fz, seed) => {
    if (!cars) return null;
    const near = seed ? edgesNear(seed.x, seed.z) : [];
    for (let tries = 0; tries < 24; tries++) {
      const e = tries < 12 && near.length ? near[tries % near.length] : cars._pickEdge(true); if (!e) return null;
      const w = cars.ways[e.way]; if (/motorway|trunk/.test(w.k)) continue;
      const a = cars.nodes[e.from], b = cars.nodes[e.to], L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 25) continue;
      const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L, side = wrnd() < 0.5 ? -1 : 1, off = w.w / 2 + 1.8;
      let s0 = 2;
      if (seed) { const k = (seed.x - a.x) * dx + (seed.z - a.z) * dz; s0 = Math.max(2, Math.min(L - 30, k - 20 - wrnd() * 30)); }
      const pts = [];
      for (let s = s0; s <= Math.min(L - 2, s0 + 140); s += 4) {
        const x = a.x + dx * s - dz * off * side, z = a.z + dz * s + dx * off * side;
        const xi = x + dz * 0.8 * side, zi = z - dx * 0.8 * side; // 차도 쪽 여유 0.8m
        if (blocked(x, z) || world.onRoad?.(xi, zi) || cars._inLive(x, z) || river(x, z)) break;
        pts.push([x, z]);
      }
      if (pts.length >= 6 && Math.hypot(pts[0][0] - fx, pts[0][1] - fz) < 260) return pts;
    }
    return null;
  };
  // [life] 횡단보도 건너기: 인도(접근) → 횡단보도 → 맞은편 인도. 신호 있는 곳은 보행 신호가 초록일 때만 진입
  const crossList = (crossings.crossings || []).filter((c) => !inLB(c) && !inLiveP(c.x, c.z, 30));
  const crossingPath = (fx, fz, seed) => {
    const cx = seed ? seed.x : fx, cz = seed ? seed.z : fz, R = seed ? 90 : 180;
    const cand = crossList.filter((c) => Math.abs(c.x - cx) < R && Math.abs(c.z - cz) < R && Math.hypot(c.x - fx, c.z - fz) < 200);
    for (let tries = 0; tries < 6 && cand.length; tries++) {
      const c = pickOf(cand), [dx, dz] = c.dir, nx = -dz, nz = dx, h = c.w / 2 + 1.8;
      const A = [c.x - nx * h, c.z - nz * h], B = [c.x + nx * h, c.z + nz * h];
      if (blocked(A[0], A[1]) || blocked(B[0], B[1]) || river(A[0], A[1]) || river(B[0], B[1])) continue;
      const leg = (P) => {
        for (const sg of wrnd() < 0.5 ? [1, -1] : [-1, 1]) {
          const out = [];
          for (let s = 4; s <= 36; s += 4) { const x = P[0] + dx * sg * s, z = P[1] + dz * sg * s; if (blocked(x, z) || river(x, z) || inLiveP(x, z)) break; out.push([x, z]); }
          if (out.length >= 3) return out;
        }
        return null;
      };
      const la = leg(A), lb = leg(B); if (!la || !lb) continue;
      const pts = la.reverse().concat([A, B], lb);
      return { pts, cross: { c, iA: la.length, iB: la.length + 1 } };
    }
    return null;
  };
  // [life] 보행자 거리·광장 길(상가)
  const footPath = (fx, fz, seed) => {
    const cand = H.foot.filter((f) => { const m = f.p[Math.floor(f.p.length / 2)]; return Math.hypot(m[0] - seed.x, m[1] - seed.z) < 120 && Math.hypot(m[0] - fx, m[1] - fz) < 200; });
    for (let tries = 0; tries < 4 && cand.length; tries++) {
      const f = pickOf(cand), pts = [];
      for (let i = 1; i < f.p.length && pts.length < 40; i++) {
        const [ax, az] = f.p[i - 1], [bx, bz] = f.p[i], L = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s < L; s += 4) {
          const x = ax + ((bx - ax) * s) / L, z = az + ((bz - az) * s) / L;
          if (blocked(x, z) || river(x, z) || inLiveP(x, z)) { if (pts.length >= 6) return pts; pts.length = 0; continue; }
          pts.push([x, z]);
        }
      }
      if (pts.length >= 6) return pts;
    }
    return null;
  };
  const riverPath = (fx, fz) => {
    if (!terrain || !terrainT) return null;
    const qq = terrain.project(fx, fz); if (!qq || qq.dist > 260) return null;
    const ax = terrainT.axis, pr = terrainT.prof, side = wrnd() < 0.5 ? 'L' : 'R', sg = side === 'L' ? -1 : 1;
    const i0 = Math.max(2, qq.i - 40 + Math.floor(wrnd() * 30)), pts = [];
    for (let i = i0; i < Math.min(ax.length - 3, i0 + 60); i += 2) {
      const a = ax[i], b = ax[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
      const w = pr['w' + side][i], toe = pr['toe' + side][i]; if (!(toe > w + 4)) { if (pts.length) break; continue; }
      const d = sg * (w + (toe - w) * 0.55), x = a[0] + dz * d, z = a[1] - dx * d;
      if (terrain.baseHeight(x, z) > -5) { if (pts.length) break; continue; }
      if (cars?._inLive(x, z)) { if (pts.length) break; continue; }
      pts.push([x, z]);
    }
    return pts.length >= 10 ? pts : null;
  };
  const kinds = {};
  const placeWalker = (w, fx, fz) => {
    let path = null, cross = null, kind = null;
    if (wrnd() < 0.12) { path = riverPath(fx, fz); kind = 'river'; }
    if (!path) {
      const seed = pickSeed(fx, fz), qq = wrnd();
      kind = seed ? seed.kind : 'street';
      if (qq < 0.3) { const cp = crossingPath(fx, fz, seed); if (cp) { path = cp.pts; cross = cp.cross; kind += '+cross'; } }
      if (!path && seed && seed.kind === 'shop' && qq < 0.65) { path = footPath(fx, fz, seed); if (path) kind += '+foot'; }
      if (!path) path = sidewalkPath(fx, fz, seed);
    }
    if (w.kind) kinds[w.kind] = (kinds[w.kind] || 1) - 1;
    w.path = path; w.kind = path ? kind : null;
    if (!path) { w.mesh.visible = false; return; }
    kinds[kind] = (kinds[kind] || 0) + 1;
    const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    w.cum = cum; w.L = cum[cum.length - 1]; w.s = wrnd() * w.L; w.dir = wrnd() < 0.5 ? 1 : -1; w.y = null; w.mesh.visible = true;
    w.cross = cross ? { c: cross.c, sIn: cum[cross.iA], sOut: cum[cross.iB] } : null;
    if (w.cross && w.s > w.cross.sIn && w.s < w.cross.sOut) w.s = w.dir > 0 ? w.cross.sIn - 1 : w.cross.sOut + 1; // 차도 위에서 시작하지 않음
    { const [x, z] = sampleW(w, w.s); w.mesh.position.x = x; w.mesh.position.z = z; } // 다음 거리 검사가 옛 위치로 재배치하지 않게
  };
  const sampleW = (w, s) => {
    let i = 1; while (i < w.cum.length - 1 && w.cum[i] < s) i++;
    const a = w.path[i - 1], b = w.path[i], L = w.cum[i] - w.cum[i - 1] || 1, k = (s - w.cum[i - 1]) / L;
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, (b[0] - a[0]) / L, (b[1] - a[1]) / L];
  };
  const WALK_R = 200, SHOW_R = 140, LOD_R = 55;
  let wAcc = 0;
  function updateWalkers(dt, fx, fz) {
    wAcc += dt;
    let have = 0; for (const w of walkers) if (w.path) have++;
    const check = wAcc > 1 || have < walkers.length / 2; if (check) wAcc = 0; // 처음 채울 땐 매 프레임
    let placed = 0;
    crowd.begin();
    for (const w of walkers) {
      if (!w.path) { if (check && placed++ < 12) placeWalker(w, fx, fz); continue; }
      const p = w.mesh.position;
      if (check && Math.hypot(p.x - fx, p.z - fz) > WALK_R) { if (placed++ < 12) placeWalker(w, fx, fz); continue; }
      let v = 0;
      if (w.idle > 0) w.idle -= dt;
      else {
        v = w.speed; let ns = w.s + w.dir * v * dt;
        const X = w.cross;
        if (X && X.c.sig) { // 보행 신호: 초록이 아니면 횡단보도 앞에서 기다림
          const go = crossings.pedLight(X.c) === 'green';
          if (!go && w.dir > 0 && w.s <= X.sIn && ns > X.sIn) { ns = X.sIn; v = 0; }
          if (!go && w.dir < 0 && w.s >= X.sOut && ns < X.sOut) { ns = X.sOut; v = 0; }
        }
        w.s = ns;
        if (w.s <= 0 || w.s >= w.L) { w.s = Math.max(0, Math.min(w.L, w.s)); w.dir *= -1; w.idle = 1 + wrnd() * 3; }
      }
      const [x, z, dx, dz] = sampleW(w, w.s);
      const y = gy(x, z, w.y ?? 0); w.y = y;
      p.set(x, y, z); w.mesh.rotation.y = Math.atan2(dx * w.dir, dz * w.dir);
      const d = Math.hypot(x - fx, z - fz), near = d < SHOW_R; w.mesh.visible = near;
      if (near) { animateAvatar(w.mesh, v, dt); crowd.add(w.mesh, w.parts, d > LOD_R); }
    }
    crowd.end();
  }

  // ---------- [life] 주차된 Steel Truck: 단지 주차 통로(서비스 도로) 옆 주차칸 / 이면도로 길가 ----------
  // 서비스 도로는 차량 시뮬 그래프 밖이라 주행 차량과 겹치지 않는다. 코리더 차도에서는 3m 이상 떨어진 곳만.
  const parked = [];
  let pAt = null, pAcc = 99;
  const HL = DIM.L / 2 + 0.2, HW = DIM.W / 2 + 0.2;
  function driveClear(x, z) {
    let best = Infinity; const c0 = Math.floor(x / CELL), r0 = Math.floor(z / CELL);
    for (let i = c0 - 1; i <= c0 + 1; i++) for (let j = r0 - 1; j <= r0 + 1; j++) for (const e of cars.cells.get(i + ',' + j) || []) {
      const a = cars.nodes[e.from], b = cars.nodes[e.to];
      if (Math.min(a.x, b.x) > x + 40 || Math.max(a.x, b.x) < x - 40 || Math.min(a.z, b.z) > z + 40 || Math.max(a.z, b.z) < z - 40) continue;
      best = Math.min(best, segDist(x, z, a.x, a.z, b.x, b.z) - cars.ways[e.way].w / 2);
    }
    return best;
  }
  function tryPark(svc, fx, fz, minD) {
    const r = svc[Math.floor(wrnd() * svc.length)], i = 1 + Math.floor(wrnd() * (r.p.length - 1));
    const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], L = Math.hypot(bx - ax, bz - az); if (L < 8) return null;
    const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx, s = 3 + wrnd() * (L - 6), side = wrnd() < 0.5 ? -1 : 1;
    const stall = wrnd() < 0.6; // 주차칸(통로에 수직, 앞머리가 통로 쪽) / 길가 평행 주차
    const off = stall ? r.w / 2 + 0.9 + HL : r.w / 2 + 0.3;
    const x = ax + dx * s + nx * off * side, z = az + dz * s + nz * off * side;
    const hx = stall ? -nx * side : dx * (wrnd() < 0.5 ? 1 : -1), hz = stall ? -nz * side : dz * (wrnd() < 0.5 ? 1 : -1);
    if (Math.hypot(x - fx, z - fz) > 260 || Math.hypot(x - fx, z - fz) < minD || inLiveP(x, z, 30) || river(x, z)) return null;
    for (const o of parked) if (Math.hypot(o.x - x, o.z - z) < 7) return null;
    const rx = hz, rz = -hx; // 오른쪽
    for (const [u, v] of [[0, 0], [HL, HW], [HL, -HW], [-HL, HW], [-HL, -HW], [HL, 0], [-HL, 0]]) {
      const px = x + hx * u + rx * v, pz = z + hz * u + rz * v;
      if (world.isBlocked?.(px, pz, 0.2) || river(px, pz)) return null;
      if (stall && world.onRoad?.(px, pz)) return null;
    }
    if (driveClear(x, z) < (stall ? HL + 1 : HW + 3)) return null;
    const y = gy(x, z, 0), paint = pickTruckPaint(wrnd());
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.05, z), new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(hx, hz)), one);
    return { x, z, key: paint.key, matrix: m, color: colorOf(paint.color), mode: stall ? 'lot' : 'roadside' };
  }
  function updateParked(dt, fx, fz) {
    if (!TPARK || !cars || !hints) return;
    pAcc += dt;
    const moved = pAt && Math.hypot(fx - pAt.x, fz - pAt.z) > 120;
    if (!(moved || (pAcc > 3 && parked.length < TPARK))) return;
    pAcc = 0;
    const initial = !pAt || Math.hypot(fx - pAt.x, fz - pAt.z) > 600;
    pAt = { x: fx, z: fz };
    for (let i = parked.length - 1; i >= 0; i--) if (initial || Math.hypot(parked[i].x - fx, parked[i].z - fz) > 280) parked.splice(i, 1);
    const svc = hintsNear(fx, fz).svc.filter((r) => { const m = r.p[Math.floor(r.p.length / 2)]; return Math.hypot(m[0] - fx, m[1] - fz) < 270; });
    if (!svc.length) return;
    for (let guard = 0; parked.length < TPARK && guard < TPARK * 40; guard++) { const p = tryPark(svc, fx, fz, initial ? 0 : 90); if (p) parked.push(p); }
  }

  const list = [];
  function render(src, extra = null) {
    let n = 0;
    for (const t of src) {
      if (t.parked) continue;
      const o = t.mesh; q.setFromAxisAngle(up, o.rotation.y); sc.setScalar(o.scale.x);
      const e = list[n] || (list[n] = { key: '', matrix: new THREE.Matrix4(), color: null }); n++;
      e.matrix.compose(o.position, q, sc); e.key = t.taxi || t.truck ? t.liv : 'car'; e.color = colorOf(t.color);
    }
    list.length = n;
    inst.write(extra?.length ? list.concat(extra) : list);
  }
  // [ride] 시점이 정자 안: 호출 택시·정자에서 내려 준 택시만. 그릴 것이 있으면 true (보행 NPC·주차 트럭은 그리지 않음)
  function updateLive(dt, fx, fz) {
    if (!cars?.jz) return false;
    const act = cars.updateLive(dt, fx, fz);
    if (!act.length && !liveShown) return false;
    if (!liveShown) { for (const w of walkers) w.mesh.visible = false; crowd.begin(); crowd.end(); } // 멈춘 코리더 보행 NPC 는 숨김(밖으로 나가면 다시 배치)
    render(act); liveShown = act.length > 0;
    return liveShown;
  }
  let liveShown = false;
  function update(dt, fx, fz) {
    liveShown = false; hAcc += dt;
    if (cars) {
      cars.tick(dt, fx, fz);
      updateParked(dt, fx, fz);
      render(cars.list, parked);
    }
    updateWalkers(dt, fx, fz);
  }
  return {
    group, update, updateLive, cars, walkers, parked,
    stats: () => ({
      cars: cars ? cars.list.filter((t) => !t.parked).length : 0, taxis: cars ? cars.list.filter((t) => t.taxi && !t.parked).length : 0,
      trucks: cars ? cars.list.filter((t) => t.truck && !t.parked).length : 0, trucksParked: parked.length, trucksLot: parked.filter((p) => p.mode === 'lot').length,
      walkers: walkers.filter((w) => w.path).length, walkersVisible: walkers.filter((w) => w.mesh.visible).length, walkerKinds: Object.fromEntries(Object.entries(kinds).filter(([, v]) => v > 0)),
      carParts: inst.parts.size, crowdParts: crowd.parts.size, jzWays: merged.added, jzSigs: liveSigs.length,
    }),
  };
}
