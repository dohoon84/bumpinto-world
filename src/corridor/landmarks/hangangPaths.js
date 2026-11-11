// [hangang] 한강남자전거길·한강북자전거길·잠수교 보행로·나들목·산책로를 지형/데크 위에 깐다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fixNormalsUp } from '../../world.js';
import { projectOnLine, pointInRing, inWater, jamsuDeckRing, JAMSU_DECK_WIDTH } from './hangangCoords.js';
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

function clipEastOf(pts, xmin) {
  if (xmin == null || !pts || pts.length < 2) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const prev = i ? pts[i - 1] : null;
    const cin = cur[0] >= xmin;
    const pin = prev ? prev[0] >= xmin : cin;
    if (prev && pin !== cin) {
      const t = (xmin - prev[0]) / ((cur[0] - prev[0]) || 1e-12);
      out.push([xmin, prev[1] + (cur[1] - prev[1]) * t]);
    }
    if (cin) out.push(cur);
  }
  return out.length >= 2 ? out : [];
}

function keepWay(w, ctx) {
  const n = w.name || '';
  const k = w.k;
  if (n === '잠수교') return false; // 회색 아스팔트 데크·보도가 그린다. 테라코타 자전거길 색을 쓰지 않는다.
  if (ctx.pathWestClip != null && (n === '한강남자전거길' || n === '한강 자전거길')) {
    const xs = (w.pts || []).map((p) => p[0]);
    if (xs.length && Math.max(...xs) < ctx.pathWestClip) return false;
  }
  if (k === 'cycleway') return true;
  if (n.includes('자전거') || n.includes('나들목')) return true;
  // 고가(bridge=yes / layer≥1) 올림픽대로는 hangangCity 가 교각 위 상판으로 그린다.
  // 지형에 깔면 다리 밑 자전거길 옆에 회색 판이 한 번 더 생긴다.
  if (n === '올림픽대로' && ctx.segment === 'hap') return !(w.bridge === 'yes' || Number(w.layer) >= 1);
  if (k === 'bridge' && (n === '잠수교' || n === '반포대교')) return false; // outline rendered as deck
  // layer=2 반포대로·녹사평대로 는 반포대교 데크 메시가 이미 그 차로다. 리본으로 다시 깔면
  // 잠수교 윤곽 안 높이와 반포 높이가 섞여 사이 공간을 가르는 회색 대각선이 된다.
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
  if (n === '잠수교') return 'walk';
  if (n === '올림픽대로') return 'trunk';
  if (w.k === 'cycleway' || n.includes('자전거')) return 'bike';
  if (w.layer === '2' && (n === '반포대로' || n === '녹사평대로')) return 'upper';
  if (w.k === 'steps') return 'steps';
  return 'walk';
}


