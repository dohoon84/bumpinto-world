// [v4c] Shared road reservation: full polygon vs ribbon-width capsule, not just centroid/corners.
// Small block grid keeps this O(local roads), including long buildings straddling a road.
import polygonClipping from 'polygon-clipping';
const polyArea = (p) => Math.abs(p.reduce((a, v, i) => { const u = p[(i + 1) % p.length]; return a + v[0] * u[1] - u[0] * v[1]; }, 0)) / 2;
export function createRoadClearance(segments, margin = 0.35) {
  const C = 40, grid = new Map();
  const key = (x, z) => `${x},${z}`;
  for (const s of segments) {
    const { a, b } = s, r = s.r + margin, dx = b[0] - a[0], dz = b[1] - a[1], angle = Math.atan2(dz, dx), ring = [];
    if (Math.hypot(dx, dz) < 0.01) continue;
    // semicircular ends cover road junctions / crosswalk approach, without a large AABB false positive
    for (let i = 0; i <= 8; i++) { const t = angle - Math.PI / 2 + Math.PI * i / 8; ring.push([b[0] + Math.cos(t) * r, b[1] + Math.sin(t) * r]); }
    for (let i = 0; i <= 8; i++) { const t = angle + Math.PI / 2 + Math.PI * i / 8; ring.push([a[0] + Math.cos(t) * r, a[1] + Math.sin(t) * r]); }
    const bb = [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r], e = { ring, bb, id: s.w?.id };
    for (let x = Math.floor(bb[0] / C); x <= Math.floor(bb[2] / C); x++) for (let z = Math.floor(bb[1] / C); z <= Math.floor(bb[3] / C); z++) { const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(e); }
  }
  return {
    clip(ring) {
      const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]), bb = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], set = new Set();
      for (let x = Math.floor(bb[0] / C); x <= Math.floor(bb[2] / C); x++) for (let z = Math.floor(bb[1] / C); z <= Math.floor(bb[3] / C); z++) for (const e of grid.get(key(x, z)) || []) if (!(bb[2] < e.bb[0] || bb[0] > e.bb[2] || bb[3] < e.bb[1] || bb[1] > e.bb[3])) set.add(e);
      if (!set.size) return { changed: false, ring, roads: [] };
      const entries = [...set], pieces = polygonClipping.difference([ring], ...entries.map((e) => [e.ring]));
      const area0 = polyArea(ring), parts = pieces.map((p) => ({ o: p[0].slice(0, -1), holes: p.slice(1).map((h) => h.slice(0, -1)), area: polyArea(p[0]) - p.slice(1).reduce((s, h) => s + polyArea(h), 0) })).sort((a, b) => b.area - a.area);
      const area1 = parts.reduce((s, p) => s + p.area, 0), changed = area0 - area1 > 0.015;
      return { changed, ring: changed ? parts[0]?.o || null : ring, holes: changed ? parts[0]?.holes || [] : [], parts, removedArea: +(area0 - area1).toFixed(2), roads: entries.map((e) => e.id).filter((v, i, a) => a.indexOf(v) === i) };
    },
  };
}
