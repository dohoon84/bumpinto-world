// [gangnam-night] 강남대로·테헤란로 위의 규칙 배치 (가로등·상가 빛·차량 빛줄기·고층 창).
//   OSM highway=street_lamp 는 강남 박스에 없고(계획서 5절), 미금 가로등(build-streetlights --migeum)처럼
//   이미 구운 타일 도로를 따라 놓는다. 난수 없음. 입력 타일이 같으면 결과가 같다.
//   가로등 배열은 판교·미금 streetlights.json 과 같은 [x, z, yaw, kind, y] (y = -1 → 지면).

export const AVENUE_NAMES = ['강남대로', '테헤란로'];

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

export function avenueSegs(tiles) {
  const segs = [];
  for (const t of tiles || []) for (const road of t.r || []) {
    if (!AVENUE_NAMES.includes(road.n) || !road.p || road.p.length < 2) continue;
    for (let i = 1; i < road.p.length; i++) segs.push({ n: road.n, w: road.w || 12, a: road.p[i - 1], b: road.p[i] });
  }
  return segs;
}

export function projectOnto(segs, x, z) {
  let best = null, bd = Infinity;
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / L2));
    const px = s.a[0] + dx * t, pz = s.a[1] + dz * t, d = Math.hypot(px - x, pz - z);
    if (d < bd) {
      bd = d;
      const L = Math.hypot(dx, dz) || 1;
      best = { d, px, pz, tx: dx / L, tz: dz / L, nx: -dz / L, nz: dx / L, w: s.w, n: s.n };
    }
  }
  return best;
}

function inRing(x, z, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) c = !c;
  }
  return c;
}

function buildingIndex(buildings) {
  const list = [];
  for (const b of buildings || []) {
    if (!b.o || b.o.length < 3) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, sx = 0, sz = 0;
    for (const p of b.o) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); sx += p[0]; sz += p[1]; }
    list.push({ b, x0, z0, x1, z1, cx: sx / b.o.length, cz: sz / b.o.length });
  }
  return list;
}

function insideBuilding(list, x, z) {
  for (const it of list) {
    if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
    if (inRing(x, z, it.b.o)) return true;
  }
  return false;
}

/** 인도 쪽 가로등. 건물 안·출구 캐노피 옆은 버린다. sides 1 이면 한쪽만(모바일). */
export function placeLamps(segs, { exits = [], buildings = [], step = 40, sides = 2, exitClear = 7, box = null } = {}) {
  const blocks = buildingIndex(buildings);
  const taken = [];
  const near = (x, z, rad) => taken.some((p) => (p[0] - x) ** 2 + (p[1] - z) ** 2 < rad * rad);
  const out = [];
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
    if (L < 8) continue;
    const tx = dx / L, tz = dz / L, nx = -tz, nz = tx, off = (s.w || 12) / 2 + 1.25;
    const sideList = sides === 1 ? [1] : [-1, 1];
    for (let d = step * 0.5; d < L - 2; d += step) {
      const px = s.a[0] + tx * d, pz = s.a[1] + tz * d;
      for (const side of sideList) {
        const x = px + nx * side * off, z = pz + nz * side * off;
        if (box && (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1)) continue;
        const onRoad = projectOnto(segs, x, z);
        if (onRoad && onRoad.d < Math.max(2.4, (onRoad.w || 12) * 0.2)) continue; // 다른 차도 한가운데에 선 등
        if (near(x, z, 16)) continue;
        if (exits.some((e) => Math.hypot(e.x - x, e.z - z) < exitClear)) continue;
        if (insideBuilding(blocks, x, z)) continue;
        // 팔(로컬 +X)이 차도 쪽을 보게. rotY 후 로컬 +X → (cos yaw, -sin yaw)
        const yaw = Math.atan2(side * nz, -side * nx);
        out.push(r1(x), r1(z), r3(yaw), 0, -1);
        taken.push([x, z]);
      }
    }
  }
  return out;
}

/** 대로에서 45m 안, 높이 minH 이상 건물의 바깥 창. [x, y, z, yaw] yaw = 창이 길 쪽을 보는 방향. */
export function placeWindows(segs, buildings, { minH = 48, max = 240 } = {}) {
  const out = [];
  for (const it of buildingIndex(buildings)) {
    if (!(it.b.h >= minH)) continue;
    const pr = projectOnto(segs, it.cx, it.cz);
    if (!pr || pr.d > 45) continue;
    const ring = it.b.o;
    for (let i = 0; i < ring.length && out.length < max * 4; i++) {
      const x0 = ring[i][0], z0 = ring[i][1], x1 = ring[(i + 1) % ring.length][0], z1 = ring[(i + 1) % ring.length][1];
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 8) continue;
      const tx = (x1 - x0) / L, tz = (z1 - z0) / L;
      let nx = -tz, nz = tx;
      if (nx * (it.cx - (x0 + x1) / 2) + nz * (it.cz - (z0 + z1) / 2) > 0) { nx = -nx; nz = -nz; }
      const yaw = Math.atan2(nx, nz);
      const bays = Math.min(4, Math.max(1, Math.floor(L / 10)));
      const floors = Math.min(6, Math.max(1, Math.floor((it.b.h - 12) / 14)));
      for (let bay = 0; bay < bays; bay++) for (let f = 0; f < floors; f++) {
        if (out.length >= max * 4) break;
        const dist = ((bay + 0.5) / bays) * L;
        const y = 10 + f * 14;
        if (y > it.b.h - 4) continue;
        out.push(r1(x0 + tx * dist + nx * 0.35), r1(y), r1(z0 + tz * dist + nz * 0.35), r3(yaw));
      }
    }
  }
  return out;
}

/** 인도 바닥의 따뜻한 띠. [x, z, yaw, len] */
export function placeGlow(segs, { step = 28 } = {}) {
  const out = [];
  const taken = [];
  const near = (x, z) => taken.some((p) => (p[0] - x) ** 2 + (p[1] - z) ** 2 < 18 * 18);
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
    if (L < 12) continue;
    const tx = dx / L, tz = dz / L, nx = -tz, nz = tx, off = (s.w || 12) / 2 + 0.4;
    const yaw = Math.atan2(tx, tz);
    for (let d = step * 0.5; d < L; d += step) for (const side of [-1, 1]) {
      const x = s.a[0] + tx * d + nx * side * off, z = s.a[1] + tz * d + nz * side * off;
      if (near(x, z)) continue;
      out.push(r1(x), r1(z), r3(yaw), 10);
      taken.push([x, z]);
    }
  }
  return out;
}

/** 차선 위 짧은 빛줄기(밤·PC). [x, z, yaw, len] */
export function placeStreaks(segs, { step = 90 } = {}) {
  const out = [];
  for (const s of segs) {
    if ((s.w || 0) < 14) continue;
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
    if (L < 30) continue;
    const tx = dx / L, tz = dz / L, nx = -tz, nz = tx;
    const yaw = Math.atan2(tx, tz);
    for (let d = 20; d < L - 10; d += step) {
      const side = 0.22 * s.w;
      out.push(r1(s.a[0] + tx * d + nx * side), r1(s.a[1] + tz * d + nz * side), r3(yaw), 16);
    }
  }
  return out;
}
