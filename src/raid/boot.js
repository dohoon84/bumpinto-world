import * as THREE from 'three';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
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
import { createEnvKit } from './envkit.js';
import { createFlames } from './flames.js';
import { clearPortraitCache, renderClassPortrait } from './portrait.js';
import { mountPlayerFace, readPlayerLook, writePlayerLook } from './playerFace.js';
import { attachTrails, updateTrails } from './trails.js';
import { createRaidRoom, mountRaidChat } from './chat.js';
import { virtualPad } from '../input.js';
import {
  PATH_YAW, BOSS_ALONG, spawnPoint, safePoint, bossPoint, clampArena, pushOutOfBoss, fromFrame, toFrame,
} from './layout.js';
import { bossFrame, chooseSkill, hurtVitals, makeVitals, roleGoal } from './partyAi.js';

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

const camForward = new THREE.Vector3();
const camRight = new THREE.Vector3();
function cameraAxes() {
  camera.getWorldDirection(camForward);
  camForward.y = 0;
  if (camForward.lengthSq() < 1e-5) camForward.set(Math.sin(camYaw), 0, Math.cos(camYaw));
  camForward.normalize();
  camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();
  return { fx: camForward.x, fz: camForward.z, rx: camRight.x, rz: camRight.z };
}

function moveAxes() {
  let f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  let s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  f += virtualPad.f || 0;
  s += virtualPad.s || 0;
  f = Math.max(-1, Math.min(1, f));
  s = Math.max(-1, Math.min(1, s));
  if (!f && !s) return null;
  const { fx, fz, rx, rz } = cameraAxes();
  let mx = fx * f + rx * s;
  let mz = fz * f + rz * s;
  const len = Math.hypot(mx, mz) || 1;
  return { x: mx / len, z: mz / len, f, s };
}

hideWorldChrome();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.38;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.15, 1200);

let composer = null;
let bloomOn = true;
let bloomPass = null;
try {
  const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
    import('three/examples/jsm/postprocessing/EffectComposer.js'),
    import('three/examples/jsm/postprocessing/RenderPass.js'),
    import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
    import('three/examples/jsm/postprocessing/OutputPass.js'),
  ]);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.16, 0.18, 0.9);
  composer.addPass(bloom);
  bloomPass = bloom;
  composer.addPass(new OutputPass());
} catch (err) {
  console.warn('[raid] bloom off', err);
  bloomOn = false;
  composer = null;
}

const arena = createArena(scene);
const city = await createCity(scene);
const env = await createEnvKit(scene);
const procSky = scene.getObjectByName('proc-skyline');
if (procSky) procSky.visible = false;
city.root.visible = false;
const vfx = createVfx(scene);
const flames = createFlames(scene);
flames.addAnchors(env.fireAnchors || []);
vfx.bindFlames(flames);
const audio = createRaidAudio();
const look = readPlayerLook();

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
  if (packs[id].source === 'glb') mountPlayerFace(packs[id].group, look, id);
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
const autoStart = ['transform', 'form', 'fight', 'victory', 'skyline', 'phase1', 'phase3', 'close', 'slam', 'emerge', 'chat', 'bridge', 'mobs', 'collapse', 'vfx', 'vfxall', 'mobsv2'].includes(shot);
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
function refreshPortrait(id) {
  try {
    const pack = packs[id];
    pack?.animate?.(pack.group, 0.16, { speed: 0, phase: 'calm' });
    hud.setPortrait(renderClassPortrait(renderer, pack.group, id), id);
  } catch (err) {
    console.warn('[raid] portrait', err);
  }
}
mountForm(classId);

const boss = await createBoss(scene);
boss.setMobFactory(env.spawnMob);
boss.setObstacles(env.obstacles || []);
const home = boss.home;

