import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createAvatar, animateAvatar, animateRide, clearRidePose } from './entities/avatar.js';
import { KakaoBikes } from './entities/bike.js';
import { openLobby } from './lobby.js';
import { openWorldGate } from './worldGate.js';
import { sanitizeLook } from './look.js';
import { NPCs, NPC_DEFS, CROWD_EXTRA } from './entities/npcs.js';
import { createAtmosphere } from './weather.js';
import { Overlay, Bubble } from './overlay.js';
import { Input } from './input.js';
import { createPresence } from './net/presence.js';
import { RemotePlayers } from './net/remotePlayers.js';
import { buildTransit, makeCrossingGuard } from './transit/transit.js';
import { mountPhone } from './phone.js';
import { mountHandset } from './handset.js';
import { mountBoard } from './board.js';
import { createSms } from './sms.js';
import { trackEvent } from './analytics.js';
import { createTerrain } from './world/terrain.js'; // [terrain]
import { Taxis } from './entities/taxis.js'; // [taxi]
import { Police } from './entities/police.js';
import { addRiversideFolk } from './entities/riversideFolk.js';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
let startLobby = null;
let lobbyQueued = false;
if (shot) document.body.classList.remove('in-gate');
else openWorldGate({ onEnter() { if (startLobby) startLobby(); else lobbyQueued = true; } });
const [data, transitData] = await Promise.all([
  fetch(import.meta.env.BASE_URL + 'jeongja.json').then((r) => r.json()),
  fetch(import.meta.env.BASE_URL + 'transit.json').then((r) => r.json()).catch(() => null),
]);
// [terrain] [taxi] 추가 데이터 (없어도 동작). ?terrain=0 이면 평평한 기존 지형, ?taxis=0 이면 택시 없음
const [terrainData, driveData] = await Promise.all([
  params.get('terrain') === '0' ? null : fetch(import.meta.env.BASE_URL + 'terrain.json').then((r) => r.json()).catch(() => null),
  params.get('taxis') === '0' ? null : fetch(import.meta.env.BASE_URL + 'drive.json').then((r) => r.json()).catch(() => null),
]);

// --- 렌더러/씬 ---
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !params.has('noshadow');
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfe3f5');
scene.fog = new THREE.Fog('#d6eef8', 400, 1800);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 5000);

