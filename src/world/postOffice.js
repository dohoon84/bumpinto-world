// 성남정자동우체국 남쪽 벽(스타벅스·SK-U타워 쪽)에 다는 표식. 공식 로고 이미지는 쓰지 않는다.
import * as THREE from 'three';

function pointInRing(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function centroid(ring) {
  let x = 0, z = 0;
  for (const p of ring) { x += p[0]; z += p[1]; }
  return [x / ring.length, z / ring.length];
}

function southFace(ring) {
  const [cx, cz] = centroid(ring);
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    if (L < 4) continue;
    let nx = -dz / L, nz = dx / L;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (nx * (cx - mx) + nz * (cz - mz) > 0) { nx = -nx; nz = -nz; }
    if (nz < 0.65) continue;
    if (!best || mz > best.mz || (mz === best.mz && L > best.L)) best = { mx, mz, nx, nz, L };
  }
  return best;
}

function markTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#f6f3ee';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#c8102e';
  g.lineWidth = 22;
  g.strokeRect(18, 18, 476, 476);
  g.fillStyle = '#d0121a';
  g.beginPath();
  g.arc(256, 214, 148, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = 'bold 168px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('우', 256, 214);
  g.fillStyle = '#9d1020';
  g.font = 'bold 72px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  g.fillText('우체국', 256, 420);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function addPostOfficeMarks(scene, data) {
  const label = data.labels.find((l) => l.text === '성남정자동우체국');
  if (!label) return;
  const host = data.buildings.find((b) => pointInRing(label.x, label.z, b.o) && !(b.holes || []).some((h) => pointInRing(label.x, label.z, h)))
    || data.buildings.filter((b) => Math.hypot(centroid(b.o)[0] - label.x, centroid(b.o)[1] - label.z) < 18)
      .sort((a, b) => Math.hypot(centroid(a.o)[0] - label.x, centroid(a.o)[1] - label.z) - Math.hypot(centroid(b.o)[0] - label.x, centroid(b.o)[1] - label.z))[0];
  if (!host) return;
  const face = southFace(host.o);
  if (!face) return;
  const tex = markTexture();
  const faceMat = new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.45 });
  const sideMat = new THREE.MeshLambertMaterial({ color: '#f6f3ee' });
  const w = Math.min(4.2, face.L * 0.62);
  const h = 2.6;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), [sideMat, sideMat, sideMat, sideMat, faceMat, faceMat]);
  const y = Math.min(host.h - h / 2 - 0.3, Math.max(h / 2 + 0.35, host.h * 0.72));
  board.position.set(face.mx + face.nx * 0.2, y, face.mz + face.nz * 0.2);
  board.rotation.y = Math.atan2(face.nx, face.nz);
  board.castShadow = true;
  scene.add(board);
}
