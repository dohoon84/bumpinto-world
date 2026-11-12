// [depot] 손님 NPC 8유형 (depot-story v0.4 npc/npc-types.json) — 사람 손님(동물 아님) + 카트, 통로 길찾기, 유형별 속도·습관.
//   유형마다 몸·카트·짐을 정점색 한 덩어리로 합쳐 메시 1개(그림자 없음) → 손님 8팀 = draw call 최대 8 (멀면 detailCull 이 뺌).
//   이동: 통로 x 열 × 가로 통로 z 줄 교차점 그래프(정적 장애물에 막힌 구간은 시작 때 빼 둠). 카트를 앞에 두고 밀며 걷고,
//   몸+카트 크기의 움직이는 AABB 를 obstacles 에 넣어 플레이어·카트가 통과하지 못하게 함.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const COLS = [17.9, 23.4, 29.0, 34.5, 40.1, 47.2, 53.9, 59.4, 64.8];
const ROWS = [44, 77, 107.2]; // 앞쪽 가로 통로(z≈13)는 계산대 줄 손님 자리라 비움
const EXTRA = [[69.4, 44], [69.4, 77], [69.4, 107.2], [76.5, 44]]; // 동쪽 계절 매대 옆, 전자 코너 뒤
const ZONES = {
  snack: [[29.0, 30], [34.5, 60]], water: [[53.9, 30], [59.4, 34]], deli: [[69.4, 107.2], [64.8, 107.2]], bakery: [[8, 26], [8, 30]],
  seasonal: [[69.4, 60], [69.4, 88]], produce: [[17.9, 107.2], [23.4, 107.2]], rice: [[40.1, 26], [47.2, 60]],
};
const C = {
  skin: '#f0cfae', skin2: '#e3b48c', jeans: '#3d5a8a', black: '#2a2c30', khaki: '#8a7a5a', white: '#f4f2ec', cream: '#efe6d2', mint: '#9fd8c0',
  yellow: '#f2c230', mustard: '#d9a62e', red: '#d9442e', olive: '#5d6b3a', brown: '#7a4e2c', kraft: '#c8965a', hairBk: '#1c1a1a', hairBr: '#5a3a22', gray2: '#cfcbc4',
  wire: '#a9b2b8', wireDk: '#6c757b', handle: '#c62828', blue: '#2f6fb0', water: '#8cc4ec', plaid: '#8d6a48', gray: '#6b6f74', green: '#3f7a4a',
};

// ---- 정점 속성: color + aBone(관절 번호) + aPivot(관절 축) → 셰이더가 팔·다리·머리만 돌림(메시 1개 유지) ----
const RIG = { bone: 0, pivot: [0, 0, 0] };
const withBone = (bone, pivot, fn) => { const pb = RIG.bone, pp = RIG.pivot; RIG.bone = bone; RIG.pivot = pivot; fn(); RIG.bone = pb; RIG.pivot = pp; };
function part(list, geo, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')));
  g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3), bo = new Float32Array(n), pv = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; bo[i] = RIG.bone; pv[i * 3] = RIG.pivot[0]; pv[i * 3 + 1] = RIG.pivot[1]; pv[i * 3 + 2] = RIG.pivot[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.setAttribute('aBone', new THREE.BufferAttribute(bo, 1)); g.setAttribute('aPivot', new THREE.BufferAttribute(pv, 3));
  list.push(g);
}
const box = (list, w, h, d, color, x, y, z, rx, ry, rz) => part(list, new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
const rbox = (list, w, h, d, r, seg, color, x, y, z, rx, ry, rz) => part(list, new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)), color, x, y, z, rx, ry, rz);
const ell = (list, rx3, ry3, rz3, color, x, y, z, seg = 6, rx, ry, rz) => { const g = new THREE.SphereGeometry(1, seg, Math.max(4, seg - 2)); g.scale(rx3, ry3, rz3); part(list, g, color, x, y, z, rx, ry, rz); };
const caps = (list, r, len, color, x, y, z, rx, ry, rz) => part(list, new THREE.CapsuleGeometry(r, len, 2, 6), color, x, y, z, rx, ry, rz);
const cyl = (list, r, h, color, x, y, z, rx, ry, rz, seg = 6) => part(list, new THREE.CylinderGeometry(r, r, h, seg, 1, false), color, x, y, z, rx, ry, rz);

const PART = { armL: 0, armR: 1, head: 2, legL: 3, legR: 4 };
export const MAX_BONES = 1 + 4 * 6; // 0 = 고정(몸통·카트), 사람 p 의 관절 k = 1 + p*6 + k

/** 사람 한 명 (앞 = -z) — VN 초상화 같은 평범한 사람 비율(머리 조금 큼). 반환: 리그(관절 번호·기본 자세·흔들기 여부).
 *  o: {p, s, w, x, z, y, skin, shirt, sleeve('long'|'short'|'none'), pants, shorts, shoes, hair, hairStyle, hat, hatC, apron, vest, hood, collar,
 *      stripes, bag, belly, stoop, mouth('smile'|'o'|'chew'|'flat'), blush, glasses, earbuds, wrist, pose:{armL:[pitch,yaw], armR, swingL, swingR, headPitch}, hold:{l,r} } */
