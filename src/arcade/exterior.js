// [arcade] 서현점 바깥 — 네온 간판 + 문 마커 (실제 건물 footprint 앞)
import * as THREE from 'three';
import { arcadePlacement } from './locations.js';

export function mountArcadeExterior({ scene } = {}) {
  const st = arcadePlacement();
  const g = new THREE.Group();
  g.name = 'bump-arcade-exterior';

  const [dx, dz] = st.door;
  // neon fascia above door
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#7eb6ff'); grad.addColorStop(0.45, '#ff9ecd'); grad.addColorStop(1, '#ffe66d');
  ctx.fillStyle = '#1a1030'; ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = grad; ctx.fillRect(24, 24, 976, 208);
  ctx.fillStyle = '#241840'; ctx.fillRect(40, 40, 944, 176);
  // cute sparkles
  ctx.fillStyle = 'rgba(255,230,109,0.85)';
  for (const [x,y] of [[80,70],[944,70],[80,186],[944,186],[512,55]]) { ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.fill(); }
  ctx.fillStyle = '#ffe66d';
  ctx.font = '900 72px Pretendard,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('BUMP 오락실', 512, 110);
  ctx.font = '800 36px Pretendard,sans-serif';
  ctx.fillStyle = '#9ec1ff';
  ctx.fillText('범핑팡 · 서현점', 512, 175);
  const tex = new THREE.CanvasTexture(c);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 1.3),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  // face outward (+z front) — sign faces north (towards exit)
  sign.position.set(dx, 3.2, dz - 0.3);
  // plane default faces +z; door front is +z so rotate 180 to face street
  sign.rotation.y = Math.PI;
  g.add(sign);

  // glowing door frame
  const frameMat = new THREE.MeshBasicMaterial({ color: '#ff9ecd' });
  const frame = new THREE.Group();
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), frameMat);
  left.position.set(-1.0, 1.3, 0);
  const right = left.clone(); right.position.x = 1.0;
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.12, 0.12), frameMat);
  top.position.set(0, 2.6, 0);
  frame.add(left, right, top);
  frame.position.set(dx, 0, dz);
  g.add(frame);

  // ranking totem
  const [bx, bz] = st.board || [dx - 4, dz];
  const totem = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 2.2, 0.18),
    new THREE.MeshStandardMaterial({ color: '#152238', emissive: '#1a2a4a', emissiveIntensity: 0.4 }),
  );
  totem.position.set(bx, 1.1, bz);
  totem.userData.arcBoard = true;
  g.add(totem);
  const tSign = sign.clone();
  tSign.geometry = new THREE.PlaneGeometry(0.85, 0.5);
  tSign.position.set(bx, 2.0, bz + 0.1);
  tSign.rotation.y = Math.PI;
  g.add(tSign);

  scene.add(g);
  return {
    group: g,
    store: st,
    dispose() { scene.remove(g); tex.dispose(); },
  };
}
