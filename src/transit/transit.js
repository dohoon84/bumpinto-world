// 버스 정류장 쉘터 / 횡단보도 / 보행 신호등 / 버스 렌더링 + 정류장 패널
import * as THREE from 'three';
import { createBus } from './busModel.js';
import { createBusSource, TIME_COMPRESS } from './busSource.js';
import { liveryOf } from './livery.js';

export const CYCLE = 60; // 신호 주기(초): 그룹0 보행 초록 0~20, 깜빡 20~26 / 그룹1 초록 30~50, 깜빡 50~56
export const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

export function quad(pos, cx, cz, ax, az, bx, bz, hl, hw, y) { // 중심, 길이축(a), 폭축(b)
  const p = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([u, v]) => [cx + ax * u + bx * v, cz + az * u + bz * v]);
  const base = pos.length / 3;
  for (const [x, z] of p) pos.push(x, y, z);
  return [base, base + 2, base + 1, base, base + 3, base + 2];
}
export function flatMesh(pos, idx, color) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2 })); m.receiveShadow = true; return m;
}

export function buildTransit(scene, T, world, overlay, { mode = 'sim', proxy } = {}) {
  const bounds = world.bounds;
  let simTime = 0;
  // ---------- 신호 ----------
  const offsets = new Map();
  const phaseOf = (c) => { if (!offsets.has(c.cl)) offsets.set(c.cl, hash('cl' + c.cl) * CYCLE); return (simTime + offsets.get(c.cl)) % CYCLE; };
  const pedLight = (c) => {
    if (!c.sig) return 'none';
    const t = (phaseOf(c) - (c.g ? 30 : 0) + CYCLE) % CYCLE;
    return t < 20 ? 'green' : t < 26 ? 'blink' : 'red';
  };

  // ---------- 횡단보도(지브라) ----------
  // 정자역 바로 앞 성남대로 메인 횡단보도(4616070993, 7165256406)는 실제 광장 보행량에 맞춰 폭을 3배(약 13.2m)로 넓힌다.
  const pos = [], idx = [];
  for (const c of T.crossings) {
    const isStationMain = c.id === 4616070993 || c.id === 7165256406 || (c.sig && c.road === '성남대로' && Math.abs(c.z - 43.6) < 8);
    const [dx, dz] = c.dir, nx = -dz, nz = dx;
    const half = c.w / 2;
    const depth = (c.sig ? 2.2 : 1.8) * (isStationMain ? 3 : 1);
    c.depth = depth;
    for (let v = -half + 0.4; v <= half - 0.2; v += 1.0) idx.push(...quad(pos, c.x + nx * v, c.z + nz * v, dx, dz, nx, nz, depth, 0.28, 0.108));
    if (c.sig) for (const sgn of [-1, 1]) idx.push(...quad(pos, c.x + dx * sgn * (depth + 1.6) - nx * (sgn * half / 2), c.z + dz * sgn * (depth + 1.6) - nz * (sgn * half / 2), nx, nz, dx, dz, half / 2, 0.22, 0.108)); // 정지선(진행 방향 차로 쪽)
  }
  if (idx.length) scene.add(flatMesh(pos, idx, '#f7f7f2'));

  // ---------- 보행 신호등 ----------
  const lampMats = new Map(); // key cl|g -> {red, green, figR, figG}
  const poleMat = new THREE.MeshLambertMaterial({ color: '#5b6066' }), headMat = new THREE.MeshLambertMaterial({ color: '#2b2f33' });
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.08, 3.1, 6); poleGeo.translate(0, 1.55, 0);
  const headGeo = new THREE.BoxGeometry(0.42, 0.95, 0.28);
  const lampGeo = new THREE.BoxGeometry(0.32, 0.36, 0.3);
  const signalPoles = [];
  for (const c of T.crossings.filter((c) => c.sig)) {
    const k = c.cl + '|' + c.g;
    if (!lampMats.has(k)) lampMats.set(k, { red: new THREE.MeshBasicMaterial({ color: '#3a1010' }), green: new THREE.MeshBasicMaterial({ color: '#0d2a18' }), c });
    const M = lampMats.get(k);
    const [dx, dz] = c.dir, nx = -dz, nz = dx;
    const poleOffset = (c.depth || 2.2) + 0.5;
    for (const sgn of [-1, 1]) {
      const px = c.x + nx * sgn * (c.w / 2 + 0.9) + dx * poleOffset, pz = c.z + nz * sgn * (c.w / 2 + 0.9) + dz * poleOffset;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.castShadow = true;
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 2.75; head.castShadow = true;
      const r = new THREE.Mesh(lampGeo, M.red); r.position.y = 2.97;
      const gr = new THREE.Mesh(lampGeo, M.green); gr.position.y = 2.55;
      g.add(pole, head, r, gr);
      g.position.set(px, 0, pz); g.rotation.y = Math.atan2(-nx * sgn, -nz * sgn); // 길 건너편을 바라봄
      scene.add(g); signalPoles.push(g);
    }
  }
  const updateLamps = () => {
    const blinkOn = Math.floor(simTime * 2.5) % 2 === 0;
    for (const M of lampMats.values()) {
      const s = pedLight(M.c);
      M.red.color.set(s === 'red' ? '#ff3b30' : '#3a1010');
      M.green.color.set(s === 'green' || (s === 'blink' && blinkOn) ? '#2bff7a' : '#0d2a18');
    }
  };

  // ---------- 정류장 쉘터 ----------
  const shelterMat = { frame: new THREE.MeshLambertMaterial({ color: '#4a5560' }), roof: new THREE.MeshLambertMaterial({ color: '#2f6fb3' }), glass: new THREE.MeshLambertMaterial({ color: '#cfe6f5', transparent: true, opacity: 0.45 }), bench: new THREE.MeshLambertMaterial({ color: '#8a6b4e' }), sign: new THREE.MeshLambertMaterial({ color: '#1f5fbf' }) };
  for (const s of T.stops) {
    const g = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.15, 1.7), shelterMat.roof); roof.position.set(0, 2.6, 0); roof.castShadow = true;
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.2, 0.06), shelterMat.glass); back.position.set(0, 1.3, -0.75);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.45), shelterMat.bench); bench.position.set(0, 0.48, -0.45);
    g.add(roof, back, bench);
    for (const x of [-2, 2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), shelterMat.frame); p.position.set(x, 1.3, -0.75); p.castShadow = true; g.add(p); }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), shelterMat.frame); pole.position.set(2.6, 1.6, 0.5);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.06), shelterMat.sign); plate.position.set(2.6, 3.0, 0.5);
    g.add(pole, plate);
    // 쉘터 앞(+z)이 차도 쪽을 보도록
    const tr = s.tr || [0, 1];
    g.rotation.y = Math.atan2(tr[0], tr[1]);
    // 차도와 너무 가까우면(노드가 도로 경계선 위) 인도 쪽으로 살짝 물림
    const back1 = s.rdist != null && s.rdist < 7 ? 7 - s.rdist : 0;
    g.position.set(s.x - tr[0] * back1, 0, s.z - tr[1] * back1);
    scene.add(g);
    s._pos = g.position;
    overlay.add({ cls: 'label busstop', text: `🚏 ${s.name}${s.ref ? ' ' + s.ref.split(';')[0] : ''}`, getPos: () => new THREE.Vector3(g.position.x, 3.8, g.position.z), maxDist: 140 });
  }

  // ---------- 버스 ----------
  const source = createBusSource(mode, T, bounds, { proxy });
  const meshes = new Map();
  const busTags = new Map();
  const ctx = { pedLight };
  const syncBuses = () => {
    const seen = new Set();
    for (const v of source.vehicles()) {
      seen.add(v.id);
      let m = meshes.get(v.id);
      if (!m) {
        m = createBus(v.ref, v.type, v.name); scene.add(m); meshes.set(v.id, m);
        const lv = liveryOf(v.type);
        busTags.set(v.id, overlay.add({ cls: 'tag bus', text: `🚌 ${v.ref} · ${lv.label}`, getPos: () => m.position.clone().setY(4.4), maxDist: 70 }));
        busTags.get(v.id).el.style.background = lv.plain ? '#2c3e6b' : lv.color;
      }
      m.position.set(v.x, 0.08, v.z); m.rotation.y = v.heading; m.scale.setScalar(v.scale); m.visible = v.scale > 0.02;
      m.userData.state = v.state;
    }
    for (const [id, m] of meshes) if (!seen.has(id)) { m.userData.releaseLights?.(); scene.remove(m); meshes.delete(id); overlay.remove(busTags.get(id)); busTags.delete(id); }
  };

  // ---------- 정류장 패널 ----------
  const panel = document.getElementById('stop-panel');
  let panelT = 0, panelStop = null;
  const fmt = (a) => {
    if (a.etaSec == null) return a.text || '정보 없음';
    if (a.state === '정차 중' || a.etaSec < 8) return a.state || '곧 도착';
    const m = Math.floor(a.etaSec / 60), s = Math.round(a.etaSec % 60);
    return (m ? `${m}분 ` : '') + `${s}초`;
  };
  const renderPanel = (playerPos) => {
    let best = null, bd = 22;
    for (const s of T.stops) { const d = Math.hypot(s._pos.x - playerPos.x, s._pos.z - playerPos.z); if (d < bd) { bd = d; best = s; } }
    panelStop = best;
    if (!best) { panel.classList.remove('open'); return; }
    const arrivalList = source.arrivals(best);
    const rows = arrivalList.map((a) => {
      const lv = liveryOf(a.type);
      return `<tr><td><span class="chip" style="background:${lv.plain ? '#2c3e6b' : lv.color}">${a.ref}</span></td><td class="ty">${lv.label}</td><td class="eta">${fmt(a)}${a.kind === 'virtual' ? ' <i title="OSM에 노선 형상이 없어 3D 버스 없이 가상 배차로만 계산">가상</i>' : ''}</td></tr>`;
    }).join('');
    const footerText = source.panelLabel
      ? source.panelLabel(best, arrivalList)
      : `${source.label}${mode === 'sim' ? ' · 실제 시간표 아님' : ''}`;
    panel.innerHTML = `<div class="hd">🚏 ${best.name} <small>${best.ref ? '정류소번호 ' + best.ref.split(';')[0] : ''}</small></div>
      <table>${rows || '<tr><td colspan=3>등록된 노선 정보 없음 (OSM route_ref 없음)</td></tr>'}</table>
      <div class="ft">${footerText}</div>`;
    panel.classList.add('open');
  };

  function update(dt, playerPos) {
    simTime += dt;
    source.update(dt, ctx);
    syncBuses(); updateLamps();
    panelT -= dt; if (panelT <= 0) { panelT = 0.5; renderPanel(playerPos); }
  }
  function fastForward(sec, step = 0.1) { for (let t = 0; t < sec; t += step) { simTime += step; source.update(step, ctx); } syncBuses(); updateLamps(); }
  return { update, fastForward, pedLight, source, crossings: T.crossings, stops: T.stops, meshes, get simTime() { return simTime; }, get panelStop() { return panelStop; }, TIME_COMPRESS };
}

// NPC가 빨간불이면 횡단보도 앞에서 기다리게 하는 판정 (근사)
export function makeCrossingGuard(transit) {
  const sig = transit.crossings.filter((c) => c.sig);
  const blocked = (px, pz) => {
    for (const c of sig) {
      if (Math.abs(c.x - px) > 36 || Math.abs(c.z - pz) > 36) continue;
      const [dx, dz] = c.dir, nx = -dz, nz = dx;
      const along = Math.abs((px - c.x) * dx + (pz - c.z) * dz);
      const across = Math.abs((px - c.x) * nx + (pz - c.z) * nz);
      const depth = c.depth || 2.2;
      if (along < depth + 1.1 && across < c.w / 2 + 0.35 && transit.pedLight(c) !== 'green') return c;
    }
    return null;
  };
  return (x, z, hx, hz) => {
    if (blocked(x, z)) return null;
    const len = Math.hypot(hx, hz) || 1, ux = hx / len, uz = hz / len;
    for (const d of [1.3, 2.4, 3.6]) {
      const hit = blocked(x + ux * d, z + uz * d);
      if (hit) return hit;
    }
    return null;
  };
}
