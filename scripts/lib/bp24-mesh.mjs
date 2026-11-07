// 게임 렌더러(src/corridor/tileMesh.js buildingMeshes)와 같은 압출으로 건물 풋프린트를 확인한다.
// OSM 원본 폴리곤이 아니라, 타일 JSON 의 b.o 를 toShape + ExtrudeGeometry 로 메시가 되는 외곽만 인정한다.
import * as THREE from 'three';
import { toShape } from '../../src/world.js';

export const CAR = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified', 'service', 'motorway', 'primary_link', 'secondary_link', 'trunk_link', 'motorway_link', 'living_street']);

export function pointInRing(x, z, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) hit = !hit;
  }
  return hit;
}

export function pointInFootprint(x, z, ring, holes) {
  if (!ring || ring.length < 3 || !pointInRing(x, z, ring)) return false;
  for (const h of holes || []) if (h?.length >= 3 && pointInRing(x, z, h)) return false;
  return true;
}

function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
}

export function edgeDist(x, z, ring) {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) d = Math.min(d, segDist(x, z, ring[i], ring[(i + 1) % ring.length]));
  return d;
}

/** buildingMeshes 와 같은 조건으로 압출이 되면 그 외곽을 돌려준다. 실패하면 렌더러가 그 건물을 그리지 않는다. */
export function renderedFootprint(b) {
  if (!b || b.nr || !b.o || b.o.length < 3) return null;
  const minH = b.mh || 0;
  const h = Math.max(0.35, (b.h || 0) - minH);
  let g;
  try {
    g = new THREE.ExtrudeGeometry(toShape(b.o, b.holes || []), { depth: h, bevelEnabled: false });
  } catch {
    return null;
  }
  const n = g.attributes.position?.count || 0;
  g.dispose();
  if (n < 3) return null;
  return { ring: b.o, holes: b.holes || [] };
}

const WALK = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway']);

function clearanceOf(roads, x, z, kinds) {
  let d = Infinity;
  for (const r of roads || []) {
    if (!kinds.has(r.k) || !r.p || r.p.length < 2) continue;
    const hw = (r.w || (WALK.has(r.k) ? 2 : 6)) / 2;
    for (let i = 1; i < r.p.length; i++) d = Math.min(d, segDist(x, z, r.p[i - 1], r.p[i]) - hw);
  }
  return d;
}

export function roadClearance(roads, x, z) {
  return clearanceOf(roads, x, z, CAR);
}

export function walkClearance(roads, x, z) {
  return clearanceOf(roads, x, z, WALK);
}

export function nearestNamedRoad(roads, x, z) {
  let best = null;
  for (const r of roads || []) {
    if (!r.n || !r.p || r.p.length < 2) continue;
    if (r.k === 'cycleway' || r.k === 'footway' || r.k === 'path' || r.k === 'steps' || r.k === 'corridor') continue;
    for (let i = 1; i < r.p.length; i++) {
      const d = segDist(x, z, r.p[i - 1], r.p[i]);
      if (!best || d < best.d) best = { d, name: String(r.n).trim(), k: r.k };
    }
  }
  return best;
}

export function storePoint(st, x, z) {
  return [st.o[0] + st.ax[0] * x + st.b[0] * z, st.o[1] + st.ax[1] * x + st.b[1] * z];
}

/**
 * 매장 상자가 렌더된 건물 메시 안(또는 안쪽에 붙음)에 있는지, 차도·광장과 겹치지 않는지, 문이 도로를 보는지.
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function assessStore(st, building, roads, parks) {
  const reasons = [];
  if (!st) return { ok: false, reasons: ['매장 틀 없음'] };
  const fp = renderedFootprint(building);
  if (!fp) return { ok: false, reasons: ['건물 메시 없음'] };
  const inset = Math.min(0.45, st.W / 2 - 0.2, st.D / 2 - 0.2);
  const n = 4;
  let outside = 0, onRoad = 0, samples = 0;
  if (inset > 0.15) {
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = inset + (st.W - 2 * inset) * (i / n);
      const z = inset + (st.D - 2 * inset) * (j / n);
      const [wx, wz] = storePoint(st, x, z);
      samples++;
      if (!pointInFootprint(wx, wz, fp.ring, fp.holes) && edgeDist(wx, wz, fp.ring) > 0.4) outside++;
      if (roadClearance(roads, wx, wz) < -0.45) onRoad++;
    }
  }
  for (const [x, z] of [[0.08, 0.08], [st.W - 0.08, 0.08], [0.08, st.D - 0.08], [st.W - 0.08, st.D - 0.08]]) {
    const [wx, wz] = storePoint(st, x, z);
    if (!pointInFootprint(wx, wz, fp.ring, fp.holes) && edgeDist(wx, wz, fp.ring) > 0.55) {
      reasons.push('상자 모서리가 건물 메시 밖');
      break;
    }
  }
  if (outside > 0) reasons.push(`상자 안쪽이 건물 메시 밖 ${outside}/${samples}`);
  if (onRoad > 0) reasons.push(`상자가 차도와 겹침 ${onRoad}/${samples}`);
  const [cx, cz] = storePoint(st, st.W / 2, st.D / 2);
  if (!pointInFootprint(cx, cz, fp.ring, fp.holes)) reasons.push('중심이 빈 땅');
  for (const p of parks || []) {
    const k = p.k;
    if ((k === 'plaza' || k === 'pedestrian' || k === 'square') && p.o?.length >= 3 && pointInRing(cx, cz, p.o) && !pointInFootprint(cx, cz, fp.ring, fp.holes)) {
      reasons.push('광장 한가운데');
    }
  }
  const door = storePoint(st, st.W / 2, -1.15);
  const ahead = storePoint(st, st.W / 2, -2.6);
  const dc = roadClearance(roads, door[0], door[1]);
  const ac = roadClearance(roads, ahead[0], ahead[1]);
  const mid = roadClearance(roads, cx, cz);
  const walk = Math.min(walkClearance(roads, door[0], door[1]), walkClearance(roads, ahead[0], ahead[1]));
  if (dc < -0.8) reasons.push('문이 차도 안');
  // 문 앞이 매장 중심보다 차도에 가깝고 18m 안이거나, 인도·보행로가 10m 안이면 문이 길을 본다.
  const facesRoad = Math.min(dc, ac) < mid - 0.25 && Math.min(dc, ac) < 18;
  if (!facesRoad && walk > 10) reasons.push('문이 도로·인도를 안 봄');
  return { ok: reasons.length === 0, reasons };
}
