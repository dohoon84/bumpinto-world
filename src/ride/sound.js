// [ride] 버스 하차벨(딩동, WebAudio 합성) · 정류장 안내 방송(speechSynthesis)
//   - 음소거: 탑승 HUD 🔊/🔇 버튼(localStorage 'bw.rideVoice') · URL ?rideVoice=0 이면 처음부터 꺼짐(효과음 포함 전부)
//   - speechSynthesis 가 없거나 음성이 없으면 조용히 생략(자막은 ride 쪽에서 항상 표시)
// [bus-sfx] 실제 버스 녹음(오너 제공) 효과음: 차내 주행/공회전 루프 + 정차·문·카드·출발 원샷 + 안내 차임
//   - public/audio/bus/*.{ogg,m4a} (canPlayType 으로 ogg 우선, 안 되면 m4a) · 첫 탑승 때만 내려받음(시작 시 X)
//   - 내가 탄 버스에서만(위치 음향 없음) · ?rideSfx=0 이면 효과음만 끔(안내 음성·하차벨은 그대로)
export const RIDE_VOICE_KEY = 'bw.rideVoice';
export const BUS_SFX = ['bus-interior-loop', 'bus-idle-loop', 'announce-chime-synth-v2', 'bus-brake-v2', 'door-open-v2', 'card-tap-v2', 'door-close-v2', 'bus-depart-v2'];
const LOOP_GAIN = 0.55, SFX_GAIN = 0.7, CHIME_GAIN = 0.6;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// 속도(m/s)·정차 여부 → 루프 믹스(순수 함수 — 테스트용). mix 0 = 공회전, 1 = 주행
export function busLoopMix(v, dwell) {
  const mix = dwell ? 0 : clamp((v || 0) / 5, 0, 1);
  return { mix, interior: Math.sin(mix * Math.PI / 2), idle: Math.cos(mix * Math.PI / 2), rate: 0.85 + 0.25 * clamp((v || 0) / 14, 0, 1) };
}

// 안내 문구(순수 함수 — 테스트용). cur: 이번 정류장, next: 다음 정류장(없으면 종점)
export function announceText(cur, next, en = false) {
  if (!cur) return '';
  if (en) return next ? `This stop is ${cur}. The next stop is ${next}.` : `This stop is ${cur}, the last stop.`;
  return next ? `이번 정류장은 ${cur}입니다. 다음 정류장은 ${next}입니다.` : `이번 정류장은 종점, ${cur}입니다.`;
}

