// [depot] 상품 모양 — 렌더 지오메트리(원래 자세, 중심 원점, 크기 p.size)와 cannon-es 충돌 모양.
//   shape: box(기본) · sphere(수박) · cyl(낱병) · bottles(병 묶음, 수축 필름) · pillow(포대·봉지, 볼록) · rolls(화장지 롤 팩) · tray(고기 트레이)
//   UV 는 상품 아틀라스(1024²) 사분면: 왼쪽 위 = 앞, 오른쪽 위 = 옆, 왼쪽 아래 = 윗면, 오른쪽 아래 = 예비.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const E = 3 / 1024;
const QUAD = { front: [0, 0.5], side: [0.5, 0.5], top: [0, 0], spare: [0.5, 0] };
// 사분면 안 [u0,u1]×[v0,v1] 부분(0~1 비율)으로 UV 를 옮김
function toQuad(geo, q, u0 = 0, u1 = 1, v0 = 0, v1 = 1, filter = null) {
  const uv = geo.attributes.uv, [qu, qv] = QUAD[q];
  for (let i = 0; i < uv.count; i++) {
    if (filter && !filter(i)) continue;
    const u = u0 + uv.getX(i) * (u1 - u0), v = v0 + uv.getY(i) * (v1 - v0);
    uv.setXY(i, qu + E + u * (0.5 - 2 * E), qv + E + v * (0.5 - 2 * E));
  }
  return geo;
}
// 면마다 사분면을 고른 박스 (segments 가능)
function atlasBox(sx, sy, sz, seg = 1, faces = ['side', 'side', 'top', 'top', 'front', 'front']) {
  const g = new THREE.BoxGeometry(sx, sy, sz, seg, seg, seg);
  const faceOf = new Int8Array(g.attributes.position.count);
  for (const gr of g.groups) for (let k = gr.start; k < gr.start + gr.count; k++) faceOf[g.index.getX(k)] = gr.materialIndex;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const [qu, qv] = QUAD[faces[faceOf[i]]]; uv.setXY(i, qu + E + uv.getX(i) * (0.5 - 2 * E), qv + E + uv.getY(i) * (0.5 - 2 * E)); }
  g.clearGroups();
  return g;
}
// 병 하나: 몸통 + 어깨(원뿔대) + 뚜껑
function bottleGeo(r, h, labelU0, labelU1) {
  const bodyH = h * 0.72, shH = h * 0.18, capH = h * 0.1;
  const body = toQuad(new THREE.CylinderGeometry(r, r, bodyH, 14, 1, false), 'front', labelU0, labelU1, 0.05, 0.95); body.translate(0, -h / 2 + bodyH / 2, 0);
  const sh = toQuad(new THREE.CylinderGeometry(r * 0.36, r, shH, 14, 1, false), 'front', labelU0, labelU1, 0.95, 1); sh.translate(0, -h / 2 + bodyH + shH / 2, 0);
  const cap = toQuad(new THREE.CylinderGeometry(r * 0.3, r * 0.3, capH, 10, 1, false), 'top', 0.45, 0.55, 0.45, 0.55); cap.translate(0, h / 2 - capH / 2, 0);
  return mergeGeometries([body, sh, cap]);
}

