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

/** 잠수교 실제 데크 폭.
 * OSM way/1091571021 (윤곽)에는 width·lanes 태그가 없고, 면적÷길이 widthEst 는 5.6 m
 * (양 끝 폭 약 4.7–9.5 m)이다. 중심선 way/596516315 는 보행화 이후 highway=cycleway 이고
 * width·lanes 가 없다. 이 bbox 에 차도·보도를 나눈 평행 way 도 없다.
 * 물리 폭은 한국민족문화대백과사전(한국학중앙연구원) 「잠수교」 항목의 18.0 m 를 쓴다.
 * https://encykorea.aks.ac.kr/Article/E0048181
 * 「너비 18.0m, 길이 795.0m」(집필 변근주, 2023-02-07 수정; 참고문헌
 * 『반포대교가설공사실시설계종합보고서』, 서울특별시, 1975).
 * 한국어 위키백과 「반포대교」 잠수교 절도 폭 18 m, 왕복 4차로로 적고 있다.
 */
export const JAMSU_DECK_WIDTH = 18;

export function offsetLine(pts, dist) {
  if (!pts || pts.length < 2) return [];
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    out.push([p[0] - dz * dist, p[1] + dx * dist]);
  }
  return out;
}

/** 중심선을 따라 폭 `width` 인 닫힌 데크 윤곽. OSM 얇은 윤곽 대신 쓴다. */
export function jamsuDeckRing(osm, width = JAMSU_DECK_WIDTH) {
  const line = osm?.jamsu?.centerline?.pts;
  if (!line || line.length < 2) return osm?.jamsu?.outline?.pts || null;
  const half = width / 2;
  const left = offsetLine(line, half);
  const right = offsetLine(line, -half);
  const ring = left.concat(right.slice().reverse());
  if (ring.length) ring.push(ring[0].slice());
  return ring;
}
