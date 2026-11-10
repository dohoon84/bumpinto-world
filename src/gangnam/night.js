// [gangnam-night] 강남 섬만의 야경. 코리더 공통 창 셰이더(corridor/nightLights.js)는 그대로 두고,
//   여기선 강남대로·테헤란로 가로등(미금·판교와 같은 기둥 지오메트리·nightFade) + 고층 창 쿼드 + 인도 온기 + (PC) 차선 빛줄기를 더한다.
//   ?gangnamnight=0 · ?gangnam=0 이면 만들지 않는다. 모바일은 등 절반·웅덩이 없음·창 1/3·빛줄기 없음.
import * as THREE from 'three';
import { buildStreetlightGeometries, LENS_DAY, LENS_NIGHT, POOL_GAIN, POOL_R, POOL_RZ, ARM } from '../world/streetlights.js';
import { lightPoolMaterial } from '../world/nightLights.js';
import { nightFade, nightTarget } from '../world/nightFade.js';
import { setNightDim, gameHour } from '../weather.js';
import { gangnamAmbientScale } from './nightTone.js';

export function gangnamNightEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search || '');
  return q.get('gangnam') !== '0' && q.get('gangnamnight') !== '0';
}

const up = new THREE.Vector3(0, 1, 0);

function compose(m4, q, p, s, x, y, z, yaw, sx, sy, sz) {
  q.setFromAxisAngle(up, yaw);
  p.set(x, y, z);
  s.set(sx, sy, sz);
  m4.compose(p, q, s);
}

