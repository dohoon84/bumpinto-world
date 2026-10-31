// [roadbike] 에어로 로드바이크 (월드챔피언 레인보우 스트라이프, 매트 블랙, 플라잉 탑튜브 + 일체형 핸들바, 딥 카본 림)
//   절차적 지오메트리(Lathe/Tube/Extrude/Shape/커스텀 스윕) + 캔버스 텍스처만 사용. 실제 브랜드명/로고 없음 (가상 워드마크: CORVANO / SPRINTA / P-ROAD / BUMPINTO)
// 로컬 좌표: +z 앞, +x = 왼쪽(논드라이브), y 위. 원점 = 두 바퀴 접지점 중앙(지면).  ⇒ 체인/크랭크/디레일러는 -x(오른쪽)
// 실측 기준: 700c(622 BSD) + 28 mm 타이어, 사이즈 M 지오메트리, 휠베이스 ~0.99 m, 앞 림 45 mm / 뒤 림 65 mm, 중량 ~7.4 kg
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const RB = {
  WB: 0.99, R: 0.343, BSD: 0.311, TYRE_W: 0.029, DEPTH_F: 0.045, DEPTH_R: 0.065, MASS: 7.4,
  HTA: (72.5 * Math.PI) / 180, CRANK: 0.1725, BB: [-0.091, 0.283],
};
const AX = RB.WB / 2, R = RB.R;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RA = V(0, R, -AX), FA = V(0, R, AX); // 뒤/앞 차축
const BB = V(0, RB.BB[1], RB.BB[0]);
const AXIS = V(0, -Math.sin(RB.HTA), Math.cos(RB.HTA)); // 조향축 (아래·앞 방향)
const HT = V(0, 0.822, 0.0); HT.z = FA.z - 0.04 / Math.sin(RB.HTA) - (HT.y - R) / Math.tan(RB.HTA); // 헤드튜브 상단 (포크 오프셋 40 mm)
const onAxis = (y) => V(0, y, HT.z + (HT.y - y) / Math.tan(RB.HTA));
export const RB_PTS = { RA, FA, BB, HT };

