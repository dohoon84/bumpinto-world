// [place-guide] 'Take me there' 바닥 길 안내 — 케이블카 길안내(namsanCableGuide)와 같은 보행 그래프(buildCableGraph)·
//   같은 쉐브론 화살표(본색 + 짙은 테두리, 비탈 법선에 붙임, 목적지 쪽으로 흐르는 빛)를 쓴다. draw 2 (InstancedMesh 2개).
//   거리 = 실제 길(그래프) 경로 길이. 직선 거리나 데이터의 자리표시 거리는 쓰지 않는다.
import * as THREE from 'three';
import { buildCableGraph, chevronGeo, resample } from '../corridor/landmarks/namsanCableGuide.js';

const STEP = 4.2, MAX_ARROWS = 160, SHOW_AHEAD = 260;
const plen = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };

/** 경로를 꺾이는 곳마다 다리(leg)로 나눠 단계 글을 만든다 */
export function routeSteps(path, nameAt, destName) {
  const legs = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
    const h = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const last = legs[legs.length - 1];
    let d = last ? h - last.h : 0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    if (last && (Math.abs(d) < 0.6 || L < 4)) { last.dist += L; last.b = b; continue; }
    legs.push({ a, b, h, dist: L, d, at: plen(path.slice(0, i)) - 0 });
  }
  // 아주 짧은 다리는 앞 다리에 붙인다
  for (let i = legs.length - 1; i > 0; i--) if (legs[i].dist < 8) { legs[i - 1].dist += legs[i].dist; legs[i - 1].b = legs[i].b; legs.splice(i, 1); }
  // 첫 다리가 아주 짧으면(바로 꺾음) 다음 다리부터 '걷기'로 시작
  if (legs.length > 1 && legs[0].dist < 10) { legs[1].dist += legs[0].dist; legs[1].a = legs[0].a; legs.shift(); }
  let acc = 0;
  const steps = legs.map((g, i) => {
    const mx = (g.a[0] + g.b[0]) / 2, mz = (g.a[1] + g.b[1]) / 2, st = nameAt?.(mx, mz) || '';
    // 화면 기준: atan2(x,z) 증가 = 왼쪽(반시계, 위에서 볼 때 x 동쪽·z 남쪽) → d>0 왼쪽
    const turn = i === 0 ? 'straight' : g.d > 0 ? 'left' : 'right';
    const on = st ? { en: ` along ${st}`, ko: ` ${st} 따라` } : { en: '', ko: '' };
    const text = i === 0 ? { en: `Walk${on.en} ${Math.round(g.dist)} m`, ko: `${on.ko ? on.ko.trim() + ' ' : ''}${Math.round(g.dist)} m 걷기` }
      : turn === 'left' ? { en: `Turn left${st ? ` onto ${st}` : ''}`, ko: `왼쪽으로${st ? ` ${st}` : ''}` }
        : { en: `Turn right${st ? ` onto ${st}` : ''}`, ko: `오른쪽으로${st ? ` ${st}` : ''}` };
    const s = { text, dist: g.dist, turn, from: acc }; acc += g.dist; return s;
  });
  steps.push({ text: { en: `Arrive · ${destName.en}`, ko: `도착 · ${destName.ko}` }, dist: 0, turn: 'arrive', from: acc });
  return steps;
}

/**
 * @param {{ parent: THREE.Object3D, groundAt: (x:number,z:number)=>number, lines: number[][][] }} o
 */
