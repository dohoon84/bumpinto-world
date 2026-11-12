// [gyeongbu-bus] 9004·1151. 본선은 버스전용차로(1차로) + 파란 차선. 속도는 gyeongbuSpeed.
//   차체는 정자역 시내버스와 같은 createBus 파이프라인(직행좌석 도색, 12.6m 3축 코치, LED 행선판).
//   운수사·제작사 로고와 브랜드 글자는 넣지 않는다.
import * as THREE from 'three';
import { cellMerge, cellMergeEnabled } from '../perf/cellMerge.js'; // [jamsil-perf]
import { ribbonGeo, fixNormalsUp } from '../world.js';
import { busLateralM, chainageAfter, enRoute, nextExpress } from './gyeongbuSpeed.js';
import { EXPRESS_ROAD_Y, EXPRESS_PAVE_R, expressRoadHeight, inPangyoCity, inGangnamCity, GANGNAM_CITY, nearPangyoToll, distToPts } from './gyeongbuWorld.js';
import { EXPRESS_ARS, boardText } from '../gangnam/liveBus.js'; // [livebus]

export const GYEONGBU_EXPRESS_FILE = 'gangnam/gyeongbu-express.json';
export const GYEONGGI_BUS_CREDIT = '버스 노선·정류소 정보: 경기도 (공공데이터포털)';

export function gyeongbuExpressEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const p = new URLSearchParams(search || '');
  return p.get('gangnam') !== '0' && p.get('gangnambus') !== '0' && p.get('expressbus') !== '0';
}

function poseAt(pts, s) {
  let i = 1;
  while (i < pts.length - 1 && pts[i][2] < s) i++;
  const a = pts[i - 1], b = pts[i];
  const span = (b[2] - a[2]) || 1;
  const t = Math.max(0, Math.min(1, (s - a[2]) / span));
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
  return {
    x: a[0] + dx * t, z: a[1] + dz * t,
    lx: dz / L, lz: -dx / L,
    ang: Math.atan2(dx, dz),
  };
}

function samplesAlong(pts, step) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 0.4) continue;
    const n = Math.max(1, Math.round(L / step));
    const lx = dz / L, lz = -dx / L;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({ x: a[0] + dx * t, z: a[1] + dz * t, lx, lz, ang: Math.atan2(dx, dz) });
    }
  }
  return out;
}

