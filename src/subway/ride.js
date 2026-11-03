// [subway] 승강장·열차 순수 로직 (three·DOM 없음 → scripts/test-subway.mjs)
//   노선 정차 순서(LINE_STOPS, OSM relation) · 편성 량수(lines.js TRAIN) → 승강장 길이·스크린도어 번호·앞뒤 역·방면 글자
//   열차 움직임(진입 감속 → 정차·문 열림 → 출발 가속) · 다음 열차 시각(실시간 도착 또는 시간표 근사) · 역 사이 주행 시간
//   좌표(승강장 Scene): x = 선로 방향, 열차 진행 방향 = +x (1호차 = +x 끝), 승강장 쪽 z < 0, 스크린도어 z = 0, 선로 z > 0
import { LINES, TRAIN, CAR_LEN, DOOR_OFF } from './lines.js';
import { STATIONS, LINE_STOPS } from './stationsData.js';

export const BY_NAME = new Map(STATIONS.map((s) => [s.name, s]));
export const isGameStop = (line, name) => !!BY_NAME.get(name)?.lines.includes(line); // 게임에 대합실이 있고 이 노선이 서는 역
export const stopsOf = (line) => LINE_STOPS[line]?.stops || [];

// from 역에서 dir 방면으로 가는 다음 역들 (순환선은 한 바퀴 전까지, 아니면 종점까지)
export function nextStops(line, dir, from, max = 60) {
  const L = LINE_STOPS[line], seq = TRAIN[line]?.seq?.[dir];
  if (!L || !seq) return [];
  const st = L.stops, i = st.indexOf(from);
  if (i < 0) return [];
  const out = [];
  for (let k = 1; k <= Math.min(max, st.length - 1); k++) {
    let j = i + seq * k;
    if (L.circle) j = ((j % st.length) + st.length) % st.length;
    else if (j < 0 || j >= st.length) break;
    out.push(st[j]);
  }
  return out;
}
// 앞뒤 역 (승강장 간판 ← 이전 · 다음 →). 이 방면에서 열차가 오는 쪽 = prev
export function neighbors(line, dir, name) {
  const next = nextStops(line, dir, name, 1)[0] || null;
  const prev = nextStops(line, 1 - dir, name, 1)[0] || null;
  return { prev, next };
}
// 이 방면으로 타서 내릴 수 있는 게임 역들 (가까운 순). 없으면 [] → 탑승 막음 (내릴 곳이 아직 없다)
export function rideStops(line, dir, from, max = 24) {
  const ups = nextStops(line, dir, from, max);
  let last = -1;
  ups.forEach((n, i) => { if (isGameStop(line, n)) last = i; });
  return last < 0 ? [] : ups.slice(0, last + 1).map((n) => ({ name: n, game: isGameStop(line, n), id: BY_NAME.get(n)?.id || null }));
}

// 승강장 배치: 스크린도어 (량·문 번호), 길이
export function platformLayout(line) {
  const T = TRAIN[line] || { cars: 6, doors: 4 };
  const N = T.cars, trainLen = N * CAR_LEN;
  const doors = [];
  for (let c = 1; c <= N; c++) {
    const xc = (N / 2 - c + 0.5) * CAR_LEN;
    for (let d = 1; d <= T.doors; d++) doors.push({ car: c, door: d, label: `${c}-${d}`, x: +(xc + DOOR_OFF[d - 1]).toFixed(2) });
  }
  return { cars: N, doorsPerCar: T.doors, carLen: CAR_LEN, trainLen, half: trainLen / 2 + 8, doors };
}
export const DOOR_W = 1.3; // 출입문·스크린도어 폭 (m)
export const doorAt = (lay, x, r = DOOR_W / 2) => lay.doors.find((d) => Math.abs(d.x - x) < r) || null;

