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

/** 미니맵·안내용 탑승 위치. 정류장 건물 중심(OSM footprint)을 쓰고, 없으면 케이블 양 끝 노드. */
export function namsanCableStations(osm) {
  const nodes = osm?.cable?.nodes || [];
  const fromFoot = (pts) => (pts?.length >= 3 ? centroid(pts) : null);
  const nodeAt = (i) => {
    const n = nodes[i];
    return n && Number.isFinite(+n.x) && Number.isFinite(+n.z) ? { x: +n.x, z: +n.z } : null;
  };
  const upper = fromFoot(osm?.upperStation?.pts) || nodeAt(0);
  const lower = fromFoot(osm?.lowerStation?.pts) || nodeAt(nodes.length - 1);
  const out = [];
  if (upper) out.push({ id: 'namsan-cable-upper', which: 'upper', x: upper.x, z: upper.z, label: '케이블카 탑승 · 남산타워', labelEn: 'Cable car · Namsan Tower', shortLabel: '케이블카 타워', shortLabelEn: 'Cable Tower', icon: '🚠' });
  if (lower) out.push({ id: 'namsan-cable-lower', which: 'lower', x: lower.x, z: lower.z, label: '케이블카 탑승 · 회현', labelEn: 'Cable car · Hoehyeon', shortLabel: '케이블카 회현', shortLabelEn: 'Cable Hoehyeon', icon: '🚠' });
  return out;
}

/** 정류장 건물에서 케이블 반대쪽 벽(출입문)의 중점과 바깥 방향. stationBuilding 의 facingOpp 과 같다. */
export function namsanStationDoors(osm) {
  const nodes = osm?.cable?.nodes || [];
  const nodeAt = (i) => {
    const n = nodes[i];
    return n && Number.isFinite(+n.x) && Number.isFinite(+n.z) ? { x: +n.x, z: +n.z } : null;
  };
  return {
    upper: stationDoorFromPts(osm?.upperStation?.pts, nodeAt(0)),
    lower: stationDoorFromPts(osm?.lowerStation?.pts, nodeAt(nodes.length - 1)),
  };
}

