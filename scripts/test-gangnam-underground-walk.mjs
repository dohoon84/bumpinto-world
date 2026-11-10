import assert from 'node:assert/strict';
import {
  buildLayout, walkable, HALF, EW, NORTH_Z, SOUTH_Z, PLAZA, FOOD, L2HALL, OPEN_W,
} from '../src/world/gangnamUndergroundLayout.js';

const exits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((ref) => ({
  id: `gangnam-x${ref}`, ref: String(ref),
}));
const L = buildLayout(exits);
const R = 0.3;
const STEP = 0.25;

function frontOutside(s, dist = 1.1) {
  if (s.axis === 'x') return { x: s.cx, z: s.side < 0 ? s.z1 + dist : s.z0 - dist };
  return { x: s.side < 0 ? s.x1 + dist : s.x0 - dist, z: s.cz };
}
function doorMid(s) {
  if (s.axis === 'x') return { x: s.cx, z: s.side < 0 ? s.z1 : s.z0 };
  return { x: s.side < 0 ? s.x1 : s.x0, z: s.cz };
}
function interiorPoint(s) {
  const depths = [0.55, 0.62, 0.7, 0.85, 1.1, 1.6, 2.2, 2.6];
  const ts = [0, 0.45, -0.45, 0.85, -0.85];
  for (const d of depths) {
    for (const t of ts) {
      const p = s.axis === 'x'
        ? { x: s.cx + t, z: s.side < 0 ? s.z1 - d : s.z0 + d }
        : { x: s.side < 0 ? s.x1 - d : s.x0 + d, z: s.cz + t };
      if (walkable(p.x, p.z, R, L)) return { ...p, d, t };
    }
  }
  return null;
}

function flood(sx, sz, max = 220000) {
  assert.ok(walkable(sx, sz, R, L), `flood start ${sx},${sz}`);
  const key = (x, z) => `${Math.round(x / STEP)}_${Math.round(z / STEP)}`;
  const cells = new Map();
  const q = [[sx, sz]];
  cells.set(key(sx, sz), [sx, sz]);
  const dirs = [
    [STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP],
    [STEP, STEP], [STEP, -STEP], [-STEP, STEP], [-STEP, -STEP],
  ];
  let n = 0;
  while (q.length && n < max) {
    const [x, z] = q.shift();
    n++;
    for (const [dx, dz] of dirs) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (cells.has(k) || !walkable(nx, nz, R, L)) continue;
      cells.set(k, [nx, nz]);
      q.push([nx, nz]);
    }
  }
  return { cells, n, key };
}

function reachable(flooded, tx, tz, lim = 0.55) {
  if (!walkable(tx, tz, R, L)) return false;
  const cx = Math.round(tx / STEP), cz = Math.round(tz / STEP);
  const rad = Math.ceil(lim / STEP) + 1;
  for (let ix = -rad; ix <= rad; ix++) {
    for (let iz = -rad; iz <= rad; iz++) {
      const p = flooded.cells.get(`${cx + ix}_${cz + iz}`);
      if (p && Math.hypot(p[0] - tx, p[1] - tz) < lim) return true;
    }
  }
  return false;
}

const fromPlaza = flood(0, 0);
assert.ok(fromPlaza.n < 220000, `flood exhausted (${fromPlaza.n})`);

const open = L.shops.filter((s) => !s.closed);
const closed = L.shops.filter((s) => s.closed);
const blockedOpen = [];
for (const s of open) {
  const inn = interiorPoint(s);
  const mid = doorMid(s);
  const midOk = walkable(mid.x, mid.z, R, L);
  const reach = !!(inn && reachable(fromPlaza, inn.x, inn.z));
  if (!inn || !midOk || !reach) {
    blockedOpen.push({
      name: s.name, id: s.id, midOk, reach, inn, mid,
    });
  }
}
assert.equal(blockedOpen.length, 0, `open shops blocked: ${JSON.stringify(blockedOpen.slice(0, 8))}`);

for (const s of closed) {
  const mid = doorMid(s);
  const inn = s.axis === 'x'
    ? { x: s.cx, z: s.side < 0 ? s.z1 - 0.9 : s.z0 + 0.9 }
    : { x: s.side < 0 ? s.x1 - 0.9 : s.x0 + 0.9, z: s.cz };
  assert.ok(!walkable(inn.x, inn.z, R, L), `closed interior walkable ${s.name}`);
  assert.ok(!walkable(mid.x, mid.z, R, L), `closed door walkable ${s.name}`);
}

