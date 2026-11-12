// [depot] 산업용 천장 — 트러스·덕트·채광창·하이베이 조명. 실제 라이트는 반구+방향 2개만.
//   흰 천장이 날아가 보이던 것을, 어두운 강판과 구운 그라데이션으로 고대비를 낸다.
import * as THREE from 'three';

const W = 84, D = 120, CEIL = 9;

function makeEnvMap(renderer) {
  // 아주 작은 그라데이션 큐브맵 → PMREM. 라이트 프로브 대신 값싼 환경광.
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const sc = new THREE.Scene();
  const mats = [];
  const faces = [
    ['#c8d0d8', '#8a8580'], ['#c8d0d8', '#8a8580'],
    ['#e8eef4', '#c8d0d8'], // +Y 하늘(채광창) 쪽
    ['#6a645c', '#4a453e'], // -Y 바닥 반사
    ['#c8d0d8', '#8a8580'], ['#c8d0d8', '#8a8580'],
  ];
  for (const [a, b] of faces) {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const cg = cv.getContext('2d');
    const lg = cg.createLinearGradient(0, 0, 0, 64);
    lg.addColorStop(0, a); lg.addColorStop(1, b);
    cg.fillStyle = lg; cg.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    mats.push(new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide }));
  }
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mats);
  sc.add(box);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(sc, 0, 0.1, 10).texture;
  pmrem.dispose();
  box.geometry.dispose();
  for (const m of mats) { m.map.dispose(); m.dispose(); }
  return env;
}

