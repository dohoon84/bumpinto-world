import * as THREE from 'three';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { sanitizeLook } from '../look.js';
import { createArena } from './arena.js';
import { ghostOf, setGhostOpacity } from './models/kit.js';
import { createClassModel } from './models/index.js';
import { CLASS_IDS, getClass, normalizeClass } from './classes.js';
import { createBoss } from './boss.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { createRaidAudio } from './audio.js';
import { createVfx } from './vfx.js';
import { CITIZEN_LOOK, MAGE_LOOK, PRIEST_LOOK } from './look.js';
import {
  PATH_YAW, spawnPoint, safePoint, bossPoint, clampArena, pushOutOfBoss, fromFrame, SAFE_ALONG,
} from './layout.js';

const params = new URLSearchParams(location.search);
const shot = params.get('raidshot');

function hideWorldChrome() {
  document.body.classList.remove('in-gate', 'bw-early-start', 'in-lobby');
  const early = document.getElementById('bw-early-start');
  if (early) early.hidden = true;
  for (const id of ['world-gate', 'lobby', 'hud', 'buttons', 'chat', 'handset', 'phone', 'top-right-bar', 'emote-bar', 'joystick', 'overlay', 'ride-btn', 'chat-log-panel', 'presence-panel', 'board-modal', 'stop-panel']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
}

function dampAngle(cur, target, dt) {
  const d = Math.atan2(Math.sin(target - cur), Math.cos(target - cur));
  return cur + d * Math.min(1, dt * 12);
}

hideWorldChrome();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.15, 400);

let composer = null;
let bloomOn = true;
try {
  const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
    import('three/examples/jsm/postprocessing/EffectComposer.js'),
    import('three/examples/jsm/postprocessing/RenderPass.js'),
    import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
    import('three/examples/jsm/postprocessing/OutputPass.js'),
  ]);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.28, 0.72);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
} catch (err) {
  console.warn('[raid] bloom off', err);
  bloomOn = false;
  composer = null;
}

const arena = createArena(scene);
const vfx = createVfx(scene);
const audio = createRaidAudio();
const look = sanitizeLook(CITIZEN_LOOK);

const actor = new THREE.Group();
const spawn = spawnPoint();
actor.position.set(spawn.x, 0, spawn.z);
actor.rotation.y = PATH_YAW;
scene.add(actor);

const citizen = createAvatar(look);
actor.add(citizen);
const packs = {};
for (const id of CLASS_IDS) {
  const glbUrl = params.get(`${id}Glb`) || (id === 'warrior' ? (params.get('warriorGlb') || '') : '');
  const yaw = Number(params.get(`${id}Yaw`) || (id === 'warrior' ? params.get('warriorYaw') : 0) || 0);
  packs[id] = await createClassModel(id, { look, glbUrl, yaw });
}
const asked = normalizeClass(params.get('class'));
const autoStart = !!(asked || shot);
let classId = asked || 'warrior';
let form = null;
let ghost = null;
function mountForm(id) {
  if (form?.group?.parent) form.group.parent.remove(form.group);
  classId = id;
  form = packs[id];
  form.group.visible = false;
  actor.add(form.group);
  if (ghost) {
    scene.remove(ghost);
    ghost.traverse((o) => { if (o.isMesh) o.material?.dispose?.(); });
  }
  ghost = ghostOf(form.group, '#8b97a8');
  ghost.visible = false;
  scene.add(ghost);
}
mountForm(classId);

const boss = createBoss(scene);
const home = boss.home;

function ally(lookRaw, along, across) {
  const p = fromFrame(along, across);
  const av = createAvatar(sanitizeLook(lookRaw));
  av.position.set(p.x, 0, p.z);
  av.rotation.y = PATH_YAW;
  scene.add(av);
  return av;
}
const mage = ally(MAGE_LOOK, SAFE_ALONG, -2.4);
const priest = ally(PRIEST_LOOK, SAFE_ALONG, 2.4);

const hud = createHud();
hud.bind();

const tmp = new THREE.Vector3();
function asVec(p) {
  if (!p) return tmp.copy(actor.position).setY(2.15).clone();
  if (p.isVector3) return p;
  return new THREE.Vector3(p.x, p.y ?? 2, p.z);
}

