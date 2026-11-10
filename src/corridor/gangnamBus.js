// [gangnam-bus] 경부고속도로(판교IC 끝→양재IC)와 강남대로를 한 줄로 잇고, 시간표 버스로 강남역에 다가간다.
//   ?gangnambus=0 또는 ?gangnam=0 이면 데이터·메시 없음.
//   경부 본선을 실제로 쓰지 않는 노선은 그 도로에 올리지 않는다. 강남대로에 정류소가 있는 노선만 그 구간을 달린다.
import * as THREE from 'three';
import { ribbonGeo } from '../world.js';
import { gameHour } from '../weather.js';
import { mountGyeongbuExpress, gyeongbuExpressEnabled } from './gyeongbuExpress.js';

export const GANGNAM_BUS_FILE = 'gangnam/transit.json';
export const BUS_CREDIT = '버스 노선·정류소 정보: 서울특별시 (공공데이터포털)';

export function gangnamBusEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const p = new URLSearchParams(search || '');
  return p.get('gangnam') !== '0' && p.get('gangnambus') !== '0';
}

export function clockToMin(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map((v) => Number(v) || 0);
  return h * 60 + m;
}

/** 요일. 일요일은 데이터 holiday, 토요일은 saturday. 그 외 공휴일은 담지 않는다. */
export function dayKind(date = new Date()) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(date);
  if (wd === 'Sun') return 'holiday';
  if (wd === 'Sat') return 'saturday';
  return 'weekday';
}

export function seoulMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const n = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  return (n('hour') % 24) * 60 + n('minute');
}

export function inService(block, nowMin) {
  if (!block) return false;
  const first = clockToMin(block.firstTime);
  const last = clockToMin(block.lastTime);
  const now = ((nowMin % 1440) + 1440) % 1440;
  const lastClock = last >= 1440 ? last - 1440 : last;
  if (last < 1440) return now >= first && now <= last;
  return now >= first || now <= lastClock;
}

/** 다음 출발. last 가 24:05 이면 그 시각을 막차로 포함한다. */
export function nextBus(block, nowMin) {
  if (!block || !(block.term > 0)) return null;
  const first = clockToMin(block.firstTime);
  const last = clockToMin(block.lastTime);
  const times = [];
  for (let t = first; t < last - 1e-6; t += block.term) times.push(t);
  times.push(last);
  const now = ((nowMin % 1440) + 1440) % 1440;
  let best = null;
  for (const t of times) {
    const clock = t >= 1440 ? t - 1440 : t;
    const wait = (clock - now + 1440) % 1440;
    const label = t === last && last >= 1440 ? block.lastTime : `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`;
    if (!best || wait < best.waitMin) best = { waitMin: wait, label, minutes: t };
  }
  return best;
}

/** 정류장 라벨용 노선 번호. 왕복·같은 이름이 겹쳐도 노선당 하나, 처음 나온 순서. */
export function stopRouteNos(routes) {
  const out = [];
  const seen = new Set();
  for (const r of routes || []) {
    const no = String(r?.no ?? r ?? '');
    if (!no || seen.has(no)) continue;
    seen.add(no);
    out.push(no);
  }
  return out;
}

/** 14:00 평일처럼 주어진 시각에 강남대로 위에 그려질 버스. 반경 안·운행 중만. */
export function busesAt(data, { minutes = 14 * 60, kind = 'weekday', x = 0, z = 0, radius = 900 } = {}) {
  const runners = (data?.routes || []).filter((r) => r.onDaero);
  const span = Math.max(400, (data?.lengthM || 0) - (data?.daeroAt || 0));
  const out = [];
  runners.forEach((r, i) => {
    const block = r.timetable?.[kind] || r.timetable?.weekday;
    if (!inService(block, minutes)) return;
    const phase = block?.term ? (((minutes % block.term) / block.term) + i / Math.max(1, runners.length)) % 1 : i / Math.max(1, runners.length);
    const p = pointAt(data.pts, (data.daeroAt || 0) + phase * span);
    if (Math.hypot(p.x - x, p.z - z) > radius) return;
    out.push({ no: r.no, x: p.x, z: p.z });
  });
  return out;
}

