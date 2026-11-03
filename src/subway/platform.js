// [subway] 승강장 (별도 Scene, 역 × 노선 × 방면). 대합실 승강장 계단으로 내려오면 만들고, 올라가거나 열차를 타면 dispose.
//   한 방면 = 상대식 승강장 하나: 승강장 z∈[-5,0], 스크린도어 z=0, 선로 z>0, 열차 진행 = +x (1호차가 +x 끝)
//   길이 = 편성 량수(lines.js TRAIN) × 20m + 여유. 스크린도어는 량-문 번호 (1-1 … N-4)
//   draw call (실측은 보고서): 정적 1 · 간판/조명 아틀라스 1 · 안내판 1 · 스크린도어 2 · 열차 3 · 계단 디딤판 0 + 아바타 부품(≈20)
import * as THREE from 'three';
import { createBuilder, createAtlas, FONT, fitText, lineBadge, roundRect } from './geom.js';
import { LINES } from './lines.js';
import { platformLayout, signText, announce, trainMotion, boardable, MOTION, simNextArrival, liveNextArrival, rideStops, platformZone, DOOR_W, BY_NAME } from './ride.js';
import { buildConsist, buildScreenDoors, screenDoorFrame, CAR } from './trainParts.js';
import { buildCrowd } from '../entities/avatarCrowd.js';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { LOOKS } from './looks.js';

export const PLAT = Object.freeze({ Z0: -5, Z1: 0, CEIL: 3.6, TRACK_Z: 1.8, WALL_Z: 4.4, STAIR: { x0: -2.6, x1: 2.6, depth: 6 } });
// 계단 단: z0 에서 -z 로 n 단 (단 깊이 d, 높이 h). 올라가기 = 계단 UP_Z 보다 안쪽 → 대합실
export const STEP = Object.freeze({ z0: PLAT.Z0 - 1.05, n: 14, d: 0.3, h: 0.17 });
export const UP_Z = PLAT.Z0 - 2.6;
// 계단 위 발 높이 (순수 함수 — 테스트용): 단 윗면을 부드럽게 (경사)
export const stairY = (z) => Math.max(0, Math.min(STEP.n, (STEP.z0 - z) / STEP.d)) * STEP.h;
// 계단 안 걸을 수 있는 곳 (승강장 바닥과 겹치게 — 사이에 틈이 있으면 입구에서 막힘)
export const inStairArea = (x, z, r = 0.3) => x > PLAT.STAIR.x0 + r && x < PLAT.STAIR.x1 - r && z <= PLAT.Z0 + 0.6 && z > PLAT.Z0 - PLAT.STAIR.depth + 0.4 + r;