function person(L, o) {
  const s = o.s || 1, w = o.w || 1, X = o.x || 0, Z = o.z || 0, Y0 = o.y || 0, p = o.p || 0;
  const P = (x, y, z) => [X + x * s, Y0 + y * s, Z + z * s];
  const B = (bw, bh, bd, c, x, y, z, rx, ry, rz) => box(L, bw * s, bh * s, bd * s, c, ...P(x, y, z), rx, ry, rz);
  const R = (bw, bh, bd, r, c, x, y, z, rx, ry, rz, seg = 1) => rbox(L, bw * s, bh * s, bd * s, r * s, seg, c, ...P(x, y, z), rx, ry, rz);
  const E = (a, b2, c2, col, x, y, z, seg = 6, rx, ry, rz) => ell(L, a * s, b2 * s, c2 * s, col, ...P(x, y, z), seg, rx, ry, rz);
  const K = (r, len, c, x, y, z, rx, ry, rz) => caps(L, r * s, len * s, c, ...P(x, y, z), rx, ry, rz);
  const skin = o.skin || C.skin, shirt = o.shirt, pants = o.pants || C.jeans, hair = o.hair || C.hairBk, shoes = o.shoes || '#3a2f28';
  const bone = (k) => 1 + p * 6 + k;
  const st = o.stoop || 0, sz = -st * 0.5; // 구부정: 윗몸이 앞으로
  // 다리 (엉덩이 축)
  for (const [k, sx] of [[PART.legL, -0.095], [PART.legR, 0.095]]) withBone(bone(k), P(sx, 0.74, 0), () => {
    if (o.seated) { K(0.06, 0.26, pants, sx, 0.62, -0.16, Math.PI / 2); R(0.12, 0.08, 0.2, 0.035, shoes, sx, 0.5, -0.32); return; }
    if (o.shorts) { K(0.072, 0.16, pants, sx, 0.6, 0, 0); K(0.058, 0.36, skin, sx, 0.3, 0); }
    else K(0.066, 0.5, pants, sx, 0.405, 0);
    if (o.socks) B(0.12, 0.06, 0.12, o.socks, sx, 0.12, 0);
    R(0.13, 0.085, 0.25, 0.035, shoes, sx, 0.045, -0.035);
  });
  // 골반·몸통
  R(0.34 * w, 0.16, 0.22, 0.05, pants, 0, 0.75, 0);
  R(0.4 * w, 0.52, 0.24, 0.07, shirt, 0, 1.02, sz * 0.4, -st);
  if (o.belly) E(0.17 * w, 0.17, 0.11, shirt, 0, 0.95, -0.08 + sz * 0.3);
  if (o.stripes) for (const yy of [0.88, 1.0, 1.12]) B(0.405 * w, 0.035, 0.245, o.stripes, 0, yy, sz * 0.4, -st);
  if (o.vest) { R(0.42 * w, 0.46, 0.26, 0.06, o.vest, 0, 1.03, sz * 0.4, -st); B(0.08, 0.44, 0.262, shirt, 0, 1.04, sz * 0.4, -st); if (o.vestPockets) for (const sx of [-0.11, 0.11]) B(0.1, 0.08, 0.02, o.vestPockets, sx * w, 0.95, -0.13 + sz * 0.4); if (o.plaid) for (const yy of [0.88, 1.0, 1.12]) B(0.425 * w, 0.012, 0.264, o.plaid, 0, yy, sz * 0.4, -st); }
  if (o.apron) { B(0.36 * w, 0.62, 0.02, o.apron, 0, 0.92, -0.13 + sz * 0.4); B(0.03, 0.3, 0.02, o.apron, -0.12, 1.22, -0.125); B(0.03, 0.3, 0.02, o.apron, 0.12, 1.22, -0.125); B(0.14, 0.08, 0.025, '#a87a44', 0, 0.86, -0.145 + sz * 0.4); }
  if (o.coat) { R(0.43 * w, 0.5, 0.27, 0.06, o.coat, 0, 1.03, sz * 0.4, -st); R(0.42 * w, 0.36, 0.26, 0.05, o.coat, 0, 0.62, 0.0); B(0.06, 0.04, 0.02, '#8a6a3a', 0.1, 1.1, -0.14); B(0.12, 0.84, 0.272, o.coatInner || shirt, 0, 0.84, -0.002); for (const sx of [-0.08, 0.08]) B(0.1, 0.12, 0.03, o.coat, sx, 1.24, -0.13, 0, 0, sx > 0 ? -0.4 : 0.4); }
  if (o.scarf) { R(0.26, 0.08, 0.2, 0.035, o.scarf, 0, 1.28, sz); B(0.07, 0.22, 0.03, o.scarf, 0.06, 1.14, -0.13 + sz); }
  if (o.badge) E(0.025, 0.025, 0.01, o.badge, -0.11, 1.15, -0.14 + sz * 0.4, 6);
  if (o.hood) R(0.3, 0.14, 0.12, 0.05, shirt, 0, 1.25, 0.12 + sz, -st);
  if (o.collar) { B(0.09, 0.04, 0.05, o.collar, -0.06, 1.28, -0.1 + sz, 0, 0.3, 0.35); B(0.09, 0.04, 0.05, o.collar, 0.06, 1.28, -0.1 + sz, 0, -0.3, -0.35); }
  if (o.tee) B(0.12, 0.18, 0.01, o.tee, 0, 1.18, -0.122 + sz, -st);
  if (o.bag) { B(0.04, 0.62, 0.02, o.bag, 0, 1.03, -0.13 + sz * 0.4, 0, 0, 0.72); R(0.2, 0.16, 0.07, 0.03, o.bag, 0.2, 0.84, -0.02); }
  // 목·머리 (목 아래 축)
  const hz = sz * 1.1, hy = 1.27;
  cyl(L, 0.05 * s, 0.1 * s, skin, ...P(0, 1.3, hz));
  withBone(bone(PART.head), P(0, 1.32, hz), () => {
    const cy = 1.48;
    R(0.3, 0.31, 0.28, 0.1, skin, 0, cy, hz, 0, 0, 0, 2);
    for (const sx of [-0.152, 0.152]) E(0.03, 0.04, 0.025, skin, sx, cy - 0.01, hz + 0.01);
    // 얼굴: 눈·눈썹·코·입 (작은 정점색 조각)
    const fz = hz - 0.141;
    for (const sx of [-0.062, 0.062]) { E(0.024, 0.032, 0.01, '#2a2220', sx, cy + 0.01, fz, 6); E(0.007, 0.008, 0.004, '#ffffff', sx + 0.008, cy + 0.02, fz - 0.009, 4); B(0.065, 0.014, 0.012, o.brow || (hair === C.gray2 ? '#7d7a76' : '#2a2220'), sx, cy + 0.06, fz + 0.002, 0, 0, sx > 0 ? -0.12 : 0.12); }
    E(0.02, 0.022, 0.014, C.skin2, 0, cy - 0.025, fz - 0.004, 6);
    const mc = '#9a4a3a', my = cy - 0.075;
    if (o.mouth === 'o') E(0.018, 0.02, 0.006, '#5a2a24', 0, my, fz, 6);
    else if (o.mouth === 'flat') B(0.05, 0.01, 0.01, mc, 0, my, fz);
    else if (o.mouth === 'chew') { B(0.04, 0.014, 0.01, mc, 0, my, fz); E(0.022, 0.016, 0.01, skin, 0.05, my + 0.005, fz + 0.002); }
    else { B(0.036, 0.011, 0.01, mc, 0, my - 0.004, fz); B(0.02, 0.011, 0.01, mc, -0.025, my + 0.002, fz, 0, 0, -0.55); B(0.02, 0.011, 0.01, mc, 0.025, my + 0.002, fz, 0, 0, 0.55); }
    if (o.blush) for (const sx of [-0.095, 0.095]) E(0.025, 0.014, 0.005, '#f2a5a0', sx, cy - 0.03, fz + 0.012);
    if (o.glasses) { for (const sx of [-0.062, 0.062]) { B(0.07, 0.008, 0.008, '#3a3a3a', sx, cy + 0.04, fz - 0.012); B(0.07, 0.008, 0.008, '#3a3a3a', sx, cy - 0.02, fz - 0.012); B(0.008, 0.06, 0.008, '#3a3a3a', sx - 0.035, cy + 0.01, fz - 0.012); B(0.008, 0.06, 0.008, '#3a3a3a', sx + 0.035, cy + 0.01, fz - 0.012); } }
    if (o.shades) { for (const sx of [-0.062, 0.062]) E(0.04, 0.04, 0.01, '#1c1c22', sx, cy + 0.0, fz - 0.014, 8); B(0.05, 0.01, 0.01, '#1c1c22', 0, cy + 0.01, fz - 0.016); }
    if (o.earbuds) for (const sx of [-0.16, 0.16]) E(0.016, 0.02, 0.016, '#ffffff', sx, cy - 0.01, hz - 0.01, 4);
    if (o.beard) B(0.18, 0.05, 0.02, o.beard, 0, cy - 0.105, fz + 0.02);
    // 머리카락
    const hs = o.hairStyle || 'short', top = cy + 0.13;
    const capHair = () => { R(0.32, 0.12, 0.3, 0.05, hair, 0, top, hz + 0.008); R(0.32, 0.22, 0.09, 0.04, hair, 0, cy + 0.04, hz + 0.115); };
    if (hs === 'bald') { R(0.31, 0.06, 0.26, 0.025, skin, 0, top - 0.01, hz + 0.01); R(0.315, 0.12, 0.08, 0.03, hair, 0, cy, hz + 0.11); for (const sx of [-0.15, 0.15]) B(0.025, 0.1, 0.16, hair, sx, cy + 0.01, hz + 0.04); }
    else if (!o.hat || o.hat === 'visor' || o.hat === 'band') {
      capHair();
      if (hs === 'short' || hs === 'side') { B(0.31, 0.055, 0.05, hair, hs === 'side' ? 0.02 : 0, cy + 0.11, hz - 0.13, 0, 0, hs === 'side' ? -0.12 : 0); for (const sx of [-0.152, 0.152]) B(0.03, 0.12, 0.14, hair, sx, cy + 0.06, hz + 0.03); }
      if (hs === 'long' || hs === 'bob') { B(0.3, 0.06, 0.05, hair, 0, cy + 0.105, hz - 0.13); const lh = hs === 'long' ? 0.42 : 0.24; for (const sx of [-0.158, 0.158]) R(0.05, lh, 0.2, 0.02, hair, sx, cy + 0.12 - lh / 2, hz + 0.02); R(0.32, lh, 0.08, 0.03, hair, 0, cy + 0.12 - lh / 2, hz + 0.125); }
      if (hs === 'bun') { B(0.3, 0.05, 0.05, hair, 0, cy + 0.11, hz - 0.13); E(0.075, 0.07, 0.075, hair, 0, top + 0.06, hz + 0.1); for (const sx of [-0.152, 0.152]) B(0.03, 0.1, 0.14, hair, sx, cy + 0.06, hz + 0.03); }
      if (hs === 'pony') { B(0.3, 0.05, 0.05, hair, 0, cy + 0.11, hz - 0.13); K(0.04, 0.16, hair, 0, cy - 0.02, hz + 0.18, 0.35); E(0.03, 0.03, 0.03, '#d23a2a', 0, cy + 0.08, hz + 0.16, 4); for (const sx of [-0.152, 0.152]) B(0.03, 0.1, 0.14, hair, sx, cy + 0.06, hz + 0.03); }
      if (hs === 'perm') { for (const [xx, yy, zz] of [[-0.12, 0.1, 0], [0.12, 0.1, 0], [0, 0.15, -0.04], [0, 0.13, 0.08], [-0.13, 0.0, 0.07], [0.13, 0.0, 0.07], [-0.08, 0.15, 0.06], [0.08, 0.15, 0.06]]) E(0.07, 0.065, 0.07, hair, xx, cy + yy, hz + zz, 6); }
    } else for (const sx of [-0.152, 0.152]) B(0.03, 0.08, 0.12, hair, sx, cy + 0.03, hz + 0.04);
    if (o.hat === 'cap') { R(0.33, 0.13, 0.31, 0.06, o.hatC, 0, top + 0.005, hz + 0.005); B(0.26, 0.02, 0.15, o.hatC, 0, top - 0.05, hz - 0.2); B(0.05, 0.05, 0.01, '#f2efe6', 0, top, hz - 0.157); }
    if (o.hat === 'bucket') { R(0.32, 0.13, 0.3, 0.05, o.hatC, 0, top + 0.01, hz); R(0.44, 0.025, 0.42, 0.01, o.hatC, 0, top - 0.055, hz); B(0.325, 0.03, 0.305, '#7a6440', 0, top - 0.03, hz); }
    if (o.hat === 'visor') { B(0.325, 0.06, 0.305, o.hatC, 0, top - 0.05, hz); B(0.26, 0.02, 0.2, o.hatC, 0, top - 0.07, hz - 0.22, -0.12); }
    if (o.hat === 'band') B(0.325, 0.05, 0.305, C.white, 0, top - 0.04, hz);
  });
  // 팔 (어깨 축) — 몸통 바깥쪽
  const sw = 0.245 * w;
  const pose0 = o.pose || {};
  const arm = (k, sx, holdFn, bend) => withBone(bone(k), P(sx, 1.22, sz * 0.8), () => {
    // 위팔(아래로 0.26) + 팔꿈치 + 아래팔(bend 만큼 앞으로 굽힘) — 관절 셰이더는 어깨만 돌림
    const z0 = sz * 0.8, ey = 1.22 - 0.26, dy = -Math.cos(bend), dz = -Math.sin(bend), hy2 = ey + dy * 0.24, hz2 = z0 + dz * 0.24;
    const up = o.sleeve === 'none' ? skin : (o.sleeveC || shirt), low = o.sleeve === 'long' ? (o.sleeveC || shirt) : skin;
    E(0.07, 0.07, 0.07, o.sleeve === 'none' ? skin : shirt, sx, 1.22, z0);
    if (o.sleeve === 'long' || o.sleeve === 'none') K(0.056, 0.2, up, sx, 1.22 - 0.13, z0);
    else { K(0.062, 0.1, up, sx, 1.15, z0); K(0.052, 0.12, skin, sx, 1.03, z0); }
    E(0.053, 0.053, 0.053, low, sx, ey, z0);
    K(0.05, 0.18, low, sx, ey + dy * 0.12, z0 + dz * 0.12, bend);
    if (o.wrist) B(0.115, 0.04, 0.115, o.wrist, sx, ey + dy * 0.2, z0 + dz * 0.2, bend);
    E(0.05, 0.055, 0.05, skin, sx, hy2, hz2);
    if (holdFn) holdFn(X + sx * s, Y0 + hy2 * s, Z + hz2 * s);
  });
  arm(PART.armL, -sw, o.hold?.l, pose0.bendL ?? pose0.bend ?? 1.0); arm(PART.armR, sw, o.hold?.r, pose0.bendR ?? pose0.bend ?? 1.0);
  const pose = pose0;
  return { p, noLook: !!pose.noLook, armL: pose.armL || [0.75, 0], armR: pose.armR || [0.75, 0], swingL: !!pose.swingL, swingR: !!pose.swingR, headPitch: pose.headPitch || 0, legs: !o.seated, kid: s < 0.7, pick: pose.pick !== false && !o.seated && s >= 0.7 };
}
/** 일반 카트 (손잡이 z = z0, 앞으로 -z). load: [[w,h,d,color,x,y,z], ...] 바구니 기준 */
function stdCart(L, z0 = -0.38, load = []) {
  const zc = z0 - 0.5, y = 0.62;
  box(L, 0.56, 0.02, 0.86, C.wireDk, 0, y, zc);
  const e = 0.018, Hb = 0.42, Wb = 0.56, Db = 0.86;
  for (const sx of [-Wb / 2, Wb / 2]) { for (const yy of [Hb, Hb * 0.5]) box(L, e, e, Db, C.wire, sx, y + yy, zc); for (let k = 0; k <= 4; k++) box(L, e, Hb, e, C.wire, sx, y + Hb / 2, zc - Db / 2 + k * Db / 4); }
  for (const sz of [-Db / 2, Db / 2]) { for (const yy of [Hb, Hb * 0.5]) box(L, Wb, e, e, C.wire, 0, y + yy, zc + sz); for (let k = 1; k <= 3; k++) box(L, e, Hb, e, C.wire, -Wb / 2 + k * Wb / 4, y + Hb / 2, zc + sz); }
  box(L, 0.6, 0.04, 0.05, C.handle, 0, 1.08, z0 - 0.04); box(L, 0.03, 0.42, 0.03, C.wireDk, -0.27, 0.86, z0 + 0.02); box(L, 0.03, 0.42, 0.03, C.wireDk, 0.27, 0.86, z0 + 0.02);
  box(L, 0.5, 0.02, 0.7, C.wireDk, 0, 0.18, zc); // 아래 선반
  for (const [sx, sz] of [[-0.24, zc - 0.36], [0.24, zc - 0.36], [-0.24, zc + 0.36], [0.24, zc + 0.36]]) { box(L, 0.025, 0.5, 0.025, C.wireDk, sx, 0.38, sz); box(L, 0.05, 0.1, 0.1, C.black, sx, 0.05, sz); }
  for (const [w, h, d, c, x, yy, z, rx, ry, rz] of load) box(L, w, h, d, c, x, y + 0.01 + yy + h / 2, zc + z, rx, ry, rz);
}
function flatCart(L, z0 = -0.38, load = []) {
  const zc = z0 - 0.7;
  box(L, 0.72, 0.06, 1.3, C.gray, 0, 0.24, zc);
  box(L, 0.05, 0.85, 0.05, C.wireDk, -0.32, 0.65, z0 + 0.02); box(L, 0.05, 0.85, 0.05, C.wireDk, 0.32, 0.65, z0 + 0.02); box(L, 0.7, 0.05, 0.05, C.handle, 0, 1.06, z0 + 0.02);
  for (const [sx, sz] of [[-0.3, zc - 0.55], [0.3, zc - 0.55], [-0.3, zc + 0.55], [0.3, zc + 0.55]]) box(L, 0.06, 0.16, 0.14, C.black, sx, 0.09, sz);
  for (const [w, h, d, c, x, y, z] of load) box(L, w, h, d, c, x, 0.27 + y + h / 2, zc + z);
}

