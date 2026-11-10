// [gangnam-nightlife] 강남 밤거리 장식 자리. OSM advertising/상호가 아니라 도로·건물 외벽 규칙 배치.
//   상호는 만든 이름만 쓴다(실제 브랜드·로고 없음). 입력이 같으면 결과가 같다.
import { projectOnto } from './avenues.js';

export const AVENUE_NAMES = ['강남대로', '테헤란로'];
export const MAJOR_NAMES = ['강남대로', '테헤란로', '서초대로', '논현로', '봉은사로', '역삼로', '언주로'];

export const SHOP_NAMES = [
  '네온포차', '별밤분식', '달빛술집', '골목맥주', '한밤치킨', '청춘노래',
  '새벽김밥', '무지개옷집', '반짝미용', '골든당구', '하모니노래', '노란등주점',
  '푸른약국', '하늘분식', '번지다방', '은빛꽃집', '핫바골목', '빨간등포차',
  '심야라면', '초록서점', '은혜반찬', '범프다방', '월드분식', '범핑노래',
  '밤하늘주점', '네온당구', '골목김밥', '정글주스', '반짝세탁', '푸른안경',
  '달콤빵집', '심야국수', '노을치킨', '청춘다방', '별빛호프', '네온분식',
  '골든호프', '루프나잇', '한길약국', '반짝문구', '푸른옷집', '노란등분식',
  '은빛주점', '핫치킨집', '사거리포차', '역앞김밥', '출구포차', '밤거리호프',
  '네온라운지', '플래시바', '핑크미용', '스카이당구', '골든벨호프', '파도노래',
  '구름다방', '별사탕집', '빨간지붕', '노란우산', '파란문가게', '초록창집',
  '심야호프', '골목라운지', '범프호프', '인투분식',
];

export const NEON_COLORS = [
  '#ff2d8a', '#00e8ff', '#ff3df0', '#ffd84a', '#ff7a18',
  '#8aff3a', '#ff3355', '#4a86ff', '#c45cff', '#f4f7ff',
  '#19e6c2', '#ff9ad5', '#7af0ff', '#ffb347', '#ff5a7a',
];

export const WINDOW_COLORS = [
  '#ffd9a0', '#ffe8c4', '#ffc978', '#c8e7ff', '#ffb0d0', '#e8ffb0', '#ffd0a8', '#b8d8ff',
];

export const BRAND_DENY = [
  '삼성', '스타벅스', 'starbucks', '맥도날드', 'mcdonald', '교보', 'cgv', '롯데', '신세계',
  '현대', 'gs25', 'gs 25', '씨유', 'cu ', '세븐일레븐', '7-eleven', '배스킨', '던킨',
  '이디야', '투썸', '파리바게', '뚜레쥬르', '교촌', '네네치킨', 'bhc', 'bbq', '한신포차',
  '생활맥주', '빽다방', '메가커피', '컴포즈', '할리스', '폴바셋', '엔제리너스',
];

function nz(v) { return v === 0 ? 0 : v; }
const r1 = (v) => nz(Math.round(v * 10) / 10);
const r2 = (v) => nz(Math.round(v * 100) / 100);
const r3 = (v) => nz(Math.round(v * 1000) / 1000);

export function hash01(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function isNightStreet(name) {
  if (!name) return false;
  if (MAJOR_NAMES.includes(name)) return true;
  return name.endsWith('길');
}

export function streetKind(name, w = 12) {
  if (AVENUE_NAMES.includes(name)) return 'avenue';
  if (MAJOR_NAMES.includes(name)) return 'major';
  if (name && name.endsWith('길')) return w <= 8 ? 'alley' : 'side';
  return 'other';
}

export function nightSegs(tiles) {
  const segs = [];
  for (const t of tiles || []) for (const road of t.r || []) {
    if (!isNightStreet(road.n) || !road.p || road.p.length < 2) continue;
    for (let i = 1; i < road.p.length; i++) {
      segs.push({ n: road.n, w: road.w || 8, k: streetKind(road.n, road.w || 8), a: road.p[i - 1], b: road.p[i] });
    }
  }
  return segs;
}

export function majorSegs(tiles) {
  return nightSegs(tiles).filter((s) => s.k === 'avenue' || s.k === 'major');
}

function inRing(x, z, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) c = !c;
  }
  return c;
}

