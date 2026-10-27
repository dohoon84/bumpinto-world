// 저녁에 오피스·상가 창 일부만 켜 둔다. 건물 위치에서 나온 고정 패턴이라 프레임마다 바뀌지 않는다.
import * as THREE from 'three';
import { watchEvening } from '../evening.js';
import { ringKey } from './starbucksGlass.js';

const FLOOR = 3.2;
const LIT_KIND = new Set(['office', 'commercial', 'retail']);

function centroid(ring) {
  let x = 0, z = 0;
  for (const p of ring) { x += p[0]; z += p[1]; }
  return [x / ring.length, z / ring.length];
}

function lit(ix, iz, floor, bay, pane) {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(floor + 3, 1274126177) ^ Math.imul(bay + 5, 2246822519) ^ Math.imul(pane + 7, 3266489917);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) % 100 < 27;
}

function pushQuad(pos, idx, cx, y, cz, tx, tz, hw, hh) {
  const v = pos.length / 3;
  const x0 = cx - tx * hw, z0 = cz - tz * hw;
  const x1 = cx + tx * hw, z1 = cz + tz * hw;
  pos.push(
    x0, y - hh, z0,
    x1, y - hh, z1,
    x1, y + hh, z1,
    x0, y + hh, z0,
  );
  idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
}

export function addWindowLights(scene, buildings, shells = []) {
  const shellBy = new Map(shells.map((s) => [s.key, s]));
  const pos = [];
  const idx = [];
  for (const b of buildings) {
    if (!LIT_KIND.has(b.k) || !(b.h > 3)) continue;
    if (b.n && b.n.includes('스타벅스')) continue;
    const shell = shellBy.get(ringKey(b.o));
    if (shell?.mode === 'full') continue;
    const [sx, sz] = centroid(b.o);
    const ix = Math.round(sx), iz = Math.round(sz);
    const office = b.k === 'office';
    const panes = office
      ? [{ u: 0.27, v: 0.56 }, { u: 0.72, v: 0.56 }]
      : [{ u: 0.30, v: 0.61 }, { u: 0.70, v: 0.61 }];
    const hw = office ? 0.42 : 0.36;
    const hh = office ? 0.58 : 0.5;
    const minFloor = (b.n === '노비오스호텔' || shell?.mode === 'podium') ? 1 : 0;
    const ring = b.o;
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
      const ex = x1 - x0, ez = z1 - z0, L = Math.hypot(ex, ez);
      if (L < 2.6) continue;
      const tx = ex / L, tz = ez / L;
      let nx = -tz, nz = tx;
      if (nx * (sx - (x0 + x1) / 2) + nz * (sz - (z0 + z1) / 2) > 0) { nx = -nx; nz = -nz; }
      const bays = Math.max(1, Math.floor((L - 0.4) / FLOOR));
      for (let bay = 0; bay < bays; bay++) {
        for (let p = 0; p < panes.length; p++) {
          const dist = (bay + panes[p].u) * FLOOR;
          if (dist < 0.45 || dist > L - 0.45) continue;
          for (let floor = minFloor; floor < 80; floor++) {
            const y = (floor + panes[p].v) * FLOOR;
            if (y + hh > b.h - 0.08) break;
            if (!lit(ix, iz, floor, bay, p)) continue;
            const cx = x0 + tx * dist + nx * 0.12;
            const cz = z0 + tz * dist + nz * 0.12;
            pushQuad(pos, idx, cx, y, cz, tx, tz, hw, hh);
          }
        }
      }
    }
  }
  if (!pos.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: '#ffe0a8',
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }));
  mesh.name = 'windowLights';
  mesh.frustumCulled = true;
  scene.add(mesh);
  watchEvening((on) => { mesh.visible = on; });
}
