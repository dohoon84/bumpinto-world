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
  const [c, g] = cv(256); const r = mulberry(61);
  g.fillStyle = '#0d0d10'; g.fillRect(0, 0, 256, 256);
  const cols = ['#e8e4d8', '#9ea1a8', '#2a2a34', '#c9b27a', '#5b5f6a'];
  for (let i = 0; i < 700; i++) { g.fillStyle = cols[(r() * cols.length) | 0]; g.globalAlpha = 0.5 + r() * 0.5; const s = 1 + r() * 3.5; g.save(); g.translate(r() * 256, r() * 256); g.rotate(r() * 6.3); g.fillRect(0, 0, s * 1.6, s); g.restore(); }
  g.globalAlpha = 1; return tex(c);
}
/** 회색 털 카펫 / 인조모피 느낌 */
export function shagTex(base = '#6d7078') {
  const [c, g] = cv(256); const r = mulberry(71);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 90 + r() * 120; g.fillStyle = `rgba(${v},${v},${v + 8},${0.2 + r() * 0.5})`; g.fillRect(r() * 256, r() * 256, 1.5, 1.5 + r() * 1.5); }
  for (let i = 0; i < 600; i++) { const cols = ['#c0502f', '#d6b24a', '#3b6fa6', '#e8e4d8', '#2f2f35']; g.fillStyle = cols[(r() * 5) | 0]; g.fillRect(r() * 256, r() * 256, 2, 2); }
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
export function mottledTex(a = '#b9b98f', b = '#8d9456') {
  const [c, g] = cv(256); const r = mulberry(91);
  g.fillStyle = a; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 80; i++) { const x = r() * 256, y = r() * 256, rad = 8 + r() * 28; const gr = g.createRadialGradient(x, y, 1, x, y, rad); gr.addColorStop(0, b); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = 0.35; g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  g.globalAlpha = 1; noise(g, 256, 256, r, 3000, 0.05, 0.18, 150, 60); return tex(c);
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
  const [c, g] = cv(128, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  if (night) { gr.addColorStop(0, '#ffe2a8'); gr.addColorStop(1, '#ffcf8a'); } else { gr.addColorStop(0, '#6c9ccb'); gr.addColorStop(0.5, '#8bb4d6'); gr.addColorStop(1, '#4d6f90'); }
  g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
  if (night) { g.fillStyle = 'rgba(255,255,255,0.35)'; for (let y = 8; y < 256; y += 64) g.fillRect(6, y, 116, 3); }
  g.fillStyle = night ? '#6b5a44' : '#2c3b4a'; g.fillRect(0, 0, 4, 256); g.fillRect(124, 0, 4, 256); g.fillRect(0, 0, 128, 5); g.fillRect(0, 251, 128, 5);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(14, 20, 24, 200);
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
  if (night) { gr.addColorStop(0, '#04070f'); gr.addColorStop(0.5, '#0d1830'); gr.addColorStop(0.62, '#23324e'); gr.addColorStop(1, '#2d2f3a'); }
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
