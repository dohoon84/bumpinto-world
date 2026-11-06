// [bump24game] 상품 카탈로그 · 포장 아틀라스(1024², 128px 칸 8×8) · 저폴리 모양(UV를 아틀라스 칸에 굽기)
//   칸 안 영역: 앞(라벨) u 0..0.75 · 윗면(뚜껑/캡) u 0.75..1, v 0.5..1 · 옆면 u 0.75..1, v 0..0.5
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';

// 패러디 상품 (실제 브랜드명 변형, 로고 없음). price=원, weight=kg
export const CATALOG = [
  { id: 'shin-cup', name: '신맛면 컵', sub: '얼큰한 맛', shape: 'cupRamen', price: 1500, weight: 0.11, color: '#d32f2f', accent: '#111', zone: 'ramen' },
  { id: 'yukgaejang-cup', name: '육개장 사발', sub: '사발면', shape: 'cupRamen', price: 1300, weight: 0.1, color: '#f57c00', accent: '#5d1f00', zone: 'ramen' },
  { id: 'jjajang-cup', name: '짜장 큰사발', sub: '짜장', shape: 'cupRamen', price: 1800, weight: 0.13, color: '#3e2723', accent: '#ffca28', zone: 'ramen' },
  { id: 'cheese-cup', name: '치즈볶음면', sub: '불닭치즈', shape: 'cupRamen', price: 2000, weight: 0.12, color: '#212121', accent: '#ffb300', zone: 'ramen' },
  { id: 'udon-cup', name: '튀김우동', sub: '큰컵', shape: 'cupRamen', price: 1700, weight: 0.12, color: '#1565c0', accent: '#fff176', zone: 'ramen' },
  { id: 'shrimp-chip', name: '새우바삭', sub: '오리지널', shape: 'bagSnack', price: 1700, weight: 0.09, color: '#e53935', accent: '#fff59d', zone: 'snack' },
  { id: 'honey-twist', name: '허니꽈배기', sub: '달콤', shape: 'bagSnack', price: 1500, weight: 0.08, color: '#ffb300', accent: '#6d4c41', zone: 'snack' },
  { id: 'onion-ring', name: '양파링스', sub: '고소한 양파', shape: 'bagSnack', price: 1600, weight: 0.08, color: '#7cb342', accent: '#fff', zone: 'snack' },
  { id: 'potato-chip', name: '포테토칩', sub: '오리지널', shape: 'bagSnack', price: 1800, weight: 0.1, color: '#fdd835', accent: '#c62828', zone: 'snack' },
  { id: 'corn-chip', name: '콘칩스', sub: '군옥수수', shape: 'bagSnack', price: 1600, weight: 0.09, color: '#1e88e5', accent: '#ffeb3b', zone: 'snack' },
  { id: 'cola-can', name: '콜라맛', sub: 'COLA 355ml', shape: 'can', price: 1500, weight: 0.38, color: '#c62828', accent: '#fff', zone: 'drink' },
  { id: 'soda-can', name: '사이다톡', sub: 'CIDER', shape: 'can', price: 1400, weight: 0.37, color: '#43a047', accent: '#fff', zone: 'drink' },
  { id: 'coffee-can', name: '모닝커피', sub: 'COFFEE', shape: 'can', price: 1800, weight: 0.3, color: '#4e342e', accent: '#ffcc80', zone: 'drink' },
  { id: 'energy-can', name: '파워샷', sub: 'ENERGY', shape: 'can', price: 2200, weight: 0.3, color: '#0d47a1', accent: '#ff1744', zone: 'drink' },
  { id: 'water-pet', name: '청정수', sub: '500ml', shape: 'pet', price: 1000, weight: 0.53, color: '#29b6f6', accent: '#e1f5fe', zone: 'drink' },
  { id: 'tea-pet', name: '녹차한잔', sub: '500ml', shape: 'pet', price: 1600, weight: 0.52, color: '#2e7d32', accent: '#c5e1a5', zone: 'drink' },
  { id: 'juice-pet', name: '오렌지톡', sub: '100%', shape: 'pet', price: 2300, weight: 0.52, color: '#fb8c00', accent: '#fff3e0', zone: 'drink' },
  { id: 'tuna-gimbap', name: '참치마요', sub: '삼각김밥', shape: 'gimbap', price: 1300, weight: 0.12, color: '#e53935', accent: '#fff', zone: 'fresh' },
  { id: 'bulgogi-gimbap', name: '불고기', sub: '삼각김밥', shape: 'gimbap', price: 1500, weight: 0.12, color: '#6d4c41', accent: '#fff', zone: 'fresh' },
  { id: 'kimchi-gimbap', name: '김치참치', sub: '삼각김밥', shape: 'gimbap', price: 1400, weight: 0.12, color: '#2e7d32', accent: '#fff', zone: 'fresh' },
  { id: 'bulgogi-lunch', name: '불고기도시락', sub: '든든한 한끼', shape: 'lunch', price: 5500, weight: 0.45, color: '#8d4925', accent: '#fff', zone: 'fresh' },
  { id: 'chicken-lunch', name: '치킨마요도시락', sub: '인기', shape: 'lunch', price: 4900, weight: 0.42, color: '#e0a14a', accent: '#fff', zone: 'fresh' },
  { id: 'jeyuk-lunch', name: '제육도시락', sub: '매콤', shape: 'lunch', price: 5200, weight: 0.44, color: '#c43d1f', accent: '#fff', zone: 'fresh' },
  { id: 'bar-ice', name: '바나나바', sub: 'ICE BAR', shape: 'ice', price: 1200, weight: 0.08, color: '#fff176', accent: '#6d4c41', zone: 'freezer' },
  { id: 'melon-ice', name: '메론바', sub: 'ICE BAR', shape: 'ice', price: 1500, weight: 0.08, color: '#81c784', accent: '#fff', zone: 'freezer' },
  { id: 'choco-ice', name: '초코콘', sub: 'CONE', shape: 'ice', price: 2000, weight: 0.1, color: '#5d4037', accent: '#ffe0b2', zone: 'freezer' },
  { id: 'berry-ice', name: '딸기콘', sub: 'CONE', shape: 'ice', price: 2000, weight: 0.1, color: '#ec407a', accent: '#fff', zone: 'freezer' },
  { id: 'americano-pouch', name: '아메리카노', sub: '파우치 230ml', shape: 'pouch', price: 1200, weight: 0.24, color: '#ef6c00', accent: '#fff', zone: 'pouch' },
  { id: 'latte-pouch', name: '카페라떼', sub: '파우치', shape: 'pouch', price: 1500, weight: 0.24, color: '#6d4c41', accent: '#fff8e1', zone: 'pouch' },
  { id: 'ade-pouch', name: '레몬에이드', sub: '파우치', shape: 'pouch', price: 1300, weight: 0.24, color: '#fdd835', accent: '#1b5e20', zone: 'pouch' },
  { id: 'chicken-skewer', name: '닭꼬치', sub: 'BUMP 치킨', shape: 'hot', price: 3500, weight: 0.15, color: '#d84315', accent: '#fff', zone: 'hot' },
  { id: 'corndog', name: '핫도그', sub: 'BUMP 치킨', shape: 'hot', price: 2500, weight: 0.13, color: '#e0a14a', accent: '#fff', zone: 'hot' },
  { id: 'soju-clear', name: '맑은이슬', sub: '360ml 16.5%', shape: 'soju', price: 2100, weight: 0.45, color: '#2e7d32', accent: '#fff', zone: 'alcohol' },
  { id: 'soju-fresh', name: '처음톡', sub: '360ml', shape: 'soju', price: 2100, weight: 0.45, color: '#1b5e20', accent: '#e3f2fd', zone: 'alcohol' },
  { id: 'wine-red', name: '레드하우스', sub: 'Cabernet', shape: 'wine', price: 18900, weight: 1.25, color: '#3a0d14', accent: '#f5ecd7', zone: 'premium', expensive: true },
  { id: 'wine-white', name: '화이트하우스', sub: 'Chardonnay', shape: 'wine', price: 16900, weight: 1.2, color: '#4a5a1e', accent: '#f5ecd7', zone: 'premium', expensive: true },
  { id: 'gift-choco', name: '초코데이 세트', sub: '선물세트', shape: 'gift', price: 12900, weight: 0.6, color: '#c62828', accent: '#ffd54f', zone: 'gift', expensive: true },
  { id: 'gift-cookie', name: '쿠키박스', sub: '선물세트', shape: 'gift', price: 9900, weight: 0.55, color: '#1565c0', accent: '#fff', zone: 'gift', expensive: true },
  { id: 'gift-tea', name: '티타임 세트', sub: '선물세트', shape: 'gift', price: 14900, weight: 0.7, color: '#2e7d32', accent: '#ffe082', zone: 'gift', expensive: true },
];
CATALOG.forEach((p, i) => { p.idx = i; });
export const BY_ID = Object.fromEntries(CATALOG.map((p) => [p.id, p]));
export const BASKET_MAX_KG = 6;

