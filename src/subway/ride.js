// [subway] 승강장·열차 순수 로직 (three·DOM 없음 → scripts/test-subway.mjs)
//   노선 정차 순서(LINE_STOPS, OSM relation) · 편성 량수(lines.js TRAIN) → 승강장 길이·스크린도어 번호·앞뒤 역·방면 글자
//   열차 움직임(진입 감속 → 정차·문 열림 → 출발 가속) · 다음 열차 시각(실시간 도착 또는 시간표 근사) · 역 사이 주행 시간
//   좌표(승강장 Scene): x = 선로 방향, 열차 진행 방향 = +x (1호차 = +x 끝), 승강장 쪽 z < 0, 스크린도어 z = 0, 선로 z > 0
import { LINES, TRAIN, CAR_LEN, DOOR_OFF } from './lines.js';
import { LINE_STOPS } from './stationsData.js';
import { STATIONS, STATIONS_BASE, EXT_STATIONS, gangnamSubEnabled } from './roster.js'; // [migeum-sub] 플래그 반영 역 목록 · 확장 전 역 목록
import { jaName, jaDir } from './ja.js';
import { GAP_STOPS } from './stopCoords.js'; // [gangnam] 정자↔강남·잠실↔강남 사이 게임 밖 역의 OSM 좌표