// ---------- 캔버스 ----------
const cv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const FONT = (px, w = 900, it = '') => `${it} ${w} ${px}px "Arial Black", "Helvetica Neue", Arial, "DejaVu Sans", sans-serif`;
const FRAME_C = '#18191c';
export const RB_COLORWAYS = {
  black: { frame: FRAME_C, text: '#f4f4f4', model: '#9a9b9e', seatText: '#8d8e92', finish: 'matte', cockpitBlack: false, postBlack: false, tyre: ['#c9a24a', '#b8954a', '#9b8752'] },
  white: { frame: '#eceef0', text: '#111214', model: '#55575b', seatText: '#6a6c70', finish: 'pearl', cockpitBlack: true, postBlack: true, tyre: ['#d6d7d9', '#bfc1c4', '#a9abaf'] },
};
const RAINBOW = ['#2f7fd8', '#e8333a', '#111111', '#f4cf1b', '#25a24a'];
// 튜브 텍스처(u=길이, v=둘레) 위에 양 옆면 글자: v=0.75(오른쪽=-x, 드라이브)·v=0.25(왼쪽=+x)
function sideText(x, W, H, text, { u0 = 0.5, h = 0.28, px, color = '#f4f4f4', italic = true, w = 900, stretch = 1, flipR = 1, flipL = 1, turnL = false } = {}) {
  // flipR/flipL: 튜브 진행 방향(앞/뒤)에 따라 글자가 뒤집히는 면 보정 (-1 = 상하 반전)
  for (const side of [0.25, 0.75]) {
    x.save(); x.translate(u0 * W, (1 - side) * H);
    if (side === 0.75) x.scale(-stretch, flipR); else { x.scale(stretch, -flipL); if (turnL) x.rotate(Math.PI); } // turnL: v=0.25 면 180° 회전
    x.font = FONT(px || h * H, w, italic ? 'italic' : ''); x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 0, 0); x.restore();
  }
}
// 픽셀 레인보우 밴드 (사진처럼 작은 사각형이 한쪽으로 흩어지며 끝남). 튜브 둘레 전체를 감쌈
function pixelRainbow(x, W, H, u0, u1, { vertical = false, fade = 0.35, cells = 5 } = {}) {
  const L = (u1 - u0) * W, band = L / RAINBOW.length;
  RAINBOW.forEach((col, i) => {
    const a = u0 * W + i * band; x.fillStyle = col;
    x.fillRect(a, 0, band * (1 - fade) + 1, H);
    const cw = (band * fade) / cells;
    for (let k = 0; k < cells; k++) for (let r = 0; r < H / cw; r++) if (((r * 7 + k * 3 + i) % 5) > k) x.fillRect(a + band * (1 - fade) + k * cw, r * cw, cw * 0.9, cw * 0.9);
  });
  void vertical;
}
function frameTex(kind, cw = RB_COLORWAYS.black) {
  const [c, x] = cv(1024, 256); x.fillStyle = cw.frame; x.fillRect(0, 0, 1024, 256);
  if (kind === 'down') sideText(x, 1024, 256, 'CORVANO', { u0: 0.47, px: 54, stretch: 1.3, flipR: -1, flipL: -1, color: cw.text });
  if (kind === 'top') { pixelRainbow(x, 1024, 256, 0.13, 0.33); sideText(x, 1024, 256, 'CR·1', { u0: 0.62, px: 26, color: cw.model, italic: false, w: 700 }); }
  if (kind === 'fork') pixelRainbow(x, 1024, 256, 0.56, 0.84);
  if (kind === 'chainstay') sideText(x, 1024, 256, 'TEAM  BUMPINTO', { u0: 0.42, px: 40, w: 800, italic: false, color: cw.text, flipL: -1, flipR: -1, turnL: true });
  if (kind === 'seat') sideText(x, 1024, 256, 'CORVANO', { u0: 0.6, px: 26, color: cw.seatText, w: 800, flipR: -1, flipL: -1 });
  return tex(c);
}
// 바 테이프 (사선 감김 + 미세 텍스처)
function tapeTex() {
  const [c, x] = cv(256, 64); x.fillStyle = '#1a1b1d'; x.fillRect(0, 0, 256, 64);
  for (let i = -8; i < 40; i++) { x.strokeStyle = '#0d0d0e'; x.lineWidth = 2; x.beginPath(); x.moveTo(i * 8, 0); x.lineTo(i * 8 + 18, 64); x.stroke(); }
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; x.fillRect(Math.random() * 256, Math.random() * 64, 1, 1); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 1); return t;
}
// 3D 프린트 허니컴 안장 상판
function hexTex() {
  const [c, x] = cv(128, 128); x.fillStyle = '#262729'; x.fillRect(0, 0, 128, 128);
  const r = 10, h = r * Math.sqrt(3);
  for (let row = -1; row < 9; row++) for (let col = -1; col < 9; col++) {
    const cx = col * r * 1.5, cy = row * h + (col % 2 ? h / 2 : 0); x.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; x.lineTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); }
    x.closePath(); x.fillStyle = '#060607'; x.fill();
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(26, 26); return t;
}
// 림 데칼 (RingGeometry 평면 UV: 캔버스 = 반지름 rOut 원판). 가상 워드마크 'SPRINTA' 를 3번, 굵은 흰색 + 셰브론
function rimDecalTex(rOut, rIn0, rIn1) {
  const S = 2048, [c, x] = cv(S); x.translate(S / 2, S / 2); x.scale(1, -1);
  const k = S / 2 / rOut, ri = rIn0 * k, ro = rIn1 * k, mid = (ri + ro) / 2, hh = (ro - ri) * 1.12, SX = 1.32;
  const word = 'SPRINTA';
  for (let rep = 0; rep < 3; rep++) {
    const base = (rep / 3) * Math.PI * 2;
    // 글자를 원호 따라 배치(글자 위쪽 = 바깥 반지름), 굵고 넓은 블록체
    x.save(); x.font = FONT(hh, 900); const widths = [...word].map((ch) => x.measureText(ch).width * SX * 0.96); x.restore();
    const chevW = hh * 0.95;
    const total = widths.reduce((a, b) => a + b, 0) + chevW;
    let a = base + total / mid / 2;
    // 앞쪽 셰브론 마크 (>>)
    for (let cI = 0; cI < 2; cI++) {
      const ang = a - (hh * 0.2 + cI * hh * 0.36) / mid;
      x.save(); x.rotate(ang); x.translate(mid, 0); x.rotate(-Math.PI / 2); x.scale(1, -1);
      x.fillStyle = '#f5f5f5'; x.beginPath(); const w = hh * 0.17, t = (ro - ri) * 0.4;
      x.moveTo(-w, -t); x.lineTo(w * 0.7, 0); x.lineTo(-w, t); x.lineTo(-w * 0.2, t); x.lineTo(w * 1.5, 0); x.lineTo(-w * 0.2, -t); x.closePath(); x.fill(); x.restore();
    }
    a -= chevW / mid;
    [...word].forEach((ch, i) => {
      const ang = a - widths[i] / 2 / mid;
      x.save(); x.rotate(ang); x.translate(mid, 0); x.rotate(-Math.PI / 2); x.scale(1, -1); // 바깥쪽이 글자 위
      x.font = FONT(hh, 900); x.fillStyle = '#f5f5f5'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.save(); x.transform(SX, 0, -0.16, 1, 0, 0); x.fillText(ch, 0, hh * 0.04); x.restore(); x.restore();
      a -= widths[i] / mid;
    });
  }
  // 얇은 그레이 사양 문구 (작게)
  x.save(); x.font = FONT((ro - ri) * 0.15, 700); x.fillStyle = '#8a8b8e';
  for (let rep = 0; rep < 3; rep++) { const ang = (rep / 3) * Math.PI * 2 + Math.PI / 3; x.save(); x.rotate(ang); x.translate(mid, 0); x.rotate(-Math.PI / 2); x.scale(1, -1); x.textAlign = 'center'; x.fillText('CARBON  ·  TUBELESS  ·  HOOKLESS', 0, 0); x.restore(); }
  x.restore();
  const t = tex(c); return t;
}
// 타이어 사이드월: 탄색 'P-ROAD' 문구 + 라인 (가상 이름)
function tyreDecalTex(rOut, r0, r1, [tc, lc, sc] = RB_COLORWAYS.black.tyre) {
  const S = 1024, [c, x] = cv(S); x.translate(S / 2, S / 2); x.scale(1, -1);
  const k = S / 2 / rOut, ri = r0 * k, ro = r1 * k, mid = (ri + ro) / 2, hh = (ro - ri) * 0.62;
  for (let rep = 0; rep < 2; rep++) {
    const base = rep * Math.PI + 0.35;
    const txt = 'P-ROAD  RACE  ', sub = '28-622 · TLR';
    x.font = FONT(hh, 900); const wTxt = x.measureText(txt).width;
    let a = base + wTxt / mid / 2;
    for (const ch of txt) {
      const w = x.measureText(ch).width; const ang = a - w / 2 / mid;
      x.save(); x.rotate(ang); x.translate(mid, 0); x.rotate(-Math.PI / 2); x.scale(1, -1); x.fillStyle = tc; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 0, 0); x.restore();
      a -= w / mid;
    }
    // 문구 양쪽 탄색 라인
    x.strokeStyle = lc; x.lineWidth = hh * 0.16;
    x.beginPath(); x.arc(0, 0, mid, base + wTxt / mid / 2 + 0.03, base + wTxt / mid / 2 + 0.55); x.stroke();
    x.beginPath(); x.arc(0, 0, mid, base - wTxt / mid / 2 - 0.55, base - wTxt / mid / 2 - 0.03); x.stroke();
    x.font = FONT(hh * 0.55, 700);
    a = base + Math.PI / 2;
    for (const ch of sub) { const w = x.measureText(ch).width; const ang = a - w / 2 / mid; x.save(); x.rotate(ang); x.translate(mid, 0); x.rotate(-Math.PI / 2); x.scale(1, -1); x.fillStyle = sc; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 0, 0); x.restore(); a -= w / mid; }
  }
  return tex(c);
}
// 디스크 로터 (6 스파이더 + 구멍 뚫린 브레이킹 밴드). 알파 컷아웃
function rotorTex() {
  const [c, x] = cv(512); x.translate(256, 256);
  x.fillStyle = '#b9bcc0'; x.beginPath(); x.arc(0, 0, 254, 0, 7); x.arc(0, 0, 196, 0, 7, true); x.fill();
  // 브레이킹 면 결
  for (let r = 198; r < 254; r += 2) { x.strokeStyle = `rgba(80,80,85,${0.08 + (r % 6) * 0.02})`; x.lineWidth = 1; x.beginPath(); x.arc(0, 0, r, 0, 7); x.stroke(); }
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2; x.beginPath(); x.ellipse(Math.cos(a) * 225, Math.sin(a) * 225, 9, 5, a + 0.6, 0, 7); x.fill(); }
  x.globalCompositeOperation = 'source-over';
  // 스파이더 (어두운 알루미늄)
  x.fillStyle = '#2a2c30';
  for (let i = 0; i < 6; i++) { x.save(); x.rotate((i / 6) * Math.PI * 2); x.beginPath(); x.moveTo(-14, 60); x.quadraticCurveTo(-30, 150, -10, 205); x.lineTo(22, 205); x.quadraticCurveTo(10, 150, 14, 60); x.fill(); x.restore(); }
  x.beginPath(); x.arc(0, 0, 70, 0, 7); x.fill();
  x.fillStyle = '#5a5d62'; x.beginPath(); x.arc(0, 0, 40, 0, 7); x.fill();
  return tex(c);
}
function chainTex() { // 링크 패턴 (u 방향 반복)
  const [c, x] = cv(64, 16); x.fillStyle = '#3c3e42'; x.fillRect(0, 0, 64, 16);
  x.fillStyle = '#a7aaae'; x.fillRect(0, 2, 30, 12); x.fillStyle = '#7b7e82'; x.fillRect(32, 3, 30, 10);
  x.fillStyle = '#d2d4d7'; for (const p of [4, 26, 36, 58]) { x.beginPath(); x.arc(p, 8, 3, 0, 7); x.fill(); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function makeEnv(renderer) {
  const sc = new THREE.Scene(), g = new THREE.SphereGeometry(10, 32, 16), col = [];
  const top = new THREE.Color('#78b6ec'), hor = new THREE.Color('#f2f4f6'), gnd = new THREE.Color('#6f7174'), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 10; const c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.5)) : hor.clone().lerp(gnd, Math.min(1, -y * 5)); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  sc.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const pl = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  for (const [x, y, z] of [[6, 4, 5], [-7, 3, -2], [0, 8, -6], [3, 6, -7]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), pl); m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m); }
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0.02); pm.dispose(); g.dispose();
  return rt.texture;
}

