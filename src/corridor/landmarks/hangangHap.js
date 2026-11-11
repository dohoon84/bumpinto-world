// [hangang] 2구간 — 탄천 하류 · 탄천합수부 · 한강남(합수부→반포).
//   1구간 createHangangTerrain/Paths/City/Props 를 재사용한다. 반포·잠수교 메시는 만들지 않는다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { inWater, centroid, projectOnLine } from './hangangCoords.js';
import { createHangangTerrain, waterYAt } from './hangangTerrain.js';
import { createHangangPaths } from './hangangPaths.js';
import { createHangangCity } from './hangangCity.js';
import { createHangangProps } from './hangangProps.js';

const SKIP_BRIDGE = new Set(['반포대교', '잠수교']);

function outlineCenterline(ring, step = 16) {
  if (!ring || ring.length < 4) return { pts: [], widths: [] };
  let zMin = Infinity, zMax = -Infinity;
  for (const pt of ring) {
    if (pt[1] < zMin) zMin = pt[1];
    if (pt[1] > zMax) zMax = pt[1];
  }
  const pts = [];
  const widths = [];
  for (let z = zMin + 3; z <= zMax - 3; z += step) {
    const xs = [];
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      if (a[1] === b[1]) continue;
      if ((a[1] - z) * (b[1] - z) > 0) continue;
      const u = (z - a[1]) / (b[1] - a[1]);
      if (u < -1e-6 || u > 1 + 1e-6) continue;
      xs.push(a[0] + (b[0] - a[0]) * u);
    }
    if (xs.length < 2) continue;
    const lo = Math.min(...xs), hi = Math.max(...xs);
    pts.push([(lo + hi) / 2, z]);
    widths.push(Math.max(8, hi - lo));
  }
  return { pts, widths };
}

function resample(pts, step = 8) {
  if (!pts || pts.length < 2) return pts || [];
  const out = [[pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length; i++) {
    let ax = out[out.length - 1][0], az = out[out.length - 1][1];
    const bx = pts[i][0], bz = pts[i][1];
    let dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-4) continue;
    while (L > step) {
      const t = step / L;
      ax += dx * t; az += dz * t;
      out.push([ax, az]);
      dx = bx - ax; dz = bz - az; L = Math.hypot(dx, dz);
    }
  }
  const last = pts[pts.length - 1];
  const p = out[out.length - 1];
  if (Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.4) out.push([last[0], last[1]]);
  return out;
}

function abutmentYs(br, osm, land) {
  const pts = br.pts || [];
  const south = [], north = [];
  let zMin = Infinity, zMax = -Infinity;
  for (const p of pts) {
    if (p[1] < zMin) zMin = p[1];
    if (p[1] > zMax) zMax = p[1];
  }
  const span = (zMax - zMin) || 1;
  for (const p of resample(pts, 12)) {
    if (inWater(p[0], p[1], osm?.water)) continue;
    const g = land.heightAt(p[0], p[1]);
    if (g == null) continue;
    const wy = waterYAt(p[0], p[1], land.levels, osm?.meta?.datumBlend);
    if (g < wy + 4) continue;
    if ((p[1] - zMin) / span < 0.28) north.push(g);
    if ((p[1] - zMin) / span > 0.72) south.push(g);
  }
  const med = (arr, fb) => (arr.length ? arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)] : fb);
  const fallback = (land.levels?.waterY ?? -43) + 12;
  return { southY: med(south, fallback), northY: med(north, fallback), zMin, zMax };
}

function deckYAt(x, z, br, osm, land, abut) {
  const wy = waterYAt(x, z, land.levels, osm?.meta?.datumBlend);
  const overWater = inWater(x, z, osm?.water);
  if (!overWater) {
    const g = land.heightAt(x, z);
    if (g != null && g > wy + 5) return Math.max(g, Math.min(abut.southY, abut.northY));
  }
  const t = abut.zMax === abut.zMin ? 0.5 : (z - abut.zMin) / (abut.zMax - abut.zMin);
  const tt = Math.max(0, Math.min(1, t));
  // z 가 클수록 남쪽
  return abut.northY + (abut.southY - abut.northY) * tt;
}

