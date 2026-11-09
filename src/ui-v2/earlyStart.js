// [ui-v2] index.html 의 #bw-early-start — JS(game 번들)가 오기 전에 로그인 껍데기를 보여 준다.
//   시작화면(openStart)이 뜨거나, 시작을 건너뛰는 경로(?shot · ?enter · 모바일…)에서 dismiss 한다.
//   사용자가 껍데기에서 누른 버튼은 pending 으로 넘긴다(게스트 → 바로 게이트, Google → 시작화면에서 이어 시도).

export function takeEarlyPending() {
  const api = typeof window !== 'undefined' ? window.__bwEarlyStart : null;
  const pending = api?.pending || null;
  if (api) api.pending = null;
  return pending;
}

export function dismissEarlyStart() {
  const root = document.getElementById('bw-early-start');
  document.body.classList.remove('bw-early-start');
  if (!root) return;
  root.classList.add('is-leaving');
  window.setTimeout(() => root.remove(), 220);
  try { if (window.__bwEarlyStart) window.__bwEarlyStart.alive = false; } catch { /* noop */ }
}
