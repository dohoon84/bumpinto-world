// [ride] 코리더(수내 → 잠실) 버스·택시 탑승. game.js 가 corridor 가 있을 때만 mountRide 를 부른다(?corridor=0 이면 없음).
//
//   버스: 정류장에 버스가 서면(정차 중) E 로 탑승 → 좌석에 앉아 실제 노선(OSM)·정류장 순서대로 이동.
//         달리는 중 E = 하차 벨(다음 정류장에서 내림), 정차 중 E = 지금 내리기. 종점 구간이 끝나면 자동 하차.
//   택시: Y(또는 폰 '택시' 앱)로 호출 → 가장 가까운 코리더 택시가 차도 그래프(A*, 일방통행)로 와서 길가에 섬 → E 로 탑승
//         → 목적지(역·랜드마크 목록 또는 지도에서 선택) + 일반 / 빨리감기(×6) / 즉시 도착(프리미엄 예정, 지금 0원).
//   요금: 모든 탑승은 fare.charge() 를 거친다(지금은 0원). 탑승 기록은 rideLog(localStorage).
//   멀티: 서버 변경 없이 기존 상태 필드 sit 에 'bus:<경로>:<좌석>:<d|r>' / 'taxi:<도색>:<d|r>' 를 싣고, x/z/ry 는 차량 중심·방향.
//         다른 사람 화면에서는 같은 경로의 '유령 버스'(탑승용 모델)에 앉은 모습으로 보인다.
//         같은 버스에 같이 타면(같은 경로·40m 이내) id 가 작은 사람이 기준(리더)이 되고 나머지는 리더의 방송 위치를 따라간다.
import * as THREE from 'three';
import { samplePath, projectOnPath } from '../transit/busSource.js';
import { liveryOf } from '../transit/livery.js';
import { createTaxi, TAXI_LIVERIES, disposeTaxi } from '../entities/taxiModel.js';
import { disposeBus } from '../transit/busModel.js';
import { animateAvatar } from '../entities/avatar.js';
import { isEn } from '../i18n.js';
import { charge } from './fare.js';
import { createRideLog } from './rideLog.js';
import { createWallet } from './wallet.js';
import { createRideBus } from './cabin.js';
import { astar, routeLength, nearestCurbEdge, findStopAhead } from './route.js';
import { createRideSound, announceText } from './sound.js';

const BOARD_R = 12, HOLD_MAX = 20, CO_R = 40, GHOST_JOIN = 16, FF = 6;
const TAXI_CALL_TIMEOUT = 240, TAXI_WALK_AWAY = 160, TAXI_BOARD_R = 10;
const LIV_KEYS = Object.keys(TAXI_LIVERIES);
// [ride] 일반 주행 택시 속도 배수: 도로 종류별 기본 속도(차량별 편차 vf 제외) × 2.2, 상한 100km/h(entities/taxis.js VCAP)
//   → 간선(secondary) ≈95, primary/trunk 100, tertiary ≈79, 주택가 ≈55 km/h. 빨리감기 ×6·즉시 도착은 이 위에서 그대로
const TAXI_VMUL = 2.2;
const ANN_SEC = 9; // [ride] 정류장 도착 몇 초 전에 안내 방송
// [ride] 정자(라이브) 목적지 — 정자 차도가 붙어 있을 때(cars.jz)만 목록에 나옴. 좌표는 jeongja.json 라벨/역 출구(같은 로컬 좌표계)
const JZ_DESTS = [
  { id: 'jz-station', ko: '정자역', en: 'Jeongja Stn.', x: 5.7, z: 31.4 },
  { id: 'jz-naver', ko: '네이버 그린팩토리', en: 'Naver Green Factory', x: -288, z: 776 },
  { id: 'jz-doosan', ko: '분당두산타워', en: 'Doosan Tower', x: -255, z: 256 },
  { id: 'jz-cafe', ko: '정자동 카페거리', en: 'Jeongja Café Street', x: 512, z: 365 },
  { id: 'jz-kftc', ko: '금융결제원', en: 'KFTC', x: -312, z: -366 },
];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const L = (ko, en) => (isEn() ? en : ko);

export function parseRideSit(s) {
  if (typeof s !== 'string') return null;
  let m = /^bus:(\d{1,4}):(\d{1,3}):([dr])$/.exec(s);
  if (m) return { kind: 'bus', path: +m[1], seat: +m[2], dwell: m[3] === 'd' };
  m = /^taxi:(\d{1,2}):([dr])$/.exec(s);
  if (m) return { kind: 'taxi', liv: +m[1], stopped: m[2] === 'd' };
  return null;
}

