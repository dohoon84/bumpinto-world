// [namsan] 남산 케이블카. OSM way/61855801 (회현동 하부정류장 → 남산타워 상부정류장, 수평 약 548 m).
//   실제 duration 태그는 3분. 게임에서는 경치를 볼 수 있게 약 70초로 달린다(공식 소요 시간이라고 적어 두지 않음).
//   교행(jigback): 한 대가 올라가면 다른 대가 내려온다. ?ncable=0 이면 생성하지 않는다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NT } from './namsanCoords.js';
import { centroid, pointInRing, planStationAccess } from './namsanCableAccess.js';

/** 미니맵·안내용 탑승 위치. 정류장 건물 중심(OSM footprint)을 쓰고, 없으면 케이블 양 끝 노드. */
export function namsanCableStations(osm) {
  const nodes = osm?.cable?.nodes || [];
  const fromFoot = (pts) => (pts?.length >= 3 ? centroid(pts) : null);
  const nodeAt = (i) => {
    const n = nodes[i];
    return n && Number.isFinite(+n.x) && Number.isFinite(+n.z) ? { x: +n.x, z: +n.z } : null;
  };
  const upper = fromFoot(osm?.upperStation?.pts) || nodeAt(0);
  const lower = fromFoot(osm?.lowerStation?.pts) || nodeAt(nodes.length - 1);
  const out = [];
  if (upper) out.push({ id: 'namsan-cable-upper', which: 'upper', x: upper.x, z: upper.z, label: '케이블카 탑승 · 남산타워', labelEn: 'Cable car · Namsan Tower', shortLabel: '케이블카 타워', shortLabelEn: 'Cable Tower', icon: '🚠' });
  if (lower) out.push({ id: 'namsan-cable-lower', which: 'lower', x: lower.x, z: lower.z, label: '케이블카 탑승 · 회현', labelEn: 'Cable car · Hoehyeon', shortLabel: '케이블카 회현', shortLabelEn: 'Cable Hoehyeon', icon: '🚠' });
  return out;
}

/** 정류장 건물에서 케이블 반대쪽 벽(출입문)의 중점과 바깥 방향. stationBuilding 의 facingOpp 과 같다. */
export function namsanStationDoors(osm) {
  const nodes = osm?.cable?.nodes || [];
  const nodeAt = (i) => {
    const n = nodes[i];
    return n && Number.isFinite(+n.x) && Number.isFinite(+n.z) ? { x: +n.x, z: +n.z } : null;
  };
  return {
    upper: stationDoorFromPts(osm?.upperStation?.pts, nodeAt(0)),
    lower: stationDoorFromPts(osm?.lowerStation?.pts, nodeAt(nodes.length - 1)),
  };
}

function stationDoorFromPts(pts, face) {
  if (!pts || pts.length < 3) return null;
  const c = centroid(pts);
  if (!face) return { x: c.x, z: c.z, nx: 0, nz: 1, cx: c.x, cz: c.z };
  const faceAng = Math.atan2(face.x - c.x, face.z - c.z);
  let best = null, bestL = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 1.2) continue;
    const mx = (a[0] + b[0]) * 0.5, mz = (a[1] + b[1]) * 0.5;
    const ang = Math.atan2(mx - c.x, mz - c.z);
    let d = ang - faceAng;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > 2.2 && L > 4.2 && L > bestL) {
      const nd = Math.hypot(mx - c.x, mz - c.z) || 1;
      bestL = L;
      best = { x: mx, z: mz, nx: (mx - c.x) / nd, nz: (mz - c.z) / nd, cx: c.x, cz: c.z, L };
    }
  }
  if (best) return best;
  const ang = faceAng + Math.PI;
  const nx = Math.sin(ang), nz = Math.cos(ang);
  return { x: c.x + nx * 8, z: c.z + nz * 8, nx, nz, cx: c.x, cz: c.z, L: 0 };
}

