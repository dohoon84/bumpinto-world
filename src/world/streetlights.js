// [streetlights] T자 가로등 (정자 + 수내→잠실 코리더 차도)
//   위치: public/corridor/streetlights.json (scripts/corridor/build-streetlights.mjs 가 도로 데이터 · OSM highway=street_lamp 에서 굽는다)
//   그리기: 부품마다 InstancedMesh 1개 — 기둥+팔+등갓(정점 색 1 재질) · 램프 유리(발광) · 바닥 불빛 웅덩이(가산 혼합, 밤에만).
//           가로등마다 실제 광원은 없다. 텍스처 없음. 그림자 패스 없음.
//   보이기: 250 m 칸 단위로 카메라 초점에서 VIS_R 안 + (코리더 구간이면) 그 칸의 상세 타일이 빌드됐을 때만.
//           칸이 빠지면(타일 언로드 포함) 그 칸의 행렬 캐시를 버리고, 보이는 게 없으면 GPU 버퍼를 해제한다. 전체 지도(overview)에선 숨김.
//   밤: world/nightLights.js createNightFade (evening.js 와 같은 저녁 판정, 4초 페이드) → 램프 발광 + 웅덩이 밝기.
//   ?streetlights=0 이면 game.js 가 이 모듈을 부르지 않는다(데이터 요청·메시 없음).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNightFade, lightPoolMaterial } from './nightLights.js';

const CELL = 250;        // scripts/corridor/build-streetlights.mjs 와 같아야 함
const VIS_R = 420;       // 이 거리 밖 칸은 숨김 (코리더 상세 타일 반경 안쪽)
const REFRESH = 0.25;    // 가시 칸 갱신 주기(초)
const H = 10, ARM = 2.0; // 큰길 가로등 높이 · 기둥에서 팔 끝까지(m). ARM 은 굽는 스크립트와 같아야 함
const POOL_R = 5.5;      // 웅덩이 반경(배율 1)
const SCALE = [1, 0.72, 0.6]; // kind 0 큰길 · 1 작은 길 · 2 OSM 가로등(보행 공간이 많아 작게)
const LENS_DAY = new THREE.Color('#d8d6cf'), LENS_NIGHT = new THREE.Color('#fff1c9').multiplyScalar(1.6);

const tmpC = new THREE.Color();
function paint(g, color) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  tmpC.set(color);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = tmpC.r; a[i * 3 + 1] = tmpC.g; a[i * 3 + 2] = tmpC.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** 로컬 좌표: 원점 = 기둥 밑, +Y 위, 팔은 ±X (도로 법선 방향) */
export function buildStreetlightGeometries() {
  const pole = paint(new THREE.CylinderGeometry(0.085, 0.14, H, 6, 1, true).translate(0, H / 2 - 0.3, 0), '#646b73');
  const arm = paint(new THREE.BoxGeometry(2 * ARM + 0.2, 0.12, 0.12).translate(0, H - 0.3, 0), '#646b73');
  const hoods = [-1, 1].map((s) => paint(new THREE.BoxGeometry(0.8, 0.16, 0.36).translate(s * (ARM - 0.25), H - 0.36, 0), '#4d535a'));
  const body = mergeGeometries([pole, arm, ...hoods]);
  [pole, arm, ...hoods].forEach((g) => g.dispose());
  const lensParts = [-1, 1].map((s) => new THREE.BoxGeometry(0.72, 0.06, 0.3).translate(s * (ARM - 0.25), H - 0.46, 0));
  const lens = mergeGeometries(lensParts.map((g) => { g.deleteAttribute('uv'); return g; }));
  lensParts.forEach((g) => g.dispose());
  // 웅덩이: 팔 방향으로 긴 사각형 하나에 초점 두 개(lightPoolMaterial focusX = ARM)
  const pool = new THREE.PlaneGeometry(2 * (ARM + POOL_R), 2 * POOL_R).rotateX(-Math.PI / 2);
  pool.deleteAttribute('uv'); pool.deleteAttribute('normal');
  return { body, lens, pool };
}
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

