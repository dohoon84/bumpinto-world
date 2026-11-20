// [gentle-monster] 실내 전시·가구·오브제 배치 + 움직이는 설치물 + 층별 조명 슬롯.
import * as THREE from 'three';
import { Builder, ringAt, mulberry } from './geo.js';
import { Rig, mat } from './rig.js';
import * as F from './figures.js';
import { labelTex } from './textures.js';
import { PLAN as P } from './plan.js';

const FY = P.floorY;
const TAU = Math.PI * 2;

export function buildInterior(mats, imats, shell, ext, sculpts) {
  const SC = sculpts; // name → BufferGeometry (SDF 조각)
  const sculptMesh = (name, key, o = {}) => { const m = new THREE.Mesh(SC[name], M[key]); m.position.set(o.x || 0, o.y || 0, o.z || 0); m.rotation.y = o.ry || 0; m.scale.setScalar(o.s || 1); m.name = 'gm-sculpt-' + name; return m; };
  const M = { ...mats, ...imats };
  const meshes = [], anims = [], aabbs = [], circles = [];
  const mk = (n) => { const B = new Builder(); B.project('floor2', 1.6).project('ply', 1.2); return B; };
  const flush = (B, name, parent = null, floor = 0) => { const ms = B.build(M); for (const m of ms) { m.name = `gm-f${floor}-${name}-${m.userData.key}`; (parent || { add: (x) => meshes.push(x) }).add(m); } return ms; };
  const col = (x0, x1, z0, z1, y0, y1) => aabbs.push({ t: 'a', x0, x1, z0, z1, y0, y1 });
  const circ = (x, z, r, y0, y1) => circles.push({ x, z, r, y0, y1 });
  const labels = [];
  const label = (text, { w = 2.4, h = 0.6, x, y, z, ry = 0, sub = '', bg = '#101012', fg = '#f4f1ea', font, parent } = {}) => {
    const tx = labelTex(text, { w: 1024, h: Math.round(1024 * h / w), bg, fg, sub, font: font || '700 120px system-ui, sans-serif', subFont: '500 54px system-ui, sans-serif' });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tx, toneMapped: false }));
    m.position.set(x, y, z); m.rotation.y = ry; m.name = 'gm-label'; (parent || { add: (o) => meshes.push(o) }).add(m); labels.push(m); return m;
  };
  /** 호 모양 벽/카운터: 박스 조각을 이어 붙임 */
  const arc = (B, key, cx, cz, R, a0, a1, h, th, y0, color, { solid = true, segLen = 0.8 } = {}) => {
    const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) * R / segLen));
    for (let i = 0; i < n; i++) {
      const am = a0 + (a1 - a0) * (i + 0.5) / n, x = cx + Math.cos(am) * R, z = cz + Math.sin(am) * R, ch = Math.abs(a1 - a0) * R / n * 1.12;
      B.box(key, ch, h, th, { x, y: y0 + h / 2, z, ry: -am - Math.PI / 2, color });
      if (solid) circ(x, z, th / 2 + 0.12, y0, y0 + h);
    }
  };
  const place = (rig, B, o = {}) => { rig.emit(B, mat(o)); };

  // ================= 1F — PROJECT SPACE · TAMBURINS =================
  {
    const y0 = FY[1], B = mk(1); const yy = y0 + 0.0;
    // 잠자는 하운드
    const hg = new THREE.Group(); hg.position.set(-0.9, yy, 4.7); hg.scale.setScalar(0.9); hg.name = 'gm-hound'; meshes.push(hg);
    hg.add(sculptMesh('hound', 'velvet'), sculptMesh('houndArmor', 'alu'));
    { const cB = mk(1); cB.tor('alu', 0.6, 0.07, { x: 3.0, y: 1.36, z: 0.03, ry: Math.PI / 2, rx: 0.52, color: 0xc9ccd1 }, 10, 40); flush(cB, 'collar', hg, 1); }
    col(-3.7, 4.6, 3.7, 6.0, yy, yy + 2.2); circ(-4.0, 5.6, 0.5, yy, yy + 1); circ(4.3, 4.7, 0.6, yy, yy + 1);
    anims.push((t) => { const k = Math.sin(t * 1.05); hg.scale.set(0.9, 0.9 * (1 + 0.013 * k), 0.9 * (1 + 0.01 * k)); });
    // 웅크린 알루미늄 거인 둘
    for (const [x, z, ry] of [[-7.4, 5.4, 0.7], [8.4, 2.0, -2.3]]) { meshes.push(sculptMesh('giantCrouch', 'alu', { x, y: yy, z, ry })); circ(x, z, 1.5, yy, yy + 3.6); }
    // 곡선 카운터 + 병 (검은 테라조)
    const cx = -9, cz = -10, R = 3.4;
    arc(B, 'floor2', cx, cz, R, 0.12 * Math.PI, 0.88 * Math.PI, 1.05, 0.95, yy, 0xffffff, { segLen: 0.7 });
    for (let i = 0; i < 14; i++) {
      const a = (0.2 + 0.6 * i / 13) * Math.PI, r = new Rig(); F.bottle(r, { h: 0.2 + (i % 3) * 0.05, w: 0.06, color: [0xf2efe6, 0xe9c35a, 0x2a2b2e, 0xd9e7e4][i % 4], shape: i % 3 });
      place(r, B, { x: cx + Math.cos(a) * R, y: yy + 1.05, z: cz + Math.sin(a) * R });
    }
    // 노란 타원 러그
    for (const [x, z, rx, rz, c] of [[-9, -5.2, 2.6, 1.4, 0xf0c32a], [4.5, -4.5, 2.4, 1.3, 0xf0c32a], [-1.0, -3.4, 1.6, 2.4, 0xe9e5dc]]) B.add('matte', new THREE.CylinderGeometry(1, 1, 0.025, 36), { x, y: yy + 0.014, z, sx: rx, sz: rz, color: c });
    // 섬형 진열대
    {
      const x = 8.5, z = 7.8;
      B.cy('floor2', 1, 1.0, { x, y: yy + 0.5, z, sx: 2.0, sz: 1.25 }, 40);
      for (const dx of [-1.3, 0, 1.3]) circ(x + dx, z, 1.05, yy, yy + 1.2);
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, r = new Rig(); F.bottle(r, { h: 0.24, w: 0.06, color: [0xf2efe6, 0xcf6a3a, 0x2a2b2e][i % 3], shape: (i + 1) % 3 }); place(r, B, { x: x + Math.cos(a) * 1.0, y: yy + 1.0, z: z + Math.sin(a) * 0.55 }); }
    }
    // 목재 슬랫 벽 (북쪽) + 로고 사인
    for (let i = 0; i < 36; i++) B.box('ply', 0.1, 4.0, 0.16, { x: -12.2 + i * 0.2, y: yy + 2.0, z: -11.75, color: [0xc9a26e, 0xd3b283, 0xbf955e][i % 3] });
    flush(B, 'main', null, 1);
    label('TAMBURINS', { w: 3.4, h: 0.7, x: -9, y: yy + 3.05, z: -11.6, ry: 0, bg: '#c9a26e', fg: '#1a1410', font: '700 150px Georgia, serif' });
    label('PROJECT SPACE', { w: 2.6, h: 0.4, x: -9.1, y: yy + 2.55, z: -11.6, bg: '#c9a26e', fg: '#3a2a18', font: '600 110px system-ui, sans-serif' });
  }

  // ================= 2F — GENTLE MONSTER (검정 · 거울 · 키네틱) =================
  {
    const y0 = FY[2], B = mk(2);
    // 키네틱 크롬 링 (천장에 매달림)
    const rc = [-0.5, y0 + 3.0, 1.2];
    B.cy('floor2', 0.9, 0.5, { x: rc[0], y: y0 + 0.25, z: rc[2] }, 28); B.cy('lamp', 0.72, 0.03, { x: rc[0], y: y0 + 0.51, z: rc[2], color: 0x9fe8ff }, 28); circ(rc[0], rc[2], 1.0, y0, y0 + 0.6);
    const rg = new THREE.Group(); rg.position.set(rc[0], y0 + 2.35, rc[2]); meshes.push(rg);
    const rings = [];
    [[1.5, 0.07, 0.35, 0.0], [1.2, 0.06, 1.1, 0.5], [0.9, 0.055, 0.2, 1.3], [0.6, 0.05, 0.7, 2.1]].forEach(([R, r, tilt, ph], i) => {
      const RB = mk(2); RB.tor('chrome', R, r, { color: 0xeef1f4 }, 12, 64);
      for (let k = 0; k < 3; k++) RB.sph('chrome', 0.13 - i * 0.015, { x: Math.cos(k * 2.09) * R, y: Math.sin(k * 2.09) * R, color: 0xf6f8fa });
      const g = new THREE.Group(); flush(RB, `ring${i}`, g, 2); g.rotation.set(tilt, ph, 0); rg.add(g); rings.push([g, i, tilt, ph]);
    });
    const cB = mk(2); cB.sph('chrome', 0.28, { color: 0xffffff }, 24, 16); cB.sph('lamp', 0.1, { color: 0xbff4ff }); flush(cB, 'core', rg, 2);
    anims.push((t) => { for (const [g, i, tilt, ph] of rings) { g.rotation.x = tilt + t * (0.35 + i * 0.17) * (i % 2 ? -1 : 1); g.rotation.y = ph + t * (0.22 + i * 0.1); g.rotation.z = t * 0.12 * (i + 1); } });
    // 무릎 꿇은 선글라스 거인 (크롬)
    for (const [x, z, ry] of [[4.3, 7.4, -0.9], [-6.8, -4.8, 2.4]]) {
      const gg = new THREE.Group(); gg.position.set(x, y0 + 0.02, z); gg.rotation.y = ry; gg.scale.setScalar(0.95); meshes.push(gg);
      gg.add(sculptMesh('giantKneel', 'chromeHi'));
      const sB = mk(2), sr = new Rig(); F.shades(sr, { s: 4.6 }); sr.emit(sB, mat({ y: 3.27, z: 0.22 + 0.44 })); flush(sB, 'shades', gg, 2);
      circ(x, z, 1.5, y0, y0 + 3.9);
    }
    // 로봇 팔 4기 (움직임)
    const arms = [];
    for (let i = 0; i < 4; i++) {
      const bx = -7.5 + i * 4.0, bz = -4.2 - (i % 2) * 1.2;
      B.cy('floor2', 0.55, 0.45, { x: bx, y: y0 + 0.35, z: bz }, 24); B.cy('mech', 0.34, 0.2, { x: bx, y: y0 + 0.66, z: bz, color: 0xbfc5cc }, 20); circ(bx, bz, 0.7, y0, y0 + 0.7);
      const root = new THREE.Group(); root.position.set(bx, y0 + 0.78, bz); meshes.push(root);
      const a1 = new THREE.Group(); root.add(a1);
      const b1 = mk(2); b1.cy('mech', 0.22, 0.35, { y: 0.1, color: 0xbfc5cc }, 20); b1.box('mech', 0.34, 1.9, 0.3, { y: 1.0, color: 0xd5d9de }); b1.cy('mech', 0.2, 0.42, { y: 1.95, rx: 0, rz: Math.PI / 2, color: 0x1a1b1e }, 18); flush(b1, `armA${i}`, a1, 2);
      const a2 = new THREE.Group(); a2.position.y = 1.95; a1.add(a2);
      const b2 = mk(2); b2.box('mech', 0.28, 0.26, 1.7, { z: 0.8, color: 0xd5d9de }); b2.cy('mech', 0.16, 0.34, { z: 1.65, rz: Math.PI / 2, color: 0x1a1b1e }, 16);
      const sr = new Rig(); F.shades(sr, { s: 5.2, ry: 0 }); sr.emit(b2, mat({ y: -0.2, z: 1.95 })); flush(b2, `armB${i}`, a2, 2);
      arms.push([a1, a2, i]);
    }
    anims.push((t) => { for (const [a1, a2, i] of arms) { const ph = i * 1.4; a1.rotation.y = Math.sin(t * 0.55 + ph) * 1.05 + (i % 2 ? 2.4 : 0.6); a2.rotation.x = -0.55 + Math.sin(t * 0.9 + ph) * 0.5; } });
    // 버섯 무리 (살짝 부푼다)
    const mg = new THREE.Group(); mg.position.set(-8.5, y0 + 0.02, 9.6); meshes.push(mg);
    { const mB = mk(2), mr = new Rig(), rnd = mulberry(5);
      const caps = [0xd8433a, 0xf0efe9, 0x31c48d, 0xf0b324, 0x6a7cff, 0xe9e5dc]; 
      for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = 0.2 + (i % 4) * 0.55; mr.push({ x: Math.cos(a) * rr * 1.4, z: Math.sin(a) * rr * 1.1 }); F.mushroom(mr, { d: 0.9 + rnd() * 1.5, h: 0.9 + rnd() * 2.0, cap: caps[i % caps.length], lean: (rnd() - 0.5) * 0.35, seed: i + 3 }); mr.pop(); }
      mr.emit(mB); flush(mB, 'mush', mg, 2); circ(-8.5, 9.6, 2.2, y0, y0 + 3.2);
      anims.push((t) => { const k = 1 + 0.02 * Math.sin(t * 0.9); mg.scale.set(1, k, 1); }); }
    // 선글라스 진열대 (거울 큐브)
    for (let i = 0; i < 9; i++) {
      const x = -9.6 + i * 2.35, z = 12.4 - Math.abs(i - 4) * 0.45, h = 0.85 + (i % 3) * 0.22;
      B.box('chrome', 0.75, h, 0.75, { x, y: y0 + 0.02 + h / 2, z, color: 0xcfd4da }); col(x - 0.4, x + 0.4, z - 0.4, z + 0.4, y0, y0 + h);
      const sr = new Rig(); F.shades(sr, { s: 3.2, ry: 0.4 - i * 0.1 }); sr.emit(B, mat({ x, y: y0 + 0.02 + h + 0.1, z }));
    }
    // 크롬 튜브 숲 벽 + 사인 (북쪽 벽)
    for (let i = 0; i < 47; i++) B.cy('chrome', 0.045, 3.9 - (i % 5) * 0.12, { x: -12.6 + i * 0.17, y: y0 + 0.02 + (3.9 - (i % 5) * 0.12) / 2, z: -14.2 + (i % 2) * 0.05, color: 0xd9dde2 }, 8);
    B.box('gloss', 8.6, 3.95, 0.2, { x: -8.6, y: y0 + 2.1, z: -14.45, color: 0x0b0c0e });
    flush(B, 'main', null, 2);
    label('GENTLE MONSTER', { w: 4.4, h: 0.6, x: -8.6, y: y0 + 3.6, z: -14.1, bg: '#0b0c0e', fg: '#f4f2ec', font: '300 120px Georgia, serif' });
  }

  // ================= 3F — ATiiSSU · NUFLAAT · TAMBURINS (회색 샤그) =================
  {
    const y0 = FY[3], B = mk(3);
    // 하얀 곡선 칸막이
    const wall = (cx, cz, R, a0, a1) => { arc(B, 'matte', cx, cz, R, a0, a1, 3.2, 0.2, y0 + 0.02, 0xf4f2ee, { segLen: 0.6 }); arc(B, 'chrome', cx, cz, R, a0, a1, 0.06, 0.24, y0 + 3.22, 0xdfe3e8, { solid: false, segLen: 0.6 }); };
    wall(-7.5, -1.5, 4.6, 0.65 * Math.PI, 1.55 * Math.PI);
    wall(6.0, 7.0, 4.0, 1.05 * Math.PI, 1.9 * Math.PI);
    wall(-1.0, -9.5, 3.4, 0.3 * Math.PI, 0.9 * Math.PI);
    // 합판 껍질 조각 (천천히 회전)
    const sg = new THREE.Group(); sg.position.set(-2.0, y0 + 0.02, 7.4); meshes.push(sg);
    { const sB = mk(3), sr = new Rig(); F.plyShell(sr, {}); sr.emit(sB); flush(sB, 'ply', sg, 3); circ(-2.0, 7.4, 1.9, y0, y0 + 3.8); anims.push((t) => { sg.rotation.y = t * 0.06; }); }
    // 구겨진 크롬 마네킹
    for (let i = 0; i < 5; i++) { const x = 7.4 + (i % 3) * 1.1 - 0.8, z = -5.2 + Math.floor(i / 3) * 1.6 + (i % 2) * 0.5; meshes.push(sculptMesh(i % 2 ? 'mannequinB' : 'mannequinA', 'chromeHi', { x, y: y0 + 0.02, z, ry: i * 1.3 - 0.4, s: 1 + (i % 3) * 0.04 })); circ(x, z, 0.45, y0, y0 + 2.0); }
    // 하얀 보행 로봇
    { const r = new Rig(); F.walkerBot(r, {}); place(r, B, { x: -9.5, y: y0 + 0.02, z: 8.6, ry: 0.5, sx: 0.8, sy: 0.8, sz: 0.8 }); circ(-9.5, 8.6, 1.5, y0, y0 + 3.6); }
    // 아쿠아 받침대 + 병
    for (let i = 0; i < 7; i++) {
      const x = -2.5 + (i % 4) * 1.4, z = -3.6 + Math.floor(i / 4) * 1.5, h = 0.55 + (i % 3) * 0.25;
      B.cy('gloss', 0.5, h, { x, y: y0 + 0.02 + h / 2, z, color: 0x58cfc9 }, 24); circ(x, z, 0.55, y0, y0 + h);
      const r = new Rig(); F.bottle(r, { h: 0.28, w: 0.07, color: [0xf2efe6, 0xe9c35a, 0x2a2b2e][i % 3], shape: i % 3 }); place(r, B, { x, y: y0 + 0.02 + h, z });
    }
    // 긴 하얀 테이블 + 식기
    { const x = -9.0, z = 12.0; B.box('matte', 4.2, 0.08, 1.1, { x, y: y0 + 0.78, z, color: 0xf4f2ee }); for (const sx of [-1.9, 1.9]) B.box('matte', 0.1, 0.76, 1.0, { x: x + sx, y: y0 + 0.4, z, color: 0xf4f2ee }); col(x - 2.2, x + 2.2, z - 0.6, z + 0.6, y0, y0 + 0.9);
      for (let i = 0; i < 6; i++) { const r = new Rig(); F.plate(r, { s: 1.4, color: [0xe9e4d6, 0xcfd8d4, 0xe8c9a8][i % 3] }); place(r, B, { x: x - 1.6 + i * 0.64, y: y0 + 0.82, z: z - 0.2 }); const c = new Rig(); F.cup(c, { s: 1.6, color: [0xe9e4d6, 0x9fb7b0][i % 2] }); place(c, B, { x: x - 1.5 + i * 0.64, y: y0 + 0.82, z: z + 0.25 }); } }
    flush(B, 'main', null, 3);
    label('ATiiSSU · NUFLAAT', { w: 4.0, h: 0.5, x: -12.0, y: y0 + 3.3, z: 12.4, ry: Math.PI + 0.4, bg: '#f4f2ee', fg: '#222', font: '500 90px system-ui, sans-serif' });
  }

  // ================= 5F — NUDAKE TEAHOUSE (올리브 · 검정 와플 천장) =================
  {
    const y0 = FY[5], B = mk(5), ring = shell.ring;
    // 올리브 드레이프 (창가)
    { const pos = [], uv = [], idx = []; let vi = 0; const SEG = 520, y1 = 22.45;
      for (let j = 0; j < SEG; j++) {
        const s0 = j / SEG * ring.perim, s1 = (j + 1) / SEG * ring.perim; const seg = Math.floor(s0 / 3.0); if (seg % 3 === 2) continue;
        for (const [s, k] of [[s0, 0], [s1, 1]]) { const q = ringAt(ring, s, P.skin - 0.14 - 0.12 * (0.5 + 0.5 * Math.sin(s * 2.4))); pos.push(q[0], y0 + 0.02, q[1], q[0], y1, q[1]); uv.push(s / 1.6, 0, s / 1.6, 2.2); }
        idx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3); vi += 4;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(1), 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, M.drape); m.name = 'gm-f5-drape'; meshes.push(m); m.userData.colorMul = 1; }
    // 테이블 + 의자
    const tables = [[-9, 0.5], [-9, 8], [-2, 9.5], [4.5, 5], [-3, -6.5], [6.5, -6]];
    tables.forEach(([x, z], i) => {
      B.cy('matte', 0.05, 0.74, { x, y: y0 + 0.4, z, color: 0x2b2118 }, 10); B.cy('matte', 0.75, 0.05, { x, y: y0 + 0.77, z, color: 0x3a2b1d }, 28); B.cy('matte', 0.28, 0.04, { x, y: y0 + 0.04, z, color: 0x2b2118 }, 14); circ(x, z, 1.15, y0, y0 + 1.0);
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + i; B.box('matte', 0.46, 0.05, 0.46, { x: x + Math.cos(a) * 1.0, y: y0 + 0.46, z: z + Math.sin(a) * 1.0, ry: -a, color: 0x7a7a3c }); B.box('matte', 0.46, 0.5, 0.05, { x: x + Math.cos(a) * 1.2, y: y0 + 0.72, z: z + Math.sin(a) * 1.2, ry: -a + Math.PI / 2, color: 0x7a7a3c }); for (const [dx, dz] of [[-1, -1], [1, 1]]) B.box('matte', 0.04, 0.44, 0.04, { x: x + Math.cos(a) * 1.0 + dx * 0.16, y: y0 + 0.22, z: z + Math.sin(a) * 1.0 + dz * 0.16, color: 0x2b2118 }); }
      const r = new Rig(); F.plate(r, { s: 1.0, color: 0xece6d6 }); place(r, B, { x, y: y0 + 0.8, z }); const c = new Rig(); F.cup(c, { s: 1.4, color: 0xd9cdb0 }); place(c, B, { x: x + 0.3, y: y0 + 0.8, z: z + 0.2 });
    });
    // 카운터(북쪽 긴 곡선)
    B.box('floor2', 7.5, 1.1, 0.8, { x: -8.6, y: y0 + 0.55, z: -12.4 }); col(-12.4, -4.8, -12.8, -12.0, y0, y0 + 1.2);
    // 둥근 램프 (천장에서 늘어짐)
    const lg = new THREE.Group(); meshes.push(lg); const LB = mk(5); const rnd = mulberry(77);
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, rr = 2.5 + (i % 3) * 2.9, x = Math.cos(a) * rr * 1.5, z = Math.sin(a) * rr * 1.0 + 1, h = 0.9 + rnd() * 1.1; LB.cy('frame', 0.006, h, { x, y: 22.6 - h / 2, z, color: 0x222222 }, 4); LB.sph('lamp', 0.22 + (i % 2) * 0.08, { x, y: 22.6 - h - 0.2, z, color: 0xffe2b0 }, 16, 12); }
    flush(LB, 'globes', lg, 5);
    // 씨앗 꼬투리 설치(공중에 매달림, 살랑)
    const pg = new THREE.Group(); pg.position.set(0.5, 22.55, 3.0); meshes.push(pg);
    { const pB = mk(5), pr = new Rig(); const prn = mulberry(12);
      for (let i = 0; i < 9; i++) { const a = i * 2.2, rr = 0.2 + (i % 5) * 0.55, drop = 0.7 + prn() * 1.0, h = 0.9 + prn() * 0.7; pr.push({ x: Math.cos(a) * rr, y: -drop, z: Math.sin(a) * rr }); pr.cyl('frame', 0.005, drop + 0.1, { y: drop / 2 + 0.05, color: 0x222222, lo: true }); F.pod(pr, { h, w: 0.34 + prn() * 0.12, color: [0xe8dcc0, 0xd9c79c, 0xf1ead8, 0xc9b184][i % 4], glow: i % 3 === 0 }); pr.pop(); }
      pr.emit(pB); flush(pB, 'pods', pg, 5); anims.push((t) => { pg.rotation.z = Math.sin(t * 0.5) * 0.015; pg.rotation.x = Math.cos(t * 0.43) * 0.015; pg.rotation.y = t * 0.03; }); }
    flush(B, 'main', null, 5);
    label('NUDAKE', { w: 3.0, h: 0.6, x: -8.6, y: y0 + 2.5, z: -14.85, bg: '#23241a', fg: '#e9e4cf', font: '400 130px Georgia, serif' });
  }

  // ================= 조명 슬롯 (층마다 5개 포인트 라이트를 옮겨 쓴다) =================
  const lightSlots = { // [x, (미사용), z, 색, 세기] — preview 가 천장에서 아래로 스포트라이트를 쏜다
    1: [[0, FY[1] + 3.3, 4.7, 0xfff1dc, 35], [-9, FY[1] + 3.0, -7, 0xffe2b4, 45], [8.5, FY[1] + 3.2, 5, 0xfff1dc, 35], [-7, FY[1] + 3.2, 5.5, 0xfff1dc, 30], [10, FY[1] + 3.2, -1, 0xfff1dc, 35]],
    2: [[-0.5, FY[2] + 3.0, 1.2, 0xbfeaff, 90], [4.3, FY[2] + 3.2, 7.4, 0xffffff, 55], [-6.8, FY[2] + 3.2, -4.8, 0xffffff, 55], [0, FY[2] + 3.0, 11.5, 0xffe9d0, 45], [-8.5, FY[2] + 3.0, 9.6, 0xffd2b8, 45]],
    3: [[-2, FY[3] + 3.2, 7.4, 0xfff0d8, 70], [8, FY[3] + 3.2, -4.6, 0xffffff, 55], [-9.5, FY[3] + 3.2, 8.6, 0xffffff, 55], [0, FY[3] + 3.2, -3, 0xbff5ef, 45], [-9, FY[3] + 3.0, 12, 0xfff0d8, 40]],
    5: [[0.5, FY[5] + 2.6, 3.0, 0xffd9a0, 70], [-9, FY[5] + 2.8, 0.5, 0xffe0b0, 45], [-2, FY[5] + 2.8, 9.5, 0xffe0b0, 45], [4.5, FY[5] + 2.8, 5, 0xffe0b0, 45], [0, FY[5] + 2.8, -9, 0xffe0b0, 40]],
  };
  // ================= 바닥 빛 웅덩이 + 벽 스캘럽 (한 장으로 합침 → 1 draw) =================
  {
    const PB = new Builder(); const pools = [];
    for (const fl of [1, 2, 3, 5]) for (const s of lightSlots[fl]) pools.push([s[0], FY[fl], s[2], 2.6, s[3], 0.9]);
    const extra = {
      1: [[-9, -7, 2.2], [-9, -10.5, 1.8], [8.5, 7.8, 2.4], [-1, -4.5, 2.0], [6, -8, 1.8], [-12, 1, 1.6]],
      2: [[-8.5, 12, 1.6], [-4, 12.4, 1.6], [1, 12.4, 1.6], [6, 12, 1.6], [-7.5, -4.6, 1.8], [-3.5, -5.6, 1.8], [0.5, -4.6, 1.8], [4.5, -5.6, 1.8]],
      3: [[-1, -3, 2.4], [-9, 12, 2.2], [-7.5, -1.5, 2.0], [6, 5, 2.0]],
      5: [[-9, 8, 1.8], [-2, 9.5, 1.8], [4.5, 5, 1.8], [-3, -6.5, 1.8], [6.5, -6, 1.8], [-9, 0.5, 1.8], [-8.6, -11.6, 2.4]],
    };
    const tint = { 1: 0xfff0d8, 2: 0xdde9ff, 3: 0xfff4e4, 5: 0xffd9a0 };
    for (const fl of [1, 2, 3, 5]) for (const [x, z, r] of extra[fl]) pools.push([x, FY[fl], z, r, tint[fl], 0.55]);
    const c3 = new THREE.Color();
    for (const [x, y, z, r, hex, k] of pools) { c3.set(hex).multiplyScalar(k); const g = new THREE.PlaneGeometry(r * 2, r * 2); g.rotateX(-Math.PI / 2); PB.add('pool', g, { x, y: y + 0.02, z, color: c3.getHex() }); g.dispose(); }
    // 벽 스캘럽: 안쪽 피부를 따라 2.4m 간격 (2·3·5층), 1층은 유리라 생략
    const ring = shell.ring;
    for (const fl of [2, 3, 5]) for (let s0 = 0; s0 < ring.perim; s0 += 2.4) {
      const q = ringAt(ring, s0, P.skin - 0.03), g = new THREE.PlaneGeometry(1.4, 2.6); g.rotateY(Math.atan2(-q[2], -q[3]));
      c3.set(tint[fl]).multiplyScalar(fl === 2 ? 0.35 : 0.5); PB.add('scallop', g, { x: q[0], y: FY[fl] + (fl === 5 ? 2.15 : 2.5), z: q[1], color: c3.getHex() }); g.dispose();
    }
    for (const m of PB.build(M)) { m.renderOrder = 2; meshes.push(m); }
  }
  return { meshes, colliders: aabbs, circles, anims, labels, lightSlots, update(t) { for (const f of anims) f(t); } };
}
