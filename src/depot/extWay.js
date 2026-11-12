// [depot-ext] 범창고 길 안내 — 이정표(면마다 길 방향 화살표), 3D 이름표, 미니맵 표시(반짝임)/안내선. 바닥 화살표는 [depot-live] 에서 뺌.
//   ⚠ 데이터에 경부고속도로를 건너는 보행로가 없어, 정자역 길은 고속도로 동쪽 가장자리(이정표)에서 끝난다.
import * as THREE from 'three';
import { DEPOT_SITE as S } from './flag.js';
import { LOT as L } from './extLayout.js';
import { kit, quads } from './extKit.js';

const STEP = 3.6;
const DOOR = [S.door.x, L.tower.z0 - 1.6];
// 대왕판교로 동쪽 보도 = OSM 중심선 + 13.9
const sw = (pts) => pts.map(([x, z]) => [x + 13.9, z]);
// 길(마지막 점 = 입구 문 앞). 정자역 길은 OSM 도로 그래프 최단 경로를 차도 밖(나란한 차도까지 피해 반폭+1 m 이상)으로 옮긴 선 — 큰길 건너는 곳만 차도 위.
export const ROUTES = [
  { id: 'station', pts: [[-4.3, 12.5], [-3.9, 28], [-3.5, 43.6], [-157.2, 43.2], [-155.9, 103.2], [-293, 103.5], [-291.5, 137.6], [-292.4, 204.4], [-297.7, 265.5], [-306.4, 322], [-351.3, 312.4], [-354.9, 334.1], [-366.5, 398.4], [-373, 442.6], [-376, 464.7]] },
  { id: 'north', pts: [...sw([[-596.7, 312], [-597.1, 384.2], [-597.1, 387], [-597.4, 442]]), [-576, 442], [-576, 453.5], [DOOR[0] - 4.5, 453.5], [DOOR[0], 458], DOOR] },
  { id: 'south', pts: [...sw([[-581.3, 700], [-580.6, 698.1], [-582.6, 656.8], [-585, 609], [-591.3, 542.8], [-595, 508.8], [-597.1, 480.1], [-597.3, 464]]), [-576, 464], [-576, 455.5] ] },
  { id: 'service', pts: [[-503, 306], [DOOR[0], 330], [DOOR[0], 404], DOOR] },
];
// 이정표: [x, z, 바라보는 yaw, 아틀라스 칸]
const POSTS = [[-1, 30, Math.PI / 2, 'post0'], [-379.5, 467, Math.PI, 'post1'], [-580.6, 324, Math.PI, 'post3'], [-566.6, 690, 0, 'post3'], [-498, 309, Math.PI + 0.4, 'post2'], [-498.5, 404.5, Math.PI, 'post2']];

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
export function createDepotWayfinding({ scene, overlay, groundY = () => 0, signTex, signSlots, kitMat, getPos } = {}) {
  const root = new THREE.Group(); root.name = 'depot-wayfinding'; scene.add(root);
  // [depot-live] 바닥 화살표는 뺐음(느려지기만 함) — 길 안내는 이정표 + 미니맵 반짝이는 표시로. 경로 점은 이정표 화살표 방향 계산에만 씀
  const rpts = []; for (const r of ROUTES) for (const p of resample(r.pts, STEP)) rpts.push(p);
  function arrowFor(x, z, yaw) { // 이 면을 보고 선 사람 기준 ◀ ▶ ▲ — 가까운 길 점에서 14 m 앞(길이 꺾이는 곳 반영), 길이 멀면 입구 방위
    let bi = -1, bd = 625; for (let i = 0; i < rpts.length; i++) { const d = (rpts[i].x - x) ** 2 + (rpts[i].z - z) ** 2; if (d < bd) { bd = d; bi = i; } }
    let tx = DOOR[0], tz = DOOR[1];
    if (bi >= 0) { let j = bi; for (; j < rpts.length - 1 && Math.hypot(rpts[j].x - x, rpts[j].z - z) < 14; j++) if (Math.hypot(rpts[j + 1].x - rpts[j].x, rpts[j + 1].z - rpts[j].z) > STEP * 2) break; tx = rpts[j].x; tz = rpts[j].z; }
    const dx = tx - x, dz = tz - z, rx = Math.cos(yaw), rz = -Math.sin(yaw), nx = Math.sin(yaw), nz = Math.cos(yaw);
    const side = dx * rx + dz * rz, fwd = -(dx * nx + dz * nz);
    return fwd > Math.abs(side) * 1.2 ? 'arrowU' : side > 0 ? 'arrowR' : 'arrowL';
  }
  // 이정표 (기둥은 정적 kit, 판은 간판 아틀라스)
  const K = kit(), Q = quads();
  for (const [x, z, yaw, slot] of POSTS) {
    const y = groundY(x, z) || 0;
    K.cyl(0.07, 0.08, 3.4, x, y + 1.7, z, '#3b4046', { seg: 6 }); K.box(0.35, 0.12, 0.35, x, y + 0.06, z, '#777');
    const fx = Math.sin(yaw) * 0.06, fz = Math.cos(yaw) * 0.06;
    Q.sign(x + fx, y + 3.0, z + fz, 2.3, 2.3 * 192 / 512, yaw, signSlots[slot]); Q.sign(x - fx, y + 3.0, z - fz, 2.3, 2.3 * 192 / 512, yaw + Math.PI, signSlots[slot]);
    if (slot !== 'post3' && signSlots.arrowL) for (const [sg, fy] of [[1, yaw], [-1, yaw + Math.PI]]) { // 면마다 따로: 왼쪽 네모 칸(로고 자리)에 화살표
      const rx = Math.cos(fy), rz = -Math.sin(fy), ox = x + sg * fx * 1.25, oz = z + sg * fz * 1.25;
      Q.sign(ox - rx * 0.8625, y + 3.0 + 0.117, oz - rz * 0.8625, 0.43, 0.43, fy, signSlots[arrowFor(x, z, fy)]);
    }
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
    root, marker, guide, routes: ROUTES,
    get guiding() { return !!guiding; },
    update(dt, pos) {
      if (!pos) return;
      if (guiding) {
        if (Math.hypot(pos.x - DOOR[0], pos.z - DOOR[1]) < 5) { guiding = null; dispatchEvent(new CustomEvent('bw:nav-route', { detail: null })); return; }
        gAcc += dt; if (gAcc > 0.6 && Math.hypot(pos.x - guiding.from[0], pos.z - guiding.from[1]) > 3) { gAcc = 0; guiding.from = [pos.x, pos.z]; dispatchEvent(new CustomEvent('bw:nav-route', { detail: { points: [guiding.from, DOOR], dest: { x: DOOR[0], z: DOOR[1], label: '범창고 입구' } } })); }
      }
    },
    dispose() { root.removeFromParent(); pg?.dispose(); qg?.dispose(); postMat.dispose(); if (label) overlay?.remove?.(label); css.remove(); },
  };
}
