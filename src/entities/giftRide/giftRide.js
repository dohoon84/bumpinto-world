// 선물함 탈것 공통: 꺼내기/수납 · F 탑승/하차 · 주행(서브스텝 충돌) · 원격 중계 · 노면 높이.
//   탈것마다 다른 것(모델·가감속·라이더 자세·HUD·소리·연출)은 spec 으로 받는다. 예: roadBike/roadBike.js, superbike/superbike.js
//   보유 수량은 src/gifts/catalog.js · holdings.js 가 기준이고, 여기는 setStock 으로 받기만 한다.
import * as THREE from 'three';

const G = 9.81;
const MAX_STEP = 0.6; // 한 서브스텝 이동 상한(m). 트럭과 같이 고속에서 벽을 뚫지 않게
const MAX_SUBSTEPS = 8;
const ROAD_LIFT = {
  primary: 0.06, trunk: 0.06, secondary: 0.065, tertiary: 0.07, residential: 0.075,
  unclassified: 0.075, service: 0.08, living_street: 0.08, footway: 0.1, pedestrian: 0.095,
  path: 0.1, cycleway: 0.1, steps: 0.1, track: 0.09,
};
const fleet = [];
const blockers = [];
let blockHooked = false;
let cssReady = false;
const roadGrids = new WeakMap();

/** 도로 리본은 지면보다 6~10 cm 위에 그려진다. 바퀴가 묻히지 않게 그 높이를 찾는 격자 (data 당 1개) */
function roadLiftOf(data) {
  if (roadGrids.has(data)) return roadGrids.get(data);
  const grid = new Map();
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
          (grid.get(k) || grid.set(k, []).get(k)).push(sg);
        }
      }
    }
  }
  const lift = (x, z) => {
    let m = 0;
    for (const g of grid.get(`${Math.floor(x / GC)},${Math.floor(z / GC)}`) || []) {
      if (g.ly <= m) continue;
      const dx = g.bx - g.ax;
      const dz = g.bz - g.az;
      const L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (z - g.az) * dz) / L2));
      if (Math.hypot(x - g.ax - dx * t, z - g.az - dz * t) <= g.hw) m = g.ly;
    }
    return m;
  };
  roadGrids.set(data, lift);
  return lift;
}

/** 이번 프레임 이동을 몇 번에 나눌지 (트럭과 같은 규칙) */
export function substepsFor(v, dt) {
  return Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil((Math.abs(v) * dt) / MAX_STEP)));
}

function giftVehOf(m, vehId) {
  if (m?.veh?.id === vehId) return m.veh;
  if (Array.isArray(m?.pv)) {
    const hit = m.pv.find((v) => v && v.id === vehId);
    if (hit) return { ...hit, pk: 1 };
  }
  return null;
}

function hookCss() {
  if (cssReady) return;
  cssReady = true;
  const css = document.createElement('style');
  css.textContent = `.label.gift-ride{font-size:11px;font-weight:700;background:rgba(20,20,22,.78);color:#fff}
.rb-prompt{position:fixed;left:50%;bottom:calc(var(--emote-top,100px) + 10px);transform:translateX(-50%);display:none;font:600 14px system-ui,sans-serif;color:#fff;background:rgba(12,12,14,.86);padding:8px 14px;border-radius:12px;border:0;cursor:pointer;z-index:8;box-shadow:0 2px 10px #0004}
.rb-prompt kbd{background:#fff;color:#222;border-radius:4px;padding:0 6px;margin-right:6px;font:700 13px system-ui}
body.roadbike-near #trk-prompt, body.roadbike-riding #trk-prompt, body.roadbike-near #bike-prompt, body.roadbike-riding #bike-prompt{display:none!important}`;
  document.head.appendChild(css);
}

/**
 * @param {object} env scene, overlay, world, data, params, cam, player, renderer, terrain, presence, remotes, getTrucks, onChange
 * @param {object} spec
 *   vehId, icon('🚲'), name('CR·1'), labelY
 *   model(renderer) → mesh, userData { lean, steer, frontSpin, rearSpin, stand, grips }
 *   dims { WB, R(뒷바퀴), RF(앞바퀴, 없으면 R), HL, HW }
 *   drive { revV, rMin, latG, yawMin, yawK, steerIn, leanMax, steerMax, parkSteer, parkLean }
 *   throttle(b, dt, f, sprint) — b.v 만 바꾼다
 *   rider { build(src) → Group, pose(rider, mesh) }
 *   animate?(b, U, dt, parked), hud(b) → { show, hide, frame(dt, { riding, active }) }
 *   audio?(mesh) → { unlock, update(dt, { on, v, throttle }) }
 *   cam { dist, pitch }, netExtra?(b) → {} (주행 중 veh 에 더할 필드), throttleOf?(veh) → 원격 스로틀 0~1
 *   settling?(b) → 세워 둔 뒤에도 연출(크랭크 등)이 덜 멈췄으면 true
 */
