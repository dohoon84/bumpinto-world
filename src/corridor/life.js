// [corridor] 코리더 '생활' 레이어: 버스(+실시간 어댑터) · 택시/일반 차량 · 보행 NPC
//   corridor.attachLife({ proxy, mode }) 로 켠다. 데이터(transit.json, drive.json)는 시작 후 비동기로 받아 첫 화면을 늦추지 않는다.
//   시점(플레이어/오버뷰 중심)이 정자 bbox 안이면 차량·보행 NPC 는 멈추고 숨긴다(라이브 NPC/택시/버스 영역, 비용 0 에 가깝게).
//   버스 시뮬은 배차 연속성을 위해 계속 돌리되 0.25초 단위로 묶어서 갱신.
//   ?cbusgg=1 : 경기 노선도 실시간 조회(기본 끔 — 정자 라이브와 같은 경기 API 일일 한도를 나눠 쓰므로)
//   ?clife=0 끔, ?cbus=0 / ?ccars=0 / ?cwalkers=0 개별 끔
import { createCorridorBuses } from './buses.js';
import { createCorridorTraffic } from './traffic.js';

export function createCorridorLife({ root, baseUrl, crossings, terrain, terrainT, world, overlay, stations, liveBox, params, proxy, mode }) {
  let buses = null, traffic = null, ready = false, error = null;
  const inLive = (x, z) => x >= liveBox.x0 && x <= liveBox.x1 && z >= liveBox.z0 && z <= liveBox.z1;
  const get = (f) => fetch(baseUrl + f).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const wantBus = params.get('cbus') !== '0', wantCars = params.get('ccars') !== '0' || params.get('cwalkers') !== '0';
  const loading = Promise.all([wantBus ? get('transit.json') : null, wantCars ? get('drive.json') : null]).then(([T, drive]) => {
    if (T) buses = createCorridorBuses(root, T, { crossings, terrain, overlay, liveBox, proxy, mode, gg: params.get('cbusgg') === '1' });
    if (drive) traffic = createCorridorTraffic(root, { drive, crossings, terrain, terrainT, world, stations, liveBox, params, overlay, getBuses: () => nearBuses });
    ready = true;
  }).catch((e) => { error = String(e); ready = true; console.warn('[corridor] life', e); });
  let nearBuses = [], busAcc = 0;
  return {
    loading,
    get buses() { return buses; }, get traffic() { return traffic; },
    update(dt, x, z) {
      if (!ready) return;
      const live = inLive(x, z);
      if (buses) {
        if (live) {
          busAcc += dt; if (busAcc >= 0.25) { buses.source.update(busAcc, { pedLight: crossings.pedLight }, { x, z }); busAcc = 0; }
          if (buses.group.visible) { buses.group.visible = false; buses.closePanel(); }
        } else { buses.group.visible = true; buses.update(dt, x, z, false); }
        nearBuses = live ? [] : buses.near;
      }
      if (traffic) { traffic.group.visible = !live; if (!live) traffic.update(dt, x, z); }
    },
    stats: () => ({ ready, error, buses: buses?.stats() || null, traffic: traffic?.stats() || null }),
  };
}
