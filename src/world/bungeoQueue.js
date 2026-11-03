// [bungeo] 붕어빵 포장마차 줄 서기 로직 (three.js 없음 — node 테스트: scripts/test-bungeo-queue.mjs)
//   members[0] 이 맨 앞(계산대) 손님. 자리 번호 = 배열 순서라, 앞사람이 빠지면 나머지는 자동으로 한 칸씩 앞으로.
//   - 맨 앞 손님이 자리에 도착(arrive)하면 3~7초 기다렸다가 봉투를 받고(hand) 빠진다(served).
//   - 새 손님은 랜덤 간격으로 와서 줄 끝에 선다(join). 목표 길이는 손님이 빠질 때마다 6~10 사이에서 다시 뽑는다.
//   - 걸어오는 중인 손님도 자리를 차지하므로 줄(도착 + 오는 중)은 절대 max(10) 를 넘지 않는다.
//   - 시즌: 정자 실제 날짜(Asia/Seoul) 11~3월. ?bungeo=0 끔, ?bungeo=1 계절 무시하고 켬.

export const BUNGEO_MAX = 10;

/** 결정적 난수 (테스트·재현용). seed 정수 → () => [0,1) */
export function seededRng(seed = 1) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Asia/Seoul 기준 달(1~12) */
export function seoulMonth(date = new Date()) {
  try {
    const m = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' }).format(date);
    const n = Number(m);
    if (n >= 1 && n <= 12) return n;
  } catch { /* Intl 없음 */ }
  return new Date(date.getTime() + 9 * 3600e3).getUTCMonth() + 1;
}

/** 붕어빵 철: 11월 ~ 3월 */
export function inBungeoSeason(date = new Date()) {
  const m = seoulMonth(date);
  return m >= 11 || m <= 3;
}

/** ?bungeo= 값 → 'off' | 'on' | 'auto' */
export function bungeoMode(value) {
  const v = value == null ? '' : String(value).trim().toLowerCase();
  if (v === '0' || v === 'off' || v === 'false' || v === 'no') return 'off';
  if (v === '1' || v === 'on' || v === 'true' || v === 'yes' || v === 'force') return 'on';
  return 'auto';
}

/** 지금 노점을 보일지: 모드 + 계절 */
export function bungeoActive(value, date = new Date()) {
  const mode = bungeoMode(value);
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  return inBungeoSeason(date);
}

const between = (rng, [a, b]) => a + (b - a) * rng();
const intBetween = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

export function createBungeoQueue({
  rng = Math.random,
  max = BUNGEO_MAX,
  minLen = 6,
  serve = [3, 7],       // 맨 앞 손님 대기(초)
  gap = [1.2, 5.5],     // 새 손님 도착 간격(초)
  handAt = 0.7,         // 끝나기 몇 초 전에 봉투를 건네기 시작하는지
} = {}) {
  max = Math.max(1, Math.min(BUNGEO_MAX, max | 0));
  minLen = Math.max(1, Math.min(max, minLen | 0));
  let nextId = 1;
  const members = [];  // { id, arrived }
  let targetLen = intBetween(rng, minLen, max);
  let nextJoin = between(rng, gap);
  let serveLeft = -1;  // 맨 앞 손님 남은 시간(-1 = 아직 시작 안 함)
  let serveTotal = 0;
  let handed = false;
  const stats = { joined: 0, served: 0, maxSeen: 0 };

  function join(arrived = false) {
    if (members.length >= max) return null;
    const m = { id: nextId++, arrived };
    members.push(m);
    stats.joined++;
    stats.maxSeen = Math.max(stats.maxSeen, members.length);
    return m;
  }

  return {
    members,
    stats,
    get length() { return members.length; },
    get targetLen() { return targetLen; },
    get front() { return members[0] || null; },
    /** 맨 앞 손님 진행도 0..1 (아직 안 기다리면 0) */
    get serveProgress() { return serveLeft < 0 || !serveTotal ? 0 : 1 - serveLeft / serveTotal; },
    get handing() { return handed; },
    slotOf(id) { return members.findIndex((m) => m.id === id); },
    /** 시작할 때 줄을 미리 채운다(도착한 상태로) */
    prefill(n = targetLen) {
      const out = [];
      for (let i = 0; i < n && members.length < max; i++) out.push(join(true));
      return out;
    },
    /** 그 손님이 자기 자리에 도착했다고 알려 준다(렌더 쪽에서 호출) */
    arrive(id) {
      const m = members.find((x) => x.id === id);
      if (m) m.arrived = true;
    },
    /** dt 초 진행. 일어난 일 목록 [{ type: 'join'|'hand'|'served', id }] */
    update(dt) {
      const events = [];
      const f = members[0];
      if (f && f.arrived) {
        if (serveLeft < 0) { serveTotal = between(rng, serve); serveLeft = serveTotal; handed = false; }
        serveLeft -= dt;
        if (!handed && serveLeft <= handAt) { handed = true; events.push({ type: 'hand', id: f.id }); }
        if (serveLeft <= 0) {
          members.shift();
          stats.served++;
          events.push({ type: 'served', id: f.id, waited: serveTotal });
          serveLeft = -1; serveTotal = 0; handed = false;
          targetLen = intBetween(rng, minLen, max);
        }
      }
      nextJoin -= dt;
      if (nextJoin <= 0) {
        nextJoin = between(rng, gap);
        if (members.length < targetLen) {
          const m = join(false);
          if (m) events.push({ type: 'join', id: m.id });
        }
      }
      return events;
    },
  };
}
