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
  B.project('gravel', 3).project('asphalt', 6).project('paver', 2).project('brick', 3).project('stucco', 3).project('conc', 2.4);
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
  for (let i = 0; i < 520; i++) {
    const side = r(); let x, z;
    if (side < 0.34) { x = -33 + r() * 9; z = -29 + r() * 46; } else if (side < 0.68) { x = SITE.laneX0 - 1 - r() * 8; z = -29 + r() * 46; } else { x = -33 + r() * 63; z = -29 + r() * 7; }
    if (Math.hypot(x / 21, z / 18) < 1.12) continue;
    const c = flowerCols[(r() * 6) | 0];
    B.cyl('leaf', 0.012, 0.012, 0.5 + r() * 0.3, { x, y: 0.28, z, color: 0x5d7c36 }, 4);
    B.sph('paint', 0.07 + r() * 0.05, { x, y: 0.55 + r() * 0.3, z, color: c }, 6, 4);
  }
  for (let i = 0; i < 90; i++) { const x = -33 + r() * 62, z = -29 + r() * 49; if (Math.hypot(x / 21, z / 18) < 1.15) continue; B.add('leaf', new THREE.ConeGeometry(0.28 + r() * 0.22, 0.9 + r() * 0.5, 5), { x, y: 0.5, z, color: new THREE.Color(0xc9b66a).offsetHSL(0, 0, (r() - 0.5) * 0.1) }); }

  // ---- 주변 저층 건물 (성수 공장지대) ----
  const bld = (x, z, w, d, h, kind) => {
    wall(x, z, w, d, 60);
    B.box(kind ? 'brick' : 'stucco', w, h, d, { x, y: h / 2, z, color: kind ? new THREE.Color(0xffffff).offsetHSL(0, 0, (r() - 0.5) * 0.15) : 0xffffff });
    B.box('paint', w + 0.3, 0.4, d + 0.3, { x, y: h + 0.2, z, color: 0x6d6a66 });
  };
  const list = [
    [-55, -10, 18, 22, 11, 1], [-55, 14, 18, 18, 8, 0], [-76, -2, 18, 30, 16, 0], [-48, -42, 30, 18, 14, 1], [-10, -50, 24, 20, 21, 0], [20, -50, 22, 20, 12, 1], [48, -46, 30, 18, 17, 0],
    [80, -10, 22, 30, 12, 1], [85, 18, 24, 18, 9, 0], [-30, 50, 24, 16, 13, 0], [-3, 52, 22, 14, 9, 1], [26, 50, 24, 16, 18, 1], [60, 52, 30, 18, 12, 0], [-62, 48, 20, 16, 10, 1], [100, 50, 26, 18, 22, 0], [110, -30, 24, 24, 15, 1],
  ];
  for (const b of list) bld(...b);
  // 멀리 고층 몇 개 (스카이라인)
  for (const [x, z, w, h] of [[-190, -150, 24, 60], [-120, -190, 22, 80], [-30, -200, 26, 55], [60, -190, 22, 75], [150, -160, 20, 60], [210, -60, 18, 50]]) B.box('stucco', w, h, w, { x, y: h / 2, z, color: 0xaeb4bb });

  // 사인 글자 (밝은 plane)
  const meshes = B.build(mats);
  const tex = labelTex('HAUS NOWHERE', { w: 640, h: 160, bg: '#d4d1ca', fg: '#1b1b1b', font: '800 66px "Helvetica Neue", Arial, sans-serif', sub: 'SEOUL · 433 Ttukseom-ro', subFont: '500 28px "Helvetica Neue", Arial, sans-serif' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); sign.position.set(10.5, 0.62, 19.44); sign.name = 'gm-sign';
  const out = { meshes: [...meshes, sign], colliders: cols, circles: circ, domes: null };

  // ---- 맞은편 대지 설치: 숨 쉬는 에어돔 밭 (오리지널) ----
  {
    const geo = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
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
