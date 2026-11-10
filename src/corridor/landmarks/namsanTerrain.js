// [namsan] 남산 지형 — AWS Terrain Tiles(terrarium z=14) 높이장 + 숲 + 한양도성 + 팔각정·봉수대.
//   게임 y = max(0, eleASL - 48). 타워 기단은 문서값 243 m(479.7 − 236.7)로 광장을 평평히 맞춘다.
//   DEM 이 타워 구조물을 집어 정상부가 부풀어 오르는 것을 막기 위함이다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addInstancedTrees } from '../../world/trees.js';
import { NT } from './namsanCoords.js';

function sampleDem(dem, x, z) {
  if (!dem) return null;
  const { x0, z0, dx, dz, nx, nz, h } = dem;
  const u = (x - x0) / dx, v = (z - z0) / dz;
  if (u < 0 || v < 0 || u > nx - 1 || v > nz - 1) return null;
  const i0 = Math.floor(u), j0 = Math.floor(v);
  const i1 = Math.min(nx - 1, i0 + 1), j1 = Math.min(nz - 1, j0 + 1);
  const fu = u - i0, fv = v - j0;
  const a = h[j0 * nx + i0], b = h[j0 * nx + i1], c = h[j1 * nx + i0], d = h[j1 * nx + i1];
  return a * (1 - fu) * (1 - fv) + b * fu * (1 - fv) + c * (1 - fu) * fv + d * fu * fv;
}

