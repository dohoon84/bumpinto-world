// [arcade] 편의점식 1층 매장 외관 — 통유리 파사드 + 건물 간판 + 문.
// 유리 너머로 오락기·조명·카운터가 보이도록 얕은 실내를 두고, 멀면 LOD 로 숨긴다.
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

function labelTexture(text, fg, bg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = fg;
  ctx.font = `900 32px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWindowCabinet({ label, color, playable, depth = 0.72 }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 1.72, depth),
    new THREE.MeshStandardMaterial({
      color: playable ? '#4a2a78' : '#352050', roughness: 0.35, metalness: 0.3,
      emissive: playable ? '#2a1850' : '#1a1028', emissiveIntensity: 0.35,
    }),
  );
  body.position.y = 0.86; g.add(body);
  const accent = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.07, depth + 0.02),
    new THREE.MeshBasicMaterial({ color: playable ? color : '#3a3050' }),
  );
  accent.position.y = 1.7; g.add(accent);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.96, 0.72),
    new THREE.MeshBasicMaterial({ color }),
  );
  screen.position.set(0, 1.22, depth / 2 + 0.01); g.add(screen);
  const marquee = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.28),
    new THREE.MeshBasicMaterial({ map: labelTexture(label, '#1a1030', color) }),
  );
  marquee.position.set(0, 1.82, depth / 2 - 0.08); g.add(marquee);
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 0.32, depth * 0.55),
    new THREE.MeshStandardMaterial({ color: '#120c1c', roughness: 0.55, emissive: '#1a1020', emissiveIntensity: 0.2 }),
  );
  panel.position.set(0, 0.52, depth * 0.28); g.add(panel);
  if (playable) {
    const btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12),
      new THREE.MeshBasicMaterial({ color: '#ff6b9d' }),
    );
    btn.rotation.x = Math.PI / 2; btn.position.set(-0.24, 0.66, depth / 2 + 0.02); g.add(btn);
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8),
      new THREE.MeshBasicMaterial({ color: '#ffe66d' }),
    );
    stick.position.set(0.24, 0.72, depth * 0.35); g.add(stick);
  }
  return g;
}

/** 통유리 너머로 보이는 오락실 내부. 자체 발광이라 낮·밤 모두 읽힌다. 멀면 LOD 로 끈다. */
function addWindowInterior(parent, st) {
  const W = st.width || 10;
  const deep = st.ring ? 4.0 : 1.08;
  const H = 3.2;
  const inner = new THREE.Group();
  inner.name = `arcade-window-${st.id}`;

  const floorTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#2a1848' : '#1a1030';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(2, Math.round(W / 2.2)), Math.max(1, Math.round(deep / 1.4)));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.2, deep - 0.1),
    new THREE.MeshStandardMaterial({ map: floorTex, emissive: '#3a2468', emissiveIntensity: 0.65, roughness: 0.7 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.03, -deep / 2);
  inner.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#4a3080', emissive: '#3a2468', emissiveIntensity: 0.75, roughness: 0.7 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.15, H - 0.1), wallMat);
  back.position.set(0, H / 2, -deep + 0.04);
  inner.add(back);
  const sideGeo = new THREE.PlaneGeometry(deep - 0.08, H - 0.1);
  const left = new THREE.Mesh(sideGeo, wallMat);
  left.position.set(-(W / 2 - 0.1), H / 2, -deep / 2);
  left.rotation.y = Math.PI / 2;
  inner.add(left);
  const right = new THREE.Mesh(sideGeo, wallMat);
  right.position.set(W / 2 - 0.1, H / 2, -deep / 2);
  right.rotation.y = -Math.PI / 2;
  inner.add(right);
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.2, deep - 0.1),
    new THREE.MeshStandardMaterial({ color: '#3a2470', emissive: '#4a2890', emissiveIntensity: 0.7, roughness: 0.75 }),
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H - 0.06, -deep / 2);
  inner.add(ceil);

  for (const [z, col] of [[-deep * 0.28, '#ff66aa'], [-deep * 0.55, '#7eb6ff'], [-deep * 0.82, '#ffe66d']]) {
    if (-z > deep - 0.15) continue;
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.45, 0.07, 0.18),
      new THREE.MeshBasicMaterial({ color: col }),
    );
    strip.position.set(0, H - 0.14, z);
    inner.add(strip);
  }

  const specs = [
    { label: '리듬팡', color: '#ff9ecd', playable: false },
    { label: '범핑팡', color: '#7eb6ff', playable: true },
    { label: '퍼즐팡', color: '#3ddc97', playable: false },
    { label: '인형뽑기', color: '#ffe66d', playable: false },
    { label: '준비중', color: '#c084fc', playable: false },
  ];
  const nCab = 4;
  const cabDepth = st.ring ? 0.78 : 0.5;
  const zCab = st.ring ? -1.85 : -0.42;
  const span = W - 4.2;
  for (let i = 0; i < nCab; i++) {
    const s = specs[i];
    const cab = makeWindowCabinet({ ...s, depth: cabDepth });
    const x = -W / 2 + 1.15 + (span * i) / (nCab - 1);
    cab.position.set(x, 0, zCab);
    inner.add(cab);
  }

  // 오른쪽 앞쪽 카운터 — 거리에서 노란 상판이 보이게
  const cz = st.ring ? -1.45 : -0.52;
  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.95, Math.min(1.15, deep * 0.55)),
    new THREE.MeshStandardMaterial({ color: '#2a1848', emissive: '#3a2460', emissiveIntensity: 0.45, roughness: 0.5 }),
  );
  desk.position.set(W / 2 - 1.05, 0.48, cz);
  inner.add(desk);
  const deskTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.26, 0.07, Math.min(1.2, deep * 0.58)),
    new THREE.MeshBasicMaterial({ color: '#ffe66d' }),
  );
  deskTop.position.set(W / 2 - 1.05, 0.98, cz);
  inner.add(deskTop);

  const glow = new THREE.PointLight(0xff9ecd, 1.7, st.ring ? 10 : 6, 2);
  glow.position.set(0, 2.4, -deep * 0.35);
  inner.add(glow);
  const fill = new THREE.PointLight(0x7eb6ff, 1.05, st.ring ? 9 : 5, 2);
  fill.position.set(-W * 0.25, 2.1, -deep * 0.5);
  inner.add(fill);

  const lod = new THREE.LOD();
  lod.name = `arcade-window-lod-${st.id}`;
  lod.addLevel(inner, 0);
  lod.addLevel(new THREE.Group(), 58);
  parent.add(lod);
  return lod;
}

function addStorefront(root, st, shared) {
  const g = new THREE.Group();
  g.name = `arcade-shop-${st.id}`;
  const nx = st.nx ?? 0, nz = st.nz ?? 1;
  const [dx, dz] = st.door;
  const wallX = dx - nx * 1.2, wallZ = dz - nz * 1.2;
  g.position.set(wallX + nx * 0.22, 0, wallZ + nz * 0.22);
  g.rotation.y = Math.atan2(nx, nz);

  const W = st.width || 10;
  const glassH = 3.12, kick = 0.08, fasciaH = 1.05;
  const fasciaY = kick + glassH + 0.08 + fasciaH / 2;

  addWindowInterior(g, st);

  const frameMat = new THREE.MeshStandardMaterial({ color: '#1e1233', metalness: 0.2, roughness: 0.5 });
  const neonMat = new THREE.MeshStandardMaterial({ color: '#ff9ecd', emissive: '#ff9ecd', emissiveIntensity: 0.45, roughness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#e8f7ff', metalness: 0.08, roughness: 0.04,
    transparent: true, opacity: 0.10, emissive: '#1a1430', emissiveIntensity: 0.03,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const kickMat = new THREE.MeshStandardMaterial({ color: '#140c24', roughness: 0.72 });

  const kickM = new THREE.Mesh(new THREE.BoxGeometry(W, kick, 0.18), kickMat);
  kickM.position.set(0, kick / 2, 0.12);
  g.add(kickM);

  const doorW = 1.7;
  const side = (W - doorW - 0.36) / 2;
  const paneY = kick + glassH / 2;
  const addGlass = (cx, w) => {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w, glassH - 0.04, 0.03), glassMat);
    pane.position.set(cx, paneY, 0.16);
    g.add(pane);
  };
  addGlass(-(doorW / 2 + 0.12 + side / 2), side);
  addGlass(+(doorW / 2 + 0.12 + side / 2), side);
  addGlass(0, doorW - 0.12);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), neonMat);
  handle.position.set(doorW * 0.28, kick + 1.2, 0.22);
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
  rail(0, W, kick / 2, kick, 0.16);

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
  const xs = st.ring.map((p) => p[0]);
  const zs = st.ring.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const zLo = Math.min(...zs), zHi = Math.max(...zs);
  const cx = (x0 + x1) / 2, cz = (zLo + zHi) / 2;
  const bw = x1 - x0, bd = zHi - zLo;
  const gf = st.gf || 3.6, h = st.h || 8.4;
  const nx = st.nx ?? 0, nz = st.nz ?? 1;
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
  const win = new THREE.MeshLambertMaterial({ color: '#6d88a3' });
  const winH = 1.3;
  for (const [w, d, x, z] of [
    [bw - 0.6, 0.06, cx, zHi - 0.04],
    [bw - 0.6, 0.06, cx, zLo + 0.04],
    [0.06, bd - 0.6, x0 + 0.04, cz],
    [0.06, bd - 0.6, x1 - 0.04, cz],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, winH, d), win);
    m.position.set(x, gf + 1.7, z);
    root.add(m);
  }
  const sides = [];
  if (nz <= 0.5) sides.push({ w: bw, d: 0.24, x: cx, z: zHi - 0.1 });
  if (nz >= -0.5) sides.push({ w: bw, d: 0.24, x: cx, z: zLo + 0.1 });
  if (nx <= 0.5) sides.push({ w: 0.24, d: bd, x: x1 - 0.1, z: cz });
  if (nx >= -0.5) sides.push({ w: 0.24, d: bd, x: x0 + 0.1, z: cz });
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
  const shared = { fascia, bladeTex: bladeTexture() };
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
      shared.bladeTex.dispose();
    },
  };
}
