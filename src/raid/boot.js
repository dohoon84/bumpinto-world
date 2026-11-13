import * as THREE from 'three';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { sanitizeLook } from '../look.js';
import { createArena } from './arena.js';
import { cloneAnimated, ghostOf, setGhostOpacity } from './models/kit.js';
import { createClassModel } from './models/index.js';
import { CITIZEN_HEIGHT, CLASS_GLB, CLASS_IDS, CLASS_MARKS, getClass, normalizeClass } from './classes.js';
import { consumeIntroReset, createRiftClock, introSeen, markIntroSeen } from './riftClock.js';
import { createBoss } from './boss.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { createRaidAudio } from './audio.js';
import { createVfx } from './vfx.js';
import { createCity } from './city.js';
import { attachTrails, updateTrails } from './trails.js';
import { createRaidRoom, mountRaidChat } from './chat.js';
import { CITIZEN_LOOK } from './look.js';
import {
  PATH_YAW, BOSS_ALONG, spawnPoint, safePoint, bossPoint, clampArena, pushOutOfBoss, fromFrame,
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.2, 0.32, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
} catch (err) {
  console.warn('[raid] bloom off', err);
  bloomOn = false;
  composer = null;
}

const arena = createArena(scene);
const city = await createCity(scene);
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
  const override = params.has(`${id}Glb`) ? params.get(`${id}Glb`) : null;
  const glbUrl = override === null ? CLASS_GLB[id] : (override || '');
  const yaw = Number(params.get(`${id}Yaw`) || (id === 'warrior' ? params.get('warriorYaw') : 0) || 0);
  packs[id] = await createClassModel(id, { look, glbUrl, yaw });
  packs[id].group.userData.classId = id;
  const mark = CLASS_MARKS[id];
  if (packs[id].source === 'glb' && mark) {
    const fit = CITIZEN_HEIGHT / mark.height;
    packs[id].group.userData.crownY = mark.crown * fit;
    packs[id].group.userData.headY = mark.head * fit;
  }
  if (packs[id].source === 'glb') attachTrails(packs[id].group, id, scene);
}
consumeIntroReset(params);
const rift = createRiftClock(params);
const asked = normalizeClass(params.get('class'));
const autoStart = ['transform', 'form', 'fight', 'victory', 'skyline', 'phase1', 'phase3', 'close', 'slam', 'emerge', 'chat'].includes(shot);
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

const ROLE_OF = { warrior: 'tank', priest: 'heal', mage: 'dps', archer: 'dps', assassin: 'dps' };
const NPC_POOL = [
  { id: 'npc-tank', name: '한결', role: '전사', kind: 'tank', color: '#ff6a22', icon: 'charge' },
  { id: 'npc-heal', name: '온유', role: '사제', kind: 'heal', color: '#e6c36a', icon: 'heal' },
  { id: 'npc-mage', name: '서린', role: '마법사', kind: 'dps', color: '#7aa6ff', icon: 'shard' },
  { id: 'npc-bow', name: '시우', role: '궁수', kind: 'dps', color: '#3dff9a', icon: 'shot' },
  { id: 'npc-sin', name: '무영', role: '암살자', kind: 'dps', color: '#ff3355', icon: 'daggers' },
];
function makeAllyBody(color) {
  const g = new THREE.Group();
  const plate = new THREE.MeshStandardMaterial({ color: '#3e4854', metalness: 0.55, roughness: 0.42 });
  const seam = new THREE.MeshBasicMaterial({ color });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.72, 4, 8), plate);
  body.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.32), plate);
  head.position.y = 1.78;
  const vis = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.04), seam);
  vis.position.set(0, 1.76, 0.15);
  const mark = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.78, 20),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
  );
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.08;
  g.add(body, head, vis, mark);
  g.scale.setScalar(1.45);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
