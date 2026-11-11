// [namsan-npc] 남산 광장·케이블카 정류장·도서관·약수터·공원길/소월로 보도 NPC
//   몸은 코리더 보행 NPC 와 같은 아바타(createAvatar/animateAvatar)이고, 같은 buildCrowd
//   인스턴싱(부품별 InstancedMesh)을 쓴다. 남산은 코리더 타일 밖이라 자체 crowd 로 돌린다
//   (코리더 traffic/extraCrowd 가 꺼져 있어도 ?nnpc=0 만으로 제어). ?ntower=0 이면 같이 끔.
//   위치는 OSM 정류장·입구·이름 있는 길에서 고르고, 차도·건물·벽 안은 걸러 낸다.
//   높이: namsan.surfaceY (지형·도로·보도). 시점 140m 밖은 숨기고 240m 밖은 재배치.
import * as THREE from 'three';
import { createAvatar, animateAvatar } from '../../entities/avatar.js';
import { buildCrowd } from '../../entities/avatarCrowd.js';
import { gameHour } from '../../weather.js';
import { NT } from './namsanCoords.js';
import { namsanStationDoors } from './namsanCable.js';

export const MAX_NPC = 84;

export function namsanNpcEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search || '');
  return q.get('ntower') !== '0' && q.get('nnpc') !== '0';
}

export function namsanNpcForce(search = typeof location !== 'undefined' ? location.search : '') {
  const n = parseInt(new URLSearchParams(search || '').get('nnpcn'), 10);
  return n > 0 ? Math.min(n, 200) : 0;
}

const MIX = { plaza: 0.22, photo: 0.12, queue: 0.18, station: 0.1, library: 0.12, spring: 0.08, walk: 0.18 };
const PLAZA_MIX = { plaza: 0.5, photo: 0.28, queue: 0.06, station: 0.04, walk: 0.08, library: 0.02, spring: 0.02 };
const STATION_MIX = { queue: 0.42, station: 0.22, plaza: 0.08, photo: 0.04, walk: 0.14, library: 0.05, spring: 0.05 };

export function namsanNpcDensityAt(h) {
  const hour = ((h % 24) + 24) % 24;
  if (hour < 6 || hour >= 23) return { count: 16, period: 'night', mix: { plaza: 0.22, photo: 0.1, queue: 0.08, station: 0.1, library: 0.08, spring: 0.08, walk: 0.34 } };
  if (hour < 10) return { count: 56, period: 'morning', mix: MIX };
  if (hour < 17) return { count: 72, period: 'day', mix: MIX };
  if (hour < 21) return { count: 56, period: 'evening', mix: MIX };
  return { count: 24, period: 'late', mix: MIX };
}

const TOPS = ['#f4f4f2', '#2f3a4a', '#c9ced6', '#e8e0d2', '#7d8b99', '#a7b3a0', '#d35454', '#5d7fb5', '#f0c75e', '#3b3f45', '#9b6fb0', '#ffffff'];
const PANTS = ['#2b2f36', '#3c4350', '#5a6170', '#8a7f6c', '#34495e', '#22262b', '#4b5f86'];
const SKINS = ['#f2d0b0', '#e8c4a8', '#f6d7c3', '#d7a888'];

function townLook(r) {
  const pick = (a) => a[Math.floor(r() * a.length)], f = r() < 0.52;
  const look = { color: pick(TOPS), pants: pick(PANTS), gender: f ? 'f' : 'm', hair: f ? pick(['long', 'pony', 'short']) : 'short', skin: pick(SKINS) };
  if (r() < 0.25) look.bag = pick(['#2d3436', '#8e6e53', '#636e72']);
  if (r() < 0.15) look.glasses = true;
  if (r() < 0.12) look.hat = pick(['#222222', '#c0392b', '#2c3e50']);
  if (r() < 0.2) look.top = pick(['short', 'hoodie']);
  return look;
}

const SHOW_R = 140, LOD_R = 55, PLACE_R = 180, REPLACE_R = 240;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function centroid(pts) {
  let x = 0, z = 0, n = 0;
  for (const p of pts) { x += p[0]; z += p[1]; n++; }
  return n ? { x: x / n, z: z / n } : { x: 0, z: 0 };
}
function pointInRing(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) inside = !inside;
  }
  return inside;
}
function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}
function ringEdge(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    best = Math.min(best, segDist(x, z, a[0], a[1], b[0], b[1]));
  }
  return best;
}

