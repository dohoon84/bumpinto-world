// [schoolzone] 야탑초등학교 어린이 보호구역.
// 양현로 400 (공공데이터 37.416616, 127.125627 → 정자 원점 약 1528.6, -5539.8) 의 학교 건물.
// 풋프린트는 코리더 타일 3_-12 의 kind=school (중심 1553.8, -5529.9, 높이 18.2m).
// 정면(북쪽) 양현로 secondary 폭 12m (z≈-5562) 와 그 위 횡단보도 두 곳(x=1450, x=1616.6).
// 기본으로 켠다. ?schoolzone=0 이면 아무것도 만들지 않는다.
// 메시는 적색 포장 1 + 노란선 1 + 노면 글자/30(텍스처 2장 공유) + 표지판(인스턴스) + 명판 1.
import * as THREE from 'three';

const KO = '"Noto Sans KR", "Noto Sans CJK KR", "WenQuanYi Micro Hei", "NanumGothic", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

export const SCHOOL_RED = '#d23830';
export const SCHOOL_YELLOW = '#f2c200';
const Y_RED = 0.1;      // 차도 리본(0.065)·중앙선(0.09) 위, 횡단 지브라(0.108) 아래
const Y_MARK = 0.122;   // 노면 글자·30
const Y_LINE = 0.132;   // 노란 가장자리·정지선 (지브라 바깥)
const RED_W = 11.5;
const LINE_W = 0.38;
const STOP_D = 5.65;    // 횡단보도 중심에서 노란 정지선까지 (지브라 ±2.2, 흰 정지선 ±3.8 보다 밖)
const ROAD_X0 = 1436;
const ROAD_X1 = 1702;

// 타일 3_-12 school 링. 북쪽 정면 벽은 마지막 점 → 첫 점.
export const YATAP_SCHOOL_RING = [
  [1502.3, -5537.3], [1502.6, -5518.9], [1596.7, -5520.7],
  [1596.4, -5532.1], [1562.5, -5531.1], [1562.5, -5539.4],
];
// 양현로 중심선 (서→동). 타일 2_-12 / 3_-12 secondary w=12.
export const YATAP_ROAD = [
  [1433, -5562.8], [1450, -5562.7], [1616.6, -5562], [1662.1, -5561.9],
  [1689.5, -5561.5], [1700.3, -5561.6], [1752.5, -5562.2],
];
// base.json 횡단보도. dir = 도로 방향 (crossings.js 와 같음).
export const YATAP_CROSSINGS = [
  { x: 1450, z: -5562.7, dir: [-1, -0.004], w: 12 },
  { x: 1616.6, z: -5562, dir: [-1, -0.004], w: 12 },
];

export function schoolZoneEnabled(params) {
  try {
    const p = params && typeof params.get === 'function' ? params : (typeof location !== 'undefined' ? new URLSearchParams(location.search) : null);
    if (!p) return true;
    return p.get('schoolzone') !== '0';
  } catch { return true; }
}

const hypot2 = (x, z) => Math.hypot(x, z) || 1;
export function sampleYatapRoad(x) {
  const pts = YATAP_ROAD;
  if (x <= pts[0][0]) return { x: pts[0][0], z: pts[0][1], tx: 1, tz: 0 };
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    if (x <= bx || i === pts.length - 1) {
      const t = Math.max(0, Math.min(1, (x - ax) / (bx - ax || 1)));
      const tx = bx - ax, tz = bz - az, L = hypot2(tx, tz);
      return { x: ax + tx * t, z: az + tz * t, tx: tx / L, tz: tz / L };
    }
  }
  const n = pts.length;
  return { x: pts[n - 1][0], z: pts[n - 1][1], tx: 1, tz: 0 };
}

function unit(x, z) { const L = hypot2(x, z); return [x / L, z / L]; }

