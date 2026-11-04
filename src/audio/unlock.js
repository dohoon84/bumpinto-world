// [mobile-audio] 공용 소리 잠금 해제 (iOS Safari)
//   - iOS WebKit 은 pointerdown/touchstart 를 오디오용 사용자 입력으로 치지 않는다 → touchend/click(+ 실제 keydown) 핸들러 안에서
//     "동기로" AudioContext 를 만들고/resume 해야 한다. await 뒤·타이머·프레임 루프에서 부른 resume() 은 무시된다.
//   - speechSynthesis 도 첫 speak() 가 사용자 입력 안이어야 이후 (타이머에서 부른) 안내 음성이 나온다 → 첫 탭에서 무음 한 마디로 프라임.
//   - navigator.audioSession.type='playback'(iOS 17+): 기본(ambient)이면 무음 스위치에 묶인다 — BGM 과 같은 설정.
//   - 'interrupted'(전화·잠금·다른 앱) 로 멈춘 컨텍스트도 다음 탭마다 다시 깨우도록 리스너는 계속 둔다(콜백이 상태를 보고 판단).
//   - 모바일 모드에서만 켠다(PC 동작은 그대로).
export const GESTURE_EVENTS = ['touchend', 'click', 'keydown', 'pointerdown'];
// pointerdown 은 iOS 에서 활성화가 아니라서 프라임(첫 speak)을 낭비하지 않는다
const ACTIVATING = new Set(['touchend', 'click', 'keydown']);

export function createAudioUnlock({ target = null, nav = null, synth = null, Utterance = null, prime = true, session = true } = {}) {
  const fns = new Set();
  let primed = false, gestures = 0, sessionSet = false;
  function setSession() {
    if (!session) return;
    try { if (nav?.audioSession && nav.audioSession.type !== 'playback') { nav.audioSession.type = 'playback'; sessionSet = true; } } catch { /* noop */ }
  }
  function primeSpeech() {
    if (!prime || primed || !synth || !Utterance) return;
    try {
      primed = true;
      if (synth.speaking || synth.pending) return; // 이미 말하는 중이면 그 자체로 풀린 상태
      const u = new Utterance(' '); u.volume = 0; u.rate = 2;
      synth.speak(u);
    } catch { /* noop */ }
  }
  function onGesture(e) {
    gestures++;
    setSession();
    for (const f of fns) { try { f(e); } catch { /* noop */ } }
    if (ACTIVATING.has(e?.type)) primeSpeech();
  }
  if (target?.addEventListener) for (const ev of GESTURE_EVENTS) target.addEventListener(ev, onGesture, { capture: true, passive: true });
  return {
    // fn(e): 사용자 입력 핸들러 안에서 동기로 불림 — 컨텍스트 생성·resume 은 여기서
    add(fn) { fns.add(fn); return () => fns.delete(fn); },
    onGesture,
    get primed() { return primed; },
    get gestures() { return gestures; },
    get sessionSet() { return sessionSet; },
    get size() { return fns.size; },
    dispose() { if (target?.removeEventListener) for (const ev of GESTURE_EVENTS) target.removeEventListener(ev, onGesture, { capture: true }); fns.clear(); },
  };
}

let shared = null;
// 페이지 하나에 하나 (ride·subway 가 같이 씀)
export function sharedAudioUnlock() {
  if (shared || typeof window === 'undefined') return shared;
  shared = createAudioUnlock({
    target: window,
    nav: typeof navigator !== 'undefined' ? navigator : null,
    synth: 'speechSynthesis' in window ? window.speechSynthesis : null,
    Utterance: window.SpeechSynthesisUtterance || null,
  });
  return shared;
}

// ogg 는 확실히('probably') 될 때만 — Safari 는 ''/'maybe' 라 m4a(AAC). Chrome·Firefox 는 그대로 ogg
export function pickAudioExt(probe) {
  try {
    const a = probe || new Audio();
    if (a.canPlayType('audio/ogg; codecs="vorbis"') === 'probably') return 'ogg';
    if (a.canPlayType('audio/mp4; codecs="mp4a.40.2"')) return 'm4a';
    return a.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
  } catch { return 'ogg'; }
}