function buildingIndex(buildings, around = null) {
  const list = [];
  for (const b of buildings || []) {
    if (!b.o || b.o.length < 3) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, sx = 0, sz = 0;
    for (const p of b.o) {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
      sx += p[0]; sz += p[1];
    }
    list.push({ b, x0, z0, x1, z1, cx: sx / b.o.length, cz: sz / b.o.length });
  }
  if (around) list.sort((a, b) => Math.hypot(a.cx - around.x, a.cz - around.z) - Math.hypot(b.cx - around.x, b.cz - around.z));
  return list;
}

function insideBuilding(list, x, z) {
  for (const it of list) {
    if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
    if (inRing(x, z, it.b.o)) return true;
  }
  return false;
}

function outward(x0, z0, x1, z1, cx, cz) {
  const L = Math.hypot(x1 - x0, z1 - z0) || 1;
  const tx = (x1 - x0) / L, tz = (z1 - z0) / L;
  let nx = -tz, nz = tx;
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  if (nx * (cx - mx) + nz * (cz - mz) > 0) { nx = -nx; nz = -nz; }
  return { L, tx, tz, nx, nz, mx, mz };
}

function facesRoad(segs, mx, mz, nx, nz, maxD) {
  const out = projectOnto(segs, mx + nx * 1.6, mz + nz * 1.6);
  if (!out || out.d > maxD) return null;
  const inn = projectOnto(segs, mx - nx * 2.2, mz - nz * 2.2);
  if (inn && inn.d + 0.8 < out.d) return null;
  return out;
}

function inBox(box, x, z) {
  if (!box) return true;
  return x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1;
}

function facadeWalk(buildings, segs, blocks, box, minL, maxD, fn) {
  let id = 0;
  for (const it of blocks) {
    if ((it.b.h || 0) < 6) continue;
    const ring = it.b.o;
    for (let i = 0; i < ring.length; i++) {
      const x0 = ring[i][0], z0 = ring[i][1], x1 = ring[(i + 1) % ring.length][0], z1 = ring[(i + 1) % ring.length][1];
      const e = outward(x0, z0, x1, z1, it.cx, it.cz);
      if (e.L < minL) continue;
      const hit = facesRoad(segs, e.mx, e.mz, e.nx, e.nz, maxD);
      if (!hit) continue;
      if (!inBox(box, e.mx, e.mz)) continue;
      fn({ it, e, hit, x0, z0, id: id++ });
    }
  }
}

