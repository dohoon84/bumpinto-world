import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createAvatar, animateAvatar, animateRide, clearRidePose } from './entities/avatar.js';
import { KakaoBikes } from './entities/bike.js';
import { openLobby, getEnterScreen } from './lobby.js';
import { openWorldGate, isStarbaseLive } from './worldGate.js';
import { getCurrentRegion, getRegion, navigateToRegion } from './regions/index.js';
import { isEn, tr, toggleLang, onLangChange } from './i18n.js';
import { sanitizeLook, readSavedPassport, isPassportActive, setPassportActive } from './look.js';
import { NPCs, getNpcCapForRegion } from './entities/npcs.js';
import { createAtmosphere } from './weather.js';
import { Overlay, Bubble } from './overlay.js';
import { EMOTE_LIST, EMOTE_BY_ID, EMOTE_BY_CODE, EmoteFX } from './emotes.js';
import { Input } from './input.js';
import { createPresence } from './net/presence.js';
import { RemotePlayers } from './net/remotePlayers.js';
import { CHAT_RADIUS } from './net/protocol.js';
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
import { addStationPlaza } from './world/stationPlaza.js';
import { mountDonationBillboards } from './world/donationBillboard.js';
import { mountUmbrellaSystem } from './entities/umbrellaVendor.js';
import { addDogPark } from './world/dogPark.js';
import { mountStationCafe, updateStarbucksDoor } from './world/starbucksGlass.js';
import { addTrashBins } from './world/trashBins.js';
import { addStrayCats } from './world/strayCats.js';
import { createRoadsterShow } from './events/roadsterShow.js';
import { createTowerAddon } from './entities/towerAddon.js';
import { createLaunchShow } from './events/launchShow.js';
import { createTrucks } from './entities/trucks.js';
import { createAdminBike } from './entities/adminCruiser/adminBike.js'; // [bike]
import { createRoadBike, ROADBIKE_GIFT_ID, ROADBIKE_WHITE_GIFT_ID, ROADBIKE_WHITE_VEH_ID } from './entities/roadBike/roadBike.js'; // [roadbike]
import { GIFT_ITEMS, giftItem, giftUnit } from './gifts/catalog.js';
import { holdingQty, onHoldings, replaceHoldings, setHoldingQty } from './gifts/holdings.js';
import { mountInventory } from './inventory.js'; // [inventory]
import { loadCorridorData, createCorridor, corridorTerrainData } from './corridor/index.js'; // [corridor]
import { mountTravel } from './corridor/travel.js'; // [corridor]
import { mountPerfHud } from './corridor/perfHud.js'; // [corridor]

const params = new URLSearchParams(location.search);
const region = getCurrentRegion();
const shot = params.has('shot');
const autoEnter = params.get('enter') === '1';
const passportEnter = params.get('passport') === '1';
const fromRegionId = params.get('from');
const fromRegion = fromRegionId && fromRegionId !== region.id ? getRegion(fromRegionId) : null;
if (autoEnter || passportEnter || fromRegionId) {
  const cleanUrl = new URL(location.href);
  cleanUrl.searchParams.delete('enter');
  cleanUrl.searchParams.delete('passport');
  cleanUrl.searchParams.delete('from');
  history.replaceState(null, '', cleanUrl.toString());
}
function getFlightLines(targetRegion) {
  if (isEn()) return targetRegion.enFlightLines || targetRegion.flightLines || targetRegion.enLobbyEnterLines;
  return targetRegion.flightLines || targetRegion.lobbyEnterLines;
}
let arrivalFlightScreen = null;
if (fromRegion && !shot) {
  arrivalFlightScreen = getEnterScreen();
  arrivalFlightScreen.show(getFlightLines(region), {
    flight: { from: fromRegion, to: region },
    minMs: 3400,
    startProgress: 0.22,
  });
}
let startLobby = null;
let joinWithPassport = null;
let lobbyQueued = false;
let passportQueued = false;
const handleGateEnter = (chosenRegionId = region.id) => {
  const hasPassport = isPassportActive();
  if (chosenRegionId && chosenRegionId !== region.id) {
    const targetRegion = getRegion(chosenRegionId);
    const screen = getEnterScreen();
    screen.show(getFlightLines(targetRegion), {
      flight: { from: region, to: targetRegion },
      minMs: 3400,
    });
    setTimeout(() => {
      navigateToRegion(chosenRegionId, {
        ...(hasPassport ? { passport: 1 } : { enter: 1 }),
        from: region.id,
      });
    }, 850);
    return;
  }
  if (hasPassport) {
    if (joinWithPassport) joinWithPassport();
    else passportQueued = true;
    return;
  }
  if (startLobby) startLobby();
  else lobbyQueued = true;
};
const isLocalEnv = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.hostname.endsWith('.local');
const lockedBeforeOpen = region.id === 'starbase' && !isStarbaseLive() && !isLocalEnv && !shot;
if (shot) document.body.classList.remove('in-gate');
else if (lockedBeforeOpen) openWorldGate({ onEnter: handleGateEnter });
else if (passportEnter && readSavedPassport()) passportQueued = true;
else if (autoEnter) lobbyQueued = true;
else openWorldGate({ onEnter: handleGateEnter });

const worldFile = region.dataFiles?.world || 'jeongja.json';
const transitFile = region.features?.transit ? region.dataFiles?.transit : null;
const terrainFile = region.dataFiles?.terrain;
const driveFile = region.dataFiles?.drive;

