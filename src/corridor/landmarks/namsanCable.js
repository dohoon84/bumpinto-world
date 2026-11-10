// [namsan] 남산 케이블카. OSM way/61855801 (회현동 하부정류장 → 남산타워 상부정류장, 수평 약 548 m).
//   실제 duration 태그는 3분. 게임에서는 경치를 볼 수 있게 약 70초로 달린다(공식 소요 시간이라고 적어 두지 않음).
//   교행(jigback): 한 대가 올라가면 다른 대가 내려온다. ?ncable=0 이면 생성하지 않는다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NT } from './namsanCoords.js';

function centroid(pts) {
  let x = 0, z = 0, n = 0;
  for (const p of pts) { x += p[0]; z += p[1]; n++; }
  return n ? { x: x / n, z: z / n } : { x: 0, z: 0 };
}
function pointInRing(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    const hit = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}
function makeSign(text, w, h, bg = '#1c2834', fg = '#f3f6f8') {
  const c = document.createElement('canvas'); c.width = 768; c.height = 192;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 768, 192);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 62px sans-serif'; x.fillText(text, 384, 96);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
}

function stationBuilding(pts, y, name, face) {
  const g = new THREE.Group();
  if (!pts || pts.length < 3) return g;
  const c = centroid(pts);
  const wallH = 7.2;
  const geos = [];
  const faceAng = face ? Math.atan2(face.x - c.x, face.z - c.z) : 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.3) continue;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const toMid = Math.atan2(mx - c.x, mz - c.z);
    const facingCable = Math.abs(Math.atan2(Math.sin(toMid - faceAng), Math.cos(toMid - faceAng))) < 0.55;
    const facingOpp = Math.abs(Math.atan2(Math.sin(toMid - faceAng - Math.PI), Math.cos(toMid - faceAng - Math.PI))) < 0.55;
    const door = (facingCable || facingOpp) && L > 4.2;
    if (door) {
      const gap = 3.6;
      const alongX = (b[0] - a[0]) / L, alongZ = (b[1] - a[1]) / L;
      const left = (L - gap) / 2;
      if (left > 0.8) {
        const cx1 = a[0] + alongX * (left * 0.5), cz1 = a[1] + alongZ * (left * 0.5);
        const cx2 = b[0] - alongX * (left * 0.5), cz2 = b[1] - alongZ * (left * 0.5);
        const bg1 = new THREE.BoxGeometry(0.4, wallH, left); bg1.rotateY(ang); bg1.translate(cx1, y + wallH / 2, cz1); geos.push(bg1);
        const bg2 = new THREE.BoxGeometry(0.4, wallH, left); bg2.rotateY(ang); bg2.translate(cx2, y + wallH / 2, cz2); geos.push(bg2);
        const lint = new THREE.BoxGeometry(0.45, 2.2, gap); lint.rotateY(ang); lint.translate(mx, y + wallH - 1.1, mz); geos.push(lint);
      }
    } else {
      const bg = new THREE.BoxGeometry(0.4, wallH, L);
      bg.rotateY(ang); bg.translate(mx, y + wallH / 2, mz);
      geos.push(bg);
    }
  }
  if (geos.length) g.add(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color: '#d7dde3' })));
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0] - c.x, -(p[1] - c.z))));
  const roof = new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false });
  roof.rotateX(-Math.PI / 2); roof.translate(c.x, y + wallH, c.z);
  g.add(new THREE.Mesh(roof, new THREE.MeshLambertMaterial({ color: '#8b6a3a' })));
  const floor = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  floor.rotateX(-Math.PI / 2); floor.translate(c.x, y + 0.06, c.z);
  g.add(new THREE.Mesh(floor, new THREE.MeshLambertMaterial({ color: '#cfc6b6' })));
  const fx = Math.sin(faceAng), fz = Math.cos(faceAng);
  const plat = new THREE.Mesh(new THREE.BoxGeometry(8, 0.18, 3.2), new THREE.MeshLambertMaterial({ color: '#f0e6c8' }));
  plat.position.set(c.x + fx * 0.6, y + 0.2, c.z + fz * 0.6);
  plat.rotation.y = faceAng;
  g.add(plat);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 8, 24), new THREE.MeshLambertMaterial({ color: '#4a4e54' }));
  wheel.position.set(c.x + fx * 1.2, y + 5.4, c.z + fz * 1.2);
  wheel.rotation.y = faceAng;
  g.add(wheel);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 10), new THREE.MeshLambertMaterial({ color: '#2a2e32' }));
  hub.rotation.z = Math.PI / 2; hub.rotation.y = faceAng;
  hub.position.copy(wheel.position); g.add(hub);
  for (let i = -1; i <= 1; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.4), new THREE.MeshLambertMaterial({ color: '#3a4552' }));
    p.position.set(c.x - fx * 2.2 + Math.cos(faceAng) * i * 1.2, y + 0.7, c.z - fz * 2.2 + Math.sin(faceAng) * i * 1.2);
    p.rotation.y = faceAng;
    g.add(p);
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 0.55), new THREE.MeshLambertMaterial({ color: '#6a5344' }));
  bench.position.set(c.x + Math.cos(faceAng) * 3.4, y + 0.35, c.z + Math.sin(faceAng) * 3.4);
  bench.rotation.y = faceAng;
  g.add(bench);
  const sign = makeSign(name, 8.5, 1.15);
  sign.position.set(c.x, y + wallH + 1.4, c.z);
  sign.rotation.y = faceAng + Math.PI;
  g.add(sign);
  g.userData.center = c;
  g.userData.pts = pts;
  g.userData.y = y;
  return g;
}

