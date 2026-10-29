// 스타벅스 1층은 벽이 아니라 통유리. 밖에서 카운터 안이 보이게 유리 쉘과 실내 동선을 만든다.
import * as THREE from 'three';
import { watchEvening } from '../evening.js';

const PODIUM = 3.4;
const GLASS_TOP = 3.32;

export function ringKey(ring) {
  return ring.map(([x, z]) => (Math.round(x * 10) / 10) + ',' + (Math.round(z * 10) / 10)).sort().join(';');
}

function pointInRing(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function centroid(ring) {
  let x = 0, z = 0;
  for (const p of ring) { x += p[0]; z += p[1]; }
  return [x / ring.length, z / ring.length];
}

function scaleRing(ring, f) {
  const [cx, cz] = centroid(ring);
  return ring.map(([x, z]) => [cx + (x - cx) * f, cz + (z - cz) * f]);
}

function toShape(ring) {
  return new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
}

function ringBounds(ring) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

// 가게보다 조금 넓은 바닥 빛. 가운데는 따뜻하고 가장자리로 갈수록 걷힌다.
function warmPoolTexture() {
  const s = 160;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const img = g.createImageData(s, s);
  const px = img.data;
  const c = (s - 1) / 2;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const nx = (x - c) / c, ny = (y - c) / c;
      const box = Math.max(Math.abs(nx), Math.abs(ny));
      const round = Math.hypot(nx, ny) / Math.SQRT2;
      const t = Math.min(1, box * 0.84 + round * 0.16);
      const start = 0.58;
      let fade;
      if (t <= start) fade = 1 - t * 0.18;
      else {
        const u = (t - start) / (1 - start);
        const sm = u * u * (3 - 2 * u);
        fade = (1 - start * 0.18) * (1 - sm);
      }
      const i = (y * s + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(Math.max(0, fade) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function facingEdge(ring, ax, az) {
  let best = null, bestD = Infinity;
  const [cx, cz] = centroid(ring);
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    if (L < 5) continue;
    const t = Math.max(0, Math.min(1, ((ax - x0) * dx + (az - z0) * dz) / (L * L)));
    const px = x0 + dx * t, pz = z0 + dz * t, d = Math.hypot(px - ax, pz - az);
    if (d < bestD) {
      let nx = -dz / L, nz = dx / L;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (nx * (cx - mx) + nz * (cz - mz) < 0) { nx = -nx; nz = -nz; }
      bestD = d;
      best = { x0, z0, x1, z1, dx: dx / L, dz: dz / L, nx, nz, L, mx, mz };
    }
  }
  return best;
}

function inside(ring, x, z) {
  if (!pointInRing(x, z, ring)) return false;
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2));
    best = Math.min(best, Math.hypot(x0 + dx * t - x, z0 + dz * t - z));
  }
  return best > 1.15;
}

function lane(edge, ring, inward, half) {
  const pts = [];
  for (const along of [-half, half]) {
    let p = null;
    for (const dist of [inward, inward - 0.8, inward + 0.8, inward - 1.6]) {
      const x = edge.mx + edge.nx * dist + edge.dx * along;
      const z = edge.mz + edge.nz * dist + edge.dz * along;
      if (inside(ring, x, z)) { p = [x, z]; break; }
    }
    if (p) pts.push(p);
  }
  return pts.length === 2 ? pts : null;
}

// OSM에 건물이 없는 정자역 스타벅스. SK-U타워(성남대로343번길 9) 맞은편, 성남대로343번길 12-2.
const JEONGJA_STATION_RING = [[-152, -21.5], [-136, -21.5], [-136, -40], [-152, -40]];

export function placeJeongjaStationStarbucks(data) {
  if (data.buildings.some((b) => b.n === '스타벅스 정자역')) return;
  data.buildings.push({ o: JEONGJA_STATION_RING, h: 6.8, k: 'commercial', s: 'default', n: '스타벅스 정자역' });
  data.labels.push({ x: -144, z: -24, y: 9, text: '스타벅스 정자역', kind: 'cafe' });
}

