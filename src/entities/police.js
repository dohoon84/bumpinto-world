// 순찰차. 차도를 돌고, 신호 횡단보도를 빨간불(또는 깜빡임)에 건너면 가까이 와서 경고만 한다.
import * as THREE from 'three';
import { createAvatar, animateAvatar } from './avatar.js';
import { Bubble } from '../overlay.js';
import { isEvening, watchEvening } from '../evening.js';
import { addVehicleLamp } from '../vehicleLights.js';

const CAR = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'trunk', 'primary_link', 'secondary_link', 'tertiary_link']);
const SPEED = { primary: 12, secondary: 11, tertiary: 9, residential: 7, unclassified: 7, trunk: 13, primary_link: 9, secondary_link: 8, tertiary_link: 7 };
const LINES = [
  '신호 있는 횡단보도예요. 빨간불에는 건너지 마세요.',
  '무단횡단은 위험합니다. 초록불을 기다려 주세요.',
  '여기서는 보행 신호가 초록일 때만 건너요.',
];

const paintMat = new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.32, metalness: 0.18 });
const blueMat = new THREE.MeshStandardMaterial({ color: '#0c3f86', roughness: 0.4, metalness: 0.08 });
const glassMat = new THREE.MeshStandardMaterial({ color: '#9ec4d8', emissive: '#ffc98a', emissiveIntensity: 0, roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.42 });
const headLampMat = new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#fff1c2', emissiveIntensity: 0.55, roughness: 0.3 });
const tailLampMat = new THREE.MeshStandardMaterial({ color: '#c62828', emissive: '#ff3b3b', emissiveIntensity: 0.35, roughness: 0.4 });
watchEvening((on) => {
  headLampMat.emissiveIntensity = on ? 0.35 : 0.08;
  tailLampMat.emissiveIntensity = on ? 0.3 : 0.06;
  glassMat.emissiveIntensity = on ? 0.55 : 0;
});
const trimMat = new THREE.MeshStandardMaterial({ color: '#2a2e33', roughness: 0.55, metalness: 0.4 });
const rubberMat = new THREE.MeshStandardMaterial({ color: '#1a1c1f', roughness: 0.85, metalness: 0.02 });
const rimMat = new THREE.MeshStandardMaterial({ color: '#c5c8ce', roughness: 0.28, metalness: 0.75 });

function sedanShell() {
  const s = new THREE.Shape();
  s.moveTo(2.38, 0.3);
  s.lineTo(2.46, 0.46);
  s.lineTo(2.28, 0.66);
  s.lineTo(1.85, 0.8);
  s.lineTo(0.95, 0.88);
  s.lineTo(0.48, 0.94);
  s.lineTo(-0.02, 1.3);
  s.lineTo(-1.05, 1.34);
  s.lineTo(-1.52, 1.08);
  s.lineTo(-2.05, 0.9);
  s.lineTo(-2.38, 0.74);
  s.lineTo(-2.46, 0.44);
  s.lineTo(-2.32, 0.3);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1.7, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.045, bevelSegments: 2 });
  geo.rotateY(-Math.PI / 2);
  geo.translate(0.85, 0, 0);
  return geo;
}

function sideLivery() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 160;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 512, 160);
  g.fillStyle = '#0c3f86';
  g.fillRect(0, 96, 512, 64);
  g.fillStyle = '#f4f7fb';
  for (let i = 0; i < 16; i++) if (i % 2 === 0) g.fillRect(i * 32, 96, 16, 18);
  g.fillStyle = '#0c3f86';
  g.font = 'bold 78px "Arial", sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('POLICE', 28, 58);
  g.font = 'bold 36px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  g.fillText('경찰', 330, 62);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
}

