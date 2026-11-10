// [gangnam] 강남역 일대 (B안 9칸, 섬). 판교·미금과 같은 타일 로더.
//   ?gangnam=0 이면 요청·타일·라벨·이동 범위(섬) 전부 없음. 본선 bounds 는 강남을 켜도 넓히지 않는다.
//   강남 박스는 meta.islands 로만 붙는다 → 코리더와 사이의 빈 땅(약 3.5 km)은 걸어서 갈 수 없다.
//   출입구 캐노피는 지하철(?gangnamsub=0 / ?subway=0 이 아니면)이 그리면 만들지 않는다 (미금과 같음).
export const GANGNAM_DIR = 'gangnam/';

export function gangnamEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search).get('gangnam') !== '0';
}

export function gangnamSubwayDrawsEntrances(search = typeof location !== 'undefined' ? location.search : '') {
  const p = new URLSearchParams(search);
  return p.get('gangnam') !== '0' && p.get('gangnamsub') !== '0' && p.get('subway') !== '0';
}

// 코리더 index 에 강남 타일을 합친 새 index (원본은 바꾸지 않음).
//   meta.bounds 숫자는 그대로 둔다. meta.islands = [본선 사각형, 강남 박스].
export function mergeGangnamIndex(index, gn) {
  if (!index || !gn?.tiles) return index;
  const tiles = { ...index.tiles };
  for (const [key, t] of Object.entries(gn.tiles)) {
    if (t.mode === 'add') {
      if (tiles[key] && !tiles[key].pangyo && !tiles[key].ext) tiles[key] = { ...tiles[key], ext: GANGNAM_DIR, extMode: 'add' };
    } else if (!tiles[key]) tiles[key] = { x0: t.x0, z0: t.z0, nb: t.nb, nr: t.nr, ext: GANGNAM_DIR, extMode: 'new' };
  }
  const B = index.meta?.bounds;
  const box = gn.meta?.box;
  const islands = B && box
    ? [{ x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1 }, { x0: box.x0, x1: box.x1, z0: box.z0, z1: box.z1 }]
    : index.meta?.islands;
  return { ...index, tiles, meta: { ...index.meta, bounds: B, islands } };
}
