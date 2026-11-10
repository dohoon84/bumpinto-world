// [gangnam-street] 강남대로·테헤란로 OSM 정류장 쉘터와 먹자골목 소품.
//   중앙버스전용차로 장대 쉘터(모듈 여러 개). BIS 는 노선 번호 자막만.
//   ?gstreet=0 · ?gangnam=0 이면 만들지 않는다.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { nightFade } from '../world/nightFade.js';

export function gangnamStreetEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search || '');
  return q.get('gangnam') !== '0' && q.get('gstreet') !== '0';
}

const up = new THREE.Vector3(0, 1, 0);

const StreetXform = {
  compose(m4, quat, pos, scl, x, y, z, yaw, sx, sy, sz) {
    quat.setFromAxisAngle(up, yaw);
    pos.set(x, y, z);
    scl.set(sx, sy, sz);
    m4.compose(pos, quat, scl);
  },
};

function boxGeo(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
function cylGeo(r, h, x, y, z) {
  const g = new THREE.CylinderGeometry(r, r, h, 6);
  g.translate(x, y, z);
  return g;
}
function merge(parts) {
  const g = BufferGeometryUtils.mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

function atlasMaterial(tex) {
  return new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 1, side: THREE.FrontSide,
    depthWrite: false, toneMapped: false,
  });
}

function bindSlotAtlas(mat, texInfo, key) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float slot;\nvarying float vSlot;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSlot = slot;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSlot;\nuniform float uCols;\nuniform float uRows;')
      .replace('#include <map_fragment>', [
        '#ifdef USE_MAP',
        'vec2 cell = vec2(mod(vSlot, uCols), floor(vSlot / uCols));',
        'vec2 uv2;',
        'uv2.x = (vMapUv.x + cell.x) / uCols;',
        'uv2.y = 1.0 - (cell.y + 1.0 - vMapUv.y) / uRows;',
        'vec4 sampledDiffuseColor = texture2D(map, uv2);',
        'diffuseColor *= sampledDiffuseColor;',
        '#endif',
      ].join('\n'));
    sh.uniforms.uCols = { value: texInfo.cols };
    sh.uniforms.uRows = { value: texInfo.rows };
  };
  mat.customProgramCacheKey = () => key;
}

function paintAtlas(items, colW, rowH, cols, draw) {
  const rows = Math.max(1, Math.ceil(items.length / cols));
  const canvas = document.createElement('canvas');
  canvas.width = colW * cols; canvas.height = rowH * rows;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  items.forEach((it, i) => draw(c, it, (i % cols) * colW, Math.floor(i / cols) * rowH, colW, rowH));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  return { tex, cols, rows };
}

function makeNameAtlas(stops) {
  return paintAtlas(stops.length ? stops : [{ name: '강남역' }], 256, 80, 4, (c, st, cx, cy, colW, rowH) => {
    c.fillStyle = '#0b2a6e';
    c.fillRect(cx + 4, cy + 6, colW - 8, rowH - 12);
    c.fillStyle = '#f4f7ff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = 'bold 22px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    c.fillText(String(st.name || '정류장').slice(0, 14), cx + colW / 2, st.toward ? cy + rowH / 2 - 12 : cy + rowH / 2);
    if (st.toward) {
      c.fillStyle = '#d5e6ff';
      c.font = 'bold 14px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
      c.fillText(`${st.toward} 방면`, cx + colW / 2, cy + rowH / 2 + 16);
    }
  });
}

function makeShopAtlas() {
  const names = ['골목24', '나인마트', '팝코너', '오후커피', '나무사이', '작은컵', '한그릇', '국밥집', '분식집', '골목밥상', '노란집', '저녁상'];
  return paintAtlas(names, 192, 48, 4, (c, name, cx, cy, colW, rowH) => {
    c.fillStyle = '#1a1020';
    c.fillRect(cx + 2, cy + 4, colW - 4, rowH - 8);
    c.fillStyle = '#ffe9a8';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = 'bold 20px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    c.fillText(name, cx + colW / 2, cy + rowH / 2);
  });
}

function makeLedTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 80;
  const c = canvas.getContext('2d');
  c.fillStyle = '#021208';
  c.fillRect(0, 0, 512, 80);
  c.fillStyle = '#46ff8e';
  c.font = 'bold 36px "Noto Sans KR", monospace';
  c.textBaseline = 'middle';
  c.shadowColor = '#14ff74'; c.shadowBlur = 12;
  c.fillText('140   400   402   470   9404   146   341   360   740   145   340', 16, 42);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function zebraTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 256;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 64, 256);
  for (let i = 0; i < 8; i++) {
    c.fillStyle = '#ffffff';
    c.fillRect(0, i * 32 + 4, 64, 18);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeAdTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 192;
  const c = canvas.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 192);
  g.addColorStop(0, '#3a4e78');
  g.addColorStop(0.45, '#f0d08a');
  g.addColorStop(1, '#243656');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 192);
  c.fillStyle = 'rgba(255,240,200,0.55)';
  c.fillRect(14, 22, 100, 52);
  c.fillStyle = 'rgba(160,210,255,0.4)';
  c.fillRect(14, 88, 100, 82);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  return tex;
}

function shelterMetal(median) {
  const L = median ? 8.2 : 6.6, W = median ? 2.5 : 1.95;
  return merge([
    cylGeo(0.07, 2.85, -L * 0.42, 1.42, -W * 0.42),
    cylGeo(0.07, 2.85, L * 0.42, 1.42, -W * 0.42),
    cylGeo(0.07, 2.85, -L * 0.42, 1.42, W * 0.32),
    cylGeo(0.07, 2.85, L * 0.42, 1.42, W * 0.32),
    boxGeo(L + 0.25, 0.07, 0.09, 0, 2.86, -W * 0.42),
    boxGeo(L + 0.25, 0.07, 0.09, 0, 2.86, W * 0.32),
    boxGeo(0.09, 0.07, W * 0.85, -L * 0.42, 2.86, -0.04),
    boxGeo(0.09, 0.07, W * 0.85, L * 0.42, 2.86, -0.04),
  ]);
}
function shelterGlass(median) {
  const L = median ? 8.0 : 6.2, W = median ? 2.35 : 1.85;
  return boxGeo(L, 0.05, W * 0.92, 0, 2.9, -0.04);
}
function shelterBack(median) {
  const L = median ? 7.8 : 6.0, W = median ? 2.35 : 1.85;
  return boxGeo(L * 0.96, 2.15, 0.045, 0, 1.42, -W * 0.46);
}
function shelterBench(median) {
  const L = median ? 6.4 : 3.2;
  return merge([
    boxGeo(L, 0.12, 0.48, 0, 0.72, -0.55),
    boxGeo(L, 0.42, 0.08, 0, 0.98, -0.78),
    boxGeo(0.08, 0.62, 0.08, -L * 0.42, 0.35, -0.55),
    boxGeo(0.08, 0.62, 0.08, L * 0.42, 0.35, -0.55),
  ]);
}
function roofStripGeo(median) {
  const L = median ? 7.4 : 5.6;
  return merge([
    boxGeo(L, 0.035, 0.07, 0, 2.78, -0.55),
    boxGeo(L, 0.035, 0.07, 0, 2.78, 0.05),
    boxGeo(L, 0.035, 0.07, 0, 2.78, 0.55),
  ]);
}
function roofEdgeGeo(median) {
  const L = median ? 8.15 : 6.35, W = median ? 2.4 : 1.9;
  return merge([
    boxGeo(L, 0.05, 0.06, 0, 2.93, -W * 0.46),
    boxGeo(L, 0.05, 0.06, 0, 2.93, W * 0.38),
    boxGeo(0.06, 0.05, W * 0.88, -L * 0.48, 2.93, -0.04),
    boxGeo(0.06, 0.05, W * 0.88, L * 0.48, 2.93, -0.04),
  ]);
}
function poolGeo(median) {
  return boxGeo(median ? 7.6 : 5.8, 0.03, median ? 2.5 : 1.9, 0, 0.03, 0);
}
function pylonGeo() {
  return merge([
    boxGeo(0.32, 4.15, 0.32, 0, 2.08, 0),
    boxGeo(1.55, 0.95, 0.16, 0, 3.85, 0),
  ]);
}
function waiterGeo() {
  return merge([
    boxGeo(0.36, 0.44, 0.26, 0, 0.94, 0),
    boxGeo(0.32, 0.28, 0.38, 0, 0.52, 0.04),
    new THREE.SphereGeometry(0.13, 8, 6).translate(0, 1.28, 0.02),
  ]);
}
function kioskGeo() {
  return merge([boxGeo(1.15, 2.15, 0.85, 0, 1.08, 0), boxGeo(1.22, 0.12, 0.92, 0, 2.18, 0), boxGeo(0.7, 0.5, 0.04, 0, 1.45, 0.44)]);
}
function bikeGeo() {
  return merge([
    new THREE.TorusGeometry(0.28, 0.035, 6, 10).rotateY(Math.PI / 2).translate(0, 0.28, 0.38),
    new THREE.TorusGeometry(0.28, 0.035, 6, 10).rotateY(Math.PI / 2).translate(0, 0.28, -0.38),
    boxGeo(0.05, 0.05, 0.7, 0, 0.52, 0),
    boxGeo(0.35, 0.04, 0.12, 0, 0.78, 0.15),
  ]);
}
function planterGeo() { return merge([boxGeo(0.7, 0.38, 0.7, 0, 0.2, 0), cylGeo(0.22, 0.45, 0, 0.55, 0)]); }
function bollardGeo() { return cylGeo(0.09, 0.72, 0, 0.36, 0); }
function vendingGeo() { return merge([boxGeo(0.85, 1.85, 0.7, 0, 0.93, 0), boxGeo(0.72, 0.9, 0.04, 0, 1.15, 0.37)]); }
function scooterGeo() {
  return merge([
    new THREE.TorusGeometry(0.18, 0.03, 6, 8).rotateY(Math.PI / 2).translate(0, 0.18, 0.38),
    new THREE.TorusGeometry(0.18, 0.03, 6, 8).rotateY(Math.PI / 2).translate(0, 0.18, -0.32),
    boxGeo(0.22, 0.1, 0.62, 0, 0.32, 0),
    boxGeo(0.38, 0.38, 0.38, 0, 0.72, -0.28),
    boxGeo(0.08, 0.55, 0.08, 0, 0.6, 0.32),
  ]);
}
function poleGeo() {
  return merge([
    cylGeo(0.1, 6.4, 0, 3.2, 0),
    boxGeo(0.7, 0.14, 0.14, 0.28, 5.85, 0),
    boxGeo(0.7, 0.14, 0.14, 0.28, 5.45, 0),
    boxGeo(0.7, 0.14, 0.14, 0.28, 5.05, 0),
  ]);
}
function shopBodyGeo() {
  return merge([
    boxGeo(3.35, 2.85, 0.28, 0, 1.45, -0.08),
    boxGeo(3.5, 0.14, 0.95, 0, 2.82, 0.35),
    boxGeo(3.4, 0.22, 0.28, 0, 2.55, 0.06),
  ]);
}
function shopWinGeo() { return boxGeo(2.7, 1.55, 0.04, 0, 1.35, 0.12); }
function tentGeo() {
  return merge([
    boxGeo(3.3, 2.15, 2.35, 0, 1.15, 0.2),
    boxGeo(3.5, 0.1, 2.55, 0, 2.28, 0.2),
  ]);
}
function tentGlowGeo() { return boxGeo(2.6, 1.3, 1.8, 0, 1.1, 0.2); }
function tableGeo() { return merge([cylGeo(0.38, 0.06, 0, 0.78, 0), cylGeo(0.06, 0.76, 0, 0.38, 0)]); }
function stoolGeo() { return merge([cylGeo(0.16, 0.05, 0, 0.48, 0), cylGeo(0.04, 0.46, 0, 0.23, 0)]); }
function aframeGeo() {
  return merge([
    boxGeo(0.72, 1.05, 0.06, 0, 0.62, 0.16),
    boxGeo(0.72, 1.05, 0.06, 0, 0.62, -0.16),
  ]);
}
function acGeo() { return merge([boxGeo(0.95, 0.55, 0.42, 0, 0, 0), boxGeo(0.7, 0.12, 0.08, 0, -0.22, 0.22)]); }
function trashGeo() { return merge([boxGeo(0.38, 0.28, 0.28, 0, 0.16, 0), boxGeo(0.32, 0.22, 0.24, 0.05, 0.38, 0.02)]); }
function binGeo() { return merge([boxGeo(0.55, 0.85, 0.42, 0, 0.42, 0), boxGeo(0.5, 0.08, 0.38, 0, 0.88, 0)]); }

