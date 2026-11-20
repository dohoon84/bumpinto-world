// [gentle-monster] SDF 조각 레시피 — 전부 원본 디자인. 좌표 = 미터, 바닥 y=0, 앞(머리) = +x 또는 +z.
//   워커(sculpt.worker.js)와 메인 스레드 둘 다에서 쓴다 (DOM 안 씀).
import { SDF } from './sdf.js';

const FUR = 0x4b505a, FUR_D = 0x34373e, NOSE = 0x111114, AL = 0xc9ccd1, AL_D = 0x9da2a9, JOINT = 0x1a1b1f, VISOR = 0x0b0c10;

/** 잠자는 그레이하운드 (길이 ~9m, 앞발 위에 턱을 괴고 엎드림, 머리 +x) */
export function hound() {
  const s = new SDF();
  s.ell([1.1, 1.22, 0], [1.65, 1.12, 0.95], { color: FUR });                         // 깊은 가슴
  s.cone([-0.2, 1.22, 0], [-1.9, 1.02, 0], 0.82, 0.56, { k: 0.5, color: FUR });       // 잘록한 허리
  s.ell([-2.55, 1.0, 0.08], [1.05, 0.92, 0.86], { k: 0.45, color: FUR });              // 엉덩이
  // 접힌 뒷다리 (오른쪽 바깥으로, 왼쪽은 몸 아래로)
  s.ell([-2.35, 0.72, 0.78], [1.08, 0.62, 0.34], { k: 0.25, rot: [0, 0.15, 0.25], color: FUR });
  s.cone([-3.05, 0.24, 0.95], [-1.25, 0.18, 1.18], 0.23, 0.16, { k: 0.18, color: FUR });
  s.ell([-1.05, 0.14, 1.2], [0.42, 0.14, 0.24], { k: 0.08, color: FUR_D });
  s.cone([-3.0, 0.3, -0.62], [-1.5, 0.2, -0.78], 0.25, 0.17, { k: 0.2, color: FUR });
  s.ell([-1.3, 0.14, -0.8], [0.4, 0.14, 0.22], { k: 0.08, color: FUR_D });
  // 앞으로 뻗은 앞다리
  for (const z of [0.34, -0.3]) {
    s.cone([1.9, 0.7, z * 1.3], [2.7, 0.3, z], 0.44, 0.27, { k: 0.3, color: FUR });
    s.cone([2.7, 0.28, z], [4.45, 0.17, z * 0.95], 0.2, 0.14, { k: 0.08, color: FUR });
    s.ell([4.68, 0.12, z * 0.95], [0.3, 0.12, 0.17], { k: 0.06, color: FUR_D });
  }
  // 목 → 머리 (앞발 위에 턱)
  s.cone([2.3, 1.8, 0], [3.6, 1.22, 0.05], 0.64, 0.42, { k: 0.35, color: FUR });
  s.ell([3.95, 1.12, 0.05], [0.7, 0.46, 0.43], { k: 0.22, color: FUR });
  s.cone([4.3, 1.0, 0.05], [5.65, 0.66, 0.05], 0.34, 0.15, { k: 0.2, color: FUR });
  s.ell([5.74, 0.67, 0.05], [0.13, 0.11, 0.12], { k: 0.04, color: NOSE });
  // 접힌 귀 (뒤로 눕힘)
  for (const z of [0.33, -0.23]) s.ell([3.45, 1.47, z], [0.48, 0.09, 0.22], { k: 0.06, rot: [0, 0, 0.35], color: FUR_D });
  // 감은 눈 (주름)
  for (const z of [0.38, -0.28]) s.ell([4.42, 1.24, z], [0.16, 0.025, 0.05], { k: 0.0, sub: true, color: NOSE });
  // 꼬리 — 바닥을 따라 몸 앞으로 감김
  s.cone([-3.45, 0.95, 0.05], [-3.95, 0.42, 0.65], 0.17, 0.15, { k: 0.15, color: FUR });
  s.cone([-3.95, 0.42, 0.65], [-3.1, 0.16, 1.55], 0.15, 0.12, { k: 0.06, color: FUR });
  s.cone([-3.1, 0.16, 1.55], [-1.6, 0.13, 1.82], 0.12, 0.08, { k: 0.06, color: FUR });
  return { sdf: s, step: 0.055 };
}
/** 그레이하운드 등 갑옷 (은빛 판, 이음선) — hound 와 같은 좌표 */
export function houndArmor() {
  const s = new SDF();
  s.ell([-0.35, 1.32, 0.02], [2.55, 1.2, 1.1], { color: AL });
  s.ell([-0.35, 1.32, 0.02], [2.45, 1.1, 1.0], { sub: true });
  s.rbox([-0.35, 0.55, 0], [4, 1.05, 2], 0.02, { sub: true });          // 아래쪽 잘라 안장만
  s.rbox([2.4, 1.6, 0], [0.5, 1.2, 1.4], 0.02, { sub: true });           // 앞 끝 정리
  for (let i = 0; i < 8; i++) s.groove([1, 0, 0], -2.5 + i * 0.62, { w: 0.03, depth: 0.04 });
  s.groove([0, 0, 1], 0, { w: 0.02, depth: 0.03 });
  return { sdf: s, step: 0.035 };
}

