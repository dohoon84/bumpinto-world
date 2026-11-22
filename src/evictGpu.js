// [memory] 장면에서 GPU 에 올라가 있는 지오메트리·텍스처만 내려, JS 객체는 그대로 둔다.
//   Texture/BufferGeometry 의 dispose() 는 렌더러 캐시만 비우고, 이미지·속성 배열은 남는다.
//   다음에 같은 장면을 그리면 Three.js 가 GPU 로 다시 올린다. 렌더 타깃(PMREM 등)은 재업로드가 안 되므로 건드리지 않는다.
// [depot-leave] 업로드 뒤 CPU 배열을 버린 지오메트리(예: world/bridgeLights.js 의 onUpload(drop))도 마찬가지 —
//   GPU 에서 내리면 다음 render() 가 array=null 을 다시 올리려다 TypeError 를 던지고, 그 throw 가 game.js frame() 의
//   requestAnimationFrame 고리를 끊어 '매장 화면에 멈춤'(상태는 나왔는데 그림만 그대로)이 됐다. 그런 지오메트리는 그대로 둔다.
export function canReupload(g) {
  if (!g) return false;
  if (g.index && g.index.array == null) return false;
  for (const k in g.attributes) {
    const a = g.attributes[k];
    if ((a.isInterleavedBufferAttribute ? a.data?.array : a.array) == null) return false;
  }
  for (const k in g.morphAttributes || {}) for (const a of g.morphAttributes[k] || []) if ((a.isInterleavedBufferAttribute ? a.data?.array : a.array) == null) return false;
  return true;
}
export function evictGpu(root) {
  if (!root) return;
  const seen = new Set();
  const evictTex = (t) => {
    if (!t || !t.isTexture || seen.has(t)) return;
    // 렌더 타깃·PMREM 은 dispose 하면 되살릴 소스 이미지가 없다
    if (t.isRenderTargetTexture || t.isPMREMTexture || t.isDepthTexture) return;
    // [mobile-profile] 업로드 뒤 CPU 화상을 버린 텍스처(dropCpuSourcesAfterUpload)는 GPU 에서 내리면 다시 올릴 화상이 없다
    if (t.userData?.bwCpuDropped || (!t.image && !t.source?.data)) return;
    seen.add(t);
    try { t.dispose(); } catch { /* 이미 내려간 텍스처 */ }
  };
  root.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) {
      seen.add(o.geometry);
      if (canReupload(o.geometry)) { try { o.geometry.dispose(); } catch { /* */ } }
    }
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (!m) continue;
      for (const k in m) evictTex(m[k]);
    }
  });
  evictTex(root.environment);
}
