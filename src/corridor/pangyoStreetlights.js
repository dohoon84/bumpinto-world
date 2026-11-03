// [pangyo-streetlights] 판교역 일대 T자 가로등 — 정자·코리더 가로등(src/world/streetlights.js)과 같은 모델·재질, 켜짐은 광장 데크 LED 와 같은 값
//   데이터: public/corridor/pangyo/streetlights.json (scripts/corridor/build-streetlights.mjs --pangyo). OSM highway=street_lamp 가 범위 안에 없어 도로 규칙 배치 + 데크 위 보행등
//   그리기: InstancedMesh 3개(기둥+팔+등갓 · 램프 유리 · 바닥 불빛 웅덩이) — 낮 draw +2, 밤 +3, 위에서 보기(overview) 밤 +1(웅덩이만)
//   보이기: 500 m 코리더 타일 단위 — 카메라 초점에서 VIS_R 안 + 그 타일 상세가 빌드됐을 때만(코리더 가로등과 같은 규칙). 보이는 게 없으면 GPU 버퍼 해제
//   켜짐: world/nightFade.js nightFade() — landmarks/pangyoDeckLights.js 와 같은 공용 값(evening.js 저녁 스위치를 4초에 걸쳐 따라감) → 데크 LED 와 같은 순간에 켜지고 꺼짐
//   이 범위 안의 코리더 가로등은 world/streetlights.js 가 skipBoxes 로 건너뛴다(겹침 방지). ?pangyo=0 · ?pangyolamps=0 · ?streetlights=0 이면 안 만듦(기존 그대로)
import * as THREE from 'three';
import { buildStreetlightGeometries, SCALE, POOL_SCALE, LENS_DAY, LENS_NIGHT, POOL_R, POOL_RZ, POOL_GAIN, ARM, OV_SCALE, OV_GAIN, OV_LIFT } from '../world/streetlights.js';
import { lightPoolMaterial } from '../world/nightLights.js';
import { nightFade, onNightTarget } from '../world/nightFade.js';

export const PANGYO_LAMPS_FILE = 'pangyo/streetlights.json';
export function pangyoLampsEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search);
  return q.get('pangyo') !== '0' && q.get('pangyolamps') !== '0' && q.get('streetlights') !== '0';
}
const TS = 500, VIS_R = 420, REFRESH = 0.25;
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

