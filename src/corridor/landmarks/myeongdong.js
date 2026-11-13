// [myeongdong] 명동 리전 (phase 1–2): OSM 실제 길·건물 + 명동역(4호선) 출구 + 명동대성당 + 화장품 거리 간판/네온 + 노점 + 남산오르미 길안내.
//   지연 생성(lazyLandmarks): 가까이 오거나 ?at=myeongdong 일 때 짓는다. 남산을 먼저 짓고(이음매 높이), 그 위에 붙인다.
//   성능: 간판·쇼윈도·노점 메뉴·역 표지 = 아틀라스 1장 병합 메시 1개, 건물 = 4조각 병합, 노점·가로등·사람 = 인스턴싱.
//   미니게임 훅(다음 단계): api.hooks — A '명동 쇼핑 리스트'(cosmeticsShops: 화장품 가게 앞 좌표), C '서울 첫날 코스'(course: 명동역→오르미→케이블카→N서울타워)
import * as THREE from 'three';
import { buildingMeshes, buildingMeshesAsync } from '../tileMesh.js';
import { watchEvening } from '../../evening.js';
import { makeMyeongdongLand } from './myeongdongLand.js';
import { GeoBuf, hex3, pointInRing, distToSeg, CellGrid, hash01 } from './myeongdongGeo.js';
import { createMyeongdongAtlas } from './myeongdongAtlas.js';
import { createMyeongdongStreet } from './myeongdongStreet.js';
import { createMyeongdongCathedral } from './myeongdongCathedral.js';
import { createMyeongdongStation } from './myeongdongStation.js';
import { createMyeongdongSignature, SIGNATURE_IDS } from './myeongdongSignature.js'; // [myeongdong-signature]
import { MYEONGDONG_SPAWN, LINE4_COLOR } from './myeongdongFlags.js';
import { syncLandmarkDormant } from './lazyLandmarks.js';

const DORM = typeof location === 'undefined' || new URLSearchParams(location.search).get('landmarkdorm') !== '0';
/** [myeongdong-signature] ?mdsig=0 이면 대표 건물 모델 끄기 (예전 OSM 상자) */
const SIG_ON = typeof location === 'undefined' || new URLSearchParams(location.search).get('mdsig') !== '0';
const CAR = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link', 'trunk_link']);
const PED = new Set(['pedestrian', 'living_street', 'footway', 'steps', 'path', 'corridor', 'cycleway']);
const ROAD_COL = {
  car: '#3b3e44', residential: '#cbbca8', service: '#bdb3a6', unclassified: '#c4b6a3',
  pedestrian: '#d6c8b2', living_street: '#d0c2ae', footway: '#ddd5c8', steps: '#c9c2b8', path: '#c8bfae', corridor: '#ddd5c8', cycleway: '#c9b9a8',
};

function boundsDist(b, x, z) {
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  return Math.hypot(dx, dz);
}

function paverTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b9b3aa'; g.fillRect(0, 0, 256, 256);
  let s = 77; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bw = 64, bh = 32;
  for (let y = 0; y < 256; y += bh) for (let x = -(y / bh % 2) * bw / 2; x < 256; x += bw) {
    const l = 66 + r() * 14;
    g.fillStyle = `hsl(32,${8 + r() * 6}%,${l}%)`; g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
  }
  for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.06})`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function asphaltTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 128, 128);
  let s = 31; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 2400; k++) { const v = 180 + r() * 75; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** 길 리본을 지형에 붙여 깐다 (세그먼트를 3 m 로 쪼개 높이를 다시 잰다). UV 는 월드 m/4 */
function drapeRibbon(buf, pts, w, heightAt, yOff, col, clip) {
  const hw = w / 2;
  const P = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) { P.push(pts[0]); continue; }
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 3));
    for (let k = 1; k <= n; k++) P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  if (P.length < 2) return;
  const L = [], R = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    const lx = P[i][0] + nx * hw, lz = P[i][1] + nz * hw, rx = P[i][0] - nx * hw, rz = P[i][1] - nz * hw;
    L.push([lx, heightAt(lx, lz) + yOff, lz]); R.push([rx, heightAt(rx, rz) + yOff, rz]);
  }
  for (let i = 1; i < P.length; i++) {
    const mx = (P[i][0] + P[i - 1][0]) / 2, mz = (P[i][1] + P[i - 1][1]) / 2;
    if (clip && !clip(mx, mz)) continue;
    const a = R[i - 1], b = R[i], c = L[i], d = L[i - 1];
    const uv = (q) => [q[0] / 4, q[2] / 4];
    const base = buf.count;
    for (const q of [a, b, c, d]) { buf.p.push(q[0], q[1], q[2]); buf.n.push(0, 1, 0); }
    for (const q of [a, b, c, d]) { const [u, v] = uv(q); buf.uv.push(u, v); }
    for (let k = 0; k < 4; k++) buf.c.push(col[0], col[1], col[2]);
    buf.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
}

function dashed(pts, dash, gap) {
  const out = []; let cur = null, acc = 0, on = true;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = 0;
    while (t < L) {
      const step = Math.min(L - t, (on ? dash : gap) - acc);
      const p0 = [a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L];
      t += step; acc += step;
      const p1 = [a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L];
      if (on) { if (!cur) cur = [p0]; cur.push(p1); }
      if (acc >= (on ? dash : gap) - 1e-6) { if (on && cur) { out.push(cur); cur = null; } on = !on; acc = 0; }
    }
  }
  if (cur && cur.length > 1) out.push(cur);
  return out;
}

function offsetLine(pts, off) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    return [p[0] - tz * off, p[1] + tx * off];
  });
}

function polyArea(o) { let a = 0; for (let i = 0, j = o.length - 1; i < o.length; j = i++) a += (o[j][0] + o[i][0]) * (o[j][1] - o[i][1]); return Math.abs(a / 2); }

/** 건물 높이: OSM height > 층수 > 면적·해시로 명동다운 4–12층 */
// [walk-sweep] 캐노피(building=roof): 평평한 얇은 지붕(땅 최고점 + 4.6 m) + 꼭짓점 기둥. 한 메시(정점색).
function canopyMesh(list, heightAt) {
  const buf = new GeoBuf({ uv: false, color: true });
  const top = hex3(0xd8dadc), under = hex3(0x9a9ea3), edge = hex3(0xb8bcc0), post = hex3(0x4a4f55);
  const H = 4.6, T = 0.3;
  for (const b of list) {
    let ring = b.o.map(([x, z]) => [x, z]);
    if (ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring = ring.slice(0, -1);
    if (ring.length < 3) continue;
    let g = -Infinity; for (const [x, z] of ring) g = Math.max(g, heightAt(x, z));
    const y1 = g + H, y0 = y1 - T;
    const tris = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
    const pos = [], nrm = [], idx = [], posB = [], nrmB = [], idxB = [];
    ring.forEach(([x, z]) => { pos.push(x, y1, z); nrm.push(0, 1, 0); posB.push(x, y0, z); nrmB.push(0, -1, 0); });
    for (const [a, c, d] of tris) {
      // 위에서 보아 +y 법선이 되게: (c-a)×(d-a) 의 y 성분 = dz1*dx2 - dx1*dz2 > 0 이면 그대로
      const [ax, az] = ring[a], [cx, cz] = ring[c], [dx, dz] = ring[d];
      const up = (cz - az) * (dx - ax) - (cx - ax) * (dz - az) > 0;
      if (up) { idx.push(a, c, d); idxB.push(a, d, c); } else { idx.push(a, d, c); idxB.push(a, c, d); }
    }
    buf.raw(pos, idx, nrm, null, top);
    buf.raw(posB, idxB, nrmB, null, under);
    let area2 = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; area2 += p[0] * q[1] - q[0] * p[1]; }
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      // 바깥을 보는 옆면 (링 방향에 따라 순서 바꿈)
      const [s0, s1] = area2 > 0 ? [q, p] : [p, q];
      buf.quad([s0[0], y0, s0[1]], [s1[0], y0, s1[1]], [s1[0], y1, s1[1]], [s0[0], y1, s0[1]], undefined, edge);
    }
    // 기둥: 꼭짓점마다 (너무 촘촘하면 건너뜀), 땅에서 지붕 밑까지
    let last = null;
    for (const [x, z] of ring) {
      if (last && Math.hypot(x - last[0], z - last[1]) < 3) continue;
      last = [x, z];
      const gy = heightAt(x, z), h = y0 - gy + 0.05; if (h <= 0.3) continue;
      buf.box(x, gy + h / 2 - 0.05, z, 0.22, h, 0.22, 0, undefined, post, 15);
    }
  }
  const geo = buf.build(); if (!geo) return null;
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.name = 'myeongdong-canopies'; m.castShadow = true; m.receiveShadow = true;
  return m;
}

function buildingHeight(b) {
  if (b.h) return Math.max(4, b.h);
  if (b.lv) return b.lv * 3.4 + 1.2;
  const A = polyArea(b.o), r = hash01(b.id % 1000003, 7);
  const floors = A < 90 ? 2 + Math.floor(r * 3) : A < 300 ? 3 + Math.floor(r * 5) : A < 1200 ? 5 + Math.floor(r * 6) : 7 + Math.floor(r * 8);
  return floors * 3.4 + 1.2;
}

export async function createMyeongdongAsync(opts = {}, yieldFn = null, slicer = null) {
  const { scene, overlay, terrain, data, namsan = null } = opts;
  const T = [];
  let tLast = typeof performance !== 'undefined' ? performance.now() : 0;
  const tick = async (label) => {
    if (typeof performance !== 'undefined') { const n = performance.now(); if (n - tLast > 40) T.push(`${label}:${Math.round(n - tLast)}`); }
    if (slicer) await slicer.tick(label);
    if (typeof performance !== 'undefined') tLast = performance.now();
  };
  const root = new THREE.Group();
  root.name = 'myeongdong';
  root.visible = false;
  scene.add(root);

  const land = makeMyeongdongLand(data, { namsanHeightAt: namsan?.heightAt ? (x, z) => namsan.heightAt(x, z) : null });
  const { heightAt, bounds: B, apron: A } = land;
  const atlas = await createMyeongdongAtlas(slicer ? tick : null);
  await tick('md-atlas');

  // ---------- 땅 (바깥 띠 포함, 5 m 격자) ----------
  const GROUND_DROP = +(new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('mdgd') ?? 0.2); // [md-roadblotch] 땅을 길(+0.06)보다 확실히 아래로
  const groundMat = new THREE.MeshLambertMaterial({ map: paverTexture(), vertexColors: true });
  {
    const S = 5, gx0 = A.x0, gz0 = A.z0, nx = Math.ceil((A.x1 - A.x0) / S) + 1, nz = Math.ceil((A.z1 + 8 - A.z0) / S) + 1;
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), col = new Float32Array(nx * nz * 3), idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = Math.min(A.x1, gx0 + i * S), z = Math.min(A.z1 + 8, gz0 + j * S), k = j * nx + i;
      pos[k * 3] = x; pos[k * 3 + 1] = heightAt(x, Math.min(z, A.z1)) - (z > A.z1 ? 0.05 : GROUND_DROP); pos[k * 3 + 2] = z;
      uv[k * 2] = x / 3; uv[k * 2 + 1] = z / 3;
      const out = land.inBox(x, z) ? 1 : 0.86;
      col[k * 3] = out; col[k * 3 + 1] = out; col[k * 3 + 2] = out;
    }
    // [md-roadblotch] 5 m 삼각형 면은 굽은 비탈에서 실제 높이(heightAt)보다 위로 솟아, 0.06 m 얹은 길 리본을 뚫고 보도색 얼룩으로 보였다(롯데 앞 을지로).
    //   셀마다 표본 9점에서 면이 heightAt 보다 얼마나 높은지 재서, 그 셀 꼭짓점을 그만큼(+여유) 내린다. 내리기만 하므로 한 번이면 충분.
    {
      const low = new Float32Array(nx * nz);
      for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; const ha = pos[a * 3 + 1], hb = pos[b * 3 + 1], hc = pos[c * 3 + 1], hd = pos[d * 3 + 1];
        const x0 = pos[a * 3], z0 = pos[a * 3 + 2]; let dev = 0;
        for (const v of [0.2, 0.5, 0.8]) for (const u of [0.2, 0.5, 0.8]) {
          const h = u + v <= 1 ? ha + u * (hb - ha) + v * (hc - ha) : hd + (1 - u) * (hc - hd) + (1 - v) * (hb - hd);
          const e = h - heightAt(x0 + u * S, Math.min(z0 + v * S, A.z1)); if (e > dev) dev = e;
        }
        if (dev > 0.02) { dev += 0.04; for (const k of [a, b, c, d]) if (dev > low[k]) low[k] = dev; }
      }
      for (let k = 0; k < nx * nz; k++) if (low[k] > 0) pos[k * 3 + 1] -= Math.min(low[k], 2.5);
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(nx * nz > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, groundMat);
    m.name = 'myeongdong-ground'; m.receiveShadow = true;
    root.add(m);
  }
  await tick('md-ground');

  // ---------- 길 (차도 아스팔트 + 명동 보행 골목 블록 포장) ----------
  const ways = (data.ways || []).filter((w) => w.pts?.length >= 2 && !w.tun);
  const roadMat = new THREE.MeshLambertMaterial({ map: asphaltTexture(), vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const roadGrid = new CellGrid(24);
  {
    const buf = new GeoBuf({ uv: true, color: true });
    const clip = (x, z) => land.inApron(x, z, 2);
    // 넓은 길부터 깔고, 좁은 길·보도는 조금 위로 (겹침 반짝임 방지)
    const order = ways.slice().sort((a, b) => (CAR.has(b.k) ? 1 : 0) - (CAR.has(a.k) ? 1 : 0) || b.w - a.w);
    for (const w of order) {
      const car = CAR.has(w.k);
      const col = hex3(car ? ROAD_COL.car : (ROAD_COL[w.k] || ROAD_COL.residential));
      const yOff = car ? 0.06 : PED.has(w.k) ? 0.1 : 0.08;
      drapeRibbon(buf, w.pts, w.w, heightAt, yOff, col, clip);
      if (car) {
        // 연석(보도 가장자리)
        for (const s of [-1, 1]) drapeRibbon(buf, offsetLine(w.pts, s * (w.w / 2 + 0.2)), 0.42, heightAt, 0.14, hex3('#d6d4cf'), clip);
        // 차선: 일방통행 2차로 이상이면 흰 점선, 양방향이면 노란 중앙선
        if (!w.ow && w.w >= 9) for (const s of [-0.18, 0.18]) drapeRibbon(buf, offsetLine(w.pts, s), 0.15, heightAt, 0.075, hex3('#f2c14e'), clip);
        const lanes = Math.max(1, Math.round(w.ln || (w.w / 3.4)));
        const per = w.ow ? lanes : Math.floor(lanes / 2);
        for (let k = 1; k < per; k++) {
          const off = w.ow ? -w.w / 2 + (w.w / lanes) * k : (w.w / 2 / per) * k;
          for (const s of (w.ow ? [1] : [-1, 1])) for (const seg of dashed(offsetLine(w.pts, s * off), 3, 5)) drapeRibbon(buf, seg, 0.14, heightAt, 0.075, hex3('#f1f1ee'), clip);
        }
      }
      for (let i = 1; i < w.pts.length; i++) {
        const a = w.pts[i - 1], b = w.pts[i], r = w.w / 2;
        roadGrid.add({ a, b, r, w }, Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r);
      }
      await tick('md-roads');
    }
    const g = buf.build();
    if (g) { const m = new THREE.Mesh(g, roadMat); m.name = 'myeongdong-roads'; m.receiveShadow = true; root.add(m); }
  }
  const roadAt = (x, z, pad = 0, kinds = null) => {
    for (const s of roadGrid.query(x, z)) {
      if (kinds && !kinds.has(s.w.k)) continue;
      if (distToSeg(x, z, s.a[0], s.a[1], s.b[0], s.b[1]) < s.r + pad) return s.w;
    }
    return null;
  };
  await tick('md-roads');

  // ---------- 녹지·광장 (얇게 깔기) ----------
  {
    const buf = new GeoBuf({ uv: true, color: true });
    for (const a of data.areas || []) {
      if (!a.o || a.o.length < 3) continue;
      const green = /garden|grass|park|wood|scrub/.test(a.k);
      if (!green && a.k !== 'pedestrian' && a.k !== 'ped') continue;
      let cx = 0, cz = 0; for (const p of a.o) { cx += p[0]; cz += p[1]; } cx /= a.o.length; cz /= a.o.length;
      if (!land.inApron(cx, cz)) continue;
      if (land.hill?.inPlaza?.(cx, cz)) continue; // [myeongdong-detail] 성당 광장은 판석 포장이 덮는다
      const shape = a.o.map(([x, z]) => new THREE.Vector2(x, z));
      let tris; try { tris = THREE.ShapeUtils.triangulateShape(shape, []); } catch { continue; }
      const col = hex3(green ? (a.k === 'wood' ? '#4d7a3d' : '#6f9e52') : '#c9c4bb'); // 보행 광장: 모래색 → 돌색
      const pos = [], nrm = [], uv = [];
      for (const [x, z] of a.o) { pos.push(x, heightAt(x, z) + (green ? 0.12 : 0.11), z); nrm.push(0, 1, 0); uv.push(x / 4, z / 4); }
      const idx = [];
      for (const t of tris) {
        const [p0, p1, p2] = [a.o[t[0]], a.o[t[1]], a.o[t[2]]];
        const up = (p1[1] - p0[1]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[1] - p0[1]); // (p1-p0)×(p2-p0) 의 y
        if (up > 0) idx.push(t[0], t[1], t[2]); else idx.push(t[0], t[2], t[1]);
      }
      buf.raw(pos, idx, nrm, uv, col);
    }
    const g = buf.build();
    if (g) { const m = new THREE.Mesh(g, roadMat); m.name = 'myeongdong-areas'; m.receiveShadow = true; root.add(m); }
  }
  await tick('md-areas');

  // ---------- 건물 (4조각 병합 · 기존 코리더 파사드/야간 창 셰이더 재사용) ----------
  const catId = data.cathedral?.id;
  const bldGrid = new CellGrid(20);
  const blds = [];
  const cxMid = (A.x0 + A.x1) / 2, czMid = (A.z0 + A.z1) / 2;
  const buckets = [[], [], [], []];
  const canopies = [];
  for (const b of data.buildings || []) {
    if (!b.o || b.o.length < 3 || b.id === catId) continue;
    if (b.part) continue;
    let cx = 0, cz = 0; for (const p of b.o) { cx += p[0]; cz += p[1]; } cx /= b.o.length; cz /= b.o.length;
    if (!land.inApron(cx, cz)) continue;
    // 성당 바로 옆 성당 부속(본당 지붕 조각 등)은 성당 모델이 대신한다
    if (land.hill && Math.hypot(cx - land.hill.cx, cz - land.hill.cz) < 34 && /church|cathedral/.test(b.k || '')) continue;
    // 성당 외곽선과 겹치는 건물(같은 자리 중복 OSM 조각)도 뺀다 — 안 빼면 성당 벽에 상점 간판이 붙는다
    if (data.cathedral?.o && (pointInRing(cx, cz, data.cathedral.o) || b.o.some(([x, z]) => pointInRing(x, z, data.cathedral.o)))) continue;
    if (data.cathedral?.o && (b.h || 0) > 25 && data.cathedral.o.some((p, i, o) => { const q = o[(i + 1) % o.length]; return distToSeg(cx, cz, p[0], p[1], q[0], q[1]) < 12; })) continue; // 종탑(way/1139745172 · 47 m)은 성당 모델의 첨탑이 대신
    // [walk-sweep] building=roof 는 지붕만 있는 캐노피(통로·주유소·시장 덮개). 예전엔 층수를 지어내 꽉 찬 건물로
    //   세워서 그 밑 길(롯데 사이 보행로·퇴계로24길 등)이 막혔다 → 기둥 달린 얇은 지붕, 충돌 없음.
    if (b.k === 'roof') { canopies.push(b); continue; }
    let mn = Infinity, mx = -Infinity;
    for (const [x, z] of b.o) { const y = heightAt(x, z); mn = Math.min(mn, y); mx = Math.max(mx, y); }
    const ht = buildingHeight(b);
    // [walk-sweep] min_height ≥ 2.5 m = 공중 다리(남대문로7길 위 way/711239221 · 15–18 m 등): 떠 있게 그리고 충돌 없음 (코리더 타일과 같은 규칙)
    if ((b.mh || 0) >= 2.5) { buckets[(cx >= cxMid ? 1 : 0) + (cz >= czMid ? 2 : 0)].push({ o: b.o, h: mx + Math.max(ht, b.mh + 1), mh: mx + b.mh, k: 'commercial' }); continue; }
    const rec = { id: b.id, o: b.o, base: mn - 0.4, ground: mx, top: mx + ht, ht, cx, cz, k: b.k, floors: Math.max(1, Math.round((ht - 1.2) / 3.4)), inBox: land.inBox(cx, cz) };
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of b.o) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    rec.bb = [x0, z0, x1, z1];
    bldGrid.add(rec, x0, z0, x1, z1);
    if (SIG_ON && SIGNATURE_IDS.has(b.id)) continue; // [myeongdong-signature] 모델이 그린다 (충돌만 남김, 간판·가게 앞면 없음)
    blds.push(rec);
    const kind = b.k === 'hotel' ? 'hotel' : b.k === 'church' ? 'church' : (b.k && b.k !== 'yes') ? b.k : 'commercial';
    buckets[(cx >= cxMid ? 1 : 0) + (cz >= czMid ? 2 : 0)].push({ o: b.o, h: rec.top, mh: rec.base, k: kind });
  }
  for (let i = 0; i < 4; i++) {
    if (!buckets[i].length) continue;
    const meshes = slicer ? await buildingMeshesAsync(buckets[i], 9133 + i * 31, slicer) : buildingMeshes(buckets[i], 9133 + i * 31);
    for (const m of meshes) { m.name = 'myeongdong-bld' + i; root.add(m); }
  }
  if (canopies.length) { const m = canopyMesh(canopies, heightAt); if (m) root.add(m); }
  await tick('md-buildings');
  const bldAt = (x, z, pad = 0) => {
    for (const r of bldGrid.query(x, z)) {
      if (x < r.bb[0] - pad || x > r.bb[2] + pad || z < r.bb[1] - pad || z > r.bb[3] + pad) continue;
      if (pointInRing(x, z, r.o)) return r;
      if (pad > 0) for (let i = 0; i < r.o.length; i++) { const a = r.o[i], b = r.o[(i + 1) % r.o.length]; if (distToSeg(x, z, a[0], a[1], b[0], b[1]) < pad) return r; }
    }
    return null;
  };

  // ---------- 성당 · 역/길안내 · 거리(간판·노점·가로등·사람) ----------
  const signature = SIG_ON ? createMyeongdongSignature({ parent: root, data, heightAt, overlay, bldAt }) : null; // [myeongdong-signature]
  await tick('md-signature');
  const cathedral = createMyeongdongCathedral({ parent: root, data, land, overlay, atlas });
  await tick('md-cathedral');
  const station = createMyeongdongStation({ parent: root, data, land, atlas, overlay, roadAt, bldAt, namsan });
  await tick('md-station');
  const street = await createMyeongdongStreet({ parent: root, data, land, atlas, ways, blds, roadAt, bldAt, station, tick });
  await tick('md-street');

  // ---------- 이름표 ----------
  if (overlay) {
    const lab = (text, x, z, up, maxDist, cls = 'label landmark', minDist = 8) => overlay.add({ cls, text, getPos: () => new THREE.Vector3(x, heightAt(x, z) + up, z), maxDist, minDist });
    lab('🛍️ 명동 Myeongdong', -10985, -21720, 34, 2600, 'label landmark', 120);
    lab('명동8길 · 명동 중앙로 Myeongdong Main St.', -10925, -21590, 9, 260, 'label', 10);
    lab('명동길 Myeongdong-gil', -11020, -21830, 9, 260, 'label', 10);
    lab('🍢 명동 노점 거리 Street Food Alley', -10935, -21650, 6.5, 160, 'label', 6);
  }

  // ---------- 높이·충돌 ----------
  // [walk-sweep] 바깥 띠(apron)도 명동 땅(그려진 높이)이 바닥이다. 예전엔 상자(B) 밖이 0 m 바닥이라
  //   상자 테두리(을지로·남대문로·삼일대로 쪽)에서 최대 19 m 단차 → 투명 벽처럼 못 나갔다.
  function surfaceY(x, z, refY = Infinity) {
    if (!land.inApron(x, z, 0.5)) return null;
    const c = cathedral.floorY?.(x, z, refY);
    const g = heightAt(x, z);
    return c != null && c > g ? c : g;
  }
  let unregSurface = null, guideLinesSent = false;
  if (terrain?.addGroundSurface) unregSurface = terrain.addGroundSurface((x, z, refY) => surfaceY(x, z, refY), { authoritative: true }); // [walk-sweep] 명동엔 아래층이 없다
  function isBlocked(x, z, r = 0.4) {
    if (!land.inApron(x, z, 2)) return false;
    if (bldAt(x, z, r)) return true;
    if (cathedral.isBlocked?.(x, z, r)) return true;
    if (street.isBlocked?.(x, z, r)) return true;
    if (station.isBlocked?.(x, z, r)) return true;
    if (signature?.isBlocked(x, z, r)) return true; // [myeongdong-signature] 남대문시장 노점·게이트
    return false;
  }
  /** [walk-sweep] 무엇이 막는지 (검사·디버그용): 'bld:<id>' | 'cathedral' | 'street' | 'station' | 'signature' | null */
  function blockedBy(x, z, r = 0.4) {
    if (!land.inApron(x, z, 2)) return null;
    const b = bldAt(x, z, r); if (b) return 'bld:' + (b.id ?? '?');
    if (cathedral.isBlocked?.(x, z, r)) return 'cathedral';
    if (street.isBlocked?.(x, z, r)) return 'street';
    if (station.isBlocked?.(x, z, r)) return 'station';
    if (signature?.isBlocked(x, z, r)) return 'signature';
    return null;
  }

  // ---------- 미니맵 ----------
  const mini = {
    roads: ways.filter((w) => w.pts.some(([x, z]) => land.inApron(x, z))).map((w) => ({ k: w.k, p: w.pts, w: w.w })),
    buildings: blds.map((b) => ({ o: b.o })).concat(data.cathedral?.o ? [{ o: data.cathedral.o }] : [], signature?.footprints || []),
    plazas: (data.areas || []).filter((a) => a.k === 'pedestrian' || a.k === 'ped').map((a) => ({ o: a.o })),
    parks: (data.areas || []).filter((a) => /garden|grass|park|wood/.test(a.k)).map((a) => ({ o: a.o })),
    water: [], waterLines: [],
    station: station.mini,
  };

  // ---------- 밤 ----------
  let night = 0;
  function setNight(v) {
    night = Math.max(0, Math.min(1, v));
    groundMat.color.setScalar(1 - night * 0.62);
    roadMat.color.setScalar(1 - night * 0.55);
    street.setNight(night);
    cathedral.setNight(night);
    signature?.setNight(night);
    station.setNight(night);
  }
  const unwatch = watchEvening((on) => setNight(on ? 1 : 0));

  const spawn = (() => {
    const s = station.spawn || MYEONGDONG_SPAWN;
    return { x: s.x, z: s.z, y: heightAt(s.x, s.z) + 0.15, name: s.name || MYEONGDONG_SPAWN.name };
  })();
  root.visible = true;
  console.info(`[myeongdong] spawn=${spawn.x.toFixed(1)},${spawn.z.toFixed(1)} face=${(station.spawnFace ?? 0).toFixed(3)} guide=${station.info?.pathLen}m slow=${T.join(' ')}`);
  let lastP = null;
  const api = {
    root,
    spawn,
    spawnY: () => heightAt(spawn.x, spawn.z) + 0.15,
    face: station.spawnFace ?? Math.PI, // 북쪽(명동 거리)을 보게
    bounds: B,
    boxes: [B],
    heightAt,
    surfaceY,
    groundHeight: (x, z, refY) => surfaceY(x, z, refY),
    owns: (x, z) => land.inBox(x, z),
    ownDist: (x, z) => boundsDist(B, x, z),
    isBlocked,
    blockedBy,
    walkWays: () => ways.map((w) => ({ id: w.id, k: w.k, n: w.n, w: w.w, pts: w.pts })), // [walk-sweep]
    mini,
    station: station.info,
    cathedral: cathedral.info,
    hooks: {
      // [myeongdong-minigame A] 화장품 가게 앞(쇼핑 리스트 미션 수집 지점 후보) — { x, z, sign, face }
      cosmeticsShops: street.cosmeticsShops,
      // [myeongdong-minigame C] 서울 첫날 코스 경유지 (명동역 → 남산오르미 → 케이블카 하부 → 남산타워)
      course: station.course,
      stalls: street.stallSpots,
      // [myeongdong-detail] 1층 가게 문 앞 { type, x, z, face, w } (핵심 블록)
      shops: street.shops,
    },
    get poolLightCount() { return 0; },
    tickPlayer(dt, player, cam, sky) {
      if (DORM && player?.position && !syncLandmarkDormant(root, boundsDist(A, player.position.x, player.position.z))) return;
      lastP = player?.position || null;
      cathedral.tickPlayer?.(dt, player, sky); // [myeongdong-cathedral] 실내 보이기 + 해 방향 빛
    },
    /** [myeongdong-cathedral] 카메라 점이 성당 실내 공간 안인가 (game.js 따라보기 붐 줄이기) */
    camInside: (x, z, y) => !!cathedral.camInside?.(x, z, y),
    inCathedral: (x, z) => !!cathedral.playerInside?.(x, z),
    findSeat: (x, z) => cathedral.findSeat?.(x, z) ?? null, // [cathedral-sit] 장의자
    get cathedralInside() { return !!cathedral.inside; }, // [cathedral-bgm] 실내(현관 포함, 문간 제외)
    cathedralAt: (u, v) => cathedral.at?.(u, v) ?? null,
    cathedralUV: (x, z) => cathedral.uv?.(x, z) ?? null,
    get cathedralInterior() { return cathedral.interior || null; },
    update(dt) {
      // [myeongdong] 케이블카 길안내 화살표가 명동 골목을 따라가게 (남산이 명동보다 늦게 지어져도 한 번만)
      if (!guideLinesSent && namsan?.cableGuide?.addLines) { guideLinesSent = true; namsan.cableGuide.addLines(ways.map((w) => w.pts)); }
      if (DORM && !root.visible) return;
      street.update(dt, lastP);
      signature?.update(dt);
      station.update(dt, lastP);
    },
    setNight,
    dispose() {
      unwatch?.();
      unregSurface?.();
      scene.remove(root);
    },
    stats() { return { blds: blds.length, ways: ways.length, ...street.stats(), signature: signature?.stats() || null }; },
  };
  void LINE4_COLOR;
  return api;
}