function createPoliceCar() {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(sedanShell(), paintMat, 0, 0, 0);
  const win = new THREE.Shape();
  win.moveTo(0.42, 0.98);
  win.lineTo(-0.05, 1.26);
  win.lineTo(-1.02, 1.28);
  win.lineTo(-1.4, 1.06);
  win.lineTo(-1.15, 0.98);
  win.closePath();
  const winGeo = new THREE.ExtrudeGeometry(win, { depth: 1.48, bevelEnabled: false });
  winGeo.rotateY(-Math.PI / 2);
  winGeo.translate(0.74, 0, 0);
  const glass = new THREE.Mesh(winGeo, glassMat);
  glass.castShadow = false;
  g.add(glass);
  add(new THREE.BoxGeometry(1.74, 0.12, 3.15), blueMat, 0, 0.58, -0.05);
  const livery = sideLivery();
  for (const side of [1, -1]) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 0.58), livery);
    decal.position.set(side * 0.9, 0.92, -0.15);
    decal.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    decal.renderOrder = 2;
    g.add(decal);
  }
  add(new THREE.BoxGeometry(1.2, 0.28, 0.08), trimMat, 0, 0.62, 2.42);
  for (const x of [-0.58, 0.58]) {
    add(new THREE.BoxGeometry(0.42, 0.16, 0.06), headLampMat, x, 0.72, 2.4);
    add(new THREE.BoxGeometry(0.46, 0.14, 0.05), tailLampMat, x, 0.72, -2.42);
  }
  add(new THREE.BoxGeometry(0.46, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: '#f7f7f7', roughness: 0.5 }), 0, 0.42, 2.48);
  add(new THREE.BoxGeometry(0.46, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: '#f7f7f7', roughness: 0.5 }), 0, 0.42, -2.48);
  const beams = new THREE.Group();
  beams.name = 'eveningLights';
  for (const x of [-0.58, 0.58]) {
    addVehicleLamp(beams, { x, y: 0.74, z: 2.48, kind: 'head', lens: [0.46, 0.22], glow: [0.92, 0.56], beam: [5.4, 0.7] });
    addVehicleLamp(beams, { x, y: 0.74, z: -2.48, dir: -1, kind: 'tail', lens: [0.42, 0.16], glow: [0.62, 0.36], beam: [1.8, 0.32] });
  }
  beams.visible = isEvening();
  g.add(beams);
  watchEvening((on) => { beams.visible = on; });
  for (const x of [-1, 1]) {
    const mirror = add(new THREE.BoxGeometry(0.16, 0.1, 0.22), trimMat, x * 0.92, 1.05, 0.55);
    mirror.castShadow = true;
  }

  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 16);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.24, 12);
  rimGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.92, 1.45], [0.92, 1.45], [-0.92, -1.45], [0.92, -1.45]]) {
    const hub = new THREE.Group();
    hub.position.set(x, 0.33, z);
    const tire = new THREE.Mesh(tireGeo, rubberMat);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    tire.castShadow = rim.castShadow = true;
    hub.add(tire, rim);
    g.add(hub);
    wheels.push(hub);
  }

  const bar = new THREE.Group();
  bar.position.set(0, 1.4, -0.35);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.1, 0.32), trimMat);
  housing.castShadow = true;
  bar.add(housing);
  const cover = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.08, 0.26), new THREE.MeshStandardMaterial({ color: '#d7e4ee', transparent: true, opacity: 0.35, roughness: 0.1 }));
  cover.position.y = 0.08;
  bar.add(cover);
  const lamps = [];
  for (let i = 0; i < 4; i++) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.18), new THREE.MeshBasicMaterial({ color: i % 2 ? '#2458d6' : '#c42323' }));
    lamp.position.set(-0.38 + i * 0.25, 0.08, 0);
    bar.add(lamp);
    lamps.push(lamp);
  }
  const beacon = new THREE.Group();
  beacon.position.y = 0.18;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#dfe7ee', transparent: true, opacity: 0.45, roughness: 0.05 }));
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: '#ff2d2d' }));
  red.position.set(0, 0.04, 0.05);
  const blu = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: '#3c78ff' }));
  blu.position.set(0, 0.04, -0.05);
  beacon.add(dome, red, blu);
  bar.add(beacon);
  g.add(bar);
  g.userData = { lamps, beacon, wheels };
  return g;
}

export class Police {
  constructor(scene, overlay, { drive, data, transit, world, count = 2, seed = 11 }) {
    this.scene = scene;
    this.overlay = overlay;
    this.transit = transit;
    this.world = world;
    this.groundY = world?.groundY || null;
    this.list = [];
    this.cool = 8;
    this.busy = null;
    this.line = 0;
    let s = seed;
    this.rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this._graph(drive, data);
    this.sigs = (transit?.crossings || []).filter((c) => c.sig);
    for (let i = 0; i < count; i++) this._spawn(i);
  }

