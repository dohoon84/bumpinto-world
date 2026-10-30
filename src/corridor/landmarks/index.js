// [corridor] 데이터 기반 랜드마크 (프로토타입 src/landmarks 포팅). 현재 모델: 롯데월드타워(절차적, 로고/문자 없음).
import * as THREE from 'three';
import { createLotteWorldTower } from './lotteWorldTower.js';
import { watchEvening } from '../../evening.js';

// 유리 반사용 간이 환경맵(하늘 그라데이션 + 지면) — 외부 HDR 없이 PMREM 으로 생성. 타워 재질에만 쓴다(scene.environment 는 건드리지 않음).
function skyEnv(renderer) {
  const sc = new THREE.Scene(), g = new THREE.SphereGeometry(100, 32, 16), c = [], top = new THREE.Color('#5f9bd1'), hz = new THREE.Color('#eef5fa'), gr = new THREE.Color('#8f8b82'), t = new THREE.Color();
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 100; if (y >= 0) t.copy(hz).lerp(top, Math.pow(y, 0.55)); else t.copy(hz).lerp(gr, Math.min(1, -y * 4)); c.push(t.r, t.g, t.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  sc.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sunB = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 5) })); sunB.position.set(-45, 70, 35); sc.add(sunB);
  const pm = new THREE.PMREMGenerator(renderer); const rt = pm.fromScene(sc, 0.02); pm.dispose();
  g.dispose(); return rt.texture;
}
const MODELS = { lotteWorldTower: createLotteWorldTower };
export function createLandmarks(scene, landmarks, renderer) {
  const items = [];
  let env = null;
  for (const l of landmarks) {
    if (!l.model || !MODELS[l.model]) continue;
    env ||= renderer ? skyEnv(renderer) : null;
    const fit = l.fit && l.params?.fitFootprint !== false ? l.fit : null;
    const p = { ...(l.params || {}), env };
    if (fit) p.baseHalfM = p.baseHalfM ?? fit.halfM;
    const g = MODELS[l.model](p);
    const at = fit || l.pos;
    g.position.set(at.x, 0, at.z); g.rotation.y = (-((p.rotDeg ?? 0) + (fit ? fit.rotDeg : 0)) * Math.PI) / 180;
    scene.add(g); items.push({ l, g });
  }
  const stop = watchEvening((on) => items.forEach(({ g }) => g.userData.setNight?.(on ? 1 : 0)));
  return { items, update: (dt) => items.forEach(({ g }) => g.userData.update?.(dt)), stop };
}
