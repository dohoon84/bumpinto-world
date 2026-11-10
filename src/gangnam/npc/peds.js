// [gangnam-npc] 보행은 미금 createMigeumPeds 배치 루프를 그대로 쓴다.
//   몸은 createAvatar. 강남 쪽은 가방·안경·모자·후드를 빼 부품 종류를 줄인다 (crowd 드로우).
//   관광객 일부만 글 말풍선(ko/en/ja). 횡단은 보행 신호가 초록일 때만.
import { createMigeumPeds } from '../../corridor/migeumNpc.js';
import { Bubble } from '../../overlay.js';
import { MAX_PEDS, MAX_PEDS_MOBILE, GREETINGS, pedDensityAt } from './density.js';
import { gangnamNpcForce } from './flags.js';
import { onDriveRoad, segDist, sidewalkTangent } from './rules.js';

const TOPS = ['#f4f4f2', '#2f3a4a', '#c9ced6', '#e8e0d2', '#5d7fb5', '#3b3f45', '#ffffff', '#d35454'];
const PANTS = ['#2b2f36', '#3c4350', '#5a6170', '#34495e'];
const SKINS = ['#f2d0b0', '#e8c4a8', '#f6d7c3', '#d7a888'];

export function slimLook(r) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const f = r() < 0.5;
  return { color: pick(TOPS), pants: pick(PANTS), gender: f ? 'f' : 'm', hair: 'short', skin: pick(SKINS), top: 'long', beard: 'none' };
}

function zebraOf(crossings, x, z) {
  for (const c of crossings || []) {
    const dx = x - c.x, dz = z - c.z;
    const along = dx * c.dir[0] + dz * c.dir[1];
    const nx = -c.dir[1], nz = c.dir[0];
    const across = dx * nx + dz * nz;
    if (Math.abs(along) < 3.4 && Math.abs(across) < c.w / 2 + 0.6) return c;
  }
  return null;
}

export function crossingPath(crossings, at, rnd) {
  let best = null, bd = 36;
  for (const c of crossings || []) {
    const d = Math.hypot(c.x - at.x, c.z - at.z);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best || rnd() > 0.72) return null;
  const nx = -best.dir[1], nz = best.dir[0];
  const half = best.w / 2 + 1.1;
  const a = [best.x - nx * half, best.z - nz * half];
  const b = [best.x + nx * half, best.z + nz * half];
  const pts = [a, [best.x - nx * half * 0.35, best.z - nz * half * 0.35], [best.x + nx * half * 0.35, best.z + nz * half * 0.35], b];
  return { pts, cross: true };
}

const KEEP_R = 52;
const SPAWN_R = 48;

function daeroFrames(drive) {
  const segs = [];
  for (const w of drive?.ways || []) {
    if (w.name !== '강남대로' || (w.w || 0) < 20) continue;
    for (let i = 1; i < w.n.length; i++) {
      const a = drive.nodes[w.n[i - 1]], b = drive.nodes[w.n[i]];
      if (!a || !b) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 0.4) continue;
      segs.push({ a, b, w: w.w, nx: -dz / L, nz: dx / L });
    }
  }
  return segs;
}

function footOf(s, x, z) {
  const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / L2));
  const px = s.a[0] + dx * t, pz = s.a[1] + dz * t;
  return { px, pz, d: Math.hypot(px - x, pz - z) };
}