/** 핸드 파렛트 트럭(직원 진열용): 손잡이 z = z0, 포크·파렛트·박스 더미가 앞(-z) */
function palletJack(L, z0 = -0.35, load = []) {
  const zc = z0 - 0.75;
  box(L, 0.05, 0.9, 0.05, C.handle, 0, 0.62, z0 + 0.02, -0.25); box(L, 0.36, 0.05, 0.05, C.handle, 0, 1.06, z0 + 0.12);
  box(L, 0.3, 0.16, 0.22, C.red, 0, 0.12, z0 - 0.12); box(L, 0.08, 0.1, 0.1, C.black, 0, 0.05, z0 - 0.06);
  for (const sx of [-0.2, 0.2]) box(L, 0.16, 0.06, 1.15, C.red, sx, 0.07, zc - 0.05);
  box(L, 0.8, 0.12, 1.0, C.kraft, 0, 0.16, zc); for (const sx of [-0.33, 0, 0.33]) box(L, 0.1, 0.02, 1.0, '#9a7348', sx, 0.23, zc);
  for (const [w, h, d, c, x, y, z] of load) box(L, w, h, d, c, x, 0.24 + y + h / 2, zc + z);
}
const BOXES = (cols) => { const out = []; let k = 0; for (let y = 0; y < 3; y++) for (const [x, z] of [[-0.2, -0.24], [0.2, -0.24], [-0.2, 0.24], [0.2, 0.24]]) { if (y === 2 && (k % 3 === 1)) { k++; continue; } out.push([0.36, 0.28, 0.44, cols[k++ % cols.length], x, y * 0.29, z]); } return out; };
const basket = (L, col) => (x, y, z) => { box(L, 0.34, 0.2, 0.24, col, x + 0.03, y - 0.2, z - 0.02); box(L, 0.012, 0.18, 0.012, '#3a3a3a', x - 0.1, y - 0.06, z - 0.02); box(L, 0.012, 0.18, 0.012, '#3a3a3a', x + 0.14, y - 0.06, z - 0.02); box(L, 0.1, 0.08, 0.08, C.yellow, x + 0.05, y - 0.06, z - 0.02); };
const STAFF = { shirt: '#f3eada', vest: '#1E5A45', pants: '#2a3340', badge: '#F2C230' };
// [depot-live] 배경 손님·직원 (활기) — 같은 리그·병합 방식, 유형당 메시 1개. ambient = 스토리 사건과 상관없이 매장을 채움
const AMBIENT_LOOKS = {
  'stocker-a': (L) => { const r = [person(L, { p: 0, shirt: STAFF.shirt, sleeve: 'long', vest: STAFF.vest, pants: STAFF.pants, badge: STAFF.badge, hat: 'cap', hatC: STAFF.vest, hair: C.hairBk, shoes: '#2a2420', pose: { armL: [0.72, 0], armR: [0.72, 0] } })];
    palletJack(L, -0.35, BOXES([C.kraft, '#b7834a', C.cream, '#d9a65a'])); return r; },
  'stocker-b': (L) => { const r = [person(L, { p: 0, s: 0.98, shirt: STAFF.shirt, sleeve: 'short', vest: STAFF.vest, pants: STAFF.pants, badge: STAFF.badge, hair: C.hairBr, hairStyle: 'pony', shoes: '#2a2420', pose: { armL: [0.72, 0], armR: [0.72, 0] } })];
    flatCart(L, -0.4, [[0.6, 0.26, 0.42, C.water, 0, 0, -0.35], [0.6, 0.26, 0.42, C.water, 0, 0.26, -0.35], [0.55, 0.3, 0.45, C.kraft, 0, 0, 0.15], [0.5, 0.26, 0.4, '#e9e4d8', 0, 0.3, 0.15]]); return r; },
  'crowd-1': (L) => { const r = [person(L, { p: 0, shirt: '#7b5aa6', sleeve: 'long', pants: '#2b2f3a', hair: C.hairBk, hairStyle: 'long', shoes: '#f4f2ec', blush: true })]; stdCart(L, -0.38, [[0.3, 0.2, 0.25, '#e8b0a0', -0.08, 0, 0.1], [0.14, 0.3, 0.14, '#4c8a3a', 0.15, 0, -0.15]]); return r; },
  'crowd-2': (L) => { const r = [person(L, { p: 0, w: 1.1, shirt: '#2f6fb0', sleeve: 'short', pants: C.khaki, hair: C.hairBk, hairStyle: 'short', glasses: true, shoes: '#3a2f28' })]; stdCart(L, -0.38, [[0.4, 0.26, 0.3, C.kraft, 0, 0, 0], [0.24, 0.26, 0.36, C.water, 0.1, 0.26, -0.1]]); return r; },
  'crowd-3': (L) => [person(L, { p: 0, s: 0.95, shirt: '#e0a030', sleeve: 'long', pants: '#3d5a8a', hair: C.hairBr, hairStyle: 'bob', shoes: '#6b4a32', pose: { armL: [0.9, 0.25], bendL: 1.7, swingR: true, pick: true }, hold: { l: basket(L, '#d9442e') } })],
  'crowd-4': (L) => { const r = [person(L, { p: 0, shirt: '#3a8f6a', hood: true, sleeve: 'long', pants: C.black, hair: C.hairBk, hairStyle: 'side', earbuds: true, shoes: '#e8e8e8' })]; stdCart(L, -0.38, [[0.2, 0.3, 0.14, '#f3a33c', -0.1, 0, 0], [0.34, 0.12, 0.26, C.yellow, 0.06, 0, 0.2]]); return r; },
  'crowd-5': (L) => { const r = [person(L, { p: 0, s: 0.94, stoop: 0.12, shirt: '#c0567a', sleeve: 'long', pants: '#5a5560', hair: C.gray2, hairStyle: 'perm', shoes: '#3a3030', glasses: true })]; stdCart(L, -0.38, [[0.36, 0.16, 0.28, '#9ad08a', 0, 0, 0], [0.2, 0.2, 0.2, '#b71c1c', 0.1, 0.16, 0.1]]); return r; },
  'crowd-6': (L) => { const r = [person(L, { p: 0, w: 1.05, shirt: C.white, collar: '#2a2c30', sleeve: 'long', pants: '#2a2c30', hair: C.hairBk, hairStyle: 'short', shoes: '#1c1c1c' })]; stdCart(L, -0.38, [[0.46, 0.3, 0.34, C.cream, 0, 0, -0.1], [0.46, 0.3, 0.34, C.cream, 0, 0.3, -0.1]]); return r; },
  kid: (L) => [person(L, { p: 0, s: 0.62, shirt: '#f2c230', stripes: '#d9442e', sleeve: 'short', pants: '#2f6fb0', shorts: true, socks: C.white, hair: C.hairBk, hairStyle: 'short', blush: true, mouth: 'o', shoes: '#e86a8a', pose: { swingL: true, swingR: true, armL: [0.3, 0], armR: [0.3, 0] } })],
  comparer: (L) => [person(L, { p: 0, shirt: '#8d6a48', sleeve: 'long', pants: C.jeans, hair: C.hairBr, hairStyle: 'bun', glasses: true, shoes: '#3a2f28', pose: { armL: [1.15, 0.35], armR: [1.15, -0.35], bend: 1.5, pick: false, noLookHold: true },
    hold: { l: (x, y, z) => box(L, 0.12, 0.17, 0.08, '#e2572a', x, y + 0.08, z - 0.04), r: (x, y, z) => box(L, 0.12, 0.17, 0.08, '#2f6fb0', x, y + 0.08, z - 0.04) } })],
  caller: (L) => [person(L, { p: 0, w: 1.05, shirt: '#5a6470', sleeve: 'long', coat: '#3a4048', pants: '#2a2c30', hair: C.hairBk, hairStyle: 'side', shoes: '#1c1c1c', mouth: 'o', pose: { armR: [2.75, -0.55], bendR: 2.6, armL: [0.25, 0], swingL: true, pick: false },
    hold: { r: (x, y, z) => box(L, 0.03, 0.14, 0.075, '#20232a', x - 0.02, y + 0.05, z) } })],
  // 시식 코너(6.5, 39.6): 말순 할머니(직원 앞치마) + 줄 선 손님 셋 — 제자리(fixed), 이쑤시개 내밀기·받아 먹기
  'sample-staff': (L) => [person(L, { p: 0, s: 0.92, stoop: 0.16, shirt: '#f3eada', sleeve: 'long', apron: STAFF.vest, pants: '#5a5560', hat: 'band', hair: C.gray2, hairStyle: 'perm', blush: true, mouth: 'smile', shoes: '#3a3030',
    pose: { armL: [0.95, 0.2], armR: [0.7, 0], bendL: 1.6, pick: true }, hold: { l: (x, y, z) => { box(L, 0.22, 0.02, 0.15, '#f3eada', x, y + 0.01, z - 0.04); for (let k = 0; k < 3; k++) box(L, 0.05, 0.03, 0.04, '#f2c230', x - 0.06 + k * 0.06, y + 0.035, z - 0.04); } } })],
  'sample-queue': (L) => [
    person(L, { p: 0, shirt: '#c0567a', sleeve: 'long', pants: '#3d3a48', hair: C.hairBk, hairStyle: 'long', shoes: '#f4f2ec', mouth: 'chew', blush: true, pose: { armL: [1.0, -0.35], armR: [0.2, 0], bendL: 2.2, pick: false }, hold: { l: (x, y, z) => box(L, 0.008, 0.09, 0.008, '#e8d4a8', x, y + 0.06, z - 0.02) } }),
    person(L, { p: 1, x: 0.25, z: 0.8, w: 1.08, shirt: '#2f6fb0', sleeve: 'short', pants: C.khaki, hair: C.hairBk, hairStyle: 'short', glasses: true, shoes: '#3a2f28', pose: { armL: [0.15, 0], armR: [0.15, 0], pick: false } }),
    person(L, { p: 2, x: 0.55, z: 1.55, s: 0.7, shirt: '#f2c230', sleeve: 'short', pants: '#2f6fb0', shorts: true, socks: C.white, hair: C.hairBr, hairStyle: 'bob', blush: true, mouth: 'o', shoes: '#e86a8a', pose: { armL: [0.3, 0.2], armR: [0.3, -0.2], pick: false } }),
  ],
};
// 제자리 배경 인물: 위치·방향 고정, 장애물 사각형 고정
const AMBIENT_FIXED = { 'sample-staff': { x: 7.75, z: 39.65, yaw: Math.PI, rect: null }, 'sample-queue': { x: 6.3, z: 41.75, yaw: 0, rect: { x0: 5.95, x1: 7.2, z0: 41.4, z1: 43.6 } } };
const AMBIENT_ORDER = ['sample-staff', 'stocker-a', 'sample-queue', 'crowd-1', 'kid', 'crowd-2', 'comparer', 'stocker-b', 'crowd-3', 'caller', 'crowd-4', 'crowd-5', 'crowd-6'];
const AMBIENT_MOBILE = 5; // (시식 직원은 예전 고정 마네킹 자리 대신이라 포함, 손님 4) // 모바일 손님 상한(배경) — 메시도 이 수만 만듦
const AMBIENT_SPEED = { 'stocker-a': 0.65, 'stocker-b': 0.75, kid: 1.9, comparer: 0.8, caller: 0.55 };
const AMBIENT_START = { 'stocker-a': [53.9, 77], 'stocker-b': [17.9, 44], 'crowd-1': [23.4, 107.2], 'crowd-2': [40.1, 44], 'crowd-3': [29.0, 107.2], 'crowd-4': [64.8, 77], 'crowd-5': [34.5, 77], 'crowd-6': [59.4, 107.2], kid: [40.1, 107.2], comparer: [17.9, 77], caller: [64.8, 44] };
// 유형별 사람들 + 카트. 반환 = 리그 배열
const LOOKS = {
  family: (L) => [
    person(L, { p: 0, x: -0.45, shirt: '#f6dc7a', stripes: '#fff6d8', collar: '#fff6d8', pants: C.jeans, hair: C.hairBr, hairStyle: 'short', shoes: '#6b4a32' }),
    person(L, { p: 1, x: 0.28, z: 0.1, shirt: C.mustard, tee: '#f4f2ec', sleeve: 'long', pants: '#e8e2d6', hair: C.hairBk, hairStyle: 'long', blush: true, shoes: '#f4f2ec', pose: { armL: [0.1, 0], armR: [0.5, -1.45], swingL: true, bendL: 0.3, bendR: 0.2 } }),
    person(L, { p: 2, x: 0.98, z: 0.1, s: 0.58, shirt: '#f08aa0', pants: '#6a7fb0', hair: C.hairBr, hairStyle: 'bob', blush: true, mouth: 'o', shoes: '#e05a5a', pose: { armL: [1.45, 1.57], armR: [0.1, 0], swingR: true, bendL: 0.15, bendR: 0.3 } }),
  ].concat((() => { const T = []; stdCart(T, -0.38, [[0.2, 0.18, 0.2, C.red, -0.12, 0, 0.1], [0.14, 0.26, 0.14, '#f08a2c', 0.12, 0, -0.1], [0.24, 0.12, 0.2, C.yellow, 0.05, 0.18, 0.12]]); T.forEach((g) => { g.translate(-0.45, 0, 0); L.push(g); });
    return [person(L, { p: 3, s: 0.5, x: -0.45, z: -0.6, y: 0.42, seated: true, shirt: '#e8f0f6', pants: C.jeans, hair: C.hairBr, hairStyle: 'short', blush: true, mouth: 'o', pose: { armL: [0.9, 0.2], armR: [1.0, -0.2], bend: 0.8 } })]; })()),
  couple: (L) => { const r = [
    person(L, { p: 0, x: -0.2, shirt: C.cream, hood: true, sleeve: 'long', pants: C.jeans, hair: C.hairBk, hairStyle: 'side', shoes: '#f4f2ec' }),
    person(L, { p: 1, x: 0.2, shirt: C.mint, hood: true, sleeve: 'long', pants: C.jeans, hair: C.hairBr, hairStyle: 'bob', blush: true, s: 0.96, shoes: '#f4f2ec' }),
  ]; stdCart(L, -0.38, [[0.18, 0.3, 0.12, '#f3a33c', -0.1, 0, 0], [0.12, 0.3, 0.12, '#f28a2c', 0.08, 0, 0.12], [0.22, 0.22, 0.16, '#e86a8a', 0.1, 0.2, -0.15], [0.05, 0.3, 0.05, '#4c8a3a', 0.1, 0.1, -0.15]]); return r; },
  'bulk-boss': (L) => { const r = [person(L, { p: 0, s: 1.06, w: 1.28, belly: true, shirt: C.white, sleeve: 'short', pants: C.black, hat: 'band', hair: C.hairBk, hairStyle: 'short', apron: C.kraft, beard: '#3a3430', mouth: 'flat', pose: { armL: [0.72, 0], armR: [0.72, 0] } })];
    flatCart(L, -0.4, [[0.6, 0.18, 0.4, C.cream, 0, 0, -0.4], [0.6, 0.18, 0.4, C.cream, 0, 0.18, -0.4], [0.6, 0.18, 0.4, C.cream, 0, 0.36, -0.42], [0.55, 0.3, 0.45, C.kraft, 0, 0, 0.1], [0.55, 0.3, 0.45, C.kraft, 0, 0.3, 0.1], [0.5, 0.26, 0.4, '#b7834a', 0, 0.6, 0.12]]); return r; },
  'sample-uncle': (L) => { const r = [person(L, { p: 0, shirt: C.cream, sleeve: 'long', vest: '#8d6a48', plaid: '#5a3e26', pants: C.brown, hat: 'bucket', hatC: '#b89a6a', hair: C.gray2, belly: true, glasses: true, mouth: 'chew', shoes: '#4a3a2a',
    pose: { armL: [1.0, -0.35], armR: [0.75, 0], bendL: 2.2, pick: false }, hold: { l: (x, y, z) => { for (let k = 0; k < 4; k++) box(L, 0.008, 0.09, 0.008, '#e8d4a8', x + 0.02 * k - 0.03, y + 0.06, z - 0.02); } } })];
    stdCart(L, -0.38, [[0.12, 0.08, 0.1, C.yellow, 0.1, 0, 0.2]]); return r; },
  'gym-bro': (L) => { const r = [person(L, { p: 0, w: 1.15, shirt: C.yellow, sleeve: 'none', pants: C.black, shorts: true, socks: C.white, wrist: C.white, shoes: '#e8e8e8', hair: C.hairBk, hairStyle: 'short', mouth: 'smile',
    pose: { armL: [2.9, 0.1], armR: [0.75, 0], bendL: 2.6, pick: false }, hold: { l: (x, y, z) => { for (const [dx, dz] of [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06], [0, 0]]) cyl(L, 0.05, 0.24, C.water, x + dx, y + 0.14, z + dz, 0, 0, 0, 6); } } })];
    stdCart(L, -0.38, [[0.24, 0.26, 0.36, C.water, -0.12, 0, -0.1], [0.24, 0.26, 0.36, C.water, 0.13, 0, -0.1], [0.24, 0.26, 0.36, C.water, 0, 0, 0.26]]); return r; },
  'sale-hunter': (L) => { const r = [person(L, { p: 0, s: 0.96, stoop: 0.18, shirt: C.red, sleeve: 'short', pants: '#2b3550', hat: 'visor', hatC: C.red, hair: C.hairBk, hairStyle: 'pony', bag: C.brown, shoes: '#6b4a32', mouth: 'smile', blush: true })];
    stdCart(L, -0.38, [[0.34, 0.22, 0.3, C.yellow, 0, 0, 0], [0.1, 0.1, 0.1, C.red, 0.14, 0.22, 0.06]]); return r; },
  'phone-zombie': (L) => { const r = [person(L, { p: 0, shirt: C.yellow, sleeve: 'long', tee: C.white, collar: C.yellow, pants: '#3c4048', hair: C.hairBk, hairStyle: 'side', earbuds: true, mouth: 'flat', shoes: '#6b4a32',
    pose: { armL: [0.5, -0.45], armR: [0.75, 0], bendL: 1.6, headPitch: -0.45, noLook: true, pick: false }, hold: { l: (x, y, z) => box(L, 0.075, 0.14, 0.015, '#20232a', x + 0.01, y + 0.07, z - 0.03, 0.4) } })];
    stdCart(L, -0.38, [[0.16, 0.2, 0.12, C.white, 0.1, 0, 0.1]]); return r; },
  'camping-dad': (L) => { const r = [person(L, { p: 0, w: 1.08, shirt: C.white, sleeve: 'short', vest: C.olive, vestPockets: '#4a5530', pants: C.khaki, hat: 'cap', hatC: C.olive, hair: C.hairBr, beard: '#5a3a22', shoes: '#5a4632' })];
    stdCart(L, -0.38, [[0.42, 0.3, 0.34, C.kraft, -0.04, 0, -0.18], [0.36, 0.26, 0.28, C.blue, 0.06, 0, 0.22], [0.42, 0.04, 0.5, C.green, 0.36, 0.3, 0.05, 0, 0, 0.5]]); return r; }, // 접이식 의자가 옆으로 삐져나옴
  spy: (L) => [person(L, { p: 0, s: 1.02, shirt: '#e8e2d6', coat: '#C9A877', coatInner: '#e8e2d6', sleeve: 'long', sleeveC: '#C9A877', pants: '#3a3448', hat: 'cap', hatC: '#6B4FA0', hair: '#1C1C20', skin: '#E8C29C', shades: true, beard: '#1C1C20', scarf: '#5A3E8E', badge: '#d9b030', mouth: 'flat', shoes: '#2a2430',
    pose: { armL: [0.25, 0.15], armR: [0.1, 0], bendL: 1.3, bendR: 0.3, swingR: true, pick: true },
    hold: { l: (x, y, z) => { box(L, 0.3, 0.16, 0.2, '#6B4FA0', x, y - 0.13, z - 0.04); box(L, 0.014, 0.14, 0.014, '#4a3478', x - 0.12, y - 0.01, z - 0.04); box(L, 0.014, 0.14, 0.014, '#4a3478', x + 0.12, y - 0.01, z - 0.04); box(L, 0.1, 0.07, 0.07, '#f2c230', x - 0.05, y - 0.02, z - 0.04); box(L, 0.08, 0.06, 0.06, '#f2c230', x + 0.07, y - 0.03, z - 0.04); } } })],
  elder: (L) => [person(L, { p: 0, s: 0.93, stoop: 0.22, shirt: '#b8a0c8', sleeve: 'long', pants: '#5a5560', hair: C.gray2, hairStyle: 'perm', glasses: true, blush: true, shoes: '#3a3030',
    pose: { armL: [0.2, 0.1], armR: [0.15, 0], bendL: 1.2, bendR: 0.5, swingL: false, swingR: true, pick: false },
    hold: { r: (x, y, z) => { cyl(L, 0.012, 0.72, '#6a4a30', x, y - 0.36, z - 0.02); box(L, 0.1, 0.02, 0.02, '#6a4a30', x, y + 0.01, z - 0.06); },
      l: (x, y, z) => { box(L, 0.24, 0.13, 0.15, '#d84a3a', x, y - 0.12, z - 0.02); box(L, 0.012, 0.12, 0.012, '#b03a2a', x - 0.1, y - 0.01, z - 0.02); box(L, 0.012, 0.12, 0.012, '#b03a2a', x + 0.1, y - 0.01, z - 0.02); box(L, 0.08, 0.06, 0.06, '#8ac04a', x, y - 0.03, z - 0.02); } } })],
};
const WIDTH = { family: 1.0, couple: 0.6, 'bulk-boss': 0.55, 'camping-dad': 0.62, elder: 0.32, spy: 0.34, 'stocker-a': 0.55, 'stocker-b': 0.5, 'crowd-3': 0.36, kid: 0.26, comparer: 0.36, caller: 0.34 };
const LEN = { 'bulk-boss': 1.95, elder: 0.5, spy: 0.55, 'stocker-a': 1.75, 'stocker-b': 1.95, 'crowd-3': 0.5, kid: 0.4, comparer: 0.5, caller: 0.5 };
const EXTRA_TYPES = [{ id: 'elder', name: '지팡이 어르신', speed: 0.55 }, { id: 'spy', name: '수상한 손님', speed: 1.0 }];

