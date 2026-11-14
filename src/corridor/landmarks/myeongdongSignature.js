// [myeongdong-signature] 명동 대표 건물: 롯데백화점 본점(+에비뉴엘·영플라자) · 신세계백화점 본점(본관·옛 제일은행·신관 + 밤 미디어 파사드)
//   · 한국은행 화폐박물관(+한국은행 본관) · 남대문시장 입구 게이트와 시장 골목.
//   자리는 OSM 외곽선(myeongdong.json buildings 의 way id) 그대로. 모양은 사진(위키미디어 공용) 보고 로우폴리로 줄였다.
//   재질: 아틀라스 캔버스 한 장(낮 색 + 밤 빛 emissiveMap) → 건물마다 병합 메시 1개(draw 1). 미디어 파사드만 따로(밤에만, draw 1).
//   실제 Light 없음. 충돌은 외곽선(myeongdong.js bldGrid). 이름표는 한국어 + 영어.
import * as THREE from 'three';
import { createShinsegaeShow } from './shinsegaeShow.js'; // [ssg-facade]
import { GeoBuf, hex3, pointInRing, cathedralFrame, hash01, CellGrid, distToSeg } from './myeongdongGeo.js';
import { MD_FONT } from './myeongdongAtlas.js';
import { markTextRects } from './textQuad.js';

/** 모델이 대신 그리는 OSM 건물 way id (일반 건물 병합에서 뺀다. 충돌은 그대로) */
export const SIGNATURE_IDS = new Set([
  233592424, 233592423, 577594782, // 롯데백화점 본점 · 에비뉴엘 · 롯데영플라자
  301284818, 301284814, 781964195, // 신세계 본관(옛 미쓰코시) · 더 헤리티지(옛 제일은행) · 신관
  348489095, 348490554, // 한국은행 화폐박물관(옛 조선은행 1912) · 한국은행 본관
  781662004, 781662005, // 본관 정면에 붙은 작은 OSM 조각(입구 캐노피) — 모델 입구가 대신한다
]);

// ---------------------------------------------------------------- 아틀라스 (1024², 256 칸)
const AW = 1024, AH = 1280; // [md-lotte] 아래 256 줄은 롯데 1층 쇼윈도·붉은 세로 현수막
const R = {
  dept: [0, 0, 256, 256], office: [256, 0, 256, 256], glass: [512, 0, 256, 256], bronze: [768, 0, 256, 256],
  stoneWin: [0, 256, 256, 256], arch: [256, 256, 256, 256], stone: [512, 256, 256, 256], copper: [768, 256, 256, 256],
  sLotte: [0, 512, 512, 128], sAvenuel: [512, 512, 512, 64], sYoung: [512, 576, 512, 64],
  sShinsegae: [0, 640, 512, 64], sHeritage: [512, 640, 512, 64], sBok: [0, 704, 512, 64], sMuseum: [512, 704, 512, 64],
  sMarket: [0, 768, 1024, 160],
  shop: [0, 1024, 256, 256], banner: [256, 1024, 128, 256], bannerL: [384, 1024, 128, 256],
  awn0: [0, 928, 256, 96], awn1: [256, 928, 256, 96], awn2: [512, 928, 256, 96], awn3: [768, 928, 256, 96],
};
/** 아틀라스 칸 하나가 덮는 실제 크기 [가로 m, 세로 m] (창 크기가 실물처럼 보이게) */
const TILE = { dept: [28, 17.5], office: [13, 21], glass: [8, 21], bronze: [15, 20], stoneWin: [12, 12.5], arch: [9, 7], stone: [10, 10], copper: [8, 8] };
const T = (k) => TILE[k];
const uvOf = (r, inset = 1.5) => [(r[0] + inset) / AW, 1 - (r[1] + r[3] - inset) / AH, (r[0] + r[2] - inset) / AW, 1 - (r[1] + inset) / AH];