  _graph(drive, data) {
    const nodes = [], ways = [];
    if (drive?.nodes?.length) {
      for (const n of drive.nodes) nodes.push({ x: n[0], z: n[1], out: [] });
      for (const w of drive.ways) if (CAR.has(w.k)) ways.push(w);
    } else {
      const key = new Map();
      const nid = (x, z) => {
        const k = Math.round(x * 2) + ',' + Math.round(z * 2);
        if (!key.has(k)) { key.set(k, nodes.length); nodes.push({ x, z, out: [] }); }
        return key.get(k);
      };
      for (const r of data.roads) if (CAR.has(r.k)) ways.push({ k: r.k, w: r.w, ow: 0, n: r.p.map(([x, z]) => nid(x, z)) });
    }
    for (const [wi, w] of ways.entries()) {
      for (let i = 1; i < w.n.length; i++) {
        const a = w.n[i - 1], b = w.n[i];
        if (a === b) continue;
        if ((w.ow ?? 0) >= 0) nodes[a].out.push({ to: b, way: wi });
        if ((w.ow ?? 0) <= 0) nodes[b].out.push({ to: a, way: wi });
      }
    }
    this.nodes = nodes;
    this.ways = ways;
    this.station = data.station || { x: 0, z: 0 };
    this.starts = [];
    nodes.forEach((n, i) => { if (n.out.length) this.starts.push(i); });
  }

  _spawn(i) {
    const mesh = createPoliceCar();
    this.scene.add(mesh);
    const officer = createAvatar({ color: '#1d4e89', pants: '#1a2333', hat: '#142033', skin: '#e8c4a8', gender: 'm', face: 'square', hair: 'short', top: 'long' });
    officer.visible = false;
    this.scene.add(officer);
    const bubble = new Bubble(this.overlay, 'npc', () => officer.position.clone().setY(officer.position.y + 2.3), { name: '경찰관' });
    const tag = this.overlay.add({ cls: 'tag', text: '경찰', getPos: () => mesh.position.clone().setY(mesh.position.y + 2.3), maxDist: 42 });
    const car = { i, mesh, officer, bubble, tag, v: 6, s: 0, pts: [], cum: [], node: 0, prev: -1, state: 'patrol', heading: 0, mode: 'patrol' };
    this.list.push(car);
    const st = this.station;
    const near = this.starts.filter((i) => Math.hypot(this.nodes[i].x - st.x, this.nodes[i].z - st.z) < 240);
    const pool = near.length ? near : this.starts;
    const from = pool[Math.floor(this.rnd() * pool.length)] ?? 0;
    car.node = from;
    car.prev = -1;
    this._extend(car, null);
    car.s = this.rnd() * Math.min(30, (car.cum.at(-1) || 1) * 0.4);
    this._pose(car, 0);
  }

  _off(way, dx, dz) {
    const off = Math.max(1.3, Math.min((way.w || 8) / 2 - 1.1, 2.8));
    return [-dz * off, dx * off];
  }

