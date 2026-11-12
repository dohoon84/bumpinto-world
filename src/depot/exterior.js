// [depot-ext] 범창고 외관 — 멀리(≤1.5 km)는 값싼 외피만(골강판 벽·입구 초록 탑·큰 간판·탑 표지 2기 ≈ draw 5),
//   가까이(420 m 안)는 주차장·입구 캐노피·자동문·카트 보관소·현수막·깃발·하역장·트럭·가로등·주차 차량을 그때 만들고(extLot.js), 560 m 밖이면 해제.
//   길 안내(바닥 화살표·이정표·이름표·미니맵 표시)는 extWay.js. 내부(선반·상품·물리)는 index.js 가 들어갈 때만 interior.js 로 지연 로드.
import * as THREE from 'three';
import { DEPOT_SITE as S } from './flag.js';
import { LOT as L } from './extLayout.js';
import { wallTexture, roofTexture, signAtlas, C } from './extTex.js';
import { kit, kitMaterial, quads } from './extKit.js';
import { createDepotWayfinding } from './extWay.js';
import { createNightFade } from '../world/nightLights.js';

const FAR_R = 1500;
// 박스 6면 → 3 draw: ±x 한 그룹, +y(지붕) 한 그룹, ±z 한 그룹, 바닥(-y)은 안 그린다
function packBox(g) { g.clearGroups(); g.addGroup(0, 12, 0); g.addGroup(12, 6, 2); g.addGroup(24, 12, 4); return g; }

