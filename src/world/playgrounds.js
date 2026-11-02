// [playgrounds] 동네 놀이터 세트 (미끄럼틀 · 그네 · 시소 · 정글짐 · 모래놀이터)
//   위치: public/corridor/playgrounds.json (scripts/corridor/build-playgrounds.mjs 가 OSM leisure=playground 폴리곤에서 굽는다)
//   그리기: 부품 종류마다 InstancedMesh 1개(총 5개, 재질 1개 · 텍스처 없음 · 꼭짓점 색). 높이는 지형에 붙인다.
//   보이기: 카메라 초점에서 VIS_R 안 + (코리더 구간이면) 그 칸의 상세 타일이 빌드됐을 때만. 하나도 안 보이면 GPU 버퍼를 해제한다.
//   조경(나무·생울타리·덤불·풀숲·벤치)은 playgroundLand.js — landUrl 이 있을 때만(?pgland=0 이면 없음). 그때 세트 밑 고무칩 바닥도 깐다.
//   ?playgrounds=0 이면 game.js 가 이 모듈을 부르지 않는다(데이터 요청·메시 없음).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createLandLayer } from './playgroundLand.js';

export const SET_W = 15, SET_D = 10; // 배율 1 세트 바닥(m) — scripts/corridor/build-playgrounds.mjs 와 같아야 함
const VIS_R = 450;       // 이 거리 밖 세트는 숨김 (코리더 상세 타일 반경 ~650m 안쪽)
const REFRESH = 0.25;    // 가시 목록 갱신 주기(초)
const SINK = 0.3;        // 경사지에서 뜨지 않게 기둥을 땅속으로

const C = {
  red: '#e5483c', yellow: '#f2c230', blue: '#2f7fd8', green: '#3aa05a', orange: '#f08a2c',
  steel: '#9aa0a6', dark: '#3b3f46', wood: '#c9884a', sand: '#e6d29a', concrete: '#cfc8b8', rubber: '#c98a62',
};

// ---------- 저폴리 부품 (세트 로컬 좌표: x = 긴 변, z = 짧은 변, y = 위, 원점 = 세트 중심 바닥) ----------
const tmpColor = new THREE.Color();
function paint(g, color) {
  g.deleteAttribute('uv');
  tmpColor.set(color);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = tmpColor.r; a[i * 3 + 1] = tmpColor.g; a[i * 3 + 2] = tmpColor.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
/** 축 정렬 상자: 중심 (x, y, z) */
const box = (w, h, d, x, y, z, color) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
/** 두 점 a→b 를 잇는 사각 막대 (두께 t) */
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
function bar(a, b, t, color) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = _d.length(); _q.setFromUnitVectors(_up, _d.normalize());
  const g = new THREE.BoxGeometry(t, L, t);
  g.applyMatrix4(_m.compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, new THREE.Vector3(1, 1, 1)));
  return paint(g, color);
}