  _append(car, e) {
    const a = this.nodes[car.node], b = this.nodes[e.to], way = this.ways[e.way];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 0.4) { car.prev = car.node; car.node = e.to; return; }
    const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    const [ox, oz] = this._off(way, dx, dz);
    const A = [a.x + ox, a.z + oz], B = [b.x + ox, b.z + oz];
    if (!car.pts.length) { car.pts.push(A); car.cum.push(0); }
    const last = car.pts.at(-1);
    car.pts.push(B);
    car.cum.push(car.cum.at(-1) + Math.hypot(B[0] - last[0], B[1] - last[1]));
    car.prev = car.node;
    car.node = e.to;
    car.vmax = SPEED[way.k] || 8;
  }

  _pick(car, goal) {
    const n = this.nodes[car.node];
    let opts = n.out.filter((e) => e.to !== car.prev);
    if (!opts.length) opts = n.out.slice();
    if (!opts.length) return null;
    if (!goal) {
      const st = this.station;
      let best = opts[0], bs = -1;
      for (const e of opts) {
        const m = this.nodes[e.to];
        const far = Math.hypot(m.x - st.x, m.z - st.z);
        const s = this.rnd() * (far < 320 ? 2.4 : 0.25);
        if (s > bs) { bs = s; best = e; }
      }
      return best;
    }
    let best = opts[0], bd = Infinity;
    for (const e of opts) {
      const m = this.nodes[e.to];
      const d = Math.hypot(m.x - goal.x, m.z - goal.z) + (e.to === car.prev ? 40 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  _extend(car, goal) {
    let guard = 0;
    while ((car.cum.at(-1) || 0) - car.s < (goal ? 40 : 80) && guard++ < 24) {
      const e = this._pick(car, goal);
      if (!e) return;
      this._append(car, e);
    }
  }

  _sample(car, s) {
    const c = car.cum;
    if (c.length < 2) {
      const n = this.nodes[car.node] || { x: 0, z: 0 };
      return [n.x, n.z, 0, 1];
    }
    let i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    const a = car.pts[i - 1], b = car.pts[i];
    const L = c[i] - c[i - 1] || 1;
    const k = Math.max(0, Math.min(1, (s - c[i - 1]) / L));
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, (b[0] - a[0]) / L, (b[1] - a[1]) / L];
  }

  _trim(car) {
    while (car.cum.length > 4 && car.cum[1] < car.s - 20) {
      const d = car.cum[1];
      car.pts.shift();
      car.cum.shift();
      for (let i = 0; i < car.cum.length; i++) car.cum[i] -= d;
      car.s -= d;
    }
  }

  _inZone(c, x, z) {
    const [dx, dz] = c.dir, nx = -dz, nz = dx;
    const depth = c.depth || 2.2;
    return Math.abs((x - c.x) * dx + (z - c.z) * dz) < depth + 0.6 && Math.abs((x - c.x) * nx + (z - c.z) * nz) < c.w / 2 + 0.15;
  }

  _lights(car, dt, hot) {
    const u = car.mesh.userData;
    u.beacon.rotation.y += dt * (hot ? 9 : 3.2);
    const step = Math.floor(performance.now() / (hot ? 90 : 220));
    u.lamps.forEach((lamp, i) => {
      const on = hot ? (step + i) % 2 === 0 : (step % 4) === i;
      lamp.material.color.set(on ? (i % 2 ? '#4d8cff' : '#ff2a2a') : '#2a1214');
    });
  }

  _dispatch(crossing, player) {
    let car = null, bd = Infinity;
    for (const c of this.list) {
      if (c.mode !== 'patrol') continue;
      const d = Math.hypot(c.mesh.position.x - crossing.x, c.mesh.position.z - crossing.z);
      if (d < bd) { bd = d; car = c; }
    }
    if (!car) return;
    const [dx, dz] = crossing.dir;
    const side = (car.mesh.position.x - crossing.x) * dx + (car.mesh.position.z - crossing.z) * dz >= 0 ? 1 : -1;
    car.goal = { x: crossing.x + dx * side * 9, z: crossing.z + dz * side * 9, cross: crossing, px: player.x, pz: player.z };
    car.mode = 'rush';
    car.rushT = 0;
    car.v = Math.max(car.v, 4);
    this._pullCloser(car, car.goal);
    this._routeTo(car, car.goal);
    this.busy = car;
    this.cool = 32;
  }

  _pullCloser(car, goal) {
    const d0 = Math.hypot(car.mesh.position.x - goal.x, car.mesh.position.z - goal.z);
    if (d0 < 140) return;
    let best = null, score = Infinity;
    for (const i of this.starts) {
      const n = this.nodes[i];
      const dist = Math.hypot(n.x - goal.x, n.z - goal.z);
      if (dist < 40 || dist > 100) continue;
      if (dist < score) { score = dist; best = i; }
    }
    if (best == null) return;
    car.pts = []; car.cum = []; car.s = 0; car.node = best; car.prev = -1; car.posed = false;
    this._extend(car, goal);
    this._pose(car, 0.016);
  }

  _routeTo(car, goal) {
    let goalI = -1, bd = Infinity;
    this.nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - goal.x, n.z - goal.z);
      if (d < bd) { bd = d; goalI = i; }
    });
    if (goalI < 0) return false;
    const start = car.node;
    const prev = new Map([[start, null]]);
    const q = [start];
    while (q.length && !prev.has(goalI)) {
      const u = q.shift();
      for (const e of this.nodes[u].out) {
        if (prev.has(e.to)) continue;
        prev.set(e.to, { u, e });
        q.push(e.to);
      }
    }
    if (!prev.get(goalI) && start !== goalI) return false;
    const edges = [];
    for (let cur = goalI; prev.get(cur); cur = prev.get(cur).u) edges.push(prev.get(cur).e);
    edges.reverse();
    car.pts = []; car.cum = []; car.s = 0; car.prev = -1; car.node = start; car.posed = false;
    for (const e of edges) this._append(car, e);
    if (car.pts.length < 2) this._extend(car, goal);
    const end = car.cum.at(-1) || 0;
    if (end > 140) car.s = end - 85;
    this._pose(car, 0.016);
    return true;
  }

  _arrive(car, player) {
    const doorX = car.mesh.position.x + Math.cos(car.heading) * 1.5;
    const doorZ = car.mesh.position.z - Math.sin(car.heading) * 1.5;
    let tx = player.x, tz = player.z;
    let vx = tx - doorX, vz = tz - doorZ, L = Math.hypot(vx, vz) || 1;
    const reach = Math.min(4.2, L - 1.6);
    tx = doorX + (vx / L) * Math.max(1.2, reach);
    tz = doorZ + (vz / L) * Math.max(1.2, reach);
    if (this.world?.isBlocked?.(tx, tz)) { tx = doorX; tz = doorZ; }
    car.walk = { from: [doorX, doorZ], to: [tx, tz], back: [doorX, doorZ], t: 0, phase: 'out' };
    car.officer.visible = true;
    car.officer.position.set(doorX, car.mesh.position.y, doorZ);
    car.mode = 'talk';
    car.said = false;
    car.talkT = 0;
    car.bubble.say(LINES[this.line++ % LINES.length], 7000);
    car.said = true;
  }

  update(dt, player, { riding = false } = {}) {
    this.cool -= dt;
    if (!this.busy && !riding && this.cool <= 0 && this.transit && player) {
      const hit = this.sigs.find((c) => this._inZone(c, player.x, player.z) && this.transit.pedLight(c) !== 'green');
      if (hit) this._dispatch(hit, player);
    }
    for (const car of this.list) {
      car.bubble.tick();
      const hot = car.mode !== 'patrol';
      this._lights(car, dt, hot);
      if (car.mode === 'patrol' || car.mode === 'rush') {
        if (car.mode === 'patrol') this._extend(car, null);
        const end = car.cum.at(-1) || 0;
        const goal = car.mode === 'rush' ? car.goal : null;
        let limit = (car.vmax || 8) * (car.mode === 'rush' ? 1.35 : 1);
        if (goal) {
          car.rushT = (car.rushT || 0) + dt;
          const d = Math.hypot(car.mesh.position.x - goal.x, car.mesh.position.z - goal.z);
          const remain = end - car.s;
          limit = Math.min(limit, Math.sqrt(Math.max(0, 2 * 3.2 * Math.max(0, d - 7))));
          if ((d < 12 && (car.v < 1.6 || remain < 5)) || (car.rushT > 16 && d < 40)) { car.v = 0; this._arrive(car, player); }
          else if (car.rushT > 26) { car.mode = 'patrol'; car.goal = null; if (this.busy === car) this.busy = null; }
        }
        const target = limit;
        car.v = car.v < target ? Math.min(target, car.v + 2.2 * dt) : Math.max(target, car.v - 4 * dt);
        car.s += car.v * dt;
        if (car.s > end - 2) car.s = Math.max(0, end - 2);
        this._trim(car);
        this._pose(car, dt);
      } else if (car.mode === 'talk') {
        car.v = 0;
        this._stepOfficer(car, dt, player);
      }
    }
  }

  _pose(car, dt) {
    const [x, z, dx, dz] = this._sample(car, car.s);
    const hd = Math.atan2(dx, dz);
    if (!car.posed) car.heading = hd;
    car.posed = true;
    car.heading += Math.atan2(Math.sin(hd - car.heading), Math.cos(hd - car.heading)) * Math.min(1, dt * 6);
    const y = this.groundY ? this.groundY(x, z, car.mesh.position.y || 0) : 0;
    car.mesh.position.set(x, y + 0.02, z);
    car.mesh.rotation.y = car.heading;
    const spin = (car.v || 0) * dt / 0.33;
    for (const w of car.mesh.userData.wheels || []) w.rotation.x -= spin;
  }

  _stepOfficer(car, dt, player) {
    const w = car.walk;
    car.talkT += dt;
    const goingBack = w.phase === 'back';
    const dest = goingBack ? w.back : w.to;
    const ox = car.officer.position.x, oz = car.officer.position.z;
    let vx = dest[0] - ox, vz = dest[1] - oz, L = Math.hypot(vx, vz);
    const step = Math.min(L, 1.7 * dt);
    if (L > 0.05) {
      car.officer.position.x += (vx / L) * step;
      car.officer.position.z += (vz / L) * step;
      car.officer.rotation.y = Math.atan2(vx, vz);
    }
    const y = this.groundY ? this.groundY(car.officer.position.x, car.officer.position.z, car.mesh.position.y) : car.mesh.position.y;
    car.officer.position.y = y;
    animateAvatar(car.officer, L > 0.15 ? 1.7 : 0, dt);
    if (!goingBack && L < 0.4) {
      const face = Math.atan2(player.x - car.officer.position.x, player.z - car.officer.position.z);
      car.officer.rotation.y = face;
    }
    if (!goingBack && car.talkT > 6.2) w.phase = 'back';
    if (goingBack && L < 0.3) {
      car.officer.visible = false;
      car.mode = 'patrol';
      car.goal = null;
      if (this.busy === car) this.busy = null;
    }
  }
}