function rnd(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function drawAtlas() {
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  const e = document.createElement('canvas'); e.width = AW; e.height = AH;
  const g = c.getContext('2d'), h = e.getContext('2d');
  g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, AW, AH);
  h.fillStyle = '#000'; h.fillRect(0, 0, AW, AH);
  const r = rnd(77);
  // 창 격자 칸: (bg, frame, glass, 밤 불빛 확률)
  const grid = (rc, { bg, glass, cols, rows, mx, my, lit = 0.6, warm = '#ffd9a0', band = null }) => {
    const [x0, y0, w, hh] = rc;
    g.fillStyle = bg; g.fillRect(x0, y0, w, hh);
    if (band) { g.fillStyle = band; g.fillRect(x0, y0 + hh - 18, w, 18); }
    const cw = w / cols, ch = hh / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = x0 + i * cw + mx, y = y0 + j * ch + my, ww = cw - mx * 2, wh = ch - my * 2;
      g.fillStyle = glass; g.fillRect(x, y, ww, wh);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, y, ww, wh * 0.35);
      if (r() < lit) { h.fillStyle = warm; h.globalAlpha = 0.55 + r() * 0.45; h.fillRect(x, y, ww, wh); h.globalAlpha = 1; }
    }
  };
  // 롯데 백화점: 베이지 판 + 가로 띠 창(층마다 어두운 띠)
  { const [x0, y0, w, hh] = R.dept; g.fillStyle = '#d8cdb8'; g.fillRect(x0, y0, w, hh);
    for (let j = 0; j < 4; j++) { const y = y0 + j * 64 + 26; g.fillStyle = '#4a5866'; g.fillRect(x0, y, w, 22); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(x0, y, w, 6);
      for (let i = 0; i < 8; i++) { g.fillStyle = '#c7bba5'; g.fillRect(x0 + i * 32, y, 3, 22); }
      h.fillStyle = '#ffe4b0'; h.globalAlpha = 0.85; h.fillRect(x0, y, w, 22); h.globalAlpha = 1; } }
  grid(R.office, { bg: '#c9c2b4', glass: '#5d6f80', cols: 6, rows: 6, mx: 8, my: 10, lit: 0.55 });
  grid(R.glass, { bg: '#7fa3bf', glass: '#3f6f96', cols: 4, rows: 6, mx: 2, my: 3, lit: 0.45, warm: '#dff1ff' });
  grid(R.bronze, { bg: '#5a4632', glass: '#2c2620', cols: 5, rows: 5, mx: 5, my: 6, lit: 0.5, warm: '#ffcf7a', band: '#b8925a' });
  grid(R.stoneWin, { bg: '#e2ddd2', glass: '#5c6670', cols: 3, rows: 3, mx: 18, my: 20, lit: 0.7 });
  // 화강석 + 아치창
  { const [x0, y0, w, hh] = R.arch; g.fillStyle = '#cfc8bb'; g.fillRect(x0, y0, w, hh);
    g.strokeStyle = 'rgba(80,70,60,.25)'; g.lineWidth = 2; for (let y = y0 + 32; y < y0 + hh; y += 32) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke(); }
    for (let i = 0; i < 2; i++) { const x = x0 + 40 + i * 128, y = y0 + 60, ww = 48, wh = 150;
      g.fillStyle = '#b9b1a3'; g.fillRect(x - 8, y - 8, ww + 16, wh + 16);
      g.fillStyle = '#3e4650'; g.beginPath(); g.moveTo(x, y + wh); g.lineTo(x, y + 24); g.arc(x + ww / 2, y + 24, ww / 2, Math.PI, 0); g.lineTo(x + ww, y + wh); g.closePath(); g.fill();
      h.fillStyle = '#ffd59a'; h.globalAlpha = 0.8; h.beginPath(); h.moveTo(x, y + wh); h.lineTo(x, y + 24); h.arc(x + ww / 2, y + 24, ww / 2, Math.PI, 0); h.lineTo(x + ww, y + wh); h.closePath(); h.fill(); h.globalAlpha = 1; } }
  { const [x0, y0, w, hh] = R.stone; g.fillStyle = '#e6e1d6'; g.fillRect(x0, y0, w, hh); g.fillStyle = 'rgba(0,0,0,.06)'; for (let y = y0; y < y0 + hh; y += 24) g.fillRect(x0, y, w, 2); }
  { const [x0, y0, w, hh] = R.copper; g.fillStyle = '#56645e'; g.fillRect(x0, y0, w, hh); g.strokeStyle = 'rgba(20,30,28,.5)'; g.lineWidth = 3; for (let x = x0 + 16; x < x0 + w; x += 32) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + hh); g.stroke(); } }
  // 간판 (실제 이름을 평범한 글씨로 — 로고 아님)
  const sign = (rc, bg, fg, main, sub, { glow = '#fff', border = null, mainPx = 0.62, subCol = null } = {}) => {
    const [x0, y0, w, hh] = rc;
    g.fillStyle = bg; g.fillRect(x0, y0, w, hh);
    if (border) { g.strokeStyle = border; g.lineWidth = Math.max(4, hh * 0.08); g.strokeRect(x0 + 3, y0 + 3, w - 6, hh - 6); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.floor(hh * (sub ? mainPx : 0.7));
    g.font = `900 ${fs}px ${MD_FONT}`;
    const ty = sub ? y0 + hh * 0.4 : y0 + hh / 2;
    let txt = main; while (g.measureText(txt).width > w * 0.92 && g.font) { g.font = `900 ${Math.floor(fs * (w * 0.92) / g.measureText(main).width)}px ${MD_FONT}`; break; }
    g.fillText(txt, x0 + w / 2, ty);
    if (sub) { g.fillStyle = subCol || fg; g.font = `700 ${Math.floor(hh * 0.26)}px ${MD_FONT}`; g.fillText(sub, x0 + w / 2, y0 + hh * 0.82); }
    // 밤: 글자만 빛나게
    h.fillStyle = glow; h.textAlign = 'center'; h.textBaseline = 'middle'; h.font = g.font;
    h.font = `900 ${fs}px ${MD_FONT}`; let fw = h.measureText(main).width; if (fw > w * 0.92) h.font = `900 ${Math.floor(fs * (w * 0.92) / fw)}px ${MD_FONT}`;
    h.fillText(main, x0 + w / 2, ty);
    if (sub) { h.font = `700 ${Math.floor(hh * 0.26)}px ${MD_FONT}`; h.fillText(sub, x0 + w / 2, y0 + hh * 0.82); }
  };
  sign(R.sLotte, '#ffffff', '#d7141a', 'LOTTE', 'DEPARTMENT STORE · 롯데백화점', { glow: '#ff3b3b', mainPx: 0.6 });
  sign(R.sAvenuel, '#1d1712', '#d9b878', 'AVENUEL', '에비뉴엘', { glow: '#ffd68a' });
  sign(R.sYoung, '#ffffff', '#d7141a', 'YOUNG PLAZA', '롯데영플라자', { glow: '#ff5a5a' });
  sign(R.sShinsegae, '#cdc9c1', '#a8832a', 'SHINSEGAE', '신세계백화점 본점', { glow: '#ffd27a' });
  sign(R.sHeritage, '#cfc8bb', '#6b5a3a', 'THE HERITAGE', '1935 · 옛 제일은행', { glow: '#ffd9a0' });
  sign(R.sBok, '#2b3540', '#ffffff', '한국은행', 'BANK OF KOREA', { glow: '#e8f2ff' });
  sign(R.sMuseum, '#d6cfc2', '#3a3328', '화폐박물관', 'BANK OF KOREA MONEY MUSEUM', { glow: '#ffe2b0' });
  // 남대문시장 게이트 간판: 파란 테두리 · 흰 판 · 검은 한글 · 위 파란 띠 영어
  { const [x0, y0, w, hh] = R.sMarket; g.fillStyle = '#26338a'; g.fillRect(x0, y0, w, hh);
    g.fillStyle = '#ffffff'; g.fillRect(x0 + 14, y0 + 44, w - 28, hh - 58);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `800 30px ${MD_FONT}`; g.fillText('NAM DAE MUN MARKET', x0 + 40, y0 + 23);
    g.textAlign = 'right'; g.fillText('南大門市場', x0 + w - 40, y0 + 23);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.font = `900 92px ${MD_FONT}`; g.fillText('남  대  문  시  장', x0 + w / 2, y0 + 101);
    h.fillStyle = '#9fb4ff'; h.fillRect(x0, y0, w, 44); h.fillStyle = '#fff6e0'; h.globalAlpha = 0.85; h.fillRect(x0 + 14, y0 + 44, w - 28, hh - 58); h.globalAlpha = 1;
    h.fillStyle = '#000'; h.textAlign = 'center'; h.textBaseline = 'middle'; h.font = `900 92px ${MD_FONT}`; h.fillText('남  대  문  시  장', x0 + w / 2, y0 + 101);
    h.fillStyle = '#fff'; h.font = `800 30px ${MD_FONT}`; h.textAlign = 'left'; h.fillText('NAM DAE MUN MARKET', x0 + 40, y0 + 23); h.textAlign = 'right'; h.fillText('南大門市場', x0 + w - 40, y0 + 23); }
  // 노점 차양 줄무늬
  [['#e63946', '#ffffff'], ['#1d4ed8', '#ffffff'], ['#f59e0b', '#ffffff'], ['#16a34a', '#fef3c7']].forEach(([a, b], k) => {
    const [x0, y0, w, hh] = R['awn' + k]; for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(x0 + i * 32, y0, 32, hh); }
    h.fillStyle = a; h.globalAlpha = 0.25; h.fillRect(x0, y0, w, hh); h.globalAlpha = 1;
  });
  // [md-lotte] 1층 쇼윈도: 짙은 유리 + 은빛 문설주, 밤엔 따뜻하게 환한 진열창 (256² = 가로 14 m × 세로 8.5 m)
  { const [x0, y0, w, hh] = R.shop; g.fillStyle = '#34312e'; g.fillRect(x0, y0, w, hh);
    h.fillStyle = '#000'; h.fillRect(x0, y0, w, hh);
    for (let i = 0; i < 4; i++) { const x = x0 + 6 + i * 62, y = y0 + 40, ww = 56, wh = hh - 52;
      const gr = g.createLinearGradient(0, y, 0, y + wh); gr.addColorStop(0, '#3d4a58'); gr.addColorStop(1, '#8a97a3'); g.fillStyle = gr; g.fillRect(x, y, ww, wh);
      g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(x + 8, y); g.lineTo(x + 30, y); g.lineTo(x + 6, y + wh); g.lineTo(x - 8, y + wh); g.fill();
      // 마네킹 실루엣 + 진열 선반
      g.fillStyle = 'rgba(20,20,24,.7)'; g.fillRect(x + 22, y + wh * 0.28, 12, wh * 0.5); g.beginPath(); g.arc(x + 28, y + wh * 0.22, 6, 0, 7); g.fill();
      h.fillStyle = i % 2 ? '#ffe2a8' : '#fff0cc'; h.globalAlpha = 0.9; h.fillRect(x, y, ww, wh); h.globalAlpha = 1; }
    g.fillStyle = '#c9ccd0'; g.fillRect(x0, y0 + 36, w, 5); g.fillStyle = '#1c1b1a'; g.fillRect(x0, y0, w, 36);
    h.fillStyle = '#ffd9a0'; h.globalAlpha = 0.45; h.fillRect(x0 + 8, y0 + 14, w - 16, 8); h.globalAlpha = 1; }
  // [md-lotte] 붉은 세로 현수막 (LOTTE 를 세로로): banner = 흰 글자 / bannerL = 금색 글자
  for (const [k, fg] of [['banner', '#ffffff'], ['bannerL', '#ffe9a8']]) {
    const [x0, y0, w, hh] = R[k]; g.fillStyle = '#c8101a'; g.fillRect(x0, y0, w, hh); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x0, y0, 6, hh); g.fillRect(x0 + w - 6, y0, 6, hh);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${Math.floor(w * 0.66)}px ${MD_FONT}`;
    'LOTTE'.split('').forEach((ch, i) => g.fillText(ch, x0 + w / 2, y0 + 30 + i * ((hh - 40) / 5) + 20));
    h.fillStyle = '#ff5050'; h.fillRect(x0, y0, w, hh); h.globalAlpha = 0.6; h.fillStyle = '#fff'; h.textAlign = 'center'; h.textBaseline = 'middle'; h.font = g.font;
    'LOTTE'.split('').forEach((ch, i) => h.fillText(ch, x0 + w / 2, y0 + 30 + i * ((hh - 40) / 5) + 20)); h.globalAlpha = 1; }
  return { c, e };
}

let shared = null;
function sharedMats() {
  if (shared) return shared;
  const { c, e } = drawAtlas();
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const emap = new THREE.CanvasTexture(e); emap.colorSpace = THREE.SRGBColorSpace;
  markTextRects(map, Object.keys(R).filter((k) => /^s[A-Z]/.test(k)).map((k) => uvOf(R[k], 0))); // [text-orientation] 간판 칸
  const body = new THREE.MeshLambertMaterial({ map, emissiveMap: emap, emissive: 0xffffff, emissiveIntensity: 0.05, vertexColors: true });
  body.name = 'md-signature';
  shared = { map, emap, body };
  return shared;
}

// ---------------------------------------------------------------- 기하 도우미
function ringArea(o) { let a = 0; for (let i = 0; i < o.length; i++) { const p = o[i], q = o[(i + 1) % o.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function centroid(o) { let x = 0, z = 0; for (const p of o) { x += p[0]; z += p[1]; } return [x / o.length, z / o.length]; }
/** 바깥을 보게 벽 하나 (P→Q, 바닥 y0 ~ 위 y1), 칸(tw × th)마다 아틀라스 칸 uv 반복 */
function wall(buf, P, Q, y0, y1, uv, tw, th, col, out = 0) {
  const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]); if (L < 0.3 || y1 - y0 < 0.1) return;
  let nx = -(Q[1] - P[1]) / L, nz = (Q[0] - P[0]) / L;
  const n = Math.max(1, Math.round(L / tw)), m = Math.max(1, Math.round((y1 - y0) / th));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const t0 = i / n, t1 = (i + 1) / n, ya = y0 + (y1 - y0) * j / m, yb = y0 + (y1 - y0) * (j + 1) / m;
    const ax = P[0] + (Q[0] - P[0]) * t0 + nx * out, az = P[1] + (Q[1] - P[1]) * t0 + nz * out;
    const bx = P[0] + (Q[0] - P[0]) * t1 + nx * out, bz = P[1] + (Q[1] - P[1]) * t1 + nz * out;
    buf.quad([ax, ya, az], [bx, ya, bz], [bx, yb, bz], [ax, yb, az], uv, col);
  }
}
/** 외곽선 기둥: 벽(바깥 방향 자동) + 지붕 */
function prism(buf, o, y0, y1, uv, tw, th, col, roofUv = null, roofCol = null) {
  const ccw = ringArea(o) > 0; // x-z 평면에서 (+x, +z) 기준
  for (let i = 0; i < o.length; i++) {
    const p = o[i], q = o[(i + 1) % o.length];
    // wall() 의 법선 = (-(dz), dx)/L. ccw(+area) 링이면 바깥은 (dz, -dx) → 순서를 뒤집는다
    if (ccw) wall(buf, q, p, y0, y1, uv, tw, th, col); else wall(buf, p, q, y0, y1, uv, tw, th, col);
  }
  if (roofUv) cap(buf, o, y1, roofUv, roofCol || col);
}
function cap(buf, o, y, uv, col) {
  const shape = o.map(([x, z]) => new THREE.Vector2(x, z));
  let tris; try { tris = THREE.ShapeUtils.triangulateShape(shape, []); } catch { return; }
  const pos = [], nrm = [], uvs = [], idx = [];
  const u0 = uv[0], v0 = uv[1], du = uv[2] - uv[0], dv = uv[3] - uv[1];
  for (const [x, z] of o) { pos.push(x, y, z); nrm.push(0, 1, 0); uvs.push(u0 + du * (0.5 + 0.5 * Math.sin(x * 0.07)), v0 + dv * (0.5 + 0.5 * Math.sin(z * 0.07))); }
  for (const t of tris) {
    // 위를 보게 (x-z 에서 시계 방향이어야 +y)
    const [a, b, c] = t; const A = o[a], B = o[b], C = o[c];
    const cr = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    if (cr < 0) idx.push(a, b, c); else idx.push(a, c, b);
  }
  buf.raw(pos, idx, nrm, uvs, col);
}
/** 축 정렬 아닌 직사각형 링 (frame.W 로) */
function rectRing(F, u0, u1, v0, v1) { return [F.W(u0, v0), F.W(u1, v0), F.W(u1, v1), F.W(u0, v1)]; }
/** 간판 판: 벽 P→Q 바깥 out m 에 가운데 폭 w, 높이 y0~y1 */
function signOn(buf, P, Q, out, w, y0, y1, uv, outward) {
  const [nx, nz] = outward; const mx = (P[0] + Q[0]) / 2 + nx * out, mz = (P[1] + Q[1]) / 2 + nz * out;
  const rx = nz, rz = -nx; // 바깥에서 벽을 보는 사람의 오른쪽 = (−n) × up
  const a = [mx - rx * w / 2, y0, mz - rz * w / 2], b = [mx + rx * w / 2, y0, mz + rz * w / 2];
  buf.quad(a, b, [b[0], y1, b[2]], [a[0], y1, a[2]], uv, [1, 1, 1], [nx, 0, nz]);
}
function edgesOut(o) {
  const ccw = ringArea(o) > 0; const out = [];
  for (let i = 0; i < o.length; i++) {
    const p = o[i], q = o[(i + 1) % o.length]; const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 0.5) continue;
    let nx = (q[1] - p[1]) / L, nz = -(q[0] - p[0]) / L; if (!ccw) { nx = -nx; nz = -nz; }
    out.push({ p, q, L, nx, nz });
  }
  return out;
}

// ---------------------------------------------------------------- 롯데
function buildLotte(ctx) {
  const { byId, baseOf, buf, labels } = ctx;
  const store = byId.get(233592424), ave = byId.get(233592423), yp = byId.get(577594782);
  const W = [1, 1, 1];
  const toward = [-11098, -22058]; // 을지로입구 사거리 (롯데 본점 북동쪽 모서리 앞)
  if (store) {
    const o = store.o, y0 = baseOf(o), podTop = y0 + 54;
    prism(buf, o, y0 - 0.4, podTop, uvOf(R.dept), ...T('dept'), W, uvOf(R.stone), hex3('#9a958c'));
    // [md-lotte] 1층 쇼윈도 띠 + 캐노피 (본점 앞을 걸을 때 백화점 입구로 보이게)
    const ccwL = ringArea(o) > 0; // wall() 은 P→Q 의 왼쪽이 바깥 — ccw 링이면 뒤집어 부른다 (prism 과 같음)
    for (const e of edgesOut(o)) if (e.L > 9) {
      const [A, B] = ccwL ? [e.q, e.p] : [e.p, e.q];
      wall(buf, A, B, y0 - 0.2, y0 + 8.6, uvOf(R.shop), 14, 8.8, W, 0.14);
      wall(buf, A, B, y0 + 8.6, y0 + 9.1, uvOf(R.copper), 12, 0.5, hex3('#2a2928'), 1.1);
    }
    // 꼭대기 띠(어두운 처마)
    for (const e of edgesOut(o)) wall(buf, e.p, e.q, podTop - 0.1, podTop + 2.2, uvOf(R.copper), 12, 2.3, hex3('#6c6a66'), 0.25);
    // 사거리 쪽 큰 간판 (긴 벽 중 사거리를 보는 면)
    const [cx, cz] = centroid(o); const dx = toward[0] - cx, dz = toward[1] - cz, dl = Math.hypot(dx, dz);
    for (const e of edgesOut(o)) {
      if (e.L < 28) continue; const k = (e.nx * dx + e.nz * dz) / dl; if (k < 0.35) continue;
      const w = Math.min(e.L * 0.7, 56), hgt = w / 4;
      signOn(buf, e.p, e.q, 0.45, w, podTop - 2.5 - hgt, podTop - 2.5, uvOf(R.sLotte), [e.nx, e.nz]);
      signOn(buf, e.p, e.q, 1.3, 18, y0 + 9.6, y0 + 13.6, uvOf(R.sLotte), [e.nx, e.nz]); // 입구 위 작은 LOTTE
      // 붉은 세로 현수막 (간판 아래 벽, 길이 따라 일정 간격)
      const nb = Math.max(2, Math.floor(e.L / 14)); const tx = (e.q[0] - e.p[0]) / e.L, tz = (e.q[1] - e.p[1]) / e.L; const bh = Math.min(26, podTop - y0 - 24);
      if (bh > 8) for (let i = 0; i < nb; i++) { const t = (i + 0.5) / nb; const P = [e.p[0] + tx * e.L * t - tx * 0.01, e.p[1] + tz * e.L * t - tz * 0.01], Q = [P[0] + tx * 0.02, P[1] + tz * 0.02]; signOn(buf, P, Q, 0.55, 3.4, y0 + 12.5, y0 + 12.5 + bh, uvOf(i % 2 ? R.bannerL : R.banner), [e.nx, e.nz]); }
    }
    // 신관 타워(롯데호텔 신관, 147 m): 사거리에서 먼 쪽 절반 위로
    const F = cathedralFrame(o);
    const du = F.uMax - F.uMin; const far = Math.hypot(...((p) => [p[0] - toward[0], p[1] - toward[1]])(F.W(F.uMin + du * 0.25, 0))) > Math.hypot(...((p) => [p[0] - toward[0], p[1] - toward[1]])(F.W(F.uMax - du * 0.25, 0)));
    const [ua, ub] = far ? [F.uMin + 6, F.uMin + du * 0.5] : [F.uMax - du * 0.5, F.uMax - 6];
    const tw = rectRing(F, ua, ub, F.vMin + 7, F.vMax - 7);
    const tTop = y0 + 147;
    prism(buf, tw, podTop, tTop - 4, uvOf(R.office), ...T('office'), hex3('#8b8780')); // [polish] 사진의 롯데호텔 신관처럼 어두운 회갈색
    prism(buf, tw.map(([x, z]) => [x + (centroid(tw)[0] - x) * 0.06, z + (centroid(tw)[1] - z) * 0.06]), tTop - 4, tTop, uvOf(R.copper), 10, 4, hex3('#8d8a84'), uvOf(R.stone), hex3('#8d8a84'));
    // 타워 꼭대기 이름(LOTTE · 사거리 쪽 면)
    for (const e of edgesOut(tw)) { const k = (e.nx * dx + e.nz * dz) / dl; if (k < 0.2) continue; signOn(buf, e.p, e.q, 0.4, e.L * 0.6, tTop - 5 - e.L * 0.15, tTop - 5, uvOf(R.sLotte), [e.nx, e.nz]); }
    labels.push({ text: '🏬 롯데백화점 본점 Lotte Department Store', x: cx, z: cz, y: tTop + 8, maxDist: 3200, minDist: 40, cls: 'label landmark' });
  }
  if (ave) {
    const o = ave.o, y0 = baseOf(o), top = y0 + 86; const [cx, cz] = centroid(o);
    prism(buf, o, y0 - 0.4, top, uvOf(R.bronze), ...T('bronze'), W, uvOf(R.copper), hex3('#3b332b'));
    for (const e of edgesOut(o)) if (e.L > 22) signOn(buf, e.p, e.q, 0.35, Math.min(e.L * 0.6, 26), top - 6, top - 6 + Math.min(e.L * 0.6, 26) / 8, uvOf(R.sAvenuel), [e.nx, e.nz]);
    labels.push({ text: '에비뉴엘 Avenuel (Lotte Luxury)', x: cx, z: cz, y: top + 5, maxDist: 700, minDist: 25, cls: 'label' });
  }
  if (yp) {
    const o = yp.o, y0 = baseOf(o), top = y0 + 23; const [cx, cz] = centroid(o);
    prism(buf, o, y0 - 0.4, top, uvOf(R.stoneWin), ...T('stoneWin'), hex3('#f2efe9'), uvOf(R.stone), hex3('#b5b0a6'));
    for (const e of edgesOut(o)) if (e.L > 24) signOn(buf, e.p, e.q, 0.35, Math.min(e.L * 0.55, 24), top - 4.6, top - 4.6 + Math.min(e.L * 0.55, 24) / 8, uvOf(R.sYoung), [e.nx, e.nz]);
    labels.push({ text: '롯데영플라자 Lotte Young Plaza', x: cx, z: cz, y: top + 4, maxDist: 400, minDist: 15, cls: 'label' });
  }
}


// ---------------------------------------------------------------- 신세계
/** [ssg-facade] ?ssgshow=0 이면 크리스마스 미디어 파사드 끄기 */
const SSG_SHOW = typeof location === 'undefined' || new URLSearchParams(location.search).get('ssgshow') !== '0';
const ROUNDABOUT = [-11262, -21566]; // 한국은행 앞 분수 로터리 (본관 정면이 보는 곳)
function facing(o, pt) { // 외곽선 변 중 pt 를 가장 잘 보는 변
  const [cx, cz] = centroid(o); const dx = pt[0] - cx, dz = pt[1] - cz, dl = Math.hypot(dx, dz) || 1;
  let best = null, bk = -2; for (const e of edgesOut(o)) { const k = (e.nx * dx + e.nz * dz) / dl + Math.min(e.L, 40) / 400; if (k > bk) { bk = k; best = e; } }
  return best;
}
function columns(buf, e, n, y0, y1, out, sz, col, span = 0.8) {
  const tx = (e.q[0] - e.p[0]) / e.L, tz = (e.q[1] - e.p[1]) / e.L; const mx = (e.p[0] + e.q[0]) / 2, mz = (e.p[1] + e.q[1]) / 2;
  const W = e.L * span; const ry = Math.atan2(tx, tz);
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : -W / 2 + W * i / (n - 1); buf.box(mx + tx * t + e.nx * out, (y0 + y1) / 2, mz + tz * t + e.nz * out, sz, y1 - y0, sz, ry, uvOf(R.stone), col); }
}
function buildShinsegae(ctx) {
  const { byId, baseOf, buf, labels, media } = ctx;
  const main = byId.get(301284818), her = byId.get(301284814), tower = byId.get(781964195);
  const W = [1, 1, 1], gold = hex3('#d9a93a');
  if (tower) { // 신관(2005, 19층) — 유리
    const o = tower.o, y0 = baseOf(o), top = y0 + 88;
    prism(buf, o, y0 - 0.4, top, uvOf(R.glass), ...T('glass'), hex3('#d5e2ee'), uvOf(R.stone), hex3('#7c8590'));
    const e = facing(o, ROUNDABOUT); if (e) signOn(buf, e.p, e.q, 0.4, Math.min(e.L * 0.5, 34), top - 7.5, top - 7.5 + Math.min(e.L * 0.5, 34) / 8, uvOf(R.sShinsegae), [e.nx, e.nz]);
  }
  if (her) { // 더 헤리티지 = 옛 제일은행 본점(1935) — 화강석 + 큰 기둥
    const o = her.o, y0 = baseOf(o), top = y0 + 21; const [cx, cz] = centroid(o);
    prism(buf, o, y0 - 0.4, top, uvOf(R.arch), ...T('arch'), hex3('#e3ddd0'), uvOf(R.stone), hex3('#a9a296'));
    for (const e of edgesOut(o)) wall(buf, e.p, e.q, top - 0.2, top + 1.6, uvOf(R.stone), 10, 1.8, hex3('#d6cfc1'), 0.5);
    const e = facing(o, ROUNDABOUT);
    if (e) { columns(buf, e, 6, y0, y0 + 14, 1.2, 1.5, hex3('#ece6da'), 0.7); signOn(buf, e.p, e.q, 1.3, Math.min(e.L * 0.55, 24), y0 + 15, y0 + 15 + Math.min(e.L * 0.55, 24) / 8, uvOf(R.sHeritage), [e.nx, e.nz]); }
    labels.push({ text: '신세계 더 헤리티지 The Heritage (옛 제일은행 1935)', x: cx, z: cz, y: top + 5, maxDist: 350, minDist: 12, cls: 'label' });
  }
  if (main) { // 본관(1930 옛 미쓰코시) — 크림색 돌, 5층, 가운데 발코니·시계·금빛 입구
    const o = main.o, y0 = baseOf(o), top = y0 + 24; const [cx, cz] = centroid(o);
    prism(buf, o, y0 - 0.4, top, uvOf(R.stoneWin), ...T('stoneWin'), hex3('#d3cfc7'), uvOf(R.stone), hex3('#7f9a68')); // [polish] 사진처럼 회색 화강석 · 옥상 정원(초록)
    for (const e of edgesOut(o)) { wall(buf, e.p, e.q, top - 0.3, top + 1.4, uvOf(R.stone), 10, 1.7, hex3('#bdb9b1'), 0.6); wall(buf, e.p, e.q, y0 + 4.6, y0 + 5.1, uvOf(R.stone), 10, 0.5, hex3('#bdb9b1'), 0.35); wall(buf, e.p, e.q, y0 - 0.4, y0 + 4.6, uvOf(R.stone), 10, 5, hex3('#9f9b94'), 0.25); }
    // 꼭대기 한 층 물러난 층(펜트하우스)
    const inner = o.map(([x, z]) => [x + (cx - x) * 0.12, z + (cz - z) * 0.12]);
    prism(buf, inner, top + 1.4, top + 4.2, uvOf(R.stoneWin), ...T('stoneWin'), hex3('#c9c5bd'), uvOf(R.stone), hex3('#6f9a5a'));
    // 옥상 정원: 초록 잔디 판 + 나무 몇 그루(사진의 트리니티 가든)
    { const gr = o.map(([x, z]) => [x + (cx - x) * 0.05, z + (cz - z) * 0.05]); cap(buf, gr, top + 1.45, uvOf(R.stone), hex3('#79a35e'));
      const rr = rnd(301); for (let k = 0; k < 9; k++) { const a = rr() * Math.PI * 2, d = 0.55 + rr() * 0.3; const p = gr[Math.floor(rr() * gr.length)]; const x = cx + (p[0] - cx) * d, z = cz + (p[1] - cz) * d; buf.box(x, top + 2.4, z, 0.25, 1.9, 0.25, a, uvOf(R.stone), hex3('#5a4632')); buf.box(x, top + 3.8, z, 2.2, 1.8, 2.2, a, uvOf(R.stone), hex3('#4f7f3e')); } }
    const e = facing(o, ROUNDABOUT);
    if (e) {
      const tx = (e.q[0] - e.p[0]) / e.L, tz = (e.q[1] - e.p[1]) / e.L, mx = (e.p[0] + e.q[0]) / 2, mz = (e.p[1] + e.q[1]) / 2, ry = Math.atan2(tx, tz);
      // 가운데 돌출 발코니(3층) + 난간 — [ssg-facade] 미디어 파사드가 정면을 감싸면 뺀다
      if (!SSG_SHOW) buf.box(mx + e.nx * 1.2, y0 + 13.2, mz + e.nz * 1.2, 2.4, 0.5, 18, ry, uvOf(R.stone), hex3('#e8e2d6'));
      
      // 시계(동그란 판 대신 팔각 상자) + 금빛 입구 아치 + SHINSEGAE 글씨
      if (!SSG_SHOW) buf.box(mx + e.nx * 0.5, y0 + 10.2, mz + e.nz * 0.5, 0.3, 2.4, 2.4, ry, uvOf(R.stone), hex3('#5a4a2a')); if (!SSG_SHOW) buf.box(mx + e.nx * 0.7, y0 + 10.2, mz + e.nz * 0.7, 0.1, 1.9, 1.9, ry, uvOf(R.stone), hex3('#fbf7ea'));
      // 금빛 아치 정문(2층 높이, 사진의 금색 소용돌이 틀): 기둥 2 + 반원 아치 조각 9 + 어두운 문
      buf.box(mx + e.nx * 0.35, y0 + 3.2, mz + e.nz * 0.35, 0.3, 6.4, 5.2, ry, uvOf(R.stone), hex3('#2a2620'));
      for (const sd of [-1, 1]) buf.box(mx + e.nx * 1.0 + tx * 3.1 * sd, y0 + 2.8, mz + e.nz * 1.0 + tz * 3.1 * sd, 1.3, 5.6, 1.1, ry, uvOf(R.stone), gold);
      for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8, ax = Math.cos(a) * 3.1, ay = Math.sin(a) * 2.6; buf.box(mx + e.nx * 1.0 + tx * ax, y0 + 5.6 + ay, mz + e.nz * 1.0 + tz * ax, 1.3, 1.25, 1.25, ry, uvOf(R.stone), gold); }
      // 양옆 대형 현수막(세로 광고판): 얇은 흰 틀 + 사진 느낌(배경색 + 세로 인물 실루엣 + 아래 흰 글씨 띠)
      if (!SSG_SHOW) for (const sd of [-1, 1]) { const off = e.L * 0.3 * sd, bx = mx + tx * off + e.nx * 0.3, bz = mz + tz * off + e.nz * 0.3;
        const bg = sd < 0 ? hex3('#3a3036') : hex3('#ece4d8'), fig = sd < 0 ? hex3('#b0826c') : hex3('#a98a6a'), dress = sd < 0 ? hex3('#5e2f3a') : hex3('#c8b49a');
        buf.box(bx, y0 + 12.6, bz, 0.12, 11.2, 6.2, ry, uvOf(R.stone), hex3('#f4f1ec'));
        buf.box(bx + e.nx * 0.08, y0 + 12.6, bz + e.nz * 0.08, 0.04, 10.8, 5.8, ry, uvOf(R.stone), bg);
        buf.box(bx + e.nx * 0.12, y0 + 16.2, bz + e.nz * 0.12, 0.04, 1.1, 0.9, ry, uvOf(R.stone), fig); // 얼굴
        buf.box(bx + e.nx * 0.12, y0 + 12.9, bz + e.nz * 0.12, 0.04, 5.6, 1.7, ry, uvOf(R.stone), dress); // 옷
        buf.box(bx + e.nx * 0.12, y0 + 8.4, bz + e.nz * 0.12, 0.04, 0.6, 4.4, ry, uvOf(R.stone), sd < 0 ? hex3('#f4f1ec') : hex3('#5a4a3a')); } // 아래 글씨 띠
      // 발코니 난간 기둥(떠 있는 판처럼 보이지 않게)
      if (!SSG_SHOW) for (let k = -8; k <= 8; k++) buf.box(mx + e.nx * 2.25 + tx * k, y0 + 13.95, mz + e.nz * 2.25 + tz * k, 0.22, 1.0, 0.22, ry, uvOf(R.stone), hex3('#f4efe6'));
      if (!SSG_SHOW) buf.box(mx + e.nx * 2.25, y0 + 14.5, mz + e.nz * 2.25, 0.3, 0.15, 18, ry, uvOf(R.stone), hex3('#f4efe6'));
      signOn(buf, e.p, e.q, 0.7, 22, top - 3.4, top - 0.6, uvOf(R.sShinsegae), [e.nx, e.nz]);
      // 밤 미디어 파사드: 정면 + 양옆 모서리 면
      // [ssg-facade] 정면 + 양옆 면을 감싸는 LED 화면 (정면 아래는 금빛 입구, 위는 SHINSEGAE 글씨)
      const m0 = SSG_SHOW ? y0 + 5.2 : y0 + 5.4, m1 = SSG_SHOW ? top - 3.6 : top - 4.0;
      media.push({ e, y0: m0, y1: m1, front: true });
      for (const f of edgesOut(o)) if (f !== e && f.L > 18 && (f.nx * e.nx + f.nz * e.nz) > -0.2 && (f.nx * e.nx + f.nz * e.nz) < 0.7) media.push({ e: f, y0: m0, y1: m1 });
      if (SSG_SHOW) for (const f of media) { // 화면 테두리 철골(짙은 틀 4변)
        const fx = (f.e.q[0] - f.e.p[0]) / f.e.L, fz = (f.e.q[1] - f.e.p[1]) / f.e.L, fmx = (f.e.p[0] + f.e.q[0]) / 2, fmz = (f.e.p[1] + f.e.q[1]) / 2, fry = Math.atan2(fx, fz);
        for (const yy of [m0 - 0.25, m1 + 0.25]) buf.box(fmx + f.e.nx * 0.42, yy, fmz + f.e.nz * 0.42, 0.3, 0.5, f.e.L * 0.98, fry, uvOf(R.stone), hex3('#2b2d31'));
      }
    }
    labels.push({ text: '🏬 신세계백화점 본점 Shinsegae Department Store · 1930', x: cx, z: cz, y: top + 10, maxDist: 2600, minDist: 20, cls: 'label landmark' });
  }
}

/** 미디어 파사드 텍스처: 가로로 흐르는 빛 띠 · 별 · 눈송이 (글씨는 진짜 간판과 겹쳐 뺐다) (밤에만, offset 만 움직여 다시 올리지 않음) */
function mediaTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 1024, 0);
  ['#ff2d75', '#ffb703', '#22d3ee', '#7c3aed', '#ff2d75'].forEach((col, i, a) => grd.addColorStop(i / (a.length - 1), col));
  g.fillStyle = '#05060c'; g.fillRect(0, 0, 1024, 256);
  g.globalAlpha = 0.55; g.fillStyle = grd; for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 1024, 14); g.globalAlpha = 1;
  const r = rnd(9);
  for (let k = 0; k < 160; k++) { const x = r() * 1024, y = r() * 256, s = 1 + r() * 3; g.fillStyle = `hsla(${r() * 360},90%,${70 + r() * 25}%,${0.6 + r() * 0.4})`; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#ffffff'; g.lineWidth = 3;
  for (let k = 0; k < 10; k++) { const x = 50 + k * 100 + r() * 20, y = 40 + r() * 170, s = 14 + r() * 10; for (let a = 0; a < 3; a++) { const t = a * Math.PI / 3; g.beginPath(); g.moveTo(x - Math.cos(t) * s, y - Math.sin(t) * s); g.lineTo(x + Math.cos(t) * s, y + Math.sin(t) * s); g.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- 한국은행
function lathe(buf, cx, cz, y0, rings, seg, uv, col) { // rings: [[r, y], ...] 아래→위
  const pos = [], nrm = [], uvs = [], idx = [];
  const u0 = uv[0], v0 = uv[1], du = uv[2] - uv[0], dv = uv[3] - uv[1];
  for (let j = 0; j < rings.length; j++) for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, [r, y] = rings[j];
    const jn = Math.min(rings.length - 1, j + 1), jp = Math.max(0, j - 1);
    const dr = rings[jn][0] - rings[jp][0], dy = rings[jn][1] - rings[jp][1] || 1e-3; let nx = dy, ny = -dr; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    pos.push(cx + Math.sin(a) * r, y0 + y, cz + Math.cos(a) * r); nrm.push(Math.sin(a) * nx, ny, Math.cos(a) * nx);
    uvs.push(u0 + du * ((i % 2 ? 1 : 0)), v0 + dv * (j / (rings.length - 1)));
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  buf.raw(pos, idx, nrm, uvs, col);
}
function turret(buf, x, z, y0, r, h, col) {
  lathe(buf, x, z, y0, [[r, 0], [r, h * 0.5], [r, h]], 14, uvOf(R.arch), col);
  lathe(buf, x, z, y0, [[r + 0.5, h], [r + 0.5, h + 0.8], [r * 0.98, h + 0.8]], 14, uvOf(R.stone), hex3('#d8d1c4'));
  lathe(buf, x, z, y0, [[r * 0.98, h + 0.8], [r * 1.0, h + 1.6], [r * 0.92, h + 3.0], [r * 0.74, h + 4.8], [r * 0.42, h + 6.1], [r * 0.14, h + 6.7]], 18, uvOf(R.copper), hex3('#c9d6cc')); // 진초록 동판 돔
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; buf.box(x + Math.sin(a) * (r + 0.05), y0 + h * 0.62, z + Math.cos(a) * (r + 0.05), 1.1, 2.4, 0.12, a, uvOf(R.stone), hex3('#3e4650')); } // 탑 둘레 아치 창
  lathe(buf, x, z, y0, [[0.35, h + 6.4], [0.3, h + 8.5], [0.05, h + 9.6]], 6, uvOf(R.copper), hex3('#cfcfcf'));
}
function buildBok(ctx) {
  const { byId, baseOf, buf, labels } = ctx;
  const mus = byId.get(348489095), hq = byId.get(348490554);
  if (hq) { // 한국은행 본관(새 건물, 16층) — 유리 + 돌 기단
    const o = hq.o, y0 = baseOf(o), top = y0 + 66; const [cx, cz] = centroid(o);
    prism(buf, o, y0 - 0.4, y0 + 8, uvOf(R.stone), ...T('stone'), hex3('#c9c3b8'));
    prism(buf, o, y0 + 8, top, uvOf(R.glass), ...T('glass'), hex3('#c6d4df'), uvOf(R.stone), hex3('#7c8590'));
    const e = facing(o, [-11330, -21560]); if (e) signOn(buf, e.p, e.q, 0.4, Math.min(e.L * 0.55, 28), y0 + 3.2, y0 + 3.2 + Math.min(e.L * 0.55, 28) / 8, uvOf(R.sBok), [e.nx, e.nz]);
    if (e) signOn(buf, e.p, e.q, 0.4, Math.min(e.L * 0.5, 26), top - 5, top - 5 + Math.min(e.L * 0.5, 26) / 8, uvOf(R.sBok), [e.nx, e.nz]);
    labels.push({ text: '한국은행 Bank of Korea (HQ)', x: cx, z: cz, y: top + 5, maxDist: 900, minDist: 20, cls: 'label' });
  }
  if (mus) { // 화폐박물관 = 옛 조선은행 본점(1912) — 화강석, 앞 모서리 돔 탑, 가운데 박공 현관
    const o = mus.o, y0 = baseOf(o), top = y0 + 14.5; const [cx, cz] = centroid(o);
    const stone = hex3('#ece6da');
    prism(buf, o, y0 - 0.4, top, uvOf(R.arch), ...T('arch'), stone, uvOf(R.stone), hex3('#9aa39c'));
    // 맨사드 지붕(사진의 초록 동판 경사 지붕): 안으로 들어간 경사 띠 + 위 판
    { const ins = o.map(([x, z]) => [x + (cx - x) * 0.1, z + (cz - z) * 0.1]); for (let i = 0; i < o.length; i++) { const a = o[i], b = o[(i + 1) % o.length], a2 = ins[i], b2 = ins[(i + 1) % o.length]; const ccw = ringArea(o) > 0; const P = [a[0], top + 1.3, a[1]], Q = [b[0], top + 1.3, b[1]], Q2 = [b2[0], top + 4.2, b2[1]], P2 = [a2[0], top + 4.2, a2[1]]; if (ccw) buf.quad(Q, P, P2, Q2, uvOf(R.copper), hex3('#b3c6b8')); else buf.quad(P, Q, Q2, P2, uvOf(R.copper), hex3('#b3c6b8')); } cap(buf, ins, top + 4.2, uvOf(R.copper), hex3('#a3b8a9')); }
    for (const e of edgesOut(o)) { wall(buf, e.p, e.q, top - 0.2, top + 1.3, uvOf(R.stone), 10, 1.5, hex3('#ddd6c8'), 0.45); wall(buf, e.p, e.q, y0 - 0.4, y0 + 1.6, uvOf(R.stone), 10, 2, hex3('#b8b1a4'), 0.3); }
    // 앞 = 남대문로(남쪽) · 로터리 쪽
    const fr = [-11300, -21560];
    const fx = fr[0] - cx, fz = fr[1] - cz, fl = Math.hypot(fx, fz); const ux = fx / fl, uz = fz / fl, sx = -uz, sz = ux;
    let A = null, B = null, aBest = -Infinity, bBest = -Infinity;
    for (const [x, z] of o) { const f = (x - cx) * ux + (z - cz) * uz, s = (x - cx) * sx + (z - cz) * sz; if (f + s > aBest) { aBest = f + s; A = [x, z]; } if (f - s > bBest) { bBest = f - s; B = [x, z]; } }
    // 큰 탑(로터리 쪽) · 작은 탑
    const near = (p) => Math.hypot(p[0] - ROUNDABOUT[0], p[1] - ROUNDABOUT[1]);
    const [big, small] = near(A) < near(B) ? [A, B] : [B, A];
    const inward = (p, k) => [p[0] + (cx - p[0]) * k / Math.hypot(cx - p[0], cz - p[1]), p[1] + (cz - p[1]) * k / Math.hypot(cx - p[0], cz - p[1])];
    const bp = inward(big, 3.5), sp = inward(small, 2.6);
    turret(buf, bp[0], bp[1], y0 - 0.4, 5.6, 20, stone);
    turret(buf, sp[0], sp[1], y0 - 0.4, 3.6, 16.5, stone);
    // 가운데 박공 현관 (앞 변 가운데)
    const e = facing(o, fr);
    if (e) {
      const tx = (e.q[0] - e.p[0]) / e.L, tz = (e.q[1] - e.p[1]) / e.L, mx = (e.p[0] + e.q[0]) / 2, mz = (e.p[1] + e.q[1]) / 2, ry = Math.atan2(tx, tz);
      for (const t of [-5.4, -1.8, 1.8, 5.4]) buf.box(mx + tx * t + e.nx * 4.2, y0 + 4.2, mz + tz * t + e.nz * 4.2, 1.1, 9.2, 1.1, ry, uvOf(R.stone), hex3('#f2ede3'));
      buf.box(mx + e.nx * 2.6, y0 + 10, mz + e.nz * 2.6, 4.6, 2.4, 13.4, ry, uvOf(R.stone), hex3('#e4ddcf'));
      // 박공(삼각): 앞 벽 위
      const half = 7.2, ya = top + 1.2, yb = top + 4.6; const ox = mx + e.nx * 0.7, oz = mz + e.nz * 0.7;
      const c = [ox, yb, oz];
      // 바깥에서 보면 왼→오 = (nz, -nx)
      const rx = e.nz, rz = -e.nx; const L = [ox - rx * half, ya, oz - rz * half], Rr = [ox + rx * half, ya, oz + rz * half];
      buf.raw([...L, ...Rr, ...c], [0, 1, 2], [e.nx, 0, e.nz, e.nx, 0, e.nz, e.nx, 0, e.nz], [0.6, 0.6, 0.7, 0.6, 0.65, 0.7], hex3('#e9e3d6'));
      signOn(buf, e.p, e.q, 4.95, 12, y0 + 9.25, y0 + 10.75, uvOf(R.sMuseum), [e.nx, e.nz]);
    }
    labels.push({ text: '🏛️ 한국은행 화폐박물관 Bank of Korea Money Museum · 1912', x: cx, z: cz, y: top + 14, maxDist: 2200, minDist: 18, cls: 'label landmark' });
  }
}

// ---------------------------------------------------------------- 남대문시장
const MARKET_GATE = { a: [-11351, -21467], b: [-11388, -21458], t: 0.35 }; // 남대문시장길 위 (신세계 서쪽 · 한국은행 맞은편 시장 들머리)
function buildNamdaemun(ctx) {
  const { buf, labels, heightAt, data, bldAt, blockers } = ctx;
  const { a, b, t } = MARKET_GATE;
  const gx = a[0] + (b[0] - a[0]) * t, gz = a[1] + (b[1] - a[1]) * t;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; // 길 방향(서쪽 = 시장 안)
  const nx = -tz, nz = tx; // 길 가로 방향
  const y0 = heightAt(gx, gz);
  const blue = hex3('#2a3a9a'), ry = Math.atan2(nx, nz);
  let half = 5.6; while (half > 3 && bldAt && (bldAt(gx + nx * half, gz + nz * half, 0.5) || bldAt(gx - nx * half, gz - nz * half, 0.5))) half -= 0.4; // 기둥이 건물에 박히지 않게
  // 기둥 2개 + 파란 간판 틀 + 위 'GATE' 장식
  for (const s of [-1, 1]) { const px = gx + nx * half * s, pz = gz + nz * half * s; buf.box(px, y0 + 3.9, pz, 0.7, 8.2, 0.7, ry, uvOf(R.stone), blue); blockers.push({ x: px, z: pz, tx: nx, tz: nz, hl: 0.5, hd: 0.5 }); }
  const sy0 = y0 + 5.3, sy1 = y0 + 7.9, sw = half * 2 + 0.9;
  buf.box(gx, (sy0 + sy1) / 2, gz, 0.45, sy1 - sy0 + 0.3, sw + 0.3, ry, uvOf(R.stone), blue);
  // 앞(동쪽, 명동에서 오는 쪽)·뒤 간판 면
  for (const s of [1, -1]) {
    const ox = gx - tx * 0.24 * s, oz = gz - tz * 0.24 * s; const fnx = -tx * s, fnz = -tz * s; const rx = fnz, rz = -fnx;
    const A = [ox - rx * sw / 2, sy0, oz - rz * sw / 2], B = [ox + rx * sw / 2, sy0, oz + rz * sw / 2];
    buf.quad(A, B, [B[0], sy1, B[2]], [A[0], sy1, A[2]], uvOf(R.sMarket), [1, 1, 1], [fnx, 0, fnz]);
  }
  buf.box(gx, sy1 + 0.75, gz, 0.4, 1.3, 2.6, ry, uvOf(R.stone), hex3('#1f2c7a'));
  buf.box(gx, sy1 + 0.75, gz, 0.5, 0.5, 1.6, ry, uvOf(R.stone), hex3('#ffd23f'));
  // [md-market] 시장 골목 위로 가로지르는 빨강·노랑·파랑 삼각 깃발 줄 + 붉은 등 (멀리서도 '시장 골목'으로 읽히게). 충돌 없음(머리 위 5 m)
  { const fl = [hex3('#e63946'), hex3('#ffd23f'), hex3('#2a6fdb'), hex3('#ffffff'), hex3('#2a9d8f')];
    for (let k = 1; k <= 7; k++) {
      const d = 9 * k, cx = gx + tx * d, cz = gz + tz * d; if (cx < -11520) break;
      const hw = Math.max(2.6, half - 0.8), yy = y0 + 6.2;
      buf.box(cx, yy + 0.05, cz, 0.05, 0.05, 2 * hw, ry, uvOf(R.stone), hex3('#333333'));
      for (let i = 0; i < 9; i++) {
        const f = -hw + (2 * hw) * (i + 0.5) / 9, px = cx + nx * f, pz = cz + nz * f, sag = 0.5 * (1 - (f / hw) ** 2);
        const A = [px - nx * 0.5, yy, pz - nz * 0.5], B = [px + nx * 0.5, A[1], pz + nz * 0.5], C = [px, A[1] - 1.1 - sag * 0.2, pz];
        buf.raw([...A, ...B, ...C], [0, 1, 2, 0, 2, 1], [tx, 0, tz, tx, 0, tz, tx, 0, tz], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], fl[(i + k) % fl.length]);
      }
      if (k % 2) for (const f of [-hw * 0.5, 0, hw * 0.5]) buf.box(cx + nx * f, yy - 1.6, cz + nz * f, 0.5, 0.75, 0.5, ry, uvOf(R.stone), hex3('#d62828'));
    }
  }
  labels.push({ text: '🏮 남대문시장 Namdaemun Market', x: gx, z: gz, y: y0 + 11, maxDist: 1800, minDist: 10, cls: 'label landmark' });
  // 시장 골목 노점: 남대문시장길 양쪽 (게이트 안쪽부터 바깥 띠 끝까지)
  //   [md-market] + 시장 안 골목(남대문로 쪽 남북 골목 · 남서 footway · 시장 광장 보행로 · 10길 북쪽 · 시장길 남쪽)도 양쪽에 노점
  const ids = new Set([301285279, 78503333, 788296725, 382947009, 788296724, 78503342, 1128365154, 913406478, 913409138, 581906883]);
  const inner = new Set([788296724, 78503342, 1128365154, 913406478, 913409138, 581906883]);
  const lines = (data.ways || []).filter((w) => ids.has(w.id));
  // 노점이 다른 골목(가로지르는 길) 위에 서지 않게: 시장 둘레의 모든 길 선분 (자기 길 제외)
  const MX0 = -11535, MX1 = -11300, MZ0 = -21560, MZ1 = -21280;
  const segs = [];
  for (const w of data.ways || []) for (let i = 1; i < (w.pts?.length || 0); i++) {
    const a = w.pts[i - 1], b = w.pts[i];
    if (Math.max(a[0], b[0]) < MX0 || Math.min(a[0], b[0]) > MX1 || Math.max(a[1], b[1]) < MZ0 || Math.min(a[1], b[1]) > MZ1) continue;
    segs.push({ id: w.id, a, b, r: (w.w || 4) / 2 });
  }
  const onOtherWay = (x, z, id, pad) => segs.some((q) => q.id !== id && distToSeg(x, z, q.a[0], q.a[1], q.b[0], q.b[1]) < q.r + pad);
  // 안쪽 골목 위 깃발 줄 (9 m 마다, 게이트 쪽 줄과 같은 모양)
  { const fl = [hex3('#e63946'), hex3('#ffd23f'), hex3('#2a6fdb'), hex3('#ffffff'), hex3('#2a9d8f')];
    let kk = 0;
    for (const w of lines) { if (!inner.has(w.id)) continue;
      for (let i = 1, pts = w.pts; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i]; const sl = Math.hypot(q[0] - p[0], q[1] - p[1]); if (sl < 6) continue;
        const ux = (q[0] - p[0]) / sl, uz = (q[1] - p[1]) / sl, vx = -uz, vz = ux, fr = Math.atan2(vx, vz);
        for (let d = 4.5; d < sl - 3; d += 9) {
          const cx = p[0] + ux * d, cz = p[1] + uz * d; if (cx < MX0 + 6 || onOtherWay(cx, cz, w.id, 1)) continue;
          const hw = (w.w || 4) / 2 + 1.6, yy = heightAt(cx, cz) + 5.6; kk++;
          buf.box(cx, yy + 0.05, cz, 0.05, 0.05, 2 * hw, fr, uvOf(R.stone), hex3('#333333'));
          for (let j = 0; j < 7; j++) {
            const f = -hw + (2 * hw) * (j + 0.5) / 7, px = cx + vx * f, pz = cz + vz * f;
            const A = [px - vx * 0.45, yy, pz - vz * 0.45], B = [px + vx * 0.45, yy, pz + vz * 0.45], C = [px, yy - 1.0, pz];
            buf.raw([...A, ...B, ...C], [0, 1, 2, 0, 2, 1], [ux, 0, uz, ux, 0, uz, ux, 0, uz], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], fl[(j + kk) % fl.length]);
          }
          if (kk % 2) buf.box(cx, yy - 1.5, cz, 0.5, 0.75, 0.5, fr, uvOf(R.stone), hex3('#d62828'));
        }
      }
    }
  }
  const r = rnd(4242); const awn = [R.awn0, R.awn1, R.awn2, R.awn3];
  const goods = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#8ecae6', '#ffb4c6', '#6d597a', '#f1faee', '#264653'].map(hex3);
  let n = 0;
  for (const w of lines) for (let i = 1, pts = w.pts; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i]; const sl = Math.hypot(q[0] - p[0], q[1] - p[1]); if (sl < 3) continue;
    const ux = (q[0] - p[0]) / sl, uz = (q[1] - p[1]) / sl, vx = -uz, vz = ux, sr = Math.atan2(ux, uz);
    for (let d = 1.6; d < sl - 1.6; d += 3.1) for (const side of [-1, 1]) {
      // 길 가장자리 바깥에 놓고, 건물이 붙어 있으면(시장 안 좁은 골목) 길 안쪽 가장자리로 들인다 — 가운데 ≥ 3.5 m 는 비운다
      const ww = w.w || 4; let off = ww / 2 + 0.85, x = p[0] + ux * d + vx * off * side, z = p[1] + uz * d + vz * off * side;
      if (Math.hypot(x - gx, z - gz) < 7) continue;
      if (bldAt && bldAt(x, z, 0.9)) {
        if (ww < 6) continue;
        off = ww / 2 - 0.8; x = p[0] + ux * d + vx * off * side; z = p[1] + uz * d + vz * off * side;
        if (bldAt(x, z, 0.3)) continue;
      }
      if (x > -11345 || x < -11527) continue;
      if (onOtherWay(x, z, w.id, 1.6)) continue; // [md-market] 가로지르는 골목 입구는 비운다
      const y = heightAt(x, z); const k = Math.floor(r() * 4);
      // 판매대 + 상품 더미 + 차양(줄무늬) + 옷걸이 기둥
      buf.box(x, y + 0.45, z, 1.3, 0.9, 2.5, sr, uvOf(R.stone), hex3('#6b4f36'));
      for (let m = 0; m < 4; m++) buf.box(x + ux * (m - 1.5) * 0.55, y + 1.05 + r() * 0.2, z + uz * (m - 1.5) * 0.55, 0.9, 0.35 + r() * 0.35, 0.5, sr, uvOf(R.stone), goods[Math.floor(r() * goods.length)]);
      const ax = x - vx * side * 0.4, az = z - vz * side * 0.4; // 차양은 길 쪽으로 조금 기울게
      const w2 = 1.45, d2 = 1.2; const h0 = y + 2.5, h1 = y + 2.15;
      const P0 = [ax - ux * w2 + vx * side * d2 * -1, h0, az - uz * w2 + vz * side * d2 * -1];
      const P1 = [ax + ux * w2 + vx * side * d2 * -1, h0, az + uz * w2 + vz * side * d2 * -1];
      const P2 = [ax + ux * w2 + vx * side * d2 * 0.8, h1, az + uz * w2 + vz * side * d2 * 0.8];
      const P3 = [ax - ux * w2 + vx * side * d2 * 0.8, h1, az - uz * w2 + vz * side * d2 * 0.8];
      buf.quad(P0, P1, P2, P3, uvOf(awn[k]), [1, 1, 1]); buf.quad(P3, P2, P1, P0, uvOf(awn[k]), [0.8, 0.8, 0.8]);
      if (r() < 0.5) { buf.box(x + vx * side * 0.9, y + 1.1, z + vz * side * 0.9, 0.12, 2.2, 0.12, sr, uvOf(R.stone), hex3('#555')); for (let m = 0; m < 3; m++) buf.box(x + vx * side * 0.9 + ux * (m - 1) * 0.5, y + 1.5, z + vz * side * 0.9 + uz * (m - 1) * 0.5, 0.45, 0.9, 0.06, sr + Math.PI / 2, uvOf(R.stone), goods[Math.floor(r() * goods.length)]); }
      blockers.push({ x, z, tx: ux, tz: uz, hl: 1.35, hd: 0.75 });
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- 진입점
/**
 * @param {{ parent: THREE.Object3D, data: any, heightAt: (x:number,z:number)=>number, overlay?: any, bldAt?: (x:number,z:number,pad?:number)=>any }} o
 */
export function createMyeongdongSignature({ parent, data, heightAt, overlay = null, bldAt = null }) {
  const g = new THREE.Group(); g.name = 'myeongdong-signature'; parent.add(g);
  const byId = new Map(); for (const b of data.buildings || []) if (SIGNATURE_IDS.has(b.id)) byId.set(b.id, b);
  const baseOf = (o) => { let mn = Infinity; for (const [x, z] of o) mn = Math.min(mn, heightAt(x, z)); return mn; };
  const M = sharedMats();
  const meshes = [], labels = [], media = [], blockers = [];
  const one = (name, fn) => {
    const buf = new GeoBuf({ uv: true, color: true });
    fn({ byId, baseOf, buf, labels, heightAt, media, data, bldAt, blockers });
    const geo = buf.build(); if (!geo) return;
    const m = new THREE.Mesh(geo, M.body); m.name = name; m.castShadow = false; m.receiveShadow = false; g.add(m); meshes.push(m);
  };
  one('md-sig-lotte', buildLotte);
  one('md-sig-shinsegae', buildShinsegae);
  one('md-sig-bok', buildBok);
  one('md-sig-namdaemun', buildNamdaemun);
  // 시장 노점 · 게이트 기둥 충돌 (방향 있는 상자)
  const blockGrid = new CellGrid(16); for (const b of blockers) { const e = Math.max(b.hl, b.hd) + 0.5; blockGrid.add(b, b.x - e, b.z - e, b.x + e, b.z + e); }
  // 신세계 밤 미디어 파사드: 면 몇 장 + 흐르는 텍스처(가산 혼합, 밤에만 보임, draw 1)
  let mediaMesh = null, mediaTex = null, show = null;
  // [ssg-facade] 크리스마스 미디어 파사드(셰이더 화면 1 + 바닥 빛 1). ?ssgshow=0 이면 예전 밤 빛 띠
  if (media.length && SSG_SHOW) show = createShinsegaeShow({ parent: g, faces: media, heightAt });
  else if (media.length) {
    const buf = new GeoBuf({ uv: true });
    let u = 0;
    for (const { e, y0, y1 } of media) {
      const k = 0.94, ax = e.p[0] + (e.q[0] - e.p[0]) * (1 - k) / 2, az = e.p[1] + (e.q[1] - e.p[1]) * (1 - k) / 2;
      const bx = e.q[0] - (e.q[0] - e.p[0]) * (1 - k) / 2, bz = e.q[1] - (e.q[1] - e.p[1]) * (1 - k) / 2;
      const o = 0.28, du = (e.L * k) / ((y1 - y0) * 4);
      // 밖에서 보면 왼→오 = p→q 의 반대일 수 있어 법선 기준으로 맞춘다: right = (nz, -nx)
      const flip = ((bx - ax) * e.nz + (bz - az) * -e.nx) < 0;
      const L = flip ? [bx, bz] : [ax, az], Rr = flip ? [ax, az] : [bx, bz];
      buf.quad([L[0] + e.nx * o, y0, L[1] + e.nz * o], [Rr[0] + e.nx * o, y0, Rr[1] + e.nz * o], [Rr[0] + e.nx * o, y1, Rr[1] + e.nz * o], [L[0] + e.nx * o, y1, L[1] + e.nz * o], [u, 0, u + du, 1], null, [e.nx, 0, e.nz]);
      u += du;
    }
    const geo = buf.build();
    if (geo) {
      mediaTex = mediaTexture();
      const mat = new THREE.MeshBasicMaterial({ map: mediaTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: true, color: 0xb0b0b0 });
      mediaMesh = new THREE.Mesh(geo, mat); mediaMesh.name = 'md-sig-shinsegae-media'; mediaMesh.visible = false; mediaMesh.renderOrder = 2; g.add(mediaMesh); meshes.push(mediaMesh);
    }
  }
  if (overlay) for (const L of labels) overlay.add({ cls: L.cls, text: L.text, getPos: () => new THREE.Vector3(L.x, L.y, L.z), maxDist: L.maxDist, minDist: L.minDist });
  return {
    group: g,
    footprints: [...byId.values()].map((b) => ({ o: b.o })),
    setNight(v) { M.body.emissiveIntensity = 0.05 + v * 0.95; if (mediaMesh) mediaMesh.visible = v > 0.5; show?.setNight(v); },
    show,
    isBlocked(x, z, r = 0.4) {
      for (const b of blockGrid.query(x, z)) { const dx = x - b.x, dz = z - b.z; if (Math.abs(dx * b.tx + dz * b.tz) < b.hl + r && Math.abs(dz * b.tx - dx * b.tz) < b.hd + r) return true; }
      return false;
    },
    update(dt = 0) { show?.update(dt); if (mediaMesh?.visible && mediaTex) mediaTex.offset.x = (mediaTex.offset.x + dt * 0.035) % 1; },
    stats() { return { blockers: blockers.length, meshes: meshes.length, tris: meshes.reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count / 3 : 0), 0) }; },
  };
}
void pointInRing; void hash01;
