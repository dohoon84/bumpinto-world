// [taxi] 로우폴리 세단 택시 모델 + 도색(리버리)
//   ⚠ 모두 '느낌만 낸' 일반화 디자인. 실제 카카오T 로고/상표, 회사 도색을 복제하지 않음.
//   kakao   : 'kakao-style' 노란 차체 + 검은 지붕 표시등에 단순한 'T' 글자 (가맹택시 느낌)
//   orange  : 경기/성남 일반(법인)택시 느낌 — 주황 차체, 지붕 '택시' 표시등
//   silver  : 개인택시 느낌 — 은색 차체, 지붕 '개인' 표시등
//   white   : 일반택시 — 흰 차체, 지붕 '택시' 표시등
//   deluxe  : 모범/고급택시 느낌 — 검정 차체 + 금색 띠, 지붕 '모범' 표시등
import * as THREE from 'three';
import { isEvening, watchEvening } from '../evening.js';
import { addVehicleLamp } from '../vehicleLights.js';

export const TAXI_LIVERIES = {
  kakao: { label: '카카오T 스타일', tag: '#f6c700', tagFg: '#1b1b1b', body: '#f4c400', sign: { bg: '#202020', fg: '#f6c700', text: 'T', w: 0.62 }, weight: 0.36 },
  orange: { label: '일반택시', tag: '#ef7d22', tagFg: '#fff', body: '#ee7a20', sign: { bg: '#fff3cf', fg: '#c8261c', text: '택시', w: 0.8 }, weight: 0.2 },
  silver: { label: '개인택시', tag: '#8f99a6', tagFg: '#fff', body: '#c3c8ce', sign: { bg: '#ffd84a', fg: '#1c3c8c', text: '개인', w: 0.8 }, weight: 0.18 },
  white: { label: '일반택시', tag: '#5b6b7d', tagFg: '#fff', body: '#f2f2ef', sign: { bg: '#fff3cf', fg: '#1c3c8c', text: '택시', w: 0.8 }, weight: 0.16 },
  deluxe: { label: '모범택시', tag: '#1d1f22', tagFg: '#f2c14e', body: '#17181a', stripe: '#c9a23a', sign: { bg: '#f2c14e', fg: '#141414', text: '모범', w: 0.85 }, weight: 0.1 },
};
export function pickLivery(r) {
  let a = r; for (const [k, v] of Object.entries(TAXI_LIVERIES)) { a -= v.weight; if (a <= 0) return k; }
  return 'kakao';
}

const TAXI_LEN = 4.7;
export const taxiLength = () => TAXI_LEN;

