// [bump24game] 상품 카탈로그 · 포장 아틀라스 · 저폴리 모양. InstancedMesh 로 진열.
import * as THREE from 'three';

const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';

// shapeId → 기하 생성기. 단위 m. 원점은 바닥 중심.
export const SHAPES = {
  cupRamen: { w: 0.11, h: 0.12, d: 0.11, heavy: 0.08 },
  bagSnack: { w: 0.16, h: 0.22, d: 0.06, heavy: 0.06 },
  can: { w: 0.066, h: 0.12, d: 0.066, heavy: 0.25 },
  pet: { w: 0.07, h: 0.22, d: 0.07, heavy: 0.5 },
  gimbap: { w: 0.12, h: 0.05, d: 0.12, heavy: 0.15 },
  lunch: { w: 0.18, h: 0.06, d: 0.12, heavy: 0.4 },
  ice: { w: 0.05, h: 0.12, d: 0.05, heavy: 0.08 },
  soju: { w: 0.06, h: 0.22, d: 0.06, heavy: 0.36 },
  wine: { w: 0.075, h: 0.3, d: 0.075, heavy: 0.75 },
  gift: { w: 0.18, h: 0.14, d: 0.08, heavy: 0.35 },
  pouch: { w: 0.1, h: 0.16, d: 0.04, heavy: 0.2 },
  hot: { w: 0.06, h: 0.04, d: 0.18, heavy: 0.12 },
};

// 패러디 상품 (실제 브랜드명 변형). 가격=원, weight=kg
export const CATALOG = [
  // 컵라면 (입구 근처, 싸게)
  { id: 'shin-cup', name: '신맛면 컵', shape: 'cupRamen', price: 1500, weight: 0.08, color: '#c62828', zone: 'ramen', sale: true },
  { id: 'yukgaejang-cup', name: '육개장 사발', shape: 'cupRamen', price: 1600, weight: 0.09, color: '#ef6c00', zone: 'ramen' },
  { id: 'jjajang-cup', name: '짜장큰사발', shape: 'cupRamen', price: 1700, weight: 0.1, color: '#5d4037', zone: 'ramen' },
  { id: 'cheese-cup', name: '치즈라면컵', shape: 'cupRamen', price: 1800, weight: 0.09, color: '#f9a825', zone: 'ramen' },
  // 봉지과자
  { id: 'shrimp-chip', name: '새우바삭', shape: 'bagSnack', price: 1700, weight: 0.09, color: '#e53935', zone: 'snack' },
  { id: 'honey-twist', name: '허니꽈배기', shape: 'bagSnack', price: 1500, weight: 0.08, color: '#fb8c00', zone: 'snack' },
  { id: 'onion-ring', name: '양파링스', shape: 'bagSnack', price: 1600, weight: 0.08, color: '#fdd835', zone: 'snack' },
  { id: 'chocobar', name: '초코파이바', shape: 'bagSnack', price: 2000, weight: 0.12, color: '#6d4c41', zone: 'snack' },
  { id: 'potato-chip', name: '포테토칩', shape: 'bagSnack', price: 1800, weight: 0.1, color: '#43a047', zone: 'snack' },
  // 캔
  { id: 'cola-can', name: '콜라맛', shape: 'can', price: 1500, weight: 0.35, color: '#b71c1c', zone: 'drink' },
  { id: 'soda-can', name: '사이다톡', shape: 'can', price: 1400, weight: 0.34, color: '#26a69a', zone: 'drink' },
  { id: 'coffee-can', name: '모닝커피', shape: 'can', price: 1800, weight: 0.28, color: '#4e342e', zone: 'drink' },
  { id: 'energy-can', name: '파워샷', shape: 'can', price: 2200, weight: 0.3, color: '#1565c0', zone: 'drink' },
  // 페트
  { id: 'water-pet', name: '청정수 500', shape: 'pet', price: 1000, weight: 0.52, color: '#90caf9', zone: 'drink' },
  { id: 'tea-pet', name: '녹차한모금', shape: 'pet', price: 1600, weight: 0.5, color: '#81c784', zone: 'drink' },
  { id: 'juice-pet', name: '오렌지톡', shape: 'pet', price: 1800, weight: 0.5, color: '#ffb74d', zone: 'drink' },
  // 삼각김밥·도시락 (중가)
  { id: 'tuna-gimbap', name: '참치마요김밥', shape: 'gimbap', price: 1500, weight: 0.14, color: '#fffde7', zone: 'fresh' },
  { id: 'bulgogi-gimbap', name: '불고기삼각', shape: 'gimbap', price: 1700, weight: 0.15, color: '#ffe0b2', zone: 'fresh' },
  { id: 'kimchi-gimbap', name: '김치참치삼각', shape: 'gimbap', price: 1600, weight: 0.14, color: '#ffcdd2', zone: 'fresh' },
  { id: 'bulgogi-lunch', name: '불고기도시락', shape: 'lunch', price: 5500, weight: 0.45, color: '#efebe9', zone: 'fresh', sale: true },
  { id: 'chicken-lunch', name: '치킨마요도시락', shape: 'lunch', price: 5200, weight: 0.42, color: '#fff8e1', zone: 'fresh' },
  { id: 'bibimbap-lunch', name: '비빔밥도시락', shape: 'lunch', price: 4800, weight: 0.4, color: '#e8f5e9', zone: 'fresh' },
  // 아이스크림
  { id: 'bar-ice', name: '바나나바', shape: 'ice', price: 1200, weight: 0.08, color: '#fff59d', zone: 'freezer' },
  { id: 'cone-ice', name: '초코콘', shape: 'ice', price: 1800, weight: 0.1, color: '#a1887f', zone: 'freezer' },
  { id: 'melon-ice', name: '메론바', shape: 'ice', price: 1500, weight: 0.09, color: '#a5d6a7', zone: 'freezer' },
  // 파우치 음료
  { id: 'americano-pouch', name: '아메리카노파우치', shape: 'pouch', price: 2100, weight: 0.2, color: '#ef6c00', zone: 'pouch' },
  { id: 'latte-pouch', name: '카페라떼파우치', shape: 'pouch', price: 2300, weight: 0.21, color: '#5d4037', zone: 'pouch' },
  { id: 'ade-pouch', name: '레몬에이드톡', shape: 'pouch', price: 2000, weight: 0.2, color: '#fdd835', zone: 'pouch' },
  // 온장·핫푸드
  { id: 'chicken-skewer', name: '치킨꼬치', shape: 'hot', price: 3500, weight: 0.15, color: '#ff8a65', zone: 'hot' },
  { id: 'corndog', name: '핫도그바', shape: 'hot', price: 2800, weight: 0.14, color: '#ffcc80', zone: 'hot' },
  // 주류·선물 (비싸고 멀리)
  { id: 'soju-clear', name: '맑은이슬', shape: 'soju', price: 2000, weight: 0.37, color: '#e8f5e9', zone: 'alcohol' },
  { id: 'soju-fresh', name: '청하톡', shape: 'soju', price: 2200, weight: 0.37, color: '#e3f2fd', zone: 'alcohol' },
  { id: 'wine-red', name: '레드하우스 와인', shape: 'wine', price: 18900, weight: 0.85, color: '#4a148c', zone: 'alcohol', expensive: true },
  { id: 'wine-white', name: '화이트하우스 와인', shape: 'wine', price: 16900, weight: 0.8, color: '#fff8e1', zone: 'alcohol', expensive: true },
  { id: 'gift-choco', name: '초코데이 세트', shape: 'gift', price: 12900, weight: 0.4, color: '#c62828', zone: 'gift', expensive: true },
  { id: 'gift-cookie', name: '쿠키박스 세트', shape: 'gift', price: 9900, weight: 0.35, color: '#1565c0', zone: 'gift', expensive: true },
  { id: 'gift-tea', name: '티타임 세트', shape: 'gift', price: 14900, weight: 0.45, color: '#2e7d32', zone: 'gift', expensive: true },
];

