// [tower] 격자형 통합 발사탑(메카질라 스타일) + 캐리지 + 젓가락(캐치 암) 2개 + 퀵디스커넥트(QD) 암
// 로컬 좌표: 원점 = 탑 바닥 중심, +Z = 기체(로켓) 방향, 기체 중심은 (0, *, D)
// 격자 부재는 InstancedMesh(I형강 + 각형강) 로 그려 드로우콜을 최소화
import * as THREE from 'three';
import { memberMatrix, merge, beamGeo, cylGeo } from './towerTextures.js';

function iBeamGeo() { // 단위 I형강(길이축 Y, 단면 1×1)
  const s = new THREE.Shape(), f = 0.16, w = 0.12;
  s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(0.5, -0.5 + f); s.lineTo(w / 2, -0.5 + f); s.lineTo(w / 2, 0.5 - f); s.lineTo(0.5, 0.5 - f);
  s.lineTo(0.5, 0.5); s.lineTo(-0.5, 0.5); s.lineTo(-0.5, 0.5 - f); s.lineTo(-w / 2, 0.5 - f); s.lineTo(-w / 2, -0.5 + f); s.lineTo(-0.5, -0.5 + f); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); g.rotateX(Math.PI / 2); // Z(길이) → Y
  return g;
}

class Members {
  constructor() { this.list = { I: [], B: [] }; }
  add(kind, a, b, w, d = w) { this.list[kind].push([a.clone(), b.clone(), w, d]); }
  build(mats) {
    const out = new THREE.Group(), m4 = new THREE.Matrix4();
    for (const [kind, geo, mat] of [['I', iBeamGeo(), mats.lattice], ['B', new THREE.BoxGeometry(1, 1, 1), mats.latticeDark]]) {
      const L = this.list[kind]; if (!L.length) continue;
      const im = new THREE.InstancedMesh(geo, mat, L.length);
      L.forEach(([a, b, w, d], i) => im.setMatrixAt(i, memberMatrix(a, b, w, d, m4)));
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); out.add(im);
    }
    return out;
  }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * @param o.side 탑 한 변(m) @param o.height 전체 높이 @param o.D 탑 중심→기체 중심 거리 @param o.R 기체 반지름
 * @param o.armTopY 젓가락 위 레일 높이(핀이 얹히는 높이) @param o.qd {y, extended}
 */
