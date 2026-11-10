// [namsan] 타워 주변 서울 도심. OSM 건물 외곽선(약 2.8 km)을 압출하고,
//   밤에는 기존 코리더 창 불빛 셰이더(warm/cool 혼합)를 그대로 쓴다.
//   간선도로는 노면 + 가로등 글로우 + 차량 궤적, 그 밖은 지평선 스카이라인 링.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildingMeshes, roadGeometries, paint } from '../tileMesh.js';
import { ribbonGeo, fixNormalsUp } from '../../world.js';
import { NT, namsanBasinY, inNamsanPark } from './namsanCoords.js';

function groundY(x, z, heightAt) {
  const d = Math.hypot(x - NT.tx, z - NT.tz);
  const dem = heightAt ? heightAt(x, z) : null;
  const est = namsanBasinY(d);
  // 페더된 DEM 이 낮아도(산자락) 그대로 쓴다. 콘 폴백으로 건물을 띄우지 않는다.
  if (Number.isFinite(dem) && d < 1100) return dem;
  return est;
}

function centroid(pts) {
  let x = 0, z = 0, n = 0;
  for (const p of pts) { x += p[0]; z += p[1]; n++; }
  return n ? { x: x / n, z: z / n } : { x: NT.tx, z: NT.tz };
}

