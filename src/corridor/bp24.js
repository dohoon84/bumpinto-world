// [bp24] 성남시청 길 건너 1층 편의점 → 우리 브랜드 'BP24' (실제 GS25 자리, 간판/로고는 bumpinto 아이덴티티).
//   ?bp24=1 일 때만. 기본 OFF → 플래그 없으면 월드는 그대로.
//   자리: 코리더 타일 3_-12, 공원 띠(x≈1608~1627) 서쪽 · 큰길(z≈-5778) 북쪽 모퉁이 상가 건물(중심 1601.1,-5752.8 · h17.3).
//   그 건물의 1층(0~GF m)을 비우고(mh=GF 사본 + 충돌용 nr 원본) 유리 상점을 끼운다.
//   draw call (가까이·밤): 외부 불투명 1 + 간판 1 + 유리 1 + 발광 1 + 바닥 빛 1 + 내부 1 + 상품 1 = 7 (+그림자 1). 낮엔 발광·바닥 빛 0.
//   텍스처: 간판 1024×256 + 상품 512×256 캔버스 2장(≈1.7MB GPU, 밉맵 포함). 내부는 LOD 로 170m 밖에서 숨김.
import * as THREE from 'three';
import { nightFade, onNightTarget } from '../world/nightFade.js';

export function bp24Enabled(search = typeof location !== 'undefined' ? location.search : '') {
  const p = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  return p.get('bp24') === '1';
}

export const BP24 = {
  tile: '3_-12',
  match: { x: 1601.1, z: -5752.8, r: 2 },
  x0: 1592.8, x1: 1608.5, // 유리 앞면(남, 큰길 쪽) x 범위
  zf: -5761.6, zb: -5751.3, // 앞면 z · 옆 유리(동, 공원 쪽) 끝 z
  gf: 4.4, // 1층(유리+간판 띠) 높이 → 위층은 여기부터
};
const GLASS_H = 3.3, FASCIA_OUT = 0.38;

const cen = (o) => { let x = 0, z = 0; for (const p of o) { x += p[0]; z += p[1]; } return [x / o.length, z / o.length]; };

// 타일 JSON: 대상 건물을 충돌용(nr) + 위층(mh=gf) 두 개로 나눈다. 원본 객체는 건드리지 않는다.
export function filterBp24Tile(key, j) {
  if (key !== BP24.tile || !j?.b?.length) return j;
  const i = j.b.findIndex((b) => { if (!b.o?.length || b.nr || b.mh) return false; const [x, z] = cen(b.o); return Math.hypot(x - BP24.match.x, z - BP24.match.z) < BP24.match.r; });
  if (i < 0) return j;
  const src = j.b[i];
  const b = j.b.slice();
  b[i] = { ...src, nr: 1, lm: 'bp24' };
  b.push({ ...src, mh: BP24.gf, lm: 'bp24Upper' });
  BP24.ring = src.o;
  return { ...j, b };
}

// ---------- 지오메트리 가방 (정점색 + uv, 한 메시로) ----------
const V = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
class Bag {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.i = []; }
  // n: 바깥 법선, c: 중심, w/h: 크기, col: [r,g,b], uv: [u0,v0,u1,v1]
  quad(n, c, w, h, col, uv = null, up = null) {
    const u = up ? up.clone() : (Math.abs(n.y) > 0.9 ? new THREE.Vector3(0, 0, -n.y) : UP.clone());
    const r = new THREE.Vector3().crossVectors(u, n).normalize().multiplyScalar(w / 2);
    u.normalize().multiplyScalar(h / 2);
    const k = this.p.length / 3;
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const [u0, v0, u1, v1] = uv || [0, 0, 0, 0];
    const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (let q = 0; q < 4; q++) {
      V.copy(c).addScaledVector(r, pts[q][0]).addScaledVector(u, pts[q][1]);
      this.p.push(V.x, V.y, V.z); this.n.push(n.x, n.y, n.z); this.c.push(col[0], col[1], col[2]); this.uv.push(uvs[q][0], uvs[q][1]);
    }
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  // 축 정렬 상자. shade: 면별 명암(무광 재질용), skip: 생략할 면 문자열 'xXyYzZ'
  box(x0, y0, z0, x1, y1, z1, col, shade = false, skip = '') {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    const S = (f) => (shade ? col.map((v) => v * f) : col);
    if (!skip.includes('Y')) this.quad(new THREE.Vector3(0, 1, 0), new THREE.Vector3(cx, y1, cz), sx, sz, S(1));
    if (!skip.includes('y')) this.quad(new THREE.Vector3(0, -1, 0), new THREE.Vector3(cx, y0, cz), sx, sz, S(0.7));
    if (!skip.includes('X')) this.quad(new THREE.Vector3(1, 0, 0), new THREE.Vector3(x1, cy, cz), sz, sy, S(0.86));
    if (!skip.includes('x')) this.quad(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(x0, cy, cz), sz, sy, S(0.8));
    if (!skip.includes('Z')) this.quad(new THREE.Vector3(0, 0, 1), new THREE.Vector3(cx, cy, z1), sx, sy, S(0.9));
    if (!skip.includes('z')) this.quad(new THREE.Vector3(0, 0, -1), new THREE.Vector3(cx, cy, z0), sx, sy, S(0.94));
  }
  mesh(mat, name) {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = name; return m;
  }
}
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