export function createGroundRoute({ parent, groundAt, lines }) {
  const group = new THREE.Group(); group.name = 'place-guide-route'; parent.add(group);
  const mk = (color, off) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off });
  const arrowMat = mk('#ffffff', -4), rimMat = mk('#08244a', -3); rimMat.opacity = 0.9;
  const chev = chevronGeo();
  const arrows = new THREE.InstancedMesh(chev, arrowMat, MAX_ARROWS), rims = new THREE.InstancedMesh(chev, rimMat, MAX_ARROWS);
  arrows.name = 'place-guide-arrows'; rims.name = 'place-guide-arrow-rims';
  for (const m of [arrows, rims]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
  arrows.renderOrder = 4; rims.renderOrder = 3;
  arrows.setColorAt(0, new THREE.Color('#0B63CE')); rims.setColorAt(0, new THREE.Color('#08244a'));
  group.add(rims, arrows);
  const dummy = new THREE.Object3D(); dummy.rotation.order = 'YXZ';
  const _n = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _y = new THREE.Vector3(), _m = new THREE.Matrix4();
  const colA = new THREE.Color('#0B63CE'), colB = new THREE.Color('#6fc3ff'), tmp = new THREE.Color();
  let graph = null, target = null, placed = [], path = null, key = '', repathT = 0, time = 0;

  function slopeAt(x, z) {
    const e = 0.8, hx = (groundAt(x + e, z) - groundAt(x - e, z)) / (2 * e), hz = (groundAt(x, z + e) - groundAt(x, z - e)) / (2 * e);
    return _n.set(-(Number.isFinite(hx) ? hx : 0), 1, -(Number.isFinite(hz) ? hz : 0)).normalize();
  }
  function pose(p, scale) {
    dummy.scale.setScalar(scale); dummy.rotation.set(0, 0, 0);
    const n = p.n || (p.n = slopeAt(p.x, p.z).clone());
    dummy.position.set(p.x + n.x * 0.07, p.y + n.y * 0.07, p.z + n.z * 0.07);
    _f.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)); _f.addScaledVector(n, -_f.dot(n)); if (_f.lengthSq() < 1e-6) _f.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)); _f.normalize();
    _r.crossVectors(n, _f).normalize(); _y.copy(_f).multiplyScalar(-1);
    dummy.quaternion.setFromRotationMatrix(_m.makeBasis(_r, _y, n)); dummy.updateMatrix();
  }
  function lay(p) {
    const total = plen(p), s0 = total % STEP, rs = resample(p, STEP, s0);
    placed = [];
    for (let i = 0; i < rs.length && placed.length < MAX_ARROWS; i++) {
      const acc = s0 + i * STEP; if (acc < 3 || acc > SHOW_AHEAD) continue;
      const q = rs[i]; placed.push({ x: q.x, y: groundAt(q.x, q.z), z: q.z, yaw: Math.atan2(q.hx, q.hz), s: total - acc });
    }
    for (let i = 0; i < placed.length; i++) { pose(placed[i], 1.7); arrows.setMatrixAt(i, dummy.matrix); pose(placed[i], 1.7 * 1.22); rims.setMatrixAt(i, dummy.matrix); }
    arrows.count = rims.count = placed.length;
    arrows.instanceMatrix.needsUpdate = rims.instanceMatrix.needsUpdate = true;
  }
  function clear() { arrows.count = rims.count = 0; placed = []; path = null; key = ''; }

  /** spots: [{x,z}] 전부를 목표로 한 그래프(한 번 지음). 목표 k 로 길을 깐다 */
  let spotsRef = null;
  function ensureGraph(spots) {
    if (graph && spotsRef === spots) return graph;
    spotsRef = spots; graph = buildCableGraph(lines, spots.map((s) => ({ x: s.x, z: s.z })), { radius: 900, link: 6 });
    return graph;
  }
  /** (x,z) → 목표까지 경로 [x,z][] (그래프에서 못 찾으면 직선) */
  function pathTo(spots, k, x, z) {
    const g = ensureGraph(spots);
    const p = g.pathFrom(x, z, k, 90);
    return p && p.length >= 2 ? p : [[x, z], [spots[k].x, spots[k].z]];
  }
  return {
    group,
    pathTo,
    length: plen,
    start(spots, k) { target = { spots, k }; key = ''; repathT = 0; },
    stop() { target = null; clear(); },
    get active() { return !!target; },
    get path() { return path; },
    get arrowCount() { return arrows.count; },
    /** 매 프레임. 플레이어가 3 m 움직이면 다시 깐다 (0.3 초 간격). 남은 경로를 돌려준다 */
    update(dt, px, pz) {
      time += dt;
      if (!target) return null;
      repathT -= dt;
      const k = `${Math.round(px / 3)}|${Math.round(pz / 3)}`;
      if (k !== key && repathT <= 0) { key = k; repathT = 0.3; path = pathTo(target.spots, target.k, px, pz); lay(path); }
      for (let i = 0; i < placed.length; i++) { const w = 0.5 + 0.5 * Math.sin(placed[i].s * 0.22 + time * 5.0); tmp.copy(colA).lerp(colB, w * w * 0.7); arrows.setColorAt(i, tmp); }
      if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
      return path;
    },
    dispose() { parent.remove(group); chev.dispose(); arrowMat.dispose(); rimMat.dispose(); arrows.dispose(); rims.dispose(); },
  };
}