let party = [];
function layoutParty(id) {
  for (const a of party) scene.remove(a.mesh);
  const need = { tank: 1, heal: 1, dps: 3 };
  need[ROLE_OF[id] || 'dps'] -= 1;
  const picked = [];
  for (const n of NPC_POOL) if (need[n.kind] > 0) { picked.push({ ...n }); need[n.kind] -= 1; }
  const homeP = bossPoint();
  party = picked.map((n, i) => {
    const mesh = makeAllyBody(n.color);
    const ang = (i / 4) * Math.PI * 2 + 0.5;
    mesh.position.set(homeP.x + Math.cos(ang) * 8.2, 0, homeP.z + Math.sin(ang) * 8.2);
    scene.add(mesh);
    return { ...n, mesh, hp: 1, cd: 1 + i * 0.35, ang };
  });
  const mine = ROLE_OF[id] || 'dps';
  const frames = [
    { id: 'me', name: '초행', role: getClass(id).name, kind: mine, hp: 1, isMe: true, lv: 1, icon: getClass(id).skills[0].id, resBar: getClass(id).resBar },
    ...party.map((a) => ({ id: a.id, name: a.name, role: a.role, kind: a.kind, hp: 1, isMe: false, lv: 2, icon: a.icon, resBar: a.kind === 'tank' ? 'rage' : a.kind === 'heal' ? 'holy' : a.id === 'npc-mage' ? 'mp' : a.id === 'npc-sin' ? 'energy' : 'focus' })),
  ];
  const order = { tank: 0, heal: 1, dps: 2 };
  frames.sort((a, b) => order[a.kind] - order[b.kind] || (a.isMe ? -1 : 1));
  hud.setParty(frames);
}

const hud = createHud();
hud.bind();
let chat;
const room = createRaidRoom({
  roomId: 'tancheon-hold',
  name: '초행',
  onMessage: (msg) => chat?.push(msg),
});
chat = mountRaidChat(hud.root, room);
room.system('레이드 방 · 탄천 합수부');
room.system('파티 / 레이드 채널. Enter 로 말합니다.');

const tmp = new THREE.Vector3();
function asVec(p) {
  if (!p) return tmp.copy(actor.position).setY(2.15).clone();
  if (p.isVector3) return p;
  return new THREE.Vector3(p.x, p.y ?? 2, p.z);
}

const combat = createCombat({
  audio,
  vfx,
  onFloat(pos, text, kind) { hud.float(asVec(pos), text, kind); },
  onBossHurt(amount) { boss.hurt(amount); },
  onBind(sec) { boss.slow(sec); },
  onHealParty() {
    for (const a of party) {
      a.hp = 1;
      hud.float(a.mesh.position.clone().setY(2.1), '+', 'heal');
    }
  },
  onImpact({ amount, crit }) {
    shake = Math.min(0.7, shake + (crit ? 0.42 : amount > 80 ? 0.26 : 0.1));
    if (crit || amount > 80) hitStop = crit ? 0.09 : 0.06;
    hud.flash(crit ? 0.45 : 0.22);
  },
});
combat.setClass(classId);
hud.setClass(classId);
layoutParty(classId);