/** 본선 1차로와 2차로 사이 파란 점선(한국 버스전용 관례: 푸른 차선). 점 4m, 3점 그리고 2점 쉼. */
function busLaneDashes(pts, off, y = 0.36, hw = 0.18, color = '#1d4ed8', yAt = null) {
  const samples = samplesAlong(pts, 4);
  const pos = [], idx = [];
  let run = -1;
  samples.forEach((s, i) => {
    if (i % 5 >= 3) { run = -1; return; }
    const x = s.x + s.lx * off, z = s.z + s.lz * off;
    const yy = yAt ? yAt(x, z) + (y - EXPRESS_ROAD_Y) : y;
    const v = pos.length / 3;
    pos.push(x - s.lx * hw, yy, z - s.lz * hw, x + s.lx * hw, yy, z + s.lz * hw);
    if (run >= 0) idx.push(run, v, run + 1, run + 1, v, v + 1);
    run = v;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (idx.length) g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  mesh.frustumCulled = false;
  return mesh;
}

/** 1차로 바닥을 옅은 파랑으로 깔아 차로가 한눈에 보이게. */
function busLaneTint(pts, off, width = 3.3, yAt = null) {
  const samples = samplesAlong(pts, 6);
  const pos = [], idx = [];
  const y = 0.34, hw = width / 2;
  samples.forEach((s, i) => {
    const x = s.x + s.lx * off, z = s.z + s.lz * off;
    const yy = yAt ? yAt(x, z) + (y - EXPRESS_ROAD_Y) : y;
    const v = pos.length / 3;
    pos.push(x - s.lx * hw, yy, z - s.lz * hw, x + s.lx * hw, yy, z + s.lz * hw);
    if (i) idx.push(v - 2, v, v - 1, v - 1, v, v + 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (idx.length) g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#1e3a8a', transparent: true, opacity: 0.22, depthWrite: false }));
  mesh.name = 'gyeongbuBusLaneTint';
  mesh.frustumCulled = false;
  return mesh;
}

function placeDecals(pts, off, step, makeMesh) {
  const g = new THREE.Group();
  let acc = 0, next = step * 0.5;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 0.5) continue;
    const lx = dz / L, lz = -dx / L, ang = Math.atan2(dx, dz);
    let used = 0;
    while (acc + L - used >= next) {
      const t = (next - acc) / L;
      const x = a[0] + dx * t + lx * off, z = a[1] + dz * t + lz * off;
      const mesh = makeMesh(x, z, ang);
      if (mesh) g.add(mesh);
      next += step;
    }
    acc += L;
  }
  return g;
}

function busLaneMarkings(pts, data, yAt = null) {
  const g = new THREE.Group();
  g.name = 'gyeongbuBusLane';
  const lineOff = data.lineOff || 3.6;
  const busOff = data.busOff || 5.4;
  g.add(busLaneTint(pts, busOff, (data.laneM || 3.6) * 0.92, yAt));
  g.add(busLaneDashes(pts, lineOff, 0.37, 0.20, '#1d4ed8', yAt));
  g.add(busLaneDashes(pts, lineOff + 0.42, 0.37, 0.12, '#2563eb', yAt));
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/';
  const loadTex = (file) => {
    const tex = new THREE.TextureLoader().load(`${base}corridor/gyeongbu/${file}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };
  const textTex = loadTex('text-buslane.png');
  const textMat = new THREE.MeshBasicMaterial({ map: textTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  // 노면 글자: 세로 PNG(위 버 → 아래 용). 로컬 +Y = 진행(먼 쪽), 로컬 +X = 진행 오른쪽, 법선 +Z = 위.
  // 운전자 시점에서 위→아래가 「버스전용」(먼 쪽 버 · 가까운 쪽 용). 앞면이 위라 좌우 반전 없음.
  const travel = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4();
  g.add(placeDecals(pts, busOff, 90, (x, z, ang) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 9.2), textMat);
    travel.set(Math.sin(ang), 0, Math.cos(ang));
    right.set(-Math.cos(ang), 0, Math.sin(ang));
    basis.makeBasis(right, travel, up);
    m.quaternion.setFromRotationMatrix(basis);
    m.position.set(x, (yAt ? yAt(x, z) : EXPRESS_ROAD_Y) + 0.08, z);
    m.frustumCulled = false;
    return m;
  }));
  const signTex = loadTex('sign-buslane.png');
  const signMat = new THREE.MeshBasicMaterial({ map: signTex });
  const poleMat = new THREE.MeshLambertMaterial({ color: '#6b7280' });
  const poleGeo = new THREE.BoxGeometry(0.12, 3.15, 0.12);
  const boardGeo = new THREE.PlaneGeometry(1.7, 0.85);
  g.add(placeDecals(pts, busOff + 2.7, 420, (x, z, ang) => {
    const wrap = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0, 1.6, 0);
    const board = new THREE.Mesh(boardGeo, signMat);
    board.position.set(0, 3.05, 0.08);
    wrap.add(pole, board);
    wrap.position.set(x, yAt ? yAt(x, z) - EXPRESS_ROAD_Y : 0, z);
    wrap.rotation.y = ang;
    return wrap;
  }));
  // [jamsil-perf] 90 m 마다 노면 글자·420 m 마다 표지판이 메시 하나씩(글자는 절두체 컬링도 꺼짐)이라 경부 전체 약 360 draw call 이
  //   잠실·정자 어디서나 매 프레임 그려졌다. 800 m 칸 × 재질로 합쳐 모양은 그대로, 칸 단위로 컬링한다. ?cellmerge=0 이면 예전대로.
  if (cellMergeEnabled()) cellMerge(g, { cell: 800, allowTransparent: true });
  return g;
}

function coloredBox(w, h, d, color, x, y, z, rotX = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (rotX) geo.rotateX(rotX);
  geo.translate(x, y, z);
  const c = new THREE.Color(color);
  const col = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < geo.attributes.position.count; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function coloredCyl(r, h, segs, color, x, y, z, rotZ = 0) {
  const geo = new THREE.CylinderGeometry(r, r, h, segs);
  if (rotZ) geo.rotateZ(rotZ);
  geo.translate(x, y, z);
  const c = new THREE.Color(color);
  const col = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < geo.attributes.position.count; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function mergeGeo(parts) {
  let n = 0, idxN = 0;
  for (const g of parts) { n += g.attributes.position.count; idxN += g.index.count; }
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = new Uint32Array(idxN);
  let v = 0, k = 0;
  for (const g of parts) {
    const p = g.attributes.position.array, nn = g.attributes.normal.array, c = g.attributes.color.array, id = g.index.array;
    pos.set(p, v * 3); nrm.set(nn, v * 3); col.set(c, v * 3);
    for (let i = 0; i < id.length; i++) idx[k++] = id[i] + v;
    v += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

const SEG7 = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
  5: 'afgcd', 6: 'afgecd', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd',
};

function ledDigit(ch, cx, cy, cz, color = '#ff7a18') {
  const on = SEG7[ch] || '';
  const tw = 0.085, th = 0.032, L = 0.15, H = 0.17;
  const parts = [];
  const add = (id, w, h, d, x, y, z) => {
    if (on.includes(id)) parts.push(coloredBox(w, h, d, color, x, y, z));
  };
  add('a', L, th, tw, cx, cy + H, cz);
  add('d', L, th, tw, cx, cy - H, cz);
  add('g', L * 0.92, th, tw, cx, cy, cz);
  add('b', th, H * 0.85, tw, cx + L * 0.52, cy + H * 0.48, cz);
  add('c', th, H * 0.85, tw, cx + L * 0.52, cy - H * 0.48, cz);
  add('f', th, H * 0.85, tw, cx - L * 0.52, cy + H * 0.48, cz);
  add('e', th, H * 0.85, tw, cx - L * 0.52, cy - H * 0.48, cz);
  return parts;
}

/** 수소 직행좌석. +Z 앞. 노선번호는 눈썹 LED. */
export function expressBusGeo(routeNo = '9004') {
  const RED = '#c4332b', BLACK = '#16181c', GLASS = '#0b1722', SILVER = '#c5c8cc';
  const GREY = '#4b5560', PLATE = '#f5c518', HUB = '#cfd3d8', LEDBG = '#140800';
  const parts = [];
  parts.push(coloredBox(2.48, 1.18, 11.7, RED, 0, 1.48, 0)); // 빨간 하단
  parts.push(coloredBox(2.50, 1.28, 11.7, BLACK, 0, 2.70, 0)); // 검정 상단
  parts.push(coloredBox(2.36, 0.20, 11.4, '#1a1c20', 0, 3.44, -0.05)); // 지붕
  parts.push(coloredBox(2.22, 0.38, 2.55, '#111318', 0, 3.62, -4.15)); // 뒤 지붕 혹(수소)
  parts.push(coloredBox(2.62, 1.02, 8.15, GLASS, 0, 2.78, -0.35)); // 옆 긴 창
  parts.push(coloredBox(2.30, 0.95, 0.10, GLASS, 0, 2.76, -5.92)); // 뒷창
  parts.push(coloredBox(2.28, 1.28, 0.12, GLASS, 0, 2.82, 5.42, -0.20)); // 앞유리(살짝 기울임)
  parts.push(coloredBox(2.18, 0.42, 0.14, '#0c0c10', 0, 3.48, 5.68)); // LED 눈썹
  parts.push(coloredBox(1.55, 0.30, 0.06, LEDBG, -0.12, 3.48, 5.76));
  String(routeNo).padStart(4, ' ').split('').forEach((ch, i) => {
    if (ch === ' ') return;
    parts.push(...ledDigit(Number(ch), -0.58 + i * 0.30, 3.48, 5.80));
  });
  parts.push(coloredBox(0.55, 0.22, 0.05, '#3a2208', 0.72, 3.48, 5.76)); // 오른쪽 행선 칸(글자 없음)
  parts.push(coloredBox(2.12, 0.52, 0.14, SILVER, 0, 1.88, 5.78)); // 앞 은색 패널
  parts.push(coloredBox(2.18, 0.48, 0.14, RED, 0, 1.36, 5.78)); // 앞 빨간 하단
  parts.push(coloredBox(2.38, 0.30, 0.30, GREY, 0, 0.82, 5.84)); // 회색 범퍼
  parts.push(coloredBox(0.36, 0.12, 0.03, PLATE, 0, 0.78, 5.99));
  // 세로 LED 헤드램프
  for (const s of [-1, 1]) {
    parts.push(coloredBox(0.13, 0.82, 0.08, '#e8eef6', s * 1.08, 1.72, 5.90));
    parts.push(coloredBox(0.16, 0.18, 0.08, '#fde68a', s * 1.08, 1.12, 5.90));
  }
  // 앞 모서리 은색 띠 → 옆 사선으로 이어짐
  parts.push(coloredBox(2.20, 0.22, 0.10, SILVER, 0, 1.08, 5.86));
  const stripe = [
    [4.7, 1.10, 1.3], [3.3, 1.18, 1.4], [1.7, 1.28, 1.6],
    [0.0, 1.38, 1.7], [-1.9, 1.48, 1.9], [-4.0, 1.56, 2.1],
  ];
  for (const [z, y, len] of stripe) {
    parts.push(coloredBox(0.07, 0.30, len, SILVER, 1.275, y, z));
    parts.push(coloredBox(0.07, 0.30, len, SILVER, -1.275, y, z));
  }
  // 문(우측, 한국 우측통행 승강장 쪽) · 사이드미러 · 와이퍼
  parts.push(coloredBox(0.08, 2.05, 1.15, '#2a3036', 1.28, 1.95, 3.15));
  parts.push(coloredBox(0.08, 1.15, 0.55, GLASS, 1.30, 2.55, 3.15));
  for (const s of [-1, 1]) {
    parts.push(coloredBox(0.42, 0.10, 0.16, '#1a1a1a', s * 1.42, 2.55, 5.15));
    parts.push(coloredBox(0.10, 0.22, 0.18, GLASS, s * 1.58, 2.55, 5.15));
  }
  parts.push(coloredBox(0.04, 0.04, 1.05, '#1a1a1a', -0.45, 2.35, 5.50, 0.15));
  parts.push(coloredBox(0.04, 0.04, 0.95, '#1a1a1a', 0.50, 2.32, 5.48, 0.18));
  // 바퀴 3축
  for (const z of [-3.85, -1.35, 3.55]) {
    for (const x of [-1.18, 1.18]) {
      parts.push(coloredCyl(0.52, 0.34, 10, '#111111', x, 0.52, z, Math.PI / 2));
      parts.push(coloredCyl(0.28, 0.36, 8, HUB, x, 0.52, z, Math.PI / 2));
    }
  }
  return mergeGeo(parts);
}

function chaikin(pts, iters = 2) {
  let cur = pts.map((p) => [p[0], p[1]]);
  for (let n = 0; n < iters; n++) {
    const next = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i], b = cur[i + 1];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

function resampleXZ(pts, step = 5) {
  const out = [[pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length; i++) {
    let x0 = out[out.length - 1][0], z0 = out[out.length - 1][1];
    const x1 = pts[i][0], z1 = pts[i][1];
    let L = Math.hypot(x1 - x0, z1 - z0);
    while (L >= step) {
      const t = step / L;
      x0 += (x1 - x0) * t; z0 += (z1 - z0) * t;
      out.push([x0, z0]);
      L = Math.hypot(x1 - x0, z1 - z0);
    }
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(out[out.length - 1][0] - last[0], out[out.length - 1][1] - last[1]) > 0.8) out.push([last[0], last[1]]);
  return out;
}

function leftSamples(pts) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return { x: p[0], z: p[1], lx: dz / L, lz: -dx / L, ang: Math.atan2(dx, dz) };
  });
}

function shiftLine(samples, off, lift = null) {
  return samples.map((s) => [s.x + s.lx * off, s.z + s.lz * off, lift ? lift(s.x, s.z) : 0]);
}

function paintGeo(g, color) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function coloredBoxY(w, h, d, color, x, y, z, angY = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (angY) geo.rotateY(angY);
  geo.translate(x, y, z);
  return paintGeo(geo, color);
}

export function expressLayout() {
  const laneW = 3.6, carriage = laneW * 4;
  const innerSh = 1.05, outerSh = 2.55, medianW = 1.4;
  const nbLaneInner = carriage / 2;
  const nbLaneOuter = -carriage / 2;
  const nbInnerEdge = nbLaneInner + innerSh;
  const nbOuterEdge = nbLaneOuter - outerSh;
  const medLo = nbInnerEdge, medHi = nbInnerEdge + medianW;
  const sbLaneInner = medHi + innerSh;
  const sbLaneOuter = sbLaneInner + carriage;
  const sbOuterEdge = sbLaneOuter + outerSh;
  const sbLaneCenter = (sbLaneInner + sbLaneOuter) / 2;
  const medOff = (medLo + medHi) / 2;
  return { laneW, carriage, innerSh, outerSh, medianW, nbLaneInner, nbLaneOuter, nbInnerEdge, nbOuterEdge, medLo, medHi, sbLaneInner, sbLaneOuter, sbOuterEdge, sbLaneCenter, medOff };
}

/** 본선을 5m 간격으로 다듬은 뒤 중앙분리대 중심선. 테스트에서 끊김·단차를 검사한다. */
export function expresswayMedianLine(rawPts) {
  const pts = resampleXZ(chaikin(rawPts, 2), 5);
  if (pts.length < 2) return [];
  const S = leftSamples(pts);
  const { medOff } = expressLayout();
  return S.map((s) => ({ x: s.x + s.lx * medOff, z: s.z + s.lz * medOff, ang: s.ang }));
}

/** 경로를 따라 이어진 콘크리트 벽(윗면+옆면+마구리). 박스 조각이 곡선에서 어긋나지 않게. */
function wallBoxGeo(samples, off, width, y0At, y1At) {
  const hw = width / 2;
  const pos = [], idx = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const cx = s.x + s.lx * off, cz = s.z + s.lz * off;
    const y0 = typeof y0At === 'function' ? y0At(s.x, s.z) : y0At;
    const y1 = typeof y1At === 'function' ? y1At(s.x, s.z) : y1At;
    pos.push(
      cx - s.lx * hw, y0, cz - s.lz * hw,
      cx + s.lx * hw, y0, cz + s.lz * hw,
      cx - s.lx * hw, y1, cz - s.lz * hw,
      cx + s.lx * hw, y1, cz + s.lz * hw,
    );
    if (i) {
      const k = (i - 1) * 4, n = i * 4;
      idx.push(k + 2, n + 2, k + 3, k + 3, n + 2, n + 3);
      idx.push(k + 0, n + 0, k + 2, k + 2, n + 0, n + 2);
      idx.push(k + 1, k + 3, n + 1, k + 3, n + 3, n + 1);
    }
  }
  if (samples.length > 1) {
    const last = (samples.length - 1) * 4;
    idx.push(0, 2, 1, 1, 2, 3);
    idx.push(last + 0, last + 1, last + 2, last + 1, last + 3, last + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 본선 4+4 고속도로. 경로 중심 = 서울 방면 차로 중앙. +lx(왼쪽) = 중앙분리대·반대편. */
function expresswayDeck(rawPts, yAt = null) {
  const pts = resampleXZ(chaikin(rawPts, 2), 5);
  if (pts.length < 4) return null;
  const S = leftSamples(pts);
  const {
    laneW, carriage, innerSh, outerSh, nbLaneInner, nbLaneOuter, nbInnerEdge, nbOuterEdge,
    medHi, sbLaneInner, sbLaneOuter, sbOuterEdge, sbLaneCenter, medOff,
  } = expressLayout();
  const yRoad = EXPRESS_ROAD_Y, ySh = EXPRESS_ROAD_Y - 0.006, yLine = EXPRESS_ROAD_Y + 0.022;
  const surf = (x, z) => (yAt ? yAt(x, z) : yRoad);
  const lift = (x, z) => surf(x, z) - yRoad;
  const ASP = '#4a4f56', SH = '#5c626a', LINE = '#f2f3ef', EDGE = '#eceee9';
  const MED = '#c8c5bc', RAIL = '#b4b8be', POST = '#8b9098';
  const parts = [];
  const addR = (off, w, y, color) => {
    parts.push(paintGeo(fixNormalsUp(ribbonGeo(shiftLine(S, off, lift), w, y, true)), color));
  };
  addR(0, carriage, yRoad, ASP);
  addR((nbLaneInner + nbInnerEdge) / 2, innerSh, ySh, SH);
  addR((nbLaneOuter + nbOuterEdge) / 2, outerSh, ySh, SH);
  addR(sbLaneCenter, carriage, yRoad, ASP);
  addR((medHi + sbLaneInner) / 2, innerSh, ySh, SH);
  addR((sbLaneOuter + sbOuterEdge) / 2, outerSh, ySh, SH);
  addR(nbLaneInner, 0.18, yLine, EDGE);
  addR(nbLaneOuter, 0.18, yLine, EDGE);
  addR(sbLaneInner, 0.18, yLine, EDGE);
  addR(sbLaneOuter, 0.18, yLine, EDGE);

  // 요금소 광장은 부스 섬만 기둥이 있고, 중앙분리대·가드레일 기둥을 차로에 세우지 않는다.
  const notToll = (s) => !nearPangyoToll(s.x, s.z);
  const runs = [];
  let cur = [];
  for (const s of S) {
    if (notToll(s)) cur.push(s);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  for (const run of runs) {
    if (run.length < 2) continue;
    parts.push(paintGeo(wallBoxGeo(run, medOff, 0.58, (x, z) => surf(x, z), (x, z) => surf(x, z) + 1.15), MED));
    parts.push(paintGeo(wallBoxGeo(run, medOff, 0.36, (x, z) => surf(x, z) + 1.15, (x, z) => surf(x, z) + 1.41), '#bbb8b0'));
  }
  for (const off of [nbOuterEdge - 0.2, sbOuterEdge + 0.2]) {
    for (const run of runs) {
      if (run.length < 2) continue;
      parts.push(paintGeo(fixNormalsUp(ribbonGeo(shiftLine(run, off, lift), 0.11, yRoad + 0.64, false)), RAIL));
      parts.push(paintGeo(fixNormalsUp(ribbonGeo(shiftLine(run, off, lift), 0.11, yRoad + 0.40, false)), RAIL));
    }
    for (let i = 0; i < S.length; i += 2) {
      const s = S[i];
      if (!notToll(s)) continue;
      parts.push(coloredBoxY(0.09, 0.78, 0.09, POST, s.x + s.lx * off, surf(s.x, s.z) + 0.39, s.z + s.lz * off, s.ang));
    }
  }
  const g = new THREE.Group();
  g.name = 'gyeongbuExpressway';
  const mesh = new THREE.Mesh(mergeGeo(parts), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.name = 'gyeongbuExpresswayBody';
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  g.add(mesh);
  const dashPts = pts;
  g.add(busLaneDashes(dashPts, 0, yLine, 0.11, LINE, yAt));
  g.add(busLaneDashes(dashPts, -laneW, yLine, 0.11, LINE, yAt));
  g.add(busLaneDashes(dashPts, sbLaneInner + laneW, yLine, 0.11, LINE, yAt));
  g.add(busLaneDashes(dashPts, sbLaneInner + laneW * 2, yLine, 0.11, LINE, yAt));
  g.add(busLaneDashes(dashPts, sbLaneInner + laneW * 3, yLine, 0.11, LINE, yAt));
  return g;
}

function awayFromCities(p) {
  const pangyo = Math.hypot(p[0] - 312.6, p[1] + 2804);
  if (pangyo <= 420) return false;
  // 강남 시가 타일(+여유)에서는 코리더 가로수·갓길 잔디를 심지 않는다.
  if (inGangnamCity(p[0], p[1], 80)) return false;
  return true;
}

// 강남 코리더 타일은 x=-7500 에서 시작한다. 갓길 잔디(폭 140m)가 그 앞에 못 미쳐 생기던 흰 틈을 메운다.
function gangnamSeamFill() {
  const x0 = -7980, x1 = Math.min(-7492, GANGNAM_CITY.x0 - 1), z0 = -15540, z1 = -13970;
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#5b7a45' }));
  mesh.name = 'gyeongbuGangnamSeam';
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

function grassApron(pts, width = 96, y = 0.04) {
  if (!pts || pts.length < 3) return null;
  const geo = fixNormalsUp(ribbonGeo(pts.map((p) => [p[0], p[1], 0]), width, y, false));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#5b7a45' }));
  mesh.name = 'gyeongbuGrassApron';
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

const VERGE_CAP = 700;
const VERGE_ROAD_MARGIN = 4;

/** 갓길 가로수 자리. 실제 심는 좌표가 시가·차도 버퍼 안에 있으면 버린다. */
export function listVergeTreePositions(pts, sideOff = 22, roadPts = null) {
  const out = [];
  if (!pts || pts.length < 3) return out;
  const minSetback = Math.max(34, sideOff + 6);
  const roads = roadPts && roadPts.length ? roadPts : pts;
  for (let i = 1; i < pts.length && out.length < VERGE_CAP; i += 1) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 8) continue;
    const hx = dx / L, hz = dz / L, lx = hz, lz = -hx;
    const step = 11;
    for (let t = 0; t < L && out.length < VERGE_CAP; t += step) {
      const x = a[0] + hx * t, z = a[1] + hz * t;
      if (!awayFromCities([x, z]) || nearPangyoToll(x, z, 70)) continue;
      const rnd = hash01(x, z);
      if (rnd < 0.52) continue;
      const cluster = rnd > 0.92 ? 4 : rnd > 0.8 ? 3 : rnd > 0.66 ? 2 : 1;
      for (let e = 0; e < cluster && out.length < VERGE_CAP; e++) {
        const r1 = hash01(x + e * 13.1, z + 4.7);
        const r2 = hash01(x - 8.2, z + e * 9.4);
        const side = r1 > 0.5 ? 1 : -1;
        const along = (r2 - 0.5) * 16;
        const lat = minSetback + r1 * 28 + e * 3.4;
        const tx = x + hx * along + lx * lat * side + (r2 - 0.5) * 7;
        const tz = z + hz * along + lz * lat * side + (r1 - 0.5) * 7;
        if (nearPangyoToll(tx, tz, 55)) continue;
        if (!awayFromCities([tx, tz])) continue;
        if (distToPts(tx, tz, roads) < EXPRESS_PAVE_R + VERGE_ROAD_MARGIN) continue;
        out.push({ x: tx, z: tz, r1, r2, e });
      }
    }
  }
  return out;
}

function vergeTrees(pts, sideOff = 22, roadPts = null) {
  const spots = listVergeTreePositions(pts, sideOff, roadPts);
  if (!spots.length) return null;
  const trunk = new THREE.CylinderGeometry(0.18, 0.26, 1.9, 5);
  trunk.translate(0, 0.95, 0);
  const crown = new THREE.ConeGeometry(1.85, 4.6, 6);
  crown.translate(0, 3.35, 0);
  const parts = [trunk, crown].map((g, i) => {
    const c = new THREE.Color(i === 0 ? '#5a4030' : '#356338');
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < g.attributes.position.count; k++) { col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const geo = mergeGeo(parts);
  trunk.dispose(); crown.dispose();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), spots.length);
  mesh.name = 'gyeongbuVergeTrees';
  mesh.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pp = new THREE.Vector3(), ss = new THREE.Vector3();
  spots.forEach((t, i) => {
    pp.set(t.x, 0, t.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r1 * 6.4 + t.e);
    const sc = 0.72 + t.r2 * 0.7;
    ss.set(sc, sc * (0.88 + t.r1 * 0.28), sc);
    mesh.setMatrixAt(i, m4.compose(pp, q, ss));
  });
  mesh.count = spots.length;
  return mesh;
}

function makeHwySignTex(lines) {
  const cv = document.createElement('canvas');
  const rowH = 90;
  cv.width = 560; cv.height = 40 + lines.length * rowH;
  const x = cv.getContext('2d');
  x.fillStyle = '#0b6b3a';
  x.fillRect(0, 0, cv.width, cv.height);
  x.strokeStyle = '#fff';
  x.lineWidth = 12;
  x.strokeRect(10, 10, cv.width - 20, cv.height - 20);
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = 'bold 62px sans-serif';
  lines.forEach((t, i) => x.fillText(t, cv.width / 2, 28 + i * rowH + rowH / 2));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function highwayDirectionSigns(pts) {
  // 실제 지명만. 한국 고속도로 초록 안내판 (로고 없음).
  const marks = [
    { s: 720, lines: ['서울', '양재'] },
    { s: 3850, lines: ['서울', '양재'] },
    { s: 8180, lines: ['서울', '양재'] },
    { s: 9920, lines: ['양재', '서초', '강남'] },
    { s: 11840, lines: ['강남', '서초'] },
  ];
  const g = new THREE.Group();
  g.name = 'gyeongbuDirectionSigns';
  const poleMat = new THREE.MeshLambertMaterial({ color: '#6b7280' });
  const poleGeo = new THREE.BoxGeometry(0.16, 4.2, 0.16);
  for (const m of marks) {
    const p = poseAt(pts, m.s);
    const tex = makeHwySignTex(m.lines);
    const h = 1.05 + m.lines.length * 0.72;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    const wrap = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0, 2.1, 0);
    board.position.set(0, 3.35 + h * 0.15, 0.1);
    wrap.add(pole, board);
    const right = 10.4;
    wrap.position.set(p.x - p.lx * right, 0, p.z - p.lz * right);
    wrap.rotation.y = p.ang + Math.PI;
    g.add(wrap);
  }
  return g;
}

function hash01(x, z) {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export const CORRIDOR_FILL_BOX = Object.freeze({ x0: -8600, x1: 480, z0: -15850, z1: -2360 });
export const CORRIDOR_FILL_CITY_Y = -0.55; // 시가 타일 바닥(0)보다 낮게 — 시가가 이긴다

function cityClipWeight(x, z) {
  const b = GANGNAM_CITY;
  if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return 0;
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dz = Math.max(b.z0 - z, 0, z - b.z1);
  const d = Math.hypot(dx, dz);
  const feather = 90;
  if (d >= feather) return 1;
  return d / feather;
}

/** 코리더 메움 지면 높이. 시가 타일 안은 시가 바닥보다 낮거나 없음. */
export function corridorFillHeight(x, z, pts) {
  const B = CORRIDOR_FILL_BOX;
  if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return null;
  const d = pts?.length ? distToPts(x, z, pts) : 1e9;
  const pangyo = inPangyoCity(x, z);
  const n = hash01(Math.round(x * 0.2), Math.round(z * 0.2));
  let y = (pangyo && d > 90) ? -0.08 : 0.025;
  if (!pangyo && d > 100) y += Math.min(5.5, (d - 100) * 0.0035) * (0.25 + n * 0.75);
  const w = cityClipWeight(x, z);
  if (w <= 0) return CORRIDOR_FILL_CITY_Y;
  if (w < 1) y = CORRIDOR_FILL_CITY_Y + (y - CORRIDOR_FILL_CITY_Y) * w;
  return y;
}

function corridorLandMesh(pts) {
  // 판교 시가~양재 사이 회색 클리어 색이 보이지 않도록 코리더 전체를 숲·잔디 지면으로 덮는다.
  // 강남 시가 타일 안은 시가 바닥보다 낮춰, 도로·보도가 풀언덕에 묻히지 않게 한다.
  const { x0, x1, z0, z1 } = CORRIDOR_FILL_BOX;
  const step = 70;
  const nx = Math.floor((x1 - x0) / step) + 1;
  const nz = Math.floor((z1 - z0) / step) + 1;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const grass = new THREE.Color('#5b7a45');
  const woods = new THREE.Color('#3a5a32');
  const forest = new THREE.Color('#2a4528');
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const x = x0 + ix * step, z = z0 + iz * step;
      const d = pts?.length ? distToPts(x, z, pts) : 1e9;
      const n = hash01(Math.round(x * 0.2), Math.round(z * 0.2));
      const y = corridorFillHeight(x, z, pts) ?? 0.025;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const c = (d < 110 || y < 0.8) ? grass : (n > 0.58 ? forest : woods);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix, b = a + 1, c = a + nx, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'gyeongbuApproachFill';
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

export function keepDeckPoint(p) {
  if (p[3] === 'main' || p[3] === 'spur') return true;
  if (p[3] !== 'approach') return false;
  // 판교 시가 안쪽은 기존 타일 도로를 남기고, 서쪽 가장자리(x<-200)부터는 본선과 잇는다.
  return p[0] < -200 || !inPangyoCity(p[0], p[1]);
}

/** 본선 4+4 양 차로 중심. 5m 간격. 노면 연속·겹침 테스트에 쓴다. */
export function expressDeckLaneCenters(rawPts) {
  const trunk = (rawPts || []).filter(keepDeckPoint);
  const pts = resampleXZ(chaikin(trunk, 2), 5);
  if (pts.length < 2) return [];
  const S = leftSamples(pts);
  const { sbLaneCenter } = expressLayout();
  const out = [];
  for (const s of S) {
    out.push({ x: s.x, z: s.z, side: 'nb', hx: -s.lz, hz: s.lx });
    out.push({ x: s.x + s.lx * sbLaneCenter, z: s.z + s.lz * sbLaneCenter, side: 'sb', hx: -s.lz, hz: s.lx });
  }
  return out;
}

export function mountGyeongbuExpress(group, data, { overlay, liveBus = null } = {}) {
  if (!data?.pts?.length || !data.routes?.length) return null;
  const yAt = (x, z) => expressRoadHeight(x, z, data.pts) ?? EXPRESS_ROAD_Y;
  const approach = data.pts.filter((p) => p[3] === 'approach' && keepDeckPoint(p));
  const spur = data.pts.filter((p) => p[3] === 'spur');
  const spurLand = spur.filter(awayFromCities);
  const apronA = grassApron(approach, 320);
  if (apronA) group.add(apronA);
  const apronS = grassApron(spurLand, 320);
  if (apronS) group.add(apronS);
  group.add(corridorLandMesh(data.pts));
  group.add(gangnamSeamFill());
  const treesA = vergeTrees(approach, 28, data.pts);
  if (treesA) group.add(treesA);
  const treesS = vergeTrees(spurLand, 24, data.pts);
  if (treesS) group.add(treesS);
  group.add(highwayDirectionSigns(data.pts));
  const trunk = data.pts.filter(keepDeckPoint);
  if (trunk.length > 3) {
    const deck = expresswayDeck(trunk, yAt);
    if (deck) group.add(deck);
    const smooth = resampleXZ(chaikin(trunk, 2), 5);
    group.add(busLaneMarkings(smooth.length > 3 ? smooth : trunk, data, yAt));
  }

  const cap = 8;
  const dest = { 9004: '강남역', 1151: '강남역' };
  const pools = { 9004: [], 1151: [] };
  // createBus 는 document/캔버스를 쓰므로 브라우저에서만 불러 정자역 시내버스와 같은 모델을 쓴다.
  import('../transit/busModel.js').then(({ createBus }) => {
    for (const no of ['9004', '1151']) {
      for (let i = 0; i < cap; i++) {
        const mesh = createBus(no, 'express', dest[no], { body: 'coach3' });
        mesh.name = `gyeongbuExpressBuses-${no}`;
        mesh.visible = false;
        mesh.frustumCulled = false;
        group.add(mesh);
        pools[no].push(mesh);
      }
    }
  }).catch((err) => { console.warn('[gyeongbu] createBus load failed', err); });

  const byStop = new Map();
  for (const r of data.routes) for (const s of r.stops || []) {
    const key = `${s.name}@${Math.round(s.x)}`;
    if (!byStop.has(key)) byStop.set(key, { ...s, routes: [] });
    byStop.get(key).routes.push(r);
  }
  const labels = [];
  if (overlay) {
    for (const s of byStop.values()) {
      if (/\(중\)/.test(s.name) || /신분당선강남역|지하철2호선강남역/.test(s.name)) continue; // 중앙차로 안내는 BRT 쪽
      const item = overlay.add({
        cls: 'label busstop',
        text: s.name,
        getPos: () => new THREE.Vector3(s.x, 3.4, s.z),
        maxDist: 220,
      });
      labels.push({ s, item });
    }
  }
  liveBus?.register(labels.map(({ s }) => ({ ref: EXPRESS_ARS[s.name], x: s.x, z: s.z })).filter((s) => s.ref));

  function hideAll() {
    for (const no of Object.keys(pools)) {
      for (const mesh of pools[no]) mesh.visible = false;
    }
  }

  function update(min, kind, x, z) {
    const live = [];
    for (const r of data.routes) {
      const block = r.timetable?.[kind] || r.timetable?.weekday;
      if (!block) continue;
      for (const e of enRoute(block, min, data.eta?.seconds || data.lengthM / 13.9)) {
        live.push({ no: r.no, s: chainageAfter(data, 0, e.elapsed) });
      }
    }
    live.sort((a, b) => Number(b.s > data.main0 && b.s < data.main1) - Number(a.s > data.main0 && a.s < data.main1));
    for (let i = 1; i < live.length; i++) if (Math.abs(live[i].s - live[i - 1].s) < 30) live[i].s += 36;
    hideAll();
    const slot = { 9004: 0, 1151: 0 };
    for (const b of live) {
      const list = pools[b.no];
      if (!list) continue;
      if (slot[b.no] >= cap) continue;
      const p = poseAt(data.pts, b.s);
      const lat = busLateralM(b.s, data);
      const px = p.x + p.lx * lat, pz = p.z + p.lz * lat;
      if (Math.hypot(px - x, pz - z) > 1400) continue;
      const mesh = list[slot[b.no]];
      if (!mesh) continue;
      slot[b.no]++;
      mesh.visible = true;
      mesh.position.set(px, expressRoadHeight(px, pz, data.pts) ?? 0, pz);
      mesh.rotation.y = p.ang;
    }
    for (const { s, item } of labels) {
      const ars = EXPRESS_ARS[s.name];
      const live = ars ? liveBus?.arrivals(ars) : null;
      let text = boardText(live);
      if (!text) {
        let best = null;
        const nos = [];
        for (const r of s.routes) {
          if (!nos.includes(r.no)) nos.push(r.no);
          const block = r.timetable?.[kind] || r.timetable?.weekday;
          const n = nextExpress(block, min, { fromGangnam: !!s.fromGangnam });
          if (n && (!best || n.waitMin < best.waitMin)) best = n;
        }
        text = `🚏 ${nos.join('·')} ${best ? `다음 ${best.label}` : ''}`.trim();
      }
      if (item?.el) item.el.textContent = text;
      else if (item) item.text = text;
    }
  }
  return { update, pools };
}
