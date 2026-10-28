// [truck] 'Steel Truck' — 각진 스테인리스 웨지형 픽업 (실물 치수, 절차적 지오메트리 + 캔버스 텍스처, 로고/상표 없음)
// 로컬 좌표: +z 앞, +x 오른쪽, y 위. 원점 = 차체 중심 바닥(지면).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const DIM = { L: 5.68, W: 2.03, WM: 2.41, H: 1.79, WB: 3.81, TRACK: 1.72, R: 0.445, TW: 0.31, CLR: 0.40 };
const HL = DIM.L / 2, HW = DIM.W / 2;
const NOSE_Y = 1.06, TAIL_Y = 1.12, APEX_Z = 0.35, LOW_TOP = 1.05, BELT = 1.13;
const AX = DIM.WB / 2; // 앞/뒤 차축 z = ±1.905

// 지붕 라인: 코(앞 끝) → 정점 → 테일게이트
export const yTop = (z) => (z >= APEX_Z ? NOSE_Y + ((HL - z) / (HL - APEX_Z)) * (DIM.H - NOSE_Y) : TAIL_Y + ((z + HL) / (HL + APEX_Z)) * (DIM.H - TAIL_Y));
const halfTop = (yt) => (yt <= BELT ? HW - 0.015 : HW - 0.015 - (yt - BELT) * 0.56); // 텀블홈(유리 쪽으로 좁아짐)

export const COLORS = {
  stainless: { name: 'Stainless', color: '#c9ccd0', metal: 0.9, rough: 0.34, brushed: true },
  black: { name: 'Matte Black', color: '#1d1f22', metal: 0.25, rough: 0.78 },
  white: { name: 'Gloss White', color: '#eef0f2', metal: 0.1, rough: 0.28 },
  red: { name: 'Red', color: '#b3121d', metal: 0.35, rough: 0.32 },
  blue: { name: 'Blue', color: '#1f4fa8', metal: 0.4, rough: 0.3 },
  green: { name: 'Satin Green', color: '#3e5a3a', metal: 0.3, rough: 0.55 },
  tan: { name: 'Desert Tan', color: '#b59a6e', metal: 0.2, rough: 0.6 },
  orange: { name: 'Orange', color: '#e8641b', metal: 0.3, rough: 0.35 },
};

// ---------- 텍스처 ----------
function brushedTex() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#d4d6d9'; x.fillRect(0, 0, 512, 128);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) { const y = r() * 128, l = 40 + r() * 300, g = 190 + r() * 60; x.strokeStyle = `rgba(${g},${g},${g + 4},${0.25 + r() * 0.35})`; x.lineWidth = 0.6 + r() * 0.8; x.beginPath(); x.moveTo(r() * 512, y); x.lineTo(r() * 512 + l, y + (r() - 0.5) * 0.6); x.stroke(); }
  // 패널 이음새(얇은 어두운 선) — 수평 반복 텍스처라 균일하게만
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function satinTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const d = x.createImageData(64, 64); let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < d.data.length; i += 4) { const v = 236 + r() * 19; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function wheelTex() { // 에어로 커버: 각진 육각 패턴 + 어두운 바퀴살 홈 (로고 없음)
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#3a3d42'; x.fillRect(0, 0, 256, 256);
  x.translate(128, 128);
  x.fillStyle = '#4a4e54'; x.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; x.lineTo(Math.cos(a) * 118, Math.sin(a) * 118); } x.fill();
  x.strokeStyle = '#1b1c1f'; x.lineWidth = 7;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; x.beginPath(); x.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); x.lineTo(Math.cos(a) * 112, Math.sin(a) * 112); x.stroke(); }
  x.fillStyle = '#26282c'; x.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; x.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); } x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function tireTex() { // 트레드
  const c = document.createElement('canvas'); c.width = 256; c.height = 32; const x = c.getContext('2d');
  x.fillStyle = '#1e1f21'; x.fillRect(0, 0, 256, 32); x.fillStyle = '#0f1011';
  for (let i = 0; i < 32; i++) { x.fillRect(i * 8, 4, 4, 10); x.fillRect(i * 8 + 4, 18, 4, 10); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

// 야외 반사용 간단 환경맵 (하늘 그라데이션 + 모래색 지면)
function makeEnv(renderer) {
  const sc = new THREE.Scene(), g = new THREE.SphereGeometry(10, 32, 16), col = [];
  const top = new THREE.Color('#5fa8e6'), hor = new THREE.Color('#f2f6f8'), gnd = new THREE.Color('#bfae8c'), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 10; const c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.5)) : hor.clone().lerp(gnd, Math.min(1, -y * 6)); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  sc.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0.02); pm.dispose(); g.dispose();
  return rt.texture;
}

// ---------- 지오메트리 ----------
const pushTri = (pos, uv, a, b, c) => { for (const v of [a, b, c]) { pos.push(v[0], v[1], v[2]); uv.push(v[2] * 0.35, v[1] * 0.35); } };
const quad = (pos, uv, a, b, c, d) => { pushTri(pos, uv, a, b, c); pushTri(pos, uv, a, c, d); };
const finish = (pos, uv) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g; };