// ---------- 지오메트리 헬퍼 ----------
// 값 또는 [[u,v],...] (구간 스무스 보간) 또는 함수
const asFn = (v) => (typeof v === 'function' ? v : Array.isArray(v) ? (u) => {
  if (u <= v[0][0]) return v[0][1]; for (let i = 1; i < v.length; i++) if (u <= v[i][0]) { const [a, va] = v[i - 1], [b, vb] = v[i], t = (u - a) / (b - a), s = t * t * (3 - 2 * t); return va + (vb - va) * s; } return v[v.length - 1][1];
} : () => v);
const XA = V(1, 0, 0);
// 에어로 단면 스윕: 중심선 pts(Vector3) 를 따라 슈퍼타원 단면 (w=옆(x) 반폭, d=진행 평면 내 반깊이, tail=뒤쪽(-N) 깊이 배율)
// N = X × T: 앞으로/위로 진행하는 튜브에선 전방(리딩 엣지). uv: u=길이, v=둘레 (v=.25 → +x 옆면, v=.75 → -x 옆면)
function sweep(pts, o = {}) {
  const { segs = 48, rs = 28, ex = 2.6, caps = true, tension = 'centripetal' } = o;
  const W = asFn(o.w ?? 0.02), D = asFn(o.d ?? 0.02), TL = asFn(o.tail ?? 1), SH = o.shift ? asFn(o.shift) : null;
  const curve = Array.isArray(pts) ? new THREE.CatmullRomCurve3(pts, false, tension) : pts;
  const pos = [], uv = [], idx = [], P = V(0, 0, 0), T = V(0, 0, 0), B = V(0, 0, 0), N = V(0, 0, 0), ax = o.axis || XA;
  const rings = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs; curve.getPointAt(u, P); curve.getTangentAt(u, T);
    B.copy(ax).addScaledVector(T, -ax.dot(T)).normalize(); N.crossVectors(B, T).normalize();
    const w = W(u), d = D(u), tl = TL(u), sh = SH ? SH(u) : 0; rings.push(P.clone().addScaledVector(N, sh * d));
    for (let j = 0; j <= rs; j++) {
      const th = (j / rs) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const sx = Math.sign(c) * Math.pow(Math.abs(c), 2 / ex), sy = Math.sign(s) * Math.pow(Math.abs(s), 2 / ex);
      const nn = d * (sx < 0 ? sx * tl : sx) + sh * d;
      pos.push(P.x + B.x * w * sy + N.x * nn, P.y + B.y * w * sy + N.y * nn, P.z + B.z * w * sy + N.z * nn); uv.push(u, j / rs);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rs; j++) { const a = i * (rs + 1) + j, b = a + rs + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  if (caps) for (const [i, flip] of [[0, true], [segs, false]]) {
    const ci = pos.length / 3; const p = rings[i]; pos.push(p.x, p.y, p.z); uv.push(i / segs, 0.5);
    for (let j = 0; j < rs; j++) { const a = i * (rs + 1) + j; flip ? idx.push(ci, a + 1, a) : idx.push(ci, a, a + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal; // 이음새 노멀 평균
  for (let i = 0; i <= segs; i++) { const a = i * (rs + 1), b = a + rs; const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), L = Math.hypot(x, y, z) || 1; n.setXYZ(a, x / L, y / L, z / L); n.setXYZ(b, x / L, y / L, z / L); }
  return g;
}
const tube = (pts, r, seg = 24, rs = 10, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed, 'centripetal'), seg, r, rs, closed);
// 측면 프로파일(z,y) → x 두께 돌출 (가운데 정렬)
function sideExtrude(pts, depth, bevel = 0.004, cs = 12) {
  const sh = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(1e-4, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 3, curveSegments: cs });
  g.translate(0, 0, -(depth - bevel * 2) / 2); g.rotateY(-Math.PI / 2); return g;
}
// 톱니 링(체인링/코그): x 축 원판
function sprocket(teeth, rIn, thick, { spider = 0, solid = false } = {}) {
  const pitch = 0.0127, rp = pitch / (2 * Math.sin(Math.PI / teeth)), ro = rp + 0.0035, rr = rp - 0.0028;
  const sh = new THREE.Shape(), n = teeth * 4;
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, k = i % 4, r = k === 0 || k === 3 ? rr : ro; const aa = a + (k === 1 ? 0.15 : k === 2 ? -0.15 : 0) * (Math.PI * 2 / teeth); i ? sh.lineTo(Math.cos(aa) * r, Math.sin(aa) * r) : sh.moveTo(Math.cos(aa) * r, Math.sin(aa) * r); }
  if (!solid) { const h = new THREE.Path(); h.absarc(0, 0, rIn, 0, Math.PI * 2, true); sh.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -thick / 2); g.rotateY(Math.PI / 2);
  void spider; return { g, rp };
}
function lathe(pts, seg = 64) { const g = new THREE.LatheGeometry(pts.map(([r, a]) => new THREE.Vector2(r, a)), seg); g.rotateZ(-Math.PI / 2); return g; } // 축 = x  (점: [반지름, 축방향 x])
function ringX(r0, r1, seg = 96) { const g = new THREE.RingGeometry(r0, r1, seg, 1); return g; }
const cylX = (r, len, seg = 20) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
// 두 점을 잇는 원기둥 (스포크 등)
function rod(a, b, r, seg = 4) { const d = V(0, 0, 0).subVectors(b, a), L = d.length(); const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g; }
function roundedRect(w, h, r) { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }

