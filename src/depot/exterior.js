// [depot] 범창고 외관 — 값싼 외피만(메시 6개 안팎, 라이트 없음). 내부 선반·상품·물리는 들어갈 때만 interior.js 로 지연 로드.
import * as THREE from 'three';
import { DEPOT_SITE as S } from './flag.js';

function facadeTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c9ced4'; g.fillRect(0, 0, 512, 128);
  for (let x = 0; x < 512; x += 16) { g.fillStyle = x % 32 ? '#bfc5cc' : '#d3d8de'; g.fillRect(x, 0, 8, 128); } // 골강판
  g.fillStyle = '#1f4fa3'; g.fillRect(0, 0, 512, 14); // 처마 띠
  g.fillStyle = '#f2b705'; g.fillRect(0, 14, 512, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function signTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1f4fa3'; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#f2b705'; g.fillRect(0, 206, 1024, 50);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 120px "Pretendard", "Noto Sans KR", sans-serif'; g.fillText('범창고', 330, 108);
  g.font = '900 64px "Pretendard", "Noto Sans KR", sans-serif'; g.fillText('BUMP DEPOT', 760, 108);
  g.fillStyle = '#1f2a44'; g.font = '800 34px "Pretendard", "Noto Sans KR", sans-serif'; g.fillText('창고형 할인점 · 정자점 · 대용량 · 매일 낮은 가격', 512, 232);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildDepotExterior(scene, { groundY = () => 0 } = {}) {
  const W = S.x1 - S.x0, D = S.z1 - S.z0, cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
  // 네 모서리·가운데 지면 중 가장 낮은 곳에 바닥을 두고, 벽을 0.6 m 땅속까지 내려 뜨지 않게
  const ys = [[S.x0, S.z0], [S.x1, S.z0], [S.x0, S.z1], [S.x1, S.z1], [cx, cz]].map(([x, z]) => groundY(x, z) || 0);
  const y0 = Math.min(...ys), yTop = Math.max(...ys);
  const root = new THREE.Group(); root.name = 'depot-exterior';
  const fTex = facadeTexture(); fTex.repeat.set(W / 8, 1);
  const fTexZ = fTex.clone(); fTexZ.needsUpdate = true; fTexZ.repeat.set(D / 8, 1);
  const wallX = new THREE.MeshLambertMaterial({ map: fTex });
  const wallZ = new THREE.MeshLambertMaterial({ map: fTexZ });
  const roofM = new THREE.MeshLambertMaterial({ color: 0x8d949c });
  const H = S.h + (yTop - y0) + 0.6;
  const box = new THREE.BoxGeometry(W, H, D);
  // 면 순서 +x,-x,+y,-y,+z,-z
  const bodyM = [wallZ, wallZ, roofM, roofM, wallX, wallX];
  const body = new THREE.Mesh(box, bodyM); body.position.set(cx, y0 - 0.6 + H / 2, cz); body.name = 'depot-shell'; root.add(body);
  // 정면 간판
  const sTex = signTexture();
  const signM = new THREE.MeshBasicMaterial({ map: sTex });
  const signG = new THREE.PlaneGeometry(28, 7);
  const sign = new THREE.Mesh(signG, signM); sign.position.set(cx + 14, yTop + S.h - 4.2, S.z0 - 0.06); sign.rotation.y = Math.PI; root.add(sign);
  // 출입구: 어두운 유리 + 캐노피(파란 처마) + 카트 보관소 지붕
  const glassM = new THREE.MeshLambertMaterial({ color: 0x23303f, emissive: 0x2a3b52, emissiveIntensity: 0.6 });
  const doorG = new THREE.PlaneGeometry(S.door.w, 3.4);
  const door = new THREE.Mesh(doorG, glassM); door.position.set(S.door.x, groundY(S.door.x, S.door.z) + 1.7, S.z0 - 0.05); door.rotation.y = Math.PI; root.add(door);
  const canM = new THREE.MeshLambertMaterial({ color: 0x1f4fa3 });
  const canG = new THREE.BoxGeometry(22, 0.5, 6);
  const canopy = new THREE.Mesh(canG, canM); canopy.position.set(S.door.x - 4, groundY(S.door.x, S.door.z) + 4.4, S.z0 - 3); root.add(canopy);
  scene.add(root);
  const disposables = [box, signG, doorG, canG, wallX, wallZ, roofM, signM, glassM, canM, fTex, fTexZ, sTex];
  return {
    root, y0,
    // 바깥에서 건물 안으로 걸어 들어가지 않게 (출입구 앞은 문 안내로 처리)
    blocks(x, z, r = 0.4) { return x > S.x0 - r && x < S.x1 + r && z > S.z0 - r && z < S.z1 + r; },
    dispose() { scene.remove(root); for (const d of disposables) d.dispose(); },
  };
}
