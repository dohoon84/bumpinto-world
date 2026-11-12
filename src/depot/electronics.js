// [depot] 가전 코너 — 입구 동쪽 복도 x 64.0–83.7, z 12.5–40.5.
//   TV 월(화면은 공유 캔버스 텍스처 하나), 문 열리는 냉장고·세탁기·건조기, 소형가전·노트북 테이블,
//   오디오 코너, 고가 케이지+구매 카드, 집어 갈 수 있는 대형 TV 박스(85인치 가로 ~2 m).
//   카트가 TV에 부딪히면 화면이 깜빡이고, 기존 staff.onRam 경로(장애물 충돌)를 탄다. staff.js 는 수정하지 않음.
//   매장에 들어갈 때 같이 만들어지고, 나오면 interior dispose 가 해제.
import * as THREE from 'three';
import { BY_ID } from './products.js';

export const ELEC_ZONE = { x0: 64.0, x1: 83.7, z0: 12.5, z1: 40.5 };

// 전시 본체 치수 (박스가 아님). 출처는 products.js data 와 같은 급.
const UNIT = {
  tv65: { w: 1.445, h: 0.832, d: 0.057 }, // real 65인치 패널(스탠드 제외)
  tv75: { w: 1.668, h: 0.960, d: 0.057 },
  tv85: { w: 1.891, h: 1.087, d: 0.057 },
  fridge: { w: 0.914, h: 1.860, d: 0.918 }, // real 국내 870L급 4도어 본체
  washer: { w: 0.700, h: 0.990, d: 0.770 }, // real 국내 21kg 드럼 본체
  dryer: { w: 0.700, h: 0.990, d: 0.820 }, // real 국내 20kg 건조기 본체
  micro: { w: 0.472, h: 0.280, d: 0.345 }, // real 25L 전자레인지 본체
  fryer: { w: 0.339, h: 0.317, d: 0.270 }, // real 5.5L 에어프라이어 본체
  cooker: { w: 0.250, h: 0.220, d: 0.250 }, // est 1.8L 밥솥 본체 (박스는 real)
  vac: { r: 0.17, h: 0.092 }, // real Ø34×9.2 cm 급
  laptop: { w: 0.356, h: 0.017, d: 0.248 }, // real 16인치급 본체
  tablet: { w: 0.254, h: 0.007, d: 0.174 }, // est 11인치급
};

