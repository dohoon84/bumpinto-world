// [cityhall] 성남시청 랜드마크 v4 — Blender GLB 본관 + 절차적 광장/분수/수목.
//   넓은 저층(~10층)·서측 접힌 파란 유리·중앙 사선 아트리움·동측 커튼월+흰 프레임·필로티·태양광
//   광장 화강암·배너 보행로·원형 연못·음악분수·데크·계단의자. 브랜드 로고 없음.
//   성능: 공유 재질 · 병합 · InstancedMesh · 소형 캔버스/큐브 env
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toShape } from '../../world.js';
import { vcMat, paint } from '../tileMesh.js';
import { watchEvening } from '../../evening.js';

const C = {
  glassBlue: '#6bb8dc', glassTeal: '#6bb8dc', glassLite: '#6bb8dc',
  frame: '#e6eaee', frameDark: '#c5ced6', spandrel: '#d5dbe2',
  soffit: '#b8bec6', pilotis: '#f2f4f6', solar: '#1a2330', solarFrame: '#4a5560',
  plaza: '#ddd8ce', plazaDark: '#c2bdb2', lawn: '#5f9a58', lawnDark: '#4a7f45',
  path: '#b8b3a6', brick: '#a07058', brickDark: '#8a5a42', wood: '#5c4030', woodDark: '#3e2a1e',
  water: '#2a7fa8', waterDeep: '#154a66', pole: '#5a6068', banner: '#2f6db5',
  hedge: '#3d6b3a', trunk: '#4a3428', foliage: '#3f7a38', pine: '#2d5a30',
  asphalt: '#5a5e64', line: '#e8e8e8', curb: '#9a9ea4', sculpture: '#2a6db5',
  kiosk: '#6fa86a', slantFace: '#4a9ec8', slantEdge: '#2e3540',
  nightWarm: '#ffe3ad', nightCool: '#a8c8ff',
};

let shared = null;

function makeEnvCube() {
  // Cheap procedural sky/ground cube for glass reflections (64² × 6)
  const s = 64;
  const mk = (fn) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = s;
    const x = cv.getContext('2d'); fn(x, s); return cv;
  };
  const sky = (x, n) => {
    const g = x.createLinearGradient(0, 0, 0, n);
    g.addColorStop(0, '#7eb6e8'); g.addColorStop(0.55, '#c5dcec'); g.addColorStop(1, '#e8eef2');
    x.fillStyle = g; x.fillRect(0, 0, n, n);
  };
  const gnd = (x, n) => {
    const g = x.createLinearGradient(0, 0, 0, n);
    g.addColorStop(0, '#d0d6c8'); g.addColorStop(1, '#8a9a78');
    x.fillStyle = g; x.fillRect(0, 0, n, n);
  };
  const imgs = [
    mk(sky), mk(sky), mk(sky), // +X -X +Y
    mk(gnd), // -Y
    mk(sky), mk(sky), // +Z -Z
  ];
  const tex = new THREE.CubeTexture(imgs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY);
  return t;
}

function jetGradTex() {
  return canvasTex(64, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(200,240,255,0)');
    g.addColorStop(0.08, 'rgba(180,230,255,0.55)');
    g.addColorStop(0.5, 'rgba(160,220,255,0.85)');
    g.addColorStop(0.92, 'rgba(140,210,255,0.5)');
    g.addColorStop(1, 'rgba(120,200,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // soft horizontal falloff
    const g2 = x.createLinearGradient(0, 0, w, 0);
    g2.addColorStop(0, 'rgba(0,0,0,0.85)');
    g2.addColorStop(0.5, 'rgba(0,0,0,0)');
    g2.addColorStop(1, 'rgba(0,0,0,0.85)');
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = g2; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
  }, 1, 1);
}


function mats() {
  if (shared) return shared;
  const hasDoc = typeof document !== 'undefined';
  const env = hasDoc ? makeEnvCube() : null;
  const S = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.1, envMap: env, envMapIntensity: env ? 0.55 : 0, ...extra });
  const B = (c, extra = {}) => new THREE.MeshBasicMaterial({ color: c, ...extra });

  shared = {
    vc: vcMat(),
    env,
    // Reflective blue glass (faceted / atrium)
    glassBlue: S(C.glassBlue, { transparent: true, opacity: 0.9, roughness: 0.32, metalness: 0.18, emissive: '#3a7aa8', emissiveIntensity: 0.75, envMapIntensity: env ? 0.85 : 0, side: THREE.DoubleSide, depthWrite: true }),
    // Silver curtain with spandrel atlas
    glassCurtain: null,
    glassLite: S(C.glassLite, { transparent: true, opacity: 0.55, roughness: 0.18, metalness: 0.7, envMapIntensity: env ? 0.9 : 0 }),
    frame: S(C.frame, { roughness: 0.55, metalness: 0.15, envMapIntensity: env ? 0.3 : 0 }),
    frameDark: S(C.frameDark, { roughness: 0.5, metalness: 0.2 }),
    spandrel: S(C.spandrel, { roughness: 0.6, metalness: 0.05 }),
    soffit: S(C.soffit, { roughness: 0.7, metalness: 0.05 }),
    pilotis: S(C.pilotis, { roughness: 0.4, metalness: 0.05 }),
    solar: S(C.solar, { roughness: 0.35, metalness: 0.7, envMapIntensity: env ? 0.6 : 0 }),
    plaza: null,
    lawn: S(C.lawn, { roughness: 0.95, metalness: 0 }),
    path: S(C.path, { roughness: 0.9, metalness: 0 }),
    brick: S(C.brick, { roughness: 0.85, metalness: 0 }),
    wood: S(C.wood, { roughness: 0.8, metalness: 0 }),
    water: S(C.water, { transparent: true, opacity: 0.82, roughness: 0.08, metalness: 0.75, envMapIntensity: env ? 1.4 : 0, emissive: C.waterDeep, emissiveIntensity: 0.2 }),
    pole: S(C.pole, { roughness: 0.5, metalness: 0.4 }),
    banner: null,
    hedge: S(C.hedge, { roughness: 0.95, metalness: 0 }),
    trunk: S(C.trunk, { roughness: 0.9, metalness: 0 }),
    foliage: S(C.foliage, { roughness: 0.95, metalness: 0 }),
    foliageLite: S('#4a8a42', { roughness: 0.95, metalness: 0 }),
    pine: S(C.pine, { roughness: 0.95, metalness: 0 }),
    pineLite: S('#3a6a38', { roughness: 0.95, metalness: 0 }),
    asphalt: S(C.asphalt, { roughness: 0.95, metalness: 0 }),
    line: B(C.line),
    curb: S(C.curb, { roughness: 0.7, metalness: 0.05 }),
    sculpture: S(C.sculpture, { roughness: 0.35, metalness: 0.4, emissive: C.sculpture, emissiveIntensity: 0.12, envMapIntensity: env ? 0.7 : 0 }),
    kiosk: S(C.kiosk, { roughness: 0.5, metalness: 0.2 }),
    slantFace: S(C.slantFace, { roughness: 0.55, metalness: 0.08 }),
    slantEdge: S(C.slantEdge, { roughness: 0.45, metalness: 0.05 }),
    glow: B('#ffffff', { vertexColors: true }),
    jet: B('#ffffff', { transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    mist: B('#b8e0ff', { transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  };

  if (hasDoc) {
    // Curtain wall atlas: silver glass + grey horizontal spandrels + mullions
    shared.glassCurtain = S('#5aa8d0', {
      map: canvasTex(256, 256, (x, w, h) => {
        const g = x.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#5a9cc4'); g.addColorStop(0.5, '#3a7aa8'); g.addColorStop(1, '#2a6288');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        x.strokeStyle = 'rgba(160,175,190,0.9)'; x.lineWidth = 2;
        for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, h); x.stroke(); }
        for (let j = 0; j <= 6; j++) {
          x.fillStyle = 'rgba(200,208,216,0.85)';
          x.fillRect(0, j * 42.67 + 32, w, 9);
          x.strokeStyle = 'rgba(150,160,170,0.7)'; x.beginPath();
          x.moveTo(0, j * 42.67); x.lineTo(w, j * 42.67); x.stroke();
        }
        // fake reflection streaks
        x.fillStyle = 'rgba(255,255,255,0.18)';
        for (let i = 0; i < 5; i++) x.fillRect(i * 48 + 10, 0, 10, h);
      }, 8, 5),
      transparent: true, opacity: 0.9, roughness: 0.32, metalness: 0.18, emissive: '#3a7aa8', emissiveIntensity: 0.45, envMapIntensity: env ? 0.85 : 0,
    });
    shared._curtainTex = shared.glassCurtain.map;

    // Blue faceted glass atlas (diagonal mullions + reflection)
    shared.glassBlue.map = canvasTex(512, 512, (x, w, h) => {
      const bg = x.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#3a7aa8'); bg.addColorStop(0.35, '#5aa8d0'); bg.addColorStop(0.65, '#8ec8e8'); bg.addColorStop(1, '#3a7aa8');
      x.fillStyle = bg; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(190,220,240,0.55)'; x.lineWidth = 2;
      for (let i = -12; i < 28; i++) { x.beginPath(); x.moveTo(i * 24, 0); x.lineTo(i * 24 + 220, h); x.stroke(); }
      for (let j = 0; j <= 10; j++) { x.beginPath(); x.moveTo(0, j * 51.2); x.lineTo(w, j * 51.2); x.stroke(); }
      x.fillStyle = 'rgba(220,240,255,0.25)';
      for (let i = 0; i < 10; i++) x.fillRect(i * 50 + 6, 0, 14, h);
      // facet edge highlights
      x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(0, h * 0.7); x.lineTo(w, h * 0.15); x.stroke();
      x.beginPath(); x.moveTo(0, h * 0.95); x.lineTo(w, h * 0.4); x.stroke();
    }, 1, 1);
    shared.glassBlue.needsUpdate = true;
    shared._blueTex = shared.glassBlue.map;

    // Plaza granite grid
    shared.plaza = S(C.plaza, {
      map: canvasTex(256, 256, (x, w, h) => {
        x.fillStyle = '#ebe6dc'; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#c8c0b0'; x.lineWidth = 1.6;
        for (let i = 0; i <= 8; i++) {
          x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, h); x.stroke();
          x.beginPath(); x.moveTo(0, i * 32); x.lineTo(w, i * 32); x.stroke();
        }
        x.fillStyle = '#e0dbd0';
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2 === 0) x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30);
      }, 24, 16),
      roughness: 0.85, metalness: 0.05, envMapIntensity: env ? 0.15 : 0,
    });
    shared._plazaTex = shared.plaza.map;

    // Generic banner (no city emblem — abstract circle + bars)
    shared.banner = new THREE.MeshStandardMaterial({
      map: canvasTex(64, 128, (x, w, h) => {
        x.fillStyle = '#2f6db5'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#ffffff'; x.fillRect(8, 12, 48, 48);
        x.beginPath(); x.arc(32, 36, 14, 0, Math.PI * 2); x.fillStyle = '#2f6db5'; x.fill();
        x.fillStyle = 'rgba(255,255,255,0.92)';
        x.fillRect(12, 72, 40, 8); x.fillRect(16, 88, 32, 6); x.fillRect(20, 102, 24, 6);
      }, 1, 1),
      side: THREE.DoubleSide, roughness: 0.7, metalness: 0.05, transparent: true,
    });
    shared._bannerTex = shared.banner.map;
    shared.jet.map = jetGradTex();
    shared.jet.needsUpdate = true;
  } else {
    shared.glassCurtain = S(C.glassLite);
    shared.plaza = S(C.plaza);
    shared.banner = S(C.banner, { side: THREE.DoubleSide });
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
function ringCenter(r) { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; }
function edges(ring, minLen = 2) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < minLen) continue;
    const nx = -dz / L, nz = dx / L;
    out.push({ ax, az, bx, bz, L, nx, nz, ang: Math.atan2(dz, dx), mx: (ax + bx) / 2, mz: (az + bz) / 2 });
  }
  return out;
}
function inRing(x, z, r) { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; }
function band(bag, ring, y0, y1, inset, thick, color, { minLen = 2 } = {}) {
  for (const e of edges(ring, minLen)) {
    bag.box(e.mx + e.nx * inset, (y0 + y1) / 2, e.mz + e.nz * inset, e.L, y1 - y0, thick, -e.ang, color);
  }
}

