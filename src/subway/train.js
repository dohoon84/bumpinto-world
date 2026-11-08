// [subway] 열차 안 (별도 Scene, 한 량 실내). 승강장에서 스크린도어로 타면 만들고, 다른 역에서 내리면 dispose.
//   x = 차량 길이 방향 (진행 = +x), 실내 폭 z∈[-1.45,1.45], 승강장(내리는 문) = -z 쪽 (진행 방향 왼쪽)
//   창밖: 어두운 터널 + 지나가는 조명(InstancedMesh, 위치만 흘림) → 역에 가까워지면 승강장(스크린도어·역 이름판)이 미끄러져 들어와 멈춤
//   draw call (실측은 보고서): 정적 1 · 글자 아틀라스 1 · LED/역이름 캔버스 1 · 손잡이 1 · 문짝 1 · 터널 조명 1 · 터널 이음 1
//                              · 역(바닥/벽 1 + 이름판 1 + 스크린도어 2) + 아바타 부품(≈20)
import * as THREE from 'three';
import { createBuilder, createAtlas, FONT, fitText, lineBadge } from './geom.js';
import { LINES, DOOR_OFF, CAR_LEN } from './lines.js';
import { platformLayout, announce, RIDE, trainRunZone, DOOR_W, BY_NAME, signText, MOTION, rideTimeline, rideState } from './ride.js';
import { buildScreenDoors, screenDoorFrame, CAR } from './trainParts.js';
import { buildCrowd } from '../entities/avatarCrowd.js';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { LOOKS } from './looks.js';

export const CAB = Object.freeze({ HW: 1.45, CEIL: 2.15, HL: CAR.LEN / 2 - 0.15 });
const PLAT_CZ = 0.25 + CAR.W / 2; // 승강장 Scene 에서 차체 가운데 z (platform.js 와 같게)

