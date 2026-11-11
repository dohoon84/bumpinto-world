// [hangang] 잠수교(하부 저수위 데크)와 반포대교(상부 데크·교각).
//   윤곽은 OSM way/1091571021 · way/1085504592. 높이는 실측 DEM 접근부 + 수면.
import * as THREE from 'three';
import { pointInRing, inWater, projectOnLine, polylineLen, centroid, JAMSU_DECK_WIDTH, jamsuDeckRing, chainsFromClosedRing } from './hangangCoords.js';
import { jamsuDeckY, banpoDeckY } from './hangangTerrain.js';

function remapShapeToY(geo, yOf) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getY(i);
    pos.setXYZ(i, x, yOf(x, z), z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function ringShape(ring) {
  const pts = (Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 1.2)
    ? ring.slice(0, -1) : ring.slice();
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  return { sh, pts };
}

function faceDown(geo) {
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  if (!nrm) return geo;
  let ay = 0;
  for (let i = 0; i < nrm.count; i++) ay += nrm.getY(i);
  if (ay > 0) {
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    nrm.needsUpdate = true;
  }
  return geo;
}

// 긴 얇은 윤곽을 ShapeGeometry/earcut 로 메우면 중앙이 비어 밤하늘이 검은 띠로 보인다.
// 양옆 체인을 쿼드 스트립으로 이어 단일 상판(반포대교는 너비 약 20–25 m 의 한 장)을 닫는다.
function stripDeckMeshes(left, right, yAt, thick, topColor, sideColor, name) {
  const n = Math.min(left?.length || 0, right?.length || 0);
  if (n < 2) return [];
  const topPos = [], botPos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const lx = left[i][0], lz = left[i][1], rx = right[i][0], rz = right[i][1];
    const yL = yAt(lx, lz), yR = yAt(rx, rz);
    topPos.push(lx, yL, lz, rx, yR, rz);
    botPos.push(lx, yL - thick, lz, rx, yR - thick, rz);
    if (i) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const topG = new THREE.BufferGeometry();
  topG.setAttribute('position', new THREE.Float32BufferAttribute(topPos, 3));
  topG.setIndex(idx);
  topG.computeVertexNormals();
  const botG = new THREE.BufferGeometry();
  botG.setAttribute('position', new THREE.Float32BufferAttribute(botPos, 3));
  botG.setIndex(idx.slice());
  faceDown(botG);
  const topMat = new THREE.MeshLambertMaterial({ color: topColor, side: THREE.DoubleSide });
  const sideMat = new THREE.MeshLambertMaterial({ color: sideColor, side: THREE.DoubleSide });
  const topM = new THREE.Mesh(topG, topMat);
  const botM = new THREE.Mesh(botG, sideMat);
  topM.name = name + '-top';
  botM.name = name + '-soffit';
  topM.receiveShadow = true;
  const pos = [], sidx = [];
  const pushSide = (a, b) => {
    const ya = yAt(a[0], a[1]), yb = yAt(b[0], b[1]);
    const k = pos.length / 3;
    pos.push(a[0], ya, a[1], b[0], yb, b[1], b[0], yb - thick, b[1], a[0], ya - thick, a[1]);
    sidx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  for (let i = 1; i < n; i++) {
    pushSide(left[i - 1], left[i]);
    pushSide(right[i - 1], right[i]);
  }
  pushSide(left[0], right[0]);
  pushSide(left[n - 1], right[n - 1]);
  const sideG = new THREE.BufferGeometry();
  sideG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sideG.setIndex(sidx);
  sideG.computeVertexNormals();
  const sideM = new THREE.Mesh(sideG, sideMat);
  sideM.name = name + '-sides';
  return [topM, botM, sideM];
}

function deckFromRing(ring, yAt, thick, topColor, sideColor, name) {
  const ch = chainsFromClosedRing(ring, 8);
  if (ch) return stripDeckMeshes(ch.left, ch.right, yAt, thick, topColor, sideColor, name);
  return deckMeshes(ring, yAt, thick, topColor, sideColor, name);
}

function deckMeshes(ring, yAt, thick, topColor, sideColor, name) {
  if (!ring || ring.length < 4) return [];
  const { sh, pts } = ringShape(ring);
  const top = new THREE.ShapeGeometry(sh, 8);
  remapShapeToY(top, yAt);
  const bot = new THREE.ShapeGeometry(sh, 8);
  remapShapeToY(bot, (x, z) => yAt(x, z) - thick);
  const topMat = new THREE.MeshLambertMaterial({ color: topColor, side: THREE.DoubleSide });
  const sideMat = new THREE.MeshLambertMaterial({ color: sideColor, side: THREE.DoubleSide });
  const topM = new THREE.Mesh(top, topMat);
  const botM = new THREE.Mesh(bot, sideMat);
  topM.name = name + '-top';
  botM.name = name + '-soffit';
  topM.receiveShadow = true;
  // side walls
  const pos = [], idx = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const ya = yAt(a[0], a[1]), yb = yAt(b[0], b[1]);
    const k = i * 4;
    pos.push(a[0], ya, a[1], b[0], yb, b[1], b[0], yb - thick, b[1], a[0], ya - thick, a[1]);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const sideG = new THREE.BufferGeometry();
  sideG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sideG.setIndex(idx);
  sideG.computeVertexNormals();
  const sideM = new THREE.Mesh(sideG, sideMat);
  sideM.name = name + '-sides';
  return [topM, botM, sideM];
}

function railMeshes(ring, yAt, color) {
  if (!ring || ring.length < 4) return [];
  const pts = (Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 1.2)
    ? ring.slice(0, -1) : ring.slice();
  const pos = [], idx = [];
  const H = 0.42, T = 0.18;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const px = -dz * T, pz = dx * T;
    const ya = yAt(a[0], a[1]), yb = yAt(b[0], b[1]);
    const k = i * 4;
    pos.push(a[0] + px, ya + H, a[1] + pz, b[0] + px, yb + H, b[1] + pz,
      b[0] - px, yb + H, b[1] - pz, a[0] - px, ya + H, a[1] - pz);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    // posts every ~6 m
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  m.name = 'hangang-rail';
  return [m];
}


function collectAxisSpots(line, step, margin = 40) {
  const spots = [];
  if (!line || line.length < 2) return spots;
  const total = polylineLen(line);
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const ax = line[i - 1][0], az = line[i - 1][1], bx = line[i][0], bz = line[i][1];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    const dx = (bx - ax) / L, dz = (bz - az) / L;
    const px = -dz, pz = dx;
    let local = (step - (acc % step)) % step;
    for (; local < L; local += step) {
      const along = acc + local;
      if (along < margin || along > total - margin) continue;
      spots.push({ x: ax + dx * local, z: az + dz * local, dx, dz, px, pz, along });
    }
    acc += L;
  }
  return spots;
}

function makeGirders(osm, lv, heightAt) {
  const line = osm?.jamsu?.centerline?.pts;
  const banpoRing = osm?.banpo?.outline?.pts;
  if (!line) return [];
  const spots = collectAxisSpots(line, 9, 30);
  const beamGeo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshPhongMaterial({ color: '#8a7a68', shininess: 12, specular: '#2a241c' });
  const dummy = new THREE.Object3D();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const along = new THREE.Vector3();
  const across = new THREE.Vector3();
  const xf = [];
  // 중앙(0) 거더는 시선 방향 밑면이 비어 검은 쐐기가 되므로 빼 둔다.
  const offsets = [-7.2, -3.6, 3.6, 7.2];
  for (const s of spots) {
    if (banpoRing && !pointInRing(s.x, s.z, banpoRing) && !inWater(s.x, s.z, osm?.water)) continue;
    const top = banpoDeckY(s.x, s.z, osm, lv, heightAt) - lv.banpoThick - 0.28;
    along.set(s.dx, 0, s.dz).normalize();
    across.set(s.px, 0, s.pz).normalize();
    for (const off of offsets) {
      dummy.position.set(s.x + s.px * off, top, s.z + s.pz * off);
      dummy.scale.set(9.2, 0.4, 0.26);
      dummy.quaternion.setFromUnitVectors(xAxis, along);
      dummy.updateMatrix();
      xf.push(dummy.matrix.clone());
    }
    dummy.position.set(s.x, top - 0.06, s.z);
    dummy.scale.set(15.2, 0.3, 0.22);
    dummy.quaternion.setFromUnitVectors(xAxis, across);
    dummy.updateMatrix();
    xf.push(dummy.matrix.clone());
  }
  if (!xf.length) return [];
  const inst = new THREE.InstancedMesh(beamGeo, mat, xf.length);
  inst.name = 'banpo-girders';
  xf.forEach((m, i) => inst.setMatrixAt(i, m));
  inst.instanceMatrix.needsUpdate = true;
  return [inst];
}

function makePostRails(ring, yAt, color, every = 2.6) {
  if (!ring || ring.length < 4) return [];
  const pts = (Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 1.2)
    ? ring.slice(0, -1) : ring.slice();
  const postGeo = new THREE.CylinderGeometry(0.032, 0.038, 1.12, 5);
  const railGeo = new THREE.BoxGeometry(1, 0.04, 0.04);
  const mat = new THREE.MeshLambertMaterial({ color });
  const dummy = new THREE.Object3D();
  const posts = [], rails = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (L < 30) continue; // 짧은 교대 변에 난간을 치면 진출입을 막는다
    const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
    const xAxis = new THREE.Vector3(1, 0, 0);
    const dir = new THREE.Vector3();
    for (let s = 0; s < L; s += every) {
      const x = a[0] + dx * s, z = a[1] + dz * s;
      const y = yAt(x, z);
      dummy.position.set(x, y + 0.56, z);
      dummy.scale.set(1, 1, 1);
      dummy.quaternion.identity();
      dummy.updateMatrix();
      posts.push(dummy.matrix.clone());
    }
    for (const h of [1.08, 0.58]) {
      const ya = yAt(a[0], a[1]) + h, yb = yAt(b[0], b[1]) + h;
      dir.set(b[0] - a[0], yb - ya, b[1] - a[1]);
      const len = dir.length() || 1;
      dir.multiplyScalar(1 / len);
      dummy.position.set((a[0] + b[0]) / 2, (ya + yb) / 2, (a[1] + b[1]) / 2);
      dummy.scale.set(len, 1, 1);
      dummy.quaternion.setFromUnitVectors(xAxis, dir);
      dummy.updateMatrix();
      rails.push(dummy.matrix.clone());
    }
  }
  const out = [];
  if (posts.length) {
    const inst = new THREE.InstancedMesh(postGeo, mat, posts.length);
    inst.name = 'hangang-rail-posts';
    posts.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    out.push(inst);
  }
  if (rails.length) {
    const inst = new THREE.InstancedMesh(railGeo, mat, rails.length);
    inst.name = 'hangang-rail-bars';
    rails.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    out.push(inst);
  }
  return out;
}

