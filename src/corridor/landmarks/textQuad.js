// [text-orientation] 글씨가 있는 면(간판·표지판·현수막·가격표)을 거울상 없이 만드는 공용 도우미 + 검사.
//
// 거울 글씨가 되풀이된 원인: 감기 순서(winding)만 보고 면을 뒤집는 도우미(옛 myeongdongStation facedQuad)는
//   정점 순서를 바꾸면서 UV 를 같이 따라 바꿨다 → 면은 보이게 되지만 글씨 방향(u 축)은 처음 넘겨준 a→b 그대로.
//   a→b 가 "바깥에서 보는 사람의 오른쪽"이 아니면 보이는 면에 글씨가 좌우 반전된다.
// 규칙: 글씨 면은 u 가 보는 사람의 오른쪽, v 가 위쪽을 향해야 한다 (오른쪽 × 위 = 앞 법선).
//   textQuad 는 넘겨받은 네 점 순서와 상관없이 앞 법선 n 과 글씨 위쪽(a→d)으로 오른쪽을 계산해 맞춘다.
//   재질은 FrontSide 만 (DoubleSide 면 뒷면에서 거울 글씨가 보인다). 뒷면이 보이는 곳엔 따로 뒷판을 둔다.

/** 글씨 위쪽(a→d)과 앞 법선 n 으로 보는 사람의 오른쪽을 구해, a→b 가 오른쪽이 되게 정점을 다시 놓고 buf.quad 로 넣는다.
 *  a,b = 아래 두 점, c,d = 위 두 점 (b 위가 c, a 위가 d). uv = [u0, v0, u1, v1] (u0 = 글씨 왼쪽). */
export function textQuad(buf, a, b, c, d, uv, n, col = null) {
  const ux = d[0] - a[0], uy = d[1] - a[1], uz = d[2] - a[2]; // 위
  const rx = uy * n[2] - uz * n[1], ry = uz * n[0] - ux * n[2], rz = ux * n[1] - uy * n[0]; // 오른쪽 = 위 × 앞
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  if (bx * rx + by * ry + bz * rz < 0) { [a, b] = [b, a]; [c, d] = [d, c]; }
  return buf.quad(a, b, c, d, uv, col, n);
}

/** 가운데 놓인 글씨 평면(PlaneGeometry 등)을 앞뒤 모두 바르게 읽히게: 재질 FrontSide + 같은 판을 Y 로 반 바퀴 돌린 뒷면 자식.
 *  (DoubleSide 한 장은 뒤에서 거울 글씨) 반환: 원래 mesh */
export function addTextBack(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) m.side = 0; // THREE.FrontSide
  // 뒷면은 같은 재질·같은 지오메트리, 반 바퀴만 돌린다 (텍스처 u 가 뒤에서도 오른쪽)
  const back = new mesh.constructor(mesh.geometry, mesh.material);
  back.rotation.y = Math.PI; back.name = (mesh.name || 'text') + '-back'; back.renderOrder = mesh.renderOrder;
  mesh.add(back);
  return mesh;
}

/** 아틀라스 텍스처에 "글씨 칸" 사각형(UV 공간 [u0,v0,u1,v1])을 붙인다. auditTextMeshes 가 이 칸에 걸린 삼각형만 본다. */
export function markTextRects(texture, rects) {
  if (!texture) return texture;
  texture.userData = texture.userData || {};
  texture.userData.textRects = (texture.userData.textRects || []).concat(rects);
  return texture;
}

function inRects(u, v, rects) {
  for (const r of rects) if (u >= r[0] && u <= r[2] && v >= r[1] && v <= r[3]) return true;
  return false;
}