/** 세로 네온·가로 LED·돌출 간판. [x,y,z,yaw,w,h,nameIdx,colorIdx,kind,seed] kind 0세로 1가로 2돌출 */
export function placeSigns(tiles, { box = null, max = 2600, around = null } = {}) {
  const segs = nightSegs(tiles);
  const buildings = (tiles || []).flatMap((t) => t.b || []);
  const blocks = buildingIndex(buildings, around);
  const out = [];
  const taken = [];
  const nearXZ = (x, z, y, rad) => taken.some((p) => Math.abs(p[2] - y) < 1.35 && (p[0] - x) ** 2 + (p[1] - z) ** 2 < rad * rad);
  const add = (x, y, z, yaw, w, h, nameIdx, colorIdx, kind, hsh) => {
    out.push(r1(x), r1(y), r1(z), r3(yaw), r2(w), r2(h), nameIdx, colorIdx, kind, r2(hsh));
    taken.push([x, z, y]);
  };
  const pass = (wantAvenue, budget) => facadeWalk(buildings, segs, blocks, box, 4.0, 34, ({ it, e, hit, x0, z0, id }) => {
    if (out.length >= budget * 10) return;
    const isAv = !!(hit.n && AVENUE_NAMES.includes(hit.n));
    if (wantAvenue !== isAv) return;
    const isSide = !!(hit.n && String(hit.n).endsWith('길'));
    const step = isAv ? 3.5 : (isSide ? 4.6 : 5.2);
    const maxD = isAv ? 32 : 18;
    if (hit.d > maxD) return;
    const bh = it.b.h || 10;
    const floors = [];
    if (bh >= 6) floors.push(3.55);
    if (bh >= 9) floors.push(6.15);
    if (bh >= 13) floors.push(8.75);
    if (isAv && bh >= 17) floors.push(11.25);
    if (isAv && bh >= 21) floors.push(13.6);
    if (!floors.length) return;
    const slots = Math.max(1, Math.floor(e.L / step));
    for (let s = 0; s < slots; s++) {
      if (out.length >= budget * 10) break;
      const hsh = hash01(id * 97 + s * 13 + Math.round(e.mx * 3) + Math.round(e.mz * 5));
      if (hsh > 0.93) continue;
      const dist = ((s + 0.5) / slots) * e.L;
      const x = x0 + e.tx * dist + e.nx * 1.05;
      const z = z0 + e.tz * dist + e.nz * 1.05;
      if (!inBox(box, x, z) || insideBuilding(blocks, x + e.nx * 0.4, z + e.nz * 0.4)) continue;
      const yaw = Math.atan2(e.nx, e.nz);
      const slotW = Math.min(e.L / slots - 0.28, isAv ? 6.4 : 4.6);
      const w = Math.max(isAv ? 3.6 : 2.8, slotW * (0.82 + hash01(id + s + 4) * 0.16));
      for (let f = 0; f < floors.length; f++) {
        if (out.length >= budget * 10) break;
        const y = floors[f];
        const fh = isAv ? (f === 0 ? 1.42 : 1.24) : (f === 0 ? 1.22 : 1.08);
        if (y + fh * 0.5 > bh - 0.35) continue;
        if (nearXZ(x, z, y, 2.0)) continue;
        if (!isAv && f > 1 && hash01(id + s + f * 17) < 0.28) continue;
        const nameIdx = Math.floor(hash01(id * 17 + s * 31 + f * 5 + 3) * SHOP_NAMES.length) % SHOP_NAMES.length;
        const colorIdx = Math.floor(hash01(id * 41 + s * 7 + f * 11 + 9) * NEON_COLORS.length) % NEON_COLORS.length;
        add(x, y, z, yaw, w, fh, nameIdx, colorIdx, 1, hash01(id + s + f + 24));
      }
      if (bh >= 8 && (isAv || hash01(id + s + 40) > 0.32) && out.length < budget * 10) {
        const vh = Math.min(isAv ? 5.8 : 4.4, bh - 3.2);
        const vy = 3.2 + vh * 0.5;
        if (vy + vh * 0.5 < bh - 0.3) {
          const nameIdx = Math.floor(hash01(id * 19 + s * 11 + 5) * SHOP_NAMES.length) % SHOP_NAMES.length;
          const colorIdx = Math.floor(hash01(id * 29 + s + 15) * NEON_COLORS.length) % NEON_COLORS.length;
          const vx = x + e.tx * (isAv ? 1.7 : 1.1);
          const vz = z + e.tz * (isAv ? 1.7 : 1.1);
          if (!nearXZ(vx, vz, vy, 0.85)) add(vx, vy, vz, yaw, isAv ? 1.05 : 0.95, vh, nameIdx, colorIdx, 0, hash01(id + s + 41));
        }
      }
      if (bh >= 8 && (isAv || hash01(id + s + 50) > 0.38) && out.length < budget * 10) {
        const bhgt = Math.min(isAv ? 4.2 : 2.8, bh - 3);
        const by = 4.6 + hash01(id + s + 7) * 1.1;
        const nameIdx = Math.floor(hash01(id * 13 + s * 21 + 8) * SHOP_NAMES.length) % SHOP_NAMES.length;
        const colorIdx = Math.floor(hash01(id * 37 + s + 18) * NEON_COLORS.length) % NEON_COLORS.length;
        const outN = isAv ? 1.75 : 1.35;
        add(x + e.nx * outN, by, z + e.nz * outN, yaw + Math.PI / 2, isAv ? 1.15 : 0.95, bhgt, nameIdx, colorIdx, 2, hash01(id + s + 51));
      }
    }
  });
  const sideBudget = Math.floor(max * 0.32);
  pass(true, max - sideBudget);
  pass(false, max);
  return out.slice(0, max * 10);
}