function partsOutsideRing(pts, ring) {
  if (!ring) return [pts];
  const parts = [];
  let cur = [];
  for (const p of pts) {
    if (pointInRing(p[0], p[1], ring)) {
      if (cur.length >= 2) parts.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length >= 2) parts.push(cur);
  return parts;
}

export function createHangangPaths({ parent, osm, land }) {
  const group = new THREE.Group();
  group.name = 'hangang-paths';
  parent.add(group);
  const lv = land.levels;
  const heightAt = land.heightAt;
  const jamsuRing = jamsuDeckRing(osm) || osm?.jamsu?.outline?.pts;
  const banpoRing = osm?.banpo?.outline?.pts;
  const park = osm?.park?.ring?.pts;
  const near = [jamsuRing, banpoRing, park, osm?.jamsu?.centerline?.pts].filter(Boolean);
  if (osm?.meta?.segment === 'hap') {
    for (const pk of osm?.parks || []) if (pk.o?.length >= 3) near.push(pk.o);
  }
  const ctx = { near, pathWestClip: osm?.meta?.pathWestClip, segment: osm?.meta?.segment };

  function surfaceAt(x, z, kind, w) {
    if (kind === 'upper' || (w?.layer === '2' && (w?.name === '반포대로' || w?.name === '녹사평대로'))) {
      return banpoDeckY(x, z, osm, lv, heightAt);
    }
    if (jamsuRing && pointInRing(x, z, jamsuRing)) return jamsuDeckY(x, z, osm, lv);
    // 잠수교 중심선 근처는 하부 데크
    const cl = osm?.jamsu?.centerline?.pts;
    if (cl) {
      const q = projectOnLine(x, z, cl);
      if (q && q.dist < JAMSU_DECK_WIDTH / 2 + 0.5) return jamsuDeckY(x, z, osm, lv);
    }
    if (w?.tunnel === 'yes') {
      const pts = w.pts || [];
      if (pts.length >= 2) {
        const a = pts[0], b = pts[pts.length - 1];
        const ya = heightAt(a[0], a[1]);
        const yb = heightAt(b[0], b[1]);
        if (ya != null && yb != null) {
          const dx = b[0] - a[0], dz = b[1] - a[1];
          const L2 = dx * dx + dz * dz || 1;
          const tt = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
          const lerp = ya + (yb - ya) * tt;
          const g = heightAt(x, z);
          return Math.min(lerp, g == null ? lerp : g) - 0.25;
        }
      }
      const g = heightAt(x, z);
      return g == null ? null : g - 1.6;
    }
    return heightAt(x, z);
  }

  const buckets = { bike: [], walk: [], steps: [], upper: [], trunk: [] };
  const kept = [];
  for (const w of osm?.ways || []) {
    if (!w.pts || w.pts.length < 2) continue;
    if (!keepWay(w, ctx)) continue;
    const kind = kindOf(w);
    let srcPts = w.pts;
    if (ctx.pathWestClip != null && ((w.name || '') === '한강남자전거길' || (w.name || '') === '한강 자전거길' || (w.name || '') === '올림픽대로')) {
      srcPts = clipEastOf(w.pts, ctx.pathWestClip);
    }
    const ptsAll = resample(srcPts, kind === 'bike' ? 3.0 : 3.6);
    if (ptsAll.length < 2) continue;
    const width = Math.max(2.2, Math.min(16, w.w || (kind === 'bike' ? 4 : 2.4)));
    const parts = partsOutsideRing(ptsAll, jamsuRing);
    let drew = false;
    for (const pts of parts) {
      const geo = drapedRibbonGeo(pts, width, (x, z) => surfaceAt(x, z, kind, w), kind === 'upper' ? 0.06 : (kind === 'bike' ? 0.09 : 0.05));
      if (!geo) continue;
      buckets[kind].push(geo);
      drew = true;
    }
    if (drew) kept.push(w);
  }

  const colors = { bike: '#d44b2c', walk: '#c9c2b4', steps: '#9a9084', upper: '#5a5d61', trunk: '#54575c' };
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

  const edgeGeos = [], dashGeos = [];
  for (const w of kept) {
    if (kindOf(w) !== 'bike') continue;
    let markSrc = w.pts;
    if (ctx.pathWestClip != null && ((w.name || '') === '한강남자전거길' || (w.name || '') === '한강 자전거길')) {
      markSrc = clipEastOf(w.pts, ctx.pathWestClip);
    }
    const ptsAll = resample(markSrc, 2.2);
    const width = Math.max(2.2, Math.min(16, w.w || 4));
    const yFn = (x, z) => surfaceAt(x, z, 'bike', w);
    for (const pts of partsOutsideRing(ptsAll, jamsuRing)) {
    if (pts.length < 2) continue;
    // 흰 가장자리: 중심에서 ±(width/2 - 0.14) 에 12 cm 리본
    const hw = width / 2 - 0.14;
    for (const side of [-1, 1]) {
      const shifted = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let dx = b[0] - a[0], dz = b[1] - a[1];
        const L = Math.hypot(dx, dz) || 1;
        dx /= L; dz /= L;
        return [p[0] - dz * hw * side, p[1] + dx * hw * side];
      });
      const geo = drapedRibbonGeo(shifted, 0.13, yFn, 0.075);
      if (geo) edgeGeos.push(geo);
    }
    if (width >= 3) {
      // 노란 중앙 점선: 2.2 m 긋고 2.0 m 비움. 대시마다 한 폴리라인.
      let acc = 0;
      let dash = null;
      const flush = () => {
        if (dash && dash.length >= 2) {
          const geo = drapedRibbonGeo(dash, 0.14, yFn, 0.08);
          if (geo) dashGeos.push(geo);
        }
        dash = null;
      };
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
        const seg = Math.hypot(bx - ax, bz - az) || 1;
        const dx = (bx - ax) / seg, dz = (bz - az) / seg;
        let s0 = 0;
        while (s0 < seg) {
          const along = acc + s0;
          const inDash = (along % 4.2) < 2.2;
          const s1 = Math.min(seg, s0 + 0.8);
          const px = ax + dx * s0, pz = az + dz * s0;
          if (inDash) {
            if (!dash) dash = [[px, pz]];
            dash.push([ax + dx * s1, az + dz * s1]);
          } else flush();
          s0 = s1;
        }
        acc += seg;
      }
      flush();
    }
    }
  }
  const markMats = {};
  if (edgeGeos.length) {
    const merged = edgeGeos.length === 1 ? edgeGeos[0] : mergeGeometries(edgeGeos, false);
    const mat = new THREE.MeshLambertMaterial({ color: '#f2f0ea', side: THREE.DoubleSide });
    markMats.edge = mat;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'hangang-path-edge';
    group.add(mesh);
  }
  if (dashGeos.length) {
    const merged = dashGeos.length === 1 ? dashGeos[0] : mergeGeometries(dashGeos, false);
    const mat = new THREE.MeshLambertMaterial({ color: '#e6c04a', side: THREE.DoubleSide });
    markMats.center = mat;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'hangang-path-center';
    group.add(mesh);
  }

  function onWay(w, x, z, pad = 0.4) {
    const q = projectOnLine(x, z, w.pts);
    if (!q || q.dist > (w.w || 3) * 0.55 + pad) return null;
    return q;
  }

  function isTunnel(x, z) {
    for (const w of kept) {
      if (w.tunnel !== 'yes') continue;
      if (onWay(w, x, z, 0.6)) return true;
    }
    return false;
  }

  function floorY(x, z, refY = Infinity) {
    let best = null;
    let tunnelY = null;
    const cap = Number.isFinite(refY) ? refY + 0.55 : Infinity;
    // 데크는 다리가 담당. 여기선 길 위만.
    for (const w of kept) {
      const q = onWay(w, x, z);
      if (!q) continue;
      const kind = kindOf(w);
      const y = surfaceAt(q.x, q.z, kind, w);
      if (y == null || y > cap) continue;
      if (w.tunnel === 'yes') {
        if (tunnelY == null || y < tunnelY) tunnelY = y;
      }
      if (best == null || y > best) best = y;
    }
    return tunnelY != null ? tunnelY : best;
  }

  function setNight(v) {
    const t = Math.max(0, Math.min(1, v));
    if (mats.bike) {
      mats.bike.color.setRGB(0.75 * (1 - t) + 0.28 * t, 0.34 * (1 - t) + 0.14 * t, 0.27 * (1 - t) + 0.10 * t);
      mats.bike.emissive = mats.bike.emissive || new THREE.Color('#000000');
      mats.bike.emissive.setRGB(0.22 * t, 0.10 * t, 0.04 * t);
    }
    if (mats.walk) mats.walk.color.setRGB(0.45 * (1 - t) + 0.18 * t, 0.42 * (1 - t) + 0.16 * t, 0.38 * (1 - t) + 0.14 * t);
    if (mats.upper) mats.upper.color.setRGB(0.22 + 0.13 * (1 - t), 0.23 + 0.13 * (1 - t), 0.24 + 0.14 * (1 - t));
    if (mats.trunk) mats.trunk.color.setRGB(0.28 * (1 - t) + 0.12 * t, 0.29 * (1 - t) + 0.13 * t, 0.31 * (1 - t) + 0.14 * t);
  }

  return { group, floorY, isTunnel, setNight, kept };
}