function createHapBridges({ parent, osm, land } = {}) {
  const group = new THREE.Group();
  group.name = 'hap-bridges';
  parent.add(group);
  const byName = new Map();
  for (const br of osm?.bridges || []) {
    if (!br?.name || SKIP_BRIDGE.has(br.name)) continue;
    if (!br.pts || br.pts.length < 2) continue;
    const xs = br.pts.map((p) => p[0]);
    if (osm?.meta?.pathWestClip != null && Math.max(...xs) < osm.meta.pathWestClip) continue;
    const list = byName.get(br.name) || [];
    list.push(br);
    byName.set(br.name, list);
  }
  const deckMat = new THREE.MeshLambertMaterial({ color: '#6a6e72', side: THREE.DoubleSide });
  const soffitMat = new THREE.MeshPhongMaterial({
    color: '#4a4c48', side: THREE.DoubleSide, shininess: 8, specular: '#2a2c28',
  });
  const pierMat = new THREE.MeshLambertMaterial({ color: '#8a8b84' });
  const railMat = new THREE.MeshLambertMaterial({ color: '#c8cac4' });
  const mats = [deckMat, soffitMat, pierMat, railMat];
  const infos = [];

  for (const [name, list] of byName) {
    // prefer a closed outline if one exists; else the longest open way as centerline
    const outline = list.filter((b) => b.closed && (b.widthEst || 0) > 6)
      .sort((a, b) => (b.lengthEst || 0) - (a.lengthEst || 0))[0];
    const line = list.filter((b) => !b.closed)
      .sort((a, b) => {
        const la = Math.hypot(a.pts[0][0] - a.pts[a.pts.length - 1][0], a.pts[0][1] - a.pts[a.pts.length - 1][1]);
        const lb = Math.hypot(b.pts[0][0] - b.pts[b.pts.length - 1][0], b.pts[0][1] - b.pts[b.pts.length - 1][1]);
        return lb - la;
      })[0];
    // Closed outlines are rings. Tracing the perimeter as a ribbon made giant
    // dark sails. Slice each ring north–south to get a real centerline.
    let axisSrc = line?.pts;
    let widthAlong = null;
    if (outline?.pts) {
      const sliced = outlineCenterline(outline.pts, 14);
      if (sliced.pts.length >= 2) {
        axisSrc = sliced.pts;
        widthAlong = sliced.widths;
      }
    }
    if (!axisSrc || axisSrc.length < 2) continue;
    const axis = resample(axisSrc, 10);
    const abut = abutmentYs({ pts: axisSrc }, osm, land);
    const width0 = outline?.widthEst || line?.w || 18;
    const widthAt = (i) => {
      if (widthAlong && widthAlong.length) {
        const tt = axis.length <= 1 ? 0 : i / (axis.length - 1);
        const k = Math.min(widthAlong.length - 1, Math.max(0, Math.round(tt * (widthAlong.length - 1))));
        return Math.max(10, Math.min(56, widthAlong[k]));
      }
      return Math.max(10, Math.min(36, width0));
    };
    const hw = Math.max(7, Math.min(28, width0)) / 2;
    let thick = 2.5;
    const ht = outline?.heightTag || line?.heightTag;
    if (ht) {
      const n = Number.parseFloat(ht);
      if (Number.isFinite(n) && n > 0.4 && n < 8) thick = n;
    }
    const top = [], bot = [], idx = [];
    for (let i = 0; i < axis.length; i++) {
      const a = axis[Math.max(0, i - 1)], b = axis[Math.min(axis.length - 1, i + 1)], p = axis[i];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      const y = deckYAt(p[0], p[1], outline || line, osm, land, abut);
      const side = widthAt(i) / 2;
      top.push(p[0] - dz * side, y, p[1] + dx * side, p[0] + dz * side, y, p[1] - dx * side);
      bot.push(p[0] - dz * side, y - thick, p[1] + dx * side, p[0] + dz * side, y - thick, p[1] - dx * side);
      if (i > 0) {
        const k = (i - 1) * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const mk = (arr, mat, n) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = n;
      group.add(mesh);
    };
    mk(top, deckMat, `hap-deck-${name}`);
    mk(bot, soffitMat, `hap-soffit-${name}`);

    // side rails
    const railH = 0.85;
    for (const side of [0, 1]) {
      const rpos = [], ridx = [];
      for (let i = 0; i < axis.length; i++) {
        const lx = top[i * 6 + side * 3], ly = top[i * 6 + side * 3 + 1], lz = top[i * 6 + side * 3 + 2];
        rpos.push(lx, ly, lz, lx, ly + railH, lz);
        if (i > 0) {
          const k = (i - 1) * 2;
          ridx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3));
      g.setIndex(ridx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, railMat);
      mesh.name = `hap-rail-${name}`;
      group.add(mesh);
    }

    // piers over water (approximate spacing; OSM 교각 노드 없음)
    const pierGeo = new THREE.BoxGeometry(hw * 1.15, 1, 1.6);
    const pierDummy = [];
    let acc = 0;
    for (let i = 1; i < axis.length; i++) {
      const ax = axis[i - 1][0], az = axis[i - 1][1], bx = axis[i][0], bz = axis[i][1];
      const seg = Math.hypot(bx - ax, bz - az);
      acc += seg;
      if (acc < 46) continue;
      acc = 0;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (!inWater(mx, mz, osm?.water)) continue;
      const yTop = deckYAt(mx, mz, outline || line, osm, land, abut) - thick;
      const yBot = waterYAt(mx, mz, land.levels, osm?.meta?.datumBlend) - 1.2;
      const h = Math.max(4, yTop - yBot);
      const mesh = new THREE.Mesh(pierGeo, pierMat);
      mesh.position.set(mx, yBot + h / 2, mz);
      mesh.scale.y = h;
      const dx = bx - ax, dz = bz - az;
      mesh.rotation.y = Math.atan2(dx, dz);
      group.add(mesh);
      pierDummy.push(mesh);
    }
    const c = centroid(axis);
    infos.push({ name, x: c.x, z: c.z, y: deckYAt(c.x, c.z, outline || line, osm, land, abut), abut });
  }

  function floorY(x, z, refY = Infinity) {
    let best = null;
    const cap = Number.isFinite(refY) ? refY + 0.85 : Infinity;
    for (const br of osm?.bridges || []) {
      if (!br?.pts || SKIP_BRIDGE.has(br.name)) continue;
      const q = projectOnLine(x, z, br.pts);
      const hw = (br.widthEst || br.w || 16) * 0.55 + 1.2;
      if (!q || q.dist > hw) continue;
      const abut = abutmentYs(br, osm, land);
      const y = deckYAt(q.x, q.z, br, osm, land, abut);
      if (y == null || y > cap) continue;
      if (best == null || y > best) best = y;
    }
    return best;
  }

  return {
    group, floorY, infos, setNight(v) {
      const t = Math.max(0, Math.min(1, v));
      deckMat.color.setRGB(0.42 * (1 - t) + 0.16 * t, 0.43 * (1 - t) + 0.16 * t, 0.45 * (1 - t) + 0.17 * t);
      soffitMat.emissive = soffitMat.emissive || new THREE.Color('#000000');
      soffitMat.emissive.set(t > 0.35 ? '#1a140c' : '#000000');
    },
  };
}

function createHapUnderpasses({ parent, osm, land }) {
  const group = new THREE.Group();
  group.name = 'hangang-hap-underpasses';
  parent.add(group);
  const heightAt = land.heightAt;
  const olympic = (osm?.ways || []).filter((w) => w.name === '올림픽대로' && w.pts?.length >= 2);
  const tunnels = (osm?.ways || []).filter((w) => w.tunnel === 'yes' && (w.name || '').includes('나들목') && w.pts?.length >= 2);
  if (!olympic.length || !tunnels.length) return { group, setNight() {} };

  const wallMat = new THREE.MeshLambertMaterial({ color: '#3e4248' });
  const soffitMat = new THREE.MeshLambertMaterial({ color: '#2a2c30', side: THREE.DoubleSide });
  const deckMat = new THREE.MeshLambertMaterial({ color: '#55585c' });

  for (const tun of tunnels) {
    const samples = resample(tun.pts, 8);
    let best = null;
    for (const p of samples) {
      for (const ow of olympic) {
        const q = projectOnLine(p[0], p[1], ow.pts);
        if (!q) continue;
        if (!best || q.dist < best.dist) best = { dist: q.dist, x: p[0], z: p[1], ox: q.x, oz: q.z, ow };
      }
    }
    if (!best || best.dist > 10) continue;
    const a = tun.pts[0], b = tun.pts[tun.pts.length - 1];
    const ya = heightAt(a[0], a[1]), yb = heightAt(b[0], b[1]);
    const yOly = heightAt(best.ox, best.oz);
    if (ya == null || yb == null || yOly == null) continue;
    const tdx = b[0] - a[0], tdz = b[1] - a[1];
    const tL = Math.hypot(tdx, tdz) || 1;
    const soffitY = yOly - 0.45;
    const half = Math.max(22, (best.ow.w || 19) * 0.5 + 16);
    const stations = [];
    for (const p of samples) {
      const tt = Math.max(0, Math.min(1, ((p[0] - a[0]) * tdx + (p[1] - a[1]) * tdz) / (tL * tL)));
      const floorY = ya + (yb - ya) * tt - 0.2;
      if (soffitY - floorY < 3.0) continue;
      if (Math.hypot(p[0] - best.x, p[1] - best.z) > half) continue;
      stations.push({ x: p[0], z: p[1], floorY });
    }
    if (stations.length < 2) continue;
    const x0 = stations[0].x, z0 = stations[0].z;
    const x1 = stations[stations.length - 1].x, z1 = stations[stations.length - 1].z;
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 4) continue;
    const midX = (x0 + x1) / 2, midZ = (z0 + z1) / 2;
    const floorY = Math.min(...stations.map((s) => s.floorY));
    const innerH = soffitY - floorY;
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    const px = -uz, pz = ux;
    const hw = Math.max(3.4, (tun.w || 5) * 0.5 + 1.0);

    const soffit = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.2, 0.55, len + 1.6), soffitMat);
    soffit.position.set(midX, soffitY + 0.28, midZ);
    soffit.rotation.y = yaw;
    soffit.name = `underpass-soffit-${tun.name || tun.id}`;
    group.add(soffit);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.6, 0.45, len + 1.6), wallMat);
    floor.position.set(midX, floorY - 0.1, midZ);
    floor.rotation.y = yaw;
    floor.name = `underpass-floor-${tun.name || tun.id}`;
    group.add(floor);

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, innerH, len + 1.6), wallMat);
      wall.position.set(midX + px * (hw + 0.25) * side, floorY + innerH / 2, midZ + pz * (hw + 0.25) * side);
      wall.rotation.y = yaw;
      group.add(wall);
    }

    const deckW = Math.max(hw * 2 + 10, best.ow.w || 19);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.75, len + 2.2), deckMat);
    deck.position.set(midX, yOly + 0.38, midZ);
    deck.rotation.y = yaw;
    deck.name = `underpass-deck-${tun.name || tun.id}`;
    group.add(deck);
  }

  return {
    group,
    setNight(v) {
      const t = Math.max(0, Math.min(1, v));
      soffitMat.emissive = soffitMat.emissive || new THREE.Color('#000000');
      soffitMat.emissive.set(t > 0.35 ? '#1a140c' : '#000000');
      deckMat.color.setRGB(0.33 * (1 - t) + 0.14 * t, 0.34 * (1 - t) + 0.14 * t, 0.36 * (1 - t) + 0.15 * t);
    },
  };
}

