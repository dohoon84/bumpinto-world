# perf-memory: 메모리·draw call 최적화

기본은 모두 켜짐. URL 파라미터로 끌 수 있고, 끄면 develop 과 같은 동작이다.

| 플래그 | 끄면 |
|---|---|
| `?perfmem=0` | 아래 전부 끔 (`mountPerfMem` 이 null, 지역 레지스트리 없음) |
| `?lazyregion=0` | 판교 고가차도(pangyo-express)·판교 NPC 를 처음부터 만든다(예전과 같음) |
| `?meshmerge=0` | 정적 소품 병합 + 아바타·자전거 자동 인스턴싱 끔 |
| `?matshare=0` | 병합 시 '값이 같은 재질' 묶기·색 정점 굽기 끔 (재질 객체가 같은 것끼리만 병합) |
| `?propcull=0` | 안개 끝 밖/1px 미만 소품 숨기기 끔 |
| `?perfcheck=1` | (검증용) 병합 원본을 숨긴 채 남겨 두고 `__jj.perfmem.check()` 로 원본이 나중에 움직였는지 확인 |

## 구조 (`src/perf/`)

- `flags.js` — 플래그 해석.
- `hide.js` — 렌더에서만 빼기. `visible` 은 건드리지 않고 `layers.mask=0` (이유별 비트, 모두 풀리면 원래 mask 복원). 게임 코드의 visible 토글과 충돌 없음.
- `mergeStatic.js` — 지정한 루트(`MERGE_TARGETS`: 탄천 반려견 놀이터·징검다리·정자역 광장·스타벅스 손님/창살) 안의 정적 메시를 재질별로 하나로 합친다. `userData.rig`(아바타), `userData.perfDynamic`(문·페달·공 등 움직이는 것) 하위는 건드리지 않는다(perfDynamic 그룹 안에서는 그 그룹 로컬로만 합침). matshare 가 켜지면 색만 다른 람버트/퐁/스탠다드 재질은 정점색으로 구워 한 버킷으로.
- `instancer.js` — 같은 지오메트리를 쓰는 움직이는 소품(아바타 리그, 세워 둔 자전거, 6–400개 메시 소그룹)을 부품별 `InstancedMesh` 로 그린다. 원본 계층·애니메이션은 그대로이고 원본 메시는 `hide.js` 로 빠진다. `scene.onBeforeRender`(matrixWorld 갱신 후, 컬링 전)에서 원본 행렬을 복사 → 같은 프레임. 루트 단위 절두체 컬링. 떠난 루트만 쓰던 부품은 1초마다 정리(geometry 참조 해제).
- `propCull.js` — scene 바로 아래 소품 덩어리 중 (꼭대기 40m 미만이면서) 가장 가까운 점이 `fog.far×1.02` 밖이거나, 화면 반지름 0.5px 미만이면 렌더에서 뺀다. 선형 안개에서 fog.far 밖은 안개색과 구분되지 않으므로 화면 결과가 같다. `fog:false` 재질은 건드리지 않음.
- `regions.js` — 지역 지연 로드/해제 레지스트리(아래).
- `lazyCrowd.js` — `createCorridorLife` 의 `extraCrowd` 훅(register/render)을 지연 로드로 감싼다. load 때 진짜 crowd 를 만들고 공유 아바타 풀을 키우며(`buildCrowd().grow()`), unload 때 dispose + `unregister`.
- `index.js` — `mountPerfMem()`: 위를 묶어 `scene.onBeforeRender` 에 건다. `window.__jj.perfmem.summary()` 로 상태 확인.

## 지역 지연 로드 훅 (`corridor.regions`)

`createCorridor()` 가 돌려주는 객체에 `regions` 가 있다(`?lazyregion=0`·`?perfmem=0` 이면 `null`). 플레이어 위치와 진행 방향(초당 이동량 × 6초 앞)을 0.5초마다 넘기고, 텔레포트(`preload`)는 바로 넘긴다.

```js
const off = corridor.regions?.register({
  id: 'my-region',
  boxes: [{ x0, x1, z0, z1 }],   // 월드 x/z 상자(여러 개 가능)
  near: 600,                     // 상자에서 이 거리 안(또는 6초 뒤 예상 위치가 안)이면 onEnter
  far: 1000,                     // 이 거리 밖이면 onLeave (near 보다 커야 깜빡임 없음)
  onEnter: async () => { /* fetch JSON, 메시 만들어 add */ },
  onLeave: () => { /* remove + geometry/material/texture dispose, 참조 버리기 */ },
});
```

판교 적용: `pangyo-express`(고가차도 메시, near = LOD 거리+300m, far = +900m), `pangyo-npc`(판교 직장인 NPC 96명·라벨·pangyo-npc.json, `pangyo/index.json` 의 `meta.boxes`, near 350m, far 800m). 코리더 타일 자체는 원래부터 거리 기준으로 스트리밍·dispose 된다.

### 미금이 붙는 법 (#17–#19 머지 후)

미금 지역 데이터(`migeum/index.json`)도 판교처럼 `meta.boxes` 를 갖도록 하고, 미금 전용 무거운 것(NPC·역 내부·랜드마크 등 코리더 타일 밖에서 따로 만드는 것)을 만드는 곳에서:

```js
if (corridor.regions && corridorData.migeum?.meta?.boxes) {
  let mg = null;
  corridor.regions.register({
    id: 'migeum', boxes: corridorData.migeum.meta.boxes, near: 600, far: 1000,
    onEnter: () => { mg = buildMigeumThing(corridorData.migeum); root.add(mg.group); },
    onLeave: () => { root.remove(mg.group); mg.dispose(); mg = null; },
  });
} else { /* 예전처럼 바로 만들기 */ }
```

NPC 처럼 `extraCrowd` 훅을 쓰는 것은 `lazyExtraCrowd(() => createMigeumNpc(...))` 로 감싸 `pangyo-npc` 와 같은 방식으로 등록한다. 새 정적 소품 그룹은 이름을 붙여 `MERGE_TARGETS` 에 추가하면 병합된다(움직이는 부분엔 `userData.perfDynamic = true`).

## 테스트

`npm run perf:test` — 플래그, hide, 지역 레지스트리, lazy crowd, 병합, 인스턴서, propCull 단위 테스트.