// 윗 차체: 단면(벨트라인 위 텀블홈)을 z 방향으로 로프트 — 지붕선이 구간별 직선이라 꺾이는 지점만 단면으로 두면 정확
function upperBody() {
  const zs = [-HL, APEX_Z, HL - (BELT - NOSE_Y) / ((DIM.H - NOSE_Y) / (HL - APEX_Z)), HL];
  const sec = (z) => { const yt = yTop(z), yb = Math.min(BELT, yt), wt = halfTop(yt); return [[-HW, LOW_TOP, z], [-HW, yb, z], [-wt, yt, z], [wt, yt, z], [HW, yb, z], [HW, LOW_TOP, z]]; };
  const pos = [], uv = [];
  for (let i = 0; i < zs.length - 1; i++) {
    const A = sec(zs[i]), B = sec(zs[i + 1]);
    for (let k = 0; k < 5; k++) quad(pos, uv, A[k], B[k], B[k + 1], A[k + 1]);
  }
  const R = sec(-HL), F = sec(HL);
  for (let k = 1; k < 5; k++) { pushTri(pos, uv, R[0], R[k], R[k + 1]); pushTri(pos, uv, F[0], F[k + 1], F[k]); }
  return finish(pos, uv);
}
// 아랫 차체: 측면 실루엣(각진 육각 휠아치) 압출
function lowerBody() {
  const s = new THREE.Shape(), arch = (zc, dir) => { const pts = [[zc - 0.68, 0.42], [zc - 0.47, 0.98], [zc + 0.47, 0.98], [zc + 0.68, 0.42]]; (dir > 0 ? pts : pts.reverse()).forEach(([z, y]) => s.lineTo(z, y)); };
  s.moveTo(-HL, 0.66); s.lineTo(-HL + 0.3, 0.42); arch(-AX, 1); arch(AX, 1); s.lineTo(HL - 0.32, 0.42); s.lineTo(HL, 0.68); s.lineTo(HL, LOW_TOP); s.lineTo(-HL, LOW_TOP); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: DIM.W, bevelEnabled: false });
  g.translate(0, 0, -HW); g.rotateY(-Math.PI / 2); // shape x(=z축 길이) → 월드 z,  깊이 → 월드 x
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  const p = ng.attributes.position, u = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { u[i * 2] = p.getZ(i) * 0.35; u[i * 2 + 1] = p.getY(i) * 0.35; }
  ng.setAttribute('uv', new THREE.BufferAttribute(u, 2)); return ng;
}
const box = (w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z); return g.toNonIndexed(); };
// 측면 텀블홈 면 위의 점 (z, s: 0=벨트, 1=지붕)
const sidePt = (side, z, s, out = 0.012) => { const yt = yTop(z), yb = Math.min(BELT, yt), wt = halfTop(yt); const x = HW + (wt - HW) * s, y = yb + (yt - yb) * s; const nx = (yt - yb), ny = (HW - wt); const L = Math.hypot(nx, ny) || 1; return [side * (x + (nx / L) * out), y + (ny / L) * out, z]; };
function glass() {
  const pos = [], uv = [];
  for (const side of [-1, 1]) {
    const poly = [[0.32, 0.1], [1.92, 0.1], [0.62, 0.86], [0.32, 0.86]], poly2 = [[-1.15, 0.1], [0.18, 0.1], [0.18, 0.86], [-0.55, 0.86]];
    for (const P of [poly, poly2]) {
      const v = P.map(([z, s]) => sidePt(side, z, s));
      if (side > 0) { pushTri(pos, uv, v[0], v[1], v[2]); pushTri(pos, uv, v[0], v[2], v[3]); } else { pushTri(pos, uv, v[0], v[2], v[1]); pushTri(pos, uv, v[0], v[3], v[2]); }
    }
  }
  // 앞유리: 지붕 평면 위, 폭은 그 높이의 상단 폭보다 약간 좁게
  const ws = (z, k) => { const yt = yTop(z), w = halfTop(yt) - 0.06; return [k * w, yt + 0.012, z]; };
  const z0 = 1.72, z1 = 0.5; quad(pos, uv, ws(z0, -1), ws(z0, 1), ws(z1, 1), ws(z1, -1));
  return finish(pos, uv);
}
function trim() { // 검정 무광: 휠아치 플레어, 범퍼 하단, 사이드 미러, 하부 섀시
  const gs = [];
  for (const zc of [-AX, AX]) for (const sd of [-1, 1]) {
    const x = sd * (HW + 0.03);
    gs.push(box(0.07, 0.07, 0.96, x, 1.0, zc)); // 아치 윗변
    for (const k of [-1, 1]) { const L = Math.hypot(0.21, 0.56), a = Math.atan2(0.21, 0.56) * k; gs.push(box(0.07, L + 0.05, 0.07, x, 0.70, zc + k * 0.575, 0, -a)); }
  }
  gs.push(box(DIM.W + 0.02, 0.16, 0.08, 0, 0.6, HL - 0.02), box(DIM.W + 0.02, 0.15, 0.08, 0, 0.58, -HL + 0.02)); // 범퍼 하단 밸런스
  gs.push(box(1.62, 0.34, 4.9, 0, 0.62, 0)); // 섀시/배터리 팩 (아치 사이로 비쳐 보이는 부분)
  for (const sd of [-1, 1]) { gs.push(box(0.2, 0.11, 0.2, sd * (HW + 0.09), 1.2, 1.78, 0, 0, sd * 0.12)); gs.push(box(0.03, 0.15, 0.03, sd * (HW + 0.02), 1.14, 1.82)); }
  gs.push(box(DIM.W - 0.06, 0.02, 0.05, 0, TAIL_Y - 0.005, -HL + 0.6)); // 베드 커버 이음
  return mergeGeometries(gs);
}
function wheelGeo() { // 타이어(옆면 r) + 에어로 커버. +x 방향이 바깥쪽
  const tire = new THREE.CylinderGeometry(DIM.R, DIM.R, DIM.TW, 28, 1, false); tire.rotateZ(Math.PI / 2);
  const cover = new THREE.CylinderGeometry(DIM.R * 0.78, DIM.R * 0.78, 0.02, 6); cover.rotateZ(-Math.PI / 2); cover.translate(DIM.TW / 2 + 0.005, 0, 0);
  return { tire, cover };
}

