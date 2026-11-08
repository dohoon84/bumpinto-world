// [gyeongbu-bus] 경부 본선 광역버스 속도. 게임 단위는 m/s, km/h = m/s * 3.6.
//   택시·트럭 HUD(src/entities/taxis.js SPEED, trucks.js * 3.6)와 같은 환산.
//   도시 primary 13.9 m/s = 50 km/h. 기존 motorway 22 m/s = 79 km/h.
//   본선 순항 120 km/h = 33.333 m/s. 램프는 본선 경계에서 ramp 미터에 걸쳐 smoothstep.
//   탑승 속도(rideSpeedMs)와 정류장 ETA(travelSeconds)는 이 함수 하나만 쓴다.

export const MS_TO_KMH = 3.6;
export const SURFACE_MS = 13.9;
export const MAINLINE_KMH = 120;
export const MAINLINE_MS = MAINLINE_KMH / MS_TO_KMH;
export const RAMP_M = 450;
/** 파일의 peak/offpeak 가 시각 창을 주지 않아, 출퇴근 07:00–09:00 · 17:00–19:00 을 첨두로 둔다. */
export const PEAK_WINDOWS = [[7 * 60, 9 * 60], [17 * 60, 19 * 60]];

const ease = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

export function speedMs(s, profile) {
  const main0 = profile.main0, main1 = profile.main1;
  const ramp = profile.ramp || RAMP_M;
  const surface = profile.surfaceMs || SURFACE_MS;
  const cruise = profile.mainlineMs || MAINLINE_MS;
  if (!(main1 > main0)) return surface;
  if (s < main0 - ramp) return surface;
  if (s < main0 + ramp) return surface + (cruise - surface) * ease((s - (main0 - ramp)) / (2 * ramp));
  if (s < main1 - ramp) return cruise;
  if (s < main1 + ramp) return cruise + (surface - cruise) * ease((s - (main1 - ramp)) / (2 * ramp));
  return surface;
}

/** 승객이 타도 같은 속력. */
export function rideSpeedMs(profile, s) { return speedMs(s, profile); }

export function travelSeconds(profile, s0, s1, step = 20) {
  if (s1 < s0) { const t = s0; s0 = s1; s1 = t; }
  let sec = 0;
  for (let s = s0; s < s1 - 1e-6;) {
    const ds = Math.min(step, s1 - s);
    const v = Math.max(0.4, speedMs(s + ds * 0.5, profile));
    sec += ds / v;
    s += ds;
  }
  return sec;
}

export function chainageAfter(profile, s0, seconds, step = 20) {
  let s = s0, left = Math.max(0, seconds);
  const end = profile.lengthM || 0;
  while (left > 0.02 && s < end - 0.05) {
    const v = Math.max(0.4, speedMs(s, profile));
    const ds = Math.min(step, v * left, end - s);
    left -= ds / v;
    s += ds;
  }
  return s;
}

export function clockToMin(hhmm, { end = false } = {}) {
  const [h, m] = String(hhmm || '0:0').split(':').map((n) => parseInt(n, 10) || 0);
  const t = h * 60 + m;
  return end && t === 0 ? 1440 : t;
}

export function isPeak(min) {
  const h = ((min % 1440) + 1440) % 1440;
  return PEAK_WINDOWS.some(([a, b]) => h >= a && h < b);
}

export function headwayMin(block, min) {
  const n = isPeak(min) ? block.peakMin : block.offpeakMin;
  return Math.max(1, n || 10);
}

export function departures(block, { fromGangnam = false } = {}) {
  const first = clockToMin(fromGangnam ? block.firstFromGangnam : block.first);
  let last = clockToMin(fromGangnam ? block.lastFromGangnam : block.last, { end: true });
  if (last < first) last += 1440;
  const out = [];
  let t = first;
  for (let i = 0; i < 2500 && t <= last + 1e-6; i++) {
    out.push(t);
    t += headwayMin(block, t >= 1440 ? t - 1440 : t);
  }
  return out;
}

function hhmm(t) {
  const c = t >= 1440 ? t - 1440 : t;
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
}

/** 지금 시각 이후 첫 출발. 강남 정류장은 강남 출발 시각. */
export function nextExpress(block, nowMin, { fromGangnam = false } = {}) {
  const now = ((nowMin % 1440) + 1440) % 1440;
  let best = null;
  for (const t of departures(block, { fromGangnam })) {
    const wait = t >= now ? t - now : t + 1440 - now;
    if (!best || wait < best.waitMin) best = { waitMin: wait, label: t >= 1440 ? '24:00' : hhmm(t), minutes: t };
  }
  return best;
}

/** 아직 경로 위에 있는 출발(경과 초). */
export function enRoute(block, nowMin, travelSec, { fromGangnam = false } = {}) {
  const now = ((nowMin % 1440) + 1440) % 1440;
  const out = [];
  for (const t of departures(block, { fromGangnam })) {
    let elapsedMin = now - t;
    if (elapsedMin < -1) elapsedMin += 1440;
    if (elapsedMin < 0) continue;
    const elapsed = elapsedMin * 60;
    if (elapsed < travelSec) out.push({ departed: t, elapsed });
  }
  return out;
}

/** 한국은 우측통행. 일방 차로에서 0 이 오른쪽(바깥), 마지막이 중앙 쪽 1차로(버스전용). */
export function busLaneIndex(lanes) { return Math.max(0, (lanes || 1) - 1); }

export function carLaneIndex(lanes, requested) {
  const n = Math.max(1, lanes || 1);
  const bus = busLaneIndex(n);
  const li = Math.max(0, Math.min(n - 1, requested | 0));
  if (n <= 1) return 0;
  return li >= bus ? bus - 1 : li;
}

/** 본선에서만 1차로(중앙 쪽)로 붙고, 램프에서 차로 중심으로 돌아온다. 미터, 진행 방향 왼쪽. */
export function busLateralM(s, profile) {
  const full = profile.busOff || 0;
  const ramp = profile.ramp || RAMP_M;
  const up = ease((s - (profile.main0 - ramp)) / (2 * ramp));
  const down = ease((s - (profile.main1 - ramp)) / (2 * ramp));
  if (s < profile.main0 - ramp || s > profile.main1 + ramp) return 0;
  return full * up * (1 - down);
}
