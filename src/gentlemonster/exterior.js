// [gentle-monster] 사옥 외관: 하층 곡면 5겹(알약 띠창) · 중층 유리+내민보 · 상층 UHPC 십자 전망 박스.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { Builder, ringShape, ringAt, mulberry } from './geo.js';
import { PLAN as P } from './plan.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 링을 프로필(t,off)로 스윕한 띠 지오메트리 (바깥 법선) */
function sweep(ring, y0, h, prof, seg = 192, flip = false) {
  const M = prof.length, pos = [], idx = [];
  for (let j = 0; j <= seg; j++) {
    const s = (j / seg) * ring.perim;
    for (let k = 0; k < M; k++) { const [t, off] = prof[k]; const q = ringAt(ring, s, off); pos.push(q[0], y0 + t * h, q[1]); }
  }
  for (let j = 0; j < seg; j++) for (let k = 0; k < M - 1; k++) {
    const a = j * M + k, b = (j + 1) * M + k, c = (j + 1) * M + k + 1, d = j * M + k + 1;
    if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** 링 위 알약 모양 창 (호 길이 s0..s1, 높이 y0..y1, 링 offset) */
function pillGeo(ring, s0, s1, ya, yb, off) {
  const hh = (yb - ya) / 2, yc = (ya + yb) / 2, cols = [];
  const cap = 6;
  for (let i = 0; i <= cap; i++) { const th = (i / cap) * Math.PI / 2; cols.push([s0 + hh - hh * Math.cos(th), hh * Math.sin(th)]); }
  const mid0 = s0 + hh, mid1 = s1 - hh, nMid = Math.max(1, Math.ceil((mid1 - mid0) / 0.8));
  for (let i = 1; i < nMid; i++) cols.push([mid0 + (mid1 - mid0) * (i / nMid), hh]);
  for (let i = cap; i >= 0; i--) { const th = (i / cap) * Math.PI / 2; cols.push([s1 - hh + hh * Math.cos(th), hh * Math.sin(th)]); }
  // 중복 제거 (첫 cap 끝 = mid0)
  const cs = []; for (const c of cols) { if (!cs.length || Math.abs(c[0] - cs[cs.length - 1][0]) > 1e-4 || Math.abs(c[1] - cs[cs.length - 1][1]) > 1e-4) cs.push(c); }
  const pos = [], idx = [];
  for (const [u, hv] of cs) { const q = ringAt(ring, u, off); pos.push(q[0], yc - hv, q[1], q[0], yc + hv, q[1]); }
  for (let i = 0; i < cs.length - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// 하층 한 겹(띠) 프로필: [t(0..1), 바깥 offset(m)] — 아래 배, 띠창 오목, 위 배(눈썹), 위쪽으로 말려 들어감
const TIER_BODY = [[0, -0.9], [0.04, -0.55], [0.12, 0.08], [0.24, 0.6], [0.34, 0.8], [0.385, 0.84]];
const TIER_LEDGE = [[0.385, 0.84], [0.395, 0.1]];
const TIER_REC = [[0.395, 0.1], [0.69, 0.1]];
const TIER_LEDGE2 = [[0.69, 0.1], [0.70, 0.84]];
const TIER_TOP = [[0.70, 0.84], [0.74, 0.86], [0.84, 0.66], [0.94, 0.0], [1, -0.9]];

export function buildExterior(mats) {
  const B = new Builder();
  B.project('conc', 2.4).project('uhpc', 2.4).project('fluted', 1.2).project('paver', 2).project('beam', 2.4).project('soffit', 2.4).project('roofTop', 3);
  const ring = ringShape(P.A, P.B, P.N, 192);
  const geoms = []; // [key, geometry]
  const colliders = []; // 선분 {x1,z1,x2,z2}
  const info = { ring, windows: 0, pills: [] };

  // ---- 하층 띠 4겹 ----
  for (let k = 0; k < P.TIERS; k++) {
    const y0 = P.t0 + k * P.TIER_H;
    for (const prof of [TIER_BODY, TIER_LEDGE, TIER_REC, TIER_LEDGE2, TIER_TOP]) {
      B.add('conc', sweep(ring, y0, P.TIER_H, prof, 192, prof === TIER_LEDGE || prof === TIER_LEDGE2), { color: 0xffffff });
    }
    // 알약 띠창
    const r = mulberry(100 + k); let s = r() * 6; const pl = []; info.pills.push(pl);
    const ya = y0 + 0.4 * P.TIER_H + 0.05, yb = y0 + 0.685 * P.TIER_H - 0.05;
    while (s < ring.perim - 7) {
      const len = 5.5 + r() * 4.5, e = Math.min(s + len, ring.perim - 0.6);
      B.add('slit', pillGeo(ring, s, e, ya, yb, 0.14)); info.windows++; pl.push([s, e]);
      s = e + 0.9 + r() * 0.8;
    }
  }
  // 지붕 (하층 맨 위): 안쪽 오프셋 -0.9 윤곽의 평면
  {
    const shp = new THREE.Shape(); const N = ring.N;
    for (let i = 0; i < N; i++) { const q = ringAt(ring, ring.len[i], -1.0); if (i === 0) shp.moveTo(q[0], -q[1]); else shp.lineTo(q[0], -q[1]); }
    const g = new THREE.ShapeGeometry(shp); g.rotateX(-Math.PI / 2); g.translate(0, P.baseTop - 0.02, 0);
    B.add('roofTop', g, { color: 0xb4b2ac });
  }

  // ---- 1층: 기둥 + 후퇴한 유리 + 포치 ----
  const sE = ring.len[ring.N / 4]; // 남쪽 중앙(정문)
  const glassOff = (s) => { // 유리선 안쪽 offset(음수) — 정문 앞에서 깊이 파고든다
    const d = Math.abs(((s - sE + ring.perim / 2) % ring.perim + ring.perim) % ring.perim - ring.perim / 2);
    const w = 1 - smooth(5.5, 8.0, d); // 1 = 포치 안
    return P.GLASS_OFF + (P.PORCH_OFF - P.GLASS_OFF) * w;
  };
  const SEG = 160, y0g = 0.1, y1g = P.t0 - 0.05;
  const gpos = [], gidx = [], door = 1.9; let lastP = null;
  for (let j = 0; j <= SEG; j++) {
    const s = (j / SEG) * ring.perim, q = ringAt(ring, s, glassOff(s));
    gpos.push(q[0], y0g, q[1], q[0], y1g, q[1]);
    if (lastP) {
      const dd = Math.abs(((s - sE + ring.perim / 2) % ring.perim + ring.perim) % ring.perim - ring.perim / 2);
      const inDoor = dd < door && Math.abs(P.PORCH_OFF - glassOff(s)) < 0.05;
      if (!inDoor) colliders.push({ x1: lastP[0], z1: lastP[1], x2: q[0], z2: q[1], y0: 0, y1: P.F1H });
    }
    lastP = q;
  }
  for (let j = 0; j < SEG; j++) {
    const s = (j / SEG) * ring.perim, d = Math.abs(((s - sE + ring.perim / 2) % ring.perim + ring.perim) % ring.perim - ring.perim / 2);
    if (d < door && Math.abs(P.PORCH_OFF - glassOff(s)) < 0.05) continue;
    const a = j * 2, b = a + 1, c = a + 2, dd = a + 3; gidx.push(a, c, b, b, c, dd);
  }
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3)); g.setIndex(gidx); g.computeVertexNormals(); info.glassGeo = g; }
  // 멀리언(프레임) 가로 2줄 + 세로 약 2.3m 간격
  const frameStrip = (yy, hh) => { const gp = [], gi = []; for (let j = 0; j <= SEG; j++) { const s = (j / SEG) * ring.perim, q = ringAt(ring, s, glassOff(s) + 0.02); gp.push(q[0], yy, q[1], q[0], yy + hh, q[1]); } for (let j = 0; j < SEG; j++) { const s = (j / SEG) * ring.perim, d = Math.abs(((s - sE + ring.perim / 2) % ring.perim + ring.perim) % ring.perim - ring.perim / 2); if (d < door && Math.abs(P.PORCH_OFF - glassOff(s)) < 0.05) continue; const a = j * 2; gi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); g.setIndex(gi); g.computeVertexNormals(); return g; };
  B.add('frame', frameStrip(y1g - 0.18, 0.18)); B.add('frame', frameStrip(y0g, 0.12)); B.add('frame', frameStrip(2.6, 0.08));
  for (let s = 0; s < ring.perim; s += 2.4) { const q = ringAt(ring, s, glassOff(s) + 0.02); const dd = Math.abs(((s - sE + ring.perim / 2) % ring.perim + ring.perim) % ring.perim - ring.perim / 2); if (dd < door + 0.4 && Math.abs(P.PORCH_OFF - glassOff(s)) < 0.05) continue; B.box('frame', 0.07, y1g - y0g, 0.07, { x: q[0], y: (y0g + y1g) / 2, z: q[1] }); }
  // 정문 문틀: 포치 안쪽 벽 가운데 4m 개구 — 문 양옆 프레임 + 위 가로 보
  { const q = ringAt(ring, sE, P.PORCH_OFF); B.box('frame', 0.14, y1g - y0g, 0.14, { x: q[0] - door, y: (y0g + y1g) / 2, z: q[1] }); B.box('frame', 0.14, y1g - y0g, 0.14, { x: q[0] + door, y: (y0g + y1g) / 2, z: q[1] }); B.box('frame', door * 2, 0.35, 0.16, { x: q[0], y: 3.7, z: q[1] }); info.door = { x: q[0], z: q[1] }; }
  // 기둥 (원형 노출 콘크리트)
  { const r = mulberry(7); const n = Math.round(ring.perim / 6.2); info.columns = [];
    for (let i = 0; i < n; i++) { const s = (i + 0.5) * ring.perim / n; const dd = Math.abs(((s - sE + ring.perim / 2) % ring.perim + ring.perim) % ring.perim - ring.perim / 2); if (dd < 7) continue; const q = ringAt(ring, s, -1.35 + (r() - 0.5) * 0.1); B.cyl('conc', 0.42, 0.5, P.t0 + 0.05, { x: q[0], y: (P.t0 + 0.05) / 2, z: q[1] }, 14); info.columns.push([q[0], q[1], 0.5]); }
    // 포치 양쪽 굵은 기둥
    for (const sg of [-1, 1]) { const q = ringAt(ring, sE + sg * 9.2, glassOff(sE + sg * 9.2) + 0.6); B.cyl('conc', 0.6, 0.7, P.t0 + 0.05, { x: q[0], y: (P.t0 + 0.05) / 2, z: q[1] }, 16); info.columns.push([q[0], q[1], 0.75]); } }
  // 천장(소핏) + 바닥 포장: 유리선 바깥 ~ 벨리 안쪽
  { const gp = [], gi = [], SG = 128;
    for (let j = 0; j <= SG; j++) { const s = (j / SG) * ring.perim, a = ringAt(ring, s, glassOff(s)), b = ringAt(ring, s, -0.85); gp.push(a[0], P.t0 - 0.02, a[1], b[0], P.t0 - 0.02, b[1]); }
    for (let j = 0; j < SG; j++) { const a = j * 2; gi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); g.setIndex(gi); g.computeVertexNormals(); B.add('soffit', g, { color: 0xc8c6c0 }); }
  { const gp = [], gi = [], SG = 128;
    for (let j = 0; j <= SG; j++) { const s = (j / SG) * ring.perim, a = ringAt(ring, s, P.PORCH_OFF - 0.3), b = ringAt(ring, s, 3.2); gp.push(a[0], 0.025, a[1], b[0], 0.025, b[1]); }
    for (let j = 0; j < SG; j++) { const a = j * 2; gi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); g.setIndex(gi); g.computeVertexNormals(); B.add('paver', g, { color: 0xc9c6c0 }); }

  // ---- 중층: 유리 커튼월 + 내민보(인스턴싱) + 세로 홈 코어 ----
  const H = P.midHalf, yMid0 = P.baseTop, yMid1 = P.midTop;
  info.midFaces = [];
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const g = new THREE.PlaneGeometry(H * 2, P.midH); g.rotateY(Math.atan2(nx, nz));
    g.translate(nx * (H - 0.05), (yMid0 + yMid1) / 2, nz * (H - 0.05));
    info.midFaces.push(g);
  }
  // 코어 (동쪽 세로 홈) + 서쪽 작은 코어
  B.box('fluted', 3.2, P.midH + 0.5, 17, { x: H + 1.2, y: (yMid0 + yMid1) / 2, z: -2.5 });
  B.box('fluted', 1.6, P.midH + 0.5, 6, { x: -H - 0.6, y: (yMid0 + yMid1) / 2, z: 5.5 });
  // 층 슬래브 가장자리(보 연결부)
  for (let f = 0; f <= 6; f++) { const y = yMid0 + f * 4.1; B.box('beam', H * 2 + 0.2, 0.5, 0.6, { x: 0, y, z: H }); B.box('beam', H * 2 + 0.2, 0.5, 0.6, { x: 0, y, z: -H }); B.box('beam', 0.6, 0.5, H * 2 + 0.2, { x: H, y, z: 0 }); B.box('beam', 0.6, 0.5, H * 2 + 0.2, { x: -H, y, z: 0 }); }

  // ---- 상층: 십자 전망 박스 4개 (UHPC) ----
  const Y0 = yMid1, Y1 = P.top, zOf = (y) => P.wingHalfBot + (y - Y0) / (Y1 - Y0) * (P.wingHalfTop - P.wingHalfBot);
  const prof = [[2, Y0], [10.5, Y0], [P.wingOut, Y1 - 7.6], [P.wingOut, Y1], [2, Y1]];
  const wingGeo = (rot) => {
    const pts = []; for (const [x, y] of prof) { const z = zOf(y); pts.push(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y, -z)); }
    const g = new ConvexGeometry(pts); g.rotateY(rot); return g;
  };
  for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) B.add('uhpc', wingGeo(rot));
  // 윙 띠창 (끝면 + 옆면)
  for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const ya = Y1 - 4.4, yb = Y1 - 1.7;
    const end = new THREE.PlaneGeometry(1, 1);
    const pp = [[P.wingOut + 0.04, ya, -(zOf(ya) - 0.55)], [P.wingOut + 0.04, ya, zOf(ya) - 0.55], [P.wingOut + 0.04, yb, zOf(yb) - 0.55], [P.wingOut + 0.04, yb, -(zOf(yb) - 0.55)]];
    const g = new THREE.BufferGeometry(); const fl = []; for (const i of [0, 1, 2, 0, 2, 3]) fl.push(...pp[i]); g.setAttribute('position', new THREE.Float32BufferAttribute(fl, 3)); g.computeVertexNormals(); g.rotateY(rot);
    B.add('topGlass', g); end.dispose();
    for (const sg of [-1, 1]) {
      const x0 = 5.0, x1 = P.wingOut - 1.3, off = 0.04, a = zOf(ya) + off, b = zOf(yb) + off;
      const q = [[x0, ya, sg * a], [x1, ya, sg * a], [x1, yb, sg * b], [x0, yb, sg * b]];
      const g2 = new THREE.BufferGeometry(); const f2 = []; for (const i of (sg > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2])) f2.push(...q[i]); g2.setAttribute('position', new THREE.Float32BufferAttribute(f2, 3)); g2.computeVertexNormals(); g2.rotateY(rot);
      B.add('topGlass', g2);
    }
  }
  // 꼭대기 유리 박스 + 지붕
  B.box('topGlass', 7.2, 3.4, 7.2, { x: 0, y: Y1 + 1.7, z: 0 });
  B.box('uhpc', 8.4, 0.5, 8.4, { x: 0, y: Y1 + 3.6, z: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('frame', 0.2, 3.5, 0.2, { x: sx * 3.6, y: Y1 + 1.75, z: sz * 3.6 });

  info.parts = B.build(mats);
  // 중층 유리 + 보
  const meshes = [...info.parts];
  { const gg = new THREE.Mesh(info.glassGeo, mats.glass); gg.name = 'gm-f1-glass'; gg.renderOrder = 3; meshes.push(gg); }
  { const merged = []; // 중층 커튼월
    for (const g of info.midFaces) { const m = new THREE.Mesh(g, mats.curtain); m.name = 'gm-curtain'; meshes.push(m); } }
  // 내민보 InstancedMesh
  {
    const sh = new THREE.Shape(); sh.moveTo(-0.27, -0.2); sh.lineTo(0.27, -0.2); sh.lineTo(0.16, 0.2); sh.lineTo(-0.16, 0.2); sh.closePath();
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 1.75, bevelEnabled: false });
    const cols = 16, rows = 24, count = cols * rows * 4;
    const im = new THREE.InstancedMesh(bg, mats.beamI, count); im.name = 'gm-beams';
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pp = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      q.setFromAxisAngle(up, Math.atan2(fx, fz));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const u = -H + (c + 0.5 + (r % 2 ? 0.5 : 0)) * (2 * H / cols), y = yMid0 + 0.55 + r * (P.midH / rows);
        if (u > H - 0.3) continue;
        if (fx !== 0) pp.set(fx * (H - 0.1), y, u); else pp.set(u, y, fz * (H - 0.1));
        m4.compose(pp, q, one); im.setMatrixAt(n++, m4);
      }
    }
    im.count = n; im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; meshes.push(im);
  }
  info.meshes = meshes; info.colliders = colliders; info.sE = sE; info.glassOff = glassOff;
  info.tris = B.tris;
  return info;
}
