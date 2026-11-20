// [gentle-monster] 실내 골격: 층 슬래브(구멍 포함) · 안쪽 벽(띠창 개구) · 천장 · 기둥 · 계단실 · 에스컬레이터 · 승강로.
//   걷기용 데이터: regions(바닥 면/경사) + colliders(AABB/원) — walker.js 가 쓴다.
import * as THREE from 'three';
import { Builder, ringShape, ringAt } from './geo.js';
import { PLAN as P } from './plan.js';

const FY = P.floorY;
export const LEVELS = [1, 2, 3, 5]; // 일반 개방 층
export const LEVEL_NAME = { 1: '1F · PROJECT SPACE · TAMBURINS', 2: '2F · GENTLE MONSTER', 3: '3F · ATiiSSU · NUFLAAT · TAMBURINS', 4: '4F', 5: '5F · NUDAKE TEAHOUSE' };

/** 층 바닥 윤곽 (점 배열) — 1층은 유리선, 위층은 안쪽 피부 */
export function outlineFor(ring, n, inset = 0, glassOff = null) {
  const pts = [];
  for (let i = 0; i < ring.N; i++) {
    const s = ring.len[i];
    const off = n === 1 ? (glassOff(s) - 0.3 - inset) : (P.skin - inset);
    pts.push(ringAt(ring, s, off));
  }
  return pts;
}
export function pointInPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