export function mountElectronics({ scene, keep, canvasTex, obstacles, prodMeshes, prodGeo, prodMat }) {
  const root = new THREE.Group(); root.name = 'depot-electronics'; scene.add(root);
  const interact = []; // { mesh, kind, onClick, label, aabb? }
  const tickers = [];
  const tvHits = []; // AABB that trigger screen flicker when the cart rams them
  const m4 = new THREE.Matrix4(), pv = new THREE.Vector3(), q0 = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
  const Y3 = new THREE.Vector3(0, 1, 0);

  const addObs = (x0, x1, z0, z1, flicker = false) => {
    const o = { x0, x1, z0, z1 };
    obstacles.push(o);
    if (flicker) tvHits.push(o);
    return o;
  };
  const box = (sx, sy, sz, mat) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(sx, sy, sz)), mat);
    root.add(m); return m;
  };

  // ---------- 재질 ----------
  const wallM = keep(new THREE.MeshLambertMaterial({ color: 0x1a1d22 }));
  const steelM = keep(new THREE.MeshLambertMaterial({ color: 0xc5c8cc }));
  const steelDarkM = keep(new THREE.MeshLambertMaterial({ color: 0x8a9096 }));
  const beigeM = keep(new THREE.MeshLambertMaterial({ color: 0xd9cbb6 }));
  const creamM = keep(new THREE.MeshLambertMaterial({ color: 0xe8ddd0 }));
  const blackM = keep(new THREE.MeshLambertMaterial({ color: 0x1a1d22 }));
  const greenM = keep(new THREE.MeshLambertMaterial({ color: 0x1e5a45 }));
  const kraftM = keep(new THREE.MeshLambertMaterial({ color: 0xc8965a }));
  const woodM = keep(new THREE.MeshLambertMaterial({ color: 0x8a6a44 }));
  const glassM = keep(new THREE.MeshLambertMaterial({ color: 0x9eb8c8, transparent: true, opacity: 0.45 }));
  const chromeM = keep(new THREE.MeshLambertMaterial({ color: 0xdfe3e6 }));
  const meshM = keep(new THREE.MeshLambertMaterial({ color: 0x4a5a6a }));
  const yellowM = keep(new THREE.MeshBasicMaterial({ color: 0xf2c230 }));
  const creamBasic = keep(new THREE.MeshBasicMaterial({ color: 0xf3eada }));

  // ---------- 공유 화면 텍스처 (TV 전부 하나, 노트북/태블릿은 데스크톱 하나) ----------
  const tvC = document.createElement('canvas'); tvC.width = 512; tvC.height = 288;
  const tvG = tvC.getContext('2d');
  const tvTex = keep(new THREE.CanvasTexture(tvC)); tvTex.colorSpace = THREE.SRGBColorSpace; tvTex.anisotropy = 2; tvTex.minFilter = THREE.LinearFilter;
  const tvScreenM = keep(new THREE.MeshBasicMaterial({ map: tvTex }));
  const lapC = document.createElement('canvas'); lapC.width = 512; lapC.height = 320;
  const lapG = lapC.getContext('2d');
  const lapTex = keep(new THREE.CanvasTexture(lapC)); lapTex.colorSpace = THREE.SRGBColorSpace; lapTex.minFilter = THREE.LinearFilter;
  const lapScreenM = keep(new THREE.MeshBasicMaterial({ map: lapTex }));
  drawLaptopDesktop(lapG, 512, 320, 0); lapTex.needsUpdate = true;

  let tvT = 0, flickerT = 0, frameN = 0, lod = 0;
  function drawTvFrame(t, flick) {
    const g = tvG, W = 512, H = 288;
    if (flick > 0) {
      const k = flick > 0.35 ? 1 : flick / 0.35;
      if (Math.random() < 0.55 * k) { g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, W, H); }
      else {
        for (let y = 0; y < H; y += 4) {
          g.fillStyle = Math.random() < 0.3 ? '#e8e8e8' : `rgb(${40 + Math.random() * 200 | 0},${40 + Math.random() * 200 | 0},${40 + Math.random() * 200 | 0})`;
          g.fillRect(0, y, W, 4);
        }
      }
      g.fillStyle = '#F2C230'; g.font = '900 28px "Pretendard",sans-serif'; g.textAlign = 'center';
      if (Math.random() < 0.5) g.fillText('신호 없음', 256, 150);
      return;
    }
    const cycle = 24, ph = t % cycle;
    if (ph < 8) drawNature(g, W, H, t);
    else if (ph < 16) drawSports(g, W, H, t - 8);
    else drawRace(g, W, H, t - 16);
  }

  // ---------- 구역 사인 · 바닥 ----------
  const zoneTex = keep(canvasTex(1024, 256, (g) => {
    g.fillStyle = '#1E5A45'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#F2C230'; g.fillRect(0, 214, 1024, 42);
    g.fillStyle = '#F3EADA'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 110px "Pretendard","Noto Sans KR",sans-serif'; g.fillText('가전', 512, 100);
    g.fillStyle = '#123B2D'; g.font = '800 28px "Pretendard",sans-serif'; g.fillText('BUMPVISION · 범전자 체험·구매 카드', 512, 236);
  }));
  const zs = new THREE.Mesh(keep(new THREE.PlaneGeometry(8, 2)), keep(new THREE.MeshBasicMaterial({ map: zoneTex })));
  zs.position.set(83.55, 6.2, 22); zs.rotation.y = -Math.PI / 2; root.add(zs);
  const hangTex = keep(canvasTex(1024, 256, (g) => {
    g.fillStyle = '#1E5A45'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#F3EADA'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 92px "Pretendard",sans-serif'; g.fillText('가전 코너', 512, 110);
    g.font = '700 32px "Pretendard",sans-serif'; g.fillText('ELECTRONICS  ·  범비전 · 범전자', 512, 200);
  }));
  const hangM = keep(new THREE.MeshBasicMaterial({ map: hangTex, transparent: true, alphaTest: 0.5 }));
  for (const ry of [0, Math.PI]) {
    const s = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.4, 0.85)), hangM);
    s.position.set(72.5, 6.1, 14.0 + (ry ? 0.01 : 0)); s.rotation.y = ry; root.add(s);
  }
  const floorTex = keep(canvasTex(1024, 256, (g) => {
    g.clearRect(0, 0, 1024, 256);
    g.fillStyle = '#1E5A45'; g.fillRect(0, 80, 1024, 96);
    g.fillStyle = '#F3EADA'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 72px "Pretendard",sans-serif'; g.fillText('가전 코너  →', 512, 128);
  }));
  const fl = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.6, 0.9)), keep(new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
  fl.rotation.x = -Math.PI / 2; fl.position.set(72.5, 0.007, 13.15); root.add(fl);
  // 구역 노란 안전선 (입구 쪽 경계만, 통로 z≈11 은 비움)
  const lineG = keep(new THREE.PlaneGeometry(1, 0.08)); lineG.rotateX(-Math.PI / 2);
  const lines = new THREE.InstancedMesh(lineG, yellowM, 8); let li = 0;
  // 남쪽 입구 라인 x 64–83.7, z=12.55
  m4.compose(pv.set(73.85, 0.005, 12.55), q0, new THREE.Vector3(19.5, 1, 1)); lines.setMatrixAt(li++, m4);
  m4.compose(pv.set(64.15, 0.005, 26.5), new THREE.Quaternion().setFromAxisAngle(Y3, Math.PI / 2), new THREE.Vector3(28, 1, 1)); lines.setMatrixAt(li++, m4);
  lines.count = li; root.add(lines);

  // ---------- TV 월 (동쪽 벽) ----------
  const wall = box(0.28, 5.4, 16.2, wallM); wall.position.set(83.45, 2.7, 21.2);
  addObs(83.2, 83.7, 13.1, 29.3, true);
  // 선반 레일 3단
  const railG = keep(new THREE.BoxGeometry(0.12, 0.06, 16.0));
  const rails = new THREE.InstancedMesh(railG, steelDarkM, 3);
  [1.05, 2.35, 3.85].forEach((y, i) => { m4.makeTranslation(83.22, y, 21.2); rails.setMatrixAt(i, m4); });
  root.add(rails);
  // 하단 받침대
  const plinth = box(0.55, 0.12, 16.0, blackM); plinth.position.set(83.05, 0.06, 21.2);

  function addTv(sizeKey, x, y, z, face = -1) {
    const U = UNIT[sizeKey], bezel = 0.018, standH = 0.06, standD = 0.22;
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(keep(new THREE.BoxGeometry(U.w + bezel * 2, U.h + bezel * 2 + 0.04, U.d + 0.01)), blackM);
    const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(U.w, U.h)), tvScreenM);
    screen.position.z = face * (U.d / 2 + 0.008);
    const logo = new THREE.Mesh(keep(new THREE.PlaneGeometry(U.w * 0.22, 0.028)), creamBasic);
    logo.position.set(0, -(U.h / 2 + 0.012), face * (U.d / 2 + 0.009));
    const stand = new THREE.Mesh(keep(new THREE.BoxGeometry(Math.min(0.42, U.w * 0.28), standH, standD)), blackM);
    stand.position.set(0, -(U.h / 2 + bezel + 0.02 + standH / 2), 0);
    const neck = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.04, 0.04)), blackM);
    neck.position.set(0, -(U.h / 2 + bezel + 0.01), 0);
    grp.add(frame, screen, logo, stand, neck);
    grp.position.set(x, y, z);
    grp.rotation.y = face > 0 ? 0 : Math.PI;
    root.add(grp);
    return grp;
  }
  // 아래 65인치 3대, 가운데 75인치 3대, 위 85인치 2대 — 전부 서쪽(통로)을 봄
  const tv65z = [15.2, 21.2, 27.2];
  tv65z.forEach((z) => addTv('tv65', 82.95, 1.05 + UNIT.tv65.h / 2, z, -1));
  const tv75z = [15.4, 21.2, 27.0];
  tv75z.forEach((z) => addTv('tv75', 82.95, 2.42 + UNIT.tv75.h / 2, z, -1));
  [17.4, 25.0].forEach((z) => addTv('tv85', 82.95, 3.95 + UNIT.tv85.h / 2, z, -1));
  // 가격표
  function priceStand(text, sub, won, x, z, ry) {
    const t = keep(canvasTex(512, 256, (g) => {
      g.fillStyle = '#FBF7EE'; g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#1E5A45'; g.fillRect(0, 0, 512, 54);
      g.fillStyle = '#F3EADA'; g.font = '800 26px "Pretendard",sans-serif'; g.textAlign = 'left'; g.fillText('범창고 정자점', 22, 37);
      g.fillStyle = '#22262A'; g.font = '800 34px "Pretendard",sans-serif'; g.fillText(text, 22, 100);
      g.fillStyle = '#5a5f63'; g.font = '600 22px "Pretendard",sans-serif'; g.fillText(sub, 22, 134);
      g.textAlign = 'right'; g.fillStyle = '#22262A'; g.font = '800 72px "Pretendard",sans-serif'; g.fillText(won.toLocaleString('ko-KR'), 462, 222);
      g.font = '800 30px "Pretendard",sans-serif'; g.fillText('원', 498, 222);
    }));
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.55, 0.28)), keep(new THREE.MeshBasicMaterial({ map: t })));
    m.position.set(x, 1.15, z); m.rotation.y = ry; root.add(m);
    const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.012, 0.012, 1.02, 6)), meshM);
    pole.position.set(x, 0.51, z); root.add(pole);
  }
  priceStand('범비전 65', '4K 164cm · 박스 37 kg', 1290000, 82.4, 15.2, -Math.PI / 2);
  priceStand('범비전 75', '4K 189cm · 박스 52 kg', 1890000, 82.4, 21.2, -Math.PI / 2);
  priceStand('범비전 85', '4K 215cm · 박스 63 kg · 가로 2 m', 2490000, 82.4, 25.0, -Math.PI / 2);

  // ---------- 집어 갈 수 있는 박스 (파렛트) ----------
  function palletAt(x, z, sx = 1.22, sz = 1.02) {
    const pal = new THREE.Mesh(keep(new THREE.BoxGeometry(sx, 0.14, sz)), kraftM);
    pal.position.set(x, 0.07, z); root.add(pal);
    addObs(x - sx / 2, x + sx / 2, z - sz / 2, z + sz / 2, true);
  }
  function stackBoxes(id, placements) {
    const p = BY_ID[id], list = placements;
    const im = new THREE.InstancedMesh(prodGeo[id], prodMat[id], Math.max(1, list.length));
    list.forEach((it, i) => {
      m4.compose(pv.set(it.x, it.y, it.z), new THREE.Quaternion().setFromAxisAngle(Y3, it.rot || 0), s1);
      im.setMatrixAt(i, m4);
    });
    im.count = list.length; im.userData.pid = id; im.userData.list = list; im.computeBoundingSphere();
    root.add(im); prodMeshes.push(im);
    return im;
  }
  // 85인치: 파렛트 하나당 1박스, 세워서(높이 1.237). 가로 2.008 m 가 z 방향이 되게 rot=π/2 → size x는 0.228.
  // size = [2.008, 1.237, 0.228]. rotY=π/2 → 가로가 통로(z)를 따라 2 m.
  const tv85list = [];
  [16.4, 19.0, 21.6].forEach((z) => {
    const x = 78.4, rot = Math.PI / 2;
    palletAt(x, z, 0.50, 2.15);
    tv85list.push({ x, y: 0.14 + 1.237 / 2, z, rot });
  });
  stackBoxes('tv85', tv85list);
  const tv75list = [];
  [24.4, 26.8].forEach((z) => {
    const x = 78.4, rot = Math.PI / 2;
    palletAt(x, z, 0.45, 1.95);
    tv75list.push({ x, y: 0.14 + 1.118 / 2, z, rot });
  });
  stackBoxes('tv75', tv75list);
  const tv65list = [];
  [15.2, 17.4].forEach((z) => {
    const x = 76.5, rot = Math.PI / 2;
    palletAt(x, z, 0.42, 1.75);
    tv65list.push({ x, y: 0.14 + 0.997 / 2, z, rot });
  });
  stackBoxes('tv65', tv65list);
  // 냉장고·세탁기·건조기 박스 (서쪽 줄 뒤쪽, 체험 본체 옆)
  const bigBoxZ = { fridge: [14.6, 16.0], washer: [17.6], dryer: [19.0] };
  Object.entries(bigBoxZ).forEach(([id, zs]) => {
    const p = BY_ID[id], list = [];
    zs.forEach((z) => {
      const x = 67.6;
      palletAt(x, z, Math.max(1.1, p.size[0] + 0.12), Math.max(1.1, p.size[2] + 0.12));
      list.push({ x, y: 0.14 + p.size[1] / 2, z, rot: 0 });
    });
    stackBoxes(id, list);
  });

  // ---------- 문 열리는 전시 가전 (서쪽, 통로를 향해 +x) ----------
  const doorAnims = [];
  function hingeDoor(mesh, pivot, axis, openAng) {
    const st = { mesh, pivot, axis, openAng, t: 0, open: false };
    doorAnims.push(st);
    const onClick = () => { st.open = !st.open; };
    interact.push({ mesh, kind: 'door', onClick, label: '클릭 = 문 열기 / 닫기' });
    return st;
  }
  function tickDoors(dt) {
    for (const d of doorAnims) {
      d.t = THREE.MathUtils.clamp(d.t + (d.open ? dt : -dt) * 1.8, 0, 1);
      const s = d.t * d.t * (3 - 2 * d.t);
      d.mesh.rotation[d.axis] = d.openAng * s;
    }
  }

  function makeFridge(x, z, beige = false) {
    const U = UNIT.fridge, bodyM = beige ? beigeM : steelM;
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const body = new THREE.Mesh(keep(new THREE.BoxGeometry(U.d, U.h, U.w)), bodyM);
    body.position.set(0, U.h / 2, 0); g.add(body);
    // 안쪽 (문 열리면 보임)
    const inner = new THREE.Mesh(keep(new THREE.BoxGeometry(U.d - 0.08, U.h - 0.1, U.w - 0.06)), keep(new THREE.MeshLambertMaterial({ color: 0xf4f1ea })));
    inner.position.set(0.02, U.h / 2, 0); g.add(inner);
    for (let i = 0; i < 4; i++) {
      const sh = new THREE.Mesh(keep(new THREE.BoxGeometry(U.d - 0.16, 0.02, U.w - 0.12)), creamM);
      sh.position.set(0.02, 0.4 + i * 0.38, 0); g.add(sh);
    }
    const midY = U.h * 0.55, topH = U.h * 0.45, botH = U.h * 0.45;
    const doorT = 0.05, halfW = U.w / 2;
    const mkDoor = (w, h, py, pz, sign, mat) => {
      const pivot = new THREE.Group();
      pivot.position.set(U.d / 2, py, pz + sign * (w / 2));
      const door = new THREE.Mesh(keep(new THREE.BoxGeometry(doorT, h, w - 0.01)), mat);
      door.position.set(doorT / 2, 0, -sign * (w / 2));
      const hdl = new THREE.Mesh(keep(new THREE.BoxGeometry(0.03, h * 0.45, 0.02)), chromeM);
      hdl.position.set(doorT + 0.02, 0, -sign * (w * 0.15));
      pivot.add(door, hdl);
      g.add(pivot);
      hingeDoor(pivot, pivot, 'y', sign * 1.7);
    };
    mkDoor(halfW, topH - 0.02, midY + topH / 2, 0, -1, bodyM);
    mkDoor(halfW, topH - 0.02, midY + topH / 2, 0, +1, bodyM);
    mkDoor(halfW, botH - 0.02, midY - botH / 2, 0, -1, bodyM);
    mkDoor(halfW, botH - 0.02, midY - botH / 2, 0, +1, bodyM);
    root.add(g);
    addObs(x - U.d / 2, x + U.d / 2 + 0.06, z - U.w / 2, z + U.w / 2);
    return g;
  }
  function makeDrum(x, z, kind) {
    const U = UNIT[kind], bodyM = kind === 'dryer' ? creamM : steelM;
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const body = new THREE.Mesh(keep(new THREE.BoxGeometry(U.d, U.h, U.w)), bodyM);
    body.position.set(0, U.h / 2, 0); g.add(body);
    // 조작부
    const panel = new THREE.Mesh(keep(new THREE.BoxGeometry(0.02, 0.12, U.w - 0.08)), blackM);
    panel.position.set(U.d / 2 + 0.011, U.h - 0.12, 0); g.add(panel);
    const dial = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16)), chromeM);
    dial.rotation.z = Math.PI / 2; dial.position.set(U.d / 2 + 0.025, U.h - 0.12, U.w * 0.28); g.add(dial);
    // 문 (앞면, 왼쪽 힌지)
    const r = 0.27, pivot = new THREE.Group();
    pivot.position.set(U.d / 2, 0.48, -r);
    const ring = new THREE.Mesh(keep(new THREE.CylinderGeometry(r, r, 0.05, 28)), blackM);
    ring.rotation.z = Math.PI / 2; ring.position.set(0.025, 0, r);
    const win = new THREE.Mesh(keep(new THREE.CylinderGeometry(r * 0.78, r * 0.78, 0.02, 28)), glassM);
    win.rotation.z = Math.PI / 2; win.position.set(0.04, 0, r);
    const hdl = new THREE.Mesh(keep(new THREE.BoxGeometry(0.04, 0.04, 0.12)), chromeM);
    hdl.position.set(0.07, 0, r + 0.2);
    pivot.add(ring, win, hdl); g.add(pivot);
    hingeDoor(pivot, pivot, 'y', 1.85);
    // 안쪽 드럼
    const drum = new THREE.Mesh(keep(new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.4, 20, 1, true)), steelDarkM);
    drum.rotation.z = Math.PI / 2; drum.position.set(0.05, 0.48, 0); g.add(drum);
    root.add(g);
    addObs(x - U.d / 2, x + U.d / 2 + 0.06, z - U.w / 2, z + U.w / 2);
    return g;
  }
  // 전시 본체는 서쪽 벽에 붙여 통로(+x)를 봄. 박스는 그 앞(동쪽) 67.6 에 이미 두었으므로 본체는 x=65.1 근처.
  makeFridge(65.15, 14.6, false);
  makeFridge(65.15, 16.0, true);
  makeDrum(65.15, 17.6, 'washer');
  makeDrum(65.15, 19.0, 'dryer');
  priceStand('범쿨 4도어 870L', '본체 156 kg급 · 문 열어 보세요', 1890000, 66.4, 15.3, Math.PI / 2);
  priceStand('범워시 21kg / 드라이 20kg', '문 열어 보세요', 1090000, 66.4, 18.3, Math.PI / 2);

  // ---------- 소형가전 테이블 ----------
  function table(x, z, w, d, h = 0.78) {
    const top = new THREE.Mesh(keep(new THREE.BoxGeometry(w, 0.05, d)), woodM);
    top.position.set(x, h, z); root.add(top);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, h, 0.06)), woodM);
      leg.position.set(x + sx * (w / 2 - 0.08), h / 2, z + sz * (d / 2 - 0.08)); root.add(leg);
    }
    addObs(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    return h + 0.025;
  }
  const tY = table(66.6, 23.4, 2.6, 1.1, 0.78);
  // 전시 소형 (픽 아님) + 옆 박스는 픽
  function applianceOnTable(kind, x, z, y) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    if (kind === 'micro') {
      const U = UNIT.micro;
      g.add(new THREE.Mesh(keep(new THREE.BoxGeometry(U.w, U.h, U.d)), blackM));
      const win = new THREE.Mesh(keep(new THREE.BoxGeometry(U.w * 0.5, U.h * 0.62, 0.01)), glassM);
      win.position.set(-U.w * 0.12, 0, U.d / 2 + 0.006); g.add(win);
      const pan = new THREE.Mesh(keep(new THREE.BoxGeometry(U.w * 0.22, U.h * 0.7, 0.01)), blackM);
      pan.position.set(U.w * 0.32, 0, U.d / 2 + 0.006); g.add(pan);
    } else if (kind === 'fryer') {
      const U = UNIT.fryer;
      const body = new THREE.Mesh(keep(new THREE.BoxGeometry(U.w, U.h * 0.7, U.d)), blackM);
      body.position.y = U.h * 0.15; g.add(body);
      const basket = new THREE.Mesh(keep(new THREE.BoxGeometry(U.w * 0.7, U.h * 0.45, U.d * 0.55)), steelDarkM);
      basket.position.set(0, U.h * 0.1, U.d * 0.05); g.add(basket);
      const hdl = new THREE.Mesh(keep(new THREE.BoxGeometry(0.04, 0.04, 0.12)), chromeM);
      hdl.position.set(0, U.h * 0.15, U.d / 2 + 0.04); g.add(hdl);
    } else if (kind === 'cooker') {
      const U = UNIT.cooker;
      const pot = new THREE.Mesh(keep(new THREE.CylinderGeometry(U.w / 2, U.w / 2 * 0.95, U.h * 0.7, 20)), chromeM);
      pot.position.y = U.h * 0.15; g.add(pot);
      const lid = new THREE.Mesh(keep(new THREE.SphereGeometry(U.w / 2 * 0.95, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), chromeM);
      lid.position.y = U.h * 0.48; g.add(lid);
      const kn = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8)), blackM);
      kn.position.y = U.h * 0.72; g.add(kn);
    } else if (kind === 'vac') {
      const U = UNIT.vac;
      const disc = new THREE.Mesh(keep(new THREE.CylinderGeometry(U.r, U.r, U.h, 24)), blackM);
      disc.position.y = U.h / 2; g.add(disc);
      const bump = new THREE.Mesh(keep(new THREE.SphereGeometry(U.r * 0.35, 12, 8)), steelDarkM);
      bump.position.set(0, U.h * 0.7, U.r * 0.15); g.add(bump);
    }
    root.add(g);
  }
  applianceOnTable('micro', 65.7, 23.4, tY + UNIT.micro.h / 2);
  applianceOnTable('fryer', 66.3, 23.4, tY + UNIT.fryer.h / 2);
  applianceOnTable('cooker', 66.9, 23.4, tY + UNIT.cooker.h / 2);
  applianceOnTable('vac', 67.5, 23.4, tY);
  // 픽 가능한 소형 박스: 같은 테이블 앞쪽 선반(낮은 단) + 옆 파렛트
  const lowY = table(66.6, 24.7, 2.6, 0.7, 0.45);
  const smallIds = ['micro', 'fryer', 'cooker', 'vac'];
  const smallList = { micro: [], fryer: [], cooker: [], vac: [] };
  smallIds.forEach((id, i) => {
    const p = BY_ID[id], x = 65.6 + i * 0.65;
    smallList[id].push({ x, y: lowY + p.size[1] / 2, z: 24.7, rot: 0 });
  });
  // 여분 박스 파렛트
  palletAt(66.6, 26.2, 1.22, 1.02);
  smallIds.forEach((id, i) => {
    const p = BY_ID[id];
    const col = i % 2, row = (i / 2) | 0;
    const x = 66.25 + col * 0.7, z = 25.95 + row * 0.5;
    smallList[id].push({ x, y: 0.14 + p.size[1] / 2, z, rot: 0 });
  });
  smallIds.forEach((id) => stackBoxes(id, smallList[id]));
  priceStand('소형가전', '에어프라이어·밥솥·레인지·로봇', 89000, 68.3, 23.4, Math.PI / 2);

  // ---------- 노트북·태블릿 체험 테이블 (동쪽, TV 월 북쪽) ----------
  const lY = table(79.2, 32.4, 3.6, 1.2, 0.76);
  function openLaptop(x, z, y, yaw) {
    const U = UNIT.laptop, g = new THREE.Group();
    const base = new THREE.Mesh(keep(new THREE.BoxGeometry(U.w, U.h, U.d)), blackM);
    base.position.y = U.h / 2;
    const lid = new THREE.Group(); lid.position.set(0, U.h, -U.d / 2);
    const lidBody = new THREE.Mesh(keep(new THREE.BoxGeometry(U.w, U.h, U.d)), blackM);
    lidBody.position.set(0, U.d / 2, 0); lidBody.rotation.x = Math.PI / 2;
    const scr = new THREE.Mesh(keep(new THREE.PlaneGeometry(U.w * 0.94, U.d * 0.88)), lapScreenM);
    scr.position.set(0, U.d / 2, U.h / 2 + 0.002); scr.rotation.x = Math.PI / 2;
    lid.add(lidBody, scr); lid.rotation.x = -1.05;
    g.add(base, lid); g.position.set(x, y, z); g.rotation.y = yaw; root.add(g);
  }
  function openTablet(x, z, y, yaw) {
    const U = UNIT.tablet, g = new THREE.Group();
    const body = new THREE.Mesh(keep(new THREE.BoxGeometry(U.w, U.h, U.d)), blackM);
    const scr = new THREE.Mesh(keep(new THREE.PlaneGeometry(U.w * 0.92, U.d * 0.9)), lapScreenM);
    scr.position.y = U.h / 2 + 0.002; scr.rotation.x = -Math.PI / 2;
    // 스탠드에 세워 둔 각도
    g.add(body, scr); g.position.set(x, y + 0.08, z); g.rotation.set(-0.55, yaw, 0); root.add(g);
  }
  [-1.3, 0, 1.3].forEach((dx, i) => openLaptop(79.2 + dx, 32.55, lY, i === 2 ? 0.15 : 0));
  [-0.7, 0.7].forEach((dx) => openTablet(79.2 + dx, 32.15, lY, 0));
  // 픽 가능한 노트북 박스 (테이블 아래 선반 + 옆)
  const lapBoxY = table(79.2, 33.7, 2.2, 0.7, 0.45);
  const lapList = [], headList = [];
  [-0.6, 0, 0.6].forEach((dx) => {
    const p = BY_ID.laptop;
    lapList.push({ x: 79.2 + dx, y: lapBoxY + p.size[1] / 2, z: 33.7, rot: 0 });
  });
  stackBoxes('laptop', lapList);
  priceStand('범북 16 / 태블릿', '화면 켜 둔 체험기 · 박스는 계산', 1490000, 81.4, 32.4, -Math.PI / 2);

  // ---------- 오디오 코너 ----------
  const aY = table(66.6, 32.4, 2.4, 1.1, 0.78);
  function headphones(x, z, y) {
    const g = new THREE.Group();
    const band = new THREE.Mesh(keep(new THREE.TorusGeometry(0.09, 0.012, 8, 16, Math.PI)), blackM);
    band.rotation.z = Math.PI; band.position.y = 0.12;
    const cL = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04, 0.045, 0.04, 14)), blackM);
    const cR = cL.clone(); cL.rotation.z = Math.PI / 2; cR.rotation.z = -Math.PI / 2;
    cL.position.set(-0.09, 0.05, 0); cR.position.set(0.09, 0.05, 0);
    g.add(band, cL, cR); g.position.set(x, y, z); root.add(g);
  }
  function speaker(x, z, y, h = 0.32) {
    const b = new THREE.Mesh(keep(new THREE.BoxGeometry(0.18, h, 0.2)), blackM);
    b.position.set(x, y + h / 2, z); root.add(b);
    const c = new THREE.Mesh(keep(new THREE.CircleGeometry(0.055, 16)), steelDarkM);
    c.position.set(x, y + h * 0.6, z + 0.102); root.add(c);
  }
  [-0.7, 0, 0.7].forEach((dx) => headphones(66.6 + dx, 32.35, aY));
  speaker(65.7, 32.7, aY, 0.28); speaker(67.5, 32.7, aY, 0.36);
  const hsList = [];
  [-0.5, 0.5].forEach((dx) => hsList.push({ x: 66.6 + dx, y: aY + BY_ID.headset.size[1] / 2 + 0.002, z: 32.7, rot: 0 }));
  // 박스 파렛트
  palletAt(66.6, 34.2, 1.22, 1.02);
  for (let i = 0; i < 6; i++) {
    const p = BY_ID.headset, col = i % 3, row = (i / 3) | 0;
    hsList.push({ x: 66.15 + col * 0.28, y: 0.14 + p.size[1] / 2 + row * p.size[1], z: 34.2, rot: 0 });
  }
  stackBoxes('headset', hsList);
  priceStand('범음 헤드폰', '오버이어 · 들어보세요(체험)', 199000, 68.15, 32.4, Math.PI / 2);

  // ---------- 고가 케이지 + 구매 카드 ----------
  const CX = 66.8, CZ = 38.0, CW = 4.4, CD = 3.2, CH = 2.4;
  // 바닥 플린스 + 철망 벽 (앞면은 허리 높이 카운터 + 위 철망, 출입 잠김)
  const cageFloor = new THREE.Mesh(keep(new THREE.BoxGeometry(CW, 0.08, CD)), meshM);
  cageFloor.position.set(CX, 0.04, CZ); root.add(cageFloor);
  const barG = keep(new THREE.BoxGeometry(0.02, CH, 0.02));
  const nBarW = 18, nBarD = 12, nBar = 96;
  const bars = new THREE.InstancedMesh(barG, meshM, nBar); let bi = 0;
  for (let i = 0; i <= nBarW; i++) {
    const x = CX - CW / 2 + (CW * i) / nBarW;
    m4.makeTranslation(x, CH / 2, CZ - CD / 2); bars.setMatrixAt(bi++, m4);
    m4.makeTranslation(x, CH / 2, CZ + CD / 2); bars.setMatrixAt(bi++, m4);
  }
  for (let i = 0; i <= nBarD; i++) {
    const z = CZ - CD / 2 + (CD * i) / nBarD;
    m4.makeTranslation(CX - CW / 2, CH / 2, z); bars.setMatrixAt(bi++, m4);
    // 앞면(+x, 통로 쪽)은 카운터 위만 철망 (아래는 카운터)
    if (i > 0 && i < nBarD) { m4.compose(pv.set(CX + CW / 2, 1.55 + 0.85 / 2, z), q0, new THREE.Vector3(1, 0.85 / CH, 1)); bars.setMatrixAt(bi++, m4); }
    else { m4.makeTranslation(CX + CW / 2, CH / 2, z); bars.setMatrixAt(bi++, m4); }
  }
  bars.count = bi; root.add(bars);
  // 가로 프레임
  const frameM = meshM;
  for (const y of [0.08, 1.15, CH]) {
    for (const [sx, sz, sw, sd] of [[0, -CD / 2, CW, 0.04], [0, CD / 2, CW, 0.04], [-CW / 2, 0, 0.04, CD], [CW / 2, 0, 0.04, CD]]) {
      const f = new THREE.Mesh(keep(new THREE.BoxGeometry(Math.max(sw, 0.04), 0.04, Math.max(sd, 0.04))), frameM);
      f.position.set(CX + sx, y, CZ + sz); root.add(f);
    }
  }
  const counter = new THREE.Mesh(keep(new THREE.BoxGeometry(0.35, 1.15, CD - 0.1)), meshM);
  counter.position.set(CX + CW / 2 - 0.05, 0.575, CZ); root.add(counter);
  addObs(CX - CW / 2, CX + CW / 2, CZ - CD / 2, CZ + CD / 2);
  const cageSign = keep(canvasTex(1024, 256, (g) => {
    g.fillStyle = '#1E5A45'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#F2C230'; g.fillRect(0, 0, 16, 256); g.fillRect(1008, 0, 16, 256);
    g.fillStyle = '#F3EADA'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 72px "Pretendard",sans-serif'; g.fillText('고가 상품 케이지', 512, 90);
    g.font = '700 32px "Pretendard",sans-serif'; g.fillText('구매 카드를 뽑아 계산대로 가세요  ·  잠김', 512, 180);
  }));
  const cgs = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.6, 0.65)), keep(new THREE.MeshBasicMaterial({ map: cageSign })));
  cgs.position.set(CX + CW / 2 + 0.03, 2.05, CZ); cgs.rotation.y = Math.PI / 2; root.add(cgs);
  // 케이지 안 전시 (픽 불가) — 노트북·콘솔·헤드폰
  openLaptop(CX - 0.8, CZ - 0.4, 1.16, Math.PI / 2);
  table(CX - 0.2, CZ + 0.3, 1.6, 0.7, 1.1);
  // 콘솔 본체 모양 (패러디, 납작한 상자 + 슬림 슬롯)
  {
    const c = new THREE.Mesh(keep(new THREE.BoxGeometry(0.104, 0.39, 0.26)), blackM);
    c.position.set(CX + 0.3, 1.1 + 0.195, CZ + 0.3); root.add(c);
    const slot = new THREE.Mesh(keep(new THREE.BoxGeometry(0.02, 0.28, 0.02)), creamBasic);
    slot.position.set(CX + 0.3 + 0.054, 1.1 + 0.2, CZ + 0.3); root.add(slot);
  }
  headphones(CX - 0.6, CZ + 0.3, 1.16);
  // 구매 카드: 카운터 위에 걸어 둔 행택 (픽 가능)
  const ticketTex = {};
  function ticketMat(p) {
    if (ticketTex[p.id]) return ticketTex[p.id];
    const t = keep(canvasTex(512, 768, (g) => {
      g.fillStyle = '#1E5A45'; g.fillRect(0, 0, 512, 768);
      g.fillStyle = '#F3EADA'; g.fillRect(16, 16, 480, 736);
      g.fillStyle = '#1E5A45'; g.fillRect(16, 16, 480, 90);
      g.fillStyle = '#F2C230'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 48px "Pretendard",sans-serif'; g.fillText('구매 카드', 256, 62);
      g.fillStyle = '#123B2D'; g.font = '900 44px "Pretendard",sans-serif'; g.fillText(p.name.replace('구매 카드 ', ''), 256, 200);
      g.font = '700 28px "Pretendard",sans-serif'; g.fillText('범창고 정자점', 256, 260);
      g.fillStyle = '#D9442E'; g.font = '900 52px "Pretendard",sans-serif'; g.fillText(p.price.toLocaleString('ko-KR') + '원', 256, 360);
      g.fillStyle = '#22262A'; g.font = '700 24px "Pretendard",sans-serif'; g.fillText('이 카드를 계산대에 주세요', 256, 430);
      g.fillText('본품은 직원이 찾아 드립니다', 256, 470);
      for (let i = 0; i < 28; i++) { g.fillRect(80 + i * 12, 540, (i * 5) % 4 + 2, 90); }
      g.font = '600 20px "Pretendard",sans-serif'; g.fillText('TICKET  ·  BUMP DEPOT', 256, 690);
    }));
    ticketTex[p.id] = keep(new THREE.MeshLambertMaterial({ map: t }));
    return ticketTex[p.id];
  }
  const ticketIds = ['ticket_tv85', 'ticket_laptop', 'ticket_console'];
  ticketIds.forEach((id, i) => {
    const p = BY_ID[id], list = [];
    // 카운터 위 3장씩
    for (let k = 0; k < 3; k++) {
      const z = CZ - 0.85 + i * 0.85, x = CX + CW / 2 - 0.18 - k * 0.02;
      list.push({ x, y: 1.16 + p.size[1] / 2 + k * 0.01, z, rot: Math.PI / 2 });
    }
    const geo = prodGeo[id];
    const im = new THREE.InstancedMesh(geo, ticketMat(p), list.length);
    list.forEach((it, n) => { m4.compose(pv.set(it.x, it.y, it.z), new THREE.Quaternion().setFromAxisAngle(Y3, it.rot), s1); im.setMatrixAt(n, m4); });
    im.count = list.length; im.userData.pid = id; im.userData.list = list; im.computeBoundingSphere();
    root.add(im); prodMeshes.push(im);
  });
  // 콘솔 박스 파렛트 (케이지 밖, 동쪽)
  palletAt(79.2, 37.8, 1.22, 1.02);
  const consList = [];
  for (let i = 0; i < 4; i++) {
    const p = BY_ID.console, col = i % 2, row = (i / 2) | 0;
    consList.push({ x: 78.8 + col * 0.55, y: 0.14 + p.size[1] / 2 + row * p.size[1], z: 37.8, rot: 0 });
  }
  stackBoxes('console', consList);

  // ---------- 체험 직원 (가벼움, 경로 찾기 없음) ----------
  const staffRoot = new THREE.Group();
  {
    const skin = keep(new THREE.MeshLambertMaterial({ color: 0xf0c9a0 }));
    const shirt = keep(new THREE.MeshLambertMaterial({ color: 0xf3eada }));
    const pants = keep(new THREE.MeshLambertMaterial({ color: 0x2a3340 }));
    const legG = keep(new THREE.BoxGeometry(0.14, 0.82, 0.16)); legG.translate(0, -0.41, 0);
    const legL = new THREE.Mesh(legG, pants), legR = new THREE.Mesh(legG, pants);
    legL.position.set(-0.1, 0.84, 0); legR.position.set(0.1, 0.84, 0);
    const torso = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.2, 0.22, 0.62, 10)), shirt); torso.position.y = 1.15;
    const apronTex = keep(canvasTex(256, 320, (g) => {
      g.fillStyle = '#1E5A45'; g.fillRect(0, 0, 256, 320);
      g.fillStyle = '#F3EADA'; g.textAlign = 'center';
      g.font = '900 48px "Pretendard",sans-serif'; g.fillText('가전', 128, 110);
      g.font = '700 22px "Pretendard",sans-serif'; g.fillText('BUMPVISION', 128, 150);
      g.fillStyle = '#C8965A'; g.fillRect(40, 196, 176, 6);
      g.fillStyle = '#F3EADA'; g.font = '800 24px "Pretendard",sans-serif'; g.fillText('직원 범숙', 128, 250);
    }));
    const apron = new THREE.Mesh(keep(new THREE.BoxGeometry(0.36, 0.78, 0.02)), [greenM, greenM, greenM, greenM, keep(new THREE.MeshLambertMaterial({ map: apronTex })), greenM]);
    apron.position.set(0, 1.06, 0.215);
    const armG = keep(new THREE.BoxGeometry(0.1, 0.6, 0.12)); armG.translate(0, -0.3, 0);
    const armL = new THREE.Mesh(armG, shirt), armR = new THREE.Mesh(armG, shirt);
    armL.position.set(-0.27, 1.43, 0); armR.position.set(0.27, 1.43, 0);
    const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.15, 14, 10)), skin); head.position.y = 1.62;
    const cap = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.155, 0.16, 0.08, 14)), greenM); cap.position.y = 1.72;
    const brim = new THREE.Mesh(keep(new THREE.BoxGeometry(0.22, 0.015, 0.12)), greenM); brim.position.set(0, 1.69, 0.16);
    staffRoot.add(legL, legR, torso, apron, armL, armR, head, cap, brim);
    staffRoot.userData = { legL, legR, armL, armR, ph: 0 };
  }
  staffRoot.position.set(72.2, 0, 13.9); staffRoot.rotation.y = 0; root.add(staffRoot);
  const LINES = [
    '85인치는 카트에 가로로 눕혀 보세요~',
    '고가 상품은 구매 카드를 뽑아 계산대로 가시면 됩니다',
    '냉장고·세탁기 문은 열어 보셔도 돼요 (체험용)',
    '박스 무게 조심하세요, 85인치가 63 kg이에요',
    '카트로 TV를 받으면 화면이 깜빡깜빡해요 ^^;',
  ];
  let lineI = 0, lineT = 2.5, bubbleT = 0, bubbleText = '';
  const bubble = document.createElement('div');
  bubble.className = 'dh-elec-bubble';
  bubble.style.cssText = 'position:absolute;transform:translate(-50%,-100%);background:#fff;color:#13203d;border:3px solid #1E5A45;border-radius:16px;padding:8px 14px;font-size:14px;font-weight:800;white-space:nowrap;display:none;box-shadow:0 6px 18px rgba(0,0,0,.25);pointer-events:none;z-index:57';
  const elecCss = document.createElement('style');
  elecCss.textContent = `#depot-hud .dh-elec-bubble:after{content:'';position:absolute;left:50%;bottom:-12px;margin-left:-9px;border:9px solid transparent;border-top-color:#1E5A45;border-bottom:0}`;
  document.head.appendChild(elecCss);
  // HUD 가 생긴 뒤에 붙이도록 지연. tick 에서 parent 확인.
  interact.push({ mesh: staffRoot, kind: 'staff', onClick: () => { lineI = (lineI + 1) % LINES.length; bubbleText = LINES[lineI]; bubbleT = 4.5; }, label: '클릭 = 가전 직원에게 물어보기' });

  // ---------- LOD ----------
  const detailNodes = [];
  root.traverse((o) => { if (o.userData && o.userData.lodDetail) detailNodes.push(o); });
  // 문은 멀리서도 보이되, 안쪽 선반만 숨기진 않음. 화면 업데이트 주기만 조절.

  // ---------- API ----------
  const rayTmp = new THREE.Raycaster();
  function hitInteract(ray) {
    const meshes = interact.map((it) => it.mesh);
    const hits = ray.intersectObjects(meshes, true);
    if (!hits.length) return null;
    const obj = hits[0].object;
    let cur = obj;
    while (cur && cur !== root) {
      const it = interact.find((a) => a.mesh === cur);
      if (it) return { it, dist: hits[0].distance };
      cur = cur.parent;
    }
    return null;
  }
  function probe(ray) {
    const h = hitInteract(ray);
    if (h && h.dist < 4.5) return { label: h.it.label, kind: h.it.kind };
    return null;
  }
  function handleClick(ray) {
    const h = hitInteract(ray);
    if (!h || h.dist > 4.5) return false;
    h.it.onClick?.();
    return true;
  }
  function nearTv(cx, cz) {
    for (const o of tvHits) {
      const px = Math.max(o.x0, Math.min(cx, o.x1)), pz = Math.max(o.z0, Math.min(cz, o.z1));
      if (Math.hypot(cx - px, cz - pz) < 1.15) return true;
    }
    return false;
  }

  function tick(dt, { camera, me, cart, shock = 0, hud } = {}) {
    frameN++;
    tvT += dt;
    const sp = cart ? Math.hypot(cart.vx || 0, cart.vz || 0) : 0;
    if (cart && (shock > 0.3 || sp > 0.9) && nearTv(cart.x, cart.z)) flickerT = Math.max(flickerT, 0.55 + Math.min(0.5, shock || sp * 0.2));
    if (flickerT > 0) flickerT -= dt;
    const dist = camera ? Math.hypot(camera.position.x - 74, camera.position.z - 26) : 10;
    lod = dist > 32 ? 2 : dist > 18 ? 1 : 0;
    const every = lod === 0 ? 2 : lod === 1 ? 3 : 6;
    if (frameN % every === 0) { drawTvFrame(tvT, flickerT); tvTex.needsUpdate = true; }
    if (frameN % 30 === 0) { drawLaptopDesktop(lapG, 512, 320, tvT); lapTex.needsUpdate = true; }
    tickDoors(dt);
    // 직원: 가까이 오면 플레이어를 보고 가끔 말함
    if (me) {
      const d = Math.hypot(me.x - staffRoot.position.x, me.z - staffRoot.position.z);
      if (d < 8) staffRoot.rotation.y = Math.atan2(me.x - staffRoot.position.x, me.z - staffRoot.position.z);
      lineT -= dt;
      if (d < 5 && lineT <= 0) { bubbleText = LINES[lineI % LINES.length]; lineI++; bubbleT = 4.2; lineT = 11; }
      if (d > 8) { bubbleT = Math.min(bubbleT, 0.2); }
    }
    const u = staffRoot.userData;
    u.ph += dt * (me && Math.hypot(me.x - staffRoot.position.x, me.z - staffRoot.position.z) < 5 ? 0.3 : 0);
    const sw = Math.sin(tvT * 2) * 0.04;
    u.armL.rotation.x = -0.15 + sw; u.armR.rotation.x = -0.15 - sw;
    if (bubbleT > 0) {
      bubbleT -= dt;
      if (!bubble.parentNode && hud) hud.appendChild(bubble);
      if (camera && bubble.parentNode) {
        const v = new THREE.Vector3(staffRoot.position.x, 2.05, staffRoot.position.z).project(camera);
        const show = bubbleT > 0 && v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
        bubble.style.display = show ? 'block' : 'none';
        bubble.textContent = bubbleText;
        if (show) {
          bubble.style.left = `${Math.max(8, Math.min(innerWidth - 8, (v.x + 1) / 2 * innerWidth))}px`;
          bubble.style.top = `${Math.max(40, (1 - v.y) / 2 * innerHeight)}px`;
        }
      }
    } else if (bubble.parentNode) bubble.style.display = 'none';
  }

  function metrics() {
    let tris = 0, meshes = 0, instanced = 0, instCount = 0;
    root.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        const n = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
        const c = o.isInstancedMesh ? o.count : 1;
        tris += n * c;
        if (o.isInstancedMesh) { instanced++; instCount += o.count; }
      }
    });
    return { zone: 'electronics', meshes, instanced, instCount, tris: Math.round(tris), lod, flickerT: +flickerT.toFixed(2) };
  }

  function openAllDoors(v = true) { for (const d of doorAnims) d.open = v; }
  function dispose() {
    bubble.remove(); elecCss.remove();
    scene.remove(root);
    // geometry/material 은 interior keep + scene.traverse dispose 가 처리
  }

  return {
    root, zone: ELEC_ZONE, tick, probe, handleClick, metrics, openAllDoors, dispose,
    staffRoot, tvHits,
    _dbg: { openAllDoors, flicker: (t = 0.7) => { flickerT = t; }, metrics },
  };
}