let phase = autoStart ? 'intro' : 'calm';
let shake = 0;
let hitStop = 0;
let alerted = false;
let sirenPlayed = false;
let stepT = 0;
const extras = [];
let bossStage = 1;
const earForward = new THREE.Vector3();
const DIALOGUE = [
  '초행: 하늘이 갈라집니다. 장판을 먼저 보세요.',
  '서린: 흰 원 밖으로, 노란 선 안으로.',
  '온유: 쓰러져도 노란 선에서 일어납니다.',
];
let introT = 0;
let burstDone = false;
let introStart = performance.now();
let fightT = 0;
let timeLeft = 15 * 60;
let kills = '0 / 1';
let simPaused = false;
let won = false;
let moveSpeed = 0;
const portrait = shot === 'transform' || shot === 'form';
let camYaw = PATH_YAW + (portrait ? Math.PI + 0.7 : 0.35);
let camPitch = portrait ? 0.32 : 42 * Math.PI / 180;
let camDist = shot === 'transform' ? 4.4 : shot === 'form' ? 4.8 : 30;
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
  if (ok) room.system(`${getClass(classId).name} · ${sk.name}`);
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
  hud.closeCutscene();
  hud.setMode('fight');
  boss.group.visible = true;
  arena.setMood('rift');
  arena.setRain(true);
  citizen.visible = true;
  for (const a of party) a.mesh.visible = true;
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
  }
  layoutParty(id);
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
hud.onDeploy = () => beginRaid(classId);
hud.onIntroDone = () => markIntroSeen();
hud.onRepick = () => { if (phase === 'peace' || phase === 'alert' || phase === 'calm') hud.showPick(); };
hud.onVolume = (vols) => audio.setVolumes(vols);
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
  for (const a of party) a.mesh.visible = false;
  arena.setPhase('dawn');
  city.setMood('peace');
  city.setStage(0);
  audio.setAmbience(0);
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
  hud.setMode('fight');
  if (shot === 'form') return;
  audio.playBgm('boss');
  audio.setAmbience(1);
  arena.setPhase('p1');
  city.setMood('rift');
  city.setStage(1);
  hud.banner('붕괴의 거수 · 홀드');
  room.system('전투 시작 · 1페이즈');
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
  hitStop = 0.55;
  combat.state.xp = 1240;
  combat.state.level = 2;
  arena.setPhase('kill');
  city.setStage(2);
  audio.setAmbience(0);
  audio.playSting('levelup');
  hud.banner('토벌 성공');
  room.system('토벌 성공');
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
  let sim = dt;
  if (hitStop > 0) {
    hitStop = Math.max(0, hitStop - dt);
    sim *= 0.12;
  }
  if (!simPaused) step(sim);
  tickAlert();
  rim.intensity = form.group.visible || ghost.visible ? 8 : 1.2;
  const focus = actor.position;
  arena.update(dt, focus);
  vfx.update(dt);
  audio.tick(dt);
  city.update(dt);
  const now = performance.now() / 1000;
  if (form?.group) updateTrails(form.group, now);
  if (ghost) updateTrails(ghost, now);
  for (const extra of extras) updateTrails(extra, now);
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
    dealt: st.dealt,
    healed: st.healed,
    gcd: st.gcd,
    resMax: st.resMax,
    debuff: st.debuff,
    party: [
      { id: 'me', hp: st.hp / st.hpMax, down: st.down > 0, sub: st.res / (st.resMax || 1), debuff: st.debuff > 0 },
      ...party.map((a) => ({ id: a.id, hp: a.hp, down: false, sub: 0.75, debuff: false })),
    ],
  });
  const lookYaw = camYaw;
  const pitch = camPitch;
  const dist = camDist;
  const lx = Math.sin(lookYaw);
  const lz = Math.cos(lookYaw);
  const cp = Math.cos(pitch);
  camera.position.set(focus.x - lx * dist * cp, focus.y + dist * Math.sin(pitch), focus.z - lz * dist * cp);
  const aim = shot === 'wide' ? 1.5 : portrait ? 0.1 : 6;
  const head = form?.group?.userData?.headY;
  const lookY = shot === 'wide' ? 1.15 : portrait ? (head || 1.1) : 0.2;
  camera.lookAt(focus.x + lx * aim, lookY, focus.z + lz * aim);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake * 0.4;
    shake = Math.max(0, shake - dt * 1.6);
  }
  camera.getWorldDirection(earForward);
  audio.setListener({
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
    fx: earForward.x,
    fy: earForward.y,
    fz: earForward.z,
  });
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
  if (fighting && moveSpeed > 1.2 && st.down <= 0) {
    stepT -= dt;
    if (stepT <= 0) {
      stepT = moveSpeed > 6 ? 0.32 : 0.46;
      audio.playSfx('step', { x: actor.position.x, z: actor.position.z, gain: 0.35 });
    }
  }

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
    clipCues: form.group.userData.clipCues,
  });

  windHot = boss.state.castName === '열풍';
  arena.setSafeHot(windHot);
  boss.update(dt, {
    fightOn: fighting && !boss.state.dead,
    player: actor.position,
    onPlayerHit(amount) {
      const before = st.hp;
      combat.damagePlayer(amount);
      if (st.hp < before) {
        const crown = form.group.userData.crownY || 1.8;
        hud.float(asVec({ x: actor.position.x, y: crown + 0.25, z: actor.position.z }), amount, 'hurt');
      }
    },
    onWind(kind) {
      if (kind === 'telegraph') {
        audio.playSfx('warn');
        hud.banner('열풍 — 흰 원 밖, 노란 선 안');
      } else {
        audio.playSfx('wind');
        for (let i = 0; i < 4; i++) vfx.windStreak(actor.position.x + (i - 1.5) * 2.2, actor.position.z, PATH_YAW);
      }
    },
    onStage(stage) {
      bossStage = stage;
      audio.setBossPhase(stage);
      audio.setAmbience(stage);
      arena.setPhase(stage === 3 ? 'p3' : stage === 2 ? 'p2' : 'p1');
      city.setStage(stage);
      city.setMood('rift');
      audio.playSfx('roar', { x: boss.group.position.x, z: boss.group.position.z, big: true });
      shake = Math.max(shake, stage === 3 ? 0.62 : 0.36);
      hitStop = stage === 3 ? 0.16 : 0.1;
      hud.flash(0.4);
      const line = stage === 3 ? '광폭화!' : '홀드가 분노합니다 — 다리가 무너집니다';
      hud.banner(line);
      room.system(line);
    },
    onSlam(kind) {
      if (kind === 'telegraph') audio.playSfx('warn', { x: boss.group.position.x, z: boss.group.position.z });
      else if (kind === 'hit') {
        audio.playSfx('slam', { x: boss.group.position.x, z: boss.group.position.z, big: true });
        audio.playSfx('boom', { gain: 0.4 });
        vfx.slam(boss.group.position.x, boss.group.position.z);
        vfx.ring(boss.group.position.x, 0.25, boss.group.position.z, '#f4fbff', 8);
        vfx.burst(boss.group.position.x, 1.2, boss.group.position.z, '#fff6e0');
        shake = Math.max(shake, bossStage === 3 ? 0.55 : 0.32);
        hitStop = Math.max(hitStop, 0.07);
      }
    },
  });

  if (fighting && boss.state.dead) win();

  if (fighting && !boss.state.dead) {
    const b = bossPoint();
    for (const a of party) {
      a.ang += dt * 0.22;
      const radius = a.kind === 'tank' ? 6.6 : 8.6;
      const spot = clampArena(b.x + Math.cos(a.ang) * radius, b.z + Math.sin(a.ang) * radius);
      a.mesh.position.set(spot.x, 0, spot.z);
      a.mesh.rotation.y = Math.atan2(b.x - spot.x, b.z - spot.z);
      a.cd -= dt;
      if (a.cd > 0) continue;
      if (a.kind === 'heal') {
        a.cd = 8;
        if (st.down <= 0 && st.hp < st.hpMax * 0.9) combat.heal(14);
      } else {
        a.cd = a.kind === 'tank' ? 2.6 : 3.4;
        const dmg = a.kind === 'tank' ? 18 : 14;
        boss.hurt(dmg);
        vfx.arrow(spot.x, 1.5, spot.z, a.mesh.rotation.y, a.color);
        hud.float(new THREE.Vector3(b.x, 8.5, b.z), dmg, 'dmg');
      }
    }
  }

  const sk = st.attack ? combat.skill(st.attack) : null;
  const spell = !!sk && ['projectile', 'nova', 'rain', 'heal', 'healParty', 'shout', 'bind'].includes(sk.kind);
  const motion = {
    speed: moveSpeed,
    attack: st.attack,
    attackT: st.attackT,
    hit: st.hitT > 0,
    phase,
    clip: phase === 'intro' ? 'transform_in' : '',
    cast: spell,
    skill: !!sk && !spell,
    ready: classId === 'assassin' && phase === 'fight' && moveSpeed < 0.8 && !st.attack && st.hitT <= 0,
  };
  form.animate(form.group, dt, motion);
  for (const extra of extras) {
    form.animate(extra, dt, {
      speed: 0,
      phase: 'fight',
      ready: extra.userData.classId === 'assassin',
    });
  }
  if (phase === 'intro' && ghost?.userData) form.animate(ghost, dt, motion);
  if (citizen.visible) animateAvatar(citizen, phase === 'peace' || phase === 'pick' ? moveSpeed : 0.2, dt);
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
  camPitch = Math.max(portrait ? 0.12 : 0.32, Math.min(1.05, camPitch + (e.clientY - lastY) * 0.003));
  lastX = e.clientX;
  lastY = e.clientY;
});
addEventListener('wheel', (e) => {
  const zoomMin = portrait ? 4.5 : 16;
  const zoomMax = portrait ? 12 : 46;
  camDist = Math.max(zoomMin, Math.min(zoomMax, camDist + Math.sign(e.deltaY) * (portrait ? 0.4 : 1.6)));
}, { passive: true });

