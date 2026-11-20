// [gentle-monster] SDF 조각을 워커에서 만들어 BufferGeometry 로 돌려준다 (실패하면 메인 스레드에서).
import * as THREE from 'three';

const NAMES = ['hound', 'houndArmor', 'giantCrouch', 'giantKneel', 'mannequinA', 'mannequinB'];
const toGeo = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(a.col, 3)); g.setIndex(new THREE.BufferAttribute(a.idx, 1)); g.computeBoundingSphere(); return g; };

export function loadSculpts({ mobile = false } = {}) {
  const stepMul = mobile ? 1.45 : 1, loMul = 2.6; // 멀리서 쓰는 낮은 해상도 조각(LOD)
  return new Promise((resolve) => {
    const out = {};
    const fallback = async () => { const { sculptArrays } = await import('./sculpt.js'); for (const n of NAMES) { if (!out[n]) out[n] = toGeo(sculptArrays(n, stepMul)); if (!out[n + '_lo']) out[n + '_lo'] = toGeo({ ...sculptArrays(n, loMul) }); } resolve(out); };
    let w;
    try { w = new Worker(new URL('./sculpt.worker.js', import.meta.url), { type: 'module' }); } catch { fallback(); return; }
    w.onmessage = (e) => { if (e.data.done) { w.terminate(); resolve(out); } else out[e.data.name] = toGeo(e.data); };
    w.onerror = (e) => { e.preventDefault?.(); w.terminate(); fallback(); };
    w.postMessage({ names: NAMES, stepMul, loMul });
  });
}