/** 배치만. three 없이 테스트한다. */
export function planYatapSchoolZone() {
  // 도로를 향한 동쪽 북벽(링 3→4). 노면 글자·표지와 같은 시선에 들어온다.
  const E = YATAP_SCHOOL_RING[4], D = YATAP_SCHOOL_RING[3];
  const [tx, tz] = unit(D[0] - E[0], D[1] - E[1]);
  const [nx, nz] = unit(tz, -tx); // 벽 밖(북쪽, 양현로).
  const along = 0.42 * Math.hypot(D[0] - E[0], D[1] - E[1]);
  const px = E[0] + tx * along, pz = E[1] + tz * along;
  const plate = {
    x: px + nx * 0.22, y: 4.55, z: pz + nz * 0.22,
    w: 10.4, h: 2.45, nx, nz, tx, tz, text: '야탑초등학교',
  };
  const signAt = (x, face) => {
    const r = sampleYatapRoad(x);
    const [sx, sz] = unit(-r.tz, r.tx); // 남쪽(학교) 인도. 가로수(도로 가장자리+1.6m)보다 차도에 붙인다.
    const off = 6 + 1.35;
    const n = face < 0 ? unit(-r.tx, -r.tz) : unit(r.tx, r.tz);
    return { x: r.x + sx * off, z: r.z + sz * off, y: 0, nx: n[0], nz: n[1], w: 1.5, h: 2.1, bottom: 1.42 };
  };
  const marks = [
    { kind: 'text', text: '어린이 보호구역', x: 1570, w: 15.4, h: 3.15, face: 1 },
    { kind: 'disc', text: '30', x: 1588, w: 6.4, h: 6.4, face: 1 },
    { kind: 'disc', text: '30', x: 1635, w: 6.6, h: 6.6, face: -1 },
    { kind: 'text', text: '어린이 보호구역', x: 1658, w: 16.2, h: 3.2, face: -1 },
  ].map((m) => {
    const r = sampleYatapRoad(m.x);
    const fwd = m.face < 0 ? [-r.tx, -r.tz] : [r.tx, r.tz];
    return { ...m, x: r.x, z: r.z, fx: fwd[0], fz: fwd[1] };
  });
  const stops = [];
  for (const c of YATAP_CROSSINGS) {
    const [dx, dz] = unit(c.dir[0], c.dir[1]);
    const [qx, qz] = unit(-dz, dx);
    for (const sgn of [-1, 1]) {
      stops.push({ x: c.x + dx * sgn * STOP_D, z: c.z + dz * sgn * STOP_D, dx, dz, qx, qz, w: RED_W - 0.7, t: 0.62 });
    }
  }
  const samples = [];
  for (let x = ROAD_X0; x <= ROAD_X1 + 0.1; x += 10) samples.push(sampleYatapRoad(Math.min(x, ROAD_X1)));
  return { plate, signs: [signAt(1561, -1), signAt(1643, 1)], marks, stops, samples, redW: RED_W };
}

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
function fitText(g, text, maxW, px, min) {
  let s = px;
  g.font = `bold ${s}px ${KO}`;
  while (s > min && g.measureText(text).width > maxW) { s -= 2; g.font = `bold ${s}px ${KO}`; }
  return s;
}

function drawPlate(g, w, h) {
  g.fillStyle = '#16386a';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#f4e4c4';
  g.fillRect(18, 18, w - 36, h - 36);
  g.fillStyle = '#1f6b45';
  g.fillRect(18, 18, w - 36, 22);
  g.fillStyle = '#14284a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, '야탑초등학교', w - 120, 150, 72);
  g.fillText('야탑초등학교', w / 2, h / 2 + 12);
}

function walker(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#f7fbff';
  g.strokeStyle = '#10233f';
  g.lineWidth = Math.max(3, s * 0.08);
  g.lineJoin = 'round';
  g.beginPath();
  g.arc(0, -s * 0.72, s * 0.22, 0, Math.PI * 2);
  g.fill(); g.stroke();
  g.beginPath();
  g.moveTo(0, -s * 0.48);
  g.lineTo(-s * 0.28, -s * 0.02);
  g.lineTo(-s * 0.16, s * 0.16);
  g.lineTo(s * 0.18, s * 0.16);
  g.lineTo(s * 0.42, -s * 0.08);
  g.closePath();
  g.fill(); g.stroke();
  g.beginPath();
  g.moveTo(-s * 0.08, s * 0.12);
  g.lineTo(-s * 0.3, s * 0.62);
  g.moveTo(s * 0.12, s * 0.12);
  g.lineTo(s * 0.34, s * 0.58);
  g.stroke();
  g.restore();
}

