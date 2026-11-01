// [shops] 1층 상가: 소상공인시장진흥공단 상가(상권)정보(층정보=1)를 정자 건물에 붙인 public/jeongja-shops.json 을 쓴다.
//   a) 1층 색 띠 — buildWorld 의 기존 합친 벽 메시 안에서 버텍스 컬러로 (추가 draw 0)
//   b) 업종 색 차양 — InstancedMesh 1개 (도로 쪽 외벽)
//   c) 상호 간판 — 플레이어 주변(70 m)만, 풀 28개를 InstancedMesh 1개 + 캔버스 아틀라스 1장으로
// ?shops=0 이면 파일을 받지 않아 기존과 똑같다.
import * as THREE from 'three';
import { matchKeyedRows, ringCentroid } from './keyedBuildings.js';

export const SHOP_GF_H = 3.2; // 1층 높이(= FACADE_FLOOR)
const MIN_SHOP_H = 2.6;      // 이보다 낮은 건물(정자·창고 등)엔 가게를 달지 않는다
/** 지면에 붙어 있고 1층을 낼 만큼 높은 건물인가 (띠·차양·간판 공통 조건) */
export const isShopFront = (b, h = b.h) => (b.mh || 0) < 0.5 && h >= MIN_SHOP_H;
/** 1층 띠 높이(m). 가게가 없거나 조건이 안 되면 0, 낮은 건물은 벽 전체가 띠 */
export function shopBandHeight(shop, b, h) {
  if (!shop || !isShopFront(b, h)) return 0;
  return h <= SHOP_GF_H + 0.8 ? h : SHOP_GF_H;
}
// 카테고리 순서는 jeongja-shops.json meta.cats 와 같아야 한다 (scripts/ground-floor-shops.mjs)
const CAT_STYLE = {
  cafe: { color: '#b98a62', label: '카페' },
  restaurant: { color: '#d9775a', label: '음식점' },
  bar: { color: '#9a6aa3', label: '주점' },
  bakery: { color: '#e2b257', label: '베이커리' },
  convenience: { color: '#5fae74', label: '편의점' },
  retail: { color: '#5f8fc4', label: '상점' },
  beauty: { color: '#df7fa3', label: '미용' },
  academy: { color: '#7d6fc6', label: '학원' },
  real_estate: { color: '#4fa3a0', label: '부동산' },
  health: { color: '#4fb08f', label: '병원·약국' },
  other: { color: '#9b958a', label: '가게' },
};
const BAND_MIX = 0.5;       // 벽 기본색 → 업종색 섞는 비율 (은은하게)
const SIGN_RANGE = 70;      // m
const SIGN_POOL = 28;
const SLOT_W = 256, SLOT_H = 64, ATLAS_W = 1024, ATLAS_H = 512; // 4 x 8 = 32 슬롯
const COLS = ATLAS_W / SLOT_W, ROWS = ATLAS_H / SLOT_H;
const AWN_TOP = 2.7, AWN_DEPTH = 1.1, AWN_DROP = 0.42;
const SIGN_H = 0.7;

/** jeongja-shops.json -> { byIdx: Map<buildingIndex, entry>, dropped } | null. 중심점이 어긋나면(지도 재생성) 버린다. */
export function prepareShops(data, json) {
  const m = matchKeyedRows(data?.buildings, json);
  if (!m?.rows.length) return null;
  const cats = json.meta.cats || Object.keys(CAT_STYLE);
  const byIdx = new Map();
  for (const { idx, b, row: [, ci, count, , , names, osmOnly] } of m.rows) {
    const cat = CAT_STYLE[cats[ci]] ? cats[ci] : 'other';
    byIdx.set(idx, { idx, b, cat, count, names: names ? names.split('|').filter(Boolean) : [], osmOnly: !!osmOnly });
  }
  return { byIdx, dropped: m.dropped };
}

const _c = new THREE.Color(), _w = new THREE.Color('#ffffff');
/** 1층 띠 버텍스 색 (wallTint 기준으로 업종색을 은은하게) */
export function bandTint(cat, wallTint, out = new THREE.Color()) {
  _c.set((CAT_STYLE[cat] || CAT_STYLE.other).color);
  return out.copy(wallTint || _w).lerp(_c, BAND_MIX);
}