// 하늘(그라데이션 돔). 색은 한국 표준시와 날씨에 맞춰 다시 칠한다.
let skyGeo;
{
  const g = new THREE.SphereGeometry(3000, 24, 12), col = [], top = new THREE.Color('#7ec4ef'), bot = new THREE.Color('#e9f6fb');
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = Math.max(0, p.getY(i) / 3000); const c = bot.clone().lerp(top, Math.pow(t, 0.6)); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  skyGeo = g;
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
}
const hemi = new THREE.HemisphereLight('#ffffff', '#c9b99a', 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e0', 2.0);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
function setShadowSpan(span) { const c = sun.shadow.camera; c.left = c.bottom = -span; c.right = c.top = span; c.near = 1; c.far = span * 4 + 600; c.updateProjectionMatrix(); }

// --- 월드 ---
const terrain = terrainData ? createTerrain(terrainData, data) : null; // [terrain]
terrain?.annotate(data); // [terrain] 도로/수면에 높이 부여 (buildWorld 전에)
const world = buildWorld(scene, data);
const overlay = new Overlay(document.getElementById('overlay'), camera);
if (terrain) { terrain.build(scene, world, overlay); world.groundY = terrain.getGroundHeight; } // [terrain] world.groundY(x,z,refY) — NPC/원격 플레이어/택시가 사용
const st = data.station;
overlay.add({ cls: 'label station', text: '🚇 정자역  신분당선 · 수인분당선', getPos: () => new THREE.Vector3(st.x, 10, st.z), maxDist: 4000 });
const LABEL_RANGE = {
  cafe: [160, 0], shop: [150, 0], mart: [170, 0], academy: [180, 0], hotel: [220, 0],
  plaza: [320, 16], public: [640, 20],
  school: [1600, 25], landmark: [1600, 25], water: [2500, 0],
};
const LABEL_PREFIX = { cafe: '☕ ', shop: '🏪 ', mart: '🛒 ', academy: '📚 ' };
for (const l of data.labels) {
  const y = l.y ?? (l.kind === 'cafe' || l.kind === 'shop' || l.kind === 'mart' || l.kind === 'academy' ? 5 : 14);
  // 아파트는 단지가 많아 면적이 클수록 멀리, 작은 오피스텔은 가까이서만. 학교·회사는 기존 랜드마크 거리.
  const [maxDist, minDist] = l.kind === 'apt'
    ? [Math.min(1100, Math.round(260 + Math.sqrt(Math.max(l.area || 400, 400)) * 3.5)), 40]
    : (LABEL_RANGE[l.kind] || [1600, 25]);
  overlay.add({ cls: 'label ' + l.kind, text: (LABEL_PREFIX[l.kind] || '') + l.text, getPos: () => new THREE.Vector3(l.x, y, l.z), maxDist, minDist });
}

// --- 플레이어 ---
const PALETTE = ['#4f7cff', '#ff6b6b', '#20c997', '#f59f00', '#845ef7', '#e64980'];
const shotColor = shot && params.has('ws') ? PALETTE[Math.floor(Math.random() * PALETTE.length)] : PALETTE[0];
const me = {
  name: params.get('name') || (shot ? '나 (김도훈)' : ''),
  look: sanitizeLook(shot ? { color: shotColor, hat: '#ffd166', bag: '#ef476f', hair: 'short', top: 'long' } : { hair: 'short', top: 'hoodie' }),
};
me.color = me.look.color;
let player = createAvatar(me.look);
let joined = shot;
player.visible = joined;
scene.add(player);
function wear(next) {
  const pos = player.position.clone(), rotY = player.rotation.y, vis = player.visible, phoneOpen = player.userData.phoneOpen;
  scene.remove(player);
  player = createAvatar(next);
  player.position.copy(pos); player.rotation.y = rotY; player.visible = vis;
  player.userData.phoneOpen = phoneOpen;
  scene.add(player);
}
const pos = new THREE.Vector3(world.signPos.x + 4, 0, world.signPos.z + 4);
for (let r = 0, a = 0; (world.isBlocked(pos.x, pos.z) || world.onRoad(pos.x, pos.z)) && r < 80; a += 0.7, r += 0.3) pos.set(world.signPos.x + Math.cos(a) * r, 0, world.signPos.z + Math.sin(a) * r);
player.position.copy(pos);
const nameTag = overlay.add({ cls: 'tag', text: me.name || '나', getPos: () => player.position.clone().setY(player.position.y + 2.15), maxDist: 60 }); // [terrain] 높이 상대
nameTag.hidden = !joined;
const myBubble = new Bubble(overlay, 'me', () => player.position.clone().setY(player.position.y + 2.7)); // [terrain]

// ?npcs=N 은 0부터 상한까지. 이름 있는 주민을 먼저 두고, 남은 수만큼 지도 전역 행인을 채운다.
const npcCap = NPC_DEFS.length + CROWD_EXTRA;
const npcParam = params.get('npcs');
const npcCount = npcParam == null ? npcCap : Math.max(0, Math.min(npcCap, Number(npcParam) || 0));
const npcs = new NPCs(scene, overlay, world, data, { count: npcCount });
const bikes = new KakaoBikes(scene, world, data);

// --- 버스/횡단보도/신호 ---
// 기본은 실서버 프록시(jeongja-bus-proxy)를 통한 실시간 모드. 실패 시 RealtimeBusSource 가 시뮬로 자동 폴백.
// ?bus=sim 이면 시뮬만. ?proxy= 로 프록시 주소를 바꾼다 (?proxy=local 이면 로컬 8788).
const DEFAULT_BUS_PROXY = import.meta.env?.VITE_BUS_PROXY_URL || 'https://jeongja-bus-proxy.xn0texn073.workers.dev';
const busParam = params.get('bus');
const proxyParam = params.get('proxy');
const busProxy = proxyParam === 'local'
  ? 'http://127.0.0.1:8788'
  : params.has('proxy')
    ? (proxyParam || '')
    : (params.has('shot') && !busParam ? '' : DEFAULT_BUS_PROXY);
const busMode = busParam === 'sim' ? 'sim' : (busParam === 'realtime' || busProxy) ? 'realtime' : 'sim';
const transit = transitData ? buildTransit(scene, transitData, world, overlay, { mode: busMode, proxy: busProxy }) : null;
if (transit) {
  npcs.guard = makeCrossingGuard(transit);
  // NPC 한 명(고양이 제외)은 역 앞 신호 횡단보도를 왕복 -> 빨간불이면 멈춰 기다림
  const sigC = transit.crossings.filter((c) => c.sig && c.w >= 9).sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z))[0];
  const idx = npcs.list.findIndex((n, i) => i > 0 && !n.def.cat);
  if (sigC && idx >= 0) {
    const [dx, dz] = sigC.dir, nx = -dz, nz = dx;
    // 같은 교차로 클러스터에서 같은 축(평행)인 횡단보도를 묶어 중앙분리대 건너편까지 이어지게
    const along = transit.crossings.filter((c) => c.sig && c.cl === sigC.cl && Math.abs(c.dir[0] * dx + c.dir[1] * dz) > 0.9 && Math.abs((c.x - sigC.x) * dx + (c.z - sigC.z) * dz) < 4)
      .map((c) => (c.x - sigC.x) * nx + (c.z - sigC.z) * nz + 0);
    const lo = Math.min(...along) - sigC.w / 2 - 5, hi = Math.max(...along) + sigC.w / 2 + 5;
    npcs.assignPath(idx, [[sigC.x + nx * lo, sigC.z + nz * lo], [sigC.x + nx * hi, sigC.z + nz * hi]]);
  }
}
// [terrain] 산책하는 NPC 한 명은 가까운 탄천 계단으로 내려가 둔치를 걷다 돌아옴
if (terrain) {
  const route = terrain.riversideRoute(st.x, st.z);
  const wi = npcs.list.findIndex((n, i) => i >= 5 && !n.def.cat); // 기본 7명 중 '산책하는 동네 주민'
  if (route && wi >= 0) npcs.assignPath(wi, route);
}
// [taxi] 시뮬레이션 택시 (?taxis=N, 기본 24, ?taxis=0 끔)
const taxiCount = params.get('taxis') === '0' ? 0 : Math.max(0, Math.min(80, Number(params.get('taxis') || 24) || 24));
const taxis = taxiCount ? new Taxis(scene, overlay, { drive: driveData, data, transit, world, count: taxiCount }) : null;
const police = params.get('police') === '0' ? null : new Police(scene, overlay, { drive: driveData, data, transit, world, count: 2 });
const riverFolk = terrain ? addRiversideFolk(scene, overlay, terrain, world, st) : null;

