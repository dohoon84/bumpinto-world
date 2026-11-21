// [gentle-monster] 캔버스로 그리는 재질 무늬 (이미지 파일 없음, 처음 한 번만 만들어 쓴다)
import * as THREE from 'three';
import { mulberry } from './geo.js';

function cv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { rep = true, aniso = 4, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
function noise(g, w, h, r, n, a0, a1, lum = 128, spread = 40, tint = [1, 1, 1]) {
  for (let i = 0; i < n; i++) {
    const v = lum + (r() - 0.5) * spread, a = a0 + r() * (a1 - a0);
    g.fillStyle = `rgba(${v * tint[0] | 0},${v * tint[1] | 0},${v * tint[2] | 0},${a})`;
    const s = 1 + r() * 2.2; g.fillRect(r() * w, r() * h, s, s);
  }
}

/** 노출 콘크리트 거푸집 판 (1 repeat = 2.4m × 1.2m 패널 2×2) — 가는 줄눈 + 타이홀 */
export function concreteTex() {
  const [c, g] = cv(512); const r = mulberry(11);
  g.fillStyle = '#b4b2ad'; g.fillRect(0, 0, 512, 512);
  // 큰 얼룩
  for (let i = 0; i < 60; i++) { const x = r() * 512, y = r() * 512, rad = 30 + r() * 90; const gr = g.createRadialGradient(x, y, 1, x, y, rad); const v = r() < 0.5 ? 255 : 90; gr.addColorStop(0, `rgba(${v},${v},${v - 6},${0.05 + r() * 0.05})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  noise(g, 512, 512, r, 9000, 0.05, 0.22, 140, 70);
  // 패널 줄눈
  g.strokeStyle = 'rgba(60,58,54,0.55)'; g.lineWidth = 2;
  for (const p of [0, 256]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 512); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(512, p); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
  for (const p of [2, 258]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 512); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(512, p); g.stroke(); }
  // 타이홀 (패널 모서리 안쪽)
  g.fillStyle = 'rgba(50,48,45,0.7)';
  for (const x of [64, 192, 320, 448]) for (const y of [64, 192, 320, 448]) { g.beginPath(); g.arc(x, y, 3.2, 0, 6.3); g.fill(); g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.arc(x + 1, y + 1, 3.2, 0, 6.3); g.fill(); g.fillStyle = 'rgba(50,48,45,0.7)'; }
  return tex(c);
}
/** 고성능 콘크리트(UHPC) 패널 — 밝은 베이지 회색, 큰 타일 줄눈 (1 repeat = 2 패널) */
export function uhpcTex() {
  const [c, g] = cv(512); const r = mulberry(21);
  g.fillStyle = '#c9c5bc'; g.fillRect(0, 0, 512, 512);
  noise(g, 512, 512, r, 12000, 0.04, 0.16, 150, 60, [1, 0.98, 0.94]);
  for (let i = 0; i < 18; i++) { const x = r() * 512, y = r() * 512, rad = 40 + r() * 80; const gr = g.createRadialGradient(x, y, 1, x, y, rad); gr.addColorStop(0, `rgba(${r() < 0.5 ? 240 : 110},${r() < 0.5 ? 236 : 106},100,0.06)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  g.strokeStyle = 'rgba(70,66,60,0.7)'; g.lineWidth = 3;
  for (const p of [0, 256]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 512); g.stroke(); }
  g.beginPath(); g.moveTo(0, 0); g.lineTo(512, 0); g.stroke(); g.beginPath(); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1.5;
  for (const p of [3, 259]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 512); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(512, p); g.stroke(); }
  return tex(c);
}
/** 세로 홈 콘크리트 (1 repeat = 1.2 m) */
export function flutedTex() {
  const [c, g] = cv(256); const r = mulberry(31);
  g.fillStyle = '#b1afa9'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) { const x = i * 32; const gr = g.createLinearGradient(x, 0, x + 32, 0); gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(0.18, 'rgba(0,0,0,0.0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = gr; g.fillRect(x, 0, 32, 256); }
  noise(g, 256, 256, r, 3500, 0.05, 0.2, 140, 60);
  return tex(c);
}
/** 와플(격자) 슬래브 천장 — 1 repeat = 2.4m × 2.4m (2×2 코퍼), 어두운 오목 + 밝은 보 + 가운데 다운라이트 */
export function waffleTex({ dark = false, lights = true } = {}) {
  const [c, g] = cv(512); const r = mulberry(41);
  const base = dark ? '#262322' : '#a9a8a4', rec = dark ? '#171514' : '#8f8e8a', lit = dark ? '#3a3633' : '#d1d0cb';
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const x = i * 256 + 22, y = j * 256 + 22, w = 212;
    const gr = g.createLinearGradient(x, y, x + w, y + w); gr.addColorStop(0, rec); gr.addColorStop(1, dark ? '#201d1b' : '#9c9b97');
    g.fillStyle = gr; g.fillRect(x, y, w, w);
    // 경사진 오목 가장자리
    g.fillStyle = lit; g.beginPath(); g.moveTo(x - 22, y - 22); g.lineTo(x + w + 22, y - 22); g.lineTo(x + w, y); g.lineTo(x, y); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.moveTo(x, y + w); g.lineTo(x + w, y + w); g.lineTo(x + w + 22, y + w + 22); g.lineTo(x - 22, y + w + 22); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + w); g.lineTo(x - 22, y + w + 22); g.lineTo(x - 22, y - 22); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w + 22, y - 22); g.lineTo(x + w + 22, y + w + 22); g.lineTo(x + w, y + w); g.fill();
    if (lights && (i + j) % 1 === 0 && !(i === 1 && j === 0)) { // 다운라이트
      const cx = x + w / 2, cy = y + w / 2;
      g.fillStyle = 'rgba(255,248,230,0.35)'; g.beginPath(); g.arc(cx, cy, 30, 0, 6.3); g.fill();
      g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(cx, cy, 15, 0, 6.3); g.fill();
    }
  }
  noise(g, 512, 512, r, 6000, 0.03, 0.12, 130, 60);
  return tex(c);
}
/** 연마 콘크리트 바닥 (1 repeat = 4 m, 큰 줄눈 2×2) */
export function polishedTex({ tone = '#a7a6a2', jointed = true } = {}) {
  const [c, g] = cv(512); const r = mulberry(51);
  g.fillStyle = tone; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) { const x = r() * 512, y = r() * 512, rad = 40 + r() * 100; const gr = g.createRadialGradient(x, y, 1, x, y, rad); const v = r() < 0.5 ? 255 : 60; gr.addColorStop(0, `rgba(${v},${v},${v},${0.04 + r() * 0.05})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  noise(g, 512, 512, r, 7000, 0.04, 0.15, 130, 60);
  if (jointed) { g.strokeStyle = 'rgba(40,40,40,0.35)'; g.lineWidth = 2; for (const p of [0, 256]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 512); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(512, p); g.stroke(); } }
  return tex(c);
}
/** 검정 반짝이 테라조 (카운터·2층 바닥) */
export function blackTerrazzoTex() {
  const [c, g] = cv(512); const r = mulberry(61);
  g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, 512, 512);
  const cols = ['#8d8a84', '#5d6068', '#24242b', '#8a7a55', '#3b3e46', '#24242b', '#3b3e46'];
  for (let i = 0; i < 2600; i++) { g.fillStyle = cols[(r() * cols.length) | 0]; g.globalAlpha = 0.35 + r() * 0.5; const s = 0.8 + r() * 2.0; g.save(); g.translate(r() * 512, r() * 512); g.rotate(r() * 6.3); g.fillRect(0, 0, s * 1.6, s); g.restore(); }
  g.globalAlpha = 1; return tex(c);
}
/** 회색 털 카펫 / 인조모피 느낌 */
export function shagTex(base = '#6d7078') {
  const [c, g] = cv(256); const r = mulberry(71);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 90 + r() * 120; g.fillStyle = `rgba(${v},${v},${v + 8},${0.2 + r() * 0.5})`; g.fillRect(r() * 256, r() * 256, 1.5, 1.5 + r() * 1.5); }
  for (let i = 0; i < 120; i++) { const cols = ['#8a8d94', '#5a5d64', '#9a9ca2', '#4a4c52', '#2f2f35']; g.fillStyle = cols[(r() * 5) | 0]; g.fillRect(r() * 256, r() * 256, 2, 2); }
  return tex(c);
}
/** 합판/자작나무 줄무늬 (층판) */
export function plyTex() {
  const [c, g] = cv(256); const r = mulberry(81);
  g.fillStyle = '#d9bf94'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) { const v = 205 + (r() - 0.5) * 30; g.fillStyle = `rgb(${v | 0},${(v * 0.86) | 0},${(v * 0.62) | 0})`; g.fillRect(0, y, 256, 7); g.fillStyle = 'rgba(70,45,20,0.45)'; g.fillRect(0, y + 7, 256, 1); }
  for (let i = 0; i < 400; i++) { g.strokeStyle = `rgba(110,75,40,${0.1 + r() * 0.2})`; g.beginPath(); const x = r() * 256, y = r() * 256; g.moveTo(x, y); g.lineTo(x + 20 + r() * 40, y + (r() - 0.5) * 3); g.stroke(); }
  return tex(c);
}
/** 올리브 커튼 (세로 주름, 1 repeat = 2m) */
export function drapeTex(base = '#87933f') {
  const [c, g] = cv(256); const col = new THREE.Color(base);
  for (let i = 0; i < 16; i++) { const x = i * 16; const gr = g.createLinearGradient(x, 0, x + 16, 0); const hi = col.clone().multiplyScalar(1.25), lo = col.clone().multiplyScalar(0.55); gr.addColorStop(0, '#' + lo.getHexString()); gr.addColorStop(0.5, '#' + hi.getHexString()); gr.addColorStop(1, '#' + lo.getHexString()); g.fillStyle = gr; g.fillRect(x, 0, 16, 256); }
  const gg = g.createLinearGradient(0, 0, 0, 256); gg.addColorStop(0, 'rgba(0,0,0,0.25)'); gg.addColorStop(0.2, 'rgba(0,0,0,0)'); gg.addColorStop(1, 'rgba(0,0,0,0.18)'); g.fillStyle = gg; g.fillRect(0, 0, 256, 256);
  return tex(c);
}
/** 올리브/베이지 얼룩 카펫 (누데이크) */
export function mottledTex(a = '#5d6234', b = '#3c4220') {
  const [c, g] = cv(256); const r = mulberry(91);
  g.fillStyle = a; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 80; i++) { const x = r() * 256, y = r() * 256, rad = 8 + r() * 28; const gr = g.createRadialGradient(x, y, 1, x, y, rad); gr.addColorStop(0, b); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = 0.35; g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  g.globalAlpha = 1; noise(g, 256, 256, r, 3000, 0.05, 0.14, 90, 40, [1, 1.05, 0.7]); return tex(c);
}
/** 흰 자갈 (1 repeat = 3 m) */
export function gravelTex() {
  const [c, g] = cv(512); const r = mulberry(101);
  g.fillStyle = '#d8d6d0'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5200; i++) { const v = 170 + r() * 85; g.fillStyle = `rgb(${v | 0},${(v - 2) | 0},${(v - 8) | 0})`; const s = 2 + r() * 5; g.beginPath(); g.ellipse(r() * 512, r() * 512, s, s * (0.6 + r() * 0.4), r() * 3, 0, 6.3); g.fill(); g.fillStyle = 'rgba(70,66,60,0.25)'; g.beginPath(); g.ellipse(r() * 512 + 1, r() * 512 + 1.5, s * 0.8, s * 0.4, 0, 0, 6.3); g.fill(); }
  return tex(c);
}
export function asphaltTex() {
  const [c, g] = cv(256); const r = mulberry(111);
  g.fillStyle = '#3a3b3f'; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, r, 9000, 0.1, 0.5, 90, 70); return tex(c);
}
/** 보도블록 (1 repeat = 2 m, 20cm 정사각 줄눈 느낌으로 10칸) */
export function paverTex() {
  const [c, g] = cv(256); const r = mulberry(121);
  g.fillStyle = '#9d9a94'; g.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const v = 140 + (r() - 0.5) * 22; g.fillStyle = `rgb(${v | 0},${(v - 2) | 0},${(v - 6) | 0})`; g.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); }
  noise(g, 256, 256, r, 3000, 0.04, 0.12, 130, 40); return tex(c);
}
/** 벽돌 (주변 저층 건물) 1 repeat = 3 m x 3 m */
export function brickTex(base = '#9b5a45') {
  const [c, g] = cv(256); const r = mulberry(131); const col = new THREE.Color(base);
  g.fillStyle = '#6c625a'; g.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 24; j++) for (let i = 0; i < 12; i++) { const off = (j % 2) * 10; const k = 0.82 + r() * 0.3; g.fillStyle = `rgb(${(col.r * 255 * k) | 0},${(col.g * 255 * k) | 0},${(col.b * 255 * k) | 0})`; g.fillRect(i * 21.3 + off - 10, j * 10.6 + 1, 20, 9); }
  return tex(c);
}
/** 주변 건물 창/벽 (연한 회반죽 + 창 줄) */
export function stuccoTex(base = '#d9d4c8', win = '#30363f') {
  const [c, g] = cv(256); const r = mulberry(141);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, r, 3000, 0.04, 0.12, 170, 40);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = '#6e695f'; g.fillRect(i * 64 + 10, j * 64 + 14, 44, 34); g.fillStyle = win; g.fillRect(i * 64 + 12, j * 64 + 16, 40, 30); g.fillStyle = 'rgba(120,150,190,0.35)'; g.fillRect(i * 64 + 12, j * 64 + 16, 40, 10); }
  return tex(c);
}
/** 커튼월 유리: 세로 멀리언 + 층 수평재, 하늘 반사 그라데이션(낮) — UV 0..1 = 한 면 전체, repeat 로 칸 수 조절 */
export function curtainTex({ night = false } = {}) {
  const W = 1024, H = 768, C = 16, R = 6; const [c, g] = cv(W, H); const r = mulberry(231);
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    const xx = x * W / C, yy = y * H / R, w = W / C, h = H / R;
    const lit = r() > 0.2, warm = r() > 0.65, v = 0.6 + r() * 0.4;
    const gr = g.createLinearGradient(xx, yy, xx + w, yy + h);
    if (night) { gr.addColorStop(0, lit ? (warm ? '#f5deb2' : '#e5efe8') : '#1c2630'); gr.addColorStop(0.35, lit ? (warm ? '#b8a080' : '#9eafa9') : '#101922'); gr.addColorStop(1, lit ? '#4b514a' : '#101820'); }
    else { const vv = 1 - y / R * 0.1; gr.addColorStop(0, `rgb(${92 * vv * v | 0},${124 * vv * v | 0},${154 * vv * v | 0})`); gr.addColorStop(0.6, `rgb(${136 * vv * v | 0},${166 * vv * v | 0},${192 * vv * v | 0})`); gr.addColorStop(1, '#5d7890'); } // [v3] 사진처럼 하늘 비친 푸른 유리
    g.fillStyle = gr; g.fillRect(xx, yy, w, h);
    if (night && lit) { g.fillStyle = warm ? '#fff4d4' : '#f4fff7'; g.fillRect(xx + 7, yy + 12, w - 14, 3); g.fillStyle = 'rgba(10,16,18,0.4)'; g.fillRect(xx + 8 + r() * 20, yy + h * 0.6, 8 + r() * 22, h * 0.35); }
    else if (!night) { g.fillStyle = 'rgba(225,240,250,0.12)'; g.fillRect(xx + w * 0.2, yy + 5, w * 0.13, h - 14); }
    g.fillStyle = night ? '#18201f' : '#606c70'; g.fillRect(xx, yy, 2, h); g.fillRect(xx + w - 2, yy, 2, h); g.fillRect(xx, yy + h - 7, w, 7);
    g.fillStyle = night ? '#69736a' : '#a4aba9'; g.fillRect(xx + 2, yy + h - 7, w - 4, 1);
  }
  return tex(c);
}
/** 안내판/사인 텍스트 (흰 글씨, 투명 배경이 아닌 지정 배경) */
export function labelTex(text, { w = 512, h = 128, bg = '#16161a', fg = '#f2f0ea', font = '700 56px system-ui, sans-serif', sub = '', subFont = '500 26px system-ui, sans-serif', align = 'center' } = {}) {
  const [c, g] = cv(w, h);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } else g.clearRect(0, 0, w, h);
  g.fillStyle = fg; g.textBaseline = 'middle'; g.textAlign = align;
  const x = align === 'center' ? w / 2 : align === 'left' ? 24 : w - 24;
  g.font = font; g.fillText(text, x, sub ? h * 0.42 : h / 2);
  if (sub) { g.font = subFont; g.globalAlpha = 0.7; g.fillText(sub, x, h * 0.78); g.globalAlpha = 1; }
  return tex(c, { rep: false });
}
/** 하늘 돔 텍스처 (그라데이션 + 해 + 구름) — 세로로 0..1 (위→아래) */
export function skyTex(night = false) {
  const [c, g] = cv(8, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  if (night) { gr.addColorStop(0, '#040c22'); gr.addColorStop(0.5, '#163b72'); gr.addColorStop(0.62, '#526786'); gr.addColorStop(1, '#9c7764'); }
  else { gr.addColorStop(0, '#3f78c4'); gr.addColorStop(0.45, '#8fbbe6'); gr.addColorStop(0.58, '#d3e4f2'); gr.addColorStop(1, '#c9ccc9'); }
  g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
  return tex(c, { rep: false });
}

/** 와플 천장의 다운라이트만 흰색, 나머지 검정 (emissiveMap) */
export function waffleMaskTex() {
  const [c, g] = cv(512); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { if (i === 1 && j === 0) continue; const cx = i * 256 + 128, cy = j * 256 + 128; g.fillStyle = 'rgb(140,120,90)'; g.beginPath(); g.arc(cx, cy, 30, 0, 6.3); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 15, 0, 6.3); g.fill(); }
  return tex(c);
}

/** 바닥 빛 웅덩이 (가운데 밝고 가장자리 부드럽게, 살짝 링) */
export function poolTex() {
  const [c, g] = cv(256); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.62, 'rgba(255,255,255,0.32)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return tex(c, { rep: false });
}
/** 벽 스캘럽 (다운라이트가 벽에 만드는 포물선 빛) */
export function scallopTex() {
  const [c, g] = cv(128, 256); const gr = g.createRadialGradient(64, 40, 4, 64, 120, 140);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
  const fade = g.createLinearGradient(0, 0, 0, 40); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 0, 128, 40);
  return tex(c, { rep: false });
}

/** 하층 곡면 노출 콘크리트 — 4.8 m 반복, 매끈한 타설면 + 은은한 타설 줄 + 빗물 얼룩 + 희미한 타이홀 */
export function skinTex() {
  const S = 1024; const [c, g] = cv(S); const r = mulberry(171);
  g.fillStyle = '#c3bfb6'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) { const x = r() * S, y = r() * S, rad = 60 + r() * 220; const gr = g.createRadialGradient(x, y, 1, x, y, rad); const v = r() < 0.5 ? 235 : 150; gr.addColorStop(0, `rgba(${v},${v - 2},${v - 8},${0.02 + r() * 0.025})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  // 빗물 얼룩 (세로로 흐린 줄) — 위에서 아래로 옅어진다
  for (let i = 0; i < 70; i++) { const x = r() * S, w = 2 + r() * 10, y = r() * S, h = 80 + r() * 300; const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, `rgba(90,86,80,${0.03 + r() * 0.04})`); gr.addColorStop(1, 'rgba(80,76,70,0)'); g.fillStyle = gr; g.fillRect(x, y, w, h); }
  noise(g, S, S, r, 26000, 0.02, 0.08, 170, 50);
  // 타설 줄 (1.2 m 마다 아주 옅게) + 거푸집 이음 (2.4 m)
  for (let k = 0; k < 4; k++) { const y = k * S / 4 + 1; g.fillStyle = 'rgba(70,66,60,0.16)'; g.fillRect(0, y, S, 2); g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, y + 2, S, 1); }
  for (let k = 0; k < 2; k++) { const x = k * S / 2 + 1; g.fillStyle = 'rgba(70,66,60,0.12)'; g.fillRect(x, 0, 2, S); }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) { const x = (i + 0.5) * S / 4, y = (j + 0.5) * S / 8; g.fillStyle = 'rgba(70,66,60,0.32)'; g.beginPath(); g.arc(x, y, 3.4, 0, 6.3); g.fill(); g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(x + 1.2, y + 1.2, 3, 0, 6.3); g.fill(); }
  return tex(c);
}
/** 세로 리브 띠 (8 홈 / 반복) — color + normal */
export function ribTex({ normal = false } = {}) {
  const W = 256, H = 64; const [c, g] = cv(W, H); const r = mulberry(181);
  const img = g.createImageData(W, H);
  for (let x = 0; x < W; x++) {
    const f = (x % 32) / 32; // 0..1 한 홈
    // 볼록 리브(가운데 0.5)와 사이 좁은 홈
    const d = (f - 0.5) * 2, slope = Math.abs(d) < 0.82 ? -d * 0.9 : (d > 0 ? 1 : -1) * 2.2;
    const shade = Math.abs(d) < 0.82 ? 1 - d * d * 0.18 : 0.62;
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      if (normal) { const nx = slope, l = Math.hypot(nx, 1); img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = 128; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; }
      else { const v = (190 + (r() - 0.5) * 14) * shade; img.data[i] = v; img.data[i + 1] = v * 0.997; img.data[i + 2] = v * 0.99; }
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, { srgb: !normal });
}
/** 알약 창 유리 — 낮: 어두운 실내 + 위쪽 천장 빛 / 밤(emissive): 따뜻한 실내, 천장 띠가 가장 밝다. u = 3.2 m 반복 */
export function pillGlassTex({ night = false } = {}) {
  const [c, g] = cv(256, 128); const r = mulberry(night ? 191 : 193);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  if (night) { gr.addColorStop(0, '#ffe9c4'); gr.addColorStop(0.18, '#fff4dc'); gr.addColorStop(0.32, '#f2c98e'); gr.addColorStop(0.75, '#b9824c'); gr.addColorStop(1, '#6d4a2a'); }
  else { gr.addColorStop(0, '#8b9aa6'); gr.addColorStop(0.25, '#5f6c76'); gr.addColorStop(0.6, '#3a434a'); gr.addColorStop(1, '#2a3036'); }
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  // 실내 실루엣 (진열대·사람·오브제)
  for (let i = 0; i < 14; i++) { const x = r() * 256, w = 6 + r() * 26, h = 24 + r() * 58; g.fillStyle = night ? `rgba(60,36,18,${0.25 + r() * 0.35})` : `rgba(0,0,0,${0.15 + r() * 0.2})`; g.fillRect(x, 128 - h, w, h); }
  if (night) { for (let i = 0; i < 6; i++) { const x = r() * 256; const rg = g.createRadialGradient(x, 18, 1, x, 18, 40); rg.addColorStop(0, 'rgba(255,250,235,0.9)'); rg.addColorStop(1, 'rgba(255,250,235,0)'); g.fillStyle = rg; g.fillRect(x - 40, 0, 80, 60); } }
  return tex(c);
}

