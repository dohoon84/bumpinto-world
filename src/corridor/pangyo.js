// [pangyo] 판교역 일대 확장(1단계) — 코리더 데이터에 덧붙이는 로더. ?pangyo=0 이면 요청·메시·라벨 전부 없음(기존 코리더 그대로).
//   pangyo/index.json  tiles{key:{x0,z0,nb,nr,mode}} : mode=new 새 칸 / mode=add 기존 코리더 타일 뒤에 이어 붙일 것
//   stations[판교] · landmarks[현대백화점·알파돔시티·광장 데크·출입구]  (scripts/corridor/build-pangyo.mjs)
export const PANGYO_DIR = 'pangyo/';

export function pangyoEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search).get('pangyo') !== '0';
}

// 코리더 index 에 판교 타일을 합친 새 index (원본 객체는 바꾸지 않음). 역·랜드마크는 따로 둔다(버스/차량 NPC 데이터는 그대로).
export function mergePangyoIndex(index, pg) {
  if (!index || !pg?.tiles) return index;
  const tiles = { ...index.tiles };
  for (const [key, t] of Object.entries(pg.tiles)) {
    if (t.mode === 'add') { if (tiles[key]) tiles[key] = { ...tiles[key], pangyo: 'add' }; }
    else if (!tiles[key]) tiles[key] = { x0: t.x0, z0: t.z0, nb: t.nb, nr: t.nr, pangyo: 'new' };
  }
  return { ...index, tiles };
}

// 상세/LOD 타일 JSON 합치기: 원본 항목·순서 유지(streams 컷 인덱스 보존), 덧붙일 것은 뒤로
export function mergeTileJson(main, add) {
  if (!add) return main;
  if (!main) return add;
  const out = { ...main };
  for (const [k, v] of Object.entries(add)) if (Array.isArray(v) && v.length) out[k] = (main[k] || []).concat(v);
  return out;
}

// 타일 하나 가져오기 (kind = 'tiles' | 'lod'). t.pangyo: new → 판교 파일만, add → 원본 + 판교 덧붙임
export async function fetchCorridorTile(getJson, t, kind) {
  const file = `${kind}/${t.key}.json`;
  if (t.pangyo === 'new') return getJson(PANGYO_DIR + file);
  if (t.pangyo === 'add') { const [a, b] = await Promise.all([getJson(file), getJson(PANGYO_DIR + file)]); return a ? mergeTileJson(a, b) : null; }
  return getJson(file);
}