const [data, transitData] = await Promise.all([
  fetch(import.meta.env.BASE_URL + worldFile).then((r) => r.json()),
  transitFile ? fetch(import.meta.env.BASE_URL + transitFile).then((r) => r.json()).catch(() => null) : Promise.resolve(null),
]);
// [terrain] [taxi] 추가 데이터 (없어도 동작). ?terrain=0 이면 평평한 기존 지형, ?taxis=0 이면 택시 없음
const corridorDir = region.features?.corridor && params.get('corridor') !== '0' ? region.dataFiles?.corridor : null; // [corridor] ?corridor=0 이면 정자만
const [terrainData, driveData, corridorData] = await Promise.all([
  !terrainFile || params.get('terrain') === '0' ? null : fetch(import.meta.env.BASE_URL + terrainFile).then((r) => r.json()).catch(() => null),
  !driveFile || params.get('taxis') === '0' ? null : fetch(import.meta.env.BASE_URL + driveFile).then((r) => r.json()).catch(() => null),
  corridorDir ? loadCorridorData(import.meta.env.BASE_URL + corridorDir) : null,
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
const terrain = terrainData ? createTerrain(corridorTerrainData(terrainData, corridorData), data) : null; // [terrain] [corridor] 코리더 켜짐: 탄천 축 연장
terrain?.annotate(data); // [terrain] 도로/수면에 높이 부여 (buildWorld 전에)
const tower = region.features?.launchTower && params.get('tower') !== '0' ? createTowerAddon(data) : null; // [tower] buildWorld 전에 _skip 마킹
const world = buildWorld(scene, data, region);
tower?.build(scene, renderer); // [tower] 발사탑 1·2기(메카질라), 스타십 풀스택, 부스터 캐치, OLM, 탱크 팜 생성
const overlay = new Overlay(document.getElementById('overlay'), camera);
const corridorClock = { simTime: () => null };
// [corridor] 정자 → 롯데월드타워 코리더: 탄천 구간 도로는 terrain.build 전에 annotate 해야 다리 구조물이 같이 생긴다
const corridor = corridorData ? createCorridor({ scene, corridorData, terrain, world, renderer, overlay, params, getSimTime: () => corridorClock.simTime() }) : null;
if (terrain) { terrain.build(scene, world, overlay); world.groundY = terrain.getGroundHeight; }
if (corridor) {
  corridor.afterTerrain();
  const liveBlocked = world.isBlocked, liveOnRoad = world.onRoad;
  world.isBlocked = (x, z, r) => liveBlocked(x, z, r) || corridor.isBlocked(x, z, r);
  world.onRoad = (x, z) => liveOnRoad(x, z) || corridor.onRoad(x, z);
} // [terrain] world.groundY(x,z,refY) — NPC/원격 플레이어/택시가 사용
const st = data.station;
overlay.add({
  cls: 'label station',
  text: region.stationOverlayText || (st.name === 'Starbase' ? '🚀 Starbase' : '🚇 정자역  신분당선 · 수인분당선'),
  getPos: () => new THREE.Vector3(st.x, 10, st.z),
  maxDist: 4000,
});
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
  name: params.get('name') || (shot ? (isEn() ? 'Explorer' : '나 (김도훈)') : ''),
  look: sanitizeLook(shot ? { color: shotColor, hat: '#ffd166', bag: '#ef476f', hair: 'short', top: 'long' } : { hair: 'short', top: 'hoodie' }),
};
me.color = me.look.color;
let player = createAvatar(me.look);
let joined = shot;
player.visible = joined;
scene.add(player);
function wear(next) {
  const pos = player.position.clone(), rotY = player.rotation.y, vis = player.visible, phoneOpen = player.userData.phoneOpen, umb = player.userData.umbrella || '';
  const cup = player.userData.coffee || '';
  scene.remove(player);
  player = createAvatar(next);
  player.position.copy(pos); player.rotation.y = rotY; player.visible = vis;
  player.userData.phoneOpen = phoneOpen;
  player.userData.umbrella = umb;
  player.userData.coffee = cup;
  scene.add(player);
}
const pos = new THREE.Vector3(world.signPos.x + 4, 0, world.signPos.z + 4);
for (let r = 0, a = 0; (world.isBlocked(pos.x, pos.z) || world.onRoad(pos.x, pos.z)) && r < 80; a += 0.7, r += 0.3) pos.set(world.signPos.x + Math.cos(a) * r, 0, world.signPos.z + Math.sin(a) * r);
player.position.copy(pos);
const nameTag = overlay.add({
  cls: 'tag',
  text: me.name || '나',
  getPos: () => player.position.clone().setY(player.position.y + (player.userData.jumpY || 0) + (player.userData.sit || player.userData.afk ? 1.55 : 2.15)),
  maxDist: 60,
}); // [terrain] 높이 상대
nameTag.hidden = !joined;
const myBubble = new Bubble(overlay, 'me', () => player.position.clone().setY(player.position.y + (player.userData.jumpY || 0) + (player.userData.sit || player.userData.afk ? 2.15 : 2.7)), {
  getName: () => me.name || '나',
  getColor: () => me.color || '#4f7cff',
}); // [terrain]
const stationCafe = world.starbucksRooms?.door
  ? mountStationCafe(world.starbucksRooms.door)
  : { update() {}, order() {}, near: false, bind() {} };
stationCafe.bind((id, outside) => stationCafe.order(player, (line) => myBubble.say(line, 3200), id, outside));

// ?npcs=N 은 0부터 상한까지. 이름 있는 주민을 먼저 두고, 나머지는 출퇴근·점심에 맞춰 켠다.
const npcCap = getNpcCapForRegion(region.id);
const npcParam = params.get('npcs');
const npcCount = npcParam == null ? npcCap : Math.max(0, Math.min(npcCap, Number(npcParam) || 0));
const npcs = new NPCs(scene, overlay, world, data, { count: npcCount, terrain, region });
const bikes = new KakaoBikes(scene, world, data);

// [roadster] 스타베이스 지역일 때 발사탑 남쪽 약 350m 빈터 (2730, -280) 에 로드스터 점프 쇼 무대 생성 (?roadster=0 으로 끔)
const playerProxy = {
  get position() { return player.position; },
  get rotation() { return player.rotation; },
  get visible() { return player.visible; },
  set visible(v) { player.visible = v; },
  get userData() { return player.userData; },
};
const roadster = region.features?.roadsterShow && params.get('roadster') !== '0'
  ? createRoadsterShow({ scene, overlay, player: playerProxy, camera, sun, params })
  : null;
const launch = tower && region.features?.launchShow
  ? createLaunchShow({ scene, overlay, player: playerProxy, camera, sun, params, tower, roadster, world })
  : null;

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
  corridorClock.simTime = () => transit.simTime; // [corridor] 코리더 신호등도 같은 시계
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
// [taxi] 시뮬레이션 택시 (?taxis=N, 기본 24, ?taxis=0 끔) — 택시 활성화 지역에서만
const taxiCount = !region.features?.taxis || params.get('taxis') === '0'
  ? 0
  : Math.max(0, Math.min(80, Number(params.get('taxis') || 24) || 24));
const taxis = taxiCount ? new Taxis(scene, overlay, { drive: driveData, data, transit, world, count: taxiCount }) : null;
const police = !region.features?.taxis || params.get('police') === '0'
  ? null
  : new Police(scene, overlay, { drive: driveData, data, transit, world, count: 2 });
const riverFolk = terrain ? addRiversideFolk(scene, overlay, terrain, world, st) : null;
const noopModule = {
  blocks: () => false,
  update() {},
  findSeat: () => null,
  closeModal() {},
  isNear: false,
  nearGate: false,
  toggleGate() {},
  bindCallbacks() {},
  onPlayerEmote() {},
  handleHotkeyU() {},
  umbrellaTheme: '',
};
const stationPlaza = region.features?.stationPlaza ? addStationPlaza(scene, overlay, world) : noopModule;
const dogPark = region.features?.dogPark ? addDogPark(scene, overlay, terrain) : noopModule;
const strayCats = region.features?.strayCats && terrain
  ? addStrayCats(scene, overlay, terrain, world, st, dogPark.bounds || null, data)
  : noopModule;
const donationBoards = region.features?.stationPlaza
  ? mountDonationBillboards({ scene, overlay, world, camera, domElement: renderer.domElement })
  : noopModule;
const cam = { yaw: Math.PI * 0.85, pitch: 0.32, dist: 14, mode: params.get('view') === 'overview' ? 'overview' : 'follow' };
const atmosphere = createAtmosphere({
  scene, sun, hemi, skyGeo,
  getMode: () => cam.mode,
  clock: document.getElementById('hud-clock'),
  region,
});
npcs.setCrowdLevel(atmosphere.state.rush || 'normal');
let rushNow = atmosphere.state.rush || 'normal';

// --- 멀티플레이 프레즌스(지금은 목업, ?ws=URL 이면 실서버) ---
const emoteFx = new EmoteFX(scene, document.getElementById('overlay'), camera);
const umbrellas = region.features?.umbrellas
  ? mountUmbrellaSystem({
      scene,
      overlay,
      world,
      terrain,
      weather: atmosphere,
      emoteFx,
      onUmbrellaChange(holding) {
        player.userData.umbrella = holding;
        emitMyStateNow();
      },
    })
  : noopModule;
{
  const origBlocked = world.isBlocked;
  world.isBlocked = (x, z, r) =>
    origBlocked(x, z, r) ||
    stationPlaza.blocks(x, z) ||
    dogPark.blocks(x, z) ||
    donationBoards.blocks(x, z) ||
    umbrellas.blocks(x, z) ||
    !!world.starbucksRooms?.door?.blocks?.(x, z, r);
}
const trashBins = region.id === 'jeongja'
  ? addTrashBins(scene, overlay, world, world.starbucksRooms?.door || null)
  : { near: () => null, blocks: () => false, bins: [] };
{
  const withBins = world.isBlocked;
  world.isBlocked = (x, z, r) => withBins(x, z, r) || trashBins.blocks(x, z);
}
const presence = createPresence({ station: st, region });
if (npcs.guard) presence.setGuard?.(npcs.guard);
const remotes = new RemotePlayers(scene, overlay, presence, () => player.position, (t) => myBubble.say(t, 6000), terrain?.getGroundHeight, emoteFx); // [terrain] 원격 플레이어도 지형 높이
// [bike] 관리자 크루저 (인벤토리에서 어느 지역이든 소환/수납 가능, ?bike=0 끔)
let canRideAdminBike = () => false;
let getAdminBikeTank = () => 'red';
let inventory = null;
let roadbike = null;
let roadbikeWhite = null;
function roadRiding() { return !!(roadbike?.riding || roadbikeWhite?.riding); }
function roadMount() { return roadbike?.riding ? roadbike : (roadbikeWhite?.riding ? roadbikeWhite : null); }
function stowRoadbikes() {
  if (roadbike?.summoned || roadbike?.riding) roadbike.stow();
  if (roadbikeWhite?.summoned || roadbikeWhite?.riding) roadbikeWhite.stow();
}
function dismountRoadbikes() {
  if (roadbike?.riding) roadbike.dismount();
  if (roadbikeWhite?.riding) roadbikeWhite.dismount();
}
const adminBike = params.get('bike') !== '0'
  ? createAdminBike({
      scene, overlay, world, data, params, cam, player: playerProxy, renderer, terrain, presence, remotes, spawn: pos,
      getTrucks: () => trucks,
      getRoadBike: () => ({
        get riding() { return roadRiding(); },
        near: () => !!(roadbike?.near?.() || roadbikeWhite?.near?.()),
      }),
      camera, // [bikeaudio]
      canRide: () => canRideAdminBike(),
      getTankColor: () => getAdminBikeTank(),
      onChange: () => { inventory?.refresh(); emitMyStateNow(); },
    })
  : null;
roadbike = params.get('roadbike') !== '0'
  ? createRoadBike({
      scene, overlay, world, data, params, cam, player: playerProxy, renderer, terrain, presence, remotes,
      getTrucks: () => trucks,
      colorway: 'black',
      label: '🚲 CR·1',
      onChange: () => { inventory?.refresh(); emitMyStateNow(); },
    })
  : null;
roadbikeWhite = params.get('roadbike') !== '0'
  ? createRoadBike({
      scene, overlay, world, data, params, cam, player: playerProxy, renderer, terrain, presence, remotes,
      getTrucks: () => trucks,
      vehId: ROADBIKE_WHITE_VEH_ID,
      colorway: 'white',
      label: '🚲 CR·1 White',
      onChange: () => { inventory?.refresh(); emitMyStateNow(); },
    })
  : null;
// [truck] 탈 수 있는 'Steel Truck' 주차 (스타베이스만, ?trucks=N 기본 20, ?trucks=0 끔, F 탑승/하차)
const trucks = region.features?.trucks && params.get('trucks') !== '0'
  ? createTrucks({ scene, overlay, world, data, params, camera, cam, player: playerProxy, renderer, terrain, presence, remotes, spawn: pos })
  : null;
// [corridor] 플레이어·바이크 이동 범위를 코리더까지 확장. 버스(transit)는 위에서 이미 라이브 bounds 를 잡아 두어 영향 없음
if (corridor) { world.liveBounds = world.bounds; world.bounds = corridor.bounds; }
const statusEl = document.getElementById('presence-status');
const presencePanel = document.getElementById('presence-panel');
let presenceOpen = false;
let presenceTimer = 0;

const escHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function nearestSpotLabel(x, z) {
  let bestText = isEn() ? (region.enDefaultSpotName || region.defaultSpotName || 'Center Plaza') : (region.defaultSpotName || '정자역 광장');
  let bestDist = Math.hypot(x - st.x, z - st.z);
  for (const l of data.labels || []) {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d < bestDist) {
      bestDist = d;
      bestText = l.text;
    }
  }
  return { name: bestText, dist: Math.round(bestDist) };
}

function compassDir(dx, dz) {
  const dirs = isEn()
    ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    : ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return dirs[Math.round(deg / 45) % 8];
}

function renderPresencePanel() {
  if (!presencePanel || !presenceOpen) return;
  const en = isEn();
  const peers = remotes.list();
  const mySpot = nearestSpotLabel(player.position.x, player.position.z);
  const peerRows = peers.length
    ? peers
        .map((p) => {
          const spot = nearestSpotLabel(p.x, p.z);
          const dx = p.x - player.position.x;
          const dz = p.z - player.position.z;
          const dist = Math.round(Math.hypot(dx, dz));
          const dir = dist > 3 ? (en ? `${compassDir(dx, dz)} ${dist}m` : `${compassDir(dx, dz)}쪽 ${dist}m`) : (en ? 'Right here' : '바로 옆');
          const statusBadge = p.riding
            ? (en ? ' · 🚲 Riding' : ' · 🚲 바이크 탑승 중')
            : p.afk
              ? (en ? ' · 💤 AFK' : ' · 💤 자리비움')
              : p.sit
                ? (en ? ' · 🧘 Sitting' : ' · 🧘 휴식 중')
                : '';
          const nearText = en ? `Near ${escHtml(spot.name)} (${spot.dist}m)` : `${escHtml(spot.name)} 근처 (${spot.dist}m)`;
          return `
            <li class="p-row">
              <div class="p-info">
                <div class="p-title">
                  <span class="p-swatch" style="background:${escHtml(p.color)}"></span>
                  <strong>${escHtml(p.name)}</strong>
                  <span class="p-dir">${escHtml(dir)}</span>
                </div>
                <small>📍 ${nearText}${statusBadge}</small>
              </div>
              <div class="p-actions">
                <button type="button" class="p-btn" data-peer-look="${escHtml(p.id)}" title="${en ? 'Look toward player' : '그 방향 바라보기'}">${en ? 'Look' : '방향'}</button>
                <button type="button" class="p-btn go" data-peer-go="${escHtml(p.id)}" title="${en ? 'Teleport next to player' : '그 플레이어 옆으로 이동'}">${en ? 'Go' : '이동'}</button>
              </div>
            </li>`;
        })
        .join('')
    : `<li class="p-empty">${en ? 'No other players online right now.<br><small>Share the link with friends or your community!</small>' : '현재 다른 접속자가 없습니다.<br><small>친구나 커뮤니티에 링크를 공유해 보세요!</small>'}</li>`;

  const myNearText = en ? `Near ${escHtml(mySpot.name)} (${mySpot.dist}m)` : `${escHtml(mySpot.name)} 근처 (${mySpot.dist}m)`;
  const listHtml = `
    <li class="p-row me">
      <div class="p-info">
        <div class="p-title">
          <span class="p-swatch" style="background:${escHtml(me.color || '#4f7cff')}"></span>
          <strong>${escHtml(me.name || (en ? 'Me' : '나'))}</strong>
          <span class="p-me-badge">${en ? 'ME' : '나'}</span>
        </div>
        <small>📍 ${myNearText}</small>
      </div>
    </li>
    ${peerRows}`;

  const headText = en ? `🟢 Online Players (${peers.length + 1})` : `🟢 실시간 접속자 (${peers.length + 1}명)`;
  const footText = en ? 'Player locations & directions are also shown on the bottom-right minimap' : '우측 하단 미니맵에도 접속자 위치·방향이 표시됩니다';
  let listEl = presencePanel.querySelector('.p-list');
  if (!listEl) {
    presencePanel.innerHTML = `
      <div class="p-head">
        <span class="p-head-title">${headText}</span>
        <button type="button" class="p-close" data-presence-close="1" aria-label="Close">✕</button>
      </div>
      <ul class="p-list">${listHtml}</ul>
      <div class="p-foot">${footText}</div>`;
  } else {
    const prevScroll = listEl.scrollTop;
    const headTitle = presencePanel.querySelector('.p-head-title');
    if (headTitle) headTitle.textContent = headText;
    const footEl = presencePanel.querySelector('.p-foot');
    if (footEl) footEl.textContent = footText;
    listEl.innerHTML = listHtml;
    listEl.scrollTop = prevScroll;
  }
}

