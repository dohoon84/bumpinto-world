// [arrivefix] #43 역 이동·역 입장 때 정자역(기본 스폰)을 거쳐 보이는 문제.
//   켜짐(기본): 역을 골라 들어오면 ① 숨긴 채로 그 역 출구 좌표에 먼저 세우고 ② 그 역 타일이 다 지어져 도착할 때까지
//   (최대 ARRIVE_MAX_MS) 로딩 화면을 유지한 뒤 ③ 보여 준다. 도착 전에는 위치 저장(서버·이어하기)과 위치 송신을 멈춘다.
//   ?arrivefix=0|off 이면 예전 동작(이 탭에서 기억, ?arrivefix=1 로 다시 켬).
export const ARRIVE_MAX_MS = 8000;
const KEY = 'bw.arrivefix';
const OFF = new Set(['0', 'off', 'false', 'no']);

export function arriveFixEnabled(search = typeof location !== 'undefined' ? location.search : '', store = typeof sessionStorage !== 'undefined' ? sessionStorage : null) {
  const q = new URLSearchParams(search).get('arrivefix');
  try {
    if (q != null) { if (OFF.has(q.toLowerCase())) store?.setItem(KEY, 'off'); else store?.removeItem(KEY); }
    if (q == null && store?.getItem(KEY) === 'off') return false;
  } catch { /* 저장소가 막혀 있으면 주소만 본다 */ }
  return !(q != null && OFF.has(q.toLowerCase()));
}

import { inWorldBounds } from './islands.js'; // [gangnam] 섬이 있으면 그 사각형들 안
const inBounds = (p, b) => inWorldBounds(p, b);

/**
 * 입장 위치 고르기 (순수 — game.js completeWorldJoin 이 쓴다).
 * @param {object} o
 * @param {{x:number,z:number}|null} o.resume   그만둔 자리(ui-v2 이어하기)
 * @param {{x0,x1,z0,z1}|null} o.bounds         지도 범위
 * @param {(x:number,z:number)=>boolean} [o.inWater]
 * @param {boolean} o.picked                    지구본·역 선택으로 직접 고른 입장
 * @param {object|null} o.sessionPlace          서버에 저장된 마지막 위치
 * @param {string|null} o.at                    고른 코리더 역 id
 * @param {(id:string)=>({x?:number,z?:number,home?:boolean}|null)} [o.placeOf] 역 id → 목적지(출구 좌표)
 * @param {boolean} [o.fix]                     arrivefix 켜짐
 * @returns {{kind:'resume'|'session'|'station'|'default', x?:number, z?:number, at:string|null, hidden:boolean}}
 *   kind 'station' = 정자 기본 위치 대신 그 역 출구 좌표에 숨긴 채로 세우고 도착 뒤 보여 준다.
 */
export function entrySpawn({ resume = null, bounds = null, inWater = null, picked = false, sessionPlace = null, at = null, placeOf = null, fix = true } = {}) {
  const resumed = !!resume && [resume.x, resume.z].every(Number.isFinite) && inBounds(resume, bounds) && !inWater?.(resume.x, resume.z);
  if (resumed) return { kind: 'resume', x: resume.x, z: resume.z, at: null, hidden: false };
  if (sessionPlace && !picked) return { kind: 'session', at, hidden: false };
  if (fix && at) {
    const d = placeOf?.(at);
    if (d && !d.home && Number.isFinite(d.x) && Number.isFinite(d.z)) return { kind: 'station', x: d.x, z: d.z, at, hidden: true };
  }
  return { kind: 'default', at, hidden: false };
}

/** p 가 ARRIVE_MAX_MS 안에 끝나거나, 시간이 다 되면 resolve (거부도 resolve) */
export function withArriveCap(p, ms = ARRIVE_MAX_MS, timer = setTimeout) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    timer(() => fin('timeout'), ms);
    Promise.resolve(p).then(() => fin('arrived'), () => fin('error'));
  });
}