const ROLE_OF = { warrior: 'tank', priest: 'heal', mage: 'dps', archer: 'dps', assassin: 'dps' };
const PLAYER_NAME = '도훈';
const NPC_POOL = [
  { id: 'npc-tank', name: '강산', role: '전사', kind: 'tank', color: '#ff6a22', icon: 'charge', classId: 'warrior' },
  { id: 'npc-heal', name: '지우', role: '사제', kind: 'heal', color: '#e6c36a', icon: 'heal', classId: 'priest' },
  { id: 'npc-mage', name: '하린', role: '마법사', kind: 'dps', color: '#7aa6ff', icon: 'shard', classId: 'mage' },
  { id: 'npc-bow', name: '민재', role: '궁수', kind: 'dps', color: '#3dff9a', icon: 'shot', classId: 'archer' },
  { id: 'npc-sin', name: '서연', role: '암살자', kind: 'dps', color: '#ff3355', icon: 'daggers', classId: 'assassin' },
];
const ALLY_SLOTS = [
  [3.1, -0.35],
  [-1.8, 1.35],
  [1.15, 1.9],
  [0.2, -2.05],
];
const CLASS_TINT = {
  warrior: '#FF7A1A',
  priest: '#FFE14A',
  mage: '#7B6CFF',
  archer: '#3DDC84',
  assassin: '#FF3D8A',
};
const marks = [];
const MARK_BASE_Y = 2.25;
const markWorld = new THREE.Vector3();
const markNdc = new THREE.Vector3();
function makeNameSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.font = '700 36px "Noto Sans CJK KR", "NanumSquareRound", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  const ink = Math.min(0.92, (g.measureText(text).width + 18) / canvas.width);
  g.fillText(text, 128, 34);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false }));
  sprite.scale.set(1.7, 0.42, 1);
  sprite.position.y = MARK_BASE_Y;
  sprite.userData.ink = ink;
  sprite.frustumCulled = false;
  sprite.renderOrder = 20;
  return sprite;
}
function addMark(mesh, name, classId, kind) {
  const color = CLASS_TINT[classId] || '#FFB000';
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.52, 0.74, 28),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.07;
  const sprite = makeNameSprite(name, color);
  g.add(ring, sprite);
  g.userData.follow = mesh;
  g.userData.kind = kind;
  g.userData.label = name;
  g.userData.sprite = sprite;
  scene.add(g);
  marks.push(g);
}
function clearMarks(kind) {
  for (let i = marks.length - 1; i >= 0; i--) {
    if (marks[i].userData.kind !== kind) continue;
    scene.remove(marks[i]);
    marks.splice(i, 1);
  }
}
const markDir = new THREE.Vector3();
function viewSize() {
  const el = renderer.domElement;
  return { w: el.clientWidth || el.width || 1, h: el.clientHeight || el.height || 1 };
}
function projectAnchor(world, w, h) {
  markNdc.copy(world).project(camera);
  return {
    behind: markNdc.z < -1 || markNdc.z > 1,
    sx: (markNdc.x * 0.5 + 0.5) * w,
    sy: (0.5 - markNdc.y * 0.5) * h,
    dist: Math.max(0.35, world.distanceTo(camera.position)),
  };
}
function placeSprite(g, sprite, sx, sy, dist) {
  const { w, h } = viewSize();
  markNdc.set((sx / w) * 2 - 1, 1 - (sy / h) * 2, 0.5).unproject(camera);
  markDir.copy(markNdc).sub(camera.position).normalize();
  markWorld.copy(camera.position).addScaledVector(markDir, dist);
  sprite.position.set(markWorld.x - g.position.x, markWorld.y - g.position.y, markWorld.z - g.position.z);
}
function resolveNameplates(items) {
  const gap = 4;
  const maxOff = 40;
  items.sort((a, b) => a.dist - b.dist);
  const overlaps = (a, b) => Math.abs(a.sx - b.sx) < (a.gw + b.gw) / 2
    && Math.abs(a.sy - b.sy) < (a.gh + b.gh) / 2;
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.g.userData.kind === 'player') {
      a.hidden = true;
      continue;
    }
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (let j = 0; j < i; j++) {
        const b = items[j];
        if (b.hidden || !overlaps(a, b)) continue;
        const up = b.sy - b.gh / 2 - gap - a.gh / 2;
        const down = b.sy + b.gh / 2 + gap + a.gh / 2;
        const pick = Math.abs(up - a.baseSy) <= Math.abs(down - a.baseSy) ? up : down;
        if (Math.abs(pick - a.baseSy) <= maxOff) {
          a.sy = pick;
          moved = true;
        } else {
          a.hidden = true;
          break;
        }
      }
      if (a.hidden || !moved) break;
    }
    if (Math.abs(a.sy - a.baseSy) > maxOff) a.hidden = true;
    if (!a.hidden && hud.coversHud(a.sx - a.gw / 2, a.sy - a.gh / 2, a.gw, a.gh)) a.hidden = true;
  }
}
function syncMarks() {
  camera.updateMatrixWorld(true);
  const { w, h } = viewSize();
  const focal = (h * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
  const items = [];
  for (const g of marks) {
    const m = g.userData.follow;
    const sprite = g.userData.sprite;
    const on = !!(m && m.visible && m.parent && sprite);
    g.visible = on;
    g.userData.screen = null;
    if (!on) continue;
    m.getWorldPosition(markWorld);
    g.position.set(markWorld.x, 0, markWorld.z);
    const anchor = markWorld.clone();
    anchor.y = MARK_BASE_Y;
    const proj = projectAnchor(anchor, w, h);
    if (proj.behind) {
      g.visible = false;
      continue;
    }
    const cap = Math.min(1, 128 / Math.max(8, (1.7 * focal) / proj.dist));
    sprite.scale.set(1.7 * cap, 0.42 * cap, 1);
    const pw = sprite.scale.x * focal / proj.dist;
    const ph = sprite.scale.y * focal / proj.dist;
    const gw = pw * (sprite.userData.ink || 0.5);
    const gh = ph * 0.72;
    if (proj.sx < -gw || proj.sx > w + gw || proj.sy < -gh || proj.sy > h + gh) {
      g.visible = false;
      continue;
    }
    items.push({
      g, sprite, dist: proj.dist, sx: proj.sx, sy: proj.sy, baseSy: proj.sy, gw, gh, hidden: false,
    });
  }
  resolveNameplates(items);
  for (const box of items) {
    if (box.hidden) {
      box.g.visible = false;
      continue;
    }
    placeSprite(box.g, box.sprite, box.sx, box.sy, box.dist);
    box.g.userData.screen = {
      name: box.g.userData.label,
      x: box.sx - box.gw / 2,
      y: box.sy - box.gh / 2,
      w: box.gw,
      h: box.gh,
      off: Math.round(box.sy - box.baseSy),
    };
  }
}
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
function allyGoal(i, origin, yaw, kind) {
  let [fwd, side] = ALLY_SLOTS[i] || [0, 1.5];
  if (kind === 'tank') { fwd = 3.2; side = -0.3; }
  if (kind === 'heal') { fwd = -1.8; side = 1.25; }
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  return {
    x: origin.x + fx * fwd + rx * side,
    z: origin.z + fz * fwd + rz * side,
  };
}
function bossAxes() {
  const yaw = boss.group.rotation.y;
  return {
    x: boss.group.position.x,
    z: boss.group.position.z,
    fx: Math.sin(yaw),
    fz: Math.cos(yaw),
    rx: Math.cos(yaw),
    rz: -Math.sin(yaw),
  };
}
function stepOut(x, z) {
  for (const zone of boss.state.zones || []) {
    const dx = x - zone.x;
    const dz = z - zone.z;
    const d = Math.hypot(dx, dz);
    if (d < zone.r + 0.8) {
      const len = d || 1;
      return { x: zone.x + (dx / len) * (zone.r + 1.7), z: zone.z + (dz / len) * (zone.r + 1.7) };
    }
  }
  return null;
}
function fightSpot(a, i) {
  const b = bossAxes();
  const sway = Math.sin(performance.now() * 0.00055 + i * 1.7) * 2.2;
  let gx;
  let gz;
  if (a.kind === 'tank') {
    gx = b.x + b.fx * 8.4;
    gz = b.z + b.fz * 8.4;
  } else if (a.classId === 'assassin') {
    gx = b.x - b.fx * 4.8 + b.rx * 3.3;
    gz = b.z - b.fz * 4.8 + b.rz * 3.3;
  } else if (a.classId === 'mage' || a.classId === 'archer') {
    const dist = 12 + Math.sin(performance.now() * 0.00032 + i) * 1.5;
    const side = (a.classId === 'mage' ? -3.4 : 3.4) + sway;
    gx = b.x + b.fx * dist + b.rx * side;
    gz = b.z + b.fz * dist + b.rz * side;
  } else {
    gx = b.x + b.fx * 9.2 + b.rx * -1.6;
    gz = b.z + b.fz * 9.2 + b.rz * -1.6;
    let worst = null;
    let worstHp = 0.82;
    const playerHp = combat.state.hp / combat.state.hpMax;
    if (playerHp < worstHp) {
      worst = actor.position;
      worstHp = playerHp;
    }
    for (const mate of party) {
      if (mate === a || mate.hp >= worstHp) continue;
      worst = mate.mesh.position;
      worstHp = mate.hp;
    }
    if (worst) {
      gx = worst.x + b.rx * 1.5;
      gz = worst.z + b.rz * 1.5;
    }
  }
  return stepOut(gx, gz) || { x: gx, z: gz };
}
function makeCompanion(n) {
  const pack = packs[n.classId];
  if (pack?.source === 'glb') {
    const mesh = cloneAnimated(pack.group);
    mesh.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    mesh.userData.classId = n.classId;
    mesh.visible = true;
    return mesh;
  }
  console.warn('[raid] companion model missing', n.classId, pack?.source);
  return makeAllyBody(n.color);
}
function layoutParty(id, opts = {}) {
  clearMarks('party');
  clearMarks('player');
  for (const a of party) scene.remove(a.mesh);
  const picked = NPC_POOL.filter((n) => n.classId !== id).slice(0, 4);
  party = picked.map((n, i) => {
    const mesh = makeCompanion(n);
    scene.add(mesh);
    const vitals = makeVitals(n.classId);
    return { ...n, mesh, hp: 1, vitals, cd: 0.6 + i * 0.35, ang: i, swing: 0, swingId: '', taunt: 8, moving: false, think: 0.15 + i * 0.08, goal: null, dodgeWait: 0.16, slot: i, rezLeft: 0 };
  });
  settleParty(actor.rotation.y);
  addMark(form.group, PLAYER_NAME, id, 'player');
  for (const a of party) addMark(a.mesh, a.name, a.classId, 'party');
  const mine = ROLE_OF[id] || 'dps';
  const frames = [
    { id: 'me', name: PLAYER_NAME, role: getClass(id).name, kind: mine, classId: id, hp: 1, isMe: true, lv: 1, icon: getClass(id).skills[0].id, resBar: getClass(id).resBar },
    ...party.map((a) => ({ id: a.id, name: a.name, role: a.role, kind: a.kind, classId: a.classId, hp: 1, isMe: false, lv: 2, icon: a.icon, resBar: a.kind === 'tank' ? 'rage' : a.kind === 'heal' ? 'holy' : a.id === 'npc-mage' ? 'mp' : a.id === 'npc-sin' ? 'energy' : 'focus' })),
  ];
  const kindRank = { tank: 1, heal: 2, dps: 3 };
  const classRank = { mage: 0, archer: 1, assassin: 2, priest: 3, warrior: 4 };
  frames.sort((a, b) => {
    if (!!a.isMe !== !!b.isMe) return a.isMe ? -1 : 1;
    const byKind = (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9);
    if (byKind) return byKind;
    return (classRank[a.classId] ?? 9) - (classRank[b.classId] ?? 9);
  });
  hud.setParty(frames);
}

function hurtMate(a, amount, kind) {
  if (!a?.vitals) return 0;
  const taken = hurtVitals(a.vitals, amount, a.kind);
  a.hp = a.vitals.hp / a.vitals.hpMax;
  if (taken > 0) {
    hud.float(a.mesh.position.clone().setY(2.15), taken, 'hurt');
    if (a.vitals.down > 0 && a.vitals.hp <= 0) room.system(`${a.name} 님이 쓰러졌습니다. 부활을 기다립니다`);
  }
  return taken;
}
function reviveMate(a, by) {
  if (!a?.vitals || a.vitals.down <= 0) return;
  a.vitals.down = 0;
  a.vitals.hp = Math.round(a.vitals.hpMax * 0.42);
  a.vitals.iframe = 1.6;
  a.hp = a.vitals.hp / a.vitals.hpMax;
  a.mesh.rotation.x = 0;
  vfx.pillar(a.mesh.position.x, a.mesh.position.z, '#FFC845');
  hud.float(a.mesh.position.clone().setY(2.2), '부활', 'heal');
  if (by?.vitals) {
    by.vitals.skills.rez = (by.vitals.skills.rez || 0) + 1;
    by.vitals.healed += Math.round(a.vitals.hp);
    room.system(`${by.name}: ${a.name} 님, 일어납니다`);
  }
}
function castNpc(a) {
  const v = a.vitals;
  v.gcd = Math.max(0, v.gcd - 0);
  for (const k of Object.keys(v.cds)) v.cds[k] = Math.max(0, v.cds[k]);
  const dist = Math.hypot(a.mesh.position.x - boss.group.position.x, a.mesh.position.z - boss.group.position.z);
  const id = chooseSkill({ ...a, x: a.mesh.position.x }, {
    distBoss: dist,
    inDanger: (boss.state.zones || []).some((z) => Math.hypot(a.mesh.position.x - z.x, a.mesh.position.z - z.z) < z.r + 0.4),
    allies: party.concat([{ classId: 'player', vitals: { hp: combat.state.hp, hpMax: combat.state.hpMax, down: combat.state.down }, mesh: { position: actor.position } }]),
  });
  if (!id) return;
  const spec = getClass(a.classId);
  const skill = id === 'rez' ? { id: 'rez', cd: 14, lock: 2.1, sfx: 'heal', color: '#FFC845', heal: 0 } : spec.skills.find((s) => s.id === id);
  if (!skill) return;
  v.cds[id] = skill.cd || 8;
  if (id === 'rez') v.rezCd = 14;
  v.gcd = 0.85;
  a.swing = skill.lock || 0.4;
  a.swingId = id;
  v.skills[id] = (v.skills[id] || 0) + 1;
  const x = a.mesh.position.x;
  const z = a.mesh.position.z;
  const yaw = Math.atan2(boss.group.position.x - x, boss.group.position.z - z);
  audio.playSfx(skill.sfx || 'slash', { x, z });
  const hx = boss.group.position.x + Math.sin(yaw + Math.PI) * 4.2;
  const hz = boss.group.position.z + Math.cos(yaw + Math.PI) * 4.2;
  if (id === 'rez') {
    const downed = party.find((m) => m !== a && m.vitals.down >= 6);
    a.rezTarget = downed || null;
    vfx.pillar(x, z, '#FFC845');
    return;
  }
  if (id === 'slash' || id === 'spin') vfx.weaponSlash(hx, 3.6, hz, yaw, '#FFB000', id === 'spin' ? 2 : 1);
  else if (id === 'charge') vfx.charge(x, z, yaw);
  else if (id === 'shout') {
    vfx.ring(x, 0.4, z, '#FFB000', 3);
    a.taunt = 12;
    room.system(`${a.name}: 홀드, 이쪽이다`);
  } else if (id === 'daggers') vfx.weaponSlash(hx, 3.1, hz, yaw, '#FF3D8A', 2);
  else if (id === 'shadow') vfx.blink(x, z, yaw);
  else if (id === 'stealth') vfx.burst(x, 1.2, z, '#9bb7d4');
  else if (id === 'tape') vfx.poison(hx, hz);
  else if (id === 'shard' || id === 'freeze') {
    vfx.bolt(hx, hz, yaw);
    vfx.sparks(hx, 4.2, hz, '#C080FF', 8);
  } else if (id === 'nova' || id === 'blizzard') vfx.frost(hx, hz);
  else if (id === 'shot' || id === 'mark') vfx.pierce(x, z, yaw);
  else if (id === 'volley') vfx.multi(x, z, yaw);
  else if (id === 'rain') vfx.arrowRain(hx, hz);
  else if (id === 'heal' || id === 'circle') vfx.pillar(x, z, '#FFC845');
  else if (id === 'smite' || id === 'holy') vfx.holyBurst(hx, hz);
  if (skill.power) {
    const dealt = Math.round(skill.power * 0.35);
    boss.hurt(dealt);
    v.dealt += dealt;
    hud.float(new THREE.Vector3(hx, 6.2, hz), dealt, 'dmg');
  }
  if (skill.heal) {
    const mates = party.concat([{ vitals: { hp: combat.state.hp, hpMax: combat.state.hpMax, down: combat.state.down }, mesh: { position: actor.position }, isPlayer: true }]);
    const hurt = mates.filter((m) => m.vitals.down <= 0).sort((p, q) => p.vitals.hp / p.vitals.hpMax - q.vitals.hp / q.vitals.hpMax)[0];
    if (hurt?.isPlayer) {
      combat.heal(skill.heal);
      v.healed += skill.heal;
    } else if (hurt) {
      const before = hurt.vitals.hp;
      const cap = Math.round(hurt.vitals.hpMax * 0.82);
      const room = Math.max(0, cap - hurt.vitals.hp);
      hurt.vitals.hp = Math.min(hurt.vitals.hpMax, hurt.vitals.hp + Math.min(skill.heal, room));
      hurt.hp = hurt.vitals.hp / hurt.vitals.hpMax;
      const got = Math.round(hurt.vitals.hp - before);
      v.healed += got;
      if (got > 0) hud.float(hurt.mesh.position.clone().setY(2.1), `+${got}`, 'heal');
    }
  }
}
let tankCleave = 1.2;
let partyChip = 0.45;
let lastLive = false;
let trailOn = false;
const playerTrail = [];
let playerRibbon = null;
const trailMeshes = [];
function clearTrails() {
  trailOn = false;
  playerTrail.length = 0;
  for (const mesh of trailMeshes) {
    scene.remove(mesh);
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  }
  trailMeshes.length = 0;
  playerRibbon = null;
  for (const a of party) {
    a.record = false;
    a.trail = [];
    a._trailAcc = 0;
    a._trailMesh = null;
  }
}
function syncRibbon(mesh, points, color, name) {
  const n = Math.floor(points.length / 3);
  if (n < 2) return mesh;
  const half = 0.48;
  const pos = [];
  for (let i = 0; i < n - 1; i++) {
    const x0 = points[i * 3];
    const z0 = points[i * 3 + 2];
    const x1 = points[(i + 1) * 3];
    const z1 = points[(i + 1) * 3 + 2];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const px = (-dz / len) * half;
    const pz = (dx / len) * half;
    const y = 1.05;
    pos.push(
      x0 + px, y, z0 + pz, x0 - px, y, z0 - pz, x1 + px, y, z1 + pz,
      x0 - px, y, z0 - pz, x1 - px, y, z1 - pz, x1 + px, y, z1 + pz,
    );
  }
  if (!mesh) {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false });
    mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    mesh.name = name;
    mesh.visible = trailOn;
    scene.add(mesh);
    trailMeshes.push(mesh);
  }
  mesh.visible = trailOn;
  mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  mesh.geometry.computeBoundingSphere();
  return mesh;
}
function settleParty(yaw, dt = 0, live = false) {
  lastLive = !!live;
  const st = combat.state;
  const bossPos = boss.group.position;
  if (live) {
    tankCleave -= dt;
    partyChip -= dt;
  }
  party.forEach((a, i) => {
    if (a.vitals) {
      a.vitals.gcd = Math.max(0, a.vitals.gcd - dt);
      a.vitals.iframe = Math.max(0, a.vitals.iframe - dt);
      a.vitals.rezCd = Math.max(0, a.vitals.rezCd - dt);
      for (const k of Object.keys(a.vitals.cds)) a.vitals.cds[k] = Math.max(0, a.vitals.cds[k] - dt);
      a.hp = a.vitals.hp / a.vitals.hpMax;
    }
    if (live && a.vitals?.down > 0) {
      a.mesh.rotation.x = Math.min(1.2, (a.mesh.rotation.x || 0) + dt * 2.6);
      a.moving = false;
      const pack = packs[a.classId];
      if (pack?.animate) pack.animate(a.mesh, dt > 0 ? dt : 0.016, { speed: 0, hit: a.vitals.down > 8.2, phase: 'fight' });
      return;
    }
    if (a.mesh.rotation.x) a.mesh.rotation.x = 0;
    let goal;
    if (live) {
      const spot = roleGoal(
        { classId: a.classId, kind: a.kind, slot: i, x: a.mesh.position.x, z: a.mesh.position.z, vitals: a.vitals, mesh: a.mesh },
        {
          boss: bossFrame(boss.group),
          now: performance.now(),
          zones: boss.state.zones || [],
          allies: party,
          mobs: (env.liveMobs || []).filter((m) => m.group && !m.dead).map((m) => ({ x: m.group.position.x, z: m.group.position.z })),
        },
      );
      if (spot.dodge && !a._zoning) {
        a._zoning = true;
        a.dodgeWait = Math.random() < (a.kind === 'tank' ? 0.32 : 0.12) ? 1.05 : 0.18;
      }
      if (!spot.dodge) a._zoning = false;
      if (spot.dodge && a.dodgeWait > 0) a.dodgeWait -= dt;
      a.think -= dt;
      if (a.think <= 0 || !a.goal) {
        a.think = 0.3 + (i % 3) * 0.05;
        a.goal = spot;
      }
      goal = (spot.dodge && a.dodgeWait <= 0) ? spot : (a.goal || spot);
      const bd = Math.hypot(a.mesh.position.x - boss.group.position.x, a.mesh.position.z - boss.group.position.z);
      a.vitals.distSum += bd;
      a.vitals.distN += 1;
      if (a.record) {
        a.trail = a.trail || [];
        a._trailAcc = (a._trailAcc || 0) + dt;
        if (a._trailAcc > 0.08 && a.trail.length < 2400) {
          a._trailAcc = 0;
          a.trail.push(a.mesh.position.x, 0.55, a.mesh.position.z);
          a._trailMesh = syncRibbon(a._trailMesh, a.trail, CLASS_TINT[a.classId] || '#fff', `trail-${a.classId}`);
        }
      }
    } else {
      goal = allyGoal(i, actor.position, yaw, a.kind);
      if (dt <= 0) a.mesh.position.set(goal.x, 0, goal.z);
    }
    const dx = goal.x - a.mesh.position.x;
    const dz = goal.z - a.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    if (live && dist >= 0.05) {
      const step = Math.min(dist, dt * (a.kind === 'tank' ? 4.4 : a.classId === 'assassin' ? 5.1 : 4.3));
      a.mesh.position.x += (dx / dist) * step;
      a.mesh.position.z += (dz / dist) * step;
    } else if (!live && dt > 0 && dist >= 0.05) {
      const step = Math.min(dist, dt * 4.2);
      a.mesh.position.x += (dx / dist) * step;
      a.mesh.position.z += (dz / dist) * step;
    }
    a.moving = dist > 0.28;
    let aimX = bossPos.x;
    let aimZ = bossPos.z;
    let aimY = 3.4;
    if (live && a.kind !== 'heal') {
      const mob = (env.liveMobs || []).find((m) => m.group && !m.dead && Math.hypot(m.group.position.x - a.mesh.position.x, m.group.position.z - a.mesh.position.z) < 6.5);
      if (mob) {
        aimX = mob.group.position.x;
        aimZ = mob.group.position.z;
        aimY = 1.3;
      }
    }
    a.mesh.rotation.y = live
      ? Math.atan2(aimX - a.mesh.position.x, aimZ - a.mesh.position.z)
      : yaw;
    if (a.swing > 0) {
      a.swing = Math.max(0, a.swing - dt);
      if (a.swing === 0 && a.swingId === 'rez' && a.rezTarget) reviveMate(a.rezTarget, a);
    }
    if (live && a.vitals.gcd <= 0 && a.swing <= 0) castNpc(a);
    if (live && partyChip <= 0 && a.vitals.down <= 0) {
      hurtMate(a, a.kind === 'tank' ? 28 : 16, a.kind);
    }
    if (live && a.kind === 'tank' && tankCleave <= 0 && a.vitals.down <= 0) {
      const near = Math.hypot(a.mesh.position.x - bossPos.x, a.mesh.position.z - bossPos.z) < 9;
      if (near) {
        tankCleave = 2.6;
        hurtMate(a, 26, 'cleave');
      }
    }
    const pack = packs[a.classId];
    if (pack?.animate) {
      const attack = a.swing > 0 ? (a.swingId || 'slash') : '';
      const spell = ['shard', 'nova', 'freeze', 'blizzard', 'smite', 'heal', 'circle', 'holy', 'shot', 'volley', 'rain', 'shout'].includes(attack);
      pack.animate(a.mesh, dt > 0 ? dt : 0.016, {
        speed: a.moving ? 3.6 : 0,
        attack: spell ? '' : attack,
        cast: spell,
        skill: ['charge', 'spin', 'shadow', 'tape', 'stealth'].includes(attack),
        attackT: a.swing > 0 ? Math.max(0, 0.55 - a.swing) : 0,
        phase: live ? 'fight' : 'calm',
      });
    }
  });
  if (live && partyChip <= 0) {
    partyChip = 2.4;
    if (combat.state.down <= 0) combat.damagePlayer(14);
  }
}