// ---------- 공유 재질 ----------
const sharedBy = {}; let envShared = null;
// [memory] 림·타이어 데칼(2048²·1024² 캔버스)은 처음 그려질 때 만든다. 해상도·내용은 그대로이고,
//   그 프레임의 렌더 직전(onBeforeRender)에 그려 같은 프레임에 업로드되므로 화면은 동일하다.
//   인벤토리를 열거나 다른 사람이 바이크를 꺼내면 prewarmRoadBikeDecals() 가 유휴 시간에 하나씩 미리 그린다.
const lazyDecals = [];
function lazyTex(draw) {
  const t = new THREE.Texture(); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.userData.ensure = () => { if (t.image) return false; t.image = draw().image; t.needsUpdate = true; return true; };
  lazyDecals.push(t);
  return t;
}
const ensureMap = (m) => () => m.map?.userData.ensure?.();
export function prewarmRoadBikeDecals() {
  const todo = lazyDecals.filter((t) => !t.image);
  if (!todo.length) return;
  const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 0 }), 16));
  const step = () => { const t = todo.shift(); if (!t) return; t.userData.ensure(); if (todo.length) idle(step, { timeout: 1500 }); };
  idle(step, { timeout: 1500 });
}
export const roadBikeDecalStats = () => ({ total: lazyDecals.length, drawn: lazyDecals.filter((t) => t.image).length });
function getShared(renderer, cwName = 'black') {
  if (sharedBy[cwName]) return sharedBy[cwName];
  const cw = RB_COLORWAYS[cwName] || RB_COLORWAYS.black;
  const env = (envShared ||= makeEnv(renderer));
  const std = (o) => new THREE.MeshStandardMaterial({ envMap: env, ...o });
  const matteBlack = (map) => new THREE.MeshPhysicalMaterial({ color: '#ffffff', map, metalness: 0.15, roughness: 0.58, envMap: env, envMapIntensity: 0.9, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color('#3a3c40') });
  const pearl = (map) => new THREE.MeshPhysicalMaterial({ color: '#ffffff', map, metalness: 0.05, roughness: 0.36, envMap: env, envMapIntensity: 0.8, clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 0.25, iridescenceIOR: 1.3, sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color('#e6ecf4') });
  const matte = cw.finish === 'pearl' ? pearl : matteBlack;
  const solid = (col) => { const [c, x] = cv(4); x.fillStyle = col; x.fillRect(0, 0, 4, 4); return tex(c); };
  const frameBase = solid(cw.frame);
  const M = {
    frame: matte(frameBase), down: matte(frameTex('down', cw)), top: matte(frameTex('top', cw)), fork: matte(frameTex('fork', cw)), chainstay: matte(frameTex('chainstay', cw)), seat: matte(frameTex('seat', cw)),
    carbon: std({ color: '#141416', metalness: 0.2, roughness: 0.42, side: THREE.DoubleSide }), // 림
    rubber: std({ color: '#141415', metalness: 0, roughness: 0.82, side: THREE.DoubleSide }),
    tape: std({ color: '#ffffff', map: tapeTex(), metalness: 0, roughness: 0.85 }),
    saddle: std({ color: '#ffffff', map: hexTex(), metalness: 0.05, roughness: 0.7 }),
    saddleBase: std({ color: '#0f0f10', metalness: 0.2, roughness: 0.5 }),
    alu: std({ color: '#c7cacd', metalness: 0.9, roughness: 0.32 }),
    darkAlu: std({ color: '#3b3d41', metalness: 0.75, roughness: 0.38 }),
    black: std({ color: '#121214', metalness: 0.35, roughness: 0.45, side: THREE.DoubleSide }),
    gloss: std({ color: '#0b0b0c', metalness: 0.3, roughness: 0.18 }),
    steel: std({ color: '#d6d8db', metalness: 1, roughness: 0.22 }),
    cogs: std({ color: '#b3b6ba', metalness: 0.95, roughness: 0.3 }),
    hood: std({ color: '#161617', metalness: 0, roughness: 0.75 }),
    rotor: new THREE.MeshStandardMaterial({ map: rotorTex(), envMap: env, metalness: 0.85, roughness: 0.3, alphaTest: 0.5, side: THREE.DoubleSide }),
    spoke: std({ color: '#1b1c1e', metalness: 0.6, roughness: 0.4 }),
    computer: std({ color: '#1c1d20', metalness: 0.3, roughness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#0a0b0c', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.2, clearcoat: 1, envMap: env }),
  };
  M.rimF = new THREE.MeshStandardMaterial({ map: lazyTex(() => rimDecalTex(RB.BSD - 0.003, RB.BSD - RB.DEPTH_F + 0.004, RB.BSD - 0.003)), transparent: true, alphaTest: 0.35, roughness: 0.45, metalness: 0.1, envMap: env, polygonOffset: true, polygonOffsetFactor: -2 });
  M.rimR = new THREE.MeshStandardMaterial({ map: lazyTex(() => rimDecalTex(RB.BSD - 0.003, RB.BSD - RB.DEPTH_R + 0.004, RB.BSD - 0.003)), transparent: true, alphaTest: 0.35, roughness: 0.45, metalness: 0.1, envMap: env, polygonOffset: true, polygonOffsetFactor: -2 });
  M.cockpit = cw.cockpitBlack ? matteBlack(solid(FRAME_C)) : M.frame;
  M.post = cw.postBlack ? matteBlack(solid(FRAME_C)) : M.frame;
  M.tyreTxt = new THREE.MeshStandardMaterial({ map: lazyTex(() => tyreDecalTex(R - 0.0125, R - 0.0215, R - 0.0125, cw.tyre)), transparent: true, alphaTest: 0.3, roughness: 0.7, envMap: env, polygonOffset: true, polygonOffsetFactor: -2 });
  return (sharedBy[cwName] = { M, env });
}

// ---------- 바이크 컴퓨터 화면 (CanvasTexture, 240×400) ----------
export function drawComputer(x, s) {
  const W = 240, H = 400;
  x.fillStyle = '#101113'; x.fillRect(0, 0, W, H);
  const sx = 14, sy = 16, sw = W - 28, sh = H - 66; // 화면 영역
  x.fillStyle = '#eef0ea'; x.fillRect(sx, sy, sw, sh);
  // 상태 바
  x.fillStyle = '#1d1f22'; x.fillRect(sx, sy, sw, 26);
  x.fillStyle = '#ffffff'; x.font = FONT(16, 700); x.textBaseline = 'middle'; x.textAlign = 'left';
  const d = new Date(); x.fillText(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), sx + 8, sy + 14);
  x.strokeStyle = '#ffffff'; x.lineWidth = 2; x.strokeRect(sx + sw - 40, sy + 7, 26, 13); x.fillStyle = '#7ed957'; x.fillRect(sx + sw - 38, sy + 9, 17, 9); x.fillStyle = '#fff'; x.fillRect(sx + sw - 13, sy + 11, 3, 5);
  x.fillStyle = s.riding ? '#7ed957' : '#999'; x.beginPath(); x.arc(sx + sw - 54, sy + 13, 5, 0, 7); x.fill(); // GPS
  // 속도 (큰 숫자)
  x.fillStyle = '#5b5e63'; x.font = FONT(15, 700); x.textAlign = 'left'; x.fillText('SPEED', sx + 8, sy + 42);
  x.textAlign = 'right'; x.fillText('km/h', sx + sw - 8, sy + 42);
  x.fillStyle = '#0b0b0c'; x.font = FONT(84, 900); x.textAlign = 'center'; x.fillText(s.kmh.toFixed(1), sx + sw / 2, sy + 98);
  // 최고속 바 (50 km/h 상한)
  const bw = sw - 16; x.fillStyle = '#c9ccc5'; x.fillRect(sx + 8, sy + 140, bw, 7); x.fillStyle = s.kmh >= 49.95 ? '#e8333a' : '#2f7fd8'; x.fillRect(sx + 8, sy + 140, (bw * Math.min(1, s.kmh / 50)), 7);
  // 데이터 필드 2×2
  const cell = (cx, cy, label, val, unit) => {
    x.fillStyle = '#5b5e63'; x.font = FONT(13, 700); x.textAlign = 'left'; x.fillText(label, cx + 6, cy + 12);
    x.fillStyle = '#0b0b0c'; x.font = FONT(36, 900); x.textAlign = 'center'; x.fillText(val, cx + sw / 4, cy + 46);
    x.fillStyle = '#5b5e63'; x.font = FONT(12, 700); x.textAlign = 'right'; x.fillText(unit, cx + sw / 2 - 6, cy + 12);
  };
  x.fillStyle = '#c9ccc5'; x.fillRect(sx, sy + 156, sw, 2); x.fillRect(sx, sy + 240, sw, 2); x.fillRect(sx + sw / 2 - 1, sy + 156, 2, sh - 156);
  const t = Math.floor(s.time), hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  cell(sx, sy + 160, 'DIST', s.dist < 10 ? s.dist.toFixed(2) : s.dist.toFixed(1), 'km');
  cell(sx + sw / 2, sy + 160, 'TIME', (hh ? hh + ':' + String(mm).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0'), '');
  cell(sx, sy + 244, 'CADENCE', String(Math.round(s.cad)), 'rpm');
  cell(sx + sw / 2, sy + 244, 'AVG', s.avg.toFixed(1), 'km/h');
  // 베젤 하단 라벨 (가상 브랜드)
  x.fillStyle = '#d8d9dc'; x.font = FONT(15, 800); x.textAlign = 'center'; x.fillText('BUMPINTO', W / 2, H - 24);
  x.fillStyle = '#5a5c60'; x.beginPath(); x.arc(W / 2 - 70, H - 24, 6, 0, 7); x.arc(W / 2 + 70, H - 24, 6, 0, 7); x.fill();
}

const mesh = (g, m, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = false; return o; };

export function createRoadBikeModel(renderer, { colorway = 'black' } = {}) {
  const { M, env } = getShared(renderer, colorway);
  const root = new THREE.Group(); root.name = 'roadBike-' + colorway;
  const lean = new THREE.Group(); root.add(lean); // 롤 피벗 = 접지선
  const body = new THREE.Group(); lean.add(body);
  const add = (g, m, p, r, parent = body) => { const o = mesh(g, m); if (p) o.position.copy(p); if (r) o.rotation.set(r[0], r[1], r[2] || 0); parent.add(o); return o; };

  // ================= 바퀴 =================
  const wheel = (front) => {
    const spin = new THREE.Group(), depth = front ? RB.DEPTH_F : RB.DEPTH_R, ro = RB.BSD, ri = ro - depth, hw = 0.0145;
    // 림 단면 (U자 스포크 베드 → 평평한 사이드월 → 훅리스 비드)
    const prof = [[ro + 0.0015, -0.0118], [ro - 0.002, -0.0128], [ro - 0.008, -hw], [ri + 0.016, -hw], [ri + 0.008, -0.0122], [ri + 0.003, -0.0075], [ri, 0]];
    const full = [...prof, ...prof.slice(0, -1).reverse().map(([r, a]) => [r, -a])];
    spin.add(mesh(lathe(full, 72), M.carbon));
    // 타이어 (둥근 단면)
    const tp = []; const rc = (ro + R) / 2 - 0.001, hh = (R - ro) / 2 + 0.002, tw = RB.TYRE_W / 2;
    for (let i = 0; i <= 20; i++) { const t = -Math.PI * 0.42 + (i / 20) * Math.PI * 0.84 + Math.PI / 2; tp.push([rc - Math.cos(t + Math.PI / 2) * hh * 0 + Math.sin(t) * hh, -Math.cos(t) * tw]); }
    tp.unshift([ro - 0.001, -0.0112]); tp.push([ro - 0.001, 0.0112]);
    spin.add(mesh(lathe(tp, 72), M.rubber));
    // 데칼: 림 양옆, 타이어 양옆
    for (const sx of [1, -1]) {
      const d = mesh(ringX(ri + 0.004, ro - 0.003), front ? M.rimF : M.rimR, false); d.onBeforeRender = ensureMap(d.material); d.rotation.y = sx * Math.PI / 2; d.position.x = sx * (hw + 0.0004); spin.add(d);
      const t = mesh(ringX(R - 0.0215, R - 0.0125, 120), M.tyreTxt, false); t.onBeforeRender = ensureMap(M.tyreTxt); t.rotation.y = sx * Math.PI / 2; t.position.x = sx * (tw + 0.0003); spin.add(t);
    }
    // 허브
    const hubW = front ? 0.05 : 0.068;
    spin.add(mesh(lathe([[0.006, -hubW], [0.017, -hubW], [0.017, -hubW + 0.006], [0.024, -hubW + 0.01], [0.024, -hubW + 0.014], [0.015, -hubW + 0.018], [0.013, 0], [0.015, hubW - 0.018], [0.024, hubW - 0.014], [0.024, hubW - 0.01], [0.017, hubW - 0.006], [0.017, hubW], [0.006, hubW]], 28), M.black));
    // 스포크 (앞 24 래디얼-ish, 뒤 24 2크로스) 하나의 지오메트리로 합침
    const sg = [], n = 24;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, a = (i / n) * Math.PI * 2;
      const cross = front ? 0 : (i % 4 < 2 ? 1 : -1) * 0.42;
      const fx = side * (hubW - 0.012), fa = a + cross;
      const h = V(fx, Math.cos(fa) * 0.022, Math.sin(fa) * 0.022), r = V(side * 0.0035, Math.cos(a) * (ri + 0.002), Math.sin(a) * (ri + 0.002));
      sg.push(rod(h, r, 0.0011));
    }
    spin.add(mesh(mergeGeometries(sg), M.spoke));
    // 디스크 로터 (+x 쪽)
    const rr = front ? 0.08 : 0.07;
    const rot = mesh(new THREE.CircleGeometry(rr, 48), M.rotor); rot.rotation.y = Math.PI / 2; rot.position.x = front ? 0.044 : 0.056; spin.add(rot);
    // 스루액슬
    add(cylX(0.0062, front ? 0.118 : 0.152, 12), M.darkAlu, null, null, spin);
    return spin;
  };
  const rearSpin = wheel(false); rearSpin.position.copy(RA); body.add(rearSpin);

  // 카세트(프리허브 — 페달링할 때만 회전) 12단 10-33T
  const cassette = new THREE.Group(); cassette.position.copy(RA); body.add(cassette);
  const COGS = [33, 28, 24, 21, 19, 17, 15, 14, 13, 12, 11, 10];
  COGS.forEach((t, i) => { const { g } = sprocket(t, 0.016, 0.0018, { solid: true }); const c = mesh(g, i < 4 ? M.darkAlu : M.cogs); c.position.x = -0.022 - i * 0.0037; cassette.add(c); });
  add(cylX(0.015, 0.046, 16), M.darkAlu, V(-0.042, 0, 0), null, cassette);

  // ================= 조향부 (포크 + 앞바퀴 + 일체형 바/스템 + 컴퓨터) =================
  const forkRoot = new THREE.Group(); forkRoot.position.copy(HT); forkRoot.rotation.x = -(Math.PI / 2 - RB.HTA); body.add(forkRoot);
  const steer = new THREE.Group(); forkRoot.add(steer);
  const up = new THREE.Group(); up.rotation.x = Math.PI / 2 - RB.HTA; steer.add(up); // 차체 축 좌표로 복귀 (원점 = HT)
  const L = (x, y, z) => V(x, y - HT.y, z - HT.z); // 차체 좌표 → up 로컬
  const frontSpin = wheel(true); frontSpin.position.copy(L(0, FA.y, FA.z)); up.add(frontSpin);
  // 포크 크라운 (헤드튜브 아래 일체형 페어링) + 넓게 벌어진 블레이드
  const crown = onAxis(0.655);
  add(sweep([V(0.055, 0, 0), V(0, 0, 0), V(-0.055, 0, 0)].map((p) => p.add(L(0, crown.y, crown.z))), { w: [[0, 0.016], [0.5, 0.032], [1, 0.016]], d: 0.03, tail: 0.75, segs: 16, axis: V(0, 1, 0) }), M.frame, null, null, up);
  for (const sx of [1, -1]) {
    const g = sweep([L(sx * 0.0565, FA.y, FA.z), L(sx * 0.056, FA.y + 0.1, FA.z - 0.033), L(sx * 0.052, FA.y + 0.22, FA.z - 0.072), L(sx * 0.044, crown.y - 0.012, crown.z - 0.004), L(sx * 0.022, crown.y + 0.004, crown.z - 0.004)], { w: [[0, 0.008], [0.5, 0.0115], [1, 0.016]], d: [[0, 0.013], [0.4, 0.021], [0.9, 0.027], [1, 0.03]], tail: 0.7, segs: 40 });
    add(g, sx < 0 ? M.fork : M.frame, null, null, up);
    add(sideExtrude([[-0.014, -0.012], [0.014, -0.012], [0.016, 0.01], [-0.01, 0.022]], 0.008, 0.0015), M.frame, L(sx * 0.058, FA.y, FA.z), null, up); // 드롭아웃
  }
  // 앞 캘리퍼 (+x 포크 뒤쪽, 플랫마운트)
  {
    const a = (155 * Math.PI) / 180, p = L(0.052, FA.y + Math.sin(a) * 0.072, FA.z + Math.cos(a) * 0.072);
    add(new THREE.BoxGeometry(0.022, 0.034, 0.05).translate(0, 0, 0), M.darkAlu, p, [-0.45, 0, 0], up);
    add(new THREE.BoxGeometry(0.012, 0.026, 0.038), M.black, p.clone().add(V(0.012, 0.004, 0)), [-0.45, 0, 0], up);
  }
  // 스티어러 상단 커버 + 일체형 스템 (헤드튜브 단면과 이어지는 에어로 블록)
  add(sweep([L(0, 0.81, HT.z + 0.006), L(0, 0.842, HT.z + 0.0), L(0, 0.858, HT.z + 0.03), L(0, 0.861, HT.z + 0.075)], { w: [[0, 0.02], [0.5, 0.017], [1, 0.016]], d: [[0, 0.03], [0.5, 0.024], [1, 0.012]], segs: 24, tension: 'chordal' }), M.cockpit, null, null, up);
  // 윙 탑 (앞으로 스윕된 납작 에어로 단면) — 좌우를 하나의 스윕으로
  const S0 = HT.z + 0.075;
  const wing = [V(0.172, 0.874, S0 + 0.07), V(0.12, 0.869, S0 + 0.035), V(0.05, 0.863, S0 + 0.006), V(0, 0.862, S0), V(-0.05, 0.863, S0 + 0.006), V(-0.12, 0.869, S0 + 0.035), V(-0.172, 0.874, S0 + 0.07)].map((p) => L(p.x, p.y, p.z));
  add(sweep(wing, { w: [[0, 0.011], [0.5, 0.0085], [1, 0.011]], d: [[0, 0.016], [0.5, 0.026], [1, 0.016]], tail: 0.55, ex: 2.2, segs: 40, axis: V(0, 1, 0) }), M.cockpit, null, null, up);
  const grips = [];
  for (const sx of [1, -1]) {
    // 윙 끝 → 후드 클램프 → 드롭(앞으로 살짝, 아래, 뒤로)
    const hood = V(sx * 0.19, 0.884, S0 + 0.115);
    const bar = [V(sx * 0.165, 0.874, S0 + 0.065), V(sx * 0.184, 0.878, S0 + 0.092), hood, V(sx * 0.194, 0.876, S0 + 0.134), V(sx * 0.198, 0.85, S0 + 0.14), V(sx * 0.202, 0.808, S0 + 0.128), V(sx * 0.205, 0.775, S0 + 0.098), V(sx * 0.205, 0.762, S0 + 0.06), V(sx * 0.205, 0.759, S0 + 0.02)].map((p) => L(p.x, p.y, p.z));
    add(tube(bar, 0.0125, 48, 12), M.tape, null, null, up);
    add(new THREE.CylinderGeometry(0.0125, 0.0125, 0.006, 12).rotateX(Math.PI / 2), M.black, bar[bar.length - 1], null, up); // 바 엔드 플러그
    // 후드(레버 바디): 측면 프로파일 돌출, 위로 솟은 혼
    const hp = L(sx * 0.19, 0.884, S0 + 0.116);
    const hg = sideExtrude([[-0.012, 0.004], [-0.006, 0.02], [0.02, 0.029], [0.048, 0.034], [0.066, 0.05], [0.078, 0.046], [0.076, 0.026], [0.064, 0.006], [0.044, -0.012], [0.01, -0.016], [-0.012, -0.008]], 0.03, 0.009, 16);
    add(hg, M.hood, hp, [0.08, 0, 0], up);
    // 브레이크/시프트 레버 블레이드
    add(tube([L(sx * 0.19, 0.902, S0 + 0.182), L(sx * 0.193, 0.872, S0 + 0.195), L(sx * 0.197, 0.83, S0 + 0.19), L(sx * 0.2, 0.79, S0 + 0.172), L(sx * 0.2, 0.772, S0 + 0.16)], 0.0055, 20, 8), M.gloss, null, null, up);
    add(new THREE.BoxGeometry(0.004, 0.03, 0.012), M.darkAlu, L(sx * 0.181, 0.86, S0 + 0.19), [0.2, 0, 0], up); // 시프트 패들
    const mk = new THREE.Object3D(); mk.position.copy(L(sx * 0.19, 0.915, S0 + 0.14)); up.add(mk); grips[sx > 0 ? 0 : 1] = mk;
  }
  // ---- 바이크 컴퓨터 (아웃프론트 마운트) ----
  const cmount = add(sweep([L(0, 0.858, S0 - 0.01), L(0, 0.861, S0 + 0.04), L(0, 0.873, S0 + 0.07)], { w: 0.008, d: 0.006, segs: 10 }), M.black, null, null, up); void cmount;
  const comp = new THREE.Group(); comp.position.copy(L(0, 0.886, S0 + 0.086)); comp.rotation.x = 0.28; up.add(comp); // 라이더 쪽으로 기울임
  const cg = new THREE.ExtrudeGeometry(roundedRect(0.054, 0.09, 0.009), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.0025, bevelSegments: 3, curveSegments: 8 });
  cg.rotateX(-Math.PI / 2); cg.translate(0, -0.012, 0); add(cg, M.computer, null, null, comp);
  const [scC, scX] = cv(240, 400); drawComputer(scX, { kmh: 0, dist: 0, time: 0, cad: 0, avg: 0 });
  const screenTex = tex(scC); screenTex.anisotropy = 8;
  const scrM = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.054, 0.09).rotateX(-Math.PI / 2).rotateY(Math.PI), scrM); scr.position.y = 0.0032; comp.add(scr);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.088).rotateX(-Math.PI / 2), M.glass); glass.position.y = 0.0036; comp.add(glass);
  add(new THREE.BoxGeometry(0.004, 0.004, 0.014), M.darkAlu, V(0.029, -0.004, 0.02), null, comp); // 버튼
  add(new THREE.BoxGeometry(0.004, 0.004, 0.014), M.darkAlu, V(-0.029, -0.004, 0.02), null, comp);

  // ================= 프레임 (정적) =================
  // 헤드튜브 (조향축을 따라, 깊은 에어로 단면)
  const htTop = onAxis(HT.y - 0.004), htBot = onAxis(0.665);
  add(sweep([htBot, htTop], { w: [[0, 0.025], [1, 0.021]], d: [[0, 0.034], [1, 0.03]], tail: 0.85, segs: 12 }), M.frame);
  // 다운튜브: BB → 헤드튜브 하단, 깊어지는 단면 (워드마크 CORVANO)
  const dt = [V(0, BB.y + 0.01, BB.z + 0.01), V(0, 0.4, 0.04), V(0, 0.55, 0.2), V(0, 0.67, htBot.z - 0.035), V(0, 0.705, htBot.z - 0.005)];
  add(sweep(dt, { w: [[0, 0.03], [0.5, 0.022], [1, 0.024]], d: [[0, 0.03], [0.4, 0.033], [0.85, 0.045], [1, 0.042]], tail: 0.6, segs: 56 }), M.down);
  // 탑튜브: 시트 클러스터 → 앞에서 위로 꺾여 스템으로 솟는 '플라잉' 형태 (레인보우 스트라이프)
  const SC = V(0, 0.785, -0.192); // 시트 클러스터
  const tt = [V(0, SC.y - 0.004, SC.z - 0.004), V(0, 0.792, -0.05), V(0, 0.8, 0.12), V(0, 0.806, 0.22), V(0, 0.822, HT.z - 0.03), V(0, 0.84, HT.z - 0.004)];
  add(sweep(tt, { w: [[0, 0.02], [0.5, 0.016], [0.85, 0.02], [1, 0.022]], d: [[0, 0.016], [0.6, 0.0135], [0.88, 0.02], [1, 0.03]], tail: 0.9, segs: 56, tension: 'chordal' }), M.top);
  // 시트 마스트: 드롭 시트스테이 접합부 J → 앞으로 기울며 클러스터로 (Y자)
  const J = V(0, 0.628, -0.25);
  add(sweep([V(0, J.y - 0.03, J.z - 0.008), J, V(0, 0.72, -0.222), V(0, SC.y + 0.012, SC.z - 0.002)], { w: [[0, 0.022], [1, 0.018]], d: [[0, 0.026], [1, 0.024]], tail: 0.7, segs: 24 }), M.frame);
  // 탑튜브 밑 웹(필렛)
  add(sideExtrude([[-0.215, 0.79], [-0.12, 0.79], [-0.155, 0.775], [-0.2, 0.735], [-0.226, 0.72]], 0.026, 0.006), M.frame);
  // 시트튜브: J 에서 뒷바퀴를 감싸며(곡선) BB 로
  const st = [];
  for (const [ang, rr] of [[48.5, 0.367], [38, 0.369], [26, 0.372], [14, 0.378], [3, 0.39]]) { const a = (ang * Math.PI) / 180; st.push(V(0, RA.y + Math.sin(a) * rr, RA.z + Math.cos(a) * rr)); }
  st.push(V(0, BB.y + 0.012, BB.z - 0.004));
  add(sweep(st.reverse(), { w: [[0, 0.028], [0.3, 0.02], [1, 0.02]], d: [[0, 0.032], [0.3, 0.026], [1, 0.024]], tail: 0.8, segs: 40 }), M.seat);
  // BB 쉘 + 체인스테이 접합 블록
  add(cylX(0.026, 0.088, 24), M.frame, BB);
  add(new THREE.SphereGeometry(1, 20, 14).scale(0.04, 0.034, 0.045), M.frame, V(0, BB.y + 0.005, BB.z - 0.012));
  // 시트스테이 (드롭, 얇은 납작 단면) + 체인스테이
  for (const sx of [1, -1]) {
    add(sweep([V(sx * 0.014, J.y + 0.005, J.z - 0.004), V(sx * 0.034, 0.56, -0.31), V(sx * 0.058, 0.43, -0.42), V(sx * 0.066, RA.y + 0.012, RA.z + 0.008)], { w: [[0, 0.009], [1, 0.0065]], d: [[0, 0.013], [1, 0.0105]], segs: 30 }), M.frame);
    const csx = sx > 0 ? 0.03 : 0.026;
    add(sweep([V(sx * csx * 0.6, BB.y - 0.004, BB.z - 0.01), V(sx * csx, BB.y + 0.002, BB.z - 0.08), V(sx * 0.045, 0.31, -0.24), V(sx * 0.062, RA.y - 0.004, -0.4), V(sx * 0.066, RA.y - 0.006, RA.z + 0.004)], { w: [[0, 0.012], [1, 0.0075]], d: [[0, 0.02], [0.5, 0.017], [1, 0.012]], segs: 36 }), sx < 0 ? M.chainstay : M.frame);
    add(sideExtrude([[-0.018, -0.012], [0.03, -0.016], [0.034, 0.01], [0.012, 0.02], [-0.016, 0.014]], 0.009, 0.002), M.frame, V(sx * 0.068, RA.y, RA.z)); // 드롭아웃
  }
  add(new THREE.BoxGeometry(0.008, 0.03, 0.014), M.darkAlu, V(-0.07, RA.y - 0.026, RA.z + 0.006)); // 디레일러 행어
  // 뒤 캘리퍼 (+x 체인스테이 위)
  { const a = (28 * Math.PI) / 180, p = V(0.058, RA.y + Math.sin(a) * 0.062, RA.z + Math.cos(a) * 0.062); add(new THREE.BoxGeometry(0.022, 0.03, 0.05), M.darkAlu, p, [0.5, 0, 0]); add(new THREE.BoxGeometry(0.012, 0.024, 0.038), M.black, p.clone().add(V(0.012, 0.004, 0)), [0.5, 0, 0]); }
  // 시트포스트 (뒤로 비스듬히 튀어나옴) + 칼라 + 클램프 헤드
  const spTop = V(0, 0.996, -0.293);
  add(sweep([V(0, SC.y - 0.02, SC.z + 0.006), V(0, 0.83, -0.207), spTop], { w: 0.0115, d: [[0, 0.019], [1, 0.0165]], tail: 0.7, segs: 16 }), M.post);
  add(sweep([V(0, 0.812, -0.2), V(0, 0.84, -0.214)], { w: 0.0145, d: 0.022, segs: 4 }), M.black); // 칼라(실 웨지)
  add(new THREE.BoxGeometry(0.03, 0.016, 0.04), M.darkAlu, spTop.clone().add(V(0, 0.006, -0.006)));
  // 안장: 숏노즈, 3D 프린트 허니컴 상판
  {
    const o = [[0, -0.128], [0.045, -0.125], [0.068, -0.108], [0.071, -0.07], [0.062, -0.02], [0.04, 0.04], [0.022, 0.09], [0.018, 0.122], [0, 0.128]];
    const sh = new THREE.Shape(); const pts = [...o, ...o.slice(1, -1).reverse().map(([x, z]) => [-x, z])];
    pts.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 4, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); // shape y(-z) → z
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i), xx = p.getX(i); p.setY(i, p.getY(i) + (z < -0.07 ? (-0.07 - z) * 0.25 : 0) + (z > 0.06 ? -(z - 0.06) * 0.12 : 0) - Math.pow(xx / 0.07, 2) * 0.006 + (Math.abs(xx) < 0.012 && z > -0.09 && z < 0.07 ? -0.004 : 0)); }
    g.computeVertexNormals();
    const sad = add(g, [M.saddle, M.saddleBase], V(0, 1.012, -0.305), [-0.03, 0, 0]);
    void sad;
    for (const sx of [1, -1]) add(tube([V(sx * 0.03, 1.01, -0.4), V(sx * 0.024, 0.998, -0.33), V(sx * 0.02, 0.998, -0.25), V(sx * 0.016, 1.008, -0.2)], 0.0035, 12, 6), M.black);
  }
  // 물병 케이지 2개 (다운튜브 위, 시트튜브 앞)
  const cage = (a, b, n) => { const d = V(0, 0, 0).subVectors(b, a).normalize(), side = V(1, 0, 0);
    for (const sx of [1, -1]) add(tube([a.clone(), a.clone().lerp(b, 0.25).addScaledVector(n, 0.035).addScaledVector(side, sx * 0.03), a.clone().lerp(b, 0.75).addScaledVector(n, 0.04).addScaledVector(side, sx * 0.032), b.clone().addScaledVector(n, 0.02).addScaledVector(side, sx * 0.012)], 0.003, 16, 5), M.black);
    add(tube([b.clone().addScaledVector(n, 0.02).addScaledVector(side, 0.012), b.clone().addScaledVector(n, 0.05).addScaledVector(d, 0.01), b.clone().addScaledVector(n, 0.02).addScaledVector(side, -0.012)], 0.003, 10, 5), M.black); };
  cage(V(0, 0.425, 0.06), V(0, 0.56, 0.21), V(0, 0.8, -0.6).normalize());
  cage(V(0, 0.36, -0.118), V(0, 0.55, -0.17), V(0, 0.15, 0.99).normalize());

  // ================= 구동계 =================
  // 크랭크셋 (회전 그룹) : 50/37T, 172.5 mm, 크랭크 회전 = +x 축 (바퀴와 같은 방향 = 앞으로)
  const crank = new THREE.Group(); crank.position.copy(BB); body.add(crank);
  const big = sprocket(50, 0.07, 0.0035), small = sprocket(37, 0.052, 0.003);
  add(big.g, M.black, V(-0.048, 0, 0), null, crank); add(small.g, M.darkAlu, V(-0.041, 0, 0), null, crank);
  // 에어로 스파이더 커버 (파워미터 느낌의 원판)
  add(lathe([[0, -0.006], [0.062, -0.004], [0.072, 0], [0.062, 0.003], [0, 0.005]], 40), M.black, V(-0.053, 0, 0), null, crank);
  add(new THREE.TorusGeometry(0.064, 0.0025, 6, 40).rotateY(Math.PI / 2), M.darkAlu, V(-0.058, 0, 0), null, crank);
  add(cylX(0.012, 0.15, 16), M.darkAlu, null, null, crank); // 스핀들
  const pedals = [];
  for (const sx of [-1, 1]) {
    // 드라이브(-x) 암은 +y(위) 방향, 반대쪽은 -y. 테이퍼드 에어로 암
    const dir = sx < 0 ? 1 : -1, x0 = sx * 0.072;
    add(sweep([V(x0, 0, 0), V(x0 + sx * 0.004, dir * RB.CRANK * 0.5, 0), V(x0 + sx * 0.006, dir * RB.CRANK, 0)], { w: 0.0075, d: [[0, 0.019], [1, 0.011]], axis: V(1, 0, 0), segs: 12 }), M.black, null, null, crank);
    const pg = new THREE.Group(); pg.position.set(x0 + sx * 0.012, dir * RB.CRANK, 0); crank.add(pg);
    add(cylX(0.005, 0.05, 8).translate(sx * 0.025, 0, 0), M.steel, null, null, pg);
    const pb = add(sideExtrude([[-0.04, -0.006], [0.042, -0.004], [0.046, 0.006], [0.02, 0.011], [-0.03, 0.01], [-0.044, 0.002]], 0.058, 0.003), M.black, V(sx * 0.04, 0, 0), null, pg);
    add(new THREE.BoxGeometry(0.03, 0.002, 0.05), M.steel, V(sx * 0.04, 0.0105, 0), null, pg); // 스테인리스 접지판
    void pb; pedals.push(pg);
  }
  // 체인 경로 (x = -0.046): 체인링 앞쪽 반 → 하단 → 하부 풀리(뒤로 감음) → 상부 풀리(앞으로 감음) → 코그 뒤쪽 → 상단 런
  const cogR = sprocket(15, 0.016, 0.002).rp, ringR = big.rp, pu = 0.019;
  const U = V(0, RA.y - 0.058, RA.z - 0.004), Lp = V(0, RA.y - 0.132, RA.z + 0.018);
  const cp = []; const arc = (c, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; cp.push(V(-0.046, c.y + Math.sin(a) * r, c.z + Math.cos(a) * r)); } };
  arc(BB, ringR + 0.002, Math.PI / 2 - 0.03, -Math.PI / 2 - 0.1, 14); // 체인링 앞면 (위 → 앞 → 아래)
  arc(Lp, pu, -Math.PI / 2 - 0.15, -Math.PI * 1.5 + 0.35, 8); // 하부 풀리 뒤로 감기
  arc(U, pu, -Math.PI / 2 + 0.5, Math.PI / 2 - 0.6, 8); // 상부 풀리 앞으로
  arc(RA, cogR + 0.002, -Math.PI / 2 - 0.3, -Math.PI * 1.5 + 0.03, 10); // 코그 뒤쪽 (아래 → 뒤 → 위)
  const chainCurve = new THREE.CatmullRomCurve3(cp, true, 'centripetal');
  const chainT = chainTex(); chainT.repeat.set(chainCurve.getLength() / 0.0254, 1);
  const chainM = new THREE.MeshStandardMaterial({ map: chainT, envMap: env, metalness: 0.85, roughness: 0.35 });
  const chainG = new THREE.TubeGeometry(chainCurve, 320, 0.0034, 6, true);
  add(chainG, chainM);
  // 리어 디레일러 (바디 + 패럴로그램 + 케이지 + 풀리 2개)
  {
    const g = new THREE.Group(); body.add(g);
    add(new THREE.BoxGeometry(0.016, 0.03, 0.03), M.black, V(-0.078, RA.y - 0.03, RA.z + 0.002), [0.4, 0, 0], g);
    add(sideExtrude([[-0.03, -0.02], [0.012, -0.03], [0.02, 0.0], [-0.01, 0.012]], 0.02, 0.004), M.black, V(-0.08, RA.y - 0.045, RA.z - 0.012), null, g);
    add(new THREE.BoxGeometry(0.012, 0.022, 0.026), M.darkAlu, V(-0.074, RA.y - 0.072, RA.z - 0.022), [0.3, 0, 0], g);
    for (const [c, sx] of [[U, 1], [Lp, 1]]) { const pl = sprocket(12, 0.004, 0.003, { solid: true }); add(pl.g, M.darkAlu, V(-0.046, c.y, c.z), null, g); void sx; }
    for (const ox of [-0.054, -0.038]) add(sideExtrude([[U.z - 0.012, U.y + 0.006], [U.z + 0.012, U.y + 0.004], [Lp.z + 0.016, Lp.y], [Lp.z, Lp.y - 0.016], [Lp.z - 0.014, Lp.y - 0.004]], 0.0022, 0), ox < -0.05 ? M.black : M.darkAlu, V(ox, 0, 0), null, g);
  }
  // 프론트 디레일러
  add(sideExtrude([[-0.03, 0], [0.02, 0.006], [0.04, 0.0], [0.03, -0.012], [-0.025, -0.014]], 0.012, 0.002), M.black, V(-0.052, BB.y + big.rp + 0.02, BB.z - 0.035), [0.55, 0, 0]);
  add(new THREE.BoxGeometry(0.014, 0.02, 0.016), M.black, V(-0.03, BB.y + big.rp + 0.035, BB.z - 0.05));

  // 주차 스탠드 (뒤 차축을 받치는 휴대용 디스플레이 스탠드) — 주차 중에만 보임
  const stand = new THREE.Group(); body.add(stand);
  for (const sx of [1, -1]) add(tube([V(sx * 0.076, RA.y, RA.z), V(sx * 0.15, 0.12, RA.z - 0.06), V(sx * 0.2, 0.004, RA.z - 0.12)], 0.006, 12, 6), M.black, null, null, stand);
  add(tube([V(0.2, 0.004, RA.z - 0.12), V(0, 0.004, RA.z - 0.16), V(-0.2, 0.004, RA.z - 0.12)], 0.006, 12, 6), M.black, null, null, stand);

  root.userData = { lean, body, steer, up, frontSpin, rearSpin, cassette, crank, pedals, grips, stand, chainTex: chainT, screen: { canvas: scC, ctx: scX, tex: screenTex }, comp };
  root.traverse((o) => { if (o.isMesh && o.material?.transparent) o.castShadow = false; });
  return root;
}
