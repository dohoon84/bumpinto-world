// [cityhall] 성남시청 랜드마크 v6 — Blender GLB 본관 + 절차적 광장/분수/수목.
//   넓은 저층(~10층)·서측 접힌 파란 유리·중앙 사선 아트리움·동측 커튼월+흰 프레임·필로티·태양광
//   광장 화강암·배너 보행로·원형 연못·음악분수·데크·계단의자. 브랜드 로고 없음.
//   성능: 공유 재질 · 병합 · InstancedMesh · 소형 캔버스/큐브 env
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toShape } from '../../world.js';
import { vcMat, paint } from '../tileMesh.js';
import { watchEvening } from '../../evening.js';
import { addInstancedTrees } from '../../world/trees.js';

const C = {
  glassBlue: '#6bb8dc', glassTeal: '#6bb8dc', glassLite: '#6bb8dc',
  frame: '#e6eaee', frameDark: '#c5ced6', spandrel: '#d5dbe2',
  soffit: '#b8bec6', pilotis: '#f2f4f6', solar: '#1a2330', solarFrame: '#4a5560',
  plaza: '#ddd8ce', plazaDark: '#c2bdb2', lawn: '#5f9a58', lawnDark: '#4a7f45',
  path: '#b8b3a6', brick: '#a07058', brickDark: '#8a5a42', wood: '#5c4030', woodDark: '#3e2a1e',
  water: '#2a7fa8', waterDeep: '#154a66', pole: '#5a6068', banner: '#a0307f',
  hedge: '#3d6b3a', trunk: '#4a3428', foliage: '#3f7a38', pine: '#2d5a30',
  asphalt: '#5a5e64', line: '#e8e8e8', curb: '#9a9ea4', sculpture: '#2a6db5',
  kiosk: '#6fa86a', slantFace: '#4a9ec8', slantEdge: '#2e3540',
  eastSilver: '#e0e4e8', eastWindow: '#3d5a72',
  nightWarm: '#ffe3ad', nightCool: '#a8c8ff',
};

// Pilotis + end-core collision (matches tools/cityhall-blender/build_cityhall.py layout).
// Central N–S passage around x=1610.7 is intentionally pillar-free.
const CITYHALL_PILLARS = [
  [1536.8, -5908.7], [1557.0, -5908.7], [1577.2, -5908.7],
  [1637.9, -5908.7], [1658.1, -5908.7], [1678.3, -5908.7],
  [1542.7, -5941.0], [1568.6, -5941.0], [1594.6, -5941.0],
  [1646.5, -5941.0], [1672.4, -5941.0],
  [1526.7, -5916.6], [1526.7, -5933.3], [1688.4, -5916.6], [1688.4, -5933.3],
  [1509.7, -5873.0], [1509.7, -5893.0], [1509.7, -5913.0], [1509.7, -5933.0],
];
const CITYHALL_PILLAR_R = 0.55;
const CITYHALL_CORES = [
  { cx: 1531.7, cz: -5924.9, hx: 4.2, hz: 6.8 },
  { cx: 1683.4, cz: -5924.9, hx: 4.2, hz: 6.8 },
];

let shared = null;

/** Floor fountain active Jun–Aug (Seoul), or ?floorFountain=1|0 override. */
function isCityHallSummer() {
  if (typeof location !== 'undefined') {
    const v = new URLSearchParams(location.search).get('floorFountain');
    if (v === '1' || v === 'on') return true;
    if (v === '0' || v === 'off') return false;
  }
  const m = new Date().getMonth(); // 0-based
  return m >= 5 && m <= 7; // Jun–Aug
}



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
    steelHoneycomb: null,
    stonePlaza: null,
    steelPlate: S('#b8bcc2', { roughness: 0.4, metalness: 0.85, envMapIntensity: env ? 0.7 : 0 }),
    kiosk: S(C.kiosk, { roughness: 0.5, metalness: 0.2 }),
    slantFace: S(C.slantFace, { roughness: 0.55, metalness: 0.08 }),
    slantEdge: S(C.slantEdge, { roughness: 0.45, metalness: 0.05 }),
    eastFacade: null,
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
    // East silver frame + dark window rows (ref/04) — not blue glass
    shared.eastFacade = S(C.eastSilver, {
      map: canvasTex(256, 512, (x, w, h) => {
        x.fillStyle = '#e0e4e8'; x.fillRect(0, 0, w, h);
        const rows = 10;
        for (let i = 0; i < rows; i++) {
          const y = (i + 0.18) * (h / rows);
          const bh = h / rows * 0.38;
          x.fillStyle = '#3d5a72'; x.fillRect(6, y, w - 12, bh);
          x.fillStyle = '#d0d6dc'; x.fillRect(0, y + bh, w, h / rows * 0.35);
        }
        x.strokeStyle = '#c5ccd4'; x.lineWidth = 2;
        for (let i = 1; i < 8; i++) { x.beginPath(); x.moveTo(i * (w / 8), 0); x.lineTo(i * (w / 8), h); x.stroke(); }
      }, 4, 6),
      roughness: 0.48, metalness: 0.08, emissive: '#9aa3ac', emissiveIntensity: 0.18, envMapIntensity: env ? 0.35 : 0,
    });


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

    // Magenta/pink banners along promenade (ref/14·15) — abstract marks, no brand logo
    shared.banner = new THREE.MeshStandardMaterial({
      map: canvasTex(64, 128, (x, w, h) => {
        x.fillStyle = '#a0307f'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#f0a0d0'; x.fillRect(0, 0, w, 14);
        x.fillStyle = '#ffffff'; x.fillRect(10, 28, 44, 44);
        x.beginPath(); x.arc(32, 50, 14, 0, Math.PI * 2); x.fillStyle = '#a0307f'; x.fill();
        x.fillStyle = 'rgba(255,255,255,0.95)';
        x.fillRect(12, 84, 40, 8); x.fillRect(16, 98, 32, 6); x.fillRect(20, 112, 24, 6);
      }, 1, 1),
      side: THREE.DoubleSide, roughness: 0.7, metalness: 0.05, transparent: true,
    });
    shared._bannerTex = shared.banner.map;
    shared.jet.map = jetGradTex();
    shared.jet.needsUpdate = true;
    // ~13 cm cells: bright steel rims, transparent mouths (alphaTest)
    const hexMap = canvasTex(128, 128, (x, w, h) => {
      // Hex packing: opaque steel walls, fully transparent cell mouths (alphaTest)
      x.clearRect(0, 0, w, h);
      const cell = 42;
      const rowH = cell * 0.866;
      const rOut = 18, rIn = 11;
      for (let row = -1; row < h / rowH + 2; row++) {
        for (let col = -1; col < w / cell + 2; col++) {
          const cx = col * cell + (row & 1 ? cell * 0.5 : 0);
          const cy = row * rowH;
          x.beginPath();
          x.arc(cx, cy, rOut, 0, Math.PI * 2);
          x.arc(cx, cy, rIn, 0, Math.PI * 2, true);
          x.fillStyle = '#e8ecf2';
          x.fill();
          x.beginPath(); x.arc(cx, cy, rOut, 0, Math.PI * 2);
          x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 2; x.stroke();
        }
      }
    }, 1, 1);
    hexMap.colorSpace = THREE.SRGBColorSpace;
    shared.steelHoneycomb = new THREE.MeshStandardMaterial({
      color: '#d8dce2',
      map: hexMap,
      alphaMap: hexMap,
      alphaTest: 0.22,
      transparent: false,
      roughness: 0.32,
      metalness: 0.92,
      envMap: env,
      envMapIntensity: env ? 1.2 : 0,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    shared._honeycombTex = hexMap;
    shared.stonePlaza = S('#c8c2b6', {
      map: canvasTex(512, 512, (x, w, h) => {
        x.fillStyle = '#bdb6a8'; x.fillRect(0, 0, w, h);
        const n = 4; // large tiles so joints read at eye level
        const s = w / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const px = i * s, py = j * s;
          const v = ((i * 17 + j * 31) % 7) / 7;
          const r = 190 + v * 25, g = 184 + v * 18, b = 168 + v * 14;
          x.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
          x.fillRect(px + 3, py + 3, s - 6, s - 6);
          // deep mortar joint (high contrast so eye-level reads)
          x.fillStyle = '#7a7366';
          x.fillRect(px, py, s, 7); x.fillRect(px, py, 7, s);
          x.strokeStyle = '#6a6358'; x.lineWidth = 3;
          x.strokeRect(px + 2, py + 2, s - 4, s - 4);
          x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 1.5;
          x.beginPath(); x.moveTo(px + 6, py + 6); x.lineTo(px + s - 8, py + 6); x.stroke();
          // grit
          x.fillStyle = 'rgba(70,60,50,0.12)';
          for (let k = 0; k < 14; k++) {
            x.fillRect(px + 8 + (k * 37) % (s - 16), py + 8 + (k * 53) % (s - 16), 2 + (k % 3), 2);
          }
        }
      }, 1, 1), // UVs set in world meters on each plane
      roughness: 0.94, metalness: 0.02, envMapIntensity: env ? 0.1 : 0,
    });
    shared._stoneTex = shared.stonePlaza.map;
  } else {
    shared.glassCurtain = S(C.glassLite);
    shared.plaza = S(C.plaza);
    shared.banner = S(C.banner, { side: THREE.DoubleSide });
    shared.steelHoneycomb = S('#c4c8ce', { roughness: 0.35, metalness: 0.9 });
    shared.stonePlaza = S('#c8c2b6', { roughness: 0.92 });
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

  // Pilotis — sparse edge columns matching GLB; central passage clear (도훈 fountain3)
  for (const [px, pz] of CITYHALL_PILLARS) {
    if (px < xMin - 5 || px > xMax + 5) continue; // wing cols drawn with wing fallback only
    frameBag.cyl(px, pilotisH / 2, pz, 0.42, pilotisH, 10, C.pilotis);
  }

  // Long flat entrance canopy
  const canW = midX1 - westX1 + 10;
  frameBag.box((westX1 + midX1) / 2, canopyY, zMax + canopyDepth / 2 - 1, canW, 0.35, canopyDepth, 0, C.frame);
  frameBag.box((westX1 + midX1) / 2, canopyY - 0.2, zMax + canopyDepth / 2 - 1, canW - 0.4, 0.12, canopyDepth - 0.4, 0, C.soffit);

  // East end wall ABOVE pilotis only — G1 east face is sealed glass (도훈: no pale solid at undercroft)
  const eastWallX = xMax - 0.4;
  frameBag.box(eastWallX, (pilotisH + eastH) / 2, (zMin + zMax) / 2, 1.6, eastH - pilotisH, zMax - zMin - 1, 0, C.frame);
  // Horizontal slit windows on east end (upper floors only)
  for (let y = pilotisH + 2; y < eastH - 2; y += 3.8) {
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
  const eastCurtainMesh = new THREE.Mesh(eastCurtain, M.eastFacade || M.frame);
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
  // (north pilotis come from CITYHALL_PILLARS — central passage clear)
  frameBag.box((westX1 + midX1) / 2, 7.2, zMin - 2.5, midX1 - westX1 + 6, 0.3, 5, 0, C.frame);

  // Low glass base along south plaza — only sealed lobby; leave east passage clear (도훈 walk-through)
  {
    const passX0 = midX1 + 22;
    const bw = passX0 - xMin - 2;
    if (bw > 2) {
      const baseGlass = new THREE.PlaneGeometry(bw, 3.2, 1, 1);
      baseGlass.translate((xMin + passX0) / 2, 2.0, zMax + 0.5);
      const baseMesh = new THREE.Mesh(baseGlass, M.glassLite);
      baseMesh.name = 'cityhallBaseGlass'; baseMesh.castShadow = false; g.add(baseMesh);
    }
  }

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

  // SE granite plaza near building (ref/04) — stop WEST of pond so D-basin reads full (ref/04·12)
  const plaza = [
    [xMin - 8, zMax + 0.3], [1688, zMax + 0.3],
    [1688, zMax + 48], [xMin - 5, zMax + 65],
  ];
  {
    // [p6] merge plaza into vc bag (1 draw with lawns/paths)
    bag.push(paintFaces(extrude(plaza, [], 0.08, 0.16), C.plaza, C.plazaDark));
  }

  // Lawns — open green beside SE approach (ref/12): west of pond, both sides of promenade
  const lawnSE = [[xMax + 2, zMax + 4], [xMax + 55, zMax + 6], [xMax + 72, zMax + 78], [xMax + 4, zMax + 70]];
  bag.push(paintFaces(extrude(lawnSE, [], 0.12, 0.18), C.lawn, C.lawnDark));
  // Explicit lawn band between promenade and pond (ref/11·12)
  // Keep lawn east of entrance promenade only (도훈: 입구쪽 길엔 잔디 없음)
  const lawnPathPond = [[1678, -5910], [1700, -5868], [1708, -5875], [1708, -5935], [1685, -5935]];
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

  // One clear straight paved strip → city hall (ref/12): consistent width, lawn both sides
  const pr = data.promenade;
  {
    const dx = pr.to[0] - pr.from[0], dz = pr.to[1] - pr.from[1], L = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
    bag.box((pr.from[0] + pr.to[0]) / 2, 0.09, (pr.from[1] + pr.to[1]) / 2, L, 0.14, pr.width, -ang, '#d8d2c6');
    const ux = dx / L, uz = dz / L, px = -uz, pz = ux;
    for (const side of [-1, 1]) {
      bag.box(
        (pr.from[0] + pr.to[0]) / 2 + px * side * (pr.width / 2 + 0.15),
        0.12,
        (pr.from[1] + pr.to[1]) / 2 + pz * side * (pr.width / 2 + 0.15),
        L, 0.08, 0.35, -ang, C.curb,
      );
    }
  }

  // 입구쪽 길 — 잔디 플랭크 제거, 포장으로 (도훈: "입구쪽 길엔 원래 잔디 없음")
  {
    const dx = pr.to[0] - pr.from[0], dz = pr.to[1] - pr.from[1], L = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dz, dx);
    // wider paved apron around entrance promenade (replaces lawn flanks in the red oval)
    bag.box((pr.from[0] + pr.to[0]) / 2, 0.07, (pr.from[1] + pr.to[1]) / 2, L + 4, 0.1, pr.width + 14, -ang, C.plaza);
  }

  // Pink/brick strip crossing (kept, sits on plaza now)
  {
    const bx0 = 1660, bz0 = -5865, bx1 = 1710, bz1 = -5872;
    const dx = bx1 - bx0, dz = bz1 - bz0, L = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
    bag.box((bx0 + bx1) / 2, 0.14, (bz0 + bz1) / 2, L, 0.1, 2.6, -ang, C.brick);
  }

  // --- East of fountain: 산책길 + 담벼락 (parallel to primary road ~x=1800) ---
  // Path runs N–S between pond apron and road; wall on road edge.
  const eastPath = { x: 1756, z0: -5978, z1: -5855, w: 4.2 };
  {
    bag.box(eastPath.x, 0.09, (eastPath.z0 + eastPath.z1) / 2, eastPath.w, 0.12, Math.abs(eastPath.z1 - eastPath.z0), 0, '#d4cfc4');
    // curb lines
    bag.box(eastPath.x - eastPath.w / 2 - 0.15, 0.12, (eastPath.z0 + eastPath.z1) / 2, 0.3, 0.08, Math.abs(eastPath.z1 - eastPath.z0), 0, C.curb);
    bag.box(eastPath.x + eastPath.w / 2 + 0.15, 0.12, (eastPath.z0 + eastPath.z1) / 2, 0.3, 0.08, Math.abs(eastPath.z1 - eastPath.z0), 0, C.curb);
  }
  // 담벼락 along road edge (outermost)
  const wallX = 1788, wallZ0 = -5985, wallZ1 = -5845, wallH = 1.85;
  {
    bag.box(wallX, wallH / 2, (wallZ0 + wallZ1) / 2, 0.45, wallH, Math.abs(wallZ1 - wallZ0), 0, '#8b929a');
    // posts every ~8 m
    for (let z = wallZ0 + 2; z < wallZ1; z += 8) {
      bag.box(wallX, wallH / 2 + 0.1, z, 0.5, wallH + 0.2, 0.5, 0, '#7e848c');
    }
  }

  // --- 여러갈래길: junction in lower (SE) lawn, paths fanning to plaza / east promenade ---
  {
    const jx = 1688, jz = -5868; // junction
    const spokes = [
      [jx, jz, 1655, -5905], // toward plaza / building SE
      [jx, jz, 1705, -5915], // toward pond south apron
      [jx, jz, 1748, -5888], // toward east promenade
      [jx, jz, 1720, -5845], // toward NE approach
      [jx, jz, 1660, -5840], // toward entrance approach
    ];
    for (const [ax, az, bx, bz] of spokes) {
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, ang = Math.atan2(dz, dx);
      bag.box((ax + bx) / 2, 0.11, (az + bz) / 2, L, 0.12, 3.4, -ang, C.plaza);
    }
    // small paved junction pad
    bag.box(jx, 0.11, jz, 6.5, 0.1, 6.5, 0, C.plaza);
  }

  const body = bag.mesh(M.vc, 'cityhallGroundBody'); if (body) g.add(body);

  // Instanced benches along east promenade (점선처럼 띄엄띄엄) — plaza side of path
  const benchN = 9;
  const seatGeo = new THREE.BoxGeometry(2.2, 0.09, 0.56);
  const backGeo = new THREE.BoxGeometry(2.2, 0.42, 0.08);
  const legGeo = new THREE.BoxGeometry(0.1, 0.44, 0.52);
  const woodMat = new THREE.MeshLambertMaterial({ color: '#8d6e63' });
  const ironMat = new THREE.MeshLambertMaterial({ color: '#343a40' });
  const seatIM = new THREE.InstancedMesh(seatGeo, woodMat, benchN);
  const backIM = new THREE.InstancedMesh(backGeo, woodMat, benchN);
  const legLIM = new THREE.InstancedMesh(legGeo, ironMat, benchN * 2);
  seatIM.name = 'cityhallPromenadeBenches';
  const dummy = new THREE.Object3D();
  let li = 0;
  const promenadeBenches = [];
  for (let i = 0; i < benchN; i++) {
    const t = (i + 0.5) / benchN;
    const z = eastPath.z0 + (eastPath.z1 - eastPath.z0) * t;
    const x = eastPath.x - eastPath.w / 2 - 1.6; // plaza (west) side
    const yaw = Math.PI / 2; // face the path (+X)
    promenadeBenches.push({ x, z, ry: yaw, y: 0.44 });
    dummy.position.set(x, 0.44, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    seatIM.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 0.72, z); dummy.rotation.set(-0.12, yaw, 0); // slight back tilt in local X after yaw
    // apply yaw then offset back locally (-Z local → -X world when yaw=PI/2)
    dummy.position.set(x - 0.24, 0.72, z); dummy.rotation.set(0, yaw, 0); dummy.updateMatrix();
    backIM.setMatrixAt(i, dummy.matrix);
    for (const sz of [-0.9, 0.9]) {
      dummy.position.set(x, 0.22, z + sz); dummy.rotation.set(0, yaw, 0); dummy.updateMatrix();
      // legs along bench length (world Z when facing +X)
      dummy.position.set(x, 0.22, z + sz); dummy.updateMatrix();
      legLIM.setMatrixAt(li++, dummy.matrix);
    }
  }
  seatIM.castShadow = backIM.castShadow = true;
  g.add(seatIM, backIM, legLIM);
  // stash wall extents for isBlocked via userData on group
  g.userData.eastWall = { x: wallX, z0: wallZ0, z1: wallZ1, halfW: 0.45 };
  g.userData.promenadeBenches = promenadeBenches;
  g.userData.benchMats = [woodMat, ironMat];
  g.userData.benchGeos = [seatGeo, backGeo, legGeo];

  return g;
}


