// [seongsu] 성수동 — 실제 OSM 길·필지·2호선 고가철도 + 하우스 노웨어 서울(젠틀몬스터 성수 사옥).
//   세계관: 정자·명동과 같은 단색 Lambert · 단순 매스 · 한글 간판. 고해상도는 HQ 형상·전시물에만 쓴다.
//   리전은 정자 월드의 섬(명동·남산·강남과 같은 패턴): 별도 멀티플레이 서버/DB가 필요 없다.
//   ?seongsu=0: 리전·2호선 성수역·게이트 칩을 함께 숨긴다. ?hnnpc=0: HQ 사람만, ?ssnpc=0: 거리 사람만 끈다.
//   출처: public/corridor/seongsu/seongsu.json (scripts/corridor/build-seongsu.py), © OpenStreetMap contributors (ODbL).
import * as THREE from 'three';
import { buildingMeshesAsync } from '../tileMesh.js';
import { watchEvening } from '../../evening.js';
import { createHQ, floorOfY } from '../../gentlemonster/hq.js';
import { Builder } from '../../gentlemonster/geo.js';
import { labelTex } from '../../gentlemonster/textures.js';
import { hqCrowdInput, staffLook, guestLook, withCum } from '../../gentlemonster/hqNpc.js';
import { createMyeongdongNpc } from './myeongdongNpc.js';
import { GeoBuf, hex3, pointInRing, distToSeg, CellGrid, hash01 } from './myeongdongGeo.js';
import { syncLandmarkDormant } from './lazyLandmarks.js';
import { SEONGSU_BOUNDS, SEONGSU_APRON, SEONGSU_HQ, SEONGSU_SPAWN, inSeongsu, hqLocal, hqWorld } from './seongsuFlags.js';

const CAR = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link', 'trunk_link']);
const PED = new Set(['pedestrian', 'living_street', 'footway', 'steps', 'path', 'cycleway']);
const roadColor = (w) => CAR.has(w.k) ? '#4a4d53' : PED.has(w.k) ? '#d9d2c5' : '#aaa39a';
const inApron = (x, z, p = 0) => inSeongsu(x, z, p, SEONGSU_APRON);
const distBox = (b, x, z) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));

/** 길(평지) — 같은 재질로 병합. */
function ribbon(buf, pts, w, y, col) {
  if (pts.length < 2) return;
  const rows = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return [[p[0] - dz / L * w / 2, y, p[1] + dx / L * w / 2], [p[0] + dz / L * w / 2, y, p[1] - dx / L * w / 2]];
  });
  for (let i = 1; i < rows.length; i++) buf.quad(rows[i - 1][0], rows[i][0], rows[i][1], rows[i - 1][1], undefined, col);
}
function offset(pts, d) {
  return pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; return [p[0] - dz / L * d, p[1] + dx / L * d]; });
}
function dashed(pts, dash = 3, gap = 5) {
  const out = []; let phase = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    for (let s = 0; s < L;) { const on = phase < dash, n = Math.min(L - s, (on ? dash : dash + gap) - phase); if (on && n > 0.01) out.push([[a[0] + dx * s / L, a[1] + dz * s / L], [a[0] + dx * (s + n) / L, a[1] + dz * (s + n) / L]]); s += n; phase = (phase + n) % (dash + gap); if (n < 0.0001) { phase = 0; s += 0.001; } }
  }
  return out;
}
function areaMesh(buf, ring, y, color) {
  if (ring.length < 3) return;
  const sh = ring.map(([x, z]) => new THREE.Vector2(x, z));
  let ts; try { ts = THREE.ShapeUtils.triangulateShape(sh, []); } catch { return; }
  for (const t of ts) { const [a, b, c] = t.map((k) => ring[k]); const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0; const pts = (up ? [a, b, c] : [a, c, b]).flatMap(([x, z]) => [x, y, z]); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.computeVertexNormals(); const ns = Array.from(g.attributes.normal.array); g.dispose(); buf.raw(pts, [0, 1, 2], ns, null, color); }
}
function area(ring) { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; return Math.abs(a / 2); }