export function createRideSound({ params = null, storage = null, base = import.meta.env?.BASE_URL || './' } = {}) {
  const st = storage || (() => { try { return localStorage; } catch { return null; } })();
  const sfxOff = params?.get?.('rideSfx') === '0';
  let muted = params?.get?.('rideVoice') === '0';
  if (!muted) { try { muted = st?.getItem(RIDE_VOICE_KEY) === '0'; } catch { /* noop */ } }
  let ctx = null;
  const ac = () => {
    if (ctx) return ctx;
    const C = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!C) return null;
    try { ctx = new C(); } catch { ctx = null; }
    return ctx;
  };
  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  const voiceFor = (lang) => {
    try { const vs = synth?.getVoices?.() || []; return vs.find((v) => v.lang?.toLowerCase().startsWith(lang)) || null; } catch { return null; }
  };
  synth?.getVoices?.(); // 일부 브라우저는 첫 호출 뒤에 목록을 채움
  // 딩-동: 두 음(E5 → C5) + 배음, 각자 지수 감쇠
  function tone(c, f, t0, dur, g0) {
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(g0, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(c.destination);
    for (const [m, a] of [[1, 1], [2, 0.28], [3.01, 0.12]]) {
      const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = f * m; og.gain.value = a;
      o.connect(og); og.connect(g); o.start(t0); o.stop(t0 + dur + 0.05);
    }
  }
  // ---- [bus-sfx] ----
  const fx = { bufs: new Map(), loading: null, failed: 0, pending: [], loops: null, events: [], chimeT: 0, sayT: null, requests: 0 };
  const ext = (() => { try { const a = new Audio(); return a.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : a.canPlayType('audio/mp4; codecs="mp4a.40.2"') ? 'm4a' : 'ogg'; } catch { return 'ogg'; } })();
  const sfxOn = () => !sfxOff && !muted;
  const logEv = (name, played) => { fx.events.push({ name, t: Math.round(performance.now()), played }); if (fx.events.length > 300) fx.events.splice(0, 100); };
  function loadSfx() {
    if (sfxOff || fx.loading) return fx.loading;
    const c = ac(); if (!c || typeof fetch !== 'function') return null;
    fx.loading = Promise.all(BUS_SFX.map(async (name) => {
      try {
        fx.requests++;
        const r = await fetch(`${base}audio/bus/${name}.${ext}`); if (!r.ok) throw new Error(r.status);
        const ab = await r.arrayBuffer();
        const buf = await new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p?.then) p.then(res, rej); });
        fx.bufs.set(name, buf);
      } catch (e) { fx.failed++; console.warn('[bus-sfx] load failed', name, e?.message || e); }
    })).then(() => { const now = performance.now(), q = fx.pending; fx.pending = []; for (const p of q) if (now - p.t < 1500) startOne(p.name, p.opts); });
    return fx.loading;
  }
  function startOne(name, { gain = SFX_GAIN, delay = 0 } = {}) {
    const c = ctx, buf = fx.bufs.get(name);
    if (!c || !buf || !sfxOn()) { logEv(name, false); return false; }
    try {
      if (c.state === 'suspended') c.resume();
      const src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; g.gain.value = gain;
      src.connect(g); g.connect(c.destination); src.start(c.currentTime + 0.01 + delay);
      logEv(name, true); return true;
    } catch { logEv(name, false); return false; }
  }
  function sfx(name, opts) {
    if (!sfxOn()) return false;
    if (!fx.bufs.has(name) && fx.loading && fx.bufs.size + fx.failed < BUS_SFX.length) { fx.pending.push({ name, opts, t: performance.now() }); return true; }
    return startOne(name, opts);
  }
  function mkLoop(c, name) {
    const buf = fx.bufs.get(name); if (!buf) return null;
    const src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; src.loop = true; g.gain.value = 0;
    src.connect(g); g.connect(c.destination); src.start(c.currentTime + 0.02, Math.random() * buf.duration * 0.8);
    return { src, g };
  }
  function stopLoops(fade = 0.4) {
    const L = fx.loops; fx.loops = null; if (!L || !ctx) return;
    const t = ctx.currentTime;
    for (const l of [L.interior, L.idle]) if (l) { try { l.g.gain.cancelScheduledValues(t); l.g.gain.setTargetAtTime(0, t, fade / 4); l.src.stop(t + fade + 0.05); } catch { /* noop */ } }
    logEv('loops-stop', true);
  }
  const cancelSay = () => { if (fx.sayT) { clearTimeout(fx.sayT); fx.sayT = null; } };

  return {
    get muted() { return muted; },
    get canSpeak() { return !!synth; },
    get sfxEnabled() { return !sfxOff; },
    get sfxEvents() { return fx.events; },
    get sfxStats() { return { ext, requests: fx.requests, loaded: fx.bufs.size, failed: fx.failed, loops: !!fx.loops, ctx: ctx?.state || null }; },
    setMuted(v) { muted = !!v; try { st?.setItem(RIDE_VOICE_KEY, muted ? '0' : '1'); } catch { /* noop */ } if (muted) { try { synth?.cancel(); } catch { /* noop */ } cancelSay(); } },
    // 첫 탑승 순간(사용자 입력 안)에 호출: 컨텍스트 재개 + 효과음 내려받기(한 번만)
    prepareBus() { if (sfxOff) return; const c = ac(); try { if (c?.state === 'suspended') c.resume(); } catch { /* noop */ } loadSfx(); },
    sfx,
    // 매 프레임(탑승 중): 정차/저속은 공회전, 달리면 차내 주행음 — 속도에 따라 크로스페이드·재생 속도 0.85–1.1
    busEngine(v, dwell) {
      if (sfxOff || !ctx) return;
      const on = sfxOn();
      if (!fx.loops) {
        if (!on || !fx.bufs.has('bus-interior-loop') || !fx.bufs.has('bus-idle-loop')) return;
        try { if (ctx.state === 'suspended') ctx.resume(); fx.loops = { interior: mkLoop(ctx, 'bus-interior-loop'), idle: mkLoop(ctx, 'bus-idle-loop') }; logEv('loops-start', true); } catch { fx.loops = null; return; }
      }
      const m = busLoopMix(v, dwell), t = ctx.currentTime, k = on ? LOOP_GAIN : 0;
      const L = fx.loops;
      try {
        L.interior?.g.gain.setTargetAtTime(k * m.interior, t, 0.25);
        L.idle?.g.gain.setTargetAtTime(k * m.idle, t, 0.25);
        L.interior?.src.playbackRate.setTargetAtTime(m.rate, t, 0.3);
      } catch { /* noop */ }
    },
    stopBus() { stopLoops(); cancelSay(); fx.pending = []; },
    // 안내 방송: 차임(딩-동) → 끝난 뒤 음성. 효과음이 꺼졌거나 아직 못 받았으면 바로 음성
    announce(text, en = false) {
      if (muted || !text) return false;
      cancelSay();
      const chime = fx.bufs.get('announce-chime-synth-v2');
      if (sfxOn() && chime && startOne('announce-chime-synth-v2', { gain: CHIME_GAIN })) {
        if (!synth) return false;
        fx.sayT = setTimeout(() => { fx.sayT = null; this.say(text, en); }, Math.round(chime.duration * 1000));
        return true;
      }
      return this.say(text, en);
    },
    bell() {
      if (muted) return false;
      const c = ac(); if (!c) return false;
      try { if (c.state === 'suspended') c.resume(); const t = c.currentTime + 0.02; tone(c, 659.25, t, 0.9, 0.16); tone(c, 523.25, t + 0.38, 1.2, 0.16); return true; } catch { return false; }
    },
    say(text, en = false) {
      if (muted || !synth || !text) return false;
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = en ? 'en-US' : 'ko-KR'; const v = voiceFor(en ? 'en' : 'ko'); if (v) u.voice = v;
        u.rate = en ? 1 : 1.05; u.volume = 0.9;
        synth.cancel(); synth.speak(u); logEv('tts', true); return true;
      } catch { return false; }
    },
  };
}
