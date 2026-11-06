// [tancheon-amenities] 탄천 여수·사송 구간: 제방 계단 + 반려견 놀이터 + 사송교 남단 교차로 신호(좌회전 위상)
//   ?tcstairs=0  계단 끄기 / ?dogpark=0  여수동 반려견 놀이터 끄기 / ?ltphase=0  차량 신호·좌회전 끄기
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { quad, flatMesh } from '../transit/transit.js';
import {
  SASONG_JUNC, DOG_PARK, TC_STAIRS, LT_CYCLE, BRIDGE_DIR, ROAD_DIR,
  tcStairsEnabled, dogParkEnabled, ltPhaseEnabled, withTancheonStairs,
  vehiclePhase, pedPhase, vehicleAllowed, hash,
} from './tancheonAmenitiesLogic.js';

export {
  SASONG_JUNC, DOG_PARK, TC_STAIRS, LT_CYCLE, BRIDGE_DIR, ROAD_DIR,
  tcStairsEnabled, dogParkEnabled, ltPhaseEnabled, withTancheonStairs,
  vehiclePhase, pedPhase, vehicleAllowed,
};

const matCache = new Map();
function M(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...extra }));
  return matCache.get(key);
}

function makeSign(title, subtitle) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.0, 6), M('#5c4033'));
  post.position.y = 1.0; post.castShadow = true; g.add(post);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff9db'; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#f59f00'; ctx.lineWidth = 14; ctx.strokeRect(10, 10, 492, 236);
  ctx.fillStyle = '#122033'; ctx.font = '900 40px "Pretendard","Noto Sans KR",sans-serif';
  ctx.textAlign = 'center'; ctx.fillText(title, 256, 120);
  ctx.fillStyle = '#33415c'; ctx.font = '700 26px "Pretendard","Noto Sans KR",sans-serif';
  ctx.fillText(subtitle, 256, 180);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.2), new THREE.MeshBasicMaterial({ map: tex }));
  board.position.set(0, 2.05, 0.08); g.add(board);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.65, 1.25, 0.08), M('#5c4033'));
  back.position.set(0, 2.05, 0); g.add(back);
  return g;
}

function fencePosts(x0, z0, x1, z1, h = 1.15) {
  const geos = [];
  const L = Math.hypot(x1 - x0, z1 - z0) || 1;
  const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  const n = Math.max(2, Math.round(L / 2.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    geos.push(new THREE.CylinderGeometry(0.045, 0.05, h, 5).translate(x, h / 2, z));
  }
  const rail = new THREE.BoxGeometry(L, 0.06, 0.06);
  const midX = (x0 + x1) / 2, midZ = (z0 + z1) / 2;
  rail.translate(0, h - 0.05, 0);
  rail.rotateY(Math.atan2(ux, uz));
  rail.translate(midX, 0, midZ);
  geos.push(rail);
  const mid = new THREE.BoxGeometry(L, 0.05, 0.05);
  mid.translate(0, h * 0.55, 0);
  mid.rotateY(Math.atan2(ux, uz));
  mid.translate(midX, 0, midZ);
  geos.push(mid);
  return geos;
}

function agilityProps(cx, cz) {
  const geos = [];
  for (const [ox, oz] of [[-8, -4], [6, 5]]) {
    for (const sx of [-0.7, 0.7]) geos.push(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 5).translate(cx + ox + sx, 0.42, cz + oz));
    geos.push(new THREE.BoxGeometry(1.5, 0.06, 0.06).translate(cx + ox, 0.75, cz + oz));
  }
  const t = new THREE.CylinderGeometry(0.55, 0.55, 2.2, 10, 1, true);
  t.rotateZ(Math.PI / 2); t.translate(cx + 2, 0.55, cz - 8); geos.push(t);
  const ramp = new THREE.BoxGeometry(1.4, 0.08, 2.4);
  ramp.rotateX(-0.35); ramp.translate(cx - 5, 0.55, cz + 8); geos.push(ramp);
  geos.push(new THREE.BoxGeometry(0.5, 1.0, 0.5).translate(cx - 5, 0.5, cz + 9.1));
  return geos;
}

function simpleDog(x, z, color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.28), M(color));
  body.position.y = 0.38; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), M(color));
  head.position.set(0.32, 0.48, 0); g.add(head);
  for (const [lx, lz] of [[-0.18, -0.1], [-0.18, 0.1], [0.12, -0.1], [0.12, 0.1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), M('#3d2b1f'));
    leg.position.set(lx, 0.14, lz); g.add(leg);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.22), M(color));
  tail.position.set(-0.32, 0.45, 0); g.add(tail);
  g.position.set(x, 0, z);
  return g;
}

