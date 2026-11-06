// [schoolzone] 어린이 보호구역. 배치는 schoolZonePlan.js 가 구운 schoolZoneData.json.
// 학교마다 정면 도로의 짧은 적색 구간 + 노면 글자/30 + 노란 가장자리·정지선 + 표지 1~2.
// 그 구간에 들어오는 횡단보도만 노란 줄로 덮는다. 나머지 횡단보도는 그대로 흰색.
// 기본 ON. ?schoolzone=0 이면 메쉬를 만들지 않는다.
// 그리기: 적색 1 + 노란선 1 + 노란 횡단 1 + 글자 1 + 30 1 + 표지 인스턴스 2 + 이름 있는 학교당 명판 1.
import * as THREE from 'three';
import zonesData from './schoolZoneData.json' with { type: 'json' };

const KO = '"Noto Sans KR", "Noto Sans CJK KR", "WenQuanYi Micro Hei", "NanumGothic", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

export const SCHOOL_RED = '#d23830';
export const SCHOOL_YELLOW = '#f2c200';
const Y_RED = 0.1;      // 차도 리본(0.065)·중앙선(0.09) 위, 흰 지브라(0.108) 아래
const Y_ZEBRA = 0.124;  // 학교 구역 노란 횡단줄 (흰 줄을 덮음)
const Y_MARK = 0.132;   // 노면 글자·30
const Y_LINE = 0.14;    // 노란 가장자리·정지선
const LINE_W = 0.36;

export function schoolZoneEnabled(params) {
  try {
    const p = params && typeof params.get === 'function' ? params : (typeof location !== 'undefined' ? new URLSearchParams(location.search) : null);
    if (!p) return true;
    return p.get('schoolzone') !== '0';
  } catch { return true; }
}

const hypot2 = (x, z) => Math.hypot(x, z) || 1;

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

