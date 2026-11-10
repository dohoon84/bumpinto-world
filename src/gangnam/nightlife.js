// [gangnam-nightlife] 강남 밤거리 네온·전광판·쇼윈도·골목등·출구 빛. 실제 조명은 쓰지 않고
//   아틀라스·인스턴스·발광 재질만 쓴다. ?gnight=0 · ?gangnam=0 이면 만들지 않는다.
//   모바일은 간판 절반·줄전구/젖은 도로/차선 빛줄기 없음.
import * as THREE from 'three';
import { nightFade, nightTarget } from '../world/nightFade.js';
import { NEON_COLORS, WINDOW_COLORS, SHOP_NAMES } from './nightlifePlace.js';

export function gangnamNightlifeEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search || '');
  return q.get('gangnam') !== '0' && q.get('gnight') !== '0';
}

const up = new THREE.Vector3(0, 1, 0);

function compose(m4, q, p, s, x, y, z, yaw, sx, sy, sz) {
  q.setFromAxisAngle(up, yaw);
  p.set(x, y, z);
  s.set(sx, sy, sz);
  m4.compose(p, q, s);
}

function everyNth(src, stride, n) {
  if (n <= 1) return src.slice();
  const out = [];
  const count = src.length / stride;
  for (let i = 0; i < count; i++) {
    if (i % n) continue;
    for (let k = 0; k < stride; k++) out.push(src[i * stride + k]);
  }
  return out;
}

function paintAtlas() {
  const colsH = 8, rowsH = 8, cw = 256, ch = 64;
  const colsV = 16, rowsV = 4, vw = 64, vh = 256;
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#050308';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const names = SHOP_NAMES;
  for (let i = 0; i < names.length; i++) {
    const col = NEON_COLORS[i % NEON_COLORS.length];
    const hx = (i % colsH) * cw;
    const hy = Math.floor(i / colsH) * ch;
    ctx.fillStyle = '#0b0712';
    ctx.fillRect(hx + 2, hy + 2, cw - 4, ch - 4);
    ctx.strokeStyle = col;
    ctx.lineWidth = 6;
    ctx.strokeRect(hx + 6, hy + 6, cw - 12, ch - 12);
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 16;
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 32px "Noto Sans KR", "Noto Sans CJK KR", "NanumGothic", sans-serif';
    ctx.fillText(names[i], hx + cw / 2, hy + ch / 2, cw - 28);
    ctx.restore();

    const vx = (i % colsV) * vw;
    const vy = 512 + Math.floor(i / colsV) * vh;
    ctx.fillStyle = '#0b0712';
    ctx.fillRect(vx + 2, vy + 2, vw - 4, vh - 4);
    ctx.strokeStyle = col;
    ctx.lineWidth = 5;
    ctx.strokeRect(vx + 5, vy + 5, vw - 10, vh - 10);
    const chars = [...names[i]];
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 14;
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const step = (vh - 24) / Math.max(1, chars.length);
    ctx.font = `800 ${Math.min(34, step * 0.78)}px "Noto Sans KR", "Noto Sans CJK KR", "NanumGothic", sans-serif`;
    chars.forEach((ch, ci) => ctx.fillText(ch, vx + vw / 2, vy + 14 + (ci + 0.5) * step));
    ctx.restore();
  }
  // LED ribbon for scrolling horizontal signs
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 1408, 2048, 128);
  const ribbon = '  강남대로 NIGHT   테헤란로   범프인투월드   별밤거리   NEON STREET   골목포차  ';
  ctx.fillStyle = '#7af0ff';
  ctx.shadowColor = '#3cf';
  ctx.shadowBlur = 12;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '800 56px "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
  ctx.fillText(ribbon + ribbon, 12, 1472);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = false;
  return { tex, colsH, rowsH, cw, ch, colsV, rowsV, vw, vh };
}

function signUv(kind, nameIdx, atlas) {
  if (kind === 0) {
    const col = nameIdx % atlas.colsV;
    const row = Math.floor(nameIdx / atlas.colsV);
    const u0 = col * atlas.vw / 2048;
    const v0 = (512 + row * atlas.vh) / 1536;
    return { u0, v0, u1: u0 + atlas.vw / 2048, v1: v0 + atlas.vh / 1536 };
  }
  const col = nameIdx % atlas.colsH;
  const row = Math.floor(nameIdx / atlas.colsH);
  const u0 = col * atlas.cw / 2048;
  const v0 = row * atlas.ch / 1536;
  return { u0, v0, u1: u0 + atlas.cw / 2048, v1: v0 + atlas.ch / 1536 };
}