function setPresenceOpen(next) {
  if (!presencePanel) return;
  presenceOpen = next;
  presencePanel.hidden = !presenceOpen;
  statusEl?.classList.toggle('open', presenceOpen);
  clearInterval(presenceTimer);
  if (presenceOpen) {
    renderPresencePanel();
    presenceTimer = setInterval(renderPresencePanel, 1000);
  }
}

statusEl?.addEventListener('click', () => setPresenceOpen(!presenceOpen));
statusEl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    setPresenceOpen(!presenceOpen);
  }
});

presencePanel?.addEventListener('click', (e) => {
  if (e.target.closest('[data-presence-close]')) {
    setPresenceOpen(false);
    return;
  }
  const lookBtn = e.target.closest('[data-peer-look]');
  if (lookBtn) {
    const peer = remotes.list().find((p) => p.id === lookBtn.dataset.peerLook);
    if (!peer) return;
    const dx = peer.x - player.position.x;
    const dz = peer.z - player.position.z;
    if (Math.hypot(dx, dz) > 0.1) {
      setMode('follow');
      cam.yaw = Math.atan2(-dx, -dz);
      cam.pitch = 0.22;
      player.rotation.y = Math.atan2(dx, dz);
    }
    return;
  }
  const goBtn = e.target.closest('[data-peer-go]');
  if (goBtn) {
    const peer = remotes.list().find((p) => p.id === goBtn.dataset.peerGo);
    if (!peer) return;
    if (bikes.riding) dismountBike();
    let tx = peer.x + 2.2;
    let tz = peer.z + 1.2;
    for (let a = 0; a < Math.PI * 2; a += 0.6) {
      const cx = peer.x + Math.cos(a) * 2.4;
      const cz = peer.z + Math.sin(a) * 2.4;
      if (!world.isBlocked(cx, cz)) {
        tx = cx;
        tz = cz;
        break;
      }
    }
    const ty = terrain ? terrain.getGroundHeight(tx, tz, peer.y || 0) : 0;
    player.position.set(tx, ty, tz);
    const dx = peer.x - tx;
    const dz = peer.z - tz;
    player.rotation.y = Math.atan2(dx, dz);
    setMode('follow');
    cam.yaw = Math.atan2(-dx, -dz);
    cam.pitch = 0.25;
    rememberPlace(true);
    renderPresencePanel();
  }
});

let lastPresenceRawStatus = '';
function paintPresenceStatus(s = lastPresenceRawStatus) {
  lastPresenceRawStatus = s;
  if (!statusEl) return;
  if (!s) {
    statusEl.innerHTML = '';
    statusEl.className = '';
    return;
  }
  const en = isEn();
  const m = String(s).match(/^(현재 접속자\s*)(\d+)명$/);
  if (m) {
    statusEl.className = 'is-live' + (presenceOpen ? ' open' : '');
    const lbl = en ? 'Online ' : m[1];
    const cnt = en ? m[2] : `${m[2]}명`;
    statusEl.innerHTML = `<span class="live-dot" aria-hidden="true"></span><span class="live-label">${lbl}</span><strong class="live-count">${cnt}</strong><span class="live-caret" aria-hidden="true">▾</span>`;
  } else {
    const trStatus = en
      ? (s.includes('확인 중') ? 'Connecting…' : s.includes('다른 탭') ? 'Active in another tab' : s.includes('끊김') ? 'Reconnecting…' : s)
      : s;
    statusEl.className = (/끊김|재시도/.test(s) ? 'is-warn' : 'is-wait') + (presenceOpen ? ' open' : '');
    statusEl.innerHTML = `<span class="live-dot" aria-hidden="true"></span><span class="live-label">${trStatus}</span>`;
  }
  if (presenceOpen) renderPresencePanel();
}
presence.on('status', (s) => paintPresenceStatus(s));
onHoldings(() => {
  roadbike?.setStock(holdingQty(ROADBIKE_GIFT_ID));
  roadbikeWhite?.setStock(holdingQty(ROADBIKE_WHITE_GIFT_ID));
  inventory?.refresh();
});
presence.on('welcome', (m) => {
  if (m.weather === 'rain' || m.weather === '') atmosphere.setSharedWeather(m.weather);
  if (Array.isArray(m.gifts)) replaceHoldings(m.gifts);
  inventory?.refresh();
});
let giftWait = 0;
presence.on('gift', (m) => {
  clearTimeout(giftWait);
  const def = giftItem(m.item);
  if (!def) return;
  const en = isEn();
  const label = en ? def.enName : def.name;
  const unit = Math.max(1, Math.floor(Number(m.unit) || giftUnit(def.id)));
  if (!m.ok) {
    const msg = {
      offline: en ? 'That player is not in this region.' : '같은 지역에 접속 중인 상대가 아닙니다.',
      not_owner: en ? `Not enough ${label} to gift.` : `선물할 ${label}이 부족합니다.`,
      not_found: en ? 'Could not find that player.' : '상대 계정을 찾지 못했습니다.',
      bad_item: en ? 'This item cannot be gifted.' : '선물할 수 없는 아이템입니다.',
      bad_phone: en ? 'Enter an 11-digit mobile number starting with 010.' : '010으로 시작하는 11자리 번호를 입력해 주세요.',
      phone_mismatch: en ? 'That number does not match this player. The gift was not sent.' : '전화번호가 그 사람과 같지 않습니다. 선물은 넘어가지 않았습니다.',
    }[m.error] || (en ? 'Could not send the gift.' : '선물을 전달하지 못했습니다.');
    inventory?.notify(msg);
    return;
  }
  const left = typeof m.qty === 'number'
    ? setHoldingQty(def.id, m.qty)
    : setHoldingQty(def.id, m.mine ? holdingQty(def.id) + unit : Math.max(holdingQty(def.id) - unit, 0));
  inventory?.notify('');
  myBubble.say(
    m.mine
      ? (en
        ? `${m.fromName || 'Someone'} gifted you ${unit} ${label} · you have ×${left}`
        : `${m.fromName || '누군가'}님이 ${label} ${unit}개를 선물했습니다 · 보유 ×${left}`)
      : (en
        ? `Gifted ${unit} ${label} to ${m.toName || 'them'} · left ×${left}`
        : `${m.toName || '상대'}님에게 ${label} ${unit}개를 선물했습니다 · 남은 ×${left}`),
    5000,
  );
  emitMyStateNow();
});
presence.on('weather', (m) => atmosphere.setSharedWeather(m.mode));
const sms = createSms();
function resolveAdminTank() {
  if (isLocalEnv) {
    const q = (params.get('tank') || '').toLowerCase();
    if (q === 'red' || q === 'black') return q;
  }
  const s = sms.session;
  if (!s || s.off || !s.isAdmin) return null;
  return s.bikeTank === 'black' ? 'black' : 'red';
}
getAdminBikeTank = () => resolveAdminTank() || 'red';
canRideAdminBike = () =>
  (isLocalEnv && (params.has('shot') || params.has('tank'))) ||
  Boolean(sms.session && !sms.session.off && sms.session.isAdmin); // [bike] 실서버는 번호 서버에서 인증된 관리자 세션만 탑승
