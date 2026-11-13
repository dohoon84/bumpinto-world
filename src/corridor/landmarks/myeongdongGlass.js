// [myeongdong-cathedral] 명동대성당 스테인드글라스 아틀라스 (캔버스 1장 2048×1536).
//   창마다 문양·색이 다르다: 측랑 쌍창(사엽 메달리온 8종) · 후진 인물창(8종) · 고측창 쌍창(2종) · 장미창(2종) · 세 갈래 창
//   + 바깥 창틀/시계/종루 루버. 흐린 사본(512×384)은 바닥에 떨어지는 색 빛 조각(가산 블렌딩)에 쓴다.
//   cell(name, k) → [u0, v0, u1, v1] (three.js uv, flipY 기준)
const AW = 2048, AH = 1536;
const CELLS = {
  pair: { x: 0, y: 0, w: 256, h: 512, n: 8 },
  apse: { x: 0, y: 512, w: 128, h: 512, n: 8 },
  cler: { x: 1024, y: 512, w: 256, h: 512, n: 2 },
  framePair: { x: 1536, y: 512, w: 256, h: 512, n: 1 },
  frameOne: { x: 1792, y: 512, w: 128, h: 512, n: 1 },
  louver: { x: 1920, y: 512, w: 128, h: 512, n: 1 },
  rose: { x: 0, y: 1024, w: 512, h: 512, n: 2 },
  frameRose: { x: 1024, y: 1024, w: 512, h: 512, n: 1 },
  clock: { x: 1536, y: 1024, w: 256, h: 256, n: 1 },
  triple: { x: 1792, y: 1024, w: 256, h: 512, n: 1 },
  one: { x: 1536, y: 1280, w: 128, h: 256, n: 2 }, // 작은 외창(측랑 정면·탑 옆)
};
// 창마다 대표 색(빛 줄기 색) — 팔레트 [바탕, 메달 1, 메달 2, 테두리, 대표]
const PAL = [
  ['#cfe3ee', '#c8283a', '#f2c230', '#2a4fb0', [1, 0.55, 0.45]],
  ['#d9d2ef', '#3b3fc0', '#9a3cc4', '#e0b030', [0.62, 0.55, 1]],
  ['#e4efd4', '#2f9a48', '#e8b828', '#b8302c', [0.6, 1, 0.55]],
  ['#e9dccf', '#b81e3a', '#2a62c8', '#e8c040', [1, 0.5, 0.6]],
  ['#f3e6c4', '#e07a1c', '#c0282a', '#2850a8', [1, 0.75, 0.4]],
  ['#d4ece8', '#1f9c9a', '#d84a7a', '#e8c040', [0.5, 1, 0.95]],
  ['#e2d6ea', '#7a2ab0', '#e8b020', '#2a8a4a', [0.8, 0.5, 1]],
  ['#dcebd8', '#1e8a52', '#d42a2a', '#2a4ab8', [0.55, 1, 0.65]],
];
export const GLASS_TINT = PAL.map((p) => p[4]);
const ROSE_TINT = [[0.65, 0.6, 1], [1, 0.6, 0.5]];
export function roseTint(k) { return ROSE_TINT[k % 2]; }

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

