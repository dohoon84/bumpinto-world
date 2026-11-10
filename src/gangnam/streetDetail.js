// [gangnam-street] 강남대로·테헤란로 OSM 정류장 쉘터와 골목 소품.
//   중앙버스전용차로(중) 포함. BIS 화면은 노선 번호 자막만(도착 시각 없음).
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

function atlasMaterial(tex, { night = false } = {}) {
  const m = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: night ? 0 : 1, side: THREE.FrontSide,
    depthWrite: !night, toneMapped: false,
  });
  if (night) {
    m.blending = THREE.AdditiveBlending;
  }
  return m;
}

function makeNameAtlas(stops) {
  const colW = 256, rowH = 72, cols = 4;
  const rows = Math.max(1, Math.ceil(stops.length / cols));
  const canvas = document.createElement('canvas');
  canvas.width = colW * cols; canvas.height = rowH * rows;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  stops.forEach((st, i) => {
    const cx = (i % cols) * colW, cy = Math.floor(i / cols) * rowH;
    c.fillStyle = '#12326a';
    c.fillRect(cx + 6, cy + 8, colW - 12, rowH - 16);
    c.fillStyle = '#f4f7ff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const label = String(st.name || '정류장').slice(0, 14);
    c.font = 'bold 20px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    c.fillText(label, cx + colW / 2, st.toward ? cy + rowH / 2 - 10 : cy + rowH / 2);
    if (st.toward) {
      c.fillStyle = '#cfe0ff';
      c.font = 'bold 13px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
      c.fillText(`${st.toward} 방면`, cx + colW / 2, cy + rowH / 2 + 14);
    }
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  return { tex, cols, rows, colW, rowH };
}

function makeLedTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 80;
  const c = canvas.getContext('2d');
  c.fillStyle = '#04140a';
  c.fillRect(0, 0, 512, 80);
  c.fillStyle = '#3dff8a';
  c.font = 'bold 34px "Noto Sans KR", monospace';
  c.textBaseline = 'middle';
  c.shadowColor = '#1aff70'; c.shadowBlur = 10;
  c.fillText('140   400   402   470   9404   146   341   360   740   145   340', 16, 42);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function zebraTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 256, 64);
  for (let i = 0; i < 8; i++) {
    c.fillStyle = '#f3f6fb';
    c.fillRect(i * 32 + 6, 0, 16, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  return tex;
}

function makeAdTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 192;
  const c = canvas.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 192);
  g.addColorStop(0, '#2a3a58');
  g.addColorStop(0.5, '#5a6d8c');
  g.addColorStop(1, '#1c2740');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 192);
  c.fillStyle = 'rgba(255,220,140,0.35)';
  c.fillRect(12, 20, 104, 48);
  c.fillStyle = 'rgba(180,220,255,0.25)';
  c.fillRect(12, 84, 104, 86);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  return tex;
}

function shelterMetal(median) {
  const L = median ? 8.4 : 6.6, W = median ? 2.35 : 1.95;
  const parts = [
    cylGeo(0.07, 2.7, -L * 0.42, 1.35, -W * 0.42),
    cylGeo(0.07, 2.7, L * 0.42, 1.35, -W * 0.42),
    cylGeo(0.07, 2.7, -L * 0.42, 1.35, W * 0.28),
    cylGeo(0.07, 2.7, L * 0.42, 1.35, W * 0.28),
    boxGeo(L + 0.2, 0.08, 0.1, 0, 2.72, -W * 0.42),
    boxGeo(L + 0.2, 0.08, 0.1, 0, 2.72, W * 0.28),
    boxGeo(0.1, 0.08, W * 0.8, -L * 0.42, 2.72, -0.08),
    boxGeo(0.1, 0.08, W * 0.8, L * 0.42, 2.72, -0.08),
    boxGeo(0.08, 2.3, 0.08, L * 0.48, 1.4, W * 0.08),
  ];
  if (median) {
    parts.push(boxGeo(L + 1.2, 0.15, W + 0.7, 0, 0.08, 0));
    for (const s of [-1, 1]) parts.push(boxGeo(L + 0.8, 0.7, 0.06, 0, 0.55, s * (W * 0.55 + 0.15)));
  }
  return merge(parts);
}

