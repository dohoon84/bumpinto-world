// [schoolzone] 학교 풋프린트·차도·횡단보도·이름(OSM)으로 어린이 보호구역 배치를 만든다. three 없음.
// 적색 구간은 학교 정면 횡단보도(없으면 정면 지점)를 중심으로 한 짧은 구간이다. 길 전체를 덮지 않는다.
// 초등학교·유치원·이름이 없는 학교 건물만. 중·고·대학교는 어린이 보호구역이 아니라 뺀다.
// 이름은 데이터에 있을 때만 명판에 쓴다. 야탑초등학교는 코리더 굽기에서 이름이 빠졌고,
// 공공데이터 좌표(37.416616, 127.125627 → 1528.6, -5539.8)가 그 풋프린트 위에 있어 이름으로 둔다.

export const SEG_REACH = 72;   // 정면에서 이 거리(m) 안의 횡단보도를 구역 중심으로
export const SEG_HALF = 42;    // 중심 좌우. 적색 구간 길이 ≤ 84m
export const CAR_KINDS = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'trunk', 'living_street']);

const r2 = (v) => { const n = Math.round(v * 100) / 100; return n === 0 ? 0 : n; };
const hypot = (x, z) => Math.hypot(x, z) || 1;
const unit = (x, z) => { const L = hypot(x, z); return [x / L, z / L]; };

export function schoolLevel(name) {
  if (!name) return 'unknown';
  if (/초등학교|초교/.test(name)) return 'elementary';
  if (/유치원|어린이집/.test(name)) return 'kindergarten';
  if (/대학교|대학$|고등학교|고교/.test(name)) return 'high';
  if (/중학교/.test(name)) return 'middle';
  return 'other';
}

function areaOf(o) {
  let a = 0;
  for (let i = 0; i < o.length; i++) {
    const [x1, z1] = o[i], [x2, z2] = o[(i + 1) % o.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}
function centroid(o) {
  let x = 0, z = 0;
  for (const p of o) { x += p[0]; z += p[1]; }
  return [x / o.length, z / o.length];
}
function inRing(x, z, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) ins = !ins;
  }
  return ins;
}

class Grid {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  add(item, x0, z0, x1, z1) {
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
      const k = i + ',' + j; let L = this.map.get(k); if (!L) this.map.set(k, (L = [])); L.push(item);
    }
  }
  near(x, z, r) {
    const c = this.cell, out = [], seen = new Set();
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
      for (const it of this.map.get(i + ',' + j) || []) if (!seen.has(it)) { seen.add(it); out.push(it); }
    }
    return out;
  }
}

function project(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  const x = ax + dx * t, z = az + dz * t;
  return { x, z, t, d: Math.hypot(x - px, z - pz), L: Math.sqrt(L2) };
}

function dedupBuildings(list) {
  const out = [];
  for (const b of list) {
    if (out.some((o) => Math.hypot(o.x - b.x, o.z - b.z) < 4 && Math.abs(o.a - b.a) < Math.max(80, b.a * 0.25))) continue;
    out.push(b);
  }
  return out;
}

function cluster(buildings) {
  const n = buildings.length, p = buildings.map((_, i) => i);
  const find = (i) => (p[i] === i ? i : (p[i] = find(p[i])));
  const uni = (i, j) => { const a = find(i), b = find(j); if (a !== b) p[a] = b; };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (Math.hypot(buildings[i].x - buildings[j].x, buildings[i].z - buildings[j].z) < 100) uni(i, j);
  }
  const g = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!g.has(r)) g.set(r, []); g.get(r).push(buildings[i]); }
  return [...g.values()];
}

