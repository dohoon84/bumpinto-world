// [subway] 정자역 실제 출구 위치 (순수 데이터 + 계산, three 없음 → node 테스트 가능)
//
//   출처: OpenStreetMap railway=subway_entrance 노드 (ref 태그 = 출구 번호).
//         api.openstreetmap.org 0.6/map 으로 2026-11-03 확인 (repo 의 data/osm_raw_osmapi.json 과 좌표·ref 동일).
//         © OpenStreetMap contributors (ODbL)
//   ref 가 없거나 불확실한 노드는 번호를 지어내지 않는다 → ref: null 로 두면 번호 없이 '출구' 로만 표시.
//   (2026-11-03 기준 6개 모두 ref 있음)

export const JEONGJA_EXITS = [
  { ref: '1', osm: 3406785261, lat: 37.3662159, lon: 127.1084146 },
  // face: 출입구 방향 직접 지정 (rad, 계단이 내려가는 쪽 = sin·cos → +x·+z). OSM 에 계단 방향이 없고 자동(길과 나란히)이 틀린 곳만.
  //   2번: 도훈 피드백 (2026-11-03) — 입구가 북쪽 횡단보도 쪽을 보고 남쪽(+z)으로 내려가게
  { ref: '2', osm: 3406785262, lat: 37.3660485, lon: 127.1084119, face: 0 },
  { ref: '3', osm: 3234938504, lat: 37.3659366, lon: 127.1077875 },
  { ref: '4', osm: 3234938506, lat: 37.3663960, lon: 127.1077861 },
  { ref: '5', osm: 3406785264, lat: 37.3681909, lon: 127.1078861 },
  { ref: '6', osm: 5881432711, lat: 37.3671338, lon: 127.1083609 },
];
export const EXITS_SOURCE = 'OSM railway=subway_entrance (ref) · api.openstreetmap.org 2026-11-03';

// scripts/convert.mjs 와 같은 등장방형 투영 (x = 동쪽, z = 남쪽, 0.1m 반올림)
export function projectLatLon(center, lat, lon) {
  const kx = Math.cos((center.lat * Math.PI) / 180) * 111320, kz = 110540;
  const r1 = (v) => Math.round(v * 10) / 10;
  return { x: r1((lon - center.lon) * kx), z: r1(-(lat - center.lat) * kz) };
}

// 역 중심 기준 방위 (로컬 z 는 남쪽이 +)
export function compass(dx, dz) {
  const a = Math.atan2(dx, -dz); // 0 = 북, +π/2 = 동
  const i = ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4;
  return [{ id: 'n', ko: '북쪽', en: 'north' }, { id: 'e', ko: '동쪽', en: 'east' }, { id: 's', ko: '남쪽', en: 'south' }, { id: 'w', ko: '서쪽', en: 'west' }][i];
}

const HINT_KINDS = new Set(['plaza', 'landmark', 'public', 'water', 'school', 'hotel']);
// 출구 주변 안내: 같은 데이터(jeongja.json labels, OSM 이름) 중 가까운 건물·하천 이름 최대 n 개 (반경 r m)
export function nearbyHints(x, z, labels = [], { n = 2, r = 160 } = {}) {
  const seen = new Set();
  return labels
    .filter((l) => HINT_KINDS.has(l.kind) && l.text && Math.hypot(l.x - x, l.z - z) <= r)
    .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))
    .filter((l) => (seen.has(l.text) ? false : (seen.add(l.text), true)))
    .slice(0, n)
    .map((l) => l.text);
}