function drawNature(g, W, H, t) {
  const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#6ec4f5'); sky.addColorStop(1, '#e8f3c8');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const sunX = 80 + Math.sin(t * 0.15) * 20, sunY = 50;
  g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(sunX, sunY, 28, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < 4; i++) {
    const cx = ((t * 18 + i * 160) % (W + 120)) - 60, cy = 36 + (i % 3) * 22;
    g.beginPath(); g.ellipse(cx, cy, 46, 16, 0, 0, 7); g.ellipse(cx + 30, cy + 4, 36, 14, 0, 0, 7); g.fill();
  }
  g.fillStyle = '#3d8c4a'; g.beginPath(); g.moveTo(0, H * 0.62); g.quadraticCurveTo(180, H * 0.42, 360, H * 0.6); g.lineTo(W, H * 0.58); g.lineTo(W, H); g.lineTo(0, H); g.fill();
  g.fillStyle = '#2f6e3c'; g.beginPath(); g.moveTo(80, H * 0.64); g.quadraticCurveTo(300, H * 0.48, W, H * 0.66); g.lineTo(W, H); g.lineTo(80, H); g.fill();
  const wat = g.createLinearGradient(0, H * 0.72, 0, H);
  wat.addColorStop(0, '#3aa0c8'); wat.addColorStop(1, '#1b5f86');
  g.fillStyle = wat; g.fillRect(0, H * 0.72, W, H * 0.28);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
  for (let i = 0; i < 6; i++) { const y = H * 0.76 + i * 10 + Math.sin(t * 2 + i) * 2; g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(W / 2, y + 4, W, y); g.stroke(); }
  g.fillStyle = '#123B2D'; g.font = '900 22px "Pretendard",sans-serif'; g.textAlign = 'left'; g.fillText('BUMPVISION  ·  남산 아침', 16, H - 14);
}
function drawSports(g, W, H, t) {
  g.fillStyle = '#1b5e2a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2e8a3e'; g.fillRect(0, 36, W, H - 36);
  g.strokeStyle = '#f4f4f4'; g.lineWidth = 3;
  g.strokeRect(40, 56, W - 80, H - 92);
  g.beginPath(); g.moveTo(W / 2, 56); g.lineTo(W / 2, H - 36); g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2 + 10, 36, 0, 7); g.stroke();
  const bx = W / 2 + Math.sin(t * 1.3) * 140, by = H / 2 + 10 + Math.cos(t * 1.7) * 50;
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(bx + 4, by + 8, 10, 5, 0, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, 9, 0, 7); g.fill();
  g.fillStyle = '#1E5A45'; g.fillRect(0, 0, W, 36);
  g.fillStyle = '#F2C230'; g.font = '900 22px "Pretendard",sans-serif'; g.textAlign = 'center';
  g.fillText('범FC  2 — 1  한강FC', W / 2, 26);
  g.fillStyle = 'rgba(0,0,0,.2)';
  for (let i = 0; i < 40; i++) g.fillRect(20 + (i * 47) % (W - 40), H - 28, 8, 16);
}
function drawRace(g, W, H, t) {
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#12203a'); grd.addColorStop(1, '#1E5A45');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // 단순 트랙
  g.strokeStyle = '#3d4d66'; g.lineWidth = 46; g.beginPath();
  g.moveTo(40, H - 40); g.bezierCurveTo(80, 40, W - 80, 40, W - 40, H - 40); g.stroke();
  g.strokeStyle = '#F2C230'; g.lineWidth = 2; g.setLineDash([12, 10]);
  g.beginPath(); g.moveTo(40, H - 40); g.bezierCurveTo(80, 40, W - 80, 40, W - 40, H - 40); g.stroke(); g.setLineDash([]);
  const u = (t * 0.12) % 1, pt = racePt(u, W, H);
  g.fillStyle = '#F2C230'; g.save(); g.translate(pt.x, pt.y); g.rotate(pt.a);
  g.fillRect(-14, -8, 28, 16); g.fillStyle = '#1E5A45'; g.fillRect(6, -8, 8, 16); g.restore();
  g.fillStyle = '#F3EADA'; g.font = '900 26px "Pretendard",sans-serif'; g.textAlign = 'left';
  g.fillText('범레이스  DEMO', 16, 32);
  g.font = '700 16px "Pretendard",sans-serif'; g.fillText('BUMPVISION', 16, 54);
}
function racePt(u, W, H) {
  const x0 = 40, y0 = H - 40, x1 = 80, y1 = 40, x2 = W - 80, y2 = 40, x3 = W - 40, y3 = H - 40;
  const s = 1 - u, x = s * s * s * x0 + 3 * s * s * u * x1 + 3 * s * u * u * x2 + u * u * u * x3;
  const y = s * s * s * y0 + 3 * s * s * u * y1 + 3 * s * u * u * y2 + u * u * u * y3;
  const u2 = Math.min(1, u + 0.02), s2 = 1 - u2;
  const xB = s2 * s2 * s2 * x0 + 3 * s2 * s2 * u2 * x1 + 3 * s2 * u2 * u2 * x2 + u2 * u2 * u2 * x3;
  const yB = s2 * s2 * s2 * y0 + 3 * s2 * s2 * u2 * y1 + 3 * s2 * u2 * u2 * y2 + u2 * u2 * u2 * y3;
  return { x, y, a: Math.atan2(yB - y, xB - x) };
}
function drawLaptopDesktop(g, W, H, t) {
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1E5A45'); sky.addColorStop(1, '#C8965A');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(243,234,218,.15)'; g.beginPath(); g.arc(W * 0.7, H * 0.3, 80, 0, 7); g.fill();
  g.fillStyle = '#F3EADA'; g.font = '900 28px "Pretendard",sans-serif'; g.textAlign = 'left';
  g.fillText('범OS', 24, 48);
  g.font = '700 16px "Pretendard",sans-serif'; g.fillText('범북 16  ·  체험용', 24, 72);
  const icons = ['폴더', '장보기', '사진', '설정'];
  icons.forEach((name, i) => {
    const x = 28, y = 100 + i * 48;
    g.fillStyle = 'rgba(243,234,218,.92)'; g.fillRect(x, y, 36, 28);
    g.fillStyle = '#1E5A45'; g.font = '800 14px "Pretendard",sans-serif'; g.fillText(name, x + 44, y + 20);
  });
  g.fillStyle = 'rgba(18,59,45,.92)'; g.fillRect(0, H - 28, W, 28);
  g.fillStyle = '#F3EADA'; g.font = '700 14px "Pretendard",sans-serif'; g.textAlign = 'left'; g.fillText('범', 12, H - 10);
  g.textAlign = 'right';
  const d = new Date(2026, 10, 12, 10, (t * 4 | 0) % 60);
  g.fillText(`${String(10).padStart(2, '0')}:${String((t * 4 | 0) % 60).padStart(2, '0')}`, W - 12, H - 10);
}
