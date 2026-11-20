// [depot-story] 12일차: E21 새벽 3시, 둘이서 — 6일차 잠입(createStealth) + 7일차 따라오기(createFollower) 재사용.
//   여기엔 수치·소음 간격(순수) · 반기철 카트 자리 계산 · 보라 카트 소품(메시 1)만.
import { geo } from './day6.js';
import { purpleCartParts } from './day8.js';

export const E21 = Object.freeze({ timeLimitSec: 210, startWithinSec: 90, caughtSec: 1.5, caughtMax: 2, followM: 3, noiseEverySec: [25, 40], spyCartKg: 20, pouchKg: 1, cartAhead: 0.95 });
/** 다음 덜컹까지 초 (rnd 0–1) */
export const nextNoise = (rnd = Math.random(), t = E21) => t.noiseEverySec[0] + (t.noiseEverySec[1] - t.noiseEverySec[0]) * rnd;
/** 따라오는 반기철(S: x,z,yaw = 사람) → 카트(사람 앞 cartAhead m) · 불빛 검사 점 2개(카트 · 사람) */
export function spyCartAt(S, t = E21) { const dx = Math.sin(S.yaw), dz = Math.cos(S.yaw); return { x: S.x + dx * t.cartAhead, z: S.z + dz * t.cartAhead, yaw: S.yaw }; }
export const spyPoints = (S, t = E21) => { const c = spyCartAt(S, t); return [{ x: c.x, z: c.z }, { x: S.x, z: S.z }]; };
/** 비밀 칸 옆 반기철 자리 (secret-shelf 표식은 뒤 벽 안이라 그대로 쓰면 벽 뒤) */
export const SPY_SHELF = Object.freeze({ x: 59.7, z: 114.6, yaw: -Math.PI / 2 });

export function createDay12Props({ THREE, scene, keep }) {
  let cart = null;
  const api = {
    /** 반기철 보라 카트: {x,z,yaw}(yaw = 진행 방향) · null 치움 */
    spyCart(p) {
      if (!p) { cart?.removeFromParent(); return; }
      if (!cart) { const pos = [], col = [], nrm = []; purpleCartParts(pos, col, nrm); cart = new THREE.Mesh(geo(THREE, keep, pos, col, nrm), keep(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x140820 }))); cart.name = 'story-spy-follow-cart'; cart.scale.setScalar(0.85); }
      if (!cart.parent) scene.add(cart);
      cart.position.set(p.x, 0, p.z); cart.rotation.y = p.yaw + Math.PI; // 손잡이(+z 로컬)가 사람 쪽
    },
    stats: () => ({ spyCart: !!cart?.parent }),
    dispose() { api.spyCart(null); },
  };
  return api;
}