/** Faceted folded blue glass: lean-back south facade with crisp triangular folds (no wavy top). */
function makeSlopedGlass(x0, x1, zFront, y0, y1, lean, cols, rows, foldAmp = 4.2) {
  const pos = [], uv = [], idx = [];
  // Vertical strips; alternate deep V-folds so facets read as tilted glass prisms
  for (let i = 0; i <= cols; i++) {
    const u = i / cols, x = x0 + (x1 - x0) * u;
    const fold = (i % 2 === 0 ? 0 : foldAmp);
    for (let j = 0; j <= rows; j++) {
      const v = j / rows, y = y0 + (y1 - y0) * v;
      // Lean grows with height; fold also — top edge stays flat (no sine)
      const zLean = zFront - lean * v - fold * v;
      pos.push(x, y, zLean);
      uv.push(u, v);
    }
  }
  // index: columns major — vertex at (i,j) = i*(rows+1)+j
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = (i + 1) * (rows + 1) + j;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- Building (photo 04/05 silhouette) ----------
function buildBuilding(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallBuilding';
  const frameBag = Bag(), lit = Bag();
  const { o, massing } = data.building;
  const xs = o.map((p) => p[0]), zs = o.map((p) => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const zMin = Math.min(...zs), zMax = Math.max(...zs);
  const { westX1, midX1, westH, midH, eastH, pilotisH, canopyDepth = 8, canopyY = 6.5 } = massing;
  const H = Math.max(westH, midH, eastH);

  // --- Solid floor plates / roof (light grey frame language, NOT beige punched windows) ---
  // West+mid podium (filled) — glass skins added as separate meshes
  const westMid = [[xMin, zMin], [midX1, zMin], [midX1, zMax], [xMin, zMax]];
  frameBag.push(paintFaces(extrude(westMid, [], 0.0, 0.6), C.frame, C.frame, C.soffit)); // plaza-level plinth
  // Interior mass (slightly inset) as light frame — provides volume behind glass
  const inset = (ring, d) => {
    const [cx, cz] = ringCenter(ring);
    return ring.map(([x, z]) => {
      const dx = x - cx, dz = z - cz, L = Math.hypot(dx, dz) || 1;
      return [x - (dx / L) * d, z - (dz / L) * d];
    });
  };
  // West mass lower + stepped back south face (silhouette lean, not just glass skin)
  const westRing = [[xMin, zMin], [westX1, zMin], [westX1, zMax], [xMin, zMax]];
  const midRing = [[westX1, zMin], [midX1, zMin], [midX1, zMax], [westX1, zMax]];
  // Base podiums full depth
  frameBag.push(paintFaces(extrude(inset(westRing, 1.0), [], 0.6, 8), C.spandrel, C.frameDark, C.soffit));
  // Mid band stepped 4m north
  const westMidStep = [[xMin + 1.2, zMin + 1], [westX1 - 1, zMin + 1], [westX1 - 1, zMax - 4], [xMin + 1.2, zMax - 4]];
  frameBag.push(paintFaces(extrude(westMidStep, [], 8, 20), C.spandrel, C.frameDark, C.soffit));
  // Upper band stepped 9m north (lean silhouette)
  const westTopStep = [[xMin + 1.5, zMin + 1.5], [westX1 - 1.2, zMin + 1.5], [westX1 - 1.2, zMax - 9], [xMin + 1.5, zMax - 9]];
  frameBag.push(paintFaces(extrude(westTopStep, [], 20, westH - 0.4), C.spandrel, C.frameDark, C.soffit));
  // Mid atrium — slight step
  frameBag.push(paintFaces(extrude(inset(midRing, 1.2), [], 0.6, 7), C.spandrel, C.frameDark, C.soffit));
  const midUpper = [[westX1 + 1, zMin + 1], [midX1 - 1, zMin + 1], [midX1 - 1, zMax - 6], [westX1 + 1, zMax - 6]];
  frameBag.push(paintFaces(extrude(midUpper, [], 7, midH - 0.4), C.spandrel, C.frameDark, C.soffit));

  // East wing on pilotis: soffit + upper mass only
  const eastRing = [[midX1, zMin], [xMax - 1.2, zMin], [xMax - 1.2, zMax], [midX1, zMax]];
  frameBag.push(paintFaces(extrude(eastRing, [], pilotisH - 0.45, pilotisH), C.soffit, C.soffit, C.soffit));
  frameBag.push(paintFaces(extrude(inset(eastRing, 1.0), [], pilotisH, eastH - 0.4), C.spandrel, C.frameDark, C.soffit));
  // Thin plaza pad under pilotis
  frameBag.push(paintFaces(extrude(eastRing, [], 0, 0.2), C.plaza, C.plaza, C.plaza));

  // Roof slabs per wing + thin overhang canopy line
  frameBag.push(paintFaces(extrude(inset(westRing, 0.2), [], westH - 0.35, westH + 0.2), C.frame, C.frame, C.soffit));
  frameBag.push(paintFaces(extrude(inset(midRing, 0.2), [], midH - 0.35, midH + 0.2), C.frame, C.frame, C.soffit));
  frameBag.push(paintFaces(extrude(inset(eastRing, 0.2), [], eastH - 0.35, eastH + 0.25), C.frame, C.frame, C.soffit));
  // Continuous thin overhang along south top edge
  frameBag.box((xMin + xMax) / 2, eastH + 0.15, zMax + 1.0, xMax - xMin + 2, 0.22, 2.4, 0, C.frame);

  // Pilotis (slender white columns) under east + mid entrance
  const colR = 0.55, colN = 10;
  for (let i = 0; i < colN; i++) {
    for (let j = 0; j < 3; j++) {
      const x = midX1 + 3.5 + i * ((xMax - midX1 - 6) / Math.max(1, colN - 1));
      const z = zMin + 4 + j * ((zMax - zMin - 8) / 2);
      frameBag.cyl(x, pilotisH / 2, z, colR, pilotisH, 10, C.pilotis);
    }
  }
  // A few pilotis under center entrance
  for (let i = 0; i < 5; i++) {
    const x = westX1 + 4 + i * ((midX1 - westX1 - 8) / 4);
    frameBag.cyl(x, canopyY / 2, zMax - 2, 0.48, canopyY, 10, C.pilotis);
  }

  // Long flat entrance canopy
  const canW = midX1 - westX1 + 10;
  frameBag.box((westX1 + midX1) / 2, canopyY, zMax + canopyDepth / 2 - 1, canW, 0.35, canopyDepth, 0, C.frame);
  frameBag.box((westX1 + midX1) / 2, canopyY - 0.2, zMax + canopyDepth / 2 - 1, canW - 0.4, 0.12, canopyDepth - 0.4, 0, C.soffit);

  // East end solid light-grey wall (thick vertical frame)
  const eastWallX = xMax - 0.4;
  frameBag.box(eastWallX, eastH / 2, (zMin + zMax) / 2, 1.6, eastH, zMax - zMin - 1, 0, C.frame);
  // Horizontal slit windows on east end
  for (let y = 4; y < eastH - 2; y += 3.8) {
    frameBag.box(eastWallX + 0.75, y, (zMin + zMax) / 2, 0.15, 0.55, zMax - zMin - 6, 0, C.glassLite);
  }

  // Solar panels
  const solarBag = Bag();
  for (let xi = xMin + 6; xi < xMax - 6; xi += 3.6) {
    for (let zi = zMin + 3; zi < zMax - 3; zi += 2.9) {
      if (!inRing(xi, zi, o) && !(xi > midX1 && xi < xMax)) continue;
      const panel = new THREE.BoxGeometry(3.2, 0.08, 2.3);
      panel.rotateX(-0.4); panel.translate(xi, H + 0.7, zi);
      solarBag.push(panel, C.solar);
      frameBag.box(xi, H + 0.25, zi, 0.12, 0.5, 0.12, 0, C.solarFrame);
    }
  }

  // Night windows (warm/cool) on interior mass faces — not punched beige look
  const hash = (a, b, c) => { const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return v - Math.floor(v); };
  for (const e of edges(inset(westMid, 1.0), 5)) {
    const segs = Math.max(1, Math.round(e.L / 5));
    for (let f = 1; f < Math.floor(H / 3.6); f++) {
      for (let k = 0; k < segs; k++) {
        if (hash(e.mx, f, k) > 0.4) continue;
        const t = (k + 0.5) / segs;
        const x = e.ax + (e.bx - e.ax) * t + e.nx * 0.15;
        const z = e.az + (e.bz - e.az) * t + e.nz * 0.15;
        lit.box(x, f * 3.6 + 1.4, z, e.L / segs - 0.9, 2.0, 0.06, -e.ang, hash(e.mx, f, k) > 0.18 ? C.nightWarm : C.nightCool);
      }
    }
  }

  const body = frameBag.mesh(M.vc, 'cityhallBody'); if (body) g.add(body);
  const solar = solarBag.mesh(M.vc, 'cityhallSolar'); if (solar) g.add(solar);
  const night = lit.mesh(M.glow, 'cityhallGlow'); if (night) { night.castShadow = night.receiveShadow = false; g.add(night); }

  // --- Glass skins (the recognizable look) ---
  // West wing: DOMINANT sloped/folded blue glass prism (lean ~18 m, deep V-folds) — the photo signature
  const westGlass = makeSlopedGlass(xMin - 1.0, westX1 + 22, zMax + 5.5, 0.2, westH + 0.5, 24, 20, 11, 11.0);
  const westMesh = new THREE.Mesh(westGlass, M.glassBlue);
  westMesh.name = 'cityhallWestFacet';
  westMesh.castShadow = false;
  g.add(westMesh);
  // Extra large triangular prism facets (merged → 1 draw) across west + atrium
  {
    const xLo = xMin - 1.0, xHi = midX1 + 6;
    const span = xHi - xLo;
    const facets = 8;
    const geos = [];
    for (let i = 0; i < facets; i++) {
      const u0 = i / facets, u1 = (i + 1) / facets;
      const xA = xLo + span * u0, xB = xLo + span * u1, xM = (xA + xB) / 2;
      const leanTop = 16 + (i % 2) * 7.0;
      const foldOut = (i % 2 === 0) ? 1.5 : 9.5;
      const geo = new THREE.BufferGeometry();
      const y0 = 0.2, y1 = (i < 5 ? westH : midH) + 0.2;
      const zBot = zMax + 5.2;
      const zTop = zMax + 5.2 - leanTop;
      const zFold = zMax + 5.2 - leanTop * 0.5 + foldOut;
      const pos = new Float32Array([
        xA, y0, zBot,
        xB, y0, zBot,
        xM, y1, zFold,
        xA, y0, zBot,
        xM, y1, zFold,
        xA, y1, zTop,
        xB, y0, zBot,
        xB, y1, zTop,
        xM, y1, zFold,
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      geos.push(geo);
    }
    const merged = mergeGeometries(geos);
    for (const g0 of geos) g0.dispose();
    const m = new THREE.Mesh(merged, M.glassBlue);
    m.name = 'cityhallWestPrisms';
    m.castShadow = false;
    g.add(m);
  }
  // West wrap corner (west-facing facet, leans into building)
  const westSideMesh = new THREE.Mesh(
    (() => {
      const geo = makeSlopedGlass(zMin + 1, zMax - 1, xMin - 0.4, 1.0, H - 0.5, 8, 5, 7);
      // swap x/z: geometry was along x facing +z; we need along z facing -x
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        // original: x along edge, z = front - lean; map to: z along edge, x = westFront - lean
        pos.setXYZ(i, z, y, x); // will fix below differently
      }
      // Simpler: PlaneGeometry rotated
      geo.dispose();
      const p = new THREE.PlaneGeometry(zMax - zMin - 2, H - 1.5, 4, 6);
      p.rotateY(Math.PI / 2);
      // lean: rotate around Z slightly so top moves east (into building)
      p.translate(0, (H + 1) / 2, 0);
      // custom lean via morphing
      const pp = p.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const y = pp.getY(i);
        const t = Math.max(0, (y - 1) / (H - 1));
        pp.setX(i, pp.getX(i) + t * t * 7); // lean inward (+x)
      }
      p.translate(xMin - 0.5, 0, (zMin + zMax) / 2);
      p.computeVertexNormals();
      return p;
    })(),
    M.glassBlue,
  );
  westSideMesh.name = 'cityhallWestSideGlass'; westSideMesh.castShadow = false; g.add(westSideMesh);

  // Center atrium: big diagonal blue glass over entrance (continues the west fold language)
  const atrium = makeSlopedGlass(westX1 - 8, midX1 + 12, zMax + 4.5, 0.3, midH + 0.3, 20, 18, 10, 7.5);
  const atriumMesh = new THREE.Mesh(atrium, M.glassBlue);
  atriumMesh.name = 'cityhallBlueFacade'; atriumMesh.castShadow = false; g.add(atriumMesh);

  // East upright curtain wall (south face) — tall glass box with deep pilotis recess
  const eastCurtain = new THREE.PlaneGeometry(xMax - midX1 - 1.5, eastH - pilotisH - 0.5, 1, 1);
  eastCurtain.translate((midX1 + xMax) / 2, (pilotisH + eastH) / 2, zMax + 0.55);
  const eastCurtainMesh = new THREE.Mesh(eastCurtain, M.glassCurtain || M.glassLite);
  eastCurtainMesh.name = 'cityhallEastCurtain'; eastCurtainMesh.castShadow = false; g.add(eastCurtainMesh);
  // Thick light-grey frame around east box (top + sides)
  frameBag.box((midX1 + xMax) / 2, eastH + 0.15, zMax + 0.7, xMax - midX1 - 0.5, 0.55, 0.7, 0, C.frame);
  frameBag.box(midX1 + 0.4, (pilotisH + eastH) / 2, zMax + 0.7, 0.7, eastH - pilotisH, 0.7, 0, C.frame);
  frameBag.box(xMax - 0.9, (pilotisH + eastH) / 2, zMax + 0.7, 0.7, eastH - pilotisH, 0.7, 0, C.frame);

  // North curtain — backdrop for music fountain (seats look south at fountain + this face)
  const northCurtain = new THREE.PlaneGeometry(xMax - xMin - 2, H - 1.5, 1, 1);
  northCurtain.translate((xMin + xMax) / 2, H / 2, zMin - 0.5);
  northCurtain.rotateY(Math.PI);
  const northMesh = new THREE.Mesh(northCurtain, M.glassCurtain || M.glassLite);
  northMesh.name = 'cityhallNorthCurtain'; northMesh.castShadow = false; g.add(northMesh);
  // North horizontal bands + a few pilotis under north mid (fountain view)
  for (let y = 4; y < H - 2; y += 3.6) {
    frameBag.box((xMin + xMax) / 2, y, zMin - 0.65, xMax - xMin - 4, 0.3, 0.22, 0, C.spandrel);
  }
  for (let i = 0; i < 8; i++) {
    const x = westX1 + 2 + i * ((midX1 - westX1) / 7);
    frameBag.cyl(x, 3.6, zMin - 1.2, 0.45, 7.2, 10, C.pilotis);
  }
  frameBag.box((westX1 + midX1) / 2, 7.2, zMin - 2.5, midX1 - westX1 + 6, 0.3, 5, 0, C.frame);

  // Low glass base along south plaza
  const baseGlass = new THREE.PlaneGeometry(xMax - xMin - 4, 3.2, 1, 1);
  baseGlass.translate((xMin + xMax) / 2, 2.0, zMax + 0.5);
  const baseMesh = new THREE.Mesh(baseGlass, M.glassLite);
  baseMesh.name = 'cityhallBaseGlass'; baseMesh.castShadow = false; g.add(baseMesh);

  // Tall vertical banner panel on east end wall (generic emblem, no city logo)
  const ban = new THREE.PlaneGeometry(3.2, eastH * 0.55, 1, 1);
  ban.translate(eastWallX + 0.85, eastH * 0.48, (zMin + zMax) / 2);
  ban.rotateY(-Math.PI / 2);
  const banMesh = new THREE.Mesh(ban, M.banner);
  banMesh.name = 'cityhallEastBanner'; banMesh.castShadow = false; g.add(banMesh);

  // Horizontal frame/spandrel bands on east curtain (readable from distance)
  for (let y = pilotisH + 3.5; y < eastH - 1; y += 3.6) {
    frameBag.box((midX1 + xMax) / 2, y, zMax + 0.55, xMax - midX1 - 2.5, 0.4, 0.28, 0, C.spandrel);
  }
  // Re-merge remaining frame pieces? bands pushed after body mesh — add as separate small mesh
  const bands = frameBag.mesh(M.vc, 'cityhallBands'); if (bands) g.add(bands);

  // Front annex (앞쪽 조그만한 건물) — south of west wing, right/east face diagonally cut (v5)
  {
    const frontH = 16.0;
    const frontRing = [
      [1526.0, -5906.0],
      [1526.0, -5884.0],
      [1536.0, -5884.0],
      [1584.0, -5906.0], // long diagonal right cut
    ];
    frameBag.push(paintFaces(extrude(frontRing, [], 0, frontH), C.frame, C.frameDark, C.soffit));
    frameBag.push(paintFaces(extrude(frontRing, [], frontH, frontH + 0.35), C.frame, C.frame, C.soffit));
    const southGeo = new THREE.PlaneGeometry(1536 - 1526 - 0.5, frontH - 0.7);
    const southM = new THREE.Mesh(southGeo, M.glassBlue);
    southM.position.set((1526 + 1536) / 2, frontH / 2, -5884.0 + 0.12);
    southM.name = 'cityhallFrontSouthGlass'; g.add(southM);
    const ax = 1536, az = -5884.0, bx = 1584, bz = -5906.0;
    const y0 = 0.3, y1 = frontH - 0.3;
    const slantGeo = new THREE.BufferGeometry();
    const sv = new Float32Array([
      ax, y0, az,  bx, y0, bz,  bx, y1, bz,
      ax, y0, az,  bx, y1, bz,  ax, y1, az,
    ]);
    slantGeo.setAttribute('position', new THREE.BufferAttribute(sv, 3));
    slantGeo.computeVertexNormals();
    const slantM = new THREE.Mesh(slantGeo, M.glassBlue);
    slantM.name = 'cityhallFrontSlantGlass'; g.add(slantM);
  }

  // Council annex — glass/grey, attached west (no beige punched windows)
  if (data.council?.o) {
    const cb = Bag();
    const ch = Math.min(data.council.h || 18, 22);
    cb.push(paintFaces(extrude(data.council.o, [], 0, ch), C.frame, C.frameDark, C.soffit));
    band(cb, data.council.o, ch, ch + 0.8, 0.08, 0.25, C.frame, { minLen: 1 });
    const cm = cb.mesh(M.vc, 'cityhallCouncil'); if (cm) g.add(cm);
    // glass skin south + slanted right (east) face — 도훈 v5
    const cxs = data.council.o.map((p) => p[0]), czs = data.council.o.map((p) => p[1]);
    const cx0 = Math.min(...cxs), cx1 = Math.max(...cxs), cz1 = Math.max(...czs);
    const cg = new THREE.PlaneGeometry(cx1 - cx0 - 1, ch - 1.5, 1, 1);
    cg.translate((cx0 + cx1) / 2, ch / 2, cz1 + 0.3);
    const cgm = new THREE.Mesh(cg, M.glassBlue);
    cgm.name = 'cityhallCouncilGlass'; cgm.castShadow = false; g.add(cgm);
    // Diagonal right cut glass (matches index.json council outline)
    const ax = 1588.2, az = -5890.0, bx = 1555.0, bz = -5859.0;
    const y0 = 0.4, y1 = ch - 0.4;
    const slantGeo = new THREE.BufferGeometry();
    slantGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      ax, y0, az, bx, y0, bz, bx, y1, bz,
      ax, y0, az, bx, y1, bz, ax, y1, az,
    ]), 3));
    slantGeo.computeVertexNormals();
    const csm = new THREE.Mesh(slantGeo, M.glassBlue);
    csm.name = 'cityhallCouncilSlantGlass'; g.add(csm);
    // Opaque slant panel + crisp dark edge lines (reads even without glass)
    const faceGeo = slantGeo.clone();
    const faceM = new THREE.Mesh(faceGeo, M.slantFace || M.frameDark);
    faceM.position.x += 0.15; // slight outward
    faceM.name = 'cityhallCouncilSlantFace'; g.add(faceM);
    const edgeH = 0.45;
    for (const [ey, en] of [[ch - 0.2, 'T'], [0.25, 'B']]) {
      const eg = new THREE.BufferGeometry();
      eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        ax, ey - edgeH / 2, az, bx, ey - edgeH / 2, bz, bx, ey + edgeH / 2, bz,
        ax, ey - edgeH / 2, az, bx, ey + edgeH / 2, bz, ax, ey + edgeH / 2, az,
      ]), 3));
      eg.computeVertexNormals();
      const em = new THREE.Mesh(eg, M.slantEdge || M.frameDark);
      em.name = 'cityhallCouncilSlantEdge' + en; g.add(em);
    }
  }

  return { group: g, night, facade: atriumMesh };
}

