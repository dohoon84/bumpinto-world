// [econ-ui] 상점(11) 카드 썸네일 오프라인 렌더 — 게임에 이미 있는 탈것 모델을 한 번 그려 정적 WebP 로 저장한다.
//   상점 화면에는 3D 를 넣지 않는다(draw call·메모리 증가 없음). 실행: scripts/render-shop-thumbs.mjs
//   모델 출처: 첫 자전거 = src/entities/bike.js createKakaoBike · CR·1 = src/entities/roadBike/roadBikeModel.js createRoadBikeModel
//             스쿠터 = src/entities/vehicleKinds.js KINDS.scooter · 경차 = KINDS.kei (게임 NPC 차량, 색은 각 paint 목록 값)
//   조명은 게임(src/game.js)과 같은 HemisphereLight('#ffffff','#c9b99a',1.6) + DirectionalLight('#fff4e0',2.0)
import * as THREE from 'three';
import { createKakaoBike } from '../../src/entities/bike.js';
import { createRoadBikeModel, prewarmRoadBikeDecals, roadBikeDecalStats } from '../../src/entities/roadBike/roadBikeModel.js';
import { KINDS, vehicleMaterial } from '../../src/entities/vehicleKinds.js';

const W = 400, H = 240, SS = 2; // 카드 썸네일(약 200×120 CSS px)의 2배, 내부는 2배 더 크게 그려 축소(안티에일리어싱)
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W * SS, H * SS); renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

function npc(kind, color) { // 게임 NPC 차량: 병합 지오메트리 + 공유 재질, 차체(tint) 색은 인스턴스 색
  const m = new THREE.InstancedMesh(KINDS[kind].build(), vehicleMaterial(), 1);
  m.setMatrixAt(0, new THREE.Matrix4()); m.setColorAt(0, new THREE.Color(color)); return m;
}
// 첫 자전거: 게임 자전거(createKakaoBike) 모양을 그대로 쓰되 썸네일용 복제본만 동네 장바구니 자전거로 다시 칠한다(게임 코드는 그대로).
//   노란 차체·펜더 → 파스텔 민트, 앞 바구니 → 은색(철망 바구니 느낌), 공유 자전거 잠금장치 상자(뒷바퀴 앞 상자+검은 면)는 뺀다. 로고·글자 데칼은 원래 없음.
const MINT = '#8fd3c1', SILVER = '#c9ced6';
function everydayBike() {
  const g = createKakaoBike().clone(true);
  const frame = new THREE.MeshLambertMaterial({ color: MINT }), wire = new THREE.MeshLambertMaterial({ color: SILVER });
  const drop = [];
  g.traverse((o) => {
    if (!o.isMesh) return;
    const yellow = o.material?.color?.getHexString() === 'fee500';
    const p = o.position;
    const lock = o.parent === g && Math.abs(p.y - 0.5) < 1e-3 && (Math.abs(p.z + 0.36) < 1e-3 || Math.abs(p.z + 0.28) < 1e-3);
    if (lock) { drop.push(o); return; }
    if (yellow) o.material = o.parent !== g ? wire : frame; // 바구니는 그룹 안 → 은색
  });
  for (const o of drop) o.removeFromParent();
  return g;
}
const ITEMS = [
  { id: 'bike', make: () => everydayBike(), az: 62 },
  { id: 'roadbike', make: () => createRoadBikeModel(renderer, { colorway: 'black' }), az: 62 },
  { id: 'scooter', make: () => npc('scooter', '#c8202a'), az: 50 },
  { id: 'car', make: () => npc('kei', '#9cc3dc'), az: 40 },
];

function shoot(obj, az) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9b99a', 1.6));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.0); sun.position.set(-4, 8, 6); scene.add(sun);
  // 길이 방향을 +z 로 맞춘다(모델마다 축이 다를 수 있음)
  let box = new THREE.Box3().setFromObject(obj); const sz = box.getSize(new THREE.Vector3());
  if (sz.x > sz.z * 1.2) obj.rotation.y = -Math.PI / 2;
  const wrap = new THREE.Group(); wrap.add(obj); scene.add(wrap);
  wrap.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(wrap);
  const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  const cam = new THREE.PerspectiveCamera(24, W / H, 0.05, 100);
  const a = THREE.MathUtils.degToRad(az), el = THREE.MathUtils.degToRad(16);
  const dist = r / Math.sin(THREE.MathUtils.degToRad(24 / 2)) * 0.86;
  cam.position.set(c.x + dist * Math.cos(el) * Math.sin(a), c.y + dist * Math.sin(el), c.z + dist * Math.cos(el) * Math.cos(a));
  cam.lookAt(c);
  renderer.render(scene, cam);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const x = out.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(renderer.domElement, 0, 0, W, H);
  return out.toDataURL('image/webp', 0.9);
}

(async () => {
  const objs = ITEMS.map((it) => it.make());
  prewarmRoadBikeDecals();
  for (let i = 0; i < 100 && roadBikeDecalStats().drawn < roadBikeDecalStats().total; i++) await new Promise((r) => setTimeout(r, 50));
  const out = {};
  ITEMS.forEach((it, i) => { out[it.id] = shoot(objs[i], it.az); });
  window.__thumbs = out;
})().catch((e) => { window.__thumbsErr = String(e?.stack || e); });