// --- 멀티플레이 프레즌스(지금은 목업, ?ws=URL 이면 실서버) ---
const presence = createPresence({ station: st });
if (npcs.guard) presence.setGuard?.(npcs.guard);
const remotes = new RemotePlayers(scene, overlay, presence, () => player.position, (t) => myBubble.say(t, 6000), terrain?.getGroundHeight); // [terrain] 원격 플레이어도 지형 높이
const statusEl = document.getElementById('presence-status');
presence.on('status', (s) => {
  if (!statusEl) return;
  if (!s) {
    statusEl.innerHTML = '';
    statusEl.className = '';
    return;
  }
  const m = String(s).match(/^(현재 접속자\s*)(\d+명)$/);
  if (m) {
    statusEl.className = 'is-live';
    statusEl.innerHTML = `<span class="live-dot" aria-hidden="true"></span><span class="live-label">${m[1]}</span><strong class="live-count">${m[2]}</strong>`;
  } else {
    statusEl.className = /끊김|재시도/.test(s) ? 'is-warn' : 'is-wait';
    statusEl.innerHTML = `<span class="live-dot" aria-hidden="true"></span><span class="live-label">${s}</span>`;
  }
});
const sms = createSms();
const handset = mountHandset({ sms });
const board = mountBoard({ sms, getMe: () => me });
function applySession(session) {
  const place = session?.place;
  if (!place) return;
  player.position.set(place.x, place.y, place.z);
  player.rotation.y = place.ry || 0;
}
const leaveBtn = document.getElementById('btn-leave');
leaveBtn.hidden = !joined;
startLobby = () => {
  document.body.classList.remove('in-gate');
  document.body.classList.add('in-lobby');
  openLobby({ sms, onJoin(name, look, session) {
    me.name = name; me.color = look.color; me.look = look;
    wear(look); applySession(session); player.visible = true; nameTag.hidden = false; nameTag.el.textContent = name;
    document.body.classList.remove('in-lobby');
    leaveBtn.hidden = false;
    handset.signIn();
    presence.connect(me); joined = true;
    trackEvent('world_join', { has_pin: !!session?.hasPin, resumed: !!session?.place });
  } });
};
if (lobbyQueued) startLobby();
if (joined) presence.connect(me);