export function starbucksShells(data) {
  const want = new Map();
  const put = (b, spot, mode) => {
    const key = ringKey(b.o);
    const prev = want.get(key);
    if (!prev || b.h > prev.h) want.set(key, { key, ring: b.o, h: b.h, spot, mode, name: b.n, anchor: prev?.anchor });
    else if (spot && !prev.spot) prev.spot = spot;
  };
  for (const b of data.buildings) {
    if (b.n && b.n.includes('스타벅스')) put(b, '스타벅스 매장', b.h <= 12 ? 'full' : 'podium');
  }
  for (const l of data.labels) {
    if (l.kind !== 'cafe' || !l.text?.includes('스타벅스')) continue;
    for (const b of data.buildings) {
      if (!pointInRing(l.x, l.z, b.o) || (b.holes || []).some((h) => pointInRing(l.x, l.z, h))) continue;
      const key = ringKey(b.o);
      put(b, l.text, b.h <= 12 ? 'full' : 'podium');
      const shell = want.get(key);
      if (!shell.anchor) shell.anchor = { x: l.x, z: l.z };
    }
  }
  for (const s of want.values()) if (!s.anchor) s.anchor = { x: centroid(s.ring)[0], z: centroid(s.ring)[1] };
  return [...want.values()];
}

export function starbucksRooms(shells) {
  const rooms = [];
  for (const s of shells) {
    const edge = facingEdge(s.ring, s.anchor.x, s.anchor.z);
    if (!edge) continue;
    const span = Math.min(5.5, edge.L * 0.32);
    const windowLane = lane(edge, s.ring, 2.3, span);
    const counterLane = lane(edge, s.ring, 5.4, Math.min(3.2, span));
    const paths = [windowLane, counterLane].filter(Boolean);
    if (!paths.length) continue;
    rooms.push({ spot: s.spot, paths, edge });
  }
  return rooms;
}

function mullions(ring, gh, frame) {
  const group = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.08, gh, 0.08);
    const railGeo = new THREE.BoxGeometry(0.08, 0.08, 1);
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    if (L < 1.5) continue;
    const ux = dx / L, uz = dz / L;
    const yaw = Math.atan2(ux, uz);
    const n = Math.max(1, Math.round(L / 3.2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const post = new THREE.Mesh(postGeo, frame);
      post.position.set(x0 + dx * t, 0.04 + gh / 2, z0 + dz * t);
      post.castShadow = true;
      group.add(post);
    }
    const rail = new THREE.Mesh(railGeo, frame);
    rail.scale.set(1, 1, L);
    rail.position.set((x0 + x1) / 2, 0.04 + gh - 0.04, (z0 + z1) / 2);
    rail.rotation.y = yaw;
    group.add(rail);
  }
  return group;
}