/** lamps = [x, z, yaw, kind, y, …] (y = -1 → 지형 높이) */
export function createPangyoStreetlights({ scene, terrain = null, corridor = null, url }) {
  const root = new THREE.Group(); root.name = 'pangyoLamps';
  scene.add(root);
  const stats = { loaded: false, lamps: 0, deck: 0, visible: 0, overview: 0, trisPerLamp: 0, night: 0, boxes: [] };
  let groups = null, meshes = null, mats = null, cap = 0, lastKey = '', acc = REFRESH, disposed = false, lastNight = -1;
  const groundAt = (x, z) => (terrain ? terrain.renderHeight(x, z) : 0);

  const ready = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
    if (!j || disposed) return;
    const by = new Map();
    for (let i = 0; i < j.lamps.length; i += 5) {
      const x = j.lamps[i], z = j.lamps[i + 1], key = `${Math.floor(x / TS)}_${Math.floor(z / TS)}`;
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(x, z, j.lamps[i + 2], j.lamps[i + 3], j.lamps[i + 4]);
      if (j.lamps[i + 3] === 4) stats.deck++;
    }
    groups = [...by.entries()].sort().map(([key, a]) => { const [tx, tz] = key.split('_').map(Number); return { key, tx, tz, data: new Float32Array(a), body: null, pool: null }; });
    stats.lamps = j.lamps.length / 5; stats.boxes = j.boxes || []; stats.loaded = true;
  });

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s3 = new THREE.Vector3();
  const yAt = (x, z, y) => (y >= 0 ? y : groundAt(x, z));
  function bake(g) { // 데크 위는 평평(데크 윗면), 땅은 지형 높이. 웅덩이는 평평하게(판교 일대는 거의 평지)
    const n = g.data.length / 5; g.body = new Float32Array(n * 16); g.pool = new Float32Array(n * 16);
    for (let i = 0; i < n; i++) {
      const x = g.data[i * 5], z = g.data[i * 5 + 1], yaw = g.data[i * 5 + 2], kind = g.data[i * 5 + 3], h = yAt(x, z, g.data[i * 5 + 4]);
      const s = SCALE[kind] ?? 1, ps = POOL_SCALE[kind] ?? 1;
      q.setFromAxisAngle(up, yaw);
      m4.compose(p.set(x, h, z), q, s3.set(s, s, s)).toArray(g.body, i * 16);
      m4.compose(p.set(x, h + 0.14, z), q, s3.set(ps, ps, ps)).toArray(g.pool, i * 16);
    }
  }
  function ensureMeshes(need) {
    if (meshes && need <= cap) return;
    freeMeshes();
    cap = Math.max(64, 2 ** Math.ceil(Math.log2(need)));
    const geo = buildStreetlightGeometries();
    stats.trisPerLamp = tris(geo.body) + tris(geo.lens) + tris(geo.pool);
    mats = {
      body: new THREE.MeshLambertMaterial({ vertexColors: true }),
      lens: new THREE.MeshBasicMaterial({ color: LENS_DAY.clone() }),
      pool: lightPoolMaterial({ color: '#ffd59a', intensity: POOL_GAIN, radius: POOL_R, radiusZ: POOL_RZ, focusX: ARM }),
    };
    const mk = (name, g, m) => { const im = new THREE.InstancedMesh(g, m, cap); im.name = 'pangyoLamp-' + name; im.count = 0; im.castShadow = false; im.receiveShadow = name === 'body'; im.frustumCulled = true; root.add(im); return im; };
    meshes = { body: mk('body', geo.body, mats.body), lens: mk('lens', geo.lens, mats.lens), pool: mk('pool', geo.pool, mats.pool) };
    meshes.pool.renderOrder = 2;
    lastNight = -1;
  }
  function freeMeshes() {
    if (!meshes) return;
    for (const m of Object.values(meshes)) { root.remove(m); m.geometry.dispose(); m.dispose(); }
    for (const m of Object.values(mats)) m.dispose();
    meshes = null; mats = null; cap = 0;
  }
  function applyNight(v) {
    stats.night = v;
    if (!meshes || v === lastNight) return;
    lastNight = v;
    mats.lens.color.copy(LENS_DAY).lerp(LENS_NIGHT, v);
    mats.pool.uniforms.uNight.value = v;
    meshes.pool.visible = v > 0.001 && meshes.pool.count > 0;
  }
  let target = 0;
  const offTarget = onNightTarget((t) => { target = t; lastKey = ''; acc = REFRESH; }); // 저녁 스위치가 바뀌면 바로 다시 계산

  function setCounts(nb, np, gain) {
    for (const m of Object.values(meshes)) {
      const c = m === meshes.pool ? np : nb;
      m.count = c; m.visible = c > 0 && (m !== meshes.pool || nightFade() > 0.001 || target > 0);
      if (!c) continue;
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, c * 16); m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
    mats.pool.uniforms.uIntensity.value = gain;
  }
  function refresh(fx, fz, mode) {
    const ov = mode === 'overview', vis = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i], x0 = g.tx * TS, z0 = g.tz * TS;
      const d = Math.hypot(Math.max(x0 - fx, 0, fx - x0 - TS), Math.max(z0 - fz, 0, fz - z0 - TS));
      if (ov) { if ((target > 0 || nightFade() > 0.001) && d < 3200) vis.push(i); continue; } // 위에서 보기: 밤에만 웅덩이
      if (d > VIS_R) continue;
      if (corridor?.tiles && corridor.tiles.get(g.key)?.dState !== 3) continue; // 상세 타일이 빌드된 칸만
      vis.push(i);
    }
    const key = (ov ? 'o' : 'f') + vis.join(',');
    if (key === lastKey) return;
    lastKey = key;
    let n = 0;
    for (const i of vis) { if (!groups[i].body) bake(groups[i]); n += groups[i].data.length / 5; }
    for (let i = 0; i < groups.length; i++) if (!vis.includes(i)) { groups[i].body = null; groups[i].pool = null; }
    stats.visible = ov ? 0 : n; stats.overview = ov ? n : 0;
    if (!n) { freeMeshes(); return; }
    ensureMeshes(n);
    let o = 0;
    const pa = meshes.pool.instanceMatrix.array;
    for (const i of vis) {
      const g = groups[i];
      if (ov) { // 평평 · 크게 · 살짝 띄움(코리더 가로등 overview 와 같은 값)
        for (let k = 0; k < g.data.length / 5; k++) {
          const x = g.data[k * 5], z = g.data[k * 5 + 1], s = (POOL_SCALE[g.data[k * 5 + 3]] ?? 1) * OV_SCALE;
          q.setFromAxisAngle(up, g.data[k * 5 + 2]);
          m4.compose(p.set(x, yAt(x, z, g.data[k * 5 + 4]) + OV_LIFT, z), q, s3.set(s, s, s)).toArray(pa, (o + k) * 16);
        }
      } else {
        meshes.body.instanceMatrix.array.set(g.body, o * 16);
        pa.set(g.pool, o * 16);
      }
      o += g.data.length / 5;
    }
    if (!ov) meshes.lens.instanceMatrix.array.set(meshes.body.instanceMatrix.array.subarray(0, n * 16));
    setCounts(ov ? 0 : n, n, ov ? OV_GAIN : POOL_GAIN);
    lastNight = -1;
  }

  return {
    root, stats, ready,
    update(dt, fx, fz, mode = 'follow') {
      if (!groups) return;
      acc += dt;
      if (acc >= REFRESH) { acc = 0; refresh(fx, fz, mode); }
      applyNight(nightFade());
      if (meshes && nightFade() <= 0.001 && target === 0 && meshes.pool.visible) meshes.pool.visible = false;
    },
    dispose() { disposed = true; offTarget(); freeMeshes(); scene.remove(root); groups = null; },
  };
}