/** 1층 쇼윈도. [x,y,z,yaw,w,h,colorIdx] */
export function placeShopWindows(tiles, { box = null, max = 720, around = null } = {}) {
  const segs = nightSegs(tiles);
  const buildings = (tiles || []).flatMap((t) => t.b || []);
  const blocks = buildingIndex(buildings, around);
  const out = [];
  const pass = (wantAvenue) => facadeWalk(buildings, segs, blocks, box, 4.6, 20, ({ it, e, hit, x0, z0, id }) => {
    if (out.length >= max * 7) return;
    if ((it.b.h || 0) < 7) return;
    const isAv = !!(hit.n && AVENUE_NAMES.includes(hit.n));
    if (wantAvenue !== isAv) return;
    const bays = Math.max(1, Math.min(5, Math.floor(e.L / 5.2)));
    for (let s = 0; s < bays; s++) {
      if (out.length >= max * 7) break;
      if (hash01(id * 29 + s * 5 + 8) > 0.88) continue;
      const dist = ((s + 0.5) / bays) * e.L;
      const x = x0 + e.tx * dist + e.nx * 0.22;
      const z = z0 + e.tz * dist + e.nz * 0.22;
      if (!inBox(box, x, z) || insideBuilding(blocks, x + e.nx * 0.3, z + e.nz * 0.3)) continue;
      const yaw = Math.atan2(e.nx, e.nz);
      const w = Math.min(4.8, Math.max(2.6, e.L / bays - 0.7));
      const ci = Math.floor(hash01(id + s + 40) * WINDOW_COLORS.length) % WINDOW_COLORS.length;
      out.push(r1(x), r1(1.7), r1(z), r3(yaw), r2(w), r2(2.4), ci);
    }
  });
  pass(true);
  pass(false);
  return out.slice(0, max * 7);
}

function sortSegs(segs, around) {
  if (!around) return segs;
  return segs.slice().sort((a, b) => {
    const da = Math.hypot((a.a[0] + a.b[0]) / 2 - around.x, (a.a[1] + a.b[1]) / 2 - around.z);
    const db = Math.hypot((b.a[0] + b.b[0]) / 2 - around.x, (b.a[1] + b.b[1]) / 2 - around.z);
    return da - db;
  });
}

