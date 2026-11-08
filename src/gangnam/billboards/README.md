# 강남 화면 (임시)

미디어폴·전광판 **자리**는 `placements.js` (출구 기준 규칙, OSM 광고 좌표 아님).  
**그림**은 이 폴더의 `manifest.js` 한 파일이 화면 id → 경로로 연결한다.

## 그림을 바꾸는 법

1. `manifest.js` 의 `SCREENS[id].src` 를 바꾼다.
   - 내장 칸: `builtin:bump` · `builtin:world` · `builtin:bump24` · `builtin:gradient`
   - 파일: `/corridor/gangnam/screens/이름.png` (또는 `.webp`). 가로로 긴 그림이 그 칸에 맞춰 들어간다.
2. 여러 장을 돌리려면 `schedule: ['경로1', '경로2']`. 한 장만이면 `schedule` 을 지운다. 전환은 4초(`FRAME_SEC`).
3. 새 화면 자리를 늘리려면 `rules.js` 의 `designScreens` 에 넣고 `node scripts/corridor/build-gangnam-night.mjs` 로 `placements.js` 를 다시 굽는다. `SCREENS` 에 같은 id 를 넣는다. 둘은 짝이 맞아야 한다 (`test-gangnam-night.mjs`).

텍스처는 화면마다 따로 만들지 않는다. 전부 아틀라스 1장에 그려 메시 1개로 그린다.

## 지금 그림

기본 `src` 는 공식 CI `bumpinto-logo.png`(파란 둥근 B, 지구, 빨간 핀). 화면보다 작게 689:768 로 넣고 여백은 PNG 바탕과 같은 `#fefefe`(다른 그림으로 바꾸면 `faces.js` 의 `LOGO_PAD_COLOR` 도 그 그림 바탕색으로). 로고는 늘리거나 색을 바꾸지 않는다.
`schedule` 에 `builtin:world` · `builtin:bump24` · `builtin:gradient` 를 두면 4초마다 글자 슬라이드가 섞인다. `builtin:bump` 임시 글자는 없다.

폴 중심 4m 안에는 가로수를 심지 않는다 (`clearance.js`).

최종 그림을 바꾸려면 `src` 경로만 갈아 끼우면 된다.
