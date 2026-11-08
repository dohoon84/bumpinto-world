// [gangnam-night] 3인칭 카메라를 건물 풋프린트 밖으로 당긴다.
//   기존 따라보기 카메라는 지면 높이만 피하고 벽은 통과한다. 강남 고층은 그 집합에 없었다.
//   roofAt(x,z) = 그 점의 건물 지붕 높이(없으면 0). 카메라 높이가 지붕보다 낮으면 안으로 본 것이다.
//   플레이어→카메라 구간을 나눠, 처음 걸리는 곳 앞에서 멈춘다. 최소 거리는 캐릭터가 보이게 2.4m.

export function shortenBoom(dist, insideAt, { min = 2.4, steps = 16 } = {}) {
  if (!(dist > min)) return dist;
  for (let i = 1; i <= steps; i++) {
    const d = (dist * i) / steps;
    if (insideAt(d)) return Math.max(min, (dist * (i - 1)) / steps);
  }
  return dist;
}

/** 붐 위의 한 점. yaw/pitch 는 game.js 따라보기와 같다. */
export function boomPoint(px, pz, py, yaw, pitch, d) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return {
    x: px + Math.sin(yaw) * d * cp,
    z: pz + Math.cos(yaw) * d * cp,
    y: py + d * sp,
  };
}