/** 고층 미디어 파사드·사거리 코너 전광판. [x,y,z,yaw,w,h,colorIdx] */
export function placeFacades(tiles, { box = null, max = 72, around = null } = {}) {
  const segs = nightSegs(tiles).filter((s) => s.k === 'avenue' || s.k === 'major');
  const buildings = (tiles || []).flatMap((t) => t.b || []);
  const blocks = buildingIndex(buildings, around);
  const out = [];
  const used = [];
  const ix = -7144, iz = -14531;
  facadeWalk(buildings, segs, blocks, box, 6, 55, ({ it, e, hit, id }) => {
    if (out.length >= max * 7) return;
    const d = Math.hypot(it.cx - ix, it.cz - iz);
    if (d < 20 || d > 82) return;
    if ((it.b.h || 0) < 14) return;
    const key = `c${Math.round(it.cx / 10)}_${Math.round(it.cz / 10)}_${Math.round(e.mx / 6)}_${Math.round(e.mz / 6)}`;
    if (used.includes(key)) return;
    const w = Math.min(Math.max(8, e.L * 0.72), 16);
    const h = Math.min(Math.max(7, (it.b.h - 5) * 0.32), 13);
    if (w < 7 || h < 6) return;
    const y = Math.min(it.b.h - h * 0.5 - 1, 12);
    const x = e.mx + e.nx * 0.95;
    const z = e.mz + e.nz * 0.95;
    const yaw = Math.atan2(e.nx, e.nz);
    const ci = Math.floor(hash01(id + 190) * NEON_COLORS.length) % NEON_COLORS.length;
    out.push(r1(x), r1(y), r1(z), r3(yaw), r2(w), r2(h), ci);
    used.push(key);
    if ((it.b.h || 0) >= 22 && e.L >= 12 && out.length < max * 7) {
      const h2 = Math.min(8, h * 0.75);
      const y2 = Math.min(it.b.h - h2 * 0.5 - 1, y + h * 0.55 + 2);
      if (y2 - y > 5) {
        out.push(r1(x + e.tx * 2), r1(y2), r1(z + e.tz * 2), r3(yaw), r2(Math.min(w * 0.85, 12)), r2(h2), (ci + 2) % NEON_COLORS.length);
      }
    }
  });
  const pass = (wantAvenue) => facadeWalk(buildings, segs, blocks, box, 8, 40, ({ it, e, hit, id }) => {
    if (out.length >= max * 7) return;
    const isAv = !!(hit.n && AVENUE_NAMES.includes(hit.n));
    if (wantAvenue !== isAv) return;
    if ((it.b.h || 0) < 16) return;
    if (hit.d > 38) return;
    const key = `${Math.round(it.cx / 8)}_${Math.round(it.cz / 8)}`;
    if (used.includes(key)) return;
    if (hash01(id * 7 + Math.round(it.cx) + Math.round(it.cz)) < 0.12) return;
    const w = Math.min(e.L * 0.78, 18);
    const h = Math.min(Math.max(6, (it.b.h - 6) * 0.48), 22);
    if (w < 5 || h < 5) return;
    const y = Math.min(it.b.h - h * 0.5 - 1.2, 8 + h * 0.5);
    const x = e.mx + e.nx * 0.85;
    const z = e.mz + e.nz * 0.85;
    const yaw = Math.atan2(e.nx, e.nz);
    const ci = Math.floor(hash01(id + 90) * NEON_COLORS.length) % NEON_COLORS.length;
    out.push(r1(x), r1(y), r1(z), r3(yaw), r2(w), r2(h), ci);
    used.push(key);
  });
  pass(true);
  pass(false);
  return out.slice(0, max * 7);
}

/** 골목 포장마차·주점 등. [x,y,z,colorIdx,scale] */
export function placeLanterns(tiles, { box = null, max = 180, around = null } = {}) {
  const segs = sortSegs(nightSegs(tiles).filter((s) => s.k === 'alley' || s.k === 'side'), around);
  const buildings = (tiles || []).flatMap((t) => t.b || []);
  const blocks = buildingIndex(buildings);
  const out = [];
  const taken = [];
  const near = (x, z) => taken.some((p) => (p[0] - x) ** 2 + (p[1] - z) ** 2 < 10 * 10);
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
    if (L < 10) continue;
    const tx = dx / L, tz = dz / L, nx = -tz, nz = tx;
    const off = Math.max(0.7, (s.w || 6) * 0.22);
    for (let d = 6; d < L - 4; d += 13) {
      for (const side of [-1, 1]) {
        if (out.length >= max * 5) return out;
        let x = s.a[0] + tx * d + nx * side * off;
        let z = s.a[1] + tz * d + nz * side * off;
        if (insideBuilding(blocks, x, z)) {
          const off2 = Math.max(0.35, (s.w || 6) * 0.1);
          x = s.a[0] + tx * d + nx * side * off2;
          z = s.a[1] + tz * d + nz * side * off2;
        }
        if (!inBox(box, x, z) || insideBuilding(blocks, x, z) || near(x, z)) continue;
        const ci = Math.floor(hash01(Math.round(x * 4) + Math.round(z * 7) + side + 3) * 6) % 6;
        const sc = 0.22 + hash01(Math.round(x) + Math.round(z) + 5) * 0.12;
        out.push(r1(x), r1(2.85 + hash01(Math.round(z) + 2) * 0.35), r1(z), ci, r2(sc));
        taken.push([x, z]);
      }
    }
  }
  return out;
}

