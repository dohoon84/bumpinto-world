// [roadster] 로우폴리 범용 2인승 스포츠카 'Rocket Roadster' + 에어 스러스터 분사(흰 공기 제트) + 흡착(suction) 글로우
// 상표/로고/배지 없음. 특정 차량 디자인 복제 아님 (일반적인 쐐기형 로드스터 실루엣)
// 로컬 좌표: 원점 = 차체 바닥 중심(지면 접점), 앞 = +z, 위 = +y, 길이 ~4.2 m, 폭 ~1.9 m
import * as THREE from 'three';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
function sideExtrude(points, width, mat, bevel = 0.04) {
  const s = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 4 });
  g.rotateY(-Math.PI / 2); g.translate(width / 2, 0, 0); // shape x -> +z(앞), 압출 -> x(폭)
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}

// 흰 공기 제트: 노즐에서 뻗는 원뿔 2겹 + 흘러가는 퍼프(시간 함수로 결정적)
function makePlume(len = 2.6, radius = 0.32) {
  const g = new THREE.Group();
  const outerG = new THREE.ConeGeometry(radius, len, 10, 1, true); outerG.translate(0, -len / 2, 0); outerG.rotateX(Math.PI); // 꼭짓점=노즐(0), 몸통 -y... 아래에서 다시 회전
  const outer = new THREE.Mesh(outerG, new THREE.MeshBasicMaterial({ color: '#eef7ff', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
  const coreG = new THREE.ConeGeometry(radius * 0.45, len * 0.6, 8, 1, true); coreG.translate(0, -len * 0.3, 0); coreG.rotateX(Math.PI);
  const core = new THREE.Mesh(coreG, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  g.add(outer, core);
  const puffs = [];
  const pg = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: '#f6fbff', transparent: true, opacity: 0.4, depthWrite: false }));
    g.add(p); puffs.push(p);
  }
  // 위 rotateX(π) 후: 꼭짓점 y=0, 몸통은 +y 방향으로 len 만큼. => 그룹의 +y 가 분사 방향
  g.userData = { outer, core, puffs, len, radius };
  g.visible = false;
  return g;
}
// k: 0..1 분사 강도, t: 시간(초)
export function setPlume(p, k, t, seed = 0) {
  p.visible = k > 0.02;
  if (!p.visible) return;
  const { outer, core, puffs, len, radius } = p.userData;
  const fl = 1 + 0.12 * Math.sin(t * 47 + seed * 3.1) + 0.08 * Math.sin(t * 83 + seed);
  const L = (0.35 + 0.65 * k) * fl;
  outer.scale.set(0.7 + 0.5 * k, L, 0.7 + 0.5 * k); core.scale.set(1, L, 1);
  outer.material.opacity = 0.25 + 0.3 * k; core.material.opacity = 0.45 + 0.4 * k;
  puffs.forEach((q, i) => {
    const ph = (t * 3.2 + i / puffs.length + seed * 0.37) % 1; // 0(노즐)->1(끝)
    const d = len * L * (0.25 + ph * 1.25);
    q.position.set(Math.sin(i * 2.4 + seed) * 0.12 * ph, d, Math.cos(i * 1.7 + seed) * 0.12 * ph);
    q.scale.setScalar(radius * (0.6 + ph * 2.6) * (0.6 + 0.6 * k));
    q.material.opacity = 0.42 * (1 - ph) * k;
  });
}