function makeCabin() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#c62828', metalness: 0.28, roughness: 0.38 });
  const redDark = new THREE.MeshLambertMaterial({ color: '#8e1c1c' });
  const frame = new THREE.MeshLambertMaterial({ color: '#4a4e54' });
  const glass = new THREE.MeshStandardMaterial({
    color: '#b9d4e6', transparent: true, opacity: 0.22, roughness: 0.06, metalness: 0.25,
    emissive: new THREE.Color('#ffe7b0'), emissiveIntensity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  // hollow cabin: floor, roof, lower apron, four window panes, corner posts
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.12, 3.25), new THREE.MeshLambertMaterial({ color: '#5a4034' }));
  floor.position.y = -1.05; g.add(floor);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.72, 3.3), red);
  apron.position.y = -0.64; g.add(apron);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.2, 3.45), new THREE.MeshLambertMaterial({ color: '#f2f4f6' }));
  roof.position.y = 1.18; g.add(roof);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 3.1), new THREE.MeshStandardMaterial({
    color: '#fff4d8', emissive: new THREE.Color('#ffe2a8'), emissiveIntensity: 0.35,
  }));
  ceil.position.y = 1.04; g.add(ceil);
  // window panes: sides (X) and front/back (Z)
  const panes = [
    { s: [0.06, 1.15, 2.85], p: [1.28, 0.28, 0] },
    { s: [0.06, 1.15, 2.85], p: [-1.28, 0.28, 0] },
    { s: [2.15, 1.15, 0.06], p: [0, 0.28, 1.58] },
    { s: [2.15, 1.15, 0.06], p: [0, 0.28, -1.58] },
  ];
  let glassMesh = null;
  for (const pn of panes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...pn.s), glass);
    m.position.set(...pn.p); g.add(m);
    if (!glassMesh) glassMesh = m;
  }
  // red window frames / corner posts
  for (const [x, z] of [[1.28, 1.55], [1.28, -1.55], [-1.28, 1.55], [-1.28, -1.55]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), redDark);
    post.position.set(x, 0.05, z); g.add(post);
  }
  const belt = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.1, 3.32), red);
  belt.position.y = 0.92; g.add(belt);
  // hang rod + yoke + cable grip
  const hang = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, 0.16), frame);
  hang.position.y = 1.85; g.add(hang);
  const yoke = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.14, 0.16), frame);
  yoke.position.y = 2.5; g.add(yoke);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.32), new THREE.MeshLambertMaterial({ color: '#2a2e32' }));
  grip.position.y = 2.78; g.add(grip);
  const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 6, 12), frame);
  jaw.rotation.z = Math.PI / 2;
  jaw.position.y = 2.92; g.add(jaw);
  const seats = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.32, 1.5), new THREE.MeshLambertMaterial({ color: '#4a3228' }));
  seats.position.set(0, -0.62, 0.15); g.add(seats);
  g.userData.glass = glassMesh;
  g.userData.ceil = ceil;
  return g;
}

