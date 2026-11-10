// [gangnam-npc] 강남 보행 지점·차량 그래프·횡단보도. 난수 없음. 타일이 같으면 결과가 같다.
//   차도 = 타일에 이미 있는 강남대로·테헤란로 primary. busway 는 넣지 않는다 (버스 단계용 중앙 차로).
//   강남대로 폭 26.4m 는 OSM lanes=8 × 3.3m (한 방향 차로가 8차로로 잡혀 넓게 구워진 것).
//   그 폭 안에서, 진행 방향 오른쪽에 있는 버스 전용 차로와 3m 이상 떨어진 칸만 차량 칸으로 남긴다.
//   배치 규칙은 README.md.

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

export const AVENUE_NAMES = ['강남대로', '테헤란로'];
export const DAERO_LANES = 8;
export const LANE_M = 3.3;
export const BUS_CLEAR_M = 3;

export function driveSegs(drive) {
  const segs = [];
  for (const w of drive?.ways || []) {
    for (let i = 1; i < w.n.length; i++) {
      const a = drive.nodes[w.n[i - 1]], b = drive.nodes[w.n[i]];
      if (!a || !b) continue;
      segs.push({ a, b, w: w.w || 12, name: w.name });
    }
  }
  return segs;
}

export function onDriveRoad(drive, x, z, pad = 0.35) {
  for (const s of driveSegs(drive)) if (segDist(x, z, s.a, s.b) < s.w / 2 + pad) return true;
  return false;
}

/** 가장 가까운 대로 접선. 산책은 이 방향을 따른다(카메라 yaw 가 아님). */
export function sidewalkTangent(drive, x, z) {
  let best = null, bd = Infinity;
  for (const s of driveSegs(drive)) {
    const d = segDist(x, z, s.a, s.b);
    if (d >= bd) continue;
    bd = d;
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz) || 1;
    best = { ux: dx / L, uz: dz / L };
  }
  return best;
}

export function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2));
  return Math.hypot(a[0] + dx * t - px, a[1] + dz * t - pz);
}

function inBox(x, z, box, m = 0) {
  return x >= box.x0 - m && x <= box.x1 + m && z >= box.z0 - m && z <= box.z1 + m;
}

export function avenueSegs(tiles, { names = AVENUE_NAMES, kinds = null } = {}) {
  const want = names ? new Set(names) : null;
  const segs = [];
  for (const t of tiles || []) for (const road of t.r || []) {
    if ((want && !want.has(road.n)) || !road.p || road.p.length < 2) continue;
    if (kinds && !kinds.has(road.k)) continue;
    if (road.k === 'busway') continue;
    for (let i = 1; i < road.p.length; i++) {
      const a = road.p[i - 1], b = road.p[i];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.4) continue;
      segs.push({ n: road.n, k: road.k, w: road.w || 12, a, b });
    }
  }
  return segs;
}

export function busSegs(tiles) {
  const segs = [];
  for (const t of tiles || []) for (const road of t.r || []) {
    if (road.k !== 'busway' || !road.p) continue;
    for (let i = 1; i < road.p.length; i++) segs.push({ a: road.p[i - 1], b: road.p[i], w: road.w || 4 });
  }
  return segs;
}

function distToSegs(segs, x, z) {
  let best = Infinity;
  for (const s of segs) {
    const d = segDist(x, z, s.a, s.b);
    if (d < best) best = d;
  }
  return best;
}

/** 차량이 다니는 구간. 강남대로의 좁은 조각이 8차로(폭 ≥ 24m) 중심선 11m 안이면 같은 차로의 중복이라 뺀다. */
export function carSegments(tiles) {
  const all = avenueSegs(tiles, { kinds: new Set(['primary']) });
  const wide = all.filter((s) => s.n === '강남대로' && s.w >= 24);
  const out = [];
  for (const s of all) {
    if (s.n === '강남대로' && s.w < 24) {
      const mx = (s.a[0] + s.b[0]) / 2, mz = (s.a[1] + s.b[1]) / 2;
      if (distToSegs(wide, mx, mz) < 11) continue;
    }
    out.push(s);
  }
  return out;
}

function lanePoint(s, lanes, li) {
  const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz) || 1;
  const lx = -dz / L, lz = dx / L;
  const off = s.w / 2 - (li + 0.5) * (s.w / lanes);
  return [(s.a[0] + s.b[0]) / 2 + lx * off, (s.a[1] + s.b[1]) / 2 + lz * off];
}

function busClearance(x, z, buses) {
  let best = Infinity;
  for (const b of buses) best = Math.min(best, segDist(x, z, b.a, b.b) - b.w / 2);
  return best;
}

