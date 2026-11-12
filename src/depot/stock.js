// [depot] 매장 전체 진열 + 성능(인스턴스·LOD·통로 단위 컬링).
//   가까운 파렛트만 낱개 상자, 8~12 m 밖은 파렛트 한 덩어리(임포스터). 병/롤 상세 메시는 선반에 쓰지 않는다.
import * as THREE from 'three';
import { PRODUCTS, BY_ID } from './products.js';
import { registerStockProducts, PICKABLE_IDS, STOCK_PRODUCTS } from './stockCatalog.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const W = 84, D = 120, CEIL = 9;
const RACK_D = 2.2, AISLE = 3.35, BAY = 2.7, BEAMS = [1.85, 3.2, 4.5];
const LOD_NEAR = 12, LOD_MID = 22;

const LEFT_X = [14, 19.55, 25.1, 30.65, 36.2, 41.75];
const RIGHT_X = [50, 55.55, 61.1];

// 통로 중심 x → z블록별 SKU 목록
const AISLE_SKU = {
  A: { // z 14–41
    12.3: ['tissue', 'towel', 'detergent', 'wrap'],
    17.9: ['wrap', 'foil', 'dishsoap', 'towel'],
    23.4: ['tissue', 'detergent', 'trashbag', 'towel'],
    29.0: ['chips', 'choco', 'cookie', 'cereal'],
    34.5: ['rice', 'grain', 'flour', 'sauce'],
    40.1: ['ramen', 'cupramen', 'ricepack', 'canned'],
    45.6: ['tissue', 'detergent', 'trashbag', 'towel'],
    48.3: ['tissue', 'towel', 'detergent', 'trashbag'],
    53.9: ['water', 'soda', 'juice', 'ion', 'tea', 'bottle'],
    59.4: ['rice', 'ramen', 'cupramen', 'grain'],
    64.8: ['chips', 'choco', 'cookie', 'cereal'],
  },
  B: {
    12.3: ['detergent', 'dishsoap', 'trashbag', 'wrap'],
    17.9: ['sauce', 'canned', 'wrap', 'foil'],
    23.4: ['chips', 'choco', 'cookie', 'cereal'],
    29.0: ['water', 'soda', 'juice', 'ion'],
    34.5: ['tissue', 'detergent', 'dishsoap', 'trashbag'],
    40.1: ['ramen', 'cupramen', 'ricepack', 'canned'],
    45.6: ['tissue', 'towel', 'wrap', 'foil'],
    48.3: ['tissue', 'detergent', 'towel', 'trashbag'],
    53.9: ['water', 'soda', 'juice', 'ion', 'tea'],
    59.4: ['ramen', 'cupramen', 'ricepack', 'canned'],
    64.8: ['chips', 'choco', 'cookie', 'cereal'],
  },
  C: {
    12.3: ['petfood', 'petpad', 'pettreat', 'trashbag'],
    17.9: ['cereal', 'cookie', 'choco', 'flour'],
    23.4: ['canned', 'sauce', 'ricepack', 'cupramen'],
    29.0: ['ion', 'tea', 'juice', 'water'],
    34.5: ['detergent', 'dishsoap', 'trashbag', 'tissue'],
    40.1: ['ramen', 'canned', 'sauce', 'ricepack'],
    45.6: ['flour', 'grain', 'sauce', 'canned'],
    48.3: ['tissue', 'towel', 'detergent', 'wrap'],
    53.9: ['ion', 'tea', 'juice', 'water', 'soda'],
    59.4: ['cereal', 'cookie', 'choco', 'flour'],
    64.8: ['chips', 'choco', 'cookie', 'ramen'],
  },
};

const HANG_COPY = {
  17.9: ['주방', 'WRAP · FOIL · SOAP'],
  23.4: ['생활·세제', 'TISSUE · DETERGENT'],
  29.0: ['과자', 'SNACKS'],
  34.5: ['쌀·곡물', 'RICE · GRAIN'],
  40.1: ['라면·즉석', 'RAMEN · READY'],
  53.9: ['생수·음료', 'WATER · DRINKS'],
  59.4: ['쌀·라면', 'RICE · RAMEN'],
  48.3: ['휴지·생활', 'HOUSEHOLD'],
  64.8: ['과자', 'SNACKS'],
};

function zBlockOf(z0) { return z0 < 45 ? 'A' : z0 < 78 ? 'B' : 'C'; }
function nearestKey(map, x) {
  let best = null, bd = 1e9;
  for (const k of Object.keys(map)) { const d = Math.abs(+k - x); if (d < bd) { bd = d; best = k; } }
  return best;
}
function skusAt(x0, side, z0) {
  const ax = side ? x0 + RACK_D + AISLE / 2 : x0 - AISLE / 2;
  const plan = AISLE_SKU[zBlockOf(z0)];
  const k = nearestKey(plan, ax);
  return plan[k] || ['water', 'ramen', 'chips', 'tissue'];
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// 인스턴스마다 아틀라스 칸을 고르는 재질: 지오메트리 UV 는 (0,0) 칸 기준, 인스턴스 속성 aCell 로 칸만큼 밀어 준다.
//   SKU 마다 InstancedMesh 를 따로 두던 걸(드로콜 수십 개) 구역별 1개로 합치는 데 쓴다.
function cellMaterial(keep, m) {
  m.onBeforeCompile = (sh) => { sh.vertexShader = `attribute vec2 aCell;\n${sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv += aCell;\n#endif')}`; };
  m.customProgramCacheKey = () => 'depot-cell-atlas';
  return keep(m);
}
// 정적 메시를 재질별로 한 지오메트리로 굽기 (작은 InstancedMesh 도 펼쳐서). userData.dynamic 은 건드리지 않음.
function mergeStatics(root, keep) {
  const buckets = new Map();
  for (const o of [...root.children]) {
    if (!o.isMesh || o.userData.dynamic || Array.isArray(o.material)) continue;
    if (o.isInstancedMesh && (o.count > 12 || o.instanceColor)) continue;
    const b = buckets.get(o.material) || []; b.push(o); buckets.set(o.material, b);
  }
  const mi = new THREE.Matrix4();
  for (const [mat, list] of buckets) {
    if (list.length < 2 && !list[0].isInstancedMesh) continue;
    const geos = [];
    for (const o of list) {
      o.updateMatrix();
      const base = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(base.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') base.deleteAttribute(k);
      if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, mi); geos.push(base.clone().applyMatrix4(mi.premultiply(o.matrix))); } base.dispose(); } else geos.push(base.applyMatrix4(o.matrix));
      root.remove(o);
    }
    const g = keep(mergeGeometries(geos)); geos.forEach((x) => x.dispose());
    if (g) root.add(new THREE.Mesh(g, mat));
  }
}

