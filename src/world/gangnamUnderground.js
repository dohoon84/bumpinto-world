// 강남역 지하상가 실내 장면. 지상 출입구로 내려오면 만들어지고, 나가면 dispose.
// 정자역 대합실과 같은 약속: update 가 enteredPassage / wellEnter / transferEnter 를 돌려 준다.
import * as THREE from 'three';
import { createBuilder, createAtlas, FONT, fitText, lineBadge, roundRect, exitNumber } from '../subway/geom.js';
import { LOOKS } from '../subway/looks.js';
import { buildCrowd } from '../entities/avatarCrowd.js';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { isMobileMode } from '../mobile/flag.js';
import {
  CEIL, HALF, SHOP_D, OPEN_W, EW, NORTH_Z, SOUTH_Z, PLAZA, FOOD, L2HALL, PASSAGE_LEN, TYPES,
  buildLayout, walkable, passageAt, laneAt, nearWellTop, wellMouth, nearTransfer, nearBench,
} from './gangnamUndergroundLayout.js';

export function gangnamUnderEnabled(search = typeof location !== 'undefined' ? location.search : null) {
  if (search == null) {
    const env = typeof process !== 'undefined' ? process.env || {} : {};
    return env.GUNDER !== '0' && env.GANGNAM !== '0';
  }
  const q = new URLSearchParams(search);
  return q.get('gunder') !== '0' && q.get('gangnam') !== '0';
}

const WELL_INTO = -0.35;

