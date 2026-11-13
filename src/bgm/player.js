// [bgm] 배경음악 엔진 (Web Audio)
//   덱 2개(HTMLAudioElement → MediaElementSource → GainNode)를 번갈아 쓴다. 곡 전체를 AudioBuffer 로 디코드하지 않고
//   스트리밍하므로 메모리가 거의 들지 않는다. 다음 곡은 크로스페이드 FADE.preload 초 전에만 내려받는다(지연 로딩).
//   그래프: deckA.gain ┐
//           deckB.gain ┴→ bus(일시정지·탭 숨김·시작 페이드) → analyser(막대) → vol(볼륨²·음소거·덕킹) → destination
//   - 곡 끝 FADE.tail 초 앞에서 FADE.xfade 초 등전력(sin/cos) 크로스페이드 — 빈틈·클릭 없이 넘어간다
//   - 브라우저 자동재생 정책: 사용자 입력(클릭/키)이 있었던 뒤에만 시작. 없으면 첫 입력을 기다린다
//   - 일시정지·탭 숨김: 페이드아웃 후 요소 정지 + AudioContext suspend (CPU 0), 돌아오면 resume + 페이드인
import { FADE, playOrder, nextIndex, timingFor, equalPowerCurve, volumeToGain, titleOf } from './playlist.js';

export const BGM_VOLUME_KEY = 'bw.bgmVolume';
export const BGM_MUTED_KEY = 'bw.bgmMuted';
export const DEFAULT_VOLUME = 0.55;
export const DUCK_GAIN = 0.55; // 탈것 효과음(버스·바이크 엔진)이 나는 동안 BGM 을 이만큼으로
const MIME = { webm: 'audio/webm; codecs="opus"', mp3: 'audio/mpeg' };
const TICK_MS = 250;
// [cathedral-bgm] 장소 배경음(성당 등): 64 초 반복 + 파일 끝에 처음 3 초를 덧붙여 두었다 → 요소 2개로 같은 소리끼리 겹쳐 이어서 빈틈 없이 돈다
export const AMBIENCE = { cathedral: { loop: 64, overlap: 3 } };
export const AMB_FADE = 2.6; // 월드 BGM ↔ 장소 배경음 크로스페이드(초)

export function pickFormat(probe) {
  try {
    const a = probe || new Audio();
    return a.canPlayType(MIME.webm) ? 'webm' : a.canPlayType(MIME.mp3) ? 'mp3' : 'webm';
  } catch { return 'webm'; }
}

/**
 * 합성 스펙트럼(0..255, 길이 out.length) — 분석기가 0 만 줄 때(iOS WebKit) 막대를 대신 움직이는 용도.
 * 곡 시간 t(초)만의 순수 함수: 저음이 크고 고음으로 갈수록 줄며, 120bpm 박자로 숨쉬고 대역마다 다르게 일렁인다.
 */
export function synthSpectrum(t, out = new Uint8Array(128)) {
  const n = out.length, beat = 0.62 + 0.38 * Math.pow(Math.abs(Math.sin(Math.PI * 2 * t)), 3);
  for (let k = 0; k < n; k++) {
    const env = Math.exp(-k / (n * 0.42));
    const wob = 0.55 + 0.25 * Math.sin(t * (2.3 + (k % 7) * 0.61) + k * 1.73) + 0.2 * Math.sin(t * (5.1 + (k % 5) * 0.9) + k * 0.37);
    out[k] = Math.max(0, Math.min(255, Math.round(255 * env * beat * wob)));
  }
  return out;
}

function readPrefs(st) {
  let volume = DEFAULT_VOLUME, muted = false;
  try {
    const v = parseFloat(st?.getItem(BGM_VOLUME_KEY));
    if (Number.isFinite(v)) volume = Math.min(1, Math.max(0, v));
    muted = st?.getItem(BGM_MUTED_KEY) === '1';
  } catch { /* noop */ }
  return { volume, muted };
}