const gateTargets = [
  ['l2-hall', 21, -12],
  ['l2-apron', 21, -6],
  ['corner-branch', 6.4, -6],
  ['food', 0, 47],
  ['transfer', 0, 62.6],
  ['ew-east', 30, 0],
  ['ew-west', -30, 0],
  ['ns-north', 0, -22],
  ['ns-south', 0, 22],
];
const missedGates = [];
for (const [name, x, z] of gateTargets) {
  if (!walkable(x, z, R, L) || !reachable(fromPlaza, x, z)) missedGates.push(name);
}
assert.equal(missedGates.length, 0, `gates unreachable: ${missedGates.join(', ')}`);

const missedExits = [];
for (const p of L.passages) {
  const inside = { x: p.mouth.x + p.out.x * 2.4, z: p.mouth.z + p.out.z * 2.4 };
  const near = { x: p.mouth.x - p.out.x * 1.4, z: p.mouth.z - p.out.z * 1.4 };
  if (!walkable(p.mouth.x, p.mouth.z, R, L) || !reachable(fromPlaza, p.mouth.x, p.mouth.z)) {
    missedExits.push(`${p.id}:mouth`);
  }
  if (!walkable(inside.x, inside.z, R, L) || !reachable(fromPlaza, inside.x, inside.z)) {
    missedExits.push(`${p.id}:inside`);
  }
  if (!walkable(near.x, near.z, R, L) || !reachable(fromPlaza, near.x, near.z)) {
    missedExits.push(`${p.id}:near`);
  }
}
assert.equal(missedExits.length, 0, `exits unreachable: ${missedExits.join(', ')}`);

// 시각적으로 열린 바닥(복도·홀·열린 가게·출구 통로)은 가구를 제외하면 걸을 수 있어야 한다.
function visuallyOpen(x, z) {
  // 벽에서 0.5m 안쪽만 본다. 가장자리는 반경 때문에 원래 걷지 못한다.
  const inRect = (r, m = -0.5) => r && x > r.x0 - m && x < r.x1 + m && z > Math.min(r.z0, r.z1) - m && z < Math.max(r.z0, r.z1) + m;
  const floors = [
    { x0: EW.x0, x1: EW.x1, z0: -HALF, z1: HALF },
    { x0: -HALF, x1: HALF, z0: NORTH_Z, z1: -HALF },
    { x0: -HALF, x1: HALF, z0: HALF, z1: SOUTH_Z },
    L2HALL,
    { x0: -FOOD.hw, x1: FOOD.hw, z0: FOOD.z0, z1: FOOD.z1 },
    { x0: L2HALL.x0, x1: L2HALL.x1, z0: L2HALL.z1, z1: -HALF },
    { x0: HALF, x1: L2HALL.x0, z0: L2HALL.z1, z1: -HALF },
  ];
  if (floors.some((f) => inRect(f))) return 'floor';
  for (const s of L.shops) {
    if (inRect(s)) return s.closed ? 'closed-shop' : 'open-shop';
  }
  for (const p of L.passages) {
    if (inRect(p.rect)) return 'passage';
  }
  return null;
}
function onKnownBlocker(x, z) {
  return L.blockers.some((b) => x > b.x0 - R && x < b.x1 + R && z > b.z0 - R && z < b.z1 + R);
}

const mismatches = [];
const grid = 0.45;
for (let x = EW.x0 - 2; x <= EW.x1 + 2; x += grid) {
  for (let z = NORTH_Z - 2; z <= SOUTH_Z + 2; z += grid) {
    const vis = visuallyOpen(x, z);
    if (!vis || vis === 'closed-shop') continue;
    // 출구 계단 끝(통로 먼 쪽)은 올라가는 계단이라 평지로 걷지 않는다.
    if (vis === 'passage') {
      const p = L.passages.find((q) => {
        const r = q.rect;
        return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
      });
      if (p) {
        const depth = (x - p.mouth.x) * p.out.x + (z - p.mouth.z) * p.out.z;
        if (depth > 4.15) continue;
      }
    }
    if (onKnownBlocker(x, z)) continue;
    if (!walkable(x, z, R, L)) mismatches.push({ x: +x.toFixed(2), z: +z.toFixed(2), vis });
  }
}
assert.equal(mismatches.length, 0, `visual openings not walkable (${mismatches.length}): ${JSON.stringify(mismatches.slice(0, 12))}`);

const seals = closed.filter((s) => ['직원만', '준비중', '창고칸'].includes(s.name));
assert.ok(seals.length >= 3, `sealed leftover fronts ${seals.length}`);

console.log(JSON.stringify({
  shops: L.shops.length,
  open: open.length,
  closed: closed.length,
  seals: seals.map((s) => s.name),
  flooded: fromPlaza.n,
  openReachable: open.length,
}, null, 2));
console.log('test-gangnam-underground-walk OK');