export function createNamsanCable({ parent, osm, heightAt, overlay }) {
  const g = new THREE.Group();
  g.name = 'namsan-cable';
  parent.add(g);

  const nodes = (osm?.cable?.nodes || []).map((n) => ({ x: n.x, z: n.z, kind: (n.tags || {}).aerialway || 'pylon' }));
  if (nodes.length < 2) return { group: g, riding: false, update() {}, setNight() {}, tickPlayer() {}, isBlocked() { return false; }, floorY() { return null; } };

  // OSM order: upper(남산타워) → pylons → lower(회현동). Keep that, t=0 at upper, t=1 at lower.
  const pts = nodes.map((n) => {
    const ground = heightAt(n.x, n.z);
    const extra = n.kind === 'station' ? 8.5 : 22;
    return { x: n.x, z: n.z, y: ground + extra, ground, kind: n.kind };
  });
  // cable hangs slightly above stations' bullwheels
  pts[0].y = heightAt(pts[0].x, pts[0].z) + 6.8;
  pts[pts.length - 1].y = heightAt(pts[pts.length - 1].x, pts[pts.length - 1].z) + 6.8;

  // arc-length parameterization
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    seg.push({ a: pts[i - 1], b: pts[i], L, s0: total });
    total += L;
  }
  function at(t) {
    const s = Math.max(0, Math.min(1, t)) * total;
    let sgm = seg[seg.length - 1];
    for (const sg of seg) if (s <= sg.s0 + sg.L) { sgm = sg; break; }
    const u = sgm.L < 1e-6 ? 0 : (s - sgm.s0) / sgm.L;
    return {
      x: sgm.a.x + (sgm.b.x - sgm.a.x) * u,
      y: sgm.a.y + (sgm.b.y - sgm.a.y) * u,
      z: sgm.a.z + (sgm.b.z - sgm.a.z) * u,
      tx: (sgm.b.x - sgm.a.x) / (sgm.L || 1),
      ty: (sgm.b.y - sgm.a.y) / (sgm.L || 1),
      tz: (sgm.b.z - sgm.a.z) / (sgm.L || 1),
    };
  }

  // support pylons at OSM pylon nodes
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const h = p.y - p.ground;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, h, 8), new THREE.MeshLambertMaterial({ color: '#5c6168' }));
    mast.position.set(p.x, p.ground + h / 2, p.z); g.add(mast);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.28, 0.28), new THREE.MeshLambertMaterial({ color: '#4a4e54' }));
    arm.position.set(p.x, p.y, p.z); g.add(arm);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.4, 0.22), new THREE.MeshLambertMaterial({ color: '#4a4e54' }));
    cross.position.set(p.x, p.y - 0.7, p.z); g.add(cross);
  }

  // twin cables
  const side = 1.35;
  function cableGeo(off) {
    const N = 40;
    const positions = [];
    for (let i = 0; i <= N; i++) {
      const p = at(i / N);
      // offset perpendicular in XZ
      const nx = -p.tz, nz = p.tx, L = Math.hypot(nx, nz) || 1;
      positions.push(p.x + (nx / L) * off, p.y, p.z + (nz / L) * off);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }
  const cableMat = new THREE.MeshLambertMaterial({ color: '#2a2e32' });
  function cableTube(off) {
    const N = 40;
    const pts3 = [];
    for (let i = 0; i <= N; i++) {
      const p = at(i / N);
      const nx = -p.tz, nz = p.tx, L = Math.hypot(nx, nz) || 1;
      pts3.push(new THREE.Vector3(p.x + (nx / L) * off, p.y, p.z + (nz / L) * off));
    }
    const curve = new THREE.CatmullRomCurve3(pts3);
    return new THREE.Mesh(new THREE.TubeGeometry(curve, N, 0.055, 5, false), cableMat);
  }
  g.add(cableTube(-side));
  g.add(cableTube(side));

  // stations
  const upperPts = osm?.upperStation?.pts;
  const lowerPts = osm?.lowerStation?.pts;
  const upperY = heightAt(pts[0].x, pts[0].z);
  const lowerY = heightAt(pts[pts.length - 1].x, pts[pts.length - 1].z);
  const upperSt = stationBuilding(upperPts, upperY, '남산 케이블카 · 상부', pts[0]);
  const lowerSt = stationBuilding(lowerPts, lowerY, '남산 케이블카 · 하부', pts[pts.length - 1]);
  g.add(upperSt, lowerSt);

  if (overlay) {
    overlay.add({ cls: 'label', text: '🚠 남산 케이블카', getPos: () => new THREE.Vector3(pts[0].x, upperY + 12, pts[0].z), maxDist: 400 });
    overlay.add({ cls: 'label', text: '🚠 남산 케이블카 · 회현', getPos: () => new THREE.Vector3(pts[pts.length - 1].x, lowerY + 12, pts[pts.length - 1].z), maxDist: 400 });
  }

  const cabinA = makeCabin(); // starts at upper (t=0)
  const cabinB = makeCabin(); // starts at lower (t=1)
  g.add(cabinA, cabinB);

  const RIDE_DUR = 70;
  let phase = 0; // 0 = A at top going down, 1 = A at bottom going up; we animate u 0→1 then reverse
  let u = 0; // 0 = A at upper
  let dir = 1;
  let dwell = 2.5;
  let ride = null; // { cabin: 'A'|'B', dest: 'upper'|'lower' }
  const nightMats = [cabinA.userData.glass.material, cabinB.userData.glass.material, cabinA.userData.ceil.material, cabinB.userData.ceil.material];

  function placeCabin(mesh, t, swayT) {
    const p = at(t);
    const sway = Math.sin(swayT * 1.3) * 0.035;
    mesh.position.set(p.x, p.y - 2.85, p.z);
    mesh.rotation.set(sway, Math.atan2(p.tx, p.tz), sway * 0.6);
  }

  function nearStation(x, z, which) {
    const p = which === 'upper' ? pts[0] : pts[pts.length - 1];
    const y0 = which === 'upper' ? upperY : lowerY;
    const stPts = which === 'upper' ? upperPts : lowerPts;
    if (stPts && pointInRing(x, z, stPts)) return { x: p.x, z: p.z, y: y0 + 0.25, which };
    if (Math.hypot(x - p.x, z - p.z) < 6) return { x: p.x, z: p.z, y: y0 + 0.25, which };
    return null;
  }

  function isBlocked(x, z, r = 0.35) {
    for (const st of [upperSt, lowerSt]) {
      const pts2 = st.userData.pts; if (!pts2) continue;
      if (!pointInRing(x, z, pts2)) continue;
      // block walls: near edge
      let best = Infinity;
      for (let i = 0; i < pts2.length; i++) {
        const a = pts2[i], b = pts2[(i + 1) % pts2.length];
        const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
        best = Math.min(best, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
      }
      if (best < 0.45 + r) {
        // leave door gaps facing the cable node and the opposite entrance
        const c = st.userData.center;
        const facing = st === upperSt ? pts[0] : pts[pts.length - 1];
        const ox2 = c.x - (facing.x - c.x);
        const oz2 = c.z - (facing.z - c.z);
        if (Math.hypot(x - facing.x, z - facing.z) < 3.8 || Math.hypot(x - ox2, z - oz2) < 3.8) return false;
        return true;
      }
    }
    return false;
  }

  let hold = 0, holdAt = null;
  function tickPlayer(dt, player, cam) {
    if (!player) return;
    if (ride) {
      const tCabin = ride.cabin === 'A' ? u : 1 - u;
      const p = at(tCabin);
      const sway = Math.sin((performance.now() / 1000) * 1.3) * 0.04;
      // feet on the cabin floor (cabin origin is at cable Y - 2.85; floor is origin - 1.05)
      player.position.set(p.x + sway * 0.15, p.y - 3.88, p.z);
      if (cam) {
        const lookYaw = ride.dest === 'upper' ? Math.atan2(NT.tx - p.x, NT.tz - p.z) : Math.atan2(-p.tx, -p.tz);
        cam.yaw += (lookYaw - cam.yaw) * Math.min(1, dt * 1.8);
        cam.pitch += ((ride.dest === 'upper' ? 0.08 : -0.04) - cam.pitch) * Math.min(1, dt * 1.4);
        // just behind the player, still inside the cabin, so the red window frame stays in view
        cam.dist += (1.55 - cam.dist) * Math.min(1, dt * 2.2);
      }
      // arrival
      const arrived = ride.dest === 'upper' ? tCabin < 0.012 : tCabin > 0.988;
      if (arrived && dwell > 1.6) {
        const st = ride.dest === 'upper' ? pts[0] : pts[pts.length - 1];
        const sy = ride.dest === 'upper' ? upperY : lowerY;
        player.position.set(st.x + 3.2, sy + 0.3, st.z + 1.4);
        ride = null;
        hold = 0;
      }
      return;
    }
    const up = nearStation(player.position.x, player.position.z, 'upper');
    const low = nearStation(player.position.x, player.position.z, 'lower');
    const atSt = up || low;
    if (atSt) {
      if (holdAt === atSt.which) hold += dt; else { hold = 0; holdAt = atSt.which; }
      if (hold > 0.85 && dwell > 1.8) {
        // board the cabin that is currently at this station
        const aAtUpper = u < 0.05;
        const cabin = atSt.which === 'upper' ? (aAtUpper ? 'A' : 'B') : (aAtUpper ? 'B' : 'A');
        ride = { cabin, dest: atSt.which === 'upper' ? 'lower' : 'upper' };
        hold = 0;
      }
    } else { hold = 0; holdAt = null; }
  }

  return {
    group: g,
    get riding() { return !!ride; },
    update(dt) {
      if (dwell > 0) dwell -= dt;
      else {
        u += dir * (dt / RIDE_DUR);
        if (u >= 1) { u = 1; dir = -1; dwell = 3.2; }
        if (u <= 0) { u = 0; dir = 1; dwell = 3.2; }
      }
      const now = performance.now() / 1000;
      placeCabin(cabinA, u, now);
      placeCabin(cabinB, 1 - u, now + 1.7);
    },
    tickPlayer,
    setNight(v) {
      cabinA.userData.glass.material.emissiveIntensity = v * 0.55;
      cabinB.userData.glass.material.emissiveIntensity = v * 0.55;
      cabinA.userData.ceil.material.emissiveIntensity = 0.35 + v * 0.7;
      cabinB.userData.ceil.material.emissiveIntensity = 0.35 + v * 0.7;
    },
    isBlocked,
    floorY(x, z, refY) {
      if (upperPts && pointInRing(x, z, upperPts) && (!Number.isFinite(refY) || Math.abs(refY - upperY) < 4)) return upperY + 0.12;
      if (lowerPts && pointInRing(x, z, lowerPts) && (!Number.isFinite(refY) || Math.abs(refY - lowerY) < 4)) return lowerY + 0.12;
      return null;
    },
    at,
    pts,
    stage(t) { u = Math.max(0, Math.min(1, t)); dwell = 10; placeCabin(cabinA, u, 0); placeCabin(cabinB, 1 - u, 1.7); },
  };
}