function makeJamsuMarkings(osm, lv) {
  const line = osm?.jamsu?.centerline?.pts;
  if (!line || line.length < 2) return [];
  const W = JAMSU_DECK_WIDTH;
  const walk = 1.6;
  const roadHalf = W / 2 - walk; // 7.4 m — 남은 14.8 m 를 4차로
  const yFn = (x, z) => jamsuDeckY(x, z, osm, lv) + 0.03;
  const out = [];
  const mk = (pts, width, color, name, dy = 0) => {
    if (!pts || pts.length < 2) return;
    const pos = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], p = pts[i];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      const hw = width / 2;
      const y = yFn(p[0], p[1]) + dy;
      pos.push(p[0] - dz * hw, y, p[1] + dx * hw, p[0] + dz * hw, y, p[1] - dx * hw);
      if (i > 0) {
        const k = (i - 1) * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    m.name = name;
    out.push(m);
  };
  const shift = (off) => line.map((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    return [p[0] - dz * off, p[1] + dx * off];
  });
  const dashesAlong = (src) => {
    let acc = 0, dash = null;
    const dashes = [];
    const flush = () => { if (dash && dash.length >= 2) dashes.push(dash); dash = null; };
    for (let i = 1; i < src.length; i++) {
      const ax = src[i - 1][0], az = src[i - 1][1], bx = src[i][0], bz = src[i][1];
      const seg = Math.hypot(bx - ax, bz - az) || 1;
      const dx = (bx - ax) / seg, dz = (bz - az) / seg;
      let s0 = 0;
      while (s0 < seg) {
        const inDash = ((acc + s0) % 4.2) < 2.2;
        const s1 = Math.min(seg, s0 + 1.0);
        if (inDash) {
          if (!dash) dash = [[ax + dx * s0, az + dz * s0]];
          dash.push([ax + dx * s1, az + dz * s1]);
        } else flush();
        s0 = s1;
      }
      acc += seg;
    }
    flush();
    return dashes;
  };
  // 흰 가장자리 (보도와 차도 경계) + 4차로 흰 점선 두 줄 + 노란 중앙 점선
  mk(shift(roadHalf - 0.12), 0.14, '#f4f1ea', 'jamsu-edge-l');
  mk(shift(-(roadHalf - 0.12)), 0.14, '#f4f1ea', 'jamsu-edge-r');
  for (const off of [roadHalf / 2, -roadHalf / 2]) {
    for (const d of dashesAlong(shift(off))) mk(d, 0.12, '#f4f1ea', 'jamsu-lane', 0.01);
  }
  for (const d of dashesAlong(line)) mk(d, 0.14, '#e6c04a', 'jamsu-center', 0.01);
  return out;
}

