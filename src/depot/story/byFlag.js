// [depot-story] 2주차 반응(R70 등) who: 'byFlag' — 1주차 엔딩(flag.w1Ending)에 따라 화자·대사를 고름. JSON 없이 node 테스트 가능.
/** who: 'byFlag' 반응(R70 등) → flag 값(A/B)에 맞는 화자·표정·대사로 바꾼 사본. 맞는 값이 없으면 null(안 나옴) */
export function byFlagPick(r, getFlag) {
  if (!r || r.who !== 'byFlag' || !r.byFlag) return r;
  const v = getFlag(String(r.byFlag.flag || '').replace(/^flag\./, '')), b = v != null ? r.byFlag[String(v)] : null;
  if (!b || !b.who || !b.lines) return null;
  return { ...r, who: b.who, expression: b.expression || r.expression, lines: Array.isArray(b.lines) ? { 1: b.lines } : b.lines };
}