// origin: 탄 역 def, rides: rideStops(...) [{ name, game, id }], board: { door:{car,door,x}, run, at(탄 역 정차 시각, 서버 시계 ms), t(정차 후 초, at 없을 때) }
//   now: 서버 시계 (serverNow)
//   onEvent('say', {ko,en}) · update() 반환 { alight: { stop, def, doorX } }
export function buildTrain({ origin, line, dir, rides, board, renderer, look, onEvent = () => {}, kstHour = 12, now = () => Date.now() }) {
  const L = LINES[line], lay = platformLayout(line);
  const car = board.door.car, run = board.run || 0;
  const zone = trainRunZone(line, dir, run); // [subway-sync] 슬롯(run%4) + 편성 표식(run%1000, 프레즌스 z 에 실림)
  const carXc = lay.trainLen / 2 - (car - 0.5) * CAR_LEN; // 승강장 좌표에서 이 량 가운데 x (정차 때)
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050607');
  const hemi = new THREE.HemisphereLight('#ffffff', '#7d7a74', 2.2); scene.add(hemi);
  const disposables = [];
  const S = createBuilder(), G = createBuilder();
  const atlas = createAtlas(1024, 512, 'train');
  const white = atlas.add(8, 8, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); });
  const { HW, CEIL, HL } = CAB;

  // ---------- 실내 ----------
  const DOOR_TOP = 1.95; // 문 열림 높이 (문짝 높이와 같게)
  const wallSegs = []; { let a = -HL; for (const x of DOOR_OFF.slice().sort((p, q) => p - q)) { wallSegs.push([a, x - DOOR_W / 2]); a = x + DOOR_W / 2; } wallSegs.push([a, HL]); }
  S.block(0, -0.12, 0, HL * 2, 0.12, HW * 2, '#8f8d86');                        // 바닥
  S.block(0, -0.002, 0, HL * 2 - 0.4, 0.004, 0.9, '#a3a19a');                   // 통로 매트
  S.block(0, CEIL, 0, HL * 2, 0.1, HW * 2 + 0.2, '#eef0f2');                     // 천장
  for (const s of [-1, 1]) {
    // 창 아래 벽·창 위 띠: 문 자리는 비운다 (예전엔 차 길이 통째라 열린 문 안에 0.95m 벽이 남아 내릴 수 없어 보였음)
    for (const [a, b] of wallSegs) {
      S.block((a + b) / 2, 0, s * (HW + 0.05), b - a, 0.95, 0.1, '#dee2e6');           // 창 아래 벽
      S.block((a + b) / 2, 1.75, s * (HW + 0.05), b - a, DOOR_TOP - 1.75, 0.1, '#dee2e6'); // 창 위 (문 높이까지)
    }
    S.block(0, DOOR_TOP, s * (HW + 0.05), HL * 2, CEIL - DOOR_TOP, 0.1, '#dee2e6');  // 문 위 벽
    for (let i = 0; i <= DOOR_OFF.length; i++) {                                     // 창 사이 기둥 (문 옆)
      const xs = i === 0 ? HL - 0.25 : i === DOOR_OFF.length ? -HL + 0.25 : (DOOR_OFF[i - 1] + DOOR_OFF[i]) / 2;
      S.block(xs, 0.95, s * (HW + 0.05), 0.5, 0.8, 0.1, '#dee2e6');
    }
    for (const x of DOOR_OFF) for (const e of [-1, 1]) S.block(x + e * (DOOR_W / 2 + 0.12), 0, s * (HW + 0.05), 0.24, CEIL, 0.12, '#ced4da'); // 문틀
    S.box(0, 1.92, s * (HW - 0.02), HL * 2, 0.22, 0.02, '#f8f9fa');                // 광고 띠 바탕
  }
  for (const s of [-1, 1]) { S.block(s * (HL + 0.05), 0, 0, 0.1, CEIL, HW * 2 + 0.2, '#ced4da'); S.block(s * (HL + 0.06), 0.3, 0, 0.02, 1.6, 0.85, '#2b3035'); } // 끝벽 + 통로문
  // 의자 (문 사이 7석, 끝 3석). 노약자석 = 끝 칸
  const seats = [];
  const spans = [[DOOR_OFF[0] + DOOR_W / 2 + 0.25, HL - 0.05, true]];
  for (let i = 0; i < DOOR_OFF.length - 1; i++) spans.push([DOOR_OFF[i + 1] + DOOR_W / 2 + 0.25, DOOR_OFF[i] - DOOR_W / 2 - 0.25, false]);
  spans.push([-HL + 0.05, DOOR_OFF[DOOR_OFF.length - 1] - DOOR_W / 2 - 0.25, true]);
  for (const [a, b, pri] of spans) for (const s of [-1, 1]) {
    const len = Math.abs(b - a), lo = Math.min(a, b), n = pri ? 3 : 7, col = pri ? '#c2255c' : '#3d5a80';
    S.block((a + b) / 2, 0, s * (HW - 0.27), len, 0.43, 0.5, '#adb5bd');
    S.block((a + b) / 2, 0.43, s * (HW - 0.27), len - 0.05, 0.08, 0.5, col);
    S.block((a + b) / 2, 0.5, s * (HW - 0.06), len - 0.05, 0.5, 0.08, col);
    for (let k = 0; k < n; k++) seats.push({ x: lo + (k + 0.5) * (len / n), z: s * (HW - 0.36), ry: s > 0 ? Math.PI : 0, taken: false });
    S.cyl(lo + 0.02, 0, s * (HW - 0.55), 0.03, CEIL, '#ced4da'); S.cyl(lo + len - 0.02, 0, s * (HW - 0.55), 0.03, CEIL, '#ced4da'); // 의자 끝 기둥
  }
  for (const x of DOOR_OFF) S.cyl(x, 0, 0, 0.03, CEIL, '#ced4da');                 // 문 앞 가운데 기둥
  for (const s of [-1, 1]) S.box(0, 1.85, s * 0.85, HL * 2 - 0.3, 0.03, 0.03, '#ced4da'); // 손잡이 봉
  for (let x = -HL + 1; x < HL - 0.5; x += 2.4) G.box(x, CEIL - 0.04, 0, 2.0, 0.03, 0.32, '#ffffff'); // 조명

  // ---------- 글자 ----------
  const stops = [origin.name, ...rides.map((r) => r.name)];
  const routeUV = atlas.add(1000, 64, (c, w, h) => { // 노선 띠 (문 위): 탄 역 → 갈 수 있는 역들
    c.fillStyle = '#f8f9fa'; c.fillRect(0, 0, w, h); c.textBaseline = 'middle';
    const bw = lineBadge(c, 8, 8, 24, L.color, L.short);
    const show = stops.slice(0, 10), x0 = bw + 36, step = (w - x0 - 30) / Math.max(1, show.length - 1);
    c.fillStyle = L.color; c.fillRect(x0, 44, step * (show.length - 1), 6);
    show.forEach((n, i) => { const x = x0 + step * i, g = i === 0 || BY_NAME.get(n)?.lines.includes(line); c.fillStyle = g ? '#fff' : '#dee2e6'; c.strokeStyle = L.color; c.lineWidth = 3; c.beginPath(); c.arc(x, 47, 7, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = g ? '#111' : '#868e96'; c.textAlign = 'center'; fitText(c, n, step - 4, 16, 700); c.fillText(n, x, 22); });
  });
  const adUV = atlas.add(600, 60, (c, w, h) => { c.fillStyle = '#fff4e6'; c.fillRect(0, 0, w, h); c.fillStyle = '#d9480f'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = `800 26px ${FONT}`; c.fillText('동네 한 바퀴', 14, 22); c.fillStyle = '#495057'; c.font = `600 17px ${FONT}`; c.fillText('탄천 따라 걷기 좋은 계절 · 게임 속 광고', 14, 46); });
  for (const s of [-1, 1]) {
    for (const x of DOOR_OFF) G.quad(x, 2.02, s * (HW - 0.07), 1.6, 0.1, '#ffffff', { ry: s > 0 ? Math.PI : 0, uv: routeUV });
    for (let i = 0; i < DOOR_OFF.length - 1; i++) G.quad((DOOR_OFF[i] + DOOR_OFF[i + 1]) / 2, 1.92, s * (HW - 0.04), 2.2, 0.21, '#ffffff', { ry: s > 0 ? Math.PI : 0, uv: adUV });
  }
  const tex = atlas.texture(); disposables.push(tex);
  const staticMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: tex, toneMapped: false });
  const fixUV = (g) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) if (uv.getX(i) === 0 && uv.getY(i) === 0) uv.setXY(i, (white.u0 + white.u1) / 2, (white.v0 + white.v1) / 2); return g; };
  const sm = new THREE.Mesh(S.build(), staticMat); sm.name = 'trainStatic';
  const gm = new THREE.Mesh(fixUV(G.build()), glowMat); gm.name = 'trainGlow';
  scene.add(sm, gm); disposables.push(sm.geometry, gm.geometry, staticMat, glowMat);

  // LED (문 위, 양쪽) + 역 이름판(창밖 승강장): 캔버스 1장 (위 = LED, 아래 = 이름판)
  const lc = document.createElement('canvas'); lc.width = 1024; lc.height = 256;
  const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
  const lm = new THREE.MeshBasicMaterial({ map: lt, toneMapped: false });
  const ledGeo = new THREE.PlaneGeometry(1.3, 0.16); { const uv = ledGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5 + uv.getY(i) * 0.5); }
  const leds = new THREE.InstancedMesh(ledGeo, lm, DOOR_OFF.length * 2); leds.name = 'trainLed';
  { const m4 = new THREE.Matrix4(); let k = 0; for (const s of [-1, 1]) for (const x of DOOR_OFF) { m4.makeRotationY(s > 0 ? Math.PI : 0); m4.setPosition(x, 2.04 - 0.16, s * (HW - 0.06)); leds.setMatrixAt(k++, m4); } }
  scene.add(leds); disposables.push(lt, lm, ledGeo);
  let ledKey = '';
  function drawLed(ko, en, name) {
    const key = ko + en + name; if (key === ledKey) return; ledKey = key;
    const c = lc.getContext('2d');
    c.fillStyle = '#070708'; c.fillRect(0, 0, 1024, 128);
    c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillStyle = '#ff922b'; fitText(c, ko, 1000, 52, 800); c.fillText(ko, 512, 40);
    c.fillStyle = '#69db7c'; fitText(c, en, 1000, 38, 700); c.fillText(en, 512, 96);
    // 아래 절반: 승강장 역 이름판
    const nb = BY_NAME.get(name) || { name, nameEn: '' };
    c.fillStyle = '#f8f9fa'; c.fillRect(0, 128, 1024, 128); c.fillStyle = L.color; c.fillRect(0, 128 + 92, 1024, 36);
    c.fillStyle = '#111'; c.font = `900 64px ${FONT}`; c.fillText(nb.name, 512, 128 + 44); c.fillStyle = '#495057'; c.font = `600 22px ${FONT}`; c.fillText(nb.nameEn || '', 512, 128 + 82);
    lt.needsUpdate = true;
  }

  // 문짝 (양쪽, 이 량)
  const leafGeo = new THREE.BoxGeometry(DOOR_W / 2, 1.95, 0.05), leafMat = new THREE.MeshLambertMaterial({ color: '#c3c9cf' });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, DOOR_OFF.length * 4); leaves.name = 'trainDoorsIn';
  scene.add(leaves); disposables.push(leafGeo, leafMat);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
  function drawDoors(open) {
    let k = 0;
    for (const s of [-1, 1]) for (const x of DOOR_OFF) for (const lr of [-1, 1]) {
      const o = s < 0 ? open : 0;
      M4.compose(V.set(x + lr * (DOOR_W / 4 + o * DOOR_W * 0.48), 0.98, s * (HW + 0.06)), Q.identity(), S1); leaves.setMatrixAt(k++, M4);
    }
    leaves.instanceMatrix.needsUpdate = true;
  }
  // 손잡이 (흔들림)
  const strapGeo = new THREE.BoxGeometry(0.03, 0.22, 0.09), strapMat = new THREE.MeshLambertMaterial({ color: '#f1f3f5' });
  const strapXs = []; for (let x = -HL + 0.6; x < HL - 0.5; x += 0.42) if (!DOOR_OFF.some((d) => Math.abs(d - x) < 0.8)) strapXs.push(x);
  const straps = new THREE.InstancedMesh(strapGeo, strapMat, strapXs.length * 2); straps.name = 'trainStraps';
  scene.add(straps); disposables.push(strapGeo, strapMat);
  const E = new THREE.Euler();
  function drawStraps(swing) {
    let k = 0;
    for (const s of [-1, 1]) for (const x of strapXs) { Q.setFromEuler(E.set(0, 0, swing)); V.set(x - Math.sin(swing) * 0.11, 1.73, s * 0.85); M4.compose(V, Q, S1); straps.setMatrixAt(k++, M4); }
    straps.instanceMatrix.needsUpdate = true;
  }

  // ---------- 창밖: 터널 ----------
  const T = createBuilder();
  T.block(0, -1.4, 2.7, 600, 5, 0.3, '#1b1d1f'); // 오른쪽(+z) 벽. 왼쪽(-z, 승강장 쪽) 벽은 승강장 자리만 비워 두는 두 토막 (아래 sideWall)
  for (const s of [-1, 1]) T.block(0, -1.5, s * 1.4, 600, 0.1, 1.6, '#24262a');
  T.block(0, 3.0, 0, 600, 0.3, 5.6, '#141516');
  const tunnel = new THREE.Mesh(T.build(), staticMat); tunnel.name = 'tunnel';
  scene.add(tunnel); disposables.push(tunnel.geometry);
  const wallGeo = new THREE.BoxGeometry(600, 5, 0.3), wallMat = new THREE.MeshLambertMaterial({ color: '#1b1d1f' });
  const sideWall = new THREE.InstancedMesh(wallGeo, wallMat, 2); sideWall.name = 'tunnelWallL'; sideWall.frustumCulled = false;
  scene.add(sideWall); disposables.push(wallGeo, wallMat);
  function placeSideWall(sx) { // sx = 승강장 중심 x (없으면 null) → 승강장 앞뒤로만 벽
    const m4 = new THREE.Matrix4();
    if (sx == null) { m4.makeTranslation(0, 1.1, -2.7); sideWall.setMatrixAt(0, m4); sideWall.setMatrixAt(1, m4); }
    else { m4.makeTranslation(sx - half - 300, 1.1, -2.7); sideWall.setMatrixAt(0, m4); m4.makeTranslation(sx + half + 300, 1.1, -2.7); sideWall.setMatrixAt(1, m4); }
    sideWall.instanceMatrix.needsUpdate = true;
  }
  const SPAN = 480, LSTEP = 5, RSTEP = 6;
  const lightGeo = new THREE.BoxGeometry(1.1, 0.14, 0.06), lightMat = new THREE.MeshBasicMaterial({ color: '#ffe8b0', toneMapped: false });
  const nL = Math.round(SPAN / LSTEP);
  const lights = new THREE.InstancedMesh(lightGeo, lightMat, nL * 2); lights.name = 'tunnelLights'; lights.frustumCulled = false;
  const ribGeo = new THREE.BoxGeometry(0.25, 3.4, 0.1), ribMat = new THREE.MeshLambertMaterial({ color: '#2f3236' });
  const nR = Math.round(SPAN / RSTEP);
  const ribs = new THREE.InstancedMesh(ribGeo, ribMat, nR * 2); ribs.name = 'tunnelRibs'; ribs.frustumCulled = false;
  scene.add(lights, ribs); disposables.push(lightGeo, lightMat, ribGeo, ribMat);
  const Z0 = new THREE.Vector3(0, 0, 0);
  function drawTunnel(sTot, vis, sx = null) { // sx: 승강장 중심 x → 그 구간 왼쪽 조명·늑재는 숨김
    lights.visible = ribs.visible = vis;
    if (!vis) return;
    let k = 0;
    for (const s of [-1, 1]) for (let i = 0; i < nL; i++) { const x = ((((i * LSTEP - sTot) % SPAN) + SPAN) % SPAN) - SPAN / 2; M4.compose(V.set(x, 1.5, s * 2.53), Q.identity(), s < 0 && sx != null && Math.abs(x - sx) < half + 1 ? Z0 : S1); lights.setMatrixAt(k++, M4); }
    k = 0;
    for (const s of [-1, 1]) for (let i = 0; i < nR; i++) { const x = ((((i * RSTEP + 3 - sTot) % SPAN) + SPAN) % SPAN) - SPAN / 2; M4.compose(V.set(x, 0.3, s * 2.5), Q.identity(), s < 0 && sx != null && Math.abs(x - sx) < half + 1 ? Z0 : S1); ribs.setMatrixAt(k++, M4); }
    lights.instanceMatrix.needsUpdate = ribs.instanceMatrix.needsUpdate = true;
  }

  // ---------- 창밖: 승강장 (도착·출발할 때) ----------
  const station = new THREE.Group(); scene.add(station);
  const P = createBuilder(), half = lay.half;
  P.block(0, -0.3, -2.5 - PLAT_CZ, half * 2, 0.3, 5, '#b9b4aa');
  P.block(0, -0.3, -5.2 - PLAT_CZ, half * 2, 4, 0.4, '#e6e1d8');
  P.block(0, 3.6, -2.5 - PLAT_CZ, half * 2, 0.3, 5.6, '#d3d6d9');
  for (let x = -half + 2; x < half - 1; x += 4.2) P.box(x, 3.56, -1.2 - PLAT_CZ, 3.2, 0.04, 0.22, '#fffbe6');
  for (let c = 0; c <= lay.cars; c++) P.block(lay.trainLen / 2 - c * CAR_LEN, 0, -3.3 - PLAT_CZ, 0.7, 3.6, 0.7, '#e9ecef');
  screenDoorFrame(P, { lay, z: -PLAT_CZ, x0: -half + 0.4, x1: half - 0.4, color: L.color });
  const platMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const pm = new THREE.Mesh(P.build(), platMat); pm.name = 'trainStationPlat';
  station.add(pm); disposables.push(pm.geometry, platMat);
  const psd = buildScreenDoors(station, { lay, z: -PLAT_CZ, x0: -half + 0.4, x1: half - 0.4, disposables });
  // 역 이름판 (뒷벽, 열차 창을 봄) — LED 캔버스 아래 절반
  const nbGeo = new THREE.PlaneGeometry(4.4, 0.55 * 1); { const uv = nbGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.5); }
  const nbCount = Math.ceil(half * 2 / 24);
  const names = new THREE.InstancedMesh(nbGeo, lm, nbCount); names.name = 'trainStationNames';
  { const m4 = new THREE.Matrix4(); for (let i = 0; i < nbCount; i++) { m4.makeScale(1.4, 1.4, 1); m4.setPosition(-half + 12 + i * 24, 2.4, -4.98 - PLAT_CZ); names.setMatrixAt(i, m4); } }
  station.add(names); disposables.push(nbGeo);

  // ---------- 사람 ----------
  const crowdGroup = new THREE.Group(); scene.add(crowdGroup);
  const crowd = buildCrowd(crowdGroup, { name: 'trainCrowd', cast: () => false });
  const me = createAvatar(look || {}); me.userData.sit = ''; const meParts = crowd.register(me);
  let rr = (run * 7919 + car * 104729 + line.length * 31) % 2147483647 || 1;
  const rnd = () => ((rr = (rr * 16807) % 2147483647) / 2147483647);
  const rush = (kstHour >= 7 && kstHour < 10) || (kstHour >= 17 && kstHour < 20);
  const nPeople = Math.max(2, Math.min(25, Math.round((rush ? 18 : 8) + rnd() * 7 - 2)));
  const npcs = [];
  const free = seats.slice().sort(() => rnd() - 0.5);
  for (let i = 0; i < nPeople; i++) {
    const m = createAvatar(LOOKS[(i * 3 + run) % LOOKS.length]);
    const st = i < Math.min(free.length - 4, Math.round(nPeople * 0.65)) ? free[i] : null;
    if (st) { st.taken = true; m.position.set(st.x, 0, st.z); m.rotation.y = st.ry; m.userData.sit = 'bench'; }
    else { // 문 앞·손잡이 아래 서 있기
      const nearDoor = rnd() < 0.5;
      const x = nearDoor ? DOOR_OFF[Math.floor(rnd() * 4)] + (rnd() - 0.5) * 1.2 : (rnd() - 0.5) * (HL * 2 - 2);
      const z = nearDoor ? (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.4) : (rnd() < 0.5 ? -0.55 : 0.55);
      m.position.set(x, 0, z); m.rotation.y = nearDoor ? (z > 0 ? Math.PI : 0) : (z > 0 ? 0 : Math.PI); m.userData.sit = '';
    }
    npcs.push({ mesh: m, parts: crowd.register(m) });
  }
  crowd.finalize();
  for (const Pp of crowd.parts.values()) { disposables.push(Pp.im); if (Pp.lam) disposables.push(Pp.im.material); }

  // ---------- 운행 ----------
  //   stage: 'board' (탄 역, 문 열림) → 'close' → 'run'(i) → 'stop'(i) → 'run'(i+1) …
  //   [subway-sync] 프레임 적분이 아니라 (탄 역 정차 시각 board.at, serverNow) 의 순수 함수 → 같은 run 을 탄 사람은
  //   같은 순간 출발·도착·문 열림. 늦게 들어오거나 재접속해도 now() 만 보면 그 자리. warp = 테스트용 건너뛰기(이 화면만)
  const segs = rideTimeline(origin.name, rides);
  const at0 = Number.isFinite(board.at) ? board.at : now() - (board.t || 0) * 1000;
  let warp = 0;
  const elapsed = () => (now() - at0) / 1000 + warp;
  let stage = 'board', i = 0, t = 0, sTot = 0, open = 1, sNow = 0, v = 0, alightSent = false, endNow = false;
  const en = (n) => BY_NAME.get(n)?.nameEn || n;
  const transferOf = (n) => { const d = BY_NAME.get(n); const o = d?.lines.filter((k) => k !== line).map((k) => LINES[k]) || []; return o.length ? { ko: o.map((x) => x.ko).join(', '), en: o.map((x) => x.en).join(', '), ja: o.map((x) => x.ja).join('・') } : null; };
  const say = (k, o) => onEvent('say', announce(k, o));
  const said = new Set();
  const sayOnce = (id, k, o) => { if (said.has(id)) return; said.add(id); say(k, o); };
  const curStop = () => segs[i];
  const isLast = () => i === segs.length - 1;
  function tick() {
    const r = rideState(segs, elapsed());
    ({ stage, i, t, sTot, v, open } = r); sNow = r.s; endNow = !!r.end;
    const n = curStop();
    if (stage === 'close') sayOnce('c0', 'closing');
    else if (stage === 'run') {
      sayOnce('d' + i, 'depart', { name: n.name, nameEn: en(n.name) });
      if (n.prof.d - sNow < 450) { const tr = transferOf(n.name); sayOnce('n' + i, 'next', { name: n.name, nameEn: en(n.name), transfer: tr?.ko, transferEn: tr?.en, transferJa: tr?.ja, door: n.game ? 'left' : '' /* [subway-ja] 내릴 수 있는 역 = 왼쪽 문 */ }); }
    } else if (stage === 'stop') {
      if (!n.game) sayOnce('x' + i, 'noAlight', { name: n.name, nameEn: en(n.name) }); else if (isLast()) sayOnce('l' + i, 'last', { name: n.name, nameEn: en(n.name) });
      if (t > MOTION.CLOSE_AT - 3.5 && !isLast()) sayOnce('cl' + i, 'closing');
    }
    return endNow ? { forceAlight: true } : null;
  }
  tick();
  function stationOffset() { // 창밖 승강장 x (이 량 기준). 탄 역은 뒤로 멀어지고, 다음 역은 앞에서 다가옴
    if (stage === 'board' || stage === 'close') return { x: -carXc, name: origin.name };
    if (stage === 'stop') return { x: -carXc, name: curStop().name };
    const n = curStop(), rem = n.prof.d - sNow;
    if (rem < half + 120) return { x: -carXc + rem, name: n.name };
    if (sNow < half + 120) return { x: -carXc - sNow, name: i === 0 ? origin.name : segs[i - 1].name };
    return null;
  }

  // ---------- 플레이어 ----------
  const doorK = Math.max(0, Math.min(3, board.door.door - 1));
  me.position.set(DOOR_OFF[doorK], 0, -1.0); me.rotation.y = 0;
  const cam = { yaw: -Math.PI / 2 + 0.5, pitch: 0.18, dist: 3.0 };
  const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.05, 700);
  let speed = 0, sitting = null;
  const doorAt = (x) => DOOR_OFF.find((d) => Math.abs(d - x) < DOOR_W / 2 - 0.25);
  const canAlight = () => (stage === 'stop' && curStop()?.game) && open > 0.85;
  function canStand(x, z, r = 0.25) {
    if (x < -HL + 0.2 + r || x > HL - 0.2 - r) return false;
    const lim = HW - 0.62 - r; // 의자 앞
    if (Math.abs(z) <= lim) return true;
    const d = doorAt(x);
    if (d == null) return false;
    if (z < 0 && canAlight() && z > -HW - 0.8) return true;
    return Math.abs(z) < HW - 0.05 - r;
  }
  const inCar = (x, z) => x > -HL + 0.1 && x < HL - 0.1 && Math.abs(z) < HW - 0.1;
  let clock = 0;
  function update(dt, { look: [dy, dp, dz], axes, allowMove, self = null }) {
    clock += dt;
    cam.yaw += dy; cam.pitch = THREE.MathUtils.clamp(cam.pitch + dp, -0.5, 1.0); cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + dz), 0.8, 4.5);
    const r = tick();
    drawDoors(open);
    const so = stationOffset();
    drawTunnel(sTot, true, so ? so.x : null);
    station.visible = !!so;
    placeSideWall(so ? so.x : null);
    if (so) { station.position.set(so.x, 0, 0); psd.update(stage === 'stop' || stage === 'board' ? open : stage === 'close' ? open : 0); }
    hemi.intensity = so && Math.abs(so.x + carXc) < half ? 2.4 : 2.0;
    // LED
    const n = curStop();
    if (stage === 'board' || stage === 'close') drawLed(`${L.dirs[dir].ko} · 다음 역 ${n?.name || ''}`, `${L.dirs[dir].en} · Next ${en(n?.name || '')}`, origin.name);
    else if (stage === 'stop') drawLed(`이번 역 ${n.name}${n.game ? ' · 내리실 문은 왼쪽' : ' · 내릴 수 없음 (준비 중)'}`, `This stop ${en(n.name)}${n.game ? ' · Doors on the left' : ' · coming soon'}`, n.name);
    else { const near = n.prof.d - sNow < 450; drawLed(`${near ? '이번 역' : '다음 역'} ${n.name}`, `${near ? 'This stop' : 'Next'} ${en(n.name)}`, so ? so.name : n.name); }
    // 흔들림
    const acc = stage === 'run' ? (n.prof.at(t + 0.05).v - n.prof.at(t).v) / 0.05 : 0;
    drawStraps(THREE.MathUtils.clamp(-acc * 0.12, -0.25, 0.25) + Math.sin(clock * 2.1) * 0.02 * (v / RIDE.VMAX));
    // 이동
    const p = me.position;
    let { f, s, run: runK } = allowMove ? axes : { f: 0, s: 0, run: false };
    speed = 0;
    if ((f || s) && me.userData.sit) standUp(); // [subway-pose] 걸으면 일어남 (바깥과 같게)
    if (f || s) {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = -fz, rz = fx;
      let mx = fx * f + rx * s, mz = fz * f + rz * s; const Lm = Math.hypot(mx, mz); mx /= Lm; mz /= Lm;
      const sp = (runK ? 4.5 : 2.6) * Math.min(1, Math.hypot(f, s)), step = sp * dt;
      const nx = p.x + mx * step, nz = p.z + mz * step;
      const stuck = !canStand(p.x, p.z);
      if (canStand(nx, p.z) || stuck) p.x = nx;
      if (canStand(p.x, nz) || stuck) p.z = nz;
      const want = Math.atan2(mx, mz); me.rotation.y += Math.atan2(Math.sin(want - me.rotation.y), Math.cos(want - me.rotation.y)) * Math.min(1, dt * 12);
      speed = sp;
    }
    if (!canAlight() && p.z < -(HW - 0.3)) p.z = -(HW - 0.3); // 문이 닫히면 안으로
    if (self) { me.userData.emote = speed > 0 || sitting ? '' : (self.emote || ''); me.userData.afk = !!self.afk; me.userData.jumpY = me.userData.sit ? 0 : (self.jy || 0); }
    animateAvatar(me, speed, dt);
    for (const q of npcs) animateAvatar(q.mesh, 0, dt);
    // 카메라 (실내 안, 흔들림)
    const sway = Math.sin(clock * 1.7) * 0.012 * (v / RIDE.VMAX) + THREE.MathUtils.clamp(-acc * 0.02, -0.03, 0.03);
    const eye = p.y + (me.userData.sit ? 1.15 : 1.55), bx = Math.sin(cam.yaw), bz = Math.cos(cam.yaw), cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch);
    let d = cam.dist;
    for (; d > 0.5; d -= 0.15) { const cx = p.x + bx * d * cp, cz = p.z + bz * d * cp; if (inCar(cx, cz)) break; }
    camera.position.set(p.x + bx * d * cp + sway, THREE.MathUtils.clamp(eye + d * spp, 0.5, CEIL - 0.12) + sway * 0.5, p.z + bz * d * cp);
    camera.lookAt(p.x - bx * 3 * cp, eye - 3 * spp, p.z - bz * 3 * cp);
    // 좁은 칸: 카메라가 내 머리에 붙으면 1인칭(내 아바타 숨김), 카메라 바로 앞(0.75m 안) 사람도 그리지 않음 (화면을 머리로 가리지 않게)
    const firstPerson = d < 1.3, C = camera.position;
    crowd.begin(); if (!firstPerson) crowd.add(me, meParts, false);
    for (const q of npcs) { const m = q.mesh.position; if (Math.hypot(m.x - C.x, m.z - C.z) > 0.75) crowd.add(q.mesh, q.parts, false); }
    crowd.end();
    // 하차
    if (!alightSent && ((canAlight() && p.z < -HW - 0.35) || r?.forceAlight)) {
      alightSent = true;
      const st = curStop(), k = doorAt(p.x) != null ? DOOR_OFF.indexOf(doorAt(p.x)) : DOOR_OFF.reduce((b, dd, j) => (Math.abs(dd - p.x) < Math.abs(DOOR_OFF[b] - p.x) ? j : b), 0);
      // [subway-sync] 이 역 정차 순간(서버 시계) → 내린 승강장이 같은 열차를 같은 순간으로 이어 받음
      const arrAt = now() - (elapsed() - st.arr) * 1000;
      return { alight: { stop: st, id: st.id, doorX: carXc + DOOR_OFF[k], door: `${car}-${k + 1}`, forced: !!r?.forceAlight, arrAt } };
    }
    return { stage, stop: n?.name, v };
  }
  // E: 가까운 빈자리에 앉기 / 일어나기
  function toggleSit() {
    const p = me.position;
    if (sitting) { sitting.taken = false; p.z = Math.sign(sitting.z) * 0.4; sitting = null; me.userData.sit = ''; return 'stand'; }
    if (me.userData.sit) { me.userData.sit = ''; return 'stand'; } // 바닥에 앉아 있었으면 일어나기
    const s = seats.filter((q) => !q.taken).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!s || Math.hypot(s.x - p.x, s.z - p.z) > 1.6) return null;
    s.taken = true; sitting = s; p.set(s.x, 0, s.z); me.rotation.y = s.ry; me.userData.sit = 'bench'; return 'sit';
  }
  // [subway-pose] C/앉기 버튼: 가까운 빈 좌석, 없으면 바닥 (바깥과 같게)
  function sitDown() { if (me.userData.sit) return me.userData.sit; if (toggleSit() === 'sit') return 'bench'; me.userData.sit = 'ground'; return 'ground'; }
  function standUp() { if (me.userData.sit) toggleSit(); }
  function render() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.render(scene, camera); }
  function dispose() { for (const d of disposables) d.dispose?.(); scene.clear(); }
  function setView(x, z, yaw, pitch = 0.2, dist = 3) { me.position.set(x, 0, z); cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; }
  // 테스트·스크린샷: 시간 건너뛰기 (이 화면의 타임라인만 앞당김 → 다른 사람과는 어긋남. 실제 플레이에선 안 씀)
  function skip(sec) { warp += sec; return tick(); }
  return {
    kind: 'train', zone, line, dir, car, run, at: at0, segs, scene, camera, player: me, cam, update, render, dispose, setView, toggleSit, skip, doors: DOOR_OFF, halfWidth: HW,
    get speed() { return speed; }, get stage() { return stage; }, get stopIndex() { return i; }, get lastPass() { return null; }, get sitting() { return !!me.userData.sit; }, get sitKind() { return me.userData.sit || ''; }, sitDown, standUp,
    get t() { return t; }, get elapsed() { return elapsed(); }, get state() { return rideState(segs, elapsed()); }, // [subway-sync] 테스트: 프레임과 무관한 지금 상태
     get sNow() { return sNow; }, get doorOpen() { return open; }, get canAlight() { return canAlight(); },
    stats: () => ({ tris: S.count + G.count, parts: crowd.parts.size, npcs: npcs.length, seats: seats.length }),
  };
}
