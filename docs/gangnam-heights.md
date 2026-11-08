# 강남 건물 높이 — 브이월드 GIS건물통합정보 (2026-11-08)

강남 9칸 타일의 건물 높이는 아래 순서로만 정한다. 없는 숫자는 만들지 않는다.

1. OSM `height` (2m 이상이면 유지)
2. 브이월드 GIS건물통합정보 `hg` (미터)
3. 브이월드 `ground_floor_co` × 3.2 (+3층 초과면 +1.5, 아니면 +0.6) — `scripts/corridor/build-pangyo.mjs` 의 `LEVEL_H` 와 같은 식
4. OSM `building:levels` × 같은 식
5. 종류·면적 기본 층수 (`defaultLevels`)

`npm run corridor:gangnam` (`scripts/corridor/build-pangyo.mjs --region=gangnam`)이 `data/gangnam_vworld_heights.json` 을 읽어 타일에 넣는다.

## 자료

국토교통부 GIS건물통합정보 (브이월드 명칭, 공공데이터포털 파일데이터 [15083092](https://www.data.go.kr/data/15083092/fileData.do)). 이용허락범위 **공공누리 제1유형(출처표시)**. 상업적 이용·변경 가능. 출처 표시 필요.

받은 것은 NED WFS `getBldgisSpceWFS` typename `dt_d010`, EPSG:4326, 강남 타일과 같은 9칸(−15..−13 × −31..−29, 500m)이다. 피처 3,437개(타일 경계 중복을 빼면 3,261). `hg > 0` 인 동과, 높이 없이 지상층수만 있는 동을 쓴다.

원본 타일 JSON 은 커밋하지 않는다. 정자 외벽색(`scripts/building-colours.mjs`)과 같이 브이월드 캐시는 `--vworld=` 폴더로만 넘긴다. 저장소에 두는 것은 OSM 건물 id → 높이 파생 표 `data/gangnam_vworld_heights.json` 뿐이다.

```
node scripts/corridor/gangnam-vworld-heights.mjs --vworld=<dt_d010 타일 폴더>
```

## 매칭

OSM 풋프린트(강남 박스 안, 지하 제외, `build-pangyo.mjs` 와 같은 필터, 2,709동)와 브이월드 풋프린트를 겹친다.

- IoU ≥ 0.22 이면 그 동
- 아니면 OSM 면적의 55% 이상을 덮고 면적비가 0.25–4
- 아니면 중심점이 서로 안에 있고 면적비가 0.4–2.8
- 상위 두 후보의 점수가 비슷한데 높이가 40% 넘게 다르면 버린다

`hg ≤ 0` 은 측정값이 없는 것이다. `hg < 2` 또는 `hg > 300`(이 박스 실측 최대 202.65m)과 지상층수 60 초과는 로그하고 쓰지 않는다. 국기원 OSM 외곽은 캠퍼스라 한 동과 겹치지 않아 면적 기본값(16.6m)을 유지한다.

## 출처 문구

`건물 높이: 국토교통부 브이월드 GIS건물통합정보 (공공누리 제1유형: 출처표시), https://www.data.go.kr/data/15083092/fileData.do`

강남 `index.json` `meta.attribution`, 화면 오른쪽 아래(강남을 켠 코리더), README 에 적는다. `?gangnam=0` 이면 이 문장을 붙이지 않는다.
