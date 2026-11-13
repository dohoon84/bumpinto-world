// [myeongdong-cathedral] 명동대성당 실내 — 정문으로 걸어 들어가는 고딕 신랑.
//   5칸 신랑 + 측랑(교차 늑골 궁륭) · 익랑(장미창) · 후진(인물 스테인드글라스 5 + 아래 성인 그림 감실) · 제대/감실 탑/십자가 ·
//   종탑 아래 현관 + 성가대석(오르간) + 서쪽 장미창 · 다발 기둥 · 장의자(인스턴싱).
//   빛: 실제 Light·그림자 없음. 실내 재질은 MeshBasic(굽은 음영 정점색) × 시간·날씨 계수.
//     맑은 낮 — 해 방향으로 창마다 그 창 문양 색의 빛 조각이 바닥/맞은편 벽에 떨어지고(가산 사각형, 해를 따라 움직임) 옅은 빛줄기.
//     비·눈 — 빛 조각 약하게, 빛줄기 끔. 밤 — 유리는 어둡고 샹들리에·제대 촛불의 따뜻한 빛 웅덩이.
//   draw ≈ 10 (구조 1 · 바닥 1 · 장의자 2 · 유리 1 · 그림 1 · 빛 조각 1 · 빛줄기 1 · 등 1 · 밤 웅덩이 1). 처음 가까이 올 때 한 번 짓고 계속 쓴다.
import * as THREE from 'three';
import { GeoBuf, hex3 } from './myeongdongGeo.js';
import { lancetPath, GLASS_TINT, roseTint } from './myeongdongGlass.js';

const S_N = 13.8, C_N = 18.2, S_A = 7.4, C_A = 9.9, S_P = 15.4, CAP = 7.0;
const PR = 1.25, PN = Math.sqrt(PR * PR - (PR - 1) * (PR - 1));
/** 뾰족 아치 단면: t=0 꼭대기(1) → t=1 기둥머리(0) */
const gP = (t) => { t = Math.min(1, Math.max(0, t)); return Math.sqrt(Math.max(0, PR * PR - (t + PR - 1) * (t + PR - 1))) / PN; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function floorCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  let s = 77; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const dark = (i + j) % 2; g.fillStyle = dark ? `hsl(22,14%,${44 + r() * 5}%)` : `hsl(36,20%,${72 + r() * 5}%)`; g.fillRect(i * 128, j * 128, 128, 128);
    for (let k = 0; k < 90; k++) { g.strokeStyle = `rgba(${dark ? '255,255,255' : '90,70,60'},${0.04 + r() * 0.05})`; g.lineWidth = 1; g.beginPath(); const x = i * 128 + r() * 128, y = j * 128 + r() * 128; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 40); g.stroke(); }
  }
  g.strokeStyle = 'rgba(40,30,25,.5)'; g.lineWidth = 2; for (let k = 0; k <= 512; k += 128) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 512); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(512, k); g.stroke(); }
  return c;
}
// 그림 아틀라스 1024×512: 성인 감실 그림 4 (128×256) · 오르간 파이프 (256×256) · 십자가의 길 2 (128×128) · 고측 아케이드 띠 (512×64) · 난간 (256×64) · 제대 앞판 (256×128)
const DC = { saint: [0, 0, 128, 256, 4], pipes: [512, 0, 256, 256, 1], station: [768, 0, 128, 128, 2], trif: [0, 256, 512, 64, 1], rail: [0, 320, 256, 64, 1], frontal: [0, 384, 256, 128, 1] };
function decorCanvas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#d8d2c4'; g.fillRect(0, 0, 1024, 512);
  const robes = ['#9a2a2a', '#2a4a9a', '#3a7a4a', '#7a3a8a'];
  for (let k = 0; k < 4; k++) {
    const x = k * 128;
    g.fillStyle = '#4a3a2a'; g.fillRect(x, 0, 128, 256);
    g.fillStyle = '#c9a24a'; lancetPath(g, x + 10, 8, 108, 244); g.fill();
    g.fillStyle = '#e8cc7a'; lancetPath(g, x + 18, 18, 92, 228); g.fill();
    g.fillStyle = '#f2d36a'; g.beginPath(); g.arc(x + 64, 74, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8c8a8'; g.beginPath(); g.arc(x + 64, 76, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = robes[k]; g.beginPath(); g.moveTo(x + 50, 92); g.lineTo(x + 78, 92); g.lineTo(x + 94, 236); g.lineTo(x + 34, 236); g.closePath(); g.fill();
    g.fillStyle = robes[(k + 2) % 4]; g.beginPath(); g.moveTo(x + 52, 96); g.lineTo(x + 36, 232); g.lineTo(x + 54, 232); g.closePath(); g.fill();
    g.fillStyle = '#f0e8d8'; g.fillRect(x + 60, 100, 8, 110);
  }
  { const [x, y] = DC.pipes; g.fillStyle = '#3a2a1e'; g.fillRect(x, y, 256, 256); const n = 15;
    for (let i = 0; i < n; i++) { const pw = 256 / n, h = 120 + Math.abs(i - (n - 1) / 2) * 12; const px = x + i * pw + 2, top = y + 250 - h;
      const gr = g.createLinearGradient(px, 0, px + pw - 4, 0); gr.addColorStop(0, '#8a8e94'); gr.addColorStop(0.45, '#e6e9ee'); gr.addColorStop(1, '#6a6e74'); g.fillStyle = gr; g.fillRect(px, top, pw - 4, h - 18);
      g.fillStyle = '#20232a'; g.beginPath(); g.moveTo(px, top + h - 40); g.lineTo(px + (pw - 4) / 2, top + h - 30); g.lineTo(px + pw - 4, top + h - 40); g.lineTo(px + pw - 4, top + h - 34); g.lineTo(px, top + h - 34); g.fill(); }
    g.fillStyle = '#5a3a24'; g.fillRect(x, y + 236, 256, 20); g.fillRect(x, y, 256, 10); }
  for (let k = 0; k < 2; k++) { const x = DC.station[0] + k * 128; g.fillStyle = '#6a4a2a'; g.fillRect(x, 0, 128, 128); g.fillStyle = '#e8dcc0'; g.fillRect(x + 12, 12, 104, 104); g.fillStyle = '#5a4a3a'; g.fillRect(x + 60, 24, 8, 80); g.fillRect(x + 36, 44, 56, 8); g.fillStyle = k ? '#9a2a2a' : '#2a4a9a'; g.beginPath(); g.arc(x + 40, 90, 12, 0, Math.PI * 2); g.fill(); }
  { const [x, y] = DC.trif; g.fillStyle = '#cfc8b8'; g.fillRect(x, y, 512, 64); g.fillStyle = '#5a524a'; for (let i = 0; i < 16; i++) { lancetPath(g, x + i * 32 + 6, y + 8, 20, 50); g.fill(); } g.fillStyle = '#8a8070'; g.fillRect(x, y + 58, 512, 6); g.fillRect(x, y, 512, 4); }
  { const [x, y] = DC.rail; g.fillStyle = '#4a3020'; g.fillRect(x, y, 256, 64); g.fillStyle = '#7a5434'; for (let i = 0; i < 8; i++) { lancetPath(g, x + i * 32 + 5, y + 10, 22, 46); g.fill(); } g.fillStyle = '#2a1a10'; g.fillRect(x, y, 256, 8); }
  { const [x, y] = DC.frontal; g.fillStyle = '#efe9dc'; g.fillRect(x, y, 256, 128); g.strokeStyle = '#c9a24a'; g.lineWidth = 6; g.strokeRect(x + 8, y + 8, 240, 112); g.fillStyle = '#c9a24a'; g.fillRect(x + 122, y + 24, 12, 80); g.fillRect(x + 100, y + 48, 56, 12);
    for (const dx of [40, 216]) { g.beginPath(); g.arc(x + dx, y + 64, 18, 0, Math.PI * 2); g.stroke(); } }
  return c;
}
function rayCanvas() { const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 8); return c; }
function poolCanvas() { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 1, 32, 32, 32); r.addColorStop(0, 'rgba(255,225,170,1)'); r.addColorStop(0.4, 'rgba(255,190,120,0.45)'); r.addColorStop(1, 'rgba(255,160,80,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c; }
const tex = (c, rep = false) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };

