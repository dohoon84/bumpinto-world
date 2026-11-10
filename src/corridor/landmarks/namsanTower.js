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
  d.fillStyle = '#1c242c'; d.fillRect(0, 0, W, H);
  n.fillStyle = '#000'; n.fillRect(0, 0, W, H);
  const cols = 32, rows = 2, pw = W / cols, ph = H / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * pw + 3, y = j * ph + 10, w = pw - 6, h = ph - 20;
    const g = d.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#d5e4ee'); g.addColorStop(0.5, '#8aa3b4'); g.addColorStop(1, '#c5d5e0');
    d.fillStyle = g; d.fillRect(x, y, w, h);
    d.fillStyle = 'rgba(255,255,255,0.2)'; d.fillRect(x + 1, y + 2, w * 0.28, h - 4);
    n.fillStyle = `rgba(255,${228 + r() * 18},${190 + r() * 30},${0.82 + r() * 0.18})`;
    n.fillRect(x + 1, y + 1, w - 2, h - 2);
  }
  const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return { day: tex(c), night: tex(nc) };
}

function shaftGlowTex() {
  const W = 128, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const d = c.getContext('2d');
  // Cylinder UV: v=1 at bottom → canvas y=H must be the bright base
  const g = d.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0.00, '#f7feff');
  g.addColorStop(0.10, '#eefbff');
  g.addColorStop(0.22, '#d8f4ff');
  g.addColorStop(0.28, '#8edfff');
  g.addColorStop(0.42, '#3aa8d8');
  g.addColorStop(0.62, '#1c6aa6');
  g.addColorStop(0.82, '#154a7a');
  g.addColorStop(1.00, '#0d2e52');
  d.fillStyle = g; d.fillRect(0, 0, W, H);
  for (let i = 0; i < 24; i++) {
    const x = (i / 24) * W;
    d.fillStyle = i % 2 ? 'rgba(255,255,255,0.22)' : 'rgba(10,40,70,0.18)';
    d.fillRect(x, 0, 2.4, H);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function strut(ax, ay, az, bx, by, bz, r = 0.09) {
  const len = Math.hypot(bx - ax, by - ay, bz - az) || 0.01;
  const geo = new THREE.CylinderGeometry(r, r, len, 4);
  geo.translate(0, len / 2, 0);
  const dir = new THREE.Vector3(bx - ax, by - ay, bz - az).normalize();
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  geo.translate(ax, ay, az);
  return geo;
}

function insetRing(pts, inset) {
  const c = centroid(pts);
  return pts.map(([x, z]) => {
    const dx = x - c.x, dz = z - c.z, L = Math.hypot(dx, dz) || 1;
    const nL = Math.max(5.5, L - inset);
    return [c.x + (dx / L) * nL, c.z + (dz / L) * nL];
  });
}

function lockGeometry() {
  const body = new THREE.BoxGeometry(0.048, 0.062, 0.032);
  const shackle = new THREE.TorusGeometry(0.016, 0.0045, 5, 10, Math.PI);
  shackle.rotateZ(Math.PI);
  shackle.translate(0, 0.038, 0);
  return mergeGeometries([body, shackle]);
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

  // ---------- plaza building: tiered terraces from OSM footprint ----------
  function pickEastDoor(pts) {
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 6) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (mx < ox + 16) continue;
      const alongZ = Math.abs(dz) / L;
      if (alongZ < 0.55) continue;
      const tx = ox + 44, tz = oz + 6;
      const tt = Math.max(0, Math.min(1, ((tx - a[0]) * dx + (tz - a[1]) * dz) / (L * L)));
      const px = a[0] + dx * tt, pz = a[1] + dz * tt;
      const score = -Math.hypot(px - tx, pz - tz) + alongZ * 4 + Math.min(L, 22) * 0.12;
      if (score <= bestScore) continue;
      bestScore = score;
      const tDoor = Math.max(2.45 / L, Math.min(1 - 2.45 / L, tt));
      const cx = a[0] + dx * tDoor, cz = a[1] + dz * tDoor;
      const ux = dx / L, uz = dz / L;
      let nx = uz, nz = -ux;
      if ((cx - ox) * nx + (cz - oz) * nz < 0) { nx = -nx; nz = -nz; }
      best = { i, a, b, L, cx, cz, ux, uz, nx, nz, ang: Math.atan2(dx, dz), t: tDoor };
    }
    return best;
  }
  const eastDoor = plazaPts.length >= 4 ? pickEastDoor(plazaPts) : null;

  function wallSegs(pts, y0, h, allowDoor) {
    const geos = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 0.4) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const ang = Math.atan2(dx, dz);
      const door = allowDoor && eastDoor && i === eastDoor.i;
      if (door) {
        const gap = 4.8;
        const mid = eastDoor.t * L;
        const left = Math.max(0, mid - gap / 2);
        const right = Math.max(0, L - mid - gap / 2);
        const alongX = dx / L, alongZ = dz / L;
        if (left > 0.6) {
          const cx1 = a[0] + alongX * (left * 0.5), cz1 = a[1] + alongZ * (left * 0.5);
          const bg = new THREE.BoxGeometry(0.55, h, left); bg.rotateY(ang); bg.translate(cx1, y0 + h / 2, cz1); geos.push(bg);
        }
        if (right > 0.6) {
          const cx2 = b[0] - alongX * (right * 0.5), cz2 = b[1] - alongZ * (right * 0.5);
          const bg = new THREE.BoxGeometry(0.55, h, right); bg.rotateY(ang); bg.translate(cx2, y0 + h / 2, cz2); geos.push(bg);
        }
        const lintelH = Math.min(2.2, h * 0.24);
        const lg = new THREE.BoxGeometry(0.62, lintelH, gap);
        lg.rotateY(ang); lg.translate(eastDoor.cx, y0 + h - lintelH / 2, eastDoor.cz); geos.push(lg);
      } else {
        const bg = new THREE.BoxGeometry(0.55, h, L); bg.rotateY(ang); bg.translate(mx, y0 + h / 2, mz); geos.push(bg);
      }
    }
    return geos;
  }
  function addGlassRail(pts, y) {
    const postG = [], railG = [], glassG = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.4) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(2, Math.floor(L / 1.7));
      for (let k = 0; k <= n; k++) {
        const tt = k / n;
        const x = a[0] + (b[0] - a[0]) * tt, z = a[1] + (b[1] - a[1]) * tt;
        const pg = new THREE.BoxGeometry(0.05, 1.05, 0.05);
        pg.rotateY(ang); pg.translate(x, y + 0.55, z); postG.push(pg);
      }
      const rg = new THREE.BoxGeometry(0.05, 0.045, L);
      rg.rotateY(ang); rg.translate(mx, y + 1.04, mz); railG.push(rg);
      const gg = new THREE.BoxGeometry(0.03, 0.92, Math.max(0.2, L - 0.08));
      gg.rotateY(ang); gg.translate(mx, y + 0.52, mz); glassG.push(gg);
    }
    if (postG.length) g.add(new THREE.Mesh(mergeGeometries(postG), new THREE.MeshLambertMaterial({ color: '#8b949c' })));
    if (railG.length) g.add(new THREE.Mesh(mergeGeometries(railG), new THREE.MeshLambertMaterial({ color: '#c5ccd2' })));
    if (glassG.length) {
      g.add(new THREE.Mesh(mergeGeometries(glassG), new THREE.MeshStandardMaterial({
        color: '#cfe4f2', transparent: true, opacity: 0.28, roughness: 0.08, metalness: 0.2, depthWrite: false,
      })));
    }
  }
  const plazaMat = track(new THREE.MeshStandardMaterial({
    color: '#e8eef3', map: win.day, emissiveMap: win.night, emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0, roughness: 0.45, metalness: 0.15,
  }), 0, 0.9);
  const eaveLight = track(new THREE.MeshBasicMaterial({ color: '#5ec8ff', transparent: true, opacity: 0, fog: false }), 0, 0);
  eaveLight.userData.nightOp = 0.88;
  const eaveGeos = [];
  if (plazaPts.length >= 3) {
    const tiers = [
      { pts: plazaPts, y0: baseY, h: PH * 0.38, door: true, inset: 0 },
      { pts: insetRing(plazaPts, 2.1), y0: baseY + PH * 0.38, h: PH * 0.32, door: false },
      { pts: insetRing(plazaPts, 3.8), y0: baseY + PH * 0.70, h: PH * 0.30, door: false },
    ];
    const allWalls = [];
    for (const tier of tiers) {
      allWalls.push(...wallSegs(tier.pts, tier.y0, tier.h, tier.door));
      const topY = tier.y0 + tier.h;
      const shape = new THREE.Shape(tier.pts.map((p) => new THREE.Vector2(p[0] - ox, -(p[1] - oz))));
      const slab = new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false });
      slab.rotateX(-Math.PI / 2);
      slab.translate(ox, topY, oz);
      const slabM = new THREE.Mesh(slab, new THREE.MeshLambertMaterial({ color: '#cfd6dc' }));
      slabM.receiveShadow = true;
      g.add(slabM);
      addGlassRail(tier.pts, topY);
      for (let i = 0; i < tier.pts.length; i++) {
        const a = tier.pts[i], b = tier.pts[(i + 1) % tier.pts.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.4) continue;
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
        const eg = new THREE.BoxGeometry(0.16, 0.16, L);
        eg.rotateY(ang); eg.translate(mx, topY - 0.22, mz);
        eaveGeos.push(eg);
      }
    }
    if (allWalls.length) {
      const wm = new THREE.Mesh(mergeGeometries(allWalls, true), plazaMat);
      wm.castShadow = wm.receiveShadow = true;
      g.add(wm);
    }
    if (eaveGeos.length) g.add(new THREE.Mesh(mergeGeometries(eaveGeos), eaveLight));
    // entrance plaza paving east of the building (spawn lives here, not on the roof)
    const pave = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.12, 24), new THREE.MeshLambertMaterial({ color: '#b8bcc2' }));
    pave.position.set(ox + 42, baseY + 0.05, oz + 4);
    pave.receiveShadow = true;
    g.add(pave);
    if (eastDoor) {
      const { cx, cz, ux, uz, nx, nz, ang } = eastDoor;
      const glassMat = track(new THREE.MeshStandardMaterial({
        color: '#d8eef8', transparent: true, opacity: 0.32, roughness: 0.06, metalness: 0.2,
        emissive: new THREE.Color('#ffd4a0'), emissiveIntensity: 0, depthWrite: false,
      }), 0, 0.58);
      const frameMat = new THREE.MeshLambertMaterial({ color: '#1a222c' });
      const innerGlow = track(new THREE.MeshBasicMaterial({
        color: '#ffb060', transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide,
      }), 0, 0);
      innerGlow.userData.nightOp = 0.88;
      const glowP = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.55), innerGlow);
      glowP.position.set(cx - nx * 0.62, baseY + 1.32, cz - nz * 0.62);
      glowP.rotation.y = Math.atan2(nx, nz);
      g.add(glowP);
      for (const side of [-1, 1]) {
        const px = cx + ux * side * 1.15 + nx * 0.06;
        const pz = cz + uz * side * 1.15 + nz * 0.06;
        const pane = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.36, 2.08), glassMat);
        pane.rotation.y = ang; pane.position.set(px, baseY + 1.26, pz); g.add(pane);
      }
      const frame = (w, h, d, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
        m.rotation.y = ang; m.position.set(x, y, z); g.add(m);
      };
      // 바깥 테두리·중간 멀리언 (유리 앞에 두어 문틀이 읽히게)
      const fx = cx + nx * 0.12, fz = cz + nz * 0.12;
      frame(0.12, 2.58, 4.55, fx, baseY + 2.52, fz); // top
      frame(0.12, 0.12, 4.55, fx, baseY + 0.12, fz); // sill
      frame(0.12, 2.5, 0.14, cx + ux * -2.2 + nx * 0.12, baseY + 1.28, cz + uz * -2.2 + nz * 0.12);
      frame(0.12, 2.5, 0.14, cx + ux * 2.2 + nx * 0.12, baseY + 1.28, cz + uz * 2.2 + nz * 0.12);
      frame(0.12, 2.5, 0.14, cx + nx * 0.12, baseY + 1.28, cz + nz * 0.12);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 5.8), new THREE.MeshLambertMaterial({ color: '#1e2a38' }));
      canopy.rotation.y = ang;
      canopy.position.set(cx + nx * 1.15, baseY + 3.62, cz + nz * 1.15);
      g.add(canopy);
      const under = track(new THREE.MeshBasicMaterial({ color: '#ffd89a', transparent: true, opacity: 0, fog: false }), 0, 0);
      under.userData.nightOp = 0.78;
      const underM = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 5.4), under);
      underM.rotation.y = ang;
      underM.position.set(cx + nx * 1.15, baseY + 3.52, cz + nz * 1.15);
      g.add(underM);
      const sc = document.createElement('canvas'); sc.width = 2048; sc.height = 320;
      const sx = sc.getContext('2d');
      sx.fillStyle = '#10192a'; sx.fillRect(0, 0, 2048, 320);
      sx.strokeStyle = '#d7c48a'; sx.lineWidth = 10; sx.strokeRect(18, 16, 2012, 288);
      sx.fillStyle = '#f4f7fb'; sx.textAlign = 'center'; sx.textBaseline = 'middle';
      sx.font = '700 148px sans-serif';
      sx.strokeStyle = '#10192a'; sx.lineWidth = 12;
      sx.strokeText('남산서울타워 입구', 1024, 164);
      sx.fillText('남산서울타워 입구', 1024, 164);
      const sTex = new THREE.CanvasTexture(sc);
      sTex.colorSpace = THREE.SRGBColorSpace;
      sTex.anisotropy = 8;
      sTex.minFilter = THREE.LinearFilter;
      sTex.generateMipmaps = false;
      // 캐노피 아래 별도 패널 (슬래브와 겹치지 않게 낮추고 앞으로)
      const fasciaBack = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.92, 0.1), new THREE.MeshLambertMaterial({ color: '#10192a' }));
      fasciaBack.position.set(cx + nx * 2.08, baseY + 3.02, cz + nz * 2.08);
      fasciaBack.rotation.y = Math.atan2(nx, nz);
      g.add(fasciaBack);
      const fascia = new THREE.Mesh(
        new THREE.PlaneGeometry(5.35, 0.84),
        new THREE.MeshBasicMaterial({ map: sTex, toneMapped: false }),
      );
      fascia.position.set(cx + nx * 2.18, baseY + 3.02, cz + nz * 2.18);
      fascia.rotation.y = Math.atan2(nx, nz);
      g.add(fascia);
    }
  }

  // ---------- white shaft: night gradient (bright base + mid ring → deeper blue up) ----------
  const shaftGlow = shaftGlowTex();
  const shaftMat = track(new THREE.MeshStandardMaterial({
    color: '#f4f6f8', roughness: 0.26, metalness: 0.1,
    emissive: new THREE.Color('#ffffff'), emissiveMap: shaftGlow, emissiveIntensity: 0,
  }), 0, 1.15);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(NT.shaftR, NT.shaftR + 0.35, NT.shaftH, 40, 1, false), shaftMat);
  shaft.position.set(ox, shaftBottom + NT.shaftH / 2, oz);
  shaft.castShadow = true;
  g.add(shaft);
  const seamMat = new THREE.MeshLambertMaterial({ color: '#cfd6dc' });
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, NT.shaftH, 0.08), seamMat);
    s.position.set(ox + Math.cos(a) * (NT.shaftR + 0.06), shaftBottom + NT.shaftH / 2, oz + Math.sin(a) * (NT.shaftR + 0.06));
    g.add(s);
  }
  // soft bloom halo (additive) — brightest near the base
  const bloomMat = track(new THREE.MeshBasicMaterial({
    color: '#c8f4ff', transparent: true, opacity: 0, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }), 0, 0);
  bloomMat.userData.nightOp = 0.16;
  const bloom = new THREE.Mesh(new THREE.CylinderGeometry(NT.shaftR + 1.05, NT.shaftR + 1.9, NT.shaftH, 28, 1, true), bloomMat);
  bloom.position.set(ox, shaftBottom + NT.shaftH / 2, oz);
  g.add(bloom);

  const whitePt = track(new THREE.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0, fog: false }), 0, 0);
  whitePt.userData.nightOp = 1;
  function addLitRing(y, extraR, points = 18) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(NT.shaftR + extraR, NT.shaftR + extraR, 1.35, 24), new THREE.MeshLambertMaterial({ color: '#2a3036' }));
    body.position.set(ox, y, oz);
    g.add(body);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(NT.shaftR + extraR + 0.25, NT.shaftR + extraR + 0.25, 0.22, 24), new THREE.MeshLambertMaterial({ color: '#c5ccd2' }));
    deck.position.set(ox, y + 0.75, oz);
    g.add(deck);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(NT.shaftR + extraR + 0.15, 0.08, 8, 32), whitePt);
    halo.rotation.x = Math.PI / 2;
    halo.position.set(ox, y + 0.72, oz);
    g.add(halo);
    for (let i = 0; i < points; i++) {
      const a = (i / points) * Math.PI * 2;
      const pt = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), whitePt);
      pt.position.set(ox + Math.cos(a) * (NT.shaftR + extraR + 0.15), y + 0.78, oz + Math.sin(a) * (NT.shaftR + extraR + 0.15));
      g.add(pt);
    }
  }
  addLitRing(shaftBottom + 1.1, 2.15, 16); // base collar
  addLitRing(shaftBottom + 18, 2.45, 18);  // mid platform (visible in day ref)

  // ---------- observation drum: dark body + warm-white window rows, teal underside ----------
  const drumGroups = [
    { y0: 0,    h: 3.4, r0: 12.8, r1: 14.9, kind: 'lip' },
    { y0: 3.4,  h: 6.2, r0: 14.75, r1: 14.75, kind: 'win' },
    { y0: 9.6,  h: 2.0, r0: 15.05, r1: 15.05, kind: 'band' },
    { y0: 11.6, h: 8.2, r0: 14.85, r1: 14.85, kind: 'obs' },
    { y0: 19.8, h: 2.0, r0: 14.6, r1: 14.1, kind: 'band' },
  ];
  const glassMat = track(new THREE.MeshStandardMaterial({
    color: '#5a6b78', map: dwin.day, emissiveMap: dwin.night, emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0, roughness: 0.14, metalness: 0.22,
  }), 0, 1.85);
  const darkMat = track(new THREE.MeshStandardMaterial({
    color: '#151b22', roughness: 0.5, metalness: 0.15,
    emissive: new THREE.Color('#163a48'), emissiveIntensity: 0,
  }), 0, 0.45);
  for (const b of drumGroups) {
    const mat = (b.kind === 'win' || b.kind === 'obs') ? glassMat : darkMat;
    const open = b.kind === 'win' || b.kind === 'obs' || b.kind === 'lip';
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(b.r1, b.r0, b.h, 48, 1, open), mat);
    cyl.position.set(ox, drumBottom + b.y0 + b.h / 2, oz);
    cyl.castShadow = true;
    g.add(cyl);
  }
  // mullions only on the main observation row
  const mull = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const mg = new THREE.BoxGeometry(0.12, 8.0, 0.12);
    mg.translate(ox + Math.cos(a) * 14.95, drumBottom + 15.7, oz + Math.sin(a) * 14.95);
    mull.push(mg);
  }
  g.add(new THREE.Mesh(mergeGeometries(mull), new THREE.MeshLambertMaterial({ color: '#1a2228' })));

  // teal / cyan underside + bright cyan ring at the lip
  const cyan = track(new THREE.MeshBasicMaterial({ color: '#7af7ff', transparent: true, opacity: 0, fog: false }), 0, 0);
  cyan.userData.nightOp = 1;
  const cyanR = new THREE.Mesh(new THREE.TorusGeometry(14.75, 0.34, 8, 48), cyan);
  cyanR.rotation.x = Math.PI / 2;
  cyanR.position.set(ox, drumBottom + 0.06, oz);
  g.add(cyanR);
  const teal = track(new THREE.MeshBasicMaterial({ color: '#3ee8dc', transparent: true, opacity: 0, fog: false }), 0, 0);
  teal.userData.nightOp = 0.9;
  const tealR = new THREE.Mesh(new THREE.TorusGeometry(13.9, 0.7, 8, 48), teal);
  tealR.rotation.x = Math.PI / 2;
  tealR.position.set(ox, drumBottom + 0.45, oz);
  g.add(tealR);
  const under = track(new THREE.MeshBasicMaterial({
    color: '#5af4ea', transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide,
  }), 0, 0);
  under.userData.nightOp = 0.7;
  const underDisc = new THREE.Mesh(new THREE.CircleGeometry(14.6, 40), under);
  underDisc.rotation.x = Math.PI / 2;
  underDisc.position.set(ox, drumBottom - 0.06, oz);
  g.add(underDisc);

  // ---------- white equipment tiers (3–4 stepped decks with railings) ----------
  const tierMat = track(new THREE.MeshStandardMaterial({
    color: '#f1f4f8', roughness: 0.32, metalness: 0.12,
    emissive: new THREE.Color('#d8eeff'), emissiveIntensity: 0,
  }), 0, 0.95);
  const tiers = [
    { y0: 21.8, h: 3.5, r0: 11.6, r1: 10.0 },
    { y0: 25.3, h: 2.6, r0: 8.2, r1: 6.8 },
    { y0: 27.9, h: 2.3, r0: 5.6, r1: 4.6 },
    { y0: 30.2, h: 2.0, r0: 3.8, r1: 3.15 },
  ];
  const railGeos = [];
  for (const tr of tiers) {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(tr.r1, tr.r0, tr.h, 32), tierMat);
    cyl.position.set(ox, drumBottom + tr.y0 + tr.h / 2, oz);
    cyl.castShadow = true;
    g.add(cyl);
    const topY = drumBottom + tr.y0 + tr.h;
    const topR = tr.r1;
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(topR + 0.25, topR + 0.25, 0.16, 28), new THREE.MeshLambertMaterial({ color: '#dde3e8' }));
    deck.position.set(ox, topY + 0.06, oz);
    g.add(deck);
    const nPost = Math.max(10, Math.round(topR * 2.4));
    for (let i = 0; i < nPost; i++) {
      const a = (i / nPost) * Math.PI * 2;
      const pg = new THREE.BoxGeometry(0.05, 0.7, 0.05);
      pg.translate(ox + Math.cos(a) * (topR + 0.12), topY + 0.42, oz + Math.sin(a) * (topR + 0.12));
      railGeos.push(pg);
    }
    const rg = new THREE.TorusGeometry(topR + 0.12, 0.035, 6, 28);
    rg.rotateX(Math.PI / 2);
    rg.translate(ox, topY + 0.72, oz);
    railGeos.push(rg);
  }
  if (railGeos.length) g.add(new THREE.Mesh(mergeGeometries(railGeos), new THREE.MeshLambertMaterial({ color: '#b8c0c8' })));

  // ---------- open steel lattice antenna (red / white / orange bands) ----------
  const antH = tipY - drumTop;
  const rBase = 2.95, rTip = 0.2;
  const redLat = track(new THREE.MeshStandardMaterial({
    color: '#c62828', roughness: 0.4, metalness: 0.5,
    emissive: new THREE.Color('#ff3a28'), emissiveIntensity: 0,
  }), 0, 1.15);
  const whiteLat = track(new THREE.MeshStandardMaterial({
    color: '#eef2f5', roughness: 0.38, metalness: 0.48,
    emissive: new THREE.Color('#fff6e6'), emissiveIntensity: 0,
  }), 0, 0.95);
  const orangeLat = track(new THREE.MeshStandardMaterial({
    color: '#e65100', roughness: 0.4, metalness: 0.48,
    emissive: new THREE.Color('#ff8a2a'), emissiveIntensity: 0,
  }), 0, 1.25);
  const buckets = { red: [], white: [], orange: [] };
  const BANDS = [
    { t0: 0.00, t1: 0.10, c: 'white' },
    { t0: 0.10, t1: 0.26, c: 'red' },
    { t0: 0.26, t1: 0.40, c: 'white' },
    { t0: 0.40, t1: 0.56, c: 'orange' },
    { t0: 0.56, t1: 0.70, c: 'red' },
    { t0: 0.70, t1: 0.84, c: 'white' },
    { t0: 0.84, t1: 1.00, c: 'red' },
  ];
  const bandOf = (t) => {
    for (const b of BANDS) if (t >= b.t0 && t <= b.t1) return b.c;
    return 'red';
  };
  const radAt = (t) => rBase * (1 - t) + rTip * t + rBase * 0.08 * (1 - t) * (1 - t);
  const LEGS = 6, ANT_LV = 24;
  for (let lv = 0; lv < ANT_LV; lv++) {
    const t0 = lv / ANT_LV, t1 = (lv + 1) / ANT_LV;
    const y0 = drumTop + t0 * antH, y1 = drumTop + t1 * antH;
    const rr0 = radAt(t0), rr1 = radAt(t1);
    const key = bandOf((t0 + t1) * 0.5);
    for (let i = 0; i < LEGS; i++) {
      const a = (i / LEGS) * Math.PI * 2;
      buckets[key].push(strut(
        ox + Math.cos(a) * rr0, y0, oz + Math.sin(a) * rr0,
        ox + Math.cos(a) * rr1, y1, oz + Math.sin(a) * rr1,
        0.075,
      ));
      const a1 = ((i + 1) / LEGS) * Math.PI * 2;
      buckets[key].push(strut(
        ox + Math.cos(a) * rr1, y1, oz + Math.sin(a) * rr1,
        ox + Math.cos(a1) * rr1, y1, oz + Math.sin(a1) * rr1,
        0.055,
      ));
      buckets[key].push(strut(
        ox + Math.cos(a) * rr0, y0, oz + Math.sin(a) * rr0,
        ox + Math.cos(a1) * rr1, y1, oz + Math.sin(a1) * rr1,
        0.05,
      ));
      buckets[key].push(strut(
        ox + Math.cos(a1) * rr0, y0, oz + Math.sin(a1) * rr0,
        ox + Math.cos(a) * rr1, y1, oz + Math.sin(a) * rr1,
        0.05,
      ));
    }
  }
  if (buckets.red.length) g.add(new THREE.Mesh(mergeGeometries(buckets.red), redLat));
  if (buckets.white.length) g.add(new THREE.Mesh(mergeGeometries(buckets.white), whiteLat));
  if (buckets.orange.length) g.add(new THREE.Mesh(mergeGeometries(buckets.orange), orangeLat));

  const platTs = [0.14, 0.34, 0.55];
  for (const tt of platTs) {
    const y = drumTop + tt * antH;
    const r = radAt(tt) + 1.15;
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.16, 16), new THREE.MeshLambertMaterial({ color: '#c5ccd2' }));
    disk.position.set(ox, y, oz);
    g.add(disk);
  }

  // aviation lights (tip + platforms)
  const redMat = new THREE.MeshBasicMaterial({ color: '#ff2a1a', fog: false });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), redMat);
  tip.position.set(ox, tipY + 0.35, oz);
  tip.name = 'namsan-aviation';
  g.add(tip);
  for (const tt of [0.14, 0.34, 0.55, 0.78]) {
    const lite = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), redMat);
    lite.position.set(ox, drumTop + tt * antH + 0.25, oz);
    g.add(lite);
  }

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
    new THREE.MeshBasicMaterial({ color: '#b8fff4', fog: false, transparent: true, opacity: 0 }),
  );
  farDrum.position.set(ox, drumBottom + NT.drumH / 2, oz);
  farG.add(farDrum);
  const farAnt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 3.4, antH, 8),
    new THREE.MeshBasicMaterial({ color: '#ff6a30', fog: false, transparent: true, opacity: 0 }),
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
  const redSteel = track(new THREE.MeshStandardMaterial({
    color: '#b42822', roughness: 0.42, metalness: 0.52,
    emissive: new THREE.Color('#ff3a22'), emissiveIntensity: 0,
  }), 0, 0.45);
  const whiteSteel = track(new THREE.MeshStandardMaterial({
    color: '#eef1f4', roughness: 0.38, metalness: 0.48,
    emissive: new THREE.Color('#fff6e4'), emissiveIntensity: 0,
  }), 0, 0.4);
  const redGeos = [], whiteGeos = [];
  const baseHalf = 7.5;
  const LEVELS = 16;
  const corner = (i, t) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const half = baseHalf * (1 - t * 0.92) + 0.45;
    return [lx + Math.cos(a) * half, lz + Math.sin(a) * half];
  };
  const bar = (ax, ay, az, bx, by, bz, r = 0.13) => {
    const len = Math.hypot(bx - ax, by - ay, bz - az) || 0.01;
    const geo = new THREE.CylinderGeometry(r, r, len, 5);
    geo.translate(0, len / 2, 0);
    const dir = new THREE.Vector3(bx - ax, by - ay, bz - az).normalize();
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    geo.translate(ax, ay, az);
    return geo;
  };
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = corner(i, 0);
    const [x1, z1] = corner(i, 1);
    redGeos.push(bar(x0, baseY, z0, x1, baseY + LH, z1, 0.22));
  }
  for (let lv = 1; lv <= LEVELS; lv++) {
    const tt = lv / LEVELS;
    const y = baseY + LH * tt;
    const bucket = lv % 2 === 0 ? whiteGeos : redGeos;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corner(i, tt);
      const [bx, bz] = corner(i + 1, tt);
      bucket.push(bar(ax, y, az, bx, y, bz, 0.09));
    }
    if (lv < LEVELS) {
      const t1 = (lv + 1) / LEVELS;
      const y1 = baseY + LH * t1;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corner(i, tt);
        const [bx, bz] = corner(i + 1, tt);
        const [cx, cz] = corner(i, t1);
        const [dx, dz] = corner(i + 1, t1);
        whiteGeos.push(bar(ax, y, az, dx, y1, dz, 0.07));
        whiteGeos.push(bar(bx, y, bz, cx, y1, cz, 0.07));
      }
    }
  }
  if (redGeos.length) {
    const lattice = new THREE.Mesh(mergeGeometries(redGeos), redSteel);
    lattice.castShadow = true;
    lattice.name = 'namsan-kbs-lattice';
    g.add(lattice);
  }
  if (whiteGeos.length) g.add(new THREE.Mesh(mergeGeometries(whiteGeos), whiteSteel));
  const latTip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), redMat);
  latTip.position.set(lx, baseY + LH + 0.4, lz);
  g.add(latTip);

  // ---------- 사랑의 자물쇠: dense small instanced padlocks on glass rails ----------
  const r = rng(1915);
  const lockColors = ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#00838f', '#ef6c00', '#ad1457', '#283593', '#00695c'];
  const lockGeo = lockGeometry();
  const placements = lockColors.map(() => []);
  function placeLocksOnRing(pts, y0, rows = 3, along = 0.13, closed = true) {
    if (!pts || pts.length < 2) return;
    const segs = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.6) continue;
      const n = Math.max(1, Math.floor(L / along));
      for (let k = 0; k < n; k++) {
        const tt = (k + 0.12 + r() * 0.7) / n;
        const x = a[0] + (b[0] - a[0]) * tt + (r() - 0.5) * 0.04;
        const z = a[1] + (b[1] - a[1]) * tt + (r() - 0.5) * 0.04;
        const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]) + (r() - 0.5) * 0.6;
        for (let row = 0; row < rows; row++) {
          placements[Math.floor(r() * placements.length)].push({
            x, y: y0 + 0.18 + row * 0.11 + r() * 0.03, z, yaw,
          });
        }
      }
    }
  }
  if (plazaPts.length >= 3) {
    placeLocksOnRing(insetRing(plazaPts, 3.8), shaftBottom + 0.12, 3, 0.12);
    placeLocksOnRing(insetRing(plazaPts, 2.1), baseY + PH * 0.70 + 0.12, 2, 0.16);
    // ground-level lock fence on the east entrance plaza
    const fence = [
      [ox + 34, oz - 7], [ox + 46, oz - 6], [ox + 47, oz + 12], [ox + 35, oz + 13],
    ];
    const fencePosts = [], fenceRails = [];
    for (let i = 0; i < fence.length - 1; i++) {
      const a = fence[i], b = fence[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const rg = new THREE.BoxGeometry(0.05, 0.05, L);
      rg.rotateY(ang); rg.translate(mx, baseY + 1.05, mz); fenceRails.push(rg);
      const n = Math.max(2, Math.floor(L / 1.6));
      for (let k = 0; k <= n; k++) {
        const tt = k / n;
        const pg = new THREE.BoxGeometry(0.06, 1.1, 0.06);
        pg.translate(a[0] + (b[0] - a[0]) * tt, baseY + 0.55, a[1] + (b[1] - a[1]) * tt);
        fencePosts.push(pg);
      }
    }
    if (fencePosts.length) g.add(new THREE.Mesh(mergeGeometries(fencePosts), new THREE.MeshLambertMaterial({ color: '#8b949c' })));
    if (fenceRails.length) g.add(new THREE.Mesh(mergeGeometries(fenceRails), new THREE.MeshLambertMaterial({ color: '#c5ccd2' })));
    placeLocksOnRing(fence, baseY + 0.55, 4, 0.11, false);
  }
  const shop = osm?.loveLockShop?.pts;
  if (shop && shop.length) {
    const sc = centroid(shop);
    for (let k = 0; k < 420; k++) {
      const ang = r() * Math.PI * 2, rad = 1.2 + r() * 3.4;
      placements[Math.floor(r() * placements.length)].push({
        x: sc.x + Math.cos(ang) * rad,
        y: baseY + 0.85 + r() * 0.7,
        z: sc.z + Math.sin(ang) * rad,
        yaw: r() * Math.PI * 2,
      });
    }
  }
  const dummy = new THREE.Object3D();
  for (let ci = 0; ci < lockColors.length; ci++) {
    const list = placements[ci];
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(lockGeo, new THREE.MeshLambertMaterial({ color: lockColors[ci] }), list.length);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw, (r() - 0.5) * 0.15);
      dummy.scale.setScalar(0.85 + r() * 0.35);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    g.add(mesh);
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
    farShaft.material.opacity = v * 0.18;
    farDrum.material.opacity = 0;
    farAnt.material.opacity = v * 0.22;
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
        let door = false;
        if (eastDoor) {
          const dx = x - eastDoor.cx, dz = z - eastDoor.cz;
          const along = dx * eastDoor.ux + dz * eastDoor.uz;
          const across = dx * eastDoor.nx + dz * eastDoor.nz;
          door = Math.abs(along) < 2.45 && across > -1.3 && across < 2.6;
        }
        if (!door) return true;
      }
    }
    return false;
  }

  const door = eastDoor ? {
    x: eastDoor.cx, z: eastDoor.cz, y: baseY,
    nx: eastDoor.nx, nz: eastDoor.nz,
    spawnX: ox + 44, spawnZ: oz + 6,
  } : { x: ox + 32, z: oz + 6, y: baseY, nx: 1, nz: 0, spawnX: ox + 44, spawnZ: oz + 6 };

  return {
    group: g,
    ox, oz, baseY, shaftBottom, drumBottom, drumTop, tipY,
    plazaPts,
    door,
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