function syncRainControl() {
  atmosphere.setRainAllowed(canRideAdminBike());
}
atmosphere.setRainRequest(() => {
  if (!canRideAdminBike()) return;
  presence.sendWeather(atmosphere.state.override === 'rain' ? '' : 'rain');
});
syncRainControl();
const handset = mountHandset({ sms });
const board = mountBoard({ sms, getMe: () => me });
function requestGift(itemId) {
  return (peerId, phone) => {
    if (holdingQty(itemId) < giftUnit(itemId)) return;
    const en = isEn();
    clearTimeout(giftWait);
    inventory?.notify(en ? 'Checking the number…' : '전화번호를 확인하는 중…');
    giftWait = setTimeout(() => {
      inventory?.notify(en ? 'The gift server did not respond. Deploy the phone server update first.' : '선물 서버가 응답하지 않았습니다. 번호 서버 업데이트가 필요합니다.');
    }, 5000);
    presence.sendGift(itemId, peerId, phone);
  };
}
// 꺼내거나 탑승하는 아이템만 여기 등록한다. 나머지는 카탈로그 수량만으로 선물함에 나타난다.
const customGiftIds = new Set([ROADBIKE_GIFT_ID, ROADBIKE_WHITE_GIFT_ID]);
const plainGifts = GIFT_ITEMS.filter((def) => !customGiftIds.has(def.id)).map((def) => ({
  id: def.id,
  category: 'gift',
  icon: def.icon || '🎁',
  name: def.name,
  enName: def.enName || def.name,
  giftUnit: giftUnit(def.id),
  unitName: def.unitName || '개',
  isAvailable: () => joined && holdingQty(def.id) > 0,
  getQty: () => holdingQty(def.id),
  canGift: () => holdingQty(def.id) >= giftUnit(def.id),
  getStatusText(en) {
    const n = holdingQty(def.id);
    const u = giftUnit(def.id);
    const word = def.unitName || '개';
    return en ? `Held ×${n} · each gift sends ${u}` : `보유 ×${n} · 한 번에 ${u}${word}`;
  },
  onGift: requestGift(def.id),
}));
inventory = mountInventory({
  capacity: 4,
  isReady: () => joined,
  getOwnerLabel: () => me.name || sms.session?.display || '',
  getPeers: () => remotes.list().map((p) => ({ id: p.id, name: p.name })),
  items: [
    ...(adminBike
    ? [
        {
          id: 'admin-cruiser',
          icon: '🏍️',
          name: 'Admin Cruiser',
          enName: 'Admin Cruiser',
          isAvailable: () => joined && canRideAdminBike(),
          isActive: () => Boolean(adminBike.summoned || adminBike.riding),
          isRiding: () => Boolean(adminBike.riding),
          getBadge(en) {
            const isRed = getAdminBikeTank() === 'red';
            return {
              color: isRed ? '#c9182b' : '#252830',
              text: isRed ? (en ? 'RED TANK' : '레드 탱크') : (en ? 'BLACK TANK' : '블랙 탱크'),
            };
          },
          getStatusText(en) {
            if (adminBike.riding) return en ? 'Riding · Space Wheelie · F Dismount / Click to stow' : '탑승 중 · Space 앞바퀴 들기 · F 하차 / 누르면 수납';
            if (adminBike.summoned) return en ? 'Parked nearby · F to ride / Click to stow' : '소환됨 · 근처에서 F 탑승 / 누르면 수납';
            return en ? 'Summon next to you & press F to ride' : '내 옆에 꺼내 세워두고 F로 탑승';
          },
          getActionLabel(en, { active }) {
            return active ? (en ? 'Stow' : '수납') : (en ? 'Summon' : '꺼내기');
          },
          onUse() {
            if (bikes.riding) dismountBike();
            dismountRoadbikes();
            if (mySit) {
              standUpFromSeat();
              renderEmoteBar();
            }
            wakeFromAfk();
            adminBike.toggleSummon();
            emitMyStateNow();
          },
        },
      ]
    : []),
    ...[roadbike && ROADBIKE_GIFT_ID, roadbikeWhite && ROADBIKE_WHITE_GIFT_ID].filter(Boolean).map((id) => {
      const bike = id === ROADBIKE_WHITE_GIFT_ID ? roadbikeWhite : roadbike;
      const def = giftItem(id);
      return {
          id,
          category: 'gift',
          icon: def?.icon || '🚲',
          name: def?.name || id,
          enName: def?.enName || id,
          isAvailable: () => joined && holdingQty(id) > 0,
          giftUnit: giftUnit(id),
          unitName: def?.unitName || '대',
          isActive: () => Boolean(bike.summoned || bike.riding),
          isRiding: () => Boolean(bike.riding),
          getQty: () => holdingQty(id),
          canGift: () => holdingQty(id) >= giftUnit(id),
          getStatusText(en) {
            const n = bike.stock;
            if (bike.riding) return en ? `Riding · stock ×${n} · F dismount / click to stow` : `탑승 중 · 보유 ×${n} · F 하차 / 누르면 수납`;
            if (bike.summoned) return en ? `Parked · stock ×${n} · F to ride / click to stow` : `세워 둠 · 보유 ×${n} · F 탑승 / 누르면 수납`;
            return en ? `Stock ×${n} · summon beside you · gift sends 1` : `보유 ×${n} · 꺼내 세우기 · 선물은 1대씩`;
          },
          getActionLabel(en, { active }) {
            return active ? (en ? 'Stow' : '수납') : (en ? 'Summon' : '꺼내기');
          },
          onUse() {
            if (bike.stock < 1) return;
            if (bikes.riding) dismountBike();
            if (adminBike?.riding) adminBike.dismount();
            dismountRoadbikes();
            if (mySit) {
              standUpFromSeat();
              renderEmoteBar();
            }
            wakeFromAfk();
            bike.toggleSummon();
            emitMyStateNow();
          },
          onGift: requestGift(id),
      };
    }),
    ...plainGifts,
  ],
});
function applySession(session) {
  const place = session?.place;
  if (!place) return;
  let px = Number(place.x) || 0;
  let pz = Number(place.z) || 0;
  let py = Number(place.y) || 0;
  // 이전 위치에 구조물(전광판·분수대 등)이 새로 생겨 막혀 있으면 가장 가까운 안전 위치로 자동 이동
  if (world.isBlocked(px, pz) || world.onRoad(px, pz)) {
    for (let r = 0.6; r < 14; r += 0.5) {
      let found = false;
      for (let a = 0; a < Math.PI * 2; a += 0.45) {
        const cx = px + Math.cos(a) * r;
        const cz = pz + Math.sin(a) * r;
        if (!world.isBlocked(cx, cz) && !world.onRoad(cx, cz)) {
          px = cx;
          pz = cz;
          py = terrain ? terrain.getGroundHeight(cx, cz, py) : 0;
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }
  player.position.set(px, py, pz);
  player.rotation.y = place.ry || 0;
}
const globeBtn = document.getElementById('btn-globe');
const leaveBtn = document.getElementById('btn-leave');
if (globeBtn) globeBtn.hidden = !joined;
leaveBtn.hidden = !joined;
const reopenGate = () => {
  document.body.classList.remove('in-lobby');
  document.body.classList.add('in-gate');
  openWorldGate({ onEnter: handleGateEnter });
};
function completeWorldJoin(name, look, session) {
  setPassportActive(true);
  me.name = name; me.color = look.color; me.look = look;
  mySit = ''; myAfk = false; myEmote = ''; myEmoteUntil = 0; idleTime = 0;
  wear(look);
  if (session?.place) applySession(session);
  else player.position.copy(pos);
  player.visible = true;
  nameTag.hidden = false;
  nameTag.el.textContent = name;
  nameTag.el.classList.remove('is-afk');
  renderEmoteBar();
  document.body.classList.remove('in-gate', 'in-lobby');
  if (globeBtn) globeBtn.hidden = false;
  leaveBtn.hidden = false;
  handset.signIn();
  me.phone = sms.session?.phone || '';
  presence.connect(me);
  joined = true;
  adminBike?.refreshStyle?.();
  inventory?.refresh();
  syncRainControl();
  trackEvent('world_join', { region: region.id, has_pin: !!session?.hasPin, resumed: !!session?.place });
}
joinWithPassport = async () => {
  const passport = readSavedPassport();
  if (!passport) {
    if (arrivalFlightScreen) {
      await arrivalFlightScreen.finish();
      arrivalFlightScreen = null;
    }
    startLobby?.();
    return;
  }
  const screen = arrivalFlightScreen || getEnterScreen();
  if (!arrivalFlightScreen) {
    screen.show(getFlightLines(region), { minMs: 1100 });
  }
  arrivalFlightScreen = null;
  document.body.classList.remove('in-gate', 'in-lobby');
  let session = null;
  try {
    session = await sms.enter({ name: passport.name, look: passport.look, preview: false });
  } catch {
    session = { off: true, name: passport.name, look: passport.look, place: null };
  }
  completeWorldJoin(session?.name || passport.name, sanitizeLook(session?.look || passport.look), session);
  await screen.finish();
};
startLobby = async () => {
  document.body.classList.remove('in-gate');
  document.body.classList.add('in-lobby');
  if (arrivalFlightScreen) {
    const s = arrivalFlightScreen;
    arrivalFlightScreen = null;
    await s.finish();
  }
  openLobby({
    sms,
    region,
    onBack: reopenGate,
    onJoin(name, look, session) {
      completeWorldJoin(name, look, session);
    },
  });
};
if (passportQueued) joinWithPassport();
else if (lobbyQueued) startLobby();
if (joined) {
  me.phone = sms.session?.phone || '';
  presence.connect(me);
}

// --- 채팅 & 주변 대화 전체보기 로그 ---
const chatForm = document.getElementById('chat'), chatInput = document.getElementById('chat-input');
const chatLogToggle = document.getElementById('chat-log-toggle');
const chatUnreadEl = document.getElementById('chat-unread');
const chatLogPanel = document.getElementById('chat-log-panel');
const chatLogs = [];
const MAX_CHAT_LOGS = 200;
const CHAT_PAGE = 40;
let chatSeq = 0;
let chatFromId = 0;
let chatLogOpen = false;
let chatIncludeNpc = false;
let chatUnread = 0;
let chatPendingNew = 0;
let chatStickToBottom = true;
let chatLoadingOlder = false;

function syncChatUnread() {
  if (!chatUnreadEl) return;
  if (chatUnread > 0 && !chatLogOpen) {
    chatUnreadEl.hidden = false;
    chatUnreadEl.textContent = chatUnread > 99 ? '99+' : String(chatUnread);
  } else {
    chatUnreadEl.hidden = true;
  }
}

function filteredChatLogs() {
  return chatIncludeNpc ? chatLogs : chatLogs.filter((item) => item.kind !== 'npc');
}

function chatWindowStart(filtered) {
  if (!chatFromId) return Math.max(0, filtered.length - CHAT_PAGE);
  const idx = filtered.findIndex((item) => item.id >= chatFromId);
  return idx < 0 ? 0 : idx;
}

function pinChatWindow() {
  if (chatFromId) return;
  const filtered = filteredChatLogs();
  const start = Math.max(0, filtered.length - CHAT_PAGE);
  if (filtered[start]) chatFromId = filtered[start].id;
}

function syncChatNewBtn(en = isEn()) {
  const btn = chatLogPanel?.querySelector('[data-chat-latest]');
  if (!btn) return;
  const n = chatPendingNew;
  btn.hidden = n <= 0;
  btn.textContent = n > 1
    ? (en ? `New messages ${n} ↓` : `새 메시지 ${n} ↓`)
    : (en ? 'New messages ↓' : '새 메시지 ↓');
}

function onChatListScroll() {
  if (chatLoadingOlder) return;
  const listEl = chatLogPanel?.querySelector('.c-list');
  if (!listEl) return;
  const atBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight <= 16;
  if (atBottom) {
    chatStickToBottom = true;
    if (chatPendingNew) {
      chatPendingNew = 0;
      syncChatNewBtn();
    }
    return;
  }
  if (chatStickToBottom) {
    chatStickToBottom = false;
    pinChatWindow();
  }
  if (listEl.scrollTop <= 40) loadOlderChat();
}

function loadOlderChat() {
  if (chatLoadingOlder) return;
  const listEl = chatLogPanel?.querySelector('.c-list');
  if (!listEl) return;
  const filtered = filteredChatLogs();
  const start = chatWindowStart(filtered);
  if (start <= 0) return;
  chatLoadingOlder = true;
  const prevHeight = listEl.scrollHeight;
  const prevTop = listEl.scrollTop;
  chatFromId = filtered[Math.max(0, start - CHAT_PAGE)].id;
  renderChatLogPanel({ scrollMode: 'prepend', prevHeight, prevTop });
  requestAnimationFrame(() => { chatLoadingOlder = false; });
}

function renderChatLogPanel({ scrollMode, prevHeight = 0, prevTop = 0 } = {}) {
  if (!chatLogPanel || !chatLogOpen) return;
  if (!scrollMode) scrollMode = chatStickToBottom ? 'bottom' : 'preserve';
  const en = isEn();
  const filtered = filteredChatLogs();
  const start = chatWindowStart(filtered);
  const visibleLogs = filtered.slice(start);
  const rowsHtml = visibleLogs.length
    ? visibleLogs
        .map((item) => {
          const badge =
            item.kind === 'me'
              ? `<span class="c-badge me">${en ? 'ME' : '나'}</span>`
              : item.kind === 'npc'
                ? '<span class="c-badge npc">NPC</span>'
                : `<span class="c-swatch" style="background:${escHtml(item.color || '#20c997')}"></span>`;
          return `
            <li class="c-row ${escHtml(item.kind)}">
              <div class="c-meta">
                <div class="c-who">
                  ${badge}
                  <strong>${escHtml(item.name)}</strong>
                </div>
                <time class="c-time">${escHtml(item.time)}</time>
              </div>
              <p class="c-text">${escHtml(item.text)}</p>
            </li>`;
        })
        .join('')
    : `<li class="c-empty">${
        chatIncludeNpc
          ? (en ? 'No nearby (30m) messages yet.' : '아직 근처(30m)에서 들린 대화가 없습니다.')
          : (en
              ? 'No player messages yet.<br><small>Say hi to nearby players (30m) or turn on <b>Include NPCs</b> above!</small>'
              : '아직 주고받은 플레이어 대화가 없습니다.<br><small>근처(30m) 접속자와 인사하거나 상단의 <b>NPC 대사 포함</b>을 켜보세요!</small>')
      }</li>`;

  const headTitleHtml = en ? '💬 Nearby Chat Log <small>(30m)</small>' : '💬 주변 대화 전체보기 <small>(30m)</small>';
  const npcToggleText = en ? '🗣️ Include NPCs' : '🗣️ NPC 대사 포함';
  const newBtnHtml = `<button type="button" class="c-new" data-chat-latest="1" hidden>${en ? 'New messages ↓' : '새 메시지 ↓'}</button>`;
  let listEl = chatLogPanel.querySelector('.c-list');
  let anchor = null;
  if (listEl && scrollMode === 'prepend') anchor = { h: prevHeight, t: prevTop };
  else if (listEl && scrollMode === 'preserve') anchor = { t: listEl.scrollTop };
  if (!listEl) {
    chatLogPanel.innerHTML = `
      <div class="c-head">
        <span class="c-title">${headTitleHtml}</span>
        <div class="c-head-actions">
          <button type="button" class="c-npc-toggle${chatIncludeNpc ? ' on' : ''}" data-chat-npc-toggle="1" aria-pressed="${chatIncludeNpc}">
            ${npcToggleText}
          </button>
          <button type="button" class="c-close" data-chat-close="1" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="c-list-wrap">
        <ul class="c-list">${rowsHtml}</ul>
        ${newBtnHtml}
      </div>`;
    listEl = chatLogPanel.querySelector('.c-list');
    listEl.addEventListener('scroll', onChatListScroll);
  } else {
    const titleEl = chatLogPanel.querySelector('.c-title');
    if (titleEl) titleEl.innerHTML = headTitleHtml;
    const npcBtn = chatLogPanel.querySelector('[data-chat-npc-toggle]');
    if (npcBtn) {
      npcBtn.textContent = npcToggleText;
      npcBtn.classList.toggle('on', chatIncludeNpc);
      npcBtn.setAttribute('aria-pressed', String(chatIncludeNpc));
    }
    listEl.innerHTML = rowsHtml;
  }
  if (scrollMode === 'bottom') listEl.scrollTop = listEl.scrollHeight;
  else if (anchor?.h != null) listEl.scrollTop = anchor.t + (listEl.scrollHeight - anchor.h);
  else if (anchor) listEl.scrollTop = anchor.t;
  listEl.classList.toggle('fade-old', listEl.scrollHeight > listEl.clientHeight + 4);
  syncChatNewBtn(en);
}

function setChatLogOpen(next) {
  if (!chatLogPanel) return;
  chatLogOpen = next;
  chatLogPanel.hidden = !chatLogOpen;
  chatLogToggle?.classList.toggle('open', chatLogOpen);
  chatLogToggle?.setAttribute('aria-expanded', String(chatLogOpen));
  if (chatLogOpen) {
    chatUnread = 0;
    chatPendingNew = 0;
    chatFromId = 0;
    chatStickToBottom = true;
    syncChatUnread();
    renderChatLogPanel({ scrollMode: 'bottom' });
  } else {
    chatPendingNew = 0;
  }
}

overlay.onSay = ({ cls, text, pos, meta }) => {
  if (!joined || !text) return;
  if (cls === 'npc') {
    if (!pos || Math.hypot(player.position.x - pos.x, player.position.z - pos.z) > CHAT_RADIUS) return;
  }
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const name = meta?.getName
    ? meta.getName()
    : (meta?.name || (cls === 'me' ? (me.name || '나') : cls === 'remote' ? '손님' : '주민'));
  const color = meta?.getColor
    ? meta.getColor()
    : (meta?.color || (cls === 'me' ? (me.color || '#4f7cff') : cls === 'remote' ? '#20c997' : '#9775fa'));

  // 동일 화자가 직전에 같은 대사를 연속으로 띄운 경우 중복 누적 방지
  const last = chatLogs[chatLogs.length - 1];
  if (cls === 'npc' && last && last.kind === 'npc' && last.name === name && last.text === text) return;

  chatLogs.push({ id: ++chatSeq, kind: cls, name, color, text, time: `${hh}:${mm}` });
  if (chatLogs.length > MAX_CHAT_LOGS) chatLogs.shift();

  if (chatLogOpen && (cls !== 'npc' || chatIncludeNpc)) {
    const follow = chatStickToBottom || cls === 'me';
    if (follow) {
      chatPendingNew = 0;
      chatStickToBottom = true;
      renderChatLogPanel({ scrollMode: 'bottom' });
    } else {
      pinChatWindow();
      chatPendingNew += 1;
      renderChatLogPanel({ scrollMode: 'preserve' });
    }
  } else if (!chatLogOpen && (cls === 'remote' || (cls === 'npc' && chatIncludeNpc))) {
    chatUnread++;
    syncChatUnread();
  }
};

chatLogToggle?.addEventListener('click', () => setChatLogOpen(!chatLogOpen));
chatLogPanel?.addEventListener('click', (e) => {
  if (e.target.closest('[data-chat-close]')) {
    setChatLogOpen(false);
    return;
  }
  if (e.target.closest('[data-chat-latest]')) {
    chatPendingNew = 0;
    chatStickToBottom = true;
    renderChatLogPanel({ scrollMode: 'bottom' });
    return;
  }
  if (e.target.closest('[data-chat-npc-toggle]')) {
    chatIncludeNpc = !chatIncludeNpc;
    chatFromId = 0;
    chatPendingNew = 0;
    chatStickToBottom = true;
    renderChatLogPanel({ scrollMode: 'bottom' });
  }
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault(); const text = chatInput.value.trim(); if (!text) return chatInput.blur();
  myBubble.say(text, 6000);
  if (myBubble.item.el.classList.contains('shouting')) {
    triggerEmote('fuss', false);
  }
  presence.sendChat(text); chatInput.value = ''; chatInput.blur();
});

// --- 호들갑(리액션/이모트) 퀵바 & 단축키 (1~6) + 앉기(C) & 자동 대기모드(30초) ---
const emoteBar = document.getElementById('emote-bar');
const AFK_TIMEOUT_SEC = 30;
let emoteFolded = false;
let myEmote = '';
let myEmoteUntil = 0;
let emoteCombo = 0;
let lastEmoteAt = 0;
let mySit = ''; // '' | 'ground' | 'beanbag' | 'bench' | 'ledge'
let sitExitPos = null; // 좌석에서 일어날 때 복귀할 안전한 좌표
let myAfk = false;
let idleTime = 0;
let myZzzTimer = 0;
let nearSeatHint = null;

function standUpFromSeat() {
  if (!mySit && !sitExitPos) return;
  if (sitExitPos) {
    const ty = terrain ? terrain.getGroundHeight(sitExitPos.x, sitExitPos.z, player.position.y) : 0;
    player.position.set(sitExitPos.x, ty, sitExitPos.z);
    sitExitPos = null;
  }
  mySit = '';
  player.userData.sit = '';
}

function syncMyNameTag() {
  const baseName = me.name || tr('나', 'Me');
  const want = myAfk ? `${baseName} 💤 ${tr('자리비움', 'AFK')}` : baseName;
  if (nameTag.el.textContent !== want) {
    nameTag.el.textContent = want;
    nameTag.el.classList.toggle('is-afk', myAfk);
  }
}

function wakeFromAfk() {
  idleTime = 0;
  if (myAfk) {
    myAfk = false;
    syncMyNameTag();
    renderEmoteBar();
  }
}

function renderEmoteBar() {
  if (!emoteBar) return;
  const en = isEn();
  if (emoteFolded) {
    emoteBar.classList.add('folded');
    emoteBar.innerHTML = `
      <button type="button" class="emote-fold-btn" data-emote-fold="0" title="${en ? 'Expand Emotes · Sit · AFK bar' : '리액션·앉기·자리비움 바 펼치기'}">
        <span>${en ? '🎉 Emotes (1~9) · 🧘 Sit (C) · 💤 AFK (Z)' : '🎉 리액션 (1~9) · 🧘 앉기 (C) · 💤 자리비움 (Z)'}</span>
        <span class="caret">▴</span>
      </button>`;
    return;
  }
  emoteBar.classList.remove('folded');
  const sitTitle = mySit
    ? (en ? 'Stand up (Key C)' : '일어나기 (단축키 C)')
    : nearSeatHint
      ? `${nearSeatHint.label} (C)`
      : (en ? 'Sit down (Key C — snaps to nearby benches/beanbags)' : '자리에 앉기 (단축키 C — 빈백·벤치 근처에선 맞춰 앉아요)');
  const sitLabel = mySit
    ? (en ? 'Stand' : '일어나기')
    : nearSeatHint
      ? (en ? 'Sit' : nearSeatHint.label.replace(/\s*\(C\)$/, '').replace(/^.\s*/, ''))
      : (en ? 'Sit' : '앉기');
  const sitIcon = mySit ? '🚶' : nearSeatHint ? nearSeatHint.label.split(' ')[0] : '🧘';
  const btns = EMOTE_LIST.map(
    (e) => {
      const lbl = en ? (e.enLabel || e.label) : e.label;
      const tip = en ? `${lbl} (Key ${e.digit} — mash for combo!)` : `${lbl} (단축키 ${e.digit} 연타 가능!)`;
      return `
      <button type="button" class="emote-btn ${myEmote === e.id ? 'active' : ''}" data-emote-id="${e.id}" title="${escHtml(tip)}">
        <kbd>${e.digit}</kbd>
        <span class="em-ico">${e.icon}</span>
        <span class="em-lbl">${escHtml(lbl)}</span>
      </button>`;
    },
  ).join('');
  emoteBar.innerHTML = `
    <div class="emote-list">
      <button type="button" class="emote-btn sit-btn ${mySit ? 'active' : ''}" data-sit-toggle="1" title="${escHtml(sitTitle)}">
        <kbd>C</kbd>
        <span class="em-ico">${sitIcon}</span>
        <span class="em-lbl">${escHtml(sitLabel)}</span>
      </button>
      <button type="button" class="emote-btn afk-btn ${myAfk ? 'active' : ''}" data-afk-toggle="1" title="${en ? 'Toggle AFK mode (Key Z)' : '자리비움/업무중 모드 전환 (단축키 Z)'}">
        <kbd>Z</kbd>
        <span class="em-ico">💤</span>
        <span class="em-lbl">${myAfk ? (en ? 'Back' : '복귀') : (en ? 'AFK' : '자리비움')}</span>
      </button>
      <span class="emote-sep" aria-hidden="true"></span>
      ${btns}
    </div>
    <button type="button" class="emote-fold-btn icon-only" data-emote-fold="1" title="${en ? 'Collapse bar' : '리액션 바 접기'}" aria-label="Collapse">▾</button>`;
}
renderEmoteBar();

function toggleSit() {
  if (!joined || board.open || adminBike?.riding || roadRiding()) return;
  wakeFromAfk();
  if (bikes.riding) dismountBike();
  if (mySit) {
    standUpFromSeat();
    renderEmoteBar();
    emitMyStateNow();
    return;
  }
  myEmote = '';
  myEmoteUntil = 0;
  player.userData.emote = '';
  const seat = stationPlaza.findSeat?.(player.position.x, player.position.z);
  if (seat) {
    sitExitPos = {
      x: seat.exitX ?? player.position.x,
      z: seat.exitZ ?? player.position.z,
    };
    const ty = terrain ? terrain.getGroundHeight(seat.x, seat.z, player.position.y) : 0;
    player.position.set(seat.x, ty, seat.z);
    player.rotation.y = seat.ry;
    mySit = seat.kind;
  } else {
    sitExitPos = null;
    mySit = 'ground';
  }
  player.userData.sit = mySit;
  trackEvent('player_sit', { kind: mySit });
  renderEmoteBar();
  emitMyStateNow();
}

function toggleAfk() {
  if (!joined || board.open) return;
  if (bikes.riding) dismountBike();
  if (myAfk) {
    myAfk = false;
    idleTime = 0;
    standUpFromSeat();
    syncMyNameTag();
    renderEmoteBar();
    emitMyStateNow();
    return;
  }
  myEmote = '';
  myEmoteUntil = 0;
  player.userData.emote = '';
  if (!mySit) {
    const seat = stationPlaza.findSeat?.(player.position.x, player.position.z);
    if (seat) {
      sitExitPos = {
        x: seat.exitX ?? player.position.x,
        z: seat.exitZ ?? player.position.z,
      };
      const ty = terrain ? terrain.getGroundHeight(seat.x, seat.z, player.position.y) : 0;
      player.position.set(seat.x, ty, seat.z);
      player.rotation.y = seat.ry;
      mySit = seat.kind;
    } else {
      sitExitPos = null;
      mySit = 'ground';
    }
    player.userData.sit = mySit;
  }
  myAfk = true;
  idleTime = AFK_TIMEOUT_SEC;
  myZzzTimer = 0;
  syncMyNameTag();
  emoteFx.spawnZzz(player.position);
  trackEvent('player_afk_toggle', { afk: true });
  renderEmoteBar();
  emitMyStateNow();
}

function triggerEmote(emoteId, sendNet = true) {
  if (!joined || board.open) return;
  wakeFromAfk();
  if (mySit) {
    standUpFromSeat();
  }
  const def = EMOTE_BY_ID[emoteId];
  if (!def) return;
  const now = performance.now();
  if (now - lastEmoteAt < 900) {
    emoteCombo = Math.min(99, emoteCombo + 1);
  } else {
    emoteCombo = 1;
  }
  lastEmoteAt = now;
  myEmote = def.id;
  myEmoteUntil = now + 3400;
  player.userData.emote = myEmote;
  emoteFx.burst(player.position, def.id, emoteCombo);
  umbrellas.onPlayerEmote(def.id, player.position);
  if (sendNet) {
    presence.sendEmote(def.id, emoteCombo);
    trackEvent('emote_use', { emote: def.id, combo: emoteCombo });
  }
  renderEmoteBar();
}

umbrellas.bindCallbacks({
  onTriggerDance() {
    triggerEmote('dance', true);
  },
  getPlayer() {
    return { pos: player.position, ry: player.rotation.y };
  },
});

emoteBar?.addEventListener('click', (e) => {
  if (emoteBar.dataset.suppressClick === '1') {
    delete emoteBar.dataset.suppressClick;
    return;
  }
  const foldBtn = e.target.closest('[data-emote-fold]');
  if (foldBtn) {
    emoteFolded = foldBtn.dataset.emoteFold === '1';
    renderEmoteBar();
    return;
  }
  const sitBtn = e.target.closest('[data-sit-toggle]');
  if (sitBtn) {
    toggleSit();
    sitBtn.blur();
    return;
  }
  const afkBtn = e.target.closest('[data-afk-toggle]');
  if (afkBtn) {
    toggleAfk();
    afkBtn.blur();
    return;
  }
  const btn = e.target.closest('[data-emote-id]');
  if (btn) {
    triggerEmote(btn.dataset.emoteId, true);
    btn.blur();
  }
});

let emoteDrag = null;
function emoteListEl() {
  return emoteBar?.querySelector('.emote-list') || null;
}
emoteBar?.addEventListener('pointerdown', (e) => {
  const list = emoteListEl();
  if (!list || e.button !== 0) return;
  emoteDrag = { x: e.clientX, left: list.scrollLeft, moved: false, pointerId: e.pointerId };
});
emoteBar?.addEventListener('pointermove', (e) => {
  if (!emoteDrag || emoteDrag.pointerId !== e.pointerId) return;
  const dx = e.clientX - emoteDrag.x;
  if (!emoteDrag.moved && Math.abs(dx) < 5) return;
  const list = emoteListEl();
  if (!list) return;
  emoteDrag.moved = true;
  emoteBar.classList.add('dragging');
  list.scrollLeft = emoteDrag.left - dx;
});
function endEmoteDrag(e) {
  if (!emoteDrag || emoteDrag.pointerId !== e.pointerId) return;
  if (emoteDrag.moved) emoteBar.dataset.suppressClick = '1';
  emoteDrag = null;
  emoteBar.classList.remove('dragging');
}
emoteBar?.addEventListener('pointerup', endEmoteDrag);
emoteBar?.addEventListener('pointercancel', endEmoteDrag);
emoteBar?.addEventListener('wheel', (e) => {
  const list = emoteListEl();
  if (!list || list.scrollWidth <= list.clientWidth + 1) return;
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (!delta) return;
  list.scrollLeft += delta;
  e.preventDefault();
}, { passive: false });

// --- 입력/카메라 ---
const input = new Input(renderer.domElement);
const viewBtn = document.getElementById('btn-view');
const hudEl = document.getElementById('hud');
const helpEl = document.querySelector('#hud .help');
const helpFoldBtn = document.getElementById('help-fold');
const HELP_FOLD_KEY = 'jeongja3d.helpFolded';
let helpFolded = true;
try { helpFolded = localStorage.getItem(HELP_FOLD_KEY) !== '0'; } catch {}
function syncHelpFoldUi() {
  hudEl?.classList.toggle('is-folded', helpFolded);
  if (!helpFoldBtn) return;
  const en = isEn();
  const open = helpFoldBtn.querySelector('.when-open');
  const closed = helpFoldBtn.querySelector('.when-closed');
  if (open) open.textContent = en ? 'Hide ▴' : '접기 ▴';
  if (closed) closed.textContent = en ? 'Keys ▾' : '조작 ▾';
  const label = helpFolded
    ? (en ? 'Show controls' : '조작 안내 펼치기')
    : (en ? 'Hide controls' : '조작 안내 접기');
  helpFoldBtn.title = label;
  helpFoldBtn.setAttribute('aria-label', label);
  helpFoldBtn.setAttribute('aria-expanded', helpFolded ? 'false' : 'true');
}
helpFoldBtn?.addEventListener('click', () => {
  helpFolded = !helpFolded;
  try { localStorage.setItem(HELP_FOLD_KEY, helpFolded ? '1' : '0'); } catch {}
  syncHelpFoldUi();
  helpFoldBtn.blur();
});
syncHelpFoldUi();
const HELP_WALK_KO = 'WASD/방향키 이동 · Shift 달리기 · Space 점프 · C 앉기 · Z 자리비움 · 1~9 리액션 · Enter 채팅(!! 외침) · M 위에서 보기 · E 바이크';
const HELP_WALK_EN = 'WASD/Arrows Move · Shift Run · Space Jump · C Sit · Z AFK · 1~9 Emotes · Enter Chat (!! Shout) · M Overview · E Bike';
const HELP_RIDE_KO = '카카오바이크 · W 전진 · S 브레이크 · A/D 회전 · Shift 빠르게 · Space 점프 · E 내리기';
const HELP_RIDE_EN = 'Bike · W Forward · S Brake · A/D Turn · Shift Boost · Space Jump · E Dismount';
const HELP_CRUISER_KO = 'Admin Cruiser · W 가속 · S 브레이크 · A/D 조향 · Shift 부스트 · Space 앞바퀴 들기 · N 소리 · F 내리기';
const HELP_CRUISER_EN = 'Admin Cruiser · W Throttle · S Brake · A/D Steer · Shift Boost · Space Wheelie · N Mute · F Dismount';
const HELP_ROAD_KO = 'CR·1 로드바이크 · W 페달 · S 브레이크 · A/D 조향 · Shift 스프린트 · 최고 50 km/h · F 내리기';
const HELP_ROAD_EN = 'CR·1 Road Bike · W Pedal · S Brake · A/D Steer · Shift Sprint · 50 km/h max · F Dismount';
const getHelpWalk = () => (isEn() ? HELP_WALK_EN : HELP_WALK_KO);
const getHelpRide = () => (isEn() ? HELP_RIDE_EN : HELP_RIDE_KO);
const getHelpCruiser = () => (isEn() ? HELP_CRUISER_EN : HELP_CRUISER_KO);
const getHelpRoad = () => (isEn() ? HELP_ROAD_EN : HELP_ROAD_KO);
const syncViewBtnText = () => {
  if (!viewBtn) return;
  viewBtn.textContent = cam.mode === 'overview'
    ? tr('🚶 걸어다니기', '🚶 Walk')
    : tr('🗺️ 위에서 보기', '🗺️ Overview');
};
const setMode = (m) => {
  cam.mode = m;
  syncViewBtnText();
  setShadowSpan(m === 'overview' ? 750 : 90);
  scene.fog.near = m === 'overview' ? 1500 : 350;
  scene.fog.far = m === 'overview' ? 4500 : 1600;
};
setMode(cam.mode);
viewBtn.onclick = () => setMode(cam.mode === 'overview' ? 'follow' : 'overview');

const rideBtn = document.getElementById('ride-btn');
const RIDE_Y = 0.16;
const JUMP_V = 6.2;
const BIKE_JUMP_V = 4.8;
const JUMP_GRAVITY = 18;
let jumpY = 0;
let jumpVel = 0;
let rideUi = '';
function triggerJump() {
  if (!joined || board.open) return;
  wakeFromAfk();
  if (mySit) {
    standUpFromSeat();
    renderEmoteBar();
  }
  if (jumpY <= 0.001) {
    jumpVel = bikes.riding ? BIKE_JUMP_V : JUMP_V;
  }
}
function seatPlayer() {
  const b = bikes.riding;
  const back = 0.12;
  player.position.set(b.x - Math.sin(b.ry) * back, (b.y || 0) + RIDE_Y + jumpY, b.z - Math.cos(b.ry) * back);
  player.rotation.y = b.ry;
  player.userData.jumpY = 0;
}
function dismountBike() {
  const b = bikes.riding;
  if (!b) return;
  jumpY = 0;
  jumpVel = 0;
  b.mesh.position.y = b.y || 0;
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
  if (!joined || adminBike?.riding || roadRiding()) return;
  wakeFromAfk();
  if (bikes.riding) { dismountBike(); emitMyStateNow(); return; }
  const b = bikes.nearest(player.position.x, player.position.z, undefined, player.position.y);
  if (!b) return;
  jumpY = 0;
  jumpVel = 0;
  standUpFromSeat();
  myEmote = '';
  myEmoteUntil = 0;
  player.userData.jumpY = 0;
  player.userData.emote = '';
  renderEmoteBar();
  bikes.mount(b);
  seatPlayer();
  animateRide(player, 0, 0);
  emitMyStateNow();
}
function syncRideUi(force = false) {
  if (roadRiding()) {
    if (!force && rideUi === 'roadbike') return;
    rideUi = 'roadbike';
    rideBtn.hidden = true;
    helpEl.textContent = getHelpRoad();
    return;
  }
  if (adminBike?.riding) {
    if (!force && rideUi === 'cruiser') return;
    rideUi = 'cruiser';
    rideBtn.hidden = true;
    helpEl.textContent = getHelpCruiser();
    return;
  }
  const near = joined && !bikes.riding && bikes.nearest(player.position.x, player.position.z, undefined, player.position.y);
  const mode = bikes.riding ? 'ride' : near ? 'near' : '';
  if (!force && mode === rideUi) return;
  rideUi = mode;
  rideBtn.hidden = !mode;
  rideBtn.textContent = mode === 'ride'
    ? tr('🚲 내리기 (E)', '🚲 Dismount (E)')
    : tr('🚲 카카오바이크 타기 (E)', '🚲 Ride Bike (E)');
  helpEl.textContent = mode === 'ride' ? getHelpRide() : getHelpWalk();
}
rideBtn.addEventListener('click', toggleRide);
const homeBtn = document.getElementById('btn-home');
const quickSpotBtns = [];
function syncGameLocale() {
  const en = isEn();
  const langLauncher = document.getElementById('lang-launcher');
  if (langLauncher) {
    const lbl = langLauncher.querySelector('.board-label');
    if (lbl) lbl.textContent = en ? 'KO' : 'EN';
    langLauncher.title = en ? '한국어 UI로 전환 (Switch to Korean)' : 'Switch UI to English';
  }
  syncViewBtnText();
  if (homeBtn) {
    homeBtn.textContent = en
      ? (region.enHomeBtnLabel || region.homeBtnLabel || '🚇 Station')
      : (region.homeBtnLabel || '🚇 역으로');
  }
  if (dogParkBtn && !dogParkBtn.hidden) {
    dogParkBtn.textContent = en ? '🐕 Dog Park' : '🐕 반려견운동장가기';
  }
  for (const { btn, qs } of quickSpotBtns) {
    btn.textContent = en ? (qs.enLabel || qs.label) : qs.label;
  }
  if (globeBtn) {
    globeBtn.textContent = en ? '🌏 Globe' : '🌏 지구본';
    globeBtn.title = en ? 'Travel to another neighborhood with your character' : '내 캐릭터 그대로 다른 동네(지구본)로 이동';
  }
  if (leaveBtn) leaveBtn.textContent = en ? 'Leave' : '나가기';
  if (chatInput) {
    chatInput.placeholder = en
      ? 'Say something (Enter) · end with !! to shout!'
      : '말 걸기 (Enter) · 끝에 !! 붙이면 호들갑 외침!';
  }
  const chatToggleSpan = chatLogToggle?.querySelector('span:first-child');
  if (chatToggleSpan) chatToggleSpan.textContent = en ? '💬 Chat Log' : '💬 전체보기';
  const contribLbl = document.querySelector('#contribute-launcher .board-label');
  if (contribLbl) contribLbl.textContent = en ? 'Contribute' : '함께 만들기';
  const boardLbl = document.querySelector('#board-Launcher .board-label');
  if (boardLbl) boardLbl.textContent = en ? 'Board' : '게시판';
  const attrEl = document.getElementById('attribution');
  if (attrEl) {
    attrEl.innerHTML = en
      ? '© <a href="https://crazylabs.co.kr" target="_blank" rel="noopener">CrazyLabs</a> · <a href="https://github.com/dohoon84/bumpinto-world" target="_blank" rel="noopener">Source Available</a> · Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL)'
      : '© <a href="https://crazylabs.co.kr" target="_blank" rel="noopener">CrazyLabs</a> · <a href="https://github.com/dohoon84/bumpinto-world" target="_blank" rel="noopener">소스 공개 (영리 서비스 금지)</a> · 지도 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL)';
    // [corridor] 코리더 건물 높이 출처 (Overture footprint · 브이월드 GIS건물통합정보)
    if (corridorDir) attrEl.innerHTML += en
      ? ' · <a href="https://overturemaps.org" target="_blank" rel="noopener">Overture Maps</a> · Building heights: <a href="https://www.vworld.kr" target="_blank" rel="noopener">VWorld</a> (MOLIT)'
      : ' · <a href="https://overturemaps.org" target="_blank" rel="noopener">Overture Maps</a> · 건물 높이: <a href="https://www.vworld.kr" target="_blank" rel="noopener">브이월드</a> (국토교통부)';
  }
  syncRideUi(true);
  syncHelpFoldUi();
  syncMyNameTag();
  renderEmoteBar();
  paintPresenceStatus();
  if (presenceOpen) renderPresencePanel();
  if (chatLogOpen) renderChatLogPanel();
}
document.getElementById('lang-launcher')?.addEventListener('click', () => {
  toggleLang();
});
onLangChange(() => syncGameLocale());
homeBtn.onclick = () => {
  if (bikes.riding) dismountBike();
  if (adminBike?.riding) adminBike.dismount(); // [bike]
  dismountRoadbikes();
  standUpFromSeat();
  wakeFromAfk();
  roadster?.stop?.();
  launch?.setCinematic?.(false);
  player.position.copy(pos);
  setMode('follow');
  rememberPlace(true);
};
// [corridor] 📍 이동 패널(T) · ?at=<역>|lotte · 성능 HUD(`)
function teleportTo(x, z) {
  if (bikes.riding) dismountBike();
  if (adminBike?.riding) adminBike.dismount();
  dismountRoadbikes();
  standUpFromSeat();
  wakeFromAfk();
  player.position.set(x, terrain ? terrain.getGroundHeight(x, z, 0) : 0, z);
  setMode('follow');
  rememberPlace(true);
}
const travel = corridor ? mountTravel({ corridor, home: () => homeBtn.onclick(), teleport: teleportTo }) : null;
if (corridor) { corridor.place = (id) => travel?.go(id); corridor.placeOf = (id) => travel?.dests.find((d) => d.id === id) || null; }
const perfHud = mountPerfHud({ renderer, corridor, params });
if (travel && params.get('at')) travel.go(params.get('at'));
const dogParkBtn = document.getElementById('btn-dogpark');
if (dogParkBtn) {
  if (!region.features?.dogPark) {
    dogParkBtn.hidden = true;
  } else {
    dogParkBtn.onclick = () => {
      if (bikes.riding) dismountBike();
      standUpFromSeat();
      wakeFromAfk();
      const tx = 89.0;
      const tz = -236.2;
      const ty = terrain ? terrain.getGroundHeight(tx, tz, -6) : 0;
      player.position.set(tx, ty, tz);
      player.rotation.y = Math.PI;
      setMode('follow');
      cam.yaw = 0.0;
      cam.pitch = 0.25;
      cam.dist = 13.0;
      rememberPlace(true);
      emitMyStateNow();
    };
  }
}
if (Array.isArray(region.quickSpots) && region.quickSpots.length) {
  const buttonsWrap = document.getElementById('buttons');
  for (const qs of region.quickSpots) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = `btn-spot-${qs.id}`;
    b.textContent = qs.label;
    if (qs.title) b.title = qs.title;
    b.onclick = () => {
      if (bikes.riding) dismountBike();
      if (adminBike?.riding) adminBike.dismount(); // [bike]
      dismountRoadbikes();
      standUpFromSeat();
      wakeFromAfk();
      roadster?.stop?.();
      launch?.setCinematic?.(false);
      let tx = qs.x, tz = qs.z;
      for (let r = 0, a = 0; (world.isBlocked(tx, tz) || world.onRoad(tx, tz)) && r < 40; a += 0.65, r += 0.4) {
        tx = qs.x + Math.cos(a) * r;
        tz = qs.z + Math.sin(a) * r;
      }
      const ty = terrain ? terrain.getGroundHeight(tx, tz, 0) : 0;
      player.position.set(tx, ty, tz);
      if (qs.ry != null) player.rotation.y = qs.ry;
      setMode('follow');
      if (qs.camYaw != null) cam.yaw = qs.camYaw;
      if (qs.camPitch != null) cam.pitch = qs.camPitch;
      if (qs.camDist != null) cam.dist = qs.camDist;
      rememberPlace(true);
      emitMyStateNow();
    };
    buttonsWrap?.insertBefore(b, globeBtn || leaveBtn);
    quickSpotBtns.push({ btn: b, qs });
  }
}
syncGameLocale();
function pauseWorldSession() {
  if (bikes.riding) dismountBike();
  if (adminBike?.summoned || adminBike?.riding) adminBike.stow();
  stowRoadbikes();
  inventory?.setOpen(false);
  if (trucks?.driving) trucks.exit();
  roadster?.stop?.();
  launch?.stop?.();
  rememberPlace(true);
  board.close();
  donationBoards.closeModal();
  handset.close();
  setPresenceOpen(false);
  setChatLogOpen(false);
  mySit = '';
  myAfk = false;
  myEmote = '';
  myEmoteUntil = 0;
  idleTime = 0;
  player.userData.sit = '';
  player.userData.afk = false;
  player.userData.emote = '';
  nameTag.el.classList.remove('is-afk');
  renderEmoteBar();
  joined = false;
  player.visible = false;
  nameTag.hidden = true;
  myBubble.item.hidden = true;
  presence.close();
  if (globeBtn) globeBtn.hidden = true;
  leaveBtn.hidden = true;
  rideUi = '';
  rideBtn.hidden = true;
  helpEl.textContent = getHelpWalk();
  inventory?.refresh();
}
if (globeBtn) {
  globeBtn.onclick = () => {
    if (!joined) return;
    setPassportActive(true);
    pauseWorldSession();
    reopenGate();
  };
}
leaveBtn.onclick = () => {
  if (!joined) return;
  setPassportActive(false);
  pauseWorldSession();
  startLobby?.();
};
input.onKey = (e) => {
  if (e.code === 'KeyM') viewBtn.onclick();
  if (e.code === 'KeyH') document.getElementById('btn-home').onclick();
  if (e.code === 'KeyP' && !e.repeat && region.features?.dogPark) dogParkBtn?.onclick();
  if (e.code === 'Enter') { e.preventDefault(); chatInput.focus(); }
  if (e.code === 'KeyE' && !e.repeat) toggleRide();
  if (e.code === 'KeyU' && !e.repeat) umbrellas.handleHotkeyU();
  if (e.code === 'KeyG' && !e.repeat && dogPark.nearGate) dogPark.toggleGate();
  if (e.code === 'KeyF' && !e.repeat) {
    if (donationBoards.isNear) donationBoards.openModal('hotkey_f');
    else if (dogPark.nearGate) dogPark.toggleGate();
  }
  if (e.code === 'KeyZ' && !e.repeat) toggleAfk();
  if (e.code === 'Space' && !e.repeat) triggerJump();
  const emoteDef = EMOTE_BY_CODE[e.code];
  if (emoteDef) triggerEmote(emoteDef.id, true);
};
const ov = { yaw: 0.35, pitch: 0.95, dist: 1000 };
const phone = mountPhone({ data, region, extraTiles: corridor ? () => corridor.mapTiles() : null }); // [corridor]

let placeAt = 0, placeMark = '';
function rememberPlace(force = false) {
  if (!joined || !sms.session) return;
  const p = player.position;
  const here = `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)},${player.rotation.y.toFixed(2)}`;
  const now = performance.now();
  if (!force && (now - placeAt < 8000 || here === placeMark)) return;
  placeAt = now; placeMark = here;
  if (sms.session) sms.session.place = { x: p.x, y: p.y, z: p.z, ry: player.rotation.y };
  sms.savePlace({ x: p.x, y: p.y, z: p.z, ry: player.rotation.y });
}
addEventListener('pagehide', () => { rememberPlace(true); presence.close(); });
addEventListener('beforeunload', () => { rememberPlace(true); presence.close(); });
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    presence.close();
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') rememberPlace(true);
});