const FOOT = new Set(['footway', 'path', 'steps', 'pedestrian', 'cycleway', 'bridleway', 'corridor', 'platform', 'steps_ramp']);
function isCarWay(w) {
  const k = w.k || w.highway;
  if (!k || FOOT.has(k)) return false;
  return true;
}
function wayWidth(w) {
  const name = w.name || '';
  if (name === '소월로') return w.w || 14;
  if (name === '남산공원길' || /순환로/.test(name)) return Math.max(w.w || 0, 8.6);
  return w.w || 6;
}

function buildCarSegs(osm, city) {
  const segs = [];
  const add = (pts, hw) => {
    if (!pts || pts.length < 2 || !(hw > 0)) return;
    for (let i = 1; i < pts.length; i++) segs.push({ ax: pts[i - 1][0], az: pts[i - 1][1], bx: pts[i][0], bz: pts[i][1], hw });
  };
  for (const w of osm?.ways || []) {
    if (!isCarWay(w)) continue;
    add(w.pts, wayWidth(w) * 0.5);
  }
  for (const r of city?.roads || []) {
    if (!isCarWay(r)) continue;
    add(r.p || r.pts, (r.w || 6) * 0.5);
  }
  return segs;
}

function buildBuildings(osm, city, anchors) {
  const list = [];
  const add = (pts) => {
    if (!pts || pts.length < 3) return;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of pts) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1];
    }
    list.push({ pts, x0, z0, x1, z1 });
  };
  for (const key of ['upperStation', 'lowerStation', 'library', 'palgakjeong', 'bongsu', 'loveLockShop']) add(osm?.[key]?.pts);
  add(osm?.tower?.outer);
  const near = (x, z) => anchors.some((a) => Math.abs(a.x - x) < 100 && Math.abs(a.z - z) < 100);
  for (const b of city?.buildings || []) {
    const o = b.o; if (!o || o.length < 3) continue;
    let cx = 0, cz = 0;
    for (const p of o) { cx += p[0]; cz += p[1]; }
    cx /= o.length; cz /= o.length;
    if (near(cx, cz)) add(o);
  }
  return list;
}