// 모양별 크기(바닥 원점, 앞 = +z) — 진열 간격 계산용
export const SHAPES = {
  cupRamen: { w: 0.118, h: 0.115, d: 0.118 },
  bagSnack: { w: 0.16, h: 0.23, d: 0.07 },
  can: { w: 0.068, h: 0.123, d: 0.068 },
  pet: { w: 0.07, h: 0.225, d: 0.07 },
  gimbap: { w: 0.115, h: 0.105, d: 0.04 },
  lunch: { w: 0.19, h: 0.07, d: 0.13 },
  ice: { w: 0.06, h: 0.17, d: 0.03 },
  pouch: { w: 0.1, h: 0.17, d: 0.04 },
  hot: { w: 0.05, h: 0.17, d: 0.05 },
  soju: { w: 0.062, h: 0.225, d: 0.062 },
  wine: { w: 0.078, h: 0.31, d: 0.078 },
  gift: { w: 0.22, h: 0.16, d: 0.08 },
};

// ---------- 아틀라스 ----------
export const ATLAS = { W: 1024, H: 1024, cell: 128, cols: 8 };
const FRONT = [0.02, 0.0, 0.74, 1.0], TOP = [0.76, 0.51, 0.98, 0.99], SIDE = [0.76, 0.01, 0.98, 0.49];

