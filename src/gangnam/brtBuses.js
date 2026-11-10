// [gangnam-brt] 강남대로 중앙버스전용차로 시내·광역 버스.
//   createBus + SimulatedBusSource (정자·코리더와 같은 파이프라인).
//   경로는 busway 중심선. SimulatedBusSource 의 LANE_OFF=1.7 은
//   입력 점을 진행 방향 오른쪽(문 반대)으로 1.7m 미리 밀어서 상쇄한다.
//   문을 섬 쪽으로 밀면 섬과 겹친다.
//   ?gbrt=0 · ?gangnam=0 이면 만들지 않는다.
import * as THREE from 'three';
import { SimulatedBusSource } from '../transit/busSource.js';
import { createBus, disposeBus } from '../transit/busModel.js';
import { liveryOf } from '../transit/livery.js';
import { gangnamBrtEnabled, buildBrtTransit } from './brtData.js';

export { gangnamBrtEnabled, buildBrtTransit, offsetRight } from './brtData.js';

const RADIUS = 380, MAX_BUSES = 8, POOL_PER_KEY = 2, POOL_MAX = 8;
const DWELL = 15; // 0.8~1.3× → 약 12–20초

export function createGangnamBrt({
  scene, terrain = null, overlay = null, url, mobile = false, getNpc = () => null,
} = {}) {
  const root = new THREE.Group();
  root.name = 'gangnamBrt';
  scene?.add(root);
  const stats = { loaded: false, buses: 0, drawn: 0, dwell: 0, mobile };
  let dead = false, source = null, transit = null, data = null;
  const gy = (x, z, ref = 0) => (terrain?.getVehicleHeight || terrain?.getGroundHeight)?.(x, z, ref) ?? 0;

  const ctx = {
    pedLight(c) {
      const p = getNpc?.()?.pedLight?.(c);
      if (p === 'green' || p === 'blink' || p === 'red') return p;
      return 'red';
    },
  };

  const active = new Map();
  const pool = new Map();
  let pooled = 0;
  const take = (v) => {
    const key = `${v.ref}|${v.type}`;
    let m = pool.get(key)?.pop();
    if (m) pooled--;
    if (!m) { m = createBus(v.ref, v.type, v.name); m.userData.key = key; }
    m.visible = true;
    root.add(m);
    const lv = liveryOf(v.type);
    const tag = overlay?.add?.({
      cls: 'tag bus',
      text: `🚌 ${v.ref} · ${lv.label}`,
      getPos: () => m.position.clone().setY(m.position.y + 4.4),
      maxDist: 70,
    });
    if (tag?.el) tag.el.style.background = lv.plain ? '#2c3e6b' : lv.color;
    return { m, key, tag };
  };
  const give = (a) => {
    a.m.userData.releaseLights?.();
    root.remove(a.m);
    if (a.tag && overlay) overlay.remove(a.tag);
    let l = pool.get(a.key);
    if (l) pool.delete(a.key); else l = [];
    pool.set(a.key, l);
    if (l.length >= POOL_PER_KEY) { disposeBus(a.m); return; }
    l.push(a.m); pooled++;
    for (const [k, arr] of pool) {
      if (pooled <= POOL_MAX) break;
      while (arr.length && pooled > POOL_MAX) { disposeBus(arr.shift()); pooled--; }
      if (!arr.length) pool.delete(k);
    }
  };

  function applyHeadway(sim) {
    const hash = (s) => {
      let h = 2166136261;
      for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      return (h >>> 0) / 4294967296;
    };
    sim.buses = [];
    for (const P of sim.paths) {
      P.headway = 30 + hash(P.ref + P.id) * 10;
      P.fadeIn = true;
      P.fadeOut = true;
      const gap = P.headway * P.vmax * 0.75;
      let k = 0;
      for (let s = P.L - 25 - hash(P.ref + 'o' + P.id) * gap; s > 12 && k < 5; s -= gap, k++) sim._spawn(P, s);
      P.nextSpawn = hash(P.ref + 'n' + P.id) * P.headway;
    }
  }

  const ready = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
    if (!j?.brt || dead) return;
    data = j.brt;
    transit = buildBrtTransit(data);
    if (!transit.paths.length) return;
    const bounds = j.meta?.box || { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 };
    source = new SimulatedBusSource(transit, bounds, { seed: 9, spacing: true, dwell: DWELL });
    applyHeadway(source);
    stats.loaded = true;
    stats.paths = source.paths.length;
    stats.dirs = data.dirs?.length || 0;
  });

  function syncMeshes(fx, fz) {
    if (!source) return;
    const vs = source.vehicles();
    const maxN = mobile ? 5 : MAX_BUSES;
    const near = [];
    for (const v of vs) {
      const d = Math.hypot(v.x - fx, v.z - fz);
      if (d < RADIUS && v.scale > 0.02) near.push([d, v]);
    }
    near.sort((a, b) => a[0] - b[0]);
    near.length = Math.min(near.length, maxN);
    const seen = new Set();
    let dwell = 0;
    for (const [, v] of near) {
      seen.add(v.id);
      if (v.state === 'dwell') dwell++;
      let a = active.get(v.id);
      if (!a) { a = take(v); active.set(v.id, a); }
      const y = gy(v.x, v.z, a.m.position.y || 0);
      a.m.position.set(v.x, y + 0.08, v.z);
      a.m.rotation.y = v.heading;
      a.m.scale.setScalar(v.scale);
      a.m.userData.state = v.state;
    }
    for (const [id, a] of active) if (!seen.has(id)) { give(a); active.delete(id); }
    stats.buses = source.buses.length;
    stats.drawn = active.size;
    stats.dwell = dwell;
  }

  function stageAt(stopRef) {
    if (!source || !transit) return null;
    const stop = transit.stops.find((s) => s.ref === stopRef || s.id === stopRef || s.id === `m${stopRef}`);
    if (!stop) return null;
    const placed = new Set();
    for (const P of source.paths) {
      const st = P.stops.find((x) => x.stop === stop.id);
      if (!st) continue;
      const dir = String(P.id).split('-').pop();
      if (placed.has(dir)) continue;
      placed.add(dir);
      let b = source.buses.find((o) => o.P === P);
      if (!b) b = source._spawn(P, Math.max(8, st.s - 8));
      b.s = Math.max(4, st.s - 7);
      b.v = 5;
      b.dwell = 0;
      b.done = false;
      b.stopIdx = P.stops.findIndex((x) => x.stop === stop.id);
      if (b.stopIdx < 0) b.stopIdx = 0;
      b.state = 'run';
    }
    for (let i = 0; i < 240; i++) {
      source.update(0.05, ctx, { x: stop.x, z: stop.z });
      const n = source.vehicles().filter((v) => v.state === 'dwell' && Math.hypot(v.x - stop.x, v.z - stop.z) < 14).length;
      if (n >= placed.size) break;
    }
    syncMeshes(stop.x, stop.z);
    return {
      stop: stop.ref || stop.id,
      dwell: source.vehicles().filter((v) => v.state === 'dwell' && Math.hypot(v.x - stop.x, v.z - stop.z) < 14),
    };
  }

  return {
    root,
    ready,
    get source() { return source; },
    get data() { return data; },
    stats,
    stageAt,
    vehicles: () => source?.vehicles() || [],
    update(dt, x, z) {
      if (!source) return;
      source.update(Math.min(dt, 0.1), ctx, { x, z });
      syncMeshes(x, z);
    },
    dispose() {
      dead = true;
      for (const a of active.values()) give(a);
      active.clear();
      for (const arr of pool.values()) for (const m of arr) disposeBus(m);
      pool.clear();
      root.removeFromParent();
    },
  };
}
