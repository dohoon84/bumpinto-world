// [seongsu] 성수동 — 실제 OSM 길·필지·2호선 고가철도 + 하우스 노웨어 서울(젠틀몬스터 성수 사옥).
//   세계관: 정자·명동과 같은 단색 Lambert · 단순 매스 · 한글 간판. 고해상도는 HQ 형상·전시물에만 쓴다.
//   리전은 정자 월드의 섬(명동·남산·강남과 같은 패턴): 별도 멀티플레이 서버/DB가 필요 없다.
//   ?seongsu=0: 리전·2호선 성수역·게이트 칩을 함께 숨긴다. ?hnnpc=0: HQ 사람만, ?ssnpc=0: 거리 사람만 끈다.
//   출처: public/corridor/seongsu/seongsu.json (scripts/corridor/build-seongsu.py), © OpenStreetMap contributors (ODbL).
import * as THREE from 'three';
import { buildingMeshesAsync } from '../tileMesh.js';
import { watchEvening } from '../../evening.js';
import { createHQ, floorOfY } from '../../gentlemonster/hq.js';
import { Builder } from '../../gentlemonster/geo.js';
import { labelTex } from '../../gentlemonster/textures.js';
import { hqCrowdInput, staffLook, guestLook, withCum } from '../../gentlemonster/hqNpc.js';
import { createMyeongdongNpc } from './myeongdongNpc.js';
import { GeoBuf, hex3, pointInRing, distToSeg, CellGrid, hash01 } from './myeongdongGeo.js';
import { syncLandmarkDormant } from './lazyLandmarks.js';
import { SEONGSU_BOUNDS, SEONGSU_APRON, SEONGSU_HQ, SEONGSU_SPAWN, inSeongsu, hqLocal, hqWorld } from './seongsuFlags.js';

const CAR = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link', 'trunk_link']);
const PED = new Set(['pedestrian', 'living_street', 'footway', 'steps', 'path', 'cycleway']);
const roadColor = (w) => CAR.has(w.k) ? '#4a4d53' : PED.has(w.k) ? '#d9d2c5' : '#aaa39a';
const inApron = (x, z, p = 0) => inSeongsu(x, z, p, SEONGSU_APRON);
const distBox = (b, x, z) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));

/** 길(평지) — 같은 재질로 병합. */
function ribbon(buf, pts, w, y, col) {
  if (pts.length < 2) return;
  const rows = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return [[p[0] - dz / L * w / 2, y, p[1] + dx / L * w / 2], [p[0] + dz / L * w / 2, y, p[1] - dx / L * w / 2]];
  });
  for (let i = 1; i < rows.length; i++) buf.quad(rows[i - 1][0], rows[i][0], rows[i][1], rows[i - 1][1], undefined, col);
}
function offset(pts, d) {
  return pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; return [p[0] - dz / L * d, p[1] + dx / L * d]; });
}
function dashed(pts, dash = 3, gap = 5) {
  const out = []; let phase = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    for (let s = 0; s < L;) { const on = phase < dash, n = Math.min(L - s, (on ? dash : dash + gap) - phase); if (on && n > 0.01) out.push([[a[0] + dx * s / L, a[1] + dz * s / L], [a[0] + dx * (s + n) / L, a[1] + dz * (s + n) / L]]); s += n; phase = (phase + n) % (dash + gap); if (n < 0.0001) { phase = 0; s += 0.001; } }
  }
  return out;
}
function areaMesh(buf, ring, y, color) {
  if (ring.length < 3) return;
  const sh = ring.map(([x, z]) => new THREE.Vector2(x, z));
  let ts; try { ts = THREE.ShapeUtils.triangulateShape(sh, []); } catch { return; }
  for (const t of ts) { const [a, b, c] = t.map((k) => ring[k]); const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0; const pts = (up ? [a, b, c] : [a, c, b]).flatMap(([x, z]) => [x, y, z]); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.computeVertexNormals(); const ns = Array.from(g.attributes.normal.array); g.dispose(); buf.raw(pts, [0, 1, 2], ns, null, color); }
}
function area(ring) { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; return Math.abs(a / 2); }

