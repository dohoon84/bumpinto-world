// [gyeongbu-bus] 9004·1151. 본선은 버스전용차로(1차로) + 파란 차선. 속도는 gyeongbuSpeed.
import * as THREE from 'three';
import { ribbonGeo, fixNormalsUp } from '../world.js';
import { busLateralM, chainageAfter, enRoute, nextExpress } from './gyeongbuSpeed.js';

export const GYEONGBU_EXPRESS_FILE = 'gangnam/gyeongbu-express.json';
export const GYEONGGI_BUS_CREDIT = '버스 노선·정류소 정보: 경기도 (공공데이터포털)';

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

/** 본선 1차로와 2차로 사이 파란 점선. 점 4m, 3점 그리고 2점 쉼. 한 지오메트리. */
function busLaneLine(pts, off) {
  const samples = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 0.4) continue;
    const n = Math.max(1, Math.round(L / 4));
    const lx = dz / L, lz = -dx / L;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      samples.push([a[0] + dx * t + lx * off, a[1] + dz * t + lz * off, lx, lz]);
    }
  }
  const pos = [], idx = [];
  const y = 0.36, hw = 0.16;
  let run = -1;
  samples.forEach((s, i) => {
    if (i % 5 >= 3) { run = -1; return; }
    const [x, z, lx, lz] = s;
    const v = pos.length / 3;
    pos.push(x - lx * hw, y, z - lz * hw, x + lx * hw, y, z + lz * hw);
    if (run >= 0) idx.push(run, v, run + 1, run + 1, v, v + 1);
    run = v;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (idx.length) g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#2563eb' }));
  mesh.name = 'gyeongbuBusLane';
  mesh.frustumCulled = false;
  return mesh;
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
  if (main.length > 3) group.add(busLaneLine(main, data.lineOff || 3.6));

  const cap = 4;
  const geo = new THREE.BoxGeometry(12, 3.4, 2.9);
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const buses = new THREE.InstancedMesh(geo, mat, cap);
  buses.name = 'gyeongbuExpressBuses';
  buses.count = cap;
  buses.frustumCulled = false;
  buses.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  group.add(buses);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  const paint = { '9004': '#b91c1c', '1151': '#1d4ed8' };

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
    for (let i = 0; i < cap; i++) {
      const b = live[i];
      if (!b) { m4.compose(zero, q.identity(), zero); buses.setMatrixAt(i, m4); continue; }
      const p = poseAt(data.pts, b.s);
      const lat = busLateralM(b.s, data);
      const px = p.x + p.lx * lat, pz = p.z + p.lz * lat;
      if (Math.hypot(px - x, pz - z) > 1400) { m4.compose(zero, q.identity(), zero); buses.setMatrixAt(i, m4); continue; }
      q.setFromAxisAngle(up, p.ang);
      m4.compose(pos.set(px, 1.9, pz), q, scl);
      buses.setMatrixAt(i, m4);
      buses.setColorAt(i, col.set(paint[b.no] || '#b91c1c'));
    }
    buses.instanceMatrix.needsUpdate = true;
    if (buses.instanceColor) buses.instanceColor.needsUpdate = true;
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
  return { update, mesh: buses };
}