const hud = createHud();
hud.bind();
let chat;
const room = createRaidRoom({
  roomId: 'tancheon-hold',
  name: PLAYER_NAME,
  onMessage: (msg) => chat?.push(msg),
});
chat = mountRaidChat(hud.root, room);
room.system('레이드 방 · 탄천 합수부');
room.system('파티와 레이드 채널입니다. Enter로 말합니다.');

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
      if (a.vitals.down > 0) continue;
      const before = a.vitals.hp;
      a.vitals.hp = Math.min(a.vitals.hpMax, a.vitals.hp + 22);
      a.hp = a.vitals.hp / a.vitals.hpMax;
      const got = Math.round(a.vitals.hp - before);
      if (got > 0) hud.float(a.mesh.position.clone().setY(2.1), `+${got}`, 'heal');
    }
  },
  onImpact({ amount, crit, melee }) {
    shake = Math.min(0.7, shake + (crit ? 0.42 : amount > 80 ? 0.26 : 0.12));
    if (melee || crit || amount > 80) hitStop = crit ? 0.09 : melee ? 0.055 : 0.06;
    hud.flash(crit ? 0.45 : 0.22);
  },
  getTargets() {
    const list = [];
    if (!boss.state.dead) {
      const p = boss.group.position;
      list.push({ x: p.x, y: 3.2, z: p.z, r: 2.9 });
    }
    for (const mob of env.liveMobs || []) {
      if (mob.dead || !mob.group) continue;
      const p = mob.group.position;
      list.push({ x: p.x, y: 1.35, z: p.z, r: mob.reach || 1.2 });
    }
    return list;
  },
});
combat.setClass(classId);
hud.setClass(classId);
refreshPortrait(classId);
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
  '도훈: 하늘이 갈라집니다. 장판을 먼저 보세요.',
  '하린: 흰 원 밖으로, 노란 선 안으로.',
  '지우: 쓰러져도 노란 선에서 일어납니다.',
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
let camPitch = portrait ? 0.32 : 50 * Math.PI / 180;
let camDist = shot === 'transform' ? 4.4 : shot === 'form' ? 4.8 : 35;
let camHold = 0;
let camLock = null;
let shotLookY = null;
let shotAim = null;
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