export async function createSeongsuAsync({ scene, overlay, terrain, data, mobile = false }, slicer = null) {
  const tick = async (s) => { await slicer?.tick?.(s); };
  slicer?.mark?.(); // json·모듈 기다린 시간은 메인 스레드 블록이 아니다
  await tick('ss-start');
  const root = new THREE.Group(); root.name = 'seongsu'; root.visible = false; scene.add(root);
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const B = { ...SEONGSU_BOUNDS }, A = { ...SEONGSU_APRON }, H = { ...SEONGSU_HQ, ...data.hq };
  const local = (x, z) => hqLocal(x, z, H), toWorld = (x, z) => hqWorld(x, z, H);
  const hq = createHQ({ mobile, core: true });
  await tick('ss-hq-built');
  hq.group.position.set(H.x, 0, H.z); hq.group.rotation.y = H.ry; root.add(hq.group);
  const hqSite = (x, z, pad = 0) => { const [lx, lz] = local(x, z); return lx > -35 - pad && lx < 72 + pad && lz > -32 - pad && lz < 25 + pad; };
  const labels = [];
  const addLabel = (text, x, z, up, maxDist, minDist = 8, cls = 'label') => { if (overlay) labels.push(overlay.add({ cls, text, getPos: () => new THREE.Vector3(x, up, z), maxDist, minDist })); };
  addLabel('성수동 · Seongsu-dong', H.x, H.z, 64, 2400, 120, 'label landmark');
  addLabel('HAUS NOWHERE SEOUL · 하우스 노웨어 서울', H.x, H.z, 36, 700, 20, 'label landmark');
  addLabel('🚇 성수역 Seongsu · 2호선', data.station.x, data.station.z, 14, 800, 30, 'label landmark');
  await tick('ss-hq');

  // 평지. 코리더 기본 바닥(y=0)과 깜빡이지 않게 2 cm 위에 놓는다.
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const gb = new GeoBuf({ uv: false, color: true });
  gb.quad([A.x0, 0.02, A.z1], [A.x1, 0.02, A.z1], [A.x1, 0.02, A.z0], [A.x0, 0.02, A.z0], undefined, hex3('#c7c3b9'));
  for (const a of data.areas || []) {
    if (a.o.some(([x, z]) => hqSite(x, z, 3))) continue;
    const green = /garden|grass|park|wood|scrub|recreation|pitch/.test(a.k);
    areaMesh(gb, a.o, 0.035, hex3(green ? '#7e9a57' : '#b4b1a8'));
  }
  const ground = new THREE.Mesh(gb.build(), mat); ground.name = 'seongsu-ground'; root.add(ground);
  // 길 + 보도 + 중앙선 (OSM 이름·폭·차로). 골목은 회갈색 포장, 큰 길은 짙은 회색.
  const roads = (data.ways || []).filter((w) => w.pts?.length >= 2);
  const roadGrid = new CellGrid(24), rb = new GeoBuf({ uv: false, color: true }), paint = new GeoBuf({ uv: false, color: true });
  const paths = [];
  const named = new Set();
  for (const w of roads.slice().sort((a, b) => b.w - a.w)) {
    const car = CAR.has(w.k), y = car ? 0.055 : PED.has(w.k) ? 0.085 : 0.07;
    // 사옥 부지 안의 OSM 서비스 길은 사옥이 대신. 길이 부지 안에서 시작하거나 끝나면 한 조각씩 거른다.
    const pieces = []; let cur = [];
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], b = w.pts[i], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (hqSite(mx, mz, 0)) { if (cur.length > 1) pieces.push(cur); cur = []; continue; }
      if (!cur.length) cur.push(a); cur.push(b);
      const r = w.w / 2; roadGrid.add({ a, b, r, w }, Math.min(a[0], b[0]) - r - 4, Math.min(a[1], b[1]) - r - 4, Math.max(a[0], b[0]) + r + 4, Math.max(a[1], b[1]) + r + 4);
    }
    if (cur.length > 1) pieces.push(cur);
    for (const pts of pieces) {
      // 보도(큰 길은 양쪽 3m), 차도 위에 겹쳐 깐다
      if (car) ribbon(rb, pts, w.w + 6, 0.04, hex3('#d0ccc3'));
      ribbon(rb, pts, w.w, y, hex3(roadColor(w)));
      if (car && w.w >= 9 && !w.ow) for (const s of [-0.18, 0.18]) ribbon(paint, offset(pts, s), 0.13, y + 0.007, hex3('#edc357'));
      if (car && (w.ow || w.w >= 12)) for (const seg of dashed(offset(pts, w.ow ? 0 : w.w * 0.25))) ribbon(paint, seg, 0.13, y + 0.009, hex3('#f1f1ed'));
      if (car) for (const sg of [-1, 1]) { const side = offset(pts, sg * (w.w / 2 + 1.6)); paths.push(withCum({ pts: side, w: 1.6, weight: 3, y: 0.055 })); }
      else if (pts.length > 1 && !['steps', 'cycleway'].includes(w.k)) paths.push(withCum({ pts, w: Math.min(3, w.w - 1), weight: w.n === '연무장길' ? 6 : 2, y: 0.07 }));
    }
    if (w.n && !named.has(w.n) && ['연무장길', '뚝섬로', '성수이로', '아차산로'].includes(w.n)) { const p = w.pts[Math.floor(w.pts.length / 2)]; addLabel(w.n + (w.ne ? ' · ' + w.ne : ''), p[0], p[1], 7, 350, 20); named.add(w.n); }
    await tick('ss-roads');
  }
  for (const [buf, name] of [[rb, 'seongsu-roads'], [paint, 'seongsu-road-paint']]) { const g = buf.build(); if (g) { const m = new THREE.Mesh(g, mat); m.name = name; root.add(m); } }
  const roadAt = (x, z, pad = 0) => roadGrid.query(x, z).find((s) => distToSeg(x, z, s.a[0], s.a[1], s.b[0], s.b[1]) <= s.r + pad)?.w || null;

  // 실제 OSM 필지. 높이가 없으면 낮은 공장·상가(2~5층); 큰 아파트는 OSM 층수 우선.
  const bldGrid = new CellGrid(24), blds = [], buckets = Array.from({ length: 9 }, () => []);
  for (const b of data.buildings || []) {
    if (!b.o || b.o.length < 3 || b.part || b.k === 'roof') continue;
    const cx = b.o.reduce((s, p) => s + p[0], 0) / b.o.length, cz = b.o.reduce((s, p) => s + p[1], 0) / b.o.length;
    if (!inApron(cx, cz) || hqSite(cx, cz, 2) || b.o.some(([x, z]) => { const [lx, lz] = local(x, z); return Math.abs(lx) < 22 && Math.abs(lz) < 18; })) continue;
    const ht = b.h || (b.lv ? b.lv * 3.2 + 0.6 : (b.k === 'industrial' || b.k === 'warehouse') ? 7 + hash01(b.id, 9) * 3 : 6 + Math.floor(hash01(b.id, 7) * 4) * 3.2);
    const top = Math.max(4, Math.min(120, ht)), base = b.mh || 0.02;
    const xs = b.o.map((p) => p[0]), zs = b.o.map((p) => p[1]), bb = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    const rec = { ...b, cx, cz, ht: top, bb, base };
    blds.push(rec); if (base < 2.5) bldGrid.add(rec, ...bb);
    const ix = Math.min(2, Math.max(0, Math.floor((cx - A.x0) / (A.x1 - A.x0) * 3))), iz = Math.min(2, Math.max(0, Math.floor((cz - A.z0) / (A.z1 - A.z0) * 3)));
    buckets[ix + iz * 3].push({ o: b.o, h: top, mh: base, k: b.k || (hash01(b.id, 3) < 0.6 ? 'commercial' : 'industrial') });
  }
  for (let i = 0; i < buckets.length; i++) {
    if (!buckets[i].length) continue;
    const meshes = await buildingMeshesAsync(buckets[i], 433 + i * 13, slicer);
    for (const m of meshes) { m.name = 'seongsu-buildings-' + i; root.add(m); }
    await tick('ss-buildings');
  }
  const bldAt = (x, z, pad = 0.35) => {
    for (const b of bldGrid.query(x, z)) {
      if (x < b.bb[0] - pad || x > b.bb[2] + pad || z < b.bb[1] - pad || z > b.bb[3] + pad) continue;
      if (pointInRing(x, z, b.o)) return b;
      for (let i = 0; i < b.o.length; i++) { const a = b.o[i], c = b.o[(i + 1) % b.o.length]; if (distToSeg(x, z, a[0], a[1], c[0], c[1]) < pad) return b; }
    }
    return null;
  };

  // 상점 전면: 가장 가까운 길을 향하는 벽에만(이웃 건물과 맞댄 벽엔 안 붙인다). 간판은 fictional Korean names 아틀라스(프리뷰와 같은 것).
  const sb = new Builder(), props = new Builder();
  let signN = 0;
  for (const b of blds) {
    if (b.ht > 40 || b.base > 1 || area(b.o) < 30) continue;
    let edge = null, best = 40;
    for (let i = 0; i < b.o.length; i++) {
      const a = b.o[i], c = b.o[(i + 1) % b.o.length], x = (a[0] + c[0]) / 2, z = (a[1] + c[1]) / 2, L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 3 || L > 100) continue;
      let nx = (c[1] - a[1]) / L, nz = -(c[0] - a[0]) / L;
      if ((x - b.cx) * nx + (z - b.cz) * nz < 0) { nx *= -1; nz *= -1; }
      if (bldAt(x + nx * 1.0, z + nz * 1.0, 0.1)) continue;
      for (const r of roadGrid.query(x + nx * 6, z + nz * 6)) { const d = distToSeg(x, z, r.a[0], r.a[1], r.b[0], r.b[1]) - r.r; if (d < best && d > -2) { edge = { x, z, L, nx, nz }; best = d; } }
    }
    if (!edge || best > 10) continue;
    const e = edge, n = signN++ % 16, w = Math.min(e.L * 0.68, 7.0), h = w / 4, ry = Math.atan2(e.nx, e.nz);
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, ((n % 4) + uv.getX(k)) / 4, 1 - (((n / 4) | 0) + 1 - uv.getY(k)) / 4);
    sb.add('signs', g, { x: e.x + e.nx * 0.07, y: 3.4, z: e.z + e.nz * 0.07, ry }); g.dispose();
    // 큰 쇼윈도(형상 단순, 빛은 재질) + 차양
    sb.box('frame', Math.min(4.0, e.L * 0.6), 2.2, 0.04, { x: e.x + e.nx * 0.05, y: 1.35, z: e.z + e.nz * 0.05, ry, color: '#1e292c' });
    if (hash01(b.id, 4) < 0.65) sb.box('paint', w + 0.2, 0.10, 1.1, { x: e.x + e.nx * 0.5, y: 2.7, z: e.z + e.nz * 0.5, ry, rx: 0.1, color: ['#273a31', '#f2e9d7', '#684a3d', '#303541'][b.id % 4] });
    if (hash01(b.id, 6) < 0.45) { props.cyl('metal', 0.75, 0.75, 1.3, { x: b.cx, y: b.ht + 0.65, z: b.cz, color: '#b7c1c6' }, 8); props.box('paint', 1, 0.7, 0.6, { x: b.cx + 1.4, y: b.ht + 0.35, z: b.cz, color: '#d7d5cd' }); }
    await tick('ss-signs');
  }
  for (const m of sb.build(hq.mats)) { m.name = 'seongsu-shopfronts-' + m.userData.key; root.add(m); }

  // 가로수·가로등 (큰 길 양쪽, 28m마다). 고가 아래에도 서는 얇은 가로수(명동과 같은 단순 다면체).
  const treeSpots = [];
  for (const w of roads) {
    if (!CAR.has(w.k)) continue;
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], c = w.pts[i], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 18) continue;
      const nx = -dz / L, nz = dx / L;
      for (let s = 12; s < L - 3; s += 28) for (const sg of [-1, 1]) {
        const x = a[0] + dx * s / L + nx * sg * (w.w / 2 + 2.2), z = a[1] + dz * s / L + nz * sg * (w.w / 2 + 2.2);
        if (!inApron(x, z, -4) || hqSite(x, z, 2) || bldAt(x, z, 1.1) || roadAt(x, z, -0.2)) continue;
        if (treeSpots.some((p) => Math.hypot(p[0] - x, p[1] - z) < 12)) continue;
        treeSpots.push([x, z]); props.cyl('paint', 0.09, 0.15, 3.1, { x, y: 1.55, z, color: '#6e5943' }, 5); props.add('leaf', new THREE.IcosahedronGeometry(1.55, 0), { x, y: 4.0, z, sy: 1.2, color: ['#77934a', '#97a548', '#6f8b48'][treeSpots.length % 3] });
        if (treeSpots.length % 2 === 0) { const lx = x + nx * 0.6, lz = z + nz * 0.6; props.cyl('metal', 0.065, 0.09, 7.2, { x: lx, y: 3.6, z: lz }, 6); props.box('lamp', 0.8, 0.12, 0.25, { x: lx, y: 7.15, z: lz, ry: Math.atan2(dx, dz), color: '#f5e2b2' }); }
      }
    }
  }
  // 2호선 고가 (OSM railway=subway, bridge=yes). 교각·상판·녹색 거더·레일 — 땅에서 8m, 밑으로 걸을 수 있다.
  for (const r of data.rail || []) {
    if (!r.br || r.k !== 'subway') continue;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], c = r.pts[i], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz), ry = Math.atan2(dx, dz);
      if (L < 0.1) continue;
      const x = (a[0] + c[0]) / 2, z = (a[1] + c[1]) / 2;
      props.box('paint', 4.4, 1.1, L + 0.1, { x, y: 7.8, z, ry, color: '#627c67' });
      props.box('paint', 4.3, 0.25, L + 0.1, { x, y: 8.5, z, ry, color: '#b6b9b2' });
      for (const sg of [-1, 1]) props.box('metal', 0.08, 0.12, L, { x: x + Math.cos(ry) * sg * 0.72, y: 8.68, z: z - Math.sin(ry) * sg * 0.72, ry, color: '#51565a' });
      for (let s = 5; s < L; s += 24) { const px = a[0] + dx * s / L, pz = a[1] + dz * s / L; props.box('paint', 1.0, 7.2, 1.2, { x: px, y: 3.6, z: pz, ry, color: '#b4b5ae' }); }
    }
  }
  // 성수역 고가 승강장(지상 시각 모델, 대합실·승강장은 기존 subway 모듈이 담당)
  const st = data.station;
  let sr = 0, sd = Infinity; // 역 중심에서 가장 가까운 고가 구간 방향
  for (const r of data.rail || []) for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], c = r.pts[i], d = distToSeg(st.x, st.z, a[0], a[1], c[0], c[1]); if (d < sd) { sd = d; sr = Math.atan2(c[0] - a[0], c[1] - a[1]); } }
  props.box('paint', 13, 1, 125, { x: st.x, y: 8.8, z: st.z, ry: sr, color: '#8f9991' });
  props.box('paint', 15.2, 1.1, 128, { x: st.x, y: 13.2, z: st.z, ry: sr, color: '#ced4cc' });
  for (const s of [-1, 1]) props.box('frame', 0.16, 3.4, 121, { x: st.x + Math.cos(sr) * s * 6.3, y: 10.7, z: st.z - Math.sin(sr) * s * 6.3, ry: sr, color: '#496a50' });
  for (const m of props.build(hq.mats)) { m.name = 'seongsu-street-' + m.userData.key; root.add(m); }
  // 역 외벽 이름 (먼 거리에서 보이는 글자; 실제 계단 입구는 subway/entrance.js가 그린다)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(19, 2.2), new THREE.MeshBasicMaterial({ map: labelTex('성수  Seongsu', { w: 768, h: 128, bg: '#00a84d', fg: '#ffffff', font: '800 58px "Noto Sans KR", sans-serif', sub: '2  ·  HAUS NOWHERE SEOUL ↘', subFont: '500 25px sans-serif' }), toneMapped: false }));
  sign.position.set(st.x + Math.cos(sr) * 6.4, 11.0, st.z - Math.sin(sr) * 6.4); sign.rotation.y = Math.atan2(Math.cos(sr), -Math.sin(sr)); sign.name = 'seongsu-station-sign'; root.add(sign);
  await tick('ss-props');

  // HQ와 성수역 사이의 실제 길 위 사람들. 거리 풀(폰 50/PC90)과 HQ 풀(직원10/관람객25/보행자18)은 각각 부품 인스턴싱.
  const streetNpc = q.get('ssnpc') === '0' ? null : createMyeongdongNpc({ parent: root, paths: paths.filter((p) => p.L > 8), heightAt: () => 0.055, mobile, seed: 20261121, name: 'seongsuCrowd', pools: { peds: mobile ? 45 : 80 }, getHour: () => 15 });
  const ci = hqCrowdInput(toWorld, { rot: H.ry });
  const hqNpc = q.get('hnnpc') === '0' ? null : createMyeongdongNpc({ parent: root, paths: ci.paths.map(withCum), vendors: ci.vendors, promoters: ci.promoters, heightAt: () => 0.04, mobile, seed: 433, name: 'hnCrowd', looks: { promo: staffLook, vendor: guestLook }, pools: { peds: mobile ? 12 : 18, vendors: ci.vendors.length, promoters: ci.promoters.length }, getHour: () => 15, cull: (y) => hq.showY(y) });
  await tick('ss-npc');

  // 바닥·충돌. 반경 밖은 다른 섬/코리더가 담당. HQ에서는 현재 refY 근처의 바닥(층·에스컬레이터·계단)을 고른다.
  let lastY = 0.04, lastP = null, t = 0;
  function surfaceY(x, z, refY = 0.04) {
    if (!inApron(x, z, 0.5)) return null;
    const [lx, lz] = local(x, z);
    const cur = Number.isFinite(refY) ? refY : 0.04;
    if (!hqSite(x, z, 0)) return 0.04;
    // 층 사이 구멍(에스컬레이터·계단 샤프트)에 서면 아래 바닥으로 — 1m씩 내려가며 찾는다
    for (let r = cur; r > -1.5; r -= 1) { const y = hq.physics.support(lx, lz, r); if (y != null) return y; }
    return 0.04;
  }
  const unregSurface = terrain?.addGroundSurface?.((x, z, refY) => surfaceY(x, z, refY), { authoritative: true });
  function isBlocked(x, z, r = 0.35) {
    if (!inApron(x, z, 1)) return false;
    if (bldAt(x, z, r)) return true;
    if (hqSite(x, z, 1)) { const [lx, lz] = local(x, z); if (hq.physics.blocked(lx, lz, lastY)) return true; }
    return false;
  }
  let night = false;
  const unwatch = watchEvening((on) => { night = !!on; hq.setNight(night); });
  const mini = {
    roads: roads.map((w) => ({ k: w.k, p: w.pts, w: w.w })),
    buildings: blds.map((b) => ({ o: b.o })).concat(H.o ? [{ o: H.o }] : []),
    parks: (data.areas || []).filter((a) => /park|garden|grass|wood/.test(a.k)).map((a) => ({ o: a.o })),
    water: [], waterLines: [],
    station: { x: st.x, z: st.z, exits: data.exits.map((e) => ({ x: e.x, z: e.z, ref: e.ref })) },
  };
  root.visible = true;
  return {
    root, bounds: B, boxes: [B], spawn: { ...SEONGSU_SPAWN }, spawnY: () => SEONGSU_SPAWN.y, face: H.ry,
    mini, hq, station: st, roads,
    owns: (x, z) => inSeongsu(x, z), ownDist: (x, z) => distBox(B, x, z),
    heightAt: (x, z) => inApron(x, z) ? 0.04 : null, surfaceY, groundHeight: surfaceY, isBlocked,
    blockedBy: (x, z, r) => isBlocked(x, z, r) ? 'seongsu' : null,
    walkWays: () => roads,
    get hqFloor() { if (!lastP) return 0; const [x, z] = local(lastP.x, lastP.z); return hq.inFoot(x, z) ? floorOfY(lastP.y) : 0; },
    camInside(x, z, y) { const [lx, lz] = local(x, z); return y < 23.2 && hq.inFoot(lx, lz) && !hq.physics.camBlocked(lx, y, lz, hq.ceilingAt(lx, lz, y)); },
    camBlocked(x, y, z) { const [lx, lz] = local(x, z); return !hq.inFoot(lx, lz) || hq.physics.camBlocked(lx, y, lz, hq.ceilingAt(lx, lz, y)); }, // 실내에 선 플레이어 카메라: 바깥 곡면 벽 밖으로도 나가지 않게
    local, toWorld,
    ensureInterior: () => hq.ensureInterior(),
    tickPlayer(dt, player, cam, sky, camera) {
      lastP = player?.position || null; if (!lastP) return;
      lastY = lastP.y;
      if (!syncLandmarkDormant(root, distBox(A, lastP.x, lastP.z))) { streetNpc?.sleep(); hqNpc?.sleep(); return; }
      const [lx, lz] = local(lastP.x, lastP.z);
      if (Math.hypot(lx, lz) < 160) void hq.ensureInterior();
      const cp = camera?.position || lastP, [cx, cz] = local(cp.x, cp.z);
      hq.cull(cx, cp.y, cz);
    },
    update(dt) {
      if (!root.visible) return; t += Math.min(dt, 0.1); hq.update(t);
      if (!lastP || distBox(A, lastP.x, lastP.z) > 150) { streetNpc?.sleep(); hqNpc?.sleep(); return; }
      streetNpc?.update(dt, lastP.x, lastP.z);
      const [lx, lz] = local(lastP.x, lastP.z);
      if (Math.hypot(lx, lz) < 135) hqNpc?.update(dt, lastP.x, lastP.z); else hqNpc?.sleep();
    },
    setNight(on) { night = !!on; hq.setNight(night); },
    stats() { return { buildings: blds.length, ways: roads.length, signs: signN, trees: treeSpots.length, hqNpcs: hqNpc?.stats || null, streetNpcs: streetNpc?.stats || null }; },
    dispose() { unwatch?.(); unregSurface?.(); streetNpc?.dispose(); hqNpc?.dispose(); root.removeFromParent(); for (const l of labels) l?.remove?.(); },
  };
}
