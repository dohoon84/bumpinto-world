// 도둑고양이. 탄천 양쪽 둔치 풀숲, 정자광장 가장자리, 아파트 단지에 흩어져 있고 사람이 오면 도망간다.
import * as THREE from 'three';
import { createCat, animateAvatar } from '../entities/avatar.js';

const COATS = [
  { id: 'white', label: '흰색 도둑고양이' },
  { id: 'black', label: '검은색 도둑고양이' },
  { id: 'calico', label: '삼색 도둑고양이' },
  { id: 'tuxedo', label: '턱시도 도둑고양이' },
  { id: 'mackerel', label: '고등어 도둑고양이' },
  { id: 'cow', label: '젖소 무늬 도둑고양이' },
];
const PER_COAT = 10;
const PLAZA_X = -74;
const PLAZA_Z = 25;
const FLEE_DIST = 6.8;
const SAFE_DIST = 12;
const VIEW_DIST = 150;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pathLen(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
}

function pointAt(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + L >= s || i === pts.length - 1) {
      const t = L ? Math.max(0, Math.min(1, (s - acc) / L)) : 0;
      const dx = (pts[i][0] - pts[i - 1][0]) / (L || 1);
      const dz = (pts[i][1] - pts[i - 1][1]) / (L || 1);
      return {
        x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
        z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
        dx,
        dz,
      };
    }
    acc += L;
  }
  return { x: pts[0][0], z: pts[0][1], dx: 0, dz: 1 };
}

function inPark(bounds, x, z) {
  if (!bounds) return false;
  return x > bounds.x0 - 1.2 && x < bounds.x1 + 1.2 && z > bounds.z0 - 1.2 && z < bounds.z1 + 1.2;
}

