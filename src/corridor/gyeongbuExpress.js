// [gyeongbu-bus] 9004·1151. 본선은 버스전용차로(1차로) + 파란 차선. 속도는 gyeongbuSpeed.
import * as THREE from 'three';
import { ribbonGeo, fixNormalsUp } from '../world.js';
import { busLateralM, chainageAfter, enRoute, nextExpress } from './gyeongbuSpeed.js';
import { EXPRESS_ARS, boardText } from '../gangnam/liveBus.js'; // [livebus]

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

function coloredBox(w, h, d, color, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d);
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

/** 직행좌석 빨강 몸 + 창 + 바퀴. 인스턴스 하나. */
function expressBusGeo() {
  const body = coloredBox(2.55, 2.35, 11.2, '#b91c1c', 0, 2.25, 0);
  const glass = coloredBox(2.85, 1.15, 8.4, '#0e2438', 0, 2.7, 0.35);
  const skirt = coloredBox(2.4, 0.7, 10.2, '#2b2f33', 0, 0.95, 0);
  const wheels = [];
  for (const z of [-3.7, -1.2, 3.3]) for (const x of [-1.45, 1.45]) wheels.push(coloredBox(0.55, 1.05, 1.05, '#111111', x, 0.55, z));
  return mergeGeo([body, glass, skirt, ...wheels]);
}

export function mountGyeongbuExpress(group, data, { overlay, liveBus = null } = {}) {
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
  const geo = expressBusGeo();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const buses = new THREE.InstancedMesh(geo, mat, cap);
  buses.name = 'gyeongbuExpressBuses';
  buses.count = cap;
  buses.frustumCulled = false;
  group.add(buses);
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
      m4.compose(pos.set(px, 0.15, pz), q, scl);
      buses.setMatrixAt(i, m4);
    }
    buses.instanceMatrix.needsUpdate = true;
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
  return { update, mesh: buses };
}
