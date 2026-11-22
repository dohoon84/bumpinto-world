// [seongsu] 하우스 노웨어 서울 사람들 — 직원(검정 유니폼)·쇼핑객·오브제 앞 관람객·누데이크 손님. 좌표 = 사옥 로컬 (+z 정문).
//   군중은 명동과 같은 createMyeongdongNpc(게임 표준 아바타 + 부품 인스턴싱)를 쓴다. 이 파일은 자리·길·차림만 정한다.
//   자리 [x, z, ry, 층, sit?]  — ry: 아바타가 보는 방향(0 = +z). sit 'bench' = 의자에 앉기 (누데이크 의자 높이 0.46 m)
//   길 { pts:[[x,z]...], 층, w } — 층 바닥 위를 오가는 쇼핑객 (닫힌 고리는 첫 점을 끝에 다시 넣는다)
import { PLAN as P } from './plan.js';

const FY = P.floorY;
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z); // (x,z) 에서 (tx,tz) 를 보는 ry

// 직원 (promo 풀) — 검정 셔츠·바지, 모자 없음
export const HQ_STAFF = [
  [0.0, 10.6, 0, 1], // 1F 정문 안내
  [-9.0, -9.6, 0, 1], // 1F 탬버린즈 카운터 안
  [8.5, 9.6, face(8.5, 9.6, 8.5, 7.8), 1], // 1F 섬 진열대
  [-2.0, 7.6, face(-2, 7.6, -0.9, 4.7), 2], // 2F 링 옆
  [6.6, -1.2, face(6.6, -1.2, 4.3, 7.4), 2], // 2F 진열 큐브 사이
  [-8.6, -12.9, 0, 3], // 3F 계산대 (북쪽 벽 앞)
  [3.2, 3.0, face(3.2, 3.0, 6.0, -2.0), 3], // 3F 마네킹 앞
  [-8.6, -11.4, 0, 5], // 5F 누데이크 카운터 안
  [-6.0, -11.4, 0, 5], // 5F 누데이크 카운터 안 (둘째)
  [1.0, 2.0, face(1, 2, 4.5, 5), 5], // 5F 서빙 (테이블 사이)
];

// 관람객·손님 (vendor 풀) — 서서 오브제를 보거나, 5F 의자에 앉는다
const around = (cx, cz, r, n, a0, fl) => Array.from({ length: n }, (_, i) => { const a = a0 + i * 0.9; const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; return [x, z, face(x, z, cx, cz), fl]; });
const tables = [[-9, 0.5], [-9, 8], [-2, 9.5], [4.5, 5], [-3, -6.5], [6.5, -6]];
export const HQ_GUESTS = [
  ...around(-0.9, 4.7, 4.6, 4, 1.2, 1), // 1F 잠자는 하운드
  ...around(-7.4, 5.4, 2.6, 2, 0.3, 1), // 1F 알루미늄 거인
  ...around(-9.0, -10.0, 4.4, 2, 1.1, 1), // 1F 탬버린즈 카운터 앞
  ...around(4.3, 7.4, 2.8, 3, 3.6, 2), // 2F 무릎 꿇은 거인
  ...around(-6.8, -4.8, 2.8, 2, 0.4, 2), // 2F 다른 거인
  ...around(6.0, -2.0, 2.6, 3, 2.2, 3), // 3F 크롬 마네킹
  // 5F 누데이크: 의자에 앉은 손님 (테이블마다 1~2명, 의자 자리 = interior.js 와 같은 각도)
  ...tables.flatMap(([x, z], i) => [0, 1].slice(0, i % 2 ? 1 : 2).map((k) => { const a = k * 2.1 + i; const sx = x + Math.cos(a) * 1.0, sz = z + Math.sin(a) * 1.0; return [sx, sz, face(sx, sz, x, z), 5, 'bench']; })),
];
export const HQ_PATHS = [
  { pts: [[-5, 9.6], [5.5, 9.6], [5.5, 1.0], [-4.5, 0.4], [-5, 9.6]], fl: 1, w: 1.6, weight: 4 },
  { pts: [[-2.0, -1.5], [3.0, -1.5], [3.0, -7.0], [-6.0, -7.0], [-6.0, -1.5], [-2.0, -1.5]], fl: 1, w: 1.4, weight: 3 },
  { pts: [[-4.5, 4.0], [2.0, 4.0], [2.0, -1.5], [-4.5, -1.5], [-4.5, 4.0]], fl: 2, w: 1.4, weight: 3 },
  { pts: [[-6.0, 6.0], [0.0, 9.5], [6.0, 10.0]], fl: 3, w: 1.4, weight: 2 },
  { pts: [[-6.5, 3.0], [-0.5, 3.0], [2.0, -2.5], [-6.0, -3.0]], fl: 5, w: 1.2, weight: 1 },
];

// 차림
const SK = ['#f2d0b0', '#e8c4a8', '#f6d7c3', '#d7a888'];
export function staffLook(k, r) {
  const f = r() < 0.55;
  return { color: '#16171a', pants: '#16171a', gender: f ? 'f' : 'm', skin: SK[(r() * SK.length) | 0], hairColor: '#141414', hair: f ? (r() < 0.5 ? 'pony' : 'long') : 'short', top: 'long', glasses: r() < 0.35 ? 'square' : undefined };
}
const GT = ['#f4f4f2', '#2f3a4a', '#c9ced6', '#e8e0d2', '#1f2a44', '#8b5e3c', '#d6ccc2', '#6c757d', '#b5838d', '#3b3f45', '#e9c46a', '#264653'];
const GP = ['#2b2f36', '#3c4350', '#8a7f6c', '#22262b', '#d6ccc2', '#4b5f86'];
export function guestLook(k, r) {
  const f = r() < 0.6, p = (a) => a[(r() * a.length) | 0];
  const look = { color: p(GT), pants: p(GP), gender: f ? 'f' : 'm', skin: p(SK), hairColor: r() < 0.85 ? '#1a1a1a' : '#4a3428', hair: f ? p(['long', 'pony', 'medium', 'short']) : p(['short', 'medium']) };
  if (r() < 0.35) look.glasses = p(['sun', 'round', 'square']); // 젠틀몬스터라서 선글라스가 많다
  if (r() < 0.3) { look.bag = p(['crossbody', 'tote']); look.bagColor = p(['#2b2f36', '#e8e0d2', '#8e6e53']); }
  if (r() < 0.2) { look.hat = p(['beanie', 'cap', 'bucket']); look.hatColor = p(['#2b2f36', '#e8e0d2', '#1f2a44']); }
  return look;
}

/** 로컬 → 월드 변환 함수(toWorld(lx,lz) → [x,z]), 바닥 기준 높이 y0 로 군중 입력을 만든다 */
export function hqCrowdInput(toWorld, { y0 = 0, rot = 0 } = {}) {
  const pt = ([x, z]) => toWorld(x, z);
  const spot = ([x, z, ry, fl, sit]) => { const [wx, wz] = toWorld(x, z); return [wx, wz, ry + rot, y0 + FY[fl] + (sit ? 0.0 : 0), sit]; };
  return {
    promoters: HQ_STAFF.map(spot),
    vendors: HQ_GUESTS.map(spot),
    paths: HQ_PATHS.map((p) => ({ pts: p.pts.map(pt), w: p.w, weight: p.weight, y: y0 + FY[p.fl] })),
  };
}

/** 군중 길 모양 { pts, cum, L, w, weight, y } */
export function withCum(p) {
  const cum = [0];
  for (let i = 1; i < p.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]));
  return { ...p, cum, L: cum[cum.length - 1] };
}
