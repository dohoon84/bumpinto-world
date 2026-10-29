// 성남시 길거리 쓰레기통. 주황 일반쓰레기통과 초록 재활용통이 한 세트다.
import * as THREE from 'three';

const matCache = new Map();
function M(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

function labelTexture(title, sub, bg) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 320;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = '#ffffff';
  g.font = '700 42px "Pretendard", "Noto Sans KR", sans-serif';
  g.textAlign = 'center';
  g.fillText(title, 128, 250);
  g.font = '600 28px "Pretendard", "Noto Sans KR", sans-serif';
  g.fillText(sub, 128, 292);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function oneBin(color, kind) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.92, 0.46), M(color));
  body.position.y = 0.62;
  body.castShadow = true;
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.5), M('#2b3036'));
  lip.position.y = 1.1;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.4), M('#3a4048'));
  foot.position.y = 0.08;
  g.add(body, lip, foot);
  if (kind === 'waste') {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.04), M('#1a1d22'));
    slot.position.set(0, 0.86, 0.23);
    g.add(slot);
  } else {
    for (const x of [-0.12, 0.12]) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12), M('#1a1d22'));
      hole.rotation.x = Math.PI / 2;
      hole.position.set(x, 0.9, 0.23);
      g.add(hole);
    }
  }
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.62),
    new THREE.MeshBasicMaterial({
      map: labelTexture(
        kind === 'waste' ? '일반쓰레기' : '재활용품',
        kind === 'waste' ? 'Waste' : 'Recycle',
        color,
      ),
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  face.position.set(0, 0.48, 0.232);
  g.add(face);
  return g;
}

export function createTrashPair() {
  const g = new THREE.Group();
  const waste = oneBin('#f26522', 'waste');
  const recycle = oneBin('#39b54a', 'recycle');
  waste.position.x = -0.32;
  recycle.position.x = 0.32;
  g.add(waste, recycle);
  return g;
}

function canStand(world, x, z) {
  if (world.onRoad?.(x, z)) return false;
  if (world.inWater?.(x, z)) return false;
  if (world.isBlocked?.(x, z, 0.7)) return false;
  const y = world.groundY?.(x, z, 0);
  if (y != null && (y < -1 || y > 3)) return false;
  return true;
}

function settle(world, x, z) {
  if (canStand(world, x, z)) return { x, z };
  for (let r = 1.2; r <= 7; r += 1.4) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (canStand(world, px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

export function addTrashBins(scene, overlay, world, door) {
  const wanted = [
    [-63, 16, 0.4],
    [-86, 22, -0.6],
    [-60, 52, 1.2],
    [-88, 48, 2.4],
    [-50, 18, 0.2],
    [-78, 6, -1.2],
  ];
  if (world.signPos) wanted.push([world.signPos.x + 6, world.signPos.z - 4, 0.8]);
  if (door) {
    wanted.push([
      door.x - door.nx * 5.2 + door.dx * 3.4,
      door.z - door.nz * 5.2 + door.dz * 3.4,
      Math.atan2(door.dx, door.dz),
    ]);
  }
  const bins = [];
  for (const [x, z, ry] of wanted) {
    const spot = settle(world, x, z);
    if (!spot) continue;
    if (bins.some((b) => Math.hypot(b.x - spot.x, b.z - spot.z) < 8)) continue;
    const mesh = createTrashPair();
    const y = world.groundY?.(spot.x, spot.z, 0) || 0;
    mesh.position.set(spot.x, y, spot.z);
    mesh.rotation.y = ry;
    scene.add(mesh);
    if (overlay) {
      overlay.add({
        cls: 'label public',
        text: '🗑️ 쓰레기통',
        getPos: () => new THREE.Vector3(spot.x, y + 1.8, spot.z),
        maxDist: 32,
      });
    }
    bins.push({ x: spot.x, z: spot.z, ry });
  }

  function near(x, z, dist = 2.15) {
    let best = null;
    let bestD = dist;
    for (const b of bins) {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  function blocks(x, z) {
    for (const b of bins) {
      const dx = x - b.x;
      const dz = z - b.z;
      const c = Math.cos(-b.ry);
      const s = Math.sin(-b.ry);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) < 0.78 && Math.abs(lz) < 0.42) return true;
    }
    return false;
  }

  return { bins, near, blocks };
}