function pointAt(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b[2] + 1e-6 < s && i < pts.length - 1) continue;
    const span = (b[2] - a[2]) || 1;
    const t = Math.max(0, Math.min(1, (s - a[2]) / span));
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  }
  const p = pts[0];
  return { x: p[0], z: p[1], ang: 0 };
}

export function mountGangnamTransit(root, data, { overlay, express = null } = {}) {
  if (!data?.pts?.length) return null;
  const group = new THREE.Group();
  group.name = 'gangnamGyeongbu';
  const ribbon = ribbonGeo(data.pts.map((p) => [p[0], p[1], 0.25, p[3] === 'daero' ? 16 : 18]), 18, 0, false);
  const mesh = new THREE.Mesh(ribbon, new THREE.MeshLambertMaterial({ color: '#5e646c' }));
  mesh.name = 'gangnamGyeongbuRoad';
  mesh.frustumCulled = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  group.add(mesh);

  const runners = (data.routes || []).filter((r) => r.onDaero);
  const geo = new THREE.BoxGeometry(12, 3.4, 2.9);
  const mat = new THREE.MeshLambertMaterial({ color: '#3b82f6' });
  const buses = new THREE.InstancedMesh(geo, mat, Math.max(1, runners.length));
  buses.name = 'gangnamBuses';
  buses.count = runners.length;
  buses.frustumCulled = false;
  group.add(buses);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const zero = new THREE.Vector3(0, 0, 0);

  const stops = new Map();
  for (const r of data.routes || []) for (const s of r.stops || []) {
    const key = s.name;
    if (!stops.has(key)) stops.set(key, { ...s, routes: [] });
    stops.get(key).routes.push(r);
  }
  const labels = [];
  if (overlay) {
    for (const s of stops.values()) {
      const item = overlay.add({
        cls: 'label busstop',
        text: s.name,
        getPos: () => new THREE.Vector3(s.x, 3.4, s.z),
        maxDist: 220,
      });
      labels.push({ s, item });
    }
  }
  root.add(group);
  const expressRun = (express && gyeongbuExpressEnabled()) ? mountGyeongbuExpress(group, express, { overlay }) : null;
  let lastMin = -1;

  function update(_dt, x, z) {
    const now = new Date();
    const h = gameHour(now);
    // ?hour=8.018 처럼 소수 시간이 오면 분으로 그대로 써서 광역버스가 분 사이에도 움직인다.
    const rawHour = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('hour') : null;
    const min = (rawHour != null && rawHour !== '' && Number.isFinite(Number(rawHour)))
      ? ((Number(rawHour) % 24) + 24) % 24 * 60
      : Math.round(((h % 24) + 24) % 24 * 60);
    const kind = dayKind(now);
    const span = Math.max(400, (data.lengthM || 0) - (data.daeroAt || 0));
    runners.forEach((r, i) => {
      const block = r.timetable?.[kind] || r.timetable?.weekday;
      const on = inService(block, min);
      const phase = block?.term ? (((min % block.term) / block.term) + i / Math.max(1, runners.length)) % 1 : i / Math.max(1, runners.length);
      const at = (data.daeroAt || 0) + (phase % 1) * span;
      const p = pointAt(data.pts, at);
      const near = Math.hypot(p.x - x, p.z - z) < 900;
      if (!on || !near) { m4.compose(zero, q.identity(), zero); buses.setMatrixAt(i, m4); return; }
      q.setFromAxisAngle(up, p.ang);
      m4.compose(pos.set(p.x, 1.9, p.z), q, scl.set(1, 1, 1));
      buses.setMatrixAt(i, m4);
    });
    if (runners.length) buses.instanceMatrix.needsUpdate = true;
    expressRun?.update(min, kind, x, z);
    if (min !== lastMin) {
      lastMin = min;
      for (const { s, item } of labels) {
        let best = null;
        const nos = stopRouteNos(s.routes);
        for (const r of s.routes) {
          const block = r.timetable?.[kind] || r.timetable?.weekday;
          const n = nextBus(block, min);
          if (n && (!best || n.waitMin < best.waitMin)) best = n;
        }
        const when = best ? `다음 ${best.label}` : '';
        if (item?.el) item.el.textContent = `🚏 ${nos.join('·')} ${when}`.trim();
        else if (item) item.text = `🚏 ${nos.join('·')} ${when}`.trim();
      }
    }
  }
  return { group, update, stops: [...stops.values()] };
}