export function addStarbucksGlass(scene, shells) {
  const rooms = starbucksRooms(shells);
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
  const gx = cv.getContext('2d');
  gx.clearRect(0, 0, 128, 256);
  gx.fillStyle = 'rgba(186, 220, 230, 0.42)';
  gx.fillRect(0, 0, 128, 256);
  gx.fillStyle = 'rgba(255,255,255,0.38)';
  gx.fillRect(16, 0, 18, 256);
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const glassMat = new THREE.MeshLambertMaterial({ map, color: '#e7f4f8', emissive: '#ff8a1e', emissiveIntensity: 0, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide });
  const clearMap = map.clone();
  const clearGlassMat = new THREE.MeshLambertMaterial({ map: clearMap, color: '#f4fbfe', emissive: '#ff7a18', emissiveIntensity: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const frameMat = new THREE.MeshLambertMaterial({ color: '#2a3842' });
  const floorMat = new THREE.MeshLambertMaterial({ color: '#e6d3bc' });
  const floorGlowMat = new THREE.MeshBasicMaterial({ color: '#ff9a45', transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const ceilMat = new THREE.MeshBasicMaterial({ color: '#ffb060', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ff9344', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const spillMat = new THREE.MeshBasicMaterial({
    map: warmPoolTexture(),
    color: '#ff9a42',
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const glowRoots = [];
  let stationDoor = null;
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#1e3932' });
  const topMat = new THREE.MeshLambertMaterial({ color: '#2c261f' });
  const capMat = new THREE.MeshBasicMaterial({ visible: false, depthWrite: false });
  for (const s of shells) {
    const gh = s.mode === 'full' ? Math.max(2.6, s.h - 0.45) : GLASS_TOP;
    const isStation = s.name === '스타벅스 정자역';
    if (isStation) stationDoor = addStationFront(scene, s, gh, clearGlassMat, frameMat);
    else {
      const glassRing = scaleRing(s.ring, 0.988);
      let geo;
      try { geo = new THREE.ExtrudeGeometry(toShape(glassRing), { depth: gh, bevelEnabled: false }); } catch { continue; }
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0.05, 0);
      const glass = new THREE.Mesh(geo, [capMat, glassMat]);
      glass.renderOrder = 2;
      glass.castShadow = false;
      scene.add(glass);
      scene.add(mullions(glassRing, gh, frameMat));
    }
    let floorGeo;
    try { floorGeo = new THREE.ShapeGeometry(toShape(scaleRing(s.ring, 0.96))); } catch { floorGeo = null; }
    if (floorGeo) {
      floorGeo.rotateX(-Math.PI / 2);
      floorGeo.translate(0, 0.06, 0);
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.receiveShadow = true;
      scene.add(floor);
    }
    const glow = new THREE.Group();
    glow.visible = false;
    const inner = scaleRing(s.ring, 0.94);
    let glowGeo = null;
    try { glowGeo = new THREE.ExtrudeGeometry(toShape(inner), { depth: Math.max(2.2, gh - 0.18), bevelEnabled: false }); } catch { glowGeo = null; }
    if (glowGeo) {
      glowGeo.rotateX(-Math.PI / 2);
      glowGeo.translate(0, 0.08, 0);
      const volume = new THREE.Mesh(glowGeo, glowMat);
      volume.renderOrder = 1;
      volume.castShadow = false;
      glow.add(volume);
    }
    let litFloor = null;
    try { litFloor = new THREE.ShapeGeometry(toShape(scaleRing(s.ring, 0.95))); } catch { litFloor = null; }
    if (litFloor) {
      litFloor.rotateX(-Math.PI / 2);
      const warmFloor = new THREE.Mesh(litFloor, floorGlowMat);
      warmFloor.position.y = 0.09;
      warmFloor.receiveShadow = false;
      const ceilGeo = litFloor.clone();
      const ceil = new THREE.Mesh(ceilGeo, ceilMat);
      ceil.position.y = Math.max(1.6, gh - 0.28);
      glow.add(warmFloor, ceil);
    }
    const box = ringBounds(s.ring);
    const spanX = box.maxX - box.minX, spanZ = box.maxZ - box.minZ;
    const padX = Math.max(2.8, spanX * 0.18), padZ = Math.max(2.8, spanZ * 0.18);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(spanX + padX * 2, spanZ + padZ * 2), spillMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set((box.minX + box.maxX) / 2, 0.13, (box.minZ + box.maxZ) / 2);
    pool.renderOrder = 3;
    glow.add(pool);
    scene.add(glow);
    glowRoots.push(glow);
    const room = isStation ? null : rooms.find((r) => r.spot === s.spot);
    const e = isStation ? stationDoor?.edge : room?.edge;
    if (!e) continue;
    const len = Math.min(5.2, e.L * 0.34);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.02, len), bodyMat);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, len + 0.15), topMat);
    const yaw = Math.atan2(e.dx, e.dz);
    const cx = e.mx + e.nx * 4.15, cz = e.mz + e.nz * 4.15;
    if (pointInRing(cx, cz, s.ring)) {
      body.position.set(cx, 0.57, cz);
      top.position.set(cx, 1.08, cz);
      body.rotation.y = top.rotation.y = yaw;
      body.castShadow = top.castShadow = true;
      scene.add(body, top);
      const machine = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.42), new THREE.MeshLambertMaterial({ color: '#3a3f44' }));
      machine.position.set(cx - e.dx * (len * 0.28), 1.32, cz - e.dz * (len * 0.28));
      machine.castShadow = true;
      scene.add(machine);
      if (isStation && stationDoor) {
        stationDoor.counter = { x: cx, z: cz };
        stationDoor.counterLong = len / 2;
        stationDoor.counterDeep = 0.46;
      }
    }
  }
  watchEvening((on) => {
    for (const g of glowRoots) g.visible = on;
    glassMat.emissiveIntensity = on ? 1.6 : 0;
    glassMat.opacity = on ? 0.34 : 0.72;
    glassMat.color.set(on ? '#ff9a3c' : '#e7f4f8');
    clearGlassMat.emissiveIntensity = on ? 1.8 : 0;
    clearGlassMat.opacity = on ? 0.18 : 0.22;
    clearGlassMat.color.set(on ? '#ff8a1e' : '#f4fbfe');
  });
  rooms.door = stationDoor;
  return rooms;
}

