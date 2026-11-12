// [depot-ext] 범창고 길 안내 — 바닥 화살표(편의점·케이블카 안내와 같은 쉐브론, 초록+크림 테두리), 이정표, 3D 이름표, 미니맵 표시/안내선.
//   화살표: 미리 정한 길(정자역·대왕판교로 북/남·북쪽 이면도로)을 3.6 m 간격으로 미리 계산해 두고, 플레이어 주변 SHOW_R 안의 것만 인스턴스로 보인다(0.35 초마다). draw 2.
//   ⚠ 데이터에 경부고속도로를 건너는 보행로가 없어, 정자역 길은 고속도로 동쪽 가장자리(이정표)에서 끝난다.
import * as THREE from 'three';
import { DEPOT_SITE as S } from './flag.js';
import { LOT as L } from './extLayout.js';
import { kit, quads } from './extKit.js';

const SHOW_R = 60, STEP = 3.6, MAX = 140;
const DOOR = [S.door.x, L.tower.z0 - 1.6];
// 대왕판교로 동쪽 보도 x = 도로 중심 + 13.9
const sw = (pts) => pts.map(([x, z]) => [x + 13.9, z]);
export const ROUTES = [
  { id: 'station', pts: [[-13.3, 12.7], [-12.9, 28.2], [-12.5, 43.6], [-157.2, 43.2], [-156, 99.2], [-302.2, 99.5], [-300.5, 137.7], [-301.4, 204], [-306.6, 264.4], [-315.2, 320.1], [-341.5, 314.5], [-345, 335.7], [-357, 400], [-363.5, 444], [-366.5, 466]], end: 'post1' },
  { id: 'north', pts: [...sw([[-597, 318], [-597, 384], [-597.8, 442]]), [-576, 442], [-576, 453.5], [DOOR[0], 453.5], DOOR] },
  { id: 'south', pts: [...sw([[-581, 700], [-583, 657], [-585, 609], [-591, 543], [-595, 509], [-597, 480], [-597.6, 464]]), [-576, 464], [-576, 470.5], [DOOR[0], 470.5], DOOR] },
  { id: 'service', pts: [[-503, 306], [DOOR[0], 330], [DOOR[0], 404], DOOR] },
];
// 이정표: [x, z, 바라보는 yaw, 아틀라스 칸]
const POSTS = [[-20.5, 22, -Math.PI / 2, 'post0'], [-372, 469, Math.PI / 2 + 0.3, 'post1'], [-580.4, 326, Math.PI, 'post3'], [-567.5, 690, 0, 'post3'], [-498, 309, Math.PI + 0.4, 'post2'], [-498, 404.5, Math.PI, 'post2']];

function resample(pts, step) {
  const out = []; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz); if (len < 1e-3) continue;
    const hx = dx / len, hz = dz / len;
    for (let d = carry; d < len; d += step) out.push({ x: ax + hx * d, z: az + hz * d, yaw: Math.atan2(hx, hz) });
    carry = (carry - len) % step; if (carry < 0) carry += step;
  }
  return out;
}
function chevron() {
  const s = new THREE.Shape();
  s.moveTo(0, 1.0); s.lineTo(0.85, -0.75); s.lineTo(0.42, -0.75); s.lineTo(0, 0.12); s.lineTo(-0.42, -0.75); s.lineTo(-0.85, -0.75); s.closePath();
  const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); // 팁이 −z → 아래 yaw 로 진행 방향
  g.rotateY(Math.PI);
  return g;
}

