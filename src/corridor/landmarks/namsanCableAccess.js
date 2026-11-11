// [namsan] 케이블카 정류장 출입·충돌·경사로. namsanCable.js 와 테스트가 같이 쓴다.
//   벽 충돌은 보이는 3.6 m 출입문과 같은 자리에 틈을 내고, 문 밖 단차가 크면 경사로를 깐다.

export const STATION_DOOR_GAP = 3.6;
export const STATION_DOOR_MIN_LEN = 4.2;
export const STATION_DOOR_FACE = 0.55;
/** 충돌용 문 폭. 보이는 틈보다 살짝 넓혀 걷기 판정(5점 샘플)이 문틀에 안 걸린다. */
export const STATION_DOOR_WALK_GAP = 4.4;
export const STATION_BOARD_RADIUS = 7.5;
export const MAX_STEP = 0.5;

export function centroid(pts) {
  let x = 0, z = 0, n = 0;
  for (const p of pts) { x += p[0]; z += p[1]; n++; }
  return n ? { x: x / n, z: z / n } : { x: 0, z: 0 };
}

export function pointInRing(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    const hit = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

export function stationFaceAng(pts, face) {
  const c = centroid(pts);
  return face ? Math.atan2(face.x - c.x, face.z - c.z) : 0;
}

/** stationBuilding 과 같은 규칙: 케이블 쪽·반대쪽 긴 벽에 출입문. */
export function isStationDoorSegment(pts, i, faceAng) {
  if (!pts || i < 0 || i >= pts.length) return false;
  const c = centroid(pts);
  const a = pts[i], b = pts[(i + 1) % pts.length];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < STATION_DOOR_MIN_LEN) return false;
  const mx = (a[0] + b[0]) * 0.5, mz = (a[1] + b[1]) * 0.5;
  const toMid = Math.atan2(mx - c.x, mz - c.z);
  const facingCable = Math.abs(Math.atan2(Math.sin(toMid - faceAng), Math.cos(toMid - faceAng))) < STATION_DOOR_FACE;
  const facingOpp = Math.abs(Math.atan2(Math.sin(toMid - faceAng - Math.PI), Math.cos(toMid - faceAng - Math.PI))) < STATION_DOOR_FACE;
  return (facingCable || facingOpp) && L > STATION_DOOR_MIN_LEN;
}

export function stationDoorMids(pts, faceAng) {
  const out = [];
  if (!pts) return out;
  for (let i = 0; i < pts.length; i++) {
    if (!isStationDoorSegment(pts, i, faceAng)) continue;
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const mx = (a[0] + b[0]) * 0.5, mz = (a[1] + b[1]) * 0.5;
    const c = centroid(pts);
    const nx = mx - c.x, nz = mz - c.z, nL = Math.hypot(nx, nz) || 1;
    out.push({
      i, L, x: mx, z: mz,
      nx: nx / nL, nz: nz / nL,
      alongX: (b[0] - a[0]) / L, alongZ: (b[1] - a[1]) / L,
    });
  }
  return out;
}

/**
 * 정류장 벽 충돌. 건물 안·밖 모두 막되, 보이는 출입문 자리에만 틈을 낸다.
 * stations: [{ pts, faceAng }]
 */
export function stationWallsBlocked(x, z, r, stations) {
  const pad = 0.45 + (Number.isFinite(r) ? r : 0.35);
  const half = STATION_DOOR_WALK_GAP * 0.5;
  for (const st of stations) {
    const pts = st.pts;
    if (!pts || pts.length < 3) continue;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, L = Math.sqrt(L2) || 1;
      if (L < 0.3) continue;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (L2 || 1)));
      const dist = Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
      if (dist >= pad) continue;
      if (isStationDoorSegment(pts, i, st.faceAng) && Math.abs((t - 0.5) * L) < half) continue;
      return true;
    }
  }
  return false;
}

