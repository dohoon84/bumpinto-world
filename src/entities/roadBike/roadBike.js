// [roadbike] 선물함 CR·1 에어로 로드바이크. 주인만 소환/탑승. 타거나 세워 두면 다른 사람에게 보임.
//   최고 50 km/h · veh id 902 (관리자 바이크 900/901, 트럭 0~59 와 겹치지 않음) · ?roadbike=0 끔
import * as THREE from 'three';
import { createRoadBikeModel, drawComputer, RB } from './roadBikeModel.js';
import { createRoadHelmetHead } from './helmetHead.js';
import { ROADBIKE_GIFT_ID, ROADBIKE_SEED_QTY, ROADBIKE_WHITE_GIFT_ID, ROADBIKE_WHITE_SEED_QTY } from './catalog.js';

export { ROADBIKE_GIFT_ID, ROADBIKE_SEED_QTY, ROADBIKE_WHITE_GIFT_ID, ROADBIKE_WHITE_SEED_QTY, giftQtyOf } from './catalog.js';
export const ROADBIKE_VEH_ID = 902;
export const ROADBIKE_WHITE_VEH_ID = 903;
const fleet = [];
const blockers = [];
let blockHooked = false;
let cssReady = false;
const VMAX = 50 / 3.6;
const REV_V = 3 / 3.6;
const G = 9.81;
const R_MIN = 2.2;
const HL = 0.87;
const HW = 0.22;
const HULL = [[0, HL], [0, -HL], [HW, 0.45], [-HW, 0.45], [HW, -0.45], [-HW, -0.45], [HW, 0], [-HW, 0]];
const RING_R = 0.1011;

const HIP = new THREE.Vector3(0, 1.08, -0.38);
const TORSO = 1.12;
const UP_S = [0.7, 0.8, 0.6];

function isHeadPiece(c, src) {
  const u = src?.userData || {};
  if (c === u.head || c === u.eyeL || c === u.eyeR) return true;
  // 헤어 캡·모자·포니테일 등 머리 장식 (팔·몸통보다 위)
  if (c.position?.y > 1.45) return true;
  return false;
}

function buildRider(src) {
  const g = new THREE.Group();
  g.name = 'roadbike-rider';
  const upper = new THREE.Group();
  upper.position.copy(HIP);
  upper.rotation.x = TORSO;
  upper.scale.set(...UP_S);
  g.add(upper);
  const head = new THREE.Group();
  head.scale.setScalar(0.8);
  head.rotation.x = -0.1;
  g.add(head);
  const rig = src?.userData?.rig;
  const { legL, legR, armL, armR, handPhone, handUmbrella } = src?.userData || {};
  let bodyMat = null;
  let pantsMat = legL?.material;
  let skinMat = src?.userData?.head?.material || null;
  if (rig) {
    for (const c of rig.children) {
      // 팔·다리·폰·우산은 IK/헬멧으로 대체. 머리·헤어·모자는 헬멧 머리로 갈아 끼운다.
      if (c === legL || c === legR || c === armL || c === armR || c === handPhone || c === handUmbrella) continue;
      if (isHeadPiece(c, src)) continue;
      const m = c.clone();
      m.castShadow = true;
      m.position.y -= 0.38;
      upper.add(m);
      if (c.geometry?.type === 'CapsuleGeometry' && !bodyMat) bodyMat = c.material;
    }
  }
  bodyMat ||= new THREE.MeshLambertMaterial({ color: '#4f7cff' });
  pantsMat ||= new THREE.MeshLambertMaterial({ color: '#3b4252' });
  skinMat ||= src?.userData?.head?.material || bodyMat;
  const headMesh = src?.userData?.head;
  const face = headMesh?.geometry?.type === 'BoxGeometry' ? 'square'
    : (headMesh?.scale?.y > 1.05 ? 'long' : 'round');
  let hasGlasses = false;
  if (rig) {
    for (const c of rig.children) {
      if (c.geometry?.type === 'TorusGeometry' && c.position?.y > 1.5) { hasGlasses = true; break; }
    }
  }
  const lookGender = src?.userData?.look?.gender || src?.userData?.gender || 'm';
  const helmet = createRoadHelmetHead({
    skin: skinMat?.color ? `#${skinMat.color.getHexString()}` : '#f2d0b0',
    face,
    glasses: hasGlasses,
    gender: lookGender === 'f' ? 'f' : 'm',
  });
  head.add(helmet);
  const shoe = new THREE.MeshLambertMaterial({ color: '#f2f2f0' });
  const glove = new THREE.MeshLambertMaterial({ color: '#1c1d20' });
  const limbG = (r) => new THREE.CapsuleGeometry(r, 1, 3, 8);
  const mk = (r, m) => {
    const o = new THREE.Mesh(limbG(r), m);
    o.castShadow = true;
    o.userData.r = r;
    g.add(o);
    return o;
  };
  const legs = [1, -1].map((sx) => ({
    sx,
    thigh: mk(0.08, pantsMat),
    shin: mk(0.064, pantsMat),
    foot: (() => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.06, 0.24), shoe);
      f.castShadow = true;
      g.add(f);
      return f;
    })(),
  }));
  const arms = [1, -1].map((sx) => ({
    sx,
    upper: mk(0.058, bodyMat),
    fore: mk(0.05, bodyMat),
    hand: (() => {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glove);
      g.add(h);
      return h;
    })(),
  }));
  g.userData = { upper, head, legs, arms, skinMat };
  return g;
}

