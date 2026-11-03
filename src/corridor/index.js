// [corridor] 정자 → 롯데월드타워 코리더 (성남대로 · 송파대로 따라 수내·서현·이매·야탑·모란·태평·가천대·복정·장지·문정·가락시장·송파·석촌·잠실).
// 라이브 정자(jeongja.json) 바깥을 500m 타일로 스트리밍한다. 데이터는 scripts/corridor/build-corridor.mjs 가 미리 구워 public/corridor 에 둔다(빌드에 API 키 불필요).
//   index.json  : 타일 목록·역·랜드마크·경계     base.json : 탄천 구간 도로(ch)·공원(chParks)·횡단보도(전역)
//   tiles/X_Z   : 상세(건물·도로·공원·물·바닥)   lod/X_Z   : 원경용 단순화 데이터
// 라이브 정자 영역(liveBox + 탄천 띠) 안에는 아무것도 그리지 않으므로 기존 정자 화면/동작은 그대로다.
import * as THREE from 'three';
import { mergeTancheon, coveredFn, holeyGround, channelWaterMesh } from './tancheon.js';
import { buildDetailTile, buildLodTile, roadMesh, CAR_KINDS } from './tileMesh.js';
import { applyTileCuts } from '../world/streams.js';
import { buildCorridorCrossings } from './crossings.js';
import { createLandmarks } from './landmarks/index.js';
import { createLotteEvent } from './landmarks/lotteEvent.js';
import { stationSign, Grid } from '../world.js';
import { drawBaseMap } from '../phone.js';
import { addInstancedTrees } from '../world/trees.js';
import { createCorridorLife } from './life.js';
import { extractLifeHints, gatherLifeHints } from './lifeHints.js'; // [life] 동네별 보행자·주차 위치 힌트
import { setNightCut, updateNight } from './nightLights.js';
import { pangyoEnabled, pangyoLinkEnabled, mergePangyoIndex, fetchCorridorTile, PANGYO_DIR } from './pangyo.js'; // [pangyo]
import { createPangyoLandmarks } from './landmarks/pangyo.js'; // [pangyo]
import { isEn, onLangChange } from '../i18n.js'; // [pangyo-link] 판교역 라벨 KO/EN
import { createPangyoNpc, pangyoNpcEnabled } from './pangyoNpc.js'; // [pangyo-npc]

// streams: 탄천 지류 하도(streams.json). ?streams=0 이면 false → 예전과 같은 데이터만
// [pangyo] pangyo: 판교역 일대(pangyo/index.json). ?pangyo=0 이면 false → 요청 없음
export async function loadCorridorData(baseUrl, { streams = true, pangyo = pangyoEnabled(), fetchFn = fetch } = {}) {
  const get = (f) => fetchFn(baseUrl + f).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [index, base, tancheon, streamsData, pg] = await Promise.all([get('index.json'), get('base.json'), get('tancheon.json'), streams ? get('streams.json') : null, pangyo ? get(PANGYO_DIR + 'index.json') : null]);
  return index && base ? { index: mergePangyoIndex(index, pg), base, baseUrl, tancheon, streams: streamsData, pangyo: pg } : null;
}
// [corridor] 탄천 지형: 코리더가 켜졌을 때만 라이브 terrain.json 뒤에 수내→잠실 축/단면을 이어 붙인다(라이브 구간 값은 그대로)
export function corridorTerrainData(terrainData, corridorData) {
  if (!terrainData || !corridorData?.tancheon) return terrainData;
  const T = mergeTancheon(terrainData, corridorData.tancheon);
  if (T === terrainData) return T;
  corridorData.terrainT = T;
  // [streams] 지류는 코리더 본류 축이 붙었을 때만 (합류 높이가 본류 단면에 기대므로)
  return corridorData.streams?.streams?.length ? { ...T, streams: corridorData.streams } : T;
}

const QUALITY = { low: { detail: 450, lod: 1500 }, med: { detail: 650, lod: 1800 }, high: { detail: 850, lod: 2400 } };
const OVERVIEW_LOD = 4200;
const LINE_COLOR = { 신분당선: '#d4003b', 수인분당선: '#f5a200', 경강선: '#0054a6', '2호선': '#00a84d', '3호선': '#ef7c1c', '8호선': '#e6186c', '9호선': '#bdb092' };
const LINE_EN = { 신분당선: 'Shinbundang', 수인분당선: 'Suin-Bundang', 경강선: 'Gyeonggang', '2호선': 'Line 2', '3호선': 'Line 3', '8호선': 'Line 8', '9호선': 'Line 9' };
const TREE_KINDS = new Set(['primary', 'secondary', 'tertiary']);

