// [depot-ext] 범창고 주차장·입구 디테일 (가까이 올 때만 만들고, 멀어지면 해제).
//   draw call: 정적 구조물 1 · 바닥 페인트 1 · 아스팔트 1 · 현수막/바닥 글씨 1 · 밝은 간판 1 · 자동문 1 · 깃발 1 · 불빛 웅덩이 1 · 주차 차량 종류당 1(≤6) ≈ 14
import * as THREE from 'three';
import { DEPOT_SITE as S } from './flag.js';
import { LOT as L } from './extLayout.js';
import { kit, kitMaterial, quads } from './extKit.js';
import { bannerAtlas, asphaltTexture, C } from './extTex.js';
import { KINDS, kindGeometry, pickWeighted } from '../entities/vehicleKinds.js';
import { lightPoolMaterial } from '../world/nightLights.js';

const WHITE = '#f1efe6', YEL = '#f2c230', BLUE = '#2f6fd0', PINK = '#e58fb8', EVG = '#3aa86b', WALK = '#3f8f63', CURB = '#bdbab2', CONC = '#c9c6bd', GRASS = '#5f8c47', POLE = '#5b636b', GLASS = '#2f3b46';
const SW = 2.5; // 주차칸 폭

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// 주차칸 목록: { row, x0, x1, z0, z1, back, access, kind: 'std'|'dis'|'family'|'ev'|'kei', corral? }
export function stalls() {
  const out = [];
  const blocks = [[L.islandW.x1, L.islandM.x0], [L.islandM.x1, L.walkway.x0 - 1.5], [L.walkway.x1, L.islandE.x0]];
  for (const r of L.rows) {
    const back = r.access === r.z1 ? r.z0 : r.z1;
    blocks.forEach(([a, b], bi) => {
      const n = Math.floor((b - a) / SW + 1e-6);
      for (let i = 0; i < n; i++) {
        const x0 = a + i * SW, x1 = x0 + SW, cx = (x0 + x1) / 2;
        // 북동 모서리(진출입로 쪽) 깎인 곳은 비움
        const zN = Math.min(r.z0, r.z1); if (cx > L.chamfer[0][0] + (zN - L.chamfer[0][1]) - 3) continue;
        let kind = 'std';
        if ((r.id === 'A1' || r.id === 'A2') && (bi === 2 || (bi === 1 && i >= n - 3))) kind = 'dis';
        else if ((r.id === 'A1' || r.id === 'A2') && bi === 1 && i >= n - 8) kind = 'family';
        else if (r.id === 'B1' && bi === 0 && i >= n - 5) kind = 'ev';
        else if (r.id === 'C2' && bi === 0 && i < 6) kind = 'kei';
        out.push({ row: r.id, bi, i, x0, x1, z0: r.z0, z1: r.z1, back, access: r.access, kind });
      }
    });
  }
  // 카트 보관소: 주차칸 3개 자리
  const corralAt = [['C1', 0, 6], ['C1', 1, 6], ['A2', 0, 9], ['D1', 1, 3]];
  for (const [row, bi, i0] of corralAt) for (let k = 0; k < 3; k++) { const s = out.find((t) => t.row === row && t.bi === bi && t.i === i0 + k); if (s) s.corral = k === 0 ? 'head' : 'part'; }
  return out;
}