function namesNear(campus, names) {
  const out = [];
  for (const b of campus) for (const nm of names) {
    const d = Math.hypot(nm.x - b.x, nm.z - b.z);
    const inside = d < 110 && inRing(nm.x, nm.z, b.o);
    if (d > 90 && !inside) continue;
    out.push({ ...nm, d, inside });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

function indexRoads(roads) {
  const segs = [];
  const ends = new Map();
  const addEnd = (x, z, seg, at) => {
    const k = Math.round(x) + ',' + Math.round(z);
    let L = ends.get(k); if (!L) ends.set(k, (L = [])); L.push({ seg, at });
  };
  for (const r of roads) {
    if (!CAR_KINDS.has(r.k) || !(r.w >= 5.5) || !r.p || r.p.length < 2) continue;
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.8) continue;
      const seg = { ax, az, bx, bz, w: r.w, k: r.k, L, i: segs.length };
      segs.push(seg);
      addEnd(ax, az, seg, 0);
      addEnd(bx, bz, seg, 1);
    }
  }
  const grid = new Grid(48);
  for (const s of segs) grid.add(s, Math.min(s.ax, s.bx), Math.min(s.az, s.bz), Math.max(s.ax, s.bx), Math.max(s.az, s.bz));
  return { segs, ends, grid };
}

function nearestRoad(idx, x, z) {
  let best = null;
  for (const s of idx.grid.near(x, z, 100)) {
    const q = project(x, z, s.ax, s.az, s.bx, s.bz);
    if (q.d > 95) continue;
    // 넓은 정면 도로를 골목보다 우선한다 (학교는 운동장 때문에 차도에서 수십 미터 물러나 있다).
    const score = q.d + (s.w < 9 ? 22 : 0) + (s.w < 7 ? 28 : 0);
    if (!best || score < best.score) best = { ...q, seg: s, score };
  }
  return best;
}

function endsNear(idx, x, z) {
  const out = [], ix = Math.round(x), iz = Math.round(z);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    for (const e of idx.ends.get((ix + dx) + ',' + (iz + dz)) || []) {
      const ex = e.at ? e.seg.bx : e.seg.ax, ez = e.at ? e.seg.bz : e.seg.az;
      if (Math.hypot(ex - x, ez - z) < 2.4) out.push(e);
    }
  }
  return out;
}
function stepFrom(idx, seg, at, incoming) {
  const x = at ? seg.bx : seg.ax, z = at ? seg.bz : seg.az;
  let best = null;
  for (const e of endsNear(idx, x, z)) {
    if (e.seg === seg) continue;
    const forward = e.at === 0 ? [e.seg.bx - e.seg.ax, e.seg.bz - e.seg.az] : [e.seg.ax - e.seg.bx, e.seg.az - e.seg.bz];
    const [fx, fz] = unit(forward[0], forward[1]);
    const dot = fx * incoming[0] + fz * incoming[1];
    if (dot < 0.3) continue;
    const score = dot - Math.abs(e.seg.w - seg.w) * 0.015;
    if (!best || score > best.score) best = { seg: e.seg, score };
  }
  return best;
}

/** 투영점에서 budget 미터. dirSign>0 이면 B 쪽으로. */
function walk(idx, hit, dirSign, budget) {
  const pts = [];
  let seg = hit.seg;
  let x = hit.x, z = hit.z;
  let goingToB = dirSign > 0;
  let left = budget;
  for (let guard = 0; left > 0.4 && guard < 48; guard++) {
    const dest = goingToB ? [seg.bx, seg.bz] : [seg.ax, seg.az];
    const L = Math.hypot(dest[0] - x, dest[1] - z);
    const incoming = L > 0.05 ? unit(dest[0] - x, dest[1] - z) : (goingToB ? unit(seg.bx - seg.ax, seg.bz - seg.az) : unit(seg.ax - seg.bx, seg.az - seg.bz));
    if (L >= left && L > 0.05) {
      pts.push([r2(x + incoming[0] * left), r2(z + incoming[1] * left)]);
      break;
    }
    if (L > 0.05) { left -= L; x = dest[0]; z = dest[1]; pts.push([r2(x), r2(z)]); }
    const arrivedAt = goingToB ? 1 : 0;
    const cont = stepFrom(idx, seg, arrivedAt, incoming);
    if (!cont) break;
    seg = cont.seg;
    goingToB = Math.hypot(seg.ax - x, seg.az - z) <= Math.hypot(seg.bx - x, seg.bz - z);
  }
  return pts;
}