// ---------- Grounds ----------
function buildGrounds(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallGrounds';
  const bag = Bag();
  const b = data.building;
  const xs = b.o.map((p) => p[0]), zs = b.o.map((p) => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const zMin = Math.min(...zs), zMax = Math.max(...zs);

  // SE granite plaza near building (ref/04) — stop short of pond so lawn/path read (ref/11·12)
  const plaza = [
    [xMin - 8, zMax + 0.3], [xMax + 28, zMax + 0.3],
    [xMax + 38, zMax + 55], [xMin - 5, zMax + 70],
  ];
  {
    const geo = extrude(plaza, [], 0.08, 0.16);
    const m = new THREE.Mesh(geo, M.plaza); m.name = 'cityhallPlaza'; m.receiveShadow = true; g.add(m);
  }

  // Lawns — open green beside SE approach (ref/12): west of pond, both sides of promenade
  const lawnSE = [[xMax + 2, zMax + 4], [xMax + 55, zMax + 6], [xMax + 72, zMax + 78], [xMax + 4, zMax + 70]];
  bag.push(paintFaces(extrude(lawnSE, [], 0.12, 0.18), C.lawn, C.lawnDark));
  // Explicit lawn band between promenade and pond (ref/11·12)
  const lawnPathPond = [[1635, -5912], [1675, -5850], [1708, -5860], [1708, -5938], [1650, -5940]];
  bag.push(paintFaces(extrude(lawnPathPond, [], 0.12, 0.18), C.lawn, C.lawnDark));
  const lawnN = [[xMin - 25, zMin - 60], [xMax + 15, zMin - 60], [xMax + 15, zMin - 2], [xMin - 25, zMin - 2]];
  bag.push(paintFaces(extrude(lawnN, [], 0.01, 0.05), C.lawn, C.lawnDark));
  const lawnW = [[xMin - 95, zMin - 45], [xMin - 5, zMin - 45], [xMin - 5, zMax + 45], [xMin - 95, zMax + 45]];
  bag.push(paintFaces(extrude(lawnW, [], 0.01, 0.05), C.lawnDark, C.lawn));

  // Loop path (west park)
  const pathPts = data.westParkLoop?.pts || [];
  for (let i = 0; i < pathPts.length - 1; i++) {
    const [ax, az] = pathPts[i], [bx, bz] = pathPts[i + 1];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dz, dx);
    bag.box((ax + bx) / 2, 0.05, (az + bz) / 2, L, 0.08, 3.5, -ang, C.path);
  }
  const d = data.deck;
  bag.box((d.x0 + d.x1) / 2, 0.06, d.seatsZ - 5, d.x1 - d.x0 + 8, 0.08, 3.5, 0, C.path);

  // Single straight paved promenade → city hall (shifted LEFT off pond; ref/11·12)
  const pr = data.promenade;
  {
    const dx = pr.to[0] - pr.from[0], dz = pr.to[1] - pr.from[1], L = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
    const geo = new THREE.BoxGeometry(L, 0.1, pr.width);
    geo.rotateY(-ang); geo.translate((pr.from[0] + pr.to[0]) / 2, 0.06, (pr.from[1] + pr.to[1]) / 2);
    const m = new THREE.Mesh(geo, M.plaza); m.name = 'cityhallPromenade'; m.receiveShadow = true; g.add(m);
  }

  // Pink/brick strip crossing the lawn (ref/12)
  {
    const bx0 = 1668, bz0 = -5868, bx1 = 1725, bz1 = -5875;
    const dx = bx1 - bx0, dz = bz1 - bz0, L = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
    bag.box((bx0 + bx1) / 2, 0.07, (bz0 + bz1) / 2, L, 0.09, 2.4, -ang, C.brick);
  }

  // Thin curved path along pond edge (east of promenade, west lip of pond)
  {
    const pcx = data.pond?.round?.cx ?? 1710, pcz = data.pond?.round?.cz ?? -5925, prr = (data.pond?.round?.r ?? 16) + 3.2;
    for (let i = 0; i < 14; i++) {
      const a0 = -2.2 + i * 0.18, a1 = a0 + 0.18;
      const x0 = pcx + Math.cos(a0) * prr, z0 = pcz + Math.sin(a0) * prr;
      const x1 = pcx + Math.cos(a1) * prr, z1 = pcz + Math.sin(a1) * prr;
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1, ang = Math.atan2(dz, dx);
      bag.box((x0 + x1) / 2, 0.06, (z0 + z1) / 2, L, 0.08, 2.0, -ang, C.path);
    }
  }

  // Small green kiosk on lawn (photo 04/05) — keep west of new path
  bag.box(xMax + 18, 1.4, zMax + 22, 4.5, 2.8, 3.2, 0.3, C.kiosk);
  bag.box(xMax + 18, 2.9, zMax + 22, 5.0, 0.15, 3.6, 0.3, C.frame);

  const body = bag.mesh(M.vc, 'cityhallGroundBody'); if (body) g.add(body);
  return g;
}