function shelterGlass(median) {
  const L = median ? 8.0 : 6.2, W = median ? 2.2 : 1.85;
  return merge([
    boxGeo(L, 0.06, W * 0.95, 0, 2.78, -0.08),
    boxGeo(L * 0.96, 2.05, 0.04, 0, 1.38, -W * 0.44),
  ]);
}

function shelterBench(median) {
  const L = median ? 4.2 : 3.2;
  return merge([
    boxGeo(L, 0.1, 0.42, 0, 0.48, -0.55),
    boxGeo(0.08, 0.44, 0.08, -L * 0.42, 0.22, -0.55),
    boxGeo(0.08, 0.44, 0.08, L * 0.42, 0.22, -0.55),
  ]);
}

function waiterGeo() {
  return merge([
    boxGeo(0.34, 0.42, 0.24, 0, 0.70, 0),
    boxGeo(0.30, 0.30, 0.36, 0, 0.28, 0.04),
    new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.04, 0.02),
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
function planterGeo() {
  return merge([boxGeo(0.7, 0.38, 0.7, 0, 0.2, 0), cylGeo(0.22, 0.45, 0, 0.55, 0)]);
}
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
function poleGeo() { return merge([cylGeo(0.09, 6.2, 0, 3.1, 0), boxGeo(0.55, 0.12, 0.12, 0.2, 5.6, 0)]); }

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
    const nameAt = makeNameAtlas(stops.length ? stops : [{ name: '강남역' }]);
    ledTex = makeLedTex();
    const adTex = makeAdTex();

    const metalMat = new THREE.MeshLambertMaterial({ color: '#3d4552' });
    const glassMat = new THREE.MeshLambertMaterial({ color: '#c5e4f5', transparent: true, opacity: 0.38 });
    const benchMat = new THREE.MeshLambertMaterial({ color: '#8a6b4a' });
    const ledMat = new THREE.MeshBasicMaterial({
      map: ledTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, side: THREE.FrontSide,
    });
    const nameMat = atlasMaterial(nameAt.tex);
    const adMat = new THREE.MeshBasicMaterial({ map: adTex, toneMapped: false });
    const zebraMat = new THREE.MeshBasicMaterial({ map: zebraTex(), color: '#ffffff', transparent: true, opacity: 0.88, depthWrite: false });
    const paintMat = new THREE.MeshBasicMaterial({ color: '#3d6fd4', transparent: true, opacity: 0.55, depthWrite: false });
    const glowMat = new THREE.MeshBasicMaterial({
      color: '#fff1c2', transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    });

    const sideN = stops.filter((st) => st.kind !== 'median').length;
    const medN = stops.filter((st) => st.kind === 'median').length;
    const geos = {
      sideM: shelterMetal(false), medM: shelterMetal(true),
      sideG: shelterGlass(false), medG: shelterGlass(true),
      sideB: shelterBench(false), medB: shelterBench(true),
    };
    function inst(geo, mat, n, name, cast = false) {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      im.name = name; im.count = 0; im.frustumCulled = false; im.castShadow = cast; im.receiveShadow = true;
      root.add(im); return im;
    }
    const sideMetal = inst(geos.sideM, metalMat, sideN, 'gnStreetSideMetal', true);
    const medMetal = inst(geos.medM, metalMat, medN, 'gnStreetMedMetal', true);
    const sideGlass = inst(geos.sideG, glassMat, sideN, 'gnStreetSideGlass');
    const medGlass = inst(geos.medG, glassMat, medN, 'gnStreetMedGlass');
    const sideBench = inst(geos.sideB, benchMat, sideN, 'gnStreetSideBench');
    const medBench = inst(geos.medB, benchMat, medN, 'gnStreetMedBench');
    const bis = inst(new THREE.PlaneGeometry(1.85, 0.58), ledMat, stops.length, 'gnStreetBis');
    const signs = inst(new THREE.PlaneGeometry(1.7, 0.62), nameMat, stops.length * 2, 'gnStreetNames');
    const ads = inst(new THREE.PlaneGeometry(0.95, 1.55), adMat, stops.length, 'gnStreetAds');
    const glows = inst(boxGeo(5.8, 0.05, 1.5, 0, 0, 0), glowMat, stops.length, 'gnStreetGlow');

    let si = 0, mi = 0;
    stops.forEach((st, i) => {
      const gy = ground(st.x, st.z);
      StreetXform.compose(m4, quat, pos, scl, st.x, gy, st.z, st.yaw, 1, 1, 1);
      if (st.kind === 'median') {
        medMetal.setMatrixAt(mi, m4); medGlass.setMatrixAt(mi, m4); medBench.setMatrixAt(mi, m4); mi++;
      } else {
        sideMetal.setMatrixAt(si, m4); sideGlass.setMatrixAt(si, m4); sideBench.setMatrixAt(si, m4); si++;
      }
      const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
      const rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
      StreetXform.compose(m4, quat, pos, scl, st.x + fx * 0.15 + rx * 2.15, gy + 2.05, st.z + fz * 0.15 + rz * 2.15, st.yaw, 1, 1, 1);
      bis.setMatrixAt(i, m4);
      StreetXform.compose(m4, quat, pos, scl, st.x + rx * 0.05, gy + 3.15, st.z + rz * 0.05, st.yaw + Math.PI, 1, 1, 1);
      signs.setMatrixAt(i, m4);
      StreetXform.compose(m4, quat, pos, scl, st.x + rx * 0.05, gy + 3.15, st.z + rz * 0.05, st.yaw, 1, 1, 1);
      signs.setMatrixAt(i + stops.length, m4);
      StreetXform.compose(m4, quat, pos, scl, st.x - rx * 2.25 - fx * 0.15, gy + 1.25, st.z - rz * 2.25 - fz * 0.15, st.yaw, 1, 1, 1);
      ads.setMatrixAt(i, m4);
      StreetXform.compose(m4, quat, pos, scl, st.x, gy + 2.7, st.z, st.yaw, st.kind === 'median' ? 1.2 : 1, 1, 1);
      glows.setMatrixAt(i, m4);
    });
    sideMetal.count = sideGlass.count = sideBench.count = si;
    medMetal.count = medGlass.count = medBench.count = mi;
    bis.count = ads.count = glows.count = stops.length;
    signs.count = stops.length * 2;
    for (const im of [sideMetal, medMetal, sideGlass, medGlass, sideBench, medBench, bis, signs, ads, glows]) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere?.();
    }

    // 이름 간판은 아틀라스 한 칸씩 보이게 repeat/offset 를 인스턴스별로 줄 수 없어,
    // 셀마다 작은 캔버스를 다시 쓰지 않고 간판 위 텍스처 전체를 쓰되 가까운 이름만 읽히게 큰 글자로 이미 구획해 두었다.
    // 인스턴스마다 다른 칸을 보여 주기 위해 map offset 대용으로 버텍스 컬러에 슬롯을 실어 셰이더로 민다.
    nameMat.onBeforeCompile = (sh) => {
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
      sh.uniforms.uCols = { value: nameAt.cols };
      sh.uniforms.uRows = { value: nameAt.rows };
    };
    nameMat.customProgramCacheKey = () => 'gn-stop-name-atlas';
    const slotAttr = new THREE.InstancedBufferAttribute(new Float32Array([...stops.map((_, i) => i), ...stops.map((_, i) => i)]), 1);
    signs.geometry = signs.geometry.clone();
    signs.geometry.setAttribute('slot', slotAttr);

    const zebra = inst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), zebraMat, (j.zebras || []).length, 'gnStreetZebra');
    (j.zebras || []).forEach((z, i) => {
      StreetXform.compose(m4, quat, pos, scl, z[0], ground(z[0], z[1]) + 0.03, z[1], z[2], z[3], 1, z[4]);
      zebra.setMatrixAt(i, m4);
    });
    zebra.count = (j.zebras || []).length;
    zebra.instanceMatrix.needsUpdate = true;

    const paint = inst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), paintMat, (j.paints || []).length, 'gnStreetPaint');
    (j.paints || []).forEach((z, i) => {
      StreetXform.compose(m4, quat, pos, scl, z[0], ground(z[0], z[1]) + 0.025, z[1], z[2], z[3], 1, z[4]);
      paint.setMatrixAt(i, m4);
    });
    paint.count = (j.paints || []).length;
    paint.instanceMatrix.needsUpdate = true;

    const propGeos = [kioskGeo(), bikeGeo(), planterGeo(), bollardGeo(), poleGeo(), scooterGeo(), vendingGeo()];
    const propMats = [
      new THREE.MeshLambertMaterial({ color: '#d7c8a4' }),
      new THREE.MeshLambertMaterial({ color: '#2b2e33' }),
      new THREE.MeshLambertMaterial({ color: '#4a7a46' }),
      new THREE.MeshLambertMaterial({ color: '#c9ccd1' }),
      new THREE.MeshLambertMaterial({ color: '#4a4e55' }),
      new THREE.MeshLambertMaterial({ color: '#e24b3c' }),
      new THREE.MeshLambertMaterial({ color: '#3a6ea5' }),
    ];
    const propSrc = mobile ? (j.props || []).filter((_, i) => i % 2 === 0) : (j.props || []);
    const byKind = Array.from({ length: 7 }, () => []);
    for (const pr of propSrc) byKind[pr[0]]?.push(pr);
    const poleSrc = mobile ? [] : (j.poles || []);
    byKind[4].push(...poleSrc.map((p) => [4, p[0], p[1], p[2], 1]));
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

    let wires = null;
    if (!mobile && j.wires?.length) {
      const wmat = new THREE.MeshBasicMaterial({ color: '#2a2c30' });
      wires = inst(boxGeo(1, 1, 1, 0, 0, 0), wmat, j.wires.length, 'gnStreetWires');
      j.wires.forEach((w, i) => {
        const x = (w[0] + w[2]) / 2, z = (w[1] + w[3]) / 2;
        const dx = w[2] - w[0], dz = w[3] - w[1], L = Math.hypot(dx, dz);
        const y = ground(x, z) + 5.55;
        StreetXform.compose(m4, quat, pos, scl, x, y, z, Math.atan2(dx, dz), 0.04, 0.04, L);
        wires.setMatrixAt(i, m4);
      });
      wires.count = j.wires.length;
      wires.instanceMatrix.needsUpdate = true;
    }

    let waiters = null;
    if (!mobile && j.waiters?.length) {
      const wmat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
      waiters = inst(waiterGeo(), wmat, j.waiters.length, 'gnStreetWait');
      const pal = ['#3d4652', '#6a3a32', '#2f4a3c', '#3a3f6a', '#5a5248'];
      j.waiters.forEach((w, i) => {
        StreetXform.compose(m4, quat, pos, scl, w[0], ground(w[0], w[1]), w[1], w[2], 1, 1, 1);
        waiters.setMatrixAt(i, m4);
        waiters.setColorAt(i, tmpC.set(pal[i % pal.length]));
      });
      waiters.count = j.waiters.length;
      waiters.instanceMatrix.needsUpdate = true;
      if (waiters.instanceColor) waiters.instanceColor.needsUpdate = true;
    }

    meshes = {
      sideMetal, medMetal, sideGlass, medGlass, sideBench, medBench,
      bis, signs, ads, glows, zebra, paint, propIms, wires, waiters,
      ledMat, glowMat, nameMat,
    };
    stats.loaded = true;
    stats.stops = stops.length;
    stats.median = medN;
    stats.props = propSrc.length + poleSrc.length;
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
    if (meshes.ledMat) meshes.ledMat.opacity = on ? (0.35 + n * 0.65) : 0;
    if (meshes.glowMat) meshes.glowMat.opacity = n * 0.45;
    if (meshes.ledMat?.map) meshes.ledMat.map.offset.x = (performance.now() / 4200) % 1;
    if (meshes.bis) meshes.bis.visible = on;
    if (meshes.glows) meshes.glows.visible = on && n > 0.04;
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
