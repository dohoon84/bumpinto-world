// [depot] 240L 대형 카트 메시 — 참고 이미지 1040(L)×585(W)×1020(H)mm, 바구니 앞 깊이 440mm, 아래 받침대, 빨간 유아석·손잡이.
//   카트 좌표: 앞 = −z, 오른쪽 = +x, 바닥 y = 0. 철망은 얇은 막대(박스)를 한 지오메트리로 합침 → 재질 3개 = draw 3.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 바구니 안쪽 형상 (물리와 공유)
export const BASKET = {
  floorY: 0.47, // 바구니 바닥 (추정: 1020 높이 − 뒤 깊이 570 + 여유)
  floor: { x: 0.25, z0: -0.36, z1: 0.45 }, // 바닥 반폭 · 앞뒤
  top: { x: 0.285, z0: -0.52, z1: 0.47, yFront: 0.91, yRear: 0.99 }, // 테두리 (앞 깊이 440mm)
  tray: { y: 0.13, x: 0.24, z0: -0.35, z1: 0.4 }, // 아래 받침대 (휠베이스 745mm)
  seat: { x: 0.2, z0: 0.24, z1: 0.46, y: 0.965, t: 0.03 }, // 유아석 바닥판 (아이 안 태울 땐 테두리 높이로 접힘 → 바구니 깊이 그대로 사용)
  handle: { y: 1.02, z: 0.57 },
};

