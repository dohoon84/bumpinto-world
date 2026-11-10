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
const COLS = ['#fa5252', '#ff922b', '#ffd43b', '#51cf66', '#339af0', '#cc5de8', '#f783ac', '#22b8cf', '#f8f9fa', '#ff8787', '#74c0fc', '#69db7c', '#ffa94d', '#e599f7', '#20c997'];
const TOPS = ['#fa5252', '#1c7ed6', '#212529', '#f8f9fa', '#e8590c', '#ae3ec9', '#2b8a3e', '#e64980'];
const BOTS = ['#212529', '#364fc7', '#868e96', '#5c4033', '#1c7ed6', '#343a40'];

export function buildGangnamUnderground({ exits, entryId, look, renderer, onToast, theme, spawn = null }) {
  const L = buildLayout(exits || []);
  const P = theme?.primary || { color: '#00A84D', short: '2호선' };
  const X = theme?.transfer || { color: '#D4003B', short: '신분당' };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c5ccd4');
  scene.add(new THREE.HemisphereLight('#ffffff', '#b4bcc6', 2.35));
  const dl = new THREE.DirectionalLight('#fffaf2', 0.62);
  dl.position.set(4, 22, 2);
  scene.add(dl);

  const disposables = [];
  const S = createBuilder();
  const G = createBuilder();
  const atlas = createAtlas(2048, 4096, 'gunder');
  const white = atlas.add(8, 8, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); });

  const wallCol = '#eeeae1';
  const dadoCol = '#7a8490';
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

  wallX(EW.x0 - 0.14, -HALF, -2.6); wallX(EW.x0 - 0.14, 2.6, HALF);
  wallX(EW.x1 + 0.14, -HALF, -2.6); wallX(EW.x1 + 0.14, 2.6, HALF);
  wallZ(NORTH_Z - 0.14, -HALF, -2.6); wallZ(NORTH_Z - 0.14, 2.6, HALF);
  wallZ(SOUTH_Z + 0.14, -HALF, HALF);
  wallZ(-HALF, PLAZA.x0, -HALF); wallZ(-HALF, HALF, PLAZA.x1);
  wallZ(HALF, PLAZA.x0, -HALF); wallZ(HALF, HALF, PLAZA.x1);
  wallZ(-HALF, 10.2, L2HALL.x0);
  wallX(L2HALL.x0, L2HALL.z0, L2HALL.z1);
  wallX(L2HALL.x1, L2HALL.z0, L2HALL.z1);
  wallZ(L2HALL.z0, L2HALL.x0, L2HALL.x1);
  wallZ(L2HALL.z1, L2HALL.x0, 14.4);
  wallZ(L2HALL.z1, 24.9, L2HALL.x1);
  wallX(-FOOD.hw, FOOD.z0, FOOD.z1);
  wallX(FOOD.hw, FOOD.z0, FOOD.z1);
  wallZ(FOOD.z0, -FOOD.hw, -HALF);
  wallZ(FOOD.z0, HALF, FOOD.hw);
  wallZ(FOOD.z1, -FOOD.hw, -HALF);
  wallZ(FOOD.z1, HALF, FOOD.hw);
  wallX(-HALF - SHOP_D, FOOD.z1, 54.1);
  wallX(HALF + SHOP_D, FOOD.z1, 54.1);
  wallX(-HALF - SHOP_D, 59.1, SOUTH_Z);
  wallX(HALF + SHOP_D, 59.1, SOUTH_Z);
  wallZ(54.1, -HALF - SHOP_D, -HALF);
  wallZ(54.1, HALF, HALF + SHOP_D);
  wallZ(59.1, -HALF - SHOP_D, -HALF);
  wallZ(59.1, HALF, HALF + SHOP_D);

  const floorBase = (x0, x1, z0, z1, col = '#c8c2b6') => {
    S.box((x0 + x1) / 2, -0.025, (z0 + z1) / 2, x1 - x0, 0.05, z1 - z0, col);
  };
  floorBase(EW.x0, EW.x1, -HALF, HALF);
  floorBase(-HALF, HALF, NORTH_Z, -HALF, '#c4beb2');
  floorBase(-HALF, HALF, HALF, SOUTH_Z, '#c4beb2');
  floorBase(L2HALL.x0, L2HALL.x1, L2HALL.z0, L2HALL.z1, '#c2bbb0');
  floorBase(-FOOD.hw, FOOD.hw, FOOD.z0, FOOD.z1, '#c9c0b3');

  const ceilRects = [
    [EW.x0 - 0.4, EW.x1 + 0.4, -HALF - SHOP_D - 0.2, HALF + SHOP_D + 0.2],
    [-HALF - SHOP_D - 0.2, HALF + SHOP_D + 0.2, NORTH_Z - 0.4, -HALF],
    [-HALF - SHOP_D - 0.2, HALF + SHOP_D + 0.2, HALF, SOUTH_Z + 0.4],
    [L2HALL.x0 - 0.2, L2HALL.x1 + 0.2, L2HALL.z0 - 0.2, -HALF],
    [-FOOD.hw - 0.2, FOOD.hw + 0.2, FOOD.z0, FOOD.z1],
  ];
  const lightStrips = [
    { x: 0, z: -1.72, sx: 98, sz: 0.48 },
    { x: 0, z: 1.72, sx: 98, sz: 0.48 },
    { x: -1.72, z: 19, sx: 0.48, sz: 94 },
    { x: 1.72, z: 19, sx: 0.48, sz: 94 },
    { x: 21.2, z: -17.8, sx: 17.2, sz: 0.44 },
    { x: 0, z: 47, sx: 25.2, sz: 0.44 },
  ];
  for (const s of lightStrips) {
    S.box(s.x, CEIL - 0.012, s.z, s.sx + 0.16, 0.03, s.sz + 0.16, '#c8ced4');
  }

  const IBOX = [];
  const ICYL = [];
  const IGLASS = [];
  const IHEAD = [];
  const ITORSO = [];
  const IHIP = [];
  const ILIMB = [];
  const box = (x, y, z, sx, sy, sz, c, ry = 0) => { IBOX.push({ x, y, z, sx, sy, sz, c, ry }); };
  const cyl = (x, y, z, r, h, c) => { ICYL.push({ x, y, z, r, h, c }); };

  const signFor = (shop) => atlas.add(240, 70, (c, w, h) => {
    c.fillStyle = shop.signColor || TYPES[shop.type].accent;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
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
  const alongFront = (shop, t, depth) => {
    if (shop.axis === 'x') return { x: shop.cx + t, z: shop.side < 0 ? shop.z1 - depth : shop.z0 + depth };
    return { x: shop.side < 0 ? shop.x1 - depth : shop.x0 + depth, z: shop.cz + t };
  };

  function mannequin(x, z, ry, top, bot) {
    const skin = '#f0c8a8';
    IHEAD.push({ x, y: 1.58, z, s: 0.15, ry, c: skin });
    ITORSO.push({ x, y: 1.18, z, sx: 0.34, sy: 0.46, sz: 0.18, ry, c: top });
    IHIP.push({ x, y: 0.82, z, sx: 0.3, sy: 0.26, sz: 0.16, ry, c: bot });
    const sx = Math.cos(ry), sz = -Math.sin(ry);
    ILIMB.push({ x: x + sx * 0.22, y: 1.12, z: z + sz * 0.22, sx: 0.08, sy: 0.42, sz: 0.08, ry, c: top });
    ILIMB.push({ x: x - sx * 0.22, y: 1.12, z: z - sz * 0.22, sx: 0.08, sy: 0.42, sz: 0.08, ry, c: top });
    ILIMB.push({ x: x + sx * 0.08, y: 0.4, z: z + sz * 0.08, sx: 0.1, sy: 0.64, sz: 0.1, ry, c: bot });
    ILIMB.push({ x: x - sx * 0.08, y: 0.4, z: z - sz * 0.08, sx: 0.1, sy: 0.64, sz: 0.1, ry, c: bot });
  }

  function glassPane(x, y, z, w, h, ry) { IGLASS.push({ x, y, z, w, h, ry }); }

  function dressShop(shop) {
    const T = TYPES[shop.type];
    const bw = shop.x1 - shop.x0, bd = shop.z1 - shop.z0;
    const openW = shop.openW || OPEN_W;
    const trim = shop.signColor || T.accent;
    S.block(shop.cx, 0, shop.cz, bw, 0.035, bd, T.floor);
    if (shop.axis === 'x') {
      S.block(shop.x0 + 0.07, 0, shop.cz, 0.14, CEIL, bd, T.wall);
      S.block(shop.x1 - 0.07, 0, shop.cz, 0.14, CEIL, bd, T.wall);
      if (shop.side < 0) S.block(shop.cx, 0, shop.z0 + 0.07, bw, CEIL, 0.14, T.wall);
      else S.block(shop.cx, 0, shop.z1 - 0.07, bw, CEIL, 0.14, T.wall);
      const mid = shop.cx, gap = openW / 2, zf = shop.side < 0 ? shop.z1 - 0.05 : shop.z0 + 0.05;
      const leftW = Math.max(0.12, mid - gap - shop.x0);
      const rightW = Math.max(0.12, shop.x1 - (mid + gap));
      const leftX = (shop.x0 + mid - gap) / 2;
      const rightX = (shop.x1 + mid + gap) / 2;
      if (shop.closed) {
        S.block(shop.cx, 0, zf, bw, CEIL, 0.1, '#6d737b');
      } else {
        S.block(leftX, 0, zf, leftW, 0.22, 0.12, '#343a40');
        S.block(rightX, 0, zf, rightW, 0.22, 0.12, '#343a40');
        S.block(leftX, 2.48, zf, leftW, CEIL - 2.48, 0.12, trim);
        S.block(rightX, 2.48, zf, rightW, CEIL - 2.48, 0.12, trim);
        const ry = faceRy(shop);
        glassPane(leftX, 1.35, zf, Math.max(0.2, leftW - 0.08), 2.16, ry);
        glassPane(rightX, 1.35, zf, Math.max(0.2, rightW - 0.08), 2.16, ry);
        glassPane(shop.cx, 2.28, zf, openW - 0.08, 0.38, ry);
      }
    } else {
      S.block(shop.cx, 0, shop.z0 + 0.07, bw, CEIL, 0.14, T.wall);
      S.block(shop.cx, 0, shop.z1 - 0.07, bw, CEIL, 0.14, T.wall);
      if (shop.side < 0) S.block(shop.x0 + 0.07, 0, shop.cz, 0.14, CEIL, bd, T.wall);
      else S.block(shop.x1 - 0.07, 0, shop.cz, 0.14, CEIL, bd, T.wall);
      const mid = shop.cz, gap = openW / 2, xf = shop.side < 0 ? shop.x1 - 0.05 : shop.x0 + 0.05;
      const leftW = Math.max(0.12, mid - gap - shop.z0);
      const rightW = Math.max(0.12, shop.z1 - (mid + gap));
      const leftZ = (shop.z0 + mid - gap) / 2;
      const rightZ = (shop.z1 + mid + gap) / 2;
      if (shop.closed) {
        S.block(xf, 0, shop.cz, 0.1, CEIL, bd, '#6d737b');
      } else {
        S.block(xf, 0, leftZ, 0.12, 0.22, leftW, '#343a40');
        S.block(xf, 0, rightZ, 0.12, 0.22, rightW, '#343a40');
        S.block(xf, 2.48, leftZ, 0.12, CEIL - 2.48, leftW, trim);
        S.block(xf, 2.48, rightZ, 0.12, CEIL - 2.48, rightW, trim);
        const ry = faceRy(shop);
        glassPane(xf, 1.35, leftZ, Math.max(0.2, leftW - 0.08), 2.16, ry);
        glassPane(xf, 1.35, rightZ, Math.max(0.2, rightW - 0.08), 2.16, ry);
        glassPane(xf, 2.28, shop.cz, openW - 0.08, 0.38, ry);
      }
    }
    if (shop.closed) {
      const fp = frontPos(shop, 0.04);
      const span = shop.axis === 'x' ? bw - 0.12 : bd - 0.12;
      for (let k = 0; k < 20; k++) {
        box(fp.x, 0.1 + k * 0.116, fp.z,
          shop.axis === 'x' ? span : 0.07, 0.1, shop.axis === 'x' ? 0.07 : span,
          k & 1 ? '#8c929a' : '#a8aeb6');
      }
    }
    const ry = faceRy(shop);
    const fp = frontPos(shop, 0.12);
    const signW = Math.min(bw, bd) * 0.78;
    const signH = 0.44;
    const signY = 2.88;
    if (shop.axis === 'x') S.box(fp.x, signY, fp.z, signW + 0.08, signH + 0.08, 0.18, '#1a1c20');
    else S.box(fp.x, signY, fp.z, 0.18, signH + 0.08, signW + 0.08, '#1a1c20');
    const uv = signFor(shop);
    const ox = shop.axis === 'z' ? (shop.side < 0 ? 0.1 : -0.1) : 0;
    const oz = shop.axis === 'x' ? (shop.side < 0 ? 0.1 : -0.1) : 0;
    G.quad(fp.x + ox, signY, fp.z + oz, signW, signH, '#ffffff', { ry, uv });
    G.quad(fp.x - ox, signY, fp.z - oz, signW, signH, '#ffffff', { ry: ry + Math.PI, uv });
    G.quad(shop.cx, CEIL - 0.08, shop.cz, Math.min(bw, 3.6) * 0.82, Math.min(bd, 3.6) * 0.55, '#fff8e6', { rx: Math.PI / 2, uv: white });
    if (!shop.closed) fillGoods(shop);
  }

  function fillGoods(shop) {
    const span = shop.axis === 'x' ? shop.x1 - shop.x0 : shop.z1 - shop.z0;
    const half = Math.max(0.6, span / 2 - 0.38);
    const ry = faceRy(shop);
    if (shop.type === 'fashion' || shop.type === 'shoes') {
      const cols = Math.max(6, Math.floor(span / 0.3));
      for (let r = 0; r < 5; r++) for (let c = 0; c < cols; c++) {
        const t = -half + (c + 0.5) * (2 * half / cols);
        const p = alongFront(shop, t, SHOP_D - 0.4);
        box(p.x, 0.42 + r * 0.4, p.z, 0.2, 0.36, 0.07, COLS[(shop.id + r * 3 + c) % COLS.length], ry);
      }
      for (let r = 0; r < 4; r++) for (let d = 0; d < 8; d++) {
        const p = alongFront(shop, -(span / 2 - 0.28), 0.65 + d * 0.48);
        box(p.x, 0.55 + r * 0.42, p.z, 0.07, 0.36, 0.2, COLS[(shop.id + r + d + 4) % COLS.length], ry);
      }
      const rackTs = span > 4.3 ? [-1.15, 1.15] : [0];
      for (const depth of [1.1, 2.45, 3.55]) for (const t of rackTs) {
        const p = alongFront(shop, t, depth);
        cyl(p.x, 0, p.z, 0.045, 2.02, '#868e96');
        box(p.x, 1.96, p.z, 0.95, 0.04, 0.26, '#495057', ry);
        for (let k = 0; k < 6; k++) {
          box(p.x - 0.34 + (k % 3) * 0.34, 1.18 - Math.floor(k / 3) * 0.62, p.z, 0.26, 0.56, 0.07, COLS[(shop.id + k + depth) % COLS.length], ry);
        }
      }
      const m1 = alongFront(shop, -0.75, 0.82);
      mannequin(m1.x, m1.z, ry + Math.PI, TOPS[shop.id % TOPS.length], BOTS[shop.id % BOTS.length]);
      if (span > 3.5) {
        const m2 = alongFront(shop, 0.85, 0.9);
        mannequin(m2.x, m2.z, ry + Math.PI, TOPS[(shop.id + 3) % TOPS.length], BOTS[(shop.id + 2) % BOTS.length]);
      }
      const ctr = alongFront(shop, shop.type === 'shoes' ? 0 : 0.1, 1.62);
      box(ctr.x, 0.2, ctr.z, 1.55, 0.4, 0.5, '#343a40', ry);
      glassPane(ctr.x, 0.7, ctr.z, 1.5, 0.58, ry);
      box(ctr.x, 0.98, ctr.z, 1.52, 0.03, 0.48, '#ced4da', ry);
      if (shop.type === 'shoes') {
        for (let k = 0; k < 5; k++) box(ctr.x - 0.55 + k * 0.28, 0.48, ctr.z, 0.22, 0.1, 0.32, COLS[(shop.id + k) % COLS.length], ry);
        for (let r = 0; r < 3; r++) for (let c = 0; c < cols; c++) {
          const t = -half + (c + 0.5) * (2 * half / cols);
          const p = alongFront(shop, t, 2.15);
          box(p.x, 0.28 + r * 0.28, p.z, 0.26, 0.1, 0.16, COLS[(shop.id + r + c) % COLS.length], ry);
        }
      } else {
        for (let k = 0; k < 6; k++) box(ctr.x - 0.58 + k * 0.22, 1.08, ctr.z, 0.16, 0.16, 0.16, COLS[(shop.id + k + 2) % COLS.length], ry);
      }
    } else if (shop.type === 'accessories' || shop.type === 'cosmetics' || shop.type === 'phone') {
      const cols = Math.max(8, Math.floor(span / 0.24));
      const rows = shop.type === 'phone' ? 6 : 5;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const t = -half + (c + 0.5) * (2 * half / cols);
        const p = alongFront(shop, t, SHOP_D - 0.38);
        const y = 0.32 + r * 0.36;
        const col = COLS[(shop.id + r * 5 + c) % COLS.length];
        if (shop.type === 'phone') box(p.x, y, p.z, 0.16, 0.3, 0.05, col, ry);
        else if (shop.type === 'cosmetics') cyl(p.x, y - 0.1, p.z, 0.045 + (c % 3) * 0.012, 0.22 + (r % 2) * 0.06, col);
        else box(p.x, y, p.z, 0.12, 0.12, 0.05, col, ry);
      }
      for (let r = 0; r < 4; r++) {
        const sl = alongFront(shop, 0, SHOP_D - 0.42);
        if (shop.axis === 'x') box(sl.x, 0.18 + r * 0.36, sl.z, span - 0.5, 0.03, 0.22, '#dee2e6');
        else box(sl.x, 0.18 + r * 0.36, sl.z, 0.22, 0.03, span - 0.5, '#dee2e6');
      }
      for (let r = 0; r < 4; r++) for (let d = 0; d < 7; d++) {
        const p = alongFront(shop, -(span / 2 - 0.28), 0.55 + d * 0.5);
        const col = COLS[(shop.id + r + d + 6) % COLS.length];
        if (shop.type === 'phone') box(p.x, 0.4 + r * 0.36, p.z, 0.05, 0.28, 0.16, col, ry);
        else if (shop.type === 'cosmetics') cyl(p.x, 0.28 + r * 0.36, p.z, 0.045, 0.22, col);
        else box(p.x, 0.4 + r * 0.36, p.z, 0.05, 0.12, 0.12, col, ry);
      }
      const ctr = alongFront(shop, 0, 1.45);
      box(ctr.x, 0.2, ctr.z, Math.min(2.1, span - 0.6), 0.4, 0.52, '#495057', ry);
      glassPane(ctr.x, 0.72, ctr.z, Math.min(2.05, span - 0.66), 0.62, ry);
      box(ctr.x, 1.02, ctr.z, Math.min(2.08, span - 0.62), 0.03, 0.5, '#dee2e6', ry);
      const nTop = shop.type === 'cosmetics' ? 10 : 7;
      for (let k = 0; k < nTop; k++) {
        const p = alongFront(shop, -0.7 + k * (1.4 / Math.max(1, nTop - 1)), 1.45);
        if (shop.type === 'cosmetics') cyl(p.x, 1.04, p.z, 0.04, 0.2, COLS[(shop.id + k) % COLS.length]);
        else if (shop.type === 'phone') box(p.x, 1.16, p.z, 0.14, 0.24, 0.05, COLS[(shop.id + k + 3) % COLS.length], ry);
        else box(p.x, 1.12, p.z, 0.12, 0.12, 0.08, COLS[(shop.id + k) % COLS.length], ry);
      }
    } else if (shop.type === 'cafe') {
      const p = alongFront(shop, 0, 2.1);
      box(p.x, 0.52, p.z, 2.45, 1.04, 0.72, '#7c4a1e', ry);
      box(p.x, 1.08, p.z, 2.55, 0.06, 0.8, '#f1f3f5', ry);
      cyl(p.x - 0.55, 1.11, p.z, 0.15, 0.22, '#212529');
      box(p.x + 0.55, 1.22, p.z, 0.5, 0.26, 0.38, '#e8590c', ry);
    } else if (shop.type === 'snack') {
      const p = alongFront(shop, 0, 2.05);
      box(p.x, 0.5, p.z, 2.55, 1.0, 0.74, '#e8590c', ry);
      box(p.x, 1.02, p.z, 2.65, 0.06, 0.82, '#fff4e6', ry);
      for (let k = 0; k < 5; k++) box(p.x - 0.95 + k * 0.48, 1.14, p.z, 0.38, 0.1, 0.3, COLS[k + 1], ry);
    } else if (shop.type === 'flower') {
      for (const t of [-1.1, -0.35, 0.35, 1.1]) {
        const p = alongFront(shop, t, 2.0);
        cyl(p.x, 0, p.z, 0.15, 0.34, '#c92a2a');
        cyl(p.x, 0.34, p.z, 0.22, 0.42, '#2f9e44');
        cyl(p.x, 0.74, p.z, 0.13, 0.2, '#f06595');
      }
    }
  }

  for (const shop of L.shops) dressShop(shop);

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
  for (const t of L.tables) {
    S.cyl(t.x, 0.72, t.z, 0.55, 0.06, '#f1f3f5', 10);
    S.cyl(t.x, 0, t.z, 0.08, 0.72, '#868e96', 6);
    for (const a of [0, 2.1, 4.2]) {
      S.box(t.x + Math.cos(a) * 0.78, 0.42, t.z + Math.sin(a) * 0.78, 0.32, 0.08, 0.32, '#dee2e6');
    }
  }

  const wrapAds = [
    ['오늘 강남대로', 'A night walk'],
    ['작은 가게 구경', 'Small shops'],
    ['지하상가 한 바퀴', 'Under the street'],
  ].map((pair, i) => atlas.add(220, 360, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, ['#5f3dc4', '#0b7285', '#c2255c'][i]);
    g.addColorStop(1, ['#22b8cf', '#e8590c', '#7950f2'][i]);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.save(); c.translate(w / 2, h / 2); c.rotate(-Math.PI / 2);
    c.font = `800 28px ${FONT}`; c.fillText(pair[0], 0, -12);
    c.font = `600 16px ${FONT}`; c.fillText(pair[1], 0, 22);
    c.restore();
  }));

  for (const c of L.columns) {
    S.block(c.x, 0, c.z, 0.72, CEIL, 0.72, '#f2efe8');
    S.block(c.x, 0, c.z, 0.8, 0.22, 0.8, '#5c6670');
    const uv = wrapAds[Math.floor(Math.abs(c.x) + Math.abs(c.z)) % wrapAds.length];
    const faces = [[0.38, 0, 0], [-0.38, 0, Math.PI], [0, 0.38, Math.PI / 2], [0, -0.38, -Math.PI / 2]];
    for (const [dx, dz, ry] of faces) {
      G.quad(c.x + dx, 1.58, c.z + dz, 0.62, 1.42, '#ffffff', { ry, uv });
    }
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

  const mapUv = atlas.add(720, 520, (c, w, h) => {
    c.fillStyle = '#f8f4ec'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#212529'; c.font = `800 26px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('강남역 지하상가 안내도', 22, 30);
    c.font = `600 15px ${FONT}`; c.fillStyle = '#868e96'; c.fillText('Gangnam Underground Arcade  ·  Floor map', 22, 58);
    const cx = w * 0.52, cy = h * 0.54;
    c.fillStyle = '#dee2e6'; c.fillRect(80, cy - 28, w - 150, 56);
    c.fillRect(cx - 28, cy - 28, 56, h - cy - 44);
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
  for (const m of L.mapBoards) {
    S.box(m.x, 1.72, m.z, m.w, 2.28, m.d, '#212529');
    const ox = Math.sin(m.ry || 0) * (m.d / 2 + 0.02);
    const oz = Math.cos(m.ry || 0) * (m.d / 2 + 0.02);
    const fw = Math.max(m.w, m.d) > 2 ? 3.05 : 2.0;
    const fh = 2.1;
    G.quad(m.x + (m.ry ? -0.12 : ox), 1.72, m.z + (m.ry ? 0 : oz), fw, fh, '#ffffff', { ry: m.ry || 0, uv: mapUv });
  }

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

  const cartColors = { snack: '#e8590c', acc: '#e64980', flower: '#2f9e44' };
  for (const k of L.carts) {
    const col = cartColors[k.kind] || '#fa5252';
    S.block(k.x, 0, k.z, k.w * 0.92, 0.42, k.d * 0.85, col);
    S.block(k.x, 0.42, k.z, k.w, 0.08, k.d, '#f1f3f5');
    S.block(k.x, 0.5, k.z + k.d * 0.35, k.w * 0.7, 0.85, 0.08, col);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      cyl(k.x + dx * k.w * 0.38, 0, k.z + dz * k.d * 0.35, 0.07, 0.14, '#212529');
    }
    for (let i = 0; i < 5; i++) {
      box(k.x - 0.4 + i * 0.2, 0.62, k.z, 0.16, 0.2, 0.16, COLS[i + (k.kind === 'flower' ? 3 : 0)]);
    }
  }

  const saleUv = atlas.add(200, 90, (c, w, h) => {
    c.fillStyle = '#e03131'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 30px ${FONT}`; c.fillText('SALE 50%', w / 2, h * 0.42);
    c.font = `700 14px ${FONT}`; c.fillText('Special offer', w / 2, h * 0.76);
  });
  const priceUv = atlas.add(160, 90, (c, w, h) => {
    c.fillStyle = '#fff4e0'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#212529'; c.lineWidth = 6; c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = '#212529'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 26px ${FONT}`; c.fillText('12,000', w / 2, h * 0.4);
    c.font = `700 14px ${FONT}`; c.fillText('Sale price', w / 2, h * 0.72);
  });
  for (const r of L.saleRacks) {
    cyl(r.x, 0, r.z, 0.045, 1.85, '#868e96');
    box(r.x, 1.8, r.z, 0.95, 0.04, 0.24, '#495057', r.ry);
    for (let k = 0; k < 6; k++) {
      box(r.x - 0.34 + (k % 3) * 0.34, 1.1 - Math.floor(k / 3) * 0.58, r.z, 0.24, 0.5, 0.07, COLS[(k + 2) % COLS.length], r.ry);
    }
  }
  for (const r of L.saleStands) {
    S.box(r.x, 0.48, r.z, 0.62, 0.78, 0.1, '#1d2228', { ry: r.ry });
    const ox = Math.sin(r.ry) * 0.06, oz = Math.cos(r.ry) * 0.06;
    G.quad(r.x + ox, 0.48, r.z + oz, 0.56, 0.7, '#ffffff', { ry: r.ry, uv: r.kind === 'sale' ? saleUv : priceUv });
  }

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
    const y = CEIL - 0.4;
    const depth = 0.34;
    S.box(x, y, z, w + 0.1, hh + 0.1, depth, '#5c4a10', { ry });
    const ox = Math.sin(ry) * (depth / 2 + 0.012);
    const oz = Math.cos(ry) * (depth / 2 + 0.012);
    G.quad(x + ox, y, z + oz, w, hh, '#ffffff', { ry, uv });
    G.quad(x - ox, y, z - oz, w, hh, '#ffffff', { ry: ry + Math.PI, uv });
    S.box(x, (y + hh / 2 + CEIL) / 2, z, 0.035, Math.max(0.12, CEIL - (y + hh / 2)), 0.035, '#adb5bd');
  };
  hang(0, 0.15, 2.35, hangBoard(['10', '11', '1', '12'], '나가는 곳', 'Way Out', '북쪽 · 테헤란로  /  North · Teheran-ro'));
  hang(-24, 0, 2.2, hangBoard(['8', '9'], '나가는 곳', 'Way Out', '서초대로  /  Seocho-daero'), Math.PI);
  hang(24, 0, 2.2, hangBoard(['1', '12'], '나가는 곳', 'Way Out', '테헤란로  /  Teheran-ro'));
  hang(0, 20, 2.2, hangBoard(['2', '3', '4', '5', '6', '7'], '나가는 곳', 'Way Out', '강남대로 남쪽  /  South'), Math.PI);
  hang(0, 47, 2.15, hangBoard(['2', '3', '4'], '나가는 곳', 'Way Out', '남동  /  Southeast'), 0);
  const platUv = atlas.add(560, 96, (c, w, h) => {
    c.fillStyle = '#1d2228'; c.fillRect(0, 0, w, h);
    const bw = lineBadge(c, 16, 16, 32, P.color, P.short);
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = `800 28px ${FONT}`; c.fillText('타는 곳', 28 + bw, 34);
    c.font = `600 18px ${FONT}`; c.fillStyle = '#c9d1d9'; c.fillText('Platforms  ·  Inner / Outer Circle', 30 + bw, 68);
  });
  hang(21, -10.4, 2.05, platUv);
  const trUv = atlas.add(560, 96, (c, w, h) => {
    c.fillStyle = '#1d2228'; c.fillRect(0, 0, w, h);
    const bw = lineBadge(c, 16, 16, 32, X.color, X.short);
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = `800 26px ${FONT}`; c.fillText('갈아타는 곳', 28 + bw, 34);
    c.font = `600 17px ${FONT}`; c.fillStyle = '#ffa8a8'; c.fillText('Transfer  ·  Shinbundang Line', 30 + bw, 68);
  });
  hang(0, 58.4, 2.05, trUv);

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
    along(PASSAGE_LEN / 2, CEIL, 0.1, PASSAGE_LEN, '#f4f6f8');
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
    const sw = 2.6, sh = sw * 110 / 520;
    if (p.wall === 'w') { G.quad((p.sidePass ? -HALF : EW.x0) + 0.32, 3.05, p.c, sw, sh, '#ffffff', { ry: Math.PI / 2, uv: sign }); }
    else if (p.wall === 'e') { G.quad((p.sidePass ? HALF : EW.x1) - 0.32, 3.05, p.c, sw, sh, '#ffffff', { ry: -Math.PI / 2, uv: sign }); }
    else { G.quad(p.c, 3.05, NORTH_Z + 0.32, sw, sh, '#ffffff', { uv: sign }); }
  }

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

  const YEL = '#e8b800';
  const tactile = (x0, z0, x1, z1) => {
    const l = Math.hypot(x1 - x0, z1 - z0);
    S.box((x0 + x1) / 2, 0.015, (z0 + z1) / 2, 0.28, 0.02, l, YEL, { ry: Math.atan2(x1 - x0, z1 - z0) });
  };
  tactile(-48, 0, 48, 0);
  tactile(0, -28, 0, 66);
  tactile(12.4, -8.2, 21, -8.2);

  const tex = atlas.texture();
  const staticMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: tex, toneMapped: false });
  const sm = new THREE.Mesh(S.build(), staticMat); sm.name = 'gunderStatic';
  const gm = new THREE.Mesh(G.build(), glowMat); gm.name = 'gunderGlow';
  scene.add(sm, gm);
  disposables.push(sm.geometry, gm.geometry, staticMat, glowMat, tex);

  const M4 = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion();
  const SC = new THREE.Vector3(1, 1, 1);
  const YUP = new THREE.Vector3(0, 1, 0);
  const tmpC = new THREE.Color();

  const ceilMat = new THREE.MeshPhongMaterial({
    color: '#f6f7f9', specular: '#ffffff', shininess: 120, emissive: '#dfe4ea', emissiveIntensity: 0.28,
  });
  for (const [x0, x1, z0, z1] of ceilRects) {
    const g = new THREE.BoxGeometry(x1 - x0, 0.08, z1 - z0);
    const m = new THREE.Mesh(g, ceilMat);
    m.position.set((x0 + x1) / 2, CEIL + 0.04, (z0 + z1) / 2);
    m.name = 'gunderCeil';
    scene.add(m);
    disposables.push(g);
  }
  disposables.push(ceilMat);

  const tileSize = 0.62;
  const even = [], odd = [];
  const collectTiles = (x0, x1, z0, z1) => {
    const xs = Math.floor(x0 / tileSize) * tileSize + tileSize / 2;
    const zs = Math.floor(z0 / tileSize) * tileSize + tileSize / 2;
    for (let x = xs; x < x1 - 0.02; x += tileSize) {
      if (x < x0 + 0.02) continue;
      for (let z = zs; z < z1 - 0.02; z += tileSize) {
        if (z < z0 + 0.02) continue;
        const ix = Math.round(x / tileSize), iz = Math.round(z / tileSize);
        ((ix + iz) & 1 ? odd : even).push(x, z);
      }
    }
  };
  collectTiles(EW.x0, EW.x1, -HALF, HALF);
  collectTiles(-HALF, HALF, NORTH_Z, -HALF);
  collectTiles(-HALF, HALF, HALF, SOUTH_Z);
  collectTiles(L2HALL.x0, L2HALL.x1, L2HALL.z0, L2HALL.z1);
  collectTiles(-FOOD.hw, FOOD.hw, FOOD.z0, FOOD.z1);
  const tGeo = new THREE.BoxGeometry(tileSize - 0.03, 0.018, tileSize - 0.03);
  const tMatA = new THREE.MeshPhongMaterial({ color: '#efe8dc', specular: '#d4d0c8', shininess: 78 });
  const tMatB = new THREE.MeshPhongMaterial({ color: '#e3dcd0', specular: '#c8c4bc', shininess: 78 });
  const flushTiles = (arr, mat, name) => {
    const n = arr.length / 2;
    if (!n) return;
    const mesh = new THREE.InstancedMesh(tGeo, mat, n);
    mesh.name = name;
    for (let i = 0; i < n; i++) {
      M4.compose(V.set(arr[i * 2], 0.01, arr[i * 2 + 1]), Q.identity(), SC.set(1, 1, 1));
      mesh.setMatrixAt(i, M4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  };
  flushTiles(even, tMatA, 'gunderTileA');
  flushTiles(odd, tMatB, 'gunderTileB');
  disposables.push(tGeo, tMatA, tMatB);

  const lGeo = new THREE.BoxGeometry(1, 0.035, 1);
  const lMat = new THREE.MeshBasicMaterial({ color: '#fff8e8', toneMapped: false });
  const lMesh = new THREE.InstancedMesh(lGeo, lMat, lightStrips.length);
  lMesh.name = 'gunderStrips';
  lightStrips.forEach((l, i) => {
    M4.compose(V.set(l.x, CEIL - 0.045, l.z), Q.identity(), SC.set(l.sx, 1, l.sz));
    lMesh.setMatrixAt(i, M4);
  });
  lMesh.instanceMatrix.needsUpdate = true;
  scene.add(lMesh);
  const rMat = new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0.15, depthWrite: false });
  const rMesh = new THREE.InstancedMesh(lGeo, rMat, lightStrips.length);
  rMesh.name = 'gunderFloorGlow';
  lightStrips.forEach((l, i) => {
    M4.compose(V.set(l.x, 0.022, l.z), Q.identity(), SC.set(l.sx, 0.4, l.sz));
    rMesh.setMatrixAt(i, M4);
  });
  rMesh.instanceMatrix.needsUpdate = true;
  scene.add(rMesh);
  disposables.push(lGeo, lMat, rMat);
  SC.set(1, 1, 1);

  const flushBoxes = (items, name) => {
    if (!items.length) return 0;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    mesh.name = name;
    items.forEach((b, i) => {
      M4.compose(V.set(b.x, b.y, b.z), Q.setFromAxisAngle(YUP, b.ry || 0), SC.set(b.sx, b.sy, b.sz));
      mesh.setMatrixAt(i, M4);
      mesh.setColorAt(i, tmpC.set(b.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    disposables.push(geo, mat);
    return items.length;
  };
  const flushCyls = (items, name) => {
    if (!items.length) return 0;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 7);
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    mesh.name = name;
    items.forEach((b, i) => {
      M4.compose(V.set(b.x, b.y + b.h / 2, b.z), Q.identity(), SC.set(b.r, b.h, b.r));
      mesh.setMatrixAt(i, M4);
      mesh.setColorAt(i, tmpC.set(b.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    disposables.push(geo, mat);
    return items.length;
  };
  const flushGlass = (items) => {
    if (!items.length) return 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshPhongMaterial({
      color: '#b9d4e4', transparent: true, opacity: 0.2, shininess: 130, specular: '#ffffff', depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    mesh.name = 'gunderGlass';
    items.forEach((b, i) => {
      M4.compose(V.set(b.x, b.y, b.z), Q.setFromAxisAngle(YUP, b.ry || 0), SC.set(b.w, b.h, 1));
      mesh.setMatrixAt(i, M4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    disposables.push(geo, mat);
    return items.length;
  };
  const nBox = flushBoxes(IBOX, 'gunderGoods');
  const nCyl = flushCyls(ICYL, 'gunderBottles');
  const nGlass = flushGlass(IGLASS);
  flushBoxes(IHEAD.map((h) => ({ x: h.x, y: h.y, z: h.z, sx: h.s, sy: h.s, sz: h.s, c: h.c, ry: h.ry })), 'gunderHead');
  flushBoxes(ITORSO, 'gunderTorso');
  flushBoxes(IHIP, 'gunderHip');
  flushBoxes(ILIMB, 'gunderLimb');
  SC.set(1, 1, 1);

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

  const crowdGroup = new THREE.Group(); scene.add(crowdGroup);
  const crowd = buildCrowd(crowdGroup, { name: 'gunderCrowd', cast: () => false });
  const me = createAvatar(look || {}); me.userData.sit = '';
  const meParts = crowd.register(me);
  let rr = 4217; const rnd = () => ((rr = (rr * 16807) % 2147483647) / 2147483647);
  const mobile = isMobileMode();
  const N_WALK = mobile ? 10 : 20;
  const npcs = [];
  const staffBeside = (f) => {
    if (Math.abs(f.x) > 3) {
      const toward = f.x < 0 ? 1 : -1;
      return { x: f.x + toward * (f.w / 2 + 0.55), z: f.z, ry: Math.atan2(-toward, 0) };
    }
    return { x: f.x, z: f.z - f.d / 2 - 0.55, ry: 0 };
  };
  const staffSpots = [
    ...L.cafes.map(staffBeside),
    ...L.foodStands.map(staffBeside),
    ...L.shops.filter((s) => !s.closed && s.rich).slice(0, 4).map((s) => {
      const p = alongFront(s, 0, 0.7);
      return { x: p.x, z: p.z, ry: faceRy(s) };
    }),
  ].filter((s) => walkable(s.x, s.z, 0.28, L));
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

  const corridorPts = (L.npcWays || []).filter((p) => walkable(p.x, p.z, 0.28, L));
  const shopStops = L.shops.filter((s) => !s.closed && (s.rich || s.type === 'fashion')).map((s) => ({ x: s.cx, z: s.cz }))
    .filter((p) => walkable(p.x, p.z, 0.25, L));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  function makeRoute() {
    const pool = corridorPts.length ? corridorPts : [{ x: 0, z: 0 }];
    const a = pick(pool), b = pick(pool);
    const via = rnd() < 0.45 && shopStops.length ? pick(shopStops) : pick(pool);
    return [{ ...a, y: 0 }, { ...via, y: 0 }, { ...b, y: 0 }, pick(pool)];
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
    const nx = p.x + (dx / d) * st, nz = p.z + (dz / d) * st;
    if (walkable(nx, nz, 0.28, L)) { p.x = nx; p.z = nz; }
    else if (walkable(nx, p.z, 0.28, L)) p.x = nx;
    else if (walkable(p.x, nz, 0.28, L)) p.z = nz;
    else n.i++;
    const want = Math.atan2(dx, dz);
    n.mesh.rotation.y += Math.atan2(Math.sin(want - n.mesh.rotation.y), Math.cos(want - n.mesh.rotation.y)) * Math.min(1, dt * 10);
    const li = laneAt(p.x, p.z, L, 1.4); if (li >= 0) tapLane(li, 'npc');
    animateAvatar(n.mesh, sp, dt);
  }

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
    stats: () => ({ shops: L.shops.length, closed: L.shops.filter((s) => s.closed).length, boxes: nBox, bottles: nCyl, glass: nGlass, npcs: npcs.length }),
  };
}
