// [myeongdong-detail] 1층 가게 실내: 가게 종류(화장품·옷·신발·카페·환전·편의점·약국·기념품·식당)별 방 그림을
//   아틀라스 한 장(2048×1280, 4×4 칸)에 그리고, 쇼윈도 사각형 하나에 "인테리어 매핑"(시선→가상 방 상자 교차)으로
//   안쪽 벽·옆 벽·바닥·천장을 입체처럼 보여 준다. 실제 기하는 사각형 하나 → 가게 전체가 draw 1.
//   밤 번짐: 예전엔 Lambert(햇빛) + emissive 1.2 를 더해 하얗게 떴다. 이제 MeshBasic(조명 무관)에 밝기 계수만 곱해 1 을 넘지 않는다.
//   상호·문구는 모두 지어낸 것(실제 브랜드 아님).
import * as THREE from 'three';
import { MD_FONT } from './myeongdongAtlas.js';

export const ROOM_COLS = 4, ROOM_ROWS = 4, TILE_W = 512, TILE_H = 320;
// 칸 안 하위 사각형 [x, y, w, h] (px, 위가 0)
const R_BACK = [4, 4, 240, 152], R_FRONT = [260, 4, 240, 152], R_SIDE = [4, 164, 160, 152], R_FLOOR = [172, 164, 160, 152], R_CEIL = [340, 164, 160, 152];

// 가게 종류 → 방 칸 번호
export const SHOP_ROOMS = {
  beauty: [0, 1, 2, 3, 4],
  fashion: [5, 6, 15],
  shoes: [7],
  cafe: [8, 9],
  exchange: [10],
  convenience: [11],
  pharmacy: [12],
  souvenir: [13],
  restaurant: [14],
};
export const SHOP_TYPES = Object.keys(SHOP_ROOMS);

function rnd32(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
function txt(g, s, x, y, size, color, weight = 900, align = 'center') {
  g.font = `${weight} ${size}px ${MD_FONT}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
}
function grad(g, x, y, w, h, c0, c1, vertical = true) {
  const gr = vertical ? g.createLinearGradient(x, y, x, y + h) : g.createLinearGradient(x, y, x + w, y);
  gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(x, y, w, h);
}
/** 화장품 병·튜브·상자 한 줄 */
function products(g, x0, x1, base, hMax, r, pal) {
  for (let x = x0; x < x1 - 3;) {
    const w = 3 + r() * 4, h = hMax * (0.45 + r() * 0.55), c = pal[Math.floor(r() * pal.length)];
    const kind = r();
    g.fillStyle = c;
    if (kind < 0.45) { g.fillRect(x, base - h, w, h); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x, base - h, w, 1.5); }
    else if (kind < 0.75) { g.fillRect(x, base - h * 0.75, w, h * 0.75); g.fillStyle = r() < 0.5 ? '#2b2b2b' : '#e8e2d8'; g.fillRect(x + w * 0.25, base - h, w * 0.5, h * 0.25); }
    else { g.fillRect(x, base - h * 0.6, w + 2, h * 0.6); g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(x, base - h * 0.6, 1, h * 0.6); x += 2; }
    x += w + 0.8 + r() * 1.2;
  }
}
function shelves(g, x, y, w, h, rows, r, pal, board = '#f4f1ec', hMax = null) {
  const step = h / rows;
  for (let k = 0; k < rows; k++) {
    const by = y + step * (k + 1) - 2;
    products(g, x + 2, x + w - 2, by, hMax ?? step * 0.72, r, pal);
    g.fillStyle = board; g.fillRect(x, by, w, 3);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, by + 3, w, 1);
  }
}
function lightPanels(g, [x, y, w, h], base, lamp, n = 3, round = false) {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) {
    const cx = x + (i + 0.5) * w / n, cy = y + (j + 0.5) * h / 3;
    g.fillStyle = lamp;
    if (round) { g.beginPath(); g.arc(cx, cy, 6, 0, 6.3); g.fill(); }
    else g.fillRect(cx - w / n * 0.32, cy - 3, w / n * 0.64, 6);
  }
}
function tiles(g, [x, y, w, h], c0, c1, n = 6, line = 'rgba(0,0,0,.12)') {
  grad(g, x, y, w, h, c0, c1);
  g.strokeStyle = line; g.lineWidth = 1;
  for (let i = 1; i < n; i++) { g.beginPath(); g.moveTo(x + i * w / n, y); g.lineTo(x + i * w / n, y + h); g.stroke(); g.beginPath(); g.moveTo(x, y + i * h / n); g.lineTo(x + w, y + i * h / n); g.stroke(); }
}
function planks(g, [x, y, w, h], c, r) {
  g.fillStyle = c; g.fillRect(x, y, w, h);
  for (let i = 0; i < w; i += 14) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + r() * 0.08})`; g.fillRect(x + i, y, 13, h); }
}
/** 앞 유리(알파): 창틀·문·스티커. a = 0 인 곳 = 유리 너머 실내 */
function front(g, [x, y, w, h], { frame = '#2a2c30', door = 0.62, stickers = [], kick = '#2a2c30', band = null }, r) {
  g.clearRect(x, y, w, h);
  g.fillStyle = frame;
  g.fillRect(x, y, w, 6); g.fillRect(x, y, 4, h); g.fillRect(x + w - 4, y, 4, h);
  g.fillStyle = kick; g.fillRect(x, y + h - 14, w, 14);
  if (band) { g.fillStyle = band; g.fillRect(x, y + 6, w, 9); }
  // 문(양쪽 틀 + 손잡이)
  const dx = x + w * door, dw = w * 0.24;
  g.fillStyle = frame; g.fillRect(dx - 2, y + 22, 4, h - 36); g.fillRect(dx + dw - 2, y + 22, 4, h - 36); g.fillRect(dx - 2, y + 20, dw + 4, 4);
  g.fillStyle = '#c9ccd1'; g.fillRect(dx + dw * 0.5 - 6, y + h * 0.52, 3, 18); g.fillRect(dx + dw * 0.5 + 3, y + h * 0.52, 3, 18);
  // 창 칸 나눔
  if (door > 0.5) { g.fillStyle = frame; g.fillRect(x + w * 0.31, y + 6, 3, h - 20); }
  else { g.fillStyle = frame; g.fillRect(x + w * 0.62, y + 6, 3, h - 20); }
  // 유리 반사 줄
  g.fillStyle = 'rgba(255,255,255,.10)';
  g.beginPath(); g.moveTo(x + w * 0.05, y + h - 14); g.lineTo(x + w * 0.2, y + 6); g.lineTo(x + w * 0.26, y + 6); g.lineTo(x + w * 0.11, y + h - 14); g.fill();
  for (const s of stickers) s(g, x, y, w, h, r);
}
const sticker = (text, bg, fg, fx, fy, size = 16, rot = 0) => (g, x, y, w, h) => {
  g.save(); g.translate(x + w * fx, y + h * fy); g.rotate(rot);
  g.font = `900 ${size}px ${MD_FONT}`; const tw = g.measureText(text).width + 12;
  g.fillStyle = bg; g.fillRect(-tw / 2, -size * 0.75, tw, size * 1.5);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, 1);
  g.restore();
};
const roundSticker = (text, bg, fg, fx, fy, rad = 17) => (g, x, y, w, h) => {
  g.fillStyle = bg; g.beginPath(); g.arc(x + w * fx, y + h * fy, rad, 0, 6.3); g.fill();
  txt(g, text, x + w * fx, y + h * fy + 1, rad * 0.78, fg);
};