/** 강남대로 인도. 동쪽 바깥 +1, 서쪽 바깥 -1. 겹친 넓은 차선은 한 폭으로 본다. */
export function daeroSide(drive, x, z) {
  const segs = daeroFrames(drive);
  let best = null;
  for (const s of segs) {
    const f = footOf(s, x, z);
    if (!best || f.d < best.d) best = { ...s, ...f };
  }
  if (!best || best.d > 70) return 0;
  let hi = best.w / 2, lo = -best.w / 2;
  for (const s of segs) {
    const f = footOf(s, best.px, best.pz);
    if (f.d > 48) continue;
    const signed = (f.px - best.px) * best.nx + (f.pz - best.pz) * best.nz;
    hi = Math.max(hi, signed + s.w / 2);
    lo = Math.min(lo, signed - s.w / 2);
  }
  let nx = best.nx, nz = best.nz;
  if (nx < 0) { nx = -nx; nz = -nz; const t = hi; hi = -lo; lo = -t; }
  const signed = (x - best.px) * nx + (z - best.pz) * nz;
  if (signed >= hi - 1.5 && signed <= hi + 8) return 1;
  if (signed <= lo + 1.5 && signed >= lo - 8) return -1;
  return 0;
}

/** 시점 거리로 모은 인도 점. 강남대로 양쪽이 범위 안이면 적은 쪽이 30% 밑으로 내려가지 않게, 보는 방향 쪽으로 채운다. */
export function alternateDaeroPick(drive, aim) {
  return (list, fx, fz, near) => {
    const close = [];
    for (const c of list) if (near(c)) close.push(c);
    if (!close.length) return null;
    const pos = [], neg = [];
    for (const c of close) {
      const s = daeroSide(drive, c.x, c.z);
      if (s > 0) pos.push(c);
      else if (s < 0) neg.push(c);
    }
    const load = (arr) => arr.reduce((n, c) => n + (c.load || 0), 0);
    let pool = close, along = false;
    if (pos.length && neg.length) {
      const lp = load(pos), ln = load(neg), tot = lp + ln;
      if (tot >= 2 && lp / tot < 0.3) { pool = pos; along = true; }
      else if (tot >= 2 && ln / tot < 0.3) { pool = neg; along = true; }
    }
    const yaw = aim?.yaw || 0;
    const vx = -Math.sin(yaw), vz = -Math.cos(yaw);
    let best = null, bl = Infinity, bd = Infinity, ba = -Infinity;
    for (const c of pool) {
      const d = Math.hypot(c.x - fx, c.z - fz);
      const l = c.load || 0;
      const a = (c.x - fx) * vx + (c.z - fz) * vz;
      if (along) {
        if (l < bl || (l === bl && a > ba)) { best = c; bl = l; ba = a; }
      } else if (l < bl || (l === bl && d < bd)) { best = c; bl = l; bd = d; }
    }
    return best;
  };
}

export function strollOnSidewalk(drive, at, rnd, crossings = []) {
  const tan = sidewalkTangent(drive, at.x, at.z);
  if (!tan) return null;
  const blocked = (x, z) => onDriveRoad(drive, x, z, 0.2) && !zebraOf(crossings, x, z);
  const len = 2.2 + rnd() * 1.6;
  const dirs = rnd() < 0.5 ? [1, -1] : [-1, 1];
  for (const dist of [len, 1.6]) for (const s of dirs) {
    const end = [at.x + tan.ux * s * dist, at.z + tan.uz * s * dist];
    const mid = [(at.x + end[0]) / 2, (at.z + end[1]) / 2];
    if (!blocked(at.x, at.z) && !blocked(mid[0], mid[1]) && !blocked(end[0], end[1])) {
      return { pts: [[at.x, at.z], end], cross: false };
    }
  }
  return { pts: [[at.x, at.z], [at.x + 0.05, at.z]], cross: false };
}