export function inCableBoardZone(x, z, node, radius = STATION_BOARD_RADIUS) {
  if (!node || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  return Math.hypot(x - node.x, z - node.z) < radius;
}

/** 문 밖이 한 걸음에 못 내려가는 단차면, 지면을 만나는 짧은 경사로(또는 앞마루)를 깐다. */
export function planDoorRamp(door, floorY, heightAt) {
  if (!door || !heightAt) return null;
  const nx = door.nx, nz = door.nz;
  if (!Number.isFinite(nx) || !Number.isFinite(nz) || !Number.isFinite(floorY)) return null;
  const samples = [];
  for (let s = 0.3; s <= 12.0001; s += 0.3) {
    const h = heightAt(door.x + nx * s, door.z + nz * s);
    if (Number.isFinite(h)) samples.push({ s, h });
  }
  if (!samples.length) return null;
  const drop0 = floorY - samples[0].h;
  if (drop0 <= 0.4) return null;
  const MAX_SLOPE = 0.36;
  let end = null;
  for (const p of samples) {
    if (p.s < 3) continue;
    const dh = floorY - p.h;
    if (dh < -0.15) continue;
    if (dh / p.s <= MAX_SLOPE) { end = p; break; }
  }
  if (!end) end = samples[samples.length - 1];
  return {
    ax: door.x + nx * 0.1,
    az: door.z + nz * 0.1,
    h0: floorY,
    bx: door.x + nx * end.s,
    bz: door.z + nz * end.s,
    h1: end.h + 0.06,
    L: end.s,
    ux: nx,
    uz: nz,
    hw: 2.05,
  };
}

export function rampHeight(x, z, ramps, refY = Infinity) {
  if (!ramps) return null;
  let best = null;
  for (const r of ramps) {
    const rx = x - r.ax, rz = z - r.az;
    const u = rx * r.ux + rz * r.uz;
    const v = -rx * r.uz + rz * r.ux;
    if (u < -0.35 || u > r.L + 0.5 || Math.abs(v) > r.hw) continue;
    const t = Math.max(0, Math.min(1, u / r.L));
    const y = r.h0 + (r.h1 - r.h0) * t;
    if (Number.isFinite(refY) && Math.abs(y - refY) > 4) continue;
    if (best == null || y > best) best = y;
  }
  return best;
}

/**
 * osm + heightAt 로 두 정류장의 벽·문·경사로·탑승 구역을 계산한다.
 */
export function planStationAccess(osm, heightAt) {
  const nodes = osm?.cable?.nodes || [];
  const nodeAt = (i) => {
    const n = nodes[i];
    return n && Number.isFinite(+n.x) && Number.isFinite(+n.z) ? { x: +n.x, z: +n.z } : null;
  };
  const upperPts = osm?.upperStation?.pts;
  const lowerPts = osm?.lowerStation?.pts;
  const upperFace = nodeAt(0);
  const lowerFace = nodeAt(nodes.length - 1);
  const upperY = upperFace && heightAt ? heightAt(upperFace.x, upperFace.z) : null;
  const lowerY = lowerFace && heightAt ? heightAt(lowerFace.x, lowerFace.z) : null;
  const upperFaceAng = stationFaceAng(upperPts, upperFace);
  const lowerFaceAng = stationFaceAng(lowerPts, lowerFace);
  const stations = [];
  if (upperPts) stations.push({ which: 'upper', pts: upperPts, face: upperFace, faceAng: upperFaceAng, y: upperY });
  if (lowerPts) stations.push({ which: 'lower', pts: lowerPts, face: lowerFace, faceAng: lowerFaceAng, y: lowerY });

  const ramps = [];
  const doors = [];
  for (const st of stations) {
    const mids = stationDoorMids(st.pts, st.faceAng);
    const floorY = Number.isFinite(st.y) ? st.y + 0.12 : null;
    for (const d of mids) {
      doors.push({ which: st.which, ...d });
      const ramp = planDoorRamp(d, floorY, heightAt);
      if (ramp) {
        ramp.which = st.which;
        ramps.push(ramp);
      }
    }
  }

  function isBlocked(x, z, r = 0.35) {
    return stationWallsBlocked(x, z, r, stations);
  }
  function floorY(x, z, refY = Infinity) {
    const ry = rampHeight(x, z, ramps, refY);
    if (ry != null) return ry;
    if (upperPts && pointInRing(x, z, upperPts) && Number.isFinite(upperY)
      && (!Number.isFinite(refY) || Math.abs(refY - upperY) < 4)) return upperY + 0.12;
    if (lowerPts && pointInRing(x, z, lowerPts) && Number.isFinite(lowerY)
      && (!Number.isFinite(refY) || Math.abs(refY - lowerY) < 4)) return lowerY + 0.12;
    return null;
  }
  function inBoardZone(x, z, which) {
    const node = which === 'upper' ? upperFace : which === 'lower' ? lowerFace : null;
    return inCableBoardZone(x, z, node);
  }

  return {
    stations, ramps, doors,
    upperPts, lowerPts, upperFace, lowerFace, upperY, lowerY,
    upperFaceAng, lowerFaceAng,
    isBlocked, floorY, inBoardZone,
  };
}

/** 5점 샘플. corridor.isBlocked 가 남산 충돌에 쓰는 것과 같다. */
export function corridorSampleBlocked(x, z, r, hit) {
  const rad = Number.isFinite(r) ? r : 0.35;
  for (const [dx, dz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]]) {
    if (hit(x + dx, z + dz, rad)) return true;
  }
  return false;
}