function buildBanners(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallBanners';
  const pr = data.promenade;
  const dx = pr.to[0] - pr.from[0], dz = pr.to[1] - pr.from[1], L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  const n = 14;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 7.8, 6), M.pole, n * 2 + 10);
  const banners = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.95, 2.4), M.banner, n * 2 + 10);
  const dummy = new THREE.Object3D();
  let i = 0;
  for (const side of [-1, 1]) {
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = pr.from[0] + dx * t + px * side * (pr.width / 2 + 1.3);
      const z = pr.from[1] + dz * t + pz * side * (pr.width / 2 + 1.3);
      dummy.position.set(x, 3.9, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + px * side * 0.15, 5.4, z + pz * side * 0.15);
      dummy.rotation.set(0, Math.atan2(px * side, pz * side), 0);
      dummy.updateMatrix();
      banners.setMatrixAt(i, dummy.matrix);
      i++;
    }
  }
  // Banner poles only along the (shifted) promenade — matches ref/12
  poles.count = i; banners.count = i;
  poles.castShadow = true; g.add(poles, banners);
  return g;
}

function buildPond(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallPond';
  const bag = Bag();
  // Photo-matching round / soft-kidney pond on east
  const rd = data.pond.round || { cx: 1710, cz: -5925, r: 14 };
  const cx = rd.cx, cz = rd.cz, r = rd.r;
  // Stepped stone edge (3 rings)
  for (let i = 0; i < 3; i++) {
    const rr = r + 1.2 - i * 0.55;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.32, 6, 32), M.curb);
    ring.rotation.x = Math.PI / 2; ring.position.set(cx, 0.25 + i * 0.22, cz); g.add(ring);
  }
  const water = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.4, r - 0.4, 0.35, 32), M.water);
  water.position.set(cx, 0.22, cz); water.name = 'cityhallRoundPond'; g.add(water);

  // Skip raw OSM pond outline — it reads as a broken quarter-ring; round pond above is the photo match.

  // Blue abstract sculpture
  const sc = data.pond.sculpture || { x: cx - 12, z: cz + 8 };
  bag.cyl(sc.x, 0.35, sc.z, 0.85, 0.7, 10, C.curb);
  const wing = new THREE.SphereGeometry(1.5, 10, 8, 0, Math.PI);
  wing.scale(1, 0.35, 0.7); wing.rotateZ(0.5); wing.translate(sc.x - 0.6, 2.3, sc.z);
  bag.push(wing, C.sculpture);
  const wing2 = new THREE.SphereGeometry(1.5, 10, 8, 0, Math.PI);
  wing2.scale(1, 0.35, 0.7); wing2.rotateZ(-0.5); wing2.rotateY(Math.PI); wing2.translate(sc.x + 0.6, 2.3, sc.z);
  bag.push(wing2, C.sculpture);
  bag.cyl(sc.x, 1.5, sc.z, 0.15, 2.3, 6, C.sculpture);
  const sm = bag.mesh(M.vc, 'cityhallSculpture'); if (sm) g.add(sm);
  return g;
}