export function buildGangnamUnderground({ exits, entryId, look, renderer, onToast, theme, spawn = null }) {
  const L = buildLayout(exits || []);
  const P = theme?.primary || { color: '#00A84D', short: '2호선' };
  const X = theme?.transfer || { color: '#D4003B', short: '신분당' };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1c1e22');
  scene.add(new THREE.HemisphereLight('#fff6ea', '#8a8378', 1.85));
  const dl = new THREE.DirectionalLight('#fff3dd', 0.38);
  dl.position.set(6, 18, 4);
  scene.add(dl);

  const disposables = [];
  const S = createBuilder();
  const G = createBuilder();
  const atlas = createAtlas(2048, 4096, 'gunder');
  const white = atlas.add(8, 8, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); });

  const wallCol = '#e7e1d4';
  const dadoCol = '#6a7380';
  const ceilCol = '#f3efe6';
  const wallX = (x, z0, z1) => {
    if (z1 - z0 < 0.08) return;
    S.block(x, 0, (z0 + z1) / 2, 0.28, CEIL, z1 - z0, wallCol);
    S.block(x, 0, (z0 + z1) / 2, 0.34, 1.12, z1 - z0, dadoCol);
  };
  const wallZ = (z, x0, x1) => {
    if (x1 - x0 < 0.08) return;
    S.block((x0 + x1) / 2, 0, z, x1 - x0, CEIL, 0.28, wallCol);
    S.block((x0 + x1) / 2, 0, z, x1 - x0, 1.12, 0.34, dadoCol);
  };

  // ---------- 외벽 ----------
  wallX(EW.x0 - 0.14, -HALF, -2.6); wallX(EW.x0 - 0.14, 2.6, HALF);
  wallX(EW.x1 + 0.14, -HALF, -2.6); wallX(EW.x1 + 0.14, 2.6, HALF);
  wallZ(NORTH_Z - 0.14, -HALF, -2.6); wallZ(NORTH_Z - 0.14, 2.6, HALF);
  wallZ(SOUTH_Z + 0.14, -HALF, HALF);
  // 교차 광장 북/남, 날개로 안 열리는 구간
  wallZ(-HALF, PLAZA.x0, -HALF); wallZ(-HALF, HALF, PLAZA.x1);
  wallZ(HALF, PLAZA.x0, -HALF); wallZ(HALF, HALF, PLAZA.x1);
  // 동서 본선 북측: 광장~2호선 홀 사이 짧은 벽
  wallZ(-HALF, 10.2, L2HALL.x0);
  // 2호선 홀 상자 (남쪽은 개찰)
  wallX(L2HALL.x0, L2HALL.z0, L2HALL.z1);
  wallX(L2HALL.x1, L2HALL.z0, L2HALL.z1);
  wallZ(L2HALL.z0, L2HALL.x0, L2HALL.x1);
  wallZ(L2HALL.z1, L2HALL.x0, 14.4);
  wallZ(L2HALL.z1, 24.9, L2HALL.x1);
  // 푸드존 외곽
  wallX(-FOOD.hw, FOOD.z0, FOOD.z1);
  wallX(FOOD.hw, FOOD.z0, FOOD.z1);
  wallZ(FOOD.z0, -FOOD.hw, -HALF);
  wallZ(FOOD.z0, HALF, FOOD.hw);
  wallZ(FOOD.z1, -FOOD.hw, -HALF);
  wallZ(FOOD.z1, HALF, FOOD.hw);
  // 남쪽 날개 옆벽 (가게가 없는 푸드 이후 + 출구 옆문 틈)
  wallX(-HALF - SHOP_D, FOOD.z1, 54.1);
  wallX(HALF + SHOP_D, FOOD.z1, 54.1);
  wallX(-HALF - SHOP_D, 59.1, SOUTH_Z);
  wallX(HALF + SHOP_D, 59.1, SOUTH_Z);
  wallZ(54.1, -HALF - SHOP_D, -HALF);
  wallZ(54.1, HALF, HALF + SHOP_D);
  wallZ(59.1, -HALF - SHOP_D, -HALF);
  wallZ(59.1, HALF, HALF + SHOP_D);

  // ---------- 천장 ----------
  const ceilSlab = (x0, x1, z0, z1) => S.box((x0 + x1) / 2, CEIL + 0.05, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0, ceilCol);
  ceilSlab(EW.x0 - 0.4, EW.x1 + 0.4, -HALF - SHOP_D - 0.2, HALF + SHOP_D + 0.2);
  ceilSlab(-HALF - SHOP_D - 0.2, HALF + SHOP_D + 0.2, NORTH_Z - 0.4, -HALF);
  ceilSlab(-HALF - SHOP_D - 0.2, HALF + SHOP_D + 0.2, HALF, SOUTH_Z + 0.4);
  ceilSlab(L2HALL.x0 - 0.2, L2HALL.x1 + 0.2, L2HALL.z0 - 0.2, -HALF);
  ceilSlab(-FOOD.hw - 0.2, FOOD.hw + 0.2, FOOD.z0, FOOD.z1);
  // 통로 바닥 바탕 (타일 인스턴스가 빠져도 아래가 뚫려 보이지 않게)
  const floorBase = (x0, x1, z0, z1, col = '#d5ccbe') => {
    S.box((x0 + x1) / 2, -0.03, (z0 + z1) / 2, x1 - x0, 0.06, z1 - z0, col);
  };
  const stripe = (x0, x1, z0, z1, alongX = true) => {
    const step = 1.6;
    if (alongX) {
      for (let x = x0, i = 0; x < x1; x += step, i++) {
        S.box(x + step / 2, 0.012, (z0 + z1) / 2, Math.min(step, x1 - x) - 0.04, 0.025, z1 - z0, i & 1 ? '#ddd4c6' : '#cfc6b6');
      }
    } else {
      for (let z = z0, i = 0; z < z1; z += step, i++) {
        S.box((x0 + x1) / 2, 0.012, z + step / 2, x1 - x0, 0.025, Math.min(step, z1 - z) - 0.04, i & 1 ? '#ddd4c6' : '#cfc6b6');
      }
    }
  };
  floorBase(EW.x0, EW.x1, -HALF, HALF);
  stripe(EW.x0, EW.x1, -HALF, HALF, true);
  floorBase(-HALF, HALF, NORTH_Z, -HALF, '#d2c9bb');
  stripe(-HALF, HALF, NORTH_Z, -HALF, false);
  floorBase(-HALF, HALF, HALF, SOUTH_Z, '#d2c9bb');
  stripe(-HALF, HALF, HALF, SOUTH_Z, false);
  floorBase(L2HALL.x0, L2HALL.x1, L2HALL.z0, L2HALL.z1, '#cfc8bc');
  stripe(L2HALL.x0, L2HALL.x1, L2HALL.z0, L2HALL.z1, true);
  floorBase(-FOOD.hw, FOOD.hw, FOOD.z0, FOOD.z1, '#d8cbb8');
  stripe(-FOOD.hw, FOOD.hw, FOOD.z0, FOOD.z1, true);

  // ---------- 가게 ----------
  const signFor = (shop) => atlas.add(240, 70, (c, w, h) => {
    const T = TYPES[shop.type];
    c.fillStyle = T.accent; c.fillRect(0, 0, w, h);
    c.fillStyle = shop.type === 'phone' ? '#e7f5ff' : '#fff';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    fitText(c, shop.name, w - 16, 30, 800); c.fillText(shop.name, w / 2, h * 0.4);
    c.font = `600 15px ${FONT}`; c.globalAlpha = 0.92; c.fillText(shop.nameEn, w / 2, h * 0.76); c.globalAlpha = 1;
  });

  const faceRy = (shop) => {
    if (shop.axis === 'x') return shop.side < 0 ? 0 : Math.PI;
    return shop.side < 0 ? Math.PI / 2 : -Math.PI / 2;
  };
  const frontPos = (shop, inset = 0.02) => {
    if (shop.axis === 'x') return { x: shop.cx, z: shop.side < 0 ? shop.z1 + inset : shop.z0 - inset };
    return { x: shop.side < 0 ? shop.x1 + inset : shop.x0 - inset, z: shop.cz };
  };

  function dressShop(shop) {
    const T = TYPES[shop.type];
    const bw = shop.x1 - shop.x0, bd = shop.z1 - shop.z0;
    S.block(shop.cx, 0, shop.cz, bw, 0.035, bd, T.floor);
    // 벽
    if (shop.axis === 'x') {
      S.block(shop.x0 + 0.07, 0, shop.cz, 0.14, CEIL, bd, T.wall);
      S.block(shop.x1 - 0.07, 0, shop.cz, 0.14, CEIL, bd, T.wall);
      if (shop.side < 0) S.block(shop.cx, 0, shop.z0 + 0.07, bw, CEIL, 0.14, T.wall);
      else S.block(shop.cx, 0, shop.z1 - 0.07, bw, CEIL, 0.14, T.wall);
      const mid = shop.cx, gap = OPEN_W / 2, zf = shop.side < 0 ? shop.z1 - 0.06 : shop.z0 + 0.06;
      S.block((shop.x0 + mid - gap) / 2, 0, zf, mid - gap - shop.x0, CEIL, 0.12, T.wall);
      S.block((shop.x1 + mid + gap) / 2, 0, zf, shop.x1 - (mid + gap), CEIL, 0.12, T.wall);
      S.block(shop.cx, 2.55, zf, bw, CEIL - 2.55, 0.14, T.accent);
    } else {
      S.block(shop.cx, 0, shop.z0 + 0.07, bw, CEIL, 0.14, T.wall);
      S.block(shop.cx, 0, shop.z1 - 0.07, bw, CEIL, 0.14, T.wall);
      if (shop.side < 0) S.block(shop.x0 + 0.07, 0, shop.cz, 0.14, CEIL, bd, T.wall);
      else S.block(shop.x1 - 0.07, 0, shop.cz, 0.14, CEIL, bd, T.wall);
      const mid = shop.cz, gap = OPEN_W / 2, xf = shop.side < 0 ? shop.x1 - 0.06 : shop.x0 + 0.06;
      S.block(xf, 0, (shop.z0 + mid - gap) / 2, 0.12, CEIL, mid - gap - shop.z0, T.wall);
      S.block(xf, 0, (shop.z1 + mid + gap) / 2, 0.12, CEIL, shop.z1 - (mid + gap), T.wall);
      S.block(xf, 2.55, shop.cz, 0.14, CEIL - 2.55, bd, T.accent);
    }
    const ry = faceRy(shop);
    const fp = frontPos(shop, 0.09);
    const uv = signFor(shop);
    G.quad(fp.x, 2.72, fp.z, 2.15, 0.58, '#ffffff', { ry, uv });
    // 가운데는 열어 두어 통로에서 진열이 보이게 한다 (불투명 유리는 쓰지 않음)
    // 안쪽 조명 띠
    G.quad(shop.cx, CEIL - 0.06, shop.cz, Math.min(bw, bd) * 0.7, 0.28, '#fff7e6', { rx: Math.PI / 2, uv: white });
    fillGoods(shop, T);
  }

  function fillGoods(shop, T) {
    const back = shop.axis === 'x'
      ? { x: shop.cx, z: shop.side < 0 ? shop.z0 + 0.55 : shop.z1 - 0.55 }
      : { x: shop.side < 0 ? shop.x0 + 0.55 : shop.x1 - 0.55, z: shop.cz };
    const along = (t) => (shop.axis === 'x'
      ? { x: shop.cx + t, z: back.z }
      : { x: back.x, z: shop.cz + t });
    const cols = ['#fa5252', '#ff922b', '#ffd43b', '#51cf66', '#339af0', '#cc5de8', '#f783ac', '#22b8cf', '#f8f9fa', '#212529'];
    if (shop.type === 'fashion' || shop.type === 'shoes') {
      const near = shop.axis === 'x'
        ? { x: shop.cx, z: shop.side < 0 ? shop.z1 - 1.15 : shop.z0 + 1.15 }
        : { x: shop.side < 0 ? shop.x1 - 1.15 : shop.x0 + 1.15, z: shop.cz };
      S.cyl(near.x, 0, near.z, 0.05, 2.0, '#868e96', 6);
      S.box(near.x, 1.92, near.z, 0.9, 0.04, 0.26, '#495057');
      for (let k = 0; k < 4; k++) S.box(near.x - 0.32 + (k % 2) * 0.42, 1.2 - Math.floor(k / 2) * 0.65, near.z, 0.26, 0.58, 0.08, cols[(shop.id + k + 2) % cols.length]);
      for (const t of [-1.15, 0, 1.15]) {
        const p = along(t);
        S.cyl(p.x, 0, p.z, 0.05, 2.05, '#868e96', 6);
        S.box(p.x, 1.95, p.z, 0.95, 0.04, 0.28, '#495057');
        for (let k = 0; k < (shop.rich ? 6 : 4); k++) {
          S.box(p.x - 0.35 + (k % 3) * 0.35, 1.15 - Math.floor(k / 3) * 0.7, p.z, 0.28, 0.62, 0.08, cols[(shop.id + k) % cols.length]);
        }
      }
    } else if (shop.type === 'accessories' || shop.type === 'cosmetics' || shop.type === 'phone') {
      S.block(back.x, 0, back.z, shop.axis === 'x' ? 3.2 : 0.28, 2.15, shop.axis === 'x' ? 0.28 : 3.2, '#dee2e6');
      for (let row = 0; row < 4; row++) for (let col = 0; col < (shop.rich ? 8 : 6); col++) {
        const t = -1.35 + col * 0.38, y = 0.35 + row * 0.48;
        const p = along(t);
        const c = cols[(shop.id + row * 3 + col) % cols.length];
        if (shop.type === 'phone') S.box(p.x, y, p.z, 0.22, 0.38, 0.06, c);
        else if (shop.type === 'cosmetics') S.cyl(p.x, y - 0.12, p.z, 0.06, 0.28, c, 6);
        else S.box(p.x, y, p.z, 0.16, 0.16, 0.06, c);
      }
    } else if (shop.type === 'cafe') {
      const p = along(0);
      S.block(p.x, 0, p.z, 2.4, 1.05, 0.7, '#7c4a1e');
      S.block(p.x, 1.05, p.z, 2.5, 0.06, 0.78, '#f1f3f5');
      S.cyl(p.x - 0.6, 1.11, p.z, 0.16, 0.22, '#212529', 8);
      S.box(p.x + 0.5, 1.2, p.z, 0.55, 0.28, 0.4, '#e8590c');
    } else if (shop.type === 'snack') {
      const p = along(0);
      S.block(p.x, 0, p.z, 2.6, 1.0, 0.72, '#e8590c');
      S.block(p.x, 1.0, p.z, 2.7, 0.06, 0.8, '#fff4e6');
      for (let k = 0; k < 4; k++) S.box(p.x - 0.9 + k * 0.55, 1.12, p.z, 0.42, 0.08, 0.32, cols[k + 1]);
    } else if (shop.type === 'flower') {
      for (const t of [-0.9, 0, 0.9]) {
        const p = along(t);
        S.cyl(p.x, 0, p.z, 0.16, 0.35, '#c92a2a', 8);
        S.cyl(p.x, 0.35, p.z, 0.22, 0.45, '#2f9e44', 7);
        S.cyl(p.x, 0.78, p.z, 0.14, 0.22, '#f06595', 6);
      }
    }
  }

  for (const shop of L.shops) dressShop(shop);

  // ---------- 광장 카페 · 푸드존 ----------
  const standSign = (name, nameEn, accent) => atlas.add(220, 64, (c, w, h) => {
    c.fillStyle = accent; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    fitText(c, name, w - 14, 28, 800); c.fillText(name, w / 2, h * 0.4);
    c.font = `600 14px ${FONT}`; c.fillText(nameEn, w / 2, h * 0.76);
  });
  for (const f of L.cafes) {
    S.block(f.x, 0, f.z, f.w, 1.08, f.d, '#7c4a1e');
    S.block(f.x, 1.08, f.z, f.w + 0.1, 0.07, f.d + 0.1, '#f8f4ee');
    S.block(f.x, 1.15, f.z + f.d / 2 - 0.06, f.w, 1.15, 0.1, '#d9480f');
    G.quad(f.x, 1.85, f.z + f.d / 2 + 0.02, 2.0, 0.55, '#ffffff', { uv: standSign(f.name, f.nameEn, '#d9480f') });
    for (const dx of [-1.1, 1.1]) {
      S.cyl(f.x + dx, 0, f.z - 1.55, 0.16, 0.72, '#868e96', 8);
      S.cyl(f.x + dx, 0.72, f.z - 1.55, 0.28, 0.05, '#f1f3f5', 10);
    }
  }
  for (const f of L.foodStands) {
    const accent = f.type === 'cafe' ? '#d9480f' : '#e8590c';
    S.block(f.x, 0, f.z, f.w, 1.02, f.d, accent);
    S.block(f.x, 1.02, f.z, f.w + 0.12, 0.07, f.d + 0.1, '#fff4e6');
    for (let k = 0; k < 3; k++) S.box(f.x - 1.1 + k * 1.05, 1.16, f.z, 0.7, 0.1, 0.45, ['#fa5252', '#ffd43b', '#51cf66'][k]);
    G.quad(f.x, 1.85, f.z + f.d / 2 + 0.04, 2.15, 0.52, '#ffffff', { uv: standSign(f.name, f.nameEn, accent) });
  }
  // 푸드존 테이블
  for (const [tx, tz] of [[-4.2, 46.5], [0, 45.2], [4.2, 46.5], [-3.4, 49.4], [3.4, 49.4]]) {
    S.cyl(tx, 0.72, tz, 0.55, 0.06, '#f1f3f5', 10);
    S.cyl(tx, 0, tz, 0.08, 0.72, '#868e96', 6);
    for (const a of [0, 2.1, 4.2]) {
      const sx = tx + Math.cos(a) * 0.78, sz = tz + Math.sin(a) * 0.78;
      S.box(sx, 0.42, sz, 0.32, 0.08, 0.32, '#dee2e6');
    }
  }

  // ---------- 기둥 · 벤치 · 화장실 · 키오스크 ----------
  for (const c of L.columns) {
    S.block(c.x, 0, c.z, 0.72, CEIL, 0.72, '#ece7dc');
    S.block(c.x, 0, c.z, 0.8, 0.22, 0.8, '#5c6670');
  }
  for (const b of L.benches) {
    S.box(b.x, 0.28, b.z, 1.55, 0.1, 0.42, '#d9480f', { ry: b.ry || 0 });
    S.box(b.x, 0.14, b.z, 1.45, 0.28, 0.12, '#868e96', { ry: b.ry || 0 });
  }
  const wcUv = atlas.add(220, 80, (c, w, h) => {
    c.fillStyle = '#1c7ed6'; c.fillRect(0, 0, w / 2, h);
    c.fillStyle = '#e03131'; c.fillRect(w / 2, 0, w / 2, h);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 22px ${FONT}`; c.fillText('남자', w * 0.25, h * 0.38); c.fillText('여자', w * 0.75, h * 0.38);
    c.font = `600 14px ${FONT}`; c.fillText('Men', w * 0.25, h * 0.7); c.fillText('Women', w * 0.75, h * 0.7);
  });
  const wcTitle = atlas.add(280, 56, (c, w, h) => {
    c.fillStyle = '#1f2a36'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 24px ${FONT}`; c.fillText('화장실  Restroom', w / 2, h / 2);
  });
  for (const r of L.restrooms) {
    S.block(r.x, 0, r.z, r.w, CEIL, r.d, '#e6e1d6');
    S.block(r.x, 0, r.z + r.d / 2 - 0.04, r.w, 2.15, 0.06, '#495057');
    G.quad(r.x, 2.85, r.z + r.d / 2 + 0.03, 1.7, 0.42, '#ffffff', { uv: wcTitle });
    G.quad(r.x - 0.55, 1.35, r.z + r.d / 2 + 0.04, 0.55, 0.75, '#ffffff', { uv: wcUv });
    G.quad(r.x + 0.55, 1.35, r.z + r.d / 2 + 0.04, 0.55, 0.75, '#ffffff', { uv: wcUv });
  }

  // 안내도
  const mapUv = atlas.add(720, 520, (c, w, h) => {
    c.fillStyle = '#f8f4ec'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#212529'; c.font = `800 28px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('강남역 지하상가 안내', 24, 32);
    c.font = `600 16px ${FONT}`; c.fillStyle = '#868e96'; c.fillText('Gangnam Underground Arcade  ·  실제 도면 아님', 24, 62);
    // T 그림
    const cx = w * 0.52, cy = h * 0.52;
    c.fillStyle = '#dee2e6'; c.fillRect(80, cy - 28, w - 150, 56);
    c.fillRect(cx - 28, cy - 28, 56, h - cy - 40);
    c.fillStyle = '#ffd43b'; c.fillRect(cx - 18, cy - 18, 36, 36);
    c.fillStyle = '#212529'; c.font = `800 16px ${FONT}`; c.textAlign = 'center';
    c.fillText('교차', cx, cy);
    const mark = (x, y, t) => { c.fillStyle = '#111'; roundRect(c, x - 14, y - 14, 28, 28, 5); c.fill(); c.fillStyle = '#FFC20E'; c.font = `900 16px ${FONT}`; c.fillText(t, x, y + 1); };
    mark(118, cy, '8'); mark(150, cy, '9');
    mark(w - 128, cy, '1'); mark(w - 96, cy, '12');
    mark(cx - 22, 118, '10'); mark(cx + 18, 118, '11');
    mark(cx - 70, h - 70, '5'); mark(cx - 38, h - 70, '6'); mark(cx - 6, h - 70, '7');
    mark(cx + 38, h - 70, '2'); mark(cx + 70, h - 70, '3'); mark(cx + 102, h - 70, '4');
    c.fillStyle = '#00A84D'; c.fillRect(w - 210, cy - 92, 86, 36);
    c.fillStyle = '#fff'; c.font = `800 14px ${FONT}`; c.fillText('2호선', w - 167, cy - 74);
    c.fillStyle = '#D4003B'; c.fillRect(cx - 36, h - 130, 86, 28);
    c.fillStyle = '#fff'; c.fillText('신분당', cx + 7, h - 116);
    c.fillStyle = '#868e96'; c.font = `600 13px ${FONT}`; c.textAlign = 'left';
    c.fillText('동서: 지하쇼핑센터 · 남북 남쪽: DX아르체 쪽', 24, h - 22);
  });
  S.box(0.05, 1.7, -2.55, 3.3, 2.25, 0.1, '#343a40');
  G.quad(0.05, 1.7, -2.48, 3.05, 2.08, '#ffffff', { uv: mapUv });

  const infoUv = atlas.add(320, 80, (c, w, h) => {
    c.fillStyle = '#1d2228'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#FFC20E'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 26px ${FONT}`; c.fillText('종합안내', w / 2, h * 0.4);
    c.fillStyle = '#fff'; c.font = `600 16px ${FONT}`; c.fillText('Information', w / 2, h * 0.72);
  });
  for (const k of L.kiosks) {
    S.block(k.x, 0, k.z, k.w, 1.35, k.d, '#343a40');
    G.quad(k.x, 1.05, k.z + k.d / 2 + 0.03, 1.05, 0.42, '#ffffff', { uv: infoUv });
    G.quad(k.x, 1.55, k.z, 0.7, 0.45, '#fff7e0', { rx: Math.PI / 2, uv: white });
  }

  // 라이트박스 광고 (지어낸 문구, 브랜드 없음)
  const ads = [
    ['오늘 강남대로', 'Tonight on Gangnam-daero'],
    ['지하상가 한 바퀴', 'A walk under the streets'],
    ['작은 가게, 큰 구경', 'Small shops, long stroll'],
  ];
  ads.forEach((pair, i) => {
    const uv = atlas.add(420, 180, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, ['#5f3dc4', '#0b7285', '#c2255c'][i]);
      g.addColorStop(1, ['#22b8cf', '#e8590c', '#7950f2'][i]);
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.font = `800 36px ${FONT}`; c.fillText(pair[0], 24, 70);
      c.font = `600 20px ${FONT}`; c.fillText(pair[1], 26, 118);
    });
    const z = 43 + i * 4.6;
    S.box(-FOOD.hw + 0.16, 1.85, z, 0.08, 2.0, 4.4, '#212529');
    G.quad(-FOOD.hw + 0.22, 1.85, z, 4.15, 1.82, '#ffffff', { ry: Math.PI / 2, uv });
  });

  // ---------- 매달린 출구 안내 ----------
  const hangBoard = (refs, title, sub, extra) => atlas.add(640, 100, (c, w, h) => {
    c.fillStyle = '#FFC20E'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#111'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = `800 26px ${FONT}`; c.fillText(title, 16, 30);
    c.font = `600 16px ${FONT}`; c.fillText(sub, 18, 58);
    let x = 168;
    for (const r of refs) { exitNumber(c, x, 22, 56, r); x += 64; }
    if (extra) { c.font = `700 16px ${FONT}`; c.fillText(extra, 18, 84); }
  });
  const hang = (x, z, w, uv, ry = 0) => {
    const hh = w * (100 / 640);
    S.box(x, 2.78, z, w + 0.08, hh + 0.08, 0.08, '#1d2228', { ry });
    S.box(x, (2.78 + CEIL) / 2, z, 0.04, CEIL - 2.78, 0.04, '#868e96');
    G.quad(x, 2.78, z + 0.05 * Math.cos(ry), w, hh, '#ffffff', { ry, uv });
    G.quad(x, 2.78, z - 0.05 * Math.cos(ry), w, hh, '#ffffff', { ry: ry + Math.PI, uv });
  };
  hang(0, 0.15, 4.6, hangBoard(['10', '11', '1', '12'], '나가는 곳', 'Way Out', '북쪽 · 테헤란로  /  North · Teheran-ro'));
  hang(-24, 0, 4.2, hangBoard(['8', '9'], '나가는 곳', 'Way Out', '서초대로  /  Seocho-daero'), Math.PI);
  hang(24, 0, 4.2, hangBoard(['1', '12'], '나가는 곳', 'Way Out', '테헤란로  /  Teheran-ro'));
  hang(0, 20, 4.2, hangBoard(['2', '3', '4', '5', '6', '7'], '나가는 곳', 'Way Out', '강남대로 남쪽  /  South'), Math.PI);
  hang(0, 47, 4.0, hangBoard(['2', '3', '4'], '나가는 곳', 'Way Out', '남동  /  Southeast'), 0);
  const platUv = atlas.add(560, 96, (c, w, h) => {
    c.fillStyle = '#1d2228'; c.fillRect(0, 0, w, h);
    const bw = lineBadge(c, 16, 16, 32, P.color, P.short);
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = `800 28px ${FONT}`; c.fillText('타는 곳', 28 + bw, 34);
    c.font = `600 18px ${FONT}`; c.fillStyle = '#c9d1d9'; c.fillText('Platforms  ·  Inner / Outer Circle', 30 + bw, 68);
  });
  hang(21, -10.4, 3.8, platUv);
  const trUv = atlas.add(560, 96, (c, w, h) => {
    c.fillStyle = '#1d2228'; c.fillRect(0, 0, w, h);
    const bw = lineBadge(c, 16, 16, 32, X.color, X.short);
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = `800 26px ${FONT}`; c.fillText('갈아타는 곳', 28 + bw, 34);
    c.font = `600 17px ${FONT}`; c.fillStyle = '#ffa8a8'; c.fillText('Transfer  ·  Shinbundang Line', 30 + bw, 68);
  });
  hang(0, 58.4, 3.8, trUv);

  // ---------- 출구 통로와 계단 ----------
  const STAIRS = 22, RISE = 0.165, TREAD = 0.3;
  for (const p of L.passages) {
    const along = (t, y0, h, thick, color) => {
      if (p.wall === 'w') S.block((p.sidePass ? -HALF : EW.x0) - t, y0, p.c, thick, h, p.half * 2, color);
      else if (p.wall === 'e') S.block((p.sidePass ? HALF : EW.x1) + t, y0, p.c, thick, h, p.half * 2, color);
      else S.block(p.c, y0, NORTH_Z - t, p.half * 2, h, thick, color);
    };
    const base = p.wall === 'n' ? NORTH_Z : p.wall === 'w' ? (p.sidePass ? -HALF : EW.x0) : (p.sidePass ? HALF : EW.x1);
    for (let t = 0; t < PASSAGE_LEN; t += 1) along(t + 0.5, -0.08, 0.1, 1.0, (t & 1) ? '#cfc6b6' : '#d8d0c0');
    for (let i = 0; i < STAIRS; i++) along(PASSAGE_LEN + i * TREAD + TREAD / 2, -0.08, (i + 1) * RISE + 0.1, TREAD, i % 2 ? '#c9c2b3' : '#d2cbbd');
    const tEnd = PASSAGE_LEN + STAIRS * TREAD;
    const side = (sgn, t0, t1, y0, h, color) => {
      const m = (t0 + t1) / 2, len = t1 - t0;
      if (p.wall === 'w') S.block(base - m, y0, p.c + sgn * (p.half + 0.14), len, h, 0.28, color);
      else if (p.wall === 'e') S.block(base + m, y0, p.c + sgn * (p.half + 0.14), len, h, 0.28, color);
      else S.block(p.c + sgn * (p.half + 0.14), y0, base - m, 0.28, h, len, color);
    };
    for (const sgn of [-1, 1]) {
      side(sgn, 0, PASSAGE_LEN, 0, CEIL, wallCol);
      side(sgn, 0, PASSAGE_LEN, 0, 1.12, dadoCol);
      side(sgn, PASSAGE_LEN, tEnd + 1, 0, STAIRS * RISE + CEIL, wallCol);
    }
    along(PASSAGE_LEN / 2, CEIL, 0.1, PASSAGE_LEN, ceilCol);
    const lightT = tEnd + 0.35, ly = STAIRS * RISE + CEIL / 2;
    if (p.wall === 'w') G.quad(base - lightT, ly, p.c, p.half * 2, CEIL, '#dff1ff', { ry: Math.PI / 2, uv: white });
    else if (p.wall === 'e') G.quad(base + lightT, ly, p.c, p.half * 2, CEIL, '#dff1ff', { ry: -Math.PI / 2, uv: white });
    else G.quad(p.c, ly, base - lightT, p.half * 2, CEIL, '#dff1ff', { uv: white });
    const refs = p.exits.map((e) => e.ref).filter(Boolean);
    const sign = atlas.add(520, 110, (c, w, h) => {
      c.fillStyle = '#FFC20E'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#111'; c.textBaseline = 'middle'; c.textAlign = 'left';
      c.font = `800 28px ${FONT}`; c.fillText('나가는 곳', 14, 30);
      c.font = `700 16px ${FONT}`; c.fillText('Way Out', 16, 58);
      let x = 160;
      for (const r of refs) { exitNumber(c, x, 16, 52, r); x += 58; }
      c.font = `600 15px ${FONT}`; c.fillText(p.id === 'east' ? '테헤란로  Teheran-ro' : p.id === 'west' ? '서초대로  Seocho-daero' : p.id === 'north' ? '강남대로 북쪽  North' : p.id === 'se' ? '강남대로 남동  Southeast' : '강남대로 남서  Southwest', 14, 92);
    });
    const sw = 3.4, sh = sw * 110 / 520;
    if (p.wall === 'w') { G.quad((p.sidePass ? -HALF : EW.x0) + 0.32, 2.95, p.c, sw, sh, '#ffffff', { ry: Math.PI / 2, uv: sign }); }
    else if (p.wall === 'e') { G.quad((p.sidePass ? HALF : EW.x1) - 0.32, 2.95, p.c, sw, sh, '#ffffff', { ry: -Math.PI / 2, uv: sign }); }
    else { G.quad(p.c, 2.95, NORTH_Z + 0.32, sw, sh, '#ffffff', { uv: sign }); }
  }

  // ---------- 개찰구 ----------
  for (const cab of L.cabs) {
    const col = cab.group === 'l2' ? '#0b7285' : '#862e2e';
    S.block(cab.x, 0, cab.z, 0.28, 1.15, 1.55, '#2b3035');
    S.block(cab.x, 1.15, cab.z, 0.32, 0.08, 1.6, col);
  }
  const gateTitle = (ko, en, col) => atlas.add(420, 70, (c, w, h) => {
    c.fillStyle = col; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 26px ${FONT}`; c.fillText(ko, w / 2, h * 0.38);
    c.font = `600 16px ${FONT}`; c.fillText(en, w / 2, h * 0.72);
  });
  G.quad(21, 2.55, -7.95, 3.4, 0.55, '#ffffff', { uv: gateTitle('2호선 개찰구', 'Line 2 fare gates', '#00A84D') });
  G.quad(0, 2.55, 59.85, 3.6, 0.55, '#ffffff', { uv: gateTitle('신분당선 환승', 'Shinbundang transfer', '#D4003B') });

  // ---------- 2호선 계단 입구 ----------
  for (const w of L.wells) {
    S.block((w.x0 + w.x1) / 2, -0.08, (w.z0 + w.z1) / 2, w.x1 - w.x0, 0.1, w.z1 - w.z0, '#1a1c20');
    for (let i = 0; i < 10; i++) {
      const yt = -(i + 1) * 0.16, zz = w.z1 - i * 0.28 - 0.14;
      S.box((w.x0 + w.x1) / 2, yt, zz, w.x1 - w.x0 - 0.2, 0.16, 0.26, i % 2 ? '#c9c2b3' : '#d2cbbd');
    }
    S.block(w.x0, -1.6, (w.z0 + w.z1) / 2, 0.16, 1.7, w.z1 - w.z0, '#d8d2c6');
    S.block(w.x1, -1.6, (w.z0 + w.z1) / 2, 0.16, 1.7, w.z1 - w.z0, '#d8d2c6');
    const suv = atlas.add(420, 120, (c, ww, h) => {
      c.fillStyle = '#1d2228'; c.fillRect(0, 0, ww, h);
      const bw = lineBadge(c, 16, 16, 30, P.color, P.short);
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.font = `800 26px ${FONT}`; c.fillText(w.ko, 28 + bw, 36);
      c.font = `600 18px ${FONT}`; c.fillStyle = '#c9d1d9'; c.fillText(w.en + '  ↓', 30 + bw, 78);
    });
    G.quad(w.cx, 2.45, w.z1 + 0.08, 3.2, 0.85, '#ffffff', { uv: suv });
    S.box(w.cx, 0.02, w.z1 + 0.2, w.x1 - w.x0, 0.02, 0.28, '#e8b800');
  }

  // 점자블록
  const YEL = '#e8b800';
  const tactile = (x0, z0, x1, z1) => {
    const l = Math.hypot(x1 - x0, z1 - z0);
    S.box((x0 + x1) / 2, 0.015, (z0 + z1) / 2, 0.28, 0.02, l, YEL, { ry: Math.atan2(x1 - x0, z1 - z0) });
  };
  tactile(-48, 0, 48, 0);
  tactile(0, -28, 0, 66);
  tactile(12.4, -8.2, 21, -8.2);

  // ---------- 메시화 ----------
  const tex = atlas.texture();
  const staticMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: tex, toneMapped: false });
  const sm = new THREE.Mesh(S.build(), staticMat); sm.name = 'gunderStatic';
  const gm = new THREE.Mesh(G.build(), glowMat); gm.name = 'gunderGlow';
  scene.add(sm, gm);
  disposables.push(sm.geometry, gm.geometry, staticMat, glowMat, tex);

  const M4 = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), SC = new THREE.Vector3(1, 1, 1);

  // 천장 조명 패널
  const lamps = [];
  for (let x = -46; x <= 46; x += 4) for (const z of [-1.55, 1.55]) lamps.push({ x, z, sx: 2.5, sz: 0.55 });
  for (let z = -26; z <= 64; z += 4) for (const x of [-1.55, 1.55]) lamps.push({ x, z, sx: 0.55, sz: 2.5 });
  for (let x = 15; x <= 28; x += 4) lamps.push({ x, z: -16, sx: 2.3, sz: 0.5 });
  for (let x = -10; x <= 10; x += 4) lamps.push({ x, z: 47, sx: 2.2, sz: 0.5 });
  const lGeo = new THREE.BoxGeometry(1, 0.04, 1);
  const lMat = new THREE.MeshBasicMaterial({ color: '#fff6e0', toneMapped: false });
  const lMesh = new THREE.InstancedMesh(lGeo, lMat, lamps.length);
  lMesh.name = 'gunderLamps';
  lamps.forEach((l, i) => {
    M4.compose(V.set(l.x, CEIL - 0.04, l.z), Q.identity(), SC.set(l.sx, 1, l.sz));
    lMesh.setMatrixAt(i, M4);
  });
  lMesh.instanceMatrix.needsUpdate = true;
  SC.set(1, 1, 1);
  scene.add(lMesh);
  disposables.push(lGeo, lMat);

  // 개찰 날개
  const flapGeo = new THREE.BoxGeometry(0.04, 0.95, 0.42);
  const flapMat = new THREE.MeshLambertMaterial({ color: '#dbe4ff', transparent: true, opacity: 0.78 });
  const flaps = new THREE.InstancedMesh(flapGeo, flapMat, L.lanes.length * 2);
  const ledGeo = new THREE.BoxGeometry(0.1, 0.03, 0.1);
  const ledMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, L.lanes.length);
  flaps.name = 'gunderFlaps'; leds.name = 'gunderLeds';
  scene.add(flaps, leds);
  disposables.push(flapGeo, flapMat, ledGeo, ledMat);
  const lanes = L.lanes.map((ln) => ({ ...ln, open: 0, t: 0, ok: 0 }));
  function drawGates() {
    let k = 0;
    lanes.forEach((ln, i) => {
      const gap = 0.16 + ln.open * 0.34;
      M4.compose(V.set(ln.x - gap, 0.55, ln.z), Q.identity(), SC);
      flaps.setMatrixAt(k++, M4.clone());
      M4.compose(V.set(ln.x + gap, 0.55, ln.z), Q.identity(), SC);
      flaps.setMatrixAt(k++, M4.clone());
      M4.compose(V.set(ln.x, 1.22, ln.z), Q.identity(), SC);
      leds.setMatrixAt(i, M4.clone());
    });
    flaps.instanceMatrix.needsUpdate = true;
    leds.instanceMatrix.needsUpdate = true;
  }
  drawGates();

  // ---------- 사람 ----------
  const crowdGroup = new THREE.Group(); scene.add(crowdGroup);
  const crowd = buildCrowd(crowdGroup, { name: 'gunderCrowd', cast: () => false });
  const me = createAvatar(look || {}); me.userData.sit = '';
  const meParts = crowd.register(me);
  let rr = 4217; const rnd = () => ((rr = (rr * 16807) % 2147483647) / 2147483647);
  const mobile = isMobileMode();
  const N_WALK = mobile ? 10 : 20;
  const npcs = [];
  const staffSpots = [
    ...L.cafes.map((f) => ({ x: f.x, z: f.z + 0.4, ry: Math.PI })),
    ...L.foodStands.slice(0, 3).map((f) => ({ x: f.x, z: f.z + 0.15, ry: Math.PI })),
    ...L.shops.filter((s) => s.rich).slice(0, 4).map((s) => ({ x: s.cx, z: s.cz, ry: faceRy(s) })),
  ];
  staffSpots.forEach((s, i) => {
    const m = createAvatar(LOOKS[i % LOOKS.length]);
    m.position.set(s.x, 0, s.z); m.rotation.y = s.ry; m.userData.sit = '';
    npcs.push({ mesh: m, parts: crowd.register(m), fixed: true });
  });
  for (let i = 0; i < 4; i++) {
    const b = L.benches[i * 2];
    if (!b) continue;
    const m = createAvatar(LOOKS[(i + 5) % LOOKS.length]);
    m.position.set(b.x, 0, b.z); m.rotation.y = b.ry || 0; m.userData.sit = 'bench';
    npcs.push({ mesh: m, parts: crowd.register(m), fixed: true });
  }
  for (let i = 0; i < N_WALK; i++) {
    const m = createAvatar(LOOKS[i % LOOKS.length]);
    npcs.push({ mesh: m, parts: crowd.register(m), fixed: false, route: null, i: 0, wait: rnd() * 5 });
  }
  crowd.finalize();
  for (const part of crowd.parts.values()) { disposables.push(part.im); if (part.lam) disposables.push(part.im.material); }

  const corridorPts = [
    { x: 0, z: 0 }, { x: -40, z: 0 }, { x: 40, z: 0 }, { x: 0, z: -22 },
    { x: 0, z: 22 }, { x: 0, z: 36 }, { x: 0, z: 48 }, { x: 21, z: -12 },
    { x: -6, z: 47 }, { x: 6, z: 47 },
  ];
  const shopStops = L.shops.filter((s) => s.rich || s.type === 'fashion').map((s) => ({ x: s.cx, z: s.cz }));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  function makeRoute() {
    const a = pick(corridorPts), b = pick(corridorPts);
    const via = rnd() < 0.45 && shopStops.length ? pick(shopStops) : pick(corridorPts);
    return [{ ...a, y: 0 }, { ...via, y: 0 }, { ...b, y: 0 }, pick(corridorPts)];
  }
  const startNpc = (n, warm) => {
    n.route = makeRoute(); n.i = 1;
    const a = n.route[0]; n.mesh.position.set(a.x, 0, a.z);
    if (warm) {
      const k = 1 + Math.floor(rnd() * Math.max(1, n.route.length - 2));
      const b = n.route[k]; n.mesh.position.set(b.x, 0, b.z); n.i = k + 1;
    }
  };
  npcs.filter((n) => !n.fixed).forEach((n, i) => (i < N_WALK - 3 ? startNpc(n, true) : (n.route = null, n.wait = 1 + i * 0.4)));

  const tapLane = (i, who, dir = 'in') => {
    const ln = lanes[i];
    if (!ln) return;
    if (ln.open < 0.5 && ln.t <= 0) { ln.ok = 0.9; if (who === 'me') onToast?.('tap', { dir }); }
    ln.t = 1.1;
  };

  function updateNpc(n, dt) {
    if (n.fixed) { animateAvatar(n.mesh, 0, dt); return; }
    if (!n.route) { n.wait -= dt; n.mesh.visible = false; if (n.wait <= 0) startNpc(n, false); return; }
    n.mesh.visible = true;
    const tgt = n.route[n.i];
    if (!tgt) { n.route = null; n.wait = 0.6 + rnd() * 3; return; }
    const p = n.mesh.position;
    const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
    const sp = 1.15;
    if (d < 0.1) { p.set(tgt.x, 0, tgt.z); n.i++; animateAvatar(n.mesh, 0, dt); return; }
    const st = Math.min(d, sp * dt);
    p.x += (dx / d) * st; p.z += (dz / d) * st;
    const want = Math.atan2(dx, dz);
    n.mesh.rotation.y += Math.atan2(Math.sin(want - n.mesh.rotation.y), Math.cos(want - n.mesh.rotation.y)) * Math.min(1, dt * 10);
    const li = laneAt(p.x, p.z, L, 1.4); if (li >= 0) tapLane(li, 'npc');
    animateAvatar(n.mesh, sp, dt);
  }

  // ---------- 플레이어 ----------
  const entryPass = L.passages.find((p) => p.exits.some((e) => e.id === entryId)) || L.passages[0];
  me.position.set(entryPass.mouth.x - entryPass.out.x * 0.4, 0, entryPass.mouth.z - entryPass.out.z * 0.4);
  me.rotation.y = Math.atan2(-entryPass.out.x, -entryPass.out.z);
  const cam = { yaw: Math.atan2(entryPass.out.x, entryPass.out.z), pitch: 0.22, dist: 6.2 };
  if (spawn?.well != null && L.wells[spawn.well]) {
    const w = L.wells[spawn.well];
    me.position.set(w.cx, 0, w.z1 + 1.2); me.rotation.y = 0; cam.yaw = Math.PI;
  } else if (spawn?.transfer) {
    me.position.set(0, 0, L.transfer.z - 1.4); me.rotation.y = Math.PI; cam.yaw = 0;
  }
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 280);
  const laneOpen = (ln) => {
    const i = typeof ln === 'number' ? ln : lanes.indexOf(ln);
    const row = typeof ln === 'object' ? ln : lanes[i];
    return (row?.open || 0) > 0.55;
  };
  const canStand = (x, z) => walkable(x, z, 0.3, L, { laneOpen });
  const inRoom = (x, z) => walkable(x, z, 0.05, L, { laneOpen: () => true }) || (x > EW.x0 && x < EW.x1 && z > -HALF && z < HALF);
  let speed = 0, lastPass = null, lastWell = wellMouth(me.position.x, me.position.z, L.wells), lastTr = !!spawn?.transfer;
  const wellSpawn = spawn?.well != null && L.wells[spawn.well] ? { x: me.position.x, z: me.position.z } : null;
  let wellArmed = !wellSpawn;

  function update(dt, { look: [dy, dp, dz], axes, allowMove, self = null }) {
    cam.yaw += dy; cam.pitch = THREE.MathUtils.clamp(cam.pitch + dp, -0.55, 1.2); cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + dz), 2.1, 11);
    const p = me.position;
    let { f, s, run } = allowMove ? axes : { f: 0, s: 0, run: false };
    speed = 0; let mz = 0;
    if ((f || s) && me.userData.sit) me.userData.sit = '';
    if (f || s) {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = -fz, rz = fx;
      let mx = fx * f + rx * s; mz = fz * f + rz * s; const len = Math.hypot(mx, mz); mx /= len; mz /= len;
      const sp = (run ? 7.4 : 4.0) * Math.min(1, Math.hypot(f, s)), step = sp * dt;
      const nSub = Math.max(1, Math.ceil(step / 0.1)), sx = (mx * step) / nSub, sz = (mz * step) / nSub;
      for (let k = 0; k < nSub; k++) {
        const nx = p.x + sx, nz = p.z + sz;
        const stuck = !canStand(p.x, p.z);
        if (canStand(nx, p.z) || stuck) p.x = nx;
        if (canStand(p.x, nz) || stuck) p.z = nz;
      }
      const want = Math.atan2(mx, mz);
      me.rotation.y += Math.atan2(Math.sin(want - me.rotation.y), Math.cos(want - me.rotation.y)) * Math.min(1, dt * 12);
      speed = sp;
    }
    const li = laneAt(p.x, p.z, L, 1.25);
    if (li >= 0) {
      const ln = lanes[li];
      const dir = ln.group === 'l2' ? (mz < -0.12 ? 'in' : 'out') : (mz > 0.12 ? 'in' : 'out');
      tapLane(li, 'me', dir);
    }
    if (self) {
      me.userData.emote = speed > 0 ? '' : (self.emote || '');
      me.userData.afk = !!self.afk;
      me.userData.jumpY = me.userData.sit ? 0 : (self.jy || 0);
    }
    animateAvatar(me, speed, dt);
    for (const ln of lanes) {
      ln.t -= dt; ln.ok -= dt;
      const want = ln.t > 0 ? 1 : 0;
      ln.open += Math.sign(want - ln.open) * Math.min(Math.abs(want - ln.open), dt * 4);
    }
    for (const n of npcs) updateNpc(n, dt);
    drawGates();
    crowd.begin();
    crowd.add(me, meParts, false);
    for (const n of npcs) if (n.fixed || n.route) crowd.add(n.mesh, n.parts, false);
    crowd.end();
    const eye = p.y + 1.55, bx = Math.sin(cam.yaw), bz = Math.cos(cam.yaw), cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch);
    let d = cam.dist;
    for (; d > 1.2; d -= 0.25) { const cx = p.x + bx * d * cp, cz = p.z + bz * d * cp; if (inRoom(cx, cz)) break; }
    camera.position.set(p.x + bx * d * cp, THREE.MathUtils.clamp(eye + d * spp, 0.35, CEIL - 0.22), p.z + bz * d * cp);
    camera.lookAt(p.x - bx * 3 * cp, eye - 3 * spp, p.z - bz * 3 * cp);
    const pass = passageAt(p.x, p.z, L.passages);
    const entered = pass && pass !== lastPass ? pass : null; lastPass = pass;
    const well = nearWellTop(p.x, p.z, L.wells), mouth = wellMouth(p.x, p.z, L.wells);
    if (!wellArmed && (!well || Math.hypot(p.x - wellSpawn.x, p.z - wellSpawn.z) > 1.8)) wellArmed = true;
    const towardWell = mz < WELL_INTO;
    const wellEnter = wellArmed && mouth && mouth !== lastWell && towardWell ? L.wells.indexOf(mouth) : -1;
    if (!mouth || wellEnter >= 0) lastWell = mouth;
    const tr = nearTransfer(p.x, p.z, L.transfer);
    const transferEnter = tr && !lastTr; lastTr = tr;
    return { enteredPassage: entered, wellEnter, transferEnter, wellHint: well };
  }
  function render() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.render(scene, camera); }
  function dispose() { for (const d of disposables) d.dispose?.(); scene.clear(); }
  function setView(x, z, yaw, pitch = 0.22, dist = 6) { me.position.set(x, 0, z); cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; }
  function sitDown() {
    if (nearBench(me.position.x, me.position.z, L.benches)) me.userData.sit = 'bench';
    else if (!me.userData.sit) me.userData.sit = 'ground';
    return me.userData.sit;
  }
  function standUp() { me.userData.sit = ''; }
  return {
    get sitKind() { return me.userData.sit || ''; },
    sitDown, standUp,
    get lastPass() { return lastPass; },
    get wellArmed() { return wellArmed; },
    get speed() { return speed; },
    scene, camera, player: me, cam, passages: L.passages, lanes, layout: L,
    update, render, dispose, setView, npcs,
    stats: () => ({ shops: L.shops.length, lamps: lamps.length, npcs: npcs.length }),
  };
}
