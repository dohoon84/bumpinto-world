// OSM에 발자국이 없는 노비오스호텔. HOTEL NOVIOS 노드(정자일로198번길 26)를 중심으로
// 북쪽 상가(198번길 22)와 같은 폭의 빈 칸에 세운다. 스타벅스 정자역은 서쪽 길 건너다.
import * as THREE from 'three';
import { watchEvening } from '../evening.js';

const FLOORS = 10;
const FLOOR_H = 3.2;
export const NOBIOS_HEIGHT = FLOORS * FLOOR_H;

// 북쪽 상가 x=-101.7..-85.3 에 맞추고, 노드 z=-41.7 을 중심으로 한 층 깊이.
const NOBIOS_RING = [
  [-101.7, -32.7],
  [-85.3, -32.7],
  [-85.3, -50.7],
  [-101.7, -50.7],
];

function centroid(ring) {
  let x = 0, z = 0;
  for (const p of ring) { x += p[0]; z += p[1]; }
  return [x / ring.length, z / ring.length];
}

function outwardEdges(ring) {
  const [cx, cz] = centroid(ring);
  const edges = [];
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    if (L < 6) continue;
    let nx = -dz / L, nz = dx / L;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (nx * (cx - mx) + nz * (cz - mz) > 0) { nx = -nx; nz = -nz; }
    edges.push({ x0, z0, dx: dx / L, dz: dz / L, nx, nz, L, mx, mz });
  }
  return edges;
}

function signTexture(text, bg, fg) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 160;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 160);
  g.fillStyle = fg;
  g.font = 'bold 88px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 86);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function placeBoard(parent, edge, along, y, w, h, tex, bg) {
  const t = Math.max(w / 2 + 0.3, Math.min(edge.L - w / 2 - 0.3, along));
  const yaw = Math.atan2(edge.nx, edge.nz);
  const face = new THREE.MeshLambertMaterial({ map: tex, emissive: '#fff4e4', emissiveMap: tex, emissiveIntensity: 0.55 });
  const side = new THREE.MeshLambertMaterial({ color: bg });
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), [side, side, side, side, face, face]);
  board.position.set(edge.x0 + edge.dx * t + edge.nx * 0.16, y, edge.z0 + edge.dz * t + edge.nz * 0.16);
  board.rotation.y = yaw;
  board.castShadow = true;
  parent.add(board);
}

export function placeNobiosHotel(data) {
  if (data.buildings.some((b) => b.n === '노비오스호텔')) return;
  const [x, z] = centroid(NOBIOS_RING);
  data.buildings.push({ o: NOBIOS_RING, h: NOBIOS_HEIGHT, k: 'commercial', n: '노비오스호텔' });
  data.labels.push(
    { x, z, y: NOBIOS_HEIGHT + 2.4, text: '노비오스호텔', kind: 'hotel' },
    { x: -104.6, z, y: 3.5, text: '빵집', kind: 'hotel' },
  );
}

export function addNobiosShop(scene) {
  const root = new THREE.Group();
  root.name = 'nobiosShop';
  const glow = new THREE.Group();
  glow.name = 'nobiosShopGlow';
  const awningMat = new THREE.MeshLambertMaterial({ color: '#b56545' });
  const frameMat = new THREE.MeshLambertMaterial({ color: '#3a322c' });
  const glassMat = new THREE.MeshLambertMaterial({ color: '#8ea4b4' });
  const doorMat = new THREE.MeshLambertMaterial({ color: '#5a3b2c' });
  const glowMat = new THREE.MeshBasicMaterial({
    color: '#ff9a3c',
    transparent: true,
    opacity: 0.92,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const bakeryTex = signTexture('빵집', '#f4e2c4', '#6a3418');
  const nameTex = signTexture('노비오스호텔', '#f7f1e6', '#2a241c');

  for (const edge of outwardEdges(NOBIOS_RING)) {
    const street = edge.nx < -0.7 || edge.nz > 0.7;
    if (!street) continue;
    const yaw = Math.atan2(edge.nx, edge.nz);
    const span = Math.min(edge.L - 0.7, edge.L * 0.9);
    const depth = 1.05;
    const awning = new THREE.Mesh(new THREE.BoxGeometry(span, 0.1, depth), awningMat);
    awning.position.set(edge.mx + edge.nx * (0.04 + depth / 2), 2.92, edge.mz + edge.nz * (0.04 + depth / 2));
    awning.rotation.y = yaw;
    awning.castShadow = true;
    root.add(awning);

    const towardStarbucks = edge.nx < -0.7;
    placeBoard(root, edge, edge.L / 2, 3.52, Math.min(towardStarbucks ? 7.4 : 8.2, span * 0.78), 0.62, nameTex, '#f7f1e6');
    if (towardStarbucks) {
      const lip = 0.04 + depth;
      const valance = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.55, 0.06), [
        new THREE.MeshLambertMaterial({ color: '#f4e2c4' }),
        new THREE.MeshLambertMaterial({ color: '#f4e2c4' }),
        new THREE.MeshLambertMaterial({ color: '#f4e2c4' }),
        new THREE.MeshLambertMaterial({ color: '#f4e2c4' }),
        new THREE.MeshLambertMaterial({ map: bakeryTex, emissive: '#fff4e4', emissiveMap: bakeryTex, emissiveIntensity: 0.55 }),
        new THREE.MeshLambertMaterial({ map: bakeryTex, emissive: '#fff4e4', emissiveMap: bakeryTex, emissiveIntensity: 0.55 }),
      ]);
      valance.position.set(edge.mx + edge.nx * lip, 2.58, edge.mz + edge.nz * lip);
      valance.rotation.y = yaw;
      valance.castShadow = true;
      root.add(valance);
    }

    const slots = Math.max(3, Math.round(edge.L / 3.4));
    const doorSlot = Math.floor(slots / 2);
    for (let i = 0; i < slots; i++) {
      const t = (i + 0.5) / slots * edge.L;
      const px = edge.x0 + edge.dx * t;
      const pz = edge.z0 + edge.dz * t;
      const door = towardStarbucks && i === doorSlot;
      const w = door ? 1.15 : 2.15;
      const h = door ? 2.05 : 1.72;
      const y = door ? h / 2 : 0.28 + h / 2;
      const out = 0.07;
      const pane = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), door ? doorMat : glassMat);
      pane.position.set(px + edge.nx * out, y, pz + edge.nz * out);
      pane.rotation.y = yaw;
      pane.castShadow = true;
      root.add(pane);
      if (door) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.08, 0.08), frameMat);
        frame.position.set(px + edge.nx * (out + 0.02), h + 0.04, pz + edge.nz * (out + 0.02));
        frame.rotation.y = yaw;
        root.add(frame);
        continue;
      }
      const lit = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, h * 0.82), glowMat);
      lit.position.set(px + edge.nx * 0.12, y, pz + edge.nz * 0.12);
      lit.rotation.y = yaw;
      glow.add(lit);
    }
  }
  scene.add(root, glow);
  watchEvening((on) => { glow.visible = on; });
}