// --- 채팅 ---
const chatForm = document.getElementById('chat'), chatInput = document.getElementById('chat-input');
chatForm.addEventListener('submit', (e) => {
  e.preventDefault(); const text = chatInput.value.trim(); if (!text) return chatInput.blur();
  myBubble.say(text, 6000); presence.sendChat(text); chatInput.value = ''; chatInput.blur();
});

// --- 입력/카메라 ---
const input = new Input(renderer.domElement);
const cam = { yaw: Math.PI * 0.85, pitch: 0.32, dist: 14, mode: params.get('view') === 'overview' ? 'overview' : 'follow' };
const viewBtn = document.getElementById('btn-view');
const setMode = (m) => { cam.mode = m; viewBtn.textContent = m === 'overview' ? '🚶 걸어다니기' : '🗺️ 위에서 보기'; setShadowSpan(m === 'overview' ? 750 : 90); scene.fog.near = m === 'overview' ? 1500 : 350; scene.fog.far = m === 'overview' ? 4500 : 1600; };
setMode(cam.mode);
viewBtn.onclick = () => setMode(cam.mode === 'overview' ? 'follow' : 'overview');

const helpEl = document.querySelector('#hud .help');
const HELP_WALK = helpEl.textContent;
const HELP_RIDE = '카카오바이크 · W 전진 · S 브레이크 · A/D 회전 · Shift 빠르게 · E 내리기';
const rideBtn = document.getElementById('ride-btn');
const RIDE_Y = 0.16;
let rideUi = '';
function seatPlayer() {
  const b = bikes.riding;
  const back = 0.12;
  player.position.set(b.x - Math.sin(b.ry) * back, (b.y || 0) + RIDE_Y, b.z - Math.cos(b.ry) * back);
  player.rotation.y = b.ry;
}
function dismountBike() {
  const b = bikes.riding;
  if (!b) return;
  clearRidePose(player);
  const fx = Math.sin(b.ry), fz = Math.cos(b.ry);
  const spots = [[b.x + fz * 0.95, b.z - fx * 0.95], [b.x - fz * 0.95, b.z + fx * 0.95], [b.x - fx * 0.8, b.z - fz * 0.8]];
  let spot = null;
  for (const [x, z] of spots) if (!world.isBlocked(x, z) && !bikes.blocks(x, z, b, b.y)) { spot = [x, z]; break; }
  bikes.dismount();
  const x = spot ? spot[0] : b.x, z = spot ? spot[1] : b.z;
  player.position.set(x, terrain ? terrain.getGroundHeight(x, z, b.y) : 0, z);
}
function toggleRide() {
  if (!joined) return;
  if (bikes.riding) { dismountBike(); return; }
  const b = bikes.nearest(player.position.x, player.position.z, undefined, player.position.y);
  if (!b) return;
  bikes.mount(b);
  seatPlayer();
  animateRide(player, 0, 0);
}
function syncRideUi() {
  const near = joined && !bikes.riding && bikes.nearest(player.position.x, player.position.z, undefined, player.position.y);
  const mode = bikes.riding ? 'ride' : near ? 'near' : '';
  if (mode === rideUi) return;
  rideUi = mode;
  rideBtn.hidden = !mode;
  rideBtn.textContent = mode === 'ride' ? '🚲 내리기 (E)' : '🚲 카카오바이크 타기 (E)';
  helpEl.textContent = mode === 'ride' ? HELP_RIDE : HELP_WALK;
}
rideBtn.addEventListener('click', toggleRide);
document.getElementById('btn-home').onclick = () => {
  if (bikes.riding) dismountBike();
  player.position.copy(pos);
  setMode('follow');
  rememberPlace(true);
};
leaveBtn.onclick = () => {
  if (!joined) return;
  if (bikes.riding) dismountBike();
  rememberPlace(true);
  board.close();
  handset.close();
  joined = false;
  player.visible = false;
  nameTag.hidden = true;
  myBubble.item.hidden = true;
  presence.close();
  leaveBtn.hidden = true;
  rideUi = '';
  rideBtn.hidden = true;
  helpEl.textContent = HELP_WALK;
  startLobby?.();
};
input.onKey = (e) => {
  if (e.code === 'KeyM') viewBtn.onclick();
  if (e.code === 'KeyH') document.getElementById('btn-home').onclick();
  if (e.code === 'Enter') { e.preventDefault(); chatInput.focus(); }
  if (e.code === 'KeyE' && !e.repeat) toggleRide();
};
const ov = { yaw: 0.35, pitch: 0.95, dist: 1000 };
const phone = mountPhone({ data });