export const STARBUCKS_PODIUM = PODIUM;

const DOOR_HALF = 1.2;

function segEdge(x0, z0, x1, z1, ring) {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L;
  let nx = -uz, nz = ux;
  const [cx, cz] = centroid(ring);
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  if (nx * (cx - mx) + nz * (cz - mz) < 0) { nx = -nx; nz = -nz; }
  return { x0, z0, x1, z1, dx: ux, dz: uz, nx, nz, L, mx, mz };
}

function wallPoly(edge, a0, a1, thick) {
  const mid = (a0 + a1) / 2;
  const hl = Math.abs(a1 - a0) / 2;
  const ht = thick / 2;
  const cx = edge.mx + edge.dx * mid;
  const cz = edge.mz + edge.dz * mid;
  const ux = edge.dx, uz = edge.dz, nx = edge.nx, nz = edge.nz;
  return [
    [cx - ux * hl - nx * ht, cz - uz * hl - nz * ht],
    [cx + ux * hl - nx * ht, cz + uz * hl - nz * ht],
    [cx + ux * hl + nx * ht, cz + uz * hl + nz * ht],
    [cx - ux * hl + nx * ht, cz - uz * hl + nz * ht],
  ];
}

export function stationWallColliders(shell) {
  if (!shell || shell.name !== '스타벅스 정자역') return null;
  const doorEdge = facingEdge(shell.ring, shell.anchor.x, shell.anchor.z);
  if (!doorEdge) return null;
  const polys = [];
  for (let i = 0; i < shell.ring.length; i++) {
    const [x0, z0] = shell.ring[i];
    const [x1, z1] = shell.ring[(i + 1) % shell.ring.length];
    const edge = segEdge(x0, z0, x1, z1, shell.ring);
    if (edge.L < 1.5) continue;
    const isDoor = Math.hypot(edge.mx - doorEdge.mx, edge.mz - doorEdge.mz) < 0.45;
    if (!isDoor) {
      polys.push(wallPoly(edge, -edge.L / 2, edge.L / 2, 0.55));
      continue;
    }
    polys.push(wallPoly(edge, -edge.L / 2, -DOOR_HALF, 0.55));
    polys.push(wallPoly(edge, DOOR_HALF, edge.L / 2, 0.55));
  }
  return polys;
}

function addPane(scene, a, b, gh, mat) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  if (L < 0.25) return;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(L, gh - 0.12), mat);
  pane.position.set((a[0] + b[0]) / 2, 0.1 + (gh - 0.12) / 2, (a[1] + b[1]) / 2);
  pane.rotation.y = Math.atan2(-dz, dx);
  pane.renderOrder = 2;
  scene.add(pane);
}