function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + k, y); ctx.arcTo(x + w, y, x + w, y + h, k); ctx.arcTo(x + w, y + h, x, y + h, k); ctx.arcTo(x, y + h, x, y, k); ctx.arcTo(x, y, x + w, y, k); ctx.closePath();
}
function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b); return `#${c.getHexString()}`; }
function fitText(ctx, text, maxW, size, weight = 900) {
  let s = size; ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > 7 && ctx.measureText(text).width > maxW) { s -= 1; ctx.font = `${weight} ${s}px ${FONT}`; }
  return s;
}
function vText(ctx, text, x, y, maxW, size, color, { stroke = null, weight = 900 } = {}) {
  fitText(ctx, text, maxW, size, weight);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y); }
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function gloss(ctx, x, y, w, h, a = 0.35) {
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.18, `rgba(255,255,255,${a})`); g.addColorStop(0.3, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0)'); g.addColorStop(0.8, `rgba(255,255,255,${a * 0.6})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}
function miniLogo(ctx, x, y, s) { // 파란 둥근 B + 빨간 점 (브랜드 간이 표기)
  ctx.fillStyle = '#0072DD'; rr(ctx, x, y, s, s, s * 0.3); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(s * 0.75)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('B', x + s * 0.46, y + s * 0.55);
  ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(x + s * 0.8, y + s * 0.22, s * 0.14, 0, Math.PI * 2); ctx.fill();
}

