// [myeongdong-detail] 명동 노점 대표 음식 (로우폴리, 정점색). 노점 로컬 좌표: x = 길 방향(±1.1), z = 옆(±0.5), 판매대 윗면 y = 1.31.
//   종류마다 지오메트리를 한 번 만들고, 노점마다 행렬만 곱해 한 메시로 합친다(노점 음식 전체 draw 1).
import * as THREE from 'three';
import { GeoBuf, hex3 } from './myeongdongGeo.js';

const TOP = 1.31;
function rnd32(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const C = (h) => hex3(h);
/** three 지오메트리를 (x,y,z, ry, 크기) 로 붙인다 */
function addGeo(buf, geo, x, y, z, col, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(m); g.computeVertexNormals();
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  const idx = []; for (let i = 0; i < p.length / 3; i++) idx.push(i);
  buf.raw(Array.from(p), idx, Array.from(n), null, col);
  g.dispose();
}
const ICO = new THREE.IcosahedronGeometry(1, 0);
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const box = (b, x, y, z, sx, sy, sz, col, ry = 0) => b.box(x, y, z, sx, sy, sz, ry, undefined, col);
const tray = (b, x, z, w, d, col = C('#2b2d31')) => { box(b, x, TOP + 0.03, z, w, 0.06, d, col); return TOP + 0.06; };
const stick = (b, x, y0, z, L, ry = 0, tilt = 0) => addGeo(b, CYL6, x, y0 + L / 2 * Math.cos(tilt), z + L / 2 * Math.sin(tilt), C('#d9c49a'), ry, 0.012, L, 0.012, tilt);

const KINDS = [
  // 0 떡볶이 · 어묵
  (b, r) => {
    const y = tray(b, -0.5, 0, 1.0, 0.8, C('#3a3c40'));
    box(b, -0.5, y + 0.02, 0, 0.9, 0.04, 0.7, C('#c92a1c'));
    for (let k = 0; k < 26; k++) box(b, -0.5 + (r() - 0.5) * 0.8, y + 0.05, (r() - 0.5) * 0.6, 0.15, 0.045, 0.045, C(r() < 0.8 ? '#e8572e' : '#f2d8b0'), r() * 3);
    const y2 = tray(b, 0.6, 0, 0.8, 0.6, C('#aeb4bb'));
    box(b, 0.6, y2 + 0.01, 0, 0.72, 0.03, 0.52, C('#c9a46a'));
    for (let k = 0; k < 10; k++) {
      const x = 0.3 + (k % 5) * 0.14, z = k < 5 ? -0.12 : 0.12;
      stick(b, x, y2, z, 0.42, 0, 0.25 * (k < 5 ? -1 : 1));
      for (let j = 0; j < 3; j++) box(b, x, y2 + 0.06 + j * 0.06, z + (k < 5 ? -1 : 1) * (0.02 + j * 0.015), 0.12, 0.05, 0.03, C(j % 2 ? '#d9a35b' : '#e7b874'));
    }
  },
  // 1 계란빵
  (b, r) => {
    const y = tray(b, -0.35, 0, 1.2, 0.8);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const x = -0.8 + i * 0.3, z = -0.24 + j * 0.24;
      box(b, x, y + 0.05, z, 0.22, 0.1, 0.16, C('#d9963a'));
      addGeo(b, CYL8, x, y + 0.105, z, C('#fff3d8'), 0, 0.07, 0.02, 0.05);
      addGeo(b, CYL8, x, y + 0.12, z, C('#f7b500'), 0, 0.035, 0.02, 0.03);
    }
    for (let k = 0; k < 6; k++) box(b, 0.65 + (k % 3) * 0.18, TOP + 0.05 + Math.floor(k / 3) * 0.1, 0.1, 0.16, 0.09, 0.22, C('#e0a24a'));
  },
  // 2 회오리감자
  (b, r) => {
    box(b, 0, TOP + 0.06, 0, 1.6, 0.12, 0.3, C('#6b4a2e'));
    for (let k = 0; k < 9; k++) {
      const x = -0.72 + k * 0.18, y0 = TOP + 0.12;
      stick(b, x, y0, 0, 0.62);
      for (let j = 0; j < 11; j++) {
        const a = j * 0.9;
        box(b, x + Math.cos(a) * 0.02, y0 + 0.1 + j * 0.042, Math.sin(a) * 0.02, 0.16, 0.022, 0.13, C(j % 2 ? '#f2b33d' : '#e39a2a'), a);
      }
    }
  },
  // 3 랍스터 치즈구이
  (b, r) => {
    const y = tray(b, 0, 0, 2.0, 0.85, C('#1f2124'));
    for (let i = -6; i <= 6; i++) box(b, i * 0.15, y + 0.01, 0, 0.02, 0.02, 0.8, C('#6d7278'));
    for (let k = 0; k < 4; k++) {
      const x = -0.7 + k * 0.46, z = (k % 2 ? 0.14 : -0.14);
      box(b, x, y + 0.06, z, 0.44, 0.09, 0.17, C('#d9381e'));
      box(b, x + 0.02, y + 0.115, z, 0.34, 0.03, 0.12, C('#ffd23f'));
      box(b, x - 0.27, y + 0.05, z, 0.12, 0.06, 0.2, C('#c22d14'));
      for (const s of [-1, 1]) box(b, x + 0.28, y + 0.05, z + s * 0.11, 0.18, 0.06, 0.07, C('#e04a26'), s * 0.4);
    }
  },
  // 4 대왕 문어꼬치
  (b, r) => {
    const y = tray(b, 0, 0, 2.0, 0.85, C('#1f2124'));
    for (let k = 0; k < 6; k++) {
      const z = -0.32 + k * 0.13, x0 = -0.75;
      let x = x0, ang = 0, s = 0.08;
      for (let j = 0; j < 9; j++) {
        addGeo(b, ICO, x, y + 0.05, z + Math.sin(ang) * 0.05, C(j % 3 ? '#a8323e' : '#c94a56'), 0, s, s * 0.75, s);
        x += s * 1.35; ang += 0.5; s *= 0.9;
      }
      stick(b, x0 - 0.2, y + 0.04, z, 0.3, 0, Math.PI / 2);
    }
  },
  // 5 호떡
  (b, r) => {
    const y = tray(b, -0.3, 0, 1.3, 0.85, C('#2a2b2e'));
    for (let k = 0; k < 8; k++) addGeo(b, CYL8, -0.8 + (k % 4) * 0.32, y + 0.02, k < 4 ? -0.18 : 0.18, C(k % 3 ? '#b8732b' : '#9a5a1e'), 0, 0.13, 0.035, 0.13);
    for (let k = 0; k < 5; k++) addGeo(b, CYL8, 0.62 + (k % 3) * 0.14, TOP + 0.07, -0.15 + Math.floor(k / 3) * 0.3, C('#f4efe6'), 0, 0.05, 0.14, 0.05);
  },
  // 6 딸기 탕후루
  (b, r) => {
    box(b, 0, TOP + 0.08, 0, 1.7, 0.16, 0.34, C('#e9e2d6'));
    const fruits = ['#e3102b', '#e3102b', '#e3102b', '#7ac943', '#5b2a86', '#ff9f1c'];
    for (let k = 0; k < 14; k++) {
      const x = -0.75 + (k % 7) * 0.25, z = k < 7 ? -0.08 : 0.08, y0 = TOP + 0.16;
      stick(b, x, y0, z, 0.5);
      const fc = k % 5 === 4 ? fruits[3 + (k % 3)] : fruits[0];
      for (let j = 0; j < 4; j++) addGeo(b, ICO, x, y0 + 0.2 + j * 0.075, z, C(fc), j, 0.04, 0.042, 0.04);
    }
  },
  // 7 군밤
  (b, r) => {
    addGeo(b, CYL8, -0.45, TOP + 0.3, 0, C('#2b2b2b'), 0, 0.28, 0.75, 0.28, 0, Math.PI / 2);
    addGeo(b, CYL8, -0.45, TOP + 0.3, 0, C('#6d7278'), 0, 0.05, 0.9, 0.05, 0, Math.PI / 2);
    const y = tray(b, 0.55, 0, 0.8, 0.7, C('#7a7f85'));
    for (let k = 0; k < 34; k++) addGeo(b, ICO, 0.55 + (r() - 0.5) * 0.66, y + 0.03 + r() * 0.04, (r() - 0.5) * 0.56, C(r() < 0.5 ? '#6b3a1e' : '#4e2a14'), r() * 6, 0.045, 0.035, 0.04);
    for (let k = 0; k < 3; k++) box(b, 0.2 + k * 0.12, TOP + 0.1, 0.42, 0.1, 0.2, 0.07, C('#d9c49a'));
  },
  // 8 닭꼬치
  (b, r) => {
    const y = tray(b, 0, 0, 2.0, 0.8, C('#1f2124'));
    for (let k = 0; k < 12; k++) {
      const x = -0.85 + k * 0.155;
      stick(b, x, y + 0.03, -0.3, 0.6, 0, Math.PI / 2);
      for (let j = 0; j < 4; j++) box(b, x, y + 0.05, -0.18 + j * 0.12, 0.08, 0.07, 0.08, C(j % 2 ? '#8a3a14' : '#a84a1c'), r());
      box(b, x, y + 0.05, 0.3, 0.07, 0.05, 0.04, C('#5a9e3a'));
    }
  },
  // 9 붕어빵
  (b, r) => {
    const y = tray(b, -0.4, 0, 1.2, 0.8, C('#2a2b2e'));
    for (let k = 0; k < 10; k++) {
      const x = -0.85 + (k % 5) * 0.22, z = k < 5 ? -0.18 : 0.18;
      box(b, x, y + 0.03, z, 0.15, 0.05, 0.1, C('#d58f2f'));
      box(b, x + 0.1, y + 0.03, z, 0.06, 0.04, 0.09, C('#c47e24'), 0.785);
    }
    for (let k = 0; k < 4; k++) box(b, 0.6 + (k % 2) * 0.2, TOP + 0.04 + Math.floor(k / 2) * 0.06, 0, 0.15, 0.05, 0.1, C('#e09a3a'));
  },
  // 10 딸기모찌
  (b, r) => {
    const y = tray(b, 0, 0, 1.8, 0.7, C('#f7d1dc'));
    for (let k = 0; k < 16; k++) {
      const x = -0.75 + (k % 8) * 0.21, z = k < 8 ? -0.14 : 0.14;
      addGeo(b, ICO, x, y + 0.05, z, C('#fbf6f0'), 0, 0.075, 0.06, 0.075);
      addGeo(b, ICO, x, y + 0.11, z, C('#e3102b'), 0, 0.035, 0.04, 0.035);
    }
  },
  // 11 고기만두
  (b, r) => {
    for (const x of [-0.55, 0.15]) for (let j = 0; j < 3; j++) addGeo(b, CYL8, x, TOP + 0.07 + j * 0.13, 0, C(j % 2 ? '#c9a46a' : '#d8b57a'), 0, 0.28, 0.12, 0.28);
    for (const x of [-0.55, 0.15]) addGeo(b, CYL8, x, TOP + 0.43, 0, C('#b8935a'), 0, 0.3, 0.05, 0.3);
    const y = tray(b, 0.8, 0, 0.5, 0.6, C('#aeb4bb'));
    for (let k = 0; k < 8; k++) addGeo(b, ICO, 0.65 + (k % 3) * 0.13, y + 0.04, -0.2 + Math.floor(k / 3) * 0.2, C('#f4eee2'), 0, 0.06, 0.045, 0.06);
  },
];

/** 종류별 로컬 지오메트리 { p, n, c } (평탄 배열) — 한 번만 만든다 */
export function stallFoodKinds() {
  return KINDS.map((fn, i) => {
    const b = new GeoBuf({ uv: false, color: true });
    fn(b, rnd32(7001 + i * 131));
    return { p: b.p, n: b.n, c: b.c, i: b.i };
  });
}
export const STALL_FOOD_COUNT = KINDS.length;
