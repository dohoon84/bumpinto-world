// [superbike] 슈퍼바이크 RR 저폴리 모델. 4기통 1000cc 레플리카 슈퍼스포츠 실측 치수(SB) 기준.
//   메모리 우선: 텍스처·환경맵 없이 정점 색 + 공유 재질 2개(램버트·발광), 부품은 움직이는 단위(차체·조향·앞/뒤 바퀴·사이드스탠드)로 병합.
//   좌표: +z 앞, +x 왼쪽, 원점 = 두 바퀴 접지점 가운데 지면.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MM = 0.001;
/** 실측 제원 (mm → m). 출처는 addons/superbike/README.md */
export const SB = {
  WB: 1457 * MM,
  LEN: 2073 * MM,
  WIDTH: 848 * MM,
  HEIGHT: 1205 * MM,
  SEAT: 832 * MM,
  RAKE: THREE.MathUtils.degToRad(90 - 66.4),
  TRAIL: 99.8 * MM,
  RF: 0.3, // 120/70 ZR17: 17" 림 + 84 mm 사이드월
  RR: 0.321, // 190/55 ZR17: 17" 림 + 104.5 mm 사이드월
  RIM: 0.216,
};
const AF = SB.WB / 2;
const AR = -SB.WB / 2;

const SB_COLORS = {
  white: '#eef0f2', black: '#15171a', grey: '#3a3d42', alu: '#a9adb3', ti: '#6d6a66', gold: '#d9a632',
  light: '#2f8fd8', dark: '#1d2d6b', red: '#d8262f', smoke: '#1f2833', tyre: '#1b1b1d',
};
const C = SB_COLORS;

const _c = new THREE.Color();
/** 정점 색을 칠하고 uv 는 버린다 (텍스처를 안 쓰니 메모리만 차지) */
function paint(geo, col) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  _c.set(col).convertSRGBToLinear();
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([_c.r, _c.g, _c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

const M4 = new THREE.Matrix4();
/**
 * 옆모습 윤곽(z, y)을 x 로 두께를 주어 판을 만든다.
 * @param {number[][]} pts [[z, y], ...]
 * @param {number} hw 반폭
 * @param {(z:number, y:number) => number} [taper] 위치별 폭 배율
 * @param {number} [bev] 모서리 둥글림
 */
function slab(pts, hw, col, taper, bev = 0.012) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const b = Math.min(bev, hw * 0.45);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.002, 2 * (hw - b)), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.6, bevelSegments: 1, curveSegments: 4,
  });
  // (sx, sy, sz) → (x = hw - b - sz, y = sy, z = sx): 회전만 있는 변환이라 면 방향이 유지된다
  geo.applyMatrix4(M4.set(0, 0, -1, hw - b, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  if (taper) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * taper(p.getZ(i), p.getY(i)));
    geo.computeVertexNormals();
  }
  return paint(geo, col);
}
const smooth = (a, b, v) => THREE.MathUtils.smoothstep(v, a, b);