// ---------- 종류별 방 ----------
function beautyRoom(g, sub, i, r) {
  const pals = [
    ['#ffd6e7', '#ff7eb6', '#e8457c'], ['#d9fbf1', '#2fc4a0', '#0b8f72'], ['#ece4ff', '#9b7bff', '#5b3cc4'], ['#fff0e2', '#ff9a6b', '#d9603a'], ['#f6f3f0', '#e60012', '#222222'],
  ];
  const [wall, acc, deep] = pals[i % pals.length];
  const prod = [acc, deep, '#ffffff', '#f7c6da', '#ffe169', '#9fd8ff', '#b9f2c9', '#e8e2d8', '#ff4f9a', '#7ad3ff'];
  const heads = [['SKIN CARE', '스킨케어'], ['MASK PACK', '마스크팩'], ['MAKE UP', '메이크업'], ['SUN CARE', '선케어'], ['TAX FREE', '면세 즉시환급']][i % 5];
  // 안쪽 벽: 파스텔 벽 + 흰 선반 제품 벽 + 위 조명 띠
  const [bx, by, bw, bh] = sub.back;
  grad(g, bx, by, bw, bh, wall, '#f3efe9');
  g.fillStyle = deep; g.fillRect(bx, by, bw, 22);
  txt(g, heads[0], bx + bw * 0.3, by + 11, 13, '#ffffff'); txt(g, heads[1], bx + bw * 0.74, by + 11, 12, '#ffffff', 800);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(bx, by + 22, bw, 3);
  shelves(g, bx + 6, by + 28, bw * 0.42, bh - 62, 4, r, prod, '#ffffff');
  shelves(g, bx + bw * 0.56, by + 28, bw * 0.42, bh - 62, 4, r, prod, '#ffffff');
  // 가운데 홍보 패널(모델 사진 느낌: 동그라미 얼굴 + 제품 큰 병)
  const px = bx + bw * 0.44, pw = bw * 0.12;
  grad(g, px, by + 30, pw, bh - 66, acc, deep);
  g.fillStyle = '#ffe9de'; g.beginPath(); g.arc(px + pw / 2, by + 55, 8, 0, 6.3); g.fill();
  g.fillStyle = '#ffffff'; g.fillRect(px + pw / 2 - 4, by + 72, 8, 30);
  // 계산대 + 직원(바구니 든 사람 실루엣)
  g.fillStyle = '#ffffff'; g.fillRect(bx + bw * 0.08, by + bh - 34, bw * 0.3, 26); g.fillStyle = acc; g.fillRect(bx + bw * 0.08, by + bh - 34, bw * 0.3, 4);
  for (const [fx, c] of [[0.62, '#222'], [0.78, deep]]) {
    const cx = bx + bw * fx; g.fillStyle = c; g.fillRect(cx - 5, by + bh - 50, 10, 26); g.fillStyle = '#3a3a3a'; g.fillRect(cx - 4, by + bh - 24, 3, 18); g.fillRect(cx + 1, by + bh - 24, 3, 18);
    g.fillStyle = '#f1c9a5'; g.beginPath(); g.arc(cx, by + bh - 56, 5, 0, 6.3); g.fill(); g.fillStyle = '#1b1b1b'; g.fillRect(cx - 5, by + bh - 62, 10, 4);
    g.fillStyle = '#ff3f7f'; g.fillRect(cx + 5, by + bh - 36, 9, 7); // 장바구니
  }
  g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(bx, by + bh - 8, bw, 8);
  // 옆 벽: 제품 벽 계속 + 'BEST' 기둥
  const [sx, sy, sw, sh] = sub.side;
  grad(g, sx, sy, sw, sh, wall, '#efe9e2');
  g.fillStyle = deep; g.fillRect(sx, sy, sw, 16);
  txt(g, 'BEST · NEW', sx + sw / 2, sy + 8, 10, '#fff');
  shelves(g, sx + 4, sy + 20, sw - 8, sh - 36, 5, r, prod, '#ffffff');
  // 바닥: 광택 흰 타일 / 천장: 흰 판 + 줄 조명
  tiles(g, sub.floor, '#f4f1ee', '#d9d3cd', 5);
  // 가운데 진열 테이블(바닥 무늬로)
  const [fx, fy, fw, fh] = sub.floor; g.fillStyle = acc; g.globalAlpha = 0.55; g.fillRect(fx + fw * 0.3, fy + fh * 0.35, fw * 0.4, fh * 0.3); g.globalAlpha = 1;
  lightPanels(g, sub.ceil, '#f6f4f1', '#fffdf6', 2);
  // 앞 유리 스티커
  const st = [
    [sticker('1+1', '#e60012', '#fff', 0.16, 0.74, 18), roundSticker('免税', '#ffe169', '#e60012', 0.88, 0.3)],
    [sticker('SALE 50%', deep, '#fff', 0.15, 0.78, 13), sticker('TAX FREE', '#ffffff', '#e60012', 0.86, 0.7, 11)],
    [sticker('2+1', '#ff2d55', '#fff', 0.14, 0.72, 18), sticker('MASK 10+10', '#ffffff', deep, 0.88, 0.82, 10)],
    [roundSticker('1+1', '#ff2d55', '#fff', 0.14, 0.7, 18), sticker('WELCOME 欢迎', '#ffffff', deep, 0.86, 0.3, 10)],
    [sticker('TAX FREE 즉시환급', '#e60012', '#fff', 0.2, 0.82, 11), roundSticker('免税', '#ffffff', '#e60012', 0.88, 0.32)],
  ][i % 5];
  front(g, sub.front, { frame: '#f4f4f4', kick: acc, band: deep, door: i % 2 ? 0.08 : 0.68, stickers: st }, r);
}