export function createShoppers({ scene, keep = (x) => x, obstacles, isBlocked, types, isMobile = false }) {
  const root = new THREE.Group(); root.name = 'depot-shoppers'; scene.add(root);
  // 관절 셰이더: aBone 번호의 (pitch, yaw) 로 aPivot 축 둘레를 돌림 — 손님 유형마다 재질(유니폼)만 따로, 프로그램은 하나
  const makeMat = () => {
    const m = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const uRot = { value: Array.from({ length: MAX_BONES }, () => new THREE.Vector2()) };
    m.userData.uRot = uRot;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRot = uRot;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute float aBone; attribute vec3 aPivot; uniform vec2 uRot[${MAX_BONES}];
mat3 npcRot() { vec2 a = uRot[int(aBone + 0.5)]; float cp = cos(a.x), sp = sin(a.x), cy = cos(a.y), sy = sin(a.y);
  return mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy) * mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp); }`)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nmat3 npcR = npcRot(); objectNormal = npcR * objectNormal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = aPivot + npcR * (transformed - aPivot);');
    };
    m.customProgramCacheKey = () => 'depot-npc-rig';
    return m;
  };
  // 그래프: 정적 장애물로 막힌 구간 제거
  const nodes = [], key = (x, z) => `${x},${z}`, idx = new Map();
  const add = (x, z) => { const k = key(x, z); if (!idx.has(k)) { idx.set(k, nodes.length); nodes.push({ x, z, nb: [] }); } return idx.get(k); };
  for (const x of COLS) for (const z of ROWS) add(x, z);
  for (const [x, z] of EXTRA) add(x, z);
  const clear = (a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5); for (let i = 0; i <= n; i++) { const t = i / n; if (isBlocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.5)) return false; } return true; };
  const link = (i, j) => { if (i === j || nodes[i].nb.includes(j)) return; if (clear(nodes[i], nodes[j])) { nodes[i].nb.push(j); nodes[j].nb.push(i); } };
  const byRow = new Map(), byCol = new Map();
  nodes.forEach((n, i) => { (byRow.get(n.z) || byRow.set(n.z, []).get(n.z)).push(i); (byCol.get(n.x) || byCol.set(n.x, []).get(n.x)).push(i); });
  for (const l of byRow.values()) { l.sort((a, b) => nodes[a].x - nodes[b].x); for (let k = 1; k < l.length; k++) link(l[k - 1], l[k]); }
  for (const l of byCol.values()) { l.sort((a, b) => nodes[a].z - nodes[b].z); for (let k = 1; k < l.length; k++) link(l[k - 1], l[k]); }
  const usable = nodes.map((n, i) => i).filter((i) => nodes[i].nb.length);
  const nearestNode = (x, z) => usable.reduce((b, i) => (Math.hypot(nodes[i].x - x, nodes[i].z - z) < Math.hypot(nodes[b].x - x, nodes[b].z - z) ? i : b), usable[0]);

  const list = [];
  const T = Object.fromEntries([...(types || []), ...EXTRA_TYPES].map((t) => [t.id, t]));
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const START = { family: [29.0, 44], couple: [53.9, 77], 'bulk-boss': [47.2, 44], 'sample-uncle': [64.8, 107.2], 'gym-bro': [59.4, 44], 'sale-hunter': [40.1, 77], 'phone-zombie': [34.5, 44], 'camping-dad': [69.4, 77], elder: [23.4, 77], spy: [47.2, 107.2] };
  const ambIds = AMBIENT_ORDER.slice(0, isMobile ? AMBIENT_MOBILE : AMBIENT_ORDER.length);
  for (const id of [...Object.keys(LOOKS), ...ambIds]) {
    const amb = !LOOKS[id];
    const L = []; const rigs = (LOOKS[id] || AMBIENT_LOOKS[id])(L);
    const g = keep(mergeGeometries(L)); L.forEach((x) => x.dispose()); g.computeBoundingSphere(); g.boundingSphere.radius += 0.5; // 팔 들어 올림 여유
    const mat = makeMat();
    const mesh = new THREE.Mesh(g, mat); mesh.name = `shopper-${id}`; mesh.matrixAutoUpdate = true;
    root.add(mesh);
    const [sx, sz] = START[id] || AMBIENT_START[id] || [47.2, 44];
    const n0 = nearestNode(sx, sz);
    const t = T[id] || { name: id.startsWith('stocker') ? '진열 직원' : id === 'kid' ? '뛰는 꼬마' : id === 'sample-staff' ? '시식 직원' : id === 'sample-queue' ? '시식 줄' : '손님', speed: AMBIENT_SPEED[id] }, speed = t.speed || 1.0 + rnd() * 0.25;
    const rect = { x0: 0, x1: 0, z0: 0, z1: 0, npc: id };
    list.push({ id, name: t.name || id, mesh, x: nodes[n0].x, z: nodes[n0].z, yaw: 0, from: n0, to: n0, prev: -1, speed, v: 0, stopT: 1 + rnd() * 3, phase: rnd() * 6, rect, active: true, sprintT: 0, visits: 0, inZoneT: 0, zone: '', len: LEN[id] || 1.45, half: WIDTH[id] || 0.42, skew: 0, rigs, uRot: mat.userData.uRot.value, wp: rnd() * 6, hy: 0, pickT: 0, pickSide: 1, ambient: amb });
  }
  for (const n of list) { const f = AMBIENT_FIXED[n.id]; if (!f) continue; n.fixed = f; n.x = f.x; n.z = f.z; n.yaw = f.yaw; n.stopT = 1e9; n.restock = n.id === 'sample-staff'; n.pickSide = -1; n.mesh.position.set(f.x, 0, f.z); n.mesh.rotation.y = f.yaw; }
  const zoneOf = (x, z) => { for (const [k, pts] of Object.entries(ZONES)) for (const [zx, zz] of pts) if (Math.abs(zx - x) < 2.5 && Math.abs(zz - z) < 6) return k; return ''; };
  const WANT = { family: ['snack', 'produce'], couple: ['produce', 'snack'], 'bulk-boss': ['rice', 'water'], 'sample-uncle': ['deli', 'bakery'], 'gym-bro': ['water'], 'sale-hunter': ['snack', 'rice'], 'phone-zombie': [], 'camping-dad': ['seasonal'], elder: ['produce', 'bakery'], spy: ['snack', 'rice'] };
  function pickNext(n) {
    const node = nodes[n.to], opts = node.nb.filter((j) => j !== n.prev);
    const pool = opts.length ? opts : node.nb; if (!pool.length) return n.to;
    // 관심 구역 쪽으로 약하게 끌림
    const want = WANT[n.id] || [];
    let best = pool[Math.floor(rnd() * pool.length)];
    if (want.length && rnd() < 0.6) {
      const tgt = ZONES[want[Math.floor(rnd() * want.length)]][0];
      best = pool.reduce((b, j) => (Math.hypot(nodes[j].x - tgt[0], nodes[j].z - tgt[1]) < Math.hypot(nodes[b].x - tgt[0], nodes[b].z - tgt[1]) ? j : b), pool[0]);
      if (best === n.prev && pool.length > 1 && rnd() < 0.5) best = pool[Math.floor(rnd() * pool.length)];
    }
    return best;
  }
  function setRect(n) {
    if (n.fixed) { const r = n.fixed.rect; if (r) Object.assign(n.rect, r); else Object.assign(n.rect, OFF); return; } // 시식 직원은 매대 장애물 안

    const fx = -Math.sin(n.yaw), fz = -Math.cos(n.yaw), cx = n.x + fx * (n.len / 2 - 0.25), cz = n.z + fz * (n.len / 2 - 0.25);
    const hx = Math.abs(fx) * n.len / 2 + Math.abs(fz) * n.half, hz = Math.abs(fz) * n.len / 2 + Math.abs(fx) * n.half;
    n.rect.x0 = cx - hx; n.rect.x1 = cx + hx; n.rect.z0 = cz - hz; n.rect.z1 = cz + hz;
  }
  const OFF = { x0: -999, x1: -998, z0: -999, z1: -998 };
  for (const n of list) { setRect(n); obstacles.push(n.rect); }

  function setActive(ids) {
    const on = new Set(ids);
    for (const n of list) { n.active = on.has(n.id); n.mesh.visible = n.active; if (!n.active) Object.assign(n.rect, OFF); else setRect(n); }
  }
  let t = 0;
  function tick(dt, { me, cart } = {}) {
    t += dt;
    for (const n of list) {
      if (!n.active) continue;
      if (n.fixed) { // 제자리: 직원은 이쑤시개 쟁반 내밀기(집기 동작), 줄 맨 앞은 오물오물 · 가끔 한 칸 앞으로 들썩
        n.v = 0; n.stopT = 1e9;
        n.mesh.position.y = n.id === 'sample-queue' ? Math.max(0, Math.sin(t * 0.5 + n.phase)) ** 8 * 0.03 : 0;
        animate(n, dt, me); continue;
      }
      const a = nodes[n.to];
      // 정지(유형별 습관)
      if (n.stage) { n.stage.t -= dt; n.v = 0; n.stopT = Math.max(n.stopT, 0.5); if (n.stage.t <= 0) { Object.assign(n, n.stage.back); n.stage = null; n.stopT = 1; } } // 연출로 잠깐 세운 뒤 원래 자리로
      if (n.stopT > 0) { n.stopT -= dt; n.v = Math.max(0, n.v - dt * 3); }
      else {
        let vmax = n.speed;
        if (n.id === 'sale-hunter') { n.sprintT -= dt; if (n.sprintT < -6) n.sprintT = 4; vmax = n.sprintT > 0 ? 2.4 : 1.0; }
        // 앞에 플레이어·카트·다른 손님이 있으면 기다림
        const tx = a.x - n.x, tz = a.z - n.z, tl = Math.hypot(tx, tz) || 1, fx = tl > 0.1 ? tx / tl : -Math.sin(n.yaw), fz = tl > 0.1 ? tz / tl : -Math.cos(n.yaw); // 가는 방향 기준
        const ahead = (x, z, r) => { const dx = x - n.x, dz = z - n.z, f = dx * fx + dz * fz, s = Math.abs(dx * fz - dz * fx); return f > 0 && f < n.len + r && s < n.half + 0.5; };
        let blocked = (me && ahead(me.x, me.z, 0.6)) || (cart && ahead(cart.x, cart.z, 0.9));
        for (const o of list) if (o !== n && o.active && ahead(o.x, o.z, 0.8)) { blocked = true; break; }
        if (blocked) { n.waitT = (n.waitT || 0) + dt; vmax = 0; if (n.waitT > 3 + n.phase * 0.3) { const back = n.from; n.prev = n.to; n.from = n.to; n.to = back; n.waitT = 0; n.yaw = Math.atan2(-(nodes[back].x - n.x), -(nodes[back].z - n.z)); } } else n.waitT = 0;
        n.v += Math.sign(vmax - n.v) * Math.min(Math.abs(vmax - n.v), dt * 2.2);
      }
      const dx = a.x - n.x, dz = a.z - n.z, d = Math.hypot(dx, dz);
      if (d < 0.08) {
        n.prev = n.from; n.from = n.to; n.to = pickNext(n);
        const z = zoneOf(a.x, a.z);
        if (z && (WANT[n.id] || []).includes(z)) { n.stopT = 3 + rnd() * 5; if (n.id === 'sample-uncle' && z === 'deli') n.visits++; }
        if (n.id === 'family' && rnd() < 0.35) n.stopT = 6 + rnd() * 4;
        if (n.id === 'phone-zombie' && rnd() < 0.45) { n.stopT = 10 + rnd() * 10; n.skew = (rnd() < 0.5 ? -1 : 1) * 0.45; }
        if (n.id === 'couple' && rnd() < 0.25) n.stopT = 3 + rnd() * 3;
        // 배경: 진열 직원은 랙 앞에서 오래 서서 채우고, 비교 손님은 두 상품을 들고 번갈아 보고, 통화 손님은 자주 멈춤, 꼬마는 잠깐씩 멈칫
        if (n.id.startsWith('stocker') && rnd() < 0.55) { n.stopT = 7 + rnd() * 6; n.restock = true; n.pickSide = rnd() < 0.5 ? 1 : -1; }
        if (n.id === 'comparer' && rnd() < 0.5) { n.stopT = 8 + rnd() * 7; n.compare = true; }
        if (n.id === 'caller' && rnd() < 0.4) n.stopT = 5 + rnd() * 6;
        if (n.id === 'kid' && rnd() < 0.2) n.stopT = 0.8 + rnd() * 1.2;
        if (n.id.startsWith('crowd') && rnd() < 0.3) n.stopT = 2 + rnd() * 4;
      } else if (n.v > 0) {
        const step = Math.min(d, n.v * dt); n.x += dx / d * step; n.z += dz / d * step;
        const want = Math.atan2(-dx, -dz);
        let dy = want - n.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); n.yaw += dy * Math.min(1, dt * (n.id === 'bulk-boss' ? 2.5 : 5));
        // 갑자기 멈춤 (휴대폰) — 통로 한가운데에서
        if (n.id === 'phone-zombie' && n.stopT <= 0 && rnd() < dt * 0.04) { n.stopT = 10 + rnd() * 8; n.skew = (rnd() < 0.5 ? -1 : 1) * 0.45; }
        if (n.id === 'family' && n.stopT <= 0 && rnd() < dt * 0.02) n.stopT = 6 + rnd() * 4;
      }
      if (n.stopT <= 0) { n.skew *= Math.max(0, 1 - dt * 2); n.restock = false; n.compare = false; }
      const zig = n.id === 'couple' ? Math.sin(t * 0.9 + n.phase) * 0.28 : 0; // 둘이 의견이 달라 좌우로 흔들림
      const bob = n.v > 0.05 ? Math.abs(Math.sin(t * 7 * Math.max(0.6, n.v) + n.phase)) * 0.025 : 0;
      n.mesh.position.set(n.x + Math.cos(n.yaw) * zig, bob, n.z - Math.sin(n.yaw) * zig);
      n.mesh.rotation.y = n.yaw + n.skew + (n.id === 'couple' ? Math.sin(t * 0.9 + n.phase + 1) * 0.08 : 0);
      animate(n, dt, me);
      setRect(n);
      const z = zoneOf(n.x, n.z); if (z === n.zone) n.inZoneT += dt; else { n.zone = z; n.inZoneT = 0; }
    }
  }
  // 관절: 걷기(다리·팔 흔들기), 플레이어 쪽으로 고개, 멈춰 있을 때 선반에서 물건 집기
  function animate(n, dt, me) {
    const a = Math.min(1, n.v / 0.7), U = n.uRot;
    n.wp += dt * (2.2 + n.v * 4.2);
    let look = Math.sin(t * 0.45 + n.phase) * 0.25 * (1 - a);
    if (me) { const dx = me.x - n.x, dz = me.z - n.z, d = Math.hypot(dx, dz); if (d < 7 && d > 0.3) { let r = Math.atan2(-dx, -dz) - n.mesh.rotation.y; r = Math.atan2(Math.sin(r), Math.cos(r)); if (Math.abs(r) < 1.9) look = Math.max(-0.85, Math.min(0.85, r)); } }
    // 집기: 관심 구역에서 멈춤 → 2.6초 주기로 한쪽 팔을 선반으로
    const picking = n.stopT > 0.6 && ((n.zone && (WANT[n.id] || []).includes(n.zone)) || n.restock);
    if (picking) { n.pickT += dt; if (n.pickT > 5.2) { n.pickT = 0; n.pickSide = -n.pickSide; } } else n.pickT = 0;
    const pk = picking ? Math.max(0, Math.sin(Math.min(1, n.pickT / 2.6) * Math.PI)) : 0;
    if (pk > 0.05) look = -n.pickSide * 1.0 * pk + look * (1 - pk);
    if (n.compare && n.stopT > 0.3) look = (Math.sin(t * 1.9 + n.phase) > 0 ? 0.42 : -0.42); // 두 상품 번갈아 보기
    n.hy += (look - n.hy) * Math.min(1, dt * 4);
    const sw = Math.sin(n.wp) * a;
    for (const r of n.rigs) {
      const b = 1 + r.p * 6, f = r.kid ? 1.25 : 1, sl = Math.sin(n.wp * f) * a * (n.id === 'kid' ? 1.5 : 1);
      let [lp, ly] = r.armL, [rp, ry] = r.armR;
      if (r.swingL) lp += -sl * 0.42; if (r.swingR) rp += sl * 0.42;
      if (r.pick && pk > 0) { if (n.pickSide > 0) { rp += (1.75 - rp) * pk; ry += (-1.15 - ry) * pk; } else { lp += (1.75 - lp) * pk; ly += (1.15 - ly) * pk; } }
      U[b + PART.armL].set(lp, ly); U[b + PART.armR].set(rp, ry);
      U[b + PART.head].set(r.headPitch + (r.kid ? Math.sin(t * 1.3 + n.phase) * 0.08 : 0), r.noLook ? Math.sin(t * 0.3 + n.phase) * 0.06 : r.kid ? n.hy * 0.6 + Math.sin(t * 0.7 + n.phase) * 0.3 : n.hy);
      if (r.legs) { U[b + PART.legL].set(sl * 0.48, 0); U[b + PART.legR].set(-sl * 0.48, 0); }
    }
    return sw;
  }
  function stage(id, x, z, yaw, sec) { const n = list.find((q) => q.id === id && q.active); if (!n) return false; n.stage = { t: sec, back: n.stage?.back || { x: n.x, z: n.z, yaw: n.yaw, from: n.from, to: n.to, prev: n.prev } }; n.x = x; n.z = z; n.yaw = yaw; n.v = 0; n.skew = 0; return true; }
  function rush(id, sec) { const n = list.find((q) => q.id === id && q.active); if (!n || n.stage) return; n.sprintT = sec; n.stopT = 0; }
  const near = (id, x, z, r) => list.find((n) => n.active && n.id === id && Math.hypot(n.x - x, n.z - z) < r) || null;
  function dispose() { for (const n of list) { const i = obstacles.indexOf(n.rect); if (i >= 0) obstacles.splice(i, 1); } root.removeFromParent(); }
  /** 배경 손님·직원 id (우선순위 순, n 명까지 · 모바일은 만든 만큼만) */
  const ambient = (n = 99) => list.filter((x) => x.ambient).slice(0, n).map((x) => x.id);
  return { root, list, tick, setActive, near, stage, rush, nodes, dispose, ambient, get count() { return list.filter((n) => n.active).length; } };
}
