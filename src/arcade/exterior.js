// [arcade] 편의점식 1층 매장 외관 — 유리 파사드 + 건물 간판 + 문. standalone 봉·슬래브는 쓰지 않는다.
import * as THREE from 'three';
import { arcadePlacements } from './locations.js';

const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';

function fasciaTexture(title, sub) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, '#241840'); bg.addColorStop(1, '#120c22');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 256);
  const neon = ctx.createLinearGradient(40, 0, 984, 0);
  neon.addColorStop(0, '#7eb6ff'); neon.addColorStop(0.45, '#ff9ecd'); neon.addColorStop(1, '#ffe66d');
  ctx.fillStyle = neon; ctx.fillRect(14, 14, 996, 228);
  ctx.fillStyle = '#1a1030'; ctx.fillRect(26, 26, 972, 204);
  ctx.fillStyle = 'rgba(255,230,109,0.9)';
  for (const [x, y] of [[54, 50], [970, 50], [54, 206], [970, 206]]) {
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe66d';
  ctx.shadowColor = 'rgba(255,158,205,0.8)'; ctx.shadowBlur = 16;
  ctx.font = `900 82px ${FONT}`;
  ctx.fillText(title, 512, 108);
  ctx.shadowBlur = 0;
  ctx.font = `800 40px ${FONT}`;
  ctx.fillStyle = '#9ec1ff';
  ctx.fillText(sub, 512, 178);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function interiorTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#2a1860'); g.addColorStop(1, '#100818');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  const cabinets = [
    [50, 140, 140, 300, '#7a4dff'],
    [230, 160, 128, 280, '#ff6eb4'],
    [400, 130, 152, 310, '#3ec8ff'],
    [590, 155, 124, 285, '#ffe066'],
    [750, 145, 144, 295, '#ff8a5b'],
  ];
  for (const [x, y, w, h, col] of cabinets) {
    ctx.fillStyle = '#12081f'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col; ctx.globalAlpha = 0.95; ctx.fillRect(x + 10, y + 14, w - 20, 48);
    ctx.globalAlpha = 0.45; ctx.fillRect(x + 18, y + 80, w - 36, h - 130);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#080410'; ctx.fillRect(x + 12, y + h - 28, w - 24, 18);
  }
  ctx.fillStyle = '#ffe66d';
  ctx.font = `900 52px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('범핑팡', 512, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function bladeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 384;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a1030'; ctx.fillRect(0, 0, 128, 384);
  ctx.fillStyle = '#ff9ecd'; ctx.fillRect(8, 8, 112, 368);
  ctx.fillStyle = '#241840'; ctx.fillRect(16, 16, 96, 352);
  ctx.fillStyle = '#ffe66d';
  ctx.font = `900 42px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ['오', '락', '실'].forEach((ch, i) => ctx.fillText(ch, 64, 90 + i * 88));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addStorefront(root, st, shared) {
  const g = new THREE.Group();
  g.name = `arcade-shop-${st.id}`;
  const nx = st.nx ?? 0, nz = st.nz ?? 1;
  const [dx, dz] = st.door;
  // 문 = 벽 + n*1.2. 외벽을 뚫고 나가지 않게 벽에서 0.22m 밖으로 띄운다.
  const wallX = dx - nx * 1.2, wallZ = dz - nz * 1.2;
  g.position.set(wallX + nx * 0.22, 0, wallZ + nz * 0.22);
  g.rotation.y = Math.atan2(nx, nz);

  const W = st.width || 10;
  const glassH = 2.48, kick = 0.38, fasciaH = 1.05;
  const fasciaY = kick + glassH + 0.08 + fasciaH / 2;

  const frameMat = new THREE.MeshStandardMaterial({ color: '#1e1233', metalness: 0.2, roughness: 0.5 });
  const neonMat = new THREE.MeshStandardMaterial({ color: '#ff9ecd', emissive: '#ff9ecd', emissiveIntensity: 0.45, roughness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#b7e4ff', metalness: 0.2, roughness: 0.06,
    transparent: true, opacity: 0.22, emissive: '#3a2470', emissiveIntensity: 0.2,
    side: THREE.DoubleSide,
  });
  const kickMat = new THREE.MeshStandardMaterial({ color: '#140c24', roughness: 0.72 });

  // 불투명 내부 벽 — 유리 너머 오락실처럼 보이게 (건물 안쪽이 아니라 파사드에 붙임)
  const inner = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.12, glassH + kick - 0.06),
    new THREE.MeshBasicMaterial({ map: shared.innerTex }),
  );
  inner.position.set(0, (kick + glassH) / 2, 0.03);
  g.add(inner);

  const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, kick + glassH + 0.06, 0.06), frameMat);
  back.position.set(0, (kick + glassH) / 2, 0.0);
  g.add(back);

  const kickM = new THREE.Mesh(new THREE.BoxGeometry(W, kick, 0.2), kickMat);
  kickM.position.set(0, kick / 2, 0.12);
  g.add(kickM);

  const doorW = 1.6;
  const side = (W - doorW - 0.36) / 2;
  const paneY = kick + glassH / 2;
  const addGlass = (cx, w) => {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w, glassH - 0.06, 0.03), glassMat);
    pane.position.set(cx, paneY, 0.16);
    g.add(pane);
  };
  addGlass(-(doorW / 2 + 0.12 + side / 2), side);
  addGlass(+(doorW / 2 + 0.12 + side / 2), side);
  addGlass(0, doorW - 0.12);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.46, 8), neonMat);
  handle.position.set(doorW * 0.28, kick + 1.15, 0.22);
  g.add(handle);

  const rail = (x, w, y, h, z = 0.15) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), frameMat);
    m.position.set(x, y, z);
    g.add(m);
  };
  rail(-W / 2 + 0.07, 0.14, (kick + glassH) / 2, kick + glassH);
  rail(W / 2 - 0.07, 0.14, (kick + glassH) / 2, kick + glassH);
  rail(-(doorW / 2 + 0.07), 0.1, paneY, glassH);
  rail(+(doorW / 2 + 0.07), 0.1, paneY, glassH);
  rail(-(doorW / 2 + 0.18 + side / 2), 0.08, paneY, glassH);
  rail(+(doorW / 2 + 0.18 + side / 2), 0.08, paneY, glassH);
  rail(0, W, kick + glassH + 0.05, 0.1, 0.16);

  // 문 주위 얇은 네온(독립 봉이 아니라 틀)
  const glow = (x, w, y, h) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), neonMat);
    m.position.set(x, y, 0.22);
    g.add(m);
  };
  glow(-doorW / 2, 0.05, paneY, glassH);
  glow(doorW / 2, 0.05, paneY, glassH);
  glow(0, doorW + 0.05, kick + glassH, 0.05);

  const fasciaMap = shared.fascia.get(st.id);
  const fascia = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.2, fasciaH, 0.28),
    [
      frameMat, frameMat, frameMat, frameMat,
      new THREE.MeshStandardMaterial({
        map: fasciaMap, emissive: '#ffffff', emissiveMap: fasciaMap,
        emissiveIntensity: 0.55, roughness: 0.35,
      }),
      frameMat,
    ],
  );
  fascia.position.set(0, fasciaY, 0.2);
  g.add(fascia);

  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 1.85, 0.56),
    [
      new THREE.MeshStandardMaterial({ map: shared.bladeTex, emissive: '#ffffff', emissiveMap: shared.bladeTex, emissiveIntensity: 0.45 }),
      new THREE.MeshStandardMaterial({ map: shared.bladeTex, emissive: '#ffffff', emissiveMap: shared.bladeTex, emissiveIntensity: 0.45 }),
      frameMat, frameMat, frameMat, frameMat,
    ],
  );
  blade.position.set(W / 2 - 0.18, fasciaY - 0.1, 0.48);
  g.add(blade);

  const bx = -W / 2 + 1.2;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 1.2, 0.08),
    new THREE.MeshStandardMaterial({ color: '#152238', emissive: '#1a2a4a', emissiveIntensity: 0.5 }),
  );
  board.position.set(bx, 1.5, 0.24);
  board.userData.arcBoard = true;
  g.add(board);
  const bSign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.4),
    new THREE.MeshBasicMaterial({ map: fasciaMap }),
  );
  bSign.position.set(bx, 1.92, 0.29);
  g.add(bSign);

  root.add(g);
  return g;
}

