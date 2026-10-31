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
import { isEvening, watchEvening } from '../evening.js';

const BOX = 380, SPAWN_MIN = 140, CELL = 250;
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
  constructor({ drive, transit, world, exits, liveBox, count, taxiShare, seed = 11, liveSigs = [] }) {
    super(null, null, { drive, data: { meta: { bboxLocal: { x0: 0, x1: 0, z0: 0, z1: 0 } } }, transit, world, count: 0, seed });
    this.live = liveBox; this.box = { x0: 0, x1: 0, z0: 0, z1: 0 }; this.focus = { x: 0, z: 0 };
    this.exits = exits || []; this.count = count; this.taxiShare = taxiShare;
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
      const taxi = i < Math.round(this.count * this.taxiShare);
      t = { i, taxi, liv: taxi ? pickLivery(this.rnd()) : 'car', color: CAR_COLORS[Math.floor(this.rnd() * CAR_COLORS.length)], mesh: new THREE.Object3D(), v: 0, lane: 0, state: 'drive', cool: 0, lat: 0, latT: 0, age: 0, heading: 0 };
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
    const n = Math.round(this.count * this.taxiShare);
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
  const addTemplate = (key, root, { recolor = null, noSign = false } = {}) => {
    root.updateMatrixWorld(true);
    const list = [];
    root.traverse((o) => {
      if (!o.isMesh || o.isSprite) return;
      const evening = !!o.parent && o.parent.name === 'eveningLights';
      const multi = Array.isArray(o.material);
      if (multi && noSign) return;
      const isCab = o.geometry.type === 'ExtrudeGeometry';
      const lambert = !multi && o.material.isMeshLambertMaterial && !isCab;
      const pk = lambert ? 'L|' + o.geometry.uuid : 'M|' + o.geometry.uuid + '|' + (multi ? o.material.map((m) => m.uuid).join(',') : o.material.uuid);
      if (!parts.has(pk)) parts.set(pk, { geo: o.geometry, mat: lambert ? null : o.material, lambert, cast: o.castShadow, evening, src: o, n: 0 });
      let color = lambert ? o.material.color.clone() : null;
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
        const mat = P.lambert ? new THREE.MeshLambertMaterial({ color: '#ffffff' }) : P.mat;
        const im = new THREE.InstancedMesh(P.geo, mat, cap * (cnt.get(pk) || 1));
        im.count = 0; im.castShadow = P.cast; im.frustumCulled = false;
        if (P.lambert) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * (cnt.get(pk) || 1) * 3), 3);
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
          if (P.lambert) P.im.setColorAt(P.n, it.color === 'BODY' ? color : it.color);
          P.n++;
        }
      }
      const eve = isEvening();
      for (const P of parts.values()) {
        P.im.count = P.n; P.im.visible = P.n > 0 && (!P.evening || eve);
        if (!P.lambert && P.src.material !== P.im.material && !Array.isArray(P.src.material)) P.im.material = P.src.material; // 저녁 캐빈 유리 등 템플릿 재질 교체 따라감
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

export function createCorridorTraffic(root, { drive, crossings, terrain, terrainT, world, stations, liveBox, getBuses, params, overlay, liveDrive = null, liveCrossings = null }) {
  const group = new THREE.Group(); group.name = 'corridorTraffic'; root.add(group);
  // [ride] 기본 48대 중 택시 비율 0.46(≈22대, 이전 36대×0.3≈11대의 두 배). 인스턴싱이라 draw call 은 대수와 무관. ?ccars= / ?ctaxi=(0~1)
  const COUNT = Math.max(0, Math.min(80, Number(params?.get?.('ccars') ?? 48) || 0));
  const SHARE = Math.max(0, Math.min(1, Number(params?.get?.('ctaxi') ?? 0.46)));
  const WALKERS = Math.max(0, Math.min(24, Number(params?.get?.('cwalkers') ?? 10) || 0));
  const exits = stations.flatMap((s) => s.exits || []);
  const transit = { crossings: crossings.crossings, pedLight: crossings.pedLight, source: { vehicles: getBuses } };
  const inLB = (c) => liveBox && c.x >= liveBox.x0 && c.x <= liveBox.x1 && c.z >= liveBox.z0 && c.z <= liveBox.z1;
  const merged = liveDrive ? mergeLiveDrive(drive, liveDrive, liveBox) : { drive, added: 0 };
  const liveSigs = merged.added ? (liveCrossings || []).filter((c) => c.sig && inLB(c)) : [];
  const cars = COUNT ? new CorridorCars({ drive: merged.drive, transit, world, exits, liveBox, count: COUNT, taxiShare: SHARE, liveSigs }) : null;

  // 템플릿: 택시 리버리 5종 + 일반 차량(표시등 없는 세단, 차체 색은 인스턴스별)
  const inst = buildInstancer(group, COUNT || 1);
  for (const liv of Object.keys(TAXI_LIVERIES)) inst.addTemplate(liv, createTaxi(liv));
  const carT = createTaxi('white');
  const bodyMat = carT.children.find((o) => o.isMesh)?.material;
  inst.addTemplate('car', carT, { noSign: true, recolor: new Map([[bodyMat, 'BODY']]) });
  inst.finalize();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), col = new Map();
  const colorOf = (c) => (col.has(c) ? col.get(c) : col.set(c, new THREE.Color(c)).get(c));

  // ---------- 보행 NPC ----------
  const gy = (x, z, ref) => (terrain ? terrain.getGroundHeight(x, z, ref) : 0);
  const walkers = [];
  for (let i = 0; i < WALKERS; i++) {
    const look = { ...LOOKS[i % LOOKS.length], skin: SKINS[i % SKINS.length] };
    const mesh = createAvatar(look); mesh.visible = false; group.add(mesh);
    walkers.push({ mesh, path: null, s: 0, dir: 1, speed: 0.9 + ((i * 37) % 10) / 20, idle: 0 });
  }
  let wr = 12345; const wrnd = () => ((wr = (wr * 16807) % 2147483647) / 2147483647);
  const blocked = (x, z) => world.onRoad?.(x, z) || world.isBlocked?.(x, z, 0.4);
  const sidewalkPath = (fx, fz) => {
    if (!cars) return null;
    for (let tries = 0; tries < 24; tries++) {
      const e = cars._pickEdge(true); if (!e) return null;
      const w = cars.ways[e.way]; if (/motorway|trunk/.test(w.k)) continue;
      const a = cars.nodes[e.from], b = cars.nodes[e.to], L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 25) continue;
      const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L, side = wrnd() < 0.5 ? -1 : 1, off = w.w / 2 + 1.8;
      const pts = [];
      for (let s = 2; s <= Math.min(L - 2, 140); s += 4) {
        const x = a.x + dx * s - dz * off * side, z = a.z + dz * s + dx * off * side;
        const xi = x + dz * 0.8 * side, zi = z - dx * 0.8 * side; // 차도 쪽 여유 0.8m
        if (blocked(x, z) || world.onRoad?.(xi, zi) || cars._inLive(x, z) || (terrain && terrain.renderHeight(x, z) < -0.3)) break;
        pts.push([x, z]);
      }
      if (pts.length >= 6 && Math.hypot(pts[0][0] - fx, pts[0][1] - fz) < 260) return pts;
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
  const placeWalker = (w, fx, fz) => {
    w.path = (wrnd() < 0.3 ? riverPath(fx, fz) : null) || sidewalkPath(fx, fz);
    if (!w.path) { w.mesh.visible = false; return; }
    const cum = [0]; for (let i = 1; i < w.path.length; i++) cum.push(cum[i - 1] + Math.hypot(w.path[i][0] - w.path[i - 1][0], w.path[i][1] - w.path[i - 1][1]));
    w.cum = cum; w.L = cum[cum.length - 1]; w.s = wrnd() * w.L; w.dir = wrnd() < 0.5 ? 1 : -1; w.y = null; w.mesh.visible = true;
  };
  const sampleW = (w, s) => {
    let i = 1; while (i < w.cum.length - 1 && w.cum[i] < s) i++;
    const a = w.path[i - 1], b = w.path[i], L = w.cum[i] - w.cum[i - 1] || 1, k = (s - w.cum[i - 1]) / L;
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, (b[0] - a[0]) / L, (b[1] - a[1]) / L];
  };
  const WALK_R = 200;
  let wAcc = 0;
  function updateWalkers(dt, fx, fz) {
    wAcc += dt;
    const check = wAcc > 1; if (check) wAcc = 0;
    for (const w of walkers) {
      if (!w.path) { if (check) placeWalker(w, fx, fz); continue; }
      const p = w.mesh.position;
      if (check && Math.hypot(p.x - fx, p.z - fz) > WALK_R) { placeWalker(w, fx, fz); continue; }
      let v = 0;
      if (w.idle > 0) w.idle -= dt;
      else { v = w.speed; w.s += w.dir * v * dt; if (w.s <= 0 || w.s >= w.L) { w.s = Math.max(0, Math.min(w.L, w.s)); w.dir *= -1; w.idle = 1 + wrnd() * 3; } }
      const [x, z, dx, dz] = sampleW(w, w.s);
      const y = gy(x, z, w.y ?? 0); w.y = y;
      p.set(x, y, z); w.mesh.rotation.y = Math.atan2(dx * w.dir, dz * w.dir);
      const near = Math.hypot(x - fx, z - fz) < 140; w.mesh.visible = near;
      if (near) animateAvatar(w.mesh, v, dt);
    }
  }

  const list = [];
  function render(src) {
    let n = 0;
    for (const t of src) {
      if (t.parked) continue;
      const o = t.mesh; q.setFromAxisAngle(up, o.rotation.y); sc.setScalar(o.scale.x);
      const e = list[n] || (list[n] = { key: '', matrix: new THREE.Matrix4(), color: null }); n++;
      e.matrix.compose(o.position, q, sc); e.key = t.taxi ? t.liv : 'car'; e.color = colorOf(t.color);
    }
    list.length = n;
    inst.write(list);
  }
  // [ride] 시점이 정자 안: 호출 택시·정자에서 내려 준 택시만. 그릴 것이 있으면 true
  function updateLive(dt, fx, fz) {
    if (!cars?.jz) return false;
    const act = cars.updateLive(dt, fx, fz);
    if (!act.length && !liveShown) return false;
    if (!liveShown) for (const w of walkers) w.mesh.visible = false; // 멈춘 코리더 보행 NPC 는 숨김(밖으로 나가면 다시 배치)
    render(act); liveShown = act.length > 0;
    return liveShown;
  }
  let liveShown = false;
  function update(dt, fx, fz) {
    liveShown = false;
    if (cars) {
      cars.tick(dt, fx, fz);
      render(cars.list);
    }
    updateWalkers(dt, fx, fz);
  }
  return {
    group, update, updateLive, cars, walkers,
    stats: () => ({ cars: cars ? cars.list.filter((t) => !t.parked).length : 0, taxis: cars ? cars.list.filter((t) => t.taxi && !t.parked).length : 0, walkersVisible: walkers.filter((w) => w.mesh.visible).length, carParts: inst.parts.size, jzWays: merged.added, jzSigs: liveSigs.length }),
  };
}