export function buildDepotCeiling(scene, { renderer, keep, shellMesh } = {}) {
  const m4 = new THREE.Matrix4();
  // 배경·안개: 찬 회색, 멀리 갈수록 살짝 먹먹하게 (흰 날림 방지)
  scene.background = new THREE.Color(0xb7bec6);
  scene.fog = new THREE.Fog(0xb7bec6, 55, 150);
  if (renderer) {
    try {
      const env = makeEnvMap(renderer);
      keep?.(env);
      scene.environment = env;
      scene.environmentIntensity = 0.35;
    } catch { /* PMREM 실패해도 조명만으로 충분 */ }
  }

  // 조명: 실제 Light 는 3개. 하이베이는 발광 메시.
  const hemi = new THREE.HemisphereLight(0xe8eef4, 0x6a6458, 0.85);
  const sun = new THREE.DirectionalLight(0xfff4e6, 0.42); sun.position.set(18, 28, -8);
  const amb = new THREE.AmbientLight(0xd8d4cc, 0.18);
  scene.add(hemi, sun, amb);

  // 외피 천장면을 어두운 강판으로 (벽은 별도 허리 패널)
  if (shellMesh) {
    shellMesh.material.color.setHex(0x8b9298);
    shellMesh.material.needsUpdate = true;
  }

  // 천장 강판 (쉘보다 살짝 아래, 어두운 리브)
  const deckTex = keep(canvasTexLocal(256, 256, (g) => {
    g.fillStyle = '#5c636a'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#686f76';
    for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 5, 256);
    g.fillStyle = 'rgba(0,0,0,.12)';
    for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 256, 2);
  }, false));
  deckTex.wrapS = deckTex.wrapT = THREE.RepeatWrapping; deckTex.repeat.set(W / 4, D / 4);
  const deckM = keep(new THREE.MeshLambertMaterial({ map: deckTex, color: 0x9aa1a8 }));
  const deck = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, D)), deckM);
  deck.rotation.x = Math.PI / 2; deck.position.set(W / 2, CEIL - 0.04, D / 2); scene.add(deck);

  // 벽 아래 4.2 m 크림 허리 패널 (창고 콘크리트 위 밝은 페인트)
  const dadoM = keep(new THREE.MeshLambertMaterial({ color: 0xe4e0d8 }));
  const dadoH = 4.2;
  const walls = [
    { w: W, h: dadoH, x: W / 2, y: dadoH / 2, z: 0.04, ry: 0 },
    { w: W, h: dadoH, x: W / 2, y: dadoH / 2, z: D - 0.04, ry: Math.PI },
    { w: D, h: dadoH, x: 0.04, y: dadoH / 2, z: D / 2, ry: Math.PI / 2 },
    { w: D, h: dadoH, x: W - 0.04, y: dadoH / 2, z: D / 2, ry: -Math.PI / 2 },
  ];
  const dadoG = keep(new THREE.PlaneGeometry(1, 1));
  for (const w of walls) {
    const m = new THREE.Mesh(dadoG, dadoM);
    m.position.set(w.x, w.y, w.z); m.rotation.y = w.ry; m.scale.set(w.w, w.h, 1); scene.add(m);
  }

  // 메인 트러스 (z 방향으로 7.5 m 간격) — 상·하현재 + 사재
  const steel = keep(new THREE.MeshLambertMaterial({ color: 0x4a525a }));
  const steelDark = keep(new THREE.MeshLambertMaterial({ color: 0x3a4248 }));
  const chordG = keep(new THREE.BoxGeometry(W - 1, 0.22, 0.18));
  const webG = keep(new THREE.BoxGeometry(0.08, 0.95, 0.08));
  const diagG = keep(new THREE.BoxGeometry(0.07, 1.35, 0.07));
  const colG = keep(new THREE.BoxGeometry(0.22, 1.1, 0.22));
  let nChord = 0, nWeb = 0, nDiag = 0, nCol = 0;
  const ZS = []; for (let z = 7.5; z < D; z += 7.5) ZS.push(z);
  const chords = new THREE.InstancedMesh(chordG, steel, ZS.length * 2);
  const webs = new THREE.InstancedMesh(webG, steelDark, ZS.length * 40);
  const diags = new THREE.InstancedMesh(diagG, steelDark, ZS.length * 40);
  const cols = new THREE.InstancedMesh(colG, steel, ZS.length * 8);
  const qDiag = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.55);
  const qDiag2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.55);
  for (const z of ZS) {
    m4.makeTranslation(W / 2, CEIL - 0.22, z); chords.setMatrixAt(nChord++, m4);
    m4.makeTranslation(W / 2, CEIL - 1.05, z); chords.setMatrixAt(nChord++, m4);
    for (let x = 3; x < W - 2; x += 3.2) {
      m4.makeTranslation(x, CEIL - 0.63, z); webs.setMatrixAt(nWeb++, m4);
      m4.compose(new THREE.Vector3(x + 0.8, CEIL - 0.63, z), qDiag, new THREE.Vector3(1, 1, 1)); diags.setMatrixAt(nDiag++, m4);
      m4.compose(new THREE.Vector3(x - 0.8, CEIL - 0.63, z), qDiag2, new THREE.Vector3(1, 1, 1)); diags.setMatrixAt(nDiag++, m4);
    }
    for (const x of [6, 22, 42, 62, 78]) { m4.makeTranslation(x, CEIL - 1.55, z); cols.setMatrixAt(nCol++, m4); }
  }
  chords.count = nChord; webs.count = nWeb; diags.count = nDiag; cols.count = nCol;
  scene.add(chords, webs, diags, cols);

  // 공조 덕트 (지름 0.7 m 원통, z 방향 4열)
  const ductM = keep(new THREE.MeshLambertMaterial({ color: 0x8a9096 }));
  const ductG = keep(new THREE.CylinderGeometry(0.34, 0.34, 22, 8, 1, true)); ductG.rotateZ(Math.PI / 2);
  const hangG = keep(new THREE.BoxGeometry(0.04, 0.7, 0.04));
  const ducts = new THREE.InstancedMesh(ductG, ductM, 24);
  const hangs = new THREE.InstancedMesh(hangG, steelDark, 80);
  let nd = 0, nh = 0;
  for (const x of [10, 30, 54, 74]) {
    for (let z = 12; z < D - 8; z += 22) {
      m4.makeTranslation(x, CEIL - 1.85, z); ducts.setMatrixAt(nd++, m4);
      for (const dz of [-8, 0, 8]) { m4.makeTranslation(x, CEIL - 1.45, z + dz); hangs.setMatrixAt(nh++, m4); }
    }
  }
  ducts.count = nd; hangs.count = nh; scene.add(ducts, hangs);

  // 채광창 (발광 패널) + 아주 옅은 광속
  const skyM = keep(new THREE.MeshBasicMaterial({ color: 0xe8f0f8 }));
  const skyG = keep(new THREE.BoxGeometry(5.5, 0.06, 3.2));
  const frameM = keep(new THREE.MeshLambertMaterial({ color: 0x3a4248 }));
  const frameG = keep(new THREE.BoxGeometry(5.9, 0.1, 3.6));
  const skys = new THREE.InstancedMesh(skyG, skyM, 16);
  const frames = new THREE.InstancedMesh(frameG, frameM, 16);
  let ns = 0;
  for (const x of [18, 42, 66]) for (const z of [18, 42, 66, 94]) {
    m4.makeTranslation(x, CEIL - 0.08, z); skys.setMatrixAt(ns, m4); frames.setMatrixAt(ns, m4);
    ns++;
  }
  skys.count = frames.count = ns; scene.add(frames, skys);

  // 하이베이 조명 (발광 원판 + 갓) — 라이트 아님
  const lampM = keep(new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
  const hoodM = keep(new THREE.MeshLambertMaterial({ color: 0x3a3e44 }));
  const lampG = keep(new THREE.CircleGeometry(0.28, 10)); lampG.rotateX(-Math.PI / 2);
  const hoodG = keep(new THREE.CylinderGeometry(0.32, 0.36, 0.1, 10, 1, true));
  const rodG = keep(new THREE.BoxGeometry(0.03, 0.55, 0.03));
  let nl = 0;
  for (let x = 5; x < W; x += 7) for (let z = 5; z < D; z += 7) nl++;
  const lamps = new THREE.InstancedMesh(lampG, lampM, nl);
  const hoods = new THREE.InstancedMesh(hoodG, hoodM, nl);
  const rods = new THREE.InstancedMesh(rodG, steelDark, nl);
  let i = 0;
  for (let x = 5; x < W; x += 7) for (let z = 5; z < D; z += 7) {
    m4.makeTranslation(x, CEIL - 1.55, z); lamps.setMatrixAt(i, m4);
    m4.makeTranslation(x, CEIL - 1.48, z); hoods.setMatrixAt(i, m4);
    m4.makeTranslation(x, CEIL - 1.2, z); rods.setMatrixAt(i, m4);
    i++;
  }
  lamps.count = hoods.count = rods.count = i; scene.add(rods, hoods, lamps);

  // 랙 아래 값싼 AO: 반투명 어두운 타원(평면). 랙 좌표는 mount 쪽에서 더 넣을 수 있게 반환.
  const aoM = keep(new THREE.MeshBasicMaterial({ color: 0x2a2a28, transparent: true, opacity: 0.12, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  const aoG = keep(new THREE.PlaneGeometry(1, 1));
  function addRackAO(racks, rackD, bay) {
    // 지오메트리는 XY 평면, 인스턴스에서 -X 90° 돌려 바닥에 붙인다.
    // (지오메트리를 먼저 돌리면 스케일 z 가 높이로 가 27 m 검은 벽이 된다)
    const qAo = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const ao = new THREE.InstancedMesh(aoG, aoM, racks.length);
    let k = 0;
    for (const r of racks) {
      const len = r.bays * bay;
      m4.compose(new THREE.Vector3(r.x0 + rackD / 2, 0.008, r.z0 + len / 2), qAo, new THREE.Vector3(rackD + 0.8, len + 0.6, 1));
      ao.setMatrixAt(k++, m4);
    }
    ao.count = k; ao.renderOrder = 1; scene.add(ao);
    return ao;
  }

  return { addRackAO, hemi, sun, amb };
}

function canvasTexLocal(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