function bar(a, b, r, out) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  if (L < 1e-4) return;
  const g = new THREE.BoxGeometry(r, r, L);
  const m = new THREE.Matrix4().lookAt(a, b, Math.abs(d.y) / L > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  out.push(g);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildCartGeometry() {
  const B = BASKET, wire = [], red = [], dark = [];
  const r = 0.0055, R = 0.014;
  // 바닥 사각형 → 테두리 사각형 보간
  const ring = (t) => {
    const x = B.floor.x + (B.top.x - B.floor.x) * t;
    const z0 = B.floor.z0 + (B.top.z0 - B.floor.z0) * t, z1 = B.floor.z1 + (B.top.z1 - B.floor.z1) * t;
    const yF = B.floorY + (B.top.yFront - B.floorY) * t, yR = B.floorY + (B.top.yRear - B.floorY) * t;
    return { x, z0, z1, yF, yR };
  };
  const yAt = (q, z) => q.yF + (q.yR - q.yF) * ((z - q.z0) / (q.z1 - q.z0));
  // 가로 링 (높이 방향 9줄 + 테두리 굵게)
  for (let i = 0; i <= 9; i++) {
    const q = ring(i / 9), rr = i === 9 ? R : r;
    const c = [V(-q.x, yAt(q, q.z0), q.z0), V(q.x, yAt(q, q.z0), q.z0), V(q.x, yAt(q, q.z1), q.z1), V(-q.x, yAt(q, q.z1), q.z1)];
    for (let k = 0; k < 4; k++) bar(c[k], c[(k + 1) % 4], rr, wire);
  }
  // 세로 철사: 옆면
  const lo = ring(0), hi = ring(1);
  for (let s = 0; s <= 24; s++) {
    const u = s / 24;
    for (const sx of [-1, 1]) {
      const z0 = lo.z0 + (lo.z1 - lo.z0) * u, z1 = hi.z0 + (hi.z1 - hi.z0) * u;
      bar(V(sx * lo.x, yAt(lo, z0), z0), V(sx * hi.x, yAt(hi, z1), z1), r, wire);
    }
  }
  // 앞·뒤면
  for (let s = 0; s <= 12; s++) {
    const u = s / 12 * 2 - 1;
    bar(V(u * lo.x, lo.yF, lo.z0), V(u * hi.x, hi.yF, hi.z0), r, wire);
    bar(V(u * lo.x, lo.yR, lo.z1), V(u * hi.x, hi.yR, hi.z1), r, wire);
  }
  // 바닥 격자
  for (let s = 0; s <= 10; s++) { const x = -lo.x + (2 * lo.x) * s / 10; bar(V(x, B.floorY, lo.z0), V(x, B.floorY, lo.z1), r, wire); }
  for (let s = 0; s <= 16; s++) { const z = lo.z0 + (lo.z1 - lo.z0) * s / 16; bar(V(-lo.x, B.floorY, z), V(lo.x, B.floorY, z), r, wire); }
  // 아래 받침대 격자 + 낮은 테
  const T = B.tray;
  for (let s = 0; s <= 8; s++) { const x = -T.x + 2 * T.x * s / 8; bar(V(x, T.y, T.z0), V(x, T.y, T.z1), r, wire); }
  for (let s = 0; s <= 14; s++) { const z = T.z0 + (T.z1 - T.z0) * s / 14; bar(V(-T.x, T.y, z), V(T.x, T.y, z), r, wire); }
  for (const sx of [-1, 1]) bar(V(sx * T.x, T.y + 0.035, T.z0), V(sx * T.x, T.y + 0.035, T.z1), R * 0.7, wire);
  bar(V(-T.x, T.y + 0.035, T.z0), V(T.x, T.y + 0.035, T.z0), R * 0.7, wire);
  // 프레임: 바닥 Y자 + 뒤 기둥 + 손잡이 지지대 + 바구니 받침
  for (const sx of [-1, 1]) {
    bar(V(sx * 0.13, 0.11, -0.43), V(sx * 0.255, 0.11, 0.38), R * 1.4, wire);
    bar(V(sx * 0.255, 0.11, 0.38), V(sx * 0.27, B.floorY - 0.02, 0.44), R * 1.4, wire);
    bar(V(sx * 0.27, B.floorY - 0.02, 0.44), V(sx * 0.29, B.handle.y, B.handle.z), R * 1.2, wire);
    bar(V(sx * 0.2, T.y, T.z0), V(sx * 0.2, B.floorY, -0.3), R, wire);
  }
  bar(V(-0.13, 0.11, -0.43), V(0.13, 0.11, -0.43), R * 1.4, wire);
  // 손잡이(빨강) + 유아석(빨강 플라스틱)
  const hg = new THREE.CylinderGeometry(0.019, 0.019, 0.6, 12); hg.rotateZ(Math.PI / 2); hg.translate(0, B.handle.y, B.handle.z); red.push(hg);
  const S = B.seat;
  const seat = new THREE.BoxGeometry(S.x * 2, S.t, S.z1 - S.z0); seat.translate(0, S.y, (S.z0 + S.z1) / 2); red.push(seat);
  const back = new THREE.BoxGeometry(S.x * 2, 0.16, 0.02); back.rotateX(-0.25); back.translate(0, S.y + 0.1, S.z1 - 0.02); red.push(back);
  for (const sx of [-1, 1]) { const cap = new THREE.BoxGeometry(0.07, 0.05, 0.1); cap.translate(sx * 0.27, B.top.yFront + 0.01, B.top.z0 + 0.06); red.push(cap); }
  // 바퀴 125mm × 4 + 포크
  for (const [x, z] of [[-0.13, -0.42], [0.13, -0.42], [-0.25, 0.37], [0.25, 0.37]]) {
    const w = new THREE.CylinderGeometry(0.0625, 0.0625, 0.032, 16); w.rotateZ(Math.PI / 2); w.translate(x, 0.0625, z); dark.push(w);
    const f = new THREE.BoxGeometry(0.05, 0.06, 0.02); f.translate(x, 0.105, z); dark.push(f);
  }
  const bumper = new THREE.BoxGeometry(0.62, 0.05, 0.03); bumper.translate(0, B.top.yFront - 0.02, B.top.z0 - 0.01); dark.push(bumper);
  const out = { wire: mergeGeometries(wire, false), red: mergeGeometries(red, false), dark: mergeGeometries(dark, false) };
  for (const g of [...wire, ...red, ...dark]) g.dispose();
  return out;
}