export function createNamsanNpc({
  namsan, osm, city = null, parent = namsan?.root, seed = 7331, getHour = gameHour, count = 0, force = namsanNpcForce(),
} = {}) {
  count = force || count || MAX_NPC;
  const holder = new THREE.Group();
  holder.name = 'namsan-npc';
  parent?.add?.(holder);
  const crowd = buildCrowd(holder, { name: 'namsanCrowd' });
  const dens = (h) => { const d = namsanNpcDensityAt(h); return force ? { ...d, count: force } : d; };
  let rs = seed; const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  const carSegs = buildCarSegs(osm, city);
  const anchors = [{ x: NT.tx, z: NT.tz }];
  const upC = osm?.upperStation?.pts?.length >= 3 ? centroid(osm.upperStation.pts) : null;
  const loC = osm?.lowerStation?.pts?.length >= 3 ? centroid(osm.lowerStation.pts) : null;
  if (upC) anchors.push(upC);
  if (loC) anchors.push(loC);
  if (Number.isFinite(osm?.library?.entrance?.x)) anchors.push(osm.library.entrance);
  else if (Number.isFinite(osm?.library?.x)) anchors.push({ x: osm.library.x, z: osm.library.z });
  if (Number.isFinite(osm?.spring?.entrance?.x)) anchors.push(osm.spring.entrance);
  else if (Number.isFinite(osm?.spring?.x)) anchors.push({ x: osm.spring.x, z: osm.spring.z });
  const buildings = buildBuildings(osm, city, anchors);

  const roadClear = (x, z) => {
    let best = Infinity;
    for (const s of carSegs) {
      const d = segDist(x, z, s.ax, s.az, s.bx, s.bz) - s.hw;
      if (d < best) best = d;
    }
    return best;
  };
  const inBuilding = (x, z, pad = 1.05) => {
    for (const b of buildings) {
      if (x < b.x0 - pad || x > b.x1 + pad || z < b.z0 - pad || z > b.z1 + pad) continue;
      if (pointInRing(x, z, b.pts) || ringEdge(x, z, b.pts) < pad) return true;
    }
    return !!(namsan?.isBlocked?.(x, z, Math.max(0.55, pad * 0.7)));
  };
  const walkOk = (x, z) => Number.isFinite(x) && Number.isFinite(z) && !inBuilding(x, z, 1.1) && roadClear(x, z) >= 0.5;
  // 정류장 앞 에이프런은 건물 pad(1.1)나 서비스 도로 가장자리에 걸릴 수 있어 줄을 세울 때는 조금 느슨하게 본다.
  const queueOk = (x, z) => Number.isFinite(x) && Number.isFinite(z) && !inBuilding(x, z, 0.38) && !(namsan?.isBlocked?.(x, z, 0.42)) && roadClear(x, z) >= -0.2;

  function around(c, r0, r1, n) {
    const out = [];
    if (!c) return out;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.15;
      const r = r0 + rnd() * (r1 - r0);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (walkOk(x, z)) out.push({ x, z });
    }
    return out;
  }

  function queueAtDoor(door, n = 9, at) {
    const out = [];
    if (!door) return out;
    const nx = door.nx, nz = door.nz, px = -nz, pz = nx;
    const faceYaw = Math.atan2(-nx, -nz);
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 0.2 : -0.16;
      const x = door.x + nx * (1.9 + i * 0.8) + px * side;
      const z = door.z + nz * (1.9 + i * 0.8) + pz * side;
      if (queueOk(x, z)) out.push({ x, z, yaw: faceYaw, at });
      else {
        const x2 = x + px * 0.7, z2 = z + pz * 0.7;
        if (queueOk(x2, z2)) out.push({ x: x2, z: z2, yaw: faceYaw, at });
      }
    }
    return out;
  }

  function sidewalkLines() {
    const lines = [];
    const pushLine = (raw) => {
      let cur = [];
      const flush = () => { if (cur.length >= 4) lines.push(cur); cur = []; };
      for (const pt of raw) {
        if (walkOk(pt[0], pt[1])) cur.push(pt);
        else flush();
      }
      flush();
    };
    for (const w of osm?.ways || []) {
      const name = w.name || '';
      if (name !== '소월로' && name !== '남산공원길') continue;
      const pts = w.pts; if (!pts || pts.length < 2) continue;
      const hw = wayWidth(w) * 0.5;
      for (const sgn of [1, -1]) {
        const off = hw + 1.28;
        const raw = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
          raw.push([pts[i][0] + nx * sgn * off, pts[i][1] + nz * sgn * off]);
        }
        pushLine(raw);
      }
    }
    return lines;
  }

  const plaza = [];
  const photo = [];
  const door = namsan?.tower?.door;
  for (let ring = 0; ring < 6; ring++) {
    const r = 18 + ring * 8, n = 12 + ring * 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.11;
      const x = NT.tx + Math.cos(a) * r, z = NT.tz + Math.sin(a) * r;
      if (walkOk(x, z)) plaza.push({ x, z });
    }
  }
  if (door) {
    const nx = door.nx || 1, nz = door.nz || 0, px = -nz, pz = nx;
    for (let i = 0; i < 32; i++) {
      const out = 3.4 + (i % 8) * 2.15 + rnd() * 0.5;
      const side = (Math.floor(i / 8) - 1.5) * 2.45 + (rnd() - 0.5) * 1.1;
      const x = door.x + nx * out + px * side, z = door.z + nz * out + pz * side;
      if (!walkOk(x, z)) continue;
      plaza.push({ x, z });
      if (i % 2 === 0) photo.push({ x, z, yaw: Math.atan2(NT.tx - x, NT.tz - z) });
    }
    const approach = Math.atan2(nx, nz);
    for (let i = 0; i < 18; i++) {
      const a = approach + (i / 18 - 0.5) * 1.7;
      const r = 22 + (i % 5) * 4.2;
      const x = NT.tx + Math.sin(a) * r, z = NT.tz + Math.cos(a) * r;
      if (!walkOk(x, z)) continue;
      plaza.push({ x, z });
      photo.push({ x, z, yaw: Math.atan2(NT.tx - x, NT.tz - z) });
    }
  }
  const ringPts = namsan?.tower?.plazaPts;
  if (ringPts && ringPts.length >= 3) {
    const rc = centroid(ringPts);
    for (let i = 0; i < ringPts.length; i++) {
      const pt = ringPts[i];
      const nd = Math.hypot(pt[0] - rc.x, pt[1] - rc.z) || 1;
      const x = pt[0] + ((pt[0] - rc.x) / nd) * 2.5, z = pt[1] + ((pt[1] - rc.z) / nd) * 2.5;
      if (!walkOk(x, z)) continue;
      plaza.push({ x, z });
      if (i % 2 === 0) photo.push({ x, z, yaw: Math.atan2(NT.tx - x, NT.tz - z) });
    }
  }

  const doors = namsanStationDoors(osm);
  const queue = [];
  for (const s of queueAtDoor(doors.upper, 9, 'upper')) queue.push(s);
  for (const s of queueAtDoor(doors.lower, 9, 'lower')) queue.push(s);

  const station = around(upC, 8, 16, 14).concat(around(loC, 8, 16, 14));
  const library = [];
  if (Number.isFinite(osm?.library?.entrance?.x)) {
    const e = osm.library.entrance;
    if (walkOk(e.x, e.z)) library.push({ x: e.x, z: e.z });
    for (const s of around(e, 3, 12, 16)) library.push(s);
  }
  const spring = [];
  if (Number.isFinite(osm?.spring?.entrance?.x)) {
    const e = osm.spring.entrance;
    if (walkOk(e.x, e.z)) spring.push({ x: e.x, z: e.z });
    for (const s of around(e, 3, 12, 14)) spring.push(s);
  } else if (Number.isFinite(osm?.spring?.x)) {
    const e = { x: osm.spring.x, z: osm.spring.z };
    if (walkOk(e.x, e.z)) spring.push(e);
    for (const s of around(e, 4, 12, 12)) spring.push(s);
  }

  const walks = sidewalkLines();
  const walk = [];
  for (const line of walks) {
    for (let i = 0; i < line.length; i += 3) walk.push({ x: line[i][0], z: line[i][1], line });
  }

  const spots = { plaza, photo, queue, station, library, spring, walk };
  const box = namsan?.bounds || { x0: NT.tx - 900, x1: NT.tx + 400, z0: NT.tz - 900, z1: NT.tz + 400 };
  const boxDist = (x, z) => Math.hypot(Math.max(box.x0 - x, 0, x - box.x1), Math.max(box.z0 - z, 0, z - box.z1));

  const TURNS = [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.35, -1.35, 1.8, -1.8];
  function freePath(x0, z0, step = 2.4, n = 18, prefer = null) {
    let a = prefer == null ? rnd() * Math.PI * 2 : prefer + (rnd() - 0.5) * 0.4;
    const pts = [[x0, z0]];
    let x = x0, z = z0;
    for (let i = 0; i < n; i++) {
      let moved = false;
      for (const t of TURNS) {
        const b = a + t + (rnd() - 0.5) * 0.1, nx = x + Math.cos(b) * step, nz = z + Math.sin(b) * step;
        if (walkOk(nx, nz) && walkOk((x + nx) / 2, (z + nz) / 2) && walkOk(x + Math.cos(b) * step * 1.8, z + Math.sin(b) * step * 1.8)) {
          a = b; x = nx; z = nz; pts.push([x, z]); moved = true; break;
        }
      }
      if (!moved) break;
    }
    return pts.length >= 5 ? pts : null;
  }
  function sliceLine(line) {
    if (!line || line.length < 5) return null;
    const maxStart = Math.max(0, line.length - 6);
    const i0 = Math.floor(rnd() * (maxStart + 1));
    const i1 = Math.min(line.length, i0 + 6 + Math.floor(rnd() * 10));
    const pts = line.slice(i0, i1);
    return pts.length >= 5 ? pts.map((p) => [p[0], p[1]]) : null;
  }

  const actors = [];
  for (let i = 0; i < count; i++) {
    const mesh = createAvatar(townLook(rnd));
    mesh.visible = false;
    actors.push({ i, mesh, parts: crowd.register(mesh), path: null, cum: null, L: 0, s: 0, dir: 1, speed: 1, idle: 0, y: 0, leaving: false, shown: false, kind: null, spot: null, yawFix: null });
  }
  crowd.finalize();

  function chooseKind(mix) {
    let r = rnd();
    for (const [k, w] of Object.entries(mix)) { r -= w; if (r <= 0) return k; }
    return 'plaza';
  }
  function mixFor(fx, fz, D) {
    if (Math.hypot(fx - NT.tx, fz - NT.tz) < 95) return PLAZA_MIX;
    if ((upC && Math.hypot(fx - upC.x, fz - upC.z) < 55) || (loC && Math.hypot(fx - loC.x, fz - loC.z) < 55)) return STATION_MIX;
    return D.mix;
  }
  function standPath(x, z, yaw) {
    return [[x, z], [x + Math.sin(yaw || 0) * 0.04, z + Math.cos(yaw || 0) * 0.04]];
  }
  function assign(a, kind, sp, path, extra = {}) {
    const cum = [0];
    for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]));
    if (a.spot) a.spot.load = (a.spot.load || 1) - 1;
    a.spot = sp; sp.load = (sp.load || 0) + 1;
    Object.assign(a, { path, cum, L: cum[cum.length - 1] || 0.01, s: extra.s != null ? extra.s : rnd() * (cum[cum.length - 1] || 0.01), dir: extra.dir ?? (rnd() < 0.5 ? 1 : -1), kind, idle: extra.idle || 0, leaving: false, yawFix: extra.yawFix ?? null, speed: extra.speed ?? (0.95 + rnd() * 0.3) });
    return true;
  }
  function assignQueue(a, sp) {
    return assign(a, 'queue', sp, standPath(sp.x, sp.z, sp.yaw), { yawFix: sp.yaw ?? 0, idle: 80 + rnd() * 40, speed: 0, s: 0, dir: 1 });
  }
  function ensureQueues(fx, fz) {
    const groups = { upper: [], lower: [] };
    for (const s of spots.queue) {
      if (Math.hypot(s.x - fx, s.z - fz) > PLACE_R) continue;
      (groups[s.at] || (groups[s.at] = [])).push(s);
    }
    for (const slots of Object.values(groups)) {
      if (!slots.length) continue;
      const taken = new Set();
      for (const a of actors) {
        if (a.kind === 'queue' && a.spot && slots.includes(a.spot)) taken.add(a.spot);
      }
      for (const slot of slots) {
        if (taken.has(slot)) continue;
        const free = actors.find((a) => a.i < D.count && !a.path);
        if (!free) break;
        assignQueue(free, slot);
      }
    }
  }
  function place(a, fx, fz, D, preferKind) {
    const near = (s) => Math.abs(s.x - fx) < PLACE_R && Math.abs(s.z - fz) < PLACE_R;
    const mix = mixFor(fx, fz, D);
    for (let t = 0; t < 5; t++) {
      const kind = preferKind || (t < 4 ? chooseKind(mix) : 'plaza');
      const cand = (spots[kind] || []).filter(near);
      if (!cand.length) continue;
      let sp = null, best = Infinity;
      for (const c of cand) { const n = (c.load || 0) + rnd() * 0.85; if (n < best) { best = n; sp = c; } }
      if (!sp) continue;
      if (kind === 'queue' && (sp.load || 0) >= 1) continue;
      if (kind !== 'queue' && !walkOk(sp.x, sp.z)) continue;
      if (kind === 'queue' && !queueOk(sp.x, sp.z)) continue;
      if (kind === 'queue') return assignQueue(a, sp);
      if (kind === 'photo' || (kind === 'plaza' && rnd() < 0.4)) {
        const yaw = sp.yaw != null ? sp.yaw : Math.atan2(NT.tx - sp.x, NT.tz - sp.z);
        return assign(a, kind === 'photo' ? 'photo' : 'plaza', sp, standPath(sp.x, sp.z, yaw), { yawFix: yaw, idle: 14 + rnd() * 22, speed: 0, s: 0, dir: 1 });
      }
      if (kind === 'walk' && sp.line) {
        const path = sliceLine(sp.line) || freePath(sp.x, sp.z, 2.6, 22);
        if (!path) continue;
        return assign(a, kind, sp, path, { speed: 1.05 + rnd() * 0.35 });
      }
      const toward = (kind === 'library' || kind === 'spring')
        ? Math.atan2(NT.tz - sp.z, NT.tx - sp.x)
        : null;
      const nStep = kind === 'plaza' ? 14 : kind === 'station' ? 10 : 14;
      const path = freePath(sp.x, sp.z, 2.3, nStep, toward);
      if (!path) continue;
      if (rnd() < 0.45) path.reverse();
      return assign(a, kind, sp, path);
    }
    a.path = null; return false;
  }
  const sample = (a, s) => {
    let k = 1; while (k < a.cum.length - 1 && a.cum[k] < s) k++;
    const p = a.path[k - 1], q = a.path[k], L = a.cum[k] - a.cum[k - 1] || 1, f = (s - a.cum[k - 1]) / L;
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, (q[0] - p[0]) / L, (q[1] - p[1]) / L];
  };
  const hide = (a) => { if (a.spot) { a.spot.load = Math.max(0, (a.spot.load || 1) - 1); a.spot = null; } a.path = null; a.shown = false; a.mesh.visible = false; a.yawFix = null; };

  const groundY = (x, z, ref) => {
    const y = namsan?.surfaceY?.(x, z, ref) ?? namsan?.heightAt?.(x, z);
    return Number.isFinite(y) ? y : (Number.isFinite(ref) ? ref : 0);
  };

  let D = dens(getHour()), dAcc = 99, chk = 99, asleep = true;
  const stats = { active: 0, placed: 0, visible: 0, period: D.period, target: D.count, byKind: {}, cpuMs: 0, pool: count, asleep: true };
  function tick(dt, fx, fz) {
      const t0 = now();
      crowd.begin();
      if (boxDist(fx, fz) > 480) {
        if (!asleep) { for (const a of actors) hide(a); asleep = stats.asleep = true; stats.active = stats.placed = stats.visible = 0; }
        crowd.end();
        return;
      }
      asleep = stats.asleep = false;
      dAcc += dt; chk += dt;
      if (dAcc > 2) { dAcc = 0; D = dens(getHour()); stats.period = D.period; stats.target = D.count; }
      let have = 0; for (const a of actors) if (a.path) have++;
      const check = chk > 1 || have < D.count / 2; if (check) chk = 0;
      if (check) ensureQueues(fx, fz);
      let placedNow = 0, act = 0, vis = 0, placed = 0; const byKind = {};
      const dPl = Math.hypot(fx - NT.tx, fz - NT.tz);
      let plazaNear = 0;
      if (check && dPl < 95) {
        for (const a of actors) {
          if (a.path && (a.kind === 'plaza' || a.kind === 'photo') && Math.hypot((a.mesh.position.x || 0) - fx, (a.mesh.position.z || 0) - fz) < 75) plazaNear++;
        }
      }
      for (const a of actors) {
        const want = a.i < D.count;
        if (!want && a.path && !a.leaving) a.leaving = true;
        if (a.leaving && (!a.shown || Math.hypot(a.mesh.position.x - fx, a.mesh.position.z - fz) > 60)) hide(a);
        if (!a.path) {
          if (want && check && placedNow < 14) {
            placedNow++;
            let pref = null;
            if (dPl < 95 && plazaNear < 22) pref = rnd() < 0.4 ? 'photo' : 'plaza';
            if (place(a, fx, fz, D, pref) && (a.kind === 'plaza' || a.kind === 'photo')) plazaNear++;
          }
          if (!a.path) { if (a.mesh.visible) a.mesh.visible = false; a.shown = false; continue; }
        }
        if (want) act++;
        let v = 0;
        if (a.idle > 0) a.idle -= dt;
        else if (a.kind === 'queue' || a.kind === 'photo' || a.speed === 0) {
          v = 0; a.idle = 16 + rnd() * 18;
        } else {
          v = a.speed; a.s += a.dir * v * dt;
          if (a.s <= 0 || a.s >= a.L) {
            a.s = Math.max(0, Math.min(a.L, a.s)); a.dir *= -1; a.idle = (a.kind === 'plaza' ? 2 : 1) + rnd() * 3;
            if (a.leaving) { hide(a); continue; }
          }
        }
        const [x, z, dx, dz] = sample(a, a.s);
        if (check && Math.hypot(x - fx, z - fz) > REPLACE_R) { hide(a); continue; }
        if (check && !(a.kind === 'queue' ? queueOk(x, z) : walkOk(x, z))) { hide(a); continue; }
        const y = groundY(x, z, a.y); a.y = y;
        a.mesh.position.set(x, y, z);
        a.mesh.rotation.y = a.yawFix != null ? a.yawFix : Math.atan2(dx * a.dir, dz * a.dir);
        placed++; byKind[a.kind] = (byKind[a.kind] || 0) + 1;
        const d = Math.hypot(x - fx, z - fz), near = d < SHOW_R;
        a.mesh.visible = near; a.shown = near;
        if (!near) continue;
        vis++;
        animateAvatar(a.mesh, v, dt);
        crowd.add(a.mesh, a.parts, d > LOD_R);
      }
      Object.assign(stats, { active: act, placed, visible: vis, byKind });
      stats.cpuMs = stats.cpuMs * 0.95 + (now() - t0) * 0.05;
      crowd.end();
  }
  return {
    actors, stats, spots, group: holder,
    register() {},
    render(_crowd, dt, fx, fz) { tick(dt, fx, fz); },
    update(dt, fx, fz) { tick(dt, fx, fz); },
    dispose() {
      for (const a of actors) hide(a);
      parent?.remove?.(holder);
      for (const P of crowd.parts.values()) { P.im?.dispose?.(); if (P.lam) P.im?.material?.dispose?.(); }
    },
  };
}
