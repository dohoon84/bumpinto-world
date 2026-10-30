// [corridor] 잠실 랜드마크(롯데월드타워) 그랜드 오픈 이벤트 — 설정 + 신뢰 시계 + 상태. 지구본(노선도·이동 패널)과 월드(카운트다운·불꽃·등장)가 함께 쓴다.
//   오픈 시각은 아래 LOTTE_OPEN_AT 하나만 바꾸면 된다.
//   시계: 같은 사이트에 HEAD 요청(no-store)을 보내 응답 Date 헤더로 서버 시각을 읽고, 그 뒤로는 performance.now()(단조 시계)로 흘려 쓴다.
//         → PC 시계를 앞당겨도 오픈이 먼저 보이지 않는다(최선의 클라이언트 처리; 서버 변경 없음). Date 헤더를 못 읽으면 PC 시계로 대체.
//   테스트용 URL(운영에서도 내 화면에만 적용, 무해):
//     ?lotteopen=now      → 10초 뒤 오픈(카운트다운 → 불꽃 → 타워 등장)
//     ?lotteopen=done     → 이미 오픈(타워 그대로, 불꽃 없음)
//     ?lotteopen=pending  → 아직 오픈 전(실제 오픈이 지났어도 카운트다운)
//     ?lotteopen=<ISO 시각> → 그 시각에 오픈 (예: 2026-11-02T01:30:00Z)
export const LOTTE_OPEN_AT = Date.parse('2026-11-02T10:30:00+09:00'); // 2026-11-02 10:30 KST = 01:30Z
export const LOTTE_PROGRESS_START = Date.parse('2026-10-31T00:00:00+09:00'); // 공정률 0% 기준(이 기능을 만든 날 0시 KST) → 오픈 때 100%
export const LOTTE_FIREWORKS_MS = 60 * 1000; // 불꽃 한 번 길이
export const LOTTE_FIREWORKS_WINDOW_MS = 10 * 60 * 1000; // 오픈 후 이 시간 안에 들어온 사람도 불꽃을 본다

let syncEpoch = 0, syncPerf = 0, source = 'pending', ready = false;
const loadPerf = typeof performance !== 'undefined' ? performance.now() : 0;
const clientNow = () => Date.now();
export function lotteNow() { return ready && source === 'server' ? syncEpoch + (performance.now() - syncPerf) : clientNow(); }

let openAt = LOTTE_OPEN_AT, override = null;
function applyOverride() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lotteopen') : null;
  if (!q) return;
  const now = lotteNow();
  if (q === 'now') { openAt = now + 10000; override = 'now'; }
  else if (q === 'done') { openAt = now - 60 * 60 * 1000; override = 'done'; }
  else if (q === 'pending') { openAt = LOTTE_OPEN_AT > now ? LOTTE_OPEN_AT : now + (2 * 24 + 5) * 3600 * 1000 + 17 * 60 * 1000; override = 'pending'; }
  else if (!Number.isNaN(Date.parse(q))) { openAt = Date.parse(q); override = 'at'; }
}

async function sync() {
  try {
    const url = location.origin + '/?lotte-clock=' + Date.now();
    const t0 = performance.now();
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    const t1 = performance.now();
    const d = Date.parse(r.headers.get('date') || '');
    if (Number.isNaN(d)) throw new Error('no date');
    // Date 헤더는 초 단위(내림) → +500ms, 왕복 절반 보정
    syncEpoch = d + 500 + (t1 - t0) / 2; syncPerf = t1; source = 'server';
  } catch { source = 'client'; }
  ready = true;
  applyOverride();
}
// 처음 쓰일 때 한 번만 동기화(?corridor=0 처럼 안 쓰면 요청도 없음)
let readyP = null;
function ensure() {
  if (!readyP) readyP = typeof window === 'undefined' ? Promise.resolve() : Promise.race([sync(), new Promise((ok) => setTimeout(() => { if (!ready) { ready = true; source = 'client'; applyOverride(); } ok(); }, 4000))]);
  return readyP;
}

export const lotteClock = {
  get ready() { return ensure(); },
  get isReady() { return ready; },
  get source() { return source; }, // 'server' (Date 헤더) | 'client' (PC 시계 대체) | 'pending'
  get override() { return override; },
  get openAt() { return openAt; },
  get offsetMs() { return source === 'server' ? Math.round(lotteNow() - clientNow()) : 0; },
  now: lotteNow,
  // 시계가 준비되기 전에는 '오픈 전'으로 본다(PC 시계로 먼저 공개되지 않게)
  isOpen() { ensure(); return ready && lotteNow() >= openAt; },
  msLeft() { ensure(); return Math.max(0, openAt - lotteNow()); },
  progress() { // 0..1, 오픈 시 1
    if (this.isOpen()) return 1;
    const s = Math.min(LOTTE_PROGRESS_START, openAt - 60 * 1000);
    return Math.max(0, Math.min(0.99, (lotteNow() - s) / (openAt - s)));
  },
  sinceLoadMs: () => performance.now() - loadPerf,
};

// 남은 시간 → { d, h, m, s }
export function splitLeft(ms) {
  const t = Math.ceil(ms / 1000);
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
// 지구본·이동 패널용 문구 (오픈 전: 건설중 공정률, 오픈 후: null → 원래 이름)
export function lotteSiteLabel(en) {
  if (lotteClock.isOpen()) return null;
  const pct = Math.floor(lotteClock.progress() * 100);
  return en ? { main: `Jamsil Landmark · under construction ${pct}%`, sub: `잠실 랜드마크 건설중… 공정률 ${pct}%`, pct }
    : { main: `잠실 랜드마크 건설중… 공정률 ${pct}%`, sub: `Jamsil Landmark · under construction ${pct}%`, pct };
}