/** 일방 구간에서 버스 전용(진행 방향 오른쪽·중앙)을 비운 칸 번호. 테헤란로·좁은 강남대로는 바깥 두 칸. */
export function laneSlot(s, buses) {
  const lanes = s.n === '강남대로' && s.w >= 24 ? DAERO_LANES : Math.max(2, Math.round(s.w / LANE_M));
  const mx = (s.a[0] + s.b[0]) / 2, mz = (s.a[1] + s.b[1]) / 2;
  const near = s.n === '강남대로' && s.w >= 24 && buses.some((b) => segDist(mx, mz, b.a, b.b) < 30);
  if (!near) return { lanes, slot: [0, 1] };
  const ok = [];
  for (let li = 0; li < lanes; li++) {
    const [x, z] = lanePoint(s, lanes, li);
    if (busClearance(x, z, buses) >= BUS_CLEAR_M) ok.push(li);
  }
  if (!ok.length) return { lanes, slot: [0, 1] };
  if (ok.length <= 4) return { lanes, slot: ok };
  const step = (ok.length - 1) / 3;
  const slot = [0, 1, 2, 3].map((i) => ok[Math.round(i * step)]);
  return { lanes, slot: [...new Set(slot)] };
}

export function buildDrive(segs, buses) {
  const nodes = [];
  const idx = new Map();
  const id = (x, z) => {
    const k = Math.round(x * 2) + ',' + Math.round(z * 2);
    let i = idx.get(k);
    if (i == null) { i = nodes.length; nodes.push([r1(x), r1(z)]); idx.set(k, i); }
    return i;
  };
  const ways = [];
  for (const s of segs) {
    const a = id(s.a[0], s.a[1]), b = id(s.b[0], s.b[1]);
    if (a === b) continue;
    const { lanes, slot } = laneSlot(s, buses);
    ways.push({ k: 'primary', w: r1(s.w), ow: 1, name: s.n, n: [a, b], lanes, slot });
  }
  return { nodes, ways };
}

function pointInRing(x, z, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) c = !c;
  }
  return c;
}

function buildingBlocks(buildings) {
  const list = [];
  for (const b of buildings || []) {
    if (!b.o || b.o.length < 3) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of b.o) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    list.push({ o: b.o, x0, z0, x1, z1 });
  }
  return list;
}

function insideBuilding(blocks, x, z) {
  for (const it of blocks) {
    if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
    if (pointInRing(x, z, it.o)) return true;
  }
  return false;
}

const CAR_ROAD_KINDS = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified', 'service', 'motorway', 'primary_link', 'secondary_link', 'trunk_link', 'motorway_link']);

export function sidewalkPoints(segs, { buildings = [], exits = [], box, buses = [], roads = null, crossings = [], step = 1.7 } = {}) {
  const blocks = buildingBlocks(buildings);
  const roadList = roads || segs;
  const onRoad = (x, z) => {
    for (const s of roadList) if (segDist(x, z, s.a, s.b) < (s.w || 12) / 2 + 0.65) return true;
    return false;
  };
  const trees = [];
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
    if (L < 8) continue;
    const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
    for (let d = 6; d < L; d += 14) for (const side of [-1, 1]) {
      const x = s.a[0] + ux * d + nx * side * (s.w / 2 + 1.6);
      const z = s.a[1] + uz * d + nz * side * (s.w / 2 + 1.6);
      if (!onRoad(x, z) && !insideBuilding(blocks, x, z)) trees.push([x, z]);
    }
  }
  const nearTree = (x, z) => trees.some((t) => (t[0] - x) ** 2 + (t[1] - z) ** 2 < 2.25 * 2.25);
  const seen = new Set();
  const pts = [];
  const add = (x, z) => {
    if (!inBox(x, z, box, 0)) return;
    if (insideBuilding(blocks, x, z) || onRoad(x, z) || nearTree(x, z)) return;
    for (const b of buses) if (segDist(x, z, b.a, b.b) < b.w / 2 + BUS_CLEAR_M) return;
    const k = Math.round(x / 1.45) + ',' + Math.round(z / 1.45);
    if (seen.has(k)) return;
    seen.add(k);
    pts.push([r1(x), r1(z)]);
  };
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
    if (L < 8) continue;
    const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
    for (let d = 1.4; d < L - 1; d += step) for (const side of [-1, 1]) for (const extra of [1.15, 4.3]) {
      add(s.a[0] + ux * d + nx * side * (s.w / 2 + extra), s.a[1] + uz * d + nz * side * (s.w / 2 + extra));
    }
  }
  for (const c of crossings) {
    const nx = -c.dir[1], nz = c.dir[0];
    for (const sgn of [-1, 1]) add(c.x + nx * sgn * (c.w / 2 + 2.6), c.z + nz * sgn * (c.w / 2 + 2.6));
  }
  for (const e of exits) {
    for (const rad of [5.5, 9.5]) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      add(e.x + Math.cos(a) * rad, e.z + Math.sin(a) * rad);
    }
  }
  pts.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  return pts;
}

function intersect(a, b, c, d) {
  const dax = b[0] - a[0], daz = b[1] - a[1], dbx = d[0] - c[0], dbz = d[1] - c[1];
  const den = dax * dbz - daz * dbx;
  if (Math.abs(den) < 1e-5) return null;
  const t = ((c[0] - a[0]) * dbz - (c[1] - a[1]) * dbx) / den;
  const u = ((c[0] - a[0]) * daz - (c[1] - a[1]) * dax) / den;
  if (t < -0.04 || t > 1.04 || u < -0.04 || u > 1.04) return null;
  return [a[0] + dax * t, a[1] + daz * t];
}

