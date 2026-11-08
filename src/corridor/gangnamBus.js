// [gangnam-bus] 경부고속도로(판교IC 끝→양재IC)와 강남대로를 한 줄로 잇고, 시간표 버스로 강남역에 다가간다.
//   ?gangnambus=0 또는 ?gangnam=0 이면 데이터·메시 없음.
//   경부 본선을 실제로 쓰지 않는 노선은 그 도로에 올리지 않는다. 강남대로에 정류소가 있는 노선만 그 구간을 달린다.
import * as THREE from 'three';
import { ribbonGeo } from '../world.js';

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

export function mountGangnamTransit(root, data, { overlay } = {}) {
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
  const geo = new THREE.BoxGeometry(10, 3.1, 2.7);
  const mat = new THREE.MeshLambertMaterial({ color: '#1d4e89' });
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
  let lastMin = -1;

  function update(_dt, x, z) {
    const now = new Date();
    const min = seoulMinutes(now);
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
      m4.compose(pos.set(p.x, 1.6, p.z), q, scl.set(1, 1, 1));
      buses.setMatrixAt(i, m4);
    });
    if (runners.length) buses.instanceMatrix.needsUpdate = true;
    if (min !== lastMin) {
      lastMin = min;
      for (const { s, item } of labels) {
        let best = null, nos = [];
        for (const r of s.routes) {
          nos.push(r.no);
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