/** 첨두아치(뾰족 아치) 창 경로: (x,y) 왼쪽 위 기준 폭 w 높이 h. 아치 높이 = w·0.9 */
export function lancetPath(g, x, y, w, h) {
  const ah = Math.min(h * 0.45, w * 0.9);
  g.beginPath();
  g.moveTo(x, y + h); g.lineTo(x, y + ah);
  g.quadraticCurveTo(x, y + ah * 0.25, x + w / 2, y);
  g.quadraticCurveTo(x + w, y + ah * 0.25, x + w, y + ah);
  g.lineTo(x + w, y + h); g.closePath();
}
function quatrefoil(g, cx, cy, r, c1, c2, lead) {
  g.fillStyle = c1;
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.arc(cx + Math.cos(a) * r * 0.52, cy + Math.sin(a) * r * 0.52, r * 0.52, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#f6f0dc'; g.beginPath(); g.arc(cx, cy, r * 0.62, 0, Math.PI * 2); g.fill();
  g.fillStyle = c2;
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.ellipse(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3, r * 0.26, r * 0.12, a, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = lead; g.beginPath(); g.arc(cx, cy, r * 0.16, 0, Math.PI * 2); g.fill();
  g.fillStyle = c2; g.beginPath(); g.arc(cx, cy, r * 0.1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = lead; g.lineWidth = 2.2;
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.arc(cx + Math.cos(a) * r * 0.52, cy + Math.sin(a) * r * 0.52, r * 0.52, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.arc(cx, cy, r * 0.62, 0, Math.PI * 2); g.stroke();
}
/** 한 갈래 창 안을 채운다 (기하 문양): 바탕 마름모 격자 + 사엽 메달리온 + 테두리 */
function fillGeoLancet(g, x, y, w, h, P, seed) {
  const r = rng(seed);
  g.save(); lancetPath(g, x, y, w, h); g.clip();
  g.fillStyle = P[0]; g.fillRect(x, y, w, h);
  // 마름모 격자 (연한 무늬)
  g.strokeStyle = 'rgba(70,90,120,.35)'; g.lineWidth = 1.2;
  for (let k = -h; k < w + h; k += 14) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k - h, y + h); g.stroke(); g.beginPath(); g.moveTo(x + k - h, y); g.lineTo(x + k, y + h); g.stroke(); }
  for (let k = 0; k < 40; k++) { g.fillStyle = `hsla(${r() * 360},50%,70%,.25)`; g.fillRect(x + r() * w, y + r() * h, 5, 5); }
  // 테두리 띠 (색 칸 번갈아)
  const bw = Math.max(6, w * 0.11);
  for (let yy = y; yy < y + h; yy += bw * 1.4) {
    const c = [P[3], P[1], P[2]][Math.floor((yy - y) / (bw * 1.4)) % 3];
    g.fillStyle = c; g.fillRect(x, yy, bw, bw * 1.3); g.fillRect(x + w - bw, yy, bw, bw * 1.3);
  }
  // 메달리온 세로로
  const n = Math.max(2, Math.round((h - w * 0.6) / (w * 0.95)));
  const step = (h - w * 0.55) / n;
  for (let k = 0; k < n; k++) quatrefoil(g, x + w / 2, y + w * 0.55 + step * (k + 0.5), w * 0.36, k % 2 ? P[2] : P[1], k % 2 ? P[1] : P[3], '#1a1a1e');
  g.restore();
  g.strokeStyle = '#141418'; g.lineWidth = 4; lancetPath(g, x, y, w, h); g.stroke();
}
function drawPair(g, cx, cy, cw, ch, P, seed) {
  // 쌍창 + 위 원창 (참고: 명동성당 측랑 창)
  const lw = cw * 0.38, gap = cw * 0.06, top = ch * 0.22;
  fillGeoLancet(g, cx + cw / 2 - gap / 2 - lw, cy + top, lw, ch - top - 4, P, seed);
  fillGeoLancet(g, cx + cw / 2 + gap / 2, cy + top, lw, ch - top - 4, P, seed + 7);
  const rr = cw * 0.2, ox = cx + cw / 2, oy = cy + top * 0.52;
  g.save(); g.beginPath(); g.arc(ox, oy, rr, 0, Math.PI * 2); g.clip();
  g.fillStyle = P[3]; g.fillRect(ox - rr, oy - rr, rr * 2, rr * 2);
  quatrefoil(g, ox, oy, rr * 0.92, P[1], P[2], '#1a1a1e');
  g.restore(); g.strokeStyle = '#141418'; g.lineWidth = 4; g.beginPath(); g.arc(ox, oy, rr, 0, Math.PI * 2); g.stroke();
}
/** 후진 인물창: 파란 바탕에 성인 세 분(후광·옷)을 위아래로, 붉은 테두리 */
function drawApse(g, x, y, w, h, k) {
  const r = rng(101 + k * 13);
  const robes = ['#c42a2a', '#2a52c0', '#2a8a4a', '#d8a020', '#8a2ab0', '#c8502a', '#1f8c9a', '#b81e5a'];
  g.save(); lancetPath(g, x + 4, y + 4, w - 8, h - 8); g.clip();
  g.fillStyle = '#1d3c9a'; g.fillRect(x, y, w, h);
  for (let i = 0; i < 160; i++) { g.fillStyle = `hsla(${200 + r() * 50},70%,${35 + r() * 30}%,.6)`; g.fillRect(x + r() * w, y + r() * h, 6, 6); }
  g.fillStyle = '#b8282a'; g.fillRect(x + 4, y, 9, h); g.fillRect(x + w - 13, y, 9, h);
  for (let yy = y; yy < y + h; yy += 22) { g.fillStyle = '#e8c040'; g.fillRect(x + 4, yy, 9, 8); g.fillRect(x + w - 13, yy, 9, 8); }
  const n = 3, ph = (h - 60) / n;
  for (let i = 0; i < n; i++) {
    const cy = y + 60 + ph * i, cx = x + w / 2;
    // 닫집(캐노피) 뾰족 아치
    g.fillStyle = '#e8dcb0'; g.beginPath(); g.moveTo(cx - w * 0.36, cy + 26); g.lineTo(cx, cy + 2); g.lineTo(cx + w * 0.36, cy + 26); g.closePath(); g.fill();
    g.fillStyle = '#7a1e2a'; g.fillRect(cx - w * 0.33, cy + 26, w * 0.66, ph - 34);
    // 후광 + 얼굴
    g.fillStyle = '#f2c84a'; g.beginPath(); g.arc(cx, cy + 46, 15, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f2d6b8'; g.beginPath(); g.arc(cx, cy + 47, 8, 0, Math.PI * 2); g.fill();
    // 옷 (사다리꼴 + 망토)
    const c = robes[(k + i * 3) % robes.length];
    g.fillStyle = c; g.beginPath(); g.moveTo(cx - 10, cy + 58); g.lineTo(cx + 10, cy + 58); g.lineTo(cx + 22, cy + ph - 14); g.lineTo(cx - 22, cy + ph - 14); g.closePath(); g.fill();
    g.fillStyle = robes[(k + i * 3 + 4) % robes.length]; g.beginPath(); g.moveTo(cx - 10, cy + 60); g.lineTo(cx - 24, cy + ph - 16); g.lineTo(cx - 8, cy + ph - 16); g.closePath(); g.fill();
    g.fillStyle = '#f2ead0'; g.fillRect(cx - 3, cy + 64, 6, ph - 84);
    g.strokeStyle = '#141418'; g.lineWidth = 2; g.strokeRect(cx - w * 0.33, cy + 26, w * 0.66, ph - 34);
    g.fillStyle = '#e8c040'; g.fillRect(cx - w * 0.33, cy + ph - 12, w * 0.66, 6);
  }
  g.restore();
  g.strokeStyle = '#141418'; g.lineWidth = 5; lancetPath(g, x + 4, y + 4, w - 8, h - 8); g.stroke();
  g.lineWidth = 2; for (let yy = y + 70; yy < y + h; yy += 48) { g.beginPath(); g.moveTo(x + 6, yy); g.lineTo(x + w - 6, yy); g.stroke(); }
}
function drawRose(g, x, y, s, k) {
  const cx = x + s / 2, cy = y + s / 2, R = s / 2 - 6;
  const A = k ? ['#c82a3a', '#2a52c0', '#e8b828', '#2a8a4a'] : ['#2a52c0', '#c82a3a', '#9a3cc4', '#e8b828'];
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#1a2a6a'; g.fillRect(x, y, s, s);
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
    // 꽃잎 (바깥 고리)
    g.fillStyle = A[i % 2]; g.beginPath(); g.moveTo(cx + Math.cos(a0) * R * 0.42, cy + Math.sin(a0) * R * 0.42); g.arc(cx, cy, R * 0.96, a0, a1); g.closePath(); g.fill();
    g.fillStyle = '#f4ecd0'; g.beginPath(); g.ellipse(cx + Math.cos(am) * R * 0.68, cy + Math.sin(am) * R * 0.68, R * 0.17, R * 0.09, am, 0, Math.PI * 2); g.fill();
    g.fillStyle = A[2 + (i % 2)]; g.beginPath(); g.arc(cx + Math.cos(am) * R * 0.68, cy + Math.sin(am) * R * 0.68, R * 0.06, 0, Math.PI * 2); g.fill();
    g.fillStyle = A[(i + 1) % 2 + 2]; g.beginPath(); g.arc(cx + Math.cos(a0) * R * 0.9, cy + Math.sin(a0) * R * 0.9, R * 0.08, 0, Math.PI * 2); g.fill();
  }
  quatrefoil(g, cx, cy, R * 0.4, A[2], A[0], '#141418');
  g.restore();
  g.strokeStyle = '#141418'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.42, cy + Math.sin(a) * R * 0.42); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
  g.beginPath(); g.arc(cx, cy, R * 0.42, 0, Math.PI * 2); g.stroke();
}

let cache = null;
export function glassAtlas() {
  if (cache) return cache;
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  const g = c.getContext('2d');
  g.clearRect(0, 0, AW, AH);
  const C = CELLS;
  for (let k = 0; k < 8; k++) drawPair(g, C.pair.x + k * 256 + 6, C.pair.y + 6, 244, 500, PAL[k], 7 + k * 31);
  for (let k = 0; k < 8; k++) drawApse(g, C.apse.x + k * 128, C.apse.y, 128, 512, k);
  for (let k = 0; k < 2; k++) {
    const P = PAL[k ? 5 : 1], x = C.cler.x + k * 256, w = 100;
    fillGeoLancet(g, x + 22, C.cler.y + 30, w, 476, P, 300 + k);
    fillGeoLancet(g, x + 134, C.cler.y + 30, w, 476, P, 340 + k);
  }
  // 바깥 창틀 (밝은 회색 돌 + 안쪽 어두운 홈)
  const frame = (x, y, w, h, pair) => {
    g.fillStyle = '#c9c4ba'; lancetPath(g, x, y, w, h); g.fill();
    g.fillStyle = '#9d988f'; lancetPath(g, x + 6, y + 6, w - 12, h - 10); g.fill();
    g.fillStyle = '#2a2622';
    if (pair) { lancetPath(g, x + w * 0.12, y + h * 0.24, w * 0.34, h * 0.74); g.fill(); lancetPath(g, x + w * 0.54, y + h * 0.24, w * 0.34, h * 0.74); g.fill(); g.beginPath(); g.arc(x + w / 2, y + h * 0.13, w * 0.15, 0, Math.PI * 2); g.fill(); }
    else { lancetPath(g, x + w * 0.16, y + 14, w * 0.68, h - 22); g.fill(); }
  };
  frame(C.framePair.x + 4, C.framePair.y + 4, 248, 506, true);
  frame(C.frameOne.x + 4, C.frameOne.y + 4, 120, 506, false);
  // 종루 루버 (어두운 나무 가로살)
  { const { x, y } = C.louver; g.fillStyle = '#c9c4ba'; lancetPath(g, x + 4, y + 4, 120, 506); g.fill(); g.save(); lancetPath(g, x + 16, y + 20, 96, 484); g.clip(); g.fillStyle = '#1e1a18'; g.fillRect(x, y, 128, 512); g.fillStyle = '#5a4a3c'; for (let yy = y + 30; yy < y + 512; yy += 22) g.fillRect(x, yy, 128, 10); g.restore(); }
  for (let k = 0; k < 2; k++) drawRose(g, C.rose.x + k * 512, C.rose.y, 512, k);
  { const { x, y } = C.frameRose; g.fillStyle = '#c9c4ba'; g.beginPath(); g.arc(x + 256, y + 256, 250, 0, Math.PI * 2); g.fill(); g.fillStyle = '#9d988f'; g.beginPath(); g.arc(x + 256, y + 256, 236, 0, Math.PI * 2); g.fill(); }
  // 시계 (흰 판 + 로마 숫자 대신 막대 + 바늘 10:10)
  { const { x, y } = C.clock, cx = x + 128, cy = y + 128;
    g.fillStyle = '#c9c4ba'; g.beginPath(); g.arc(cx, cy, 124, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4f0e4'; g.beginPath(); g.arc(cx, cy, 104, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1e1e22'; g.lineWidth = 7;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80); g.lineTo(cx + Math.cos(a) * 98, cy + Math.sin(a) * 98); g.stroke(); }
    g.lineWidth = 10; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - 44, cy - 30); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 60, cy - 50); g.stroke();
    g.fillStyle = '#1e1e22'; g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fill(); }
  // 세 갈래 창 (익랑 끝)
  { const { x, y } = C.triple; fillGeoLancet(g, x + 10, y + 120, 70, 386, PAL[4], 500); fillGeoLancet(g, x + 93, y + 20, 70, 486, PAL[0], 510); fillGeoLancet(g, x + 176, y + 120, 70, 386, PAL[4], 520); }
  for (let k = 0; k < 2; k++) fillGeoLancet(g, C.one.x + k * 128 + 14, C.one.y + 8, 100, 244, PAL[k ? 6 : 3], 600 + k);

  // 흐린 사본 (빛 조각): 작게 줄여 퍼지게 + 색을 진하게
  const b = document.createElement('canvas'); b.width = 512; b.height = 384;
  const bg = b.getContext('2d');
  bg.filter = 'blur(3px) saturate(1.6)';
  bg.drawImage(c, 0, 0, 512, 384);
  bg.filter = 'none';
  cache = {
    canvas: c, blur: b,
    cell(name, k = 0) {
      const q = CELLS[name]; const i = k % q.n;
      const x0 = q.x + i * q.w, y0 = q.y;
      return [x0 / AW, 1 - (y0 + q.h) / AH, (x0 + q.w) / AW, 1 - y0 / AH];
    },
  };
  return cache;
}
