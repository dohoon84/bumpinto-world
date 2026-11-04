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
//   [migeum] t.ext(폴더) + t.extMode(new|add) 도 같은 규칙 (migeum.js mergeMigeumIndex)
export async function fetchCorridorTile(getJson, t, kind) {
  const file = `${kind}/${t.key}.json`;
  const dir = t.pangyo ? PANGYO_DIR : t.ext, mode = t.pangyo || t.extMode;
  if (dir && mode === 'new') return getJson(dir + file);
  if (dir && mode === 'add') { const [a, b] = await Promise.all([getJson(file), getJson(dir + file)]); return a ? mergeTileJson(a, b) : null; }
  return getJson(file);
}

// ---------- [pangyo-link] 2단계: 정자역 → 판교역 버스(OSM relation 7090965 · 8110) ----------
//   pangyo/link.json (scripts/corridor/build-pangyo-link.mjs)
//     live     : 정자 bbox 안 조각 — src/game.js 가 ?bus=sim 일 때만 mergeSimExtra 로 덧붙임(실시간 모드 정자는 그대로)
//     corridor : 코리더/판교 조각 + 새 정류장 + 기존 정류장에 더할 노선 번호 — corridor life 가 mergeLinkTransit 으로 덧붙임
//   ?pangyolink=0 (또는 ?pangyo=0) 이면 요청 없음 → 코리더/정자 버스 데이터 원본 그대로
export const PANGYO_LINK_FILE = PANGYO_DIR + 'link.json';

export function pangyoLinkEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return pangyoEnabled(search) && new URLSearchParams(search).get('pangyolink') !== '0';
}

// 코리더 transit.json 사본에 link.corridor 를 덧붙인다. 기존 경로/정류장 번호·순서는 그대로(새 것은 뒤로).
export function mergeLinkTransit(T, L) {
  const X = L?.corridor;
  if (!T || !X?.paths?.length) return T;
  const routes = T.routes.map((r) => ({ ...r, paths: [...(r.paths || [])] })), byId = new Map(routes.map((r) => [r.id, r]));
  for (const r of X.routes || []) if (!byId.has(r.id)) { const c = { ...r, paths: [] }; routes.push(c); byId.set(r.id, c); }
  const paths = [...T.paths];
  for (const p of X.paths) { const id = paths.length; paths.push({ ...p, id, pangyoLink: true }); byId.get(p.route)?.paths.push(id); }
  const ref = X.routes?.[0]?.ref, add = new Set(X.addRoute || []);
  const have = new Set(T.stops.map((s) => s.id));
  let stops = T.stops.map((s) => (add.has(s.id) && ref && !(s.routes || []).includes(ref) ? { ...s, routes: [...(s.routes || []), ref] } : s));
  if (X.aliasRefs) stops = stops.map((s) => (s.routes?.some((r) => X.aliasRefs[r]) ? { ...s, routes: [...new Set(s.routes.map((r) => X.aliasRefs[r] || r))] } : s)); // [g8110]
  for (const s of X.stops || []) if (!have.has(s.id)) stops.push(s);
  const refTypes = { ...T.refTypes };
  for (const r of X.routes || []) if (!refTypes[r.ref] && r.type) refTypes[r.ref] = { type: r.type, src: r.src };
  return { ...T, routes, paths, stops, refTypes };
}