let autoOn = false;
try { autoOn = localStorage.getItem('bw-raid-auto') === '1'; } catch { autoOn = false; }
let autoHold = 0;
const playerStats = { skills: {}, dealt: 0, healed: 0, deaths: 0, distSum: 0, distN: 0 };
let wipeT = 0;
function setAuto(on) {
  autoOn = !!on;
  try { localStorage.setItem('bw-raid-auto', autoOn ? '1' : '0'); } catch { /* storage blocked */ }
  hud.setAuto(autoOn);
}

function useSkill(id, fromAuto = false) {
  if (phase !== 'fight') return;
  const sk = combat.skill(id);
  if (!sk || sk.locked) return;
  if (sk.kind !== 'heal' && sk.kind !== 'healParty' && sk.kind !== 'stealth') faceBoss();
  const ok = combat.trySkill(id, true);
  if (ok) {
    if (!fromAuto) autoHold = 3;
    playerStats.skills[id] = (playerStats.skills[id] || 0) + 1;
    room.system(`${getClass(classId).name} · ${sk.name}`);
  }
  if (ok && sk.dash) {
    const b = home;
    const dx = b.x - actor.position.x;
    const dz = b.z - actor.position.z;
    const len = Math.hypot(dx, dz) || 1;
    combat.state.dodgeDir.x = dx / len;
    combat.state.dodgeDir.z = dz / len;
  }
}

