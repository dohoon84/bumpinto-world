// [myeongdong] 명동 지형 높이. terrarium DEM(12.5 m)을 부드럽게 펴고(건물 잡음 제거),
//   남쪽 변(z = -21300)은 남산 높이(heightAt)로 이어 붙이고, 바깥 띠(apron)는 남산 도심 바닥 높이로 내린다.
//   명동대성당은 실제처럼 언덕 위 — 성당 둘레를 평평한 마당으로 올리고 비탈로 잇는다.
import { pointInRing, distToSeg } from './myeongdongGeo.js';

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function blurGrid(h, nx, nz, r, passes) {
  let a = Float32Array.from(h), b = new Float32Array(h.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) { const ii = Math.min(nx - 1, Math.max(0, i + k)); s += a[j * nx + ii]; n++; }
      b[j * nx + i] = s / n;
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) { const jj = Math.min(nz - 1, Math.max(0, j + k)); s += b[jj * nx + i]; n++; }
      a[j * nx + i] = s / n;
    }
  }
  return a;
}

function convexHull(pts) {
  const p = pts.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

export function makeMyeongdongLand(data, { namsanHeightAt = null } = {}) {
  const dem = data.dem;
  const { x0, z0, dx, nx, nz } = dem;
  const datum = dem.datum ?? 48;
  const B = data.bounds, A = data.apron || data.bounds;
  const sm = blurGrid(dem.h, nx, nz, 3, 2);
  const raw = dem.h;
  const sample = (arr, x, z) => {
    const fx = (x - x0) / dx, fz = (z - z0) / dx;
    const i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
    const k = j * nx + i;
    return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + nx] * (1 - u) + arr[k + nx + 1] * u) * v;
  };
  const nsY = (x, z) => {
    const y = namsanHeightAt ? namsanHeightAt(x, z) : null;
    return Number.isFinite(y) ? y : sample(raw, x, z) - datum;
  };
  // 남산 도심 바닥(남산 heightAt 의 DEM 밖 외삽 = 분지 ~40 m ASL)과 바깥 가장자리에서 만난다
  const APRON_FADE = 90, SEAM = 70;
  function baseY(x, z) {
    let y = sample(sm, x, z) - datum;
    if (z > A.z1 - SEAM) { // 남쪽 이음매: 남산 지형 높이로
      const t = smooth((z - (A.z1 - SEAM)) / SEAM);
      y = y * (1 - t) + nsY(x, Math.min(z, A.z1 + 400)) * t;
    }
    const edge = Math.min(x - A.x0, A.x1 - x, z - A.z0);
    if (edge < APRON_FADE && z < A.z1 - 1) {
      const t = 1 - smooth(edge / APRON_FADE);
      if (t > 0) y = y * (1 - t) + nsY(x, z) * t;
    }
    return y;
  }

  // ---- 명동대성당 언덕 마당 ----
  let hill = null;
  const cat = data.cathedral?.o;
  if (cat?.length >= 3) {
    const hull = convexHull(cat);
    let cx = 0, cz = 0; for (const p of hull) { cx += p[0]; cz += p[1]; } cx /= hull.length; cz /= hull.length;
    const GROW = 16;
    const ring = hull.map(([x, z]) => { const d = Math.hypot(x - cx, z - cz) || 1; return [x + (x - cx) / d * GROW, z + (z - cz) / d * GROW]; });
    let top = -Infinity;
    for (const [x, z] of cat) top = Math.max(top, baseY(x, z));
    top += 3.2;
    const FALL = 18;
    const G = 2, R = 90;
    const gx0 = cx - R, gz0 = cz - R, gn = Math.round((2 * R) / G) + 1;
    const lift = new Float32Array(gn * gn);
    for (let j = 0; j < gn; j++) for (let i = 0; i < gn; i++) {
      const x = gx0 + i * G, z = gz0 + j * G;
      let d = 0;
      if (!pointInRing(x, z, ring)) {
        d = Infinity;
        for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length]; d = Math.min(d, distToSeg(x, z, a[0], a[1], b[0], b[1])); }
      }
      const w = 1 - smooth(d / FALL);
      if (w <= 0) continue;
      const g0 = baseY(x, z);
      lift[j * gn + i] = Math.max(0, top - g0) * w;
    }
    hill = { cx, cz, ring, top, G, gx0, gz0, gn, lift, R };
  }
  function hillLift(x, z) {
    if (!hill) return 0;
    const fx = (x - hill.gx0) / hill.G, fz = (z - hill.gz0) / hill.G;
    if (fx < 0 || fz < 0 || fx >= hill.gn - 1 || fz >= hill.gn - 1) return 0;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * hill.gn + i, L = hill.lift;
    return (L[k] * (1 - u) + L[k + 1] * u) * (1 - v) + (L[k + hill.gn] * (1 - u) + L[k + hill.gn + 1] * u) * v;
  }
  function heightAt(x, z) {
    if (z > A.z1) return nsY(x, z); // 남산 섬(오르미 띠)은 남산 높이 그대로
    return baseY(x, z) + hillLift(x, z);
  }
  const inBox = (x, z, pad = 0) => x >= B.x0 - pad && x <= B.x1 + pad && z >= B.z0 - pad && z <= B.z1 + pad;
  const inApron = (x, z, pad = 0) => x >= A.x0 - pad && x <= A.x1 + pad && z >= A.z0 - pad && z <= A.z1 + pad;
  return { heightAt, baseY, hill, datum, bounds: B, apron: A, inBox, inApron };
}