function addStationFront(scene, shell, gh, glassMat, frameMat) {
  const doorEdge = facingEdge(shell.ring, shell.anchor.x, shell.anchor.z);
  if (!doorEdge) return null;
  const postGeo = new THREE.BoxGeometry(0.08, gh, 0.08);
  for (let i = 0; i < shell.ring.length; i++) {
    const [x0, z0] = shell.ring[i];
    const [x1, z1] = shell.ring[(i + 1) % shell.ring.length];
    const edge = segEdge(x0, z0, x1, z1, shell.ring);
    if (edge.L < 1.5) continue;
    const isDoor = Math.hypot(edge.mx - doorEdge.mx, edge.mz - doorEdge.mz) < 0.45;
    const spans = isDoor
      ? [[-edge.L / 2, -DOOR_HALF], [DOOR_HALF, edge.L / 2]]
      : [[-edge.L / 2, edge.L / 2]];
    for (const [a0, a1] of spans) {
      addPane(
        scene,
        [edge.mx + edge.dx * a0, edge.mz + edge.dz * a0],
        [edge.mx + edge.dx * a1, edge.mz + edge.dz * a1],
        gh,
        glassMat,
      );
    }
    const n = Math.max(1, Math.round(edge.L / 3.2));
    for (let k = 0; k <= n; k++) {
      const along = -edge.L / 2 + edge.L * (k / n);
      if (isDoor && Math.abs(along) < DOOR_HALF + 0.05) continue;
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(edge.mx + edge.dx * along, 0.04 + gh / 2, edge.mz + edge.dz * along);
      post.castShadow = true;
      scene.add(post);
    }
  }
  const yaw = Math.atan2(-doorEdge.dz, doorEdge.dx);
  const frame = new THREE.MeshLambertMaterial({ color: '#1a242b' });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.55, 0.1), frame);
    post.position.set(
      doorEdge.mx + doorEdge.dx * DOOR_HALF * side,
      1.28,
      doorEdge.mz + doorEdge.dz * DOOR_HALF * side,
    );
    post.castShadow = true;
    scene.add(post);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(DOOR_HALF * 2 + 0.2, 0.1, 0.12), frame);
  header.position.set(doorEdge.mx, 2.52, doorEdge.mz);
  header.rotation.y = yaw;
  scene.add(header);
  const panelMat = glassMat.clone();
  panelMat.opacity = 0.55;
  const panelGeo = new THREE.PlaneGeometry(DOOR_HALF - 0.06, 2.28);
  const left = new THREE.Mesh(panelGeo, panelMat);
  const right = new THREE.Mesh(panelGeo, panelMat);
  left.rotation.y = right.rotation.y = yaw;
  left.renderOrder = right.renderOrder = 3;
  scene.add(left, right);
  const nx = doorEdge.nx, nz = doorEdge.nz, dx = doorEdge.dx, dz = doorEdge.dz;
  const wood = new THREE.MeshLambertMaterial({ color: '#8d6748' });
  const seatGeo = new THREE.BoxGeometry(0.48, 0.08, 0.48);
  const backGeo = new THREE.BoxGeometry(0.48, 0.42, 0.06);
  const seats = [-3.3, -1.1, 1.1, 3.3].map((along) => {
    const x = doorEdge.mx + nx * 2.45 + dx * along;
    const z = doorEdge.mz + nz * 2.45 + dz * along;
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(seatGeo, wood);
    seat.position.y = 0.42;
    const back = new THREE.Mesh(backGeo, wood);
    back.position.set(-nx * 0.2, 0.68, -nz * 0.2);
    chair.add(seat, back);
    chair.position.set(x, 0, z);
    scene.add(chair);
    return { x, z, yaw: Math.atan2(nx, nz), who: null };
  });
  const curb = [-11, -7, 7, 11, -14, 14].map((along) => ({
    x: doorEdge.mx - nx * 9 + dx * along,
    z: doorEdge.mz - nz * 9 + dz * along,
  }));
  const staff = [-1.3, 1.3].map((along) => ({
    x: doorEdge.mx + nx * 5.55 + dx * along,
    z: doorEdge.mz + nz * 5.55 + dz * along,
  }));
  return {
    edge: doorEdge,
    x: doorEdge.mx,
    z: doorEdge.mz,
    dx, dz, nx, nz,
    open: 0,
    left,
    right,
    counter: { x: doorEdge.mx + nx * 4.15, z: doorEdge.mz + nz * 4.15 },
    counterLong: 2.6,
    counterDeep: 0.46,
    seats,
    curb,
    staff,
    blocks(x, z, r = 0.35) {
      const lx = (x - this.counter.x) * this.dx + (z - this.counter.z) * this.dz;
      const ln = (x - this.counter.x) * this.nx + (z - this.counter.z) * this.nz;
      return Math.abs(lx) < this.counterLong + r && Math.abs(ln) < this.counterDeep + r;
    },
  };
}