export function createGangnamPeds({
  npc, loader, terrain = null, isFree = () => true, freeSpot = (x, z) => ({ x, z }), tileReady = () => true,
  getHour, overlay = null, mobile = false, crossings = [], pedLight = () => 'red', seed = 7701,
} = {}) {
  const drive = npc?.drive;
  const aim = { yaw: 0 };
  const peds = createMigeumPeds({
    mg: { stations: [{ exits: npc.exits || [] }], meta: { box: npc.meta.box } },
    loader, terrain, isFree, freeSpot, tileReady, getHour, seed,
    count: mobile ? MAX_PEDS_MOBILE : MAX_PEDS,
    force: gangnamNpcForce(),
    densityAt: (h) => pedDensityAt(h, { mobile }),
    lookFn: slimLook,
    placeR: SPAWN_R + 8,
    placeBurst: mobile ? 8 : 28,
    preferNear: true,
    pickWalk: alternateDaeroPick(drive, aim),
    spotOk: (s, fx, fz) => {
      const d = Math.hypot(s.x - fx, s.z - fz);
      return d >= 4 && d <= SPAWN_R && !onDriveRoad(drive, s.x, s.z, 0.15);
    },
    cull: (x, z, fx, fz) => Math.hypot(x - fx, z - fz) > KEEP_R,
    pathFor: ({ at, rnd }) => {
      const cross = crossingPath(crossings, at, rnd);
      if (cross && rnd() < 0.22) return cross;
      return strollOnSidewalk(drive, at, rnd, crossings);
    },
    hold(a, x, z) {
      const c = zebraOf(crossings, x, z);
      if (!c || pedLight(c) === 'green') return false;
      const p = a.mesh.position;
      const here = zebraOf(crossings, p.x, p.z);
      if (!here) return true;
      const nx = -here.dir[1], nz = here.dir[0];
      const across = ((p.x - here.x) * nx + (p.z - here.z) * nz) / (here.w / 2 + 1.1);
      return Math.abs(across) > 0.72;
    },
  });
  for (const a of peds.actors) a.tourist = a.i % 7 === 1;
  peds.setYaw = (y) => { aim.yaw = y; };
  const bubbles = new Map();
  let sayAcc = 0;
  const say = (a, text, ms = 4200) => {
    if (!overlay || !a?.mesh) { a._line = text; return; }
    let b = bubbles.get(a);
    if (!b) {
      if (bubbles.size >= 4) return;
      b = new Bubble(overlay, 'npc', () => a.mesh.position.clone().setY(a.mesh.position.y + 2.15));
      bubbles.set(a, b);
    }
    b.say(text, ms);
    a._line = text;
  };
  const inner = peds.render.bind(peds);
  peds.render = (crowd, dt, fx, fz) => {
    inner(crowd, dt, fx, fz);
    for (const b of bubbles.values()) b.tick();
    sayAcc += dt;
    if (sayAcc < 1.2 || peds.stats.asleep) return;
    sayAcc = 0;
    for (const a of peds.actors) {
      if (!a.tourist || !a.shown || !a.path) continue;
      const d = Math.hypot(a.mesh.position.x - fx, a.mesh.position.z - fz);
      if (d > 16 || d < 1.2) continue;
      const b = bubbles.get(a);
      if (b?.showing) continue;
      if ((a._cool || 0) > 0) { a._cool -= 1.2; continue; }
      const g = GREETINGS[a.i % GREETINGS.length];
      say(a, g.text, 4800);
      a._cool = 9;
      break;
    }
  };
  peds.shoutNearest = (x, z) => {
    let best = null, bd = 28;
    for (const a of peds.actors) {
      if (!a.tourist || !a.path) continue;
      const d = Math.hypot(a.mesh.position.x - x, a.mesh.position.z - z);
      if (d < bd) { bd = d; best = a; }
    }
    if (!best) return null;
    const g = GREETINGS[best.i % GREETINGS.length];
    say(best, g.text, 8000);
    return { x: best.mesh.position.x, z: best.mesh.position.z, text: g.text, lang: g.lang };
  };
  peds.onZebra = (x, z) => !!zebraOf(crossings, x, z);
  peds.greetingOf = (a) => GREETINGS[a.i % GREETINGS.length];
  return peds;
}

export function pedOnRoad(ways, nodes, x, z, pad = 0.3) {
  for (const w of ways) for (let i = 1; i < w.n.length; i++) {
    const a = nodes[w.n[i - 1]], b = nodes[w.n[i]];
    if (segDist(x, z, a, b) < w.w / 2 + pad) return true;
  }
  return false;
}