// --- 외벽 고르기: 가장 가깝고 넓은 도로를 바라보는 변 ---
function roadIndex(roads) {
  const cell = 40, grid = new Map();
  for (const r of roads) {
    if (!['primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified', 'service', 'living_street', 'pedestrian', 'footway'].includes(r.k)) continue;
    const w = r.k === 'footway' ? 1.5 : r.w || 4;
    for (let i = 1; i < r.p.length; i++) {
      const a = r.p[i - 1], b = r.p[i];
      const s = { ax: a[0], az: a[1], bx: b[0], bz: b[1], w };
      for (let gx = Math.floor((Math.min(a[0], b[0]) - 40) / cell); gx <= Math.floor((Math.max(a[0], b[0]) + 40) / cell); gx++)
        for (let gz = Math.floor((Math.min(a[1], b[1]) - 40) / cell); gz <= Math.floor((Math.max(a[1], b[1]) + 40) / cell); gz++) {
          const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s);
        }
    }
  }
  return (x, z) => grid.get(Math.floor(x / cell) + ',' + Math.floor(z / cell)) || [];
}
function outwardEdges(ring) {
  const [cx, cz] = ringCentroid(ring);
  let a = 0; for (let i = 0; i < ring.length; i++) { const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length]; a += x1 * z2 - x2 * z1; }
  const edges = [];
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    if (L < 3) continue;
    let nx = -dz / L, nz = dx / L;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    // 오목 다각형도 맞도록 면적 부호로 바깥쪽을 정하고, 애매하면 중심 반대쪽
    if (a !== 0) { if (a > 0) { nx = -nx; nz = -nz; } } else if (nx * (cx - mx) + nz * (cz - mz) > 0) { nx = -nx; nz = -nz; }
    edges.push({ x0, z0, dx: dx / L, dz: dz / L, nx, nz, L, mx, mz });
  }
  return edges;
}
function pickStreetFace(ring, segsAt, avoid) {
  let best = null, bestS = -Infinity;
  for (const e of outwardEdges(ring)) {
    if (avoid && avoid.some((f) => Math.hypot(f.mx - e.mx, f.mz - e.mz) < 0.6)) continue;
    let s = 0, at = null;
    for (const g of segsAt(e.mx, e.mz)) {
      const dx = g.bx - g.ax, dz = g.bz - g.az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((e.mx - g.ax) * dx + (e.mz - g.az) * dz) / L2));
      const px = g.ax + dx * t, pz = g.az + dz * t, vx = px - e.mx, vz = pz - e.mz, d = Math.hypot(vx, vz) || 0.01;
      if (d > 40) continue;
      const facing = (vx * e.nx + vz * e.nz) / d;
      if (facing < 0.35) continue;
      const sc = (facing * (g.w + 3)) / (d + 6);
      if (sc > s) { s = sc; at = { x: px, z: pz }; }
    }
    s += Math.min(e.L, 12) * 0.01;
    if (s > bestS) { bestS = s; best = { ...e, road: at, score: s }; }
  }
  return best && best.road ? best : null;
}