function buildSeongnamSign(data, M) {
  // Photo-spot '성남' magenta outline — ~3 m frame, plinth ~4×0.8 m (ref/14·15); off spawn, face walkway
  const g = new THREE.Group(); g.name = 'cityhallSeongnamSign';
  const pr = data.promenade;
  const dx = pr.to[0] - pr.from[0], dz = pr.to[1] - pr.from[1], L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  // Further toward building (t~0.72), east lawn — not on typical eye-spawn mid-path
  const tAlong = 0.58;
  const sx = pr.from[0] + dx * tAlong + px * (pr.width / 2 + 10.5);
  const sz = pr.from[1] + dz * tAlong + pz * (pr.width / 2 + 10.5);
  // Face the walkway (toward path center)
  const faceYaw = Math.atan2(-px, -pz);

  // Dark charcoal plinth ~4 m wide × 0.8 m high (ref/15)
  const plinthMat = new THREE.MeshStandardMaterial({ color: '#2a2e34', roughness: 0.88, metalness: 0.05 });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.8, 1.5), plinthMat);
  plinth.position.set(sx, 0.4, sz);
  plinth.rotation.y = faceYaw;
  plinth.castShadow = true; plinth.receiveShadow = true;
  g.add(plinth);

  const faceH = 3.0; // ~3 m frame + hanging ㅇ ≈ 3.4 m total (ref/15)
  const faceY = 0.8 + faceH / 2;
  if (typeof document !== 'undefined' && document.createElementNS) {
    const tex = new THREE.TextureLoader().load('/corridor/cityhall/seongnam-sign.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const faceMat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, alphaTest: 0.12,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.6, faceH), faceMat);
    face.position.set(sx, faceY, sz);
    face.rotation.y = faceYaw;
    face.renderOrder = 3;
    g.add(face);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3.6, faceH), faceMat);
    back.position.set(
      sx - Math.sin(faceYaw) * 0.06,
      faceY,
      sz - Math.cos(faceYaw) * 0.06,
    );
    back.rotation.y = faceYaw + Math.PI;
    back.renderOrder = 3;
    g.add(back);
  }
  // Solid magenta ring backup
  const mag = new THREE.MeshBasicMaterial({ color: '#a0307f' });
  const ring = new THREE.Group();
  const thrk = 0.14, fw = 3.2, fh = 2.45;
  for (const [wx, wy, sx_, sy_] of [
    [0, fh / 2, fw, thrk], [0, -fh / 2, fw, thrk], [-fw / 2, 0, thrk, fh], [fw / 2, 0, thrk, fh],
  ]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx_, sy_, 0.14), mag);
    b.position.set(wx, wy, 0); ring.add(b);
  }
  const tor = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 8, 20), mag);
  tor.position.set(-0.7, -fh / 2 - 0.42, 0); ring.add(tor);
  ring.position.set(sx, faceY, sz);
  ring.rotation.y = faceYaw;
  g.add(ring);
  return g;
}

function buildBanners(data, M) {
  // Slim poles ~0.12 m dia, ~4.5 m tall; small fabric ~0.5×1.5 m near top; ~9 m spacing (ref/12·15)
  const g = new THREE.Group(); g.name = 'cityhallBanners';
  const pr = data.promenade;
  const dx = pr.to[0] - pr.from[0], dz = pr.to[1] - pr.from[1], L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  const spacing = 9;
  const n = Math.max(4, Math.floor(L / spacing));
  const poleH = 4.5;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.06, poleH, 8), M.pole, n * 2 + 4);
  const banners = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 1.5), M.banner, n * 2 + 4);
  const dummy = new THREE.Object3D();
  let i = 0;
  for (const side of [-1, 1]) {
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = pr.from[0] + dx * t + px * side * (pr.width / 2 + 0.9);
      const z = pr.from[1] + dz * t + pz * side * (pr.width / 2 + 0.9);
      dummy.position.set(x, poleH / 2, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      // Small vertical banner near top of pole
      dummy.position.set(x + px * side * 0.12, poleH - 0.95, z + pz * side * 0.12);
      dummy.rotation.set(0, Math.atan2(px * side, pz * side), 0);
      dummy.updateMatrix();
      banners.setMatrixAt(i, dummy.matrix);
      i++;
    }
  }
  poles.count = i; banners.count = i;
  poles.castShadow = true; g.add(poles, banners);
  return g;
}

function buildPond(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallPond';
  const bag = Bag();
  // Wide rounded D / half-moon (ref/04) — smooth semicircle outer edge, NOT triangle / ribbon
  // Flat west lip along east facade; east bulge = semicircle radius ≈ half chord
  const bx = 1694;
  const z0 = -5948; // northish (more −Z)
  const z1 = -5896; // southish
  const zMid = (z0 + z1) / 2;
  const halfLen = Math.abs(z1 - z0) / 2; // ~26 m
  const R = halfLen; // circular half-moon → bulge ≈ 26 m (~1/3 of ~70 m east face)
  const ring = [];
  // Flat west edge (building side), north → south
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    ring.push([bx, z0 + (z1 - z0) * t]);
  }
  // Smooth semicircle outer arc south → north (CCW close), 32 samples
  for (let i = 1; i < 32; i++) {
    const t = i / 32;
    const ang = Math.PI / 2 - t * Math.PI; // +90° (south) → −90° (north) through east (0°)
    ring.push([bx + R * Math.cos(ang), zMid + R * Math.sin(ang)]);
  }
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const cz = zs.reduce((a, b) => a + b, 0) / zs.length;

  // Stone rim
  band(bag, ring, 0.12, 0.48, 0.7, 0.85, C.curb, { minLen: 0.5 });
  // Filled water basin
  bag.push(paintFaces(extrude(ring, [], 0.04, 0.3), C.waterDeep, C.water, C.waterDeep));
  const waterMesh = new THREE.Mesh(extrude(ring, [], 0.26, 0.36), M.water);
  waterMesh.name = 'cityhallDPond'; g.add(waterMesh);
  const edgeBody = bag.mesh(M.vc, 'cityhallPondEdge'); if (edgeBody) g.add(edgeBody);

  // Path along flat west lip
  for (let i = 0; i < 12; i++) {
    const t0 = i / 12, t1 = (i + 1) / 12;
    const za = z0 + (z1 - z0) * t0, zb = z0 + (z1 - z0) * t1;
    const x0 = bx - 3.0, x1 = bx - 3.0;
    const ddx = x1 - x0, ddz = zb - za, LL = Math.hypot(ddx, ddz) || 1, ang = Math.atan2(ddz, ddx || 0.001);
    bag.box((x0 + x1) / 2, 0.1, (za + zb) / 2, Math.max(LL, 0.5), 0.1, 2.4, -ang, C.path);
  }
  // No east arc pavers (were reading as grey lawn blocks in eye shots)
  const pathM = bag.mesh(M.vc, 'cityhallPondPath'); if (pathM) g.add(pathM);

  // Sculpture near NW of pond (plaza side)
  const sc = data.pond?.sculpture || { x: bx - 10, z: zMid + 8 };
  const sbag = Bag();
  sbag.cyl(sc.x, 0.35, sc.z, 0.85, 0.7, 10, C.curb);
  const wing = new THREE.SphereGeometry(1.5, 10, 8, 0, Math.PI);
  wing.scale(1, 0.35, 0.7); wing.rotateZ(0.5); wing.translate(sc.x - 0.6, 2.3, sc.z);
  sbag.push(wing, C.sculpture);
  const wing2 = new THREE.SphereGeometry(1.5, 10, 8, 0, Math.PI);
  wing2.scale(1, 0.35, 0.7); wing2.rotateZ(-0.5); wing2.rotateY(Math.PI); wing2.translate(sc.x + 0.6, 2.3, sc.z);
  sbag.push(wing2, C.sculpture);
  sbag.cyl(sc.x, 1.5, sc.z, 0.15, 2.3, 6, C.sculpture);
  const sm = sbag.mesh(M.vc, 'cityhallSculpture'); if (sm) g.add(sm);
  return g;
}

