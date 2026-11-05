// [cityhall] 성남시청 절차적 랜드마크 (로고·브랜드 엠블럼 없음). OSM 외곽 + 참고 사진 매싱.
//   - 유리 커튼월 · 파란 사선 유리 · 필로티 · 옥상 태양광 · 동측 원형 연못/조각
//   - 동쪽 배너 폴 보행 광장 · 북쪽 음악분수(+야간 조명) · 데크·계단의자 · 산책로·조경
//   - 서쪽 시청공원 루프 · 주차장 · 남쪽 차량 출입구
//   성능: 재질 공유 · 정적 메시 병합 · 반복 소품 InstancedMesh · 캔버스 텍스처 소형
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toShape } from '../../world.js';
import { vcMat, paint } from '../tileMesh.js';
import { watchEvening } from '../../evening.js';

const C = {
  glass: '#9ec4d8', glassBlue: '#3a7eb8', mullion: '#c5ced6', slab: '#d8dee4',
  pilotis: '#c8cbcf', soffit: '#aeb4ba', solar: '#1a2330', solarFrame: '#4a5560',
  plaza: '#c9c4b8', plazaDark: '#b0aa9c', lawn: '#6fa86a', lawnDark: '#5a8f56',
  path: '#b8b3a6', brick: '#c4b5a0', brickDark: '#a8947c', wood: '#6b4e32', woodDark: '#4a3520',
  water: '#3a8fb5', waterDeep: '#1e5f7a', pole: '#8a9098', banner: '#2f6db5',
  hedge: '#3d6b3a', trunk: '#5a4030', foliage: '#4f8a48', lamp: '#e8eef2',
  asphalt: '#5a5e64', line: '#e8e8e8', curb: '#9a9ea4', sculpture: '#2a6db5',
  nightWarm: '#ffe3ad', nightCool: '#a8c8ff',
};

let shared = null;
function mats() {
  if (shared) return shared;
  const L = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
  const B = (c, extra = {}) => new THREE.MeshBasicMaterial({ color: c, ...extra });
  shared = {
    vc: vcMat(),
    glass: L(C.glass, { transparent: true, opacity: 0.78, depthWrite: true }),
    glassBody: null, // silver curtain atlas for massing sides
    glassBlue: null, // set below with map
    mullion: L(C.mullion),
    slab: L(C.slab),
    pilotis: L(C.pilotis),
    soffit: L(C.soffit),
    solar: L(C.solar),
    plaza: null,
    lawn: L(C.lawn),
    path: L(C.path),
    brick: L(C.brick),
    wood: L(C.wood),
    water: L(C.water, { transparent: true, opacity: 0.85, emissive: C.waterDeep, emissiveIntensity: 0.2 }),
    pole: L(C.pole),
    banner: null,
    hedge: L(C.hedge),
    trunk: L(C.trunk),
    foliage: L(C.foliage),
    lamp: B(C.lamp),
    asphalt: L(C.asphalt),
    line: B(C.line),
    curb: L(C.curb),
    sculpture: L(C.sculpture, { emissive: C.sculpture, emissiveIntensity: 0.15 }),
    glow: B('#ffffff', { vertexColors: true }),
    jet: B('#eaf8ff', { transparent: true, opacity: 0.88, depthWrite: false }),
  };
  // facade curtain + blue diagonal (512×512 atlas)
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
    const x = cv.getContext('2d');
    // base silver glass
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#d5e4ef'); g.addColorStop(0.5, '#a8c2d4'); g.addColorStop(1, '#8eadc0');
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    // mullion grid
    x.strokeStyle = 'rgba(180,190,200,0.85)'; x.lineWidth = 2;
    for (let i = 0; i <= 16; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 512); x.stroke(); }
    for (let j = 0; j <= 12; j++) { x.beginPath(); x.moveTo(0, j * 42.67); x.lineTo(512, j * 42.67); x.stroke(); }
    // blue diagonal glass band (photo 04/05 signature) — bold, Instagram-recognizable
    x.save();
    x.beginPath();
    x.moveTo(0, 340); x.lineTo(512, 40); x.lineTo(512, 260); x.lineTo(0, 520); x.closePath();
    x.clip();
    const bg = x.createLinearGradient(0, 100, 512, 420);
    bg.addColorStop(0, '#1a5a9a'); bg.addColorStop(0.35, '#2f8ad4'); bg.addColorStop(0.65, '#4aa3e0'); bg.addColorStop(1, '#17508a');
    x.fillStyle = bg; x.fillRect(0, 0, 512, 512);
    // brighter glass reflections in the blue band
    x.fillStyle = 'rgba(200,230,255,0.22)';
    for (let i = 0; i < 8; i++) x.fillRect(i * 64 + 8, 0, 18, 512);
    x.strokeStyle = 'rgba(210,235,255,0.65)'; x.lineWidth = 1.8;
    for (let i = -10; i < 26; i++) {
      x.beginPath(); x.moveTo(i * 26, 0); x.lineTo(i * 26 + 200, 512); x.stroke();
    }
    for (let j = 0; j <= 12; j++) { x.beginPath(); x.moveTo(0, j * 42.67); x.lineTo(512, j * 42.67); x.stroke(); }
    x.restore();
    // floor frit bands
    x.fillStyle = 'rgba(230,235,240,0.55)';
    for (let j = 0; j < 12; j++) x.fillRect(0, j * 42.67 + 36, 512, 6);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    shared.glassBlue = new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.94 });
    shared._facadeTex = tex;
    // silver curtain for other faces (no diagonal)
    const cv2 = document.createElement('canvas'); cv2.width = 256; cv2.height = 256;
    const x2 = cv2.getContext('2d');
    const g2 = x2.createLinearGradient(0, 0, 0, 256);
    g2.addColorStop(0, '#d8e6f0'); g2.addColorStop(0.5, '#b0c8d8'); g2.addColorStop(1, '#8eacbe');
    x2.fillStyle = g2; x2.fillRect(0, 0, 256, 256);
    x2.strokeStyle = 'rgba(170,180,190,0.9)'; x2.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { x2.beginPath(); x2.moveTo(i * 32, 0); x2.lineTo(i * 32, 256); x2.stroke(); }
    for (let j = 0; j <= 6; j++) { x2.beginPath(); x2.moveTo(0, j * 42.67); x2.lineTo(256, j * 42.67); x2.stroke(); }
    x2.fillStyle = 'rgba(230,235,240,0.6)';
    for (let j = 0; j < 6; j++) x2.fillRect(0, j * 42.67 + 34, 256, 7);
    const tex2 = new THREE.CanvasTexture(cv2); tex2.colorSpace = THREE.SRGBColorSpace; tex2.anisotropy = 4; tex2.wrapS = tex2.wrapT = THREE.RepeatWrapping; tex2.repeat.set(6, 4);
    shared.glassBody = new THREE.MeshLambertMaterial({ map: tex2, transparent: true, opacity: 0.9 });
    shared._bodyTex = tex2;

    // plaza paving
    const pv = document.createElement('canvas'); pv.width = 256; pv.height = 256;
    const p = pv.getContext('2d');
    p.fillStyle = '#c9c4b8'; p.fillRect(0, 0, 256, 256);
    p.strokeStyle = '#a8a296'; p.lineWidth = 1;
    for (let i = 0; i <= 8; i++) { p.beginPath(); p.moveTo(i * 32, 0); p.lineTo(i * 32, 256); p.stroke(); p.beginPath(); p.moveTo(0, i * 32); p.lineTo(256, i * 32); p.stroke(); }
    p.fillStyle = '#b8b2a4';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2 === 0) p.fillRect(i * 32 + 1, j * 32 + 1, 30, 30);
    const ptex = new THREE.CanvasTexture(pv); ptex.colorSpace = THREE.SRGBColorSpace; ptex.wrapS = ptex.wrapT = THREE.RepeatWrapping; ptex.repeat.set(20, 12);
    shared.plaza = new THREE.MeshLambertMaterial({ map: ptex }); shared._plazaTex = ptex;

    // generic blue banner (no emblem)
    const bv = document.createElement('canvas'); bv.width = 64; bv.height = 128;
    const b = bv.getContext('2d');
    b.fillStyle = '#2f6db5'; b.fillRect(0, 0, 64, 128);
    b.fillStyle = '#ffffff'; b.fillRect(8, 10, 48, 48);
    b.beginPath(); b.arc(32, 34, 16, 0, Math.PI * 2); b.fillStyle = '#2f6db5'; b.fill();
    b.fillStyle = 'rgba(255,255,255,0.9)'; b.fillRect(12, 70, 40, 8); b.fillRect(16, 86, 32, 6); b.fillRect(20, 100, 24, 6);
    const btex = new THREE.CanvasTexture(bv); btex.colorSpace = THREE.SRGBColorSpace;
    shared.banner = new THREE.MeshLambertMaterial({ map: btex, side: THREE.DoubleSide, transparent: true }); shared._bannerTex = btex;
  } else {
    shared.glassBlue = L(C.glassBlue);
    shared.glassBody = L(C.glass);
    shared.plaza = L(C.plaza);
    shared.banner = L(C.banner, { side: THREE.DoubleSide });
  }
  return shared;
}

