// [myeongdong-npc] 명동 사람들 — 게임 표준 아바타(createAvatar/animateAvatar) + buildCrowd 인스턴싱(부품별 InstancedMesh).
//   예전 명동 전용 '상자 몸 + 공 머리'(personGeos, 320/170명 전역 배치)를 바꾼다.
//   - 보행자: 관광객·쇼핑객. 길(OSM 보행로 · 차도 양옆 보도) 위를 오가며, 시점 PLACE_R 안에만 배치하고 SHOW_R 밖은 숨긴다.
//     모자(캡·버킷·비니)·백팩/크로스백/토트·선글라스, 쇼핑백(손에 든 종이백), 여행 캐리어, 둘이 나란히 걷는 커플.
//   - 노점 상인: 흰 긴팔 + 앞치마(색 몇 가지) + 두건/비니, 열린 노점 옆에 서서 손님 쪽을 본다.
//   - 화장품 가게 호객 직원: 브랜드색 유니폼 + 같은 색 캡, 가게 앞에서 거리 쪽을 보고 가끔 돌아본다.
//   상인·직원은 위치가 고정이라 가까운 자리만 작은 풀로 돌려 쓴다.
//   draw = 아바타 부품 종류(≈20) + 얼굴(피부×머리색, ≤12) + 소품 4(쇼핑백 몸·끈 · 캐리어 몸·손잡이) + 앞치마 1.
//   소품 몸은 그냥 Lambert(인스턴스 색) → 색이 달라도 1 draw.
import * as THREE from 'three';
import { createAvatar, animateAvatar } from '../../entities/avatar.js';
import { buildCrowd } from '../../entities/avatarCrowd.js';
import { gameHour } from '../../weather.js';

const SHOW_R = 120, LOD_R = 50, PLACE_R = 130, REPLACE_R = 175, WORK_R = 95;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// 관광객 팔레트 (명동 늦가을: 코트·패딩·니트 + 원색 몇)
const TOPS = ['#f4f4f2', '#2f3a4a', '#c9ced6', '#e8e0d2', '#1f2a44', '#8b5e3c', '#d35454', '#5d7fb5', '#f0c75e', '#3b3f45', '#9b6fb0', '#ffffff', '#b5838d', '#2a9d8f', '#ff8fab', '#6c757d'];
const PANTS = ['#2b2f36', '#3c4350', '#5a6170', '#8a7f6c', '#34495e', '#22262b', '#4b5f86', '#d6ccc2', '#1d3557'];
const SKINS = ['#f2d0b0', '#e8c4a8', '#f6d7c3', '#d7a888'];
const HAIRS = ['#1a1a1a', '#1a1a1a', '#2a211c', '#4a3428', '#c9a227']; // 얼굴 재질 키에 머리색이 들어가서 3종(+금발 드물게)만
const HATS = [['cap', '#1f2a44'], ['cap', '#ffffff'], ['cap', '#d62828'], ['bucket', '#e8e0d2'], ['bucket', '#2b2f36'], ['beanie', '#3b3f45'], ['beanie', '#c9184a'], ['beret', '#8b5e3c']];
const BAGS = [['backpack', '#2d3436'], ['backpack', '#457b9d'], ['crossbody', '#8e6e53'], ['crossbody', '#2b2f36'], ['tote', '#e8e0d2'], ['tote', '#d4a373']];
const SHOPBAG = ['#ffffff', '#ff8fab', '#1a1a1a', '#c8a27a', '#e63946', '#a8dadc', '#ffd166', '#6a4c93'];
const CASE = ['#2b2f36', '#adb5bd', '#e9c46a', '#e76f51', '#457b9d', '#f1faee', '#ff99c8'];
const PROMO = ['#ff4f9a', '#13b6c9', '#2f8f5b', '#7a3cff', '#e60012', '#ff7b00'];
const APRON = ['#c1121f', '#1d3557', '#2d6a4f', '#3a3a3a', '#e85d04'];

