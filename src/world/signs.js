// 가게·건물 이름 간판. 스타벅스는 초록 보드에 '벅스'만 쓴다. 공식 로고는 쓰지 않는다.
import * as THREE from 'three';

const ROAD_KIND = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'trunk']);
const STRIP = { cafe: '#8a5a3a', shop: '#3d6d8c', mart: '#c46a2b', plaza: '#2c3e55', academy: '#3f6b4e', landmark: '#243044', public: '#6a3030' };

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

function outwardEdges(ring) {
  const [cx, cz] = centroid(ring);
  const edges = [];
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    if (L < 4) continue;
    let nx = -dz / L, nz = dx / L;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (nx * (cx - mx) + nz * (cz - mz) > 0) { nx = -nx; nz = -nz; }
    edges.push({ x0, z0, dx: dx / L, dz: dz / L, nx, nz, L, mx, mz });
  }
  return edges;
}

function nearestRoad(segs, x, z) {
  let best = null, bd = 75;
  for (const [a, b] of segs) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(px - x, pz - z);
    if (d < bd) { bd = d; best = { x: px, z: pz }; }
  }
  return best;
}

function pickFace(edges, label, road) {
  let best = null, bestS = Infinity;
  for (const e of edges) {
    let s = Math.hypot(e.mx - label.x, e.mz - label.z);
    if (road) {
      const dx = road.x - e.mx, dz = road.z - e.mz, L = Math.hypot(dx, dz) || 1;
      s -= ((dx / L) * e.nx + (dz / L) * e.nz) * 16;
    }
    s -= Math.min(e.L, 20) * 0.05;
    if (s < bestS) { bestS = s; best = e; }
  }
  return best;
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

function policeHost(buildings, label) {
  let best = null, area = 0;
  for (const b of buildings) {
    const [cx, cz] = centroid(b.o);
    if (Math.hypot(cx - label.x, cz - label.z) > 50) continue;
    const a = ringArea(b.o);
    if (a > area) { area = a; best = b; }
  }
  return best || hostBuilding(buildings, label.x, label.z);
}

function hostBuilding(buildings, x, z) {
  for (const b of buildings) {
    if (pointInRing(x, z, b.o) && !(b.holes || []).some((h) => pointInRing(x, z, h))) return b;
  }
  let best = null, bd = 28;
  for (const b of buildings) {
    const [cx, cz] = centroid(b.o);
    const d = Math.hypot(cx - x, cz - z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function boardCopy(text) {
  if (/스타벅스/.test(text)) return '벅스';
  if (/행정복지센터/.test(text)) return '복지센터';
  if (/이마트에브리데이/.test(text)) return '이마트';
  if (/홈플러스/.test(text)) return '홈플러스';
  if (/롯데슈퍼/.test(text)) return '롯데슈퍼';
  if (/이마트24/.test(text)) return '이마트24';
  if (/세븐일레븐/.test(text)) return '세븐일레븐';
  if (/GS25/.test(text)) return 'GS25';
  if (text === 'CU' || text.startsWith('CU ')) return 'CU';
  if (/다이소/.test(text)) return '다이소';
  if (/그린팩토리/.test(text)) return '그린팩토리';
  if (/1784/.test(text)) return '1784';
  if (/정동마트/.test(text)) return '정동마트';
  return text.length > 10 ? text.slice(0, 10) : text;
}

function styleOf(label) {
  const text = label.text || '';
  if (/유치원|어린이집|관리사무소|학교|중학교|초등학교|고등학교/.test(text)) return null;
  if (/우체국|우편/.test(text)) return { mark: 'post' };
  if (/경찰/.test(text)) return { mark: 'police' };
  if (/스타벅스/.test(text)) return { text: '벅스', bg: '#006241', fg: '#ffffff', accent: '#1e3932' };
  if (!['cafe', 'shop', 'mart', 'plaza', 'academy', 'landmark', 'public'].includes(label.kind)) return null;
  if (label.kind === 'public' && !/복지|행정/.test(text)) return null;
  return { text: boardCopy(text), bg: '#f6f1e8', fg: '#1b2430', accent: STRIP[label.kind] || '#243044' };
}

const texCache = new Map();
function canvasTexture(draw, key) {
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 288;
  draw(cv.getContext('2d'), cv);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  texCache.set(key, tex);
  return tex;
}

function boardTexture(text, bg, fg, accent) {
  return canvasTexture((g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 288);
    g.fillStyle = accent;
    g.fillRect(0, 0, 1024, 36);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 210;
    const font = (px) => `bold ${px}px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif`;
    g.font = font(size);
    while (size > 64 && g.measureText(text).width > 760) { size -= 6; g.font = font(size); }
    g.fillText(text, 512, 168);
  }, text + bg);
}

function markTexture(kind) {
  if (kind === 'police') return policeBadge();
  return canvasTexture((g) => {
    g.fillStyle = '#f6f3ee';
    g.fillRect(0, 0, 1024, 288);
    g.fillStyle = '#d0121a';
    g.beginPath();
    g.arc(250, 144, 108, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 120px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('우', 250, 150);
    g.fillStyle = '#9d1020';
    g.font = 'bold 92px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    g.fillText('우체국', 640, 150);
  }, 'mark-post');
}

function policeBadge() {
  if (texCache.has('police-badge')) return texCache.get('police-badge');
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#12325f';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#f2f6fb';
  g.lineWidth = 18;
  g.strokeRect(28, 28, 456, 456);
  g.fillStyle = '#f4f7fb';
  g.beginPath();
  g.moveTo(256, 78);
  g.lineTo(392, 132);
  g.lineTo(368, 292);
  g.quadraticCurveTo(256, 390, 144, 292);
  g.lineTo(120, 132);
  g.closePath();
  g.fill();
  g.fillStyle = '#1d4e89';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 ? 28 : 68;
    const x = 256 + Math.cos(a) * rad, y = 196 + Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  g.fillStyle = '#12325f';
  g.font = 'bold 78px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('경찰', 256, 430);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  texCache.set('police-badge', tex);
  return tex;
}

function addBoard(scene, face, along, y, w, h, tex, sideColor) {
  const t = Math.max(w / 2 + 0.25, Math.min(face.L - w / 2 - 0.25, along));
  const x = face.x0 + face.dx * t + face.nx * 0.38;
  const z = face.z0 + face.dz * t + face.nz * 0.38;
  const faceMat = new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.4 });
  const sideMat = new THREE.MeshLambertMaterial({ color: sideColor });
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), [sideMat, sideMat, sideMat, sideMat, faceMat, faceMat]);
  board.position.set(x, y, z);
  board.rotation.y = Math.atan2(face.nx, face.nz);
  board.castShadow = true;
  scene.add(board);
  return { x, z, w };
}