const flatten = (g) => { const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); if (n.attributes.uv) n.deleteAttribute('uv'); return n; };
function Bag() {
  const list = [];
  return {
    list,
    push(g, color = null) { const f = flatten(g); list.push(color ? paint(f, color) : f); return this; },
    box(cx, cy, cz, sx, sy, sz, rotY, color) {
      const g = new THREE.BoxGeometry(sx, sy, sz); if (rotY) g.rotateY(rotY); g.translate(cx, cy, cz); return this.push(g, color);
    },
    cyl(cx, cy, cz, r, h, seg, color) {
      const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(cx, cy, cz); return this.push(g, color);
    },
    mesh(mat, name) {
      if (!list.length) return null;
      const g = mergeGeometries(list); for (const x of list) x.dispose(); list.length = 0;
      const m = new THREE.Mesh(g, mat); m.name = name; m.castShadow = m.receiveShadow = true; return m;
    },
  };
}
function paintFaces(g, top, side, bottom = side) {
  const n = g.attributes.normal, a = new Float32Array(n.count * 3);
  const ct = new THREE.Color(top), cs = new THREE.Color(side), cb = new THREE.Color(bottom);
  for (let i = 0; i < n.count; i++) { const y = n.getY(i), c = y > 0.5 ? ct : y < -0.5 ? cb : cs; a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function extrude(ring, holes, y0, y1) {
  const g = new THREE.ExtrudeGeometry(toShape(ring, holes || []), { depth: Math.max(0.1, y1 - y0), bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return g;
}
const ringCenter = (r) => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };
const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const [x1, z1] = r[i], [x2, z2] = r[(i + 1) % n]; a += x1 * z2 - x2 * z1; } return a / 2; };
function edges(ring, minLen = 0.8) {
  const s = Math.sign(ringArea(ring)) || 1, out = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < minLen) continue;
    out.push({ ax, az, bx, bz, mx: (ax + bx) / 2, mz: (az + bz) / 2, L, ang: Math.atan2(dz, dx), nx: (dz / L) * s, nz: (-dx / L) * s });
  }
  return out;
}
function band(bag, ring, y0, y1, out, depth, color, { minLen = 0.8 } = {}) {
  for (const e of edges(ring, minLen)) bag.box(e.mx + e.nx * out, (y0 + y1) / 2, e.mz + e.nz * out, e.L + depth, y1 - y0, depth, -e.ang, color);
}
const shrink = (ring, k) => { const [cx, cz] = ringCenter(ring); return ring.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]); };
function inRing(x, z, r) { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; }

