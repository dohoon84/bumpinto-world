// [ui-v2] 그만둔 자리에서 이어하기: 마지막 '발 위치'를 몇 초마다 + 페이지를 떠날 때 작은 localStorage 키에 저장한다.
//   키 bw.uiv2.resume.v1 = { [who|region]: { x, y, z, ry, t } } (최대 8개, 오래된 것부터 버림)
//   who = 'a:{accountId}'(로그인 계정) | 'g:{기기 id}'(게스트). region = 이 페이지 월드(정자·…).
//   탑승 중(버스·택시)·지하(대합실·승강장·열차)·입장 전(게이트·입장 카드)에는 저장하지 않는다 → 마지막 발 위치가 남는다.
//   읽을 때: 7일 이내 · 숫자 정상 · (지도 범위 검사는 월드가 다 지어진 뒤 game.js completeWorldJoin 이 한다).
//   그리기·메모리 추가 없음(4초 타이머 1개, 바뀌었을 때만 쓰기).
import { deviceId } from '../sms.js';

const KEY = 'bw.uiv2.resume.v1';
const MAX_AGE_MS = 7 * 24 * 3600e3;
const MAX_ENTRIES = 8;
const EVERY_MS = 4000;

export const whoOf = (ses) => (ses && !ses.isGuest && ses.accountId ? `a:${ses.accountId}` : `g:${deviceId()}`);

function readAll() { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }

/** 저장된 위치 검사 (순수 — 테스트용). 범위 b 가 있으면 그 안이어야 한다 */
export function validPlace(p, { now = Date.now(), maxAge = MAX_AGE_MS, bounds = null } = {}) {
  if (!p || ![p.x, p.y, p.z, p.ry, p.t].every(Number.isFinite)) return false;
  if (now - p.t > maxAge || p.t > now + 60e3) return false;
  if (bounds && !(p.x >= bounds.x0 && p.x <= bounds.x1 && p.z >= bounds.z0 && p.z <= bounds.z1)) return false;
  return true;
}

/** @returns {{x:number,y:number,z:number,ry:number,t:number} | null} — since(ms) 보다 오래된 위치면 null (그 뒤에 다른 역을 골랐다는 뜻) */
export function readResume(who, region, { since = 0, now = Date.now() } = {}) {
  const p = readAll()[`${who}|${region}`];
  if (!validPlace(p, { now })) return null;
  if (since && p.t + 2000 < since) return null;
  return { x: p.x, y: p.y, z: p.z, ry: p.ry, t: p.t };
}

export function writeResume(who, region, p, now = Date.now()) {
  if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) return;
  try {
    const all = readAll();
    all[`${who}|${region}`] = { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), ry: +(p.ry || 0).toFixed(3), t: now };
    const keys = Object.keys(all).sort((a, b) => (all[b]?.t || 0) - (all[a]?.t || 0));
    for (const k of keys.slice(MAX_ENTRIES)) delete all[k];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* 저장이 막혀 있으면 역 입장으로 */ }
}

/** 게임 안(입장 완료 · 걸어 다니는 중)인지 — 저장해도 되는 순간 */
function onFoot(j) {
  const b = document.body.classList;
  if (!j?.player?.visible || b.contains('in-gate') || b.contains('in-lobby')) return false;
  if (document.getElementById('enter-loading') && !document.getElementById('enter-loading').hidden) return false;
  if (j.subway?.active || j.subway?.zone) return false; // 지하·열차 안
  if (j.ride?.active) return false; // 버스·택시 탑승 중
  return true;
}

let started = false;
/** initUiV2 가 한 번 부른다. getWho = () => who (econ 세션을 따라감) */
export function startResumeSaver(region, getWho) {
  if (started) return; started = true;
  let mark = '';
  const save = () => {
    const j = window.__jj;
    if (!onFoot(j)) return;
    const p = j.player.position, ry = j.player.rotation.y;
    const here = `${p.x.toFixed(1)},${p.z.toFixed(1)},${ry.toFixed(2)}`;
    const who = getWho();
    if (`${who}|${here}` === mark) return;
    mark = `${who}|${here}`;
    writeResume(who, region, { x: p.x, y: p.y, z: p.z, ry });
  };
  setInterval(save, EVERY_MS);
  addEventListener('pagehide', save);
  addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  return save;
}