function stationDoorFromPts(pts, face) {
  if (!pts || pts.length < 3) return null;
  const c = centroid(pts);
  if (!face) return { x: c.x, z: c.z, nx: 0, nz: 1, cx: c.x, cz: c.z };
  const faceAng = Math.atan2(face.x - c.x, face.z - c.z);
  let best = null, bestL = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 1.2) continue;
    const mx = (a[0] + b[0]) * 0.5, mz = (a[1] + b[1]) * 0.5;
    const ang = Math.atan2(mx - c.x, mz - c.z);
    let d = ang - faceAng;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > 2.2 && L > 4.2 && L > bestL) {
      const nd = Math.hypot(mx - c.x, mz - c.z) || 1;
      bestL = L;
      best = { x: mx, z: mz, nx: (mx - c.x) / nd, nz: (mz - c.z) / nd, cx: c.x, cz: c.z, L };
    }
  }
  if (best) return best;
  const ang = faceAng + Math.PI;
  const nx = Math.sin(ang), nz = Math.cos(ang);
  return { x: c.x + nx * 8, z: c.z + nz * 8, nx, nz, cx: c.x, cz: c.z, L: 0 };
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
  const railM = new THREE.MeshStandardMaterial({ color: '#c5ccd2', metalness: 0.55, roughness: 0.35 });
  const seatM = new THREE.MeshLambertMaterial({ color: '#6a4534' });
  const backM = new THREE.MeshLambertMaterial({ color: '#4e3228' });
  const glass = new THREE.MeshStandardMaterial({
    color: '#b9d4e6', transparent: true, opacity: 0.16, roughness: 0.06, metalness: 0.25,
    emissive: new THREE.Color('#ffe7b0'), emissiveIntensity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.12, 3.25), new THREE.MeshLambertMaterial({ color: '#3a2a24' }));
  floor.position.y = -1.05; g.add(floor);
  // hollow apron (skirt walls only — a solid box used to paint the whole floor red)
  for (const [sx, sy, sz, px, py, pz] of [
    [2.62, 0.72, 0.08, 0, -0.64, 1.61],
    [2.62, 0.72, 0.08, 0, -0.64, -1.61],
    [0.08, 0.72, 3.22, 1.27, -0.64, 0],
    [0.08, 0.72, 3.22, -1.27, -0.64, 0],
  ]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), red);
    w.position.set(px, py, pz); g.add(w);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.78, 0.16, 3.48), new THREE.MeshStandardMaterial({
    color: '#c8ccd0', roughness: 0.45, metalness: 0.15,
    emissive: new THREE.Color('#3a2220'), emissiveIntensity: 0.2,
  }));
  roof.position.y = 1.2; g.add(roof);
  // full-size interior ceiling so the roof underside never reads as a black slab
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.07, 3.38), new THREE.MeshStandardMaterial({
    color: '#f3e6c8', emissive: new THREE.Color('#ffe2a0'), emissiveIntensity: 0.55,
  }));
  ceil.position.y = 1.08; g.add(ceil);
  const ceilLight = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 2.2), new THREE.MeshStandardMaterial({
    color: '#fff6d8', emissive: new THREE.Color('#fff0c4'), emissiveIntensity: 0.85,
  }));
  ceilLight.position.y = 1.04; g.add(ceilLight);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.08, 3.4), red);
  rim.position.y = 1.14; g.add(rim);
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
  for (const [x, z] of [[1.28, 1.55], [1.28, -1.55], [-1.28, 1.55], [-1.28, -1.55]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), redDark);
    post.position.set(x, 0.05, z); g.add(post);
  }
  // window-top frame only (a solid slab here used to paint the whole ceiling black)
  for (const [sx, sy, sz, px, py, pz] of [
    [2.62, 0.1, 0.08, 0, 0.92, 1.62],
    [2.62, 0.1, 0.08, 0, 0.92, -1.62],
    [0.08, 0.1, 3.22, 1.27, 0.92, 0],
    [0.08, 0.1, 3.22, -1.27, 0.92, 0],
  ]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), red);
    b.position.set(px, py, pz); g.add(b);
  }
  const hang = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, 0.16), frame);
  hang.position.y = 1.85; g.add(hang);
  const yoke = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.14, 0.16), frame);
  yoke.position.y = 2.5; g.add(yoke);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.32), new THREE.MeshLambertMaterial({ color: '#2a2e32' }));
  grip.position.y = 2.78; g.add(grip);
  const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 6, 12), frame);
  jaw.rotation.z = Math.PI / 2;
  jaw.position.y = 2.92; g.add(jaw);
  // benches under every window so the seat edge sits in the lower frame
  function bench(w, d, x, z, alongZ) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? d : w, 0.11, alongZ ? w : d), seatM);
    seat.position.set(x, -0.74, z); g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.07 : w, 0.4, alongZ ? w : 0.07), backM);
    const bx = alongZ ? x + Math.sign(x || 1) * 0.2 : x;
    const bz = alongZ ? z : z + Math.sign(z || 1) * 0.2;
    back.position.set(alongZ ? x + Math.sign(x) * 0.18 : x, -0.52, alongZ ? z : z + Math.sign(z) * 0.18);
    g.add(back);
  }
  bench(2.05, 0.4, 0.92, 0, true);
  bench(2.05, 0.4, -0.92, 0, true);
  bench(1.7, 0.4, 0, 1.12, false);
  bench(1.7, 0.4, 0, -1.12, false);
  // interior handrail at sill height
  for (const [sx, sz, px, pz] of [
    [2.28, 0.035, 0, 1.38],
    [2.28, 0.035, 0, -1.38],
    [0.035, 2.72, 1.14, 0],
    [0.035, 2.72, -1.14, 0],
  ]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.035, sz), railM);
    rail.position.set(px, -0.06, pz); g.add(rail);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 6), railM);
    post.position.set(Math.cos(a) * 1.12, -0.34, Math.sin(a) * 1.36);
    g.add(post);
  }
  g.userData.glass = glassMesh;
  g.userData.ceil = ceil;
  g.userData.ceilLight = ceilLight;
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
    overlay.add({ cls: 'label', text: '🚠 남산 케이블카', getPos: () => new THREE.Vector3(pts[0].x, upperY + 12, pts[0].z), maxDist: 140 });
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
  // 회현→타워는 산을 바라보므로, 기본은 어깨 너머 명동(도시) 쪽. T 로 타워/도시/자동 전환.
  const CITY = { x: NT.tx - 980, z: NT.tz - 790 }; // 회현·남대문 야경 (케이블 북서쪽 도심)
  let viewMode = 'auto'; // auto | city | tower
  let hintEl = null;
  function hintText() {
    const mode = viewMode === 'auto' ? '자동' : viewMode === 'city' ? '도시 야경' : '타워';
    return `케이블카 · T 전망 전환 (${mode})`;
  }
  function showHint(on) {
    if (typeof document === 'undefined') return;
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.id = 'namsan-cable-hint';
      hintEl.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:40;padding:8px 14px;border-radius:999px;background:rgba(12,16,22,0.72);color:#f3f6f8;font:600 14px/1.3 sans-serif;letter-spacing:.02em;pointer-events:none;';
      document.body.appendChild(hintEl);
    }
    hintEl.textContent = hintText();
    hintEl.style.display = on ? 'block' : 'none';
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (!ride || e.repeat || e.code !== 'KeyT') return;
      viewMode = viewMode === 'auto' ? 'city' : viewMode === 'city' ? 'tower' : 'auto';
      showHint(true);
    });
  }

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
      // feet on the cabin floor; nudge toward the look so the camera behind stays inside
      const goingUp = ride.dest === 'upper';
      let want = viewMode === 'auto'
        ? (goingUp && tCabin < 0.2 ? 'tower' : 'city')
        : viewMode;
      const lookX = want === 'tower' ? NT.tx : CITY.x;
      const lookZ = want === 'tower' ? NT.tz : CITY.z;
      const lookYaw = Math.atan2(p.x - lookX, p.z - lookZ);
      const lx = Math.sin(lookYaw), lz = Math.cos(lookYaw);
      // sit slightly toward the city window so the opposite bench stays behind the camera
      player.position.set(p.x - lx * 0.22 + sway * 0.08, p.y - 3.88, p.z - lz * 0.22);
      if (cam) {
        cam.distMin = 0.7;
        cam.yaw += (lookYaw - cam.yaw) * Math.min(1, dt * 2.0);
        const wantPitch = want === 'city' ? 0.1 : -0.08;
        cam.pitch += (wantPitch - cam.pitch) * Math.min(1, dt * 1.6);
        cam.dist = 0.8;
      }
      showHint(true);
      // arrival
      const arrived = ride.dest === 'upper' ? tCabin < 0.012 : tCabin > 0.988;
      if (arrived && dwell > 1.6) {
        const st = ride.dest === 'upper' ? pts[0] : pts[pts.length - 1];
        const sy = ride.dest === 'upper' ? upperY : lowerY;
        player.position.set(st.x + 3.2, sy + 0.3, st.z + 1.4);
        ride = null;
        hold = 0;
        showHint(false);
        if (cam && 'distMin' in cam) delete cam.distMin;
        if (cam && cam.dist < 5) cam.dist = 8;
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
    stations: namsanCableStations(osm),
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
      cabinA.userData.glass.material.emissiveIntensity = v * 0.16;
      cabinB.userData.glass.material.emissiveIntensity = v * 0.16;
      cabinA.userData.ceil.material.emissiveIntensity = 0.45 + v * 0.7;
      cabinB.userData.ceil.material.emissiveIntensity = 0.45 + v * 0.7;
      if (cabinA.userData.ceilLight) cabinA.userData.ceilLight.material.emissiveIntensity = 0.7 + v * 0.5;
      if (cabinB.userData.ceilLight) cabinB.userData.ceilLight.material.emissiveIntensity = 0.7 + v * 0.5;
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
    setView(mode) { viewMode = mode || 'auto'; },
    get viewMode() { return viewMode; },
  };
}