function makeJamsuWalks(ring, yAt) {
  if (!ring || ring.length < 4) return [];
  const pts = (Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 1.2)
    ? ring.slice(0, -1) : ring.slice();
  const pos = [], idx = [];
  const W = 1.6, H = 0.13, inset = 0.08;
  let v = 0;
  const n = pts.length;
  const c = centroid(pts);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    if (L < 30) continue; // 교대 짧은 변은 차도 진출입을 가로막지 않는다
    dx /= L; dz /= L;
    let px = -dz, pz = dx;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if ((c.x - mx) * px + (c.z - mz) * pz < 0) { px = -px; pz = -pz; }
    const ya = yAt(a[0], a[1]) + H, yb = yAt(b[0], b[1]) + H;
    const a0 = [a[0] + px * inset, a[1] + pz * inset];
    const b0 = [b[0] + px * inset, b[1] + pz * inset];
    const a1 = [a[0] + px * (inset + W), a[1] + pz * (inset + W)];
    const b1 = [b[0] + px * (inset + W), b[1] + pz * (inset + W)];
    pos.push(a0[0], ya, a0[1], b0[0], yb, b0[1], b1[0], yb, b1[1], a1[0], ya, a1[1]);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#e8eae4', side: THREE.DoubleSide }));
  m.name = 'jamsu-sidewalk';
  return [m];
}