/** 거인 로봇 (원본). pose 'crouch' (네발 짚고 웅크림) | 'kneel' (한쪽 무릎). 앞 = +z, 키 ~3.6m */
export function giant(pose = 'crouch') {
  const s = new SDF(), cr = pose === 'crouch';
  const P = cr
    ? { pel: [0, 1.38, -0.35], chest: [0, 2.28, 0.32], chestRot: [-0.55, 0, 0], head: [0, 2.78, 1.08], sh: [0.86, 2.55, 0.42], el: [1.12, 1.45, 0.98], hand: [0.98, 0.22, 1.42], hip: [0.44, 1.28, -0.32], knee: [0.78, 1.22, 0.72], ank: [0.6, 0.2, 0.18] }
    : { pel: [0, 1.55, -0.15], chest: [0, 2.55, 0.05], chestRot: [-0.12, 0, 0], head: [0, 3.25, 0.22], sh: [0.88, 2.85, 0.05], el: [1.05, 1.95, 0.42], hand: [0.62, 1.45, 0.98], hip: [0.42, 1.45, -0.12], knee: [0.55, 1.35, 0.85], ank: [0.55, 0.22, 0.75], knee2: [-0.5, 0.22, 0.35], ank2: [-0.5, 0.2, -0.75] };
  // 몸통
  s.ell(P.pel, [0.62, 0.44, 0.52], { color: AL });
  s.cone(P.pel, P.chest, 0.42, 0.5, { k: 0.12, color: JOINT });           // 배 (검은 주름관)
  s.ell(P.chest, [0.86, 0.72, 0.64], { k: 0.1, rot: P.chestRot, color: AL });
  s.rbox([P.chest[0], P.chest[1] + 0.1, P.chest[2] - 0.55], [0.55, 0.5, 0.18], 0.12, { k: 0.08, rot: P.chestRot, color: AL_D }); // 등판
  // 목 + 머리 (헬멧 + 띠 바이저)
  s.cone([P.chest[0], P.chest[1] + 0.35, P.chest[2] + (cr ? 0.4 : 0.05)], P.head, 0.22, 0.2, { k: 0.05, color: JOINT });
  s.ell(P.head, [0.38, 0.42, 0.43], { k: 0.04, color: AL });
  s.ell([P.head[0], P.head[1] + 0.02, P.head[2] + 0.3], [0.3, 0.12, 0.16], { k: 0.015, color: VISOR });
  for (const sg of [-1, 1]) {
    const m = (v) => [v[0] * sg, v[1], v[2]];
    s.ell(m(P.sh), [0.42, 0.38, 0.42], { k: 0.12, color: AL });              // 어깨 캡
    s.cone(m(P.sh), m(P.el), 0.27, 0.23, { k: 0.06, color: AL });
    s.ell(m(P.el), [0.24, 0.24, 0.24], { k: 0.02, color: JOINT });
    s.cone(m(P.el), m(P.hand), 0.25, 0.21, { k: 0.05, color: AL });
    s.rbox([P.hand[0] * sg, P.hand[1], P.hand[2] + 0.06], [0.24, cr ? 0.2 : 0.17, 0.27], 0.1, { k: 0.04, color: AL_D });
    s.cone(m(P.hip), m(P.knee), 0.34, 0.28, { k: 0.1, color: AL });
    s.ell(m(P.knee), [0.27, 0.27, 0.27], { k: 0.02, color: JOINT });
  }
  // 정강이 + 발
  const legs = cr ? [[1, P.knee, P.ank], [-1, P.knee, P.ank]] : [[1, P.knee, P.ank], [-1, [-0.5, 1.35, 0.4], P.knee2]];
  for (const [sg, kn, an] of legs) {
    const k2 = sg > 0 ? [kn[0], kn[1], kn[2]] : kn, a2 = sg > 0 ? an : an;
    const K = [k2[0] * (sg > 0 ? 1 : 1) * (k2[0] > 0 ? sg : 1), k2[1], k2[2]], A = [a2[0] * (a2[0] > 0 ? sg : 1), a2[1], a2[2]];
    s.cone(K, A, 0.27, 0.22, { k: 0.05, color: AL });
    s.rbox([A[0], 0.12, A[2] + 0.22], [0.25, 0.12, 0.42], 0.08, { k: 0.05, color: AL_D });
  }
  if (!cr) { s.cone([-0.5, 1.35, 0.4], P.knee2, 0.3, 0.25, { k: 0.05, color: AL }); s.cone(P.knee2, P.ank2, 0.24, 0.2, { k: 0.04, color: AL }); s.rbox([P.ank2[0], 0.1, P.ank2[2] - 0.15], [0.24, 0.1, 0.4], 0.07, { k: 0.04, color: AL_D }); }
  // 판 이음선
  const inChest = (x, y, z) => Math.abs(x) < 1.0 && Math.abs(y - P.chest[1]) < 0.85 && Math.abs(z - P.chest[2]) < 0.8;
  s.groove([1, 0, 0], 0, { w: 0.02, depth: 0.025, within: inChest });
  for (const dy of [-0.3, 0.15]) s.groove([0, 1, 0.4], P.chest[1] + dy + 0.4 * P.chest[2], { w: 0.018, depth: 0.022, within: inChest });
  s.groove([0, 1, 0], P.head[1] + 0.16, { w: 0.015, depth: 0.02, within: (x, y, z) => Math.hypot(x - P.head[0], y - P.head[1], z - P.head[2]) < 0.5 });
  for (const t of [0.35, 0.65]) { // 팔뚝 띠
    for (const sg of [-1, 1]) { const a = [P.el[0] * sg, P.el[1], P.el[2]], b = [P.hand[0] * sg, P.hand[1], P.hand[2]], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], c = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t], l = Math.hypot(...d); s.groove(d, (d[0] * c[0] + d[1] * c[1] + d[2] * c[2]) / l, { w: 0.02, depth: 0.025, within: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) < 0.4 }); }
  }
  return { sdf: s, step: 0.04 };
}