function pondGeom() {
  // Shared D-pond params (must match buildPond)
  const bx = 1694, z0 = -5948, z1 = -5896;
  const zMid = (z0 + z1) / 2;
  const R = Math.abs(z1 - z0) / 2;
  const ring = [];
  for (let i = 0; i <= 8; i++) ring.push([bx, z0 + (z1 - z0) * (i / 8)]);
  for (let i = 1; i < 32; i++) {
    const t = i / 32, ang = Math.PI / 2 - t * Math.PI;
    ring.push([bx + R * Math.cos(ang), zMid + R * Math.sin(ang)]);
  }
  return { bx, z0, z1, zMid, R, ring };
}

/** Music-fountain plaza around the east D-pond (도훈 marked4 mockup). */
function buildPondMusicPlaza(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallPondPlaza';
  const { bx, z0, z1, zMid, R, ring } = pondGeom();
  const bag = Bag();
  const dummy = new THREE.Object3D();

  // --- ② Low railing along curved edge (knee ~1.0 m) + collision helpers ---
  const railH = 1.0, railY = railH / 2;
  const postR = 0.04;
  const railPts = [];
  for (let i = 0; i <= 36; i++) {
    const t = i / 36;
    const ang = Math.PI / 2 - t * Math.PI;
    railPts.push([bx + (R + 0.35) * Math.cos(ang), zMid + (R + 0.35) * Math.sin(ang), ang]);
  }
  for (let i = 0; i < railPts.length; i++) {
    const [x, z] = railPts[i];
    bag.cyl(x, railY, z, postR, railH, 5, C.pole);
    if (i < railPts.length - 1) {
      const [x2, z2] = railPts[i + 1];
      const dx = x2 - x, dz = z2 - z, L = Math.hypot(dx, dz) || 1;
      const ang = Math.atan2(dz, dx);
      bag.box((x + x2) / 2, railH * 0.92, (z + z2) / 2, L, 0.05, 0.05, -ang, C.pole);
      bag.box((x + x2) / 2, railH * 0.55, (z + z2) / 2, L, 0.04, 0.04, -ang, C.pole);
    }
  }
  // Also short returns at chord ends so players can't slip in at tips
  bag.box(bx + 0.6, railY, z0, 1.4, railH, 0.08, 0, C.pole);
  bag.box(bx + 0.6, railY, z1, 1.4, railH, 0.08, 0, C.pole);

  // --- ③ Wooden deck — middle of curve only (ends = lawn per red strike-through) ---
  // Arc t in [0.20, 0.78] → skip north tip (building) and south tip (chord)
  const deckBag = Bag();
  const deckInner = R + 0.7, deckOuter = R + 5.2;
  const deckT0 = 0.20, deckT1 = 0.78;
  const deckSegs = 18;
  for (let i = 0; i < deckSegs; i++) {
    const t0 = deckT0 + (deckT1 - deckT0) * (i / deckSegs);
    const t1 = deckT0 + (deckT1 - deckT0) * ((i + 1) / deckSegs);
    const a0 = Math.PI / 2 - t0 * Math.PI, a1 = Math.PI / 2 - t1 * Math.PI;
    const ringDeck = [
      [bx + deckInner * Math.cos(a0), zMid + deckInner * Math.sin(a0)],
      [bx + deckInner * Math.cos(a1), zMid + deckInner * Math.sin(a1)],
      [bx + deckOuter * Math.cos(a1), zMid + deckOuter * Math.sin(a1)],
      [bx + deckOuter * Math.cos(a0), zMid + deckOuter * Math.sin(a0)],
    ];
    deckBag.push(paintFaces(extrude(ringDeck, [], 0.28, 0.44), C.wood, C.woodDark, C.woodDark));
  }
  // plank lines (cheap)
  for (let i = 0; i < 14; i++) {
    const t = deckT0 + (deckT1 - deckT0) * ((i + 0.5) / 14);
    const ang = Math.PI / 2 - t * Math.PI;
    const x = bx + ((deckInner + deckOuter) / 2) * Math.cos(ang);
    const z = zMid + ((deckInner + deckOuter) / 2) * Math.sin(ang);
    deckBag.box(x, 0.45, z, 0.05, 0.02, deckOuter - deckInner - 0.3, -ang, C.woodDark);
  }
  const deckM = deckBag.mesh(M.vc, 'cityhallPondDeck'); if (deckM) g.add(deckM);

  // --- ④ ㄱ자 3-tier stone seating + ⑤ aisle stairs ---
  // North leg (top): west→east, facing south toward pond
  // East leg (right): north→south, facing west toward pond
  const seatBag = Bag();
  const tierH = 0.44, tierD = 1.85; // sit-friendly step (~0.4–0.45 m)
  // Strong aerial contrast (marked4 tan stone vs green lawn)
  const stoneA = '#d9d0c0', stoneB = '#9a9080';
  // North leg
  const nLegZ0 = z0 - 2.8; // closest to pond (south face of seats)
  const nLegX0 = bx + 4, nLegX1 = bx + R + 18;
  // East leg — longer so ㄱ reads from aerial
  const eLegX0 = bx + R + 4.5; // closest to pond
  const eLegZ0 = z0 - 2.0, eLegZ1 = zMid + 16;

  function addTierRow(alongAxis, /* 'x' or 'z' */ a0, a1, fixed, outwardSign, facingPond) {
    // alongAxis grows along the leg; fixed is the pond-side coordinate of tier 0 front
    for (let t = 0; t < 3; t++) {
      const y = tierH * (t + 0.5);
      const depthOff = outwardSign * (t + 0.5) * tierD;
      const col = t % 2 ? stoneB : stoneA;
      if (alongAxis === 'x') {
        seatBag.box((a0 + a1) / 2, y, fixed + depthOff, a1 - a0, tierH, tierD - 0.06, 0, col);
      } else {
        seatBag.box(fixed + depthOff, y, (a0 + a1) / 2, tierD - 0.06, tierH, a1 - a0, 0, col);
      }
    }
  }
  addTierRow('x', nLegX0, nLegX1, nLegZ0, -1); // north of pond → outward is -Z
  addTierRow('z', eLegZ0, eLegZ1, eLegX0, +1); // east of pond → outward is +X

  // Corner fill where legs meet (NE)
  for (let t = 0; t < 3; t++) {
    const y = tierH * (t + 0.5);
    const ox = eLegX0 + (t + 0.5) * tierD;
    const oz = nLegZ0 - (t + 0.5) * tierD;
    seatBag.box(ox, y, oz, tierD - 0.06, tierH, tierD - 0.06, 0, t % 2 ? stoneB : stoneA);
  }

  // Aisle stairs — 2 per leg (lighter stone)
  function cutStairsX(cx, zFront, outwardSign) {
    // stairs rising away from pond through 3 tiers
    for (let s = 0; s < 3; s++) {
      const y = tierH * (s + 0.5);
      seatBag.box(cx, y, zFront + outwardSign * (s + 0.5) * tierD, 1.4, tierH * 0.95, tierD - 0.1, 0, C.path);
    }
  }
  function cutStairsZ(cz, xFront, outwardSign) {
    for (let s = 0; s < 3; s++) {
      const y = tierH * (s + 0.5);
      seatBag.box(xFront + outwardSign * (s + 0.5) * tierD, y, cz, tierD - 0.1, tierH * 0.95, 1.4, 0, C.path);
    }
  }
  const nSpan = nLegX1 - nLegX0;
  cutStairsX(nLegX0 + nSpan * 0.33, nLegZ0, -1);
  cutStairsX(nLegX0 + nSpan * 0.72, nLegZ0, -1);
  const eSpan = eLegZ1 - eLegZ0;
  cutStairsZ(eLegZ0 + eSpan * 0.30, eLegX0, +1);
  cutStairsZ(eLegZ0 + eSpan * 0.68, eLegX0, +1);

  const seatM = seatBag.mesh(M.vc, 'cityhallPondSeats'); if (seatM) g.add(seatM);

  const railM = bag.mesh(M.vc, 'cityhallPondRail'); if (railM) g.add(railM);

  // --- ⑥ Lawn strip: existing world tree assets (addInstancedTrees) — same as street/park trees ---
  // Keep clear of seating / eye sightline toward fountain (trees only SE/E of mid-deck)
  const treePts = [], bushPts = [];
  let seed = 7919;
  const rnd01 = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 16; i++) {
    const t = 0.28 + 0.50 * ((i + 0.5) / 16); // mid-south arc — avoid north seating sightline
    const ang = Math.PI / 2 - t * Math.PI;
    const rad = deckOuter + 3.5 + rnd01() * 3.2;
    const x = bx + rad * Math.cos(ang) + (rnd01() - 0.5) * 1.4;
    const z = zMid + rad * Math.sin(ang) + (rnd01() - 0.5) * 1.2;
    if (z < z0 + 2) continue; // clear north/ㄱ seating
    if (x < bx + R * 0.35) continue;
    treePts.push([x, z]);
  }
  for (let i = 0; i < 22; i++) {
    const t = 0.30 + 0.48 * ((i + 0.5) / 22);
    const ang = Math.PI / 2 - t * Math.PI;
    const rad = deckOuter + 1.6 + rnd01() * 2.4;
    const x = bx + rad * Math.cos(ang) + (rnd01() - 0.5) * 1.0;
    const z = zMid + rad * Math.sin(ang) + (rnd01() - 0.5) * 0.9;
    if (z < z0 + 4) continue;
    if (x < bx + R * 0.4) continue;
    bushPts.push([x, z]);
  }
  // Street-tree scale (corridor tileMesh defaults) + smaller shrub scale of same asset
  const treeInst = addInstancedTrees(g, treePts, {
    rnd: rnd01,
    crownRadius: 2.0, crownY: 4.6, trunkTop: 0.18, trunkBottom: 0.26, trunkHeight: 3.2,
    trunkColor: '#8a6b4e', scaleMin: 0.7, scaleSpan: 0.4,
  });
  const bushInst = addInstancedTrees(g, bushPts, {
    rnd: rnd01,
    crownRadius: 0.95, crownY: 1.55, trunkTop: 0.1, trunkBottom: 0.14, trunkHeight: 1.1,
    trunkColor: '#8a6b4e', scaleMin: 0.55, scaleSpan: 0.35,
  });
  if (treeInst) {
    treeInst.crowns.name = 'cityhallPondTreeCrowns';
    treeInst.trunks.name = 'cityhallPondTreeTrunks';
  }
  if (bushInst) {
    bushInst.crowns.name = 'cityhallPondBushCrowns';
    bushInst.trunks.name = 'cityhallPondBushTrunks';
  }

  // --- ① Colour jets: main line on chord + 2 shorter aux rows toward curve ---
  const MAIN_N = 26, AUX1_N = 14, AUX2_N = 10;
  const TOTAL = MAIN_N + AUX1_N + AUX2_N;
  // Shared additive jet material (recolour via material.color — cheap, one draw for all if same mat)
  // Use instanceColor for per-jet rainbow
  // Opaque-ish coloured columns (NormalBlending) so rainbow reads day+night — not washed additive white
  const jetMat = new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0.92, depthWrite: false,
    blending: THREE.NormalBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  jetMat.name = 'PondJet';
  const jetGeo = new THREE.PlaneGeometry(0.42, 1);
  jetGeo.translate(0, 0.5, 0);
  // 2 crossed planes per jet
  const jets = new THREE.InstancedMesh(jetGeo, jetMat, TOTAL * 2);
  jets.name = 'cityhallPondJets'; jets.frustumCulled = false;
  // instance colors
  const colorArr = new Float32Array(TOTAL * 2 * 3);
  jets.instanceColor = new THREE.InstancedBufferAttribute(colorArr, 3);
  g.add(jets);

  const seeds = [];
  const pushSeed = (x, z, hMax, phase) => { seeds.push({ x, z, hMax, phase }); };
  for (let i = 0; i < MAIN_N; i++) {
    const t = (i + 0.5) / MAIN_N;
    pushSeed(bx + 1.6, z0 + 3 + t * (z1 - z0 - 6), 9.0 + (i % 5) * 0.7, i / MAIN_N);
  }
  for (let i = 0; i < AUX1_N; i++) {
    const t = 0.12 + 0.76 * ((i + 0.5) / AUX1_N);
    pushSeed(bx + 5.2, z0 + 3 + t * (z1 - z0 - 6), 3.2 + (i % 3) * 0.35, 0.3 + i / AUX1_N);
  }
  for (let i = 0; i < AUX2_N; i++) {
    const t = 0.2 + 0.6 * ((i + 0.5) / AUX2_N);
    pushSeed(bx + 8.8, z0 + 3 + t * (z1 - z0 - 6), 2.0 + (i % 2) * 0.3, 0.55 + i / AUX2_N);
  }

  const tmpC = new THREE.Color();
  function rainbow(u) {
    // vivid saturated rainbow (bright enough at night without additive wash)
    tmpC.setHSL((u % 1), 1.0, 0.52);
    return tmpC;
  }

  function update(t) {
    const nightBoost = 1; // colour always on for this plaza (music fountain identity)
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.4 + s.phase * Math.PI * 2));
      const h = Math.max(0.4, s.hMax * pulse);
      const hue = (s.phase * 0.85 + t * 0.15) % 1;
      const col = rainbow(hue);
      const w = 0.55 + (i < MAIN_N ? 0.25 : 0.08);
      dummy.position.set(s.x, 0.32, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(w, h, 1);
      dummy.updateMatrix();
      jets.setMatrixAt(i * 2, dummy.matrix);
      jets.setColorAt(i * 2, col);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.updateMatrix();
      jets.setMatrixAt(i * 2 + 1, dummy.matrix);
      jets.setColorAt(i * 2 + 1, col);
    }
    jets.count = seeds.length * 2;
    jets.instanceMatrix.needsUpdate = true;
    if (jets.instanceColor) jets.instanceColor.needsUpdate = true;
    jetMat.opacity = 0.88 + 0.1 * (0.5 + 0.5 * Math.sin(t * 1.5));
    jetMat.color.setRGB(1, 1, 1);
  }

  // Collision: block inside pond water + near railing arc
  function isBlocked(x, z, r = 0.4) {
    // Inside D water (slightly inset)
    if (inRing(x, z, ring)) {
      // allow west lip path (outside water toward building)
      if (x < bx + 0.4) return false;
      return true;
    }
    // Near railing posts (curved edge band)
    const dx = x - bx, dz = z - zMid;
    const dist = Math.hypot(dx, dz);
    if (dist > R - 0.2 && dist < R + 1.1) {
      // only on the eastern semicircle (x >= bx)
      if (x >= bx - 0.5) {
        const ang = Math.atan2(dz, dx); // -PI..PI, east=0
        if (ang > -Math.PI / 2 - 0.15 && ang < Math.PI / 2 + 0.15) return true;
      }
    }
    return false;
  }

  // Kick one frame so jets visible before first update
  update(0);

  // --- Surface height: wooden deck + ㄱ tiers (도훈: legs were sinking) ---
  const DECK_Y = 0.44; // match plank top (~0.43)
  // Avatar leg capsules end ~0.04 above group origin — stand slightly lower so soles kiss the surface
  const FOOT_EPS = 0.03;
  const TIER_TOP = (ti) => tierH * (ti + 1);

  function onDeck(x, z) {
    const dx = x - bx, dz = z - zMid;
    const dist = Math.hypot(dx, dz);
    if (dist < deckInner - 0.05 || dist > deckOuter + 0.15) return false;
    if (x < bx - 0.2) return false;
    const ang = Math.atan2(dz, dx);
    const tt = (Math.PI / 2 - ang) / Math.PI;
    return tt >= deckT0 - 0.02 && tt <= deckT1 + 0.02;
  }

  function tierHeightAt(x, z) {
    let best = null;
    if (x >= nLegX0 - 0.15 && x <= nLegX1 + 0.15) {
      for (let ti = 0; ti < 3; ti++) {
        const zc = nLegZ0 - (ti + 0.5) * tierD;
        if (Math.abs(z - zc) <= tierD * 0.5 + 0.1) {
          const y = TIER_TOP(ti);
          if (best == null || y > best) best = y;
        }
      }
    }
    if (z >= eLegZ0 - 0.15 && z <= eLegZ1 + 0.15) {
      for (let ti = 0; ti < 3; ti++) {
        const xc = eLegX0 + (ti + 0.5) * tierD;
        if (Math.abs(x - xc) <= tierD * 0.5 + 0.1) {
          const y = TIER_TOP(ti);
          if (best == null || y > best) best = y;
        }
      }
    }
    for (let ti = 0; ti < 3; ti++) {
      const ox = eLegX0 + (ti + 0.5) * tierD;
      const oz = nLegZ0 - (ti + 0.5) * tierD;
      if (Math.abs(x - ox) <= tierD * 0.5 + 0.1 && Math.abs(z - oz) <= tierD * 0.5 + 0.1) {
        const y = TIER_TOP(ti);
        if (best == null || y > best) best = y;
      }
    }
    return best;
  }

  function groundHeight(x, z) {
    let y = null;
    const th = tierHeightAt(x, z);
    if (th != null) y = th;
    if (onDeck(x, z)) y = y == null ? DECK_Y : Math.max(y, DECK_Y);
    return y == null ? null : y - FOOT_EPS;
  }

  function findSeat(px, pz) {
    const Rseat = 1.75;
    let best = null, bestD = Rseat;
    const nSpan = nLegX1 - nLegX0;
    for (const frac of [0.2, 0.38, 0.55, 0.72, 0.88]) {
      for (let ti = 0; ti < 3; ti++) {
        const sx = nLegX0 + nSpan * frac;
        const sz = nLegZ0 - (ti + 0.32) * tierD;
        const d = Math.hypot(px - sx, pz - sz);
        if (d < bestD) {
          bestD = d;
          best = {
            kind: 'bench',
            label: '🪑 분수 계단 좌석에 앉기 (C)',
            x: sx, z: sz, y: TIER_TOP(ti),
            ry: 0,
            exitX: sx, exitZ: nLegZ0 + 1.3,
          };
        }
      }
    }
    const eSpan = eLegZ1 - eLegZ0;
    for (const frac of [0.2, 0.38, 0.55, 0.72, 0.88]) {
      for (let ti = 0; ti < 3; ti++) {
        const sz = eLegZ0 + eSpan * frac;
        const sx = eLegX0 + (ti + 0.32) * tierD;
        const d = Math.hypot(px - sx, pz - sz);
        if (d < bestD) {
          bestD = d;
          best = {
            kind: 'bench',
            label: '🪑 분수 계단 좌석에 앉기 (C)',
            x: sx, z: sz, y: TIER_TOP(ti),
            ry: -Math.PI / 2,
            exitX: eLegX0 - 1.3, exitZ: sz,
          };
        }
      }
    }
    return best;
  }

  return {
    group: g,
    update,
    isBlocked,
    groundHeight,
    findSeat,
    disposeExtra: () => { jetGeo.dispose(); jetMat.dispose(); },
  };
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
  const pondCx = 1708, pondCz = -5922, pondR = 36;
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

  // No hedge boxes along promenade (ref/12·15 — open lawn; grey rect blocks removed)
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



