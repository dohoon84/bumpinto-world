// [memory] 매장 안에 있는 동안 바깥 월드의 CPU 페이로드(정점 배열·캔버스 픽셀)를 내린다.
//   evictGpu 는 GPU 캐시만 비우고, 이미지·Float32Array 는 JS 힙에 남는다.
//   폰은 이 힙이 ~500MB 라서 스토리·카트 효과가 더해지면 탭이 죽는다.
//   내린 메시는 다시 그릴 수 없으니, 호출 쪽이 나갈 때 월드 루트를 재생성한다.

export function dropCpu(root) {
  if (!root) return;
  const seenG = new Set(), seenT = new Set();
  const empty = (arr) => {
    if (!arr || !arr.constructor) return arr;
    try { return new arr.constructor(0); } catch { return arr; }
  };
  const dropTex = (t) => {
    if (!t || !t.isTexture || seenT.has(t)) return;
    if (t.isRenderTargetTexture || t.isPMREMTexture || t.isDepthTexture) return;
    seenT.add(t);
    const img = t.image || t.source?.data;
    try { t.dispose(); } catch { /* 이미 내려간 텍스처 */ }
    if (img) {
      try {
        if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) {
          img.width = 1; img.height = 1;
        } else if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) {
          img.close?.();
        }
      } catch { /* 캔버스 해제 실패 */ }
    }
    try { t.image = null; } catch { /* */ }
    try { if (t.source) t.source.data = null; } catch { /* */ }
  };
  root.traverse((o) => {
    if (o.geometry && !seenG.has(o.geometry)) {
      seenG.add(o.geometry);
      const g = o.geometry;
      try { g.dispose(); } catch { /* */ }
      for (const k of Object.keys(g.attributes || {})) {
        const a = g.attributes[k];
        if (a) { a.array = empty(a.array); a.count = 0; }
      }
      if (g.index) { g.index.array = empty(g.index.array); g.index.count = 0; }
    }
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (!m) continue;
      for (const k of Object.keys(m)) dropTex(m[k]);
    }
  });
  dropTex(root.environment);
  dropTex(root.background);
}

export function clearGroup(root) {
  if (!root) return;
  dropCpu(root);
  const kids = root.children.slice();
  for (const ch of kids) {
    root.remove(ch);
    ch.traverse((o) => { o.geometry = null; o.material = null; });
  }
}