export function createBgmPlayer({ base = './', storage = null, onChange = () => {}, debug = false, fixedVolume = false } = {}) {
  const store = storage || (() => { try { return localStorage; } catch { return null; } })();
  const order = playOrder();
  const ext = pickFormat();
  const s = {
    ctx: null, bus: null, an: null, vol: null, decks: [], cur: null, xf: null, timer: 0, token: 0, fails: 0,
    entered: false, userPaused: false, held: false, heldWasPlaying: false, hidden: typeof document !== 'undefined' && document.hidden,
    started: false, playing: false, waitGesture: false, gestured: false, duck: false, fadeInTok: -1,
    mus: null, amb: { want: '', id: '', els: null, gain: null, cur: 0, timer: 0, next: 0, off: 0, swap: 0, nodes: 0, tok: 0 }, // [cathedral-bgm]
    ...readPrefs(store),
  };
  // [mobile] 볼륨은 기기 하드웨어 버튼으로 — 게임 안 볼륨은 기본값 고정(예전에 저장된 값에 묶여 못 키우는 일 없게). 음소거는 그대로
  if (fixedVolume) s.volume = DEFAULT_VOLUME;
  const emit = (kind) => { try { onChange(kind); } catch (e) { console.warn('[bgm]', e); } };
  const now = () => s.ctx.currentTime;

  // ---- 게인 자동화: 지금 값에서 target 까지 등전력 곡선으로 dur 초 ----
  function fadeTo(param, target, dur) {
    const t = now(), v0 = param.value;
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(t);
    else { param.cancelScheduledValues(t); param.setValueAtTime(v0, t); }
    if (dur <= 0.02 || Math.abs(target - v0) < 1e-4) { param.setValueAtTime(target, t + 0.01); return; }
    param.setValueCurveAtTime(equalPowerCurve(target > v0 ? 'in' : 'out', 64, v0, target), t + 0.01, dur);
  }
  const holdAt = (param, v) => { const t = now(); param.cancelScheduledValues(t); param.setValueAtTime(v, t); };

  function ensureCtx() {
    if (s.ctx) return s.ctx;
    const C = window.AudioContext || window.webkitAudioContext;
    // [mobile] iOS 17+ : 웹오디오 세션을 '재생'으로 — 기본(ambient)이면 무음 스위치에 묶이고 다른 소리에 밀린다
    try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch { /* noop */ }
    s.ctx = new C({ latencyHint: 'playback' });
    s.bus = s.ctx.createGain(); s.bus.gain.value = 0;
    s.an = s.ctx.createAnalyser(); s.an.fftSize = 256; s.an.smoothingTimeConstant = 0.78;
    s.vol = s.ctx.createGain(); s.vol.gain.value = volTarget();
    s.bus.connect(s.an); s.an.connect(s.vol); s.vol.connect(s.ctx.destination);
    s.mus = s.ctx.createGain(); s.mus.gain.value = s.amb.want ? 0 : 1; s.mus.connect(s.bus); // [cathedral-bgm] 월드 곡 몫 (장소 배경음과 크로스페이드)
    s.decks = [0, 1].map((i) => {
      const el = new Audio(); el.preload = 'none'; el.crossOrigin = 'anonymous';
      const d = { i, el, node: s.ctx.createMediaElementSource(el), gain: s.ctx.createGain(), idx: -1, failed: false, timing: null };
      d.gain.gain.value = 0; d.node.connect(d.gain); d.gain.connect(s.mus);
      el.addEventListener('loadedmetadata', () => { d.timing = timingFor(el.duration, { skip: order[d.idx]?.skip || 0 }); });
      el.addEventListener('playing', () => {
        if (d !== s.cur) return;
        s.fails = 0;
        // 시작 페이드인은 소리가 실제로 나오기 시작할 때부터(첫 곡 로딩 시간만큼 페이드가 깎이지 않게)
        if (s.fadeInTok === s.token) { s.fadeInTok = -1; fadeTo(s.bus.gain, 1, FADE.start); }
      });
      el.addEventListener('ended', () => onEnded(d));
      el.addEventListener('error', () => onError(d));
      return d;
    });
    return s.ctx;
  }
  const other = (d) => s.decks[d.i ^ 1];
  const urlOf = (t) => `${base}audio/bgm/${t.id}.${ext}${t.skip ? `#t=${t.skip}` : ''}`;
  function load(d, idx) {
    d.idx = idx; d.failed = false; d.timing = null;
    holdAt(d.gain.gain, 0);
    d.el.preload = 'auto'; d.el.src = urlOf(order[idx]); d.el.load();
  }
  function unload(d) {
    if (!d || d.idx < 0) return;
    d.idx = -1; d.timing = null;
    holdAt(d.gain.gain, 0);
    try { d.el.pause(); d.el.removeAttribute('src'); d.el.load(); } catch { /* noop */ }
  }
  const play = (d) => d.el.play().catch((e) => {
    if (e?.name === 'NotAllowedError') { s.waitGesture = true; s.playing = false; stopTimer(); emit('state'); }
    else if (e?.name !== 'AbortError') console.warn('[bgm] play failed', order[d.idx]?.id, e?.message || e);
  });

  // ---- [cathedral-bgm] 장소 배경음 ----
  //   그래프: ambEl[0|1] → MediaElementSource → 요소 게인 → amb.gain ┐
  //           (월드 곡 덱들) → mus ─────────────────────────────────┴→ bus → analyser → vol(볼륨·음소거·덕킹)
  //   노드는 처음 한 번만 만들고 계속 쓴다(드나들어도 늘지 않음). 꺼지면 요소를 멈추고 src 를 비운다.
  const A = s.amb;
  const ambUrl = (id) => `${base}audio/ambience/${id}.${ext}`;
  function ensureAmb() {
    if (A.els) return;
    A.gain = s.ctx.createGain(); A.gain.gain.value = 0; A.gain.connect(s.bus); A.nodes++;
    A.els = [0, 1].map(() => {
      const el = new Audio(); el.preload = 'none'; el.crossOrigin = 'anonymous';
      const node = s.ctx.createMediaElementSource(el), g = s.ctx.createGain(); g.gain.value = 0; node.connect(g); g.connect(A.gain); A.nodes += 2;
      el.addEventListener('error', () => { if (A.id) console.warn('[bgm] ambience load failed', A.id, el.error?.code); });
      return { el, g };
    });
  }
  const ambPlay = (e) => e.el.play().catch((err) => { if (err?.name === 'NotAllowedError') { s.waitGesture = true; emit('state'); } else if (err?.name !== 'AbortError') console.warn('[bgm] ambience play failed', err?.message || err); });
  const clearAmbTimers = () => { if (A.timer) { clearInterval(A.timer); A.timer = 0; } if (A.next) { clearTimeout(A.next); A.next = 0; } if (A.swap) { clearTimeout(A.swap); A.swap = 0; } };
  function ambTick() {
    const spec = AMBIENCE[A.id]; if (!spec || A.next || !s.playing) return;
    const cur = A.els[A.cur], t = cur.el.currentTime;
    if (t < spec.loop - 0.6) return;
    // 반복 지점(loop 초)에서 다른 요소를 0 초부터 — 덧붙인 꼬리와 같은 소리라 겹쳐도 티가 안 난다
    A.next = setTimeout(() => {
      A.next = 0; if (!A.id || !s.playing) return;
      const o = A.els[A.cur], n = A.els[A.cur ^ 1], ov = spec.overlap - 0.4, t0 = now();
      n.el.currentTime = 0; holdAt(n.g.gain, 0); ambPlay(n);
      n.g.gain.linearRampToValueAtTime(1, t0 + ov); o.g.gain.cancelScheduledValues(t0); o.g.gain.setValueAtTime(1, t0); o.g.gain.linearRampToValueAtTime(0, t0 + ov);
      A.cur ^= 1;
      A.swap = setTimeout(() => { A.swap = 0; if (A.els[A.cur] !== o) o.el.pause(); }, ov * 1000 + 120);
    }, Math.max(0, (spec.loop - t) * 1000 - 15));
  }
  function ambStart(id) {
    ensureAmb(); clearAmbTimers();
    A.id = id; A.cur = 0;
    const e = A.els[0], o = A.els[1];
    try { o.el.pause(); } catch { /* noop */ }
    holdAt(o.g.gain, 0); holdAt(e.g.gain, 1);
    e.el.preload = 'auto'; e.el.src = ambUrl(id); e.el.currentTime = 0;
    o.el.preload = 'auto'; o.el.src = ambUrl(id); // 이어받을 요소도 같은 파일(브라우저 캐시) — 반복 지점에서 바로 0 초부터
    ambPlay(e);
    A.timer = setInterval(ambTick, 200);
  }
  function ambStop() {
    clearAmbTimers(); A.id = '';
    if (!A.els) return;
    for (const e of A.els) { holdAt(e.g.gain, 0); try { e.el.pause(); e.el.removeAttribute('src'); e.el.load(); } catch { /* noop */ } }
  }
  const ambActive = () => (A.els && A.id ? [A.els[A.cur], ...(A.swap ? [A.els[A.cur ^ 1]] : [])] : []);
  /** 원하는 장소 배경음(A.want)으로 dur 초 크로스페이드 */
  function applyAmb(dur = AMB_FADE) {
    if (!s.ctx || !s.mus) return; // 아직 소리 시작 전 — start() 때 맞춘다
    const want = A.want, tok = ++A.tok;
    if (A.off) { clearTimeout(A.off); A.off = 0; }
    if (want) {
      if (A.id !== want && s.playing) ambStart(want);
      if (A.gain) fadeTo(A.gain.gain, 1, dur);
      fadeTo(s.mus.gain, 0, dur);
    } else {
      fadeTo(s.mus.gain, 1, dur);
      if (A.gain) fadeTo(A.gain.gain, 0, dur);
      if (A.id) A.off = setTimeout(() => { A.off = 0; if (tok === A.tok && !A.want) ambStop(); }, dur * 1000 + 150);
    }
    emit('state');
  }

  // ---- 시작 · 크로스페이드 ----
  function start() {
    s.token++; // 진행 중인 정지 페이드의 뒷정리를 무효화
    ensureCtx();
    if (s.ctx.state !== 'running') s.ctx.resume().catch(() => {});
    s.started = true; s.playing = true; s.fails = 0; s.xf = null;
    s.cur = s.decks[0];
    unload(s.decks[1]);
    load(s.cur, 0); // 입장하면 언제나 opening_day 부터
    holdAt(s.bus.gain, 0);
    s.cur.gain.gain.setValueAtTime(1, now());
    s.fadeInTok = s.token; // 'playing' 이벤트에서 페이드인
    play(s.cur);
    if (A.want) { holdAt(s.mus.gain, 0); ambStart(A.want); holdAt(A.gain.gain, 1); s.fadeInTok = -1; fadeTo(s.bus.gain, 1, FADE.start); } // [cathedral-bgm] 성당 안에서 소리가 처음 켜지면 바로 성당 소리로
    startTimer(); emit('track');
  }
  function crossfade(dur) {
    const o = s.cur, n = other(o), want = nextIndex(o.idx, order.length);
    if (n.idx !== want || n.failed) load(n, want);
    holdAt(n.gain.gain, 0);
    play(n);
    fadeTo(n.gain.gain, 1, dur);
    fadeTo(o.gain.gain, 0, dur);
    s.cur = n;
    s.xf = { from: o, end: now() + dur + 0.05, dur };
    emit('track');
  }
  function finishXf() { if (!s.xf) return; unload(s.xf.from); s.xf = null; emit('state'); }
  function tick() {
    if (!s.playing || !s.cur) return;
    if (s.xf) { if (now() >= s.xf.end) finishXf(); return; }
    const d = s.cur, tm = d.timing, n = other(d), t = d.el.currentTime;
    if (!tm) return;
    if (n.idx < 0 && t >= tm.preloadAt) load(n, nextIndex(d.idx, order.length));
    // 다음 곡이 아직 재생 가능 상태가 아니면 최대 1.5초까지 기다려 본다(그래도 안 되면 그냥 넘김)
    if (t >= tm.xfadeAt && (n.el.readyState >= 3 || t >= tm.xfadeAt + 1.5)) crossfade(tm.xf);
  }
  function onEnded(d) {
    if (s.xf?.from === d) finishXf();
    else if (d === s.cur && s.playing) crossfade(1); // 크로스페이드를 놓쳤으면(탭이 느려서 등) 짧게라도 이어 준다
  }
  function onError(d) {
    if (d.idx < 0) return;
    d.failed = true;
    console.warn('[bgm] load failed', order[d.idx]?.id, d.el.error?.code);
    if (d !== s.cur || !s.playing) return;
    if (++s.fails >= order.length) { stop(0.2); return; } // 전부 실패 — 조용히 포기
    crossfade(0.5);
  }
  function startTimer() { if (!s.timer) s.timer = setInterval(tick, TICK_MS); }
  function stopTimer() { if (s.timer) { clearInterval(s.timer); s.timer = 0; } }

  // ---- 일시정지/재개/정지 (페이드 포함) ----
  const activeDecks = () => s.decks.filter((d) => d.idx >= 0 && (d === s.cur || d === s.xf?.from));
  function fadeOutThen(dur, done) {
    const tok = ++s.token;
    s.playing = false; stopTimer();
    if (!s.ctx) { done(); return; }
    fadeTo(s.bus.gain, 0, dur);
    setTimeout(() => { if (tok === s.token) done(); }, dur * 1000 + 80);
  }
  function pause(dur = FADE.pause) {
    fadeOutThen(dur, () => { for (const d of activeDecks()) d.el.pause(); for (const e of ambActive()) e.el.pause(); s.ctx.suspend().catch(() => {}); emit('state'); });
    emit('state');
  }
  function resume() {
    s.token++;
    if (s.ctx.state !== 'running') s.ctx.resume().catch(() => {});
    for (const d of activeDecks()) if (d.el.paused) play(d);
    s.playing = true; startTimer();
    if (A.want && A.id !== A.want) { holdAt(s.mus.gain, 0); ambStart(A.want); holdAt(A.gain.gain, 1); } // [cathedral-bgm]
    else for (const e of ambActive()) if (e.el.paused && e.el.src) ambPlay(e);
    fadeTo(s.bus.gain, 1, FADE.resume);
    emit('state');
  }
  function stop(dur = FADE.leave) {
    s.started = false;
    fadeOutThen(dur, () => { for (const d of s.decks) unload(d); ambStop(); s.cur = null; s.xf = null; s.ctx?.suspend().catch(() => {}); emit('state'); });
    emit('state');
  }
  const canStart = () => s.gestured || !!navigator.userActivation?.hasBeenActive;
  // 원하는 상태(입장 · 사용자가 멈추지 않음 · 탭 보임)로 맞춘다
  function apply() {
    const want = s.entered && !s.userPaused && !s.hidden && !s.held;
    if (want) {
      if (!canStart()) { s.waitGesture = true; emit('state'); return; }
      s.waitGesture = false;
      if (!s.started) start();
      else if (!s.playing) resume();
    } else if (s.started && s.playing) pause();
  }
  // [mobile] iOS WebKit 은 pointerdown/touchstart 를 오디오 잠금 해제용 사용자 입력으로 치지 않는다 — touchend/click 에서
  // (핸들러 안에서 동기로) 멈춰 있거나 'interrupted' 인 AudioContext 를 다시 깨우고, 멈춰 버린 덱도 다시 재생한다.
  // 입장 직후 start() 는 비동기(월드 로딩 뒤)라 거기서 부른 resume() 이 iOS 에선 그냥 무시되기 때문.
  function unlock() {
    if (!s.ctx || !s.playing) return;
    if (s.ctx.state !== 'running') s.ctx.resume().catch(() => {});
    for (const d of activeDecks()) if (d.el.paused && d.el.src) play(d);
    for (const e of ambActive()) if (e.el.paused && e.el.src) ambPlay(e); // [cathedral-bgm]
  }
  const onGesture = () => { s.gestured = true; if (s.waitGesture) apply(); else unlock(); };
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(ev, onGesture, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { s.hidden = document.hidden; apply(); });

  // ---- 볼륨 · 음소거 · 덕킹 ----
  function volTarget() { return s.muted ? 0 : volumeToGain(s.volume) * (s.duck ? DUCK_GAIN : 1); }
  function applyVol(tc = 0.06) { if (s.vol) { const t = now(); s.vol.gain.cancelScheduledValues(t); s.vol.gain.setTargetAtTime(volTarget(), t, tc); } }
  const save = (k, v) => { try { store?.setItem(k, v); } catch { /* noop */ } };

  const levels = new Uint8Array(128);
  // [mobile] iOS WebKit 에선 MediaElementSource → AnalyserNode 가 (소리는 나는데도) 0 만 돌려주거나, 컨텍스트가
  // 멈춰 분석이 안 되는 경우가 있다 — 막대가 바닥에 붙은 채로 '파형이 안 보인다'. 곡은 실제로 흘러가는데(currentTime 증가)
  // 분석값이 FLAT_MS 넘게 전부 0 이면, 곡 시간에 맞춰 움직이는 합성 스펙트럼으로 대신 그린다(진짜 값이 들어오면 즉시 복귀).
  const FLAT_MS = 1200;
  const viz = { flatSince: 0, lastT: -1, synthetic: false, out: new Uint8Array(128) };
  function vizFallback(real) {
    let max = 0; for (let k = 0; k < real.length; k++) if (real[k] > max) max = real[k];
    const el = s.cur?.el, t = el ? el.currentTime : 0, moving = !!el && !el.paused && t > 0 && t !== viz.lastT;
    viz.lastT = t;
    const ms = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (max > 0 || !moving) { if (max > 0) { viz.flatSince = 0; viz.synthetic = false; } if (!viz.synthetic) return real; }
    else if (!viz.flatSince) viz.flatSince = ms;
    if (!viz.synthetic && !(viz.flatSince && ms - viz.flatSince >= FLAT_MS)) return real;
    viz.synthetic = true;
    return synthSpectrum(t, viz.out);
  }
  const api = {
    get ext() { return ext; },
    get started() { return s.started; },
    get playing() { return s.playing; },
    get paused() { return s.userPaused; },
    get waiting() { return s.waitGesture; },
    get muted() { return s.muted; },
    get volume() { return s.volume; },
    get track() { const d = s.cur; return d && d.idx >= 0 ? { id: order[d.idx].id, title: titleOf(order[d.idx].id), index: d.idx } : { id: order[0].id, title: titleOf(order[0].id), index: 0 }; },
    /** 지금 곡 진행률 0..1 (표시 전용) */
    progress() {
      const d = s.cur; if (!d || d.idx < 0) return 0;
      const skip = order[d.idx].skip || 0, dur = d.el.duration;
      return Number.isFinite(dur) && dur > skip ? Math.min(1, Math.max(0, (d.el.currentTime - skip) / (dur - skip))) : 0;
    },
    /** 주파수 크기(0..255) — 재생 중이 아니면 null */
    spectrum() {
      if (!s.an || !s.playing) return null;
      s.an.getByteFrequencyData(levels);
      return vizFallback(levels);
    },
    /** 'analyser' | 'synthetic' — 마지막 spectrum() 이 어디서 왔는지 (표시·테스트용) */
    get spectrumSource() { return viz.synthetic ? 'synthetic' : 'analyser'; },
    get binCount() { return 128; },
    enter() { s.entered = true; apply(); },
    leave() { s.entered = false; s.userPaused = false; s.waitGesture = false; if (s.started) stop(); },
    togglePause() {
      s.userPaused = !s.userPaused;
      if (!s.userPaused) s.gestured = true; // 버튼 클릭 자체가 사용자 입력
      apply(); emit('state');
    },
    setMuted(m) { s.muted = !!m; save(BGM_MUTED_KEY, s.muted ? '1' : '0'); applyVol(0.08); emit('state'); },
    setVolume(v) {
      if (fixedVolume) return;
      s.volume = Math.min(1, Math.max(0, Number(v) || 0)); save(BGM_VOLUME_KEY, String(Math.round(s.volume * 100) / 100));
      if (s.muted && s.volume > 0) { s.muted = false; save(BGM_MUTED_KEY, '0'); }
      applyVol(); emit('state');
    },
    /** [cathedral-bgm] 장소 배경음 켜기('cathedral') / 끄기('' · null) — 바뀔 때만 크로스페이드 (매 프레임 불러도 됨) */
    setAmbience(id) {
      id = id && AMBIENCE[id] ? id : '';
      if (id === A.want) return;
      A.want = id; applyAmb();
    },
    get ambience() { return A.want; },
    setDuck(on) { on = !!on; if (on === s.duck) return; s.duck = on; applyVol(0.25); },
    /** 외부(오락실 게임 등)가 월드 OST 를 완전히 멈춤. userPaused·muted 는 건드리지 않음. */
    hold(on) {
      on = !!on;
      if (on === s.held) return;
      if (on) {
        s.heldWasPlaying = !!(s.started && s.playing && !s.userPaused);
        s.held = true;
        apply();
      } else {
        s.held = false;
        const resumeWanted = s.heldWasPlaying;
        s.heldWasPlaying = false;
        if (resumeWanted && !s.userPaused) apply();
        else emit('state');
      }
    },
  };
  if (!debug) return api;
  // 디버그(개발 서버 / ?bgmDebug=1): 상태·게인 읽기, 크로스페이드 직전으로 이동
  api.debug = {
    state() {
      const d = s.cur;
      return {
        ext, started: s.started, playing: s.playing, userPaused: s.userPaused, hidden: s.hidden, waitGesture: s.waitGesture,
        muted: s.muted, volume: s.volume, duck: s.duck, ctx: s.ctx?.state || null, xf: !!s.xf,
        cur: d && d.idx >= 0 ? { deck: d.i, id: order[d.idx].id, t: +d.el.currentTime.toFixed(2), dur: d.el.duration, timing: d.timing } : null,
        decks: s.decks.map((k) => ({ deck: k.i, id: k.idx >= 0 ? order[k.idx].id : null, gain: +k.gain.gain.value.toFixed(3), paused: k.el.paused, t: +k.el.currentTime.toFixed(2), ready: k.el.readyState, net: k.el.networkState })),
        bus: s.bus ? +s.bus.gain.value.toFixed(3) : null, vol: s.vol ? +s.vol.gain.value.toFixed(3) : null,
        mus: s.mus ? +s.mus.gain.value.toFixed(3) : null, // [cathedral-bgm]
        amb: { want: A.want, id: A.id, gain: A.gain ? +A.gain.gain.value.toFixed(3) : null, nodes: A.nodes, timers: (A.timer ? 1 : 0) + (A.next ? 1 : 0) + (A.swap ? 1 : 0) + (A.off ? 1 : 0), els: A.els ? A.els.map((e) => ({ paused: e.el.paused, src: !!e.el.getAttribute('src'), t: +e.el.currentTime.toFixed(2), g: +e.g.gain.value.toFixed(3) })) : [] },
      };
    },
    /** 지금 곡을 크로스페이드 시작 sec 초 전으로 */
    /** [cathedral-bgm] 장소 배경음을 반복 지점 sec 초 전으로 (이음매 확인용) */
    seekAmbLoop(sec = 2) { const e = A.els?.[A.cur]; const sp = AMBIENCE[A.id]; if (!e || !sp) return false; e.el.currentTime = Math.max(0, sp.loop - sec); return true; },
    seekBeforeXfade(sec = 6) { const d = s.cur; if (!d?.timing) return false; d.el.currentTime = Math.max(0, d.timing.xfadeAt - sec); return true; },
    order: order.map((t) => t.id),
  };
  return api;
}