export function addPlaceSigns(scene, data) {
  const segs = [];
  for (const r of data.roads) {
    if (!ROAD_KIND.has(r.k)) continue;
    for (let i = 1; i < r.p.length; i++) segs.push([r.p[i - 1], r.p[i]]);
  }
  const placed = [];
  for (const label of data.labels) {
    if (label.text === '성남정자동우체국') continue;
    const style = styleOf(label);
    if (!style) continue;
    const shown = style.mark ? (style.mark === 'post' ? '우체국' : '경찰') : style.text;
    if (placed.some((p) => p.text === shown && Math.hypot(p.x - label.x, p.z - label.z) < 12)) continue;
    const host = style.mark === 'police' ? policeHost(data.buildings, label) : hostBuilding(data.buildings, label.x, label.z);
    if (!host) continue;
    const face = pickFace(outwardEdges(host.o), label, nearestRoad(segs, label.x, label.z));
    if (!face) continue;
    const mark = !!style.mark;
    const badge = style.mark === 'police';
    let w = badge ? 3.3 : mark ? Math.min(4.6, face.L * 0.7) : Math.min(face.L * 0.8, Math.max(style.text === '벅스' ? 4.2 : 3.2, style.text.length * 0.95));
    w = Math.min(w, face.L - 0.5);
    if (w < 1.6) continue;
    const h = badge ? 3.3 : mark ? 1.7 : style.text === '벅스' ? 1.35 : 1.15;
    const y = badge ? Math.min(host.h - h / 2 - 0.4, 7.4) : host.h <= 9 ? Math.max(h / 2 + 1.5, host.h - h / 2 - 0.3) : Math.min(host.h - h / 2 - 1, 8.5);
    const along = (label.x - face.x0) * face.dx + (label.z - face.z0) * face.dz;
    const tex = mark ? markTexture(style.mark) : boardTexture(style.text, style.bg, style.fg, style.accent);
    const spot = addBoard(scene, face, along, y, w, h, tex, mark ? '#f6f3ee' : style.bg);
    placed.push({ text: shown, x: spot.x, z: spot.z, w });
  }
}