function centroid(pts) {
  let x = 0, z = 0, n = 0;
  for (const p of pts) { x += p[0]; z += p[1]; n++; }
  return n ? { x: x / n, z: z / n } : { x: 0, z: 0 };
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

function hash01(ix, iz) {
  let n = (ix * 374761393 + iz * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function createNamsanTerrain({ parent, dem, osm }) {
  const group = new THREE.Group();
  group.name = 'namsan-terrain';
  parent.add(group);
  let demMat = null;
  let plazaMat = null;

  const datum = dem?.datum ?? NT.datum;
  const baseY = NT.eleBase - datum;
  const peak = osm?.peak || { x: -10651.28, z: -20527.94 };
  const plaza = osm?.tower?.outer || [];

  function basinEle(d) {
    if (d < 180) return NT.eleBase;
    if (d < 700) return NT.eleBase - ((d - 180) / 520) * 155;
    if (d < 1500) return 88 - ((d - 700) / 800) * 50;
    return 36;
  }

  function rawEle(x, z) {
    const e = sampleDem(dem, x, z);
    if (e != null) return e;
    const d = Math.hypot(x - NT.tx, z - NT.tz);
    return basinEle(d);
  }

  function heightAt(x, z) {
    let ele = rawEle(x, z);
    const dx = x - NT.tx, dz = z - NT.tz, d = Math.hypot(dx, dz);
    // 광장·타워 발밑: 문서 기단 243 m 로 평평히. DEM 이 구조물/수목을 집어 260 m 대로 뛰는 것을 보정.
    if (d < 95) {
      const t = 1 - d / 95;
      const w = t * t * (3 - 2 * t);
      ele = ele * (1 - w) + NT.eleBase * w;
    }
    // 상행 케이블카 역사는 광장보다 약간 아래(나무위키: 종점은 타워 바로 옆이 아니라 조금 아래).
    const ux = -10705.06, uz = -20554.09;
    const du = Math.hypot(x - ux, z - uz);
    if (du < 28) {
      const t = 1 - du / 28;
      ele = ele * (1 - t) + (NT.eleBase - 6) * t;
    }
    return ele - datum;
  }

  const bounds = dem
    ? { x0: dem.x0, z0: dem.z0, x1: dem.x0 + (dem.nx - 1) * dem.dx, z1: dem.z0 + (dem.nz - 1) * dem.dz }
    : { x0: NT.tx - 800, z0: NT.tz - 900, x1: NT.tx + 800, z1: NT.tz + 700 };

  // ---- heightfield mesh (upsample DEM) ----
  if (dem) {
    const sub = 3;
    const nx = (dem.nx - 1) * sub + 1, nz = (dem.nz - 1) * sub + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const idx = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = dem.x0 + (i / sub) * dem.dx;
        const z = dem.z0 + (j / sub) * dem.dz;
        const y = heightAt(x, z);
        const k = (j * nx + i) * 3;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
        // slope color: deep forest on mid-slopes, grass near top, darker in valleys
        const e = rawEle(x, z);
        const yp = heightAt(x + 8, z), ym = heightAt(x - 8, z), zp = heightAt(x, z + 8), zm = heightAt(x, z - 8);
        const slope = Math.hypot(yp - ym, zp - zm) / 16;
        const nrm = hash01(i, j);
        let r, g, b;
        if (e > 230 && slope < 0.25) { // summit lawn / packed earth
          r = 0.45 + nrm * 0.06; g = 0.52 + nrm * 0.05; b = 0.32 + nrm * 0.04;
        } else if (slope > 0.55) { // rocky
          r = 0.38 + nrm * 0.06; g = 0.40 + nrm * 0.05; b = 0.34 + nrm * 0.04;
        } else { // forest floor
          r = 0.18 + nrm * 0.05; g = 0.32 + nrm * 0.08; b = 0.16 + nrm * 0.04;
        }
        col[k] = r; col[k + 1] = g; col[k + 2] = b;
      }
    }
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    demMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, demMat);
    mesh.receiveShadow = true;
    mesh.name = 'namsan-dem';
    group.add(mesh);
  }

  // ---- forest (skip plaza, stations, very steep / peak pad) ----
  const trees = [];
  const x0 = bounds.x0 + 30, x1 = bounds.x1 - 30, z0 = bounds.z0 + 30, z1 = bounds.z1 - 30;
  for (let z = z0; z < z1; z += 14) {
    for (let x = x0; x < x1; x += 14) {
      const jx = x + (hash01(Math.round(x), Math.round(z)) - 0.5) * 10;
      const jz = z + (hash01(Math.round(z), Math.round(x)) - 0.5) * 10;
      const dT = Math.hypot(jx - NT.tx, jz - NT.tz);
      if (dT < 70) continue;
      if (Math.hypot(jx + 10705, jz + 20554) < 28) continue;
      if (Math.hypot(jx + 10998, jz + 21021) < 36) continue;
      const y = heightAt(jx, jz);
      if (y < 4) continue;
      const s = Math.hypot(heightAt(jx + 6, jz) - heightAt(jx - 6, jz), heightAt(jx, jz + 6) - heightAt(jx, jz - 6)) / 12;
      if (s > 0.85) continue;
      const dens = y < 30 ? 0.25 : y < 80 ? 0.72 : y < 170 ? 0.8 : 0.38;
      if (hash01(Math.round(jx * 3), Math.round(jz * 3)) > dens) continue;
      trees.push([jx, jz]);
    }
  }
  // fill in a tighter canopy on the mid-slopes around the tower (70–280 m)
  for (let z = NT.tz - 280; z < NT.tz + 280; z += 7.2) {
    for (let x = NT.tx - 280; x < NT.tx + 280; x += 7.2) {
      const jx = x + (hash01(Math.round(x * 2), Math.round(z * 2)) - 0.5) * 5.5;
      const jz = z + (hash01(Math.round(z * 2), Math.round(x * 2)) - 0.5) * 5.5;
      const dT = Math.hypot(jx - NT.tx, jz - NT.tz);
      if (dT < 72 || dT > 280) continue;
      if (Math.hypot(jx + 10705, jz + 20554) < 28) continue;
      const y = heightAt(jx, jz);
      if (y < 8) continue;
      const s = Math.hypot(heightAt(jx + 6, jz) - heightAt(jx - 6, jz), heightAt(jx, jz + 6) - heightAt(jx, jz - 6)) / 12;
      if (s > 0.85) continue;
      if (hash01(Math.round(jx * 5), Math.round(jz * 5)) > 0.62) continue;
      trees.push([jx, jz]);
    }
  }
  const forest = trees.length ? addInstancedTrees(group, trees, {
    rnd: () => hash01(Math.round(Math.random() * 1e6), 17),
    crownRadius: 2.6,
    crownY: 6.2,
    trunkHeight: 4.4,
    trunkColor: '#5c4634',
    scaleMin: 0.85,
    scaleSpan: 0.7,
    getY: (x, z) => heightAt(x, z),
  }) : null;

  // ---- 한양도성 (OSM wall ways) ----
  const wallGeos = [];
  const merlonGeos = [];
  const stone = new THREE.Color('#c4b7a2');
  const stoneD = new THREE.Color('#9a8d78');
  function coloredBox(w, h, d, color, x, y, z, ang) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ang) g.rotateY(ang);
    g.translate(x, y, z);
    const c = color;
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  for (const wall of osm?.walls || []) {
    const pts = wall.pts || [];
    // drop distant/disconnected segments that read as floating blocks from the hillside
    let nearest = Infinity;
    for (const p of pts) nearest = Math.min(nearest, Math.hypot(p[0] - NT.tx, p[1] - NT.tz));
    if (nearest > 220) continue;
    const wallH = Number(wall.tags?.height) || 5.5;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.8) continue;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const y = heightAt(mx, mz);
      const ang = Math.atan2(bx - ax, bz - az);
      wallGeos.push(coloredBox(L, wallH, 1.15, stone, mx, y + wallH * 0.5, mz, ang));
      // continuous coping instead of detached merlon cubes
      merlonGeos.push(coloredBox(L, 0.42, 1.28, stoneD, mx, y + wallH + 0.22, mz, ang));
    }
  }
  if (wallGeos.length) {
    const wg = mergeGeometries(wallGeos);
    group.add(new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }
  if (merlonGeos.length) {
    group.add(new THREE.Mesh(mergeGeometries(merlonGeos), new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  // ---- 팔각정 (OSM way/1555991263, building=shelter) ----
  const pag = osm?.palgakjeong?.pts;
  if (pag && pag.length >= 3) {
    const c = centroid(pag);
    const y = heightAt(c.x, c.z);
    const pagG = new THREE.Group();
    pagG.position.set(c.x, y, c.z);
    const wood = new THREE.MeshLambertMaterial({ color: '#7a4a2a' });
    const cream = new THREE.MeshLambertMaterial({ color: '#e8d9b8' });
    const tile = new THREE.MeshLambertMaterial({ color: '#4a3020' });
    const R = 4.6;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.4, 8), wood);
      col.position.set(Math.cos(a) * (R - 0.4), 1.7, Math.sin(a) * (R - 0.4));
      pagG.add(col);
    }
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.28, 8), cream);
    floor.position.y = 0.2;
    pagG.add(floor);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 1.1, 2.4, 8), tile);
    roof.position.y = 4.6;
    pagG.add(roof);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshLambertMaterial({ color: '#c9a227' }));
    cap.position.y = 5.9;
    pagG.add(cap);
    group.add(pagG);
  }

  // ---- 남산 봉수대 (OSM way/378371654) ----
  const bng = osm?.bongsu?.pts;
  if (bng && bng.length >= 3) {
    const c = centroid(bng);
    const y = heightAt(c.x, c.z);
    const stoneM = new THREE.MeshLambertMaterial({ color: '#b7aa96' });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 1.4, 12), stoneM);
    base.position.set(c.x, y + 0.7, c.z);
    group.add(base);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 1.6, 10), stoneM);
    top.position.set(c.x, y + 2.2, c.z);
    group.add(top);
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 10), new THREE.MeshLambertMaterial({ color: '#3a2a22' }));
    pit.position.set(c.x, y + 3.05, c.z);
    group.add(pit);
  }

  // cheap 남산 순환로 / plaza streetlights (glowing bulbs, no real point lights)
  const lampPole = new THREE.MeshLambertMaterial({ color: '#2a2e34' });
  const lampBulb = new THREE.MeshBasicMaterial({ color: '#ffd89a', transparent: true, opacity: 0, fog: false });
  const lampGlow = new THREE.MeshBasicMaterial({
    color: '#ffc878', transparent: true, opacity: 0, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
  });
  function addLamp(x, z, h = 3.5) {
    const y = heightAt(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 6), lampPole);
    pole.position.set(x, y + h / 2, z); group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lampBulb);
    bulb.position.set(x, y + h + 0.12, z); group.add(bulb);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), lampGlow);
    glow.position.set(x, y + h + 0.12, z); group.add(glow);
  }
  if (plaza.length >= 3) {
    const c = centroid(plaza);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      addLamp(c.x + Math.cos(a) * 22, c.z + Math.sin(a) * 22, 3.2);
    }
  }
  // rings that read as 순환로 lighting from a distance
  for (const [rad, n] of [[155, 28], [210, 34], [275, 36]]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rad * 0.01;
      addLamp(NT.tx + Math.cos(a) * rad, NT.tz + Math.sin(a) * rad, 4.0);
    }
  }

  // packed plaza disk so the footprint isn't raw forest color
  if (plaza.length >= 3) {
    const shape = new THREE.Shape(plaza.map((p) => new THREE.Vector2(p[0] - NT.tx, -(p[1] - NT.tz))));
    const sg = new THREE.ShapeGeometry(shape);
    sg.rotateX(-Math.PI / 2);
    const y = baseY + 0.04;
    sg.translate(NT.tx, y, NT.tz);
    plazaMat = new THREE.MeshLambertMaterial({ color: '#d5cbbb' });
    const pm = new THREE.Mesh(sg, plazaMat);
    pm.receiveShadow = true;
    group.add(pm);
  }

  return {
    group,
    bounds,
    baseY,
    heightAt,
    datum,
    peak,
    setNight(v = 0) {
      const k = Math.max(0, Math.min(1, v));
      if (demMat) demMat.color.setRGB(1 - k * 0.82, 1 - k * 0.78, 1 - k * 0.72);
      if (forest?.crowns?.material) forest.crowns.material.color.setRGB(1 - k * 0.78, 1 - k * 0.72, 1 - k * 0.8);
      if (forest?.trunks?.material) forest.trunks.material.color.setRGB(1 - k * 0.55, 1 - k * 0.55, 1 - k * 0.5);
      if (plazaMat) plazaMat.color.set(k > 0.4 ? '#3a3530' : '#d5cbbb');
      lampBulb.opacity = k;
      lampGlow.opacity = k * 0.45;
      lampBulb.visible = k > 0.05;
      lampGlow.visible = k > 0.05;
    },
    isBlocked() { return false; },
  };
}
