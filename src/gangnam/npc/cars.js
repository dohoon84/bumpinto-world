// [gangnam-npc] 강남대로·테헤란로 차량. 엔진은 정자 JzCars(차로·추종·신호 정지·무겹침).
//   그리는 방식은 미금 차량과 같은 BatchedMesh 하나(종류가 달라도 드로우 1).
//   섬 1(강남 박스) 밖에서 obstacles() 는 빈 배열 — 정자·미금·잠실 시뮬에 넣지 않는다.
import * as THREE from 'three';
import { JzCars } from '../../entities/jzTraffic.js';
import { KINDS, kindGeometry } from '../../entities/vehicleKinds.js';
import { batchedVehicleMaterial } from '../../corridor/migeumNpc.js';
import { watchEvening } from '../../evening.js';
import { gameHour } from '../../weather.js';

export class GangnamCars extends JzCars {
  constructor({ drive, box, station, transit = null, world = null, base, hour = () => gameHour(), seed = 77, fix = true, peds = null }) {
    super({
      drive, data: { meta: { bboxLocal: box }, station: station || { x: 0, z: 0 } },
      transit, world, base, hour, stops: [], extra: () => [], seed, fix, peds,
    });
    this.gnBox = box;
  }
  // 강남 박스 밖에서 물어보면 아무것도 안 돌려준다 (다른 섬 교통과 섞지 않음)
  obstacles(x, z, R) {
    const b = this.gnBox;
    if (!b || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return [];
    return super.obstacles(x, z, R);
  }
  // 일방통행 칸. slot 은 rules.js 가 버스 전용을 빼고 고른 번호.
  _laneOffset(t, w) {
    if (w?.slot?.length && w.ow) {
      const li = w.slot[(t.i + (t.lane || 0)) % w.slot.length];
      const lanes = w.lanes || Math.max(1, Math.round(w.w / 3.3));
      const lw = w.w / lanes;
      return w.w / 2 - (li + 0.5) * lw;
    }
    return super._laneOffset(t, w);
  }
}

const CAR_SHOW_R = 280;

export function createGangnamTraffic(parent, opts) {
  const sim = new GangnamCars(opts);
  const group = new THREE.Group();
  group.name = 'gangnamTraffic';
  parent?.add(group);
  const kinds = Object.keys(KINDS);
  const geos = kinds.map((k) => kindGeometry(k));
  const nV = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const mat = batchedVehicleMaterial();
  const bm = new THREE.BatchedMesh(Math.max(1, sim.cap), nV, 0, mat);
  bm.name = 'gn-vehicles';
  bm.castShadow = false;
  bm.receiveShadow = false;
  bm.perObjectFrustumCulled = true;
  bm.sortObjects = false;
  const gid = {};
  kinds.forEach((k, i) => { gid[k] = bm.addGeometry(geos[i]); });
  const slots = [];
  for (let i = 0; i < sim.cap; i++) {
    const id = bm.addInstance(gid.sedan);
    bm.setVisibleAt(id, false);
    slots.push(id);
  }
  group.add(bm);
  const release = opts.watchEvening ? opts.watchEvening((on) => { mat.userData.eve.value = on ? 1 : 0; }) : null;
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), m4 = new THREE.Matrix4();
  let drawn = 0;
  function render(fx, fz) {
    drawn = 0;
    for (let i = 0; i < slots.length; i++) {
      const t = sim.list[i], id = slots[i];
      if (!t || t.parked || (fx != null && (Math.abs(t.mesh.position.x - fx) > CAR_SHOW_R || Math.abs(t.mesh.position.z - fz) > CAR_SHOW_R))) {
        bm.setVisibleAt(id, false); continue;
      }
      if (t._gk !== t.kind) { bm.setGeometryIdAt(id, gid[t.kind]); t._gk = t.kind; }
      q.setFromAxisAngle(up, t.mesh.rotation.y);
      sc.setScalar(t.mesh.scale.x);
      m4.compose(t.mesh.position, q, sc);
      bm.setMatrixAt(id, m4);
      bm.setColorAt(id, t.color);
      bm.setVisibleAt(id, true);
      drawn++;
    }
    bm.visible = drawn > 0;
  }
  return {
    sim, group, mesh: bm,
    update(dt, focus) {
      if (focus) sim.focus = { x: focus.x, z: focus.z };
      sim.update(dt);
      render(focus?.x, focus?.z);
    },
    obstacles: (x, z, R) => sim.obstacles(x, z, R),
    stats: () => ({ ...sim.counts(), drawn, drawCalls: bm.visible ? 1 : 0, nodes: sim.nodes.length, ways: sim.ways.length }),
    dispose() { release?.(); group.removeFromParent(); bm.dispose(); mat.dispose(); },
  };
}

export { watchEvening };