export function createHangangHap({ parent, overlay, terrain, dem, osm } = {}) {
  const root = new THREE.Group();
  root.name = 'hangang-hap';
  parent.add(root);

  if (Array.isArray(osm?.amenities)) {
    osm.benches = osm.amenities.filter((a) => a.k === 'bench');
    osm.bins = osm.amenities.filter((a) => a.k === 'waste_basket');
  }

  const land = createHangangTerrain({ parent: root, dem, osm });
  const paths = createHangangPaths({ parent: root, osm, land });
  const city = createHangangCity({ parent: root, osm, land });
  const bridges = createHapBridges({ parent: root, osm, land });
  const underpasses = createHapUnderpasses({ parent: root, osm, land });
  const props = createHangangProps({ parent: root, osm, land });

  if (overlay) {
    const hap = osm?.spawns?.['tancheon-hap'] || osm?.connectEnds?.tancheonHap;
    if (hap) {
      overlay.add({
        cls: 'label landmark',
        text: '탄천합수부 Tancheon Confluence',
        getPos: () => new THREE.Vector3(hap.x, (land.heightAt(hap.x, hap.z) ?? land.waterY) + 10, hap.z),
        maxDist: 9000,
        minDist: 50,
      });
    }
    const jam = (osm?.parks || []).find((p) => p.name === '잠원한강공원');
    if (jam?.o) {
      const c = centroid(jam.o);
      overlay.add({
        cls: 'label landmark',
        text: '🌳 잠원한강공원 Jamwon Hangang Park',
        getPos: () => new THREE.Vector3(c.x, (land.heightAt(c.x, c.z) ?? land.waterY) + 8, c.z),
        maxDist: 8000,
        minDist: 40,
      });
    }
    for (const br of bridges.infos) {
      overlay.add({
        cls: 'label landmark',
        text: `🌉 ${br.name}`,
        getPos: () => new THREE.Vector3(br.x, br.y + 8, br.z),
        maxDist: 8000,
        minDist: 80,
      });
    }
  }

  function surfaceY(x, z, refY = Infinity) {
    if (paths.isTunnel?.(x, z)) {
      const py = paths.floorY?.(x, z, refY);
      if (py != null) return py;
    }
    const ys = [];
    const g = land.heightAt(x, z);
    if (g != null) ys.push(g);
    const by = bridges.floorY?.(x, z, refY);
    if (by != null) ys.push(by);
    const py = paths.floorY?.(x, z, refY);
    if (py != null) ys.push(py);
    let best = null;
    const cap = Number.isFinite(refY) ? refY + 0.55 : Infinity;
    for (const y of ys) {
      if (y == null || y > cap) continue;
      if (best == null || y > best) best = y;
    }
    return best;
  }

  function setNight(v) {
    land.setNight(v);
    paths.setNight(v);
    city.setNight?.(v);
    bridges.setNight?.(v);
    underpasses.setNight?.(v);
    props.setNight?.(v);
  }

  return {
    root,
    bounds: land.bounds,
    heightAt: (x, z) => land.heightAt(x, z),
    surfaceY,
    levels: land.levels,
    mini: null,
    spawns: osm?.spawns || {},
    connectEnds: osm?.connectEnds || {},
    setNight,
    isTunnel: (x, z) => paths.isTunnel?.(x, z),
  };
}

export function mergeHangangMini(a, b) {
  if (!a) return b || { roads: [], buildings: [], plazas: [], parks: [], water: [], waterLines: [] };
  if (!b) return a;
  return {
    roads: [...(a.roads || []), ...(b.roads || [])],
    buildings: [...(a.buildings || []), ...(b.buildings || [])],
    plazas: [...(a.plazas || []), ...(b.plazas || [])],
    parks: [...(a.parks || []), ...(b.parks || [])],
    water: [...(a.water || []), ...(b.water || [])],
    waterLines: [...(a.waterLines || []), ...(b.waterLines || [])],
  };
}