// def: stationsData 역, line: 노선 키, dir: 0/1, feed: createArrivalFeed (raw()), arrival: { at, run } 이미 서 있는 열차(하차) 또는 null
//   onEvent(kind, data): 'board' {door, run, live} · 'up' · 'say' {ko,en}
export function buildPlatform({ def, line, dir, renderer, look, feed = null, arrival = null, spawnDoor = null, onEvent = () => {}, now = () => Date.now(), rides: ridesIn = null, lang = () => 'ko' }) {
  const L = LINES[line], lay = platformLayout(line), sign = signText(def, line, dir), half = lay.half;
  const rides = ridesIn ?? rideStops(line, dir, def.name);
  const zone = platformZone(def.id, line, dir);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#15171a');
  scene.add(new THREE.HemisphereLight('#ffffff', '#8d877c', 2.0));
  const dl = new THREE.DirectionalLight('#fff6e8', 0.5); dl.position.set(4, 20, -8); scene.add(dl);
  const disposables = [];
  const S = createBuilder(), G = createBuilder();
  const atlas = createAtlas(2048, 1024, 'platform');
  const white = atlas.add(8, 8, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); });
  const { Z0, CEIL, TRACK_Z, WALL_Z, STAIR } = PLAT;
  const TUN = 70; // 승강장 밖 터널 (열차가 들어오고 나가는 게 보이게)

  // ---------- 구조 ----------
  S.block(0, -0.3, (Z0 + 0) / 2, half * 2, 0.3, -Z0, '#b9b4aa');               // 승강장 바닥
  S.block(0, -0.002, -0.75, half * 2 - 1, 0.012, 0.3, '#e0b400');              // 점자 블록 줄
  S.block(0, -1.45, (0 + WALL_Z) / 2, half * 2 + TUN * 2, 0.2, WALL_Z, '#3b3a37'); // 선로 바닥
  for (const s of [-0.75, 0.75]) S.block(0, -1.25, TRACK_Z + s, half * 2 + TUN * 2, 0.16, 0.08, '#8a8f94'); // 레일
  for (let x = -half - TUN; x < half + TUN; x += 1.2) S.block(x, -1.3, TRACK_Z, 0.25, 0.06, 2.4, '#55524c'); // 침목
  S.block(0, -1.45, WALL_Z + 0.2, half * 2 + TUN * 2, CEIL + 1.6, 0.4, '#5c6166');  // 선로 건너 벽
  S.block(0, CEIL, (Z0 + WALL_Z) / 2, half * 2 + TUN * 2, 0.3, WALL_Z - Z0, '#d3d6d9'); // 천장
  // 뒷벽: 계단 입구(STAIR.x0~x1) 자리는 비워 둠 — 예전엔 통짜 벽이 입구를 막았음 (도훈 피드백)
  for (const [a, b] of [[-half, STAIR.x0 - 0.4], [STAIR.x1 + 0.4, half]]) S.block((a + b) / 2, -0.3, Z0 - 0.2, b - a, CEIL + 0.6, 0.4, '#e6e1d8', { shade: (y) => (y < 0 ? 0.85 : 1) });
  for (const s of [-1, 1]) {
    S.block(s * (half + 0.2), -0.3, Z0 / 2, 0.4, CEIL + 0.6, -Z0, '#c9c4ba');     // 승강장 끝 벽
    S.block(s * (half + TUN / 2), -1.45, 2.0, TUN, CEIL + 1.6, 0.3, '#2a2d30');    // 터널 안쪽 벽(어둡게) — 승강장 쪽
  }
  // 계단·에스컬레이터 입구 (뒷벽 가운데): 바닥 → 위로 올라가는 계단
  const SX0 = STAIR.x0, SX1 = STAIR.x1, SD = STAIR.depth;
  const SH = CEIL + 2.6; // 계단실 높이 (올라갈수록 머리 위 공간)
  S.block(0, -0.3, Z0 - SD / 2, SX1 - SX0 + 0.4, 0.3, SD, '#a9a49a');
  for (const s of [-1, 1]) S.block(s * ((SX1 - SX0) / 2 + 0.2), -0.3, Z0 - SD / 2, 0.4, SH, SD, '#d8d3ca');
  for (let i = 0; i < STEP.n; i++) S.block(0, 0, STEP.z0 - (i + 0.5) * STEP.d, SX1 - SX0, (i + 1) * STEP.h, STEP.d, i % 2 ? '#8f8a80' : '#9b968c'); // 계단 (속이 찬 단 — 틈 없음)
  for (const s of [-1, 1]) S.block(s * ((SX1 - SX0) / 2 - 0.08), 0.9, Z0 - SD / 2, 0.06, 0.06, SD, '#adb5bd');          // 난간
  S.block(0, SH - 0.6, Z0 - SD / 2, SX1 - SX0 + 0.8, 0.3, SD, '#d3d6d9');                                                   // 계단실 천장
  S.block(0, -0.3, Z0 - SD - 0.2, SX1 - SX0 + 0.8, SH, 0.4, '#cfcac0');                                                      // 계단 끝 벽
  S.block(0, CEIL - 0.6, Z0 - 0.25, SX1 - SX0 + 0.4, SH - CEIL + 0.3, 0.5, '#e6e1d8');                                      // 입구 위 (표지판 자리)
  // 기둥 (량 경계)
  const pillars = [];
  for (let c = 0; c <= lay.cars; c++) { const x = lay.trainLen / 2 - c * lay.carLen; if (Math.abs(x) < SX1 + 1) continue; pillars.push(x); S.block(x, 0, -3.3, 0.7, CEIL, 0.7, '#e9ecef'); S.box(x, 2.2, -3.3, 0.72, 0.18, 0.72, L.color); }
  // 의자 (기둥 사이 뒷벽)
  const benches = [];
  for (let c = 0; c < lay.cars; c++) { const xc = lay.trainLen / 2 - (c + 0.5) * lay.carLen; if (Math.abs(xc) < SX1 + 3) continue; benches.push(xc); S.block(xc, 0, Z0 + 0.45, 3.2, 0.42, 0.5, '#8d6e4f'); S.block(xc, 0.42, Z0 + 0.2, 3.2, 0.45, 0.08, '#8d6e4f'); }
  // 조명 띠
  for (let x = -half + 2; x < half - 1; x += 4.2) for (const z of [-1.2, -3.8]) G.box(x, CEIL - 0.02, z, 3.2, 0.04, 0.22, '#ffffff', {}); // (uv 없음 → white 아님: 아래 glowMat 은 map 있어서 uv 0,0 = white 칸)
  // 스크린도어 틀
  screenDoorFrame(S, { lay, z: 0, x0: -half + 0.4, x1: half - 0.4, color: L.color });

  // ---------- 글자 (아틀라스) ----------
  // 문 번호판 (스크린도어 위 띠, 승강장 쪽)
  const numUV = new Map();
  for (const d of lay.doors) numUV.set(d.label, atlas.add(72, 40, (c, w, h) => { c.fillStyle = '#1d2228'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd43b'; c.textAlign = 'center'; c.textBaseline = 'middle'; fitText(c, d.label, w - 6, 30, 900); c.fillText(d.label, w / 2, h / 2 + 1); }));
  atlas.row();
  for (const d of lay.doors) {
    G.quad(d.x, 2.3, -0.12, 0.6, 0.33, '#ffffff', { ry: Math.PI, uv: numUV.get(d.label) });
    G.quad(d.x, 2.3, -0.12, 0.6, 0.33, '#ffffff', { ry: 0, uv: numUV.get(d.label) }); // 뒷면(선로 쪽)도 — 앞면이 -z 를 봄 (ry π)
    S.block(d.x, -0.001, -0.35, DOOR_W, 0.006, 0.5, '#2f9e44');                     // 타는 곳 바닥 표시
    S.block(d.x, -0.001, -0.35, 0.12, 0.007, 0.5, '#f8f9fa');
  }
  // 위 띠 사이 방면 글자 (고정 유리 위)
  const dirUV = atlas.add(420, 44, (c, w, h) => { c.fillStyle = '#1d2228'; c.fillRect(0, 0, w, h); c.textBaseline = 'middle'; const bw = lineBadge(c, 6, 7, 30, L.color, L.short); c.textAlign = 'left'; c.fillStyle = '#fff'; fitText(c, `${sign.dirKo} · ${sign.dirEn}`, w - bw - 22, 22, 700); c.fillText(`${sign.dirKo} · ${sign.dirEn}`, bw + 16, h / 2 + 1); });
  atlas.row();
  // 역 이름판 (뒷벽 / 선로 건너 벽). flip: 보는 사람 기준 오른쪽이 -x 인 벽(선로 건너)이면 앞뒤 역을 바꿔 그림
  const nameBoard = (flip) => atlas.add(720, 170, (c, w, h) => {
    c.fillStyle = '#f8f9fa'; c.fillRect(0, 0, w, h);
    c.fillStyle = L.color; c.fillRect(0, h - 46, w, 46);
    c.fillStyle = '#111'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 66px ${FONT}`; c.fillText(sign.name, w / 2, 58);
    c.font = `600 24px ${FONT}`; c.fillStyle = '#495057'; c.fillText(sign.nameEn, w / 2, 104);
    const left = flip ? sign.next : sign.prev, right = flip ? sign.prev : sign.next;
    const lEn = flip ? sign.nextEn : sign.prevEn, rEn = flip ? sign.prevEn : sign.nextEn;
    c.fillStyle = '#fff'; c.font = `800 24px ${FONT}`;
    c.textAlign = 'left'; if (left) c.fillText(`← ${left}${lEn ? ' ' + lEn : ''}`, 14, h - 23);
    c.textAlign = 'right'; if (right) c.fillText(`${right}${rEn ? ' ' + rEn : ''} →`, w - 14, h - 23);
    c.textAlign = 'center'; c.font = `800 18px ${FONT}`; c.fillText(flip ? '' : sign.dirKo, w / 2, h - 23);
    lineBadge(c, 12, 12, 34, L.color, L.short);
  });
  const nbBack = nameBoard(false), nbWall = nameBoard(true);
  // 계단 위 '나가는 곳' + 반대 방면 안내
  const outUV = atlas.add(480, 90, (c, w, h) => {
    c.fillStyle = '#FFC20E'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.font = `800 32px ${FONT}`; c.fillText('나가는 곳 ↑', 16, 30); c.font = `600 19px ${FONT}`; c.fillText('Way Out · 대합실 Concourse', 18, 66);
  });
  // 승강장 끝 '관계자 외 출입금지'
  const staffUV = atlas.add(300, 60, (c, w, h) => { c.fillStyle = '#c92a2a'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 22px ${FONT}`; c.fillText('관계자 외 출입금지', w / 2, 22); c.font = `600 15px ${FONT}`; c.fillText('Staff only', w / 2, 46); });
  for (let x = -half + 18; x < half - 10; x += 36) {
    G.quad(x, 2.85, Z0 + 0.02, 4.2, 1.0, '#ffffff', { uv: nbBack });                // 뒷벽 (승강장을 봄)
    G.quad(x + 9, 1.9, WALL_Z - 0.01, 4.8, 1.13, '#ffffff', { ry: Math.PI, uv: nbWall }); // 선로 건너 벽 (승강장·열차 창을 봄)
  }
  for (const d of lay.doors.filter((_, i) => i % 4 === 1)) G.quad(d.x + DOOR_W / 2 + 1.3, 2.3, -0.12, 2.3, 0.24, '#ffffff', { ry: Math.PI, uv: dirUV });
  G.quad(0, CEIL - 0.5, Z0 + 0.03, 3.6, 0.68, '#ffffff', { uv: outUV });
  for (const s of [-1, 1]) G.quad(s * (half - 0.02), 1.9, -2.5, 2.2, 0.44, '#ffffff', { ry: -s * Math.PI / 2, uv: staffUV });
  // 걸어 다니는 데 쓰는 안내 (반대 방면은 대합실에서 갈아타기)
  const tex = atlas.texture(); disposables.push(tex);
  const staticMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: tex, toneMapped: false });
  // 조명 띠·문 번호판: uv 없는 G.box 는 uv (0,0) → 아틀라스 맨 아래 왼쪽. white 칸을 쓰도록 uv 를 바꾼다
  const gGeo = G.build(); { const uv = gGeo.attributes.uv; for (let i = 0; i < uv.count; i++) if (uv.getX(i) === 0 && uv.getY(i) === 0) uv.setXY(i, (white.u0 + white.u1) / 2, (white.v0 + white.v1) / 2); }
  const sm = new THREE.Mesh(S.build(), staticMat); sm.name = 'platStatic';
  const gm = new THREE.Mesh(gGeo, glowMat); gm.name = 'platGlow';
  scene.add(sm, gm); disposables.push(sm.geometry, gm.geometry, staticMat, glowMat);

  // ---------- 도착 안내판 (캔버스 1장) ----------
  const bc = document.createElement('canvas'); bc.width = 1024; bc.height = 128;
  const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace;
  const bm = new THREE.MeshBasicMaterial({ map: bt, toneMapped: false });
  const bg = new THREE.PlaneGeometry(5.2, 0.65);
  const boards = new THREE.InstancedMesh(bg, bm, 4); boards.name = 'platBoard';
  { const xs = [-half / 2, half / 2 - 6, -12, 14]; const m4 = new THREE.Matrix4(); xs.forEach((x, i) => { m4.makeRotationY(Math.PI); m4.setPosition(x, 3.0, -1.6); boards.setMatrixAt(i, m4); }); }
  scene.add(boards); disposables.push(bt, bm, bg);
  let boardKey = '';
  function drawBoard(msgKo, msgEn, note) {
    const key = msgKo + msgEn + note; if (key === boardKey) return; boardKey = key;
    const c = bc.getContext('2d'); c.fillStyle = '#0b0d10'; c.fillRect(0, 0, 1024, 128);
    c.textBaseline = 'middle'; const bw = lineBadge(c, 14, 18, 40, L.color, L.short);
    c.textAlign = 'left'; c.fillStyle = '#ffd43b'; fitText(c, msgKo, 1000 - bw - 40 - 180, 40, 800); c.fillText(msgKo, bw + 30, 40);
    c.fillStyle = '#e9ecef'; fitText(c, msgEn, 980, 26, 600); c.fillText(msgEn, 18, 94);
    c.textAlign = 'right'; c.fillStyle = '#868e96'; c.font = `600 18px ${FONT}`; c.fillText(note, 1010, 40);
    bt.needsUpdate = true;
  }

  // ---------- 스크린도어·열차 ----------
  const psd = buildScreenDoors(scene, { lay, z: 0, x0: -half + 0.4, x1: half - 0.4, disposables });
  const trainGroup = new THREE.Group(); scene.add(trainGroup);
  const consist = buildConsist(trainGroup, { color: L.color, cars: lay.cars, side: -1, disposables });
  const CZ = 0.25 + CAR.W / 2; // 차체 가운데 z (스크린도어와 0.25m 틈)

  // 열차 시각: 실시간(같은 방면 updn) → 없으면 시간표 근사. arrival = 하차해서 들어온 경우 이미 서 있는 열차
  let sched = arrival ? { ...arrival } : null;
  function nextSched(after) {
    const raw = feed?.raw?.();
    const t = after + 1000;
    return (raw && liveNextArrival(raw.trains, line, dir, t, raw.fetchedAt)) || simNextArrival(line, dir, def.id, t);
  }
  const gone = () => (MOTION.DWELL + 30) * 1000;
  let said = '';
  const say = (k, o = {}) => { if (said === k) return; said = k; onEvent('say', announce(k, { dirKo: sign.dirKo, dirEn: sign.dirEn, ...o })); };

  // ---------- 사람 ----------
  const crowdGroup = new THREE.Group(); scene.add(crowdGroup);
  const crowd = buildCrowd(crowdGroup, { name: 'platCrowd', cast: () => false });
  const me = createAvatar(look || {}); me.userData.sit = ''; const meParts = crowd.register(me);
  let rr = [...def.id + line + dir].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 4111) || 1;
  const rnd = () => ((rr = (rr * 16807) % 2147483647) / 2147483647);
  const npcs = [];
  const N_NPC = Math.min(22, 8 + lay.cars);
  for (let i = 0; i < N_NPC; i++) { const m = createAvatar(LOOKS[(i * 5 + dir * 3) % LOOKS.length]); npcs.push({ mesh: m, parts: crowd.register(m), mode: 'off', wait: rnd() * 4 }); }
  crowd.finalize();
  for (const P of crowd.parts.values()) { disposables.push(P.im); if (P.lam) disposables.push(P.im.material); }
  const doorsX = lay.doors.map((d) => d.x);
  const stairPt = () => ({ x: (rnd() - 0.5) * 3, z: Z0 - 2.2 });
  function spawnWaiting(n) { // 문 앞 줄 서기 (계단에서 걸어와서)
    const dx = doorsX[Math.floor(rnd() * doorsX.length)], q = rnd() < 0.5 ? -1 : 1;
    const s = stairPt(); n.mesh.position.set(s.x, stairY(s.z), s.z); n.mesh.visible = true;
    n.mode = 'walk'; n.path = [{ x: s.x, z: -4.2 }, { x: dx + q * 0.95, z: -1.3 - rnd() * 1.6 }]; n.then = 'wait'; n.door = dx;
  }
  function spawnBench(n) { // 의자에 앉아 기다리기
    if (!benches.length) return spawnWaiting(n);
    const bx = benches[Math.floor(rnd() * benches.length)] + (rnd() - 0.5) * 2.4;
    n.mesh.position.set(bx, 0, Z0 + 0.55); n.mesh.rotation.y = 0; n.mesh.userData.sit = 'bench'; n.mode = 'sit'; n.mesh.visible = true;
  }
  npcs.forEach((n, i) => { if (i < N_NPC * 0.25) spawnBench(n); else if (i < N_NPC * 0.75) { spawnWaiting(n); const p = n.path[1]; n.mesh.position.set(p.x, 0, p.z); n.mode = 'wait'; n.mesh.rotation.y = 0; } else { n.mode = 'off'; n.wait = 2 + rnd() * 20; } });
  function walkTo(n, dt, sp = 1.3) {
    const p = n.mesh.position, tgt = n.path[0];
    if (!tgt) return true;
    const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { n.path.shift(); return !n.path.length; }
    const st = Math.min(d, sp * dt); p.x += (dx / d) * st; p.z += (dz / d) * st; p.y = p.z < Z0 && Math.abs(p.x) < SX1 ? stairY(p.z) : 0;
    const want = Math.atan2(dx, dz); n.mesh.rotation.y += Math.atan2(Math.sin(want - n.mesh.rotation.y), Math.cos(want - n.mesh.rotation.y)) * Math.min(1, dt * 10);
    animateAvatar(n.mesh, sp, dt); return false;
  }
  let alightDone = false;
  function updateNpcs(dt, mo, tt) {
    const open = mo.phase === 'dwell' && mo.doors > 0.8;
    if (open && !alightDone) { // 내리는 사람 몇 명 (꺼져 있던 NPC 로)
      alightDone = true;
      for (const n of npcs.filter((q) => q.mode === 'off').slice(0, 4)) { const dx = doorsX[Math.floor(rnd() * doorsX.length)]; n.mesh.position.set(dx, 0, 0.6); n.mesh.visible = true; n.mesh.userData.sit = ''; n.mode = 'walk'; n.path = [{ x: dx, z: -1.2 }, { x: (rnd() - 0.5) * 2.5, z: -4.4 }, stairPt()]; n.then = 'gone'; }
    }
    if (mo.phase !== 'dwell') alightDone = false;
    for (const n of npcs) {
      if (n.mode === 'off') { n.mesh.visible = false; if ((n.wait -= dt) <= 0) spawnWaiting(n); continue; }
      if (n.mode === 'sit') { animateAvatar(n.mesh, 0, dt); continue; }
      if (n.mode === 'wait') {
        animateAvatar(n.mesh, 0, dt);
        if (open && tt < MOTION.CLOSE_AT - 4 && rnd() < dt * 0.9) { n.mode = 'walk'; n.path = [{ x: n.door, z: -0.6 }, { x: n.door, z: 1.0 }]; n.then = 'board'; }
        continue;
      }
      if (n.mode === 'walk' && walkTo(n, dt)) {
        if (n.then === 'wait') { n.mode = 'wait'; n.mesh.rotation.y = 0; }
        else { n.mode = 'off'; n.mesh.visible = false; n.wait = n.then === 'board' ? 25 + rnd() * 40 : 6 + rnd() * 20; }
      }
    }
  }

  // ---------- 플레이어 ----------
  const spawnX = spawnDoor != null ? spawnDoor : 0;
  if (spawnDoor != null) { me.position.set(spawnX, 0, -0.9); me.rotation.y = Math.PI; }
  else { me.position.set(0, 0, Z0 - 0.6); me.rotation.y = 0; }
  const cam = { yaw: spawnDoor != null ? 0.0 : Math.PI, pitch: 0.25, dist: 6 };
  if (spawnDoor != null) cam.yaw = -0.9; // 문을 등지고, 카메라는 승강장 비스듬히
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
  let doorsOpen = 0, canBoard = false;
  const inStair = (x, z) => inStairArea(x, z);
  function canStand(x, z, r = 0.3) {
    if (inStair(x, z)) return true;
    if (x < -half + 0.5 + r || x > half - 0.5 - r || z < Z0 + 0.2 + r || z > -0.15 - r) {
      // 열린 문 사이로 한 걸음 (탈 때만)
      if (doorsOpen > 0.85 && z <= 0.9 && z > -0.6) { const d = lay.doors.find((q) => Math.abs(q.x - x) < DOOR_W / 2 - r); if (d) return true; }
      return false;
    }
    for (const x0 of pillars) if (Math.abs(x - x0) < 0.35 + r && Math.abs(z + 3.3) < 0.35 + r) return false;
    for (const b of benches) if (Math.abs(x - b) < 1.6 + r && z < Z0 + 0.7 + r) return false;
    return true;
  }
  let speed = 0, upArmed = spawnDoor != null, pushT = 0, boardedSent = false;
  // [subway-pose] 벤치 자리 (한 벤치 3자리, 앉아 있는 손님 자리는 피함). 없거나 멀면 바닥에 앉기
  const benchSeats = benches.flatMap((xc) => [-1, 0, 1].map((k) => ({ x: xc + k * 1.0, z: Z0 + 0.55, ry: 0 })));
  let seat = null;
  function sitDown() {
    if (me.userData.sit) return me.userData.sit;
    const p = me.position;
    const free = benchSeats.filter((q) => !npcs.some((n) => n.mode === 'sit' && n.mesh.visible && Math.hypot(n.mesh.position.x - q.x, n.mesh.position.z - q.z) < 0.6));
    const q = free.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (q && Math.hypot(q.x - p.x, q.z - p.z) < 1.6 && !inStair(p.x, p.z)) { seat = { ...q, back: { x: p.x, z: Math.max(p.z, Z0 + 1.15) } }; p.set(q.x, 0, q.z); me.rotation.y = q.ry; me.userData.sit = 'bench'; }
    else me.userData.sit = 'ground';
    return me.userData.sit;
  }
  function standUp() { if (seat) { me.position.set(seat.back.x, 0, seat.back.z); seat = null; } me.userData.sit = ''; }
  const inRoom = (x, z) => x > -half && x < half && z > Z0 + 0.1 && z < WALL_Z - 0.4;

  function update(dt, { look: [dy, dp, dz], axes, allowMove, self = null }) {
    cam.yaw += dy; cam.pitch = THREE.MathUtils.clamp(cam.pitch + dp, -0.5, 1.2); cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + dz), 2.2, 10);
    const tNow = now();
    if (!sched || tNow - sched.at > gone()) sched = nextSched(sched ? sched.at : tNow - gone());
    const tt = sched ? (tNow - sched.at) / 1000 : -1e9;
    const mo = trainMotion(tt);
    doorsOpen = mo.doors; canBoard = boardable(tt);
    // 열차
    consist.setVisible(mo.phase !== 'away');
    if (mo.phase !== 'away') consist.place(lay.trainLen / 2 + mo.off, mo.doors, CZ, -1);
    psd.update(mo.doors);
    // 안내
    if (mo.phase === 'away' && sched && tt > -MOTION.APPROACH - 25) say('approach');
    else if (mo.phase === 'dwell' && tt > MOTION.OPEN_AT && tt < MOTION.CLOSE_AT - 4) say('arrived');
    else if (mo.phase === 'dwell' && tt >= MOTION.CLOSE_AT - 4) say('closing');
    // 안내판
    const raw = feed?.raw?.(), live = !!(sched && sched.live);
    const eta = sched ? (sched.at - tNow) / 1000 : null;
    let ko, en;
    if (!sched) { ko = `${sign.dirKo} · 오늘 운행이 끝났어요`; en = `${sign.dirEn} · Service ended (approx.)`; }
    else if (mo.phase === 'dwell') { ko = `${sign.dirKo} 열차 · 지금 타세요`; en = `Train ${sign.dirEn} · Now boarding`; }
    else if (mo.phase === 'approach' || eta < MOTION.APPROACH + 25) { ko = `${sign.dirKo} 열차가 들어오고 있습니다`; en = `Train ${sign.dirEn} approaching`; }
    else if (mo.phase === 'depart') { ko = `${sign.dirKo} 열차 출발`; en = `Train ${sign.dirEn} departing`; }
    else { const m = Math.max(1, Math.round(eta / 60)); ko = `${sign.dirKo} · ${live ? '' : '약 '}${m}분 후 도착`; en = `${sign.dirEn} · ${live ? '' : '~'}${m} min`; }
    drawBoard(ko, en, live ? '실시간 Live' : raw ? '시간표 근사 (실시간 이 방면 없음)' : '시간표 근사 (실시간 아님)');

    // 이동
    const p = me.position;
    let { f, s, run } = allowMove ? axes : { f: 0, s: 0, run: false };
    speed = 0;
    if ((f || s) && me.userData.sit) standUp(); // [subway-pose] 걸으면 일어남
    if (f || s) {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = -fz, rz = fx;
      let mx = fx * f + rx * s, mz = fz * f + rz * s; const Lm = Math.hypot(mx, mz); mx /= Lm; mz /= Lm;
      const sp = (run ? 7.5 : 4.0) * Math.min(1, Math.hypot(f, s)), step = sp * dt;
      const nx = p.x + mx * step, nz = p.z + mz * step;
      const stuck = !canStand(p.x, p.z);
      if (canStand(nx, p.z) || stuck) p.x = nx;
      if (canStand(p.x, nz) || stuck) p.z = nz;
      const want = Math.atan2(mx, mz); me.rotation.y += Math.atan2(Math.sin(want - me.rotation.y), Math.cos(want - me.rotation.y)) * Math.min(1, dt * 12);
      speed = sp;
      // 닫힌 문(또는 탈 수 없는 방면) 앞에서 밀면 안내
      if (mz > 0.5 && p.z > -0.75 && (pushT -= dt) <= 0) {
        const d = lay.doors.find((q) => Math.abs(q.x - p.x) < DOOR_W / 2);
        if (d && !rides.length) { pushT = 4; onEvent('say', announce('noRide', { dirKo: sign.dirKo, dirEn: sign.dirEn })); }
      }
    }
    // 탈 수 없는 방면이면 문 안으로 못 들어감
    if (!rides.length && p.z > -0.3) p.z = -0.3;
    if (self) { me.userData.emote = speed > 0 ? '' : (self.emote || ''); me.userData.afk = !!self.afk; me.userData.jumpY = me.userData.sit ? 0 : (self.jy || 0); }
    animateAvatar(me, speed, dt);
    // 탑승 / 올라가기
    let ev = null;
    if (!boardedSent && rides.length && p.z > 0.3 && canBoard) {
      const d = lay.doors.find((q) => Math.abs(q.x - p.x) < DOOR_W / 2);
      if (d) { boardedSent = true; ev = { board: { door: d, run: sched.run, live: !!sched.live, t: tt, rides } }; }
    }
    if (p.z > -0.2 && !canBoard && doorsOpen < 0.85) p.z = Math.min(p.z, -0.46); // 문이 닫히면 밀려남
    p.y = inStair(p.x, p.z) ? stairY(p.z) : 0; // 계단 오르내리기 (예전엔 y=0 그대로라 단에 파묻혀 끼임)
    if (p.z > UP_Z + 1.2) upArmed = true;        // 계단 아래쪽(또는 승강장)에 한 번 서야 다시 올라가기 — 계단에서 막 내려온 직후 되돌아가지 않게
    if (upArmed && inStair(p.x, p.z) && p.z < UP_Z) { upArmed = false; ev = { up: true }; }
    updateNpcs(dt, mo, tt);
    crowd.begin(); crowd.add(me, meParts, false); for (const n of npcs) if (n.mesh.visible) crowd.add(n.mesh, n.parts, false); crowd.end();
    // 카메라
    const eye = p.y + 1.55, bx = Math.sin(cam.yaw), bz = Math.cos(cam.yaw), cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch);
    let d = cam.dist;
    for (; d > 1.2; d -= 0.25) { const cx = p.x + bx * d * cp, cz = p.z + bz * d * cp; if (inRoom(cx, cz) || inStair(cx, cz)) break; }
    camera.position.set(p.x + bx * d * cp, THREE.MathUtils.clamp(eye + d * spp, 0.4, CEIL - 0.25), p.z + bz * d * cp);
    camera.lookAt(p.x - bx * 3 * cp, eye - 3 * spp, p.z - bz * 3 * cp);
    return { ...(ev || {}), motion: mo, eta };
  }
  function render() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.render(scene, camera); }
  function dispose() { for (const d of disposables) d.dispose?.(); scene.clear(); }
  function setView(x, z, yaw, pitch = 0.3, dist = 6) { me.position.set(x, 0, z); cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; }
  // 테스트·스크린샷: 다음 열차를 지금으로부터 sec 초 뒤 정차로
  function callTrain(sec = MOTION.APPROACH + 2) { sched = { at: now() + sec * 1000, run: sched?.run ?? 0, live: false }; said = ''; }
  return {
    kind: 'platform', zone, def, line, dir, lay, sign, rides, scene, camera, player: me, cam, update, render, dispose, setView, callTrain,
    get speed() { return speed; }, get sched() { return sched; }, get lastPass() { return null; }, get sitKind() { return me.userData.sit || ''; }, sitDown, standUp, benchSeats,
    stats: () => ({ tris: S.count + G.count, parts: crowd.parts.size, npcs: npcs.length, doors: lay.doors.length }),
  };
}