/** 골목 가로줄 전구. [x,y,z] */
export function placeStrings(tiles, { box = null, max = 220, around = null } = {}) {
  const segs = sortSegs(nightSegs(tiles).filter((s) => s.k === 'alley'), around);
  const out = [];
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
    if (L < 12) continue;
    const tx = dx / L, tz = dz / L, nx = -tz, nz = tx;
    const half = Math.min(3.2, (s.w || 6) * 0.45);
    for (let d = 8; d < L - 6; d += 20) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        if (out.length >= max * 3) return out;
        const t = (i / (n - 1)) * 2 - 1;
        const x = s.a[0] + tx * d + nx * t * half;
        const z = s.a[1] + tz * d + nz * t * half;
        if (!inBox(box, x, z)) continue;
        const y = 3.7 + Math.sin(i * 0.9) * 0.18;
        out.push(r1(x), r1(y), r1(z));
      }
    }
  }
  return out;
}

function segIntersect(a, b, c, d) {
  const x1 = a[0], z1 = a[1], x2 = b[0], z2 = b[1], x3 = c[0], z3 = c[1], x4 = d[0], z4 = d[1];
  const den = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
  if (Math.abs(den) < 1e-8) return null;
  const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / den;
  const u = ((x1 - x3) * (z1 - z2) - (z1 - z3) * (x1 - x2)) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: x1 + t * (x2 - x1), z: z1 + t * (z2 - z1), t };
}

/** 주요 교차 횡단보도. [x,y,z,yaw,w,len] */
export function placeCrossings(tiles, { box = null } = {}) {
  const segs = majorSegs(tiles);
  const out = [];
  const taken = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (segs[i].n === segs[j].n) continue;
      const hit = segIntersect(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
      if (!hit || !inBox(box, hit.x, hit.z)) continue;
      if (taken.some((p) => (p[0] - hit.x) ** 2 + (p[1] - hit.z) ** 2 < 22 * 22)) continue;
      const wide = (segs[i].w || 12) >= (segs[j].w || 12) ? segs[i] : segs[j];
      const dx = wide.b[0] - wide.a[0], dz = wide.b[1] - wide.a[1], L = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(dx / L, dz / L);
      out.push(r1(hit.x), 0.06, r1(hit.z), r3(yaw), r2(Math.max(10, wide.w || 14)), 5.2);
      taken.push([hit.x, hit.z]);
    }
  }
  return out;
}

/** 교차로 신호등 불빛. [x,y,z,colorIdx] 0빨강 1노랑 2초록 */
export function placeSignals(crossings) {
  const out = [];
  for (let i = 0; i < (crossings || []).length; i += 6) {
    const x = crossings[i], z = crossings[i + 2], yaw = crossings[i + 3], w = crossings[i + 4];
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const nx = -s, nz = c;
    const half = w * 0.42;
    const cols = [0, 2, 0, 2];
    const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    corners.forEach((cc, k) => {
      const px = x + c * cc[0] * half + nx * cc[1] * 2.4;
      const pz = z - s * cc[0] * half + nz * cc[1] * 2.4;
      out.push(r1(px), 5.15, r1(pz), cols[k]);
    });
  }
  return out;
}