export function buildYeosuDogPark(scene, overlay, terrain) {
  const { x0, x1, z0, z1 } = DOG_PARK;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const gy = terrain?.baseHeight?.(cx, cz) ?? -6;
  const root = new THREE.Group(); root.name = 'yeosuDogPark'; root.position.y = gy;
  scene.add(root);

  const turf = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.4, z1 - z0 - 0.4), M('#8fca5a'));
  turf.rotation.x = -Math.PI / 2; turf.position.set(cx, 0.04, cz); turf.receiveShadow = true; root.add(turf);

  const GATE = 2.2;
  const fenceGeos = [
    ...fencePosts(x0, z0, cx - GATE, z0),
    ...fencePosts(cx + GATE, z0, x1, z0),
    ...fencePosts(x0, z1, x1, z1),
    ...fencePosts(x0, z0, x0, z1),
    ...fencePosts(x1, z0, x1, z1),
  ];
  const fenceMesh = new THREE.Mesh(mergeGeometries(fenceGeos, false), M('#c4a574'));
  fenceMesh.castShadow = true; root.add(fenceMesh);
  for (const g of fenceGeos) g.dispose();

  const gateGroup = new THREE.Group();
  const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(GATE - 0.15, 1.15, 0.08), M('#e8d5a3'));
  leftDoor.position.set(-(GATE / 2 - 0.1), 0.57, 0);
  const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(GATE - 0.15, 1.15, 0.08), M('#e8d5a3'));
  rightDoor.position.set(GATE / 2 - 0.1, 0.57, 0);
  gateGroup.add(leftDoor, rightDoor);
  gateGroup.position.set(cx, 0, z0);
  root.add(gateGroup);
  let gateOpen = false;

  const ag = agilityProps(cx, cz);
  const agMesh = new THREE.Mesh(mergeGeometries(ag, false), M('#f08a2c'));
  agMesh.castShadow = true; root.add(agMesh);
  for (const g of ag) g.dispose();

  for (const [bx, bz, yaw] of [[cx - 10, cz + 4, 0.3], [cx + 8, cz - 6, -0.5]]) {
    const b = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.4), M('#b07a48'));
    seat.position.y = 0.45; b.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.06), M('#b07a48'));
    back.position.set(0, 0.7, 0.18); b.add(back);
    b.position.set(bx, 0, bz); b.rotation.y = yaw; root.add(b);
  }

  const sign = makeSign('반려견 놀이터', '여수동 탄천 · 어질리티');
  sign.position.set(cx + 2.5, 0, z0 - 1.2); root.add(sign);
  if (overlay) {
    overlay.add({
      cls: 'label dogpark',
      text: '🐕 반려견 놀이터',
      getPos: () => new THREE.Vector3(cx, gy + 3.2, cz),
      maxDist: 120,
    });
  }

  const dogs = [
    simpleDog(cx - 4, cz + 2, '#d4a574'),
    simpleDog(cx + 5, cz - 3, '#6b4f3a'),
    simpleDog(cx - 1, cz + 8, '#f5f0e6'),
  ];
  for (const d of dogs) root.add(d);
  const dogState = dogs.map((d, i) => ({ mesh: d, t: i * 2.1, r: 4 + i, a: i * 2 }));

  const pad = 0.6;
  function blocks(x, z) {
    if (x < x0 - pad || x > x1 + pad || z < z0 - pad || z > z1 + pad) return false;
    if (gateOpen && Math.abs(x - cx) < GATE && z < z0 + 1.2 && z > z0 - 1.2) return false;
    return (
      (Math.abs(z - z0) < 0.35 && (x < cx - GATE || x > cx + GATE)) ||
      Math.abs(z - z1) < 0.35 ||
      Math.abs(x - x0) < 0.35 ||
      Math.abs(x - x1) < 0.35
    );
  }

  return {
    root,
    bounds: { x0, x1, z0, z1, gy },
    blocks,
    toggleGate() {
      gateOpen = !gateOpen;
      leftDoor.rotation.y = gateOpen ? -1.1 : 0;
      rightDoor.rotation.y = gateOpen ? 1.1 : 0;
      return gateOpen;
    },
    update(dt) {
      for (const s of dogState) {
        s.t += dt;
        const ang = s.a + s.t * 0.35;
        s.mesh.position.x = cx + Math.cos(ang) * s.r;
        s.mesh.position.z = cz + Math.sin(ang) * s.r;
        s.mesh.rotation.y = ang + Math.PI / 2;
      }
    },
  };
}

