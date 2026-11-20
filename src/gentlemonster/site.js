// [gentle-monster] 대지: 도로·보도·흰 자갈 정원·들꽃·나무·주변 저층 건물·맞은편 빈 대지(숨 쉬는 에어돔 설치).
import * as THREE from 'three';
import { Builder, mulberry } from './geo.js';
import { PLAN as P } from './plan.js';
import { labelTex } from './textures.js';

export const SITE = {
  roadZ0: 25, roadZ1: 38, // 남쪽 큰 길 (뚝섬로)
  laneX0: 29, laneX1: 35, // 동쪽 좁은 차로 (사옥과 맞은편 대지 사이)
  lot: { x0: 35, x1: 70, z0: -24, z1: 21 },
};

export function buildSite(mats, { night = false } = {}) {
  const B = new Builder();
  B.project('gravel', 3).project('asphalt', 6).project('paver', 2).project('brick', 3).project('stucco', 12).project('conc', 2.4).project('brickR', 12).project('brickD', 12).project('brickW', 12).project('shop', 12).project('corr', 2);
  const r = mulberry(2025);
  const cols = [], circ = [];
  const wall = (x, z, w, d, h) => cols.push({ t: 'a', x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: 0, y1: h });
  const flat = (key, x0, z0, x1, z1, y, color = 0xffffff) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); B.add(key, g, { x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, color }); };
  // 땅 전체 (자갈은 사옥 정원 + 맞은편 대지, 나머지 포장)
  flat('paver', -140, -140, 140, 140, -0.02, 0x8d8a84);
  flat('gravel', -34, -30, SITE.laneX0, 22, 0.0); // 사옥 정원
  flat('paver', -34, 20, SITE.laneX1, SITE.roadZ0, 0.03, 0xd4d1ca); // 남쪽 보도 (z 20..25)
  flat('asphalt', -140, SITE.roadZ0, 140, SITE.roadZ1, 0.015); // 큰 길
  flat('asphalt', SITE.laneX0, -140, SITE.laneX1, SITE.roadZ0, 0.015); // 좁은 차로
  flat('paver', -140, SITE.roadZ1, 140, SITE.roadZ1 + 4, 0.03, 0xd4d1ca);
  flat('gravel', SITE.lot.x0, SITE.lot.z0, SITE.lot.x1, SITE.lot.z1, 0.0); // 맞은편 대지
  flat('paver', SITE.lot.x0, SITE.lot.z1, 140, SITE.roadZ0, 0.03, 0xd4d1ca);
  // 중앙선·차선
  const dash = (x, z, w, d) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); B.add('paint', g, { x, y: 0.03, z, color: 0xe9c34a }); };
  for (let x = -138; x < 138; x += 6) dash(x, (SITE.roadZ0 + SITE.roadZ1) / 2, 3.2, 0.14);
  const white = (x, z, w, d) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); B.add('paint', g, { x, y: 0.032, z, color: 0xeeeeea }); };
  for (let x = -138; x < 138; x += 1) { if (Math.abs(x - 2) < 6) continue; } // (도로 가장자리선)
  white(0, SITE.roadZ0 + 0.35, 276, 0.12); white(0, SITE.roadZ1 - 0.35, 276, 0.12);
  // 횡단보도 (정문 앞)
  for (let i = -6; i <= 6; i++) white(i * 1.0, (SITE.roadZ0 + SITE.roadZ1) / 2, 0.5, SITE.roadZ1 - SITE.roadZ0 - 1);
  // 정문 앞 보행로 (정원을 가르는 포장)
  flat('paver', -3.6, 16, 3.6, 20.2, 0.035, 0xe0ddd5);
  // 정원 디딤돌 (불규칙 콘크리트 판)
  for (let i = 0; i < 26; i++) { const a = r() * 6.3, d = 21 + r() * 5; const x = Math.cos(a) * d * 1.05, z = Math.sin(a) * d * 0.85; if (Math.abs(x) < 24 && Math.abs(z) < 20 && Math.hypot(x / 20.5, z / 17.5) < 1.08) continue; B.box('conc', 1.0 + r() * 0.9, 0.06, 0.8 + r() * 0.6, { x, y: 0.04, z, ry: r() * 3, color: 0xcfccc5 }); }
  // 낮은 콘크리트 화단 벽 (정원 경계)
  B.box('conc', 64, 0.5, 0.4, { x: -2, y: 0.25, z: -30 }); wall(-2, -30, 64, 0.4, 0.5);
  B.box('conc', 0.4, 0.5, 52, { x: -34, y: 0.25, z: -4 }); wall(-34, -4, 0.4, 52, 0.5);
  B.box('conc', 0.4, 0.5, 52, { x: SITE.laneX0, y: 0.25, z: -4 }); wall(SITE.laneX0, -4, 0.4, 52, 0.5);
  for (const sg of [-1, 1]) { B.box('conc', 29, 0.5, 0.4, { x: sg * 18.7, y: 0.25, z: 22 }); wall(sg * 18.7, 22, 29, 0.4, 0.5); }
  // 맞은편 대지 경계 낮은 벽
  B.box('conc', 35, 0.7, 0.4, { x: 52.5, y: 0.35, z: SITE.lot.z0 }); wall(52.5, SITE.lot.z0, 35, 0.4, 0.7);
  B.box('conc', 35, 0.7, 0.4, { x: 52.5, y: 0.35, z: SITE.lot.z1 }); wall(52.5, SITE.lot.z1, 35, 0.4, 0.7);
  B.box('conc', 0.4, 0.7, 45, { x: SITE.lot.x1, y: 0.35, z: -1.5 }); wall(SITE.lot.x1, -1.5, 0.4, 45, 0.7);
  B.box('conc', 0.4, 0.7, 45, { x: SITE.lot.x0, y: 0.35, z: -1.5 }); wall(SITE.lot.x0, -1.5, 0.4, 45, 0.7);
  // 사인 플린스 (정문 오른쪽) — 글자는 별도 plane
  B.box('conc', 3.4, 1.15, 0.45, { x: 10.5, y: 0.575, z: 19.2 }); wall(10.5, 19.2, 3.4, 0.45, 1.15);
  // 가로등 / 도로 가로수
  const lamp = (x, z) => { circ.push({ x, z, r: 0.12, y0: 0, y1: 8 }); B.cyl('metal', 0.07, 0.1, 7.5, { x, y: 3.75, z }, 8); B.box('metal', 1.6, 0.1, 0.1, { x: x - 0.7, y: 7.5, z }); B.box('lamp', 0.5, 0.08, 0.18, { x: x - 1.4, y: 7.43, z, color: 0xfff1cf }); };
  for (let x = -60; x <= 100; x += 24) lamp(x, SITE.roadZ0 - 0.4);
  const tree = (x, z, s = 1, kind = 0) => {
    circ.push({ x, z, r: 0.22 * s, y0: 0, y1: 8 });
    const h = 3.2 * s, c = [0x6c8a3f, 0x7c9a45, 0xb6a73c][kind % 3];
    B.cyl('paint', 0.08 * s, 0.14 * s, h, { x, y: h / 2, z, color: 0x5b4a3a }, 6);
    for (let i = 0; i < 5; i++) { const a = r() * 6.3, d = r() * 0.9 * s; B.add('leaf', new THREE.IcosahedronGeometry((0.9 + r() * 0.5) * s, 0), { x: x + Math.cos(a) * d, y: h + 0.2 * s + r() * 1.0 * s, z: z + Math.sin(a) * d, color: new THREE.Color(c).offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.12), rx: r() * 3, ry: r() * 3 }); }
  };
  // 도로변 가로수 + 정원의 어린 나무
  for (let x = -54; x <= 100; x += 9) if (Math.abs(x) > 6) tree(x, 22.4 + (x > SITE.laneX0 - 3 && x < SITE.laneX1 + 3 ? 4 : 0), 1.0 + r() * 0.3, (x / 9 | 0) & 3);
  for (const [x, z, s] of [[-24, 12, 0.95], [-25, -6, 1.1], [-22, -20, 1.0], [24, 14, 1.0], [25, -10, 1.15], [23, -23, 0.9], [-8, -25, 1.05], [10, -26, 1.1], [-30, 17, 0.9], [27, 19, 0.85]]) tree(x, z, s, (x | 0) & 3);
  // 들꽃 + 억새 덩이 (정원 가장자리)
  const flowerCols = [0xe06d9e, 0xf3d34a, 0xffffff, 0xb28ee6, 0xf08a4b, 0x6fb7e9];
  for (let i = 0; i < 300; i++) {
    const side = r(); let x, z;
    if (side < 0.34) { x = -33 + r() * 9; z = -29 + r() * 46; } else if (side < 0.68) { x = SITE.laneX0 - 1 - r() * 8; z = -29 + r() * 46; } else { x = -33 + r() * 63; z = -29 + r() * 7; }
    if (Math.hypot(x / 21, z / 18) < 1.12) continue;
    const c = flowerCols[(r() * 6) | 0];
    B.cyl('leaf', 0.012, 0.012, 0.5 + r() * 0.3, { x, y: 0.28, z, color: 0x5d7c36 }, 4);
    const fg = new THREE.CircleGeometry(0.06 + r() * 0.05, 5); B.add('paint', fg, { x, y: 0.55 + r() * 0.3, z, rx: -Math.PI / 2, color: c }); fg.dispose();
  }
  for (let i = 0; i < 90; i++) { const x = -33 + r() * 62, z = -29 + r() * 49; if (Math.hypot(x / 21, z / 18) < 1.15) continue; B.add('leaf', new THREE.ConeGeometry(0.28 + r() * 0.22, 0.9 + r() * 0.5, 5), { x, y: 0.5, z, color: new THREE.Color(0xc9b66a).offsetHSL(0, 0, (r() - 0.5) * 0.1) }); }

  // ---- 주변 저층 건물 (성수동: 붉은 벽돌 2~5층 + 1층 카페/편집숍, 골함석 창고) ----
  // 블록을 9~15 m 필지로 나눠 필지마다 높이·벽돌색·간판·옥상 설비를 다르게. 3 m 격자에 맞춰 창이 층에 맞는다.
  const awnCols = [0x1f3a2c, 0x161616, 0x8a4a2e, 0xd8cfbb, 0x2c3e55, 0x6b6f3a];
  const signCols = [0xfff1d6, 0xffd38a, 0xf7f3ea, 0xbfe3ff, 0xffb37a];
  const lotBuild = (cx, cz, w, d, face, floors, type) => {
    const h = floors * 3;
    if (type === 'ware') {
      const hw = 6 + (r() * 3 | 0);
      B.box('corr', w, hw, d, { x: cx, y: hw / 2, z: cz });
      const sh = new THREE.Shape(); const span = face[0] ? d : w; sh.moveTo(-span / 2 - 0.3, 0); sh.lineTo(span / 2 + 0.3, 0); sh.lineTo(0, span * 0.22); sh.closePath();
      const rg = new THREE.ExtrudeGeometry(sh, { depth: (face[0] ? w : d) + 0.6, bevelEnabled: false }); rg.translate(0, 0, -((face[0] ? w : d) + 0.6) / 2);
      B.add('paint', rg, { x: cx, y: hw, z: cz, ry: face[0] ? 0 : Math.PI / 2, color: [0x5a5d60, 0x7a4b36, 0x8b9094][(r() * 3) | 0] }); rg.dispose();
      // 정면: 큰 셔터 + 카페로 바꾼 유리 입구
      const fx = cx + face[0] * (w / 2 + 0.03), fz = cz + face[1] * (d / 2 + 0.03), lw = face[0] ? 0.06 : Math.min(w * 0.5, 7), ld = face[0] ? Math.min(d * 0.5, 7) : 0.06;
      B.box('shop', lw, 3, ld, { x: fx, y: 1.5, z: fz });
      B.box('paint', face[0] ? 0.08 : lw + 0.4, 0.5, face[0] ? ld + 0.4 : 0.08, { x: fx + face[0] * 0.02, y: 3.35, z: fz + face[1] * 0.02, color: signCols[(r() * 5) | 0] });
      return hw + span * 0.22;
    }
    const mat = type === 'white' ? 'brickW' : type === 'dark' ? 'brickD' : 'brickR';
    B.box('shop', w, 3, d, { x: cx, y: 1.5, z: cz });
    B.box(mat, w, h - 3, d, { x: cx, y: 3 + (h - 3) / 2, z: cz, color: new THREE.Color(1, 1, 1).multiplyScalar(0.9 + r() * 0.12) });
    B.box('paint', w + 0.12, 0.18, d + 0.12, { x: cx, y: 3.0, z: cz, color: 0x2a2a2a }); // 1층 위 띠
    B.box('paint', w + 0.2, 0.55, d + 0.2, { x: cx, y: h + 0.27, z: cz, color: type === 'white' ? 0xc9c5bc : 0x6e5a4e }); // 파라펫
    // 차양 + 간판
    const fx = cx + face[0] * (w / 2), fz = cz + face[1] * (d / 2), along = face[0] ? d : w;
    if (r() < 0.7) { const aw = along * (0.45 + r() * 0.4); B.box('paint', face[0] ? 1.1 : aw, 0.08, face[0] ? aw : 1.1, { x: fx + face[0] * 0.55, y: 2.75, z: fz + face[1] * 0.55, rx: face[1] * 0.18, rz: -face[0] * 0.18, color: awnCols[(r() * awnCols.length) | 0] }); }
    if (r() < 0.75) { const sx = fx + face[0] * 0.5 + (face[1] ? (r() - 0.5) * along * 0.6 : 0), sz = fz + face[1] * 0.5 + (face[0] ? (r() - 0.5) * along * 0.6 : 0); B.box('lamp', face[0] ? 0.6 : 0.12, 1.4, face[0] ? 0.12 : 0.6, { x: sx, y: 4.6, z: sz, color: signCols[(r() * 5) | 0] }); }
    // 옥상: 물탱크·실외기·철제 난간
    if (r() < 0.6) B.cyl('metal', 0.9, 0.9, 1.6, { x: cx + (r() - 0.5) * w * 0.5, y: h + 0.8, z: cz + (r() - 0.5) * d * 0.5, color: r() < 0.5 ? 0xcfd8de : 0x6f9fc4 }, 12);
    for (let i = 0, n = 1 + (r() * 3 | 0); i < n; i++) B.box('paint', 0.9, 0.7, 0.6, { x: cx + (r() - 0.5) * w * 0.7, y: h + 0.35, z: cz + (r() - 0.5) * d * 0.7, color: 0xd9d9d4 });
    if (r() < 0.4) { B.box('metal', face[0] ? 0.05 : w * 0.6, 1.0, face[0] ? d * 0.6 : 0.05, { x: cx + face[0] * (w / 2 - 0.3), y: h + 1.0, z: cz + face[1] * (d / 2 - 0.3), color: 0x2a2c2e }); }
    return h;
  };
  const snap = (v) => Math.max(6, Math.round(v / 3) * 3);
  const bld = (x, z, w, d, hMax) => {
    wall(x, z, w, d, 60);
    const face = Math.abs(x) > Math.abs(z) * 1.2 ? [-Math.sign(x), 0] : [0, -Math.sign(z)];
    const alongX = !face[0]; const L = alongX ? w : d; let u = -L / 2;
    while (u < L / 2 - 0.5) {
      let lw = snap(9 + r() * 6); if (L / 2 - (u + lw) < 6) lw = L / 2 - u;
      const c = u + lw / 2, floors = Math.max(2, Math.min(5, Math.round(hMax / 3 * (0.45 + r() * 0.6))));
      const t = r(), type = t < 0.5 ? 'red' : t < 0.68 ? 'white' : t < 0.84 ? 'ware' : 'dark';
      lotBuild(alongX ? x + c : x, alongX ? z : z + c, alongX ? lw - 0.15 : w, alongX ? d : lw - 0.15, face, floors, type);
      u += lw;
    }
  };
  const list = [
    [-55, -10, 18, 22, 11], [-55, 14, 18, 18, 8], [-76, -2, 18, 30, 16], [-48, -42, 30, 18, 14], [-10, -50, 24, 20, 15], [20, -50, 22, 20, 12], [48, -46, 30, 18, 15],
    [80, -10, 22, 30, 12], [85, 18, 24, 18, 9], [-30, 50, 24, 16, 13], [-3, 52, 22, 14, 9], [26, 50, 24, 16, 15], [60, 52, 30, 18, 12], [-62, 48, 20, 16, 10], [100, 50, 26, 18, 15], [110, -30, 24, 24, 15],
  ];
  for (const b of list) bld(...b);
  // 전봇대 + 전선 (서울 골목의 상징) — 전선은 한 번에 LineSegments
  const wirePts = []; const poles = [];
  for (let x = -70; x <= 120; x += 21) poles.push([x, SITE.roadZ1 + 1.2]);
  for (let z = -60; z <= 20; z += 20) poles.push([SITE.laneX1 + 0.8, z]);
  for (const [x, z] of poles) { circ.push({ x, z, r: 0.2, y0: 0, y1: 9 }); B.cyl('conc', 0.13, 0.19, 9.5, { x, y: 4.75, z, color: 0xb9b6ae }, 8); B.box('metal', 1.6, 0.1, 0.1, { x, y: 8.6, z, color: 0x333333 }); B.box('metal', 1.2, 0.1, 0.1, { x, y: 7.8, z, color: 0x333333 }); if (r() < 0.5) B.cyl('paint', 0.25, 0.25, 0.7, { x: x + 0.4, y: 7.2, z, color: 0x7c8287 }, 8); }
  const chain = (ps) => { for (let i = 0; i < ps.length - 1; i++) for (const [oy, ox] of [[8.6, -0.7], [8.6, 0.7], [7.8, 0]]) { const a = ps[i], b2 = ps[i + 1]; let prev = null; for (let k = 0; k <= 8; k++) { const t = k / 8, sag = Math.sin(t * Math.PI) * 0.55; const p = [a[0] + (b2[0] - a[0]) * t + (a[1] === b2[1] ? 0 : ox), oy - sag, a[1] + (b2[1] - a[1]) * t + (a[1] === b2[1] ? ox * 0.3 : 0)]; if (prev) wirePts.push(...prev, ...p); prev = p; } } };
  chain(poles.filter(([, z]) => z === SITE.roadZ1 + 1.2)); chain(poles.filter(([x]) => x === SITE.laneX1 + 0.8));
  // 길가 주차 차 몇 대 (단순 박스)
  const carCols = [0xe8e8e6, 0x1c1d20, 0x8c9095, 0x3d4b5c, 0xc8c3b6];
  for (let i = 0; i < 9; i++) { const x = -60 + i * 17 + r() * 4; if (Math.abs(x) < 10) continue; const z = SITE.roadZ1 - 1.6, c = carCols[(r() * 5) | 0]; B.box('gloss', 4.3, 0.75, 1.8, { x, y: 0.62, z, color: c }); B.box('gloss', 2.3, 0.6, 1.6, { x: x - 0.2, y: 1.28, z, color: c }); B.box('frame', 2.25, 0.42, 1.62, { x: x - 0.2, y: 1.3, z, color: 0x101418 }); for (const dx of [-1.35, 1.35]) for (const dz of [-0.82, 0.82]) B.cyl('frame', 0.33, 0.33, 0.22, { x: x + dx, y: 0.33, z: z + dz, rx: Math.PI / 2, color: 0x111111 }, 10); }
  // 멀리 고층 몇 개 (스카이라인)
  for (const [x, z, w, h] of [[-190, -150, 24, 60], [-120, -190, 22, 80], [-30, -200, 26, 55], [60, -190, 22, 75], [150, -160, 20, 60], [210, -60, 18, 50]]) { B.box('stucco', w, h, w, { x, y: h / 2, z, color: [0xc9c4ba, 0xb7bcc2, 0xd6d0c4][(x / 10 | 0) & 1 ? 1 : 0] }); B.box('paint', w + 0.4, 1.2, w + 0.4, { x, y: h + 0.6, z, color: 0x7d7f82 }); }

  // 사인 글자 (밝은 plane)
  const meshes = B.build(mats);
  const tex = labelTex('HAUS NOWHERE', { w: 640, h: 160, bg: '#d4d1ca', fg: '#1b1b1b', font: '800 66px "Helvetica Neue", Arial, sans-serif', sub: 'SEOUL · 433 Ttukseom-ro', subFont: '500 28px "Helvetica Neue", Arial, sans-serif' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); sign.position.set(10.5, 0.62, 19.44); sign.name = 'gm-sign';
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1a1a })); wires.name = 'gm-wires';
  const out = { meshes: [...meshes, sign, wires], colliders: cols, circles: circ, domes: null };

  // ---- 맞은편 대지 설치: 숨 쉬는 에어돔 밭 (오리지널) ----
  {
    const geo = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const N = 54, im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.15, envMapIntensity: 1.2 }), N); im.name = 'gm-domes';
    const dat = [], col = new THREE.Color(), rr = mulberry(77);
    for (let i = 0; i < N; i++) {
      const x = SITE.lot.x0 + 3 + rr() * (SITE.lot.x1 - SITE.lot.x0 - 6), z = SITE.lot.z0 + 3 + rr() * (SITE.lot.z1 - SITE.lot.z0 - 6);
      const s = 0.7 + rr() * 1.5, gold = i === 17;
      dat.push({ x, z, s: gold ? 2.4 : s, ph: rr() * 6.3, sp: 0.4 + rr() * 0.5, sq: 0.8 + rr() * 0.5 });
      col.set(gold ? 0xe8b53a : 0x0e0e12); im.setColorAt(i, col);
    }
    im.frustumCulled = false; out.domes = { mesh: im, dat };
    out.meshes.push(im);
    // 중앙 오브제: 가장 큰 금색 돔 옆에 선 얇은 사람 실루엣 조형 (오리지널: 우산 쓴 철사 인물)
  }
  out.update = (t) => {
    const im = out.domes.mesh, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    out.domes.dat.forEach((d, i) => { const b = 1 + 0.12 * Math.sin(t * d.sp * 1.6 + d.ph); p.set(d.x, 0, d.z); s.set(d.s * b, d.s * d.sq * (0.9 + 0.22 * Math.sin(t * d.sp + d.ph)), d.s * b); m4.compose(p, q, s); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true;
  };
  out.update(0);
  return out;
}
