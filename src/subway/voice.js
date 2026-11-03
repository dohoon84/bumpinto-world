// [subway-voice] 지하철 안내 방송 음성: 차임(WebAudio 합성, 자체 제작) → 한국어 → 영어 (Web Speech API)
//   - 자막과 같은 문구({ko,en,kind,clip} = ride.js announce) 를 줄 세워 하나씩 — 겹치지 않음
//   - 지금 나오는 방송은 끝까지, 아직 시작 안 한 방송은 새 방송이 오면 최신 것으로 교체 (밀린 방송이 늦게 나오지 않게)
//   - cancel(): 방을 옮기거나(열차·승강장을 떠남) 나갈 때 → 대기열 비우고 말하던 것도 멈춤
//   - ?subwayVoice=0 / ?sound=0 이면 끔 · ?rideSfx=0 이면 차임(효과음)만 끔 · BGM HUD 음소거면 무음, 볼륨은 BGM 슬라이더를 따름
//   - speechSynthesis 가 없거나 그 언어 음성이 없으면 그 줄만 조용히 건너뜀(자막은 항상)
//   - 녹음 교체 훅: public/audio/subway/clips.json 에 ["chime", "approach-wangsimni.ko", ...] 처럼 적고
//     public/audio/subway/<이름>.ogg + .m4a 를 두면 그 줄은 TTS 대신 녹음 재생 (버스 public/audio/bus 와 같은 방식, 첫 방송 때만 목록 받음)
export const CHIME_KINDS = Object.freeze(['approach', 'next']);
export const CHIME_SEC = 1.5;
const LANGS = [['ko', 'ko-KR'], ['en', 'en-US']];

// 차임: 자체 합성 — 부드러운 3음 상행 아르페지오(D5·F♯5·A5) + 옥타브 위 D6 여운. 어느 운영사 멜로디도 아님
export const CHIME_NOTES = Object.freeze([[587.33, 0, 0.9], [739.99, 0.16, 0.9], [880, 0.32, 1.0], [1174.66, 0.5, 1.0]]);
function synthChime(c, gain) {
  const t0 = c.currentTime + 0.02;
  for (const [f, at, dur] of CHIME_NOTES) {
    const g = c.createGain(), t = t0 + at;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(c.destination);
    for (const [m, a] of [[1, 1], [2.0, 0.22], [4.0, 0.05]]) {
      const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = f * m; og.gain.value = a;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05);
    }
  }
}

// 대기열에 넣을 항목 (순수 함수 — 테스트용)
export function voiceItems(a, { chime = true } = {}) {
  if (!a?.ko) return [];
  const out = [];
  if (chime && CHIME_KINDS.includes(a.kind)) out.push({ t: 'chime', clip: 'chime' });
  for (const [k, lang] of LANGS) if (a[k]) out.push({ t: 'line', k, lang, text: a[k], clip: a.clip ? `${a.clip}.${k}` : null });
  return out;
}

