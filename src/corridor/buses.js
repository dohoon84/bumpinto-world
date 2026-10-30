// [corridor] 수내 → 롯데 코리더 버스: 라이브 버스 모델(createBus)·도색(liveryOf)·시뮬(SimulatedBusSource)·정류장 쉘터 모양을 그대로 쓰고,
// 코리더 규모에 맞게만 바꾼다.
//   - 데이터: public/corridor/transit.json (scripts/corridor/build-transit.mjs, 정자 bbox 바깥 구간만, OSM 정류장 좌표)
//   - 시뮬은 전 노선을 돌리되, 3D 버스는 시점 주변 RADIUS 안 가까운 순 MAX_BUSES 대만 그린다(노선번호별 메시 재사용 풀)
//   - 쉘터는 InstancedMesh 5개(재질별), 정류장 이름표는 가까운 것만 DOM 에 붙인다
//   - 정류장 패널은 라이브 #stop-panel 과 겹치지 않게 별도 요소(#corridor-stop-panel, 같은 모양)
//   - 실시간: proxy 가 있으면 CorridorRealtimeSource(실패 시 조용히 시뮬)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimulatedBusSource } from '../transit/busSource.js';
import { createBus } from '../transit/busModel.js';
import { liveryOf } from '../transit/livery.js';
import { CorridorRealtimeSource } from './busRealtime.js';

const RADIUS = 450, MAX_BUSES = 16, LABEL_R = 160, PANEL_R = 22;

function shelterGeos() {
  const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
  return {
    roof: at(new THREE.BoxGeometry(4.2, 0.15, 1.7), 0, 2.6, 0),
    glass: at(new THREE.BoxGeometry(4.0, 2.2, 0.06), 0, 1.3, -0.75),
    bench: at(new THREE.BoxGeometry(2.6, 0.12, 0.45), 0, 0.48, -0.45),
    frame: mergeGeometries([at(new THREE.BoxGeometry(0.1, 2.6, 0.1), -2, 1.3, -0.75), at(new THREE.BoxGeometry(0.1, 2.6, 0.1), 2, 1.3, -0.75), at(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), 2.6, 1.6, 0.5)]),
    sign: at(new THREE.BoxGeometry(0.6, 0.8, 0.06), 2.6, 3.0, 0.5),
  };
}

