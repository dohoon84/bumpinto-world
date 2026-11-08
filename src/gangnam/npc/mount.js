// [gangnam-npc] 강남 섬에 들어올 때만 npc.json 을 받고 메시를 만든다.
//   보행 crowd(buildCrowd) + 차량 BatchedMesh 1 + 횡단보도(buildCorridorCrossings, CYCLE 그대로).
import * as THREE from 'three';
import { buildCrowd } from '../../entities/avatarCrowd.js';
import { buildCorridorCrossings } from '../../corridor/crossings.js';
import { gameHour } from '../../weather.js';
import { parseTrafficFix } from '../../trafficFix.js';
import { gangnamNpcEnabled } from './flags.js';
import { parseGangnamCars } from './density.js';
import { createGangnamTraffic } from './cars.js';
import { createGangnamPeds } from './peds.js';
import { watchEvening } from '../../evening.js';

export const GANGNAM_NPC_FILE = 'gangnam/npc.json';
const WAKE_R = 280;
const boxDist = (b, x, z) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));

export function mountGangnamNpc({
  scene, terrain = null, overlay = null, params, mobile = false, gangnam, baseUrl = '',
  isFree = () => true, freeSpot = (x, z) => ({ x, z }), tileReady = () => true, getHour = gameHour,
  fetchJson = null,
} = {}) {
  if (!gangnamNpcEnabled(typeof params?.get === 'function' ? paramsToSearch(params) : (params || ''))) return null;
  const box = gangnam?.meta?.box;
  if (!box) return null;
  const root = new THREE.Group();
  root.name = 'gangnamNpc';
  scene?.add(root);
  const carsOpt = parseGangnamCars(params, { mobile });
  let data = null, traffic = null, peds = null, cross = null, crowd = null;
  let loading = null, failed = false, clock = 0;
  const get = fetchJson || ((f) => fetch(baseUrl + f).then((r) => (r.ok ? r.json() : null)).catch(() => null));

  function pedPts() {
    if (!peds) return [];
    const out = [];
    for (const a of peds.actors) {
      if (!a.path || !a.mesh.visible) continue;
      const p = a.mesh.position;
      if (peds.onZebra(p.x, p.z)) out.push({ x: p.x, z: p.z });
    }
    return out;
  }

  function build(j) {
    data = j;
    cross = buildCorridorCrossings(root, j.crossings || [], { getSimTime: () => clock });
    for (const ch of cross.group.children) ch.castShadow = false;
    const loader = {
      box,
      data: { walk: j.walk || [], stops: j.stops || [] },
      near: (x, z) => boxDist(box, x, z) < WAKE_R,
      load: () => Promise.resolve(loader.data),
    };
    peds = createGangnamPeds({
      npc: j, loader, terrain, isFree, freeSpot, tileReady, getHour, overlay, mobile,
      crossings: cross.crossings, pedLight: (c) => cross.pedLight(c),
    });
    crowd = buildCrowd(root, { name: 'gangnamCrowd', cast: () => false });
    peds.register(crowd);
    crowd.finalize();
    if (carsOpt.on && carsOpt.base > 0 && j.drive?.nodes?.length) {
      traffic = createGangnamTraffic(root, {
        drive: j.drive, box, station: j.meta?.station, base: carsOpt.base, hour: getHour,
        transit: { crossings: cross.crossings, pedLight: cross.pedLight, source: { vehicles: () => [] } },
        world: { groundY: (x, z, y) => (terrain?.getGroundHeight ? terrain.getGroundHeight(x, z, y || 0) : 0) },
        fix: parseTrafficFix(params), peds: pedPts, watchEvening, mobile,
      });
    }
  }

  function drawCount() {
    let n = 0;
    if (crowd) for (const P of crowd.parts.values()) if (P.im?.visible && P.im.count > 0) n++;
    if (traffic?.mesh?.visible) n += 1;
    if (cross?.group?.visible) for (const ch of cross.group.children) if (ch.visible !== false) n++;
    return n;
  }

  return {
    root, box,
    get data() { return data; },
    get traffic() { return traffic; },
    get peds() { return peds; },
    get crossings() { return cross?.crossings || []; },
    get clock() { return clock; },
    setTime(t) { clock = t; cross?.update(0.2); },
    seek(road, phase) {
      const list = (cross?.crossings || []).filter((c) => !road || c.road === road);
      const c = road && typeof road === 'object' ? road : list[0];
      if (!c) return null;
      for (let t = 0; t < 60; t += 0.25) {
        clock = t;
        if (cross.pedLight(c) === phase) { cross.update(0.2); return t; }
      }
      return null;
    },
    pedLight: (c) => cross?.pedLight(c) || 'none',
    shoutNearest: (x, z) => peds?.shoutNearest(x, z) || null,
    obstacles(x, z, R = 40) {
      if (!traffic) return [];
      return traffic.obstacles(x, z, R);
    },
    update(dt, x, z, yaw = null) {
      if (yaw != null) {
        peds?.setYaw?.(yaw);
        if (traffic) traffic.sim.yaw = yaw;
      }
      const here = boxDist(box, x, z) < WAKE_R;
      if (!here) {
        root.visible = false;
        if (peds && crowd) { crowd.begin(); peds.render(crowd, dt, x, z); crowd.end(); }
        return;
      }
      root.visible = true;
      if (!data) {
        if (!loading && !failed) loading = get(GANGNAM_NPC_FILE).then((j) => { loading = null; if (!j?.drive) { failed = true; return; } build(j); });
        return;
      }
      clock += Math.min(dt, 0.1);
      cross?.update(dt);
      if (crowd && peds) { crowd.begin(); peds.render(crowd, dt, x, z); crowd.end(); }
      traffic?.update(Math.min(dt, 0.1), { x, z });
    },
    stats: () => ({
      ready: !!data, failed, mobile, asleep: !data || peds?.stats?.asleep !== false,
      peds: peds?.stats || null,
      cars: traffic ? traffic.stats() : { on: carsOpt.on, base: carsOpt.base },
      crossings: cross?.crossings?.length || 0,
      signals: cross?.signals || 0,
      draws: drawCount(),
      tourists: peds ? peds.actors.filter((a) => a.tourist && a.path).length : 0,
    }),
    dispose() {
      traffic?.dispose();
      peds?.dispose();
      root.removeFromParent();
    },
  };
}

function paramsToSearch(params) {
  if (!params?.get) return '';
  const bits = [];
  for (const k of ['gangnam', 'gangnamnpc', 'gangnamnpcn', 'gangnamcars']) {
    const v = params.get(k);
    if (v != null) bits.push(`${k}=${v}`);
  }
  return bits.length ? '?' + bits.join('&') : '';
}