function pushQuad(pos, nrm, uv, col, seed, idx, corners, color, sdv, uvs) {
  const base = pos.length / 3;
  for (let i = 0; i < 4; i++) {
    const c = corners[i];
    pos.push(c[0], c[1], c[2]);
    nrm.push(c[3], 0, c[4]);
    uv.push(uvs[i][0], uvs[i][1]);
    col.push(color.r, color.g, color.b);
    seed.push(sdv);
  }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function wallCorners(x, y, z, yaw, w, h) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const hx = w / 2, hy = h / 2;
  // plane faces +Z; after yaw, normal = (sin, 0, cos)
  const nx = s, nz = c;
  const ax = c, az = -s; // along-wall
  const p = (lx, ly) => [x + ax * lx + nx * 0.02, y + ly, z + az * lx + nz * 0.02, nx, nz];
  return [p(-hx, -hy), p(hx, -hy), p(hx, hy), p(-hx, hy)];
}

function makeSignMaterial(map) {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}

function makeUnlitColor(opts = {}) {
  return new THREE.MeshBasicMaterial({
    color: opts.color || '#ffffff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    side: opts.side || THREE.DoubleSide,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    map: opts.map || null,
    polygonOffset: !!opts.poly,
    polygonOffsetFactor: opts.poly ? -2 : 0,
    polygonOffsetUnits: opts.poly ? -2 : 0,
  });
}

const FACADE_VARIANTS = [
  { title: '강남대로', sub: 'NIGHT', cols: ['#00e8ff', '#4a86ff', '#7af0ff', '#c45cff'], mode: 'scan' },
  { title: '테헤란로', sub: 'TEHERAN', cols: ['#ffd84a', '#ff7a18', '#ffb347', '#fff1c2'], mode: 'blocks' },
  { title: 'BUMPINTO', sub: 'WORLD', cols: ['#4a86ff', '#c45cff', '#ff2d8a', '#7af0ff'], mode: 'news' },
  { title: '별밤거리', sub: 'NEON', cols: ['#ff2d8a', '#ff3df0', '#c45cff', '#ff9ad5'], mode: 'dots' },
  { title: '사거리', sub: 'LIVE', cols: ['#19e6c2', '#8aff3a', '#00e8ff', '#ffd84a'], mode: 'diag' },
  { title: '범프인투', sub: 'SEOUL', cols: ['#ff3355', '#ff7a18', '#ffd84a', '#f4f7ff'], mode: 'type' },
];

function facadeTex(variant) {
  const { title, sub, cols, mode } = variant;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 512;
  const c = canvas.getContext('2d');
  c.fillStyle = '#050308';
  c.fillRect(0, 0, 256, 512);
  if (mode === 'scan') {
    for (let y = 0; y < 16; y++) {
      c.fillStyle = cols[y % cols.length];
      c.fillRect(0, y * 32, 256, 28);
      c.fillStyle = 'rgba(0,0,0,0.28)';
      for (let x = 0; x < 8; x++) c.fillRect(x * 32 + 3, y * 32 + 5, 26, 18);
    }
  } else if (mode === 'blocks') {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      c.fillStyle = cols[(x + y) % cols.length];
      c.fillRect(x * 64 + 3, y * 64 + 3, 58, 58);
    }
  } else if (mode === 'news') {
    for (let y = 0; y < 10; y++) {
      c.fillStyle = cols[y % cols.length];
      c.fillRect(0, y * 51, 256, 46);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(8, y * 51 + 10, 240, 26);
    }
  } else if (mode === 'dots') {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 12; x++) {
      c.fillStyle = cols[(x + y) % cols.length];
      c.beginPath();
      c.arc(x * 21 + 12, y * 21 + 12, 7, 0, Math.PI * 2);
      c.fill();
    }
  } else if (mode === 'diag') {
    c.save();
    c.translate(128, 256);
    c.rotate(-0.4);
    for (let i = -12; i < 12; i++) {
      c.fillStyle = cols[((i % cols.length) + cols.length) % cols.length];
      c.fillRect(-220, i * 36, 440, 28);
    }
    c.restore();
  } else {
    c.fillStyle = cols[0];
    c.fillRect(0, 0, 256, 512);
    for (let y = 0; y < 6; y++) {
      c.fillStyle = cols[(y + 1) % cols.length];
      c.fillRect(0, 70 + y * 70, 256, 18);
    }
  }
  c.fillStyle = '#f4f7ff';
  c.font = '800 36px "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
  c.textAlign = 'center';
  c.shadowColor = cols[0];
  c.shadowBlur = 14;
  c.fillText(title, 128, 90, 230);
  c.font = '800 42px "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
  c.fillText(sub, 128, 280, 230);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function makeFacadeMaterial(variant) {
  return new THREE.MeshBasicMaterial({
    map: facadeTex(variant),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
}

function streakTex(from, via, to) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 8;
  const c = canvas.getContext('2d');
  const g = c.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, from);
  g.addColorStop(0.4, via);
  g.addColorStop(1, to);
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  return tex;
}

function poolTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const c = canvas.getContext('2d');
  const g = c.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.4, 'rgba(255,230,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function windowTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const c = canvas.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, 128, 128);
  const panes = [[8, 8, 50, 50], [70, 8, 50, 50], [8, 70, 50, 50], [70, 70, 50, 50]];
  for (const [x, y, w, h] of panes) {
    const g = c.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(255,236,190,0.95)');
    g.addColorStop(0.65, 'rgba(255,200,120,0.62)');
    g.addColorStop(1, 'rgba(255,150,70,0.28)');
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
  }
  c.fillStyle = '#000';
  c.fillRect(58, 6, 12, 116);
  c.fillRect(6, 58, 116, 12);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  return tex;
}

function zebraTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const c = canvas.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(230,244,255,0)');
    g.addColorStop(0.25, 'rgba(230,244,255,0.85)');
    g.addColorStop(0.75, 'rgba(230,244,255,0.85)');
    g.addColorStop(1, 'rgba(230,244,255,0)');
    c.fillStyle = g;
    c.fillRect(i * 32 + 6, 0, 16, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  return tex;
}

function makeHaloMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const c = canvas.getContext('2d');
  const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,220,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
  });
}

export function createGangnamNightlife({ scene, terrain = null, url, mobile = false }) {
  nightTarget();
  const root = new THREE.Group();
  root.name = 'gangnamNightlife';
  scene.add(root);
  const stats = { loaded: false, mobile, draws: 0 };
  let dead = false;
  let box = null;
  let meshes = null;
  const ground = (x, z) => (terrain ? terrain.renderHeight(x, z) : 0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const tmpC = new THREE.Color();

  const ready = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
    if (!j || dead) return;
    box = j.boxes?.[0] || null;
    const atlas = paintAtlas();

    let signSrc = j.signs || [];
    if (mobile) signSrc = everyNth(signSrc, 10, 2);
    const pos = [], nrm = [], uv = [], col = [], seed = [], idx = [];
    const haloItems = [];
    const cabItems = [];
    for (let i = 0; i < signSrc.length; i += 10) {
      const x = signSrc[i], y = signSrc[i + 1], z = signSrc[i + 2], yaw = signSrc[i + 3];
      const w = signSrc[i + 4], h = signSrc[i + 5], ni = signSrc[i + 6] | 0, ci = signSrc[i + 7] | 0, kind = signSrc[i + 8] | 0;
      const sd = signSrc[i + 9] || 0.2;
      const gy = ground(x, z) + y;
      const uvs = signUv(kind, ni % SHOP_NAMES.length, atlas);
      const uvQuad = [[uvs.u0, uvs.v1], [uvs.u1, uvs.v1], [uvs.u1, uvs.v0], [uvs.u0, uvs.v0]];
      const color = tmpC.set(NEON_COLORS[ci % NEON_COLORS.length]).clone();
      const seedVal = kind === 1 ? -1 - sd : 0.15 + sd;
      pushQuad(pos, nrm, uv, col, seed, idx, wallCorners(x, gy, z, yaw, w, h), color, seedVal, uvQuad);
      if (kind === 2) {
        pushQuad(pos, nrm, uv, col, seed, idx, wallCorners(x, gy, z, yaw + Math.PI, w, h), color, seedVal, uvQuad);
      }
      haloItems.push(x, gy, z, yaw, Math.max(w, 1.2) * 1.08, Math.max(h, 1.2) * 1.08, ci);
      cabItems.push(x, gy, z, yaw, w * 1.12, h * 1.2, ci);
    }
    const signGeo = new THREE.BufferGeometry();
    signGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    signGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    signGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    signGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    signGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    signGeo.setIndex(idx);
    signGeo.computeBoundingSphere();
    const signMat = makeSignMaterial(atlas.tex);
    const signs = new THREE.Mesh(signGeo, signMat);
    signs.name = 'gnightSigns';
    signs.frustumCulled = false;
    signs.renderOrder = 4;
    root.add(signs);
    const cabN = cabItems.length / 7;
    const backMat = makeUnlitColor({ color: '#ffffff', additive: true, poly: true, side: THREE.FrontSide });
    const backs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), backMat, Math.max(1, cabN));
    backs.name = 'gnightSignCabinets';
    backs.frustumCulled = false;
    backs.renderOrder = 3;
    for (let i = 0; i < cabN; i++) {
      const x = cabItems[i * 7], y = cabItems[i * 7 + 1], z = cabItems[i * 7 + 2], yaw = cabItems[i * 7 + 3];
      const nx = Math.sin(yaw), nz = Math.cos(yaw);
      compose(m4, q, p, s, x - nx * 0.05, y, z - nz * 0.05, yaw, cabItems[i * 7 + 4], cabItems[i * 7 + 5], 1);
      backs.setMatrixAt(i, m4);
      backs.setColorAt(i, tmpC.set(NEON_COLORS[cabItems[i * 7 + 6] % NEON_COLORS.length]));
    }
    backs.count = cabN;
    backs.instanceMatrix.needsUpdate = true;
    if (backs.instanceColor) backs.instanceColor.needsUpdate = true;
    backs.computeBoundingSphere();
    root.add(backs);
    stats.signs = signSrc.length / 10;

    const haloMat = makeHaloMaterial();
    const hn = haloItems.length / 7;
    const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), haloMat, Math.max(1, hn));
    halos.name = 'gnightHalos';
    halos.frustumCulled = false;
    halos.renderOrder = 2;
    for (let i = 0; i < hn; i++) {
      compose(m4, q, p, s, haloItems[i * 7], haloItems[i * 7 + 1], haloItems[i * 7 + 2], haloItems[i * 7 + 3], haloItems[i * 7 + 4], haloItems[i * 7 + 5], 1);
      halos.setMatrixAt(i, m4);
      halos.setColorAt(i, tmpC.set(NEON_COLORS[haloItems[i * 7 + 6] % NEON_COLORS.length]));
    }
    if (hn) { halos.instanceMatrix.needsUpdate = true; if (halos.instanceColor) halos.instanceColor.needsUpdate = true; }
    halos.computeBoundingSphere();
    root.add(halos);

    let winSrc = j.windows || [];
    if (mobile) winSrc = everyNth(winSrc, 7, 2);
    const wn = winSrc.length / 7;
    const wmat = makeUnlitColor({ map: windowTex(), additive: true, poly: true, side: THREE.FrontSide });
    const wins = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), wmat, Math.max(1, wn));
    wins.name = 'gnightWindows';
    for (let i = 0; i < wn; i++) {
      const x = winSrc[i * 7], y = winSrc[i * 7 + 1], z = winSrc[i * 7 + 2], yaw = winSrc[i * 7 + 3];
      compose(m4, q, p, s, x, ground(x, z) + y, z, yaw, winSrc[i * 7 + 4], winSrc[i * 7 + 5], 1);
      wins.setMatrixAt(i, m4);
      wins.setColorAt(i, tmpC.set(WINDOW_COLORS[winSrc[i * 7 + 6] % WINDOW_COLORS.length]));
    }
    wins.count = wn;
    wins.instanceMatrix.needsUpdate = true;
    if (wins.instanceColor) wins.instanceColor.needsUpdate = true;
    wins.computeBoundingSphere();
    root.add(wins);
    stats.windows = wn;

    const facSrc = j.facades || [];
    const fn = facSrc.length / 7;
    const VARIANT_N = FACADE_VARIANTS.length;
    const groups = Array.from({ length: VARIANT_N }, () => []);
    for (let i = 0; i < fn; i++) groups[(facSrc[i * 7 + 6] | 0) % VARIANT_N].push(i);
    const facadeMeshes = [];
    const facadeMats = [];
    for (let v = 0; v < VARIANT_N; v++) {
      const ids = groups[v];
      const fmat = makeFacadeMaterial(FACADE_VARIANTS[v]);
      const facades = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), fmat, Math.max(1, ids.length));
      facades.name = 'gnightFacades' + v;
      facades.renderOrder = 3;
      for (let k = 0; k < ids.length; k++) {
        const i = ids[k];
        const x = facSrc[i * 7], y = facSrc[i * 7 + 1], z = facSrc[i * 7 + 2], yaw = facSrc[i * 7 + 3];
        compose(m4, q, p, s, x, ground(x, z) + y, z, yaw, facSrc[i * 7 + 4], facSrc[i * 7 + 5], 1);
        facades.setMatrixAt(k, m4);
        facades.setColorAt(k, tmpC.set(NEON_COLORS[facSrc[i * 7 + 6] % NEON_COLORS.length]));
      }
      facades.count = ids.length;
      facades.instanceMatrix.needsUpdate = true;
      if (facades.instanceColor) facades.instanceColor.needsUpdate = true;
      facades.computeBoundingSphere();
      root.add(facades);
      facadeMeshes.push(facades);
      facadeMats.push(fmat);
    }
    stats.facades = fn;

    let stripSrc = j.strips || [];
    if (mobile) stripSrc = everyNth(stripSrc, 8, 2);
    const sn = stripSrc.length / 8;
    const smat = makeUnlitColor({ color: '#7af0ff' });
    const strips = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), smat, Math.max(1, sn));
    strips.name = 'gnightStrips';
    strips.renderOrder = 3;
    for (let i = 0; i < sn; i++) {
      const x = stripSrc[i * 8], y = stripSrc[i * 8 + 1], z = stripSrc[i * 8 + 2], yaw = stripSrc[i * 8 + 3];
      compose(m4, q, p, s, x, ground(x, z) + y, z, yaw, stripSrc[i * 8 + 4], stripSrc[i * 8 + 5], 1);
      strips.setMatrixAt(i, m4);
      strips.setColorAt(i, tmpC.set(NEON_COLORS[stripSrc[i * 8 + 6] % NEON_COLORS.length]));
    }
    strips.count = sn;
    strips.instanceMatrix.needsUpdate = true;
    if (strips.instanceColor) strips.instanceColor.needsUpdate = true;
    strips.computeBoundingSphere();
    root.add(strips);
    stats.strips = sn;

    let lanSrc = j.lanterns || [];
    if (mobile) lanSrc = everyNth(lanSrc, 5, 2);
    const ln = lanSrc.length / 5;
    const lmat = makeUnlitColor({ color: '#ff7a18', additive: true });
    const lanterns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), lmat, Math.max(1, ln));
    lanterns.name = 'gnightLanterns';
    lanterns.renderOrder = 4;
    const lanCols = ['#ff7a18', '#ff3355', '#ffd84a', '#ff2d8a', '#ffb347', '#ff5a7a'];
    for (let i = 0; i < ln; i++) {
      const x = lanSrc[i * 5], y = lanSrc[i * 5 + 1], z = lanSrc[i * 5 + 2], sc = lanSrc[i * 5 + 4] || 0.26;
      compose(m4, q, p, s, x, ground(x, z) + y, z, 0, sc, sc, sc);
      lanterns.setMatrixAt(i, m4);
      lanterns.setColorAt(i, tmpC.set(lanCols[lanSrc[i * 5 + 3] % lanCols.length]));
    }
    lanterns.count = ln;
    lanterns.instanceMatrix.needsUpdate = true;
    if (lanterns.instanceColor) lanterns.instanceColor.needsUpdate = true;
    lanterns.computeBoundingSphere();
    root.add(lanterns);
    stats.lanterns = ln;

    let strings = null, strMat = null;
    if (!mobile && j.strings?.length) {
      const src = j.strings;
      const tn = src.length / 3;
      strMat = makeUnlitColor({ color: '#ffe6a8', additive: true });
      strings = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), strMat, tn);
      strings.name = 'gnightStrings';
      strings.renderOrder = 4;
      for (let i = 0; i < tn; i++) {
        compose(m4, q, p, s, src[i * 3], ground(src[i * 3], src[i * 3 + 2]) + src[i * 3 + 1], src[i * 3 + 2], 0, 0.08, 0.08, 0.08);
        strings.setMatrixAt(i, m4);
      }
      strings.instanceMatrix.needsUpdate = true;
      strings.computeBoundingSphere();
      root.add(strings);
      stats.strings = tn;
    }

    const exSrc = j.exits || [];
    const en = exSrc.length / 7;
    const exMat = makeUnlitColor({ map: poolTex(), color: '#7dffb0', additive: true });
    const exits = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), exMat, Math.max(1, en));
    exits.name = 'gnightExits';
    exits.renderOrder = 2;
    for (let i = 0; i < en; i++) {
      const x = exSrc[i * 7], y = exSrc[i * 7 + 1], z = exSrc[i * 7 + 2], yaw = exSrc[i * 7 + 3];
      const w = exSrc[i * 7 + 4], h = exSrc[i * 7 + 5], kind = exSrc[i * 7 + 6] | 0;
      if (kind === 0) {
        const r = Math.max(w, h) * 0.55;
        q.setFromAxisAngle(up, yaw);
        p.set(x, ground(x, z) + 0.07, z);
        s.set(r, 1, r);
        m4.compose(p, q, s);
        m4.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
      } else {
        compose(m4, q, p, s, x, ground(x, z) + y, z, yaw, w, h, 1);
      }
      exits.setMatrixAt(i, m4);
      exits.setColorAt(i, tmpC.set(kind === 0 ? '#7dffb0' : kind === 1 ? '#fff1c2' : '#5cff9a'));
    }
    exits.count = en;
    exits.instanceMatrix.needsUpdate = true;
    if (exits.instanceColor) exits.instanceColor.needsUpdate = true;
    exits.computeBoundingSphere();
    root.add(exits);
    stats.exits = en;

    const crSrc = j.crossings || [];
    const cn = crSrc.length / 6;
    const crMat = makeUnlitColor({ map: zebraTex(), color: '#e8f4ff', additive: true });
    const crossings = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), crMat, Math.max(1, cn));
    crossings.name = 'gnightCrossings';
    crossings.renderOrder = 1;
    for (let i = 0; i < cn; i++) {
      compose(m4, q, p, s, crSrc[i * 6], ground(crSrc[i * 6], crSrc[i * 6 + 2]) + 0.05, crSrc[i * 6 + 2], crSrc[i * 6 + 3], crSrc[i * 6 + 4], 1, crSrc[i * 6 + 5]);
      crossings.setMatrixAt(i, m4);
    }
    crossings.count = cn;
    crossings.instanceMatrix.needsUpdate = true;
    crossings.computeBoundingSphere();
    root.add(crossings);

    const sgSrc = j.signals || [];
    const gn = sgSrc.length / 4;
    const sgMat = makeUnlitColor({ color: '#ff3355', additive: true });
    const signals = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), sgMat, Math.max(1, gn));
    signals.name = 'gnightSignals';
    signals.renderOrder = 4;
    const sgCol = ['#ff2a3a', '#ffd84a', '#3dff6a'];
    for (let i = 0; i < gn; i++) {
      compose(m4, q, p, s, sgSrc[i * 4], ground(sgSrc[i * 4], sgSrc[i * 4 + 2]) + sgSrc[i * 4 + 1], sgSrc[i * 4 + 2], 0, 0.18, 0.18, 0.18);
      signals.setMatrixAt(i, m4);
      signals.setColorAt(i, tmpC.set(sgCol[sgSrc[i * 4 + 3] % 3]));
    }
    signals.count = gn;
    signals.instanceMatrix.needsUpdate = true;
    if (signals.instanceColor) signals.instanceColor.needsUpdate = true;
    signals.computeBoundingSphere();
    root.add(signals);

    let heads = null, tails = null, wet = null, hmat = null, tmat = null, wetmat = null;
    if (!mobile && j.heads?.length) {
      const src = j.heads; const n = src.length / 4;
      hmat = makeUnlitColor({ map: streakTex('rgba(255,244,210,0)', 'rgba(255,244,210,.95)', 'rgba(180,210,255,0)'), additive: true });
      heads = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), hmat, n);
      heads.name = 'gnightHeads';
      heads.renderOrder = 2;
      for (let i = 0; i < n; i++) {
        compose(m4, q, p, s, src[i * 4], ground(src[i * 4], src[i * 4 + 1]) + 0.28, src[i * 4 + 1], src[i * 4 + 2] + Math.PI / 2, src[i * 4 + 3], 1, 1.2);
        heads.setMatrixAt(i, m4);
      }
      heads.instanceMatrix.needsUpdate = true;
      heads.computeBoundingSphere();
      root.add(heads);
      stats.heads = n;
    }
    if (!mobile && j.tails?.length) {
      const src = j.tails; const n = src.length / 4;
      tmat = makeUnlitColor({ map: streakTex('rgba(255,40,50,0)', 'rgba(255,50,60,.9)', 'rgba(255,80,40,0)'), additive: true });
      tails = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), tmat, n);
      tails.name = 'gnightTails';
      tails.renderOrder = 2;
      for (let i = 0; i < n; i++) {
        compose(m4, q, p, s, src[i * 4], ground(src[i * 4], src[i * 4 + 1]) + 0.26, src[i * 4 + 1], src[i * 4 + 2] + Math.PI + Math.PI / 2, src[i * 4 + 3], 1, 1.2);
        tails.setMatrixAt(i, m4);
      }
      tails.instanceMatrix.needsUpdate = true;
      tails.computeBoundingSphere();
      root.add(tails);
      stats.tails = n;
    }
    if (!mobile && (j.wet?.length || wn)) {
      const src = j.wet || [];
      const wetN = src.length / 5;
      const poolN = wetN + wn;
      wetmat = makeUnlitColor({ map: poolTex(), additive: true });
      wet = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), wetmat, Math.max(1, poolN));
      wet.name = 'gnightWet';
      wet.renderOrder = 1;
      for (let i = 0; i < wetN; i++) {
        const dia = Math.min(src[i * 5 + 3], src[i * 5 + 4]);
        compose(m4, q, p, s, src[i * 5], ground(src[i * 5], src[i * 5 + 1]) + 0.045, src[i * 5 + 1], src[i * 5 + 2], dia, 1, dia);
        wet.setMatrixAt(i, m4);
        wet.setColorAt(i, tmpC.set('#9ad8ff'));
      }
      for (let i = 0; i < wn; i++) {
        const x = winSrc[i * 7], z = winSrc[i * 7 + 2], yaw = winSrc[i * 7 + 3];
        const nx = Math.sin(yaw), nz = Math.cos(yaw);
        const px = x + nx * 1.35, pz = z + nz * 1.35;
        const dia = Math.max(2.8, winSrc[i * 7 + 4] * 1.15);
        compose(m4, q, p, s, px, ground(px, pz) + 0.04, pz, yaw, dia, 1, dia);
        wet.setMatrixAt(wetN + i, m4);
        wet.setColorAt(wetN + i, tmpC.set(WINDOW_COLORS[winSrc[i * 7 + 6] % WINDOW_COLORS.length]));
      }
      wet.count = poolN;
      wet.instanceMatrix.needsUpdate = true;
      if (wet.instanceColor) wet.instanceColor.needsUpdate = true;
      wet.computeBoundingSphere();
      root.add(wet);
      stats.wet = poolN;
    }

    let cars = null;
    if (!mobile && j.lanes?.length) {
      const CARS = 8;
      const usable = [];
      let total = 0;
      for (const lane of j.lanes) {
        if ((lane.length / 3) >= 8) { usable.push(lane); total += CARS; }
      }
      if (total) {
        const bodyMat = new THREE.MeshBasicMaterial({ color: '#16161f', transparent: true, opacity: 0, toneMapped: false, depthWrite: true });
        const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyMat, total);
        bodies.name = 'gnightCars';
        bodies.frustumCulled = false;
        const chMat = makeUnlitColor({ color: '#fff4d0', additive: true });
        const ctMat = makeUnlitColor({ color: '#ff3040', additive: true });
        const carHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), chMat, total * 2);
        const carTails = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), ctMat, total * 2);
        carHeads.name = 'gnightCarHeads';
        carTails.name = 'gnightCarTails';
        carHeads.frustumCulled = false;
        carTails.frustumCulled = false;
        carHeads.renderOrder = 3;
        carTails.renderOrder = 3;
        root.add(bodies); root.add(carHeads); root.add(carTails);
        cars = { bodies, bodyMat, carHeads, chMat, carTails, ctMat, usable, CARS, total };
        stats.cars = total;
      }
    }

    meshes = {
      signs, signMat, backs, backMat, halos, haloMat, wins, wmat, facadeMeshes, facadeMats, strips, smat,
      lanterns, lmat, strings, strMat, exits, exMat, crossings, crMat, signals, sgMat,
      heads, hmat, tails, tmat, wet, wetmat, cars,
    };
    stats.loaded = true;
    apply(1);
  });

  function near(x, z) {
    if (!box) return true;
    return x >= box.x0 - 700 && x <= box.x1 + 700 && z >= box.z0 - 700 && z <= box.z1 + 700;
  }
  near.here = false;

  function apply(v) {
    if (!meshes) return;
    const on = near.here;
    const n = on ? v : 0;
    const daySign = on ? Math.max(0.38, n) : 0;
    meshes.signMat.opacity = on ? (0.62 + n * 0.38) : 0;
    meshes.signs.visible = on;
    if (meshes.backMat) {
      meshes.backMat.opacity = n * 0.42;
      meshes.backs.visible = on && n > 0.04;
    }
    meshes.haloMat.opacity = n * (mobile ? 0.18 : 0.28);
    meshes.halos.visible = on && n > 0.04;
    meshes.wmat.opacity = n * (mobile ? 0.5 : 0.78);
    meshes.wins.visible = on && n > 0.04;
    if (meshes.facadeMats) {
      for (let v = 0; v < meshes.facadeMats.length; v++) {
        meshes.facadeMats[v].opacity = n * 0.95;
        meshes.facadeMeshes[v].visible = on && n > 0.04;
        if (meshes.facadeMats[v].map) meshes.facadeMats[v].map.offset.y = (performance.now() / (2400 + v * 280) + v * 0.17) % 1;
      }
    }
    meshes.smat.opacity = n * 0.95;
    meshes.strips.visible = on && n > 0.04;
    meshes.lmat.opacity = n * 0.85;
    meshes.lanterns.visible = on && n > 0.04;
    if (meshes.strings) {
      meshes.strMat.opacity = n * (0.55 + 0.25 * Math.sin(performance.now() * 0.004));
      meshes.strings.visible = on && n > 0.04;
    }
    meshes.exMat.opacity = n * 0.42;
    meshes.exits.visible = on && n > 0.04;
    meshes.crMat.opacity = n * 0.22;
    meshes.crossings.visible = on && n > 0.04;
    meshes.sgMat.opacity = on ? 0.55 + n * 0.4 : 0;
    meshes.signals.visible = on;
    if (meshes.heads) {
      meshes.hmat.opacity = n * 0.92;
      meshes.heads.visible = on && n > 0.04;
      if (meshes.hmat.map) meshes.hmat.map.offset.x = (performance.now() / 700) % 1;
    }
    if (meshes.tails) {
      meshes.tmat.opacity = n * 0.88;
      meshes.tails.visible = on && n > 0.04;
      if (meshes.tmat.map) meshes.tmat.map.offset.x = (performance.now() / 760) % 1;
    }
    if (meshes.wet) {
      meshes.wetmat.opacity = n * 0.16;
      meshes.wet.visible = on && n > 0.04;
    }
    if (meshes.cars) {
      const c = meshes.cars;
      const show = on && n > 0.04;
      c.bodies.visible = show;
      c.carHeads.visible = show;
      c.carTails.visible = show;
      c.bodyMat.opacity = show ? 0.92 : 0;
      c.chMat.opacity = n * 0.95;
      c.ctMat.opacity = n * 0.9;
      if (show) tickCars(c);
    }
    let draws = 0;
    const listed = [meshes.signs, meshes.backs, meshes.halos, meshes.wins, meshes.strips, meshes.lanterns, meshes.strings, meshes.exits, meshes.crossings, meshes.signals, meshes.heads, meshes.tails, meshes.wet];
    if (meshes.facadeMeshes) listed.push(...meshes.facadeMeshes);
    if (meshes.cars) listed.push(meshes.cars.bodies, meshes.cars.carHeads, meshes.cars.carTails);
    for (const m of listed) {
      if (m && m.visible) draws++;
    }
    stats.draws = draws;
  }

  function tickCars(c) {
    const t = performance.now() / 1000;
    const speed = 12;
    const spacing = 4;
    let ci = 0;
    for (const lane of c.usable) {
      const nPts = lane.length / 3;
      const pathLen = Math.max(1, (nPts - 1) * spacing);
      for (let k = 0; k < c.CARS; k++) {
        const dist = ((t * speed + k * pathLen / c.CARS) % pathLen + pathLen) % pathLen;
        const u = dist / spacing;
        const i0 = Math.min(nPts - 2, Math.floor(u));
        const f = u - i0;
        const i1 = i0 + 1;
        const x = lane[i0 * 3] + (lane[i1 * 3] - lane[i0 * 3]) * f;
        const z = lane[i0 * 3 + 1] + (lane[i1 * 3 + 1] - lane[i0 * 3 + 1]) * f;
        let dy = lane[i1 * 3 + 2] - lane[i0 * 3 + 2];
        if (dy > Math.PI) dy -= Math.PI * 2;
        if (dy < -Math.PI) dy += Math.PI * 2;
        const yaw = lane[i0 * 3 + 2] + dy * f;
        const gy = ground(x, z) + 0.62;
        compose(m4, q, p, s, x, gy, z, yaw, 1.7, 1.12, 4.2);
        c.bodies.setMatrixAt(ci, m4);
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        compose(m4, q, p, s, x + fx * 2.05 + rx * 0.5, gy + 0.12, z + fz * 2.05 + rz * 0.5, 0, 0.32, 0.28, 0.28);
        c.carHeads.setMatrixAt(ci * 2, m4);
        compose(m4, q, p, s, x + fx * 2.05 - rx * 0.5, gy + 0.12, z + fz * 2.05 - rz * 0.5, 0, 0.32, 0.28, 0.28);
        c.carHeads.setMatrixAt(ci * 2 + 1, m4);
        compose(m4, q, p, s, x - fx * 2.05 + rx * 0.5, gy + 0.12, z - fz * 2.05 + rz * 0.5, 0, 0.26, 0.2, 0.2);
        c.carTails.setMatrixAt(ci * 2, m4);
        compose(m4, q, p, s, x - fx * 2.05 - rx * 0.5, gy + 0.12, z - fz * 2.05 - rz * 0.5, 0, 0.26, 0.2, 0.2);
        c.carTails.setMatrixAt(ci * 2 + 1, m4);
        ci++;
      }
    }
    c.bodies.instanceMatrix.needsUpdate = true;
    c.carHeads.instanceMatrix.needsUpdate = true;
    c.carTails.instanceMatrix.needsUpdate = true;
  }

  let acc = 0;
  return {
    root, stats, ready,
    update(dt, x, z) {
      if (!meshes) return;
      acc += dt;
      if (acc > 0.4) { acc = 0; near.here = near(x, z); }
      apply(nightFade());
    },
    dispose() {
      dead = true;
      root.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose();
          if (o.material) {
            o.material.map?.dispose?.();
            o.material.uniforms?.uMap?.value?.dispose?.();
            o.material.dispose?.();
          }
        }
      });
      scene.remove(root);
      meshes = null;
    },
  };
}
