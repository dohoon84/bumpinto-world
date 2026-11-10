// [gangnam-brt] 경로 페이로드 헬퍼 (DOM/three 없이 테스트 가능)
export function gangnamBrtEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search || '');
  return q.get('gangnam') !== '0' && q.get('gbrt') !== '0';
}

export const BRT_LANE_OFF = 1.7; // src/transit/busSource.js LANE_OFF 과 같아야 함
export const BRT_ROUTE_PHASE = { 140: 0, 402: 1, 9404: 2, 400: 1, 470: 0, 341: 2, 9408: 0, 1151: 1 };
export const BRT_ROUTE_N = 3;
export const BRT_EXTRA_ROUTES = [
  { id: 'brt-400', ref: '400', type: 'seat', name: '강남대로' },
  { id: 'brt-470', ref: '470', type: 'seat', name: '강남대로' },
  { id: 'brt-341', ref: '341', type: 'seat', name: '강남대로' },
  { id: 'brt-9408', ref: '9408', type: 'express', name: '강남대로' },
  { id: 'brt-1151', ref: '1151', type: 'express', name: '강남대로' },
];

export function offsetRight(pts, off = BRT_LANE_OFF) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    out.push([pts[i][0] + (dz / L) * off, pts[i][1] + (-dx / L) * off]);
  }
  return out;
}

export function buildBrtTransit(brt) {
  const seen = new Set((brt.routes || []).map((r) => String(r.ref || r.id)));
  const routes = [...(brt.routes || []), ...BRT_EXTRA_ROUTES.filter((r) => !seen.has(r.ref))];
  const paths = [];
  for (const dir of brt.dirs || []) {
    const center = dir.pts;
    if (!center || center.length < 2) continue;
    const pts = offsetRight(center, BRT_LANE_OFF);
    for (const r of routes) {
      paths.push({
        id: `brt-${r.ref || r.id}-${dir.id}`,
        route: r.id,
        ref: r.ref || String(r.id).replace(/^brt-/, ''),
        pts,
        stops: (dir.stops || []).map((s) => ({ stop: s.stop, s: s.s })),
      });
    }
  }
  return {
    routes,
    paths,
    stops: brt.stops || [],
    crossings: (brt.crossings || []).map((c) => ({ ...c, sig: c.sig !== false, depth: c.depth || 2.2 })),
    refTypes: {},
  };
}
