// [bump24game] 매장 안 간판·가격표·창밖 야경·데칼(그림자/LED 반사)을 한 장(2048×1024)에 — 무광(unlit) 재질 1개 + 데칼 재질 1개가 같이 씀
import * as THREE from 'three';
import { drawLogo } from '../corridor/bp24.js';
import { CATALOG } from './products.js';

const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
export const SIGN = { W: 2048, H: 1024 };
export const R = {
  WHITE: [2, 2, 12, 12], COOL: [18, 2, 12, 12], WARM: [34, 2, 12, 12], LED: [50, 2, 12, 12],
  SOFT: [64, 0, 128, 128], STREAK: [192, 0, 256, 64], ARROW: [448, 0, 128, 128], STICKER: [576, 0, 128, 128],
  RAIL: [704, 0, 256, 32], RAILY: [704, 32, 256, 32], GLOW: [960, 0, 128, 128], POS: [1088, 0, 192, 128],
  CUST: [1280, 0, 128, 64], DOOR: [1408, 0, 256, 64], LOGO: [1664, 0, 256, 256], MENU: [1920, 0, 128, 256],
  EXIT: [1280, 64, 128, 64], WARMGLOW: [1408, 64, 256, 64],
  TEAL: [0, 128, 1024, 96], BEV: [0, 224, 1024, 96], COUNTER: [0, 320, 1024, 160],
  WINE: [1024, 256, 512, 96], ICE: [1024, 352, 512, 96], HOT: [1536, 256, 384, 96], COLD: [1536, 352, 384, 96],
  AISLE0: [1024, 448, 512, 80], AISLE1: [1024, 528, 512, 80], AISLE2: [1024, 608, 512, 80],
  POSTER: [1536, 448, 384, 320], STREET: [0, 480, 1024, 320], SHADE: [1024, 688, 512, 112],
};
const TAG_W = 128, TAG_H = 44, TAG_Y = 800;
export function tagRect(idx, sale) { const k = idx * 2 + (sale ? 1 : 0); return [(k % 16) * TAG_W, TAG_Y + Math.floor(k / 16) * TAG_H, TAG_W, TAG_H]; }
/** 픽셀 사각형 → [u0,v0,u1,v1] (flipY) */
export function uvr(r, inset = 0.5) { return [(r[0] + inset) / SIGN.W, 1 - (r[1] + r[3] - inset) / SIGN.H, (r[0] + r[2] - inset) / SIGN.W, 1 - (r[1] + inset) / SIGN.H]; }
export const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}`;

function rr(ctx, x, y, w, h, r) { const k = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + k, y); ctx.arcTo(x + w, y, x + w, y + h, k); ctx.arcTo(x + w, y + h, x, y + h, k); ctx.arcTo(x, y + h, x, y, k); ctx.arcTo(x, y, x + w, y, k); ctx.closePath(); }
function fit(ctx, t, maxW, size, weight = 900) { let s = size; ctx.font = `${weight} ${s}px ${FONT}`; while (s > 7 && ctx.measureText(t).width > maxW) { s--; ctx.font = `${weight} ${s}px ${FONT}`; } return s; }
function text(ctx, t, x, y, maxW, size, color, { weight = 900, align = 'center', glow = null } = {}) {
  fit(ctx, t, maxW, size, weight); ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = size * 0.35; }
  ctx.fillStyle = color; ctx.fillText(t, x, y); ctx.shadowBlur = 0;
}
function header(ctx, r, bg1, bg2, title, sub, fg = '#fff') {
  const [x, y, w, h] = r;
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, bg1); g.addColorStop(1, bg2);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, y + 4, w, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, y + h - 6, w, 6);
  // 로고 + 제목 + 보조
  ctx.fillStyle = '#fff'; rr(ctx, x + 14, y + h * 0.16, h * 0.68, h * 0.68, h * 0.18); ctx.fill();
  drawLogo(ctx, x + 14 + h * 0.08, y + h * 0.22, h * 0.52);
  text(ctx, title, x + h + 6, y + h * 0.5, w * 0.6, Math.round(h * 0.52), fg, { align: 'left', glow: 'rgba(255,255,255,0.55)' });
  if (sub) text(ctx, sub, x + w - 18, y + h * 0.52, w * 0.32, Math.round(h * 0.3), 'rgba(255,255,255,0.85)', { align: 'right', weight: 700 });
}

export function buildSignAtlas({ storeName = 'BUMP24', saleIds = [] } = {}) {
  const cv = document.createElement('canvas'); cv.width = SIGN.W; cv.height = SIGN.H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, SIGN.W, SIGN.H);
  ctx.clearRect(0, 0, 704, 128); // 데칼 영역은 투명 바탕
  const solid = (r, c) => { ctx.fillStyle = c; ctx.fillRect(...r); };
  solid(R.WHITE, '#ffffff'); solid(R.COOL, '#eaf6ff'); solid(R.WARM, '#ffd9a0'); solid(R.LED, '#ffffff');
  { // 부드러운 사각 그림자(흰색 알파 → 정점색으로 검게)
    const [x, y, w, h] = R.SOFT; const img = ctx.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = Math.abs(i / (w - 1) * 2 - 1), v = Math.abs(j / (h - 1) * 2 - 1);
      const e = Math.max(0, 1 - Math.pow(Math.max(u, v), 3)) * (1 - Math.pow(Math.min(1, Math.hypot(u, v) / 1.414), 6) * 0.3);
      const k = (j * w + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(255 * Math.pow(e, 1.4));
    }
    ctx.putImageData(img, x, y);
  }
  { // LED 바닥 반사 줄: 가운데 밝고 양옆 흐림
    const [x, y, w, h] = R.STREAK; const img = ctx.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const v = Math.abs(j / (h - 1) * 2 - 1), u = Math.abs(i / (w - 1) * 2 - 1);
      const a = Math.exp(-v * v * 9) * (1 - Math.pow(u, 6));
      const k = (j * w + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(255 * a);
    }
    ctx.putImageData(img, x, y);
  }
  { // 노란 아래 화살표(집을 상품 표시)
    const [x, y, w] = R.ARROW; ctx.save(); ctx.translate(x + w / 2, y + 64);
    ctx.beginPath(); ctx.moveTo(-40, -42); ctx.lineTo(40, -42); ctx.lineTo(40, -4); ctx.lineTo(0, 44); ctx.lineTo(-40, -4); ctx.closePath();
    ctx.fillStyle = '#ffd400'; ctx.strokeStyle = '#1a1300'; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-30, -34, 18, 28); ctx.restore();
  }
  { // 2배 스티커(톱니 원)
    const [x, y, w] = R.STICKER; ctx.save(); ctx.translate(x + w / 2, y + w / 2);
    ctx.beginPath(); for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2, r = i % 2 ? 52 : 62; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath();
    ctx.fillStyle = '#ff2d55'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#ffe600'; ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.fill();
    text(ctx, '2배', 0, -2, 70, 40, '#d4003b'); text(ctx, 'SALE', 0, 26, 60, 14, '#d4003b', { weight: 800 });
    ctx.restore();
  }
  { // 가격 레일
    const [x, y, w, h] = R.RAIL; ctx.fillStyle = '#f7f9fb'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#0072DD'; ctx.fillRect(x, y, w, 4); ctx.fillStyle = '#c9d1da'; ctx.fillRect(x, y + h - 3, w, 3);
    const [x2, y2, w2, h2] = R.RAILY; ctx.fillStyle = '#ffe14d'; ctx.fillRect(x2, y2, w2, h2); ctx.fillStyle = '#d6a800'; ctx.fillRect(x2, y2 + h2 - 3, w2, 3);
  }
  { // 냉장 내부 빛(위 밝음)
    const [x, y, w, h] = R.GLOW; const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#eef8ff'); g.addColorStop(1, '#bfe2f5'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    const [x2, y2, w2, h2] = R.WARMGLOW; const g2 = ctx.createLinearGradient(0, y2, 0, y2 + h2); g2.addColorStop(0, '#fff2d0'); g2.addColorStop(1, '#ffb347'); ctx.fillStyle = g2; ctx.fillRect(x2, y2, w2, h2);
  }
  { // POS 화면
    const [x, y, w, h] = R.POS; ctx.fillStyle = '#0d1b2a'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#0072DD'; ctx.fillRect(x, y, w, 22);
    text(ctx, 'BUMP24 POS', x + 8, y + 11, 120, 13, '#fff', { align: 'left' });
    ctx.fillStyle = '#16314d'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 8, y + 30 + i * 18, w - 16, 13);
    ctx.fillStyle = '#ffd400'; ctx.fillRect(x + w - 70, y + h - 26, 62, 18); text(ctx, '결제', x + w - 39, y + h - 17, 60, 12, '#000');
    const [cx, cy, cw, ch] = R.CUST; ctx.fillStyle = '#04121f'; ctx.fillRect(cx, cy, cw, ch); text(ctx, '어서오세요', cx + cw / 2, cy + 20, cw - 10, 16, '#7fd0ff'); text(ctx, 'BUMP24', cx + cw / 2, cy + 44, cw - 10, 14, '#fff');
  }
  { const [x, y, w, h] = R.DOOR; ctx.fillStyle = 'rgba(255,255,255,0.0)'; ctx.clearRect(x, y, w, h); ctx.fillStyle = '#0072DD'; rr(ctx, x + 4, y + 6, w - 8, h - 12, 10); ctx.fill(); text(ctx, '당기세요  PULL', x + w / 2, y + h / 2, w - 24, 26, '#fff'); }
  { const [x, y, w, h] = R.EXIT; ctx.fillStyle = '#0b8f3a'; ctx.fillRect(x, y, w, h); text(ctx, '비상구 EXIT', x + w / 2, y + h / 2, w - 10, 20, '#eaffea', { glow: '#7dff9a' }); }
  { // 로고 판
    const [x, y, w] = R.LOGO; ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, w); drawLogo(ctx, x + 40, y + 24, 176);
    text(ctx, 'BUMP24', x + w / 2, y + 222, w - 30, 34, '#0a1630');
  }
  { // 커피 메뉴
    const [x, y, w, h] = R.MENU; ctx.fillStyle = '#1d1a17'; ctx.fillRect(x, y, w, h);
    text(ctx, 'CAFE BUMP', x + w / 2, y + 22, w - 10, 18, '#ffcf87');
    const m = [['아메리카노', '1,200'], ['카페라떼', '1,800'], ['바닐라라떼', '2,300'], ['아이스티', '1,500'], ['핫초코', '2,000']];
    m.forEach(([a, b], i) => { text(ctx, a, x + 8, y + 56 + i * 34, 72, 13, '#fff', { align: 'left', weight: 700 }); text(ctx, b, x + w - 8, y + 56 + i * 34, 44, 13, '#ffcf87', { align: 'right' }); });
    ctx.fillStyle = '#ffcf87'; ctx.fillRect(x + 8, y + h - 34, w - 16, 2); text(ctx, '얼음 +300', x + w / 2, y + h - 18, w - 10, 12, '#bbb', { weight: 600 });
  }
  header(ctx, R.TEAL, '#13b5a6', '#0a8b80', '샐러드 & 디저트 · 간편식', 'FRESH FOOD');
  header(ctx, R.BEV, '#1580e6', '#0a5bb0', '음료 · 생수 · 커피', 'BEVERAGE');
  header(ctx, R.WINE, '#7a1e3a', '#4c0f22', '와인 · 주류', '19세 미만 판매금지');
  header(ctx, R.ICE, '#3aa6ff', '#1a73d9', '아이스크림', 'ICE ❄');
  header(ctx, R.HOT, '#ff7a1a', '#d84315', 'BUMP 치킨 · 핫바', 'HOT');
  { // 블랙 오픈 냉장고 머리
    const [x, y, w, h] = R.COLD; ctx.fillStyle = '#101317'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#1e88ff'; ctx.fillRect(x, y + h - 8, w, 8);
    text(ctx, 'COLD DRINK', x + w / 2, y + h * 0.45, w - 30, 40, '#5fc3ff', { glow: '#3aa6ff' });
  }
  { // 계산대 앞판
    const [x, y, w, h] = R.COUNTER; const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e8edf2'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#0072DD'; ctx.fillRect(x, y + h - 34, w, 34); ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x, y + h - 40, w, 6);
    drawLogo(ctx, x + 40, y + 22, 84);
    text(ctx, 'BUMP24', x + 140, y + 54, 280, 50, '#0a1630', { align: 'left' });
    text(ctx, '계산하는 곳 · 봉투 있어요', x + 140, y + 98, 420, 24, '#4a5a6d', { align: 'left', weight: 700 });
    text(ctx, storeName, x + w - 30, y + h - 17, 520, 20, '#fff', { align: 'right', weight: 800 });
    text(ctx, '24시간 영업', x + 30, y + h - 17, 300, 18, '#cfe6ff', { align: 'left', weight: 800 });
  }
  ['라면 · 과자', '과자 · 음료 파우치', '라면 · 스낵'].forEach((t, i) => {
    const [x, y, w, h] = R[`AISLE${i}`]; ctx.fillStyle = '#2a3340'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#ffd400'; ctx.fillRect(x, y, 16, h);
    text(ctx, `${i + 1}`, x + 46, y + h / 2, 40, 40, '#ffd400'); text(ctx, t, x + 80, y + h / 2, w - 100, 34, '#fff', { align: 'left' });
  });
  { // 포스터: 오늘의 2배 상품
    const [x, y, w, h] = R.POSTER; ctx.fillStyle = '#ffe600'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ff2d55'; ctx.fillRect(x, y, w, 70); text(ctx, '오늘만 2배!', x + w / 2, y + 36, w - 30, 44, '#fff');
    const sale = saleIds.map((id) => CATALOG.find((p) => p.id === id)).filter(Boolean);
    sale.forEach((p, i) => {
      const yy = y + 98 + i * 92; ctx.fillStyle = p.color; rr(ctx, x + 20, yy, 70, 70, 12); ctx.fill();
      text(ctx, p.name.slice(0, 2), x + 55, yy + 35, 60, 26, '#fff');
      text(ctx, p.name, x + 106, yy + 22, w - 130, 28, '#1a1300', { align: 'left' });
      text(ctx, `${won(p.price)}원 → 점수 2배`, x + 106, yy + 54, w - 130, 20, '#d4003b', { align: 'left', weight: 800 });
    });
    text(ctx, 'BUMP24 30초 장보기', x + w / 2, y + h - 22, w - 30, 20, '#1a1300', { weight: 800 });
  }
  { // 창밖 밤거리
    const [x, y, w, h] = R.STREET; const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#081226'); g.addColorStop(0.55, '#1a2a4a'); g.addColorStop(0.62, '#2b3550'); g.addColorStop(1, '#1d222c'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9; i++) { // 맞은편 건물
      const bx = x + i * 118 + rnd() * 20, bw = 90 + rnd() * 40, bh = 90 + rnd() * 90, by = y + h * 0.6 - bh;
      ctx.fillStyle = `hsl(220,22%,${10 + rnd() * 8}%)`; ctx.fillRect(bx, by, bw, bh);
      for (let wy = by + 8; wy < by + bh - 10; wy += 16) for (let wx = bx + 6; wx < bx + bw - 10; wx += 14) if (rnd() < 0.45) { ctx.fillStyle = rnd() < 0.7 ? '#ffd98a' : '#9fd4ff'; ctx.fillRect(wx, wy, 8, 9); }
      if (rnd() < 0.6) { const cs = ['#ff3b6b', '#3aa6ff', '#ffd400', '#7dff9a']; ctx.fillStyle = cs[i % 4]; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14; ctx.fillRect(bx + 8, by + bh - 34, bw - 16, 16); ctx.shadowBlur = 0; }
    }
    ctx.fillStyle = '#2c2f36'; ctx.fillRect(x, y + h * 0.62, w, h * 0.38); // 도로
    ctx.fillStyle = '#4a4e57'; ctx.fillRect(x, y + h * 0.62, w, 10); // 연석
    ctx.fillStyle = '#e8e2c0'; for (let i = 0; i < 12; i++) ctx.fillRect(x + i * 90 + 20, y + h * 0.82, 46, 5);
    for (let i = 0; i < 5; i++) { // 가로등
      const lx = x + 80 + i * 220; ctx.fillStyle = '#3a3f4a'; ctx.fillRect(lx, y + h * 0.22, 5, h * 0.42);
      const rg = ctx.createRadialGradient(lx + 2, y + h * 0.22, 2, lx + 2, y + h * 0.22, 60); rg.addColorStop(0, 'rgba(255,230,170,0.95)'); rg.addColorStop(1, 'rgba(255,230,170,0)'); ctx.fillStyle = rg; ctx.fillRect(lx - 60, y + h * 0.22 - 60, 124, 120);
    }
    for (let i = 0; i < 4; i++) { // 지나가는 차 불빛
      const cx = x + 120 + i * 250; ctx.fillStyle = 'rgba(255,60,60,0.9)'; ctx.beginPath(); ctx.arc(cx, y + h * 0.75, 4, 0, 7); ctx.arc(cx + 40, y + h * 0.75, 4, 0, 7); ctx.fill();
    }
  }
  { // 어두운 그라데이션(선반 밑·벽 바닥 AO 띠, 위 투명 → 아래 검정)
    const [x, y, w, h] = R.SHADE; ctx.clearRect(x, y, w, h); const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  // 가격표 (흰/노랑 일반, 빨강 할인)
  for (const p of CATALOG) for (const sale of [false, true]) {
    const [x, y, w, h] = tagRect(p.idx, sale);
    ctx.fillStyle = sale ? '#ff2d55' : (p.idx % 3 === 0 ? '#ffe14d' : '#ffffff'); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = sale ? '#ffe600' : '#0072DD'; ctx.fillRect(x + 1, y + 1, 6, h - 2);
    text(ctx, p.name, x + 12, y + 12, w - 20, 13, sale ? '#fff' : '#33404f', { align: 'left', weight: 700 });
    text(ctx, `${won(p.price)}`, x + w - 22, y + 31, w - 40, 24, sale ? '#fff' : '#0a1630', { align: 'right' });
    text(ctx, '원', x + w - 6, y + 34, 16, 12, sale ? '#fff' : '#33404f', { align: 'right', weight: 700 });
    if (sale) text(ctx, '2배', x + 26, y + 31, 30, 16, '#ffe600');
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, canvas: cv };
}

export function buildFloorTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#b9c0c7'; c.fillRect(0, 0, 256, 256);
  let s = 3; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const g = c.createLinearGradient(i * 128, j * 128, i * 128 + 128, j * 128 + 128); const b = 238 + rnd() * 8;
    g.addColorStop(0, `rgb(${b},${b + 1},${b + 2})`); g.addColorStop(1, `rgb(${b - 8},${b - 7},${b - 5})`);
    c.fillStyle = g; c.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
    for (let k = 0; k < 90; k++) { c.fillStyle = `rgba(120,130,140,${rnd() * 0.08})`; c.fillRect(i * 128 + 2 + rnd() * 124, j * 128 + 2 + rnd() * 124, 2, 2); }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