function buildFountainComplex(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallFountain';
  const f = data.fountain, d = data.deck;
  const bag = Bag();

  const pool = [
    [f.cx - f.len / 2, f.cz - f.wid / 2],
    [f.cx + f.len / 2, f.cz - f.wid / 2],
    [f.cx + f.len / 2, f.cz + f.wid / 2],
    [f.cx - f.len / 2, f.cz + f.wid / 2],
  ];
  bag.push(paintFaces(extrude(pool, [], 0.02, 0.45), C.waterDeep, C.curb, C.waterDeep));
  band(bag, pool, 0.45, 0.6, 0.28, 0.35, C.brick, { minLen: 1 });
  const body = bag.mesh(M.vc, 'cityhallFountainBasin'); if (body) g.add(body);
  // Raised curb around basin (keeps stray vehicles from reading as in-water)
  const curbBag = Bag();
  curbBag.box(f.cx, 0.55, f.cz - f.wid / 2, f.len, 0.7, 0.45, 0, C.curb);
  curbBag.box(f.cx, 0.55, f.cz + f.wid / 2, f.len, 0.7, 0.45, 0, C.curb);
  curbBag.box(f.cx - f.len / 2, 0.55, f.cz, 0.45, 0.7, f.wid, 0, C.curb);
  curbBag.box(f.cx + f.len / 2, 0.55, f.cz, 0.45, 0.7, f.wid, 0, C.curb);
  const curbM = curbBag.mesh(M.vc, 'cityhallFountainCurb'); if (curbM) g.add(curbM);

  const water = new THREE.Mesh(extrude(
    [[f.cx - f.len / 2 + 0.4, f.cz - f.wid / 2 + 0.3], [f.cx + f.len / 2 - 0.4, f.cz - f.wid / 2 + 0.3],
      [f.cx + f.len / 2 - 0.4, f.cz + f.wid / 2 - 0.3], [f.cx - f.len / 2 + 0.4, f.cz + f.wid / 2 - 0.3]],
    [], 0.32, 0.38,
  ), M.water);
  water.name = 'cityhallFountainWater'; g.add(water);

  // Wooden deck
  const deckBag = Bag();
  const deckRing = [[d.x0, d.deckZ - 1.6], [d.x1, d.deckZ - 1.6], [d.x1, d.deckZ + 1.4], [d.x0, d.deckZ + 1.4]];
  deckBag.push(paintFaces(extrude(deckRing, [], 0.4, 0.58), C.wood, C.woodDark, C.woodDark));
  for (let x = d.x0 + 1; x < d.x1; x += 0.85) deckBag.box(x, 0.59, d.deckZ, 0.06, 0.02, 2.7, 0, C.woodDark);
  const deckM = deckBag.mesh(M.vc, 'cityhallDeck'); if (deckM) g.add(deckM);

  // 4-tier brick/stone step-seats NORTH of fountain, facing SOUTH toward fountain + city hall (ref/08·09)
  // Rise further north (away from water); forest + 3–4 m path behind seats
  const seatBag = Bag();
  const tiers = 4, tierD = 1.2, tierH = 0.52;
  for (let t = 0; t < tiers; t++) {
    const z0 = d.seatsZ - t * tierD; // rise north (−z)
    const y0 = 0.4 + t * tierH;
    seatBag.box((d.x0 + d.x1) / 2, y0 + tierH / 2, z0, d.x1 - d.x0 + 4, tierH, tierD - 0.08, 0, t % 2 ? C.brick : C.brickDark);
  }
  seatBag.box((d.x0 + d.x1) / 2, 0.35, d.seatsZ + 0.55, d.x1 - d.x0 + 4, 0.3, 0.5, 0, C.wood);
  // 3–4 m walking path behind seats (further north, outer red of ref/08)
  const pathZ = d.seatsZ - tiers * tierD - 2.5;
  seatBag.box((d.x0 + d.x1) / 2, 0.06, pathZ, d.x1 - d.x0 + 18, 0.1, 3.8, 0, C.path);
  const seatM = seatBag.mesh(M.vc, 'cityhallSeats'); if (seatM) g.add(seatM);

  // Jets: thin translucent tapered columns (2–10 m) + soft additive glow — NOT opaque slabs
  const JET_N = 40;
  // Vertical soft gradient planes (cross pair) — reads as thin water column, not opaque slab
  const jetGeo = new THREE.PlaneGeometry(0.22, 1);
  jetGeo.translate(0, 0.5, 0);
  const jets = new THREE.InstancedMesh(jetGeo, M.jet, JET_N * 2);
  jets.name = 'cityhallJets'; jets.frustumCulled = false; g.add(jets);

  // Soft outer glow sheath (slightly wider, more transparent) — night only
  const sheathMat = new THREE.MeshBasicMaterial({
    color: '#5aa8ff', transparent: true, opacity: 0.18, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const sheathGeo = new THREE.PlaneGeometry(0.9, 1);
  sheathGeo.translate(0, 0.5, 0);
  const sheaths = new THREE.InstancedMesh(sheathGeo, sheathMat, JET_N);
  sheaths.name = 'cityhallJetSheaths'; sheaths.visible = false; sheaths.frustumCulled = false; g.add(sheaths);

  // Arch segments — thin
  const ARCH_N = 48;
  const archGeo = new THREE.CylinderGeometry(0.03, 0.055, 1, 5);
  archGeo.translate(0, 0.5, 0);
  const arches = new THREE.InstancedMesh(archGeo, M.jet, ARCH_N);
  arches.name = 'cityhallArches'; arches.frustumCulled = false; g.add(arches);

  // Mist soft discs
  const mistGeo = new THREE.CircleGeometry(1.1, 10);
  const mists = new THREE.InstancedMesh(mistGeo, M.mist, 12);
  mists.name = 'cityhallMist'; mists.frustumCulled = false; g.add(mists);

  // Basin point lights (small)
  const lightGeo = new THREE.CircleGeometry(0.4, 8);
  lightGeo.rotateX(-Math.PI / 2);
  const lightMats = [
    new THREE.MeshBasicMaterial({ color: '#3aa0ff', transparent: true, opacity: 0.7 }),
    new THREE.MeshBasicMaterial({ color: '#ff4db8', transparent: true, opacity: 0.7 }),
    new THREE.MeshBasicMaterial({ color: '#4dff7a', transparent: true, opacity: 0.7 }),
  ];
  const lights = [];
  const LIGHT_N = 12;
  for (let i = 0; i < LIGHT_N; i++) {
    const t = (i + 0.5) / LIGHT_N;
    const x = f.cx - f.len / 2 + 2 + t * (f.len - 4);
    const m = new THREE.Mesh(lightGeo, lightMats[i % 3]);
    m.position.set(x, 0.4, f.cz); m.visible = false; g.add(m); lights.push(m);
  }

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(f.len * 1.05, f.wid * 1.6),
    new THREE.MeshBasicMaterial({ color: '#3a8fff', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.rotation.x = -Math.PI / 2; glow.position.set(f.cx, 0.39, f.cz); glow.visible = false; g.add(glow);

  const dummy = new THREE.Object3D();
  const seeds = Array.from({ length: JET_N }, (_, i) => ({
    x: f.cx - f.len / 2 + 1.8 + ((i + 0.5) / JET_N) * (f.len - 3.6),
    z: f.cz + ((i % 3) - 1) * 1.5,
    phase: i / JET_N,
    // 2–10 m peaks
    h: Math.min(10, 2.0 + (i % 5) * 1.0 + (i % 7 === 0 ? 2.8 : 0) + (i % 11 === 0 ? 1.8 : 0)),
  }));
  const archSeeds = [];
  for (let bank = 0; bank < 2; bank++) {
    for (let a = 0; a < 5; a++) {
      const x = f.cx - 14 + a * 5.5;
      for (let seg = 0; seg < 4; seg++) {
        archSeeds.push({
          x, y0: 0.4, z0: f.cz + (bank === 0 ? -1.8 : 1.8),
          side: bank === 0 ? 1 : -1,
          radius: 3.2 + (a % 3) * 0.45,
          seg, phase: (a + bank * 6) / 12,
        });
      }
    }
  }

  let nightOn = false;
  const stopEve = watchEvening((on) => {
    nightOn = on;
    glow.visible = on;
    sheaths.visible = false; // disabled: wide planes read as slabs
    for (const m of lights) m.visible = on;
    M.water.emissiveIntensity = on ? 0.85 : 0.15;
    M.jet.opacity = on ? 0.55 : 0.4;
  });

  function update(t) {
    if (nightOn) {
      const phase = (t * 0.22) % 3;
      const cols = ['#2a9aff', '#ff4db8', '#40e88a'];
      const idx = Math.floor(phase), mix = phase - idx;
      const c0 = new THREE.Color(cols[idx]), c1 = new THREE.Color(cols[(idx + 1) % 3]);
      glow.material.color.copy(c0).lerp(c1, mix);
      M.jet.color.copy(c0).lerp(c1, mix);
      sheathMat.color.copy(c0).lerp(c1, mix);
      M.mist.color.copy(c0).lerp(c1, mix);
      for (let i = 0; i < lights.length; i++) {
        lights[i].material.color.copy(c0).lerp(c1, (mix + i * 0.05) % 1);
      }
    } else {
      M.jet.color.set('#d8eefc');
      M.mist.color.set('#c8e8ff');
    }
    for (let i = 0; i < JET_N; i++) {
      const s = seeds[i];
      const h = Math.min(10, s.h * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.0 + s.phase * Math.PI * 2))));
      const w = nightOn ? 0.35 : 0.28;
      // crossed planes for volumetric column look
      dummy.position.set(s.x, 0.4, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(w, Math.max(0.5, h), 1);
      dummy.updateMatrix();
      jets.setMatrixAt(i * 2, dummy.matrix);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.updateMatrix();
      jets.setMatrixAt(i * 2 + 1, dummy.matrix);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(nightOn ? 1.4 : 0.9, Math.max(0.5, h * 1.02), 1);
      dummy.updateMatrix();
      sheaths.setMatrixAt(i, dummy.matrix);
    }
    jets.count = JET_N * 2;
    jets.instanceMatrix.needsUpdate = true;
    sheaths.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < archSeeds.length && i < ARCH_N; i++) {
      const a = archSeeds[i];
      const pulse = 0.7 + 0.3 * Math.sin(t * 1.8 + a.phase * Math.PI * 2);
      const u = a.seg / 3;
      const ang = u * Math.PI;
      const rr = a.radius * pulse;
      const y = a.y0 + Math.sin(ang) * rr;
      const z = a.z0 + a.side * (1 - Math.cos(ang)) * rr * 0.5;
      const lean = Math.atan2(a.side * Math.sin(ang) * 0.5, Math.max(0.05, Math.cos(ang)));
      dummy.position.set(a.x, y, z);
      dummy.rotation.set(lean, 0, 0);
      dummy.scale.set(1, 1.1 * pulse, 1);
      dummy.updateMatrix();
      arches.setMatrixAt(i, dummy.matrix);
    }
    arches.count = Math.min(ARCH_N, archSeeds.length);
    arches.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 12; i++) {
      const s = seeds[i * 3 % JET_N];
      const h = s.h * (0.5 + 0.35 * Math.sin(t * 1.2 + s.phase * 6));
      dummy.position.set(s.x, 0.45 + h * 0.75, s.z);
      dummy.scale.set(1.4 + (i % 3) * 0.35, 1.4, 1);
      dummy.rotation.set(-Math.PI / 2, 0, t * 0.1 + i);
      dummy.updateMatrix();
      mists.setMatrixAt(i, dummy.matrix);
    }
    mists.instanceMatrix.needsUpdate = true;
  }

  return {
    group: g, update,
    disposeExtra: () => {
      stopEve(); lightGeo.dispose(); sheathGeo.dispose(); jetGeo.dispose(); archGeo.dispose(); mistGeo.dispose();
      for (const m of lightMats) m.dispose(); sheathMat.dispose();
      glow.geometry.dispose(); glow.material.dispose();
    },
  };
}