export function createCorridorBuses(root, T, { crossings, terrain, overlay, liveBox, proxy, mode = 'sim', gg = false }) {
  const group = new THREE.Group(); group.name = 'corridorBuses'; root.add(group);
  const gy = (x, z, ref = 0) => (terrain ? terrain.getGroundHeight(x, z, ref) : 0);
  const data = { ...T, crossings: crossings.crossings };
  const big = { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 };
  const sim = new SimulatedBusSource(data, big, { seed: 7 });
  // 정자 bbox 경계에서 시작/끝나는 경로는 라이브 버스와 이어지는 것처럼 페이드 없이
  const onLiveEdge = ([x, z]) => x >= liveBox.x0 - 6 && x <= liveBox.x1 + 6 && z >= liveBox.z0 - 6 && z <= liveBox.z1 + 6;
  for (const P of sim.paths) { P.fadeIn = !onLiveEdge(P.pts[0]); P.fadeOut = !onLiveEdge(P.pts[P.pts.length - 1]); }
  const source = mode === 'realtime' && proxy ? new CorridorRealtimeSource(data, { proxy, fallback: sim, gg }) : sim;

  // ---------- 쉘터 (Instanced) ----------
  const M = { frame: new THREE.MeshLambertMaterial({ color: '#4a5560' }), roof: new THREE.MeshLambertMaterial({ color: '#2f6fb3' }), glass: new THREE.MeshLambertMaterial({ color: '#cfe6f5', transparent: true, opacity: 0.45 }), bench: new THREE.MeshLambertMaterial({ color: '#8a6b4e' }), sign: new THREE.MeshLambertMaterial({ color: '#1f5fbf' }) };
  const G = shelterGeos();
  const parts = [[G.roof, M.roof, true], [G.glass, M.glass, false], [G.bench, M.bench, false], [G.frame, M.frame, true], [G.sign, M.sign, false]];
  const stops = T.stops;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const ims = parts.map(([geo, mat, cast]) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, stops.length)); im.count = stops.length; im.castShadow = cast; im.receiveShadow = true; group.add(im); return im; });
  stops.forEach((s, i) => {
    const tr = s.tr || [0, 1];
    const back1 = s.rdist != null && s.rdist < 7 ? 7 - s.rdist : 0;
    const x = s.x - tr[0] * back1, z = s.z - tr[1] * back1;
    s._pos = new THREE.Vector3(x, gy(x, z, 0), z);
    q.setFromAxisAngle(up, Math.atan2(tr[0], tr[1]));
    m4.compose(s._pos, q, one);
    for (const im of ims) im.setMatrixAt(i, m4);
  });
  for (const im of ims) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }

  // 정류장 이름표: 가까운 것만
  const labels = new Map();
  const syncLabels = (fx, fz) => {
    for (const s of stops) {
      const near = Math.hypot(s._pos.x - fx, s._pos.z - fz) < LABEL_R;
      if (near && !labels.has(s.id)) labels.set(s.id, overlay.add({ cls: 'label busstop', text: `🚏 ${s.name}${s.ref ? ' ' + s.ref.split(';')[0] : ''}`, getPos: () => new THREE.Vector3(s._pos.x, s._pos.y + 3.8, s._pos.z), maxDist: 140 }));
      else if (!near && labels.has(s.id)) { overlay.remove(labels.get(s.id)); labels.delete(s.id); }
    }
  };

  // ---------- 버스 메시 풀 ----------
  const active = new Map(); // vehicle id -> { m, key, tag }
  const pool = new Map(); // key -> [mesh]
  const take = (v) => {
    const key = `${v.ref}|${v.type}`;
    let m = pool.get(key)?.pop();
    if (!m) { m = createBus(v.ref, v.type, v.name); m.userData.key = key; }
    m.visible = true; group.add(m);
    const lv = liveryOf(v.type);
    const tag = overlay.add({ cls: 'tag bus', text: `🚌 ${v.ref} · ${lv.label}${v.live ? ' · 실시간' : ''}`, getPos: () => m.position.clone().setY(m.position.y + 4.4), maxDist: 70 });
    tag.el.style.background = lv.plain ? '#2c3e6b' : lv.color;
    return { m, key, tag };
  };
  const give = (a) => { a.m.userData.releaseLights?.(); group.remove(a.m); overlay.remove(a.tag); if (!pool.has(a.key)) pool.set(a.key, []); pool.get(a.key).push(a.m); };

  // ---------- 정류장 패널 ----------
  let panel = document.getElementById('corridor-stop-panel');
  if (!panel) { panel = document.createElement('div'); panel.id = 'corridor-stop-panel'; document.body.appendChild(panel); }
  const fmt = (a) => {
    if (a.etaSec == null) return a.text || '정보 없음';
    if (a.state === '정차 중' || a.etaSec < 8) return a.state || '곧 도착';
    const mm = Math.floor(a.etaSec / 60), ss = Math.round(a.etaSec % 60);
    return (mm ? `${mm}분 ` : '') + `${ss}초`;
  };
  let panelStop = null;
  const renderPanel = (fx, fz) => {
    let best = null, bd = PANEL_R;
    for (const s of stops) { const d = Math.hypot(s._pos.x - fx, s._pos.z - fz); if (d < bd) { bd = d; best = s; } }
    panelStop = best;
    if (!best) { panel.classList.remove('open'); return; }
    const rows = source.arrivals(best).map((a) => {
      const lv = liveryOf(a.type);
      return `<tr><td><span class="chip" style="background:${lv.plain ? '#2c3e6b' : lv.color}">${a.ref}</span></td><td class="ty">${lv.label}</td><td class="eta">${fmt(a)}${a.kind === 'virtual' ? ' <i title="OSM에 노선 형상이 없어 3D 버스 없이 가상 배차로만 계산">가상</i>' : ''}</td></tr>`;
    }).join('');
    panel.innerHTML = `<div class="hd">🚏 ${best.name} <small>${best.ref ? '정류소번호 ' + best.ref.split(';')[0] : ''}</small></div>
      <table>${rows || '<tr><td colspan=3>등록된 노선 정보 없음 (OSM route_ref 없음)</td></tr>'}</table>
      <div class="ft">${source.label} · 실제 시간표 아님</div>`;
    panel.classList.add('open');
  };

  const ctx = { pedLight: crossings.pedLight };
  let acc = 1, rendered = 0, nearAll = [];
  const focus = { x: 0, z: 0 };
  function update(dt, fx, fz, inLive) {
    focus.x = fx; focus.z = fz;
    source.update(dt, ctx, focus);
    const vs = source.vehicles();
    const near = [];
    for (const v of vs) { const d = Math.hypot(v.x - fx, v.z - fz); if (d < RADIUS && v.scale > 0.02) near.push([d, v]); }
    nearAll = near.map((n) => n[1]);
    near.sort((a, b) => a[0] - b[0]); near.length = Math.min(near.length, MAX_BUSES);
    const seen = new Set();
    for (const [, v] of near) {
      seen.add(v.id);
      let a = active.get(v.id);
      if (!a) { a = take(v); active.set(v.id, a); }
      const y = gy(v.x, v.z, a.m.position.y || 0);
      a.m.position.set(v.x, y + 0.08, v.z); a.m.rotation.y = v.heading; a.m.scale.setScalar(v.scale);
      a.m.userData.state = v.state;
    }
    for (const [id, a] of active) if (!seen.has(id)) { give(a); active.delete(id); }
    rendered = active.size;
    acc += dt;
    if (acc >= 0.5) {
      acc = 0;
      syncLabels(fx, fz);
      if (inLive) { panel.classList.remove('open'); panelStop = null; } else renderPanel(fx, fz);
    }
  }
  return {
    group, source, sim, update,
    get near() { return nearAll; },
    closePanel() {
      panel.classList.remove('open'); panelStop = null;
      for (const [id, a] of active) { give(a); active.delete(id); }
      for (const [id, l] of labels) { overlay.remove(l); labels.delete(id); }
      rendered = 0; nearAll = [];
    },
    get panelStop() { return panelStop; },
    stats: () => ({ sim: sim.buses.length, rendered, stops: stops.length, paths: sim.paths.length, live: source.stats?.live || 0, livePolls: source.stats?.polls || 0, liveFail: source.stats?.fail || 0, pool: [...pool.values()].reduce((a, l) => a + l.length, 0) }),
  };
}