function fashionRoom(g, sub, i, r) {
  const dark = i === 1;
  const wall = ['#e9dfd2', '#4b4f56', '#f2efe9'][i % 3], floorC = ['#b98e62', '#6f7379', '#c9a57c'][i % 3];
  const [bx, by, bw, bh] = sub.back;
  grad(g, bx, by, bw, bh, wall, dark ? '#3a3d42' : '#d7cdbf');
  // 브랜드 글자
  txt(g, ['STREET MOOD', 'DAILY LOOK', 'SOCKS · CAPS · CASES'][i % 3], bx + bw / 2, by + 16, 12, dark ? '#ffffff' : '#2b2b2b', 900);
  // 옷걸이 봉 + 걸린 옷
  for (const [x0, x1, y] of [[bx + 10, bx + bw * 0.46, by + 40], [bx + bw * 0.54, bx + bw - 10, by + 40]]) {
    g.fillStyle = '#9aa0a6'; g.fillRect(x0, y, x1 - x0, 2);
    for (let x = x0 + 3; x < x1 - 6; x += 6 + r() * 2) {
      const c = hsl(Math.floor(r() * 360), 20 + r() * 50, 25 + r() * 50);
      g.fillStyle = c; const L = 34 + r() * 30; g.fillRect(x, y + 3, 5, L);
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + 4, y + 3, 1, L);
    }
  }
  // 아래 접힌 옷 선반
  shelves(g, bx + 8, by + bh - 52, bw - 16, 44, 2, r, ['#1d3557', '#e63946', '#f1faee', '#a8dadc', '#2b2b2b', '#e9c46a', '#8d99ae'], dark ? '#2a2c30' : '#a07850', 7);
  // 마네킹 2
  for (const fx of [0.28, 0.72]) {
    const cx = bx + bw * fx, base = by + bh - 6;
    g.fillStyle = dark ? '#d8d8d8' : '#ffffff'; g.beginPath(); g.arc(cx, base - 70, 5, 0, 6.3); g.fill();
    g.fillStyle = hsl(Math.floor(r() * 360), 45, 45); g.fillRect(cx - 7, base - 64, 14, 28);
    g.fillStyle = '#26324a'; g.fillRect(cx - 6, base - 36, 5, 30); g.fillRect(cx + 1, base - 36, 5, 30);
  }
  const [sx, sy, sw, sh] = sub.side;
  grad(g, sx, sy, sw, sh, wall, dark ? '#36393e' : '#d4c9bb');
  g.fillStyle = '#9aa0a6'; g.fillRect(sx + 6, sy + 30, sw - 12, 2);
  for (let x = sx + 8; x < sx + sw - 8; x += 6) { g.fillStyle = hsl(Math.floor(r() * 360), 30 + r() * 40, 30 + r() * 45); g.fillRect(x, sy + 33, 5, 40 + r() * 25); }
  g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(sx + sw * 0.55, sy + 96, sw * 0.35, 46); g.fillStyle = 'rgba(160,190,210,.6)'; g.fillRect(sx + sw * 0.57, sy + 98, sw * 0.31, 42); // 거울
  planks(g, sub.floor, floorC, r);
  lightPanels(g, sub.ceil, dark ? '#2b2d31' : '#ece7df', '#fff3d6', 3, true);
  front(g, sub.front, {
    frame: dark ? '#111' : '#3b2f25', kick: dark ? '#111' : '#3b2f25', door: i % 2 ? 0.66 : 0.1,
    stickers: [sticker(['SALE UP TO 70%', 'NEW ARRIVAL', '3 FOR ₩10,000'][i % 3], '#ffffff', '#e60012', i % 2 ? 0.28 : 0.68, 0.22, 12)],
  }, r);
}

