// [subway] 노선 정의 (순수 데이터, three·DOM 없음)
//   color      게임 안 표시 색 = 코리더 역 마커(src/corridor/index.js LINE_COLOR) · 정자 대합실(geom.js LINE) 과 같은 팔레트
//   osmColour  OSM route relation 의 colour 태그 (참고·검증용; scripts/subway/build-stations.mjs 가 대조)
//   dirs       [0] = 서쪽/아래 승강장 방면, [1] = 반대 방면. OSM relation 이름(from → to)의 종착역에서 가져옴
//   short      대합실 뱃지 글자, en 영문 표기
//   (노선 로고·심볼은 쓰지 않음 — 색과 글자만)
export const LINES = Object.freeze({
  suin: { key: 'suin', ko: '수인분당선', short: '수인분당', en: 'Suin-Bundang Line', color: '#F5A200', osmColour: '#ECA300', osmRef: '수인·분당',
    dirs: [{ ko: '수원·인천 방면', en: 'for Suwon · Incheon' }, { ko: '왕십리 방면', en: 'for Wangsimni' }] },
  shin: { key: 'shin', ko: '신분당선', short: '신분당', en: 'Shinbundang Line', color: '#D4003B', osmColour: '#B81B30', osmRef: '신분당',
    dirs: [{ ko: '광교 방면', en: 'for Gwanggyo' }, { ko: '신사 방면', en: 'for Sinsa' }] },
  gg: { key: 'gg', ko: '경강선', short: '경강', en: 'Gyeonggang Line', color: '#0054A6', osmColour: '#0B318F', osmRef: '경강',
    dirs: [{ ko: '판교 방면', en: 'for Pangyo' }, { ko: '여주 방면', en: 'for Yeoju' }] },
  l2: { key: 'l2', ko: '2호선', short: '2호선', en: 'Line 2', color: '#00A84D', osmColour: '#00A23F', osmRef: '2',
    dirs: [{ ko: '내선순환', en: 'Inner Circle' }, { ko: '외선순환', en: 'Outer Circle' }] },
  l3: { key: 'l3', ko: '3호선', short: '3호선', en: 'Line 3', color: '#EF7C1C', osmColour: '#ED6C00', osmRef: '3',
    dirs: [{ ko: '오금 방면', en: 'for Ogeum' }, { ko: '대화 방면', en: 'for Daehwa' }] },
  l8: { key: 'l8', ko: '8호선', short: '8호선', en: 'Line 8', color: '#E6186C', osmColour: '#D11D70', osmRef: '8',
    dirs: [{ ko: '모란 방면', en: 'for Moran' }, { ko: '별내 방면', en: 'for Byeollae' }] },
  l9: { key: 'l9', ko: '9호선', short: '9호선', en: 'Line 9', color: '#BDB092', osmColour: '#A49D87', osmRef: '9',
    dirs: [{ ko: '중앙보훈병원 방면', en: 'for VHS Medical Center' }, { ko: '개화 방면', en: 'for Gaehwa' }] },
});
// 한 역에 여러 노선이면 이 순서로 (앞 = 주 노선: 대합실 승강장 안내·노선도). 정자 = 수인분당, 신분당 (기존 그대로)
export const LINE_ORDER = ['suin', 'l8', 'l2', 'l3', 'l9', 'gg', 'shin'];
export const OSM_REF_TO_LINE = Object.freeze(Object.fromEntries(Object.values(LINES).map((l) => [l.osmRef, l.key])));
// 서울 열린데이터 실시간 도착 subwayId → 노선 (서울시 지하철 실시간 도착정보 명세)
export const SUBWAY_ID = Object.freeze({ 1002: 'l2', 1003: 'l3', 1008: 'l8', 1009: 'l9', 1075: 'suin', 1077: 'shin', 1081: 'gg' });
