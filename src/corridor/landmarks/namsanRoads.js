// [namsan] OSM 남산공원길·순환로·산책로·계단을 지형 위에 깔고, 상단 버스 정류장과 입구 안내를 둔다.
//   브랜드 로고 없음. 정류장 이름은 OSM 표기(남산서울타워)만 쓴다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ribbonGeo, fixNormalsUp } from '../../world.js';
import { paint } from '../tileMesh.js';
import { createBus } from '../../transit/busModel.js';
import { NT } from './namsanCoords.js';

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
  const snap = (x, z) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
      if (d < bd) { bd = d; best = i; }
    }
    return bd < 36 ? best : -1;
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

function arrowTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 64);
  x.fillStyle = '#f0d36a';
  x.beginPath();
  x.moveTo(118, 32); x.lineTo(18, 8); x.lineTo(18, 22); x.lineTo(72, 32); x.lineTo(18, 42); x.lineTo(18, 56);
  x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  const curbGeos = [], lineGeos = [], railGeos = [];
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
    if (isCar) carGeos.push(paint(geo, '#3a3d42'));
    else if (isStep) stepGeos.push(paint(geo, '#9a9080'));
    else pathGeos.push(paint(geo, '#7a6b52'));
    walkHits.push({ segs: segsOf(pts), pad: width * 0.5 + 0.35, dy });

    if (isCar) {
      curbGeos.push(paint(fixNormalsUp(ribbonGeo(elevated(pts, heightAt, dy + 0.05), width + 0.42, 0, false)), '#5a5854'));
      if (width >= 6) lineGeos.push(paint(fixNormalsUp(ribbonGeo(elevated(pts, heightAt, dy + 0.03), 0.16, 0, false)), '#e6c15a'));
      const namedLoop = /남산공원길|순환로/.test(w.name || '');
      if (namedLoop) {
        let acc = 0;
        for (let i = 1; i < pts.length; i++) {
          const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          acc += L;
          if (acc >= 20) {
            const hx = (pts[i][0] - pts[i - 1][0]) / (L || 1);
            const hz = (pts[i][1] - pts[i - 1][1]) / (L || 1);
            lampPts.push({ x: pts[i][0] - hz * (width * 0.5 + 0.45), z: pts[i][1] + hx * (width * 0.5 + 0.45), h: 4.1 });
            acc = 0;
          }
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
  addMerged(curbGeos, 'namsan-curbs');
  addMerged(carGeos, 'namsan-car-roads');
  addMerged(pathGeos, 'namsan-paths');
  addMerged(stepGeos, 'namsan-steps');
  addMerged(treadGeos, 'namsan-treads');
  addMerged(lineGeos, 'namsan-centerline');
  addMerged(railGeos, 'namsan-rails');

  const lampPole = new THREE.MeshLambertMaterial({ color: '#2a2e34' });
  const lampBulb = new THREE.MeshBasicMaterial({ color: '#ffd89a', transparent: true, opacity: 0, fog: false });
  const lampGlow = new THREE.MeshBasicMaterial({
    color: '#ffc878', transparent: true, opacity: 0, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
  });
  for (const p of lampPts) {
    const y = heightAt(p.x, p.z);
    const h = p.h || 4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 6), lampPole);
    pole.position.set(p.x, y + h / 2, p.z); group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lampBulb);
    bulb.position.set(p.x, y + h + 0.12, p.z); group.add(bulb);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), lampGlow);
    glow.position.set(p.x, y + h + 0.12, p.z); group.add(glow);
  }

  // bus stop shelters at OSM 남산서울타워 platforms
  const busStops = osm?.busStops || [];
  const roofLit = new THREE.MeshBasicMaterial({ color: '#ffd89a', transparent: true, opacity: 0, fog: false });
  for (const s of busStops) {
    const y = heightAt(s.x, s.z);
    // face the nearest car road
    let hx = 0, hz = 1;
    let nearest = Infinity, nrmx = 0, nrmz = 1;
    for (const w of ways) {
      if (!CAR.has(w.k)) continue;
      const pts = w.pts;
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const t = Math.max(0, Math.min(1, ((s.x - ax) * (bx - ax) + (s.z - az) * (bz - az)) / (L * L)));
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        const d = Math.hypot(px - s.x, pz - s.z);
        if (d < nearest) {
          nearest = d;
          hx = (bx - ax) / L; hz = (bz - az) / L;
          nrmx = -hz; nrmz = hx;
          if ((s.x - px) * nrmx + (s.z - pz) * nrmz < 0) { nrmx = -nrmx; nrmz = -nrmz; }
        }
      }
    }
    const sx = s.x, sz = s.z;
    const ang = Math.atan2(hx, hz);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 2.2), new THREE.MeshLambertMaterial({ color: '#8a8680' }));
    pad.position.set(sx, y + 0.06, sz); pad.rotation.y = ang; group.add(pad);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 2.0), new THREE.MeshLambertMaterial({ color: '#2c3340' }));
    roof.position.set(sx, y + 2.55, sz); roof.rotation.y = ang; group.add(roof);
    const lit = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.04, 1.6), roofLit);
    lit.position.set(sx, y + 2.48, sz); lit.rotation.y = ang; group.add(lit);
    for (const u of [-1.7, 1.7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), new THREE.MeshLambertMaterial({ color: '#3a4048' }));
      post.position.set(sx + hx * u - nrmx * 0.85, y + 1.25, sz + hz * u - nrmz * 0.85);
      group.add(post);
    }
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.45), new THREE.MeshLambertMaterial({ color: '#6a5644' }));
    bench.position.set(sx - nrmx * 0.35, y + 0.48, sz - nrmz * 0.35); bench.rotation.y = ang; group.add(bench);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.6), new THREE.MeshBasicMaterial({ map: signTex('남산서울타워', '정류장'), transparent: true }));
    plate.position.set(sx + nrmx * 0.15, y + 2.15, sz + nrmz * 0.15);
    plate.rotation.y = Math.atan2(nrmx, nrmz);
    group.add(plate);
  }
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
  const arrowMap = arrowTex();
  const arrowMat = new THREE.MeshBasicMaterial({
    map: arrowMap, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    color: '#ffffff',
  });
  const guideGroup = new THREE.Group();
  guideGroup.name = 'namsan-guides';
  group.add(guideGroup);

  function addGuide(pts) {
    if (!pts || pts.length < 2) return 0;
    const rs = resample(pts, 4.2);
    let n = 0;
    for (let i = 0; i < rs.length - 1; i++) {
      const a = rs[i], b = rs[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const x = a[0], z = a[1];
      const y = heightAt(x, z) + 0.12;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.62), arrowMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -heading;
      m.position.set(x, y, z);
      guideGroup.add(m);
      n++;
      void L;
    }
    return n;
  }

  let doorGuides = 0;
  function setDoor(door) {
    if (!door) return;
    const dest = [door.x, door.z];
    // spawn (east plaza) — short straight
    doorGuides += addGuide([[door.spawnX ?? NT.tx + 44, door.spawnZ ?? NT.tz + 6], dest]);
    // cable upper station
    const ux = -10705.06, uz = -20554.09;
    const viaCable = dijkstra(ways, ux, uz, dest[0], dest[1])
      || [[ux, uz], [-10640, -20510], [-10580, -20470], [NT.tx + 44, NT.tz + 6], dest];
    doorGuides += addGuide(viaCable);
    // bus stop (first OSM platform)
    if (busStops[0]) {
      const viaBus = dijkstra(ways, busStops[0].x, busStops[0].z, dest[0], dest[1])
        || [[busStops[0].x, busStops[0].z], dest];
      doorGuides += addGuide(viaBus);
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
    mini: ways.map((w) => ({ k: w.k, p: w.pts, w: w.w })),
    floorY,
    setDoor,
    get doorGuides() { return doorGuides; },
    setNight(v = 0) {
      const k = Math.max(0, Math.min(1, v));
      lampBulb.opacity = k;
      lampGlow.opacity = k * 0.45;
      lampBulb.visible = k > 0.05;
      lampGlow.visible = k > 0.05;
      roofLit.opacity = k * 0.7;
      roofLit.visible = k > 0.05;
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
