// [migeum-lamps] 미금역 일대 T자 가로등 — 판교(corridor/pangyoStreetlights.js)와 같은 런타임·모델·재질·켜짐 값(world/nightFade.js nightFade())
//   데이터: public/corridor/migeum/streetlights.json (scripts/corridor/build-streetlights.mjs --migeum). OSM highway=street_lamp 가 범위 안에 0개라 도로 규칙 배치
//   그리기: InstancedMesh 3개(기둥+팔+등갓 · 램프 유리 · 바닥 웅덩이). 500 m 타일 단위로 초점 420 m 안 + 상세 타일이 빌드된 칸만
//   이 범위 안의 코리더 가로등(-1_2 · 0_2 칸)은 world/streetlights.js 가 skipBoxes 로 건너뛴다. 탄천 띠 안 코리더 공원등은 굽기에서 그대로 옮겨 담음
//   끄기: ?migeumlamps=0 · ?migeum=0 · ?streetlights=0 → 만들지 않음(기존 코리더 가로등 그대로)
import { createPangyoStreetlights } from './pangyoStreetlights.js';

export const MIGEUM_LAMPS_FILE = 'migeum/streetlights.json';
export function migeumLampsEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search);
  return q.get('migeum') !== '0' && q.get('migeumlamps') !== '0' && q.get('streetlights') !== '0';
}
export function createMigeumStreetlights(opts) {
  return createPangyoStreetlights({ ...opts, name: 'migeum', banks: true });
}