let allyMageHp = 1;
let allyPriestHp = 1;
const combat = createCombat({
  audio,
  vfx,
  onFloat(pos, text, kind) { hud.float(asVec(pos), text, kind); },
  onBossHurt(amount) { boss.hurt(amount); },
  onBind(sec) { boss.slow(sec); },
  onHealParty() {
    allyMageHp = 1;
    allyPriestHp = 1;
    hud.float(mage.position.clone().setY(2.1), '+', 'heal');
    hud.float(priest.position.clone().setY(2.1), '+', 'heal');
  },
});
combat.setClass(classId);
hud.setClass(classId);

let phase = autoStart ? 'intro' : 'pick';
let introT = 0;
let burstDone = false;
let introStart = performance.now();
let fightT = 0;
let timeLeft = 15 * 60;
let kills = '0 / 1';
let simPaused = false;
let won = false;
let mageCd = 3.5;
let priestCd = 8;
let moveSpeed = 0;
let camYaw = PATH_YAW + (shot === 'transform' ? Math.PI - 0.8 : shot === 'fight' ? 0.42 : 0.5);
let camPitch = shot === 'transform' ? 0.18 : shot === 'fight' ? 0.38 : 0.32;
let camDist = shot === 'transform' ? 5.4 : shot === 'fight' ? 15 : 9;
const keys = new Set();
let shift = false;
let dragging = false;
let lastX = 0;
let lastY = 0;
let fps = 60;
let fpsAcc = 0;
let fpsFrames = 0;
let sceneDrawCalls = 0;
let windHot = false;

const bolt = new THREE.Mesh(
  new THREE.SphereGeometry(0.18, 8, 6),
  new THREE.MeshBasicMaterial({ color: '#9fd0ff' }),
);
bolt.visible = false;
scene.add(bolt);
let boltT = 0;
const rim = new THREE.PointLight('#d5e4ff', 0, 9, 2);
rim.position.set(0.9, 2.2, 1.4);
actor.add(rim);

function renderFrame() {
  if (bloomOn && composer) composer.render();
  else renderer.render(scene, camera);
}

function measureScene() {
  renderer.info.reset();
  renderer.render(scene, camera);
  sceneDrawCalls = renderer.info.render.calls;
  const triangles = renderer.info.render.triangles;
  renderFrame();
  return { calls: sceneDrawCalls, triangles };
}

function faceBoss() {
  const b = home;
  actor.rotation.y = Math.atan2(b.x - actor.position.x, b.z - actor.position.z);
}

function useSkill(id) {
  if (phase !== 'fight') return;
  const sk = combat.skill(id);
  if (!sk || sk.locked) return;
  if (sk.kind !== 'heal' && sk.kind !== 'healParty' && sk.kind !== 'stealth') faceBoss();
  const ok = combat.trySkill(id, true);
  if (ok && sk.dash) {
    const b = home;
    const dx = b.x - actor.position.x;
    const dz = b.z - actor.position.z;
    const len = Math.hypot(dx, dz) || 1;
    combat.state.dodgeDir.x = dx / len;
    combat.state.dodgeDir.z = dz / len;
  }
}

function beginRaid(id) {
  if (phase === 'fight' || phase === 'intro') return;
  const fresh = phase === 'peace';
  mountForm(id);
  combat.setClass(id);
  hud.setClass(id);
  hud.hidePick();
  hud.clearPeace();
  citizen.visible = true;
  if (fresh) {
    boss.reset();
    const s = spawnPoint();
    actor.position.set(s.x, 0, s.z);
    actor.rotation.set(0, PATH_YAW, 0);
    arena.setMood('rift');
    arena.setRain(true);
    kills = '0 / 1';
    timeLeft = 15 * 60;
    won = false;
    hud.hideVictory();
    allyMageHp = 1;
    allyPriestHp = 1;
  }
  introStart = performance.now();
  introT = 0;
  burstDone = false;
  simPaused = false;
  phase = 'intro';
}

hud.onSkill = useSkill;
hud.onPeace = () => enterPeace();
hud.onWorld = () => {
  const url = new URL(location.href);
  url.searchParams.delete('raid');
  url.searchParams.delete('raidshot');
  url.searchParams.delete('warriorGlb');
  url.searchParams.set('at', 'tancheon-hap');
  url.searchParams.set('enter', '1');
  location.assign(url.toString());
};
hud.onPick = (id) => beginRaid(id);
hud.onRepick = () => { if (phase === 'peace') hud.showPick(); };
if (!autoStart) hud.showPick();
hud.onMute = () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  hud.setMuted(audio.muted);
};

