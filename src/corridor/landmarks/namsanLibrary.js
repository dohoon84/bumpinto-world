// [namsan] 서울특별시교육청 남산도서관 + 약수터 들머리.
//   Footprint: OSM way/464461415 (building=yes, no height/levels). Amenity node/414685270.
//   Floors: 5 — nslib.sen.go.kr 시설이용안내. Storey height 3.6 m is a guess (OSM has none).
//   Facade: stacked protruding exposed-concrete slabs around window bands, deep balconies
//   (Brique: "두꺼운 콘크리트 슬래브가 창문 둘레로 돌출", 이해성 1965, 소월로 109).
//   Glass is the wall between slabs (no solid beige box). Mullion spacing 2.15 m is a
//   typical module, not a measured drawing. Balcony depth 1.28 m inferred from "깊은
//   발코니"; OSM outline is treated as the slab edge. No third-party brand logos.
//   Main door: OSM has no entrance=* tag. Placed on the south facade at the end of
//   service way/244399269, which meets the ring next to node 4595630496 facing 소월로.
//   약수터: unnamed OSM drinking_water node/14055752827, labeled generically.
//   Basin trough shape is a guess (OSM has no outline). 들머리 furniture (bollards,
//   bench, racks) sits at the OSM junction of way/244398390 and way/244475343.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const STOREY = 3.6; // guess; official source states 5 floors, not a metre height
const SLAB_H = 0.38;
const SLAB_OUT = 0.18;
const BALCONY = 1.28; // inferred from Brique "깊은 발코니"; not measured
const WINDOW_MOD = 2.15; // typical curtain-wall module; not measured
const CONCRETE = '#c6b79f';
const SLAB = '#d8d0c2';
const PLINTH = '#a89f90';
const CORE = '#b7aa94';
const ROOF = '#b4ada0';
const STEEL = '#5c656e';

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

function ringPts(pts) {
  if (!pts?.length) return [];
  const out = pts.map((p) => [p[0], p[1]]);
  if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 0.2) {
    out.pop();
  }
  return out;
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a * 0.5;
}

function ensureCCW(pts) {
  return signedArea(pts) < 0 ? pts.slice().reverse() : pts;
}

function offsetPoly(pts, d) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
    const e1x = b[0] - a[0], e1z = b[1] - a[1], l1 = Math.hypot(e1x, e1z) || 1;
    const e2x = c[0] - b[0], e2z = c[1] - b[1], l2 = Math.hypot(e2x, e2z) || 1;
    // Outward for CCW in XZ (left-handed screen, +z south): (dz, -dx)
    const n1x = e1z / l1, n1z = -e1x / l1;
    const n2x = e2z / l2, n2z = -e2x / l2;
    let nx = n1x + n2x, nz = n1z + n2z, L = Math.hypot(nx, nz) || 1;
    const miter = Math.min(2.4, 1 / Math.max(0.25, (nx / L) * n1x + (nz / L) * n1z));
    out.push([b[0] + (nx / L) * d * miter, b[1] + (nz / L) * d * miter]);
  }
  return out;
}

function shapeOf(pts) {
  // World XZ → shape XY with Z flipped so rotateX(-π/2) lands at +Z
  // (otherwise the building mirrors to z = -z and leaves the mountain).
  const mapped = pts.map((p) => [p[0], -p[1]]);
  const ring = signedArea(mapped) < 0 ? mapped.slice().reverse() : mapped;
  const s = new THREE.Shape();
  s.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) s.lineTo(ring[i][0], ring[i][1]);
  s.closePath();
  return s;
}