function shoesRoom(g, sub, i, r) {
  const [bx, by, bw, bh] = sub.back;
  grad(g, bx, by, bw, bh, '#e8e6e2', '#c9c5bf');
  g.fillStyle = '#111'; g.fillRect(bx, by, bw, 20); txt(g, 'SNEAKERS · 운동화 · 鞋', bx + bw / 2, by + 10, 11, '#fff');
  // 신발 격자 벽
  for (let row = 0; row < 6; row++) for (let col = 0; col < 12; col++) {
    const x = bx + 8 + col * ((bw - 16) / 12), y = by + 30 + row * 18;
    g.fillStyle = '#ffffff'; g.fillRect(x, y + 12, (bw - 16) / 12 - 2, 2);
    g.fillStyle = hsl(Math.floor(r() * 360), 50 + r() * 40, 35 + r() * 40);
    g.beginPath(); g.moveTo(x + 2, y + 12); g.lineTo(x + 2, y + 6); g.lineTo(x + 8, y + 5); g.lineTo(x + 15, y + 9); g.lineTo(x + 15, y + 12); g.fill();
    g.fillStyle = '#f4f4f4'; g.fillRect(x + 2, y + 10, 13, 2);
  }
  const [sx, sy, sw, sh] = sub.side;
  grad(g, sx, sy, sw, sh, '#e2dfda', '#c4c0ba');
  for (let row = 0; row < 7; row++) for (let col = 0; col < 8; col++) {
    const x = sx + 6 + col * 19, y = sy + 14 + row * 19;
    g.fillStyle = '#fff'; g.fillRect(x, y + 13, 17, 2); g.fillStyle = hsl(Math.floor(r() * 360), 60, 30 + r() * 40); g.fillRect(x + 2, y + 6, 13, 7);
  }
  tiles(g, sub.floor, '#9ea3a8', '#80858a', 4);
  lightPanels(g, sub.ceil, '#f2f2f2', '#ffffff', 3);
  front(g, sub.front, { frame: '#111', kick: '#111', door: 0.7, stickers: [sticker('1+1 EVENT', '#ffe169', '#111', 0.3, 0.2, 12)] }, r);
}

function cafeRoom(g, sub, i, r) {
  const wood = i ? '#efe8dc' : '#7a5236';
  const [bx, by, bw, bh] = sub.back;
  grad(g, bx, by, bw, bh, i ? '#f6f1e8' : '#5a3a24', i ? '#e3d8c6' : '#3e2718');
  // 메뉴판
  g.fillStyle = '#1e1e1e'; g.fillRect(bx + 16, by + 14, bw * 0.55, 56);
  const menu = [['AMERICANO', '4,500'], ['CAFE LATTE', '5,000'], ['MILK TEA', '5,500'], ['딸기라떼', '6,000']];
  menu.forEach(([a, b], k) => { txt(g, a, bx + 22, by + 24 + k * 13, 9, '#f6e6c8', 800, 'left'); txt(g, b, bx + 16 + bw * 0.55 - 6, by + 24 + k * 13, 9, '#ffb35c', 800, 'right'); });
  txt(g, i ? 'CLOUD CAFE' : 'BUMP COFFEE', bx + bw * 0.82, by + 40, 12, i ? '#4b2e1e' : '#f6e6c8');
  // 펜던트 조명
  for (const fx of [0.2, 0.5, 0.8]) { g.fillStyle = '#333'; g.fillRect(bx + bw * fx, by, 1, 76); g.fillStyle = '#ffd38a'; g.beginPath(); g.arc(bx + bw * fx, by + 80, 6, Math.PI, 0); g.fill(); }
  // 계산대 + 커피머신 + 케이크 진열장
  g.fillStyle = wood; g.fillRect(bx + 8, by + bh - 44, bw - 16, 38);
  g.fillStyle = '#c9ccd1'; g.fillRect(bx + 24, by + bh - 62, 30, 18); g.fillStyle = '#222'; g.fillRect(bx + 28, by + bh - 58, 22, 6);
  g.fillStyle = 'rgba(210,235,245,.8)'; g.fillRect(bx + bw * 0.55, by + bh - 62, 70, 20);
  for (let k = 0; k < 6; k++) { g.fillStyle = ['#ffafcc', '#fff1c1', '#7a4a2a', '#ffffff'][k % 4]; g.fillRect(bx + bw * 0.55 + 4 + k * 11, by + bh - 52, 8, 8); }
  const [sx, sy, sw, sh] = sub.side;
  grad(g, sx, sy, sw, sh, i ? '#f1eadf' : '#5c3b26', i ? '#ddd1bd' : '#3f2819');
  // 벽 액자 + 창가 테이블
  for (const fx of [0.25, 0.65]) { g.fillStyle = '#e9dcc5'; g.fillRect(sx + sw * fx - 14, sy + 30, 28, 34); g.fillStyle = hsl(Math.floor(r() * 360), 40, 55); g.fillRect(sx + sw * fx - 11, sy + 33, 22, 28); }
  for (const fx of [0.2, 0.55, 0.85]) { g.fillStyle = '#2e2e2e'; g.fillRect(sx + sw * fx - 12, sy + sh - 40, 24, 4); g.fillRect(sx + sw * fx - 1, sy + sh - 36, 2, 30); }
  planks(g, sub.floor, i ? '#c9a57c' : '#6b4429', r);
  lightPanels(g, sub.ceil, i ? '#efe9df' : '#2a1d14', '#ffd38a', 3, true);
  front(g, sub.front, { frame: i ? '#ffffff' : '#2b1a10', kick: i ? '#e9dcc5' : '#2b1a10', door: 0.66, stickers: [sticker('OPEN', '#ffb35c', '#2b1a10', 0.15, 0.25, 12)] }, r);
}