function cluster(points, rad) {
  const out = [];
  for (const p of points) {
    let c = out.find((q) => Math.hypot(q.x - p[0], q.z - p[1]) < rad);
    if (!c) out.push(c = { x: p[0], z: p[1], n: 0 });
    c.x = (c.x * c.n + p[0]) / (c.n + 1);
    c.z = (c.z * c.n + p[1]) / (c.n + 1);
    c.n++;
  }
  return out;
}

function crossingsAt(name, dae, other, box) {
  const hits = [];
  for (const a of dae) for (const b of other) {
    const p = intersect(a.a, a.b, b.a, b.b);
    if (p && inBox(p[0], p[1], box, 0)) hits.push(p);
  }
  const groups = cluster(hits, 46);
  const list = [];
  for (const c of groups) {
    const near = [...dae, ...other].filter((s) => distToSegs([s], c.x, c.z) < 36);
    for (const s of near) {
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz) || 1;
      const ux = dx / L, uz = dz / L;
      const t = (c.x - s.a[0]) * ux + (c.z - s.a[1]) * uz;
      if (t < -6 || t > L + 6) continue;
      const px = s.a[0] + ux * Math.max(0, Math.min(L, t));
      const pz = s.a[1] + uz * Math.max(0, Math.min(L, t));
      for (const sgn of [-1, 1]) {
        const x = px + ux * sgn * 15, z = pz + uz * sgn * 15;
        if (!inBox(x, z, box, 0)) continue;
        if (Math.hypot(x - c.x, z - c.z) < 9 || Math.hypot(x - c.x, z - c.z) > 28) continue;
        if (list.some((u) => Math.hypot(u.x - x, u.z - z) < 8)) continue;
        list.push({
          name, road: s.n, x: r1(x), z: r1(z),
          dir: [r3(ux * sgn), r3(uz * sgn)], w: r1(Math.max(10, s.w)),
        });
      }
    }
  }
  return { groups, list };
}

export function placeCrossings(tiles, { box, station }) {
  const primary = avenueSegs(tiles, { kinds: new Set(['primary']) });
  const dae = primary.filter((s) => s.n === '강남대로');
  const teh = primary.filter((s) => s.n === '테헤란로');
  const yeok = avenueSegs(tiles, { names: ['역삼로'], kinds: new Set(['primary', 'secondary']) });
  const gn = crossingsAt('강남역사거리', dae, teh, box);
  const ys = crossingsAt('역삼역사거리', dae, yeok, box);
  const nearStation = gn.groups.filter((c) => Math.hypot(c.x - station.x, c.z - station.z) < 220);
  const crossings = nearStation.length ? gn.list.filter((c) => nearStation.some((g) => Math.hypot(g.x - c.x, g.z - c.z) < 50)) : gn.list;
  crossings.forEach((c, i) => { c.id = 'gnx' + i; });
  return {
    crossings,
    gangnam: nearStation.map((c) => ({ x: r1(c.x), z: r1(c.z), n: c.n })),
    yeoksam: ys.groups.map((c) => ({ x: r1(c.x), z: r1(c.z), n: c.n })),
  };
}

export function buildGangnamNpcData(tiles, index) {
  const box = index.meta.box;
  const station = { x: index.stations[0].x, z: index.stations[0].z };
  const exits = index.stations[0].exits.map((e) => ({ ref: String(e.ref), x: e.x, z: e.z }));
  const buses = busSegs(tiles);
  const cars = carSegments(tiles);
  const sidewalks = avenueSegs(tiles, { kinds: new Set(['primary']) });
  const roads = avenueSegs(tiles, { names: null, kinds: CAR_ROAD_KINDS });
  const buildings = tiles.flatMap((t) => t.b || []);
  const drive = buildDrive(cars, buses);
  const cross = placeCrossings(tiles, { box, station });
  const walk = sidewalkPoints(sidewalks, { buildings, exits, box, buses, roads, crossings: cross.crossings });
  return {
    meta: {
      note: '강남 보행·차량 NPC 시뮬레이션용. 사람·차 위치는 실제 데이터가 아님. 중앙 busway 는 그래프에 없음.',
      box, station,
      avenues: AVENUE_NAMES,
      lanes: { '강남대로': DAERO_LANES, laneM: LANE_M, busClearM: BUS_CLEAR_M },
      yeoksamInside: cross.yeoksam.length > 0,
      yeoksam: cross.yeoksam,
      gangnamCrossing: cross.gangnam,
      stats: { nodes: drive.nodes.length, ways: drive.ways.length, walk: walk.length, crossings: cross.crossings.length, exits: exits.length, busSegs: buses.length },
    },
    drive, walk, exits, crossings: cross.crossings,
  };
}