addEventListener('keydown', (e) => {
  audio.unlock();
  const typing = chat?.typing();
  if (e.code === 'Enter' && !typing) {
    e.preventDefault();
    chat?.focus();
    return;
  }
  if (typing) return;
  if (e.code === 'Space') e.preventDefault();
  keys.add(e.code);
  if (e.key === 'Shift') shift = true;
  if (e.repeat) return;
  const slot = { Digit1: 0, Numpad1: 0, Digit2: 1, Numpad2: 1, Digit3: 2, Numpad3: 2, Digit4: 3, Numpad4: 3 }[e.code];
  if (slot != null) useSkill(combat.skills[slot]?.id);
  if (e.code === 'Space' && hud.cutsceneOpen()) {
    e.preventDefault();
    hud.advanceCutscene();
    return;
  }
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

function beginAlert() {
  if (alerted || phase === 'fight' || phase === 'intro' || phase === 'victory' || phase === 'peace') return;
  alerted = true;
  phase = 'alert';
  hud.setMode('alert');
  if (!rift.inRegion()) return;
  arena.setPhase('crack');
  city.setMood('rift');
  city.setStage(0);
  arena.setRain(true);
  boss.group.visible = true;
  if (!sirenPlayed) {
    sirenPlayed = true;
    audio.playSfx('siren');
  }
  if (shot === 'cutscene' || (shot !== 'alert' && !introSeen())) hud.openCutscene();
}

function tickAlert() {
  if (autoStart || shot === 'calm' || phase === 'fight' || phase === 'intro' || phase === 'victory' || phase === 'peace') {
    if (phase !== 'alert') hud.syncAlert({ show: false });
    return;
  }
  const snap = rift.snapshot();
  if (!alerted && phase === 'calm' && snap.active) beginAlert();
  hud.syncAlert({
    show: phase === 'alert',
    inRegion: rift.inRegion(),
    remaining: snap.remaining,
    line: DIALOGUE[Math.floor(performance.now() / 4000) % DIALOGUE.length],
    away: phase === 'alert' && !rift.inRegion(),
    covered: hud.cutsceneOpen(),
  });
}

if (!autoStart && shot !== 'alert' && shot !== 'cutscene') {
  if (shot === 'calm') rift.applyServerEvent({ startAt: Date.now() + 3_600_000 });
  arena.setMood('peace', true);
  arena.setRain(false);
  hud.setMode('calm');
  boss.group.visible = false;
  for (const a of party) a.mesh.visible = false;
}
if (shot === 'alert' || shot === 'cutscene') {
  rift.applyServerEvent({ startAt: Date.now() - 1500 });
  if (rift.inRegion()) {
    arena.setMood('rift', true);
    arena.setRain(true);
  } else {
    arena.setMood('peace', true);
    arena.setRain(false);
    boss.group.visible = false;
  }
  beginAlert();
}

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
  camDist = 4.8;
  simPaused = true;
}
if (shot === 'wide') {
  finishIntro();
  citizen.visible = false;
  for (const a of party) a.mesh.visible = false;
  boss.group.visible = true;
  arena.setMood('rift', true);
  arena.setRain(true);
  const ids = ['warrior', 'mage', 'priest', 'archer', 'assassin'];
  ids.forEach((id, i) => {
    const src = packs[id].group;
    const g = id === classId ? form.group : cloneAnimated(src);
    if (g.parent) g.parent.remove(g);
    scene.add(g);
    if (id !== classId) {
      extras.push(g);
      attachTrails(g, id, scene);
    }
    const p = fromFrame(BOSS_ALONG - 13, (i - 2) * 2.6);
    g.position.set(p.x, 0, p.z);
    g.rotation.set(0, PATH_YAW + Math.PI, 0);
    g.visible = true;
  });
  const mid = fromFrame(BOSS_ALONG - 11, 0);
  actor.position.set(mid.x, 0, mid.z);
  boss.hideDress();
  camYaw = PATH_YAW;
  camPitch = 0.42;
  camDist = 11;
}
function placeFight(yaw, pitch, dist, back) {
  finishIntro();
  const b = bossPoint();
  actor.position.set(b.x - Math.sin(yaw) * back, 0, b.z - Math.cos(yaw) * back);
  actor.rotation.y = yaw;
  camYaw = yaw;
  camPitch = pitch;
  camDist = dist;
}
function seedChat() {
  chat.push({ channel: 'party', name: '한결', color: '#FF7A1A', text: '장판 먼저 봅니다. 방패는 제가.', self: false, t: Date.now() });
  chat.push({ channel: 'party', name: '온유', color: '#FFC845', text: '체력 볼게요. 노란 선으로 오세요.', self: false, t: Date.now() });
  chat.push({ channel: 'raid', name: '서린', color: '#8C7FFF', text: '하늘 균열이 더 벌어집니다.', self: false, t: Date.now() });
  chat.push({ channel: 'system', name: '시스템', text: '초행 슬래시 1,248', system: true, kind: 'hurt', t: Date.now() });
  chat.push({ channel: 'system', name: '시스템', text: '치명타 3,912', system: true, kind: 'crit', t: Date.now() });
  chat.push({ channel: 'system', name: '시스템', text: '온유 치유 +420', system: true, kind: 'heal', t: Date.now() });
}
if (shot === 'fight' || shot === 'chat') {
  placeFight(PATH_YAW + 0.35, 0.62, 18, 12);
  boss.forceWind();
  combat.state.res = Math.max(combat.state.res, 55);
  seedChat();
  hud.float(new THREE.Vector3(bossPoint().x, 8.2, bossPoint().z), 168, 'crit');
}
if (shot === 'skyline' || shot === 'emerge') {
  placeFight(city.yaw, shot === 'emerge' ? 0.3 : 0.4, shot === 'emerge' ? 20 : 28, 16);
  arena.setPhase('p1', true);
  city.setMood('rift');
  city.setStage(1);
  seedChat();
}
if (shot === 'phase1') {
  placeFight(city.yaw, 0.42, 24, 14);
  arena.setPhase('p1', true);
  city.setStage(1);
}
if (shot === 'phase3') {
  placeFight(city.yaw, 0.4, 26, 15);
  boss.hurt(8600);
  arena.setPhase('p3', true);
  city.setMood('rift');
  city.setStage(3);
  audio.setAmbience(3);
}
if (shot === 'close') {
  placeFight(PATH_YAW, 0.5, 9, 7);
  seedChat();
}
if (shot === 'slam') {
  placeFight(PATH_YAW + 0.2, 0.48, 16, 11);
  boss.forceSlam();
  vfx.slam(boss.group.position.x, boss.group.position.z);
  seedChat();
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
  rift: {
    snapshot: () => rift.snapshot(),
    applyServerEvent: (ev) => rift.applyServerEvent(ev),
  },
  get clip() { return form.group.userData.clipName || ''; },
  get clips() { return (form.animations || []).map((c) => c.name); },
  get clipTime() { return form.group.userData.clipTime || 0; },
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
    hurtBoss(n) { boss.hurt(n); return boss.state.hp / boss.state.hpMax; },
    down() { combat.damagePlayer(9999); },
    res(n) { combat.state.res = n; },
    peace() { enterPeace(); },
  },
};