function extrudeXY(pts, depth) {
  const geo = new THREE.ExtrudeGeometry(shapeOf(pts), { depth, bevelEnabled: false, steps: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function drapeRibbon(pts, width, heightAt, dy) {
  const n = pts.length;
  if (n < 2) return null;
  const pos = [], idx = [];
  const hw = width / 2;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const lx = p[0] - dz * hw, lz = p[1] + dx * hw;
    const rx = p[0] + dz * hw, rz = p[1] - dx * hw;
    pos.push(lx, heightAt(lx, lz) + dy, lz, rx, heightAt(rx, rz) + dy, rz);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Smooth draped fan (clean oval/circle edge, no stair-step grid).
function drapedFan(cx, cz, ring, heightAt, dy) {
  if (!ring || ring.length < 3) return null;
  const pos = [];
  const yc = heightAt(cx, cz) + dy;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    pos.push(cx, yc, cz);
    pos.push(a[0], heightAt(a[0], a[1]) + dy, a[1]);
    pos.push(b[0], heightAt(b[0], b[1]) + dy, b[1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function segsCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(den) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
  const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
  return t > 0.03 && t < 0.97 && u >= 0 && u <= 1;
}

function segmentHitsRing(ax, az, bx, bz, ring) {
  if (!ring || ring.length < 3) return false;
  const aIn = pointInRing(ax, az, ring), bIn = pointInRing(bx, bz, ring);
  if (aIn !== bIn) return true;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    if (segsCross(ax, az, bx, bz, p[0], p[1], q[0], q[1])) return true;
  }
  return false;
}

function plate(w, h, d, color, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Two FrontSide planes back-to-back so each face reads correctly.
// DoubleSide on one plane shows a mirrored backface from the other side.
function readableSign(map, w, h) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({ map, toneMapped: false, fog: false });
  const front = new THREE.Mesh(geo, mat);
  const back = new THREE.Mesh(geo, mat.clone());
  back.rotation.y = Math.PI;
  g.add(front, back);
  return g;
}

function signTexture(title, sub, bg = '#3d3428', fg = '#f3ead4') {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 384;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 768, 384);
  x.strokeStyle = '#c4b48a'; x.lineWidth = 14; x.strokeRect(18, 18, 732, 348);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 92px sans-serif';
  x.fillText(title, 384, sub ? 160 : 192);
  if (sub) {
    x.font = '600 36px sans-serif';
    x.fillStyle = '#d7c49a';
    x.fillText(sub, 384, 262);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function windowTextures() {
  if (typeof document === 'undefined') return { map: null, emissiveMap: null };
  const w = 256, h = 256;
  const day = document.createElement('canvas'); day.width = w; day.height = h;
  const night = document.createElement('canvas'); night.width = w; night.height = h;
  const d = day.getContext('2d');
  const n = night.getContext('2d');
  d.fillStyle = '#4d555c'; d.fillRect(0, 0, w, h);
  n.fillStyle = '#090909'; n.fillRect(0, 0, w, h);
  const inset = 18;
  d.fillStyle = '#6e8aa0';
  d.fillRect(inset, inset, w - inset * 2, h - inset * 2);
  // Warm reading-room light for the pane; frames stay dark.
  n.fillStyle = '#f3deaa';
  n.fillRect(inset, inset, w - inset * 2, h - inset * 2);
  // transom bar
  d.fillStyle = '#4d555c';
  d.fillRect(0, 86, w, 16);
  n.fillStyle = '#090909';
  n.fillRect(0, 86, w, 16);
  const map = new THREE.CanvasTexture(day);
  const emissiveMap = new THREE.CanvasTexture(night);
  for (const t of [map, emissiveMap]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { map, emissiveMap };
}

// Vertical window-band quads along a CCW ring, UVs repeating every WINDOW_MOD metres.
function wallBandGeos(pts, y0, h) {
  const geos = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz);
    if (L < 0.25) continue;
    const nx = dz / L, nz = -dx / L; // outward
    const geo = new THREE.PlaneGeometry(L, h);
    const uv = geo.attributes.uv;
    const uScale = Math.max(1, L / WINDOW_MOD);
    for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * uScale);
    const yaw = Math.atan2(nx, nz);
    geo.rotateY(yaw);
    geo.translate((a[0] + b[0]) / 2 + nx * 0.03, y0 + h * 0.5, (a[1] + b[1]) / 2 + nz * 0.03);
    geo.computeVertexNormals();
    geos.push(geo);
  }
  return geos;
}

function railGeosOn(pts, y, h = 0.82) {
  const geos = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz);
    if (L < 0.3) continue;
    const yaw = Math.atan2(dx, dz);
    const g = new THREE.BoxGeometry(0.05, 0.06, L);
    g.rotateY(yaw);
    g.translate((a[0] + b[0]) / 2, y + h, (a[1] + b[1]) / 2);
    geos.push(g);
  }
  return geos;
}

function addMerged(group, geos, material, name, opts = {}) {
  if (!geos.length) return null;
  const g = mergeGeometries(geos, false);
  for (const x of geos) x.dispose?.();
  if (!g) return null;
  const m = new THREE.Mesh(g, material);
  m.name = name;
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  group.add(m);
  return m;
}

function addURacks(group, x, z, heightAt, count, yaw) {
  const steel = new THREE.MeshLambertMaterial({ color: '#5a6168' });
  const hx = Math.sin(yaw), hz = Math.cos(yaw);
  const px = -hz, pz = hx;
  for (let i = 0; i < count; i++) {
    const ox = x + px * (i - (count - 1) * 0.5) * 0.9;
    const oz = z + pz * (i - (count - 1) * 0.5) * 0.9;
    const y = heightAt(ox, oz);
    const left = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.92, 6), steel);
    left.position.set(ox - hx * 0.24, y + 0.46, oz - hz * 0.24);
    const right = left.clone();
    right.position.set(ox + hx * 0.24, y + 0.46, oz + hz * 0.24);
    const top = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 6, 10, Math.PI), steel);
    top.position.set(ox, y + 0.92, oz);
    top.rotation.y = yaw;
    top.rotation.z = Math.PI;
    group.add(left, right, top);
  }
}