/** 구겨진 크롬 마네킹 (원본, 가늘고 길게 비튼 자세). 앞 = +z */
export function mannequin(v = 0) {
  const s = new SDF(), lean = v ? -0.12 : 0.1, C = 0xe8ebee;
  const hip = [0, 1.0, 0], chest = [lean * 0.6, 1.5, 0.03 * v], neck = [lean, 1.75, 0.05], head = [lean * 1.1, 1.92, 0.08];
  s.ell(hip, [0.19, 0.13, 0.12], { color: C });
  s.cone(hip, chest, 0.14, 0.17, { k: 0.08, color: C });
  s.ell(chest, [0.22, 0.15, 0.12], { k: 0.08, color: C });
  s.cone(chest, neck, 0.07, 0.05, { k: 0.05, color: C });
  s.ell(head, [0.1, 0.13, 0.11], { k: 0.04, color: C });
  for (const sg of [-1, 1]) {
    const kn = [sg * 0.13, 0.52, (v && sg > 0) ? 0.14 : 0.02], an = [sg * 0.13, 0.06, (v && sg > 0) ? -0.05 : 0];
    s.cone([sg * 0.1, 0.95, 0], kn, 0.075, 0.055, { k: 0.04, color: C }); s.cone(kn, an, 0.052, 0.04, { k: 0.02, color: C });
    s.ell([an[0], 0.035, an[2] + 0.06], [0.05, 0.035, 0.11], { k: 0.02, color: C });
    const sh = [chest[0] + sg * 0.2, 1.6, 0.02], el = v ? [sg * 0.34, 1.32, 0.18] : [sg * 0.3, 1.25, -0.05], hd = v ? [sg * 0.12, 1.55, 0.3] : [sg * 0.33, 0.95, 0.06];
    s.cone(sh, el, 0.05, 0.042, { k: 0.04, color: C }); s.cone(el, hd, 0.04, 0.032, { k: 0.02, color: C });
    s.ell(hd, [0.035, 0.07, 0.03], { k: 0.02, color: C });
  }
  s.setNoise(0.016, 11, 0.6);
  return { sdf: s, step: 0.018 };
}

export const RECIPES = { hound, houndArmor, giantCrouch: () => giant('crouch'), giantKneel: () => giant('kneel'), mannequinA: () => mannequin(0), mannequinB: () => mannequin(1) };

/** 레시피 → 배열들 (워커 전송용) */
export function sculptArrays(name, stepMul = 1) {
  const { sdf, step } = RECIPES[name]();
  const g = sdf.mesh(step * stepMul);
  return { name, pos: g.attributes.position.array, nor: g.attributes.normal.array, col: g.attributes.color.array, idx: Uint32Array.from(g.index.array) };
}