function buildLandscape(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallLandscape';
  const b = data.building;
  const xs = b.o.map((p) => p[0]), zs = b.o.map((p) => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const zMin = Math.min(...zs), zMax = Math.max(...zs);
  const seatsZ = data.deck?.seatsZ ?? -5978;
  const f = data.fountain || { cx: 1610, cz: -5965, len: 58 };

  // Clear: north fountain corridor + south plaza strip + pond apron (ref/11·12 — open water)
  const pondCx = data.pond?.round?.cx ?? 1710, pondCz = data.pond?.round?.cz ?? -5925, pondR = data.pond?.round?.r ?? 16;
  const inKeepClear = (x, z) => (
    x > f.cx - f.len / 2 - 10 && x < f.cx + f.len / 2 + 10 && z < zMin + 2 && z > seatsZ - 8
  ) || (
    x > xMin - 5 && x < xMax + 5 && z > zMax && z < zMax + 32
  ) || (
    Math.hypot(x - pondCx, z - pondCz) < pondR + 40
  ) || (
    // lawn strip between shifted promenade and pond — keep open (ref/12)
    x > 1645 && x < 1725 && z > -5935 && z < -5855
  );

  const positions = [];
  const pushT = (x, z, kind) => { if (!inKeepClear(x, z)) positions.push([x, z, kind]); }; // kind: 0 broad, 1 pine, 2 layered-pine

  // Dense edges
  for (let x = xMin - 80; x < xMax + 60; x += 6.5) {
    pushT(x, zMin - 55 + Math.sin(x * 0.2) * 3, 2); // far north forest belt
    // South belt: stop before SE pond/plaza quadrant (ref/11 — no tree crowd by water)
    if (x < xMax + 5) pushT(x, zMax + 70 + Math.cos(x * 0.15) * 4, 0);
  }
  for (let z = seatsZ - 55; z < zMax + 55; z += 9) {
    pushT(xMin - 72 + Math.sin(z * 0.1) * 4, z, 1);
    // east belt stays far from pond (xMax+70); keepClear still drops near-pond hits
    pushT(xMax + 70 + Math.cos(z * 0.12) * 3, z, 0);
  }
  // Forest BEHIND seats (further north of seats/path)
  for (let x = 1570; x < 1650; x += 4) pushT(x, seatsZ - 22 + Math.sin(x) * 1.5, 2);
  for (let x = 1572; x < 1648; x += 4.5) pushT(x, seatsZ - 22 + Math.cos(x) * 2, 1);
  for (let x = 1565; x < 1655; x += 5.5) pushT(x, seatsZ - 32 + Math.sin(x * 0.3) * 2, 0);
  // SE lawn: sparse accent trees only (pond apron already cleared by inKeepClear)
  for (const [tx, tz, k] of [
    [xMax + 12, zMax + 28, 0], [xMax + 18, zMax + 48, 1], [xMax + 28, zMax + 62, 0],
    [xMax + 8, zMax + 55, 1],
  ]) pushT(tx, tz, k);
  // Promenade flanks — one light row on plaza side only (not toward water)
  const pr = data.promenade;
  for (let t = 0.1; t < 0.9; t += 0.14) {
    const x = pr.from[0] + (pr.to[0] - pr.from[0]) * t;
    const z = pr.from[1] + (pr.to[1] - pr.from[1]) * t;
    // left/plaza side (west-ish of path direction)
    const dx = pr.to[0] - pr.from[0], dz = pr.to[1] - pr.from[1], L = Math.hypot(dx, dz) || 1;
    const px = -dz / L, pz = dx / L; // perpendicular
    pushT(x + px * -10, z + pz * -10, t < 0.5 ? 0 : 1);
  }

  const N = positions.length;
  // Better trees: layered conifer (2 cones) + multi-sphere broadleaf — still 3 InstancedMeshes
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 1, 6), M.trunk, N);
  const broad = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), M.foliage, N * 3); // up to 3 spheres each
  const pine = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 2.4, 7), M.pine, N * 3); // up to 3 layers
  // Second foliage tone via vertex colors on shared mat — use scale/offset only; extra mat would cost a texture/draw
  const dummy = new THREE.Object3D();
  let pi = 0, bi = 0;
  for (let i = 0; i < N; i++) {
    const [x, z, kind] = positions[i];
    const h = 4.0 + (i % 5) * 0.85;
    dummy.position.set(x, h / 2, z); dummy.scale.set(1, h, 1); dummy.rotation.set(0, (i % 7) * 0.3, 0); dummy.updateMatrix();
    trunk.setMatrixAt(i, dummy.matrix);
    if (kind === 1 || kind === 2) {
      // Layered conifer: 2–3 cones stacked
      const layers = kind === 2 ? 3 : 2;
      for (let L = 0; L < layers; L++) {
        const yy = h * 0.55 + L * 1.35 + 0.8;
        const sc = 1.35 - L * 0.28 + (i % 3) * 0.08;
        dummy.position.set(x, yy, z); dummy.scale.set(sc, 1.1 + (i % 3) * 0.1, sc); dummy.updateMatrix();
        pine.setMatrixAt(pi++, dummy.matrix);
      }
    } else {
      // Broadleaf: 2–3 overlapping spheres, slight color via scale
      const blobs = 2 + (i % 2);
      for (let L = 0; L < blobs; L++) {
        const ox = (L - 0.5) * 0.9, oz = ((L * 2) % 3 - 1) * 0.7;
        dummy.position.set(x + ox, h + 1.1 + L * 0.45, z + oz);
        dummy.scale.set(2.0 + (i % 3) * 0.25 - L * 0.15, 1.7 + L * 0.1, 2.0); dummy.updateMatrix();
        broad.setMatrixAt(bi++, dummy.matrix);
      }
    }
  }
  pine.count = pi; broad.count = bi;
  trunk.castShadow = true; broad.castShadow = pine.castShadow = true;
  g.add(trunk, broad, pine);

  // Hedges along promenade
  const hedgeN = 20;
  const hedges = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.9, 0.7), M.hedge, hedgeN * 2);
  let hi = 0;
  for (const side of [-1, 1]) {
    for (let k = 0; k < hedgeN; k++) {
      const t = (k + 0.5) / hedgeN;
      const x = pr.from[0] + (pr.to[0] - pr.from[0]) * t;
      const z = pr.from[1] + (pr.to[1] - pr.from[1]) * t;
      const dx = pr.to[0] - pr.from[0], dz = pr.to[1] - pr.from[1], L = Math.hypot(dx, dz);
      const px = -dz / L, pz = dx / L;
      dummy.position.set(x + px * side * (pr.width / 2 + 2.5), 0.45, z + pz * side * (pr.width / 2 + 2.5));
      dummy.scale.set(1, 1, 1); dummy.rotation.set(0, Math.atan2(dz, dx), 0); dummy.updateMatrix();
      hedges.setMatrixAt(hi++, dummy.matrix);
    }
  }
  g.add(hedges);
  return g;
}