// 2048 아틀라스: 8×8 칸(256px). 칸 안은 기존 상품 텍스처와 같이 앞/옆/위/예비.
const ATLAS_N = 8, ATLAS_S = 2048, CELL = ATLAS_S / ATLAS_N;
function paintCell(g, cx, cy, p) {
  const x0 = cx * CELL, y0 = cy * CELL, h = CELL / 2;
  const face = (x, y, w, h, fill, title, sub, side = false) => {
    g.fillStyle = fill; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x, y, w, 8);
    g.fillStyle = p.ink || '#222'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${side ? 22 : 28}px "Pretendard","Noto Sans KR",sans-serif`;
    g.fillText((title || p.name).slice(0, 8), x + w / 2, y + h * 0.42);
    g.font = `700 ${side ? 14 : 16}px "Pretendard","Noto Sans KR",sans-serif`;
    g.fillText((sub || p.sub || '').slice(0, 14), x + w / 2, y + h * 0.62);
  };
  face(x0, y0, h, h, p.color, p.name.split(' ')[0], p.sub);           // 앞 (위-왼)
  face(x0 + h, y0, h, h, p.color, p.name.split(' ')[0], `${p.kg}kg`, true); // 옆
  g.fillStyle = p.color; g.fillRect(x0, y0 + h, h, h); // 위
  g.fillStyle = p.ink || '#222'; g.font = '900 32px "Pretendard",sans-serif'; g.textAlign = 'center';
  g.fillText(p.name.split(' ')[0], x0 + h / 2, y0 + h + h / 2);
  // 예비: 파렛트 랩 줄무늬
  g.fillStyle = '#e8e4da'; g.fillRect(x0 + h, y0 + h, h, h);
  g.strokeStyle = 'rgba(180,200,210,.55)'; g.lineWidth = 4;
  for (let i = -h; i < h * 2; i += 14) { g.beginPath(); g.moveTo(x0 + h + i, y0 + h); g.lineTo(x0 + h + i + h, y0 + h + h); g.stroke(); }
}
function boxGeoForCell(sx, sy, sz, cx, cy) {
  const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv;
  const u0 = cx / ATLAS_N, v0 = 1 - (cy + 1) / ATLAS_N, us = 0.5 / ATLAS_N, vs = 0.5 / ATLAS_N, e = 2 / ATLAS_S;
  // faces: +x -x +y -y +z -z  → 옆 옆 위 위 앞 앞
  const faceUV = [
    [u0 + us, v0 + vs, us, vs], [u0 + us, v0 + vs, us, vs],
    [u0, v0, us, vs], [u0, v0, us, vs],
    [u0, v0 + vs, us, vs], [u0, v0 + vs, us, vs],
  ];
  for (let f = 0; f < 6; f++) {
    const [uu, vv, uw, vh] = faceUV[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uu + e + uv.getX(i) * (uw - 2 * e), vv + e + uv.getY(i) * (vh - 2 * e));
    }
  }
  return g;
}

const BASE_IDS = ['egg', 'water', 'rice', 'tissue', 'ramen', 'chips', 'soda', 'melon', 'meat', 'bottle'];
function makeAtlas(keep) {
  // 아틀라스 64칸: 장보기 기본 10종 + 진열 카탈로그만 (가전·구매카드는 electronics.js 가 따로 그림 — 넣으면 칸이 넘쳐 뒤 상품이 빠짐)
  const ids = new Set([...BASE_IDS, ...STOCK_PRODUCTS.map((p) => p.id)]);
  const list = PRODUCTS.filter((p) => ids.has(p.id));
  const index = {};
  const t = canvasTex(ATLAS_S, ATLAS_S, (g) => {
    g.fillStyle = '#ddd'; g.fillRect(0, 0, ATLAS_S, ATLAS_S);
    list.forEach((p, i) => {
      const cx = i % ATLAS_N, cy = Math.floor(i / ATLAS_N);
      if (cy >= ATLAS_N) return;
      index[p.id] = { cx, cy, i };
      paintCell(g, cx, cy, p);
    });
  });
  keep(t);
  const mat = keep(new THREE.MeshLambertMaterial({ map: t }));
  const geo = {};
  for (const p of list) {
    const cell = index[p.id]; if (!cell) continue;
    geo[p.id] = keep(boxGeoForCell(1, 1, 1, cell.cx, cell.cy)); // 단위 상자, 인스턴스 스케일
  }
  // 파렛트 임포스터용: 예비(랩) 칸을 쓰되 인스턴스 색으로 품목색
  const wrapCell = index[list[0].id] || { cx: 0, cy: 0 };
  const proxyGeo = keep(boxGeoForCell(1, 1, 1, wrapCell.cx, wrapCell.cy));
  return { mat, geo, index, proxyGeo, tex: t };
}

function paintSign(g, w, h, title, sub) {
    g.fillStyle = '#1E5A45'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#F2C230'; g.fillRect(0, h - 40, w, 40);
    g.fillStyle = '#F3EADA'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${h > 200 ? 92 : 64}px "Pretendard","Noto Sans KR",sans-serif`;
    g.fillText(title, w / 2, h * 0.42);
    g.fillStyle = '#123B2D'; g.font = '800 28px "Pretendard",sans-serif';
    g.fillText(sub, w / 2, h - 20);
}

function paintTag(g, p) {
  const sale = p.id === 'ramen' || p.id === 'chips' || p.id === 'cookie' || p.id === 'cupramen';
  {
    g.fillStyle = '#FBF7EE'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = sale ? '#D9442E' : '#1E5A45'; g.fillRect(0, 0, 512, 54);
    g.fillStyle = '#F3EADA'; g.font = '800 26px "Pretendard",sans-serif'; g.textAlign = 'left';
    g.fillText(sale ? '범창고 특가' : '범창고 정자점', 22, 37);
    g.fillStyle = '#22262A'; g.font = '800 32px "Pretendard",sans-serif'; g.fillText(p.name, 22, 100);
    g.fillStyle = '#5a5f63'; g.font = '600 20px "Pretendard",sans-serif'; g.fillText(`${p.sub} · ${p.kg} kg`, 22, 132);
    g.textAlign = 'right'; g.fillStyle = sale ? '#D9442E' : '#22262A';
    g.font = '800 72px "Pretendard",sans-serif'; g.fillText(p.price.toLocaleString('ko-KR'), 462, 220);
    g.font = '800 30px "Pretendard",sans-serif'; g.fillText('원', 498, 220);
    g.fillStyle = '#22262A'; for (let i = 0; i < 26; i++) g.fillRect(22 + i * 6, 168, (i * 7) % 3 + 1, 50);
  }
}