/** West-plaza honeycomb-steel walking figure (~8.5 m).
 *  Body/pedestals from Blender Draco GLB (tools/cityhall-blender/build_walker.py);
 *  honeycomb via ~13 cm hex-cell alphaTest map + world-projected UVs. ≤3 draws.
 */
function applyHoneycombUVs(geo, cell = 0.13) {
  const pos = geo.attributes.position;
  if (!pos) return;
  const n = pos.count;
  const uv = new Float32Array(n * 2);
  const nor = geo.attributes.normal;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // Triplanar: pick dominant axis from normal (fallback Y/X)
    let nx = 0, ny = 1, nz = 0;
    if (nor) { nx = Math.abs(nor.getX(i)); ny = Math.abs(nor.getY(i)); nz = Math.abs(nor.getZ(i)); }
    if (ny >= nx && ny >= nz) {
      uv[i * 2] = x / cell;
      uv[i * 2 + 1] = z / cell;
    } else if (nx >= nz) {
      uv[i * 2] = z / cell;
      uv[i * 2 + 1] = y / cell;
    } else {
      uv[i * 2] = x / cell;
      uv[i * 2 + 1] = y / cell;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function buildWalkingSculpture(data, M, { walkerGlbUrl = null } = {}) {
  const g = new THREE.Group(); g.name = 'cityhallWalker';
  // White-ellipse mark: west half of south plaza, left of entrance promenade
  // (open paved area in front of west side of building — not centre/east of walkway)
  // White arrow: out from undercroft into open south plaza (facade behind, like photo 2)
  const sx = data.walker?.x ?? 1635;
  const sz = data.walker?.z ?? -5872;
  // Face south into plaza; city hall glass behind when viewed from south
  const yaw = data.walker?.ry ?? 0.15;

  const steel = M.steelHoneycomb || M.steelPlate;
  const plateMat = M.steelPlate || steel;

  // Collision (matches Blender pedestals: front +Y local → after yaw)
  // Blender stride was +Y; glTF Y-up maps Blender +Y → Three −Z. Rotate extra π so stride reads forward.
  const modelYaw = yaw + Math.PI;
  const cos = Math.cos(modelYaw), sin = Math.sin(modelYaw);
  const pedFront = { x: 0.62, z: -0.95 }; // after Y-up: Blender +Y → −Z
  const pedRear = { x: -0.55, z: 1.25 };
  function localToWorld(lx, lz) {
    return [sx + lx * cos - lz * sin, sz + lx * sin + lz * cos];
  }
  const [bx, bz] = localToWorld(0, 0);
  const [pfx, pfz] = localToWorld(pedFront.x, pedFront.z);
  const [prx, prz] = localToWorld(pedRear.x, pedRear.z);
  const colliders = [
    { x: bx, z: bz, r: 1.95 },
    { x: pfx, z: pfz, r: 0.7 },
    { x: prx, z: prz, r: 0.7 },
  ];

  function paintWalker(root) {
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      applyHoneycombUVs(o.geometry, 0.14);
      const n = (o.name || '').toLowerCase();
      if (/plate/.test(n)) {
        o.material = plateMat;
        o.name = 'cityhallWalkerPlate';
      } else if (/pedestal|base|lip/.test(n)) {
        o.material = steel;
        o.name = o.name.includes('Pedestal') || /pedestal|base|lip/.test(n)
          ? 'cityhallWalkerBase' : o.name;
        if (/pedestal/.test(n) || n === 'walkerpedestals') o.name = 'cityhallWalkerBase';
      } else {
        o.material = steel;
        o.name = 'cityhallWalkerBody';
      }
      o.castShadow = o.receiveShadow = true;
    });
    // Ensure named hooks exist even if Blender names differ
    let hasBody = false, hasBase = false, hasPlate = false;
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'cityhallWalkerBody') hasBody = true;
      if (o.name === 'cityhallWalkerBase') hasBase = true;
      if (o.name === 'cityhallWalkerPlate') hasPlate = true;
    });
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (!hasBody && /body|mesh/i.test(o.name)) { o.name = 'cityhallWalkerBody'; hasBody = true; }
      if (!hasBase && /ped|base|cyl/i.test(o.name)) { o.name = 'cityhallWalkerBase'; hasBase = true; }
      if (!hasPlate && /plate|cube/i.test(o.name)) { o.name = 'cityhallWalkerPlate'; hasPlate = true; }
    });
    // Last resort: assign by size / order
    const meshes = [];
    root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    meshes.sort((a, b) => (b.geometry?.attributes?.position?.count || 0) - (a.geometry?.attributes?.position?.count || 0));
    if (!hasBody && meshes[0]) { meshes[0].name = 'cityhallWalkerBody'; meshes[0].material = steel; }
    if (!hasBase && meshes[1]) { meshes[1].name = 'cityhallWalkerBase'; meshes[1].material = steel; }
    if (!hasPlate && meshes[2]) { meshes[2].name = 'cityhallWalkerPlate'; meshes[2].material = plateMat; }
  }

  // Sync fallback (tests / GLB fail): pedestals + muscular-ish low-poly stand-in
  function addFallback() {
    // ≤3 draws: plate | pedestals+base | body
    const plate = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.06, 3.6), plateMat);
    plate.position.y = 0.03; plate.name = 'cityhallWalkerPlate';
    applyHoneycombUVs(plate.geometry, 0.14);
    const baseGeos = [];
    const push = (geo, x, y, z) => { geo.translate(x, y, z); baseGeos.push(geo); };
    push(new THREE.CylinderGeometry(1.8, 1.85, 0.4, 16), 0, 0.2, 0);
    push(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 12), 0.62, 0.65, -0.95);
    push(new THREE.CylinderGeometry(0.55, 0.55, 1.45, 12), -0.55, 1.125, 1.25);
    const baseMerged = mergeGeometries(baseGeos, false);
    for (const g0 of baseGeos) g0.dispose();
    applyHoneycombUVs(baseMerged, 0.14);
    const base = new THREE.Mesh(baseMerged, steel); base.name = 'cityhallWalkerBase';
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 3.2, 6, 10), steel);
    body.position.set(0.05, 5.2, -0.2); body.rotation.x = 0.45; body.name = 'cityhallWalkerBody';
    applyHoneycombUVs(body.geometry, 0.14);
    for (const m of [plate, base, body]) {
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
  }

  g.position.set(sx, 0, sz);
  g.rotation.y = modelYaw;
  g.userData.walkerColliders = colliders;
  g.userData.walkerPos = { x: sx, z: sz };

  let glbPending = null;
  if (walkerGlbUrl && typeof document !== 'undefined') {
    glbPending = import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) =>
      import('three/examples/jsm/loaders/DRACOLoader.js').then(({ DRACOLoader }) => {
        const loader = new GLTFLoader();
        const draco = new DRACOLoader();
        const path = walkerGlbUrl.replace(/[^/]+$/, 'draco/');
        draco.setDecoderPath(path);
        draco.setDecoderConfig({ type: 'js' });
        loader.setDRACOLoader(draco);
        return loader.loadAsync(walkerGlbUrl).then((gltf) => {
          const root = gltf.scene || gltf.scenes?.[0];
          if (!root) { addFallback(); return; }
          while (g.children.length) g.remove(g.children[0]);
          paintWalker(root);
          g.add(root);
          draco.dispose();
        }).catch((e) => {
          console.warn('[cityhall] walker GLB failed', e);
          if (!g.getObjectByName('cityhallWalkerBody')) addFallback();
        });
      })
    );
  } else {
    addFallback();
  }

  return {
    group: g,
    pending: glbPending,
    isBlocked(x, z, r = 0.4) {
      for (const c of colliders) {
        if (Math.hypot(x - c.x, z - c.z) < c.r + r) return true;
      }
      return false;
    },
  };
}



