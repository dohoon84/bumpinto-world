// [migeum-npc] 미금역 일대 보행·차량 NPC (?migeumnpc=0 끔, ?migeum=0 이면 같이 꺼짐 → 정자·코리더는 기존 그대로)
//   보행: 판교 #11(pangyoNpc.js)과 같은 방식. 몸은 코리더 보행 NPC 와 같은 아바타(createAvatar/animateAvatar)·같은 외모 옵션이고
//         코리더 보행 NPC 의 crowd(부품별 InstancedMesh)에 같이 등록된다(traffic.js extraCrowd 훅) → draw call 추가 0.
//         소품·라벨·말풍선·로고 없음. 위치: 미금역 출입구 1–8번 앞 · 보도(migeum/npc.json walk) · 1층 상가 앞(stops)
//         밀도: migeumNpcData.js 밀도표(게임 시계). 시점 140m 밖은 그리지 않고 230m 밖은 재배치. 미금 박스에서 멀면 아무것도 안 함
//   차량: jz-traffic(정자 일반 차량, src/entities/jzTraffic.js JzCars)을 그대로 상속해 '미금 차도 그래프'로 돌린다.
//         그래프 = 공유 migeum/roads.json 의 '미금 몫' 조각(migeumRoads.js migeumLocalGraph — 코리더 차량·택시(#24)와 같은 파일·같은 주인 규칙).
//         ?migeumtaxi 켜짐(기본): 돌마로·성남대로 남쪽 연장 7 way 는 코리더 차량 몫이라 빠지고 그 끝이 포털. ?migeumtaxi=0 이면 미금 차량이 맡는다.
//         같은 차로·일방통행·커브 감속·앞차 추종·교차로 양보·무겹침 안전망·배달 오토바이 정차. 영역 = 미금 박스(meta.box):
//         박스 경계 노드와 코리더 차량이 다니는 큰길과 만나는 노드는 '포털' — 그 앞에서 서서히 사라지고 박스 안 다른 곳에 나타남.
//         코리더 차량·버스는 장애물로 본다(읽기만, 양보). 렌더: 11종 모델을 BatchedMesh 1개(공유 재질·인스턴스 색) → draw call 1
//         처음 미금 박스 근처(250m)에 올 때 npc.json 을 받아 만든다(지연 생성 — 정자에서 시작하면 요청·메시 없음)
import * as THREE from 'three';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { JzCars, densityFor } from '../entities/jzTraffic.js';
import { parseTrafficFix } from '../trafficFix.js'; // [traffic-fix]
import { KINDS, kindGeometry } from '../entities/vehicleKinds.js';
import { watchEvening } from '../evening.js';
import { gameHour } from '../weather.js';
import { MIGEUM_DIR } from './migeum.js';
import { MIGEUM_ROADS_FILE, migeumCorridorRoadsOn, migeumLocalGraph } from './migeumRoads.js'; // [migeum-roads]
import { MAX_PEDS, pedDensityAt, parseMigeumCars } from './migeumNpcData.js';

export const MIGEUM_NPC_FILE = MIGEUM_DIR + 'npc.json';
export function migeumNpcEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search);
  return q.get('migeum') !== '0' && q.get('migeumnpc') !== '0';
}
// 성능 측정용: ?migeumnpcn=N → 시간대와 무관하게 N명 상시(배우 풀도 N). 평소엔 없음
export function migeumNpcForce(search = typeof location !== 'undefined' ? location.search : '') {
  const n = parseInt(new URLSearchParams(search).get('migeumnpcn'), 10);
  return n > 0 ? Math.min(n, 300) : 0;
}
const boxDist = (b, x, z) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
const WAKE_R = 250;

// npc.json(보도·상가) + roads.json(공유 차도 그래프) → { ...npc, drive: 미금 몫 그래프 } . ext: 미금 연장을 코리더 차량이 맡는가
export function withMigeumDrive(npc, roads, { ext = migeumCorridorRoadsOn() } = {}) {
  if (!npc || !roads?.ways?.length) return null;
  const drive = migeumLocalGraph(roads, { ext });
  return drive.nodes.length ? { ...npc, drive, ext } : null;
}