function enterPeace() {
  if (phase === 'peace') return;
  phase = 'peace';
  form.group.visible = false;
  citizen.visible = true;
  ghost.visible = false;
  boss.group.visible = false;
  bolt.visible = false;
  arena.setMood('peace');
  arena.setRain(false);
  arena.setSafeHot(false);
  audio.playBgm('peace');
  hud.setPeace();
  actor.rotation.x = 0;
}

function restScale() {
  return form.group.userData.baseScale || 1;
}

function grownScale(t) {
  const mul = form.group.userData.heightMul || 1;
  const base = restScale();
  const start = base / mul;
  const k = t < 0.7 ? 0 : Math.min(1, (t - 0.7) / 0.7);
  const ease = k * k * (3 - 2 * k);
  return start + (base - start) * ease;
}

function finishIntro() {
  citizen.visible = false;
  form.group.visible = true;
  form.group.scale.setScalar(restScale());
  ghost.visible = false;
  phase = 'fight';
  if (shot === 'form') return;
  audio.playBgm('boss');
  hud.banner(`${getClass(classId).name}의 이력이 인쇄됩니다`);
  audio.playSfx('transform');
}

function poseGhost(t) {
  const back = 0.85;
  const side = 1.65;
  const fx = Math.sin(PATH_YAW);
  const fz = Math.cos(PATH_YAW);
  const rx = Math.cos(PATH_YAW);
  const rz = -Math.sin(PATH_YAW);
  const behind = new THREE.Vector3(
    actor.position.x - fx * back + rx * side,
    0,
    actor.position.z - fz * back + rz * side,
  );
  ghost.visible = t > 0.2;
  ghost.scale.setScalar(grownScale(t));
  if (t < 0.9) {
    ghost.position.copy(behind);
    setGhostOpacity(ghost, Math.max(0, Math.min(0.78, (t - 0.2) / 0.4)));
  } else {
    const k = Math.min(1, (t - 0.9) / 0.35);
    ghost.position.copy(behind).lerp(actor.position, k);
    setGhostOpacity(ghost, 0.78 * (1 - k * 0.2));
    hud.flash(k * 0.55);
  }
}

function updateIntro() {
  introT = (performance.now() - introStart) / 1000;
  poseGhost(introT);
  if (!burstDone && introT > 0.32) {
    burstDone = true;
    vfx.carapaceBurst(actor.position, getClass(classId).seam);
    hud.flash(0.55);
  }
  if (introT >= 1.25 && introT < 1.55) hud.flash(1 - (introT - 1.25) / 0.3);
  if (introT >= 1.4) finishIntro();
  if (shot === 'transform') simPaused = true;
}

function onRevive() {
  const s = safePoint();
  actor.position.set(s.x, 0, s.z);
  actor.rotation.x = 0;
  hud.banner('노란 선에서 일어섰습니다');
}

function win() {
  if (won) return;
  won = true;
  phase = 'victory';
  kills = '1 / 1';
  combat.state.xp = 1240;
  combat.state.level = 2;
  audio.playSting('levelup');
  hud.banner('LEVEL UP');
  hud.showVictory();
}

const clock = new THREE.Clock();

function frame() {
  const raw = clock.getDelta();
  const dt = Math.min(raw || 0.016, 0.05);
  fpsAcc += raw || 0.016;
  fpsFrames += 1;
  if (fpsAcc >= 0.5) {
    fps = fpsFrames / fpsAcc;
    fpsFrames = 0;
    fpsAcc = 0;
  }
  if (!simPaused) step(dt);
  rim.intensity = form.group.visible || ghost.visible ? 8 : 1.2;
  const focus = actor.position;
  arena.update(dt, focus);
  vfx.update(dt);
  audio.tick();
  const st = combat.state;
  hud.update(dt, camera, {
    x: focus.x,
    z: focus.z,
    bossHp: boss.state.hp,
    bossMax: boss.state.hpMax,
    bossDead: boss.state.dead,
    castName: boss.state.castName,
    cast: boss.state.cast,
    castMax: boss.state.castMax,
    hp: st.hp,
    hpMax: st.hpMax,
    res: st.res,
    level: st.level,
    down: st.down,
    cds: st.cds,
    kills,
    timeLeft,
    mageHp: allyMageHp,
    priestHp: allyPriestHp,
  });
  const lookYaw = camYaw;
  const pitch = camPitch;
  const dist = camDist;
  const lx = Math.sin(lookYaw);
  const lz = Math.cos(lookYaw);
  const cp = Math.cos(pitch);
  camera.position.set(focus.x - lx * dist * cp, focus.y + 2.15 + dist * Math.sin(pitch) * 0.55, focus.z - lz * dist * cp);
  const aim = shot === 'transform' || shot === 'form' ? 0.1 : shot === 'fight' ? 7 : 3.6;
  const lookY = shot === 'form' ? 1.25 : shot === 'transform' ? 1.15 : shot === 'fight' ? 2.8 : 1.55;
  camera.lookAt(focus.x + lx * aim, focus.y + lookY, focus.z + lz * aim);
  renderFrame();
  requestAnimationFrame(frame);
}