// 칸 하나 그리기. (x0,y0) = 칸 좌상단 픽셀
function drawCell(ctx, x0, y0, it) {
  const S = ATLAS.cell, FW = Math.round(S * 0.76), fx = x0, fy = y0;
  const TX = x0 + FW, TY = y0, SX = x0 + FW, SY = y0 + S / 2, TW = S - FW, TH = S / 2;
  const c = it.color, a = it.accent;
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, S, S); ctx.clip();
  // 기본 옆면/윗면
  ctx.fillStyle = shade(c, 0.85); ctx.fillRect(SX, SY, TW, TH);
  ctx.fillStyle = shade(c, 1.1); ctx.fillRect(TX, TY, TW, TH);
  const cx = fx + FW / 2;
  switch (it.shape) {
    case 'cupRamen': {
      // 옆 띠지(원통 둘레 전체): 아래 진한 색, 위 흰 테, 가운데 그릇 그림 + 이름
      const g = ctx.createLinearGradient(0, fy, 0, fy + S); g.addColorStop(0, shade(c, 1.15)); g.addColorStop(1, shade(c, 0.7));
      ctx.fillStyle = g; ctx.fillRect(fx, fy, FW, S);
      ctx.fillStyle = '#fff'; ctx.fillRect(fx, fy, FW, 12); ctx.fillStyle = a; ctx.fillRect(fx, fy + 12, FW, 3);
      // 그릇 + 면발
      ctx.fillStyle = '#fbe9d0'; ctx.beginPath(); ctx.ellipse(cx, fy + 92, 26, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e8a33c'; ctx.lineWidth = 2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx - 20, fy + 90 + i * 3); ctx.bezierCurveTo(cx - 8, fy + 84 + i * 3, cx + 8, fy + 96 + i * 3, cx + 20, fy + 90 + i * 3); ctx.stroke(); }
      ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.arc(cx - 10, fy + 86, 3, 0, 7); ctx.fill(); ctx.fillStyle = '#43a047'; ctx.beginPath(); ctx.arc(cx + 9, fy + 88, 3, 0, 7); ctx.fill();
      vText(ctx, it.name, cx, fy + 44, FW - 8, 22, '#fff', { stroke: shade(c, 0.45) });
      vText(ctx, it.sub, cx, fy + 64, FW - 16, 12, a, { weight: 800 });
      miniLogo(ctx, fx + 4, fy + S - 18, 14);
      // 뚜껑(종이): 흰 바탕 + 색 원 + 이름 첫 글자
      ctx.fillStyle = '#f7f4ee'; ctx.fillRect(TX, TY, TW, TH);
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(TX + TW / 2, TY + TH / 2, TW * 0.38, 0, 7); ctx.fill();
      vText(ctx, it.name.slice(0, 1), TX + TW / 2, TY + TH / 2 + 1, TW, 16, '#fff');
      break;
    }
    case 'bagSnack': case 'pouch': {
      const g = ctx.createLinearGradient(fx, fy, fx + FW, fy + S); g.addColorStop(0, shade(c, 1.25)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, 0.7));
      ctx.fillStyle = g; ctx.fillRect(fx, fy, FW, S);
      // 크림프(위/아래 톱니)
      ctx.fillStyle = shade(c, 0.6); for (let x = fx; x < fx + FW; x += 5) { ctx.fillRect(x, fy, 3, 8); ctx.fillRect(x, fy + S - 8, 3, 8); }
      if (it.shape === 'pouch') { // 얼음컵 + 커피 그림
        ctx.fillStyle = 'rgba(255,255,255,.85)'; rr(ctx, cx - 16, fy + 66, 32, 40, 6); ctx.fill();
        ctx.fillStyle = shade(c, 0.55); ctx.fillRect(cx - 13, fy + 80, 26, 23);
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(cx - 9, fy + 74, 7, 7); ctx.fillRect(cx + 2, fy + 76, 7, 7);
      } else { // 과자 조각
        for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#f6c46b' : '#e9a94a'; ctx.beginPath(); ctx.ellipse(cx - 22 + (i % 3) * 22, fy + 84 + Math.floor(i / 3) * 16, 11, 7, i, 0, 7); ctx.fill(); }
      }
      ctx.fillStyle = 'rgba(255,255,255,.92)'; rr(ctx, fx + 6, fy + 16, FW - 12, 44, 8); ctx.fill();
      vText(ctx, it.name, cx, fy + 32, FW - 18, 21, shade(c, 0.5));
      vText(ctx, it.sub, cx, fy + 50, FW - 20, 11, a === '#fff' ? '#333' : a, { weight: 800 });
      miniLogo(ctx, fx + FW - 20, fy + S - 26, 14);
      gloss(ctx, fx, fy, FW, S, 0.32);
      break;
    }
    case 'can': {
      const g = ctx.createLinearGradient(fx, 0, fx + FW, 0); g.addColorStop(0, shade(c, 0.7)); g.addColorStop(0.35, shade(c, 1.2)); g.addColorStop(1, shade(c, 0.75));
      ctx.fillStyle = g; ctx.fillRect(fx, fy, FW, S);
      ctx.fillStyle = '#cfd8dc'; ctx.fillRect(fx, fy, FW, 8); ctx.fillRect(fx, fy + S - 6, FW, 6);
      ctx.fillStyle = a; ctx.save(); ctx.translate(cx, fy + 64); ctx.rotate(-0.25); ctx.fillRect(-FW, -6, FW * 2, 12); ctx.restore();
      ctx.save(); ctx.translate(cx, fy + 62); ctx.rotate(-Math.PI / 2);
      vText(ctx, it.name, 0, 0, S - 30, 22, '#fff', { stroke: shade(c, 0.4) }); ctx.restore();
      vText(ctx, it.sub, cx, fy + S - 18, FW - 6, 10, '#fff', { weight: 800 });
      gloss(ctx, fx, fy, FW, S, 0.45);
      // 윗면(알루미늄 + 따개)
      ctx.fillStyle = '#b0bec5'; ctx.fillRect(TX, TY, TW, TH); ctx.fillStyle = '#90a4ae'; ctx.beginPath(); ctx.ellipse(TX + TW / 2, TY + TH / 2 - 4, 6, 9, 0, 0, 7); ctx.fill();
      break;
    }
    case 'pet': {
      // v 방향 = 병 프로파일(아래→위). 아래 2/3 내용물, 가운데 라벨 띠, 위 투명 어깨
      const liquid = it.id === 'water-pet' ? '#d6f0ff' : shade(c, 1.35);
      ctx.fillStyle = liquid; ctx.fillRect(fx, fy, FW, S);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(fx, fy, FW, 34);
      ctx.fillStyle = c; ctx.fillRect(fx, fy + 52, FW, 46);
      ctx.fillStyle = a; ctx.fillRect(fx, fy + 52, FW, 4); ctx.fillRect(fx, fy + 94, FW, 4);
      vText(ctx, it.name, cx, fy + 70, FW - 6, 18, '#fff', { stroke: shade(c, 0.4) });
      vText(ctx, it.sub, cx, fy + 87, FW - 10, 10, a, { weight: 800 });
      gloss(ctx, fx, fy, FW, S, 0.5);
      ctx.fillStyle = it.id === 'water-pet' ? '#1e88e5' : shade(c, 0.9); ctx.fillRect(TX, TY, TW, TH); // 캡
      ctx.fillStyle = 'rgba(255,255,255,.4)'; for (let i = 0; i < 5; i++) ctx.fillRect(TX + 3 + i * 6, TY, 2, TH);
      break;
    }
    case 'soju': case 'wine': {
      const glass = it.shape === 'soju' ? '#2f8f4a' : it.color;
      const g = ctx.createLinearGradient(fx, 0, fx + FW, 0); g.addColorStop(0, shade(glass, 0.55)); g.addColorStop(0.4, shade(glass, 1.25)); g.addColorStop(1, shade(glass, 0.55));
      ctx.fillStyle = g; ctx.fillRect(fx, fy, FW, S);
      const ly = it.shape === 'soju' ? 54 : 70, lh = it.shape === 'soju' ? 40 : 40;
      ctx.fillStyle = it.shape === 'soju' ? '#f1f8e9' : it.accent; ctx.fillRect(fx + 6, fy + ly, FW - 12, lh);
      if (it.shape === 'wine') { ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 1; ctx.strokeRect(fx + 9, fy + ly + 3, FW - 18, lh - 6); }
      vText(ctx, it.name, cx, fy + ly + 15, FW - 18, it.shape === 'soju' ? 15 : 13, it.shape === 'soju' ? '#1b5e20' : '#3e2723', { weight: it.shape === 'soju' ? 900 : 700 });
      vText(ctx, it.sub, cx, fy + ly + 31, FW - 20, 9, '#555', { weight: 700 });
      if (it.shape === 'wine') { ctx.fillStyle = '#7b1f2b'; ctx.fillRect(fx, fy, FW, 26); }
      gloss(ctx, fx, fy, FW, S, 0.5);
      ctx.fillStyle = it.shape === 'soju' ? '#2e7d32' : '#7b1f2b'; ctx.fillRect(TX, TY, TW, TH);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(TX + 4, TY, 4, TH);
      break;
    }
    case 'gimbap': {
      ctx.fillStyle = '#f4f7f8'; ctx.fillRect(fx, fy, FW, S); // 투명 필름
      ctx.fillStyle = '#1b1f1a'; ctx.beginPath(); ctx.moveTo(fx + 10, fy + S - 6); ctx.lineTo(fx + FW - 10, fy + S - 6); ctx.lineTo(cx, fy + 52); ctx.closePath(); ctx.fill(); // 김
      ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.moveTo(cx - 22, fy + 60); ctx.lineTo(cx + 22, fy + 60); ctx.lineTo(cx, fy + 18); ctx.closePath(); ctx.fill(); // 밥
      ctx.fillStyle = c; ctx.fillRect(fx, fy + 36, FW, 22); // 색 띠
      vText(ctx, it.name, cx, fy + 47, FW - 8, 15, '#fff');
      ctx.fillStyle = '#ffeb3b'; ctx.fillRect(cx - 3, fy, 6, S); // 뜯는 띠
      vText(ctx, '①②③', cx, fy + 100, FW, 9, '#fff', { weight: 700 });
      gloss(ctx, fx, fy, FW, S, 0.5);
      ctx.fillStyle = '#e8eef0'; ctx.fillRect(SX, SY, TW, TH); ctx.fillStyle = c; ctx.fillRect(SX, SY + 10, TW, 8);
      break;
    }
    case 'lunch': { // 앞 영역 = 윗면(투명 뚜껑 아래 반찬 칸)
      ctx.fillStyle = '#1d1d1d'; ctx.fillRect(fx, fy, FW, S);
      ctx.fillStyle = '#fafafa'; rr(ctx, fx + 5, fy + 6, FW * 0.48, S - 12, 6); ctx.fill(); // 밥
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(fx + 22, fy + 30, 3, 0, 7); ctx.fill();
      ctx.fillStyle = c; rr(ctx, fx + FW * 0.52, fy + 6, FW * 0.42, S * 0.48, 6); ctx.fill(); // 메인
      for (let i = 0; i < 5; i++) { ctx.fillStyle = shade(c, 0.7 + (i % 2) * 0.4); ctx.beginPath(); ctx.ellipse(fx + FW * 0.6 + (i % 3) * 9, fy + 20 + Math.floor(i / 3) * 18, 6, 4, i, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#d84315'; rr(ctx, fx + FW * 0.52, fy + S * 0.55, FW * 0.2, S * 0.38, 4); ctx.fill(); // 김치
      ctx.fillStyle = '#9ccc65'; rr(ctx, fx + FW * 0.74, fy + S * 0.55, FW * 0.2, S * 0.38, 4); ctx.fill(); // 나물
      ctx.fillStyle = 'rgba(255,255,255,.95)'; rr(ctx, fx + 8, fy + S - 40, FW * 0.5, 30, 4); ctx.fill(); // 라벨
      vText(ctx, it.name, fx + 8 + FW * 0.25, fy + S - 30, FW * 0.48, 11, '#c62828');
      vText(ctx, `${it.price.toLocaleString('ko-KR')}원`, fx + 8 + FW * 0.25, fy + S - 17, FW * 0.48, 10, '#111', { weight: 800 });
      gloss(ctx, fx, fy, FW, S, 0.55);
      ctx.fillStyle = '#212121'; ctx.fillRect(SX, SY, TW, TH);
      ctx.fillStyle = 'rgba(220,240,255,.55)'; ctx.fillRect(TX, TY, TW, TH); // 뚜껑 옆(투명 느낌)
      break;
    }
    case 'ice': {
      const g = ctx.createLinearGradient(fx, fy, fx, fy + S); g.addColorStop(0, shade(c, 1.2)); g.addColorStop(1, shade(c, 0.8));
      ctx.fillStyle = g; ctx.fillRect(fx, fy, FW, S);
      ctx.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(fx + 10 + i * 13, fy + 16 + (i % 2) * 8, 3, 0, 7); ctx.fill(); }
      ctx.save(); ctx.translate(cx, fy + S / 2); ctx.rotate(-Math.PI / 2); vText(ctx, it.name, 0, 0, S - 16, 24, a === '#fff' ? '#fff' : shade(c, 0.35), { stroke: a === '#fff' ? shade(c, 0.4) : null }); ctx.restore();
      gloss(ctx, fx, fy, FW, S, 0.4);
      break;
    }
    case 'gift': {
      ctx.fillStyle = c; ctx.fillRect(fx, fy, FW, S);
      ctx.fillStyle = a; ctx.fillRect(cx - 5, fy, 10, S); ctx.fillRect(fx, fy + 30, FW, 9);
      ctx.fillStyle = 'rgba(255,255,255,.95)'; rr(ctx, fx + 8, fy + 56, FW - 16, 44, 6); ctx.fill();
      vText(ctx, it.name, cx, fy + 72, FW - 22, 15, shade(c, 0.6));
      vText(ctx, it.sub, cx, fy + 90, FW - 26, 10, '#555', { weight: 700 });
      ctx.fillStyle = a; ctx.beginPath(); ctx.ellipse(cx - 9, fy + 26, 9, 6, -0.5, 0, 7); ctx.ellipse(cx + 9, fy + 26, 9, 6, 0.5, 0, 7); ctx.fill();
      gloss(ctx, fx, fy, FW, S, 0.25);
      ctx.fillStyle = c; ctx.fillRect(TX, TY, TW, TH); ctx.fillStyle = a; ctx.fillRect(TX + TW / 2 - 3, TY, 6, TH); ctx.fillRect(TX, TY + TH / 2 - 3, TW, 6);
      break;
    }
    case 'hot': {
      const g = ctx.createLinearGradient(fx, 0, fx + FW, 0); g.addColorStop(0, '#8d4a1d'); g.addColorStop(0.5, c); g.addColorStop(1, '#8d4a1d');
      ctx.fillStyle = g; ctx.fillRect(fx, fy, FW, S);
      ctx.fillStyle = 'rgba(255,220,150,.5)'; for (let i = 0; i < 18; i++) ctx.fillRect(fx + (i * 23) % FW, fy + (i * 37) % S, 4, 3);
      if (it.id === 'chicken-skewer') { ctx.fillStyle = '#b71c1c'; for (let y = 10; y < S; y += 28) { rr(ctx, fx + 6, fy + y, FW - 12, 18, 6); ctx.fill(); } }
      ctx.fillStyle = '#e8d3a8'; ctx.fillRect(SX, SY, TW, TH); // 꼬치 막대
      break;
    }
    default: ctx.fillStyle = c; ctx.fillRect(fx, fy, FW, S);
  }
  ctx.restore();
}

