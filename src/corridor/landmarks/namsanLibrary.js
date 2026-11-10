// [namsan] 서울특별시교육청 남산도서관 + 약수터 들머리.
//   Footprint: OSM way/464461415 (building=yes, no height/levels). Amenity node/414685270.
//   Floors: 5 — nslib.sen.go.kr 시설이용안내. Storey height 3.6 m is a guess (OSM has none).
//   Facade: stacked protruding exposed-concrete slabs / deep balconies (Brique feature
//   on Namsan Library). Warm beige RC, not a painted color. No third-party brand logos.
//   Main door: OSM has no entrance=* tag. Placed on the south facade at the end of
//   service way/244399269, which meets the ring next to node 4595630496 facing 소월로.
//   약수터: unnamed OSM drinking_water node/14055752827, labeled generically.
//   들머리: junction of service way/244398390 and parking_aisle way/244475343.
import * as THREE from 'three';
const STOREY = 3.6; // guess; official source states 5 floors, not a metre height
const SLAB_H = 0.32;
const OVERHANG = 0.88;
const CONCRETE = '#cfc4b0';
const SLAB = '#d9d1c4';
const GLASS = '#5e7a90';
const ROOF = '#b4ada0';

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
    // miter cap so sharp corners do not explode
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

function terrainPatchGeo(poly, heightAt, dy, step = 2.6) {
  if (!poly || poly.length < 3) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of poly) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1];
  }
  x0 -= step; x1 += step; z0 -= step; z1 += step;
  const pos = [];
  const push = (x, z) => {
    pos.push(x, heightAt(x, z) + dy, z);
  };
  for (let z = z0; z < z1; z += step) {
    for (let x = x0; x < x1; x += step) {
      const cx = x + step * 0.5, cz = z + step * 0.5;
      if (!pointInRing(cx, cz, poly) && !pointInRing(x, z, poly)
        && !pointInRing(x + step, z, poly) && !pointInRing(x + step, z + step, poly)
        && !pointInRing(x, z + step, poly)) continue;
      push(x, z); push(x + step, z); push(x + step, z + step);
      push(x, z); push(x + step, z + step); push(x, z + step);
    }
  }
  if (pos.length < 9) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
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

