# 🌍 Contributing to Bumpinto World (함께 만들기 가이드)

> **[English](#english-guide) · [한국어](#한국어-가이드)**

---

<a id="english-guide"></a>

## 🇺🇸 English Guide — Build the Open 3D World Together

**Bumpinto World ([https://bumpinto.world](https://bumpinto.world))** is an open-source, browser-based 3D metaverse built directly from real-world **OpenStreetMap (OSM)** data, procedural low-poly Three.js geometry, and real-time transit feeds.

Because one person cannot build every neighborhood in the world alone, we are opening the entire codebase so developers, 3D enthusiasts, and locals everywhere can add their own cities, landmarks, and NPCs.

### 🏆 Contributor Rewards (Win-Win Hall of Fame)

When your Pull Request is merged, your work is not just buried in git history—you get **permanent, visible credit inside the live world (`https://bumpinto.world`)**:

1. **👑 In-Game Hall of Fame (`src/contributors.js`)**
   - Your name/handle, custom badge, and personal link (GitHub, portfolio, blog, or company) are permanently featured in the in-game **`🌍 함께 만들기 (Contribute & Hall of Fame)`** modal.
2. **🏢 3D Building Plaque & Architect Credit**
   - Model a custom low-poly landmark (like `src/world/nobiosHotel.js` or `src/world/starbucksGlass.js`) and we will engrave `🏗️ Built by @your-handle` on the building's 3D sign or overlay label.
3. **📍 Region Pioneer Title**
   - Be the first to convert and open a new neighborhood/station (in Korea or any city worldwide!) and earn the **Official Region Pioneer** badge on the 3D globe and loading screen.
4. **🗣️ Your Own Citizen NPC Walking the Streets 24/7**
   - Add a custom avatar and dialogue lines to `src/entities/npcs.js` so your character walks around the live world and greets players.

---

### 🛠️ 4 Ways to Contribute

#### 1. Add a Citizen NPC & Dialogue (Difficulty: ★☆☆ — 5 mins)
Add your own character look and 3–4 lines of dialogue to `NPC_DEFS` in `src/entities/npcs.js`:

```js
// Example entry in src/entities/npcs.js -> NPC_DEFS
{
  name: 'Alex the Traveler',
  look: { gender: 'm', face: 'round', hair: 'short', glasses: true, top: 'hoodie', color: '#4f7cff' },
  lines: [
    'Wait, this whole 3D neighborhood is generated from OpenStreetMap?!',
    'Press E near a yellow bike to ride along the Tancheon stream 🚲',
    'Say hi in the community board on the right!',
  ],
}
```

#### 2. Build a Procedural 3D Landmark (Difficulty: ★★☆)
- Check `src/world/nobiosHotel.js`, `src/world/starbucksGlass.js`, or `src/world/postOffice.js`.
- We use pure **Three.js box/cylinder geometries + procedural HTML5 Canvas textures** (no heavy external `.glb` or image files required), keeping the entire world fast and lightweight.

#### 3. Open a New Neighborhood / City (Difficulty: ★★★)
1. Update the bounding box and center coordinates in `data/query.overpassql` and `scripts/convert.mjs` to generate a new region JSON pack from OpenStreetMap.
2. Add or unlock the region in `src/worldGate.js` (`UPCOMING_REGIONS`) so users can click your city on the 3D globe!

#### 4. Non-Code Contributions (Local Spots & Feedback)
- Visit **[https://bumpinto.world](https://bumpinto.world)**, click **`📋 게시판` (Board)** on the right, and share local restaurant tips or feature feedback. Verified spots are promoted to official 3D map labels!

---

### 🚀 Quick Start & Pull Request Workflow

```bash
# 1. Fork & clone the repository
git clone https://github.com/<your-username>/bumpinto-world.git
cd bumpinto-world

# 2. Install dependencies & start dev server (Node.js 22+ recommended)
npm install
npm run dev
# Open http://localhost:5173 in your desktop browser!
```

1. Add yourself to the `CONTRIBUTORS` list in `src/contributors.js` as part of your PR.
2. Open a Pull Request on GitHub—once merged, it will be deployed straight to **[https://bumpinto.world](https://bumpinto.world)**!

---
---

<a id="한국어-가이드"></a>

## 🇰🇷 한국어 가이드 — Bumpinto World 함께 만들기

**Bumpinto World ([https://bumpinto.world](https://bumpinto.world))** 는 혼자서 다 만들 수 없는 현실 기반 3D 오픈월드를 **오픈소스 기여자들과 상부상조하며 함께 확장**해 나가는 프로젝트입니다.

### 🏆 기여자 혜택 (상부상조 리워드)

Pull Request(PR)가 머지되면 단순 코드 반영을 넘어 **실제 라이브 서비스(`https://bumpinto.world`) 월드 안에 제작자의 이름과 링크가 영구 등재**됩니다.

1. **👑 명예의 전당 (`src/contributors.js`) 등재**
   - 인게임 우측 **`🌍 함께 만들기`** 모달의 명예의 전당(Hall of Fame)에 **이름/닉네임, GitHub/개인 블로그/회사 링크, 기여 배지**가 올라갑니다.
2. **🏢 3D 건물 머릿돌 & 오버레이 크레딧**
   - 특정 랜드마크 건물을 디테일하게 제작해 주시면 해당 건물 위 라벨 또는 건물 앞 안내판에 `Built by @닉네임`을 공식 표기해 드립니다.
3. **📍 지역 개척자 (Region Pioneer) 타이틀**
   - 수내역, 서현역, 이매역, 야탑역, 판교역, 강남역, 성수동, 홍대입구(또는 해외 도시) 등 새 지역의 OSM 데이터 변환 및 첫 오픈을 기여해 주시면 해당 지역의 **공식 개척자(Pioneer)**로 지구본 및 입장 화면에 표시됩니다.
4. **🗣️ 나만의 시민 NPC 상주**
   - 본인이 디자인한 아바타 외형과 대사를 가진 시민 NPC가 공식 월드 거리를 24시간 걸어 다니며 모든 접속자에게 말을 건넵니다.

---

### 🛠️ 가장 쉽게 참여하는 4가지 방법

#### 1) 나만의 시민 NPC & 동네 대사 추가하기 (난이도 ★☆☆ — 5분 컷)
`src/entities/npcs.js`의 `NPC_DEFS` 배열에 본인의 캐릭터와 대사를 한 줄 추가해 주세요!

```js
// src/entities/npcs.js 내 NPC_DEFS 배열에 추가 예시
{
  name: '판교 출근러 민수',
  look: { gender: 'm', face: 'round', hair: 'short', glasses: true, top: 'hoodie', color: '#4f7cff' },
  lines: [
    '정자역에서 신분당선 타면 판교까지 한 정거장이에요!',
    '탄천 산책로 자전거 타기 딱 좋은 날씨네요 🚲',
    '정자동 카페거리에서 커피 한 잔 하실래요?',
  ],
}
```

#### 2) 랜드마크 3D 건물 & 간판 꾸미기 (난이도 ★★☆)
- `src/world/nobiosHotel.js`, `src/world/starbucksGlass.js`, `src/world/signs.js`를 참고해 정자역 주변(또는 새 지역)의 특징적인 건물을 로우폴리 Three.js 메시로 꾸밀 수 있습니다.
- 외부 무거운 `.glb` 텍스처 없이 **박스/실린더 지오메트리 + Canvas 2D 절차적 텍스처**만으로도 멋진 건물을 지을 수 있습니다.

#### 3) 새로운 동네(판교·강남·성수·홍대·해외 도시 등) 개척하기 (난이도 ★★★)
1. `data/query.overpassql` 및 `scripts/convert.mjs`에서 중심 위경도(`CENTER_LAT`, `CENTER_LON`)와 `bbox`를 원하는 역/동네로 지정해 JSON 지도를 생성합니다.
2. `src/worldGate.js`의 `UPCOMING_REGIONS`에서 해당 지역을 오픈 상태로 전환하는 PR을 올려주세요.

#### 4) 코드 없이 참여하기 (맛집·피드백 제보)
- [https://bumpinto.world](https://bumpinto.world) 에 접속해 우측 **`📋 게시판`**에서 **`[주변맛집]`** 또는 **`[피드백]`**에 글을 남겨주시면 확인 후 월드 내 공식 지명 라벨(`public/jeongja.json`의 `labels`)로 반영합니다.

---

### 🚀 로컬 실행 및 PR 보내는 순서

```bash
# 1. 저장소 포크(Fork) 및 클론
git clone https://github.com/<내-아이디>/bumpinto-world.git
cd bumpinto-world

# 2. 패키지 설치 및 로컬 실행 (Node.js 22+ 권장)
npm install
npm run dev
# 브라우저에서 http://localhost:5173 접속!
```

1. 작업 후 본인의 이름과 링크를 `src/contributors.js`의 `CONTRIBUTORS` 배열에도 함께 추가해 주세요!
2. GitHub에서 Pull Request를 생성해 주시면 빠르게 리뷰 후 `https://bumpinto.world` 실서버에 배포해 드립니다.