export function buildProductGeometry(p, { boxGeo }) {
  const [sx, sy, sz] = p.size, S = p.shape || 'box';
  if (S === 'sphere') { const g = new THREE.SphereGeometry(sx / 2, 22, 16); toQuad(g, 'front'); g.scale(1, sy / sx, sz / sx); return g; }
  if (S === 'cyl') return bottleGeo(sx / 2, sy, 0, 1 / 3);
  if (S === 'bottles') { // nx × nz 병 + 아래 필름 받침
    const [nx, nz] = p.grid, r = Math.min(sx / nx, sz / nz) / 2 * 0.98, parts = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const b = bottleGeo(r, sy, p.labelU?.[0] ?? 0, p.labelU?.[1] ?? 1); b.translate(-sx / 2 + (i + 0.5) * sx / nx, 0, -sz / 2 + (j + 0.5) * sz / nz); parts.push(b); }
    const film = atlasBox(sx, sy * 0.22, sz, 1, ['front', 'front', 'top', 'top', 'front', 'front']); toQuad(film, 'front', 0, 1, 0.0, 0.25); film.translate(0, -sy / 2 + sy * 0.11, 0);
    parts.push(film);
    return mergeGeometries(parts);
  }
  if (S === 'rolls') { // 롤 기둥들 + 가운데 라벨 띠
    const [nx, nz] = p.grid, r = Math.min(sx / nx, sz / nz) / 2 * 0.97, parts = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const c = new THREE.CylinderGeometry(r, r, sy, 12, 1, false); toQuad(c, 'front', 0.02, 0.12, 0.05, 0.3, (k) => k < (12 + 1) * 2); // 옆면: 하얀 롤
      toQuad(c, 'top', 0.1, 0.2, 0.2, 0.8, (k) => k >= (12 + 1) * 2); c.translate(-sx / 2 + (i + 0.5) * sx / nx, 0, -sz / 2 + (j + 0.5) * sz / nz); parts.push(c);
    }
    const band = atlasBox(sx + 0.006, sy * 0.34, sz + 0.006, 1, ['side', 'side', 'top', 'top', 'front', 'front']);
    const uv = band.attributes.uv; for (let i = 0; i < uv.count; i++) { const v = uv.getY(i), qv = v >= 0.5 ? 0.5 : 0, rel = (v - qv) / 0.5; uv.setY(i, qv + (0.36 + rel * 0.3) * 0.5); }
    parts.push(band);
    return mergeGeometries(parts);
  }
  if (S === 'pillow') { // 포대·봉지: 가장자리는 얇고 가운데는 볼록
    const g = atlasBox(sx, sy, sz, 8, p.pillowFaces), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / (sx / 2), y = pos.getY(i) / (sy / 2), z = pos.getZ(i) / (sz / 2);
      const thin = p.pillowAxis === 'y' ? 1 - 0.55 * Math.max(x * x, z * z) ** 2 : 1 - 0.6 * Math.max(x * x, y * y) ** 2;
      if (p.pillowAxis === 'y') pos.setY(i, pos.getY(i) * thin); else pos.setZ(i, pos.getZ(i) * thin);
    }
    g.computeVertexNormals(); return g;
  }
  if (S === 'tray') { // 스티로폼 트레이 + 볼록한 랩
    const base = atlasBox(sx, sy * 0.7, sz, 1); base.translate(0, -sy * 0.15, 0);
    const wrap = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    { const wp = wrap.attributes.position, wu = wrap.attributes.uv; for (let i = 0; i < wu.count; i++) wu.setXY(i, (wp.getX(i) + 1) / 2, (1 - wp.getZ(i)) / 2); } // 위에서 내려다본 평면 투영
    toQuad(wrap, 'top', 0.04, 0.96, 0.06, 0.94); wrap.scale(sx * 0.47, sy * 0.3, sz * 0.47); wrap.translate(0, sy * 0.2, 0);
    return mergeGeometries([base, wrap]);
  }
  return boxGeo(sx, sy, sz);
}
export function addProductShape(body, p, CANNON) {
  const [sx, sy, sz] = p.size, S = p.shape || 'box';
  if (S === 'sphere') { body.addShape(new CANNON.Sphere(sx / 2)); return; }
  if (S === 'cyl') { body.addShape(new CANNON.Cylinder(sx / 2, sx / 2, sy, 12)); return; }
  const k = S === 'pillow' ? 0.94 : 1; // 포대는 가장자리가 얇아 조금 작게
  body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2 * k, sy / 2 * (S === 'pillow' ? 0.92 : 1), sz / 2 * k)));
}