function addJeongjaBuilding(root, st) {
  const [x0, zS] = st.ring[0], [x1] = st.ring[1], [, zN] = st.ring[2];
  const cx = (x0 + x1) / 2, cz = (zS + zN) / 2;
  const bw = Math.abs(x1 - x0), bd = Math.abs(zN - zS);
  const gf = st.gf || 3.6, h = st.h || 8.4;
  const wall = new THREE.MeshLambertMaterial({ color: '#b7a896' });
  const trim = new THREE.MeshLambertMaterial({ color: '#3a2a55' });
  const upperH = h - gf;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(bw, upperH, bd), wall);
  upper.position.set(cx, gf + upperH / 2, cz);
  upper.castShadow = true;
  root.add(upper);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.3, 0.18, bd + 0.3), trim);
  roof.position.set(cx, h + 0.05, cz);
  root.add(roof);
  // 2층 창문 띠
  const win = new THREE.MeshLambertMaterial({ color: '#6d88a3' });
  const winH = 1.3;
  for (const [w, d, x, z] of [
    [bw - 0.6, 0.06, cx, zS + 0.04],
    [bw - 0.6, 0.06, cx, zN - 0.04],
    [0.06, bd - 0.6, x0 + 0.04, cz],
    [0.06, bd - 0.6, x1 - 0.04, cz],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, winH, d), win);
    m.position.set(x, gf + 1.7, z);
    root.add(m);
  }
  // 1층 옆·뒷벽 (전면은 유리 매장)
  const sides = [
    { w: bw, d: 0.24, x: cx, z: zN + 0.1 },
    { w: 0.24, d: bd, x: x0 + 0.1, z: cz },
    { w: 0.24, d: bd, x: x1 - 0.1, z: cz },
  ];
  for (const s of sides) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, gf, s.d), trim);
    m.position.set(s.x, gf / 2, s.z);
    root.add(m);
  }
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(bw - 0.3, 0.08, bd - 0.3),
    new THREE.MeshLambertMaterial({ color: '#1a1030' }),
  );
  floor.position.set(cx, 0.04, cz);
  root.add(floor);
}

export function mountArcadeExterior({ scene } = {}) {
  const stores = arcadePlacements();
  const g = new THREE.Group();
  g.name = 'bump-arcade-exterior';

  const fascia = new Map();
  for (const st of stores) {
    fascia.set(st.id, fasciaTexture('BUMP 오락실', `범핑팡 · ${st.branch || st.name}`));
  }
  const shared = { fascia, innerTex: interiorTexture(), bladeTex: bladeTexture() };
  for (const st of stores) addStorefront(g, st, shared);

  const jz = stores.find((s) => s.id === 'arcade-jeongja');
  if (jz?.ring) addJeongjaBuilding(g, jz);

  scene.add(g);
  return {
    group: g,
    stores,
    store: stores[0],
    dispose() {
      scene.remove(g);
      for (const t of fascia.values()) t.dispose();
      shared.innerTex.dispose();
      shared.bladeTex.dispose();
    },
  };
}
