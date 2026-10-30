// [bumpinto] 롯데월드타워 절차적 모델 (555m · 123층). 외부 에셋/로고/문자 없음 — 형태 특징만 재현
//  - 둥근 사각 평면이 위로 갈수록 곡선(볼록 프로파일)으로 가늘어짐
//  - 각 면 중앙의 세로 이음매(seam: 안쪽으로 파인 슬릿)가 바닥부터 꼭대기까지, 크라운에서 벌어져 4개의 꽃잎 형태로 갈라짐
//  - 크라운(497~555m): 다이아그리드 격자 + 일부 유리, 야간 조명
//  - 밝은 은백색 유리 커튼월(캔버스 텍스처: 패널/멀리언/스팬드럴), 기계층 루버 띠, 야간 창문 조명, 항공장애등
// 파라미터: src/landmarks/landmarks.json 의 params (height, floors, baseHalfM, topHalfM, rotDeg)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const rng = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const PANELS = 8, FLOORS_PER_CELL = 4;

function curtainWall() {
  const W = 1024, H = 1024, r = rng(555);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
  const [dc, d] = mk(), [nc, n] = mk();
  n.fillStyle = '#000'; n.fillRect(0, 0, W, H);
  const pw = W / PANELS, fh = H / FLOORS_PER_CELL;
  for (let j = 0; j < FLOORS_PER_CELL; j++) for (let i = 0; i < PANELS; i++) {
    const x = i * pw, y = j * fh, t = r();
    const g = d.createLinearGradient(x, y, x + pw * 0.6, y + fh);
    g.addColorStop(0, `rgb(${214 + t * 18},${224 + t * 14},${232 + t * 10})`);
    g.addColorStop(0.55, `rgb(${178 + t * 20},${194 + t * 16},${208 + t * 14})`);
    g.addColorStop(1, `rgb(${196 + t * 16},${208 + t * 12},${220 + t * 10})`);
    d.fillStyle = g; d.fillRect(x, y, pw, fh);
    d.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`; d.fillRect(x + 4, y + 4, pw * 0.28, fh * 0.84);
    // 층간 프릿(불투명 띠): 셀 아래쪽 = 층 바닥
    d.fillStyle = 'rgba(232,236,238,0.92)'; d.fillRect(x, y + fh * 0.86, pw, fh * 0.14);
    d.fillStyle = 'rgba(150,160,170,0.5)'; d.fillRect(x, y + fh * 0.86, pw, 2);
    if (r() < 0.62) { const warm = r() < 0.75; n.fillStyle = warm ? `rgba(255,${222 + r() * 25},${170 + r() * 40},${0.45 + r() * 0.5})` : `rgba(215,232,255,${0.4 + r() * 0.5})`; n.fillRect(x + 3, y + 3, pw - 6, fh * 0.82); }
  }
  for (let i = 0; i <= PANELS; i++) { d.fillStyle = '#eef1f3'; d.fillRect(i * pw - 3, 0, 6, H); d.fillStyle = 'rgba(120,130,140,0.35)'; d.fillRect(i * pw + 3, 0, 2, H); }
  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return { day: tex(dc), night: tex(nc) };
}
function louvreTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#9aa2a8'; x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 64; i += 6) { x.fillStyle = '#6f777d'; x.fillRect(0, i, 256, 3); }
  for (let i = 0; i < 256; i += 32) { x.fillStyle = '#c9cfd3'; x.fillRect(i, 0, 3, 64); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

// 둥근 사각 + 면 중앙 이음매 단면. 반환: [{x,z,seam}] (CCW), 꼭짓점 수는 파라미터가 같으면 항상 동일
function section(half, rad, seamW, seamD, nc = 9, ns = 5) {
  const pts = [], h = half, r = Math.min(rad, h * 0.95), sw = seamW / 2, s = h - r;
  for (let f = 0; f < 4; f++) {
    const a = (f * Math.PI) / 2, c = Math.cos(a), sn = Math.sin(a), a2 = a + Math.PI / 2, c2 = Math.cos(a2), s2 = Math.sin(a2);
    const P = (u, v, seam = 0) => { pts.push({ x: u * c - v * sn, z: u * sn + v * c, seam }); };
    const Q = (u, v, seam = 0) => { pts.push({ x: u * c2 - v * s2, z: u * s2 + v * c2, seam }); };
    P(h - seamD, sw, 1); P(h, sw, 1); P(h, sw, 0);
    for (let k = 1; k <= ns; k++) P(h, sw + ((s - sw) * k) / ns);
    for (let k = 1; k < nc; k++) { const t = (k / nc) * (Math.PI / 2); P(s + r * Math.cos(t), s + r * Math.sin(t)); }
    for (let k = 0; k < ns; k++) Q(h, -s + ((s - sw) * k) / ns);
    Q(h, -sw, 0); Q(h, -sw, 1); Q(h - seamD, -sw, 1);
  }
  return pts;
}
const profile = (y, P) => { // 몸체 반폭(볼록 곡선 테이퍼)
  const t = Math.min(1, y / P.occ); return P.baseHalf - (P.baseHalf - P.occHalf) * Math.pow(t, 1.55);
};

export function createLotteWorldTower(params = {}) {
  const P = { height: 555, floors: 123, baseHalf: 34.5, occHalf: 15.5, topHalf: 5.5, occ: 497, ...params };
  if (params.baseHalfM) P.baseHalf = params.baseHalfM;
  if (params.topHalfM) P.occHalf = params.topHalfM + 4;
  const fh = P.occ / P.floors;
  const g = new THREE.Group(); g.name = 'lotte-world-tower';
  const tx = curtainWall();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#f6f9fb', map: tx.day, emissiveMap: tx.night, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.2, metalness: 0.45, envMap: P.env || null, envMapIntensity: 1.0, vertexColors: true });
  // ---------- 몸체 로프트 ----------
  const rings = [], ys = [];
  for (let i = 0; i <= P.floors; i++) ys.push(i * fh);
  const seamAt = (y) => 2.4 + 1.6 * Math.pow(y / P.occ, 2);
  let nPer = 0;
  for (const y of ys) { const h = profile(y, P); const s = section(h, h * 0.42, seamAt(y), 1.5); nPer = s.length; rings.push(s); }
  const pos = [], uv = [], col = [], idx = [];
  const perimBase = (() => { const s = rings[0]; let L = 0; for (let i = 0; i < s.length; i++) { const a = s[i], b = s[(i + 1) % s.length]; L += Math.hypot(b.x - a.x, b.z - a.z); } return L; })();
  const cellsAround = Math.round(perimBase / (PANELS * 1.55));
  rings.forEach((s, j) => {
    let L = 0; const cum = [0]; for (let i = 0; i < s.length; i++) { const a = s[i], b = s[(i + 1) % s.length]; L += Math.hypot(b.x - a.x, b.z - a.z); cum.push(L); }
    for (let i = 0; i <= s.length; i++) {
      const p = s[i % s.length]; pos.push(p.x, ys[j], p.z); uv.push((cum[i] / L) * cellsAround, ys[j] / (fh * FLOORS_PER_CELL));
      const k = p.seam ? 0.62 : 1; col.push(k * 0.96, k * 0.98, k);
    }
  });
  const W = nPer + 1;
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < nPer; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, b, d, a, d, c); }
  // 감김 방향: 단면이 CCW(x-z) 이므로 바깥 법선이 맞도록 필요시 뒤집기 (첫 면 법선 검사)
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); body.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  body.setIndex(idx); body.computeVertexNormals();
  { const n = body.attributes.normal, p = body.attributes.position; let out = 0; for (let i = 0; i < W; i++) out += n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i); if (out < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } body.setIndex(idx); body.computeVertexNormals(); } }
  const bodyMesh = new THREE.Mesh(body, bodyMat); bodyMesh.castShadow = bodyMesh.receiveShadow = true; g.add(bodyMesh);

  // ---------- 기계/피난층 루버 띠 ----------
  const louvMat = new THREE.MeshLambertMaterial({ map: louvreTex(), color: '#d5dade' });
  const bands = [];
  for (const fl of [21, 22, 39, 40, 61, 62, 72, 85, 86, 102, 103]) {
    const y0 = fl * fh, y1 = y0 + fh; const s0 = section(profile(y0, P) + 0.12, (profile(y0, P) + 0.12) * 0.42, seamAt(y0), 1.5), s1 = section(profile(y1, P) + 0.12, (profile(y1, P) + 0.12) * 0.42, seamAt(y1), 1.5);
    const bp = [], bu = [], bi = []; let L = 0;
    for (let i = 0; i <= s0.length; i++) { const a = s0[i % s0.length], b = s1[i % s1.length]; if (i) L += Math.hypot(a.x - s0[i - 1].x, a.z - s0[i - 1].z); bp.push(a.x, y0, a.z, b.x, y1, b.z); bu.push(L / 6, 0, L / 6, 1); }
    for (let i = 0; i < s0.length; i++) { const a = i * 2; bi.push(a, a + 2, a + 3, a, a + 3, a + 1); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2)); bg.setIndex(bi); bg.computeVertexNormals();
    { const n = bg.attributes.normal; if (n.getX(0) * bp[0] + n.getZ(0) * bp[2] < 0) { for (let i = 0; i < bi.length; i += 3) { const t = bi[i + 1]; bi[i + 1] = bi[i + 2]; bi[i + 2] = t; } bg.setIndex(bi); bg.computeVertexNormals(); } }
    bands.push(bg);
  }
  const bandMesh = new THREE.Mesh(mergeGeometries(bands), louvMat); bandMesh.castShadow = true; g.add(bandMesh);

  // ---------- 지붕 슬래브(전망층 위) ----------
  { const s = section(profile(P.occ, P) - 0.5, (profile(P.occ, P) - 0.5) * 0.42, seamAt(P.occ), 1.5); const sh = new THREE.Shape(s.map((p) => new THREE.Vector2(p.x, -p.z))); const sg = new THREE.ShapeGeometry(sh); sg.rotateX(-Math.PI / 2); sg.translate(0, P.occ + 0.4, 0); g.add(new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: '#b9c0c6' }))); }

  // ---------- 크라운: 코너마다 꽃잎 4장, 이음매에서 벌어짐 ----------
  const crownH = P.height - P.occ, NV = 14, NU = 22;
  const crownHalf = (v) => profile(P.occ, P) - (profile(P.occ, P) - P.topHalf) * Math.pow(v, 1.25);
  // 꽃잎 표면 점: 코너 c(0..3), u(0..1: 한 이음매 → 다음 이음매), v(0..1 높이)
  function petalPoint(c, u, v) {
    const h = crownHalf(v), r = h * (0.42 + 0.25 * v), gap = (seamAt(P.occ) / 2 + v * v * h * 0.55) / h; // 이음매 벌어짐(정규화)
    // 둘레 매개변수: 면 c 중앙(+gap) → 코너 → 면 c+1 중앙(-gap). 둥근 사각 둘레 위 점을 각도법으로 근사
    const a0 = (c * Math.PI) / 2, span = Math.PI / 2;
    const ang = a0 + span * (gap * 0.32 + (1 - gap * 0.64) * u);
    const s = h - r, ca = Math.cos(ang), sa = Math.sin(ang);
    // 둥근 사각(초타원 근사) 위 점
    const n = 2 + 6 * (1 - r / h); const R = h / Math.pow(Math.pow(Math.abs(ca), n) + Math.pow(Math.abs(sa), n), 1 / n);
    void s; return new THREE.Vector3(R * ca, P.occ + v * crownH, R * sa);
  }
  const members = [], glass = [];
  const beam = (a, b, t) => { const d = new THREE.Vector3().subVectors(b, a), L = d.length(); const bx = new THREE.BoxGeometry(t, L, t); bx.translate(0, L / 2, 0); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); bx.applyQuaternion(q); bx.translate(a.x, a.y, a.z); members.push(bx); };
  for (let c = 0; c < 4; c++) {
    const K = 7, slope = 1.15;
    for (let k = -K; k <= 2 * K; k++) for (const sg of [1, -1]) { // 다이아그리드 대각선
      let prev = null;
      for (let j = 0; j <= NV; j++) { const v = j / NV, u = k / K + sg * v * slope; if (u < 0 || u > 1) { prev = null; continue; } const p = petalPoint(c, u, v); if (prev) beam(prev, p, 0.55); prev = p; }
    }
    for (let j = 0; j <= NV; j += 2) { let prev = null; for (let i = 0; i <= NU; i++) { const p = petalPoint(c, i / NU, j / NV); if (prev) beam(prev, p, 0.5); prev = p; } } // 수평 링
    for (const u of [0, 1]) { let prev = null; for (let j = 0; j <= NV; j++) { const p = petalPoint(c, u, j / NV); if (prev) beam(prev, p, 0.9); prev = p; } } // 꽃잎 가장자리(굵은 부재)
    // 아래쪽 절반은 유리(반투명)
    const gp = [], gi = [];
    for (let j = 0; j <= NV / 2; j++) for (let i = 0; i <= NU; i++) { const p = petalPoint(c, i / NU, j / NV); gp.push(p.x * 0.985, p.y, p.z * 0.985); }
    for (let j = 0; j < NV / 2; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i; gi.push(a, a + 1, a + NU + 2, a, a + NU + 2, a + NU + 1); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.setIndex(gi); gg.computeVertexNormals(); glass.push(gg);
  }
  const crownMat = new THREE.MeshStandardMaterial({ color: '#e9edf0', roughness: 0.35, metalness: 0.6, envMap: P.env || null, emissive: new THREE.Color('#fff1d6'), emissiveIntensity: 0 });
  const crown = new THREE.Mesh(mergeGeometries(members), crownMat); crown.castShadow = true; g.add(crown);
  const glassMat = new THREE.MeshStandardMaterial({ color: '#d5e4ee', transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, roughness: 0.08, metalness: 0.5, envMap: P.env || null, emissive: new THREE.Color('#ffe9c4'), emissiveIntensity: 0 });
  g.add(new THREE.Mesh(mergeGeometries(glass), glassMat));
  // 크라운 내부 코어(전망대 상부 기계실/첨탑 코어)
  const core = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 6.5, crownH * 0.72, 16), new THREE.MeshLambertMaterial({ color: '#aeb6bc' })); core.position.y = P.occ + crownH * 0.36; core.castShadow = true; g.add(core);

  // ---------- 저층 로비 캐노피(지상 입구) ----------
  { const can = new THREE.Mesh(new THREE.BoxGeometry(P.baseHalf * 1.1, 0.8, 9), new THREE.MeshLambertMaterial({ color: '#d9dde0' })); can.position.set(0, 9, P.baseHalf + 4); can.castShadow = true; g.add(can);
    const cols = [-1, 1].map((sx) => { const cg = new THREE.CylinderGeometry(0.5, 0.5, 9, 10); cg.translate(sx * P.baseHalf * 0.5, 4.5, P.baseHalf + 7.5); return cg; });
    g.add(new THREE.Mesh(mergeGeometries(cols), new THREE.MeshLambertMaterial({ color: '#c7cdd2' }))); } // [perf] 기둥 2개 병합

  // ---------- 항공장애등 ----------
  const redMat = new THREE.MeshBasicMaterial({ color: '#ff2a1a' });
  // [perf] 항공장애등 8개 → 병합 메시 1개 (드로우콜 8 → 1)
  const lights = [];
  for (let c = 0; c < 4; c++) for (const v of [1, 0]) { const p = petalPoint(c, 0.5, v); const sg = new THREE.SphereGeometry(v ? 0.9 : 0.7, 8, 6); sg.translate(p.x, p.y + 0.8, p.z); lights.push(sg); }
  const lightMesh = new THREE.Mesh(mergeGeometries(lights), redMat); lightMesh.name = 'aviation-lights'; g.add(lightMesh);

  let night = 0, t = 0;
  g.userData = {
    params: P,
    setNight(v) { night = v; bodyMat.envMapIntensity = crownMat.envMapIntensity = glassMat.envMapIntensity = v ? 0.12 : 1; bodyMat.emissiveIntensity = v * 1.1; crownMat.emissiveIntensity = v * 0.75; glassMat.emissiveIntensity = v * 0.5; },
    update(dt) { t += dt; const on = Math.floor(t * 1.0) % 2 === 0; redMat.color.set(on || night < 0.5 ? '#ff2a1a' : '#3a0a08'); },
    stats: () => ({ bodyTris: idx.length / 3, crownMembers: members.length, crownDrawCalls: 1, meshes: g.children.length }), // 크라운 다이아그리드: 부재 전체가 병합 메시 1개
  };
  return g;
}