// 공유 지오메트리
let G = null;
function geos() {
  if (G) return G;
  const body = new THREE.BoxGeometry(1.8, 0.62, 4.7); body.translate(0, 0.62, 0);
  const hood = new THREE.BoxGeometry(1.76, 0.14, 1.2); hood.translate(0, 0.98, 1.72); // 보닛 살짝 높임
  // 캐빈(유리): 옆에서 본 사다리꼴을 x 방향으로 돌출
  const s = new THREE.Shape(); // (a=-carZ, b=y)
  s.moveTo(1.25, 0.92); s.lineTo(-1.15, 0.92); s.lineTo(-0.38, 1.46); s.lineTo(0.85, 1.46); s.closePath();
  const cab = new THREE.ExtrudeGeometry(s, { depth: 1.62, bevelEnabled: false }); cab.rotateY(Math.PI / 2); cab.translate(-0.81, 0, 0);
  const roof = new THREE.BoxGeometry(1.5, 0.07, 1.18); roof.translate(0, 1.48, -0.24);
  const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10); wheel.rotateZ(Math.PI / 2);
  const lamp = new THREE.BoxGeometry(0.42, 0.14, 0.06), plate = new THREE.BoxGeometry(0.52, 0.13, 0.04), stripe = new THREE.BoxGeometry(1.84, 0.08, 4.4);
  stripe.translate(0, 0.74, 0);
  const bumper = new THREE.BoxGeometry(1.84, 0.2, 0.18);
  G = { body, hood, cab, roof, wheel, lamp, plate, stripe, bumper };
  return G;
}
const M = {};
const mat = (c) => (M[c] ||= new THREE.MeshLambertMaterial({ color: c }));
const cabMat = new THREE.MeshLambertMaterial({ color: '#2b3542' });
const cabGlowMat = new THREE.MeshBasicMaterial({ color: '#ffbf78' });
const cabs = [];
const signMats = {};
function signMaterials(sign) {
  const key = sign.text + sign.bg;
  if (signMats[key]) return signMats[key];
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 48;
  const g = cv.getContext('2d'); g.fillStyle = sign.bg; g.fillRect(0, 0, 128, 48);
  g.fillStyle = sign.fg; g.font = `bold ${sign.text.length > 1 ? 30 : 38}px "Noto Sans KR", "Malgun Gothic", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(sign.text, 64, 26);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshBasicMaterial({ map: tex }), side = new THREE.MeshLambertMaterial({ color: sign.bg, emissive: sign.bg, emissiveIntensity: 0.25 });
  // BoxGeometry 면 순서: +x, -x, +y, -y, +z(앞), -z(뒤)
  return (signMats[key] = [side, side, side, side, face, face]);
}

export function createTaxi(liveryKey) {
  const L = TAXI_LIVERIES[liveryKey] || TAXI_LIVERIES.kakao, g = geos();
  const root = new THREE.Group(); root.name = 'taxi-' + liveryKey;
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; root.add(o); return o; };
  add(g.body, mat(L.body)); add(g.hood, mat(L.body));
  const cab = add(g.cab, cabMat); cabs.push(cab);
  add(g.roof, mat(L.body));
  if (L.stripe) add(g.stripe, mat(L.stripe));
  for (const [x, z] of [[-0.82, 1.5], [0.82, 1.5], [-0.82, -1.5], [0.82, -1.5]]) add(g.wheel, mat('#1f1f22'), x, 0.34, z);
  add(g.bumper, mat('#3a3d42'), 0, 0.42, 2.36); add(g.bumper, mat('#3a3d42'), 0, 0.42, -2.36);
  for (const x of [-0.62, 0.62]) { add(g.lamp, mat('#fff8d6'), x, 0.8, 2.36); add(g.lamp, mat('#c3242b'), x, 0.8, -2.36); }
  const lamps = new THREE.Group();
  lamps.name = 'eveningLights';
  for (const x of [-0.62, 0.62]) {
    addVehicleLamp(lamps, { x, y: 0.8, z: 2.46, kind: 'head', lens: [0.48, 0.24], glow: [0.95, 0.58], beam: [5.4, 0.72] });
    addVehicleLamp(lamps, { x, y: 0.8, z: -2.46, dir: -1, kind: 'tail', lens: [0.4, 0.18], glow: [0.64, 0.38], beam: [1.8, 0.34] });
  }
  lamps.visible = isEvening();
  root.add(lamps);
  root.userData.releaseLights = watchEvening((on) => { lamps.visible = on; });
  add(g.plate, mat('#f4f4f4'), 0, 0.55, 2.46); add(g.plate, mat('#f4f4f4'), 0, 0.55, -2.46);
  const sg = new THREE.BoxGeometry(L.sign.w, 0.26, 0.3);
  const sign = new THREE.Mesh(sg, signMaterials(L.sign)); sign.position.set(0, 1.65, -0.15); root.add(sign);
  root.userData.livery = liveryKey;
  root.userData.own = { geos: [sg], cab };
  return root;
}

// [memory] 더 이상 쓰지 않는 택시(탑승 고스트 등) 해제: 이 택시만의 지붕 표시등 지오메트리와 저녁 조명 감시를 정리.
//   차체 지오메트리·재질·표시등 재질은 모든 택시가 공유하므로 유지.
export function disposeTaxi(root) {
  const u = root?.userData; if (!u?.own || u.disposed) return;
  u.disposed = true;
  u.releaseLights?.();
  root.removeFromParent();
  for (const g of u.own.geos) g.dispose();
  const i = cabs.indexOf(u.own.cab); if (i >= 0) cabs.splice(i, 1);
}

watchEvening((on) => {
  for (const cab of cabs) cab.material = on ? cabGlowMat : cabMat;
  for (const mats of Object.values(signMats)) mats[0].emissiveIntensity = on ? 0.7 : 0.25;
});
