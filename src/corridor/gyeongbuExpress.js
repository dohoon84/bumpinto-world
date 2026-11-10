// [gyeongbu-bus] 9004·1151. 본선은 버스전용차로(1차로) + 파란 차선. 속도는 gyeongbuSpeed.
//   차체는 수소 직행좌석(둥근 상자, 검정 지붕·윗부분, 긴 옆창, 빨간 하단+회색 사선, 주황 LED 행선판).
//   운수사·제작사 로고와 브랜드 글자는 넣지 않는다.
import * as THREE from 'three';
import { ribbonGeo, fixNormalsUp } from '../world.js';
import { busLateralM, chainageAfter, enRoute, nextExpress } from './gyeongbuSpeed.js';

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
function busLaneDashes(pts, off, y = 0.36, hw = 0.18, color = '#1d4ed8') {
  const samples = samplesAlong(pts, 4);
  const pos = [], idx = [];
  let run = -1;
  samples.forEach((s, i) => {
    if (i % 5 >= 3) { run = -1; return; }
    const x = s.x + s.lx * off, z = s.z + s.lz * off;
    const v = pos.length / 3;
    pos.push(x - s.lx * hw, y, z - s.lz * hw, x + s.lx * hw, y, z + s.lz * hw);
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
function busLaneTint(pts, off, width = 3.3) {
  const samples = samplesAlong(pts, 6);
  const pos = [], idx = [];
  const y = 0.34, hw = width / 2;
  samples.forEach((s, i) => {
    const x = s.x + s.lx * off, z = s.z + s.lz * off;
    const v = pos.length / 3;
    pos.push(x - s.lx * hw, y, z - s.lz * hw, x + s.lx * hw, y, z + s.lz * hw);
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

function busLaneMarkings(pts, data) {
  const g = new THREE.Group();
  g.name = 'gyeongbuBusLane';
  const lineOff = data.lineOff || 3.6;
  const busOff = data.busOff || 5.4;
  g.add(busLaneTint(pts, busOff, (data.laneM || 3.6) * 0.92));
  g.add(busLaneDashes(pts, lineOff, 0.37, 0.20, '#1d4ed8'));
  g.add(busLaneDashes(pts, lineOff + 0.42, 0.37, 0.12, '#2563eb'));
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/';
  const loadTex = (file) => {
    const tex = new THREE.TextureLoader().load(`${base}corridor/gyeongbu/${file}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };
  const textTex = loadTex('text-buslane.png');
  const textMat = new THREE.MeshBasicMaterial({ map: textTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  // 노면 글자: 세로 PNG(아래 버 → 위 용). 로컬 +Y = 진행, 로컬 +X = 진행 오른쪽, 법선 +Z = 위.
  // 운전자가 보면 글자가 바로 서 있고, 가까운 쪽(아래)이 「버」, 먼 쪽(위)이 「용」. 앞면이 위라 좌우 반전 없음.
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
    m.position.set(x, 0.38, z);
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
    wrap.position.set(x, 0, z);
    wrap.rotation.y = ang;
    return wrap;
  }));
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

export function mountGyeongbuExpress(group, data, { overlay } = {}) {
  if (!data?.pts?.length || !data.routes?.length) return null;
  const spur = data.pts.filter((p) => p[3] === 'spur');
  if (spur.length > 3) {
    const geo = fixNormalsUp(ribbonGeo(spur.map((p) => [p[0], p[1], 0.25, 16]), 16, 0, false));
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#5e646c' }));
    mesh.name = 'gyeongbuSpur';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const main = data.pts.filter((p) => p[3] === 'main');
  if (main.length > 3) group.add(busLaneMarkings(main, data));

  const cap = 3;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const meshes = {};
  for (const no of ['9004', '1151']) {
    const mesh = new THREE.InstancedMesh(expressBusGeo(no), mat, cap);
    mesh.name = `gyeongbuExpressBuses-${no}`;
    mesh.count = cap;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    group.add(mesh);
    meshes[no] = mesh;
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const byStop = new Map();
  for (const r of data.routes) for (const s of r.stops || []) {
    const key = `${s.name}@${Math.round(s.x)}`;
    if (!byStop.has(key)) byStop.set(key, { ...s, routes: [] });
    byStop.get(key).routes.push(r);
  }
  const labels = [];
  if (overlay) {
    for (const s of byStop.values()) {
      const item = overlay.add({
        cls: 'label busstop',
        text: s.name,
        getPos: () => new THREE.Vector3(s.x, 3.4, s.z),
        maxDist: 220,
      });
      labels.push({ s, item });
    }
  }

  function hideAll() {
    for (const no of Object.keys(meshes)) {
      for (let i = 0; i < cap; i++) {
        m4.compose(zero, q.identity(), zero);
        meshes[no].setMatrixAt(i, m4);
      }
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
      const mesh = meshes[b.no];
      if (!mesh) continue;
      const i = slot[b.no]++;
      if (i >= cap) continue;
      const p = poseAt(data.pts, b.s);
      const lat = busLateralM(b.s, data);
      const px = p.x + p.lx * lat, pz = p.z + p.lz * lat;
      if (Math.hypot(px - x, pz - z) > 1400) continue;
      q.setFromAxisAngle(up, p.ang);
      m4.compose(pos.set(px, 0.15, pz), q, scl);
      mesh.setMatrixAt(i, m4);
    }
    for (const no of Object.keys(meshes)) meshes[no].instanceMatrix.needsUpdate = true;
    for (const { s, item } of labels) {
      let best = null;
      const nos = [];
      for (const r of s.routes) {
        if (!nos.includes(r.no)) nos.push(r.no);
        const block = r.timetable?.[kind] || r.timetable?.weekday;
        const n = nextExpress(block, min, { fromGangnam: !!s.fromGangnam });
        if (n && (!best || n.waitMin < best.waitMin)) best = n;
      }
      const text = `🚏 ${nos.join('·')} ${best ? `다음 ${best.label}` : ''}`.trim();
      if (item?.el) item.el.textContent = text;
      else if (item) item.text = text;
    }
  }
  return { update, meshes };
}
