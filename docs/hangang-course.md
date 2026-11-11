# 한강 자전거 코스

성남 → 탄천 → 탄천합수부 → 한강 남단 자전거길 → 잠수교 → 용산·한남 → 남산(소월로·남산공원길) → 남산타워.

남산과 같은 방식이다. OSM 실측 선·면과 AWS terrarium DEM 만 쓰고, 없는 숫자는 만들지 않는다. 도로는 `drapedRibbonGeo` 로 지형에 붙이며, 기본으로 켜지고 `?hangang=0` 이면 끈다.

자료는 2026-11-11 에 받았다. Overpass(`overpass-api.de` 406, `kumi.systems` 시간 초과, `overpass.osm.ch` 빈 결과)는 쓰지 못했고, Nominatim으로 id를 찾은 뒤 OSM API 0.6 `map` bbox와 way/relation 직접 조회를 썼다. 남산 데이터도 같은 API다.

## 좌표

정자와 남산과 같다.

- 원점 위경도 `37.3665, 127.10835`
- `x = (lon − lon0) × kx`, `kx = cos(lat0) × 111320 ≈ 88473.75`
- `z = −(lat − lat0) × kz`, `kz = 110540`
- 게임 `y = 해발고도 − datum(48)`

한강 수면은 해발 약 5 m 이라 `y ≈ −43` 이다. `terrain.addGroundExtra` 는 높이기만 해서 정자 기본면(`y ≈ 0`)을 이기지 못한다. 그래서 한강 박스 안은 `terrain.addGroundSurface` 로 낮춘다.

1구간은 남산처럼 코리더 타일 밖의 섬이다. 사이 빈 땅은 걷지 못한다.

## 전체 구간

| 구간 | 상태 | 이 박스에서 확인한 것 |
| --- | --- | --- |
| 성남 → 탄천 | 이미 있음 (`public/corridor/tancheon.json`) | 축 마지막 `[-2900, -14934.7]`. `meta.osm.bikeRoute` = relation/27411 |
| 탄천 하류 → 탄천합수부 | 아직 없음 | 탄천 축 끝에서 반포 동단까지 직선 약 6.3 km. 실제 합수부는 이 1구간 동쪽 밖 |
| 한강 남단, 합수부 → 반포 | 아직 없음 | relation/8280682 · 8371341 의 동쪽 연장. 1구간 동단 `banpoEast` 에서 이어 붙일 자리 |
| **반포한강공원 + 잠수교** | **이번 작업** | 아래 1구간 |
| 잠수교 북단 → 한남 → 남산 | 아직 없음 | `yongsanEast` `(-8939.2, -17887.9)` → 남산 `NAMSAN_CONNECT_ENDS.hannam` `(-9681.97, -20922.61)`, 직선 약 3.1 km |
| 남산 소월로·남산공원길 → 타워 | 이미 있음 (`feat/namsan-tower` 가 develop 에 들어 있음) | `namsanCoords.js` 의 `hannam` / `yaksuSouth` 팁 |

## 데이터 출처 (받은 것만)

### 자전거 노선 관계

| OSM | 이름 | 태그 | 멤버 |
| --- | --- | --- | --- |
| relation/8280682 | 한강 종주 자전거길 (서울 구간) | `network=ncn`, `route=bicycle`, from 아라한강갑문, to 팔당대교 | 168 |
| relation/8371341 | 한강 자전거길 | `network=rcn`, `route=bicycle` | 226 |
| relation/27411 | 탄천 자전거길 | `network=rcn`, `route=bicycle` | 85 (탄천 `meta.osm.bikeRoute` 와 같음) |

국토종주 서울 구간은 relation/8280682 이다. 한강변 rcn 은 8371341.

### 잠수교

relation/11173732 (`type=bridge`, `distance=795 m`, `start_date=1976-07-15`, `name=잠수교` / `Jamsugyo (Way Bridge)`). 구성 way 네 개, 역할은 모두 `across`.

| OSM | 역할 | 받은 값 |
| --- | --- | --- |
| way/596516315 | 중심선. `highway=cycleway`, `bridge=low_water_crossing`, `layer=1`, `motor_vehicle=no`, `foot=designated`, `bicycle=designated`, `wikidata=Q704504`, `distance=795 m` | 투영 길이 956.5 m (7점). `distance` 태그 795 m 는 수면 위 구간으로 읽힌다 |
| way/1091571021 | 윤곽. `man_made=bridge`, `bridge=low_water_crossing`, `layer=1`, `name=잠수교` (`alt_name=반포대교`) | 닫힌 14점. `widthEst` 5.6 m (면적÷길이), `lengthEst` 959.1 m. 양 끝 폭은 약 4.7–9.5 m |
| way/815547952 | 남단 짧은 자전거길 | 10.4 m. 남단 끝 `(-9741.7, -15961.4)` = 스폰 |
| way/586051611 | 북단 접근. `highway=cycleway`, `name=녹사평대로`, `tunnel=yes`, `layer=-1` | 322.1 m. 북단 끝이 잠수교 북단 `(-10084.1, -16854.5)` 에 붙음 |