function makePiers(osm, lv, heightAt) {
  const line = osm?.jamsu?.centerline?.pts;
  const banpoRing = osm?.banpo?.outline?.pts;
  if (!line || line.length < 2) return [];
  const total = polylineLen(line);
  const step = 52;
  // 잠수교 18 m 바깥, 반포대교 아래. 데크를 뚫지 않게 안쪽 면이 난간 밖에 오게 둔다.
  const hw = JAMSU_DECK_WIDTH / 2 + 1.25;
  const geo = new THREE.BoxGeometry(4.2, 1, 1.7);
  const capGeo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: '#9a948c' });
  const dummy = new THREE.Object3D();
  const spots = [];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const ax = line[i - 1][0], az = line[i - 1][1], bx = line[i][0], bz = line[i][1];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    const dx = (bx - ax) / L, dz = (bz - az) / L;
    const px = -dz, pz = dx;
    let local = 0;
    while (acc + local + step < total - 40 && local < L) {
      if (acc + local > 40) {
        const t = local / L;
        const x = ax + dx * (t * L), z = az + dz * (t * L);
        if (inWater(x, z, osm.water) || (banpoRing && pointInRing(x, z, banpoRing))) {
          spots.push({ x, z, px, pz });
        }
      }
      local += step;
    }
    acc += L;
  }
  if (!spots.length) return [];
  const inst = new THREE.InstancedMesh(geo, mat, spots.length * 2);
  inst.name = 'hangang-piers';
  inst.castShadow = true;
  const caps = new THREE.InstancedMesh(capGeo, mat, spots.length);
  caps.name = 'hangang-pier-caps';
  let n = 0, c = 0;
  for (const s of spots) {
    const top = banpoDeckY(s.x, s.z, osm, lv, heightAt) - lv.banpoThick;
    const bot = lv.waterY - 2.4;
    const h = Math.max(4, top - bot);
    const cy = bot + h / 2;
    const yaw = Math.atan2(s.px, s.pz);
    for (const side of [-1, 1]) {
      dummy.position.set(s.x + s.px * hw * side, cy, s.z + s.pz * hw * side);
      dummy.scale.set(1, h, 1);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(n++, dummy.matrix);
    }
    dummy.position.set(s.x, top - 0.45, s.z);
    dummy.scale.set(hw * 2 + 5.2, 1.15, 2.6);
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    caps.setMatrixAt(c++, dummy.matrix);
  }
  inst.count = n;
  inst.instanceMatrix.needsUpdate = true;
  caps.count = c;
  caps.instanceMatrix.needsUpdate = true;
  return [inst, caps];
}