function aimFightCamera() {
  if (portrait || camLock || shotLookY != null) return;
  const b = boss.group.position;
  camYaw = Math.atan2(b.x - actor.position.x, b.z - actor.position.z);
  camPitch = 46 * Math.PI / 180;
  camDist = 32;
}

function beginRaid(id) {
  if (phase === 'fight' || phase === 'intro') return;
  const fresh = phase === 'peace' || phase === 'victory' || phase === 'defeat';
  mountForm(id);
  combat.setClass(id);
  hud.setClass(id);
  refreshPortrait(id);
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
  aimFightCamera();
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
hud.onRepick = () => { hud.hideVictory(); hud.showPick(); };
hud.onRedeploy = () => { hud.hideVictory(); beginRaid(classId); };
hud.onAuto = () => setAuto(!autoOn);
hud.setAuto(autoOn);
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
  if (phase === 'fight' && form.group.visible) return;
  citizen.visible = false;
  form.group.visible = true;
  form.group.scale.setScalar(restScale());
  ghost.visible = false;
  phase = 'fight';
  aimFightCamera();
  hud.setMode('fight');
  for (const a of party) a.mesh.visible = true;
  if (shot === 'form') return;
  audio.playBgm('boss');
  audio.setAmbience(1);
  arena.setPhase('p1');
  city.setMood('rift');
  city.setStage(1);
  env.setPhase(1);
  hud.banner('붕괴의 거수 · 홀드');
  room.system('전투 시작. 1단계');
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

function lose() {
  if (won || phase === 'defeat') return;
  phase = 'defeat';
  hud.banner('파티가 전멸했습니다');
  room.system('파티가 전멸했습니다');
  hud.showDefeat();
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

const camRay = new THREE.Raycaster();
const fadedMeshes = new Map();
let occluderList = [];
let occluderFresh = 0;

function occluderMeshes() {
  const now = performance.now();
  if (now - occluderFresh < 400 && occluderList.length) return occluderList;
  const list = [];
  const take = (root) => {
    root?.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      list.push(o);
    });
  };
  take(boss.group);
  take(city.root);
  take(env.root);
  occluderList = list;
  occluderFresh = now;
  return list;
}

function fadeMesh(mesh) {
  const mat = mesh.material;
  if (!mat || Array.isArray(mat) || mesh.isInstancedMesh) return;
  if (!fadedMeshes.has(mesh)) {
    fadedMeshes.set(mesh, {
      opacity: mat.opacity ?? 1,
      transparent: mat.transparent,
      depthWrite: mat.depthWrite,
    });
  }
  mat.transparent = true;
  mat.opacity = 0.25;
  mat.depthWrite = false;
  mat.needsUpdate = true;
}

function restoreFaded(keep) {
  for (const [mesh, saved] of fadedMeshes) {
    if (keep?.has(mesh)) continue;
    const mat = mesh.material;
    if (mat && !Array.isArray(mat)) {
      mat.opacity = saved.opacity;
      mat.transparent = saved.transparent;
      mat.depthWrite = saved.depthWrite;
      mat.needsUpdate = true;
    }
    fadedMeshes.delete(mesh);
  }
}

function inBoss(object) {
  let node = object;
  while (node) {
    if (node === boss.group) return true;
    node = node.parent;
  }
  return false;
}

