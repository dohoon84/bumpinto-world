// [perf-memory] 렌더에서만 빼기: Object3D.layers 의 0번 비트를 끈다 (visible 은 건드리지 않음 → 게임 코드의 visible 토글과 충돌 없음).
//   이 저장소에서 layers 를 쓰는 코드는 없다(perf 모듈 제외). 이유(reason)별로 겹쳐 숨길 수 있고, 모든 이유가 풀리면 원래 mask 로 돌아온다.
//   layers 는 그 객체 자신에만 적용(자식은 따로) → 메시마다 부른다. 그림자 패스도 같은 layers 로 빠진다.
// 메모리: 숨긴 메시가 수만 개라 객체마다 {mask, Set} 을 두지 않고, 이유를 비트로 접어 숫자 하나만 저장한다.
const state = new WeakMap(); // obj -> reason bits (number)
const origMask = new WeakMap(); // obj -> 원래 mask (기본값 1 이 아닐 때만)
const bitOf = new Map(); // reason -> bit
const bit = (r) => { let b = bitOf.get(r); if (b === undefined) { if (bitOf.size >= 30) throw new Error('perf hide: too many reasons'); b = 1 << bitOf.size; bitOf.set(r, b); } return b; };
export function setHidden(o, reason, on) {
  const b = bit(reason);
  const cur = state.get(o) || 0;
  if (on) {
    if (cur & b) return;
    if (!cur) { const m = o.layers.mask; if (m !== 1) origMask.set(o, m); }
    state.set(o, cur | b); o.layers.mask = 0;
  } else if (cur & b) {
    const nx = cur & ~b;
    if (nx) { state.set(o, nx); return; }
    state.delete(o);
    const m = origMask.get(o); o.layers.mask = m === undefined ? 1 : m; origMask.delete(o);
  }
}
export const isHiddenBy = (o, reason) => !!((state.get(o) || 0) & bit(reason));
export const isPerfHidden = (o) => state.has(o);
// clone(true) 로 숨긴 메시를 복제하면 layers.mask=0 이 따라간다 → 우리 표에 없는 mask 0 은 기본값(1)으로 되돌린다
export function repairClone(o) { if (o.layers.mask === 0 && !state.has(o)) { o.layers.mask = 1; return true; } return false; }
