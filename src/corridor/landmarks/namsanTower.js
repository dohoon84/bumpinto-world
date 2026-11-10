// [namsan] 남산서울타워 외관. 높이 236.7 m (나무위키).
//   광장 건물(OSM relation/16474080 외곽) + 흰 원통 탑신 + 중간 링 + 다층 전망 드럼 + 적백 안테나.
//   옆 격자 송신탑은 OSM way/238866254 위치, 높이는 나무위키의 KBS 철탑 113 m
//   (OSM height 태그는 60 — 참고 사진·문서와 맞지 않아 쓰지 않음).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NT } from './namsanCoords.js';

const rng = (seed) => { let s = seed || 2367; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

function centroid(pts) {
  let x = 0, z = 0, n = 0;
  for (const p of pts) { x += p[0]; z += p[1]; n++; }
  return n ? { x: x / n, z: z / n } : { x: NT.tx, z: NT.tz };
}
function pointInRing(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    const hit = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}
function closestEdge(x, z, pts) {
  let best = Infinity, nx = 1, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    const px = a[0] + dx * t, pz = a[1] + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; const L = Math.hypot(dx, dz) || 1; nx = -dz / L; nz = dx / L; }
  }
  return { d: best, nx, nz };
}

function windowTex() {
  const W = 512, H = 256, r = rng(4797);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const d = c.getContext('2d');
  const nc = document.createElement('canvas'); nc.width = W; nc.height = H;
  const n = nc.getContext('2d');
  d.fillStyle = '#d8dee4'; d.fillRect(0, 0, W, H);
  n.fillStyle = '#000'; n.fillRect(0, 0, W, H);
  const cols = 10, rows = 5, pw = W / cols, ph = H / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * pw + 3, y = j * ph + 4, w = pw - 6, h = ph - 8;
    const g = d.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#e8eef3'); g.addColorStop(1, '#9bb0c0');
    d.fillStyle = g; d.fillRect(x, y, w, h);
    if (r() < 0.7) {
      n.fillStyle = `rgba(255,${210 + r() * 30},${150 + r() * 40},${0.45 + r() * 0.45})`;
      n.fillRect(x + 1, y + 1, w - 2, h - 2);
    }
  }
  const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return { day: tex(c), night: tex(nc) };
}

function drumWindowTex() {
  const W = 1024, H = 256, r = rng(114);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const d = c.getContext('2d');
  const nc = document.createElement('canvas'); nc.width = W; nc.height = H;
  const n = nc.getContext('2d');
  d.fillStyle = '#2c3338'; d.fillRect(0, 0, W, H);
  n.fillStyle = '#000'; n.fillRect(0, 0, W, H);
  const cols = 28, pw = W / cols;
  for (let i = 0; i < cols; i++) {
    const x = i * pw + 3;
    const g = d.createLinearGradient(x, 20, x + pw, 230);
    g.addColorStop(0, '#d5e4ee'); g.addColorStop(0.5, '#8aa3b4'); g.addColorStop(1, '#c5d5e0');
    d.fillStyle = g; d.fillRect(x, 28, pw - 6, 200);
    d.fillStyle = 'rgba(255,255,255,0.18)'; d.fillRect(x + 2, 32, (pw - 6) * 0.28, 190);
    n.fillStyle = `rgba(255,${224 + r() * 20},${170 + r() * 30},${0.65 + r() * 0.3})`;
    n.fillRect(x + 1, 30, pw - 5, 196);
  }
  d.fillStyle = '#1a1e22'; d.fillRect(0, 0, W, 22); d.fillRect(0, H - 22, W, 22);
  const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return { day: tex(c), night: tex(nc) };
}

