import { inWorldBounds } from './islands.js'; // [gangnam] 섬이 있으면 그 사각형들 안

// [arrivefix] #43 역 이동·역 입장 때 정자역(기본 스폰)을 거쳐 보이는 문제.
//   켜짐(기본): 역을 골라 들어오면 ① 숨긴 채로 그 역 출구 좌표에 먼저 세우고 ② 그 역 타일이 다 지어져 도착할 때까지
//   (최대 ARRIVE_MAX_MS) 로딩 화면을 유지한 뒤 ③ 보여 준다. 도착 전에는 위치 저장(서버·이어하기)과 위치 송신을 멈춘다.
//   ?arrivefix=0|off 이면 예전 동작(이 탭에서 기억, ?arrivefix=1 로 다시 켬).
// [pickfirst] #42 로그인·입장에서 직접 고른 역이 이어하기 자리(bw.uiv2.resume.v1 · gateOpts.place)와
//   서버 마지막 위치(session.place)보다 우선. 저장 위치는 '계속하기/이어하기' 이거나 역을 고르지 않은 재입장에서만.
//   ?pickfirst=0|off 이면 예전 순서(이 탭에서 기억, ?pickfirst=1 로 다시 켬).
export const ARRIVE_MAX_MS = 8000;
const KEY = 'bw.arrivefix';
const PICK_KEY = 'bw.pickfirst';
const OFF = new Set(['0', 'off', 'false', 'no']);

function flagEnabled(name, key, search, store) {
  const q = new URLSearchParams(search).get(name);
  try {
    if (q != null) { if (OFF.has(q.toLowerCase())) store?.setItem(key, 'off'); else store?.removeItem(key); }
    if (q == null && store?.getItem(key) === 'off') return false;
  } catch { /* 저장소가 막혀 있으면 주소만 본다 */ }
  return !(q != null && OFF.has(q.toLowerCase()));
}

export function arriveFixEnabled(search = typeof location !== 'undefined' ? location.search : '', store = typeof sessionStorage !== 'undefined' ? sessionStorage : null) {
  return flagEnabled('arrivefix', KEY, search, store);
}

export function pickFirstEnabled(search = typeof location !== 'undefined' ? location.search : '', store = typeof sessionStorage !== 'undefined' ? sessionStorage : null) {
  return flagEnabled('pickfirst', PICK_KEY, search, store);
}

const inBounds = (p, b) => inWorldBounds(p, b);

/**
 * 입장 위치 고르기 (순수 — game.js completeWorldJoin 이 쓴다).
 * @param {object} o
 * @param {{x:number,z:number}|null} o.resume   그만둔 자리(ui-v2 이어하기)
 * @param {{x0,x1,z0,z1}|null} o.bounds         지도 범위
 * @param {(x:number,z:number)=>boolean} [o.inWater]
 * @param {boolean} o.picked                    지구본·역 선택으로 직접 고른 입장
 * @param {boolean} [o.continued]               '계속하기'·'이어하기' — 저장 위치를 쓴다 (고른 역 출구보다 우선)
 * @param {object|null} o.sessionPlace          서버에 저장된 마지막 위치
 * @param {string|null} o.at                    고른 코리더 역 id
 * @param {(id:string)=>({x?:number,z?:number,home?:boolean}|null)} [o.placeOf] 역 id → 목적지(출구 좌표)
 * @param {boolean} [o.fix]                     arrivefix 켜짐
 * @param {boolean} [o.pickFirst]               직접 고른 역이 저장 위치보다 우선 (#42). false 면 예전 순서
 * @returns {{kind:'resume'|'session'|'station'|'default', x?:number, z?:number, at:string|null, hidden:boolean, stay?:boolean}}
 *   kind 'station' = 정자 기본 위치 대신 그 역 출구 좌표에 숨긴 채로 세우고 도착 뒤 보여 준다.
 *   session.stay = 그 자리가 최종 위치(이어서 역 출구로 다시 옮기지 않음).
 */
export function entrySpawn({ resume = null, bounds = null, inWater = null, picked = false, continued = false, sessionPlace = null, at = null, placeOf = null, fix = true, pickFirst = true } = {}) {
  const resumed = !!resume && [resume.x, resume.z].every(Number.isFinite) && inBounds(resume, bounds) && !inWater?.(resume.x, resume.z);
  const station = () => {
    if (!(fix && at)) return null;
    const d = placeOf?.(at);
    if (d && !d.home && Number.isFinite(d.x) && Number.isFinite(d.z)) return { kind: 'station', x: d.x, z: d.z, at, hidden: true };
    return null;
  };
  // ?pickfirst=0: 예전 순서. 이어하기 자리가 고른 역보다 우선하고, 서버 위치는 '직접 고르지 않은' 입장에서만.
  if (!pickFirst) {
    if (resumed) return { kind: 'resume', x: resume.x, z: resume.z, at: null, hidden: false };
    if (sessionPlace && !picked) return { kind: 'session', at, hidden: false };
    return station() || { kind: 'default', at, hidden: false };
  }
  // 저장 위치는 '계속하기/이어하기' 이거나, 역을 고르지 않은 재입장(?enter=1 · ?passport=1, at 없음)에서만.
  // 역을 직접 고르면(게이트 · ?at=) 그 출구. 정자(home)·모르는 역은 기본 스폰이고, 저장 위치로 되돌리지 않는다.
  const allowSaved = continued || (!picked && !at);
  if (!allowSaved) return station() || { kind: 'default', at, hidden: false };
  if (resumed) return { kind: 'resume', x: resume.x, z: resume.z, at: null, hidden: false };
  if (sessionPlace && (continued || !picked)) return { kind: 'session', at: null, hidden: false, stay: true };
  return station() || { kind: 'default', at, hidden: false };
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