/** 지하철 출구 빛. [x,y,z,yaw,w,h,kind] kind 0바닥 1캐노피 2번짐 */
export function placeExitGlows(exits) {
  const out = [];
  for (const e of exits || []) {
    const yaw = e.dir ?? 0;
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const at = (u, v) => [e.x + ca * u - sa * v, e.z + sa * u + ca * v];
    const [gx, gz] = at(0.4, 0);
    out.push(r1(gx), 0.08, r1(gz), r3(yaw), 6.4, 3.8, 0);
    const [hx, hz] = at(0, 0);
    out.push(r1(hx), 3.25, r1(hz), r3(yaw), 8.2, 4.2, 1);
    const [sx, sz] = at(3.2, 0);
    out.push(r1(sx), 1.6, r1(sz), r3(yaw), 2.4, 3.1, 2);
  }
  return out;
}

function sortAround(segs, around) {
  if (!around) return segs;
  return segs.slice().sort((a, b) => {
    const pa = a.n === '강남대로' ? 0 : 1;
    const pb = b.n === '강남대로' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const da = Math.hypot((a.a[0] + a.b[0]) / 2 - around.x, (a.a[1] + a.b[1]) / 2 - around.z);
    const db = Math.hypot((b.a[0] + b.b[0]) / 2 - around.x, (b.a[1] + b.b[1]) / 2 - around.z);
    return da - db;
  });
}

function placeLaneLights(segs, { step, sideSign, box, minW = 12, len = 16, max = 160, yawAdd = 0, around = null } = {}) {
  const out = [];
  for (const s of sortAround(segs, around)) {
    if ((s.w || 0) < minW) continue;
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
    if (L < 24) continue;
    const tx = dx / L, tz = dz / L, nx = -tz, nz = tx;
    const yaw = Math.atan2(tx, tz) + yawAdd;
    const side = sideSign * 0.24 * s.w;
    for (let d = 12; d < L - 8; d += step) {
      if (out.length >= max * 4) return out;
      const x = s.a[0] + tx * d + nx * side;
      const z = s.a[1] + tz * d + nz * side;
      if (!inBox(box, x, z)) continue;
      out.push(r1(x), r1(z), r3(yaw), len);
    }
  }
  return out;
}

/** 헤드라이트 줄기. 양방향. [x,z,yaw,len] */
export function placeHeadlights(tiles, { box = null, around = null } = {}) {
  const segs = nightSegs(tiles).filter((s) => s.k === 'avenue' || s.k === 'major');
  const a = placeLaneLights(segs, { step: 20, sideSign: -1, box, minW: 12, len: 36, max: 200, around });
  const b = placeLaneLights(segs, { step: 22, sideSign: 1, box, minW: 12, len: 34, max: 200, yawAdd: Math.PI, around });
  return a.concat(b);
}

/** 테일라이트 줄기. 양방향. [x,z,yaw,len] */
export function placeTaillights(tiles, { box = null, around = null } = {}) {
  const segs = nightSegs(tiles).filter((s) => s.k === 'avenue' || s.k === 'major');
  const a = placeLaneLights(segs, { step: 22, sideSign: -1, box, minW: 12, len: 28, max: 180, around });
  const b = placeLaneLights(segs, { step: 24, sideSign: 1, box, minW: 12, len: 26, max: 180, yawAdd: Math.PI, around });
  return a.concat(b);
}

/** 노면 빛웅덩이(원형 그라디언트용). [x,z,yaw,w,len] */
export function placeWet(tiles, { box = null } = {}) {
  const segs = nightSegs(tiles).filter((s) => s.k === 'avenue' || s.k === 'major');
  const out = [];
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
    if (L < 20) continue;
    const tx = dx / L, tz = dz / L;
    const yaw = Math.atan2(tx, tz);
    for (let d = 12; d < L - 10; d += 32) {
      if (out.length >= 80 * 5) return out;
      const x = s.a[0] + tx * d, z = s.a[1] + tz * d;
      if (!inBox(box, x, z)) continue;
      const dia = 6.4 + hash01(Math.round(x * 3) + Math.round(z * 5)) * 2.6;
      out.push(r1(x), r1(z), r3(yaw), r2(dia), r2(dia));
    }
  }
  return out;
}