export function createCathedralInterior({ parent, L, glassTex, atlas }) {
  const { W, uC, uT, uBF, uF, hw, nHWx, TWh, NB, DW, DH, ax, az } = L;
  const FLY = L.FL;
  const nI = nHWx - 0.6, IHW = hw - 0.7, ITW = TWh - 0.7;
  const uE = uBF - 0.6, uW = uF - 0.9; // 신랑 끝(정면 벽 안쪽) · 현관 서쪽 벽 안쪽
  const BI = (uE - uT) / NB;
  const uTm = (uC + uT) / 2, tHalf = (uT - uC) / 2;
  const tm = (uE + uW) / 2, tHalfT = (uW - uE) / 2;
  const vAc = (nI + IHW) / 2, aHalf = (IHW - nI) / 2;
  const SANCT = 0.45;
  const g = new THREE.Group(); g.name = 'myeongdong-cathedral-interior'; g.visible = false; parent.add(g);
  const P = (u, v, y) => { const [x, z] = W(u, v); return [x, FLY + y, z]; };

  // ---- 높이 함수 ----
  function ceilAt(u, v) {
    const av = Math.abs(v);
    if (u < uC) return S_P + (C_N - S_P) * gP(Math.hypot(u - uC, v) / nI);
    if (u <= uT) { const ht = S_N + (C_N - S_N) * gP(Math.abs(u - uTm) / tHalf); return av <= nI ? Math.max(S_N + (C_N - S_N) * gP(av / nI), ht) : ht; }
    if (u <= uE) {
      const i = Math.min(NB - 1, Math.floor((u - uT) / BI)), hb = Math.abs(u - (uT + BI * (i + 0.5))) / (BI / 2);
      if (av <= nI) return Math.max(S_N + (C_N - S_N) * gP(av / nI), S_N + (C_N - S_N) * gP(hb));
      return Math.max(S_A + (C_A - S_A) * gP(Math.abs(av - vAc) / aHalf), S_A + (C_A - S_A) * gP(hb));
    }
    return Math.max(S_N + (C_N - S_N) * gP(av / ITW), S_N + (C_N - S_N) * gP(Math.abs(u - tm) / tHalfT));
  }
  function floorAt(u, v) {
    if (Math.abs(v) < nI + 0.05) {
      if (u < uC + 0.3) return SANCT;
      if (u < uC + 1.2) return SANCT - 0.15 * (1 + Math.floor((u - uC - 0.3) / 0.3));
    }
    return 0;
  }

  // ---- 막힘 (축 좌표): 기둥·장의자 묶음·제대·성가대석 기둥 ----
  const rects = [], circles = [];
  const isBlocked = (u, v, r) => {
    if (!built) build();
    for (const b of rects) if (u > b[0] - r && u < b[1] + r && v > b[2] - r && v < b[3] + r) return true;
    for (const c of circles) if (Math.hypot(u - c[0], v - c[1]) < c[2] + r) return true;
    return false;
  };

  let built = false, mats = null, dyn = null;
  const stats = { draws: 0, tris: 0, windows: 0 };
  function build() {
    built = true;
    const st = new GeoBuf({ uv: false, color: true }); // 구조 (굽은 음영)
    const fl = new GeoBuf({ uv: true });
    const gl = new GeoBuf({ uv: true });
    const dc = new GeoBuf({ uv: true });
    const bulbs = new GeoBuf({ uv: false });
    const pools = new GeoBuf({ uv: true, color: true });
    const LW = [0.45, -0.62, 0.64]; // 굽는 가짜 빛 방향 (u, y, v)
    const shadeN = (n) => 0.8 + 0.2 * (n[0] * LW[0] + n[1] * LW[1] + n[2] * LW[2]);
    const PLASTER = hex3('#d9d2c3'), VAULT = hex3('#e2dccd'), RIB = hex3('#4f4c4c'), COL = hex3('#77706a'), SHAFT = hex3('#4a4542'), DADO = hex3('#5a3e2c'), MARBLE = hex3('#efe9de'), GOLD = hex3('#c9a14a'), WOOD = hex3('#5e3e28'), RED = hex3('#8a1f24'), BRICK = hex3('#8a4a36');
    const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
    /** 세계 삼각형 3점(축 좌표 u,v,y) 을 정점색 음영으로 */
    function tri3(a, b, c, col, hShade = true) {
      const A = P(...a), B = P(...b), Cc = P(...c);
      const e1 = [b[0] - a[0], b[2] - a[2], b[1] - a[1]], e2 = [c[0] - a[0], c[2] - a[2], c[1] - a[1]]; // (u, y, v)
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
      const ys = (a[2] + b[2] + c[2]) / 3; const k = Math.abs(shadeN(n)) * (hShade ? 1 - Math.min(0.18, ys * 0.008) : 1);
      st.raw([...A, ...B, ...Cc], [0, 1, 2], [0, 1, 0, 0, 1, 0, 0, 1, 0], null, mul(col, k));
    }
    const quad4 = (a, b, c, d, col) => { tri3(a, b, c, col); tri3(a, c, d, col); };
    /** 축 정렬 상자 (u,v 중심, y0..y1) */
    function boxUV(u, v, y0, y1, su, sv, col, rot = 0) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const p = (du, dv, y) => [u + du * c - dv * s, v + du * s + dv * c, y];
      const hu = su / 2, hv = sv / 2;
      const q = [p(-hu, -hv, y0), p(hu, -hv, y0), p(hu, hv, y0), p(-hu, hv, y0), p(-hu, -hv, y1), p(hu, -hv, y1), p(hu, hv, y1), p(-hu, hv, y1)];
      quad4(q[4], q[5], q[6], q[7], col); quad4(q[0], q[1], q[5], q[4], col); quad4(q[1], q[2], q[6], q[5], col); quad4(q[2], q[3], q[7], q[6], col); quad4(q[3], q[0], q[4], q[7], col); quad4(q[3], q[2], q[1], q[0], col);
    }
    function cylUV(u, v, y0, y1, r0, r1, seg, col) {
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
        quad4([u + Math.cos(a0) * r0, v + Math.sin(a0) * r0, y0], [u + Math.cos(a1) * r0, v + Math.sin(a1) * r0, y0], [u + Math.cos(a1) * r1, v + Math.sin(a1) * r1, y1], [u + Math.cos(a0) * r1, v + Math.sin(a0) * r1, y1], col);
      }
    }
    /** 벽 띠: (u0,v0)→(u1,v1), 아래 bot(t)·위 top(u,v) 를 n 칸으로 */
    function wallStrip(u0, v0, u1, v1, botF, topF, col, n = 12) {
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const a = [u0 + (u1 - u0) * t0, v0 + (v1 - v0) * t0], b = [u0 + (u1 - u0) * t1, v0 + (v1 - v0) * t1];
        const ya = botF(a[0], a[1]), yb = botF(b[0], b[1]), ta = topF(a[0], a[1]), tb = topF(b[0], b[1]);
        if (ta <= ya && tb <= yb) continue;
        // 아래 굽은 음영(벽 아래가 살짝 어둡게) — 두 단으로
        const mA = Math.min(ta, Math.max(ya, 1.1)), mB = Math.min(tb, Math.max(yb, 1.1));
        if (mA > ya || mB > yb) quad4([a[0], a[1], ya], [b[0], b[1], yb], [b[0], b[1], mB], [a[0], a[1], mA], DADO);
        quad4([a[0], a[1], mA], [b[0], b[1], mB], [b[0], b[1], tb], [a[0], a[1], ta], col);
      }
    }
    const top = (pad = 0.35) => (u, v) => ceilAt(u, v) + pad;
    const zero = () => 0;
    /** 유리: 중심 (u,v), 안쪽 법선 (iu,iv), 폭 w, y0..y1, 아틀라스 칸 → 실내 창 + 빛 계산용 창 목록 */
    const wins = [];
    function glassAt(u, v, iu, iv, w, y0, y1, cell, tint, reveal = 0.35) {
      // 안에서 볼 때 왼→오 = (iv, −iu)
      const tu = iv, tv = -iu, off = 0.04;
      const a = [u - tu * w / 2 + iu * off, v - tv * w / 2 + iv * off], b = [u + tu * w / 2 + iu * off, v + tv * w / 2 + iv * off];
      const pa0 = P(a[0], a[1], y0), pb0 = P(b[0], b[1], y0), pb1 = P(b[0], b[1], y1), pa1 = P(a[0], a[1], y1);
      gl.quad(pa0, pb0, pb1, pa1, cell);
      wins.push({ c: [[a[0], a[1], y0], [b[0], b[1], y0], [b[0], b[1], y1], [a[0], a[1], y1]], n: [-iu, -iv], cell, tint, u, v, y: (y0 + y1) / 2, big: Math.min(1, Math.sqrt(6 / Math.max(1e-3, Math.hypot(b[0] - a[0], b[1] - a[1]) * (y1 - y0)))) });
      if (reveal > 0) { // 창 둘레 깊이(돌 틀)
        const r = reveal, A2 = [a[0] + iu * r - tu * 0.12, a[1] + iv * r - tv * 0.12], B2 = [b[0] + iu * r + tu * 0.12, b[1] + iv * r + tv * 0.12];
        quad4([a[0], a[1], y0], [a[0], a[1], y1], [A2[0], A2[1], y1 + 0.1], [A2[0], A2[1], y0 - 0.1], PLASTER);
        quad4([b[0], b[1], y1], [b[0], b[1], y0], [B2[0], B2[1], y0 - 0.1], [B2[0], B2[1], y1 + 0.1], PLASTER);
        quad4([a[0], a[1], y0], [A2[0], A2[1], y0 - 0.1], [B2[0], B2[1], y0 - 0.1], [b[0], b[1], y0], mul(PLASTER, 0.9));
      }
      stats.windows++;
    }
    function decorQ(u, v, iu, iv, w, y0, y1, uvr, off = 0.05) {
      const tu = iv, tv = -iu;
      const a = [u - tu * w / 2 + iu * off, v - tv * w / 2 + iv * off], b = [u + tu * w / 2 + iu * off, v + tv * w / 2 + iv * off];
      dc.quad(P(a[0], a[1], y0), P(b[0], b[1], y0), P(b[0], b[1], y1), P(a[0], a[1], y1), uvr);
    }
    const DW_ = 1024, DH_ = 512;
    const dcell = (name, k = 0) => { const [x, y, w, h] = DC[name]; const x0 = x + k * w; return [x0 / DW_, 1 - (y + h) / DH_, (x0 + w) / DW_, 1 - y / DH_]; };

    // ================= 바닥 =================
    const floorQ = (u0, u1, v0, v1, y = 0) => fl.quad(P(u0, v0, y), P(u1, v0, y), P(u1, v1, y), P(u0, v1, y), [u0 / 3.2, v0 / 3.2, u1 / 3.2, v1 / 3.2]);
    // GeoBuf.quad uv: a(u0,v0) b(u1,v0) … — 바닥 무늬 2 m 칸
    floorQ(uC + 1.2, uE + 0.6, -IHW, IHW);
    floorQ(uC, uC + 1.2, -IHW, -nI); floorQ(uC, uC + 1.2, nI, IHW);
    floorQ(uE, uW + 0.95, -ITW, ITW);
    // 제단(후진) 단: 윗면 + 계단 3
    {
      const n = 10; const cen = [uC, 0];
      for (let k = 0; k < n; k++) {
        const a0 = Math.PI / 2 + (k / n) * Math.PI, a1 = Math.PI / 2 + ((k + 1) / n) * Math.PI;
        const r = nI + 0.05;
        const pA = P(uC + Math.cos(a0) * r, Math.sin(a0) * r, SANCT), pB = P(uC + Math.cos(a1) * r, Math.sin(a1) * r, SANCT), pc = P(cen[0], cen[1], SANCT);
        fl.raw([...pc, ...pA, ...pB], [0, 1, 2], [0, 1, 0, 0, 1, 0, 0, 1, 0], [0, 0, Math.sin(a0) * r / 2, Math.cos(a0) * r / 2, Math.sin(a1) * r / 2, Math.cos(a1) * r / 2]);
      }
      floorQ(uC, uC + 0.3, -nI - 0.05, nI + 0.05, SANCT);
      for (let k = 0; k < 3; k++) {
        const u0 = uC + 0.3 + k * 0.3, y = SANCT - 0.15 * (k + 1);
        floorQ(u0, u0 + 0.3, -nI - 0.05, nI + 0.05, y);
        quad4([u0, -nI, y], [u0, nI, y], [u0, nI, y + 0.15], [u0, -nI, y + 0.15], MARBLE);
      }
      // 붉은 융단 (가운데 통로 → 제단)
      quad4([uC + 1.2, -0.85, 0.012], [uE, -0.85, 0.012], [uE, 0.85, 0.012], [uC + 1.2, 0.85, 0.012], RED);
      quad4([uC - 4.6, -0.85, SANCT + 0.012], [uC + 0.3, -0.85, SANCT + 0.012], [uC + 0.3, 0.85, SANCT + 0.012], [uC - 4.6, 0.85, SANCT + 0.012], RED);
    }

    // ================= 궁륭 (교차 늑골) =================
    /** 격자 궁륭 조각: u0..u1, v0..v1 를 n×n, 대각선이 격자 대각선이 되게 사분면별로 쪼갠다 */
    function vaultPatch(u0, u1, v0, v1, nU, nV) {
      const H = (i, j) => { const u = u0 + (u1 - u0) * i / nU, v = v0 + (v1 - v0) * j / nV; return [u, v, ceilAt(u, v)]; };
      for (let j = 0; j < nV; j++) for (let i = 0; i < nU; i++) {
        const a = H(i, j), b = H(i + 1, j), c = H(i + 1, j + 1), d = H(i, j + 1);
        const diag = (i < nU / 2) === (j < nV / 2);
        if (diag) { tri3(a, c, b, VAULT, false); tri3(a, d, c, VAULT, false); } else { tri3(a, d, b, VAULT, false); tri3(b, d, c, VAULT, false); }
      }
    }
    /** 늑골: 평면 직선 (u0,v0)→(u1,v1) 을 따라 궁륭 아래에 매달린 띠 */
    function rib(u0, v0, u1, v1, w = 0.26, dep = 0.22, n = 14, col = RIB) {
      const L = Math.hypot(u1 - u0, v1 - v0) || 1, pu = -(v1 - v0) / L * w / 2, pv = (u1 - u0) / L * w / 2;
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const A = [u0 + (u1 - u0) * t0, v0 + (v1 - v0) * t0], B = [u0 + (u1 - u0) * t1, v0 + (v1 - v0) * t1];
        const ya = Math.min(ceilAt(A[0] + pu, A[1] + pv), ceilAt(A[0] - pu, A[1] - pv)) - 0.02, yb = Math.min(ceilAt(B[0] + pu, B[1] + pv), ceilAt(B[0] - pu, B[1] - pv)) - 0.02;
        quad4([A[0] - pu, A[1] - pv, ya - dep], [B[0] - pu, B[1] - pv, yb - dep], [B[0] + pu, B[1] + pv, yb - dep], [A[0] + pu, A[1] + pv, ya - dep], col);
        quad4([A[0] - pu, A[1] - pv, ya], [B[0] - pu, B[1] - pv, yb], [B[0] - pu, B[1] - pv, yb - dep], [A[0] - pu, A[1] - pv, ya - dep], col);
        quad4([A[0] + pu, A[1] + pv, ya - dep], [B[0] + pu, B[1] + pv, yb - dep], [B[0] + pu, B[1] + pv, yb], [A[0] + pu, A[1] + pv, ya], col);
      }
    }
    const boss = (u, v) => { const y = ceilAt(u, v); cylUV(u, v, y - 0.45, y - 0.05, 0.38, 0.3, 8, GOLD); };
    // 신랑 칸 + 측랑 칸
    for (let i = 0; i < NB; i++) {
      const a = uT + BI * i, b = a + BI, m = (a + b) / 2;
      vaultPatch(a, b, -nI, nI, 10, 16);
      rib(a, -nI, b, nI); rib(a, nI, b, -nI); rib(a, -nI, a, nI, 0.34, 0.3); boss(m, 0);
      for (const s of [-1, 1]) {
        const v0 = s > 0 ? nI : -IHW, v1 = s > 0 ? IHW : -nI;
        vaultPatch(a, b, v0, v1, 8, 8);
        rib(a, v0, b, v1, 0.22, 0.18, 10); rib(a, v1, b, v0, 0.22, 0.18, 10); rib(a, v0, a, v1, 0.26, 0.22, 10); boss(m, s * vAc);
      }
    }
    rib(uE, -nI, uE, nI, 0.34, 0.3);
    for (const s of [-1, 1]) rib(uE, s * nI, uE, s * IHW, 0.26, 0.22, 10);
    // 교차부 + 익랑 팔 (v 방향 원통)
    vaultPatch(uC, uT, -nI, nI, 12, 16);
    rib(uC, -nI, uT, nI); rib(uC, nI, uT, -nI); rib(uC, -nI, uC, nI, 0.36, 0.32); boss(uTm, 0);
    for (const s of [-1, 1]) {
      const v0 = s > 0 ? nI : -IHW, v1 = s > 0 ? IHW : -nI;
      vaultPatch(uC, uT, v0, v1, 12, 12);
      rib(uC, v0, uT, v1, 0.24, 0.2); rib(uC, v1, uT, v0, 0.24, 0.2); rib(uTm, v0, uTm, v1, 0.22, 0.18); rib(uC, s * nI, uT, s * nI, 0.34, 0.3); boss(uTm, s * vAc);
    }
    // 현관(종탑 아래)
    vaultPatch(uE, uW + 0.05, -ITW, ITW, 10, 12);
    rib(uE, -ITW, uW, ITW, 0.24, 0.2); rib(uE, ITW, uW, -ITW, 0.24, 0.2); boss(tm, 0);
    // 후진 반 돔: 방사 격자 + 늑골 (다각형 꼭짓점 → 가운데)
    const NP = 5;
    {
      const nr = 8, na = 20;
      for (let j = 0; j < nr; j++) for (let k = 0; k < na; k++) {
        const r0 = (j / nr) * nI * 1.02, r1 = ((j + 1) / nr) * nI * 1.02;
        const a0 = Math.PI / 2 + (k / na) * Math.PI, a1 = Math.PI / 2 + ((k + 1) / na) * Math.PI;
        const p = (r, a) => { const u = uC + Math.cos(a) * r, v = Math.sin(a) * r; return [u, v, ceilAt(Math.min(u, uC - 1e-4), v)]; };
        quad4(p(r0, a0), p(r1, a0), p(r1, a1), p(r0, a1), VAULT);
      }
      for (let k = 0; k <= NP; k++) { const a = Math.PI / 2 + (k / NP) * Math.PI; rib(uC + Math.cos(a) * nI, Math.sin(a) * nI, uC - 0.01, 0, 0.26, 0.24, 12); }
      boss(uC - 0.3, 0);
    }
    // 후진·교차부 사이 아치 면 (후진이 더 높다)
    wallStrip(uC, -nI, uC, nI, (u, v) => S_N + (C_N - S_N) * gP(Math.abs(v) / nI) - 0.05, (u, v) => S_P + (C_N - S_P) * gP(Math.abs(v) / nI) + 0.1, PLASTER, 16);

    // ================= 벽 =================
    // 측랑 바깥벽 + 창 + 십자가의 길
    for (const s of [-1, 1]) {
      wallStrip(uT, s * IHW, uE, s * IHW, zero, top(), PLASTER, NB * 6);
      for (let i = 0; i < NB; i++) {
        const m = uT + BI * (i + 0.5);
        glassAt(m, s * IHW, 0, -s, 2.9, 2.1, 8.4, atlas.cell('pair', i * 2 + (s > 0 ? 1 : 0)), GLASS_TINT[(i * 2 + (s > 0 ? 1 : 0)) % 8]);
        decorQ(uT + BI * i + 0.02 + 0.55, s * IHW, 0, -s, 0.55, 3.2, 3.75, dcell('station', i % 2));
      }
      // 익랑 끝벽: 세 갈래 창 + 장미창
      wallStrip(uC, s * IHW, uT, s * IHW, zero, top(), PLASTER, 16);
      glassAt(uTm, s * IHW, 0, -s, 3.3, 2.0, 8.4, atlas.cell('triple'), GLASS_TINT[4]);
      glassAt(uTm, s * IHW, 0, -s, 5.0, 9.2, 14.2, atlas.cell('rose', s > 0 ? 1 : 0), roseTint(s > 0 ? 1 : 0), 0.3);
      // 익랑 동쪽 벽(제대 옆 소성당) + 측랑과 만나는 벽(익랑 쪽 높은 부분)
      wallStrip(uC, s * nI, uC, s * IHW, zero, () => S_N + 0.35, PLASTER, 8);
      wallStrip(uT, s * nI, uT, s * IHW, (u, v) => ceilAt(uT + 0.02, v) - 0.05, () => S_N + 0.35, PLASTER, 8);
      // 정면 쪽: 측랑 정면벽 · 신랑-현관 사이 기둥벽
      wallStrip(uE, s * nI, uE, s * IHW, zero, (u, v) => ceilAt(uE - 0.02, v) + 0.3, PLASTER, 8);
      glassAt(uE, s * vAc, -1, 0, 1.3, 3.4, 7.2, atlas.cell('one', s > 0 ? 1 : 0), GLASS_TINT[s > 0 ? 6 : 3]);
      wallStrip(uE, s * ITW, uE, s * nI, zero, (u, v) => ceilAt(uE - 0.02, v) + 0.3, PLASTER, 4);
      // 현관 옆벽
      wallStrip(uE, s * ITW, uW, s * ITW, zero, top(), PLASTER, 10);
    }
    // 신랑 → 현관 아치 위 벽 (현관 아치: 반폭 ITW, 기둥머리 9.4)
    const tArch = (v) => { const R = ITW * PR, t = Math.abs(v) / ITW; return 9.4 + R * Math.sin(Math.acos(Math.min(1, (t * ITW + R - ITW) / R))) * 1; };
    wallStrip(uE, -ITW, uE, ITW, (u, v) => tArch(v), (u, v) => Math.max(ceilAt(uE - 0.02, v), ceilAt(uE + 0.02, v)) + 0.3, PLASTER, 20);
    // 아치 안쪽 면 (두께 0.6)
    for (let k = 0; k < 20; k++) { const v0 = -ITW + (2 * ITW * k) / 20, v1 = -ITW + (2 * ITW * (k + 1)) / 20; quad4([uE - 0.3, v0, tArch(v0)], [uE + 0.3, v0, tArch(v0)], [uE + 0.3, v1, tArch(v1)], [uE - 0.3, v1, tArch(v1)], mul(PLASTER, 0.82)); }
    // 현관 서쪽 벽: 정문 구멍 + 장미창
    {
      const contour = [[-ITW, 0], [-DW, 0], [-DW, DH], [DW, DH], [DW, 0], [ITW, 0], [ITW, 18.6], [-ITW, 18.6]].map(([v, y]) => new THREE.Vector2(v, y));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const t of tris) tri3([uW, contour[t[0]].x, contour[t[0]].y], [uW, contour[t[1]].x, contour[t[1]].y], [uW, contour[t[2]].x, contour[t[2]].y], PLASTER);
      glassAt(uW, 0, -1, 0, 5.8, 9.3, 15.1, atlas.cell('rose', 0), roseTint(0), 0.3);
      // 문 위 팀파눔 띠
      boxUV(uW - 0.05, 0, DH, DH + 0.35, 0.2, DW * 2 + 0.6, mul(MARBLE, 0.9));
    }
    // ---- 후진 벽: 아래 성인 그림 감실 · 띠 · 긴 인물창 ----
    for (let k = 0; k < NP; k++) {
      const a0 = Math.PI / 2 + (k / NP) * Math.PI, a1 = Math.PI / 2 + ((k + 1) / NP) * Math.PI;
      const A = [uC + Math.cos(a0) * nI, Math.sin(a0) * nI], B = [uC + Math.cos(a1) * nI, Math.sin(a1) * nI];
      wallStrip(A[0], A[1], B[0], B[1], () => SANCT, () => S_P + 0.4, PLASTER, 4);
      const mu = (A[0] + B[0]) / 2, mv = (A[1] + B[1]) / 2, iu = -(mu - uC), iv = -mv, il = Math.hypot(iu, iv);
      glassAt(mu, mv, iu / il, iv / il, 1.55, 8.6, 15.0, atlas.cell('apse', k), [0.65, 0.62, 1], 0.4);
      const fw = Math.hypot(B[0] - A[0], B[1] - A[1]);
      for (let j = -1; j <= 1; j++) {
        const tu2 = (B[0] - A[0]) / fw, tv2 = (B[1] - A[1]) / fw;
        decorQ(mu + tu2 * j * fw * 0.31, mv + tv2 * j * fw * 0.31, iu / il, iv / il, fw * 0.27, SANCT + 1.3, SANCT + 6.0, dcell('saint', (k * 3 + j + 4) % 4));
      }
      // 띠(돌림띠) + 가는 기둥(창 사이)
      boxUV(A[0] + iu / il * 0.12, A[1] + iv / il * 0.12, 7.6, 7.9, 0.3, 0.3, COL); void B;
    }
    for (let k = 0; k <= NP; k++) { const a = Math.PI / 2 + (k / NP) * Math.PI; const u = uC + Math.cos(a) * (nI - 0.15), v = Math.sin(a) * (nI - 0.15); cylUV(u, v, SANCT, S_P, 0.16, 0.16, 6, SHAFT); }
    // 후진 띠 (그림 위·창 아래)
    {
      const n = 20;
      for (let k = 0; k < n; k++) {
        const a0 = Math.PI / 2 + (k / n) * Math.PI, a1 = Math.PI / 2 + ((k + 1) / n) * Math.PI, r = nI - 0.08;
        const p = (a, y, rr = r) => [uC + Math.cos(a) * rr, Math.sin(a) * rr, y];
        quad4(p(a0, 7.6), p(a1, 7.6), p(a1, 7.95), p(a0, 7.95), GOLD);
        quad4(p(a0, 7.6, r - 0.25), p(a1, 7.6, r - 0.25), p(a1, 7.6), p(a0, 7.6), mul(GOLD, 0.7));
      }
    }

    // ================= 아케이드 (신랑 ↔ 측랑) · 기둥 =================
    const archY = (u, a, b) => { const r = (b - a) / 2, m = (a + b) / 2, t = Math.abs(u - m) / r; return CAP + 0.4 + 2.5 * gP(t); };
    for (const s of [-1, 1]) {
      for (let i = 0; i < NB; i++) {
        const a = uT + BI * i, b = a + BI;
        // 아치 위 벽(신랑 쪽) — 기둥머리 위부터 신랑 궁륭까지. 측랑 쪽은 측랑 궁륭이 가린다
        wallStrip(a, s * nI, b, s * nI, (u) => archY(u, a, b), (u, v) => ceilAt(u, s * (nI - 0.02)) + 0.3, PLASTER, 16);
        wallStrip(a, s * (nI + 0.6), b, s * (nI + 0.6), (u) => archY(u, a, b), (u) => ceilAt(u, s * (nI + 0.62)) + 0.2, PLASTER, 16);
        for (let k = 0; k < 16; k++) { const u0 = a + (b - a) * k / 16, u1 = a + (b - a) * (k + 1) / 16; quad4([u0, s * nI, archY(u0, a, b)], [u1, s * nI, archY(u1, a, b)], [u1, s * (nI + 0.6), archY(u1, a, b)], [u0, s * (nI + 0.6), archY(u0, a, b)], mul(PLASTER, 0.8)); }
        // 아치 테 (붉은 벽돌 아치 — 명동성당 실내 아치 띠)
        for (let k = 0; k < 16; k++) { const u0 = a + (b - a) * k / 16, u1 = a + (b - a) * (k + 1) / 16; quad4([u0, s * (nI - 0.03), archY(u0, a, b)], [u1, s * (nI - 0.03), archY(u1, a, b)], [u1, s * (nI - 0.03), archY(u1, a, b) + 0.45], [u0, s * (nI - 0.03), archY(u0, a, b) + 0.45], BRICK); }
        // 트리포리움 띠 + 고측창
        decorQ((a + b) / 2, s * nI, 0, -s, BI - 0.9, 10.7, 12.2, dcell('trif'), 0.04);
        glassAt((a + b) / 2, s * nI, 0, -s, 2.5, 13.5, 16.9, atlas.cell('cler', i), GLASS_TINT[i % 2 ? 5 : 1], 0.3);
      }
      // 다발 기둥 (칸 경계) + 벽 기둥(궁륭까지)
      for (let i = 0; i <= NB; i++) {
        const u = uT + BI * i, v = s * (nI + 0.3), big = i === 0;
        const R = big ? 0.62 : 0.48;
        boxUV(u, v, 0, 0.45, R * 2.6, R * 2.6, mul(COL, 0.85));
        cylUV(u, v, 0.45, CAP, R, R, 8, COL);
        for (const [du, dv] of [[R, 0], [-R, 0], [0, R], [0, -R]]) cylUV(u + du * 0.95, v + dv * 0.95, 0.45, CAP, 0.15, 0.15, 6, SHAFT);
        boxUV(u, v, CAP, CAP + 0.4, R * 2.8, R * 2.8, mul(MARBLE, 0.85));
        circles.push([u, v, R + 0.25]);
        cylUV(u, s * (nI - 0.1), CAP + 0.4, S_N, 0.15, 0.15, 6, SHAFT);
        boxUV(u, s * (nI - 0.1), S_N - 0.25, S_N, 0.45, 0.45, mul(MARBLE, 0.85));
      }
      // 교차부 동쪽 기둥 (제대 쪽) + 익랑 벽 기둥
      { const u = uC, v = s * (nI + 0.3), R = 0.62; boxUV(u, v, 0, 0.45, R * 2.6, R * 2.6, mul(COL, 0.85)); cylUV(u, v, 0.45, CAP + 2.5, R, R, 8, COL); for (const [du, dv] of [[R, 0], [-R, 0], [0, R], [0, -R]]) cylUV(u + du * 0.95, v + dv * 0.95, 0.45, CAP + 2.5, 0.15, 0.15, 6, SHAFT); boxUV(u, v, CAP + 2.5, CAP + 2.9, R * 2.8, R * 2.8, mul(MARBLE, 0.85)); cylUV(u, v, CAP + 2.9, S_N, 0.2, 0.2, 6, SHAFT); circles.push([u, v, R + 0.25]); }
      for (const u of [uC + 0.2, uT - 0.2]) cylUV(u, s * (IHW - 0.12), 0, S_N, 0.17, 0.17, 6, SHAFT);
      cylUV(uTm, s * (IHW - 0.12), 0, S_N, 0.17, 0.17, 6, SHAFT);
      for (let i = 0; i <= NB; i++) cylUV(uT + BI * i, s * (IHW - 0.12), 0, S_A, 0.15, 0.15, 6, SHAFT);
    }

    // ================= 제단 =================
    {
      const y0 = SANCT;
      // 제대 (흰 대리석 + 앞판 그림)
      boxUV(uC - 2.4, 0, y0, y0 + 0.95, 1.05, 2.7, MARBLE); boxUV(uC - 2.4, 0, y0 + 0.95, y0 + 1.05, 1.2, 2.9, mul(MARBLE, 0.95));
      decorQ(uC - 2.4 + 0.53, 0, 1, 0, 2.5, y0 + 0.08, y0 + 0.9, dcell('frontal'), 0.01);
      rects.push([uC - 3.0, uC - 1.8, -1.5, 1.5]);
      // 촛대 6
      for (const dv of [-1.15, -0.7, -0.25, 0.25, 0.7, 1.15]) { boxUV(uC - 2.6, dv, y0 + 1.05, y0 + 1.5 + Math.abs(dv) * -0.1 + 0.2, 0.06, 0.06, GOLD); const [x, z] = W(uC - 2.6, dv); bulbs.box(x, FLY + y0 + 1.66 - Math.abs(dv) * 0.1, z, 0.05, 0.1, 0.05); }
      // 감실 탑 (뒤쪽 가운데, 흰 고딕 닫집 + 성모상)
      const tu0 = uC - nI + 1.1;
      boxUV(tu0, 0, y0, y0 + 2.4, 1.5, 1.5, MARBLE);
      boxUV(tu0 + 0.2, 0, y0 + 2.4, y0 + 5.2, 1.1, 1.1, mul(MARBLE, 0.97));
      cylUV(tu0 + 0.55, 0, y0 + 2.5, y0 + 4.0, 0.22, 0.13, 8, hex3('#f4f1ea')); cylUV(tu0 + 0.55, 0, y0 + 4.0, y0 + 4.3, 0.12, 0.1, 6, hex3('#f0dcc4'));
      cylUV(tu0 + 0.55, 0, y0 + 4.32, y0 + 4.36, 0.18, 0.18, 8, GOLD);
      for (const [du, dv] of [[0.55, 0.55], [0.55, -0.55], [-0.55, 0.55], [-0.55, -0.55]]) { boxUV(tu0 + 0.2 + du * 0.9, dv * 0.9, y0 + 2.4, y0 + 5.6, 0.18, 0.18, MARBLE); cylUV(tu0 + 0.2 + du * 0.9, dv * 0.9, y0 + 5.6, y0 + 6.6, 0.12, 0.0, 4, MARBLE); }
      cylUV(tu0 + 0.2, 0, y0 + 5.2, y0 + 8.6, 0.75, 0.02, 4, MARBLE);
      rects.push([tu0 - 0.8, tu0 + 0.9, -0.8, 0.8]);
      // 매달린 십자가 (제대 위) + 사슬
      const cu = uC - 1.4;
      boxUV(cu, 0, 6.2, 8.8, 0.16, 0.16, hex3('#3a2618')); boxUV(cu, 0, 7.9, 8.08, 0.16, 1.5, hex3('#3a2618'));
      boxUV(cu + 0.1, 0, 6.9, 7.95, 0.12, 0.2, hex3('#e8dcc8')); boxUV(cu + 0.1, 0, 7.75, 7.9, 0.1, 1.1, hex3('#e8dcc8'));
      for (const dv of [-0.6, 0.6]) boxUV(cu, dv, 8.0, ceilAt(cu, dv) - 0.1, 0.03, 0.03, RIB);
      // 독서대 · 주례석 · 성체등(붉은)
      boxUV(uC - 0.3, -4.3, y0, y0 + 1.15, 0.6, 0.7, WOOD); boxUV(uC - 0.3, -4.3, y0 + 1.15, y0 + 1.25, 0.8, 0.9, mul(WOOD, 0.9)); rects.push([uC - 0.7, uC + 0.1, -4.8, -3.8]);
      boxUV(uC - 4.4, 3.2, y0, y0 + 1.6, 0.7, 0.8, WOOD); rects.push([uC - 4.8, uC - 4.0, 2.7, 3.7]);
      { const [x, z] = W(uC - 1.0, 3.6); bulbs.box(x, FLY + 5.0, z, 0.22, 0.3, 0.22); }
      boxUV(uC - 1.0, 3.6, 5.2, ceilAt(uC - 1.0, 3.6), 0.03, 0.03, RIB);
      // 영성체 난간 (제단 끝)
      for (const s of [-1, 1]) { boxUV(uC + 0.15, s * (nI - 1.6) / 2 + s * 1.1, SANCT, SANCT + 0.85, 0.18, nI - 2.0, mul(MARBLE, 0.95)); rects.push([uC, uC + 0.3, s > 0 ? 1.2 : -nI, s > 0 ? nI : -1.2]); }
      // 익랑 동쪽 벽 소성당: 성모상(왼) · 요셉상(오른) + 작은 제대 + 촛불대
      for (const s of [-1, 1]) {
        const v = s * vAc, u = uC + 0.6;
        boxUV(u, v, 0, 1.0, 0.9, 2.2, MARBLE); boxUV(u - 0.1, v, 1.0, 2.4, 0.7, 0.7, mul(MARBLE, 0.9));
        cylUV(u, v, 2.4, 4.0, 0.3, 0.16, 8, s > 0 ? hex3('#f2efe8') : hex3('#e8e2d4')); cylUV(u, v, 4.0, 4.35, 0.14, 0.11, 6, hex3('#f0dcc4'));
        if (s < 0) cylUV(u, v, 2.4, 3.6, 0.31, 0.3, 8, hex3('#4a6ab0'));
        rects.push([uC, u + 0.6, v - 1.2, v + 1.2]);
        for (let k = 0; k < 7; k++) { const [x, z] = W(u + 1.05, v - 0.9 + k * 0.3); bulbs.box(x, FLY + 0.95, z, 0.07, 0.12, 0.07); }
        boxUV(u + 1.05, v, 0, 0.88, 0.4, 2.3, mul(GOLD, 0.6)); rects.push([u + 0.8, u + 1.3, v - 1.2, v + 1.2]);
      }
    }

    // ================= 성가대석 (현관 위) · 오르간 · 성수대 =================
    {
      const l0 = uW - 4.2, ly = 5.6;
      boxUV((l0 + uW) / 2, 0, ly, ly + 0.4, uW - l0, ITW * 2, mul(MARBLE, 0.8));
      decorQ(l0, -ITW / 2, -1, 0, ITW, ly + 0.4, ly + 1.4, dcell('rail'), 0.06); decorQ(l0, ITW / 2, -1, 0, ITW, ly + 0.4, ly + 1.4, dcell('rail'), 0.06);
      boxUV(l0 - 0.05, 0, ly + 1.35, ly + 1.5, 0.2, ITW * 2, WOOD);
      for (const s of [-1, 1]) {
        cylUV(l0 + 0.3, s * 2.8, 0, ly, 0.3, 0.3, 8, COL); circles.push([l0 + 0.3, s * 2.8, 0.55]);
        decorQ(uW - 0.7, s * 3.9, -1, 0, 2.2, ly + 0.4, ly + 5.6, dcell('pipes'), 0.0);
        boxUV(uW - 0.45, s * 3.9, ly + 0.4, ly + 5.8, 0.5, 2.4, WOOD);
      }
      // 성수대 (문 양옆)
      for (const s of [-1, 1]) { const u = uW - 1.6, v = s * 2.6; cylUV(u, v, 0, 0.9, 0.12, 0.12, 6, MARBLE); cylUV(u, v, 0.9, 1.05, 0.2, 0.36, 10, MARBLE); circles.push([u, v, 0.4]); }
    }

    // ================= 장의자 (인스턴싱 2종) =================
    const pewGeo = (len) => {
      const b = new GeoBuf({ uv: false, color: true });
      const c1 = hex3('#6a4630'), c2 = hex3('#563824'), c3 = hex3('#7a5238');
      const B = (x, y, z, sx, sy, sz, c, rx = 0) => { const geo = new THREE.BoxGeometry(sx, sy, sz); if (rx) geo.rotateX(rx); geo.translate(x, y, z); const ng = geo.toNonIndexed(); const p = Array.from(ng.attributes.position.array), n = Array.from(ng.attributes.normal.array); b.raw(p, p.map((_, k) => k).slice(0, p.length / 3), n, null, (k) => { const s = shadeN([n[k * 3 + 2], n[k * 3 + 1], n[k * 3]]); return mul(c, Math.abs(s)); }); geo.dispose(); ng.dispose(); };
      B(0, 0.44, 0, len, 0.06, 0.44, c3);
      B(0, 0.72, 0.24, len, 0.5, 0.05, c1, -0.12);
      B(0, 0.98, 0.27, len, 0.05, 0.1, c2);
      B(0, 0.14, -0.42, len, 0.07, 0.16, c2);
      for (const sx of [-1, 1]) B(sx * (len / 2 - 0.03), 0.48, 0.05, 0.06, 0.96, 0.62, c2);
      return b.build();
    };
    const rows = []; for (let u = uT + 1.4; u <= uE - 3.2; u += 1.0) rows.push(u);
    const pewA = new THREE.InstancedMesh(pewGeo(4.2), null, rows.length * 2);
    const pewB = new THREE.InstancedMesh(pewGeo(2.75), null, rows.length * 4);
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(ax, az)), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    let ia = 0, ib = 0;
    for (const u of rows) for (const s of [-1, 1]) {
      { const [x, z] = W(u, s * 3.3); pewA.setMatrixAt(ia++, m4.compose(pv.set(x, FLY, z), qq, one)); }
      for (const vc of [8.75, 11.95]) { const [x, z] = W(u, s * vc); pewB.setMatrixAt(ib++, m4.compose(pv.set(x, FLY, z), qq, one)); }
    }
    if (rows.length) for (const s of [-1, 1]) {
      rects.push([rows[0] - 0.55, rows[rows.length - 1] + 0.4, s > 0 ? 1.15 : -5.45, s > 0 ? 5.45 : -1.15]);
      rects.push([rows[0] - 0.55, rows[rows.length - 1] + 0.4, s > 0 ? 7.3 : -13.4, s > 0 ? 13.4 : -7.3]);
    }

    // ================= 샹들리에 (신랑 칸 가운데 + 교차부) =================
    const chand = [];
    for (let i = 0; i < NB; i++) chand.push([uT + BI * (i + 0.5), 0]);
    chand.push([uTm, 0]);
    for (const s of [-1, 1]) for (let i = 0; i < NB; i++) chand.push([uT + BI * (i + 0.5), s * vAc, true]);
    for (const [u, v, small] of chand) {
      const y = small ? 5.2 : 8.6, top2 = ceilAt(u, v) - 0.4;
      boxUV(u, v, y + 0.3, top2, 0.03, 0.03, RIB);
      const R = small ? 0.35 : 0.85, n = small ? 4 : 8;
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2; boxUV(u + Math.cos(a) * R, v + Math.sin(a) * R, y, y + 0.05, 0.06, R * Math.abs(a1 - a) + 0.05, GOLD, a); const [x, z] = W(u + Math.cos(a) * R, v + Math.sin(a) * R); bulbs.box(x, FLY + y + 0.14, z, 0.09, 0.16, 0.09); }
      cylUV(u, v, y - 0.25, y + 0.3, 0.06, 0.2, 6, GOLD);
      // 밤 바닥 웅덩이
      const pr = small ? 2.6 : 4.2, [x0, z0] = W(u, v), ux = ax * pr, uz = az * pr, vx = -az * pr, vz = ax * pr, yy = FLY + floorAt(u, v) + 0.03;
      pools.quad([x0 - ux - vx, yy, z0 - uz - vz], [x0 + ux - vx, yy, z0 + uz - vz], [x0 + ux + vx, yy, z0 + uz + vz], [x0 - ux + vx, yy, z0 - uz + vz], [0, 0, 1, 1], small ? [0.6, 0.5, 0.36] : [0.85, 0.7, 0.5]);
    }
    { const pr = 3.2, u = uC - 2.3, [x0, z0] = W(u, 0), ux = ax * pr, uz = az * pr, vx = -az * pr, vz = ax * pr, yy = FLY + SANCT + 0.03; pools.quad([x0 - ux - vx, yy, z0 - uz - vz], [x0 + ux - vx, yy, z0 + uz - vz], [x0 + ux + vx, yy, z0 + uz + vz], [x0 - ux + vx, yy, z0 - uz + vz], [0, 0, 1, 1], [1, 0.82, 0.55]); }

    // ---- 재질 ----
    const glassTint = new THREE.Color(1, 1, 1);
    mats = {
      st: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      fl: new THREE.MeshBasicMaterial({ map: tex(floorCanvas(), true), side: THREE.DoubleSide }), // 바닥 감김 방향이 축(u,v) 손잡이에 따라 뒤집혀 컬링되던 것(하얗게 뚫려 보임)
      pew: new THREE.MeshBasicMaterial({ vertexColors: true }),
      gl: new THREE.MeshBasicMaterial({ map: glassTex, alphaTest: 0.5, toneMapped: false, color: glassTint, side: THREE.DoubleSide }),
      dc: new THREE.MeshBasicMaterial({ map: tex(decorCanvas()), side: THREE.DoubleSide }),
      bulb: new THREE.MeshBasicMaterial({ color: '#8a8070', toneMapped: false }),
      pool: new THREE.MeshBasicMaterial({ map: tex(poolCanvas()), vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      patch: new THREE.MeshBasicMaterial({ map: tex(atlas.blur), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      ray: new THREE.MeshBasicMaterial({ map: tex(rayCanvas()), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }),
    };
    pewA.material = mats.pew; pewB.material = mats.pew;
    const add = (geo, mat, nm, ro = 0) => { if (!geo) return null; const m = new THREE.Mesh(geo, mat); m.name = 'cathedral-interior-' + nm; m.renderOrder = ro; m.frustumCulled = true; g.add(m); return m; };
    add(st.build(), mats.st, 'structure');
    add(fl.build(), mats.fl, 'floor');
    pewA.name = 'cathedral-interior-pews'; pewB.name = 'cathedral-interior-pews2'; pewA.instanceMatrix.needsUpdate = true; pewB.instanceMatrix.needsUpdate = true; pewA.computeBoundingSphere(); pewB.computeBoundingSphere(); g.add(pewA, pewB);
    add(gl.build(), mats.gl, 'glass');
    add(dc.build(), mats.dc, 'decor');
    add(bulbs.build(), mats.bulb, 'bulbs');
    const poolMesh = add(pools.build(), mats.pool, 'night-pools', 2);

    // ---- 빛 조각 · 빛줄기 (정점 고정 수, 해 방향 바뀔 때만 다시 계산) ----
    wins.forEach((w) => { if (!w.tint) w.tint = [1, 0.9, 0.75]; });
    const NWIN = wins.length;
    const pPos = new Float32Array(NWIN * 4 * 3), pCol = new Float32Array(NWIN * 4 * 3), pUv = new Float32Array(NWIN * 4 * 2), pIdx = [];
    const rPos = new Float32Array(NWIN * 16 * 3), rCol = new Float32Array(NWIN * 16 * 3), rUv = new Float32Array(NWIN * 16 * 2), rIdx = [];
    wins.forEach((w, i) => {
      const [u0, v0, u1, v1] = w.cell; const uv = [u0, v0, u1, v0, u1, v1, u0, v1]; for (let k = 0; k < 8; k++) pUv[i * 8 + k] = uv[k];
      const b = i * 4; pIdx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      for (let f = 0; f < 4; f++) { const rb = i * 16 + f * 4; rIdx.push(rb, rb + 1, rb + 2, rb, rb + 2, rb + 3); const ru = [0, 0, 1, 0, 1, 1, 0, 1]; for (let k = 0; k < 8; k++) rUv[(rb) * 2 + k] = ru[k]; }
    });
    const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3)); pGeo.setAttribute('uv', new THREE.BufferAttribute(pUv, 2)); pGeo.setIndex(pIdx);
    const rGeo = new THREE.BufferGeometry(); rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3)); rGeo.setAttribute('color', new THREE.BufferAttribute(rCol, 3)); rGeo.setAttribute('uv', new THREE.BufferAttribute(rUv, 2)); rGeo.setIndex(rIdx);
    const patchMesh = add(pGeo, mats.patch, 'sun-patches', 3), rayMesh = add(rGeo, mats.ray, 'god-rays', 4);
    patchMesh.frustumCulled = false; rayMesh.frustumCulled = false;
    dyn = { wins, pGeo, rGeo, pPos, pCol, rPos, rCol, patchMesh, rayMesh, poolMesh, lastKey: '' };
    g.traverse((o) => { if (o.isMesh) { stats.draws++; const gg = o.geometry; stats.tris += (gg.index ? gg.index.count : gg.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
    stats.tris = Math.round(stats.tris);
    console.info(`[myeongdong] cathedral interior: draws=${stats.draws} tris=${stats.tris} windows=${NWIN} pews=${ia + ib}`);
  }

  // ---- 빛 계산 ----
  const sL = [0, 1, 0]; let projKind = 'y';
  function projectWin(w, s, out) {
    // s = 해 방향(축 좌표 u, v, y). 빛은 −s 로 들어온다. 받는 면: 바닥(제단 높이 포함) 또는 맞은편 벽
    const [cu, cv, cy] = [(w.c[0][0] + w.c[2][0]) / 2, (w.c[0][1] + w.c[2][1]) / 2, w.y];
    let best = null;
    const tryPlane = (kind, val, ok) => {
      let t;
      if (kind === 'y') t = (cy - val) / s[2]; else if (kind === 'v') t = (cv - val) / s[1]; else t = (cu - val) / s[0];
      if (!(t > 0.3) || !isFinite(t)) return;
      const hu = cu - s[0] * t, hv = cv - s[1] * t, hy = cy - s[2] * t;
      if (ok && !ok(hu, hv, hy)) return;
      if (!best || t < best.t) best = { kind, val, t };
    };
    const inside = (u, v) => (u > uC - nI && u < uW + 0.2 && Math.abs(v) < IHW + 0.2);
    if (s[2] > 0.02) { tryPlane('y', 0.03, (u, v) => inside(u, v) && floorAt(u, v) < 0.1); tryPlane('y', SANCT + 0.03, (u, v) => floorAt(u, v) > 0.4 && Math.hypot(Math.min(0, u - uC), v) < nI); }
    if (Math.abs(s[1]) > 0.02) for (const vv of [IHW - 0.03, -(IHW - 0.03)]) tryPlane('v', vv, (u, v, y) => y > 0 && y < ceilAt(u, Math.sign(vv) * (IHW - 0.1)) && u > uC && u < uE);
    if (Math.abs(s[1]) > 0.02) for (const vv of [nI - 0.03, -(nI - 0.03)]) tryPlane('v', vv, (u, v, y) => y > CAP + 2.9 && y < ceilAt(u, vv * 0.99) && u > uT && u < uE && Math.sign(vv) !== Math.sign(cv));
    if (Math.abs(s[0]) > 0.02) tryPlane('u', uC + 0.05, (u, v, y) => y > 0 && y < S_N && Math.abs(v) > nI && Math.abs(v) < IHW);
    if (Math.abs(s[0]) > 0.02) tryPlane('u', uE - 0.05, (u, v, y) => y > 0 && Math.abs(v) > ITW && y < ceilAt(uE - 0.1, v));
    if (!best) return false;
    projKind = best.kind;
    for (let k = 0; k < 4; k++) {
      const [pu, pv, py] = w.c[k];
      let t; if (best.kind === 'y') t = (py - best.val) / s[2]; else if (best.kind === 'v') t = (pv - best.val) / s[1]; else t = (pu - best.val) / s[0];
      out[k] = P(pu - s[0] * t, pv - s[1] * t, py - s[2] * t);
    }
    return true;
  }
  const corners = [[], [], [], []];
  function updateLight(sky, night) {
    if (!dyn) return;
    const sd = sky?.sunDir, stt = sky?.state || {};
    const sx = sd ? sd.x : -0.45, sy = sd ? sd.y : 0.8, sz = sd ? sd.z : 0.35;
    sL[0] = sx * ax + sz * az; sL[1] = -sx * az + sz * ax; sL[2] = sy;
    const kind = stt.kind || 'clear';
    const cloud = stt.cloud > 1 ? stt.cloud / 100 : (stt.cloud || 0);
    const wet = kind === 'rain' || kind === 'snow' || kind === 'storm';
    const clearK = wet ? 0.12 : kind === 'fog' ? 0.3 : Math.max(0.25, 1 - cloud * 0.75);
    const dayK = smooth(-0.04, 0.28, sy);
    const nightK = Math.max(night || 0, 1 - smooth(-0.08, 0.12, sy));
    // 재질 밝기
    const amb = new THREE.Color(0.46, 0.37, 0.27).lerp(new THREE.Color(1, 0.97, 0.93).multiplyScalar(0.5 + 0.2 * (wet ? 0.3 : clearK)), dayK);
    mats.st.color.copy(amb); mats.fl.color.copy(amb); mats.pew.color.copy(amb); mats.dc.color.copy(amb);
    const gk = 0.18 + dayK * (wet ? 0.62 : 0.6 + 0.45 * clearK);
    mats.gl.color.setRGB(gk * (dayK > 0.2 ? 1 : 0.8), gk * (dayK > 0.2 ? 1 : 0.85), gk);
    mats.bulb.color.setRGB(0.55 + nightK * 0.45, 0.5 + nightK * 0.36, 0.42 + nightK * 0.12);
    mats.pool.opacity = nightK * 0.75; dyn.poolMesh.visible = nightK > 0.02;
    // 빛 조각 (해 쪽 창만)
    const sun = dayK * (wet ? 0.12 : clearK);
    const key = `${sL[0].toFixed(3)},${sL[1].toFixed(3)},${sL[2].toFixed(3)},${sun.toFixed(2)}`;
    if (key === dyn.lastKey) return; dyn.lastKey = key;
    const rayK = wet ? 0 : sun * 0.024;
    dyn.patchMesh.visible = sun > 0.01; dyn.rayMesh.visible = rayK > 0.003;
    const { wins, pPos, pCol, rPos, rCol } = dyn;
    dyn.best = null; let bestK = 0;
    wins.forEach((w, i) => {
      const cos = sL[0] * w.n[0] + sL[1] * w.n[1];
      const lit = sun > 0.01 && sL[2] > 0.02 && cos > 0.04 && projectWin(w, sL, corners);
      const k = lit ? sun * smooth(0.04, 0.4, cos) * (projKind === 'y' ? 0.62 : 0.42) * w.big : 0; // 큰 창(삼연창·장미창)은 조각이 커서 겹치면 하얗게 뜬다 → 면적으로 눌러 준다
      if (lit && projKind === 'y') { // 열린 바닥(장의자 밖)에 떨어진 조각을 먼저
        const bx = (corners[0][0] + corners[2][0]) / 2, bz = (corners[0][2] + corners[2][2]) / 2, [bu, bv] = L.toUV(bx, bz);
        const score = k * (isBlocked(bu, bv, 0.6) ? 0.3 : 1); if (score > bestK) { bestK = score; dyn.best = [bx, bz]; }
      }
      for (let c = 0; c < 4; c++) {
        const src = P(...w.c[c]), dst = lit ? corners[c] : src;
        for (let a = 0; a < 3; a++) { pPos[(i * 4 + c) * 3 + a] = dst[a]; pCol[(i * 4 + c) * 3 + a] = k; }
      }
      // 빛줄기: 창 네 변 → 조각 네 변 (사다리꼴 4 면), 창 쪽 밝고 바닥 쪽 옅게
      for (let f = 0; f < 4; f++) {
        const c0 = f, c1 = (f + 1) % 4, base = (i * 16 + f * 4) * 3;
        const A = P(...w.c[c0]), B = P(...w.c[c1]), A2 = lit ? corners[c0] : A, B2 = lit ? corners[c1] : B;
        const quadP = [A, B, B2, A2];
        for (let q = 0; q < 4; q++) for (let a = 0; a < 3; a++) {
          rPos[base + q * 3 + a] = quadP[q][a];
          rCol[base + q * 3 + a] = lit ? w.tint[a] * rayK * (q < 2 ? 1 : 0.15) * smooth(0.04, 0.4, cos) : 0;
        }
      }
    });
    dyn.pGeo.attributes.position.needsUpdate = true; dyn.pGeo.attributes.color.needsUpdate = true;
    dyn.rGeo.attributes.position.needsUpdate = true; dyn.rGeo.attributes.color.needsUpdate = true;
  }

  let acc = 1;
  return {
    group: g,
    stats,
    ceilAt,
    floorAt,
    isBlocked,
    get built() { return built; },
    /** 가장 밝은 바닥 빛 조각 중심 [x, z] (샷 스크립트용) */
    brightPatch: () => dyn?.best || null,
    setVisible(v) {
      if (v && !built) build();
      g.visible = !!v;
    },
    update(dt, sky, night) {
      if (!g.visible) return;
      acc += dt || 0;
      if (acc < 0.25) return; acc = 0;
      updateLight(sky, night);
    },
  };
}