function box(w, h, d, col, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z));
  return paint(g, col);
}
const _ya = new THREE.Vector3(0, 1, 0);
/** a → b 원통 */
function tube(a, b, r, col, seg = 6, r2 = r) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r2, r, d.length(), seg, 1);
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(_ya, d.normalize()),
    new THREE.Vector3(1, 1, 1),
  ));
  return paint(g, col);
}
/** x 축 원판(브레이크 디스크·스프라킷) */
function disc(r, w, col, x, seg = 16) {
  const g = new THREE.CylinderGeometry(r, r, w, seg, 1);
  g.rotateZ(Math.PI / 2);
  g.translate(x, 0, 0);
  return paint(g, col);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** 이탤릭 블록 글자 'R' 윤곽 (높이 1) */
function glyphR() {
  const it = (u, v) => new THREE.Vector2(u + v * 0.22, v);
  const s = new THREE.Shape([[0, 0], [0, 1], [0.52, 1], [0.7, 0.86], [0.7, 0.62], [0.54, 0.5], [0.72, 0], [0.5, 0], [0.34, 0.44], [0.2, 0.44], [0.2, 0]].map(([u, v]) => it(u, v)));
  s.holes.push(new THREE.Path([[0.2, 0.6], [0.45, 0.6], [0.51, 0.68], [0.51, 0.78], [0.45, 0.84], [0.2, 0.84]].map(([u, v]) => it(u, v))));
  return s;
}
/**
 * 옆면 'RR' 로고: 양쪽 모두 앞→뒤 방향으로 읽히게 (거울상 아님).
 * @param {number} z0 글자 시작(앞쪽) z, y0 밑줄 높이, x0 붙일 면의 반폭, h 글자 높이
 */
function rrDecal(z0, y0, x0, h, col) {
  const parts = [];
  for (const side of [1, -1]) {
    for (const k of [0, 1]) {
      const g = new THREE.ExtrudeGeometry(glyphR(), { depth: 0.004, bevelEnabled: false, curveSegments: 1 });
      g.scale(h, h, 1);
      g.translate(k * 0.82 * h, 0, 0);
      // (u, v, w): +x 면은 앞(+z)에서 뒤로 읽고 바깥(+x)으로 돋는다. -x 면은 그 반대. 둘 다 행렬식 +1
      if (side > 0) g.applyMatrix4(M4.set(0, 0, 1, x0, 0, 1, 0, y0, -1, 0, 0, z0, 0, 0, 0, 1));
      else g.applyMatrix4(M4.set(0, 0, -1, -x0, 0, 1, 0, y0, 1, 0, 0, z0 - 1.86 * h, 0, 0, 0, 1));
      parts.push(paint(g, col));
    }
  }
  return parts;
}

function merge(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

/** 바퀴 (원점 = 차축, 축 = x): 타이어·림·Y 스포크·허브 + 디스크/스프라킷 */
function wheel(R, halfW, front) {
  const parts = [];
  const tyre = new THREE.TorusGeometry((R + SB.RIM) / 2, (R - SB.RIM) / 2, 6, 22);
  tyre.rotateY(Math.PI / 2);
  tyre.scale(halfW / ((R - SB.RIM) / 2), 1, 1);
  parts.push(paint(tyre, C.tyre));
  const rim = new THREE.TorusGeometry(SB.RIM - 0.008, 0.012, 4, 22);
  rim.rotateY(Math.PI / 2);
  rim.scale(halfW / 0.012 * 0.85, 1, 1);
  parts.push(paint(rim, C.black));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    for (const da of [-0.09, 0.09]) {
      const s = box(0.03, SB.RIM - 0.05, 0.022, C.black, 0, 0, 0);
      s.translate(0, (SB.RIM - 0.05) / 2 + 0.04, 0);
      s.rotateX(a + da);
      parts.push(s);
    }
  }
  parts.push(disc(0.055, halfW * 1.7, C.alu, 0, 10));
  if (front) {
    for (const x of [0.078, -0.078]) parts.push(disc(0.16, 0.006, C.alu, x, 20), disc(0.105, 0.008, C.grey, x, 10));
  } else {
    parts.push(disc(0.11, 0.006, C.alu, -0.08, 16), disc(0.095, 0.008, C.grey, 0.085, 14));
  }
  return merge(parts);
}

/** 헬멧 정수리를 앞→뒤로 지나는 얇은 띠 (구면 일부). t = 좌우 위치(rad) */
function helmetStripe(t, col) {
  const g = new THREE.SphereGeometry(0.306, 8, 1, Math.PI * 0.62, Math.PI * 0.86, Math.PI / 2 + t - 0.06, 0.12);
  g.rotateZ(Math.PI / 2);
  return paint(g, col).scale(1, 0.95, 1.1).translate(0, 0.3, -0.01);
}

let shared = null;
/** 슈퍼바이크 대수와 상관없이 1벌만: 지오메트리 7개(차체·발광·조향·앞/뒤 바퀴·스탠드·헬멧), 재질 2개 */
function getShared() {
  if (shared) return shared;
  const xs = (z, y, a = 0.45) => 1 - (1 - a) * smooth(0.5, 0.92, z) - 0.12 * smooth(0.95, 1.1, y);
  const body = [];
  const glow = [];
  // 앞 카울(흰색) + 스크린(스모크) + 비대칭 헤드라이트
  // 앞 카울과 옆 카울은 한 판: 앞으로 갈수록 좁아지고(xs) 뒤 가장자리는 탱크·엔진 쪽으로 비스듬히
  const fairing = [[0.94, 0.85], [0.9, 0.95], [0.74, 1.03], [0.52, 1.05], [0.4, 1.0], [0.34, 0.9], [0.24, 0.8], [0.12, 0.62], [0.06, 0.44], [0.12, 0.28], [0.3, 0.26], [0.5, 0.36], [0.62, 0.52], [0.7, 0.64], [0.86, 0.74]];
  const fairX = (z, y) => xs(z, y) * (1 - 0.12 * smooth(0.5, 0.28, y));
  body.push(slab(fairing, 0.215, C.white, fairX));
  // 옆 카울 공기 배출구(검정)
  body.push(slab([[0.22, 0.66], [0.3, 0.6], [0.3, 0.48], [0.2, 0.44], [0.14, 0.52]], 0.219, C.black, fairX, 0));
  body.push(slab([[0.75, 1.0], [0.53, 1.205], [0.44, 1.19], [0.46, 1.04]], 0.13, C.smoke, (z) => 1 - 0.4 * smooth(0.5, 0.75, z), 0.008));
  body.push(slab([[0.84, 0.78], [0.955, 0.82], [0.955, 0.89], [0.86, 0.94]], 0.12, C.black, null, 0.006));
  glow.push(box(0.085, 0.034, 0.02, '#f4fbff', 0.058, 0.86, 0.957, 0, 0, -0.12));
  glow.push(box(0.058, 0.05, 0.02, '#f4fbff', -0.056, 0.852, 0.957, 0, 0, 0.1));
  glow.push(box(0.15, 0.008, 0.02, '#cfe9ff', 0, 0.895, 0.956));
  // M 스트라이프: 앞 카울 옆을 비스듬히 가로질러 옆 카울로 (하늘·남색·빨강)
  const band = (o, w) => [[0.86 - o, 0.98], [0.86 - o - w, 0.98], [0.42 - o - w, 0.42], [0.42 - o, 0.42]];
  for (const [o, col] of [[0, C.light], [0.06, C.dark], [0.12, C.red]]) {
    body.push(slab(band(o, 0.045), 0.222, col, fairX, 0));
  }
  // 언더카울(검정) · 엔진 · 알루미늄 프레임
  body.push(slab([[0.52, 0.38], [0.32, 0.18], [-0.02, 0.18], [-0.12, 0.3], [0.05, 0.37]], 0.16, C.black));
  body.push(slab([[-0.14, 0.3], [0.25, 0.3], [0.3, 0.74], [-0.05, 0.76]], 0.165, C.grey));
  body.push(slab([[0.42, 0.93], [0.4, 0.8], [-0.08, 0.52], [-0.2, 0.52], [-0.17, 0.67], [0.1, 0.83]], 0.17, C.alu));
  // 탱크(검정) · 시트 · 테일 카울(흰 + RR) · 서브프레임 · 테일램프
  body.push(slab([[0.43, 0.84], [0.43, 0.97], [0.3, 1.02], [0.1, 1.035], [-0.06, 0.95], [-0.12, 0.86], [0.0, 0.78], [0.25, 0.78]], 0.175, C.black, (z) => 1 - 0.32 * smooth(0.15, -0.12, z)));
  body.push(slab([[-0.06, 0.8], [-0.04, 0.85], [-0.44, 0.865], [-0.5, 0.845], [-0.48, 0.8]], 0.135, C.black));
  body.push(slab([[-0.36, 0.8], [-0.44, 0.88], [-0.62, 0.94], [-0.9, 1.0], [-0.93, 0.96], [-0.8, 0.86], [-0.55, 0.76]], 0.13, C.white, (z) => 1 - 0.5 * smooth(-0.6, -0.92, z)));
  body.push(slab([[-0.42, 0.86], [-0.62, 0.92], [-0.62, 0.9], [-0.42, 0.84]], 0.133, C.red, (z) => 1 - 0.5 * smooth(-0.6, -0.92, z), 0));
  body.push(...rrDecal(-0.52, 0.81, 0.131, 0.055, C.black));
  body.push(slab([[-0.08, 0.66], [-0.55, 0.76], [-0.8, 0.86], [-0.78, 0.82], [-0.5, 0.7], [-0.12, 0.58]], 0.1, C.black));
  glow.push(box(0.1, 0.022, 0.03, '#ff2b2b', 0, 0.955, -0.91, 0.45));
  body.push(box(0.16, 0.11, 0.01, C.black, 0, 0.8, -0.96, 0.35), tube(V(0, 0.9, -0.84), V(0, 0.82, -0.95), 0.012, C.black, 4));
  // 언더 배기: 엔진 밑 티타늄 머플러, 오른쪽(-x)으로 치우침
  body.push(slab([[-0.3, 0.17], [0.06, 0.15], [0.1, 0.27], [-0.26, 0.31]], 0.12, C.ti, null, 0.02).translate(-0.05, 0, 0));
  body.push(box(0.07, 0.06, 0.05, C.black, -0.06, 0.24, -0.33));
  // 스윙암 · 체인 · 리어셋 스텝 · 미러
  for (const sx of [1, -1]) {
    body.push(slab([[-0.08, 0.5], [AR + 0.02, 0.36], [AR - 0.02, 0.28], [-0.08, 0.38]], 0.022, C.alu).translate(sx * 0.13, 0, 0));
    body.push(tube(V(sx * 0.13, 0.48, -0.2), V(sx * 0.17, 0.41, -0.29), 0.012, C.alu, 4), tube(V(sx * 0.12, 0.41, -0.29), V(sx * 0.2, 0.41, -0.29), 0.011, C.grey, 5));
    body.push(tube(V(sx * 0.2, 1.0, 0.6), V(sx * 0.33, 1.03, 0.56), 0.008, C.black, 4), box(0.1, 0.05, 0.04, C.black, sx * 0.37, 1.04, 0.56));
  }
  body.push(box(0.012, 0.012, 0.74, C.black, 0.09, 0.453, -0.36, -0.11), box(0.012, 0.012, 0.6, C.black, 0.09, 0.318, -0.39, -0.26));
  body.push(box(0.12, 0.05, 0.06, C.black, 0, 1.05, 0.46, -0.6));

  // 조향부: 차체 좌표로 만든 다음 조향축 기준 좌표로 옮긴다 (U.steer 가 이 축으로 돈다)
  const axisZ0 = AF + SB.TRAIL; // 조향축이 지면과 만나는 z
  const head = V(0, 0.97, axisZ0 - Math.tan(SB.RAKE) * 0.97);
  const toSteer = new THREE.Matrix4().compose(head, new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -SB.RAKE), V(1, 1, 1)).invert();
  const off = V(0, Math.sin(SB.RAKE), Math.cos(SB.RAKE)).multiplyScalar(0.029); // 포크 오프셋
  const along = (y) => V(0, y, axisZ0 - Math.tan(SB.RAKE) * y).add(off);
  const steer = [];
  for (const sx of [1, -1]) {
    steer.push(tube(along(0.98).setX(sx * 0.105), along(0.44).setX(sx * 0.105), 0.03, C.gold, 8));
    steer.push(tube(along(0.44).setX(sx * 0.105), along(SB.RF - 0.02).setX(sx * 0.105), 0.024, C.black, 8));
    steer.push(box(0.035, 0.09, 0.05, C.grey, sx * 0.105, 0.36, AF - 0.12, -SB.RAKE));
    steer.push(tube(V(sx * 0.1, 0.93, head.z + 0.01), V(sx * 0.3, 0.9, head.z - 0.04), 0.014, C.black, 5));
    steer.push(tube(V(sx * 0.24, 0.9, head.z - 0.025), V(sx * 0.33, 0.895, head.z - 0.045), 0.02, C.grey, 6));
  }
  steer.push(box(0.26, 0.035, 0.09, C.alu, 0, 0.965, head.z + 0.02, -SB.RAKE), box(0.26, 0.04, 0.08, C.black, 0, 0.82, head.z + 0.08, -SB.RAKE));
  steer.push(slab([[AF - 0.2, 0.5], [AF - 0.05, 0.6], [AF + 0.15, 0.58], [AF + 0.23, 0.47], [AF + 0.19, 0.46], [AF + 0.1, 0.54], [AF - 0.05, 0.56], [AF - 0.17, 0.47]], 0.07, C.black));
  const steerGeo = merge(steer).applyMatrix4(toSteer);
  const frontAxle = V(0, SB.RF, AF).applyMatrix4(toSteer);
  const grips = [V(0.3, 0.9, head.z - 0.04), V(-0.3, 0.9, head.z - 0.04)].map((p) => p.applyMatrix4(toSteer));

  // 사이드스탠드(+x) — 세워 둘 때만 보인다
  const stand = merge([tube(V(0.13, 0.4, -0.06), V(0.27, 0.02, -0.16), 0.014, C.grey, 5), box(0.05, 0.012, 0.07, C.grey, 0.27, 0.01, -0.16)]);

  const helmet = merge([
    paint(new THREE.SphereGeometry(0.3, 10, 7), C.white).scale(1, 0.95, 1.1).translate(0, 0.3, -0.01),
    paint(new THREE.SphereGeometry(0.302, 10, 3, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.32, Math.PI * 0.22), C.smoke).scale(1, 0.95, 1.1).translate(0, 0.3, -0.01),
    ...[[0, C.light], [0.17, C.dark], [-0.17, C.red]].map(([t, col]) => helmetStripe(t, col)),
    box(0.26, 0.1, 0.12, C.white, 0, 0.1, 0.24, 0.3),
  ]);

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  shared = {
    body: merge(body), glow: merge(glow), steer: steerGeo, stand, helmet,
    wheelF: wheel(SB.RF, 0.06, true), wheelR: wheel(SB.RR, 0.095, false),
    mat, glowMat, head, frontAxle, grips,
  };
  return shared;
}