**폭:** OSM 만 보면 데크가 아주 얇다. 중심선 way/596516315 에는 `width`·`lanes` 태그가 없다(보행화 이후 `highway=cycleway`). 윤곽 way/1091571021 에도 `width`·`lanes` 가 없고, 면적÷길이 `widthEst` 는 5.6 m, 양 끝 폭은 약 4.7–9.5 m 이다. 차도·보도를 나눈 평행 way 도 이 bbox 에 없다. 그 윤곽은 실제 상부 구조보다 좁게 매핑된 띠로 읽힌다.

물리 폭은 한국민족문화대백과사전(한국학중앙연구원) 「잠수교」 항목의 **18.0 m** 를 쓴다. 주소: https://encykorea.aks.ac.kr/Article/E0048181 — 「너비 18.0m, 길이 795.0m」(집필 변근주·연세대 토목공학, 2023-02-07 수정). 참고문헌으로 『반포대교가설공사실시설계종합보고서』(서울특별시, 1975)를 적고 있다. 한국어 위키백과 「반포대교」 잠수교 절도 폭 18 m, 왕복 4차로로 건설되었다고 적는다. 코드 상수는 `JAMSU_DECK_WIDTH` 이고, 데크 메시는 중심선을 따라 폭 18 m 로 펼친 윤곽이다.

배분(approximate, 총 18.0 m 안에서): 양옆 높인 보도 각 1.6 m, 남은 14.8 m 를 왕복 4차로(차로 폭 3.7 m). 흰 가장자리·차로 점선 두 줄·노란 중앙 점선. 2008년 이후 일부 차로가 보행·자전거 공간이 되었고 2026년 차량 통행은 끊겼으나, 그리는 것은 건설 당시의 18 m 왕복 4차로 상부 구조이다.

### 반포대교

| OSM | 받은 값 |
| --- | --- |
| way/1085504592 | 윤곽. `man_made=bridge`, `layer=2`, `height=3` (데크 두께로 읽음. 형하 공간이 아님), `material=reinforced_concrete`, `bridge:structure=beam`, `wikidata=Q255506`. `widthEst` 20.0 m, `lengthEst` 1892.3 m (육지 진입부 포함) |
| relation/14471133 | 받은 multipolygon. outer 가 way/1085504592 |

같은 bbox 안에 `layer=2` `bridge=yes` 인 반포대로와 녹사평대로가 있다. 이 차로 리본은 반포대교 데크와 높이가 섞여 잠수교 위를 가르는 회색 대각선이 되어서 뺐다. 상부 차로는 반포대교 데크 메시가 담당한다. 올림픽대로·강변북로는 고가/육지 리본으로 그렸다.

### 반포한강공원 · 한강 · 서래섬

| OSM | 받은 값 |
| --- | --- |
| way/418249072 | 반포한강공원. `leisure=park`, 111점, bbox 대략 37.502746,126.978668 – 37.515500,127.005705, `wikidata=Q12597453`, `operator=서울특별시 한강사업본부` |
| way/919393791, way/769712608 | 같은 공원 안의 잔디·부분 폴리곤 |
| way/25979109 | 서래섬 (`leisure=park`). 한강 수면의 inner |
| relation/152336 | 한강. `type=multipolygon`, `natural=water`, `water=river`, `wikidata=Q55500`. 이 clip 안에서 outer 2, inner 7 |
| way/261980547 | 달빛무지개분수. 받아 두었으나 브랜드 로고를 그리지 않으려고 메시는 넣지 않았다 |

1구간 clip 에 들어온 named 나들목: 반포나들목 (고속터미널 방면), 반포나들목 출입로, 반포나들목 출입로 (고속터미널 방면), 반포안내센터 나들목, 서래섬나들목.

원본 way 는 769개(cycleway 65, footway 232, service 193, primary 58, steps 14, path 12 등). 화면에는 자전거길·이름에 `자전거`/`나들목`/`잠수교` 가 들어간 것, `layer=2` 반포대로·녹사평대로, 공원·다리 근처 보행로·계단만 그린다. 한강남자전거길 16개, 한강북자전거길 4개.

받은 bbox:

- `126.978,37.502,127.008,37.514` (반포한강공원)
- `126.992,37.510,127.002,37.525` (잠수교·반포대교)
- 이후 clip 을 `126.968–127.015, 37.499–37.532` 로 넓혀 아래 끝점이 DEM 안에 들어가게 했다

다시 만드는 스크립트는 `scripts/corridor/build-hangang.py`.

## 높이

AWS Terrain Tiles terrarium z=14 (`s3://elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`). `height = (R×256 + G + B/256) − 32768`.

`public/corridor/hangang/hangang-dem.json`: 격자 168×148, `dx=dz=25`, `x=−12425…−8250`, `z=−18300…−14625`, `datum=48`. 받은 뒤 해발 `< −5` 또는 `> 120` 인 빈 칸(처음엔 −1413 m 까지 나온 픽셀 네 개)은 그 줄 중앙값으로 막았다. 막은 뒤 `eleMin=−3.8`, `eleMax=90.5`.

수면은 OSM 한강 링 안 DEM 의 25백분위, 측정값 해발 5.1 m (`y=−42.9`). 강변 자전거길 DEM 이 이 수면보다 조금 낮은 칸은 수면으로 올린다.

잠수교·반포대교 수면 위 DEM 은 얇은 데크를 뚫고 강물(해발 약 5 m, 반포 수면 위는 8–13 m)을 가리킨다. 그래서

- 잠수교 데크: 중심선 남·북 끝 DEM(남 약 8.7 m, 북 약 6.0 m)을 보간한 뒤 `max(수면+1.8 m, 보간값)`. 테스트에서 게임 y 는 남 −39.7 / 가운데 −40.3 / 북 −40.8
- 잠수교 두께 1.05 m (OSM `height` 없음)
- 반포대교 수면 위: 육지 교대 DEM 중앙값(남·북 샘플 중 해발 12 m 이상만, 초기값 18 / 17 m)을 보간. 가운데 게임 y −27.5 (잠수교보다 약 12.8 m 위)
- 반포대교 두께: OSM `height=3`
- 육지 위 반포 진입부는 DEM 을 따른다

테스트(`scripts/corridor/test/test-hangang-roads.mjs`): 자전거·잠수교 경로 66개, 3,846점, 최대 단차 2.13 m, 한도 초과 0. 잠수교 중심선 243점 연속.

## 1구간에 그린 것

- DEM 높이장(2배 업샘플) + 한강 수면(relation/152336, Phong 반사). 공원 ShapeGeometry 판은 쓰지 않는다 — 오목한 반포한강공원 판이 눈높이 거대 삼각형(녹색 벽)이 되었다. 잔디는 DEM 정점색과 타일 텍스처로만 그린다
- 계단식 호안: 한강 수면 외곽 중 반포한강공원에 닿는 변에서 육지로 10단(회색 콘크리트 디딤 1.58 m, 높이 0.40 m). OSM terrace way 가 없어 수면 링+수면 높이로 만들었다(approximate)
- 잠수교 데크는 폭 18.0 m 회색 아스팔트(`#6a6e72`)에 왕복 4차로 노면표시·양옆 높인 보도(`#9a9c98`, 각 1.6 m)·난간. 테라코타색은 한강변 전용 자전거길에만 쓰고, 데크와 겹치는 리본은 잘라 냈다. 반포대교는 낮은 콘크리트 난간만(overhead cable 없음). 아래에는 종·횡 거더(중앙 종거더는 빼 둠). 쌍벽식 교각은 잠수교 18 m 바깥·반포대교 아래에 두어 하부 데크를 뚫지 않는다
- 교각: 잠수교 중심선을 따라 수면 위에 52 m 간격. OSM 교각 노드가 아니라 만든 것이다
- 반포대교 아래 밤 조명: 거더 밑 `PointLight #ffcc88`(간격 22 m, 거리 감쇠). 아랫면은 어두운 Phong 재질이라 점광원이 퍼지게 하고, 균일 emissive 주황 면은 쓰지 않는다. 브랜드 로고 없음
- 자전거길·산책로·나들목: `drapedRibbonGeo`. 한강남자전거길·한강북자전거길만 테라코타색(잠수교 중심선 리본은 그리지 않음). 3 m 이상은 노란 중앙 점선과 흰 가장자리, 산책로는 베이지. `tunnel=yes` 는 1.6 m 내림
- OSM 건물 295동 압출(반포·서래·용산 가장자리), 올림픽대로·강변북로 리본, 스카이라인 링, DEM 아래 치마
- 나무: OSM `natural=tree` 31그루 + 길을 따라 심은 가로수(approximate). `natural=tree_row` 는 이 bbox 에 없었다
- 벤치 6 / 휴지통 6 (OSM) + 가로등·볼라드·「Seoul Bike Path」풍 초록 표지(로고 없음, approximate)
- 세빛섬 네 섬: relation/4077217 외곽만 부유 플랫폼으로. 이름·브랜드는 넣지 않았다
- 라벨: 잠수교, 반포대교, 반포한강공원
- HUD 미니맵·휴대폰 지도: 강·공원·자전거길·다리·올림픽대로/강변북로
- 이동: `?at=hangang` 또는 여행 목록 «반포한강공원» → 잠수교 남단
- 카메라 `far` 14000, 한강 박스 안 안개 near 650 / far 10500 (남산과 같음)