export function createLaunchTower(mats, o) {
  const { side, height, D, R } = o, a = side / 2;
  const g = new THREE.Group(); g.name = 'launchTower';
  const M = new Members();
  const latticeTop = height - 7;
  const nb = Math.max(4, Math.round(latticeTop / 7.6)), hb = latticeTop / nb;
  const corners = [[-a, -a], [a, -a], [a, a], [-a, a]];
  for (let i = 0; i < nb; i++) {
    const y0 = i * hb, y1 = (i + 1) * hb;
    for (const [x, z] of corners) M.add('I', V(x, y0, z), V(x, y1, z), 1.15);
    for (let k = 0; k < 4; k++) {
      const [x0, z0] = corners[k], [x1, z1] = corners[(k + 1) % 4];
      M.add('I', V(x0, y1, z0), V(x1, y1, z1), 0.75, 0.6);
      const ym = (y0 + y1) / 2; // X 브레이싱 + 중간 수평재
      M.add('B', V(x0, y0, z0), V(x1, y1, z1), 0.38); M.add('B', V(x1, y0, z1), V(x0, y1, z0), 0.38);
      if (i % 2 === 0) M.add('B', V(x0, ym, z0), V(x1, ym, z1), 0.3);
    }
    if (i % 3 === 1) { M.add('B', V(-a, y1, -a), V(a, y1, a), 0.32); M.add('B', V(a, y1, -a), V(-a, y1, a), 0.32); } // 평면 브레이싱
  }
  // 내부 계단/엘리베이터 코어(가는 격자 기둥) — 탑 안쪽 뒤편
  const cx0 = -a + 1.2, cx1 = -a + 3.6, cz0 = -a + 1.2, cz1 = -a + 3.6;
  for (const [x, z] of [[cx0, cz0], [cx1, cz0], [cx1, cz1], [cx0, cz1]]) M.add('B', V(x, 0, z), V(x, latticeTop, z), 0.22);
  for (let y = 3; y < latticeTop; y += 3.2) { M.add('B', V(cx0, y, cz1), V(cx1, y, cz1), 0.15); M.add('B', V(cx1, y, cz0), V(cx1, y, cz1), 0.15); }

  // 최상단 크라운: 데크 + 권상기 하우징 + 피뢰침 + 항공장애등
  const solid = [], cyl = [];
  solid.push(beamGeo(V(0, latticeTop, 0), V(0, latticeTop + 1.2, 0), side + 1.4, side + 1.4));
  for (const [x, z] of corners) M.add('I', V(x, latticeTop + 1.2, z), V(x * 0.6, height - 2.2, z * 0.6), 0.8);
  solid.push(beamGeo(V(0, height - 2.2, a * 0.15), V(0, height - 0.6, a * 0.15), side * 0.75, side * 0.95));
  solid.push(beamGeo(V(0, latticeTop + 1.2, a + 2.2), V(0, latticeTop + 4.5, a + 2.2), 3.2, 4.4)); // 앞쪽 도르래 블록
  cyl.push(cylGeo(V(-a * 0.5, height - 0.6, -a * 0.4), V(-a * 0.5, height + 0.01, -a * 0.4), 0.18, 8));
  g.add(meshOf(merge(solid), mats.latticeDark));
  // 기초
  const found = new THREE.Mesh(merge([beamGeo(V(0, -0.5, 0), V(0, 1.2, 0), side + 5, side + 5)]), mats.concrete); found.receiveShadow = true; g.add(found);

  // 캐리지 + 젓가락
  // [launch] o.rig=true 이면 캐리지/팔/QD 를 별도 그룹으로 분리(애니메이션용). rig=false 면 기존과 동일하게 합쳐서 그림
  const rig = !!o.rig, rg = rig ? {} : null;
  const Mc = rig ? new Members() : M, cylC = rig ? [] : cyl; // [launch]
  const yT = o.armTopY, armH = 3.6, cb = yT - 7.5, ct = yT + 2.5, co = a + 0.9;
  const cc = [[-co, -co], [co, -co], [co, co], [-co, co]];
  for (const yy of [cb, yT - armH, ct]) for (let k = 0; k < 4; k++) { const [x0, z0] = cc[k], [x1, z1] = cc[(k + 1) % 4]; Mc.add('I', V(x0, yy, z0), V(x1, yy, z1), 0.8, 0.9); }
  for (const [x, z] of cc) Mc.add('I', V(x, cb, z), V(x, ct, z), 0.9);
  for (const s of [-1, 1]) { Mc.add('B', V(s * co, cb, -co), V(s * co, ct, co), 0.45); Mc.add('B', V(s * co, ct, -co), V(s * co, cb, co), 0.45); }
  solid.length = 0;
  solid.push(beamGeo(V(0, cb + 0.6, co + 0.6), V(0, ct - 0.4, co + 0.6), side - 1, 1.0)); // 캐리지 전면판(구동부)
  const hingeX = co + 0.35, hingeZ = co + 1.0;
  for (const s of [-1, 1]) cylC.push(cylGeo(V(s * hingeX, cb - 0.5, hingeZ), V(s * hingeX, ct + 0.5, hingeZ), 0.75, 14)); // 힌지 기둥
  // 롤러/가이드 — 탑 모서리에 닿는 부분
  for (const [x, z] of corners) for (const yy of [cb + 1, ct - 1]) solid.push(beamGeo(V(x * 1.04, yy - 0.6, z * 1.04), V(x * 1.04, yy + 0.6, z * 1.04), 1.1, 1.1));
  const carriage = rig ? new THREE.Group() : g; // [launch]
  carriage.add(meshOf(merge(solid), mats.latticeDark));
  // 와이어(권상 케이블)
  if (!rig) for (const s of [-1, 1]) cyl.push(cylGeo(V(s * 0.8, ct, a + 1.6), V(s * 0.8, latticeTop + 1.2, a + 2.2), 0.07, 5));
  else { // [launch] 단위 길이 케이블 → 매 프레임 scale.y
    const cg = merge([-1, 1].map((s) => cylGeo(V(s * 0.8, 0, a + 1.9), V(s * 0.8, 1, a + 1.9), 0.07, 5)));
    rg.cable = meshOf(cg, mats.pipe); rg.cableTop = latticeTop + 1.2; g.add(rg.cable);
  }

  const arms = new THREE.Group(); arms.name = 'chopsticks';
  let pads = [], hyd = [];
  if (rig) rg.arms = [];
  for (const s of [-1, 1]) {
    const Ma = rig ? new Members() : M, cylA = rig ? [] : cyl; // [launch]
    if (rig) { pads = []; hyd = []; }
    const xc = s * (R + 0.35 + 0.85), H = V(s * hingeX, 0, hingeZ), T = V(xc, 0, D);
    const u = T.clone().sub(H).normalize(), n = V(u.z, 0, -u.x).multiplyScalar(s > 0 ? -1 : 1); // n: 기체 반대쪽(바깥)
    const L = (D + R + 2.6 - hingeZ) / u.z;
    const P = (t, lat, y) => H.clone().addScaledVector(u, t).addScaledVector(n, lat).setY(y);
    const w = 0.8, yb = yT - armH;
    for (const lat of [-w, w]) {
      Ma.add('I', P(0.4, lat, yT - 0.25), P(L, lat, yT - 0.25), 0.55, 0.5);
      Ma.add('I', P(0.4, lat, yb + 0.25), P(L - 1.5, lat, yb + 0.25), 0.55, 0.5);
      const nP = Math.round(L / 3);
      for (let k = 0; k <= nP; k++) {
        const t0 = 0.4 + (k * (L - 2)) / nP; Ma.add('B', P(t0, lat, yb + 0.25), P(t0, lat, yT - 0.25), 0.28);
        if (k < nP) { const t1 = 0.4 + ((k + 1) * (L - 2)) / nP; Ma.add('B', P(t0, lat, (k & 1) ? yT - 0.25 : yb + 0.25), P(t1, lat, (k & 1) ? yb + 0.25 : yT - 0.25), 0.22); }
      }
    }
    for (let t = 1; t < L; t += 3) Ma.add('B', P(t, -w, yb + 0.25), P(t, w, yb + 0.25), 0.2);
    const top = beamGeo(P(0.2, 0, yT - 0.12), P(L, 0, yT - 0.12), 2.0, 0.24); // 상부 캐치 레일(핀이 얹히는 판)
    top.rotateY(0); pads.push({ geo: top, mat: 'latticeDark' });
    const tip = beamGeo(P(L - 0.4, 0, yb + 0.6), P(L - 0.4, 0, yT), 1.9, 0.8); pads.push({ geo: tip, mat: 'latticeDark' });
    // 동체에 닿는 고무 패드(안쪽 면) — 기체 중심 앞뒤 2개
    for (const dz of [-1.7, 1.7]) {
      const tc = (D + dz - hingeZ) / u.z, c = P(tc, 0, yT - 1.7), inner = V(-xc / Math.abs(xc), 0, 0);
      const gap = Math.abs(c.x) - Math.sqrt(Math.max(0, R * R - (c.z - D) ** 2)); // 패드 중심~동체 표면 거리
      const p0 = c.clone().addScaledVector(inner, w), p1 = c.clone().addScaledVector(inner, gap - 0.02);
      pads.push({ geo: beamGeo(p0, p1, 2.2, 1.6), mat: 'pad' });
    }
    // 유압 실린더(캐리지 → 팔)
    const h0 = V(s * (a - 1.5), yT - 1.8, co + 1.1), h1 = P(Math.min(9, L * 0.35), -w - 0.2, yT - 1.8);
    hyd.push(cylGeo(h0, h0.clone().lerp(h1, 0.55), 0.28, 10)); cylA.push(cylGeo(h0.clone().lerp(h1, 0.5), h1, 0.38, 10));
    // 뿌리 삼각 트러스(힌지 → 팔 앞쪽)
    Ma.add('I', V(s * hingeX, yT - 1.8, hingeZ), P(7.5, 0, yT - 1.8), 0.5);
    Ma.add('B', V(s * hingeX, ct, hingeZ), P(4, 0, yT - 0.3), 0.35);
    Ma.add('B', V(s * hingeX, cb, hingeZ), P(4, 0, yb + 0.3), 0.35);
    if (rig) { // [launch] 힌지 축 회전용 피벗 그룹
      const pivot = new THREE.Group(), inner = new THREE.Group();
      pivot.position.set(s * hingeX, 0, hingeZ); inner.position.set(-s * hingeX, 0, -hingeZ); pivot.add(inner);
      for (const k of ['latticeDark', 'pad']) { const list = pads.filter((p) => p.mat === k).map((p) => p.geo); if (list.length) inner.add(meshOf(merge(list), mats[k])); }
      inner.add(meshOf(merge(hyd), mats.hydraulic), meshOf(merge(cylA), mats.pipe), Ma.build(mats));
      arms.add(pivot); rg.arms.push({ s, pivot });
    }
  }
  if (!rig) {
    for (const k of ['latticeDark', 'pad']) { const list = pads.filter((p) => p.mat === k).map((p) => p.geo); if (list.length) arms.add(meshOf(merge(list), mats[k])); }
    arms.add(meshOf(merge(hyd), mats.hydraulic));
    g.add(arms);
  } else { // [launch]
    carriage.add(Mc.build(mats), meshOf(merge(cylC), mats.pipe), arms);
    g.add(carriage); rg.carriage = carriage; rg.yT0 = yT; rg.ct0 = ct;
  }

  // QD 암: 펼침(기체 하부 연결) 또는 접힘(탑 옆면에 붙음)
  if (o.qd) {
    const y = o.qd.y, solidQ = [];
    const Mq = rig ? new Members() : M, cylQ = rig ? [] : cyl; // [launch]
    let A, B;
    if (o.qd.extended) { A = V(-a + 1.5, y, a + 0.6); B = V(-1.0, y, D - R - 0.35); }
    else { A = V(-a - 0.6, y, a + 0.6); B = V(-a - 0.6, y, a - 17); }
    const u = B.clone().sub(A).normalize(), n = V(-u.z, 0, u.x);
    const L = A.distanceTo(B), P = (t, lat, yy) => A.clone().addScaledVector(u, t).addScaledVector(n, lat).setY(yy);
    for (const lat of [-1.1, 1.1]) for (const yy of [y - 1.4, y + 1.4]) Mq.add('I', P(0, lat, yy), P(L - 1.2, lat, yy), 0.45);
    for (let t = 0; t < L - 1.5; t += 2.4) {
      for (const lat of [-1.1, 1.1]) { Mq.add('B', P(t, lat, y - 1.4), P(t, lat, y + 1.4), 0.2); Mq.add('B', P(t, lat, y - 1.4), P(t + 2.4, lat, y + 1.4), 0.18); }
      Mq.add('B', P(t, -1.1, y + 1.4), P(t, 1.1, y + 1.4), 0.18);
    }
    solidQ.push(beamGeo(P(L - 1.4, 0, y - 1.7), P(L - 1.4, 0, y + 1.7), 2.8, 2.4)); // QD 플레이트
    if (o.qd.extended) { solidQ.push(beamGeo(P(L - 0.3, 0, y - 0.9), P(L, 0, y - 0.9), 1.2, 1.2)); }
    cylQ.push(cylGeo(P(0, 0.6, y + 1.9), P(L - 1.4, 0.6, y + 1.9), 0.3, 8), cylGeo(P(0, -0.6, y + 1.9), P(L - 1.4, -0.6, y + 1.9), 0.25, 8));
    cyl.push(cylGeo(V(-a + 1.5, 0.5, a + 0.9), V(-a + 1.5, y + 1.9, a + 0.9), 0.35, 8)); // 추진제 라인(지상→QD)
    if (!rig) g.add(meshOf(merge(solidQ), mats.latticeDark));
    else { // [launch] 뿌리(A) 축으로 회전. retractYaw: 탑 앞면을 따라 바깥(-X)으로 접힘
      const pivot = new THREE.Group(), inner = new THREE.Group();
      pivot.position.set(A.x, 0, A.z); inner.position.set(-A.x, 0, -A.z); pivot.add(inner);
      inner.add(meshOf(merge(solidQ), mats.latticeDark), meshOf(merge(cylQ), mats.pipe), Mq.build(mats));
      g.add(pivot);
      rg.qd = { pivot, retractYaw: Math.atan2(-1, 0.12) - Math.atan2(u.x, u.z) };
    }
  }
  if (rig) g.userData.rig = rg; // [launch]
  g.add(meshOf(merge(cyl), mats.pipe));
  g.add(M.build(mats));
  // 항공장애등
  const lg = new THREE.SphereGeometry(0.45, 8, 6), lights = [];
  for (const [x, z] of corners) lights.push(lg.clone().translate(x * 0.6, height - 2.0, z * 0.6));
  for (const yy of [latticeTop * 0.5, latticeTop * 0.75]) for (const [x, z] of corners) lights.push(lg.clone().translate(x * 1.08, yy, z * 1.08));
  g.add(new THREE.Mesh(merge(lights), mats.redLight));
  return g;
}

