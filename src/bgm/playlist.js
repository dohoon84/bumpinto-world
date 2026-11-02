// [bgm] 배경음악 재생 목록 · 타이밍 · 페이드 곡선 (순수 함수 — scripts/test-bgm.mjs 로 테스트)
//   - public/audio/bgm/<id>.{webm,mp3}: webm(Opus) 우선, 안 되면 mp3 (canPlayType)
//   - 입장하면 항상 opening_day 부터, 그다음 나머지를 파일 이름 순서대로 돌고 다시 opening_day 로 (무한 반복)
//   - skip: 곡 앞쪽의 거의 무음 구간(초) — 크로스페이드로 들어올 때 빈 소리가 나지 않게 건너뛴다
export const OPENING_ID = 'opening_day';
export const TRACKS = [
  { id: 'opening_day' },
  { id: 'cozy_sunset' },
  { id: 'good_morning' },
  { id: 'riverside_lunch' },
  { id: 'sunny_afternoon', skip: 2.8 }, // 첫 3초가 -55 dB 정도의 무음
];
export const FADE = {
  xfade: 4, // 곡 사이 크로스페이드 (s, 등전력)
  tail: 1, // 곡 끝의 무음/잔향 — 크로스페이드는 이만큼 앞에서 끝난다
  preload: 20, // 크로스페이드 시작 이만큼 전에 다음 곡을 내려받기 시작 (지연 로딩)
  start: 2.5, // 처음 시작 페이드인
  pause: 0.8, // 일시정지·탭 숨김 페이드아웃
  resume: 1.2, // 다시 재생 페이드인
  leave: 1, // 월드에서 나갈 때 페이드아웃
};
export const BAR_COUNT = 24;

/** 'riverside_lunch' → 'Riverside Lunch' */
export function titleOf(id) {
  return String(id || '').split(/[_\-\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/** 재생 순서: opening_day 를 맨 앞에, 나머지는 id(=파일 이름) 순서 */
export function playOrder(tracks = TRACKS, first = OPENING_ID) {
  const head = tracks.filter((t) => t.id === first);
  const rest = tracks.filter((t) => t.id !== first).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return [...head, ...rest];
}

export const nextIndex = (i, n) => (n > 0 ? (i + 1) % n : 0);

/** 곡 길이(dur) → 다음 곡 내려받기 시작 시각 / 크로스페이드 시작 시각 (곡 안에서의 currentTime, 초) */
export function timingFor(dur, { xfade = FADE.xfade, tail = FADE.tail, preload = FADE.preload, skip = 0 } = {}) {
  if (!(dur > 0) || !Number.isFinite(dur)) return null;
  const xf = Math.max(0.5, Math.min(xfade, (dur - skip) / 3)); // 아주 짧은 곡이면 크로스페이드도 짧게
  const xfadeAt = Math.max(skip, dur - tail - xf);
  return { xf, xfadeAt, preloadAt: Math.max(skip, xfadeAt - preload) };
}

/** 등전력 곡선: dir 'in' = sin(0→π/2), 'out' = cos(0→π/2). from/to 로 시작·끝 레벨 조절 */
export function equalPowerCurve(dir, n = 64, from = dir === 'in' ? 0 : 1, to = dir === 'in' ? 1 : 0) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const k = dir === 'in' ? Math.sin(x * Math.PI / 2) : 1 - Math.cos(x * Math.PI / 2); // 0 → 1 로 가는 비율
    c[i] = from + (to - from) * k;
  }
  return c;
}

/** 볼륨 슬라이더(0..1) → 게인. 귀에 고르게 들리도록 제곱 곡선 */
export const volumeToGain = (v) => { const x = Math.min(1, Math.max(0, Number(v) || 0)); return x * x; };

/** 주파수 막대: 0..binCount-1 빈을 로그 간격으로 count 개 묶음 [start, end) */
export function barBins(binCount, count = BAR_COUNT, lo = 1, hiFrac = 0.7) {
  const hi = Math.max(lo + count, Math.floor(binCount * hiFrac));
  const out = [];
  let prev = lo;
  for (let i = 1; i <= count; i++) {
    const end = Math.max(prev + 1, Math.round(lo * Math.pow(hi / lo, i / count)));
    out.push([prev, Math.min(end, binCount)]);
    prev = Math.min(end, binCount - 1);
  }
  return out;
}