/** G1 glass: sealed envelope under the slab — front, back, both ends/sides, corners.
 *  East undercroft PASSAGE (도훈): open front+back walk-through; divider wall seals lobby to the west.
 *  Meets slab at top; pillars inside/flush. Lobby enter only via revolving/auto doors.
 *  Doors: clear near-transparent glass (not blue-tinted).
 */
function buildGroundFloor(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallGroundFloor';
  const b = data.building;
  const xs = b.o.map((p) => p[0]), zs = b.o.map((p) => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const zMin = Math.min(...zs), zMax = Math.max(...zs);
  const mass = b.massing || {};
  const westX1 = mass.westX1 ?? 1582;
  const midX1 = mass.midX1 ?? 1632;
  const PH = mass.pilotisH ?? 8.0;

  // Full slab footprint — continuous sealed glass (도훈: close ALL undercroft openings)
  const G1_X0 = xMin + 0.35;                 // west end under slab
  const G1_X1 = xMax - 0.35;                 // east end under slab (was truncated → open overhang)
  const BACK_X0 = G1_X0;
  const BACK_X1 = G1_X1;
  const zSouth = zMax + 0.22;               // south face (front)
  const zNorth = zMin - 0.22;               // BACK face toward pond/garden
  const DOOR_X = (westX1 + midX1) / 2;      // ~1607
  const DOOR_W = 5.4;
  const doorL = DOOR_X - DOOR_W / 2;
  const doorR = DOOR_X + DOOR_W / 2;
  const DOOR_H = 2.95; // revolving / auto leaf height; transom fills DOOR_H → PH
  // Open front↔back passage under east wing (purple-banner / yellow-box span) — real city hall walk-through
  const PASS_X0 = midX1 + 22;              // ~1654 — left edge of open span (glass meets here)
  const PASS_X1 = G1_X1;                   // east end

  // Building enclosure glass (blue-ish curtain) — walls of the sealed volume
  const glassMat = (M.glassBlue || M.glassLite).clone();
  glassMat.name = 'G1Glass';
  glassMat.transparent = true;
  glassMat.opacity = 0.86;
  glassMat.roughness = 0.28;
  glassMat.metalness = 0.2;
  glassMat.emissive = new THREE.Color('#3a7aa8');
  glassMat.emissiveIntensity = 0.35;
  glassMat.side = THREE.DoubleSide;
  glassMat.depthWrite = true;

  // Clear door glass — near-transparent, light neutral (NOT blue tint)
  const clearMat = new THREE.MeshStandardMaterial({
    color: '#eef3f6', transparent: true, opacity: 0.18,
    roughness: 0.06, metalness: 0.12, depthWrite: false,
    side: THREE.DoubleSide, envMapIntensity: 0.35,
  });
  clearMat.name = 'G1ClearDoor';

  const mullionMat = M.frame || M.frameDark || new THREE.MeshStandardMaterial({ color: '#e6eaee' });
  const bag = Bag();
  // Wall colliders: { kind:'ns'|'ew', x0,x1,z0,z1 } thin slabs
  const walls = [];

  function addNSWall(x0, x1, z, y0, y1, mat = glassMat, name = 'cityhallG1Glass') {
    if (x1 - x0 < 0.4 || y1 - y0 < 0.3) return;
    const cx = (x0 + x1) / 2, w = x1 - x0, h = y1 - y0;
    const plane = new THREE.PlaneGeometry(w, h, Math.max(1, Math.round(w / 3.2)), Math.max(1, Math.round(h / 2.5)));
    plane.translate(cx, y0 + h / 2, z);
    const mesh = new THREE.Mesh(plane, mat);
    mesh.name = name;
    mesh.castShadow = false; mesh.receiveShadow = true;
    g.add(mesh);
    // Mullions
    for (let x = x0 + 1.6; x < x1 - 0.4; x += 3.2) {
      bag.box(x, y0 + h / 2, z + 0.04, 0.1, h - 0.1, 0.12, 0, C.frame);
    }
    bag.box(cx, y0 + 0.12, z + 0.04, w, 0.18, 0.14, 0, C.frame);
    bag.box(cx, y1 - 0.12, z + 0.04, w, 0.18, 0.14, 0, C.frame);
    walls.push({ kind: 'ns', x0, x1, z, half: 0.4 });
  }

  function addEWWall(z0, z1, x, y0, y1, mat = glassMat, name = 'cityhallG1Glass') {
    if (z1 - z0 < 0.4 || y1 - y0 < 0.3) return;
    const cz = (z0 + z1) / 2, d = z1 - z0, h = y1 - y0;
    const plane = new THREE.PlaneGeometry(d, h, Math.max(1, Math.round(d / 3.2)), Math.max(1, Math.round(h / 2.5)));
    plane.rotateY(Math.PI / 2);
    plane.translate(x, y0 + h / 2, cz);
    const mesh = new THREE.Mesh(plane, mat);
    mesh.name = name;
    mesh.castShadow = false; mesh.receiveShadow = true;
    g.add(mesh);
    for (let z = z0 + 1.6; z < z1 - 0.4; z += 3.2) {
      bag.box(x + 0.04, y0 + h / 2, z, 0.12, h - 0.1, 0.1, 0, C.frame);
    }
    bag.box(x + 0.04, y0 + 0.12, cz, 0.14, 0.18, d, 0, C.frame);
    bag.box(x + 0.04, y1 - 0.12, cz, 0.14, 0.18, d, 0, C.frame);
    walls.push({ kind: 'ew', z0, z1, x, half: 0.4 });
  }

  // --- South facade: sealed lobby (west of passage) with door cutout; OPEN east passage ---
  addNSWall(G1_X0, doorL, zSouth, 0.15, PH - 0.2);
  addNSWall(doorR, PASS_X0, zSouth, 0.15, PH - 0.2);
  // no front glass in [PASS_X0, PASS_X1] — walk-through under slab
  // Transom above door bay — SOLID fill to slab (bag solids + glass face) so gap cannot read open
  {
    const tw = doorR - doorL;
    const tcx = (doorL + doorR) / 2;
    const ty0 = DOOR_H + 0.02, ty1 = PH - 0.12;
    const th = ty1 - ty0;
    // Opaque-ish interior fill (blocks view of open air / sky through bay)
    bag.box(tcx, ty0 + th / 2, zSouth - 0.25, tw - 0.1, th, 0.5, 0, '#a8c0d4');
    // Outer glass face
    const transMat = glassMat.clone();
    transMat.opacity = 0.9;
    transMat.emissive = new THREE.Color('#4a90b8');
    transMat.emissiveIntensity = 0.3;
    const tGeo = new THREE.BoxGeometry(tw - 0.05, th, 0.2);
    tGeo.translate(tcx, ty0 + th / 2, zSouth + 0.06);
    const tMesh = new THREE.Mesh(tGeo, transMat);
    tMesh.name = 'cityhallG1Transom';
    g.add(tMesh);
    // Mullion grid
    for (let y = ty0 + 1.0; y < ty1 - 0.2; y += 1.2) {
      bag.box(tcx, y, zSouth + 0.14, tw, 0.12, 0.18, 0, C.frame);
    }
    for (let x = doorL + 1.2; x < doorR - 0.5; x += 1.6) {
      bag.box(x, ty0 + th / 2, zSouth + 0.14, 0.1, th, 0.16, 0, C.frame);
    }
    bag.box(tcx, ty0 + 0.1, zSouth + 0.14, tw, 0.18, 0.2, 0, C.frame);
    bag.box(tcx, ty1 - 0.1, zSouth + 0.14, tw, 0.18, 0.2, 0, C.frame);
  }
  // White lintel / header bar right above door leaves
  bag.box(DOOR_X, DOOR_H + 0.14, zSouth + 0.1, DOOR_W + 0.4, 0.32, 0.4, 0, C.frame);
  // Door-bay side jambs (full height to slab)
  bag.box(doorL, PH / 2, zSouth + 0.1, 0.2, PH - 0.15, 0.32, 0, C.frame);
  bag.box(doorR, PH / 2, zSouth + 0.1, 0.2, PH - 0.15, 0.32, 0, C.frame);

  // --- North BACK curtain — sealed lobby only; open behind east passage ---
  addNSWall(BACK_X0, PASS_X0, zNorth, 0.15, PH - 0.2, glassMat, 'cityhallG1BackGlass');
  for (let x = BACK_X0 + 3; x < PASS_X0 - 2; x += 6.5) {
    bag.box(x, PH / 2, zNorth + 0.35, 0.35, PH - 0.3, 0.35, 0, C.pilotis);
  }

  // --- West end + passage divider + East end ---
  addEWWall(zNorth, zSouth, G1_X0, 0.15, PH - 0.2, glassMat, 'cityhallG1WestGlass');
  // Divider at left end of open span — seals lobby interior from the walk-through
  addEWWall(zNorth, zSouth, PASS_X0, 0.15, PH - 0.2, glassMat, 'cityhallG1PassageWall');
  addEWWall(zNorth, zSouth, G1_X1, 0.15, PH - 0.2, glassMat, 'cityhallG1EastGlass');
  for (const [cx, cz] of [
    [G1_X0, zSouth], [G1_X0, zNorth],
    [PASS_X0, zSouth], [PASS_X0, zNorth],
    [G1_X1, zSouth], [G1_X1, zNorth],
  ]) {
    bag.box(cx, PH / 2, cz, 0.32, PH - 0.25, 0.32, 0, C.frame);
  }

  // Interior glow strips (night) along south
  for (let x = G1_X0 + 2; x < PASS_X0 - 1; x += 4.5) {
    if (x > doorL - 1 && x < doorR + 1) continue;
    const col = ((Math.sin(x * 12.9) + 1) * 0.5) > 0.45 ? C.nightWarm : C.nightCool;
    bag.box(x, PH * 0.45, zSouth - 0.9, 3.2, PH * 0.7, 0.08, 0, col);
  }

  // Lobby floor under slab between front and back glass
  bag.box((G1_X0 + PASS_X0) / 2, 0.06, (zSouth + zNorth) / 2, PASS_X0 - G1_X0 - 0.4, 0.1, Math.abs(zSouth - zNorth) - 0.5, 0, C.plaza);
  // Passage paving (same level, open)
  bag.box((PASS_X0 + PASS_X1) / 2, 0.05, (zSouth + zNorth) / 2, PASS_X1 - PASS_X0 - 0.3, 0.08, Math.abs(zSouth - zNorth) - 0.4, 0, C.path);

  // --- Revolving door (회전문): clear glass wings ---
  const revG = new THREE.Group(); revG.name = 'cityhallRevolvingDoor';
  revG.position.set(DOOR_X - 1.15, 0, zSouth + 0.1);
  const cylR = 1.35, cylH = DOOR_H - 0.1;
  const drumMat = mullionMat;
  const topRing = new THREE.Mesh(new THREE.TorusGeometry(cylR, 0.055, 6, 20), drumMat);
  topRing.rotation.x = Math.PI / 2; topRing.position.y = cylH;
  revG.add(topRing);
  const botRing = topRing.clone(); botRing.position.y = 0.06; revG.add(botRing);
  // Subtle outer posts (not a solid blue drum)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, cylH, 6), drumMat);
    post.position.set(Math.cos(a) * cylR, cylH / 2, Math.sin(a) * cylR);
    revG.add(post);
  }
  const wingG = new THREE.Group(); wingG.name = 'cityhallRevWings';
  for (let i = 0; i < 4; i++) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(cylR * 1.85, cylH - 0.2, 0.045), clearMat);
    wing.position.set(cylR * 0.48, cylH / 2, 0);
    const pivot = new THREE.Group();
    pivot.rotation.y = (i * Math.PI) / 2;
    pivot.add(wing);
    wingG.add(pivot);
  }
  revG.add(wingG);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, cylH, 8), drumMat);
  shaft.position.y = cylH / 2; revG.add(shaft);
  g.add(revG);

  // --- Automatic sliding door (자동문): clear glass ---
  const slideG = new THREE.Group(); slideG.name = 'cityhallAutoDoor';
  slideG.position.set(DOOR_X + 1.55, 0, zSouth + 0.08);
  const frameH = DOOR_H, openW = 1.35;
  const sL = new THREE.Mesh(new THREE.BoxGeometry(openW, frameH - 0.15, 0.05), clearMat);
  sL.position.set(-openW / 2, frameH / 2, 0); sL.name = 'slideL';
  const sR = sL.clone(); sR.position.x = openW / 2; sR.name = 'slideR';
  slideG.add(sL, sR);
  // Subtle metal frames on leaves
  for (const leaf of [sL, sR]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(openW + 0.04, frameH - 0.1, 0.02), drumMat);
    f.position.copy(leaf.position); f.position.z = 0.03;
    // frame as edge strips instead
  }
  const hdr = new THREE.Mesh(new THREE.BoxGeometry(openW * 2.2, 0.16, 0.16), drumMat);
  hdr.position.y = frameH; slideG.add(hdr);
  // Side jambs of auto door
  const jL = new THREE.Mesh(new THREE.BoxGeometry(0.08, frameH, 0.12), drumMat);
  jL.position.set(-openW - 0.05, frameH / 2, 0);
  const jR = jL.clone(); jR.position.x = openW + 0.05;
  slideG.add(jL, jR);
  g.add(slideG);

  const frameBits = bag.mesh(M.vc, 'cityhallG1Frame');
  if (frameBits) g.add(frameBits);

  let eveningOn = false;
  function setNight(on) {
    eveningOn = !!on;
    glassMat.emissiveIntensity = on ? 0.95 : 0.35;
  }

  let slideOpen = 0;
  function update(dt, t, playerPos) {
    wingG.rotation.y = (t || 0) * 0.35;
    let want = 0;
    if (playerPos) {
      const d = Math.hypot(playerPos.x - (DOOR_X + 1.55), playerPos.z - zSouth);
      if (d < 4.5) want = 1;
    }
    slideOpen += ((want - slideOpen) * Math.min(1, (dt || 0.016) * 4));
    sL.position.x = -openW / 2 - slideOpen * openW * 0.85;
    sR.position.x = openW / 2 + slideOpen * openW * 0.85;
  }

  function isBlocked(x, z, r = 0.4) {
    // Open east undercroft passage — walk front↔back under slab (no NS glass here)
    const inPass = x > PASS_X0 + r && x < PASS_X1 - r
      && z > zNorth - 1.2 - r && z < zSouth + 1.2 + r;
    if (inPass) {
      // Still blocked by divider / east end walls via the loop below
    }
    // Passage through door bay (revolving centre + open auto door)
    const inDoorBay = x > doorL - r && x < doorR + r && z > zSouth - 1.4 - r && z < zSouth + 1.2 + r;
    if (inDoorBay) {
      if (Math.abs(x - DOOR_X) < 0.9) return false; // revolving path
      if (slideOpen > 0.55 && x > DOOR_X + 0.3 && x < DOOR_X + 3.2) return false;
    }
    for (const w of walls) {
      if (w.kind === 'ns') {
        if (x >= w.x0 - r && x <= w.x1 + r && Math.abs(z - w.z) < w.half + r) return true;
      } else {
        if (z >= w.z0 - r && z <= w.z1 + r && Math.abs(x - w.x) < w.half + r) return true;
      }
    }
    return false;
  }

  return {
    group: g, update, isBlocked, setNight, doorX: DOOR_X, zFace: zSouth,
    extent: { x0: G1_X0, x1: G1_X1, backX0: BACK_X0, backX1: BACK_X1, zSouth, zNorth, PH, passX0: PASS_X0, passX1: PASS_X1 },
    disposeExtra: () => { clearMat.dispose(); glassMat.dispose(); },
  };
}

