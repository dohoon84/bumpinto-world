// 셰이더·텍스처를 첫 present 전에 데운다.
//   three r158+ 의 renderer.compileAsync 와 KHR_parallel_shader_compile 을 쓴다 (이 레포 three 0.186).
//   확장이 없으면 compile() 이 동기로 돌아가고, 로딩 화면이 그 시간을 덮는다.
//   지구본(worldGate)과 월드 부트가 같은 헬퍼를 쓴다.

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'envMap'];

export function collectTextures(root) {
  const out = new Set();
  root?.traverse?.((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (!m) continue;
      for (const k of MAP_KEYS) if (m[k] && m[k].isTexture) out.add(m[k]);
    }
  });
  return [...out];
}

/**
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Object3D} scene
 * @param {import('three').Camera} camera
 * @param {{ textures?: object[], maxMs?: number, yieldFn?: () => Promise<void>, onlyParallel?: boolean }} [opts]
 */
export async function warmupRenderer(renderer, scene, camera, { textures, maxMs = 4000, yieldFn, onlyParallel = false } = {}) {
  if (!renderer || !scene || !camera) return;
  const t0 = performance.now();
  const list = textures || collectTextures(scene);
  let nTex = 0;
  for (const tex of list) {
    try { renderer.initTexture(tex); nTex++; } catch { /* 컨텍스트가 없거나 이미 폐기 */ }
    if (yieldFn && performance.now() - t0 > 8) {
      try { await yieldFn(); } catch { /* noop */ }
    }
    if (performance.now() - t0 > maxMs) break;
  }
  const hasParallel = !!renderer.extensions?.has?.('KHR_parallel_shader_compile');
  const left = () => Math.max(0, maxMs - (performance.now() - t0));
  try {
    if (hasParallel && typeof renderer.compileAsync === 'function') {
      await Promise.race([
        renderer.compileAsync(scene, camera).catch(() => {}),
        new Promise((r) => setTimeout(r, Math.max(left(), 16))),
      ]);
    } else if (!onlyParallel && typeof renderer.compile === 'function') {
      // 지구본은 확장이 없으면 예전처럼 바로 그린다. 월드 부트는 로딩 화면 뒤에 동기 compile 을 돌린다.
      renderer.compile(scene, camera);
    }
  } catch { /* 구형 three / 컨텍스트 손실 */ }
  return { ms: performance.now() - t0, textures: nTex, parallel: hasParallel };
}
