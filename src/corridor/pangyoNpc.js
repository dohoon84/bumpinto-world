// [pangyo-npc] 판교역·광장·알파돔시티·테크노밸리 IT 직장인 NPC (?pangyonpc=0 끔, ?pangyo=0 이면 같이 꺼짐)
//   - 몸은 코리더 보행 NPC 와 같은 아바타(createAvatar/animateAvatar)이고, 코리더 보행 NPC 의 crowd(부품별 InstancedMesh)에
//     같이 등록된다(traffic.js extraCrowd 훅) → 몸 부품 draw call 은 그대로, 소품 3종(사원증 목걸이·컵 커피·노트북 가방)만 +3.
//     백팩은 기존 아바타 bag 부품을 그대로 써서 0. 소품은 정점 색 하나의 공유 재질, 그림자 없음, 중립 색(로고·브랜드 색 없음).
//   - 위치: 판교역 출구 · 광장 데크 위 · 회사 입구(OSM 건물 위치 → 가장 가까운 보행 가능 지점) · 식당·카페 앞 (public/corridor/pangyo-npc.json)
//     해당 상세 타일이 빌드된(바닥이 있는) 곳에서만 나온다 — 박스 밖 회사(예: 남쪽 테크노밸리)는 타일이 생기면 자동으로 쓰인다.
//   - 밀도: 게임 시계(gameHour) 기준 출근·점심·퇴근에 많고 밤에 적다(pangyoNpcData.js). 시점 140m 밖은 그리지 않고 230m 밖은 재배치.
//   - 라벨: 회사 이니셜 + 직무만 ("K사 백엔드 개발자" / "K Co. Backend Developer"), 20m 안에서만. 가까이 가면 가벼운 혼잣말 말풍선.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { Bubble } from '../overlay.js';
import { isEn, onLangChange } from '../i18n.js';
import { gameHour } from '../weather.js';
import { MAX_NPC, densityAt, rolePool, roleLabel, LINES } from './pangyoNpcData.js';

export const PANGYO_NPC_FILE = 'pangyo-npc.json';
export function pangyoNpcEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search);
  return q.get('pangyo') !== '0' && q.get('pangyonpc') !== '0';
}

// ---------- 소품: 정점 색 병합 지오메트리 3종 + 공유 재질 (모듈 1회) ----------
const PROP = { strap: '#3f4652', card: '#f1f2f4', photo: '#9aa3ad', cup: '#f3efe7', sleeve: '#b48f62', lid: '#e4e1da', bag: '#3a3f47', bagFlap: '#30353c', buckle: '#8d939b' };
function colored(g, c) {
  const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose();
  if (n.attributes.uv) n.deleteAttribute('uv');
  const col = new THREE.Color(c), a = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = col.r; a[i + 1] = col.g; a[i + 2] = col.b; }
  n.setAttribute('color', new THREE.BufferAttribute(a, 3)); return n;
}
const box = (sx, sy, sz, x, y, z, c, rz = 0) => { const g = new THREE.BoxGeometry(sx, sy, sz); if (rz) g.rotateZ(rz); g.translate(x, y, z); return colored(g, c); };
const cyl = (rt, rb, h, y, c) => { const g = new THREE.CylinderGeometry(rt, rb, h, 10); g.translate(0, y, 0); return colored(g, c); };
let shared = null;
export function propShared() {
  if (shared) return shared;
  const merge = (list) => { const g = mergeGeometries(list); list.forEach((x) => x.dispose()); g.computeBoundingSphere(); return g; };
  shared = {
    // 사원증 목걸이: 끈 2 + 카드 + 사진 칸 (몸 앞면 기준, 원점 = 카드 중심 높이 1.0)
    badge: merge([box(0.022, 0.28, 0.012, -0.055, 0.18, 0, PROP.strap, -0.34), box(0.022, 0.28, 0.012, 0.055, 0.18, 0, PROP.strap, 0.34),
      box(0.09, 0.115, 0.014, 0, 0, 0.006, PROP.card), box(0.034, 0.04, 0.004, 0, 0.018, 0.015, PROP.photo)]),
    // 컵 커피(무지 종이컵 + 크라프트 슬리브 + 뚜껑) — 왼팔 끝에 든다
    cup: merge([cyl(0.056, 0.042, 0.145, 0.072, PROP.cup), cyl(0.058, 0.05, 0.058, 0.068, PROP.sleeve), cyl(0.06, 0.058, 0.022, 0.152, PROP.lid)]),
    // 노트북 가방(서류형): 본체 + 덮개 + 버클 + 어깨끈(대각선) — 몸 기준 좌표
    laptop: merge([box(0.07, 0.3, 0.4, 0.27, 0.8, 0.02, PROP.bag), box(0.075, 0.12, 0.405, 0.272, 0.9, 0.02, PROP.bagFlap), box(0.08, 0.03, 0.05, 0.275, 0.86, 0.02, PROP.buckle),
      box(0.03, 0.82, 0.014, 0.04, 1.16, 0.235, PROP.bag, 0.62)]),
    mat: new THREE.MeshLambertMaterial({ vertexColors: true }), // traffic.js crowd: vertexColors 재질은 인스턴스 색 대신 이 재질 그대로(소품당 1 draw)
  };
  return shared;
}

