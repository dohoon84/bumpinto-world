// [subway] 대합실 배치 (순수 데이터·기하, three 없음 → node 테스트 가능)
//   실제 정자역 대합실 도면은 공개 자료가 없어 '그럴듯한 일반 한국 역' 배치다. 출구 통로만 실제 출구 방위(OSM)로 묶는다.
//   좌표: x 동(+)·서(-), z 남(+)·북(-), y 위. 바닥 y=0, 천장 y=CEIL. 개찰구 선 z=0, z>0 은 유료 구역(타는 곳).
export const HALL = { x0: -30, x1: 30, z0: -12, z1: 12 };
export const CEIL = 3.8;
export const GATE = { z: 0, cab: [], lanes: [] };
for (let k = 0; k < 8; k++) GATE.cab.push(-4.55 + k * 1.3);
for (let k = 0; k < 7; k++) GATE.lanes.push(-3.9 + k * 1.3);
export const GATE_X = [-5.0, 5.0];
// [subway] feedback-13: 역무실 남쪽 벽을 점자블록(z=2.4) 안쪽으로 당겨(2.2→0.7) 계단 앞 통로를 넓힌다. 충돌도 같은 값.
export const OFFICE = { x0: 7, x1: 13, z0: -2.2, z1: 0.7 };
// 승강장 계단: 계단 | 에스컬레이터(가운데) | 계단. 위 z=4 → 아래 z=4+RUN, y=-DROP
export const DROP = 4.2, RUN = DROP / Math.tan(Math.PI / 6);
export const WELLS = [
  { id: 'sw', cx: -16.5, x0: -20, x1: -13, z0: 4, z1: 12, escDir: -1, ko: '수원·인천 방면', en: 'for Suwon · Incheon' },
  { id: 'se', cx: 16.5, x0: 13, x1: 20, z0: 4, z1: 12, escDir: 1, ko: '왕십리 방면', en: 'for Wangsimni' },
];
// 출구 통로: 방위(dir) → 벽 위치
const PASSAGE_SLOTS = {
  w: { wall: 'w', c: -6, half: 2.5 },
  e: { wall: 'e', c: -6, half: 2.5 },
  n: { wall: 'n', c: -1, half: 2.5 },
  s: { wall: 'n', c: 19, half: 2.5 }, // 남쪽 출구가 있으면 북쪽 벽 오른편 통로로 (정자역은 없음)
};
export const PASSAGE_LEN = 6;
export function passageFor(dir) {
  const s = PASSAGE_SLOTS[dir] || PASSAGE_SLOTS.n;
  // mouth: 대합실 안쪽 1.6m 지점(스폰), out: 통로 밖 방향 단위벡터
  if (s.wall === 'w') return { ...s, dir, mouth: { x: HALL.x0 + 1.6, z: s.c }, out: { x: -1, z: 0 }, rect: { x0: HALL.x0 - PASSAGE_LEN, x1: HALL.x0, z0: s.c - s.half, z1: s.c + s.half } };
  if (s.wall === 'e') return { ...s, dir, mouth: { x: HALL.x1 - 1.6, z: s.c }, out: { x: 1, z: 0 }, rect: { x0: HALL.x1, x1: HALL.x1 + PASSAGE_LEN, z0: s.c - s.half, z1: s.c + s.half } };
  return { ...s, dir, mouth: { x: s.c, z: HALL.z0 + 1.6 }, out: { x: 0, z: -1 }, rect: { x0: s.c - s.half, x1: s.c + s.half, z0: HALL.z0 - PASSAGE_LEN, z1: HALL.z0 } };
}