/** 성수동 벽돌 외벽 + 창 — 1 repeat = 12 m × 12 m (4×4 칸, 한 칸 = 한 층 3 m). night → 창 emissive 마스크(칸마다 켜짐/꺼짐) */
export function brickFacadeTex({ tone = '#8e4a37', night = false, seed = 201 } = {}) {
  const S = 512, C = S / 4; const [c, g] = cv(S); const r = mulberry(seed), rl = mulberry(seed + 7); const col = new THREE.Color(tone);
  if (night) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); }
  else {
    g.fillStyle = '#6a625b'; g.fillRect(0, 0, S, S);
    const bh = S / 176, bw = S / 44;
    for (let j = 0; j < 176; j++) for (let i = -1; i < 45; i++) { const k = 0.78 + r() * 0.34; g.fillStyle = `rgb(${(col.r * 255 * k) | 0},${(col.g * 255 * k) | 0},${(col.b * 255 * k) | 0})`; g.fillRect(i * bw + (j % 2) * bw / 2 + 0.5, j * bh + 0.5, bw - 1, bh - 1); }
    noise(g, S, S, r, 5000, 0.05, 0.15, 110, 60);
  }
  for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) {
    const ox = cx * C, oy = cy * C, wide = rl() < 0.3;
    const x0 = ox + C * (wide ? 0.12 : 0.27), x1 = ox + C * (wide ? 0.88 : 0.73), y0 = oy + C * 0.24, y1 = oy + C * 0.76;
    if (night) { const lit = rl() < 0.5; if (lit) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, rl() < 0.3 ? '#dfe8ff' : '#ffe0aa'); gr.addColorStop(1, '#b07a44'); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.fillStyle = 'rgba(40,24,10,0.5)'; g.fillRect(x0 + (x1 - x0) * rl() * 0.6, y0, (x1 - x0) * 0.3, y1 - y0); } continue; }
    rl();
    g.fillStyle = '#c9c3b8'; g.fillRect(x0 - 3, y0 - 6, x1 - x0 + 6, 6);
    g.fillStyle = '#bdb8ae'; g.fillRect(x0 - 2, y1, x1 - x0 + 4, 3);
    g.fillStyle = '#262a2e'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(170,195,220,0.6)'); gr.addColorStop(0.5, 'rgba(70,90,110,0.2)'); gr.addColorStop(1, 'rgba(150,175,200,0.45)'); g.fillStyle = gr; g.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
    g.fillStyle = '#dcdad4'; g.fillRect((x0 + x1) / 2 - 1, y0, 2, y1 - y0); g.fillRect(x0, y0, x1 - x0, 2); g.fillRect(x0, y1 - 2, x1 - x0, 2); g.fillRect(x0, y0, 2, y1 - y0); g.fillRect(x1 - 2, y0, 2, y1 - y0);
  }
  return tex(c);
}
/** 1층 카페/편집숍 쇼윈도 — 1 repeat = 12 m × 12 m (가로 4칸; 줄마다 다르게). 위 0.2 는 간판 띠 */
export function shopfrontTex({ night = false } = {}) {
  const S = 512, C = S / 4; const [c, g] = cv(S); const r = mulberry(211);
  g.fillStyle = night ? '#000' : '#1d1e20'; g.fillRect(0, 0, S, S);
  const warm = ['#ffe2b0', '#ffd08a', '#f6eee0', '#ffc98f'];
  for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) {
    const ox = cx * C, oy = cy * C, gy0 = oy + C * 0.22, gy1 = oy + C * 0.98;
    const gr = g.createLinearGradient(0, gy0, 0, gy1);
    if (night) { gr.addColorStop(0, warm[(r() * 4) | 0]); gr.addColorStop(1, '#a8743e'); } else { gr.addColorStop(0, '#b9ab98'); gr.addColorStop(0.5, '#8a7b6a'); gr.addColorStop(1, '#5a4e43'); r(); }
    g.fillStyle = gr; g.fillRect(ox + 4, gy0, C - 8, gy1 - gy0);
    for (let i = 0; i < 3; i++) { const x = ox + 6 + r() * (C - 30), w = 6 + r() * 16, h = 10 + r() * 40; g.fillStyle = night ? 'rgba(90,50,20,0.45)' : 'rgba(20,16,14,0.45)'; g.fillRect(x, gy1 - h, w, h); }
    if (!night) { const rf = g.createLinearGradient(ox, gy0, ox + C, gy1); rf.addColorStop(0, 'rgba(200,215,230,0.35)'); rf.addColorStop(0.45, 'rgba(200,215,230,0.05)'); rf.addColorStop(1, 'rgba(200,215,230,0.25)'); g.fillStyle = rf; g.fillRect(ox + 4, gy0, C - 8, gy1 - gy0); }
    g.fillStyle = night ? '#000' : '#111'; g.fillRect(ox + C / 2 - 2, gy0, 4, gy1 - gy0);
  }
  return tex(c);
}
/** 골함석 창고 벽 (세로 골, 1 repeat = 2 m) */
export function corrugatedTex(base = '#b9bcbc') {
  const [c, g] = cv(128); const r = mulberry(221); const col = new THREE.Color(base);
  for (let x = 0; x < 128; x++) { const k = 0.82 + 0.2 * Math.sin(x / 128 * Math.PI * 2 * 16); g.fillStyle = `rgb(${(col.r * 255 * k) | 0},${(col.g * 255 * k) | 0},${(col.b * 255 * k) | 0})`; g.fillRect(x, 0, 1, 128); }
  for (let i = 0; i < 30; i++) { const x = r() * 128, h = 20 + r() * 90; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(110,70,40,0.25)'); gr.addColorStop(1, 'rgba(110,70,40,0)'); g.fillStyle = gr; g.fillRect(x, r() * 40, 2 + r() * 4, h); }
  return tex(c);
}

// ---------------- 월드 톤(정자·명동과 같은 납작한 색 + 선) ----------------
/** 단색 패널 + 가는 줄눈만 (노이즈 없음). cols×rows 패널 / repeat */
export function panelTex({ base = '#d9d4ca', joint = 'rgba(80,76,70,0.32)', hi = 'rgba(255,255,255,0.22)', cols = 2, rows = 2, dots = false, S = 256 } = {}) {
  const [c, g] = cv(S); g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < cols; i++) { const x = i * S / cols; g.fillStyle = joint; g.fillRect(x, 0, 2, S); g.fillStyle = hi; g.fillRect(x + 2, 0, 1, S); }
  for (let j = 0; j < rows; j++) { const y = j * S / rows; g.fillStyle = joint; g.fillRect(0, y, S, 2); g.fillStyle = hi; g.fillRect(0, y + 2, S, 1); }
  if (dots) { g.fillStyle = joint; for (let i = 0; i < cols * 2; i++) for (let j = 0; j < rows * 2; j++) { g.beginPath(); g.arc((i + 0.5) * S / cols / 2, (j + 0.5) * S / rows / 2, 2.2, 0, 6.3); g.fill(); } }
  return tex(c);
}
/** 주변 건물 외벽(납작한 색) + 창 줄 — 1 repeat = 12 m (4×4 칸 = 층 3 m). night → 켜진 창 마스크 */
export function flatFacadeTex({ wall = '#c9b9a6', win = '#5d7389', frame = '#eeeae2', night = false, seed = 301, wide = 0.3 } = {}) {
  const S = 512, C = S / 4; const [c, g] = cv(S); const rl = mulberry(seed);
  g.fillStyle = night ? '#000' : wall; g.fillRect(0, 0, S, S);
  if (!night) { g.fillStyle = 'rgba(0,0,0,0.07)'; for (let j = 0; j < 4; j++) g.fillRect(0, j * C + C - 6, S, 6); }
  for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) {
    const w = rl() < wide, x0 = cx * C + C * (w ? 0.1 : 0.24), x1 = cx * C + C * (w ? 0.9 : 0.76), y0 = cy * C + C * 0.26, y1 = cy * C + C * 0.74, lit = rl() < 0.55, cool = rl() < 0.3;
    if (night) { if (lit) { g.fillStyle = cool ? '#d9e6ff' : '#ffd99c'; g.fillRect(x0, y0, x1 - x0, y1 - y0); } continue; }
    g.fillStyle = frame; g.fillRect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8);
    g.fillStyle = win; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x0, y0, x1 - x0, (y1 - y0) * 0.22);
    g.fillStyle = frame; g.fillRect((x0 + x1) / 2 - 2, y0, 4, y1 - y0);
  }
  return tex(c);
}
/** 1층 가게 (납작): 밝은 실내 색 + 검정 틀 — 1 repeat = 12 m, 4칸 */
export function flatShopTex({ night = false } = {}) {
  const S = 512, C = S / 4; const [c, g] = cv(S); const r = mulberry(241);
  const inside = ['#f3e3c4', '#efe9dc', '#f5d9b0', '#e6efe9', '#f2dcd0', '#fbefd2'];
  g.fillStyle = night ? '#000' : '#2a2b2e'; g.fillRect(0, 0, S, S);
  for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) {
    const col = inside[(r() * inside.length) | 0], x0 = cx * C + 6, x1 = cx * C + C - 6, y0 = cy * C + C * 0.24, y1 = cy * C + C - 4;
    g.fillStyle = night ? col : col; g.globalAlpha = night ? 1 : 0.85; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.globalAlpha = 1;
    // 진열 실루엣(단색 블록 두세 개)
    for (let i = 0; i < 3; i++) { g.fillStyle = ['#b98b5e', '#7f8c7a', '#c56b4f', '#5d6f86'][(r() * 4) | 0]; const w = 10 + r() * 18, h = 16 + r() * 34, x = x0 + 6 + r() * (x1 - x0 - 30); g.fillRect(x, y1 - h, w, h); }
    g.fillStyle = night ? '#000' : '#2a2b2e'; g.fillRect((x0 + x1) / 2 - 2, y0, 4, y1 - y0);
  }
  return tex(c);
}
/** 성수 동네 간판 아틀라스 (지어낸 상호) — 4×4 칸, 칸 = 256×64 */
export const SIGN_NAMES = [['성수 로스터리', '#1f3a2c', '#f4efe2'], ['빵 굽는 창고', '#f4efe2', '#2a2420'], ['수제화 공방', '#7a2f22', '#f7e9d0'], ['카페 모퉁이', '#e9b949', '#1d1d1d'], ['서울숲 꽃집', '#3f6b45', '#ffffff'], ['연남 아니고 성수', '#16161a', '#f2f0ea'], ['가죽 작업실', '#5a3a24', '#f0dcc0'], ['성수동 국밥', '#c8372d', '#ffffff'], ['편집숍 NOWHERE', '#efefea', '#111111'], ['문구점 연필', '#2c3e8a', '#ffffff'], ['낮술 비스트로', '#6b2140', '#ffe9f0'], ['인쇄소 2F', '#f0f0f0', '#d23b2f'], ['붕어빵 상회', '#f6d26b', '#3b2a14'], ['젤라또 성수', '#f2b8c6', '#4a2a33'], ['자전거 정비', '#20242b', '#f6c344'], ['갤러리 창고', '#ffffff', '#222222']];
export function signAtlasTex() {
  const W = 1024, H = 256; const [c, g] = cv(W, H);
  SIGN_NAMES.forEach(([t, bg, fg], i) => { const x = (i % 4) * 256, y = ((i / 4) | 0) * 64; g.fillStyle = bg; g.fillRect(x, y, 256, 64); g.fillStyle = fg; g.font = '800 30px "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x + 128, y + 33, 236); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + 60, 256, 4); });
  const t = tex(c, { rep: false }); return t;
}
