// [subway] 열차·스크린도어 공용 부품 (승강장 Scene · 열차 Scene 둘 다)
//   전동차 외부 = 한 량 지오메트리 1개 → InstancedMesh (량수와 무관하게 draw call 1). 색: 은색 차체 + 노선 색 띠 (로고 없음)
//   스크린도어 = 고정 유리 InstancedMesh 1 + 여닫이 문짝 InstancedMesh 1
import * as THREE from 'three';
import { createBuilder } from './geom.js';
import { CAR_LEN, DOOR_OFF } from './lines.js';
import { DOOR_W } from './ride.js';

export const CAR = Object.freeze({ W: 3.12, LEN: CAR_LEN - 0.4, FLOOR: 0, TOP: 2.75 });
const SILVER = '#cfd4d9', DARK = '#2b2f33';

// 한 량 외부 (원점 = 량 가운데 바닥, x = 길이, z = 폭). 문 자리(양쪽)는 실내색 오목 — 문짝은 따로 (carDoorLeaves)
export function carGeometry(color) {
  const B = createBuilder(), L = CAR.LEN, W = CAR.W, hz = W / 2;
  B.block(0, -1.05, 0, L - 0.6, 0.6, W - 0.5, DARK);           // 대차·하부
  for (const x of [-L / 2 + 2.6, L / 2 - 2.6]) for (const s of [-1, 1]) B.cyl(x + s * 1.1, -1.2, 0, 0.42, 0.12, '#1c1f22', 10);
  B.block(0, -0.45, 0, L, 1.35, W, SILVER);                      // 아래 차체
  B.box(0, 0.62, 0, L + 0.01, 0.16, W + 0.02, color);           // 노선 색 띠
  B.box(0, 2.0, 0, L + 0.01, 0.08, W + 0.02, color);            // 위 가는 띠
  B.block(0, 0.9, 0, L - 0.02, 0.85, W - 0.06, '#9db0bf');        // 창 줄 (밝은 실내가 비치는 유리)
  for (let i = 0; i <= DOOR_OFF.length; i++) {                     // 창 사이 기둥
    const xs = i === 0 ? L / 2 - 0.4 : i === DOOR_OFF.length ? -L / 2 + 0.4 : (DOOR_OFF[i - 1] + DOOR_OFF[i]) / 2;
    B.block(xs, 0.9, 0, 0.5, 0.85, W, SILVER);
  }
  B.block(0, 1.75, 0, L, 0.75, W, SILVER);                       // 창 위
  B.block(0, 2.5, 0, L - 0.3, 0.25, W - 0.3, '#a7aeb5');           // 지붕
  for (const x of DOOR_OFF) for (const s of [-1, 1]) {
    B.box(x, 0.95, s * (hz + 0.005), DOOR_W + 0.1, 1.95, 0.02, '#e9ecef'); // 문 자리 (열리면 보이는 밝은 실내)
    B.box(x, 1.98, s * (hz + 0.012), DOOR_W + 0.16, 0.06, 0.02, '#6c757d');
  }
  for (const s of [-1, 1]) B.box(s * (L / 2 + 0.1), 0.6, 0, 0.2, 2.2, 1.2, '#3b4148'); // 연결부
  return B.build();
}
// 맨 앞·맨 뒤 칸 앞면 (+x 를 봄). 앞유리 + 노선 색 + 전조등
export function cabGeometry(color) {
  const B = createBuilder(), x = CAR.LEN / 2;
  B.box(x + 0.08, 0.45, 0, 0.16, 2.9, CAR.W - 0.1, SILVER);
  B.box(x + 0.17, 1.25, 0, 0.04, 0.95, CAR.W - 0.5, '#11161b');   // 앞유리
  B.box(x + 0.17, 0.62, 0, 0.04, 0.2, CAR.W - 0.06, color);
  B.box(x + 0.18, 1.95, 0, 0.03, 0.22, 1.2, '#1a1a1a');             // 행선 LED 자리 (글자 없음)
  for (const s of [-1, 1]) B.box(x + 0.19, 0.25, s * 1.05, 0.03, 0.14, 0.28, '#fff7d6');
  B.box(x + 0.1, -0.85, 0, 0.2, 0.5, CAR.W - 0.6, DARK);
  return B.build();
}

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), SC = new THREE.Vector3();
const QY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

