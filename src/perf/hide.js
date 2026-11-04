// [perf-memory] 렌더에서만 빼기: Object3D.layers 의 0번 비트를 끈다 (visible 은 건드리지 않음 → 게임 코드의 visible 토글과 충돌 없음).
//   이 저장소에서 layers 를 쓰는 코드는 없다(perf 모듈 제외). 이유(reason)별로 겹쳐 숨길 수 있고, 모든 이유가 풀리면 원래 mask 로 돌아온다.
//   layers 는 그 객체 자신에만 적용(자식은 따로) → 메시마다 부른다. 그림자 패스도 같은 layers 로 빠진다.
const state = new WeakMap(); // obj -> { mask, reasons:Set }
export function setHidden(o, reason, on) {
  let s = state.get(o);
  if (on) {
    if (!s) { s = { mask: o.layers.mask, reasons: new Set() }; state.set(o, s); }
    if (s.reasons.has(reason)) return;
    s.reasons.add(reason); o.layers.mask = 0;
  } else if (s && s.reasons.delete(reason) && !s.reasons.size) {
    o.layers.mask = s.mask; state.delete(o);
  }
}
export const isHiddenBy = (o, reason) => !!state.get(o)?.reasons.has(reason);
export const isPerfHidden = (o) => state.has(o);
// clone(true) 로 숨긴 메시를 복제하면 layers.mask=0 이 따라간다 → 우리 표에 없는 mask 0 은 기본값(1)으로 되돌린다
export function repairClone(o) { if (o.layers.mask === 0 && !state.has(o)) { o.layers.mask = 1; return true; } return false; }