function polyline(idx, hit) {
  const back = walk(idx, hit, -1, SEG_REACH + SEG_HALF);
  const fore = walk(idx, hit, 1, SEG_REACH + SEG_HALF);
  const pts = [...back.reverse(), [r2(hit.x), r2(hit.z)], ...fore];
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.4) out.push(p);
  }
  return out.length >= 2 ? out : [[r2(hit.x - 8), r2(hit.z)], [r2(hit.x + 8), r2(hit.z)]];
}

function polyLen(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return s;
}
function sampleAt(pts, acc, s) {
  if (s <= 0) return { x: pts[0][0], z: pts[0][1], tx: 1, tz: 0 };
  const total = acc[acc.length - 1];
  if (s >= total) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const [tx, tz] = unit(b[0] - a[0], b[1] - a[1]);
    return { x: b[0], z: b[1], tx, tz };
  }
  let i = 1;
  while (acc[i] < s) i++;
  const span = acc[i] - acc[i - 1] || 1, t = (s - acc[i - 1]) / span;
  const a = pts[i - 1], b = pts[i];
  const [tx, tz] = unit(b[0] - a[0], b[1] - a[1]);
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx, tz };
}
function projectPoly(pts, acc, x, z) {
  let best = null;
  for (let i = 1; i < pts.length; i++) {
    const q = project(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    const s = acc[i - 1] + q.t * (acc[i] - acc[i - 1]);
    if (!best || q.d < best.d) best = { ...q, s };
  }
  return best;
}

function facingWall(b, road) {
  let best = null;
  const [cx, cz] = [b.x, b.z];
  const ring = b.o;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], c = ring[(i + 1) % ring.length];
    const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 8) continue;
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
    let nx = -dz / L, nz = dx / L;
    if (nx * (cx - mx) + nz * (cz - mz) > 0) { nx = -nx; nz = -nz; } // 밖을 보게
    const vx = road.x - mx, vz = road.z - mz;
    const face = (nx * vx + nz * vz) / (Math.hypot(vx, vz) || 1);
    if (face < 0.35) continue;
    const score = face * 2 + Math.min(L, 40) / 40 - Math.hypot(vx, vz) / 80;
    if (!best || score > best.score) best = { a, c, L, mx, mz, nx, nz, tx: dx / L, tz: dz / L, score };
  }
  return best;
}