export function createGangnamStreet({ scene, terrain = null, url, mobile = false }) {
  const root = new THREE.Group();
  root.name = 'gangnamStreet';
  scene.add(root);
  const stats = { loaded: false, mobile, draws: 0 };
  let dead = false, worldBox = null, meshes = null, ledTex = null;
  const ground = (x, z) => (terrain ? terrain.renderHeight(x, z) : 0);
  const m4 = new THREE.Matrix4(), quat = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const tmpC = new THREE.Color();

  const ready = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
    if (!j || dead) return;
    try {
      worldBox = j.meta?.box || { x0: -7500, x1: -6000, z0: -15500, z1: -14000 };
      const stops = j.stops || [];
      const modules = j.modules || stops.map((st, si) => ({ x: st.x, z: st.z, yaw: st.yaw, kind: st.kind, si }));
      const nameAt = makeNameAtlas(stops);
      const shopAt = makeShopAtlas();
      ledTex = makeLedTex();
      const adTex = makeAdTex();

      const metalMat = new THREE.MeshLambertMaterial({ color: '#4a5563' });
      const glassMat = new THREE.MeshBasicMaterial({ color: '#8fd4ff', transparent: true, opacity: 0.32, toneMapped: false, depthWrite: false });
      const backMat = new THREE.MeshBasicMaterial({ color: '#fff1c8', transparent: true, opacity: 0.45, toneMapped: false });
      const benchMat = new THREE.MeshLambertMaterial({ color: '#c9a36c' });
      const ledMat = new THREE.MeshBasicMaterial({
        map: ledTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      });
      const nameMat = atlasMaterial(nameAt.tex);
      const shopSignMat = atlasMaterial(shopAt.tex);
      const adMat = new THREE.MeshBasicMaterial({ map: adTex, toneMapped: false });
      const adGlowMat = new THREE.MeshBasicMaterial({
        color: '#ffe6a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      });
      const stripMat = new THREE.MeshBasicMaterial({
        color: '#ffe7b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      });
      const edgeMat = new THREE.MeshBasicMaterial({
        color: '#b8f0ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      });
      const poolMat = new THREE.MeshBasicMaterial({
        color: '#ffb060', transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      });
      const zebraMat = new THREE.MeshBasicMaterial({
        map: zebraTex(), color: '#ffffff', transparent: true, opacity: 1, depthWrite: false, depthTest: true,
        toneMapped: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8,
      });
      const paintMat = new THREE.MeshBasicMaterial({ color: '#ff3a22', transparent: false, opacity: 1, depthWrite: false, depthTest: false, toneMapped: false });
      const platMat = new THREE.MeshLambertMaterial({ color: '#9aa3ae' });
      const tactMat = new THREE.MeshBasicMaterial({ color: '#f0c400', toneMapped: false });
      const pylonMat = new THREE.MeshLambertMaterial({ color: '#2d3a55' });
      const shopMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
      const shopWinMat = new THREE.MeshBasicMaterial({
        color: '#ffc878', transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      });
      const tentMat = new THREE.MeshLambertMaterial({ color: '#d4652a' });
      const tentGlowMat = new THREE.MeshBasicMaterial({
        color: '#ffb15a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      });
      const stringMat = new THREE.MeshBasicMaterial({
        color: '#ffd27a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      });
      const vendMat = new THREE.MeshLambertMaterial({ color: '#3a6ea5', emissive: '#123058', emissiveIntensity: 0 });

      const sideMods = modules.filter((m) => m.kind !== 'median');
      const medMods = modules.filter((m) => m.kind === 'median');

      function inst(geo, mat, n, name, cast = false) {
        const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
        im.name = name; im.count = 0; im.frustumCulled = false; im.castShadow = cast; im.receiveShadow = true;
        root.add(im); return im;
      }

      const sideMetal = inst(shelterMetal(false), metalMat, sideMods.length, 'gnStreetSideMetal', true);
      const medMetal = inst(shelterMetal(true), metalMat, medMods.length, 'gnStreetMedMetal', true);
      const sideGlass = inst(shelterGlass(false), glassMat, sideMods.length, 'gnStreetSideGlass');
      const medGlass = inst(shelterGlass(true), glassMat, medMods.length, 'gnStreetMedGlass');
      const sideBack = inst(shelterBack(false), backMat, sideMods.length, 'gnStreetSideBack');
      const medBack = inst(shelterBack(true), backMat, medMods.length, 'gnStreetMedBack');
      const sideBench = inst(shelterBench(false), benchMat, sideMods.length, 'gnStreetSideBench');
      const medBench = inst(shelterBench(true), benchMat, medMods.length, 'gnStreetMedBench');
      const sideStrip = inst(roofStripGeo(false), stripMat, sideMods.length, 'gnStreetSideStrip');
      const medStrip = inst(roofStripGeo(true), stripMat, medMods.length, 'gnStreetMedStrip');
      const sideEdge = inst(roofEdgeGeo(false), edgeMat, sideMods.length, 'gnStreetSideEdge');
      const medEdge = inst(roofEdgeGeo(true), edgeMat, medMods.length, 'gnStreetMedEdge');
      const pools = inst(poolGeo(true), poolMat, modules.length, 'gnStreetPool');
      const bis = inst(new THREE.PlaneGeometry(2.15, 0.62), ledMat, modules.length, 'gnStreetBis');
      const ads = inst(new THREE.PlaneGeometry(1.05, 1.7), adMat, modules.length, 'gnStreetAds');
      const adGlows = inst(boxGeo(1.08, 1.74, 0.08, 0, 0, 0), adGlowMat, modules.length, 'gnStreetAdGlow');
      const signs = inst(new THREE.PlaneGeometry(1.55, 0.72), nameMat, sideMods.length * 2 + (j.pylons || []).length * 4, 'gnStreetNames');

      let si = 0, mi = 0, signI = 0, poolI = 0, bisI = 0;
      const placeModule = (m, metal, glass, back, bench, strip, edge) => {
        const gy = ground(m.x, m.z);
        StreetXform.compose(m4, quat, pos, scl, m.x, gy, m.z, m.yaw, 1, 1, 1);
        metal.setMatrixAt(metal.count, m4); metal.count++;
        glass.setMatrixAt(glass.count, m4); glass.count++;
        back.setMatrixAt(back.count, m4); back.count++;
        bench.setMatrixAt(bench.count, m4); bench.count++;
        strip.setMatrixAt(strip.count, m4); strip.count++;
        edge.setMatrixAt(edge.count, m4); edge.count++;
        StreetXform.compose(m4, quat, pos, scl, m.x, gy + 0.04, m.z, m.yaw, m.kind === 'median' ? 1 : 0.82, 1, m.kind === 'median' ? 1 : 0.78);
        pools.setMatrixAt(poolI++, m4);
        const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
        const rx = Math.cos(m.yaw), rz = -Math.sin(m.yaw);
        // BIS at the curb, facing the waiting area
        StreetXform.compose(m4, quat, pos, scl, m.x + fx * 0.98, gy + 2.22, m.z + fz * 0.98, m.yaw + Math.PI, 1, 1, 1);
        bis.setMatrixAt(bisI, m4);
        // ad on back panel, glowing into the shelter
        StreetXform.compose(m4, quat, pos, scl, m.x - fx * 1.08 - rx * 2.35, gy + 1.4, m.z - fz * 1.08 - rz * 2.35, m.yaw, 1, 1, 1);
        ads.setMatrixAt(bisI, m4);
        adGlows.setMatrixAt(bisI, m4);
        bisI++;
        if (m.kind !== 'median') {
          StreetXform.compose(m4, quat, pos, scl, m.x + rx * 0.05, gy + 3.22, m.z + rz * 0.05, m.yaw + Math.PI, 1, 1, 1);
          signs.setMatrixAt(signI, m4); signI++;
          StreetXform.compose(m4, quat, pos, scl, m.x + rx * 0.05, gy + 3.22, m.z + rz * 0.05, m.yaw, 1, 1, 1);
          signs.setMatrixAt(signI, m4); signI++;
        }
      };
      sideMods.forEach((m) => placeModule(m, sideMetal, sideGlass, sideBack, sideBench, sideStrip, sideEdge));
      medMods.forEach((m) => placeModule(m, medMetal, medGlass, medBack, medBench, medStrip, medEdge));
      pools.count = poolI; bis.count = ads.count = adGlows.count = bisI;

      const pylons = j.pylons || [];
      const pylonIm = inst(pylonGeo(), pylonMat, pylons.length, 'gnStreetPylon', true);
      const pylonSlots = [];
      pylons.forEach((p, i) => {
        const gy = ground(p.x, p.z);
        StreetXform.compose(m4, quat, pos, scl, p.x, gy, p.z, p.yaw, 1, 1, 1);
        pylonIm.setMatrixAt(i, m4);
        for (const dy of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
          const fy = p.yaw + dy;
          StreetXform.compose(m4, quat, pos, scl, p.x + Math.sin(fy) * 0.14, gy + 3.85, p.z + Math.cos(fy) * 0.14, fy + Math.PI, 1.15, 1.15, 1);
          signs.setMatrixAt(signI, m4); pylonSlots.push(p.si ?? 0); signI++;
        }
      });
      pylonIm.count = pylons.length;
      signs.count = signI;

      const sideSlots = [];
      sideMods.forEach((m) => { sideSlots.push(m.si ?? 0); sideSlots.push(m.si ?? 0); });
      const allSlots = [...sideSlots, ...pylonSlots];
      bindSlotAtlas(nameMat, nameAt, 'gn-stop-name-atlas');
      signs.geometry = signs.geometry.clone();
      signs.geometry.setAttribute('slot', new THREE.InstancedBufferAttribute(new Float32Array(allSlots.length ? allSlots : [0]), 1));

      const plats = j.platforms || [];
      const platIm = inst(boxGeo(1, 0.30, 1, 0, 0.15, 0), platMat, plats.length, 'gnStreetPlat');
      plats.forEach((p, i) => {
        StreetXform.compose(m4, quat, pos, scl, p[0], ground(p[0], p[1]), p[1], p[2], p[3], 1, p[4]);
        platIm.setMatrixAt(i, m4);
      });
      platIm.count = plats.length;

      const tacts = j.tactiles || [];
      const tactIm = inst(boxGeo(1, 0.05, 1, 0, 0.025, 0), tactMat, tacts.length, 'gnStreetTact');
      tacts.forEach((p, i) => {
        StreetXform.compose(m4, quat, pos, scl, p[0], ground(p[0], p[1]) + 0.30, p[1], p[2], p[3], 1, p[4]);
        tactIm.setMatrixAt(i, m4);
      });
      tactIm.count = tacts.length;

      const zebra = inst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), zebraMat, (j.zebras || []).length, 'gnStreetZebra');
      (j.zebras || []).forEach((z, i) => {
        StreetXform.compose(m4, quat, pos, scl, z[0], ground(z[0], z[1]) + 0.07, z[1], z[2], z[3], 1, z[4]);
        zebra.setMatrixAt(i, m4);
      });
      zebra.count = (j.zebras || []).length;

      const paint = inst(boxGeo(1, 0.06, 1, 0, 0.03, 0), paintMat, (j.paints || []).length, 'gnStreetPaint');
      (j.paints || []).forEach((z, i) => {
        StreetXform.compose(m4, quat, pos, scl, z[0], ground(z[0], z[1]) + 0.11, z[1], z[2], z[3], 1, z[4]);
        paint.setMatrixAt(i, m4);
      });
      paint.count = (j.paints || []).length;
      paint.renderOrder = 0;

      const propGeos = [kioskGeo(), bikeGeo(), planterGeo(), bollardGeo(), poleGeo(), scooterGeo(), vendingGeo()];
      const propMats = [
        new THREE.MeshLambertMaterial({ color: '#d7c8a4' }),
        new THREE.MeshLambertMaterial({ color: '#2b2e33' }),
        new THREE.MeshLambertMaterial({ color: '#4a7a46' }),
        new THREE.MeshLambertMaterial({ color: '#c9ccd1' }),
        new THREE.MeshLambertMaterial({ color: '#4a4e55' }),
        new THREE.MeshLambertMaterial({ color: '#e24b3c' }),
        vendMat,
      ];
      const propSrc = mobile ? (j.props || []).filter((_, i) => i % 2 === 0) : (j.props || []);
      const byKind = Array.from({ length: 7 }, () => []);
      for (const pr of propSrc) byKind[pr[0]]?.push(pr);
      const poleSrc = mobile ? (j.poles || []).filter((_, i) => i % 2 === 0) : (j.poles || []);
      byKind[4].push(...poleSrc.map((pp) => [4, pp[0], pp[1], pp[2], 1]));
      const propIms = byKind.map((list, k) => {
        const im = inst(propGeos[k], propMats[k], list.length, `gnStreetProp${k}`, k === 0 || k === 6);
        list.forEach((pr, i) => {
          const sc = pr[4] || 1;
          StreetXform.compose(m4, quat, pos, scl, pr[1], ground(pr[1], pr[2]), pr[2], pr[3], sc, sc, sc);
          im.setMatrixAt(i, m4);
        });
        im.count = list.length;
        im.instanceMatrix.needsUpdate = true;
        return im;
      });

      function placeList(list, geo, mat, name, yAdd = 0, pick = null) {
        const src = mobile && list.length > 8 ? list.filter((_, i) => i % 2 === 0) : list;
        const im = inst(geo, mat, src.length, name);
        src.forEach((it, i) => {
          const x = it[0], z = it[1], yaw = it[2];
          StreetXform.compose(m4, quat, pos, scl, x, ground(x, z) + yAdd, z, yaw, 1, 1, 1);
          im.setMatrixAt(i, m4);
          if (pick) pick(im, it, i);
        });
        im.count = src.length;
        im.instanceMatrix.needsUpdate = true;
        return im;
      }

      const shopSrc = mobile ? (j.shops || []).filter((_, i) => i % 2 === 0) : (j.shops || []);
      const shopIm = inst(shopBodyGeo(), shopMat, shopSrc.length, 'gnStreetShop', true);
      const shopWin = inst(shopWinGeo(), shopWinMat, shopSrc.length, 'gnStreetShopWin');
      const shopSign = inst(new THREE.PlaneGeometry(1.7, 0.38), shopSignMat, shopSrc.length, 'gnStreetShopSign');
      const shopPal = ['#2e6b4a', '#6b4a32', '#d4652a', '#6a3038'];
      shopSrc.forEach((sh, i) => {
        const gy = ground(sh[0], sh[1]);
        StreetXform.compose(m4, quat, pos, scl, sh[0], gy, sh[1], sh[2], 1, 1, 1);
        shopIm.setMatrixAt(i, m4);
        shopWin.setMatrixAt(i, m4);
        shopIm.setColorAt(i, tmpC.set(shopPal[sh[3] % shopPal.length] || '#555'));
        const fx = Math.sin(sh[2]), fz = Math.cos(sh[2]);
        StreetXform.compose(m4, quat, pos, scl, sh[0] + fx * 0.18, gy + 2.52, sh[1] + fz * 0.18, sh[2], 1, 1, 1);
        shopSign.setMatrixAt(i, m4);
      });
      shopIm.count = shopWin.count = shopSign.count = shopSrc.length;
      if (shopIm.instanceColor) shopIm.instanceColor.needsUpdate = true;
      bindSlotAtlas(shopSignMat, shopAt, 'gn-shop-name-atlas');
      shopSign.geometry = shopSign.geometry.clone();
      shopSign.geometry.setAttribute('slot', new THREE.InstancedBufferAttribute(new Float32Array(shopSrc.map((sh, i) => (sh[3] * 3 + i) % 12)), 1));

      const tentIm = placeList(j.tents || [], tentGeo(), tentMat, 'gnStreetTent', 0);
      const tentGlow = placeList(mobile ? [] : (j.tents || []), tentGlowGeo(), tentGlowMat, 'gnStreetTentGlow', 0);
      const tableIm = placeList(j.tables || [], tableGeo(), new THREE.MeshLambertMaterial({ color: '#6a5340' }), 'gnStreetTable');
      const stoolIm = placeList(mobile ? [] : (j.stools || []), stoolGeo(), new THREE.MeshLambertMaterial({ color: '#4a3b30' }), 'gnStreetStool');
      const aframeIm = placeList(j.aframes || [], aframeGeo(), new THREE.MeshLambertMaterial({ color: '#e8d9a0' }), 'gnStreetAframe');
      const acIm = placeList(mobile ? [] : (j.acs || []), acGeo(), new THREE.MeshLambertMaterial({ color: '#c5ccd3' }), 'gnStreetAc', 3.15);
      const trashIm = placeList(mobile ? [] : (j.trash || []), trashGeo(), new THREE.MeshLambertMaterial({ color: '#3a3a38' }), 'gnStreetTrash');
      const binIm = placeList(j.bins || [], binGeo(), new THREE.MeshLambertMaterial({ color: '#3d7a45' }), 'gnStreetBin');

      let wires = null;
      const wsrc = mobile ? [] : (j.wires || []);
      if (wsrc.length) {
        const wmat = new THREE.MeshBasicMaterial({ color: '#2a2c30' });
        wires = inst(boxGeo(1, 1, 1, 0, 0, 0), wmat, wsrc.length * 3, 'gnStreetWires');
        let wi = 0;
        wsrc.forEach((w) => {
          const x = (w[0] + w[2]) / 2, z = (w[1] + w[3]) / 2;
          const dx = w[2] - w[0], dz = w[3] - w[1], L = Math.hypot(dx, dz);
          const yaw = Math.atan2(dx, dz);
          const gy = ground(x, z);
          for (const yh of [5.15, 5.52, 5.88]) {
            StreetXform.compose(m4, quat, pos, scl, x, gy + yh, z, yaw, 0.035, 0.035, L);
            wires.setMatrixAt(wi++, m4);
          }
        });
        wires.count = wi;
        wires.instanceMatrix.needsUpdate = true;
      }

      let strings = null;
      const ssrc = mobile ? [] : (j.strings || []);
      if (ssrc.length) {
        strings = inst(boxGeo(1, 1, 1, 0, 0, 0), stringMat, ssrc.length, 'gnStreetStrings');
        ssrc.forEach((w, i) => {
          const x = (w[0] + w[2]) / 2, z = (w[1] + w[3]) / 2;
          const dx = w[2] - w[0], dz = w[3] - w[1], L = Math.hypot(dx, dz);
          StreetXform.compose(m4, quat, pos, scl, x, ground(x, z) + 4.85, z, Math.atan2(dx, dz), 0.06, 0.06, L);
          strings.setMatrixAt(i, m4);
        });
        strings.count = ssrc.length;
        strings.instanceMatrix.needsUpdate = true;
      }

      let waiters = null;
      if (!mobile && j.waiters?.length) {
        waiters = inst(waiterGeo(), new THREE.MeshLambertMaterial({ color: '#ffffff' }), j.waiters.length, 'gnStreetWait');
        const pal = ['#3d4652', '#6a3a32', '#2f4a3c', '#3a3f6a', '#5a5248', '#704838'];
        j.waiters.forEach((w, i) => {
          StreetXform.compose(m4, quat, pos, scl, w[0], ground(w[0], w[1]) + 0.22, w[1], w[2], 1, 1, 1);
          waiters.setMatrixAt(i, m4);
          waiters.setColorAt(i, tmpC.set(pal[i % pal.length]));
        });
        waiters.count = j.waiters.length;
        waiters.instanceMatrix.needsUpdate = true;
        if (waiters.instanceColor) waiters.instanceColor.needsUpdate = true;
      }

      for (const o of root.children) {
        if (o.isInstancedMesh) o.instanceMatrix.needsUpdate = true;
      }

      meshes = {
        ledMat, stripMat, edgeMat, poolMat, backMat, glassMat, adGlowMat,
        shopWinMat, tentGlowMat, stringMat, vendMat, nameMat,
        bis, pools, adGlows,
      };
      stats.loaded = true;
      stats.stops = stops.length;
      stats.median = medMods.length ? stops.filter((s) => s.kind === 'median').length : 0;
      stats.modules = modules.length;
      stats.shops = shopSrc.length;
      stats.tents = (j.tents || []).length;
      stats.alley = j.meta?.alley || null;
      apply(1);
    } catch (err) {
      stats.error = String(err && err.message || err);
      console.error('[gangnam-street]', err);
    }
  });

  function near(x, z) {
    if (!worldBox) return true;
    return x >= worldBox.x0 - 400 && x <= worldBox.x1 + 400 && z >= worldBox.z0 - 400 && z <= worldBox.z1 + 400;
  }
  near.here = false;

  function apply(v) {
    if (!meshes) return;
    const on = near.here;
    const n = on ? v : 0;
    root.visible = on;
    if (meshes.ledMat) meshes.ledMat.opacity = on ? (0.45 + n * 0.55) : 0;
    if (meshes.stripMat) meshes.stripMat.opacity = n * 0.9;
    if (meshes.edgeMat) meshes.edgeMat.opacity = n * 0.8;
    if (meshes.poolMat) meshes.poolMat.opacity = n * 0.55;
    if (meshes.backMat) meshes.backMat.opacity = on ? (0.28 + n * 0.55) : 0;
    if (meshes.glassMat) meshes.glassMat.opacity = on ? (0.22 + n * 0.2) : 0;
    if (meshes.adGlowMat) meshes.adGlowMat.opacity = n * 0.55;
    if (meshes.shopWinMat) meshes.shopWinMat.opacity = on ? (0.12 + n * 0.5) : 0;
    if (meshes.tentGlowMat) meshes.tentGlowMat.opacity = n * 0.62;
    if (meshes.stringMat) meshes.stringMat.opacity = n * 0.72;
    if (meshes.vendMat) meshes.vendMat.emissiveIntensity = n * 1.1;
    if (meshes.ledMat?.map) meshes.ledMat.map.offset.x = (performance.now() / 3800) % 1;
    if (meshes.pools) meshes.pools.visible = on && n > 0.05;
    if (meshes.adGlows) meshes.adGlows.visible = on && n > 0.05;
    let draws = 0;
    root.traverse((o) => { if (o.isInstancedMesh && o.visible && o.count > 0) draws++; });
    stats.draws = on ? draws : 0;
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
          o.material?.map?.dispose?.();
          o.material?.dispose?.();
        }
      });
      scene.remove(root);
      meshes = null;
    },
  };
}