// 편성 (량 N 개 InstancedMesh + 앞뒤 cab 2 + 승강장 쪽 문짝). side = 문짝을 그릴 쪽 (-1 = -z, +1 = +z, 0 = 양쪽)
export function buildConsist(group, { color, cars, side = -1, disposables }) {
  const bodyGeo = carGeometry(color), cabGeo = cabGeometry(color);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const body = new THREE.InstancedMesh(bodyGeo, mat, cars); body.name = 'trainCars';
  const cab = new THREE.InstancedMesh(cabGeo, mat, 2); cab.name = 'trainCabs';
  const sides = side ? [side] : [-1, 1];
  const leafGeo = new THREE.BoxGeometry(DOOR_W / 2, 1.9, 0.04), leafMat = new THREE.MeshLambertMaterial({ color: '#c3c9cf' });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, cars * DOOR_OFF.length * 2 * sides.length); leaves.name = 'trainDoors';
  for (const m of [body, cab, leaves]) { m.frustumCulled = false; group.add(m); }
  disposables.push(bodyGeo, cabGeo, mat, leafGeo, leafMat);
  // x0 = 1호차 앞끝 x (진행 방향 +x), open = 0..1, cz = 차체 가운데 z
  function place(x0, open, cz = 0, openSide = side || 1) {
    let k = 0;
    for (let c = 0; c < cars; c++) {
      const xc = x0 - (c + 0.5) * CAR_LEN;
      M4.compose(V.set(xc, 0, cz), Q.identity(), S1); body.setMatrixAt(c, M4);
      for (const s of sides) for (const dx of DOOR_OFF) for (const lr of [-1, 1]) {
        const o = s === openSide ? open : 0;
        M4.compose(V.set(xc + dx + lr * (DOOR_W / 4 + o * DOOR_W * 0.48), 0.95, cz + s * (CAR.W / 2 + 0.03)), Q.identity(), S1); leaves.setMatrixAt(k++, M4);
      }
    }
    M4.compose(V.set(x0 - CAR_LEN / 2, 0, cz), Q.identity(), S1); cab.setMatrixAt(0, M4);
    M4.compose(V.set(x0 - (cars - 0.5) * CAR_LEN, 0, cz), QY, S1); cab.setMatrixAt(1, M4);
    body.instanceMatrix.needsUpdate = cab.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = true;
  }
  const setVisible = (v) => { body.visible = cab.visible = leaves.visible = v; };
  return { place, setVisible, meshes: [body, cab, leaves] };
}

// 스크린도어 줄 (z = zLine, 문 = lay.doors 의 x). 고정 유리 + 문짝 (문짝은 open 0..1 로 좌우로 열림)
export function buildScreenDoors(group, { lay, z = 0, x0, x1, disposables }) {
  const glass = new THREE.MeshLambertMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.32, depthWrite: false });
  const panelGeo = new THREE.BoxGeometry(1, 2.05, 0.04);
  const xs = lay.doors.map((d) => d.x).sort((a, b) => a - b);
  const spans = []; let prev = x0;
  for (const x of xs) { if (x - DOOR_W / 2 - prev > 0.05) spans.push([prev, x - DOOR_W / 2]); prev = x + DOOR_W / 2; }
  if (x1 - prev > 0.05) spans.push([prev, x1]);
  const fixed = new THREE.InstancedMesh(panelGeo, glass, spans.length); fixed.name = 'psdFixed';
  spans.forEach(([a, b], i) => { M4.compose(V.set((a + b) / 2, 1.025, z), Q.identity(), SC.set(b - a - 0.06, 1, 1)); fixed.setMatrixAt(i, M4); });
  const leafGeo = new THREE.BoxGeometry(DOOR_W / 2 - 0.02, 2.0, 0.035);
  const leaves = new THREE.InstancedMesh(leafGeo, glass, xs.length * 2); leaves.name = 'psdLeaves';
  for (const m of [fixed, leaves]) { m.frustumCulled = false; m.renderOrder = 2; group.add(m); }
  disposables.push(glass, panelGeo, leafGeo);
  function update(open) {
    let k = 0;
    for (const x of xs) for (const lr of [-1, 1]) { M4.compose(V.set(x + lr * (DOOR_W / 4 + open * DOOR_W * 0.47), 1.0, z - 0.03), Q.identity(), S1); leaves.setMatrixAt(k++, M4); }
    leaves.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { update, spans, xs };
}
// 스크린도어 틀 (기둥·위 띠) — 정적 빌더에
export function screenDoorFrame(S, { lay, z = 0, x0, x1, color }) {
  S.block((x0 + x1) / 2, 2.05, z, x1 - x0, 0.5, 0.22, '#3b4148');   // 위 띠 (문 번호판이 붙는 곳)
  S.box((x0 + x1) / 2, 2.07, z - 0.115, x1 - x0, 0.05, 0.01, color);  // 노선 색 줄
  for (const d of lay.doors) for (const s of [-1, 1]) S.block(d.x + s * (DOOR_W / 2 + 0.04), 0, z, 0.08, 2.05, 0.16, '#868e96');
  S.block((x0 + x1) / 2, 0, z, x1 - x0, 0.03, 0.2, '#495057');      // 문턱
}
