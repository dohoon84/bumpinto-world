// 역 260m 보행망이 끊긴 카페까지, 기존 길을 따라 인도를 이어 가게 앞에 붙인다.
export const CAFE_WALK_NAMES = ['스타벅스 정자동', '봉명동내커피', "Sam's", 'Café De Yun'];

const Q = 2;
const quant = (x, z) => Math.round(x / Q) + ',' + Math.round(z / Q);

function hypot(x, z) { return Math.hypot(x, z); }

function pointInRing(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function ringCenter(ring) {
  let x = 0, z = 0;
  for (const p of ring) { x += p[0]; z += p[1]; }
  return [x / ring.length, z / ring.length];
}

function makeBlocker(buildings) {
  const cell = 48, map = new Map();
  const add = (b, minX, minZ, maxX, maxZ) => {
    for (let i = Math.floor(minX / cell); i <= Math.floor(maxX / cell); i++) {
      for (let j = Math.floor(minZ / cell); j <= Math.floor(maxZ / cell); j++) {
        const k = i + ',' + j; if (!map.has(k)) map.set(k, []); map.get(k).push(b);
      }
    }
  };
  for (const b of buildings) {
    let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
    for (const [x, z] of b.o) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mnz = Math.min(mnz, z); mxz = Math.max(mxz, z); }
    b._box = [mnx, mnz, mxx, mxz];
    add(b, mnx, mnz, mxx, mxz);
  }
  return (x, z) => {
    const list = map.get(Math.floor(x / cell) + ',' + Math.floor(z / cell)) || [];
    for (const b of list) {
      const [mnx, mnz, mxx, mxz] = b._box;
      if (x < mnx || x > mxx || z < mnz || z > mxz) continue;
      if (pointInRing(x, z, b.o) && !(b.holes || []).some((h) => pointInRing(x, z, h))) return true;
    }
    return false;
  };
}

function makeSegIndex(roads, pred) {
  const cell = 30, map = new Map();
  for (const r of roads) {
    if (pred && !pred(r)) continue;
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
      const hw = (r.w || 4) / 2;
      const item = { ax, az, bx, bz, hw, kind: r.k };
      const x0 = Math.min(ax, bx) - hw, x1 = Math.max(ax, bx) + hw, z0 = Math.min(az, bz) - hw, z1 = Math.max(az, bz) + hw;
      for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
        for (let gz = Math.floor(z0 / cell); gz <= Math.floor(z1 / cell); gz++) {
          const k = gx + ',' + gz; if (!map.has(k)) map.set(k, []); map.get(k).push(item);
        }
      }
    }
  }
  const near = (x, z, pad) => {
    const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
    const list = [];
    for (let i = gx - 1; i <= gx + 1; i++) for (let j = gz - 1; j <= gz + 1; j++) {
      const bucket = map.get(i + ',' + j); if (bucket) list.push(...bucket);
    }
    let best = Infinity, hit = null;
    for (const s of list) {
      const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
      const d = hypot(s.ax + dx * t - x, s.az + dz * t - z);
      if (d < best) { best = d; hit = s; }
    }
    return best < (pad ?? Infinity) ? { d: best, seg: hit } : null;
  };
  return { near };
}

function hostBuilding(buildings, x, z) {
  for (const b of buildings) {
    const [mnx, mnz, mxx, mxz] = b._box;
    if (x < mnx || x > mxx || z < mnz || z > mxz) continue;
    if (pointInRing(x, z, b.o) && !(b.holes || []).some((h) => pointInRing(x, z, h))) return b;
  }
  return null;
}

