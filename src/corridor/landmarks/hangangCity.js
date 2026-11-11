// [hangang] 반포·서래·용산 가장자리 OSM 건물 압출 + 올림픽대로·강변북로 + 스카이라인.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildingMeshes } from '../tileMesh.js';
import { inWater, centroid, projectOnLine, polylineLen, resamplePolyline } from './hangangCoords.js';

function skylineTex() {
  const W = 2048, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const d = c.getContext('2d');
  const g = d.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a1020'); g.addColorStop(0.45, '#141a28'); g.addColorStop(1, '#1a1e26');
  d.fillStyle = g; d.fillRect(0, 0, W, H);
  let s = 7919;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 180; i++) {
    const x = rnd() * W;
    const w = 6 + rnd() * 28;
    const h = 36 + rnd() * (70 + (i % 11 === 0 ? 80 : 0));
    d.fillStyle = `rgb(${18 + rnd() * 16},${20 + rnd() * 14},${26 + rnd() * 18})`;
    d.fillRect(x, H - h, w, h);
    const cols = Math.max(1, Math.floor(w / 5)), rows = Math.max(2, Math.floor(h / 7));
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      if (rnd() > 0.4) continue;
      const warm = rnd() > 0.28;
      d.fillStyle = warm
        ? `rgba(255,${190 + rnd() * 40},${120 + rnd() * 40},${0.4 + rnd() * 0.45})`
        : `rgba(${160 + rnd() * 40},${190 + rnd() * 40},255,${0.32 + rnd() * 0.4})`;
      d.fillRect(x + 1 + k * 5, H - h + 4 + r * 7, 2.4, 3.4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function ribbon(pts, width, yFn, dy = 0.08) {
  if (!pts || pts.length < 2) return null;
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], p = pts[i];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const hw = width / 2;
    const y = (yFn(p[0], p[1]) ?? 0) + dy;
    pos.push(p[0] - dz * hw, y, p[1] + dx * hw, p[0] + dz * hw, y, p[1] - dx * hw);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}


// 점마다 높이(ys)가 정해진 폴리라인을 옆으로 off 만큼 밀어 세로 띠(y+dyA..y+dyB)를 만든다.
// off=0, dyA=dyB 이면 수평 띠(폭 width)다.
function laneNormals(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    out.push([-dz / L, dx / L]);
  }
  return out;
}
function flatStrip(pts, ys, width, dy) {
  const nr = laneNormals(pts), pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const [nx, nz] = nr[i], p = pts[i], hw = width / 2, y = ys[i] + dy;
    pos.push(p[0] + nx * hw, y, p[1] + nz * hw, p[0] - nx * hw, y, p[1] - nz * hw);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function wallStrip(pts, ys, off, dyA, dyB) {
  const nr = laneNormals(pts), pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const [nx, nz] = nr[i], p = pts[i];
    const x = p[0] + nx * off, z = p[1] + nz * off;
    pos.push(x, ys[i] + dyA, z, x, ys[i] + dyB, z);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createHangangCity({ parent, osm, land, expressXMax = null } = {}) {
  const group = new THREE.Group();
  group.name = 'hangang-city';
  parent.add(group);
  const heightAt = land.heightAt;
  const lv = land.levels;
  const mats = [];

  const bld = [];
  for (const b of osm?.buildings || []) {
    if (!b.o || b.o.length < 4) continue;
    const c = centroid(b.o);
    if (inWater(c.x, c.z, osm?.water)) continue;
    const g = heightAt(c.x, c.z);
    if (g == null || g < lv.waterY + 1.0) continue;
    let wet = 0;
    for (const pt of b.o) if (inWater(pt[0], pt[1], osm?.water)) wet++;
    if (wet > b.o.length * 0.3) continue;
    bld.push({ o: b.o, holes: b.holes || [], h: b.h || 10, mh: g, k: b.k || 'yes' });
  }
  if (bld.length) {
    for (const m of buildingMeshes(bld, 2711)) {
      group.add(m);
      if (m.material) mats.push(m.material);
    }
  }

  // 올림픽대로 · 강변북로
  // OSM: 남단 긴 두 가닥(각 폭 19.1 m)은 올림픽대로 양방향 — 지형에 붙인다.
  // 북단 강변북로는 조립된 한강 링 바깥(육지)에 있다. 고가 태그가 있으면 띄우고
  // 없으면 지형에 붙인다. 터널은 빼며, 같은 이름과 대부분 겹치면 건너뛴다.
  // 고가 태그 없이 수면 안에 점이 많은 가닥만 그리지 않는다.
  const exprGeos = [];
  const accepted = [];
  const candidates = (osm?.ways || []).filter((w) => {
    const n = w.name || '';
    if (n !== '올림픽대로' && n !== '강변북로') return false;
    if (!w.pts || w.pts.length < 2) return false;
    if (w.tunnel === 'yes' || Number(w.layer) < 0) return false;
    return polylineLen(w.pts) >= 40;
  }).sort((a, b) => {
    const ea = (a.bridge === 'yes' || Number(a.layer) >= 1) ? 1 : 0;
    const eb = (b.bridge === 'yes' || Number(b.layer) >= 1) ? 1 : 0;
    if (eb !== ea) return eb - ea;
    return polylineLen(b.pts) - polylineLen(a.pts);
  });
  // 고가(bridge=yes / layer≥1) 가닥: 두께 없는 띠는 아래에서 보면 회색 벽, 옆에서 보면
  // 하늘에 뜬 검은 선이었다. 상판(두께)·옆 거더면·난간·교각으로 만들고, 양 끝은
  // 지형 높이에서 최대 6 % 경사로 올라가게 해 평면 도로와 이어 붙인다.
  const pathWays = (osm?.ways || []).filter((w) => w.pts?.length >= 2
    && ['cycleway', 'footway', 'path', 'pedestrian', 'track', 'steps'].includes(w.k));
  const deckTopGeos = [], fasciaGeos = [], soffitGeos = [], pierGeos = [];
  const DECK_T = 1.1, PARAPET_H = 1.0, CLEAR = 6.0, GRADE = 0.06;
  function elevatedDeck(run, width) {
    const pts = resamplePolyline(run, 6);
    if (pts.length < 2) return;
    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = s[s.length - 1];
    const nr = laneNormals(pts);
    const hw = width / 2;
    // 상판 폭 전체(가운데·양 끝) 중 가장 높은 땅을 기준으로 다리 밑 높이를 잡는다.
    const gs = pts.map((p, i) => {
      let g = -Infinity;
      for (const o of [0, -hw, hw]) {
        const y = heightAt(p[0] + nr[i][0] * o, p[1] + nr[i][1] * o);
        if (y != null && y > g) g = y;
      }
      return Number.isFinite(g) ? g : lv.waterY;
    });
    const yA = gs[0] + 0.14, yB = gs[gs.length - 1] + 0.14;
    let ys = pts.map((p, i) => Math.max(yA + (yB - yA) * (s[i] / (L || 1)), gs[i] + CLEAR));
    // 이동 평균으로 지형 요철을 지운 뒤 끝 경사 제한을 건다.
    for (let pass = 0; pass < 3; pass++) {
      ys = ys.map((_, i) => {
        let a = 0, n = 0;
        for (let k = Math.max(0, i - 3); k <= Math.min(ys.length - 1, i + 3); k++) { a += ys[k]; n++; }
        return Math.max(a / n, gs[i] + 0.14);
      });
    }
    ys = ys.map((y, i) => Math.min(y, yA + GRADE * s[i], yB + GRADE * (L - s[i])));
    ys = ys.map((y, i) => Math.max(y, gs[i] + 0.14));
    deckTopGeos.push(flatStrip(pts, ys, width, 0.1));
    soffitGeos.push(flatStrip(pts, ys, width, 0.1 - DECK_T));
    for (const side of [-1, 1]) {
      fasciaGeos.push(wallStrip(pts, ys, side * hw, 0.1 - DECK_T, 0.1 + PARAPET_H));
      fasciaGeos.push(wallStrip(pts, ys, side * (hw - 0.3), 0.1, 0.1 + PARAPET_H));
    }
    for (let d = 14; d < L - 8; d += 28) {
      let i = 1;
      while (i < s.length - 1 && s[i] < d) i++;
      const lift = ys[i] - DECK_T - gs[i];
      if (lift < 3.2) continue;
      for (const side of [-1, 1]) {
        const off = side * Math.max(1.5, hw - 2.0);
        const px = pts[i][0] + nr[i][0] * off, pz = pts[i][1] + nr[i][1] * off;
        let onPath = false;
        for (const w of pathWays) {
          const q = projectOnLine(px, pz, w.pts);
          if (q && q.dist < (w.w || 3) / 2 + 1.6) { onPath = true; break; }
        }
        if (onPath) continue;
        const gy = heightAt(px, pz) ?? gs[i];
        const h = ys[i] + 0.1 - DECK_T - gy + 0.4;
        if (h < 2) continue;
        const pg = new THREE.BoxGeometry(1.3, h, 1.3);
        pg.translate(px, gy - 0.4 + h / 2, pz);
        pierGeos.push(pg);
      }
    }
  }

  for (const w of candidates) {
    const pts = w.pts;
    let hit = 0, n = 0;
    for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 12))) {
      n++;
      for (const other of accepted) {
        const q = projectOnLine(pts[i][0], pts[i][1], other.pts);
        if (q && q.dist < 11) { hit++; break; }
      }
    }
    if (n && accepted.length && hit / n > 0.62) continue;
    const elevated = w.bridge === 'yes' || Number(w.layer) >= 1;
    let wetN = 0, tot = 0;
    for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 16))) {
      tot++;
      if (inWater(pts[i][0], pts[i][1], osm?.water)) wetN++;
    }
    // 수면 안에 점이 많은 무태그 가닥은 그리지 않는다(강 위 뜬 막대 방지).
    if (!elevated && tot && wetN / tot > 0.45) continue;
    accepted.push(w);
    const width = Math.max(6.5, Math.min(22, w.w || 15.6));
    // DEM 밖(heightAt null)이나 expressXMax 동쪽은 그리지 않는다. 예전에는 1구간 DEM 밖
    // 올림픽대로가 수면 높이(−43 m)로 합수부까지 깔려 2구간 둔치 아래 검은 판이 되었다.
    const runs = [];
    let run = [];
    for (const p of pts) {
      const ok = heightAt(p[0], p[1]) != null && (expressXMax == null || p[0] <= expressXMax);
      if (ok) run.push(p);
      else { if (run.length >= 2) runs.push(run); run = []; }
    }
    if (run.length >= 2) runs.push(run);
    for (const r of runs) {
      if (elevated) { elevatedDeck(r, width); continue; }
      const geo = ribbon(r, width, (x, z) => (heightAt(x, z) ?? lv.waterY) + 0.14, 0.1);
      if (geo) exprGeos.push(geo);
    }
  }
  if (exprGeos.length) {
    const merged = exprGeos.length === 1 ? exprGeos[0] : mergeGeometries(exprGeos, false);
    const mat = new THREE.MeshLambertMaterial({ color: '#5c6168', side: THREE.DoubleSide });
    mats.push(mat);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'hangang-express';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const deckMats = [];
  const deckParts = [
    [deckTopGeos, '#5c6168', 'hangang-express-deck'],
    [soffitGeos, '#7a7d80', 'hangang-express-soffit'],
    [fasciaGeos, '#a9acae', 'hangang-express-fascia'],
    [pierGeos, '#8f9396', 'hangang-express-piers'],
  ];
  for (const [geos, color, name] of deckParts) {
    if (!geos.length) continue;
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; }), false);
    const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    mats.push(mat);
    deckMats.push([mat, new THREE.Color(color)]);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = name === 'hangang-express-piers';
    group.add(mesh);
  }

  // 스카이라인 링 — 박스 바깥 원경. hap 박스는 수 km 라 스카이라인·치마를 올리면
  // 잠실 타일·1구간과 겹친다.
  const b = land.bounds;
  if (b && !osm?.meta?.skipSkyline) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const rad = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) * 0.55 + 120;
    const geo = new THREE.CylinderGeometry(rad, rad, 160, 64, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      map: skylineTex(),
      side: THREE.BackSide,
      fog: true,
      transparent: true,
      opacity: 0.92,
    });
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, (lv.waterY ?? -43) + 55, cz);
    mesh.name = 'hangang-skyline';
    group.add(mesh);
  }

  // 섬 가장자리가 허공으로 끊기지 않게 DEM 박스 아래 치마
  if (b && !osm?.meta?.skipSkyline) {
    const yb = (lv.waterY ?? -43) - 8;
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const geo = new THREE.BoxGeometry(w + 4, 10, d + 4);
    const mat = new THREE.MeshLambertMaterial({ color: '#3a3d38' });
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((b.x0 + b.x1) / 2, yb, (b.z0 + b.z1) / 2);
    mesh.name = 'hangang-skirt';
    group.add(mesh);
  }

  function setNight(v) {
    const t = Math.max(0, Math.min(1, v));
    for (const m of mats) {
      if (!m.color || m.map) continue;
    }
    // 밤에는 고가 콘크리트(거더면·난간·교각)가 낮 색 그대로 하얗게 뜨지 않게 어둡힌다.
    for (const [m, base] of deckMats) m.color.copy(base).multiplyScalar(1 - 0.62 * t);
  }

  return { group, setNight, buildingCount: bld.length };
}
