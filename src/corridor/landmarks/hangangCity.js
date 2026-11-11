// [hangang] 반포·서래·용산 가장자리 OSM 건물 압출 + 올림픽대로·강변북로 + 스카이라인.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildingMeshes } from '../tileMesh.js';
import { inWater, centroid, projectOnLine, polylineLen } from './hangangCoords.js';

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

export function createHangangCity({ parent, osm, land } = {}) {
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
  // 북단 강변북로는 이 clip 에서 점이 한강 폴리곤 안에 들어가 있다. 예전엔
  // 수면+13 m 로 올려 강 위 떠 있는 겹친 리본(매듭·z-fighting 흰 점)이 됐다.
  // 터널은 빼고, 같은 이름과 대부분 겹치면 건너뛰며, 고가 태그가 있을 때만 띄운다.
  // 고가 태그 없이 수면 안에 점이 많은 가닥은 그리지 않는다.
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
    // 이 clip 의 강변북로는 점이 한강 폴리곤 안에 들어가 있다(매핑 오차).
    // 고가 태그가 없으면 강 위 떠 있는 막대로 그리지 않는다.
    if (!elevated && tot && wetN / tot > 0.45) continue;
    accepted.push(w);
    const width = Math.max(6.5, Math.min(22, w.w || 15.6));
    const geo = ribbon(pts, width, (x, z) => {
      const g = heightAt(x, z) ?? lv.waterY;
      if (elevated) return Math.max(g + 6.5, lv.waterY + 12);
      return g + 0.14;
    }, 0.1);
    if (geo) exprGeos.push(geo);
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

  // 스카이라인 링 — 박스 바깥 원경
  const b = land.bounds;
  if (b) {
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
  if (b) {
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
  }

  return { group, setNight, buildingCount: bld.length };
}
