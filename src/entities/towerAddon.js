// [tower] 스타베이스 발사장 상세 모델 애드온 (오케스트레이터)
//  - OSM 발사탑(man_made=tower, 높이 ≥100 m) 2개 → 격자 탑 + 캐리지/젓가락/QD 암
//    · OLM(OSM relation ref='OLM 2', Pad 2) 이 있는 탑: 마운트 위 풀스택(부스터+우주선), 젓가락이 우주선 캐치 핀을 잡고 있음, QD 암 연결
//    · 다른 탑: 젓가락이 부스터를 캐치해 들고 있는 장면(QD 암 접힘)
//  - 탑 꼭대기 building:part(min_height ≥100) 박스, Pad 2 박스 → 숨김(충돌판정은 유지)
//  - man_made=storage_tank → 원통 탱크
// 사용: prepare(data) 는 buildWorld 전에 호출(교체 대상 건물에 _skip 표시), build(scene, renderer) 는 이후.
import * as THREE from 'three';
import { towerMaterials } from './towerTextures.js';
import { createLaunchTower, createLaunchMount } from './launchTower.js';
import { createBooster, createShip, R, BOOSTER, SHIP, PIN_HALF } from './starshipModel.js';
import { classifyTank, createTanks } from './tankModel.js';

const centroid = (o) => { let x = 0, z = 0; for (const p of o) { x += p[0]; z += p[1]; } return [x / o.length, z / o.length]; };
const isTower = (b) => (b.mm === 'tower' || /Integration Tower/i.test(b.n || '')) && b.h >= 100 && !b.mh;
const isOLM = (b) => b.ref === 'OLM 2' || (b.n === 'Pad 2' && b.k === 'industrial');
const isTrench = (b) => b.ft === 1 || b.n === 'Flame Trench'; // 지하 화염 트렌치(layer=-1) — 기본 높이 박스 대신 낮은 콘크리트

export function createTowerAddon(data) {
  const towers = data.buildings.filter(isTower).map((b) => {
    const [cx, cz] = centroid(b.o);
    let side = 0; for (let i = 0; i < b.o.length; i++) { const p = b.o[i], q = b.o[(i + 1) % b.o.length]; side += Math.hypot(q[0] - p[0], q[1] - p[1]); }
    side = THREE.MathUtils.clamp(side / b.o.length, 9, 16);
    return { b, cx, cz, side, height: b.h };
  });
  const parts = data.buildings.filter((b) => b.mh >= 100 && towers.some((t) => { const [x, z] = centroid(b.o); return Math.hypot(x - t.cx, z - t.cz) < 20; }));
  const olmParts = data.buildings.filter(isOLM), trenches = data.buildings.filter(isTrench);
  const tankDefs = [];
  for (const b of data.buildings) if (b.mm === 'storage_tank') { const t = classifyTank(b); if (t) { tankDefs.push(t); b._skip = true; } }
  for (const t of towers) t.b._skip = true;
  for (const b of [...parts, ...olmParts, ...trenches]) b._skip = true;

  // OLM 중심 = Pad 2 의 원형 구멍(inner ring) 중심
  let olm = null;
  for (const b of olmParts) if (b.holes?.length) { const [x, z] = centroid(b.holes[0]); olm = { x, z }; }

  // 기체 위치: 탑 주변 gantry(젓가락 평면도) 꼭짓점 중 탑에서 먼 쪽 평균. 없으면 OLM 방향/기본값
  for (const t of towers) {
    const far = [];
    for (const gw of data.gantries || []) for (const [x, z] of gw.p) { const d = Math.hypot(x - t.cx, z - t.cz); if (d > t.side * 0.7 + 8 && d < 50) far.push([x, z]); }
    let vx, vz;
    if (far.length) { vx = far.reduce((s, p) => s + p[0], 0) / far.length; vz = far.reduce((s, p) => s + p[1], 0) / far.length; }
    else if (olm && Math.hypot(olm.x - t.cx, olm.z - t.cz) < 60) { vx = olm.x; vz = olm.z; }
    else { vx = t.cx + 26; vz = t.cz; }
    t.onOLM = !!(olm && Math.hypot(olm.x - vx, olm.z - vz) < 12);
    if (t.onOLM) { vx = olm.x; vz = olm.z; }
    t.vx = vx; t.vz = vz; t.D = Math.hypot(vx - t.cx, vz - t.cz); t.yaw = Math.atan2(vx - t.cx, vz - t.cz);
  }

  const info = { towers: towers.map(({ cx, cz, side, height, vx, vz, D, onOLM }) => ({ cx, cz, side, height, vx, vz, D, onOLM })), olm, tanks: tankDefs.length, skipped: data.buildings.filter((b) => b._skip).length };
  let root = null;

  function build(scene, renderer) {
    const mats = towerMaterials(renderer);
    root = new THREE.Group(); root.name = 'towerAddon';
    const OLM_TOP = 12.5;
    for (const t of towers) {
      let armTopY, qd;
      const veh = new THREE.Group();
      if (t.onOLM) { // 풀스택: 마운트 위 부스터 + 우주선, 젓가락은 우주선 캐치 핀 아래
        const booster = createBooster(mats); booster.position.y = OLM_TOP; veh.add(booster);
        const shipBase = OLM_TOP + BOOSTER.h + BOOSTER.hsr, ship = createShip(mats); ship.position.y = shipBase; veh.add(ship);
        armTopY = shipBase + SHIP.pinY - PIN_HALF; qd = { y: shipBase + 4.2, extended: true };
        const mount = createLaunchMount(mats, { R, topY: OLM_TOP }); veh.add(mount);
        Object.assign(t, { booster, ship, veh, OLM_TOP }); // [launch] 발사 연출용 참조
      } else { // 부스터 캐치: 젓가락 위에 그리드핀 아래 핀이 얹혀 매달림
        armTopY = Math.min(t.height - 40, 100);
        const booster = createBooster(mats, { topCap: true }); booster.position.y = armTopY + PIN_HALF - BOOSTER.pinY; veh.add(booster);
        qd = { y: armTopY - 30, extended: false };
      }
      veh.position.set(t.vx, 0, t.vz); veh.rotation.y = t.yaw;
      const tower = createLaunchTower(mats, { side: t.side, height: t.height, D: t.D, R, armTopY, qd, rig: t.onOLM }); // [launch] rig: OLM 탑(Tower 2)만 애니메이션 가능 구조
      tower.position.set(t.cx, 0, t.cz); tower.rotation.y = t.yaw;
      root.add(tower, veh);
      t.armTopY = armTopY; t.tower = tower; // [launch]
    }
    const slab = (list, depth, mat) => { // 원래 폴리곤 모양(구멍 유지)의 낮은 콘크리트 판
      for (const b of list) {
        const sh = new THREE.Shape(b.o.map(([x, z]) => new THREE.Vector2(x, -z)));
        for (const h of b.holes || []) sh.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
        const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 8, uv.getY(i) / 8);
        const m = new THREE.Mesh(g, mat); m.receiveShadow = true; root.add(m);
      }
    };
    slab(olmParts, 1.2, mats.concrete); // Pad 2
    slab(trenches, 0.5, mats.concreteDark); // 화염 트렌치(지하) 덮개
    if (tankDefs.length) root.add(createTanks(tankDefs, mats));
    scene.add(root);
    return root;
  }
  return { info, build, get root() { return root; }, towers };
}
