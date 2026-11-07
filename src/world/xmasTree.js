// [xmas] 광장용 크리스마스 트리 하나. 정자 광장·미금·잠실(롯데월드타워 남쪽 잔디)·스타베이스에 같은 모델을 둔다.
//   기본 켬(리뷰). ?xmas=0 끄기. ?xmas=auto 는 KST 12/1–12/26 만 (xmasSeason.js).
//   정적 부위는 메시 1개로 합치고, 전구·장식구는 인스턴스. 진짜 Light 없음. 약 200m 밖은 숨기고, 230m 안에서만 만든다.
//   코리더(?corridor=0)가 없으면 미금·잠실은 없다. ?migeum=0 이면 미금 트리만 없다. 스타베이스는 그 지역에서만.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNightFade, lightPoolMaterial } from './nightLights.js';
import { migeumEnabled } from '../corridor/migeum.js';
import { xmasActive, xmasMode } from './xmasSeason.js';

const BUILD_M = 230;
const HIDE_M = 200;
const DROP_M = 480;
const BLOCK_R = 1.85;

// 분수 서쪽, 느티나무 열(x≈-90)과 분수 패드(반지름 8.8) 사이. (-85, 25)는 느티나무(-90, 26)와 겹친다.
const JEONGJA = { id: 'jeongja', x: -84, z: 20, yaw: 0.4 };
// 미금 8번 출구(26.5, 1766) 북쪽 공원. 중심(23.6, 1747)은 성남대로·정류장에 걸친다.
// 도로에서 약 10m 안쪽 잔디(x=17)로 당긴다.
const MIGEUM = { id: 'migeum', x: 17, z: 1747, yaw: 1.1 };
// 롯데월드타워(fit -503.5, -16143.4) 북쪽 잔디 폴리곤 중심. 공사 가림막(halfM+10, rot -70°) 밖.
const JAMSIL = { id: 'jamsil', x: -515, z: -16201, yaw: -0.6 };
// 마을 스폰(표지판 0,0 근처) 앞, 건물·Memes Street 밖.
const STARBASE = { id: 'starbase', x: -20, z: 25, yaw: 2.2 };

const GREENS = ['#0c3d24', '#145232', '#1c6436', '#21743d', '#2a8648'];
const LIGHT_COLORS = ['#ff4b4b', '#ffd15c', '#7dffb3', '#8ec5ff', '#ff8ad4', '#fff4c8'];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

const TIERS = [
  { y: 0.95, r: 3.05, h: 2.05 },
  { y: 2.15, r: 2.68, h: 1.95 },
  { y: 3.35, r: 2.30, h: 1.85 },
  { y: 4.55, r: 1.94, h: 1.75 },
  { y: 5.75, r: 1.58, h: 1.65 },
  { y: 6.90, r: 1.24, h: 1.55 },
  { y: 8.05, r: 0.94, h: 1.42 },
  { y: 9.15, r: 0.66, h: 1.28 },
  { y: 10.20, r: 0.40, h: 1.12 },
];

function radiusAt(y) {
  if (y <= TIERS[0].y) return TIERS[0].r;
  for (let i = 1; i < TIERS.length; i++) {
    const a = TIERS[i - 1]; const b = TIERS[i];
    if (y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      return a.r + (b.r - a.r) * t;
    }
  }
  const last = TIERS[TIERS.length - 1];
  return Math.max(0.12, last.r * (1 - (y - last.y) / 1.4));
}

function paintFoliage(geo, baseHex, tipHex) {
  const p = geo.attributes.position;
  const cb = new THREE.Color(baseHex);
  const ct = new THREE.Color(tipHex);
  const frost = new THREE.Color('#e5f6ec');
  let min = Infinity; let max = -Infinity;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < min) min = y; if (y > max) max = y; }
  const arr = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  const span = max - min || 1;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min) / span;
    col.copy(cb).lerp(ct, Math.min(1, t * 0.55));
    const cap = Math.max(0, (t - 0.86) / 0.14);
    if (cap > 0) col.lerp(frost, cap * 0.4);
    arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** 겹치는 치마 콘. 끝은 바깥으로 조금 기울여 층이 매끄러운 원뿔로 보이지 않게 한다. */
function foliageCone(radius, height, y, { yaw = 0, tilt = 0, ox = 0, oz = 0, sx = 1, sz = 1, base = '#145232', tip = '#2f8a4c' } = {}) {
  const geo = new THREE.ConeGeometry(radius, height, 8, 1, false);
  paintFoliage(geo, base, tip);
  geo.translate(0, height / 2, 0);
  geo.scale(sx, 1, sz);
  if (tilt) geo.rotateZ(-tilt);
  if (yaw) geo.rotateY(yaw);
  geo.translate(ox, y, oz);
  return geo;
}

