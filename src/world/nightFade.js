// [night] 저녁 불빛 공용 페이드 값 0..1 (evening.js 저녁 여부를 dur 초에 걸쳐 따라감).
//   매 프레임 갱신할 필요 없이 nightFade() 를 부르면 그 순간 값을 계산한다. 다리 조명 등 장식 조명이 같이 쓴다.
//   onNightTarget(fn): 목표가 바뀔 때 (1=켜지는 중, 0=꺼지는 중) — 꺼진 메시를 다시 보이게 할 때 사용
import { watchEvening } from '../evening.js';

const DUR = 4; // 초
let from = 0, target = 0, t0 = 0, watching = false;
const subs = new Set();
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

function ensure() {
  if (watching) return; watching = true;
  watchEvening((on) => {
    const v = nightFade(); from = v; target = on ? 1 : 0; t0 = now();
    for (const fn of subs) fn(target);
  });
}
export function nightFade() {
  const k = Math.min(1, Math.max(0, (now() - t0) / DUR));
  return from + (target - from) * k;
}
export function nightTarget() { ensure(); return target; }
export function onNightTarget(fn) { ensure(); subs.add(fn); fn(target); return () => subs.delete(fn); }