// ---------- 캔버스 텍스처 ----------
const LOGO_B = 'M435 265H720C850 265 940 355 940 470C940 535 905 590 858 620C930 650 975 715 975 800C975 920 880 1010 740 1010H445C365 1010 308 950 308 870V390C308 320 360 265 435 265Z';
const LOGO_SEA = 'M300 1040L300 940L332 937C350 915 370 893 386 881C398 873 414 876 417 892C421 912 410 930 414 947C418 962 428 972 440 970C456 968 466 952 470 940C478 916 500 894 532 887C560 881 584 862 582 836C580 818 566 808 558 800C556 790 572 784 592 788C620 792 648 786 663 756C700 756 760 770 800 788C780 806 750 800 722 818C706 830 706 862 728 880C746 892 770 884 790 902C806 922 818 926 836 932C848 940 856 954 862 970L880 1040Z';
function drawLogo(ctx, x, y, size) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 800, size / 800); ctx.translate(-241.5, -237.5);
  const B = new Path2D(LOGO_B);
  ctx.fillStyle = '#0072DD'; ctx.fill(B);
  ctx.save(); ctx.clip(B);
  ctx.beginPath(); ctx.arc(635, 1131, 413, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#CDE6FB'; ctx.fillRect(200, 700, 900, 400);
  ctx.fillStyle = '#1485E6'; ctx.fill(new Path2D(LOGO_SEA));
  ctx.restore();
  ctx.save(); ctx.clip(B);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 68; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(300, 654); ctx.lineTo(535, 654); ctx.bezierCurveTo(590, 654, 628, 628, 655, 588); ctx.lineTo(723, 472); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(723, 472, 97, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FF3B3B'; ctx.beginPath(); ctx.arc(723, 472, 52, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR","Arial Black","Helvetica Neue",Arial,sans-serif';
function signPanel(ctx, x, y, w, h, { brackets = true, sub = true } = {}) {
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#13264a'); g.addColorStop(1, '#0a1630');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const fs = Math.round(h * 0.62), ls = Math.round(h * 0.66);
  ctx.font = `900 ${fs}px ${FONT}`; ctx.textBaseline = 'middle';
  const wBP = ctx.measureText('BP').width, w24 = ctx.measureText('24').width;
  const total = ls + h * 0.14 + wBP + w24 + fs * 0.04;
  let cx = x + (w - total) / 2;
  drawLogo(ctx, cx, y + (h - ls) / 2, ls); cx += ls + h * 0.14;
  ctx.shadowColor = 'rgba(120,200,255,0.9)'; ctx.shadowBlur = h * 0.12;
  ctx.fillStyle = '#ffffff'; ctx.fillText('BP', cx, y + h * 0.53); cx += wBP + fs * 0.04;
  ctx.fillStyle = '#3aa6ff'; ctx.fillText('24', cx, y + h * 0.53);
  ctx.shadowBlur = 0;
  if (brackets) { // 대각선으로 마주 보는 ⌜ ⌟ 꺾쇠 (실제 매장의 위쪽 꺾쇠와 일부러 다르게)
    ctx.strokeStyle = '#38b6ff'; ctx.lineWidth = Math.max(3, h * 0.07); ctx.shadowColor = 'rgba(56,182,255,0.9)'; ctx.shadowBlur = h * 0.1;
    const m = h * 0.2, L = w * 0.09, H = h * 0.42;
    ctx.beginPath(); ctx.moveTo(x + m, y + m + H); ctx.lineTo(x + m, y + m); ctx.lineTo(x + m + L, y + m); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - m, y + h - m - H); ctx.lineTo(x + w - m, y + h - m); ctx.lineTo(x + w - m - L, y + h - m); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  if (sub) { ctx.font = `700 ${Math.round(h * 0.13)}px ${FONT}`; ctx.fillStyle = 'rgba(205,230,251,0.75)'; ctx.textAlign = 'right'; ctx.fillText('bumpinto.world', x + w - h * 0.95, y + h * 0.84); ctx.textAlign = 'left'; }
}
// 간판 아틀라스 1024×256: 앞 띠(0,0,1024,112) · 옆 띠(0,128,512,112) · 돌출 간판(544,120,64,136)
const SIGN = { W: 1024, H: 256, front: [0, 0, 1024, 112], side: [0, 128, 512, 112], blade: [544, 120, 64, 136] };
const rectUV = ([x, y, w, h], W, H, pad = 1) => [(x + pad) / W, 1 - (y + h - pad) / H, (x + w - pad) / W, 1 - (y + pad) / H];
function signTexture() {
  const cv = document.createElement('canvas'); cv.width = SIGN.W; cv.height = SIGN.H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0a1630'; ctx.fillRect(0, 0, SIGN.W, SIGN.H);
  signPanel(ctx, ...SIGN.front);
  signPanel(ctx, ...SIGN.side, { sub: false });
  { // 돌출 간판: 흰 바탕 + 로고 + 세로 BP24
    const [x, y, w, h] = SIGN.blade;
    ctx.fillStyle = '#f4f8fc'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#0072DD'; ctx.fillRect(x, y + h - 6, w, 6);
    drawLogo(ctx, x + 6, y + 6, w - 12);
    ctx.font = `900 22px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0b1830'; ctx.fillText('BP', x + w / 2, y + w + 14);
    ctx.fillStyle = '#0072DD'; ctx.fillText('24', x + w / 2, y + w + 38);
    ctx.textAlign = 'left';
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// 상품 아틀라스 512×256: 32px 줄 8개 (0~5 과자·라면 봉지, 6~7 음료병)
const PROD = { W: 512, H: 256, row: 32, rows: 8 };
const PACK = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#f06292', '#ffffff', '#6d4c41', '#00897b', '#c62828', '#ffb300', '#3949ab'];
function productTexture() {
  const cv = document.createElement('canvas'); cv.width = PROD.W; cv.height = PROD.H;
  const ctx = cv.getContext('2d');
  let s = 12345; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < PROD.rows; r++) {
    const y = r * PROD.row;
    ctx.fillStyle = '#f3f3f1'; ctx.fillRect(0, y, PROD.W, PROD.row);
    const bottles = r >= 6;
    for (let x = 1; x < PROD.W;) {
      const w = bottles ? 7 + rnd() * 5 : 12 + rnd() * 20, col = PACK[Math.floor(rnd() * PACK.length)];
      const top = bottles ? 4 + rnd() * 6 : 3 + rnd() * 9, ww = Math.min(w - 1.5, PROD.W - x);
      if (bottles) {
        ctx.fillStyle = 'rgba(180,220,235,0.9)'; ctx.fillRect(x + ww * 0.3, y + top - 3, ww * 0.4, 4);
        ctx.fillStyle = col; ctx.fillRect(x, y + top, ww, PROD.row - top - 3);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x, y + top + 8, ww, 6);
      } else {
        ctx.fillStyle = col; ctx.fillRect(x, y + top, ww, PROD.row - top - 3);
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 2, y + top + 3 + rnd() * 6, ww - 4, 4 + rnd() * 4);
      }
      x += w;
    }
    ctx.fillStyle = '#d9dde0'; ctx.fillRect(0, y + PROD.row - 3, PROD.W, 3); // 가격표 띠
    ctx.fillStyle = '#ffe14d'; for (let x = 6; x < PROD.W; x += 38 + rnd() * 30) ctx.fillRect(x, y + PROD.row - 3, 9, 3);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- 재질(모듈 공용 캐시 — 타일이 풀려도 유지, 작다) ----------
let MAT = null;
function mats() {
  if (MAT) return MAT;
  const signTex = signTexture(), prodTex = productTexture();
  MAT = {
    ext: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }),
    sign: new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }),
    glass: new THREE.MeshStandardMaterial({ color: '#cfe4f2', roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    spill: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    int: new THREE.MeshBasicMaterial({ vertexColors: true }), // 실내는 자체 LED 조명 → 낮/밤 같은 밝기(조명 계산 없음)
    prod: new THREE.MeshBasicMaterial({ map: prodTex, vertexColors: true }),
  };
  return MAT;
}

// ---------- 빌드 ----------
function buildStore() {
  const M = mats();
  const { x0, x1, zf, zb, gf } = BP24;
  const W = x1 - x0, D = zb - zf; // 15.7 × 10.3
  const ext = new Bag(), glow = new Bag(), glass = new Bag(), sign = new Bag(), spill = new Bag(), int = new Bag(), prod = new Bag();
  const N = (x, y, z) => new THREE.Vector3(x, y, z), P = (x, y, z) => new THREE.Vector3(x, y, z);
  const STONE = hex('#c9ccd1'), DARK = hex('#2a2f36'), NAVY = hex('#0d1a33'), BLACK = hex('#16181c'), MULL = hex('#3b424b');

  // 1) 1층 바깥 벽: 건물 외곽 중 유리 두 면(남·동)을 뺀 나머지 변을 0~gf 로 막는다
  const ring = BP24.ring || [[1592.7, -5750.5], [1596.6, -5750.5], [1596.6, -5747.7], [1606.4, -5747.5], [1606.4, -5751.3], [1608.4, -5751.3], [1608.6, -5761.6], [1592.8, -5761.6]];
  let area = 0; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; area += a[0] * b[1] - b[0] * a[1]; }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.2) continue;
    const southGlass = Math.abs(a[1] - zf) < 0.3 && Math.abs(b[1] - zf) < 0.3;
    const eastGlass = Math.abs(a[0] - x1) < 0.4 && Math.abs(b[0] - x1) < 0.4 && Math.min(a[1], b[1]) < zb + 0.3;
    if (southGlass || eastGlass) continue;
    let nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L; if (area > 0) { nx = -nx; nz = -nz; } // 바깥쪽
    ext.quad(N(nx, 0, nz), P(mx + nx * 0.02, gf / 2, mz + nz * 0.02), L, gf, STONE);
  }
  // 2) 간판 띠(앞·옆) + 아래 처마, 모퉁이 기둥, 앞면 기둥
  ext.box(x0 - 0.05, GLASS_H, zf - FASCIA_OUT, x1 + FASCIA_OUT, gf, zf + 0.25, NAVY);
  ext.box(x1 - 0.25, GLASS_H, zf - FASCIA_OUT, x1 + FASCIA_OUT, gf, zb, NAVY);
  ext.box(x0 - 0.05, gf, zf - FASCIA_OUT, x1 + FASCIA_OUT, gf + 0.06, zb, DARK, false, 'y'); // 띠 위 마감
  ext.box(x1 - 0.55, 0, zf - 0.25, x1 + 0.2, GLASS_H, zf + 0.5, DARK); // 모퉁이 기둥
  ext.box(x0 - 0.05, 0, zf - 0.12, x0 + 0.45, GLASS_H, zf + 0.3, STONE); // 서쪽 끝 기둥
  ext.box(x0 + 0.45, 0, zf - 0.06, x1 - 0.55, 0.32, zf + 0.06, DARK); // 유리 밑 턱
  ext.box(x1 - 0.06, 0, zf + 0.5, x1 + 0.06, 0.32, zb, DARK);
  // 유리 + 멀리언
  const fx0 = x0 + 0.45, fx1 = x1 - 0.55;
  glass.quad(N(0, 0, -1), P((fx0 + fx1) / 2, (0.32 + GLASS_H) / 2, zf), fx1 - fx0, GLASS_H - 0.32, [1, 1, 1]);
  glass.quad(N(1, 0, 0), P(x1, (0.32 + GLASS_H) / 2, (zf + 0.5 + zb) / 2), zb - zf - 0.5, GLASS_H - 0.32, [1, 1, 1]);
  const nF = Math.round((fx1 - fx0) / 1.75);
  for (let k = 1; k < nF; k++) { const x = fx0 + ((fx1 - fx0) * k) / nF; ext.box(x - 0.04, 0.32, zf - 0.05, x + 0.04, GLASS_H, zf + 0.05, MULL); }
  ext.box(fx0, 2.55, zf - 0.05, fx1, 2.62, zf + 0.05, MULL); // 가로대
  const nS = Math.round((zb - zf - 0.5) / 1.75);
  for (let k = 1; k < nS; k++) { const z = zf + 0.5 + ((zb - zf - 0.5) * k) / nS; ext.box(x1 - 0.05, 0.32, z - 0.04, x1 + 0.05, GLASS_H, z + 0.04, MULL); }
  ext.box(x1 - 0.05, 2.55, zf + 0.5, x1 + 0.05, 2.62, zb, MULL);
  // 출입문(가운데 두 칸): 손잡이
  const dx = fx0 + ((fx1 - fx0) * Math.floor(nF / 2)) / nF;
  ext.box(dx - 0.2, 1.0, zf - 0.09, dx - 0.16, 1.5, zf - 0.05, hex('#c0c6cc'));
  ext.box(dx + 0.16, 1.0, zf - 0.09, dx + 0.2, 1.5, zf - 0.05, hex('#c0c6cc'));
  // 3) 간판 면(캔버스): 앞 9.0×1.0, 옆 4.6×1.0, 돌출 간판(모퉁이 기둥에서 앞으로)
  const sy = (GLASS_H + gf) / 2;
  sign.quad(N(0, 0, -1), P((x0 + x1) / 2 - 0.6, sy, zf - FASCIA_OUT - 0.01), 9.0, 1.0, [1, 1, 1], rectUV(SIGN.front, SIGN.W, SIGN.H));
  sign.quad(N(1, 0, 0), P(x1 + FASCIA_OUT + 0.01, sy, (zf + zb) / 2 + 0.3), 4.6, 1.0, [1, 1, 1], rectUV(SIGN.side, SIGN.W, SIGN.H));
  const bx = x1 - 0.17, bz = zf - 0.25 - 0.55, by = 2.45;
  ext.box(bx - 0.07, by - 0.62, bz - 0.5, bx + 0.07, by + 0.62, bz + 0.5, BLACK); // 돌출 간판 틀
  sign.quad(N(1, 0, 0), P(bx + 0.072, by, bz), 0.46, 1.0, [1, 1, 1], rectUV(SIGN.blade, SIGN.W, SIGN.H));
  sign.quad(N(-1, 0, 0), P(bx - 0.072, by, bz), 0.46, 1.0, [1, 1, 1], rectUV(SIGN.blade, SIGN.W, SIGN.H));
  // 간판 띠 아래 LED 줄(밤)
  glow.box(x0 + 0.3, GLASS_H - 0.05, zf - FASCIA_OUT + 0.02, x1 + 0.1, GLASS_H - 0.01, zf - FASCIA_OUT + 0.08, hex('#bfe6ff'));
  glow.box(x1 + FASCIA_OUT - 0.08, GLASS_H - 0.05, zf - 0.2, x1 + FASCIA_OUT - 0.02, GLASS_H - 0.01, zb - 0.2, hex('#bfe6ff'));
  // 4) 보도 볼라드(검은 기둥 + 흰 머리) + 낮은 난간
  const bol = [];
  for (let x = x0 + 0.6; x <= x1 + 1.2; x += 1.9) bol.push([x, zf - 1.7]);
  for (let z = zf - 1.7 + 1.9; z <= zb + 0.2; z += 1.9) bol.push([x1 + 1.3, z]);
  for (const [x, z] of bol) {
    ext.box(x - 0.09, 0, z - 0.09, x + 0.09, 0.95, z + 0.09, BLACK);
    glow.box(x - 0.08, 0.95, z - 0.08, x + 0.08, 1.07, z + 0.08, hex('#f4f8ff'));
    ext.box(x - 0.1, 1.07, z - 0.1, x + 0.1, 1.12, z + 0.1, BLACK, false, 'y');
  }
  ext.box(x0 + 0.6, 0.68, zf - 1.72, x1 + 1.3, 0.72, zf - 1.68, BLACK);
  ext.box(x1 + 1.28, 0.68, zf - 1.7, x1 + 1.32, 0.72, zb + 0.2, BLACK);
  // 앞 보도 데크(밝은 타일 한 장 — 실제 매장 앞 테라스)
  ext.box(x0, 0, zf - 1.9, x1 + 1.5, 0.04, zf, hex('#a9a39a'));
  ext.box(x1, 0, zf - 1.9, x1 + 1.5, 0.04, zb + 0.3, hex('#a9a39a'));
  // 밤 바닥 빛(가산 혼합: 가장자리 검정 = 투명)
  const spillStrip = (ax, az, bxx, bzz, nx, nz, len) => {
    const k = spill.p.length / 3, c0 = [0.2, 0.23, 0.26], c1 = [0, 0, 0];
    const pts = [[ax, az, c0], [bxx, bzz, c0], [bxx + nx * len, bzz + nz * len, c1], [ax + nx * len, az + nz * len, c1]];
    for (const [x, z, c] of pts) { spill.p.push(x, 0.06, z); spill.n.push(0, 1, 0); spill.c.push(...c); spill.uv.push(0, 0); }
    spill.i.push(k, k + 2, k + 1, k, k + 3, k + 2);
  };
  spillStrip(x0 + 0.4, zf - 0.05, x1, zf - 0.05, 0, -1, 4.2);
  spillStrip(x1 + 0.05, zf, x1 + 0.05, zb, 1, 0, 3.5);

  // 5) 실내 (자체 발광 정점색, LOD 로 멀면 숨김)
  const WH = hex('#f4f5f3'), WALL = hex('#eceeed'), FLOOR = hex('#e3e5e3'), CEIL = hex('#e9ebec'), LED = hex('#ffffff');
  const WIRE = hex('#dfe2e4'), WOOD = hex('#d2b48a'), TEAL = hex('#2aa6a8'), BLUE = hex('#1f6fd1'), FR = hex('#cfd6db');
  const ix0 = x0 + 0.1, ix1 = x1 - 0.1, iz0 = zf + 0.08, iz1 = zb - 0.15, ceil = GLASS_H - 0.05;
  // 바닥 타일(격자: 밝기 교대)
  for (let i = 0, x = ix0; x < ix1 - 0.01; x += 1.2, i++) for (let j = 0, z = iz0; z < iz1 - 0.01; z += 1.2, j++) {
    const xe = Math.min(ix1, x + 1.18), ze = Math.min(iz1, z + 1.18), f = (i + j) % 2 ? 1 : 0.965;
    int.quad(N(0, 1, 0), P((x + xe) / 2, 0.02, (z + ze) / 2), xe - x, ze - z, FLOOR.map((v) => v * f));
  }
  int.quad(N(0, -1, 0), P((ix0 + ix1) / 2, ceil, (iz0 + iz1) / 2), ix1 - ix0, iz1 - iz0, CEIL);
  int.quad(N(0, 0, -1), P((ix0 + ix1) / 2, ceil / 2, iz1), ix1 - ix0, ceil, WALL); // 뒷벽(안쪽 면)
  int.quad(N(1, 0, 0), P(ix0, ceil / 2, (iz0 + iz1) / 2), iz1 - iz0, ceil, WALL.map((v) => v * 0.95)); // 서쪽 벽
  int.quad(N(0, 0, -1), P((ix0 + ix1) / 2, 0.16, iz1 - 0.01), ix1 - ix0, 0.3, hex('#c9cdd0')); // 걸레받이
  // LED 선형 조명(앞뒤 방향 줄 4개)
  for (const u of [0.17, 0.39, 0.61, 0.83]) { const x = ix0 + (ix1 - ix0) * u; int.box(x - 0.07, ceil - 0.05, iz0 + 0.5, x + 0.07, ceil, iz1 - 0.5, LED, false, 'Y'); }
  // 뒷벽 냉장 쇼케이스(청록 머리띠 + 유리문 + 음료), x 3.2 ~ 15.2
  const cz0 = iz1 - 0.75, cxa = ix0 + 3.2, cxb = ix1 - 0.4;
  int.box(cxa, 0, cz0, cxb, 2.25, iz1, FR, true, 'Z');
  int.box(cxa, 2.25, cz0 - 0.05, cxb, 2.55, iz1, TEAL, true, 'Z');
  for (let y = 0.35, r = 6; y < 2.1; y += 0.42, r = r === 6 ? 7 : 6) prodFace(prod, N(0, 0, -1), (cxa + cxb) / 2, y + 0.16, cz0 - 0.02, cxb - cxa - 0.1, 0.34, r, cxa * 3 + y);
  for (let x = cxa; x < cxb - 0.1; x += 0.85) int.box(x - 0.03, 0.1, cz0 - 0.06, x + 0.03, 2.2, cz0 - 0.01, hex('#9aa3aa'));
  glass.quad(N(0, 0, -1), P((cxa + cxb) / 2, 1.2, cz0 - 0.07), cxb - cxa, 2.1, [1, 1, 1]);
  // 서쪽 벽 철망 선반(과자)
  int.box(ix0, 0, iz0 + 2.6, ix0 + 0.5, 1.9, iz1 - 0.8, WIRE, true);
  for (let y = 0.3; y < 1.8; y += 0.38) { int.box(ix0 + 0.5, y - 0.03, iz0 + 2.6, ix0 + 0.55, y, iz1 - 0.8, hex('#b9bec2')); prodFace(prod, N(1, 0, 0), ix0 + 0.52, y + 0.15, (iz0 + 2.6 + iz1 - 0.8) / 2, iz1 - 0.8 - iz0 - 2.6, 0.3, Math.floor(y * 7) % 6, y * 5); }
  // 가운데 곤돌라 3줄(앞뒤 방향, 흰 철망 + 양면 상품)
  for (const gu of [5.6, 8.0, 10.4]) {
    const gx = ix0 + gu, ga = iz0 + 2.0, gb = iz1 - 1.35;
    int.box(gx - 0.32, 0, ga, gx + 0.32, 0.12, gb, hex('#cfd3d6'), true);
    int.box(gx - 0.03, 0.12, ga, gx + 0.03, 1.55, gb, WH, true);
    int.box(gx - 0.34, 1.55, ga - 0.02, gx + 0.34, 1.6, gb + 0.02, WIRE, true);
    for (const s of [-1, 1]) for (let y = 0.3, r = 0; y < 1.5; y += 0.36, r++) {
      int.box(Math.min(gx, gx + s * 0.34), y - 0.025, ga, Math.max(gx, gx + s * 0.34), y, gb, hex('#d4d8db'));
      prodFace(prod, N(s, 0, 0), gx + s * 0.3, y + 0.15, (ga + gb) / 2, gb - ga - 0.05, 0.3, (r + (s > 0 ? 3 : 0) + Math.round(gu)) % 6, gu * 11 + y * 3 + s);
    }
    int.box(gx - 0.34, 0.12, ga - 0.02, gx + 0.34, 1.6, ga, hex('#f0f0ee'), true); // 끝판
    for (let y = 0.35; y < 1.5; y += 0.38) prodFace(prod, N(0, 0, -1), gx, y + 0.12, ga - 0.03, 0.6, 0.26, (Math.round(gu) + Math.round(y * 3)) % 6, gu + y);
  }
  // 앞쪽 오른편(모퉁이 유리 안) 유리 뚜껑 냉동고 2대 + 검은 오픈 음료 냉장고
  for (const [a, b] of [[ix1 - 3.9, ix1 - 2.2], [ix1 - 2.0, ix1 - 0.3]]) {
    int.box(a, 0, iz0 + 0.7, b, 0.82, iz0 + 1.5, hex('#e8ecee'), true);
    prodFace(prod, N(0, 1, 0), (a + b) / 2, 0.84, iz0 + 1.1, b - a - 0.12, 0.66, 4, a, N(0, 0, -1));
    glass.quad(N(0, 1, 0), P((a + b) / 2, 0.9, iz0 + 1.1), b - a - 0.05, 0.76, [1, 1, 1], null, N(0, 0, -1));
  }
  { const a = ix1 - 1.1, z0 = iz0 + 3.0, z1 = iz0 + 4.6;
    int.box(a, 0, z0, ix1 - 0.2, 1.95, z1, hex('#1b1d20'), true);
    for (let y = 0.4; y < 1.8; y += 0.38) prodFace(prod, N(-1, 0, 0), a - 0.01, y + 0.14, (z0 + z1) / 2, z1 - z0 - 0.16, 0.3, 6 + (Math.round(y * 3) % 2), y * 9); }
  // 왼쪽 앞: POS 계산대(밝은 나무 상판) + 커피머신 + 온장 진열장
  const px0 = ix0 + 0.6, px1 = ix0 + 3.6, pz0 = iz0 + 0.9, pz1 = iz0 + 1.6;
  int.box(px0, 0, pz0, px1, 0.95, pz1, hex('#f2f2f0'), true);
  int.box(px0 - 0.05, 0.95, pz0 - 0.05, px1 + 0.05, 1.0, pz1 + 0.05, WOOD, true);
  int.box(px0 + 0.4, 1.0, pz0 + 0.15, px0 + 0.75, 1.32, pz0 + 0.45, hex('#2a2d31'), true); // POS 화면
  int.box(px0 + 0.43, 1.05, pz0 + 0.14, px0 + 0.72, 1.29, pz0 + 0.15, hex('#7fb3e6'));
  int.box(px1 - 0.75, 1.0, pz0 + 0.1, px1 - 0.2, 1.55, pz0 + 0.6, hex('#1e2124'), true); // 커피머신
  int.box(px1 - 0.7, 1.35, pz0 + 0.09, px1 - 0.25, 1.48, pz0 + 0.1, hex('#d9a441'));
  int.box(px0 + 1.1, 1.0, pz0 + 0.1, px0 + 1.9, 1.42, pz0 + 0.6, hex('#e8e2d6'), true); // 온장고
  prodFace(prod, N(0, 0, -1), px0 + 1.5, 1.2, pz0 + 0.09, 0.7, 0.3, 1, 3);
  glass.quad(N(0, 0, -1), P(px0 + 1.5, 1.21, pz0 + 0.08), 0.8, 0.42, [1, 1, 1]);
  int.box(ix0 + 0.2, 0, pz1 + 0.3, ix0 + 0.4, 2.6, pz1 + 2.4, hex('#d9dcdf'), true); // 뒤쪽 담배 진열 벽
  for (let y = 1.2; y < 2.5; y += 0.3) prodFace(prod, N(1, 0, 0), ix0 + 0.41, y, pz1 + 1.35, 2.0, 0.24, (Math.round(y * 10) % 6), y * 13);
  // 파란 장바구니 더미(문 옆)
  for (let k = 0; k < 2; k++) { const x = dx + 0.7 + k * 0.5; int.box(x, 0, iz0 + 0.3, x + 0.42, 0.45, iz0 + 0.62, BLUE, true); int.box(x - 0.01, 0.43, iz0 + 0.29, x + 0.43, 0.46, iz0 + 0.63, hex('#174f99')); }

  // ---------- 메시 ----------
  const g = new THREE.Group(); g.name = 'bp24Store';
  const exM = ext.mesh(M.ext, 'bp24Exterior'); exM.castShadow = true; exM.receiveShadow = true; g.add(exM);
  const sgM = sign.mesh(M.sign, 'bp24Sign'); g.add(sgM);
  const glM = glass.mesh(M.glass, 'bp24Glass'); glM.renderOrder = 2; g.add(glM);
  const gwM = glow.mesh(M.glow, 'bp24Glow'); g.add(gwM);
  const spM = spill.mesh(M.spill, 'bp24Spill'); spM.renderOrder = 1; g.add(spM);
  const inner = new THREE.Group(); inner.name = 'bp24Interior';
  inner.add(int.mesh(M.int, 'bp24InteriorBody'));
  inner.add(prod.mesh(M.prod, 'bp24Products'));
  const lod = new THREE.LOD(); lod.name = 'bp24InteriorLod';
  lod.position.set((x0 + x1) / 2, 1.5, (zf + zb) / 2);
  inner.position.set(-lod.position.x, -lod.position.y, -lod.position.z); // 지오메트리는 월드 좌표 그대로
  lod.addLevel(inner, 0); lod.addLevel(new THREE.Object3D(), 170);
  g.add(lod);
  return { group: g, glow: gwM, spill: spM, stats: { tris: [exM, sgM, glM, gwM, spM, ...inner.children].reduce((s, m) => s + m.geometry.index.count / 3, 0) } };
}

// 상품 앞면 한 장: 아틀라스 줄 row 중 임의 구간(가로 길이에 비례)
function prodFace(bag, n, x, y, z, w, h, row, seed, up = null) {
  const r = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1;
  const span = Math.min(1, w / 5.0), u0 = r * (1 - span);
  const v1 = 1 - (row * PROD.row + 1) / PROD.H, v0 = 1 - ((row + 1) * PROD.row - 1) / PROD.H;
  const f = 0.92 + r * 0.08;
  bag.quad(n, new THREE.Vector3(x, y, z), w, h, [f, f, f], [u0, v0, u0 + span, v1], up);
}

// 타일 3_-12 상세가 빌드될 때 그룹을 돌려준다(타일 그룹에 붙어 같이 해제). update(dt): 밤 발광 페이드
export function createBp24() {
  let cur = null, stopNight = null, target = 0;
  const stats = { built: 0 };
  return {
    stats,
    filter: filterBp24Tile,
    build(key) {
      if (key !== BP24.tile) return null;
      if (!stopNight) stopNight = onNightTarget((t) => { target = t; });
      cur = buildStore(); stats.built++; stats.tris = cur.stats.tris;
      apply(nightFade());
      return cur.group;
    },
    update() {
      if (!cur) return;
      let o = cur.group; while (o.parent) o = o.parent;
      if (!o.isScene) { cur = null; return; } // 타일이 풀림
      apply(nightFade());
    },
    get group() { return cur?.group || null; },
  };
  function apply(k) {
    const on = k > 0.001 || target > 0;
    cur.glow.visible = on; cur.spill.visible = on;
    MAT.glow.color.setScalar(0.25 + 0.95 * k);
    MAT.spill.color.setScalar(k);
    MAT.sign.color.setScalar(0.82 + 0.38 * k);
  }
}
