// [migeum-roads] 미금 박스 차도 그래프 하나(migeum/roads.json, scripts/corridor/build-migeum-roads.mjs)를 코리더 차량·택시(#24)와
//   미금 차량 NPC(#26)가 같이 쓴다. way 조각마다 주인(own)이 하나라서 두 시스템 차량이 같은 차로를 나눠 쓰지 않는다.
//     c : 코리더 drive.json 의 길 → 코리더 차량(런타임은 drive.json 원본)
//     x : 미금 연장(돌마로·성남대로 남쪽, 역 320m 안 primary/secondary 7 way)
//         → migeumCorridorRoadsOn() 이면(기본, ?migeumtaxi 켜짐) 코리더 차량 그래프에 덧붙어 코리더 차량·택시 몫
//         → ?migeumtaxi=0 이면 미금 차량 NPC 몫
//     m : 나머지 박스 안 차도 → 미금 차량 NPC
//   미금 차량 NPC 는 코리더 몫 길과 만나는 노드·박스 경계 노드(포털)에서 사라지고 다른 곳에 나타난다(그 길로 들어가지 않음).
//   ?migeum=0 이면 아무것도 안 함(요청 없음 → 정자·코리더는 develop 과 같음).
export const MIGEUM_ROADS_FILE = 'migeum/roads.json';

const qget = (q, k) => (q && typeof q.get === 'function' ? q.get(k) : new URLSearchParams(q || '').get(k));
const LOC = () => (typeof location !== 'undefined' ? location.search : '');
// 미금 연장(x)을 코리더 차량이 맡는가. q: URLSearchParams 또는 검색 문자열
export function migeumCorridorRoadsOn(q = LOC()) { return qget(q, 'migeum') !== '0' && qget(q, 'migeumtaxi') !== '0'; }

// 주인 판정: 'corridor' | 'migeum'
export function migeumRoadOwner(way, { ext = true } = {}) {
  if (way.own === 'c') return 'corridor';
  if (way.own === 'x') return ext ? 'corridor' : 'migeum';
  return 'migeum';
}

// 코리더 차량 그래프에 덧붙일 미금 연장(x 조각) → { nodes, ways } (노드는 처음 나온 순서로 다시 번호)
export function migeumCorridorExt(roads) {
  const nodes = [], map = new Map(), ways = [];
  for (const w of roads?.ways || []) {
    if (w.own !== 'x') continue;
    const n = w.n.map((i) => { if (!map.has(i)) { map.set(i, nodes.length); nodes.push(roads.nodes[i].slice()); } return map.get(i); });
    const o = { id: w.id, k: w.k, n, w: w.w, ow: w.ow }; if (w.name) o.name = w.name; if (w.br) o.br = 1; if (w.lanes) o.lanes = w.lanes;
    ways.push(o);
  }
  return { nodes, ways };
}

// 코리더 차도 그래프 + 미금 연장 → 새 그래프(원본은 그대로). 노드 좌표(0.1m)가 같으면 하나 → 성남대로 끝(돌마로 교차점)에서 이어진다.
//   이미 있는 way id 는 건너뜀(두 번 불러도 같음)
export function mergeMigeumDrive(drive, ext) {
  if (!drive?.nodes || !ext?.ways?.length) return drive;
  const have = new Set(drive.ways.map((w) => w.id));
  const add = ext.ways.filter((w) => !have.has(w.id)); if (!add.length) return drive;
  const nodes = drive.nodes.slice(), ways = drive.ways.slice();
  const key = (p) => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10);
  const idx = new Map(); drive.nodes.forEach((n, i) => { const k = key(n); if (!idx.has(k)) idx.set(k, i); });
  const map = ext.nodes.map((p) => { const k = key(p); let j = idx.get(k); if (j == null) { j = nodes.length; nodes.push([p[0], p[1]]); idx.set(k, j); } return j; });
  for (const w of add) ways.push({ ...w, n: w.n.map((i) => map[i]), mg: 1 });
  return { ...drive, nodes, ways };
}
export function withMigeumCorridorRoads(drive, roads) { return roads ? mergeMigeumDrive(drive, migeumCorridorExt(roads)) : drive; }

// 미금 차량 NPC 그래프: 미금 몫 조각만(같은 OSM way 의 이어진 조각은 다시 하나로) → { nodes, ways, portals, clear }
//   portals = 박스 경계 노드 ∪ 코리더 몫 조각과 공유하는 노드
//   clear[k] = portals[k] 에서 만나는 코리더 몫 길 중 가장 넓은 것의 폭/2(박스 경계만이면 0) → 미금 차는 그 띠 앞에서 사라진다(코리더 차로에 들어가지 않음)
export function migeumLocalGraph(roads, { ext = true } = {}) {
  const mine = [], other = new Map();
  for (const w of roads?.ways || []) { if (migeumRoadOwner(w, { ext }) === 'migeum') mine.push(w); else for (const i of w.n) other.set(i, Math.max(other.get(i) || 0, w.w / 2)); }
  // 같은 id 로 끝-처음이 이어지는 조각 합치기(x 를 미금이 맡을 때 x+m 이 원래 way 하나로)
  const joined = [];
  for (const w of mine) {
    const prev = joined.find((p) => p.id === w.id && p.n[p.n.length - 1] === w.n[0] && p.k === w.k && p.ow === w.ow && p.w === w.w);
    if (prev) prev.n = prev.n.concat(w.n.slice(1)); else joined.push({ ...w, n: w.n.slice() });
  }
  const nodes = [], map = new Map();
  const id = (i) => { if (!map.has(i)) { map.set(i, nodes.length); nodes.push(roads.nodes[i].slice()); } return map.get(i); };
  const ways = joined.map(({ own, ...w }) => ({ ...w, n: w.n.map(id) }));
  const edge = new Set(roads.edge || []), portals = [];
  for (const [i, j] of map) if (edge.has(i) || other.has(i)) portals.push([j, other.get(i) || 0]);
  portals.sort((a, b) => a[0] - b[0]);
  return { nodes, ways, portals: portals.map((p) => p[0]), clear: portals.map((p) => p[1]) };
}
