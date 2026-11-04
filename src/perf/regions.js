// [perf-memory] 지역 지연 로드/해제 레지스트리 (?lazyregion=0 이면 안 씀).
//   지역마다 상자(boxes, 월드 x/z) + 들어올 거리(near) + 나갈 거리(far, near 보다 커야 함 = 히스테리시스)를 등록하면,
//   플레이어(또는 카메라)가 상자에서 near 안으로 들어오거나 진행 방향으로 lookAheadSec 초 뒤 near 안일 때 onEnter() 를,
//   far 밖으로 나가면 onLeave() 를 부른다. onEnter 는 Promise 를 돌려도 된다(그동안 다시 부르지 않음).
//   미금 등 새 지역은 corridor.regions.register({...}) 한 줄로 붙인다(docs/perf-memory.md).
export function distToBoxes(x, z, boxes) {
  let best = Infinity;
  for (const b of boxes) {
    const dx = x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : 0;
    const dz = z < b.z0 ? b.z0 - z : z > b.z1 ? z - b.z1 : 0;
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}

export function createRegionRegistry({ lookAheadSec = 6, minIntervalSec = 0.5 } = {}) {
  const regions = new Map();
  const log = [];
  let acc = Infinity;
  function register({ id, boxes, near = 1500, far = null, onEnter, onLeave, startLoaded = false }) {
    if (!id || !boxes?.length) throw new Error('region: id/boxes 필요');
    const r = { id, boxes, near, far: far ?? near * 1.4, onEnter, onLeave, loaded: startLoaded, busy: false, enters: 0, leaves: 0, dist: Infinity };
    regions.set(id, r);
    return () => regions.delete(id);
  }
  async function run(r, enter) {
    r.busy = true;
    try {
      if (enter) { await r.onEnter?.(); r.loaded = true; r.enters++; } else { await r.onLeave?.(); r.loaded = false; r.leaves++; }
      log.push({ id: r.id, enter, t: Math.round(performance.now()) }); if (log.length > 40) log.shift();
    } catch (e) { console.warn('[perf-memory] region', r.id, enter ? 'enter' : 'leave', e); }
    r.busy = false;
  }
  // x,z: 지금 위치, vx,vz: 초당 이동량(없으면 0). dt 누적이 minIntervalSec 넘을 때만 검사한다. force=true 면 바로.
  function update(x, z, vx = 0, vz = 0, dt = 0, force = false) {
    acc += dt;
    if (!force && acc < minIntervalSec) return;
    acc = 0;
    const ax = x + vx * lookAheadSec, az = z + vz * lookAheadSec;
    for (const r of regions.values()) {
      const d = Math.min(distToBoxes(x, z, r.boxes), distToBoxes(ax, az, r.boxes));
      r.dist = d;
      if (r.busy) continue;
      if (!r.loaded && d <= r.near) run(r, true);
      else if (r.loaded && d > r.far) run(r, false);
    }
  }
  const status = () => [...regions.values()].map(({ id, loaded, busy, enters, leaves, dist, near, far }) => ({ id, loaded, busy, enters, leaves, dist: Math.round(dist), near, far }));
  return { register, update, status, log, get size() { return regions.size; }, has: (id) => regions.has(id), isLoaded: (id) => !!regions.get(id)?.loaded };
}