function drawPlate(g, w, h, text) {
  g.fillStyle = '#16386a';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#f4e4c4';
  g.fillRect(14, 14, w - 28, h - 28);
  g.fillStyle = '#1f6b45';
  g.fillRect(14, 14, w - 28, 18);
  g.fillStyle = '#14284a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, text, w - 80, 118, 48);
  g.fillText(text, w / 2, h / 2 + 8);
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

function flatMesh(pos, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (idx.length) g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  if (n) for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
const pt = (p) => Array.isArray(p) ? { x: p[0], z: p[1] } : p;

function redGeo(zones) {
  const pos = [], idx = [];
  for (const zone of zones) {
    const samples = zone.samples.map(pt), hw = zone.redW / 2;
    const base = pos.length / 3;
    for (let i = 0; i < samples.length; i++) {
      const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const L = hypot2(dx, dz); dx /= L; dz /= L;
      const p = samples[i];
      pos.push(p.x - dz * hw, Y_RED, p.z + dx * hw, p.x + dz * hw, Y_RED, p.z - dx * hw);
      if (i) { const k = base + (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  }
  return flatMesh(pos, idx);
}
function yellowGeo(zones) {
  const pos = [], idx = [];
  for (const zone of zones) {
    const samples = zone.samples.map(pt);
    const side = zone.redW / 2 - LINE_W / 2 - 0.08;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      if ((zone.crossings || []).some((c) => Math.hypot(c.x - mx, c.z - mz) < 5)) continue;
      const dx = b.x - a.x, dz = b.z - a.z, L = hypot2(dx, dz);
      const tx = dx / L, tz = dz / L, qx = -tz, qz = tx;
      for (const sgn of [-1, 1]) addQuad(pos, idx, mx + qx * sgn * side, mz + qz * sgn * side, tx, tz, qx, qz, L / 2, LINE_W / 2, Y_LINE);
    }
    for (const s of zone.stops || []) addQuad(pos, idx, s.x, s.z, s.qx, s.qz, s.dx, s.dz, s.w / 2, s.t / 2, Y_LINE);
  }
  return flatMesh(pos, idx);
}
function zebraGeo(zones) {
  const pos = [], idx = [];
  for (const zone of zones) for (const c of zone.crossings || []) {
    const [dx, dz] = c.dir, nx = -dz, nz = dx, half = (c.w || zone.roadW) / 2, depth = c.depth || 2.2;
    for (let v = -half + 0.35; v <= half - 0.15; v += 0.95) addQuad(pos, idx, c.x + nx * v, c.z + nz * v, dx, dz, nx, nz, depth, 0.36, Y_ZEBRA);
  }
  return flatMesh(pos, idx);
}
function decalGeo(marks) {
  const pos = [], uv = [], idx = [];
  for (const m of marks) {
    const L = hypot2(m.fx, m.fz), fx = m.fx / L, fz = m.fz / L, rx = -fz, rz = fx;
    const hw = m.w / 2, hh = m.h / 2, base = pos.length / 3;
    for (const [lx, ly, u, v] of [[-hw, -hh, 0, 0], [hw, -hh, 1, 0], [hw, hh, 1, 1], [-hw, hh, 0, 1]]) {
      pos.push(m.x + rx * lx + fx * ly, Y_MARK, m.z + rz * lx + fz * ly);
      uv.push(u, v);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = flatMesh(pos, idx);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

const paintMat = (color, order, factor) => {
  const m = new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: factor, side: THREE.DoubleSide });
  m.depthWrite = true;
  return m;
};

const plateTexCache = new Map();
function plateTexture(text) {
  if (plateTexCache.has(text)) return plateTexCache.get(text);
  const tex = canvasTex(768, 192, (g, w, h) => drawPlate(g, w, h, text));
  plateTexCache.set(text, tex);
  return tex;
}

/**
 * 구운 구역 전부를 공유 재질로 올린다. ?schoolzone=0 이면 null.
 * @returns {{ group: THREE.Group, zones: object[], dispose: () => void } | null}
 */
export function mountSchoolZones(parent, params) {
  if (!schoolZoneEnabled(params)) return null;
  const zones = zonesData;
  const group = new THREE.Group();
  group.name = 'schoolZone';

  const add = (geo, mat, name, order) => {
    if (!geo.attributes.position?.count) { geo.dispose(); return; }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name; mesh.renderOrder = order; mesh.receiveShadow = name === 'schoolzone-red';
    group.add(mesh);
  };
  add(redGeo(zones), paintMat(SCHOOL_RED, 2, -1), 'schoolzone-red', 2);
  add(yellowGeo(zones), paintMat(SCHOOL_YELLOW, 3, -3), 'schoolzone-yellow', 3);
  add(zebraGeo(zones), paintMat(SCHOOL_YELLOW, 4, -4), 'schoolzone-zebra', 4);

  const texts = [], discs = [];
  for (const z of zones) for (const m of z.marks || []) (m.kind === 'disc' ? discs : texts).push(m);
  const textMat = new THREE.MeshBasicMaterial({ map: canvasTex(1024, 256, (g, w, h) => drawRoadText(g, w, h)), polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, side: THREE.DoubleSide });
  const discMat = new THREE.MeshBasicMaterial({ map: canvasTex(512, 512, (g, w) => drawDisc(g, w)), polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, side: THREE.DoubleSide });
  if (texts.length) { const mesh = new THREE.Mesh(decalGeo(texts), textMat); mesh.name = 'schoolzone-text'; mesh.renderOrder = 5; group.add(mesh); }
  if (discs.length) { const mesh = new THREE.Mesh(decalGeo(discs), discMat); mesh.name = 'schoolzone-30'; mesh.renderOrder = 5; group.add(mesh); }

  for (const z of zones) if (z.plate) {
    const p = z.plate;
    const ax = p.nz, az = -p.nx;
    const mesh = new THREE.Mesh(
      wallQuad(p.x, p.y, p.z, ax, az, p.nx, p.nz, p.w, p.h),
      new THREE.MeshBasicMaterial({ map: plateTexture(p.text), side: THREE.FrontSide }),
    );
    mesh.name = 'schoolzone-plate';
    mesh.userData.school = p.text;
    group.add(mesh);
  }

  const signs = zones.flatMap((z) => z.signs || []);
  if (signs.length) {
    const signMat = new THREE.MeshBasicMaterial({ map: canvasTex(512, 768, (g, w, h) => drawSign(g, w, h)), side: THREE.FrontSide });
    const poleGeo = new THREE.CylinderGeometry(0.055, 0.07, 3.35, 8);
    poleGeo.translate(0, 1.675, 0);
    const boardGeo = new THREE.PlaneGeometry(1.5, 2.1);
    boardGeo.translate(0, 1.42 + 1.05, 0.06);
    const n = signs.length;
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: '#5c636a' }), n);
    const boards = new THREE.InstancedMesh(boardGeo, signMat, n);
    poles.name = 'schoolzone-poles';
    boards.name = 'schoolzone-signs';
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);
    signs.forEach((s, i) => {
      v.set(s.x, 0, s.z);
      q.setFromUnitVectors(up, new THREE.Vector3(s.nx, 0, s.nz).normalize());
      m4.compose(v, q, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, m4);
      boards.setMatrixAt(i, m4);
    });
    poles.instanceMatrix.needsUpdate = boards.instanceMatrix.needsUpdate = true;
    poles.computeBoundingSphere();
    boards.computeBoundingSphere();
    group.add(poles, boards);
  }

  parent.add(group);
  return {
    group, zones,
    dispose() {
      parent.remove(group);
      const seen = new Set();
      group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) {
          if (seen.has(m)) continue;
          seen.add(m);
          m.map?.dispose();
          m.dispose();
        }
      });
      plateTexCache.clear();
    },
  };
}
export const mountYatapSchoolZone = mountSchoolZones;