// [myeongdong-detail] 하부(회현) 정류장 입구 꾸밈: 큰 배너 + 차양 + 지붕선 LED 띠 + 바닥 빛 번짐.
//   진짜 광원 없이 MeshBasic(발광처럼 보이는) 3 드로우. 밤엔 밝게, 낮엔 살짝 눌러 둔다.
function cableBannerCanvas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d'), W = 1024, H = 256;
  g.fillStyle = '#c62828'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff'; g.fillRect(0, H - 50, W, 50);
  g.strokeStyle = '#ffd54f'; g.lineWidth = 6; g.strokeRect(5, 5, W - 10, H - 10);
  // 곤돌라 아이콘
  g.strokeStyle = '#fff'; g.lineWidth = 7; g.beginPath(); g.moveTo(26, 40); g.lineTo(186, 22); g.stroke();
  g.beginPath(); g.moveTo(106, 31); g.lineTo(106, 62); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect(52, 62, 108, 106, 16); g.fill();
  g.fillStyle = '#c62828'; g.fillRect(64, 76, 38, 34); g.fillRect(110, 76, 38, 34);
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#fff';
  const fit = (t, maxW, px, wt = 900) => { let f = px; do { g.font = `${wt} ${f}px "Noto Sans KR", "Noto Sans CJK KR", sans-serif`; f -= 2; } while (g.measureText(t).width > maxW && f > 10); };
  fit('남산 케이블카', 800, 104); g.fillText('남산 케이블카', 200, 82);
  fit('NAMSAN CABLE CAR · 南山缆车 · ケーブルカー', 800, 44, 800); g.fillText('NAMSAN CABLE CAR · 南山缆车 · ケーブルカー', 202, 160);
  g.fillStyle = '#c62828'; g.textAlign = 'center';
  fit('왕복 ROUND TRIP ₩15,000 · 편도 ONE-WAY ₩12,000 · 10:00–23:00', W - 40, 34, 800); g.fillText('왕복 ROUND TRIP ₩15,000 · 편도 ONE-WAY ₩12,000 · 10:00–23:00', W / 2, H - 25);
  return c;
}
function glowCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 64, 2, 32, 64, 64);
  gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(1, 'rgba(255,236,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
}
function dressLowerStation(st, door) {
  if (!door || !st.userData.pts) return null;
  const y = st.userData.y, wallH = st.userData.wallH;
  // door.nx/nz 는 중심→문 방향이라 벽과 비스듬할 수 있다 → 문이 놓인 변의 진짜 바깥 법선을 쓴다
  let nx = door.nx, nz = door.nz;
  { const P = st.userData.pts, C = st.userData.center; let bd = Infinity;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, d = Math.hypot(mx - door.x, mz - door.z);
      if (d < bd) { bd = d; let ex = (b[1] - a[1]) / L, ez = -(b[0] - a[0]) / L; if (ex * (mx - C.x) + ez * (mz - C.z) < 0) { ex = -ex; ez = -ez; } nx = ex; nz = ez; }
    } }
  const rx = nz, rz = -nx, ang = Math.atan2(nx, nz);
  const out = (d) => [door.x + nx * d, door.z + nz * d];
  const parts = [];
  // 배너 (문 위 상인방)
  const bw = 9.6, bh = bw / 4; // 지붕선 위에 세운 큰 간판 (멀리서·가로 390 px 화면에서도 읽히게)
  const btex = new THREE.CanvasTexture(cableBannerCanvas()); btex.colorSpace = THREE.SRGBColorSpace; btex.anisotropy = 4;
  const bMat = new THREE.MeshBasicMaterial({ map: btex, color: '#e6e6e6' });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), bMat);
  const bY = y + wallH - 0.1 - bh / 2; // 문 위 벽면(상인방) — 계단 아래에서 올려다봐도 화면 안
  { const [x, z] = out(0.36); banner.position.set(x, bY, z); banner.rotation.y = ang; banner.name = 'namsan-cable-lower-banner'; st.add(banner); }
  // 차양 + LED: 한 MeshBasic (밝은 면만)
  const ledMat = new THREE.MeshBasicMaterial({ color: '#fff2d6' });
  const box = (w, h, d, x, yy, z) => { const b = new THREE.BoxGeometry(w, h, d); b.rotateY(ang); b.translate(x, yy, z); parts.push(b); };
  const canW = 5.2, canD = 2.4, cy = y + 4.1;
  { const [x, z] = out(0.2 + canD / 2); const cg = new THREE.BoxGeometry(canW, 0.04, canD); cg.rotateY(ang); cg.translate(x, cy - 0.16, z); parts.push(cg); }
  // 차양 앞 끝 띠 + 배너 밑 띠
  { const [x, z] = out(0.2 + canD); box(canW, 0.1, 0.06, x, cy - 0.05, z); }
  { const [x, z] = out(0.4); box(bw, 0.08, 0.06, x, bY - bh / 2 - 0.12, z); }
  // 지붕선 LED 띠 (벽 둘레, 바깥면)
  const pts = st.userData.pts, c = st.userData.center;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.6) continue;
    let mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; const d = Math.hypot(mx - c.x, mz - c.z) || 1;
    mx += (mx - c.x) / d * 0.24; mz += (mz - c.z) / d * 0.24;
    const g2 = new THREE.BoxGeometry(0.05, 0.12, L); g2.rotateY(Math.atan2(b[0] - a[0], b[1] - a[1])); g2.translate(mx, y + wallH - 0.08, mz); parts.push(g2);
  }
  const led = new THREE.Mesh(mergeGeometries(parts), ledMat); led.name = 'namsan-cable-lower-led'; st.add(led);
  // 차양 아래 기둥 2개 (벽 재질에 맞춘 Lambert 1 — 차양 판은 위 LED 면과 함께)
  const postMat = new THREE.MeshLambertMaterial({ color: '#3a4552' });
  const posts = [];
  for (const s of [-1, 1]) { const [x, z] = out(0.2 + canD - 0.15); const p = new THREE.BoxGeometry(0.14, cy - y, 0.14); p.translate(x + rx * s * (canW / 2 - 0.2), y + (cy - y) / 2, z + rz * s * (canW / 2 - 0.2)); posts.push(p); }
  { const bp = new THREE.BoxGeometry(bw + 0.24, bh + 0.24, 0.12); bp.rotateY(ang); const [x, z] = out(0.27); bp.translate(x, bY, z); posts.push(bp); }
  const roofG = new THREE.BoxGeometry(canW + 0.1, 0.12, canD + 0.05); roofG.rotateY(ang); { const [x, z] = out(0.2 + canD / 2); roofG.translate(x, cy - 0.08 + 0.1, z); } posts.push(roofG);
  const postM = new THREE.Mesh(mergeGeometries(posts), postMat); postM.name = 'namsan-cable-lower-canopy'; st.add(postM);
  // 바닥 빛 번짐
  const gtex = new THREE.CanvasTexture(glowCanvas());
  const spillMat = new THREE.MeshBasicMaterial({ map: gtex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(7, 6), spillMat); spill.rotation.x = -Math.PI / 2; spill.rotation.z = ang + Math.PI;
  { const [x, z] = out(3); spill.position.set(x, y + 0.08, z); } spill.name = 'namsan-cable-lower-spill'; spill.visible = false; st.add(spill);
  const wallMat = st.children[0]?.material; // 벽(정류장마다 따로 만든 재질) — 밤에 살짝 밝게
  return {
    setNight(v) {
      if (wallMat?.emissive) { wallMat.emissive.set('#4a5260'); wallMat.emissiveIntensity = v * 0.55; }
      bMat.color.setScalar(0.86 + v * 0.14);
      ledMat.color.set(v > 0.5 ? '#fff2d6' : '#d9d4c8');
      spillMat.opacity = v * 0.55; spill.visible = v > 0.02;
    },
  };
}

function makeSign(text, w, h, bg = '#1c2834', fg = '#f3f6f8') {
  const c = document.createElement('canvas'); c.width = 768; c.height = 192;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 768, 192);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 62px sans-serif'; x.fillText(text, 384, 96);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
}

