// [subway-voice] 지하철 안내 방송 음성: 차임(WebAudio 합성, 자체 제작) → 한국어 → 영어 → 일본어 (Web Speech API)
//   - 자막과 같은 문구({ko,en,kind,clip} = ride.js announce) 를 줄 세워 하나씩 — 겹치지 않음
//   - 지금 나오는 방송은 끝까지, 아직 시작 안 한 방송은 새 방송이 오면 최신 것으로 교체 (밀린 방송이 늦게 나오지 않게)
//   - cancel(): 방을 옮기거나(열차·승강장을 떠남) 나갈 때 → 대기열 비우고 말하던 것도 멈춤
//   - ?subwayVoice=0 / ?sound=0 이면 끔 · ?rideSfx=0 이면 차임(효과음)만 끔 · BGM HUD 음소거(🔇)면 무음
//   - 볼륨: BGM 슬라이더를 따르되 바닥을 둠 (loud = 0.45 + 0.55×슬라이더) — 기본 BGM 볼륨(0.55)에서도 또렷하게
//   - 소리 잠금 해제: 첫 클릭·키 입력(BGM 과 같은 사용자 입력)에서 AudioContext 를 만들고 resume
//   - 음성 목록은 비동기로 오기도 함(macOS Chrome) → voiceschanged 를 최대 VOICE_WAIT_MS 기다렸다가 말함
//   - 콘솔에 [subway-voice] 로 무엇을 했는지 남김 (들리지 않을 때 원인 확인용)
//   - speechSynthesis 가 없거나 그 언어 음성이 없으면 그 줄만 조용히 건너뜀(자막은 항상)
//   - [subway-ja] 일본어 줄은 ja 음성이 있을 때만 (목록이 끝내 비어도 lang 만으로 말하지 않음 — 다른 언어 음성이 일본어를 읽지 않게) · ?subwayJa=0 이면 끔
//   - 녹음 교체 훅: public/audio/subway/clips.json 에 ["chime", "approach-wangsimni.ko", ...] 처럼 적고
//     public/audio/subway/<이름>.ogg + .m4a 를 두면 그 줄은 TTS 대신 녹음 재생 (버스 public/audio/bus 와 같은 방식, 첫 방송 때만 목록 받음)
import { pickAudioExt } from '../audio/unlock.js';
export const GESTURE_EVS = ['pointerdown', 'touchend', 'click', 'keydown'];
export const CHIME_KINDS = Object.freeze(['approach', 'next']);
export const CHIME_SEC = 1.5;
export const VOICE_WAIT_MS = 2000;
export const loudness = (v) => (v <= 0 ? 0 : +(0.45 + 0.55 * Math.min(1, v)).toFixed(3));
const LANGS = [['ko', 'ko-KR'], ['en', 'en-US'], ['ja', 'ja-JP']]; // [subway-ja] 한국어 → 영어 → 일본어

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
  target = typeof window !== 'undefined' ? window : null, // 사용자 입력(잠금 해제)을 들을 곳
  unlockHub = null, // [mobile-audio] 공용 잠금 해제(모바일 모드) — 탭 안에서 컨텍스트 깨우기 + speechSynthesis 프라임
  logFn = typeof console !== 'undefined' ? (...a) => console.info('[subway-voice]', ...a) : null,
} = {}) {
  const off = params?.get?.('subwayVoice') === '0' || params?.get?.('sound') === '0';
  const sfxOff = params?.get?.('rideSfx') === '0';
  const jaOff = params?.get?.('subwayJa') === '0';
  const q = [];          // 대기 항목들 (각 항목 .a = 어느 방송인지)
  let cur = null;        // 지금 재생 중인 항목
  let tok = 0, timer = null, src = null, ctx = null, spoke = false;
  const events = [];
  const log = (e) => { events.push(e); if (events.length > 200) events.splice(0, 50); try { logFn?.(e.t, e.why || e.lang || e.clip || '', e.text ? String(e.text).slice(0, 40) : ''); } catch { /* noop */ } for (const f of subs) try { f(e); } catch { /* noop */ } };
  const subs = new Set();
  // 녹음 목록 (없으면 빈 집합 → 전부 TTS)
  let clips = null, clipsP = null;
  const bufs = new Map();
  const ext = typeof Audio !== 'undefined' ? pickAudioExt() : 'ogg'; // [mobile-audio] Safari → m4a
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
  // 첫 사용자 입력에서 소리 잠금 해제 (BGM 이 쓰는 pointerdown 과 같은 입력 + 키) — 지하에 들어갈 때는 보통 W 키라서 keydown 도
  let unlocked = false;
  function unlock() {
    if (off) return;
    const c = ac();
    if (c && c.state !== 'running' && c.state !== 'closed') { try { const r = c.resume(); r?.catch?.(() => {}); } catch { /* noop */ } }
    if (!unlocked) { unlocked = true; log({ t: 'unlock', why: c ? c.state : 'no-audio' }); }
  }
  // [mobile-audio] iOS 는 pointerdown 으로는 resume 이 안 됨 → touchend/click 도 (PC 는 pointerdown 에서 이미 running 이라 그대로)
  const onGesture = () => unlock();
  if (!off && target?.addEventListener) for (const ev of GESTURE_EVS) target.addEventListener(ev, onGesture, { capture: true, passive: true });
  const offHub = !off ? unlockHub?.add?.(onGesture) || null : null;
  // 음성 목록: 비동기로 채워지면 기다리던 줄을 이어서
  let voicesReady = false, voicesGaveUp = false, waitTimer = null, waiting = false;
  // 기다리던 줄(cur)을 다시 맨 앞에 두고 이어서 — 목록이 끝내 비어 있으면 lang 만으로 말함(브라우저 기본 음성)
  function resumeWait() { if (!waiting) return; waiting = false; if (waitTimer != null) { timers.clear(waitTimer); waitTimer = null; } const it = cur; cur = null; if (it) q.unshift(it); next(); }
  const onVoices = () => { voicesReady = voices().length > 0; log({ t: 'voices', why: String(voices().length) }); resumeWait(); };
  try { synth?.addEventListener?.('voiceschanged', onVoices); } catch { /* noop */ }
  const level = () => { const l = getLevel?.() || {}; const v = Math.min(1, Math.max(0, Number(l.volume ?? 1))); return { muted: !!l.muted || v <= 0, volume: loudness(v), slider: v }; };
  const voices = () => { try { return synth?.getVoices?.() || []; } catch { return []; } };
  const voiceFor = (k) => voices().find((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith(k)) || null;
  try { voicesReady = (synth?.getVoices?.() || []).length > 0; } catch { /* 일부 브라우저는 첫 호출 뒤에 목록을 채움 */ }
  let curU = null; // 말하는 Utterance 를 잡아 둠 (Chrome 은 참조가 없으면 GC 돼 onend 가 안 옴)

  function finish(my) { if (my !== tok) return; if (timer != null) { timers.clear(timer); timer = null; } src = null; cur = null; next(); }
  function next() {
    if (cur) return;
    const it = q.shift(); if (!it) return;
    const lv = level();
    if (lv.muted) { q.length = 0; log({ t: 'skip', why: 'muted' }); return; }
    unlock();
    cur = it; const my = ++tok;
    if (it.clip && clips?.has(it.clip) && playClip(it, lv, my)) return;
    if (it.t === 'chime') {
      const c = ac();
      if (!c) { log({ t: 'skip', why: 'no-audio', clip: 'chime' }); cur = null; return next(); }
      try { if (c.state !== 'running' && c.state !== 'closed') c.resume()?.catch?.(() => {}); synthChime(c, 0.22 * lv.volume); log({ t: 'chime', gain: +(0.22 * lv.volume).toFixed(3), why: c.state }); } catch { /* noop */ }
      timer = timers.set(() => { timer = null; finish(my); }, CHIME_SEC * 1000);
      return;
    }
    if (synth && Utterance && !voicesReady && !voicesGaveUp && !voices().length && !it.waited) {
      // 음성 목록이 아직 안 옴 → voiceschanged 를 잠깐 기다림 (그 사이 cur 를 잡아 둬 순서 유지)
      it.waited = true; waiting = true; log({ t: 'wait-voices' });
      waitTimer = timers.set(() => { waitTimer = null; voicesGaveUp = true; if (my === tok) resumeWait(); }, VOICE_WAIT_MS);
      return;
    }
    const v = voiceFor(it.k), langOnly = !v && it.k !== 'ja' && voicesGaveUp && !voices().length; // 기다려도 목록이 비면 lang 만으로 (일본어는 ja 음성이 있어야)
    if (!synth || !Utterance || (!v && !langOnly)) { log({ t: 'skip', why: !synth || !Utterance ? 'no-tts' : 'no-voice', lang: it.lang }); cur = null; return next(); }
    try {
      const u = new Utterance(it.text);
      u.lang = it.lang; if (v) try { u.voice = v; } catch { /* lang 만으로 */ } u.rate = it.k === 'ko' ? 1.02 : it.k === 'ja' ? 1.0 : 0.98; u.volume = lv.volume;
      u.onend = () => { curU = null; finish(my); }; u.onerror = (e) => { curU = null; log({ t: 'tts-error', why: e?.error || 'error', lang: it.lang }); finish(my); };
      curU = u; spoke = true; synth.speak(u);
      log({ t: 'speak', lang: it.lang, text: it.text, volume: +lv.volume.toFixed(2) });
      // onend 가 안 오는 브라우저 대비 안전 타이머 (글자 수 기준 넉넉히)
      timer = timers.set(() => { timer = null; log({ t: 'timeout', lang: it.lang }); finish(my); }, Math.round((3 + it.text.length * (it.k === 'en' ? 0.09 : 0.2)) * 1000));
    } catch { log({ t: 'skip', why: 'error', lang: it.lang }); cur = null; next(); }
  }
  // 녹음 재생 (받아 둔 버퍼가 없으면 받아서 — 실패하면 그 줄은 TTS 로)
  function playClip(it, lv, my) {
    const c = ac(); if (!c || !fetchFn) return false;
    const go = (buf) => {
      if (my !== tok) return;
      try {
        if (c.state !== 'running' && c.state !== 'closed') c.resume()?.catch?.(() => {});
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
    get unlocked() { return unlocked; },
    get hubWired() { return !!offHub; },
    /** 이벤트 구독 (🔊 표시용) — 해제 함수 반환 */
    on(f) { subs.add(f); return () => subs.delete(f); },
    unlock,
    /** 리스너 정리 */
    dispose() { api.cancel(); if (target?.removeEventListener) for (const ev of GESTURE_EVS) target.removeEventListener(ev, onGesture, { capture: true }); offHub?.(); try { synth?.removeEventListener?.('voiceschanged', onVoices); } catch { /* noop */ } subs.clear(); },
    get events() { return events; },
    /** 안내 방송 하나 (자막과 같은 {ko,en,kind,clip}). 대기 중인 이전 방송은 이것으로 교체 */
    play(a) {
      if (off || !a?.ko) return false;
      if (level().muted) { log({ t: 'skip', why: 'muted' }); return false; }
      loadClips();
      const items = voiceItems(jaOff && a.ja ? { ...a, ja: '' } : a, { chime: !sfxOff });
      if (!items.length) return false;
      if (q.length) log({ t: 'replace', dropped: q.length });
      q.length = 0; q.push(...items);
      next();
      return true;
    },
    /** 방을 옮기거나 나갈 때: 전부 멈춤 */
    cancel() {
      const had = !!cur || q.length > 0;
      curU = null; // 늦게 오는 onend 는 tok 로 무시
      q.length = 0; cur = null; ++tok; waiting = false;
      if (timer != null) { timers.clear(timer); timer = null; }
      if (waitTimer != null) { timers.clear(waitTimer); waitTimer = null; }
      if (src) { try { src.onended = null; src.stop(); } catch { /* noop */ } src = null; }
      if (spoke) { try { synth?.cancel?.(); } catch { /* noop */ } spoke = false; }
      if (had) log({ t: 'cancel' });
    },
    /** 매 프레임: 말하는 중 BGM 음소거(또는 볼륨 0)되면 바로 멈춤 */
    update() { if ((cur || q.length) && level().muted) api.cancel(); },
  };
  return api;
}
