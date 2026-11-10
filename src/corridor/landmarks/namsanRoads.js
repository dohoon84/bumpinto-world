// [namsan] OSM 남산공원길·순환로·산책로·계단을 지형 위에 깔고, 상단 버스 정류장과 입구 안내를 둔다.
//   브랜드 로고 없음. 정류장 이름은 OSM 표기(남산서울타워)만 쓴다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ribbonGeo, fixNormalsUp } from '../../world.js';
import { paint } from '../tileMesh.js';
import { createBus } from '../../transit/busModel.js';
import { NT } from './namsanCoords.js';
import { buildStreetlightGeometries, SCALE, POOL_SCALE, POOL_R, POOL_RZ, POOL_GAIN, ARM, LENS_DAY, LENS_NIGHT } from '../../world/streetlights.js';
import { lightPoolMaterial } from '../../world/nightLights.js';

const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street', 'primary_link', 'secondary_link', 'tertiary_link']);
const STEPS = new Set(['steps']);

function resample(pts, step = 2.4) {
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

function elevated(pts, heightAt, dy) {
  return pts.map(([x, z]) => [x, z, heightAt(x, z) + dy]);
}

function guideY(x, z, heightAt) {
  const d = Math.hypot(x - NT.tx, z - NT.tz);
  const plazaY = NT.eleBase - NT.datum;
  // 광장 포장 위에 바짝 붙인다. DEM 이 동쪽 광장을 높이 집어도 기단을 따른다.
  if (d < 90) return plazaY + 0.06;
  return heightAt(x, z) + 0.05;
}


function segsOf(pts) {
  const s = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > 0.2) s.push({ a, b, L });
  }
  return s;
}

function nearSeg(x, z, segs, pad) {
  let best = Infinity;
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / (s.L * s.L || 1)));
    const d = Math.hypot(s.a[0] + dx * t - x, s.a[1] + dz * t - z);
    if (d < best) best = d;
    if (best < pad) return best;
  }
  return best;
}

function pathLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

function pointAt(pts, dist) {
  if (pts.length < 2) return { x: pts[0]?.[0] || 0, z: pts[0]?.[1] || 0, hx: 1, hz: 0 };
  let left = dist;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const L = Math.hypot(bx - ax, bz - az) || 1e-9;
    if (left <= L || i === pts.length - 1) {
      const t = Math.max(0, Math.min(1, left / L));
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, hx: (bx - ax) / L, hz: (bz - az) / L };
    }
    left -= L;
  }
  const n = pts.length;
  const L = Math.hypot(pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]) || 1;
  return { x: pts[n - 1][0], z: pts[n - 1][1], hx: (pts[n - 1][0] - pts[n - 2][0]) / L, hz: (pts[n - 1][1] - pts[n - 2][1]) / L };
}


function offsetLine(pts, dist) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let hx = next[0] - prev[0], hz = next[1] - prev[1];
    const L = Math.hypot(hx, hz) || 1;
    hx /= L; hz /= L;
    out.push([pts[i][0] - hz * dist, pts[i][1] + hx * dist]);
  }
  return out;
}

function sideSign(pts, heightAt, pref) {
  if (pref === 'left') return 1;
  if (pref === 'right') return -1;
  const mid = Math.max(1, Math.min(pts.length - 1, Math.floor(pts.length / 2)));
  const a = pts[mid - 1], b = pts[mid];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const hx = (b[0] - a[0]) / L, hz = (b[1] - a[1]) / L;
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  const leftY = heightAt(mx - hz * 4, mz + hx * 4);
  const rightY = heightAt(mx + hz * 4, mz - hx * 4);
  const uphill = leftY >= rightY ? 1 : -1;
  return pref === 'downhill' ? -uphill : uphill;
}