export function addStrayCats(scene, overlay, terrain, world, station, parkBounds, data) {
  const path = terrain.bankPath?.(station.x, station.z, 0);
  if (!path || path.length < 8) return { cats: [], update() {} };

  const rnd = mulberry32(0x7a3c91);
  const len = pathLen(path);
  const tuftGeo = new THREE.ConeGeometry(0.26, 0.5, 5);
  const tuftMat = new THREE.MeshLambertMaterial({ color: '#6ea85a' });
  const tuftCount = COATS.length * PER_COAT * 2;
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftCount);
  tufts.castShadow = false;
  tufts.count = 0;
  scene.add(tufts);
  const tuftM = new THREE.Matrix4();
  const tuftQ = new THREE.Quaternion();
  const tuftS = new THREE.Vector3();

  const farTrail = [];

  function segDist(x, z, pts) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0];
      const az = pts[i - 1][1];
      const bx = pts[i][0];
      const bz = pts[i][1];
      const dx = bx - ax;
      const dz = bz - az;
      const L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < best) best = d;
    }
    return best;
  }

  function onTrail(x, z) {
    if (segDist(x, z, path) < 2.7) return true;
    if (farTrail.length > 4 && segDist(x, z, farTrail) < 2.7) return true;
    return false;
  }

  function standBank(x, z) {
    if (world.inWater?.(x, z)) return null;
    if (world.onRoad?.(x, z)) return null;
    if (world.isBlocked?.(x, z, 0.25)) return null;
    if (inPark(parkBounds, x, z)) return null;
    if (terrain.stairAt?.(x, z)) return null;
    if (onTrail(x, z)) return null;
    if (terrain.grade?.(x, z) > 0.34) return null;
    const y = terrain.getGroundHeight(x, z, -6);
    if (y > -4.55 || y < -6.42) return null;
    return y;
  }

  function standStreet(x, z) {
    if (world.inWater?.(x, z)) return null;
    if (world.onRoad?.(x, z)) return null;
    if (world.isBlocked?.(x, z, 0.45)) return null;
    if (inPark(parkBounds, x, z)) return null;
    if (terrain.stairAt?.(x, z)) return null;
    const y = terrain.getGroundHeight(x, z, 0);
    if (y < -1.2 || y > 3) return null;
    return y;
  }

  function standFor(cat, x, z) {
    return cat.street ? standStreet(x, z) : standBank(x, z);
  }

  function placeTuft(x, z, y) {
    if (tufts.count >= tuftCount) return;
    const k = 0.75 + rnd() * 0.55;
    tuftQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
    tuftS.set(k, 0.7 + rnd() * 0.6, k);
    tuftM.compose(new THREE.Vector3(x, y, z), tuftQ, tuftS);
    tufts.setMatrixAt(tufts.count, tuftM);
    tufts.count += 1;
  }

  function tooClose(x, z, gap) {
    const g2 = gap * gap;
    for (const h of homes) if ((h.x - x) ** 2 + (h.z - z) ** 2 < g2) return true;
    return false;
  }

  function crossWater(x, z, nx, nz) {
    for (const dir of [1, -1]) {
      let wet = false;
      for (let dist = 2; dist <= 110; dist += 2) {
        const px = x + nx * dir * dist;
        const pz = z + nz * dir * dist;
        const gy = terrain.getGroundHeight(px, pz, -6);
        const wetHere = !!world.inWater?.(px, pz) || gy < -6.55;
        if (wetHere) {
          wet = true;
          continue;
        }
        if (!wet) continue;
        if (gy > -6.42 && gy < -4.55) return { x: px, z: pz, dir };
        break;
      }
    }
    return null;
  }

  const homes = [];
  const zones = { near: 0, far: 0, plaza: 0, apt: 0 };

  function keep(spot, zone) {
    homes.push(spot);
    zones[zone] += 1;
    if (!spot.street) {
      placeTuft(spot.x + (rnd() - 0.5) * 1.2, spot.z + (rnd() - 0.5) * 1.2, spot.y);
    }
    return true;
  }

  function grassBeside(x, z, nx, nz, dir, gap = 42) {
    for (let n = 0; n < 6; n++) {
      const dist = 3.6 + rnd() * 2.8;
      const sway = (rnd() - 0.5) * 4;
      const px = x + nx * dir * dist + nz * sway;
      const pz = z + nz * dir * dist - nx * sway;
      const y = standBank(px, pz);
      if (y != null && !tooClose(px, pz, gap)) return { x: px, z: pz, y, street: false };
    }
    return null;
  }

  for (let s = 12; s < len - 12; s += 22) {
    const a = pointAt(path, s);
    const hit = crossWater(a.x, a.z, -a.dz, a.dx);
    if (hit) farTrail.push([hit.x, hit.z]);
  }

  const quota = { near: 10, far: 10, plaza: 8, apt: 32 };
  for (let i = 0; i < quota.near; i++) {
    const a = pointAt(path, ((i + 0.5) / quota.near) * len);
    const spot = grassBeside(a.x, a.z, -a.dz, a.dx, 1) || grassBeside(a.x, a.z, -a.dz, a.dx, -1);
    if (spot) keep(spot, 'near');
  }
  for (let i = 0; i < quota.far; i++) {
    const a = pointAt(path, ((i + 0.35) / quota.far) * len);
    const hit = crossWater(a.x, a.z, -a.dz, a.dx);
    if (!hit) continue;
    const spot = grassBeside(hit.x, hit.z, -a.dz, a.dx, hit.dir);
    if (spot) keep(spot, 'far');
  }
  for (let i = 0; i < quota.plaza * 4 && zones.plaza < quota.plaza; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = 16 + rnd() * 16;
    const x = PLAZA_X + Math.cos(ang) * rad;
    const z = PLAZA_Z + Math.sin(ang) * rad;
    const y = standStreet(x, z);
    if (y == null || tooClose(x, z, 13)) continue;
    keep({ x, z, y, street: true }, 'plaza');
  }
  const apts = (data?.labels || []).filter((l) => l.kind === 'apt' && Math.hypot(l.x - station.x, l.z - station.z) < 1400);
  for (let i = apts.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = apts[i];
    apts[i] = apts[j];
    apts[j] = t;
  }
  for (let pass = 0; pass < 4 && zones.apt < quota.apt; pass++) {
    for (const label of apts) {
      if (zones.apt >= quota.apt) break;
      let spot = null;
      for (let n = 0; n < 10 && !spot; n++) {
        const ang = rnd() * Math.PI * 2;
        const rad = 5 + rnd() * 14;
        const x = label.x + Math.cos(ang) * rad;
        const z = label.z + Math.sin(ang) * rad;
        const y = standStreet(x, z);
        if (y == null || tooClose(x, z, 16)) continue;
        spot = { x, z, y, street: true };
      }
      if (spot) keep(spot, 'apt');
    }
  }
  let guard = 0;
  while (homes.length < COATS.length * PER_COAT && guard < 40) {
    guard += 1;
    const a = pointAt(path, rnd() * len);
    const hit = rnd() < 0.5 ? crossWater(a.x, a.z, -a.dz, a.dx) : null;
    const spot = hit
      ? grassBeside(hit.x, hit.z, -a.dz, a.dx, hit.dir, 30)
      : grassBeside(a.x, a.z, -a.dz, a.dx, rnd() < 0.5 ? 1 : -1, 30);
    if (spot) keep(spot, hit ? 'far' : 'near');
  }
  for (let i = 0; homes.length < COATS.length * PER_COAT && i < 60; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = 38 + rnd() * 28;
    const x = PLAZA_X + Math.cos(ang) * rad;
    const z = PLAZA_Z + Math.sin(ang) * rad;
    const y = standStreet(x, z);
    if (y == null || tooClose(x, z, 14)) continue;
    keep({ x, z, y, street: true }, 'plaza');
  }
  tufts.instanceMatrix.needsUpdate = true;

  const cats = [];
  homes.forEach((home, i) => {
    const coat = COATS[i % COATS.length];
    const mesh = createCat({ coat: coat.id });
    mesh.scale.setScalar(0.9 + rnd() * 0.18);
    mesh.position.set(home.x, home.y, home.z);
    mesh.rotation.y = rnd() * Math.PI * 2;
    scene.add(mesh);
    const tag = overlay.add({
      cls: 'tag npc',
      text: coat.label,
      getPos: () => mesh.position.clone().setY(mesh.position.y + 0.85),
      maxDist: 14,
    });
    cats.push({
      coat: coat.id,
      label: coat.label,
      mesh,
      tag,
      x: home.x,
      z: home.z,
      y: home.y,
      homeX: home.x,
      homeZ: home.z,
      street: !!home.street,
      tx: home.x,
      tz: home.z,
      state: rnd() < 0.45 ? 'sit' : 'wander',
      timer: 1 + rnd() * 4,
      speed: 0.55 + rnd() * 0.5,
      flee: 0,
      skip: rnd() * 0.4,
    });
  });

  function nearestThreat(x, z, pts) {
    let bestD = FLEE_DIST;
    let bx = 0;
    let bz = 0;
    let found = false;
    for (let i = 0; i < pts.length; i += 2) {
      const dx = x - pts[i];
      const dz = z - pts[i + 1];
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        bestD = d;
        bx = pts[i];
        bz = pts[i + 1];
        found = true;
      }
    }
    return found ? { x: bx, z: bz, d: bestD } : null;
  }

  function stepTo(cat, dx, dz, dist) {
    const L = Math.hypot(dx, dz) || 1;
    const nx = dx / L;
    const nz = dz / L;
    const angles = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8];
    for (const ang of angles) {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const x = cat.x + (nx * c - nz * s) * dist;
      const z = cat.z + (nx * s + nz * c) * dist;
      const y = standFor(cat, x, z);
      if (y != null) return { x, z, y };
    }
    return null;
  }

  const threats = [];
  function pushXZ(p) {
    if (!p) return;
    const x = p.x;
    const z = p.z;
    if (typeof x !== 'number' || typeof z !== 'number') return;
    threats.push(x, z);
  }

  let clock = 0;
  function update(dt, sources = {}) {
    clock += dt;
    threats.length = 0;
    pushXZ(sources.player);
    if (sources.remotes) for (const p of sources.remotes) pushXZ(p);
    if (sources.npcs) {
      for (const n of sources.npcs) {
        if (n.active === false || n.def?.cat) continue;
        pushXZ(n.pos);
      }
    }
    if (sources.folk) for (const a of sources.folk) pushXZ(a.mesh?.position);

    const px = sources.player?.x ?? 0;
    const pz = sources.player?.z ?? 0;

    for (const cat of cats) {
      const pdx = px - cat.x;
      const pdz = pz - cat.z;
      const nearPlayer = pdx * pdx + pdz * pdz < VIEW_DIST * VIEW_DIST;
      cat.mesh.visible = nearPlayer;
      if (cat.tag) cat.tag.hidden = !nearPlayer;
      let stepDt = dt;
      if (!nearPlayer) {
        cat.skip += dt;
        if (cat.skip < 0.45) continue;
        stepDt = cat.skip;
        cat.skip = 0;
      } else {
        cat.skip = 0;
      }

      const threat = nearestThreat(cat.x, cat.z, threats);
      if (threat) {
        cat.state = 'flee';
        cat.awayX = cat.x - threat.x;
        cat.awayZ = cat.z - threat.z;
        cat.flee = Math.max(cat.flee, 1.1);
      }

      let move = 0;
      if (cat.state === 'flee') {
        cat.flee -= stepDt;
        const next = stepTo(cat, cat.awayX || 1, cat.awayZ || 0, 4.4 * stepDt);
        if (next) {
          cat.x = next.x;
          cat.z = next.z;
          cat.y = next.y;
          move = 4.4;
          cat.mesh.rotation.y = Math.atan2(cat.awayX || 1, cat.awayZ || 0);
        }
        const clear = !threat || threat.d > SAFE_DIST;
        if ((clear && cat.flee <= 0) || cat.flee < -0.2) {
          cat.homeX = cat.x;
          cat.homeZ = cat.z;
          cat.state = 'sit';
          cat.timer = 1.6 + rnd() * 2.4;
          cat.flee = 0;
          move = 0;
        }
      } else if (cat.state === 'sit') {
        cat.timer -= stepDt;
        if (cat.timer <= 0) {
          cat.state = 'wander';
          const ang = rnd() * Math.PI * 2;
          const rad = 1.4 + rnd() * 6.5;
          const tx = cat.homeX + Math.sin(ang) * rad;
          const tz = cat.homeZ + Math.cos(ang) * rad;
          const y = standFor(cat, tx, tz);
          if (y != null) {
            cat.tx = tx;
            cat.tz = tz;
          } else {
            cat.tx = cat.homeX;
            cat.tz = cat.homeZ;
          }
          cat.timer = 3 + rnd() * 4;
          cat.speed = 0.5 + rnd() * 0.55;
        }
      } else {
        cat.timer -= stepDt;
        const dx = cat.tx - cat.x;
        const dz = cat.tz - cat.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.35 || cat.timer <= 0) {
          cat.state = 'sit';
          cat.timer = 2 + rnd() * 5;
        } else {
          const next = stepTo(cat, dx, dz, Math.min(dist, cat.speed * stepDt));
          if (!next) {
            cat.state = 'sit';
            cat.timer = 1.2 + rnd() * 2;
          } else {
            cat.x = next.x;
            cat.z = next.z;
            cat.y = next.y;
            move = cat.speed;
            cat.mesh.rotation.y = Math.atan2(dx, dz);
          }
        }
      }

      cat.mesh.position.set(cat.x, cat.y, cat.z);
      if (nearPlayer) {
        animateAvatar(cat.mesh, move, stepDt);
        const u = cat.mesh.userData;
        if (cat.state === 'sit') {
          u.rig.rotation.x = 0.42;
          u.rig.position.y -= 0.05;
        }
        if (u.tail) u.tail.rotation.y = Math.sin(clock * (cat.state === 'flee' ? 16 : 2.4) + iPhase(cat)) * (cat.state === 'flee' ? 0.55 : 0.18);
      }
    }
  }

  return { cats, zones, update };
}

function iPhase(cat) {
  return cat.homeX * 0.17 + cat.homeZ * 0.13;
}