function facadeWalk(b, cafe, street, blocked) {
  const [cx, cz] = ringCenter(b.o);
  let edge = null, best = Infinity;
  for (let i = 0; i < b.o.length; i++) {
    const [ax, az] = b.o[i], [bx, bz] = b.o[(i + 1) % b.o.length];
    const L = hypot(bx - ax, bz - az);
    if (L < 2.5) continue;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const d = hypot(mx - street.x, mz - street.z);
    if (d < best) { best = d; edge = { ax, az, bx, bz, L, mx, mz }; }
  }
  if (!edge) return [];
  let nx = -(edge.bz - edge.az) / edge.L, nz = (edge.bx - edge.ax) / edge.L;
  if ((edge.mx + nx - cx) * (edge.mx - cx) + (edge.mz + nz - cz) * (edge.mz - cz) < 0) { nx = -nx; nz = -nz; }
  const dx = (edge.bx - edge.ax) / edge.L, dz = (edge.bz - edge.az) / edge.L;
  const rel = (cafe.x - edge.ax) * dx + (cafe.z - edge.az) * dz;
  const doorU = Math.max(0, Math.min(edge.L, rel));
  const pts = [];
  for (let u = doorU - 28; u <= doorU + 28; u += 4) {
    const px = edge.ax + dx * u, pz = edge.az + dz * u;
    let placed = null;
    for (const gap of [1.85, 2.7, 3.5]) {
      const x = px + nx * gap, z = pz + nz * gap;
      if (!blocked(x, z)) { placed = [x, z]; break; }
    }
    if (placed) pts.push(placed);
  }
  return pts;
}

function closestSegment(roads, x, z) {
  let best = null;
  for (const r of roads) {
    if (!r.walk || r.cafeLink) continue;
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const px = ax + dx * t, pz = az + dz * t, d = hypot(px - x, pz - z);
      if (!best || d < best.d) best = { x: px, z: pz, d, ax, az, bx, bz, half: (r.w || 4) / 2, kind: r.k, bridge: !!r.br };
    }
  }
  return best;
}

function buildGraph(roads) {
  const nodes = new Map();
  const nodeAt = (x, z) => {
    const k = quant(x, z);
    if (!nodes.has(k)) nodes.set(k, { x, z, edges: [] });
    return nodes.get(k);
  };
  for (const r of roads) {
    if (!r.walk || r.p.length < 2 || r.cafeLink) continue;
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
      const a = nodeAt(ax, az), b = nodeAt(bx, bz);
      const w = hypot(bx - ax, bz - az);
      if (w < 0.4 || a === b) continue;
      const meta = { half: (r.w || 4) / 2, kind: r.k, bridge: !!r.br };
      a.edges.push({ to: b, w, ax, az, bx, bz, ...meta });
      b.edges.push({ to: a, w, ax: bx, az: bz, bx: ax, bz: az, ...meta });
    }
  }
  return nodes;
}

function routeTo(nodes, seeds, goal) {
  const dist = new Map(), prev = new Map();
  const heap = [];
  const up = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p].d <= heap[i].d) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const push = (n, d) => { heap.push({ n, d }); up(heap.length - 1); };
  const pop = () => {
    const top = heap[0]; const last = heap.pop();
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) {
        let s = i, l = i * 2 + 1, r = l + 1;
        if (l < heap.length && heap[l].d < heap[s].d) s = l;
        if (r < heap.length && heap[r].d < heap[s].d) s = r;
        if (s === i) break;
        [heap[s], heap[i]] = [heap[i], heap[s]]; i = s;
      }
    }
    return top;
  };
  for (const s of seeds) { dist.set(s, 0); push(s, 0); }
  while (heap.length) {
    const { n, d } = pop();
    if (d !== dist.get(n)) continue;
    if (n === goal) break;
    for (const e of n.edges) {
      const nd = d + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { e, from: n }); push(e.to, nd); }
    }
  }
  if (!prev.has(goal) && !dist.has(goal)) return null;
  const segs = [];
  let cur = goal;
  while (prev.has(cur)) { const p = prev.get(cur); segs.push(p.e); cur = p.from; }
  segs.reverse();
  return { segs, start: cur };
}

function densifyRoute(segs, start) {
  const out = [];
  const push = (x, z, meta) => {
    const last = out[out.length - 1];
    if (last && hypot(last.x - x, last.z - z) < 0.8) return;
    out.push({ x, z, ...meta });
  };
  if (!segs.length) { push(start.x, start.z, { half: 2, kind: 'footway', bridge: false }); return out; }
  for (const e of segs) {
    const L = e.w, n = Math.max(1, Math.ceil(L / 7));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      push(e.ax + (e.bx - e.ax) * t, e.az + (e.bz - e.az) * t, { half: e.half, kind: e.kind, bridge: e.bridge });
    }
  }
  const tail = segs[segs.length - 1];
  push(tail.bx, tail.bz, { half: tail.half, kind: tail.kind, bridge: tail.bridge });
  return out;
}