export function buildDepotLot({ groundY = () => 0, signTex, signSlots, kitMat, mobile = false } = {}) {
  const y0 = groundY(-527, 450) || 0;
  const root = new THREE.Group(); root.name = 'depot-lot';
  const disposables = [];
  const R = rng(20261112);
  const ban = bannerAtlas({ k: mobile ? 0.5 : 1 }); disposables.push(ban);
  const BS = ban.slots, SS = signSlots;

  // ---------- 아스팔트 (외곽 + 진입로 + 하역 차로 + 하역장) ----------
  const asph = kit();
  const [c0, c1] = L.chamfer;
  asph.poly([[L.x0, L.z1], [L.x0, L.z0], [c0[0], c0[1]], [c1[0], c1[1]], [L.x1, L.z1]], y0 + 0.05, '#ffffff');
  for (const d of L.drives) asph.rect(L.roadInX, d.z0, L.x0 + 0.01, d.z1, y0 + 0.05, '#ffffff');
  asph.rect(L.service.x0, L.service.z0, L.service.x1, L.service.z1, y0 + 0.05, '#ffffff');
  asph.rect(L.dock.x0, L.dock.z0, L.service.x0 + 0.01, L.dock.z1, y0 + 0.05, '#ffffff');
  const aTex = asphaltTexture(); disposables.push(aTex);
  const aGeo = asph.geometry();
  { // 월드 XZ 로 UV (4 m 한 장)
    const p = aGeo.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 4; uv[i * 2 + 1] = p.getZ(i) / 4; }
    aGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  const aMat = new THREE.MeshLambertMaterial({ map: aTex, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const asphalt = new THREE.Mesh(aGeo, aMat); asphalt.name = 'depot-lot-asphalt'; asphalt.receiveShadow = true; root.add(asphalt);
  disposables.push(aGeo, aMat);

  // ---------- 바닥 페인트 ----------
  const P = kit(), py = y0 + 0.075;
  const ST = stalls();
  for (const s of ST) {
    if (s.corral) continue;
    const col = s.kind === 'dis' ? BLUE : s.kind === 'family' ? PINK : s.kind === 'ev' ? EVG : WHITE;
    if (s.kind === 'dis' || s.kind === 'family' || s.kind === 'ev') P.rect(s.x0 + 0.15, s.z0 + 0.1, s.x1 - 0.15, s.z1 - 0.1, py - 0.004, s.kind === 'dis' ? '#3567b5' : s.kind === 'family' ? '#d97aa6' : '#2f9a5e');
    for (const x of [s.x0, s.x1]) P.stripe(x, s.z0, x, s.z1, 0.13, py, col === WHITE ? WHITE : WHITE);
    P.stripe(s.x0, s.back, s.x1, s.back, 0.13, py, WHITE);
    if (s.kind === 'dis' && s.i % 2 === 0 && s.bi === 1) for (let k = 0; k < 4; k++) P.stripe(s.x0 + 0.2, s.z0 + 0.6 + k * 1.1, s.x0 + 0.9, s.z0 + 1.2 + k * 1.1, 0.12, py + 0.002, WHITE); // 빗금(휠체어 승하차 여유)
  }
  // 소방 차로: 노란 이중선(정차 금지) + 횡단보도
  P.stripe(L.x0 + 8, L.fire.z1 - 0.25, S.x1, L.fire.z1 - 0.25, 0.12, py, YEL); P.stripe(L.x0 + 8, L.fire.z1 - 0.5, S.x1, L.fire.z1 - 0.5, 0.12, py, YEL);
  const zebra = (x0, x1, z0, z1, alongX) => { if (alongX) { for (let x = x0 + 0.3; x < x1 - 0.2; x += 1.0) P.rect(x, z0, x + 0.5, z1, py + 0.001, WHITE); } else { for (let z = z0 + 0.3; z < z1 - 0.2; z += 1.0) P.rect(x0, z, x1, z + 0.5, py + 0.001, WHITE); } };
  zebra(L.walkway.x0 - 0.5, L.walkway.x1 + 0.5, L.fire.z0, L.fire.z1, true); // 입구 앞
  zebra(L.exitDoor.x - 3, L.exitDoor.x + 3, L.fire.z0, L.fire.z1, true); // 출구 앞
  // 초록 보행자 통로(입구까지) + 차로 건너는 곳 얼룩말
  P.rect(L.walkway.x0, L.z0 + 4, L.walkway.x1, L.fire.z0, py - 0.003, WALK);
  P.stripe(L.walkway.x0, L.z0 + 4, L.walkway.x0, L.fire.z0, 0.15, py, WHITE); P.stripe(L.walkway.x1, L.z0 + 4, L.walkway.x1, L.fire.z0, 0.15, py, WHITE);
  for (const [a, b] of L.aisles) zebra(L.walkway.x0, L.walkway.x1, a, b, true);
  // 차로 화살표(흰 페인트): 서쪽 차로는 남쪽(입구 쪽)으로, 통로 차로는 동쪽으로, 소방 차로는 서쪽으로(일방)
  const arrow = (x, z, hd, s = 1) => { const fx = Math.sin(hd), fz = Math.cos(hd), rx = -fz, rz = fx; const pt = (a, b) => [x + rx * a * s + fx * b * s, z + rz * a * s + fz * b * s];
    P.poly([pt(-0.18, -2.2), pt(0.18, -2.2), pt(0.18, 0.2), pt(0.55, 0.2), pt(0, 1.4), pt(-0.55, 0.2), pt(-0.18, 0.2)], py + 0.001, WHITE); };
  for (const z of [425, 452, 478]) arrow((L.westLane.x0 + L.westLane.x1) / 2, z, 0);
  for (const [a, b] of L.aisles) for (const x of [-560, -520]) arrow(x, (a + b) / 2, Math.PI / 2);
  for (const x of [-540, -505]) arrow(x, (L.fire.z0 + L.fire.z1) / 2 - 1, -Math.PI / 2);
  for (const z of [430, 470]) arrow((L.eastLane.x0 + L.eastLane.x1) / 2, z, Math.PI);
  for (const z of [520, 580]) arrow((L.service.x0 + L.service.x1) / 2, z, 0);
  // 진입로 정지선 + 중앙선
  for (const d of L.drives) { P.stripe(L.x0 - 0.6, (d.z0 + d.z1) / 2, L.x0 - 0.6, d.z1 - 0.3, 0.35, py, WHITE); P.stripe(L.roadEdgeX + 0.6, (d.z0 + d.z1) / 2, L.x0 - 1.5, (d.z0 + d.z1) / 2, 0.15, py, YEL); }
  // 하역장 칸 선
  for (let x = L.dock.x0 + 4; x <= L.dock.x1 - 8; x += 10) P.stripe(x + 5, L.dock.z0 + 1, x + 5, L.dock.z0 + 20, 0.15, py, YEL);
  const pGeo = P.geometry();
  const pMat = kitMaterial({ name: 'depot-lot-paint', offset: -3 });
  const paint = new THREE.Mesh(pGeo, pMat); paint.name = 'depot-lot-paint'; root.add(paint);
  disposables.push(pGeo, pMat);

  // ---------- 정적 구조물 (보도·섬·나무·가로등·카트 보관소·입구 처마·하역장·트럭·옥상 설비·풍선 아치) ----------
  const K = kit();
  const blockers = []; // [x0, z0, x1, z1]
  // 건물 앞 보도 (낮은 턱)
  K.box(S.x1 - S.x0 + 2, 0.12, L.walkFront.z1 - L.walkFront.z0, (S.x0 + S.x1) / 2, y0 + 0.06, (L.walkFront.z0 + L.walkFront.z1) / 2, CONC);
  K.box(S.x1 - S.x0 + 2, 0.14, 0.25, (S.x0 + S.x1) / 2, y0 + 0.07, L.walkFront.z0, CURB);
  // 볼라드(노랑) — 보도 끝 차 막이
  for (let x = S.x0 + 2; x < S.x1 - 1; x += 3) { if (Math.abs(x - S.door.x) < 6 || Math.abs(x - L.exitDoor.x) < 4) continue; K.cyl(0.11, 0.11, 0.9, x, y0 + 0.5, L.walkFront.z0 + 0.4, YEL, { seg: 6 }); }
  // 섬(턱 + 잔디 + 나무) : 주차 줄 끝·가운데·통로 옆
  const island = (x0, x1, z0, z1, tree = true) => {
    K.box(x1 - x0, 0.16, z1 - z0, (x0 + x1) / 2, y0 + 0.08, (z0 + z1) / 2, CURB);
    K.box(x1 - x0 - 0.3, 0.05, z1 - z0 - 0.3, (x0 + x1) / 2, y0 + 0.18, (z0 + z1) / 2, GRASS);
    if (tree && z1 - z0 > 4) { const tx = (x0 + x1) / 2, tz = (z0 + z1) / 2 + (R() - 0.5) * 2; K.cyl(0.13, 0.17, 2.2, tx, y0 + 1.25, tz, '#6b4f36', { seg: 6 }); K.sphere(1.25 + R() * 0.4, tx, y0 + 3.2, tz, R() > 0.5 ? '#4f8a3f' : '#5c9a46', { ws: 7, hs: 5, sy: 1.15 }); }
  };
  const pairs = [[474, 484], [457, 467], [440, 450], [423, 433], [411, 416]];
  for (const [z0, z1] of pairs) {
    island(L.islandW.x0, L.islandW.x1, z0, z1); island(L.islandM.x0, L.islandM.x1, z0, z1);
    if (z0 > 418) island(L.islandE.x0, L.islandE.x1, z0, z1);
    island(L.walkway.x0 - 1.5, L.walkway.x0 - 0.1, z0, z1, false);
  }
  // 가장자리 생울타리 + 나무: 북쪽(완충 녹지)·서쪽(대왕판교로 쪽, 진입로 빼고)·동쪽(고속도로 쪽)
  const hedge = (ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz); K.box(1.0, 0.9, len, (ax + bx) / 2, y0 + 0.45, (az + bz) / 2, '#3f6d35', { ry: Math.atan2(dx, dz) }); };
  hedge(L.x0 + 1, L.z0 - 1.5, L.walkway.x0 - 2, L.z0 - 1.5); hedge(c0[0] + 1.5, c0[1] - 1.2, c1[0] + 1.5, c1[1] - 1.2); hedge(L.x1 + 1, c1[1], L.x1 + 1, L.z1 - 2);
  let zz = L.z0; for (const d of [...L.drives].sort((a, b) => a.z0 - b.z0)) { hedge(L.x0 - 1.5, zz + 0.5, L.x0 - 1.5, d.z0 - 0.7); zz = d.z1 + 0.7; } hedge(L.x0 - 1.5, zz, L.x0 - 1.5, L.z1 - 0.5);
  for (let x = L.x0 + 4; x < c0[0] - 2; x += 9) { K.cyl(0.15, 0.2, 2.6, x, y0 + 1.3, L.z0 - 5, '#6b4f36', { seg: 6 }); K.sphere(1.9, x, y0 + 3.9, L.z0 - 5, R() > 0.5 ? '#4a8340' : '#3f7a37', { ws: 7, hs: 5, sy: 1.2 }); }
  for (let z = c1[1] + 4; z < L.service.z1; z += 10) { if (z > L.z1 - 3 && z < L.z1 + 6) continue; K.cyl(0.15, 0.2, 2.4, L.service.x1 + 3, y0 + 1.2, z, '#6b4f36', { seg: 6 }); K.sphere(1.7, L.service.x1 + 3, y0 + 3.6, z, R() > 0.5 ? '#4a8340' : '#3f7a37', { ws: 7, hs: 5, sy: 1.2 }); }

  // 가로등 (쌍두 LED, 섬 위) + 밤 불빛 웅덩이
  const poles = [];
  for (const z of [479, 462, 445, 428, 413.5]) for (const x of [(L.islandW.x0 + L.islandW.x1) / 2, (L.islandM.x0 + L.islandM.x1) / 2, L.walkway.x0 - 0.8]) poles.push([x, z]);
  for (const x of [-570, -545, -520]) poles.push([x, L.fire.z0 + 0.6]);
  for (const z of [520, 560, 600, 640]) poles.push([L.service.x1 + 1.2, z]);
  for (const [x, z] of poles) {
    const h = 11;
    K.cyl(0.32, 0.36, 0.5, x, y0 + 0.25, z, '#8f9399', { seg: 8 });
    K.cyl(0.1, 0.15, h, x, y0 + h / 2, z, POLE, { seg: 6 });
    K.box(3.0, 0.12, 0.12, x, y0 + h - 0.1, z, POLE);
    for (const s of [-1, 1]) { K.box(0.9, 0.16, 0.42, x + s * 1.45, y0 + h - 0.2, z, '#3b4046'); K.box(0.8, 0.04, 0.34, x + s * 1.45, y0 + h - 0.3, z, '#fff6dc', { glow: 1 }); }
  }
  // 카트 보관소 (주차칸 3개 자리) + 겹쳐 꽂힌 카트
  const cartAt = (x, z, yaw) => { // 단순 카트(멀리서 보는 용, 박스 몇 개)
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
    const P3 = (a, b) => [x + rx * a + fx * b, z + rz * a + fz * b];
    const [bx, bz] = P3(0, 0); K.box(0.58, 0.42, 0.95, bx, y0 + 0.72, bz, '#b9c0c6', { ry: yaw }); K.box(0.5, 0.05, 0.8, bx, y0 + 0.2, bz, '#9aa2a9', { ry: yaw });
    const [hx, hz] = P3(0, 0.55); K.box(0.6, 0.06, 0.06, hx, y0 + 1.0, hz, C.red, { ry: yaw });
  };
  const corrals = ST.filter((s) => s.corral === 'head');
  for (const s of corrals) {
    const x0 = s.x0, x1 = s.x0 + SW * 3, z0 = s.z0, z1 = s.z1, cx = (x0 + x1) / 2;
    K.box(x1 - x0, 0.1, z1 - z0, cx, y0 + 0.1, (z0 + z1) / 2, '#8d9298');
    for (const x of [x0 + 0.2, x1 - 0.2]) for (const z of [z0 + 0.3, z1 - 0.3]) K.cyl(0.06, 0.06, 2.6, x, y0 + 1.3, z, '#2c5d48', { seg: 6 });
    K.box(x1 - x0 + 0.4, 0.12, z1 - z0 + 0.4, cx, y0 + 2.65, (z0 + z1) / 2, C.green);
    K.box(x1 - x0 + 0.42, 0.25, 0.08, cx, y0 + 2.5, s.access === z1 ? z1 + 0.2 : z0 - 0.2, C.yellow);
    for (const x of [x0 + 2.5, x0 + 5]) K.bar([x, y0 + 0.9, z0 + 0.4], [x, y0 + 0.9, z1 - 0.4], 0.06, '#c9ced3');
    const yaw = s.access === z1 ? 0 : Math.PI; // 카트 손잡이가 차로 쪽
    for (const lane of [x0 + 1.25, x0 + 3.75, x0 + 6.25]) { const n = 3 + Math.floor(R() * 4); for (let k = 0; k < n; k++) cartAt(lane, (s.access === z1 ? z0 + 1 : z1 - 1) + (s.access === z1 ? 1 : -1) * k * 0.32, yaw); }
    blockers.push([x0, z0, x1, z1]);
  }
  // 입구 캐노피: 기둥 4 + 지붕 + 처마 띠(노랑) + 밑면 조명은 간판 쪽(밝은 재질)
  const cn = L.canopy;
  for (const x of [cn.x0 + 0.6, cn.x0 + 8, cn.x1 - 8, cn.x1 - 0.6]) { K.box(0.45, cn.y, 0.45, x, y0 + cn.y / 2, cn.z0 + 0.5, '#e9e4d8'); K.box(0.7, 0.3, 0.7, x, y0 + 0.15, cn.z0 + 0.5, '#9a9c98'); blockers.push([x - 0.3, cn.z0 + 0.2, x + 0.3, cn.z0 + 0.8]); }
  K.box(cn.x1 - cn.x0 + 0.6, 0.7, cn.z1 - cn.z0 + 0.3, (cn.x0 + cn.x1) / 2, y0 + cn.y + 0.35, (cn.z0 + cn.z1) / 2, C.green);
  K.box(cn.x1 - cn.x0 + 0.7, 0.18, 0.2, (cn.x0 + cn.x1) / 2, y0 + cn.y + 0.75, cn.z0 - 0.05, C.yellow);
  K.box(8.3, 2.25, 0.25, S.door.x + 1, y0 + cn.y + 1.7, cn.z0 + 0.5, C.deep); // 입구 간판 뒤판
  // 입구 옆 카트 보관(처마 밑, 문 서쪽): 손잡이 바깥, 두 줄
  for (const z of [493.3, 495.6]) { K.bar([cn.x0 + 0.8, y0 + 0.9, z - 0.55], [L.walkway.x0 - 1.4, y0 + 0.9, z - 0.55], 0.05, '#c9ced3'); for (let k = 0; k < 13; k++) cartAt(cn.x0 + 1.2 + k * 0.33, z, -Math.PI / 2); }
  // 자동문 틀 · 출구 처마
  K.box(9.2, 0.4, 0.4, S.door.x, y0 + 3.6, L.tower.z0 - 0.1, '#2b3036');
  for (const s of [-1, 1]) K.box(0.4, 3.6, 0.4, S.door.x + s * 4.4, y0 + 1.8, L.tower.z0 - 0.1, '#2b3036');
  K.box(11, 0.5, 6.2, L.exitDoor.x, y0 + 4.2, 497.0, C.green); K.box(11.1, 0.16, 0.2, L.exitDoor.x, y0 + 4.5, 493.9, C.yellow);
  for (const s of [-1, 1]) K.box(0.3, 4.0, 0.3, L.exitDoor.x + s * 5.2, y0 + 2.0, 494.3, '#e9e4d8');
  K.box(L.exitDoor.w + 0.6, 0.3, 0.3, L.exitDoor.x, y0 + 3.15, 499.9, '#2b3036');
  for (const s of [-1, 1]) blockers.push([L.exitDoor.x + s * 5.2 - 0.25, 494.05, L.exitDoor.x + s * 5.2 + 0.25, 494.55]);
  // 풍선 아치(오픈 기념) — 입구 앞 횡단보도 위
  { const ax = S.door.x, az = L.fire.z0 - 0.6, span = 4.8, hgt = 3.2, cols = [C.red, '#ffffff', C.yellow, C.green];
    for (let i = 0; i <= 30; i++) { const t = i / 30, a = Math.PI * t, x = ax - Math.cos(a) * span, y = y0 + 0.6 + Math.sin(a) * hgt; K.sphere(0.4, x, y, az, cols[i % 4], { ws: 8, hs: 6 }); K.sphere(0.36, x, y, az + 0.48, cols[(i + 2) % 4], { ws: 8, hs: 6 }); }
    for (const s of [-1, 1]) { K.box(0.6, 0.6, 1.2, ax + s * span, y0 + 0.3, az + 0.27, '#3b4046'); blockers.push([ax + s * span - 0.5, az - 0.4, ax + s * span + 0.5, az + 1.0]); } }
  // 깃대(깃발은 따로 흔들리는 메시)
  const flagSpots = [];
  for (let x = L.x0 + 10; x < S.x1 - 4; x += 7) { if (Math.abs(x - S.door.x) < 8 || Math.abs(x - L.exitDoor.x) < 5) continue; flagSpots.push([x, L.walkFront.z0 + 0.9]); }
  for (const d of L.drives) for (const z of [d.z0 - 1.2, d.z1 + 1.2]) for (const x of [L.roadEdgeX + 1.6, L.x0 - 0.6]) flagSpots.push([x, z]);
  for (const [x, z] of flagSpots) { K.cyl(0.035, 0.035, 4.4, x, y0 + 2.2, z, '#d8dcdf', { seg: 5 }); K.box(0.35, 0.08, 0.35, x, y0 + 0.04, z, '#555'); }
  // 하역장: 문 5칸(셔터는 현수막 아틀라스), 범퍼, 문 위 등, 트럭 3대
  const docks = []; for (let i = 0; i < 6; i++) docks.push(L.dock.x0 + 8 + i * 10);
  for (const x of docks) { K.box(0.4, 0.5, 0.3, x - 1.7, y0 + 1.1, S.z1 + 0.15, '#1b1b1d'); K.box(0.4, 0.5, 0.3, x + 1.7, y0 + 1.1, S.z1 + 0.15, '#1b1b1d'); K.box(4.2, 1.2, 0.5, x, y0 + 0.6, S.z1 + 0.25, '#7d8186'); K.box(0.5, 0.25, 0.4, x, y0 + 5.1, S.z1 + 0.25, '#fff2c8', { glow: 1 }); }
  const truck = (x, z0) => { // 냉동 탑차(13.6 m 트레일러) 문 쪽(+z 반대)으로 후진 주차. 앞 = +z
    const tl = 13.6, w = 2.5, zc = z0 + tl / 2;
    K.box(w, 2.9, tl, x, y0 + 1.25 + 1.45, zc, '#f1ece2'); K.box(w + 0.02, 0.5, tl - 0.4, x, y0 + 1.5, zc, C.green); K.box(w + 0.03, 0.1, tl - 0.4, x, y0 + 1.8, zc, C.kraft);
    K.box(w * 0.92, 0.25, tl, x, y0 + 1.1, zc, '#2b2e33');
    for (const zw of [z0 + 1.5, z0 + 2.8, z0 + 4.1]) for (const s of [-1, 1]) K.cyl(0.5, 0.5, 0.4, x + s * 1.0, y0 + 0.5, zw, '#1b1b1d', { seg: 10 });
    const cz = z0 + tl + 2.2; K.box(w, 2.7, 2.6, x, y0 + 0.9 + 1.35, cz, C.green); K.box(w - 0.2, 1.0, 0.05, x, y0 + 2.7, cz + 1.31, GLASS); K.box(w + 0.05, 0.3, 0.2, x, y0 + 0.75, cz + 1.35, '#22262a');
    for (const s of [-1, 1]) { K.cyl(0.5, 0.5, 0.4, x + s * 1.0, y0 + 0.5, cz, '#1b1b1d', { seg: 10 }); K.box(0.3, 0.16, 0.05, x + s * 0.95, y0 + 1.2, cz + 1.33, '#fff4d0', { glow: 0.4 }); }
    K.box(1.0, 0.25, 1.5, x, y0 + 1.15, z0 + tl + 0.5, '#2b2e33');
    blockers.push([x - w / 2, z0, x + w / 2, cz + 1.4]);
    return { x, z0, tl, w };
  };
  const trucks = [truck(docks[0], S.z1 + 0.8), truck(docks[2], S.z1 + 0.8), truck(docks[5], S.z1 + 0.8)];
  // 옥상: 난간 띠, 공조기, 채광창 — 지붕 높이(외피와 같게)
  const roofY = y0 + S.h;
  for (let i = 0; i < 14; i++) { const x = S.x0 + 8 + (i % 7) * 11, z = S.z0 + 25 + Math.floor(i / 7) * 55 + (i % 2) * 6; K.box(3.4, 1.7, 2.2, x, roofY + 0.85, z, '#c7cbcf'); K.box(1.0, 0.25, 1.0, x - 0.8, roofY + 1.82, z, '#8e959b'); K.box(1.0, 0.25, 1.0, x + 0.8, roofY + 1.82, z, '#8e959b'); }
  for (let ix = 0; ix < 6; ix++) for (let iz = 0; iz < 5; iz++) K.box(2.2, 0.3, 4.4, S.x0 + 10 + ix * 13, roofY + 0.15, S.z0 + 14 + iz * 22, '#dbe6ee');
  const sGeo = K.geometry();
  const struct = new THREE.Mesh(sGeo, kitMat); struct.name = 'depot-lot-structures'; root.add(struct);
  disposables.push(sGeo);

  // ---------- 아틀라스: 현수막·셔터·트럭 도장·바닥 글씨 (조명 받음, 바닥 글씨는 알파) ----------
  const Q = quads();
  // 정면 세로 현수막 5장 (출구와 입구 탑 사이)
  for (let i = 0; i < 5; i++) Q.sign(-547 + i * 6, y0 + 4.9, S.z0 - 0.12, 1.7, 6.6, Math.PI, BS['vb' + i]);
  for (let i = 0; i < 2; i++) Q.sign(-529 + i * 6 + 3, y0 + 4.9, S.z0 - 0.12, 1.7, 6.6, Math.PI, BS['vb' + ((i + 2) % 5)]);
  // 서쪽 벽(대왕판교로 쪽) 가로 현수막, 동쪽 벽(고속도로 쪽) 가로 현수막
  Q.sign(S.x0 - 0.12, y0 + 3.6, 540, 30, 30 / 4.8, -Math.PI / 2, BS.hb0);
  Q.sign(S.x1 + 0.12, y0 + 3.6, 540, 30, 30 / 4.8, Math.PI / 2, BS.hb1);
  Q.sign(-500, y0 + 6.9, S.z1 + 0.12, 24, 24 / 4.8, 0, BS.hb2); // 뒷벽(하역장)
  // 하역장 셔터
  for (const x of docks) Q.sign(x, y0 + 2.4, S.z1 + 0.06, 3.6, 4.0, 0, BS.dock);
  // 트럭 옆면 도장 (양쪽) + 뒷문
  for (const t of trucks) { const zc = t.z0 + t.tl / 2; Q.sign(t.x - t.w / 2 - 0.02, y0 + 2.9, zc, t.tl - 1, (t.tl - 1) / 3, -Math.PI / 2, BS.truck); Q.sign(t.x + t.w / 2 + 0.02, y0 + 2.9, zc, t.tl - 1, (t.tl - 1) / 3, Math.PI / 2, BS.truck, { flipU: false }); }
  // 풍선 아치 글씨판
  Q.sign(S.door.x, y0 + 3.35, L.fire.z0 - 0.9, 3.4, 0.85, Math.PI, BS.balloon); Q.sign(S.door.x, y0 + 3.35, L.fire.z0 + 0.15, 3.4, 0.85, 0, BS.balloon);
  // 바닥 글씨
  const dy = y0 + 0.085;
  for (const s of ST) {
    if (s.corral) continue;
    const head = s.back > s.access ? 0 : Math.PI; // 차로에서 들어오며 읽는 방향
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2 + (s.back > s.access ? 0.9 : -0.9);
    const k = s.kind === 'dis' ? 'st_dis' : s.kind === 'family' ? 'st_family' : s.kind === 'ev' ? 'st_ev' : s.kind === 'kei' ? 'st_kei' : null;
    if (k) Q.decal(cx, dy, cz, 2.1, 1.05, head, BS[k]);
  }
  Q.decal((L.walkway.x0 + L.walkway.x1) / 2, dy, 476.5, 5.2, 2.6, 0, BS.st_walk);
  Q.decal((L.walkway.x0 + L.walkway.x1) / 2, dy, 445, 5.2, 2.6, 0, BS.st_walk);
  Q.decal((L.walkway.x0 + L.walkway.x1) / 2, dy, 426, 5.2, 2.6, 0, BS.st_depot);
  Q.decal(-530, dy, (L.fire.z0 + L.fire.z1) / 2, 6, 3, -Math.PI / 2, BS.st_nostop);
  Q.decal(-570, dy, (L.fire.z0 + L.fire.z1) / 2, 6, 3, -Math.PI / 2, BS.st_slow);
  for (const d of L.drives) { Q.decal(L.x0 - 3, dy, (d.z0 + d.z1) / 2 + 2, 3.6, 1.8, Math.PI / 2, BS.st_in); Q.decal(L.x0 - 3, dy, (d.z0 + d.z1) / 2 - 2, 3.6, 1.8, -Math.PI / 2, BS.st_out); } // 우측 통행: 들어오는 차(동쪽)는 남쪽 반
  for (const z of [431, 458]) Q.decal((L.westLane.x0 + L.westLane.x1) / 2, dy, z, 5, 2.5, Math.PI, BS.st_slow);
  Q.decal(S.door.x, y0 + 0.13, 495.6, 5, 2.5, 0, BS.st_shop);
  for (const s of corrals) Q.decal(s.x0 + SW * 1.5, dy, s.access === s.z1 ? s.z1 + 1.4 : s.z0 - 1.4, 3, 1.5, s.access === s.z1 ? Math.PI : 0, BS.st_cart);
  const bGeo = Q.geometry();
  const bMat = new THREE.MeshLambertMaterial({ map: ban.tex, alphaTest: 0.45, transparent: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, side: THREE.DoubleSide });
  const banners = new THREE.Mesh(bGeo, bMat); banners.name = 'depot-lot-banners'; root.add(banners);
  disposables.push(bGeo, bMat);

  // ---------- 밝은 간판(간판 아틀라스, MeshBasic): 입구·출구 처마 글씨, 카트 보관소, 영업시간, 처마 밑 조명 ----------
  const G = quads();
  G.sign(S.door.x + 1, y0 + cn.y + 0.7 + 1.0, cn.z0 + 0.35, 8, 2, Math.PI, SS.enter); // 처마 위에 선 입구 간판
  G.sign(L.exitDoor.x, y0 + 4.2, 493.85, 6, 1.5, Math.PI, SS.exit);
  G.sign(S.door.x - 7.5, y0 + 3.6, cn.z0 + 1.0, 3.6, 0.9, Math.PI, SS.cart);
  G.sign(S.door.x + 6.2, y0 + 2.2, L.tower.z0 - 0.06, 2.6, 0.65, Math.PI, SS.hours);
  for (const s of corrals) G.sign(s.x0 + SW * 1.5, y0 + 2.95, s.access === s.z1 ? s.z1 + 0.26 : s.z0 - 0.26, 3.2, 0.8, s.access === s.z1 ? 0 : Math.PI, SS.cart);
  // 처마 밑 조명 패널(아래를 봄)
  for (let x = cn.x0 + 2; x < cn.x1 - 1; x += 4) for (const z of [cn.z0 + 2.5, cn.z0 + 6.5]) G.face([x, y0 + cn.y - 0.01, z], [0.9, 0, 0], [0, 0, -0.35], SS.canopyLight);
  G.face([L.exitDoor.x, y0 + 3.94, 497], [2.5, 0, 0], [0, 0, -0.4], SS.canopyLight);
  const gGeo = G.geometry();
  const gMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const glow = new THREE.Mesh(gGeo, gMat); glow.name = 'depot-lot-signs'; root.add(glow);
  disposables.push(gGeo, gMat);

  // ---------- 자동문(입구 2짝·출구 2짝): 가까이 가면 열림 ----------
  const D = quads();
  const doorW = 2.0, doorH = 3.3;
  const doorDefs = [[S.door.x - doorW / 2, L.tower.z0 - 0.08, -1], [S.door.x + doorW / 2, L.tower.z0 - 0.08, 1], [S.door.x - doorW * 1.5, L.tower.z0 - 0.05, 0], [S.door.x + doorW * 1.5, L.tower.z0 - 0.05, 0],
    [L.exitDoor.x - 1.25, S.z0 - 0.08, -1], [L.exitDoor.x + 1.25, S.z0 - 0.08, 1]];
  for (const [x, z] of doorDefs) D.sign(x, y0 + doorH / 2 + 0.05, z, doorW, doorH, Math.PI, SS.glass);
  const dGeo = D.geometry();
  const dBase = Float32Array.from(dGeo.attributes.position.array);
  const dMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false, transparent: true, opacity: 0.92, depthWrite: false });
  const doors = new THREE.Mesh(dGeo, dMat); doors.name = 'depot-lot-doors'; root.add(doors);
  disposables.push(dGeo, dMat);
  const doorOpen = [0, 0];
  function setDoors(i, v) { // i: 0 입구, 1 출구
    const p = dGeo.attributes.position, idxs = i === 0 ? [[0, -1], [1, 1]] : [[4, -1], [5, 1]];
    for (const [qd, s] of idxs) for (let k = 0; k < 4; k++) { const vi = qd * 4 + k; p.setX(vi, dBase[vi * 3] + s * v * doorW * 0.95); }
    p.needsUpdate = true;
  }

  // ---------- 깃발(바람에 흔들림, 인스턴스 1) ----------
  const fGeo = new THREE.PlaneGeometry(0.75, 3.0, 4, 1); fGeo.translate(0.4, 2.8, 0);
  const fMat = new THREE.MeshLambertMaterial({ map: ban.tex, side: THREE.DoubleSide });
  const fTime = { value: 0 };
  const fl0 = BS.flag0, fW = fl0.u1 - fl0.u0, fH = fl0.v1 - fl0.v0;
  fMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = fTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aU0;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat ph = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.23;\ntransformed.z += sin(uTime * 3.1 + ph + position.x * 2.4) * 0.16 * (position.x + 0.05);')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vec2(aU0 + uv.x * ${fW.toFixed(6)}, ${fl0.v0.toFixed(6)} + uv.y * ${fH.toFixed(6)});\n#endif`);
  };
  fMat.customProgramCacheKey = () => 'depot-ext-flag-v1';
  const flags = new THREE.InstancedMesh(fGeo, fMat, flagSpots.length);
  const aU0 = new Float32Array(flagSpots.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  flagSpots.forEach(([x, z], i) => { const yaw = x < L.x0 ? Math.PI / 2 : 0.3 + (i % 3) * 0.2; m4.compose(new THREE.Vector3(x, y0, z), q.setFromAxisAngle(up, yaw), sc); flags.setMatrixAt(i, m4); aU0[i] = BS['flag' + (i % 4)].u0; });
  fGeo.setAttribute('aU0', new THREE.InstancedBufferAttribute(aU0, 1));
  flags.name = 'depot-lot-flags'; root.add(flags);
  disposables.push(fGeo, fMat);

  // ---------- 가로등 불빛 웅덩이 (밤) ----------
  const pool = lightPoolMaterial({ color: '#fff1cf', intensity: 0.42, radius: 9, radiusZ: 7, focusX: 1.45 });
  const plGeo = new THREE.PlaneGeometry(1, 1); plGeo.rotateX(-Math.PI / 2); plGeo.scale(22, 1, 18);
  const pools = new THREE.InstancedMesh(plGeo, pool, poles.length + 3);
  poles.forEach(([x, z], i) => { m4.makeTranslation(x, y0 + 0.1, z); pools.setMatrixAt(i, m4); });
  [[S.door.x - 6, cn.z0 + 4], [S.door.x + 6, cn.z0 + 4], [L.exitDoor.x, 495]].forEach(([x, z], k) => { m4.makeTranslation(x, y0 + 0.1, z); pools.setMatrixAt(poles.length + k, m4); });
  pools.name = 'depot-lot-pools'; pools.visible = false; pools.frustumCulled = false; root.add(pools);
  disposables.push(plGeo, pool);

  // ---------- 주차 차량 (종류별 인스턴스, 불 안 켜진 재질) ----------
  const carMat = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true });
  carMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float tint;').replace('#include <color_vertex>', 'vColor = vec4(1.0);\nvColor.rgb *= color.rgb;\n#ifdef USE_INSTANCING_COLOR\nvColor.rgb *= mix(vec3(1.0), instanceColor.rgb, tint);\n#endif');
  };
  carMat.customProgramCacheKey = () => 'depot-parked-car-v1';
  disposables.push(carMat);
  const KIND_W = [['sedan', 30], ['suv', 26], ['hatch', 10], ['kei', 10], ['van', 8], ['ev', 16]];
  const parked = {};
  for (const s of ST) {
    if (s.corral) continue;
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    const dEnt = Math.hypot(cx - S.door.x, cz - 490);
    let p = 0.18 + 0.7 * Math.exp(-dEnt / 38);
    if (s.kind === 'dis') p = 0.5; else if (s.kind === 'family') p = 0.6; else if (s.kind === 'ev') p = 0.55;
    if (R() > p) continue;
    const k = s.kind === 'kei' ? 'kei' : s.kind === 'ev' ? 'ev' : pickWeighted(KIND_W, R());
    const noseIn = R() < 0.5; // 한국 마트: 후진 주차 반, 전진 반
    const toBack = s.back > s.access ? 0 : Math.PI; // 앞코가 뒤 선을 보는 yaw
    const yaw = (noseIn ? toBack : toBack + Math.PI) + (R() - 0.5) * 0.06;
    const len = KINDS[k].L;
    const off = (s.back > s.access ? 1 : -1) * (2.5 - len / 2 - 0.25); // 뒤 선 쪽으로 붙임
    (parked[k] ||= []).push({ x: cx + (R() - 0.5) * 0.25, z: cz + off, yaw, color: pickWeighted(KINDS[k].paint, R()) });
    blockers.push([cx - KINDS[k].W / 2 - 0.1, cz + off - len / 2, cx + KINDS[k].W / 2 + 0.1, cz + off + len / 2]);
  }
  const cars = [];
  const col = new THREE.Color();
  for (const [k, list] of Object.entries(parked)) {
    const im = new THREE.InstancedMesh(kindGeometry(k), carMat, list.length);
    list.forEach((c, i) => { m4.compose(new THREE.Vector3(c.x, y0 + 0.05, c.z), q.setFromAxisAngle(up, c.yaw), sc); im.setMatrixAt(i, m4); im.setColorAt(i, col.set(c.color)); });
    im.name = 'depot-parked-' + k; root.add(im); cars.push(im);
  }
  const carCount = cars.reduce((a, m) => a + m.count, 0);

  let t = 0;
  return {
    root, blockers, stalls: ST.length, cars: carCount, poles: poles.length,
    update(dt, pos, night) {
      t += dt; fTime.value = t;
      pools.visible = night > 0.01; pool.uniforms.uNight.value = night;
      if (pos) {
        const want = [Math.hypot(pos.x - S.door.x, pos.z - (L.tower.z0 - 1)) < 6 ? 1 : 0, Math.hypot(pos.x - L.exitDoor.x, pos.z - (S.z0 - 1)) < 5 ? 1 : 0];
        for (let i = 0; i < 2; i++) { const v = doorOpen[i], tv = want[i]; if (v !== tv) { doorOpen[i] = v + Math.sign(tv - v) * Math.min(Math.abs(tv - v), dt * 2.2); setDoors(i, doorOpen[i]); } }
      }
    },
    dispose() { root.removeFromParent(); for (const c of cars) c.dispose(); flags.dispose(); pools.dispose(); for (const d of disposables) d.dispose(); },
  };
}