// 차양: 기울어진 판 + 앞 드림. 로컬 X = 폭(1), +Z = 바깥, 원점 = 벽면 위쪽 모서리
function awningGeometry() {
  const slope = new THREE.BoxGeometry(1, 0.05, Math.hypot(AWN_DEPTH, AWN_DROP));
  slope.rotateX(Math.atan2(AWN_DROP, AWN_DEPTH));
  slope.translate(0, -AWN_DROP / 2, AWN_DEPTH / 2);
  const val = new THREE.BoxGeometry(1, 0.26, 0.04);
  val.translate(0, -AWN_DROP - 0.11, AWN_DEPTH);
  const g = new THREE.BufferGeometry();
  const parts = [slope, val].map((p) => p.toNonIndexed());
  for (const name of ['position', 'normal']) {
    const n = parts.reduce((s, p) => s + p.attributes[name].array.length, 0), arr = new Float32Array(n);
    let o = 0; for (const p of parts) { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; }
    g.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  slope.dispose(); val.dispose(); parts.forEach((p) => p.dispose());
  return g;
}

/**
 * 차양 + 간판 풀. buildWorld 끝에서 호출.
 * @param placedSigns addPlaceSigns 반환값 [{host, face, text}] — 같은 건물엔 이름 간판을 또 달지 않고, 차양은 다른 면에.
 * @param isShell (b) => 스타벅스 유리 매장 건물인가. 그 건물은 1층 띠처럼 차양·간판도 달지 않는다 (유리 모델과 겹침)
 */
export function addGroundFloorShops(scene, data, shops, placedSigns = [], isShell = () => false) {
  if (!shops?.byIdx?.size) return null;
  const segsAt = roadIndex(data.roads || []);
  const signHosts = new Map();
  for (const p of placedSigns) { if (!p.host) continue; if (!signHosts.has(p.host)) signHosts.set(p.host, []); signHosts.get(p.host).push(p.face); }
  const norm = (s) => String(s || '').replace(/\s+/g, '');
  const labelTexts = new Set((data.labels || []).map((l) => norm(l.text)).filter((s) => s.length >= 2));

  const spots = [];
  for (const e of shops.byIdx.values()) {
    const b = e.b;
    if (!isShopFront(b) || isShell(b)) continue;
    const avoid = signHosts.get(b);
    const face = pickStreetFace(b.o, segsAt, avoid);
    if (!face) continue;
    const along = Math.max(0, Math.min(face.L, (face.road.x - face.x0) * face.dx + (face.road.z - face.z0) * face.dz));
    const w = Math.min(face.L - 0.6, Math.max(2.4, Math.min(9, 2 + e.count * 0.9)));
    if (w < 1.8) continue;
    const t = Math.max(w / 2 + 0.3, Math.min(face.L - w / 2 - 0.3, along));
    const x = face.x0 + face.dx * t, z = face.z0 + face.dz * t;
    const name = e.names.find((n) => !labelTexts.has(norm(n)) && ![...labelTexts].some((l) => l.includes(norm(n)) || norm(n).includes(l))) || null;
    const top = Math.min(AWN_TOP, b.h - 0.35);
    spots.push({ e, x, z, nx: face.nx, nz: face.nz, rot: Math.atan2(face.nx, face.nz), w, faceL: face.L, top, name: avoid ? null : name });
  }

  // --- 차양 InstancedMesh (draw 1 + 그림자 1) ---
  const awnGeo = awningGeometry();
  const awnMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const awn = new THREE.InstancedMesh(awnGeo, awnMat, Math.max(1, spots.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(up, s.rot);
    pos.set(s.x + s.nx * 0.04, s.top, s.z + s.nz * 0.04);
    scl.set(s.w, 1, 1);
    awn.setMatrixAt(i, m4.compose(pos, q, scl));
    awn.setColorAt(i, col.set(CAT_STYLE[s.e.cat].color).offsetHSL(0, 0.04, 0.02));
  });
  awn.count = spots.length;
  awn.castShadow = true; awn.receiveShadow = true;
  awn.instanceMatrix.needsUpdate = true; if (awn.instanceColor) awn.instanceColor.needsUpdate = true;
  awn.computeBoundingSphere();
  awn.name = 'shops-awnings';
  scene.add(awn);

  // --- 간판 풀: InstancedMesh 1개 + 아틀라스 1장 (draw 1) ---
  const cv = document.createElement('canvas'); cv.width = ATLAS_W; cv.height = ATLAS_H;
  const g2 = cv.getContext('2d');
  const atlas = new THREE.CanvasTexture(cv);
  atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
  const signGeo = new THREE.PlaneGeometry(1, 1);
  const uvRect = new THREE.InstancedBufferAttribute(new Float32Array(SIGN_POOL * 4), 4);
  uvRect.setUsage(THREE.DynamicDrawUsage);
  signGeo.setAttribute('aUvRect', uvRect);
  const signMat = new THREE.MeshBasicMaterial({ map: atlas, color: '#f2f2f2' });
  signMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute vec4 aUvRect;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = aUvRect.xy + uv * aUvRect.zw;\n#endif');
  };
  signMat.customProgramCacheKey = () => 'shops-sign-atlas';
  const signs = new THREE.InstancedMesh(signGeo, signMat, SIGN_POOL);
  signs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  signs.count = 0; signs.frustumCulled = false; signs.name = 'shops-signs';
  scene.add(signs);

  const font = (px) => `bold ${px}px "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  function drawSlot(slot, text, accent) {
    const sx = (slot % COLS) * SLOT_W, sy = Math.floor(slot / COLS) * SLOT_H;
    g2.clearRect(sx, sy, SLOT_W, SLOT_H);
    let px = 38; g2.font = font(px);
    let tw = g2.measureText(text).width;
    while (tw > SLOT_W - 34 && px > 22) { px -= 2; g2.font = font(px); tw = g2.measureText(text).width; }
    let shown = text;
    while (tw > SLOT_W - 34 && shown.length > 2) { shown = shown.slice(0, -1); tw = g2.measureText(shown + '…').width; }
    if (shown !== text) shown += '…';
    const dw = Math.min(SLOT_W - 4, Math.ceil(tw + 30));
    g2.fillStyle = '#f6f1e8'; g2.fillRect(sx + 2, sy + 2, dw, SLOT_H - 4);
    g2.fillStyle = accent; g2.fillRect(sx + 2, sy + 2, dw, 8);
    g2.fillStyle = '#1b2430'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillText(shown, sx + 2 + dw / 2, sy + 2 + 4 + (SLOT_H - 4) / 2);
    return dw;
  }

  const named = spots.filter((s) => s.name);
  const slotOf = new Map(); // spot -> {slot, dw}
  const freeSlots = Array.from({ length: COLS * ROWS }, (_, i) => i);
  let acc = 1, lastKey = '';
  function update(dt, px, pz) {
    acc += dt; if (acc < 0.35) return; acc = 0;
    const r2 = SIGN_RANGE * SIGN_RANGE, near = [];
    for (const s of named) { const d2 = (s.x - px) ** 2 + (s.z - pz) ** 2; if (d2 < r2) near.push([d2, s]); }
    near.sort((a, b) => a[0] - b[0]);
    const want = near.slice(0, SIGN_POOL).map((n) => n[1]);
    const key = want.map((s) => s.e.idx).join(',');
    if (key === lastKey) return;
    lastKey = key;
    const keep = new Set(want);
    for (const [s, v] of slotOf) if (!keep.has(s)) { freeSlots.push(v.slot); slotOf.delete(s); }
    let dirty = false;
    for (const s of want) {
      if (slotOf.has(s) || !freeSlots.length) continue;
      const slot = freeSlots.pop();
      slotOf.set(s, { slot, dw: drawSlot(slot, s.name, CAT_STYLE[s.e.cat].color) });
      dirty = true;
    }
    if (dirty) atlas.needsUpdate = true;
    let i = 0;
    for (const s of want) {
      const v = slotOf.get(s); if (!v) continue;
      const wWorld = Math.min(s.faceL - 0.4, SIGN_H * ((v.dw) / (SLOT_H - 4)));
      const y = Math.min(s.top + 0.4, s.e.b.h - SIGN_H / 2 - 0.05);
      q.setFromAxisAngle(up, s.rot);
      pos.set(s.x + s.nx * 0.09, Math.max(SIGN_H / 2 + 2.2, y), s.z + s.nz * 0.09);
      scl.set(wWorld, SIGN_H, 1);
      signs.setMatrixAt(i, m4.compose(pos, q, scl));
      const col0 = (v.slot % COLS) * SLOT_W + 2, row0 = Math.floor(v.slot / COLS) * SLOT_H + 2;
      uvRect.setXYZW(i, col0 / ATLAS_W, 1 - (row0 + SLOT_H - 4) / ATLAS_H, v.dw / ATLAS_W, (SLOT_H - 4) / ATLAS_H);
      i++;
    }
    signs.count = i;
    signs.instanceMatrix.needsUpdate = true; uvRect.needsUpdate = true;
  }

  return {
    update,
    stats: () => ({ buildings: shops.byIdx.size, awnings: spots.length, named: named.length, signsActive: signs.count, dropped: shops.dropped }),
    dispose() {
      scene.remove(awn, signs); awnGeo.dispose(); awnMat.dispose(); signGeo.dispose(); signMat.dispose(); atlas.dispose();
    },
  };
}
