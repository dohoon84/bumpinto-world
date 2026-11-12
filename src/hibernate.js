// [memory] 매장 안에 있는 동안 바깥 월드의 CPU 페이로드(정점 배열·캔버스 픽셀)를 내린다.
//   evictGpu 는 GPU 캐시만 비우고, 이미지·Float32Array 는 JS 힙에 남는다.
//   폰은 이 힙이 ~500MB 라서 스토리·카트 효과가 더해지면 탭이 죽는다.
//   내린 메시는 다시 그릴 수 없으니, 호출 쪽이 나갈 때 월드 루트를 재생성한다.

// roots 밖(나머지 scene)에서 아직 쓰는 지오메트리·버퍼·텍스처 — 같이 쓰는 것(택시·공용 차량 모델 등)을 비우면
// 나와서 월드를 다시 지어도 빈 메시로 남는다. 그래서 roots 안에서만 쓰는 것만 내린다.
export function usedOutside(scene, roots) {
  const skip = new Set(roots.filter(Boolean)), keep = new Set();
  const walk = (o) => {
    if (skip.has(o)) return;
    const g = o.geometry;
    if (g) { keep.add(g); for (const a of Object.values(g.attributes || {})) if (a?.isInterleavedBufferAttribute) keep.add(a.data); }
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) if (m) for (const k of Object.keys(m)) { const t = m[k]; if (t && t.isTexture) keep.add(t); }
    for (const c of o.children) walk(c);
  };
  walk(scene);
  if (scene.environment) keep.add(scene.environment);
  if (scene.background?.isTexture) keep.add(scene.background);
  return keep;
}

export function dropCpu(root, keep = null) {
  if (!root) return;
  const seenG = new Set(keep || []), seenT = new Set(keep || []), seenB = new Set(keep || []);
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
  // InterleavedBufferAttribute 의 array·count 는 getter 뿐 → 실제 데이터(InterleavedBuffer)를 한 번만 비운다
  const dropAttr = (a) => {
    if (!a) return;
    if (a.isInterleavedBufferAttribute) {
      const d = a.data; if (!d || seenB.has(d)) return; seenB.add(d);
      d.array = empty(d.array); d.count = 0;
      return;
    }
    a.array = empty(a.array); a.count = 0;
  };
  root.traverse((o) => {
    // THREE.Sprite 는 모든 스프라이트(매장 안 포함)가 같은 4정점 interleaved 지오메트리를 공유 → 비우면 다시 못 그림. 80 바이트라 둔다.
    if (o.geometry && !o.isSprite && !seenG.has(o.geometry)) {
      seenG.add(o.geometry);
      const g = o.geometry;
      try { g.dispose(); } catch { /* */ }
      for (const k of Object.keys(g.attributes || {})) dropAttr(g.attributes[k]);
      for (const k of Object.keys(g.morphAttributes || {})) for (const a of g.morphAttributes[k] || []) dropAttr(a);
      if (g.index) dropAttr(g.index);
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

export function clearGroup(root, keep = null) {
  if (!root) return;
  dropCpu(root, keep);
  const kids = root.children.slice();
  for (const ch of kids) {
    root.remove(ch);
    ch.traverse((o) => { o.geometry = null; o.material = null; });
  }
}