function zoneOf(campus, nameHit, idx, crossings) {
  const main = campus.reduce((a, b) => (a.a > b.a ? a : b));
  const name = nameHit?.name || null;
  const level = name ? schoolLevel(name) : 'unknown';
  if (level === 'middle' || level === 'high' || level === 'other') return null;
  if (!name && main.k === 'kindergarten') return null;
  if (!name && (main.k !== 'school' || main.a < 1000 || main.h < 9 || main.h > 32)) return null;
  let hit = null;
  for (const b of campus) {
    const q = nearestRoad(idx, b.x, b.z);
    if (q && (!hit || q.d < hit.d)) hit = q;
  }
  if (!hit) return null;
  const pts = polyline(idx, hit);
  const acc = polyLen(pts);
  const front = projectPoly(pts, acc, main.x, main.z);
  const onRoad = crossings.map((c) => ({ c, q: projectPoly(pts, acc, c.x, c.z) })).filter((o) => o.q && o.q.d < Math.max(8, hit.seg.w * 0.65) && Math.abs(o.q.s - front.s) < SEG_REACH);
  onRoad.sort((a, b) => Math.abs(a.q.s - front.s) - Math.abs(b.q.s - front.s));
  const anchorS = onRoad.length ? onRoad[0].q.s : front.s;
  const total = acc[acc.length - 1];
  const s0 = Math.max(0, anchorS - SEG_HALF), s1 = Math.min(total, anchorS + SEG_HALF);
  if (s1 - s0 < 28) return null;
  const samples = [];
  for (let s = s0; s <= s1 + 0.01; s += 8) samples.push(sampleAt(pts, acc, Math.min(s, s1)));
  const last = sampleAt(pts, acc, s1);
  if (Math.hypot(samples[samples.length - 1].x - last.x, samples[samples.length - 1].z - last.z) > 1) samples.push(last);
  const roadW = hit.seg.w;
  const redW = Math.min(roadW - 0.35, 11.6);
  const chosen = onRoad.filter((o) => o.q.s >= s0 - 1 && o.q.s <= s1 + 1).slice(0, 2);
  const marks = [];
  const placeMark = (s, kind, faceSign) => {
    if (s < s0 + 5 || s > s1 - 5) return;
    const p = sampleAt(pts, acc, s);
    const fwd = faceSign < 0 ? [-p.tx, -p.tz] : [p.tx, p.tz];
    const w = kind === 'disc' ? Math.min(6.2, redW * 0.86) : Math.min(15.2, Math.max(10, (s1 - s0) * 0.22));
    const h = kind === 'disc' ? w : Math.min(3.05, redW * 0.5);
    marks.push({ kind, x: r2(p.x), z: r2(p.z), fx: r2(fwd[0]), fz: r2(fwd[1]), w: r2(w), h: r2(h) });
  };
  if (chosen.length) {
    const sC = chosen[0].q.s;
    placeMark(sC - 30, 'text', 1);
    placeMark(sC - 16, 'disc', 1);
    placeMark(sC + 16, 'disc', -1);
    placeMark(sC + 30, 'text', -1);
  } else {
    const mid = (s0 + s1) / 2;
    placeMark(mid - 12, 'text', 1);
    placeMark(mid + 8, 'disc', 1);
  }
  const stops = [];
  for (const o of chosen) {
    const p = sampleAt(pts, acc, o.q.s);
    const [dx, dz] = [p.tx, p.tz];
    const [qx, qz] = unit(-dz, dx);
    for (const sgn of [-1, 1]) {
      const s = o.q.s + sgn * 5.7;
      if (s < s0 + 1 || s > s1 - 1) continue;
      const at = sampleAt(pts, acc, s);
      stops.push({ x: r2(at.x), z: r2(at.z), dx: r2(dx * sgn > 0 ? dx : dx), dz: r2(dz), qx: r2(qx), qz: r2(qz), w: r2(redW - 0.45), t: 0.58, sgn });
    }
  }
  // stop line should be perpendicular; dx/dz above is the road tangent (thin axis). Keep tangent of the sample.
  for (const st of stops) {
    const at = sampleAt(pts, acc, projectPoly(pts, acc, st.x, st.z).s);
    st.dx = r2(at.tx); st.dz = r2(at.tz);
    const [qx, qz] = unit(-at.tz, at.tx);
    st.qx = r2(qx); st.qz = r2(qz);
  }
  const sideOfSchool = (() => {
    const mid = sampleAt(pts, acc, (s0 + s1) / 2);
    const vx = main.x - mid.x, vz = main.z - mid.z;
    const lx = -mid.tz, lz = mid.tx; // left of +s
    return (lx * vx + lz * vz) >= 0 ? 1 : -1;
  })();
  const signs = [];
  for (const [s, face] of [[s0 + 7, -1], [s1 - 7, 1]]) {
    const p = sampleAt(pts, acc, s);
    const off = roadW / 2 + 1.45;
    const lx = -p.tz * sideOfSchool, lz = p.tx * sideOfSchool;
    const n = face < 0 ? unit(-p.tx, -p.tz) : unit(p.tx, p.tz);
    signs.push({ x: r2(p.x + lx * off), z: r2(p.z + lz * off), nx: r2(n[0]), nz: r2(n[1]) });
  }
  let plate = null;
  if (name && (level === 'elementary' || level === 'kindergarten')) {
    const host = campus.reduce((a, b) => Math.hypot(a.x - nameHit.x, a.z - nameHit.z) < Math.hypot(b.x - nameHit.x, b.z - nameHit.z) ? a : b);
    const wall = facingWall(host, { x: hit.x, z: hit.z });
    if (wall) {
      const along = wall.L * 0.5;
      const px = wall.a[0] + wall.tx * along, pz = wall.a[1] + wall.tz * along;
      plate = {
        text: name,
        x: r2(px + wall.nx * 0.22), y: r2(Math.min(5.2, Math.max(3.3, host.h * 0.32))), z: r2(pz + wall.nz * 0.22),
        w: r2(Math.min(10.6, wall.L * 0.62)), h: 2.35,
        nx: r2(wall.nx), nz: r2(wall.nz), tx: r2(wall.tx), tz: r2(wall.tz),
      };
    }
  }
  const crossingsOut = chosen.map((o) => {
    const p = sampleAt(pts, acc, o.q.s);
    return { x: r2(o.c.x), z: r2(o.c.z), dir: [r2(p.tx), r2(p.tz)], w: o.c.w || roadW, depth: (o.c.w || roadW) >= 10 ? 2.2 : 1.8 };
  });
  return {
    id: (name || 'school') + '@' + Math.round(main.x) + ',' + Math.round(main.z),
    name, level,
    x: r2(main.x), z: r2(main.z),
    len: r2(s1 - s0),
    roadW: r2(roadW),
    redW: r2(redW),
    samples: samples.map((p) => [r2(p.x), r2(p.z)]),
    crossings: crossingsOut,
    marks, stops, signs, plate,
  };
}