const rectDist = (x, z, x0, z0, s) => Math.hypot(Math.max(x0 - x, 0, x - (x0 + s)), Math.max(z0 - z, 0, z - (z0 + s)));
const segNear = (x, z, { ax, az, bx, bz, hw }) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
  return Math.hypot(ax + dx * t - x, az + dz * t - z) < hw;
};

export function createCorridor({ scene, corridorData, terrain, world, renderer, overlay, params, getSimTime = () => null }) {
  const { index, base, baseUrl } = corridorData;
  const TS = index.meta.tileSize;
  const live = index.meta.liveBox;
  setNightCut(live.z0 - 250); // [corridor] 저녁 건물 불빛은 정자(liveBox) 북쪽 250m 밖부터 = 수내 쪽
  const Q = QUALITY[params?.get('corridorq')] || QUALITY.med;
  const root = new THREE.Group(); root.name = 'corridor'; scene.add(root);
  const liveOnRoad = world.onRoad, liveBlocked = world.isBlocked;

  // ---------- 탄천 구간 도로(제방·다리) : 라이브 terrain 이 다리 상판/교각/난간을 만들도록 build 전에 annotate ----------
  // [streams] 켜졌을 때(?streams=0 아님): base.ch 에 없던 탄천 본류 다리(분당수서로·여수대교 램프 등, streams.json mainBridges)도 같이 그림
  const SD = terrain?.streams ? corridorData.streams : null;
  const ch = base.ch.concat(SD?.mainBridges || []).map((r) => ({ ...r, p: r.p.map((p) => p.slice()) }));
  // [streams] 지류 위 다리(타일에 br=1 로 이미 있는 길): 상판 높이·교각·난간만 terrain 이 만든다. 리본은 타일이 그대로 그림
  const streamBridges = SD ? SD.bridges.map((r) => ({ ...r, p: r.p.map((p) => p.slice()) })) : [];
  terrain?.annotate({ roads: ch.concat(streamBridges), water: [], waterLines: [], parks: base.chParks.map((p) => ({ ...p })) });
  const chMesh = roadMesh(ch); if (chMesh) root.add(chMesh);
  const chWater = corridorData.terrainT ? channelWaterMesh(corridorData.tancheon?.water, terrain) : null; // 탄천 수면(수내→잠실)
  if (chWater) root.add(chWater);
  const chGrid = new Grid(30);
  for (const r of ch) if (CAR_KINDS.has(r.k)) for (let i = 1; i < r.p.length; i++) {
    const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], hw = r.w / 2 + 0.6;
    chGrid.add({ ax, az, bx, bz, hw }, Math.min(ax, bx) - hw, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, Math.max(az, bz) + hw);
  }
  const chOnRoad = (x, z) => chGrid.query(x, z).some((s) => segNear(x, z, s));

  // ---------- 타일 상태 ----------
  const tiles = new Map(Object.entries(index.tiles).map(([key, t]) => [key, { key, ...t, detail: null, lod: null, dState: 0, lState: 0 }])); // state 0 없음 1 로딩 2 데이터 3 빌드됨
  const buildQueue = [];
  const getJson = (f) => fetch(baseUrl + f).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const loaded = []; // 빌드된 상세 타일 (충돌/도로 판정은 이것만 훑는다)
  const detailTiles = () => loaded.slice();
  const near = (t, x, z, pad) => x >= t.x0 - pad && x <= t.x0 + TS + pad && z >= t.z0 - pad && z <= t.z0 + TS + pad;

  const corridorOnRoad = (x, z) => {
    if (chOnRoad(x, z)) return true;
    for (const t of loaded) if (near(t, x, z, 40) && t.detail.onRoad(x, z)) return true;
    return false;
  };
  const corridorBlocked = (x, z, r = 0.35) => {
    for (const t of loaded) {
      if (!near(t, x, z, 120)) continue;
      for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (t.detail.blocked(x + dx, z + dz)) return true;
    }
    return false;
  };
  const onRoadAll = (x, z) => liveOnRoad(x, z) || corridorOnRoad(x, z);

  function buildOne() {
    const job = buildQueue.shift(); if (!job) return;
    const t = tiles.get(job.key);
    if (job.kind === 'd' && t.dState === 2) {
      const tile = buildDetailTile(t.key, t.dData, { terrain, onRoadAll });
      const pgLm = pangyoLm?.build(t.key); if (pgLm) tile.group.add(pgLm); // [pangyo] 랜드마크는 그 타일과 같이 생기고 해제
      tile.map = tileMap(t, t.dData);
      tile.hints = extractLifeHints(t.dData, live); // [life]
      t.dData = null; t.detail = tile; t.dState = 3; root.add(tile.group); loaded.push(t);
      if (t.lod) t.lod.group.visible = false;
      stats.builtDetail++;
    } else if (job.kind === 'l' && t.lState === 2) {
      const tile = buildLodTile(t.key, t.lData, base, SD ? terrain : null);
      t.lData = null; t.lod = tile; t.lState = 3; root.add(tile.group);
      tile.group.visible = t.dState !== 3;
      stats.builtLod++;
    }
  }
  // 휴대폰 미니맵용 타일 이미지 (phone.js drawBaseMap 재사용, 탄천 구간 도로 포함)
  function tileMap(t, j) {
    const bx = { x0: t.x0, z0: t.z0, x1: t.x0 + TS, z1: t.z0 + TS };
    const hit = (r) => r.p.some(([x, z]) => x >= bx.x0 - 50 && x <= bx.x1 + 50 && z >= bx.z0 - 50 && z <= bx.z1 + 50);
    try {
      return drawBaseMap({ meta: { bboxLocal: bx }, parks: j.parks, water: j.water, waterLines: j.wl, roads: j.r.concat(ch.filter(hit)), buildings: j.b.filter((b) => !b.nr) }, { features: {} });
    } catch { return null; }
  }
  function requestDetail(t) {
    if (t.dState) return t.dPromise;
    t.dState = 1;
    return (t.dPromise = fetchCorridorTile(getJson, t, 'tiles').then((j) => {
      if (t.dState !== 1) return; // 그 사이 언로드
      if (!j) { t.dState = 0; return; }
      if (SD) prepStreamTile(j, SD.tiles[t.key], 'tile');
      t.dData = j; t.dState = 2; buildQueue.push({ kind: 'd', key: t.key });
    }));
  }
  function requestLod(t) {
    if (t.lState) return;
    t.lState = 1;
    fetchCorridorTile(getJson, t, 'lod').then((j) => {
      if (t.lState !== 1) return;
      if (!j) { t.lState = 0; return; }
      if (SD) prepStreamTile(j, SD.lod[t.key], 'lod');
      t.lData = j; t.lState = 2; buildQueue.push({ kind: 'l', key: t.key });
    });
  }
  // [streams] 하도 띠를 뺀 바닥/공원/수면 폴리곤으로 바꾸고, 길에 지형 높이를 붙임 (다리 br 은 그대로 0m → 위 annotate 의 상판과 같음)
  function prepStreamTile(j, rep, kind) {
    applyTileCuts(j, rep, kind);
    if (kind === 'tile') terrain.liftRoads(j.r || []);
  }
  function unloadDetail(t) {
    if (t.detail) { t.detail.dispose(); t.detail = null; loaded.splice(loaded.indexOf(t), 1); }
    t.dData = null; t.dState = 0; t.dPromise = null;
    if (t.lod) t.lod.group.visible = true;
  }
  function unloadLod(t) { if (t.lod) { t.lod.dispose(); t.lod = null; } t.lData = null; t.lState = 0; }

  let acc = 1, lastMode = 'follow';
  function stream(x, z, mode) {
    const lodR = mode === 'overview' ? OVERVIEW_LOD : Q.lod;
    const wantD = [];
    for (const t of tiles.values()) {
      const d = rectDist(x, z, t.x0, t.z0, TS);
      if (d < Q.detail && mode !== 'overview') wantD.push([d, t]);
      else if (t.dState && d > Q.detail + 250) unloadDetail(t);
      if (d < lodR) requestLod(t);
      else if (t.lState && d > lodR + 500) unloadLod(t);
    }
    wantD.sort((a, b) => a[0] - b[0]).forEach(([, t]) => requestDetail(t));
    // 가까운 타일부터 빌드
    buildQueue.sort((a, b) => {
      const ta = tiles.get(a.key), tb = tiles.get(b.key);
      return (a.kind === 'd' ? 0 : 1e5) + rectDist(x, z, ta.x0, ta.z0, TS) - ((b.kind === 'd' ? 0 : 1e5) + rectDist(x, z, tb.x0, tb.z0, TS));
    });
  }

  // ---------- 바깥 바닥: 지형 평면(-3000..3000) 밖을 같은 바닥 재질로 채움 (terrain.build 뒤에 호출) ----------
  function addOuterGround() {
    const mat = world.ground?.material; if (!mat) return;
    const B = index.meta.bounds, M = 3000, P = 800;
    const rects = [[B.x0 - P, B.z0 - P, B.x1 + P, -M], [M, -M, B.x1 + P, M], [B.x0 - P, -M, -M, M]].filter(([a, b, c, d]) => c > a && d > b);
    const TT = corridorData.terrainT, coveredMain = TT ? coveredFn(terrain, TT) : null; // 탄천 연장 구간은 바닥에 구멍(라이브 바닥과 같은 방식)
    const S = terrain?.streams, covered = coveredMain && S ? (x, z) => coveredMain(x, z) || S.covered(x, z) : coveredMain;
    for (const [a, b, c, d] of rects) {
      let g;
      if (covered) g = holeyGround(a, b, c, d, 0, 8, covered, TT.axis, S ? S.near : null);
      else { g = new THREE.PlaneGeometry(c - a, d - b); g.rotateX(-Math.PI / 2); g.translate((a + c) / 2, 0, (b + d) / 2); }
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = 'corridorOuterGround'; root.add(m);
    }
  }

  // ---------- 역 표지판 + 라벨 ----------
  // [pangyo] 판교역은 라벨·표지판·이동(?at=pangyo)에 넣는다. 버스/차량 NPC(attachLife)에는 [pangyo-link] 가 켜졌을 때만 더한다
  const stations = index.stations.concat(corridorData.pangyo?.stations || []).map((s) => ({ ...s, sign: null }));
  const pgLabels = []; // [pangyo-link] 판교역 라벨: '판교역  신분당선 · 경강선' / 'Pangyo Stn.  Shinbundang · Gyeonggang', 노선색 배경
  for (const s of stations) {
    const lines = s.lines || [];
    const pg = s.id === 'pangyo' && pangyoLinkEnabled();
    const text = pg ? () => (isEn() ? `🚇 ${s.nameEn} Stn.  ${lines.map((l) => LINE_EN[l] || l).join(' · ')}` : `🚇 ${s.name}역  ${lines.join(' · ')}`) : null;
    const item = overlay.add({ cls: 'label station', text: text ? text() : `🚇 ${s.name} ${s.nameEn}  ${lines.join(' · ')}`, getPos: () => new THREE.Vector3(s.x, pg ? 20 : 10, s.z), maxDist: 1500 }); // 판교역: 광장 데크 라벨과 겹치지 않게 20m
    if (pg) {
      item.el.style.background = `linear-gradient(90deg, ${LINE_COLOR[lines[0]] || '#d4003b'} 50%, ${LINE_COLOR[lines[1] || lines[0]] || '#0054a6'} 50%)`;
      pgLabels.push({ item, s, text });
    }
  }
  if (pgLabels.length) onLangChange(() => { for (const p of pgLabels) p.item.el.textContent = p.text(); });
  let homeLabel = null; // game.js 의 정자역 라벨(maxDist 4000): 판교역이 더 가까우면 숨겨서 '정자역' 태그가 판교에 뜨지 않게
  const homeLabelTick = (x, z) => {
    if (!homeLabel || !pgLabels.length) return;
    const h = homeLabel.getPos(), p = pgLabels[0].s;
    homeLabel.hidden = Math.hypot(x - p.x, z - p.z) < Math.hypot(x - h.x, z - h.z);
  };
  function placeSign(s) {
    // 라이브처럼 표지판이 차도/건물에 서지 않도록 출구(없으면 역 중심) 주변을 나선형으로 탐색
    const e = s.signAt || s.exits?.[0] || s; // [pangyo] signAt: 판교역은 출입구 캐노피와 안 겹치는 자리(build-pangyo.mjs)
    const p = { x: e.x, z: e.z };
    for (let r = 0, a = 0; r < 60 && (onRoadAll(p.x, p.z) || corridorBlocked(p.x, p.z, 1.5)); a += 0.5, r += 0.25) { p.x = e.x + Math.cos(a) * r; p.z = e.z + Math.sin(a) * r; }
    const lines = s.lines || [];
    const g = stationSign(p, {
      title: s.name,
      sub: [s.nameEn, ...lines.map((l) => LINE_EN[l] || l)].join(' · '),
      topLeftColor: LINE_COLOR[lines[0]] || '#f5a200',
      topRightColor: LINE_COLOR[lines[1] || lines[0]] || '#f5a200',
    });
    root.add(g); s.sign = g;
  }
  function updateSigns() {
    for (const s of stations) {
      if (s.sign) continue;
      const t = tiles.get(Math.floor(s.x / TS) + '_' + Math.floor(s.z / TS));
      if (t && t.dState === 3) placeSign(s);
    }
  }

  // ---------- 탄천 구간 가로수(라이브와 같은 규칙) ----------
  function chTrees() {
    const pts = [];
    let seed = 99173; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const r of ch) {
      if (!TREE_KINDS.has(r.k) || r.br) continue;
      const [oh, ot] = r.o || [0, 0];
      for (let i = 1 + oh; i < r.p.length - ot; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], L = Math.hypot(bx - ax, bz - az); if (L < 1e-3) continue;
        const nx = -(bz - az) / L, nz = (bx - ax) / L;
        for (let s = 6; s < L; s += 14) for (const side of [-1, 1]) {
          const x = ax + ((bx - ax) * s) / L + nx * side * (r.w / 2 + 1.6), z = az + ((bz - az) * s) / L + nz * side * (r.w / 2 + 1.6);
          if (terrain && terrain.renderHeight(x, z) < -0.3) continue;
          if (!onRoadAll(x, z) && !liveBlocked(x, z, 0)) pts.push([x, z]);
        }
      }
    }
    if (pts.length) addInstancedTrees(root, pts, { rnd, crownRadius: 2.2, crownY: 5, trunkTop: 0.2, trunkBottom: 0.28, trunkHeight: 3.6, trunkColor: '#8a6b4e', scaleMin: 0.8, scaleSpan: 0.5 });
    return pts.length;
  }

  // ---------- 횡단보도 · 랜드마크 ----------
  const crossings = buildCorridorCrossings(root, base.crossings, { getSimTime });
  const landmarks = createLandmarks(root, index.landmarks, renderer);
  const pangyoLm = corridorData.pangyo ? createPangyoLandmarks(corridorData.pangyo, { overlay }) : null; // [pangyo]
  const tower = index.landmarks.find((l) => l.id === 'lotte-world-tower');
  let lotte = null;
  if (tower) {
    const at = tower.fit || tower.pos;
    const label = overlay.add({ cls: 'label landmark', text: '🏙️ 롯데월드타워 Lotte World Tower · 555m', getPos: () => new THREE.Vector3(at.x, 570, at.z), maxDist: 9000, minDist: 60 });
    // 그랜드 오픈 이벤트: 오픈 전엔 타워 대신 카운트다운 (?lotteopen=now|done|pending, lotteOpening.js)
    const item = landmarks.items.find(({ l }) => l.id === 'lotte-world-tower');
    if (item) lotte = createLotteEvent({ root, tower: item.g, at, rotY: item.g.rotation.y, height: item.g.userData.params?.height || 555, halfM: tower.fit?.halfM || 36, label });
  }

  // ---------- 이동 가능 범위: 라이브 bbox ∪ 코리더 경계 ----------
  const lb = world.bounds, cb = index.meta.bounds;
  const bounds = { x0: Math.min(lb.x0, cb.x0), x1: Math.max(lb.x1, cb.x1), z0: Math.min(lb.z0, cb.z0), z1: Math.max(lb.z1, cb.z1) };
  const inLive = (x, z) => x >= live.x0 && x <= live.x1 && z >= live.z0 && z <= live.z1;

  const stats = { builtDetail: 0, builtLod: 0, chRoads: ch.length, signals: crossings.signals, chTrees: 0 };
  let chTreesDone = false;
  let life = null, pangyoNpc = null;
  const api = {
    root, bounds, stations, tiles, stats, crossings, landmarks, inLive,
    pangyo: pangyoLm, // [pangyo] null 이면 꺼짐(?pangyo=0)
    liveBox: live, // [ride]
    get lotte() { return lotte; },
    isBlocked: corridorBlocked, onRoad: corridorOnRoad,
    afterTerrain() { addOuterGround(); },
    // 버스·차량·보행 NPC (수내 → 롯데). game.js 가 버스 프록시가 정해진 뒤 한 번 부른다. ?clife=0 이면 끔
    attachLife({ proxy, mode, liveDrive = null, liveCrossings = null } = {}) { // [ride] liveDrive: 정자 차도(읽기 전용, 정자 택시 호출용)
      const pgLink = !!corridorData.pangyo && pangyoLinkEnabled(); // [pangyo-link] 판교역: 택시/보행 NPC 역 목록 + 버스 8110(정자역→판교역, 정자 쪽과 같이 ?bus=sim 일 때만) (?pangyolink=0 끔)
      if (life || params?.get('clife') === '0') return life;
      // [pangyo-npc] 판교 IT 직장인 NPC: 코리더 보행 NPC crowd 를 같이 쓴다. ?pangyonpc=0 / ?pangyo=0 이면 없음
      pangyoNpc = corridorData.pangyo && pangyoNpcEnabled() ? createPangyoNpc({ pg: corridorData.pangyo, baseUrl, overlay, terrain, isFree: api.isFree, freeSpot: api.freeSpot, tileReady: (k) => tiles.get(k)?.dState === 3 }) : null;
      life = createCorridorLife({ root, baseUrl, crossings, terrain, terrainT: corridorData.terrainT, world, overlay, stations: pgLink ? index.stations.concat(corridorData.pangyo.stations || []) : index.stations, pangyoLink: pgLink && mode === 'sim', liveBox: live, params, proxy, mode, liveDrive, liveCrossings, renderer, hints: (x, z, r) => gatherLifeHints(loaded, x, z, r), extraCrowd: pangyoNpc });
      return life;
    },
    get life() { return life; },
    get pangyoNpc() { return pangyoNpc; }, // [pangyo-npc]
    update(dt, x, z, mode = 'follow') {
      if (!chTreesDone) { chTreesDone = true; stats.chTrees = chTrees(); }
      acc += dt;
      if (acc > 0.25 || mode !== lastMode) { acc = 0; lastMode = mode; stream(x, z, mode); }
      buildOne();
      updateSigns();
      crossings.update(dt);
      landmarks.update(dt);
      lotte?.update(dt);
      updateNight(dt); // [corridor] 저녁 건물 불빛 페이드
      life?.update(dt, x, z);
      homeLabelTick(x, z); // [pangyo-link]
    },
    setHomeStationLabel(item) { homeLabel = item; }, // [pangyo-link] game.js 가 정자역 라벨을 넘긴다
    // 위치 주변 상세 타일을 즉시 로드·빌드 (텔레포트/스크린샷용)
    async preload(x, z, r = Q.detail) {
      const list = [...tiles.values()].filter((t) => rectDist(x, z, t.x0, t.z0, TS) < r);
      // 프레임 스트리머(아직 플레이어는 출발지)가 로딩 중인 먼 타일을 언로드하면 응답이 버려지므로, 빌드될 때까지 몇 번 다시 요청
      for (let i = 0; i < 4; i++) {
        await Promise.all(list.map(requestDetail));
        stream(x, z, 'follow');
        while (buildQueue.length) buildOne();
        if (list.every((t) => t.dState === 3)) break;
      }
      updateSigns();
    },
    // 차도·건물 밖(인도) 가장 가까운 지점 — 텔레포트 도착 위치
    // 인도(차도·건물 밖)인지
    isFree: (x, z) => !(onRoadAll(x, z) || liveBlocked(x, z, 1.2) || corridorBlocked(x, z, 1.2)),
    freeSpot(x0, z0) {
      const bad = (x, z) => onRoadAll(x, z) || liveBlocked(x, z, 1.2) || corridorBlocked(x, z, 1.2);
      if (!bad(x0, z0)) return { x: x0, z: z0 };
      for (let r = 1; r < 120; r += 1) for (let k = 0, n = Math.ceil(r * 1.5); k < n; k++) {
        const a = (k / n) * Math.PI * 2, x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        if (!bad(x, z)) return { x, z };
      }
      return { x: x0, z: z0 };
    },
    counts() {
      let d = 0, l = 0; for (const t of tiles.values()) { if (t.dState === 3) d++; if (t.lState === 3 && t.lod.group.visible) l++; }
      return { detail: d, lod: l, queue: buildQueue.length };
    },
    detailTiles,
    mapTiles: () => loaded.map((t) => t.detail.map).filter(Boolean),
  };
  return api;
}