let placeAt = 0, placeMark = '';
function rememberPlace(force = false) {
  if (!joined || sms.off || !sms.session) return;
  const p = player.position;
  const here = `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)},${player.rotation.y.toFixed(2)}`;
  const now = performance.now();
  if (!force && (now - placeAt < 8000 || here === placeMark)) return;
  placeAt = now; placeMark = here;
  if (sms.session) sms.session.place = { x: p.x, y: p.y, z: p.z, ry: player.rotation.y };
  sms.savePlace({ x: p.x, y: p.y, z: p.z, ry: player.rotation.y });
}
addEventListener('pagehide', () => rememberPlace(true));
addEventListener('beforeunload', () => rememberPlace(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') rememberPlace(true);
});

const atmosphere = createAtmosphere({
  scene, sun, hemi, skyGeo,
  getMode: () => cam.mode,
  clock: document.getElementById('hud-clock'),
});
const timer = new THREE.Timer();
const tmp = new THREE.Vector3();
let moveSpeed = 0;
function frame() {
  timer.update(); const dt = Math.min(timer.getDelta(), 0.1);
  if (document.body.classList.contains('in-gate') || document.body.classList.contains('in-lobby')) {
    input.consumeLook();
    requestAnimationFrame(frame);
    return;
  }
  const [dy, dp, dz] = input.consumeLook();
  if (cam.mode === 'follow') {
    // pitch +: 내려다보기, -: 올려다보기. ±90° 직전에서 멈춰 시점이 뒤집히지 않게 한다.
    cam.yaw += dy; cam.pitch = THREE.MathUtils.clamp(cam.pitch + dp, -1.2, 1.45); cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + dz), 4, 120);
  } else { ov.yaw += dy; ov.pitch = THREE.MathUtils.clamp(ov.pitch + dp, 0.08, 1.5); ov.dist = THREE.MathUtils.clamp(ov.dist * (1 + dz), 150, 2500); }

  // 이동. 걸을 때는 카메라 기준, 바이크는 핸들(W 전진 · A/D 회전). 건물 안으로는 못 들어감.
  const { f, s, run } = input.axes();
  moveSpeed = 0;
  if (joined && bikes.riding) {
    const b = bikes.riding;
    const turn = 2.5 / (1 + Math.abs(bikes.speed) * 0.09);
    b.ry -= s * turn * dt;
    if (Math.abs(f) < 0.05) {
      bikes.speed *= Math.max(0, 1 - 2.2 * dt);
      if (Math.abs(bikes.speed) < 0.12) bikes.speed = 0;
    } else {
      const want = f > 0 ? (run ? 13.5 : 8.6) * Math.min(1, f) : -2.3 * Math.min(1, -f);
      const rate = f > 0 ? 10 : 16;
      const d = want - bikes.speed;
      bikes.speed += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    }
    const mx = Math.sin(b.ry), mz = Math.cos(b.ry);
    const dist = bikes.speed * dt;
    const steps = Math.max(1, Math.ceil(Math.abs(dist) / 0.35));
    const h = dist / steps;
    const bb = world.bounds;
    for (let i = 0; i < steps; i++) {
      const nx = THREE.MathUtils.clamp(b.x + mx * h, bb.x0, bb.x1);
      const nz = THREE.MathUtils.clamp(b.z + mz * h, bb.z0, bb.z1);
      let yx = null, yz = null;
      const xOk = !world.isBlocked(nx, b.z, 0.4) && !bikes.blocks(nx, b.z, b, b.y) && (!terrain || (yx = terrain.canMove(b.x, b.z, b.y, nx, b.z)) != null);
      const zOk = !world.isBlocked(b.x, nz, 0.4) && !bikes.blocks(b.x, nz, b, b.y) && (!terrain || (yz = terrain.canMove(b.x, b.z, b.y, b.x, nz)) != null);
      if (xOk) { b.x = nx; if (terrain) b.y = yx; }
      if (zOk) { b.z = nz; if (terrain) b.y = yz; }
      if (!xOk && !zOk) { bikes.speed = 0; break; }
    }
    bikes.place(b);
    seatPlayer();
    moveSpeed = Math.abs(bikes.speed);
    player.userData.phoneOpen = false;
    animateRide(player, moveSpeed, dt);
    bikes.spin(dt);
  } else {
    if (joined && (f || s)) {
      const yaw = cam.mode === 'follow' ? cam.yaw : ov.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
      let mx = fx * f + rx * s, mz = fz * f + rz * s; const L = Math.hypot(mx, mz); mx /= L; mz /= L;
      const sp = (run ? 9 : 4.2) * Math.min(1, Math.hypot(f, s)), step = sp * dt;
      const p = player.position, bb = world.bounds;
      const nx = THREE.MathUtils.clamp(p.x + mx * step, bb.x0, bb.x1), nz = THREE.MathUtils.clamp(p.z + mz * step, bb.z0, bb.z1);
      if (terrain) { // [terrain] 계단/경사/다리 판정 + 높이 따라가기 (축별 슬라이딩 유지)
        let y;
        if (!world.isBlocked(nx, p.z) && !bikes.blocks(nx, p.z, null, p.y) && (y = terrain.canMove(p.x, p.z, p.y, nx, p.z)) != null) { p.x = nx; p.y = y; }
        if (!world.isBlocked(p.x, nz) && !bikes.blocks(p.x, nz, null, p.y) && (y = terrain.canMove(p.x, p.z, p.y, p.x, nz)) != null) { p.z = nz; p.y = y; }
      } else {
        if (!world.isBlocked(nx, p.z) && !bikes.blocks(nx, p.z, null, p.y)) p.x = nx;
        if (!world.isBlocked(p.x, nz) && !bikes.blocks(p.x, nz, null, p.y)) p.z = nz;
      }
      const target = Math.atan2(mx, mz);
      player.rotation.y += Math.atan2(Math.sin(target - player.rotation.y), Math.cos(target - player.rotation.y)) * Math.min(1, dt * 12);
      moveSpeed = sp;
    }
    if (!terrain && player.position.y !== 0) player.position.y = 0; // [terrain] 지형이 있으면 둔치 높이를 유지
    player.userData.phoneOpen = handset.open;
    animateAvatar(player, moveSpeed, dt);
  }
  syncRideUi();
  if (joined) presence.sendState({ x: player.position.x, z: player.position.z, ry: player.rotation.y, moving: moveSpeed > 0 });
  rememberPlace();

  npcs.update(dt, player.position);
  transit?.update(dt, player.position);
  taxis?.update(dt); // [taxi]
  police?.update(dt, player.position, { riding: !!bikes.riding });
  riverFolk?.update(dt, player.position);
  remotes.update(dt);
  myBubble.tick();

  // 카메라
  const P = player.position;
  if (cam.mode === 'follow') {
    // 가슴 높이 피벗을 공전하고, 시선은 피벗을 지나 앞쪽으로 보낸다.
    // 그래서 좌우는 한 바퀴, 위는 하늘, 아래는 바닥까지 화면 가운데로 들어온다.
    const eye = P.y + 1.6, yaw = cam.yaw, pitch = cam.pitch, dist = cam.dist;
    const bx = Math.sin(yaw), bz = Math.cos(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), aim = 4;
    const camX = P.x + bx * dist * cp, camZ = P.z + bz * dist * cp;
    const camFloor = terrain ? 1.2 + terrain.renderHeight(camX, camZ) : 0.45; // [terrain] 카메라가 제방 속으로 안 들어가게
    camera.position.set(camX, Math.max(camFloor, eye + dist * sp), camZ);
    camera.lookAt(P.x - bx * aim * cp, eye - aim * sp, P.z - bz * aim * cp); // [terrain] 시선 기준 높이는 P.y + 1.6
    sun.target.position.copy(P);
  } else {
    const c = new THREE.Vector3(st.x, 0, st.z + 60);
    tmp.set(Math.sin(ov.yaw) * Math.cos(ov.pitch), Math.sin(ov.pitch), Math.cos(ov.yaw) * Math.cos(ov.pitch)).multiplyScalar(ov.dist);
    camera.position.copy(c).add(tmp); camera.lookAt(c);
    sun.target.position.copy(c);
  }
  const viewYaw = cam.mode === 'follow' ? cam.yaw : ov.yaw;
  const moveYaw = player.rotation.y + (bikes.riding && bikes.speed < -0.2 ? Math.PI : 0);
  phone.tick({
    x: player.position.x, z: player.position.z, dt,
    moving: moveSpeed > 0.25,
    moveYaw, lookYaw: Math.atan2(-Math.sin(viewYaw), -Math.cos(viewYaw)),
  });
  atmosphere.update(dt, camera);
  sun.position.copy(sun.target.position).addScaledVector(atmosphere.sunDir, 500);
  renderer.render(scene, camera);
  overlay.update(innerWidth, innerHeight);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
requestAnimationFrame(frame);

// 스크린샷/디버그용 훅
window.__jj = {
  ready: true, data, world, npcs, transit, camera, cam, ov, setMode, terrain, taxis, police, weather: atmosphere, // [terrain] [taxi]
  get player() { return player; },
  teleport(x, z, y) { if (bikes.riding) dismountBike(); player.position.set(x, y ?? (terrain ? terrain.getGroundHeight(x, z, 0) : 0), z); }, // [terrain]
  bikes, toggleRide,
  nearNpc(i = 0, d = 3) { const n = npcs.list[i]; player.position.set(n.pos.x + d, 0, n.pos.z + d * 0.5); },
};