// ---------- 외모: 오피스 캐주얼 중립 팔레트 ----------
const TOPS = ['#f4f4f2', '#e9eef3', '#dfe7ef', '#c9ced6', '#2f3a4a', '#3b3f45', '#e8e0d2', '#7d8b99', '#a7b3a0', '#d8d2e0', '#ffffff', '#55606e'];
const PANTS = ['#2b2f36', '#3c4350', '#5a6170', '#8a7f6c', '#34495e', '#22262b', '#6b6458'];
const SKINS = ['#f2d0b0', '#e8c4a8', '#f6d7c3', '#d7a888'];
const BAGS = ['#2e3238', '#4a4f57', '#5b5348'];
function officeLook(r) {
  const pick = (a) => a[Math.floor(r() * a.length)], f = r() < 0.42;
  const look = { color: pick(TOPS), pants: pick(PANTS), skin: pick(SKINS), gender: f ? 'f' : 'm', hair: f ? pick(['long', 'pony', 'short']) : 'short' };
  if (r() < 0.32) look.glasses = true;
  const t = r(); if (t < 0.2) look.top = 'hoodie'; else if (t < 0.28) look.top = 'short';
  return look;
}

const TS = 500;
const tileKey = (x, z) => `${Math.floor(x / TS)}_${Math.floor(z / TS)}`;
function inRing(x, z, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; }
function segD(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)); return Math.hypot(ax + dx * t - px, az + dz * t - pz); }

const SHOW_R = 140, LOD_R = 55, PLACE_R = 170, REPLACE_R = 230, LABEL_R = 28, TALK_R = 7;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// opts: pg(판교 index.json) · baseUrl · overlay · terrain · isFree(x,z) · freeSpot(x,z) · tileReady(key) · seed · getHour · fetchJson
// 성능 측정용: ?pangyonpcn=N → 시간대와 무관하게 N명 상시 (배우 풀도 N). 평소엔 없음
export function pangyoNpcForce(search = typeof location !== 'undefined' ? location.search : '') {
  const n = parseInt(new URLSearchParams(search).get('pangyonpcn'), 10);
  return n > 0 ? Math.min(n, 400) : 0;
}