function exchangeRoom(g, sub, i, r) {
  const [bx, by, bw, bh] = sub.back;
  grad(g, bx, by, bw, bh, '#e7ecf3', '#c6cfdb');
  g.fillStyle = '#0d3b8c'; g.fillRect(bx, by, bw, 22); txt(g, '환전 MONEY EXCHANGE · 換錢 · 両替', bx + bw / 2, by + 11, 11, '#ffe169');
  // 창구 유리 부스 3개
  for (let k = 0; k < 3; k++) {
    const x = bx + 14 + k * (bw - 28) / 3, w = (bw - 28) / 3 - 8;
    g.fillStyle = '#ffffff'; g.fillRect(x, by + 34, w, bh - 70);
    g.fillStyle = 'rgba(150,190,220,.55)'; g.fillRect(x + 4, by + 38, w - 8, bh - 90);
    g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(x + w / 2, by + 70, 6, 0, 6.3); g.fill(); g.fillRect(x + w / 2 - 7, by + 76, 14, 16);
    g.fillStyle = '#0d3b8c'; g.fillRect(x, by + bh - 38, w, 6);
    txt(g, String(k + 1), x + 10, by + 46, 10, '#0d3b8c');
  }
  g.fillStyle = '#8d939b'; g.fillRect(bx, by + bh - 32, bw, 28);
  const [sx, sy, sw, sh] = sub.side;
  grad(g, sx, sy, sw, sh, '#e4e9f0', '#c3ccd8');
  // 옆 벽 환율 화면
  g.fillStyle = '#0b0f1a'; g.fillRect(sx + 14, sy + 20, sw - 28, 64);
  ['USD 1,385', 'JPY 905', 'CNY 191', 'EUR 1,495'].forEach((s, k) => txt(g, s, sx + sw / 2, sy + 30 + k * 15, 11, k % 2 ? '#ff4d4d' : '#4dff88', 800));
  tiles(g, sub.floor, '#d7d4cf', '#b5b1ab', 5);
  lightPanels(g, sub.ceil, '#f4f6f9', '#ffffff', 3);
  // 앞: 창 오른쪽 LED 환율판 (불투명)
  front(g, sub.front, { frame: '#0d3b8c', kick: '#0d3b8c', door: 0.06, stickers: [rateBoard] }, r);
}
function rateBoard(g, x, y, w, h) {
  const bx = x + w * 0.42, bw = w * 0.54, top = y + 18, bh = h - 40;
  g.fillStyle = '#05070d'; g.fillRect(bx, top, bw, bh);
  g.strokeStyle = '#ffe169'; g.lineWidth = 2; g.strokeRect(bx + 1, top + 1, bw - 2, bh - 2);
  txt(g, '환율 RATE  BUY / SELL', bx + bw / 2, top + 10, 9, '#ffe169', 800);
  const rows = [['🇺🇸 USD', '1,385', '1,402'], ['🇯🇵 JPY100', '905', '918'], ['🇨🇳 CNY', '191', '195'], ['🇪🇺 EUR', '1,495', '1,516'], ['🇹🇼 TWD', '42.6', '44.1']];
  rows.forEach(([c, b, s], k) => {
    const yy = top + 24 + k * ((bh - 30) / rows.length);
    txt(g, c, bx + 6, yy, 9, '#ffffff', 800, 'left');
    txt(g, b, bx + bw * 0.7, yy, 10, '#ff3b3b', 900, 'right');
    txt(g, s, bx + bw - 6, yy, 10, '#3bff7a', 900, 'right');
  });
  txt(g, 'KRW ₩', bx + bw / 2, top + bh - 6, 8, '#9fb3d9', 800);
}

