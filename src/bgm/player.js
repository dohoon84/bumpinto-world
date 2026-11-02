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

export function pickFormat(probe) {
  try {
    const a = probe || new Audio();
    return a.canPlayType(MIME.webm) ? 'webm' : a.canPlayType(MIME.mp3) ? 'mp3' : 'webm';
  } catch { return 'webm'; }
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

export function createBgmPlayer({ base = './', storage = null, onChange = () => {}, debug = false } = {}) {
  const store = storage || (() => { try { return localStorage; } catch { return null; } })();
  const order = playOrder();
  const ext = pickFormat();
  const s = {
    ctx: null, bus: null, an: null, vol: null, decks: [], cur: null, xf: null, timer: 0, token: 0, fails: 0,
    entered: false, userPaused: false, hidden: typeof document !== 'undefined' && document.hidden,
    started: false, playing: false, waitGesture: false, gestured: false, duck: false, fadeInTok: -1,
    ...readPrefs(store),
  };
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
    s.ctx = new C({ latencyHint: 'playback' });
    s.bus = s.ctx.createGain(); s.bus.gain.value = 0;
    s.an = s.ctx.createAnalyser(); s.an.fftSize = 256; s.an.smoothingTimeConstant = 0.78;
    s.vol = s.ctx.createGain(); s.vol.gain.value = volTarget();
    s.bus.connect(s.an); s.an.connect(s.vol); s.vol.connect(s.ctx.destination);
    s.decks = [0, 1].map((i) => {
      const el = new Audio(); el.preload = 'none'; el.crossOrigin = 'anonymous';
      const d = { i, el, node: s.ctx.createMediaElementSource(el), gain: s.ctx.createGain(), idx: -1, failed: false, timing: null };
      d.gain.gain.value = 0; d.node.connect(d.gain); d.gain.connect(s.bus);
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
    fadeOutThen(dur, () => { for (const d of activeDecks()) d.el.pause(); s.ctx.suspend().catch(() => {}); emit('state'); });
    emit('state');
  }
  function resume() {
    s.token++;
    if (s.ctx.state !== 'running') s.ctx.resume().catch(() => {});
    for (const d of activeDecks()) if (d.el.paused) play(d);
    s.playing = true; startTimer();
    fadeTo(s.bus.gain, 1, FADE.resume);
    emit('state');
  }
  function stop(dur = FADE.leave) {
    s.started = false;
    fadeOutThen(dur, () => { for (const d of s.decks) unload(d); s.cur = null; s.xf = null; s.ctx?.suspend().catch(() => {}); emit('state'); });
    emit('state');
  }
  const canStart = () => s.gestured || !!navigator.userActivation?.hasBeenActive;
  // 원하는 상태(입장 · 사용자가 멈추지 않음 · 탭 보임)로 맞춘다
  function apply() {
    const want = s.entered && !s.userPaused && !s.hidden;
    if (want) {
      if (!canStart()) { s.waitGesture = true; emit('state'); return; }
      s.waitGesture = false;
      if (!s.started) start();
      else if (!s.playing) resume();
    } else if (s.started && s.playing) pause();
  }
  const onGesture = () => { s.gestured = true; if (s.waitGesture) apply(); };
  addEventListener('pointerdown', onGesture, { capture: true });
  addEventListener('keydown', onGesture, { capture: true });
  document.addEventListener('visibilitychange', () => { s.hidden = document.hidden; apply(); });

  // ---- 볼륨 · 음소거 · 덕킹 ----
  function volTarget() { return s.muted ? 0 : volumeToGain(s.volume) * (s.duck ? DUCK_GAIN : 1); }
  function applyVol(tc = 0.06) { if (s.vol) { const t = now(); s.vol.gain.cancelScheduledValues(t); s.vol.gain.setTargetAtTime(volTarget(), t, tc); } }
  const save = (k, v) => { try { store?.setItem(k, v); } catch { /* noop */ } };

  const levels = new Uint8Array(128);
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
    spectrum() { if (!s.an || !s.playing) return null; s.an.getByteFrequencyData(levels); return levels; },
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
      s.volume = Math.min(1, Math.max(0, Number(v) || 0)); save(BGM_VOLUME_KEY, String(Math.round(s.volume * 100) / 100));
      if (s.muted && s.volume > 0) { s.muted = false; save(BGM_MUTED_KEY, '0'); }
      applyVol(); emit('state');
    },
    setDuck(on) { on = !!on; if (on === s.duck) return; s.duck = on; applyVol(0.25); },
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
      };
    },
    /** 지금 곡을 크로스페이드 시작 sec 초 전으로 */
    seekBeforeXfade(sec = 6) { const d = s.cur; if (!d?.timing) return false; d.el.currentTime = Math.max(0, d.timing.xfadeAt - sec); return true; },
    order: order.map((t) => t.id),
  };
  return api;
}