export function createGiftRide(env, spec) {
  const { scene, overlay, world, data, cam, player, renderer, terrain, presence, remotes, getTrucks, onChange } = env;
  const D = spec.dims;
  const P = spec.drive;
  const RF = D.RF ?? D.R;
  const HULL = [[0, D.HL], [0, -D.HL], [D.HW, D.HL * 0.52], [-D.HW, D.HL * 0.52], [D.HW, -D.HL * 0.52], [-D.HW, -D.HL * 0.52], [D.HW, 0], [-D.HW, 0]];
  const parkLean = P.parkLean ?? 0;
  const parkSteer = P.parkSteer ?? -0.12;
  const label = `${spec.icon} ${spec.name}`;
  if (!blockHooked) {
    blockHooked = true;
    const orig = world.isBlocked.bind(world);
    world.isBlocked = (x, z, r = 0.35) => orig(x, z, r) || blockers.some((fn) => fn(x, z, r));
  }
  hookCss();
  const ground = (x, z, ref = 0) => (terrain ? terrain.getGroundHeight(x, z, ref) : 0);
  const roadLift = roadLiftOf(data);
  let liftS = 0;

  const mesh = spec.model(renderer);
  mesh.visible = false;
  scene.add(mesh);
  const U = mesh.userData;
  const b = {
    id: spec.vehId, mesh, x: 0, z: 0, y: 0, h: 0, v: 0, yaw: 0, steer: 0, si: 0,
    lean: 0, spinF: 0, spinR: 0, pitch: 0, rider: null, remote: null, throttle: 0, sprint: false,
  };
  const stats = { dist: 0, time: 0 };
  const tmpV = new THREE.Vector3();
  b.label = overlay.add({
    cls: 'label gift-ride',
    text: label,
    getPos: () => tmpV.set(b.x, b.y + (spec.labelY ?? 1.35), b.z),
    maxDist: 40,
    minDist: 2.2,
  });
  b.label.hidden = true;

  const hit = (x, z, r) => {
    if (!mesh.visible) return false;
    const reach = D.HL + 1.5;
    if (Math.abs(x - b.x) > reach || Math.abs(z - b.z) > reach) return false;
    const s = Math.sin(b.h);
    const c = Math.cos(b.h);
    const o = D.HL * 0.63;
    for (const k of [-o, 0, o]) {
      if (Math.hypot(b.x + s * k - x, b.z + c * k - z) < D.HW + 0.08 + r) return true;
    }
    return false;
  };
  const me = { riding: false, saved: null, lastYawInput: -10, t: 0, wasActive: false };
  let stock = 0;
  let summoned = false;
  const owned = () => stock > 0;
  blockers.push((x, z, r = 0.35) => !me.riding && !b.remote && summoned && hit(x, z, r));

  let rider = spec.rider.build(player);
  rider.visible = false;
  U.lean.add(rider);
  const setRider = (src) => {
    U.lean.remove(rider);
    rider = spec.rider.build(src || player);
    rider.visible = true;
    U.lean.add(rider);
  };

  const prompt = document.createElement('button');
  prompt.className = 'rb-prompt';
  document.body.appendChild(prompt);
  const hud = spec.hud(b, stats);
  const audio = spec.audio?.(mesh) || null;

  const inRange = () => {
    const Pp = player.position;
    const s = Math.sin(b.h);
    const c = Math.cos(b.h);
    const dx = Pp.x - b.x;
    const dz = Pp.z - b.z;
    const lz = dx * s + dz * c;
    const lx = dx * c - dz * s;
    return Math.hypot(Math.max(0, Math.abs(lx) - D.HW), Math.max(0, Math.abs(lz) - D.HL)) < 1.8;
  };
  const near = () => summoned && owned() && !b.remote && !me.riding && inRange();
  const canMount = () => near() && !getTrucks?.()?.driving;

  function findSummonPlace() {
    const Pp = player.position;
    const ph = player.rotation?.y || 0;
    const sh = Math.sin(ph);
    const ch = Math.cos(ph);
    const side = D.HW + 0.85;
    const ahead = D.HL + 1.0;
    const localSpots = [
      [-side, 1.05], [side, 1.05], [0, ahead], [-side - 0.2, 0], [side + 0.2, 0],
      [-side, -1.05], [side, -1.05], [0, -ahead],
    ];
    for (const [lx, lz] of localSpots) {
      const x = Pp.x + lx * ch + lz * sh;
      const z = Pp.z - lx * sh + lz * ch;
      if (!world.isBlocked(x, z, 0.35)) return { x, z, h: ph };
    }
    return { x: Pp.x - ch * (side + 0.2) + sh * 0.6, z: Pp.z + sh * (side + 0.2) + ch * 0.6, h: ph };
  }

  const resetMotion = () => {
    b.v = 0;
    b.yaw = 0;
    b.si = 0;
    b.throttle = 0;
    b.sprint = false;
  };

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
    cam.dist = spec.cam.dist;
    cam.pitch = spec.cam.pitch;
    cam.yaw = b.h + Math.PI;
    stats.dist = 0;
    stats.time = 0;
    hud.show();
    audio?.unlock();
    b.label.hidden = true;
    document.body.classList.add('roadbike-riding');
    onChange?.();
    return true;
  }

  function dismount() {
    if (!me.riding) return false;
    me.riding = false;
    b.rider = null;
    resetMotion();
    rider.visible = false;
    U.stand.visible = true;
    player.visible = true;
    b.label.hidden = !summoned;
    hud.hide();
    document.body.classList.remove('roadbike-riding');
    const s = Math.sin(b.h);
    const c = Math.cos(b.h);
    const sx = D.HW + 0.5;
    const opts = [[sx, 0], [-sx, 0], [sx, -0.7], [-sx, -0.7], [0, -D.HL - 0.6], [0, D.HL + 0.6], [sx + 0.75, 0], [-sx - 0.75, 0]];
    let px = b.x + sx * c;
    let pz = b.z - sx * s;
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
    resetMotion();
    b.steer = parkSteer;
    b.lean = parkLean;
    mesh.visible = true;
    U.stand.visible = true;
    rider.visible = false;
    b.label.hidden = false;
    b.label.el.textContent = label;
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
    resetMotion();
    if (!b.remote) {
      mesh.visible = false;
      b.label.hidden = true;
      rider.visible = false;
      U.stand.visible = true;
    }
    prompt.style.display = 'none';
    hud.hide();
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

  /** 한 서브스텝 이동. 막히면 벽을 따라 미끄러지거나 튕기고 false */
  function move(dt) {
    const nh = b.h + b.yaw * dt;
    const nx = b.x + Math.sin(nh) * b.v * dt;
    const nz = b.z + Math.cos(nh) * b.v * dt;
    if (poseFits(nx, nz, nh)) {
      b.x = nx;
      b.z = nz;
      b.h = nh;
      return true;
    }
    if (poseFits(nx, b.z, b.h)) {
      b.x = nx;
      b.v *= 0.6;
    } else if (poseFits(b.x, nz, b.h)) {
      b.z = nz;
      b.v *= 0.6;
    } else b.v = -b.v * 0.1;
    return false;
  }

  function ride(dt, f, s, sprint) {
    b.sprint = !!sprint && f > 0;
    spec.throttle(b, dt, f, b.sprint);
    b.v = Math.max(b.v, -P.revV);
    b.throttle = Math.max(0, f);
    b.si += THREE.MathUtils.clamp(s - b.si, -P.steerIn * dt, P.steerIn * dt);
    const av = Math.abs(b.v);
    const yawMax = Math.min(av / P.rMin, Math.max((P.latG * G) / Math.max(av, 0.1), P.yawMin ?? 0));
    const want = -b.si * yawMax * Math.sign(b.v || 1);
    b.yaw += (want - b.yaw) * Math.min(1, dt * P.yawK);
    const n = substepsFor(b.v, dt);
    for (let i = 0; i < n; i++) if (!move(dt / n)) break;
  }

  const pose = (dt, parked) => {
    const s = Math.sin(b.h);
    const c = Math.cos(b.h);
    const A = D.WB / 2;
    const yf = ground(b.x + s * A, b.z + c * A, b.y);
    const yr = ground(b.x - s * A, b.z - c * A, b.y);
    liftS += (Math.max(roadLift(b.x + s * A, b.z + c * A), roadLift(b.x - s * A, b.z - c * A)) - liftS) * Math.min(1, dt * 12);
    b.y = (yf + yr) / 2 + liftS;
    b.pitch += (-Math.atan2(yf - yr, D.WB) - b.pitch) * Math.min(1, dt * 10);
    mesh.position.set(b.x, b.y, b.z);
    mesh.rotation.set(b.pitch, b.h, 0, 'YXZ');
    const av = Math.abs(b.v);
    const leanT = parked ? parkLean : THREE.MathUtils.clamp(Math.atan((b.v * -b.yaw) / G), -P.leanMax, P.leanMax) * Math.min(1, av / 2);
    b.lean += THREE.MathUtils.clamp(leanT - b.lean, -2.2 * dt, 2.2 * dt);
    U.lean.rotation.z = b.lean;
    const st = av > 0.3 ? Math.atan((D.WB * -b.yaw) / av) : b.si * 0.5;
    b.steer += (THREE.MathUtils.clamp(parked ? parkSteer : st, -P.steerMax, P.steerMax) - b.steer) * Math.min(1, dt * 9);
    U.steer.rotation.y = -b.steer;
    b.spinR += (b.v / D.R) * dt;
    b.spinF += (b.v / RF) * dt;
    U.frontSpin.rotation.x = b.spinF;
    U.rearSpin.rotation.x = b.spinR;
    spec.animate?.(b, U, dt, parked);
    U.stand.visible = !!parked;
    if (rider.visible) spec.rider.pose(rider, mesh);
  };

  function releaseRemote() {
    const p = remotes?.peers.get(b.rider);
    if (p) p.mesh.visible = true;
    b.remote = null;
    if (b.rider && b.rider !== 'me') b.rider = null;
    resetMotion();
    if (!me.riding) {
      rider.visible = false;
      U.stand.visible = true;
      mesh.visible = summoned;
      b.label.hidden = !summoned;
      if (summoned) b.label.el.textContent = label;
    }
  }

  function showRemote(m, veh, parked) {
    if (owned() && (me.riding || summoned)) return;
    spec.onRemoteVisible?.();
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
        b.label.el.textContent = peer?.name ? `${spec.icon} ${peer.name}` : label;
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
      throttle: parked ? 0 : (spec.throttleOf?.(veh) ?? 0),
      parked,
    };
    mesh.visible = true;
  }

  if (presence) {
    presence.on('state', (m) => {
      const veh = giftVehOf(m, spec.vehId);
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
    audio,
    help: spec.help,
    get riding() { return me.riding; },
    get summoned() { return summoned; },
    get owned() { return owned(); },
    get stock() { return stock; },
    setStock,
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
        b.throttle = r.throttle;
        b.sprint = false;
        if (!r.parked && Math.abs(b.v) > 0.3) {
          stats.time += dt;
          stats.dist += Math.abs(b.v) * dt;
        }
        pose(dt, !!r.parked);
      } else if (summoned && (me.wasActive || Math.abs(b.lean - parkLean) > 1e-3 || spec.settling?.(b))) {
        b.throttle = 0;
        b.sprint = false;
        pose(dt, true);
      }
      me.wasActive = me.riding || !!b.remote;
      const active = me.riding || (!!b.remote && !b.remote.parked);
      if (mesh.visible) hud.frame(dt, { riding: me.riding, active });
      audio?.update(dt, { on: active, v: b.v, throttle: b.throttle });
      document.body.classList.toggle('roadbike-near', fleet.some((o) => o.canMount()));
      if (me.riding) {
        prompt.style.display = 'block';
        prompt.innerHTML = '<kbd>F</kbd>Get off / 내리기';
      } else if (claimsF()) {
        prompt.style.display = 'block';
        prompt.innerHTML = `<kbd>F</kbd>Ride / 탑승 · ${spec.name}`;
      } else prompt.style.display = 'none';
      return me.riding;
    },
    net() {
      if (!owned() || (!me.riding && !summoned)) return null;
      if (!me.riding) {
        return { veh: { id: spec.vehId, pk: 1, x: +b.x.toFixed(2), z: +b.z.toFixed(2), ry: +b.h.toFixed(3), v: 0, st: 0 } };
      }
      return {
        ry: b.h,
        moving: Math.abs(b.v) > 0.3,
        veh: { id: spec.vehId, ry: +b.h.toFixed(3), v: +b.v.toFixed(2), st: +b.yaw.toFixed(3), ...(spec.netExtra?.(b) || {}) },
      };
    },
  };
}
