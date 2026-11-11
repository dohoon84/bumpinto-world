// [hangang] 공유 상수. 투영 원점은 정자(37.3665, 127.10835) — namsanCoords 와 같음.
export const HG = {
  datum: 48,
  lat0: 37.3665,
  lon0: 127.10835,
  kx: Math.cos((37.3665 * Math.PI) / 180) * 111320,
  kz: 110540,
};

export function projectLatLon(lat, lon) {
  const r1 = (v) => Math.round(v * 10) / 10;
  return { x: r1((lon - HG.lon0) * HG.kx), z: r1(-(lat - HG.lat0) * HG.kz) };
}

export function pointInRing(x, z, ring) {
  if (!ring || ring.length < 3) return false;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], zi = ring[i][1];
    const xj = ring[j][0], zj = ring[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-12) + xi)) inside = !inside;
  }
  return inside;
}

export function pointInRings(x, z, rings) {
  if (!rings) return false;
  for (const r of rings) {
    if (pointInRing(x, z, r.o || r.pts || r)) return true;
  }
  return false;
}

export function inWater(x, z, water) {
  if (!water) return false;
  const out = water.outers || [];
  const inn = water.inners || [];
  if (!pointInRings(x, z, out)) return false;
  if (pointInRings(x, z, inn)) return false;
  return true;
}

export function centroid(pts) {
  if (!pts || !pts.length) return { x: 0, z: 0 };
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return { x: x / pts.length, z: z / pts.length };
}

export function polylineLen(pts) {
  let s = 0;
  for (let i = 1; i < (pts || []).length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

/** 점 P 를 폴리라인에 투영. {t, x, z, along, dist} */
export function projectOnLine(x, z, pts) {
  if (!pts || pts.length < 2) return null;
  let best = null, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const px = ax + dx * t, pz = az + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    const L = Math.sqrt(L2);
    if (!best || dist < best.dist) best = { t, x: px, z: pz, along: acc + t * L, dist, seg: i - 1, segLen: L };
    acc += L;
  }
  if (best) best.total = acc;
  return best;
}

export function distToPoly(x, z, pts) {
  const q = projectOnLine(x, z, pts);
  return q ? q.dist : Infinity;
}