export function mountStock({ scene, keep, canvasTex: canvasTexFn, TX, racks, obstacles, wraps, boxGeoLabeled, isMobile = false }) {
  registerStockProducts();
  if (wraps) wraps.visible = false;
  const ct = canvasTexFn || canvasTex;
  const atlas = makeAtlas(keep);
  const m4 = new THREE.Matrix4(), pv = new THREE.Vector3(), qy = new THREE.Quaternion(), s3 = new THREE.Vector3(), col = new THREE.Color();
  const Y = new THREE.Vector3(0, 1, 0);
  const prodMeshes = [];
  const clusters = []; // { cx, cz, near: Group, proxy: Object3D }
  const q0 = new THREE.Quaternion();

  const unitBox = keep(new THREE.BoxGeometry(1, 1, 1));

  function addCluster(cx, cz) {
    const near = new THREE.Group(); near.visible = false; scene.add(near);
    const proxy = new THREE.Group(); scene.add(proxy);
    const c = { cx, cz, near, proxy, palettes: [], items: new Map(), tags: [] };
    clusters.push(c);
    return c;
  }
  function findCluster(cx, cz, r = 8) {
    let best = null, bd = r;
    for (const c of clusters) { const d = Math.hypot(c.cx - cx, c.cz - cz); if (d < bd) { bd = d; best = c; } }
    return best || addCluster(cx, cz);
  }

  // ----- 랙 진열 -----
  for (const r of racks) {
    const len = r.bays * BAY;
    const c = addCluster(r.x0 + RACK_D / 2, r.z0 + len / 2);
    for (let b = 0; b < r.bays; b++) {
      const zc = r.z0 + b * BAY + BAY / 2;
      for (const side of [0, 1]) {
        const skus = skusAt(r.x0, side, r.z0);
        const px = r.x0 + (side ? RACK_D - 0.55 : 0.55);
        const face = side ? 1 : -1;
        for (const dz of [-0.64, 0.64]) {
          const z = zc + dz;
          const levels = [0, BEAMS[0] + 0.07, BEAMS[1] + 0.07];
          for (let lv = 0; lv < 3; lv++) {
            const p = BY_ID[skus[(b + lv + (side ? 1 : 0)) % skus.length]] || BY_ID.water;
            const y0 = levels[lv] + 0.14;
            const [sx, sy, sz] = p.size;
            const along = Math.max(sx, sz), deep = Math.min(sx, sz), rot = sx >= sz ? Math.PI / 2 : 0;
            const hMax = lv === 0 ? (p.kind === 'tray' ? 0.35 : 1.28) : 1.12;
            if (lv > 0) {
              // 상단: 랩 파렛트 한 덩어리
              c.palettes.push({ x: px, y: y0, z, w: 1.16, h: hMax, d: 0.98, color: p.color, id: p.id });
              continue;
            }
            // 하단: 안쪽은 색 상자 한 덩어리, 통로 앞줄만 낱개(집기)
            c.palettes.push({ x: px, y: y0, z, w: 1.05, h: Math.max(0.45, hMax * 0.9), d: 0.72, color: p.color, id: p.id });
            const nA = Math.max(1, Math.floor(1.2 / along));
            const nD = Math.max(1, Math.floor(1.0 / deep));
            const nY = Math.max(1, Math.min(3, Math.floor(hMax / sy)));
            const list = c.items.get(p.id) || []; c.items.set(p.id, list);
            const dFront = face > 0 ? nD - 1 : 0;
            for (let y = 0; y < nY; y++) for (let a = 0; a < nA; a++) {
              if (y === nY - 1 && (a + b) % 3 === 0) continue;
              const iz = z - (nA * along) / 2 + along * (a + 0.5);
              const ix = px - (nD * deep) / 2 + deep * (dFront + 0.5);
              list.push({ x: ix, y: y0 + sy * (y + 0.5), z: iz, rot, face, pickable: true, sx, sy, sz, pid: p.id });
            }
            if (b % 2 === 0 && dz < 0) c.tags.push({ p, x: px + face * 0.58, y: 1.62, z, face });
          }
        }
      }
    }
  }

  // 클러스터 데이터만 모으고, 메시는 맨 끝 finalizeStock 에서 SKU 별로 합친다.
  const tagG = keep(new THREE.PlaneGeometry(0.62, 0.31));
  const proxyMat = keep(new THREE.MeshLambertMaterial({ color: 0xffffff }));

  // ----- 엔드캡 (교차 통로 특가 파렛트) -----
  const promoIds = ['chips', 'ramen', 'water', 'cookie', 'cupramen', 'soda', 'kimchi', 'hotpack'];
  const endObst = [];
  let ei = 0;
  const endPals = [];
  const endClusterA = addCluster(38, 44), endClusterB = addCluster(38, 77);
  for (const r of racks) {
    const ends = [r.z0 - 0.85, r.z0 + r.bays * BAY + 0.85];
    for (const z of ends) {
      if (z < 13.8 || z > 107.5) continue;
      if ((z > 42 && z < 46) || (z > 75 && z < 79) || (z > 13.8 && z < 15) || (z > 105 && z < 107.5)) {
        const id = promoIds[ei++ % promoIds.length], p = BY_ID[id]; if (!p) continue;
        const x = r.x0 + RACK_D / 2;
        endPals.push({ x, y: 0.14, z, id, color: p.color });
        endObst.push({ x0: x - 0.65, x1: x + 0.65, z0: z - 0.55, z1: z + 0.55 });
        const c = z < 60 ? endClusterA : endClusterB;
        const [sx, sy, sz] = p.size;
        const list = c.items.get(p.id) || []; c.items.set(p.id, list);
        const nX = Math.max(1, Math.floor(1.1 / sx)), nZ = Math.max(1, Math.floor(1.0 / sz)), nY = Math.max(1, Math.min(3, Math.floor(1.2 / sy)));
        for (let y = 0; y < nY; y++) for (let ix = 0; ix < nX; ix++) for (let iz = 0; iz < nZ; iz++) {
          const pickable = y === nY - 1 && PICKABLE_IDS.has(p.id);
          list.push({ x: x - (nX * sx) / 2 + sx * (ix + 0.5), y: 0.14 + sy * (y + 0.5), z: z - (nZ * sz) / 2 + sz * (iz + 0.5), rot: 0, face: 1, pickable, sx, sy, sz, pid: p.id });
        }
      }
    }
  }
  obstacles.push(...endObst);
  if (endPals.length) {
    const im = new THREE.InstancedMesh(unitBox, atlas.mat, endPals.length);
    const palG = keep(new THREE.BoxGeometry(1.219, 0.14, 1.016));
    const palM = keep(new THREE.MeshLambertMaterial({ color: 0xb08a58 }));
    const pals = new THREE.InstancedMesh(palG, palM, endPals.length);
    endPals.forEach((pl, i) => {
      m4.compose(pv.set(pl.x, pl.y + 0.65, pl.z), q0, s3.set(1.16, 1.2, 0.98)); im.setMatrixAt(i, m4);
      col.setStyle(pl.color); im.setColorAt(i, col);
      m4.makeTranslation(pl.x, 0, pl.z); pals.setMatrixAt(i, m4);
    });
    im.instanceColor.needsUpdate = true; scene.add(im, pals);
  }


  // ----- 천장 걸이 사인 -----
  const hangY = 6.2;
  const aisleXs = [17.9, 23.4, 29.0, 34.5, 40.1, 48.3, 53.9, 59.4, 64.8];
  const hangZ = { A: 22, B: 58, C: 92 };
  // 사인 아틀라스 (2048², 칸 512×128 · 통로 번호는 512×256) 에 모두 그려 한 메시로 합침 → 드로콜 1
  const signs = [];
  function hangSign(title, sub, x, z, tex) {
    signs.push({ key: tex ? `tx:${tex.uuid}` : `h:${title}`, img: tex?.image || null, title, sub, tall: false, w: 3.2, h: 0.8, x, y: hangY, z, ry: 0 });
  }
  const TEX_HANG = { 53.9: TX?.['hang-water-drinks'], 59.4: TX?.['hang-rice-grain'] || TX?.['hang-ramen-snack'], 48.3: TX?.['hang-household'], 29.0: TX?.['hang-ramen-snack'] };
  for (const x of aisleXs) {
    const copy = HANG_COPY[x] || ['범창고', 'BUMP DEPOT'];
    hangSign(copy[0], copy[1], x, 28, TEX_HANG[x]); // 통로당 1장 (양면)
    if (x < 50) hangSign(copy[0], copy[1], x, 58, TEX_HANG[x]);
  }
  hangSign('냉동', 'FROZEN · 유리문 냉동창', 74, 70, null);
  hangSign('신선·정육', 'MEAT · FISH · DAIRY', 40, 112, null);
  hangSign('과일·채소', 'PRODUCE', 16, 112, null);
  hangSign('베이커리', 'BAKERY', 6.5, 26, null);
  hangSign('주류', 'BEVERAGE · 19+', 6.5, 56, null);
  hangSign('펫', 'PET', 6.5, 88, null);
  hangSign('계절·캠핑', 'SEASONAL', 73, 60, null);
  hangSign('델리', 'DELI · ROTISSERIE', 74, 112, null);

  // 통로 번호 (왼쪽 블록에도)
  const aisleNo = [['01', 53.9], ['02', 59.4], ['03', 64.8], ['05', 48.3], ['06', 17.9], ['07', 23.4], ['08', 29.0], ['09', 34.5], ['10', 40.1]];
  for (const [no, x] of aisleNo) {
    if (no === '01' || no === '02' || no === '03' || no === '05') continue; // 기존 interior 사인
    signs.push({ key: `a:${no}`, title: no, sub: (HANG_COPY[x] || ['', ''])[0], tall: true, w: 2.6, h: 1.3, x, y: 5.4, z: 13.95, ry: Math.PI });
  }
  {
    const SA = 2048, SW = 512, SH = 128, COLS = SA / SW;
    const slot = new Map(); let nShort = 0, nTall = 0;
    for (const sg of signs) {
      if (slot.has(sg.key)) continue;
      if (sg.tall) { const i = nTall++; slot.set(sg.key, { x: (i % COLS) * SW, y: (12 + 2 * Math.floor(i / COLS)) * SH, h: 2 * SH, sg }); } // 12–15 행
      else { const i = nShort++; slot.set(sg.key, { x: (i % COLS) * SW, y: Math.floor(i / COLS) * SH, h: SH, sg }); } // 0–11 행 (48장)
    }
    const tex = keep(ct(SA, SA, (g) => {
      g.clearRect(0, 0, SA, SA);
      for (const { x, y, h, sg } of slot.values()) {
        g.save(); g.translate(x, y);
        if (sg.img && sg.img.width) g.drawImage(sg.img, 0, 0, SW, h);
        else { g.scale(SW / 1024, h / (sg.tall ? 512 : 256)); paintSign(g, 1024, sg.tall ? 512 : 256, sg.title, sg.sub); }
        g.restore();
      }
    }));
    tex.anisotropy = 4;
    const geos = []; const mm = new THREE.Matrix4(), qq = new THREE.Quaternion();
    for (const sg of signs) {
      const sl = slot.get(sg.key);
      for (const back of [0, 1]) { // 앞·뒤 두 장 (DoubleSide 면 뒤에서 글자가 거울처럼 뒤집힘)
        const g = new THREE.PlaneGeometry(sg.w, sg.h); const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (sl.x + uv.getX(i) * SW) / SA, 1 - (sl.y + (1 - uv.getY(i)) * sl.h) / SA);
        g.applyMatrix4(mm.compose(pv.set(sg.x, sg.y, sg.z), qq.setFromAxisAngle(Y, sg.ry + back * Math.PI), s3.set(1, 1, 1))); geos.push(g);
      }
    }
    const sm = new THREE.Mesh(keep(mergeGeometries(geos)), keep(new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5 })));
    geos.forEach((g) => g.dispose()); scene.add(sm);
  }

  // ----- 주변 집기: 냉동·신선·베이커리·주류·펫·계절·의류·시식·델리 -----
  const fxRoot = new THREE.Group(); scene.add(fxRoot);
  const fixtures = buildFixtures({ scene: fxRoot, keep, ct, atlas, unitBox, obstacles, prodMeshes, m4, pv, qy, s3, col, Y, q0, findCluster, addCluster, clusters });

  mergeStatics(fxRoot, keep); // 집기 정적 메시 → 재질별 1개
  finalizeStock({ scene, keep, clusters, atlas, unitBox, prodMeshes, tagG, ct, proxyMat, m4, pv, qy, s3, col, Y, q0 });

  // 먼 진열 띠는 끔: 낱개 상품이 사라져도 랩 파렛트·하단 색 상자(대역)가 그 자리를 채움. 모바일은 더 가깝게.
  const FAR = isMobile ? 26 : 46;
  function tick(camera) {
    const x = camera.position.x, z = camera.position.z;
    fixtures.tick?.(camera, x, z);
    for (const im of prodMeshes) { const zr = im.userData.zr; if (zr) im.visible = Math.max(0, zr[0] - z, z - zr[1]) < FAR; }
  }

  // 집기 레이캐스트: 픽 가능 인스턴스만 (list.pickable === false 는 pickTarget 에서 걸러지도록 userData.pickable)
  for (const im of prodMeshes) {
    const list = im.userData.list;
    if (list && list.some((it) => it.pickable === false)) {
      im.userData.pickFilter = true;
    }
  }

  return { prodMeshes, clusters, tick, fixtures, fxRoot };
}