export function createStreetlights({ scene, terrain = null, corridor = null, liveBox = null, url }) {
  const root = new THREE.Group(); root.name = 'streetlights';
  scene.add(root);
  const stats = { loaded: false, lamps: 0, visible: 0, cells: 0, trisPerLamp: 0, night: 0 };
  const night = createNightFade();
  const inLive = (x, z) => !!liveBox && x >= liveBox.x0 && x <= liveBox.x1 && z >= liveBox.z0 && z <= liveBox.z1;
  const TS = corridor?.tiles ? 500 : 0;
  let groups = null;   // [{ cx, cz, tile: '키'|null, data: Float32Array(x,z,yaw,kind…), body: Float32Array|null, pool }]
  let meshes = null, mats = null, cap = 0, lastKey = '', acc = REFRESH, disposed = false;

  const groundAt = (x, z) => (terrain ? terrain.renderHeight(x, z) : 0);

  const ready = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
    if (!j || disposed) return;
    const list = [];
    for (const [key, arr] of Object.entries(j.cells)) {
      const [cx, cz] = key.split('_').map(Number);
      const free = [], gated = [];
      let tileKey = null;
      for (let i = 0; i < arr.length; i += 4) {
        const x = arr[i], z = arr[i + 1];
        if (!corridor && !inLive(x, z)) continue; // 코리더가 꺼져 있으면 정자 안만
        const tk = TS ? `${Math.floor(x / TS)}_${Math.floor(z / TS)}` : null;
        const gate = !inLive(x, z) && tk && corridor.tiles.has(tk);
        if (gate) tileKey = tk;
        (gate ? gated : free).push(x, z, arr[i + 2], arr[i + 3]);
      }
      if (free.length) list.push({ cx, cz, tile: null, data: new Float32Array(free), body: null, pool: null });
      if (gated.length) list.push({ cx, cz, tile: tileKey, data: new Float32Array(gated), body: null, pool: null });
    }
    groups = list; stats.lamps = list.reduce((a, g) => a + g.data.length / 4, 0); stats.loaded = true; acc = REFRESH;
  });

  // 칸의 인스턴스 행렬(기둥 · 웅덩이)을 지형에 붙여 계산. 강 둔치(높이 < -0.3)는 건너뜀(가로수와 같은 규칙)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s3 = new THREE.Vector3();
  const ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
  function bake(g) {
    const n = g.data.length / 4, body = new Float32Array(n * 16), pool = new Float32Array(n * 16);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const x = g.data[i * 4], z = g.data[i * 4 + 1], yaw = g.data[i * 4 + 2], s = SCALE[g.data[i * 4 + 3]] ?? 1;
      const h = groundAt(x, z);
      if (terrain && h < -0.3) continue;
      q.setFromAxisAngle(up, yaw);
      m4.compose(p.set(x, h, z), q, s3.set(s, s, s)).toArray(body, k * 16);
      // 웅덩이: 팔 방향(ux,uz)·직각(vx,vz) 경사를 따라 기울임
      const ux = Math.cos(yaw), uz = -Math.sin(yaw), vx = -uz, vz = ux, d = (ARM + POOL_R * 0.5) * s;
      const hx = (groundAt(x + ux * d, z + uz * d) - groundAt(x - ux * d, z - uz * d)) / (2 * d);
      const hz = (groundAt(x + vx * d, z + vz * d) - groundAt(x - vx * d, z - vz * d)) / (2 * d);
      ax.set(ux, hx, uz).normalize(); az.set(vx, hz, vz).normalize(); ay.crossVectors(az, ax).normalize();
      m4.makeBasis(ax.multiplyScalar(s), ay.multiplyScalar(s), az.multiplyScalar(s)).setPosition(x, h + 0.14, z).toArray(pool, k * 16);
      k++;
    }
    g.body = body.subarray(0, k * 16); g.pool = pool.subarray(0, k * 16);
  }

  function ensureMeshes(need) {
    if (meshes && need <= cap) return;
    freeMeshes();
    cap = Math.max(256, 2 ** Math.ceil(Math.log2(need)));
    const geo = buildStreetlightGeometries();
    stats.trisPerLamp = tris(geo.body) + tris(geo.lens) + tris(geo.pool);
    mats = {
      body: new THREE.MeshLambertMaterial({ vertexColors: true }),
      lens: new THREE.MeshBasicMaterial({ color: LENS_DAY.clone() }),
      pool: lightPoolMaterial({ color: '#ffd59a', intensity: 0.8, radius: POOL_R, focusX: ARM }),
    };
    const mk = (name, g, m) => { const im = new THREE.InstancedMesh(g, m, cap); im.name = 'streetlight-' + name; im.count = 0; im.castShadow = false; im.receiveShadow = name === 'body'; root.add(im); return im; };
    meshes = { body: mk('body', geo.body, mats.body), lens: mk('lens', geo.lens, mats.lens), pool: mk('pool', geo.pool, mats.pool) };
    meshes.pool.renderOrder = 2;
    applyNight();
  }
  function freeMeshes() {
    if (!meshes) return;
    for (const m of Object.values(meshes)) { root.remove(m); m.geometry.dispose(); m.dispose(); }
    for (const m of Object.values(mats)) m.dispose();
    meshes = null; mats = null; cap = 0;
  }
  function applyNight() {
    if (!meshes) return;
    const v = night.value;
    mats.lens.color.copy(LENS_DAY).lerp(LENS_NIGHT, v);
    mats.pool.uniforms.uNight.value = v;
    meshes.pool.visible = v > 0.01;
  }

  function refresh(fx, fz, mode) {
    const vis = [];
    if (mode !== 'overview') for (let i = 0; i < groups.length; i++) {
      const g = groups[i], x0 = g.cx * CELL, z0 = g.cz * CELL;
      const d = Math.hypot(Math.max(x0 - fx, 0, fx - x0 - CELL), Math.max(z0 - fz, 0, fz - z0 - CELL));
      if (d > VIS_R) continue;
      if (g.tile && corridor.tiles.get(g.tile)?.dState !== 3) continue; // 코리더 상세 타일이 빌드된 칸만
      vis.push(i);
    }
    const key = vis.join(',');
    if (key === lastKey) return;
    lastKey = key;
    const on = new Set(vis);
    for (let i = 0; i < groups.length; i++) if (!on.has(i) && groups[i].body) { groups[i].body = null; groups[i].pool = null; } // 빠진 칸 캐시 해제
    let n = 0;
    for (const i of vis) { if (!groups[i].body) bake(groups[i]); n += groups[i].body.length / 16; }
    stats.visible = n; stats.cells = vis.length;
    if (!n) { freeMeshes(); return; }
    ensureMeshes(n);
    let o = 0;
    for (const i of vis) {
      const g = groups[i];
      meshes.body.instanceMatrix.array.set(g.body, o * 16);
      meshes.pool.instanceMatrix.array.set(g.pool, o * 16);
      o += g.body.length / 16;
    }
    meshes.lens.instanceMatrix.array.set(meshes.body.instanceMatrix.array.subarray(0, n * 16));
    for (const m of Object.values(meshes)) {
      m.count = n;
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, n * 16); m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }

  return {
    root, stats, ready,
    update(dt, fx, fz, mode = 'follow') {
      const before = night.value;
      night.update(dt);
      stats.night = night.value;
      if (night.value !== before) applyNight();
      if (!groups) return;
      acc += dt;
      if (acc < REFRESH) return;
      acc = 0; refresh(fx, fz, mode);
    },
    dispose() { disposed = true; freeMeshes(); night.dispose(); scene.remove(root); groups = null; },
  };
}
