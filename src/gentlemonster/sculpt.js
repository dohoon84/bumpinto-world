// [gentle-monster] SDF 조각 레시피 — 전부 원본 디자인. 좌표 = 미터, 바닥 y=0, 앞(머리) = +x 또는 +z.
//   워커(sculpt.worker.js)와 메인 스레드 둘 다에서 쓴다 (DOM 안 씀).
import { SDF } from './sdf.js';

const FUR = 0x4b505a, FUR_D = 0x34373e, NOSE = 0x111114, AL = 0xc9ccd1, AL_D = 0x9da2a9, JOINT = 0x1a1b1f, VISOR = 0x0b0c10;

/** 엎드린 그레이하운드 (스핑크스 자세, 길이 ~5.5m, 머리 +x). 가슴·엉덩이·네 발이 바닥(y=0)에 닿고, 긴 목으로 머리를 든다.
 *  실루엣이 개로 읽히게: 깊은 가슴 → 잘록하게 올라간 허리 → 둥근 엉덩이, 앞다리는 바닥에 나란히, 접은 뒷다리, 가는 주둥이, 뒤로 접힌 귀 */
export function hound() {
  const s = new SDF();
  s.ell([0.9, 0.86, 0], [0.98, 0.8, 0.56], { color: FUR });                            // 깊은 가슴 (바닥에 닿음)
  s.ell([1.55, 1.12, 0], [0.5, 0.55, 0.44], { k: 0.3, color: FUR });                    // 어깨
  s.cone([0.25, 1.02, 0], [-0.95, 1.0, 0], 0.6, 0.42, { k: 0.4, color: FUR });          // 잘록한 허리 (배가 올라감)
  s.ell([-1.45, 0.8, 0], [0.72, 0.74, 0.58], { k: 0.38, color: FUR });                  // 엉덩이
  // 접은 뒷다리: 허벅지 → 바닥에 누운 정강이 → 앞으로 놓인 발
  for (const z of [0.5, -0.5]) {
    s.ell([-1.3, 0.56, z], [0.78, 0.46, 0.22], { k: 0.2, rot: [0, 0, -0.35], color: FUR });
    s.cone([-2.0, 0.17, z * 1.08], [-0.78, 0.13, z * 1.2], 0.16, 0.1, { k: 0.14, color: FUR });
    s.ell([-0.58, 0.085, z * 1.2], [0.24, 0.085, 0.13], { k: 0.06, color: FUR_D });
  }
  // 앞다리: 어깨에서 팔꿈치로 내려와 앞팔은 바닥에 나란히, 발끝은 앞으로
  for (const z of [0.3, -0.3]) {
    s.cone([1.45, 0.78, z], [1.22, 0.2, z * 1.05], 0.3, 0.17, { k: 0.2, color: FUR });
    s.cone([1.22, 0.16, z * 1.05], [2.45, 0.11, z], 0.15, 0.1, { k: 0.1, color: FUR });
    s.ell([2.62, 0.085, z], [0.25, 0.085, 0.13], { k: 0.05, color: FUR_D });
    for (const t of [-0.07, 0, 0.07]) s.ell([2.84, 0.07, z + t], [0.07, 0.065, 0.045], { k: 0.03, color: FUR_D });
  }
  // 긴 목 → 머리를 들고 앞을 본다
  s.cone([1.55, 1.3, 0], [2.18, 2.0, 0], 0.42, 0.25, { k: 0.3, color: FUR });
  s.ell([2.32, 2.08, 0], [0.37, 0.27, 0.24], { k: 0.15, color: FUR });                  // 머리
  s.cone([2.52, 2.03, 0], [3.1, 1.86, 0], 0.2, 0.075, { k: 0.14, color: FUR });          // 가는 주둥이
  s.cone([2.55, 1.9, 0], [2.98, 1.8, 0], 0.13, 0.06, { k: 0.1, color: FUR });            // 아래턱
  s.ell([3.14, 1.865, 0], [0.075, 0.06, 0.065], { k: 0.03, color: NOSE });               // 코
  // 뒤로 접힌 장미 귀
  for (const z of [0.16, -0.16]) {
    s.ell([2.08, 2.28, z], [0.2, 0.05, 0.1], { k: 0.04, rot: [0, z > 0 ? -0.35 : 0.35, 0.45], color: FUR_D });
    s.ell([1.93, 2.22, z * 1.25], [0.1, 0.04, 0.07], { k: 0.03, color: FUR_D });
  }
  for (const z of [0.17, -0.17]) s.ell([2.5, 2.14, z], [0.05, 0.035, 0.03], { k: 0, color: NOSE }); // 눈
  // 가는 꼬리 — 엉덩이에서 바닥으로 내려와 몸 옆을 따라 앞으로 감김
  s.cone([-2.05, 0.78, 0], [-2.3, 0.2, 0.42], 0.1, 0.075, { k: 0.08, color: FUR });
  s.cone([-2.3, 0.2, 0.42], [-1.65, 0.075, 0.95], 0.075, 0.06, { k: 0.04, color: FUR });
  s.cone([-1.65, 0.075, 0.95], [-0.6, 0.06, 1.02], 0.06, 0.04, { k: 0.04, color: FUR });
  return { sdf: s, step: 0.04 };
}
/** 그레이하운드 등 갑옷 (은빛 안장, 이음선) — hound 와 같은 좌표 */
export function houndArmor() {
  const s = new SDF();
  s.ell([-0.25, 0.98, 0], [1.42, 0.8, 0.66], { color: AL });
  s.ell([-0.25, 0.98, 0], [1.34, 0.72, 0.6], { sub: true });
  s.rbox([-0.25, 0.3, 0], [3, 0.95, 2], 0.02, { sub: true });            // 아래쪽 잘라 안장만 (y > 1.25)
  s.rbox([1.3, 1.4, 0], [0.32, 1.0, 1.2], 0.02, { sub: true });           // 어깨 앞 정리
  s.rbox([-1.98, 1.4, 0], [0.3, 1.0, 1.2], 0.02, { sub: true });          // 엉덩이 뒤 정리
  for (let i = 0; i < 7; i++) s.groove([1, 0, 0], -1.45 + i * 0.4, { w: 0.025, depth: 0.03 });
  s.groove([0, 0, 1], 0, { w: 0.02, depth: 0.025 });
  return { sdf: s, step: 0.03 };
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