function step(dt) {
  if (phase === 'intro') updateIntro(dt);
  const fighting = phase === 'fight';
  if (fighting) {
    fightT += dt;
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 5 * 60;
      hud.banner('게이트가 조금 더 열려 있습니다');
    }
  }

  const st = combat.state;
  let mx = 0;
  let mz = 0;
  if (fighting && st.down <= 0) {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (f || s) {
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      const rx = Math.cos(camYaw);
      const rz = -Math.sin(camYaw);
      mx = fx * f + rx * s;
      mz = fz * f + rz * s;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
    }
  }
  const running = shift && (mx || mz);
  const base = (running ? 9 : 4.2) * combat.moveMul();
  if (st.dodgeT > 0) {
    actor.position.x += st.dodgeDir.x * (6 / 0.28) * dt;
    actor.position.z += st.dodgeDir.z * (6 / 0.28) * dt;
    actor.rotation.y = Math.atan2(st.dodgeDir.x, st.dodgeDir.z);
    moveSpeed = 8;
  } else if ((st.attack === 'charge' || st.attack === 'shadow') && st.attackT < 0.28) {
    actor.position.x += st.dodgeDir.x * (8 / 0.28) * dt;
    actor.position.z += st.dodgeDir.z * (8 / 0.28) * dt;
    moveSpeed = 8;
  } else if (mx || mz) {
    actor.position.x += mx * base * dt;
    actor.position.z += mz * base * dt;
    if (!st.attack) actor.rotation.y = dampAngle(actor.rotation.y, Math.atan2(mx, mz), dt);
    moveSpeed = base;
  } else moveSpeed = 0;

  if (phase !== 'peace' && !boss.state.dead) {
    const pushed = pushOutOfBoss(actor.position.x, actor.position.z);
    actor.position.x = pushed.x;
    actor.position.z = pushed.z;
  }
  const clamped = clampArena(actor.position.x, actor.position.z);
  actor.position.x = clamped.x;
  actor.position.z = clamped.z;

  if (st.down > 0) actor.rotation.x = Math.min(1.15, actor.rotation.x + dt * 3);
  else actor.rotation.x = 0;

  combat.update(dt, {
    x: actor.position.x,
    z: actor.position.z,
    yaw: actor.rotation.y,
    onRevive,
  });

  windHot = boss.state.castName === '열풍';
  arena.setSafeHot(windHot);
  boss.update(dt, {
    fightOn: fighting && !boss.state.dead,
    player: actor.position,
    onPlayerHit(amount) {
      const before = st.hp;
      combat.damagePlayer(amount);
      if (st.hp < before) hud.float(asVec({ x: actor.position.x, y: 1.8, z: actor.position.z }), amount, 'hurt');
    },
    onWind(kind) {
      if (kind === 'telegraph') hud.banner('열풍 — 노란 선 안으로');
      else {
        audio.playSfx('wind');
        for (let i = 0; i < 5; i++) {
          vfx.windStreak(actor.position.x + (i - 2) * 1.4, actor.position.z, PATH_YAW);
        }
      }
    },
    onSlam(kind) {
      if (kind === 'hit') {
        audio.playSfx('slam');
        vfx.ring(boss.group.position.x, 0.2, boss.group.position.z, '#ff8a3a', 3);
      }
    },
  });

  if (fighting && boss.state.dead) win();

  if (fighting && !boss.state.dead) {
    mageCd -= dt;
    if (mageCd <= 0) {
      mageCd = 7.5;
      bolt.visible = true;
      bolt.position.copy(mage.position);
      bolt.position.y = 1.3;
      boltT = 0;
    }
    priestCd -= dt;
    if (priestCd <= 0) {
      priestCd = 16;
      if (st.down <= 0 && st.hp < 90) combat.heal(18);
    }
  }
  if (bolt.visible) {
    boltT += dt;
    const b = bossPoint();
    bolt.position.lerp(new THREE.Vector3(b.x, 7, b.z), Math.min(1, dt * 3));
    if (boltT > 0.7) {
      bolt.visible = false;
      if (!boss.state.dead && fighting) {
        boss.hurt(35);
        hud.float(new THREE.Vector3(b.x, 9, b.z), 35, 'dmg');
      }
    }
  }

  if (form.group.visible) form.animate(form.group, dt, { speed: moveSpeed, attack: st.attack, attackT: st.attackT });
  if (citizen.visible) animateAvatar(citizen, phase === 'peace' || phase === 'pick' ? moveSpeed : 0.2, dt);
  animateAvatar(mage, 0.4, dt);
  animateAvatar(priest, 0.3, dt);
  if (phase !== 'intro') {
    const base = form.group.userData.baseScale || 1;
    let pulse = 1;
    if (st.stealth > 0) pulse = 0.94;
    else if (st.iframe > 0) pulse = 1 + Math.sin(performance.now() * 0.05) * 0.012;
    form.group.scale.setScalar(base * pulse);
  }
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  audio.unlock();
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  camYaw -= (e.clientX - lastX) * 0.005;
  camPitch = Math.max(0.12, Math.min(1.05, camPitch + (e.clientY - lastY) * 0.003));
  lastX = e.clientX;
  lastY = e.clientY;
});
addEventListener('wheel', (e) => {
  camDist = Math.max(6.5, Math.min(16, camDist + Math.sign(e.deltaY) * 0.6));
}, { passive: true });

addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.code === 'Space') e.preventDefault();
  keys.add(e.code);
  if (e.key === 'Shift') shift = true;
  if (e.repeat) return;
  const slot = { Digit1: 0, Numpad1: 0, Digit2: 1, Numpad2: 1, Digit3: 2, Numpad3: 2, Digit4: 3, Numpad4: 3 }[e.code];
  if (slot != null) useSkill(combat.skills[slot]?.id);
  if (e.code === 'Space' && phase === 'fight') {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    let dx = Math.sin(actor.rotation.y);
    let dz = Math.cos(actor.rotation.y);
    if (f || s) {
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      const rx = Math.cos(camYaw);
      const rz = -Math.sin(camYaw);
      dx = fx * f + rx * s;
      dz = fz * f + rz * s;
    }
    combat.tryDodge(dx, dz);
    vfx.ring(actor.position.x, 0.15, actor.position.z, '#7ef0e4', 0.8);
  }
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.key === 'Shift') shift = false;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});

if (shot === 'transform') {
  poseGhost(0.55);
  vfx.carapaceBurst(actor.position, getClass(classId).seam);
  simPaused = true;
}
if (shot === 'form') {
  finishIntro();
  actor.rotation.y = PATH_YAW;
  camYaw = PATH_YAW + Math.PI + 0.7;
  camPitch = 0.32;
  camDist = 7.4;
  simPaused = true;
}
if (shot === 'fight') {
  finishIntro();
  const b = bossPoint();
  const fx = Math.sin(PATH_YAW);
  const fz = Math.cos(PATH_YAW);
  actor.position.set(b.x - fx * 13, 0, b.z - fz * 13);
  actor.rotation.y = PATH_YAW + 0.85;
  boss.forceWind();
  combat.state.res = Math.max(combat.state.res, 55);
  hud.float(new THREE.Vector3(b.x, 9.2, b.z), 168, 'crit');
}
if (shot === 'victory') {
  finishIntro();
  const b = bossPoint();
  const fx = Math.sin(PATH_YAW);
  const fz = Math.cos(PATH_YAW);
  actor.position.set(b.x - fx * 8.5, 0, b.z - fz * 8.5);
  boss.hurt(boss.state.hp);
  win();
}

requestAnimationFrame(frame);

window.__raid = {
  ready: true,
  source: form.source,
  get classId() { return classId; },
  get phase() { return phase; },
  get fps() { return fps; },
  stats() {
    return { fps: Math.round(fps), sceneDrawCalls, bloom: bloomOn };
  },
  measure: measureScene,
  debug: {
    skipIntro() { if (phase === 'intro') finishIntro(); },
    wind() { boss.forceWind(); },
    killBoss() { boss.hurt(boss.state.hp); },
    down() { combat.damagePlayer(9999); },
    res(n) { combat.state.res = n; },
    peace() { enterPeace(); },
  },
};
