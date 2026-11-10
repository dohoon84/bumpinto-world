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
export const PANGYO_TG = Object.freeze({ x: -482.05, z: -3232.35, r: 55 });
export const PANGYO_CITY_BOXES = Object.freeze([
  { x0: -250, x1: 1000, z0: -3500, z1: -2500 },
  { x0: -180, x1: 125, z0: -3700, z1: -3500 },
]);

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

export function inPangyoCity(x, z) {
  return PANGYO_CITY_BOXES.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
}

export function nearPangyoToll(x, z, r = PANGYO_TG.r) {
  return Math.hypot(x - PANGYO_TG.x, z - PANGYO_TG.z) < r;
}

// 판교 고가·요금소 선 높이(pangyoExpress). 바이크·보행은 getVehicleHeight 가 아니라 getGroundHeight 를 쓰므로
// 여기 더하지 않으면 상판(최대 6m) 아래로 빠진다.
let heightExtra = null;
export function setExpressHeightExtra(fn) {
  heightExtra = typeof fn === 'function' ? fn : null;
}

/** 판교 고가 높이를 본선 체인에 붙이고, 데이터가 비는 구간은 이웃 높이로 잇는다. */
export function buildExpressHeightProfile(pts, extraFn) {
  const n = pts?.length || 0;
  if (!n) return () => EXPRESS_ROAD_Y;
  const acc = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    acc[i] = acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  const ys = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const e = extraFn ? extraFn(pts[i][0], pts[i][1]) : null;
    if (e != null) ys[i] = Math.max(EXPRESS_ROAD_Y, e + 0.1);
    else if (pts[i][3] === 'main' || pts[i][3] === 'spur') ys[i] = EXPRESS_ROAD_Y;
  }
  if (ys[0] == null) ys[0] = EXPRESS_ROAD_Y;
  if (ys[n - 1] == null) ys[n - 1] = EXPRESS_ROAD_Y;
  let prev = 0;
  for (let i = 1; i < n; i++) {
    if (ys[i] == null) continue;
    const sa = acc[prev], sb = acc[i], ya = ys[prev], yb = ys[i], span = (sb - sa) || 1;
    for (let k = prev + 1; k < i; k++) ys[k] = ya + (yb - ya) * ((acc[k] - sa) / span);
    prev = i;
  }
  return function profileAt(x, z) {
    let best = Infinity, y = EXPRESS_ROAD_Y;
    for (let i = 1; i < n; i++) {
      const ax = pts[i - 1][0], az = pts[i - 1][1];
      const dx = pts[i][0] - ax, dz = pts[i][1] - az, L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < best) {
        best = d;
        y = ys[i - 1] + (ys[i] - ys[i - 1]) * t;
      }
    }
    return y;
  };
}

export function expressRoadHeight(x, z, pts, r = EXPRESS_PAVE_R) {
  if (!pts?.length) return null;
  if (distToPts(x, z, pts) > r) return null;
  const e = heightExtra ? heightExtra(x, z) : null;
  return e == null ? EXPRESS_ROAD_Y : Math.max(EXPRESS_ROAD_Y, e);
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