// ---------- Building ----------
function buildBuilding(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallBuilding';
  const bag = Bag(), lit = Bag(), glassBag = Bag();
  const { o, h, massing } = data.building;
  const xs = o.map((p) => p[0]), zs = o.map((p) => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const zMin = Math.min(...zs), zMax = Math.max(...zs); // zMin more north (more neg)
  const { westX1, midX1, westH, midH, eastH, pilotisH } = massing;

  // Split footprint into west / mid / east slabs by x cuts (axis-aligned approx of OSM ring)
  const clipX = (ring, x0, x1) => {
    // simple: keep points with x in range, add edge intersections
    const pts = [];
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
      const aIn = ax >= x0 && ax <= x1, bIn = bx >= x0 && bx <= x1;
      if (aIn) pts.push([ax, az]);
      if (aIn !== bIn) {
        const t = (x0 - ax) / ((bx - ax) || 1e-9);
        if (t > 0 && t < 1 && ax < x0 !== bx < x0) pts.push([x0, az + (bz - az) * t]);
        const t2 = (x1 - ax) / ((bx - ax) || 1e-9);
        if (t2 > 0 && t2 < 1 && ax < x1 !== bx < x1) pts.push([x1, az + (bz - az) * t2]);
      }
    }
    // fallback rectangle if clip failed
    if (pts.length < 3) {
      return [[x0, zMin], [x1, zMin], [x1, zMax], [x0, zMax]];
    }
    // sort CW around centroid
    const [cx, cz] = ringCenter(pts);
    pts.sort((a, b) => Math.atan2(a[1] - cz, a[0] - cx) - Math.atan2(b[1] - cz, b[0] - cx));
    return pts;
  };

  // West+mid solid podium (NOT east — keep pilotis open like photos 04/05)
  const westMidRing = [[xMin, zMin], [midX1, zMin], [midX1, zMax], [xMin, zMax]];
  bag.push(paintFaces(extrude(westMidRing, [], 0, westH), C.slab, C.glass, C.soffit));

  // Mid section raised tower
  const midRing = [[westX1, zMin], [midX1, zMin], [midX1, zMax], [westX1, zMax]];
  if (midH > westH) bag.push(paintFaces(extrude(midRing, [], westH, midH), C.slab, C.glass, C.glass));

  // East wing elevated on pilotis (signature open undercroft)
  const eastRing = [[midX1, zMin], [xMax - 1.5, zMin], [xMax - 1.5, zMax], [midX1, zMax]];
  const colR = 0.85, colN = 9;
  for (let i = 0; i < colN; i++) {
    for (let j = 0; j < 3; j++) {
      const x = midX1 + 4 + i * ((xMax - midX1 - 7) / Math.max(1, colN - 1));
      const z = zMin + 4 + j * ((zMax - zMin - 8) / 2);
      bag.cyl(x, pilotisH / 2, z, colR, pilotisH, 10, '#e8ecf0');
    }
  }
  // cross beams under soffit for readability
  for (let i = 0; i < colN - 1; i++) {
    const x0 = midX1 + 4 + i * ((xMax - midX1 - 7) / Math.max(1, colN - 1));
    const x1 = midX1 + 4 + (i + 1) * ((xMax - midX1 - 7) / Math.max(1, colN - 1));
    for (let j = 0; j < 3; j++) {
      const z = zMin + 4 + j * ((zMax - zMin - 8) / 2);
      bag.box((x0 + x1) / 2, pilotisH - 0.7, z, Math.abs(x1 - x0), 0.35, 0.35, 0, '#d0d5da');
    }
  }
  // soffit under east wing
  bag.push(paintFaces(extrude(eastRing, [], pilotisH - 0.5, pilotisH), C.soffit, C.soffit, C.soffit));
  // east body above pilotis
  bag.push(paintFaces(extrude(eastRing, [], pilotisH, eastH), C.slab, C.glass, C.glass));
  // thin ground pad under pilotis (plaza continuity, not a wall)
  bag.push(paintFaces(extrude(eastRing, [], 0, 0.25), C.plaza, C.plaza, C.plaza));

  // South facade: glassBody curtain for west/mid + bold blue diagonal overlay spanning full face
  const southY0 = 0.5, southY1 = Math.max(westH, midH, eastH) - 0.4;
  const facadeW = xMax - xMin - 1.5, facadeH = southY0 + (southY1 - southY0);
  // base silver curtain (full height west/mid, above pilotis on east — one plane for recognition)
  const curtain = new THREE.PlaneGeometry(facadeW, southY1 - southY0, 1, 1);
  curtain.translate((xMin + xMax) / 2, (southY0 + southY1) / 2, zMax + 0.25);
  const curtainMesh = new THREE.Mesh(curtain, M.glassBody || M.glass);
  curtainMesh.name = 'cityhallSouthCurtain'; curtainMesh.castShadow = false; g.add(curtainMesh);
  // Blue diagonal hero plane slightly in front
  const facade = new THREE.PlaneGeometry(facadeW, southY1 - southY0, 1, 1);
  facade.translate((xMin + xMax) / 2, (southY0 + southY1) / 2, zMax + 0.55);
  const facadeMesh = new THREE.Mesh(facade, M.glassBlue);
  facadeMesh.name = 'cityhallBlueFacade';
  facadeMesh.castShadow = false; facadeMesh.receiveShadow = false;
  g.add(facadeMesh);
  // Projecting blue fins for depth (3 diagonal boxes)
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    const x = xMin + 4 + t * (xMax - xMin - 8);
    const y = southY0 + 4 + (1 - t) * (southY1 - southY0 - 10);
    bag.box(x, y, zMax + 0.9, 2.2, 7.5, 0.35, 0.35, C.glassBlue);
  }
  // North face lighter curtain (env reflect)
  const north = new THREE.PlaneGeometry(facadeW * 0.95, westH - 2, 1, 1);
  north.translate((xMin + xMax) / 2, westH / 2, zMin - 0.35);
  north.rotateY(Math.PI);
  const northMesh = new THREE.Mesh(north, M.glassBody || M.glass);
  northMesh.name = 'cityhallNorthGlass'; northMesh.castShadow = false; g.add(northMesh);
  // East end curtain (pilotis wing face) — glassBody atlas
  const eastFace = new THREE.PlaneGeometry(zMax - zMin - 2, eastH - pilotisH - 1, 1, 1);
  eastFace.rotateY(-Math.PI / 2);
  eastFace.translate(xMax + 0.4, (pilotisH + eastH) / 2, (zMin + zMax) / 2);
  const eastMesh = new THREE.Mesh(eastFace, M.glassBody || M.glass);
  eastMesh.name = 'cityhallEastGlass'; eastMesh.castShadow = false; g.add(eastMesh);
  // West face
  const westFace = new THREE.PlaneGeometry(zMax - zMin - 2, westH - 2, 1, 1);
  westFace.rotateY(Math.PI / 2);
  westFace.translate(xMin - 0.35, westH / 2, (zMin + zMax) / 2);
  const westMesh = new THREE.Mesh(westFace, M.glassBody || M.glass);
  westMesh.name = 'cityhallWestGlass'; westMesh.castShadow = false; g.add(westMesh);

  // Horizontal floor bands (west/mid only below pilotis; east only above)
  for (let y = 3.6; y < westH - 1; y += 3.6) band(bag, westMidRing, y - 0.1, y + 0.1, 0.15, 0.22, C.mullion, { minLen: 3 });
  for (let y = westH + 3.6; y < midH - 1; y += 3.6) band(bag, midRing, y - 0.1, y + 0.1, 0.15, 0.22, C.mullion, { minLen: 3 });
  for (let y = pilotisH + 3.6; y < eastH - 1; y += 3.6) band(bag, eastRing, y - 0.1, y + 0.1, 0.15, 0.22, C.mullion, { minLen: 3 });

  // Night windows (deterministic hash)
  const hash = (a, b, c) => { const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return v - Math.floor(v); };
  for (const e of edges(o, 4)) {
    if (e.L < 5) continue;
    const segs = Math.max(1, Math.round(e.L / 5.5));
    const maxY = e.mx < westX1 ? westH : e.mx < midX1 ? midH : eastH;
    const y0 = e.mx >= midX1 ? pilotisH + 1 : 1.5;
    for (let f = 0; f < Math.floor((maxY - y0) / 3.6); f++) {
      for (let k = 0; k < segs; k++) {
        if (hash(e.mx, e.mz + f, k) > 0.38) continue;
        const t = (k + 0.5) / segs;
        const x = e.ax + (e.bx - e.ax) * t + e.nx * 0.1;
        const z = e.az + (e.bz - e.az) * t + e.nz * 0.1;
        lit.box(x, y0 + f * 3.6 + 1.5, z, (e.L / segs) - 0.8, 2.2, 0.08, -e.ang, hash(e.mx, f, k) > 0.2 ? C.nightWarm : C.nightCool);
      }
    }
  }

  // Rooftop solar panels (photo 04/05 dark array)
  const roofY = eastH + 0.2;
  const solarBag = Bag();
  for (let xi = xMin + 6; xi < xMax - 6; xi += 3.8) {
    for (let zi = zMin + 3.5; zi < zMax - 3.5; zi += 3.0) {
      if (!inRing(xi, zi, o)) continue;
      const panel = new THREE.BoxGeometry(3.4, 0.1, 2.4);
      panel.rotateX(-0.42); panel.translate(xi, roofY + 0.85, zi);
      solarBag.push(panel, C.solar);
      bag.box(xi, roofY + 0.35, zi, 0.14, 0.7, 0.14, 0, C.solarFrame);
      bag.box(xi, roofY + 0.08, zi, 3.5, 0.06, 2.5, 0, C.solarFrame);
    }
  }
  // Parapet
  band(bag, westMidRing, westH, westH + 1.1, 0.1, 0.3, C.slab, { minLen: 2 });
  band(bag, midRing, midH, midH + 1.0, 0.1, 0.3, C.slab, { minLen: 2 });
  band(bag, eastRing, eastH, eastH + 1.2, 0.1, 0.3, C.slab, { minLen: 2 });

  const body = bag.mesh(M.vc, 'cityhallBody'); if (body) g.add(body);
  const solar = solarBag.mesh(M.vc, 'cityhallSolar'); if (solar) g.add(solar);
  const night = lit.mesh(M.glow, 'cityhallGlow'); if (night) { night.castShadow = night.receiveShadow = false; g.add(night); }

  // Council annex
  if (data.council?.o) {
    const cb = Bag();
    cb.push(paintFaces(extrude(data.council.o, [], 0, data.council.h), C.slab, C.glass, C.soffit));
    for (let y = 3.6; y < data.council.h - 1; y += 3.6) band(cb, data.council.o, y - 0.1, y + 0.1, 0.12, 0.18, C.mullion, { minLen: 2 });
    band(cb, data.council.o, data.council.h, data.council.h + 0.9, 0.08, 0.25, C.slab, { minLen: 1 });
    const cm = cb.mesh(M.vc, 'cityhallCouncil'); if (cm) g.add(cm);
  }

  return { group: g, night, facade: facadeMesh };
}