const COFFEE_MENU = [
  { id: 'iced', label: '아이스 아메리카노' },
  { id: 'latte', label: '카페라떼' },
  { id: 'hot', label: '따뜻한 아메리카노' },
];

export function updateStarbucksDoor(door, dt, people) {
  if (!door) return;
  let near = false;
  for (const p of people) {
    if (!p || typeof p.x !== 'number') continue;
    if (Math.hypot(p.x - door.x, p.z - door.z) < 3.6) { near = true; break; }
  }
  const target = near ? 1 : 0;
  door.open += (target - door.open) * Math.min(1, dt * 7.5);
  const slide = 0.56 + door.open * 1.08;
  door.left.position.set(door.x - door.dx * slide, 1.28, door.z - door.dz * slide);
  door.right.position.set(door.x + door.dx * slide, 1.28, door.z + door.dz * slide);
}

export function mountStationCafe(door) {
  const bar = document.createElement('div');
  bar.id = 'coffee-order-bar';
  bar.hidden = true;
  const buttons = COFFEE_MENU.map((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.drink = item.id;
    btn.textContent = item.label;
    return btn;
  });
  const drop = document.createElement('button');
  drop.type = 'button';
  drop.className = 'is-drop';
  drop.dataset.drink = '';
  drop.textContent = '잔 내려놓기';
  bar.append(...buttons, drop);
  document.body.appendChild(bar);
  const toss = document.createElement('button');
  toss.id = 'coffee-toss-btn';
  toss.type = 'button';
  toss.hidden = true;
  toss.textContent = '🗑️ 쓰레기통에 버리기';
  document.body.appendChild(toss);

  let press = () => {};
  const onPick = (btn, outside) => {
    if (!btn || btn.hidden) return;
    press(btn.dataset.drink || null, outside);
    btn.blur();
  };
  bar.addEventListener('click', (e) => {
    if (bar.hidden) return;
    onPick(e.target.closest('button'), false);
  });
  toss.addEventListener('click', () => onPick(toss, true));

  const order = (player, say, id, outside) => {
    if (!player) return;
    if (!id) {
      if (!player.userData.coffee) {
        say?.('들고 있는 잔이 없어요.');
        return;
      }
      if (player.userData.handCoffee) {
        player.userData.handCoffee.removeFromParent();
        player.userData.handCoffee = null;
      }
      player.userData.coffee = false;
      say?.(outside ? '쓰레기통에 잔을 버렸어요.' : '잔을 카운터에 내려놓았어요.');
      return;
    }
    const item = COFFEE_MENU.find((entry) => entry.id === id);
    if (!item) return;
    if (player.userData.coffee === id) {
      say?.(`이미 ${item.label}를 들고 있어요.`);
      return;
    }
    if (player.userData.handCoffee) {
      player.userData.handCoffee.removeFromParent();
      player.userData.handCoffee = null;
    }
    player.userData.coffee = id;
    say?.(`${item.label} 나왔습니다.`);
  };

  return {
    order,
    get near() { return !bar.hidden; },
    update(pos, holding, nearBin) {
      if (!door || !pos) { bar.hidden = true; toss.hidden = true; return; }
      const inward = (pos.x - door.x) * door.nx + (pos.z - door.z) * door.nz;
      const at = inward > 1.4 && Math.hypot(pos.x - door.counter.x, pos.z - door.counter.z) < 2.4;
      bar.hidden = !at;
      drop.hidden = !holding;
      toss.hidden = !holding || at || !nearBin;
    },
    bind(fn) { press = fn; },
  };
}