function stationBuilding(pts, y, name, face) {
  const g = new THREE.Group();
  if (!pts || pts.length < 3) return g;
  const c = centroid(pts);
  const wallH = 7.2;
  const geos = [];
  const faceAng = face ? Math.atan2(face.x - c.x, face.z - c.z) : 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.3) continue;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const toMid = Math.atan2(mx - c.x, mz - c.z);
    const facingCable = Math.abs(Math.atan2(Math.sin(toMid - faceAng), Math.cos(toMid - faceAng))) < 0.55;
    const facingOpp = Math.abs(Math.atan2(Math.sin(toMid - faceAng - Math.PI), Math.cos(toMid - faceAng - Math.PI))) < 0.55;
    const door = (facingCable || facingOpp) && L > 4.2;
    if (door) {
      const gap = 3.6;
      const alongX = (b[0] - a[0]) / L, alongZ = (b[1] - a[1]) / L;
      const left = (L - gap) / 2;
      if (left > 0.8) {
        const cx1 = a[0] + alongX * (left * 0.5), cz1 = a[1] + alongZ * (left * 0.5);
        const cx2 = b[0] - alongX * (left * 0.5), cz2 = b[1] - alongZ * (left * 0.5);
        const bg1 = new THREE.BoxGeometry(0.4, wallH, left); bg1.rotateY(ang); bg1.translate(cx1, y + wallH / 2, cz1); geos.push(bg1);
        const bg2 = new THREE.BoxGeometry(0.4, wallH, left); bg2.rotateY(ang); bg2.translate(cx2, y + wallH / 2, cz2); geos.push(bg2);
        const lint = new THREE.BoxGeometry(0.45, 2.2, gap); lint.rotateY(ang); lint.translate(mx, y + wallH - 1.1, mz); geos.push(lint);
      }
    } else {
      const bg = new THREE.BoxGeometry(0.4, wallH, L);
      bg.rotateY(ang); bg.translate(mx, y + wallH / 2, mz);
      geos.push(bg);
    }
  }
  if (geos.length) g.add(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color: '#d7dde3' })));
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0] - c.x, -(p[1] - c.z))));
  const roof = new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false });
  roof.rotateX(-Math.PI / 2); roof.translate(c.x, y + wallH, c.z);
  g.add(new THREE.Mesh(roof, new THREE.MeshLambertMaterial({ color: '#8b6a3a' })));
  const floor = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  floor.rotateX(-Math.PI / 2); floor.translate(c.x, y + 0.06, c.z);
  const floorMesh = new THREE.Mesh(floor, new THREE.MeshLambertMaterial({ color: '#cfc6b6' }));
  g.add(floorMesh);
  const fx = Math.sin(faceAng), fz = Math.cos(faceAng);
  const plat = new THREE.Mesh(new THREE.BoxGeometry(8, 0.18, 3.2), new THREE.MeshLambertMaterial({ color: '#f0e6c8' }));
  plat.position.set(c.x + fx * 0.6, y + 0.2, c.z + fz * 0.6);
  plat.rotation.y = faceAng;
  g.add(plat);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 8, 24), new THREE.MeshLambertMaterial({ color: '#4a4e54' }));
  wheel.position.set(c.x + fx * 1.2, y + 5.4, c.z + fz * 1.2);
  wheel.rotation.y = faceAng;
  g.add(wheel);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 10), new THREE.MeshLambertMaterial({ color: '#2a2e32' }));
  hub.rotation.z = Math.PI / 2; hub.rotation.y = faceAng;
  hub.position.copy(wheel.position); g.add(hub);
  for (let i = -1; i <= 1; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.4), new THREE.MeshLambertMaterial({ color: '#3a4552' }));
    p.position.set(c.x - fx * 2.2 + Math.cos(faceAng) * i * 1.2, y + 0.7, c.z - fz * 2.2 + Math.sin(faceAng) * i * 1.2);
    p.rotation.y = faceAng;
    g.add(p);
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 0.55), new THREE.MeshLambertMaterial({ color: '#6a5344' }));
  bench.position.set(c.x + Math.cos(faceAng) * 3.4, y + 0.35, c.z + Math.sin(faceAng) * 3.4);
  bench.rotation.y = faceAng;
  g.add(bench);
  const sign = makeSign(name, 8.5, 1.15);
  sign.position.set(c.x, y + wallH + 1.4, c.z);
  sign.rotation.y = faceAng + Math.PI;
  g.add(sign);
  g.userData.center = c;
  g.userData.pts = pts;
  g.userData.y = y;
  g.userData.faceAng = faceAng;
  g.userData.wallH = wallH;
  g.userData.plat = plat;
  g.userData.floor = floorMesh;
  return g;
}