function buildFixtures({ scene, keep, ct, atlas, unitBox, obstacles, prodMeshes, m4, pv, qy, s3, col, Y, q0, findCluster, addCluster, clusters }) {
  const steel = keep(new THREE.MeshLambertMaterial({ color: 0x6a7380 }));
  const stain = keep(new THREE.MeshLambertMaterial({ color: 0x9aa3ab }));
  const wood = keep(new THREE.MeshLambertMaterial({ color: 0x8a6232 }));
  const cream = keep(new THREE.MeshLambertMaterial({ color: 0xf3eada }));
  const green = keep(new THREE.MeshLambertMaterial({ color: 0x1e5a45 }));
  const glassM = keep(new THREE.MeshLambertMaterial({ color: 0xcfe8f5, transparent: true, opacity: 0.32, depthWrite: false }));
  const frost = keep(canvasTex(128, 256, (g) => {
    g.fillStyle = 'rgba(230,240,248,.55)'; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`; g.fillRect(Math.random() * 128, Math.random() * 256, 2, 3); }
  }));
  const frostM = keep(new THREE.MeshBasicMaterial({ map: frost, transparent: true, opacity: 0.45, depthWrite: false }));
  const coldLight = keep(new THREE.MeshBasicMaterial({ color: 0xd8eefe }));
  const warmLight = keep(new THREE.MeshBasicMaterial({ color: 0xffd89a }));
  const black = keep(new THREE.MeshLambertMaterial({ color: 0x2a2e32 }));
  const palGeo = keep(new THREE.BoxGeometry(1.219, 0.14, 1.016));
  const palMat = keep(new THREE.MeshLambertMaterial({ color: 0xb08a58 }));
  const mistGeo = keep(new THREE.PlaneGeometry(2.25, 1.4));
  const mistShared = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide, fog: true }));

  const mistPlanes = [];
  const palAt = []; // 바닥 파렛트 (x,z) — 끝에서 InstancedMesh 1개
  const caseCluster = addCluster(74, 76);

  // ===== 냉동: 동쪽 벽 x 82.0–83.7, z 46–107, 유리문 케이스 =====
  const FZ_X = 82.55, FZ_Z0 = 46.5, FZ_Z1 = 107, FZ_W = 1.35, FZ_H = 2.15, UNIT = 2.45;
  const nUnit = Math.floor((FZ_Z1 - FZ_Z0) / UNIT);
  const shellG = keep(new THREE.BoxGeometry(FZ_W, FZ_H, UNIT - 0.08));
  const shells = new THREE.InstancedMesh(shellG, steel, nUnit);
  const doorG = keep(new THREE.PlaneGeometry((UNIT - 0.18) / 2, FZ_H - 0.3));
  const doors = new THREE.InstancedMesh(doorG, glassM, nUnit * 2);
  const frostI = new THREE.InstancedMesh(doorG, frostM, nUnit * 2);
  const lightG = keep(new THREE.BoxGeometry(0.06, FZ_H - 0.4, UNIT - 0.2));
  const lights = new THREE.InstancedMesh(lightG, coldLight, nUnit);
  const fzSkus = ['mandu', 'pizza', 'icecream', 'friedrice', 'dumpling2', 'mandu'];
  const fzPick = [];
  let di = 0;
  for (let i = 0; i < nUnit; i++) {
    const z = FZ_Z0 + (i + 0.5) * UNIT;
    m4.makeTranslation(FZ_X, FZ_H / 2, z); shells.setMatrixAt(i, m4);
    m4.makeTranslation(FZ_X - 0.55, FZ_H / 2, z); lights.setMatrixAt(i, m4);
    for (const sx of [-0.55, 0.55]) {
      m4.compose(pv.set(FZ_X - FZ_W / 2 + 0.02, FZ_H / 2 + 0.02, z + sx), new THREE.Quaternion().setFromAxisAngle(Y, -Math.PI / 2), s3.set(1, 1, 1));
      doors.setMatrixAt(di, m4); frostI.setMatrixAt(di, m4); di++;
    }
    obstacles.push({ x0: FZ_X - FZ_W / 2, x1: 83.7, z0: z - UNIT / 2 + 0.04, z1: z + UNIT / 2 - 0.04 });
    // 안쪽 상품 (상자 3단)
    const pid = fzSkus[i % fzSkus.length], p = BY_ID[pid];
    if (p) {
      const [sx, sy, sz] = p.size;
      const list = caseCluster.items.get(pid) || []; caseCluster.items.set(pid, list);
      for (let sh = 0; sh < 3; sh++) for (let k = 0; k < 3; k++) {
        const pickable = sh === 1 && k === 1 && PICKABLE_IDS.has(pid);
        list.push({ x: FZ_X - 0.25, y: 0.35 + sh * 0.55 + sy / 2, z: z - 0.7 + k * 0.5, rot: Math.PI / 2, face: -1, pickable, sx, sy, sz, pid });
        fzPick.push(pid);
      }
    }
    // 냉기 안개 (문 앞, 가까운 케이스만 tick 에서 켬)
    mistPlanes.push({ z, x: FZ_X - FZ_W / 2 });
  }
  shells.count = nUnit; lights.count = nUnit; doors.count = frostI.count = di;
  scene.add(shells, lights, doors, frostI);
  // 케이스 안 상품 메시
  buildItemIMs(caseCluster, atlas, unitBox, prodMeshes, m4, pv, qy, s3, col, Y);

  // 동쪽 중간 계절·캠핑·김장 파렛트 (x 66–80, z 48–106) — 통로는 남김
  const seasonal = ['kimchi', 'hotpack', 'duvet', 'tent', 'chair', 'cabbage'];
  const seaCluster = addCluster(73, 76);
  let si = 0;
  for (let z = 50; z < 104; z += 4.2) {
    for (const x of [67.2, 71.0, 75.0, 78.6]) {
      if (x > 80.5) continue;
      const p = BY_ID[seasonal[si++ % seasonal.length]]; if (!p) continue;
      // 가운데 카트 통로 확보: x 72.8–74.2 는 비움
      if (x > 72.5 && x < 74.5) continue;
      const [sx, sy, sz] = p.size;
      const nY = Math.max(1, Math.min(3, Math.floor(1.15 / sy)));
      const nX = Math.max(1, Math.floor(1.1 / Math.max(sx, 0.2)));
      const nZ = Math.max(1, Math.floor(0.9 / Math.max(sz, 0.2)));
      const list = seaCluster.items.get(p.id) || []; seaCluster.items.set(p.id, list);
      for (let y = 0; y < nY; y++) for (let ix = 0; ix < nX; ix++) for (let iz = 0; iz < nZ; iz++) {
        list.push({ x: x - 0.5 + (ix + 0.5) * (1.0 / nX), y: 0.14 + sy * (y + 0.5), z: z - 0.4 + (iz + 0.5) * (0.85 / nZ), rot: 0, face: 1, pickable: y === nY - 1 && ix === 0 && PICKABLE_IDS.has(p.id), sx, sy, sz, pid: p.id });
      }
      // 바닥 파렛트
      palAt.push(x, z);
      obstacles.push({ x0: x - 0.65, x1: x + 0.65, z0: z - 0.55, z1: z + 0.55 });
      seaCluster.palettes = seaCluster.palettes || [];
      seaCluster.palettes.push({ x, y: 0.14, z, w: 1.1, h: 1.15, d: 0.95, color: p.color, ground: true });
    }
  }
  // 계절 프록시
  buildItemIMs(seaCluster, atlas, unitBox, prodMeshes, m4, pv, qy, s3, col, Y);

  // ===== 후면 신선: 정육/수산/유제품 오픈 케이스 (벽 z≈118.8) =====
  const freshCluster = addCluster(40, 114);
  function openCase(x0, x1, z, skus, color = 0x7a838c) {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    const body = new THREE.Mesh(keep(new THREE.BoxGeometry(w, 1.05, 1.15)), keep(new THREE.MeshLambertMaterial({ color })));
    body.position.set(cx, 0.52, z); scene.add(body);
    const well = new THREE.Mesh(keep(new THREE.BoxGeometry(w - 0.1, 0.04, 0.9)), coldLight);
    well.position.set(cx, 1.035, z - 0.05); scene.add(well); // 얼음 트레이 (몸체 윗면보다 살짝 위)
    // 뒤 선반벽 + 위 조명 캐노피 + 앞 초록 띠 (정적 병합이라 드로콜 추가 없음)
    const riser = new THREE.Mesh(keep(new THREE.BoxGeometry(w, 1.3, 0.12)), steel); riser.position.set(cx, 1.7, z + 0.52); scene.add(riser);
    const canopy = new THREE.Mesh(keep(new THREE.BoxGeometry(w, 0.1, 0.7)), black); canopy.position.set(cx, 2.4, z + 0.2); scene.add(canopy);
    const strip = new THREE.Mesh(keep(new THREE.BoxGeometry(w - 0.2, 0.04, 0.5)), coldLight); strip.position.set(cx, 2.34, z + 0.2); scene.add(strip);
    const band = new THREE.Mesh(keep(new THREE.BoxGeometry(w, 0.14, 0.02)), green); band.position.set(cx, 0.82, z - 0.585); scene.add(band);
    const guard = new THREE.Mesh(keep(new THREE.PlaneGeometry(w - 0.15, 0.28)), glassM);
    guard.position.set(cx, 1.22, z - 0.5); scene.add(guard);
    const kick = new THREE.Mesh(keep(new THREE.BoxGeometry(w, 0.18, 1.15)), black);
    kick.position.set(cx, 0.09, z); scene.add(kick);
    obstacles.push({ x0, x1, z0: z - 0.6, z1: z + 0.58 });
    // 트레이
    for (let i = 0; i < skus.length; i++) {
      const p = BY_ID[skus[i]]; if (!p) continue;
      const [sx, sy, sz] = p.size;
      // 칸 폭 가득 · 깊이 2–3줄 · 앞줄 가운데만 집기 (빈 매대처럼 보이지 않게)
      const seg = (w - 0.3) / skus.length, sx0 = x0 + 0.15 + i * seg;
      const nA = Math.max(1, Math.floor((seg - 0.1) / (sx + 0.03))), nR = Math.max(1, Math.min(3, Math.floor(0.8 / (sz + 0.03))));
      const list = freshCluster.items.get(p.id) || []; freshCluster.items.set(p.id, list);
      for (let k = 0; k < nA; k++) for (let row = 0; row < nR; row++) {
        const stack = row === nR - 1 && sy < 0.12 && k % 2 === 0 ? 2 : 1; // 뒷줄은 가끔 두 단
        for (let h = 0; h < stack; h++) list.push({ x: sx0 + 0.05 + (k + 0.5) * (seg - 0.1) / nA, y: 1.05 + sy * (h + 0.5), z: z - 0.42 + (row + 0.5) * (0.8 / nR), rot: 0, face: 1, pickable: row === 0 && h === 0 && k % 3 === 1 && PICKABLE_IDS.has(p.id), sx, sy, sz, pid: p.id });
      }
    }
  }
  openCase(30, 42, 118.7, ['meat', 'beef', 'chicken', 'meat']); // 정육
  openCase(42.4, 52, 118.7, ['salmon', 'mackerel', 'salmon']); // 수산
  openCase(52.4, 63.5, 118.7, ['milk', 'yogurt', 'cheese', 'butter', 'egg']); // 유제품·계란

  // 계란/유제품 캐비닛 일부 업라이트 (짧은 유리문)
  {
    const cx = 58, z = 116.4;
    const cab = new THREE.Mesh(keep(new THREE.BoxGeometry(10, 2.0, 0.85)), steel);
    cab.position.set(cx, 1.0, z); scene.add(cab);
    const gl = new THREE.Mesh(keep(new THREE.PlaneGeometry(9.6, 1.7)), glassM);
    gl.position.set(cx, 1.1, z - 0.43); scene.add(gl);
    obstacles.push({ x0: 53, x1: 63, z0: z - 0.45, z1: z + 0.45 });
    const p = BY_ID.egg; const [sx, sy, sz] = p.size;
    const list = freshCluster.items.get('egg') || []; freshCluster.items.set('egg', list);
    for (let i = 0; i < 8; i++) for (let sh = 0; sh < 3; sh++) {
      list.push({ x: 53.6 + i * 1.1, y: 0.4 + sh * 0.5 + sy / 2, z: z - 0.1, rot: 0, face: 1, pickable: sh === 1 && i % 2 === 0, sx, sy, sz, pid: 'egg' });
    }
  }
  buildItemIMs(freshCluster, atlas, unitBox, prodMeshes, m4, pv, qy, s3, col, Y);

  // ===== 과일·채소 빈 (x 2–30, z 109–116) =====
  const prodCluster = addCluster(16, 112.5);
  const bins = [
    { x: 6, z: 111.5, id: 'apple', color: 0x8a2a1a },
    { x: 10.5, z: 111.5, id: 'mandarin', color: 0xb85a10 },
    { x: 15, z: 111.5, id: 'melon', color: 0x2d6a2d },
    { x: 19.5, z: 111.5, id: 'onion', color: 0x8a6a30 },
    { x: 24, z: 111.5, id: 'banana', color: 0xc8a028 },
    { x: 28, z: 111.5, id: 'cabbage', color: 0x6a8a40 },
    { x: 8, z: 114.6, id: 'apple', color: 0x8a2a1a },
    { x: 13, z: 114.6, id: 'mandarin', color: 0xb85a10 },
    { x: 18, z: 114.6, id: 'onion', color: 0x8a6a30 },
    { x: 23.5, z: 114.6, id: 'melon', color: 0x2d6a2d },
  ];
  const binG = keep(new THREE.BoxGeometry(3.4, 0.7, 2.2));
  const rimG = keep(new THREE.BoxGeometry(3.5, 0.08, 2.3));
  const moundG = keep(new THREE.SphereGeometry(0.9, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2));
  const binI = new THREE.InstancedMesh(binG, wood, bins.length);
  const rimI = new THREE.InstancedMesh(rimG, keep(new THREE.MeshLambertMaterial({ color: 0x6a4a22 })), bins.length);
  const moundI = new THREE.InstancedMesh(moundG, keep(new THREE.MeshLambertMaterial({ color: 0xcc4444 })), bins.length);
  bins.forEach((b, i) => {
    m4.makeTranslation(b.x, 0.35, b.z); binI.setMatrixAt(i, m4);
    m4.makeTranslation(b.x, 0.72, b.z); rimI.setMatrixAt(i, m4);
    m4.compose(pv.set(b.x, 0.7, b.z), q0, s3.set(1.5, 0.55, 1.0)); moundI.setMatrixAt(i, m4);
    col.setHex(b.color); moundI.setColorAt(i, col);
    obstacles.push({ x0: b.x - 1.75, x1: b.x + 1.75, z0: b.z - 1.15, z1: b.z + 1.15 });
    const p = BY_ID[b.id]; if (!p) return;
    const [sx, sy, sz] = p.size;
    const list = prodCluster.items.get(p.id) || []; prodCluster.items.set(p.id, list);
    // 빈 위에 집기 가능한 상품 몇 개 (가까이서만 보임)
    for (let k = 0; k < 4; k++) {
      list.push({ x: b.x + (k % 2 ? 0.45 : -0.45), y: 0.85 + sy / 2, z: b.z + (k < 2 ? 0.35 : -0.35), rot: 0, face: 1, pickable: true, sx, sy, sz, pid: p.id });
    }
  });
  if (moundI.instanceColor) moundI.instanceColor.needsUpdate = true;
  scene.add(binI, rimI, moundI);
  buildItemIMs(prodCluster, atlas, unitBox, prodMeshes, m4, pv, qy, s3, col, Y);

  // ===== 델리·로스티세리 x 66–82, z 109–116 =====
  const deliCluster = addCluster(74, 112.5);
  {
    const counter = new THREE.Mesh(keep(new THREE.BoxGeometry(14, 1.05, 1.4)), stain);
    counter.position.set(74, 0.52, 114.8); scene.add(counter);
    const warm = new THREE.Mesh(keep(new THREE.BoxGeometry(13.4, 0.05, 1.1)), warmLight);
    warm.position.set(74, 1.08, 114.8); scene.add(warm);
    const hood = new THREE.Mesh(keep(new THREE.BoxGeometry(14, 0.08, 1.6)), black);
    hood.position.set(74, 1.85, 114.8); scene.add(hood);
    const glass = new THREE.Mesh(keep(new THREE.PlaneGeometry(13.6, 0.7)), glassM);
    glass.position.set(74, 1.4, 114.1); scene.add(glass);
    obstacles.push({ x0: 67, x1: 81, z0: 114.0, z1: 115.6 });
    const sign = new THREE.Mesh(keep(new THREE.PlaneGeometry(4.2, 0.7)), keep(new THREE.MeshBasicMaterial({ map: signTexLocal(keep, ct, '델리·통닭', '오늘 구운 범로스트치킨') })));
    sign.position.set(74, 2.15, 114.05); scene.add(sign);
    const p = BY_ID.rotisserie, p2 = BY_ID.chicken;
    for (const [pr, n] of [[p, 8], [p2, 4]]) {
      if (!pr) continue;
      const [sx, sy, sz] = pr.size;
      const list = deliCluster.items.get(pr.id) || []; deliCluster.items.set(pr.id, list);
      for (let i = 0; i < n; i++) list.push({ x: 68.5 + i * 1.4, y: 1.12 + sy / 2, z: 114.7, rot: 0, face: 1, pickable: true, sx, sy, sz, pid: pr.id });
    }
  }
  buildItemIMs(deliCluster, atlas, unitBox, prodMeshes, m4, pv, qy, s3, col, Y);

  // ===== 서쪽: 베이커리 z 14–40, 주류 42–70, 펫 72–106 =====
  const bakCluster = addCluster(6.5, 26);
  // 베이커리 테이블 + 상자 더미
  for (const [x, z] of [[3.8, 18], [8.8, 18], [3.8, 24], [8.8, 24], [3.8, 30], [8.8, 30], [6.3, 36]]) {
    const top = new THREE.Mesh(keep(new THREE.BoxGeometry(3.6, 0.08, 1.8)), wood);
    const legG = keep(new THREE.BoxGeometry(0.1, 0.85, 0.1));
    const legs = new THREE.InstancedMesh(legG, wood, 4);
    [[-1.6, -0.8], [1.6, -0.8], [-1.6, 0.8], [1.6, 0.8]].forEach((o, i) => { m4.makeTranslation(x + o[0], 0.42, z + o[1]); legs.setMatrixAt(i, m4); });
    top.position.set(x, 0.89, z); scene.add(top, legs);
    obstacles.push({ x0: x - 1.85, x1: x + 1.85, z0: z - 0.95, z1: z + 0.95 });
    const ids = z < 22 ? ['muffin', 'croissant'] : z < 28 ? ['croissant', 'bread'] : ['muffin', 'bread', 'choco'];
    for (const id of ids) {
      const p = BY_ID[id]; if (!p) continue;
      const [sx, sy, sz] = p.size;
      const list = bakCluster.items.get(id) || []; bakCluster.items.set(id, list);
      const nY = 3, nX = Math.max(1, Math.floor(3.2 / (sx + 0.02)));
      for (let y = 0; y < nY; y++) for (let ix = 0; ix < nX; ix++) {
        list.push({ x: x - 1.5 + (ix + 0.5) * (3.0 / nX), y: 0.93 + sy * (y + 0.5), z, rot: 0, face: 1, pickable: y === nY - 1 && ix % 2 === 0, sx, sy, sz, pid: id });
      }
    }
  }
  // 베이커리 온열 선반
  {
    const rack = new THREE.Mesh(keep(new THREE.BoxGeometry(3.2, 2.1, 0.7)), stain);
    rack.position.set(6.3, 1.05, 38.6); scene.add(rack);
    const w = new THREE.Mesh(keep(new THREE.BoxGeometry(3.0, 0.04, 0.5)), warmLight);
    w.position.set(6.3, 1.6, 38.5); scene.add(w);
    obstacles.push({ x0: 4.6, x1: 8.0, z0: 38.2, z1: 39.1 });
  }
  buildItemIMs(bakCluster, atlas, unitBox, prodMeshes, m4, pv, qy, s3, col, Y);

  // 시식 코너 + 직원 (베이커리 끝)
  const tasting = buildTasting(scene, keep, ct, { x: 6.5, z: 39.6 });
  obstacles.push({ x0: 4.4, x1: 8.6, z0: 38.8, z1: 41.2 });

  // 의류·잡화 테이블 (베이커리와 주류 사이)
  const appCluster = addCluster(6.5, 40.5);
  {
    const tab = new THREE.Mesh(keep(new THREE.BoxGeometry(8.5, 0.12, 2.2)), cream);
    tab.position.set(6.5, 0.78, 41.0); scene.add(tab);
    const base = new THREE.Mesh(keep(new THREE.BoxGeometry(8.3, 0.7, 2.0)), green);
    base.position.set(6.5, 0.35, 41.0); scene.add(base);
    obstacles.push({ x0: 2.1, x1: 10.9, z0: 39.8, z1: 42.2 });
    for (const id of ['socks', 'towelset']) {
      const p = BY_ID[id]; if (!p) continue;
      const [sx, sy, sz] = p.size;
      const list = appCluster.items.get(id) || []; appCluster.items.set(id, list);
      for (let i = 0; i < 8; i++) for (let y = 0; y < 2; y++) {
        list.push({ x: 3.2 + i * 0.9, y: 0.86 + sy * (y + 0.5), z: 41.0, rot: 0, face: 1, pickable: y === 1 && i % 2 === 0, sx, sy, sz, pid: id });
      }
    }
  }
  buildItemIMs(appCluster, atlas, unitBox, prodMeshes, m4, pv, qy, s3, col, Y);

  // 주류 z 42–70
  const alcCluster = addCluster(6.5, 56);
  for (let z = 44; z < 69; z += 3.6) {
    for (const x of [3.6, 8.8]) {
      const p = BY_ID[z % 7.2 < 3.6 ? 'beer' : 'soju'];
      palAt.push(x, z);
      obstacles.push({ x0: x - 0.65, x1: x + 0.65, z0: z - 0.55, z1: z + 0.55 });
      const [sx, sy, sz] = p.size;
      const list = alcCluster.items.get(p.id) || []; alcCluster.items.set(p.id, list);
      const nY = 3, nX = Math.max(1, Math.floor(1.1 / sx)), nZ = Math.max(1, Math.floor(0.95 / sz));
      for (let y = 0; y < nY; y++) for (let ix = 0; ix < nX; ix++) for (let iz = 0; iz < nZ; iz++) {
        list.push({ x: x - 0.5 + (ix + 0.5) * (1 / nX), y: 0.14 + sy * (y + 0.5), z: z - 0.4 + (iz + 0.5) * (0.85 / nZ), rot: 0, face: 1, pickable: y === nY - 1 && ix === 0 && iz === 0, sx, sy, sz, pid: p.id });
      }
      alcCluster.palettes = alcCluster.palettes || [];
      alcCluster.palettes.push({ x, y: 0.14, z, w: 1.1, h: sy * nY, d: 0.95, color: p.color, ground: true });
    }
  }
  // 19금 안내
  {
    const t = keep(ct(512, 256, (g) => {
      g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#F2C230'; g.font = '900 72px "Pretendard",sans-serif'; g.textAlign = 'center'; g.fillText('19', 256, 110);
      g.fillStyle = '#F3EADA'; g.font = '800 32px "Pretendard",sans-serif'; g.fillText('주류 · 미성년자 판매 불가', 256, 180);
    }));
    const s = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.4, 1.2)), keep(new THREE.MeshBasicMaterial({ map: t })));
    s.position.set(6.5, 2.4, 43.2); s.rotation.y = 0; scene.add(s);
  }
  buildItemIMs(alcCluster, atlas, unitBox, prodMeshes, m4, pv, qy, s3, col, Y);

  // 펫 z 72–106
  const petCluster = addCluster(6.5, 88);
  const petIds = ['petfood', 'petpad', 'pettreat'];
  let pi = 0;
  for (let z = 74; z < 104; z += 3.8) {
    for (const x of [3.6, 8.8]) {
      const p = BY_ID[petIds[pi++ % petIds.length]];
      palAt.push(x, z);
      obstacles.push({ x0: x - 0.65, x1: x + 0.65, z0: z - 0.55, z1: z + 0.55 });
      const [sx, sy, sz] = p.size;
      const list = petCluster.items.get(p.id) || []; petCluster.items.set(p.id, list);
      const nY = Math.max(1, Math.min(3, Math.floor(1.1 / sy)));
      const nX = Math.max(1, Math.floor(1.1 / sx)), nZ = Math.max(1, Math.floor(0.95 / sz));
      for (let y = 0; y < nY; y++) for (let ix = 0; ix < nX; ix++) for (let iz = 0; iz < nZ; iz++) {
        list.push({ x: x - 0.5 + (ix + 0.5) * (1 / nX), y: 0.14 + sy * (y + 0.5), z: z - 0.4 + (iz + 0.5) * (0.85 / nZ), rot: 0, face: 1, pickable: y === nY - 1 && ix === 0, sx, sy, sz, pid: p.id });
      }
      petCluster.palettes = petCluster.palettes || [];
      petCluster.palettes.push({ x, y: 0.14, z, w: 1.1, h: Math.max(0.6, sy * nY), d: 0.95, color: p.color, ground: true });
    }
  }
  buildItemIMs(petCluster, atlas, unitBox, prodMeshes, m4, pv, qy, s3, col, Y);

  // 바닥 파렛트 1 드로콜
  if (palAt.length) {
    const pals = new THREE.InstancedMesh(palGeo, palMat, palAt.length / 2);
    for (let i = 0; i < palAt.length / 2; i++) { m4.makeTranslation(palAt[2 * i], 0.07, palAt[2 * i + 1]); pals.setMatrixAt(i, m4); }
    pals.computeBoundingSphere(); scene.add(pals);
  }
  // 냉기 안개: 가까운 케이스만 InstancedMesh 1개로 (문 앞에서 살랑)
  const mistI = new THREE.InstancedMesh(mistGeo, mistShared, mistPlanes.length); mistI.count = 0; mistI.frustumCulled = false; mistI.userData.dynamic = true; scene.add(mistI);
  const qMist = new THREE.Quaternion().setFromAxisAngle(Y, -Math.PI / 2), one = new THREE.Vector3(1, 1, 1), mp = new THREE.Vector3();
  let tAcc = 0;
  function tick(camera, x, z) {
    tAcc += 0.016;
    let n = 0;
    for (const m of mistPlanes) {
      if (Math.hypot(x - m.x, z - m.z) >= 14) continue;
      mistI.setMatrixAt(n++, m4.compose(mp.set(m.x - 0.05, 1.0 + 0.15 * Math.sin(tAcc + m.z), m.z), qMist, one));
    }
    mistI.count = n; mistI.visible = n > 0;
    if (n) { mistI.instanceMatrix.needsUpdate = true; mistShared.opacity = 0.08 + 0.07 * (0.5 + 0.5 * Math.sin(tAcc * 1.5)); }
    tasting.tick?.(tAcc);
  }
  return { tick };
}

function buildItemIMs() { /* 데이터는 cluster.items 에 쌓고, 메시는 finalizeStock 에서 합침 */ }

function finalizeStock({ scene, keep, clusters, atlas, unitBox, prodMeshes, tagG, ct, proxyMat, m4, pv, qy, s3, col, Y, q0 }) {
  // 상단 랩 파렛트: 맵 없이 품목색 한 메시 (얼룩 아틀라스 UV 제거)
  const uppers = [];
  const allItems = new Map(); // id -> list
  const allTags = [];
  for (const c of clusters) {
    for (const pl of (c.palettes || [])) if (!pl.ground) uppers.push(pl);
    for (const [id, list] of (c.items || [])) {
      const arr = allItems.get(id) || []; arr.push(...list); allItems.set(id, arr);
    }
    if (c.tags) allTags.push(...c.tags);
  }
  if (uppers.length) {
    const im = new THREE.InstancedMesh(unitBox, proxyMat, uppers.length);
    uppers.forEach((pl, i) => {
      m4.compose(pv.set(pl.x, pl.y + pl.h / 2, pl.z), q0, s3.set(pl.w, pl.h, pl.d));
      im.setMatrixAt(i, m4);
      col.setStyle(pl.color || '#d9d0c4'); im.setColorAt(i, col);
    });
    im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); scene.add(im);
  }
  // 상품: SKU 별 InstancedMesh(수십 드로콜) → 앞·중·뒤 구역별 1개 (aCell 로 아틀라스 칸 선택)
  const cellMat = cellMaterial(keep, atlas.mat.clone());
  const cellGeo0 = boxGeoForCell(1, 1, 1, 0, 0);
  const BAND = 15, regions = Array.from({ length: 8 }, () => []); // z 15 m 띠 8개 → 거리 컬링 단위
  for (const [id, list] of allItems) {
    const cell = atlas.index[id]; if (!BY_ID[id] || !cell) continue;
    for (const it of list) regions[Math.min(7, Math.max(0, Math.floor(it.z / BAND)))].push([id, it, cell]);
  }
  for (const reg of regions) {
    if (!reg.length) continue;
    const geo = keep(cellGeo0.clone()); const aCell = new Float32Array(reg.length * 2);
    const im = new THREE.InstancedMesh(geo, cellMat, reg.length);
    const pids = new Array(reg.length), list = new Array(reg.length);
    reg.forEach(([id, it, cell], i) => {
      qy.setFromAxisAngle(Y, (it.rot || 0) + ((it.face ?? 1) > 0 ? 0 : Math.PI));
      m4.compose(pv.set(it.x, it.y, it.z), qy, s3.set(it.sx, it.sy, it.sz)); im.setMatrixAt(i, m4);
      aCell[2 * i] = cell.cx / ATLAS_N; aCell[2 * i + 1] = -cell.cy / ATLAS_N; pids[i] = id; list[i] = it;
    });
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 2));
    im.userData.pids = pids; im.userData.list = list; im.computeBoundingSphere();
    im.userData.zr = [Math.min(...list.map((it) => it.z)) - 1, Math.max(...list.map((it) => it.z)) + 1];
    scene.add(im); prodMeshes.push(im);
  }
  cellGeo0.dispose();
  // 가격표: SKU 별 텍스처·메시 → 2048² 아틀라스(칸 256×128) + InstancedMesh 1개
  const tagIds = [...new Set(allTags.map((t) => t.p.id))].filter((id) => BY_ID[id]).slice(0, 128);
  if (tagIds.length) {
    const TC = 8, TR = 16, TS = 2048, tix = new Map(tagIds.map((id, i) => [id, i]));
    const tex = keep(ct(TS, TS, (g) => {
      tagIds.forEach((id, i) => { g.save(); g.translate((i % TC) * 256, Math.floor(i / TC) * 128); g.scale(0.5, 0.5); paintTag(g, BY_ID[id]); g.restore(); });
    }));
    tex.anisotropy = 4;
    const tags = allTags.filter((t) => tix.has(t.p.id));
    const geo = keep(tagG.clone()); const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / TC, (TR - 1 + uv.getY(i)) / TR);
    const aCell = new Float32Array(tags.length * 2);
    const im = new THREE.InstancedMesh(geo, cellMaterial(keep, new THREE.MeshBasicMaterial({ map: tex })), tags.length);
    tags.forEach((t, i) => {
      qy.setFromAxisAngle(Y, t.face > 0 ? Math.PI / 2 : -Math.PI / 2);
      m4.compose(pv.set(t.x, t.y, t.z), qy, s3.set(1, 1, 1)); im.setMatrixAt(i, m4);
      const k = tix.get(t.p.id); aCell[2 * i] = (k % TC) / TC; aCell[2 * i + 1] = -Math.floor(k / TC) / TR;
    });
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 2));
    im.computeBoundingSphere(); scene.add(im);
  }
}

function signTexLocal(keep, ct, title, sub) {
  return keep(ct(1024, 256, (g) => {
    g.fillStyle = '#1E5A45'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#F2C230'; g.fillRect(0, 216, 1024, 40);
    g.fillStyle = '#F3EADA'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 88px "Pretendard","Noto Sans KR",sans-serif'; g.fillText(title, 512, 110);
    g.fillStyle = '#123B2D'; g.font = '800 26px "Pretendard",sans-serif'; g.fillText(sub, 512, 236);
  }));
}

function buildTasting(scene, keep, ct, { x, z }) {
  const skin = keep(new THREE.MeshLambertMaterial({ color: 0xf0c9a0 }));
  const shirt = keep(new THREE.MeshLambertMaterial({ color: 0xf3eada }));
  const pants = keep(new THREE.MeshLambertMaterial({ color: 0x2a3340 }));
  const green = keep(new THREE.MeshLambertMaterial({ color: 0x1e5a45 }));
  const root = new THREE.Group();
  const torso = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.18, 0.2, 0.55, 8)), shirt); torso.position.y = 1.12;
  const apron = new THREE.Mesh(keep(new THREE.BoxGeometry(0.32, 0.7, 0.02)), green); apron.position.set(0, 1.02, 0.2);
  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.13, 10, 8)), skin); head.position.y = 1.55;
  const cap = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.14, 0.145, 0.07, 10)), green); cap.position.y = 1.64;
  const legG = keep(new THREE.BoxGeometry(0.12, 0.72, 0.14));
  const legL = new THREE.Mesh(legG, pants), legR = new THREE.Mesh(legG, pants);
  legL.position.set(-0.09, 0.36, 0); legR.position.set(0.09, 0.36, 0);
  root.add(torso, apron, head, cap, legL, legR);
  root.position.set(x + 1.3, 0, z); root.rotation.y = Math.PI; scene.add(root);
  const table = new THREE.Mesh(keep(new THREE.BoxGeometry(2.2, 0.9, 0.8)), keep(new THREE.MeshLambertMaterial({ color: 0x1e5a45 })));
  table.position.set(x, 0.45, z); scene.add(table);
  const tray = new THREE.Mesh(keep(new THREE.BoxGeometry(0.7, 0.03, 0.45)), keep(new THREE.MeshLambertMaterial({ color: 0xf3eada })));
  tray.position.set(x, 0.93, z); scene.add(tray);
  const signT = keep(ct(512, 256, (g) => {
    g.fillStyle = '#1E5A45'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#F2C230'; g.font = '900 48px "Pretendard",sans-serif'; g.textAlign = 'center';
    g.fillText('무료 시식', 256, 100);
    g.fillStyle = '#F3EADA'; g.font = '700 26px "Pretendard",sans-serif'; g.fillText('범머핀 · 오늘만 한 입', 256, 170);
  }));
  const sign = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.3, 0.65)), keep(new THREE.MeshBasicMaterial({ map: signT })));
  sign.position.set(x, 1.55, z - 0.4); scene.add(sign);
  const bubbleT = keep(ct(512, 160, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 160);
    g.strokeStyle = '#1E5A45'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 150);
    g.fillStyle = '#13203d'; g.font = '800 36px "Pretendard",sans-serif'; g.textAlign = 'center';
    g.fillText('맛보세요~ 방금 나왔어요', 256, 95);
  }));
  const bubble = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.6, 0.5)), keep(new THREE.MeshBasicMaterial({ map: bubbleT, transparent: true })));
  bubble.position.set(x + 1.3, 2.05, z); bubble.userData.dynamic = true; scene.add(bubble);
  return {
    tick(t) {
      root.position.y = 0.01 * Math.sin(t * 2);
      bubble.position.y = 2.05 + 0.03 * Math.sin(t * 2.2);
      bubble.material.opacity = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(t * 0.6));
    },
  };
}
