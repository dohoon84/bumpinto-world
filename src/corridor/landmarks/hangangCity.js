// [hangang] 반포·서래·용산 가장자리 OSM 건물 압출 + 올림픽대로·강변북로 + 스카이라인.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildingMeshes } from '../tileMesh.js';
import { inWater, centroid } from './hangangCoords.js';

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
  const exprGeos = [];
  for (const w of osm?.ways || []) {
    const n = w.name || '';
    if (n !== '올림픽대로' && n !== '강변북로') continue;
    if (!w.pts || w.pts.length < 2) continue;
    const width = Math.max(12, w.w || 15.6);
    const elevated = w.bridge === 'yes' || Number(w.layer) >= 1;
    const geo = ribbon(w.pts, width, (x, z) => {
      const g = heightAt(x, z) ?? lv.waterY;
      if (inWater(x, z, osm?.water)) return lv.waterY + 13;
      if (elevated) return Math.max(g + 1.4, lv.waterY + 11);
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
    const geo = new THREE.CylinderGeometry(rad, rad, 72, 64, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      map: skylineTex(),
      side: THREE.BackSide,
      fog: true,
      transparent: true,
      opacity: 0.92,
    });
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, (lv.waterY ?? -43) + 28, cz);
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
