// [bike] 관리자용 크루저 바이크: 인벤토리 소환/수납 · F 탑승/하차 · Space 윌리(앞바퀴 들기) · 탱크 색상(레드/블랙) · 멀티플레이(veh id 900/901)
//   ?bike=0 끔 (기본 1)
import * as THREE from 'three';
import { createBikeAudio } from './bikeAudio.js'; // [bikeaudio]
import { createBike, setBikeBrake, setBikeTankColor, BDIM } from './bikeModel.js';

export const BIKE_VEH_ID = 900; // 블랙 탱크 — trucks 의 veh.id(0~59) 와 겹치지 않는 번호
export const BIKE_VEH_RED_ID = 901; // 레드 탱크
const isBikeVehId = (id) => id === BIKE_VEH_ID || id === BIKE_VEH_RED_ID;
const MAX_V = 150 / 3.6, BOOST_V = 200 / 3.6, FLAME_V = 150 / 3.6, REV_V = 4 / 3.6, G = 9.81;
const R_MIN = 2.7; // 최소 회전반경(m)
const MAX_WHEELIE = 0.50; // 최대 앞바퀴 들림 각도 (~29°)
const HL = 1.19, HW = 0.3;
const HULL = [[0, HL], [0, -HL], [HW, 0.6], [-HW, 0.6], [HW, -0.5], [-HW, -0.5], [HW, 0], [-HW, 0]];
const DRIVE_KINDS = new Set(['secondary', 'tertiary', 'residential', 'service', 'unclassified', 'primary', 'trunk']);

