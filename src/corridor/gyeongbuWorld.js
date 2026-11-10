// [gyeongbu-bus] 판교IC–청계산–양재–강남대로 이동 범위와 노면 높이.
//   본선 bounds(x0=-2500)와 강남 섬 사이는 일부러 빈 땅이라, 경부 본선·청계산입구가 범위 밖이었다.
//   출구에서 한 걸음만 걸어도 clampWorld 가 본선 서쪽 끝으로 끌어 가고, 바이크는 inWorldBounds 에서 멈춰
//   '투명 벽·세상 끝'처럼 보이며, 끌려간 자리에는 도로가 없어 회색 지형만 남는다.
//   본선 사각형 숫자는 그대로 두고, 본선 경로 띠(corridors)와 청계산로 일대 섬만 더한다.
export const CHEONGGYE_ISLAND = Object.freeze({ x0: -5650, x1: -3450, z0: -10000, z1: -8150 });
export const EXPRESS_ROAD_Y = 0.30; // gyeongbuExpress.js 본선 아스팔트 높이
export const EXPRESS_PAVE_R = 32; // 중심선에서 4+4 차로·갓길 바깥까지 + 여유
export const EXPRESS_CORRIDOR_HALF = 140; // 본선을 따라 달릴 수 있는 띠 반폭(청계산 출입구 포함, 빈 산은 열지 않음)
export const CHEONGGYE_FLAT_R = 42; // DEM 을 0m 로 펴는 본선 반경. 예전 34m 는 반대편 갓길 여유가 적었다.

// 고치기 전, 본선·강남 섬만 있을 때 막히던 지점 (판교→강남).
export const BEFORE_FIX_STUCK = Object.freeze([
  { s: 4367, x: -2511.9, z: -5964.6, name: '판교IC 지나 본선 서쪽 끝', why: '본선 bounds x0=-2500. 바이크는 inWorldBounds 에서 멈춤, 걸으면 x=-2500 으로 고정' },
  { s: 8021, x: -4698.6, z: -8876.0, name: '청계산입구 본선', why: '본선·강남 섬 사이 공백. 1·2번 출구도 여기 있어 나오면 회색 평원으로 끌려감' },
  { s: 12072, x: -7044.2, z: -12166.0, name: '양재IC 부근', why: '양재는 강남 섬(z0=-15500)보다 북쪽이라 범위 밖' },
  { s: 14110, x: -7628.0, z: -14118.0, name: '서초IC–강남 진입 전', why: '강남 섬에 들어가기 직전까지 공백' },
]);

function xzPts(pts) {
  return (pts || []).map((p) => [p[0], p[1]]);
}

export function distToPts(x, z, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best) best = d;
  }
  return best;
}

export function expressRoadHeight(x, z, pts, r = EXPRESS_PAVE_R) {
  if (!pts?.length) return null;
  return distToPts(x, z, pts) <= r ? EXPRESS_ROAD_Y : null;
}

export function sampleExpressPts(pts, step = 20) {
  const out = [];
  if (!pts?.length) return out;
  const heading = (i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + (i === 0 ? 1 : 0) || i)];
    const j = Math.min(pts.length - 1, i + 1);
    const dx = pts[j][0] - pts[Math.max(0, j - 1)][0], dz = pts[j][1] - pts[Math.max(0, j - 1)][1];
    const L = Math.hypot(dx, dz) || 1;
    return [dx / L, dz / L];
  };
  let acc = 0;
  const push = (s, x, z, i) => {
    const [hx, hz] = heading(i);
    out.push({ s, x, z, hx, hz, kind: pts[i][3] || '' });
  };
  push(0, pts[0][0], pts[0][1], 0);
  let next = step;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const seg = Math.hypot(bx - ax, bz - az) || 1e-9;
    while (acc + seg >= next - 1e-6 && next < acc + seg + 1e6) {
      if (next > acc + seg + 1e-9) break;
      const t = (next - acc) / seg;
      push(next, ax + (bx - ax) * t, az + (bz - az) * t, i);
      next += step;
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  if (!out.length || acc - out.at(-1).s > 1) push(acc, last[0], last[1], pts.length - 1);
  return out;
}

export function mergeGyeongbuWorld(index, expressPts, search = typeof location !== 'undefined' ? location.search : '') {
  if (!index) return index;
  const p = new URLSearchParams(search || '');
  if (p.get('gangnam') === '0') return index;
  const B = index.meta?.bounds, box = CHEONGGYE_ISLAND;
  const existing = index.meta?.islands;
  const main = existing?.[0] || (B ? { x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1 } : null);
  if (!main) return index;
  const rest = (existing && existing.length ? existing.slice(1) : []).filter((b) => !(b && b.x0 === box.x0 && b.x1 === box.x1 && b.z0 === box.z0 && b.z1 === box.z1));
  const islands = [main, ...rest, box];
  const corridors = [];
  if (expressPts?.length >= 2) corridors.push({ pts: xzPts(expressPts), halfWidth: EXPRESS_CORRIDOR_HALF });
  return { ...index, meta: { ...index.meta, islands, corridors } };
}