// ---------- 공유 로더: npc.json · roads.json 은 박스 근처에 처음 올 때 한 번 ----------
export function migeumNpcLoader({ mg, baseUrl = '', fetchJson = null, ext = migeumCorridorRoadsOn() }) {
  const box = mg?.meta?.box; let p = null, data = null;
  const get = fetchJson || ((f) => fetch(baseUrl + f).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return {
    box, ext, get data() { return data; },
    near: (x, z, r = WAKE_R) => !!box && boxDist(box, x, z) < r,
    load() { return (p ||= Promise.all([get(MIGEUM_NPC_FILE), get(MIGEUM_ROADS_FILE)]).then(([j, roads]) => (data = withMigeumDrive(j, roads, { ext })))); },
  };
}

// ---------- 보행 NPC ----------
const TOPS = ['#f4f4f2', '#2f3a4a', '#c9ced6', '#e8e0d2', '#7d8b99', '#a7b3a0', '#d35454', '#5d7fb5', '#f0c75e', '#3b3f45', '#9b6fb0', '#ffffff'];
const PANTS = ['#2b2f36', '#3c4350', '#5a6170', '#8a7f6c', '#34495e', '#22262b', '#4b5f86'];
const SKINS = ['#f2d0b0', '#e8c4a8', '#f6d7c3', '#d7a888'];
// 코리더 보행 NPC(lookFor)와 같은 외모 옵션만 → crowd 부품 종류가 늘지 않음
function townLook(r) {
  const pick = (a) => a[Math.floor(r() * a.length)], f = r() < 0.52;
  const look = { color: pick(TOPS), pants: pick(PANTS), gender: f ? 'f' : 'm', hair: f ? pick(['long', 'pony', 'short']) : 'short', skin: pick(SKINS) };
  if (r() < 0.3) look.bag = pick(['#2d3436', '#8e6e53', '#636e72']);
  if (r() < 0.18) look.glasses = true;
  if (r() < 0.1) look.hat = pick(['#222222', '#c0392b', '#2c3e50']);
  if (r() < 0.22) look.top = pick(['short', 'hoodie']);
  return look;
}
const TS = 500;
const tileKey = (x, z) => `${Math.floor(x / TS)}_${Math.floor(z / TS)}`;
const SHOW_R = 140, LOD_R = 55, PLACE_R = 170, REPLACE_R = 230;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// opts: mg(migeum/index.json) · loader · terrain · isFree(x,z) · freeSpot(x,z) · tileReady(key) · getHour · seed · count
export function createMigeumPeds({ mg, loader, terrain = null, isFree = () => true, freeSpot = (x, z) => ({ x, z }), tileReady = () => true, getHour = gameHour, seed = 5151, count = 0, force = migeumNpcForce() } = {}) {
  count = force || count || MAX_PEDS;
  const dens = (h) => { const d = pedDensityAt(h); return force ? { ...d, count: force } : d; };
  let rs = seed; const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const exits = (mg?.stations || []).flatMap((s) => s.exits || []);
  let spots = null;
  const mk = (x, z, extra) => ({ x, z, key: tileKey(x, z), at: null, load: 0, ...extra });
  const buildSpots = (d) => ({ exit: exits.map((e) => mk(e.x, e.z, { ref: e.ref })), walk: (d?.walk || []).map(([x, z]) => mk(x, z)), shop: (d?.stops || []).map(([x, z]) => mk(x, z)) });
  const ready = (s, maxD) => {
    if (!tileReady(s.key)) return null;
    if (s.at == null) { const p = freeSpot(s.x, s.z); s.at = Math.hypot(p.x - s.x, p.z - s.z) < maxD && isFree(p.x, p.z) ? p : false; }
    return s.at || null;
  };
  const TURNS = [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.35, -1.35, 1.8, -1.8];
  function freePath(x0, z0, step = 2.5, n = 20) {
    let a = rnd() * Math.PI * 2; const pts = [[x0, z0]]; let x = x0, z = z0;
    for (let i = 0; i < n; i++) {
      let moved = false;
      for (const t of TURNS) {
        const b = a + t + (rnd() - 0.5) * 0.12, nx = x + Math.cos(b) * step, nz = z + Math.sin(b) * step;
        if (isFree(nx, nz) && isFree(x + Math.cos(b) * step * 2, z + Math.sin(b) * step * 2) && isFree((x + nx) / 2, (z + nz) / 2)) { a = b; x = nx; z = nz; pts.push([x, z]); moved = true; break; }
      }
      if (!moved) break;
    }
    return pts.length >= 6 ? pts : null;
  }
  const actors = [];
  for (let i = 0; i < count; i++) {
    const mesh = createAvatar(townLook(rnd)); mesh.visible = false;
    actors.push({ i, mesh, parts: null, path: null, cum: null, L: 0, s: 0, dir: 1, speed: 1, idle: 0, y: 0, leaving: false, shown: false, kind: null, spot: null });
  }
  function chooseKind(mix) { let r = rnd(); for (const [k, w] of Object.entries(mix)) { r -= w; if (r <= 0) return k; } return 'exit'; }
  function place(a, fx, fz, D) {
    const near = (s) => Math.abs(s.x - fx) < PLACE_R && Math.abs(s.z - fz) < PLACE_R;
    for (let t = 0; t < 4; t++) {
      const kind = t < 3 ? chooseKind(D.mix) : 'walk';
      let sp = null;
      if (kind === 'walk') { // 보도: 시점 근처 지점 중 무작위(몇 번 뽑아 보고 가까운 것)
        const L = spots.walk; if (!L.length) continue;
        for (let k = 0; k < 12 && !sp; k++) { const c = L[Math.floor(rnd() * L.length)]; if (near(c)) sp = c; }
        if (!sp) { const c = L.filter(near); if (c.length) sp = c[Math.floor(rnd() * c.length)]; }
      } else {
        let best = Infinity;
        for (const c of spots[kind]) if (near(c)) { const n = c.load + rnd() * 0.9; if (n < best) { best = n; sp = c; } }
      }
      if (!sp) continue;
      const at = ready(sp, kind === 'shop' ? 40 : 12); if (!at) continue;
      const path = freePath(at.x, at.z, 2.5, kind === 'exit' ? 10 : kind === 'shop' ? 12 : 22); // 출입구·상가 앞은 짧게 오가며 붐비게
      if (!path) continue;
      if (rnd() < 0.5) path.reverse(); // 절반은 그 장소로 '향해' 걷는다
      const cum = [0]; for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]));
      if (a.spot) a.spot.load--; a.spot = sp; sp.load++;
      Object.assign(a, { path, cum, L: cum[cum.length - 1], s: rnd() * cum[cum.length - 1], dir: rnd() < 0.5 ? 1 : -1, kind, idle: 0, leaving: false });
      a.speed = (kind === 'exit' && (D.period === 'morning' || D.period === 'evening') ? 1.2 : 0.95) + rnd() * 0.3;
      return true;
    }
    a.path = null; return false;
  }
  const sample = (a, s) => {
    let k = 1; while (k < a.cum.length - 1 && a.cum[k] < s) k++;
    const p = a.path[k - 1], q = a.path[k], L = a.cum[k] - a.cum[k - 1] || 1, f = (s - a.cum[k - 1]) / L;
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, (q[0] - p[0]) / L, (q[1] - p[1]) / L];
  };
  const hide = (a) => { if (a.spot) { a.spot.load--; a.spot = null; } a.path = null; a.shown = false; a.mesh.visible = false; };
  let D = dens(getHour()), dAcc = 99, chk = 99, asleep = true;
  const stats = { active: 0, placed: 0, visible: 0, period: D.period, target: D.count, byKind: {}, cpuMs: 0, pool: count, asleep: true, extraDraws: 0 };
  return {
    actors, stats,
    get spots() { return spots; },
    register(crowd) { for (const a of actors) a.parts = crowd.register(a.mesh); },
    render(crowd, dt, fx, fz) {
      const t0 = now();
      // 미금 박스에서 멀면(지연 영역) 잠잔다: 배우를 숨기고 갱신 안 함
      if (!loader.near(fx, fz)) { if (!asleep) { for (const a of actors) hide(a); asleep = stats.asleep = true; stats.active = stats.placed = stats.visible = 0; } return; }
      if (!loader.data) { loader.load(); return; }
      if (!spots) spots = buildSpots(loader.data);
      asleep = stats.asleep = false;
      dAcc += dt; chk += dt;
      if (dAcc > 2) { dAcc = 0; D = dens(getHour()); stats.period = D.period; stats.target = D.count; }
      let have = 0; for (const a of actors) if (a.path) have++;
      const check = chk > 1 || have < D.count / 2; if (check) chk = 0;
      let placedNow = 0, act = 0, vis = 0, placed = 0; const byKind = {};
      for (const a of actors) {
        const want = a.i < D.count;
        if (!want && a.path && !a.leaving) a.leaving = true;
        if (a.leaving && (!a.shown || Math.hypot(a.mesh.position.x - fx, a.mesh.position.z - fz) > 60)) hide(a);
        if (!a.path) {
          if (want && check && placedNow < 4) { placedNow++; place(a, fx, fz, D); }
          if (!a.path) { if (a.mesh.visible) a.mesh.visible = false; a.shown = false; continue; }
        }
        if (want) act++;
        let v = 0;
        if (a.idle > 0) a.idle -= dt;
        else {
          v = a.speed; a.s += a.dir * v * dt;
          if (a.s <= 0 || a.s >= a.L) {
            a.s = Math.max(0, Math.min(a.L, a.s)); a.dir *= -1; a.idle = (a.kind === 'shop' ? 3 : 1) + rnd() * 4;
            if (a.leaving) { hide(a); continue; }
          }
        }
        const [x, z, dx, dz] = sample(a, a.s);
        if (check && Math.hypot(x - fx, z - fz) > REPLACE_R) { hide(a); continue; }
        const y = terrain ? terrain.getGroundHeight(x, z, a.y) : 0; a.y = y;
        a.mesh.position.set(x, y, z); a.mesh.rotation.y = Math.atan2(dx * a.dir, dz * a.dir);
        placed++; byKind[a.kind] = (byKind[a.kind] || 0) + 1;
        const d = Math.hypot(x - fx, z - fz), near = d < SHOW_R;
        a.mesh.visible = near; a.shown = near;
        if (!near) continue;
        vis++;
        animateAvatar(a.mesh, v, dt);
        crowd.add(a.mesh, a.parts, d > LOD_R);
      }
      Object.assign(stats, { active: act, placed, visible: vis, byKind });
      stats.cpuMs = stats.cpuMs * 0.95 + (now() - t0) * 0.05;
    },
    dispose() { for (const a of actors) hide(a); },
  };
}