function sandbox(ox, oz) {
  const S = 4.2, h = 0.25, t = 0.25, y = h / 2 - 0.1;
  return [
    box(S, 0.12, S, ox, 0.02, oz, C.sand),
    box(S + t, h, t, ox, y, oz - S / 2, C.wood), box(S + t, h, t, ox, y, oz + S / 2, C.wood),
    box(t, h, S, ox - S / 2, y, oz, C.wood), box(t, h, S, ox + S / 2, y, oz, C.wood),
  ];
}
function jungleGym(ox, oz) {
  const g = [], H = 2.1, s = 1.5, t = 0.09, k = [-s, 0, s];
  for (const x of k) for (const z of k) g.push(bar([ox + x, -SINK, oz + z], [ox + x, H, oz + z], t, C.blue));
  for (const [lv, col] of [[H / 2, C.red], [H, C.yellow]]) for (const v of k) {
    g.push(bar([ox - s, lv, oz + v], [ox + s, lv, oz + v], t, col));
    g.push(bar([ox + v, lv, oz - s], [ox + v, lv, oz + s], t, col));
  }
  return g;
}
function seesaw(ox, oz) {
  const L = 3.6, tilt = 0.12, py = 0.5, hx = (L / 2) * Math.cos(tilt), hy = (L / 2) * Math.sin(tilt);
  const g = [box(0.4, 0.45 + SINK, 0.42, ox, (0.45 - SINK) / 2, oz, C.dark), bar([ox - hx, py - hy, oz], [ox + hx, py + hy, oz], 0.32, C.red)];
  for (const sgn of [-1, 1]) { // 손잡이 (판 끝 안쪽 0.45m)
    const f = (L / 2 - 0.45) / (L / 2), x = ox + sgn * hx * f, y = py + sgn * hy * f;
    g.push(bar([x, y, oz], [x, y + 0.35, oz], 0.06, C.yellow), bar([x, y + 0.35, oz - 0.18], [x, y + 0.35, oz + 0.18], 0.06, C.yellow));
  }
  return g;
}
function swings(ox, oz) {
  const H = 2.4, hw = 1.8, spread = 0.75, t = 0.1, g = [];
  for (const sx of [-hw, hw]) for (const sz of [-spread, spread]) g.push(bar([ox + sx, -SINK, oz + sz], [ox + sx, H, oz], t, C.green));
  g.push(bar([ox - hw - 0.15, H, oz], [ox + hw + 0.15, H, oz], 0.12, C.orange));
  for (const x of [-0.85, 0.85]) {
    g.push(box(0.5, 0.06, 0.22, ox + x, 0.48, oz, C.dark));
    for (const cx of [-0.22, 0.22]) g.push(bar([ox + x + cx, 0.5, oz], [ox + x + cx, H, oz], 0.03, C.steel));
  }
  return g;
}
function slide(ox, oz) {
  const P = 1.6, g = [], px = ox - 1.3, h = 0.7;
  g.push(box(1.4, 0.12, 1.4, px, P, oz, C.yellow));
  for (const dx of [-h, h]) for (const dz of [-h, h]) g.push(bar([px + dx, -SINK, oz + dz], [px + dx, 2.5, oz + dz], 0.1, C.blue));
  g.push(box(1.7, 0.1, 1.7, px, 2.55, oz, C.red)); // 지붕
  for (const dz of [-0.3, 0.3]) g.push(bar([px - h - 0.75, -SINK, oz + dz], [px - h, P, oz + dz], 0.07, C.steel)); // 사다리
  for (let i = 1; i <= 4; i++) { const f = i / 5, x = px - h - 0.75 * (1 - f); g.push(bar([x, P * f, oz - 0.3], [x, P * f, oz + 0.3], 0.05, C.steel)); }
  const a = [px + h, P, oz], b = [ox + 3.3, 0.35, oz];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const bed = new THREE.BoxGeometry(len, 0.06, 0.62).rotateZ(ang).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, oz);
  g.push(paint(bed, C.yellow));
  for (const dz of [-0.33, 0.33]) g.push(bar([a[0], a[1] + 0.15, oz + dz], [b[0], b[1] + 0.15, oz + dz], 0.06, C.red));
  g.push(box(0.7, 0.06, 0.62, b[0] + 0.35, 0.35, oz, C.yellow)); // 착지부
  g.push(bar([b[0] + 0.6, -SINK, oz], [b[0] + 0.6, 0.35, oz], 0.1, C.blue));
  return g;
}

/** 세트 밑 고무칩 바닥 + 경계석 (세트 로컬 원점 중심, 아래로 두껍게 깔아 경사에서도 뜨지 않게). 60 tris */
function safetyMat() {
  const W = SET_W - 0.6, D = SET_D - 0.6, t = 0.18, top = 0.05, bot = -0.5, ct = top + 0.04;
  const rim = (w, d, x, z) => box(w, ct - bot, d, x, (ct + bot) / 2, z, C.concrete);
  return [
    box(W, top - bot, D, 0, (top + bot) / 2, 0, C.rubber),
    rim(W + t, t, 0, -D / 2), rim(W + t, t, 0, D / 2), rim(t, D, -W / 2, 0), rim(t, D, W / 2, 0),
  ];
}

// 부품 정의: name, 세트 안 기준점(지형 높이를 재는 곳), 만드는 함수
const PARTS = [
  { name: 'sandbox', at: [-4.6, -2.4], make: sandbox },
  { name: 'jungleGym', at: [0.9, -2.6], make: jungleGym },
  { name: 'seesaw', at: [5.4, -2.6], make: seesaw },
  { name: 'swings', at: [-4.4, 2.6], make: swings },
  { name: 'slide', at: [1.6, 2.6], make: slide },
];
/** 부품별 병합 지오메트리 (세트 로컬). 테스트/측정용으로도 export */
export function buildPartGeometries({ mat = false } = {}) {
  return PARTS.map((p) => {
    const parts = p.make(p.at[0], p.at[1]);
    if (mat && p.name === 'sandbox') parts.push(...safetyMat()); // 바닥은 모래놀이터 메시에 합침 (드로우콜 0)
    const g = mergeGeometries(parts, false);
    for (const q of parts) q.dispose();
    g.computeBoundingSphere();
    return { name: p.name, at: p.at, geometry: g };
  });
}
export const triangleCount = (geos) => geos.reduce((n, { geometry: g }) => n + (g.index ? g.index.count : g.attributes.position.count) / 3, 0);

