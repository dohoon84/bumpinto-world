// Bumpinto World 기여자(명예의 전당) 및 오픈 예정 지역 안내 데이터
// 새 지역·건물·NPC PR이 머지되면 아래 목록에 이름과 링크가 영구 등재됩니다.

export const REPO_URL = 'https://github.com/dohoon84/bumpinto-world';

export const CONTRIBUTORS = [
  {
    name: '김도훈 (CrazyLabs)',
    handle: '@dohoon84',
    url: 'https://crazylabs.co.kr',
    role: 'Creator & Core Architect',
    badge: '🌍 창시자 · 정자동 개척자',
    contribution: '정자역 3D 월드 엔진, 실시간 경기버스/택시/탄천 지형, 멀티플레이 & 휴대폰·게시판 시스템 구축',
  },
];

export const CONTRIBUTION_AREAS = [
  {
    title: '🗺️ 새 지역(동네) 개척하기',
    desc: '판교역, 강남역, 성수동, 홍대입구 등 원하는 동네의 OSM 데이터를 변환해 새 지역을 열 수 있습니다.',
    reward: '지구본 & 로딩 화면에 [지역 개척자(Pioneer)] 타이틀 영구 등재',
  },
  {
    title: '🏢 동네 랜드마크 3D 건물 짓기',
    desc: '네이버 1784, 스타벅스, 백화점, 우리 회사 사옥 등 특징적인 건물을 로우폴리 Three.js 모듈로 추가해 주세요.',
    reward: '해당 3D 건물 앞 명패 및 오버레이에 제작자 닉네임·링크 각인',
  },
  {
    title: '🗣️ 시민 NPC & 동네 대사 추가',
    desc: 'src/entities/npcs.js 에 나만의 아바타 외형과 재치 있는 동네 대사를 가진 NPC를 등록해 보세요.',
    reward: '내가 만든 NPC가 공식 월드 거리를 24시간 산책하며 접속자들에게 말을 건넴',
  },
  {
    title: '🍜 주변 맛집 & 동네 꿀팁 제보',
    desc: '코드 수정 없이도 게임 내 게시판의 [주변맛집] / [피드백] 카테고리에 글을 남겨 기여할 수 있습니다.',
    reward: '검증된 맛집·장소는 월드 내 공식 지명 라벨로 승격',
  },
];