export function createNamsanTower({ parent, osm, baseY }) {
  const g = new THREE.Group();
  g.name = 'namsan-tower';
  parent.add(g);

  const plazaPts = osm?.tower?.outer || [];
  const c = plazaPts.length ? centroid(plazaPts) : { x: NT.tx, z: NT.tz };
  // keep the shaft at the OSM relation centroid (tower position)
  const ox = NT.tx, oz = NT.tz;
  const PH = NT.plazaH;
  const shaftBottom = baseY + PH;
  const drumBottom = shaftBottom + NT.shaftH; // baseY + 114
  const drumTop = drumBottom + NT.drumH; // baseY + 147
  const tipY = baseY + NT.height;

  const win = windowTex();
  const dwin = drumWindowTex();
  const nightMats = [];
  const track = (mat, dayE = 0, nightE = 1) => { nightMats.push({ mat, dayE, nightE }); return mat; };

  // ---------- plaza building from OSM footprint ----------
  const wallGeos = [];
  const wallH = PH;
  if (plazaPts.length >= 3) {
    for (let i = 0; i < plazaPts.length; i++) {
      const a = plazaPts[i], b = plazaPts[(i + 1) % plazaPts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 0.4) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const ang = Math.atan2(dx, dz);
      // door gap on the eastern face (toward 남산순환로 / bus stops)
      const midX = mx - ox, facingEast = Math.cos(ang) > 0.35 && mx > ox + 8;
      const door = facingEast && Math.abs(mz - oz) < 8 && L > 6;
      if (door) {
        const left = L * 0.5 - 2.4, right = L * 0.5 - 2.4;
        // two wall segments beside a 4.8 m door
        const alongX = dx / L, alongZ = dz / L;
        const cx1 = a[0] + alongX * (left * 0.5), cz1 = a[1] + alongZ * (left * 0.5);
        const cx2 = b[0] - alongX * (right * 0.5), cz2 = b[1] - alongZ * (right * 0.5);
        if (left > 1) { const bg = new THREE.BoxGeometry(0.55, wallH, left); bg.rotateY(ang); bg.translate(cx1, baseY + wallH / 2, cz1); wallGeos.push(bg); }
        if (right > 1) { const bg = new THREE.BoxGeometry(0.55, wallH, right); bg.rotateY(ang); bg.translate(cx2, baseY + wallH / 2, cz2); wallGeos.push(bg); }
        // lintel
        const lg = new THREE.BoxGeometry(0.6, 3.2, 4.8); lg.rotateY(ang); lg.translate(mx, baseY + wallH - 1.6, mz); wallGeos.push(lg);
      } else {
        const bg = new THREE.BoxGeometry(0.55, wallH, L); bg.rotateY(ang); bg.translate(mx, baseY + wallH / 2, mz); wallGeos.push(bg);
      }
    }
    const plazaMat = track(new THREE.MeshStandardMaterial({
      color: '#e8eef3', map: win.day, emissiveMap: win.night, emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0, roughness: 0.45, metalness: 0.15,
    }), 0, 0.85);
    if (wallGeos.length) {
      const wm = new THREE.Mesh(mergeGeometries(wallGeos, true), plazaMat);
      wm.castShadow = wm.receiveShadow = true;
      g.add(wm);
    }
    // roof slab
    const shape = new THREE.Shape(plazaPts.map((p) => new THREE.Vector2(p[0] - ox, -(p[1] - oz))));
    const roof = new THREE.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: false });
    roof.rotateX(-Math.PI / 2);
    roof.translate(ox, shaftBottom, oz);
    const roofM = new THREE.MeshLambertMaterial({ color: '#cfd6dc' });
    const roofMesh = new THREE.Mesh(roof, roofM);
    roofMesh.receiveShadow = true;
    g.add(roofMesh);
    // terrace parapet
    const parapet = [];
    for (let i = 0; i < plazaPts.length; i++) {
      const a = plazaPts[i], b = plazaPts[(i + 1) % plazaPts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.4) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const pg = new THREE.BoxGeometry(0.28, 1.15, L);
      pg.rotateY(ang); pg.translate(mx, shaftBottom + 0.9, mz);
      parapet.push(pg);
    }
    if (parapet.length) g.add(new THREE.Mesh(mergeGeometries(parapet), new THREE.MeshLambertMaterial({ color: '#d8dde2' })));
  }

  // night blue wash strips around plaza eaves (ref-night-blue)
  const eaveLight = track(new THREE.MeshBasicMaterial({ color: '#5ec8ff', transparent: true, opacity: 0, fog: false }), 0, 0);
  eaveLight.userData.nightOp = 0.85;
  const eaveGeos = [];
  if (plazaPts.length >= 3) {
    for (let i = 0; i < plazaPts.length; i++) {
      const a = plazaPts[i], b = plazaPts[(i + 1) % plazaPts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.4) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const eg = new THREE.BoxGeometry(0.2, 0.18, L);
      eg.rotateY(ang); eg.translate(mx, shaftBottom - 0.3, mz);
      eaveGeos.push(eg);
    }
    if (eaveGeos.length) g.add(new THREE.Mesh(mergeGeometries(eaveGeos), eaveLight));
  }

  // ---------- white shaft ----------
  const shaftMat = track(new THREE.MeshStandardMaterial({
    color: '#f4f6f8', roughness: 0.28, metalness: 0.12,
    emissive: new THREE.Color('#7ad7ff'), emissiveIntensity: 0,
  }), 0, 0.55);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(NT.shaftR, NT.shaftR + 0.35, NT.shaftH, 32, 1, false), shaftMat);
  shaft.position.set(ox, shaftBottom + NT.shaftH / 2, oz);
  shaft.castShadow = true;
  g.add(shaft);
  // faint vertical seams
  const seamMat = new THREE.MeshLambertMaterial({ color: '#dde3e8' });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, NT.shaftH, 0.08), seamMat);
    s.position.set(ox + Math.cos(a) * (NT.shaftR + 0.04), shaftBottom + NT.shaftH / 2, oz + Math.sin(a) * (NT.shaftR + 0.04));
    g.add(s);
  }
  // mid ring / collar (visible in day ref just above the trees / low on the shaft)
  const ringY = shaftBottom + 18;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(NT.shaftR + 2.4, NT.shaftR + 2.4, 1.6, 24), new THREE.MeshLambertMaterial({ color: '#2a3036' }));
  ring.position.set(ox, ringY, oz);
  g.add(ring);
  const ringDeck = new THREE.Mesh(new THREE.CylinderGeometry(NT.shaftR + 2.6, NT.shaftR + 2.6, 0.25, 24), new THREE.MeshLambertMaterial({ color: '#c5ccd2' }));
  ringDeck.position.set(ox, ringY + 0.9, oz);
  g.add(ringDeck);

  // upward wash lights at shaft base (night cyan)
  const wash = track(new THREE.MeshBasicMaterial({ color: '#8ce7ff', transparent: true, opacity: 0, depthWrite: false, fog: false }), 0, 0);
  wash.userData.nightOp = 0.35;
  const washM = new THREE.Mesh(new THREE.CylinderGeometry(NT.shaftR + 0.8, NT.shaftR + 3.5, 14, 20, 1, true), wash);
  washM.position.set(ox, shaftBottom + 7, oz);
  g.add(washM);

  // ---------- observation drum ----------
  const drumGroups = [
    { y0: 0, h: 4.2, r0: 13.2, r1: 15.0, kind: 'lip', color: '#1c2228' },
    { y0: 4.2, h: 6.2, r0: 14.8, r1: 14.8, kind: 'win', color: '#d5e0e8' },
    { y0: 10.4, h: 2.6, r0: 15.1, r1: 15.2, kind: 'band', color: '#1a1f24' },
    { y0: 13.0, h: 8.4, r0: 14.9, r1: 14.9, kind: 'obs', color: '#d5e0e8' },
    { y0: 21.4, h: 2.4, r0: 14.4, r1: 13.6, kind: 'band', color: '#22282e' },
    { y0: 23.8, h: 5.4, r0: 13.4, r1: 12.2, kind: 'rest', color: '#d5e0e8' },
    { y0: 29.2, h: 2.2, r0: 11.4, r1: 8.6, kind: 'cap', color: '#eceff2' },
    { y0: 31.4, h: 1.6, r0: 7.4, r1: 5.2, kind: 'cap', color: '#dfe4e8' },
  ];
  const glassMat = track(new THREE.MeshStandardMaterial({
    color: '#c5d8e6', map: dwin.day, emissiveMap: dwin.night, emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.92,
  }), 0, 1.15);
  const darkMat = new THREE.MeshLambertMaterial({ color: '#1a1f24' });
  const capMat = new THREE.MeshLambertMaterial({ color: '#e6eaee' });
  for (const b of drumGroups) {
    const mat = (b.kind === 'win' || b.kind === 'obs' || b.kind === 'rest') ? glassMat : (b.kind === 'cap' ? capMat : darkMat);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(b.r1, b.r0, b.h, 48, 1, false), mat);
    cyl.position.set(ox, drumBottom + b.y0 + b.h / 2, oz);
    cyl.castShadow = true;
    g.add(cyl);
  }
  // teal underside ring (night-stars ref)
  const teal = track(new THREE.MeshBasicMaterial({ color: '#2ee0d0', transparent: true, opacity: 0, fog: false }), 0, 0);
  teal.userData.nightOp = 0.9;
  const tealR = new THREE.Mesh(new THREE.TorusGeometry(14.2, 0.28, 8, 48), teal);
  tealR.rotation.x = Math.PI / 2;
  tealR.position.set(ox, drumBottom + 0.4, oz);
  g.add(tealR);
  // window mullions
  const mull = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const mg = new THREE.BoxGeometry(0.16, 8.2, 0.16);
    mg.translate(ox + Math.cos(a) * 15.0, drumBottom + 17.2, oz + Math.sin(a) * 15.0);
    mull.push(mg);
  }
  g.add(new THREE.Mesh(mergeGeometries(mull), new THREE.MeshLambertMaterial({ color: '#2b333a' })));

  // ---------- antenna (red / white bands, lattice feel) ----------
  const antH = tipY - drumTop;
  const bands = [
    { t0: 0.00, t1: 0.10, color: '#e8eaed', night: '#e8eaed' },
    { t0: 0.10, t1: 0.22, color: '#c62828', night: '#ff3b2e' },
    { t0: 0.22, t1: 0.38, color: '#f2f4f6', night: '#fff6e0' },
    { t0: 0.38, t1: 0.52, color: '#c62828', night: '#ff6a2a' },
    { t0: 0.52, t1: 0.68, color: '#f2f4f6', night: '#ffe7b0' },
    { t0: 0.68, t1: 0.82, color: '#c62828', night: '#ff4028' },
    { t0: 0.82, t1: 1.00, color: '#f2f4f6', night: '#fff4d6' },
  ];
  const antNight = [];
  for (const b of bands) {
    const y0 = drumTop + b.t0 * antH, y1 = drumTop + b.t1 * antH;
    const r0 = 4.6 * (1 - b.t0 * 0.88), r1 = 4.6 * (1 - b.t1 * 0.88);
    const mat = track(new THREE.MeshStandardMaterial({
      color: b.color, roughness: 0.4, metalness: 0.45,
      emissive: new THREE.Color(b.night), emissiveIntensity: 0,
    }), 0, 0.7);
    antNight.push(mat);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.18, r1), Math.max(0.22, r0), y1 - y0, 12), mat);
    cyl.position.set(ox, (y0 + y1) / 2, oz);
    cyl.castShadow = true;
    g.add(cyl);
  }
  // lattice legs around lower antenna
  const latMat = new THREE.MeshLambertMaterial({ color: '#d0d4d8' });
  const latGeos = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const y0 = drumTop, y1 = drumTop + antH * 0.42;
    const r0 = 4.2, r1 = 2.0;
    const geo = new THREE.CylinderGeometry(0.12, 0.12, Math.hypot(r0 - r1, y1 - y0), 5);
    geo.translate(0, Math.hypot(r0 - r1, y1 - y0) / 2, 0);
    const dir = new THREE.Vector3(Math.cos(a) * (r1 - r0), y1 - y0, Math.sin(a) * (r1 - r0)).normalize();
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    geo.translate(ox + Math.cos(a) * r0, y0, oz + Math.sin(a) * r0);
    latGeos.push(geo);
  }
  if (latGeos.length) g.add(new THREE.Mesh(mergeGeometries(latGeos), latMat));
  // dish platforms
  for (const t of [0.18, 0.34, 0.55]) {
    const y = drumTop + t * antH;
    const r = 4.4 * (1 - t * 0.8) + 1.6;
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.18, 16), new THREE.MeshLambertMaterial({ color: '#cfd4d8' }));
    disk.position.set(ox, y, oz);
    g.add(disk);
  }

  // aviation lights
  const redMat = new THREE.MeshBasicMaterial({ color: '#ff2a1a', fog: false });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), redMat);
  tip.position.set(ox, tipY + 0.4, oz);
  tip.name = 'namsan-aviation';
  g.add(tip);
  const midLight = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), redMat);
  midLight.position.set(ox, drumTop + antH * 0.5, oz);
  g.add(midLight);

  // ---------- far beacon (fog:false) so the tower reads on the skyline ----------
  const farG = new THREE.Group();
  farG.name = 'namsan-far';
  const farShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(NT.shaftR + 0.4, NT.shaftR + 0.6, NT.shaftH + PH, 12),
    new THREE.MeshBasicMaterial({ color: '#9fdfff', fog: false, transparent: true, opacity: 0 }),
  );
  farShaft.position.set(ox, baseY + (NT.shaftH + PH) / 2, oz);
  farG.add(farShaft);
  const farDrum = new THREE.Mesh(
    new THREE.CylinderGeometry(15.2, 15.2, NT.drumH, 16),
    new THREE.MeshBasicMaterial({ color: '#ffe7b8', fog: false, transparent: true, opacity: 0 }),
  );
  farDrum.position.set(ox, drumBottom + NT.drumH / 2, oz);
  farG.add(farDrum);
  const farAnt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 3.4, antH, 8),
    new THREE.MeshBasicMaterial({ color: '#ff5a3a', fog: false, transparent: true, opacity: 0 }),
  );
  farAnt.position.set(ox, drumTop + antH / 2, oz);
  farG.add(farAnt);
  g.add(farG);

  // ---------- lattice broadcast tower (OSM way/238866254) ----------
  const latPts = osm?.lattice?.pts;
  let lx = ox - 72, lz = oz + 20;
  if (latPts && latPts.length) {
    const lc = centroid(latPts);
    lx = lc.x; lz = lc.z;
  }
  const LH = 113;
  const steel = new THREE.MeshStandardMaterial({ color: '#c44a28', roughness: 0.45, metalness: 0.55, emissive: new THREE.Color('#ff5a2a'), emissiveIntensity: 0 });
  track(steel, 0, 0.35);
  const legs = [];
  const baseHalf = 7.5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x0 = lx + Math.cos(a) * baseHalf, z0 = lz + Math.sin(a) * baseHalf;
    const x1 = lx + Math.cos(a) * 0.6, z1 = lz + Math.sin(a) * 0.6;
    const len = Math.hypot(x1 - x0, LH, z1 - z0);
    const geo = new THREE.CylinderGeometry(0.28, 0.42, len, 6);
    geo.translate(0, len / 2, 0);
    const dir = new THREE.Vector3(x1 - x0, LH, z1 - z0).normalize();
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    geo.translate(x0, baseY, z0);
    legs.push(geo);
  }
  // horizontal frames
  for (let lv = 1; lv <= 10; lv++) {
    const t = lv / 10;
    const y = baseY + LH * t;
    const half = baseHalf * (1 - t * 0.9) + 0.5;
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * Math.PI * 2 + Math.PI / 4, a1 = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4;
      const ax = lx + Math.cos(a0) * half, az = lz + Math.sin(a0) * half;
      const bx = lx + Math.cos(a1) * half, bz = lz + Math.sin(a1) * half;
      const L = Math.hypot(bx - ax, bz - az);
      const geo = new THREE.BoxGeometry(0.2, 0.2, L);
      const ang = Math.atan2(bx - ax, bz - az);
      geo.rotateY(ang);
      geo.translate((ax + bx) / 2, y, (az + bz) / 2);
      legs.push(geo);
    }
  }
  const lattice = new THREE.Mesh(mergeGeometries(legs), steel);
  lattice.castShadow = true;
  lattice.name = 'namsan-kbs-lattice';
  g.add(lattice);
  const latTip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), redMat);
  latTip.position.set(lx, baseY + LH + 0.4, lz);
  g.add(latTip);

  // ---------- love-lock railings on plaza terrace ----------
  const lockGeos = { body: [], shackle: [] };
  const r = rng(1915);
  const lockColors = ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#00838f', '#ef6c00', '#ad1457'];
  const lockGroups = lockColors.map((col) => ({ color: col, geos: [] }));
  if (plazaPts.length >= 3) {
    for (let i = 0; i < plazaPts.length; i++) {
      const a = plazaPts[i], b = plazaPts[(i + 1) % plazaPts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue;
      const nLocks = Math.floor(L * 4.5);
      for (let k = 0; k < nLocks; k++) {
        const t = (k + 0.15 + r() * 0.7) / nLocks;
        const x = a[0] + (b[0] - a[0]) * t + (r() - 0.5) * 0.15;
        const z = a[1] + (b[1] - a[1]) * t + (r() - 0.5) * 0.15;
        const y = shaftBottom + 0.75 + r() * 0.35;
        const gi = Math.floor(r() * lockGroups.length);
        const bg = new THREE.BoxGeometry(0.18, 0.22, 0.12);
        bg.translate(x, y, z);
        lockGroups[gi].geos.push(bg);
      }
    }
  }
  // extra cluster near 사랑의 자물쇠 판매점 (OSM way/1554015589) if present
  const shop = osm?.loveLockShop?.pts;
  if (shop && shop.length) {
    const sc = centroid(shop);
    for (let k = 0; k < 180; k++) {
      const ang = r() * Math.PI * 2, rad = 1.5 + r() * 4;
      const x = sc.x + Math.cos(ang) * rad, z = sc.z + Math.sin(ang) * rad;
      const bg = new THREE.BoxGeometry(0.18, 0.22, 0.12);
      bg.translate(x, baseY + 1.1 + r() * 0.8, z);
      lockGroups[Math.floor(r() * lockGroups.length)].geos.push(bg);
    }
  }
  for (const lg of lockGroups) {
    if (!lg.geos.length) continue;
    const m = new THREE.Mesh(mergeGeometries(lg.geos), new THREE.MeshLambertMaterial({ color: lg.color }));
    g.add(m);
  }

  // pylon sign "남산서울타워" on the east approach
  const signC = document.createElement('canvas');
  signC.width = 768; signC.height = 256;
  const sctx = signC.getContext('2d');
  sctx.fillStyle = '#1a2330'; sctx.fillRect(0, 0, 768, 256);
  sctx.fillStyle = '#f2f5f8';
  sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
  sctx.font = 'bold 72px sans-serif';
  sctx.fillText('남산서울타워', 384, 100);
  sctx.font = '600 36px sans-serif';
  sctx.fillStyle = '#b8c4d0';
  sctx.fillText('NAMSAN SEOUL TOWER', 384, 180);
  const signTex = new THREE.CanvasTexture(signC);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.6), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
  sign.position.set(ox + 42, baseY + 8.5, oz + 6);
  sign.rotation.y = -Math.PI / 2 + 0.15;
  g.add(sign);
  const signBack = new THREE.Mesh(new THREE.BoxGeometry(14.2, 4.8, 0.25), new THREE.MeshLambertMaterial({ color: '#1a2330' }));
  signBack.position.copy(sign.position);
  signBack.position.x -= 0.15;
  signBack.rotation.y = sign.rotation.y;
  g.add(signBack);

  let night = 0, t = 0;
  function setNight(v) {
    night = v;
    for (const { mat, dayE, nightE } of nightMats) {
      if (mat.userData.nightOp != null) {
        mat.opacity = v * mat.userData.nightOp;
        mat.visible = v > 0.02;
      } else {
        mat.emissiveIntensity = dayE + (nightE - dayE) * v;
      }
    }
    farShaft.material.opacity = v * 0.55;
    farDrum.material.opacity = v * 0.7;
    farAnt.material.opacity = v * 0.6;
    farG.visible = v > 0.02;
  }

  // collision: solid shaft + plaza walls (door on east is open)
  function isBlocked(x, z, rad = 0.4) {
    if (Math.hypot(x - ox, z - oz) < NT.shaftR + 0.35 + rad) return true;
    if (Math.hypot(x - lx, z - lz) < 2.2 + rad) return true;
    if (plazaPts.length >= 4 && pointInRing(x, z, plazaPts)) {
      const e = closestEdge(x, z, plazaPts);
      // interior of plaza building (not the open terrace — walls only)
      // treat a 0.8 m skin inside the footprint as wall, except east door
      if (e.d < 0.55 + rad) {
        const door = x > ox + 8 && Math.abs(z - oz) < 3.2;
        if (!door) return true;
      }
    }
    return false;
  }

  return {
    group: g,
    ox, oz, baseY, shaftBottom, drumBottom, drumTop, tipY,
    plazaPts,
    lattice: { x: lx, z: lz, h: LH },
    setNight,
    update(dt) {
      t += dt;
      const on = Math.floor(t * 1.05) % 2 === 0;
      redMat.color.set(on || night < 0.45 ? '#ff2a1a' : '#3a0a08');
    },
    isBlocked,
    floorY(x, z, refY) {
      // plaza roof terrace
      if (plazaPts.length >= 4 && pointInRing(x, z, plazaPts)) {
        const roof = shaftBottom + 0.05;
        if (!Number.isFinite(refY) || Math.abs(refY - roof) < 3.2) return roof;
      }
      return null;
    },
  };
}