let ATLAS_CACHE = null;
export function buildProductAtlas() {
  const cv = document.createElement('canvas'); cv.width = ATLAS.W; cv.height = ATLAS.H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ATLAS.W, ATLAS.H);
  for (const it of CATALOG) drawCell(ctx, (it.idx % ATLAS.cols) * ATLAS.cell, Math.floor(it.idx / ATLAS.cols) * ATLAS.cell, it);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
  return { tex, canvas: cv };
}
export function productAtlasCached() { if (!ATLAS_CACHE || ATLAS_CACHE.tex.image == null) ATLAS_CACHE = buildProductAtlas(); return ATLAS_CACHE; }

// ---------- 모양 템플릿 (로컬 UV 0..1 = 칸 안) ----------
function remap(geo, region, groups = null) {
  // groups: { groupIndex: region } — 없으면 전부 region
  const uv = geo.attributes.uv;
  const set = (i, r) => { uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1])); };
  if (groups && geo.groups.length && geo.index) {
    const done = new Set();
    for (let gi = 0; gi < geo.groups.length; gi++) {
      const gr = geo.groups[gi], r = groups[gi] || region;
      for (let k = gr.start; k < gr.start + gr.count; k++) { const v = geo.index.getX(k); if (!done.has(v)) { done.add(v); set(v, r); } }
    }
  } else for (let i = 0; i < uv.count; i++) set(i, region);
  geo.clearGroups();
  return geo;
}
function lathe(profile, seg = 12) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  // LatheGeometry uv: u 둘레(0..1), v 프로파일 순서 → 그대로(앞 = 둘레 중간). 둘레 시작을 뒤로 돌려 라벨 가운데가 +z 앞에 오게
  g.rotateY(Math.PI);
  return g;
}
function pillow(w, h, d, sx = 4, sy = 5) {
  const g = new THREE.BoxGeometry(w, h, d, sx, sy, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2);
    const k = Math.max(0.18, Math.sqrt(Math.max(0, 1 - x * x * 0.85)) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(y), 3) * 0.9)));
    p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}