export function createPangyoNpc({ pg, baseUrl = '', overlay = null, terrain = null, isFree = () => true, freeSpot = (x, z) => ({ x, z }), tileReady = () => true, seed = 4242, getHour = gameHour, fetchJson = null, count = 0, force = pangyoNpcForce() } = {}) {
  count = force || count || MAX_NPC;
  const dens = (h) => { const d = densityAt(h); return force ? { ...d, count: force } : d; };
  let rs = seed; const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const P = propShared();
  let data = null;
  const get = fetchJson || ((f) => fetch(baseUrl + f).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  const loading = Promise.resolve(get(PANGYO_NPC_FILE)).then((j) => { data = j?.companies?.length ? j : null; spots = buildSpots(); return data; });

  // ---------- 장소 ----------
  const deckL = pg?.landmarks?.find((l) => l.model === 'pangyoDeck');
  // 데크 높이 = 공유 데이터(pangyo/index.json 의 landmark part h — landmarks/pangyo.js buildDeck 이 같은 값으로 상판을 만든다). 하드코딩 없음
  const deckParts = (deckL?.parts || []).filter((p) => p.o?.length >= 3 && Number.isFinite(p.h)).map((p) => ({ o: p.o, holes: p.holes || [], y: p.h }));
  const deck = deckParts.length ? { parts: deckParts, y: Math.max(...deckParts.map((p) => p.y)), key: tileKey(deckL.pos.x, deckL.pos.z), x: deckL.pos.x, z: deckL.pos.z } : null;
  const exits = (pg?.stations || []).flatMap((s) => s.exits || []);
  let spots = { station: [], company: [], food: [] };
  function buildSpots() {
    const mk = (x, z, extra) => ({ x, z, key: tileKey(x, z), at: null, load: 0, ...extra }); // at: 바닥이 생긴 뒤 freeSpot 으로 정한 보행 가능 지점(캐시)
    return {
      station: exits.map((e) => mk(e.x, e.z, { ref: e.ref })),
      company: (data?.companies || []).map((c) => mk(c.x, c.z, { company: c })),
      food: (data?.food || []).map(([x, z, k]) => mk(x, z, { cafe: k === 'c' })),
    };
  }
  const ready = (s) => {
    if (!tileReady(s.key)) return null;
    if (!s.at) { const p = freeSpot(s.x, s.z); s.at = Math.hypot(p.x - s.x, p.z - s.z) < 90 && isFree(p.x, p.z) ? p : false; }
    return s.at || null;
  };

  // ---------- 경로 ----------
  // 보행 가능 지점에서 출발해 '직진을 선호하며 막히면 조금씩 꺾는' 걸음으로 보도·광장을 따라가는 폴리라인
  const TURNS = [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.35, -1.35, 1.8, -1.8];
  function freePath(x0, z0, ok, step = 2.5, n = 26) {
    let a = rnd() * Math.PI * 2;
    const pts = [[x0, z0]];
    let x = x0, z = z0;
    for (let i = 0; i < n; i++) {
      let moved = false;
      for (const t of TURNS) {
        const b = a + t + (rnd() - 0.5) * 0.12, nx = x + Math.cos(b) * step, nz = z + Math.sin(b) * step;
        if (ok(nx, nz) && ok(x + Math.cos(b) * step * 2, z + Math.sin(b) * step * 2) && ok((x + nx) / 2, (z + nz) / 2)) { a = b; x = nx; z = nz; pts.push([x, z]); moved = true; break; }
      }
      if (!moved) break;
    }
    return pts.length >= 6 ? pts : null;
  }
  const partOk = (d) => (x, z) => inRing(x, z, d.o) && !d.holes.some((h) => inRing(x, z, h)) && [d.o, ...d.holes].every((r) => r.every((p, i) => segD(x, z, p[0], p[1], r[(i + 1) % r.length][0], r[(i + 1) % r.length][1]) > 1.6));
  // 데크 위 경로: 상판 하나를 골라 그 안(가장자리 1.6m 안쪽)만 걷는다 → [경로, 그 상판 높이]
  function deckPath() {
    for (let t = 0; t < 20; t++) {
      const d = deck.parts[Math.floor(rnd() * deck.parts.length)], ok = partOk(d);
      const xs = d.o.map((p) => p[0]), zs = d.o.map((p) => p[1]);
      const x = Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs)), z = Math.min(...zs) + rnd() * (Math.max(...zs) - Math.min(...zs));
      if (ok(x, z)) { const p = freePath(x, z, ok, 2, 18); if (p) return [p, d.y]; }
    }
    return [null, null];
  }

  // ---------- 배우(아바타 풀) ----------
  const actors = [];
  for (let i = 0; i < count; i++) {
    const look = officeLook(rnd);
    const b = rnd(); if (b < 0.4) look.bag = pick(BAGS); // 백팩(기존 아바타 bag 부품)
    const mesh = createAvatar(look);
    const u = mesh.userData, female = look.gender === 'f', hood = look.top === 'hoodie';
    const prop = (geo) => { const m = new THREE.Mesh(geo, P.mat); m.castShadow = false; m.receiveShadow = false; return m; };
    let badge = null, laptop = null;
    if (rnd() < 0.78) { badge = prop(P.badge); badge.position.set(0, 1.0, (female ? 0.205 : 0.225) * (hood ? 1.08 : 1) + 0.006); u.rig.add(badge); }
    if (!look.bag && b < 0.68) { laptop = prop(P.laptop); laptop.scale.x = female ? 0.92 : 1.05; u.rig.add(laptop); }
    const cup = prop(P.cup); cup.position.set(0.02, -0.68, 0.09); cup.rotation.set(Math.PI * 0.46, 0, -0.18); cup.visible = false; u.armL.add(cup);
    u.handCoffee = cup; u.coffee = false; // animateAvatar 의 컵 든 팔 자세·홀짝 애니를 그대로 쓴다(컵은 무지 소품)
    mesh.visible = false;
    const a = { i, mesh, cup, badge, laptop, look, parts: null, path: null, cum: null, L: 0, s: 0, dir: 1, speed: 1, idle: 0, y: 0, yFix: null, active: false, leaving: false, shown: false, kind: null, who: null, cupRoll: rnd(), said: 0, spot: null, tag: null, bubble: null };
    if (overlay) {
      const head = () => (a.shown && a.who && now() - lastRender < 500 ? a.mesh.position.clone().setY(a.mesh.position.y + 2.2) : null);
      a.tag = overlay.add({ cls: 'tag npc pangyo-worker', text: '', getPos: head, maxDist: LABEL_R });
      a.bubble = new Bubble(overlay, 'npc', () => (a.shown && now() - lastRender < 500 ? a.mesh.position.clone().setY(a.mesh.position.y + 2.62) : null), { getName: () => labelOf(a), getColor: () => '#5c6f86' });
    }
    actors.push(a);
  }
  const labelOf = (a) => (a.who ? roleLabel(a.who, isEn()) : '');
  const relabel = () => { for (const a of actors) if (a.tag) a.tag.el.textContent = labelOf(a); };
  const stopLang = onLangChange(relabel);

  // 회사 입구 NPC 는 그 회사 이니셜. 역·식당·데크 NPC 는 '위치가 확인된 모든 회사' 중 이니셜을 고르게(K 가 여러 곳이어도 K 한 표) 뽑는다
  const byInitial = () => {
    const m = new Map(); for (const c of data?.companies || []) { if (!m.has(c.initial)) m.set(c.initial, []); m.get(c.initial).push(c); }
    return [...m.values()];
  };
  let groups = null;
  const companyOf = (s) => {
    groups ||= byInitial();
    const c = s?.company || (groups.length ? pick(pick(groups)) : { initial: 'K', kind: 'platform' });
    return { initial: c.initial, kind: c.kind, role: pick(rolePool(c.kind)) };
  };
  function chooseKind(mix) {
    let r = rnd(); for (const [k, w] of Object.entries(mix)) { r -= w; if (r <= 0) return k; } return 'station';
  }
  // 한 명 배치: 시점 PLACE_R 안의 (바닥이 있는) 장소 중 시간대 비중에 맞는 곳
  function place(a, fx, fz, D) {
    const near = (s) => Math.abs(s.x - fx) < PLACE_R && Math.abs(s.z - fz) < PLACE_R;
    for (let t = 0; t < 4; t++) {
      const kind = t < 3 ? chooseKind(D.mix) : 'station';
      let path = null, yFix = null, sp = null;
      if (kind === 'deck') {
        if (!deck || !near(deck) || !tileReady(deck.key)) continue;
        [path, yFix] = deckPath();
      } else {
        const cand = (spots[kind] || []).filter(near);
        if (!cand.length) continue;
        // 가장 한산한 곳부터(같으면 무작위) — 출구·식당마다 고르게 붐비도록
        let best = Infinity;
        for (const c of cand) { const n = c.load + rnd() * 0.9; if (n < best) { best = n; sp = c; } }
        const at = ready(sp); if (!at) continue;
        path = freePath(at.x, at.z, isFree, 2.5, kind === 'company' ? 24 : kind === 'station' ? 10 : 14); // 역·식당 앞은 짧게 오가며 붐비게
        if (path && rnd() < 0.5) path.reverse(); // 절반은 그 장소로 '향해' 걷는다
      }
      if (!path) continue;
      const cum = [0]; for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]));
      if (a.spot) a.spot.load--; a.spot = sp; if (sp) sp.load++;
      Object.assign(a, { path, cum, L: cum[cum.length - 1], s: rnd() * cum[cum.length - 1], dir: rnd() < 0.5 ? 1 : -1, yFix, kind, idle: 0, leaving: false });
      a.speed = (kind === 'station' && D.period !== 'lunch' ? 1.15 : 0.95) + rnd() * 0.3;
      a.who = companyOf(kind === 'company' ? sp : null);
      const cupOn = (a.cupRoll < D.coffee) || (kind === 'food' && sp?.cafe && rnd() < 0.7);
      a.mesh.userData.coffee = cupOn ? 'hot' : false; a.cup.visible = cupOn;
      if (a.tag) a.tag.el.textContent = labelOf(a);
      return true;
    }
    a.path = null; return false;
  }
  const sample = (a, s) => {
    let k = 1; while (k < a.cum.length - 1 && a.cum[k] < s) k++;
    const p = a.path[k - 1], q = a.path[k], L = a.cum[k] - a.cum[k - 1] || 1, f = (s - a.cum[k - 1]) / L;
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, (q[0] - p[0]) / L, (q[1] - p[1]) / L];
  };
  const hide = (a) => { if (a.spot) { a.spot.load--; a.spot = null; } a.path = null; a.shown = false; a.mesh.visible = false; if (a.bubble) a.bubble.item.hidden = true; };

  let lastRender = -1e9;
  let D = dens(getHour()), dAcc = 99, chk = 99, sayAcc = 0, lastSay = -99, clock = 0;
  const stats = { active: 0, placed: 0, visible: 0, period: D.period, target: D.count, byKind: {}, props: 3, cpuMs: 0, pool: count };
  function say(a) {
    if (!a.bubble || !a.shown) return false;
    const pool = LINES[D.period] || [], all = pool.concat(LINES.any), l = all[Math.floor(rnd() * all.length)];
    a.bubble.say(isEn() ? l[1] : l[0], 4200); a.said = 22; lastSay = clock; return true;
  }

  // traffic.js 훅 ---------------------------------------------------------------
  return {
    actors, loading, stats, deck,
    get data() { return data; },
    get spots() { return spots; }, // 디버그·테스트용
    // crowd.finalize() 전에 한 번: 아바타 부품을 공유 crowd 에 등록
    register(crowd) { for (const a of actors) a.parts = crowd.register(a.mesh); },
    // 매 프레임 crowd.begin() ~ crowd.end() 사이 (코리더 보행 NPC 갱신 직후)
    render(crowd, dt, fx, fz) {
      const t0 = now(); lastRender = t0; clock += dt; dAcc += dt; chk += dt; sayAcc += dt;
      if (dAcc > 2) { dAcc = 0; D = dens(getHour()); stats.period = D.period; stats.target = D.count; }
      if (!data) return;
      let have = 0; for (const a of actors) if (a.path) have++;
      const check = chk > 1 || have < D.count / 2; if (check) chk = 0; // 처음 채울 땐 매 프레임
      let placedNow = 0, act = 0, vis = 0, placed = 0;
      const byKind = {};
      for (const a of actors) {
        const want = a.i < D.count;
        if (!want && a.path && !a.leaving) a.leaving = true; // 남는 인원: 보이는 중이면 경로 끝까지 걷고 사라짐
        if (a.leaving && (!a.shown || Math.hypot(a.mesh.position.x - fx, a.mesh.position.z - fz) > 60)) hide(a);
        if (!a.path) {
          if (want && check && placedNow < 4) { placedNow++; place(a, fx, fz, D); }
          if (!a.path) { if (a.mesh.visible) a.mesh.visible = false; a.shown = false; continue; }
        }
        if (want) act++;
        const p = a.mesh.position;
        let v = 0;
        if (a.idle > 0) a.idle -= dt;
        else {
          v = a.speed; a.s += a.dir * v * dt;
          if (a.s <= 0 || a.s >= a.L) {
            a.s = Math.max(0, Math.min(a.L, a.s)); a.dir *= -1; a.idle = (a.kind === 'deck' || a.kind === 'food' ? 3 : 1) + rnd() * 4;
            if (a.leaving) { hide(a); continue; }
          }
        }
        const [x, z, dx, dz] = sample(a, a.s);
        if (check && Math.hypot(x - fx, z - fz) > REPLACE_R) { hide(a); continue; } // 멀어진 사람은 시점 근처로 다시 배치
        const y = a.yFix ?? (terrain ? terrain.getGroundHeight(x, z, a.y) : 0); a.y = y;
        p.set(x, y, z); a.mesh.rotation.y = Math.atan2(dx * a.dir, dz * a.dir);
        placed++; byKind[a.kind] = (byKind[a.kind] || 0) + 1;
        const d = Math.hypot(x - fx, z - fz), near = d < SHOW_R;
        a.mesh.visible = near; a.shown = near;
        a.said = Math.max(0, a.said - dt); a.bubble?.tick();
        if (!near) continue;
        vis++;
        animateAvatar(a.mesh, v, dt);
        crowd.add(a.mesh, a.parts, d > LOD_R);
        if (d < TALK_R && !a.said && clock - lastSay > 5 && !a.bubble?.showing) say(a); // 다가가면 한마디
      }
      // 가끔 근처(25m) 사람 한 명이 혼잣말
      if (sayAcc > 9) { sayAcc = 0; const c = actors.filter((a) => a.shown && !a.said && Math.hypot(a.mesh.position.x - fx, a.mesh.position.z - fz) < 25); if (c.length && rnd() < 0.6 && clock - lastSay > 5) say(c[Math.floor(rnd() * c.length)]); }
      Object.assign(stats, { active: act, placed, visible: vis, byKind });
      stats.cpuMs = stats.cpuMs * 0.95 + (now() - t0) * 0.05; // 프레임당 NPC 갱신 비용(지수 평균)
    },
    say: (i) => say(actors[i]),
    dispose() { stopLang(); for (const a of actors) { if (a.tag) overlay.remove(a.tag); if (a.bubble) overlay.remove(a.bubble.item); } },
  };
}