// 코리더 crowd 훅(extraCrowd)은 하나라서, 판교·미금 보행 NPC 를 묶는다(둘 중 하나만 있으면 그대로)
export function combineCrowds(list) {
  const xs = list.filter(Boolean);
  if (xs.length <= 1) return xs[0] || null;
  return {
    parts: xs,
    get stats() { return Object.assign({}, xs[0].stats, { more: xs.slice(1).map((x) => x.stats) }); }, // 첫째(판교) 모양 그대로 + 나머지
    register(crowd) { for (const x of xs) x.register(crowd); },
    render(crowd, dt, fx, fz) { for (const x of xs) x.render(crowd, dt, fx, fz); },
    dispose() { for (const x of xs) x.dispose?.(); },
  };
}

// ---------- 차량 NPC ----------
let PENDING = null; // super() 안에서 _inBox 가 불리므로 포털 표를 잠깐 여기 둔다
const pkey = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);
export class MigeumCars extends JzCars {
  constructor({ npc, mg = null, transit = null, world = null, base, hour = () => gameHour(), extra = null, seed = 41, fix = true }) {
    const box = npc.meta.box, st = npc.meta.station;
    const drive = { nodes: npc.drive.nodes, ways: npc.drive.ways, exits: (mg?.stations || []).flatMap((s) => s.exits || []) };
    PENDING = new Map((npc.drive.portals || []).map((i, k) => [pkey(npc.drive.nodes[i][0], npc.drive.nodes[i][1]), npc.drive.clear?.[k] || 0]));
    try {
      super({ drive, data: { meta: { bboxLocal: box }, station: st }, transit, world, base, hour, stops: npc.stops || [], extra, seed, fix }); // [traffic-fix] ?trafficfix=0 → 정자와 같이 예전 동작
    } finally { this._pk = PENDING; PENDING = null; }
    this.portalCount = this._pk.size;
  }
  // 박스 안이고 포털(박스 경계·코리더 큰길과 만나는 노드)이 아니어야 '영역 안'
  _inBox(x, z, m = 0) { const pk = this._pk || PENDING; return super._inBox(x, z, Math.min(m, 0)) && !(pk && pk.has(pkey(x, z))); }
  // 코리더 몫 큰길과 만나는 포털: 차 앞머리가 그 길 띠(폭/2 + 1 m)에 닿기 전에 사라진다 → 두 시스템 차가 한 차로를 나눠 쓰지 않음
  _stepVeh(t, dt) {
    const e = t.leaving && !(t.fade > 0) ? this.nodes[t.node] : null; // 경로 끝 = 마지막에 붙인 노드(포털)
    if (e) {
      const c = this._pk.get(pkey(e.x, e.z)) || 0;
      if (c > 0 && t.cum[t.cum.length - 1] - t.s < c + 1 + (t.K?.L || 4.6) / 2) { this.stats0.portalExits = (this.stats0.portalExits || 0) + 1; this._despawn(t); if (!t.retire) this._spawnVeh(t.i, false); else t.retire = false; return; }
    }
    return super._stepVeh(t, dt);
  }
}