// 아바타(createAvatar 결과)의 외형을 복제해 '크루저 자세' 라이더를 만든다: 상체 살짝 앞으로, 다리는 앞 발판, 손은 그립
const HIP = new THREE.Vector3(0, 0.72, -0.27);
function buildRider(src) {
  const g = new THREE.Group(); g.name = 'rider';
  const upper = new THREE.Group(); upper.position.copy(HIP); upper.rotation.x = 0.16; g.add(upper);
  const rig = src?.userData?.rig;
  if (!rig) return g;
  const { legL, legR, armL, armR, handPhone, handUmbrella } = src.userData;
  let bodyMat = null, pantsMat = legL?.material, skinMat = null;
  for (const c of rig.children) {
    // 팔·다리는 IK 로 다시 만들고, 폰/우산은 라이딩 자세에서 뺀다
    if (c === legL || c === legR || c === armL || c === armR || c === handPhone || c === handUmbrella) continue;
    const m = c.clone(); m.position.y -= 0.38; upper.add(m); m.castShadow = true;
    if (c.geometry?.type === 'CapsuleGeometry' && !bodyMat) bodyMat = c.material;
    const headish = c.position.y > 1.45 && c.position.y < 1.75 && (c.geometry?.type === 'SphereGeometry' || c.geometry?.type === 'BoxGeometry');
    if (headish && !skinMat) skinMat = c.material;
  }
  bodyMat ||= new THREE.MeshLambertMaterial({ color: '#4f7cff' }); pantsMat ||= new THREE.MeshLambertMaterial({ color: '#3b4252' }); skinMat ||= bodyMat;
  const limbG = (r) => new THREE.CapsuleGeometry(r, 1, 3, 8);
  const mk = (r, m) => { const o = new THREE.Mesh(limbG(r), m); o.castShadow = true; o.userData.r = r; g.add(o); return o; };
  const legs = [1, -1].map((sx) => ({ sx, thigh: mk(0.1, pantsMat), shin: mk(0.09, pantsMat), foot: (() => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.24), new THREE.MeshLambertMaterial({ color: '#222326' })); f.castShadow = true; g.add(f); return f; })() }));
  const arms = [1, -1].map((sx) => ({ sx, upper: mk(0.075, bodyMat), fore: mk(0.068, bodyMat), hand: (() => { const h = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), skinMat); g.add(h); return h; })() }));
  g.userData = { upper, legs, arms };
  return g;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function limb(o, a, b) { _d.subVectors(b, a); const L = _d.length(); o.position.addVectors(a, b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(_up, _d.normalize()); o.scale.set(1, Math.max(0.05, (L) / (1 + 2 * o.userData.r)), 1); }
// 두 마디 팔다리: 시작 a → 끝 b, 관절은 bend 방향으로 꺾임
function twoBone(o1, o2, a, b, l1, l2, bend) {
  const d = _a.subVectors(b, a), L = Math.min(d.length(), l1 + l2 - 1e-3), dir = d.clone().normalize();
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const side = bend.clone().addScaledVector(dir, -bend.dot(dir)).normalize();
  const j = a.clone().addScaledVector(dir, x).addScaledVector(side, h);
  limb(o1, a, j); limb(o2, j, b);
}
function poseRider(rider, bike) {
  const { upper, legs, arms } = rider.userData;
  if (!upper || !legs || !arms) return;
  const frame = bike.userData.wheelieFrame || bike.userData.lean;
  upper.updateMatrixWorld(true); bike.updateMatrixWorld(true);
  for (const l of legs) {
    const hip = _b.set(l.sx * 0.15, HIP.y, HIP.z + 0.02).clone();
    const foot = new THREE.Vector3(l.sx * 0.3, 0.38, 0.38);
    twoBone(l.thigh, l.shin, hip, foot, 0.46, 0.44, new THREE.Vector3(l.sx * 0.25, 1, 0.4));
    l.foot.position.set(l.sx * 0.3, 0.34, 0.42); l.foot.rotation.x = 0.15;
  }
  for (const a of arms) {
    const sh = frame.worldToLocal(upper.localToWorld(new THREE.Vector3(a.sx * 0.3, 1.0, 0.02)));
    const grip = frame.worldToLocal(bike.userData.grips[a.sx > 0 ? 0 : 1].getWorldPosition(new THREE.Vector3()));
    twoBone(a.upper, a.fore, sh, grip, 0.36, 0.36, new THREE.Vector3(a.sx * 1, -0.6, -0.4));
    a.hand.position.copy(grip);
  }
}

function pointInRing(x, z, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; }

export function createAdminBike({ scene, overlay, world, data, params, cam, player, renderer, terrain, presence, remotes, spawn, getTrucks, camera, canRide, getTankColor, onChange }) { // [bikeaudio] camera
  if (params.get('bike') === '0') return null;
  const isLocal = typeof location !== 'undefined' && (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.hostname.endsWith('.local'));
  const allowed = () => (typeof canRide === 'function' ? !!canRide() : true);
  const resolveMyTank = () => {
    if (isLocal) {
      const q = (params.get('tank') || '').toLowerCase();
      if (q === 'red' || q === 'black') return q;
    }
    const c = typeof getTankColor === 'function' ? getTankColor() : 'black';
    return c === 'red' ? 'red' : 'black';
  };
  const startParked = isLocal && (params.get('bike') === 'parked' || params.has('shot'));
  let summoned = startParked;
  const baseBlocked = world.isBlocked; // 건물(+이후 트럭) 충돌
  const ground = (x, z, ref = 0) => (terrain ? terrain.getGroundHeight(x, z, ref) : 0);
  const inWater = (x, z) => (data.water || []).some((w) => pointInRing(x, z, w.o));

  // ---------- 배치: 도착지점(스폰) 가까운 도로 가장자리, 비어 있는 곳 ----------
  const fits = (x, z, h, m = 0.5) => { const c = Math.cos(h), s = Math.sin(h);
    for (const [lx, lz] of [[-HW - m, -HL - m], [HW + m, -HL - m], [-HW - m, HL + m], [HW + m, HL + m], [HW + m + 0.8, 0], [-HW - m, 0], [0, 0]]) { const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c; if (baseBlocked(wx, wz, 0.2) || inWater(wx, wz)) return false; }
    return true; };
  let place = null; const cands = [];
  for (const r of data.roads || []) { if (!DRIVE_KINDS.has(r.k)) continue;
    for (let i = 1; i < r.p.length; i++) { const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], len = Math.hypot(bx - ax, bz - az); if (len < 4) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz, nz = ux;
      for (let t = 2; t < len - 2; t += 2) { const cx = ax + ux * t, cz = az + uz * t, d = Math.hypot(cx - spawn.x, cz - spawn.z); if (d > 120) continue;
        for (const sd of [1, -1]) { const off = r.w >= 7 ? r.w / 2 - 0.9 : r.w / 2 + 0.9; cands.push({ x: cx + nx * off * sd, z: cz + nz * off * sd, h: Math.atan2(ux, uz) + (sd < 0 ? Math.PI : 0), d }); } } } }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands) { if (c.d < 5) continue; if (fits(c.x, c.z, c.h)) { place = c; break; } }
  if (!place) { // 도로가 없으면 스폰 주변 빈 땅
    for (let r = 5; r < 40 && !place; r += 1.5) for (let a = 0; a < 12 && !place; a++) { const x = spawn.x + Math.cos(a) * r, z = spawn.z + Math.sin(a) * r; if (fits(x, z, a)) place = { x, z, h: a }; } }
  place ||= { x: spawn.x + 6, z: spawn.z + 3, h: 0 };

  const initialTank = resolveMyTank();
  const mesh = createBike(renderer, { tankColor: initialTank }); scene.add(mesh);
  const U = mesh.userData;
  const b = { id: initialTank === 'red' ? BIKE_VEH_RED_ID : BIKE_VEH_ID, tankColor: initialTank, mesh, x: place.x, z: place.z, y: ground(place.x, place.z), h: place.h, v: 0, yaw: 0, steer: 0, si: 0, lean: -0.085, wheelie: 0, wheelieVel: 0, spin: [0, 0], pitch: 0, rider: null, remote: null, home: { ...place } };
  const tmpV = new THREE.Vector3();
  b.label = overlay.add({ cls: 'label bike', text: '🏍️ Admin Cruiser', getPos: () => tmpV.set(b.x, b.y + 1.75, b.z), maxDist: 40, minDist: 3 });
  mesh.visible = summoned;
  b.label.hidden = !summoned;

  function syncMyTankStyle() {
    const tc = resolveMyTank();
    b.tankColor = tc;
    b.id = tc === 'red' ? BIKE_VEH_RED_ID : BIKE_VEH_ID;
    setBikeTankColor(mesh, tc);
    if (b.label?.el) {
      b.label.el.textContent = tc === 'red' ? '🏍️ Admin Cruiser · Crimson Red' : '🏍️ Admin Cruiser · Vivid Black';
    }
  }
  syncMyTankStyle();

  // 주차된 바이크도 걷는 사람/트럭이 통과하지 않도록 (타는 중이거나 미소환이면 제외)
  const bikeHit = (x, z, r) => { if (!summoned && !b.remote) return false; if (Math.abs(x - b.x) > 3 || Math.abs(z - b.z) > 3) return false; const s = Math.sin(b.h), c = Math.cos(b.h);
    for (const o of [-0.75, 0, 0.75]) if (Math.hypot(b.x + s * o - x, b.z + c * o - z) < 0.42 + r) return true; return false; };
  const me = { riding: false, saved: null, lastYawInput: -10, t: 0, puffT: 0 };
  // 생성 직후 초기 배치 시에만 반경 3 m 를 예약해 트럭이 바로 옆/위에 주차되지 않게
  let reserve = summoned;
  world.isBlocked = (x, z, r = 0.35) => baseBlocked(x, z, r) || (reserve ? Math.hypot(x - b.x, z - b.z) < 3 + r : !me.riding && !b.remote && bikeHit(x, z, r));

  // ---------- 라이더 ----------
  const riderParent = U.wheelieFrame || U.lean;
  let rider = buildRider(player); rider.visible = false; riderParent.add(rider);
  const setRider = (src) => { riderParent.remove(rider); rider = buildRider(src); riderParent.add(rider); };

  // ---------- 배기 연기(스프라이트 풀) & 150km/h+ 머플러 애프터파이어 불꽃 ----------
  const audio = createBikeAudio({ camera, anchor: U.exhaust, params }); // [bikeaudio]
  const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(235,235,238,1)'); g.addColorStop(0.5, 'rgba(210,210,214,.45)'); g.addColorStop(1, 'rgba(200,200,205,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const sparkTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 1, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,240,1)');
    g.addColorStop(0.28, 'rgba(255,196,60,0.95)');
    g.addColorStop(0.62, 'rgba(255,78,12,0.55)');
    g.addColorStop(1, 'rgba(255,30,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  // 머플러 팁에 붙는 순간 화염 제트 콘(내 바이크 + 원격 바이크 공용 생성기)
  function attachExhaustFlame(exhaustNode) {
    const fg = new THREE.Group();
    fg.visible = false;
    const outerGeo = new THREE.ConeGeometry(0.052, 0.42, 10, 1, true);
    outerGeo.rotateX(-Math.PI / 2);
    outerGeo.translate(0, 0, -0.20);
    const innerGeo = new THREE.ConeGeometry(0.03, 0.26, 10, 1, true);
    innerGeo.rotateX(-Math.PI / 2);
    innerGeo.translate(0, 0, -0.12);
    const outerMat = new THREE.MeshBasicMaterial({
      color: '#ff5a00', transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const innerMat = new THREE.MeshBasicMaterial({
      color: '#fff3b0', transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    const inner = new THREE.Mesh(innerGeo, innerMat);
    outer.renderOrder = 4; inner.renderOrder = 5;
    const light = new THREE.PointLight('#ff6a00', 0, 2.6, 2);
    light.position.set(0, 0, -0.14);
    fg.add(outer, inner, light);
    exhaustNode.add(fg);
    return { fg, outer, inner, outerMat, innerMat, light, flash: 0, nextPop: 0.08 };
  }
  const myFlame = attachExhaustFlame(U.exhaust);

  const puffs = [];
  for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: '#c9ccd1', transparent: true, opacity: 0, depthWrite: false })); s.visible = false; s.renderOrder = 3; scene.add(s); puffs.push({ s, life: 0, max: 1, vel: new THREE.Vector3() }); }
  let pi = 0;
  const sparks = [];
  for (let i = 0; i < 28; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sparkTex, color: '#ffae2b', transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.visible = false; s.renderOrder = 5; scene.add(s);
    sparks.push({ s, life: 0, max: 0.18, vel: new THREE.Vector3(), size: 0.18 });
  }
  let si = 0;

  const puffFrom = (exhaustObj, h, v, strength) => {
    const p = puffs[pi++ % puffs.length]; exhaustObj.getWorldPosition(p.s.position);
    const s = Math.sin(h), c = Math.cos(h);
    const out = 0.25 + Math.random() * 0.25; // 오른쪽(머플러 쪽) 바깥으로 살짝 퍼짐
    p.vel.set(-s * (0.7 + Math.random() * 0.4) - c * out + (Math.random() - 0.5) * 0.2, 0.3 + Math.random() * 0.2, -c * (0.7 + Math.random() * 0.4) + s * out + (Math.random() - 0.5) * 0.2).addScaledVector(tmpV.set(s, 0, c), v * 0.35);
    p.s.position.addScaledVector(p.vel, 0.12); p.life = 0; p.max = 1.3 + Math.random() * 0.9; p.str = strength; p.s.visible = true;
  };

  // 150km/h 이상일 때 머플러에서 팡! 하고 튀는 애프터파이어 불꽃 & 불티
  const popFlameFrom = (exhaustObj, flameState, h, v, intensity = 1) => {
    flameState.flash = 0.065 + Math.random() * 0.055;
    const s = Math.sin(h), c = Math.cos(h);
    const cnt = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < cnt; k++) {
      const sp = sparks[si++ % sparks.length];
      exhaustObj.getWorldPosition(sp.s.position);
      const backSpd = 4.5 + Math.random() * 4.5;
      const out = 0.18 + Math.random() * 0.28;
      sp.vel.set(
        -s * backSpd - c * out + (Math.random() - 0.5) * 1.1,
        (Math.random() - 0.35) * 0.9,
        -c * backSpd + s * out + (Math.random() - 0.5) * 1.1,
      ).addScaledVector(tmpV.set(s, 0, c), v * 0.82);
      sp.s.position.addScaledVector(tmpV.set(-s, 0, -c), 0.05 + k * 0.04);
      sp.life = 0;
      sp.max = 0.11 + Math.random() * 0.11;
      sp.size = (0.16 + Math.random() * 0.14) * (0.85 + 0.3 * intensity);
      sp.s.material.color.setHex(Math.random() < 0.35 ? 0xfff0a8 : 0xff6a14);
      sp.s.visible = true;
    }
  };

  const stepFlame = (dt, exhaustObj, flameState, h, v, active) => {
    const av = Math.abs(v);
    if (active && av >= FLAME_V) {
      // 150km/h(0) ~ 200km/h(1) 구간에서 속도가 높을수록 더 자주, 더 강하게 불꽃이 튄다
      const ratio = THREE.MathUtils.clamp((av - FLAME_V) / (BOOST_V - FLAME_V), 0, 1);
      flameState.nextPop -= dt;
      if (flameState.nextPop <= 0) {
        popFlameFrom(exhaustObj, flameState, h, v, 0.7 + ratio * 0.5);
        // 연달아 탁-탁! 튀거나 살짝 쉬었다 튀는 불규칙 애프터파이어 간격
        flameState.nextPop = Math.random() < 0.42
          ? 0.05 + Math.random() * 0.07
          : (0.22 - ratio * 0.11) + Math.random() * 0.24;
      }
    } else {
      flameState.nextPop = Math.min(flameState.nextPop, 0.06);
    }
    if (flameState.flash > 0) {
      flameState.flash = Math.max(0, flameState.flash - dt);
      const k = Math.min(1, flameState.flash / 0.08);
      const len = 0.75 + Math.random() * 0.55;
      const rad = 0.85 + Math.random() * 0.35;
      flameState.fg.visible = true;
      flameState.fg.scale.set(rad, rad, len);
      flameState.outerMat.opacity = 0.85 * k;
      flameState.innerMat.opacity = 0.95 * k;
      flameState.light.intensity = 2.2 * k;
    } else if (flameState.fg.visible) {
      flameState.fg.visible = false;
      flameState.light.intensity = 0;
    }
  };

  const updSmoke = (dt) => {
      const engineOn = me.riding || (!!b.remote && !b.remote.parked);
    if (engineOn) { me.puffT -= dt; if (me.puffT <= 0) { // 간헐적: 짧은 간격 퍼프 + 가끔 쉼
      const load = Math.min(1, Math.abs(b.v) / 12 + (b.throttle || 0) * 0.5 + (b.wheelie > 0.05 ? 0.35 : 0));
      puffFrom(U.exhaust, b.h, b.v, 0.5 - load * 0.18); /* 주행 중엔 흩어져 옅게 */ me.puffT = Math.random() < 0.18 ? 0.6 + Math.random() * 0.8 : 0.12 + Math.random() * 0.22 - load * 0.06; } }
    stepFlame(dt, U.exhaust, myFlame, b.h, b.v, engineOn);
    for (const rb of extraRemotes.values()) {
      rb.puffT -= dt;
      if (rb.puffT <= 0) {
        const load = Math.min(1, Math.abs(rb.v) / 12 + (rb.wheelie > 0.05 ? 0.35 : 0));
        puffFrom(rb.mesh.userData.exhaust, rb.h, rb.v, 0.45 - load * 0.15);
        rb.puffT = 0.16 + Math.random() * 0.25;
      }
      if (rb.flame) stepFlame(dt, rb.mesh.userData.exhaust, rb.flame, rb.h, rb.v, true);
    }
    for (const p of puffs) { if (!p.s.visible) continue; p.life += dt; const k = p.life / p.max; if (k >= 1) { p.s.visible = false; continue; }
      p.vel.multiplyScalar(1 - dt * 1.2); p.vel.y += dt * 0.12; p.s.position.addScaledVector(p.vel, dt);
      const sc = 0.2 + k * 1.05; p.s.scale.set(sc, sc, sc); p.s.material.opacity = p.str * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85); }
    for (const sp of sparks) {
      if (!sp.s.visible) continue;
      sp.life += dt;
      const k = sp.life / sp.max;
      if (k >= 1) { sp.s.visible = false; continue; }
      sp.s.position.addScaledVector(sp.vel, dt);
      const sc = sp.size * (1 - k * 0.55);
      sp.s.scale.set(sc, sc, sc);
      sp.s.material.opacity = 1 - k * k;
    }
  };

  // ---------- UI ----------
  const css = document.createElement('style');
  css.textContent = `.label.bike{font-size:11px;font-weight:700;background:rgba(20,20,22,.78);color:#fff}
#bike-prompt{position:fixed;left:50%;bottom:108px;transform:translateX(-50%);display:none;font:600 14px system-ui,sans-serif;color:#fff;background:rgba(12,12,14,.86);padding:8px 14px;border-radius:12px;border:0;cursor:pointer;z-index:8;box-shadow:0 2px 10px #0004}
#bike-prompt kbd{background:#fff;color:#222;border-radius:4px;padding:0 6px;margin-right:6px;font:700 13px system-ui}
#bike-hud{position:fixed;right:16px;bottom:44px;display:none;text-align:right;color:#fff;font-family:system-ui,sans-serif;text-shadow:0 1px 4px #0009;z-index:7;pointer-events:none}
#bike-hud .v{font:800 46px/1 system-ui}#bike-hud .u{font:600 14px system-ui;opacity:.85}#bike-hud .k{font:12px system-ui;opacity:.9;margin-top:4px}
body.bike-near #trk-prompt, body.bike-riding #trk-prompt{display:none!important}`;
  document.head.appendChild(css);
  const prompt = document.createElement('button'); prompt.id = 'bike-prompt'; document.body.appendChild(prompt);
  const hud = document.createElement('div'); hud.id = 'bike-hud'; hud.innerHTML = '<span class="v">0</span> <span class="u">km/h</span><div class="k">🏍️ Admin Cruiser · Space: 앞바퀴 들기(Wheelie) · Shift: Boost · N: 소리 · F: 내리기</div>'; document.body.appendChild(hud);
  const hudV = hud.querySelector('.v');
  const near = () => { if (!summoned || b.remote || me.riding) return false; const P = player.position, s = Math.sin(b.h), c = Math.cos(b.h), dx = P.x - b.x, dz = P.z - b.z;
    const lz = dx * s + dz * c, lx = dx * c - dz * s; return Math.hypot(Math.max(0, Math.abs(lx) - HW), Math.max(0, Math.abs(lz) - HL)) < 2.2; };
  const canMount = () => summoned && allowed() && !getTrucks?.()?.driving && near();
  const toggle = () => { if (me.riding) dismount(); else if (canMount()) mount(); };
  prompt.onclick = toggle;
  // 캡처 단계에서 먼저 받아 트럭 F 와 겹치지 않게: 탈 수 있을 때만 여기서 처리
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.repeat) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
    if (document.body.classList.contains('in-gate') || document.body.classList.contains('in-lobby')) return;
    if (me.riding || canMount()) { e.stopImmediatePropagation(); toggle(); }
  }, true);

  function findSummonPlace() {
    const P = player.position;
    const ph = player.rotation?.y || 0;
    const sh = Math.sin(ph), ch = Math.cos(ph);
    // 캐릭터 오른쪽 앞 · 왼쪽 앞 · 정면 · 주변 빈 땅 순서로 탐색해 바로 옆에 세운다
    const localSpots = [
      [-1.15, 0.9], [1.15, 0.9], [0, 1.85], [-1.35, 0], [1.35, 0],
      [-1.15, -1.0], [1.15, -1.0], [0, -1.9],
    ];
    for (const [lx, lz] of localSpots) {
      const x = P.x + lx * ch + lz * sh;
      const z = P.z - lx * sh + lz * ch;
      if (fits(x, z, ph, 0.25)) return { x, z, h: ph };
    }
    for (let r = 1.6; r <= 8; r += 0.8) {
      for (let k = 0; k < 12; k++) {
        const a = ph + (k * Math.PI * 2) / 12;
        const x = P.x + Math.sin(a) * r;
        const z = P.z + Math.cos(a) * r;
        if (fits(x, z, ph, 0.15)) return { x, z, h: ph };
      }
    }
    return { x: P.x - ch * 1.15 + sh * 0.7, z: P.z + sh * 1.15 + ch * 0.7, h: ph };
  }

  function summon() {
    if (!allowed()) return false;
    if (b.remote) releasePrimaryRemote();
    if (me.riding) dismount();
    syncMyTankStyle();
    const sp = findSummonPlace();
    summoned = true;
    b.x = sp.x; b.z = sp.z; b.h = sp.h;
    b.y = ground(sp.x, sp.z, player.position.y || 0);
    b.v = 0; b.yaw = 0; b.si = 0; b.steer = -0.32; b.lean = -0.085; b.wheelie = 0; b.wheelieVel = 0;
    mesh.visible = true;
    U.stand.visible = true;
    rider.visible = false;
    b.label.hidden = false;
    poseUnit(b, mesh, rider, 1, true);
    onChange?.();
    return true;
  }

  function stow() {
    if (me.riding) dismount();
    if (!summoned) return false;
    summoned = false;
    b.v = 0; b.yaw = 0; b.si = 0; b.wheelie = 0; b.wheelieVel = 0;
    if (!b.remote) {
      mesh.visible = false;
      b.label.hidden = true;
    }
    prompt.style.display = 'none';
    document.body.classList.remove('bike-near', 'bike-riding');
    onChange?.();
    return true;
  }

  function toggleSummon() {
    if (summoned || me.riding) return !stow();
    return summon();
  }

  function mount() {
    if (!allowed()) return;
    if (b.remote) releasePrimaryRemote();
    syncMyTankStyle();
    if (!summoned) {
      summoned = true;
      mesh.visible = true;
    }
    me.riding = true; b.v = 0; b.wheelie = 0; b.wheelieVel = 0; b.rider = 'me';
    player.position.set(b.x, b.y, b.z); player.visible = false; setRider(player); rider.visible = true; U.stand.visible = false;
    me.saved = { dist: cam.dist, pitch: cam.pitch }; cam.dist = 6.8; cam.pitch = 0.17; cam.yaw = b.h + Math.PI;
    hud.style.display = 'block'; b.label.hidden = true; document.body.classList.add('bike-riding'); me.puffT = 0;
    audio?.unlock(); // [bikeaudio] 탑승(F/클릭) = 사용자 제스처 → AudioContext 재개
    onChange?.();
  }
  function dismount() {
    if (!me.riding) return; me.riding = false; b.rider = null; b.v = 0; b.yaw = 0; b.si = 0; b.wheelie = 0; b.wheelieVel = 0;
    rider.visible = false; U.stand.visible = true; setBikeBrake(mesh, false);
    player.visible = true; b.label.hidden = !summoned; hud.style.display = 'none'; document.body.classList.remove('bike-riding');
    const s = Math.sin(b.h), c = Math.cos(b.h);
    const opts = [[0.95, 0.1], [-0.95, 0.1], [0.95, -0.8], [-0.95, -0.8], [0, -1.8], [0, 1.8], [1.8, 0], [-1.8, 0]]; // 왼쪽(킥스탠드 쪽) 먼저
    let px = b.x + 0.95 * c, pz = b.z - 0.95 * s;
    for (const [lx, lz] of opts) { const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c; if (!world.isBlocked(x, z)) { px = x; pz = z; break; } }
    // 내린 뒤엔 바이크가 다시 장애물이 되므로 위치 한 번 더 확인
    player.position.set(px, ground(px, pz, b.y), pz); player.rotation.y = b.h;
    if (me.saved) { cam.dist = me.saved.dist; cam.pitch = me.saved.pitch; }
    onChange?.();
  }

  // ---------- 물리(아케이드, 304 kg 묵직함: 요레이트/린/윌리에 관성) ----------
  const poseFits = (x, z, h) => { const s = Math.sin(h), c = Math.cos(h), bd = world.bounds;
    if (x < bd.x0 || x > bd.x1 || z < bd.z0 || z > bd.z1) return false;
    for (const [lx, lz] of HULL) if (world.isBlocked(x + lx * c + lz * s, z - lx * s + lz * c, 0.06)) return false; return true; };
  function ride(dt, f, s, boost, wheelie) {
    const vmax = boost ? BOOST_V : MAX_V;
    if (f > 0) b.v += (b.v < -0.1 ? 10 : (boost ? 8.4 : 5.8) * (1 - Math.max(0, b.v) / vmax * 0.72)) * f * dt;
    else if (f < 0) b.v += (b.v > 0.2 ? -10.5 : -1.5) * -f * dt;
    else b.v -= Math.sign(b.v) * Math.min(Math.abs(b.v), (0.9 + 0.0085 * b.v * b.v) * dt);
    b.v = THREE.MathUtils.clamp(b.v, -REV_V, boost ? BOOST_V : Math.max(MAX_V, Math.min(b.v, BOOST_V) - 6 * dt));
    b.throttle = Math.max(0, f);

    // 스페이스바 앞바퀴 들기(윌리): 뒷바퀴 축으로 묵직하게 들어 올리고 놓으면 중력으로 착지
    if (wheelie && b.v >= -0.2) {
      const targetW = MAX_WHEELIE * (0.82 + 0.18 * Math.min(1, Math.abs(b.v) / 8));
      b.wheelieVel += (targetW - b.wheelie) * 18 * dt;
      b.wheelieVel *= Math.max(0, 1 - 6.5 * dt);
      // 정지 상태에서 앞바퀴를 들 때도 살짝 앞으로 치고 나가는 토크감
      if (f <= 0 && b.v < 2.2) b.v = Math.min(2.2, b.v + 2.4 * dt);
    } else {
      b.wheelieVel -= 4.2 * dt; // 중력 복원
    }
    b.wheelie += b.wheelieVel * dt;
    if (b.wheelie <= 0) {
      if (b.wheelieVel < -0.45) b.dive = Math.min(0.032, (b.dive || 0) + Math.abs(b.wheelieVel) * 0.012); // 앞바퀴 착지 서스펜션 바운스
      b.wheelie = 0;
      b.wheelieVel = 0;
    } else if (b.wheelie > MAX_WHEELIE) {
      b.wheelie = MAX_WHEELIE;
      if (b.wheelieVel > 0) b.wheelieVel = 0;
    }

    b.si += THREE.MathUtils.clamp(s - b.si, -2.6 * dt, 2.6 * dt); // 입력 관성
    const av = Math.abs(b.v), yawMax = Math.min(av / R_MIN, (0.78 * G) / Math.max(av, 0.1)); // 저속: 회전반경, 고속: 횡가속 한계(~38° 린)
    const steerScale = b.wheelie > 0.1 ? 0.55 : 1; // 앞바퀴가 들려 있을 때는 조향이 둔해짐
    const want = -b.si * yawMax * steerScale * Math.sign(b.v || 1);
    b.yaw += (want - b.yaw) * Math.min(1, dt * 3.2); // 무게감: 요레이트가 천천히 따라감
    const nh = b.h + b.yaw * dt, nx = b.x + Math.sin(nh) * b.v * dt, nz = b.z + Math.cos(nh) * b.v * dt;
    if (poseFits(nx, nz, nh)) { b.x = nx; b.z = nz; b.h = nh; }
    else if (poseFits(nx, b.z, b.h)) { b.x = nx; b.v *= 0.6; }
    else if (poseFits(b.x, nz, b.h)) { b.z = nz; b.v *= 0.6; }
    else b.v = -b.v * 0.15;
    b.brake = f < 0 && b.v > 0.2;
  }

  const poseUnit = (u, uMesh, uRider, dt, parked) => {
    const uData = uMesh.userData;
    const s = Math.sin(u.h), c = Math.cos(u.h), A = BDIM.WB / 2;
    const yf = ground(u.x + s * A, u.z + c * A, u.y), yr = ground(u.x - s * A, u.z - c * A, u.y);
    u.y = (yf + yr) / 2; u.pitch += (-Math.atan2(yf - yr, BDIM.WB) - u.pitch) * Math.min(1, dt * 10);
    uMesh.position.set(u.x, u.y, u.z); uMesh.rotation.set(u.pitch, u.h, 0, 'YXZ');
    // 린: 원심력과 균형 (lean = atan(v·ω/g)), 주차 중엔 킥스탠드로 왼쪽 기울기
    const av = Math.abs(u.v);
    const leanT = parked ? -0.085 : THREE.MathUtils.clamp(Math.atan((u.v * -u.yaw) / G), -0.68, 0.68) * Math.min(1, av / 2.5);
    u.lean += THREE.MathUtils.clamp(leanT - u.lean, -1.5 * dt, 1.5 * dt);
    uData.lean.rotation.z = u.lean;
    // 앞바퀴 들기(윌리): 뒷바퀴 접지점 축으로 회전 (-x 회전이 앞바퀴 상승)
    if (uData.wheelie) uData.wheelie.rotation.x = -(u.wheelie || 0);
    // 조향각: δ ≈ atan(WB·ω/v) — 저속에선 핸들을 크게, 고속에선 거의 안 꺾음
    const st = av > 0.3 ? Math.atan((BDIM.WB * -u.yaw) / av) : (u.si || 0) * 0.55;
    u.steer += (THREE.MathUtils.clamp(parked ? -0.32 : st, -0.62, 0.62) - u.steer) * Math.min(1, dt * 8);
    uData.steer.rotation.y = -u.steer;
    const rearStep = (u.v / BDIM.R) * dt;
    const frontStep = (u.wheelie > 0.08 ? rearStep * 0.35 : rearStep);
    u.spin[0] += frontStep;
    u.spin[1] = (u.spin[1] || 0) + rearStep;
    uData.frontSpin.rotation.x = u.spin[0];
    uData.rearSpin.rotation.x = u.spin[1];
    // 가감속 피칭(서스펜션)
    const acc = (u.v - (u.pv ?? u.v)) / Math.max(dt, 1e-3); u.pv = u.v;
    u.dive = THREE.MathUtils.lerp(u.dive || 0, THREE.MathUtils.clamp(acc * 0.004, -0.025, 0.02), Math.min(1, dt * 5));
    uData.body.rotation.x = u.dive;
    if (uRider?.visible) poseRider(uRider, uMesh);
  };
  poseUnit(b, mesh, rider, 1, true);

  // ---------- 멀티플레이: state.veh = {id:900(블랙)|901(레드), ry, v, st(=요레이트), wh(=윌리)} ----------
  // 두 관리자가 동시에 타거나 내가 내 바이크를 꺼내 둔 상태에서도 다른 관리자의 바이크가 함께 보이도록 지원
  const extraRemotes = new Map(); // peerId -> { peerId, mesh, rider, audio, x, z, y, h, v, yaw, steer, si, lean, wheelie, spin, pitch, puffT, tx, tz, th, tw }

  function releasePrimaryRemote() {
    if (!b.remote) return;
    const p = remotes?.peers.get(b.rider);
    if (p) p.mesh.visible = true;
    b.remote = null; b.rider = null; b.v = 0; b.yaw = 0; b.wheelie = 0;
    rider.visible = false;
    U.stand.visible = true;
    syncMyTankStyle();
    mesh.visible = summoned;
    b.label.hidden = !summoned;
  }

  function removeExtraRemote(peerId) {
    const rb = extraRemotes.get(peerId);
    if (!rb) return;
    const p = remotes?.peers.get(peerId);
    if (p) p.mesh.visible = true;
    rb.audio?.update(1, { on: false, v: 0, throttle: 0 });
    scene.remove(rb.mesh);
    extraRemotes.delete(peerId);
  }

  function remoteSpot(m, parked) {
    const veh = m.veh || {};
    const tx = parked && Number.isFinite(+veh.x) ? +veh.x : m.x;
    const tz = parked && Number.isFinite(+veh.z) ? +veh.z : m.z;
    return {
      tx, tz,
      th: +veh.ry || 0,
      v: parked ? 0 : (+veh.v || 0),
      yaw: parked ? 0 : (+veh.st || 0),
      tw: parked ? 0 : THREE.MathUtils.clamp(Number(veh.wh ?? m.jy) || 0, 0, MAX_WHEELIE),
      parked,
    };
  }
  function applyOccupant(uMesh, uRider, peerId, parked) {
    const peer = peerId ? remotes?.peers.get(peerId) : null;
    const stand = uMesh.userData.stand;
    uMesh.traverse((obj) => { if (obj.name === 'rider') obj.visible = !parked; });
    if (uRider) uRider.visible = !parked;
    if (stand) stand.visible = !!parked;
    if (peer?.mesh) peer.mesh.visible = !!parked;
  }
  function dressRemote(uMesh, uRider, peer, parked) {
    const stand = uMesh.userData.stand;
    if (parked) {
      if (uRider) uRider.visible = false;
      if (stand) stand.visible = true;
      if (peer) peer.mesh.visible = true;
      return;
    }
    if (peer) {
      const parent = uMesh.userData.wheelieFrame || uMesh.userData.lean;
      if (uRider) parent.remove(uRider);
      const next = buildRider(peer.mesh);
      next.visible = true;
      parent.add(next);
      peer.mesh.visible = false;
      if (stand) stand.visible = false;
      return next;
    }
    if (uRider) uRider.visible = true;
    if (stand) stand.visible = false;
    return uRider;
  }

  if (presence) {
    presence.on('state', (m) => {
      const vid = m.veh?.id;
      if (m.veh && isBikeVehId(vid)) {
        const tankColor = vid === BIKE_VEH_RED_ID ? 'red' : 'black';
        const parked = !!m.veh.pk;
        const spot = remoteSpot(m, parked);
        // 내 바이크가 비어 있고(미탑승·미소환) 아직 주 원격 슬롯이 없거나 같은 피어면 주 바이크 메쉬를 재활용
        if (!me.riding && !summoned && (!b.remote || b.rider === m.id) && !extraRemotes.has(m.id)) {
          const p = remotes?.peers.get(m.id);
          const changed = b.rider !== m.id || !!b.remote?.parked !== parked;
          if (changed) {
            b.rider = m.id;
            const nextRider = dressRemote(mesh, rider, p, parked);
            if (nextRider) rider = nextRider;
            b.x = spot.tx; b.z = spot.tz; b.h = spot.th; b.v = spot.v; b.wheelie = spot.tw;
            mesh.visible = true;
            b.label.hidden = true;
          }
          setBikeTankColor(mesh, tankColor);
          b.remote = { ...spot, tankColor };
          applyOccupant(mesh, rider, m.id, parked);
          return;
        }
        // 내가 이미 바이크를 꺼내 두었거나 타고 있거나, 두 번째 관리자가 동시에 두는 경우 별도 바이크로 표시
        let rb = extraRemotes.get(m.id);
        if (!rb) {
          const rMesh = createBike(renderer, { tankColor });
          scene.add(rMesh);
          const p = remotes?.peers.get(m.id);
          const rRider = dressRemote(rMesh, null, p, parked) || buildRider(p?.mesh || player);
          if (!parked) rRider.visible = true;
          const rAudio = createBikeAudio({ camera, anchor: rMesh.userData.exhaust, params });
          const rFlame = attachExhaustFlame(rMesh.userData.exhaust);
          rb = {
            peerId: m.id, mesh: rMesh, rider: rRider, audio: rAudio, flame: rFlame, parked,
            x: spot.tx, z: spot.tz, y: ground(spot.tx, spot.tz), h: spot.th,
            v: spot.v, yaw: spot.yaw, steer: 0, si: 0, lean: 0, wheelie: spot.tw, spin: [0, 0], pitch: 0, puffT: 0,
            ...spot,
          };
          extraRemotes.set(m.id, rb);
        } else if (!!rb.parked !== parked) {
          const p = remotes?.peers.get(m.id);
          const nextRider = dressRemote(rb.mesh, rb.rider, p, parked);
          if (nextRider) rb.rider = nextRider;
          rb.parked = parked;
        }
        setBikeTankColor(rb.mesh, tankColor);
        Object.assign(rb, spot);
        applyOccupant(rb.mesh, rb.rider, m.id, parked);
      } else {
        if (b.remote && b.rider === m.id) releasePrimaryRemote();
        if (extraRemotes.has(m.id)) removeExtraRemote(m.id);
      }
    });
    presence.on('leave', (m) => {
      if (b.remote && b.rider === m.id) releasePrimaryRemote();
      if (extraRemotes.has(m.id)) removeExtraRemote(m.id);
    });
  }

  return {
    bike: b, mesh,
    audio, // [bikeaudio]
    get riding() { return me.riding; },
    get summoned() { return summoned; },
    get tankColor() { return resolveMyTank(); },
    refreshStyle: syncMyTankStyle,
    mount, dismount, near, summon, stow, toggleSummon,
    holdCam(sec = 5) { me.lastYawInput = me.t + sec; }, // 스크린샷/연출용: 체이스캠 자동복귀 잠시 멈춤
    update(dt, f, s, run, lookYaw, wheelie = false) {
      me.t += dt; reserve = false;
      if (me.riding && Math.hypot(player.position.x - b.x, player.position.z - b.z) > 3) { const keep = player.position.clone(); dismount(); player.position.copy(keep); } // 쇼 텔레포트/H 키
      if (me.riding) {
        ride(dt, f, s, run, wheelie);
        player.position.set(b.x, b.y, b.z); player.rotation.y = b.h;
        if (Math.abs(lookYaw) > 1e-4) me.lastYawInput = me.t;
        if (cam.mode === 'follow' && me.t - me.lastYawInput > 1.2) { const want = b.h + Math.PI, d = Math.atan2(Math.sin(want - cam.yaw), Math.cos(want - cam.yaw)); cam.yaw += d * Math.min(1, dt * (Math.abs(b.v) > 1 ? 3.2 : 1)); }
        hudV.textContent = Math.round(Math.abs(b.v) * 3.6); setBikeBrake(mesh, b.brake);
        poseUnit(b, mesh, rider, dt, false);
      } else if (b.remote) {
        const r = b.remote, k = Math.min(1, dt * 8);
        b.x += (r.tx - b.x) * k; b.z += (r.tz - b.z) * k; b.h += Math.atan2(Math.sin(r.th - b.h), Math.cos(r.th - b.h)) * k;
        b.v = r.v; b.yaw = r.yaw; b.wheelie += ((r.tw || 0) - b.wheelie) * Math.min(1, dt * 10);
        applyOccupant(mesh, rider, b.rider, !!r.parked);
        poseUnit(b, mesh, rider, dt, !!r.parked);
      } else if (summoned && (me.wasActive || Math.abs(b.lean + 0.085) > 1e-3 || b.wheelie > 1e-3)) {
        b.wheelie = Math.max(0, b.wheelie - 3.5 * dt);
        poseUnit(b, mesh, rider, dt, true);
      }
      for (const rb of extraRemotes.values()) {
        const k = Math.min(1, dt * 8);
        rb.x += (rb.tx - rb.x) * k; rb.z += (rb.tz - rb.z) * k;
        rb.h += Math.atan2(Math.sin(rb.th - rb.h), Math.cos(rb.th - rb.h)) * k;
        rb.wheelie += ((rb.tw || 0) - rb.wheelie) * Math.min(1, dt * 10);
        applyOccupant(rb.mesh, rb.rider, rb.peerId, !!rb.parked);
        poseUnit(rb, rb.mesh, rb.rider, dt, !!rb.parked);
        rb.audio?.update(dt, { on: !rb.parked, v: rb.v, throttle: rb.parked ? 0 : (rb.wheelie > 0.05 ? 0.65 : 0.25) });
      }
      me.wasActive = me.riding || !!b.remote;
      updSmoke(dt);
      const effThrottle = me.riding ? Math.max(b.throttle || 0, b.wheelie > 0.05 ? 0.7 : 0) : 0;
      audio?.update(dt, { on: me.riding || (!!b.remote && !b.remote.parked), v: b.v, throttle: effThrottle }); // [bikeaudio]
      const n = !me.riding && canMount();
      document.body.classList.toggle('bike-near', n);
      if (me.riding) { prompt.style.display = 'block'; prompt.innerHTML = '<kbd>F</kbd>Get off / 내리기'; }
      else if (n) { prompt.style.display = 'block'; prompt.innerHTML = `<kbd>F</kbd>Ride / 탑승 · Admin Cruiser (${b.tankColor === 'red' ? 'Red' : 'Black'})`; }
      else prompt.style.display = 'none';
      return me.riding;
    },
    net() {
      if (!me.riding && !summoned) return null;
      const vid = resolveMyTank() === 'red' ? BIKE_VEH_RED_ID : BIKE_VEH_ID;
      if (!me.riding) {
        return { veh: { id: vid, pk: 1, x: +b.x.toFixed(2), z: +b.z.toFixed(2), ry: +b.h.toFixed(3), v: 0, st: 0 } };
      }
      const wh = +b.wheelie.toFixed(3);
      return { ry: b.h, moving: Math.abs(b.v) > 0.3 || wh > 0.02, jy: wh, veh: { id: vid, ry: +b.h.toFixed(3), v: +b.v.toFixed(2), st: +b.yaw.toFixed(3), wh } };
    },
  };
}