/** 대로 양쪽 차로 샘플. 각 차선은 [x,z,yaw, ...] */
export function sampleLanes(tiles, { box = null, around = null, max = 24 } = {}) {
  const out = [];
  const segs = sortAround(nightSegs(tiles).filter((s) => s.n === '강남대로' || s.n === '테헤란로'), around);
  for (const s of segs) {
    if (out.length >= max) break;
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
    if (L < 56) continue;
    const tx = dx / L, tz = dz / L, nx = -tz, nz = tx;
    const w = s.w || 16;
    for (const dir of [1, -1]) {
      const a = dir === 1 ? s.a : s.b;
      const sx = dir * tx, sz = dir * tz;
      const side = dir * -0.22 * w;
      const yaw = Math.atan2(sx, sz);
      const pts = [];
      for (let d = 6; d < L - 6; d += 4) {
        const x = a[0] + sx * d + nx * side;
        const z = a[1] + sz * d + nz * side;
        if (!inBox(box, x, z)) continue;
        pts.push(r1(x), r1(z), r3(yaw));
      }
      if (pts.length >= 18 && out.length < max) out.push(pts);
    }
  }
  return out;
}

/** 옥상·모서리 LED 띠. [x,y,z,yaw,w,h,colorIdx,kind] kind 0옥상가로 1모서리세로 */
export function placeStrips(tiles, { box = null, max = 110, around = null } = {}) {
  const segs = nightSegs(tiles).filter((s) => s.k === 'avenue' || s.k === 'major');
  const buildings = (tiles || []).flatMap((t) => t.b || []);
  const blocks = buildingIndex(buildings, around);
  const out = [];
  const pass = (wantAvenue) => facadeWalk(buildings, segs, blocks, box, 8, 36, ({ it, e, hit, id }) => {
    if (out.length >= max * 8) return;
    const isAv = !!(hit.n && AVENUE_NAMES.includes(hit.n));
    if (wantAvenue !== isAv) return;
    if ((it.b.h || 0) < 12) return;
    if (hit.d > 34) return;
    if (hash01(id * 11 + 4) < 0.22) return;
    const yaw = Math.atan2(e.nx, e.nz);
    const w = Math.min(e.L * 0.88, 22);
    const y = (it.b.h || 22) - 0.9;
    out.push(r1(e.mx + e.nx * 0.35), r1(y), r1(e.mz + e.nz * 0.35), r3(yaw), r2(w), 0.55, Math.floor(hash01(id + 3) * NEON_COLORS.length) % NEON_COLORS.length, 0);
    if ((it.b.h || 0) >= 28 && hash01(id + 8) > 0.4 && out.length < max * 8) {
      const h = Math.min(it.b.h - 8, 36);
      out.push(r1(e.mx + e.nx * 0.3 + e.tx * (e.L * 0.48)), r1(8 + h * 0.5), r1(e.mz + e.nz * 0.3 + e.tz * (e.L * 0.48)), r3(yaw), 0.38, r2(h), (Math.floor(hash01(id + 9) * NEON_COLORS.length) + 2) % NEON_COLORS.length, 1);
    }
  });
  pass(true);
  pass(false);
  return out.slice(0, max * 8);
}

export function countsOf(data) {
  return {
    signs: (data.signs?.length || 0) / 10,
    windows: (data.windows?.length || 0) / 7,
    facades: (data.facades?.length || 0) / 7,
    lanterns: (data.lanterns?.length || 0) / 5,
    strings: (data.strings?.length || 0) / 3,
    crossings: (data.crossings?.length || 0) / 6,
    signals: (data.signals?.length || 0) / 4,
    exits: (data.exits?.length || 0) / 7,
    heads: (data.heads?.length || 0) / 4,
    tails: (data.tails?.length || 0) / 4,
    wet: (data.wet?.length || 0) / 5,
    strips: (data.strips?.length || 0) / 8,
  };
}
