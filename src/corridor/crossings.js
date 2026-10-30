// [corridor] 코리더 횡단보도 + 보행 신호등. 라이브 transit.js 와 같은 치수·색·신호 주기(CYCLE, 그룹0/1)를 쓰되,
// 수백 개를 한 번에 그리므로 지브라는 병합 메시 1개, 신호등은 InstancedMesh 4개(기둥/머리/빨강/초록)로 묶는다.
import * as THREE from 'three';
import { CYCLE, hash, quad, flatMesh } from '../transit/transit.js';

const SIG_MIN_W = 10; // 이 폭 이상 도로의 횡단보도는 신호등 설치(원본 데이터에 신호 태그 없음 → 폭 기준 근사)

export function buildCorridorCrossings(scene, crossings, { getSimTime }) {
  const list = crossings.map((c, i) => ({ ...c, id: 'cc' + i, sig: c.w >= SIG_MIN_W, cl: Math.round(c.x / 90) + ',' + Math.round(c.z / 90), g: Math.abs(c.dir[0]) > Math.abs(c.dir[1]) ? 1 : 0 }));
  const pos = [], idx = [];
  for (const c of list) {
    const [dx, dz] = c.dir, nx = -dz, nz = dx, half = c.w / 2, depth = c.sig ? 2.2 : 1.8;
    c.depth = depth;
    for (let v = -half + 0.4; v <= half - 0.2; v += 1.0) idx.push(...quad(pos, c.x + nx * v, c.z + nz * v, dx, dz, nx, nz, depth, 0.28, 0.108));
    if (c.sig) for (const sgn of [-1, 1]) idx.push(...quad(pos, c.x + dx * sgn * (depth + 1.6) - nx * (sgn * half / 2), c.z + dz * sgn * (depth + 1.6) - nz * (sgn * half / 2), nx, nz, dx, dz, half / 2, 0.22, 0.108));
  }
  const group = new THREE.Group(); group.name = 'corridorCrossings';
  if (idx.length) group.add(flatMesh(pos, idx, '#f7f7f2'));

  const sig = list.filter((c) => c.sig);
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.08, 3.1, 6); poleGeo.translate(0, 1.55, 0);
  const headGeo = new THREE.BoxGeometry(0.42, 0.95, 0.28); headGeo.translate(0, 2.75, 0);
  const redGeo = new THREE.BoxGeometry(0.32, 0.36, 0.3); redGeo.translate(0, 2.97, 0);
  const greenGeo = new THREE.BoxGeometry(0.32, 0.36, 0.3); greenGeo.translate(0, 2.55, 0);
  const n = sig.length * 2;
  const mk = (geo, mat, shadow) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = n; m.castShadow = shadow; group.add(m); return m; };
  const poles = mk(poleGeo, new THREE.MeshLambertMaterial({ color: '#5b6066' }), true);
  const heads = mk(headGeo, new THREE.MeshLambertMaterial({ color: '#2b2f33' }), true);
  const reds = mk(redGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }), false);
  const greens = mk(greenGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }), false);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  let k = 0;
  const owner = [];
  for (const c of sig) {
    const [dx, dz] = c.dir, nx = -dz, nz = dx, off = c.depth + 0.5;
    for (const sgn of [-1, 1]) {
      p.set(c.x + nx * sgn * (c.w / 2 + 0.9) + dx * off, 0, c.z + nz * sgn * (c.w / 2 + 0.9) + dz * off);
      q.setFromAxisAngle(up, Math.atan2(-nx * sgn, -nz * sgn));
      m4.compose(p, q, one);
      for (const im of [poles, heads, reds, greens]) im.setMatrixAt(k, m4);
      owner.push(c); k++;
    }
  }
  for (const im of [poles, heads, reds, greens]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }

  let own = 0; // 라이브 버스 시뮬 시계가 없으면 자체 시계
  const now = () => getSimTime?.() ?? own;
  const offsets = new Map();
  const pedLight = (c) => {
    if (!c.sig) return 'none';
    if (!offsets.has(c.cl)) offsets.set(c.cl, hash('cl' + c.cl) * CYCLE);
    const t = ((now() + offsets.get(c.cl)) % CYCLE - (c.g ? 30 : 0) + CYCLE) % CYCLE;
    return t < 20 ? 'green' : t < 26 ? 'blink' : 'red';
  };
  const cR = new THREE.Color('#ff3b30'), cRo = new THREE.Color('#3a1010'), cG = new THREE.Color('#2bff7a'), cGo = new THREE.Color('#0d2a18');
  let acc = 1;
  const update = (dt) => {
    own += dt; acc += dt; if (acc < 0.1 || !n) return; acc = 0;
    const blinkOn = Math.floor(now() * 2.5) % 2 === 0;
    for (let i = 0; i < n; i++) {
      const s = pedLight(owner[i]);
      reds.setColorAt(i, s === 'red' ? cR : cRo);
      greens.setColorAt(i, s === 'green' || (s === 'blink' && blinkOn) ? cG : cGo);
    }
    reds.instanceColor.needsUpdate = greens.instanceColor.needsUpdate = true;
  };
  update(1);
  scene.add(group);
  return { group, update, pedLight, crossings: list, signals: sig.length };
}