function addURacks(group, x, z, heightAt, count, yaw) {
  const steel = new THREE.MeshLambertMaterial({ color: '#5a6168' });
  const hx = Math.sin(yaw), hz = Math.cos(yaw);
  const px = -hz, pz = hx;
  for (let i = 0; i < count; i++) {
    const ox = x + px * (i - (count - 1) * 0.5) * 0.85;
    const oz = z + pz * (i - (count - 1) * 0.5) * 0.85;
    const y = heightAt(ox, oz);
    const left = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), steel);
    left.position.set(ox - hx * 0.22, y + 0.42, oz - hz * 0.22);
    const right = left.clone();
    right.position.set(ox + hx * 0.22, y + 0.42, oz + hz * 0.22);
    const top = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 10, Math.PI), steel);
    top.position.set(ox, y + 0.85, oz);
    top.rotation.y = yaw;
    top.rotation.z = Math.PI;
    group.add(left, right, top);
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

  const found = extrudeXY(pts, 1.6);
  const foundMesh = new THREE.Mesh(found, new THREE.MeshLambertMaterial({ color: '#b7b0a4' }));
  foundMesh.position.y = yBase - 1.45;
  foundMesh.receiveShadow = true;
  foundMesh.name = 'namsan-library-plinth';
  group.add(foundMesh);

  const body = extrudeXY(pts, bodyH);
  const bodyMesh = new THREE.Mesh(body, new THREE.MeshLambertMaterial({ color: CONCRETE }));
  bodyMesh.position.y = yBase;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.name = 'namsan-library-body';
  group.add(bodyMesh);

  const inset = offsetPoly(pts, -0.22);
  const outset = offsetPoly(pts, OVERHANG);
  for (let i = 0; i < floors; i++) {
    const slabY = yBase + (i + 1) * STOREY - SLAB_H * 0.5;
    const slabGeo = extrudeXY(outset, SLAB_H);
    const slabMesh = new THREE.Mesh(slabGeo, new THREE.MeshLambertMaterial({ color: SLAB }));
    slabMesh.position.y = slabY - SLAB_H * 0.5;
    slabMesh.castShadow = true;
    slabMesh.name = `namsan-library-slab-${i}`;
    group.add(slabMesh);

    const glassH = STOREY - SLAB_H - 0.55;
    const glassGeo = extrudeXY(inset, glassH);
    const gmat = new THREE.MeshStandardMaterial({
      color: GLASS,
      roughness: 0.18,
      metalness: 0.22,
      transparent: true,
      opacity: 0.82,
      emissive: new THREE.Color('#f0dcb0'),
      emissiveIntensity: 0,
      depthWrite: false,
    });
    glassMats.push(gmat);
    const glass = new THREE.Mesh(glassGeo, gmat);
    glass.position.y = yBase + i * STOREY + 0.42;
    glass.name = `namsan-library-glass-${i}`;
    group.add(glass);
  }

  const roof = extrudeXY(offsetPoly(pts, 0.18), 0.22);
  const roofMesh = new THREE.Mesh(roof, new THREE.MeshLambertMaterial({ color: ROOF }));
  roofMesh.position.y = roofY;
  roofMesh.receiveShadow = true;
  group.add(roofMesh);
  const parapet = extrudeXY(offsetPoly(pts, 0.18), 0.55);
  // punch visually by overlaying a thin upstand
  const paraMesh = new THREE.Mesh(parapet, new THREE.MeshLambertMaterial({ color: '#c2bbb0' }));
  paraMesh.position.y = roofY + 0.22;
  group.add(paraMesh);

  // Entrance: south facade at the OSM service-way end (guess, see file header).
  const ent = lib.entrance || { x: -11200.24, z: -20596.02 };
  // Face toward 소월로 along the driveway (way/244399269 start → entrance).
  const towardRoad = { x: -11230.15 - ent.x, z: -20531.94 - ent.z };
  const tL = Math.hypot(towardRoad.x, towardRoad.z) || 1;
  const ehx = towardRoad.x / tL, ehz = towardRoad.z / tL;
  const eyaw = Math.atan2(ehx, ehz);
  const doorX = ent.x - ehx * 0.6;
  const doorZ = ent.z - ehz * 0.6;
  const doorY = heightAt(doorX, doorZ);

  const canopy = plate(8.4, 0.22, 3.4, SLAB, doorX + ehx * 1.1, doorY + 3.35, doorZ + ehz * 1.1, eyaw);
  canopy.name = 'namsan-library-canopy';
  group.add(canopy);
  for (const s of [-3.4, 3.4]) {
    const px = -ehz * s, pz = ehx * s;
    group.add(plate(0.22, 3.25, 0.22, '#b7b0a4', doorX + ehx * 0.15 + px, doorY + 1.62, doorZ + ehz * 0.15 + pz));
  }
  const door = plate(3.6, 2.55, 0.12, '#3a4a56', doorX + ehx * 0.05, doorY + 1.35, doorZ + ehz * 0.05, eyaw);
  const doorGlass = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 2.2, 0.06),
    new THREE.MeshStandardMaterial({
      color: '#6d889c', roughness: 0.12, metalness: 0.25,
      emissive: new THREE.Color('#f0dcb0'), emissiveIntensity: 0,
    }),
  );
  glassMats.push(doorGlass.material);
  doorGlass.position.set(doorX + ehx * 0.12, doorY + 1.4, doorZ + ehz * 0.12);
  doorGlass.rotation.y = eyaw;
  group.add(door, doorGlass);

  // Nameplate on the canopy face — the library's own name, not a third-party mark.
  if (typeof document !== 'undefined') {
    try {
      const plateMap = signTexture('남산도서관', '서울특별시교육청', '#4a453c', '#f4eee0');
      const nameplate = new THREE.Mesh(
        new THREE.PlaneGeometry(4.6, 1.15),
        new THREE.MeshBasicMaterial({ map: plateMap, toneMapped: false, fog: false }),
      );
      nameplate.position.set(doorX + ehx * 2.75, doorY + 3.55, doorZ + ehz * 2.75);
      nameplate.rotation.y = eyaw + Math.PI;
      group.add(nameplate);
    } catch { /* node tests without canvas */ }
  }

  // Forecourt: terrain-hugging pad from the south door toward 소월로 (~20 m).
  const px = -ehz, pz = ehx;
  const plaza = [];
  const depthIn = 3, depthOut = 20, halfW = 12;
  for (const [along, side] of [
    [-depthIn, -halfW], [-depthIn, halfW], [depthOut, halfW], [depthOut, -halfW],
  ]) {
    plaza.push([doorX + ehx * along + px * side, doorZ + ehz * along + pz * side]);
  }
  const plazaGeo = terrainPatchGeo(plaza, heightAt, 0.07, 2.2);
  if (plazaGeo) {
    const plazaMesh = new THREE.Mesh(plazaGeo, new THREE.MeshLambertMaterial({ color: '#c4c0b6' }));
    plazaMesh.receiveShadow = true;
    plazaMesh.name = 'namsan-library-plaza';
    group.add(plazaMesh);
  }
  // Simple benches facing the door (no brand).
  for (const s of [-4.2, 4.2]) {
    const bx = doorX + ehx * 7 + px * s, bz = doorZ + ehz * 7 + pz * s;
    const by = heightAt(bx, bz);
    group.add(plate(1.8, 0.12, 0.48, '#8a6a4e', bx, by + 0.42, bz, eyaw));
    group.add(plate(1.8, 0.38, 0.08, '#8a6a4e', bx - ehx * 0.18, by + 0.72, bz - ehz * 0.18, eyaw));
    for (const u of [-0.7, 0.7]) {
      group.add(plate(0.1, 0.38, 0.1, '#5c6670', bx + px * u, by + 0.2, bz + pz * u));
    }
  }

  // Unbranded inverted-U stands at OSM node/11155393006 (rental location; no 따릉이 mark).
  const rack = lib.cycleStand;
  if (rack && Number.isFinite(rack.x)) {
    addURacks(group, rack.x, rack.z, heightAt, 6, eyaw);
  }

  // ---- 약수터 basin at OSM drinking_water node/14055752827 ----
  if (spring && Number.isFinite(spring.x)) {
    const sx = spring.x, sz = spring.z, sy = heightAt(sx, sz);
    const padPoly = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      padPoly.push([sx + Math.cos(a) * 5.4, sz + Math.sin(a) * 5.4]);
    }
    const padGeo = terrainPatchGeo(padPoly, heightAt, 0.06, 1.6);
    if (padGeo) {
      const pad = new THREE.Mesh(padGeo, new THREE.MeshLambertMaterial({ color: '#b9b3a6' }));
      pad.receiveShadow = true;
      pad.name = 'namsan-yaksu-pad';
      group.add(pad);
    }
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.7, 0.55, 14),
      new THREE.MeshLambertMaterial({ color: '#9a9386' }),
    );
    basin.position.set(sx, sy + 0.32, sz);
    basin.name = 'namsan-yaksu-basin';
    group.add(basin);
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(1.28, 14),
      new THREE.MeshStandardMaterial({
        color: '#6a8ea0', roughness: 0.12, metalness: 0.15,
        emissive: new THREE.Color('#7aa0b0'), emissiveIntensity: 0.08,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(sx, sy + 0.58, sz);
    group.add(water);
    for (const [dx, dz] of [[-1.15, 0.4], [1.15, 0.35], [0.1, -1.2]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.85, 6), new THREE.MeshLambertMaterial({ color: '#6a7076' }));
      post.position.set(sx + dx, sy + 0.72, sz + dz);
      group.add(post);
    }
    // Low open timber shelter over the basin (no brand).
    group.add(plate(3.6, 0.12, 3.0, '#6e543c', sx, sy + 2.35, sz));
    for (const [dx, dz] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2]]) {
      group.add(plate(0.14, 2.2, 0.14, '#5a4634', sx + dx, sy + 1.2, sz + dz));
    }

    if (typeof document !== 'undefined') {
      try {
        const smap = signTexture('약수터', null, '#3d3428', '#f3ead4');
        const sboard = new THREE.Mesh(
          new THREE.PlaneGeometry(1.7, 0.85),
          new THREE.MeshBasicMaterial({ map: smap, toneMapped: false, fog: false, side: THREE.DoubleSide }),
        );
        sboard.position.set(sx + 2.3, sy + 1.85, sz + 1.1);
        group.add(sboard);
        const spost = plate(0.1, 1.7, 0.1, '#5a4634', sx + 2.3, sy + 0.9, sz + 1.1);
        group.add(spost);
      } catch { /* node tests */ }
    }
  }

  // Trailhead mouth a little uphill of the library (OSM service/aisle junction).
  const mouth = spring?.entrance;
  let mouthPoly = null;
  if (mouth && Number.isFinite(mouth.x)) {
    const mx = mouth.x, mz = mouth.z, my = heightAt(mx, mz);
    mouthPoly = [[mx - 4.5, mz - 4.5], [mx + 4.5, mz - 4.5], [mx + 4.5, mz + 4.5], [mx - 4.5, mz + 4.5]];
    const mgeo = terrainPatchGeo(mouthPoly, heightAt, 0.06, 1.8);
    if (mgeo) {
      const mm = new THREE.Mesh(mgeo, new THREE.MeshLambertMaterial({ color: '#b7b1a4' }));
      mm.receiveShadow = true;
      mm.name = 'namsan-yaksu-mouth';
      group.add(mm);
    }
    // Stone gate posts + wooden sign: cyclist/walker trailhead.
    group.add(plate(0.42, 1.7, 0.42, '#9a9386', mx - 1.7, my + 0.85, mz - 0.2));
    group.add(plate(0.42, 1.7, 0.42, '#9a9386', mx + 1.7, my + 0.85, mz - 0.2));
    if (typeof document !== 'undefined') {
      try {
        const tmap = signTexture('약수터', '산책·자전거 들머리', '#3d3428', '#f3ead4');
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(2.2, 1.1),
          new THREE.MeshBasicMaterial({ map: tmap, toneMapped: false, fog: false, side: THREE.DoubleSide }),
        );
        board.position.set(mx, my + 2.15, mz - 0.15);
        group.add(board);
      } catch { /* node tests */ }
    }
    addURacks(group, mx + 3.1, mz + 1.4, heightAt, 3, 0.6);
  }

  // Parking apron next to the spring (OSM way/1171251554), terrain-hugging.
  const parkingPts = ringPts(spring?.parkingPts || []);
  if (parkingPts.length >= 4) {
    const pgeo = terrainPatchGeo(ensureCCW(parkingPts), heightAt, 0.05, 2.8);
    if (pgeo) {
      const pm = new THREE.Mesh(pgeo, new THREE.MeshLambertMaterial({ color: '#7a7f86' }));
      pm.receiveShadow = true;
      pm.name = 'namsan-yaksu-parking';
      group.add(pm);
    }
  }

  if (overlay) {
    overlay.add({
      cls: 'label landmark',
      text: '남산도서관',
      getPos: () => new THREE.Vector3(c.x, roofY + 4.2, c.z),
      maxDist: 360,
      minDist: 24,
    });
    const stops = (osm?.busStops || []).filter((s) => (s.name || '').includes('남산도서관'));
    // One stop label (03168, closest to the library frontage) so three shelters
    // do not stack identical text.
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
        maxDist: 280,
        minDist: 12,
      });
    }
  }

  const plazaSet = plaza;
  function floorY(x, z, refY = Infinity) {
    if (plazaSet && pointInRing(x, z, plazaSet)) {
      const y = heightAt(x, z) + 0.08;
      return y <= refY + 0.4 ? y : null;
    }
    if (mouthPoly && pointInRing(x, z, mouthPoly)) {
      const y = heightAt(x, z) + 0.08;
      return y <= refY + 0.4 ? y : null;
    }
    if (parkingPts.length >= 4 && pointInRing(x, z, parkingPts)) {
      const y = heightAt(x, z) + 0.07;
      return y <= refY + 0.4 ? y : null;
    }
    return null;
  }

  function isBlocked(x, z, r = 0.4) {
    // Keep a door recess walkable so the ground-level entrance shot can stand close.
    const dx = x - doorX, dz = z - doorZ;
    if (dx * ehx + dz * ehz > -1.2 && dx * ehx + dz * ehz < 3.2 && Math.abs(-dx * ehz + dz * ehx) < 2.4) {
      return false;
    }
    if (!pointInRing(x, z, pts)) {
      // thick walls: also block just outside the ring within r + 0.35
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
      for (const m of glassMats) m.emissiveIntensity = k * 0.55;
    },
  };
}