function meshOf(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }

// 오비탈 런치 마운트(테이블): 원형 개구부 + 홀드다운 클램프 20개 + 다리 + 화염 디플렉터
export function createLaunchMount(mats, { R, topY = 12.5, size = 19 }) {
  const g = new THREE.Group(); g.name = 'launchMount';
  const s = size / 2, holeR = R - 0.35, th = 2.6;
  const sh = new THREE.Shape([V(-s, -s), V(s, -s), V(s, s), V(-s, s)].map((v) => new THREE.Vector2(v.x, v.y)));
  const hole = new THREE.Path(); hole.absarc(0, 0, holeR, 0, Math.PI * 2, true); sh.holes.push(hole);
  const tbl = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 48 }); tbl.rotateX(-Math.PI / 2); tbl.translate(0, topY - th, 0);
  const uv = tbl.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 8, uv.getY(i) / 8);
  g.add(meshOf(tbl, mats.latticeDark));
  const steel = [], dark = [];
  for (let i = 0; i < 6; i++) { const ang = (i / 6) * Math.PI * 2 + Math.PI / 6, x = Math.cos(ang) * (s - 1.6), z = Math.sin(ang) * (s - 1.6); steel.push(beamGeo(V(x, 0, z), V(x, topY - th, z), 2.6, 2.6)); }
  for (let i = 0; i < 4; i++) { const ang = (i / 4) * Math.PI * 2 + Math.PI / 4; const x = Math.cos(ang) * (s - 1.6), z = Math.sin(ang) * (s - 1.6); steel.push(beamGeo(V(x, 1, z), V(x * 0.2, topY - th - 0.5, z * 0.2), 0.8)); }
  for (let i = 0; i < 20; i++) { // 홀드다운 클램프: 스커트 바깥에서 동체 쪽으로 기울어진 블록
    const ang = (i / 20) * Math.PI * 2, c = Math.cos(ang), sn = Math.sin(ang);
    dark.push(beamGeo(V(c * (R + 1.3), topY, sn * (R + 1.3)), V(c * (R + 0.25), topY + 1.6, sn * (R + 0.25)), 0.75, 0.7));
    steel.push(beamGeo(V(c * (R + 1.1), topY, sn * (R + 1.1)), V(c * (R + 1.1), topY + 0.6, sn * (R + 1.1)), 1.1, 1.1));
  }
  const ringG = new THREE.TorusGeometry(R + 2.0, 0.28, 8, 64); ringG.rotateX(Math.PI / 2); ringG.translate(0, topY + 0.3, 0); steel.push(ringG); // 디류즈 링
  const defl = new THREE.ConeGeometry(7.5, 3.5, 40, 1, true); defl.translate(0, 1.75, 0); steel.push(defl); // 화염 디플렉터
  steel.push(beamGeo(V(0, topY, -R - 2.2), V(0, topY + 2.6, -R - 1.4), 3.2, 1.6)); // 부스터 QD 박스(탑 쪽)
  g.add(meshOf(merge(steel), mats.stainlessDark), meshOf(merge(dark), mats.dark));
  return g;
}
