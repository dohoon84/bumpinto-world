// 성남시 분당구 정자동 (정자역) 지역 설정
export const JEONGJA_REGION = {
  id: 'jeongja',
  name: '정자동 (정자역)',
  enName: 'Jeongja Station (Bundang)',
  shortName: '정자동',
  enShortName: 'Jeongja-dong',
  sub: '성남시 분당구',
  enSub: 'Bundang, Seongnam, Korea',
  country: 'KR',
  flag: '🇰🇷',
  airportCode: 'ICN',
  airportName: '성남 정자동',
  enAirportName: 'Jeongja, KR',
  flightLines: [
    '🛫 브라운즈빌(BRO) 이륙 · 인천국제공항(ICN)행 여객기 탑승 중…',
    '✈️ 태평양 상공 38,000ft 순항 중 · 기내 창밖으로 구름이 지나갑니다…',
    '🏙️ 인천공항 착륙 완료 · 분당행 공항리무진 버스로 환승 중…',
    '🚇 성남 정자역 도착 · 광장으로 걸어 나가는 중…',
  ],
  enFlightLines: [
    '🛫 Departing Starbase (BRO) · Boarding flight to Incheon (ICN)…',
    '✈️ Cruising at 38,000 ft across the Pacific Ocean…',
    '🏙️ Landed at Incheon (ICN) · Transferring to Bundang airport limousine bus…',
    '🚇 Arrived at Jeongja Station · Walking out to the plaza…',
  ],
  lang: 'ko',
  status: 'open',
  lat: 37.3665,
  lon: 127.10835,
  timeZone: 'Asia/Seoul',
  globePinText: '정자동 · 열림',
  enGlobePinText: '🇰🇷 Jeongja-dong · OPEN',
  globePinStyle: 'kr',
  telemetryLabel: '🛰️ 위성 실시간 관측 · 정자동 (37.37°N)',
  enTelemetryLabel: '🛰️ LIVE TELEMETRY · JEONGJA-DONG, KR (37.37°N)',
  lobbyTitle: '정자역에 입장',
  enLobbyTitle: 'Enter Jeongja Station, KR',
  lobbyEnterLines: [
    '정자역 광장으로 걸어 들어가는 중',
    '정류장에 버스를 세우는 중',
    '카카오바이크를 길가에 두는 중',
    '밤 거리의 불을 켜는 중',
    '지인을 만날 자리를 찾는 중',
  ],
  enLobbyEnterLines: [
    'Walking into Jeongja Station Plaza…',
    'Pulling buses up to the stops…',
    'Parking Kakao T bikes along the sidewalk…',
    'Lighting up the evening streets…',
    'Connecting to Jeongja multiplayer relay…',
  ],
  stationOverlayText: '🚇 정자역  신분당선 · 수인분당선',
  defaultSpotName: '정자역 광장',
  enDefaultSpotName: 'Jeongja Station Plaza',
  homeBtnLabel: '🚇 역으로',
  enHomeBtnLabel: '🚇 Station',
  dataFiles: {
    world: 'jeongja.json',
    transit: 'transit.json',
    terrain: 'terrain.json',
    drive: 'drive.json',
  },
  signBoard: {
    topLeftColor: '#d4003b',
    topRightColor: '#f5a200',
    title: '정자',
    sub: 'Jeongja · D15 · K230',
  },
  features: {
    jeongjaBuildings: true, // 정자역 스타벅스, 노비오스 호텔, 우체국 마크, 카페 보도
    stationPlaza: true,     // 정자역 광장 분수대·빈백·전광판
    dogPark: true,          // 탄천 반려견 놀이터 & 돌다리
    transit: true,          // 경기도 실시간/시뮬 버스 & 신호 횡단보도
    taxis: true,            // 카카오T 스타일 택시 & 경찰차
    umbrellas: true,        // 우산 상인
    roadsterShow: false,
  },
  quickSpots: [],
};