export function createDepotWayfinding({ scene, overlay, groundY = () => 0, signTex, signSlots, kitMat, getPos } = {}) {
  const root = new THREE.Group(); root.name = 'depot-wayfinding'; scene.add(root);
  const pts = []; for (const r of ROUTES) for (const p of resample(r.pts, STEP)) { if (Math.hypot(p.x - DOOR[0], p.z - DOOR[1]) < 2.5) continue; p.y = (groundY(p.x, p.z) || 0) + 0.13; pts.push(p); }
  const geo = chevron();
  const mk = (color, name, ro, off) => {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.96, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off * 2 });
    const im = new THREE.InstancedMesh(geo, m, MAX); im.count = 0; im.frustumCulled = false; im.renderOrder = ro; im.name = name; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(im); return im;
  };
  const rim = mk('#f3eada', 'depot-arrows-rim', 3, -3), body = mk('#1f8a5b', 'depot-arrows', 4, -4);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s1 = new THREE.Vector3(1.25, 1, 1.25), s2 = new THREE.Vector3(1.55, 1, 1.55);
  let acc = 1, shownKey = '';
  function layArrows(pos) {
    let n = 0; const r2 = SHOW_R * SHOW_R; let key = '';
    for (let i = 0; i < pts.length && n < MAX; i++) {
      const p = pts[i]; if ((p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 > r2) continue;
      key += i + ',';
      q.setFromAxisAngle(up, p.yaw); v.set(p.x, p.y, p.z);
      body.setMatrixAt(n, m4.compose(v, q, s1)); v.y -= 0.004; rim.setMatrixAt(n, m4.compose(v, q, s2)); n++;
    }
    if (key === shownKey) return; shownKey = key;
    body.count = rim.count = n; body.visible = rim.visible = n > 0;
    body.instanceMatrix.needsUpdate = rim.instanceMatrix.needsUpdate = true;
  }
  // 이정표 (기둥은 정적 kit, 판은 간판 아틀라스)
  const K = kit(), Q = quads();
  for (const [x, z, yaw, slot] of POSTS) {
    const y = groundY(x, z) || 0;
    K.cyl(0.07, 0.08, 3.4, x, y + 1.7, z, '#3b4046', { seg: 6 }); K.box(0.35, 0.12, 0.35, x, y + 0.06, z, '#777');
    const fx = Math.sin(yaw) * 0.06, fz = Math.cos(yaw) * 0.06;
    Q.sign(x + fx, y + 3.0, z + fz, 2.3, 2.3 * 192 / 512, yaw, signSlots[slot]); Q.sign(x - fx, y + 3.0, z - fz, 2.3, 2.3 * 192 / 512, yaw + Math.PI, signSlots[slot]);
  }
  const pg = K.geometry(), qg = Q.geometry();
  const postPoles = new THREE.Mesh(pg, kitMat); postPoles.name = 'depot-posts';
  const postMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false });
  const postSigns = new THREE.Mesh(qg, postMat); postSigns.name = 'depot-post-signs';
  root.add(postPoles, postSigns);
  // 3D 이름표
  const labelPos = new THREE.Vector3(S.door.x - 5, (groundY(S.door.x, S.z0) || 0) + 20, S.z0);
  const css = document.createElement('style'); css.textContent = '.label.depot{font-size:14px;font-weight:800;color:#F3EADA;background:#1E5A45;border:2px solid #F2C230;padding:3px 10px;letter-spacing:.2px}'; document.head.appendChild(css);
  const label = overlay?.add?.({ cls: 'label depot', text: '🛒 범창고 BUMP DEPOT', getPos: () => labelPos, maxDist: 950, minDist: 30 }) || null;
  // 미니맵 표시 + 안내선(bw:nav-route, 편의점 안내와 같은 이벤트)
  const marker = { x: S.door.x, z: S.z0 - 4, label: '범창고', sub: 'BUMP DEPOT' };
  let guiding = null, gAcc = 0;
  function guide() {
    const p = getPos?.(); const from = p ? [p.x, p.z] : [DOOR[0], DOOR[1] - 40];
    guiding = { from };
    dispatchEvent(new CustomEvent('bw:nav-route', { detail: { points: [from, DOOR], dest: { x: DOOR[0], z: DOOR[1], label: '범창고 입구' } } }));
    return true;
  }
  return {
    root, marker, guide, routes: ROUTES, arrowTotal: pts.length,
    get arrowCount() { return body.count; },
    get guiding() { return !!guiding; },
    update(dt, pos) {
      if (!pos) return;
      acc += dt; if (acc >= 0.35) { acc = 0; layArrows(pos); }
      if (guiding) {
        if (Math.hypot(pos.x - DOOR[0], pos.z - DOOR[1]) < 5) { guiding = null; dispatchEvent(new CustomEvent('bw:nav-route', { detail: null })); return; }
        gAcc += dt; if (gAcc > 0.6 && Math.hypot(pos.x - guiding.from[0], pos.z - guiding.from[1]) > 3) { gAcc = 0; guiding.from = [pos.x, pos.z]; dispatchEvent(new CustomEvent('bw:nav-route', { detail: { points: [guiding.from, DOOR], dest: { x: DOOR[0], z: DOOR[1], label: '범창고 입구' } } })); }
      }
    },
    dispose() { root.removeFromParent(); body.dispose(); rim.dispose(); geo.dispose(); body.material.dispose(); rim.material.dispose(); pg?.dispose(); qg?.dispose(); postMat.dispose(); if (label) overlay?.remove?.(label); css.remove(); },
  };
}
