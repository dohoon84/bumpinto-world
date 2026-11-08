// [traffic-fix] 교착(gridlock) 해소 플래그 — 기본 켬. ?trafficfix=0|off|false 이면 모든 차량 시스템이 예전 동작 그대로
//   정자 일반 차량·택시(jzTraffic) · 코리더 차량(corridor/traffic) · 미금 차량(migeumNpc) · 버스 시뮬(busSource) 공통
export const parseTrafficFix = (params) => { const v = params?.get?.('trafficfix'); return !(v === '0' || v === 'off' || v === 'false'); };
