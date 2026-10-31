# 🌍 Bumpinto World 함께 만들기 (Contributing)

> **[한국어](#한국어-가이드) · [English summary](#english-summary)**
>
> ⚠️ **초안(DRAFT)** — 이 문서의 "기여자 라이선스 약관(CLA)" 부분은 법률 검토 전 초안입니다. 확정 전에 변호사 검토를 받은 뒤에 근거로 삼아 주세요. / *Draft — the Contributor License terms below have not been reviewed by a lawyer yet. Have a lawyer review them before relying on them.*

---

<a id="한국어-가이드"></a>

## 🇰🇷 한국어 가이드

**Bumpinto World ([https://bumpinto.world](https://bumpinto.world))** 는 OpenStreetMap(OSM) 실제 지도 데이터와 절차적(procedural) 로우폴리 Three.js 모델로 만든 브라우저 3D 월드입니다. 혼자서 전 세계 동네를 다 만들 수는 없어서 소스를 공개합니다. 동네, 건물, NPC를 함께 채워 주세요.

소스는 **공개(source-available)** 되어 있지만 **오픈소스 라이선스(MIT 등)가 아닙니다.** 개인·학습·비영리 실행은 자유롭지만, 이 소스나 수정본으로 **영리 서비스를 운영할 수는 없습니다.** 자세한 내용은 [LICENSE](./LICENSE)(영문이 기준)를 보세요.

### 🏆 기여자 혜택

PR이 머지되면 라이브 월드(`https://bumpinto.world`) 안에 이름과 링크가 남습니다.

1. **👑 명예의 전당 (`src/contributors.js`)** — 인게임 **`🌍 함께 만들기`** 모달에 이름/닉네임, 링크(GitHub·블로그·회사), 기여 배지가 올라갑니다.
2. **🏢 건물 크레딧** — 랜드마크를 만들어 주시면 건물 라벨이나 안내판에 `Built by @닉네임`을 표기합니다.
3. **📍 지역 개척자 (Region Pioneer)** — 새 지역을 처음 열어 주시면 지구본과 입장 화면에 개척자로 표시됩니다.
4. **🗣️ 시민 NPC** — 직접 디자인한 아바타와 대사를 가진 NPC가 월드를 걸어 다닙니다.

---

### 1. 기본 원칙: 정자는 라이브입니다 → 변경은 "추가"로만

정자역(정자동) 월드는 지금 실제 서비스 중입니다. 그래서 모든 PR은 **기존 화면을 바꾸지 않고 덧붙이는 방식**이어야 합니다.

- 기본 지역(`src/regions/index.js`의 `DEFAULT_REGION_ID = 'jeongja'`)은 바꾸지 않습니다.
- 정자 데이터 파일은 수정하지 않습니다: `public/jeongja.json`, `public/transit.json`, `public/terrain.json`, `public/drive.json`, 그리고 `data/`의 정자 원본.
  - 확인: `git diff --exit-code origin/develop -- public/jeongja.json public/transit.json public/terrain.json public/drive.json`
- 새 기능은 새 파일·새 지역·URL 파라미터(기본 꺼짐)로 넣습니다. 기본 URL로 접속했을 때 정자 화면이 그대로여야 합니다.
- 정자 영역을 꼭 고쳐야 한다면 **별도 PR**로 내고, 전/후 스크린샷을 첨부해 주세요. 원본(`data/*`)과 변환 스크립트(`scripts/convert*.mjs`)를 함께 커밋해야 재현됩니다.

### 2. 브랜치 · PR 흐름

```bash
# 1) 포크 후 클론
git clone https://github.com/<내-아이디>/bumpinto-world.git
cd bumpinto-world
git remote add upstream https://github.com/dohoon84/bumpinto-world.git

# 2) develop 기준으로 작업 브랜치 만들기
git fetch upstream
git switch -c feat/area-<지역id> upstream/develop     # 예: feat/area-migeum, feat/landmark-<이름>, fix/<내용>

# 3) 설치·실행 (Node.js 22 이상, CI는 Node 22)
npm ci
npm run dev        # http://localhost:5173
npm run build      # PR 전에 빌드가 통과하는지 꼭 확인
```

- PR은 **`develop` 브랜치**로 보내 주세요. `main`은 배포 브랜치라서 도훈(@dohoon84)이 `develop`에서 옮깁니다.
- 모든 PR은 `CODEOWNERS`에 따라 @dohoon84 리뷰를 거칩니다. 머지되면 다음 배포 때 `https://bumpinto.world`에 반영됩니다.
- CI(빌드 체크)는 현재 `main` 대상 PR에서만 돌기 때문에, `develop` PR에서는 **로컬에서 `npm run build`를 직접 확인**해 주세요.
- PR 템플릿의 체크리스트(라이선스 동의 포함)를 채워 주세요.
- 본인 이름과 링크를 `src/contributors.js`의 `CONTRIBUTORS` 배열에 함께 추가해 주세요.
- 키·토큰·`.env`·`.dev.vars` 같은 비밀값은 절대 커밋하지 않습니다.

### 3. 기여 방법

#### 3-1. 시민 NPC & 대사 (난이도 ★☆☆)
`src/entities/npcs.js`의 `NPC_DEFS`에 캐릭터를 추가합니다.

```js
{
  name: '판교 출근러 민수',
  look: { gender: 'm', face: 'round', hair: 'short', glasses: true, top: 'hoodie', color: '#4f7cff' },
  lines: [
    '정자역에서 신분당선 타면 판교까지 한 정거장이에요!',
    '탄천 산책로 자전거 타기 딱 좋은 날씨네요 🚲',
  ],
}
```
실존 인물·유명인·캐릭터(IP)의 이름이나 외형은 쓰지 마세요.

#### 3-2. 랜드마크 · 건물 (난이도 ★★☆)

모든 건물은 **Three.js 기본 도형(박스·실린더 등) + Canvas로 그린 절차적 텍스처**로 만듭니다. 외부 `.glb` 모델이나 사진 텍스처는 받지 않습니다.

- **정자 영역 안(라이브)**: `src/world/nobiosHotel.js`, `src/world/postOffice.js`처럼 정자 좌표를 코드에 넣고 `src/world.js`나 `src/game.js`에서 호출합니다. 정자 화면이 바뀌므로 **별도 PR + 전/후 스크린샷**이 필요합니다.
- **코리더(수내 → 잠실/롯데) 상세 랜드마크**: 롯데월드타워 방식입니다.
  1. `src/corridor/landmarks/<name>.js`에 `export function createXxx(params) { …; return group }`를 만듭니다. 참고: `lotteWorldTower.js`.
     - 밤 조명은 `group.userData.setNight(0|1)`, 애니메이션은 `group.userData.update(dt)`.
     - 같은 재질은 병합하고, 반복 부재는 InstancedMesh나 병합 메시로 만들어 draw call을 줄입니다.
  2. `src/corridor/landmarks/index.js`의 `MODELS`에 등록합니다.
  3. 위치·크기 연결(`landmarks.json`의 `anchor`/`match`/`hide`와 bake 단계)은 **아직 저장소에 없는 1단계 파이프라인**에서 처리됩니다(아래 3-3 참고). 모델 코드 PR을 올려 주시면, 배치는 메인테이너가 bake를 돌려 연결합니다. PR에 원하는 OSM id(`way/…`, `relation/…`)와 대략의 높이를 적어 주세요.
- **룩 유지**: 색·재질은 `src/world.js`의 `BUILDING_COLOR`, `facadeKey`, `facadeMaterial`, `ribbonGeo`를 import해서 씁니다. 새 팔레트를 만들지 않습니다. 층고는 3.2 m. 랜덤 값은 `Math.random` 대신 위치·키 해시 시드를 씁니다(매번 같은 모습).
- 실제 건물을 본떠도 되지만 **로고·상표·간판 문구를 그대로 그리지 마세요**(아래 4번).

#### 3-3. 새 동네 · 지역 열기 (난이도 ★★★)

솔직히 말씀드리면 **지금은 두 가지 경로의 준비 상태가 다릅니다.**

**(A) 독립 지역 (스타베이스 방식) — 저장소만으로 가능**

정자와 떨어진 새 도시/동네를 별도 지역으로 여는 방법입니다. `scripts/convert-starbase.mjs` + `src/regions/starbase.js`가 예시입니다.

1. 해당 bbox의 OSM XML을 OSM API(`/api/0.6/map?bbox=…`) 또는 Overpass로 받아 `data/<지역id>/*.xml`에 저장합니다.
2. `scripts/convert-starbase.mjs`를 복사해 `scripts/convert-<지역id>.mjs`를 만들고 `CENTER`, `BBOX`, 입력·출력 경로를 바꿉니다 → `public/<지역id>.json`.
   - **`scripts/convert.mjs`나 `data/query.overpassql`(정자용)은 고치지 마세요.** 정자 데이터가 바뀝니다.
3. `src/regions/<지역id>.js`를 만들고 `src/regions/index.js`의 `OPEN_REGIONS`에 등록합니다(`UPCOMING_REGIONS`에 있으면 거기서 뺍니다). `DEFAULT_REGION_ID`는 그대로 둡니다.
4. `package.json`에 변환 스크립트를 추가하고, PR에 **원본을 받은 날짜, bbox, 사용한 API**를 적어 주세요. 원본(`data/<지역id>/`)도 함께 커밋해야 같은 결과가 재현됩니다.
5. `?region=<지역id>`로 열어 확인합니다.

**(B) 정자 → 롯데 코리더 연장 (예: 미금, 다음 역) — 아직 외부 기여자가 끝까지 돌릴 수 없음**

- 코리더는 2단계로 만들어집니다.
  1. **원본 굽기(bake)**: OSM 셀 다운로드 + Overture 건물 + VWorld 건물 높이 보정 + 랜드마크 매칭. 이 단계의 스크립트(`fetch-osm`, `fetch_overture.py`, `fetch-vworld`, `bake.mjs`, `config/corridor.json`, `landmarks.json`)와 원본 캐시(약 190 MB)는 **아직 저장소에 없습니다**. VWorld는 API 키(도메인 등록)도 필요합니다.
  2. **코리더 변환**: 저장소의 `scripts/corridor/*.mjs` (`corridor:build` → `corridor:tancheon` → `corridor:build` → `corridor:drive` → `corridor:transit`, `build-globe.mjs`). 1단계 결과물이 있어야 돌아갑니다.
- 그래서 지금 외부 기여자가 도울 수 있는 일은 이렇습니다.
  - 이슈로 **역 이름, OSM station node id, 좌표, 노선**을 정리해 제안하기 (`node["railway"="station"]["name"="미금"];out;`).
  - **OSM 자체를 개선하기**: 건물 높이(`height`, `building:levels`), 누락 건물을 현장 지식이나 허용된 자료로 OSM에 직접 편집하면 다음 bake에 반영됩니다.
  - 2단계 코드(`scripts/corridor/*`, `src/corridor/*`) 개선, 영어 역명(`STATION_EN`) 추가, 랜드마크 모델(3-2).
- 1단계 파이프라인을 저장소로 옮기는 작업은 계획 중입니다. 옮겨지면 이 문서를 갱신합니다.
- 코리더 PR이 바꿔도 되는 파일: `public/corridor/**`, `src/corridor/globeStations.js`, `scripts/corridor/*`, 필요하면 `src/corridor/landmarks/*`. 검사: `npm run corridor:check`, `npm run corridor:test`, 정자 4개 파일 `git diff --exit-code`.

#### 3-4. 코드 없이 참여하기
[https://bumpinto.world](https://bumpinto.world) 우측 **`📋 게시판`**의 `[주변맛집]`·`[피드백]`에 글을 남겨 주세요. 확인 후 지명 라벨 등에 반영합니다.

---

### 4. 데이터 · 에셋 규칙 (꼭 지켜 주세요)

| 규칙 | 내용 |
|---|---|
| **OSM 출처 표기** | OSM 데이터는 © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright)입니다. 화면 하단 출처 표기(`#attribution`)를 지우거나 가리지 마세요. 생성된 JSON의 `meta.attribution`도 유지합니다. |
| **OSM 파생 데이터는 ODbL** | OSM에서 만든 데이터(`public/*.json`, `public/corridor/**`)와 거기에 합친 데이터는 ODbL로 공개됩니다. 기여하신 데이터도 마찬가지입니다. ODbL과 맞지 않는 출처(재배포 금지, 비상업 전용 등)의 데이터는 섞지 마세요. |
| **지도 서비스 스크래핑 금지** | 네이버 지도, 카카오맵, Google 지도, 로드뷰/스트리트뷰 등의 데이터·좌표·이미지를 복사하거나 긁어오거나(scraping) 트레이싱하지 마세요. 눈으로 위치를 확인하는 정도만 가능하고, 실제 데이터는 OSM이나 재배포가 허용된 공개 데이터에서 가져옵니다. |
| **로고 · 상표 금지** | 브랜드 로고, 상표, 간판 디자인, 캐릭터를 그리거나 넣지 마세요. 실제 장소 이름을 라벨로 쓰는 것은 괜찮지만 로고 모양·폰트·전용색 조합으로 브랜드를 흉내 내지 않습니다(예: `카카오T 스타일`처럼 일반화). |
| **저작권 있는 텍스처 · 모델 금지** | 사진, 다른 게임·에셋 스토어의 텍스처·모델·사운드를 넣지 마세요. 텍스처는 Canvas로 직접 그리고, 소리는 직접 녹음·합성한 것만 받습니다. 직접 녹음한 소리라도 다른 사람의 목소리, 음악, 방송·안내 멘트가 들어가 있으면 안 됩니다. |
| **출처 기록** | PR 본문에 사용한 데이터 출처(OSM API/Overpass, 받은 날짜, bbox, 그 밖의 공개 데이터와 라이선스)를 적어 주세요. |
| **비밀값 금지** | API 키, 토큰, `.env`, `.dev.vars`, 개인정보는 커밋하지 않습니다. |

현재 저장소에 쓰인 외부 데이터 출처(참고):

| 데이터 | 쓰는 곳 | 라이선스/조건 |
|---|---|---|
| OpenStreetMap | 정자·스타베이스·코리더 전체 | ODbL 1.0 |
| Overture Maps buildings 테마 (릴리스 2026-10-21.0) | 코리더 건물 footprint 보조 | ODbL ([Overture 출처 안내](https://docs.overturemaps.org/attribution/)). 이 테마는 OSM, Microsoft, Google Open Buildings(CC BY 4.0), Esri(CC BY 4.0) 등 여러 출처를 포함합니다. |
| VWorld GIS건물통합정보 (국토교통부) | 코리더 건물 높이 보정 | ⚠️ 확인 필요 <!-- TODO(김도훈): 브이월드 이용약관/공공누리 유형과 ODbL DB 안 재배포 가능 여부 확인 --> |
| 경기버스정보 gbis.go.kr | 노선 유형(`data/gbis_route_types.json`), 노선 정류소 | 사실 정보를 수작업 정리. ⚠️ 이용 조건 확인 필요 <!-- TODO(김도훈): gbis/data.go.kr 공공누리 조건 확인 --> |
| three.js | 렌더링 | MIT |

> 참고: 코드 일부의 출처 표기(`index.json`의 `meta.attribution`)에 Overture가 "CDLA-Permissive-2.0 / ODbL"로 적혀 있습니다. CDLA는 Overture **places** 테마의 라이선스이고, 여기서 쓰는 **buildings** 테마는 ODbL입니다. <!-- TODO(김도훈): 다음 bake 때 attribution 문구를 'Overture Maps Foundation (ODbL)'로 정리할지 결정 -->

---

<a id="cla"></a>

### 5. 기여자 라이선스 약관 (Contributor License Agreement, CLA)

> ⚠️ **초안 — 변호사 검토 전입니다.** 아래 영문이 기준이며, 한국어는 이해를 돕기 위한 요약입니다.

PR을 올리고 PR 템플릿의 "I agree to the Contributor License terms in CONTRIBUTING.md"에 체크하면 아래 내용에 동의하는 것으로 봅니다.

**쉬운 말로 요약**

- 내가 기여한 코드·에셋·데이터의 **저작권은 계속 나에게 있습니다.**
- 대신 **김도훈(CrazyLabs)** 에게 그 기여물을 **영구적으로, 전 세계에서, 취소할 수 없이, 무료로** 쓸 수 있는 권리를 줍니다. 여기에는 **상업적 이용, 제3자에게 재허락(sublicense), 다른 라이선스로 바꿔 배포(relicense), 판매·유료 서비스**가 포함됩니다. (나중에 Bumpinto World를 유료화하거나 사업으로 팔 수 있도록 하기 위함입니다.)
- 기여물에 관련된 내 특허가 있다면 그 특허도 같은 범위로 쓸 수 있게 허락합니다.
- **내가 기여할 권리가 있는 것만** 올립니다(직접 만들었거나, 라이선스가 허용하는 것). 회사 업무로 만든 것이라면 회사 허락을 받았습니다.
- 다른 사람의 자료가 들어 있으면 출처와 라이선스를 PR에 적습니다.
- OSM 등 ODbL 데이터에 합쳐지는 데이터 부분은 ODbL로도 공개되는 데 동의합니다.
- 기여물은 "있는 그대로" 제공하며, 머지 여부는 메인테이너가 정합니다.
- 다른 사람들에게는 기여물이 [LICENSE](./LICENSE) 조건(개인 이용 가능, 영리 서비스 금지)으로 공개됩니다.

**Contributor License Terms (binding English text)**

By submitting a Contribution (any code, asset, data, documentation, or other material you submit to this repository, for example through a pull request, patch, or issue attachment), you ("Contributor") agree to the following with 김도훈 (Dohoon Kim, CrazyLabs, https://crazylabs.co.kr) and his successors and assignees ("Maintainer"):

1. **Copyright stays with you.** You keep the copyright and other rights you have in your Contribution. These terms are a license, not an assignment.
2. **Copyright license.** You grant Maintainer a perpetual, worldwide, non-exclusive, irrevocable, royalty-free, fully paid-up license to use, reproduce, modify, adapt, prepare derivative works of, publicly display, publicly perform, distribute, and otherwise exploit your Contribution and derivative works, in any form and for any purpose, **including commercial use**, with the right to **sublicense** through multiple tiers and to **relicense** the Contribution under any terms, including proprietary or commercial terms. This license is transferable, including as part of a sale, merger, or transfer of the Bumpinto World project or business.
3. **Patent license.** You grant Maintainer, and anyone who receives the Software from Maintainer, a perpetual, worldwide, non-exclusive, irrevocable, royalty-free patent license to make, use, sell, offer for sale, import, and otherwise transfer your Contribution, for any patent claims you can license that are necessarily infringed by your Contribution alone or combined with the project.
4. **Your right to contribute.** You confirm that:
   - the Contribution is your original work, or you have the right to submit it under these terms;
   - if your employer or another party has rights in it, you have their permission to contribute it, or they have waived those rights;
   - you have identified in the pull request any third-party material in it, with its source and license; and
   - it does not, to your knowledge, include material copied from map services or other sources whose terms forbid it (for example scraped Naver, Kakao, or Google map data), or logos, trademarks, or copyrighted textures, models, or sounds.
5. **Open data.** To the extent your Contribution is added to a database derived from OpenStreetMap or another ODbL source, you also agree that it is distributed as part of that database under the Open Database License 1.0.
6. **Public license.** Maintainer may distribute your Contribution to the public under the Bumpinto World Source License in [LICENSE](./LICENSE) or any later terms Maintainer chooses.
7. **Moral rights.** To the extent permitted by law, you agree not to assert moral rights in a way that prevents the uses above. Maintainer will make reasonable efforts to credit you (for example in `src/contributors.js`), but is not required to.
8. **No obligation, no warranty.** Maintainer is not required to use or merge your Contribution. You provide it "as is", without warranty, except for the statements in item 4.
9. **Agreement.** You accept these terms by checking the Contributor License box in the pull request template or by submitting a Contribution after these terms were published. If you cannot accept them, please do not submit a Contribution.

---

<a id="english-summary"></a>

## 🇺🇸 English summary

**Bumpinto World** is a browser 3D world built from OpenStreetMap data and procedural low-poly Three.js models. The source is public so anyone can help add neighborhoods, landmarks, and NPCs. It is **source-available, not open source**: personal, educational, and non-commercial use is allowed, but running it as a commercial service is not. See [LICENSE](./LICENSE) (the English text is binding).

- **Jeongja is live, so changes must be additive.** Do not change the default region or `public/jeongja.json`, `transit.json`, `terrain.json`, `drive.json`. Put new features in new files, new regions, or URL flags that are off by default. Changes to the Jeongja area need a separate PR with before/after screenshots.
- **Flow:** fork → branch from `develop` (`feat/area-<id>`, `feat/landmark-<name>`, `fix/<topic>`) → `npm ci && npm run dev` (Node 22+) → `npm run build` → PR to **`develop`**. @dohoon84 reviews every PR (CODEOWNERS) and moves `develop` to `main` for deployment. CI currently runs only on PRs to `main`, so run the build locally. Add yourself to `src/contributors.js`.
- **NPCs:** add an entry to `NPC_DEFS` in `src/entities/npcs.js`.
- **Landmarks:** procedural Three.js geometry and Canvas textures only, no `.glb` or photo textures. Corridor landmarks go in `src/corridor/landmarks/<name>.js` and are registered in `MODELS`; placement is done by the maintainer's bake step. Reuse the palette from `src/world.js`. Use hash seeds, not `Math.random`.
- **New areas:** a standalone region (like Starbase: `scripts/convert-starbase.mjs`, `src/regions/starbase.js`) can be done entirely in this repo; commit the raw OSM data and note the fetch date and bbox. Extending the Jeongja→Lotte corridor needs a stage-1 bake pipeline (OSM cells, Overture, VWorld heights, landmark matching) that is **not in this repo yet**, so for now contributors can propose stations, improve OSM itself, or improve the stage-2 code in `scripts/corridor/`.
- **Data rules:** keep the OpenStreetMap attribution; OSM-derived data and data merged into it are ODbL; no scraping or tracing Naver/Kakao/Google maps or street view; no brand logos or trademarks; no copyrighted textures, models, or sounds; list your data sources in the PR; never commit secrets.
- **Contributor License (draft, needs legal review):** you keep your copyright, but grant 김도훈 (CrazyLabs) a perpetual, worldwide, irrevocable, royalty-free license to use your Contribution for any purpose, including commercial use, sublicensing, and relicensing, plus a matching patent license; and you confirm you have the right to contribute it. See [section 5](#cla) for the full terms.
