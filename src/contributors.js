// Bumpinto World 기여자(명예의 전당) 및 오픈 예정 지역 안내 데이터
// 새 지역·건물·NPC PR이 머지되면 아래 목록에 이름과 링크가 영구 등재됩니다.

export const REPO_URL = 'https://github.com/dohoon84/bumpinto-world';

export const CONTRIBUTORS = [
  {
    name: '김도훈 (CrazyLabs)',
    enName: 'Dohoon Kim (CrazyLabs)',
    handle: '@dohoon84',
    url: 'https://crazylabs.co.kr',
    role: 'Creator & Core Architect',
    badge: '🌍 창시자 · 정자동 & 스타베이스 개척자',
    enBadge: '🌍 Creator · Jeongja & Starbase Pioneer',
    contribution: '정자역 & Starbase 3D 월드 엔진, 실시간 버스/택시/지형, 로드스터 쇼, 멀티플레이 & 휴대폰·게시판 시스템 구축',
    enContribution: 'Built the 3D open-world engine (Jeongja & Starbase, TX), live transit/taxi/terrain, Roadster Jump Show, multiplayer & virtual phone/board.',
  },
];

export const CONTRIBUTION_AREAS = [
  {
    title: '🗺️ 새 지역(동네) 개척하기',
    enTitle: '🗺️ Pioneer a New Neighborhood',
    desc: '판교역, 강남역, 성수동뿐만 아니라 전 세계 어떤 도시·동네든 OSM 데이터를 변환해 새 지역을 열 수 있습니다.',
    enDesc: 'Convert OpenStreetMap data for your city or neighborhood anywhere in the world and open a new live region on the 3D globe.',
    reward: '지구본 & 로딩 화면에 [지역 개척자(Pioneer)] 타이틀 영구 등재',
    enReward: 'Permanently credited as [Region Pioneer] on the 3D globe & Hall of Fame',
  },
  {
    title: '🏢 동네 랜드마크 3D 건물 짓기',
    enTitle: '🏢 Model 3D Landmark Buildings',
    desc: '네이버 1784, 메가베이, 스타벅스, 우리 회사 사옥 등 특징적인 건물을 로우폴리 Three.js 모듈로 추가해 주세요.',
    enDesc: 'Create low-poly procedural Three.js landmarks—iconic towers, rocket bays, cafes, or your own company HQ.',
    reward: '해당 3D 건물 앞 명패 및 오버레이에 제작자 닉네임·링크 각인',
    enReward: 'Your name & link engraved on the 3D building plaque and Hall of Fame',
  },
  {
    title: '🗣️ 시민 NPC & 동네 대사 추가',
    enTitle: '🗣️ Add Street NPCs & Local Dialogue',
    desc: 'src/entities/npcs.js 또는 지역별 NPC 파일에 나만의 아바타 외형과 재치 있는 동네 대사를 가진 NPC를 등록해 보세요.',
    enDesc: 'Add your own custom avatar and witty local dialogue lines so your NPC walks the streets 24/7.',
    reward: '내가 만든 NPC가 공식 월드 거리를 24시간 산책하며 접속자들에게 말을 건넴',
    enReward: 'Your custom NPC lives and walks inside the official world 24/7',
  },
  {
    title: '🍜 주변 맛집 & 동네 꿀팁 제보',
    enTitle: '🍜 Share Local Spots & Feedback',
    desc: '코드 수정 없이도 게임 내 게시판의 [주변맛집] / [피드백] 카테고리에 글을 남겨 기여할 수 있습니다.',
    enDesc: 'No coding required—post your favorite local spots or feature ideas in the [Local Spots] or [Feedback] board categories.',
    reward: '검증된 맛집·장소는 월드 내 공식 지명 라벨로 승격',
    enReward: 'Verified spots get promoted to official 3D map labels inside the world',
  },
];
