// [subway] 역별 테마·출구 (순수 로직, three·DOM 없음 → scripts/test-subway.mjs)
//
//   정자역: 기존 1단계 그대로 (exits.js 의 OSM 출구 + 런타임 배치, 대합실 글자 전부 기존 문자열 = JEONGJA_THEME)
//   코리더 역(수내~잠실): stationsData.js (scripts/subway/build-stations.mjs 가 OSM 에서 생성)
//     - 출구 위치·방향은 미리 구워 둠 (place) → 타일이 아직 안 불렸어도 같은 자리
//     - 대합실은 정자역 대합실 틀을 그대로 쓰고 역 이름·노선 색·방면·노선도만 바꾼다
import { STATIONS } from './roster.js'; // [migeum-sub] 플래그 반영 목록 (stationsData.js 의 확장 역은 ?migeumsub=0 이면 빠짐)
import { LINES } from './lines.js';
import { compass, projectLatLon } from './exits.js';

export { STATIONS };
export const stationZone = (id) => `${id}-station`; // [zone] src/net/zones.js 슬롯과 같은 이름 (정자 = 'jeongja-station')
export const stationById = (id) => STATIONS.find((s) => s.id === id) || null;

// 대합실·출입구 글자 테마
//   lines     노선 [{ key, ko, short, en, color, dirs }] (앞 = 주 노선)
//   wells     대합실 두 승강장 계단 (서/동) 방면 { ko, en } — 주 노선 방면
//   transfer  두 번째 노선 (갈아타는 곳 '준비 중' 안내) 또는 null
//   map       서쪽 벽 간이 노선도 { title, stops, me, branch? }
//   ad        광고판 둘째 줄
export function stationTheme(def) {
  const lines = def.lines.map((k) => LINES[k]);
  const [prim, second = null] = lines;
  const t = {
    id: def.id, name: def.name, nameEn: def.nameEn, zone: stationZone(def.id), lines, primary: prim, transfer: second,
    wells: prim.dirs,
    map: { title: `${prim.ko} (간략)`, stops: def.route.stops, me: def.name, color: prim.color },
    ad: { title: '동네 한 바퀴', sub: `${def.name}역 · ${def.nameEn}` },
  };
  if (def.id === 'jeongja') Object.assign(t, JEONGJA_THEME_EXTRA);
  return t;
}
// 정자역 대합실은 1단계 문자열 그대로 (노선도: 손으로 고른 역 + 신분당 갈래, 광고 문구)
const JEONGJA_THEME_EXTRA = {
  map: { title: '수인분당선 · 신분당선 (간략)', stops: ['왕십리', '선릉', '수서', '야탑', '서현', '수내', '정자', '미금', '오리', '죽전', '수원', '인천'], me: '정자', color: LINES.suin.color, branch: { at: 6, color: LINES.shin.color } },
  ad: { title: '탄천 가을 산책', sub: '정자역에서 걸어서 3분' },
};
export const JEONGJA_THEME = stationTheme(stationById('jeongja'));

// 코리더 역 출구 목록 (resolveExits 와 같은 모양 + place)
//   id: '<역>-x<번호>' (정자역은 기존 'x<번호>'), dir: 역 중심 기준 나침반 (코리더 타일엔 도로 이름이 없어 '○○대로 동쪽' 대신)
export function corridorExits(def, center) {
  return def.exits.map((e, i) => {
    const { x, z } = projectLatLon(center, e.lat, e.lon);
    const c = compass(x - def.x, z - def.z);
    return {
      id: e.ref ? `${def.id}-x${e.ref}` : `${def.id}-n${i}`, ref: e.ref, osm: e.osm, lat: e.lat, lon: e.lon, x, z, place: e.place, stairs: e.stairs,
      dir: { id: c.id, ko: `역 ${c.ko}`, en: `${c.en} side of the station` }, hints: [],
    };
  });
}

// 정자역 (런타임 배치) 출구에 OSM 계단 방향만 붙이기 (stationsData 의 같은 osm 노드)
export function withStairs(exits, def) {
  const by = new Map(def.exits.map((e) => [e.osm, e]));
  return exits.map((e) => (by.get(e.osm)?.stairs ? { ...e, stairs: by.get(e.osm).stairs } : e));
}

// 바깥 출입구를 만들/지울/보일 거리 (역 중심 기준, m). 출구는 역 중심에서 250m 안
export const ENT_BUILD = 650, ENT_DROP = 950, ENT_SHOW = 480;
// 역 중심 → 가장 먼 출입구 (LOD 거리는 이만큼 빼서 잰다)
export function stationReach(def, exits) {
  let r = 0;
  for (const e of exits) { const p = e.place || e; if (Number.isFinite(p.x)) r = Math.max(r, Math.hypot(p.x - def.x, p.z - def.z)); }
  return r;
}
export function entranceLod(d, built) {
  if (!built) return d < ENT_BUILD ? 'build' : 'none';
  if (d > ENT_DROP) return 'drop';
  return d < ENT_SHOW ? 'show' : 'hide';
}
