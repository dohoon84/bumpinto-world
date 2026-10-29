# 🔊 Admin Cruiser 배기음 애드온 — 병합 가이드

녹음/샘플 없이 **코드로 합성**한 배기음 2종 (저작권·라이선스 이슈 없음). 합성기: `scripts/synth-bike-audio.py` (numpy/scipy + ffmpeg).

## 파일
| 파일 | 길이 | 크기 | 내용 |
|---|---|---|---|
| `public/audio/bike_idle.ogg` / `.mp3` | 4.000 s | 20 KB / 41 KB | 공회전 루프, 960 rpm |
| `public/audio/bike_ride.ogg` / `.mp3` | 4.000 s | 24 KB / 41 KB | 주행 배기 루프, 2,910 rpm |
- 44.1 kHz 모노, Vorbis q2 / MP3 80 kbps. 라우드니스 약 -14 LUFS (idle -14.4, ride -14.0), 피크 ≤ -1 dBFS.
- `src/entities/bikeAudio.js` (신규) — 재생 모듈. `src/entities/adminBike.js`·`src/main.js` 에 `// [bikeaudio]` 최소 수정.
- `scripts/analyze-bike-audio.py` — 검증/스펙트로그램 생성. `spectrogram_bike_*.png`, `report.json`.
- `bikeaudio.patch` — 바이크 애드온 적용 상태 기준 코드 패치 (오디오 바이너리는 zip 의 `public/audio/` 를 그대로 복사).

## 소리 설계
- **45° V-twin 불균등 점화**: 크랭크 0°/315° 점화 → 간격 315°·405° 반복 ("potato-potato"). 960 rpm 에서 54.7 ms / 70.3 ms.
- 배기 압력 펄스(빠른 상승 + 완만한 부압) + 펄스마다 난류 노이즈 → 머플러/배관 공명 포먼트(idle 62·118·230·470 Hz, ride 78·150·300·620·1150 Hz) + 저역통과로 디지털 버즈 억제.
- 엔진 럼블(점화에 맞춰 변조된 저역 노이즈), 타이밍/세기 지터, 공회전엔 가끔 약한 폭발(럼프), 느린 rpm 흔들림 → 기계적으로 들리지 않게.
- 주행은 더 높은 rpm·하중: 노이즈↑, 소프트 포화(tanh)로 배음↑, 더 굵고 거친 소리.
- **루프 이음새**: 루프 안에 정수 사이클 + 루프 길이에 맞춘 주기적 변조 + 원형(순환) 필터링으로 생성 → 끝과 시작이 같은 파형 흐름(크로스페이드 불필요). 디코드 후 경계 점프가 일반 샘플 변화 수준(아래 표).

| 검증(ogg 디코드) | idle | ride |
|---|---|---|
| 루프 경계 점프 / 샘플 변화 중앙값 / 99% | 0.0021 / 0.0009 / 0.0122 | 0.0021 / 0.0026 / 0.0190 |
| RMS / 피크 | -10.6 dB / -1.05 dBFS | -10.9 dB / -2.8 dBFS |
| 점화 간격 (짧음/긺, 기대값) | 54.9 / 70.0 ms (54.7 / 70.3) | 18.1 / 23.1 ms (18.0 / 23.2) |
※ 디코드 길이 ogg·mp3 모두 정확히 176,400 샘플(4.000 s). 스펙트로그램 PNG 에 파형·간격 히스토그램(두 군집 = 불균등 점화)·루프 이음새 그래프 포함.

## 동작 (bikeAudio.js)
- three.js `AudioListener`(카메라) + `PositionalAudio` 2개(머플러 마커에 부착, 바이크 따라 이동/린).
- 속도·스로틀로 equal-power 크로스페이드, playbackRate: idle 0.9–1.1, ride 0.8–1.6.
- 첫 탑승(F/버튼 = 사용자 제스처)에서 AudioContext 생성·resume. 하차 시 0.7 s 페이드아웃 후 정지(CPU 절약).
- 다른 사람이 바이크를 타면 그 위치에서도 소리 남(내가 페이지에서 한 번이라도 클릭/키 입력한 뒤부터 — 브라우저 자동재생 정책).
- `?sound=0` 비활성, **N 키 = 바이크 소리 음소거 토글**(localStorage 저장). ※ M 은 기존 '위에서 보기' 키라 N 으로 바꿨습니다.
- ogg 지원 브라우저는 ogg, 아니면 mp3 자동 선택. `__jj.bike.audio.state` 로 상태 확인.

## 연결 방법
1. zip 의 `public/audio/*` 를 프로젝트 `public/audio/` 로 복사.
2. `patch -p1 < bikeaudio.patch` (또는 `bikeAudio.js` 복사 + 아래 `// [bikeaudio]` 5곳 수동 적용):
   - adminBike.js: import, 인자에 `camera`, `createBikeAudio({ camera, anchor: U.exhaust, params })`, `mount()` 에서 `audio?.unlock()`, `update()` 에서 `audio?.update(dt, { on, v, throttle })`, API 에 `audio`.
   - main.js: `createAdminBike({ ..., camera })`.
3. 다시 만들려면 `python3 scripts/synth-bike-audio.py` (파라미터 IDLE/RIDE 딕셔너리), 검증 `python3 scripts/analyze-bike-audio.py`.

## 한계
- 합성음이라 실제 녹음만큼 사실적이진 않음(기어 변속음·흡기음·기계 잡음 없음). 귀로 들은 검증이 아니라 스펙트로그램/수치로만 검증 → 실제로 들어보고 IDLE/RIDE 파라미터 조정 권장.
- 엔진 사운드는 2개 루프 + 피치 조절이라 rpm 이 아주 높거나 낮을 때 약간 인위적일 수 있음.
- MP3 는 브라우저에 따라 루프 이음새에 아주 짧은 공백이 생길 수 있음(LAME 갭리스 헤더 포함, ffmpeg 디코드 기준 길이 정확). ogg 우선 사용.
- 원격 탑승 소리는 내 페이지에 사용자 입력이 한 번 있어야 들림. 배포하지 않았습니다.
