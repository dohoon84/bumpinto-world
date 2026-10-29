# Admin Cruiser 애드온 & 개인 인벤토리

관리자 전용 크루저 바이크(`Admin Cruiser`). 원본 설명은 `MERGE_BIKE.md`·`MERGE_BIKE_AUDIO.md`, 원본 diff는 `bike.patch`·`bikeaudio.patch`, 확인용 화면과 스펙트로그램은 `shots/`에 있다.

실제로 도는 파일은 아래에 있다.

- `src/inventory.js` — 인원당 1개씩 지급되는 개인 인벤토리 (드래그 이동 가능한 동그란 플로팅 아이콘 `🎒` & 제자리 펼침 포켓 독)
- `src/entities/adminCruiser/bikeModel.js` — 절차적 모델, 연료통 색상(`red` / `black`), 뒷바퀴 축 윌리(앞바퀴 들기) 피벗
- `src/entities/adminCruiser/adminBike.js` — 인벤토리 소환/수납, F 탑승/하차, Space 앞바퀴 들기(윌리), 연기, 관리자 2명 동시 멀티플레이(`veh.id` 900/901)
- `src/entities/adminCruiser/bikeAudio.js` — 공회전/주행 루프 크로스페이드, N 음소거, `?sound=0`
- `public/audio/bike_idle.{ogg,mp3}`, `public/audio/bike_ride.{ogg,mp3}` — 배기음 루프 2종

## 개인 인벤토리 & 관리자 2명 배정

- 접속한 모든 인원은 우측 네비게이션 아래에 동그란 `🎒` 개인 인벤토리(기본 4슬롯)를 1개씩 갖는다. 아이콘은 드래그로 화면 어디로든 옮길 수 있고, 클릭하거나 `I` 키로 그 자리에서 펼칠 수 있다.
- 관리자 계정에 맞춰 서버(`isAdmin`, `bikeTank`)가 바이크 연료통 색상을 자동 배정한다:
  - **크림슨 레드 연료통 (`red`, `veh.id = 901`)**
  - **비비드 블랙 연료통 (`black`, `veh.id = 900`)**
  - 로컬 개발 환경(`localhost`)에서는 URL에 `?tank=red` 또는 `?tank=black`을 붙여 색상별로 바로 미리 볼 수 있다.
- 두 관리자가 같은 지역에서 동시에 바이크를 타더라도 각자의 연료통 색상·앞바퀴 들기·연기·배기음이 모두 동시에 표시된다.

## 조작

- 인벤토리(`🎒` 또는 `I` 키)에서 **`꺼내기`**를 누르면 내 캐릭터 옆 빈 땅에 바이크가 세워진다.
- 바이크 근처에서 **`F` 키**로 타고 내린다. 다시 인벤토리에서 **`수납`**을 누르면 바이크가 인벤토리로 들어간다.
- **`W/S/A/D` + `Shift`(부스트)**로 주행하며, 탑승 중 **`Space` 바**를 누르고 있으면 뒷바퀴 축을 기준으로 **앞바퀴를 번쩍 들며(윌리 / Wheelie)** 주행한다.
- **`N` 키**로 배기음 음소거를 토글한다 (`?sound=0`이면 소리 비활성).