function clearCamera(desired, look) {
  const origin = actor.position.clone();
  origin.y = 3.4;
  const dir = desired.clone().sub(origin);
  const len = dir.length();
  if (len < 0.5) {
    restoreFaded();
    return desired;
  }
  dir.multiplyScalar(1 / len);
  const meshes = occluderMeshes();
  camRay.set(origin, dir);
  camRay.far = len;
  const hits = camRay.intersectObjects(meshes, false);
  let pos = desired.clone();
  if (hits.length && hits[0].distance < len - 0.5) {
    const travel = Math.max(3.2, hits[0].distance - 1.35);
    pos.copy(origin).addScaledVector(dir, Math.min(travel, len));
  }
  const home = boss.group.position;
  const dx = pos.x - home.x;
  const dz = pos.z - home.z;
  const hd = Math.hypot(dx, dz);
  const minR = 14;
  if (hd < minR) {
    const k = minR / (hd || 0.001);
    pos.x = home.x + dx * k;
    pos.z = home.z + dz * k;
    pos.y = Math.max(pos.y, 6);
  }
  let yaw = Math.atan2(pos.x - look.x, pos.z - look.z);
  const orbit = Math.hypot(pos.x - look.x, pos.z - look.z) || 8;
  for (let turn = 0; turn < 8; turn++) {
    const dir = look.clone().sub(pos);
    const span = dir.length() || 1;
    dir.multiplyScalar(1 / span);
    camRay.set(pos, dir);
    camRay.far = Math.max(0.4, span - 0.6);
    const block = camRay.intersectObjects(meshes, false).find((h) => !h.object.isInstancedMesh);
    if (!block) break;
    yaw += 0.32;
    pos.x = look.x + Math.sin(yaw) * orbit;
    pos.z = look.z + Math.cos(yaw) * orbit;
  }
  const down = new THREE.Vector3(0, -1, 0);
  for (let step = 0; step < 5; step++) {
    const probe = pos.clone();
    probe.y += 30;
    camRay.set(probe, down);
    camRay.far = 30;
    const roof = camRay.intersectObjects(meshes, false)[0];
    if (!roof || roof.point.y < pos.y + 0.6) break;
    const framed = toFrame(pos.x, pos.z);
    const next = fromFrame(framed.along, framed.across * 0.45);
    pos.x = next.x;
    pos.z = next.z;
    pos.y = Math.max(pos.y + 1.5, roof.point.y + 1.8);
  }
  const away = pos.clone().sub(look);
  if (away.lengthSq() > 0.01) away.normalize();
  else away.set(0, 1, 0);
  for (let nudge = 0; nudge < 4; nudge++) {
    const view = look.clone().sub(pos);
    const viewLen = view.length() || 1;
    view.multiplyScalar(1 / viewLen);
    camRay.set(pos, view);
    camRay.far = 2.4;
    const near = camRay.intersectObjects(meshes, false)[0];
    if (!near || near.distance > 2.1 || near.object.isInstancedMesh) break;
    pos.addScaledVector(away, 2.6 - near.distance);
  }
  const view = look.clone().sub(pos);
  const viewLen = view.length() || 1;
  view.multiplyScalar(1 / viewLen);
  camRay.set(pos, view);
  camRay.far = 1.8;
  const blocked = camRay.intersectObjects(meshes, false);
  const keep = new Set();
  for (const hit of blocked) {
    if (hit.distance > 1.6 || hit.object.isInstancedMesh) continue;
    fadeMesh(hit.object);
    keep.add(hit.object);
  }
  restoreFaded(keep);
  return pos;
}

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
  vfx.update(dt, camera);
  audio.tick(dt);
  city.update(dt);
  env.update(dt);
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
      ...party.map((a) => ({ id: a.id, hp: a.hp, down: a.vitals?.down > 0, sub: a.kind === 'tank' ? 0.7 : 0.55, debuff: false })),
    ],
  });
  if (camHold > 0) camHold = Math.max(0, camHold - dt);
  if (phase === 'fight' && shotLookY == null && !portrait && camHold <= 0) {
    const ph = boss.state?.phase;
    const big = ph === 'spawn' || ph === 'slam' || ph === 'sweep' || ph === 'charge' || ph === 'wind';
    camDist = THREE.MathUtils.damp(camDist, big ? 38 : 35, 3, dt);
  }
  const lookYaw = camYaw;
  const pitch = camPitch;
  const dist = camDist;
  const lx = Math.sin(lookYaw);
  const lz = Math.cos(lookYaw);
  const cp = Math.cos(pitch);
  camera.position.set(focus.x - lx * dist * cp, focus.y + dist * Math.sin(pitch), focus.z - lz * dist * cp);
  const bossView = (phase === 'fight' || phase === 'intro') && shotLookY == null && !portrait && !camLock;
  const aim = shotAim != null ? shotAim : shot === 'wide' ? 1.5 : portrait ? 0.1 : bossView ? 18 : 6;
  const head = form?.group?.userData?.headY;
  const lookY = shotLookY != null ? shotLookY : shot === 'wide' ? 1.15 : portrait ? (head || 1.1) : bossView ? 7 : 0.2;
  const lookTarget = new THREE.Vector3(focus.x + lx * aim, lookY, focus.z + lz * aim);
  if (camLock) {
    camera.position.set(camLock.px, camLock.py, camLock.pz);
    lookTarget.set(camLock.tx, camLock.ty, camLock.tz);
  }
  if (!portrait && !camLock) {
    camera.position.copy(clearCamera(camera.position, lookTarget));
  } else {
    restoreFaded();
  }
  camera.lookAt(lookTarget);
  syncMarks();
  flames.update(dt);
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
      hud.banner('봉인 제한 시간이 조금 늘었습니다');
    }
  }

  const st = combat.state;
  let mx = 0;
  let mz = 0;
  if (autoHold > 0) autoHold = Math.max(0, autoHold - dt);
  const manual = fighting && st.down <= 0 ? moveAxes() : null;
  if (manual) autoHold = 3;
  if (fighting && st.down <= 0) {
    if (manual) {
      mx = manual.x;
      mz = manual.z;
    } else if (autoOn && autoHold <= 0) {
      const spot = roleGoal(
        { classId, kind: ROLE_OF[classId] || 'dps', slot: 2, x: actor.position.x, z: actor.position.z, vitals: { hp: st.hp, hpMax: st.hpMax, down: st.down, cds: {}, gcd: st.gcd, rezCd: 0 }, mesh: { position: actor.position } },
        { boss: bossFrame(boss.group), now: performance.now(), zones: boss.state.zones || [], allies: party, mobs: (env.liveMobs || []).filter((m) => m.group && !m.dead).map((m) => ({ x: m.group.position.x, z: m.group.position.z })) },
      );
      const dx = spot.x - actor.position.x;
      const dz = spot.z - actor.position.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.45) { mx = dx / len; mz = dz / len; }
      const sid = chooseSkill(
        { classId, vitals: { down: 0, gcd: st.gcd, cds: Object.fromEntries(combat.skills.map((s, i) => [s.id, st.cds[i] || 0])), rezCd: 0 }, taunt: 0 },
        { distBoss: Math.hypot(actor.position.x - boss.group.position.x, actor.position.z - boss.group.position.z), inDanger: spot.dodge, allies: party },
      );
      if (sid === 'rez') {
        const downed = party.find((m) => m.vitals.down >= 6);
        if (downed) reviveMate(downed, { name: PLAYER_NAME, vitals: playerStats });
      } else if (sid) useSkill(sid, true);
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
    obstacles: env.obstacles || [],
    raiders: [
      { id: 'player', x: actor.position.x, z: actor.position.z, role: ROLE_OF[classId] || 'dps', down: st.down > 0 },
      ...party.map((a) => ({ id: a.id, x: a.mesh.position.x, z: a.mesh.position.z, role: a.kind, down: a.vitals.down > 0 })),
    ],
    onRaiderHit(id, amount, kind) {
      const mate = party.find((a) => a.id === id);
      if (mate) hurtMate(mate, amount, kind);
    },
    onPlayerHit(amount, kind) {
      const before = st.hp;
      combat.damagePlayer(amount);
      if (st.hp < before) {
        const crown = form.group.userData.crownY || 1.8;
        hud.float(asVec({ x: actor.position.x, y: crown + 0.25, z: actor.position.z }), amount, 'hurt');
        if (kind === 'add') {
          audio.playSfx('hit', { x: actor.position.x, z: actor.position.z });
          vfx.sparks(actor.position.x, crown, actor.position.z, '#FFB428', 8);
          vfx.impactBurst(actor.position.x, crown, actor.position.z);
        }
      }
    },
    onWind(kind) {
      if (kind === 'telegraph') {
        audio.playSfx('warn');
        hud.banner('열풍입니다. 흰 원 밖, 노란 선 안으로 피하세요');
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
      env.setPhase(stage);
      city.setMood('rift');
      audio.playSfx('roar', { x: boss.group.position.x, z: boss.group.position.z, big: true });
      shake = Math.max(shake, stage === 3 ? 0.62 : 0.36);
      hitStop = stage === 3 ? 0.16 : 0.1;
      hud.flash(0.4);
      const line = stage === 3 ? '광폭화!' : '홀드가 분노합니다. 다리가 무너집니다';
      if (shot !== 'vfx' && shot !== 'vfxall') hud.banner(line);
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
  if (fighting && st.down > 0 && party.length && party.every((a) => a.vitals.down > 0)) {
    wipeT += dt;
    if (wipeT > 2.4) lose();
  } else wipeT = 0;
  if (fighting) {
    playerStats.distSum += Math.hypot(actor.position.x - boss.group.position.x, actor.position.z - boss.group.position.z);
    playerStats.distN += 1;
    playerStats.dealt = st.dealt;
    playerStats.healed = st.healed;
  }

  settleParty(fighting && !boss.state.dead ? PATH_YAW : actor.rotation.y, dt, fighting && !boss.state.dead);
  if (trailOn && fighting) {
    const lx = playerTrail[playerTrail.length - 3];
    const lz = playerTrail[playerTrail.length - 1];
    const moved = playerTrail.length < 3 || Math.hypot(actor.position.x - lx, actor.position.z - lz) > 0.18;
    if (moved) playerTrail.push(actor.position.x, 0.55, actor.position.z);
    if (playerTrail.length > 2400) playerTrail.splice(0, playerTrail.length - 2400);
    playerRibbon = syncRibbon(playerRibbon, playerTrail, CLASS_TINT[classId] || '#fff', `trail-player-${classId}`);
  }

  const sk = st.attack ? combat.skill(st.attack) : null;
  const basicSwing = !!sk && (sk.kind === 'melee' || sk.id === 'shot');
  const spell = !!sk && !basicSwing && ['projectile', 'nova', 'rain', 'heal', 'healParty', 'shout', 'bind'].includes(sk.kind);
  const motion = {
    speed: moveSpeed,
    attack: st.attack,
    attackT: st.attackT,
    hit: st.hitT > 0,
    phase,
    clip: phase === 'intro' ? 'transform_in' : '',
    cast: spell,
    skill: !!sk && !spell && !basicSwing,
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
  const zoomMax = portrait ? 12 : 40;
  camHold = 3.5;
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
  if (e.code === 'KeyZ' && !e.repeat) {
    setAuto(!autoOn);
    return;
  }
  if (e.repeat) return;
  const slot = { Digit1: 0, Numpad1: 0, Digit2: 1, Numpad2: 1, Digit3: 2, Numpad3: 2, Digit4: 3, Numpad4: 3 }[e.code];
  if (slot != null) useSkill(combat.skills[slot]?.id);
  if (e.code === 'Space' && hud.cutsceneOpen()) {
    e.preventDefault();
    hud.advanceCutscene();
    return;
  }
  if (e.code === 'Space' && phase === 'fight') {
    const wish = moveAxes();
    let dx = Math.sin(actor.rotation.y);
    let dz = Math.cos(actor.rotation.y);
    if (wish) {
      dx = wish.x;
      dz = wish.z;
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
  const opening = shot === 'cutscene' || (shot !== 'alert' && !introSeen());
  audio.playBgm(opening ? 'cutscene' : 'alert');
  if (opening) hud.openCutscene();
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
  citizen.visible = false;
  form.group.visible = true;
  if (ghost) ghost.visible = false;
  form.animate(form.group, 0.2, { speed: 0, phase: 'calm' });
  form.group.updateMatrixWorld(true);
  const faceMesh = form.group.getObjectByName('player-face-mesh');
  const facePos = new THREE.Vector3();
  if (faceMesh) faceMesh.getWorldPosition(facePos);
  else facePos.set(actor.position.x, (form.group.userData.headY || 1.25) + 0.16, actor.position.z);
  const forward = new THREE.Vector3(0, 0, 1);
  if (faceMesh) forward.applyQuaternion(faceMesh.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const dist = 1.85;
  camLock = {
    px: facePos.x + forward.x * dist,
    py: facePos.y + 0.06,
    pz: facePos.z + forward.z * dist,
    tx: facePos.x,
    ty: facePos.y - 0.02,
    tz: facePos.z,
  };
  bloomOn = false;
  hud.setMode('fight');
  arena.setMood('rift', true);
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
function showKnights() {
  finishIntro();
  clearMarks('shot');
  for (const a of party) a.mesh.visible = false;
  const ids = ['warrior', 'mage', 'priest', 'archer', 'assassin'];
  ids.forEach((id, i) => {
    const g = id === classId ? form.group : cloneAnimated(packs[id].group);
    if (g.parent) g.parent.remove(g);
    scene.add(g);
    if (id !== classId) {
      extras.push(g);
      attachTrails(g, id, scene);
      const npc = NPC_POOL.find((n) => n.classId === id);
      addMark(g, npc?.name || id, id, 'shot');
    }
    const p = fromFrame(BOSS_ALONG - 11, (i - 2) * 2.2);
    g.position.set(p.x, 0, p.z);
    g.rotation.set(0, PATH_YAW, 0);
    g.visible = true;
    g.userData.shotClass = id;
  });
  const mid = fromFrame(BOSS_ALONG - 11, 0);
  actor.position.set(mid.x, 0, mid.z);
  camYaw = PATH_YAW;
  camPitch = 50 * Math.PI / 180;
  camDist = 35;
  shotLookY = null;
  shotAim = null;
  if (phase !== 'fight') finishIntro();
  hud.banner('');
  const banner = document.querySelector('#bw-raid [data-banner]');
  if (banner) banner.hidden = true;
}
function seedChat() {
  const rows = [
    ['party', '도훈', '#FF7A1A', '어그로 잡았어요, 다들 뒤쪽으로 모여요'],
    ['party', '지우', '#FFC845', '힐 들어갑니다! 흰 원 밖으로'],
    ['party', '하린', '#8C7FFF', '룬 고리 쿨 8초 남았어요'],
    ['party', '민재', '#3DDC84', '머리 쪽 약점 노출, 집중 사격!'],
    ['party', '서연', '#FF5C9A', '부활 대기 중… 10초만 버텨줘요'],
    ['party', '지우', '#FFC845', '서연님 부활 들어가요'],
  ];
  for (const [channel, name, color, text] of rows) chat.push({ channel, name, color, text, self: false, t: Date.now() });
}
function dressHud() {
  hud.caption = {
    bossFill: 0.62,
    bossPct: '62%',
    bossNum: '1,248,600 / 2,014,000',
    cast: '열풍 분사',
    castTime: '0.6',
    castPct: 55,
    warn: '열풍 분사 · 머리 앞 60°에서 벗어나기',
    warnTime: '1.2',
    playerPct: 78,
    playerNum: '18,720 / 24,000',
    resPct: 64,
    resRead: '분노 64',
    name: '도훈',
    role: '전사',
    level: '24',
    elapsed: 222,
    slots: true,
  };
  hud.setParty([
    { id: 'me', name: '도훈', role: '전사', kind: 'tank', classId: 'warrior', hp: 0.82, sub: 0.64, aggro: true, isMe: true },
    { id: 'npc-heal', name: '지우', role: '사제', kind: 'heal', classId: 'priest', hp: 0.91, sub: 0.48 },
    { id: 'npc-mage', name: '하린', role: '마법사', kind: 'dps', classId: 'mage', hp: 0.55, sub: 0.72 },
    { id: 'npc-bow', name: '민재', role: '궁수', kind: 'dps', classId: 'archer', hp: 0.34, sub: 0.86 },
    { id: 'npc-sin', name: '서연', role: '암살자', kind: 'dps', classId: 'assassin', hp: 0, sub: 0, down: true },
  ]);
  boss.hurt(Math.round(boss.state.hpMax * 0.38));
}
function midFight() {
  boss.hurt(4600);
  const b = boss.group.position;
  hud.float(new THREE.Vector3(b.x, 10, b.z), 2480, 'crit');
}
if (shot === 'fight' || shot === 'chat' || shot === 'party') {
  showKnights();
  const mid = fromFrame(BOSS_ALONG - 6, 0);
  vfx.classLook(classId, mid.x, mid.z, PATH_YAW);
  dressHud();
  seedChat();
}
if (shot === 'skill') {
  showKnights();
  const mine = extras.concat([form.group]).find((g) => g.userData.shotClass === classId) || form.group;
  const p = mine.position;
  vfx.classLook(classId, p.x + Math.sin(PATH_YAW) * 4, p.z + Math.cos(PATH_YAW) * 4, PATH_YAW);
  dressHud();
  camDist = 30;
  camPitch = 0.92;
  shotLookY = 1.4;
}
if (shot === 'skyline' || shot === 'emerge') {
  showKnights();
  camYaw = city.yaw;
  camPitch = shot === 'emerge' ? 0.22 : 0.32;
  camDist = shot === 'emerge' ? 14 : 18;
  arena.setPhase('p1', true);
  city.setMood('rift');
  city.setStage(1);
  seedChat();
}
if (shot === 'phase1') {
  placeFight(city.yaw, 0.42, 24, 14);
  arena.setPhase('p1', true);
  city.setStage(1);
  env.setPhase(1);
}
if (shot === 'phase3') {
  placeFight(city.yaw, 0.4, 26, 15);
  boss.hurt(8600);
  arena.setPhase('p3', true);
  city.setMood('rift');
  city.setStage(3);
  env.setPhase(3);
  audio.setAmbience(3);
}
if (shot === 'close') {
  placeFight(PATH_YAW, 0.5, 9, 7);
  seedChat();
}
if (shot === 'bridge' || shot === 'collapse' || shot === 'mobs') {
  showKnights();
  const along = shot === 'mobs' ? -3 : 2;
  const groups = extras.concat([form.group]);
  groups.forEach((g, i) => {
    const p = fromFrame(along, (i - 2) * 1.45);
    g.position.set(p.x, 0, p.z);
    g.rotation.set(0, PATH_YAW, 0);
    g.visible = true;
  });
  const mid = fromFrame(along, 0);
  actor.position.set(mid.x, 0, mid.z);
  boss.group.visible = false;
  boss.hideDress();
  camYaw = PATH_YAW;
  env.setDress(shot === 'collapse' ? 'collapsed' : 'bridge');
  if (shot === 'mobs') {
    env.showSpawn();
    camPitch = 0.34;
    camDist = 7;
    shotLookY = 1.4;
    shotAim = 5.5;
  } else {
    env.populateRoad();
    camPitch = 0.16;
    camDist = 14;
    shotLookY = 16;
    shotAim = 52;
  }
}
if (shot === 'mobsv2') {
  showKnights();
  const along = 2;
  const groups = extras.concat([form.group]);
  groups.forEach((g, i) => {
    const p = fromFrame(along, (i - 2) * 1.6);
    g.position.set(p.x, 0, p.z);
    g.rotation.set(0, PATH_YAW, 0);
    g.visible = true;
  });
  const mid = fromFrame(along, 0);
  actor.position.set(mid.x, 0, mid.z);
  boss.group.visible = false;
  boss.hideDress();
  env.showImpact();
  for (const mob of env.liveMobs) {
    const p = mob.group.position;
    vfx.sparks(p.x, 1.8, p.z, '#FFB428', 5);
  }
  camYaw = PATH_YAW;
  camPitch = 50 * Math.PI / 180;
  camDist = 20;
  shotLookY = 0.5;
  shotAim = 12;
}
if (shot === 'vfx' || shot === 'vfxall') {
  showKnights();
  const along = 8;
  const ids = ['warrior', 'mage', 'priest', 'archer', 'assassin'];
  const groups = extras.concat([form.group]);
  groups.forEach((g, i) => {
    const p = fromFrame(along, (i - 2) * 1.7);
    g.position.set(p.x, 0, p.z);
    g.rotation.set(0, PATH_YAW, 0);
    g.visible = true;
  });
  actor.position.set(fromFrame(along, 0).x, 0, fromFrame(along, 0).z);
  boss.hurt(Math.round(boss.state.hpMax * 0.42));
  camYaw = PATH_YAW;
  camPitch = 50 * Math.PI / 180;
  camDist = 20;
  shotLookY = 0.35;
  shotAim = 6.5;
  const fire = shot === 'vfxall' ? ids : [classId];
  for (const id of fire) {
    const g = groups.find((n) => n.userData.shotClass === id) || form.group;
    vfx.classLook(id, g.position.x, g.position.z, PATH_YAW);
  }
}
if (shot === 'slam') {
  showKnights();
  boss.forceSlam();
  vfx.slam(boss.group.position.x, boss.group.position.z);
  dressHud();
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
  THREE,
  scene,
  camera,
  renderer,
  arena,
  get actor() { return actor; },
  boss,
  env,
  vfx,
  hud,
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
  get camDist() { return camDist; },
  pad: virtualPad,
  get fps() { return fps; },
  stats() {
    return { fps: Math.round(fps), sceneDrawCalls, bloom: bloomOn };
  },
  measure: measureScene,
  debug: {
    skipIntro() { if (phase === 'intro') finishIntro(); },
    live() { return lastLive; },
    party() {
      return party.map((a) => ({
        id: a.classId,
        kind: a.kind,
        x: +a.mesh.position.x.toFixed(2),
        z: +a.mesh.position.z.toFixed(2),
        goal: a.goal ? { x: +a.goal.x.toFixed(2), z: +a.goal.z.toFixed(2) } : null,
        parent: a.mesh.parent?.type || '',
      }));
    },
    guard() {
      combat.state.iframe = 60;
      combat.state.down = 0;
      combat.state.hp = combat.state.hpMax;
    },
    look(px, py, pz, tx, ty, tz) { camLock = { px, py, pz, tx, ty, tz }; },
    unlock() { camLock = null; },
    poseKnights() {
      simPaused = true;
      const swing = (g, id) => {
        const pack = packs[id];
        if (!pack?.animate || !g) return;
        const attack = id === 'priest' ? 'heal' : id === 'mage' ? 'shard' : id === 'archer' ? 'shot' : 'slash';
        pack.animate(g, 0.36, { attack, attackT: 0.28, phase: 'fight', speed: 0 });
      };
      swing(form.group, form.group.userData.shotClass || classId);
      for (const g of extras) swing(g, g.userData.shotClass);
    },
    wind() { boss.forceWind(); },
    killBoss() { boss.hurt(boss.state.hp); },
    showDefeat() { phase = 'defeat'; hud.showDefeat(); },
    setAuto(on) { setAuto(on); },
    auto() { return { on: autoOn, hold: autoHold }; },
    fullParty() { layoutParty(classId); finishIntro(); },
    start() {
      if (phase !== 'fight' && phase !== 'intro') beginRaid(classId);
      finishIntro();
      hud.caption = null;
    },
    clearCaption() { hud.caption = null; },
    wave(n) { boss.spawnWave(n); },
    pile() { boss.pileAdds?.(); },
    adds() { return boss.addSpots?.() || []; },
    downMate(i = 0) {
      const a = party[i];
      if (!a?.vitals) return;
      a.vitals.iframe = 0;
      a.vitals.hp = 0;
      a.vitals.down = 9;
      a.vitals.deaths += 1;
      a.hp = 0;
    },
    advance(seconds = 8) {
      const was = simPaused;
      simPaused = true;
      const n = Math.max(1, Math.round(seconds / 0.05));
      for (let i = 0; i < n; i++) step(0.05);
      simPaused = was;
    },
    pause(v = true) { simPaused = v; },
    record(on = true) {
      if (!on) {
        clearTrails();
        return;
      }
      clearTrails();
      trailOn = true;
      for (const a of party) { a.record = true; a.trail = []; a._trailAcc = 0; }
    },
    portraits() {
      const out = {};
      for (const id of CLASS_IDS) out[id] = renderClassPortrait(renderer, packs[id].group, id);
      return out;
    },
    setLook(raw) {
      const next = writePlayerLook(raw);
      clearPortraitCache();
      for (const id of CLASS_IDS) {
        if (packs[id].source === 'glb') mountPlayerFace(packs[id].group, next, id);
      }
      refreshPortrait(classId);
      return next;
    },
    playerLook() { return form?.group?.userData?.playerLook || null; },
    nameplates() {
      return marks.filter((g) => g.visible && g.userData.screen).map((g) => g.userData.screen);
    },
    flat() { bloomOn = false; },
    look(px, py, pz, tx, ty, tz) {
      camLock = { px, py, pz, tx, ty, tz };
    },
    melee() {
      finishIntro();
      const b = boss.group.position;
      actor.position.set(6.33, 0, 25.22);
      actor.rotation.y = Math.atan2(b.x - actor.position.x, b.z - actor.position.z);
      if (form.group.parent !== actor) {
        form.group.parent?.remove(form.group);
        form.group.position.set(0, 0, 0);
        form.group.rotation.set(0, 0, 0);
        actor.add(form.group);
      }
      form.group.visible = true;
      citizen.visible = false;
      camLock = { px: 12.47, py: 4.29, pz: 23.41, tx: 6.33, ty: 1.43, tz: 25.22 };
      simPaused = true;
    },
    report() {
      const rows = party.map((a) => ({
        class: a.classId,
        name: a.name,
        dist: a.vitals.distN ? +(a.vitals.distSum / a.vitals.distN).toFixed(1) : 0,
        skills: a.vitals.skills,
        dealt: a.vitals.dealt,
        healed: a.vitals.healed,
        deaths: a.vitals.deaths,
        hp: +a.hp.toFixed(2),
        down: a.vitals.down > 0,
      }));
      rows.push({
        class: classId, name: PLAYER_NAME,
        dist: playerStats.distN ? +(playerStats.distSum / playerStats.distN).toFixed(1) : 0,
        skills: playerStats.skills, dealt: playerStats.dealt, healed: playerStats.healed,
        deaths: combat.state.down > 0 ? 1 : 0, hp: +(combat.state.hp / combat.state.hpMax).toFixed(2),
        down: combat.state.down > 0,
      });
      return rows;
    },
    hurtBoss(n) { boss.hurt(n); return boss.state.hp / boss.state.hpMax; },
    down() { combat.damagePlayer(9999); },
    res(n) { combat.state.res = n; },
    peace() { enterPeace(); },
  },
};
