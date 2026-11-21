// [gentle-monster] ?gm=1 프리뷰 — 성수 지역이 아직 없어서, 사옥을 이 자체 장면에서 걸어 다니며 본다.
//   PC: WASD/방향키 이동 · Shift 달리기 · 드래그 시점 · 휠 거리 · N 낮/밤.  모바일(가로): 왼쪽 가상 조이스틱 · 오른쪽 드래그 시점.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createMaterials, setNight } from './materials.js';
import { createInteriorMaterials } from './imats.js';
import { buildExterior } from './exterior.js';
import { buildSite } from './site.js';
import { buildShell, pointInPoly, LEVEL_NAME } from './shell.js';
import { createWorldPhysics, createWalker } from './walker.js';
import { buildInterior } from './interior.js';
import { loadSculpts } from './sculptLoader.js';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { skyTex } from './textures.js';
import { PLAN as P } from './plan.js';
import { createMyeongdongNpc } from '../corridor/landmarks/myeongdongNpc.js';
import { hqCrowdInput, staffLook, guestLook, withCum } from './hqNpc.js';

export async function startPreview() {
  const q = new URLSearchParams(location.search);
  let night = q.get('night') === '1';
  document.title = 'Haus Nowhere Seoul — Bumpinto World';
  document.body.replaceChildren();
  document.body.style.cssText = 'margin:0;background:#000;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-user-select:none;user-select:none';
  const canvas = document.createElement('canvas'); canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none';
  document.body.appendChild(canvas);
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || q.get('mobile') === '1';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mobile ? 62 : 55, 1, 0.15, 900);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const mats = createMaterials({ maxAniso: aniso });
  const imats = createInteriorMaterials({ maxAniso: aniso });

  // ---- 하늘·환경 ----
  const skyDay = skyTex(false), skyNight = skyTex(true);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), new THREE.MeshBasicMaterial({ map: skyDay, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.name = 'gm-sky'; scene.add(sky);
  scene.fog = new THREE.Fog(0xc9d6e2, 140, 430);
  const pm = new THREE.PMREMGenerator(renderer);
  const envOf = (tx, sunCol) => { const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 12), new THREE.MeshBasicMaterial({ map: tx, side: THREE.BackSide }))); const s = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), new THREE.MeshBasicMaterial({ color: sunCol })); s.position.set(-20, 30, 25); sc.add(s); const t = pm.fromScene(sc, 0.03).texture; sc.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); return t; };
  const envDay = envOf(skyDay, 0xfff1d0), envNight = envOf(skyNight, 0x8899bb);
  const envIn = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  const uplights = new THREE.Group(); uplights.name = 'gm-uplights';
  const upl = (pos, tgt, col, I, ang = 0.5) => { const sp = new THREE.SpotLight(col, I, 90, ang, 0.85, 1.6); sp.position.set(...pos); sp.target.position.set(...tgt); sp.userData.I = I; uplights.add(sp, sp.target); };
  // 중층 지붕 모서리 → 윙 아랫면 (따뜻한 색, 세기 다르게)
  upl([16, 46, 16], [10, 52, 9], 0xffe5bf, 40, 0.9); upl([-16, 46, 16], [-10, 52, 9], 0xffedcf, 55, 0.9);
  upl([16, 46, -16], [10, 52, -9], 0xffedcf, 35, 0.9); upl([-16, 46, -16], [-10, 52, -9], 0xffe5bf, 45, 0.9);
  // 정원 바닥 → 하층 곡면 띠를 스치듯 (차가운 흰색)
  upl([-11, 0.3, 23], [-9, 16, 13], 0xe8eeff, 45, 0.45); upl([11, 0.3, 23], [9, 16, 13], 0xe8eeff, 45, 0.45);
  // 꼭대기 유리 박스에서 위로 은은하게
  upl([0, 61, 0], [0, 90, 0], 0xfff4e0, 300, 0.9);
  scene.add(uplights);
  const hemi = new THREE.HemisphereLight(0xcfe0f5, 0x8a8478, 0.4); scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff0d8, 2.0); dir.position.set(-60, 90, 70); scene.add(dir);

  // ---- 건물 ----
  const ext = buildExterior(mats), site = buildSite(mats, { night });
  const shell = buildShell(mats, ext, imats);
  const world = new THREE.Group(); world.name = 'gm-world'; scene.add(world);
  for (const m of [...site.meshes, ...ext.meshes]) world.add(m);
  const interior = new THREE.Group(); interior.name = 'gm-interior'; for (const m of shell.meshes) interior.add(m); world.add(interior);
  // 실내 오브제는 늦게: 조각(SDF)은 워커에서 만들고, 플레이어가 가까워지면 실내를 채운다
  const sculptsP = loadSculpts({ mobile });
  let inner = { meshes: [], colliders: [], circles: [], lightSlots: {}, update() {} }, innerP = null;
  const ensureInterior = () => innerP || (innerP = sculptsP.then((sc) => {
    inner = buildInterior(mats, imats, shell, ext, sc);
    for (const m of inner.meshes) { interior.add(m); m.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(m); const y = b.isEmpty() ? 0 : b.min.y + 0.3; m.userData.fl = y > FY[5] - 0.7 ? 5 : y > FY[4] - 0.7 ? 4 : y > FY[3] - 0.7 ? 3 : y > FY[2] - 0.7 ? 2 : 1; m.userData.span = b.isEmpty() ? 0 : b.max.y - b.min.y; }
    cullKey = '';
    physics.addColliders(inner.colliders, inner.circles);
    lightFloor(state.floor);
    return inner;
  }));
  const extGroup = [...ext.meshes];
  // 층 조명: 포인트 라이트 5개를 현재 층으로 옮겨 쓴다(셰이더 재컴파일 없게 개수 고정)
  const pls = []; for (let i = 0; i < 5; i++) { const l = new THREE.SpotLight(0xffffff, 0, 18, 0.62, 0.65, 1.4); l.name = 'gm-spot' + i; scene.add(l, l.target); pls.push(l); }
  const CEIL = { 1: P.t0 - 0.1, 2: P.floorY[3] - P.SLAB - 0.1, 3: P.floorY[4] - P.SLAB - 0.1, 5: 22.5 };
  const lightFloor = (fl) => { const slots = inner.lightSlots[fl]; pls.forEach((l, i) => { const s = slots?.[i]; if (!s) { l.intensity = 0; return; } l.position.set(s[0] + 0.6, CEIL[fl], s[2] + 0.8); l.target.position.set(s[0], P.floorY[fl] + 0.6, s[2]); l.target.updateMatrixWorld(); l.color.set(s[3]); l.intensity = s[4] * 2.4; }); };

  // 층별 표시: 카메라가 건물 밖이면 1층(유리 너머 보이는)만, 안이면 지금 층 ±1 만 그린다 (폰 삼각형 절약)
  let cullKey = '';
  const cullFloors = () => {
    const c = camera.position;
    const inB = c.y < P.baseTop && (pointInPoly(shell.levelsInfo[2].poly, c.x, c.z) || pointInPoly(shell.levelsInfo[1].poly, c.x, c.z));
    const cf = !inB ? 0 : c.y > FY[5] - 0.6 ? 5 : c.y > FY[4] - 0.6 ? 4 : c.y > FY[3] - 0.6 ? 3 : c.y > FY[2] - 0.6 ? 2 : 1;
    const key = 'k' + cf; if (key === cullKey) return; cullKey = key;
    for (const m of inner.meshes) { const f = m.userData.fl; if (!f || m.userData.span > 12) continue; m.visible = cf === 0 ? f === 1 : Math.abs(f - cf) <= 1; }
  };

  // ---- 물리 ----
  const segs = ext.colliders; // 1층 유리선
  const circles = [...site.circles, ...ext.columns.map(([x, z, r]) => ({ x, z, r, y0: 0, y1: P.t0 }))];
  const physics = createWorldPhysics({ regions: shell.regions, colliders: [...shell.colliders, ...site.colliders], circles, segments: segs });
  const avatar = createAvatar({ color: '#e8e4da', pants: '#2b2f36', hair: 'short', hairColor: '#1a1a1a' });
  avatar.name = 'gm-player'; world.add(avatar);
  // [seongsu] 사람들: 직원·쇼핑객·관람객·누데이크 손님 + 앞 보도 행인 (게임 성수 리전과 같은 자리 표)
  const crowdIn = hqCrowdInput((x, z) => [x, z]);
  const walkPaths = [...crowdIn.paths, { pts: [[-60, 22.6], [100, 22.6]], w: 2.4, weight: 3, y: 0.04 }, { pts: [[-60, 39.8], [100, 39.8]], w: 2.4, weight: 2, y: 0.04 }].map(withCum);
  const npc = q.get('npc') === '0' ? null : createMyeongdongNpc({ parent: world, paths: walkPaths, vendors: crowdIn.vendors, promoters: crowdIn.promoters, heightAt: () => 0.04, mobile, seed: 433, name: 'hnCrowd', looks: { promo: staffLook, vendor: guestLook }, pools: { peds: mobile ? 16 : 26, vendors: crowdIn.vendors.length, promoters: crowdIn.promoters.length }, getHour: () => (night ? 19 : 15), cull: (y) => (y < FY[2] - 0.6 ? true : !cullKey || cullKey === 'k0' ? false : Math.abs(+cullKey.slice(1) - (y > FY[5] - 0.6 ? 5 : y > FY[4] - 0.6 ? 4 : y > FY[3] - 0.6 ? 3 : 2)) <= 1) });
  const FY = P.floorY;
  const ceilingAt = (x, z, y) => {
    if (!pointInPoly(shell.levelsInfo[2].poly, x, z)) return null;
    for (const h of [...shell.holes[2], ...shell.holes[3]]) if (x > h[0] - 0.3 && x < h[1] + 0.3 && z > h[2] - 0.3 && z < h[3] + 0.3) return null;
    if (y < FY[2] - 0.4) return P.t0 - 0.05;
    if (y < FY[3] - 0.4) return FY[3] - P.SLAB;
    if (y < FY[4] - 0.4) return FY[4] - P.SLAB;
    if (y > FY[5] - 0.4) return 22.6;
    return null;
  };
  const start = q.get('at') === 'lobby' ? { x: 0, z: 14, yaw: 0 } : { x: 6, z: 29, yaw: 0.35 };
  const walker = createWalker({ physics, avatar, camera, start, ceilingAt });
  walker.st.dist = walker.st.dMax = 7.5; walker.st.pitch = 0.2;

  // ---- 낮/밤 ----
  const state = { inside: false, floor: 0 };
  function applyLook() {
    const inside = state.inside;
    renderer.toneMappingExposure = inside ? 0.85 : (night ? 0.95 : 0.82);
    scene.environment = inside ? envIn : (night ? envNight : envDay);
    scene.environmentIntensity = inside ? ({ 1: 0.5, 2: 0.42, 3: 0.48, 5: 0.6 }[state.floor] ?? 0.5) : (night ? 0.7 : 0.6);
    sky.material.map = night ? skyNight : skyDay; sky.material.needsUpdate = true;
    scene.fog.color.set(night ? 0x1c2433 : 0xc9d6e2);
    hemi.color.set(night ? 0x4b5c88 : 0xcfe0f5); hemi.groundColor.set(night ? 0x1b1b22 : 0x8a8478); hemi.intensity = inside ? (state.floor === 5 ? 0.2 : 0.08) : (night ? 1.8 : 0.4); for (const o of uplights.children) if (o.isSpotLight) o.intensity = night && !inside ? o.userData.I : 0;
    dir.color.set(night ? 0x8fa2d8 : 0xfff0d8); dir.intensity = inside ? 0 : (night ? 0.55 : 2.0);
    setNight(mats, night);
  }
  function setNightMode(v) { night = v; applyLook(); }

  // ---- HUD (카드 없이 글자만) ----
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:14px;top:10px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.85),0 0 10px rgba(0,0,0,.5);pointer-events:none;line-height:1.25';
  hud.innerHTML = '<div style="font-size:15px;font-weight:800;letter-spacing:.02em">HAUS NOWHERE SEOUL</div><div id="gm-sub" style="font-size:12px;opacity:.85;margin-top:2px">성수동 뚝섬로 433 · 젠틀몬스터 사옥</div><div id="gm-floor" style="font-size:13px;font-weight:700;margin-top:6px;min-height:16px"></div>';
  document.body.appendChild(hud);
  const hint = document.createElement('div');
  hint.style.cssText = 'position:fixed;left:14px;bottom:10px;color:#fff;font-size:12px;opacity:.8;text-shadow:0 1px 3px rgba(0,0,0,.85);pointer-events:none';
  hint.textContent = mobile ? '' : 'WASD 이동 · Shift 달리기 · 드래그 시점 · 휠 거리 · N 낮/밤';
  document.body.appendChild(hint);
  const tgl = document.createElement('div');
  tgl.textContent = night ? '☀' : '☾'; tgl.style.cssText = `position:fixed;right:14px;top:10px;width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.35);color:#fff;font-size:20px;line-height:38px;text-align:center;cursor:pointer;border:1px solid rgba(255,255,255,.35);pointer-events:auto`;
  const doToggle = () => { setNightMode(!night); tgl.textContent = night ? '☀' : '☾'; };
  tgl.addEventListener('click', doToggle); tgl.addEventListener('touchstart', (e) => { e.preventDefault(); doToggle(); }, { passive: false });
  document.body.appendChild(tgl);
  addEventListener('keydown', (e) => { if (e.key === 'n' || e.key === 'N') doToggle(); });

  // ---- 입력: 드래그 시점 / 모바일 조이스틱 ----
  let look = null;
  canvas.addEventListener('pointerdown', (e) => { if (mobile && e.clientX < innerWidth * 0.42) return; look = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!look || look.id !== e.pointerId) return; walker.st.camYaw -= (e.clientX - look.x) * 0.0055; walker.st.pitch = Math.max(-0.35, Math.min(1.1, walker.st.pitch + (e.clientY - look.y) * 0.004)); look.x = e.clientX; look.y = e.clientY; });
  const endLook = (e) => { if (look && look.id === e.pointerId) look = null; };
  canvas.addEventListener('pointerup', endLook); canvas.addEventListener('pointercancel', endLook);
  canvas.addEventListener('wheel', (e) => { walker.st.dist = Math.max(1.6, Math.min(16, walker.st.dist * (1 + e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
  if (mobile) {
    const base = document.createElement('div'); base.style.cssText = 'position:fixed;left:26px;bottom:22px;width:110px;height:110px;border-radius:50%;border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.06);touch-action:none';
    const knob = document.createElement('div'); knob.style.cssText = 'position:absolute;left:35px;top:35px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.55)'; base.appendChild(knob); document.body.appendChild(base);
    let sid = null;
    const setStick = (e) => { const r = base.getBoundingClientRect(), cx = r.left + 55, cy = r.top + 55; let dx = (e.clientX - cx) / 55, dy = (e.clientY - cy) / 55; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } walker.stick.x = dx * 1.2; walker.stick.y = dy * 1.2; knob.style.left = 35 + dx * 38 + 'px'; knob.style.top = 35 + dy * 38 + 'px'; };
    base.addEventListener('pointerdown', (e) => { sid = e.pointerId; base.setPointerCapture(sid); setStick(e); });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === sid) setStick(e); });
    const rel = (e) => { if (e.pointerId !== sid) return; sid = null; walker.stick.x = walker.stick.y = 0; knob.style.left = knob.style.top = '35px'; };
    base.addEventListener('pointerup', rel); base.addEventListener('pointercancel', rel);
  }

  const resize = () => { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();

  // ---- 루프 ----
  const clock = new THREE.Clock(); let t = 0;
  const floorEl = hud.querySelector('#gm-floor');
  const free = { on: false, v: null };
  function frame() {
    const dt = Math.min(0.05, clock.getDelta()); t += dt;
    site.update(t); inner.update(t);
    if (!innerP && Math.hypot(walker.p.x, walker.p.z) < 70) ensureInterior();
    walker.update(dt); animateAvatar(avatar, walker.st.speed, dt);
    npc?.update(dt, walker.p.x, walker.p.z);
    const p = walker.p;
    const inFoot = pointInPoly(shell.levelsInfo[2].poly, p.x, p.z) || pointInPoly(shell.levelsInfo[1].poly, p.x, p.z);
    if (inFoot !== state.inside) { state.inside = inFoot; applyLook(); }
    let fl = 0; if (inFoot) { fl = p.y > FY[5] - 0.6 ? 5 : p.y > FY[4] - 0.6 ? 4 : p.y > FY[3] - 0.6 ? 3 : p.y > FY[2] - 0.6 ? 2 : 1; }
    if (fl !== state.floor) { state.floor = fl; floorEl.textContent = fl ? LEVEL_NAME[fl] : ''; lightFloor(fl); applyLook(); }
    if (free.on) { const f = free.v; camera.position.set(f[0], f[1], f[2]); camera.lookAt(f[3], f[4], f[5]); if (f[6] && camera.fov !== f[6]) { camera.fov = f[6]; camera.updateProjectionMatrix(); } }
    cullFloors();
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
  }
  applyLook();
  renderer.setAnimationLoop(frame);
  window.__gm = {
    THREE, scene, camera, renderer, mats, imats, ext, site, shell, interior, physics, walker, state, npc, ready: false, ensureInterior, get inner() { return inner; },
    mem: () => { let geo = 0; const seen = new Set(); scene.traverse((o) => { const g = o.geometry; if (!g || seen.has(g)) return; seen.add(g); for (const k in g.attributes) geo += g.attributes[k].array.byteLength; if (g.index) geo += g.index.array.byteLength; if (o.isInstancedMesh) geo += o.instanceMatrix.array.byteLength; }); return { geoMB: +(geo / 1048576).toFixed(1), jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null }; },
    draws: () => renderer.info.render.calls, tris: () => renderer.info.render.triangles,
    hideExterior: (h) => { for (const m of extGroup) m.visible = !h; },
    setNight: setNightMode, avatar,
    teleport: (o) => { walker.teleport(o); },
    freeCam: (arr) => { free.on = !!arr; free.v = arr; },
    hud: (on) => { hud.style.display = on ? '' : 'none'; hint.style.display = on ? '' : 'none'; tgl.style.display = on ? '' : 'none'; },
  };
  ensureInterior().then(() => { window.__gm.ready = true; });
}