function skylineTex() {
  const W = 2048, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const d = c.getContext('2d');
  const g = d.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a1020'); g.addColorStop(0.45, '#141a28'); g.addColorStop(1, '#1a1e26');
  d.fillStyle = g; d.fillRect(0, 0, W, H);
  let s = 7919;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 220; i++) {
    const x = rnd() * W;
    const w = 6 + rnd() * 28;
    const h = 40 + rnd() * (80 + (i % 11 === 0 ? 90 : 0));
    d.fillStyle = `rgb(${18 + rnd() * 16},${20 + rnd() * 14},${26 + rnd() * 18})`;
    d.fillRect(x, H - h, w, h);
    const cols = Math.max(1, Math.floor(w / 5)), rows = Math.max(2, Math.floor(h / 7));
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      if (rnd() > 0.38) continue;
      const warm = rnd() > 0.28;
      d.fillStyle = warm
        ? `rgba(255,${190 + rnd() * 40},${120 + rnd() * 40},${0.45 + rnd() * 0.45})`
        : `rgba(${160 + rnd() * 40},${190 + rnd() * 40},255,${0.35 + rnd() * 0.4})`;
      d.fillRect(x + 1 + k * 5, H - h + 4 + r * 7, 2.4, 3.4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function streakTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 16);
  for (let i = 0; i < 10; i++) {
    const px = (i * 27 + 4) % 256;
    x.fillStyle = i % 3 === 0 ? 'rgba(255,70,50,0.95)' : 'rgba(255,236,190,0.95)';
    x.fillRect(px, 4, 18 + (i % 4) * 6, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createNamsanCity({ parent, data, heightAt, parks = [] }) {
  const g = new THREE.Group();
  g.name = 'namsan-city';
  parent.add(g);
  const empty = {
    group: g,
    setNight() {},
    update() {},
  };
  const buildings = data?.buildings || [];
  const roads = data?.roads || [];
  if (!buildings.length && !roads.length) return empty;

  const nightMats = [];
  const track = (mat, dayE = 0, nightE = 1) => { nightMats.push({ mat, dayE, nightE }); return mat; };

  // ----- ground disk so downtown is not floating in void -----
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(3900, 72),
    new THREE.MeshLambertMaterial({ color: '#3c403a' }),
  );
  disk.rotation.x = -Math.PI / 2;
  disk.position.set(NT.tx, namsanBasinY(2000) - 0.8, NT.tz);
  disk.receiveShadow = true;
  g.add(disk);

  // ----- extruded OSM buildings, batched by quadrant -----
  // 남산공원(OSM park/wood/forest)과 정상 부근 높은 지형 위의 시가지 압출은 빼 둔다.
  const buckets = [[], [], [], []];
  for (const b of buildings) {
    const o = b.o;
    if (!o || o.length < 3) continue;
    const c = centroid(o);
    if (inNamsanPark(c.x, c.z, parks, heightAt)) continue;
    if (o.some((pt) => inNamsanPark(pt[0], pt[1], parks, heightAt))) continue;
    const gy = groundY(c.x, c.z, heightAt);
    const ht = Math.max(4, Number(b.h) || 12);
    const mh0 = Number(b.mh) || 0;
    const item = {
      o,
      h: gy + ht,
      mh: gy + mh0,
      k: b.k || 'yes',
    };
    const qi = (c.x >= NT.tx ? 1 : 0) + (c.z >= NT.tz ? 2 : 0);
    buckets[qi].push(item);
  }
  for (let i = 0; i < buckets.length; i++) {
    const list = buckets[i];
    if (!list.length) continue;
    for (const m of buildingMeshes(list, 4797 + i * 97)) {
      m.name = 'namsan-city-b' + i;
      g.add(m);
    }
  }

  // ----- roads (follow sampled ground) -----
  const roadForMesh = [];
  const glowGeos = [];
  const streakGeos = [];
  const ARTERIES = new Set(['motorway', 'trunk', 'primary', 'secondary']);
  for (const r of roads) {
    if (!r.p || r.p.length < 2) continue;
    const pts = r.p.map(([x, z]) => {
      const y = groundY(x, z, heightAt) + 0.06;
      return [x, z, y];
    });
    roadForMesh.push({ p: pts, w: r.w || 10, k: r.k || 'secondary' });
    if (ARTERIES.has(r.k)) {
      glowGeos.push(paint(fixNormalsUp(ribbonGeo(pts, Math.max(2.2, (r.w || 10) * 0.18), 0.16, false)), '#ffd089'));
      streakGeos.push(ribbonGeo(pts, 1.15, 0.22, false));
    }
  }
  const roadGeos = roadGeometries(roadForMesh, { lines: true, caps: false });
  if (roadGeos.length) {
    const rg = mergeGeometries(roadGeos.filter(Boolean));
    if (rg) {
      const rm = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ vertexColors: true }));
      rm.receiveShadow = true;
      rm.name = 'namsan-city-roads';
      g.add(rm);
    }
  }
  const glowMat = track(new THREE.MeshBasicMaterial({
    color: '#ffd089', transparent: true, opacity: 0, depthWrite: false, fog: true,
  }), 0, 0);
  glowMat.userData.nightOp = 0.42;
  if (glowGeos.length) g.add(new THREE.Mesh(mergeGeometries(glowGeos), glowMat));

  const streakMap = streakTex();
  streakMap.repeat.set(8, 1);
  const streakMat = track(new THREE.MeshBasicMaterial({
    map: streakMap, transparent: true, opacity: 0, depthWrite: false, fog: true,
  }), 0, 0);
  streakMat.userData.nightOp = 0.85;
  if (streakGeos.length) g.add(new THREE.Mesh(mergeGeometries(streakGeos), streakMat));

  // ----- horizon impostor ring -----
  const skyTex = skylineTex();
  skyTex.repeat.set(6, 1);
  const ringMat = new THREE.MeshBasicMaterial({
    map: skyTex, side: THREE.BackSide, transparent: true, opacity: 0.92, fog: true, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(4300, 4300, 900, 72, 1, true), ringMat);
  ring.position.set(NT.tx, namsanBasinY(2500) + 420, NT.tz);
  ring.name = 'namsan-skyline-ring';
  g.add(ring);

  let night = 0;
  return {
    group: g,
    setNight(v) {
      night = v;
      for (const { mat, dayE, nightE } of nightMats) {
        if (mat.userData.nightOp != null) {
          mat.opacity = v * mat.userData.nightOp;
          mat.visible = v > 0.02;
        } else {
          mat.emissiveIntensity = dayE + (nightE - dayE) * v;
        }
      }
      disk.material.color.set(v > 0.5 ? '#16181c' : '#3c403a');
    },
    update(dt) {
      if (night > 0.02) streakMap.offset.x = (streakMap.offset.x + dt * 0.09) % 1;
    },
  };
}
