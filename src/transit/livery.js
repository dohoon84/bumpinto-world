// 경기도 버스 노선 유형 -> 도색/차체 매핑 (브라우저와 변환 스크립트에서 함께 사용)
// 출처
//  - 경인일보 2008 "버스 디자인 연내 통일": 일반 초록, 직행좌석 빨강, 일반좌석 파랑, 마을 노랑, 공항 검정
//    https://www.kyeongin.com/article/373861
//  - 연합뉴스 2014 "M·G·광역급행·직행좌석…헷갈리는 버스 체계": 직행좌석형 빨강, 좌석형 파랑, 일반형 초록 / G=경기 브랜드
//    https://www.yna.co.kr/view/AKR20140717143200060
//  - 나무위키 "경기도 시내버스/도색": 색상 코드(빨강 #EE2737, 파랑 #0085CA, 초록 #009775, 노랑 #F2A900, 금색 #85714D),
//    2024~ 공공관리제: 시군 간 노선 파랑, 단일 시군 내 노선 초록
//    https://namu.wiki/w/경기도%20시내버스/도색
//  - 데일리안 2022 (국토부 대광위 '일반 광역버스 디자인'): 광역버스의 빨간색 + M버스 물결무늬
//    https://www.dailian.co.kr/news/view/1161360/
export const LIVERY = {
  M:        { label: '광역급행(M버스)', color: '#EE2737', accent: '#1d4f9c', wave: true, body: 'coach' },
  express:  { label: '직행좌석',       color: '#EE2737', accent: '#ffffff', body: 'coach' },
  premium:  { label: '프리미엄',       color: '#85714D', accent: '#ffffff', body: 'coach' },
  seat:     { label: '좌석/시군간 일반', color: '#0085CA', accent: '#ffffff', body: 'city' },
  city:     { label: '일반(시내)',      color: '#009775', accent: '#ffffff', body: 'city' },
  village:  { label: '마을',           color: '#F2A900', accent: '#ffffff', body: 'mini' },
  airport:  { label: '공항',           color: '#222222', accent: '#ffffff', body: 'coach' },
  intercity:{ label: '고속/시외',       color: '#f2f2f2', accent: '#2c3e6b', body: 'coach', plain: true },
};

// 실시간 API(routeTypeCd)가 있으면 이것이 가장 정확함 (gbis.go.kr 매뉴얼의 코드표)
export const ROUTE_TYPE_CD = {
  11: 'express', 12: 'seat', 13: 'city', 14: 'M', 15: 'city', 16: 'express', 17: 'express',
  21: 'express', 22: 'seat', 23: 'city', 30: 'village', 41: 'intercity', 42: 'intercity', 43: 'intercity',
  51: 'airport', 52: 'airport', 53: 'airport',
};

// OSM 태그/번호 패턴으로 추정 (API 없이). 반환: { type, why }
export function classifyRoute({ ref = '', name = '', network = '' } = {}) {
  const s = `${network} ${name}`;
  if (/고속버스|시외/.test(s) || (!ref && /[~→]/.test(name))) return { type: 'intercity', why: 'network/name: 고속·시외' };
  if (/^M\d/.test(ref) || /광역급행/.test(s)) return { type: 'M', why: 'M 접두 = 광역급행버스' };
  if (/마을/.test(s)) return { type: 'village', why: 'network/name: 마을버스' };
  if (/직행좌석/.test(s)) return { type: 'express', why: 'network/name: 직행좌석' };
  if (/^G\d{4}/.test(ref)) return { type: 'express', why: 'G+4자리 = 경기 직행좌석(출퇴근 G버스)' };
  if (/^\d{4}(-\d+)?[A-Z]?$/.test(ref)) return { type: 'express', why: '4자리 번호 = 경기 직행좌석/광역 체계' };
  if (/^\d{1,2}(-\d+)?[A-Z]?$/.test(ref)) return { type: 'village', why: '1~2자리 번호 = 성남/용인 마을버스 번호대(추정)' };
  if (/^\d{3}(-\d+)?[A-Z]?$/.test(ref)) return { type: 'city', why: '3자리 번호 = 일반형 시내버스(추정, 시군간이면 실제는 파랑)' };
  return { type: 'city', why: '기본값' };
}
export const liveryOf = (type) => LIVERY[type] || LIVERY.city;