const SIDE = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'steps']);

function canStep(a, b, blocked, onCar, onSide) {
  const L = hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 0.4) return true;
  if (L > 16) return false;
  const n = Math.max(1, Math.ceil(L / 2));
  let carRun = 0;
  for (let k = 1; k <= n; k++) {
    const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    if (blocked(x, z)) return false;
    if (onCar(x, z) && !onSide(x, z)) carRun += L / n; else carRun = 0;
    if (carRun > 8) return false;
  }
  return true;
}

function pushStep(poly, p, blocked, onCar, onSide) {
  if (blocked(p[0], p[1])) return false;
  const last = poly[poly.length - 1];
  if (!last) { poly.push(p); return true; }
  if (hypot(last[0] - p[0], last[1] - p[1]) < 1.8) return true;
  if (!canStep(last, p, blocked, onCar, onSide)) return false;
  poly.push(p);
  return true;
}

function offsetRoute(samples, cafe, blocked, onCar, onSide, low) {
  const out = [];
  let prevSign = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const L = hypot(dx, dz) || 1; dx /= L; dz /= L;
    const lx = -dz, lz = dx;
    const sideOfCafe = (cafe.x - s.x) * lx + (cafe.z - s.z) * lz;
    const prefer = sideOfCafe >= 0 ? 1 : -1;
    const nearCafe = hypot(s.x - cafe.x, s.z - cafe.z) < 90;
    const signs = nearCafe ? [prefer, -prefer] : (prevSign ? [prevSign, -prevSign] : [prefer, -prefer]);
    const cands = [];
    if (s.bridge) cands.push([s.x, s.z]);
    else if (SIDE.has(s.kind)) {
      for (const gap of [0, 1.5, -1.5]) cands.push([s.x + lx * gap, s.z + lz * gap]);
    } else {
      for (const sign of signs) for (const extra of [1.35, 2.4, 0.8]) cands.push([s.x + lx * sign * (s.half + extra), s.z + lz * sign * (s.half + extra)]);
    }
    let placed = false;
    for (const c of cands) {
      if (low(c[0], c[1])) continue;
      if (pushStep(out, c, blocked, onCar, onSide)) { placed = true; const gap = (c[0] - s.x) * lx + (c[1] - s.z) * lz; if (Math.abs(gap) > 0.4) prevSign = Math.sign(gap); break; }
    }
    if (!placed) continue;
  }
  return out;
}

function attachFront(poly, face, cafe, blocked, onCar, onSide) {
  if (!face.length || !poly.length) return;
  let door = face[0], best = Infinity, di = 0;
  face.forEach((p, i) => {
    const d = hypot(p[0] - cafe.x, p[1] - cafe.z);
    if (d < best) { best = d; door = p; di = i; }
  });
  let dx = door[0] - cafe.x, dz = door[1] - cafe.z; const L = hypot(dx, dz) || 1; dx /= L; dz /= L;
  const hops = [door];
  for (let g = 3; g <= 15; g += 3) hops.push([door[0] + dx * g, door[1] + dz * g]);
  let linked = false;
  for (let i = hops.length - 1; i >= 0 && !linked; i--) {
    if (blocked(hops[i][0], hops[i][1]) || onCar(hops[i][0], hops[i][1])) continue;
    if (!pushStep(poly, hops[i], blocked, onCar, onSide)) continue;
    for (let j = i - 1; j >= 0; j--) pushStep(poly, hops[j], blocked, onCar, onSide);
    linked = true;
  }
  if (!linked) return;
  const left = face.slice(0, di).reverse(), right = face.slice(di + 1);
  const go = (seq) => { for (const p of seq) if (!pushStep(poly, p, blocked, onCar, onSide)) break; };
  const last = poly[poly.length - 1];
  const dl = left[0] ? hypot(last[0] - left[0][0], last[1] - left[0][1]) : Infinity;
  const dr = right[0] ? hypot(last[0] - right[0][0], last[1] - right[0][1]) : Infinity;
  if (dl <= dr) { go(left); go(right); } else { go(right); go(left); }
}