// 간판 글자
export function signText(def, line, dir) {
  const L = LINES[line], nb = neighbors(line, dir, def.name);
  const en = (n) => BY_NAME.get(n)?.nameEn || null;
  return {
    name: def.name, nameEn: def.nameEn, color: L.color, short: L.short, lineKo: L.ko, lineEn: L.en,
    dirKo: L.dirs[dir].ko, dirEn: L.dirs[dir].en, prev: nb.prev, next: nb.next, prevEn: nb.prev && en(nb.prev), nextEn: nb.next && en(nb.next),
  };
}
// 안내 방송 (자막). 한국 지하철 안내 방송 형식을 따른 일반 문구 (특정 운영사 녹음 원문 아님)
// [subway-voice] 녹음 파일 이름용 슬러그 (영문 역명/방면 → 'wangsimni', 'jamsil-sports-complex')
export const clipSlug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// 안내 방송 문구 + kind·clip(녹음 교체용 이름: public/audio/subway/<clip>.<ko|en>.<ogg|m4a>)
export function announce(kind, o = {}) {
  const a = announceText(kind, o);
  if (!a.ko) return a;
  const key = clipSlug(['approach', 'arrived', 'noRide'].includes(kind) ? (o.dirEn || '').replace(/^for /, '') : kind === 'closing' ? '' : (o.nameEn || o.name));
  return { ...a, kind, clip: key ? `${kind}-${key}` : kind };
}
function announceText(kind, o = {}) {
  const dKo = (o.dirKo || '').replace(/ 방면$/, ''), dEn = (o.dirEn || '').replace(/^for /, '');
  switch (kind) {
    case 'approach': return { ko: `지금 ${dKo} 방면으로 가는 열차가 들어오고 있습니다. 안전선 밖으로 한 걸음 물러서 주시기 바랍니다.`, en: `The train bound for ${dEn} is now approaching. Please step back from the platform screen doors.` };
    case 'arrived': return { ko: `${dKo} 방면 열차입니다. 내리는 분이 먼저 내린 다음 타시기 바랍니다.`, en: `This train is bound for ${dEn}. Please let passengers off first.` };
    case 'closing': return { ko: '출입문 닫습니다.', en: 'The doors are closing.' };
    case 'next': return { ko: `이번 역은 ${o.name}, ${o.name}역입니다.${o.transfer ? ` ${o.transfer}으로 갈아타실 수 있습니다.` : ''}`, en: `This stop is ${o.nameEn || o.name}.${o.transferEn ? ` You can transfer to the ${o.transferEn}.` : ''}` };
    case 'depart': return { ko: `다음 역은 ${o.name}역입니다.`, en: `The next stop is ${o.nameEn || o.name}.` };
    case 'noAlight': return { ko: `${o.name}역은 아직 게임 지상이 없어 내릴 수 없어요. 다음 역까지 타고 가요.`, en: `${o.nameEn || o.name} isn't in the game yet — stay on to the next stop.` };
    case 'last': return { ko: `이 방면 마지막 게임 역입니다. ${o.name}역에서 내려 주세요.`, en: `Last in-game stop this way — please get off at ${o.nameEn || o.name}.` };
    case 'noRide': return { ko: `${dKo} 방면은 내릴 수 있는 게임 역이 아직 없어요 (다음 업데이트).`, en: `No in-game stop toward ${dEn} yet — coming soon.` };
    default: return { ko: '', en: '' };
  }
}

// ---------- 열차 움직임 (승강장 기준) ----------
//   t = 정차 순간 기준 초 (음수 = 진입 중). 진입: V_IN 에서 등감속 APPROACH 초. 정차 DWELL 초 (문: OPEN_AT~CLOSE_AT). 출발: 등가속 A_OUT
export const MOTION = Object.freeze({ V_IN: 16, APPROACH: 11, DWELL: 30, OPEN_AT: 1.5, CLOSE_AT: 25, DOOR_SEC: 1.6, A_OUT: 1.1 });
export function trainMotion(t, M = MOTION) {
  const a = M.V_IN / M.APPROACH;
  if (t < -M.APPROACH) return { phase: 'away', off: -Infinity, v: M.V_IN, doors: 0 };
  if (t < 0) return { phase: 'approach', off: -0.5 * a * t * t, v: -a * t, doors: 0 };
  if (t < M.DWELL) {
    const o = (t - M.OPEN_AT) / M.DOOR_SEC, c = (M.CLOSE_AT - t) / M.DOOR_SEC;
    return { phase: 'dwell', off: 0, v: 0, doors: Math.max(0, Math.min(1, o, c + 1)) };
  }
  const u = t - M.DWELL;
  return { phase: 'depart', off: 0.5 * M.A_OUT * u * u, v: M.A_OUT * u, doors: 0 };
}
// 문이 열려 있어 탈 수 있는 동안
export const boardable = (t, M = MOTION) => t >= M.OPEN_AT + M.DOOR_SEC * 0.6 && t <= M.CLOSE_AT;

