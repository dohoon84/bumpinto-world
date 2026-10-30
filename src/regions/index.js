// Bumpinto World 지역(동네) 레지스트리
// 새 도시·동네를 추가할 때는 src/regions/<id>.js 를 만들고 OPEN_REGIONS 에 등록하면
// 지구본, 로비, 월드 로더, 날씨/시간대, NPC, 미니맵에 자동 반영됩니다.
import { JEONGJA_REGION } from './jeongja.js';
import { STARBASE_REGION } from './starbase.js';

export const DEFAULT_REGION_ID = 'jeongja';

export const OPEN_REGIONS = [
  JEONGJA_REGION,
  STARBASE_REGION,
];

export const REGION_BY_ID = Object.fromEntries(OPEN_REGIONS.map((r) => [r.id, r]));

export const UPCOMING_REGIONS = [
  { id: 'sunae', name: '수내역', enName: 'Sunae Stn.', desc: '중앙공원 · 롯데백화점', enDesc: 'Central Park · Lotte Dept.', lat: 37.3785, lon: 127.1144 },
  { id: 'seohyeon', name: '서현역', enName: 'Seohyeon Stn.', desc: 'AK플라자 · 로데오거리', enDesc: 'AK Plaza · Rodeo St.', lat: 37.3851, lon: 127.1236 },
  { id: 'imae', name: '이매역', enName: 'Imae Stn.', desc: '성남아트센터 · 탄천', enDesc: 'Seongnam Arts Center', lat: 37.3958, lon: 127.1281 },
  { id: 'yatap', name: '야탑역', enName: 'Yatap Stn.', desc: '성남종합버스터미널 · 먹자골목', enDesc: 'Bus Terminal · Food Alley', lat: 37.4114, lon: 127.1287 },
  { id: 'pangyo', name: '판교역', enName: 'Pangyo Stn.', desc: '테크노밸리 · 화랑공원', enDesc: 'Pangyo Techno Valley', lat: 37.3947, lon: 127.1112 },
  { id: 'gangnam', name: '강남역', enName: 'Gangnam Stn.', desc: '강남대로 · 테헤란로', enDesc: 'Gangnam-daero · Teheran-ro', lat: 37.4979, lon: 127.0276 },
  { id: 'seongsu', name: '성수동', enName: 'Seongsu-dong', desc: '연무장길 · 서울숲', enDesc: 'Seoul Forest · Cafe St.', lat: 37.5445, lon: 127.0560 },
  { id: 'hongdae', name: '홍대입구', enName: 'Hongdae', desc: '경의선숲길 · 걷고싶은거리', enDesc: 'Hongik Univ. Street', lat: 37.5572, lon: 126.9245 },
];

// 지역의 나라 (country 필드가 없으면 좌표로 판단) — 지구본 국가 섹션과 입장 화면(비행기/일반 로딩) 판단에 같이 쓴다
export function countryOf(r) {
  if (r?.country) return r.country;
  if (r?.lat > 33 && r.lat < 39 && r.lon > 124 && r.lon < 132) return 'KR';
  if (r?.lat > 18 && r.lat < 72 && r.lon > -170 && r.lon < -60) return 'US';
  return 'ETC';
}
// 나라가 바뀌는 이동만 비행기(보딩패스) 화면, 같은 나라 안 이동은 일반 입장 로딩 화면
export function isFlightBetween(from, to) {
  return !!from && !!to && from.id !== to.id && countryOf(from) !== countryOf(to);
}

export function getRegionIdFromUrl() {
  if (typeof location === 'undefined') return DEFAULT_REGION_ID;
  const params = new URLSearchParams(location.search);
  const raw = (params.get('region') || DEFAULT_REGION_ID).trim().toLowerCase();
  return REGION_BY_ID[raw] ? raw : DEFAULT_REGION_ID;
}

export function getCurrentRegion() {
  return REGION_BY_ID[getRegionIdFromUrl()] || JEONGJA_REGION;
}

export function getRegion(id) {
  return REGION_BY_ID[String(id || '').trim().toLowerCase()] || JEONGJA_REGION;
}

// 지구본에서 현재 로드된 동네와 다른 동네로 입장할 때 URL ?region=<id> 로 이동
export function navigateToRegion(targetRegionId, extraParams = {}) {
  const target = getRegion(targetRegionId);
  const url = new URL(location.href);
  if (target.id === DEFAULT_REGION_ID) {
    url.searchParams.delete('region');
  } else {
    url.searchParams.set('region', target.id);
  }
  for (const [k, v] of Object.entries(extraParams)) {
    if (v == null) url.searchParams.delete(k);
    else url.searchParams.set(k, String(v));
  }
  location.href = url.toString();
}