function arcDoor(pts, cafe) {
  let acc = 0, door = 0, best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = hypot(pts[i][0] - cafe.x, pts[i][1] - cafe.z);
    if (d < best) { best = d; door = acc; }
    if (i + 1 < pts.length) acc += hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  return { door, best, len: acc };
}

export function planCafeSidewalks(data) {
  const st = data.station;
  const blocked = makeBlocker(data.buildings);
  const car = makeSegIndex(data.roads, (r) => !r.cafeLink && !SIDE.has(r.k) && r.k !== 'living_street');
  const side = makeSegIndex(data.roads, (r) => !r.cafeLink && SIDE.has(r.k));
  const onSide = (x, z) => !!side.near(x, z, 2.4);
  const onCar = (x, z) => {
    const hit = car.near(x, z, 40);
    return !!(hit && hit.d < hit.seg.hw - 0.15);
  };
  const low = (x, z) => !!(data.heightAt && data.heightAt(x, z) < -0.3);
  const nodes = buildGraph(data.roads);
  const seeds = [];
  for (const n of nodes.values()) if (hypot(n.x - st.x, n.z - st.z) < 255) seeds.push(n);
  const roads = [];
  for (const name of CAFE_WALK_NAMES) {
    const cafe = data.labels.find((l) => l.text === name && l.kind === 'cafe');
    if (!cafe) continue;
    const seg = closestSegment(data.roads, cafe.x, cafe.z);
    if (!seg) continue;
    const endA = hypot(seg.ax - seg.x, seg.az - seg.z) <= hypot(seg.bx - seg.x, seg.bz - seg.z);
    const end = endA ? { x: seg.ax, z: seg.az } : { x: seg.bx, z: seg.bz };
    let goal = null, goalD = Infinity;
    for (const n of nodes.values()) {
      const d = hypot(n.x - end.x, n.z - end.z);
      if (d < goalD) { goalD = d; goal = n; }
    }
    if (!goal) continue;
    const routed = routeTo(nodes, seeds, goal);
    if (!routed) continue;
    const samples = densifyRoute(routed.segs, routed.start);
    const tail = samples[samples.length - 1] || { x: routed.start.x, z: routed.start.z };
    const span = hypot(seg.x - tail.x, seg.z - tail.z);
    const steps = Math.max(1, Math.ceil(span / 6));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      samples.push({ x: tail.x + (seg.x - tail.x) * t, z: tail.z + (seg.z - tail.z) * t, half: seg.half, kind: seg.kind, bridge: seg.bridge });
    }
    const poly = offsetRoute(samples, cafe, blocked, onCar, onSide, low);
    const street = { x: seg.x, z: seg.z };
    const host = hostBuilding(data.buildings, cafe.x, cafe.z);
    const face = host ? facadeWalk(host, cafe, street, blocked) : [];
    attachFront(poly, face, cafe, blocked, onCar, onSide);
    if (routed.start && !poly.some(([x, z]) => hypot(x - st.x, z - st.z) < 260)) poly.unshift([routed.start.x, routed.start.z]);
    const simp = [];
    for (const p of poly) {
      const last = simp[simp.length - 1];
      if (last && hypot(last[0] - p[0], last[1] - p[1]) < 2) continue;
      simp.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, 0.03]);
    }
    if (simp.length < 2) continue;
    const { door, best, len } = arcDoor(simp, cafe);
    roads.push({ p: simp, w: 2.2, k: 'footway', walk: 1, n: name, cafeLink: 1, door, _reach: best, _len: len });
  }
  return roads;
}

export function addCafeSidewalks(data) {
  if (data.roads.some((r) => r.cafeLink)) return [];
  const roads = planCafeSidewalks(data);
  for (const r of roads) data.roads.push(r);
  return roads;
}