function drawSign(g, w, h) {
  g.fillStyle = '#f6c31a';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#161616';
  g.lineWidth = 18;
  g.strokeRect(9, 9, w - 18, h - 18);
  g.lineWidth = 8;
  g.strokeRect(40, 40, w - 80, 118);
  g.fillStyle = '#161616';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, '어린이보호구역', w - 120, 54, 28);
  g.fillText('어린이보호구역', w / 2, 100);

  g.beginPath();
  g.moveTo(w / 2, 186);
  g.lineTo(78, 520);
  g.lineTo(w - 78, 520);
  g.closePath();
  g.fillStyle = '#1a56b5';
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#0d2f6e';
  g.stroke();
  walker(g, w / 2 - 58, 400, 108);
  walker(g, w / 2 + 62, 418, 82);
  g.fillStyle = '#f4f8ff';
  g.strokeStyle = 'transparent';
  fitText(g, '어린이보호', 250, 40, 22);
  g.fillText('어린이보호', w / 2, 478);

  const cx = w / 2, cy = 630, rad = 112;
  g.beginPath();
  g.arc(cx, cy, rad, 0, Math.PI * 2);
  g.fillStyle = '#f7f7f5';
  g.fill();
  g.lineWidth = 26;
  g.strokeStyle = '#e10600';
  g.stroke();
  g.fillStyle = '#161616';
  fitText(g, '30', rad * 1.35, 104, 64);
  g.fillText('30', cx, cy + 4);
}

function drawRoadText(g, w, h) {
  g.fillStyle = SCHOOL_RED;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, '어린이 보호구역', w - 48, Math.floor(h * 0.72), 48);
  g.fillText('어린이 보호구역', w / 2, h / 2 + 4);
}

function drawDisc(g, w) {
  g.fillStyle = SCHOOL_RED;
  g.fillRect(0, 0, w, w);
  const c = w / 2, rad = w * 0.44;
  g.beginPath();
  g.arc(c, c, rad, 0, Math.PI * 2);
  g.lineWidth = w * 0.075;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, '30', rad * 1.45, Math.floor(w * 0.34), 48);
  g.fillText('30', c, c + w * 0.01);
}

function bufGeo(pos, uv, idx, want) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (want) {
    const n = g.attributes.normal;
    if (n.getX(0) * want[0] + n.getY(0) * want[1] + n.getZ(0) * want[2] < 0) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
      g.computeVertexNormals();
    }
  }
  return g;
}

function groundQuad(x, z, fx, fz, w, h, y) {
  const L = hypot2(fx, fz); fx /= L; fz /= L;
  const rx = -fz, rz = fx; // 텍스처 +x = 진행 방향의 오른쪽
  const hw = w / 2, hh = h / 2;
  const pos = [], uv = [];
  for (const [lx, ly, u, v] of [[-hw, -hh, 0, 0], [hw, -hh, 1, 0], [hw, hh, 1, 1], [-hw, hh, 0, 1]]) {
    pos.push(x + rx * lx + fx * ly, y, z + rz * lx + fz * ly);
    uv.push(u, v);
  }
  return bufGeo(pos, uv, [0, 1, 2, 0, 2, 3], [0, 1, 0]);
}

function wallQuad(x, y, z, ax, az, nx, nz, w, h) {
  const hw = w / 2, hh = h / 2;
  const pos = [], uv = [];
  for (const [lx, ly, u, v] of [[-hw, -hh, 0, 0], [hw, -hh, 1, 0], [hw, hh, 1, 1], [-hw, hh, 0, 1]]) {
    pos.push(x + ax * lx, y + ly, z + az * lx);
    uv.push(u, v);
  }
  return bufGeo(pos, uv, [0, 1, 2, 0, 2, 3], [nx, 0, nz]);
}

function addQuad(pos, idx, cx, cz, ax, az, bx, bz, hl, hw, y) {
  const base = pos.length / 3;
  for (const [u, v] of [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]]) pos.push(cx + ax * u + bx * v, y, cz + az * u + bz * v);
  idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

function yellowGeo(plan) {
  const pos = [], idx = [];
  const samples = plan.samples;
  const side = RED_W / 2 - LINE_W / 2 - 0.12;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if (YATAP_CROSSINGS.some((c) => Math.abs(c.x - mx) < 4.4)) continue;
    const dx = b.x - a.x, dz = b.z - a.z, L = hypot2(dx, dz);
    const tx = dx / L, tz = dz / L, qx = -tz, qz = tx;
    for (const sgn of [-1, 1]) addQuad(pos, idx, mx + qx * sgn * side, mz + qz * sgn * side, tx, tz, qx, qz, L / 2, LINE_W / 2, Y_LINE);
  }
  for (const s of plan.stops) addQuad(pos, idx, s.x, s.z, s.qx, s.qz, s.dx, s.dz, s.w / 2, s.t / 2, Y_LINE);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

