// [gangnam-night] 가장 가까운 정류장·지명 — 지금 서 있는 섬 안에서만 고른다.
//   강남 섬(islands[0] = 본선, 그 다음 = 강남 박스)에서 정자·판교 정류장/지명이 이기지 않게 한다.
//   islands 가 없으면(강남 꺼짐 · ?gangnam=0) 거리만 본다. 예전과 같다.
//   버스 단계(?gangnambus 는 아직 없음) 전에는 떨어진 섬에서 정류장 카드를 열지 않는다.

export function islandIndex(x, z, islands) {
  if (!islands?.length) return 0;
  for (let i = 0; i < islands.length; i++) {
    const b = islands[i];
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return i;
  }
  return -1;
}

/** 같은 섬이면 true. 섬 목록이 없으면 항상 true(기존 전역 조회). 빈 땅(섬 밖)끼리는 400m 안만 같은 쪽으로 본다. */
export function sameIsland(x, z, px, pz, islands) {
  if (!islands?.length) return true;
  const a = islandIndex(x, z, islands);
  const b = islandIndex(px, pz, islands);
  if (a < 0 || b < 0) return Math.hypot(px - x, pz - z) < 400;
  return a === b;
}

let islands = null;
let detachedStopCard = false;

export function setNearScope({ islands: next = null, detachedStopCard: card = false } = {}) {
  islands = next && next.length > 1 ? next : null;
  detachedStopCard = !!card;
}
export function nearIslands() { return islands; }

export function onDetachedIsland(x, z) {
  return islandIndex(x, z, islands) > 0;
}

/** 강남처럼 본선과 떨어진 섬에서는 그 섬 버스가 생기기 전에는 카드를 숨긴다. */
export function stopCardAllowed(x, z) {
  if (onDetachedIsland(x, z) && !detachedStopCard) return false;
  return true;
}

/**
 * items 중 (x,z) 와 같은 섬에 있고 maxDist 보다 가까운 것.
 * pos(item) → {x,z}. 없으면 null.
 */
export function nearestScoped(x, z, items, { maxDist = Infinity, pos = (it) => it, islands: list = islands } = {}) {
  let best = null, bd = maxDist;
  for (const it of items || []) {
    const p = pos(it);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    if (!sameIsland(x, z, p.x, p.z, list)) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; best = { item: it, d, x: p.x, z: p.z }; }
  }
  return best;
}

/**
 * 미니맵 지명. 120m 안 랜드마크가 있으면 그 이름, 아니면 1.8km 안 역 이름.
 * 다른 섬(판교·정자) 이름은 후보에 넣지 않는다.
 */
export function placeCaption(x, z, places, list = islands) {
  let nearLm = null, lmD = 120, nearSt = null, stD = 1800;
  for (const p of places || []) {
    if (!p || !sameIsland(x, z, p.x, p.z, list)) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (p.kind === 'station') { if (d < stD) { stD = d; nearSt = p; } }
    else if (d < lmD) { lmD = d; nearLm = p; }
  }
  const hit = nearLm || nearSt;
  return hit ? { name: hit.name, nameEn: hit.nameEn || hit.name, kind: hit.kind, d: nearLm ? lmD : stD } : null;
}

export function collectPlaces(stations, landmarks, home = null) {
  const out = [];
  for (const s of stations || []) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z) || !s.name) continue;
    const raw = String(s.name).replace(/역$/, '');
    out.push({ x: s.x, z: s.z, name: `${raw}역`, nameEn: `${s.nameEn || raw} Stn.`, kind: 'station' });
  }
  if (home && Number.isFinite(home.x) && Number.isFinite(home.z) && home.name && !/starbase/i.test(home.name)) {
    const raw = String(home.name).replace(/역$/, '');
    if (!out.some((p) => p.kind === 'station' && Math.hypot(p.x - home.x, p.z - home.z) < 80)) {
      out.push({ x: home.x, z: home.z, name: `${raw}역`, nameEn: 'Jeongja Stn.', kind: 'station' });
    }
  }
  for (const l of landmarks || []) {
    if (l.model !== 'textSign' || !l.pos || !l.label?.ko) continue;
    out.push({ x: l.pos.x, z: l.pos.z, name: l.label.ko, nameEn: l.label.en || l.label.ko, kind: 'landmark' });
  }
  return out;
}
