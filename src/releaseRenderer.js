// [memory] 로비·글로브처럼 한 번 쓰고 버리는 WebGLRenderer 정리.
//   dispose() 만으로는 WebGL 컨텍스트(프레임버퍼·MSAA 버퍼)가 GC 될 때까지 남는다. forceContextLoss() 로 즉시 반환하되,
//   컨텍스트를 잃으면 캔버스가 비므로 '화면에서 사라진 뒤'(분리되었거나 display:none)에만 실행한다 → 보이는 변화 없음.
//   로비·글로브는 다시 열 때 innerHTML 로 새 캔버스를 만들므로 잃은 컨텍스트를 재사용하지 않는다.
export function releaseRenderer(renderer, { pollMs = 500, maxMs = 120000 } = {}) {
  if (!renderer || renderer.__released) return;
  renderer.__released = true;
  renderer.dispose();
  const el = renderer.domElement, t0 = performance.now();
  const gone = () => !el.isConnected || el.getClientRects().length === 0;
  const tick = () => {
    if (gone()) { try { renderer.forceContextLoss(); } catch { /* 이미 잃은 컨텍스트 */ } return; }
    if (performance.now() - t0 < maxMs) setTimeout(tick, pollMs);
  };
  setTimeout(tick, 0);
}