export function createRoadster() {
  const car = new THREE.Group();
  const body = new THREE.Group(); car.add(body); // 서스펜션 바운스용
  const white = lam('#ffffff', { emissive: '#4a4a4a' }), glass = lam('#1b2430'), dark = lam('#26292e'), tyre = lam('#151618'), rim = lam('#b8bec6');
  // 차체 측면 프로파일 [z(앞+), y]
  body.add(sideExtrude([[-2.05, 0.32], [1.95, 0.3], [2.12, 0.42], [2.05, 0.56], [1.3, 0.74], [0.55, 0.84], [-0.9, 0.86], [-1.7, 0.86], [-2.12, 0.78], [-2.15, 0.48]], 1.86, white));
  // 캐노피(유리) — 낮은 2인승
  body.add(sideExtrude([[0.65, 0.8], [0.05, 1.14], [-0.55, 1.18], [-1.35, 0.98], [-1.55, 0.84]], 1.44, glass, 0.03));
  // 범퍼/디퓨저/라이트 (로고·배지 없음)
  const diff = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.25), dark); diff.position.set(0, 0.36, -2.08); body.add(diff);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.05, 0.06), new THREE.MeshBasicMaterial({ color: '#e0283c' })); tail.position.set(0, 0.74, -2.17); body.add(tail);
  for (const s of [-1, 1]) { const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.06), new THREE.MeshBasicMaterial({ color: '#eaf6ff' })); hl.position.set(s * 0.62, 0.55, 2.1); hl.rotation.y = s * 0.15; body.add(hl); }
  // 바퀴
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14); wg.rotateZ(Math.PI / 2);
  const rg = new THREE.CylinderGeometry(0.2, 0.2, 0.27, 6); rg.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.86, 1.32], [0.86, 1.32], [-0.86, -1.32], [0.86, -1.32]]) {
    const w = new THREE.Group(); w.add(new THREE.Mesh(wg, tyre), new THREE.Mesh(rg, rim)); w.position.set(x, 0.34, z); w.children[0].castShadow = true;
    car.add(w); wheels.push(w);
  }
  // 노즐 + 분사: 후방 4개(뒤로), 하부 4개(아래로)
  const nozG = new THREE.CylinderGeometry(0.11, 0.14, 0.18, 10);
  const rear = [], down = [];
  for (const x of [-0.66, -0.22, 0.22, 0.66]) {
    const n = new THREE.Mesh(nozG, dark); n.rotation.x = Math.PI / 2; n.position.set(x, 0.52, -2.2); body.add(n);
    const p = makePlume(3.2, 0.26); p.position.set(x, 0.52, -2.28); p.rotation.x = -Math.PI / 2; body.add(p); rear.push(p); // +y -> -z
  }
  for (const [x, z] of [[-0.62, 1.55], [0.62, 1.55], [-0.62, -1.6], [0.62, -1.6]]) {
    const n = new THREE.Mesh(nozG, dark); n.position.set(x, 0.24, z); body.add(n);
    const p = makePlume(2.4, 0.3); p.position.set(x, 0.16, z); p.rotation.x = Math.PI; body.add(p); down.push(p); // +y -> -y
  }
  // 흡착 글로우 (차체 바닥과 노면 사이)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 3.8), new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.08; car.add(glow);
  car.userData = { body, wheels, rear, down, glow };
  return car;
}

export function setRoadsterFx(car, { rear = 0, down = 0, suction = 0, wheelAngle = 0, bounce = 0, t = 0 }) {
  const u = car.userData;
  u.rear.forEach((p, i) => setPlume(p, rear, t, i));
  u.down.forEach((p, i) => setPlume(p, down, t, i + 7));
  u.glow.material.opacity = suction * (0.45 + 0.15 * Math.sin(t * 12));
  u.glow.visible = suction > 0.01;
  u.wheels.forEach((w) => (w.rotation.x = wheelAngle));
  u.body.position.y = bounce;
}

// 주차된 일반 차량(이벤트 장애물)
export function createParkedCar(color = '#3a6ea5') {
  const g = new THREE.Group();
  g.add(sideExtrude([[-2.2, 0.32], [2.15, 0.32], [2.25, 0.7], [1.2, 0.86], [-2.1, 0.9], [-2.25, 0.62]], 1.78, lam(color)));
  g.add(sideExtrude([[0.95, 0.84], [0.3, 1.38], [-1.3, 1.4], [-1.85, 0.88]], 1.6, lam('#26303c'), 0.03));
  const wg = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10); wg.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.82, 1.4], [0.82, 1.4], [-0.82, -1.4], [0.82, -1.4]]) { const w = new THREE.Mesh(wg, lam('#151618')); w.position.set(x, 0.33, z); g.add(w); }
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}