function convenienceRoom(g, sub, i, r) {
  const [bx, by, bw, bh] = sub.back;
  grad(g, bx, by, bw, bh, '#f7f7f5', '#dedfdc');
  g.fillStyle = '#1d2b53'; g.fillRect(bx, by, bw, 18); g.fillStyle = '#ffe169'; g.fillRect(bx, by + 18, bw, 3);
  txt(g, 'BP24  SNACK · RAMEN · DRINK', bx + bw / 2, by + 9, 10, '#ffffff');
  // 뒤쪽 음료 냉장고(유리문)
  for (let k = 0; k < 4; k++) {
    const x = bx + 10 + k * (bw - 20) / 4, w = (bw - 20) / 4 - 4;
    g.fillStyle = '#c9ced4'; g.fillRect(x, by + 28, w, bh - 40);
    g.fillStyle = 'rgba(200,235,255,.9)'; g.fillRect(x + 3, by + 31, w - 6, bh - 46);
    shelves(g, x + 4, by + 32, w - 8, bh - 48, 5, r, ['#e63946', '#2a9d8f', '#ffb703', '#3a86ff', '#ffffff', '#8338ec', '#06d6a0'], '#9aa3ad', 14);
  }
  const [sx, sy, sw, sh] = sub.side;
  grad(g, sx, sy, sw, sh, '#f2f2f0', '#d9dad7');
  shelves(g, sx + 4, sy + 10, sw - 8, sh - 22, 5, r, ['#ff6b35', '#f7c59f', '#e63946', '#ffd166', '#118ab2', '#ef476f', '#ffffff', '#073b4c'], '#e9ecef', 18);
  tiles(g, sub.floor, '#e6e6e3', '#c9c9c6', 6);
  lightPanels(g, sub.ceil, '#fafafa', '#ffffff', 2);
  front(g, sub.front, { frame: '#1d2b53', kick: '#1d2b53', band: '#4cc9f0', door: 0.7, stickers: [sticker('24H', '#ffe169', '#1d2b53', 0.15, 0.25, 16), sticker('ATM · T-money', '#ffffff', '#1d2b53', 0.42, 0.82, 10)] }, r);
}

function pharmacyRoom(g, sub, i, r) {
  const [bx, by, bw, bh] = sub.back;
  grad(g, bx, by, bw, bh, '#f4fbf6', '#d9e8dd');
  g.fillStyle = '#16a34a'; g.fillRect(bx, by, bw, 20); txt(g, '약국 PHARMACY · 藥局 · 薬局', bx + bw / 2, by + 10, 11, '#ffffff');
  // 큰 초록 십자
  const cx = bx + bw / 2, cy = by + 50; g.fillStyle = '#16a34a'; g.fillRect(cx - 5, cy - 16, 10, 32); g.fillRect(cx - 16, cy - 5, 32, 10);
  shelves(g, bx + 8, by + 26, bw * 0.38, bh - 60, 5, r, ['#ffffff', '#16a34a', '#e63946', '#3a86ff', '#ffd166', '#cde7d4'], '#ffffff', 12);
  shelves(g, bx + bw * 0.6, by + 26, bw * 0.38, bh - 60, 5, r, ['#ffffff', '#16a34a', '#e63946', '#3a86ff', '#ffd166', '#cde7d4'], '#ffffff', 12);
  g.fillStyle = '#ffffff'; g.fillRect(bx + 10, by + bh - 34, bw - 20, 28); g.fillStyle = '#16a34a'; g.fillRect(bx + 10, by + bh - 34, bw - 20, 4);
  g.fillStyle = '#fff'; g.fillRect(cx - 6, by + bh - 64, 12, 30); g.fillStyle = '#f1c9a5'; g.beginPath(); g.arc(cx, by + bh - 70, 6, 0, 6.3); g.fill(); // 약사(흰 가운)
  const [sx, sy, sw, sh] = sub.side;
  grad(g, sx, sy, sw, sh, '#f0f8f2', '#d4e4d8');
  shelves(g, sx + 4, sy + 10, sw - 8, sh - 22, 6, r, ['#ffffff', '#16a34a', '#e63946', '#3a86ff', '#ffd166', '#f4a261'], '#ffffff', 13);
  tiles(g, sub.floor, '#eef1ee', '#d0d6d1', 5);
  lightPanels(g, sub.ceil, '#f7faf8', '#ffffff', 3);
  front(g, sub.front, { frame: '#16a34a', kick: '#ffffff', door: 0.66, stickers: [roundSticker('✚', '#16a34a', '#fff', 0.14, 0.3, 16), sticker('TAX REFUND', '#ffffff', '#16a34a', 0.42, 0.84, 10)] }, r);
}