/**
 * @param {{ buildings: {k:string,h:number,o:number[][]}[], roads: {k:string,w:number,p:number[][]}[], crossings: {x:number,z:number,dir?:number[],w?:number}[], names: {x:number,z:number,name:string}[] }} world
 */
export function planSchoolZones(world) {
  const raw = [];
  for (const b of world.buildings || []) {
    if (b.k !== 'school' && b.k !== 'kindergarten') continue;
    if (!b.o || b.o.length < 3) continue;
    const a = areaOf(b.o);
    if (a < 220) continue;
    const [x, z] = centroid(b.o);
    raw.push({ k: b.k, h: b.h || 9, o: b.o, a, x, z });
  }
  const buildings = dedupBuildings(raw);
  const idx = indexRoads(world.roads || []);
  const zones = [];
  for (const campus of cluster(buildings)) {
    const near = namesNear(campus, world.names || []);
    const child = near.find((n) => { const lv = schoolLevel(n.name); return lv === 'elementary' || lv === 'kindergarten'; });
    const older = near.find((n) => { const lv = schoolLevel(n.name); return lv === 'middle' || lv === 'high' || lv === 'other'; });
    if (!child && older && older.d < 75) continue; // 중·고·대학 캠퍼스
    const z = zoneOf(campus, child || null, idx, world.crossings || []);
    if (z) zones.push(z);
  }
  const byName = new Map();
  for (const z of zones) {
    if (!z.name) continue;
    const pts = (world.names || []).filter((n) => n.name === z.name);
    const d = pts.length ? Math.min(...pts.map((n) => Math.hypot(n.x - z.x, n.z - z.z))) : 0;
    const prev = byName.get(z.name);
    if (!prev || d < prev.d) byName.set(z.name, { z, d });
  }
  for (const z of zones) {
    if (!z.name) continue;
    if (byName.get(z.name).z !== z) { z.name = null; z.plate = null; z.level = 'unknown'; z.id = 'school@' + Math.round(z.x) + ',' + Math.round(z.z); }
  }
  zones.sort((a, b) => a.z - b.z || a.x - b.x);
  return zones;
}

export const YATAP_NAME = { x: 1528.6, z: -5539.8, name: '야탑초등학교' };