export const BY_ID = Object.fromEntries(CATALOG.map((p) => [p.id, p]));
export const BASKET_MAX_KG = 6.5;

const ATLAS = { W: 1024, H: 1024, cell: 128 }; // 8×8 = 64 슬롯
const SHAPE_ORDER = Object.keys(SHAPES);

function cellUV(i) {
  const cols = ATLAS.W / ATLAS.cell;
  const c = i % cols, r = Math.floor(i / cols);
  const pad = 2 / ATLAS.W;
  const u0 = c / cols + pad, u1 = (c + 1) / cols - pad;
  const v1 = 1 - r / (ATLAS.H / ATLAS.cell) - pad;
  const v0 = 1 - (r + 1) / (ATLAS.H / ATLAS.cell) + pad;
  return [u0, v0, u1, v1];
}

function drawPack(ctx, x, y, s, item, i) {
  const { color, name, shape, price } = item;
  ctx.save();
  ctx.translate(x, y);
  // 배경
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, shade(color, 1.15));
  g.addColorStop(1, shade(color, 0.75));
  ctx.fillStyle = g;
  roundRect(ctx, 4, 4, s - 8, s - 8, 10); ctx.fill();

  // 상단 흰 띠 / 로고 영역
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(ctx, 10, 10, s - 20, 28, 6); ctx.fill();
  ctx.fillStyle = '#0072DD';
  ctx.font = `900 11px ${FONT}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('BUMP24', 16, 24);

  // 상품명
  ctx.fillStyle = isLight(color) ? '#1a1a1a' : '#ffffff';
  ctx.shadowColor = isLight(color) ? 'transparent' : 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 3;
  let fs = 18;
  ctx.font = `900 ${fs}px ${FONT}`;
  while (fs > 11 && ctx.measureText(name).width > s - 24) { fs -= 1; ctx.font = `900 ${fs}px ${FONT}`; }
  ctx.textAlign = 'center';
  ctx.fillText(name, s / 2, s * 0.48);
  ctx.shadowBlur = 0;

  // 모양 실루엣 힌트
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#fff';
  drawSilhouette(ctx, shape, s / 2, s * 0.72, s * 0.28);
  ctx.globalAlpha = 1;

  // 가격 태그
  ctx.fillStyle = '#ffe14d';
  roundRect(ctx, s - 54, s - 28, 44, 18, 4); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = `800 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${(price / 1000).toFixed(price % 1000 ? 1 : 0)}천`, s - 32, s - 17);

  // 슬롯 인덱스(디버그용 거의 안 보임)
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.font = `600 9px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(String(i), 8, s - 8);
  ctx.restore();
}