/** Stone approach, NW floor fountain, street trees, pedestrian overpass — ?cityhall=1 only. */
function buildPlazaExtras(data, M) {
  const g = new THREE.Group(); g.name = 'cityhallPlazaExtras';
  const bag = Bag();
  const elevators = []; // { x, z, deckY, label }
  const heights = []; // { kind, ... } for groundHeight

  // --- 1) Stone paving (돌바닥): wide approach + west/south plaza 도훈 circled ---
  const stoneMat = M.stonePlaza || M.plaza || M.path;
  const stoneGeos = [];
  function stoneBox(cx, cz, sx, sz, rotY = 0) {
    const geo = new THREE.PlaneGeometry(sx, sz, 1, 1);
    // World-meter UVs so ~1.8 m tiles read at eye level regardless of plane size
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, u * (sx / 1.8), v * (sz / 1.8));
    }
    geo.rotateX(-Math.PI / 2);
    if (rotY) geo.rotateY(rotY);
    geo.translate(cx, 0.195, cz); // above grey plaza pads (~0.16)
    stoneGeos.push(geo);
  }
  // Large contiguous stone field matching 도훈 circle: entrance approach + plaza
  stoneBox(1620, -5890, 90, 70, 0.12);   // main approach / south plaza (circled) — trimmed west
  // west open plaza kept east of roadside strip (도훈 yellow: no stone on road/sidewalk)
  stoneBox(1588, -5885, 48, 48, 0.02);
  stoneBox(1645, -5865, 75, 50, -0.08);  // SE plaza toward road
  stoneBox(1595, -5915, 55, 32, 0.22);   // near south face apron
  stoneBox(1640, -5828, 120, 85, 0.05);  // north plaza field
  stoneBox(1540, -5800, 40, 30, 0.02);   // NW floor-fountain pad (도훈 yellow circle)
  // Promenade approach (match promenade axis ~ SE→NW) — widened stone walk
  {
    const pr = data.promenade || { from: [1700, -5835], to: [1645, -5900] };
    const dx = pr.to[0] - pr.from[0], dz = pr.to[1] - pr.from[1];
    const L = Math.hypot(dx, dz) || 1, ang = Math.atan2(dz, dx);
    stoneBox((pr.from[0] + pr.to[0]) / 2, (pr.from[1] + pr.to[1]) / 2, L + 12, (pr.width || 9.5) + 10, -ang);
  }
  if (stoneGeos.length) {
    const merged = mergeGeometries(stoneGeos, false);
    for (const x of stoneGeos) x.dispose();
    if (merged) {
      const m = new THREE.Mesh(merged, stoneMat);
      m.name = 'cityhallStonePlaza'; m.receiveShadow = true; m.castShadow = false;
      g.add(m);
    }
  }

  // --- 2) Floor fountain — small NW cluster only (도훈: left of tree row, near road/footpath)
  // Players walk through (no collision). ~16 nozzles; all other plaza nozzles removed.
  const FF = { x0: 1528, x1: 1556, z0: -5812, z1: -5790 };
  const grateN = [];
  const cols = 4, rows = 4;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = FF.x0 + 1.5 + (i + 0.5) * ((FF.x1 - FF.x0 - 3) / cols);
      const z = FF.z0 + 1.5 + (j + 0.5) * ((FF.z1 - FF.z0 - 3) / rows);
      grateN.push([x, z]);
    }
  }
  // Nozzle grate: high-contrast metal disc with radial slots (readable at eye level)
  const grateMap = (typeof document !== 'undefined') ? canvasTex(96, 96, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#4a5560';
    x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#0a0c10';
    x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 10, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#d0d6dc'; x.lineWidth = 3.5;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      x.beginPath();
      x.moveTo(w / 2 + Math.cos(a) * 7, h / 2 + Math.sin(a) * 7);
      x.lineTo(w / 2 + Math.cos(a) * (w / 2 - 11), h / 2 + Math.sin(a) * (w / 2 - 11));
      x.stroke();
    }
    x.strokeStyle = '#eef2f6'; x.lineWidth = 4;
    x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = '#a8b0b8'; x.lineWidth = 2.5;
    x.beginPath(); x.arc(w / 2, h / 2, 8, 0, Math.PI * 2); x.stroke();
    // center hole
    x.fillStyle = '#050608';
    x.beginPath(); x.arc(w / 2, h / 2, 5, 0, Math.PI * 2); x.fill();
  }, 1, 1) : null;
  const grateGeo = new THREE.CircleGeometry(0.55, 16);
  grateGeo.rotateX(-Math.PI / 2);
  const grateMat = new THREE.MeshStandardMaterial({
    color: '#c8ced6', map: grateMap || undefined, roughness: 0.45, metalness: 0.8,
  });
  const grates = new THREE.InstancedMesh(grateGeo, grateMat, grateN.length);
  grates.name = 'cityhallFloorGrates';
  const dummy = new THREE.Object3D();
  grateN.forEach(([x, z], i) => {
    dummy.position.set(x, 0.205, z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, (i % 8) * 0.2, 0);
    dummy.updateMatrix();
    grates.setMatrixAt(i, dummy.matrix);
  });
  grates.instanceMatrix.needsUpdate = true;
  g.add(grates);

  const summer = isCityHallSummer();
  let jets = null, jetMat = null, jetGeo = null;
  let cores = null, coreMat = null, coreGeo = null;
  let sheaths = null, sheathMat = null, sheathGeo = null;
  let mist = null, mistMat = null, mistGeo = null;
  let drops = null, dropMat = null, dropGeo = null;
  let wet = null, wetMat = null, wetGeo = null;
  let splash = null, splashMat = null, splashGeo = null;
  const DROP_PER = 3;
  if (summer && grateN.length) {
    // Solid water column ~0.14–0.18 m diameter (cylinder keeps volume at every angle)
    jetMat = new THREE.MeshBasicMaterial({
      color: '#8ec6ea', transparent: true, opacity: 0.88, depthWrite: false,
      blending: THREE.NormalBlending, toneMapped: false,
    });
    jetGeo = new THREE.CylinderGeometry(0.09, 0.105, 1, 12, 1, true); // openEnded — no tip disc
    jetGeo.translate(0, 0.5, 0);
    jets = new THREE.InstancedMesh(jetGeo, jetMat, grateN.length);
    jets.name = 'cityhallFloorJets'; jets.frustumCulled = false;
    g.add(jets);

    // Bright white-blue core
    coreMat = new THREE.MeshBasicMaterial({
      color: '#d8eefc', transparent: true, opacity: 0.45, depthWrite: false,
      blending: THREE.NormalBlending, toneMapped: false,
    });
    coreGeo = new THREE.CylinderGeometry(0.032, 0.045, 1, 8, 1, true);
    coreGeo.translate(0, 0.5, 0);
    cores = new THREE.InstancedMesh(coreGeo, coreMat, grateN.length);
    cores.name = 'cityhallFloorJetCores'; cores.frustumCulled = false;
    g.add(cores);

    // Soft translucent falloff sheath (outer cylinder, wider than solid column)
    sheathMat = new THREE.MeshBasicMaterial({
      color: '#b8dcff', transparent: true, opacity: 0.22, depthWrite: false,
      blending: THREE.NormalBlending, toneMapped: false,
    });
    sheathGeo = new THREE.CylinderGeometry(0.16, 0.19, 1, 10, 1, true);
    sheathGeo.translate(0, 0.5, 0);
    sheaths = new THREE.InstancedMesh(sheathGeo, sheathMat, grateN.length);
    sheaths.name = 'cityhallFloorJetSheaths'; sheaths.frustumCulled = false;
    g.add(sheaths);

    // No tip disc/ring — only tiny sparse droplets (도훈: huge white blobs were too big)
    // mist left null
    dropMat = new THREE.MeshBasicMaterial({
      color: '#e8f4fc', transparent: true, opacity: 0.35, depthWrite: false,
      blending: THREE.NormalBlending, toneMapped: false,
    });
    dropGeo = new THREE.SphereGeometry(0.018, 6, 4);
    drops = new THREE.InstancedMesh(dropGeo, dropMat, grateN.length * DROP_PER);
    drops.name = 'cityhallFloorDrops'; drops.frustumCulled = false;
    g.add(drops);

    // Wet darker stone patch under/around each nozzle
    wetMat = new THREE.MeshBasicMaterial({
      color: '#152028', transparent: true, opacity: 0.62, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    });
    wetGeo = new THREE.RingGeometry(0.55, 1.25, 20);
    wetGeo.rotateX(-Math.PI / 2);
    wet = new THREE.InstancedMesh(wetGeo, wetMat, grateN.length);
    wet.name = 'cityhallFloorWet'; wet.frustumCulled = false;
    grateN.forEach(([x, z], i) => {
      dummy.position.set(x, 0.196, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      wet.setMatrixAt(i, dummy.matrix);
    });
    wet.instanceMatrix.needsUpdate = true;
    // Draw wet BEFORE grates visually: already added after grates in scene graph —
    // re-insert under grates by renderOrder
    wet.renderOrder = -1;
    grates.renderOrder = 1;
    g.add(wet);

    // Small splash ring on stone at each nozzle
    splashMat = new THREE.MeshBasicMaterial({
      color: '#e0f2ff', transparent: true, opacity: 0.75, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    splashGeo = new THREE.RingGeometry(0.35, 0.62, 20);
    splashGeo.rotateX(-Math.PI / 2);
    splash = new THREE.InstancedMesh(splashGeo, splashMat, grateN.length);
    splash.name = 'cityhallFloorSplash'; splash.frustumCulled = false;
    splash.renderOrder = 2;
    g.add(splash);
  }
  function updateFloorFountain(t) {
    if (!jets) return;
    for (let i = 0; i < grateN.length; i++) {
      const [x, z] = grateN[i];
      const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 3.4 + i * 0.47));
      const h = 0.7 + pulse * 3.4;
      // Diameter stays ~0.14–0.18 m (fat scales the 0.14–0.18 base cylinder)
      const fat = 1.0 + 0.15 * pulse;
      dummy.position.set(x, 0.2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(fat, h, fat);
      dummy.updateMatrix();
      jets.setMatrixAt(i, dummy.matrix);
      if (cores) {
        dummy.scale.set(fat * 0.95, h * 0.98, fat * 0.95);
        dummy.updateMatrix();
        cores.setMatrixAt(i, dummy.matrix);
      }
      if (sheaths) {
        const sw = 0.95 + 0.25 * pulse;
        dummy.position.set(x, 0.2, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(sw, h * 0.96, sw);
        dummy.updateMatrix();
        sheaths.setMatrixAt(i, dummy.matrix);
      }
      if (drops) {
        for (let d = 0; d < DROP_PER; d++) {
          const ang = t * 2.8 + i * 0.9 + d * 2.1;
          const rad = 0.04 + 0.08 * ((d * 0.41 + pulse * 0.3) % 1);
          const dy = h * (0.82 + 0.16 * ((Math.sin(t * 5.0 + d * 1.7 + i) + 1) * 0.5));
          dummy.position.set(
            x + Math.cos(ang) * rad,
            0.2 + dy,
            z + Math.sin(ang) * rad,
          );
          dummy.rotation.set(0, 0, 0);
          const ds = 0.35 + 0.25 * pulse; // tiny beads
          dummy.scale.set(ds, ds, ds);
          dummy.updateMatrix();
          drops.setMatrixAt(i * DROP_PER + d, dummy.matrix);
        }
      }
      if (splash) {
        const ss = 0.85 + 0.7 * pulse;
        dummy.position.set(x, 0.206, z);
        dummy.rotation.set(0, t * 0.9 + i * 0.3, 0);
        dummy.scale.set(ss, 1, ss);
        dummy.updateMatrix();
        splash.setMatrixAt(i, dummy.matrix);
      }
    }
    jets.count = grateN.length;
    jets.instanceMatrix.needsUpdate = true;
    jetMat.opacity = 0.78 + 0.14 * (0.5 + 0.5 * Math.sin(t * 2.0));
    if (cores) {
      cores.count = grateN.length;
      cores.instanceMatrix.needsUpdate = true;
      coreMat.opacity = 0.35 + 0.15 * (0.5 + 0.5 * Math.sin(t * 2.4));
    }
    if (sheaths) {
      sheaths.count = grateN.length;
      sheaths.instanceMatrix.needsUpdate = true;
      sheathMat.opacity = 0.22 + 0.18 * (0.5 + 0.5 * Math.sin(t * 2.2));
    }
    if (drops) {
      drops.count = grateN.length * DROP_PER;
      drops.instanceMatrix.needsUpdate = true;
      dropMat.opacity = 0.22 + 0.12 * (0.5 + 0.5 * Math.sin(t * 3.1));
    }
    if (splash) {
      splash.count = grateN.length;
      splash.instanceMatrix.needsUpdate = true;
      splashMat.opacity = 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3.5));
    }
  }

  // --- 3) Street trees along sidewalks near streetlights (도훈) ---
  // Spaced along curb between/near lamp posts; clear of bus boarding + overpass span.
  {
    const streetPts = [];
    // Derived from public/corridor/streetlights.json lamps around city hall; offset onto sidewalk.
    const lamps = [
      // EW road north of plaza (z≈-5787), plant south toward plaza
      [1490.0, -5786.9, 1.56], [1554.3, -5786.6, 1.57], [1604.3, -5786.6, 1.57],
      [1651.3, -5786.6, 1.57], [1704.4, -5786.3, 1.56], [1754.4, -5785.8, 1.56],
      // NS arterial west curb (plaza side) — lamps x≈1792–1795
      [1794.5, -6145.5, 3.14], [1794.3, -6113.5, 3.14], [1793.5, -5889.8, 3.13],
      [1793.0, -5857.8, 3.13], [1792.5, -5819.8, 3.13], [1792.0, -5787.8, 3.13],
      [1791.2, -5752.9, 3.12], [1789.9, -5673.8, 3.13], [1795.4, -6054.5, 0.01],
      [1795.8, -6025.5, 0.01], [1795.3, -5997.8, 3.13], [1794.8, -5965.8, 3.12],
      // NS arterial east curb
      [1831.2, -6143.8, 0], [1831.1, -6105.7, 3.12], [1828.7, -5925.3, 3.13],
      [1828.2, -5890.3, 3.13], [1827.8, -5855.3, 3.13], [1827.3, -5820.3, 3.13],
      [1826.2, -5746.6, 3.13], [1825.8, -5714.6, 3.13], [1825.2, -5673.6, 3.12],
      // South / approach EW
      [1543.7, -6102.6, 1.59], [1583.9, -6102.3, 1.52], [1623.9, -6100.2, 1.52],
      [1663.7, -6098.4, 1.55], [1703.5, -6098.2, 1.6], [1516.6, -6092.4, 1.54],
      [1551.6, -6091.3, 1.54], [1586.8, -6089.3, 1.51], [1621.7, -6087.4, 1.51],
      [1656.7, -6085.4, 1.51], [1691.6, -6083.4, 1.51], [1726.5, -6081.5, 1.51],
    ];
    // Bus boarding clear zones (existing stop curb positions) + overpass deck
    const clear = [
      [1794.6, -5796.1, 7], [1826.7, -5842.6, 7], [1794.9, -5827.8, 7], [1827.1, -5798.8, 7],
      [1782.7, -5711.2, 6], [1810, -5765, 22],
    ];
    const seen = [];
    for (const [lx, lz, yaw] of lamps) {
      // Offset onto sidewalk: opposite road-arm direction by ~2.8 m, plus slight curb stagger
      const ax = Math.cos(yaw), az = -Math.sin(yaw); // arm over road
      // Prefer plaza/building side for arterial: for NS road center ~1810, west lamps push west (−x), east push east (+x)
      let ox = -ax * 2.9, oz = -az * 2.9;
      if (Math.abs(lx - 1810) < 40 && Math.abs(ax) < 0.35) {
        // arm mostly E/W along NS road — push away from road centerline
        ox = (lx < 1810 ? -1 : 1) * 2.9;
        oz = 0;
      } else if (Math.abs(lz + 5786) < 8) {
        // EW road north of plaza — plant south (toward plaza, −z)
        ox = 0; oz = -3.0;
      } else if (Math.abs(lz + 6095) < 25) {
        // south approach — plant north of curb (+z toward city hall)
        ox = 0; oz = 2.8;
      }
      const x = lx + ox, z = lz + oz;
      if (clear.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)) continue;
      if (seen.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 9)) continue;
      seen.push([x, z]);
      streetPts.push([x, z]);
    }
    // Extra regular curb fill between lamps on plaza-side NS west sidewalk
    for (let z = -6120; z <= -5680; z += 16) {
      const x = 1784.5;
      if (clear.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)) continue;
      if (seen.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 10)) continue;
      seen.push([x, z]);
      streetPts.push([x, z]);
    }
    // Continuous row along WEST plaza curb (big road ↔ plaza) — 도훈 yellow line
    // NE near floor fountain → SW along sidewalk edge, ~9 m spacing, curb not road
    {
      const westPoly = [
        [1536.0, -5794.0], // NE — by NW fountain pad
        [1524.0, -5835.0],
        [1514.0, -5875.0],
        [1506.0, -5915.0],
        [1500.0, -5955.0],
        [1496.0, -5995.0],
        [1495.0, -6035.0],
        [1498.0, -6070.0],
        [1508.0, -6100.0], // SW
      ];
      const spacing = 9.0;
      let carry = 0;
      for (let i = 0; i < westPoly.length - 1; i++) {
        const [ax, az] = westPoly[i], [bx, bz] = westPoly[i + 1];
        const dx = bx - ax, dz = bz - az;
        const seg = Math.hypot(dx, dz) || 1;
        const ux = dx / seg, uz = dz / seg;
        // Perp toward plaza (+X): choose sign so offset increases x
        let px = -uz, pz = ux;
        if (px < 0) { px = -px; pz = -pz; }
        let d = carry;
        while (d <= seg) {
          const xx = ax + ux * d + px * 2.4;
          const zz = az + uz * d + pz * 2.4;
          if (!clear.some(([cx, cz, r]) => Math.hypot(xx - cx, zz - cz) < r)
              && !seen.some(([sx, sz]) => Math.hypot(xx - sx, zz - sz) < 7.5)) {
            seen.push([xx, zz]);
            streetPts.push([xx, zz]);
          }
          d += spacing;
        }
        carry = d - seg;
      }
    }
    let seed = 42011;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const inst = addInstancedTrees(g, streetPts, {
      rnd,
      crownRadius: 2.1, crownY: 4.8, trunkTop: 0.18, trunkBottom: 0.26, trunkHeight: 3.4,
      trunkColor: '#8a6b4e', scaleMin: 0.75, scaleSpan: 0.4,
    });
    if (inst) {
      inst.crowns.name = 'cityhallStreetTreeCrowns';
      inst.trunks.name = 'cityhallStreetTreeTrunks';
    }
    g.userData.streetTreeCount = streetPts.length;
  }

  // --- 4) White cable-stayed footbridge — IDENTICAL A-frame pylons at both ends (도훈) ---
  const OX = 1810, OZ = -5765;
  const DECK_Y = 5.6;
  const SPAN = 38;
  const DECK_W = 3.8;
  const WHITE = '#f2f4f6';
  const WHITE2 = '#e8ecf0';
  const TEAL = '#7eb8b0';
  g.userData.overpass = { x: OX, z: OZ, y: DECK_Y, span: SPAN };
  const xW = OX - SPAN / 2, xE = OX + SPAN / 2;

  // Slim white deck + smooth curved underside (no mid-span piers)
  bag.box(OX, DECK_Y - 0.07, OZ, SPAN, 0.16, DECK_W, 0, WHITE);
  bag.box(OX, DECK_Y - 0.24, OZ, SPAN - 0.4, 0.2, DECK_W * 0.88, 0, WHITE);
  bag.box(OX, DECK_Y - 0.42, OZ, SPAN - 1.6, 0.2, DECK_W * 0.7, 0, WHITE2);
  bag.box(OX, DECK_Y - 0.58, OZ, SPAN - 3.5, 0.18, DECK_W * 0.5, 0, WHITE2);
  bag.box(OX, DECK_Y - 0.72, OZ, SPAN - 7.0, 0.14, DECK_W * 0.28, 0, '#e4e8ec');
  bag.box(OX, DECK_Y - 0.82, OZ, SPAN - 11.0, 0.1, DECK_W * 0.16, 0, '#d8dde2');

  // Teal-tint glass rails on main span
  const railMat = new THREE.MeshStandardMaterial({
    color: TEAL, transparent: true, opacity: 0.38, roughness: 0.12, metalness: 0.15,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const railH = 1.15;
  for (const zs of [-1, 1]) {
    const zR = OZ + zs * (DECK_W / 2);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(SPAN - 0.4, railH, 1, 1), railMat);
    pane.position.set(OX, DECK_Y + railH / 2, zR);
    pane.name = 'cityhallOverpassRail';
    g.add(pane);
    for (let x = xW + 1; x <= xE - 1; x += 3.0) {
      bag.box(x, DECK_Y + railH / 2, zR, 0.06, railH, 0.06, 0, WHITE);
    }
    bag.box(OX, DECK_Y + railH + 0.04, zR, SPAN - 0.2, 0.07, 0.07, 0, WHITE);
    bag.box(OX, DECK_Y + 0.04, zR, SPAN - 0.2, 0.06, 0.08, 0, WHITE);
  }

  const cableMat = new THREE.MeshBasicMaterial({ color: '#f8fafc' });
  function addCable(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 1;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 5), cableMat);
    cyl.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    cyl.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx / len, dy / len, dz / len),
    );
    cyl.name = 'cityhallStayCable';
    g.add(cyl);
  }

  /** Mirror-symmetric end: A-frame pylon + stays + stair ramp + elevator (sideSign -1 west / +1 east). */
  function addSymmetricEnd(endX, sideSign) {
    // A-frame: two legs in Z, meeting at apex; leans away from span in X
    const baseX = endX + sideSign * 0.6;
    const apexX = endX + sideSign * 6.0; // lean away from deck
    const apexY = 18.5;
    const legSpread = 7.0; // wide V opening so A-frame reads clearly
    const SEG = 16;
    for (const zSign of [-1, 1]) {
      for (let i = 0; i < SEG; i++) {
        const t0 = i / SEG, t1 = (i + 1) / SEG;
        const x0 = baseX + (apexX - baseX) * t0;
        const x1 = baseX + (apexX - baseX) * t1;
        const z0 = OZ + zSign * (legSpread / 2) * (1 - t0);
        const z1 = OZ + zSign * (legSpread / 2) * (1 - t1);
        const y0 = apexY * t0, y1 = apexY * t1;
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
        // Thin legs so hollow A opening is obvious
        const thick = 0.42 - t0 * 0.16;
        const depth = 0.55 - t0 * 0.2;
        bag.box(cx, cy, cz, Math.max(0.22, thick), Math.max(0.22, y1 - y0 + 0.05), Math.max(0.28, depth), 0, WHITE);
      }
    }
    // Crossbeam near apex (opening below)
    bag.box(apexX - sideSign * 0.4, apexY * 0.86, OZ, 0.5, 0.32, 1.8, 0, WHITE2);
    bag.box(apexX - sideSign * 0.15, apexY * 0.96, OZ, 0.4, 0.45, 0.85, 0, WHITE);
    // Base footing pads under each leg
    for (const zSign of [-1, 1]) {
      bag.box(baseX, 0.28, OZ + zSign * (legSpread / 2), 2.0, 0.55, 1.8, 0, WHITE2);
    }

    // Elevator glass cabin between A-frame legs (tryElevator)
    const ex = baseX + sideSign * 0.2;
    const ez = OZ;
    const EH = DECK_Y + 2.2;
    bag.box(ex, EH / 2, ez, 2.0, EH, 2.0, 0, WHITE);
    bag.box(ex, EH + 0.18, ez, 2.2, 0.36, 2.2, 0, WHITE2);
    const eg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 2.3),
      new THREE.MeshStandardMaterial({ color: '#c8e0e4', transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    eg.position.set(ex - sideSign * 1.22, 1.3, ez);
    eg.rotation.y = sideSign > 0 ? 0 : Math.PI;
    g.add(eg);
    elevators.push({ x: ex, z: ez, deckY: DECK_Y, r: 1.45 });

    // Stay cables: fan from apex to this half of the deck (both edges)
    const N_CABLES = 11;
    const halfFrom = endX;
    const halfTo = OX; // toward midspan
    for (let i = 0; i < N_CABLES; i++) {
      const u = (i + 0.35) / N_CABLES;
      const ax = halfFrom + (halfTo - halfFrom) * u;
      for (const zs of [-1, 1]) {
        addCable(apexX, apexY * 0.97, OZ, ax, DECK_Y + 0.06, OZ + zs * (DECK_W / 2 - 0.05));
      }
    }

    // Stair ramp descending alongside deck (south side), with teal glass railing — walkable
    const steps = 14;
    const run = 12.0;
    const stairZ = OZ + DECK_W / 2 + 1.6; // beside deck
    for (let i = 0; i < steps; i++) {
      const yTop = DECK_Y * (1 - (i + 1) / steps);
      const yBot = DECK_Y * (1 - i / steps);
      const rise = Math.max(0.16, yBot - yTop);
      // Stairs continue outward from deck end (away from midspan)
      const xx = endX + sideSign * (0.8 + run * ((i + 0.5) / steps));
      bag.box(xx, yTop - rise * 0.4, stairZ, run / steps + 0.08, Math.max(0.16, rise * 0.85), 1.5, 0, WHITE);
      heights.push({
        kind: 'stair',
        x0: xx - run / steps * 0.55, x1: xx + run / steps * 0.55,
        z0: stairZ - 0.85, z1: stairZ + 0.85,
        y: yTop,
      });
      // glass rail posts along outer edge
      bag.box(xx, yTop / 2 + 0.15, stairZ + 0.7, 0.06, Math.max(0.25, yTop + 0.9), 0.06, 0, WHITE);
    }
    // Teal glass pane along stair outer side
    {
      const sx0 = endX + sideSign * 0.8;
      const sx1 = endX + sideSign * (0.8 + run);
      const scx = (sx0 + sx1) / 2;
      // approximate vertical plane (not slanted with stair — good enough visual)
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(run + 0.4, DECK_Y * 0.55 + 1.0, 1, 1),
        railMat,
      );
      pane.position.set(scx, (DECK_Y * 0.55 + 1.0) / 2, stairZ + 0.72);
      pane.name = 'cityhallOverpassRail';
      g.add(pane);
      bag.box(scx, DECK_Y * 0.55 + 1.0, stairZ + 0.72, run + 0.4, 0.07, 0.07, 0, WHITE);
    }
    // Handrail posts on inner stair edge + link to deck
    for (let i = 0; i <= steps; i++) {
      const t0 = i / steps;
      const yTop = DECK_Y * (1 - t0);
      const xx = endX + sideSign * (0.8 + run * t0);
      bag.box(xx, yTop + 0.55, stairZ - 0.7, 0.06, 0.08, 0.06, 0, WHITE);
      bag.box(xx, yTop + 0.55, stairZ + 0.7, 0.06, 0.08, 0.06, 0, WHITE);
    }
    // Deck spur from main span to elevator / stair head
    bag.box(endX + sideSign * 1.4, DECK_Y - 0.08, OZ, 3.2, 0.16, DECK_W + 0.4, 0, WHITE);
    // Short landing between elevator and stair head
    bag.box(endX + sideSign * 1.4, DECK_Y - 0.08, (OZ + stairZ) / 2, 2.2, 0.16, Math.abs(stairZ - OZ), 0, WHITE);
    heights.push({
      kind: 'deck',
      x0: Math.min(endX, endX + sideSign * 2.8) - 0.3,
      x1: Math.max(endX, endX + sideSign * 2.8) + 0.3,
      z0: OZ - DECK_W / 2 - 0.2,
      z1: stairZ + 0.9,
      y: DECK_Y,
    });
  }

  addSymmetricEnd(xW, -1);
  addSymmetricEnd(xE, +1);

  // Abutment pads under deck ends
  bag.box(xW + 0.6, 0.22, OZ, 1.8, 0.44, DECK_W + 0.4, 0, WHITE2);
  bag.box(xE - 0.6, 0.22, OZ, 1.8, 0.44, DECK_W + 0.4, 0, WHITE2);

  heights.push({
    kind: 'deck',
    x0: xW - 0.4, x1: xE + 0.4,
    z0: OZ - DECK_W / 2 - 0.2, z1: OZ + DECK_W / 2 + 0.2,
    y: DECK_Y,
  });

  // Static car under span
  bag.box(OX + 1.5, 0.55, OZ + 6.5, 4.4, 1.1, 1.9, 0.15, '#2a5fad');
  bag.box(OX + 1.5, 1.25, OZ + 6.5, 2.2, 0.7, 1.75, 0.15, '#1a3a6a');
  bag.box(OX + 1.5, 1.3, OZ + 6.5, 1.8, 0.45, 1.7, 0.15, '#7ec8e8');
  for (const [wx, wz] of [[-1.4, -0.85], [-1.4, 0.85], [1.4, -0.85], [1.4, 0.85]]) {
    bag.box(OX + 1.5 + wx * Math.cos(0.15) - wz * Math.sin(0.15), 0.32, OZ + 6.5 + wx * Math.sin(0.15) + wz * Math.cos(0.15), 0.55, 0.55, 0.22, 0.15, '#1a1a1a');
  }

  const body = bag.mesh(M.vc, 'cityhallPlazaExtrasBody');
  if (body) g.add(body);

  function groundHeight(x, z) {
    let best = null;
    for (const h of heights) {
      if (x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1) {
        if (best == null || h.y > best) best = h.y;
      }
    }
    return best;
  }

  function tryElevator(px, pz, py) {
    for (const e of elevators) {
      if (Math.hypot(px - e.x, pz - e.z) < e.r) {
        const up = (py || 0) < e.deckY * 0.5;
        return { x: e.x, z: e.z, y: up ? e.deckY : 0 };
      }
    }
    return null;
  }

  return {
    group: g,
    update: updateFloorFountain,
    groundHeight,
    tryElevator,
    summer,
    disposeExtra: () => {
      grateGeo.dispose(); grateMat.dispose(); grateMap?.dispose?.();
      jetGeo?.dispose(); jetMat?.dispose();
      coreGeo?.dispose(); coreMat?.dispose();
      sheathGeo?.dispose(); sheathMat?.dispose();
      mistGeo?.dispose(); mistMat?.dispose();
      dropGeo?.dispose(); dropMat?.dispose();
      wetGeo?.dispose(); wetMat?.dispose();
      splashGeo?.dispose(); splashMat?.dispose();
    },
  };
}