export function buildDepotExterior(scene, { groundY = () => 0, overlay = null, getPos = null, lot = true, mobile = false } = {}) {
  const t0 = performance.now();
  const NEAR_IN = mobile ? 320 : 420, NEAR_OUT = mobile ? 440 : 560; // 모바일은 더 가까이 와서 만들고 빨리 해제
  const W = S.x1 - S.x0, D = S.z1 - S.z0, cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
  const ys = [[S.x0, S.z0], [S.x1, S.z0], [S.x0, S.z1], [S.x1, S.z1], [cx, cz]].map(([x, z]) => groundY(x, z) || 0);
  const y0 = Math.min(...ys), yTop = Math.max(...ys);
  const root = new THREE.Group(); root.name = 'depot-exterior';
  const far = new THREE.Group(); far.name = 'depot-far'; root.add(far);
  const disposables = [];
  const sign = signAtlas({ k: mobile ? 0.5 : 1 }); disposables.push(sign);
  const SS = sign.slots;
  const kitMat = kitMaterial(); disposables.push(kitMat);
  const signMat = new THREE.MeshBasicMaterial({ map: sign.tex, toneMapped: false, side: THREE.FrontSide }); disposables.push(signMat);

  // 외피: 골강판(크림+초록 처마+크라프트 띠) · 지붕
  const H = S.h + (yTop - y0) + 0.6;
  const wT = wallTexture('cream'); wT.repeat.set(W / 8, 1);
  const wTz = wT.clone(); wTz.needsUpdate = true; wTz.repeat.set(D / 8, 1);
  const rT = roofTexture(); rT.repeat.set(W / 4, D / 4);
  const wallX = new THREE.MeshLambertMaterial({ map: wT }), wallZ = new THREE.MeshLambertMaterial({ map: wTz }), roofM = new THREE.MeshLambertMaterial({ map: rT });
  const box = packBox(new THREE.BoxGeometry(W, H, D));
  const body = new THREE.Mesh(box, [wallZ, wallZ, roofM, roofM, wallX, wallX]); body.position.set(cx, y0 - 0.6 + H / 2, cz); body.name = 'depot-shell'; far.add(body);
  disposables.push(wT, wTz, rT, wallX, wallZ, roofM, box);
  // 입구 위 초록 탑(정면 1.2 m 돌출)
  const T = L.tower, tW = T.x1 - T.x0, tD = S.z0 - T.z0 + 0.4;
  const gT = wallTexture('green'); gT.repeat.set(tW / 8, 1);
  const gTs = gT.clone(); gTs.needsUpdate = true; gTs.repeat.set(tD / 8, 1);
  const towerM = new THREE.MeshLambertMaterial({ map: gT }), towerS = new THREE.MeshLambertMaterial({ map: gTs }), towerTop = new THREE.MeshLambertMaterial({ color: C.deep });
  const tBox = packBox(new THREE.BoxGeometry(tW, T.h + 0.6, tD));
  const tower = new THREE.Mesh(tBox, [towerS, towerS, towerTop, towerTop, towerM, towerM]); tower.position.set((T.x0 + T.x1) / 2, y0 - 0.6 + (T.h + 0.6) / 2, T.z0 + tD / 2); tower.name = 'depot-tower'; far.add(tower);
  disposables.push(gT, gTs, towerM, towerS, towerTop, tBox);

  // 탑 표지 구조(멀리서도 보이게) + 지붕 난간 띠
  const K = kit();
  for (const p of L.pylons) {
    const gy = groundY(p.x, p.z) || 0, rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw), w = p.h > 20 ? 8 : 7;
    for (const s of [-1, 1]) { K.box(0.7, p.h, 0.7, p.x + rx * s * (w / 2 - 0.6), gy + p.h / 2, p.z + rz * s * (w / 2 - 0.6), '#2b3036', { ry: p.yaw }); K.box(1.3, 0.5, 1.3, p.x + rx * s * (w / 2 - 0.6), gy + 0.25, p.z + rz * s * (w / 2 - 0.6), '#8f9399', { ry: p.yaw }); }
    K.box(w + 0.5, p.h - 4.5, 0.9, p.x, gy + 4.5 + (p.h - 4.5) / 2, p.z, C.deep, { ry: p.yaw }); // 판 뒤 몸통
    K.box(w + 0.7, 0.35, 1.1, p.x, gy + p.h + 0.15, p.z, C.yellow, { ry: p.yaw, glow: 0.6 }); // 위 LED 띠
  }
  K.box(W + 0.6, 0.9, 0.6, cx, y0 + S.h + 0.45, S.z1 - 0.3, '#174a39'); K.box(0.6, 0.9, D, S.x0 + 0.3, y0 + S.h + 0.45, cz, '#174a39'); K.box(0.6, 0.9, D, S.x1 - 0.3, y0 + S.h + 0.45, cz, '#174a39');
  K.box(W + 0.6, 0.9, 0.6, cx, y0 + S.h + 0.45, S.z0 + 0.3, '#174a39');
  const fGeo = K.geometry(); const farKit = new THREE.Mesh(fGeo, kitMat); farKit.name = 'depot-far-kit'; far.add(farKit); disposables.push(fGeo);

  // 밝은 간판: 탑 정면 큰 간판, 옆벽 간판 2, 탑 표지 판(앞뒤)
  const Q = quads();
  Q.sign((T.x0 + T.x1) / 2, y0 + T.h - 4.15, T.z0 - 0.05, 30, 7.5, Math.PI, SS.main);
  Q.sign(S.x0 - 0.08, y0 + 6.3, 588, 22, 5.5, -Math.PI / 2, SS.side);
  Q.sign(S.x1 + 0.08, y0 + 6.3, 588, 22, 5.5, Math.PI / 2, SS.side);
  for (const p of L.pylons) {
    const gy = groundY(p.x, p.z) || 0, w = p.h > 20 ? 8 : 7, top = gy + p.h;
    for (const back of [0, 1]) {
      const yaw = p.yaw + (back ? Math.PI : 0), off = 0.47, ox = Math.sin(yaw) * off, oz = Math.cos(yaw) * off;
      Q.sign(p.x + ox, top - w * 0.55, p.z + oz, w, w, yaw, SS.pyTop);
      Q.sign(p.x + ox, top - w * 1.1 - w / 8 - 0.2, p.z + oz, w, w / 4, yaw, SS.pyMid);
      Q.sign(p.x + ox, top - w * 1.1 - w * 3 / 8 - 0.5, p.z + oz, w, w / 4, yaw, SS.pyLed);
      Q.sign(p.x + ox, top - w * 1.1 - w * 5 / 8 - 1.0, p.z + oz, w * 0.8, w * 0.4, yaw, SS.pyBack);
    }
  }
  const qGeo = Q.geometry(); const farSigns = new THREE.Mesh(qGeo, signMat); farSigns.name = 'depot-far-signs'; far.add(farSigns); disposables.push(qGeo);
  scene.add(root);

  // 충돌: 건물·탑, 탑 표지 다리, (가까울 때) 주차장 구조물·차량
  const rects = [[S.x0, S.z0, S.x1, S.z1], [T.x0, T.z0, T.x1, S.z0]];
  for (const p of L.pylons) { const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw), w = p.h > 20 ? 8 : 7; for (const s of [-1, 1]) { const x = p.x + rx * s * (w / 2 - 0.6), z = p.z + rz * s * (w / 2 - 0.6); rects.push([x - 0.65, z - 0.65, x + 0.65, z + 0.65]); } }
  const baseRects = rects.length;
  const bb = { x0: Math.min(L.roadInX, L.x0) - 5, x1: L.service.x1 + 2, z0: 395, z1: L.dock.z1 + 2 };

  const way = createDepotWayfinding({ scene, overlay, groundY, signTex: sign.tex, signSlots: SS, kitMat, getPos, mobile });
  const night = createNightFade();
  let near = null, nearP = null, gone = false, lastNight = -1;
  const stats = { near: false, buildMs: 0, farMs: Math.round((performance.now() - t0) * 10) / 10, mobile };
  async function buildNear() {
    const t0 = performance.now();
    const m = await import('./extLot.js');
    if (gone || near) return;
    const t1 = performance.now();
    near = m.buildDepotLot({ groundY, signTex: sign.tex, signSlots: SS, kitMat, mobile });
    stats.lotBuildMs = Math.round(performance.now() - t1);
    root.add(near.root);
    for (const b of near.blockers) rects.push(b);
    stats.near = true; stats.buildMs = Math.round(performance.now() - t0); stats.cars = near.cars; stats.stalls = near.stalls;
  }
  function dropNear() { if (!near) return; near.dispose(); near = null; nearP = null; rects.length = baseRects; stats.near = false; }

  return {
    root, y0, way, stats,
    get near() { return near; },
    park: dropNear, // 매장 안: 주차장 디테일을 내려 메모리 확보. 나오면 update 가 다시 만든다
    marker: way.marker,
    update(dt, pos) {
      night.update(dt);
      if (night.value !== lastNight) { lastNight = night.value; kitMat.userData.night.value = night.value; }
      if (!pos) return;
      const d = Math.hypot(pos.x - (L.x0 + L.x1) / 2, pos.z - (L.z0 + S.z1) / 2);
      far.visible = d < FAR_R;
      if (lot && d < NEAR_IN && !near && !nearP) nearP = buildNear().catch((e) => { console.warn('[depot-ext]', e); }).finally(() => { nearP = null; });
      else if (near && d > NEAR_OUT) dropNear();
      near?.update(dt, pos, night.value);
      way.update(dt, pos);
    },
    // 바깥에서 건물·구조물·주차 차량 안으로 걸어 들어가지 않게 (출입구 앞은 문 안내로 처리)
    // tall: 건물·철탑 같은 높은 것(baseRects)만 — 주차 차량·말뚝 등 낮은 것은 빼고 본다 (카메라가 차 지붕 위로 넘어갈 때)
    blocks(x, z, r = 0.4, tall = false) {
      if (x < bb.x0 || x > bb.x1 || z < bb.z0 || z > bb.z1) return false;
      for (let i = 0, n = tall ? baseRects : rects.length; i < n; i++) { const b = rects[i]; if (x > b[0] - r && x < b[2] + r && z > b[1] - r && z < b[3] + r) return true; }
      return false;
    },
    dispose() { gone = true; dropNear(); way.dispose(); night.dispose(); scene.remove(root); for (const d of disposables) d.dispose(); },
  };
}