export function createGangnamNight({ scene, terrain = null, url, mobile = false }) {
  nightTarget();
  const root = new THREE.Group();
  root.name = 'gangnamNight';
  scene.add(root);
  const stats = { loaded: false, mobile, lamps: 0, windows: 0, glow: 0, streaks: 0, draws: 0 };
  let dead = false;
  let box = null;
  let meshes = null;
  const ground = (x, z) => (terrain ? terrain.renderHeight(x, z) : 0);

  const ready = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
    if (!j || dead) return;
    box = j.boxes?.[0] || null;
    const lamps = j.lamps || [];
    const use = [];
    for (let i = 0; i < lamps.length; i += 5) {
      if (mobile && ((i / 5) % 2) === 1) continue;
      use.push(lamps[i], lamps[i + 1], lamps[i + 2], lamps[i + 3], lamps[i + 4]);
    }
    const n = use.length / 5;
    stats.lamps = n;
    const geo = buildStreetlightGeometries();
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const lensMat = new THREE.MeshBasicMaterial({ color: LENS_DAY.clone(), toneMapped: false });
    const body = new THREE.InstancedMesh(geo.body, bodyMat, Math.max(1, n));
    const lens = new THREE.InstancedMesh(geo.lens, lensMat, Math.max(1, n));
    body.name = 'gangnamLamp-body';
    lens.name = 'gangnamLamp-lens';
    body.castShadow = false;
    lens.castShadow = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const x = use[i * 5], z = use[i * 5 + 1], yaw = use[i * 5 + 2], y = use[i * 5 + 4];
      const h = y >= 0 ? y : ground(x, z);
      compose(m4, q, p, s, x, h, z, yaw, 1, 1, 1);
      body.setMatrixAt(i, m4);
      lens.setMatrixAt(i, m4);
    }
    body.count = n;
    lens.count = n;
    body.instanceMatrix.needsUpdate = true;
    lens.instanceMatrix.needsUpdate = true;
    body.computeBoundingSphere();
    lens.computeBoundingSphere();
    root.add(body, lens);
    let pool = null;
    if (!mobile && n) {
      const mat = lightPoolMaterial({ color: '#fff3df', intensity: POOL_GAIN * 0.42, radius: POOL_R * 0.42, radiusZ: POOL_RZ * 0.38, focusX: ARM * 0.7 });
      pool = new THREE.InstancedMesh(geo.pool, mat, n);
      pool.name = 'gangnamLamp-pool';
      pool.frustumCulled = true;
      pool.renderOrder = 2;
      for (let i = 0; i < n; i++) {
        const x = use[i * 5], z = use[i * 5 + 1], yaw = use[i * 5 + 2];
        const h = ground(x, z);
        compose(m4, q, p, s, x, h + 0.14, z, yaw, 1, 1, 1);
        pool.setMatrixAt(i, m4);
      }
      pool.instanceMatrix.needsUpdate = true;
      pool.computeBoundingSphere();
      root.add(pool);
    } else geo.pool.dispose();

    const winSrc = j.windows || [];
    const win = [];
    for (let i = 0; i < winSrc.length; i += 4) {
      if (mobile && ((i / 4) % 3) !== 0) continue;
      win.push(winSrc[i], winSrc[i + 1], winSrc[i + 2], winSrc[i + 3]);
    }
    const wn = win.length / 4;
    stats.windows = wn;
    const wgeo = new THREE.PlaneGeometry(mobile ? 1.3 : 1.7, mobile ? 1.8 : 2.3);
    const wmat = new THREE.MeshBasicMaterial({ color: mobile ? '#e8b56a' : '#ffd7a0', toneMapped: false, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const wins = new THREE.InstancedMesh(wgeo, wmat, Math.max(1, wn));
    wins.name = 'gangnamWindows';
    for (let i = 0; i < wn; i++) compose(m4, q, p, s, win[i * 4], win[i * 4 + 1], win[i * 4 + 2], win[i * 4 + 3], 1, 1, 1), wins.setMatrixAt(i, m4);
    wins.count = wn;
    wins.instanceMatrix.needsUpdate = true;
    wins.computeBoundingSphere();
    root.add(wins);

    const glowSrc = j.glow || [];
    const gl = [];
    for (let i = 0; i < glowSrc.length; i += 4) {
      if (mobile && ((i / 4) % 2) === 1) continue;
      gl.push(glowSrc[i], glowSrc[i + 1], glowSrc[i + 2], glowSrc[i + 3]);
    }
    const gn = gl.length / 4;
    stats.glow = gn;
    const ggeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const gmat = new THREE.MeshBasicMaterial({ color: '#fff1dc', toneMapped: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.InstancedMesh(ggeo, gmat, Math.max(1, gn));
    glow.name = 'gangnamGlow';
    glow.renderOrder = 1;
    for (let i = 0; i < gn; i++) {
      const len = gl[i * 4 + 3] || 10;
      compose(m4, q, p, s, gl[i * 4], ground(gl[i * 4], gl[i * 4 + 1]) + 0.05, gl[i * 4 + 1], gl[i * 4 + 2], Math.min(len, 6), 1, mobile ? 1.1 : 1.35);
      glow.setMatrixAt(i, m4);
    }
    glow.count = gn;
    glow.instanceMatrix.needsUpdate = true;
    glow.computeBoundingSphere();
    root.add(glow);

    let streaks = null;
    if (!mobile && j.streaks?.length) {
      const src = j.streaks;
      const sn = src.length / 4;
      stats.streaks = sn;
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 8;
      const c = canvas.getContext('2d');
      const grd = c.createLinearGradient(0, 0, 64, 0);
      grd.addColorStop(0, 'rgba(255,244,210,0)');
      grd.addColorStop(0.35, 'rgba(255,244,210,.95)');
      grd.addColorStop(1, 'rgba(180,210,255,0)');
      c.fillStyle = grd; c.fillRect(0, 0, 64, 8);
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      const smat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const sgeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      streaks = new THREE.InstancedMesh(sgeo, smat, sn);
      streaks.name = 'gangnamStreaks';
      streaks.renderOrder = 2;
      for (let i = 0; i < sn; i++) {
        const len = src[i * 4 + 3] || 16;
        compose(m4, q, p, s, src[i * 4], ground(src[i * 4], src[i * 4 + 1]) + 0.25, src[i * 4 + 1], src[i * 4 + 2], len, 1, 0.7);
        streaks.setMatrixAt(i, m4);
      }
      streaks.instanceMatrix.needsUpdate = true;
      streaks.computeBoundingSphere();
      root.add(streaks);
    }
    meshes = { body, lens, pool, wins, glow, streaks, lensMat, wmat, gmat };
    stats.loaded = true;
    apply(1);
  });

  function near(x, z) {
    if (!box) return true;
    return x >= box.x0 - 700 && x <= box.x1 + 700 && z >= box.z0 - 700 && z <= box.z1 + 700;
  }
  function apply(v) {
    if (!meshes) return;
    const on = near.here;
    meshes.lensMat.color.copy(LENS_DAY).lerp(LENS_NIGHT, v);
    if (meshes.pool) {
      meshes.pool.material.uniforms.uNight.value = on ? v : 0;
      meshes.pool.visible = on && v > 0.02;
    }
    meshes.wmat.opacity = on ? v * (mobile ? 0.55 : 0.9) : 0;
    meshes.wins.visible = on && v > 0.02;
    meshes.gmat.opacity = on ? v * (mobile ? 0.08 : 0.14) : 0;
    meshes.glow.visible = on && v > 0.02;
    if (meshes.streaks) {
      meshes.streaks.material.opacity = on ? v * 0.55 : 0;
      meshes.streaks.visible = on && v > 0.02;
      if (meshes.streaks.visible && meshes.streaks.material.map) {
        meshes.streaks.material.map.offset.x = (performance.now() / 900) % 1;
      }
    }
    const c = on ? stats.lamps : 0;
    if (meshes.body.count !== c) { meshes.body.count = c; meshes.lens.count = c; }
    if (meshes.pool) {
      const pc = on && v > 0.02 ? stats.lamps : 0;
      if (meshes.pool.count !== pc) meshes.pool.count = pc;
    }
    stats.draws = (on && stats.lamps ? 2 : 0) + (meshes.pool?.visible ? 1 : 0) + (meshes.wins.visible ? 1 : 0) + (meshes.glow.visible ? 1 : 0) + (meshes.streaks?.visible ? 1 : 0);
  }
  near.here = false;
  let acc = 0;
  return {
    root, stats, ready,
    update(dt, x, z) {
      if (!meshes) return;
      acc += dt;
      if (acc > 0.4) { acc = 0; near.here = near(x, z); }
      setNightDim(() => gangnamAmbientScale(gameHour(), near.here));
      apply(nightFade());
    },
    dispose() {
      dead = true;
      root.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose?.(); } });
      scene.remove(root);
      meshes = null;
    },
  };
}