// 배치 재질: vehicleMaterial 과 같은 셰이더 수정(차체만 인스턴스 색 · 저녁 등 발광)을 BatchedMesh 색(getBatchingColor)으로
function batchedVehicleMaterial() {
  const eve = { value: 0 };
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uEve = eve;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float tint;\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <color_vertex>', 'vColor = vec4(1.0);\nvColor.rgb *= color.rgb;\n#ifdef USE_BATCHING_COLOR\nvColor.rgb *= mix(vec3(1.0), getBatchingColor( getIndirectIndex( gl_DrawID ) ).rgb, tint);\n#endif\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uEve;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * uEve * 1.4;');
  };
  m.customProgramCacheKey = () => 'mg-vehicle-batched-v1';
  m.userData.eve = eve;
  return m;
}

const CAR_SHOW_R = 300;
export function createMigeumTraffic(parent, opts) {
  const sim = new MigeumCars(opts);
  const group = new THREE.Group(); group.name = 'migeumTraffic'; parent?.add(group);
  const kinds = Object.keys(KINDS), geos = kinds.map((k) => kindGeometry(k));
  const nV = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const mat = batchedVehicleMaterial();
  const bm = new THREE.BatchedMesh(sim.cap, nV, 0, mat);
  bm.name = 'mg-vehicles'; bm.castShadow = true; bm.receiveShadow = false; bm.perObjectFrustumCulled = true; bm.sortObjects = false;
  const gid = {}; kinds.forEach((k, i) => { gid[k] = bm.addGeometry(geos[i]); });
  const slots = []; for (let i = 0; i < sim.cap; i++) { const id = bm.addInstance(gid.sedan); bm.setVisibleAt(id, false); slots.push(id); }
  group.add(bm);
  const release = opts.watchEvening ? opts.watchEvening((on) => { mat.userData.eve.value = on ? 1 : 0; }) : null;
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), m4 = new THREE.Matrix4();
  let drawn = 0;
  function render(fx, fz) {
    drawn = 0;
    for (let i = 0; i < slots.length; i++) {
      const t = sim.list[i], id = slots[i];
      if (!t || t.parked || (fx != null && (Math.abs(t.mesh.position.x - fx) > CAR_SHOW_R || Math.abs(t.mesh.position.z - fz) > CAR_SHOW_R))) { bm.setVisibleAt(id, false); continue; }
      if (t._gk !== t.kind) { bm.setGeometryIdAt(id, gid[t.kind]); t._gk = t.kind; }
      q.setFromAxisAngle(up, t.mesh.rotation.y); sc.setScalar(t.mesh.scale.x);
      m4.compose(t.mesh.position, q, sc); bm.setMatrixAt(id, m4); bm.setColorAt(id, t.color); bm.setVisibleAt(id, true); drawn++;
    }
    bm.visible = drawn > 0;
  }
  return {
    sim, group, mesh: bm,
    update(dt, focus) { if (focus) sim.focus = { x: focus.x, z: focus.z }; sim.update(dt); render(focus?.x, focus?.z); },
    obstacles: (x, z, R) => sim.obstacles(x, z, R),
    stats: () => ({ ...sim.counts(), drawn, drawCalls: bm.visible ? 1 : 0, nodes: sim.nodes.length, ways: sim.ways.length, portals: sim.portalCount, spawnEdges: sim.edges.length }),
    dispose() { release?.(); group.removeFromParent(); bm.dispose(); mat.dispose(); },
  };
}

