// [subway] 대합실 도착 안내판 데이터 — 실시간(서울 열린데이터, phone worker /subway/arrival 경유) 또는 시간표 근사
//   순수 함수(boardRows·simulatedRows) + 얇은 fetch (createArrivalFeed). 인증키는 여기 없다 (worker secret).
//   ?subwayRt=0 이면 실시간 요청 안 함 (근사만).  대합실 안에 있을 때만 30초마다 요청 (worker 가 25초 캐시).
import { LINES } from './lines.js';
import { SIM_HEADWAY_MIN, SERVICE_MIN, simNextArrival } from './ride.js';

export const POLL_SEC = 30;
// 시간표 근사: 실제 시간표가 아니다. 노선별 평일 낮 대략 배차(분)·운행 시간으로 '몇 분 후'를 흉내만 낸다.
//   안내판에 '시간표 근사' 라고 함께 표시한다.
//   (식은 ride.js — 승강장 열차도 같은 식으로 들어온다)
export { SIM_HEADWAY_MIN };
const SERVICE = SERVICE_MIN;

// 실시간 열차 → 안내판 줄 (노선 순서 = theme.lines, 같은 방면 첫 열차만, 최대 n줄)
//   now: 지금 (ms). fetchedAt 이후 흐른 시간만큼 etaSec 을 줄여 보여 준다
export function boardRows(theme, data, now = Date.now(), n = 4) {
  if (!data?.ok || !Array.isArray(data.trains)) return null;
  const keys = theme.lines.map((l) => l.key);
  const el = Math.max(0, (now - (data.fetchedAt || now)) / 1000);
  const seen = new Set(), rows = [];
  const sorted = data.trains.filter((t) => keys.includes(t.line))
    .sort((a, b) => keys.indexOf(a.line) - keys.indexOf(b.line) || rank(a) - rank(b));
  for (const t of sorted) {
    const k = t.line + '|' + t.updn;
    if (seen.has(k)) continue; seen.add(k);
    const eta = t.etaSec > 0 ? Math.max(0, t.etaSec - el) : null;
    rows.push({ line: t.line, color: LINES[t.line].color, short: LINES[t.line].short, dest: t.dest ? `${t.dest}행` : t.way, msg: eta == null ? (t.msg || '') : eta >= 60 ? `${Math.round(eta / 60)}분 후` : '곧 도착', en: eta == null ? '' : eta >= 60 ? `${Math.round(eta / 60)} min` : 'Soon', kind: t.kind && t.kind !== '일반' ? t.kind : '', last: !!t.last });
    if (rows.length >= n) break;
  }
  return rows.length ? rows : null;
}
// 같은 방면이면 가까운 열차 먼저: 도착(1)·진입(0) → 전역(3·4·5) → 초(eta) → 운행중
function rank(t) {
  const c = t.code;
  const base = c === 1 || c === 0 ? 0 : c === 2 ? 2 : c === 5 || c === 4 || c === 3 ? 1 : 3;
  return base * 1e5 + (t.etaSec > 0 ? t.etaSec : 9e4);
}

// 시간표 근사 (실시간이 없을 때). when: 시각 ms (서버 시계) 또는 0..1439 (KST 분, 예전 호출 — 기준일 하루로 바꿔 계산), seed: 역 id
//   [subway-sync] 승강장 열차와 같은 노선 시간표(simNextArrival) → 안내판 '몇 분 후' = 실제로 들어오는 열차
const REF_DAY = Date.UTC(2026, 10, 3) - 9 * 3600e3; // KST 자정
export function simulatedRows(theme, when, seed = '', n = 4) {
  const ms = when >= 1440 ? when : REF_DAY + when * 60000;
  const rows = [];
  for (const l of theme.lines.slice(0, 2)) {
    for (let d = 0; d < 2 && rows.length < n; d++) {
      const dir = l.dirs[d];
      const a = simNextArrival(l.key, d, seed, ms);
      let msg, en;
      if (!a) { msg = '운행 종료'; en = 'No service'; }
      else { const wait = Math.round((a.at - ms) / 60000); msg = wait ? `약 ${wait}분 후` : '곧 도착'; en = wait ? `~${wait} min` : 'Arriving'; }
      rows.push({ line: l.key, color: l.color, short: l.short, dest: dir.ko, msg, en, kind: '', last: false });
    }
  }
  return rows;
}
// KST 분 (브라우저 시간대와 무관)
export const kstMinute = (ms = Date.now()) => Math.floor(((ms / 60000) + 9 * 60) % 1440);

// 대합실 안에서만 쓰는 피드. get() → { rows, live, note } , version 이 바뀌면 다시 그린다
export function createArrivalFeed({ theme, base, enabled = true, fetchImpl = (u) => fetch(u), now = () => Date.now() }) {
  let data = null, version = 0, timer = 0, stopped = false, inflight = false, lastKey = '';
  const station = theme.name;
  async function poll() {
    if (!enabled || !base || inflight || stopped) return;
    inflight = true;
    try {
      const r = await fetchImpl(`${base.replace(/\/$/, '')}/subway/arrival?station=${encodeURIComponent(station)}`);
      data = r.ok ? await r.json() : null;
    } catch { data = null; }
    inflight = false; version++;
  }
  function get() {
    const t = now();
    const live = boardRows(theme, data, t);
    const rows = live || simulatedRows(theme, t, theme.id);
    const key = JSON.stringify(rows) + !!live;
    if (key !== lastKey) { lastKey = key; version++; }
    return { rows, live: !!live, note: live ? '실시간 · 서울 열린데이터광장' : '시간표 근사 (실시간 아님)', noteEn: live ? 'Live · Seoul Open Data' : 'Approx. timetable (not live)' };
  }
  return {
    get, get version() { return version; },
    raw: () => (data?.ok && Array.isArray(data.trains) ? { trains: data.trains, fetchedAt: data.fetchedAt } : null), // 승강장 열차 시각용
    tick(dt) { if (stopped) return; timer -= dt; if (timer <= 0) { timer = POLL_SEC; poll(); } },
    stop() { stopped = true; },
    _poll: poll,
  };
}