// 통로에서 걸을 수 있는 사각형 (대합실 쪽으로 1m 겹침, 바깥쪽 끝 2m 는 계단이라 못 감)
export function passageWalkRect(p, r = 0) {
  const R = p.rect;
  if (p.wall === 'w') return { x0: R.x0 + 2, x1: HALL.x0 + 1, z0: R.z0 + r, z1: R.z1 - r };
  if (p.wall === 'e') return { x0: HALL.x1 - 1, x1: R.x1 - 2, z0: R.z0 + r, z1: R.z1 - r };
  return { x0: R.x0 + r, x1: R.x1 - r, z0: R.z0 + 2, z1: HALL.z0 + 1 };
}
const inR = (r, x, z, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

// 고정 장애물 (상가·역무실·기둥·발매기·펜스). r: 원(기둥) 또는 사각형
// 북쪽 벽 통로(n·s 슬롯) 앞을 비운 x 구간들 ([a,b] 를 통로 폭 +0.2 만큼 잘라냄)
export function northGaps(passages = []) { return passages.filter((p) => p.wall === 'n').map((p) => [p.rect.x0 - 0.2, p.rect.x1 + 0.2]); }
export function cutSpans(a, b, gaps) {
  let out = [[a, b]];
  for (const [g0, g1] of gaps) out = out.flatMap(([x0, x1]) => (g1 <= x0 || g0 >= x1 ? [[x0, x1]] : [[x0, g0], [g1, x1]].filter(([u, v]) => v - u > 0.05)));
  return out;
}
export function staticBlockers(passages = []) {
  const B = [];
  const gaps = northGaps(passages);
  for (const [x0, x1] of cutSpans(HALL.x0, -5.5, gaps)) B.push({ x0, x1, z0: HALL.z0, z1: -8.6 });   // 북쪽 상가 줄 (편의점·분식) — 북쪽 통로 앞은 비움
  for (const [x0, x1] of cutSpans(3.5, HALL.x1, gaps)) B.push({ x0, x1, z0: HALL.z0, z1: -10.6 });   // 화장실·보관함 벽면 — 남쪽 출구(s 슬롯) 통로 앞은 비움
  B.push({ ...OFFICE });
  B.push({ x0: HALL.x0, x1: GATE_X[0], z0: -0.15, z1: 0.15 }); // 펜스
  B.push({ x0: GATE_X[1], x1: OFFICE.x0, z0: -0.15, z1: 0.15 });
  B.push({ x0: OFFICE.x1, x1: HALL.x1, z0: -0.15, z1: 0.15 });
  for (const x of GATE.cab) B.push({ x0: x - 0.16, x1: x + 0.16, z0: -0.9, z1: 0.9 }); // 개찰구 몸체
  B.push({ x0: -12.3, x1: -9.2, z0: -1.1, z1: -0.15 });         // 승차권 발매기
  for (const c of COLUMNS) B.push({ x0: c.x - 0.45, x1: c.x + 0.45, z0: c.z - 0.45, z1: c.z + 0.45 });
  // 계단 구멍: 실제 첫 계단(z0)까지 걸어간다 (예전엔 z=3.0 에 보이지 않는 차단선 → 계단 1m 앞 평지가 트리거였음, feedback-12)
  for (const w of WELLS) {
    B.push({ x0: w.x0 - 0.1, x1: w.x1 + 0.1, z0: w.z0 + STAIR_EDGE, z1: HALL.z1 });
    for (const sg of [-1, 1]) B.push({ x0: w.cx + sg * 0.72 - 0.15, x1: w.cx + sg * 0.72 + 0.15, z0: w.z0 - 1.0, z1: w.z0 + 1 }); // 에스컬레이터 옆판(위 끝, 그림은 z0-1.2 부터지만 계단 앞 통로 z≤2.7 은 비움)
  }
  return B;
}
export const COLUMNS = [
  ...[-22, -11, 11, 22].map((x) => ({ x, z: -5.5 })),
  ...[-25, -7, 7, 25].map((x) => ({ x, z: 7.5 })),
];

// 걸을 수 있는 곳? (r: 몸 반경). lanesOpen(i) 이 false 면 그 개찰구 통로 가운데를 막는다.
export function walkable(x, z, r, { passages = [], blockers = staticBlockers(), laneOpen = () => true } = {}) {
  const inHall = x > HALL.x0 + r && x < HALL.x1 - r && z > HALL.z0 + r && z < HALL.z1 - r;
  if (!inHall) {
    for (const p of passages) if (inR(passageWalkRect(p, r), x, z)) return true;
    return false;
  }
  for (const b of blockers) if (inR(b, x, z, r)) return false;
  for (let i = 0; i < GATE.lanes.length; i++) if (!laneOpen(i) && Math.abs(x - GATE.lanes[i]) < 0.5 && Math.abs(z - GATE.z) < 0.1 + r) return false;
  return true;
}

// 플레이어가 어느 출구 통로 안에 있나 (대합실 벽 넘어 1m 이상)
export function passageAt(x, z, passages) {
  for (const p of passages) {
    const R = p.rect;
    if (p.wall === 'w' && x < HALL.x0 - 1 && z > R.z0 && z < R.z1) return p;
    if (p.wall === 'e' && x > HALL.x1 + 1 && z > R.z0 && z < R.z1) return p;
    if (p.wall === 'n' && z < HALL.z0 - 1 && x > R.x0 && x < R.x1) return p;
  }
  return null;
}
// 개찰구 감지 구역에 처음 들어올 때. z<0 대합실 → 승차, z>=0 유료 구역 → 하차(요금은 승차에 포함).
export function gateTapSide(z, gateZ = GATE.z) { return z < gateZ ? 'in' : 'out'; }
// 개찰구 통로 번호 (|z| < zr 이면)
export function laneAt(x, z, zr = 1.4) {
  if (Math.abs(z - GATE.z) > zr) return -1;
  for (let i = 0; i < GATE.lanes.length; i++) if (Math.abs(x - GATE.lanes[i]) < 0.5) return i;
  return -1;
}
// 계단 앞 안내(힌트)만 띄우는 넓은 구역
export function nearWellTop(x, z) {
  for (const w of WELLS) if (x > w.x0 - 0.6 && x < w.x1 + 0.6 && z > 1.6 && z < w.z0 + 0.4) return w;
  return null;
}
// [subway] 실제로 첫 계단(z0) 바로 앞에, 계단/에스컬레이터 폭 안에서 발을 디딘 경우만 → 승강장으로 내려감.
//   계단 앞 통로·계단 옆·계단 1m 앞 평지는 대합실 그대로 (feedback-11, feedback-12).
//   몸(r 0.3)은 z0 + STAIR_EDGE - 0.3 = z0 까지 갈 수 있다. 띠 = [z0-0.45, z0+0.3)
export const STAIR_EDGE = 0.3;
export const WELL_MOUTH_Z = WELLS[0].z0 - 0.45;
export function wellMouth(x, z) {
  for (const w of WELLS) if (x > w.x0 + 0.35 && x < w.x1 - 0.35 && z > w.z0 - 0.45 && z < w.z0 + STAIR_EDGE) return w;
  return null;
}
// 걸어 들어가는 방향인가: 이동 단위벡터의 남쪽(계단 아래쪽) 성분. 옆걸음·대각 비비기는 아님
export const WELL_INTO = 0.8; // ≈ 37° 이내 (45° 대각 비비기는 아님)
// 승강장에서 올라온 직후: 스폰 지점에서 이만큼 벗어나거나 계단 앞 구역(nearWellTop)을 나가야 다시 내려갈 수 있다
export const WELL_REARM = 1.5;
