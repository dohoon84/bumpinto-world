// 업데이트 시마다 공지사항을 정리해서 올리는 파일입니다.
// 새 공지사항을 배열 맨 위(또는 아래)에 고유한 key와 함께 추가하면
// 실서버(Durable Object DB)와 로컬 테스트 게시판에 자동으로 반영됩니다.

export const NOTICE_POSTS = [
  {
    key: 'notice-2026-10-28-launch',
    title: '🎉 Bumpinto World 오픈월드 안내 및 이용 가이드',
    enTitle: '🎉 Welcome to Bumpinto World — Quick Start & Controls Guide',
    authorName: '크레이지랩스',
    enAuthorName: 'CrazyLabs',
    createdAt: Date.now() - 86400000,
    body: [
      '안녕하세요! 현실 지도(OpenStreetMap) 기반 3D 오픈월드 Bumpinto World에 오신 것을 환영합니다.',
      '',
      '■ 주요 조작 및 기능 안내',
      '• 이동 및 시점: WASD / 방향키로 이동, Shift 달리기, Space 점프, C 앉기, Z 자리비움, 마우스 드래그 회전 및 휠 줌, M 키로 위에서 보기',
      '• 바이크 타기: 길가에 세워진 노란 바이크 근처에서 E 키를 눌러 거리를 달릴 수 있습니다.',
      '• 글로벌 오픈 지역: 성남시 분당구 정자역(한국)과 텍사스 보카치카 Starbase(미국)가 오픈되어 있으며 지구본에서 자유롭게 이동할 수 있습니다.',
      '• 스마트폰(우측 하단): 전용 번호를 발급받아 다른 접속자와 문자·연락처를 주고받고, 재입장 PIN을 설정해 다른 기기에서도 이어할 수 있습니다.',
    ].join('\n'),
    enBody: [
      'Welcome to Bumpinto World — a browser-based 3D open world built on real OpenStreetMap geometry!',
      '',
      '■ Controls & Core Features',
      '• Move & Camera: WASD / Arrow keys to move, Shift to run, Space to jump, C to sit, Z for AFK, drag mouse to rotate, scroll wheel to zoom, M for top-down overview.',
      '• Ride Bikes: Press E near any yellow sidewalk bike to ride around the neighborhood.',
      '• Live Districts: Explore both Jeongja Station (Bundang, Korea) and Starbase, TX (Boca Chica, USA) — including Mega Bay, Starfactory, Orbital Launch Pad, and the Roadster Jump Show (press R in Starbase!).',
      '• Virtual Smartphone (Bottom-right): Send SMS messages, save contacts, and set a 4–6 digit Recovery PIN to resume with your avatar across devices.',
    ].join('\n'),
  },
  {
    key: 'notice-2026-10-28-chat-and-board',
    title: '📢 [업데이트] 스타베이스(TX) 오픈, 한/영 전환, 로드스터 쇼, 리액션(1~6) 및 게시판 안내',
    enTitle: '📢 [Update] Starbase, TX Live, KO/EN UI Toggle, Roadster Jump Show, Emotes (1~6) & Community Board',
    authorName: '크레이지랩스',
    enAuthorName: 'CrazyLabs',
    createdAt: Date.now(),
    body: [
      '입주민 여러분의 소중한 피드백을 반영하여 신규 해외 지역과 편의 기능이 대폭 업데이트되었습니다!',
      '',
      '1. 🚀 신규 오픈 지역: 미국 텍사스 스타베이스 (Starbase, TX)',
      '• 지구본에서 텍사스 보카치카(Starbase, TX) 핀을 눌러 바로 입장할 수 있습니다.',
      '• 생산기지(Starfactory · Mega Bay · Gigabay), 발사장(Integration Tower 1 & 2 · Pad 2 · Starhopper), 스타베이스 마을과 영문 NPC들이 배치되어 있습니다.',
      '• 우측 상단 [🚀 Roadster Show (R)] 버튼을 누르면 발사탑 남쪽 350m 빈터에서 로드스터 점프 쇼를 관람할 수 있습니다.',
      '',
      '2. 🌐 글로벌 한/영 UI 실시간 전환 (KO / EN)',
      '• 지구본·로비·인게임 우측 상단의 [🌐 EN / KO] 버튼으로 언제든 조작 화면과 게시판 언어를 전환할 수 있습니다.',
      '',
      '3. 💬 주변 대화 전체보기 & 🎉 호들갑 리액션 퀵바(1~6)',
      '• 하단 채팅 입력창 옆 [💬 전체보기]로 근처(30m) 대화와 NPC 대사를 모아 볼 수 있습니다.',
      '• 숫자키 1~6(🙌만세 · 🤪호들갑 · 💃댄스 · 👏박수 · ❤️하트 · 🤣폭소)과 C(앉기), Z(자리비움), Space(점프)를 지원합니다.',
      '',
      '앞으로도 추가되었으면 하는 동네나 아이디어가 있다면 언제든 [피드백] 카테고리에 남겨 주세요!',
    ].join('\n'),
    enBody: [
      'We have expanded Bumpinto World with our first US neighborhood and major community features!',
      '',
      '1. 🚀 New Open District: Starbase, TX (Boca Chica, USA)',
      '• Click the Starbase, TX pin on the 3D globe to enter directly.',
      '• Explore the Build Site (Starfactory, Mega Bay 1 & 2, Gigabay, Raptor Nest), the Orbital Launch Site (Integration Towers 1 & 2, Pad 2, Starhopper), and Starbase Village with 350+ English-speaking worker and resident NPCs.',
      '• Click [🚀 Roadster Show (R)] or press R to teleport 350m south of Integration Tower 1 and watch the 46-second Rocket Roadster Jump Show!',
      '',
      '2. 🌐 Instant KO / EN Language Switch',
      '• Toggle between English and Korean UI anytime from the top-right [🌐 EN / KO] button on the globe, lobby, or in-game bar.',
      '',
      '3. 💬 Nearby Chat Log & 🎉 3D Emote Bar (Keys 1~6)',
      '• Open [💬 Chat Log] next to the chat bar to read nearby (30m) player and NPC conversations.',
      '• Press keys 1–6 (Cheer, Hype, Dance, Clap, Love, LOL), C to sit, Z for AFK, and Space to jump.',
      '',
      'Have ideas or want to pioneer your own neighborhood? Check out [🌍 Contribute] or leave a post in [Feedback]!',
    ].join('\n'),
  },
];

export const NOTICE_BY_KEY = Object.fromEntries(NOTICE_POSTS.map((n) => [n.key, n]));
export const NOTICE_BY_KO_TITLE = Object.fromEntries(NOTICE_POSTS.map((n) => [n.title, n]));