function souvenirRoom(g, sub, i, r) {
  const [bx, by, bw, bh] = sub.back;
  grad(g, bx, by, bw, bh, '#fff4e6', '#f0d9bd');
  g.fillStyle = '#c3002f'; g.fillRect(bx, by, bw, 20); txt(g, 'KOREA SOUVENIR · 기념품 · お土産 · 礼品', bx + bw / 2, by + 10, 10, '#ffffff');
  // 태극 부채·인형·자석·K-POP 포스터
  for (let k = 0; k < 5; k++) {
    const x = bx + 14 + k * 45, y = by + 30;
    g.fillStyle = '#ffffff'; g.fillRect(x, y, 34, 44);
    g.fillStyle = hsl(Math.floor(r() * 360), 70, 55); g.fillRect(x + 2, y + 2, 30, 40);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 17, y + 18, 7, 0, 6.3); g.fill();
  }
  shelves(g, bx + 8, by + 80, bw - 16, bh - 90, 3, r, ['#c3002f', '#0047a0', '#ffffff', '#ffd166', '#2a9d8f', '#ff4fd8', '#46f0ff', '#7b2cbf'], '#a0703c', 12);
  const [sx, sy, sw, sh] = sub.side;
  grad(g, sx, sy, sw, sh, '#fbe9d2', '#ebd0ac');
  // 한복 인형 줄 + 마그넷 벽
  for (let k = 0; k < 7; k++) { const x = sx + 10 + k * 21, y = sy + 30; g.fillStyle = ['#ff4f9a', '#7b2cbf', '#ffd166', '#2a9d8f'][k % 4]; g.beginPath(); g.moveTo(x, y + 30); g.lineTo(x + 8, y + 6); g.lineTo(x + 16, y + 30); g.fill(); g.fillStyle = '#f1c9a5'; g.beginPath(); g.arc(x + 8, y + 4, 4, 0, 6.3); g.fill(); }
  for (let k = 0; k < 40; k++) { g.fillStyle = hsl(Math.floor(r() * 360), 70, 60); g.fillRect(sx + 8 + (k % 10) * 15, sy + 80 + Math.floor(k / 10) * 15, 11, 11); }
  planks(g, sub.floor, '#b08560', r);
  lightPanels(g, sub.ceil, '#f3e8d8', '#fff1cc', 3, true);
  front(g, sub.front, { frame: '#5a1a12', kick: '#c3002f', door: 0.68, stickers: [sticker('K-POP GOODS', '#120b2e', '#ff4fd8', 0.3, 0.22, 11), sticker('3 FOR ₩10,000', '#ffe169', '#c3002f', 0.3, 0.8, 10)] }, r);
}

function restaurantRoom(g, sub, i, r) {
  const [bx, by, bw, bh] = sub.back;
  grad(g, bx, by, bw, bh, '#f2e3c8', '#cfae7f');
  g.fillStyle = '#3b0d0c'; g.fillRect(bx, by, bw, 22); txt(g, '메뉴 MENU · 비빔밥 · 김치찌개 · 불고기', bx + bw / 2, by + 11, 10, '#ffcf8b');
  // 메뉴 사진판
  for (let k = 0; k < 6; k++) { const x = bx + 10 + k * 38; g.fillStyle = '#fff'; g.fillRect(x, by + 28, 32, 28); g.fillStyle = hsl(10 + r() * 40, 70, 40 + r() * 20); g.beginPath(); g.arc(x + 16, by + 42, 10, 0, 6.3); g.fill(); }
  // 테이블 + 의자
  for (const fx of [0.2, 0.5, 0.8]) { const cx = bx + bw * fx; g.fillStyle = '#6b3e26'; g.fillRect(cx - 22, by + bh - 46, 44, 5); g.fillRect(cx - 2, by + bh - 41, 4, 30); g.fillStyle = '#9c6644'; g.fillRect(cx - 30, by + bh - 30, 8, 20); g.fillRect(cx + 22, by + bh - 30, 8, 20); g.fillStyle = '#c9ccd1'; g.fillRect(cx - 4, by + bh - 52, 8, 6); }
  const [sx, sy, sw, sh] = sub.side;
  grad(g, sx, sy, sw, sh, '#efdcbc', '#c9a677');
  for (let k = 0; k < 4; k++) { g.fillStyle = '#fff8e6'; g.fillRect(sx + 10 + k * 37, sy + 24, 30, 40); txt(g, ['김밥', '라면', '만두', '떡국'][k], sx + 25 + k * 37, sy + 44, 10, '#7a1f1f'); }
  planks(g, sub.floor, '#7a5236', r);
  lightPanels(g, sub.ceil, '#3a2a1e', '#ffd38a', 3, true);
  front(g, sub.front, { frame: '#3b0d0c', kick: '#3b0d0c', door: 0.1, stickers: [sticker('KOREAN FOOD 韩食', '#ffcf8b', '#3b0d0c', 0.66, 0.22, 11)] }, r);
}

const PAINTERS = [
  ...[0, 1, 2, 3, 4].map((k) => (g, s, r) => beautyRoom(g, s, k, r)),
  (g, s, r) => fashionRoom(g, s, 0, r), (g, s, r) => fashionRoom(g, s, 1, r),
  (g, s, r) => shoesRoom(g, s, 0, r),
  (g, s, r) => cafeRoom(g, s, 0, r), (g, s, r) => cafeRoom(g, s, 1, r),
  (g, s, r) => exchangeRoom(g, s, 0, r),
  (g, s, r) => convenienceRoom(g, s, 0, r),
  (g, s, r) => pharmacyRoom(g, s, 0, r),
  (g, s, r) => souvenirRoom(g, s, 0, r),
  (g, s, r) => restaurantRoom(g, s, 0, r),
  (g, s, r) => fashionRoom(g, s, 2, r),
];