function touristLook(r) {
  const pick = (a) => a[Math.floor(r() * a.length)], f = r() < 0.56;
  const look = { color: pick(TOPS), pants: pick(PANTS), gender: f ? 'f' : 'm', skin: pick(SKINS), hairColor: pick(HAIRS),
    hair: f ? pick(['long', 'pony', 'medium', 'short']) : pick(['short', 'short', 'medium']) };
  const t = r(); if (t < 0.22) look.top = 'hoodie'; else if (t < 0.3) look.top = 'short';
  if (r() < 0.2) look.pattern = pick(['stripe', 'block']);
  if (r() < 0.34) { const [h, c] = pick(HATS); look.hat = h; look.hatColor = c; }
  if (r() < 0.5) { const [b, c] = pick(BAGS); look.bag = b; look.bagColor = c; }
  if (r() < 0.16) look.glasses = pick(['sun', 'round', 'square']);
  if (r() < 0.1) look.mask = 'cloth';
  if (r() < 0.12) look.neck = 'scarf';
  return look;
}

// 소품 지오메트리 (모듈 1회, 원점 = 붙는 자리)
let G = null;
function propGeo() {
  if (G) return G;
  const box = (sx, sy, sz, x, y, z) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); return g; };
  G = {
    // 쇼핑백: 오른손(팔 끝 −0.66) 밑에 매달림
    bag: box(0.28, 0.32, 0.11, 0, -0.98, 0.02),
    bagHandle: (() => { const g = new THREE.TorusGeometry(0.07, 0.008, 4, 10, Math.PI); g.translate(0, -0.82, 0.02); return g; })(),
    // 캐리어: 몸 오른쪽 뒤, 바퀴로 굴림 (rig 기준)
    case: box(0.36, 0.52, 0.22, 0.42, 0.33, -0.34),
    caseHandle: (() => {
      const a = box(0.016, 0.5, 0.016, 0.36, 0.84, -0.34), b = box(0.016, 0.5, 0.016, 0.48, 0.84, -0.34), c = box(0.15, 0.03, 0.03, 0.42, 1.09, -0.34);
      const w1 = box(0.05, 0.06, 0.05, 0.29, 0.05, -0.27), w2 = box(0.05, 0.06, 0.05, 0.55, 0.05, -0.27);
      const list = [a, b, c, w1, w2];
      const pos = [], idx = []; let base = 0;
      for (const g of list) { const p = g.attributes.position.array; for (const v of p) pos.push(v); for (const i of g.index.array) idx.push(i + base); base += p.length / 3; g.dispose(); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
    })(),
    // 앞치마: 몸 앞 (rig 기준)
    apron: box(0.4, 0.62, 0.02, 0, 0.86, 0.215),
  };
  for (const g of Object.values(G)) g.computeBoundingSphere();
  return G;
}
const dark = new THREE.MeshLambertMaterial({ color: '#2b2b2b' });
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });

/**
 * @param {object} o
 * @param {THREE.Object3D} o.parent
 * @param {Array} o.paths  [{pts, cum, L, w, weight, stall}]
 * @param {Array} o.vendors [[x,z,ry]] 노점 순서와 같음 (열린 노점 = 앞에서부터 openN 개)
 * @param {Array} o.promoters [[x,z,ry]]
 * @param {(x,z)=>number} o.heightAt
 */