/** Merge child meshes that share MeshStandard/Lambert Basic with vertex colors into fewer draws. */
function mergeStaticGroup(group, name = 'merged') {
  const byKey = new Map();
  const keep = [];
  const children = [...group.children];
  for (const ch of children) {
    if (ch.isInstancedMesh || ch.isPoints || ch.isLine) { keep.push(ch); continue; }
    if (!ch.isMesh || !ch.geometry) { keep.push(ch); continue; }
    // skip transparent water / animated-looking names
    const n = ch.name || '';
    if (/Jet|Mist|Arch|Sheath|Water|Glow|Light/i.test(n)) { keep.push(ch); continue; }
    const mat = ch.material;
    if (!mat || Array.isArray(mat)) { keep.push(ch); continue; }
    if (mat.transparent && mat.opacity < 0.95 && !mat.vertexColors) { keep.push(ch); continue; }
    const key = mat.uuid;
    if (!byKey.has(key)) byKey.set(key, { mat, geos: [] });
    const g = ch.geometry.clone();
    ch.updateWorldMatrix(true, false);
    g.applyMatrix4(ch.matrixWorld);
    byKey.get(key).geos.push(g);
    ch.geometry.dispose();
    group.remove(ch);
  }
  for (const { mat, geos } of byKey.values()) {
    if (!geos.length) continue;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  for (const k of keep) { if (!k.parent) group.add(k); }
  return group;
}

export function buildSeongnamCityHall(data, { env = null, glbUrl = null, walkerGlbUrl = null } = {}) {
  const M = mats();
  if (env) {
    for (const k of ['glassBlue', 'glassCurtain', 'glassLite', 'water', 'frame', 'solar', 'sculpture', 'steelHoneycomb', 'steelPlate', 'stonePlaza']) {
      if (M[k]) { M[k].envMap = env; M[k].envMapIntensity = (M[k].envMapIntensity || 0.5) * 1.1; }
    }
  }
  const root = new THREE.Group(); root.name = 'seongnamCityHall';
  // Procedural building as sync fallback (tests / GLB fail); replaced when GLB loads
  const building = buildBuilding(data, M);
  const buildingHost = new THREE.Group(); buildingHost.name = 'cityhallBuildingHost';
  buildingHost.add(building.group);
  root.add(buildingHost);

  // [p6] amenity groups — merge static children to cut draw calls
  const grounds = buildGrounds(data, M);
  const banners = buildBanners(data, M);
  const sign = buildSeongnamSign(data, M);
  const pond = buildPond(data, M);
  const pondPlaza = buildPondMusicPlaza(data, M);
  const fountain = buildFountainComplex(data, M);
  const landscape = buildLandscape(data, M);
  const parking = buildParking(data, M);
  const gate = buildVehicleGate(data, M);
  const walker = buildWalkingSculpture(data, M, { walkerGlbUrl });
  const plazaExtras = buildPlazaExtras(data, M);
  const groundFloor = buildGroundFloor(data, M);
  mergeStaticGroup(grounds, 'cityhallGroundsMerged');
  mergeStaticGroup(banners, 'cityhallBannersMerged');
  mergeStaticGroup(pond, 'cityhallPondMerged');
  // merge static bits of plaza (rail/deck/seats); keep instanced jets/trees
  mergeStaticGroup(pondPlaza.group, 'cityhallPondPlazaMerged');
  mergeStaticGroup(landscape, 'cityhallLandscapeMerged');
  mergeStaticGroup(parking, 'cityhallParkingMerged');
  mergeStaticGroup(gate, 'cityhallGateMerged');
  // fountain + pondPlaza jets kept as instanced (animated)
  root.add(grounds, banners, sign, pond, pondPlaza.group, fountain.group, landscape, parking, gate, walker.group, plazaExtras.group, groundFloor.group);

  let glbNight = null;
  let eveningOn = false;
  const stopEve = watchEvening((on) => {
    eveningOn = !!on;
    if (building.night) building.night.visible = on;
    glbNight?.(on);
    groundFloor.setNight?.(on);
  });
  if (building.night) building.night.visible = false;

  let glbPending = null;
  if (glbUrl) {
    glbPending = import('./loadCityHallGlb.js').then(({ loadCityHallGlb }) =>
      loadCityHallGlb(glbUrl, { env: env || (typeof document !== 'undefined' ? makeEnvCube() : null) }).then((glb) => {
        if (!glb || disposed) return;
        const p = data.building.pos;
        glb.position.set(p.x, 0, p.z);
        building.group.removeFromParent();
        buildingHost.add(glb);
        glbNight = (on) => glb.userData.setNight?.(!!on);
        glbNight(eveningOn);
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
  let _playerPos = null;
  return {
    group: root,
    get stats() { return { name: 'seongnamCityHall', meshes, instanced }; },
    update(dt, t) {
      if (disposed) return;
      const tt = t ?? performance.now() / 1000;
      fountain.update(tt);
      pondPlaza.update(tt);
      plazaExtras.update?.(tt);
      groundFloor.update?.(dt, tt, _playerPos);
    },
    setPlayerPos(x, z) { _playerPos = { x, z }; },
    isBlocked(x, z, r = 0.4) {
      if (disposed) return false;
      if (pondPlaza.isBlocked?.(x, z, r)) return true;
      if (walker.isBlocked?.(x, z, r)) return true;
      if (groundFloor.isBlocked?.(x, z, r)) return true;
      const pr = CITYHALL_PILLAR_R + r;
      for (const [px, pz] of CITYHALL_PILLARS) {
        if (Math.hypot(x - px, z - pz) < pr) return true;
      }
      for (const c of CITYHALL_CORES) {
        if (Math.abs(x - c.cx) < c.hx + r && Math.abs(z - c.cz) < c.hz + r) return true;
      }
      const w = grounds.userData?.eastWall;
      if (w && Math.abs(x - w.x) < w.halfW + r && z >= w.z0 - r && z <= w.z1 + r) return true;
      return false;
    },
    groundHeight(x, z) {
      if (disposed) return null;
      let y = pondPlaza.groundHeight?.(x, z) ?? null;
      const oy = plazaExtras.groundHeight?.(x, z);
      if (oy != null) y = y == null ? oy : Math.max(y, oy);
      for (const b of grounds.userData?.promenadeBenches || []) {
        if (Math.hypot(x - b.x, z - b.z) < 1.15) {
          const by = (b.y ?? 0.44) - 0.03;
          y = y == null ? by : Math.max(y, by);
        }
      }
      return y;
    },
    tryElevator(px, pz, py) {
      if (disposed) return null;
      return plazaExtras.tryElevator?.(px, pz, py) || null;
    },
    findSeat(px, pz) {
      if (disposed) return null;
      let best = pondPlaza.findSeat?.(px, pz) || null;
      let bestD = best ? Math.hypot(px - best.x, pz - best.z) : 1.8;
      for (const b of grounds.userData?.promenadeBenches || []) {
        const d = Math.hypot(px - b.x, pz - b.z);
        if (d < bestD && d < 1.8) {
          bestD = d;
          best = {
            kind: 'bench',
            label: '🪑 산책길 벤치에 앉기 (C)',
            x: b.x, z: b.z, y: b.y ?? 0.44,
            ry: b.ry,
            exitX: b.x - 1.4, exitZ: b.z,
          };
        }
      }
      return best;
    },
    dispose() {
      if (disposed) return; disposed = true;
      stopEve(); fountain.disposeExtra?.(); pondPlaza.disposeExtra?.(); plazaExtras.disposeExtra?.(); groundFloor.disposeExtra?.();
      for (const m of grounds.userData?.benchMats || []) m.dispose?.();
      for (const g0 of grounds.userData?.benchGeos || []) g0.dispose?.();
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