export function createSubwayVoice({
  params = null, getLevel = () => ({ muted: false, volume: 1 }),
  synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null,
  Utterance = typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null,
  AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext || null) : null,
  fetchFn = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  base = import.meta.env?.BASE_URL || './',
  timers = { set: (f, ms) => setTimeout(f, ms), clear: (id) => clearTimeout(id) },
} = {}) {
  const off = params?.get?.('subwayVoice') === '0' || params?.get?.('sound') === '0';
  const sfxOff = params?.get?.('rideSfx') === '0';
  const q = [];          // 대기 항목들 (각 항목 .a = 어느 방송인지)
  let cur = null;        // 지금 재생 중인 항목
  let tok = 0, timer = null, src = null, ctx = null, spoke = false;
  const events = [];
  const log = (e) => { events.push(e); if (events.length > 200) events.splice(0, 50); };
  // 녹음 목록 (없으면 빈 집합 → 전부 TTS)
  let clips = null, clipsP = null;
  const bufs = new Map();
  const ext = (() => { try { const a = new Audio(); return a.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'; } catch { return 'ogg'; } })();
  function loadClips() {
    if (clipsP || !fetchFn) return clipsP;
    clipsP = fetchFn(`${base}audio/subway/clips.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []).then((l) => { clips = new Set(Array.isArray(l) ? l : []); });
    return clipsP;
  }
  const ac = () => {
    if (ctx || !AudioCtx) return ctx;
    try { ctx = new AudioCtx(); } catch { ctx = null; }
    return ctx;
  };
  const level = () => { const l = getLevel?.() || {}; const v = Math.min(1, Math.max(0, Number(l.volume ?? 1))); return { muted: !!l.muted || v <= 0, volume: v }; };
  const voices = () => { try { return synth?.getVoices?.() || []; } catch { return []; } };
  const voiceFor = (k) => voices().find((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith(k)) || null;
  try { synth?.getVoices?.(); } catch { /* 일부 브라우저는 첫 호출 뒤에 목록을 채움 */ }

  function finish(my) { if (my !== tok) return; if (timer != null) { timers.clear(timer); timer = null; } src = null; cur = null; next(); }
  function next() {
    if (cur) return;
    const it = q.shift(); if (!it) return;
    const lv = level();
    if (lv.muted) { q.length = 0; log({ t: 'skip', why: 'muted' }); return; }
    cur = it; const my = ++tok;
    if (it.clip && clips?.has(it.clip) && playClip(it, lv, my)) return;
    if (it.t === 'chime') {
      const c = ac();
      if (!c) { log({ t: 'skip', why: 'no-audio', clip: 'chime' }); cur = null; return next(); }
      try { if (c.state === 'suspended') c.resume(); synthChime(c, 0.16 * lv.volume); log({ t: 'chime', gain: +(0.16 * lv.volume).toFixed(3) }); } catch { /* noop */ }
      timer = timers.set(() => { timer = null; finish(my); }, CHIME_SEC * 1000);
      return;
    }
    const v = voiceFor(it.k);
    if (!synth || !Utterance || !v) { log({ t: 'skip', why: !synth || !Utterance ? 'no-tts' : 'no-voice', lang: it.lang }); cur = null; return next(); }
    try {
      const u = new Utterance(it.text);
      u.lang = it.lang; try { u.voice = v; } catch { /* lang 만으로 */ } u.rate = it.k === 'ko' ? 1.02 : 0.98; u.volume = lv.volume;
      u.onend = () => finish(my); u.onerror = () => finish(my);
      spoke = true; synth.speak(u);
      log({ t: 'speak', lang: it.lang, text: it.text, volume: +lv.volume.toFixed(2) });
      // onend 가 안 오는 브라우저 대비 안전 타이머 (글자 수 기준 넉넉히)
      timer = timers.set(() => { timer = null; log({ t: 'timeout', lang: it.lang }); finish(my); }, Math.round((3 + it.text.length * (it.k === 'ko' ? 0.2 : 0.09)) * 1000));
    } catch { log({ t: 'skip', why: 'error', lang: it.lang }); cur = null; next(); }
  }
  // 녹음 재생 (받아 둔 버퍼가 없으면 받아서 — 실패하면 그 줄은 TTS 로)
  function playClip(it, lv, my) {
    const c = ac(); if (!c || !fetchFn) return false;
    const go = (buf) => {
      if (my !== tok) return;
      try {
        if (c.state === 'suspended') c.resume();
        const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; g.gain.value = lv.volume;
        s.connect(g); g.connect(c.destination); s.onended = () => finish(my); s.start(); src = s;
        log({ t: 'clip', clip: it.clip });
      } catch { finish(my); }
    };
    const b = bufs.get(it.clip);
    if (b) { go(b); return true; }
    fetchFn(`${base}audio/subway/${it.clip}.${ext}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p?.then) p.then(res, rej); }))
      .then((buf) => { bufs.set(it.clip, buf); go(buf); })
      .catch(() => { if (my !== tok) return; clips.delete(it.clip); log({ t: 'clip-fail', clip: it.clip }); q.unshift(it); cur = null; ++tok; next(); });
    return true;
  }

  const api = {
    get enabled() { return !off; },
    get active() { return !!cur || q.length > 0; },
    get queued() { return q.map((i) => i.text || i.t); },
    get events() { return events; },
    /** 안내 방송 하나 (자막과 같은 {ko,en,kind,clip}). 대기 중인 이전 방송은 이것으로 교체 */
    play(a) {
      if (off || !a?.ko) return false;
      if (level().muted) { log({ t: 'skip', why: 'muted' }); return false; }
      loadClips();
      const items = voiceItems(a, { chime: !sfxOff });
      if (!items.length) return false;
      if (q.length) log({ t: 'replace', dropped: q.length });
      q.length = 0; q.push(...items);
      next();
      return true;
    },
    /** 방을 옮기거나 나갈 때: 전부 멈춤 */
    cancel() {
      const had = !!cur || q.length > 0;
      q.length = 0; cur = null; ++tok;
      if (timer != null) { timers.clear(timer); timer = null; }
      if (src) { try { src.onended = null; src.stop(); } catch { /* noop */ } src = null; }
      if (spoke) { try { synth?.cancel?.(); } catch { /* noop */ } spoke = false; }
      if (had) log({ t: 'cancel' });
    },
    /** 매 프레임: 말하는 중 BGM 음소거(또는 볼륨 0)되면 바로 멈춤 */
    update() { if ((cur || q.length) && level().muted) api.cancel(); },
  };
  return api;
}
