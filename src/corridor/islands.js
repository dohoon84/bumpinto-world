// [gangnam] 이동 범위가 사각형 하나가 아닐 때 (강남 = 코리더와 떨어진 섬).
//   bounds.islands 가 없으면 예전과 같이 bounds 사각형 하나.
//   있으면 그 사각형들 안에서만 움직인다. 섬 사이 빈 땅은 범위 밖 → 걸어서 건너지 못한다.
//   섬 안에서는 각 사각형 클램프가 예전 한 사각형 클램프와 같다.
// [gyeongbu-bus] bounds.corridors = [{ pts:[[x,z],...], halfWidth }] — 섬과 섬 사이 경부 본선처럼
//   좁은 띠로만 이어지는 길. 띠 안은 달릴 수 있고, 그 옆 빈 산은 그대로 막힌다.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function pointInBox(x, z, b) {
  return !!b && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

function pathGrid(c) {
  if (c._grid) return c._grid;
  const cell = 80, map = new Map(), pts = c.pts, pad = (c.halfWidth || 0) + 4;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const x0 = Math.min(ax, bx) - pad, x1 = Math.max(ax, bx) + pad;
    const z0 = Math.min(az, bz) - pad, z1 = Math.max(az, bz) + pad;
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
      for (let gz = Math.floor(z0 / cell); gz <= Math.floor(z1 / cell); gz++) {
        const k = gx + ',' + gz;
        let arr = map.get(k);
        if (!arr) { arr = []; map.set(k, arr); }
        arr.push(i - 1);
      }
    }
  }
  c._grid = { cell, map };
  return c._grid;
}

export function nearestOnPath(x, z, pts, segs) {
  let best = Infinity, px = pts[0][0], pz = pts[0][1];
  const n = pts.length - 1;
  const visit = (i) => {
    if (i < 0 || i >= n) return;
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const qx = ax + dx * t, qz = az + dz * t;
    const d = Math.hypot(x - qx, z - qz);
    if (d < best) { best = d; px = qx; pz = qz; }
  };
  if (segs) {
    const seen = new Set();
    for (const i of segs) {
      if (seen.has(i)) continue;
      seen.add(i);
      visit(i);
    }
  } else {
    for (let i = 0; i < n; i++) visit(i);
  }
  return { x: px, z: pz, dist: best };
}

export function distToCorridor(x, z, c) {
  if (!c?.pts?.length) return Infinity;
  const g = pathGrid(c);
  const segs = g.map.get(`${Math.floor(x / g.cell)},${Math.floor(z / g.cell)}`);
  if (!segs) return Infinity;
  return nearestOnPath(x, z, c.pts, segs).dist;
}

export function inCorridor(x, z, c) {
  return distToCorridor(x, z, c) <= (c.halfWidth || 0);
}

export function inWorldBounds(p, b) {
  if (!b || !p) return !b;
  const islands = b.islands;
  if (islands?.length && islands.some((box) => pointInBox(p.x, p.z, box))) return true;
  if (b.corridors?.some((c) => inCorridor(p.x, p.z, c))) return true;
  if (islands?.length) return false;
  return pointInBox(p.x, p.z, b);
}

export function clampWorld(x, z, b) {
  if (!b) return { x, z };
  if (inWorldBounds({ x, z }, b)) return { x, z };
  let bx = x, bz = z, best = Infinity;
  const consider = (cx, cz) => {
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < best) { best = d; bx = cx; bz = cz; }
  };
  const islands = b.islands;
  if (islands?.length) {
    for (const c of islands) consider(clamp(x, c.x0, c.x1), clamp(z, c.z0, c.z1));
  } else if (Number.isFinite(b.x0)) {
    consider(clamp(x, b.x0, b.x1), clamp(z, b.z0, b.z1));
  }
  for (const c of b.corridors || []) {
    if (!c?.pts?.length) continue;
    const g = pathGrid(c);
    const segs = g.map.get(`${Math.floor(x / g.cell)},${Math.floor(z / g.cell)}`);
    const near = segs ? nearestOnPath(x, z, c.pts, segs) : nearestOnPath(x, z, c.pts);
    const hw = c.halfWidth || 0;
    if (near.dist <= hw) { consider(x, z); continue; }
    const inv = near.dist || 1;
    consider(near.x + ((x - near.x) / inv) * hw, near.z + ((z - near.z) / inv) * hw);
  }
  return { x: bx, z: bz };
}