const _a = new THREE.Vector3();
const _d = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

function limb(o, a, b) {
  _d.subVectors(b, a);
  const L = _d.length();
  o.position.addVectors(a, b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(_up, _d.normalize());
  o.scale.set(1, Math.max(0.05, L / (1 + 2 * o.userData.r)), 1);
}

function twoBone(o1, o2, a, b, l1, l2, bend) {
  const d = _a.subVectors(b, a);
  const L = Math.min(d.length(), l1 + l2 - 1e-3);
  const dir = d.clone().normalize();
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const side = bend.clone().addScaledVector(dir, -bend.dot(dir)).normalize();
  const j = a.clone().addScaledVector(dir, x).addScaledVector(side, h);
  limb(o1, a, j);
  limb(o2, j, b);
}

function poseRider(riderMesh, bike) {
  const { upper, head, legs, arms } = riderMesh.userData;
  const U = bike.userData;
  const lean = U.lean;
  bike.updateMatrixWorld(true);
  head.position.copy(lean.worldToLocal(upper.localToWorld(_p.set(0, 0.9, 0.12))));
  for (const l of legs) {
    const hip = lean.worldToLocal(upper.localToWorld(_p.set(l.sx * 0.15, 0.14, 0.03)));
    // pedals[0] = 구동측(-x, 오른쪽), pedals[1] = +x(왼쪽). sx>0 이 왼쪽이다.
    const ped = U.pedals[l.sx > 0 ? 1 : 0];
    const foot = lean.worldToLocal(ped.localToWorld(_q.set(l.sx * 0.03, 0.02, 0.0)));
    const ankle = foot.clone();
    ankle.y += 0.045;
    ankle.z -= 0.05;
    // 무릎은 옆으로 벌리지 않고, 앞(+z)으로 나가며 정강이가 페달 쪽으로 뒤로 접힌다.
    twoBone(l.thigh, l.shin, hip, ankle, 0.54, 0.5, new THREE.Vector3(l.sx * 0.05, 0.2, 1));
    l.foot.position.copy(foot);
    l.foot.position.y += 0.02;
    l.foot.rotation.set(0.08, 0, 0);
  }
  for (const a of arms) {
    const sh = lean.worldToLocal(upper.localToWorld(_p.set(a.sx * 0.27, 0.92, 0.06)));
    const grip = lean.worldToLocal(U.grips[a.sx > 0 ? 0 : 1].getWorldPosition(_q));
    twoBone(a.upper, a.fore, sh, grip, 0.32, 0.31, new THREE.Vector3(a.sx * 0.7, -0.35, -0.6));
    a.hand.position.copy(grip);
  }
}

export function roadbikeVehOf(m, vehId = ROADBIKE_VEH_ID) {
  if (m?.veh?.id === vehId) return m.veh;
  if (Array.isArray(m?.pv)) {
    const hit = m.pv.find((v) => v && v.id === vehId);
    if (hit) return { ...hit, pk: 1 };
  }
  return null;
}

export function createRoadBike({
  scene, overlay, world, data, params, cam, player, renderer, terrain, presence, remotes, getTrucks, onChange,
  vehId = ROADBIKE_VEH_ID, colorway = 'black', label = '🚲 CR·1',
}) {
  if (params.get('roadbike') === '0') return null;
  if (!blockHooked) {
    blockHooked = true;
    const orig = world.isBlocked.bind(world);
    world.isBlocked = (x, z, r = 0.35) => orig(x, z, r) || blockers.some((fn) => fn(x, z, r));
  }
  const ground = (x, z, ref = 0) => (terrain ? terrain.getGroundHeight(x, z, ref) : 0);
  const ROAD_LIFT = {
    primary: 0.06, trunk: 0.06, secondary: 0.065, tertiary: 0.07, residential: 0.075,
    unclassified: 0.075, service: 0.08, living_street: 0.08, footway: 0.1, pedestrian: 0.095,
    path: 0.1, cycleway: 0.1, steps: 0.1, track: 0.09,
  };
  const segGrid = new Map();
  const GC = 16;
  for (const r of data.roads || []) {
    const ly = (ROAD_LIFT[r.k] ?? 0.08) + (r.br ? 0.02 : 0);
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1];
      const [bx, bz] = r.p[i];
      const hw = r.w / 2;
      const sg = { ax, az, bx, bz, hw, ly };
      for (let gx = Math.floor((Math.min(ax, bx) - hw) / GC); gx <= Math.floor((Math.max(ax, bx) + hw) / GC); gx++) {
        for (let gz = Math.floor((Math.min(az, bz) - hw) / GC); gz <= Math.floor((Math.max(az, bz) + hw) / GC); gz++) {
          const k = `${gx},${gz}`;
          (segGrid.get(k) || segGrid.set(k, []).get(k)).push(sg);
        }
      }
    }
  }
  const roadLift = (x, z) => {
    let m = 0;
    for (const g of segGrid.get(`${Math.floor(x / GC)},${Math.floor(z / GC)}`) || []) {
      if (g.ly <= m) continue;
      const dx = g.bx - g.ax;
      const dz = g.bz - g.az;
      const L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (z - g.az) * dz) / L2));
      if (Math.hypot(x - g.ax - dx * t, z - g.az - dz * t) <= g.hw) m = g.ly;
    }
    return m;
  };
  let liftS = 0;

  const mesh = createRoadBikeModel(renderer, { colorway });
  mesh.visible = false;
  scene.add(mesh);
  const U = mesh.userData;
  const b = {
    id: vehId, mesh, x: 0, z: 0, y: 0, h: 0, v: 0, yaw: 0, steer: 0, si: 0,
    lean: 0, spin: 0, crank: 0.4, cass: 0, cad: 0, pitch: 0, rider: null, remote: null, pedaling: false,
  };
  const stats = { dist: 0, time: 0, t: 0 };
  const tmpV = new THREE.Vector3();
  b.label = overlay.add({
    cls: 'label roadbike',
    text: label,
    getPos: () => tmpV.set(b.x, b.y + 1.35, b.z),
    maxDist: 40,
    minDist: 2.2,
  });
  b.label.hidden = true;

  const hit = (x, z, r) => {
    if (!mesh.visible) return false;
    if (Math.abs(x - b.x) > 2.4 || Math.abs(z - b.z) > 2.4) return false;
    const s = Math.sin(b.h);
    const c = Math.cos(b.h);
    for (const o of [-0.55, 0, 0.55]) {
      if (Math.hypot(b.x + s * o - x, b.z + c * o - z) < 0.3 + r) return true;
    }
    return false;
  };
  const me = { riding: false, saved: null, lastYawInput: -10, t: 0 };
  let stock = 0;
  let summoned = false;
  const owned = () => stock > 0;
  blockers.push((x, z, r = 0.35) => !me.riding && !b.remote && summoned && hit(x, z, r));

  let rider = buildRider(player);
  rider.visible = false;
  U.lean.add(rider);
  const setRider = (src) => {
    U.lean.remove(rider);
    rider = buildRider(src || player);
    rider.visible = true;
    U.lean.add(rider);
  };

  if (!cssReady) {
    cssReady = true;
    const css = document.createElement('style');
    css.textContent = `.label.roadbike{font-size:11px;font-weight:700;background:rgba(20,20,22,.78);color:#fff}
.rb-prompt{position:fixed;left:50%;bottom:108px;transform:translateX(-50%);display:none;font:600 14px system-ui,sans-serif;color:#fff;background:rgba(12,12,14,.86);padding:8px 14px;border-radius:12px;border:0;cursor:pointer;z-index:8;box-shadow:0 2px 10px #0004}
.rb-prompt kbd{background:#fff;color:#222;border-radius:4px;padding:0 6px;margin-right:6px;font:700 13px system-ui}
.rb-hud{position:fixed;right:12px;bottom:236px;display:none;width:156px;color:#0b0b0c;font-family:system-ui,sans-serif;z-index:6;pointer-events:none;background:#141518;border-radius:16px;padding:8px 8px 6px;box-shadow:0 3px 14px #0007}
@media (max-width:720px){.rb-hud{width:128px;bottom:258px}}
.rb-hud .scr{background:#eef0ea;border-radius:6px;padding:6px 8px 4px}
.rb-hud .lb{font:700 10px system-ui;color:#5b5e63;display:flex;justify-content:space-between}
.rb-hud .v{font:900 44px/1 system-ui;text-align:center;letter-spacing:-1px}
.rb-hud .bar{height:5px;background:#c9ccc5;border-radius:3px;margin:3px 0 5px}.rb-hud .bar i{display:block;height:100%;background:#2f7fd8;border-radius:3px}
.rb-hud .g{display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;border-top:2px solid #c9ccc5;padding-top:3px}
.rb-hud .g b{display:block;font:900 18px/1.1 system-ui}.rb-hud .g span{font:700 9px system-ui;color:#5b5e63}
.rb-hud .brand{color:#d8d9dc;font:800 10px system-ui;text-align:center;margin-top:4px;letter-spacing:1px}
body.roadbike-near #trk-prompt, body.roadbike-riding #trk-prompt, body.roadbike-near #bike-prompt, body.roadbike-riding #bike-prompt{display:none!important}`;
    document.head.appendChild(css);
  }
  const prompt = document.createElement('button');
  prompt.className = 'rb-prompt';
  document.body.appendChild(prompt);
  const hud = document.createElement('div');
  hud.className = 'rb-hud';
  hud.innerHTML = `<div class="scr"><div class="lb"><span>SPEED</span><span>km/h</span></div><div class="v">0.0</div><div class="bar"><i style="width:0"></i></div>
<div class="g"><div><span>DIST km</span><b class="d">0.00</b></div><div><span>TIME</span><b class="t">0:00</b></div><div><span>CADENCE rpm</span><b class="c">0</b></div><div><span>AVG km/h</span><b class="a">0.0</b></div></div></div><div class="brand">BUMPINTO</div>`;
  document.body.appendChild(hud);
  const H = {
    v: hud.querySelector('.v'),
    bar: hud.querySelector('.bar i'),
    d: hud.querySelector('.d'),
    t: hud.querySelector('.t'),
    c: hud.querySelector('.c'),
    a: hud.querySelector('.a'),
  };

  const inRange = () => {
    const P = player.position;
    const s = Math.sin(b.h);
    const c = Math.cos(b.h);
    const dx = P.x - b.x;
    const dz = P.z - b.z;
    const lz = dx * s + dz * c;
    const lx = dx * c - dz * s;
    return Math.hypot(Math.max(0, Math.abs(lx) - HW), Math.max(0, Math.abs(lz) - HL)) < 1.8;
  };
  const near = () => summoned && owned() && !b.remote && !me.riding && inRange();
  const canMount = () => near() && !getTrucks?.()?.driving;

  function findSummonPlace() {
    const P = player.position;
    const ph = player.rotation?.y || 0;
    const sh = Math.sin(ph);
    const ch = Math.cos(ph);
    const localSpots = [
      [-1.05, 1.05], [1.05, 1.05], [0, 1.9], [-1.25, 0], [1.25, 0],
      [-1.05, -1.05], [1.05, -1.05], [0, -1.9],
    ];
    for (const [lx, lz] of localSpots) {
      const x = P.x + lx * ch + lz * sh;
      const z = P.z - lx * sh + lz * ch;
      if (!world.isBlocked(x, z, 0.35)) return { x, z, h: ph };
    }
    return { x: P.x - ch * 1.2 + sh * 0.6, z: P.z + sh * 1.2 + ch * 0.6, h: ph };
  }

  function mount() {
    if (!owned() || !summoned || me.riding) return false;
    me.riding = true;
    b.v = 0;
    b.rider = 'me';
    b.remote = null;
    player.position.set(b.x, b.y, b.z);
    player.visible = false;
    setRider(player);
    U.stand.visible = false;
    me.saved = { dist: cam.dist, pitch: cam.pitch };
    cam.dist = 4.6;
    cam.pitch = 0.2;
    cam.yaw = b.h + Math.PI;
    stats.dist = 0;
    stats.time = 0;
    hud.style.display = 'block';
    b.label.hidden = true;
    document.body.classList.add('roadbike-riding');
    onChange?.();
    return true;
  }

  function dismount() {
    if (!me.riding) return false;
    me.riding = false;
    b.rider = null;
    b.v = 0;
    b.yaw = 0;
    b.si = 0;
    b.pedaling = false;
    b.cad = 0;
    rider.visible = false;
    U.stand.visible = true;
    player.visible = true;
    b.label.hidden = !summoned;
    hud.style.display = 'none';
    document.body.classList.remove('roadbike-riding');
    const s = Math.sin(b.h);
    const c = Math.cos(b.h);
    const opts = [[0.75, 0], [-0.75, 0], [0.75, -0.7], [-0.75, -0.7], [0, -1.5], [0, 1.5], [1.5, 0], [-1.5, 0]];
    let px = b.x + 0.75 * c;
    let pz = b.z - 0.75 * s;
    for (const [lx, lz] of opts) {
      const x = b.x + lx * c + lz * s;
      const z = b.z - lx * s + lz * c;
      if (!world.isBlocked(x, z)) {
        px = x;
        pz = z;
        break;
      }
    }
    player.position.set(px, ground(px, pz, b.y), pz);
    player.rotation.y = b.h;
    if (me.saved) {
      cam.dist = me.saved.dist;
      cam.pitch = me.saved.pitch;
    }
    onChange?.();
    return true;
  }

  function summon() {
    if (!owned()) return false;
    if (me.riding) dismount();
    const sp = findSummonPlace();
    summoned = true;
    b.x = sp.x;
    b.z = sp.z;
    b.h = sp.h;
    b.y = ground(sp.x, sp.z, player.position.y || 0);
    b.v = 0;
    b.yaw = 0;
    b.si = 0;
    b.steer = -0.12;
    b.lean = 0;
    b.pedaling = false;
    b.cad = 0;
    mesh.visible = true;
    U.stand.visible = true;
    rider.visible = false;
    b.label.hidden = false;
    b.label.el.textContent = '🚲 CR·1';
    pose(1, true);
    onChange?.();
    return true;
  }

  function stow() {
    if (me.riding) dismount();
    if (!summoned && !me.riding) {
      mesh.visible = !!b.remote;
      return false;
    }
    summoned = false;
    b.v = 0;
    b.yaw = 0;
    b.si = 0;
    b.pedaling = false;
    if (!b.remote) {
      mesh.visible = false;
      b.label.hidden = true;
      rider.visible = false;
      U.stand.visible = true;
    }
    prompt.style.display = 'none';
    hud.style.display = 'none';
    document.body.classList.remove('roadbike-near', 'roadbike-riding');
    onChange?.();
    return true;
  }

  function toggleSummon() {
    if (!owned()) return false;
    if (summoned || me.riding) return !stow();
    return summon();
  }

  function setStock(next) {
    const qty = Math.max(0, Math.floor(Number(next) || 0));
    if (stock === qty) return;
    stock = qty;
    if (!owned()) stow();
    onChange?.();
  }

  /** @deprecated use setStock */
  function setOwned(next) {
    setStock(next ? Math.max(stock, 1) : 0);
  }

  const dist = () => Math.hypot(player.position.x - b.x, player.position.z - b.z);
  const self = { get riding() { return me.riding; }, canMount, dist };
  fleet.push(self);
  const claimsF = () => {
    if (fleet.some((o) => o.riding && o !== self)) return false;
    if (me.riding) return true;
    if (!canMount()) return false;
    const d = dist();
    return !fleet.some((o) => o !== self && o.canMount() && o.dist() + 0.05 < d);
  };
  const toggle = () => {
    if (me.riding) dismount();
    else if (canMount()) mount();
  };
  prompt.onclick = toggle;
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.repeat) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
    if (document.body.classList.contains('in-gate') || document.body.classList.contains('in-lobby')) return;
    if (!claimsF()) return;
    e.stopImmediatePropagation();
    toggle();
  }, true);

  const poseFits = (x, z, h) => {
    const s = Math.sin(h);
    const c = Math.cos(h);
    const bd = world.bounds;
    if (bd && (x < bd.x0 || x > bd.x1 || z < bd.z0 || z > bd.z1)) return false;
    for (const [lx, lz] of HULL) {
      if (world.isBlocked(x + lx * c + lz * s, z - lx * s + lz * c, 0.05)) return false;
    }
    return true;
  };

  function ride(dt, f, s, sprint) {
    if (f > 0) b.v += (b.v < -0.05 ? 4 : (sprint ? 3.4 : 2.4) * (1 - 0.8 * (Math.max(0, b.v) / VMAX) ** 2)) * f * dt;
    else if (f < 0) b.v += (b.v > 0.15 ? -6 : -1.2) * -f * dt;
    else b.v -= Math.sign(b.v) * Math.min(Math.abs(b.v), (0.1 + 0.0018 * b.v * b.v) * dt);
    b.v = THREE.MathUtils.clamp(b.v, -REV_V, VMAX);
    b.pedaling = f > 0 && b.v >= 0;
    b.si += THREE.MathUtils.clamp(s - b.si, -3.5 * dt, 3.5 * dt);
    const av = Math.abs(b.v);
    const yawMax = Math.min(av / R_MIN, (0.75 * G) / Math.max(av, 0.1));
    const want = -b.si * yawMax * Math.sign(b.v || 1);
    b.yaw += (want - b.yaw) * Math.min(1, dt * 5);
    const nh = b.h + b.yaw * dt;
    const nx = b.x + Math.sin(nh) * b.v * dt;
    const nz = b.z + Math.cos(nh) * b.v * dt;
    if (poseFits(nx, nz, nh)) {
      b.x = nx;
      b.z = nz;
      b.h = nh;
    } else if (poseFits(nx, b.z, b.h)) {
      b.x = nx;
      b.v *= 0.6;
    } else if (poseFits(b.x, nz, b.h)) {
      b.z = nz;
      b.v *= 0.6;
    } else b.v = -b.v * 0.1;
  }

  const pose = (dt, parked) => {
    const s = Math.sin(b.h);
    const c = Math.cos(b.h);
    const A = RB.WB / 2;
    const yf = ground(b.x + s * A, b.z + c * A, b.y);
    const yr = ground(b.x - s * A, b.z - c * A, b.y);
    liftS += (Math.max(roadLift(b.x + s * A, b.z + c * A), roadLift(b.x - s * A, b.z - c * A)) - liftS) * Math.min(1, dt * 12);
    b.y = (yf + yr) / 2 + liftS;
    b.pitch += (-Math.atan2(yf - yr, RB.WB) - b.pitch) * Math.min(1, dt * 10);
    mesh.position.set(b.x, b.y, b.z);
    mesh.rotation.set(b.pitch, b.h, 0, 'YXZ');
    const av = Math.abs(b.v);
    const leanT = parked ? 0 : THREE.MathUtils.clamp(Math.atan((b.v * -b.yaw) / G), -0.66, 0.66) * Math.min(1, av / 2);
    b.lean += THREE.MathUtils.clamp(leanT - b.lean, -2.2 * dt, 2.2 * dt);
    U.lean.rotation.z = b.lean;
    const st = av > 0.3 ? Math.atan((RB.WB * -b.yaw) / av) : b.si * 0.5;
    b.steer += (THREE.MathUtils.clamp(parked ? -0.12 : st, -0.55, 0.55) - b.steer) * Math.min(1, dt * 9);
    U.steer.rotation.y = -b.steer;
    b.spin += (b.v / RB.R) * dt;
    U.frontSpin.rotation.x = b.spin;
    U.rearSpin.rotation.x = b.spin;
    const cadT = b.pedaling ? 70 + 25 * Math.min(1, av / VMAX) + (b.sprint ? 10 : 0) : 0;
    b.cad += (cadT - b.cad) * Math.min(1, dt * (b.pedaling ? 4 : 2.5));
    const w = (b.cad / 60) * Math.PI * 2;
    b.crank += w * dt;
    U.crank.rotation.x = b.crank;
    for (const p of U.pedals) p.rotation.x = -b.crank;
    if (b.cad > 1) {
      b.cass = b.spin;
      U.chainTex.offset.x -= (w * RING_R * dt) / 0.0254;
    }
    U.cassette.rotation.x = b.cass;
    U.stand.visible = !!parked;
    if (rider.visible) poseRider(rider, mesh);
  };

  let scrT = 0;
  const drawScreen = (dt, force) => {
    scrT -= dt;
    if (scrT > 0 && !force) return;
    scrT = 0.1;
    const kmh = Math.abs(b.v) * 3.6;
    const avg = stats.time > 1 ? (stats.dist / stats.time) * 3.6 : 0;
    const st = { kmh: Math.min(50, kmh), dist: stats.dist / 1000, time: stats.time, cad: b.cad, avg, riding: me.riding || (!!b.remote && !b.remote.parked) };
    drawComputer(U.screen.ctx, st);
    U.screen.tex.needsUpdate = true;
    if (me.riding) {
      H.v.textContent = st.kmh.toFixed(1);
      H.bar.style.width = `${(st.kmh / 50) * 100}%`;
      H.bar.style.background = st.kmh >= 49.95 ? '#e8333a' : '#2f7fd8';
      H.d.textContent = st.dist.toFixed(2);
      const t = Math.floor(st.time);
      H.t.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      H.c.textContent = Math.round(st.cad);
      H.a.textContent = avg.toFixed(1);
    }
  };
  drawScreen(0, true);

  function releaseRemote() {
    const p = remotes?.peers.get(b.rider);
    if (p) p.mesh.visible = true;
    b.remote = null;
    if (b.rider && b.rider !== 'me') b.rider = null;
    b.v = 0;
    b.yaw = 0;
    b.pedaling = false;
    if (!me.riding) {
      rider.visible = false;
      U.stand.visible = true;
      mesh.visible = summoned;
      b.label.hidden = !summoned;
      if (summoned) b.label.el.textContent = '🚲 CR·1';
    }
  }

  function showRemote(m, veh, parked) {
    if (owned() && (me.riding || summoned)) return;
    const peer = remotes?.peers.get(m.id);
    const changed = b.rider !== m.id || !!b.remote?.parked !== parked;
    if (changed) {
      if (b.rider && b.rider !== m.id && b.rider !== 'me') {
        const prev = remotes?.peers.get(b.rider);
        if (prev) prev.mesh.visible = true;
      }
      b.rider = m.id;
      if (parked) {
        rider.visible = false;
        U.stand.visible = true;
        if (peer) peer.mesh.visible = true;
        b.label.hidden = false;
        b.label.el.textContent = peer?.name ? `🚲 ${peer.name}` : '🚲 CR·1';
      } else {
        setRider(peer ? peer.mesh : player);
        if (peer) peer.mesh.visible = false;
        U.stand.visible = false;
        b.label.hidden = true;
      }
      b.x = parked && Number.isFinite(+veh.x) ? +veh.x : m.x;
      b.z = parked && Number.isFinite(+veh.z) ? +veh.z : m.z;
      b.h = +veh.ry || 0;
    }
    b.remote = {
      tx: parked && Number.isFinite(+veh.x) ? +veh.x : m.x,
      tz: parked && Number.isFinite(+veh.z) ? +veh.z : m.z,
      th: +veh.ry || 0,
      v: parked ? 0 : (+veh.v || 0),
      yaw: parked ? 0 : (+veh.st || 0),
      p: !parked && !!veh.p,
      parked,
    };
    mesh.visible = true;
  }

  if (presence) {
    presence.on('state', (m) => {
      const veh = roadbikeVehOf(m, vehId);
      if (veh) showRemote(m, veh, !!veh.pk);
      else if (b.remote && b.rider === m.id) releaseRemote();
    });
    presence.on('leave', (m) => {
      if (b.remote && b.rider === m.id) releaseRemote();
    });
  }

  return {
    bike: b,
    mesh,
    get riding() { return me.riding; },
    get summoned() { return summoned; },
    get owned() { return owned(); },
    get stock() { return stock; },
    setStock,
    setOwned,
    mount,
    dismount,
    near,
    summon,
    stow,
    toggleSummon,
    update(dt, f, s, run, lookYaw) {
      me.t += dt;
      if (me.riding && Math.hypot(player.position.x - b.x, player.position.z - b.z) > 3) {
        const keep = player.position.clone();
        dismount();
        player.position.copy(keep);
      }
      if (me.riding) {
        b.sprint = !!run && f > 0;
        ride(dt, f, s, run);
        if (Math.abs(b.v) > 0.3) stats.time += dt;
        stats.dist += Math.abs(b.v) * dt;
        player.position.set(b.x, b.y, b.z);
        player.rotation.y = b.h;
        if (Math.abs(lookYaw) > 1e-4) me.lastYawInput = me.t;
        if (cam.mode === 'follow' && me.t - me.lastYawInput > 1.2) {
          const want = b.h + Math.PI;
          const d = Math.atan2(Math.sin(want - cam.yaw), Math.cos(want - cam.yaw));
          cam.yaw += d * Math.min(1, dt * (Math.abs(b.v) > 1 ? 3.2 : 1));
        }
        pose(dt, false);
      } else if (b.remote) {
        const r = b.remote;
        const k = Math.min(1, dt * 8);
        b.x += (r.tx - b.x) * k;
        b.z += (r.tz - b.z) * k;
        b.h += Math.atan2(Math.sin(r.th - b.h), Math.cos(r.th - b.h)) * k;
        b.v = r.v;
        b.yaw = r.yaw;
        b.pedaling = !!r.p;
        b.sprint = false;
        if (!r.parked && Math.abs(b.v) > 0.3) {
          stats.time += dt;
          stats.dist += Math.abs(b.v) * dt;
        }
        pose(dt, !!r.parked);
      } else if (summoned && (me.wasActive || Math.abs(b.lean) > 1e-3 || b.cad > 0.5)) {
        b.pedaling = false;
        b.sprint = false;
        pose(dt, true);
      }
      me.wasActive = me.riding || !!b.remote;
      if (mesh.visible) drawScreen(dt);
      document.body.classList.toggle('roadbike-near', fleet.some((o) => o.canMount()));
      if (me.riding) {
        prompt.style.display = 'block';
        prompt.innerHTML = '<kbd>F</kbd>Get off / 내리기';
      } else if (claimsF()) {
        prompt.style.display = 'block';
        prompt.innerHTML = `<kbd>F</kbd>Ride / 탑승 · ${label.replace(/^🚲\s*/, '')}`;
      } else prompt.style.display = 'none';
      return me.riding;
    },
    net() {
      if (!owned() || (!me.riding && !summoned)) return null;
      if (!me.riding) {
        return { veh: { id: vehId, pk: 1, x: +b.x.toFixed(2), z: +b.z.toFixed(2), ry: +b.h.toFixed(3), v: 0, st: 0 } };
      }
      return {
        ry: b.h,
        moving: Math.abs(b.v) > 0.3,
        veh: {
          id: vehId,
          ry: +b.h.toFixed(3),
          v: +b.v.toFixed(2),
          st: +b.yaw.toFixed(3),
          p: b.pedaling ? 1 : 0,
        },
      };
    },
  };
}