// ---------- Grounds: plaza, lawn, paths ----------
function buildGrounds(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallGrounds';
  const bag = Bag();
  const b = data.building;
  const xs = b.o.map((p) => p[0]), zs = b.o.map((p) => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const zMin = Math.min(...zs), zMax = Math.max(...zs);

  // South plaza (in front of south facade)
  const plaza = [
    [xMin - 5, zMax + 2], [xMax + 25, zMax + 2],
    [xMax + 25, zMax + 55], [xMin - 5, zMax + 55],
  ];
  {
    const geo = extrude(plaza, [], 0.02, 0.06);
    // keep a simple plaza mesh with paving texture
    const m = new THREE.Mesh(geo, M.plaza);
    m.name = 'cityhallPlaza'; m.receiveShadow = true; g.add(m);
  }

  // Lawns flanking east promenade
  const lawnL = [[xMax + 2, zMax - 5], [xMax + 55, zMax - 5], [xMax + 55, zMax + 50], [xMax + 2, zMax + 50]];
  bag.push(paintFaces(extrude(lawnL, [], 0.01, 0.04), C.lawn, C.lawnDark));

  // North lawn around fountain
  const lawnN = [[xMin - 20, zMin - 55], [xMax + 10, zMin - 55], [xMax + 10, zMin - 2], [xMin - 20, zMin - 2]];
  bag.push(paintFaces(extrude(lawnN, [], 0.01, 0.04), C.lawn, C.lawnDark));

  // West park strip
  const lawnW = [[xMin - 90, zMin - 40], [xMin - 5, zMin - 40], [xMin - 5, zMax + 40], [xMin - 90, zMax + 40]];
  bag.push(paintFaces(extrude(lawnW, [], 0.01, 0.04), C.lawnDark, C.lawn));

  // Loop path (3–4 m)
  const pathPts = data.westParkLoop?.pts || [];
  for (let i = 0; i < pathPts.length - 1; i++) {
    const [ax, az] = pathPts[i], [bx, bz] = pathPts[i + 1];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dz, dx);
    bag.box((ax + bx) / 2, 0.05, (az + bz) / 2, L, 0.08, 3.5, -ang, C.path);
  }
  // Path behind step seats
  const d = data.deck;
  bag.box((d.x0 + d.x1) / 2, 0.06, d.seatsZ - 5, d.x1 - d.x0 + 8, 0.08, 3.5, 0, C.path);

  // East promenade paving
  const pr = data.promenade;
  {
    const dx = pr.to[0] - pr.from[0], dz = pr.to[1] - pr.from[1], L = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
    const geo = new THREE.BoxGeometry(L, 0.08, pr.width);
    geo.rotateY(-ang); geo.translate((pr.from[0] + pr.to[0]) / 2, 0.05, (pr.from[1] + pr.to[1]) / 2);
    const m = new THREE.Mesh(geo, M.plaza); m.name = 'cityhallPromenade'; m.receiveShadow = true; g.add(m);
  }

  const body = bag.mesh(M.vc, 'cityhallGroundBody'); if (body) g.add(body);
  return g;
}