function stitchNamed(ways, re) {
  const list = ways.filter((w) => re.test(w.name || '') && w.pts?.length >= 2).map((w) => w.pts.map((p) => [p[0], p[1]]));
  if (!list.length) return null;
  const used = new Set();
  let chain = list[0].slice();
  used.add(0);
  const endKey = (pts, which) => {
    const p = which === 'a' ? pts[0] : pts[pts.length - 1];
    return p;
  };
  let grew = true;
  while (grew) {
    grew = false;
    const head = endKey(chain, 'a'), tail = endKey(chain, 'b');
    for (let i = 0; i < list.length; i++) {
      if (used.has(i)) continue;
      const pts = list[i];
      const a = pts[0], b = pts[pts.length - 1];
      const pairs = [
        [Math.hypot(tail[0] - a[0], tail[1] - a[1]), () => { chain = chain.concat(pts.slice(1)); }],
        [Math.hypot(tail[0] - b[0], tail[1] - b[1]), () => { chain = chain.concat(pts.slice().reverse().slice(1)); }],
        [Math.hypot(head[0] - b[0], head[1] - b[1]), () => { chain = pts.slice(0, -1).concat(chain); }],
        [Math.hypot(head[0] - a[0], head[1] - a[1]), () => { chain = pts.slice().reverse().slice(0, -1).concat(chain); }],
      ];
      pairs.sort((x, y) => x[0] - y[0]);
      if (pairs[0][0] < 6) {
        pairs[0][1]();
        used.add(i);
        grew = true;
        break;
      }
    }
  }
  return chain.length >= 2 ? chain : null;
}

function dijkstra(ways, sx, sz, tx, tz) {
  const nodes = [];
  const idx = new Map();
  const key = (x, z) => `${Math.round(x * 2) / 2},${Math.round(z * 2) / 2}`;
  const node = (x, z) => {
    const k = key(x, z);
    let i = idx.get(k);
    if (i == null) { i = nodes.length; idx.set(k, i); nodes.push({ x, z, e: [] }); }
    return i;
  };
  const link = (i, j, w) => { nodes[i].e.push({ t: j, w }); nodes[j].e.push({ t: i, w }); };
  for (const way of ways) {
    const pts = way.pts || [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d < 0.15) continue;
      link(node(a[0], a[1]), node(b[0], b[1]), d);
    }
  }
  if (nodes.length < 3) return null;
  const ends = [];
  for (const way of ways) {
    const pts = way.pts || [];
    if (pts.length) { ends.push(pts[0], pts[pts.length - 1]); }
  }
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const d = Math.hypot(ends[i][0] - ends[j][0], ends[i][1] - ends[j][1]);
      if (d > 0.4 && d < 5) link(node(ends[i][0], ends[i][1]), node(ends[j][0], ends[j][1]), d);
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
      if (d > 0.6 && d < 8) link(i, j, d);
    }
  }
  const snap = (x, z) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
      if (d < bd) { bd = d; best = i; }
    }
    return bd < 48 ? best : -1;
  };
  const a = snap(sx, sz), b = snap(tx, tz);
  if (a < 0 || b < 0) return null;
  const dist = new Float64Array(nodes.length).fill(Infinity);
  const prev = new Int32Array(nodes.length).fill(-1);
  const seen = new Uint8Array(nodes.length);
  dist[a] = 0;
  for (let n = 0; n < nodes.length; n++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!seen[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === b) break;
    seen[u] = 1;
    for (const e of nodes[u].e) {
      const nd = dist[u] + e.w;
      if (nd < dist[e.t]) { dist[e.t] = nd; prev[e.t] = u; }
    }
  }
  if (!Number.isFinite(dist[b])) return null;
  const path = [];
  for (let i = b; i >= 0; i = prev[i]) path.push([nodes[i].x, nodes[i].z]);
  path.reverse();
  if (Math.hypot(path[0][0] - sx, path[0][1] - sz) > 0.8) path.unshift([sx, sz]);
  if (Math.hypot(path[path.length - 1][0] - tx, path[path.length - 1][1] - tz) > 0.8) path.push([tx, tz]);
  return path;
}