function makeCabin() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#c62828', metalness: 0.28, roughness: 0.38 });
  const redDark = new THREE.MeshLambertMaterial({ color: '#8e1c1c' });
  const frame = new THREE.MeshLambertMaterial({ color: '#4a4e54' });
  const railM = new THREE.MeshStandardMaterial({ color: '#c5ccd2', metalness: 0.55, roughness: 0.35 });
  const seatM = new THREE.MeshLambertMaterial({ color: '#6a4534' });
  const backM = new THREE.MeshLambertMaterial({ color: '#4e3228' });
  const glass = new THREE.MeshStandardMaterial({
    color: '#b9d4e6', transparent: true, opacity: 0.16, roughness: 0.06, metalness: 0.25,
    emissive: new THREE.Color('#ffe7b0'), emissiveIntensity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.12, 3.25), new THREE.MeshLambertMaterial({ color: '#3a2a24' }));
  floor.position.y = -1.05; g.add(floor);
  // hollow apron (skirt walls only — a solid box used to paint the whole floor red)
  for (const [sx, sy, sz, px, py, pz] of [
    [2.62, 0.72, 0.08, 0, -0.64, 1.61],
    [2.62, 0.72, 0.08, 0, -0.64, -1.61],
    [0.08, 0.72, 3.22, 1.27, -0.64, 0],
    [0.08, 0.72, 3.22, -1.27, -0.64, 0],
  ]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), red);
    w.position.set(px, py, pz); g.add(w);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.78, 0.16, 3.48), new THREE.MeshStandardMaterial({
    color: '#c8ccd0', roughness: 0.45, metalness: 0.15,
    emissive: new THREE.Color('#3a2220'), emissiveIntensity: 0.2,
  }));
  roof.position.y = 1.2; g.add(roof);
  // full-size interior ceiling so the roof underside never reads as a black slab
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.07, 3.38), new THREE.MeshStandardMaterial({
    color: '#f3e6c8', emissive: new THREE.Color('#ffe2a0'), emissiveIntensity: 0.55,
  }));
  ceil.position.y = 1.08; g.add(ceil);
  const ceilLight = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 2.2), new THREE.MeshStandardMaterial({
    color: '#fff6d8', emissive: new THREE.Color('#fff0c4'), emissiveIntensity: 0.85,
  }));
  ceilLight.position.y = 1.04; g.add(ceilLight);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.08, 3.4), red);
  rim.position.y = 1.14; g.add(rim);
  const panes = [
    { s: [0.06, 1.15, 2.85], p: [1.28, 0.28, 0] },
    { s: [0.06, 1.15, 2.85], p: [-1.28, 0.28, 0] },
    { s: [2.15, 1.15, 0.06], p: [0, 0.28, 1.58] },
    { s: [2.15, 1.15, 0.06], p: [0, 0.28, -1.58] },
  ];
  let glassMesh = null;
  for (const pn of panes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...pn.s), glass);
    m.position.set(...pn.p); g.add(m);
    if (!glassMesh) glassMesh = m;
  }
  for (const [x, z] of [[1.28, 1.55], [1.28, -1.55], [-1.28, 1.55], [-1.28, -1.55]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), redDark);
    post.position.set(x, 0.05, z); g.add(post);
  }
  // window-top frame only (a solid slab here used to paint the whole ceiling black)
  for (const [sx, sy, sz, px, py, pz] of [
    [2.62, 0.1, 0.08, 0, 0.92, 1.62],
    [2.62, 0.1, 0.08, 0, 0.92, -1.62],
    [0.08, 0.1, 3.22, 1.27, 0.92, 0],
    [0.08, 0.1, 3.22, -1.27, 0.92, 0],
  ]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), red);
    b.position.set(px, py, pz); g.add(b);
  }
  const hang = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, 0.16), frame);
  hang.position.y = 1.85; g.add(hang);
  const yoke = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.14, 0.16), frame);
  yoke.position.y = 2.5; g.add(yoke);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.32), new THREE.MeshLambertMaterial({ color: '#2a2e32' }));
  grip.position.y = 2.78; g.add(grip);
  const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 6, 12), frame);
  jaw.rotation.z = Math.PI / 2;
  jaw.position.y = 2.92; g.add(jaw);
  // benches under every window so the seat edge sits in the lower frame
  function bench(w, d, x, z, alongZ) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? d : w, 0.11, alongZ ? w : d), seatM);
    seat.position.set(x, -0.74, z); g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.07 : w, 0.4, alongZ ? w : 0.07), backM);
    const bx = alongZ ? x + Math.sign(x || 1) * 0.2 : x;
    const bz = alongZ ? z : z + Math.sign(z || 1) * 0.2;
    back.position.set(alongZ ? x + Math.sign(x) * 0.18 : x, -0.52, alongZ ? z : z + Math.sign(z) * 0.18);
    g.add(back);
  }
  bench(2.05, 0.4, 0.92, 0, true);
  bench(2.05, 0.4, -0.92, 0, true);
  bench(1.7, 0.4, 0, 1.12, false);
  bench(1.7, 0.4, 0, -1.12, false);
  // interior handrail at sill height
  for (const [sx, sz, px, pz] of [
    [2.28, 0.035, 0, 1.38],
    [2.28, 0.035, 0, -1.38],
    [0.035, 2.72, 1.14, 0],
    [0.035, 2.72, -1.14, 0],
  ]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.035, sz), railM);
    rail.position.set(px, -0.06, pz); g.add(rail);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 6), railM);
    post.position.set(Math.cos(a) * 1.12, -0.34, Math.sin(a) * 1.36);
    g.add(post);
  }
  g.userData.glass = glassMesh;
  g.userData.ceil = ceil;
  g.userData.ceilLight = ceilLight;
  return g;
}