function addBench(group, x, z, heightAt, yaw) {
  const y = heightAt(x, z);
  group.add(plate(1.85, 0.12, 0.5, '#8a6a4e', x, y + 0.44, z, yaw));
  group.add(plate(1.85, 0.4, 0.08, '#8a6a4e', x - Math.sin(yaw) * 0.2, y + 0.74, z - Math.cos(yaw) * 0.2, yaw));
  const px = -Math.cos(yaw), pz = Math.sin(yaw);
  for (const u of [-0.7, 0.7]) {
    group.add(plate(0.1, 0.4, 0.1, '#5c6670', x + px * u, y + 0.2, z + pz * u));
  }
}

export function createNamsanLibrary({ parent, osm, heightAt, overlay = null } = {}) {
  const group = new THREE.Group();
  group.name = 'namsan-library';
  if (parent) parent.add(group);

  const lib = osm?.library;
  const spring = osm?.spring;
  const glassMats = [];
  const empty = {
    group,
    entrance: lib?.entrance || null,
    spring: spring ? { x: spring.x, z: spring.z } : null,
    roofY: 0,
    floorY() { return null; },
    isBlocked() { return false; },
    setNight() {},
  };
  if (!lib?.pts || lib.pts.length < 4) return empty;

  const raw = ringPts(lib.pts);
  const pts = ensureCCW(raw);
  const c = centroid(pts);
  let yMin = Infinity, yMax = -Infinity;
  for (const p of pts) {
    const y = heightAt(p[0], p[1]);
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  if (!Number.isFinite(yMin)) return empty;
  const floors = Number(lib.floors) || 5;
  const yBase = yMin - 0.15;
  const bodyH = floors * STOREY;
  const roofY = yBase + bodyH;

  const glassRing = offsetPoly(pts, -BALCONY);
  const coreRing = offsetPoly(pts, -(BALCONY + 0.2));
  const slabRing = offsetPoly(pts, SLAB_OUT);

  const found = extrudeXY(pts, 2.15);
  const foundMesh = new THREE.Mesh(found, new THREE.MeshLambertMaterial({ color: PLINTH }));
  foundMesh.position.y = yBase - 2.0;
  foundMesh.receiveShadow = true;
  foundMesh.name = 'namsan-library-plinth';
  group.add(foundMesh);

  // Opaque core so recessed glass does not see through the building.
  const core = new THREE.Mesh(extrudeXY(coreRing, bodyH), new THREE.MeshLambertMaterial({ color: CORE }));
  core.position.y = yBase;
  core.castShadow = true;
  core.receiveShadow = true;
  core.name = 'namsan-library-core';
  group.add(core);

  const winTex = windowTextures();
  const gmat = new THREE.MeshStandardMaterial({
    color: '#c5d4de',
    map: winTex.map,
    roughness: 0.22,
    metalness: 0.18,
    transparent: true,
    opacity: 0.94,
    emissive: new THREE.Color('#f3deaa'),
    emissiveMap: winTex.emissiveMap,
    emissiveIntensity: 0,
    depthWrite: false,
  });
  glassMats.push(gmat);

  const slabMat = new THREE.MeshLambertMaterial({ color: SLAB });
  const railMat = new THREE.MeshLambertMaterial({ color: '#8a9096' });
  const sillMat = new THREE.MeshLambertMaterial({ color: CONCRETE });
  const slabGeos = [];
  const glassGeos = [];
  const balconyRails = [];
  const sillGeos = [];
  const sillH = 0.46;
  const glassH = STOREY - SLAB_H - sillH - 0.12;

  for (let i = 0; i < floors; i++) {
    const floorY0 = yBase + i * STOREY;
    sillGeos.push(extrudeXY(offsetPoly(pts, -BALCONY + 0.06), sillH));
    sillGeos[sillGeos.length - 1].translate(0, floorY0, 0);
    glassGeos.push(...wallBandGeos(glassRing, floorY0 + sillH, glassH));
    const slabGeo = extrudeXY(slabRing, SLAB_H);
    slabGeo.translate(0, floorY0 + STOREY - SLAB_H, 0);
    slabGeos.push(slabGeo);
    balconyRails.push(...railGeosOn(slabRing, floorY0 + STOREY - 0.04, 0.78));
  }
  addMerged(group, slabGeos, slabMat, 'namsan-library-slabs');
  addMerged(group, sillGeos, sillMat, 'namsan-library-sills');
  addMerged(group, glassGeos, gmat, 'namsan-library-glass', { cast: false });
  addMerged(group, balconyRails, railMat, 'namsan-library-rails');

  const roof = extrudeXY(offsetPoly(pts, 0.1), 0.24);
  const roofMesh = new THREE.Mesh(roof, new THREE.MeshLambertMaterial({ color: ROOF }));
  roofMesh.position.y = roofY;
  roofMesh.receiveShadow = true;
  group.add(roofMesh);
  const paraMesh = new THREE.Mesh(extrudeXY(offsetPoly(pts, 0.1), 0.55), new THREE.MeshLambertMaterial({ color: '#c2bbb0' }));
  paraMesh.position.y = roofY + 0.24;
  group.add(paraMesh);

  // Entrance: south facade at the OSM service-way end (guess, see file header).
  const ent = lib.entrance || { x: -11200.24, z: -20596.02 };
  const towardRoad = { x: -11230.15 - ent.x, z: -20531.94 - ent.z };
  const tL = Math.hypot(towardRoad.x, towardRoad.z) || 1;
  const ehx = towardRoad.x / tL, ehz = towardRoad.z / tL;
  const eyaw = Math.atan2(ehx, ehz);
  // Sit the storefront in the recessed glass plane, not on the outer slab edge.
  const doorX = ent.x - ehx * BALCONY;
  const doorZ = ent.z - ehz * BALCONY;
  const doorY = heightAt(ent.x, ent.z);

  const px = -ehz, pz = ehx;

  // Concrete portal as jambs + lintel only — a solid slab hid the glass doors.
  for (const side of [-2.55, 2.55]) {
    group.add(plate(0.48, 3.35, 0.42, CONCRETE, doorX + ehx * 0.1 + px * side, doorY + 1.72, doorZ + ehz * 0.1 + pz * side, eyaw));
  }
  const lintel = plate(5.6, 0.42, 0.42, CONCRETE, doorX + ehx * 0.1, doorY + 3.38, doorZ + ehz * 0.1, eyaw);
  lintel.name = 'namsan-library-portal';
  group.add(lintel);
  const frameMat = new THREE.MeshLambertMaterial({ color: STEEL });
  const glassDoorMat = new THREE.MeshStandardMaterial({
    color: '#8aa8bc',
    roughness: 0.12,
    metalness: 0.28,
    transparent: true,
    opacity: 0.88,
    emissive: new THREE.Color('#f0dcb0'),
    emissiveIntensity: 0,
  });
  glassMats.push(glassDoorMat);
  const doorGeos = [];
  // outer frame
  for (const [w, h, d, ox, oy] of [
    [3.85, 0.1, 0.1, 0, 2.72],
    [3.85, 0.1, 0.1, 0, 0.12],
    [0.1, 2.7, 0.1, -1.88, 1.42],
    [0.1, 2.7, 0.1, 1.88, 1.42],
    [0.1, 2.7, 0.1, 0, 1.42],
    [3.85, 0.08, 0.1, 0, 2.22],
  ]) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(eyaw);
    g.translate(doorX + ehx * 0.22 + px * ox, doorY + oy, doorZ + ehz * 0.22 + pz * ox);
    doorGeos.push(g);
  }
  addMerged(group, doorGeos, frameMat, 'namsan-library-door-frame');
  for (const side of [-0.94, 0.94]) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(1.72, 2.02, 0.05), glassDoorMat);
    pane.position.set(doorX + ehx * 0.24 + px * side, doorY + 1.18, doorZ + ehz * 0.24 + pz * side);
    pane.rotation.y = eyaw;
    group.add(pane);
  }
  const transom = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.42, 0.05), glassDoorMat);
  transom.position.set(doorX + ehx * 0.24, doorY + 2.46, doorZ + ehz * 0.24);
  transom.rotation.y = eyaw;
  group.add(transom);

  const canopy = plate(8.6, 0.24, 3.6, SLAB, doorX + ehx * 1.35, doorY + 3.42, doorZ + ehz * 1.35, eyaw);
  canopy.name = 'namsan-library-canopy';
  group.add(canopy);
  for (const s of [-3.5, 3.5]) {
    group.add(plate(0.22, 3.28, 0.22, PLINTH, doorX + ehx * 0.35 + px * s, doorY + 1.64, doorZ + ehz * 0.35 + pz * s));
  }
  const canopyLight = new THREE.Mesh(
    new THREE.BoxGeometry(7.2, 0.04, 2.6),
    new THREE.MeshBasicMaterial({ color: '#ffe2b0', transparent: true, opacity: 0, toneMapped: false, fog: false }),
  );
  canopyLight.position.set(doorX + ehx * 1.35, doorY + 3.28, doorZ + ehz * 1.35);
  canopyLight.rotation.y = eyaw;
  canopyLight.name = 'namsan-library-canopy-light';
  group.add(canopyLight);
  glassMats.push(canopyLight.material);

  // Nameplate on the canopy fascia, facing 소월로 (Plane +Z aligned with outward).
  if (typeof document !== 'undefined') {
    try {
      const plateMap = signTexture('남산도서관', '서울특별시교육청', '#4a453c', '#f4eee0');
      const fascia = new THREE.Mesh(
        new THREE.PlaneGeometry(5.2, 1.05),
        new THREE.MeshBasicMaterial({ map: plateMap, toneMapped: false, fog: false }), // [text-orientation] 앞면만 (뒤는 캐노피)
      );
      fascia.position.set(doorX + ehx * 3.18, doorY + 3.44, doorZ + ehz * 3.18);
      fascia.rotation.y = eyaw;
      fascia.name = 'namsan-library-nameplate';
      group.add(fascia);
    } catch { /* node tests without canvas */ }
  }

  // Forecourt: a draped ribbon (clean parallel edges) instead of a stair-step grid.
  const plaza = [];
  const depthIn = 2.0, depthOut = 9.2, halfW = 5.6;
  for (const [along, side] of [
    [-depthIn, -halfW], [-depthIn, halfW], [depthOut, halfW], [depthOut, -halfW],
  ]) {
    plaza.push([doorX + ehx * along + px * side, doorZ + ehz * along + pz * side]);
  }
  const plazaLine = [];
  for (let t = -depthIn; t <= depthOut + 0.01; t += 0.9) {
    plazaLine.push([doorX + ehx * t, doorZ + ehz * t]);
  }
  const plazaGeo = drapeRibbon(plazaLine, halfW * 2, heightAt, 0.05);
  if (plazaGeo) {
    const plazaMesh = new THREE.Mesh(plazaGeo, new THREE.MeshLambertMaterial({
      color: '#c4c0b6', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    plazaMesh.receiveShadow = true;
    plazaMesh.name = 'namsan-library-plaza';
    group.add(plazaMesh);
  }
  for (const s of [-4.0, 4.0]) {
    addBench(group, doorX + ehx * 6.2 + px * s, doorZ + ehz * 6.2 + pz * s, heightAt, eyaw);
  }

  const rack = lib.cycleStand;
  if (rack && Number.isFinite(rack.x)) {
    addURacks(group, rack.x, rack.z, heightAt, 6, eyaw);
  }

  // ---- 약수터 basin at OSM drinking_water node/14055752827 ----
  if (spring && Number.isFinite(spring.x)) {
    const sx = spring.x, sz = spring.z, sy = heightAt(sx, sz);
    const padPoly = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      padPoly.push([sx + Math.cos(a) * 6.2, sz + Math.sin(a) * 6.2]);
    }
    const padGeo = drapedFan(sx, sz, padPoly, heightAt, 0.05);
    if (padGeo) {
      const pad = new THREE.Mesh(padGeo, new THREE.MeshLambertMaterial({
        color: '#b7b1a4', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      pad.receiveShadow = true;
      pad.name = 'namsan-yaksu-pad';
      group.add(pad);
    }
    // Stone trough (shape is a guess — OSM has amenity=drinking_water only).
    const trough = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.62, 1.45),
      new THREE.MeshLambertMaterial({ color: '#9a9386' }),
    );
    trough.position.set(sx, sy + 0.38, sz);
    trough.name = 'namsan-yaksu-basin';
    group.add(trough);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(2.28, 1.08),
      new THREE.MeshStandardMaterial({
        color: '#6a8ea0', roughness: 0.1, metalness: 0.18,
        emissive: new THREE.Color('#7aa0b0'), emissiveIntensity: 0.1,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(sx, sy + 0.7, sz);
    group.add(water);
    const tapMat = new THREE.MeshLambertMaterial({ color: '#6a7076' });
    for (const tx of [-0.85, 0, 0.85]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.95, 6), tapMat);
      post.position.set(sx + tx, sy + 0.95, sz - 0.55);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6), tapMat);
      spout.rotation.x = Math.PI / 2;
      spout.position.set(sx + tx, sy + 1.28, sz - 0.32);
      group.add(post, spout);
    }
    // Open timber shelter
    group.add(plate(3.8, 0.12, 3.2, '#6e543c', sx, sy + 2.55, sz));
    for (const [dx, dz] of [[-1.6, -1.3], [1.6, -1.3], [-1.6, 1.3], [1.6, 1.3]]) {
      group.add(plate(0.14, 2.4, 0.14, '#5a4634', sx + dx, sy + 1.3, sz + dz));
    }
    addBench(group, sx + 3.4, sz + 0.4, heightAt, 1.2);
    addURacks(group, sx - 4.0, sz + 2.4, heightAt, 4, 0.35);
    for (const i of [-1.3, 0, 1.3]) {
      const px_ = sx - 1.4 + i;
      const pz_ = sz + 4.15;
      const by = heightAt(px_, pz_);
      const bollard = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 0.72, 8),
        new THREE.MeshLambertMaterial({ color: '#5c656e' }),
      );
      bollard.position.set(px_, by + 0.36, pz_);
      group.add(bollard);
    }

    if (typeof document !== 'undefined') {
      try {
        const smap = signTexture('약수터', null, '#3d3428', '#f3ead4');
        const sboard = readableSign(smap, 1.7, 0.85);
        sboard.position.set(sx + 2.4, sy + 1.9, sz + 1.2);
        group.add(sboard);
        group.add(plate(0.1, 1.75, 0.1, '#5a4634', sx + 2.4, sy + 0.92, sz + 1.2));
      } catch { /* node tests */ }
    }
  }

  // Trailhead mouth a little uphill of the library (OSM service/aisle junction).
  const mouth = spring?.entrance;
  let mouthPoly = null;
  if (mouth && Number.isFinite(mouth.x)) {
    const mx = mouth.x, mz = mouth.z, my = heightAt(mx, mz);
    // Toward the spring so the landing orients uphill.
    let uhx = 0, uhz = -1;
    if (spring && Number.isFinite(spring.x)) {
      uhx = spring.x - mx; uhz = spring.z - mz;
      const uL = Math.hypot(uhx, uhz) || 1;
      uhx /= uL; uhz /= uL;
    }
    const uyaw = Math.atan2(uhx, uhz);
    const vx = -uhz, vz = uhx;
    mouthPoly = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const along = 5.2 * Math.sin(a), across = 6.4 * Math.cos(a);
      mouthPoly.push([mx + uhx * along + vx * across, mz + uhz * along + vz * across]);
    }
    const mgeo = drapedFan(mx, mz, mouthPoly, heightAt, 0.05);
    if (mgeo) {
      const mm = new THREE.Mesh(mgeo, new THREE.MeshLambertMaterial({
        color: '#b9b3a6', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      }));
      mm.receiveShadow = true;
      mm.name = 'namsan-yaksu-mouth';
      group.add(mm);
    }
    // Stone gate posts + wooden sign.
    group.add(plate(0.42, 1.85, 0.42, '#9a9386', mx + vx * -2.15 - uhx * 0.4, my + 0.92, mz + vz * -2.15 - uhz * 0.4));
    group.add(plate(0.42, 1.85, 0.42, '#9a9386', mx + vx * 2.15 - uhx * 0.4, my + 0.92, mz + vz * 2.15 - uhz * 0.4));
    if (typeof document !== 'undefined') {
      try {
        const tmap = signTexture('약수터', '산책·자전거 들머리', '#3d3428', '#f3ead4');
        const board = readableSign(tmap, 2.35, 1.15);
        board.position.set(mx - uhx * 0.2, my + 2.25, mz - uhz * 0.2);
        board.rotation.y = uyaw + Math.PI; // face walkers arriving from the library
        group.add(board);
      } catch { /* node tests */ }
    }
    // Bollards along the downhill lip (toward the library / 소월로).
    for (let i = -2; i <= 2; i++) {
      const bx = mx - uhx * 4.4 + vx * i * 1.35;
      const bz = mz - uhz * 4.4 + vz * i * 1.35;
      const by = heightAt(bx, bz);
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.72, 8), new THREE.MeshLambertMaterial({ color: '#5c656e' }));
      bollard.position.set(bx, by + 0.36, bz);
      group.add(bollard);
    }
    // Short railing on both sides of the uphill throat.
    const railMat2 = new THREE.MeshLambertMaterial({ color: '#7a8078' });
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const rx = mx + uhx * (0.8 + k * 1.5) + vx * side * 4.4;
        const rz = mz + uhz * (0.8 + k * 1.5) + vz * side * 4.4;
        const ry = heightAt(rx, rz);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.95, 6), railMat2);
        post.position.set(rx, ry + 0.48, rz);
        group.add(post);
        if (k < 2) {
          const rx2 = mx + uhx * (0.8 + (k + 1) * 1.5) + vx * side * 4.4;
          const rz2 = mz + uhz * (0.8 + (k + 1) * 1.5) + vz * side * 4.4;
          const L = Math.hypot(rx2 - rx, rz2 - rz);
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, L), railMat2);
          bar.position.set((rx + rx2) / 2, (ry + heightAt(rx2, rz2)) / 2 + 0.88, (rz + rz2) / 2);
          bar.rotation.y = Math.atan2(rx2 - rx, rz2 - rz);
          group.add(bar);
        }
      }
    }
    addURacks(group, mx + vx * 3.6 + uhx * 1.2, mz + vz * 3.6 + uhz * 1.2, heightAt, 5, uyaw + Math.PI / 2);
    addBench(group, mx + vx * -3.5 + uhx * 1.6, mz + vz * -3.5 + uhz * 1.6, heightAt, uyaw);
  }

  // Parking aisle way/244475343 is already a terrain-hugging service ribbon.
  // A coarse fill of OSM way/1171251554 photographed as a jagged floating slab,
  // so the area outline is kept only for walk collision / floorY.
  const parkingPts = ringPts(spring?.parkingPts || []);

  if (overlay) {
    overlay.add({
      cls: 'label landmark',
      text: '남산도서관',
      getPos: () => new THREE.Vector3(c.x, roofY + 4.2, c.z),
      maxDist: 360,
      minDist: 24,
    });
    const stops = (osm?.busStops || []).filter((s) => (s.name || '').includes('남산도서관'));
    const stop = stops.find((s) => s.ref === '03168') || stops[0];
    if (stop) {
      overlay.add({
        cls: 'label',
        text: '🚌 남산도서관 정류장',
        getPos: () => new THREE.Vector3(stop.x, heightAt(stop.x, stop.z) + 6.2, stop.z),
        maxDist: 150,
        minDist: 14,
      });
    }
    if (mouth && Number.isFinite(mouth.x)) {
      overlay.add({
        cls: 'label landmark',
        text: '약수터',
        getPos: () => new THREE.Vector3(mouth.x, heightAt(mouth.x, mouth.z) + 4.4, mouth.z),
        maxDist: 200,
        minDist: 12,
        // Hide when the library mass sits between the camera and the label
        // (otherwise the HTML overlay draws through the south facade).
        visibleIf: (cam, p) => {
          if ((cam.position.y - p.y) > 50) return true;
          return !segmentHitsRing(cam.position.x, cam.position.z, p.x, p.z, pts);
        },
      });
    }
  }

  const plazaSet = plaza;
  function floorY(x, z, refY = Infinity) {
    if (plazaSet && pointInRing(x, z, plazaSet)) {
      const y = heightAt(x, z) + 0.07;
      return y <= refY + 0.4 ? y : null;
    }
    if (mouthPoly && pointInRing(x, z, mouthPoly)) {
      const y = heightAt(x, z) + 0.07;
      return y <= refY + 0.4 ? y : null;
    }
    if (parkingPts.length >= 4 && pointInRing(x, z, parkingPts)) {
      const y = heightAt(x, z) + 0.06;
      return y <= refY + 0.4 ? y : null;
    }
    return null;
  }

  function isBlocked(x, z, r = 0.4) {
    const dx = x - doorX, dz = z - doorZ;
    if (dx * ehx + dz * ehz > -1.4 && dx * ehx + dz * ehz < 3.4 && Math.abs(-dx * ehz + dz * ehx) < 2.5) {
      return false;
    }
    if (!pointInRing(x, z, pts)) {
      if (r <= 0) return false;
      const probes = [
        [x + r, z], [x - r, z], [x, z + r], [x, z - r],
      ];
      return probes.some((p) => pointInRing(p[0], p[1], pts));
    }
    return true;
  }

  return {
    group,
    entrance: { x: doorX, z: doorZ, hx: ehx, hz: ehz, y: doorY, yaw: eyaw },
    spring: spring && Number.isFinite(spring.x) ? { x: spring.x, z: spring.z } : null,
    mouth: mouth && Number.isFinite(mouth.x) ? { x: mouth.x, z: mouth.z } : null,
    roofY,
    center: c,
    floorY,
    isBlocked,
    setNight(v = 0) {
      const k = Math.max(0, Math.min(1, v));
      for (const m of glassMats) {
        if ('emissiveIntensity' in m) m.emissiveIntensity = k * 0.85;
      }
      if (canopyLight?.material) canopyLight.material.opacity = k * 0.72;
    },
  };
}