function drawSilhouette(ctx, shape, cx, cy, r) {
  ctx.beginPath();
  if (shape === 'cupRamen') { ctx.moveTo(cx - r * 0.55, cy + r * 0.5); ctx.lineTo(cx - r * 0.4, cy - r * 0.5); ctx.lineTo(cx + r * 0.4, cy - r * 0.5); ctx.lineTo(cx + r * 0.55, cy + r * 0.5); }
  else if (shape === 'can' || shape === 'pet' || shape === 'soju' || shape === 'wine' || shape === 'ice') {
    ctx.ellipse(cx, cy, r * 0.35, r * 0.55, 0, 0, Math.PI * 2);
  } else if (shape === 'bagSnack' || shape === 'pouch') {
    ctx.moveTo(cx - r * 0.45, cy - r * 0.5); ctx.quadraticCurveTo(cx, cy - r * 0.65, cx + r * 0.45, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.5); ctx.quadraticCurveTo(cx, cy + r * 0.6, cx - r * 0.5, cy + r * 0.5);
  } else {
    ctx.roundRect?.(cx - r * 0.5, cy - r * 0.35, r, r * 0.7, 4) || ctx.rect(cx - r * 0.5, cy - r * 0.35, r, r * 0.7);
  }
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k);
  return `#${c.getHexString()}`;
}
function isLight(hex) {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.65;
}

export function buildProductAtlas() {
  const cv = document.createElement('canvas');
  cv.width = ATLAS.W; cv.height = ATLAS.H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f0f2f4';
  ctx.fillRect(0, 0, ATLAS.W, ATLAS.H);
  const uvs = {};
  CATALOG.forEach((item, i) => {
    const cols = ATLAS.W / ATLAS.cell;
    const c = i % cols, r = Math.floor(i / cols);
    drawPack(ctx, c * ATLAS.cell, r * ATLAS.cell, ATLAS.cell, item, i);
    uvs[item.id] = cellUV(i);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return { tex, uvs, canvas: cv };
}

function geoBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  return g;
}

function geoCylinder(r, h, seg = 10) {
  return new THREE.CylinderGeometry(r, r, h, seg);
}

function geoBottle(r, h) {
  const g = new THREE.CylinderGeometry(r * 0.85, r, h * 0.78, 10);
  // neck as separate would cost instances — bake scale in matrix instead; single cylinder is fine
  return g;
}

export function buildShapeGeometries() {
  return {
    cupRamen: geoCylinder(0.055, 0.11, 12),
    bagSnack: geoBox(0.14, 0.2, 0.05),
    can: geoCylinder(0.033, 0.115, 12),
    pet: geoBottle(0.033, 0.2),
    gimbap: geoBox(0.11, 0.045, 0.11),
    lunch: geoBox(0.17, 0.055, 0.11),
    ice: geoBox(0.04, 0.11, 0.04),
    soju: geoBottle(0.028, 0.2),
    wine: geoBottle(0.035, 0.28),
    gift: geoBox(0.16, 0.12, 0.07),
    pouch: geoBox(0.09, 0.15, 0.035),
    hot: geoBox(0.05, 0.035, 0.16),
  };
}

/** 시드 RNG (mulberry32) */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 매장+날짜 시드로 진열 배치와 오늘의 할인 상품을 뽑는다 */
export function planLayout(storeId, dateKey = todayKey()) {
  const rng = makeRng(hashSeed(`${storeId}|${dateKey}|bump24`));
  const byZone = {};
  for (const p of CATALOG) { (byZone[p.zone] ||= []).push(p); }
  for (const z of Object.keys(byZone)) {
    const arr = byZone[z];
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  }
  const salePool = CATALOG.filter((p) => !p.expensive);
  const sale = [];
  const n = 1 + (rng() < 0.55 ? 1 : 0);
  const used = new Set();
  while (sale.length < n && salePool.length) {
    const p = salePool[Math.floor(rng() * salePool.length)];
    if (used.has(p.id)) continue;
    used.add(p.id); sale.push(p.id);
  }
  return { byZone, saleIds: sale, seed: hashSeed(`${storeId}|${dateKey}`), dateKey, storeId };
}

export function scoreOf(item, saleIds) {
  const mult = saleIds?.includes(item.id) ? 2 : 1;
  return item.price * mult;
}