function skirtGeo() {
  const geo = new THREE.CylinderGeometry(0.55, 2.15, 0.42, 18, 1, true);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color('#9d2433');
  const b = new THREE.Color('#5c1018');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const ang = Math.atan2(p.getZ(i), p.getX(i));
    const fold = 0.5 + 0.5 * Math.cos(ang * 7);
    c.copy(a).lerp(b, fold * (p.getY(i) < 0 ? 0.85 : 0.25));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    if (p.getY(i) < 0) {
      const s = 1 + 0.07 * Math.sin(ang * 7);
      p.setX(i, p.getX(i) * s);
      p.setZ(i, p.getZ(i) * s);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.translate(0, 0.22, 0);
  geo.computeVertexNormals();
  return geo;
}

function giftBox(x, z, sx, sy, sz, yaw, body, ribbon) {
  const parts = [];
  const box = new THREE.BoxGeometry(sx, sy, sz);
  paint(box, body);
  box.translate(0, sy / 2, 0);
  parts.push(box);
  const bandY = new THREE.BoxGeometry(sx * 1.04, sy * 0.1, sz * 0.16);
  paint(bandY, ribbon);
  bandY.translate(0, sy * 0.62, 0);
  parts.push(bandY);
  const bandX = new THREE.BoxGeometry(sx * 0.16, sy * 0.1, sz * 1.04);
  paint(bandX, ribbon);
  bandX.translate(0, sy * 0.62, 0);
  parts.push(bandX);
  const bow = new THREE.BoxGeometry(sx * 0.34, sy * 0.16, sz * 0.22);
  paint(bow, ribbon);
  bow.translate(0, sy + 0.04, 0);
  parts.push(bow);
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  g.rotateY(yaw);
  g.translate(x, 0, z);
  return g;
}

function garland(turns, y0, y1, width, phase, colorA, colorB) {
  const segs = 88;
  const pos = []; const col = []; const idx = [];
  const ca = new THREE.Color(colorA); const cb = new THREE.Color(colorB);
  const c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = y0 + (y1 - y0) * t;
    const ang = phase + t * turns * Math.PI * 2;
    const rad = Math.max(0.18, radiusAt(y) * 0.8);
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    const tx = -Math.sin(ang);
    const tz = Math.cos(ang);
    const lift = Math.cos(t * turns * Math.PI * 2) * 0.05;
    c.copy(ca).lerp(cb, 0.5 + 0.5 * Math.sin(t * turns * Math.PI * 4));
    for (const s of [-1, 1]) {
      pos.push(x + tx * width * s, y + lift, z + tz * width * s);
      col.push(c.r, c.g, c.b);
    }
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function starGeometry() {
  const outer = 0.68; const inner = 0.28;
  const geos = [];
  for (const rotY of [0, Math.PI / 2]) {
    const pos = [];
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const r = i % 2 === 0 ? outer : inner;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    for (let i = 0; i < 10; i++) {
      const a = pts[i]; const b = pts[(i + 1) % 10];
      pos.push(0, 0, 0, a[0], a[1], 0, b[0], b[1], 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    g.rotateY(rotY);
    geos.push(g);
  }
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  return merged;
}

function buildKit() {
  const rnd = rng(20261201);
  const parts = [];
  const tips = [];

  const trunk = new THREE.CylinderGeometry(0.16, 0.28, 2.3, 7);
  paint(trunk, '#6b4a32');
  trunk.translate(0, 1.35, 0);
  parts.push(trunk);

  const pot = new THREE.CylinderGeometry(0.78, 0.92, 0.62, 12);
  paint(pot, '#7a2430');
  pot.translate(0, 0.31, 0);
  parts.push(pot);
  const rim = new THREE.CylinderGeometry(0.86, 0.86, 0.08, 12);
  paint(rim, '#e4b34a');
  rim.translate(0, 0.6, 0);
  parts.push(rim);
  parts.push(skirtGeo());

  const gifts = [
    [1.45, 0.35, 0.52, 0.46, 0.48, 0.3, '#c62828', '#f6f1e4'],
    [-1.15, 1.05, 0.4, 0.58, 0.38, 0.8, '#1b7a45', '#e4b34a'],
    [0.35, -1.45, 0.46, 0.4, 0.42, 1.4, '#1565c0', '#f6f1e4'],
    [-1.35, -0.7, 0.36, 0.32, 0.34, 2.2, '#f4efe4', '#c62828'],
    [1.2, -0.95, 0.34, 0.5, 0.32, -0.4, '#e4b34a', '#7a2430'],
  ];
  for (const [x, z, sx, sy, sz, yaw, body, rib] of gifts) parts.push(giftBox(x, z, sx, sy, sz, yaw, body, rib));

  for (let ti = 0; ti < TIERS.length; ti++) {
    const tier = TIERS[ti];
    const spin = ti * 0.47;
    const base = GREENS[ti % GREENS.length];
    const tip = ti > TIERS.length - 3 ? '#4eae68' : '#2a8648';
    const squash = 0.9 + (ti % 2) * 0.08;
    parts.push(foliageCone(tier.r, tier.h, tier.y, {
      yaw: spin, sx: squash, sz: 2 - squash, base, tip,
      ox: Math.cos(spin) * 0.08, oz: Math.sin(spin) * 0.08,
    }));
    const n = ti < 3 ? 6 : ti < 6 ? 5 : 4;
    for (let k = 0; k < n; k++) {
      const yaw = spin + (k / n) * Math.PI * 2 + 0.15;
      const reach = tier.r * (0.42 + (k % 2) * 0.08);
      parts.push(foliageCone(tier.r * 0.46, tier.h * 0.72, tier.y + tier.h * 0.18, {
        yaw, tilt: 0.42 + (k % 3) * 0.06,
        ox: Math.cos(yaw) * reach * 0.35,
        oz: Math.sin(yaw) * reach * 0.35,
        base, tip,
      }));
      if (k % 2 === 0) {
        const ang = yaw;
        const rad = tier.r * 0.92;
        tips.push(new THREE.Vector3(Math.cos(ang) * rad, tier.y + tier.h * 0.72, Math.sin(ang) * rad));
      }
    }
  }

  parts.push(garland(3.15, 1.55, 10.5, 0.07, 0.2, '#c62828', '#e4b34a'));
  parts.push(garland(3.15, 1.7, 10.35, 0.035, 0.2 + Math.PI, '#f6f1e4', '#f6f1e4'));

  // 이코사헤드는 인덱스가 없다. 합치기 전에 전부 비인덱스로 맞춘다.
  const prepared = [];
  for (const g of parts) {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    if (!n.attributes.normal) n.computeVertexNormals();
    prepared.push(n);
    if (n !== g) g.dispose();
  }
  const staticGeo = mergeGeometries(prepared);
  if (!staticGeo) throw new Error('[xmas] static merge failed');
  for (const g of prepared) g.dispose();
  staticGeo.computeVertexNormals();
  const staticMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });

  const baubleGeo = new THREE.IcosahedronGeometry(1, 0);
  const baubleMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
  const baubles = [];
  const bColors = ['#d32f2f', '#e4b34a', '#1565c0', '#f4efe4', '#1b7a45', '#ff8ad4'];
  for (let i = 0; i < 42; i++) {
    const y = 1.7 + (i / 42) * 8.4 + (rnd() - 0.5) * 0.2;
    const ang = rnd() * Math.PI * 2;
    const rad = radiusAt(y) * (0.55 + rnd() * 0.32);
    baubles.push({
      x: Math.cos(ang) * rad,
      y,
      z: Math.sin(ang) * rad,
      s: 0.11 + rnd() * 0.09,
      color: bColors[i % bColors.length],
    });
  }

  const lights = [];
  const turns = 4.2;
  const nSpiral = 78;
  for (let i = 0; i < nSpiral; i++) {
    const t = i / (nSpiral - 1);
    const y = 1.5 + t * 8.8;
    const ang = t * turns * Math.PI * 2;
    const rad = Math.max(0.16, radiusAt(y) * (0.72 + (i % 5 === 0 ? 0.12 : 0)));
    lights.push({
      x: Math.cos(ang) * rad,
      y: y + Math.sin(ang * 2) * 0.06,
      z: Math.sin(ang) * rad,
      s: 0.16 + (i % 4) * 0.02,
      phase: rnd() * Math.PI * 2,
      rate: 1.1 + rnd() * 2.4,
      color: LIGHT_COLORS[i % LIGHT_COLORS.length],
    });
  }
  for (let i = 0; i < tips.length; i += 2) {
    const p = tips[i];
    lights.push({
      x: p.x, y: p.y, z: p.z,
      s: 0.2,
      phase: rnd() * Math.PI * 2,
      rate: 0.8 + rnd() * 1.6,
      color: LIGHT_COLORS[(i + 2) % LIGHT_COLORS.length],
    });
  }
  lights.push({
    x: 0, y: 11.55, z: 0, s: 0.95, phase: 0, rate: 1.4, color: '#fff1c2', glow: true,
  });

  const lightGeo = new THREE.PlaneGeometry(1, 1);
  const nL = lights.length;
  const aColor = new Float32Array(nL * 3);
  const aPhase = new Float32Array(nL);
  const aRate = new Float32Array(nL);
  const aScale = new Float32Array(nL);
  const col = new THREE.Color();
  lights.forEach((L, i) => {
    col.set(L.color);
    aColor[i * 3] = col.r; aColor[i * 3 + 1] = col.g; aColor[i * 3 + 2] = col.b;
    aPhase[i] = L.phase; aRate[i] = L.rate; aScale[i] = L.s;
  });
  lightGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));
  lightGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
  lightGeo.setAttribute('aRate', new THREE.InstancedBufferAttribute(aRate, 1));
  lightGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(aScale, 1));

  const uNight = { value: 0 };
  const uTime = { value: 0 };
  const lightMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uNight, ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */`
      attribute vec3 aColor;
      attribute float aPhase;
      attribute float aRate;
      attribute float aScale;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vTw;
      uniform float uTime;
      uniform float uNight;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = uv;
        float tw = 0.42 + 0.58 * (0.5 + 0.5 * sin(uTime * aRate + aPhase));
        float rare = step(0.82, fract(aPhase * 1.37));
        float gate = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(uTime * (0.7 + aRate * 0.2) + aPhase));
        tw = mix(tw, 0.18 + 0.82 * gate, rare);
        vTw = tw;
        vColor = aColor * tw * mix(0.72, 1.75, uNight);
        vec3 center = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
        mvPosition.xy += position.xy * aScale;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vTw;
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec2 d = vUv - vec2(0.5);
        float r = length(d);
        float a = smoothstep(0.5, 0.12, r);
        if (a < 0.04) discard;
        float core = smoothstep(0.28, 0.0, r);
        vec3 col = vColor * (0.75 + 0.7 * core) * (0.85 + 0.3 * vTw);
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });

  const starGeo = starGeometry();
  const starMat = new THREE.MeshBasicMaterial({
    color: '#ffe7a0', side: THREE.DoubleSide, toneMapped: false, fog: true,
  });

  const poolMat = lightPoolMaterial({ color: '#ffd9a0', intensity: 1.15, radius: 1, radiusZ: 1 });
  const poolGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  poolGeo.deleteAttribute('uv');
  poolGeo.deleteAttribute('normal');

  return {
    staticGeo, staticMat, baubleGeo, baubleMat, baubles,
    lightGeo, lightMat, lights, starGeo, starMat, poolGeo, poolMat, uNight, uTime,
  };
}

function spawnTree(kit, spot, y) {
  const group = new THREE.Group();
  group.name = 'xmas-tree';
  group.userData.perfNoInstance = true;
  group.position.set(spot.x, y, spot.z);
  group.rotation.y = spot.yaw || 0;

  const body = new THREE.Mesh(kit.staticGeo, kit.staticMat);
  body.castShadow = true;
  body.receiveShadow = true;
  body.name = 'xmas-tree-body';
  group.add(body);

  const balls = new THREE.InstancedMesh(kit.baubleGeo, kit.baubleMat, kit.baubles.length);
  balls.name = 'xmas-baubles';
  balls.castShadow = false;
  balls.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  kit.baubles.forEach((b, i) => {
    dummy.position.set(b.x, b.y, b.z);
    dummy.scale.setScalar(b.s);
    dummy.rotation.set(0, i, 0);
    dummy.updateMatrix();
    balls.setMatrixAt(i, dummy.matrix);
    balls.setColorAt(i, c.set(b.color));
  });
  balls.instanceMatrix.needsUpdate = true;
  if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
  group.add(balls);

  const bulbs = new THREE.InstancedMesh(kit.lightGeo, kit.lightMat, kit.lights.length);
  bulbs.name = 'xmas-lights';
  bulbs.frustumCulled = true;
  bulbs.renderOrder = 1;
  kit.lights.forEach((L, i) => {
    dummy.position.set(L.x, L.y, L.z);
    dummy.scale.setScalar(1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
  });
  bulbs.instanceMatrix.needsUpdate = true;
  bulbs.computeBoundingSphere();
  group.add(bulbs);

  const star = new THREE.Mesh(kit.starGeo, kit.starMat);
  star.name = 'xmas-star';
  star.position.y = 11.35;
  star.renderOrder = 1;
  group.add(star);

  const pool = new THREE.InstancedMesh(kit.poolGeo, kit.poolMat, 1);
  pool.name = 'xmas-pool';
  pool.setMatrixAt(0, new THREE.Matrix4().makeScale(3.8, 1, 3.8));
  pool.position.y = 0.04;
  pool.renderOrder = 1;
  pool.frustumCulled = false;
  group.add(pool);

  return { id: spot.id, x: spot.x, z: spot.z, group, bulbs, star, pool };
}

export function xmasSpots({ regionId, corridor = false, migeum = true } = {}) {
  if (regionId === 'starbase') return [STARBASE];
  if (regionId !== 'jeongja') return [];
  const list = [JEONGJA];
  if (corridor && migeum) list.push(MIGEUM);
  if (corridor) list.push(JAMSIL);
  return list;
}

/**
 * @param {{ scene: THREE.Scene, region?: { id: string }, terrain?: { getGroundHeight: Function }, params?: URLSearchParams, corridor?: object }} opts
 */
export function mountXmasTrees({ scene, region = null, terrain = null, params = null, corridor = null } = {}) {
  const flag = params?.get?.('xmas') ?? null;
  const mode = xmasMode(flag);
  const noop = { enabled: false, mode, spots: [], blocks: () => false, update() {}, dispose() {} };
  if (!xmasActive(flag) || !scene) return noop;

  const spots = xmasSpots({
    regionId: region?.id,
    corridor: !!corridor,
    migeum: migeumEnabled(params || (typeof location !== 'undefined' ? location.search : '')),
  });
  if (!spots.length) return noop;

  const night = createNightFade({ seconds: 4 });
  let kit = null;
  const built = new Map();
  const groundY = (x, z) => (terrain ? terrain.getGroundHeight(x, z, 0) : 0) || 0;

  function ensureKit() {
    if (!kit) kit = buildKit();
    return kit;
  }

  function despawn(rec) {
    scene.remove(rec.group);
    rec.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    built.delete(rec.id);
  }

  function update(dt, camera) {
    const t = night.update(dt || 0);
    const k = kit;
    if (k) {
      k.uTime.value += dt || 0;
      k.uNight.value = t;
      k.poolMat.uniforms.uNight.value = t;
      const pulse = 0.82 + 0.18 * Math.sin(k.uTime.value * 2.1);
      const boost = (0.75 + t * 0.85) * pulse;
      k.starMat.color.setRGB(1.0 * boost, (0.86 + t * 0.1) * boost, (0.45 + t * 0.25) * boost);
      k.baubleMat.emissive.setRGB(0.22 * t, 0.1 * t, 0.04 * t);
      k.staticMat.emissive.setRGB(0.015 * t, 0.03 * t, 0.018 * t);
    }
    if (!camera) return;
    const cx = camera.position.x; const cz = camera.position.z;
    for (const spot of spots) {
      const d = Math.hypot(cx - spot.x, cz - spot.z);
      let rec = built.get(spot.id);
      if (!rec && d < BUILD_M) {
        rec = spawnTree(ensureKit(), spot, groundY(spot.x, spot.z));
        scene.add(rec.group);
        built.set(spot.id, rec);
      } else if (rec && d > DROP_M) {
        despawn(rec);
        continue;
      }
      if (!rec) continue;
      rec.group.visible = d < HIDE_M;
      rec.pool.visible = d < HIDE_M && t > 0.04;
    }
  }

  function blocks(x, z) {
    for (const rec of built.values()) {
      if (!rec.group.visible) continue;
      if (Math.hypot(x - rec.x, z - rec.z) < BLOCK_R) return true;
    }
    return false;
  }

  return {
    enabled: true,
    mode,
    spots,
    blocks,
    update,
    get built() { return built.size; },
    places() {
      return [...built.values()].map((r) => ({
        id: r.id, x: r.x, y: +r.group.position.y.toFixed(2), z: r.z, visible: r.group.visible,
      }));
    },
    dispose() {
      night.dispose();
      for (const rec of [...built.values()]) despawn(rec);
      if (!kit) return;
      kit.staticGeo.dispose();
      kit.staticMat.dispose();
      kit.baubleGeo.dispose();
      kit.baubleMat.dispose();
      kit.lightGeo.dispose();
      kit.lightMat.dispose();
      kit.starGeo.dispose();
      kit.starMat.dispose();
      kit.poolGeo.dispose();
      kit.poolMat.dispose();
      kit = null;
    },
  };
}
