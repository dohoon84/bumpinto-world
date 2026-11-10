// [arcade] 문 앞 도넛 콜라이더에 갇히지 않는지 · 드나들기 경로
import {
  arcadePlacements, doorOutsidePos, doorRingWouldBlock, DOOR_EXIT_OUT,
} from '../src/arcade/locations.js';

const assert = (c, m) => { if (!c) throw new Error(m); };
const DOOR_R = 2.6;

function pointInRing(x, z, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function buildingHit(store, x, z, r = 0.4) {
  if (!store.ring) return false;
  const samples = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
  return samples.some(([dx, dz]) => pointInRing(x + dx, z + dz, store.ring));
}

// 현재 브랜치의 blocks() 는 항상 false (문 도넛 제거)
function arcadeBlocks() { return false; }

function walkToward(from, to, store, step = 0.15) {
  let x = from.x, z = from.z;
  const path = [{ x, z }];
  for (let i = 0; i < 200; i++) {
    const dx = to.x - x, dz = to.z - z;
    const d = Math.hypot(dx, dz);
    if (d <= step) { x = to.x; z = to.z; path.push({ x, z }); break; }
    const nx = x + (dx / d) * step;
    const nz = z + (dz / d) * step;
    if (arcadeBlocks(nx, nz) || buildingHit(store, nx, nz)) break;
    x = nx; z = nz;
    path.push({ x, z });
  }
  return { x, z, path };
}

const stores = arcadePlacements();
assert(stores.some((s) => s.id === 'arcade-jeongja'), '정자역점 위치 있음');

for (const store of stores) {
  const door = { x: store.door[0], z: store.door[1] };
  const out = doorOutsidePos(store);
  assert(out, `${store.id} exit pos`);
  assert(Math.hypot(out.x - door.x, out.z - door.z) >= DOOR_EXIT_OUT - 0.01, `${store.id} spawn distance`);

  // 예전 도넛: 문 중심에 서면 한 걸음도 못 나간다
  assert(!doorRingWouldBlock(door.x, door.z, store), `${store.id} hole itself was not "blocked"`);
  const away = doorOutsidePos(store, 0.5);
  assert(doorRingWouldBlock(away.x, away.z, store, 0.4), `${store.id} old ring trapped a 0.5m step out`);

  // 새 스폰은 건물 밖이고, 옛 도넛 밖이다
  if (store.ring) assert(!buildingHit(store, out.x, out.z), `${store.id} exit inside building`);
  assert(!doorRingWouldBlock(out.x, out.z, store), `${store.id} exit still in old ring`);
  assert(!arcadeBlocks(out.x, out.z), `${store.id} new blocks()`);

  // 거리에서 문으로: 문 반경 안에 도달 (E 입장)
  const street = doorOutsidePos(store, 6);
  const approach = walkToward(street, door, store);
  const distDoor = Math.hypot(approach.x - door.x, approach.z - door.z);
  assert(distDoor <= DOOR_R, `${store.id} cannot reach door (left ${distDoor.toFixed(2)}m)`);

  // 퇴장 후 거리 쪽으로 걸어 나감
  const farther = doorOutsidePos(store, 4);
  const leave = walkToward(out, farther, store);
  const progressed = Math.hypot(leave.x - out.x, leave.z - out.z);
  assert(progressed >= 1.5, `${store.id} trapped after leave, moved ${progressed.toFixed(2)}`);

  // 네 방향으로 한 걸음 (최소 거리 쪽·좌우는 열려 있어야 함)
  const nx = store.nx || 0, nz = store.nz || 1;
  const len = Math.hypot(nx, nz) || 1;
  const fx = nx / len, fz = nz / len;
  const steps = [
    [fx * 0.6, fz * 0.6],
    [-fz * 0.6, fx * 0.6],
    [fz * 0.6, -fx * 0.6],
  ];
  let free = 0;
  for (const [dx, dz] of steps) {
    const x = out.x + dx, z = out.z + dz;
    if (!arcadeBlocks(x, z) && !buildingHit(store, x, z)) free += 1;
  }
  assert(free >= 2, `${store.id} after leave only ${free} free directions`);
}

// 유리+스타벅스 서쪽 배치(fix/arcade-jeongja-glass)도 같은 수학으로 갇히지 않아야 한다
{
  const glass = {
    id: 'arcade-jeongja-glass',
    door: [-167.0, -20.3],
    nx: 0,
    nz: 1,
    ring: [[-175.5, -21.5], [-159.5, -21.5], [-159.5, -33.0], [-175.5, -33.0]],
  };
  const door = { x: glass.door[0], z: glass.door[1] };
  const out = doorOutsidePos(glass);
  assert(!buildingHit(glass, door.x, door.z), 'glass door is outside footprint');
  assert(!buildingHit(glass, out.x, out.z), 'glass exit is outside footprint');
  assert(doorRingWouldBlock(doorOutsidePos(glass, 0.5).x, doorOutsidePos(glass, 0.5).z, glass), 'glass old ring trapped');
  assert(!doorRingWouldBlock(out.x, out.z, glass), 'glass new spawn outside ring');
  const street = doorOutsidePos(glass, 6);
  const approach = walkToward(street, door, glass);
  assert(Math.hypot(approach.x - door.x, approach.z - door.z) <= DOOR_R, 'glass approach');
  const leave = walkToward(out, doorOutsidePos(glass, 4), glass);
  assert(Math.hypot(leave.x - out.x, leave.z - out.z) >= 1.5, 'glass walk out');
}

console.log('ok arcade-entrance', {
  stores: stores.map((s) => s.id),
  jeongja: doorOutsidePos(stores.find((s) => s.id === 'arcade-jeongja')),
  exitOut: DOOR_EXIT_OUT,
});