// ---------- Banner poles (instanced) ----------
function buildBanners(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallBanners';
  const pr = data.promenade;
  const dx = pr.to[0] - pr.from[0], dz = pr.to[1] - pr.from[1], L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  const n = 10;
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 7.5, 6);
  const poles = new THREE.InstancedMesh(poleGeo, M.pole, n * 2);
  const banGeo = new THREE.PlaneGeometry(0.9, 2.2);
  const banners = new THREE.InstancedMesh(banGeo, M.banner, n * 2);
  const dummy = new THREE.Object3D();
  let i = 0;
  for (let side of [-1, 1]) {
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = pr.from[0] + dx * t + px * side * (pr.width / 2 + 1.2);
      const z = pr.from[1] + dz * t + pz * side * (pr.width / 2 + 1.2);
      dummy.position.set(x, 3.75, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + px * side * 0.15, 5.2, z + pz * side * 0.15);
      dummy.rotation.set(0, Math.atan2(px * side, pz * side), 0);
      dummy.updateMatrix();
      banners.setMatrixAt(i, dummy.matrix);
      i++;
    }
  }
  poles.castShadow = true; g.add(poles, banners);
  return g;
}

// ---------- Pond + sculpture ----------
function buildPond(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallPond';
  const bag = Bag();
  const o = data.pond.o;
  bag.push(paintFaces(extrude(o, [], 0.02, 0.35), C.water, C.curb, C.waterDeep));
  // rim
  band(bag, o, 0.35, 0.55, 0.3, 0.4, C.curb, { minLen: 1 });
  const body = bag.mesh(M.vc, 'cityhallPondBody'); if (body) g.add(body);
  // water surface with water mat
  const water = new THREE.Mesh(extrude(shrink(o, 0.92), [], 0.28, 0.32), M.water);
  water.name = 'cityhallPondWater'; g.add(water);
  // blue abstract sculpture
  const sc = data.pond.sculpture;
  const sbag = Bag();
  sbag.cyl(sc.x, 0.4, sc.z, 0.9, 0.8, 10, C.curb);
  // bird/butterfly-ish abstract (generic, not a logo)
  const wing = new THREE.SphereGeometry(1.4, 10, 8, 0, Math.PI);
  wing.scale(1, 0.35, 0.7); wing.rotateZ(0.5); wing.translate(sc.x - 0.6, 2.2, sc.z);
  sbag.push(wing, C.sculpture);
  const wing2 = new THREE.SphereGeometry(1.4, 10, 8, 0, Math.PI);
  wing2.scale(1, 0.35, 0.7); wing2.rotateZ(-0.5); wing2.rotateY(Math.PI); wing2.translate(sc.x + 0.6, 2.2, sc.z);
  sbag.push(wing2, C.sculpture);
  sbag.cyl(sc.x, 1.5, sc.z, 0.15, 2.2, 6, C.sculpture);
  const sm = sbag.mesh(M.vc, 'cityhallSculpture'); if (sm) g.add(sm);
  // Round reflecting pond accent near sculpture (photo 04/05) — OSM outline is irregular; this is the photo-matching circle
  const cx = sc.x + 6, cz = sc.z + 8;
  const round = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, 0.35, 28), M.water);
  round.position.set(cx, 0.2, cz); round.name = 'cityhallRoundPond'; g.add(round);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.28, 6, 28), M.curb);
  rim.rotation.x = Math.PI / 2; rim.position.set(cx, 0.4, cz); g.add(rim);
  return g;
}

