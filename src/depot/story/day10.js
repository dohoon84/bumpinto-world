// [depot-story] 10일차: E19 1원 전쟁 타임세일 — 판정(순수 함수) + 맞불 매대 소품(정점 색 매대 1 + POP 1 + 박스 InstancedMesh 1).
//   보라 카트 3대는 8일차 행렬(createConvoy, convoy-loop)을 그대로 돌려 씀 — 특가 매대 앞 4초 멈춤 = 박스 가져가기 연출. 충돌(rival-cart)은 index.js onConvoyHit.
import { box, hex, geo } from './day6.js';

export const E19 = Object.freeze({ timeLimitSec: 150, boxesOnPallet: 6, grabIntervalSec: 10, need: 3, dropHoldSec: 1, dropR: 2, dropMaxSpeed: 0.25, failHits: 3 });
/** 맞불 매대(계산대 앞, counter-endcap 56.5, 12): 계산대 구역(z ≤ 10.72) 과 앞 랙(z ≥ 14) 사이 띠에 0.7 m 깊이 — 띠 z 12.35–14 는 그대로 지나감 */
export const ENDCAP = Object.freeze({ x: 56.5, z: 12, w: 1.3, d: 0.7 });
export const endcapRect = (e = ENDCAP) => ({ x0: e.x - e.w / 2, x1: e.x + e.w / 2, z0: e.z - e.d / 2, z1: e.z + e.d / 2 });

/** 판정: placed = 맞불 매대에 놓은 박스, hits = 보라 카트 충돌, engaged = 박스를 한 번이라도 실음 */
export function evalE19({ placed = 0, hits = 0, engaged = false } = {}, t = E19) {
  if (hits >= t.failHits) return 'fail';
  if (placed >= t.need) return hits === 0 ? 'success' : 'partial';
  if (placed === t.need - 1) return 'partial';
  return engaged || placed > 0 ? 'fail' : 'missed';
}
/** 파렛트 재고: 보라 카트가 grabIntervalSec 마다 1박스(재고 있을 때만) — 내가 가져간 것도 재고에서 빠짐 */
export function palletLeft({ t = 0, mine = 0 } = {}, T = E19) { const grabs = Math.floor(t / T.grabIntervalSec); return Math.max(0, T.boxesOnPallet - mine - grabs); }

export function createDay10Props({ THREE, scene, keep, look = null, isMobile = false }) {
  let stand = null, boxes = null, pop = null, shown = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), Z0 = new THREE.Matrix4().makeScale(0, 0, 0);
  function buildStand() { // 매대 몸통 + 다리 + 위 테두리 + POP 기둥 (정점 색 1 메시)
    const pos = [], col = [], nrm = [], R = hex(0xd8402a), W = hex(0xf6f1e4), K = hex(0x3a3d42);
    box(pos, col, 0, 0.36, 0, ENDCAP.w, 0.72, ENDCAP.d, R, nrm); box(pos, col, 0, 0.74, 0, ENDCAP.w + 0.06, 0.04, ENDCAP.d + 0.06, W, nrm);
    box(pos, col, -ENDCAP.w / 2 + 0.06, 1.25, 0, 0.04, 1.0, 0.04, K, nrm); box(pos, col, ENDCAP.w / 2 - 0.06, 1.25, 0, 0.04, 1.0, 0.04, K, nrm);
    const m = new THREE.Mesh(geo(THREE, keep, pos, col, nrm), keep(new THREE.MeshLambertMaterial({ vertexColors: true }))); m.name = 'story-counter-endcap'; return m;
  }
  function buildPop() { // '맞불 특가' POP (캔버스 텍스처 1장)
    const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
    g.fillStyle = '#ffe14a'; g.fillRect(0, 0, 256, 96); g.fillStyle = '#d8402a'; g.fillRect(0, 0, 256, 10); g.fillRect(0, 86, 256, 10);
    g.fillStyle = '#b8231a'; g.font = '900 44px sans-serif'; g.textAlign = 'center'; g.fillText('맞불 특가', 128, 58); g.fillStyle = '#3a2a10'; g.font = '800 17px sans-serif'; g.fillText('범라면 박스 · 1원도 진심', 128, 80);
    const tex = keep(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.2, 0.45)), keep(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }))); m.name = 'story-endcap-pop'; return m;
  }
  function buildBoxes() {
    const L = look?.('ramen'); const g = L?.geo || keep(new THREE.BoxGeometry(0.5, 0.3, 0.4)); const mat = L?.mat || keep(new THREE.MeshLambertMaterial({ color: 0xe8a23a }));
    const im = new THREE.InstancedMesh(g, mat, 3); im.name = 'story-endcap-boxes'; im.frustumCulled = false; return im;
  }
  const api = {
    /** 맞불 매대: on (n = 놓인 박스 수, pop = POP 보임) · off */
    endcap(on, n = 0, withPop = true) {
      if (!on) { stand?.removeFromParent(); boxes?.removeFromParent(); pop?.removeFromParent(); shown = 0; return; }
      stand ||= buildStand(); boxes ||= buildBoxes(); if (withPop && typeof document !== 'undefined') pop ||= buildPop();
      if (!stand.parent) { stand.position.set(ENDCAP.x, 0, ENDCAP.z); scene.add(stand, boxes); }
      if (pop && withPop && !pop.parent) { pop.position.set(ENDCAP.x, 1.62, ENDCAP.z + ENDCAP.d / 2 - 0.02); scene.add(pop); } else if (!withPop) pop?.removeFromParent();
      shown = n;
      for (let i = 0; i < 3; i++) {
        if (i >= n) { boxes.setMatrixAt(i, Z0); continue; }
        q.setFromAxisAngle(v.set(0, 1, 0), (i - 1) * 0.06); m4.compose(v.set(ENDCAP.x - 0.42 + i * 0.42, 0.76 + 0.16, ENDCAP.z), q, s1); boxes.setMatrixAt(i, m4);
      }
      boxes.instanceMatrix.needsUpdate = true;
    },
    stats: () => ({ endcap: !!stand?.parent, boxes: stand?.parent ? shown : 0, pop: !!pop?.parent }),
    dispose() { api.endcap(false); },
  };
  void isMobile;
  return api;
}
