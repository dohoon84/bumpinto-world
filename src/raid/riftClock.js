// 균열 시작 시각은 서버가 나눠 주는 절대 시각이다.
// 데모는 URL 의 riftAt(유닉스 ms) 이나, 없으면 모든 클라이언트가 같이 보는 분 경계로 흉내 낸다.
// 나중에 소켓 이벤트가 applyServerEvent({ startAt, region }) 만 호출하면 된다.

const SEEN_KEY = 'bw-tancheon-rift-seen';
const JOIN_MS = 90_000;

function parseStart(params, now) {
  const at = Number(params.get('riftAt'));
  if (Number.isFinite(at) && at > 0) return at;
  const slot = 60_000;
  const next = Math.ceil(now / slot) * slot;
  return next - now < 8000 ? next + slot : next;
}

export function createRiftClock(params, now = Date.now) {
  let startAt = parseStart(params, now());
  let region = params.get('region') === 'away' ? 'away' : 'tancheon';
  const listeners = new Set();

  function snapshot(t = now()) {
    const remainingMs = startAt + JOIN_MS - t;
    return {
      startAt,
      region,
      inRegion: region === 'tancheon',
      active: t >= startAt,
      remaining: Math.max(0, remainingMs / 1000),
      openedFor: Math.max(0, (t - startAt) / 1000),
    };
  }

  function emit() {
    const snap = snapshot();
    listeners.forEach((fn) => fn(snap));
    return snap;
  }

  return {
    snapshot,
    inRegion: () => region === 'tancheon',
    applyServerEvent(ev = {}) {
      if (ev.startAt != null && Number.isFinite(Number(ev.startAt))) startAt = Number(ev.startAt);
      if (ev.region) region = ev.region === 'away' ? 'away' : 'tancheon';
      return emit();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function consumeIntroReset(params) {
  if (params.get('resetIntro') === '1') {
    try { localStorage.removeItem(SEEN_KEY); } catch { /* private mode */ }
  }
}

export function introSeen() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

export function markIntroSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
}