function approachAxes() {
  const [rx, rz] = ROAD_DIR;
  const [bx, bz] = BRIDGE_DIR;
  return {
    ne: { inDir: [-rx, -rz] },
    sw: { inDir: [rx, rz] },
    br: { inDir: [-bx, -bz] },
  };
}

function arrowTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#2bff7a';
  ctx.beginPath();
  ctx.moveTo(64, 18); ctx.lineTo(100, 60); ctx.lineTo(78, 60); ctx.lineTo(78, 110);
  ctx.lineTo(50, 110); ctx.lineTo(50, 60); ctx.lineTo(28, 60); ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildSasongSignals(scene, { getSimTime, crossingsApi }) {
  const J = SASONG_JUNC;
  const axes = approachAxes();
  const root = new THREE.Group(); root.name = 'sasongSignals'; scene.add(root);
  const offset = hash('sasong-lt') * LT_CYCLE;
  let ownTime = 0;
  const now = () => (getSimTime?.() ?? ownTime);

  const pos = [], idx = [];
  const approaches = [
    { key: 'ne', x: J.x - axes.ne.inDir[0] * 14, z: J.z - axes.ne.inDir[1] * 14, dir: axes.ne.inDir, w: 12.8, leftOnly: false },
    { key: 'neL', x: J.x - axes.ne.inDir[0] * 12 + BRIDGE_DIR[0] * 2.5, z: J.z - axes.ne.inDir[1] * 12 + BRIDGE_DIR[1] * 2.5, dir: axes.ne.inDir, w: 4.5, leftOnly: true },
    { key: 'sw', x: J.x - axes.sw.inDir[0] * 14, z: J.z - axes.sw.inDir[1] * 14, dir: axes.sw.inDir, w: 12.0, leftOnly: false },
    { key: 'br', x: J.x - axes.br.inDir[0] * 16, z: J.z - axes.br.inDir[1] * 16, dir: axes.br.inDir, w: 14.0, leftOnly: false },
  ];

  const synth = [];
  for (const a of approaches) {
    const [dx, dz] = a.dir, nx = -dz, nz = dx;
    const depth = 2.2;
    idx.push(...quad(pos, a.x + dx * (depth + 1.6), a.z + dz * (depth + 1.6), nx, nz, dx, dz, a.w / 2, 0.22, 0.11));
    for (let v = -a.w / 2 + 0.4; v <= a.w / 2 - 0.2; v += 1.0) {
      idx.push(...quad(pos, a.x + nx * v, a.z + nz * v, dx, dz, nx, nz, depth, 0.28, 0.108));
    }
    synth.push({
      id: 'sasong-' + a.key,
      x: a.x, z: a.z, dir: a.dir, w: a.w, depth, sig: true,
      cl: 'sasong', g: 0, vehSig: true, approach: a.key === 'neL' ? 'ne' : a.key,
      leftOnly: !!a.leftOnly, _now: now, _off: offset,
    });
  }
  if (idx.length) root.add(flatMesh(pos, idx, '#f7f7f2'));

  const poleMat = new THREE.MeshLambertMaterial({ color: '#5b6066' });
  const headMat = new THREE.MeshLambertMaterial({ color: '#1a1d21' });
  const lamps = [];
  const arrowTex = arrowTexture();
  for (const a of [{ key: 'ne', ...approaches[0] }, { key: 'sw', ...approaches[2] }, { key: 'br', ...approaches[3] }]) {
    const [dx, dz] = a.dir, nx = -dz, nz = dx;
    const px = a.x + nx * (a.w / 2 + 1.2) + dx * 1.2;
    const pz = a.z + nz * (a.w / 2 + 1.2) + dz * 1.2;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 5.2, 6), poleMat);
    pole.position.y = 2.6; pole.castShadow = true; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.2), poleMat);
    arm.position.set(0, 5.0, 1.4); g.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.55, 0.35), headMat);
    head.position.set(0, 5.0, 2.9); head.castShadow = true; g.add(head);
    const mkLamp = (y, color) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), new THREE.MeshBasicMaterial({ color }));
      m.position.set(0, y, 3.1); g.add(m); return m;
    };
    const red = mkLamp(5.45, '#3a1010');
    const yel = mkLamp(5.05, '#3a3010');
    const grn = mkLamp(4.65, '#0d2a18');
    const arr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.32),
      new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, color: '#0d2a18' }),
    );
    arr.position.set(0.0, 4.25, 3.1); g.add(arr);
    g.position.set(px, 0, pz);
    g.rotation.y = Math.atan2(dx, dz);
    root.add(g);
    lamps.push({ approach: a.key, red, yel, grn, arr, hasLeft: a.key === 'ne' });
  }

  const pedLamps = [];
  for (const c of synth.filter((c) => !c.leftOnly)) {
    const [dx, dz] = c.dir, nx = -dz, nz = dx;
    for (const sgn of [-1, 1]) {
      const px = c.x + nx * sgn * (c.w / 2 + 0.9) + dx * (c.depth + 0.5);
      const pz = c.z + nz * sgn * (c.w / 2 + 0.9) + dz * (c.depth + 0.5);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.1, 6), poleMat);
      pole.position.y = 1.55; g.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.95, 0.28), headMat);
      head.position.y = 2.75; g.add(head);
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.3), new THREE.MeshBasicMaterial({ color: '#3a1010' }));
      r.position.y = 2.97; g.add(r);
      const gr = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.3), new THREE.MeshBasicMaterial({ color: '#0d2a18' }));
      gr.position.y = 2.55; g.add(gr);
      g.position.set(px, 0, pz);
      g.rotation.y = Math.atan2(-nx * sgn, -nz * sgn);
      root.add(g);
      pedLamps.push({ c, r, gr });
    }
  }

  if (crossingsApi?.crossings) for (const c of synth) crossingsApi.crossings.push(c);

  const cR = '#ff3b30', cRo = '#3a1010', cY = '#ffcc00', cYo = '#3a3010', cG = '#2bff7a', cGo = '#0d2a18';
  let acc = 1;
  function update(dt) {
    ownTime += dt; acc += dt; if (acc < 0.08) return; acc = 0;
    const tnow = now();
    const blinkOn = Math.floor(tnow * 2.5) % 2 === 0;
    for (const L of lamps) {
      const ph = vehiclePhase(L.approach, tnow, offset);
      L.red.material.color.set(ph === 'red' ? cR : cRo);
      L.yel.material.color.set(ph === 'yellow' ? cY : cYo);
      L.grn.material.color.set(ph === 'green' ? cG : cGo);
      if (L.hasLeft) {
        L.arr.material.color.set(ph === 'left' ? cG : cGo);
        L.arr.material.opacity = ph === 'left' ? 1 : 0.35;
      } else L.arr.visible = false;
    }
    for (const P of pedLamps) {
      const s = pedPhase(tnow, offset);
      P.r.material.color.set(s === 'red' ? cR : cRo);
      P.gr.material.color.set(s === 'green' || (s === 'blink' && blinkOn) ? cG : cGo);
    }
  }
  update(1);

  const basePed = crossingsApi?.pedLight;
  function pedLight(c) {
    if (c?.vehSig || c?.cl === 'sasong') return pedPhase(now(), offset);
    return basePed ? basePed(c) : 'none';
  }
  if (crossingsApi) {
    crossingsApi.pedLight = pedLight;
    crossingsApi.vehicleAllowed = (c, hx, hz) => vehicleAllowed(c, hx, hz);
  }

  return {
    root, crossings: synth, pedLight,
    vehicleAllowed: (c, hx, hz) => vehicleAllowed(c, hx, hz),
    update, offset, junction: J,
  };
}

export function mountTancheonAmenities({ scene, overlay, terrain, crossings, getSimTime, params }) {
  const search = params instanceof URLSearchParams
    ? `?${params.toString()}`
    : (typeof params === 'string' ? params : (typeof location !== 'undefined' ? location.search : ''));
  const out = { dogPark: null, signals: null, update() {}, blocks() { return false; } };
  if (dogParkEnabled(search)) out.dogPark = buildYeosuDogPark(scene, overlay, terrain);
  if (ltPhaseEnabled(search) && crossings) {
    out.signals = buildSasongSignals(scene, { getSimTime, crossingsApi: crossings });
  }
  out.update = (dt) => { out.dogPark?.update?.(dt); out.signals?.update?.(dt); };
  out.blocks = (x, z) => !!(out.dogPark && out.dogPark.blocks(x, z));
  return out;
}
