// [night-buildings] 분당두산타워 문(門) 형상: OSM L자 덩어리(way 985748308) 대신 두 타워 + 꼭대기 브리지.
// 외곽선·전체 높이(120 m)는 그대로 두고, 서쪽 정면 가운데(브리지 아래)만 비운다. 사진 기준 비율:
//   · 서쪽 정면 z 202.5..317.7 (115.2 m) 중 가운데 34 m (≈30 %) 를 비움 → 북·남 타워 각 ≈40.6 m (둘 다 틈보다 넓음)
//   · 틈은 외곽선 전체 깊이(x)를 관통 → 낮·밤 모두 하늘이 보이고 지상에서 걸어서 지나갈 수 있다
//   · 브리지 덩어리: 꼭대기 4개 층 (120 − 4×4.44 ≈ 102.2 m 부터), 그 위 약 6.5 m 는 루버 크라운(밤 조명)
// 메시는 정자 기존 벽/지붕 합친 메시에 들어가므로 draw call 증가 없음. ?doosanGate=0 이면 원래 L자 덩어리.
export const DOOSAN_NAME = '분당두산타워';
export const isDoosan = (b) => b?.n === DOOSAN_NAME;
export const DOOSAN_GATE = typeof location === 'undefined' || new URLSearchParams(location.search).get('doosanGate') !== '0';
export const GATE = { z0: 243.1, z1: 277.1, yB: 102.2, yC: 113.5 };

// 링을 z0 ≤ z ≤ z1 띠로 자른다 (Sutherland–Hodgman). 두산 L자 외곽선은 z 로 잘라도 한 덩어리라 그대로 쓸 수 있다
export function clipRingZ(ring, z0, z1) {
  const cut = (pts, keep, zc) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ia = keep(a[1]), ib = keep(b[1]);
      if (ia) out.push(a);
      if (ia !== ib) { const t = (zc - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, zc]); }
    }
    return out;
  };
  return cut(cut(ring, (z) => z >= z0, z0), (z) => z <= z1, z1);
}

/** 두산타워면 { towers: [북, 남 링], yB, yC } (원래 b 는 그대로), 아니면 null */
export function doosanGate(b) {
  if (!DOOSAN_GATE || !isDoosan(b) || b.holes?.length) return null;
  let zMin = Infinity, zMax = -Infinity;
  for (const [, z] of b.o) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
  if (!(zMin < GATE.z0 - 20 && zMax > GATE.z1 + 20 && b.h > GATE.yC)) return null; // 데이터가 바뀌었으면 원래 덩어리
  const towers = [clipRingZ(b.o, -Infinity, GATE.z0), clipRingZ(b.o, GATE.z1, Infinity)];
  if (towers.some((r) => r.length < 3)) return null;
  return { towers, yB: GATE.yB, yC: GATE.yC };
}

/** 표지판·차양 등 벽에 붙는 것이 쓸 실제 벽 링들 (두산 문 형상이면 두 타워, 아니면 외곽선) */
export const solidRings = (b) => b.gate?.towers || [b.o];