// ---------- 다음 열차 시각 ----------
// 시간표 근사 (arrivals.js simulatedRows 와 같은 식 → 대합실 안내판과 같은 '몇 분 후'). 실제 시간표 아님.
export const SIM_HEADWAY_MIN = Object.freeze({ suin: 8, shin: 6, gg: 12, l2: 4, l3: 6, l8: 6, l9: 6 });
export const SERVICE_MIN = Object.freeze({ start: 5 * 60 + 30, end: 24 * 60 }); // 05:30 ~ 24:00 (근사)
export function simOffsetMin(line, dir, seed = '') {
  const hw = SIM_HEADWAY_MIN[line] || 8;
  const h = [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);
  return (h + dir * Math.floor(hw / 2) + line.length) % hw;
}
// ms 이후 첫 도착(정차 순간) 시각 ms. 운행 시간이 아니면 null
export function simNextArrival(line, dir, seed, ms = Date.now()) {
  const hw = (SIM_HEADWAY_MIN[line] || 8) * 60, off = simOffsetMin(line, dir, seed) * 60;
  const kst = ms / 1000 + 9 * 3600, day = Math.floor(kst / 86400) * 86400, sod = kst - day;
  const wait = (((off - (sod % hw)) % hw) + hw) % hw;
  const at = sod + wait, m = at / 60;
  if (m < SERVICE_MIN.start || m >= SERVICE_MIN.end) return null;
  return { at: ms + wait * 1000, run: Math.floor((day + at) / hw) };
}
// 실시간 열차 (서버 정규화 trains) → 이 방면 다음 도착. elapsedSec = fetchedAt 이후 흐른 초
export function liveNextArrival(trains, line, dir, ms, fetchedAt) {
  const updn = TRAIN[line]?.updn?.[dir];
  if (!Array.isArray(trains) || !updn) return null;
  const el = Math.max(0, (ms - (fetchedAt || ms)) / 1000);
  let best = null;
  for (const t of trains) {
    if (t.line !== line || t.updn !== updn) continue;
    let eta = null;
    if (t.code === 0 || t.code === 1) eta = 0;           // 진입·도착
    else if (t.etaSec > 0) eta = Math.max(0, t.etaSec - el);
    else continue;
    if (!best || eta < best.eta) best = { eta, trainNo: t.trainNo || '', dest: t.dest || '' };
  }
  if (!best || best.eta > 20 * 60) return null;
  return { at: ms + best.eta * 1000, run: Number(String(best.trainNo).replace(/\D/g, '')) || 0, trainNo: best.trainNo, dest: best.dest, live: true };
}

// ---------- 역 사이 주행 ----------
export const RIDE = Object.freeze({ VMAX: 22, ACC: 1.0, DEC: 1.0, GAP_DEFAULT: 1200, DWELL: 22 });
export function segmentDist(a, b) {
  const A = BY_NAME.get(a), B = BY_NAME.get(b);
  if (A && B) return Math.max(500, Math.hypot(A.x - B.x, A.z - B.z));
  return RIDE.GAP_DEFAULT; // 게임 밖 역: 대략 1.2km (근사)
}
// 거리 d 를 가속-순항-감속으로 달리는 시간과 t 초의 위치(0..d)
export function segmentProfile(d, R = RIDE) {
  let v = R.VMAX, ta = v / R.ACC, td = v / R.DEC, da = 0.5 * R.ACC * ta * ta, dd = 0.5 * R.DEC * td * td;
  if (da + dd > d) { v = Math.sqrt((2 * d * R.ACC * R.DEC) / (R.ACC + R.DEC)); ta = v / R.ACC; td = v / R.DEC; da = 0.5 * R.ACC * ta * ta; dd = 0.5 * R.DEC * td * td; }
  const tc = (d - da - dd) / v, T = ta + tc + td;
  const at = (t) => {
    if (t <= 0) return { s: 0, v: 0 };
    if (t < ta) return { s: 0.5 * R.ACC * t * t, v: R.ACC * t };
    if (t < ta + tc) return { s: da + v * (t - ta), v };
    if (t < T) { const u = T - t; return { s: d - 0.5 * R.DEC * u * u, v: R.DEC * u }; }
    return { s: d, v: 0 };
  };
  return { d, T, vmax: v, at };
}

// ---------- 구역 ([zone] src/net/zones.js) ----------
export const platformZone = (stationId, line, dir) => `${stationId}-station/p-${line}-${dir}`;
export const TRAIN_RUNS = 4; // 같은 노선·방면 열차를 4편성 슬롯으로 (run % 4)
export const trainZone = (line, dir, run) => `train:${line}-${dir}-${((run % TRAIN_RUNS) + TRAIN_RUNS) % TRAIN_RUNS}`;
