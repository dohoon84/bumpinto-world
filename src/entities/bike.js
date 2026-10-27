// 정자역 주변 인도에 세워 둔 카카오바이크. OSM에 대여 자전거 좌표가 없어서
// 보도(footway/path/pedestrian)를 따라 간격을 두고 하나씩 놓는다.
import * as THREE from 'three';
import { watchEvening } from '../evening.js';

const RADIUS = 115;
const GAP = 36;
const SEPARATION = 18;
const MAX_BIKES = 24;
const MOUNT_DIST = 2.3;
const SIDEWALK = new Set(['footway', 'path', 'pedestrian']);

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const DIR = new THREE.Vector3();
const lampMatF = new THREE.MeshBasicMaterial({ color: '#fff8ee' });
const lampMatR = new THREE.MeshBasicMaterial({ color: '#e10600' });

function tube(mat, a, b, r = 0.038) {
  DIR.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = DIR.length() || 0.001;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
  m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(Y_AXIS, DIR.normalize());
  m.castShadow = true;
  return m;
}

function box(mat, w, h, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}

function createKakaoBike() {
  const yel = new THREE.MeshLambertMaterial({ color: '#fee500' });
  const blk = new THREE.MeshLambertMaterial({ color: '#1a1a1a' });
  const rub = new THREE.MeshLambertMaterial({ color: '#141414' });
  const gry = new THREE.MeshLambertMaterial({ color: '#d5d8de' });
  const g = new THREE.Group();

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 14);
  const hubGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.09, 8);
  const spokeA = new THREE.BoxGeometry(0.02, 0.56, 0.035);
  const spokeB = new THREE.BoxGeometry(0.02, 0.035, 0.56);
  const wheel = (z, name) => {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, rub); tire.rotation.z = Math.PI / 2; tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, gry); hub.rotation.z = Math.PI / 2;
    w.add(tire, hub, new THREE.Mesh(spokeA, gry), new THREE.Mesh(spokeB, gry));
    w.position.set(0, 0.34, z);
    w.name = name;
    return w;
  };
  g.add(wheel(-0.55, 'wheelR'), wheel(0.62, 'wheelF'));

  const rear = [0, 0.34, -0.55], front = [0, 0.34, 0.62];
  const bracket = [0, 0.38, 0.02], seat = [0, 0.98, -0.18], head = [0, 0.88, 0.46];
  g.add(
    tube(yel, rear, seat, 0.04),
    tube(yel, rear, bracket, 0.036),
    tube(yel, bracket, head, 0.042),
    tube(yel, head, front, 0.035),
    tube(blk, head, [0, 1.12, 0.52], 0.028),
  );
  const fenderR = box(yel, 0.08, 0.045, 0.4); fenderR.position.set(0, 0.66, -0.55);
  const fenderF = box(yel, 0.08, 0.045, 0.4); fenderF.position.set(0, 0.66, 0.62);
  g.add(fenderR, fenderF);

  const saddle = box(blk, 0.14, 0.06, 0.3);
  saddle.position.set(0, 1.02, -0.16);
  g.add(saddle);

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.56, 8), blk);
  bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.12, 0.52); bar.castShadow = true;
  g.add(bar);
  for (const x of [-0.28, 0.28]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), blk);
    grip.rotation.z = Math.PI / 2; grip.position.set(x, 1.12, 0.52);
    g.add(grip);
  }

  const basket = new THREE.Group();
  basket.add(box(yel, 0.48, 0.04, 0.32));
  const frontWall = box(yel, 0.48, 0.2, 0.03); frontWall.position.set(0, 0.1, 0.15);
  const backWall = box(yel, 0.48, 0.2, 0.03); backWall.position.set(0, 0.1, -0.15);
  const leftWall = box(yel, 0.03, 0.2, 0.32); leftWall.position.set(-0.225, 0.1, 0);
  const rightWall = box(yel, 0.03, 0.2, 0.32); rightWall.position.set(0.225, 0.1, 0);
  basket.add(frontWall, backWall, leftWall, rightWall);
  basket.position.set(0, 0.86, 0.78);
  g.add(basket);

  const lock = box(yel, 0.2, 0.18, 0.14); lock.position.set(0, 0.5, -0.36);
  const lockFace = box(blk, 0.12, 0.09, 0.02); lockFace.position.set(0, 0.5, -0.28);
  g.add(lock, lockFace);

  const crank = new THREE.Group();
  crank.name = 'crank';
  crank.position.set(0, 0.38, 0.02);
  const arm = box(gry, 0.035, 0.28, 0.035);
  const pedL = box(blk, 0.11, 0.03, 0.07); pedL.position.set(-0.1, 0.13, 0);
  const pedR = box(blk, 0.11, 0.03, 0.07); pedR.position.set(0.1, -0.13, 0);
  crank.add(arm, pedL, pedR);
  g.add(crank);

  const stand = box(gry, 0.03, 0.34, 0.03);
  stand.position.set(0.16, 0.16, -0.04);
  stand.rotation.z = 0.22;
  stand.name = 'stand';
  g.add(stand);

  const lampF = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.06), lampMatF);
  lampF.position.set(0, 0.96, 0.98);
  lampF.name = 'lampF';
  lampF.castShadow = false;
  lampF.visible = false;
  const lampR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05), lampMatR);
  lampR.position.set(0, 0.72, -0.8);
  lampR.name = 'lampR';
  lampR.castShadow = false;
  lampR.visible = false;
  g.add(lampF, lampR);
  return g;
}

function distPointSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

export class KakaoBikes {
  constructor(scene, world, data) {
    this.list = [];
    this.riding = null;
    this.speed = 0;
    this._proto = createKakaoBike();
    let seed = 19;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const st = data.station;
    const raw = [];
    for (const path of world.walkPaths) {
      if (!SIDEWALK.has(path.kind)) continue;
      const pts = path.pts;
      const inside = [];
      let s = 0, insideLen = 0;
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
        const ay = pts[i - 1].length > 2 ? pts[i - 1][2] : 0, by = pts[i].length > 2 ? pts[i][2] : 0;
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 0.2) continue;
        const dx = (bx - ax) / L, dz = (bz - az) / L;
        const steps = Math.max(1, Math.ceil(L / 3));
        for (let k = 0; k < steps; k++) {
          const mid = ((k + 0.5) / steps) * L;
          const x = ax + dx * mid, z = az + dz * mid;
          if (Math.hypot(x - st.x, z - st.z) > RADIUS) continue;
          inside.push({ x, z, y: ay + (by - ay) * (mid / L), dx, dz, s: s + mid });
          insideLen += L / steps;
        }
        s += L;
      }
      if (!inside.length) continue;
      let next = inside[0].s + 4, placed = 0;
      for (const p of inside) {
        if (p.s + 0.01 < next) continue;
        raw.push(p); placed++; next = p.s + GAP;
      }
      if (!placed && insideLen > 9) raw.push(inside[Math.floor(inside.length / 2)]);
    }

    const surface = (x, z, ref) => (world.groundY ? world.groundY(x, z, Number.isFinite(ref) ? ref : 0) : (Number.isFinite(ref) ? ref : 0));
    const spots = [];
    for (const p of raw) {
      let hit = null;
      for (const side of [0.5, -0.5, 0]) {
        const x = p.x - p.dz * side, z = p.z + p.dx * side;
        if (Math.hypot(x - world.signPos.x, z - world.signPos.z) < 3.5) continue;
        if (world.isBlocked(x, z, 0.4) || world.onRoad(x, z)) continue;
        const y = surface(x, z, p.y);
        // 둔치 길(약 -6m)을 y=0에 두면 하천에서 하늘에 뜬다. 수면 아래·다른 층(교량/제방)으로 튀면 그 자리는 버린다.
        if (y < -6.45 || Math.abs(y - (p.y || 0)) > 1.25) continue;
        hit = { x, z, y, ry: Math.atan2(p.dx, p.dz) + (rnd() - 0.5) * 0.5, d: Math.hypot(x - st.x, z - st.z) };
        break;
      }
      if (hit) spots.push(hit);
    }
    spots.sort((a, b) => a.d - b.d);
    for (const s of spots) {
      if (this.list.length >= MAX_BIKES) break;
      if (this.list.some((b) => Math.hypot(b.x - s.x, b.z - s.z) < SEPARATION && Math.abs(b.y - s.y) < 2)) continue;
      const mesh = this._proto.clone(true);
      mesh.position.set(s.x, s.y, s.z);
      mesh.rotation.y = s.ry;
      scene.add(mesh);
      this.list.push({
        mesh, x: s.x, z: s.z, y: s.y, ry: s.ry,
        wheelF: mesh.getObjectByName('wheelF'),
        wheelR: mesh.getObjectByName('wheelR'),
        crank: mesh.getObjectByName('crank'),
        stand: mesh.getObjectByName('stand'),
        lampF: mesh.getObjectByName('lampF'),
        lampR: mesh.getObjectByName('lampR'),
      });
    }
    this._unwatch = watchEvening((on) => {
      for (const b of this.list) {
        if (b.lampF) b.lampF.visible = on;
        if (b.lampR) b.lampR.visible = on;
      }
    });
  }

  nearest(x, z, max = MOUNT_DIST, y = null) {
    let best = null, bd = max;
    for (const b of this.list) {
      if (y != null && Math.abs(b.y - y) > 1.8) continue; // 교량 위와 다리 밑 둔치는 서로 타지 않는다
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  blocks(x, z, ignore = null, y = null) {
    for (const b of this.list) {
      if (b === ignore) continue;
      if (y != null && Math.abs(b.y - y) > 2.2) continue;
      const fx = Math.sin(b.ry), fz = Math.cos(b.ry);
      if (distPointSeg(x, z, b.x - fx * 0.55, b.z - fz * 0.55, b.x + fx * 0.75, b.z + fz * 0.75) < 0.48) return true;
    }
    return false;
  }

  mount(b) {
    this.riding = b;
    this.speed = 0;
    if (b.stand) b.stand.visible = false;
  }

  dismount() {
    const b = this.riding;
    if (!b) return;
    if (b.stand) b.stand.visible = true;
    this.riding = null;
    this.speed = 0;
  }

  place(b) {
    b.mesh.position.set(b.x, b.y || 0, b.z);
    b.mesh.rotation.y = b.ry;
  }

  spin(dt) {
    const b = this.riding;
    if (!b) return;
    const a = this.speed * dt / 0.34;
    b.wheelF.rotation.x += a;
    b.wheelR.rotation.x += a;
    b.crank.rotation.x += a * 2.4;
  }
}
