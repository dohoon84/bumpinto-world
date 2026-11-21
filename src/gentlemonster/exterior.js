// [gentle-monster] 사옥 외관: 하층 곡면 5겹(알약 띠창) · 중층 유리+내민보 · 상층 UHPC 십자 전망 박스.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { Builder, ringShape, ringAt, mulberry } from './geo.js';
import { PLAN as P } from './plan.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 링을 프로필(t,off)로 스윕한 띠 지오메트리 (바깥 법선) */
function sweep(ring, y0, h, prof, seg = 192, flip = false) {
  const M = prof.length, pos = [], idx = [], uv = [];
  for (let j = 0; j <= seg; j++) {
    const s = (j / seg) * ring.perim;
    for (let k = 0; k < M; k++) { const [t, off] = prof[k]; const q = ringAt(ring, s, off); pos.push(q[0], y0 + t * h, q[1]); uv.push(s / 4.8, (y0 + t * h) / 4.8); }
  }
  for (let j = 0; j < seg; j++) for (let k = 0; k < M - 1; k++) {
    const a = j * M + k, b = (j + 1) * M + k, c = (j + 1) * M + k + 1, d = j * M + k + 1;
    if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
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
  const pos = [], idx = [], uv = [];
  for (const [u, hv] of cs) { const q = ringAt(ring, u, off); pos.push(q[0], yc - hv, q[1], q[0], yc + hv, q[1]); uv.push((u - s0) / 3.2, (hh - hv) / (hh * 2), (u - s0) / 3.2, (hh + hv) / (hh * 2)); }
  for (let i = 0; i < cs.length - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  return g;
}

// A real aperture: rounded reveal from the concrete lip to the recessed glass.
function pillEdge(ring, a, b, ya, yb, off, inset = 0) {
  const r = (yb - ya) / 2 - inset, yc = (ya + yb) / 2, out = [];
  const add = (s, y) => { const q = ringAt(ring, s, off); out.push([q[0], y, q[1]]); };
  const c0 = a + (yb - ya) / 2, c1 = b - (yb - ya) / 2;
  for (let i = 0; i <= 12; i++) { const th = Math.PI / 2 + i / 12 * Math.PI; add(c0 + r * Math.cos(th), yc + r * Math.sin(th)); }
  const N = Math.ceil((c1 - c0) / 0.65);
  for (let i = 1; i < N; i++) add(c0 + (c1 - c0) * i / N, yc - r);
  for (let i = 0; i <= 12; i++) { const th = -Math.PI / 2 + i / 12 * Math.PI; add(c1 + r * Math.cos(th), yc + r * Math.sin(th)); }
  for (let i = N - 1; i > 0; i--) add(c0 + (c1 - c0) * i / N, yc + r);
  return out;
}
function edgeLoft(A, C) {
  const p = [];
  for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length; p.push(...A[i], ...A[j], ...C[i], ...A[j], ...C[j], ...C[i]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
}
// Fill the recess around (never behind) the analytic pill silhouettes.
function apertureWall(ring, ya, yb, low, high, pills) {
  const p = [], uv = [];
  const quad = (s, t, y0, y1, z0, z1) => {
    const a = ringAt(ring, s, 0.5), b = ringAt(ring, t, 0.5);
    const A=[a[0],y0,a[1]], B=[b[0],z0,b[1]], C=[b[0],z1,b[1]], D=[a[0],y1,a[1]];
    p.push(...A,...B,...C,...A,...C,...D);
    uv.push(s/4.8,y0/4.8,t/4.8,z0/4.8,t/4.8,z1/4.8,s/4.8,y0/4.8,t/4.8,z1/4.8,s/4.8,y1/4.8);
  };
  const yc=(ya+yb)/2, hh=(yb-ya)/2;
  const height = (s,a,b) => { const d=Math.max(a+hh-s, s-(b-hh),0); return Math.sqrt(Math.max(0,hh*hh-d*d)); };
  let last=0;
  const span=(a,b) => { const N=Math.max(1,Math.ceil((b-a)/0.5)); for(let i=0;i<N;i++) quad(a+(b-a)*i/N,a+(b-a)*(i+1)/N,low,high,low,high); };
  for(const [a,b] of pills) {
    span(last,a);
    const cuts=[a,a+hh,b-hh,b]; for(let i=1;i<12;i++){ const x=hh*(1-Math.cos(i/12*Math.PI/2)); cuts.push(a+x,b-x); }
    for(let x=a+hh+0.6;x<b-hh;x+=0.6) cuts.push(x); cuts.sort((x,y)=>x-y);
    for(let i=0;i<cuts.length-1;i++){ const s=cuts[i],t=cuts[i+1],h0=height(s,a,b),h1=height(t,a,b); quad(s,t,low,yc-h0,low,yc-h1); quad(s,t,yc+h0,high,yc+h1,high); }
    last=b;
  }
  span(last,ring.perim);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}

// 하층 한 겹(띠) 프로필: [t(0..1), 바깥 offset(m)] — 아래 배, 띠창 오목, 위 배(눈썹), 위쪽으로 말려 들어감
const TIER_BODY = [[0, -0.9], [0.04, -0.55], [0.12, 0.08], [0.24, 0.6], [0.34, 0.8], [0.385, 0.84]];
const TIER_LEDGE = [[0.385, 0.84], [0.395, 0.5]];
const TIER_LEDGE2 = [[0.69, 0.5], [0.70, 0.84]];
const TIER_TOP = [[0.70, 0.84], [0.722, 0.92], [0.745, 0.88], [0.758, 0.70]];
const TIER_RIB = [[0.758, 0.70], [0.905, 0.70]];
const TIER_CURL = [[0.905, 0.70], [0.95, 0.36], [1, -0.9]];

export function buildExterior(mats) {
  const B = new Builder();
  B.project('conc', 2.4).project('reveal', 1.2).project('uhpc', 2.4).project('crownSoffit', 2.4).project('fluted', 1.2).project('paver', 2).project('beam', 2.4).project('soffit', 2.4).project('roofTop', 3);
  const ring = ringShape(P.A, P.B, P.N, 192);
  const geoms = []; // [key, geometry]
  const colliders = []; // 선분 {x1,z1,x2,z2}
  const info = { ring, windows: 0, pills: [] };

  // ---- 하층 띠 4겹 ----
  for (let k = 0; k < P.TIERS; k++) {
    const y0 = P.t0 + k * P.TIER_H;
    for (const prof of [TIER_BODY, TIER_LEDGE, TIER_LEDGE2, TIER_TOP, TIER_CURL]) {
      B.add('skin', sweep(ring, y0, P.TIER_H, prof, 256, prof === TIER_LEDGE || prof === TIER_LEDGE2), { color: 0xffffff });
    }
    // 알약 띠창
    const r = mulberry(100 + k); let s = r() * 6; const pl = []; info.pills.push(pl);
    const ya = y0 + 0.4 * P.TIER_H + 0.05, yb = y0 + 0.685 * P.TIER_H - 0.05;
    while (s < ring.perim - 7) {
      const len = 5.5 + r() * 4.5, e = Math.min(s + len, ring.perim - 0.6);
      B.add('slit', pillGeo(ring, s + 0.045, e - 0.045, ya + 0.045, yb - 0.045, -0.13), { color: new THREE.Color().setScalar(0.85 + r() * 0.15) });
      const lip = pillEdge(ring,s,e,ya,yb,0.5), back = pillEdge(ring,s,e,ya,yb,-0.12,0.025), glassEdge = pillEdge(ring,s,e,ya,yb,-0.105,0.065);
      B.add('reveal', edgeLoft(lip,back)); B.add('pframe', edgeLoft(back, glassEdge));
      // Thin aluminium transoms follow the curved glazing; opaque texture supplies interior depth.
      for (let u=s+1.3;u<e-0.7;u+=1.65) { const q=ringAt(ring,u,-0.10); B.box('pframe',0.035,yb-ya-0.09,0.035,{x:q[0],y:(ya+yb)/2,z:q[1],ry:Math.atan2(q[2],q[3])}); }
      info.windows++; pl.push([s, e]);
      s = e + 0.9 + r() * 0.8;
    }
    B.add('skin', apertureWall(ring,ya,yb,y0+0.395*P.TIER_H,y0+0.69*P.TIER_H,pl));
    B.add('tierRib', sweep(ring, y0, P.TIER_H, TIER_RIB, 384));
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
    const w = 1 - smooth(6.0, 10.5, d); // 1 = 포치 안 (넓고 완만하게)
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
  for (let s = 0; s < ring.perim; s += 3.0) { const q = ringAt(ring, s, glassOff(s) + 0.02); const dd = Math.abs(((s - sE + ring.perim / 2) % ring.perim + ring.perim) % ring.perim - ring.perim / 2); if (dd < 11) continue; B.box('frame', 0.06, y1g - y0g, 0.07, { x: q[0], y: (y0g + y1g) / 2, z: q[1] }); }
  // 정문 문틀: 포치 안쪽 벽 가운데 4m 개구 — 문 양옆 프레임 + 위 가로 보
  { const q = ringAt(ring, sE, P.PORCH_OFF); info.door = { x: q[0], z: q[1] };
    // 스테인리스 문틀(가늘게) + 문 위 띠 사인판 + 캐노피 판 + 캐노피 다운라이트
    for (const sg of [-1, 1]) B.box('metal', 0.06, 2.95, 0.1, { x: q[0] + sg * door, y: 1.55, z: q[1], color: 0xb9bcc0 });
    B.box('metal', door * 2 + 0.06, 0.08, 0.1, { x: q[0], y: 3.03, z: q[1], color: 0xb9bcc0 });
    B.box('metal', 9.6, 0.12, 3.2, { x: q[0], y: 3.32, z: q[1] + 1.5, color: 0xa9adb2 });
    for (let i = -3; i <= 3; i++) for (const dz of [0.8, 2.3]) B.cyl('lamp', 0.11, 0.11, 0.02, { x: q[0] + i * 1.3, y: 3.25, z: q[1] + dz, color: 0xfff1d6 }, 14); }
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
  { // 코어 세로 홈: 반원 리브를 촘촘히 (동쪽 코어 바깥면 + 양 끝면, 서쪽 코어 바깥면)
    const hy = P.midH + 0.5, cy = (yMid0 + yMid1) / 2, rib = new THREE.CylinderGeometry(0.17, 0.17, hy, 8, 1, true, 0, Math.PI);
    const addRib = (x, z, ry) => B.add('fluted', rib, { x, y: cy, z, ry, color: 0xf4f8fb });
    for (let i = 0; i < 44; i++) addRib(H + 2.8, -10.8 + i * 0.38, Math.PI / 2 * 0 + 0);
    for (let i = 0; i < 8; i++) { addRib(H - 0.2 + 0.4 + i * 0.38, 6.0, -Math.PI / 2); addRib(H - 0.2 + 0.4 + i * 0.38, -11.0, Math.PI / 2); }
    for (let i = 0; i < 15; i++) addRib(-H - 1.4, 2.7 + i * 0.38, Math.PI);
    rib.dispose();
  }
  // 층 슬래브 가장자리(보 연결부)
  for (let f = 0; f <= 6; f++) { const y = yMid0 + f * 4.1; B.box('beam', H * 2 + 0.2, 0.5, 0.6, { x: 0, y, z: H }); B.box('beam', H * 2 + 0.2, 0.5, 0.6, { x: 0, y, z: -H }); B.box('beam', 0.6, 0.5, H * 2 + 0.2, { x: H, y, z: 0 }); B.box('beam', 0.6, 0.5, H * 2 + 0.2, { x: -H, y, z: 0 }); }

  // ---- 상층: 십자 전망 박스 4개 (UHPC) ----
  const Y0 = yMid1, Y1 = P.top, zOf = (y) => P.wingHalfBot + (y - Y0) / (Y1 - Y0) * (P.wingHalfTop - P.wingHalfBot);
  const prof = [[2, Y0], [10.5, Y0], [P.wingOut, Y1 - 7.6], [P.wingOut, Y1], [2, Y1]];
  const wingGeo = (rot) => {
    const pts = []; for (const [x, y] of prof) { const z = zOf(y); pts.push(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y, -z)); }
    const g = new ConvexGeometry(pts); g.rotateY(rot); return g;
  };
  for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const g = wingGeo(rot), p = g.attributes.position, n = g.attributes.normal, down = [], up = [];
    for (let i = 0; i < p.count; i += 3) { const a = n.getY(i) < -0.08 ? down : up; for (let j = 0; j < 3; j++) a.push(p.getX(i + j), p.getY(i + j), p.getZ(i + j)); }
    for (const [key, arr] of [['uhpc', up], ['crownSoffit', down]]) { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); gg.computeVertexNormals(); B.add(key, gg); gg.dispose(); } g.dispose();
  }
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
    const sh = new THREE.Shape(); sh.moveTo(-0.36, -0.26); sh.lineTo(0.36, -0.26); sh.lineTo(0.21, 0.26); sh.lineTo(-0.21, 0.26); sh.closePath();
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 1.7, bevelEnabled: false });
    const cols = 16, rows = 12, count = cols * rows * 4;
    const im = new THREE.InstancedMesh(bg, mats.beamI, count); im.name = 'gm-beams';
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pp = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      q.setFromAxisAngle(up, Math.atan2(fx, fz));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const u = -H + (c + 0.5 + (r % 2 ? 0.5 : 0)) * (2 * H / cols), y = yMid0 + 0.6 + r * (P.midH / rows) + (r % 2 ? 0.25 : 0);
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