export const BY_NAME = new Map(STATIONS.map((s) => [s.name, s]));
export const isGameStop = (line, name) => !!BY_NAME.get(name)?.lines.includes(line); // 게임에 대합실이 있고 이 노선이 서는 역
export const stopsOf = (line) => LINE_STOPS[line]?.stops || [];
// [gangnam] 개통 구간에서 내리지 않고 지나가는 역. ?gangnam=0 / ?gangnamsub=0 이면 표시하지 않는다.
const PASS_BY_LINE = { shin: ['판교', '청계산입구', '양재시민의숲', '양재'], l2: ['잠실새내', '종합운동장', '삼성', '선릉', '역삼'] };
export function isPassStop(line, name) {
  return gangnamSubEnabled() && (PASS_BY_LINE[line] || []).includes(name) && !isGameStop(line, name);
}
export const alightAllowed = (stop) => !!stop?.game;

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
  return last < 0 ? [] : ups.slice(0, last + 1).map((n) => {
    const game = isGameStop(line, n);
    const o = { name: n, game, id: BY_NAME.get(n)?.id || null };
    if (!game && isPassStop(line, n)) o.pass = true; // 통과만. game 역 객체 모양은 예전과 같다
    return o;
  });
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
    dirKo: L.dirs[dir].ko, dirEn: L.dirs[dir].en, dirJa: L.dirs[dir].ja || jaDir(L.dirs[dir].ko), prev: nb.prev, next: nb.next, prevEn: nb.prev && en(nb.prev), nextEn: nb.next && en(nb.next),
  };
}
// 안내 방송 (자막). 한국 지하철 안내 방송 형식을 따른 일반 문구 (특정 운영사 녹음 원문 아님)
// [subway-voice] 녹음 파일 이름용 슬러그 (영문 역명/방면 → 'wangsimni', 'jamsil-sports-complex')
export const clipSlug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// 안내 방송 문구 {ko,en,ja} + kind·clip(녹음 교체용 이름: public/audio/subway/<clip>.<ko|en|ja>.<ogg|m4a>)
export function announce(kind, o = {}) {
  const a = announceText(kind, o);
  if (!a.ko) return a;
  const key = clipSlug(['approach', 'arrived', 'noRide'].includes(kind) ? (o.dirEn || '').replace(/^for /, '') : kind === 'closing' ? '' : (o.nameEn || o.name));
  return { ...a, kind, clip: key ? `${kind}-${key}` : kind };
}
function announceText(kind, o = {}) {
  const dKo = (o.dirKo || '').replace(/ 방면$/, ''), dEn = (o.dirEn || '').replace(/^for /, '');
  // [subway-ja] 일본어: 서울 지하철 일본어 안내 방송 말투. 역·방면 = 한국어 발음 가타카나 (ja.js)
  const nJa = o.nameJa || jaName(o.name), dJa = o.dirJa || jaDir(o.dirKo);
  const dirJa = /方面$/.test(dJa) ? `${dJa}行き` : dJa; // 'ワンシムニ方面行き' · 순환선은 '内回り'
  const doorKo = o.door === 'left' ? ' 내리실 문은 왼쪽입니다.' : '', doorEn = o.door === 'left' ? ' The doors will open on the left.' : '', doorJa = o.door === 'left' ? 'お出口は左側です。' : '';
  switch (kind) {
    case 'approach': return { ko: `지금 ${dKo} 방면으로 가는 열차가 들어오고 있습니다. 안전선 밖으로 한 걸음 물러서 주시기 바랍니다.`, en: `The train bound for ${dEn} is now approaching. Please step back from the platform screen doors.`, ja: `まもなく、${dirJa}の電車が到着します。安全のため、ホームドアから一歩お下がりください。` };
    case 'arrived': return { ko: `${dKo} 방면 열차입니다. 내리는 분이 먼저 내린 다음 타시기 바랍니다.`, en: `This train is bound for ${dEn}. Please let passengers off first.`, ja: `${dirJa}の電車です。お降りのお客様を先にお通しください。` };
    case 'closing': return { ko: '출입문 닫습니다.', en: 'The doors are closing.', ja: 'ドアが閉まります。ご注意ください。' };
    case 'next': return { ko: `이번 역은 ${o.name}, ${o.name}역입니다.${o.pass ? ' 통과 — 준비 중인 역.' : ''}${o.opening ? ' 강남 개통.' : ''}${o.transfer ? ` ${o.transfer}으로 갈아타실 수 있습니다.` : ''}${doorKo}`, en: `This stop is ${o.nameEn || o.name}.${o.pass ? ' Pass through.' : ''}${o.opening ? ' Gangnam is open.' : ''}${o.transferEn ? ` You can transfer to the ${o.transferEn}.` : ''}${doorEn}`, ja: `まもなく、${nJa}、${nJa}です。${o.pass ? '通過です。準備中のためお降りいただけません。' : ''}${o.opening ? 'カンナム開通。' : ''}${o.transferJa ? `${o.transferJa}にお乗り換えいただけます。` : ''}${doorJa}` };
    case 'depart': return { ko: `다음 역은 ${o.name}역입니다.${o.pass ? ' 통과 — 준비 중인 역.' : ''}${o.opening ? ' 강남 개통.' : ''}`, en: `The next stop is ${o.nameEn || o.name}.${o.pass ? ' Pass through.' : ''}${o.opening ? ' Gangnam is open.' : ''}`, ja: `次は、${nJa}、${nJa}です。${o.pass ? '通過です。準備中。' : ''}${o.opening ? 'カンナム開通。' : ''}` };
    case 'noAlight': return o.pass
      ? { ko: `${o.name}역은 통과 — 준비 중인 역입니다.`, en: `${o.nameEn || o.name} — pass through.`, ja: `${nJa}駅は通過です。準備中のため、お降りいただけません。` }
      : { ko: `${o.name}역은 아직 게임 지상이 없어 내릴 수 없어요. 다음 역까지 타고 가요.`, en: `${o.nameEn || o.name} isn't in the game yet — stay on to the next stop.`, ja: `${nJa}駅はゲームでは準備中のため、お降りいただけません。次の駅までそのままご乗車ください。` };
    case 'last': return { ko: `이 방면 마지막 게임 역입니다. ${o.name}역에서 내려 주세요.${o.opening ? ' 강남 개통.' : ''}`, en: `Last in-game stop this way — please get off at ${o.nameEn || o.name}.${o.opening ? ' Gangnam is open.' : ''}`, ja: `この方面のゲーム内の最後の駅です。${nJa}駅でお降りください。${o.opening ? 'カンナム開通。' : ''}` };
    case 'noRide': return { ko: `${dKo} 방면은 내릴 수 있는 게임 역이 아직 없어요 (다음 업데이트).`, en: `No in-game stop toward ${dEn} yet — coming soon.`, ja: `${dJa}は、お降りいただけるゲーム内の駅がまだありません（準備中）。` };
    default: return { ko: '', en: '', ja: '' };
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
//   [subway-sync] 노선 단위 시간표: k 번째 열차가 이 방면 첫 역에 k·H + phase 초(에포크, 서버 시계)에 서고,
//   역마다 '앞 역들 주행 + 정차' 만큼 늦게 선다 (stationOffsetSec). → 같은 열차(run = k)가 역을 따라 이어지고,
//   어느 클라이언트든 같은 serverNow 면 같은 run·같은 도착 시각. station = 역 id 또는 역 이름
export function simNextArrival(line, dir, station, ms = Date.now()) {
  const H = (SIM_HEADWAY_MIN[line] || 8) * 60, base = simOffsetMin(line, dir, '') * 60 + stationOffsetSec(line, dir, station);
  const k = Math.ceil((ms / 1000 - base) / H), atS = k * H + base;
  const m = ((((atS + 9 * 3600) / 60) % 1440) + 1440) % 1440;
  if (m < SERVICE_MIN.start || m >= SERVICE_MIN.end) return null;
  return { at: atS * 1000, run: k };
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

// [subway-sync] 실시간 열차 → 응답 시각(fetchedAt, 서버 시계) 기준 절대 도착 시각들. 조회 시각과 무관 → 같은 응답이면 모두 같은 값
export function liveSlots(trains, line, dir, fetchedAt) {
  const updn = TRAIN[line]?.updn?.[dir], out = [];
  if (!Array.isArray(trains) || !updn || !Number.isFinite(fetchedAt)) return out;
  for (const t of trains) {
    if (t.line !== line || t.updn !== updn) continue;
    const eta = t.code === 0 || t.code === 1 ? 0 : t.etaSec > 0 ? t.etaSec : null;
    if (eta != null) out.push({ at: fetchedAt + eta * 1000, trainNo: t.trainNo || '', dest: t.dest || '', live: true });
  }
  return out.sort((a, b) => a.at - b.at);
}

// ---------- 역 사이 주행 ----------
export const RIDE = Object.freeze({ VMAX: 22, ACC: 1.0, DEC: 1.0, GAP_DEFAULT: 1200, DWELL: 22 });
export function segmentDist(a, b, byName = BY_NAME) {
  const A = byName.get(a), B = byName.get(b);
  if (A && B) return Math.max(500, Math.hypot(A.x - B.x, A.z - B.z));
  // [gangnam] 확장 역 주행(rideTimeline·EXT 오프셋)만 OSM 정차 좌표를 쓴다.
  //   기존 역 오프셋은 BASE_BY_NAME 으로 재므로 여기 표를 안 보고, 표에 없는 게임 밖 구간은 1.2km 그대로.
  if (byName === BY_NAME && (GAP_STOPS[a] || GAP_STOPS[b])) {
    const ca = A || GAP_STOPS[a], cb = B || GAP_STOPS[b];
    if (ca && cb) return Math.max(500, Math.hypot(ca.x - cb.x, ca.z - cb.z));
  }
  return RIDE.GAP_DEFAULT; // 게임 밖 역: 대략 1.2km (근사)
}
// [migeum-sub] 확장 전 역 목록 기준 거리 (기존 역 시간표 = lineOffsets 는 늘 이것으로 → 확장 역을 켜도 기존 역 오프셋은 그대로)
const BASE_BY_NAME = new Map(STATIONS_BASE.map((s) => [s.name, s]));
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
// [subway-sync] 프레즌스 구역 = 슬롯(append-only zones.js, run%4) + '/r' + run%1000 (zones.js 가 z 띠에 실어 보냄 → 새 구역 없음)
//   같은 슬롯이라도 다른 편성(run)이면 서로 안 보임
export const trainRunZone = (line, dir, run) => `${trainZone(line, dir, run)}/r${((Math.trunc(run) % 1000) + 1000) % 1000}`;

// ---------- [subway-sync] 같은 열차 = 같은 시각 (모든 시각은 서버 시계 serverNow 기준 ms) ----------
//   역 사이 오프셋: 이 방면 첫 역 = 0, 다음 역 = 앞 역 + 정차(MOTION.DWELL) + 주행(segmentProfile.T). 열차 안 타임라인(rideTimeline)과 같은 식
const OFFS = new Map();
export function lineOffsets(line, dir) {
  const key = `${line}-${dir}`;
  if (OFFS.has(key)) return OFFS.get(key);
  const L = LINE_STOPS[line], seq = TRAIN[line]?.seq?.[dir], m = new Map();
  if (L && seq) {
    const order = seq > 0 ? L.stops.slice() : L.stops.slice().reverse();
    let t = 0;
    order.forEach((n, i) => { if (i) t += MOTION.DWELL + segmentProfile(segmentDist(order[i - 1], n, BASE_BY_NAME)).T; if (!m.has(n)) m.set(n, t); });
    // [migeum-sub] 확장 역(미금): 기존 역 오프셋은 위 그대로 두고, 확장 역 하나만 가장 가까운 기존 게임 역(같은 노선) 기준으로
    //   실제 거리(segmentDist, 역 좌표 직선) 주행 + 정차로 다시 잡는다. 앞(먼저 서는) 쪽 기존 역이 있으면 그것 기준(+), 없으면 뒤쪽 역 기준(−).
    //   → 정자 ↔ 미금 열차 안 타임라인(rideTimeline)과 두 역 승강장 시각이 같은 열차(run)로 이어진다. lineOffsets 원점(첫 역 = 0) 그대로
    for (const E of EXT_STATIONS) {
      if (!E.lines.includes(line)) continue;
      const i = order.indexOf(E.name);
      if (i < 0) continue;
      const isBase = (n) => !!BASE_BY_NAME.get(n)?.lines.includes(line);
      let j = -1;
      for (let k = i - 1; k >= 0; k--) if (isBase(order[k])) { j = k; break; }
      if (j < 0) for (let k = i + 1; k < order.length; k++) if (isBase(order[k])) { j = k; break; }
      if (j < 0) continue;
      // 그 사이 게임 밖 역도 같은 실거리로 맞춰 둔다 (기존 게임 역 값은 건드리지 않음).
      //   열차 안 타임라인(rideTimeline)과 그 이름의 승강장 시각이 같은 열차가 되게.
      let t = m.get(order[j]);
      if (j < i) {
        for (let k = j + 1; k <= i; k++) {
          t += MOTION.DWELL + segmentProfile(segmentDist(order[k - 1], order[k])).T;
          if (!isBase(order[k])) m.set(order[k], t);
        }
      } else {
        for (let k = j - 1; k >= i; k--) {
          t -= MOTION.DWELL + segmentProfile(segmentDist(order[k], order[k + 1])).T;
          if (!isBase(order[k])) m.set(order[k], t);
        }
      }
    }
  }
  OFFS.set(key, m);
  return m;
}
const BY_ID = new Map(STATIONS.map((s) => [s.id, s]));
export const stationOffsetSec = (line, dir, station) => lineOffsets(line, dir).get(BY_ID.get(station)?.name ?? station) ?? 0;
// 실시간 도착(서버 응답 fetchedAt + ETA) → 노선 격자(LIVE_GRID_SEC)에 맞춘 열차. 같은 응답(서버 캐시 25초)을 받은 사람은 같은 run·시각
//   격자는 역 오프셋을 뺀 '첫 역 기준' 시각 위에 있어서, 실제 같은 열차면 다른 역에서 봐도 같은 run (오차 < 격자/2 일 때)
export const LIVE_GRID_SEC = 60;
export function snapLive(line, dir, station, a) {
  if (!a) return null;
  const off = stationOffsetSec(line, dir, station), k = Math.round((a.at / 1000 - off) / LIVE_GRID_SEC);
  return { ...a, at: (k * LIVE_GRID_SEC + off) * 1000, run: k, trainNo: a.run, live: true };
}
// 테스트용 '열차 부르기'(callTrain): 지금 + sec 뒤의 첫 공유 격자 칸 (CALL_GRID_SEC). 같은 칸에 부른 사람끼리 같은 열차
export const CALL_GRID_SEC = 5;
export function calledArrival(line, dir, station, ms, sec) {
  const off = stationOffsetSec(line, dir, station), k = Math.ceil((ms / 1000 + sec - off) / CALL_GRID_SEC);
  return { at: (k * CALL_GRID_SEC + off) * 1000, run: k, called: true };
}
// 열차 안 타임라인: 탄 역 정차 순간(at) 기준 초. 탄 역 정차 [0, DWELL) → 구간 i 주행 [dep, arr) → 역 i 정차 [arr, arr + DWELL) …
export function rideTimeline(origin, rides) {
  let t = MOTION.DWELL, s0 = 0;
  return rides.map((r, i) => {
    const prof = segmentProfile(segmentDist(i ? rides[i - 1].name : origin, r.name));
    const g = { ...r, prof, dep: t, arr: t + prof.T, s0 };
    t = g.arr + MOTION.DWELL; s0 += prof.d;
    return g;
  });
}
// e = 탄 역 정차 후 흐른 초 → { stage, i, t(그 단계 안 초), s(구간 안 거리), sTot, v, open(문 0..1), end(종착 문 닫힘 = 강제 하차) }
export function rideState(segs, e) {
  const M = MOTION;
  if (e < M.DWELL || !segs.length) return { stage: e < M.CLOSE_AT ? 'board' : 'close', i: 0, t: e, s: 0, sTot: 0, v: 0, open: trainMotion(Math.max(e, M.OPEN_AT + M.DOOR_SEC)).doors };
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    if (e < g.arr) { const q = g.prof.at(e - g.dep); return { stage: 'run', i, t: e - g.dep, s: q.s, sTot: g.s0 + q.s, v: q.v, open: 0 }; }
    const u = e - g.arr;
    if (u < M.DWELL || i === segs.length - 1) return { stage: 'stop', i, t: u, s: g.prof.d, sTot: g.s0 + g.prof.d, v: 0, open: trainMotion(Math.min(u, M.DWELL)).doors, end: i === segs.length - 1 && u >= M.CLOSE_AT };
  }
}