/** 지오메트리 안 글씨 삼각형 중 거울상인 것 수. 앞(감기 순서) 법선 기준으로 (dP/du × dP/dv)·n < 0 이면 거울. */
export function mirroredTextTris(geo, rects, det = 1) {
  const P = geo.attributes.position, U = geo.attributes.uv; if (!P || !U) return { checked: 0, mirrored: 0, vertical: 0, down: 0, samples: [] };
  const idx = geo.index ? geo.index.array : null; const n = idx ? idx.length : P.count;
  let checked = 0, mirrored = 0, vertical = 0, down = 0; const samples = [];
  for (let t = 0; t < n; t += 3) {
    const i0 = idx ? idx[t] : t, i1 = idx ? idx[t + 1] : t + 1, i2 = idx ? idx[t + 2] : t + 2;
    const u0 = U.getX(i0), v0 = U.getY(i0), u1 = U.getX(i1), v1 = U.getY(i1), u2 = U.getX(i2), v2 = U.getY(i2);
    if (rects !== ALL && !inRects((u0 + u1 + u2) / 3, (v0 + v1 + v2) / 3, rects)) continue;
    const du1 = u1 - u0, dv1 = v1 - v0, du2 = u2 - u0, dv2 = v2 - v0, D = du1 * dv2 - du2 * dv1;
    if (Math.abs(D) < 1e-12) continue;
    const e1 = [P.getX(i1) - P.getX(i0), P.getY(i1) - P.getY(i0), P.getZ(i1) - P.getZ(i0)];
    const e2 = [P.getX(i2) - P.getX(i0), P.getY(i2) - P.getY(i0), P.getZ(i2) - P.getZ(i0)];
    // 감기 법선(보이는 앞)
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    // dP/du, dP/dv
    const T = [0, 1, 2].map((k) => (e1[k] * dv2 - e2[k] * dv1) / D), B = [0, 1, 2].map((k) => (e2[k] * du1 - e1[k] * du2) / D);
    const cx = T[1] * B[2] - T[2] * B[1], cy = T[2] * B[0] - T[0] * B[2], cz = T[0] * B[1] - T[1] * B[0];
    checked++;
    if (Math.abs(ny) < 0.7 * Math.hypot(nx, ny, nz)) vertical++;
    else if (ny * det < 0) down++; // 누운 글씨 면이 아래를 보면 위에서 뒷면(거울)을 보게 된다
    if ((cx * nx + cy * ny + cz * nz) * det < 0) { mirrored++; if (samples.length < 3) samples.push([P.getX(i0), P.getY(i0), P.getZ(i0)].map((v) => +v.toFixed(1))); }
  }
  return { checked, mirrored, vertical, down, samples };
}

/** 장면에서 글씨 텍스처(userData.textRects)를 쓰는 메시를 모두 검사.
 *  위반: DoubleSide 재질 · 음수 행렬식(거울 스케일) · 거울 UV 삼각형. 반환 { meshes, tris, violations[] } */
const ALL = [[-1e9, -1e9, 1e9, 1e9]];
/** 캔버스에 글씨가 그려졌는지 (검사 스크립트가 fillText/strokeText 에 표시를 단다: canvas.__hasText) */
const canvasHasText = (t) => !!(t?.isCanvasTexture || t?.isTexture) && !!t.image?.__hasText;
export function auditTextMeshes(root, { autoCanvas = true } = {}) {
  const out = { meshes: 0, tris: 0, violations: [], autoMeshes: 0 };
  root.updateMatrixWorld?.(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      let rects = m?.map?.userData?.textRects || m?.emissiveMap?.userData?.textRects;
      if (!rects?.length && autoCanvas && (canvasHasText(m?.map) || canvasHasText(m?.emissiveMap))) { rects = ALL; out.autoMeshes++; }
      if (!rects?.length) continue;
      out.meshes++;
      const path = []; for (let a = o; a && path.length < 4; a = a.parent) path.push(a.name || a.type);
      const e = o.matrixWorld.elements, img = (m.map || m.emissiveMap)?.image;
      const name = path.join('<') + ` @(${e[12].toFixed(0)},${e[13].toFixed(0)},${e[14].toFixed(0)}) ${m.type} tex ${img?.width}x${img?.height}${m.name ? ' ' + m.name : ''}`;
      const det = o.matrixWorld.determinant();
      if (det < 0) out.violations.push({ mesh: name, kind: 'negative-scale', det: +det.toFixed(3) });
      if (o.isInstancedMesh && o.instanceMatrix) { // 인스턴스 행렬도 거울이면 안 된다
        const M = new o.matrixWorld.constructor(); let neg = 0;
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); if (M.determinant() < 0) neg++; }
        if (neg) out.violations.push({ mesh: name, kind: 'negative-scale-instance', count: neg });
      }
      // 텍스처 자체 방향: flipY=false 면 v 가 아래로, repeat 음수면 뒤집힘
      const t = m.map || m.emissiveMap; const tSign = (t && t.flipY === false ? -1 : 1) * Math.sign((t?.repeat?.x ?? 1) * (t?.repeat?.y ?? 1) || 1);
      const r = mirroredTextTris(o.geometry, rects, (det < 0 ? -1 : 1) * tSign);
      out.tris += r.checked;
      // DoubleSide: 세워진 글씨 면이면 뒤에서 거울 글씨가 보인다 (바닥에 누운 면은 뒷면이 안 보여 괜찮다)
      if (m.side === 2 && r.vertical > 0) out.violations.push({ mesh: name, kind: 'DoubleSide', tris: r.vertical });
      if (m.side === 2 && r.down) out.violations.push({ mesh: name, kind: 'faces-down', tris: r.down }); // DoubleSide 바닥 글씨가 아래를 보면 위에서 거울
      if (r.mirrored) out.violations.push({ mesh: name, kind: 'mirrored-uv', tris: r.mirrored, of: r.checked, at: r.samples });
    }
  });
  return out;
}