export function mountRide({ corridor, getPlayer, remotes, camera, cam, setMode, canvas, travel, handset, prepare, canBoard, emitNow, myId, params = null, liveObstacles = null, jzBuses = null }) {
  const pl = getPlayer;
  const log = createRideLog();
  const wallet = createWallet();
  wallet.card(); // 무료 체험 카드 자동 발급
  const B = () => corridor.life?.buses || null;
  // [ride] 정자 버스(?bus=sim 일 때만 game.js 가 넘김). 정자 경로는 P._jz, 방송용 경로 번호는 JZ_OFF + 인덱스
  const JB = () => jzBuses?.() || null;
  const JZ_OFF = 9000;
  const sysOf = (P) => (P?._jz ? JB() : B());
  const pathByIdx = (i) => (i >= JZ_OFF ? JB()?.sim.paths[i - JZ_OFF] : B()?.sim.paths[i]);
  const TR = () => corridor.life?.traffic || null;
  const camPref = { bus: '1p', taxi: '3p' };
  let ride = null; // 현재 탑승/호출 상태
  let busy = false;
  const ghosts = new Map(); // key -> { mesh, kind, P?, path?, pos, ry, dwell, peers, used }
  // [memory] 고스트 메시 해제: 버스는 disposeBus(노선 텍스처 참조 반환), 택시는 disposeTaxi(공유 자원 유지)
  const disposeGhostMesh = (g) => (g.kind === 'taxi' ? disposeTaxi(g.mesh) : disposeBus(g.mesh));
  let ghostSeq = 0;
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  const stats = { boards: 0, alights: 0, charges: [], announces: [], bells: 0 };
  const sound = createRideSound({ params });
  const JZ = () => !!TR()?.cars?.jz; // 정자 차도가 코리더 그래프에 붙어 있음(정자에서도 택시)

  // ---------- HUD ----------
  const hud = document.createElement('div'); hud.id = 'ride-hud'; hud.hidden = true; document.body.appendChild(hud);
  const toastEl = document.createElement('div'); toastEl.id = 'ride-toast'; toastEl.hidden = true; document.body.appendChild(toastEl);
  const panel = document.createElement('div'); panel.id = 'ride-taxi-panel'; panel.hidden = true; document.body.appendChild(panel);
  const capEl = document.createElement('div'); capEl.id = 'ride-caption'; capEl.hidden = true; document.body.appendChild(capEl); // 안내 방송 자막
  const busCard = document.createElement('div'); busCard.id = 'ride-bus-card'; busCard.hidden = true; document.body.appendChild(busCard); // 좌측 하단 내 버스
  const mapEl = document.createElement('div'); mapEl.id = 'ride-route-map'; mapEl.hidden = true; document.body.appendChild(mapEl); // 노선도
  let toastT = 0, capT = 0;
  const toast = (msg, sec = 3.5) => { toastEl.textContent = msg; toastEl.hidden = false; toastT = sec; };
  const caption = (txt, sec = 7) => { capEl.innerHTML = `<span class="ic">📢</span>${esc(txt)}`; capEl.hidden = false; capT = sec; };
  const onHudClick = (e) => {
    const b = e.target.closest('[data-ride]'); if (!b) return;
    const a = b.dataset.ride;
    if (a === 'cam') toggleCam();
    else if (a === 'e') handleE();
    else if (a === 'cancel') cancelTaxi(true);
    else if (a === 'stop') requestStop();
    else if (a === 'voice') { sound.setMuted(!sound.muted); toast(sound.muted ? L('🔇 안내 방송·벨 소리 끔', '🔇 Announcements muted') : L('🔊 안내 방송·벨 소리 켬', '🔊 Announcements on'), 1.6); renderHud(); }
    else if (a === 'map') toggleRouteMap();
  };
  hud.addEventListener('click', onHudClick);
  busCard.addEventListener('click', onHudClick);
  mapEl.addEventListener('click', (e) => { if (e.target.closest('[data-map=close]') || e.target === mapEl) closeRouteMap(); });

  const stopName = (P, i) => sysOf(P)?.stopById.get(P.stops[i]?.stop)?.name || '';
  const pathIdxOf = (P) => { const bs = sysOf(P), i = bs ? bs.sim.paths.indexOf(P) : -1; return i >= 0 && P._jz ? JZ_OFF + i : i; };
  const terminusOf = (P) => { let Q = P; for (let k = 0; k < 4; k++) { const c = contOf(Q); if (!c) break; Q = c.Q; } return stopName(Q, Q.stops.length - 1); }; // [bus-net] 이어지는 경로가 있으면 그 끝
  // [bus-net] 노선 이어 타기: 탄 경로가 정자↔코리더 경계(또는 데이터 조각 끝)에서 끝나고 같은 번호 경로가 CONT_R m 안에서
  //   같은 방향으로 이어지면 버스(차체·좌석·카메라)는 그대로 두고 다음 경로로 옮겨 탄다. 요금·탑승 기록은 한 번.
  //   정자 쪽은 정자 시뮬 버스(?bus=sim)가 있을 때만 후보가 생긴다(실시간 모드에선 예전처럼 경계에서 하차).
  const CONT_R = 8;
  const DOOR_CLOSE_LEAD = 4; // [bus-sfx] 정차 끝나기 몇 초 전에 문 닫힘 소리
  const contCache = new Map();
  function contOf(P) {
    const key = (B() ? 1 : 0) + (JB() ? 2 : 0), hit = contCache.get(P);
    if (hit && hit.key === key) return hit.c;
    let best = null;
    const e = samplePath(P, P.L), e5 = samplePath(P, P.L - 5);
    for (const bs of [B(), JB()]) {
      if (!bs || bs.sim === sysOf(P)?.sim) continue; // 정자↔코리더 경계를 넘을 때만
      for (const Q of bs.sim.paths) {
        if (Q === P || Q.ref !== P.ref) continue;
        const a = samplePath(Q, 0), d = Math.hypot(a.x - e.x, a.z - e.z); if (d > CONT_R) continue;
        const a5 = samplePath(Q, 5); if (e5.dx * a5.dx + e5.dz * a5.dz < 0.3) continue;
        if (!best || d < best.d) best = { Q, bs, d };
      }
    }
    contCache.set(P, { key, c: best });
    return best;
  }
  function reparentBus(mesh, par) {
    if (mesh.parent === par) return;
    mesh.updateMatrixWorld(true); par.updateMatrixWorld(true);
    const e = mesh.matrixWorld.elements, pe = par.matrixWorld.elements;
    const wyaw = Math.atan2(e[8], e[10]), pyaw = Math.atan2(pe[8], pe[10]);
    tmpV.setFromMatrixPosition(mesh.matrixWorld); par.worldToLocal(tmpV);
    par.add(mesh);
    mesh.position.copy(tmpV); mesh.rotation.set(0, wyaw - pyaw, 0); mesh.scale.set(1, 1, 1);
    mesh.updateMatrixWorld(true);
  }
  function transferBus(c) {
    const r = ride, old = sysOf(r.P), b = r.b, Q = c.Q, nbs = c.bs;
    const over = Math.max(0, b.s - r.P.L);
    r.dist0 = (r.dist0 || 0) + Math.max(0, Math.min(b.s, r.P.L) - r.startS);
    if (r.fromName == null) r.fromName = stopName(r.P, r.fromIdx);
    let nb;
    if (r.follow) nb = { id: 'f' + (++ghostSeq), P: Q, s: Math.max(0.01, over), v: b.v, dwell: 0, stopIdx: 0, state: 'run', age: 9, out: 0 };
    else {
      if (old) { old.sim.buses = old.sim.buses.filter((x) => x !== b); old.hideIds.delete(b.id); }
      nb = nbs.sim._spawn(Q, Math.max(0.01, over)); nb.v = b.v; nb.age = 9;
    }
    nb.stopIdx = Q.stops.findIndex((st) => st.s > nb.s + 1); if (nb.stopIdx < 0) nb.stopIdx = Q.stops.length;
    // 코리더 버스 그룹은 정자 안에서 숨으므로 그 부모(항상 보임)에 붙임.
    // [bus-fix] attach() 는 월드 변환을 보존하며 회전을 (±180°, 180°-yaw, ±180°) 같은 다른 오일러로 풀어 버려,
    //   이후 placeBus 가 rotation.y 만 고치면 차가 옆으로/거꾸로 달렸다 → add() 후 회전을 (0, 월드 yaw - 부모 yaw, 0) 으로 다시 세운다
    reparentBus(r.mesh, nbs.group.parent || nbs.group);
    r.b = nb; r.P = Q; r.path = pathIdxOf(Q); r.startS = nb.s; r.fromIdx = -1; r.annIdx = -1; r.lastDwellIdx = -1; r.legs = (r.legs || 1) + 1;
    nbs.hideIds.add(nb.id);
    stats.transfers = (stats.transfers || 0) + 1;
    emitNow();
  }
  const placeName = (x, z) => {
    let best = null, bd = 700;
    for (const d of [...(travel?.dests || []), ...(JZ() ? JZ_DESTS : [])]) { if (d.x == null) continue; const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd) { bd = dd; best = d; } }
    return best ? L(`${best.ko} 근처`, `near ${best.en}`) : L('길가', 'Roadside');
  };
  const card = () => wallet.card();

  // ---------- 버스: 탈 수 있는 버스 찾기 ----------
  function boardable() {
    if (ride?.mode === 'bus') return null;
    const p = pl().position;
    const bs = corridor.inLive(p.x, p.z) ? JB() : B(); // [ride] 정자 안: 정자 시뮬 버스(?bus=sim)만, 없으면 탑승 없음(이전과 같음)
    if (!bs) return null;
    const vis = new Set(bs.near.map((v) => v.id));
    let best = null, bd = BOARD_R;
    for (const b of bs.sim.buses) {
      if (b.state !== 'dwell' || !(b.dwell > 0) || !vis.has(b.id)) continue;
      const q = samplePath(b.P, b.s), d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) { bd = d; best = { kind: 'sim', b, P: b.P, stopIdx: b.stopIdx }; }
    }
    for (const g of ghosts.values()) {
      if (g.kind !== 'bus' || !g.dwell || g.mine) continue;
      const d = Math.hypot(g.mesh.position.x - p.x, g.mesh.position.z - p.z);
      if (d < bd) { bd = d; best = { kind: 'ghost', g, P: g.P }; }
    }
    return best;
  }

  async function boardBus(c) {
    if (busy || !canBoard()) return false;
    if (ride?.mode === 'taxi') cancelTaxi(false);
    sound.prepareBus(); // [bus-sfx] 첫 탑승(사용자 입력 안)에서만 효과음 내려받기 + 오디오 재개
    busy = true;
    const res = await charge({ code: 'bus.base', mode: 'bus', card: card().id, meta: { route: c.P.ref } });
    busy = false; stats.charges.push(res);
    if (!res.ok) { toast(L('결제에 실패했어요: ', 'Payment failed: ') + res.error); return false; }
    prepare();
    const bs = sysOf(c.P), P = c.P;
    let b, follow = null;
    if (c.kind === 'sim') { b = c.b; b._hold = 0; b.dwell = Math.max(b.dwell, DOOR_CLOSE_LEAD + 1.5); } // 막 탄 사람 뒤로 문 닫히는 시간 확보
    else {
      const s = c.g.s;
      let si = P.stops.findIndex((st) => Math.abs(st.s - s) < 10); if (si < 0) si = P.stops.findIndex((st) => st.s > s);
      b = { id: 'f' + (++ghostSeq), P, s, v: 0, dwell: 1, stopIdx: si < 0 ? P.stops.length : si, state: 'dwell', age: 9, out: 0 };
      follow = [...c.g.peers].sort()[0];
    }
    const mesh = createRideBus(P.ref, P.type, P.name);
    bs.group.add(mesh);
    const used = new Set(c.kind === 'ghost' ? c.g.seats : []);
    const order = mesh.userData.ride.order;
    const seat = order.find((i) => !used.has(i)) ?? order[0];
    ride = { mode: 'bus', b, P, path: pathIdxOf(P), mesh, seat, follow, bell: false, fromIdx: b.stopIdx, startS: b.s, t0: performance.now(), at: Date.now(), fare: res, dwell: true, lastDwellIdx: b.stopIdx };
    stats.boards++;
    ride.au = { prev: true, closed: false, brakeIdx: -1, taps: Math.floor(Math.random() * 3), tapT: 0.9 + Math.random() * 0.5 };
    sound.sfx('card-tap-v2'); // 내 카드 찍는 소리
    if (c.kind === 'ghost') { ghosts.delete(c.g.key); c.g.mesh.parent?.remove(c.g.mesh); c.g.mesh.userData.releaseLights?.(); disposeGhostMesh(c.g); }
    placeBus(0);
    toast(L(`🚌 ${P.ref}번 탑승 · ${terminusOf(P)} 방면 — 요금 ${res.amount}원 (무료 체험 카드)`, `🚌 Boarded bus ${P.ref} toward ${terminusOf(P)} — fare ₩${res.amount} (Free Trial Card)`));
    emitNow();
    return true;
  }

  function placeBus(dt) {
    const r = ride, b = r.b, q = samplePath(r.P, b.s), bs = sysOf(r.P);
    const hd = Math.atan2(q.dx, q.dz);
    const y = (bs.vgy || bs.gy)(q.x, q.z, r.mesh.position.y || 0) + 0.08; // [vehicle-h] 차량 높이(다리 상판을 따라감)
    if (!r.placed) { r.mesh.rotation.y = hd; r.placed = true; }
    r.mesh.rotation.x = 0; r.mesh.rotation.z = 0; // [bus-fix] 탑승 버스는 항상 수평(yaw 만)
    r.mesh.position.set(q.x, y, q.z);
    r.mesh.rotation.y += Math.atan2(Math.sin(hd - r.mesh.rotation.y), Math.cos(hd - r.mesh.rotation.y)) * Math.min(1, dt * 10 || 1);
    r.mesh.updateMatrixWorld(true);
    const seat = r.mesh.userData.ride.seats[r.seat];
    pl().position.copy(r.mesh.localToWorld(tmpV.copy(seat.local)));
    pl().rotation.y = r.mesh.rotation.y;
  }

  function alightBus(reason = 'bell') {
    const r = ride; if (!r || r.mode !== 'bus') return;
    const bs = sysOf(r.P), P = r.P, b = r.b;
    const atIdx = r.dwell ? b.stopIdx : -1;
    // 하차 위치: 정차 중인 정류장 쉘터 앞 인도 → 아니면 차 오른쪽(문 쪽) 3.2m
    let x, z;
    const stop = atIdx >= 0 ? bs?.stopById.get(P.stops[atIdx]?.stop) : null;
    const q = samplePath(P, b.s);
    if (stop?._pos) { const k = 0.55; x = stop._pos.x * k + (q.x - q.dz * 1.8) * (1 - k); z = stop._pos.z * k + (q.z + q.dx * 1.8) * (1 - k); }
    else { x = q.x - q.dz * 3.4; z = q.z + q.dx * 3.4; }
    const sp = corridor.freeSpot(x, z);
    endBusRide(reason, atIdx);
    pl().position.set(sp.x, bs?.gy(sp.x, sp.z, pl().position.y) ?? pl().position.y, sp.z);
    pl().rotation.y = Math.atan2(-q.dz, q.dx);
  }

  function endBusRide(reason, atIdx = -1) {
    const r = ride; if (!r || r.mode !== 'bus') return;
    const bs = sysOf(r.P);
    if (bs) { bs.hideIds.delete(r.b.id); }
    r.b.ride = false;
    sound.stopBus();
    r.mesh.parent?.remove(r.mesh); r.mesh.userData.releaseLights?.(); disposeBus(r.mesh);
    const toIdx = atIdx >= 0 ? atIdx : r.P.stops.reduce((bi, st, i) => (Math.abs(st.s - r.b.s) < Math.abs(r.P.stops[bi].s - r.b.s) ? i : bi), 0);
    log.add({ mode: 'bus', route: r.P.ref, routeName: `${terminusOf(r.P)} 방면`, from: (r.fromName ?? stopName(r.P, r.fromIdx)) || placeName(pl().position.x, pl().position.z), to: (atIdx >= 0 ? stopName(r.P, toIdx) : placeName(pl().position.x, pl().position.z)), distM: (r.dist0 || 0) + Math.max(0, r.b.s - r.startS), durSec: (performance.now() - r.t0) / 1000, at: r.at, end: Date.now(), fare: r.fare, speed: 'normal' });
    ride = null; stats.alights++;
    pl().visible = true;
    const msg = { bell: L('🔔 하차했어요', '🔔 You got off'), terminus: L('종점 구간이라 하차했어요', 'End of the line — you got off'), end: L('버스 운행이 끝나 하차했어요', 'The bus ended its run — you got off'), teleport: L('이동하면서 버스에서 내렸어요', 'Left the bus (teleport)'), now: L('하차했어요', 'You got off') }[reason];
    if (msg) toast(msg);
    handset?.refreshApp('wallet');
    emitNow();
  }

  function updateBus(dt) {
    const r = ride, bs = sysOf(r.P);
    if (!bs) { endBusRide('end'); return; }
    const b = r.b, P = r.P;
    if (r.follow) {
      const lp = remotes.peers.get(r.follow), info = lp && parseRideSit(lp.sit);
      const cf = info?.kind === 'bus' && info.path !== r.path ? contOf(P) : null; // [bus-net] 앞사람이 이어지는 경로로 옮겨 탔으면 나도 따라 옮김
      if (cf && info.path === pathIdxOf(cf.Q)) { transferBus(cf); return; }
      if (!info || info.kind !== 'bus' || info.path !== r.path || Math.hypot(lp.target.x - r.mesh.position.x, lp.target.z - r.mesh.position.z) > 120) {
        // 리더가 내렸거나 끊김 → 내가 이 버스를 이어서 운행(로컬 시뮬에 넣음)
        b.id = bs.sim.nextId++; b.dwell = 0; b.state = 'run'; b.v = 0; b.age = 9; b.out = 0;
        b.stopIdx = P.stops.findIndex((st) => st.s > b.s + 1); if (b.stopIdx < 0) b.stopIdx = P.stops.length;
        bs.sim.buses.push(b); r.follow = null;
      } else {
        const ts = projectOnPath(P, lp.target.x, lp.target.z).s;
        const ds = ts - b.s; const prev = b.s;
        b.s = Math.abs(ds) > 60 ? ts : b.s + ds * Math.min(1, dt * 2.5);
        b.v = dt > 0 ? Math.abs(b.s - prev) / dt : 0;
        let si = P.stops.findIndex((st) => st.s > b.s - 6); if (si < 0) si = P.stops.length;
        const atStop = si < P.stops.length && Math.abs(P.stops[si].s - b.s) < 8;
        b.state = info.dwell && atStop ? 'dwell' : 'run'; b.dwell = b.state === 'dwell' ? 1 : 0;
        b.stopIdx = si;
      }
    } else {
      const cn = contOf(P); // [bus-net] 경로 끝에서 이어지는 경로로 옮겨 탐
      if (cn && (P.L - b.s < 1.5 || !bs.sim.buses.includes(b))) { transferBus(cn); return; }
      if (!bs.sim.buses.includes(b)) { alightBus('end'); return; }
      // 같은 버스에 탄 다른 사람 중 id 가 더 작은 사람이 있으면 그 사람을 기준으로 따라감
      const me = myId();
      if (me != null) for (const p of remotes.peers.values()) {
        const info = parseRideSit(p.sit);
        if (!info || info.kind !== 'bus' || info.path !== r.path || !(String(p.id) < String(me))) continue;
        if (Math.hypot(p.target.x - r.mesh.position.x, p.target.z - r.mesh.position.z) > CO_R) continue;
        bs.sim.buses = bs.sim.buses.filter((x) => x !== b); bs.hideIds.delete(b.id); r.follow = p.id; break;
      }
    }
    bs.hideIds.add(b.id);
    placeBus(dt);
    r.dwell = b.state === 'dwell' && b.dwell > 0;
    announce(r);
    busAudio(r, dt);
    if (r.dwell && b.stopIdx !== r.fromIdx) {
      if (r.bell) { alightBus('bell'); return; }
      if (b.stopIdx >= P.stops.length - 1 && !contOf(P)) { alightBus('terminus'); return; }
    }
    if (!r.follow && b.stopIdx >= P.stops.length && P.L - b.s < 25 && !contOf(P)) { alightBus('end'); return; }
  }

  // [bus-sfx] 내가 탄 버스 효과음: 감속 진입=브레이크, 정차 시작=문 열림, 정차 중=다른 승객 카드(0.4–0.9초 간격),
  //   정차 끝 DOOR_CLOSE_LEAD 초 전=문 닫힘, 정차→출발=출발음. 루프(공회전↔주행)는 매 프레임 속도로 크로스페이드
  function busAudio(r, dt) {
    const b = r.b, a = r.au || (r.au = { prev: r.dwell, closed: false, brakeIdx: -1, taps: 0, tapT: 0 });
    sound.busEngine(b.v || 0, r.dwell);
    if (r.dwell && !a.prev) {
      a.closed = false; a.taps = Math.floor(Math.random() * 4); a.tapT = 2 + Math.random() * 0.6;
      sound.sfx('door-open-v2');
    } else if (!r.dwell && a.prev) {
      if (!a.closed) { a.closed = true; sound.sfx('door-close-v2'); sound.sfx('bus-depart-v2', { delay: 1.2 }); } // 남은 정차 시간을 모를 때(함께 탄 사람)
      else sound.sfx('bus-depart-v2');
      a.brakeIdx = -1;
    }
    if (r.dwell) {
      if (!a.closed && !r.follow && b.dwell > 0 && b.dwell <= DOOR_CLOSE_LEAD) { a.closed = true; sound.sfx('door-close-v2'); }
      if (!a.closed && a.taps > 0 && (a.tapT -= dt) <= 0) { a.taps--; a.tapT = 0.4 + Math.random() * 0.5; sound.sfx('card-tap-v2', { gain: 0.45 }); }
    } else {
      const st = r.P.stops[b.stopIdx], v = b.v || 0;
      if (st && a.brakeIdx !== b.stopIdx && v > 1.5) { const d = st.s - b.s; if (d > 0 && d < v * v / 3.6 + 6) { a.brakeIdx = b.stopIdx; sound.sfx('bus-brake-v2'); } }
    }
    a.prev = r.dwell;
  }

  // [ride] 정류장 안내 방송: 다음 정류장 도착 ANN_SEC 초 전(또는 80m 안)에 한 번. 내가 탄 버스만
  function announce(r) {
    const P = r.P, b = r.b, i = b.stopIdx;
    if (r.dwell || i >= P.stops.length || i === r.fromIdx || r.annIdx === i) return;
    const d = P.stops[i].s - b.s;
    if (d < 0 || d > Math.max(80, (b.v || 0) * ANN_SEC)) return;
    r.annIdx = i;
    const en = isEn(), cur = stopName(P, i);
    if (!cur || cur === r.annName) return; // 같은 이름 정류장이 잇달아 있으면(OSM 양방향/중복 정류장) 한 번만
    let next = ''; for (let j = i + 1; j < P.stops.length && !next; j++) { const nm = stopName(P, j); if (nm && nm !== cur) next = nm; }
    if (!next) { const c = contOf(P); if (c) for (let j = 0; j < c.Q.stops.length && !next; j++) { const nm = stopName(c.Q, j); if (nm && nm !== cur) next = nm; } } // [bus-net] 경계 너머 다음 정류장
    const txt = announceText(cur, next, en);
    if (!txt) return;
    r.annName = cur;
    caption(txt);
    const spoke = sound.announce(txt, en); // [bus-sfx] 차임 → 음성
    stats.announces.push({ idx: i, text: txt, spoke });
  }

  // ---------- 노선도 (좌측 하단 버스 번호 / 상단 번호 칩 클릭, X·Esc 닫기) ----------
  let mapP = null, mapAcc = 0;
  function toggleRouteMap() { if (!mapEl.hidden) closeRouteMap(); else openRouteMap(); }
  function openRouteMap(P = ride?.mode === 'bus' ? ride.P : null) { if (!P) return false; mapP = P; renderRouteMap(true); mapEl.hidden = false; return true; }
  function closeRouteMap() { mapEl.hidden = true; mapP = null; }
  function renderRouteMap(scroll = false) {
    const P = mapP; if (!P) return;
    const en = isEn(), lv = liveryOf(P.type), mine = ride?.mode === 'bus' && ride.P === P ? ride : null;
    const b = mine?.b, s = b ? b.s : -1, dwell = mine?.dwell;
    const nextIdx = !b ? -1 : dwell ? b.stopIdx + 1 : b.stopIdx;
    const n = P.stops.length, col = lv.plain ? '#2c3e6b' : lv.color;
    // 지리 스케치(SVG): 경로 + 정류장 + 버스 위치
    const pts = P.pts || []; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const stride = Math.max(1, Math.floor(pts.length / 160));
    for (let k = 0; k < pts.length; k += stride) { const q = pts[k]; const x = q.x ?? q[0], z = q.z ?? q[1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    let svg = '';
    if (pts.length > 1 && Number.isFinite(x0)) {
      const W = 300, H = 120, sc = Math.min((W - 16) / Math.max(1, x1 - x0), (H - 16) / Math.max(1, z1 - z0));
      const X = (x) => 8 + (x - x0) * sc + ((W - 16) - (x1 - x0) * sc) / 2, Z = (z) => 8 + (z - z0) * sc + ((H - 16) - (z1 - z0) * sc) / 2;
      let dpath = ''; for (let k = 0; k < pts.length; k += stride) { const q = pts[k]; dpath += (k ? 'L' : 'M') + X(q.x ?? q[0]).toFixed(1) + ' ' + Z(q.z ?? q[1]).toFixed(1); }
      const dots = P.stops.map((st, i) => { const q = samplePath(P, st.s); return `<circle cx="${X(q.x).toFixed(1)}" cy="${Z(q.z).toFixed(1)}" r="${i === nextIdx ? 3.6 : 2.2}" class="${b && st.s < s - 1 && i !== nextIdx ? 'past' : i === nextIdx ? 'next' : ''}"/>`; }).join('');
      const me = b ? samplePath(P, s) : null;
      svg = `<svg class="geo" viewBox="0 0 ${W} ${H}"><path d="${dpath}" stroke="${col}" /><g>${dots}</g>${me ? `<text x="${X(me.x).toFixed(1)}" y="${(Z(me.z) + 5).toFixed(1)}" class="me">🚌</text>` : ''}</svg>`;
    }
    const rows = P.stops.map((st, i) => {
      const nm = stopName(P, i) || (en ? `Stop ${i + 1}` : `정류장 ${i + 1}`);
      const past = b && (dwell ? i < b.stopIdx : i < b.stopIdx);
      const cls = [past ? 'past' : '', i === nextIdx ? 'next' : '', dwell && i === b.stopIdx ? 'here' : '', i === 0 ? 'first' : '', i === n - 1 ? 'last' : ''].filter(Boolean).join(' ');
      const tag = i === nextIdx ? `<em>${en ? 'Next' : '다음'}</em>` : dwell && i === b.stopIdx ? `<em class="h">${en ? 'Now' : '정차 중'}</em>` : i === n - 1 ? `<em class="t">${en ? 'Terminus' : '종점'}</em>` : '';
      const bus = b && !dwell && i === b.stopIdx ? `<li class="bus" data-at="${i}"><span class="dot">🚌</span><span class="nm">${en ? 'Your bus' : '현재 위치'}</span></li>` : '';
      return `${bus}<li class="${cls}" data-i="${i}"><span class="dot"></span><span class="nm">${esc(nm)}</span>${tag}</li>`;
    }).join('') + (b && b.stopIdx >= n ? `<li class="bus"><span class="dot">🚌</span><span class="nm">${en ? 'Your bus' : '현재 위치'}</span></li>` : '');
    const dir = terminusOf(P);
    mapEl.innerHTML = `<div class="box" role="dialog" aria-label="${en ? 'Route map' : '노선도'}">
      <div class="hd"><span class="chip" style="background:${col}">${esc(P.ref)}</span><div class="tt"><b>${en ? `Route ${esc(P.ref)} map` : `${esc(P.ref)}번 노선도`}</b><small>${en ? `${esc(stopName(P, 0))} → toward ${esc(dir)} (terminus)` : `${esc(stopName(P, 0))} → ${esc(dir)} 방면(종점)`} · ${n}${en ? ' stops' : '개 정류장'}</small></div><button type="button" class="x" data-map="close" aria-label="${en ? 'Close' : '닫기'}">✕</button></div>
      ${svg}
      <ol class="line" style="--c:${col}">${rows}</ol>
      <div class="ft">${en ? 'Esc / ✕ to close · dimmed = passed · ⏵ next stop highlighted' : 'Esc / ✕ 닫기 · 흐린 정류장 = 지나옴 · 강조 = 다음 정류장'}</div></div>`;
    if (scroll) { const el = mapEl.querySelector('li.next, li.here, li.bus'); el?.scrollIntoView?.({ block: 'center' }); }
  }
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && !mapEl.hidden) { closeRouteMap(); e.stopPropagation(); } }, true);

  // ---------- 택시 ----------
  const liveNode = (cars, n) => corridor.inLive(cars.nodes[n].x, cars.nodes[n].z);
  function hail() {
    if (ride?.mode === 'bus') { toast(L('버스에서 내린 뒤 택시를 불러 주세요', 'Get off the bus first')); return false; }
    if (ride?.mode === 'taxi') { toast(ride.phase === 'called' ? L('택시가 오고 있어요', 'Your taxi is on the way') : L('이미 택시를 이용 중이에요', 'You already have a taxi')); return false; }
    const tr = TR(), cars = tr?.cars; const p = pl().position;
    if (!cars) { toast(L('택시를 불러올 수 없어요(코리더 차량 로딩 중)', 'Taxis are not ready yet')); return false; }
    const inLiveP = corridor.inLive(p.x, p.z);
    if (inLiveP && !JZ()) { toast(L('정자 라이브 구역에서는 택시 호출이 안 돼요 — 수내~잠실 구간에서 불러 주세요', 'Taxi hailing works on the Sunae–Jamsil corridor, not in the Jeongja live area')); return false; }
    const allow = JZ() ? null : (n) => !liveNode(cars, n); // [ride] 정자 차도가 붙어 있으면 정자 안 노드도 지남
    const pick = nearestCurbEdge(cars, p.x, p.z, { R: 60, allow });
    if (!pick || pick.d > 45) { toast(L('차도 가까이(길가)에서 불러 주세요', 'Stand near a road to hail a taxi')); return false; }
    // 정자 안에선 코리더 차량이 멈춰 있으므로(라이브 화면 밖) 근처 빈 택시를 고르지 않고, 화면 밖 길 위에 빈 택시를 하나 세워 보냄
    const cand = inLiveP ? [] : cars.list.filter((t) => t.taxi && !t.parked && !t.hired && t.age > 0.5 && t.state === 'drive').map((t) => [Math.hypot(t.mesh.position.x - p.x, t.mesh.position.z - p.z), t]).sort((a, b) => a[0] - b[0]).slice(0, 5);
    let best = null;
    for (const [, t] of cand) {
      if (allow && liveNode(cars, t.node)) continue;
      const route = astar(cars.nodes, cars.ways, t.node, pick.from, { allow });
      if (!route) continue;
      const len = routeLength(cars.nodes, route) + (t.cum[t.cum.length - 1] - t.s);
      if (!best || len < best.len) best = { t, route, len };
    }
    if (!best && JZ()) best = spawnFor(cars, p, pick, allow);
    if (!best) { toast(L('근처에 빈 택시가 없어요. 잠시 후 다시 불러 주세요', 'No free taxi nearby — try again shortly')); return false; }
    const t = best.t;
    cars.hire(t); t.manual = true; t.vmul = TAXI_VMUL; // 호출된 택시는 ride 가 직접 스텝(막히면 잠시 다른 차를 무시해 빠져나옴)
    if (best.edge) cars.placeOn(t, best.edge);
    cars.appendRoute(t, [...best.route, { from: pick.from, to: pick.to, way: pick.way }]);
    setTaxiStop(cars, t, pick);
    ride = { mode: 'taxi', phase: 'called', t, pick, t0: performance.now(), dist: 0 };
    toast(L(`🚕 택시를 불렀어요 — 약 ${Math.round(best.len)}m 거리에서 오는 중`, `🚕 Taxi called — about ${Math.round(best.len)} m away`));
    handset?.refreshApp('taxi');
    return true;
  }
  // [ride] 빈 택시를 플레이어에서 120~320m 떨어진 길 위에 세워 보냄(정자 등 근처 코리더 택시가 없을 때). → { t, route, len, edge }
  function spawnFor(cars, p, pick, allow) {
    cars.ensureTaxis?.();
    const free = cars.list.filter((t) => t && t.taxi && !t.hired && !t.manual).sort((a, b) => (b.parked - a.parked) || (Math.hypot(b.mesh.position.x - p.x, b.mesh.position.z - p.z) - Math.hypot(a.mesh.position.x - p.x, a.mesh.position.z - p.z)));
    const t = free[0]; if (!t) return null;
    const C = 250, i0 = Math.floor(p.x / C), j0 = Math.floor(p.z / C), es = [];
    for (let i = i0 - 2; i <= i0 + 2; i++) for (let j = j0 - 2; j <= j0 + 2; j++) for (const e of (cars.curbCells || cars.cells).get(i + ',' + j) || []) {
      const n = cars.nodes[e.from], d = Math.hypot(n.x - p.x, n.z - p.z), k = cars.ways[e.way].k;
      if (d < 120 || d > 320 || /^(motorway|trunk)|_link$|service/.test(k) || (allow && !allow(e.from))) continue;
      es.push([d, e]);
    }
    es.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < Math.min(14, es.length); k += 1 + (k > 4)) {
      const e = es[k][1], route = astar(cars.nodes, cars.ways, e.to, pick.from, { allow });
      if (!route) continue;
      const len = routeLength(cars.nodes, route) + Math.hypot(cars.nodes[e.to].x - cars.nodes[e.from].x, cars.nodes[e.to].z - cars.nodes[e.from].z);
      if (len < 1400) return { t, route, len, edge: { from: e.from, to: e.to, way: e.way } };
    }
    return null;
  }
  function setTaxiStop(cars, t, e) {
    const end = t.cum[t.cum.length - 1], w = cars.ways[e.way];
    t.stop = { s: Math.max(t.s + 4, end - (e.L - e.u)), curb: Math.max(0, w.w / 2 - 1.2 - cars._laneOffset(t, w)), dwell: 1e9 };
    t.state = 'drive';
  }
  function cancelTaxi(say) {
    const r = ride; if (!r || r.mode !== 'taxi') return;
    const cars = TR()?.cars;
    if (r.phase === 'choose' || r.phase === 'drive') { taxiDrop('cancel'); return; }
    r.t.manual = false; cars?.release(r.t);
    ride = null; panel.hidden = true;
    if (say) toast(L('택시 호출을 취소했어요', 'Taxi call cancelled'));
    handset?.refreshApp('taxi');
  }
  function boardTaxi() {
    const r = ride; if (!canBoard()) return false;
    prepare();
    r.phase = 'choose'; r.boardAt = Date.now(); r.from = placeName(pl().position.x, pl().position.z);
    r.t.manual = true;
    pl().visible = false;
    seatTaxi();
    openTaxiPanel();
    emitNow();
    return true;
  }
  function seatTaxi() {
    const m = ride.t.mesh; m.updateMatrixWorld(true);
    pl().position.copy(m.localToWorld(tmpV.set(-0.4, 0.2, -0.45)));
    pl().rotation.y = m.rotation.y;
  }
  const destList = () => {
    const p = pl().position;
    return [...(travel?.dests || []), ...(JZ() ? JZ_DESTS : [])].filter((d) => d.x != null).map((d) => ({ ...d, dist: Math.hypot(d.x - p.x, d.z - p.z) })).filter((d) => d.dist > 120).sort((a, b) => a.dist - b.dist);
  };
  function openTaxiPanel() {
    const r = ride; if (!r) return;
    const en = isEn();
    const sel = r.dest;
    const rows = destList().map((d) => `<button type="button" class="dest${sel && sel.id === d.id ? ' on' : ''}" data-dest="${esc(d.id)}"><b>${esc(en ? d.en : d.ko)}</b><small>${(d.dist / 1000).toFixed(1)} km${corridor.inLive(d.x, d.z) ? (JZ() ? (en ? ' · Jeongja' : ' · 정자') : (en ? ' · drop at Jeongja edge' : ' · 정자 경계 하차 후 이동')) : ''}</small></button>`).join('');
    panel.innerHTML = `<div class="hd">🚕 ${en ? 'Where to?' : '어디로 갈까요?'} <small>${en ? 'Free Trial Card · ₩0' : '무료 체험 카드 · 0원'}</small></div>
      <div class="dests">${rows}<button type="button" class="dest map${sel?.id === '@map' ? ' on' : ''}" data-dest="@map"><b>🗺️ ${en ? 'Pick on the map' : '지도에서 선택'}</b><small>${sel?.id === '@map' ? esc(sel.label) : (en ? 'Click a spot in map view' : '지도 보기에서 위치 클릭')}</small></button></div>
      <div class="go">
        <button type="button" data-go="normal" ${sel ? '' : 'disabled'}>▶ ${en ? 'Drive' : '일반 주행'}</button>
        <button type="button" data-go="fast" ${sel ? '' : 'disabled'}>⏩ ${en ? `Fast-forward ×${FF}` : `빨리감기 ×${FF}`}</button>
        <button type="button" data-go="instant" class="premium" ${sel ? '' : 'disabled'}>⚡ ${en ? 'Instant arrival' : '즉시 도착'}<small>${en ? 'future premium · ₩0 now' : '프리미엄 예정 · 지금 0원'}</small></button>
      </div>
      <div class="ft">${r.phase === 'drive' ? `<button type="button" data-go="stop">🛑 X · ${en ? 'Pull over here' : '세워주세요'}</button>` : ''}<button type="button" data-go="exit">${en ? 'Get out' : '내리기'}</button></div>`;
    panel.hidden = false;
  }
  panel.addEventListener('click', (e) => {
    const d = e.target.closest('[data-dest]'), g = e.target.closest('[data-go]');
    if (!ride || ride.mode !== 'taxi') return;
    if (d) {
      if (d.dataset.dest === '@map') { startMapPick(); return; }
      const x = destList().find((q) => q.id === d.dataset.dest); if (x) { ride.dest = { id: x.id, x: x.x, z: x.z, label: isEn() ? x.en : x.ko, travelId: x.id }; openTaxiPanel(); }
    } else if (g) {
      if (g.dataset.go === 'exit') { taxiDrop('cancel'); return; }
      if (g.dataset.go === 'stop') { requestStop(); return; }
      if (ride.dest) depart(g.dataset.go);
    }
  });
  // 지도에서 선택: 지도 보기(overview)로 바꾸고 다음 클릭(드래그 아님) 지점을 목적지로
  let picking = null;
  function startMapPick() {
    picking = { down: null };
    setMode('overview');
    panel.hidden = true;
    toast(L('지도를 클릭해 목적지를 고르세요 (Esc 취소)', 'Click the map to choose a destination (Esc to cancel)'), 6);
  }
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2();
  function pickAt(clientX, clientY) {
    const rc = canvas.getBoundingClientRect();
    ndc.set(((clientX - rc.left) / rc.width) * 2 - 1, -((clientY - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); plane.constant = -pl().position.y;
    const hit = ray.ray.intersectPlane(plane, tmpV2); if (!hit) return null;
    return { x: hit.x, z: hit.z };
  }
  function finishMapPick(pt) {
    picking = null; setMode('follow');
    if (!ride || ride.mode !== 'taxi') return;
    if (pt) {
      const live = corridor.inLive(pt.x, pt.z);
      ride.dest = { id: '@map', x: pt.x, z: pt.z, label: `${placeName(pt.x, pt.z)}${live && !JZ() ? L(' (정자 구역)', ' (Jeongja area)') : ''}` };
    }
    openTaxiPanel();
  }
  canvas.addEventListener('pointerdown', (e) => { if (picking) picking.down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!picking?.down) return;
    if (Math.hypot(e.clientX - picking.down[0], e.clientY - picking.down[1]) > 6) { picking.down = null; return; }
    finishMapPick(pickAt(e.clientX, e.clientY));
  });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && picking) finishMapPick(null); });

  // 목적지 → 차도 간선. 정자 라이브 구역 안이면 경계 밖 가장 가까운 곳에서 내림(이후 역 앞으로 이동)
  function destEdge(cars, d) {
    let x = d.x, z = d.z, live = corridor.inLive(x, z) && !JZ(); // [ride] 정자 차도가 붙어 있으면 정자 안까지 바로
    if (live) {
      const lb = corridor.liveBox;
      const cands = [[x, lb.z0 - 30], [x, lb.z1 + 30], [lb.x0 - 30, z], [lb.x1 + 30, z]];
      cands.sort((a, c) => Math.hypot(a[0] - x, a[1] - z) - Math.hypot(c[0] - x, c[1] - z));
      [x, z] = cands[0];
    }
    const e = nearestCurbEdge(cars, x, z, { R: 160, allow: JZ() ? null : (n) => !liveNode(cars, n) });
    return e ? { e, live } : null;
  }
  async function depart(speed) {
    const r = ride, cars = TR()?.cars; if (!r || !cars || busy) return;
    const de = destEdge(cars, r.dest);
    if (!de) { toast(L('그 근처에는 택시가 설 수 있는 길이 없어요', 'No drivable road near there')); return; }
    const allow = JZ() ? null : (n) => !liveNode(cars, n);
    const t = r.t;
    const route = astar(cars.nodes, cars.ways, t.node, de.e.from, { allow });
    if (!route) { toast(L('경로를 찾지 못했어요. 다른 목적지를 골라 주세요', 'No route found — pick another destination')); return; }
    const code = speed === 'instant' ? 'taxi.instant' : speed === 'fast' ? 'taxi.fast' : 'taxi.drive';
    busy = true;
    const res = await charge({ code, mode: 'taxi', card: card().id, meta: { to: r.dest.label } });
    busy = false; stats.charges.push(res);
    if (!res.ok) { toast(L('결제에 실패했어요: ', 'Payment failed: ') + res.error); return; }
    r.fare = res; r.speed = speed; r.live = de.live; r.routeLen = routeLength(cars.nodes, route) + (t.cum[t.cum.length - 1] - t.s);
    r.t0 = performance.now(); r.at = Date.now(); r.simT0 = r.simT || 0;
    panel.hidden = true;
    if (speed === 'instant') {
      // 즉시 도착: 목적지 길가로 바로(경로 길이는 기록용 추정)
      const e = de.e, hx = (cars.nodes[e.to].x - cars.nodes[e.from].x) / e.L, hz = (cars.nodes[e.to].z - cars.nodes[e.from].z) / e.L;
      r.dist = r.routeLen;
      corridor.preload?.(e.x, e.z);
      finishTaxi(e.x - hz * 5.2, e.z + hx * 5.2, Math.atan2(hz, -hx));
      toast(L('⚡ 즉시 도착 (프리미엄 예정 기능 · 지금은 0원)', '⚡ Instant arrival (future premium · ₩0 for now)'));
      return;
    }
    t.stop = null; t.state = 'drive'; t.latT = 0;
    cars.appendRoute(t, [...route, { from: de.e.from, to: de.e.to, way: de.e.way }]);
    setTaxiStop(cars, t, de.e);
    r.phase = 'drive'; r.last = t.mesh.position.clone(); r.stuck = 0; r.stopReq = false; t.vmul = TAXI_VMUL;
    toast(speed === 'fast' ? L(`⏩ 빨리감기 ×${FF}로 이동 중 — ${r.dest.label}`, `⏩ Fast-forward ×${FF} to ${r.dest.label}`) : L(`🚕 ${r.dest.label}(으)로 출발`, `🚕 Heading to ${r.dest.label}`));
    emitNow();
  }
  // 신호 대기 중인지(정지선 8m 안 + 차량 정지 신호) — 신호 대기는 '막힘'으로 세지 않음
  function atSignal(cars, t) {
    const tr = cars.transit; if (!tr?.pedLight || !t.sigQ) return false;
    for (const q of t.sigQ) { const d = q.s - ((q.c.depth || 2.2) + 2.3) - (t.s + 2.3); if (d < -1.5) continue; if (d > 10) break; if (tr.pedLight(q.c) !== 'red') return true; }
    return false;
  }
  function stepTaxi(t, dt, alone = false) {
    const cars = TR()?.cars; if (!cars) return;
    const p = t.mesh.position, others = [];
    if (alone) { cars._step(t, dt, others); return; }
    // 시야 120m(빠른 속도라 앞차를 더 멀리 봄). 정자 안에서는 멈춰 숨겨진 코리더 차는 무시하고 정자 라이브 택시·버스를 장애물로
    const live = corridor.inLive(p.x, p.z), BX = 120;
    for (const o of cars.list) { if (o === t || o.parked || (live && !o.hired && !o.keep)) continue; const q = o.mesh.position; if (Math.abs(q.x - p.x) > BX || Math.abs(q.z - p.z) > BX) continue; const [x, z, dx, dz] = cars._sample(o, o.s); others.push({ x, z, dx, dz, t: o }); }
    if (!live) { for (const v of B()?.near || []) if (Math.abs(v.x - p.x) < BX && Math.abs(v.z - p.z) < BX) others.push({ x: v.x, z: v.z, dx: Math.sin(v.heading), dz: Math.cos(v.heading), bus: true }); }
    else for (const o of liveObstacles?.(p.x, p.z, BX) || []) others.push(o);
    cars._step(t, dt, others);
  }
  function finishTaxi(x, z, ry) {
    const r = ride, cars = TR()?.cars;
    r.t.manual = false; cars?.release(r.t);
    const sp = corridor.freeSpot(x, z);
    pl().position.set(sp.x, B()?.gy(sp.x, sp.z, pl().position.y) ?? pl().position.y, sp.z);
    if (ry != null) pl().rotation.y = ry;
    pl().visible = true;
    if (r.fare) log.add({ mode: 'taxi', route: 'TAXI', routeName: TAXI_LIVERIES[r.t.liv]?.label || '택시', from: r.from, to: r.stopReq ? L(`${placeName(sp.x, sp.z)} (중간 하차)`, `${placeName(sp.x, sp.z)} (stopped early)`) : (r.dest?.label || placeName(sp.x, sp.z)), distM: r.dist, durSec: r.speed === 'instant' ? 0 : (r.simT || 0) - (r.simT0 || 0), at: r.at, end: Date.now(), fare: r.fare, speed: r.speed });
    const live = r.live, travelId = r.dest?.travelId;
    ride = null; panel.hidden = true; stats.alights++;
    handset?.refreshApp('wallet'); handset?.refreshApp('taxi');
    emitNow();
    if (live && travelId && travel) { toast(L('정자 구역 경계에서 내려 역 앞으로 이동해요', 'Dropped at the Jeongja edge — moving you to the station'), 4); travel.go(travelId); }
  }
  function taxiDrop(reason) {
    const r = ride; if (!r || r.mode !== 'taxi') return;
    const m = r.t.mesh, h = m.rotation.y; // 오른쪽(갓길) = (-cos h, sin h)
    if (reason === 'cancel') r.fare = r.fare || null;
    finishTaxi(m.position.x - Math.cos(h) * 2.6, m.position.z + Math.sin(h) * 2.6, h);
    if (reason === 'arrive') toast(L('🚕 도착했어요', '🚕 You have arrived'));
    else if (reason === 'stopreq') toast(L('🛑 요청하신 곳에 세웠어요 — 하차', '🛑 Pulled over as requested — you got out'));
    else if (reason === 'teleport') toast(L('이동하면서 택시에서 내렸어요', 'Left the taxi (teleport)'));
    else if (reason === 'stuck') toast(L('택시가 막혀서 근처에서 내렸어요', 'The taxi got stuck — dropped nearby'));
  }
  function updateTaxi(dt) {
    const r = ride, t = r.t, cars = TR()?.cars;
    if (!cars || t.parked || !t.hired) { if (r.phase === 'called' || r.phase === 'wait') { ride = null; toast(L('택시 호출이 끊겼어요', 'Taxi call lost')); } else taxiDrop('stuck'); return; }
    const p = pl().position, tp = t.mesh.position;
    r.simT = (r.simT || 0) + dt; // 게임 시간(탭 숨김·저사양에서 느려져도 타임아웃이 공정하게)
    if (r.phase === 'called' || r.phase === 'wait') {
      if (r.phase === 'called') {
        if ((r.stuck || 0) > 6) { r.alone = 3; r.stuck = 0; } // 다른 차에 막히면 3초간 무시하고 빠져나옴(신호는 지킴)
        stepTaxi(t, dt, (r.alone || 0) > 0); r.alone = (r.alone || 0) - dt;
        if (t.v < 0.1 && t.state !== 'pickup' && !atSignal(cars, t)) r.stuck = (r.stuck || 0) + dt; else if (t.v >= 0.1) r.stuck = 0;
      }
      if (t.state === 'pickup' && r.phase === 'called') { r.phase = 'wait'; toast(L('🚕 택시가 도착했어요 — 가까이 가서 E로 탑승', '🚕 Your taxi is here — walk up and press E'), 5); handset?.refreshApp('taxi'); }
      if (r.simT > TAXI_CALL_TIMEOUT && r.phase === 'called') { cancelTaxi(false); toast(L('택시가 오지 못했어요. 다시 불러 주세요', 'The taxi could not reach you — call again')); return; }
      if (Math.hypot(tp.x - p.x, tp.z - p.z) > TAXI_WALK_AWAY + (r.phase === 'called' ? 400 : 0) && r.phase === 'wait') { cancelTaxi(false); toast(L('택시에서 멀어져 호출이 취소됐어요', 'You walked away — taxi call cancelled')); }
      return;
    }
    if (r.phase === 'drive') {
      const n = r.speed === 'fast' ? FF : 1;
      if (r.stuck > 6 && !(r.alone > 0)) { r.alone = 3; r.stuckTot = (r.stuckTot || 0) + r.stuck; r.stuck = 0; } // 다른 차에 막히면 3초간 무시(신호는 지킴)
      const alone = (r.alone || 0) > 0; r.alone = (r.alone || 0) - dt;
      for (let k = 0; k < n; k++) { stepTaxi(t, dt, alone); r.dist += tp.distanceTo(r.last); r.last.copy(tp); if (t.state === 'pickup') break; }
      if (t.v < 0.1 && !atSignal(cars, t)) r.stuck += dt; else if (t.v >= 0.1) { r.stuck = 0; r.stuckTot = 0; }
      if (t.state === 'pickup') { seatTaxi(); taxiDrop(r.stopReq ? 'stopreq' : 'arrive'); return; }
      if ((r.stuckTot || 0) + r.stuck > 45) { taxiDrop('stuck'); return; } // 45초 넘게 신호 아닌 이유로 못 움직이면 근처 하차
    } else if (r.phase === 'choose') {
      t.state = 'pickup'; t.wait = 1e9; t.v = 0; // 목적지 고르는 동안 길가에 서 있음
    }
    seatTaxi();
  }

  // [ride] '세워주세요'(X · HUD · 패널 · 폰 앱): 앞쪽 첫 안전한 길가에 세운 뒤 하차. 요금(0원)·기록은 실제 이동 거리/시간
  function requestStop() {
    const r = ride; if (!r || r.mode !== 'taxi' || r.phase !== 'drive') return false;
    if (r.stopReq) { toast(L('🛑 곧 세워 드릴게요', '🛑 Pulling over shortly')); return true; }
    const cars = TR()?.cars, t = r.t; if (!cars) return false;
    const cr = cars.transit?.crossings || [];
    const nearCrossing = (s) => { const [x, z] = cars._sample(t, s); for (const c of cr) if (Math.abs(c.x - x) < 12 && Math.abs(c.z - z) < 12) return true; return false; };
    const at = findStopAhead(t, cars.ways, { endS: t.stop?.s, nearCrossing });
    if (!at) { toast(L('곧 목적지예요 — 목적지에서 내려 드릴게요', 'Almost there — you will get out at the destination')); return true; }
    const w = cars.ways[at.way], g = t.segs[at.seg];
    t.stop = { s: at.s, curb: Math.max(0, w.w / 2 - 1.2 - (g?.off ?? cars._laneOffset(t, w))), dwell: 1e9 };
    r.stopReq = true;
    toast(L(`🛑 세워주세요 — ${Math.round(at.s - t.s)}m 앞 안전한 길가에 세울게요`, `🛑 Pulling over at a safe curb ${Math.round(at.s - t.s)} m ahead`));
    renderHud(); refreshTaxiApp(true);
    return true;
  }
  // 남은 거리(m): 정차 지점(목적지 또는 세워주세요 지점)까지 경로 길이
  const remainM = (r) => Math.max(0, (r.t.stop ? r.t.stop.s : r.t.cum[r.t.cum.length - 1]) - r.t.s);
  function ffTaxiInner(sec, until) { // 테스트용(debug.ffTaxi)
    let t = 0;
    for (; t < sec && ride?.mode === 'taxi'; t += 0.1) { updateTaxi(0.1); if (until && until()) break; }
    renderHud();
    return t;
  }

  // ---------- E / V / Y ----------
  function handleE() {
    if (ride?.mode === 'bus') {
      if (ride.dwell) { alightBus(ride.b.stopIdx === ride.fromIdx ? 'now' : 'bell'); return true; }
      ride.bell = !ride.bell;
      if (ride.bell) { sound.bell(); stats.bells++; } // 딩동
      toast(ride.bell ? L('🔔 하차 벨 — 다음 정류장에서 내려요', '🔔 Stop requested — getting off at the next stop') : L('하차 벨 취소', 'Stop request cancelled'));
      return true;
    }
    if (ride?.mode === 'taxi') {
      if (ride.phase === 'wait' || ride.phase === 'called') {
        const tp = ride.t.mesh.position, p = pl().position;
        if (ride.phase === 'wait' && Math.hypot(tp.x - p.x, tp.z - p.z) < TAXI_BOARD_R) return boardTaxi();
        if (ride.phase === 'wait') { toast(L('택시 가까이 가서 E', 'Walk up to the taxi and press E')); return true; }
        // 오는 중이면 E 는 버스/자전거에 양보
      } else if (ride.phase === 'choose') { openTaxiPanel(); return true; }
      else if (ride.phase === 'drive') { toast(L('도착하면 자동으로 내려요 (X: 세워주세요)', 'You will get out on arrival (X: pull over)')); openTaxiPanel(); return true; }
    }
    const c = boardable();
    if (c) { boardBus(c); return true; }
    return false;
  }
  function toggleCam() {
    if (!active()) return;
    const k = ride.mode; camPref[k] = camPref[k] === '1p' ? '3p' : '1p';
    toast(camPref[k] === '1p' ? L('🎥 창가 1인칭', '🎥 Window seat view') : L('🎥 뒤쪽 3인칭', '🎥 Behind-the-vehicle view'), 1.6);
  }
  const active = () => !!ride && (ride.mode === 'bus' || ride.phase === 'choose' || ride.phase === 'drive');

  // ---------- 다른 사람: 유령 버스·택시 ----------
  function updateGhosts(dt) {
    const bs = B(), bs0 = bs;
    for (const g of ghosts.values()) { g.used = false; g.peers = []; g.seats = []; }
    for (const p of remotes.peers.values()) {
      const info = parseRideSit(p.sit);
      p.rideHost = null;
      if (!info || !bs) continue;
      const cx = p.target.x, cz = p.target.z;
      if (info.kind === 'bus') {
        const P = pathByIdx(info.path); if (!P) continue;
        const gbs = sysOf(P); // [ride] 정자 경로면 정자 버스 쪽
        if (ride?.mode === 'bus' && ride.path === info.path && Math.hypot(cx - ride.mesh.position.x, cz - ride.mesh.position.z) < CO_R) {
          p.rideHost = { mesh: ride.mesh, seat: info.seat === ride.seat ? ride.mesh.userData.ride.order.find((i) => i !== ride.seat) : info.seat, bus: true };
          continue;
        }
        let g = null;
        for (const q of ghosts.values()) if (q.kind === 'bus' && q.path === info.path && Math.hypot(q.tx - cx, q.tz - cz) < GHOST_JOIN) { g = q; break; }
        if (!g) {
          const mesh = createRideBus(P.ref, P.type, P.name); gbs.group.add(mesh);
          mesh.position.set(cx, p.target.y + 0.08, cz); mesh.rotation.y = p.ry;
          g = { key: 'g' + (++ghostSeq), kind: 'bus', mesh, P, path: info.path, tx: cx, tz: cz, ry: p.ry, peers: [], seats: [] };
          ghosts.set(g.key, g);
          const lv = liveryOf(P.type);
          g.tag = corridorOverlayTag(mesh, `🚌 ${P.ref} · ${lv.label}`);
        }
        if (!g.used) { g.tx = cx; g.tz = cz; g.ry = p.ry; g.ty = p.target.y; g.dwell = info.dwell; g.s = projectOnPath(P, cx, cz).s; }
        g.used = true; g.peers.push(p.id); g.seats.push(info.seat);
        p.rideHost = { mesh: g.mesh, seat: info.seat, bus: true };
      } else {
        let g = ghosts.get('t:' + p.id);
        if (!g) {
          const key = LIV_KEYS[info.liv] || 'kakao';
          const mesh = createTaxi(key); (bs.group).add(mesh); mesh.position.set(cx, p.target.y + 0.05, cz); mesh.rotation.y = p.ry;
          g = { key: 't:' + p.id, kind: 'taxi', mesh, peers: [], seats: [] }; ghosts.set(g.key, g);
        }
        g.used = true; g.tx = cx; g.tz = cz; g.ty = p.target.y; g.ry = p.ry; g.peers.push(p.id);
        p.rideHost = { mesh: g.mesh, seat: -1, bus: false };
      }
    }
    for (const [k, g] of ghosts) {
      if (!g.used) { g.mesh.parent?.remove(g.mesh); g.mesh.userData.releaseLights?.(); if (g.tag) g.tag.remove(); disposeGhostMesh(g); ghosts.delete(k); continue; }
      const m = g.mesh, a = Math.min(1, dt * 6), bs = g.kind === 'bus' ? sysOf(g.P) : bs0;
      m.position.x += (g.tx - m.position.x) * a; m.position.z += (g.tz - m.position.z) * a;
      m.position.y = (bs ? bs.gy(m.position.x, m.position.z, m.position.y) : g.ty) + (g.kind === 'bus' ? 0.08 : 0.05);
      m.rotation.y += Math.atan2(Math.sin(g.ry - m.rotation.y), Math.cos(g.ry - m.rotation.y)) * a;
      m.updateMatrixWorld(true);
      // 같은 경로의 내 로컬 시뮬 버스가 겹쳐 보이면 숨김
      if (g.kind === 'bus' && bs) for (const v of bs.near) if (v.ref === g.P.ref && Math.hypot(v.x - m.position.x, v.z - m.position.z) < 18) bs.hideIds.add(v.id);
    }
  }
  let overlayRef = null;
  function corridorOverlayTag(mesh, text) {
    if (!overlayRef) return null;
    const item = overlayRef.add({ cls: 'tag bus', text, getPos: () => mesh.position.clone().setY(mesh.position.y + 4.4), maxDist: 90 });
    return { remove: () => overlayRef.remove(item) };
  }
  // RemotePlayers.update 에서 부름: 탑승 중인 원격 아바타를 좌석에 앉힘. true 면 기본 처리 생략
  function remoteHook(p, dt) {
    const h = p.rideHost; if (!h) return false;
    const m = h.mesh;
    if (h.bus) {
      const seats = m.userData.ride?.seats; const seat = seats?.[h.seat] || seats?.[0];
      if (seat) p.mesh.position.copy(m.localToWorld(tmpV.copy(seat.local)));
      p.mesh.visible = true;
    } else { p.mesh.position.copy(m.localToWorld(tmpV.set(-0.4, 0.2, -0.45))); }
    p.mesh.rotation.y = m.rotation.y;
    if (p.bikeMesh) p.bikeMesh.visible = false;
    p.mesh.userData.sit = 'bench'; p.mesh.userData.afk = false; p.mesh.userData.emote = ''; p.mesh.userData.jumpY = 0;
    const want = `${h.bus ? '🚌' : '🚕'} ${p.name}`;
    if (p.tag.el.textContent !== want) { p.tag.el.textContent = want; p.tag.el.classList.remove('is-afk'); }
    animateAvatar(p.mesh, 0, dt);
    return true;
  }

  // ---------- 카메라 ----------
  const camState = { pos: new THREE.Vector3(), init: false };
  function updateCamera(cameraObj, dt) {
    if (!active() || cam.mode !== 'follow') { camState.init = false; return false; }
    const m = ride.mode === 'bus' ? ride.mesh : ride.t.mesh, hd = m.rotation.y;
    const mode = camPref[ride.mode];
    if (ride.yaw0 == null) { ride.yaw0 = cam.yaw; ride.pitch0 = cam.pitch; }
    const off = cam.yaw - ride.yaw0;
    pl().visible = ride.mode === 'bus' && mode === '3p';
    if (mode === '1p') {
      let eye, look;
      if (ride.mode === 'bus') {
        const seat = m.userData.ride.seats[ride.seat];
        const R = m.userData.ride, ey = Math.max(seat.local.y + 1.2, (R.winY0 ?? 0) + 0.5); // 창 띠 아래면 눈높이를 올림(직행좌석 버스는 창이 높다)
        eye = m.localToWorld(tmpV.set(seat.local.x * 0.92, ey, seat.local.z + 0.05));
        const a = (seat.local.x > 0 ? 0.8 : -0.8) - off;
        look = tmpV2.set(Math.sin(hd + a), -Math.max(-0.4, Math.min(0.5, (cam.pitch - ride.pitch0) * 0.6)), Math.cos(hd + a));
      } else {
        eye = m.localToWorld(tmpV.set(-0.35, 1.32, -0.2));
        look = tmpV2.set(Math.sin(hd - off), -0.05, Math.cos(hd - off));
      }
      cameraObj.position.copy(eye);
      cameraObj.lookAt(eye.x + look.x, eye.y + look.y, eye.z + look.z);
      camState.init = false;
    } else {
      const bus = ride.mode === 'bus';
      const dist = (bus ? 17 : 10) * THREE.MathUtils.clamp(cam.dist / 14, 0.6, 2.5), h = bus ? 6.2 : 3.6;
      const ang = hd + Math.PI - off;
      const want = tmpV.set(m.position.x + Math.sin(ang) * dist, m.position.y + h + Math.max(-0.3, cam.pitch - ride.pitch0) * dist * 0.5, m.position.z + Math.cos(ang) * dist);
      if (!camState.init) { camState.pos.copy(want); camState.init = true; } else camState.pos.lerp(want, Math.min(1, dt * 6));
      cameraObj.position.copy(camState.pos);
      cameraObj.lookAt(m.position.x + Math.sin(hd) * 4, m.position.y + (bus ? 2.2 : 1.2), m.position.z + Math.cos(hd) * 4);
    }
    return true;
  }

  // ---------- HUD 렌더 ----------
  let hudHtml = '', hudAcc = 1;
  function renderHud() {
    const en = isEn();
    let html = '';
    if (ride?.mode === 'bus') {
      const r = ride, P = r.P, b = r.b, lv = liveryOf(P.type);
      const cur = r.dwell ? stopName(P, b.stopIdx) : '';
      const nextIdx = r.dwell ? b.stopIdx + 1 : b.stopIdx;
      const next = stopName(P, nextIdx) || (en ? 'End of line' : '종점');
      html = `<button type="button" class="chip map" data-ride="map" title="${en ? 'Route map' : '노선도'}" style="background:${lv.plain ? '#2c3e6b' : lv.color}">${esc(P.ref)}</button>
        <span class="where">${r.dwell ? `<b>${en ? 'Now at' : '정차 중'}</b> ${esc(cur)} · ` : ''}<b>${en ? 'Next stop' : '다음 정류장'}</b> ${esc(next)} <small>${en ? '다음 정류장' : 'Next stop'}</small></span>
        <button type="button" data-ride="e" class="${r.bell ? 'bell on' : 'bell'}">${r.dwell ? (en ? 'E · Get off now' : 'E · 지금 내리기') : r.bell ? (en ? '🔔 Stop requested' : '🔔 하차 벨 눌림') : (en ? '🔔 E · Get off at next stop' : '🔔 E · 다음 정류장 하차')}</button>
        <button type="button" data-ride="cam">🎥 V · ${camPref.bus === '1p' ? (en ? 'Window' : '창가 1인칭') : (en ? 'Behind' : '뒤쪽 3인칭')}</button>
        <button type="button" data-ride="voice" class="voice" title="${en ? 'Announcements / bell sound' : '안내 방송·벨 소리'}">${sound.muted ? '🔇' : '🔊'}</button>${r.follow ? `<span class="co">👥 ${en ? 'riding together' : '함께 탑승 중'}</span>` : ''}`;
    } else if (ride?.mode === 'taxi') {
      const r = ride, lv = TAXI_LIVERIES[r.t.liv];
      const d = Math.round(Math.hypot(r.t.mesh.position.x - pl().position.x, r.t.mesh.position.z - pl().position.z));
      const st = r.phase === 'called' ? (en ? `Taxi on the way · ${d} m` : `택시 오는 중 · ${d}m`)
        : r.phase === 'wait' ? (en ? `Taxi is here · ${d} m — press E to get in` : `택시 도착 · ${d}m — E로 탑승`)
          : r.phase === 'choose' ? (en ? 'Choose a destination' : '목적지를 고르세요')
            : (en ? `To ${r.dest?.label} · ${r.speed === 'fast' ? `⏩ ×${FF}` : '▶'} · ${(remainM(r) / 1000).toFixed(1)} km left · ${Math.round(r.t.v * 3.6)} km/h` : `${r.dest?.label}(으)로 이동 중 · ${r.speed === 'fast' ? `⏩ ×${FF}` : '▶'} · 남은 ${(remainM(r) / 1000).toFixed(1)}km · ${Math.round(r.t.v * 3.6)}km/h`);
      html = `<span class="chip taxi" style="background:${lv?.tag || '#f6c700'};color:${lv?.tagFg || '#111'}">🚕 ${en ? 'TAXI' : '택시'}</span><span class="where">${esc(st)}</span>`
        + (r.phase === 'called' || r.phase === 'wait' ? `<button type="button" data-ride="cancel">${en ? 'Cancel' : '호출 취소'}</button>` : '')
        + (r.phase === 'drive' ? `<button type="button" data-ride="stop" class="${r.stopReq ? 'stop on' : 'stop'}">${r.stopReq ? (en ? '🛑 Pulling over…' : '🛑 정차 요청됨') : (en ? '🛑 X · Pull over' : '🛑 X · 세워주세요')}</button>` : '')
        + (r.phase === 'called' || r.phase === 'wait' ? '' : `<button type="button" data-ride="cam">🎥 V · ${camPref.taxi === '1p' ? (en ? 'Inside' : '차내 1인칭') : (en ? 'Behind' : '뒤쪽 3인칭')}</button>`);
    } else {
      const c = boardable();
      if (c) { const lv = liveryOf(c.P.type); html = `<span class="chip" style="background:${lv.plain ? '#2c3e6b' : lv.color}">${esc(c.P.ref)}</span><span class="where">${en ? `toward ${esc(terminusOf(c.P))} · stopped` : `${esc(terminusOf(c.P))} 방면 · 정차 중`}</span><button type="button" data-ride="e" class="board">E · ${en ? 'Board' : '탑승'}</button>`; }
    }
    if (html !== hudHtml) { hudHtml = html; hud.innerHTML = html; hud.hidden = !html; }
    renderBusCard();
  }
  // 좌측 하단 '내 버스' 카드: 번호(클릭 → 노선도) · 방면 · 다음 정류장
  let cardHtml = '';
  function renderBusCard() {
    let html = '';
    if (ride?.mode === 'bus') {
      const en = isEn(), r = ride, P = r.P, lv = liveryOf(P.type);
      const next = stopName(P, r.dwell ? r.b.stopIdx + 1 : r.b.stopIdx) || (en ? 'End of line' : '종점');
      html = `<button type="button" class="num" data-ride="map" style="background:${lv.plain ? '#2c3e6b' : lv.color}" title="${en ? 'Show route map' : '노선도 보기'}">${esc(P.ref)}</button>
        <div class="tx"><b>${en ? `toward ${esc(terminusOf(P))}` : `${esc(terminusOf(P))} 방면`}</b><small>${en ? 'Next' : '다음'} · ${esc(next)}</small></div>
        <button type="button" class="mp" data-ride="map">🗺️ ${en ? 'Route map' : '노선도'}</button>`;
    }
    if (html !== cardHtml) { cardHtml = html; busCard.innerHTML = html; busCard.hidden = !html; document.body.classList.toggle('ride-bus', !!html); }
    if (!html && !mapEl.hidden && !mapP) closeRouteMap();
  }
  function stopHint(stop) {
    const en = isEn(), c = boardable();
    if (c && c.kind === 'sim' && c.P.stops[c.stopIdx]?.stop === stop.id) return `<div class="ride-board">🚌 <b>${esc(c.P.ref)}</b> ${en ? 'is stopped here — press <b>E</b> to board' : '정차 중 — <b>E</b> 탑승'}</div>`;
    return `<div class="ride-tip">${en ? 'Press E when a bus stops · Y: call a taxi' : '버스가 서면 E로 탑승 · Y 택시 호출'}</div>`;
  }

  // ---------- 폰 앱 ----------
  // 택시 앱이 열려 있으면 남은 km 등 숫자만 갱신(버튼은 다시 그리지 않아 클릭이 끊기지 않음). phase 가 바뀌면 전체 갱신
  let appPhase = '', appAcc = 0;
  function refreshTaxiApp(force = false) {
    const ph = ride?.mode === 'taxi' ? ride.phase + (ride.stopReq ? '!' : '') : '';
    if (force || ph !== appPhase) { appPhase = ph; handset?.refreshApp('taxi'); }
    if (ride?.mode !== 'taxi' || ride.phase !== 'drive' || typeof document === 'undefined') return;
    const set = (k, v) => { const el = document.querySelector(`#handset [data-live="${k}"]`); if (el && el.textContent !== v) el.textContent = v; };
    set('km', (remainM(ride) / 1000).toFixed(1)); set('kmh', String(Math.round(ride.t.v * 3.6))); set('gone', (ride.dist / 1000).toFixed(1));
  }
  const fmtDur = (s) => (s >= 60 ? `${Math.floor(s / 60)}${isEn() ? 'm ' : '분 '}${Math.round(s % 60)}${isEn() ? 's' : '초'}` : `${Math.round(s)}${isEn() ? 's' : '초'}`);
  const fmtTime = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  if (handset?.addApp) {
    handset.addApp({
      id: 'wallet', cls: 'wallet', glyph: '💳', label: { ko: '교통카드', en: 'Transit' }, title: { ko: '교통카드 · 지갑', en: 'Wallet · Transit Card' },
      render(en) {
        const c = card(), list = log.list({ limit: 30 }), tot = log.totals();
        const rows = list.map((e) => `<div class="ride-rec"><span class="ic">${e.mode === 'taxi' ? '🚕' : '🚌'}</span><div><b>${esc(e.mode === 'taxi' ? (en ? 'Taxi' : '택시') : e.route)}</b> ${esc(e.from)} → ${esc(e.to)}<small>${(e.distM / 1000).toFixed(2)} km · ${fmtDur(e.durSec)} · ${fmtTime(e.at)}${e.speed && e.speed !== 'normal' ? ` · ${e.speed === 'fast' ? '⏩' : '⚡'}` : ''}</small></div><span class="amt">${e.fare ? e.fare.amount : 0}${en ? ' KRW' : '원'}</span></div>`).join('');
        return `<div class="tcard"><div class="nm">${esc(en ? c.name.en : c.name.ko)}</div><div class="bal">${en ? 'Balance' : '잔액'} <b>${c.balance}${en ? ' KRW' : '원'}</b></div><div class="un">${en ? 'Unlimited free rides' : '무제한 무료 탑승'}</div><div class="no">${esc(c.id.slice(-8).toUpperCase())}</div></div>
          <p class="hint">${en ? `${tot.rides} rides · ${(tot.distM / 1000).toFixed(1)} km` : `탑승 ${tot.rides}회 · ${(tot.distM / 1000).toFixed(1)} km`}</p>
          <div class="ride-recs">${rows || `<p class="hint">${en ? 'No rides yet. Board a bus with E at a stop, or press Y for a taxi.' : '아직 탑승 기록이 없어요. 정류장에서 E로 버스, Y로 택시.'}</p>`}</div>`;
      },
    });
    handset.addApp({
      id: 'taxi', cls: 'taxi', glyph: '🚕', label: { ko: '택시', en: 'Taxi' },
      render(en) {
        const r = ride?.mode === 'taxi' ? ride : null, fare = `<p class="hint">${en ? 'Fare: ₩0 (Free Trial Card)' : '요금: 0원 (무료 체험 카드)'}</p>`;
        if (r?.phase === 'drive') { // [ride] 주행 중: 이동 중 · 목적지 · 남은 km(실시간) · 세워주세요
          return `<div class="taxi-trip"><div class="st">🚕 ${en ? 'In transit' : '이동 중'}${r.speed === 'fast' ? ` · ⏩ ×${FF}` : ''}</div>
            <div class="to"><small>${en ? 'Destination' : '목적지'}</small><b>${esc(r.dest?.label || '')}</b></div>
            <div class="km"><b data-live="km">${(remainM(r) / 1000).toFixed(1)}</b> km <small>${en ? 'left' : '남음'}</small></div>
            <div class="sp"><span data-live="kmh">${Math.round(r.t.v * 3.6)}</span> km/h · <span data-live="gone">${(r.dist / 1000).toFixed(1)}</span> km ${en ? 'so far' : '이동'}</div></div>
            <button type="button" class="ride-app-btn stop" data-xact="stop" ${r.stopReq ? 'disabled' : ''}>${r.stopReq ? (en ? '🛑 Pulling over…' : '🛑 정차 요청됨') : (en ? '🛑 Pull over here (X)' : '🛑 세워주세요 (X)')}</button>${fare}`;
        }
        if (r?.phase === 'choose') return `<p class="hint"><b>${en ? 'In the taxi — choose a destination' : '탑승 중 — 목적지를 골라 주세요'}</b></p><button type="button" class="ride-app-btn" data-xact="panel">${en ? 'Destinations' : '목적지 선택'}</button>${fare}`;
        const st = r ? ({ called: en ? 'On the way' : '오는 중', wait: en ? 'Arrived — press E near it' : '도착 — 가까이 가서 E' })[r.phase] : '';
        return `<p class="hint">${en ? 'Call the nearest taxi to the roadside (or press Y).' : '가장 가까운 택시를 길가로 부릅니다 (단축키 Y).'}</p>
          ${st ? `<p class="hint"><b>${esc(st)}</b></p><button type="button" class="ride-app-btn" data-xact="cancel">${en ? 'Cancel' : '호출 취소'}</button>` : `<button type="button" class="ride-app-btn" data-xact="hail">🚕 ${en ? 'Call a taxi' : '택시 호출'}</button>`}
          ${fare}`;
      },
      onAction(a) {
        if (a === 'hail') { if (hail()) handset.close(); else handset.refreshApp('taxi'); }
        else if (a === 'cancel') { cancelTaxi(true); handset.refreshApp('taxi'); }
        else if (a === 'stop') { requestStop(); handset.refreshApp('taxi'); }
        else if (a === 'panel') { openTaxiPanel(); handset.close(); }
      },
    });
  }

  let hintSet = false;
  return {
    get active() { return active(); },
    get ride() { return ride; },
    get calling() { return ride?.mode === 'taxi' && (ride.phase === 'called' || ride.phase === 'wait'); },
    setOverlay(o) { overlayRef = o; },
    handleE, hail, toggleCam, remoteHook, requestStop, openRouteMap, closeRouteMap, sound,
    get routeMapOpen() { return !mapEl.hidden; },
    camera: updateCamera,
    // 방송용: 차량 중심 좌표·방향·탑승 코드
    net() {
      if (!active()) return null;
      if (ride.mode === 'bus') { const m = ride.mesh; return { x: m.position.x, z: m.position.z, ry: m.rotation.y, sit: `bus:${ride.path}:${ride.seat}:${ride.dwell ? 'd' : 'r'}`, emote: '', afk: false, moving: !ride.dwell }; }
      const m = ride.t.mesh; return { x: m.position.x, z: m.position.z, ry: m.rotation.y, sit: `taxi:${Math.max(0, LIV_KEYS.indexOf(ride.t.liv))}:${ride.phase === 'drive' ? 'r' : 'd'}`, emote: '', afk: false, moving: ride.phase === 'drive' };
    },
    forceAlight(reason = 'teleport') {
      picking = null;
      if (ride?.mode === 'bus') endBusRide(reason);
      else if (ride?.mode === 'taxi') { if (ride.phase === 'choose' || ride.phase === 'drive') { const r = ride; r.t.manual = false; TR()?.cars?.release(r.t); pl().visible = true; if (r.fare) log.add({ mode: 'taxi', route: 'TAXI', routeName: TAXI_LIVERIES[r.t.liv]?.label || '택시', from: r.from, to: placeName(r.t.mesh.position.x, r.t.mesh.position.z), distM: r.dist, durSec: (r.simT || 0) - (r.simT0 || 0), at: r.at, end: Date.now(), fare: r.fare, speed: r.speed }); ride = null; panel.hidden = true; toast(L('이동하면서 택시에서 내렸어요', 'Left the taxi (teleport)')); emitNow(); } else cancelTaxi(false); }
    },
    update(dt) {
      if (!hintSet && B()) { B().setRideHint(stopHint); hintSet = true; }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.hidden = true; }
      if (capT > 0) { capT -= dt; if (capT <= 0) capEl.hidden = true; }
      const bs = B();
      if (bs) { bs.hideIds.clear(); if (ride?.mode === 'bus' && !ride.P._jz) bs.hideIds.add(ride.b.id); }
      const jb = JB(); if (jb) { jb.hideIds.clear(); if (ride?.mode === 'bus' && ride.P._jz) jb.hideIds.add(ride.b.id); }
      if (ride?.mode === 'bus') updateBus(dt);
      else if (ride?.mode === 'taxi') updateTaxi(dt);
      // 정차 중 버스 앞에서 기다리는 동안은 문을 조금 더 열어 둠
      if (!ride && (bs || jb) && dt > 0) {
        const c = boardable();
        if (c?.kind === 'sim' && (c.b._hold || 0) < HOLD_MAX) { c.b._hold = (c.b._hold || 0) + dt; c.b.dwell = Math.max(c.b.dwell, 0.6); }
      }
      updateGhosts(dt);
      hudAcc += dt; if (hudAcc > 0.2) { hudAcc = 0; renderHud(); }
      appAcc += dt; if (appAcc > 0.25) { appAcc = 0; refreshTaxiApp(); }
      if (!mapEl.hidden) { mapAcc += dt; if (mapAcc > 1) { mapAcc = 0; const sc = mapEl.querySelector('.line')?.scrollTop; renderRouteMap(); const l = mapEl.querySelector('.line'); if (l && sc != null) l.scrollTop = sc; } }
    },
    log, wallet, stats,
    debug: {
      // 테스트용: 다가오는 버스가 있는 정류장 앞으로 이동 → { busId, stopId, ref }
      setupBus(minAhead = 50, maxAhead = 260, jz = false) {
        const bs = jz ? JB() : B(); if (!bs) return null;
        const cands = [];
        for (const b of bs.sim.buses) {
          const st = b.P.stops[b.stopIdx]; if (!st || b.dwell > 0) continue;
          const d = st.s - b.s; if (d < minAhead || d > maxAhead || b.stopIdx >= b.P.stops.length - 3) continue;
          const stop = bs.stopById.get(st.stop); if (!stop?._pos || corridor.inLive(stop._pos.x, stop._pos.z) !== !!jz) continue;
          cands.push({ b, stop, d });
        }
        cands.sort((a, c) => a.d - c.d);
        const c = cands[0]; if (!c) return null;
        const q = samplePath(c.b.P, c.b.P.stops[c.b.stopIdx].s);
        const sp = corridor.freeSpot((c.stop._pos.x + q.x) / 2, (c.stop._pos.z + q.z) / 2);
        return { busId: c.b.id, stopId: c.stop.id, ref: c.b.P.ref, path: pathIdxOf(c.b.P), x: sp.x, z: sp.z, stopIdx: c.b.stopIdx, name: c.stop.name };
      },
      // 시뮬을 sec 초 앞당김(0.1초 단계, 매 단계 탑승 로직 포함). until(state) 가 true 면 멈춤
      ff(sec, until = null) {
        const bs = B(), jb = JB(); if (!bs && !jb) return 0;
        let t = 0;
        for (; t < sec; t += 0.1) {
          for (const x of [bs, jb]) x?.source.update(0.1, x.ctx, { x: pl().position.x, z: pl().position.z });
          if (ride?.mode === 'bus') updateBus(0.1);
          if (until && until()) break;
        }
        renderHud();
        return t;
      },
      bus(id, jz = false) { return (jz ? JB() : B())?.sim.buses.find((b) => b.id === id) || null; },
      state() {
        if (!ride) return { mode: null, cam: { ...camPref } };
        if (ride.mode === 'bus') return { mode: 'bus', ref: ride.P.ref, path: ride.path, seat: ride.seat, s: ride.b.s, stopIdx: ride.b.stopIdx, fromIdx: ride.fromIdx, dwell: ride.dwell, bell: ride.bell, follow: ride.follow, busId: ride.b.id, legs: ride.legs || 1, jz: !!ride.P._jz, x: ride.mesh.position.x, z: ride.mesh.position.z, nextStop: stopName(ride.P, ride.dwell ? ride.b.stopIdx + 1 : ride.b.stopIdx), cam: camPref.bus };
        return { mode: 'taxi', phase: ride.phase, speed: ride.speed, dest: ride.dest?.label, dist: ride.dist, taxiState: ride.t.state, tv: ride.t.v, stopReq: !!ride.stopReq, remainM: ride.phase === 'drive' ? remainM(ride) : null, simT: ride.simT, cam: camPref.taxi, tx: ride.t.mesh.position.x, tz: ride.t.mesh.position.z };
      },
      // 테스트용: 택시를 sec 초 앞당김(오는 중이면 그 택시만 스텝)
      ffTaxi(sec, until = null) {
        // 앞당기는 동안엔 신호 시계가 멈춰 있으므로 신호를 무시(테스트 전용)
        const tr = TR()?.cars?.transit, pl0 = tr?.pedLight; if (tr) tr.pedLight = () => 'red';
        try { return ffTaxiInner(sec, until); } finally { if (tr) tr.pedLight = pl0; }
      },
      ghosts() { return [...ghosts.values()].map((g) => ({ kind: g.kind, path: g.path, peers: g.peers, x: g.mesh.position.x, z: g.mesh.position.z })); },
      pickDest(id) { if (ride?.mode !== 'taxi') return false; const x = destList().find((q) => q.id === id); if (!x) return false; ride.dest = { id: x.id, x: x.x, z: x.z, label: isEn() ? x.en : x.ko, travelId: x.id }; openTaxiPanel(); return true; },
      pickPoint(x, z) { if (ride?.mode !== 'taxi') return false; ride.dest = { id: '@map', x, z, label: placeName(x, z) }; openTaxiPanel(); return true; },
      depart,
      startMapPick, pickAt, finishMapPick,
    },
  };
}