let shared = null;
function getShared(renderer) {
  if (shared) return shared;
  const env = renderer ? makeEnv(renderer) : null;
  const brushed = brushedTex(), satin = satinTex();
  const bodyMats = {};
  for (const [k, c] of Object.entries(COLORS)) {
    const m = new THREE.MeshStandardMaterial({ color: c.color, metalness: c.metal, roughness: c.rough, map: c.brushed ? brushed : null, envMap: env, envMapIntensity: c.brushed ? 1.0 : 0.7, flatShading: true });
    bodyMats[k] = m;
  }
  const { tire, cover } = wheelGeo();
  const coverTex = wheelTex(); // 커버 윗면(cap)에만 텍스처가 보이도록 uv는 CylinderGeometry cap uv 사용
  shared = {
    env, bodyMats,
    geo: { upper: upperBody(), lower: lowerBody(), glass: glass(), trim: trim(), tire, cover,
      front: box(DIM.W - 0.08, 0.035, 0.03, 0, NOSE_Y - 0.03, HL + 0.006), rear: box(DIM.W - 0.04, 0.05, 0.03, 0, TAIL_Y - 0.07, -HL - 0.006) },
    mat: {
      glass: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, color: '#0d1117', metalness: 0.6, roughness: 0.08, envMap: env, envMapIntensity: 1.3 }),
      trim: new THREE.MeshStandardMaterial({ color: '#1a1b1e', metalness: 0.1, roughness: 0.85, flatShading: true }),
      tire: new THREE.MeshStandardMaterial({ color: '#ffffff', map: tireTex(), roughness: 0.92, metalness: 0 }),
      cover: new THREE.MeshStandardMaterial({ color: '#ffffff', map: coverTex, roughness: 0.5, metalness: 0.4, envMap: env, flatShading: true }),
      front: new THREE.MeshBasicMaterial({ color: '#f4f8ff' }),
      rear: new THREE.MeshBasicMaterial({ color: '#ff1a1a' }),
      rearOn: new THREE.MeshBasicMaterial({ color: '#ff5050' }),
    },
  };
  return shared;
}

// 트럭 하나 생성. 반환 group.userData = { wheels:[{steer, spin}], rearLight }
export function createTruck(colorKey = 'stainless', renderer = null) {
  const S = getShared(renderer), g = new THREE.Group();
  const body = new THREE.Group(); g.add(body); // 서스펜션 흔들림용
  const bm = S.bodyMats[colorKey] || S.bodyMats.stainless;
  const add = (geo, mat, parent = body, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; };
  add(S.geo.upper, bm); add(S.geo.lower, bm); add(S.geo.glass, S.mat.glass, body, false); add(S.geo.trim, S.mat.trim);
  add(S.geo.front, S.mat.front, body, false); const rear = add(S.geo.rear, S.mat.rear, body, false);
  const wheels = [];
  for (const [zc, front] of [[AX, true], [-AX, false]]) for (const sd of [-1, 1]) {
    const steer = new THREE.Group(); steer.position.set(sd * DIM.TRACK / 2, DIM.R, zc); g.add(steer);
    const side = new THREE.Group(); side.scale.x = sd; steer.add(side); // 왼쪽은 미러링 → 커버가 바깥을 향함
    const spin = new THREE.Group(); side.add(spin);
    add(S.geo.tire, S.mat.tire, spin); add(S.geo.cover, S.mat.cover, spin, false);
    wheels.push({ steer, spin, front });
  }
  g.userData = { wheels, body, rear, colorKey };
  return g;
}
export function setBrake(truck, on) { truck.userData.rear.material = on ? shared.mat.rearOn : shared.mat.rear; }
