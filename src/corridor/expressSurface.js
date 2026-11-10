// [gyeongbu-bus] 판교–양재 본선·갓길·램프·테이퍼의 실제 깔린 노면 높이.
//   expresswayDeck / pangyo ribbonGeo 와 같은 공식이다. 걷기·라이딩 getGroundHeight 가
//   예전에 쓰던 지형(또는 4+4 중심선만 보던 expressRoadHeight) 대신 이 값을 쓴다.
import { EXPRESS_ROAD_Y, expressRoadHeight } from './gyeongbuWorld.js';
import { expressLayout } from './gyeongbuExpress.js';

export const EXPRESS_RIBBON_Y = 0.1; // pangyoExpress ribbonGeo(..., 0.1)
const CELL = 24;
const STEP_UP = 0.6; // terrain MAX_STEP(0.5) + 0.1 과 같음
const DECK_PAD = 0.45;

let deck = null;
let ramps = null;

function key(gx, gz) {
  return gx * 100003 + gz;
}

function buildGrid(pts, padFn) {
  const grid = new Map();
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    const pad = padFn(a, b);
    const s = {
      ax: a[0], az: a[1], ay: a[2] || 0,
      bx: b[0], bz: b[1], by: b[2] || 0,
      aw: a[3] || 0, bw: b[3] || 0,
      dx, dz, L2,
    };
    segs.push(s);
    const x0 = Math.min(a[0], b[0]) - pad, x1 = Math.max(a[0], b[0]) + pad;
    const z0 = Math.min(a[1], b[1]) - pad, z1 = Math.max(a[1], b[1]) + pad;
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const k = key(gx, gz);
        const bucket = grid.get(k);
        if (bucket) bucket.push(s);
        else grid.set(k, [s]);
      }
    }
  }
  return { grid, segs };
}

function segsAt(g, x, z) {
  return g.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || [];
}

function project(s, x, z) {
  const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.L2));
  const px = s.ax + s.dx * t, pz = s.az + s.dz * t;
  const L = Math.sqrt(s.L2);
  return {
    t, px, pz,
    d: Math.hypot(px - x, pz - z),
    lat: ((x - px) * (s.dz / L) + (z - pz) * (-s.dx / L)),
  };
}

/** 화면에 깔리는 4+4·램프 조각을 등록한다. mount 시 한 번. */
export function setExpressSurface({ deckPts = null, rampChunks = null } = {}) {
  const layout = expressLayout();
  const deckPad = Math.max(Math.abs(layout.nbOuterEdge), Math.abs(layout.sbOuterEdge)) + 2;
  deck = deckPts?.length > 1
    ? { ...buildGrid(deckPts, () => deckPad), pts: deckPts, layout }
    : null;
  if (rampChunks?.length) {
    // 청크마다 끊어서 세그먼트를 넣되, 그리드는 하나로 합친다.
    const merged = buildGrid([[0, 0], [0, 0]], () => 0);
    merged.grid.clear();
    merged.segs.length = 0;
    for (const chunk of rampChunks) {
      const run = chunk?.pts || chunk;
      if (!run || run.length < 2) continue;
      const g = buildGrid(run, (a, b) => Math.max(a[3] || 7, b[3] || 7) / 2 + 2);
      for (const s of g.segs) merged.segs.push(s);
      for (const [k, list] of g.grid) {
        const bucket = merged.grid.get(k);
        if (bucket) for (const s of list) bucket.push(s);
        else merged.grid.set(k, list.slice());
      }
    }
    ramps = merged.segs.length ? merged : null;
  } else {
    ramps = null;
  }
}

function deckHeightAt(x, z, pad = 0) {
  if (!deck) return null;
  let best = Infinity, lat = 0;
  for (const s of segsAt(deck, x, z)) {
    const q = project(s, x, z);
    if (q.d < best) { best = q.d; lat = q.lat; }
  }
  if (!(best < 48 + pad)) return null;
  const L = deck.layout;
  if (lat < L.nbOuterEdge - DECK_PAD - pad || lat > L.sbOuterEdge + DECK_PAD + pad) return null;
  return expressRoadHeight(x, z, deck.pts) ?? EXPRESS_ROAD_Y;
}

function rampHeightAt(x, z, pad = 0) {
  if (!ramps) return null;
  let bestY = null, bestD = Infinity;
  for (const s of segsAt(ramps, x, z)) {
    const q = project(s, x, z);
    const hw = ((s.aw || 7) * (1 - q.t) + (s.bw || 7) * q.t) / 2;
    if (q.d > hw + 0.2 + pad) continue;
    if (q.d < bestD) {
      bestD = q.d;
      bestY = s.ay + (s.by - s.ay) * q.t + EXPRESS_RIBBON_Y;
    }
  }
  return bestY;
}

/** 본선·갓길·램프 위(또는 pad 안)인지. 가로수가 차도에 서지 않게 쓸 때 pad 를 준다. */
export function onExpressPavement(x, z, pad = 0) {
  return deckHeightAt(x, z, pad) != null || rampHeightAt(x, z, pad) != null;
}

/** 그 자리의 깔린 노면 높이(본선·갓길·램프·테이퍼). 없으면 null. */
export function expressSurfaceHeight(x, z, refY = Infinity) {
  const d = deckHeightAt(x, z);
  const r = rampHeightAt(x, z);
  if (d == null && r == null) return null;
  if (d == null) return r > refY + STEP_UP ? null : r;
  if (r == null) return d > refY + STEP_UP ? null : d;
  if (!Number.isFinite(refY)) return Math.max(d, r);
  let best = null, bestAd = Infinity;
  for (const y of [d, r]) {
    if (y > refY + STEP_UP) continue;
    const ad = Math.abs(y - refY);
    if (ad < bestAd) { bestAd = ad; best = y; }
  }
  return best;
}

export function expressDeckOffsets() {
  const L = expressLayout();
  const offs = [];
  for (let i = 0; i < 4; i++) offs.push({ kind: 'lane', name: `nb${i + 1}`, off: L.nbLaneOuter + L.laneW * (i + 0.5) });
  for (let i = 0; i < 4; i++) offs.push({ kind: 'lane', name: `sb${i + 1}`, off: L.sbLaneInner + L.laneW * (i + 0.5) });
  offs.push({ kind: 'shoulder', name: 'nbOuterSh', off: (L.nbLaneOuter + L.nbOuterEdge) / 2 });
  offs.push({ kind: 'shoulder', name: 'nbInnerSh', off: (L.nbLaneInner + L.nbInnerEdge) / 2 });
  offs.push({ kind: 'shoulder', name: 'sbInnerSh', off: (L.medHi + L.sbLaneInner) / 2 });
  offs.push({ kind: 'shoulder', name: 'sbOuterSh', off: (L.sbLaneOuter + L.sbOuterEdge) / 2 });
  return offs;
}