/** 라이더 머리 슬롯용 풀페이스 헬멧 (메시 1개) */
export function createMotoHelmetHead() {
  const S = getShared();
  const m = new THREE.Mesh(S.helmet, S.mat);
  m.castShadow = true;
  return m;
}

export function createSuperbikeModel() {
  const S = getShared();
  const mesh = (g, m = S.mat) => {
    const o = new THREE.Mesh(g, m);
    o.castShadow = true;
    return o;
  };
  const root = new THREE.Group();
  root.name = 'superbike-rr';
  const lean = new THREE.Group();
  root.add(lean);
  lean.add(mesh(S.body));
  const glow = mesh(S.glow, S.glowMat);
  glow.castShadow = false;
  lean.add(glow);
  const pivot = new THREE.Group();
  pivot.position.copy(S.head);
  pivot.rotation.x = -SB.RAKE;
  lean.add(pivot);
  const steer = new THREE.Group();
  pivot.add(steer);
  steer.add(mesh(S.steer));
  const frontSpin = new THREE.Group();
  frontSpin.position.copy(S.frontAxle);
  frontSpin.add(mesh(S.wheelF));
  steer.add(frontSpin);
  const rearSpin = new THREE.Group();
  rearSpin.position.set(0, SB.RR, AR);
  rearSpin.add(mesh(S.wheelR));
  lean.add(rearSpin);
  const stand = mesh(S.stand);
  lean.add(stand);
  const grips = S.grips.map((p) => {
    const o = new THREE.Object3D();
    o.position.copy(p);
    steer.add(o);
    return o;
  });
  root.userData = { lean, steer, frontSpin, rearSpin, stand, grips };
  return root;
}