function mergeVehicleNets(...parts) {
  const out = {};
  const pv = [];
  for (const part of parts) {
    if (!part) continue;
    const { veh, ...rest } = part;
    if (veh?.pk) pv.push(veh);
    else if (veh) {
      Object.assign(out, rest);
      out.veh = veh;
    } else Object.assign(out, rest);
  }
  if (pv.length) out.pv = pv;
  return out;
}
function emitMyStateNow() {
  if (!joined) return;
  const aboard = !!(adminBike?.riding || roadRiding());
  presence.sendState(
    {
      x: player.position.x,
      z: player.position.z,
      ry: player.rotation.y,
      moving: moveSpeed > 0,
      riding: !!bikes.riding,
      jy: Number(jumpY.toFixed(2)),
      emote: bikes.riding || aboard ? '' : myEmote,
      sit: bikes.riding || aboard ? '' : mySit,
      afk: bikes.riding || aboard ? false : myAfk,
      umb: bikes.riding || aboard ? '' : (umbrellas.umbrellaTheme || ''),
      ...mergeVehicleNets(trucks?.net(), adminBike?.net(), roadbike?.net(), roadbikeWhite?.net()),
    },
    true,
  );
}

// 백그라운드 탭에서도 30초 자동 자리비움 전환 및 멀티플레이 상태 동기화가 멈추지 않도록 보조 타이머 실행
let lastFrameAt = performance.now();
setInterval(() => {
  if (!joined || document.body.classList.contains('in-gate') || document.body.classList.contains('in-lobby')) return;
  const now = performance.now();
  // requestAnimationFrame이 백그라운드에서 멈춘 경우(0.5초 이상 경과)
  if (now - lastFrameAt > 500) {
    if (!bikes.riding && !adminBike?.riding && !roadRiding() && !myEmote && !handset.open && !board.open) {
      idleTime += 1.0;
      if (!myAfk && idleTime >= AFK_TIMEOUT_SEC) {
        myAfk = true;
        if (!mySit) mySit = 'ground';
        player.userData.sit = mySit;
        player.userData.afk = true;
        syncMyNameTag();
        renderEmoteBar();
      }
    }
    emitMyStateNow();
  }
}, 1000);
const timer = new THREE.Timer();
const tmp = new THREE.Vector3();
let moveSpeed = 0;
function frame() {
  lastFrameAt = performance.now();
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
  const { f, s, run, jump } = input.axes();
  if (dy || dp || dz || f || s || jump) wakeFromAfk();
  if (joined && jump && !board.open && jumpY <= 0.001 && !adminBike?.riding && !roadRiding()) { // [bike] [roadbike]
    if (mySit) {
      standUpFromSeat();
      renderEmoteBar();
    }
    jumpVel = bikes.riding ? BIKE_JUMP_V : JUMP_V;
  }
  if (jumpY > 0 || jumpVel > 0) {
    jumpY += jumpVel * dt;
    jumpVel -= JUMP_GRAVITY * dt;
    if (jumpY <= 0) {
      jumpY = 0;
      jumpVel = 0;
    }
  }
  moveSpeed = 0;
  const cycling = !!(roadbike?.update(dt, f, s, run, dy) || roadbikeWhite?.update(dt, f, s, run, dy)); // [roadbike]
  const cruising = !!adminBike?.update(dt, cycling ? 0 : f, cycling ? 0 : s, cycling ? false : run, dy, !cycling && jump && !board.open); // [bike] Space = 앞바퀴 들기(윌리)
  const driving = trucks?.update(dt, (cruising || cycling) ? 0 : f, (cruising || cycling) ? 0 : s, run, dy) || cruising || cycling; // [truck] [bike] [roadbike]
  if ((cruising || cycling) && bikes.riding) {
    clearRidePose(player);
    bikes.dismount();
    jumpY = 0;
    jumpVel = 0;
  } else if (driving && bikes.riding) dismountBike();
  if (driving) {
    moveSpeed = Math.abs((cycling ? (roadMount()?.bike.v || 0) : cruising ? adminBike.bike.v : trucks.current?.v) || 0);
    idleTime = 0;
    if (cruising || cycling) {
      mySit = '';
      myAfk = false;
      myEmote = '';
      myEmoteUntil = 0;
      player.userData.sit = '';
      player.userData.afk = false;
      player.userData.emote = '';
      player.userData.jumpY = 0;
    }
  } else if (joined && bikes.riding) {
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
    b.mesh.position.y = (b.y || 0) + jumpY;
    seatPlayer();
    moveSpeed = Math.abs(bikes.speed);
    player.userData.phoneOpen = false;
    animateRide(player, moveSpeed, dt);
    bikes.spin(dt);
  } else {
    if (joined && (f || s)) {
      if (mySit) {
        standUpFromSeat();
        renderEmoteBar();
      }
      const yaw = cam.mode === 'follow' ? cam.yaw : ov.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
      let mx = fx * f + rx * s, mz = fz * f + rz * s; const L = Math.hypot(mx, mz); mx /= L; mz /= L;
      const sp = (run ? 9 : 4.2) * Math.min(1, Math.hypot(f, s)), step = sp * dt;
      const p = player.position, bb = world.bounds;
      const nx = THREE.MathUtils.clamp(p.x + mx * step, bb.x0, bb.x1), nz = THREE.MathUtils.clamp(p.z + mz * step, bb.z0, bb.z1);
      // 현재 위치가 구조물 충돌 반경 내부에 끼어 있는 경우, 장애물에서 멀어지는 방향으로는 탈출 허용
      const stuckNow = world.isBlocked(p.x, p.z);
      if (terrain) { // [terrain] 계단/경사/다리 판정 + 높이 따라가기 (축별 슬라이딩 유지)
        let y;
        if ((!world.isBlocked(nx, p.z) || stuckNow) && !bikes.blocks(nx, p.z, null, p.y) && (y = terrain.canMove(p.x, p.z, p.y, nx, p.z)) != null) { p.x = nx; p.y = y; }
        if ((!world.isBlocked(p.x, nz) || stuckNow) && !bikes.blocks(p.x, nz, null, p.y) && (y = terrain.canMove(p.x, p.z, p.y, p.x, nz)) != null) { p.z = nz; p.y = y; }
      } else {
        if ((!world.isBlocked(nx, p.z) || stuckNow) && !bikes.blocks(nx, p.z, null, p.y)) p.x = nx;
        if ((!world.isBlocked(p.x, nz) || stuckNow) && !bikes.blocks(p.x, nz, null, p.y)) p.z = nz;
      }
      const target = Math.atan2(mx, mz);
      player.rotation.y += Math.atan2(Math.sin(target - player.rotation.y), Math.cos(target - player.rotation.y)) * Math.min(1, dt * 12);
      moveSpeed = sp;
    }
    if (!terrain && player.position.y !== 0) player.position.y = 0; // [terrain] 지형이 있으면 둔치 높이를 유지

    // 빈백·벤치 근처 좌석 감지하여 하단 앉기 버튼 문구 자동 전환
    const foundSeat = !mySit && joined ? stationPlaza.findSeat?.(player.position.x, player.position.z) : null;
    if ((foundSeat?.label || '') !== (nearSeatHint?.label || '')) {
      nearSeatHint = foundSeat || null;
      if (!emoteFolded) renderEmoteBar();
    }

    // 30초 동안 아무 입력이 없으면 자동 대기모드(자리비움/졸기) 전환
    if (joined && moveSpeed < 0.05 && !myEmote && !handset.open && !board.open) {
      idleTime += dt;
      if (!myAfk && idleTime >= AFK_TIMEOUT_SEC) {
        myAfk = true;
        if (!mySit) {
          if (foundSeat) {
            sitExitPos = {
              x: foundSeat.exitX ?? player.position.x,
              z: foundSeat.exitZ ?? player.position.z,
            };
            const ty = terrain ? terrain.getGroundHeight(foundSeat.x, foundSeat.z, player.position.y) : 0;
            player.position.set(foundSeat.x, ty, foundSeat.z);
            player.rotation.y = foundSeat.ry;
            mySit = foundSeat.kind;
          } else {
            sitExitPos = null;
            mySit = 'ground';
          }
        }
        syncMyNameTag();
        renderEmoteBar();
        emitMyStateNow();
      }
    } else {
      idleTime = 0;
    }

    if (myAfk) {
      myZzzTimer -= dt;
      if (myZzzTimer <= 0) {
        myZzzTimer = 1.6;
        emoteFx.spawnZzz(player.position);
      }
    }

    if (myEmote && (performance.now() > myEmoteUntil || moveSpeed > 6.5)) {
      myEmote = '';
      myEmoteUntil = 0;
      if (!emoteFolded) {
        emoteBar?.querySelectorAll('.emote-btn.active').forEach((b) => b.classList.remove('active'));
      }
    }
    player.userData.phoneOpen = handset.open;
    player.userData.jumpY = jumpY;
    player.userData.emote = myEmote;
    player.userData.sit = mySit;
    player.userData.afk = myAfk;
    player.userData.umbrella = umbrellas.umbrellaTheme || '';
    animateAvatar(player, moveSpeed, dt);
  }
  syncRideUi();
  if (joined) {
    const aboard = cruising || cycling;
    presence.sendState({ x: player.position.x, z: player.position.z, ry: player.rotation.y, moving: moveSpeed > 0, riding: !!bikes.riding, jy: Number(jumpY.toFixed(2)), emote: bikes.riding || aboard ? '' : myEmote, sit: bikes.riding || aboard ? '' : mySit, afk: bikes.riding || aboard ? false : myAfk, umb: bikes.riding || aboard ? '' : (umbrellas.umbrellaTheme || ''), ...mergeVehicleNets(trucks?.net(), adminBike?.net(), roadbike?.net(), roadbikeWhite?.net()) }); // [bike] [roadbike]
  }
  rememberPlace();

  const rush = atmosphere.state.rush || 'normal';
  if (rush !== rushNow) {
    rushNow = rush;
    npcs.setCrowdLevel(rush);
  }
  npcs.update(dt, player.position, camera);
  transit?.update(dt, player.position);
  taxis?.update(dt); // [taxi]
  police?.update(dt, player.position, { riding: !!bikes.riding });
  riverFolk?.update(dt, player.position);
  stationPlaza.update(dt, player.position);
  dogPark.update(dt, player.position);
  {
    const doorPeople = [player.position];
    for (const n of npcs.list) if (n.active !== false) doorPeople.push(n.pos);
    for (const p of remotes.list()) doorPeople.push(p);
    updateStarbucksDoor(world.starbucksRooms?.door, dt, doorPeople);
    stationCafe.update(
      joined ? player.position : null,
      !!player.userData.coffee,
      !!(joined && trashBins.near(player.position.x, player.position.z)),
    );
  }
  strayCats.update(dt, {
    player: player.position,
    remotes: remotes.list(),
    npcs: npcs.list,
    folk: riverFolk?.actors,
  });
  donationBoards.update(dt, joined ? player.position : null);
  umbrellas.update(dt, joined ? player.position : null, player.rotation.y);
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
    const usePlayerCenter = (region.id === 'starbase' && joined && st.x === 0 && st.z === 0) || (corridor && joined && !corridor.inLive(P.x, P.z)); // [corridor] 코리더에선 내 위치 중심
    const cx = usePlayerCenter ? P.x : st.x;
    const cz = usePlayerCenter ? P.z : st.z + 60;
    const c = new THREE.Vector3(cx, 0, cz);
    tmp.set(Math.sin(ov.yaw) * Math.cos(ov.pitch), Math.sin(ov.pitch), Math.cos(ov.yaw) * Math.cos(ov.pitch)).multiplyScalar(ov.dist);
    camera.position.copy(c).add(tmp); camera.lookAt(c);
    sun.target.position.copy(c);
  }
  if (corridor) { const c = cam.mode === 'follow' ? P : sun.target.position; corridor.update(dt, c.x, c.z, cam.mode); } // [corridor] 타일 스트리밍(프레임당 최대 1개 빌드)
  const viewYaw = cam.mode === 'follow' ? cam.yaw : ov.yaw;
  const moveYaw = player.rotation.y + (bikes.riding && bikes.speed < -0.2 ? Math.PI : 0);
  phone.tick({
    x: player.position.x, z: player.position.z, dt,
    moving: moveSpeed > 0.25,
    moveYaw, lookYaw: Math.atan2(-Math.sin(viewYaw), -Math.cos(viewYaw)),
    peers: remotes.list(),
  });
  atmosphere.update(dt, camera);
  roadster?.update(dt); // [roadster] 시네마틱 카메라가 켜져 있으면 camera/sun.target 덮어씀
  launch?.update(dt); // [launch] 5분 주기 발사·핫스테이징·젓가락 캐치 쇼
  sun.position.copy(sun.target.position).addScaledVector(atmosphere.sunDir, 500);
  renderer.render(scene, camera);
  perfHud.tick();
  overlay.update(innerWidth, innerHeight);
  emoteFx.update(dt, innerWidth, innerHeight);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
requestAnimationFrame(frame);

// 스크린샷/디버그용 훅
window.__jj = {
  ready: true, region, tower, renderer, corridor, // [corridor]
  launch, roadster, trucks, bike: adminBike, roadbike, inventory, data, world, npcs, transit, camera, cam, ov, setMode, terrain, taxis, police, weather: atmosphere, umbrellas, dogPark, strayCats, // [terrain] [taxi] [roadster] [tower] [launch] [truck] [bike] [roadbike] [inventory]
  get player() { return player; },
  teleport(x, z, y) { if (bikes.riding) dismountBike(); if (adminBike?.riding) adminBike.dismount(); dismountRoadbikes(); player.position.set(x, y ?? (terrain ? terrain.getGroundHeight(x, z, 0) : 0), z); }, // [terrain] [bike] [roadbike]
  bikes, toggleRide, triggerEmote,
  nearNpc(i = 0, d = 3) { const n = npcs.list[i]; player.position.set(n.pos.x + d, 0, n.pos.z + d * 0.5); },
};
