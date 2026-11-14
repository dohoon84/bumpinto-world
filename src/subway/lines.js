// [subway] 노선 정의 (순수 데이터, three·DOM 없음)
//   color      게임 안 표시 색 = 코리더 역 마커(src/corridor/index.js LINE_COLOR) · 정자 대합실(geom.js LINE) 과 같은 팔레트
//   osmColour  OSM route relation 의 colour 태그 (참고·검증용; scripts/subway/build-stations.mjs 가 대조)
//   dirs       [0] = 서쪽/아래 승강장 방면, [1] = 반대 방면. OSM relation 이름(from → to)의 종착역에서 가져옴
//   short      대합실 뱃지 글자, en 영문 표기, ja 일본어 (안내 방송 — 역·방면은 한국어 발음 가타카나, src/subway/ja.js)
//   (노선 로고·심볼은 쓰지 않음 — 색과 글자만)
export const LINES = Object.freeze({
  suin: { key: 'suin', ko: '수인분당선', short: '수인분당', en: 'Suin-Bundang Line', ja: 'スインブンダン線', color: '#F5A200', osmColour: '#ECA300', osmRef: '수인·분당',
    dirs: [{ ko: '수원·인천 방면', en: 'for Suwon · Incheon', ja: 'スウォン・インチョン方面' }, { ko: '왕십리 방면', en: 'for Wangsimni', ja: 'ワンシムニ方面' }] },
  shin: { key: 'shin', ko: '신분당선', short: '신분당', en: 'Shinbundang Line', ja: 'シンブンダン線', color: '#D4003B', osmColour: '#B81B30', osmRef: '신분당',
    dirs: [{ ko: '광교 방면', en: 'for Gwanggyo', ja: 'クァンギョ方面' }, { ko: '신사 방면', en: 'for Sinsa', ja: 'シンサ方面' }] },
  gg: { key: 'gg', ko: '경강선', short: '경강', en: 'Gyeonggang Line', ja: 'キョンガン線', color: '#0054A6', osmColour: '#0B318F', osmRef: '경강',
    dirs: [{ ko: '판교 방면', en: 'for Pangyo', ja: 'パンギョ方面' }, { ko: '여주 방면', en: 'for Yeoju', ja: 'ヨジュ方面' }] },
  l2: { key: 'l2', ko: '2호선', short: '2호선', en: 'Line 2', ja: '2号線', color: '#00A84D', osmColour: '#00A23F', osmRef: '2',
    dirs: [{ ko: '내선순환', en: 'Inner Circle', ja: '内回り' }, { ko: '외선순환', en: 'Outer Circle', ja: '外回り' }] },
  l3: { key: 'l3', ko: '3호선', short: '3호선', en: 'Line 3', ja: '3号線', color: '#EF7C1C', osmColour: '#ED6C00', osmRef: '3',
    dirs: [{ ko: '오금 방면', en: 'for Ogeum', ja: 'オグム方面' }, { ko: '대화 방면', en: 'for Daehwa', ja: 'テファ方面' }] },
  l8: { key: 'l8', ko: '8호선', short: '8호선', en: 'Line 8', ja: '8号線', color: '#E6186C', osmColour: '#D11D70', osmRef: '8',
    dirs: [{ ko: '모란 방면', en: 'for Moran', ja: 'モラン方面' }, { ko: '별내 방면', en: 'for Byeollae', ja: 'ピョルレ方面' }] },
  l9: { key: 'l9', ko: '9호선', short: '9호선', en: 'Line 9', ja: '9号線', color: '#BDB092', osmColour: '#A49D87', osmRef: '9',
    dirs: [{ ko: '중앙보훈병원 방면', en: 'for VHS Medical Center', ja: 'チュンアンボフンビョンウォン方面' }, { ko: '개화 방면', en: 'for Gaehwa', ja: 'ケファ方面' }] },
});
// [myeongdong] 4호선(명동역). 지금은 표시용(노선도 칩·미니맵·역 표지 색)만 — 승강장·열차·실시간 도착(SUBWAY_ID 1004)은 다음 단계에서
//   LINES 에 넣는다(LINE_STOPS·TRAIN·워커 SUBWAY_ID 를 같이 채워야 subway 검사가 통과한다).
export const LINE4 = Object.freeze({ key: 'l4', ko: '4호선', short: '4호선', en: 'Line 4', ja: '4号線', color: '#00A5DE', osmRef: '4', cars: 10, subwayId: 1004,
  dirs: [{ ko: '오이도 방면', en: 'for Oido', ja: 'オイド方面' }, { ko: '진접 방면', en: 'for Jinjeop', ja: 'チンジョプ方面' }] });
// 한 역에 여러 노선이면 이 순서로 (앞 = 주 노선: 대합실 승강장 안내·노선도). 정자 = 수인분당, 신분당 (기존 그대로)

// [subway] 승강장·열차 (2단계). 편성 량수 = 실제 운행 편성 (출처: 보고서·DESIGN.md)
//   cars   량수: 수인분당 6 (코레일 351000호대 6량 1편성) · 신분당 6 (D000호대) · 경강 4 (371000호대 4량) · 2호선 10 (본선)
//          3호선 10 · 8호선 6 (8000호대 6량, 별내선 연장 후도 6량) · 9호선 6 (6량 편성, 8량 계획 없음)
//   doors  한 량 한쪽 출입문 수 (모두 4) — 스크린도어 번호 1-1 … N-4 (앞 칸·앞 문부터)
//   seq    dirs[i] 방면이 LINE_STOPS[line].stops (relation from → to) 에서 증가(+1)·감소(-1) 쪽인지
//   updn   dirs[i] 방면의 실시간 도착 updnLine 값 (상행/하행, 2호선 내선/외선). 이매 실측: 수인분당 상행 = 왕십리, 경강 하행 = 여주
export const TRAIN = Object.freeze({
  suin: { cars: 6, doors: 4, seq: [-1, 1], updn: ['하행', '상행'] },
  shin: { cars: 6, doors: 4, seq: [1, -1], updn: ['하행', '상행'] },
  gg: { cars: 4, doors: 4, seq: [-1, 1], updn: ['상행', '하행'] },
  l2: { cars: 10, doors: 4, seq: [1, -1], updn: ['내선', '외선'] },
  l3: { cars: 10, doors: 4, seq: [-1, 1], updn: ['하행', '상행'] },
  l8: { cars: 6, doors: 4, seq: [-1, 1], updn: ['하행', '상행'] },
  l9: { cars: 6, doors: 4, seq: [1, -1], updn: ['하행', '상행'] },
});
export const CAR_LEN = 20;      // 한 량 길이 (m, 연결부 포함 근사 — 한국 표준 전동차 차체 ≈19.5m)
export const DOOR_OFF = [7.05, 2.35, -2.35, -7.05]; // 한 량 안 출입문 중심 (앞 = +, m). 표준 4문 차량 문 간격 ≈4.7m 근사
export const LINE_ORDER = ['suin', 'l8', 'l2', 'l3', 'l9', 'gg', 'shin'];
export const OSM_REF_TO_LINE = Object.freeze(Object.fromEntries(Object.values(LINES).map((l) => [l.osmRef, l.key])));
// 서울 열린데이터 실시간 도착 subwayId → 노선 (서울시 지하철 실시간 도착정보 명세)
export const SUBWAY_ID = Object.freeze({ 1002: 'l2', 1003: 'l3', 1008: 'l8', 1009: 'l9', 1075: 'suin', 1077: 'shin', 1081: 'gg' });
