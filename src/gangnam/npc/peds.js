// [gangnam-npc] 보행은 미금 createMigeumPeds 배치 루프를 그대로 쓴다.
//   몸은 createAvatar. 강남 쪽은 가방·안경·모자·후드를 빼 부품 종류를 줄인다 (crowd 드로우).
//   관광객 일부만 글 말풍선(ko/en/ja). 횡단은 보행 신호가 초록일 때만.
import { createMigeumPeds } from '../../corridor/migeumNpc.js';
import { Bubble } from '../../overlay.js';
import { MAX_PEDS, MAX_PEDS_MOBILE, GREETINGS, pedDensityAt } from './density.js';
import { gangnamNpcForce } from './flags.js';
import { segDist } from './rules.js';

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

export function createGangnamPeds({
  npc, loader, terrain = null, isFree = () => true, freeSpot = (x, z) => ({ x, z }), tileReady = () => true,
  getHour, overlay = null, mobile = false, crossings = [], pedLight = () => 'red', seed = 7701,
} = {}) {
  const peds = createMigeumPeds({
    mg: { stations: [{ exits: npc.exits || [] }], meta: { box: npc.meta.box } },
    loader, terrain, isFree, freeSpot, tileReady, getHour, seed,
    count: mobile ? MAX_PEDS_MOBILE : MAX_PEDS,
    force: gangnamNpcForce(),
    densityAt: (h) => pedDensityAt(h, { mobile }),
    lookFn: slimLook,
    pathFor: ({ at, rnd }) => crossingPath(crossings, at, rnd),
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