export function buildShell(mats, ext, imats) {
  const B = new Builder();
  for (const k of ['floor1', 'floor3', 'floor4', 'floor5']) B.project(k, 4); B.project('floor2', 2.2);
  for (const k of ['ceil1', 'ceil2', 'ceil3', 'ceil5']) B.project(k, 2.4);
  B.project('conc', 2.4).project('plaster', 3);
  const ring = ringShape(P.A, P.B, P.N, 360);
  const regions = [], colliders = [], levelsInfo = {};
  const holes = { 1: [], 2: [], 3: [], 4: [], 5: [] };

  // ---- 구멍 (슬래브) ----
  const S = P.stair, eA = P.escA, eB = P.escB;
  const H_SH = [S.x0, S.x1, S.z0, S.z1];
  for (const n of [2, 3, 4, 5]) holes[n].push(H_SH);
  holes[2].push([eA.x0, eA.x1, eA.zTop, 3.7]);
  holes[3].push([eB.x0, eB.x1, -0.4, eB.zTop + 0.3]);
  // 엘리베이터 승강로
  const EL = P.elev; for (const n of [1, 2, 3, 4, 5]) holes[n].push([EL.x0, EL.x1, EL.z0, EL.z1]);

  // ---- 층 슬래브 + 바닥/천장 면 ----
  const slabs = {};
  for (const n of [1, 2, 3, 4, 5]) {
    const out = outlineFor(ring, n, 0, ext.glassOff).map((q) => [q[0], q[1]]);
    const shp = new THREE.Shape(); out.forEach((q, i) => (i ? shp.lineTo(q[0], -q[1]) : shp.moveTo(q[0], -q[1])));
    for (const [x0, x1, z0, z1] of holes[n]) { const h = new THREE.Path(); h.moveTo(x0, -z0); h.lineTo(x0, -z1); h.lineTo(x1, -z1); h.lineTo(x1, -z0); h.closePath(); shp.holes.push(h); }
    slabs[n] = { shp, out };
    const y = FY[n];
    const gt = new THREE.ShapeGeometry(shp); gt.rotateX(-Math.PI / 2); gt.translate(0, y, 0);
    const floorKey = { 1: 'floor1', 2: 'floor2', 3: 'floor3', 4: 'floor4', 5: 'floor5' }[n];
    B.add(floorKey, gt, { color: 0xffffff });
    // 슬래브 아래면 = 아래층 천장 (2→1층, 3→2층, 4→3층) · 5층 슬래브 아래는 비개방(4층)이라 생략
    const ceilKey = { 2: 'ceil1', 3: 'ceil2', 4: 'ceil3' }[n];
    if (ceilKey) { const gb = new THREE.ShapeGeometry(shp); gb.rotateX(Math.PI / 2); gb.translate(0, y - P.SLAB, 0); B.add(ceilKey, gb, { color: 0xffffff }); }
  }
  // 5층 지붕 슬래브 아래면 (천장)
  { const sp = slabs[5]; const gb = new THREE.ShapeGeometry(sp.shp); gb.rotateX(Math.PI / 2); gb.translate(0, 22.6, 0); B.add('ceil5', gb, { color: 0xffffff }); }

  // 슬래브 구멍 테두리(콘크리트 면)
  const rim = (x0, x1, z0, z1, y, th = 0.6) => { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0; B.box('conc', w + 0.24, th, 0.12, { x: cx, y: y - th / 2, z: z0 - 0.06 }); B.box('conc', w + 0.24, th, 0.12, { x: cx, y: y - th / 2, z: z1 + 0.06 }); B.box('conc', 0.12, th, d, { x: x0 - 0.06, y: y - th / 2, z: cz }); B.box('conc', 0.12, th, d, { x: x1 + 0.06, y: y - th / 2, z: cz }); };
  for (const n of [2, 3, 4, 5]) for (const h of holes[n]) rim(h[0], h[1], h[2], h[3], FY[n]);

  // ---- 안쪽 벽 (피부) — 2~5층, 띠창 개구 ----
  const wallCol = { 2: 0x15161a, 3: 0xe6e3dc, 4: 0xb9b6ae, 5: 0x2a2b22 };
  for (let k = 0; k < 4; k++) {
    const n = k + 2, y0 = FY[n], y1 = n === 5 ? 22.6 : FY[n + 1] - P.SLAB;
    const ya = P.t0 + k * P.TIER_H + 0.4 * P.TIER_H + 0.05, yb = P.t0 + k * P.TIER_H + 0.685 * P.TIER_H - 0.05;
    const pills = ext.pills[k]; const SEG = 360;
    const pos = [], pos2 = [], pos3 = [];
    const inPill = (s0, s1) => pills.some(([a, b]) => s0 >= a + 0.9 && s1 <= b - 0.9);
    const quad = (arr, a, b, ya1, yb1) => {
      const q0 = ringAt(ring, a, P.skin), q1 = ringAt(ring, b, P.skin);
      // 안쪽(원점 쪽)을 보는 삼각형 두 개
      const A = [q0[0], ya1, q0[1]], Bq = [q1[0], ya1, q1[1]], C = [q1[0], yb1, q1[1]], D = [q0[0], yb1, q0[1]];
      arr.push(...A, ...C, ...Bq, ...A, ...D, ...C);
    };
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * ring.perim, b = ((j + 1) / SEG) * ring.perim;
      if (inPill(a, b)) { quad(pos, a, b, y0, ya); quad(pos, a, b, yb, y1); } else quad(pos, a, b, y0, y1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    B.add('plaster', g, { color: wallCol[n] });
  }

  // ---- 기둥 (정사각 노출 콘크리트) ----
  const colsXZ = [];
  for (const x of [-13.5, -4.5, 4.5, 13.5]) for (const z of [-8.5, 0.5, 9]) {
    if (x > 8 && z < -5) continue; // 계단실
    if (x > -3 && x < 3.5 && z < -8) continue; // 승강로
    colsXZ.push([x, z]);
  }
  for (const n of [1, 2, 3, 5]) {
    const y0 = FY[n], y1 = n === 1 ? P.t0 : n === 5 ? 22.6 : FY[n + 1] - P.SLAB;
    for (const [x, z] of colsXZ) {
      if (n === 1 && !pointInPoly(slabs[1].out, x, z)) continue;
      if (n === 2 && x > eA.x0 - 0.9 && x < eA.x1 + 0.9 && z > eA.zTop - 1 && z < 8.6) continue;
      if (n === 3 && x > eB.x0 - 0.9 && x < eB.x1 + 0.9 && z > -5 && z < 5.6) continue;
      B.box('conc', 0.9, y1 - y0, 0.9, { x, y: (y0 + y1) / 2, z });
      colliders.push({ t: 'a', x0: x - 0.45, x1: x + 0.45, z0: z - 0.45, z1: z + 0.45, y0: y0 - 0.1, y1: y1 });
    }
  }
  // 4층(비개방) 기둥은 안 보이는 곳 → 생략

  // ---- 계단실 ----
  const stairRegions = [], lev = [1, 2, 3, 4, 5];
  const xa0 = S.x0 + 0.1, xa1 = S.x0 + 2.3, xb0 = S.x1 - 2.3, xb1 = S.x1 - 0.1, zS = S.z1 - 0.1, zM = S.z0 + 2.7;
  for (let i = 0; i < 4; i++) {
    const ya = FY[lev[i]], yb = FY[lev[i + 1]], mid = (ya + yb) / 2, steps = 15, run = zS - zM;
    // 계단 A (남→북, ya→mid) , 계단 B (북→남, mid→yb)
    for (let s = 0; s < steps; s++) {
      const f0 = s / steps, f1 = (s + 1) / steps, zA = zS - run * f1, yT = ya + (mid - ya) * f1;
      B.box('conc', xa1 - xa0, yT - (ya - 0.2), run / steps, { x: (xa0 + xa1) / 2, y: ((ya - 0.2) + yT) / 2, z: zA + run / steps / 2, color: 0xd8d6d0 });
      const yB = mid + (yb - mid) * f1, zB = zM + run * f1;
      B.box('conc', xb1 - xb0, yB - (mid - 0.2), run / steps, { x: (xb0 + xb1) / 2, y: ((mid - 0.2) + yB) / 2, z: zB - run / steps / 2, color: 0xd8d6d0 });
    }
    // 중간 랜딩
    B.box('conc', S.x1 - S.x0, 0.3, S.z0 + 2.7 - S.z0 + 0.0, { x: (S.x0 + S.x1) / 2, y: mid - 0.15, z: S.z0 + 1.35, color: 0xd0cec8 });
    stairRegions.push({ t: 'r', x0: xa0, x1: xa1, z0: zM, z1: zS, y0: mid, y1: ya, axis: 'z' }); // z=z0 → y0, z=z1 → y1
    stairRegions.push({ t: 'r', x0: xb0, x1: xb1, z0: zM, z1: zS, y0: mid, y1: yb, axis: 'z' });
    stairRegions.push({ t: 'f', x0: S.x0 + 0.1, x1: S.x1 - 0.1, z0: S.z0 + 0.1, z1: zM, y: mid });
    // 난간 (가운데 + 안쪽)
    B.box('metal', 0.08, 1.0, run + 0.5, { x: (xa1 + xb0) / 2, y: (ya + mid) / 2 + 0.7, z: (zM + zS) / 2, color: 0x222428 });
  }
  regions.push(...stairRegions);
  // 계단실 바닥(각 층 문앞 평면)
  for (const n of [1, 2, 3, 4, 5]) regions.push({ t: 'f', x0: S.x0 + 0.1, x1: S.x1 - 0.1, z0: zS, z1: S.z1 + 0.9, y: FY[n] });
  // 계단실 벽 (콘크리트, 층마다 남쪽 문 개구, 4층은 막힘)
  const wallH = FY[5] + 3.4 - 0;
  B.box('conc', 0.3, wallH, S.z1 - S.z0, { x: S.x0 - 0.15, y: wallH / 2, z: (S.z0 + S.z1) / 2 }); colliders.push({ t: 'a', x0: S.x0 - 0.3, x1: S.x0, z0: S.z0, z1: S.z1, y0: 0, y1: 30 });
  B.box('conc', 0.3, wallH, S.z1 - S.z0, { x: S.x1 + 0.15, y: wallH / 2, z: (S.z0 + S.z1) / 2 }); colliders.push({ t: 'a', x0: S.x1, x1: S.x1 + 0.3, z0: S.z0, z1: S.z1, y0: 0, y1: 30 });
  B.box('conc', S.x1 - S.x0 + 0.6, wallH, 0.3, { x: (S.x0 + S.x1) / 2, y: wallH / 2, z: S.z0 - 0.15 }); colliders.push({ t: 'a', x0: S.x0 - 0.3, x1: S.x1 + 0.3, z0: S.z0 - 0.3, z1: S.z0, y0: 0, y1: 30 });
  // 남쪽 벽: 1·2·3·5층만 문 개구(높이 2.7m), 4층은 막힘 (STAFF ONLY)
  { const zw = S.z1 + 0.15, W = S.x1 - S.x0 + 0.6, cx = (S.x0 + S.x1) / 2;
    const solid = [[FY[1] + 2.7, FY[2]], [FY[2] + 2.7, FY[3]], [FY[3] + 2.7, FY[5]], [FY[5] + 2.7, wallH]];
    for (const [a, b] of solid) { B.box('conc', W, b - a, 0.3, { x: cx, y: (a + b) / 2, z: zw }); }
    // 층 바닥 아래 (문 아래) 벽은 슬래브가 대신함. 문 위 벽 + 4층 막힘 충돌
    colliders.push({ t: 'a', x0: S.x0 - 0.3, x1: S.x1 + 0.3, z0: zw - 0.15, z1: zw + 0.15, y0: FY[3] + 0.5, y1: FY[5] - 0.2 });
    // 계단실 문 사인
    B.box('lamp', 0.9, 0.22, 0.04, { x: cx, y: FY[1] + 2.45, z: zw + 0.17, color: 0xffe9b8 });
  }
  // 엘리베이터 (화물 엘리베이터 느낌 — 승강로 벽 + 문 판)
  { const w = EL.x1 - EL.x0, d = EL.z1 - EL.z0, wh = FY[5] + 3.4;
    B.box('conc', w + 0.5, wh, 0.25, { x: (EL.x0 + EL.x1) / 2, y: wh / 2, z: EL.z0 - 0.12 }); B.box('conc', 0.25, wh, d, { x: EL.x0 - 0.12, y: wh / 2, z: (EL.z0 + EL.z1) / 2 }); B.box('conc', 0.25, wh, d, { x: EL.x1 + 0.12, y: wh / 2, z: (EL.z0 + EL.z1) / 2 });
    colliders.push({ t: 'a', x0: EL.x0 - 0.25, x1: EL.x1 + 0.25, z0: EL.z0 - 0.25, z1: EL.z1 + 0.05, y0: 0, y1: 30 });
    // 층마다 문 (패널식 철문, 약간 열린 느낌)
    for (const n of [1, 2, 3, 5]) { B.box('metal', 3.2, 2.6, 0.12, { x: (EL.x0 + EL.x1) / 2, y: FY[n] + 1.3, z: EL.z1 + 0.04, color: 0x9a9da0 }); B.box('frame', 0.05, 2.6, 0.16, { x: (EL.x0 + EL.x1) / 2, y: FY[n] + 1.3, z: EL.z1 + 0.05 }); B.box('lamp', 0.22, 0.1, 0.04, { x: EL.x1 + 0.5, y: FY[n] + 1.4, z: EL.z1 + 0.06, color: 0xffb65a }); } }

  // ---- 에스컬레이터 ----
  function escalator(e, yBot, yTop, north) {
    // north=true: 아래(zBot) 쪽이 남, 위(zTop) 쪽이 북 (z 가 줄어들며 올라감)
    const zA = e.zBot, zB = e.zTop, run = Math.abs(zA - zB), dirz = Math.sign(zB - zA);
    const rise = yTop - yBot, ang = Math.atan2(rise, run), len = Math.hypot(run, rise);
    const cz = (zA + zB) / 2, cy = (yBot + yTop) / 2;
    const w = e.x1 - e.x0, lanes = [[e.x0 + 0.1, e.x0 + w / 2 - 0.1], [e.x0 + w / 2 + 0.1, e.x1 - 0.1]];
    for (const [lx0, lx1] of lanes) {
      const cx = (lx0 + lx1) / 2, lw = lx1 - lx0;
      // 계단 판 (경사 박스 + 발판 줄무늬)
      B.box('metal', lw, 0.28, len, { x: cx, y: cy - 0.3, z: cz, rx: dirz > 0 ? -ang : ang, color: 0x8b8e92 });
      const nT = 26; for (let s = 0; s < nT; s++) { const f = (s + 0.5) / nT, zz = zA + (zB - zA) * f, yy = yBot + rise * f; B.box('metal', lw - 0.08, 0.05, 0.1, { x: cx, y: yy + 0.01, z: zz, rx: dirz > 0 ? -ang : ang, color: s % 2 ? 0x2b2d30 : 0xb8bbbf }); }
      // 유리 난간 + 핸드레일
      for (const side of [lx0 - 0.02, lx1 + 0.02]) {
        B.box('glassP', 0.03, 0.9, len, { x: side, y: cy + 0.35, z: cz, rx: dirz > 0 ? -ang : ang, color: 0xffffff });
        B.box('frame', 0.08, 0.06, len, { x: side, y: cy + 0.82, z: cz, rx: dirz > 0 ? -ang : ang });
      }
      regions.push({ t: 'r', x0: lx0 + 0.08, x1: lx1 - 0.08, z0: Math.min(zA, zB), z1: Math.max(zA, zB), y0: zA < zB ? yBot : yTop, y1: zA < zB ? yTop : yBot, axis: 'z' });
    }
  }
  // 양 옆·가운데 난간 충돌 (아래 절반/위 절반으로 나눠 위층 바닥을 막지 않게)
  function escRails(e, yBot, yTop) {
    const zlo = Math.min(e.zBot, e.zTop), zhi = Math.max(e.zBot, e.zTop), zm = (zlo + zhi) / 2, rise = yTop - yBot;
    const lowIsLoZ = e.zBot < e.zTop; // 낮은 쪽이 z 작은 쪽인가
    const w = e.x1 - e.x0;
    for (const x of [e.x0 - 0.02, e.x0 + w / 2, e.x1 + 0.02]) {
      const lo = { t: 'a', x0: x - 0.07, x1: x + 0.07, z0: zlo, z1: zm, y0: (lowIsLoZ ? yBot : yTop) - 0.5, y1: (lowIsLoZ ? yBot : yTop) + (lowIsLoZ ? rise * 0.55 : -rise * 0.0 + 1.2) };
      const hi = { t: 'a', x0: x - 0.07, x1: x + 0.07, z0: zm, z1: zhi, y0: (lowIsLoZ ? yBot : yTop) - 0.5, y1: 0 };
      if (lowIsLoZ) { lo.y0 = yBot - 0.5; lo.y1 = yBot + rise * 0.6; hi.y0 = yBot + rise * 0.4; hi.y1 = yTop + 1.2; }
      else { hi.y0 = yBot - 0.5; hi.y1 = yBot + rise * 0.6; lo.y0 = yBot + rise * 0.4; lo.y1 = yTop + 1.2; }
      colliders.push(lo, hi);
    }
  }
  escalator(eA, FY[1], FY[2]); escalator(eB, FY[2], FY[3]); escRails(eA, FY[1], FY[2]); escRails(eB, FY[2], FY[3]);

  // ---- 걷기 영역 ----
  for (const n of [1, 2, 3, 5]) {
    const walkPoly = outlineFor(ring, n, 0.5, ext.glassOff).map((q) => [q[0], q[1]]);
    regions.push({ t: 'F', y: FY[n], poly: walkPoly, holes: holes[n].map((h) => [h[0] - 0.25, h[1] + 0.25, h[2] - 0.25, h[3] + 0.25]), n });
    levelsInfo[n] = { y: FY[n], poly: walkPoly };
  }
  // 1층 정문 포치 바깥은 별도(외부) — 1층 영역은 유리선 안쪽만; 정문 개구로 나가는 통로 영역 추가
  const door = ext.door; // 포치 안쪽 문 (x,z)
  regions.push({ t: 'f', x0: door.x - 1.9, x1: door.x + 1.9, z0: door.z - 0.6, z1: door.z + 9.0, y: 0.12 });
  regions.push({ t: 'f', x0: -60, x1: 60, z0: 17.8, z1: 24, y: 0.04, outdoor: true });
  // 외부(정원/보도/도로) 바닥은 y≈0 (넓은 한 장)
  regions.push({ t: 'O', y: 0.03 });

  const meshes = B.build({ ...mats, ...imats });
  return { meshes, regions, colliders, ring, holes, colsXZ, levelsInfo, tris: B.tris, wallCol };
}