export function createHangangBridges({ parent, osm, land }) {
  const group = new THREE.Group();
  group.name = 'hangang-bridges';
  parent.add(group);
  const lv = land.levels;
  const heightAt = land.heightAt;
  const mats = [];

  const jamsuRing = jamsuDeckRing(osm) || osm?.jamsu?.outline?.pts;
  const banpoRing = osm?.banpo?.outline?.pts;
  const jY = (x, z) => jamsuDeckY(x, z, osm, lv);
  const bY = (x, z) => banpoDeckY(x, z, osm, lv, heightAt);

  const soffitMats = [];
  function addDeck(meshes) {
    for (const m of meshes) {
      if (m.name.endsWith('-soffit')) {
        faceDown(m.geometry);
        m.material = new THREE.MeshPhongMaterial({
          color: m.name.startsWith('banpo') ? '#3a332c' : '#5a6064',
          shininess: 22,
          specular: '#2c261e',
          side: THREE.DoubleSide,
          emissive: '#000000',
        });
        soffitMats.push(m.material);
      }
      group.add(m); mats.push(m.material);
    }
  }
  addDeck(deckFromRing(jamsuRing, jY, lv.jamsuThick, '#6a6e72', '#5a5e62', 'jamsu-deck'));
  for (const m of makeJamsuMarkings(osm, lv)) { group.add(m); mats.push(m.material); }
  for (const m of makeJamsuWalks(jamsuRing, jY)) { group.add(m); mats.push(m.material); }
  for (const m of makePostRails(jamsuRing, jY, '#c5ccd1', 2.4)) { group.add(m); mats.push(m.material); }
  addDeck(deckFromRing(banpoRing, bY, lv.banpoThick, '#6d7074', '#3c342c', 'banpo-deck'));
  // 반포대교는 낮은 콘크리트 난간만. 긴 윤곽에 튜브 난간을 얹으면 하늘로 선이 뻗는다.
  for (const m of railMeshes(banpoRing, bY, '#5a5854')) {
    group.add(m); mats.push(m.material);
  }
  for (const m of makePiers(osm, lv, heightAt)) group.add(m);
  for (const m of makeGirders(osm, lv, heightAt)) group.add(m);

  // night wash under 반포대교 (unbranded; no fountain logos)
  const under = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, depthWrite: false }),
  );
  under.visible = false;
  group.add(under);
  const lamps = [];
  const line = osm?.jamsu?.centerline?.pts;
  if (line) {
    const step = 22;
    let acc = 0;
    for (let i = 1; i < line.length; i++) {
      const ax = line[i - 1][0], az = line[i - 1][1], bx = line[i][0], bz = line[i][1];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      for (let s = 0; s < L; s += step) {
        if (acc + s < 50 || acc + s > polylineLen(line) - 50) continue;
        const t = s / L;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const y = bY(x, z) - lv.banpoThick - 1.35;
        const light = new THREE.PointLight('#ffcc88', 0, 26, 2);
        light.position.set(x, y, z);
        light.name = 'banpo-under-light';
        group.add(light);
        lamps.push(light);
      }
      acc += L;
    }
  }

  function onDeck(x, z, ring, pad = 0.4) {
    return !!(ring && pointInRing(x, z, ring));
  }

  function floorY(x, z, refY = Infinity) {
    const ys = [];
    if (onDeck(x, z, jamsuRing)) ys.push(jY(x, z));
    if (onDeck(x, z, banpoRing)) ys.push(bY(x, z));
    let best = null;
    const cap = Number.isFinite(refY) ? refY + 0.55 : Infinity;
    for (const y of ys) {
      if (y == null || y > cap) continue;
      if (best == null || y > best) best = y;
    }
    return best;
  }

  function setNight(v) {
    const t = Math.max(0, Math.min(1, v));
    for (const l of lamps) l.intensity = t * 8.5;
    for (const m of soffitMats) {
      // 점광원이 아랫면에 퍼지게. 균일 emissive 는 쓰지 않는다.
      if (m.emissive) m.emissive.setRGB(0.05 * t, 0.035 * t, 0.02 * t);
      m.emissiveIntensity = 1;
    }
  }

  return { group, floorY, setNight, jamsuY: jY, banpoY: bY };
}