const FAR_HIDE = 1400;
// [seongsu-v2] 한강 다리 북단 이음점: 합수부 2구간(hangangHap)이 그리는 다리 상판의 북쪽 끝 (x,z) 과 그 상판 높이 y (실측: scripts/probe-seam.mjs).
//   성수 쪽 고가(OSM bridge/viaduct)는 여기까지 이어서 내려간다/올라간다. 2구간은 다른 datum(한강 수면 ≈ −43 ~ −6.6)을 써서 높이가 다르다.
const BRIDGE_JOINS = [
  { name: '성수대교', x: -6489.8, z: -18830.6, y: -16.0 },
  { name: '영동대교', x: -4360.4, z: -18454.3, y: -2.4 },
  { name: '청담대교', x: -3741.3, z: -18090.0, y: 1.4 },
];
/** 길 폴리라인 + 점마다 높이 → 상판 띠 (윗면) */
function ribbonY(buf, pts, ys, w, col) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L * w / 2, nz = dx / L * w / 2;
    buf.quad([a[0] + nx, ys[i - 1], a[1] + nz], [b[0] + nx, ys[i], b[1] + nz], [b[0] - nx, ys[i], b[1] - nz], [a[0] - nx, ys[i - 1], a[1] - nz], undefined, col);
  }
}
const HAP_EDGE_Z = -18625, HAP_EDGE_X0 = -6830;
const HAP_EDGE_Y = [-31.2,-31.0,-30.9,-30.7,-30.6,-30.4,-30.2,-30.1,-29.9,-29.8,-29.6,-29.4,-29.3,-29.1,-29.0,-28.8,-28.6,-28.5,-28.3,-28.2,-28.0,-27.9,-27.7,-27.5,-27.4,-27.2,-27.1,-26.9,-26.7,-26.6,-26.4,-26.3,-26.1,-25.9,-25.8,-25.6,-25.5,-25.3,-25.2,-25,-24.8,-24.7,-24.5,-24.4,-24.2,-24.0,-23.9,-23.7,-23.6,-23.4,-23.2,-23.1,-22.9,-22.8,-22.6,-22.5,-22.3,-22.1,-22.0,-21.8,-21.7,-21.5,-21.4,-21.2,-21.0,-20.9,-20.7,-20.6,-20.4,-20.2,-20.1,-19.9,-19.8,-19.6,-13.8,-15.5,-10.7,-9.1,-7.0,-4.8,-2.9,-0.2,2.1,3.9,4.3,4.3,2.4,-0.1,-1.6,-0.8,0,-1.0,-2.2,-3.2,-4.1,-5.5,-6.1,-7.9,-7.8,-5.6,-4.3,-4.4,-3.0,-1.4,-1.0,-1.2,-1.2,-1.0,-0.8,-1.2,-1.1,0.3,0.8,0.8,0.4,0.5,0.5,0.6,0.9,0.4,0.1,0.2,0.5,1.8,2.6,3.0,3.2,3.2,2.7,2.9,4.2,4.8,3.7,2.2,2.6,5.8,9.4,9.6,7.7];
const smooth = (t) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };
/** [seongsu-v3] 병합 메시를 xz 격자 칸(cell m)으로 쪼갠다 (삼각형 무게중심 기준) → 칸마다 frustum culling·거리 숨김. */
function chunkMesh(m, cell) {
  let g = m.geometry; if (g.index) g = g.toNonIndexed();
  const pos = g.attributes.position, n = pos.count / 3, keys = new Int32Array(n), buckets = new Map();
  for (let t = 0; t < n; t++) {
    const cx = (pos.getX(t * 3) + pos.getX(t * 3 + 1) + pos.getX(t * 3 + 2)) / 3, cz = (pos.getZ(t * 3) + pos.getZ(t * 3 + 1) + pos.getZ(t * 3 + 2)) / 3;
    const k = (Math.floor(cx / cell) + 1000) * 4000 + (Math.floor(cz / cell) + 2000); keys[t] = k; buckets.set(k, (buckets.get(k) || 0) + 1);
  }
  if (buckets.size < 2) return [m];
  const names = Object.keys(g.attributes), out = [];
  for (const [k, cnt] of buckets) {
    const ng = new THREE.BufferGeometry();
    for (const nm of names) { const src = g.attributes[nm], sz = src.itemSize, arr = new src.array.constructor(cnt * 3 * sz); let o = 0; for (let t = 0; t < n; t++) { if (keys[t] !== k) continue; arr.set(src.array.subarray(t * 3 * sz, t * 3 * sz + 3 * sz), o); o += 3 * sz; } ng.setAttribute(nm, new THREE.BufferAttribute(arr, sz, src.normalized)); }
    ng.computeBoundingBox(); ng.computeBoundingSphere();
    const c = new THREE.Mesh(ng, m.material); c.name = m.name; c.castShadow = m.castShadow; c.receiveShadow = m.receiveShadow; c.userData = { ...m.userData }; c.matrixAutoUpdate = false; out.push(c);
  }
  if (g !== m.geometry) g.dispose(); m.geometry.dispose();
  return out;
}
export async function createSeongsuAsync({ scene, overlay, terrain, data, mobile = false }, slicer = null) {
  const tick = async (s) => { await slicer?.tick?.(s); };
  const farCache = new WeakMap();
  slicer?.mark?.(); // json·모듈 기다린 시간은 메인 스레드 블록이 아니다
  await tick('ss-start');
  const root = new THREE.Group(); root.name = 'seongsu'; root.visible = false; scene.add(root);
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const B = { ...SEONGSU_BOUNDS }, A = { ...SEONGSU_APRON }, H = { ...SEONGSU_HQ, ...data.hq };
  const local = (x, z) => hqLocal(x, z, H), toWorld = (x, z) => hqWorld(x, z, H);
  const hq = createHQ({ mobile, core: true });
  await tick('ss-hq-built');
  hq.group.position.set(H.x, 0, H.z); hq.group.rotation.y = H.ry; root.add(hq.group);
  const hqSite = (x, z, pad = 0) => { const [lx, lz] = local(x, z); return lx > -35 - pad && lx < 72 + pad && lz > -32 - pad && lz < 25 + pad; };
  const labels = [];
  const addLabel = (text, x, z, up, maxDist, minDist = 8, cls = 'label') => { if (overlay) labels.push(overlay.add({ cls, text, getPos: () => new THREE.Vector3(x, up, z), maxDist, minDist })); };
  addLabel('성수동 · Seongsu-dong', H.x, H.z, 64, 2400, 120, 'label landmark');
  addLabel('HAUS NOWHERE SEOUL · 하우스 노웨어 서울', H.x, H.z, 36, 700, 20, 'label landmark');
  addLabel('🚇 성수역 Seongsu · 2호선', data.station.x, data.station.z, 17, 800, 30, 'label landmark');
  await tick('ss-hq');

  // 평지. 코리더 기본 바닥(y=0)과 깜빡이지 않게 2 cm 위에 놓는다.
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const gb = new GeoBuf({ uv: false, color: true });
  // 서쪽 강변(성수대교) 물 위로 내려가는 상판이 평지(y=0) 아래 가려지지 않게, 북쪽 물가까지만 땅 타일.
  const rawBank = data.bank || [];
  const rawBZ = (x) => { for (let i = 1; i < rawBank.length; i++) { const a = rawBank[i - 1], b = rawBank[i]; if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return A.z1; };
  for (let x = A.x0; x < A.x1; x += 16) { const xx = Math.min(A.x1, x + 16), z0 = Math.min(A.z1, rawBZ(x)), z1 = Math.min(A.z1, rawBZ(xx)); gb.quad([x, 0.02, z0], [xx, 0.02, z1], [xx, 0.02, A.z0], [x, 0.02, A.z0], undefined, hex3('#c7c3b9')); }
  // [seongsu-v3] 성수 땅 남쪽 끝(A.z1, y 0) → 합수부 땅(z −18625, 실측 높이) 사이 28m 틈을 비탈로 메움 (probe-seam-edge.mjs, x −6830부터 25m)
  for (let i = 1; i < HAP_EDGE_Y.length; i++) {
    const xa = HAP_EDGE_X0 + (i - 1) * 25, xb = xa + 25;
    if (rawBZ(xa) < A.z1 - 1 || rawBZ(xb) < A.z1 - 1) continue; // 물(둔치 비탈이 대신)
    const ya = HAP_EDGE_Y[i - 1] - 0.15, yb = HAP_EDGE_Y[i] - 0.15, col = hex3('#9aa58a');
    gb.quad([xa, 0.02, A.z1], [xa, ya, HAP_EDGE_Z + 3], [xb, yb, HAP_EDGE_Z + 3], [xb, 0.02, A.z1], undefined, col);
    gb.quad([xb, 0.02, A.z1], [xb, yb, HAP_EDGE_Z + 3], [xa, ya, HAP_EDGE_Z + 3], [xa, 0.02, A.z1], undefined, col);
  }
  for (const a of data.areas || []) {
    if (a.o.some(([x, z]) => hqSite(x, z, 3))) continue;
    const green = /garden|grass|park|wood|scrub|recreation|pitch/.test(a.k);
    areaMesh(gb, a.o, 0.035, hex3(green ? '#7e9a57' : '#b4b1a8'));
  }
  // [seongsu-v2] 한강 북쪽 물가(OSM relation 152336 outer) 남쪽은 물 — 서쪽(성수대교·서울숲 앞)에서 섬 안으로 들어온다
  const bank = (data.bank || []).filter((p) => p[0] > A.x0 - 80 && p[0] < A.x1 + 80);
  const bankZ = (x) => { for (let i = 1; i < bank.length; i++) { const a = bank[i - 1], b = bank[i]; if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return Infinity; };
  const waterAt = (x, z, pad = 0) => bank.length > 1 && z > bankZ(x) - pad;
  let waterRing = null;
  if (bank.length > 1) {
    const zz = HAP_EDGE_Z + 3, b0 = bank[0], b1 = bank[bank.length - 1]; // [seongsu-v3] 합수부 물(z −18625~)과 이어지게
    waterRing = bank.filter((p) => p[1] < zz).concat([[b1[0], zz], [b0[0], zz]]);
    if (waterRing.length > 3) areaMesh(gb, waterRing, -28, hex3('#5f9aa5'));
    // 둔치 비탈(물가 → 수면, 2구간 수면 높이에 맞춤): 위 풀색 · 아래 돌
    const bk = bank.filter((p) => p[1] < A.z1 + 30);
    for (let i = 1; i < bk.length; i++) { const p0 = bk[i - 1], p1 = bk[i]; const q0 = [p0[0], p0[1] + 30], q1 = [p1[0], p1[1] + 30], m0 = [p0[0], p0[1] + 12], m1 = [p1[0], p1[1] + 12];
      gb.quad([p0[0], 0.02, p0[1]], [m0[0], -9, m0[1]], [m1[0], -9, m1[1]], [p1[0], 0.02, p1[1]], undefined, hex3('#7e9a57'));
      gb.quad([m0[0], -9, m0[1]], [q0[0], -28.2, q0[1]], [q1[0], -28.2, q1[1]], [m1[0], -9, m1[1]], undefined, hex3('#9c978b')); }
  }
  const ground = new THREE.Mesh(gb.build(), mat); ground.name = 'seongsu-ground'; root.add(ground);
  // [seongsu-v3] 서쪽(응봉·금호 쪽 2.3km)·북쪽(600m) 빈 곳: OSM 을 안 받은 곳이라 '먼 시가지' 덩어리로 경계를 정리 (걸을 수 없음, 바닥 + 블록 상자 인스턴스 1 draw)
  const rim = new GeoBuf({ uv: false, color: true }), RIM = [];
  const rimBox = (x0, z0, x1, z1) => { RIM.push([x0, z0, x1, z1]); rim.quad([x0, 0.0, z1], [x1, 0.0, z1], [x1, 0.0, z0], [x0, 0.0, z0], undefined, hex3('#bdb9b0')); };
  const bzW = Math.min(HAP_EDGE_Z - 40, Number.isFinite(bankZ(A.x0 + 1)) ? bankZ(A.x0 + 1) : rawBZ(A.x0 + 1)), XW = A.x0 - 2300;
  rimBox(XW, A.z0 - 600, A.x0, bzW); rimBox(A.x0, A.z0 - 600, A.x1 + 400, A.z0);
  // 서쪽 물가: 성수 둔치와 같은 단면(풀 비탈 → 돌 → 수면 −28)으로 합수부 물까지
  rim.quad([XW, 0.0, bzW], [XW, -9, bzW + 12], [A.x0, -9, bzW + 12], [A.x0, 0.0, bzW], undefined, hex3('#7e9a57'));
  rim.quad([XW, -9, bzW + 12], [XW, -28.2, bzW + 30], [A.x0, -28.2, bzW + 30], [A.x0, -9, bzW + 12], undefined, hex3('#9c978b'));
  rim.quad([XW, -28.3, bzW + 28], [XW, -28.3, -17700], [A.x0, -28.3, -17700], [A.x0, -28.3, bzW + 28], undefined, hex3('#5f9aa5')); // 강 남쪽 끝까지 (합수부 땅이 있으면 그 밑에 숨음)
  { const g = rim.build(); if (g) { const m = new THREE.Mesh(g, mat); m.name = 'seongsu-rim-ground'; root.add(m); } }
  {
    const spots = [], BL = 64;
    for (const [x0, z0, x1, z1] of RIM) for (let x = x0 + 6; x < x1 - BL / 2; x += BL) for (let z = z0 + 6; z < z1 - BL / 2 - (z1 === bzW ? 30 : 0); z += BL) {
      const hsh = hash01(Math.round(x * 7 + z), 31); if (hsh < 0.12) continue; // 공원·빈터 자리
      const n = 1 + (hsh > 0.55) + (hsh > 0.85);
      for (let k = 0; k < n; k++) { const w = 14 + hash01(x + k, z) * 26, d = 14 + hash01(z + k, x) * 24, h = 6 + Math.pow(hash01(x * 3 + k, z * 5), 2.2) * 42; const cx = x + 6 + (k % 2) * (BL - 12 - w) / 1 * 0.9 + w / 2, cz = z + 6 + ((k / 2) | 0) * (BL - 12 - d) * 0.9 + d / 2; spots.push([cx, cz, Math.min(w, BL - 12), Math.min(d, BL - 12), h, hsh]); }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), spots.length); im.name = 'seongsu-rim-blocks';
    const m4 = new THREE.Matrix4(), cc = new THREE.Color(), PAL = ['#e7e1d6', '#d8dee5', '#efe4d3', '#cfd5d8', '#e3d6c6', '#d5d0c8'];
    spots.forEach(([x, z, w, d, h, hh], i) => { m4.makeScale(w, h, d).setPosition(x, 0, z); im.setMatrixAt(i, m4); im.setColorAt(i, cc.set(PAL[(hh * 97 | 0) % PAL.length])); });
    im.computeBoundingBox(); im.computeBoundingSphere(); root.add(im);
  }
  // 길 + 보도 + 중앙선 (OSM 이름·폭·차로). 골목은 회갈색 포장, 큰 길은 짙은 회색.
  const roads = (data.ways || []).filter((w) => w.pts?.length >= 2);
  const roadGrid = new CellGrid(24), rb = new GeoBuf({ uv: false, color: true }), paint = new GeoBuf({ uv: false, color: true });
  const paths = [];
  const named = new Set();
  // [seongsu-v2] 고가차도·다리(OSM bridge/viaduct, layer) = 상판 + 난간 + 교각. 같은 고가끼리 이어진 끝은 높이 유지, 땅 길과 만나는 끝은 경사로.
  const brb = new Builder(), deckTop = new GeoBuf({ uv: false, color: true });
  const brWays = roads.filter((w) => w.br && CAR.has(w.k));
  const endKey = (p) => Math.round(p[0]) + ',' + Math.round(p[1]);
  const brEnds = new Map(); for (const w of brWays) for (const p of [w.pts[0], w.pts[w.pts.length - 1]]) brEnds.set(endKey(p), (brEnds.get(endKey(p)) || 0) + 1);
  const deckH = (w) => (w.ly ? 6 + 2.6 * Math.min(3, w.ly - 1) : 6.5);
  const decks = [];
  // [seongsu-v3] 교각 충돌 (회전 사각형 반폭 hw × hd) — 고가차도·2호선 고가·역 교각
  const pierGrid = new CellGrid(24);
  const pierAdd = (x, z, hw, ry, hd) => { const r = Math.hypot(hw, hd); pierGrid.add({ x, z, hw, hd, c: Math.cos(ry), s: Math.sin(ry) }, x - r, z - r, x + r, z + r); };
  const pierAt = (x, z, pad) => pierGrid.query(x, z).some((p) => { const dx = x - p.x, dz = z - p.z, u = dx * p.c - dz * p.s, v = dx * p.s + dz * p.c; return Math.abs(u) < p.hw + pad && Math.abs(v) < p.hd + pad; });
  for (const w of brWays) {
    // 이음점(한강 다리 북단) 근처면 그 z 에서 자르고 끝 높이 = 이음점 높이
    let pts = w.pts, joinY = null;
    const J = BRIDGE_JOINS.find((j) => pts.some((p) => Math.hypot(p[0] - j.x, p[1] - j.z) < 220));
    if (J) {
      const keep = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p[1] <= J.z) { keep.push(p); continue; }
        const a = pts[i - 1]; if (a && a[1] <= J.z) { const t = (J.z - a[1]) / (p[1] - a[1]); keep.push([a[0] + (p[0] - a[0]) * t, J.z]); }
        const n = pts[i + 1]; if (n && n[1] <= J.z) { const t = (J.z - p[1]) / (n[1] - p[1]); keep.push([p[0] + (n[0] - p[0]) * t, J.z]); }
      }
      pts = keep; joinY = J.y;
    } else if (pts.every((p) => p[1] > A.z1)) continue;
    if (pts.length < 2) continue;
    const H = deckH(w), cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1], ramp = Math.min(70, L * 0.45);
    const r0 = (brEnds.get(endKey(pts[0])) || 0) < 2, r1 = (brEnds.get(endKey(pts[pts.length - 1])) || 0) < 2;
    const ys = pts.map((p, i) => {
      let y = H;
      if (r0) y = Math.min(y, H * smooth(cum[i] / ramp));
      if (r1) y = Math.min(y, H * smooth((L - cum[i]) / ramp));
      if (joinY != null && J && p[1] > Math.min(A.z1 - 120, J.z - 320)) { const t = smooth((p[1] - Math.min(A.z1 - 120, J.z - 320)) / Math.max(1, J.z - Math.min(A.z1 - 120, J.z - 320))); y = H + (joinY - H) * t; }
      return Math.max(joinY != null ? joinY : 0.2, y) + 0.1;
    });
    decks.push({ w, pts, ys, cum });
  }
  // 이음점까지 OSM 길이 안 닿는 다리(영동대교: 북단고가차도 끝 ~ 2구간 상판 끝 사이 빈 칸) → 가장 가까운 큰 길 끝에서 이음 상판
  for (const J of BRIDGE_JOINS) {
    let best = null; // 고가 상판 끝 중 이음점에 가장 가까운 것 (같은 다리 접속 고가)
    for (const dk of decks) for (const k of [0, dk.pts.length - 1]) { const p = dk.pts[k], d = Math.hypot(p[0] - J.x, p[1] - J.z); if (p[1] < J.z - 3 && d < 320 && (!best || d < best.d)) best = { d, p, w: dk.w, y0: dk.ys[k] }; }
    let ground = false;
    if (!best) { // [seongsu-v3] 청담대교: 성수 쪽 고가 끝이 멀다(560m) → 가장 가까운 큰 땅 길 끝에서 고가 진입로를 새로 (합수부 강변북로 위로 넘어감)
      for (const w of roads) { if (!CAR.has(w.k) || w.br || w.w < 9) continue; for (const k of [0, w.pts.length - 1]) { const p = w.pts[k], d = Math.hypot(p[0] - J.x, p[1] - J.z); if (p[1] < A.z1 + 2 && d < 800 && (!best || d < best.d)) best = { d, p, w, y0: 0.1 }; } }
      ground = true;
    }
    if (!best || best.d < 6) continue;
    const y0 = best.y0;
    const n = Math.max(2, Math.ceil(best.d / 10)), pts = [], ys = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, s2 = t * best.d; pts.push([best.p[0] + (J.x - best.p[0]) * t, best.p[1] + (J.z - best.p[1]) * t]);
      // 땅에서 시작하면 80m 안에 7.5m 로 올라 강변북로를 넘고, 마지막 140m 에서 다리 상판 높이로 내려간다
      const y = ground ? Math.min(0.1 + 7.4 * smooth(s2 / 80), 7.5 + (J.y - 7.5) * smooth((s2 - (best.d - 140)) / 140)) : y0 + (J.y - y0) * smooth(t);
      ys.push(y + (i === n ? 0.1 : 0));
    }
    const cum = pts.map((p, i) => i * best.d / n);
    decks.push({ w: { ...best.w, id: ground ? 'join-' + J.name : best.w.id, w: Math.max(best.w.w, 16) }, pts, ys, cum, join: J.name, ground });
  }
  for (const { w, pts, ys, cum, join } of decks) {
    const col = hex3(roadColor(w));
    ribbonY(deckTop, pts, ys, w.w + 1.2, col);
    if (join) { // [seongsu-v3] 이음 상판: 가운데 노란 겹선 + 흰 차선 점선 → 멀리서도 길로 읽힘
      for (const o of [-0.25, 0.25]) ribbonY(deckTop, offset(pts, o), ys.map((y) => y + 0.04), 0.18, hex3('#edc357'));
      for (const o of [-w.w / 4, w.w / 4]) { const op = offset(pts, o); for (let i = 1; i < op.length; i++) if (i % 2) ribbonY(deckTop, [op[i - 1], op[i]], [ys[i - 1] + 0.04, ys[i] + 0.04], 0.16, hex3('#f1f1ed')); }
    }
    for (const sg of [-1, 1]) {
      const side = offset(pts, sg * (w.w / 2 + 0.45));
      for (let i = 1; i < side.length; i++) { const a = side[i - 1], b = side[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.2) continue; const yy = (ys[i - 1] + ys[i]) / 2; brb.box('paint', 0.3, 1.0 + Math.max(0, Math.min(1.4, yy)) , L + 0.05, { x: (a[0] + b[0]) / 2, y: yy - 0.3, z: (a[1] + b[1]) / 2, ry: Math.atan2(b[0] - a[0], b[1] - a[1]), rx: -Math.atan2(ys[i] - ys[i - 1], L), color: '#c9cac4' }); }
    }
    for (let i = 1; i < pts.length; i++) { // 상판 두께(아래 그림자색) — 높이 2.5m 넘는 곳만
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), yy = (ys[i - 1] + ys[i]) / 2; if (L < 0.2 || yy < 2.5) continue;
      brb.box('paint', w.w + 1.0, 1.4, L + 0.05, { x: (a[0] + b[0]) / 2, y: yy - 0.8, z: (a[1] + b[1]) / 2, ry: Math.atan2(b[0] - a[0], b[1] - a[1]), rx: -Math.atan2(ys[i] - ys[i - 1], L), color: '#8d8f8a' });
    }
    for (let s2 = 15; s2 < cum[cum.length - 1]; s2 += 30) { // 교각 (물 위는 물 밑까지)
      let i = 1; while (i < cum.length - 1 && cum[i] < s2) i++;
      const t = (s2 - cum[i - 1]) / Math.max(0.01, cum[i] - cum[i - 1]), x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, y = ys[i - 1] + (ys[i] - ys[i - 1]) * t;
      if (y < 3.2) continue;
      const g0 = y < 0 ? y - 8 : 0, ry = Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      brb.box('paint', Math.min(w.w * 0.5, 7), y - 1.5 - g0, 1.6, { x, y: g0 + (y - 1.5 - g0) / 2, z, ry, color: '#a9aaa3' });
      if (g0 === 0) pierAdd(x, z, Math.min(w.w * 0.25, 3.5), ry, 0.8);
    }
    if (w.n && !named.has(w.n) && /대교|고가/.test(w.n + (decks.find((d) => d.w === w)?.join || ''))) { const p = pts[Math.floor(pts.length / 2)]; addLabel(w.n, p[0], p[1], ys[Math.floor(pts.length / 2)] + 6, 900, 30); named.add(w.n); }
    await tick('ss-decks');
  }
  { const g = deckTop.build(); if (g) { const m = new THREE.Mesh(g, mat); m.name = 'seongsu-bridge-decks'; root.add(m); } }
  for (const J of BRIDGE_JOINS) if (!named.has(J.name)) { addLabel('🌉 ' + J.name, J.x, J.z, J.y + 9, 1600, 40, 'label landmark'); named.add(J.name); }
  const brSet = new Set(decks.map((d) => d.w.id));
  for (const w of roads.slice().sort((a, b) => b.w - a.w)) {
    if (brSet.has(w.id)) continue;
    const car = CAR.has(w.k), y = car ? 0.055 : PED.has(w.k) ? 0.085 : 0.07;
    // 사옥 부지 안의 OSM 서비스 길은 사옥이 대신. 길이 부지 안에서 시작하거나 끝나면 한 조각씩 거른다.
    const pieces = []; let cur = [];
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], b = w.pts[i], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (hqSite(mx, mz, 0) || mz > A.z1 + 4 || waterAt(mx, mz, -2)) { if (cur.length > 1) pieces.push(cur); cur = []; continue; } // 2구간(합수부)·물 위 길은 그리지 않는다
      if (!cur.length) cur.push(a); cur.push(b);
      const r = w.w / 2; roadGrid.add({ a, b, r, w }, Math.min(a[0], b[0]) - r - 4, Math.min(a[1], b[1]) - r - 4, Math.max(a[0], b[0]) + r + 4, Math.max(a[1], b[1]) + r + 4);
    }
    if (cur.length > 1) pieces.push(cur);
    for (const pts of pieces) {
      // 보도(큰 길은 양쪽 3m), 차도 위에 겹쳐 깐다
      if (car) ribbon(rb, pts, w.w + 6, 0.04, hex3('#d0ccc3'));
      ribbon(rb, pts, w.w, y, hex3(roadColor(w)));
      if (car && w.w >= 9 && !w.ow) for (const s of [-0.18, 0.18]) ribbon(paint, offset(pts, s), 0.13, y + 0.007, hex3('#edc357'));
      if (car && (w.ow || w.w >= 12)) for (const seg of dashed(offset(pts, w.ow ? 0 : w.w * 0.25))) ribbon(paint, seg, 0.13, y + 0.009, hex3('#f1f1ed'));
      if (car) for (const sg of [-1, 1]) { const side = offset(pts, sg * (w.w / 2 + 1.6)); paths.push(withCum({ pts: side, w: 1.6, weight: 3, y: 0.055 })); }
      else if (pts.length > 1 && !['steps', 'cycleway'].includes(w.k)) paths.push(withCum({ pts, w: Math.min(3, w.w - 1), weight: w.n === '연무장길' ? 6 : 2, y: 0.07 }));
    }
    if (w.n && !named.has(w.n) && ['연무장길', '뚝섬로', '성수이로', '아차산로'].includes(w.n)) { const p = w.pts[Math.floor(w.pts.length / 2)]; addLabel(w.n + (w.ne ? ' · ' + w.ne : ''), p[0], p[1], 7, 350, 20); named.add(w.n); }
    await tick('ss-roads');
  }
  for (const [buf, name] of [[rb, 'seongsu-roads'], [paint, 'seongsu-road-paint']]) { const g = buf.build(); if (g) { const m = new THREE.Mesh(g, mat); m.name = name; root.add(m); } }
  const roadAt = (x, z, pad = 0) => roadGrid.query(x, z).find((s) => distToSeg(x, z, s.a[0], s.a[1], s.b[0], s.b[1]) <= s.r + pad)?.w || null;

  // [seongsu-elevated] 역 틀 (건물 거르기에도 씀: OSM 역 건물 윤곽은 고가역 모델이 대신)
  const st = data.station;
  let sr = 0, sd = Infinity;
  for (const r of data.rail || []) for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], c = r.pts[i], d = distToSeg(st.x, st.z, a[0], a[1], c[0], c[1]); if (d < sd) { sd = d; sr = Math.atan2(c[0] - a[0], c[1] - a[1]); } }
  const SN = Math.sin(sr), CS = Math.cos(sr);
  const SL = 200, SW = 13.6; // 승강장 길이(10량 = 200m) · 반폭
  const sAt = (a, v) => ({ x: st.x + SN * a + CS * v, z: st.z + CS * a - SN * v });
  const sLoc = (x, z) => { const dx = x - st.x, dz = z - st.z; return { a: dx * SN + dz * CS, v: dx * CS - dz * SN }; };
  const inStationBox = (x, z, pad = 0) => { const q = sLoc(x, z); return Math.abs(q.a) < SL / 2 + 6 + pad && Math.abs(q.v) < SW + 2 + pad; };
  // 실제 OSM 필지. 높이가 없으면 낮은 공장·상가(2~5층); 큰 아파트는 OSM 층수 우선.
  // [seongsu-v2] 넓어진 섬: 450m 칸마다 병합 메시 하나씩 (칸 단위 frustum culling)
  const BNX = Math.max(1, Math.round((A.x1 - A.x0) / 450)), BNZ = Math.max(1, Math.round((A.z1 - A.z0) / 450));
  const bldGrid = new CellGrid(24), blds = [], buckets = Array.from({ length: BNX * BNZ }, () => []);
  for (const b of data.buildings || []) {
    if (!b.o || b.o.length < 3 || b.part || b.k === 'roof') continue;
    const cx = b.o.reduce((s, p) => s + p[0], 0) / b.o.length, cz = b.o.reduce((s, p) => s + p[1], 0) / b.o.length;
    if (!inApron(cx, cz) || hqSite(cx, cz, 2) || inStationBox(cx, cz) || b.o.some(([x, z]) => inStationBox(x, z, -1.5)) || b.o.some(([x, z]) => { const [lx, lz] = local(x, z); return Math.abs(lx) < 22 && Math.abs(lz) < 18; })) continue;
    const ht = b.h || (b.lv ? b.lv * 3.2 + 0.6 : (b.k === 'industrial' || b.k === 'warehouse') ? 7 + hash01(b.id, 9) * 3 : 6 + Math.floor(hash01(b.id, 7) * 4) * 3.2);
    const top = Math.max(4, Math.min(120, ht)), base = b.mh || 0.02;
    const xs = b.o.map((p) => p[0]), zs = b.o.map((p) => p[1]), bb = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    const rec = { ...b, cx, cz, ht: top, bb, base };
    blds.push(rec); if (base < 2.5) bldGrid.add(rec, ...bb);
    const ix = Math.min(BNX - 1, Math.max(0, Math.floor((cx - A.x0) / (A.x1 - A.x0) * BNX))), iz = Math.min(BNZ - 1, Math.max(0, Math.floor((cz - A.z0) / (A.z1 - A.z0) * BNZ)));
    if (waterAt(cx, cz)) continue;
    buckets[ix + iz * BNX].push({ o: b.o, h: top, mh: base, tint: b.tint, k: b.k || (hash01(b.id, 3) < 0.6 ? 'commercial' : 'industrial') });
  }
  // [seongsu-v3] 거리 소품·간판·외벽·다리 난간 칸 (300m): 카메라에서 멀면 이 프레임만 숨김 (big = 역·다리처럼 멀리서도 보이는 것)
  const DET_CELL = 300, detailFar = [];
  const addDetail = (m, big = false) => { root.add(m); m.updateMatrix(); if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); detailFar.push({ o: m, b: m.geometry.boundingBox.clone(), big }); };
  const ownFar = []; // [seongsu-v2] 내 건물 칸: 땅 위 시점에서 멀면(폰 700m/PC 1000m) 이 프레임만 숨김 → tris
  for (let i = 0; i < buckets.length; i++) {
    if (!buckets[i].length) continue;
    const meshes = await buildingMeshesAsync(buckets[i], 433 + i * 13, slicer);
    for (const m of meshes) { m.name = 'seongsu-buildings-' + i; root.add(m); ownFar.push({ o: m, b: new THREE.Box3().setFromObject(m) }); }
    await tick('ss-buildings');
  }
  const bldAt = (x, z, pad = 0.35) => {
    for (const b of bldGrid.query(x, z)) {
      if (x < b.bb[0] - pad || x > b.bb[2] + pad || z < b.bb[1] - pad || z > b.bb[3] + pad) continue;
      if (pointInRing(x, z, b.o)) return b;
      for (let i = 0; i < b.o.length; i++) { const a = b.o[i], c = b.o[(i + 1) % b.o.length]; if (distToSeg(x, z, a[0], a[1], c[0], c[1]) < pad) return b; }
    }
    return null;
  };

  // 상점 전면: 가장 가까운 길을 향하는 벽에만(이웃 건물과 맞댄 벽엔 안 붙인다). 간판은 fictional Korean names 아틀라스(프리뷰와 같은 것).
  const sb = new Builder(), props = new Builder();
  // [seongsu-v3] 추정 건물은 낮고 다양한 지붕(평지붕·박공·한쪽 경사·옥탑) + 비대칭 발코니/파라펫. OSM 건물 윤곽은 그대로 둠
  for (const b of blds) {
    if (!b.f || !b.wh) continue;
    const w = b.wh[0], d = b.wh[1], ry = b.ang || 0, c = Math.cos(ry), sn = Math.sin(ry);
    const at = (u, v, y) => [b.cx + c * u + sn * v, y, b.cz - sn * u + c * v];
    const roofCol = ['#697c7c', '#797775', '#a27764', '#6c7d8b'][b.id % 4], h = 0.9 + hash01(b.id, 23) * 1.3;
    if (b.rf === 'gable' || b.rf === 'shed') {
      const geo = new GeoBuf({ uv: false, color: true }), co = hex3(roofCol), half = b.rf === 'gable';
      const l0 = at(-w / 2 - 0.2, -d / 2 - 0.2, b.ht), l1 = at(-w / 2 - 0.2, d / 2 + 0.2, b.ht), r0 = at(w / 2 + 0.2, -d / 2 - 0.2, b.ht), r1 = at(w / 2 + 0.2, d / 2 + 0.2, b.ht);
      const m0 = at(half ? 0 : w / 2 + 0.2, -d / 2 - 0.2, b.ht + h), m1 = at(half ? 0 : w / 2 + 0.2, d / 2 + 0.2, b.ht + h);
      geo.quad(l1, m1, m0, l0, undefined, co); geo.quad(m1, r1, r0, m0, undefined, co); geo.quad(l0, m0, m1, l1, undefined, co); geo.quad(m0, r0, r1, m1, undefined, co); // 양면(감기 방향 무관)
      if (!half) { geo.quad(r0, m0, m1, r1, undefined, co); geo.quad(r1, m1, m0, r0, undefined, co); }
      const g = geo.build(); props.add('paint', g); g.dispose();
    } else if (b.o.length === 4) {
      for (const sg of [-1, 1]) { const p = at(sg * (w / 2 - 0.15), 0, b.ht + 0.22); props.box('paint', 0.2, 0.45, d, { x: p[0], y: p[1], z: p[2], ry, color: roofCol }); }
      const p = at(-w * 0.21, d * 0.18, b.ht + h / 2); props.box('paint', w * 0.35, h, d * 0.28, { x: p[0], y: p[1], z: p[2], ry, color: b.tint });
    }
    await tick('ss-fill-roofs');
  }

  // [seongsu-v3] OSM cafe/convenience/bakery 점에 대응하는 건물의 실제 길 면에 상점. 길·역 출입구 막는 가짜 상자 없음.
  //   OSM엔 상호가 없어서 간판은 유형명(성수커피·동네편의점 등), 브랜드/실제 상호를 꾸며내지 않음.
  const shopKinds = { cafe: ['성수커피', 'SEONGSU COFFEE', '#385c50'], coffee: ['커피 · 로스터리', 'COFFEE / TAKE OUT', '#755141'], convenience: ['동네편의점', '24  CONVENIENCE', '#296b69'], bakery: ['성수 베이커리', 'BREAD & COFFEE', '#9c6244'], fast_food: ['분식 · 김밥', 'GIMBAP / SNACKS', '#ba6843'] };
  const heroShops = [], hb = new Builder();
  for (const p of data.shops || []) {
    const kind = shopKinds[p[2]]; if (!kind || Math.hypot(p[0] - st.x, p[1] - st.z) > 300) continue;
    let best = null;
    for (const b of blds) {
      if (b.base > 1 || Math.hypot(b.cx - p[0], b.cz - p[1]) > 45) continue;
      for (let i = 0; i < b.o.length; i++) {
        const a = b.o[i], c = b.o[(i + 1) % b.o.length], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz); if (L < 5 || L > 70) continue;
        const x = (a[0] + c[0]) / 2, z = (a[1] + c[1]) / 2; let nx = dz / L, nz = -dx / L;
        if ((x - b.cx) * nx + (z - b.cz) * nz < 0) { nx = -nx; nz = -nz; }
        if (bldAt(x + nx * 0.6, z + nz * 0.6, 0.1)) continue;
        let roadD = Infinity; for (const r of roadGrid.query(x + nx * 6, z + nz * 6)) roadD = Math.min(roadD, distToSeg(x, z, r.a[0], r.a[1], r.b[0], r.b[1]) - r.r);
        if (roadD < -1 || roadD > 12) continue;
        const dd = Math.hypot(x - p[0], z - p[1]) + roadD * 0.2;
        if (!best || dd < best.dd) best = { x, z, nx, nz, L, dd, ry: Math.atan2(nx, nz) };
      }
    }
    if (!best || heroShops.some((h) => Math.hypot(h.x - best.x, h.z - best.z) < 7)) continue;
    const e = { ...best, kind, type: p[2] }; heroShops.push(e);
    const w = Math.min(8, e.L - 0.4), side = (u, v, y) => ({ x: e.x + e.nz * u + e.nx * v, z: e.z - e.nx * u + e.nz * v, y, ry: e.ry });
    hb.box('paint', w, 3.2, 0.18, { ...side(0, 0.08, 1.6), color: kind[2] });
    hb.box('paint', w - 0.35, 2.2, 0.12, { ...side(0, 0.22, 1.4), color: '#7499a7' });
    // 유리문·손잡이·알루미늄 멀리온 + 위 캐노피 + 옆 메뉴판
    for (let k = -1; k <= 1; k++) hb.box('frame', 0.07, 2.3, 0.08, { ...side(k * (w - 0.4) / 3, 0.31, 1.4), color: '#d2d5d4' });
    hb.box('metal', 0.04, 0.6, 0.04, { ...side(-0.23, 0.38, 1.3), color: '#d6d9d9' });
    hb.box('paint', w + 0.2, 0.14, 1.0, { ...side(0, 0.6, 2.5), rx: 0.09, color: kind[2] }); // [seongsu-v4] 차양은 간판(2.6~3.5) 아래
    hb.box('paint', 0.6, 1.1, 0.1, { ...side(w / 2 - 0.5, 0.33, 1.3), color: '#eee8da' });
    for (let k = 0; k < 5; k++) hb.box('paint', 0.4, 0.025, 0.02, { ...side(w / 2 - 0.5, 0.4, 1.55 - k * 0.12), color: kind[2] });
    if (/cafe|coffee|bakery/.test(p[2])) { // 쇼윈도 안 바·커피 머신·둥근 빵/컵: 들어갈 수는 없는 얕은 상점 전면
      hb.box('paint', w * 0.35, 0.17, 0.35, { ...side(-w * 0.25, 0.32, 0.8), color: '#ab7d52' });
      for (let k = 0; k < 4; k++) hb.cyl('paint', 0.08, 0.06, 0.15, { ...side(-w * 0.36 + k * 0.3, 0.4, 0.98), color: '#f1ede2' }, 6);
    } else { // 편의점 냉장고·상품 진열 띠
      for (let k = 0; k < 3; k++) hb.box('paint', w * 0.32, 0.1, 0.07, { ...side(-w * 0.27, 0.35, 0.7 + k * 0.4), color: ['#d0ad57', '#8ea79a', '#d78568'][k] });
    }
    if (heroShops.length >= 18) break;
  }
  if (heroShops.length) {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = heroShops.length * 128; const ctx = cv.getContext('2d');
    heroShops.forEach((s, i) => { ctx.fillStyle = s.kind[2]; ctx.fillRect(0, i * 128, 1024, 128); ctx.fillStyle = '#fffdf3'; ctx.textAlign = 'center'; ctx.font = '700 56px "Noto Sans KR", sans-serif'; ctx.fillText(s.kind[0], 512, i * 128 + 61); ctx.font = '500 28px sans-serif'; ctx.fillText(s.kind[1], 512, i * 128 + 104); });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); hq.mats.stationShops = sm;
    heroShops.forEach((s, i) => { const g = new THREE.PlaneGeometry(Math.min(8, s.L - 0.4), 0.9), uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / heroShops.length); hb.add('stationShops', g, { x: s.x + s.nx * 0.36, y: 3.05, z: s.z + s.nz * 0.36, ry: s.ry }); g.dispose(); });
    for (const m0 of hb.build(hq.mats)) { m0.name = 'seongsu-real-shops-' + m0.userData.key; for (const m of chunkMesh(m0, DET_CELL)) addDetail(m); }
    // 가까이서 실제 유형명 확인하는 간판 (최대 110m에서만)
    for (const s of heroShops) addLabel(s.kind[0], s.x, s.z, 4, 35, 8); // 간판에 이미 글씨 → 가까이서만
  }
  const OLD_SIGN = q.get('ssSignV3') === '1'; // 비교 샷용: v3 간판 자리(높고 벽에 붙음)
  let signN = 0; const signSpots2 = []; // [seongsu-v4] 간판 자리 (거리 샷용)
  for (const b of blds) {
    if (b.ht > 40 || b.base > 1 || area(b.o) < 30) continue;
    let edge = null, best = 40;
    for (let i = 0; i < b.o.length; i++) {
      const a = b.o[i], c = b.o[(i + 1) % b.o.length], x = (a[0] + c[0]) / 2, z = (a[1] + c[1]) / 2, L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 3 || L > 100) continue;
      let nx = (c[1] - a[1]) / L, nz = -(c[0] - a[0]) / L;
      if ((x - b.cx) * nx + (z - b.cz) * nz < 0) { nx *= -1; nz *= -1; }
      if (bldAt(x + nx * 1.0, z + nz * 1.0, 0.1)) continue;
      for (const r of roadGrid.query(x + nx * 6, z + nz * 6)) { const d = distToSeg(x, z, r.a[0], r.a[1], r.b[0], r.b[1]) - r.r; if (d < best && d > -2) { edge = { x, z, L, nx, nz }; best = d; } }
    }
    if (!edge || best > 10 || heroShops.some((h) => Math.hypot(h.x - edge.x, h.z - edge.z) < 6)) continue;
    // [seongsu-v4] 간판: 1층 문·쇼윈도 위(2.5~3.3 m) 띠에, 외벽 판(0.11)·2층 창 띠(0.15)·층 턱(0.25) 보다 앞(0.34)에 + 뒤판(테두리).
    //   예전엔 3.4 m 높이·벽에서 7 cm 라 외벽 판·창 띠가 간판 윗부분을 덮었다.
    const e = edge, n = signN++ % 16, w = Math.min(e.L * 0.68, OLD_SIGN ? 7.0 : 4.0), h = w / 4, ry = Math.atan2(e.nx, e.nz), SY = OLD_SIGN ? 3.4 : 2.96, SO = OLD_SIGN ? 0.07 : 0.34;
    const quad = (key, qw, qh, off, qy, color, along = 0) => { const pg = new THREE.PlaneGeometry(qw, qh); sb.add(key, pg, { x: e.x + e.nx * off + e.nz * along, y: qy, z: e.z + e.nz * off - e.nx * along, ry, color }); pg.dispose(); };
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, ((n % 4) + uv.getX(k)) / 4, 1 - (((n / 4) | 0) + 1 - uv.getY(k)) / 4);
    sb.add('signs', g, { x: e.x + e.nx * SO, y: SY, z: e.z + e.nz * SO, ry }); g.dispose();
    if (signSpots2.length < 40 && Math.hypot(e.x - st.x, e.z - st.z) < 250) signSpots2.push([Math.round(e.x), Math.round(e.z), '', +e.nx.toFixed(3), +e.nz.toFixed(3)]);
    // 뒤판·쇼윈도·문살은 평면(2 tri)으로 — 상자(12 tri)면 2.9천 개 간판에서 삼각형 예산(1M)을 넘는다
    if (!OLD_SIGN) quad('paint', w + 0.16, h + 0.12, SO - 0.03, SY, '#2b2f33');
    // 큰 쇼윈도(형상 단순, 빛은 재질) + 차양 (간판 아래)
    const WW = Math.min(4.0, e.L * 0.6);
    quad(OLD_SIGN ? 'frame' : 'paint', WW, 2.0, 0.05, 1.25, OLD_SIGN ? '#1e292c' : '#4f6872'); // 쇼윈도 유리(검은 판 → 푸른 회색)
    if (!OLD_SIGN) for (const u of [-0.5, 0, 0.5]) quad('paint', 0.07, 2.0, 0.08, 1.25, '#c9cdcf', u * WW);
    if (hash01(b.id, 4) < 0.65) sb.box('paint', w + 0.2, 0.10, 0.9, { x: e.x + e.nx * 0.5, y: OLD_SIGN ? 2.7 : 2.36, z: e.z + e.nz * 0.5, ry, rx: 0.1, color: ['#273a31', '#f2e9d7', '#684a3d', '#303541'][b.id % 4] });
    if (hash01(b.id, 6) < 0.45) { props.cyl('metal', 0.75, 0.75, 1.3, { x: b.cx, y: b.ht + 0.65, z: b.cz, color: '#b7c1c6' }, 8); props.box('paint', 1, 0.7, 0.6, { x: b.cx + 1.4, y: b.ht + 0.35, z: b.cz, color: '#d7d5cd' }); }
    await tick('ss-signs');
  }
  for (const m0 of sb.build(hq.mats)) { m0.name = 'seongsu-shopfronts-' + m0.userData.key; for (const m of chunkMesh(m0, DET_CELL)) addDetail(m); }

  // 가로수·가로등 (큰 길 양쪽, 28m마다). 고가 아래에도 서는 얇은 가로수(명동과 같은 단순 다면체).
  const treeSpots = [];
  for (const w of roads) {
    if (!CAR.has(w.k)) continue;
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], c = w.pts[i], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 18) continue;
      const nx = -dz / L, nz = dx / L;
      for (let s = 12; s < L - 3; s += 28) for (const sg of [-1, 1]) {
        const x = a[0] + dx * s / L + nx * sg * (w.w / 2 + 2.2), z = a[1] + dz * s / L + nz * sg * (w.w / 2 + 2.2);
        if (!inApron(x, z, -4) || hqSite(x, z, 2) || bldAt(x, z, 1.1) || roadAt(x, z, -0.2) || waterAt(x, z, 4)) continue;
        if (treeSpots.some((p) => Math.hypot(p[0] - x, p[1] - z) < 12)) continue;
        treeSpots.push([x, z]); props.cyl('paint', 0.09, 0.15, 3.1, { x, y: 1.55, z, color: '#6e5943' }, 5); props.add('leaf', new THREE.IcosahedronGeometry(1.55, 0), { x, y: 4.0, z, sy: 1.2, color: ['#77934a', '#97a548', '#6f8b48'][treeSpots.length % 3] });
        if (treeSpots.length % 2 === 0) { const lx = x + nx * 0.6, lz = z + nz * 0.6; props.cyl('metal', 0.065, 0.09, 7.2, { x: lx, y: 3.6, z: lz }, 6); props.box('lamp', 0.8, 0.12, 0.25, { x: lx, y: 7.15, z: lz, ry: Math.atan2(dx, dz), color: '#f5e2b2' }); }
      }
    }
  }
  // [seongsu-v2] 역 주변·길가 디테일 (모두 props/zb 에 병합 → draw 거의 그대로)
  const stX = data.station.x, stZ = data.station.z;
  const nearSt = (x, z, r) => Math.hypot(x - stX, z - stZ) < r;
  const nearHot = (x, z, r) => nearSt(x, z, r) || Math.hypot(x - H.x, z - H.z) < r;
  const zb = new GeoBuf({ uv: false, color: true }), WHITE = hex3('#f4f3ee');
  const roadDir = (x, z) => { let best = null; for (const r of roadGrid.query(x, z)) { if (!CAR.has(r.w.k)) continue; const d = distToSeg(x, z, r.a[0], r.a[1], r.b[0], r.b[1]); if (!best || d < best.d) best = { d, r }; } if (!best) return null; const { a, b } = best.r, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return { ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L, w: best.r.w.w, d: best.d }; };
  const zebras = [];
  const zebra = (x, z, ux, uz, w, sig) => {
    if (zebras.some((q) => Math.hypot(q[0] - x, q[1] - z) < 7)) return; zebras.push([x, z]);
    const nx = -uz, nz = ux, y = 0.078;
    for (let s2 = -w / 2 + 0.6; s2 < w / 2 - 0.3; s2 += 1.0) { const cx = x + nx * s2, cz = z + nz * s2, ax = ux * 1.5, az = uz * 1.5, bx = nx * 0.25, bz = nz * 0.25; zb.quad([cx - ax - bx, y, cz - az - bz], [cx - ax + bx, y, cz - az + bz], [cx + ax + bx, y, cz + az + bz], [cx + ax - bx, y, cz + az - bz], undefined, WHITE); }
    if (sig) for (const sg of [-1, 1]) { const px = x + nx * sg * (w / 2 + 1.2) + ux * 2.2 * sg, pz = z + nz * sg * (w / 2 + 1.2) + uz * 2.2 * sg; props.cyl('metal', 0.07, 0.09, 4.2, { x: px, y: 2.1, z: pz, color: '#5d6166' }, 6); props.box('paint', 0.36, 1.0, 0.3, { x: px, y: 3.7, z: pz, ry: Math.atan2(ux, uz), color: '#2a2c2e' }); props.box('lamp', 0.24, 0.24, 0.06, { x: px + ux * 0.16 * -sg, y: 3.45, z: pz + uz * 0.16 * -sg, ry: Math.atan2(ux, uz), color: '#3fd26a' }); }
  };
  for (const f of data.furn || []) if (f[2] === 'x') { const r = roadDir(f[0], f[1]); if (r && r.d < 3 && !waterAt(f[0], f[1])) zebra(f[0], f[1], r.ux, r.uz, r.w, nearHot(f[0], f[1], 420)); }
  { // 역·사옥 450m 안 큰길 교차로: 팔마다 횡단보도 + 신호등
    const at = new Map();
    for (const w of roads) { if (!CAR.has(w.k) || w.w < 7 || brSet.has(w.id)) continue; w.pts.forEach((p, i) => { if (!nearHot(p[0], p[1], 450)) return; const k = endKey(p); if (!at.has(k)) at.set(k, []); at.get(k).push({ w, i }); }); }
    for (const list of at.values()) {
      if (new Set(list.map((q) => q.w.id)).size < 2) continue;
      for (const { w, i } of list) {
        const others = Math.max(...list.filter((q) => q.w !== w).map((q) => q.w.w)), p = w.pts[i];
        for (const j of [i - 1, i + 1]) { const n = w.pts[j]; if (!n) continue; const L = Math.hypot(n[0] - p[0], n[1] - p[1]), d = others / 2 + 2.6; if (L < d + 3) continue; const ux = (n[0] - p[0]) / L, uz = (n[1] - p[1]) / L; zebra(p[0] + ux * d, p[1] + uz * d, ux, uz, w.w, true); }
      }
    }
  }
  // 버스정류장 (OSM bus_stop) · 따릉이 (bicycle_rental)
  for (const f of data.furn || []) {
    if (f[2] !== 'bus' && f[2] !== 'bike') continue;
    const r = roadDir(f[0], f[1]); if (!r || waterAt(f[0], f[1]) || bldAt(f[0], f[1], 1.5)) continue;
    const ry = Math.atan2(r.ux, r.uz), ox = -r.uz, oz = r.ux;
    if (f[2] === 'bus') {
      props.box('paint', 0.12, 2.4, 4.2, { x: f[0] + ox * 0.9, y: 1.2, z: f[1] + oz * 0.9, ry, color: '#a8c6d4' });
      props.box('paint', 1.9, 0.12, 4.6, { x: f[0], y: 2.5, z: f[1], ry, color: '#2f5f8a' });
      for (const sg of [-1.9, 1.9]) props.box('metal', 0.1, 2.5, 0.1, { x: f[0] + ox * 0.85 + r.ux * sg, y: 1.25, z: f[1] + oz * 0.85 + r.uz * sg, ry, color: '#3d434b' });
      props.box('paint', 0.45, 0.45, 3.2, { x: f[0] + ox * 0.55, y: 0.45, z: f[1] + oz * 0.55, ry, color: '#8a6e52' });
      props.box('lamp', 0.06, 0.9, 0.7, { x: f[0] + ox * 0.82 + r.ux * 1.4, y: 1.6, z: f[1] + oz * 0.82 + r.uz * 1.4, ry, color: '#dfeef6' });
    } else {
      props.box('paint', 0.5, 0.12, 6.2, { x: f[0], y: 0.06, z: f[1], ry, color: '#3c8b4f' });
      for (let k = -2; k <= 2; k++) { const bx = f[0] + r.ux * k * 1.2, bz = f[1] + r.uz * k * 1.2; props.box('paint', 1.6, 0.85, 0.08, { x: bx, y: 0.55, z: bz, ry: ry + Math.PI / 2, color: k % 2 ? '#4f9d5d' : '#5aa867' }); }
      props.box('paint', 0.3, 1.4, 0.3, { x: f[0] + r.ux * 3.6, y: 0.7, z: f[1] + r.uz * 3.6, ry, color: '#2f7d43' });
    }
  }
  // 역 주변(380m) 건물 외벽 변화: 벽돌·흰 타일·유리·노출 콘크리트 판 + 층마다 창 띠 (1층은 상점 자리라 비움)
  const CLAD = [['#99503c', '#2f3b42'], ['#e7e3da', '#38444b'], ['#3f5661', '#9fb7c2'], ['#a9a7a1', '#2f3a40'], ['#b5643f', '#33424a'], ['#d9d4c8', '#3a4850']];
  let clad = 0;
  for (const b of blds) {
    if (b.ht > 42 || b.base > 1 || !nearSt(b.cx, b.cz, 380) || area(b.o) < 40) continue;
    const st2 = CLAD[(b.id >>> 3) % CLAD.length], floors = Math.max(1, Math.floor((b.ht - 3.4) / 3.2));
    for (let i = 0; i < b.o.length; i++) {
      const a = b.o[i], c = b.o[(i + 1) % b.o.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 4.5) continue;
      const ex = (c[0] - a[0]) / L, ez = (c[1] - a[1]) / L; let nx = ez, nz = -ex; const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if ((mx - b.cx) * nx + (mz - b.cz) * nz < 0) { nx = -nx; nz = -nz; }
      if (bldAt(mx + nx * 1.2, mz + nz * 1.2, 0.1)) continue;
      const ry = Math.atan2(-ez, ex), ox = mx + nx * 0.07, oz = mz + nz * 0.07, h = b.ht - 3.6;
      props.box('paint', L - 0.2, h, 0.08, { x: ox, y: 3.4 + h / 2, z: oz, ry, color: st2[0] }); clad++;
      for (let f = 0; f < floors; f++) props.box('paint', (L - 0.2) * 0.84, 1.45, 0.05, { x: ox + nx * 0.05, y: 3.4 + 1.0 + f * 3.2, z: oz + nz * 0.05, ry, color: st2[1] });
      props.box('paint', L - 0.1, 0.25, 0.3, { x: ox + nx * 0.1, y: 3.35, z: oz + nz * 0.1, ry, color: '#3a3f44' });
    }
    await tick('ss-clad');
  }
  // 역 출구 옆 가판대·편의점 키오스크, 방향 안내판, 큰길 볼라드·화분
  for (const e of data.exits || []) {
    const r = roadDir(e.x, e.z); if (!r) continue; const ox = -r.uz, oz = r.ux, sg = ((e.x - stX) * ox + (e.z - stZ) * oz) > 0 ? 1 : -1, ry = Math.atan2(r.ux, r.uz);
    for (const k of [-1, 1]) { const kx = e.x + r.ux * k * 9 + ox * sg * 3.2, kz = e.z + r.uz * k * 9 + oz * sg * 3.2; if (bldAt(kx, kz, 1)) continue;
      props.box('paint', 2.2, 2.5, 2.8, { x: kx, y: 1.25, z: kz, ry, color: k > 0 ? '#2f7d43' : '#e9e4d8' }); props.box('paint', 2.6, 0.12, 3.2, { x: kx, y: 2.6, z: kz, ry, color: k > 0 ? '#f2c230' : '#c94f3d' }); props.box('lamp', 0.05, 0.8, 2.2, { x: kx - ox * sg * 1.12, y: 1.6, z: kz - oz * sg * 1.12, ry, color: '#fff3d6' }); }
    const px = e.x + r.ux * 4 + ox * sg * 1.8, pz = e.z + r.uz * 4 + oz * sg * 1.8; props.cyl('metal', 0.06, 0.06, 3.0, { x: px, y: 1.5, z: pz, color: '#4a4f55' }, 6); props.box('paint', 1.5, 0.5, 0.06, { x: px, y: 2.7, z: pz, ry: ry + Math.PI / 2, color: '#00a84d' }); props.box('paint', 1.5, 0.35, 0.06, { x: px, y: 2.25, z: pz, ry: ry + Math.PI / 2, color: '#1e5fae' });
  }
  for (const w of roads) {
    if (!CAR.has(w.k) || w.w < 12 || brSet.has(w.id)) continue;
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], c = w.pts[i], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz); if (L < 6) continue;
      const nx = -dz / L, nz = dx / L;
      for (let s2 = 3; s2 < L - 3; s2 += 4) { const x0 = a[0] + dx * s2 / L, z0 = a[1] + dz * s2 / L; if (!nearSt(x0, z0, 230)) continue;
        for (const sg of [-1, 1]) { const x = x0 + nx * sg * (w.w / 2 + 0.45), z = z0 + nz * sg * (w.w / 2 + 0.45); if (bldAt(x, z, 0.5) || zebras.some((q) => Math.hypot(q[0] - x, q[1] - z) < w.w / 2 + 3)) continue;
          if ((s2 / 4 | 0) % 6 === 0) { props.box('paint', 1.1, 0.55, 0.7, { x: x + nx * sg * 0.4, y: 0.28, z: z + nz * sg * 0.4, ry: Math.atan2(dx, dz), color: '#8f8a80' }); props.add('leaf', new THREE.IcosahedronGeometry(0.45, 0), { x: x + nx * sg * 0.4, y: 0.85, z: z + nz * sg * 0.4, color: '#6f9a4a' }); }
          else props.cyl('metal', 0.09, 0.09, 0.85, { x, y: 0.43, z, color: '#4b5056' }, 6); }
      }
    }
  }
  { const g = zb.build(); if (g) { const m0 = new THREE.Mesh(g, mat); m0.name = 'seongsu-crosswalks'; for (const m of chunkMesh(m0, DET_CELL)) addDetail(m); } }
  await tick('ss-detail');

  // [seongsu-elevated] 성수역 = 지상 3층 고가역 (2층 대합실 · 3층 2면 4선 쌍섬식 승강장, 선로 3 1 | 2 4, 지붕 13.4m) — 아차산로 바로 위.
  //   역 틀: 역 중심(data.station)에서 가장 가까운 고가 구간 방향(sr)을 따라 a(길이)·v(폭) 좌표. 출입구 1~4(subway/entrance.js 고가형)는 양 끝.
  const vb = new Builder(); // [seongsu-v3] 고가·역 (멀리서도 보임)
  const sBox = (key, w, h, d, a, v, y, color) => { const q = sAt(a, v); vb.box(key, w, h, d, { x: q.x, y, z: q.z, ry: sr, color }); };
  const Y = Object.freeze({ CON0: 5.1, CON1: 8.6, BED: 9.0, PLAT: 10.1, ROOF: 13.0 });
  // 2호선 고가 (OSM railway=subway, bridge=yes): 교각·녹색 거더·상판·레일, 상판 윗면 9.0m. 역 몸체 안쪽 조각은 건너뜀 (역 선로가 대신)
  for (const r of data.rail || []) {
    if (!r.br || r.k !== 'subway') continue;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], c = r.pts[i], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz), ry = Math.atan2(dx, dz);
      if (L < 0.1) continue;
      const n = Math.max(1, Math.ceil(L / 12)), l = L / n;
      for (let k = 0; k < n; k++) {
        const x = a[0] + dx * (k + 0.5) / n, z = a[1] + dz * (k + 0.5) / n, q = sLoc(x, z);
        if (Math.abs(q.a) < SL / 2 + 4 && Math.abs(q.v) < SW + 1) continue;
        vb.box('paint', 4.4, 1.1, l + 0.1, { x, y: 8.2, z, ry, color: '#627c67' });
        vb.box('paint', 4.3, 0.25, l + 0.1, { x, y: 8.9, z, ry, color: '#b6b9b2' });
        for (const sg of [-1, 1]) vb.box('metal', 0.08, 0.12, l, { x: x + Math.cos(ry) * sg * 0.72, y: 9.08, z: z - Math.sin(ry) * sg * 0.72, ry, color: '#51565a' });
      }
      for (let s2 = 5; s2 < L; s2 += 24) { const px = a[0] + dx * s2 / L, pz = a[1] + dz * s2 / L, q = sLoc(px, pz); if (Math.abs(q.a) < SL / 2 + 4 && Math.abs(q.v) < SW + 1) continue; vb.box('paint', 1.0, 7.6, 1.2, { x: px, y: 3.8, z: pz, ry, color: '#b4b5ae' }); pierAdd(px, pz, 0.5, ry, 0.6); }
    }
  }
  // 교각 쌍 (20m마다, 아차산로 차로 사이) + 가로보
  for (let a = -SL / 2; a <= SL / 2 + 0.1; a += 20) { for (const v of [-9, 9]) { sBox('paint', 1.4, Y.CON0, 1.4, a, v, Y.CON0 / 2, '#b9bab3'); const q = sAt(a, v); pierAdd(q.x, q.z, 0.7, sr, 0.7); } sBox('paint', 1.6, 0.7, SW * 2 - 1, a, 0, Y.CON0 - 0.35, '#a8aaa3'); }
  // 2층 대합실 (길 위 상자): 아래 띠 · 창 띠(멀리온 4m) · 위 띠 + 녹색 줄
  sBox('paint', SW * 2, 0.5, SL, 0, 0, Y.CON0 + 0.25, '#c4c5bf');
  sBox('paint', SW * 2 - 0.5, Y.CON1 - Y.CON0 - 1.2, SL - 0.5, 0, 0, (Y.CON0 + Y.CON1 + 0.7 - 0.5) / 2, '#5b707b');
  sBox('paint', SW * 2, Y.BED - Y.CON1 + 0.7, SL, 0, 0, (Y.CON1 - 0.7 + Y.BED) / 2, '#d2d3cd');
  for (const v of [-1, 1]) { sBox('paint', 0.06, 0.28, SL, 0, v * (SW + 0.02), Y.CON1 - 0.25, '#00a84d'); for (let a = -SL / 2 + 2; a < SL / 2; a += 4) sBox('frame', 0.14, Y.CON1 - Y.CON0 - 1.2, 0.14, a, v * (SW - 0.2), (Y.CON0 + Y.CON1 + 0.2) / 2, '#3d434b'); }
  // 3층: 선로 4개 (v = 측선 -11.2, 본선 -3.8 | 3.8, 측선 11.2) · 섬식 승강장 2개 (v ±7.5, 폭 4)
  for (const v of [-11.2, -3.8, 3.8, 11.2]) { sBox('paint', 3.0, 0.1, SL + 6, 0, v, Y.BED + 0.05, '#4a4945'); for (const s2 of [-0.75, 0.75]) sBox('metal', 0.08, 0.14, SL + 6, 0, v + s2, Y.BED + 0.17, '#51565a'); }
  for (const v of [-1, 1]) sBox('paint', 0.3, 1.2, SL, 0, v * (SW - 0.15), Y.BED + 0.6, '#d0d2cc'); // 바깥 난간
  for (const iv of [-7.5, 7.5]) {
    sBox('paint', 4, Y.PLAT - Y.BED, SL - 10, 0, iv, (Y.PLAT + Y.BED) / 2, '#b9b4aa');
    for (const e of [-1, 1]) {
      const ev = iv + e * 1.95;
      sBox('paint', 0.08, 1.9, SL - 12, 0, ev, Y.PLAT + 0.95, '#93aebb');                         // 스크린도어 유리
      sBox('paint', 0.14, 0.32, SL - 12, 0, ev, Y.PLAT + 2.05, '#30363b');                       // 위 띠
      sBox('paint', 0.16, 0.08, SL - 12, 0, ev, Y.PLAT + 2.15, '#00a84d');                       // 2호선 녹색 줄
      for (let a = -SL / 2 + 7; a < SL / 2 - 6; a += 7) sBox('frame', 0.1, 1.9, 0.12, a, ev, Y.PLAT + 0.95, '#59636b');
    }
    for (let a = -SL / 2 + 8; a < SL / 2 - 4; a += 16) sBox('paint', 0.36, Y.ROOF - Y.PLAT, 0.36, a, iv, (Y.ROOF + Y.PLAT) / 2, '#e9ecef'); // 지붕 기둥
    sBox('paint', 7.2, 0.4, SL - 6, 0, iv, Y.ROOF + 0.2, '#e2e4e1');                              // 승강장 지붕
    for (const e of [-1, 1]) sBox('paint', 0.1, 0.36, SL - 6, 0, iv + e * 3.62, Y.ROOF + 0.16, '#00a84d');
    for (const a of [-SL / 2 + 12, SL / 2 - 12]) { sBox('paint', 2.6, 2.4, 8, a, iv, Y.PLAT + 1.2, '#cfd6d8'); sBox('paint', 2.8, 0.15, 8.4, a, iv, Y.PLAT + 2.5, '#e2e4e1'); } // 양 끝 계단실 (대합실로)
  }
  for (const m0 of props.build(hq.mats)) { m0.name = 'seongsu-street-' + m0.userData.key; for (const m of chunkMesh(m0, DET_CELL)) addDetail(m); }
  for (const m0 of vb.build(hq.mats)) { m0.name = 'seongsu-viaduct-' + m0.userData.key; for (const m of chunkMesh(m0, DET_CELL)) addDetail(m, true); }
  for (const m0 of brb.build(hq.mats)) { m0.name = 'seongsu-bridges-' + m0.userData.key; for (const m of chunkMesh(m0, DET_CELL)) addDetail(m, true); }
  // 역 이름 (녹색 2호선 간판): 대합실 양 옆(큰 것 2) + 승강장 지붕 밑(작은 것 8) — 판 하나 InstancedMesh (draw 1)
  const signGeo = new THREE.PlaneGeometry(1, 1);
  const signMat = new THREE.MeshBasicMaterial({ map: labelTex('성수  Seongsu', { w: 768, h: 128, bg: '#00a84d', fg: '#ffffff', font: '800 58px "Noto Sans KR", sans-serif', sub: '2  ·  211  ·  건대입구 ← → 뚝섬', subFont: '500 25px sans-serif' }), toneMapped: false, side: THREE.DoubleSide });
  const signSpots = [];
  for (const v of [-1, 1]) for (const a of [-40, 40]) signSpots.push({ a, v: v * (SW + 0.08), y: (Y.CON0 + Y.CON1) / 2 + 0.2, w: 19, h: 2.2, face: v });
  for (const iv of [-7.5, 7.5]) for (const a of [-60, -20, 20, 60]) signSpots.push({ a, v: iv, y: Y.ROOF - 0.55, w: 4.2, h: 0.7, face: 0 });
  const sign = new THREE.InstancedMesh(signGeo, signMat, signSpots.length); sign.name = 'seongsu-station-sign';
  { const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    signSpots.forEach((g, k) => { const q = sAt(g.a, g.v); ps.set(q.x, g.y, q.z); qq.setFromAxisAngle(up, g.face ? Math.atan2(CS * g.face, -SN * g.face) : sr + Math.PI / 2); sc.set(g.w, g.h, 1); m4.compose(ps, qq, sc); sign.setMatrixAt(k, m4); }); }
  root.add(sign);
  await tick('ss-props');

  // HQ와 성수역 사이의 실제 길 위 사람들. 거리 풀(폰 50/PC90)과 HQ 풀(직원10/관람객25/보행자18)은 각각 부품 인스턴싱.
  const streetNpc = q.get('ssnpc') === '0' ? null : createMyeongdongNpc({ parent: root, paths: paths.filter((p) => p.L > 8), heightAt: () => 0.055, mobile, seed: 20261121, name: 'seongsuCrowd', pools: { peds: mobile ? 45 : 80 }, getHour: () => 15 });
  const ci = hqCrowdInput(toWorld, { rot: H.ry });
  const hqNpc = q.get('hnnpc') === '0' ? null : createMyeongdongNpc({ parent: root, paths: ci.paths.map(withCum), vendors: ci.vendors, promoters: ci.promoters, heightAt: () => 0.04, mobile, seed: 433, name: 'hnCrowd', looks: { promo: staffLook, vendor: guestLook }, pools: { peds: mobile ? 12 : 18, vendors: ci.vendors.length, promoters: ci.promoters.length }, getHour: () => 15, cull: (y) => hq.showY(y) });
  await tick('ss-npc');

  // 바닥·충돌. 반경 밖은 다른 섬/코리더가 담당. HQ에서는 현재 refY 근처의 바닥(층·에스컬레이터·계단)을 고른다.
  let lastY = 0.04, lastP = null, t = 0, lastCamY = 0; const lastCam = new THREE.Vector3();
  const deckY = (x, z, refY = Infinity) => { let best = null; for (const d of decks) for (let i = 1; i < d.pts.length; i++) { const a = d.pts[i - 1], b = d.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], LL = dx * dx + dz * dz; if (!LL) continue; const tr = ((x - a[0]) * dx + (z - a[1]) * dz) / LL; if ((tr < 0 ? -tr : tr - 1) * Math.sqrt(LL) > 0.6) continue; const t = Math.max(0, Math.min(1, tr)); if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) > d.w.w / 2 + 0.5) continue; /* [v4b] 끝에서 반지름 8 m 둥근 '모자'가 다음 상판보다 높게 잡혀 0.7 m 턱(성수대교 남행 막힘) → 길이 방향 0.6 m 까지만 */ const y = d.ys[i - 1] + (d.ys[i] - d.ys[i - 1]) * t; if (Number.isFinite(refY) && y > refY + 1.0) continue; if (best == null || y > best) best = y; } return best; };

  // [v4b] 성수 땅 끝(A.z1, y 0) → 합수부 땅 끝(z −18625) 비탈(보이는 비탈 판과 같은 면). 예전엔 바닥이 없어 걸을 수 없었다.
  const edgeSlopeY = (x, z) => {
    if (z <= A.z1 || z > HAP_EDGE_Z + 3) return null;
    const f = (x - HAP_EDGE_X0) / 25, i = Math.floor(f); if (i < 0 || i >= HAP_EDGE_Y.length - 1) return null;
    const xa = HAP_EDGE_X0 + i * 25; if (rawBZ(xa) < A.z1 - 1 || rawBZ(xa + 25) < A.z1 - 1) return null; // 물 쪽은 둔치 비탈이 대신
    const ye = HAP_EDGE_Y[i] + (HAP_EDGE_Y[i + 1] - HAP_EDGE_Y[i]) * (f - i) - 0.15, t = (z - A.z1) / (HAP_EDGE_Z + 3 - A.z1);
    return 0.02 + (ye - 0.02) * t;
  };
  function surfaceY(x, z, refY = 0.04) {
    const dy = deckY(x, z, refY);
    if (dy != null) return dy;
    { const e = edgeSlopeY(x, z); if (e != null) return e; }
    if (!inApron(x, z, 0.5) || waterAt(x, z)) return null;
    const [lx, lz] = local(x, z);
    const cur = Number.isFinite(refY) ? refY : 0.04;
    if (!hqSite(x, z, 0)) return 0.04;
    // 층 사이 구멍(에스컬레이터·계단 샤프트)에 서면 아래 바닥으로 — 1m씩 내려가며 찾는다
    for (let r = cur; r > -1.5; r -= 1) { const y = hq.physics.support(lx, lz, r); if (y != null) return y; }
    return 0.04;
  }
  const unregSurface = terrain?.addGroundSurface?.((x, z, refY) => surfaceY(x, z, refY), { authoritative: true });
  function isBlocked(x, z, r = 0.35) {
    if (!inApron(x, z, 1)) return false;
    if (bldAt(x, z, r)) return true;
    if (lastY < 3 && pierAt(x, z, r)) return true; // [seongsu-v3] 교각
    if (waterAt(x, z, -1) && deckY(x, z, lastY) == null) return true; // [seongsu-v2] 한강
    if (hqSite(x, z, 1)) { const [lx, lz] = local(x, z); if (hq.physics.blocked(lx, lz, lastY)) return true; }
    return false;
  }
  let night = false;
  const unwatch = watchEvening((on) => { night = !!on; hq.setNight(night); });
  const mini = {
    roads: roads.map((w) => ({ k: w.k, p: w.pts, w: w.w })),
    buildings: blds.map((b) => ({ o: b.o })).concat(H.o ? [{ o: H.o }] : []),
    parks: (data.areas || []).filter((a) => /park|garden|grass|wood/.test(a.k)).map((a) => ({ o: a.o })),
    water: waterRing ? [{ o: waterRing }] : [], waterLines: [],
    station: { x: st.x, z: st.z, exits: data.exits.map((e) => ({ x: e.x, z: e.z, ref: e.ref })) },
    hq: H.o ? { o: H.o } : null, apron: { ...A }, // [seongsu-v4] 코너맵: 사옥 강조 · 성수 땅 범위
  };
  root.visible = true;
  return {
    root, bounds: B, boxes: [B], spawn: { ...SEONGSU_SPAWN }, spawnY: () => SEONGSU_SPAWN.y, face: H.ry,
    mini, hq, station: st, roads, bridgeJoins: BRIDGE_JOINS, deckY, stationAt: (a, v) => sAt(a, v), // [seongsu-elevated] 역 틀 (a 길이·v 폭) → 월드
    owns: (x, z) => inSeongsu(x, z) || deckY(x, z) != null, ownDist: (x, z) => distBox(B, x, z),
    heightAt: (x, z) => deckY(x, z) ?? (inApron(x, z) && !waterAt(x, z) ? 0.04 : null), surfaceY, groundHeight: surfaceY, isBlocked,
    blockedBy: (x, z, r) => isBlocked(x, z, r) ? 'seongsu' : null,
    walkWays: () => roads,
    get hqFloor() { if (!lastP) return 0; const [x, z] = local(lastP.x, lastP.z); return hq.inFoot(x, z) ? floorOfY(lastP.y) : 0; },
    camInside(x, z, y) { const [lx, lz] = local(x, z); return y < 23.2 && hq.inFoot(lx, lz) && !hq.physics.camBlocked(lx, y, lz, hq.ceilingAt(lx, lz, y)); },
    camBlocked(x, y, z) { const [lx, lz] = local(x, z); return !hq.inFoot(lx, lz) || hq.physics.camBlocked(lx, y, lz, hq.ceilingAt(lx, lz, y)); }, // 실내에 선 플레이어 카메라: 바깥 곡면 벽 밖으로도 나가지 않게
    local, toWorld,
    ensureInterior: () => hq.ensureInterior(),
    /** [seongsu] 성수 섬 안에서는 1.4 km 밖 다른 랜드마크(남산 산·탄천 합수부·명동·청계산 숲…)를 이 프레임만 숨긴다 → 폰 tris.
     *  game.js 가 renderer.render 앞뒤로 부른다. 숨긴 것만 되돌리므로 각 랜드마크의 자체 dormancy(visible) 와 겹치지 않는다. */
    hideFar() {
      if (!lastP || !inApron(lastP.x, lastP.z, 700) || !root.visible) return null; // [seongsu-v3] 다리 북단(합수부 쪽)에 서 있을 때도
      const hidden = [];
      const far = (o) => {
        let c = farCache.get(o); const key = o.children.length + ':' + (o.isMesh ? o.geometry?.id : '');
        if (!c || c.key !== key) { c = { key, b: new THREE.Box3().setFromObject(o) }; farCache.set(o, c); }
        if (c.b.isEmpty()) return -1;
        const dx = Math.max(c.b.min.x - lastP.x, 0, lastP.x - c.b.max.x), dz = Math.max(c.b.min.z - lastP.z, 0, lastP.z - c.b.max.z);
        return Math.hypot(dx, dz);
      };
      const visit = (o, depth) => {
        if (o === root || !o.visible || o.isLight || /sky|sun/i.test(o.name || '')) return;
        // [seongsu-v3] 코리더 바깥 바닥(279k 삼각형 한 장): 성수·다리 쪽 땅 시점에선 그 자리 바닥을 합수부(2구간)·성수가 덮고 나머지는 2km+ → 숨김. 높은 개관 시점만 둔다
        if (o.name === 'corridorOuterGround') { if (lastCam.y < 400) { o.visible = false; hidden.push(o); } return; }
        const d = far(o); if (d < 0) return;
        if (d > FAR_HIDE) { o.visible = false; hidden.push(o); return; }
        if (depth < 6 && o.children.length && o.children.length < 2000) for (const k of o.children) visit(k, depth + 1); // [seongsu-v3] 깊이 6까지 (합수부 조각별)
      };
      { // [seongsu-v3] 거리 소품 칸: 카메라에서 3D 거리 (폰 380/PC 480 m, 고가·역·다리 1000/1400 m)
        const c = lastCam, dl = mobile ? 380 : 480, db = mobile ? 1000 : 1400;
        for (const f of detailFar) { if (!f.o.visible) continue; const b = f.b, dx = Math.max(b.min.x - c.x, 0, c.x - b.max.x), dy = Math.max(b.min.y - c.y, 0, c.y - b.max.y), dz = Math.max(b.min.z - c.z, 0, c.z - b.max.z); if (Math.hypot(dx, dy, dz) > (f.big ? db : dl)) { f.o.visible = false; hidden.push(f.o); } }
      }
      if (lastCamY < 90) { const lim = mobile ? 700 : 1000; for (const f of ownFar) { if (!f.o.visible) continue; const b = f.b, dx = Math.max(b.min.x - lastP.x, 0, lastP.x - b.max.x), dz = Math.max(b.min.z - lastP.z, 0, lastP.z - b.max.z); if (Math.hypot(dx, dz) > lim) { f.o.visible = false; hidden.push(f.o); } } }
      for (const o of scene.children) visit(o, 0);
      for (const o of scene.parent?.children || []) if (o !== scene && !o.isCamera) visit(o, 0); // [seongsu-v3] 최상위 전부 (liveWaterLines·탄천 지형 등)
      return hidden;
    },
    showFar(hidden) { if (hidden) for (const o of hidden) o.visible = true; },
    tickPlayer(dt, player, cam, sky, camera) {
      lastP = player?.position || null; if (!lastP) return;
      lastY = lastP.y;
      if (!syncLandmarkDormant(root, distBox(A, lastP.x, lastP.z))) { streetNpc?.sleep(); hqNpc?.sleep(); return; }
      const [lx, lz] = local(lastP.x, lastP.z);
      if (Math.hypot(lx, lz) < 160) void hq.ensureInterior();
      const cp = camera?.position || lastP, [cx, cz] = local(cp.x, cp.z); lastCamY = cp.y; lastCam.copy(cp);
      hq.cull(cx, cp.y, cz);
    },
    update(dt) {
      if (!root.visible) return; t += Math.min(dt, 0.1); hq.update(t);
      if (!lastP || distBox(A, lastP.x, lastP.z) > 150) { streetNpc?.sleep(); hqNpc?.sleep(); return; }
      streetNpc?.update(dt, lastP.x, lastP.z);
      const [lx, lz] = local(lastP.x, lastP.z);
      if (Math.hypot(lx, lz) < 135) hqNpc?.update(dt, lastP.x, lastP.z); else hqNpc?.sleep();
    },
    setNight(on) { night = !!on; hq.setNight(night); },
    stats() { return { joinProfiles: decks.filter((d) => d.join).map((d) => ({ name: d.join, w: d.w.w, ground: d.ground, pts: d.pts, ys: d.ys })), signAt: signSpots2, heroAt: heroShops.map((h) => [Math.round(h.x), Math.round(h.z), h.type, +h.nx.toFixed(3), +h.nz.toFixed(3)]), heroShops: heroShops.length, clad, zebras: zebras.length, decks: decks.length, buckets: BNX * BNZ, fill: blds.filter((b) => b.f).length, buildings: blds.length, ways: roads.length, signs: signN, trees: treeSpots.length, hqNpcs: hqNpc?.stats || null, streetNpcs: streetNpc?.stats || null }; },
    dispose() { unwatch?.(); unregSurface?.(); streetNpc?.dispose(); hqNpc?.dispose(); root.removeFromParent(); for (const l of labels) l?.remove?.(); },
  };
}
