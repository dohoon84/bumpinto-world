// [gangnam] 이동 범위가 사각형 하나가 아닐 때 (강남 = 코리더와 떨어진 섬).
//   bounds.islands 가 없으면 예전과 같이 bounds 사각형 하나.
//   있으면 그 사각형들 안에서만 움직인다. 섬 사이 빈 땅은 범위 밖 → 걸어서 건너지 못한다.
//   섬 안에서는 각 사각형 클램프가 예전 한 사각형 클램프와 같다.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function pointInBox(x, z, b) {
  return !!b && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

export function inWorldBounds(p, b) {
  if (!b || !p) return !b;
  const islands = b.islands;
  if (islands?.length) return islands.some((box) => pointInBox(p.x, p.z, box));
  return pointInBox(p.x, p.z, b);
}

// 지금 점이 들어 있는 섬(없으면 가장 가까운 섬) 안으로 클램프.
export function clampWorld(x, z, b) {
  if (!b) return { x, z };
  const islands = b.islands;
  if (!islands?.length) return { x: clamp(x, b.x0, b.x1), z: clamp(z, b.z0, b.z1) };
  let box = islands.find((c) => pointInBox(x, z, c));
  if (!box) {
    let best = Infinity;
    for (const c of islands) {
      const cx = clamp(x, c.x0, c.x1), cz = clamp(z, c.z0, c.z1);
      const d = (cx - x) ** 2 + (cz - z) ** 2;
      if (d < best) { best = d; box = c; }
    }
  }
  return { x: clamp(x, box.x0, box.x1), z: clamp(z, box.z0, box.z1) };
}