// ---------- 배치 / 스트리밍 ----------
export function createPlaygrounds({ scene, terrain, corridor, liveBox, url, landUrl = null }) {
  const root = new THREE.Group(); root.name = 'playgrounds'; scene.add(root);
  let sets = null;          // [{ x, z, ry, s, tile, parts: [Matrix4 ×5] }]
  let meshes = null;        // 부품별 InstancedMesh (보일 때만 존재)
  let material = null;
  let acc = REFRESH, lastKey = '', disposed = false;
  const stats = { sets: 0, visible: 0, triangles: 0, loaded: false };
  const TS = 500;
  const inLive = (x, z) => !!liveBox && x >= liveBox.x0 && x <= liveBox.x1 && z >= liveBox.z0 && z <= liveBox.z1;
  const groundAt = (x, z) => (terrain ? terrain.renderHeight(x, z) : 0);
  const land = landUrl ? createLandLayer({ root, terrain, url: landUrl }) : null;
  land?.ready.then(() => { lastKey = ''; acc = REFRESH; }); // 조경이 세트보다 늦게 오면 다음 갱신에서 다시 넘긴다

  const ready = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
    if (!j || disposed) return;
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), list = [];
    for (const p of j.playgrounds) for (const [x, z, ry, s] of p.sets) {
      if (!corridor && !inLive(x, z)) continue; // 코리더가 꺼져 있으면 정자 안만
      q.setFromAxisAngle(up, ry);
      const c = Math.cos(ry), sn = Math.sin(ry);
      const parts = PARTS.map(({ at: [ax, az] }) => {
        const wx = x + (ax * c + az * sn) * s, wz = z + (-ax * sn + az * c) * s; // 부품 기준점의 월드 위치
        return new THREE.Matrix4().compose(new THREE.Vector3(x, groundAt(wx, wz), z), q, new THREE.Vector3(s, s, s));
      });
      list.push({ x, z, ry, s, id: p.id, name: p.name, tile: inLive(x, z) ? null : `${Math.floor(x / TS)}_${Math.floor(z / TS)}`, parts });
    }
    sets = list; stats.sets = list.length; stats.loaded = true; acc = REFRESH;
  });

  function ensureMeshes() {
    if (meshes) return;
    material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const geos = buildPartGeometries({ mat: !!land });
    stats.triangles = triangleCount(geos);
    meshes = geos.map(({ name, geometry }) => {
      const m = new THREE.InstancedMesh(geometry, material, sets.length);
      m.name = 'playground-' + name; m.castShadow = name !== 'sandbox'; m.receiveShadow = true; m.count = 0; // 납작한 모래놀이터(+바닥)는 그림자 패스 생략 (-1 draw)
      root.add(m); return m;
    });
  }
  function freeMeshes() {
    if (!meshes) return;
    for (const m of meshes) { root.remove(m); m.geometry.dispose(); m.dispose(); }
    material.dispose(); meshes = null; material = null;
  }

  function refresh(fx, fz, mode) {
    const vis = [];
    if (mode !== 'overview') for (let i = 0; i < sets.length; i++) {
      const st = sets[i];
      if (Math.hypot(st.x - fx, st.z - fz) > VIS_R) continue;
      if (st.tile && corridor?.tiles.get(st.tile)?.dState !== 3) continue; // 코리더 상세 타일이 빌드된 칸만
      vis.push(i);
    }
    const key = vis.join(',');
    if (key === lastKey) return;
    lastKey = key; stats.visible = vis.length;
    land?.show([...new Set(vis.map((i) => sets[i].id))]);
    if (!vis.length) { freeMeshes(); return; }
    ensureMeshes();
    meshes.forEach((m, k) => {
      vis.forEach((i, n) => m.setMatrixAt(n, sets[i].parts[k]));
      m.count = vis.length; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
    });
  }

  return {
    root, stats, land, ready: Promise.all([ready, land?.ready]),
    get sets() { return sets; },
    update(dt, fx, fz, mode = 'follow') {
      if (!sets) return;
      acc += dt;
      if (acc < REFRESH) return;
      acc = 0; refresh(fx, fz, mode);
    },
    dispose() { disposed = true; freeMeshes(); land?.dispose(); scene.remove(root); sets = null; },
  };
}