function chevronGeo() {
  const s = new THREE.Shape();
  // 팁이 -Y 를 향하게 그려, rotation.x = -PI/2 후 +Z(진행 방향)를 가리킨다.
  s.moveTo(0, -1.05);
  s.lineTo(-0.78, 0.88);
  s.lineTo(-0.36, 0.50);
  s.lineTo(0, 0.18);
  s.lineTo(0.36, 0.50);
  s.lineTo(0.78, 0.88);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function signTex(title, sub) {
  const c = document.createElement('canvas'); c.width = 768; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#1a2740'; x.fillRect(0, 0, 768, 256);
  x.fillStyle = '#f4f7fb';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 72px sans-serif';
  x.fillText(title, 384, sub ? 100 : 128);
  if (sub) {
    x.font = '600 36px sans-serif';
    x.fillStyle = '#d7c07a';
    x.fillText(sub, 384, 178);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function routeSignTex(route, title) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 640;
  const x = c.getContext('2d');
  x.fillStyle = '#1c3f78'; x.fillRect(0, 0, 512, 640);
  x.fillStyle = '#f4f7fb';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 210px sans-serif';
  x.fillText(route, 256, 250);
  x.font = '700 48px sans-serif';
  x.fillText(title, 256, 470);
  x.font = '600 36px sans-serif';
  x.fillStyle = '#d7c07a';
  x.fillText('정류장', 256, 540);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

function adPanelTex(route) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 512, 256);
  g.addColorStop(0, '#15405c');
  g.addColorStop(1, '#0c6a62');
  x.fillStyle = g; x.fillRect(0, 0, 512, 256);
  x.fillStyle = 'rgba(255, 214, 130, 0.18)';
  x.beginPath(); x.arc(70, 210, 100, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f3ecd4';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 92px sans-serif';
  x.fillText(route, 256, 108);
  x.font = '600 34px sans-serif';
  x.fillText('남산순환', 256, 178);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}


export function createNamsanRoads({ parent, osm, heightAt, overlay = null } = {}) {
  const group = new THREE.Group();
  group.name = 'namsan-roads';
  parent.add(group);

  const ways = (osm?.ways || []).filter((w) => w.pts?.length >= 2);
  const empty = {
    group,
    ways,
    busStops: osm?.busStops || [],
    mini: ways.map((w) => ({ k: w.k, p: w.pts, w: w.w })),
    floorY() { return null; },
    setNight() {},
    update() {},
    doorGuides: 0,
  };
  if (!ways.length) return empty;

  const carGeos = [], pathGeos = [], stepGeos = [], treadGeos = [];
  const curbGeos = [], sidewalkGeos = [], railGeos = [];
  const yellowGeos = [], whiteGeos = [];
  const walkHits = [];
  const lampPts = [];

  for (const w of ways) {
    const isCar = CAR.has(w.k);
    const isStep = STEPS.has(w.k);
    const width = w.w || (isCar ? 7 : isStep ? 2.6 : 2.3);
    const dy = isCar ? 0.10 : isStep ? 0.08 : 0.07;
    const pts = resample(w.pts, isStep ? 1.6 : 2.4);
    if (pts.length < 2) continue;
    const epts = elevated(pts, heightAt, dy);
    const geo = fixNormalsUp(ribbonGeo(epts, width, 0, false));
    if (isCar) carGeos.push(paint(geo, '#6e747c'));
    else if (isStep) stepGeos.push(paint(geo, '#9a9080'));
    else pathGeos.push(paint(geo, '#7a6b52'));
    walkHits.push({ segs: segsOf(pts), pad: width * 0.5 + 0.35, dy });

    if (isCar) {
      const namedLoop = /남산공원길|순환로/.test(w.name || '');
      const walkPad = width * 0.5 + (namedLoop ? 2.2 : 0.45);
      walkHits[walkHits.length - 1].pad = walkPad;
      if (width >= 6) {
        yellowGeos.push(fixNormalsUp(ribbonGeo(elevated(offsetLine(pts, 0.14), heightAt, dy + 0.045), 0.11, 0, false)));
        yellowGeos.push(fixNormalsUp(ribbonGeo(elevated(offsetLine(pts, -0.14), heightAt, dy + 0.045), 0.11, 0, false)));
        whiteGeos.push(fixNormalsUp(ribbonGeo(elevated(offsetLine(pts, width * 0.5 - 0.18), heightAt, dy + 0.04), 0.12, 0, false)));
        whiteGeos.push(fixNormalsUp(ribbonGeo(elevated(offsetLine(pts, -(width * 0.5 - 0.18)), heightAt, dy + 0.04), 0.12, 0, false)));
      }
      const swPref = w.sidewalk || (namedLoop ? 'uphill' : null);
      const upSign = namedLoop || swPref ? sideSign(pts, heightAt, swPref === 'left' || swPref === 'right' ? swPref : 'uphill') : 0;
      const downSign = namedLoop ? -upSign : 0;
      if (swPref === 'both') {
        for (const sgn of [1, -1]) {
          sidewalkGeos.push(paint(fixNormalsUp(ribbonGeo(elevated(offsetLine(pts, sgn * (width * 0.5 + 0.95)), heightAt, dy + 0.02), 1.7, 0, false)), '#b7b4ac'));
          curbGeos.push(paint(fixNormalsUp(ribbonGeo(elevated(offsetLine(pts, sgn * (width * 0.5 + 0.12)), heightAt, dy + 0.12), 0.24, 0, false)), '#c9c5bb'));
        }
      } else if (upSign) {
        sidewalkGeos.push(paint(fixNormalsUp(ribbonGeo(elevated(offsetLine(pts, upSign * (width * 0.5 + 0.95)), heightAt, dy + 0.02), 1.7, 0, false)), '#b7b4ac'));
        curbGeos.push(paint(fixNormalsUp(ribbonGeo(elevated(offsetLine(pts, upSign * (width * 0.5 + 0.12)), heightAt, dy + 0.12), 0.24, 0, false)), '#c9c5bb'));
      } else {
        curbGeos.push(paint(fixNormalsUp(ribbonGeo(elevated(pts, heightAt, dy + 0.06), width + 0.5, 0, false)), '#8a8680'));
      }
      if (namedLoop && downSign) {
        // 계곡 쪽 가드레일
        let accR = 0;
        for (let i = 1; i < pts.length; i++) {
          const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
          const L = Math.hypot(bx - ax, bz - az) || 1;
          const hx = (bx - ax) / L, hz = (bz - az) / L;
          const ox = -hz * (width * 0.5 + 0.22) * downSign;
          const oz = hx * (width * 0.5 + 0.22) * downSign;
          const y0 = heightAt(ax + ox, az + oz), y1 = heightAt(bx + ox, bz + oz);
          for (const hy of [0.48, 0.88]) {
            const rg = new THREE.BoxGeometry(0.05, 0.06, L);
            rg.rotateY(Math.atan2(hx, hz));
            rg.translate((ax + bx) / 2 + ox, (y0 + y1) * 0.5 + hy, (az + bz) / 2 + oz);
            railGeos.push(paint(rg, '#9aa0a6'));
          }
          accR += L;
          if (accR >= 2.1) {
            const pg = new THREE.BoxGeometry(0.06, 1.02, 0.06);
            pg.translate(bx + ox, y1 + 0.52, bz + oz);
            railGeos.push(paint(pg, '#7e848c'));
            accR = 0;
          }
        }
        let accL = 0;
        for (let i = 1; i < pts.length; i++) {
          const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          accL += L;
          if (accL < 22) continue;
          accL = 0;
          const hx = (pts[i][0] - pts[i - 1][0]) / (L || 1);
          const hz = (pts[i][1] - pts[i - 1][1]) / (L || 1);
          const side = upSign || 1;
          lampPts.push({
            x: pts[i][0] - hz * (width * 0.5 + 1.25) * side,
            z: pts[i][1] + hx * (width * 0.5 + 1.25) * side,
            yaw: Math.atan2(-hx, -hz),
          });
        }
      }
    }

    if (isStep) {
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const hx = (bx - ax) / L, hz = (bz - az) / L;
        for (let s = 0; s < L; s += 0.34) {
          const t = s / L;
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const y = heightAt(x, z) + dy + 0.03;
          const bg = new THREE.BoxGeometry(0.08, 0.07, Math.max(0.6, width - 0.15));
          bg.rotateY(Math.atan2(hx, hz));
          bg.translate(x, y, z);
          treadGeos.push(paint(bg, '#b4aa98'));
        }
        acc += L;
        // railings both sides
        const y0 = heightAt(ax, az), y1 = heightAt(bx, bz);
        const slope = Math.abs(y1 - y0) / L;
        if (slope > 0.08 || true) {
          for (const side of [-1, 1]) {
            const ox = -hz * (width * 0.5 + 0.06) * side, oz = hx * (width * 0.5 + 0.06) * side;
            const mx = (ax + bx) / 2 + ox, mz = (az + bz) / 2 + oz;
            const my = (y0 + y1) * 0.5 + 0.55;
            const rg = new THREE.BoxGeometry(0.05, 0.06, L);
            rg.rotateY(Math.atan2(hx, hz));
            rg.translate(mx, my, mz);
            railGeos.push(paint(rg, '#8a9096'));
            if (acc > 1.6) {
              const pg = new THREE.BoxGeometry(0.05, 0.95, 0.05);
              pg.translate(mx, (y0 + y1) * 0.5 + 0.48, mz);
              railGeos.push(paint(pg, '#6a7076'));
            }
          }
        }
      }
    } else if (!isCar) {
      // railings on steep footways
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const y0 = heightAt(ax, az), y1 = heightAt(bx, bz);
        if (Math.abs(y1 - y0) / L < 0.22) continue;
        const hx = (bx - ax) / L, hz = (bz - az) / L;
        const mx = (ax + bx) / 2 - hz * (width * 0.5 + 0.08);
        const mz = (az + bz) / 2 + hx * (width * 0.5 + 0.08);
        const my = (y0 + y1) * 0.5 + 0.5;
        const rg = new THREE.BoxGeometry(0.05, 0.05, L);
        rg.rotateY(Math.atan2(hx, hz));
        rg.translate(mx, my, mz);
        railGeos.push(paint(rg, '#7a8070'));
      }
    }
  }

  const addMerged = (geos, name) => {
    if (!geos.length) return;
    const g = mergeGeometries(geos, true);
    if (!g) return;
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    m.name = name;
    group.add(m);
  };
  addMerged(sidewalkGeos, 'namsan-sidewalks');
  addMerged(curbGeos, 'namsan-curbs');
  addMerged(carGeos, 'namsan-car-roads');
  addMerged(pathGeos, 'namsan-paths');
  addMerged(stepGeos, 'namsan-steps');
  addMerged(treadGeos, 'namsan-treads');
  addMerged(railGeos, 'namsan-rails');
  const yellowMat = new THREE.MeshLambertMaterial({
    color: '#f0d24a', emissive: new THREE.Color('#f0d24a'), emissiveIntensity: 0,
  });
  const whiteMat = new THREE.MeshLambertMaterial({
    color: '#eceff4', emissive: new THREE.Color('#dfe4ec'), emissiveIntensity: 0,
  });
  if (yellowGeos.length) {
    const yg = mergeGeometries(yellowGeos, true);
    if (yg) { const m = new THREE.Mesh(yg, yellowMat); m.name = 'namsan-yellow-lines'; group.add(m); }
  }
  if (whiteGeos.length) {
    const wg = mergeGeometries(whiteGeos, true);
    if (wg) { const m = new THREE.Mesh(wg, whiteMat); m.name = 'namsan-white-lines'; group.add(m); }
  }

  let lampLensMat = null, lampPoolMat = null;
  if (lampPts.length) {
    const geo = buildStreetlightGeometries();
    const kind = 1;
    const sc = SCALE[kind] ?? 0.72;
    const ps = POOL_SCALE[kind] ?? 0.8;
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    lampLensMat = new THREE.MeshBasicMaterial({ color: LENS_DAY.clone() });
    lampPoolMat = lightPoolMaterial({ color: '#ffd59a', intensity: POOL_GAIN, radius: POOL_R, radiusZ: POOL_RZ, focusX: ARM });
    const n = lampPts.length;
    const bodyIM = new THREE.InstancedMesh(geo.body, bodyMat, n);
    const lensIM = new THREE.InstancedMesh(geo.lens, lampLensMat, n);
    const poolIM = new THREE.InstancedMesh(geo.pool, lampPoolMat, n);
    bodyIM.name = 'namsan-streetlight-body';
    lensIM.name = 'namsan-streetlight-lens';
    poolIM.name = 'namsan-streetlight-pool';
    poolIM.renderOrder = 2;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = lampPts[i];
      const y = heightAt(p.x, p.z);
      const yaw = p.yaw || 0;
      q.setFromAxisAngle(up, yaw);
      m4.compose(pos.set(p.x, y, p.z), q, scl.set(sc, sc, sc));
      bodyIM.setMatrixAt(i, m4);
      lensIM.setMatrixAt(i, m4);
      const ux = Math.cos(yaw), uz = -Math.sin(yaw), vx = -uz, vz = ux;
      const d = (ARM + POOL_R) * 0.5 * ps;
      const hx = (heightAt(p.x + ux * d, p.z + uz * d) - heightAt(p.x - ux * d, p.z - uz * d)) / (2 * d || 1);
      const hz = (heightAt(p.x + vx * d, p.z + vz * d) - heightAt(p.x - vx * d, p.z - vz * d)) / (2 * d || 1);
      ax.set(ux, hx, uz).normalize(); az.set(vx, hz, vz).normalize(); ay.crossVectors(az, ax).normalize();
      m4.makeBasis(ax.multiplyScalar(ps), ay.multiplyScalar(ps), az.multiplyScalar(ps)).setPosition(p.x, y + 0.14, p.z);
      poolIM.setMatrixAt(i, m4);
    }
    bodyIM.instanceMatrix.needsUpdate = true;
    lensIM.instanceMatrix.needsUpdate = true;
    poolIM.instanceMatrix.needsUpdate = true;
    bodyIM.count = lensIM.count = poolIM.count = n;
    poolIM.visible = false;
    group.add(bodyIM, lensIM, poolIM);
  }

  // bus stop shelters at OSM 남산서울타워 platforms
  const busStops = osm?.busStops || [];
  const roofLit = new THREE.MeshBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0, fog: false, toneMapped: false });
  const tubeMat = new THREE.MeshBasicMaterial({ color: '#fff4d2', transparent: true, opacity: 0, fog: false, toneMapped: false });
  const glassBack = new THREE.MeshStandardMaterial({
    color: '#b7d4e4', transparent: true, opacity: 0.42, roughness: 0.08, metalness: 0.15,
    emissive: new THREE.Color('#d7eef8'), emissiveIntensity: 0.22, depthWrite: false,
  });
  const steel = new THREE.MeshLambertMaterial({ color: '#5c6772' });
  const wood = new THREE.MeshLambertMaterial({ color: '#8a6a4e' });
  const placedStops = [];
  busStops.forEach((s, si) => {
    let hx = 0, hz = 1, nearest = Infinity, nrmx = 0, nrmz = 1, px = s.x, pz = s.z, roadW = 7.8;
    for (const w of ways) {
      if (!CAR.has(w.k)) continue;
      const pts = w.pts;
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const t = Math.max(0, Math.min(1, ((s.x - ax) * (bx - ax) + (s.z - az) * (bz - az)) / (L * L)));
        const qx = ax + (bx - ax) * t, qz = az + (bz - az) * t;
        const d = Math.hypot(qx - s.x, qz - s.z);
        if (d < nearest) {
          nearest = d;
          hx = (bx - ax) / L; hz = (bz - az) / L;
          nrmx = -hz; nrmz = hx;
          if ((s.x - qx) * nrmx + (s.z - qz) * nrmz < 0) { nrmx = -nrmx; nrmz = -nrmz; }
          px = qx; pz = qz;
          roadW = w.w || 7.8;
        }
      }
    }
    const sx = px + nrmx * (roadW * 0.5 + 1.05);
    const sz = pz + nrmz * (roadW * 0.5 + 1.05);
    const y = heightAt(sx, sz);
    const ang = Math.atan2(hx, hz);
    const route = si === 0 ? '01A' : '01B';
    placedStops.push({ ...s, x: sx, z: sz, y, hx, hz, nrmx, nrmz, route });

    const pad = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.08, 2.3), new THREE.MeshLambertMaterial({ color: '#b7b4ac' }));
    pad.position.set(sx, y + 0.05, sz); pad.rotation.y = ang; group.add(pad);
    for (const u of [-2.05, 0, 2.05]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.55, 0.1), steel);
      post.position.set(sx + hx * u + nrmx * 0.78, y + 1.28, sz + hz * u + nrmz * 0.78);
      group.add(post);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 1.95), new THREE.MeshLambertMaterial({ color: '#4a5562' }));
    roof.position.set(sx + nrmx * 0.08, y + 2.62, sz + nrmz * 0.08); roof.rotation.y = ang; group.add(roof);
    const lit = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.05, 1.65), roofLit);
    lit.position.set(sx + nrmx * 0.08, y + 2.54, sz + nrmz * 0.08); lit.rotation.y = ang; group.add(lit);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.07, 0.07), tubeMat);
    tube.position.set(sx + nrmx * 0.08, y + 2.48, sz + nrmz * 0.08); tube.rotation.y = ang; group.add(tube);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.95, 4.7), glassBack);
    back.position.set(sx + nrmx * 0.82, y + 1.28, sz + nrmz * 0.82); back.rotation.y = ang; group.add(back);
    const backFrame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.05, 4.85), steel);
    backFrame.position.set(sx + nrmx * 0.86, y + 1.28, sz + nrmz * 0.86); backFrame.rotation.y = ang; group.add(backFrame);
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.55), new THREE.MeshBasicMaterial({
      map: adPanelTex(route), toneMapped: false, fog: false, side: THREE.DoubleSide,
    }));
    ad.position.set(sx + nrmx * 0.79, y + 1.38, sz + nrmz * 0.79);
    ad.rotation.y = Math.atan2(-nrmx, -nrmz);
    group.add(ad);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 0.5), wood);
    seat.position.set(sx + nrmx * 0.32, y + 0.50, sz + nrmz * 0.32); seat.rotation.y = ang; group.add(seat);
    const rest = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.42, 0.07), wood);
    rest.position.set(sx + nrmx * 0.52, y + 0.80, sz + nrmz * 0.52); rest.rotation.y = ang; group.add(rest);
    for (const u of [-1.2, 0, 1.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.08), steel);
      leg.position.set(sx + hx * u + nrmx * 0.32, y + 0.24, sz + hz * u + nrmz * 0.32);
      group.add(leg);
    }
    const routeMap = routeSignTex(route, '남산서울타워');
    const routeFace = Math.atan2(-nrmx, -nrmz);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.38, 1.68, 0.06), new THREE.MeshBasicMaterial({ color: '#f0d070', toneMapped: false, fog: false }));
    rim.position.set(sx + hx * 2.15 - nrmx * 0.02, y + 1.78, sz + hz * 2.15 - nrmz * 0.02);
    rim.rotation.y = routeFace; group.add(rim);
    const routePlate = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 1.56), new THREE.MeshBasicMaterial({ map: routeMap, toneMapped: false, fog: false }));
    routePlate.position.set(sx + hx * 2.15 - nrmx * 0.06, y + 1.78, sz + hz * 2.15 - nrmz * 0.06);
    routePlate.rotation.y = routeFace;
    group.add(routePlate);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 3.45, 8), steel);
    pole.position.set(sx + hx * 3.15 + nrmx * 0.15, y + 1.73, sz + hz * 3.15 + nrmz * 0.15);
    group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.88), new THREE.MeshBasicMaterial({
      map: signTex('남산서울타워', route), toneMapped: false, side: THREE.DoubleSide, fog: false,
    }));
    flag.position.set(sx + hx * 3.15 + nrmx * 0.15, y + 3.22, sz + hz * 3.15 + nrmz * 0.15);
    flag.rotation.y = routeFace;
    group.add(flag);
  });
  if (overlay && busStops.length) {
    const s = busStops[0];
    overlay.add({
      cls: 'label',
      text: '🚌 남산서울타워 정류장',
      getPos: () => new THREE.Vector3(s.x, heightAt(s.x, s.z) + 6.5, s.z),
      maxDist: 280,
    });
  }

  // optional shuttle on the stitched 순환로 / 공원길
  let shuttle = null, shuttlePath = null, shuttleDist = 0, shuttleLen = 0;
  try {
    const raw = stitchNamed(ways, /남산공원길|남산남측순환로/);
    if (raw && pathLen(raw) > 180) {
      shuttlePath = resample(raw, 3.2);
      shuttleLen = pathLen(shuttlePath);
      shuttle = createBus('01', 'city', '순환');
      shuttle.name = 'namsan-shuttle';
      group.add(shuttle);
    }
  } catch { /* node tests / missing canvas — skip the bus */ }

  // guide arrows to a door (filled later via api.setDoor)
  const arrowGeo = chevronGeo();
  const arrowMat = new THREE.MeshBasicMaterial({
    color: '#e4b43a', transparent: true, opacity: 0.92, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const guideGroup = new THREE.Group();
  guideGroup.name = 'namsan-guides';
  group.add(guideGroup);

  function addGuide(pts, opts = {}) {
    if (!pts || pts.length < 2) return 0;
    const skipPlaza = !!opts.skipPlaza;
    const rs = resample(pts, 4.4);
    let n = 0;
    for (let i = 0; i < rs.length - 1; i++) {
      const a = rs[i], b = rs[i + 1];
      const hx = b[0] - a[0], hz = b[1] - a[1];
      const L = Math.hypot(hx, hz) || 1;
      const x = a[0], z = a[1];
      if (skipPlaza && Math.hypot(x - NT.tx, z - NT.tz) < 82) continue;
      const y = guideY(x, z, heightAt);
      const m = new THREE.Mesh(arrowGeo, arrowMat);
      m.rotation.order = 'XYZ';
      m.rotation.set(-Math.PI / 2, Math.atan2(hx / L, hz / L), 0);
      m.position.set(x, y, z);
      guideGroup.add(m);
      n++;
    }
    return n;
  }

  let doorGuides = 0;
  function setDoor(door) {
    if (!door) return;
    const dest = [door.x, door.z];
    // spawn (east plaza) — evenly spaced floor chevrons pointing at the door
    const spawn = [door.spawnX ?? NT.tx + 44, door.spawnZ ?? NT.tz + 6];
    doorGuides += addGuide([spawn, dest]);
    // cable upper station
    const ux = -10705.06, uz = -20554.09;
    const viaCable = dijkstra(ways, ux, uz, dest[0], dest[1])
      || [[ux, uz], [-10640, -20510], [-10580, -20470], [NT.tx + 44, NT.tz + 6], dest];
    doorGuides += addGuide(viaCable, { skipPlaza: true });
    // bus stop (first OSM platform)
    if (busStops[0]) {
      const bx = placedStops[0]?.x ?? busStops[0].x;
      const bz = placedStops[0]?.z ?? busStops[0].z;
      let viaBus = dijkstra(ways, bx, bz, dest[0], dest[1]);
      if (!viaBus) {
        const raw = stitchNamed(ways, /남산공원길|남산남측순환로/);
        if (raw && raw.length >= 2) {
          let i0 = 0, i1 = 0, d0 = Infinity, d1 = Infinity;
          for (let i = 0; i < raw.length; i++) {
            const a = Math.hypot(raw[i][0] - bx, raw[i][1] - bz);
            const b = Math.hypot(raw[i][0] - dest[0], raw[i][1] - dest[1]);
            if (a < d0) { d0 = a; i0 = i; }
            if (b < d1) { d1 = b; i1 = i; }
          }
          const slice = i0 <= i1 ? raw.slice(i0, i1 + 1) : raw.slice(i1, i0 + 1).reverse();
          viaBus = [[bx, bz], ...slice, dest];
        } else {
          viaBus = [[bx, bz], dest];
        }
      }
      doorGuides += addGuide(viaBus, { skipPlaza: true });
    }
  }

  function floorY(x, z, refY) {
    for (const h of walkHits) {
      if (nearSeg(x, z, h.segs, h.pad) <= h.pad) {
        const y = heightAt(x, z) + h.dy;
        if (Number.isFinite(refY) && y > refY + 0.55) return null;
        return y;
      }
    }
    return null;
  }

  return {
    group,
    ways,
    busStops,
    placedStops,
    mini: ways.map((w) => ({ k: w.k, p: w.pts, w: w.w })),
    floorY,
    setDoor,
    get doorGuides() { return doorGuides; },
    setNight(v = 0) {
      const k = Math.max(0, Math.min(1, v));
      if (lampLensMat) lampLensMat.color.copy(LENS_DAY).lerp(LENS_NIGHT, k);
      if (lampPoolMat) lampPoolMat.uniforms.uNight.value = k;
      const pool = group.getObjectByName('namsan-streetlight-pool');
      if (pool) pool.visible = k > 0.01;
      yellowMat.emissiveIntensity = k * 0.48;
      whiteMat.emissiveIntensity = k * 0.32;
      roofLit.opacity = k * 0.92;
      roofLit.visible = k > 0.05;
      tubeMat.opacity = k * 0.95;
      tubeMat.visible = k > 0.05;
    },
    update(dt) {
      if (!shuttle || !shuttlePath || shuttleLen < 10) return;
      shuttleDist += dt * 6.5;
      const loop = Math.hypot(shuttlePath[0][0] - shuttlePath[shuttlePath.length - 1][0], shuttlePath[0][1] - shuttlePath[shuttlePath.length - 1][1]) < 28;
      let d, rev = false;
      if (loop) d = shuttleDist % shuttleLen;
      else {
        const span = shuttleLen * 2;
        let u = shuttleDist % span;
        if (u > shuttleLen) { u = span - u; rev = true; }
        d = u;
      }
      const p = pointAt(shuttlePath, d);
      shuttle.position.set(p.x, heightAt(p.x, p.z) + 0.03, p.z);
      const yaw = Math.atan2(p.hx, p.hz) + (rev ? Math.PI : 0);
      shuttle.rotation.y = yaw;
    },
  };
}