// ---------- Music fountain + deck + step seats ----------
function buildFountainComplex(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallFountain';
  const f = data.fountain, d = data.deck;
  const bag = Bag();

  // elongated pool
  const pool = [
    [f.cx - f.len / 2, f.cz - f.wid / 2],
    [f.cx + f.len / 2, f.cz - f.wid / 2],
    [f.cx + f.len / 2, f.cz + f.wid / 2],
    [f.cx - f.len / 2, f.cz + f.wid / 2],
  ];
  bag.push(paintFaces(extrude(pool, [], 0.02, 0.4), C.waterDeep, C.curb, C.waterDeep));
  band(bag, pool, 0.4, 0.55, 0.25, 0.35, C.brick, { minLen: 1 });
  const body = bag.mesh(M.vc, 'cityhallFountainBasin'); if (body) g.add(body);

  const water = new THREE.Mesh(extrude(shrink(pool, 0.96), [], 0.3, 0.36), M.water);
  water.name = 'cityhallFountainWater'; g.add(water);

  // Wooden deck (south / building side of fountain)
  const deckBag = Bag();
  const deckRing = [[d.x0, d.deckZ - 1.5], [d.x1, d.deckZ - 1.5], [d.x1, d.deckZ + 1.2], [d.x0, d.deckZ + 1.2]];
  deckBag.push(paintFaces(extrude(deckRing, [], 0.4, 0.55), C.wood, C.woodDark, C.woodDark));
  // plank lines
  for (let x = d.x0 + 1; x < d.x1; x += 0.9) deckBag.box(x, 0.56, d.deckZ, 0.06, 0.02, 2.5, 0, C.woodDark);
  const deckM = deckBag.mesh(M.vc, 'cityhallDeck'); if (deckM) g.add(deckM);

  // 3–4 tier brick step-seats facing city hall (south / +z), on north side of fountain
  const seatBag = Bag();
  const tiers = 4, tierD = 0.85, tierH = 0.42;
  for (let t = 0; t < tiers; t++) {
    const z0 = d.seatsZ - t * tierD;
    const y0 = 0.4 + t * tierH;
    seatBag.box((d.x0 + d.x1) / 2, y0 + tierH / 2, z0, d.x1 - d.x0, tierH, tierD - 0.05, 0, t % 2 ? C.brick : C.brickDark);
  }
  // wooden base at waterline
  seatBag.box((d.x0 + d.x1) / 2, 0.35, d.seatsZ + 0.6, d.x1 - d.x0, 0.3, 0.5, 0, C.wood);
  const seatM = seatBag.mesh(M.vc, 'cityhallSeats'); if (seatM) g.add(seatM);

  // Animated jets (instanced)
  const JET_N = 32;
  const jetGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 6);
  jetGeo.translate(0, 0.5, 0);
  const jets = new THREE.InstancedMesh(jetGeo, M.jet, JET_N);
  jets.name = 'cityhallJets';
  jets.frustumCulled = false;
  g.add(jets);

  // Night underwater lights (3 shared mats, few meshes) + 1 InstancedMesh shafts
  const lightGeo = new THREE.CircleGeometry(0.7, 10);
  lightGeo.rotateX(-Math.PI / 2);
  const shaftGeo = new THREE.CylinderGeometry(0.4, 0.6, 1, 6, 1, true);
  shaftGeo.translate(0, 0.5, 0);
  const lightMats = [
    new THREE.MeshBasicMaterial({ color: '#3aa0ff', transparent: true, opacity: 0.85 }),
    new THREE.MeshBasicMaterial({ color: '#b44cff', transparent: true, opacity: 0.85 }),
    new THREE.MeshBasicMaterial({ color: '#3dff7a', transparent: true, opacity: 0.85 }),
  ];
  const shaftMat = new THREE.MeshBasicMaterial({ color: '#6ab0ff', transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const lights = [];
  for (let i = 0; i < JET_N; i++) {
    const t = (i + 0.5) / JET_N;
    const x = f.cx - f.len / 2 + 2 + t * (f.len - 4);
    const m = new THREE.Mesh(lightGeo, lightMats[i % 3]);
    m.position.set(x, 0.38, f.cz); m.visible = false; g.add(m); lights.push(m);
  }
  const shafts = new THREE.InstancedMesh(shaftGeo, shaftMat, JET_N);
  shafts.name = 'cityhallShafts'; shafts.visible = false; shafts.frustumCulled = false; g.add(shafts);

  // Ambient night glow plane
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(f.len * 1.15, f.wid * 2.2),
    new THREE.MeshBasicMaterial({ color: '#3a8fff', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2; glow.position.set(f.cx, 0.37, f.cz); glow.visible = false;
  g.add(glow);

  const dummy = new THREE.Object3D();
  const seeds = Array.from({ length: JET_N }, (_, i) => ({
    x: f.cx - f.len / 2 + 2 + ((i + 0.5) / JET_N) * (f.len - 4),
    z: f.cz + Math.sin(i * 1.7) * 1.2,
    phase: i / JET_N,
    h: 5.5 + (i % 5) * 1.6 + (i % 4 === 0 ? 6.5 : 0),
  }));

  let nightOn = false;
  const stopEve = watchEvening((on) => {
    nightOn = on;
    glow.visible = on;
    shafts.visible = on;
    for (const m of lights) m.visible = on;
    M.water.emissiveIntensity = on ? 0.85 : 0.2;
  });

  function update(t) {
    // color cycle at night: blue → purple → green
    if (nightOn) {
      const phase = (t * 0.15) % 3;
      const cols = ['#3aa0ff', '#b44cff', '#3dff7a'];
      const idx = Math.floor(phase);
      const mix = phase - idx;
      const c0 = new THREE.Color(cols[idx]), c1 = new THREE.Color(cols[(idx + 1) % 3]);
      glow.material.color.copy(c0).lerp(c1, mix);
      M.jet.color.copy(c0).lerp(c1, mix);
    } else {
      M.jet.color.set('#d7f3ff');
    }
    for (let i = 0; i < JET_N; i++) {
      const s = seeds[i];
      const h = s.h * (0.55 + 0.45 * Math.sin(t * 1.6 + s.phase * Math.PI * 2));
      dummy.position.set(s.x, 0.36, s.z);
      dummy.scale.set(1, Math.max(0.2, h), 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      jets.setMatrixAt(i, dummy.matrix);
      // shaft follows jet height at night
      dummy.scale.set(nightOn ? 1.5 : 1, Math.max(0.2, h * 1.08), nightOn ? 1.5 : 1);
      dummy.updateMatrix();
      shafts.setMatrixAt(i, dummy.matrix);
    }
    jets.instanceMatrix.needsUpdate = true;
    shafts.instanceMatrix.needsUpdate = true;
    if (nightOn) shaftMat.color.copy(M.jet.color);
  }

  return { group: g, update, disposeExtra: () => { stopEve(); lightGeo.dispose(); shaftGeo.dispose(); jetGeo.dispose(); for (const m of lightMats) m.dispose(); shaftMat.dispose(); glow.geometry.dispose(); glow.material.dispose(); } };
}

// ---------- Trees / hedges (instanced) ----------
function buildLandscape(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallLandscape';
  const b = data.building;
  const xs = b.o.map((p) => p[0]), zs = b.o.map((p) => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const zMin = Math.min(...zs), zMax = Math.max(...zs);

  const positions = [];
  // North treeline behind seats
  for (let x = xMin - 15; x < xMax + 5; x += 6.5) positions.push([x, zMin - 18 - (Math.abs(Math.sin(x)) * 4), 1]);
  // West park trees
  for (let x = xMin - 80; x < xMin - 15; x += 9) for (let z = zMin - 30; z < zMax + 30; z += 10) {
    if ((Math.abs(x * 3.1 + z * 7.7) % 1) > 0.55) continue;
    positions.push([x, z, 0.85 + (Math.abs(Math.sin(x + z)) * 0.4)]);
  }
  // East lawn trees
  for (let i = 0; i < 8; i++) positions.push([xMax + 15 + (i % 3) * 8, zMax + 15 + Math.floor(i / 3) * 10, 1]);

  const N = positions.length;
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.2, 5);
  trunkGeo.translate(0, 1.1, 0);
  const leafGeo = new THREE.SphereGeometry(1.6, 7, 5);
  leafGeo.translate(0, 3.2, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, M.trunk, N);
  const leaves = new THREE.InstancedMesh(leafGeo, M.foliage, N);
  const dummy = new THREE.Object3D();
  positions.forEach(([x, z, s], i) => {
    dummy.position.set(x, 0, z); dummy.scale.set(s, s, s); dummy.rotation.set(0, (x * 0.1) % 6.28, 0); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix); leaves.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = leaves.castShadow = true;
  g.add(trunks, leaves);

  // Hedge along promenade
  const hedgeBag = Bag();
  const pr = data.promenade;
  const dx = pr.to[0] - pr.from[0], dz = pr.to[1] - pr.from[1], L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  for (const side of [-1, 1]) {
    hedgeBag.box(
      (pr.from[0] + pr.to[0]) / 2 + px * side * (pr.width / 2 + 2.5),
      0.45,
      (pr.from[1] + pr.to[1]) / 2 + pz * side * (pr.width / 2 + 2.5),
      L * 0.9, 0.9, 0.7, -Math.atan2(dz, dx), C.hedge,
    );
  }
  const hm = hedgeBag.mesh(M.vc, 'cityhallHedge'); if (hm) g.add(hm);

  // Path lamps (instanced)
  const lampN = 16;
  const poleG = new THREE.CylinderGeometry(0.07, 0.09, 4.2, 5); poleG.translate(0, 2.1, 0);
  const headG = new THREE.SphereGeometry(0.25, 6, 4); headG.translate(0, 4.3, 0);
  const lampPoles = new THREE.InstancedMesh(poleG, M.pole, lampN);
  const lampHeads = new THREE.InstancedMesh(headG, M.lamp, lampN);
  const lampPos = [];
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8;
    lampPos.push([pr.from[0] + dx * t + px * (pr.width / 2 + 1.8), pr.from[1] + dz * t + pz * (pr.width / 2 + 1.8)]);
    lampPos.push([data.deck.x0 + 2 + i * ((data.deck.x1 - data.deck.x0 - 4) / 7), data.deck.seatsZ - 6]);
  }
  lampPos.slice(0, lampN).forEach(([x, z], i) => {
    dummy.position.set(x, 0, z); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    lampPoles.setMatrixAt(i, dummy.matrix); lampHeads.setMatrixAt(i, dummy.matrix);
  });
  g.add(lampPoles, lampHeads);

  return { group: g, disposeGeo: () => { trunkGeo.dispose(); leafGeo.dispose(); poleG.dispose(); headG.dispose(); } };
}

// ---------- Parking ----------
function buildParking(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallParking';
  const bag = Bag(), lineBag = Bag();
  const carGeo = new THREE.BoxGeometry(1.8, 0.65, 4.2);
  const carPositions = [];
  for (const lot of data.parking || []) {
    const ring = [[lot.x0, lot.z0], [lot.x1, lot.z0], [lot.x1, lot.z1], [lot.x0, lot.z1]];
    bag.push(paintFaces(extrude(ring, [], 0.01, 0.04), C.asphalt, C.asphalt));
    const stallW = 2.5, stallL = 5.2;
    for (let r = 0; r < lot.rows; r++) {
      for (let c = 0; c < lot.cols; c++) {
        const x = lot.x0 + 2 + c * stallW;
        const z = lot.z0 + 2 + r * stallL;
        if (x > lot.x1 - 2 || z > lot.z1 - 2) continue;
        lineBag.box(x, 0.05, z, 0.08, 0.02, stallL - 0.4, 0, C.line);
        lineBag.box(x + stallW - 0.3, 0.05, z, 0.08, 0.02, stallL - 0.4, 0, C.line);
        // parked cars ~55%
        if (Math.sin(x * 12.1 + z * 7.7) * 10000 % 1 > 0.45) continue;
        carPositions.push([x + 1.1, z]);
      }
    }
  }
  const body = bag.mesh(M.vc, 'cityhallParkingBody'); if (body) g.add(body);
  const lines = lineBag.mesh(M.line, 'cityhallParkingLines'); if (lines) { lines.castShadow = false; g.add(lines); }

  if (carPositions.length) {
    const colors = ['#6b7280', '#374151', '#1f2937', '#9ca3af', '#b91c1c', '#1d4ed8', '#f5f5f4'];
    const cars = new THREE.InstancedMesh(carGeo, new THREE.MeshLambertMaterial({ color: '#6b7280' }), carPositions.length);
    // vertex colors would need per-instance color — use instanceColor
    cars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(carPositions.length * 3), 3);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    carPositions.forEach(([x, z], i) => {
      dummy.position.set(x, 0.4, z); dummy.rotation.y = (i % 3) * 0.02; dummy.updateMatrix();
      cars.setMatrixAt(i, dummy.matrix);
      col.set(colors[i % colors.length]);
      cars.setColorAt(i, col);
    });
    cars.castShadow = true; cars.name = 'cityhallCars';
    g.add(cars);
    g.userData._carGeo = carGeo;
  }
  return g;
}

// ---------- Vehicle gate ----------
function buildVehicleGate(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallVehicleGate';
  const v = data.vehicleGate;
  const bag = Bag();
  // gate posts + boom hint
  bag.box(v.x - v.width / 2, 1.6, v.z, 0.4, 3.2, 0.4, 0, C.curb);
  bag.box(v.x + v.width / 2, 1.6, v.z, 0.4, 3.2, 0.4, 0, C.curb);
  bag.box(v.x, 3.3, v.z, v.width + 0.8, 0.25, 0.35, 0, C.slab);
  // asphalt apron
  bag.box(v.x, 0.04, v.z + 8, v.width + 4, 0.08, 20, 0, C.asphalt);
  // entry/exit arrows (generic chevrons, not text logos)
  bag.box(v.x - 2, 0.06, v.z + 4, 1.2, 0.02, 0.35, 0, C.line);
  bag.box(v.x + 2, 0.06, v.z + 4, 1.2, 0.02, 0.35, 0, C.line);
  const m = bag.mesh(M.vc, 'cityhallGate'); if (m) g.add(m);
  return g;
}

// ---------- Public API ----------
export function buildSeongnamCityHall(data, { env = null } = {}) {
  const M = mats();
  if (env && M.glassBlue) { M.glassBlue.envMap = env; M.glassBlue.envMapIntensity = 0.7; if (M.glassBody) { M.glassBody.envMap = env; M.glassBody.envMapIntensity = 0.5; } M.glass.envMap = env; M.glass.envMapIntensity = 0.45; }
  const root = new THREE.Group(); root.name = 'seongnamCityHall';

  const building = buildBuilding(data, M);
  root.add(building.group);
  root.add(buildGrounds(data, M));
  root.add(buildBanners(data, M));
  root.add(buildPond(data, M));
  const fountain = buildFountainComplex(data, M);
  root.add(fountain.group);
  const landscape = buildLandscape(data, M);
  root.add(landscape.group);
  root.add(buildParking(data, M));
  root.add(buildVehicleGate(data, M));

  let nightMeshes = [];
  root.traverse((o) => { if (o.name && /Glow$/.test(o.name)) nightMeshes.push(o); });
  if (building.night) nightMeshes.push(building.night);
  let on = false;
  const stopEve = watchEvening((v) => { on = v; for (const m of nightMeshes) m.visible = v; });

  const stats = { meshes: 0, instanced: 0 };
  root.traverse((o) => { if (o.isInstancedMesh) stats.instanced++; else if (o.isMesh) stats.meshes++; });

  return {
    group: root,
    stats,
    update: (dt, t) => fountain.update(t),
    dispose() {
      stopEve();
      fountain.disposeExtra?.();
      landscape.disposeGeo?.();
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.userData?._carGeo) o.userData._carGeo.dispose();
      });
      // shared mats kept for remount; textures disposed only on full module reset
      root.clear();
    },
  };
}

export function disposeCityHallMaterials() {
  if (!shared) return;
  for (const k of Object.keys(shared)) {
    const v = shared[k];
    if (v && v.isMaterial) { if (v.map) v.map.dispose(); v.dispose(); }
    if (v && v.isTexture) v.dispose();
  }
  shared = null;
}