// 역을 지나는 큰길(정자역은 성남대로, 왕복 분리 차로) 축: 역에서 30m 안 큰길 선분들의 가장 가까운 점 평균 + 방향
//   출구를 '큰길 어느 쪽 · 역 북/남쪽' 으로 묶는다 (정자역 1·2·6 = 동쪽, 3·4·5 = 서쪽).
export function roadAxis(roads = [], st = { x: 0, z: 0 }, { name = '성남대로', r = 30 } = {}) {
  const big = roads.filter((q) => (name && q.n && q.n.includes(name)) || (q.w >= 12 && /primary|trunk/.test(q.k || '')));
  const hits = [];
  for (const q of big) for (let i = 0; i + 1 < (q.p?.length || 0); i++) {
    const [ax, az] = q.p[i], [bx, bz] = q.p[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; if (!L2) continue;
    const t = Math.max(0, Math.min(1, ((st.x - ax) * dx + (st.z - az) * dz) / L2));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(st.x - px, st.z - pz);
    if (d <= r) hits.push({ px, pz, d, dx: dx / Math.sqrt(L2), dz: dz / Math.sqrt(L2), named: !!(name && q.n && q.n.includes(name)) });
  }
  if (!hits.length) return null;
  const pool = hits.some((h) => h.named) ? hits.filter((h) => h.named) : hits;
  pool.sort((a, b) => a.d - b.d);
  let { dx, dz } = pool[0];
  if (dz > 0 || (dz === 0 && dx < 0)) { dx = -dx; dz = -dz; } // 축 방향: 북쪽(또는 동쪽)으로
  return { x: pool.reduce((a, h) => a + h.px, 0) / pool.length, z: pool.reduce((a, h) => a + h.pz, 0) / pool.length, dx, dz };
}
const SIDES = {
  w: { id: 'w', ko: '서쪽', en: 'west' }, e: { id: 'e', ko: '동쪽', en: 'east' },
  n: { id: 'n', ko: '북쪽', en: 'north' }, s: { id: 's', ko: '남쪽', en: 'south' },
};
// 출구 방향: 큰길이 있으면 길 어느 쪽 + 역 중심 기준 길 따라 북/남, 없으면 나침반
export function exitSide(x, z, st, axis, { along = 20, road = '성남대로', roadEn = 'Seongnam-daero' } = {}) {
  if (!axis) { const c = compass(x - st.x, z - st.z); return { ...c, ko: c.ko, en: c.en }; }
  const nx = -axis.dz, nz = axis.dx; // 축의 오른쪽 수직 (축이 북쪽이면 동쪽)
  const side = (x - axis.x) * nx + (z - axis.z) * nz;
  const ns = Math.abs(axis.dz) >= Math.abs(axis.dx);
  const sideId = ns ? (side >= 0 ? 'e' : 'w') : (side >= 0 ? 's' : 'n');
  const t = (x - st.x) * axis.dx + (z - st.z) * axis.dz; // 축 방향(북/동)으로 + 
  const endId = Math.abs(t) < along ? null : ns ? (t > 0 ? 'n' : 's') : (t > 0 ? 'e' : 'w');
  const S = SIDES[sideId], E = endId && SIDES[endId];
  return {
    id: sideId, end: endId,
    ko: `${road} ${S.ko}${E ? ` · 역 ${E.ko}` : ''}`,
    en: `${S.en} side of ${roadEn}${E ? `, ${E.en} end` : ''}`,
  };
}

// 월드 데이터(meta.center, labels, station, roads)로 출구 목록 만들기
export function resolveExits(data, list = JEONGJA_EXITS) {
  const center = data?.meta?.center;
  if (!center) return [];
  const st = data.station || { x: 0, z: 0 };
  const axis = roadAxis(data.roads, st);
  return list.map((e, i) => {
    const { x, z } = projectLatLon(center, e.lat, e.lon);
    const dir = exitSide(x, z, st, axis);
    const ref = e.ref == null || e.ref === '' ? null : String(e.ref);
    return { id: ref ? 'x' + ref : 'n' + i, ref, osm: e.osm, lat: e.lat, lon: e.lon, x, z, dir, hints: nearbyHints(x, z, data.labels), ...(e.face != null ? { face: e.face } : {}) };
  });
}

// 대합실 안 출구 통로: 방위별로 묶음 (동·서·북·남). 통로 하나 = 출구 여러 개
export function groupExits(exits) {
  const order = ['w', 'n', 'e', 's'];
  const g = new Map();
  for (const e of exits) { if (!g.has(e.dir.id)) g.set(e.dir.id, []); g.get(e.dir.id).push(e); }
  return order.filter((k) => g.has(k)).map((k) => ({ dir: k, exits: g.get(k).sort((a, b) => String(a.ref).localeCompare(String(b.ref))) }));
}

export function exitLabel(e, en = false) {
  const num = e.ref ? (en ? `Exit ${e.ref}` : `${e.ref}번 출구`) : (en ? 'Exit' : '출구');
  return num;
}