function redGeo(plan) {
  const pos = [], idx = [];
  const samples = plan.samples, hw = RED_W / 2;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const L = hypot2(dx, dz); dx /= L; dz /= L;
    const p = samples[i];
    pos.push(p.x - dz * hw, Y_RED, p.z + dx * hw, p.x + dz * hw, Y_RED, p.z - dx * hw);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

const paintMat = (color, order, factor) => {
  const m = new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: factor, side: THREE.DoubleSide });
  m.depthWrite = true;
  return m;
};

/**
 * @param {THREE.Object3D} parent
 * @param {URLSearchParams | { get: (k: string) => string | null } | null} params
 * @returns {{ group: THREE.Group, plan: object, dispose: () => void } | null}
 */
export function mountYatapSchoolZone(parent, params) {
  if (!schoolZoneEnabled(params)) return null;
  const plan = planYatapSchoolZone();
  const group = new THREE.Group();
  group.name = 'yatapSchoolZone';

  const red = new THREE.Mesh(redGeo(plan), paintMat(SCHOOL_RED, 2, -1));
  red.name = 'schoolzone-red'; red.renderOrder = 2; red.receiveShadow = true;
  group.add(red);
  const yellow = new THREE.Mesh(yellowGeo(plan), paintMat(SCHOOL_YELLOW, 3, -3));
  yellow.name = 'schoolzone-yellow'; yellow.renderOrder = 3;
  group.add(yellow);

  const textTex = canvasTex(1024, 256, (g, w, h) => drawRoadText(g, w, h));
  const discTex = canvasTex(512, 512, (g, w) => drawDisc(g, w));
  const textMat = new THREE.MeshBasicMaterial({ map: textTex, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide });
  const discMat = new THREE.MeshBasicMaterial({ map: discTex, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide });
  for (const m of plan.marks) {
    const geo = groundQuad(m.x, m.z, m.fx, m.fz, m.w, m.h, Y_MARK);
    const mesh = new THREE.Mesh(geo, m.kind === 'disc' ? discMat : textMat);
    mesh.name = m.kind === 'disc' ? 'schoolzone-30' : 'schoolzone-text';
    mesh.renderOrder = 4;
    group.add(mesh);
  }

  const plateTex = canvasTex(1024, 256, (g, w, h) => drawPlate(g, w, h));
  const p = plan.plate;
  const ax = p.nz, az = -p.nx; // 밖에서 볼 때 글자 왼쪽→오른쪽
  const plate = new THREE.Mesh(
    wallQuad(p.x, p.y, p.z, ax, az, p.nx, p.nz, p.w, p.h),
    new THREE.MeshBasicMaterial({ map: plateTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.FrontSide }),
  );
  plate.name = 'schoolzone-plate';
  plate.castShadow = true;
  group.add(plate);

  const signTex = canvasTex(512, 768, (g, w, h) => drawSign(g, w, h));
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, side: THREE.FrontSide });
  const poleGeo = new THREE.CylinderGeometry(0.055, 0.07, 3.35, 8);
  poleGeo.translate(0, 1.675, 0);
  const boardGeo = new THREE.PlaneGeometry(plan.signs[0].w, plan.signs[0].h);
  boardGeo.translate(0, plan.signs[0].bottom + plan.signs[0].h / 2, 0.06);
  const n = plan.signs.length;
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: '#5c636a' }), n);
  const boards = new THREE.InstancedMesh(boardGeo, signMat, n);
  poles.name = 'schoolzone-poles';
  boards.name = 'schoolzone-signs';
  poles.castShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);
  plan.signs.forEach((s, i) => {
    v.set(s.x, 0, s.z);
    q.setFromUnitVectors(up, new THREE.Vector3(s.nx, 0, s.nz));
    m4.compose(v, q, new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(i, m4);
    boards.setMatrixAt(i, m4);
  });
  poles.instanceMatrix.needsUpdate = boards.instanceMatrix.needsUpdate = true;
  poles.computeBoundingSphere();
  boards.computeBoundingSphere();
  group.add(poles, boards);

  parent.add(group);
  return {
    group, plan,
    dispose() {
      parent.remove(group);
      group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        const mats = [].concat(o.material || []);
        for (const m of mats) { m.map?.dispose(); m.dispose(); }
      });
    },
  };
}