function prism(w, h, d) { // 삼각김밥: 앞뒤 삼각형 + 옆 3면
  const pos = [], uv = [], idx = [];
  const A = [-w / 2, 0], B = [w / 2, 0], C = [0, h];
  const tri = (z, flip) => { const b = pos.length / 3; for (const [x, y] of [A, B, C]) { pos.push(x, y, z); uv.push(FRONT[0] + (x / w + 0.5) * (FRONT[2] - FRONT[0]), FRONT[1] + (y / h) * (FRONT[3] - FRONT[1])); } idx.push(...(flip ? [b, b + 2, b + 1] : [b, b + 1, b + 2])); };
  tri(d / 2, false); tri(-d / 2, true);
  const side = (P, Q) => { const b = pos.length / 3; pos.push(P[0], P[1], d / 2, Q[0], Q[1], d / 2, Q[0], Q[1], -d / 2, P[0], P[1], -d / 2); uv.push(SIDE[0], SIDE[1], SIDE[2], SIDE[1], SIDE[2], SIDE[3], SIDE[0], SIDE[3]); idx.push(b, b + 2, b + 1, b, b + 3, b + 2); };
  side(A, B); side(B, C); side(C, A);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const BOXG = (front, top, side) => ({ 0: side, 1: side, 2: top, 3: side, 4: front, 5: front });
const prep = (g) => { if (!g.attributes.normal) g.computeVertexNormals(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; };

function buildTemplate(shape) {
  const parts = [];
  const add = (g) => parts.push(prep(g));
  switch (shape) {
    case 'cupRamen': {
      const side = new THREE.CylinderGeometry(0.059, 0.045, 0.108, 10, 1, true); side.rotateY(Math.PI); side.translate(0, 0.054, 0); add(remap(side, FRONT));
      const lid = new THREE.CylinderGeometry(0.062, 0.062, 0.006, 10, 1); lid.translate(0, 0.111, 0); add(remap(lid, TOP));
      const bot = new THREE.CircleGeometry(0.045, 10); bot.rotateX(Math.PI / 2); bot.translate(0, 0.001, 0); add(remap(bot, SIDE));
      break;
    }
    case 'bagSnack': {
      const b = pillow(0.16, 0.21, 0.07); b.translate(0, 0.115, 0); add(remap(b, FRONT, BOXG(FRONT, SIDE, SIDE)));
      for (const y of [0.006, 0.224]) { const c = new THREE.BoxGeometry(0.162, 0.014, 0.012); c.translate(0, y, 0); add(remap(c, SIDE)); }
      break;
    }
    case 'pouch': {
      const b = pillow(0.1, 0.15, 0.04, 3, 4); b.translate(0, 0.075, 0); add(remap(b, FRONT, BOXG(FRONT, SIDE, SIDE)));
      const s = new THREE.CylinderGeometry(0.009, 0.009, 0.02, 8); s.translate(0.02, 0.16, 0); add(remap(s, TOP));
      break;
    }
    case 'ice': {
      const b = pillow(0.06, 0.17, 0.03, 2, 4); b.translate(0, 0.085, 0); add(remap(b, FRONT, BOXG(FRONT, SIDE, SIDE)));
      break;
    }
    case 'can': {
      const s = new THREE.CylinderGeometry(0.033, 0.033, 0.112, 10, 1, true); s.rotateY(Math.PI); s.translate(0, 0.058, 0); add(remap(s, FRONT));
      const t = new THREE.CylinderGeometry(0.029, 0.033, 0.009, 10, 1); t.translate(0, 0.1185, 0); add(remap(t, TOP));
      const bt = new THREE.CylinderGeometry(0.033, 0.028, 0.005, 10, 1); bt.translate(0, 0.0025, 0); add(remap(bt, TOP));
      break;
    }
    case 'pet': {
      const l = lathe([[0.001, 0], [0.03, 0.002], [0.034, 0.012], [0.033, 0.06], [0.031, 0.075], [0.034, 0.09], [0.034, 0.15], [0.026, 0.178], [0.015, 0.197], [0.0135, 0.205]], 9);
      add(remap(l, FRONT));
      const cap = new THREE.CylinderGeometry(0.0155, 0.0155, 0.02, 7); cap.translate(0, 0.215, 0); add(remap(cap, TOP));
      break;
    }
    case 'soju': {
      const l = lathe([[0.001, 0], [0.029, 0.002], [0.031, 0.01], [0.031, 0.13], [0.024, 0.16], [0.0135, 0.185], [0.0125, 0.207]], 9);
      add(remap(l, FRONT));
      const cap = new THREE.CylinderGeometry(0.0145, 0.0145, 0.018, 7); cap.translate(0, 0.215, 0); add(remap(cap, TOP));
      break;
    }
    case 'wine': {
      const l = lathe([[0.001, 0.004], [0.034, 0], [0.038, 0.01], [0.038, 0.19], [0.03, 0.22], [0.016, 0.245], [0.0145, 0.27]], 9);
      add(remap(l, FRONT));
      const foil = new THREE.CylinderGeometry(0.0155, 0.0155, 0.045, 10); foil.translate(0, 0.287, 0); add(remap(foil, TOP));
      break;
    }
    case 'gimbap': { const g = prism(0.115, 0.1, 0.038); add(g); break; }
    case 'lunch': {
      const base = new THREE.BoxGeometry(0.19, 0.045, 0.13); base.translate(0, 0.0225, 0); add(remap(base, SIDE, BOXG(SIDE, FRONT, SIDE)));
      const lid = new THREE.BoxGeometry(0.18, 0.022, 0.12); lid.translate(0, 0.056, 0); add(remap(lid, TOP, BOXG(TOP, FRONT, TOP)));
      break;
    }
    case 'gift': {
      const b = new THREE.BoxGeometry(0.22, 0.16, 0.08); b.translate(0, 0.08, 0); add(remap(b, FRONT, BOXG(FRONT, TOP, TOP)));
      break;
    }
    case 'hot': {
      const c = new THREE.CapsuleGeometry(0.024, 0.11, 3, 8); c.translate(0, 0.08, 0); add(remap(c, FRONT));
      const st = new THREE.CylinderGeometry(0.004, 0.004, 0.06, 5); st.translate(0, 0.0, 0); add(remap(st, SIDE));
      break;
    }
    default: add(remap(new THREE.BoxGeometry(0.1, 0.1, 0.1), FRONT));
  }
  const nonIdx = parts.map((g) => (g.index ? g : g));
  const g = mergeGeometries(nonIdx.map((x) => (x.index ? x : x)), false);
  for (const p of parts) p.dispose();
  g.computeBoundingBox();
  return g;
}
const TEMPLATES = new Map();
export function productTemplate(shape) {
  if (!TEMPLATES.has(shape)) TEMPLATES.set(shape, buildTemplate(shape));
  return TEMPLATES.get(shape);
}

// 여러 상품을 한 지오메트리로 굽는다 (UV → 아틀라스 칸) — 정적 진열·바구니 내용물 공용
const _m3 = new THREE.Matrix3(), _v = new THREE.Vector3();
export class ProductBatch {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; this.count = 0; }
  add(item, matrix) {
    const t = productTemplate(item.shape);
    const P = t.attributes.position, N = t.attributes.normal, U = t.attributes.uv, I = t.index;
    const base = this.pos.length / 3;
    _m3.getNormalMatrix(matrix);
    const col = item.idx % ATLAS.cols, row = Math.floor(item.idx / ATLAS.cols), k = 1 / ATLAS.cols;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(matrix); this.pos.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(N, i).applyMatrix3(_m3).normalize(); this.nor.push(_v.x, _v.y, _v.z);
      this.uv.push((col + U.getX(i)) * k, 1 - (row + 1) * k + U.getY(i) * k);
    }
    if (I) for (let i = 0; i < I.count; i++) this.idx.push(base + I.getX(i));
    else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    this.count++;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx.length > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
export function singleProductGeometry(item) { const b = new ProductBatch(); b.add(item, new THREE.Matrix4()); return b.build(); }

// ---------- 시드·진열 계획 ----------
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hashSeed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function todayKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

/** 매장+날짜 시드: 존별 상품 순서 섞기 + 오늘의 할인(고가 제외) 1~2종 */
export function planLayout(storeId, dateKey = todayKey()) {
  const rng = makeRng(hashSeed(`${storeId}|${dateKey}|bump24`));
  const byZone = {};
  for (const p of CATALOG) (byZone[p.zone] ||= []).push(p);
  for (const arr of Object.values(byZone)) for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  const pool = CATALOG.filter((p) => !p.expensive && p.zone !== 'hot');
  const saleIds = [];
  const n = rng() < 0.55 ? 2 : 1;
  while (saleIds.length < n) { const p = pool[Math.floor(rng() * pool.length)]; if (!saleIds.includes(p.id)) saleIds.push(p.id); }
  return { byZone, saleIds, rng, seed: hashSeed(`${storeId}|${dateKey}`), dateKey, storeId };
}
export const scoreOf = (item, saleIds) => item.price * (saleIds?.includes(item.id) ? 2 : 1);