파일:

- `public/corridor/hangang/hangang-osm.json` (약 313 KB)
- `public/corridor/hangang/hangang-dem.json` (약 118 KB)
- `src/corridor/landmarks/hangang.js` 와 `hangangCoords.js`, `hangangTerrain.js`, `hangangBridges.js`, `hangangPaths.js`, `hangangCity.js`, `hangangProps.js`

## 이어 붙일 끝점

`hangang-osm.json` 의 `connectEnds` (받은 자전거길 끝).

| id | 이름 | x, z |
| --- | --- | --- |
| banpoEast | 한강남자전거길 동단 → 잠실·탄천합수부 | −8923.9, −16698.7 |
| banpoWest | 한강남자전거길 서단 → 동작대교·여의도 | −11955.7, −15478.1 |
| yongsanEast | 한강북자전거길 동단 → 한남·남산 | −8939.2, −17887.9 |
| yongsanWest | 한강북자전거길 서단 → 이촌·원효 | −12169.8, −16629.1 |
| jamsuSouth | 잠수교 남단 (반포한강공원) | −9741.7, −15961.4 |
| jamsuNorth | 잠수교 북단 (용산·보광) | −10084.1, −16854.5 |

다음으로 붙일 곳:

- 동쪽: `banpoEast` → 한강남자전거길 → 탄천합수부 → 탄천 축 끝 `[-2900, -14934.7]` (직선 약 6.3 km). 탄천 축을 합수부까지 늘리는 일과 한강 남단을 동쪽으로 뻗는 일을 같이 해야 길이 이어진다
- 북쪽: `yongsanEast` / `jamsuNorth` → 한남 → `NAMSAN_CONNECT_ENDS.hannam` `(−9681.97, −20922.61)` (직선 약 3.1 km), 이어서 소월로·남산공원길

## 성능

남산과 같은 섬이라 정자 타일을 다시 그리지 않는다. DEM 은 25 m 격자 168×148 을 두 배로 올려 약 335×295 꼭짓점. 자전거·보행 리본은 재질별로 합친다. 교각은 `InstancedMesh`. 반포대교 아래 점광원은 중심선 22 m 간격. `?hangang=0` 이면 JSON 도 받지 않는다.

드로우콜·용량을 프레임 단위로 재지는 않았다. JSON 두 파일은 약 313 KB + 118 KB.

## 아직 남은 것 · 근사로 그린 것

- 잠수교 OSM 윤곽 `widthEst` 는 5.6 m 로 실제보다 좁다. 데크는 한국민족문화대백과사전의 18.0 m 를 쓰며, OSM JSON 원본 태그는 고치지 않았다
- 교각 위치·거더 간격은 OSM 노드가 아니다 (52 m / 9 m)
- 계단식 호안은 OSM terrace way 가 아니라 한강 수면 링 중 공원에 닿는 변+수면 높이로 만들었다
- 잠수교 4차로·보도 배분은 OSM `lanes` 가 없어 18.0 m 총폭 안에서 나눈 것이다(approximate)
- 길을 따라 심은 가로수·가로등·볼라드·자전거길 표지는 OSM 점이 부족해서 간격을 정해 넣었다 (`approx`)
- 세빛섬은 외곽만 쓰는 무명 부유 플랫폼이다
- 달빛무지개분수(way/261980547)는 브랜드 없이 메시를 넣지 않았다
- 스카이라인 링은 OSM 건물이 아닌 원경 텍스처다
- 탄천 축이 합수부에 닿지 않아 성남에서 잠수교까지 한 번에 달릴 수 없다
- 한남에서 남산 `hannam` 팁까지 아직 비어 있다
- 자전거 탄 NPC 메쉬는 아직 없다
- 스폰과 카메라는 겹친 데크에서 플레이어 높이(`refY`)를 넘겨 잠수교에 머물게 했다. `?at=hangang` 은 잠수교 남단 높이로 내린다
