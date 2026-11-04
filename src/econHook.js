// [econ-ui] trigger point — 게임 교통 이벤트를 경제 UI(?ui=v2)에 알리는 한 줄짜리 훅.
//   window 에 'bw:transit' CustomEvent 만 쏜다. 듣는 쪽이 없으면(기본 UI) 아무 일도 일어나지 않는다. 요금(fare.js)은 그대로 0원.
//   detail: { mode:'bus', phase:'board', code, route, rideId } | { mode:'subway', phase:'tap' }
//         | { mode:'taxi', phase:'depart', code, meters, rideId } | { mode:'taxi', phase:'arrive', meters, rideId, dest? }
const BUS_CODE = { village: 'bus.village', seat: 'bus.seat', wide: 'bus.wide', express: 'bus.wide', circular: 'bus.circular' };
export const busFareCode = (type) => BUS_CODE[type] || 'bus.city';
export function emitTransit(detail) {
  try { window.dispatchEvent(new CustomEvent('bw:transit', { detail })); } catch { /* noop */ }
}
