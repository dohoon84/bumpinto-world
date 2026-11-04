// [migeum] 미금역 일대 확장(1단계) — 판교(pangyo.js)와 같은 방식으로 코리더 데이터에 덧붙이는 로더.
//   ?migeum=0 이면 요청·메시·라벨·이동 범위 전부 없음(기존 코리더·정자 그대로).
//   migeum/index.json  tiles{key:{x0,z0,nb,nr,mode}} : mode=new 새 칸 / mode=add 기존 코리더 타일(-1_2·0_2) 뒤에 이어 붙일 것
//   stations[미금] · landmarks[출입구 1–8번]  (node scripts/corridor/build-pangyo.mjs --region=migeum)
export const MIGEUM_DIR = 'migeum/';

export function migeumEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search).get('migeum') !== '0';
}

// 코리더 index 에 미금 타일을 합친 새 index (원본 객체는 바꾸지 않음).
//   t.ext / t.extMode → fetchCorridorTile(pangyo.js)이 migeum/ 파일을 읽는다.
//   meta.bounds 는 미금 박스까지 넓힌다(이동 가능 범위 = 라이브 ∪ 코리더 경계 → z 2500 까지)
export function mergeMigeumIndex(index, mg) {
  if (!index || !mg?.tiles) return index;
  const tiles = { ...index.tiles };
  for (const [key, t] of Object.entries(mg.tiles)) {
    if (t.mode === 'add') { if (tiles[key] && !tiles[key].pangyo) tiles[key] = { ...tiles[key], ext: MIGEUM_DIR, extMode: 'add' }; }
    else if (!tiles[key]) tiles[key] = { x0: t.x0, z0: t.z0, nb: t.nb, nr: t.nr, ext: MIGEUM_DIR, extMode: 'new' };
  }
  const B = index.meta?.bounds, mb = mg.meta?.box;
  const bounds = B && mb ? { x0: Math.min(B.x0, mb.x0), x1: Math.max(B.x1, mb.x1), z0: Math.min(B.z0, mb.z0), z1: Math.max(B.z1, mb.z1) } : B;
  return { ...index, tiles, meta: { ...index.meta, bounds } };
}
