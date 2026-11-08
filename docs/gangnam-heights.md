# 강남 건물 높이 — 출처 판정 (2026-11-08)

강남 9칸 타일의 건물 높이는 **OSM `height` → `building:levels`×3.2 → 종류별 기본값** (`scripts/bake.mjs` `defaultLevels` 와 같은 식, `scripts/corridor/build-pangyo.mjs --region=gangnam`)만 쓴다. 없는 높이를 지어 넣지 않았다.

## 공공 데이터로 보정할 수 있는지

| 자료 | 확인 | 이 환경에서 받았나 |
|---|---|---|
| 국토교통부 GIS건물통합정보 (브이월드 명칭, 공공데이터포털 파일데이터 [15083092](https://www.data.go.kr/data/15083092/fileData.do)) | 이용허락범위 **공공누리 제1유형(출처표시)**. 상업적 이용·변경 가능. 출처 표시 필요. 확장자 SHP, 전국 약 665만 행. 다운로드는 기관 페이지 [브이월드 데이터마트 dsId=18](https://www.vworld.kr/dtmk/dtmk_ntads_s002.do?svcCde=NA&dsId=18) | 아니오. 이 VM에서 브이월드 접속이 끊겼고(`curl` connection died), `VWORLD_KEY`·`.env.local` 없음 |
| 같은 자료 WMS/WFS (공공데이터포털 [15123970](https://www.data.go.kr/data/15123970/openapi.do)) | 페이지 문구는 "이용허락범위 제한 없음". 호출은 서비스 키가 있는 OpenAPI | 아니오. 키 없이 `api.vworld.kr` 도 접속 실패. 키를 넣어 호출하지 않음 |
| 코리더 본선에 이미 있는 보정 | `public/corridor/index.json` attribution 과 `scripts/building-colours.mjs` 주석. 높이 보정 원본 타일 캐시는 이 저장소에 없음 (`--vworld=` 로 넘기는 폴더). 그 스크립트는 외벽색 추정용이고 높이 필드가 아님 | 캐시 폴더 없음 |

공공누리 제1유형이면 출처를 적고 높이를 보탤 수 있다. **받을 파일이 없어서 보정 단계는 넣지 않았다.** 강남 타일 `meta.attribution` 은 OSM ODbL 만 적는다. 브이월드 출처 문구를 화면에 넣지 않는다.

## 나중에 보정하려면

1. 브이월드 데이터마트에서 강남·서초 시군구 SHP 를 받거나, 데이터포털 활용 승인 뒤 WFS/`LT_C_BLDGINFO` 를 `VWORLD_KEY` 로 받는다. 키는 `.env.local` 에만 두고 커밋하지 않는다.
2. 건물 풋프린트와 맞춘 뒤 OSM 에 `height`·`building:levels` 가 없는 동만 `hg`(또는 층수×3.2)로 채운다. OSM 값이 있으면 OSM 을 유지한다.
3. 출처 문구: `건물 높이: 국토교통부 GIS건물통합정보 (브이월드, 공공누리 제1유형)`.
4. `npm run corridor:gangnam` 을 다시 돌려 `test-gangnam.mjs` 가 커밋된 타일과 같게 맞춘다.
