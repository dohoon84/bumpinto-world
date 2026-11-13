// [myeongdong-signature] 명동 대표 건물: 롯데백화점 본점(+에비뉴엘·영플라자) · 신세계백화점 본점(본관·옛 제일은행·신관 + 밤 미디어 파사드)
//   · 한국은행 화폐박물관(+한국은행 본관) · 남대문시장 입구 게이트와 시장 골목.
//   자리는 OSM 외곽선(myeongdong.json buildings 의 way id) 그대로. 모양은 사진(위키미디어 공용) 보고 로우폴리로 줄였다.
//   재질: 아틀라스 캔버스 한 장(낮 색 + 밤 빛 emissiveMap) → 건물마다 병합 메시 1개(draw 1). 미디어 파사드만 따로(밤에만, draw 1).
//   실제 Light 없음. 충돌은 외곽선(myeongdong.js bldGrid). 이름표는 한국어 + 영어.
import * as THREE from 'three';
import { GeoBuf, hex3, pointInRing, cathedralFrame, hash01 } from './myeongdongGeo.js';
import { MD_FONT } from './myeongdongAtlas.js';

/** 모델이 대신 그리는 OSM 건물 way id (일반 건물 병합에서 뺀다. 충돌은 그대로) */
export const SIGNATURE_IDS = new Set([
  233592424, 233592423, 577594782, // 롯데백화점 본점 · 에비뉴엘 · 롯데영플라자
]);

// ---------------------------------------------------------------- 아틀라스 (1024², 256 칸)
const AW = 1024;
const R = {
  dept: [0, 0, 256, 256], office: [256, 0, 256, 256], glass: [512, 0, 256, 256], bronze: [768, 0, 256, 256],
  stoneWin: [0, 256, 256, 256], arch: [256, 256, 256, 256], stone: [512, 256, 256, 256], copper: [768, 256, 256, 256],
  sLotte: [0, 512, 512, 128], sAvenuel: [512, 512, 512, 64], sYoung: [512, 576, 512, 64],
  sShinsegae: [0, 640, 512, 64], sHeritage: [512, 640, 512, 64], sBok: [0, 704, 512, 64], sMuseum: [512, 704, 512, 64],
  sMarket: [0, 768, 1024, 160],
  awn0: [0, 928, 256, 96], awn1: [256, 928, 256, 96], awn2: [512, 928, 256, 96], awn3: [768, 928, 256, 96],
};
/** 아틀라스 칸 하나가 덮는 실제 크기 [가로 m, 세로 m] (창 크기가 실물처럼 보이게) */
const TILE = { dept: [28, 17.5], office: [13, 21], glass: [8, 21], bronze: [15, 20], stoneWin: [12, 12.5], arch: [9, 7], stone: [10, 10], copper: [8, 8] };
const T = (k) => TILE[k];
const uvOf = (r, inset = 1.5) => [(r[0] + inset) / AW, 1 - (r[1] + r[3] - inset) / AW, (r[0] + r[2] - inset) / AW, 1 - (r[1] + inset) / AW];

function rnd(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function drawAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = AW;
  const e = document.createElement('canvas'); e.width = e.height = AW;
  const g = c.getContext('2d'), h = e.getContext('2d');
  g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, AW, AW);
  h.fillStyle = '#000'; h.fillRect(0, 0, AW, AW);
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
  sign(R.sShinsegae, '#cfc8bb', '#9a7a2e', 'SHINSEGAE', '신세계백화점 본점', { glow: '#ffd27a' });
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
  return { c, e };
}

let shared = null;
function sharedMats() {
  if (shared) return shared;
  const { c, e } = drawAtlas();
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const emap = new THREE.CanvasTexture(e); emap.colorSpace = THREE.SRGBColorSpace;
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
    // 꼭대기 띠(어두운 처마)
    for (const e of edgesOut(o)) wall(buf, e.p, e.q, podTop - 0.1, podTop + 2.2, uvOf(R.copper), 12, 2.3, hex3('#6c6a66'), 0.25);
    // 사거리 쪽 큰 간판 (긴 벽 중 사거리를 보는 면)
    const [cx, cz] = centroid(o); const dx = toward[0] - cx, dz = toward[1] - cz, dl = Math.hypot(dx, dz);
    for (const e of edgesOut(o)) {
      if (e.L < 28) continue; const k = (e.nx * dx + e.nz * dz) / dl; if (k < 0.35) continue;
      const w = Math.min(e.L * 0.55, 40), hgt = w / 4;
      signOn(buf, e.p, e.q, 0.45, w, podTop - 2.5 - hgt, podTop - 2.5, uvOf(R.sLotte), [e.nx, e.nz]);
      signOn(buf, e.p, e.q, 0.45, 16, y0 + 5.2, y0 + 9.2, uvOf(R.sLotte), [e.nx, e.nz]);
    }
    // 신관 타워(롯데호텔 신관, 147 m): 사거리에서 먼 쪽 절반 위로
    const F = cathedralFrame(o);
    const du = F.uMax - F.uMin; const far = Math.hypot(...((p) => [p[0] - toward[0], p[1] - toward[1]])(F.W(F.uMin + du * 0.25, 0))) > Math.hypot(...((p) => [p[0] - toward[0], p[1] - toward[1]])(F.W(F.uMax - du * 0.25, 0)));
    const [ua, ub] = far ? [F.uMin + 6, F.uMin + du * 0.5] : [F.uMax - du * 0.5, F.uMax - 6];
    const tw = rectRing(F, ua, ub, F.vMin + 7, F.vMax - 7);
    const tTop = y0 + 147;
    prism(buf, tw, podTop, tTop - 4, uvOf(R.office), ...T('office'), W);
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

// ---------------------------------------------------------------- 진입점
/**
 * @param {{ parent: THREE.Object3D, data: any, heightAt: (x:number,z:number)=>number, overlay?: any }} o
 */
export function createMyeongdongSignature({ parent, data, heightAt, overlay = null }) {
  const g = new THREE.Group(); g.name = 'myeongdong-signature'; parent.add(g);
  const byId = new Map(); for (const b of data.buildings || []) if (SIGNATURE_IDS.has(b.id)) byId.set(b.id, b);
  const baseOf = (o) => { let mn = Infinity; for (const [x, z] of o) mn = Math.min(mn, heightAt(x, z)); return mn; };
  const M = sharedMats();
  const meshes = [], labels = [];
  const one = (name, fn) => {
    const buf = new GeoBuf({ uv: true, color: true });
    fn({ byId, baseOf, buf, labels, heightAt });
    const geo = buf.build(); if (!geo) return;
    const m = new THREE.Mesh(geo, M.body); m.name = name; m.castShadow = false; m.receiveShadow = false; g.add(m); meshes.push(m);
  };
  one('md-sig-lotte', buildLotte);
  if (overlay) for (const L of labels) overlay.add({ cls: L.cls, text: L.text, getPos: () => new THREE.Vector3(L.x, L.y, L.z), maxDist: L.maxDist, minDist: L.minDist });
  return {
    group: g,
    footprints: [...byId.values()].map((b) => ({ o: b.o })),
    setNight(v) { M.body.emissiveIntensity = 0.05 + v * 0.95; },
    update() {},
    stats() { return { meshes: meshes.length, tris: meshes.reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count / 3 : 0), 0) }; },
  };
}
void pointInRing; void hash01;
