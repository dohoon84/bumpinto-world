// [migeum-sub] 게임 지하철 역 목록 (런타임 플래그 반영) — 지하철 코드는 stationsData.js 대신 여기서 STATIONS 를 가져온다.
//   stationsData.js 의 확장 역(ext 필드, 지금은 미금)은 플래그가 꺼지면 빠진다 → 꺼진 상태 = 확장 전과 같은 역 목록·같은 계산.
//     ?migeumsub=0  미금 지하철만 끔 (지상 미금 지역은 그대로)
//     ?migeum=0     미금 전체(지상 지역 포함) 끔 → 지하철도 끔
//   Node(테스트·e2e 스크립트): 환경변수 MIGEUMSUB=0 / MIGEUM=0 으로 끔 (기본 켬)
import { STATIONS as ALL } from './stationsData.js';

export function migeumSubEnabled(search = typeof location !== 'undefined' ? location.search : null) {
  if (search == null) {
    const env = typeof process !== 'undefined' ? process.env || {} : {};
    return env.MIGEUM !== '0' && env.MIGEUMSUB !== '0';
  }
  const p = new URLSearchParams(search);
  return p.get('migeum') !== '0' && p.get('migeumsub') !== '0';
}
// [gangnam] ?gangnamsub=0 강남 지하철만 끔. ?gangnam=0 이면 지상과 함께 지하철도 끔.
//   Node: GANGNAMSUB=0 / GANGNAM=0
export function gangnamSubEnabled(search = typeof location !== 'undefined' ? location.search : null) {
  if (search == null) {
    const env = typeof process !== 'undefined' ? process.env || {} : {};
    return env.GANGNAM !== '0' && env.GANGNAMSUB !== '0';
  }
  const p = new URLSearchParams(search);
  return p.get('gangnam') !== '0' && p.get('gangnamsub') !== '0';
}
const EXT_ON = { migeum: migeumSubEnabled(), gangnam: gangnamSubEnabled() };
// 확장 전 역 목록 (ext 없는 역) — 기존 역 시간표 기준(ride.js lineOffsets)은 늘 이것으로 잰다
export const STATIONS_BASE = Object.freeze(ALL.filter((s) => !s.ext));
export const STATIONS = Object.freeze(ALL.filter((s) => !s.ext || EXT_ON[s.ext]));
export const EXT_STATIONS = Object.freeze(STATIONS.filter((s) => s.ext));
