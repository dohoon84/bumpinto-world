// [ride] 버스 하차벨(딩동, WebAudio 합성) · 정류장 안내 방송(speechSynthesis) — 음원 파일 없음.
//   - 음소거: 탑승 HUD 🔊/🔇 버튼(localStorage 'bw.rideVoice') · URL ?rideVoice=0 이면 처음부터 꺼짐
//   - speechSynthesis 가 없거나 음성이 없으면 조용히 생략(자막은 ride 쪽에서 항상 표시)
export const RIDE_VOICE_KEY = 'bw.rideVoice';

// 안내 문구(순수 함수 — 테스트용). cur: 이번 정류장, next: 다음 정류장(없으면 종점)
export function announceText(cur, next, en = false) {
  if (!cur) return '';
  if (en) return next ? `This stop is ${cur}. The next stop is ${next}.` : `This stop is ${cur}, the last stop.`;
  return next ? `이번 정류장은 ${cur}입니다. 다음 정류장은 ${next}입니다.` : `이번 정류장은 종점, ${cur}입니다.`;
}

export function createRideSound({ params = null, storage = null } = {}) {
  const st = storage || (() => { try { return localStorage; } catch { return null; } })();
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
  return {
    get muted() { return muted; },
    get canSpeak() { return !!synth; },
    setMuted(v) { muted = !!v; try { st?.setItem(RIDE_VOICE_KEY, muted ? '0' : '1'); } catch { /* noop */ } if (muted) try { synth?.cancel(); } catch { /* noop */ } },
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
        synth.cancel(); synth.speak(u); return true;
      } catch { return false; }
    },
  };
}