// guide=true ([cableguide], ?cableguide=0 로 끔): 승강장에서 E/탭으로 바로 타기·다음 칸 예약,
//   도착 직후 같은 자리에 서 있어도 곧장 되돌아 타지 않게(armed), 내린 뒤 출입문 안쪽에 세운다.
//   guide=false 면 예전 그대로(0.85초 서 있기 + 정차 초반 1.4초 창).
export function createNamsanCable({ parent, osm, heightAt, overlay, guide = false }) {
  const g = new THREE.Group();
  g.name = 'namsan-cable';
  parent.add(g);

  const nodes = (osm?.cable?.nodes || []).map((n) => ({ x: n.x, z: n.z, kind: (n.tags || {}).aerialway || 'pylon' }));
  if (nodes.length < 2) return { group: g, riding: false, stations: [], stationInfo: [], update() {}, setNight() {}, tickPlayer() {}, isBlocked() { return false; }, floorY() { return null; } };

  // OSM order: upper(남산타워) → pylons → lower(회현동). Keep that, t=0 at upper, t=1 at lower.
  const pts = nodes.map((n) => {
    const ground = heightAt(n.x, n.z);
    const extra = n.kind === 'station' ? 8.5 : 22;
    return { x: n.x, z: n.z, y: ground + extra, ground, kind: n.kind };
  });
  // cable hangs slightly above stations' bullwheels
  pts[0].y = heightAt(pts[0].x, pts[0].z) + 6.8;
  pts[pts.length - 1].y = heightAt(pts[pts.length - 1].x, pts[pts.length - 1].z) + 6.8;

  // arc-length parameterization
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    seg.push({ a: pts[i - 1], b: pts[i], L, s0: total });
    total += L;
  }
  function at(t) {
    const s = Math.max(0, Math.min(1, t)) * total;
    let sgm = seg[seg.length - 1];
    for (const sg of seg) if (s <= sg.s0 + sg.L) { sgm = sg; break; }
    const u = sgm.L < 1e-6 ? 0 : (s - sgm.s0) / sgm.L;
    return {
      x: sgm.a.x + (sgm.b.x - sgm.a.x) * u,
      y: sgm.a.y + (sgm.b.y - sgm.a.y) * u,
      z: sgm.a.z + (sgm.b.z - sgm.a.z) * u,
      tx: (sgm.b.x - sgm.a.x) / (sgm.L || 1),
      ty: (sgm.b.y - sgm.a.y) / (sgm.L || 1),
      tz: (sgm.b.z - sgm.a.z) / (sgm.L || 1),
    };
  }

  // support pylons at OSM pylon nodes
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const h = p.y - p.ground;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, h, 8), new THREE.MeshLambertMaterial({ color: '#5c6168' }));
    mast.position.set(p.x, p.ground + h / 2, p.z); g.add(mast);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.28, 0.28), new THREE.MeshLambertMaterial({ color: '#4a4e54' }));
    arm.position.set(p.x, p.y, p.z); g.add(arm);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.4, 0.22), new THREE.MeshLambertMaterial({ color: '#4a4e54' }));
    cross.position.set(p.x, p.y - 0.7, p.z); g.add(cross);
  }

  // twin cables
  const side = 1.35;
  function cableGeo(off) {
    const N = 40;
    const positions = [];
    for (let i = 0; i <= N; i++) {
      const p = at(i / N);
      // offset perpendicular in XZ
      const nx = -p.tz, nz = p.tx, L = Math.hypot(nx, nz) || 1;
      positions.push(p.x + (nx / L) * off, p.y, p.z + (nz / L) * off);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }
  const cableMat = new THREE.MeshLambertMaterial({ color: '#2a2e32' });
  function cableTube(off) {
    const N = 40;
    const pts3 = [];
    for (let i = 0; i <= N; i++) {
      const p = at(i / N);
      const nx = -p.tz, nz = p.tx, L = Math.hypot(nx, nz) || 1;
      pts3.push(new THREE.Vector3(p.x + (nx / L) * off, p.y, p.z + (nz / L) * off));
    }
    const curve = new THREE.CatmullRomCurve3(pts3);
    return new THREE.Mesh(new THREE.TubeGeometry(curve, N, 0.055, 5, false), cableMat);
  }
  g.add(cableTube(-side));
  g.add(cableTube(side));

  // stations
  const upperPts = osm?.upperStation?.pts;
  const lowerPts = osm?.lowerStation?.pts;
  const upperY = heightAt(pts[0].x, pts[0].z);
  const lowerY = heightAt(pts[pts.length - 1].x, pts[pts.length - 1].z);
  const upperSt = stationBuilding(upperPts, upperY, '남산 케이블카 · 상부', pts[0]);
  const lowerSt = stationBuilding(lowerPts, lowerY, '남산 케이블카 · 하부', pts[pts.length - 1]);
  g.add(upperSt, lowerSt);
  const lowerDress = dressLowerStation(lowerSt, namsanStationDoors(osm).lower);

  const access = planStationAccess(osm, heightAt);
  const rampMat = new THREE.MeshLambertMaterial({ color: '#cfc6b6' });
  const riserMat = new THREE.MeshLambertMaterial({ color: '#b7aea0' });
  for (const r of access.ramps) {
    const yaw = Math.atan2(r.ux, r.uz);
    if (Math.abs(r.h0 - r.h1) < 0.25) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(r.hw * 2, 0.16, r.L + 0.25), rampMat);
      slab.position.set((r.ax + r.bx) * 0.5, r.h0 - 0.02, (r.az + r.bz) * 0.5);
      slab.rotation.y = yaw;
      g.add(slab);
      continue;
    }
    const n = Math.max(4, Math.round(Math.abs(r.h0 - r.h1) / 0.16));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const y0 = r.h0 + (r.h1 - r.h0) * t0;
      const y1 = r.h0 + (r.h1 - r.h0) * t1;
      const mid = (t0 + t1) * 0.5;
      const depth = r.L / n + 0.03;
      const h = Math.max(0.1, Math.abs(y0 - y1) + 0.07);
      const step = new THREE.Mesh(new THREE.BoxGeometry(r.hw * 2, h, depth), i % 2 ? riserMat : rampMat);
      step.position.set(r.ax + r.ux * r.L * mid, Math.min(y0, y1) + h * 0.5, r.az + r.uz * r.L * mid);
      step.rotation.y = yaw;
      g.add(step);
    }
  }

  if (overlay) {
    overlay.add({ cls: 'label', text: '🚠 남산 케이블카', getPos: () => new THREE.Vector3(pts[0].x, upperY + 12, pts[0].z), maxDist: 140 });
    overlay.add({ cls: 'label', text: '🚠 남산 케이블카 · 회현', getPos: () => new THREE.Vector3(pts[pts.length - 1].x, lowerY + 12, pts[pts.length - 1].z), maxDist: 400 });
  }

  const cabinA = makeCabin(); // starts at upper (t=0)
  const cabinB = makeCabin(); // starts at lower (t=1)
  g.add(cabinA, cabinB);

  const RIDE_DUR = 70;
  let phase = 0; // 0 = A at top going down, 1 = A at bottom going up; we animate u 0→1 then reverse
  let u = 0; // 0 = A at upper
  let dir = 1;
  let dwell = 2.5;
  let ride = null; // { cabin: 'A'|'B', dest: 'upper'|'lower' }
  // 회현→타워는 산을 바라보므로, 기본은 어깨 너머 명동(도시) 쪽. T 로 타워/도시/자동 전환.
  const CITY = { x: NT.tx - 980, z: NT.tz - 790 }; // 회현·남대문 야경 (케이블 북서쪽 도심)
  let viewMode = 'auto'; // auto | city | tower
  let hintEl = null;
  function hintText() {
    const mode = viewMode === 'auto' ? '자동' : viewMode === 'city' ? '도시 야경' : '타워';
    return `케이블카 · T 전망 전환 (${mode})`;
  }
  function showHint(on) {
    if (typeof document === 'undefined') return;
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.id = 'namsan-cable-hint';
      hintEl.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:40;padding:8px 14px;border-radius:999px;background:rgba(12,16,22,0.72);color:#f3f6f8;font:600 14px/1.3 sans-serif;letter-spacing:.02em;pointer-events:none;';
      document.body.appendChild(hintEl);
    }
    hintEl.textContent = hintText();
    hintEl.style.display = on ? 'block' : 'none';
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (!ride || e.repeat || e.code !== 'KeyT') return;
      viewMode = viewMode === 'auto' ? 'city' : viewMode === 'city' ? 'tower' : 'auto';
      ride.reframe = true;
      showHint(true);
    });
  }

  const nightMats = [cabinA.userData.glass.material, cabinB.userData.glass.material, cabinA.userData.ceil.material, cabinB.userData.ceil.material];

  function placeCabin(mesh, t, swayT) {
    const p = at(t);
    const sway = Math.sin(swayT * 1.3) * 0.035;
    mesh.position.set(p.x, p.y - 2.85, p.z);
    mesh.rotation.set(sway, Math.atan2(p.tx, p.tz), sway * 0.6);
  }

  function nearStation(x, z, which) {
    const p = which === 'upper' ? pts[0] : pts[pts.length - 1];
    const y0 = which === 'upper' ? upperY : lowerY;
    const stPts = which === 'upper' ? upperPts : lowerPts;
    if (stPts && pointInRing(x, z, stPts)) return { x: p.x, z: p.z, y: y0 + 0.25, which };
    if (Math.hypot(x - p.x, z - p.z) < 6) return { x: p.x, z: p.z, y: y0 + 0.25, which };
    return null;
  }

  function isBlocked(x, z, r = 0.35) {
    return access.isBlocked(x, z, r);
  }

  let hold = 0, holdAt = null, prevX = null, prevZ = null;
  let armed = true, queued = false, atWhich = null, lastArrived = null, boardSeq = 0, arriveSeq = 0;
  const doors = namsanStationDoors(osm);
  const rideCam = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0, on: false };
  const TREE_CLEAR = 16; // 큰 나무 꼭대기 ≈ 지면+(6.2+2.6)*1.55 ≈ 13.6 m
  const ROOF_CLEAR = 1.8;
  const STATION_WALL_H = 7.2;
  const PYLON_R = 3.4;
  const MIN_CABIN_XZ = 7.2;
  const treeHide = [];
  let treeMeshes = null;
  const _m4 = new THREE.Matrix4();
  const _mHide = new THREE.Matrix4();
  const _v3 = new THREE.Vector3();

  function distToSegments(x, z, ring) {
    let best = Infinity;
    if (!ring || ring.length < 2) return best;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
      best = Math.min(best, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
    }
    return best;
  }
  function nearStationVolume(x, z, ring, pad = 2.8) {
    if (!ring || ring.length < 3) return false;
    return pointInRing(x, z, ring) || distToSegments(x, z, ring) < pad;
  }
  function heightNear(x, z, r = 5.5) {
    let h = heightAt(x, z);
    if (!Number.isFinite(h)) h = 0;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const y = heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (Number.isFinite(y) && y > h) h = y;
    }
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const y = heightAt(x + Math.cos(a) * (r * 0.5), z + Math.sin(a) * (r * 0.5));
      if (Number.isFinite(y) && y > h) h = y;
    }
    return h;
  }
  function clearMinY(x, z) {
    let y = heightNear(x, z) + TREE_CLEAR;
    if (nearStationVolume(x, z, upperPts)) y = Math.max(y, upperY + STATION_WALL_H + ROOF_CLEAR);
    if (nearStationVolume(x, z, lowerPts)) y = Math.max(y, lowerY + STATION_WALL_H + ROOF_CLEAR);
    return y;
  }
  function pylonPush(x, z) {
    for (let i = 1; i < pts.length - 1; i++) {
      const q = pts[i];
      const dx = x - q.x, dz = z - q.z;
      const d = Math.hypot(dx, dz);
      if (d < PYLON_R) {
        const s = PYLON_R / (d || 1e-3);
        x = q.x + dx * s;
        z = q.z + dz * s;
      }
    }
    return { x, z };
  }
  function losLift(cx, cy, cz, lx, ly, lz) {
    let need = cy;
    const N = 14;
    for (let i = 1; i < N; i++) {
      const t = i / N, o = 1 - t;
      const x = cx + (lx - cx) * t;
      const y = cy + (ly - cy) * t;
      const z = cz + (lz - cz) * t;
      const h = heightNear(x, z, 3.0) + 1.4;
      if (h > y) need = Math.max(need, (h - ly * t) / o);
    }
    return need;
  }
  function restoreTrees() {
    if (!treeHide.length) return;
    const touched = new Set();
    for (const h of treeHide) {
      h.mesh.setMatrixAt(h.index, h.matrix);
      touched.add(h.mesh);
    }
    for (const mesh of touched) mesh.instanceMatrix.needsUpdate = true;
    treeHide.length = 0;
  }
  /** 카메라와 캐빈 사이 나무는 잠시 내려, 수관이 화면을 가리지 않게 한다. */
  function fadeTrees(ax, az, bx, bz) {
    restoreTrees();
    if (!parent) return;
    if (!treeMeshes) {
      treeMeshes = [];
      parent.traverse((o) => { if (o.isInstancedMesh) treeMeshes.push(o); });
    }
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz || 1;
    const rad = 5.2;
    const touched = new Set();
    for (const mesh of treeMeshes) {
      const n = mesh.count || 0;
      for (let i = 0; i < n; i++) {
        mesh.getMatrixAt(i, _m4);
        _v3.setFromMatrixPosition(_m4);
        const t = Math.max(0, Math.min(1, ((_v3.x - ax) * dx + (_v3.z - az) * dz) / L2));
        const d = Math.hypot(_v3.x - (ax + dx * t), _v3.z - (az + dz * t));
        const sc = Math.hypot(_m4.elements[0], _m4.elements[1], _m4.elements[2]) || 1;
        if (d < rad * Math.min(sc, 2) + 0.6) {
          treeHide.push({ mesh, index: i, matrix: _m4.clone() });
          _mHide.copy(_m4);
          _mHide.elements[13] -= 80;
          mesh.setMatrixAt(i, _mHide);
          touched.add(mesh);
        }
      }
    }
    for (const mesh of touched) mesh.instanceMatrix.needsUpdate = true;
  }
  /** 0 = 열린 3/4 추적, 1 = 정류장 앞(케이블 뒤·지붕 위). 약 15초 전부터 부드럽게 붙는다. */
  function stationBlend(tCabin) {
    const d = Math.min(tCabin, 1 - tCabin);
    const t0 = 0.22, t1 = 0.04;
    if (d >= t0) return 0;
    if (d <= t1) return 1;
    const u = 1 - (d - t1) / (t0 - t1);
    return u * u * (3 - 2 * u);
  }
  function dockSign(tCabin) { return tCabin <= 0.5 ? 1 : -1; }
  function dockYawOf(p, tCabin) {
    const s = dockSign(tCabin);
    return Math.atan2(p.tx * s, p.tz * s);
  }
  function lerpAng(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
  function dockPoseAt(p, tCabin) {
    const sign = dockSign(tCabin);
    const cabinY = p.y - 2.35;
    let dist = 10, x = p.x, z = p.z;
    for (; dist <= 26; dist += 0.6) {
      x = p.x + p.tx * sign * dist;
      z = p.z + p.tz * sign * dist;
      const pushed = pylonPush(x, z);
      x = pushed.x; z = pushed.z;
      if (!nearStationVolume(x, z, upperPts, 3) && !nearStationVolume(x, z, lowerPts, 3)) break;
    }
    const y = Math.max(cabinY + 4.2, clearMinY(x, z));
    return { x, y, z };
  }
  function lookWant(tCabin, dest) {
    if (viewMode !== 'auto') return viewMode;
    const goingUp = dest === 'upper';
    return (goingUp && tCabin < 0.2) ? 'tower' : 'city';
  }
  function frameYaw(p, want) {
    const lookX = want === 'tower' ? NT.tx : CITY.x;
    const lookZ = want === 'tower' ? NT.tz : CITY.z;
    const toward = Math.atan2(p.x - lookX, p.z - lookZ);
    const sx = Math.sin(toward + Math.PI / 2), sz = Math.cos(toward + Math.PI / 2);
    const sign = (sx * (CITY.x - p.x) + sz * (CITY.z - p.z)) >= 0 ? 1 : -1;
    return toward + sign * 0.55;
  }
  function framePitch(want) { return want === 'tower' ? 0.10 : 0.16; }
  function applyRideFrame(cam, p, dest, tCabin, snap = false) {
    if (!cam) return;
    const want = lookWant(tCabin, dest);
    const yaw = frameYaw(p, want);
    cam.yaw = yaw;
    cam.pitch = framePitch(want);
    cam.distMin = 6;
    cam.distMax = 36;
    if (snap || cam.dist < 5 || cam.dist > 28) cam.dist = 10.5;
  }

  function tickPlayer(dt, player, cam) {
    if (!player) return;
    const px = player.position.x, pz = player.position.z;
    const moved = prevX == null ? 0 : Math.hypot(px - prevX, pz - prevZ);
    const still = moved < Math.max(0.12, (Number.isFinite(dt) ? dt : 0.016) * 0.85);
    prevX = px; prevZ = pz;
    if (ride) {
      const tCabin = ride.cabin === 'A' ? u : 1 - u;
      const p = at(tCabin);
      const want = lookWant(tCabin, ride.dest);
      const lookX = want === 'tower' ? NT.tx : CITY.x;
      const lookZ = want === 'tower' ? NT.tz : CITY.z;
      const lookYaw = Math.atan2(p.x - lookX, p.z - lookZ);
      const lx = Math.sin(lookYaw), lz = Math.cos(lookYaw);
      // 캐빈 경로를 따라 앉힌다. 흔들림은 메시에만 두고 플레이어·카메라에는 안 태운다.
      player.position.set(p.x - lx * 0.22, p.y - 3.88, p.z - lz * 0.22);
      player.rotation.y = lookYaw + Math.PI;
      if (cam && (ride.reframe || !ride.framed)) {
        applyRideFrame(cam, p, ride.dest, tCabin, !ride.framed);
        ride.framed = true;
        ride.reframe = false;
      }
      showHint(true);
      const arrived = ride.dest === 'upper' ? tCabin < 0.012 : tCabin > 0.988;
      if (arrived && dwell > 1.6) {
        const st = ride.dest === 'upper' ? pts[0] : pts[pts.length - 1];
        const sy = ride.dest === 'upper' ? upperY : lowerY;
        const dr = guide ? doors[ride.dest] : null;
        if (dr) {
          // 출입문 안쪽 2.4 m, 바깥을 보게 — 나가는 길이 바로 보인다
          player.position.set(dr.x - dr.nx * 2.4, sy + 0.15, dr.z - dr.nz * 2.4);
          player.rotation.y = Math.atan2(dr.nx, dr.nz);
          if (cam) cam.yaw = Math.atan2(-dr.nx, -dr.nz);
        } else player.position.set(st.x + 3.2, sy + 0.3, st.z + 1.4);
        lastArrived = ride.dest;
        arriveSeq++;
        armed = false;
        queued = false;
        ride = null;
        rideCam.on = false;
        restoreTrees();
        hold = 0;
        showHint(false);
        if (cam && 'distMin' in cam) delete cam.distMin;
        if (cam && 'distMax' in cam) delete cam.distMax;
        if (cam && cam.dist < 5) cam.dist = 8;
      }
      return;
    }
    const up = nearStation(player.position.x, player.position.z, 'upper');
    const low = nearStation(player.position.x, player.position.z, 'lower');
    const atSt = up || low;
    atWhich = atSt ? atSt.which : null;
    if (atSt) {
      const inZone = access.inBoardZone(player.position.x, player.position.z, atSt.which);
      if (holdAt !== atSt.which) { hold = 0; holdAt = atSt.which; queued = false; }
      else if (still && inZone) hold += dt;
      else hold = 0;
      if (!guide) {
        if (inZone && hold > 0.85 && dwell > 1.8) board(atSt.which);
      } else if (armed && docked() && dwell > 0.35 && (queued || (inZone && hold > 1.0))) board(atSt.which);
    } else { hold = 0; holdAt = null; armed = true; queued = false; }
  }
  function docked() { return dwell > 0 && (u <= 0 || u >= 1); }
  function board(which) {
    const aAtUpper = u < 0.05;
    const cabin = which === 'upper' ? (aAtUpper ? 'A' : 'B') : (aAtUpper ? 'B' : 'A');
    ride = { cabin, dest: which === 'upper' ? 'lower' : 'upper', framed: false, reframe: false };
    rideCam.on = false;
    hold = 0;
    queued = false;
    boardSeq++;
  }

  // 캐빈 옆 3/4 추적. 경로만 따라가고 캐빈 흔들림은 쓰지 않는다.
  // 정류장에 가까우면 궤도 각을 케이블 뒤로 돌리고, 지형·기둥·지붕 안·나무 가림을 피한다.
  function applyRideCamera(camera, dt, player, cam) {
    if (!ride || !camera || !cam || cam.mode === 'overview') {
      restoreTrees();
      return false;
    }
    const tCabin = ride.cabin === 'A' ? u : 1 - u;
    const p = at(tCabin);
    if (!ride.framed) {
      applyRideFrame(cam, p, ride.dest, tCabin, true);
      ride.framed = true;
    }
    const cabinY = p.y - 2.35;
    const dist = Math.max(cam.distMin ?? 6, cam.dist);
    const yaw = cam.yaw, pitch = cam.pitch;
    const blend = stationBlend(tCabin);
    const yawUse = lerpAng(yaw, dockYawOf(p, tCabin), blend);
    const pitchUse = pitch + (0.28 - pitch) * blend;
    const distUse = Math.max(MIN_CABIN_XZ, dist + (12 - dist) * blend);
    const cp = Math.cos(pitchUse), sp = Math.sin(pitchUse);
    let wantX = p.x + Math.sin(yawUse) * distUse * cp;
    let wantZ = p.z + Math.cos(yawUse) * distUse * cp;
    const pushed = pylonPush(wantX, wantZ);
    wantX = pushed.x; wantZ = pushed.z;
    let wantY = Math.max(cabinY + distUse * sp, clearMinY(wantX, wantZ));
    if (blend > 0) {
      const dock = dockPoseAt(p, tCabin);
      const w = blend * blend;
      wantX += (dock.x - wantX) * w;
      wantY += (dock.y - wantY) * w;
      wantZ += (dock.z - wantZ) * w;
    }
    let ox = wantX - p.x, oz = wantZ - p.z, hxz = Math.hypot(ox, oz);
    if (hxz < MIN_CABIN_XZ) {
      const s = MIN_CABIN_XZ / (hxz || 1e-3);
      wantX = p.x + ox * s;
      wantZ = p.z + oz * s;
    }
    wantY = Math.max(wantY, clearMinY(wantX, wantZ));
    wantY = Math.max(wantY, losLift(wantX, wantY, wantZ, p.x, cabinY, p.z));
    const lookX = p.x, lookY = cabinY, lookZ = p.z;
    const k = rideCam.on ? (1 - Math.exp(-Math.max(0, dt) * 8.5)) : 1;
    if (!rideCam.on) rideCam.on = true;
    rideCam.x += (wantX - rideCam.x) * k;
    rideCam.y += (wantY - rideCam.y) * k;
    rideCam.z += (wantZ - rideCam.z) * k;
    rideCam.lx += (lookX - rideCam.lx) * k;
    rideCam.ly += (lookY - rideCam.ly) * k;
    rideCam.lz += (lookZ - rideCam.lz) * k;
    if (nearStationVolume(rideCam.x, rideCam.z, upperPts, 1.2) || nearStationVolume(rideCam.x, rideCam.z, lowerPts, 1.2)) {
      const dock = dockPoseAt(p, tCabin);
      const pk = Math.min(1, Math.max(0, dt) * 10);
      rideCam.x += (dock.x - rideCam.x) * pk;
      rideCam.z += (dock.z - rideCam.z) * pk;
      rideCam.y = Math.max(rideCam.y, dock.y);
    }
    rideCam.y = Math.max(rideCam.y, clearMinY(rideCam.x, rideCam.z));
    rideCam.y = Math.max(rideCam.y, losLift(rideCam.x, rideCam.y, rideCam.z, lookX, lookY, lookZ));
    fadeTrees(rideCam.x, rideCam.z, p.x, p.z);
    camera.position.set(rideCam.x, rideCam.y, rideCam.z);
    camera.lookAt(rideCam.lx, rideCam.ly, rideCam.lz);
    return true;
  }
  /** E·탭: 정차 중이면 바로 타고, 아니면 다음 칸을 예약(서 있으면 자동 탑승). */
  function actBoard() {
    if (ride || !atWhich) return false;
    armed = true;
    if (docked() && dwell > 0.35) board(atWhich);
    else queued = true;
    return true;
  }

  return {
    stations: namsanCableStations(osm),
    group: g,
    get riding() { return !!ride; },
    update(dt) {
      if (dwell > 0) dwell -= dt;
      else {
        u += dir * (dt / RIDE_DUR);
        if (u >= 1) { u = 1; dir = -1; dwell = 3.2; }
        if (u <= 0) { u = 0; dir = 1; dwell = 3.2; }
      }
      const now = performance.now() / 1000;
      placeCabin(cabinA, u, now);
      placeCabin(cabinB, 1 - u, now + 1.7);
    },
    tickPlayer,
    setNight(v) {
      lowerDress?.setNight(v);
      cabinA.userData.glass.material.emissiveIntensity = v * 0.16;
      cabinB.userData.glass.material.emissiveIntensity = v * 0.16;
      cabinA.userData.ceil.material.emissiveIntensity = 0.45 + v * 0.7;
      cabinB.userData.ceil.material.emissiveIntensity = 0.45 + v * 0.7;
      if (cabinA.userData.ceilLight) cabinA.userData.ceilLight.material.emissiveIntensity = 0.7 + v * 0.5;
      if (cabinB.userData.ceilLight) cabinB.userData.ceilLight.material.emissiveIntensity = 0.7 + v * 0.5;
    },
    isBlocked,
    floorY: access.floorY,
    applyRideCamera,
    access,
    at,
    pts,
    stage(t) { u = Math.max(0, Math.min(1, t)); dwell = 10; placeCabin(cabinA, u, 0); placeCabin(cabinB, 1 - u, 1.7); },
    setView(mode) { viewMode = mode || 'auto'; if (ride) ride.reframe = true; },
    get viewMode() { return viewMode; },
    // [cableguide] 안내·탑승 UX 용 상태
    stationInfo: [
      { which: 'upper', group: upperSt, node: pts[0], y: upperY, door: doors.upper, pts: upperPts, dest: '회현', name: '남산타워' },
      { which: 'lower', group: lowerSt, node: pts[pts.length - 1], y: lowerY, door: doors.lower, pts: lowerPts, dest: '남산타워', name: '회현' },
    ],
    get atStation() { return ride ? null : atWhich; },
    get docked() { return docked(); },
    /** 다음 칸이 이 정류장에 서기까지 남은 초 (정차 중이면 0). 두 정류장에 동시에 선다(교행). */
    get nextArrival() { return docked() ? 0 : (dir > 0 ? 1 - u : u) * RIDE_DUR; },
    get dwellLeft() { return Math.max(0, dwell); },
    get queued() { return queued; },
    get armed() { return armed; },
    get rideDest() { return ride ? ride.dest : null; },
    get lastArrived() { return lastArrived; },
    get boardSeq() { return boardSeq; },
    get arriveSeq() { return arriveSeq; },
    rideDur: RIDE_DUR,
    actBoard,
  };
}