/** 실내 아틀라스. tick 을 주면 칸마다 쉬어 간다 */
export async function createShopInteriorAtlas(tick = null) {
  if (typeof document === 'undefined') return null;
  const W = TILE_W * ROOM_COLS, H = TILE_H * ROOM_ROWS;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  for (let i = 0; i < PAINTERS.length; i++) {
    const ox = (i % ROOM_COLS) * TILE_W, oy = Math.floor(i / ROOM_COLS) * TILE_H;
    const off = (q) => [ox + q[0], oy + q[1], q[2], q[3]];
    const sub = { back: off(R_BACK), front: off(R_FRONT), side: off(R_SIDE), floor: off(R_FLOOR), ceil: off(R_CEIL) };
    g.save(); g.beginPath(); g.rect(ox, oy, TILE_W, TILE_H); g.clip();
    // 하위 사각형 둘레를 같은 색으로 4px 넓혀(밉맵 번짐 방지) — 먼저 넓게 칠하고 위에 정식으로 그린다
    PAINTERS[i](g, sub, rnd32(5150 + i * 97));
    g.restore();
    if (tick) await tick('md-rooms');
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.name = 'myeongdong-shop-rooms';
  return { texture: t, canvas: c, W, H };
}

/** 인테리어 매핑 재질 (MeshBasic + onBeforeCompile). 지오메트리: position · normal(바깥) · uv(창 안 0..1) · aRoom(칸, 너비, 높이, 깊이) */
export function createShopInteriorMaterial(atlas) {
  const uniforms = {
    uRoomTex: { value: atlas?.texture || null },
    uAtlas: { value: new THREE.Vector2(atlas?.W || 1, atlas?.H || 1) },
    uBright: { value: 0.86 },
    uRefl: { value: 1 },
    uSky: { value: new THREE.Color('#bcd3e6') },
  };
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  m.name = 'myeongdong-shop-interior';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRoom;\nvarying vec4 vRoom;\nvarying vec2 vLuv;\nvarying vec3 vWPos;\nvarying vec3 vWN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRoom = aRoom; vLuv = uv; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uRoomTex; uniform vec2 uAtlas; uniform float uBright; uniform float uRefl; uniform vec3 uSky;
varying vec4 vRoom; varying vec2 vLuv; varying vec3 vWPos; varying vec3 vWN;
vec2 roomUV(float idx, vec4 rc, vec2 st) {
  float col = mod(idx, ${ROOM_COLS}.0), row = floor(idx / ${ROOM_COLS}.0);
  st = clamp(st, 0.004, 0.996);
  vec2 px = vec2(col * ${TILE_W}.0 + rc.x + st.x * rc.z, row * ${TILE_H}.0 + rc.y + (1.0 - st.y) * rc.w);
  return vec2(px.x / uAtlas.x, 1.0 - px.y / uAtlas.y);
}`)
      .replace('#include <map_fragment>', `{
  vec3 N = normalize(vWN); vec3 Rt = normalize(vec3(N.z, 0.0, -N.x));
  vec3 V = normalize(vWPos - cameraPosition);
  vec3 d = vec3(dot(V, Rt), V.y, -dot(V, N));
  d.z = max(d.z, 0.02);
  float w = vRoom.y, h = vRoom.z, D = vRoom.w, idx = vRoom.x;
  vec3 p = vec3(vLuv.x * w, vLuv.y * h, 0.0);
  float tx = d.x > 0.0 ? (w - p.x) / max(d.x, 1e-4) : p.x / max(-d.x, 1e-4);
  float ty = d.y > 0.0 ? (h - p.y) / max(d.y, 1e-4) : p.y / max(-d.y, 1e-4);
  float tz = D / d.z;
  float t = min(tz, min(tx, ty));
  vec3 q = p + d * t;
  // 면마다 연속인 좌표의 미분으로 밉 단계를 잡는다(비스듬히 볼 때 자글자글 방지). q 는 면 경계에서도 연속.
  vec2 stB = vec2(q.x / w, q.y / h), stS = vec2(q.z / D, q.y / h), stF = vec2(q.x / w, q.z / D);
  vec2 kB = vec2(${R_BACK[2]}.0, ${R_BACK[3]}.0) / uAtlas, kS = vec2(${R_SIDE[2]}.0, ${R_SIDE[3]}.0) / uAtlas;
  vec2 gBx = dFdx(stB) * kB, gBy = dFdy(stB) * kB, gSx = dFdx(stS) * kS, gSy = dFdy(stS) * kS, gFx = dFdx(stF) * kS, gFy = dFdy(stF) * kS;
  vec2 gx = dFdx(vLuv) * kB, gy = dFdy(vLuv) * kB;
  vec3 ic; float shade;
  if (t == tz) { ic = textureGrad(uRoomTex, roomUV(idx, vec4(${R_BACK.join('.0,')}.0), stB), gBx, gBy).rgb; shade = 0.92; }
  else if (t == tx) { ic = textureGrad(uRoomTex, roomUV(idx, vec4(${R_SIDE.join('.0,')}.0), stS), gSx, gSy).rgb; shade = 0.84; }
  else if (d.y < 0.0) { ic = textureGrad(uRoomTex, roomUV(idx, vec4(${R_FLOOR.join('.0,')}.0), stF), gFx, gFy).rgb; shade = 0.8; }
  else { ic = textureGrad(uRoomTex, roomUV(idx, vec4(${R_CEIL.join('.0,')}.0), stF), gFx, gFy).rgb; shade = 0.95; }
  ic *= shade * mix(1.0, 0.82, clamp(q.z / D, 0.0, 1.0));
  vec4 fr = textureGrad(uRoomTex, roomUV(idx, vec4(${R_FRONT.join('.0,')}.0), vLuv), gx, gy);
  float fres = pow(1.0 - clamp(-dot(V, N), 0.0, 1.0), 3.0);
  vec3 glass = mix(ic, uSky, clamp(uRefl * (0.10 + 0.55 * fres), 0.0, 0.85));
  diffuseColor.rgb = mix(glass, fr.rgb, fr.a) * uBright;
}`);
  };
  m.customProgramCacheKey = () => 'md-shop-interior-v2';
  return { material: m, uniforms };
}
