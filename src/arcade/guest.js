// [arcade] 게스트 판정 — 서버가 분명히 말하기 전에는 이미 로그인된 사람을 손님으로 보지 않는다.
//   입장 카드(lobby.js)가 붙인 body.bw-signed-in 을 우선하고,
//   /arcade/status 가 시간 초과·로컬 폴백·오류일 때는 guest:true 로 단정하지 않는다.

export function clientSignedIn() {
  try { return typeof document !== 'undefined' && document.body.classList.contains('bw-signed-in'); }
  catch { return false; }
}

export function isGuestFlag(guest) {
  try { return typeof guest === 'function' ? !!guest() : !!guest; }
  catch { return !!guest; }
}

/**
 * @param {object|null|undefined} gate provider.gate() 결과 (timedOut/local 이면 단정하지 않음)
 * @param {{ prev?: boolean, signedIn?: boolean }} opts
 */
export function resolveGuest(gate, { prev = true, signedIn = false } = {}) {
  if (signedIn) return false;
  if (gate && !gate.timedOut && !gate.local && typeof gate.guest === 'boolean') return gate.guest;
  return prev;
}
