// [hangang] 한강남자전거길·한강북자전거길·잠수교 보행로·나들목·산책로를 지형/데크 위에 깐다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fixNormalsUp } from '../../world.js';
import { projectOnLine, pointInRing, inWater } from './hangangCoords.js';
import { jamsuDeckY, banpoDeckY } from './hangangTerrain.js';

function resample(pts, step = 3.2) {
  if (!pts || pts.length < 2) return pts || [];
  const out = [[pts[0][0], pts[0][1]]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let ax = out[out.length - 1][0], az = out[out.length - 1][1];
    const bx = pts[i][0], bz = pts[i][1];
    let dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-4) continue;
    while (acc + L >= step) {
      const t = (step - acc) / L;
      ax += dx * t; az += dz * t;
      out.push([ax, az]);
      dx = bx - ax; dz = bz - az; L = Math.hypot(dx, dz);
      acc = 0;
    }
    acc += L;
  }
  const last = pts[pts.length - 1];
  const p = out[out.length - 1];
  if (Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.4) out.push([last[0], last[1]]);
  else { p[0] = last[0]; p[1] = last[1]; }
  return out;
}

export function drapedRibbonGeo(pts, width, heightFn, dy = 0.04) {
  const n = pts.length;
  if (n < 2) return null;
  const pos = [], idx = [];
  const widthAt = (i) => (Array.isArray(width) ? width[Math.min(i, width.length - 1)] : width);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const hw = widthAt(i) / 2;
    const lx = p[0] - dz * hw, lz = p[1] + dx * hw;
    const rx = p[0] + dz * hw, rz = p[1] - dx * hw;
    const ly = heightFn(lx, lz), ry = heightFn(rx, rz);
    if (ly == null && ry == null) return null;
    pos.push(lx, (ly ?? ry) + dy, lz, rx, (ry ?? ly) + dy, rz);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return fixNormalsUp(g);
}

function nearAny(x, z, rings, pad) {
  for (const r of rings) {
    if (!r || r.length < 2) continue;
    if (r.length >= 3 && pointInRing(x, z, r)) return true;
    const q = projectOnLine(x, z, r);
    if (q && q.dist < pad) return true;
  }
  return false;
}

function keepWay(w, ctx) {
  const n = w.name || '';
  const k = w.k;
  if (k === 'cycleway') return true;
  if (n.includes('자전거') || n.includes('나들목') || n === '잠수교') return true;
  if (k === 'bridge' && (n === '잠수교' || n === '반포대교')) return false; // outline rendered as deck
  if ((k === 'primary' || k === 'primary_link') && w.layer === '2' && (n === '반포대로' || n === '녹사평대로')) return true;
  if (k === 'steps' || k === 'path' || k === 'pedestrian') {
    return nearAny(w.pts[0][0], w.pts[0][1], ctx.near, 90) || nearAny(w.pts[w.pts.length - 1][0], w.pts[w.pts.length - 1][1], ctx.near, 90);
  }
  if (k === 'footway') {
    return nearAny(w.pts[0][0], w.pts[0][1], ctx.near, 70) || nearAny(w.pts[w.pts.length - 1][0], w.pts[w.pts.length - 1][1], ctx.near, 70);
  }
  return false;
}

function kindOf(w) {
  const n = w.name || '';
  if (w.k === 'cycleway' || n.includes('자전거') || n === '잠수교') return 'bike';
  if (w.layer === '2' && (n === '반포대로' || n === '녹사평대로')) return 'upper';
  if (w.k === 'steps') return 'steps';
  return 'walk';
}

export function createHangangPaths({ parent, osm, land }) {
  const group = new THREE.Group();
  group.name = 'hangang-paths';
  parent.add(group);
  const lv = land.levels;
  const heightAt = land.heightAt;
  const jamsuRing = osm?.jamsu?.outline?.pts;
  const banpoRing = osm?.banpo?.outline?.pts;
  const park = osm?.park?.ring?.pts;
  const near = [jamsuRing, banpoRing, park, osm?.jamsu?.centerline?.pts].filter(Boolean);
  const ctx = { near };

  function surfaceAt(x, z, kind, w) {
    if (jamsuRing && pointInRing(x, z, jamsuRing)) return jamsuDeckY(x, z, osm, lv);
    if (kind === 'upper' || (banpoRing && pointInRing(x, z, banpoRing) && (w?.layer === '2' || w?.name === '반포대로' || w?.name === '녹사평대로'))) {
      return banpoDeckY(x, z, osm, lv, heightAt);
    }
    // 잠수교 중심선 근처는 하부 데크
    const cl = osm?.jamsu?.centerline?.pts;
    if (cl) {
      const q = projectOnLine(x, z, cl);
      if (q && q.dist < 8) return jamsuDeckY(x, z, osm, lv);
    }
    if (w?.tunnel === 'yes') {
      const g = heightAt(x, z);
      return g == null ? null : g - 1.6;
    }
    return heightAt(x, z);
  }

  const buckets = { bike: [], walk: [], steps: [], upper: [] };
  const kept = [];
  for (const w of osm?.ways || []) {
    if (!w.pts || w.pts.length < 2) continue;
    if (!keepWay(w, ctx)) continue;
    const kind = kindOf(w);
    const pts = resample(w.pts, kind === 'bike' ? 3.0 : 3.6);
    if (pts.length < 2) continue;
    const width = Math.max(2.2, Math.min(16, w.w || (kind === 'bike' ? 4 : 2.4)));
    const geo = drapedRibbonGeo(pts, width, (x, z) => surfaceAt(x, z, kind, w), kind === 'upper' ? 0.06 : 0.05);
    if (!geo) continue;
    buckets[kind].push(geo);
    kept.push(w);
  }

  const colors = { bike: '#4e7a45', walk: '#b7b1a6', steps: '#9a9084', upper: '#5a5d61' };
  const mats = {};
  for (const [kind, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    const mat = new THREE.MeshLambertMaterial({ color: colors[kind], side: THREE.DoubleSide });
    mats[kind] = mat;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    mesh.name = 'hangang-path-' + kind;
    group.add(mesh);
  }

  function floorY(x, z, refY = Infinity) {
    let best = null;
    const cap = Number.isFinite(refY) ? refY + 0.55 : Infinity;
    // 데크는 다리가 담당. 여기선 길 위만.
    for (const w of kept) {
      const q = projectOnLine(x, z, w.pts);
      if (!q || q.dist > (w.w || 3) * 0.55 + 0.4) continue;
      const kind = kindOf(w);
      const y = surfaceAt(q.x, q.z, kind, w);
      if (y == null || y > cap) continue;
      if (best == null || y > best) best = y;
    }
    return best;
  }

  function setNight(v) {
    const t = Math.max(0, Math.min(1, v));
    if (mats.bike) mats.bike.color.setRGB(0.18 + 0.12 * (1 - t), 0.32 + 0.16 * (1 - t), 0.16 + 0.11 * (1 - t));
    if (mats.walk) mats.walk.color.setRGB(0.45 * (1 - t) + 0.18 * t, 0.42 * (1 - t) + 0.16 * t, 0.38 * (1 - t) + 0.14 * t);
    if (mats.upper) mats.upper.color.setRGB(0.22 + 0.13 * (1 - t), 0.23 + 0.13 * (1 - t), 0.24 + 0.14 * (1 - t));
  }

  return { group, floorY, setNight, kept };
}