// corridor/index.js 진입점: 박스 근처에 처음 오면 npc.json 을 받아 차량을 만든다. ?migeumcars=0 이면 차량만 끔
//   getLife(): 코리더 life(차량·버스 → 장애물). 잠자기: 박스에서 WAKE_R 밖이면 숨기고 갱신 안 함
export function mountMigeumNpc(parent, { mg, loader, params, world, transit = null, getLife = () => null, hour = () => gameHour() }) {
  const c = parseMigeumCars(params);
  let traffic = null, failed = false;
  const recs = new Map();
  // 코리더 차량(택시·일반·트럭) 외곽 — 미금 박스 근처 것만, 읽기만
  const extra = () => {
    const cars = getLife()?.traffic?.cars?.list || [], out = [], b = loader.box, M = 40;
    for (const t of cars) {
      if (!t || t.parked) continue; const p = t.mesh.position;
      if (p.x < b.x0 - M || p.x > b.x1 + M || p.z < b.z0 - M || p.z > b.z1 + M) continue;
      let r = recs.get(t); if (!r) recs.set(t, (r = { corridor: true, hl: t.truck ? 3.2 : 2.4, hw: t.truck ? 1.25 : 0.95 }));
      const h = t.mesh.rotation.y; r.x = p.x; r.z = p.z; r.hx = Math.sin(h); r.hz = Math.cos(h); r.v = t.v || 0; r.off = false; out.push(r);
    }
    return out;
  };
  const tr = transit || { crossings: [], pedLight: () => 'none', source: { vehicles: () => getLife()?.buses?.near || [] } };
  return {
    get traffic() { return traffic; },
    update(dt, x, z) {
      if (!c.on || failed) return;
      if (!loader.near(x, z)) { if (traffic) traffic.group.visible = false; return; }
      if (!traffic) {
        if (!loader.data) { loader.load().then((d) => { if (!d) failed = true; }); return; }
        traffic = createMigeumTraffic(parent, { npc: loader.data, mg, transit: tr, world, base: c.base, hour, extra, watchEvening, fix: parseTrafficFix(params) });
      }
      traffic.group.visible = true;
      traffic.update(Math.min(dt, 0.1), { x, z });
    },
    stats: () => (traffic ? traffic.stats() : { on: c.on, mounted: false, failed }),
    dispose() { traffic?.dispose(); traffic = null; },
  };
}
export { densityFor };
