// [migeum-water] 미금 박스 안 탄천 — migeum/water.json (scripts/corridor/build-migeum-water.mjs)
//   ch    : #17 탄천 띠 마스크에 빠졌던 OSM 길·다리(돌마교). base.ch 뒤에 붙여 terrain.annotate(상판·교각·난간·둔치 길 높이) + 같은 리본 메시
//   water : OSM 탄천 수면 ∩ 라이브 축 하도 띠 → tancheon.json water 와 같은 수면 메시에 합침 (메시 +0)
//   수위는 라이브 상수 그대로(낙차 0, DEM 참고값은 meta.level)
//   ?migeumwater=0 (또는 ?migeum=0) 이면 요청 없음 → #17 그대로
import { MIGEUM_DIR, migeumEnabled } from './migeum.js';

export const MIGEUM_WATER_FILE = MIGEUM_DIR + 'water.json';

export function migeumWaterEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return migeumEnabled(search) && new URLSearchParams(search).get('migeumwater') !== '0';
}

// base.ch + 미금 띠 길 (사본, 원본 안 바꿈)
export function migeumChRoads(W) {
  return (W?.ch || []).map((r) => ({ ...r, p: r.p.map((p) => p.slice()) }));
}
// tancheon.json water + 미금 수면
export function mergeMigeumWater(water, W) {
  if (!W?.water?.length) return water;
  return (water || []).concat(W.water);
}
// 둑 위치(W.bank, 축 점별 top/toe): 띠 안 OSM 차도(돌마교 교대·돌마로 접속부·금곡로)가 있는 구간만 그 쪽 둑을 도로 안쪽으로.
//   라이브 terrain.json 축(점 수·시작점)이 빌드 때와 같을 때만 적용, 아니면 T 그대로. 원본 prof 는 안 바꿈(사본)
export function applyMigeumBank(T, W, liveT = T) {
  const B = W?.bank, M = W?.meta?.bank;
  if (!T?.prof || !B || !M || !Object.keys(B).length) return T;
  if (liveT.axis.length !== M.axisN) return T;
  const sides = Object.entries(B);
  for (let k = 0; k < sides.length; k++) {
    const [, b] = sides[k], at = M.axisAt?.[k], p = liveT.axis[b.from];
    if (!at || !p || Math.hypot(at[0] - p[0], at[1] - p[1]) > 0.05 || b.from + b.top.length > M.axisN) return T;
  }
  const prof = { ...T.prof };
  for (const [s, b] of sides) {
    const top = prof['top' + s].slice(), toe = prof['toe' + s].slice();
    for (let k = 0; k < b.top.length; k++) { top[b.from + k] = b.top[k]; toe[b.from + k] = b.toe[k]; }
    prof['top' + s] = top; prof['toe' + s] = toe;
  }
  return { ...T, prof };
}