export function createMyeongdongNpc({ parent, paths, vendors = [], promoters = [], heightAt, openStalls = () => vendors.length, mobile = false, seed = 20261114, getHour = () => { try { return gameHour(); } catch { return 20; } }, force = 0 } = {}) {
  const holder = new THREE.Group(); holder.name = 'myeongdong-npc'; parent?.add(holder);
  const crowd = buildCrowd(holder, { name: 'myeongdongCrowd' });
  let rs = seed; const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const PG = propGeo();
  const POOL = force || (mobile ? 80 : 150), VPOOL = mobile ? 14 : 26, PPOOL = mobile ? 8 : 14;

  // ---------- 보행자 ----------
  const peds = [];
  for (let i = 0; i < POOL; i++) {
    const look = touristLook(rnd);
    const mesh = createAvatar(look); const u = mesh.userData;
    const extra = {};
    const roll = rnd();
    if (roll < 0.3 && u.armR) { // 쇼핑백 (1~2개)
      const b = new THREE.Mesh(PG.bag, lam(pick(SHOPBAG))); const h = new THREE.Mesh(PG.bagHandle, dark);
      u.armR.add(b, h); extra.bag = true;
      if (rnd() < 0.35 && u.armL) { const b2 = new THREE.Mesh(PG.bag, lam(pick(SHOPBAG))); const h2 = new THREE.Mesh(PG.bagHandle, dark); u.armL.add(b2, h2); }
    } else if (roll < 0.42 && !look.bag) { // 여행 캐리어
      const c = new THREE.Mesh(PG.case, lam(pick(CASE))); const h = new THREE.Mesh(PG.caseHandle, dark);
      u.rig.add(c, h); extra.suitcase = true;
    }
    for (const m of [mesh]) m.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    mesh.visible = false;
    peds.push({ i, mesh, look, ...extra, parts: crowd.register(mesh), path: null, s: 0, dir: 1, lat: 0, speed: 1, idle: 0, shown: false, leader: null, follower: null });
  }
  // 커플: 짝수-홀수 일부를 묶는다 (따라가는 쪽은 앞사람 경로를 옆으로 0.6 m)
  for (let i = 1; i < peds.length; i += 2) if (rnd() < 0.36) { peds[i].leader = peds[i - 1]; peds[i - 1].follower = peds[i]; }

  // ---------- 노점 상인 · 호객 직원 ----------
  const mkWorker = (kind, k) => {
    const f = rnd() < (kind === 'promo' ? 0.7 : 0.45);
    const look = kind === 'promo'
      ? { color: PROMO[k % PROMO.length], pants: '#22262b', gender: f ? 'f' : 'm', skin: pick(SKINS), hairColor: '#1a1a1a', hair: f ? pick(['pony', 'long']) : 'short', top: 'long', hat: 'cap', hatColor: '#ffffff' }
      : { color: '#f4f4f2', pants: '#3c4350', gender: f ? 'f' : 'm', skin: pick(SKINS), hairColor: '#1a1a1a', hair: 'short', top: 'long', hat: rnd() < 0.5 ? 'band' : 'beanie', hatColor: rnd() < 0.5 ? '#c1121f' : '#2b2f36' };
    const mesh = createAvatar(look); const u = mesh.userData;
    if (kind === 'vendor') u.rig.add(new THREE.Mesh(PG.apron, lam(APRON[k % APRON.length])));
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    mesh.visible = false;
    return { kind, mesh, parts: crowd.register(mesh), spot: -1, yaw0: 0, look: 0, lookT: rnd() * 6 };
  };
  const vWork = Array.from({ length: Math.min(VPOOL, vendors.length) }, (_, k) => mkWorker('vendor', k));
  const pWork = Array.from({ length: Math.min(PPOOL, promoters.length) }, (_, k) => mkWorker('promo', k));
  crowd.finalize();

  // ---------- 배치 ----------
  // 길을 8 m 칸으로 잘라 둔다 → 시점 근처 칸에서 가중치로 고름
  const slots = [];
  for (const p of paths) for (let s = 2; s < p.L - 2; s += 8) { const q = along(p, s); slots.push({ p, s, x: q[0], z: q[1], w: p.weight / Math.max(1, p.L) }); }
  let nearSlots = [], nearW = 0, nearAt = null;
  const refreshNear = (fx, fz) => {
    if (nearAt && Math.hypot(nearAt[0] - fx, nearAt[1] - fz) < 12) return;
    nearAt = [fx, fz]; nearSlots = []; nearW = 0;
    for (const s of slots) if (Math.abs(s.x - fx) < PLACE_R && Math.abs(s.z - fz) < PLACE_R) { nearSlots.push(s); nearW += s.w; }
  };
  const latFor = (p) => {
    let lat = (rnd() * 2 - 1) * Math.max(0.2, p.w / 2 - 0.8);
    if (p.stall && Math.abs(lat) < 1.6) lat = Math.sign(lat || 1) * (1.6 + rnd() * Math.max(0.2, p.w / 2 - 2.2));
    return lat;
  };
  function place(a) {
    if (!nearSlots.length) return false;
    let r = rnd() * nearW, sl = nearSlots[0];
    for (const s of nearSlots) { r -= s.w; if (r <= 0) { sl = s; break; } }
    Object.assign(a, { path: sl.p, s: Math.min(sl.p.L, Math.max(0, sl.s + (rnd() - 0.5) * 8)), dir: rnd() < 0.5 ? 1 : -1, lat: latFor(sl.p), speed: (a.suitcase ? 0.95 : 0.8) + rnd() * 0.5, idle: 0, leaving: false });
    if (a.follower) { const f = a.follower; Object.assign(f, { path: a.path, s: a.s, dir: a.dir, speed: a.speed, idle: 0 }); const off = a.lat > 0 ? -0.62 : 0.62; f.lat = a.lat + off; }
    return true;
  }
  const density = (h) => { const x = ((h % 24) + 24) % 24; return x < 6 ? 0.18 : x < 9 ? 0.35 : x < 11 ? 0.6 : x < 22 ? 1 : x < 23.5 ? 0.6 : 0.3; };
  const hide = (a) => { a.path = null; a.shown = false; a.mesh.visible = false; };

  let chk = 99, dAcc = 99, want = POOL, asleep = true, wAt = null;
  const stats = { pool: POOL, active: 0, visible: 0, couples: peds.filter((p) => p.leader).length, bags: peds.filter((p) => p.bag).length, suitcases: peds.filter((p) => p.suitcase).length, vendors: 0, promoters: 0, cpuMs: 0, draws: 0, tris: 0 };

  function assignWorkers(pool, spots, n, fx, fz) {
    const cand = [];
    for (let k = 0; k < n; k++) { const [x, z] = spots[k]; const d = Math.hypot(x - fx, z - fz); if (d < WORK_R) cand.push([d, k]); }
    cand.sort((a, b) => a[0] - b[0]);
    const keep = new Set(cand.slice(0, pool.length).map((c) => c[1]));
    for (const w of pool) if (w.spot >= 0 && !keep.has(w.spot)) w.spot = -1;
    const used = new Set(pool.map((w) => w.spot));
    for (const k of keep) { if (used.has(k)) continue; const w = pool.find((q) => q.spot < 0); if (!w) break; w.spot = k; used.add(k); }
  }

  function update(dt, fx, fz) {
    const t0 = now();
    dt = Math.min(dt, 0.1);
    crowd.begin();
    chk += dt; dAcc += dt;
    if (dAcc > 2) { dAcc = 0; want = Math.round(POOL * density(getHour())); }
    const check = chk > 0.8; if (check) chk = 0;
    if (check) refreshNear(fx, fz);
    let act = 0, vis = 0, placedNow = 0;
    for (const a of peds) {
      if (a.leader) continue; // 짝은 앞사람이 움직인다
      if (!a.path) {
        if (a.i < want && check && placedNow < 10 && place(a)) placedNow++;
        if (!a.path) { if (a.follower) hide(a.follower); continue; }
      }
      if (a.i >= want && check && !a.shown) { hide(a); if (a.follower) hide(a.follower); continue; }
      let v = 0;
      if (a.idle > 0) a.idle -= dt;
      else {
        v = a.speed; a.s += a.dir * v * dt;
        if (a.s <= 0 || a.s >= a.path.L) { a.s = Math.max(0, Math.min(a.path.L, a.s)); a.dir *= -1; a.idle = 0.5 + rnd() * 2; v = 0; }
        else if (rnd() < dt * 0.025) { a.idle = 1.5 + rnd() * 3; v = 0; } // 구경하느라 멈춤
      }
      for (const b of a.follower ? [a, a.follower] : [a]) {
        if (b !== a) { b.s = a.s; b.dir = a.dir; }
        const [x, z, tx, tz] = along(a.path, a.s);
        const px = x - tz * b.lat, pz = z + tx * b.lat;
        const d = Math.hypot(px - fx, pz - fz);
        if (check && d > REPLACE_R) { hide(a); if (a.follower) hide(a.follower); break; }
        act++;
        b.mesh.position.set(px, heightAt(px, pz), pz);
        b.mesh.rotation.y = Math.atan2(tx * a.dir, tz * a.dir);
        const near = d < SHOW_R; b.mesh.visible = near; b.shown = near;
        if (!near) continue;
        vis++;
        animateAvatar(b.mesh, v, dt);
        crowd.add(b.mesh, b.parts, d > LOD_R);
      }
    }
    // 상인·직원: 1초마다 가까운 자리로 다시 배정
    if (check && (!wAt || Math.hypot(wAt[0] - fx, wAt[1] - fz) > 6)) {
      wAt = [fx, fz];
      assignWorkers(vWork, vendors, Math.min(vendors.length, openStalls()), fx, fz);
      assignWorkers(pWork, promoters, promoters.length, fx, fz);
    }
    let nv = 0, np = 0;
    for (const w of vWork.concat(pWork)) {
      if (w.spot < 0) { w.mesh.visible = false; continue; }
      const sp = w.kind === 'vendor' ? vendors[w.spot] : promoters[w.spot];
      if (w.kind === 'vendor' && w.spot >= openStalls()) { w.spot = -1; w.mesh.visible = false; continue; }
      const [x, z, ry] = sp, d = Math.hypot(x - fx, z - fz);
      w.lookT -= dt; if (w.lookT <= 0) { w.lookT = 2.5 + rnd() * 5; w.look = (rnd() - 0.5) * (w.kind === 'promo' ? 1.4 : 0.8); }
      w.yaw0 += (w.look - w.yaw0) * Math.min(1, dt * 3);
      w.mesh.position.set(x, heightAt(x, z), z); w.mesh.rotation.y = ry + w.yaw0;
      w.mesh.visible = d < SHOW_R; if (!w.mesh.visible) continue;
      if (w.kind === 'vendor') nv++; else np++;
      animateAvatar(w.mesh, 0, dt);
      crowd.add(w.mesh, w.parts, d > LOD_R);
    }
    crowd.end();
    asleep = false;
    let draws = 0, tris = 0;
    if (check) { for (const P of crowd.parts.values()) if (P.im?.visible && P.im.count) { draws++; tris += P.im.count * triCount(P.geo); } stats.draws = draws; stats.tris = tris; }
    Object.assign(stats, { active: act, visible: vis, vendors: nv, promoters: np, want });
    stats.cpuMs = stats.cpuMs * 0.95 + (now() - t0) * 0.05;
  }
  function sleep() {
    if (asleep) return;
    asleep = true; crowd.begin(); crowd.end();
    for (const a of peds) hide(a);
    for (const w of vWork.concat(pWork)) { w.spot = -1; w.mesh.visible = false; }
    wAt = null; nearAt = null;
  }
  return {
    group: holder, stats, peds, workers: { vendors: vWork, promoters: pWork },
    update, sleep,
    dispose() { holder.removeFromParent(); for (const P of crowd.parts.values()) { P.im?.dispose?.(); if (P.lam) P.im?.material?.dispose?.(); } },
  };
}

function triCount(g) { return g.index ? g.index.count / 3 : g.attributes.position.count / 3; }
function along(p, s) {
  const pts = p.pts, cum = p.cum;
  let i = 1; while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, t = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
  const tx = (b[0] - a[0]) / seg, tz = (b[1] - a[1]) / seg;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, tx, tz];
}
