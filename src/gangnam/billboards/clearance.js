// [gangnam-ads] 미디어폴 둘레 4m 에는 가로수를 심지 않는다.
//   가로수 수관 반지름이 약 2.2–2.9m 라, 기둥 중심 4m 안을 비우면 화면이 나뭇잎에 가리지 않는다.
//   폴 좌표는 placements.js (출구 기준 규칙). 다른 지역 나무는 이 좌표에서 멀리 있어 영향 없다.
import placements from './placements.js';

export const POLE_CLEAR_M = 4;

export const POLES = (placements.screens || []).filter((s) => s.kind === 'pole').map((s) => ({ id: s.id, x: s.x, z: s.z }));

export function treeBlockedByPole(x, z, poles = POLES, radius = POLE_CLEAR_M) {
  const r2 = radius * radius;
  for (const p of poles) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r2) return p;
  return null;
}