function buildParking(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallParking';
  if (!data.parking?.length) return g;
  const bag = Bag();
  const lineBag = Bag();
  let carN = 0;
  for (const lot of data.parking) {
    if (!lot.o) continue;
    bag.push(paintFaces(extrude(lot.o, [], 0.01, 0.04), C.asphalt, C.asphalt));
    const xs = lot.o.map((p) => p[0]), zs = lot.o.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    for (let x = x0 + 3; x < x1 - 3; x += 3.2) {
      lineBag.box(x, 0.05, (z0 + z1) / 2, 0.08, 0.02, Math.max(2, z1 - z0 - 2), 0, C.line);
      carN++;
    }
  }
  const body = bag.mesh(M.vc, 'cityhallParkingBody'); if (body) g.add(body);
  const lines = lineBag.mesh(M.line, 'cityhallParkingLines'); if (lines) g.add(lines);
  // Instanced cars
  const n = Math.min(40, carN);
  if (n > 0) {
    const colors = ['#c45c5c', '#5c7ac4', '#e8e8e8', '#2a2a2a', '#c4a05c'];
    const carGeo = new THREE.BoxGeometry(1.8, 0.7, 4.2);
    const carMat = new THREE.MeshLambertMaterial({ color: '#888' });
    const cars = new THREE.InstancedMesh(carGeo, carMat, n);
    cars.name = 'cityhallCars';
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let i = 0;
    for (const lot of data.parking) {
      if (!lot.o || i >= n) break;
      const xs = lot.o.map((p) => p[0]), zs = lot.o.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      for (let x = x0 + 4; x < x1 - 4 && i < n; x += 6.5) {
        dummy.position.set(x, 0.4, (z0 + z1) / 2); dummy.rotation.set(0, (i % 2) * 0.05, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        cars.setMatrixAt(i, dummy.matrix);
        color.set(colors[i % colors.length]); cars.setColorAt(i, color);
        i++;
      }
    }
    if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
    g.add(cars);
  }
  return g;
}

function buildVehicleGate(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallVehicleGate';
  const gate = data.vehicleGate;
  if (!gate) return g;
  const bag = Bag();
  const [x, z] = gate.pos || [1532, -5835];
  bag.box(x - 4, 1.5, z, 0.4, 3, 0.4, 0, C.frame);
  bag.box(x + 4, 1.5, z, 0.4, 3, 0.4, 0, C.frame);
  bag.box(x, 3.2, z, 9, 0.35, 0.4, 0, C.frame);
  const m = bag.mesh(M.vc, 'cityhallGate'); if (m) g.add(m);
  return g;
}

export function buildSeongnamCityHall(data, { env = null, glbUrl = null } = {}) {
  const M = mats();
  if (env) {
    for (const k of ['glassBlue', 'glassCurtain', 'glassLite', 'water', 'frame', 'solar', 'sculpture']) {
      if (M[k]) { M[k].envMap = env; M[k].envMapIntensity = (M[k].envMapIntensity || 0.5) * 1.1; }
    }
  }
  const root = new THREE.Group(); root.name = 'seongnamCityHall';
  // Procedural building as sync fallback (tests / GLB fail); replaced when GLB loads
  const building = buildBuilding(data, M);
  const buildingHost = new THREE.Group(); buildingHost.name = 'cityhallBuildingHost';
  buildingHost.add(building.group);
  root.add(buildingHost);
  root.add(buildGrounds(data, M));
  root.add(buildBanners(data, M));
  root.add(buildPond(data, M));
  const fountain = buildFountainComplex(data, M);
  root.add(fountain.group);
  root.add(buildLandscape(data, M));
  root.add(buildParking(data, M));
  root.add(buildVehicleGate(data, M));

  const stopEve = watchEvening((on) => {
    if (building.night) building.night.visible = on;
  });
  if (building.night) building.night.visible = false;

  let glbPending = null;
  if (glbUrl) {
    glbPending = import('./loadCityHallGlb.js').then(({ loadCityHallGlb }) =>
      loadCityHallGlb(glbUrl, { env: env || (typeof document !== 'undefined' ? makeEnvCube() : null) }).then((glb) => {
        if (!glb || disposed) return;
        // Place at building center (GLB origin = center)
        const p = data.building.pos;
        glb.position.set(p.x, 0, p.z);
        // Remove procedural massing
        building.group.removeFromParent();
        buildingHost.add(glb);
        recount();
      }).catch((e) => { console.warn('[cityhall] GLB load failed, keeping procedural', e); })
    );
  }

  let meshes = 0, instanced = 0;
  function recount() {
    meshes = 0; instanced = 0;
    root.traverse((o) => {
      if (o.isInstancedMesh) instanced++;
      else if (o.isMesh) meshes++;
    });
  }
  recount();

  let disposed = false;
  return {
    group: root,
    get stats() { return { name: 'seongnamCityHall', meshes, instanced }; },
    update(dt, t) { if (!disposed) fountain.update(t ?? performance.now() / 1000); },
    dispose() {
      if (disposed) return; disposed = true;
      stopEve(); fountain.disposeExtra?.();
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      root.removeFromParent();
      void glbPending;
    },
  };
}

export function disposeCityHallMaterials() {
  if (!shared) return;
  for (const v of Object.values(shared)) {
    if (v && v.isMaterial) {
      if (v.map) v.map.dispose();
      v.dispose();
    }
  }
  if (shared.env?.dispose) shared.env.dispose();
  shared = null;
}
